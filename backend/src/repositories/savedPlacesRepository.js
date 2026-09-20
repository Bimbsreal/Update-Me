import { getPool } from '../db/pool.js';
import { placeKindLabel } from '../config/notifications.js';

function mapLocation(row, prefix = '') {
  const id = row[`${prefix}location_id`] ?? row.location_id;
  if (!id) return null;
  const name = row[`${prefix}location_name`] ?? row.location_name;
  const type = row[`${prefix}location_type`] ?? row.location_type;
  return {
    id,
    name,
    type,
    subtitle: row[`${prefix}location_subtitle`] ?? row.location_subtitle ?? null,
    state: row[`${prefix}state_name`]
      ? {
          id: row[`${prefix}state_id`],
          name: row[`${prefix}state_name`],
          code: row[`${prefix}state_code`],
        }
      : row.state_name
        ? { id: row.state_id, name: row.state_name, code: row.state_code }
        : null,
  };
}

const locationJoin = (alias, locAlias) => `
  JOIN locations ${locAlias} ON ${locAlias}.id = ${alias}.location_id
  LEFT JOIN states ${locAlias}_st ON ${locAlias}_st.id = ${locAlias}.state_id
`;

function locationSelect(locAlias, prefix = '') {
  const p = prefix ? `${prefix}_` : '';
  return `
    ${locAlias}.id AS ${p}location_id,
    ${locAlias}.name AS ${p}location_name,
    ${locAlias}.type AS ${p}location_type,
    ${locAlias}_st.id AS ${p}state_id,
    ${locAlias}_st.name AS ${p}state_name,
    ${locAlias}_st.code AS ${p}state_code,
    CASE
      WHEN ${locAlias}_st.code = 'FC' THEN ${locAlias}_st.name
      WHEN ${locAlias}_st.name IS NOT NULL THEN ${locAlias}_st.name || ' State'
      ELSE NULL
    END AS ${p}location_subtitle
  `;
}

function mapSavedArea(row) {
  if (!row) return null;
  const displayName =
    row.custom_name || placeKindLabel(row.place_kind) || row.location_name;
  return {
    id: row.id,
    placeKind: row.place_kind,
    placeKindLabel: placeKindLabel(row.place_kind),
    customName: row.custom_name || null,
    displayName,
    notifyEnabled: Boolean(row.notify_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    location: mapLocation(row),
  };
}

function mapSavedRoute(row) {
  if (!row) return null;
  const originName = row.origin_location_name;
  const destName = row.destination_location_name;
  const displayName = row.custom_name || `${originName} → ${destName}`;
  return {
    id: row.id,
    customName: row.custom_name || null,
    displayName,
    travelMode: row.travel_mode,
    transportRouteId: row.transport_route_id || null,
    notifyEnabled: Boolean(row.notify_enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    origin: {
      id: row.origin_location_id,
      name: originName,
      type: row.origin_location_type,
      subtitle: row.origin_location_subtitle || null,
    },
    destination: {
      id: row.destination_location_id,
      name: destName,
      type: row.destination_location_type,
      subtitle: row.destination_location_subtitle || null,
    },
  };
}

export const savedPlacesRepository = {
  mapSavedArea,
  mapSavedRoute,

  async listAreas(userId) {
    const result = await getPool().query(
      `SELECT sa.*,
              ${locationSelect('loc')}
       FROM saved_areas sa
       ${locationJoin('sa', 'loc')}
       WHERE sa.user_id = $1
       ORDER BY
         CASE sa.place_kind
           WHEN 'home' THEN 0 WHEN 'work' THEN 1 WHEN 'school' THEN 2 ELSE 3
         END,
         sa.created_at ASC`,
      [userId]
    );
    return result.rows.map(mapSavedArea);
  },

  async findAreaById(userId, id) {
    const result = await getPool().query(
      `SELECT sa.*,
              ${locationSelect('loc')}
       FROM saved_areas sa
       ${locationJoin('sa', 'loc')}
       WHERE sa.id = $1 AND sa.user_id = $2`,
      [id, userId]
    );
    return mapSavedArea(result.rows[0]);
  },

  async findAreaRaw(userId, id) {
    const result = await getPool().query(
      `SELECT * FROM saved_areas WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return result.rows[0] || null;
  },

  async createArea(input) {
    const result = await getPool().query(
      `INSERT INTO saved_areas (user_id, location_id, place_kind, custom_name, notify_enabled)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [
        input.userId,
        input.locationId,
        input.placeKind,
        input.customName || null,
        input.notifyEnabled !== false,
      ]
    );
    return this.findAreaById(input.userId, result.rows[0].id);
  },

  async updateArea(userId, id, fields) {
    const sets = [];
    const params = [];
    let i = 1;
    const map = {
      placeKind: 'place_kind',
      customName: 'custom_name',
      notifyEnabled: 'notify_enabled',
    };
    for (const [key, col] of Object.entries(map)) {
      if (fields[key] !== undefined) {
        sets.push(`${col} = $${i++}`);
        params.push(fields[key]);
      }
    }
    if (!sets.length) return this.findAreaById(userId, id);
    sets.push('updated_at = NOW()');
    params.push(id, userId);
    await getPool().query(
      `UPDATE saved_areas SET ${sets.join(', ')}
       WHERE id = $${i++} AND user_id = $${i}`,
      params
    );
    return this.findAreaById(userId, id);
  },

  async deleteArea(userId, id) {
    const result = await getPool().query(
      `DELETE FROM saved_areas WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    return Boolean(result.rows[0]);
  },

  async listRoutes(userId) {
    const result = await getPool().query(
      `SELECT sr.*,
              o.name AS origin_location_name,
              o.type AS origin_location_type,
              d.name AS destination_location_name,
              d.type AS destination_location_type,
              CASE
                WHEN ost.code = 'FC' THEN ost.name
                WHEN ost.name IS NOT NULL THEN ost.name || ' State'
              END AS origin_location_subtitle,
              CASE
                WHEN dst.code = 'FC' THEN dst.name
                WHEN dst.name IS NOT NULL THEN dst.name || ' State'
              END AS destination_location_subtitle
       FROM saved_routes sr
       JOIN locations o ON o.id = sr.origin_location_id
       JOIN locations d ON d.id = sr.destination_location_id
       LEFT JOIN states ost ON ost.id = o.state_id
       LEFT JOIN states dst ON dst.id = d.state_id
       WHERE sr.user_id = $1
       ORDER BY sr.created_at ASC`,
      [userId]
    );
    return result.rows.map(mapSavedRoute);
  },

  async findRouteById(userId, id) {
    const result = await getPool().query(
      `SELECT sr.*,
              o.name AS origin_location_name,
              o.type AS origin_location_type,
              d.name AS destination_location_name,
              d.type AS destination_location_type,
              CASE
                WHEN ost.code = 'FC' THEN ost.name
                WHEN ost.name IS NOT NULL THEN ost.name || ' State'
              END AS origin_location_subtitle,
              CASE
                WHEN dst.code = 'FC' THEN dst.name
                WHEN dst.name IS NOT NULL THEN dst.name || ' State'
              END AS destination_location_subtitle
       FROM saved_routes sr
       JOIN locations o ON o.id = sr.origin_location_id
       JOIN locations d ON d.id = sr.destination_location_id
       LEFT JOIN states ost ON ost.id = o.state_id
       LEFT JOIN states dst ON dst.id = d.state_id
       WHERE sr.id = $1 AND sr.user_id = $2`,
      [id, userId]
    );
    return mapSavedRoute(result.rows[0]);
  },

  async createRoute(input) {
    const result = await getPool().query(
      `INSERT INTO saved_routes (
         user_id, origin_location_id, destination_location_id,
         custom_name, travel_mode, transport_route_id, notify_enabled
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [
        input.userId,
        input.originLocationId,
        input.destinationLocationId,
        input.customName || null,
        input.travelMode || 'any',
        input.transportRouteId || null,
        input.notifyEnabled !== false,
      ]
    );
    return this.findRouteById(input.userId, result.rows[0].id);
  },

  async updateRoute(userId, id, fields) {
    const sets = [];
    const params = [];
    let i = 1;
    const map = {
      customName: 'custom_name',
      travelMode: 'travel_mode',
      transportRouteId: 'transport_route_id',
      notifyEnabled: 'notify_enabled',
    };
    for (const [key, col] of Object.entries(map)) {
      if (fields[key] !== undefined) {
        sets.push(`${col} = $${i++}`);
        params.push(fields[key]);
      }
    }
    if (!sets.length) return this.findRouteById(userId, id);
    sets.push('updated_at = NOW()');
    params.push(id, userId);
    await getPool().query(
      `UPDATE saved_routes SET ${sets.join(', ')}
       WHERE id = $${i++} AND user_id = $${i}`,
      params
    );
    return this.findRouteById(userId, id);
  },

  async deleteRoute(userId, id) {
    const result = await getPool().query(
      `DELETE FROM saved_routes WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    return Boolean(result.rows[0]);
  },

  /** Users who should hear about an event at a location (saved area or route endpoint). */
  async findSubscriberUserIds(locationId) {
    const result = await getPool().query(
      `SELECT DISTINCT user_id FROM (
         SELECT user_id FROM saved_areas
         WHERE location_id = $1 AND notify_enabled = TRUE
         UNION
         SELECT user_id FROM saved_routes
         WHERE notify_enabled = TRUE
           AND (origin_location_id = $1 OR destination_location_id = $1)
       ) subs`,
      [locationId]
    );
    return result.rows.map((r) => r.user_id);
  },
};
