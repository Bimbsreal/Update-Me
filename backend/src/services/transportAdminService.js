/**
 * Admin transport operations — routes, stops, fare observations.
 * Information layer only; not a booking platform.
 */
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import { transportRepository } from '../repositories/transportRepository.js';
import { FARE_PERIODS } from '../config/trafficIntelligence.js';
import { isWithinNigeriaBounds } from '../utils/geoBounds.js';

const MODES = new Set([
  'bus',
  'brt',
  'danfo',
  'minibus',
  'keke',
  'okada',
  'taxi',
  'train',
  'ferry',
  'other',
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
  if (sourceType === 'official') return 'Official / reference';
  if (status === 'confirmed' || Number(confirmedCount) > 0) return 'Verified fare';
  return 'Reported fare';
}

function freshnessLabel(status, expiresAt, lastConfirmedAt, occurredAt, createdAt, staleAfter = 120) {
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

export const transportAdminService = {
  async dashboard() {
    const pool = getPool();
    const [routes, inactive, stops, faresToday, staleFares, conflicts, missingLoc, unverified] =
      await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS c FROM transport_routes WHERE is_active = TRUE`),
        pool.query(`SELECT COUNT(*)::int AS c FROM transport_routes WHERE is_active = FALSE`),
        pool.query(`SELECT COUNT(*)::int AS c FROM transport_route_stops`),
        pool.query(
          `SELECT COUNT(*)::int AS c
           FROM transport_fare_reports tfr
           JOIN reports r ON r.id = tfr.report_id
           WHERE r.created_at >= date_trunc('day', NOW())
             AND r.status <> 'removed'`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c
           FROM transport_fare_reports tfr
           JOIN reports r ON r.id = tfr.report_id
           WHERE r.status IN ('stale','expired')
              OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW())`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM (
             SELECT tfr.route_id, tfr.transport_mode
             FROM transport_fare_reports tfr
             JOIN reports r ON r.id = tfr.report_id
             WHERE r.status IN ('submitted','active','confirmed','stale')
               AND r.created_at >= NOW() - INTERVAL '14 days'
             GROUP BY tfr.route_id, tfr.transport_mode
             HAVING MAX(tfr.fare_amount) - MIN(tfr.fare_amount) >= 50
                AND COUNT(*) >= 2
           ) x`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c
           FROM transport_route_stops s
           WHERE s.location_id IS NULL`
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c
           FROM transport_fare_reports tfr
           JOIN reports r ON r.id = tfr.report_id
           WHERE r.moderation_state IN ('flagged','queued','in_review','escalated')
              OR r.status IN ('flagged','under_review')`
        ),
      ]);

    return {
      activeRoutes: routes.rows[0]?.c || 0,
      inactiveRoutes: inactive.rows[0]?.c || 0,
      busStops: stops.rows[0]?.c || 0,
      fareObservationsToday: faresToday.rows[0]?.c || 0,
      staleOrExpiredFares: staleFares.rows[0]?.c || 0,
      conflictingFareGroups: conflicts.rows[0]?.c || 0,
      stopsMissingLocation: missingLoc.rows[0]?.c || 0,
      unverifiedSubmissions: unverified.rows[0]?.c || 0,
    };
  },

  async listRoutes({
    q,
    stateId,
    lgaId,
    mode,
    active,
    page = 1,
    limit = 30,
  } = {}) {
    const params = [];
    const where = [];

    if (q) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(
        `(tr.name ILIKE $${i} OR o.name ILIKE $${i} OR d.name ILIKE $${i} OR tr.primary_mode::text ILIKE $${i})`
      );
    }
    if (stateId) {
      params.push(stateId);
      where.push(`(o.state_id = $${params.length} OR d.state_id = $${params.length})`);
    }
    if (lgaId) {
      params.push(lgaId);
      where.push(`(o.lga_id = $${params.length} OR d.lga_id = $${params.length})`);
    }
    if (mode && MODES.has(mode)) {
      params.push(mode);
      where.push(`tr.primary_mode = $${params.length}::transport_mode`);
    }
    if (active === true || active === 'true') where.push(`tr.is_active = TRUE`);
    if (active === false || active === 'false') where.push(`tr.is_active = FALSE`);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);

    const result = await getPool().query(
      `SELECT tr.id, tr.name, tr.primary_mode, tr.is_active, tr.updated_at, tr.created_at,
              tr.origin_location_id, tr.destination_location_id,
              o.name AS origin_name, d.name AS destination_name,
              os.name AS origin_state, ds.name AS destination_state,
              ol.name AS origin_lga, dl.name AS destination_lga,
              (SELECT COUNT(*)::int FROM transport_route_stops s WHERE s.route_id = tr.id) AS stop_count,
              (SELECT MAX(COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at))
               FROM transport_fare_reports tfr
               JOIN reports r ON r.id = tfr.report_id
               WHERE tfr.route_id = tr.id AND r.status <> 'removed') AS last_fare_at
       FROM transport_routes tr
       JOIN locations o ON o.id = tr.origin_location_id
       JOIN locations d ON d.id = tr.destination_location_id
       LEFT JOIN states os ON os.id = o.state_id
       LEFT JOIN states ds ON ds.id = d.state_id
       LEFT JOIN lgas ol ON ol.id = o.lga_id
       LEFT JOIN lgas dl ON dl.id = d.lga_id
       ${whereSql}
       ORDER BY tr.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total
       FROM transport_routes tr
       JOIN locations o ON o.id = tr.origin_location_id
       JOIN locations d ON d.id = tr.destination_location_id
       ${whereSql}`,
      params.slice(0, -2)
    );

    return {
      items: result.rows.map((r) => ({
        id: r.id,
        name:
          r.name ||
          (r.origin_name && r.destination_name
            ? `${r.origin_name} → ${r.destination_name}`
            : 'Unnamed route'),
        mode: r.primary_mode,
        isActive: r.is_active,
        stopCount: r.stop_count || 0,
        origin: {
          id: r.origin_location_id,
          name: r.origin_name,
          state: r.origin_state,
          lga: r.origin_lga,
        },
        destination: {
          id: r.destination_location_id,
          name: r.destination_name,
          state: r.destination_state,
          lga: r.destination_lga,
        },
        lastFareAt: r.last_fare_at,
        updatedAt: r.updated_at,
        createdAt: r.created_at,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async getRoute(id) {
    const route = await transportRepository.findRouteById(id);
    if (!route) throw new AppError('Transport route not found.', 404, 'NOT_FOUND');

    const [fares, audits, fareStats] = await Promise.all([
      transportRepository.listFares({ routeId: id, freshness: 'any', page: 1, limit: 40 }),
      getPool()
        .query(
          `SELECT action, reason, previous_state, new_state, created_at
           FROM admin_audit_log
           WHERE entity_type = 'transport_route' AND entity_id = $1
           ORDER BY created_at DESC LIMIT 20`,
          [id]
        )
        .catch(() => ({ rows: [] })),
      getPool().query(
        `SELECT tfr.fare_amount::float AS amount, r.source_type, r.status,
                r.confirmed_accurate_count, r.created_at, r.occurred_at
         FROM transport_fare_reports tfr
         JOIN reports r ON r.id = tfr.report_id
         WHERE tfr.route_id = $1 AND r.status <> 'removed'
         ORDER BY COALESCE(r.occurred_at, r.created_at) ASC
         LIMIT 100`,
        [id]
      ),
    ]);

    const amounts = fareStats.rows.map((r) => Number(r.amount));
    const variation =
      amounts.length >= 2
        ? {
            min: Math.min(...amounts),
            max: Math.max(...amounts),
            count: amounts.length,
            spread: Math.max(...amounts) - Math.min(...amounts),
          }
        : amounts.length === 1
          ? { min: amounts[0], max: amounts[0], count: 1, spread: 0 }
          : null;

    const mapPoints = [];
    if (route.origin?.coordinates) {
      mapPoints.push({
        role: 'origin',
        label: route.origin.name,
        ...route.origin.coordinates,
      });
    }
    const stopLocIds = (route.stops || [])
      .map((s) => s.location?.id)
      .filter(Boolean);
    if (stopLocIds.length) {
      const locRows = await getPool().query(
        `SELECT id, name, latitude, longitude FROM locations WHERE id = ANY($1::uuid[])`,
        [stopLocIds]
      );
      const byId = new Map(locRows.rows.map((r) => [r.id, r]));
      for (const stop of route.stops || []) {
        const row = stop.location?.id ? byId.get(stop.location.id) : null;
        if (row?.latitude != null && row?.longitude != null) {
          mapPoints.push({
            role: 'stop',
            label: stop.label || row.name,
            lat: Number(row.latitude),
            lng: Number(row.longitude),
          });
        }
      }
    }
    if (route.destination?.coordinates) {
      mapPoints.push({
        role: 'destination',
        label: route.destination.name,
        ...route.destination.coordinates,
      });
    }

    return {
      route,
      fares: fares.items.map((f) => ({
        ...f,
        trustLabel: trustLabel(
          f.report?.sourceType,
          f.report?.status,
          f.report?.confirmation?.stillAccurate
        ),
        freshness:
          f.report?.freshness ||
          freshnessLabel(f.report?.status, f.report?.expiresAt, null, f.report?.occurredAt, f.createdAt),
      })),
      fareTotal: fares.total,
      fareVariation: variation,
      fareHistoryPoints: fareStats.rows.map((r) => ({
        amount: Number(r.amount),
        sourceType: r.source_type,
        status: r.status,
        at: r.occurred_at || r.created_at,
        trustLabel: trustLabel(r.source_type, r.status, r.confirmed_accurate_count),
      })),
      mapPoints,
      adminActivity: audits.rows.map((a) => ({
        action: a.action,
        reason: a.reason,
        previousState: a.previous_state,
        newState: a.new_state,
        createdAt: a.created_at,
      })),
      note: 'Fare observations are community/reference reports — not a guaranteed universal fare.',
    };
  },

  async updateRoute(id, body, admin, req) {
    const prev = await getPool().query(
      `SELECT id, name, primary_mode, is_active, origin_location_id, destination_location_id
       FROM transport_routes WHERE id = $1`,
      [id]
    );
    if (!prev.rows[0]) throw new AppError('Transport route not found.', 404, 'NOT_FOUND');
    const row = prev.rows[0];

    if (!body.reason || String(body.reason).trim().length < 3) {
      throw new AppError('A correction reason is required.', 400, 'VALIDATION_ERROR');
    }

    const nextName =
      body.name !== undefined
        ? body.name
          ? String(body.name).trim().slice(0, 160)
          : null
        : row.name;
    const nextMode =
      body.primaryMode !== undefined || body.mode !== undefined
        ? (() => {
            const m = body.primaryMode ?? body.mode;
            if (m === null || m === '') return null;
            if (!MODES.has(m)) throw new AppError('Invalid transport mode.', 400, 'VALIDATION_ERROR');
            return m;
          })()
        : row.primary_mode;
    const nextActive =
      body.isActive != null ? Boolean(body.isActive) : row.is_active;

    await getPool().query(
      `UPDATE transport_routes SET
         name = $2,
         primary_mode = $3::transport_mode,
         is_active = $4,
         updated_at = NOW()
       WHERE id = $1`,
      [id, nextName, nextMode, nextActive]
    );

    await writeAudit(
      admin,
      {
        action: 'transport_route.update',
        entityType: 'transport_route',
        entityId: id,
        previousState: {
          name: row.name,
          primaryMode: row.primary_mode,
          isActive: row.is_active,
        },
        newState: { name: nextName, primaryMode: nextMode, isActive: nextActive },
        reason: String(body.reason).trim(),
      },
      req
    );

    return this.getRoute(id);
  },

  async setRouteActive(id, { isActive, reason }, admin, req) {
    return this.updateRoute(id, { isActive, reason: reason || 'Route status updated' }, admin, req);
  },

  async listStops({ q, stateId, lgaId, routeId, page = 1, limit = 30 } = {}) {
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(`(s.label ILIKE $${i} OR loc.name ILIKE $${i} OR tr.name ILIKE $${i})`);
    }
    if (stateId) {
      params.push(stateId);
      where.push(`loc.state_id = $${params.length}`);
    }
    if (lgaId) {
      params.push(lgaId);
      where.push(`loc.lga_id = $${params.length}`);
    }
    if (routeId) {
      params.push(routeId);
      where.push(`s.route_id = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);

    const result = await getPool().query(
      `SELECT s.id, s.route_id, s.stop_order, s.label, s.location_id, s.created_at,
              loc.name AS location_name, loc.latitude, loc.longitude,
              st.name AS state_name, lg.name AS lga_name, ar.name AS area_name,
              tr.name AS route_name,
              o.name AS origin_name, d.name AS destination_name
       FROM transport_route_stops s
       JOIN transport_routes tr ON tr.id = s.route_id
       JOIN locations o ON o.id = tr.origin_location_id
       JOIN locations d ON d.id = tr.destination_location_id
       LEFT JOIN locations loc ON loc.id = s.location_id
       LEFT JOIN states st ON st.id = loc.state_id
       LEFT JOIN lgas lg ON lg.id = loc.lga_id
       LEFT JOIN areas ar ON ar.id = loc.area_id
       ${whereSql}
       ORDER BY tr.name NULLS LAST, s.stop_order ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total
       FROM transport_route_stops s
       JOIN transport_routes tr ON tr.id = s.route_id
       LEFT JOIN locations loc ON loc.id = s.location_id
       ${whereSql}`,
      params.slice(0, -2)
    );

    return {
      items: result.rows.map((r) => ({
        id: r.id,
        routeId: r.route_id,
        routeName:
          r.route_name ||
          (r.origin_name && r.destination_name
            ? `${r.origin_name} → ${r.destination_name}`
            : 'Route'),
        stopOrder: r.stop_order,
        name: r.label || r.location_name || `Stop ${r.stop_order}`,
        label: r.label,
        locationId: r.location_id,
        locationName: r.location_name,
        state: r.state_name,
        lga: r.lga_name,
        area: r.area_name,
        coordinates:
          r.latitude != null && r.longitude != null
            ? { lat: Number(r.latitude), lng: Number(r.longitude) }
            : null,
        createdAt: r.created_at,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async updateStop(id, body, admin, req) {
    const prev = await getPool().query(
      `SELECT id, route_id, stop_order, label, location_id FROM transport_route_stops WHERE id = $1`,
      [id]
    );
    if (!prev.rows[0]) throw new AppError('Bus stop not found.', 404, 'NOT_FOUND');
    if (!body.reason || String(body.reason).trim().length < 3) {
      throw new AppError('A correction reason is required.', 400, 'VALIDATION_ERROR');
    }

    const row = prev.rows[0];
    const nextLabel =
      body.label !== undefined
        ? body.label
          ? String(body.label).trim().slice(0, 160)
          : null
        : row.label;
    const nextLocationId =
      body.locationId !== undefined ? body.locationId || null : row.location_id;

    if (!nextLabel && !nextLocationId) {
      throw new AppError('A stop needs a label or location.', 400, 'VALIDATION_ERROR');
    }

    await getPool().query(
      `UPDATE transport_route_stops SET label = $2, location_id = $3 WHERE id = $1`,
      [id, nextLabel, nextLocationId]
    );

    await writeAudit(
      admin,
      {
        action: 'transport_stop.update',
        entityType: 'transport_stop',
        entityId: id,
        previousState: { label: row.label, locationId: row.location_id },
        newState: { label: nextLabel, locationId: nextLocationId, routeId: row.route_id },
        reason: String(body.reason).trim(),
      },
      req
    );

    const listed = await this.listStops({ routeId: row.route_id, limit: 100 });
    return listed.items.find((s) => s.id === id) || null;
  },

  async listFares({
    q,
    routeId,
    mode,
    status,
    sourceType,
    freshness,
    page = 1,
    limit = 30,
  } = {}) {
    const params = [];
    const where = [`r.status <> 'removed'`];

    if (q) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(
        `(tr.name ILIKE $${i} OR oloc.name ILIKE $${i} OR dloc.name ILIKE $${i}
          OR tfr.boarding_point_label ILIKE $${i} OR r.title ILIKE $${i})`
      );
    }
    if (routeId) {
      params.push(routeId);
      where.push(`tfr.route_id = $${params.length}`);
    }
    if (mode && MODES.has(mode)) {
      params.push(mode);
      where.push(`tfr.transport_mode = $${params.length}::transport_mode`);
    }
    if (status) {
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
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);

    const result = await getPool().query(
      `SELECT tfr.id, tfr.route_id, tfr.transport_mode, tfr.fare_amount, tfr.fare_currency,
              tfr.fare_unit, tfr.boarding_point_label, tfr.alighting_point_label,
              tfr.created_at AS fare_created_at,
              tr.name AS route_name,
              oloc.name AS origin_name, dloc.name AS destination_name,
              r.id AS report_id, r.source_type, r.status, r.moderation_state,
              r.confirmed_accurate_count, r.occurred_at, r.expires_at, r.created_at, r.updated_at,
              r.last_confirmed_at, u.display_name AS author_display_name, p.stale_after_minutes
       FROM transport_fare_reports tfr
       JOIN transport_routes tr ON tr.id = tfr.route_id
       JOIN reports r ON r.id = tfr.report_id
       JOIN locations oloc ON oloc.id = tfr.origin_location_id
       JOIN locations dloc ON dloc.id = tfr.destination_location_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
       ${whereSql}
       ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total
       FROM transport_fare_reports tfr
       JOIN transport_routes tr ON tr.id = tfr.route_id
       JOIN reports r ON r.id = tfr.report_id
       JOIN locations oloc ON oloc.id = tfr.origin_location_id
       JOIN locations dloc ON dloc.id = tfr.destination_location_id
       ${whereSql}`,
      params.slice(0, -2)
    );

    return {
      items: result.rows.map((r) => ({
        id: r.id,
        routeId: r.route_id,
        routeName:
          r.route_name ||
          (r.origin_name && r.destination_name
            ? `${r.origin_name} → ${r.destination_name}`
            : 'Route'),
        mode: r.transport_mode,
        fare: {
          amount: Number(r.fare_amount),
          currency: r.fare_currency || 'NGN',
          unit: r.fare_unit || 'trip',
        },
        origin: r.origin_name,
        destination: r.destination_name,
        boardingPoint: r.boarding_point_label,
        alightingPoint: r.alighting_point_label,
        sourceType: r.source_type,
        status: r.status,
        moderationState: r.moderation_state,
        freshness: freshnessLabel(
          r.status,
          r.expires_at,
          r.last_confirmed_at,
          r.occurred_at,
          r.created_at,
          r.stale_after_minutes || 120
        ),
        trustLabel: trustLabel(r.source_type, r.status, r.confirmed_accurate_count),
        authorDisplayName: r.author_display_name,
        reportId: r.report_id,
        occurredAt: r.occurred_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
      note: 'Multiple observations may differ — variation is shown, not auto-resolved.',
    };
  },

  async listFareConflicts({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const result = await getPool().query(
      `SELECT tfr.route_id, tfr.transport_mode,
              MIN(tfr.fare_amount)::float AS min_fare,
              MAX(tfr.fare_amount)::float AS max_fare,
              COUNT(*)::int AS observation_count,
              array_agg(tfr.fare_amount::float ORDER BY r.created_at DESC) AS amounts,
              MAX(tr.name) AS route_name,
              MAX(oloc.name) AS origin_name,
              MAX(dloc.name) AS destination_name,
              MAX(COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)) AS most_recent_at
       FROM transport_fare_reports tfr
       JOIN transport_routes tr ON tr.id = tfr.route_id
       JOIN reports r ON r.id = tfr.report_id
       JOIN locations oloc ON oloc.id = tfr.origin_location_id
       JOIN locations dloc ON dloc.id = tfr.destination_location_id
       WHERE r.status IN ('submitted','active','confirmed','stale')
         AND r.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY tfr.route_id, tfr.transport_mode
       HAVING MAX(tfr.fare_amount) - MIN(tfr.fare_amount) >= 50
          AND COUNT(*) >= 2
       ORDER BY (MAX(tfr.fare_amount) - MIN(tfr.fare_amount)) DESC
       LIMIT $1`,
      [lim]
    );

    return {
      items: result.rows.map((r) => ({
        routeId: r.route_id,
        routeName:
          r.route_name ||
          (r.origin_name && r.destination_name
            ? `${r.origin_name} → ${r.destination_name}`
            : 'Route'),
        mode: r.transport_mode,
        min: r.min_fare,
        max: r.max_fare,
        spread: r.max_fare - r.min_fare,
        observationCount: r.observation_count,
        recentAmounts: (r.amounts || []).slice(0, 8),
        mostRecentAt: r.most_recent_at,
        note: 'Conflict shown for review — no automatic “correct” fare.',
      })),
      note: 'Do not treat one community fare as universal.',
    };
  },

  async listDuplicates({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const [routes, stops] = await Promise.all([
      getPool().query(
        `SELECT origin_location_id, destination_location_id,
                COUNT(*)::int AS count,
                array_agg(tr.id::text ORDER BY tr.created_at) AS ids,
                MAX(o.name) AS origin_name,
                MAX(d.name) AS destination_name
         FROM transport_routes tr
         JOIN locations o ON o.id = tr.origin_location_id
         JOIN locations d ON d.id = tr.destination_location_id
         GROUP BY origin_location_id, destination_location_id
         HAVING COUNT(*) >= 2
         ORDER BY count DESC
         LIMIT $1`,
        [lim]
      ),
      getPool().query(
        `SELECT lower(COALESCE(s.label, loc.name)) AS name_key,
                COUNT(*)::int AS count,
                array_agg(s.id::text) AS ids,
                MAX(COALESCE(s.label, loc.name)) AS display_name
         FROM transport_route_stops s
         LEFT JOIN locations loc ON loc.id = s.location_id
         WHERE COALESCE(s.label, loc.name) IS NOT NULL
         GROUP BY lower(COALESCE(s.label, loc.name))
         HAVING COUNT(*) >= 3
         ORDER BY count DESC
         LIMIT $1`,
        [lim]
      ),
    ]);

    return {
      duplicateCorridors: routes.rows.map((r) => ({
        originId: r.origin_location_id,
        destinationId: r.destination_location_id,
        originName: r.origin_name,
        destinationName: r.destination_name,
        count: r.count,
        ids: r.ids,
      })),
      similarStopNames: stops.rows.map((r) => ({
        nameKey: r.name_key,
        displayName: r.display_name,
        count: r.count,
        ids: r.ids,
      })),
      note: 'Candidates for human review — not auto-merged.',
    };
  },

  async qualityIssues({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const [staleRoutes, missingLoc, staleFares, unverified, conflicts, dups] = await Promise.all([
      getPool().query(
        `SELECT tr.id, tr.name, o.name AS origin_name, d.name AS destination_name, tr.updated_at
         FROM transport_routes tr
         JOIN locations o ON o.id = tr.origin_location_id
         JOIN locations d ON d.id = tr.destination_location_id
         WHERE tr.is_active = TRUE
           AND tr.updated_at < NOW() - INTERVAL '90 days'
           AND NOT EXISTS (
             SELECT 1 FROM transport_fare_reports tfr
             JOIN reports r ON r.id = tfr.report_id
             WHERE tfr.route_id = tr.id
               AND COALESCE(r.last_confirmed_at, r.created_at) >= NOW() - INTERVAL '90 days'
           )
         ORDER BY tr.updated_at ASC
         LIMIT $1`,
        [lim]
      ),
      getPool().query(
        `SELECT s.id, s.label, s.route_id, tr.name AS route_name
         FROM transport_route_stops s
         JOIN transport_routes tr ON tr.id = s.route_id
         WHERE s.location_id IS NULL
         ORDER BY s.created_at DESC
         LIMIT $1`,
        [lim]
      ),
      getPool().query(
        `SELECT tfr.id, tfr.fare_amount, tr.name AS route_name, r.status, r.created_at
         FROM transport_fare_reports tfr
         JOIN transport_routes tr ON tr.id = tfr.route_id
         JOIN reports r ON r.id = tfr.report_id
         WHERE r.status IN ('stale','expired')
            OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW())
         ORDER BY r.created_at DESC
         LIMIT $1`,
        [lim]
      ),
      getPool().query(
        `SELECT tfr.id, tfr.fare_amount, tr.name AS route_name, r.moderation_state, r.status
         FROM transport_fare_reports tfr
         JOIN transport_routes tr ON tr.id = tfr.route_id
         JOIN reports r ON r.id = tfr.report_id
         WHERE r.moderation_state IN ('flagged','queued','in_review','escalated')
         ORDER BY r.updated_at DESC
         LIMIT $1`,
        [lim]
      ),
      this.listFareConflicts({ limit: lim }),
      this.listDuplicates({ limit: lim }),
    ]);

    return {
      staleRoutes: staleRoutes.rows,
      stopsMissingLocation: missingLoc.rows,
      staleOrExpiredFares: staleFares.rows,
      unverifiedSubmissions: unverified.rows,
      conflictingFares: conflicts.items,
      duplicateCandidates: dups,
      counts: {
        staleRoutes: staleRoutes.rows.length,
        stopsMissingLocation: missingLoc.rows.length,
        staleOrExpiredFares: staleFares.rows.length,
        unverifiedSubmissions: unverified.rows.length,
        conflictingFares: conflicts.items.length,
        duplicateCorridors: dups.duplicateCorridors.length,
        similarStopNames: dups.similarStopNames.length,
      },
    };
  },

  async createRoute(body, admin, req) {
    if (!body.originLocationId || !body.destinationLocationId) {
      throw new AppError('Origin and destination locations are required.', 400, 'VALIDATION_ERROR');
    }
    if (body.originLocationId === body.destinationLocationId) {
      throw new AppError('Origin and destination must differ.', 400, 'VALIDATION_ERROR');
    }
    const mode = body.mode && MODES.has(body.mode) ? body.mode : null;
    const locs = await getPool().query(
      `SELECT id FROM locations WHERE id = ANY($1::uuid[])`,
      [[body.originLocationId, body.destinationLocationId]]
    );
    if (locs.rows.length !== 2) {
      throw new AppError('Origin or destination location not found.', 404, 'LOCATION_NOT_FOUND');
    }

    const result = await getPool().query(
      `INSERT INTO transport_routes (
         name, origin_location_id, destination_location_id, primary_mode, created_by
       ) VALUES ($1, $2, $3, $4::transport_mode, $5)
       RETURNING id`,
      [
        body.name ? String(body.name).trim().slice(0, 160) : null,
        body.originLocationId,
        body.destinationLocationId,
        mode,
        admin?.userId || admin?.id || null,
      ]
    );

    const id = result.rows[0].id;

    if (Array.isArray(body.stops) && body.stops.length) {
      let order = 1;
      for (const stop of body.stops.slice(0, 40)) {
        await getPool().query(
          `INSERT INTO transport_route_stops (route_id, stop_order, location_id, label, stop_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            id,
            order++,
            stop.locationId || null,
            stop.label ? String(stop.label).trim().slice(0, 160) : null,
            stop.stopId || null,
          ]
        );
      }
    }

    await writeAudit(
      admin,
      {
        action: 'transport_route.create',
        entityType: 'transport_route',
        entityId: id,
        previousState: null,
        newState: {
          name: body.name || null,
          originLocationId: body.originLocationId,
          destinationLocationId: body.destinationLocationId,
          mode,
        },
        reason: body.reason || 'Admin created transport route',
      },
      req
    );

    return this.getRoute(id);
  },

  async listDirectoryStops({ q, stateId, active, page = 1, limit = 30 } = {}) {
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(
        `(ts.name ILIKE $${i} OR EXISTS (
           SELECT 1 FROM transport_stop_aliases a WHERE a.stop_id = ts.id AND a.alias ILIKE $${i}
         ))`
      );
    }
    if (stateId) {
      params.push(stateId);
      where.push(`ts.state_id = $${params.length}`);
    }
    if (active === true || active === 'true') where.push(`ts.is_active = TRUE`);
    if (active === false || active === 'false') where.push(`ts.is_active = FALSE`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);

    const result = await getPool().query(
      `SELECT ts.*, s.name AS state_name, l.name AS lga_name, a.name AS area_name, loc.name AS location_name,
              (SELECT array_agg(sa.alias ORDER BY sa.alias) FROM transport_stop_aliases sa WHERE sa.stop_id = ts.id) AS aliases,
              (SELECT COUNT(*)::int FROM transport_route_stops rs WHERE rs.stop_id = ts.id) AS route_links
       FROM transport_stops ts
       LEFT JOIN states s ON s.id = ts.state_id
       LEFT JOIN lgas l ON l.id = ts.lga_id
       LEFT JOIN areas a ON a.id = ts.area_id
       LEFT JOIN locations loc ON loc.id = ts.location_id
       ${whereSql}
       ORDER BY ts.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM transport_stops ts ${whereSql}`,
      params.slice(0, -2)
    );

    return {
      items: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        aliases: r.aliases || [],
        locationId: r.location_id,
        locationName: r.location_name,
        stateId: r.state_id,
        stateName: r.state_name,
        lgaId: r.lga_id,
        lgaName: r.lga_name,
        areaId: r.area_id,
        areaName: r.area_name,
        isActive: r.is_active,
        routeLinks: r.route_links || 0,
        coordinates:
          r.latitude != null && r.longitude != null
            ? { lat: Number(r.latitude), lng: Number(r.longitude) }
            : null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async createDirectoryStop(body, admin, req) {
    const name = String(body.name || '').trim();
    if (name.length < 2) throw new AppError('Stop name is required.', 400, 'VALIDATION_ERROR');

    let latitude = body.latitude != null ? Number(body.latitude) : null;
    let longitude = body.longitude != null ? Number(body.longitude) : null;
    if (latitude != null || longitude != null) {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new AppError('Invalid coordinates.', 400, 'INVALID_COORDINATES');
      }
      if (!isWithinNigeriaBounds(latitude, longitude)) {
        throw new AppError('Coordinates outside Nigeria bounds.', 400, 'INVALID_COORDINATES');
      }
    }

    if (body.locationId) {
      const loc = await getPool().query(
        `SELECT id, state_id, lga_id, area_id, latitude, longitude FROM locations WHERE id = $1`,
        [body.locationId]
      );
      if (!loc.rows[0]) throw new AppError('Location not found.', 404, 'LOCATION_NOT_FOUND');
      if (!body.stateId) body.stateId = loc.rows[0].state_id;
      if (!body.lgaId) body.lgaId = loc.rows[0].lga_id;
      if (!body.areaId) body.areaId = loc.rows[0].area_id;
      if (latitude == null && loc.rows[0].latitude != null) {
        latitude = Number(loc.rows[0].latitude);
        longitude = Number(loc.rows[0].longitude);
      }
    }

    const result = await getPool().query(
      `INSERT INTO transport_stops (
         name, location_id, state_id, lga_id, area_id, latitude, longitude, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        name.slice(0, 160),
        body.locationId || null,
        body.stateId || null,
        body.lgaId || null,
        body.areaId || null,
        latitude,
        longitude,
        admin?.userId || admin?.id || null,
      ]
    );
    const id = result.rows[0].id;

    if (Array.isArray(body.aliases)) {
      for (const alias of body.aliases.slice(0, 10)) {
        const text = String(alias || '').trim();
        if (text.length < 2) continue;
        await getPool().query(
          `INSERT INTO transport_stop_aliases (stop_id, alias, created_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (stop_id, normalized_alias) DO NOTHING`,
          [id, text.slice(0, 160), admin?.userId || admin?.id || null]
        );
      }
    }

    await writeAudit(
      admin,
      {
        action: 'transport_stop.create',
        entityType: 'transport_stop',
        entityId: id,
        previousState: null,
        newState: { name },
        reason: body.reason || 'Admin created bus stop',
      },
      req
    );

    const listed = await this.listDirectoryStops({ q: name, limit: 5 });
    return listed.items.find((i) => i.id === id) || { id, name };
  },

  async listFareAnomalies({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    // Flag observations that are extreme outliers vs peer median on same route/mode (30d).
    const result = await getPool().query(
      `WITH peers AS (
         SELECT tfr.route_id, tfr.transport_mode,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY tfr.fare_amount::float) AS median_fare,
                COUNT(*)::int AS peer_count
         FROM transport_fare_reports tfr
         JOIN reports r ON r.id = tfr.report_id
         WHERE r.status IN ('submitted','active','confirmed','stale')
           AND r.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY tfr.route_id, tfr.transport_mode
         HAVING COUNT(*) >= 3
       )
       SELECT tfr.id, tfr.fare_amount::float AS amount, tfr.transport_mode, tfr.fare_period::text AS fare_period,
              tr.id AS route_id, tr.name AS route_name,
              r.id AS report_id, r.status, r.created_at,
              p.median_fare, p.peer_count
       FROM transport_fare_reports tfr
       JOIN peers p ON p.route_id = tfr.route_id AND p.transport_mode = tfr.transport_mode
       JOIN transport_routes tr ON tr.id = tfr.route_id
       JOIN reports r ON r.id = tfr.report_id
       WHERE r.status <> 'removed'
         AND r.created_at >= NOW() - INTERVAL '30 days'
         AND p.median_fare > 0
         AND (
           tfr.fare_amount::float >= GREATEST(p.median_fare * 8, p.median_fare + 2000)
           OR tfr.fare_amount::float <= GREATEST(p.median_fare * 0.15, 1)
         )
       ORDER BY ABS(tfr.fare_amount::float - p.median_fare) DESC
       LIMIT $1`,
      [lim]
    );

    return {
      items: result.rows.map((r) => ({
        id: r.id,
        reportId: r.report_id,
        routeId: r.route_id,
        routeName: r.route_name,
        mode: r.transport_mode,
        farePeriod: r.fare_period,
        amount: Number(r.amount),
        medianFare: Number(r.median_fare),
        peerCount: r.peer_count,
        status: r.status,
        createdAt: r.created_at,
        flagReason:
          Number(r.amount) > Number(r.median_fare)
            ? 'Unusually high vs recent median'
            : 'Unusually low vs recent median',
      })),
      note: 'Heuristic review signals only — never auto-deleted or declared false.',
      farePeriods: FARE_PERIODS,
    };
  },
};

export default transportAdminService;
