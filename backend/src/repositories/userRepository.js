import { getPool } from '../db/pool.js';

function publicUser(row) {
  if (!row) return null;
  const adminRole = row.admin_role || (row.is_moderator ? 'admin' : null);
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    phone: row.phone,
    onboardingCompleted: row.onboarding_completed,
    isModerator: Boolean(row.is_moderator || adminRole),
    adminRole: adminRole || null,
    isSuspended: Boolean(row.suspended_at),
    currentArea: row.area_id
      ? {
          id: row.area_id,
          locationId: row.location_id || row.current_location_id || null,
          name: row.area_name,
          lga: row.lga_name,
          state: row.state_name,
          stateCode: row.state_code,
        }
      : null,
    createdAt: row.created_at,
  };
}

const userSelect = `
  SELECT
    u.id,
    u.display_name,
    u.email,
    u.phone,
    u.password_hash,
    u.onboarding_completed,
    u.current_area_id,
    u.current_location_id,
    u.is_active,
    u.is_moderator,
    u.admin_role,
    u.suspended_at,
    u.created_at,
    a.id AS area_id,
    a.name AS area_name,
    l.name AS lga_name,
    s.name AS state_name,
    s.code AS state_code,
    loc.id AS location_id
  FROM users u
  LEFT JOIN areas a ON a.id = u.current_area_id
  LEFT JOIN lgas l ON l.id = a.lga_id
  LEFT JOIN states s ON s.id = a.state_id
  LEFT JOIN locations loc ON loc.id = COALESCE(
    u.current_location_id,
    (SELECT id FROM locations WHERE type = 'area' AND area_id = u.current_area_id LIMIT 1)
  )
`;

export const userRepository = {
  async findById(id) {
    const result = await getPool().query(`${userSelect} WHERE u.id = $1`, [id]);
    return result.rows[0] || null;
  },

  async findByEmail(email) {
    const result = await getPool().query(`${userSelect} WHERE lower(u.email) = lower($1)`, [
      email,
    ]);
    return result.rows[0] || null;
  },

  async findByPhone(phone) {
    const result = await getPool().query(`${userSelect} WHERE u.phone = $1`, [phone]);
    return result.rows[0] || null;
  },

  async create({ displayName, email, phone, passwordHash }) {
    const result = await getPool().query(
      `INSERT INTO users (display_name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [displayName, email, phone, passwordHash]
    );
    return this.findById(result.rows[0].id);
  },

  async setCurrentArea(userId, area) {
    const locationRes = await getPool().query(
      `SELECT id FROM locations WHERE type = 'area' AND area_id = $1 LIMIT 1`,
      [area.id]
    );
    await getPool().query(
      `UPDATE users
       SET current_area_id = $2,
           current_lga_id = $3,
           current_state_id = $4,
           current_location_id = $5,
           onboarding_completed = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [userId, area.id, area.lga_id, area.state_id, locationRes.rows[0]?.id || null]
    );
    return this.findById(userId);
  },

  toPublic(row) {
    return publicUser(row);
  },
};

export const geoRepository = {
  async listStates() {
    const result = await getPool().query(
      `SELECT id, code, name, capital
       FROM states
       WHERE is_active = TRUE
       ORDER BY name ASC`
    );
    return result.rows;
  },

  async listLgas(stateId) {
    const result = await getPool().query(
      `SELECT id, state_id, name
       FROM lgas
       WHERE state_id = $1 AND is_active = TRUE
       ORDER BY name ASC`,
      [stateId]
    );
    return result.rows;
  },

  async listAreas(lgaId) {
    const result = await getPool().query(
      `SELECT id, lga_id, state_id, name
       FROM areas
       WHERE lga_id = $1 AND is_active = TRUE
       ORDER BY name ASC`,
      [lgaId]
    );
    return result.rows;
  },

  async findAreaById(areaId) {
    const result = await getPool().query(
      `SELECT a.id, a.name, a.lga_id, a.state_id, l.name AS lga_name, s.name AS state_name, s.code AS state_code
       FROM areas a
       JOIN lgas l ON l.id = a.lga_id
       JOIN states s ON s.id = a.state_id
       WHERE a.id = $1 AND a.is_active = TRUE`,
      [areaId]
    );
    return result.rows[0] || null;
  },

  async findNearestArea(lat, lng) {
    const result = await getPool().query(
      `SELECT
         a.id,
         a.name,
         a.lga_id,
         a.state_id,
         l.name AS lga_name,
         s.name AS state_name,
         s.code AS state_code,
         (
           6371 * acos(
             least(1.0, greatest(-1.0,
               cos(radians($1)) * cos(radians(a.centroid_lat)) *
               cos(radians(a.centroid_lng) - radians($2)) +
               sin(radians($1)) * sin(radians(a.centroid_lat))
             ))
           )
         ) AS distance_km
       FROM areas a
       JOIN lgas l ON l.id = a.lga_id
       JOIN states s ON s.id = a.state_id
       WHERE a.is_active = TRUE
         AND a.centroid_lat IS NOT NULL
         AND a.centroid_lng IS NOT NULL
       ORDER BY distance_km ASC
       LIMIT 1`,
      [lat, lng]
    );
    return result.rows[0] || null;
  },
};
