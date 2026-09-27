/**
 * Admin traffic operations — reuses traffic_reports + reports freshness/moderation.
 * Does not invent a second incident system.
 */
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import { trafficRepository } from '../repositories/trafficRepository.js';
import { dataQualityService } from './dataQualityService.js';
import { trafficEventAdminService } from './trafficEventAdminService.js';
import { severityBand } from '../config/trafficIntelligence.js';

const SEVERITIES = new Set([
  'clear',
  'light',
  'moderate',
  'heavy',
  'standstill',
  'blocked',
  'unknown',
]);
const CAUSES = new Set([
  'accident',
  'roadworks',
  'flooding',
  'vehicle_breakdown',
  'security_incident',
  'event',
  'construction',
  'lane_closure',
  'unknown',
  'other',
]);
const STATUSES = new Set([
  'submitted',
  'active',
  'confirmed',
  'stale',
  'expired',
  'flagged',
  'under_review',
  'removed',
]);

async function writeAudit(admin, payload, req) {
  if (!admin?.userId && !admin?.id) return null;
  const newState = payload.newState ? { ...payload.newState } : {};
  if (req?.requestId) newState.requestId = req.requestId;
  return adminAuditRepository.create({
    actorUserId: admin.userId || admin.id,
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId,
    previousState: payload.previousState || null,
    newState: Object.keys(newState).length ? newState : null,
    reason: payload.reason || null,
    ipAddress: req?.ip || null,
    userAgent: req?.get?.('user-agent') || req?.headers?.['user-agent'] || null,
  });
}

function trustLabel(sourceType, status, confirmedCount) {
  if (sourceType === 'official') return 'Official Update';
  if (sourceType === 'aggregated') return 'Aggregated';
  if (status === 'confirmed' || Number(confirmedCount) > 0) return 'Verified Community Report';
  return 'Community Report';
}

function freshnessLabel(status, expiresAt, lastConfirmedAt, occurredAt, createdAt, staleAfter = 60) {
  const now = Date.now();
  if (status === 'expired' || (expiresAt && new Date(expiresAt).getTime() <= now)) return 'expired';
  if (status === 'stale') return 'stale';
  const anchor = lastConfirmedAt || occurredAt || createdAt;
  if (!anchor) return 'fresh';
  const age = now - new Date(anchor).getTime();
  if (age >= staleAfter * 60 * 1000) return 'stale';
  if (age >= (staleAfter * 60 * 1000) / 2) return 'aging';
  return 'fresh';
}

function mapAdminRow(row) {
  if (!row) return null;
  const freshness = freshnessLabel(
    row.status,
    row.expires_at,
    row.last_confirmed_at,
    row.occurred_at,
    row.created_at,
    row.stale_after_minutes || 60
  );
  return {
    id: row.traffic_id,
    reportId: row.report_id,
    severity: row.severity,
    cause: row.cause,
    roadName: row.road_name || null,
    roadId: row.road_id || null,
    directionLabel: row.direction_label || null,
    affectedSection: row.affected_section || null,
    estimatedDelayMinutes:
      row.estimated_delay_minutes != null ? Number(row.estimated_delay_minutes) : null,
    title: row.title,
    description: row.description,
    sourceType: row.source_type,
    status: row.status,
    moderationState: row.moderation_state,
    freshness,
    trustLabel: trustLabel(row.source_type, row.status, row.confirmed_accurate_count),
    severityBand: severityBand(row.severity),
    trafficEventId: row.traffic_event_id || null,
    locationName: row.location_name,
    stateId: row.state_id,
    stateName: row.state_name,
    lgaId: row.lga_id,
    lgaName: row.lga_name,
    areaId: row.area_id,
    areaName: row.area_name,
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: Number(row.latitude), lng: Number(row.longitude) }
        : null,
    authorDisplayName: row.author_display_name || null,
    confirmation: {
      stillAccurate: Number(row.confirmed_accurate_count || 0),
      noLongerAccurate: Number(row.confirmed_inaccurate_count || 0),
    },
    occurredAt: row.occurred_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = `
  t.id AS traffic_id, t.report_id, t.severity, t.cause, t.road_id, t.road_name,
  t.direction_label, t.affected_section, t.estimated_delay_minutes, t.traffic_event_id,
  r.title, r.description, r.source_type, r.status, r.moderation_state,
  r.latitude, r.longitude, r.occurred_at, r.expires_at, r.last_confirmed_at,
  r.confirmed_accurate_count, r.confirmed_inaccurate_count, r.created_at, r.updated_at,
  r.location_id,
  loc.name AS location_name, loc.state_id, loc.lga_id, loc.area_id,
  s.name AS state_name, l.name AS lga_name, a.name AS area_name,
  u.display_name AS author_display_name, p.stale_after_minutes
`;

const JOINS = `
  FROM traffic_reports t
  JOIN reports r ON r.id = t.report_id
  JOIN report_categories c ON c.id = r.category_id AND c.code = 'traffic'
  JOIN locations loc ON loc.id = r.location_id
  LEFT JOIN states s ON s.id = loc.state_id
  LEFT JOIN lgas l ON l.id = loc.lga_id
  LEFT JOIN areas a ON a.id = loc.area_id
  JOIN users u ON u.id = r.user_id
  LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
`;

export const trafficAdminService = {
  async dashboard() {
    const pool = getPool();
    const [
      active,
      review,
      blocked,
      stale,
      today,
      official,
      hotAreas,
      conflicts,
      flagged,
      resolvedToday,
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS c ${JOINS}
         WHERE r.status IN ('submitted','active','confirmed')
           AND (r.expires_at IS NULL OR r.expires_at > NOW())`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c ${JOINS}
         WHERE r.moderation_state IN ('flagged','queued','in_review','escalated')
            OR r.status IN ('flagged','under_review')`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c ${JOINS}
         WHERE t.severity IN ('blocked','standstill')
           AND r.status IN ('submitted','active','confirmed','stale')
           AND r.status <> 'removed'`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c ${JOINS}
         WHERE r.status IN ('stale','expired')
            OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW())`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c ${JOINS}
         WHERE r.source_type = 'community'
           AND r.created_at >= date_trunc('day', NOW())`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM official_updates ou
         WHERE ou.category = 'road_traffic'
           AND ou.status = 'published'
           AND ou.published_at >= NOW() - INTERVAL '7 days'`
      ).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query(
        `SELECT loc.area_id, a.name AS area_name, COUNT(*)::int AS c
         ${JOINS}
         WHERE r.created_at >= NOW() - INTERVAL '24 hours'
           AND loc.area_id IS NOT NULL
         GROUP BY loc.area_id, a.name
         HAVING COUNT(*) >= 3
         ORDER BY c DESC
         LIMIT 8`
      ),
      dataQualityService
        .findConflicts({ categoryCode: 'traffic', windowMinutes: 90, limit: 200 })
        .then((rows) => rows.length)
        .catch(() => 0),
      pool.query(
        `SELECT COUNT(*)::int AS c ${JOINS}
         WHERE r.moderation_state = 'flagged' OR r.status = 'flagged'
            OR EXISTS (SELECT 1 FROM report_flags f WHERE f.report_id = r.id AND f.status = 'open')`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM traffic_events
         WHERE status = 'resolved' AND resolved_at >= date_trunc('day', NOW())`
      ).catch(() => ({ rows: [{ c: 0 }] })),
    ]);

    const eventMetrics = await trafficEventAdminService.metrics().catch(() => ({
      activeEvents: 0,
      severeEvents: 0,
      roadClosures: 0,
      staleEvents: 0,
      resolvedToday: 0,
      improvingEvents: 0,
      eventsCreatedToday: 0,
    }));

    return {
      activeReports: active.rows[0]?.c || 0,
      awaitingReview: review.rows[0]?.c || 0,
      currentIncidents: blocked.rows[0]?.c || 0,
      severeEvents: eventMetrics.severeEvents,
      highCriticalEvents: eventMetrics.highCriticalEvents || 0,
      roadClosures: eventMetrics.roadClosures,
      activeEvents: eventMetrics.activeEvents,
      staleOrExpired: stale.rows[0]?.c || 0,
      staleEvents: eventMetrics.staleEvents,
      communityReportsToday: today.rows[0]?.c || 0,
      officialUpdates7d: official.rows[0]?.c || 0,
      officialEvents: eventMetrics.officialEvents || 0,
      communityEvents: eventMetrics.communityEvents || 0,
      pendingVerification: eventMetrics.pendingVerification || 0,
      flaggedDuplicates: eventMetrics.flaggedDuplicates || 0,
      flaggedReports: flagged.rows[0]?.c || 0,
      resolvedEventsToday: resolvedToday.rows[0]?.c || eventMetrics.resolvedToday || 0,
      conflictGroups: Number(conflicts) || 0,
      busyAreas: hotAreas.rows.map((r) => ({
        areaId: r.area_id,
        areaName: r.area_name,
        reportCount: r.c,
      })),
    };
  },

  // Events delegated to trafficEventAdminService
  events: trafficEventAdminService,

  async list({
    q,
    stateId,
    lgaId,
    areaId,
    road,
    severity,
    cause,
    status,
    sourceType,
    freshness,
    from,
    to,
    page = 1,
    limit = 30,
  } = {}) {
    const params = [];
    const where = [`r.status <> 'removed'`];

    if (q) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(
        `(r.title ILIKE $${i} OR t.road_name ILIKE $${i} OR loc.name ILIKE $${i} OR r.description ILIKE $${i})`
      );
    }
    if (stateId) {
      params.push(stateId);
      where.push(`loc.state_id = $${params.length}`);
    }
    if (lgaId) {
      params.push(lgaId);
      where.push(`loc.lga_id = $${params.length}`);
    }
    if (areaId) {
      params.push(areaId);
      where.push(`loc.area_id = $${params.length}`);
    }
    if (road) {
      params.push(`%${String(road).trim()}%`);
      where.push(`t.road_name ILIKE $${params.length}`);
    }
    if (severity && SEVERITIES.has(severity)) {
      params.push(severity);
      where.push(`t.severity = $${params.length}::traffic_severity`);
    }
    if (cause && CAUSES.has(cause)) {
      params.push(cause);
      where.push(`t.cause = $${params.length}::traffic_cause`);
    }
    if (status && STATUSES.has(status)) {
      params.push(status);
      where.push(`r.status = $${params.length}::report_status`);
    }
    if (sourceType) {
      params.push(sourceType);
      where.push(`r.source_type = $${params.length}::report_source_type`);
    }
    if (freshness === 'expired') {
      where.push(`(r.status = 'expired' OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW()))`);
    } else if (freshness === 'stale') {
      where.push(`r.status = 'stale'`);
    } else if (freshness === 'fresh') {
      where.push(
        `r.status IN ('submitted','active','confirmed') AND (r.expires_at IS NULL OR r.expires_at > NOW())`
      );
    } else if (freshness === 'aging') {
      where.push(
        `r.status IN ('submitted','active','confirmed')
         AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
             < NOW() - make_interval(mins => GREATEST(COALESCE(p.stale_after_minutes, 60) / 2, 1))
         AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
             >= NOW() - make_interval(mins => COALESCE(p.stale_after_minutes, 60))`
      );
    }
    if (from) {
      params.push(from);
      where.push(`r.created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      where.push(`r.created_at <= $${params.length}::timestamptz`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);

    const result = await getPool().query(
      `SELECT ${SELECT} ${JOINS} ${whereSql}
       ORDER BY r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total ${JOINS} ${whereSql}`,
      params.slice(0, -2)
    );

    return {
      items: result.rows.map(mapAdminRow),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async get(id) {
    const result = await getPool().query(`SELECT ${SELECT} ${JOINS} WHERE t.id = $1`, [id]);
    if (!result.rows[0]) throw new AppError('Traffic report not found.', 404, 'NOT_FOUND');
    const item = mapAdminRow(result.rows[0]);

    const [history, conflict, audits, related] = await Promise.all([
      getPool().query(
        `SELECT action, note, created_at, actor_user_id
         FROM report_history WHERE report_id = $1
         ORDER BY created_at DESC LIMIT 30`,
        [item.reportId]
      ).catch(() => ({ rows: [] })),
      dataQualityService
        .conflictForReport({
          location_id: result.rows[0].location_id,
          locationId: result.rows[0].location_id,
          category_code: 'traffic',
        })
        .catch(() => null),
      getPool().query(
        `SELECT action, reason, previous_state, new_state, created_at
         FROM admin_audit_log
         WHERE entity_type = 'traffic_report' AND entity_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [id]
      ).catch(() => ({ rows: [] })),
      getPool().query(
        `SELECT t.id, t.severity, t.road_name, r.status, r.created_at
         ${JOINS}
         WHERE loc.id = (SELECT location_id FROM reports WHERE id = $1)
           AND t.id <> $2
           AND r.created_at >= NOW() - INTERVAL '12 hours'
           AND r.status <> 'removed'
         ORDER BY r.created_at DESC LIMIT 10`,
        [item.reportId, id]
      ),
    ]);

    const full = await trafficRepository.findById(id);

    return {
      item,
      detail: full,
      conflict,
      related: related.rows.map((r) => ({
        id: r.id,
        severity: r.severity,
        roadName: r.road_name,
        status: r.status,
        createdAt: r.created_at,
      })),
      history: history.rows.map((h) => ({
        action: h.action,
        note: h.note,
        createdAt: h.created_at,
      })),
      adminActivity: audits.rows.map((a) => ({
        action: a.action,
        reason: a.reason,
        previousState: a.previous_state,
        newState: a.new_state,
        createdAt: a.created_at,
      })),
    };
  },

  async update(id, body, admin, req) {
    const current = await this.get(id);
    const item = current.item;

    const nextSeverity =
      body.severity != null
        ? SEVERITIES.has(body.severity)
          ? body.severity
          : (() => {
              throw new AppError('Invalid severity.', 400, 'VALIDATION_ERROR');
            })()
        : item.severity;
    const nextCause =
      body.cause !== undefined
        ? body.cause === null || body.cause === ''
          ? null
          : CAUSES.has(body.cause)
            ? body.cause
            : (() => {
                throw new AppError('Invalid cause.', 400, 'VALIDATION_ERROR');
              })()
        : item.cause;
    const nextRoad =
      body.roadName !== undefined
        ? body.roadName
          ? String(body.roadName).trim().slice(0, 160)
          : null
        : item.roadName;
    const nextSection =
      body.affectedSection !== undefined
        ? body.affectedSection
          ? String(body.affectedSection).trim().slice(0, 240)
          : null
        : item.affectedSection;
    const nextStatus =
      body.status != null
        ? STATUSES.has(body.status)
          ? body.status
          : (() => {
              throw new AppError('Invalid status.', 400, 'VALIDATION_ERROR');
            })()
        : item.status;

    if (!body.reason || String(body.reason).trim().length < 3) {
      throw new AppError('A correction reason is required.', 400, 'VALIDATION_ERROR');
    }

    await getPool().query(
      `UPDATE traffic_reports SET
         severity = $2::traffic_severity,
         cause = $3::traffic_cause,
         road_name = $4,
         affected_section = $5,
         updated_at = NOW()
       WHERE id = $1`,
      [id, nextSeverity, nextCause, nextRoad, nextSection]
    );

    if (nextStatus !== item.status) {
      await getPool().query(
        `UPDATE reports SET status = $2::report_status, updated_at = NOW() WHERE id = $1`,
        [item.reportId, nextStatus]
      );
    }

    await writeAudit(
      admin,
      {
        action: 'traffic_report.update',
        entityType: 'traffic_report',
        entityId: id,
        previousState: {
          severity: item.severity,
          cause: item.cause,
          roadName: item.roadName,
          affectedSection: item.affectedSection,
          status: item.status,
        },
        newState: {
          severity: nextSeverity,
          cause: nextCause,
          roadName: nextRoad,
          affectedSection: nextSection,
          status: nextStatus,
        },
        reason: String(body.reason).trim(),
      },
      req
    );

    return this.get(id);
  },

  async listDuplicates({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const result = await getPool().query(
      `SELECT lower(COALESCE(t.road_name, loc.name)) AS place_key,
              loc.id AS location_id,
              COUNT(*)::int AS count,
              array_agg(t.id::text ORDER BY r.created_at DESC) AS ids,
              MAX(loc.name) AS location_name,
              MAX(t.road_name) AS road_name
       ${JOINS}
       WHERE r.created_at >= NOW() - INTERVAL '6 hours'
         AND r.status IN ('submitted','active','confirmed','stale')
       GROUP BY lower(COALESCE(t.road_name, loc.name)), loc.id
       HAVING COUNT(*) >= 3
       ORDER BY count DESC
       LIMIT $1`,
      [lim]
    );
    return {
      sameRoadRecent: result.rows.map((r) => ({
        placeKey: r.place_key,
        locationId: r.location_id,
        locationName: r.location_name,
        roadName: r.road_name,
        count: r.count,
        ids: r.ids,
      })),
      note: 'Candidates for human review — not auto-merged.',
    };
  },

  async officialSources() {
    const result = await getPool()
      .query(
        `SELECT os.id, os.organization_name, os.short_name, os.status,
                os.verification_status, os.last_attempt_at, os.last_success_at,
                os.last_error_message, os.consecutive_failures, os.ingestion_method, os.notes
         FROM official_sources os
         WHERE os.id IN ('fixture_frsc','fixture_lastma')
            OR os.provider_key ILIKE '%frsc%'
            OR os.provider_key ILIKE '%lastma%'
            OR os.notes ILIKE '%traffic%'
            OR os.notes ILIKE '%road%'
         ORDER BY os.organization_name ASC
         LIMIT 20`
      )
      .catch(() => ({ rows: [] }));

    return result.rows.map((r) => ({
      id: r.id,
      name: r.short_name || r.organization_name,
      organizationName: r.organization_name,
      status: r.status,
      verificationStatus: r.verification_status,
      ingestionMethod: r.ingestion_method,
      lastAttemptAt: r.last_attempt_at,
      lastSuccessAt: r.last_success_at,
      lastError: r.last_error_message || null,
      consecutiveFailures: r.consecutive_failures || 0,
      note: 'Official advisories — not GPS-measured live traffic unless the source provides that.',
    }));
  },

  async qualityIssues({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const [stale, missingRoad, flagged, conflicts, dups] = await Promise.all([
      getPool().query(
        `SELECT t.id, t.road_name, r.status, r.created_at ${JOINS}
         WHERE r.status IN ('stale','expired') OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW())
         ORDER BY r.created_at DESC LIMIT $1`,
        [lim]
      ),
      getPool().query(
        `SELECT t.id, r.title, loc.name AS location_name ${JOINS}
         WHERE t.road_name IS NULL AND t.road_id IS NULL
           AND r.status IN ('submitted','active','confirmed')
         ORDER BY r.created_at DESC LIMIT $1`,
        [lim]
      ),
      getPool().query(
        `SELECT t.id, t.road_name, r.moderation_state, r.status ${JOINS}
         WHERE r.moderation_state IN ('flagged','in_review','queued','escalated')
         ORDER BY r.updated_at DESC LIMIT $1`,
        [lim]
      ),
      dataQualityService.findConflicts({ categoryCode: 'traffic', windowMinutes: 90, limit: lim }),
      this.listDuplicates({ limit: lim }),
    ]);

    return {
      staleOrExpired: stale.rows,
      missingRoadContext: missingRoad.rows,
      flagged: flagged.rows,
      conflicts,
      duplicateCandidates: dups.sameRoadRecent,
      counts: {
        staleOrExpired: stale.rows.length,
        missingRoadContext: missingRoad.rows.length,
        flagged: flagged.rows.length,
        conflicts: conflicts.length,
        duplicates: dups.sameRoadRecent.length,
      },
    };
  },
};

export default trafficAdminService;
