import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { locationRepository } from '../repositories/locationRepository.js';
import {
  buildAboutLines,
  buildQualityMetadata,
  formatAgeLabel,
  sourceFromType,
} from './dataQualityService.js';
import { searchService } from './searchService.js';

const CATEGORY_CODES = {
  traffic: 'traffic',
  fuel: 'fuel',
  transport: 'transport',
  prices: 'prices',
  road_conditions: 'road_conditions',
  local_alerts: 'local_alerts',
  directions: 'directions',
};

function freshnessCutoff(freshness) {
  const now = Date.now();
  switch (freshness) {
    case '30m':
      return new Date(now - 30 * 60 * 1000);
    case '2h':
      return new Date(now - 2 * 60 * 60 * 1000);
    case 'today': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'recent':
      return new Date(now - 24 * 60 * 60 * 1000);
    case 'any':
    case 'all':
    default:
      return null;
  }
}

function freshnessLabel(occurredAt, status, expiresAt) {
  if (status === 'expired') return 'Expired';
  if (status === 'stale') return 'Stale';
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return 'Expired';
  return formatAgeLabel(occurredAt) || null;
}

function parseBbox(bbox) {
  if (!bbox) return null;
  const [west, south, east, north] = bbox.split(',').map(Number);
  if ([west, south, east, north].some((n) => Number.isNaN(n))) return null;
  if (west >= east || south >= north) {
    throw new AppError('Invalid bounding box.', 400, 'VALIDATION_ERROR');
  }
  // Reject huge national bbox dumps
  if (east - west > 3 || north - south > 3) {
    throw new AppError('Bounding box is too large. Zoom in or use radius.', 400, 'BBOX_TOO_LARGE');
  }
  return { west, south, east, north };
}

function sourceLabel(sourceType) {
  return sourceFromType(sourceType).label;
}

async function resolveCenter({ lat, lng, locationId, areaId, lgaId, stateId }) {
  if (lat != null && lng != null) {
    return { lat, lng, source: 'coordinates', location: null };
  }

  if (locationId) {
    const loc = await locationRepository.findById(locationId);
    if (!loc) throw new AppError('Location not found.', 404, 'LOCATION_NOT_FOUND');
    if (!loc.coordinates) {
      throw new AppError('Selected location has no map coordinates.', 400, 'NO_COORDINATES');
    }
    return {
      lat: loc.coordinates.lat,
      lng: loc.coordinates.lng,
      source: 'location',
      location: loc,
    };
  }

  if (areaId) {
    const result = await getPool().query(
      `SELECT loc.id, loc.name, loc.latitude, loc.longitude, a.name AS area_name
       FROM areas a
       LEFT JOIN locations loc ON loc.type = 'area' AND loc.area_id = a.id
       WHERE a.id = $1 AND a.is_active = TRUE
       LIMIT 1`,
      [areaId]
    );
    const row = result.rows[0];
    if (!row?.latitude) throw new AppError('Area has no coordinates.', 400, 'NO_COORDINATES');
    return {
      lat: Number(row.latitude),
      lng: Number(row.longitude),
      source: 'area',
      location: row.id
        ? { id: row.id, name: row.name || row.area_name, coordinates: { lat: Number(row.latitude), lng: Number(row.longitude) } }
        : null,
    };
  }

  if (lgaId) {
    const result = await getPool().query(
      `SELECT loc.id, loc.name, COALESCE(loc.latitude, l.latitude) AS latitude,
              COALESCE(loc.longitude, l.longitude) AS longitude
       FROM lgas l
       LEFT JOIN locations loc ON loc.type = 'lga' AND loc.lga_id = l.id
       WHERE l.id = $1 AND l.is_active = TRUE
       LIMIT 1`,
      [lgaId]
    );
    const row = result.rows[0];
    if (!row?.latitude) throw new AppError('LGA has no coordinates.', 400, 'NO_COORDINATES');
    return {
      lat: Number(row.latitude),
      lng: Number(row.longitude),
      source: 'lga',
      location: row.id
        ? { id: row.id, name: row.name, coordinates: { lat: Number(row.latitude), lng: Number(row.longitude) } }
        : null,
    };
  }

  if (stateId) {
    const result = await getPool().query(
      `SELECT loc.id, loc.name, loc.latitude, loc.longitude, s.name AS state_name
       FROM states s
       LEFT JOIN locations loc ON loc.type = 'state' AND loc.state_id = s.id
       WHERE s.id = $1 AND s.is_active = TRUE
       LIMIT 1`,
      [stateId]
    );
    const row = result.rows[0];
    if (!row?.latitude) throw new AppError('State has no coordinates.', 400, 'NO_COORDINATES');
    return {
      lat: Number(row.latitude),
      lng: Number(row.longitude),
      source: 'state',
      location: row.id
        ? { id: row.id, name: row.name || row.state_name, coordinates: { lat: Number(row.latitude), lng: Number(row.longitude) } }
        : null,
    };
  }

  // Default: Lagos Island / Lekki-ish seeded area if present, else Nigeria centroid-ish
  const fallback = await getPool().query(
    `SELECT id, name, latitude, longitude FROM locations
     WHERE type = 'area' AND latitude IS NOT NULL AND status = 'active'
       AND (lower(name) LIKE '%lekki%' OR lower(name) LIKE '%ikeja%')
     ORDER BY CASE WHEN lower(name) LIKE '%lekki phase 1%' THEN 0 ELSE 1 END
     LIMIT 1`
  );
  if (fallback.rows[0]) {
    return {
      lat: Number(fallback.rows[0].latitude),
      lng: Number(fallback.rows[0].longitude),
      source: 'default',
      location: {
        id: fallback.rows[0].id,
        name: fallback.rows[0].name,
        coordinates: {
          lat: Number(fallback.rows[0].latitude),
          lng: Number(fallback.rows[0].longitude),
        },
      },
    };
  }

  return { lat: 6.5244, lng: 3.3792, source: 'default', location: null };
}

function mapReportItem(row) {
  const lat = row.latitude != null ? Number(row.latitude) : row.loc_lat != null ? Number(row.loc_lat) : null;
  const lng = row.longitude != null ? Number(row.longitude) : row.loc_lng != null ? Number(row.loc_lng) : null;
  const occurredAt = row.last_confirmed_at || row.occurred_at || row.created_at;
  const category = row.category_code;
  let detailPath = `/explore`;
  if (category === 'traffic') detailPath = `/traffic/${row.id}`;
  else if (category === 'fuel') detailPath = `/fuel`;
  else if (category === 'transport') detailPath = `/transport`;
  else if (category === 'prices') detailPath = `/prices`;
  else if (category === 'local_alerts') detailPath = `/alerts/${row.id}`;
  else if (category === 'directions') detailPath = `/directions`;
  else detailPath = `/explore`;

  // Prefer module-specific routes when extension tables have IDs
  if (row.traffic_report_id) detailPath = `/traffic/${row.traffic_report_id}`;
  if (row.alert_report_id) detailPath = `/alerts/${row.alert_report_id}`;
  if (row.station_id) detailPath = `/fuel/stations/${row.station_id}`;
  if (row.route_id) detailPath = `/transport/routes/${row.route_id}`;
  if (row.commodity_slug && row.variant_code) {
    detailPath = `/prices/${row.commodity_slug}/${row.variant_code}`;
  }

  const policy = {
    fresh_within_minutes: row.fresh_within_minutes,
    recent_within_minutes: row.recent_within_minutes,
    stale_after_minutes: row.stale_after_minutes,
  };
  const quality = buildQualityMetadata(
    {
      ...row,
      corroboration_count: row.corroboration_count,
    },
    policy
  );

  return {
    id: `report:${row.id}`,
    entityType: 'report',
    entityId: row.id,
    category,
    categoryLabel: row.category_name,
    title: row.title,
    summary: row.description ? String(row.description).slice(0, 160) : null,
    status: row.module_status || row.status,
    statusLabel: row.module_status_label || row.status,
    locationName: row.location_name || null,
    locationId: row.location_id || null,
    coordinates: lat != null && lng != null ? { lat, lng } : null,
    distanceKm: row.distance_km != null ? Number(Number(row.distance_km).toFixed(2)) : null,
    sourceType: row.source_type,
    sourceLabel: sourceLabel(row.source_type),
    freshness: quality.freshness.label || freshnessLabel(occurredAt, row.status, row.expires_at),
    freshnessKey: quality.freshness.state,
    quality,
    about: buildAboutLines(quality),
    corroborationLabel: quality.corroboration.label,
    occurredAt,
    expiresAt: row.expires_at,
    keyValue: row.key_value || null,
    detailPath,
    markerKind: category === 'local_alerts' ? 'alert' : category,
  };
}

export const exploreService = {
  async explore(query) {
    const searchTerm = (query.q || query.search || '').trim();
    const bbox = parseBbox(query.bbox);
    const center = await resolveCenter(query);
    const radiusKm = bbox ? null : query.radiusKm || 12;
    const cutoff = freshnessCutoff(query.freshness);
    const limit = Math.min(Number(query.limit) || 40, 80);
    const page = Math.max(Number(query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const category = query.category || 'all';

    const items = [];

    if (category === 'all' || CATEGORY_CODES[category]) {
      const reportItems = await this._nearbyReports({
        center,
        radiusKm,
        bbox,
        category: category === 'all' ? null : CATEGORY_CODES[category],
        status: query.status,
        cutoff,
        searchTerm,
        limit: category === 'all' ? Math.min(limit, 30) : limit,
        offset: category === 'all' ? 0 : offset,
      });
      items.push(...reportItems);
    }

    if (category === 'all' || category === 'fuel') {
      const stations = await this._nearbyStations({
        center,
        radiusKm,
        bbox,
        status: query.status,
        searchTerm,
        limit: category === 'fuel' ? limit : 10,
      });
      items.push(...stations);
    }

    if (category === 'all' || category === 'transport') {
      const routes = await this._nearbyRoutes({
        center,
        radiusKm,
        bbox,
        status: query.status,
        searchTerm,
        limit: category === 'transport' ? limit : 10,
      });
      items.push(...routes);
    }

    if (category === 'all' || category === 'official') {
      const updates = await this._nearbyOfficial({
        center,
        radiusKm,
        bbox,
        locationId: query.locationId || center.location?.id,
        cutoff,
        searchTerm,
        limit: category === 'official' ? limit : 8,
      });
      items.push(...updates);
    }

    if (category === 'all' || category === 'community') {
      const questions = await this._nearbyQuestions({
        center,
        radiusKm,
        bbox,
        cutoff,
        searchTerm,
        limit: category === 'community' ? limit : 8,
      });
      items.push(...questions);
    }

    // Deterministic order: distance, then freshness band, then recency.
    // No secret trust score — stale is de-emphasized explicitly.
    const freshnessRank = (key) => {
      switch (key) {
        case 'fresh':
          return 0;
        case 'recent':
          return 1;
        case 'aging':
          return 2;
        case 'stale':
          return 3;
        case 'expired':
          return 4;
        default:
          return 2;
      }
    };
    items.sort((a, b) => {
      const da = a.distanceKm ?? 999;
      const db = b.distanceKm ?? 999;
      if (Math.abs(da - db) > 0.05) return da - db;
      const fa = freshnessRank(a.freshnessKey || a.quality?.freshness?.state);
      const fb = freshnessRank(b.freshnessKey || b.quality?.freshness?.state);
      if (fa !== fb) return fa - fb;
      return new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0);
    });

    const pageItems =
      category === 'all' ? items.slice(offset, offset + limit) : items.slice(0, limit);

    const features = pageItems
      .filter((i) => i.coordinates)
      .map((i) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [i.coordinates.lng, i.coordinates.lat],
        },
        properties: {
          id: i.id,
          category: i.category,
          markerKind: i.markerKind,
          title: i.title,
          statusLabel: i.statusLabel,
          freshness: i.freshness,
          sourceLabel: i.sourceLabel,
          locationName: i.locationName,
          keyValue: i.keyValue,
          detailPath: i.detailPath,
        },
      }));

    return {
      center: {
        lat: center.lat,
        lng: center.lng,
        source: center.source,
        // Never return private user GPS — only resolved area context
        location: center.location
          ? {
              id: center.location.id,
              name: center.location.name,
              coordinates: center.location.coordinates || {
                lat: center.lat,
                lng: center.lng,
              },
            }
          : null,
      },
      radiusKm: radiusKm || null,
      bbox: bbox || null,
      filters: {
        category,
        status: query.status || null,
        freshness: query.freshness || 'recent',
        q: searchTerm || null,
      },
      page,
      limit,
      total: items.length,
      items: pageItems,
      geojson: {
        type: 'FeatureCollection',
        features,
      },
    };
  },

  async _nearbyReports({ center, radiusKm, bbox, category, status, cutoff, searchTerm, limit, offset }) {
    return this._nearbyReportsClean({
      center,
      radiusKm,
      bbox,
      category,
      status,
      cutoff,
      searchTerm,
      limit,
      offset,
    });
  },

  async _nearbyReportsClean({
    center,
    radiusKm,
    bbox,
    category,
    status,
    cutoff,
    searchTerm,
    limit,
    offset,
  }) {
    const params = [center.lat, center.lng];
    const where = [
      `r.visibility = 'public'`,
      `r.status IN ('submitted','active','confirmed','stale')`,
      `COALESCE(r.latitude, loc.latitude) IS NOT NULL`,
      `COALESCE(r.longitude, loc.longitude) IS NOT NULL`,
    ];

    if (category) {
      params.push(category);
      where.push(`c.code = $${params.length}`);
    }
    if (status && category === 'traffic') {
      params.push(status);
      where.push(`tr.severity = $${params.length}::traffic_severity`);
    } else if (status && category === 'local_alerts') {
      params.push(status);
      where.push(`lar.severity = $${params.length}::alert_severity`);
    } else if (status && category === 'fuel') {
      params.push(status);
      where.push(`fr.availability = $${params.length}::fuel_availability`);
    }
    if (cutoff) {
      params.push(cutoff.toISOString());
      where.push(
        `COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) >= $${params.length}::timestamptz`
      );
    }
    if (searchTerm) {
      params.push(`%${searchTerm}%`);
      where.push(
        `(r.title ILIKE $${params.length} OR COALESCE(r.description,'') ILIKE $${params.length} OR COALESCE(loc.name,'') ILIKE $${params.length})`
      );
    }
    if (bbox) {
      params.push(bbox.west, bbox.south, bbox.east, bbox.north);
      const i = params.length;
      where.push(`COALESCE(r.longitude, loc.longitude) BETWEEN $${i - 3} AND $${i - 1}`);
      where.push(`COALESCE(r.latitude, loc.latitude) BETWEEN $${i - 2} AND $${i}`);
    }

    const radiusParam = bbox ? null : (() => {
      params.push(radiusKm ?? 12);
      return params.length;
    })();

    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const result = await getPool().query(
      `SELECT * FROM (
         SELECT
           r.id, r.title, r.description, r.status, r.source_type, r.location_id,
           r.latitude, r.longitude, r.occurred_at, r.expires_at, r.last_confirmed_at, r.created_at,
           r.corroboration_count, r.confirmed_accurate_count,
           loc.name AS location_name, loc.latitude AS loc_lat, loc.longitude AS loc_lng,
           c.code AS category_code, c.name AS category_name,
           p.fresh_within_minutes, p.recent_within_minutes, p.stale_after_minutes,
           tr.id AS traffic_report_id, tr.severity::text AS traffic_severity,
           lar.id AS alert_report_id, lar.severity::text AS alert_severity,
           fr.station_id, fr.availability::text AS fuel_availability, fr.price_amount AS price_ngn,
           tfr.route_id,
           com.slug AS commodity_slug, cv.code AS variant_code, cpr.price_amount AS commodity_price,
           (
             6371 * acos(
               least(1.0, greatest(-1.0,
                 cos(radians($1)) * cos(radians(COALESCE(r.latitude, loc.latitude))) *
                 cos(radians(COALESCE(r.longitude, loc.longitude)) - radians($2)) +
                 sin(radians($1)) * sin(radians(COALESCE(r.latitude, loc.latitude)))
               ))
             )
           ) AS distance_km
         FROM reports r
         JOIN report_categories c ON c.id = r.category_id
         LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
         LEFT JOIN locations loc ON loc.id = r.location_id
         LEFT JOIN traffic_reports tr ON tr.report_id = r.id
         LEFT JOIN local_alert_reports lar ON lar.report_id = r.id
         LEFT JOIN fuel_reports fr ON fr.report_id = r.id
         LEFT JOIN transport_fare_reports tfr ON tfr.report_id = r.id
         LEFT JOIN commodity_price_reports cpr ON cpr.report_id = r.id
         LEFT JOIN commodities com ON com.id = cpr.commodity_id
         LEFT JOIN commodity_variants cv ON cv.id = cpr.variant_id
         WHERE ${where.join(' AND ')}
       ) x
       ${radiusParam ? `WHERE x.distance_km <= $${radiusParam}` : ''}
       ORDER BY x.distance_km ASC, x.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    return result.rows.map((row) => {
      let keyValue = null;
      let moduleStatus = row.status;
      let moduleStatusLabel = row.status;
      if (row.traffic_severity) {
        moduleStatus = row.traffic_severity;
        moduleStatusLabel = String(row.traffic_severity).replace(/_/g, ' ');
        keyValue = moduleStatusLabel;
      } else if (row.alert_severity) {
        moduleStatus = row.alert_severity;
        moduleStatusLabel = String(row.alert_severity).replace(/_/g, ' ');
        keyValue = moduleStatusLabel;
      } else if (row.fuel_availability) {
        moduleStatus = row.fuel_availability;
        moduleStatusLabel = String(row.fuel_availability).replace(/_/g, ' ');
        keyValue =
          row.price_ngn != null
            ? `₦${Number(row.price_ngn).toLocaleString('en-NG')} · ${moduleStatusLabel}`
            : moduleStatusLabel;
      } else if (row.commodity_price != null) {
        keyValue = `₦${Number(row.commodity_price).toLocaleString('en-NG')}`;
      }
      return mapReportItem({
        ...row,
        module_status: moduleStatus,
        module_status_label: moduleStatusLabel,
        key_value: keyValue,
      });
    });
  },

  async _nearbyStations({ center, radiusKm, bbox, status, searchTerm, limit }) {
    const params = [center.lat, center.lng];
    const where = [`fs.is_active = TRUE`, `loc.latitude IS NOT NULL`, `loc.longitude IS NOT NULL`];
    if (searchTerm) {
      params.push(`%${searchTerm}%`);
      where.push(`(fs.name ILIKE $${params.length} OR loc.name ILIKE $${params.length})`);
    }
    if (bbox) {
      params.push(bbox.west, bbox.south, bbox.east, bbox.north);
      const i = params.length;
      where.push(`loc.longitude BETWEEN $${i - 3} AND $${i - 1}`);
      where.push(`loc.latitude BETWEEN $${i - 2} AND $${i}`);
    }
    const radiusIdx = bbox
      ? null
      : (() => {
          params.push(radiusKm ?? 12);
          return params.length;
        })();
    params.push(limit);

    const result = await getPool().query(
      `SELECT * FROM (
         SELECT fs.id, fs.name, fs.location_id, loc.name AS location_name,
                loc.latitude, loc.longitude,
                (
                  SELECT fr.availability::text FROM fuel_reports fr
                  JOIN reports r ON r.id = fr.report_id
                  WHERE fr.station_id = fs.id AND r.status IN ('active','confirmed','submitted')
                  ORDER BY r.created_at DESC LIMIT 1
                ) AS availability,
                (
                  SELECT fr.price_amount FROM fuel_reports fr
                  JOIN reports r ON r.id = fr.report_id
                  WHERE fr.station_id = fs.id AND r.status IN ('active','confirmed','submitted')
                  ORDER BY r.created_at DESC LIMIT 1
                ) AS price_ngn,
                (
                  SELECT r.created_at FROM fuel_reports fr
                  JOIN reports r ON r.id = fr.report_id
                  WHERE fr.station_id = fs.id
                  ORDER BY r.created_at DESC LIMIT 1
                ) AS last_report_at,
                (
                  6371 * acos(
                    least(1.0, greatest(-1.0,
                      cos(radians($1)) * cos(radians(loc.latitude)) *
                      cos(radians(loc.longitude) - radians($2)) +
                      sin(radians($1)) * sin(radians(loc.latitude))
                    ))
                  )
                ) AS distance_km
         FROM fuel_stations fs
         JOIN locations loc ON loc.id = fs.location_id
         WHERE ${where.join(' AND ')}
       ) s
       ${radiusIdx ? `WHERE s.distance_km <= $${radiusIdx}` : ''}
       ORDER BY s.distance_km ASC
       LIMIT $${params.length}`,
      params
    );

    return result.rows
      .filter((row) => !status || !row.availability || row.availability === status)
      .map((row) => ({
        id: `station:${row.id}`,
        entityType: 'fuel_station',
        entityId: row.id,
        category: 'fuel',
        categoryLabel: 'Fuel',
        title: row.name,
        summary: row.location_name,
        status: row.availability || 'unknown',
        statusLabel: row.availability
          ? String(row.availability).replace(/_/g, ' ')
          : 'No recent report',
        locationName: row.location_name,
        locationId: row.location_id,
        coordinates: { lat: Number(row.latitude), lng: Number(row.longitude) },
        distanceKm: Number(Number(row.distance_km).toFixed(2)),
        sourceType: 'community',
        sourceLabel: 'Community Report',
        freshness: freshnessLabel(row.last_report_at, 'active', null),
        freshnessKey: 'fresh',
        occurredAt: row.last_report_at,
        keyValue:
          row.price_ngn != null
            ? `₦${Number(row.price_ngn).toLocaleString('en-NG')}`
            : null,
        detailPath: `/fuel/stations/${row.id}`,
        markerKind: 'fuel',
      }));
  },

  async _nearbyRoutes({ center, radiusKm, bbox, status, searchTerm, limit }) {
    const params = [center.lat, center.lng];
    const where = [`tr.is_active = TRUE`];
    if (searchTerm) {
      params.push(`%${searchTerm}%`);
      where.push(
        `(COALESCE(tr.name,'') ILIKE $${params.length} OR o.name ILIKE $${params.length} OR d.name ILIKE $${params.length})`
      );
    }
    if (status === 'inactive') where.push(`tr.is_active = FALSE`);

    const radiusIdx = (() => {
      params.push(radiusKm ?? 12);
      return params.length;
    })();
    params.push(limit);

    const result = await getPool().query(
      `SELECT * FROM (
         SELECT tr.id, tr.name, tr.primary_mode::text AS mode,
                tr.origin_location_id, tr.destination_location_id,
                o.name AS origin_name, d.name AS destination_name,
                o.latitude AS o_lat, o.longitude AS o_lng,
                d.latitude AS d_lat, d.longitude AS d_lng,
                LEAST(
                  CASE WHEN o.latitude IS NOT NULL THEN (
                    6371 * acos(least(1.0, greatest(-1.0,
                      cos(radians($1)) * cos(radians(o.latitude)) *
                      cos(radians(o.longitude) - radians($2)) +
                      sin(radians($1)) * sin(radians(o.latitude))
                    )))
                  ) ELSE 999 END,
                  CASE WHEN d.latitude IS NOT NULL THEN (
                    6371 * acos(least(1.0, greatest(-1.0,
                      cos(radians($1)) * cos(radians(d.latitude)) *
                      cos(radians(d.longitude) - radians($2)) +
                      sin(radians($1)) * sin(radians(d.latitude))
                    )))
                  ) ELSE 999 END
                ) AS distance_km
         FROM transport_routes tr
         LEFT JOIN locations o ON o.id = tr.origin_location_id
         LEFT JOIN locations d ON d.id = tr.destination_location_id
         WHERE ${where.join(' AND ')}
       ) r
       WHERE r.distance_km <= $${radiusIdx}
       ORDER BY r.distance_km ASC
       LIMIT $${params.length}`,
      params
    );

    return result.rows.map((row) => {
      const lat = row.o_lat != null ? Number(row.o_lat) : row.d_lat != null ? Number(row.d_lat) : null;
      const lng = row.o_lng != null ? Number(row.o_lng) : row.d_lng != null ? Number(row.d_lng) : null;
      return {
        id: `route:${row.id}`,
        entityType: 'transport_route',
        entityId: row.id,
        category: 'transport',
        categoryLabel: 'Transport',
        title: row.name || `${row.origin_name || '?'} → ${row.destination_name || '?'}`,
        summary: [row.mode, row.origin_name, row.destination_name].filter(Boolean).join(' · '),
        status: 'active',
        statusLabel: row.mode ? String(row.mode).replace(/_/g, ' ') : 'Route',
        locationName: row.origin_name,
        locationId: row.origin_location_id,
        coordinates: lat != null && lng != null ? { lat, lng } : null,
        distanceKm: Number(Number(row.distance_km).toFixed(2)),
        sourceType: 'community',
        sourceLabel: 'Community Report',
        freshness: null,
        freshnessKey: 'fresh',
        occurredAt: null,
        keyValue: row.mode,
        detailPath: `/transport/routes/${row.id}`,
        markerKind: 'transport',
      };
    });
  },

  async _nearbyOfficial({ center, radiusKm, bbox, locationId, cutoff, searchTerm, limit }) {
    const params = [];
    const where = [`ou.status = 'published'`];
    if (searchTerm) {
      params.push(`%${searchTerm}%`);
      where.push(`(ou.title ILIKE $${params.length} OR COALESCE(ou.summary,'') ILIKE $${params.length})`);
    }
    if (cutoff) {
      params.push(cutoff.toISOString());
      where.push(`COALESCE(ou.published_at, ou.retrieved_at) >= $${params.length}::timestamptz`);
    }
    if (locationId) {
      // Context: same state as location, or national, or exact location
      params.push(locationId);
      where.push(`(
        ou.location_id = $${params.length}
        OR ou.state_id = (SELECT state_id FROM locations WHERE id = $${params.length})
        OR ou.jurisdiction_level = 'national'
      )`);
    }
    params.push(limit);

    const result = await getPool().query(
      `SELECT ou.id, ou.title, ou.summary, ou.category::text, ou.published_at, ou.retrieved_at,
              ou.original_url, ou.location_id, loc.name AS location_name,
              loc.latitude, loc.longitude,
              os.organization_name, os.short_name
       FROM official_updates ou
       JOIN official_sources os ON os.id = ou.source_id
       LEFT JOIN locations loc ON loc.id = ou.location_id
       WHERE ${where.join(' AND ')}
       ORDER BY ou.published_at DESC NULLS LAST, ou.retrieved_at DESC
       LIMIT $${params.length}`,
      params
    );

    return result.rows.map((row) => ({
      id: `official:${row.id}`,
      entityType: 'official_update',
      entityId: row.id,
      category: 'official',
      categoryLabel: 'Official',
      title: row.title,
      summary: row.summary ? String(row.summary).slice(0, 160) : null,
      status: 'published',
      statusLabel: 'Official Update',
      locationName: row.location_name || 'Nigeria',
      locationId: row.location_id,
      coordinates:
        row.latitude != null && row.longitude != null
          ? { lat: Number(row.latitude), lng: Number(row.longitude) }
          : { lat: center.lat, lng: center.lng },
      distanceKm: null,
      sourceType: 'official',
      sourceLabel: row.short_name || row.organization_name || 'Official',
      freshness: freshnessLabel(row.published_at || row.retrieved_at, 'active', null),
      freshnessKey: 'fresh',
      occurredAt: row.published_at || row.retrieved_at,
      keyValue: row.short_name || row.organization_name,
      detailPath: `/official-updates/${row.id}`,
      markerKind: 'official',
    }));
  },

  async _nearbyQuestions({ center, radiusKm, bbox, cutoff, searchTerm, limit }) {
    const params = [center.lat, center.lng];
    const where = [
      `q.status IN ('open','answered')`,
      `loc.latitude IS NOT NULL`,
      `loc.longitude IS NOT NULL`,
    ];
    if (searchTerm) {
      params.push(`%${searchTerm}%`);
      where.push(`(q.title ILIKE $${params.length} OR COALESCE(q.description,'') ILIKE $${params.length})`);
    }
    if (cutoff) {
      params.push(cutoff.toISOString());
      where.push(`q.created_at >= $${params.length}::timestamptz`);
    }
    params.push(radiusKm ?? 12);
    const radiusIdx = params.length;
    params.push(limit);

    const result = await getPool().query(
      `SELECT * FROM (
         SELECT q.id, q.title, q.description, q.status, q.category::text, q.created_at,
                q.location_id, loc.name AS location_name, loc.latitude, loc.longitude,
                (
                  6371 * acos(
                    least(1.0, greatest(-1.0,
                      cos(radians($1)) * cos(radians(loc.latitude)) *
                      cos(radians(loc.longitude) - radians($2)) +
                      sin(radians($1)) * sin(radians(loc.latitude))
                    ))
                  )
                ) AS distance_km
         FROM questions q
         JOIN locations loc ON loc.id = q.location_id
         WHERE ${where.join(' AND ')}
       ) x
       WHERE x.distance_km <= $${radiusIdx}
       ORDER BY x.distance_km ASC, x.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    return result.rows.map((row) => ({
      id: `question:${row.id}`,
      entityType: 'question',
      entityId: row.id,
      category: 'community',
      categoryLabel: 'Community',
      title: row.title,
      summary: row.description ? String(row.description).slice(0, 160) : null,
      status: row.status,
      statusLabel: row.status,
      locationName: row.location_name,
      locationId: row.location_id,
      coordinates: { lat: Number(row.latitude), lng: Number(row.longitude) },
      distanceKm: Number(Number(row.distance_km).toFixed(2)),
      sourceType: 'community',
      sourceLabel: 'Community Report',
      freshness: freshnessLabel(row.created_at, 'active', null),
      freshnessKey: 'fresh',
      occurredAt: row.created_at,
      keyValue: row.category,
      detailPath: `/community/questions/${row.id}`,
      markerKind: 'community',
    }));
  },

  async search(query) {
    const data = await searchService.search({
      q: query.q,
      limit: query.limit,
      mode: 'suggest',
      freshness: 'any',
      category: 'all',
    });
    return {
      q: data.q,
      suggestions: (data.items || []).map((item) => ({
        type: item.group === 'places' ? 'location' : item.type,
        id: item.id,
        title: item.title,
        subtitle: [item.subtitle, item.status, item.sourceLabel].filter(Boolean).join(' · '),
        href: item.href,
        coordinates: item.coordinates || null,
        group: item.group,
        sourceLabel: item.sourceLabel,
      })),
    };
  },

  getTaxonomy() {
    return {
      categories: [
        { id: 'all', label: 'All' },
        { id: 'traffic', label: 'Traffic' },
        { id: 'fuel', label: 'Fuel' },
        { id: 'transport', label: 'Transport' },
        { id: 'prices', label: 'Prices' },
        { id: 'road_conditions', label: 'Road Conditions' },
        { id: 'local_alerts', label: 'Local Alerts' },
        { id: 'directions', label: 'Directions' },
        { id: 'official', label: 'Official Updates' },
        { id: 'community', label: 'Community' },
      ],
      freshness: [
        { id: '30m', label: 'Last 30 minutes' },
        { id: '2h', label: 'Last 2 hours' },
        { id: 'today', label: 'Today' },
        { id: 'recent', label: 'Recent' },
        { id: 'any', label: 'All available' },
      ],
      statusByCategory: {
        traffic: [
          { id: 'clear', label: 'Clear' },
          { id: 'light', label: 'Light' },
          { id: 'moderate', label: 'Moderate' },
          { id: 'heavy', label: 'Heavy' },
          { id: 'standstill', label: 'Standstill' },
          { id: 'blocked', label: 'Blocked' },
        ],
        fuel: [
          { id: 'available', label: 'Available' },
          { id: 'limited', label: 'Limited' },
          { id: 'unavailable', label: 'Unavailable' },
        ],
        local_alerts: [
          { id: 'informational', label: 'Informational' },
          { id: 'caution', label: 'Caution' },
          { id: 'urgent', label: 'Urgent' },
          { id: 'critical', label: 'Critical' },
        ],
      },
    };
  },
};
