import { getPool } from '../db/pool.js';
import { fareUnitLabel, transportModeLabel } from '../config/transport.js';

function computeTrustLabels(row) {
  const labels = [];
  if (row.source_type === 'official') labels.push('Official');
  else if (row.source_type === 'aggregated') labels.push('Aggregated');
  else labels.push('Community Report');
  if (row.status === 'confirmed' || Number(row.confirmed_accurate_count) > 0) {
    labels.push('Community Confirmed');
  }
  if (
    row.updated_at &&
    row.created_at &&
    new Date(row.updated_at).getTime() > new Date(row.created_at).getTime() + 1000
  ) {
    labels.push('Updated');
  }
  if (row.status === 'stale') labels.push('Stale');
  if (row.status === 'expired') labels.push('Expired');
  return [...new Set(labels)];
}

function computeFreshnessLabel(row, now = new Date()) {
  if (row.status === 'expired' || (row.expires_at && new Date(row.expires_at) <= now)) {
    return 'expired';
  }
  if (row.status === 'stale') return 'stale';
  const anchor = row.last_confirmed_at || row.occurred_at || row.created_at;
  if (!anchor) return 'fresh';
  const ageMs = now - new Date(anchor);
  const staleMs = (row.stale_after_minutes || 120) * 60 * 1000;
  if (ageMs >= staleMs) return 'stale';
  return 'fresh';
}

function mapLocationSide(prefix, row) {
  const id = row[`${prefix}_location_id`];
  if (!id) return null;
  return {
    id,
    name: row[`${prefix}_location_name`],
    type: row[`${prefix}_location_type`],
    slug: row[`${prefix}_location_slug`],
    subtitle: row[`${prefix}_location_subtitle`],
    state: row[`${prefix}_state_name`]
      ? {
          id: row[`${prefix}_state_id`],
          name: row[`${prefix}_state_name`],
          code: row[`${prefix}_state_code`],
        }
      : null,
    lga: row[`${prefix}_lga_name`]
      ? { id: row[`${prefix}_lga_id`], name: row[`${prefix}_lga_name`] }
      : null,
    area: row[`${prefix}_area_name`]
      ? { id: row[`${prefix}_area_id`], name: row[`${prefix}_area_name`] }
      : null,
    coordinates:
      row[`${prefix}_lat`] != null && row[`${prefix}_lng`] != null
        ? { lat: Number(row[`${prefix}_lat`]), lng: Number(row[`${prefix}_lng`]) }
        : null,
  };
}

function defaultRouteName(originName, destinationName, explicitName) {
  if (explicitName?.trim()) return explicitName.trim();
  if (originName && destinationName) return `${originName} → ${destinationName}`;
  return 'Transport route';
}

function mapRoute(row) {
  if (!row) return null;
  const origin = mapLocationSide('origin', row);
  const destination = mapLocationSide('destination', row);
  return {
    id: row.route_id || row.id,
    name: defaultRouteName(origin?.name, destination?.name, row.route_name || row.name),
    primaryMode: row.primary_mode || null,
    primaryModeLabel: row.primary_mode ? transportModeLabel(row.primary_mode) : null,
    isActive: row.is_active !== false,
    origin,
    destination,
    stops: row.stops || [],
    fareSummary: row.fare_summary || undefined,
    createdAt: row.route_created_at || row.created_at,
    updatedAt: row.route_updated_at || row.updated_at,
  };
}

function mapFare(row) {
  if (!row) return null;
  const freshness = computeFreshnessLabel(row);
  return {
    id: row.fare_id,
    reportId: row.report_id,
    routeId: row.route_id,
    transportMode: row.transport_mode,
    transportModeLabel: transportModeLabel(row.transport_mode),
    fare: {
      amount: Number(row.fare_amount),
      currency: row.fare_currency || 'NGN',
      unit: row.fare_unit || 'trip',
      unitLabel: fareUnitLabel(row.fare_unit || 'trip'),
    },
    boardingPointLabel: row.boarding_point_label || null,
    alightingPointLabel: row.alighting_point_label || null,
    route: {
      id: row.route_id,
      name: defaultRouteName(
        row.origin_location_name,
        row.destination_location_name,
        row.route_name
      ),
    },
    origin: mapLocationSide('origin', row),
    destination: mapLocationSide('destination', row),
    report: {
      id: row.report_id,
      title: row.title,
      description: row.description,
      sourceType: row.source_type,
      status: row.status,
      visibility: row.visibility,
      moderationState: row.moderation_state,
      freshness,
      trustLabels: computeTrustLabels(row),
      occurredAt: row.occurred_at,
      expiresAt: row.expires_at,
      lastConfirmedAt: row.last_confirmed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      confirmation: {
        stillAccurate: Number(row.confirmed_accurate_count || 0),
        noLongerAccurate: Number(row.confirmed_inaccurate_count || 0),
      },
      author: {
        id: row.user_id,
        displayName: row.author_display_name || null,
      },
    },
    createdAt: row.fare_created_at || row.created_at,
    updatedAt: row.fare_updated_at || row.updated_at,
  };
}

function locationSideSelect(alias, prefix) {
  return `
  ${alias}.id AS ${prefix}_location_id,
  ${alias}.name AS ${prefix}_location_name,
  ${alias}.type AS ${prefix}_location_type,
  ${alias}.slug AS ${prefix}_location_slug,
  ${alias}.latitude AS ${prefix}_lat,
  ${alias}.longitude AS ${prefix}_lng,
  ${alias}.state_id AS ${prefix}_state_id,
  ${alias}.lga_id AS ${prefix}_lga_id,
  ${alias}.area_id AS ${prefix}_area_id,
  ${prefix}_s.name AS ${prefix}_state_name,
  ${prefix}_s.code AS ${prefix}_state_code,
  ${prefix}_l.name AS ${prefix}_lga_name,
  ${prefix}_a.name AS ${prefix}_area_name,
  CASE
    WHEN ${alias}.type = 'area' THEN
      CONCAT_WS(' · ',
        CASE WHEN ${prefix}_l.name IS NOT NULL THEN ${prefix}_l.name || ' LGA' END,
        CASE
          WHEN ${prefix}_s.code = 'FC' THEN ${prefix}_s.name
          WHEN ${prefix}_s.name IS NOT NULL THEN ${prefix}_s.name || ' State'
        END
      )
    WHEN ${alias}.type = 'lga' THEN
      CASE
        WHEN ${prefix}_s.code = 'FC' THEN ${prefix}_s.name
        WHEN ${prefix}_s.name IS NOT NULL THEN ${prefix}_s.name || ' State'
      END
    ELSE ${prefix}_s.name
  END AS ${prefix}_location_subtitle
`;
}

function locationSideJoins(alias, prefix) {
  return `
  LEFT JOIN states ${prefix}_s ON ${prefix}_s.id = ${alias}.state_id
  LEFT JOIN lgas ${prefix}_l ON ${prefix}_l.id = ${alias}.lga_id
  LEFT JOIN areas ${prefix}_a ON ${prefix}_a.id = ${alias}.area_id
`;
}

const routeSelect = `
  tr.id AS route_id,
  tr.name AS route_name,
  tr.primary_mode,
  tr.is_active,
  tr.created_at AS route_created_at,
  tr.updated_at AS route_updated_at,
  ${locationSideSelect('oloc', 'origin')},
  ${locationSideSelect('dloc', 'destination')}
`;

const routeJoins = `
  FROM transport_routes tr
  JOIN locations oloc ON oloc.id = tr.origin_location_id
  JOIN locations dloc ON dloc.id = tr.destination_location_id
  ${locationSideJoins('oloc', 'origin')}
  ${locationSideJoins('dloc', 'destination')}
`;

const fareSelect = `
  tfr.id AS fare_id,
  tfr.report_id,
  tfr.route_id,
  tfr.transport_mode,
  tfr.fare_amount,
  tfr.fare_currency,
  tfr.fare_unit,
  tfr.boarding_point_label,
  tfr.alighting_point_label,
  tfr.created_at AS fare_created_at,
  tfr.updated_at AS fare_updated_at,
  tr.name AS route_name,
  r.user_id,
  r.title,
  r.description,
  r.source_type,
  r.status,
  r.visibility,
  r.moderation_state,
  r.occurred_at,
  r.expires_at,
  r.last_confirmed_at,
  r.confirmed_accurate_count,
  r.confirmed_inaccurate_count,
  r.created_at,
  r.updated_at,
  u.display_name AS author_display_name,
  p.stale_after_minutes,
  ${locationSideSelect('oloc', 'origin')},
  ${locationSideSelect('dloc', 'destination')}
`;

const fareJoins = `
  FROM transport_fare_reports tfr
  JOIN transport_routes tr ON tr.id = tfr.route_id
  JOIN reports r ON r.id = tfr.report_id
  JOIN report_categories c ON c.id = r.category_id AND c.code = 'transport'
  JOIN locations oloc ON oloc.id = tfr.origin_location_id
  JOIN locations dloc ON dloc.id = tfr.destination_location_id
  ${locationSideJoins('oloc', 'origin')}
  ${locationSideJoins('dloc', 'destination')}
  JOIN users u ON u.id = r.user_id
  LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
`;

function freshnessClause(freshness) {
  if (freshness === 'expired') {
    return `(r.status = 'expired' OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW()))`;
  }
  if (freshness === 'stale') return `r.status = 'stale'`;
  if (freshness === 'fresh') {
    return `r.status IN ('submitted','active','confirmed') AND (r.expires_at IS NULL OR r.expires_at > NOW())`;
  }
  return `r.status <> 'removed'`;
}

function buildFareRange(amounts, latestOccurredAt, reportCount, freshness) {
  if (!amounts.length) return null;
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return {
    currency: 'NGN',
    min,
    max,
    isRange: min !== max,
    reportCount,
    mostRecentAt: latestOccurredAt,
    freshness: freshness || 'fresh',
  };
}

async function loadStops(routeIds) {
  if (!routeIds.length) return new Map();
  const result = await getPool().query(
    `SELECT s.route_id, s.id, s.stop_order, s.label, s.location_id,
            loc.name AS location_name, loc.type AS location_type
     FROM transport_route_stops s
     LEFT JOIN locations loc ON loc.id = s.location_id
     WHERE s.route_id = ANY($1::uuid[])
     ORDER BY s.route_id, s.stop_order ASC`,
    [routeIds]
  );
  const map = new Map();
  for (const row of result.rows) {
    if (!map.has(row.route_id)) map.set(row.route_id, []);
    map.get(row.route_id).push({
      id: row.id,
      stopOrder: row.stop_order,
      label: row.label || row.location_name || null,
      location: row.location_id
        ? { id: row.location_id, name: row.location_name, type: row.location_type }
        : null,
    });
  }
  return map;
}

async function attachFareSummaries(routes, { mode = null, freshness = 'any' } = {}) {
  if (!routes.length) return routes;
  const pool = getPool();
  const ids = routes.map((r) => r.id);
  const params = [ids];
  const modeClause = mode ? `AND tfr.transport_mode = $${params.push(mode)}` : '';
  const result = await pool.query(
    `SELECT
       tfr.route_id,
       tfr.transport_mode,
       MIN(tfr.fare_amount)::float AS min_fare,
       MAX(tfr.fare_amount)::float AS max_fare,
       COUNT(*)::int AS report_count,
       MAX(COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)) AS most_recent_at,
       (ARRAY_AGG(tfr.boarding_point_label ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC)
         FILTER (WHERE tfr.boarding_point_label IS NOT NULL))[1] AS boarding_point_label
     FROM transport_fare_reports tfr
     JOIN reports r ON r.id = tfr.report_id
     WHERE tfr.route_id = ANY($1::uuid[])
       AND r.visibility = 'public'
       AND ${freshnessClause(freshness)}
       ${modeClause}
     GROUP BY tfr.route_id, tfr.transport_mode
     ORDER BY tfr.route_id, most_recent_at DESC`,
    params
  );

  const byRoute = new Map();
  for (const row of result.rows) {
    if (!byRoute.has(row.route_id)) byRoute.set(row.route_id, []);
    const min = Number(row.min_fare);
    const max = Number(row.max_fare);
    byRoute.get(row.route_id).push({
      transportMode: row.transport_mode,
      transportModeLabel: transportModeLabel(row.transport_mode),
      fareRange: buildFareRange(
        [min, max],
        row.most_recent_at,
        row.report_count,
        freshness === 'any' ? 'mixed' : freshness
      ),
      boardingPointLabel: row.boarding_point_label || null,
      reportCount: row.report_count,
      mostRecentAt: row.most_recent_at,
    });
  }

  return routes.map((route) => ({
    ...route,
    fareSummary: byRoute.get(route.id) || [],
  }));
}

export const transportRepository = {
  mapRoute,
  mapFare,
  buildFareRange,

  async createRoute(fields) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO transport_routes (
           name, origin_location_id, destination_location_id, primary_mode, created_by
         ) VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [
          fields.name?.trim() || null,
          fields.originLocationId,
          fields.destinationLocationId,
          fields.primaryMode || null,
          fields.createdBy || null,
        ]
      );
      const routeId = result.rows[0].id;
      if (fields.stops?.length) {
        for (const stop of fields.stops) {
          await client.query(
            `INSERT INTO transport_route_stops (route_id, location_id, stop_order, label)
             VALUES ($1,$2,$3,$4)`,
            [
              routeId,
              stop.locationId || null,
              stop.stopOrder,
              stop.label?.trim() || null,
            ]
          );
        }
      }
      await client.query('COMMIT');
      return this.findRouteById(routeId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async findRouteById(id) {
    const result = await getPool().query(
      `SELECT ${routeSelect} ${routeJoins} WHERE tr.id = $1`,
      [id]
    );
    const route = mapRoute(result.rows[0]);
    if (!route) return null;
    const stops = await loadStops([route.id]);
    route.stops = stops.get(route.id) || [];
    const [decorated] = await attachFareSummaries([route], { freshness: 'any' });
    return decorated;
  },

  async findRouteRawByEnds(originLocationId, destinationLocationId) {
    const result = await getPool().query(
      `SELECT id FROM transport_routes
       WHERE origin_location_id = $1
         AND destination_location_id = $2
         AND is_active = TRUE
       LIMIT 1`,
      [originLocationId, destinationLocationId]
    );
    return result.rows[0] || null;
  },

  async listRoutes({
    originLocationId = null,
    destinationLocationId = null,
    locationId = null,
    mode = null,
    q = null,
    freshness = 'any',
    activeOnly = true,
    page = 1,
    limit = 20,
  } = {}) {
    const where = [];
    const params = [];
    if (activeOnly) where.push(`tr.is_active = TRUE`);
    if (originLocationId) {
      params.push(originLocationId);
      where.push(`tr.origin_location_id = $${params.length}`);
    }
    if (destinationLocationId) {
      params.push(destinationLocationId);
      where.push(`tr.destination_location_id = $${params.length}`);
    }
    if (locationId) {
      params.push(locationId);
      where.push(
        `(tr.origin_location_id = $${params.length} OR tr.destination_location_id = $${params.length})`
      );
    }
    if (mode) {
      params.push(mode);
      where.push(
        `(tr.primary_mode = $${params.length} OR EXISTS (
           SELECT 1 FROM transport_fare_reports tfr
           JOIN reports r ON r.id = tfr.report_id
           WHERE tfr.route_id = tr.id AND tfr.transport_mode = $${params.length}
             AND ${freshnessClause(freshness)}
         ))`
      );
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where.push(
        `(lower(COALESCE(tr.name,'')) LIKE $${params.length}
          OR lower(oloc.name) LIKE $${params.length}
          OR lower(dloc.name) LIKE $${params.length})`
      );
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await getPool().query(
      `SELECT COUNT(*)::int AS total ${routeJoins} ${whereSql}`,
      params
    );
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const result = await getPool().query(
      `SELECT ${routeSelect} ${routeJoins} ${whereSql}
       ORDER BY tr.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    let routes = result.rows.map(mapRoute);
    const stops = await loadStops(routes.map((r) => r.id));
    routes = routes.map((r) => ({ ...r, stops: stops.get(r.id) || [] }));
    routes = await attachFareSummaries(routes, { mode, freshness });

    return {
      items: routes,
      page,
      limit,
      total: countResult.rows[0].total,
    };
  },

  async searchRoutes({
    originLocationId,
    destinationLocationId,
    mode = null,
    freshness = 'fresh',
    limit = 20,
  }) {
    const listed = await this.listRoutes({
      originLocationId,
      destinationLocationId,
      mode,
      freshness,
      page: 1,
      limit,
    });
    return listed.items;
  },

  async createFareReport(fields) {
    const result = await getPool().query(
      `INSERT INTO transport_fare_reports (
         report_id, route_id, transport_mode,
         origin_location_id, destination_location_id,
         fare_amount, fare_currency, fare_unit,
         boarding_point_label, alighting_point_label
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        fields.reportId,
        fields.routeId,
        fields.transportMode,
        fields.originLocationId,
        fields.destinationLocationId,
        fields.fareAmount,
        fields.fareCurrency || 'NGN',
        fields.fareUnit || 'trip',
        fields.boardingPointLabel?.trim() || null,
        fields.alightingPointLabel?.trim() || null,
      ]
    );
    return this.findFareById(result.rows[0].id);
  },

  async findFareById(id) {
    const result = await getPool().query(
      `SELECT ${fareSelect} ${fareJoins} WHERE tfr.id = $1`,
      [id]
    );
    return mapFare(result.rows[0]);
  },

  async findRawFareById(id) {
    const result = await getPool().query(
      `SELECT id, report_id, route_id FROM transport_fare_reports WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findRecentDuplicateFare({ userId, routeId, transportMode, withinMinutes = 60 }) {
    const result = await getPool().query(
      `SELECT tfr.id
       FROM transport_fare_reports tfr
       JOIN reports r ON r.id = tfr.report_id
       WHERE r.user_id = $1
         AND tfr.route_id = $2
         AND tfr.transport_mode = $3
         AND r.status <> 'removed'
         AND r.created_at >= NOW() - ($4::text || ' minutes')::interval
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [userId, routeId, transportMode, withinMinutes]
    );
    return result.rows[0] || null;
  },

  async listFares({
    routeId = null,
    originLocationId = null,
    destinationLocationId = null,
    locationId = null,
    mode = null,
    freshness = 'fresh',
    sourceType = null,
    page = 1,
    limit = 20,
  } = {}) {
    const where = [`r.visibility = 'public'`, freshnessClause(freshness)];
    const params = [];
    if (routeId) {
      params.push(routeId);
      where.push(`tfr.route_id = $${params.length}`);
    }
    if (originLocationId) {
      params.push(originLocationId);
      where.push(`tfr.origin_location_id = $${params.length}`);
    }
    if (destinationLocationId) {
      params.push(destinationLocationId);
      where.push(`tfr.destination_location_id = $${params.length}`);
    }
    if (locationId) {
      params.push(locationId);
      where.push(
        `(tfr.origin_location_id = $${params.length}
          OR tfr.destination_location_id = $${params.length}
          OR tr.origin_location_id = $${params.length}
          OR tr.destination_location_id = $${params.length})`
      );
    }
    if (mode) {
      params.push(mode);
      where.push(`tfr.transport_mode = $${params.length}`);
    }
    if (sourceType) {
      params.push(sourceType);
      where.push(`r.source_type = $${params.length}`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const countResult = await getPool().query(
      `SELECT COUNT(*)::int AS total ${fareJoins} ${whereSql}`,
      params
    );
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const result = await getPool().query(
      `SELECT ${fareSelect} ${fareJoins} ${whereSql}
       ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      items: result.rows.map(mapFare),
      page,
      limit,
      total: countResult.rows[0].total,
    };
  },

  async fareRangeForRoute(routeId, { mode = null, freshness = 'fresh' } = {}) {
    const params = [routeId];
    const modeClause = mode ? `AND tfr.transport_mode = $${params.push(mode)}` : '';
    const result = await getPool().query(
      `SELECT
         tfr.transport_mode,
         MIN(tfr.fare_amount)::float AS min_fare,
         MAX(tfr.fare_amount)::float AS max_fare,
         COUNT(*)::int AS report_count,
         MAX(COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)) AS most_recent_at
       FROM transport_fare_reports tfr
       JOIN reports r ON r.id = tfr.report_id
       WHERE tfr.route_id = $1
         AND r.visibility = 'public'
         AND ${freshnessClause(freshness)}
         ${modeClause}
       GROUP BY tfr.transport_mode
       ORDER BY most_recent_at DESC`,
      params
    );
    return result.rows.map((row) => ({
      transportMode: row.transport_mode,
      transportModeLabel: transportModeLabel(row.transport_mode),
      fareRange: buildFareRange(
        [Number(row.min_fare), Number(row.max_fare)],
        row.most_recent_at,
        row.report_count,
        freshness
      ),
      reportCount: row.report_count,
      mostRecentAt: row.most_recent_at,
    }));
  },

  async summary({ locationId = null } = {}) {
    const params = [];
    const locationClause = locationId
      ? `AND (tfr.origin_location_id = $${params.push(locationId)}
           OR tfr.destination_location_id = $${params.length}
           OR tr.origin_location_id = $${params.length}
           OR tr.destination_location_id = $${params.length})`
      : '';
    const result = await getPool().query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE tfr.transport_mode = 'bus')::int AS bus,
         COUNT(*) FILTER (WHERE tfr.transport_mode = 'danfo')::int AS danfo,
         COUNT(*) FILTER (WHERE tfr.transport_mode = 'keke')::int AS keke,
         COUNT(*) FILTER (WHERE tfr.transport_mode = 'okada')::int AS okada,
         COUNT(*) FILTER (WHERE tfr.transport_mode = 'brt')::int AS brt
       FROM transport_fare_reports tfr
       JOIN transport_routes tr ON tr.id = tfr.route_id
       JOIN reports r ON r.id = tfr.report_id
       WHERE r.visibility = 'public'
         AND ${freshnessClause('fresh')}
         ${locationClause}`,
      params
    );
    const row = result.rows[0] || {};
    return {
      total: row.total || 0,
      byMode: {
        bus: row.bus || 0,
        danfo: row.danfo || 0,
        keke: row.keke || 0,
        okada: row.okada || 0,
        brt: row.brt || 0,
      },
    };
  },
};
