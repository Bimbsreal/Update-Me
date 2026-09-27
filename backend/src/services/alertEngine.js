/**
 * Alert evaluation helpers — cooldowns, quiet hours, severity escalation, rate limits.
 * Does not send notifications itself; used by notificationService pipeline.
 */
import {
  DEFAULT_COOLDOWN_MINUTES,
  PER_USER_HOURLY_LIMIT,
} from '../config/notifications.js';
import { getPool } from '../db/pool.js';

const PRIORITY_RANK = {
  low: 0,
  normal: 1,
  important: 2,
  urgent: 3,
  critical: 4,
};

export function priorityRank(priority) {
  return PRIORITY_RANK[priority] ?? 1;
}

/** Material severity escalation: newRank > priorRank */
export function isSeverityEscalation(previousPriority, nextPriority) {
  return priorityRank(nextPriority) > priorityRank(previousPriority);
}

/**
 * Quiet hours in user local timezone.
 * quietStartMinute / quietEndMinute are minutes from local midnight.
 * Supports overnight windows (e.g. 22:00–06:00).
 */
export function isInQuietHours({
  now = new Date(),
  timezone = 'Africa/Lagos',
  quietHoursEnabled = false,
  quietStartMinute = null,
  quietEndMinute = null,
  priority = 'normal',
  criticalOverridesQuiet = true,
} = {}) {
  if (!quietHoursEnabled) return false;
  if (criticalOverridesQuiet && (priority === 'critical' || priority === 'urgent')) {
    return false;
  }
  if (quietStartMinute == null || quietEndMinute == null) return false;

  let localMinutes = 0;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || 'Africa/Lagos',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    localMinutes = hour * 60 + minute;
  } catch {
    localMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  }

  const start = Number(quietStartMinute);
  const end = Number(quietEndMinute);
  if (start === end) return true;
  if (start < end) return localMinutes >= start && localMinutes < end;
  return localMinutes >= start || localMinutes < end;
}

export function fingerprintForEvent({
  category,
  relatedEntityType,
  relatedEntityId,
  subscriptionId = null,
  extra = '',
}) {
  return [
    category || 'any',
    relatedEntityType || 'entity',
    relatedEntityId || 'none',
    subscriptionId || 'nosub',
    extra || '',
  ]
    .join(':')
    .slice(0, 240);
}

export const alertEngine = {
  async getRule(code) {
    const result = await getPool().query(
      `SELECT * FROM notification_alert_rules WHERE code = $1`,
      [code]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      category: row.category,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      priority: row.priority,
      cooldownMinutes: row.cooldown_minutes,
      ttlHours: row.ttl_hours,
      minSeverity: row.min_severity,
      eligibleChannels: row.eligible_channels || ['in_app'],
      conditions: row.conditions || {},
      templateKey: row.template_key,
    };
  },

  async listRules({ category = null, enabledOnly = false } = {}) {
    const result = await getPool().query(
      `SELECT * FROM notification_alert_rules
       WHERE ($1::notification_category IS NULL OR category = $1)
         AND ($2::boolean IS FALSE OR enabled = TRUE)
       ORDER BY category, name`,
      [category, enabledOnly]
    );
    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      category: row.category,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      priority: row.priority,
      cooldownMinutes: row.cooldown_minutes,
      ttlHours: row.ttl_hours,
      minSeverity: row.min_severity,
      eligibleChannels: row.eligible_channels || ['in_app'],
      conditions: row.conditions || {},
      templateKey: row.template_key,
      updatedAt: row.updated_at,
    }));
  },

  async upsertRule(input, adminUserId = null) {
    const result = await getPool().query(
      `INSERT INTO notification_alert_rules (
         code, category, name, description, enabled, priority,
         cooldown_minutes, ttl_hours, min_severity, eligible_channels,
         conditions, template_key, created_by, updated_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11::jsonb,$12,$13,$13
       )
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         enabled = EXCLUDED.enabled,
         priority = EXCLUDED.priority,
         cooldown_minutes = EXCLUDED.cooldown_minutes,
         ttl_hours = EXCLUDED.ttl_hours,
         min_severity = EXCLUDED.min_severity,
         eligible_channels = EXCLUDED.eligible_channels,
         conditions = EXCLUDED.conditions,
         template_key = EXCLUDED.template_key,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING code`,
      [
        input.code,
        input.category,
        input.name,
        input.description || null,
        input.enabled !== false,
        input.priority || 'normal',
        input.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES[input.category] ?? 30,
        input.ttlHours ?? 24,
        input.minSeverity || null,
        input.eligibleChannels || ['in_app'],
        JSON.stringify(input.conditions || {}),
        input.templateKey || null,
        adminUserId,
      ]
    );
    return this.getRule(result.rows[0].code);
  },

  async checkCooldown({ userId, fingerprint, category, priority }) {
    const pool = getPool();
    const existing = await pool.query(
      `SELECT last_priority, suppress_until, last_sent_at
       FROM notification_cooldowns
       WHERE user_id = $1 AND fingerprint = $2`,
      [userId, fingerprint]
    );
    const row = existing.rows[0];
    if (!row) return { allowed: true, reason: 'no_prior' };

    const until = new Date(row.suppress_until).getTime();
    if (Date.now() < until) {
      if (isSeverityEscalation(row.last_priority, priority)) {
        return { allowed: true, reason: 'severity_escalation', previousPriority: row.last_priority };
      }
      return {
        allowed: false,
        reason: 'cooldown',
        suppressUntil: row.suppress_until,
        previousPriority: row.last_priority,
      };
    }
    return { allowed: true, reason: 'cooldown_elapsed', category };
  },

  async recordCooldown({ userId, fingerprint, category, priority, cooldownMinutes }) {
    const minutes = Math.max(0, Number(cooldownMinutes) || 0);
    const suppressUntil = new Date(Date.now() + minutes * 60 * 1000);
    await getPool().query(
      `INSERT INTO notification_cooldowns (
         user_id, fingerprint, category, last_priority, last_sent_at, suppress_until
       ) VALUES ($1,$2,$3,$4,NOW(),$5)
       ON CONFLICT (user_id, fingerprint) DO UPDATE SET
         last_priority = EXCLUDED.last_priority,
         last_sent_at = NOW(),
         suppress_until = EXCLUDED.suppress_until,
         category = EXCLUDED.category`,
      [userId, fingerprint, category, priority || 'normal', suppressUntil.toISOString()]
    );
  },

  async withinUserHourlyLimit(userId) {
    const result = await getPool().query(
      `SELECT COUNT(*)::int AS c FROM notifications
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
      [userId]
    );
    return (result.rows[0]?.c || 0) < PER_USER_HOURLY_LIMIT;
  },

  async recordDelivery({
    notificationId = null,
    userId,
    channel,
    status,
    attempt = 1,
    errorCode = null,
    errorMessage = null,
    providerRef = null,
  }) {
    await getPool().query(
      `INSERT INTO notification_deliveries (
         notification_id, user_id, channel, status, attempt,
         error_code, error_message, provider_ref
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        notificationId,
        userId,
        channel,
        status,
        attempt,
        errorCode,
        errorMessage ? String(errorMessage).slice(0, 500) : null,
        providerRef,
      ]
    );
  },
};
