/**
 * Quality Intelligence — explainable dimensions, events, anomalies, domain dashboards.
 * Complements dataQualityService. Never invents an opaque trust/truth score.
 */
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import {
  buildAboutLines,
  buildQualityMetadata,
  computeFreshnessState,
  getPolicyForCategory,
  verificationFromRow,
} from './dataQualityService.js';

const REVIEW_PRIORITY = {
  conflict_detected: 95,
  anomaly_detected: 80,
  source_failure: 75,
  duplicate_detected: 60,
  correction_submitted: 70,
  validation_failed: 65,
  stale: 40,
  expired: 30,
  verification_completed: 10,
  review_opened: 55,
  review_resolved: 5,
  merge_completed: 15,
};

function dim(status, detail) {
  return { status, detail };
}

/**
 * Contextual confidence — low/medium/high with explicit reasons.
 * Not absolute truth.
 */
export function computeConfidenceWithReasons(row = {}, quality = null, policy = {}) {
  const q = quality || buildQualityMetadata(row, policy);
  const reasons = [];
  let score = 0;

  if (q.source?.type === 'official') {
    score += 40;
    reasons.push('Approved official source');
  } else if (q.source?.type === 'aggregated') {
    score += 15;
    reasons.push('Aggregated source');
  } else {
    reasons.push('Community-reported');
  }

  if (q.verification?.state === 'official') {
    score += 20;
    reasons.push('Official verification state');
  } else if (q.verification?.state === 'confirmed') {
    score += 15;
    reasons.push('Community confirmed (not official)');
  } else if (q.verification?.state === 'under_review') {
    score -= 10;
    reasons.push('Currently under review');
  } else {
    reasons.push('Not officially verified');
  }

  const fresh = q.freshness?.state;
  if (fresh === 'fresh') {
    score += 25;
    reasons.push('Within fresh window for this category');
  } else if (fresh === 'recent') {
    score += 15;
    reasons.push('Recent observation');
  } else if (fresh === 'aging') {
    score += 5;
    reasons.push('Aging — still within useful window');
  } else if (fresh === 'stale') {
    score -= 15;
    reasons.push('Marked stale');
  } else if (fresh === 'expired') {
    score -= 40;
    reasons.push('Expired — not treated as current');
  }

  const corr = Number(q.corroboration?.count || 0);
  if (corr >= 3) {
    score += 20;
    reasons.push('3+ independent corroborating reports');
  } else if (corr === 2) {
    score += 10;
    reasons.push('2 independent corroborating reports');
  }

  if (!row.location_id && !row.locationId) {
    score -= 10;
    reasons.push('Missing location context');
  }

  let level = 'low';
  if (score >= 55) level = 'high';
  else if (score >= 30) level = 'medium';

  return {
    level,
    label: level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low',
    reasons,
    note: 'Confidence is contextual and explainable — not absolute truth.',
  };
}

/**
 * Multi-dimension evaluation — never collapsed into one unexplained number.
 */
export function evaluateQualityDimensions(row = {}, policy = {}) {
  const quality = buildQualityMetadata(row, policy);
  const hasLoc = Boolean(row.location_id || row.locationId || row.location);
  const hasTitle = Boolean(String(row.title || '').trim());
  const hasTime = Boolean(
    row.occurred_at || row.occurredAt || row.created_at || row.createdAt || row.last_confirmed_at
  );
  const corr = Number(quality.corroboration?.count || 0);

  return {
    completeness: dim(
      hasTitle && hasLoc && hasTime ? 'pass' : hasTitle || hasLoc ? 'warn' : 'fail',
      [
        hasTitle ? null : 'Missing title',
        hasLoc ? null : 'Missing location',
        hasTime ? null : 'Missing observation time',
      ]
        .filter(Boolean)
        .join('; ') || 'Required fields present'
    ),
    freshness: dim(
      ['fresh', 'recent'].includes(quality.freshness?.state)
        ? 'pass'
        : quality.freshness?.state === 'aging'
          ? 'warn'
          : 'fail',
      `State: ${quality.freshness?.state || 'unknown'} (${quality.freshness?.label || 'n/a'})`
    ),
    validity: dim(
      row.status === 'removed' || row.status === 'flagged' ? 'warn' : 'pass',
      `Lifecycle status: ${row.status || 'unknown'}`
    ),
    consistency: dim('pass', 'No silent winner selection — conflicts surface when present'),
    uniqueness: dim(
      row.event_group_id || row.eventGroupId ? 'warn' : 'pass',
      row.event_group_id || row.eventGroupId
        ? 'Linked to an event group (possible related/duplicate cluster)'
        : 'No event-group link'
    ),
    provenance: dim(
      quality.source?.type === 'official' ? 'pass' : 'warn',
      `Source: ${quality.source?.label || 'unknown'}`
    ),
    corroboration: dim(
      corr >= 2 ? 'pass' : 'warn',
      quality.corroboration?.label || '1 report'
    ),
    geographicAccuracy: dim(
      hasLoc ? 'pass' : 'fail',
      hasLoc ? 'Location associated' : 'No location — geographic accuracy unknown'
    ),
    sourceReliability: dim(
      quality.source?.type === 'official' ? 'pass' : 'warn',
      'Historical source reliability is contextual — not proof of future correctness'
    ),
  };
}

export const qualityIntelligenceService = {
  computeConfidenceWithReasons,
  evaluateQualityDimensions,

  enrichQuality(row, policy = {}) {
    const quality = buildQualityMetadata(row, policy);
    const confidence = computeConfidenceWithReasons(row, quality, policy);
    const dimensions = evaluateQualityDimensions(row, policy);
    return {
      ...quality,
      confidence,
      dimensions,
      about: buildAboutLines({ ...quality, confidence }),
    };
  },

  async recordEvent(input) {
    const pool = getPool();
    const eventType = input.eventType;
    const priority =
      input.priority != null
        ? Number(input.priority)
        : REVIEW_PRIORITY[eventType] || 50;
    const result = await pool.query(
      `INSERT INTO quality_events (
         event_type, severity, status, domain, entity_type, entity_id,
         location_id, title, explanation, reasons, metadata, priority
       ) VALUES (
         $1::quality_event_type, $2::quality_event_severity, COALESCE($3::quality_event_status, 'open'),
         $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12
       )
       RETURNING *`,
      [
        eventType,
        input.severity || 'medium',
        input.status || 'open',
        String(input.domain || 'all').slice(0, 40),
        String(input.entityType || 'report').slice(0, 64),
        input.entityId || null,
        input.locationId || null,
        String(input.title || 'Quality event').slice(0, 200),
        String(input.explanation || 'See reasons.').slice(0, 1000),
        JSON.stringify(input.reasons || []),
        JSON.stringify(input.metadata || {}),
        Math.min(100, Math.max(1, priority)),
      ]
    );
    return mapEvent(result.rows[0]);
  },

  async listEvents({
    domain = null,
    status = 'open',
    eventType = null,
    limit = 40,
    offset = 0,
  } = {}) {
    const pool = getPool();
    const params = [];
    const where = [];
    if (status && status !== 'all') {
      params.push(status);
      where.push(`status = $${params.length}::quality_event_status`);
    }
    if (domain) {
      params.push(domain);
      where.push(`domain = $${params.length}`);
    }
    if (eventType) {
      params.push(eventType);
      where.push(`event_type = $${params.length}::quality_event_type`);
    }
    params.push(Math.min(Math.max(Number(limit) || 40, 1), 100));
    params.push(Math.max(Number(offset) || 0, 0));
    const result = await pool.query(
      `SELECT * FROM quality_events
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY priority DESC, created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { items: result.rows.map(mapEvent) };
  },

  async reviewQueue({ limit = 40 } = {}) {
    const events = await this.listEvents({ status: 'open', limit });
    const pool = getPool();
    const [flags, conflicts] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS c FROM report_flags WHERE status = 'open'`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM reports r
         WHERE r.moderation_state IN ('flagged','queued','escalated')`
      ),
    ]);
    return {
      items: events.items.map((e) => ({
        ...e,
        reviewPriority: e.priority,
        reason: e.explanation,
        ageMinutes: Math.floor((Date.now() - new Date(e.createdAt).getTime()) / 60000),
      })),
      openFlags: Number(flags.rows[0]?.c) || 0,
      moderationBacklog: Number(conflicts.rows[0]?.c) || 0,
      note: 'Critical conflicts and anomalies rank above routine stale items. No opaque person ranking.',
    };
  },

  async resolveEvent(admin, id, { action, note }, req) {
    const pool = getPool();
    const existing = await pool.query(`SELECT * FROM quality_events WHERE id = $1`, [id]);
    if (!existing.rows[0]) throw new AppError('Quality event not found.', 404, 'NOT_FOUND');
    const status =
      action === 'dismiss' ? 'dismissed' : action === 'acknowledge' ? 'acknowledged' : 'resolved';
    const reason = String(note || '').trim();
    if (reason.length < 3) {
      throw new AppError('A reason/note is required.', 400, 'VALIDATION_ERROR');
    }
    const result = await pool.query(
      `UPDATE quality_events
       SET status = $2::quality_event_status,
           resolved_by = $3,
           resolved_at = NOW(),
           resolution_note = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, admin?.userId || admin?.id || null, reason.slice(0, 500)]
    );
    try {
      await adminAuditRepository.create({
        actorUserId: admin.userId || admin.id,
        action: `quality.event.${status}`,
        entityType: 'quality_event',
        entityId: id,
        previousState: { status: existing.rows[0].status },
        newState: { status },
        reason,
        ipAddress: req?.ip || null,
        userAgent: req?.get?.('user-agent') || null,
      });
    } catch {
      /* ignore */
    }
    return mapEvent(result.rows[0]);
  },

  async listRules({ domain = null } = {}) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM quality_validation_rules
       WHERE ($1::text IS NULL OR domain = $1 OR domain = 'all')
       ORDER BY domain, name`,
      [domain]
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        code: r.code,
        domain: r.domain,
        name: r.name,
        description: r.description,
        enabled: r.enabled,
        severity: r.severity,
        ruleKind: r.rule_kind,
        config: r.config || {},
        updatedAt: r.updated_at,
      })),
    };
  },

  async updateRule(admin, code, body, req) {
    const pool = getPool();
    const existing = await pool.query(`SELECT * FROM quality_validation_rules WHERE code = $1`, [
      code,
    ]);
    if (!existing.rows[0]) throw new AppError('Validation rule not found.', 404, 'NOT_FOUND');
    const reason = String(body.reason || '').trim();
    if (reason.length < 3) throw new AppError('A reason is required.', 400, 'VALIDATION_ERROR');
    const result = await pool.query(
      `UPDATE quality_validation_rules
       SET enabled = COALESCE($2, enabled),
           severity = COALESCE($3::quality_event_severity, severity),
           config = COALESCE($4::jsonb, config),
           description = COALESCE($5, description),
           updated_by = $6,
           updated_at = NOW()
       WHERE code = $1
       RETURNING *`,
      [
        code,
        body.enabled == null ? null : Boolean(body.enabled),
        body.severity || null,
        body.config ? JSON.stringify(body.config) : null,
        body.description != null ? String(body.description).slice(0, 500) : null,
        admin?.userId || admin?.id || null,
      ]
    );
    try {
      await adminAuditRepository.create({
        actorUserId: admin.userId || admin.id,
        action: 'quality.rule.update',
        entityType: 'quality_validation_rule',
        entityId: code,
        previousState: {
          enabled: existing.rows[0].enabled,
          severity: existing.rows[0].severity,
        },
        newState: {
          enabled: result.rows[0].enabled,
          severity: result.rows[0].severity,
        },
        reason,
        ipAddress: req?.ip || null,
        userAgent: req?.get?.('user-agent') || null,
      });
    } catch {
      /* ignore */
    }
    return (await this.listRules()).items.find((i) => i.code === code);
  },

  /**
   * Rule-based anomaly scan — flags for review, never auto-classifies as false.
   */
  async scanAnomalies({ limit = 30 } = {}) {
    const pool = getPool();
    const created = [];

    // Impossible / extreme fuel prices (flag only)
    const fuel = await pool.query(
      `SELECT r.id, r.title, r.location_id, fr.price_amount, fr.fuel_type::text AS fuel_type
       FROM reports r
       JOIN fuel_reports fr ON fr.report_id = r.id
       WHERE r.status IN ('submitted','active','confirmed')
         AND fr.price_amount IS NOT NULL
         AND (fr.price_amount <= 0 OR fr.price_amount > 5000 OR fr.price_amount < 100)
       ORDER BY r.created_at DESC
       LIMIT 15`
    );
    for (const row of fuel.rows) {
      const explanation =
        row.price_amount <= 0
          ? `Fuel price ${row.price_amount} is not positive.`
          : `Fuel price ₦${row.price_amount} is outside the broad plausible band for review.`;
      const ev = await this.recordEvent({
        eventType: 'anomaly_detected',
        severity: row.price_amount <= 0 ? 'high' : 'medium',
        domain: 'fuel',
        entityType: 'report',
        entityId: row.id,
        locationId: row.location_id,
        title: `Fuel price anomaly — ${row.fuel_type || 'fuel'}`,
        explanation,
        reasons: [explanation, 'Not auto-rejected — queued for human review'],
        metadata: { price: Number(row.price_amount), fuelType: row.fuel_type },
      });
      created.push(ev);
    }

    // Future timestamps
    const future = await pool.query(
      `SELECT r.id, r.title, r.location_id, r.occurred_at
       FROM reports r
       WHERE r.occurred_at > NOW() + INTERVAL '15 minutes'
         AND r.status IN ('submitted','active','confirmed')
       ORDER BY r.occurred_at DESC
       LIMIT 10`
    );
    for (const row of future.rows) {
      const ev = await this.recordEvent({
        eventType: 'validation_failed',
        severity: 'high',
        domain: 'all',
        entityType: 'report',
        entityId: row.id,
        locationId: row.location_id,
        title: 'Observation time in the future',
        explanation: 'Occurred-at is more than 15 minutes in the future.',
        reasons: ['Impossible timestamp', 'Queued for review — not auto-deleted'],
      });
      created.push(ev);
    }

    // Suspicious reporter volume (signal only)
    const burst = await pool.query(
      `SELECT user_id, COUNT(*)::int AS c
       FROM reports
       WHERE created_at > NOW() - INTERVAL '1 hour'
         AND user_id IS NOT NULL
       GROUP BY user_id
       HAVING COUNT(*) >= 12
       ORDER BY c DESC
       LIMIT 5`
    );
    for (const row of burst.rows) {
      const ev = await this.recordEvent({
        eventType: 'anomaly_detected',
        severity: 'medium',
        domain: 'all',
        entityType: 'user',
        entityId: row.user_id,
        title: 'Elevated reporting volume',
        explanation: `${row.c} reports in the last hour from one account — moderation signal only.`,
        reasons: [
          'Excessive reports in a short window',
          'Does not automatically label the person malicious',
        ],
        metadata: { count: row.c, window: '1h' },
      });
      created.push(ev);
    }

    return { created: created.slice(0, limit), scannedAt: new Date().toISOString() };
  },

  async domainDashboard(domain) {
    const pool = getPool();
    const code = String(domain || '').toLowerCase();
    const allowed = new Set(['traffic', 'fuel', 'prices', 'fx', 'official', 'locations']);
    if (!allowed.has(code)) {
      throw new AppError('Unknown quality domain.', 400, 'VALIDATION_ERROR');
    }

    let snapshot = {
      domain: code,
      current: 0,
      stale: 0,
      expired: 0,
      pending: 0,
      flagged: 0,
    };

    if (['traffic', 'fuel', 'prices'].includes(code)) {
      const r = await pool.query(
        `SELECT * FROM quality_domain_snapshot WHERE domain = $1`,
        [code]
      );
      const row = r.rows[0];
      if (row) {
        snapshot = {
          domain: code,
          current: Number(row.current_count) || 0,
          stale: Number(row.stale_count) || 0,
          expired: Number(row.expired_count) || 0,
          pending: Number(row.pending_count) || 0,
          flagged: Number(row.flagged_count) || 0,
        };
      }
    } else if (code === 'fx') {
      const r = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE observed_at > NOW() - INTERVAL '24 hours')::int AS current,
           COUNT(*) FILTER (
             WHERE observed_at <= NOW() - INTERVAL '24 hours'
               AND observed_at > NOW() - INTERVAL '7 days'
           )::int AS stale,
           COUNT(*) FILTER (WHERE observed_at <= NOW() - INTERVAL '7 days')::int AS expired
         FROM fx_observations`
      );
      snapshot.current = r.rows[0]?.current || 0;
      snapshot.stale = r.rows[0]?.stale || 0;
      snapshot.expired = r.rows[0]?.expired || 0;
    } else if (code === 'official') {
      const r = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'published')::int AS current,
           COUNT(*) FILTER (WHERE processing_status IN ('pending_review','needs_attention'))::int AS pending,
           COUNT(*) FILTER (WHERE status = 'hidden' OR processing_status = 'rejected')::int AS flagged
         FROM official_updates`
      );
      snapshot.current = r.rows[0]?.current || 0;
      snapshot.pending = r.rows[0]?.pending || 0;
      snapshot.flagged = r.rows[0]?.flagged || 0;
    } else if (code === 'locations') {
      const r = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'active')::int AS current,
           COUNT(*) FILTER (WHERE verification_status = 'pending')::int AS pending,
           COUNT(*) FILTER (
             WHERE latitude IS NULL OR longitude IS NULL OR state_id IS NULL
           )::int AS flagged
         FROM locations`
      );
      snapshot.current = r.rows[0]?.current || 0;
      snapshot.pending = r.rows[0]?.pending || 0;
      snapshot.flagged = r.rows[0]?.flagged || 0;
    }

    const total =
      snapshot.current + snapshot.stale + snapshot.expired + snapshot.pending + snapshot.flagged ||
      1;
    const pct = (n) => Math.round((1000 * (Number(n) || 0)) / total) / 10;

    const events = await this.listEvents({ domain: code, status: 'open', limit: 15 });
    const rules = await this.listRules({ domain: code });

    return {
      domain: code,
      snapshot,
      percentages: {
        current: pct(snapshot.current),
        stale: pct(snapshot.stale),
        expired: pct(snapshot.expired),
        pending: pct(snapshot.pending),
        flagged: pct(snapshot.flagged),
      },
      openEvents: events.items,
      rules: rules.items.filter((r) => r.domain === code || r.domain === 'all'),
      methodology:
        'Percentages reflect live operational counts. They are not editorial importance or political rankings.',
    };
  },

  async inspectRecord(entityType, entityId) {
    const pool = getPool();
    if (entityType === 'report') {
      const result = await pool.query(
        `SELECT r.*, c.code AS category_code, c.name AS category_name,
                loc.name AS location_name,
                p.fresh_within_minutes, p.recent_within_minutes, p.stale_after_minutes,
                p.default_ttl_minutes, p.corroboration_window_minutes
         FROM reports r
         JOIN report_categories c ON c.id = r.category_id
         LEFT JOIN locations loc ON loc.id = r.location_id
         LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
         WHERE r.id = $1`,
        [entityId]
      );
      const row = result.rows[0];
      if (!row) throw new AppError('Report not found.', 404, 'NOT_FOUND');
      const policy = await getPolicyForCategory(row.category_code);
      const quality = this.enrichQuality(row, policy);
      const history = await pool.query(
        `SELECT id, history_type, message, created_at, actor_user_id
         FROM report_history WHERE report_id = $1
         ORDER BY created_at DESC LIMIT 30`,
        [entityId]
      );
      const relatedEvents = await pool.query(
        `SELECT * FROM quality_events
         WHERE entity_type = 'report' AND entity_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [entityId]
      );
      const confirms = await pool.query(
        `SELECT confirmation_type::text AS type, COUNT(*)::int AS c
         FROM report_confirmations WHERE report_id = $1
         GROUP BY confirmation_type`,
        [entityId]
      );

      return {
        entityType: 'report',
        entityId,
        original: {
          id: row.id,
          title: row.title,
          status: row.status,
          sourceType: row.source_type,
          moderationState: row.moderation_state,
          locationName: row.location_name,
          category: row.category_code,
          occurredAt: row.occurred_at,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
        },
        quality,
        lineage: [
          { step: 'Source', detail: quality.source?.label },
          { step: 'Ingestion', detail: row.source_type === 'official' ? 'Official ingest' : 'Community submit' },
          { step: 'Normalization', detail: 'Category + location association' },
          { step: 'Validation', detail: `Freshness ${quality.freshness?.state}` },
          {
            step: 'Review',
            detail: row.moderation_state && row.moderation_state !== 'none' ? row.moderation_state : 'None',
          },
          { step: 'Publication', detail: row.visibility || 'unknown' },
        ],
        confirmations: confirms.rows,
        history: history.rows.map((h) => ({
          id: h.id,
          type: h.history_type,
          message: h.message,
          createdAt: h.created_at,
        })),
        qualityEvents: relatedEvents.rows.map(mapEvent),
        note: 'Internal moderation notes are not exposed on public APIs.',
      };
    }

    throw new AppError('Inspection supported for report entities in this release.', 400, 'VALIDATION_ERROR');
  },

  async intelligenceDashboard() {
    const pool = getPool();
    const [summaryEvents, byType, domains, rules] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'open')::int AS open,
           COUNT(*) FILTER (WHERE event_type = 'anomaly_detected' AND status = 'open')::int AS anomalies,
           COUNT(*) FILTER (WHERE event_type = 'conflict_detected' AND status = 'open')::int AS conflicts,
           COUNT(*) FILTER (WHERE event_type = 'duplicate_detected' AND status = 'open')::int AS duplicates,
           COUNT(*) FILTER (WHERE event_type IN ('stale','expired') AND created_at > NOW() - INTERVAL '7 days')::int AS freshness_events_7d
         FROM quality_events`
      ),
      pool.query(
        `SELECT event_type::text AS event_type, COUNT(*)::int AS c
         FROM quality_events
         WHERE created_at > NOW() - INTERVAL '7 days'
         GROUP BY event_type
         ORDER BY c DESC`
      ),
      pool.query(`SELECT * FROM quality_domain_snapshot ORDER BY domain`),
      pool.query(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE enabled)::int AS enabled
         FROM quality_validation_rules`
      ),
    ]);

    return {
      events: summaryEvents.rows[0],
      eventTypes7d: byType.rows,
      domains: domains.rows.map((d) => ({
        domain: d.domain,
        current: Number(d.current_count),
        stale: Number(d.stale_count),
        expired: Number(d.expired_count),
        pending: Number(d.pending_count),
        flagged: Number(d.flagged_count),
      })),
      rules: {
        total: rules.rows[0]?.total || 0,
        enabled: rules.rows[0]?.enabled || 0,
      },
      framework: {
        opaqueTrustScore: false,
        autoMerge: false,
        autoDeleteDisputed: false,
        note: 'Transparent multi-dimension signals with human review.',
      },
    };
  },

  /** Emit stale/expired events after transition jobs (bounded). */
  async recordFreshnessTransitions(changedRows = []) {
    const out = [];
    for (const row of changedRows.slice(0, 50)) {
      const status = row.status || row.newStatus;
      if (status !== 'stale' && status !== 'expired') continue;
      try {
        out.push(
          await this.recordEvent({
            eventType: status === 'expired' ? 'expired' : 'stale',
            severity: status === 'expired' ? 'low' : 'info',
            domain: row.category_code || row.categoryCode || 'all',
            entityType: 'report',
            entityId: row.id,
            locationId: row.location_id || row.locationId || null,
            title: status === 'expired' ? 'Report expired' : 'Report marked stale',
            explanation:
              status === 'expired'
                ? 'Past expiry — retained historically, excluded from current summaries.'
                : 'Past stale threshold — retained historically, excluded from current summaries.',
            reasons: ['Freshness transition', 'Historical record retained'],
            status: 'resolved',
          })
        );
      } catch {
        /* never block scheduler */
      }
    }
    return out;
  },
};

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventType: row.event_type,
    severity: row.severity,
    status: row.status,
    domain: row.domain,
    entityType: row.entity_type,
    entityId: row.entity_id,
    locationId: row.location_id,
    title: row.title,
    explanation: row.explanation,
    reasons: row.reasons || [],
    metadata: row.metadata || {},
    priority: row.priority,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
