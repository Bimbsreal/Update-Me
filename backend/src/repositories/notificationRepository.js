import { getPool } from '../db/pool.js';
import { categoryLabel, priorityLabel } from '../config/notifications.js';

function mapNotification(row) {
  if (!row) return null;
  const expired =
    row.status === 'expired' ||
    (row.expires_at != null && new Date(row.expires_at).getTime() <= Date.now());
  return {
    id: row.id,
    channel: row.channel,
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    type: row.type,
    title: row.title,
    message: row.message || null,
    priority: row.priority,
    priorityLabel: priorityLabel(row.priority),
    status: row.status || 'delivered',
    relatedEntityType: row.related_entity_type || null,
    relatedEntityId: row.related_entity_id || null,
    linkPath: row.link_path || null,
    sourceRef: row.source_ref || null,
    templateKey: row.template_key || null,
    location: row.location_id
      ? {
          id: row.location_id,
          name: row.location_name || null,
          type: row.location_type || null,
        }
      : null,
    read: Boolean(row.read_at),
    readAt: row.read_at,
    deliveredAt: row.delivered_at || null,
    archivedAt: row.archived_at || null,
    expiresAt: row.expires_at,
    expired,
    createdAt: row.created_at,
  };
}

function mapPreference(row) {
  return {
    category: row.category,
    enabled: row.enabled,
    frequency: row.frequency || 'immediate',
    channels: row.channels || ['in_app'],
    quietHoursEnabled: Boolean(row.quiet_hours_enabled),
    quietStartMinute: row.quiet_start_minute,
    quietEndMinute: row.quiet_end_minute,
    timezone: row.timezone || 'Africa/Lagos',
    criticalOverridesQuiet: row.critical_overrides_quiet !== false,
  };
}

export const notificationRepository = {
  mapNotification,

  async list(userId, query) {
    const conditions = [`n.user_id = $1`, `n.archived_at IS NULL`];
    const params = [userId];
    let i = 2;

    if (query.status === 'unread') conditions.push(`n.read_at IS NULL`);
    if (query.status === 'read') conditions.push(`n.read_at IS NOT NULL`);
    if (query.category) {
      conditions.push(`n.category = $${i++}`);
      params.push(query.category);
    }
    if (!query.includeExpired) {
      conditions.push(
        `(n.expires_at IS NULL OR n.expires_at > NOW()) AND n.status IS DISTINCT FROM 'expired'`
      );
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const page = query.page || 1;
    const limit = query.limit || 20;
    const offset = (page - 1) * limit;

    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM notifications n ${where}`,
      params
    );
    const list = await getPool().query(
      `SELECT n.*,
              loc.name AS location_name,
              loc.type AS location_type
       FROM notifications n
       LEFT JOIN locations loc ON loc.id = n.location_id
       ${where}
       ORDER BY
         CASE WHEN n.read_at IS NULL THEN 0 ELSE 1 END,
         CASE n.priority
           WHEN 'critical' THEN 0
           WHEN 'urgent' THEN 1
           WHEN 'important' THEN 2
           WHEN 'normal' THEN 3
           ELSE 4
         END,
         n.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );

    const unread = await getPool().query(
      `SELECT COUNT(*)::int AS count FROM notifications
       WHERE user_id = $1
         AND read_at IS NULL
         AND archived_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
         AND status IS DISTINCT FROM 'expired'`,
      [userId]
    );

    return {
      items: list.rows.map(mapNotification),
      page,
      limit,
      total: count.rows[0].total,
      unreadCount: unread.rows[0].count,
      asOf: new Date().toISOString(),
    };
  },

  async findById(userId, id) {
    const result = await getPool().query(
      `SELECT n.*,
              loc.name AS location_name,
              loc.type AS location_type
       FROM notifications n
       LEFT JOIN locations loc ON loc.id = n.location_id
       WHERE n.id = $1 AND n.user_id = $2`,
      [id, userId]
    );
    return mapNotification(result.rows[0]);
  },

  async create(input) {
    try {
      const result = await getPool().query(
        `INSERT INTO notifications (
           user_id, channel, category, type, title, message, priority,
           related_entity_type, related_entity_id, location_id, link_path,
           dedupe_key, expires_at, status, delivered_at, source_ref, template_key, metadata
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),$15,$16,$17::jsonb
         )
         RETURNING id`,
        [
          input.userId,
          input.channel || 'in_app',
          input.category,
          input.type,
          input.title,
          input.message || null,
          input.priority || 'normal',
          input.relatedEntityType || null,
          input.relatedEntityId || null,
          input.locationId || null,
          input.linkPath || null,
          input.dedupeKey,
          input.expiresAt || null,
          input.status || 'delivered',
          input.sourceRef || null,
          input.templateKey || null,
          JSON.stringify(input.metadata || {}),
        ]
      );
      return this.findById(input.userId, result.rows[0].id);
    } catch (error) {
      if (error.code === '23505') {
        return { duplicate: true };
      }
      throw error;
    }
  },

  async markRead(userId, id) {
    const result = await getPool().query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW()),
           status = CASE WHEN status = 'delivered' THEN 'read' ELSE status END
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );
    if (!result.rows[0]) return null;
    return this.findById(userId, id);
  },

  async markAllRead(userId) {
    const result = await getPool().query(
      `UPDATE notifications
       SET read_at = NOW(),
           status = CASE WHEN status = 'delivered' THEN 'read' ELSE status END
       WHERE user_id = $1
         AND read_at IS NULL
         AND archived_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING id`,
      [userId]
    );
    return result.rowCount;
  },

  async archive(userId, id) {
    const result = await getPool().query(
      `UPDATE notifications
       SET archived_at = NOW(), status = 'archived'
       WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
       RETURNING id`,
      [id, userId]
    );
    return Boolean(result.rows[0]);
  },

  async expireDue() {
    const result = await getPool().query(
      `UPDATE notifications
       SET status = 'expired'
       WHERE status IS DISTINCT FROM 'expired'
         AND status IS DISTINCT FROM 'archived'
         AND expires_at IS NOT NULL
         AND expires_at <= NOW()
       RETURNING id`
    );
    return result.rowCount || 0;
  },

  async unreadCount(userId) {
    const result = await getPool().query(
      `SELECT COUNT(*)::int AS count FROM notifications
       WHERE user_id = $1
         AND read_at IS NULL
         AND archived_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
         AND status IS DISTINCT FROM 'expired'`,
      [userId]
    );
    return result.rows[0].count;
  },

  async getPreferences(userId) {
    const result = await getPool().query(
      `SELECT category, enabled, frequency, channels, quiet_hours_enabled,
              quiet_start_minute, quiet_end_minute, timezone, critical_overrides_quiet
       FROM user_notification_preferences WHERE user_id = $1`,
      [userId]
    );
    return result.rows.map(mapPreference);
  },

  async getPreference(userId, category) {
    const result = await getPool().query(
      `SELECT category, enabled, frequency, channels, quiet_hours_enabled,
              quiet_start_minute, quiet_end_minute, timezone, critical_overrides_quiet
       FROM user_notification_preferences
       WHERE user_id = $1 AND category = $2`,
      [userId, category]
    );
    return result.rows[0] ? mapPreference(result.rows[0]) : null;
  },

  async upsertPreference(userId, item) {
    // Ensure row exists with defaults first
    await getPool().query(
      `INSERT INTO user_notification_preferences (user_id, category, enabled)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, category) DO NOTHING`,
      [userId, item.category, item.enabled ?? false]
    );

    const sets = ['updated_at = NOW()'];
    const params = [userId, item.category];
    let i = 3;

    if (item.enabled !== undefined) {
      sets.push(`enabled = $${i++}`);
      params.push(item.enabled);
    }
    if (item.frequency !== undefined) {
      sets.push(`frequency = $${i++}::notification_frequency`);
      params.push(item.frequency);
    }
    if (item.channels !== undefined) {
      sets.push(`channels = $${i++}::text[]`);
      params.push(item.channels);
    }
    if (item.quietHoursEnabled !== undefined) {
      sets.push(`quiet_hours_enabled = $${i++}`);
      params.push(item.quietHoursEnabled);
    }
    if (item.quietStartMinute !== undefined) {
      sets.push(`quiet_start_minute = $${i++}`);
      params.push(item.quietStartMinute);
    }
    if (item.quietEndMinute !== undefined) {
      sets.push(`quiet_end_minute = $${i++}`);
      params.push(item.quietEndMinute);
    }
    if (item.timezone !== undefined) {
      sets.push(`timezone = $${i++}`);
      params.push(item.timezone);
    }
    if (item.criticalOverridesQuiet !== undefined) {
      sets.push(`critical_overrides_quiet = $${i++}`);
      params.push(item.criticalOverridesQuiet);
    }

    await getPool().query(
      `UPDATE user_notification_preferences
       SET ${sets.join(', ')}
       WHERE user_id = $1 AND category = $2`,
      params
    );
  },

  async ensureDefaultPreferences(userId, defaults) {
    for (const item of defaults) {
      await getPool().query(
        `INSERT INTO user_notification_preferences (user_id, category, enabled)
         VALUES ($1,$2,$3)
         ON CONFLICT (user_id, category) DO NOTHING`,
        [userId, item.code, item.defaultEnabled]
      );
    }
  },

  async adminMetrics() {
    const pool = getPool();
    const [counts, deliveries, push, rules, subs] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS generated,
           COUNT(*) FILTER (WHERE read_at IS NULL AND archived_at IS NULL)::int AS unread,
           COUNT(*) FILTER (WHERE read_at IS NOT NULL)::int AS read,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
           COUNT(*) FILTER (WHERE status = 'delivered' OR delivered_at IS NOT NULL)::int AS delivered,
           COUNT(*) FILTER (
             WHERE archived_at IS NULL
               AND (expires_at IS NULL OR expires_at > NOW())
               AND status IS DISTINCT FROM 'expired'
           )::int AS active
         FROM notifications
         WHERE created_at > NOW() - INTERVAL '7 days'`
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS attempts,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
           COUNT(*) FILTER (WHERE status = 'suppressed')::int AS suppressed,
           COUNT(*) FILTER (WHERE channel = 'email')::int AS email,
           COUNT(*) FILTER (WHERE channel = 'push')::int AS push
         FROM notification_deliveries
         WHERE created_at > NOW() - INTERVAL '7 days'`
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE is_active)::int AS active,
                COUNT(*)::int AS total
         FROM push_subscriptions`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE enabled)::int AS enabled
         FROM notification_alert_rules`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE enabled)::int AS enabled
         FROM user_alert_subscriptions`
      ),
    ]);
    return {
      windowDays: 7,
      notifications: counts.rows[0],
      deliveries: deliveries.rows[0],
      pushSubscriptions: push.rows[0],
      alertRules: rules.rows[0],
      userAlertSubscriptions: subs.rows[0],
      asOf: new Date().toISOString(),
    };
  },
};
