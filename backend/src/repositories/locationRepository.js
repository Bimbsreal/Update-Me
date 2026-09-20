import { getPool } from '../db/pool.js';

let postgisChecked = false;
let postgisEnabled = false;

export async function isPostgisEnabled() {
  if (postgisChecked) return postgisEnabled;
  const result = await getPool().query(
    `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS enabled`
  );
  postgisEnabled = Boolean(result.rows[0]?.enabled);
  postgisChecked = true;
  return postgisEnabled;
}

function mapLocation(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    status: row.status,
    parentId: row.parent_id,
    country: row.country_name
      ? { id: row.country_id, name: row.country_name, iso2: row.country_iso2 }
      : null,
    state: row.state_name
      ? { id: row.state_id, name: row.state_name, code: row.state_code }
      : null,
    lga: row.lga_name ? { id: row.lga_id, name: row.lga_name } : null,
    city: row.city_name ? { id: row.city_id, name: row.city_name } : null,
    area: row.area_ref_name ? { id: row.area_id, name: row.area_ref_name } : null,
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: Number(row.latitude), lng: Number(row.longitude) }
        : null,
    address: row.address,
    breadcrumb: row.breadcrumb || [],
    subtitle: row.subtitle || null,
    distanceKm: row.distance_km != null ? Number(Number(row.distance_km).toFixed(2)) : undefined,
    modules: {
      traffic: { available: false },
      fuel: { available: false },
      transport: { available: false },
      prices: { available: false },
      alerts: { available: false },
      community: { available: false },
      reports: { available: false },
    },
  };
}

const locationSelect = `
  SELECT
    loc.id,
    loc.name,
    loc.slug,
    loc.type,
    loc.status,
    loc.parent_id,
    loc.country_id,
    loc.state_id,
    loc.lga_id,
    loc.city_id,
    loc.area_id,
    loc.latitude,
    loc.longitude,
    loc.address,
    c.name AS country_name,
    c.iso2 AS country_iso2,
    s.name AS state_name,
    s.code AS state_code,
    l.name AS lga_name,
    ct.name AS city_name,
    a.name AS area_ref_name
  FROM locations loc
  LEFT JOIN countries c ON c.id = loc.country_id
  LEFT JOIN states s ON s.id = loc.state_id
  LEFT JOIN lgas l ON l.id = loc.lga_id
  LEFT JOIN cities_towns ct ON ct.id = loc.city_id
  LEFT JOIN areas a ON a.id = loc.area_id
`;

function buildSubtitle(row) {
  if (row.type === 'area') {
    const stateLabel = row.state_name
      ? row.state_code === 'FC' || /territory/i.test(row.state_name)
        ? row.state_name
        : `${row.state_name} State`
      : null;
    return [row.lga_name ? `${row.lga_name} LGA` : null, stateLabel].filter(Boolean).join(' · ');
  }
  if (row.type === 'lga') {
    if (!row.state_name) return null;
    if (row.state_code === 'FC' || /territory/i.test(row.state_name)) return row.state_name;
    return `${row.state_name} State`;
  }
  if (row.type === 'state') {
    return row.country_name || 'Nigeria';
  }
  return null;
}

function buildBreadcrumb(row) {
  const crumbs = [];
  if (row.country_name) crumbs.push({ type: 'country', id: row.country_id, name: row.country_name });
  if (row.state_name) crumbs.push({ type: 'state', id: row.state_id, name: row.state_name });
  if (row.lga_name && row.type !== 'state') {
    crumbs.push({ type: 'lga', id: row.lga_id, name: row.lga_name });
  }
  if (row.type === 'area') {
    crumbs.push({ type: 'area', id: row.id, name: row.name });
  } else if (row.type === 'lga') {
    // already added
  } else if (row.type === 'landmark' || row.type === 'road' || row.type === 'place') {
    if (row.area_ref_name) {
      crumbs.push({ type: 'area', id: row.area_id, name: row.area_ref_name });
    }
    crumbs.push({ type: row.type, id: row.id, name: row.name });
  }
  return crumbs;
}

export const locationRepository = {
  mapLocation,

  async findById(id) {
    const result = await getPool().query(`${locationSelect} WHERE loc.id = $1`, [id]);
    const row = result.rows[0];
    if (!row) return null;
    row.subtitle = buildSubtitle(row);
    row.breadcrumb = buildBreadcrumb(row);
    return mapLocation(row);
  },

  async findBySlugOrId(value) {
    const byId = await getPool().query(
      `${locationSelect} WHERE loc.id::text = $1 OR loc.slug = $1 LIMIT 1`,
      [value]
    );
    const row = byId.rows[0];
    if (!row) return null;
    row.subtitle = buildSubtitle(row);
    row.breadcrumb = buildBreadcrumb(row);
    return mapLocation(row);
  },

  async search({ q, type, stateId, lgaId, limit }) {
    const params = [];
    const where = [`loc.status = 'active'`];

    params.push(q);
    const qIndex = params.length;
    where.push(`(
      loc.search_vector @@ plainto_tsquery('simple', $${qIndex})
      OR loc.name ILIKE '%' || $${qIndex} || '%'
      OR loc.search_document ILIKE '%' || $${qIndex} || '%'
    )`);

    if (type) {
      params.push(type);
      where.push(`loc.type = $${params.length}::location_type`);
    } else {
      where.push(`loc.type IN ('area', 'lga', 'state', 'landmark', 'road', 'city')`);
    }
    if (stateId) {
      params.push(stateId);
      where.push(`loc.state_id = $${params.length}`);
    }
    if (lgaId) {
      params.push(lgaId);
      where.push(`loc.lga_id = $${params.length}`);
    }

    params.push(limit);
    const result = await getPool().query(
      `${locationSelect}
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE loc.type
           WHEN 'area' THEN 1
           WHEN 'lga' THEN 2
           WHEN 'city' THEN 3
           WHEN 'landmark' THEN 4
           WHEN 'road' THEN 5
           WHEN 'state' THEN 6
           ELSE 7
         END,
         CASE
           WHEN lower(loc.name) = lower($${qIndex}) THEN 0
           WHEN lower(loc.name) LIKE lower($${qIndex}) || '%' THEN 1
           ELSE 2
         END,
         loc.name ASC
       LIMIT $${params.length}`,
      params
    );

    return result.rows.map((row) => {
      row.subtitle = buildSubtitle(row);
      row.breadcrumb = buildBreadcrumb(row);
      return mapLocation(row);
    });
  },

  async nearby({ lat, lng, radiusKm, type, limit }) {
    const postgis = await isPostgisEnabled();
    const params = [lat, lng, radiusKm, limit];
    let typeClause = '';
    if (type) {
      params.push(type);
      typeClause = `AND loc.type = $${params.length}::location_type`;
    }

    const selectBody = `
      loc.id,
      loc.name,
      loc.slug,
      loc.type,
      loc.status,
      loc.parent_id,
      loc.country_id,
      loc.state_id,
      loc.lga_id,
      loc.city_id,
      loc.area_id,
      loc.latitude,
      loc.longitude,
      loc.address,
      c.name AS country_name,
      c.iso2 AS country_iso2,
      s.name AS state_name,
      s.code AS state_code,
      l.name AS lga_name,
      ct.name AS city_name,
      a.name AS area_ref_name
    `;

    const fromJoins = `
      FROM locations loc
      LEFT JOIN countries c ON c.id = loc.country_id
      LEFT JOIN states s ON s.id = loc.state_id
      LEFT JOIN lgas l ON l.id = loc.lga_id
      LEFT JOIN cities_towns ct ON ct.id = loc.city_id
      LEFT JOIN areas a ON a.id = loc.area_id
    `;

    if (postgis) {
      // Prepared for PostGIS: expects geography column `geom` when available.
      try {
        const result = await getPool().query(
          `SELECT ${selectBody},
             ST_Distance(
               loc.geom::geography,
               ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
             ) / 1000.0 AS distance_km
           ${fromJoins}
           WHERE loc.status = 'active'
             AND loc.geom IS NOT NULL
             ${typeClause}
             AND ST_DWithin(
               loc.geom::geography,
               ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
               $3 * 1000.0
             )
           ORDER BY distance_km ASC
           LIMIT $4`,
          params
        );
        return result.rows.map((row) => {
          row.subtitle = buildSubtitle(row);
          row.breadcrumb = buildBreadcrumb(row);
          return mapLocation(row);
        });
      } catch {
        // Continue with Haversine fallback
      }
    }

    const result = await getPool().query(
      `SELECT * FROM (
         SELECT ${selectBody},
           (
             6371 * acos(
               least(1.0, greatest(-1.0,
                 cos(radians($1)) * cos(radians(loc.latitude)) *
                 cos(radians(loc.longitude) - radians($2)) +
                 sin(radians($1)) * sin(radians(loc.latitude))
               ))
             )
           ) AS distance_km
         ${fromJoins}
         WHERE loc.status = 'active'
           AND loc.latitude IS NOT NULL
           AND loc.longitude IS NOT NULL
           ${typeClause}
       ) nearby
       WHERE nearby.distance_km <= $3
       ORDER BY nearby.distance_km ASC
       LIMIT $4`,
      params
    );

    return result.rows.map((row) => {
      row.subtitle = buildSubtitle(row);
      row.breadcrumb = buildBreadcrumb(row);
      return mapLocation(row);
    });
  },

  async listStates(countryIso2 = 'NG') {
    const result = await getPool().query(
      `SELECT s.id, s.code, s.name, s.capital, c.iso2 AS country_iso2
       FROM states s
       LEFT JOIN countries c ON c.id = s.country_id
       WHERE s.is_active = TRUE
         AND (c.iso2 = $1 OR c.iso2 IS NULL)
       ORDER BY s.name ASC`,
      [countryIso2]
    );
    return result.rows;
  },

  async listLgas(stateId) {
    const result = await getPool().query(
      `SELECT id, state_id, name, code, latitude, longitude
       FROM lgas
       WHERE state_id = $1 AND is_active = TRUE
       ORDER BY name ASC`,
      [stateId]
    );
    return result.rows;
  },

  async listAreas(lgaId) {
    const result = await getPool().query(
      `SELECT a.id, a.lga_id, a.state_id, a.name,
              a.centroid_lat AS latitude, a.centroid_lng AS longitude,
              loc.id AS location_id
       FROM areas a
       LEFT JOIN locations loc ON loc.type = 'area' AND loc.area_id = a.id
       WHERE a.lga_id = $1 AND a.is_active = TRUE
       ORDER BY a.name ASC`,
      [lgaId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      lga_id: row.lga_id,
      state_id: row.state_id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      locationId: row.location_id,
    }));
  },

  async findAreaLocationByAreaId(areaId) {
    const result = await getPool().query(
      `${locationSelect} WHERE loc.type = 'area' AND loc.area_id = $1 LIMIT 1`,
      [areaId]
    );
    const row = result.rows[0];
    if (!row) return null;
    row.subtitle = buildSubtitle(row);
    row.breadcrumb = buildBreadcrumb(row);
    return mapLocation(row);
  },

  async getCapabilities() {
    return {
      postgis: await isPostgisEnabled(),
      nearby: true,
      search: true,
      notes: (await isPostgisEnabled())
        ? 'PostGIS is enabled for spatial queries.'
        : 'Nearby currently uses Haversine on latitude/longitude. Install PostGIS to enable native geography indexes.',
    };
  },
};
