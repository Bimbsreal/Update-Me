/**
 * Admin fuel & filling-station management.
 * Reuses fuel_stations + fuel_reports + reports freshness — no parallel price truth store.
 */
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import { isWithinNigeriaBounds } from '../utils/geoBounds.js';
import { fuelTypeLabel, availabilityLabel } from '../config/fuel.js';

const LIFECYCLE = Object.freeze([
  'active',
  'temporarily_inactive',
  'permanently_inactive',
  'pending_verification',
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

function validateCoords(lat, lng) {
  if (lat == null && lng == null) return { lat: null, lng: null };
  if ((lat == null) !== (lng == null)) {
    throw new AppError('Latitude and longitude must both be set or both cleared', 400, 'VALIDATION_ERROR');
  }
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < -90 || a > 90 || b < -180 || b > 180) {
    throw new AppError('Invalid coordinates', 400, 'VALIDATION_ERROR');
  }
  if (!isWithinNigeriaBounds(a, b)) {
    throw new AppError('Coordinates must fall within Nigeria geographic bounds.', 400, 'OUT_OF_BOUNDS');
  }
  return { lat: a, lng: b };
}

function mapStationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    brand: row.brand || null,
    address: row.address || null,
    landmarkLabel: row.landmark_label || null,
    roadName: row.road_name || null,
    isActive: row.is_active !== false,
    lifecycleStatus: row.lifecycle_status || (row.is_active ? 'active' : 'temporarily_inactive'),
    locationId: row.location_id,
    locationName: row.location_name || null,
    locationType: row.location_type || null,
    stateId: row.state_id || null,
    stateName: row.state_name || null,
    lgaId: row.lga_id || null,
    lgaName: row.lga_name || null,
    areaId: row.area_id || null,
    areaName: row.area_name || null,
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: Number(row.latitude), lng: Number(row.longitude) }
        : row.loc_latitude != null && row.loc_longitude != null
          ? { lat: Number(row.loc_latitude), lng: Number(row.loc_longitude) }
          : null,
    latestPetrol:
      row.pms_price != null
        ? {
            amount: Number(row.pms_price),
            currency: row.pms_currency || 'NGN',
            unit: row.pms_unit || 'litre',
            observedAt: row.pms_observed_at || null,
            sourceType: row.pms_source_type || 'community',
            reportStatus: row.pms_status || null,
            freshness: row.pms_freshness || null,
            trustLabel: trustLabelFor(row.pms_source_type, row.pms_status, row.pms_confirmed),
          }
        : null,
    reportCount: row.report_count != null ? Number(row.report_count) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function trustLabelFor(sourceType, status, confirmedCount) {
  if (sourceType === 'official') return 'Official Source';
  if (sourceType === 'aggregated') return 'Aggregated';
  if (status === 'confirmed' || Number(confirmedCount) > 0) return 'Community Confirmed';
  return 'Community Reported';
}

function freshnessFromRow(status, expiresAt, lastConfirmedAt, occurredAt, createdAt, staleAfterMinutes = 120) {
  const now = Date.now();
  if (status === 'expired' || (expiresAt && new Date(expiresAt).getTime() <= now)) return 'expired';
  if (status === 'stale') return 'stale';
  const anchor = lastConfirmedAt || occurredAt || createdAt;
  if (!anchor) return 'fresh';
  const ageMs = now - new Date(anchor).getTime();
  if (ageMs >= staleAfterMinutes * 60 * 1000) return 'stale';
  if (ageMs >= (staleAfterMinutes * 60 * 1000) / 2) return 'aging';
  return 'fresh';
}

const STATION_SELECT = `
  fs.id, fs.name, fs.brand, fs.address, fs.landmark_label, fs.road_name,
  fs.is_active, fs.lifecycle_status, fs.location_id,
  fs.latitude, fs.longitude, fs.created_at, fs.updated_at,
  loc.name AS location_name, loc.type AS location_type,
  loc.latitude AS loc_latitude, loc.longitude AS loc_longitude,
  loc.state_id, loc.lga_id, loc.area_id,
  s.name AS state_name, l.name AS lga_name, a.name AS area_name
`;

const STATION_JOINS = `
  FROM fuel_stations fs
  JOIN locations loc ON loc.id = fs.location_id
  LEFT JOIN states s ON s.id = loc.state_id
  LEFT JOIN lgas l ON l.id = loc.lga_id
  LEFT JOIN areas a ON a.id = loc.area_id
`;

const LATEST_PMS_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT fr.price_amount AS pms_price, fr.price_currency AS pms_currency, fr.price_unit AS pms_unit,
           r.source_type AS pms_source_type, r.status AS pms_status,
           r.confirmed_accurate_count AS pms_confirmed,
           COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) AS pms_observed_at,
           CASE
             WHEN r.status = 'expired' OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW()) THEN 'expired'
             WHEN r.status = 'stale' THEN 'stale'
             WHEN COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) < NOW() - make_interval(mins => COALESCE(p.stale_after_minutes, 120)) THEN 'stale'
             WHEN COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) < NOW() - make_interval(mins => GREATEST(COALESCE(p.stale_after_minutes, 120) / 2, 1)) THEN 'aging'
             ELSE 'fresh'
           END AS pms_freshness
    FROM fuel_reports fr
    JOIN reports r ON r.id = fr.report_id
    LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
    WHERE fr.station_id = fs.id
      AND fr.fuel_type = 'pms'
      AND fr.price_amount IS NOT NULL
      AND r.status <> 'removed'
    ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC
    LIMIT 1
  ) pms ON TRUE
`;

export const fuelAdminService = {
  async dashboard() {
    const pool = getPool();
    const [
      active,
      pending,
      today,
      community,
      stale,
      conflicts,
      sourcesFailing,
      inactive,
      verified,
      unverified,
      flagged,
      anomalies,
      confirmed,
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS c FROM fuel_stations
         WHERE lifecycle_status = 'active' OR (lifecycle_status IS NULL AND is_active = TRUE)`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM fuel_stations WHERE lifecycle_status = 'pending_verification'`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM fuel_reports fr
         JOIN reports r ON r.id = fr.report_id
         WHERE r.created_at >= date_trunc('day', NOW())`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM fuel_reports fr
         JOIN reports r ON r.id = fr.report_id
         WHERE r.source_type = 'community'
           AND r.created_at >= NOW() - INTERVAL '7 days'`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM fuel_reports fr
         JOIN reports r ON r.id = fr.report_id
         JOIN report_categories c ON c.id = r.category_id AND c.code = 'fuel'
         WHERE r.status IN ('stale', 'expired')
           OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW())`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM (
           SELECT fr.station_id, fr.fuel_type
           FROM fuel_reports fr
           JOIN reports r ON r.id = fr.report_id
           WHERE r.status IN ('submitted','active','confirmed','stale')
             AND r.visibility = 'public'
             AND fr.price_amount IS NOT NULL
             AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) >= NOW() - INTERVAL '6 hours'
           GROUP BY fr.station_id, fr.fuel_type
           HAVING MAX(fr.price_amount) - MIN(fr.price_amount) >= 20
              AND COUNT(*) >= 2
         ) x`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM official_sources os
         WHERE (os.id = 'fixture_nmdpra' OR os.notes ILIKE '%fuel%' OR os.provider_key ILIKE '%fuel%')
           AND (
             os.consecutive_failures > 0
             OR (os.last_error_message IS NOT NULL AND os.last_success_at IS NULL)
           )`
      ).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM fuel_stations
         WHERE lifecycle_status IN ('temporarily_inactive','permanently_inactive')
            OR (lifecycle_status IS NULL AND is_active = FALSE)`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM fuel_stations WHERE lifecycle_status = 'active'`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM fuel_reports fr
         JOIN reports r ON r.id = fr.report_id
         WHERE r.source_type = 'community'
           AND r.status IN ('submitted','active')
           AND COALESCE(r.confirmed_accurate_count, 0) = 0
           AND r.moderation_state IN ('queued','cleared','none')
           AND r.created_at >= NOW() - INTERVAL '7 days'`
      ).catch(() =>
        pool.query(
          `SELECT COUNT(*)::int AS c
           FROM fuel_reports fr
           JOIN reports r ON r.id = fr.report_id
           WHERE r.source_type = 'community'
             AND r.status IN ('submitted','active')
             AND COALESCE(r.confirmed_accurate_count, 0) = 0
             AND r.created_at >= NOW() - INTERVAL '7 days'`
        )
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM fuel_reports fr
         JOIN reports r ON r.id = fr.report_id
         WHERE r.moderation_state IN ('flagged','queued','in_review','escalated')
            OR r.status IN ('flagged','under_review')
            OR EXISTS (SELECT 1 FROM report_flags f WHERE f.report_id = r.id AND f.status = 'open')`
      ),
      pool.query(
        `WITH peers AS (
           SELECT fr.fuel_type,
                  percentile_cont(0.5) WITHIN GROUP (ORDER BY fr.price_amount::float) AS median_price
           FROM fuel_reports fr
           JOIN reports r ON r.id = fr.report_id
           WHERE r.status IN ('submitted','active','confirmed','stale')
             AND fr.price_amount IS NOT NULL
             AND fr.pricing_context = 'retail_pump'
             AND r.created_at >= NOW() - INTERVAL '14 days'
           GROUP BY fr.fuel_type
           HAVING COUNT(*) >= 5
         )
         SELECT COUNT(*)::int AS c
         FROM fuel_reports fr
         JOIN reports r ON r.id = fr.report_id
         JOIN peers p ON p.fuel_type = fr.fuel_type
         WHERE r.status <> 'removed'
           AND fr.price_amount IS NOT NULL
           AND r.created_at >= NOW() - INTERVAL '14 days'
           AND p.median_price > 0
           AND (
             fr.price_amount::float >= GREATEST(p.median_price * 1.35, p.median_price + 150)
             OR fr.price_amount::float <= GREATEST(p.median_price * 0.6, 1)
             OR fr.price_amount::float > 5000
           )`
      ).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM fuel_reports fr
         JOIN reports r ON r.id = fr.report_id
         WHERE r.status = 'confirmed'
            OR r.confirmed_accurate_count > 0`
      ),
    ]);

    return {
      activeStations: active.rows[0]?.c || 0,
      pendingVerificationStations: pending.rows[0]?.c || 0,
      inactiveStations: inactive.rows[0]?.c || 0,
      verifiedStations: verified.rows[0]?.c || 0,
      priceSubmissionsToday: today.rows[0]?.c || 0,
      communitySubmissions7d: community.rows[0]?.c || 0,
      communityConfirmedObservations: confirmed.rows[0]?.c || 0,
      unverifiedObservations: unverified.rows[0]?.c || 0,
      flaggedObservations: flagged.rows[0]?.c || 0,
      staleOrExpiredPrices: stale.rows[0]?.c || 0,
      conflictingPriceGroups: conflicts.rows[0]?.c || 0,
      priceAnomalies: anomalies.rows[0]?.c || 0,
      failedFuelSourceUpdates: sourcesFailing.rows[0]?.c || 0,
    };
  },

  async listStations({
    q,
    stateId,
    lgaId,
    areaId,
    brand,
    status,
    freshness,
    page = 1,
    limit = 30,
  } = {}) {
    const params = [];
    const where = [];

    if (q) {
      const like = `%${String(q).trim()}%`;
      params.push(like);
      const qi = params.length;
      where.push(
        `(fs.name ILIKE $${qi} OR fs.brand ILIKE $${qi} OR fs.address ILIKE $${qi}
          OR EXISTS (
            SELECT 1 FROM fuel_station_aliases fa
            WHERE fa.station_id = fs.id
              AND (fa.alias ILIKE $${qi} OR fa.normalized_alias ILIKE $${qi})
          ))`
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
    if (brand) {
      params.push(String(brand).trim());
      where.push(`lower(trim(fs.brand)) = lower(trim($${params.length}))`);
    }
    if (status === 'active') {
      where.push(`(fs.lifecycle_status = 'active' OR (fs.lifecycle_status IS NULL AND fs.is_active = TRUE))`);
    } else if (status === 'inactive') {
      where.push(
        `(fs.lifecycle_status IN ('temporarily_inactive','permanently_inactive') OR (fs.lifecycle_status IS NULL AND fs.is_active = FALSE))`
      );
    } else if (status && LIFECYCLE.includes(status)) {
      params.push(status);
      where.push(`fs.lifecycle_status = $${params.length}::fuel_station_lifecycle`);
    }
    if (freshness && ['fresh', 'aging', 'stale', 'expired'].includes(freshness)) {
      where.push(`pms.pms_freshness = '${freshness.replace(/'/g, '')}'`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);

    const result = await getPool().query(
      `SELECT ${STATION_SELECT},
              pms.pms_price, pms.pms_currency, pms.pms_unit, pms.pms_source_type,
              pms.pms_status, pms.pms_confirmed, pms.pms_observed_at, pms.pms_freshness,
              (SELECT COUNT(*)::int FROM fuel_reports fr2 WHERE fr2.station_id = fs.id) AS report_count
       ${STATION_JOINS}
       ${LATEST_PMS_LATERAL}
       ${whereSql}
       ORDER BY fs.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, -2);
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total
       ${STATION_JOINS}
       ${LATEST_PMS_LATERAL}
       ${whereSql}`,
      countParams
    );

    return {
      items: result.rows.map(mapStationRow),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async getStation(id) {
    const result = await getPool().query(
      `SELECT ${STATION_SELECT},
              pms.pms_price, pms.pms_currency, pms.pms_unit, pms.pms_source_type,
              pms.pms_status, pms.pms_confirmed, pms.pms_observed_at, pms.pms_freshness
       ${STATION_JOINS}
       ${LATEST_PMS_LATERAL}
       WHERE fs.id = $1`,
      [id]
    );
    if (!result.rows[0]) throw new AppError('Fuel station not found.', 404, 'NOT_FOUND');

    const station = mapStationRow(result.rows[0]);

    const [latestByType, recentReports, aliases, history, officialSources, audits] =
      await Promise.all([
        this.latestPricesByType(id),
        this.listSubmissions({ stationId: id, page: 1, limit: 25 }),
        getPool().query(
          `SELECT id, alias, created_at FROM fuel_station_aliases
           WHERE station_id = $1 ORDER BY alias ASC LIMIT 40`,
          [id]
        ),
        this.priceHistory(id, { limit: 40 }),
        this.fuelOfficialSources(),
        getPool().query(
          `SELECT action, reason, previous_state, new_state, created_at, actor_user_id
           FROM admin_audit_log
           WHERE entity_type = 'fuel_station' AND entity_id = $1
           ORDER BY created_at DESC LIMIT 20`,
          [id]
        ).catch(() => ({ rows: [] })),
      ]);

    return {
      station,
      latestByType,
      recentSubmissions: recentReports.items,
      aliases: aliases.rows.map((a) => ({ id: a.id, alias: a.alias, createdAt: a.created_at })),
      priceHistory: history.items,
      officialSources,
      adminActivity: audits.rows.map((r) => ({
        action: r.action,
        reason: r.reason,
        previousState: r.previous_state,
        newState: r.new_state,
        createdAt: r.created_at,
      })),
    };
  },

  async latestPricesByType(stationId) {
    const result = await getPool().query(
      `SELECT DISTINCT ON (fr.fuel_type)
         fr.fuel_type, fr.price_amount, fr.price_currency, fr.price_unit, fr.availability,
         r.source_type, r.status, r.confirmed_accurate_count,
         COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) AS observed_at,
         r.expires_at, p.stale_after_minutes
       FROM fuel_reports fr
       JOIN reports r ON r.id = fr.report_id
       LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
       WHERE fr.station_id = $1
         AND r.status <> 'removed'
       ORDER BY fr.fuel_type,
                COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC`,
      [stationId]
    );

    return result.rows.map((row) => {
      const freshness = freshnessFromRow(
        row.status,
        row.expires_at,
        null,
        row.observed_at,
        row.observed_at,
        row.stale_after_minutes || 120
      );
      return {
        fuelType: row.fuel_type,
        fuelTypeLabel: fuelTypeLabel(row.fuel_type),
        availability: row.availability,
        availabilityLabel: availabilityLabel(row.availability),
        price:
          row.price_amount != null
            ? {
                amount: Number(row.price_amount),
                currency: row.price_currency || 'NGN',
                unit: row.price_unit || 'litre',
              }
            : null,
        observedAt: row.observed_at,
        sourceType: row.source_type,
        trustLabel: trustLabelFor(row.source_type, row.status, row.confirmed_accurate_count),
        freshness,
        reportStatus: row.status,
      };
    });
  },

  async priceHistory(stationId, { fuelType = 'pms', limit = 40, hours = null } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const params = [stationId];
    let typeClause = '';
    let hoursClause = '';
    if (fuelType) {
      params.push(fuelType);
      typeClause = `AND fr.fuel_type = $${params.length}::fuel_product_type`;
    }
    if (hours != null && Number.isFinite(Number(hours)) && Number(hours) > 0) {
      params.push(Math.min(Math.max(Math.trunc(Number(hours)), 1), 24 * 90));
      hoursClause = `AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) >= NOW() - ($${params.length}::int * INTERVAL '1 hour')`;
    }
    params.push(lim);
    const result = await getPool().query(
      `SELECT fr.id, fr.fuel_type, fr.price_amount, fr.price_currency, fr.price_unit,
              fr.availability, r.source_type, r.status, r.confirmed_accurate_count,
              COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) AS observed_at
       FROM fuel_reports fr
       JOIN reports r ON r.id = fr.report_id
       WHERE fr.station_id = $1
         ${typeClause}
         ${hoursClause}
         AND fr.price_amount IS NOT NULL
         AND r.status <> 'removed'
       ORDER BY observed_at ASC
       LIMIT $${params.length}`,
      params
    );

    const items = result.rows.map((row, i, arr) => {
      const prev = i > 0 ? Number(arr[i - 1].price_amount) : null;
      const amount = Number(row.price_amount);
      return {
        id: row.id,
        fuelType: row.fuel_type,
        fuelTypeLabel: fuelTypeLabel(row.fuel_type),
        price: {
          amount,
          currency: row.price_currency || 'NGN',
          unit: row.price_unit || 'litre',
        },
        previousAmount: prev,
        change: prev != null ? Number((amount - prev).toFixed(2)) : null,
        observedAt: row.observed_at,
        sourceType: row.source_type,
        trustLabel: trustLabelFor(row.source_type, row.status, row.confirmed_accurate_count),
        reportStatus: row.status,
        availability: row.availability,
      };
    });

    return { items, fuelType: fuelType || null };
  },

  async listSubmissions({
    stationId,
    q,
    fuelType,
    status,
    freshness,
    sourceType = 'community',
    page = 1,
    limit = 30,
  } = {}) {
    const params = [];
    const where = [`r.status <> 'removed'`];
    if (stationId) {
      params.push(stationId);
      where.push(`fr.station_id = $${params.length}`);
    }
    if (fuelType) {
      params.push(fuelType);
      where.push(`fr.fuel_type = $${params.length}::fuel_product_type`);
    }
    if (status) {
      params.push(status);
      where.push(`r.status = $${params.length}::report_status`);
    }
    if (sourceType) {
      params.push(sourceType);
      where.push(`r.source_type = $${params.length}::report_source_type`);
    }
    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(`(fs.name ILIKE $${params.length} OR r.title ILIKE $${params.length})`);
    }
    if (freshness === 'stale') {
      where.push(`(r.status = 'stale' OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW() + INTERVAL '1 second' AND r.status <> 'expired'))`);
    } else if (freshness === 'expired') {
      where.push(`(r.status = 'expired' OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW()))`);
    } else if (freshness === 'fresh') {
      where.push(`r.status IN ('submitted','active','confirmed') AND (r.expires_at IS NULL OR r.expires_at > NOW())`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);

    const result = await getPool().query(
      `SELECT fr.id, fr.report_id, fr.station_id, fr.fuel_type, fr.availability,
              fr.price_amount, fr.price_currency, fr.price_unit,
              fs.name AS station_name, fs.brand,
              r.title, r.source_type, r.status, r.moderation_state,
              r.confirmed_accurate_count, r.occurred_at, r.created_at, r.expires_at,
              r.last_confirmed_at, u.display_name AS author_display_name,
              loc.name AS location_name, s.name AS state_name, lg.name AS lga_name,
              p.stale_after_minutes
       FROM fuel_reports fr
       JOIN fuel_stations fs ON fs.id = fr.station_id
       JOIN reports r ON r.id = fr.report_id
       JOIN users u ON u.id = r.user_id
       JOIN locations loc ON loc.id = r.location_id
       LEFT JOIN states s ON s.id = loc.state_id
       LEFT JOIN lgas lg ON lg.id = loc.lga_id
       LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
       ${whereSql}
       ORDER BY r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total
       FROM fuel_reports fr
       JOIN fuel_stations fs ON fs.id = fr.station_id
       JOIN reports r ON r.id = fr.report_id
       ${whereSql}`,
      params.slice(0, -2)
    );

    return {
      items: result.rows.map((row) => ({
        id: row.id,
        reportId: row.report_id,
        stationId: row.station_id,
        stationName: row.station_name,
        brand: row.brand,
        fuelType: row.fuel_type,
        fuelTypeLabel: fuelTypeLabel(row.fuel_type),
        availability: row.availability,
        price:
          row.price_amount != null
            ? {
                amount: Number(row.price_amount),
                currency: row.price_currency || 'NGN',
                unit: row.price_unit || 'litre',
              }
            : null,
        title: row.title,
        sourceType: row.source_type,
        trustLabel: trustLabelFor(row.source_type, row.status, row.confirmed_accurate_count),
        status: row.status,
        moderationState: row.moderation_state,
        freshness: freshnessFromRow(
          row.status,
          row.expires_at,
          row.last_confirmed_at,
          row.occurred_at,
          row.created_at,
          row.stale_after_minutes || 120
        ),
        authorDisplayName: row.author_display_name,
        locationName: row.location_name,
        stateName: row.state_name,
        lgaName: row.lga_name,
        createdAt: row.created_at,
        observedAt: row.occurred_at || row.created_at,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async listConflicts({ limit = 40, windowMinutes = 360 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const mins = Math.min(Math.max(Number(windowMinutes) || 360, 30), 24 * 60);
    const result = await getPool().query(
      `WITH recent AS (
         SELECT fr.station_id, fs.name AS station_name, fr.fuel_type,
                fr.price_amount, r.id AS report_id, r.source_type, r.status,
                r.user_id,
                COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) AS observed_at
         FROM fuel_reports fr
         JOIN fuel_stations fs ON fs.id = fr.station_id
         JOIN reports r ON r.id = fr.report_id
         WHERE fr.price_amount IS NOT NULL
           AND r.status IN ('submitted','active','confirmed','stale')
           AND r.visibility = 'public'
           AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
               >= NOW() - make_interval(mins => $1)
       ),
       groups AS (
         SELECT station_id, fuel_type,
                MAX(station_name) AS station_name,
                COUNT(*)::int AS observation_count,
                COUNT(DISTINCT user_id)::int AS independent_reporters,
                MIN(price_amount)::numeric AS min_price,
                MAX(price_amount)::numeric AS max_price,
                ROUND(AVG(price_amount)::numeric, 2) AS avg_price
         FROM recent
         GROUP BY station_id, fuel_type
         HAVING MAX(price_amount) - MIN(price_amount) >= 20
            AND COUNT(*) >= 2
       )
       SELECT g.*,
              (
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'reportId', r.report_id,
                    'amount', r.price_amount,
                    'sourceType', r.source_type,
                    'status', r.status,
                    'observedAt', r.observed_at
                  )
                  ORDER BY r.observed_at DESC
                )
                FROM recent r
                WHERE r.station_id = g.station_id AND r.fuel_type = g.fuel_type
              ) AS observations
       FROM groups g
       ORDER BY (g.max_price - g.min_price) DESC, g.observation_count DESC
       LIMIT $2`,
      [mins, lim]
    );

    return {
      items: result.rows.map((row) => ({
        stationId: row.station_id,
        stationName: row.station_name,
        fuelType: row.fuel_type,
        fuelTypeLabel: fuelTypeLabel(row.fuel_type),
        observationCount: row.observation_count,
        independentReporters: row.independent_reporters,
        minPrice: Number(row.min_price),
        maxPrice: Number(row.max_price),
        avgPrice: Number(row.avg_price),
        spread: Number((Number(row.max_price) - Number(row.min_price)).toFixed(2)),
        observations: row.observations || [],
        note: 'Conflicting community observations — no automatic correct price is selected.',
      })),
      windowMinutes: mins,
    };
  },

  async listDuplicates({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const [sameName, nearCoords] = await Promise.all([
      getPool().query(
        `SELECT lower(trim(name)) AS normalized_name, location_id,
                COUNT(*)::int AS count,
                array_agg(id::text ORDER BY name) AS ids,
                array_agg(name ORDER BY name) AS names
         FROM fuel_stations
         WHERE lifecycle_status IN ('active', 'pending_verification')
            OR (lifecycle_status IS NULL AND is_active = TRUE)
         GROUP BY lower(trim(name)), location_id
         HAVING COUNT(*) > 1
         ORDER BY count DESC
         LIMIT $1`,
        [lim]
      ),
      getPool().query(
        `SELECT a.id AS id_a, a.name AS name_a, b.id AS id_b, b.name AS name_b,
                a.latitude, a.longitude, a.brand AS brand_a, b.brand AS brand_b
         FROM fuel_stations a
         JOIN fuel_stations b ON a.id < b.id
           AND a.latitude IS NOT NULL AND b.latitude IS NOT NULL
           AND abs(a.latitude - b.latitude) < 0.0008
           AND abs(a.longitude - b.longitude) < 0.0008
           AND (a.lifecycle_status IN ('active','pending_verification') OR a.is_active = TRUE)
           AND (b.lifecycle_status IN ('active','pending_verification') OR b.is_active = TRUE)
         ORDER BY a.name
         LIMIT $1`,
        [lim]
      ),
    ]);

    return {
      sameNameSameLocation: sameName.rows.map((r) => ({
        normalizedName: r.normalized_name,
        locationId: r.location_id,
        count: r.count,
        ids: r.ids,
        names: r.names,
      })),
      nearDuplicateCoordinates: nearCoords.rows.map((r) => ({
        a: { id: r.id_a, name: r.name_a, brand: r.brand_a },
        b: { id: r.id_b, name: r.name_b, brand: r.brand_b },
        coordinates: { lat: Number(r.latitude), lng: Number(r.longitude) },
      })),
      note: 'Candidates for human review only — stations are not auto-merged.',
    };
  },

  async qualityIssues({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const pool = getPool();
    const [noCoords, missingPrice, stale, invalid, suspicious] = await Promise.all([
      pool.query(
        `SELECT fs.id, fs.name, fs.brand, loc.name AS location_name
         FROM fuel_stations fs
         JOIN locations loc ON loc.id = fs.location_id
         WHERE fs.is_active = TRUE
           AND (fs.latitude IS NULL OR fs.longitude IS NULL)
           AND (loc.latitude IS NULL OR loc.longitude IS NULL)
         ORDER BY fs.name
         LIMIT $1`,
        [lim]
      ),
      pool.query(
        `SELECT fs.id, fs.name
         FROM fuel_stations fs
         WHERE fs.is_active = TRUE
           AND NOT EXISTS (
             SELECT 1 FROM fuel_reports fr
             JOIN reports r ON r.id = fr.report_id
             WHERE fr.station_id = fs.id
               AND fr.price_amount IS NOT NULL
               AND r.status <> 'removed'
               AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) >= NOW() - INTERVAL '7 days'
           )
         ORDER BY fs.name
         LIMIT $1`,
        [lim]
      ),
      pool.query(
        `SELECT fr.id, fs.name AS station_name, fr.fuel_type, fr.price_amount, r.status, r.created_at
         FROM fuel_reports fr
         JOIN fuel_stations fs ON fs.id = fr.station_id
         JOIN reports r ON r.id = fr.report_id
         WHERE r.status IN ('stale','expired')
            OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW())
         ORDER BY r.created_at DESC
         LIMIT $1`,
        [lim]
      ),
      pool.query(
        `SELECT fr.id, fs.name AS station_name, fr.fuel_type, fr.price_amount
         FROM fuel_reports fr
         JOIN fuel_stations fs ON fs.id = fr.station_id
         WHERE fr.price_amount IS NOT NULL
           AND (fr.price_amount <= 0 OR fr.price_amount > 5000)
         ORDER BY fr.created_at DESC
         LIMIT $1`,
        [lim]
      ),
      pool.query(
        `SELECT fr.id, fs.name AS station_name, fr.fuel_type, fr.price_amount, r.moderation_state, r.status
         FROM fuel_reports fr
         JOIN fuel_stations fs ON fs.id = fr.station_id
         JOIN reports r ON r.id = fr.report_id
         WHERE r.moderation_state IN ('flagged','in_review','queued','escalated')
         ORDER BY r.updated_at DESC
         LIMIT $1`,
        [lim]
      ),
    ]);

    const dups = await this.listDuplicates({ limit: lim });

    return {
      missingCoordinates: noCoords.rows,
      missingRecentPrices: missingPrice.rows,
      staleOrExpired: stale.rows,
      unusualPrices: invalid.rows,
      flaggedSubmissions: suspicious.rows,
      duplicateCandidates: {
        sameName: dups.sameNameSameLocation.length,
        nearCoords: dups.nearDuplicateCoordinates.length,
      },
      counts: {
        missingCoordinates: noCoords.rows.length,
        missingRecentPrices: missingPrice.rows.length,
        staleOrExpired: stale.rows.length,
        unusualPrices: invalid.rows.length,
        flaggedSubmissions: suspicious.rows.length,
      },
    };
  },

  async fuelOfficialSources() {
    const result = await getPool()
      .query(
        `SELECT os.id, os.organization_name, os.short_name, os.status,
                os.verification_status, os.last_attempt_at, os.last_success_at,
                os.last_error_message, os.consecutive_failures, os.provider_key,
                os.ingestion_method, os.notes
         FROM official_sources os
         WHERE os.id = 'fixture_nmdpra'
            OR os.provider_key ILIKE '%nmdpra%'
            OR os.notes ILIKE '%fuel%'
            OR os.notes ILIKE '%petroleum%'
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
      providerKey: r.provider_key,
      ingestionMethod: r.ingestion_method,
      lastAttemptAt: r.last_attempt_at,
      lastSuccessAt: r.last_success_at,
      lastError: r.last_error_message || null,
      consecutiveFailures: r.consecutive_failures || 0,
      note: 'Official petroleum notices — not automatic retail pump prices for every station.',
    }));
  },

  async createStation(body, admin, req) {
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 160) {
      throw new AppError('Station name must be 2–160 characters.', 400, 'VALIDATION_ERROR');
    }
    if (!body.locationId) {
      throw new AppError('Location is required.', 400, 'VALIDATION_ERROR');
    }

    const loc = await getPool().query(`SELECT id, latitude, longitude FROM locations WHERE id = $1`, [
      body.locationId,
    ]);
    if (!loc.rows[0]) throw new AppError('Location not found.', 404, 'LOCATION_NOT_FOUND');

    const dup = await getPool().query(
      `SELECT id, name FROM fuel_stations
       WHERE location_id = $1 AND lower(trim(name)) = lower(trim($2))
         AND (is_active = TRUE OR lifecycle_status IN ('active','pending_verification'))
       LIMIT 5`,
      [body.locationId, name]
    );
    if (dup.rows[0]) {
      throw new AppError(
        'A similar active station already exists in this location.',
        409,
        'STATION_DUPLICATE'
      );
    }

    let lat = body.latitude ?? loc.rows[0].latitude;
    let lng = body.longitude ?? loc.rows[0].longitude;
    if (body.latitude !== undefined || body.longitude !== undefined) {
      const v = validateCoords(
        body.latitude === '' ? null : body.latitude,
        body.longitude === '' ? null : body.longitude
      );
      lat = v.lat;
      lng = v.lng;
    } else if (lat != null && lng != null && !isWithinNigeriaBounds(lat, lng)) {
      lat = null;
      lng = null;
    }

    const near = await this.findSimilarStations({ name, locationId: body.locationId, lat, lng });

    const lifecycle = LIFECYCLE.includes(body.lifecycleStatus)
      ? body.lifecycleStatus
      : 'pending_verification';

    const inserted = await getPool().query(
      `INSERT INTO fuel_stations (
         name, brand, location_id, latitude, longitude, address,
         landmark_label, road_name, lifecycle_status, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::fuel_station_lifecycle,$10)
       RETURNING id`,
      [
        name,
        body.brand ? String(body.brand).trim() : null,
        body.locationId,
        lat,
        lng,
        body.address ? String(body.address).trim() : null,
        body.landmarkLabel ? String(body.landmarkLabel).trim() : null,
        body.roadName ? String(body.roadName).trim() : null,
        lifecycle,
        admin?.userId || null,
      ]
    );

    await writeAudit(
      admin,
      {
        action: 'fuel_station.create',
        entityType: 'fuel_station',
        entityId: inserted.rows[0].id,
        newState: { name, locationId: body.locationId, lifecycleStatus: lifecycle },
        reason: body.reason || 'Admin created fuel station',
      },
      req
    );

    const detail = await this.getStation(inserted.rows[0].id);
    return { ...detail, similarCandidatesReviewed: near };
  },

  async findSimilarStations({ name, locationId, lat, lng, limit = 8 } = {}) {
    const params = [`%${String(name || '').trim()}%`, limit];
    let sql = `
      SELECT fs.id, fs.name, fs.brand, fs.latitude, fs.longitude, loc.name AS location_name
      FROM fuel_stations fs
      JOIN locations loc ON loc.id = fs.location_id
      WHERE fs.name ILIKE $1
    `;
    if (locationId) {
      params.splice(1, 0, locationId);
      sql += ` AND fs.location_id = $2`;
    }
    sql += ` ORDER BY fs.name ASC LIMIT $${params.length}`;
    const byName = await getPool().query(sql, params);

    let byCoords = { rows: [] };
    if (lat != null && lng != null) {
      byCoords = await getPool().query(
        `SELECT fs.id, fs.name, fs.brand, fs.latitude, fs.longitude,
                (6371 * acos(least(1, greatest(-1,
                  cos(radians($1)) * cos(radians(fs.latitude)) *
                  cos(radians(fs.longitude) - radians($2)) +
                  sin(radians($1)) * sin(radians(fs.latitude))
                )))) AS distance_km
         FROM fuel_stations fs
         WHERE fs.latitude IS NOT NULL AND fs.longitude IS NOT NULL
           AND abs(fs.latitude - $1) < 0.05
           AND abs(fs.longitude - $2) < 0.05
         ORDER BY distance_km ASC
         LIMIT $3`,
        [lat, lng, limit]
      );
    }

    return {
      byName: byName.rows,
      nearby: byCoords.rows.map((r) => ({
        ...r,
        distanceKm: r.distance_km != null ? Number(Number(r.distance_km).toFixed(2)) : null,
      })),
    };
  },

  async updateStation(id, body, admin, req) {
    const current = await this.getStation(id);
    const s = current.station;

    const nextName = body.name != null ? String(body.name).trim() : s.name;
    const nextBrand = body.brand !== undefined ? (body.brand ? String(body.brand).trim() : null) : s.brand;
    const nextAddress =
      body.address !== undefined ? (body.address ? String(body.address).trim() : null) : s.address;
    const nextLandmark =
      body.landmarkLabel !== undefined
        ? body.landmarkLabel
          ? String(body.landmarkLabel).trim()
          : null
        : s.landmarkLabel;
    const nextRoad =
      body.roadName !== undefined ? (body.roadName ? String(body.roadName).trim() : null) : s.roadName;
    const nextLocationId = body.locationId || s.locationId;

    if (nextName.length < 2 || nextName.length > 160) {
      throw new AppError('Station name must be 2–160 characters.', 400, 'VALIDATION_ERROR');
    }

    let lat = s.coordinates?.lat ?? null;
    let lng = s.coordinates?.lng ?? null;
    if (body.latitude !== undefined || body.longitude !== undefined) {
      const v = validateCoords(
        body.latitude === '' ? null : body.latitude,
        body.longitude === '' ? null : body.longitude
      );
      lat = v.lat;
      lng = v.lng;
    }

    let lifecycle = s.lifecycleStatus;
    if (body.lifecycleStatus != null) {
      if (!LIFECYCLE.includes(body.lifecycleStatus)) {
        throw new AppError('Invalid station lifecycle status.', 400, 'VALIDATION_ERROR');
      }
      lifecycle = body.lifecycleStatus;
    } else if (body.isActive != null) {
      lifecycle = body.isActive ? 'active' : 'temporarily_inactive';
    }

    await getPool().query(
      `UPDATE fuel_stations SET
         name = $2, brand = $3, address = $4, landmark_label = $5, road_name = $6,
         location_id = $7, latitude = $8, longitude = $9,
         lifecycle_status = $10::fuel_station_lifecycle,
         updated_at = NOW()
       WHERE id = $1`,
      [id, nextName, nextBrand, nextAddress, nextLandmark, nextRoad, nextLocationId, lat, lng, lifecycle]
    );

    await writeAudit(
      admin,
      {
        action: 'fuel_station.update',
        entityType: 'fuel_station',
        entityId: id,
        previousState: {
          name: s.name,
          brand: s.brand,
          address: s.address,
          locationId: s.locationId,
          coordinates: s.coordinates,
          lifecycleStatus: s.lifecycleStatus,
        },
        newState: {
          name: nextName,
          brand: nextBrand,
          address: nextAddress,
          locationId: nextLocationId,
          coordinates: lat != null ? { lat, lng } : null,
          lifecycleStatus: lifecycle,
        },
        reason: body.reason || 'Admin station correction',
      },
      req
    );

    return this.getStation(id);
  },

  async setLifecycle(id, { lifecycleStatus, isActive, reason }, admin, req) {
    let next = lifecycleStatus;
    if (!next && isActive != null) {
      next = isActive ? 'active' : 'temporarily_inactive';
    }
    return this.updateStation(id, { lifecycleStatus: next, reason: reason || 'Station status updated' }, admin, req);
  },

  async addAlias(stationId, { alias, reason }, admin, req) {
    const clean = String(alias || '').trim();
    if (clean.length < 2 || clean.length > 120) {
      throw new AppError('Alias must be 2–120 characters.', 400, 'VALIDATION_ERROR');
    }
    const station = await getPool().query(`SELECT id, name FROM fuel_stations WHERE id = $1`, [stationId]);
    if (!station.rows[0]) throw new AppError('Fuel station not found.', 404, 'NOT_FOUND');
    if (clean.toLowerCase() === String(station.rows[0].name).toLowerCase()) {
      throw new AppError('Alias must differ from the station name.', 400, 'VALIDATION_ERROR');
    }
    const inserted = await getPool().query(
      `INSERT INTO fuel_station_aliases (station_id, alias, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (station_id, normalized_alias) DO NOTHING
       RETURNING id, alias, created_at`,
      [stationId, clean, admin?.userId || null]
    );
    if (!inserted.rows[0]) {
      throw new AppError('This alias already exists for the station.', 409, 'DUPLICATE_ALIAS');
    }
    await writeAudit(
      admin,
      {
        action: 'fuel_station.alias_add',
        entityType: 'fuel_station',
        entityId: stationId,
        newState: { alias: clean, aliasId: inserted.rows[0].id },
        reason: reason || 'Alias added',
      },
      req
    );
    return inserted.rows[0];
  },

  async removeAlias(stationId, aliasId, { reason }, admin, req) {
    const prev = await getPool().query(
      `SELECT id, alias FROM fuel_station_aliases WHERE id = $1 AND station_id = $2`,
      [aliasId, stationId]
    );
    if (!prev.rows[0]) throw new AppError('Alias not found.', 404, 'NOT_FOUND');
    await getPool().query(`DELETE FROM fuel_station_aliases WHERE id = $1`, [aliasId]);
    await writeAudit(
      admin,
      {
        action: 'fuel_station.alias_remove',
        entityType: 'fuel_station',
        entityId: stationId,
        previousState: { alias: prev.rows[0].alias, aliasId },
        reason: reason || 'Alias removed',
      },
      req
    );
    return { removed: true };
  },

  async brands() {
    const catalogue = await this.listBrandCatalogue({ limit: 200 }).catch(() => null);
    if (catalogue?.items?.length) {
      return catalogue.items.map((b) => b.name);
    }
    const result = await getPool().query(
      `SELECT DISTINCT brand FROM fuel_stations
       WHERE brand IS NOT NULL AND trim(brand) <> ''
       ORDER BY brand ASC
       LIMIT 100`
    );
    return result.rows.map((r) => r.brand);
  },

  async listProducts() {
    const result = await getPool().query(
      `SELECT id, code, name, abbreviation, description, default_unit, is_active, sort_order
       FROM fuel_products
       ORDER BY sort_order ASC, name ASC`
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        abbreviation: r.abbreviation,
        description: r.description,
        defaultUnit: r.default_unit,
        isActive: r.is_active,
        sortOrder: r.sort_order,
      })),
    };
  },

  async listBrandCatalogue({ q, active, limit = 100 } = {}) {
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      const i = params.length;
      where.push(
        `(b.name ILIKE $${i} OR b.code ILIKE $${i} OR EXISTS (
           SELECT 1 FROM fuel_brand_aliases a WHERE a.brand_id = b.id AND a.alias ILIKE $${i}
         ))`
      );
    }
    if (active === true || active === 'true') where.push(`b.is_active = TRUE`);
    if (active === false || active === 'false') where.push(`b.is_active = FALSE`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(Math.min(Number(limit) || 100, 200));

    const result = await getPool().query(
      `SELECT b.*,
              (SELECT array_agg(a.alias ORDER BY a.alias) FROM fuel_brand_aliases a WHERE a.brand_id = b.id) AS aliases,
              (SELECT COUNT(*)::int FROM fuel_stations s WHERE s.brand_id = b.id) AS station_count
       FROM fuel_brands b
       ${whereSql}
       ORDER BY b.is_independent DESC, b.name ASC
       LIMIT $${params.length}`,
      params
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        isIndependent: r.is_independent,
        isActive: r.is_active,
        notes: r.notes,
        aliases: r.aliases || [],
        stationCount: r.station_count || 0,
      })),
    };
  },

  async createBrand(body, admin, req) {
    const name = String(body.name || '').trim();
    const code = String(body.code || name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40);
    if (name.length < 2 || code.length < 2) {
      throw new AppError('Brand name is required.', 400, 'VALIDATION_ERROR');
    }
    const result = await getPool().query(
      `INSERT INTO fuel_brands (code, name, is_independent, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        code,
        name.slice(0, 120),
        Boolean(body.isIndependent),
        body.notes ? String(body.notes).trim().slice(0, 500) : null,
      ]
    );
    const id = result.rows[0].id;
    if (Array.isArray(body.aliases)) {
      for (const alias of body.aliases.slice(0, 20)) {
        const text = String(alias || '').trim();
        if (text.length < 2) continue;
        await getPool().query(
          `INSERT INTO fuel_brand_aliases (brand_id, alias, created_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (brand_id, normalized_alias) DO NOTHING`,
          [id, text.slice(0, 120), admin?.userId || admin?.id || null]
        );
      }
    }
    await writeAudit(
      admin,
      {
        action: 'fuel_brand.create',
        entityType: 'fuel_brand',
        entityId: id,
        previousState: null,
        newState: { code, name },
        reason: body.reason || 'Created fuel brand',
      },
      req
    );
    const listed = await this.listBrandCatalogue({ q: name, limit: 5 });
    return listed.items.find((b) => b.id === id) || { id, code, name };
  },

  async listPriceAnomalies({ limit = 40 } = {}) {
    const lim = Math.min(Number(limit) || 40, 100);
    const result = await getPool().query(
      `WITH peers AS (
         SELECT fr.fuel_type, fr.pricing_context,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY fr.price_amount::float) AS median_price,
                COUNT(*)::int AS peer_count
         FROM fuel_reports fr
         JOIN reports r ON r.id = fr.report_id
         WHERE r.status IN ('submitted','active','confirmed','stale')
           AND fr.price_amount IS NOT NULL
           AND r.created_at >= NOW() - INTERVAL '14 days'
         GROUP BY fr.fuel_type, fr.pricing_context
         HAVING COUNT(*) >= 5
       )
       SELECT fr.id, fr.price_amount::float AS amount, fr.fuel_type, fr.pricing_context::text AS pricing_context,
              fr.price_unit, s.id AS station_id, s.name AS station_name, s.brand,
              r.id AS report_id, r.source_type, r.status, r.created_at,
              p.median_price, p.peer_count
       FROM fuel_reports fr
       JOIN peers p ON p.fuel_type = fr.fuel_type AND p.pricing_context = fr.pricing_context
       JOIN fuel_stations s ON s.id = fr.station_id
       JOIN reports r ON r.id = fr.report_id
       WHERE r.status <> 'removed'
         AND fr.price_amount IS NOT NULL
         AND r.created_at >= NOW() - INTERVAL '14 days'
         AND p.median_price > 0
         AND (
           fr.price_amount::float >= GREATEST(p.median_price * 1.35, p.median_price + 150)
           OR fr.price_amount::float <= GREATEST(p.median_price * 0.6, 1)
           OR fr.price_amount::float > 5000
         )
       ORDER BY ABS(fr.price_amount::float - p.median_price) DESC
       LIMIT $1`,
      [lim]
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        reportId: r.report_id,
        stationId: r.station_id,
        stationName: r.station_name,
        brand: r.brand,
        fuelType: r.fuel_type,
        pricingContext: r.pricing_context,
        unit: r.price_unit,
        amount: Number(r.amount),
        medianPrice: Number(r.median_price),
        peerCount: r.peer_count,
        sourceType: r.source_type,
        status: r.status,
        createdAt: r.created_at,
        flagReason:
          Number(r.amount) > 5000
            ? 'Above hard review bound'
            : Number(r.amount) > Number(r.median_price)
              ? 'Unusually high vs recent median'
              : 'Unusually low vs recent median',
      })),
      note: 'Review signals only — never auto-rejected or deleted.',
    };
  },

  async recordAvailability(body, admin, req) {
    if (!body.stationId) throw new AppError('stationId is required.', 400, 'VALIDATION_ERROR');
    const availability = ['available', 'limited', 'unavailable', 'unknown'].includes(body.availability)
      ? body.availability
      : 'unknown';
    const station = await getPool().query(`SELECT id FROM fuel_stations WHERE id = $1`, [
      body.stationId,
    ]);
    if (!station.rows[0]) throw new AppError('Station not found.', 404, 'NOT_FOUND');

    let productId = body.productId || null;
    let fuelType = body.fuelType || null;
    if (productId) {
      const p = await getPool().query(`SELECT id, code FROM fuel_products WHERE id = $1`, [productId]);
      if (!p.rows[0]) throw new AppError('Product not found.', 404, 'NOT_FOUND');
      fuelType = fuelType || p.rows[0].code;
    } else if (fuelType) {
      const p = await getPool().query(`SELECT id FROM fuel_products WHERE code = $1`, [fuelType]);
      productId = p.rows[0]?.id || null;
    } else {
      throw new AppError('productId or fuelType is required.', 400, 'VALIDATION_ERROR');
    }

    const result = await getPool().query(
      `INSERT INTO fuel_availability_observations (
         station_id, product_id, fuel_type, availability, observed_at, source_type, notes, created_by
       ) VALUES ($1,$2,$3::fuel_product_type,$4::fuel_availability,$5,$6,$7,$8)
       RETURNING id`,
      [
        body.stationId,
        productId,
        fuelType,
        availability,
        body.observedAt || new Date(),
        ['community', 'official', 'admin', 'system'].includes(body.sourceType)
          ? body.sourceType
          : 'admin',
        body.notes ? String(body.notes).trim().slice(0, 500) : null,
        admin?.userId || admin?.id || null,
      ]
    );

    await writeAudit(
      admin,
      {
        action: 'fuel_availability.create',
        entityType: 'fuel_station',
        entityId: body.stationId,
        previousState: null,
        newState: { availability, fuelType, observationId: result.rows[0].id },
        reason: body.reason || 'Recorded availability observation',
      },
      req
    );

    return {
      id: result.rows[0].id,
      stationId: body.stationId,
      fuelType,
      availability,
    };
  },

  async mergeStations(body, admin, req) {
    const survivorId = body.survivorStationId;
    const mergedId = body.mergedStationId;
    if (!survivorId || !mergedId) {
      throw new AppError('survivorStationId and mergedStationId are required.', 400, 'VALIDATION_ERROR');
    }
    if (survivorId === mergedId) {
      throw new AppError('Cannot merge a station into itself.', 400, 'VALIDATION_ERROR');
    }
    if (!body.reason || String(body.reason).trim().length < 3) {
      throw new AppError('A merge reason is required.', 400, 'VALIDATION_ERROR');
    }

    const stations = await getPool().query(
      `SELECT id, name FROM fuel_stations WHERE id = ANY($1::uuid[])`,
      [[survivorId, mergedId]]
    );
    if (stations.rows.length !== 2) throw new AppError('Station not found.', 404, 'NOT_FOUND');

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const movedReports = await client.query(
        `UPDATE fuel_reports SET station_id = $1, updated_at = NOW()
         WHERE station_id = $2
         RETURNING id`,
        [survivorId, mergedId]
      );
      const movedAvail = await client.query(
        `UPDATE fuel_availability_observations SET station_id = $1
         WHERE station_id = $2
         RETURNING id`,
        [survivorId, mergedId]
      ).catch(() => ({ rowCount: 0 }));
      const aliases = await client.query(
        `UPDATE fuel_station_aliases SET station_id = $1
         WHERE station_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM fuel_station_aliases x
           WHERE x.station_id = $1 AND x.normalized_alias = fuel_station_aliases.normalized_alias
         )
         RETURNING id`,
        [survivorId, mergedId]
      );
      await client.query(`DELETE FROM fuel_station_aliases WHERE station_id = $1`, [mergedId]);
      const mergedName = stations.rows.find((s) => s.id === mergedId)?.name;
      if (mergedName) {
        await client.query(
          `INSERT INTO fuel_station_aliases (station_id, alias, created_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (station_id, normalized_alias) DO NOTHING`,
          [survivorId, String(mergedName).slice(0, 120), admin?.userId || admin?.id || null]
        );
      }
      await client.query(
        `UPDATE fuel_stations
         SET lifecycle_status = 'permanently_inactive'::fuel_station_lifecycle,
             is_active = FALSE,
             updated_at = NOW()
         WHERE id = $1`,
        [mergedId]
      );
      await client.query(
        `INSERT INTO fuel_station_merges (
           survivor_station_id, merged_station_id, reason, reports_moved, aliases_moved, performed_by
         ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          survivorId,
          mergedId,
          String(body.reason).trim().slice(0, 1000),
          movedReports.rowCount || 0,
          aliases.rowCount || 0,
          admin?.userId || admin?.id || null,
        ]
      );
      await client.query('COMMIT');

      await writeAudit(
        admin,
        {
          action: 'fuel_station.merge',
          entityType: 'fuel_station',
          entityId: survivorId,
          previousState: { mergedStationId: mergedId },
          newState: {
            survivorStationId: survivorId,
            reportsMoved: movedReports.rowCount || 0,
            aliasesMoved: aliases.rowCount || 0,
            availabilityMoved: movedAvail.rowCount || 0,
          },
          reason: body.reason,
        },
        req
      );

      return {
        survivorStationId: survivorId,
        mergedStationId: mergedId,
        reportsMoved: movedReports.rowCount || 0,
        aliasesMoved: aliases.rowCount || 0,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async compareNearby({ locationId, lat, lng, fuelType = 'pms', radiusKm = 5, limit = 20 } = {}) {
    const { fuelService } = await import('./fuelService.js');
    let raw;
    if (lat != null && lng != null) {
      raw = await fuelService.nearbyStations({
        lat: Number(lat),
        lng: Number(lng),
        radiusKm: Number(radiusKm) || 5,
        fuelType,
        limit: Math.min(Number(limit) || 20, 50),
      });
    } else if (locationId) {
      raw = await fuelService.listStations({
        locationId,
        fuelType,
        page: 1,
        limit: Math.min(Number(limit) || 20, 50),
      });
    } else {
      throw new AppError('locationId or coordinates required.', 400, 'VALIDATION_ERROR');
    }

    const stations = Array.isArray(raw) ? raw : raw.items || raw.stations || [];

    const items = stations
      .map((s) => {
        const latestList = s.latestReports || s.latestPrices || [];
        const latest =
          (Array.isArray(latestList)
            ? latestList.find((p) => (p.fuelType || p.fuel_type) === fuelType)
            : null) ||
          s.latestReport ||
          null;
        const amount =
          latest?.price?.amount ??
          latest?.priceAmount ??
          latest?.price_amount ??
          latest?.amount ??
          (typeof latest?.price === 'number' ? latest.price : null);
        return {
          stationId: s.id,
          name: s.name,
          brand: s.brand || s.brandName || null,
          distanceKm: s.distanceKm ?? s.distance ?? null,
          fuelType,
          price: amount != null ? Number(amount) : null,
          unit: latest?.price?.unit || latest?.priceUnit || latest?.price_unit || latest?.unit || 'litre',
          currency: latest?.price?.currency || latest?.priceCurrency || latest?.price_currency || 'NGN',
          pricingContext: latest?.pricingContext || latest?.pricing_context || 'retail_pump',
          freshness: latest?.freshness || s.freshness || null,
          observedAt:
            latest?.observedAt ||
            latest?.occurredAt ||
            latest?.createdAt ||
            latest?.created_at ||
            null,
          sourceType: latest?.sourceType || latest?.source_type || null,
          availability: latest?.availability || null,
          trustLabel: latest?.trustLabel || null,
        };
      })
      .filter((row) => row.price != null);

    // Prefer fresher observations over purely cheapest/stale prices
    items.sort((a, b) => {
      const freshRank = (f) =>
        f === 'fresh' || f?.state === 'fresh' ? 0 : f === 'aging' || f?.state === 'aging' ? 1 : 2;
      const fa = freshRank(a.freshness);
      const fb = freshRank(b.freshness);
      if (fa !== fb) return fa - fb;
      const da = a.distanceKm ?? 999;
      const db = b.distanceKm ?? 999;
      if (da !== db) return da - db;
      return (a.price || 0) - (b.price || 0);
    });

    return {
      fuelType,
      items,
      note: 'Comparison uses recent eligible observations — never treats aggregates as official prices. Freshness ranks ahead of distance and price.',
    };
  },
};

export default fuelAdminService;
