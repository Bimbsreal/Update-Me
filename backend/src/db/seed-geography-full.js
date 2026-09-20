import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool, closePool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LGAS_PATH = path.resolve(__dirname, '../../data/lgas.json');

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function upsertLocation(client, {
  name,
  type,
  parentId = null,
  countryId = null,
  stateId = null,
  lgaId = null,
  cityId = null,
  areaId = null,
  latitude = null,
  longitude = null,
  metadata = {},
}) {
  const slug = slugify(name);
  const result = await client.query(
    `INSERT INTO locations (
       name, slug, type, parent_id, country_id, state_id, lga_id, city_id, area_id,
       latitude, longitude, metadata
     ) VALUES ($1,$2,$3::location_type,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      name,
      slug,
      type,
      parentId,
      countryId,
      stateId,
      lgaId,
      cityId,
      areaId,
      latitude,
      longitude,
      JSON.stringify(metadata),
    ]
  );

  if (result.rows[0]?.id) return result.rows[0].id;

  // Resolve existing by unique typed FK
  if (type === 'country' && countryId) {
    const existing = await client.query(
      `SELECT id FROM locations WHERE type = 'country' AND country_id = $1`,
      [countryId]
    );
    return existing.rows[0]?.id;
  }
  if (type === 'state' && stateId) {
    const existing = await client.query(
      `SELECT id FROM locations WHERE type = 'state' AND state_id = $1`,
      [stateId]
    );
    return existing.rows[0]?.id;
  }
  if (type === 'lga' && lgaId) {
    const existing = await client.query(
      `SELECT id FROM locations WHERE type = 'lga' AND lga_id = $1`,
      [lgaId]
    );
    return existing.rows[0]?.id;
  }
  if (type === 'area' && areaId) {
    const existing = await client.query(
      `SELECT id FROM locations WHERE type = 'area' AND area_id = $1`,
      [areaId]
    );
    return existing.rows[0]?.id;
  }
  return null;
}

async function seed() {
  const pool = getPool();
  const client = await pool.connect();
  const lgasData = JSON.parse(fs.readFileSync(LGAS_PATH, 'utf8'));

  try {
    await client.query('BEGIN');

    const countryRes = await client.query(
      `INSERT INTO countries (iso2, iso3, name)
       VALUES ('NG', 'NGA', 'Nigeria')
       ON CONFLICT (iso2) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
       RETURNING id`
    );
    const countryId = countryRes.rows[0].id;

    await client.query(`UPDATE states SET country_id = $1 WHERE country_id IS NULL`, [countryId]);

    const statesRes = await client.query(`SELECT id, code, name FROM states`);
    const stateByCode = new Map(statesRes.rows.map((row) => [row.code.trim(), row]));

    // Align FCT naming with dataset while keeping code FC
    if (stateByCode.get('FC')) {
      await client.query(
        `UPDATE states SET name = 'Federal Capital Territory', updated_at = NOW() WHERE code = 'FC'`
      );
      stateByCode.get('FC').name = 'Federal Capital Territory';
    }

    let lgaInserted = 0;
    for (const item of lgasData) {
      const state = stateByCode.get(item.state_code);
      if (!state) {
        console.warn(`Skipping LGA without matching state code: ${item.name} (${item.state_code})`);
        continue;
      }

      const lgaRes = await client.query(
        `INSERT INTO lgas (state_id, name, code, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (state_id, name) DO UPDATE
         SET code = EXCLUDED.code,
             latitude = COALESCE(EXCLUDED.latitude, lgas.latitude),
             longitude = COALESCE(EXCLUDED.longitude, lgas.longitude),
             updated_at = NOW()
         RETURNING id, (xmax = 0) AS inserted`,
        [state.id, item.name, String(item.id), item.latitude, item.longitude]
      );
      if (lgaRes.rows[0]?.inserted) lgaInserted += 1;
    }

    // Build searchable locations hierarchy
    const countryLocId = await upsertLocation(client, {
      name: 'Nigeria',
      type: 'country',
      countryId,
      metadata: { country: 'Nigeria' },
    });

    const stateLocIds = new Map();
    for (const state of statesRes.rows) {
      const locId = await upsertLocation(client, {
        name: state.code === 'FC' ? 'Federal Capital Territory' : state.name,
        type: 'state',
        parentId: countryLocId,
        countryId,
        stateId: state.id,
        metadata: { country: 'Nigeria', state: state.name, stateCode: state.code },
      });
      stateLocIds.set(state.id, locId);
    }

    const lgasRes = await client.query(`SELECT id, state_id, name, latitude, longitude FROM lgas`);
    const lgaLocIds = new Map();
    for (const lga of lgasRes.rows) {
      const state = statesRes.rows.find((s) => s.id === lga.state_id);
      const locId = await upsertLocation(client, {
        name: lga.name,
        type: 'lga',
        parentId: stateLocIds.get(lga.state_id),
        countryId,
        stateId: lga.state_id,
        lgaId: lga.id,
        latitude: lga.latitude,
        longitude: lga.longitude,
        metadata: {
          country: 'Nigeria',
          state: state?.name,
          stateCode: state?.code,
          lga: lga.name,
        },
      });
      lgaLocIds.set(lga.id, locId);
    }

    const areasRes = await client.query(
      `SELECT a.id, a.name, a.state_id, a.lga_id, a.centroid_lat, a.centroid_lng,
              s.name AS state_name, s.code AS state_code, l.name AS lga_name
       FROM areas a
       JOIN states s ON s.id = a.state_id
       JOIN lgas l ON l.id = a.lga_id`
    );

    for (const area of areasRes.rows) {
      await upsertLocation(client, {
        name: area.name,
        type: 'area',
        parentId: lgaLocIds.get(area.lga_id),
        countryId,
        stateId: area.state_id,
        lgaId: area.lga_id,
        areaId: area.id,
        latitude: area.centroid_lat,
        longitude: area.centroid_lng,
        metadata: {
          country: 'Nigeria',
          state: area.state_name,
          stateCode: area.state_code,
          lga: area.lga_name,
          area: area.name,
        },
      });
    }

    // Link users' current_location_id from current_area_id
    await client.query(
      `UPDATE users u
       SET current_location_id = loc.id
       FROM locations loc
       WHERE u.current_area_id IS NOT NULL
         AND loc.type = 'area'
         AND loc.area_id = u.current_area_id
         AND (u.current_location_id IS DISTINCT FROM loc.id)`
    );

    await client.query('COMMIT');
    console.log(
      `Geography seed complete. LGAs upserted from dataset (${lgasData.length}). New LGA inserts ~${lgaInserted}. Locations synced.`
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

seed().catch((error) => {
  console.error('Geography seed failed:', error.message);
  process.exit(1);
});
