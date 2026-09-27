/**
 * Traffic event administration — underlying situations distinct from reports.
 * Reports remain provenance via traffic_event_reports.
 */
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import {
  TRAFFIC_EVENT_TYPES,
  TRAFFIC_EVENT_TYPE_GROUPS,
  TRAFFIC_EVENT_STATUSES,
  TRAFFIC_LIVE_STATUSES,
  TRAFFIC_DIRECTIONS,
  TRAFFIC_SEVERITY_BANDS,
  TRAFFIC_CONFIDENCE_LEVELS,
  TRAFFIC_PASSABILITY,
  TRAFFIC_SOURCE_LABELS,
  DEFAULT_FRESHNESS_WINDOWS,
  severityBand,
  impactSeverity,
  isSevereOrCritical,
  isRoadClosureType,
  isLiveEventStatus,
  publicSourceLabel,
  computeFreshnessState,
  relativeObservationLabel,
  freshnessWindowForType,
} from '../config/trafficIntelligence.js';
import { isWithinNigeriaBounds } from '../utils/geoBounds.js';

const SEVERITIES = new Set([
  'clear',
  'light',
  'moderate',
  'heavy',
  'standstill',
  'blocked',
  'unknown',
]);
const EVENT_TYPES = new Set(TRAFFIC_EVENT_TYPES);
const EVENT_STATUSES = new Set(TRAFFIC_EVENT_STATUSES);
const DIRECTIONS = new Set(TRAFFIC_DIRECTIONS);
const CONFIDENCES = new Set(TRAFFIC_CONFIDENCE_LEVELS);
const PASSABILITIES = new Set(TRAFFIC_PASSABILITY);
const LIVE_STATUSES_SQL = TRAFFIC_LIVE_STATUSES.map((s) => `'${s}'`).join(',');

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

function mapEvent(row) {
  if (!row) return null;
  const band = severityBand(row.severity);
  const impact = impactSeverity(band.code);
  const freshness =
    row.freshness_state ||
    computeFreshnessState({
      eventType: row.event_type,
      observedAt: row.observed_at,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      expectedEndAt: row.expected_end_at || row.estimated_resolution_at,
      status: row.status,
    });
  const sourceLabel = publicSourceLabel({
    sourceClassification: row.source_classification,
    verificationStatus: row.verification_status,
    officialAgencyName: row.related_official_agency || null,
  });
  return {
    id: row.id,
    eventType: row.event_type,
    severity: row.severity,
    severityBand: band,
    impactSeverity: impact,
    status: row.status,
    title: row.title,
    description: row.description || null,
    roadId: row.road_id || null,
    roadSegmentId: row.road_segment_id || null,
    roadName: row.road_name || row.road_table_name || null,
    segmentName: row.segment_name || null,
    locationId: row.location_id || null,
    locationName: row.location_name || null,
    stateId: row.state_id || null,
    stateName: row.state_name || null,
    lgaId: row.lga_id || null,
    lgaName: row.lga_name || null,
    areaId: row.area_id || null,
    areaName: row.area_name || null,
    direction: row.direction,
    directionLabel: row.direction_label || null,
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: Number(row.latitude), lng: Number(row.longitude) }
        : null,
    startedAt: row.started_at,
    observedAt: row.observed_at,
    publishedAt: row.published_at || row.created_at,
    estimatedResolutionAt: row.estimated_resolution_at,
    expectedEndAt: row.expected_end_at || row.estimated_resolution_at,
    expiresAt: row.expires_at || null,
    resolvedAt: row.resolved_at,
    confidence: row.confidence || 'medium',
    freshnessState: freshness,
    observedLabel: relativeObservationLabel(row.observed_at || row.started_at),
    mayBeOutdated: freshness === 'stale' || freshness === 'aging',
    sourceClassification: row.source_classification,
    verificationStatus: row.verification_status,
    sourceLabel,
    sourceLabels: TRAFFIC_SOURCE_LABELS,
    relatedOfficialUpdateId: row.related_official_update_id || null,
    relatedOfficialTitle: row.related_official_title || null,
    eventGroupId: row.event_group_id || null,
    mergedIntoEventId: row.merged_into_event_id || null,
    splitFromEventId: row.split_from_event_id || null,
    duplicateOfEventId: row.duplicate_of_event_id || null,
    flaggedDuplicate: Boolean(row.flagged_duplicate),
    passability: row.passability || 'unknown',
    floodDepthCm: row.flood_depth_cm != null ? Number(row.flood_depth_cm) : null,
    diversionNotes: row.diversion_notes || null,
    attributes: row.attributes || {},
    reportCount: Number(row.report_count || 0),
    isClosure: isRoadClosureType(row.event_type),
    isSevere: isSevereOrCritical(row.severity),
    isLive: isLiveEventStatus(row.status) && !row.merged_into_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = `
  e.*,
  loc.name AS location_name,
  s.name AS state_name,
  l.name AS lga_name,
  a.name AS area_name,
  rd.name AS road_table_name,
  seg.name AS segment_name,
  ou.title AS related_official_title,
  (SELECT COUNT(*)::int FROM traffic_event_reports ter WHERE ter.event_id = e.id) AS report_count
`;

const JOINS = `
  FROM traffic_events e
  LEFT JOIN locations loc ON loc.id = e.location_id
  LEFT JOIN states s ON s.id = COALESCE(e.state_id, loc.state_id)
  LEFT JOIN lgas l ON l.id = COALESCE(e.lga_id, loc.lga_id)
  LEFT JOIN areas a ON a.id = COALESCE(e.area_id, loc.area_id)
  LEFT JOIN roads rd ON rd.id = e.road_id
  LEFT JOIN road_segments seg ON seg.id = e.road_segment_id
  LEFT JOIN official_updates ou ON ou.id = e.related_official_update_id
`;

function validateCoords(lat, lng) {
  if (lat == null && lng == null) return { latitude: null, longitude: null };
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new AppError('Invalid coordinates.', 400, 'INVALID_COORDINATES');
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new AppError('Coordinates out of range.', 400, 'INVALID_COORDINATES');
  }
  if (!isWithinNigeriaBounds(latitude, longitude)) {
    throw new AppError('Coordinates are outside Nigeria operational bounds.', 400, 'INVALID_COORDINATES');
  }
  return { latitude, longitude };
}

export const trafficEventAdminService = {
  vocab() {
    return {
      eventTypes: TRAFFIC_EVENT_TYPES,
      eventTypeGroups: TRAFFIC_EVENT_TYPE_GROUPS,
      statuses: TRAFFIC_EVENT_STATUSES,
      liveStatuses: TRAFFIC_LIVE_STATUSES,
      directions: TRAFFIC_DIRECTIONS,
      severities: [...SEVERITIES],
      confidenceLevels: TRAFFIC_CONFIDENCE_LEVELS,
      passability: TRAFFIC_PASSABILITY,
      sourceLabels: TRAFFIC_SOURCE_LABELS,
      defaultFreshnessWindows: DEFAULT_FRESHNESS_WINDOWS,
      severityBands: Object.fromEntries(
        Object.entries(TRAFFIC_SEVERITY_BANDS).map(([code, meta]) => [
          code,
          { label: meta.label, meaning: meta.meaning, values: meta.values },
        ])
      ),
    };
  },

  async metrics() {
    const pool = getPool();
    const live = `status IN (${LIVE_STATUSES_SQL}) AND merged_into_event_id IS NULL`;
    const [
      active,
      severe,
      closures,
      staleEvents,
      resolved,
      improving,
      today,
      official,
      community,
      pending,
      flagged,
      highCritical,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM traffic_events WHERE ${live}`),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM traffic_events
         WHERE ${live} AND severity IN ('standstill','blocked')`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM traffic_events
         WHERE ${live}
           AND event_type IN ('road_closure','partial_closure','obstruction','lane_restriction','diversion')`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM traffic_events
         WHERE ${live}
           AND (
             freshness_state IN ('stale','aging')
             OR COALESCE(observed_at, started_at, updated_at) < NOW() - INTERVAL '3 hours'
           )`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM traffic_events
         WHERE status = 'resolved'
           AND resolved_at >= date_trunc('day', NOW())`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM traffic_events WHERE status = 'improving' AND merged_into_event_id IS NULL`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM traffic_events
         WHERE created_at >= date_trunc('day', NOW())`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM traffic_events
         WHERE ${live} AND source_classification = 'official'`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM traffic_events
         WHERE ${live} AND source_classification IN ('community','mixed')`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM traffic_events
         WHERE status IN ('reported','investigating') AND merged_into_event_id IS NULL`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM traffic_events
         WHERE flagged_duplicate = TRUE AND merged_into_event_id IS NULL`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM traffic_events
         WHERE ${live} AND severity IN ('heavy','standstill','blocked')`
      ),
    ]);
    return {
      activeEvents: active.rows[0]?.c || 0,
      severeEvents: severe.rows[0]?.c || 0,
      highCriticalEvents: highCritical.rows[0]?.c || 0,
      roadClosures: closures.rows[0]?.c || 0,
      staleEvents: staleEvents.rows[0]?.c || 0,
      resolvedToday: resolved.rows[0]?.c || 0,
      improvingEvents: improving.rows[0]?.c || 0,
      eventsCreatedToday: today.rows[0]?.c || 0,
      officialEvents: official.rows[0]?.c || 0,
      communityEvents: community.rows[0]?.c || 0,
      pendingVerification: pending.rows[0]?.c || 0,
      flaggedDuplicates: flagged.rows[0]?.c || 0,
    };
  },

  async list({
    q,
    status,
    eventType,
    severity,
    stateId,
    lgaId,
    roadId,
    page = 1,
    limit = 30,
  } = {}) {
    const params = [];
    const where = [`e.merged_into_event_id IS NULL`];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(
        `(e.title ILIKE $${i} OR e.road_name ILIKE $${i} OR loc.name ILIKE $${i} OR e.description ILIKE $${i})`
      );
    }
    if (status && EVENT_STATUSES.has(status)) {
      params.push(status);
      where.push(`e.status = $${params.length}::traffic_event_status`);
    }
    if (eventType && EVENT_TYPES.has(eventType)) {
      params.push(eventType);
      where.push(`e.event_type = $${params.length}::traffic_event_type`);
    }
    if (severity && SEVERITIES.has(severity)) {
      params.push(severity);
      where.push(`e.severity = $${params.length}::traffic_severity`);
    }
    if (stateId) {
      params.push(stateId);
      where.push(`COALESCE(e.state_id, loc.state_id) = $${params.length}`);
    }
    if (lgaId) {
      params.push(lgaId);
      where.push(`COALESCE(e.lga_id, loc.lga_id) = $${params.length}`);
    }
    if (roadId) {
      params.push(roadId);
      where.push(`e.road_id = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);

    const result = await getPool().query(
      `SELECT ${SELECT} ${JOINS} ${whereSql}
       ORDER BY
         CASE e.status WHEN 'active' THEN 0 WHEN 'improving' THEN 1 ELSE 2 END,
         CASE e.severity
           WHEN 'blocked' THEN 0 WHEN 'standstill' THEN 1 WHEN 'heavy' THEN 2
           WHEN 'moderate' THEN 3 ELSE 4 END,
         COALESCE(e.observed_at, e.updated_at) DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total ${JOINS} ${whereSql}`,
      params.slice(0, -2)
    );
    return {
      items: result.rows.map(mapEvent),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async get(id) {
    const result = await getPool().query(`SELECT ${SELECT} ${JOINS} WHERE e.id = $1`, [id]);
    if (!result.rows[0]) throw new AppError('Traffic event not found.', 404, 'NOT_FOUND');
    const item = mapEvent(result.rows[0]);

    const [reports, confirmations, audits, conflicts] = await Promise.all([
      getPool().query(
        `SELECT r.id AS report_id, r.title, r.source_type, r.status, r.created_at,
                r.confirmed_accurate_count, r.confirmed_inaccurate_count,
                t.id AS traffic_id, t.severity, t.cause, t.road_name, t.direction_label,
                ter.linked_at, ter.link_reason
         FROM traffic_event_reports ter
         JOIN reports r ON r.id = ter.report_id
         LEFT JOIN traffic_reports t ON t.report_id = r.id
         WHERE ter.event_id = $1
         ORDER BY r.created_at DESC
         LIMIT 50`,
        [id]
      ),
      getPool().query(
        `SELECT MAX(r.last_confirmed_at) AS last_confirmed_at,
                SUM(r.confirmed_accurate_count)::int AS accurate,
                SUM(r.confirmed_inaccurate_count)::int AS inaccurate
         FROM traffic_event_reports ter
         JOIN reports r ON r.id = ter.report_id
         WHERE ter.event_id = $1`,
        [id]
      ),
      getPool().query(
        `SELECT action, reason, previous_state, new_state, created_at
         FROM admin_audit_log
         WHERE entity_type = 'traffic_event' AND entity_id = $1
         ORDER BY created_at DESC LIMIT 30`,
        [id]
      ),
      getPool().query(
        `SELECT t.severity, COUNT(*)::int AS c
         FROM traffic_event_reports ter
         JOIN traffic_reports t ON t.report_id = ter.report_id
         JOIN reports r ON r.id = ter.report_id
         WHERE ter.event_id = $1 AND r.status <> 'removed'
         GROUP BY t.severity
         HAVING COUNT(*) >= 1`,
        [id]
      ),
    ]);

    const severitySet = new Set(conflicts.rows.map((r) => r.severity).filter(Boolean));
    const conflicting =
      severitySet.has('clear') &&
      [...severitySet].some((s) => ['heavy', 'standstill', 'blocked'].includes(s));

    return {
      item,
      reports: reports.rows.map((r) => ({
        reportId: r.report_id,
        trafficId: r.traffic_id,
        title: r.title,
        sourceType: r.source_type,
        status: r.status,
        severity: r.severity,
        cause: r.cause,
        roadName: r.road_name,
        directionLabel: r.direction_label,
        confirmations: {
          accurate: Number(r.confirmed_accurate_count || 0),
          inaccurate: Number(r.confirmed_inaccurate_count || 0),
        },
        linkedAt: r.linked_at,
        linkReason: r.link_reason,
        createdAt: r.created_at,
      })),
      evidence: {
        lastConfirmedAt: confirmations.rows[0]?.last_confirmed_at || null,
        accurateConfirmations: Number(confirmations.rows[0]?.accurate || 0),
        inaccurateConfirmations: Number(confirmations.rows[0]?.inaccurate || 0),
        severitySpread: conflicts.rows.map((r) => ({
          severity: r.severity,
          count: r.c,
        })),
        conflictingReports: conflicting,
      },
      adminActivity: audits.rows.map((a) => ({
        action: a.action,
        reason: a.reason,
        previousState: a.previous_state,
        newState: a.new_state,
        createdAt: a.created_at,
      })),
      note: conflicting
        ? 'Linked reports disagree on severity — investigate timestamps, direction, and sources. Do not auto-pick a winner.'
        : 'Event aggregates linked reports; individual reports remain the provenance record.',
    };
  },

  async create(body, admin, req) {
    const title = String(body.title || '').trim();
    if (title.length < 3) throw new AppError('Title is required.', 400, 'VALIDATION_ERROR');
    const eventType = EVENT_TYPES.has(body.eventType) ? body.eventType : 'other';
    const severity = SEVERITIES.has(body.severity) ? body.severity : 'unknown';
    const status = EVENT_STATUSES.has(body.status) ? body.status : 'active';
    const direction = DIRECTIONS.has(body.direction) ? body.direction : 'unspecified';
    const confidence = CONFIDENCES.has(body.confidence) ? body.confidence : 'medium';
    const passability = PASSABILITIES.has(body.passability) ? body.passability : 'unknown';
    const coords = validateCoords(body.latitude ?? body.lat, body.longitude ?? body.lng);

    if (body.locationId) {
      const loc = await getPool().query(`SELECT id, state_id, lga_id, area_id FROM locations WHERE id = $1`, [
        body.locationId,
      ]);
      if (!loc.rows[0]) throw new AppError('Location not found.', 404, 'LOCATION_NOT_FOUND');
      if (!body.stateId) body.stateId = loc.rows[0].state_id;
      if (!body.lgaId) body.lgaId = loc.rows[0].lga_id;
      if (!body.areaId) body.areaId = loc.rows[0].area_id;
    }

    if (body.roadId) {
      const road = await getPool().query(`SELECT id, name FROM roads WHERE id = $1`, [body.roadId]);
      if (!road.rows[0]) throw new AppError('Road not found.', 404, 'NOT_FOUND');
      if (!body.roadName) body.roadName = road.rows[0].name;
    }

    if (body.roadSegmentId) {
      const seg = await getPool().query(
        `SELECT id, road_id FROM road_segments WHERE id = $1 AND is_active = TRUE`,
        [body.roadSegmentId]
      );
      if (!seg.rows[0]) throw new AppError('Road segment not found.', 404, 'NOT_FOUND');
      if (body.roadId && seg.rows[0].road_id !== body.roadId) {
        throw new AppError('Segment does not belong to the selected road.', 400, 'VALIDATION_ERROR');
      }
      if (!body.roadId) body.roadId = seg.rows[0].road_id;
    }

    const window = freshnessWindowForType(eventType);
    const observedAt = body.observedAt ? new Date(body.observedAt) : new Date();
    const expectedEnd =
      body.expectedEndAt || body.estimatedResolutionAt || null;
    const expiresAt = expectedEnd
      ? new Date(expectedEnd)
      : new Date(observedAt.getTime() + window.expire * 60_000);
    const freshness = computeFreshnessState({
      eventType,
      observedAt,
      expectedEndAt: expectedEnd,
      status,
      policy: window,
    });

    const result = await getPool().query(
      `INSERT INTO traffic_events (
         event_type, severity, status, title, description,
         road_id, road_segment_id, road_name, location_id, state_id, lga_id, area_id,
         direction, direction_label, latitude, longitude,
         started_at, observed_at, estimated_resolution_at, expected_end_at,
         published_at, expires_at, freshness_state, confidence,
         passability, flood_depth_cm, diversion_notes, attributes,
         source_classification, verification_status, related_official_update_id,
         created_by, updated_by
       ) VALUES (
         $1::traffic_event_type, $2::traffic_severity, $3::traffic_event_status, $4, $5,
         $6, $7, $8, $9, $10, $11, $12,
         $13::traffic_direction, $14, $15, $16,
         $17, $18, $19, $20,
         $21, $22, $23, $24::traffic_confidence,
         $25::traffic_passability, $26, $27, $28::jsonb,
         $29, $30, $31,
         $32, $32
       ) RETURNING id`,
      [
        eventType,
        severity,
        status,
        title.slice(0, 240),
        body.description ? String(body.description).trim().slice(0, 4000) : null,
        body.roadId || null,
        body.roadSegmentId || null,
        body.roadName ? String(body.roadName).trim().slice(0, 160) : null,
        body.locationId || null,
        body.stateId || null,
        body.lgaId || null,
        body.areaId || null,
        direction,
        body.directionLabel ? String(body.directionLabel).trim().slice(0, 160) : null,
        coords.latitude,
        coords.longitude,
        body.startedAt || observedAt,
        observedAt,
        expectedEnd,
        expectedEnd,
        body.publishedAt || new Date(),
        expiresAt,
        freshness,
        confidence,
        passability,
        body.floodDepthCm != null ? Number(body.floodDepthCm) : null,
        body.diversionNotes ? String(body.diversionNotes).trim().slice(0, 1000) : null,
        JSON.stringify(body.attributes && typeof body.attributes === 'object' ? body.attributes : {}),
        ['community', 'official', 'admin', 'mixed'].includes(body.sourceClassification)
          ? body.sourceClassification
          : 'admin',
        ['unverified', 'community_confirmed', 'officially_sourced', 'admin_verified'].includes(
          body.verificationStatus
        )
          ? body.verificationStatus
          : 'admin_verified',
        body.relatedOfficialUpdateId || null,
        admin?.userId || admin?.id || null,
      ]
    );

    const id = result.rows[0].id;

    if (body.reportId) {
      await this.linkReport(id, { reportId: body.reportId, reason: 'Linked at creation' }, admin, req);
    }

    await writeAudit(
      admin,
      {
        action: 'traffic_event.create',
        entityType: 'traffic_event',
        entityId: id,
        previousState: null,
        newState: { title, eventType, severity, status },
        reason: body.reason || 'Admin-created traffic event',
      },
      req
    );

    return this.get(id);
  },

  async update(id, body, admin, req) {
    if (!body.reason || String(body.reason).trim().length < 3) {
      throw new AppError('A reason is required.', 400, 'VALIDATION_ERROR');
    }
    const current = await this.get(id);
    const item = current.item;

    const next = {
      title: body.title !== undefined ? String(body.title).trim().slice(0, 240) : item.title,
      description:
        body.description !== undefined
          ? body.description
            ? String(body.description).trim().slice(0, 4000)
            : null
          : item.description,
      eventType: body.eventType !== undefined
        ? EVENT_TYPES.has(body.eventType)
          ? body.eventType
          : (() => {
              throw new AppError('Invalid event type.', 400, 'VALIDATION_ERROR');
            })()
        : item.eventType,
      severity: body.severity !== undefined
        ? SEVERITIES.has(body.severity)
          ? body.severity
          : (() => {
              throw new AppError('Invalid severity.', 400, 'VALIDATION_ERROR');
            })()
        : item.severity,
      status: body.status !== undefined
        ? EVENT_STATUSES.has(body.status)
          ? body.status
          : (() => {
              throw new AppError('Invalid status.', 400, 'VALIDATION_ERROR');
            })()
        : item.status,
      direction: body.direction !== undefined
        ? DIRECTIONS.has(body.direction)
          ? body.direction
          : (() => {
              throw new AppError('Invalid direction.', 400, 'VALIDATION_ERROR');
            })()
        : item.direction,
      directionLabel:
        body.directionLabel !== undefined
          ? body.directionLabel
            ? String(body.directionLabel).trim().slice(0, 160)
            : null
          : item.directionLabel,
      roadName:
        body.roadName !== undefined
          ? body.roadName
            ? String(body.roadName).trim().slice(0, 160)
            : null
          : item.roadName,
      roadId: body.roadId !== undefined ? body.roadId || null : item.roadId,
      roadSegmentId:
        body.roadSegmentId !== undefined ? body.roadSegmentId || null : item.roadSegmentId,
      locationId: body.locationId !== undefined ? body.locationId || null : item.locationId,
      relatedOfficialUpdateId:
        body.relatedOfficialUpdateId !== undefined
          ? body.relatedOfficialUpdateId || null
          : item.relatedOfficialUpdateId,
      estimatedResolutionAt:
        body.estimatedResolutionAt !== undefined
          ? body.estimatedResolutionAt
          : item.estimatedResolutionAt,
      expectedEndAt:
        body.expectedEndAt !== undefined
          ? body.expectedEndAt
          : item.expectedEndAt || item.estimatedResolutionAt,
      confidence:
        body.confidence !== undefined
          ? CONFIDENCES.has(body.confidence)
            ? body.confidence
            : (() => {
                throw new AppError('Invalid confidence.', 400, 'VALIDATION_ERROR');
              })()
          : item.confidence || 'medium',
      passability:
        body.passability !== undefined
          ? PASSABILITIES.has(body.passability)
            ? body.passability
            : (() => {
                throw new AppError('Invalid passability.', 400, 'VALIDATION_ERROR');
              })()
          : item.passability || 'unknown',
      floodDepthCm:
        body.floodDepthCm !== undefined
          ? body.floodDepthCm != null
            ? Number(body.floodDepthCm)
            : null
          : item.floodDepthCm,
      diversionNotes:
        body.diversionNotes !== undefined
          ? body.diversionNotes
            ? String(body.diversionNotes).trim().slice(0, 1000)
            : null
          : item.diversionNotes,
      verificationStatus:
        body.verificationStatus !== undefined
          ? body.verificationStatus
          : item.verificationStatus,
      sourceClassification:
        body.sourceClassification !== undefined
          ? body.sourceClassification
          : item.sourceClassification,
      flaggedDuplicate:
        body.flaggedDuplicate !== undefined
          ? Boolean(body.flaggedDuplicate)
          : item.flaggedDuplicate,
      duplicateOfEventId:
        body.duplicateOfEventId !== undefined
          ? body.duplicateOfEventId || null
          : item.duplicateOfEventId,
    };

    if (next.title.length < 3) throw new AppError('Title is required.', 400, 'VALIDATION_ERROR');

    let resolvedAt = item.resolvedAt;
    if (['resolved', 'rejected', 'cancelled'].includes(next.status) && item.status !== next.status) {
      resolvedAt = new Date();
    } else if (isLiveEventStatus(next.status)) {
      resolvedAt = null;
    }

    const window = freshnessWindowForType(next.eventType);
    const freshness = computeFreshnessState({
      eventType: next.eventType,
      observedAt: item.observedAt,
      startedAt: item.startedAt,
      updatedAt: new Date(),
      expectedEndAt: next.expectedEndAt,
      status: next.status,
      policy: window,
    });
    const expiresAt =
      next.expectedEndAt ||
      (item.observedAt
        ? new Date(new Date(item.observedAt).getTime() + window.expire * 60_000)
        : item.expiresAt);

    await getPool().query(
      `UPDATE traffic_events SET
         title = $2, description = $3,
         event_type = $4::traffic_event_type,
         severity = $5::traffic_severity,
         status = $6::traffic_event_status,
         direction = $7::traffic_direction,
         direction_label = $8,
         road_name = $9, road_id = $10, road_segment_id = $11, location_id = $12,
         related_official_update_id = $13,
         estimated_resolution_at = $14,
         expected_end_at = $15,
         resolved_at = $16,
         confidence = $17::traffic_confidence,
         passability = $18::traffic_passability,
         flood_depth_cm = $19,
         diversion_notes = $20,
         verification_status = $21,
         source_classification = $22,
         freshness_state = $23,
         expires_at = $24,
         flagged_duplicate = $25,
         duplicate_of_event_id = $26,
         updated_by = $27,
         updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        next.title,
        next.description,
        next.eventType,
        next.severity,
        next.status,
        next.direction,
        next.directionLabel,
        next.roadName,
        next.roadId,
        next.roadSegmentId,
        next.locationId,
        next.relatedOfficialUpdateId,
        next.estimatedResolutionAt || next.expectedEndAt,
        next.expectedEndAt,
        resolvedAt,
        next.confidence,
        next.passability,
        next.floodDepthCm,
        next.diversionNotes,
        next.verificationStatus,
        next.sourceClassification,
        freshness,
        expiresAt,
        next.flaggedDuplicate,
        next.duplicateOfEventId,
        admin?.userId || admin?.id || null,
      ]
    );

    await writeAudit(
      admin,
      {
        action: 'traffic_event.update',
        entityType: 'traffic_event',
        entityId: id,
        previousState: {
          title: item.title,
          eventType: item.eventType,
          severity: item.severity,
          status: item.status,
          direction: item.direction,
        },
        newState: {
          title: next.title,
          eventType: next.eventType,
          severity: next.severity,
          status: next.status,
          direction: next.direction,
        },
        reason: String(body.reason).trim(),
      },
      req
    );

    return this.get(id);
  },

  async resolve(id, { reason, status = 'resolved' } = {}, admin, req) {
    return this.update(
      id,
      {
        status: EVENT_STATUSES.has(status) ? status : 'resolved',
        reason: reason || 'Event resolved',
      },
      admin,
      req
    );
  },

  async linkReport(eventId, { reportId, reason } = {}, admin, req) {
    if (!reportId) throw new AppError('reportId is required.', 400, 'VALIDATION_ERROR');
    const event = await getPool().query(`SELECT id FROM traffic_events WHERE id = $1`, [eventId]);
    if (!event.rows[0]) throw new AppError('Traffic event not found.', 404, 'NOT_FOUND');

    const report = await getPool().query(
      `SELECT r.id, c.code AS category
       FROM reports r
       JOIN report_categories c ON c.id = r.category_id
       WHERE r.id = $1`,
      [reportId]
    );
    if (!report.rows[0]) throw new AppError('Report not found.', 404, 'NOT_FOUND');
    if (!['traffic', 'road_conditions', 'local_alerts'].includes(report.rows[0].category)) {
      throw new AppError('Only traffic-related reports can be linked.', 400, 'VALIDATION_ERROR');
    }

    await getPool().query(
      `INSERT INTO traffic_event_reports (event_id, report_id, linked_by, link_reason)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id, report_id) DO UPDATE
         SET link_reason = COALESCE(EXCLUDED.link_reason, traffic_event_reports.link_reason)`,
      [
        eventId,
        reportId,
        admin?.userId || admin?.id || null,
        reason ? String(reason).trim().slice(0, 500) : null,
      ]
    );

    await getPool().query(
      `UPDATE traffic_reports SET traffic_event_id = $2, updated_at = NOW()
       WHERE report_id = $1`,
      [reportId, eventId]
    );

    await writeAudit(
      admin,
      {
        action: 'traffic_event.link_report',
        entityType: 'traffic_event',
        entityId: eventId,
        previousState: null,
        newState: { reportId },
        reason: reason || 'Linked community/official report to event',
      },
      req
    );

    return this.get(eventId);
  },

  async unlinkReport(eventId, reportId, { reason } = {}, admin, req) {
    await getPool().query(
      `DELETE FROM traffic_event_reports WHERE event_id = $1 AND report_id = $2`,
      [eventId, reportId]
    );
    await getPool().query(
      `UPDATE traffic_reports SET traffic_event_id = NULL, updated_at = NOW()
       WHERE report_id = $1 AND traffic_event_id = $2`,
      [reportId, eventId]
    );
    await writeAudit(
      admin,
      {
        action: 'traffic_event.unlink_report',
        entityType: 'traffic_event',
        entityId: eventId,
        previousState: { reportId },
        newState: { reportId: null },
        reason: reason || 'Unlinked report from event',
      },
      req
    );
    return this.get(eventId);
  },

  async listRoads({ q, stateId, limit = 40 } = {}) {
    const params = [];
    const where = [`r.is_active = TRUE`];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(
        `(r.name ILIKE $${i} OR EXISTS (
           SELECT 1 FROM road_aliases ra WHERE ra.road_id = r.id AND ra.alias ILIKE $${i}
         ))`
      );
    }
    if (stateId) {
      params.push(stateId);
      where.push(`r.state_id = $${params.length}`);
    }
    const lim = Math.min(Number(limit) || 40, 100);
    params.push(lim);
    const result = await getPool().query(
      `SELECT r.id, r.name, r.road_type, r.state_id, r.lga_id, r.latitude, r.longitude,
              s.name AS state_name, l.name AS lga_name,
              (SELECT COUNT(*)::int FROM road_segments seg WHERE seg.road_id = r.id AND seg.is_active)
                AS segment_count,
              (SELECT array_agg(ra.alias ORDER BY ra.alias) FROM road_aliases ra WHERE ra.road_id = r.id)
                AS aliases
       FROM roads r
       LEFT JOIN states s ON s.id = r.state_id
       LEFT JOIN lgas l ON l.id = r.lga_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.name ASC
       LIMIT $${params.length}`,
      params
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        roadType: r.road_type,
        stateId: r.state_id,
        stateName: r.state_name,
        lgaId: r.lga_id,
        lgaName: r.lga_name,
        segmentCount: r.segment_count || 0,
        aliases: r.aliases || [],
        coordinates:
          r.latitude != null && r.longitude != null
            ? { lat: Number(r.latitude), lng: Number(r.longitude) }
            : null,
      })),
    };
  },

  async createRoadSegment(body, admin, req) {
    if (!body.roadId) throw new AppError('roadId is required.', 400, 'VALIDATION_ERROR');
    const name = String(body.name || '').trim();
    if (name.length < 2) throw new AppError('Segment name is required.', 400, 'VALIDATION_ERROR');
    const road = await getPool().query(`SELECT id, state_id, lga_id FROM roads WHERE id = $1`, [
      body.roadId,
    ]);
    if (!road.rows[0]) throw new AppError('Road not found.', 404, 'NOT_FOUND');

    const result = await getPool().query(
      `INSERT INTO road_segments (
         road_id, name, from_label, to_label, from_location_id, to_location_id,
         state_id, lga_id, sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        body.roadId,
        name.slice(0, 160),
        body.fromLabel ? String(body.fromLabel).trim().slice(0, 120) : null,
        body.toLabel ? String(body.toLabel).trim().slice(0, 120) : null,
        body.fromLocationId || null,
        body.toLocationId || null,
        body.stateId || road.rows[0].state_id,
        body.lgaId || road.rows[0].lga_id,
        Number(body.sortOrder) || 0,
      ]
    );

    await writeAudit(
      admin,
      {
        action: 'road_segment.create',
        entityType: 'road_segment',
        entityId: result.rows[0].id,
        previousState: null,
        newState: { roadId: body.roadId, name },
        reason: body.reason || 'Created road segment',
      },
      req
    );

    return { id: result.rows[0].id, roadId: body.roadId, name };
  },

  async addRoadAlias(roadId, { alias, reason } = {}, admin, req) {
    const text = String(alias || '').trim();
    if (text.length < 2) throw new AppError('Alias is required.', 400, 'VALIDATION_ERROR');
    const road = await getPool().query(`SELECT id FROM roads WHERE id = $1`, [roadId]);
    if (!road.rows[0]) throw new AppError('Road not found.', 404, 'NOT_FOUND');
    const result = await getPool().query(
      `INSERT INTO road_aliases (road_id, alias, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (road_id, normalized_alias) DO NOTHING
       RETURNING id, alias`,
      [roadId, text.slice(0, 160), admin?.userId || admin?.id || null]
    );
    await writeAudit(
      admin,
      {
        action: 'road.alias_add',
        entityType: 'road',
        entityId: roadId,
        previousState: null,
        newState: { alias: text },
        reason: reason || 'Added road alias',
      },
      req
    );
    return { id: result.rows[0]?.id || null, alias: text, roadId };
  },

  /**
   * Merge source events into a canonical survivor. Reports stay linked (provenance preserved).
   * Source rows are soft-closed via merged_into_event_id — never deleted.
   */
  async merge(survivorId, { sourceEventIds = [], reason } = {}, admin, req) {
    if (!reason || String(reason).trim().length < 3) {
      throw new AppError('A reason is required to merge events.', 400, 'VALIDATION_ERROR');
    }
    const sources = [...new Set((sourceEventIds || []).filter((id) => id && id !== survivorId))];
    if (!sources.length) {
      throw new AppError('Provide at least one source event to merge.', 400, 'VALIDATION_ERROR');
    }

    const survivor = await getPool().query(
      `SELECT id FROM traffic_events WHERE id = $1 AND merged_into_event_id IS NULL`,
      [survivorId]
    );
    if (!survivor.rows[0]) throw new AppError('Survivor event not found.', 404, 'NOT_FOUND');

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (const sourceId of sources) {
        const src = await client.query(
          `SELECT id FROM traffic_events WHERE id = $1 AND merged_into_event_id IS NULL`,
          [sourceId]
        );
        if (!src.rows[0]) {
          throw new AppError(`Source event ${sourceId} not found or already merged.`, 404, 'NOT_FOUND');
        }

        await client.query(
          `INSERT INTO traffic_event_reports (event_id, report_id, linked_by, link_reason)
           SELECT $1, ter.report_id, $3, $4
           FROM traffic_event_reports ter
           WHERE ter.event_id = $2
           ON CONFLICT (event_id, report_id) DO NOTHING`,
          [
            survivorId,
            sourceId,
            admin?.userId || admin?.id || null,
            `Merged from ${sourceId}`,
          ]
        );

        await client.query(
          `UPDATE traffic_reports SET traffic_event_id = $1, updated_at = NOW()
           WHERE traffic_event_id = $2`,
          [survivorId, sourceId]
        );

        await client.query(
          `UPDATE traffic_events SET
             merged_into_event_id = $1,
             status = 'expired'::traffic_event_status,
             freshness_state = 'historical',
             updated_by = $3,
             updated_at = NOW()
           WHERE id = $2`,
          [survivorId, sourceId, admin?.userId || admin?.id || null]
        );
      }

      await client.query(
        `UPDATE traffic_events SET
           source_classification = CASE
             WHEN source_classification = 'official' THEN source_classification
             ELSE 'mixed'
           END,
           confidence = 'high'::traffic_confidence,
           updated_by = $2,
           updated_at = NOW()
         WHERE id = $1`,
        [survivorId, admin?.userId || admin?.id || null]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await writeAudit(
      admin,
      {
        action: 'traffic_event.merge',
        entityType: 'traffic_event',
        entityId: survivorId,
        previousState: { sourceEventIds: sources },
        newState: { survivorId, mergedCount: sources.length },
        reason: String(reason).trim(),
      },
      req
    );

    return this.get(survivorId);
  },

  /**
   * Split linked reports into a new event (provenance preserved on both).
   */
  async split(eventId, { reportIds = [], title, reason, eventType, severity } = {}, admin, req) {
    if (!reason || String(reason).trim().length < 3) {
      throw new AppError('A reason is required to split events.', 400, 'VALIDATION_ERROR');
    }
    const ids = [...new Set((reportIds || []).filter(Boolean))];
    if (!ids.length) {
      throw new AppError('Select at least one report to move into the new event.', 400, 'VALIDATION_ERROR');
    }

    const parent = await this.get(eventId);
    const created = await this.create(
      {
        title: title || `${parent.item.title} (split)`,
        eventType: eventType || parent.item.eventType,
        severity: severity || parent.item.severity,
        direction: parent.item.direction,
        directionLabel: parent.item.directionLabel,
        roadId: parent.item.roadId,
        roadSegmentId: parent.item.roadSegmentId,
        roadName: parent.item.roadName,
        locationId: parent.item.locationId,
        stateId: parent.item.stateId,
        lgaId: parent.item.lgaId,
        areaId: parent.item.areaId,
        latitude: parent.item.coordinates?.lat,
        longitude: parent.item.coordinates?.lng,
        sourceClassification: parent.item.sourceClassification,
        verificationStatus: 'unverified',
        confidence: 'medium',
        reason: reason || 'Split from parent event',
      },
      admin,
      req
    );

    const newId = created.item.id;
    await getPool().query(
      `UPDATE traffic_events SET split_from_event_id = $2, updated_at = NOW() WHERE id = $1`,
      [newId, eventId]
    );

    for (const reportId of ids) {
      await this.unlinkReport(eventId, reportId, { reason: 'Moved during split' }, admin, req);
      await this.linkReport(newId, { reportId, reason: 'Moved during split' }, admin, req);
    }

    await writeAudit(
      admin,
      {
        action: 'traffic_event.split',
        entityType: 'traffic_event',
        entityId: eventId,
        previousState: { reportIds: ids },
        newState: { newEventId: newId },
        reason: String(reason).trim(),
      },
      req
    );

    return { parent: await this.get(eventId), child: await this.get(newId) };
  },

  async flagDuplicate(eventId, { duplicateOfEventId, reason } = {}, admin, req) {
    return this.update(
      eventId,
      {
        flaggedDuplicate: true,
        duplicateOfEventId: duplicateOfEventId || null,
        reason: reason || 'Flagged as potential duplicate — not auto-deleted',
      },
      admin,
      req
    );
  },

  /**
   * Flag potential duplicates for human review (never auto-delete).
   */
  async findDuplicateCandidates({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const result = await getPool().query(
      `SELECT a.id AS event_a, b.id AS event_b,
              a.title AS title_a, b.title AS title_b,
              a.event_type, a.road_id, a.road_name,
              a.observed_at AS observed_a, b.observed_at AS observed_b,
              a.latitude AS lat_a, a.longitude AS lng_a,
              b.latitude AS lat_b, b.longitude AS lng_b
       FROM traffic_events a
       JOIN traffic_events b
         ON a.id < b.id
        AND a.merged_into_event_id IS NULL
        AND b.merged_into_event_id IS NULL
        AND a.status IN (${LIVE_STATUSES_SQL})
        AND b.status IN (${LIVE_STATUSES_SQL})
        AND a.event_type = b.event_type
        AND (
          (a.road_id IS NOT NULL AND a.road_id = b.road_id)
          OR (
            a.road_name IS NOT NULL AND b.road_name IS NOT NULL
            AND lower(a.road_name) = lower(b.road_name)
          )
          OR (
            a.latitude IS NOT NULL AND b.latitude IS NOT NULL
            AND abs(a.latitude - b.latitude) < 0.02
            AND abs(a.longitude - b.longitude) < 0.02
          )
        )
        AND abs(
          EXTRACT(EPOCH FROM (COALESCE(a.observed_at, a.created_at) - COALESCE(b.observed_at, b.created_at)))
        ) < 7200
       ORDER BY COALESCE(a.observed_at, a.created_at) DESC
       LIMIT $1`,
      [lim]
    );

    return {
      items: result.rows.map((r) => ({
        eventA: r.event_a,
        eventB: r.event_b,
        titleA: r.title_a,
        titleB: r.title_b,
        eventType: r.event_type,
        roadId: r.road_id,
        roadName: r.road_name,
        observedA: r.observed_a,
        observedB: r.observed_b,
        note: 'Potential duplicate — review before merge. Do not auto-delete.',
      })),
      note: 'Candidates for human review — not auto-merged or deleted.',
    };
  },

  /**
   * Recompute confidence from linked evidence (band, not certainty).
   */
  async recomputeConfidence(eventId) {
    const detail = await this.get(eventId);
    const item = detail.item;
    let score = 0;
    if (item.sourceClassification === 'official' || item.verificationStatus === 'officially_sourced') {
      score += 3;
    }
    if (item.verificationStatus === 'admin_verified') score += 2;
    if (item.verificationStatus === 'community_confirmed') score += 1;
    if (item.reportCount >= 3) score += 2;
    else if (item.reportCount >= 2) score += 1;
    if (detail.evidence?.accurateConfirmations >= 2) score += 1;
    if (item.freshnessState === 'fresh') score += 1;
    if (item.freshnessState === 'stale' || item.freshnessState === 'expired') score -= 1;

    const confidence = score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low';
    await getPool().query(
      `UPDATE traffic_events SET confidence = $2::traffic_confidence, updated_at = NOW() WHERE id = $1`,
      [eventId, confidence]
    );
    return { eventId, confidence, score, note: 'Confidence is an operational band, not mathematical certainty.' };
  },

  /**
   * Expire live events past type-specific windows. Preserves history (status=expired).
   */
  async expireStaleEvents({ limit = 200 } = {}) {
    const lim = Math.min(Number(limit) || 200, 500);
    const result = await getPool().query(
      `WITH candidates AS (
         SELECT e.id,
                e.event_type,
                e.expected_end_at,
                e.estimated_resolution_at,
                e.expires_at,
                COALESCE(e.observed_at, e.started_at, e.updated_at) AS anchor,
                COALESCE(p.expire_minutes, 360) AS expire_minutes
         FROM traffic_events e
         LEFT JOIN traffic_event_freshness_policies p ON p.event_type = e.event_type
         WHERE e.status IN (${LIVE_STATUSES_SQL})
           AND e.merged_into_event_id IS NULL
         LIMIT $1
       ),
       to_expire AS (
         SELECT id FROM candidates
         WHERE
           (COALESCE(expected_end_at, estimated_resolution_at) IS NOT NULL
             AND COALESCE(expected_end_at, estimated_resolution_at) <= NOW())
           OR (expires_at IS NOT NULL AND expires_at <= NOW())
           OR (anchor + make_interval(mins => expire_minutes) <= NOW())
       )
       UPDATE traffic_events e
       SET status = 'expired'::traffic_event_status,
           freshness_state = 'expired',
           updated_at = NOW()
       FROM to_expire t
       WHERE e.id = t.id
       RETURNING e.id, e.event_type`,
      [lim]
    );

    // Soft freshness refresh for still-live rows
    await getPool().query(
      `UPDATE traffic_events e
       SET freshness_state = CASE
         WHEN COALESCE(e.observed_at, e.started_at, e.updated_at)
              > NOW() - make_interval(mins => COALESCE(p.fresh_minutes, 45))
           THEN 'fresh'
         WHEN COALESCE(e.observed_at, e.started_at, e.updated_at)
              > NOW() - make_interval(mins => COALESCE(p.stale_minutes, 120))
           THEN 'aging'
         ELSE 'stale'
       END,
       updated_at = e.updated_at
       FROM traffic_event_freshness_policies p
       WHERE p.event_type = e.event_type
         AND e.status IN (${LIVE_STATUSES_SQL})
         AND e.merged_into_event_id IS NULL`
    ).catch(() => null);

    return {
      expired: result.rowCount || 0,
      items: result.rows.map((r) => ({ id: r.id, eventType: r.event_type })),
    };
  },

  /**
   * Public active events for map/list — excludes merged/historical/expired.
   * Does not expose reporter private coordinates.
   */
  async listPublic({
    locationId,
    stateId,
    lgaId,
    road,
    eventType,
    q,
    lat,
    lng,
    radiusKm = 15,
    bbox,
    limit = 60,
  } = {}) {
    const params = [];
    const where = [
      `e.status IN (${LIVE_STATUSES_SQL})`,
      `e.merged_into_event_id IS NULL`,
      `e.freshness_state <> 'expired'`,
    ];

    if (locationId) {
      params.push(locationId);
      where.push(`e.location_id = $${params.length}`);
    }
    if (stateId) {
      params.push(stateId);
      where.push(`COALESCE(e.state_id, loc.state_id) = $${params.length}`);
    }
    if (lgaId) {
      params.push(lgaId);
      where.push(`COALESCE(e.lga_id, loc.lga_id) = $${params.length}`);
    }
    if (eventType && EVENT_TYPES.has(eventType)) {
      params.push(eventType);
      where.push(`e.event_type = $${params.length}::traffic_event_type`);
    }
    if (road) {
      params.push(`%${String(road).trim()}%`);
      where.push(`(e.road_name ILIKE $${params.length} OR rd.name ILIKE $${params.length})`);
    }
    if (q) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(
        `(e.title ILIKE $${i} OR e.road_name ILIKE $${i} OR loc.name ILIKE $${i} OR e.direction_label ILIKE $${i})`
      );
    }
    if (lat != null && lng != null) {
      const latitude = Number(lat);
      const longitude = Number(lng);
      const radius = Math.min(Math.max(Number(radiusKm) || 15, 1), 80);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        const deg = radius / 111;
        params.push(latitude, longitude, deg);
        const i = params.length;
        where.push(
          `e.latitude IS NOT NULL AND e.longitude IS NOT NULL
           AND e.latitude BETWEEN $${i - 2} - $${i} AND $${i - 2} + $${i}
           AND e.longitude BETWEEN $${i - 1} - $${i} AND $${i - 1} + $${i}`
        );
      }
    }
    if (bbox && typeof bbox === 'object') {
      const { west, south, east, north } = bbox;
      if ([west, south, east, north].every((n) => Number.isFinite(Number(n)))) {
        params.push(Number(south), Number(north), Number(west), Number(east));
        const i = params.length;
        where.push(
          `e.latitude BETWEEN $${i - 3} AND $${i - 2}
           AND e.longitude BETWEEN $${i - 1} AND $${i}`
        );
      }
    }

    const lim = Math.min(Number(limit) || 60, 150);
    params.push(lim);

    const result = await getPool().query(
      `SELECT ${SELECT} ${JOINS}
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE e.severity
           WHEN 'blocked' THEN 0 WHEN 'standstill' THEN 1 WHEN 'heavy' THEN 2
           WHEN 'moderate' THEN 3 ELSE 4 END,
         COALESCE(e.observed_at, e.updated_at) DESC
       LIMIT $${params.length}`,
      params
    );

    const items = result.rows.map(mapEvent);
    return {
      items,
      total: items.length,
      asOf: new Date().toISOString(),
      note: 'Live traffic events only. Cached copies must not be labeled as live.',
      geojson: {
        type: 'FeatureCollection',
        features: items
          .filter((e) => e.coordinates)
          .map((e) => ({
            type: 'Feature',
            id: e.id,
            geometry: {
              type: 'Point',
              coordinates: [e.coordinates.lng, e.coordinates.lat],
            },
            properties: {
              id: e.id,
              title: e.title,
              eventType: e.eventType,
              severity: e.severity,
              severityLabel: e.severityBand?.label,
              impactLabel: e.impactSeverity?.label,
              status: e.status,
              roadName: e.roadName,
              directionLabel: e.directionLabel,
              sourceLabel: e.sourceLabel,
              freshnessState: e.freshnessState,
              observedLabel: e.observedLabel,
              confidence: e.confidence,
            },
          })),
      },
    };
  },

  /**
   * Public event detail — no private reporter identity.
   */
  async getPublic(id) {
    const result = await getPool().query(`SELECT ${SELECT} ${JOINS} WHERE e.id = $1`, [id]);
    if (!result.rows[0]) throw new AppError('Traffic event not found.', 404, 'NOT_FOUND');
    const item = mapEvent(result.rows[0]);

    const linked = await getPool().query(
      `SELECT r.id AS report_id, r.title, r.source_type, r.status,
              r.created_at, r.last_confirmed_at,
              r.confirmed_accurate_count, r.confirmed_inaccurate_count,
              t.severity, t.cause, t.road_name, t.direction_label
       FROM traffic_event_reports ter
       JOIN reports r ON r.id = ter.report_id
       LEFT JOIN traffic_reports t ON t.report_id = r.id
       WHERE ter.event_id = $1
         AND r.visibility = 'public'
         AND r.status <> 'removed'
       ORDER BY COALESCE(r.last_confirmed_at, r.created_at) DESC
       LIMIT 40`,
      [id]
    );

    return {
      event: item,
      relatedReports: linked.rows.map((row) => ({
        reportId: row.report_id,
        title: row.title,
        sourceType: row.source_type,
        status: row.status,
        severity: row.severity,
        cause: row.cause,
        roadName: row.road_name,
        directionLabel: row.direction_label,
        createdAt: row.created_at,
        lastConfirmedAt: row.last_confirmed_at,
        confirmations: {
          accurate: Number(row.confirmed_accurate_count || 0),
          inaccurate: Number(row.confirmed_inaccurate_count || 0),
        },
      })),
      asOf: new Date().toISOString(),
      note: 'Snapshot only — cached copies must not be labeled as live traffic.',
    };
  },

  /**
   * Correlate a community traffic report into a traffic_event (create or link).
   * Review-friendly: never auto-merges uncertain distant incidents.
   */
  async correlateCommunityReport({
    reportId,
    trafficId,
    locationId,
    severity,
    cause,
    roadId,
    roadName,
    directionLabel,
    title,
    description,
    latitude,
    longitude,
  } = {}) {
    if (!reportId) return null;

    const eventType = causeToEventType(cause, severity);
    const params = [eventType];
    const where = [
      `e.event_type = $1::traffic_event_type`,
      `e.status IN (${LIVE_STATUSES_SQL})`,
      `e.merged_into_event_id IS NULL`,
      `e.freshness_state <> 'expired'`,
      `e.observed_at >= NOW() - INTERVAL '3 hours'`,
    ];
    if (roadId) {
      params.push(roadId);
      where.push(`e.road_id = $${params.length}`);
    } else if (roadName) {
      params.push(String(roadName).trim().toLowerCase());
      where.push(`lower(COALESCE(e.road_name, '')) = $${params.length}`);
    } else if (locationId) {
      params.push(locationId);
      where.push(`e.location_id = $${params.length}`);
    } else {
      return this.create(
        {
          eventType,
          severity: severity || 'unknown',
          status: 'active',
          title: title || 'Community traffic update',
          description: description || null,
          locationId: locationId || null,
          roadId: roadId || null,
          roadName: roadName || null,
          directionLabel: directionLabel || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          reportId,
          sourceClassification: 'community',
          verificationStatus: 'unverified',
          confidence: 'low',
        },
        { userId: null },
        null
      );
    }

    if (latitude != null && longitude != null && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))) {
      params.push(Number(latitude), Number(longitude));
      const i = params.length;
      where.push(
        `(e.latitude IS NULL OR e.longitude IS NULL OR (
           abs(e.latitude - $${i - 1}) < 0.02 AND abs(e.longitude - $${i}) < 0.02
         ))`
      );
    }

    params.push(1);
    const existing = await getPool().query(
      `SELECT e.id FROM traffic_events e
       WHERE ${where.join(' AND ')}
       ORDER BY e.observed_at DESC
       LIMIT $${params.length}`,
      params
    );

    if (existing.rows[0]) {
      await this.linkReport(
        existing.rows[0].id,
        { reportId, reason: 'Correlated community report' },
        { userId: null },
        null
      );
      if (trafficId) {
        await getPool().query(
          `UPDATE traffic_reports SET traffic_event_id = $2, updated_at = NOW() WHERE id = $1`,
          [trafficId, existing.rows[0].id]
        );
      }
      return this.get(existing.rows[0].id);
    }

    return this.create(
      {
        eventType,
        severity: severity || 'unknown',
        status: 'active',
        title: title || 'Community traffic update',
        description: description || null,
        locationId: locationId || null,
        roadId: roadId || null,
        roadName: roadName || null,
        directionLabel: directionLabel || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        reportId,
        sourceClassification: 'community',
        verificationStatus: 'unverified',
        confidence: 'low',
      },
      { userId: null },
      null
    );
  },
};

function causeToEventType(cause, severity) {
  const map = {
    accident: 'accident',
    vehicle_breakdown: 'vehicle_breakdown',
    flooding: 'flooding',
    construction: 'construction',
    roadworks: 'construction',
    lane_closure: 'lane_restriction',
    security_incident: 'security_incident',
    event: 'other',
    unknown: 'congestion',
    other: 'other',
  };
  if (map[cause]) return map[cause];
  if (severity === 'blocked') return 'road_closure';
  if (severity === 'standstill' || severity === 'heavy') return 'congestion';
  return 'congestion';
}

export default trafficEventAdminService;
