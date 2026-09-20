import { getPool } from '../db/pool.js';

/**
 * Map external place hints to Nigeria geographic hierarchy.
 * Never invents locations — returns broader context when unsure.
 *
 * Resolution levels: exact | area | lga | state | unknown
 */
export async function resolveOfficialLocation({
  stateId = null,
  locationId = null,
  stateCode = null,
  stateName = null,
  lgaName = null,
  areaName = null,
  placeHint = null,
} = {}) {
  const pool = getPool();

  if (locationId) {
    const loc = await pool.query(
      `SELECT id, type, name, state_id, lga_id FROM locations WHERE id = $1 AND status = 'active'`,
      [locationId]
    );
    if (loc.rows[0]) {
      return {
        locationId: loc.rows[0].id,
        stateId: loc.rows[0].state_id || stateId,
        level: loc.rows[0].type === 'area' ? 'area' : 'exact',
        label: loc.rows[0].name,
      };
    }
  }

  if (stateId) {
    const st = await pool.query(`SELECT id, name, code FROM states WHERE id = $1`, [stateId]);
    if (!st.rows[0]) {
      return { locationId: null, stateId: null, level: 'unknown', label: null };
    }
  }

  let resolvedStateId = stateId;
  if (!resolvedStateId && (stateCode || stateName)) {
    const st = await pool.query(
      `SELECT id, name, code FROM states
       WHERE ($1::text IS NOT NULL AND upper(code) = upper($1))
          OR ($2::text IS NOT NULL AND lower(name) = lower($2))
       LIMIT 1`,
      [stateCode || null, stateName || null]
    );
    if (st.rows[0]) resolvedStateId = st.rows[0].id;
  }

  const hint = String(placeHint || areaName || lgaName || '').trim();
  if (hint) {
    const params = [hint];
    let sql = `
      SELECT id, type, name, state_id, lga_id
      FROM locations
      WHERE status = 'active'
        AND type IN ('area', 'lga', 'city', 'landmark', 'road')
        AND lower(name) = lower($1)`;
    if (resolvedStateId) {
      params.push(resolvedStateId);
      sql += ` AND state_id = $2`;
    }
    sql += ` ORDER BY CASE type WHEN 'area' THEN 1 WHEN 'lga' THEN 2 WHEN 'city' THEN 3 ELSE 4 END LIMIT 1`;
    const hit = await pool.query(sql, params);
    if (hit.rows[0]) {
      return {
        locationId: hit.rows[0].id,
        stateId: hit.rows[0].state_id || resolvedStateId,
        level: hit.rows[0].type === 'lga' ? 'lga' : hit.rows[0].type === 'area' ? 'area' : 'exact',
        label: hit.rows[0].name,
      };
    }

    // Partial name match within state only (controlled)
    if (resolvedStateId && hint.length >= 3) {
      const partial = await pool.query(
        `SELECT id, type, name, state_id
         FROM locations
         WHERE status = 'active'
           AND state_id = $1
           AND type IN ('area', 'lga', 'city')
           AND name ILIKE $2
         ORDER BY CASE type WHEN 'area' THEN 1 WHEN 'lga' THEN 2 ELSE 3 END, char_length(name)
         LIMIT 1`,
        [resolvedStateId, hint]
      );
      if (partial.rows[0]) {
        return {
          locationId: partial.rows[0].id,
          stateId: partial.rows[0].state_id,
          level: partial.rows[0].type === 'lga' ? 'lga' : 'area',
          label: partial.rows[0].name,
        };
      }
    }
  }

  if (resolvedStateId) {
    const st = await pool.query(`SELECT id, name FROM states WHERE id = $1`, [resolvedStateId]);
    return {
      locationId: null,
      stateId: resolvedStateId,
      level: 'state',
      label: st.rows[0]?.name || null,
    };
  }

  return { locationId: null, stateId: null, level: 'unknown', label: null };
}
