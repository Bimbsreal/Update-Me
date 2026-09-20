import { getPool } from '../db/pool.js';
import {
  availabilityLabel,
  fuelTypeLabel,
  queueLabel,
} from '../config/fuel.js';

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

function mapStation(row) {
  if (!row) return null;
  return {
    id: row.station_id || row.id,
    name: row.station_name || row.name,
    brand: row.brand || null,
    address: row.address || null,
    landmarkLabel: row.landmark_label || null,
    roadName: row.road_name || null,
    isActive: row.is_active !== false,
    location: {
      id: row.location_id,
      name: row.location_name,
      type: row.location_type,
      slug: row.location_slug,
      subtitle: row.location_subtitle,
      state: row.state_name
        ? { id: row.state_id, name: row.state_name, code: row.state_code }
        : null,
      lga: row.lga_name ? { id: row.lga_id, name: row.lga_name } : null,
      area: row.area_name ? { id: row.area_id, name: row.area_name } : null,
    },
    coordinates:
      row.station_latitude != null && row.station_longitude != null
        ? { lat: Number(row.station_latitude), lng: Number(row.station_longitude) }
        : row.latitude != null && row.longitude != null
          ? { lat: Number(row.latitude), lng: Number(row.longitude) }
          : null,
    map: {
      ready:
        (row.station_latitude != null && row.station_longitude != null) ||
        (row.latitude != null && row.longitude != null),
      lat:
        row.station_latitude != null
          ? Number(row.station_latitude)
          : row.latitude != null
            ? Number(row.latitude)
            : null,
      lng:
        row.station_longitude != null
          ? Number(row.station_longitude)
          : row.longitude != null
            ? Number(row.longitude)
            : null,
    },
    distanceKm:
      row.distance_km != null ? Number(Number(row.distance_km).toFixed(2)) : undefined,
    latestReports: row.latest_reports || undefined,
    createdAt: row.station_created_at || row.created_at,
    updatedAt: row.station_updated_at || row.updated_at,
  };
}

function mapFuelReport(row) {
  if (!row) return null;
  const freshness = computeFreshnessLabel(row);
  return {
    id: row.fuel_id,
    reportId: row.report_id,
    stationId: row.station_id,
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
    queueCondition: row.queue_condition || null,
    queueConditionLabel: queueLabel(row.queue_condition),
    station: {
      id: row.station_id,
      name: row.station_name,
      brand: row.brand || null,
      address: row.address || null,
    },
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
    location: {
      id: row.location_id,
      name: row.location_name,
      type: row.location_type,
      slug: row.location_slug,
      subtitle: row.location_subtitle,
      state: row.state_name
        ? { id: row.state_id, name: row.state_name, code: row.state_code }
        : null,
      lga: row.lga_name ? { id: row.lga_id, name: row.lga_name } : null,
      area: row.area_name ? { id: row.area_id, name: row.area_name } : null,
    },
    coordinates:
      row.station_latitude != null && row.station_longitude != null
        ? { lat: Number(row.station_latitude), lng: Number(row.station_longitude) }
        : row.latitude != null && row.longitude != null
          ? { lat: Number(row.latitude), lng: Number(row.longitude) }
          : null,
    distanceKm:
      row.distance_km != null ? Number(Number(row.distance_km).toFixed(2)) : undefined,
    createdAt: row.fuel_created_at || row.created_at,
    updatedAt: row.fuel_updated_at || row.updated_at,
  };
}

const stationSelect = `
  fs.id AS station_id,
  fs.name AS station_name,
  fs.brand,
  fs.address,
  fs.landmark_label,
  fs.road_name,
  fs.is_active,
  fs.latitude AS station_latitude,
  fs.longitude AS station_longitude,
  fs.created_at AS station_created_at,
  fs.updated_at AS station_updated_at,
  fs.location_id,
  loc.name AS location_name,
  loc.type AS location_type,
  loc.slug AS location_slug,
  loc.latitude,
  loc.longitude,
  loc.state_id,
  loc.lga_id,
  loc.area_id,
  s.name AS state_name,
  s.code AS state_code,
  l.name AS lga_name,
  a.name AS area_name,
  CASE
    WHEN loc.type = 'area' THEN
      CONCAT_WS(' · ',
        CASE WHEN l.name IS NOT NULL THEN l.name || ' LGA' END,
        CASE
          WHEN s.code = 'FC' THEN s.name
          WHEN s.name IS NOT NULL THEN s.name || ' State'
        END
      )
    WHEN loc.type = 'lga' THEN
      CASE
        WHEN s.code = 'FC' THEN s.name
        WHEN s.name IS NOT NULL THEN s.name || ' State'
      END
    ELSE s.name
  END AS location_subtitle
`;

const stationJoins = `
  FROM fuel_stations fs
  JOIN locations loc ON loc.id = fs.location_id
  LEFT JOIN states s ON s.id = loc.state_id
  LEFT JOIN lgas l ON l.id = loc.lga_id
  LEFT JOIN areas a ON a.id = loc.area_id
`;

const reportSelect = `
  fr.id AS fuel_id,
  fr.report_id,
  fr.station_id,
  fr.fuel_type,
  fr.availability,
  fr.price_amount,
  fr.price_currency,
  fr.price_unit,
  fr.queue_condition,
  fr.created_at AS fuel_created_at,
  fr.updated_at AS fuel_updated_at,
  fs.name AS station_name,
  fs.brand,
  fs.address,
  fs.latitude AS station_latitude,
  fs.longitude AS station_longitude,
  r.user_id,
  r.location_id,
  r.title,
  r.description,
  r.source_type,
  r.status,
  r.visibility,
  r.moderation_state,
  r.latitude,
  r.longitude,
  r.occurred_at,
  r.expires_at,
  r.last_confirmed_at,
  r.confirmed_accurate_count,
  r.confirmed_inaccurate_count,
  r.created_at,
  r.updated_at,
  loc.name AS location_name,
  loc.type AS location_type,
  loc.slug AS location_slug,
  loc.state_id,
  loc.lga_id,
  loc.area_id,
  st.name AS state_name,
  st.code AS state_code,
  lg.name AS lga_name,
  ar.name AS area_name,
  u.display_name AS author_display_name,
  p.stale_after_minutes,
  CASE
    WHEN loc.type = 'area' THEN
      CONCAT_WS(' · ',
        CASE WHEN lg.name IS NOT NULL THEN lg.name || ' LGA' END,
        CASE
          WHEN st.code = 'FC' THEN st.name
          WHEN st.name IS NOT NULL THEN st.name || ' State'
        END
      )
    WHEN loc.type = 'lga' THEN
      CASE
        WHEN st.code = 'FC' THEN st.name
        WHEN st.name IS NOT NULL THEN st.name || ' State'
      END
    ELSE st.name
  END AS location_subtitle
`;

const reportJoins = `
  FROM fuel_reports fr
  JOIN fuel_stations fs ON fs.id = fr.station_id
  JOIN reports r ON r.id = fr.report_id
  JOIN report_categories c ON c.id = r.category_id AND c.code = 'fuel'
  JOIN locations loc ON loc.id = r.location_id
  LEFT JOIN states st ON st.id = loc.state_id
  LEFT JOIN lgas lg ON lg.id = loc.lga_id
  LEFT JOIN areas ar ON ar.id = loc.area_id
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

async function attachLatestReports(stations) {
  if (!stations.length) return stations;
  const pool = getPool();
  const ids = stations.map((s) => s.id);
  const result = await pool.query(
    `SELECT DISTINCT ON (fr.station_id, fr.fuel_type)
       fr.station_id,
       fr.id AS fuel_id,
       fr.fuel_type,
       fr.availability,
       fr.price_amount,
       fr.price_currency,
       fr.price_unit,
       fr.queue_condition,
       r.source_type,
       r.status,
       r.last_confirmed_at,
       r.occurred_at,
       r.created_at,
       r.expires_at,
       r.confirmed_accurate_count,
       p.stale_after_minutes
     FROM fuel_reports fr
     JOIN reports r ON r.id = fr.report_id
     LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
     WHERE fr.station_id = ANY($1::uuid[])
       AND r.status <> 'removed'
       AND r.visibility = 'public'
     ORDER BY fr.station_id, fr.fuel_type, COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC`,
    [ids]
  );

  const byStation = new Map();
  for (const row of result.rows) {
    if (!byStation.has(row.station_id)) byStation.set(row.station_id, []);
    byStation.get(row.station_id).push({
      reportId: row.fuel_id,
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
      queueCondition: row.queue_condition,
      sourceType: row.source_type,
      status: row.status,
      freshness: computeFreshnessLabel(row),
      trustLabels: computeTrustLabels(row),
      lastConfirmedAt: row.last_confirmed_at,
      occurredAt: row.occurred_at,
      createdAt: row.created_at,
    });
  }

  return stations.map((station) => ({
    ...station,
    latestReports: byStation.get(station.id) || [],
  }));
}

export const fuelRepository = {
  mapStation,
  mapFuelReport,

  async createStation(fields) {
    const result = await getPool().query(
      `INSERT INTO fuel_stations (
         name, brand, location_id, latitude, longitude,
         address, landmark_label, road_name, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        fields.name.trim(),
        fields.brand?.trim() || null,
        fields.locationId,
        fields.latitude ?? null,
        fields.longitude ?? null,
        fields.address?.trim() || null,
        fields.landmarkLabel?.trim() || null,
        fields.roadName?.trim() || null,
        fields.createdBy || null,
      ]
    );
    return this.findStationById(result.rows[0].id);
  },

  async findStationById(id) {
    const result = await getPool().query(
      `SELECT ${stationSelect} ${stationJoins} WHERE fs.id = $1`,
      [id]
    );
    const station = mapStation(result.rows[0]);
    if (!station) return null;
    const [decorated] = await attachLatestReports([station]);
    return decorated;
  },

  async findStationRawByNameLocation(name, locationId) {
    const result = await getPool().query(
      `SELECT id FROM fuel_stations
       WHERE location_id = $1 AND lower(trim(name)) = lower(trim($2)) AND is_active = TRUE
       LIMIT 1`,
      [locationId, name]
    );
    return result.rows[0] || null;
  },

  async listStations({
    locationId = null,
    q = null,
    fuelType = null,
    availability = null,
    freshness = 'any',
    activeOnly = true,
    page = 1,
    limit = 20,
  } = {}) {
    const where = [];
    const params = [];
    if (activeOnly) where.push(`fs.is_active = TRUE`);
    if (locationId) {
      params.push(locationId);
      where.push(`fs.location_id = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(fs.name ILIKE $${params.length} OR fs.brand ILIKE $${params.length} OR fs.address ILIKE $${params.length})`);
    }

    // Optional filter stations that have a matching latest report
    let havingReport = '';
    if (fuelType || availability || freshness !== 'any') {
      const subWhere = [`r.status <> 'removed'`, `r.visibility = 'public'`];
      if (fuelType) {
        params.push(fuelType);
        subWhere.push(`fr.fuel_type = $${params.length}::fuel_product_type`);
      }
      if (availability) {
        params.push(availability);
        subWhere.push(`fr.availability = $${params.length}::fuel_availability`);
      }
      if (freshness && freshness !== 'any') {
        subWhere.push(freshnessClause(freshness));
      }
      havingReport = `AND EXISTS (
        SELECT 1 FROM fuel_reports fr
        JOIN reports r ON r.id = fr.report_id
        WHERE fr.station_id = fs.id AND ${subWhere.join(' AND ')}
      )`;
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')} ${havingReport}` : `WHERE TRUE ${havingReport}`;

    const result = await getPool().query(
      `SELECT ${stationSelect}
       ${stationJoins}
       ${whereSql}
       ORDER BY fs.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countResult = await getPool().query(
      `SELECT COUNT(*)::int AS total
       ${stationJoins}
       ${whereSql}`,
      params.slice(0, -2)
    );

    const items = await attachLatestReports(result.rows.map(mapStation));
    return {
      items,
      page,
      limit,
      total: countResult.rows[0].total,
      totalPages: Math.max(1, Math.ceil(countResult.rows[0].total / limit)),
    };
  },

  async nearbyStations({
    lat,
    lng,
    radiusKm = 10,
    fuelType = null,
    availability = null,
    freshness = 'fresh',
    limit = 20,
  }) {
    const params = [lat, lng, radiusKm, limit];
    let reportFilter = '';
    if (fuelType) {
      params.push(fuelType);
      reportFilter += ` AND fr.fuel_type = $${params.length}::fuel_product_type`;
    }
    if (availability) {
      params.push(availability);
      reportFilter += ` AND fr.availability = $${params.length}::fuel_availability`;
    }

    const result = await getPool().query(
      `SELECT * FROM (
         SELECT ${stationSelect},
           (
             6371 * acos(
               least(1.0, greatest(-1.0,
                 cos(radians($1)) * cos(radians(COALESCE(fs.latitude, loc.latitude))) *
                 cos(radians(COALESCE(fs.longitude, loc.longitude)) - radians($2)) +
                 sin(radians($1)) * sin(radians(COALESCE(fs.latitude, loc.latitude)))
               ))
             )
           ) AS distance_km
         ${stationJoins}
         WHERE fs.is_active = TRUE
           AND COALESCE(fs.latitude, loc.latitude) IS NOT NULL
           AND COALESCE(fs.longitude, loc.longitude) IS NOT NULL
           ${
             fuelType || availability || freshness !== 'any'
               ? `AND EXISTS (
                    SELECT 1 FROM fuel_reports fr
                    JOIN reports r ON r.id = fr.report_id
                    WHERE fr.station_id = fs.id
                      AND r.visibility = 'public'
                      AND ${freshnessClause(freshness)}
                      ${reportFilter}
                  )`
               : ''
           }
       ) nearby
       WHERE nearby.distance_km <= $3
       ORDER BY nearby.distance_km ASC, nearby.station_name ASC
       LIMIT $4`,
      params
    );

    return attachLatestReports(result.rows.map(mapStation));
  },

  async createFuelReport(fields) {
    const result = await getPool().query(
      `INSERT INTO fuel_reports (
         report_id, station_id, fuel_type, availability,
         price_amount, price_currency, price_unit, queue_condition
       ) VALUES (
         $1,$2,$3::fuel_product_type,$4::fuel_availability,
         $5,$6,$7,$8::fuel_queue_condition
       )
       RETURNING id`,
      [
        fields.reportId,
        fields.stationId,
        fields.fuelType,
        fields.availability,
        fields.priceAmount ?? null,
        fields.priceCurrency || 'NGN',
        fields.priceUnit || 'litre',
        fields.queueCondition || 'unknown',
      ]
    );
    return this.findFuelReportById(result.rows[0].id);
  },

  async findFuelReportById(id) {
    const result = await getPool().query(
      `SELECT ${reportSelect} ${reportJoins} WHERE fr.id = $1`,
      [id]
    );
    return mapFuelReport(result.rows[0]);
  },

  async findRawFuelById(id) {
    const result = await getPool().query(`SELECT * FROM fuel_reports WHERE id = $1`, [id]);
    return result.rows[0] || null;
  },

  async listFuelReports({
    stationId = null,
    locationId = null,
    fuelType = null,
    availability = null,
    freshness = 'fresh',
    sourceType = null,
    page = 1,
    limit = 20,
  } = {}) {
    const where = [`r.visibility = 'public'`, freshnessClause(freshness)];
    const params = [];
    if (stationId) {
      params.push(stationId);
      where.push(`fr.station_id = $${params.length}`);
    }
    if (locationId) {
      params.push(locationId);
      where.push(`r.location_id = $${params.length}`);
    }
    if (fuelType) {
      params.push(fuelType);
      where.push(`fr.fuel_type = $${params.length}::fuel_product_type`);
    }
    if (availability) {
      params.push(availability);
      where.push(`fr.availability = $${params.length}::fuel_availability`);
    }
    if (sourceType) {
      params.push(sourceType);
      where.push(`r.source_type = $${params.length}::report_source_type`);
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const result = await getPool().query(
      `SELECT ${reportSelect}
       ${reportJoins}
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countResult = await getPool().query(
      `SELECT COUNT(*)::int AS total
       ${reportJoins}
       WHERE ${where.join(' AND ')}`,
      params.slice(0, -2)
    );

    return {
      items: result.rows.map(mapFuelReport),
      page,
      limit,
      total: countResult.rows[0].total,
      totalPages: Math.max(1, Math.ceil(countResult.rows[0].total / limit)),
    };
  },

  async summary({ locationId = null } = {}) {
    const params = [];
    let locationFilter = '';
    if (locationId) {
      params.push(locationId);
      locationFilter = `AND r.location_id = $${params.length}`;
    }

    const result = await getPool().query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE fr.availability = 'available')::int AS available,
         COUNT(*) FILTER (WHERE fr.availability = 'limited')::int AS limited,
         COUNT(*) FILTER (WHERE fr.availability = 'unavailable')::int AS unavailable,
         COUNT(*) FILTER (WHERE fr.fuel_type = 'pms')::int AS pms,
         COUNT(*) FILTER (WHERE fr.fuel_type = 'ago')::int AS ago,
         COUNT(*) FILTER (WHERE fr.fuel_type = 'lpg')::int AS lpg
       FROM fuel_reports fr
       JOIN reports r ON r.id = fr.report_id
       WHERE r.visibility = 'public'
         AND r.status IN ('submitted','active','confirmed')
         AND (r.expires_at IS NULL OR r.expires_at > NOW())
         ${locationFilter}`,
      params
    );

    const row = result.rows[0];
    return {
      total: row.total,
      byAvailability: {
        available: row.available,
        limited: row.limited,
        unavailable: row.unavailable,
      },
      byFuelType: {
        pms: row.pms,
        ago: row.ago,
        lpg: row.lpg,
      },
    };
  },
};
