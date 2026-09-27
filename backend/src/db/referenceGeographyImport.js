/**
 * Idempotent Nigerian geography reference import.
 * Uses only verified local datasets (states seed + data/lgas.json).
 * Never invents locations, roads, landmarks, or coordinates.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LGAS_DATASET_PATH = path.resolve(__dirname, '../../data/lgas.json');

export const GEOGRAPHY_DATASET = {
  key: 'nigeria_lgas_reference',
  sourceName: 'Nigeria LGA reference dataset (project data/lgas.json)',
  sourceType: 'reference_dataset',
  // Local project file — not a live government scrape claim
  sourceUrl: null,
};

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validCoord(lat, lng) {
  if (lat == null || lng == null) return false;
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180;
}

export function loadLgasDataset(filePath = LGAS_DATASET_PATH) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`LGA dataset not found: ${filePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(raw) || !raw.length) {
    throw new Error('LGA dataset is empty or invalid');
  }
  return raw;
}

export function validateLgaDataset(items) {
  const errors = [];
  const seen = new Set();
  let withCoords = 0;
  for (const [i, item] of items.entries()) {
    if (!item?.name || !item?.state_code) {
      errors.push({ index: i, error: 'missing_name_or_state_code', item });
      continue;
    }
    const key = `${String(item.state_code).trim()}::${String(item.name).trim().toLowerCase()}`;
    if (seen.has(key)) {
      errors.push({ index: i, error: 'duplicate_in_dataset', key });
    }
    seen.add(key);
    if (validCoord(item.latitude, item.longitude)) withCoords += 1;
    else if (item.latitude != null || item.longitude != null) {
      errors.push({ index: i, error: 'invalid_coordinates', name: item.name });
    }
  }
  return {
    total: items.length,
    uniqueKeys: seen.size,
    withCoords,
    errors,
    ok: errors.filter((e) => e.error !== 'invalid_coordinates').length === 0,
  };
}

async function upsertLocation(client, row, { dryRun, batchId }) {
  const {
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
    sourceExternalId = null,
  } = row;

  if (dryRun) {
    return { id: null, action: 'would_upsert' };
  }

  const slug = slugify(name);
  const result = await client.query(
    `INSERT INTO locations (
       name, slug, type, parent_id, country_id, state_id, lga_id, city_id, area_id,
       latitude, longitude, metadata,
       source_name, source_type, source_url, source_external_id, import_batch_id, verified_at
     ) VALUES (
       $1,$2,$3::location_type,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,
       $13,$14,$15,$16,$17,NOW()
     )
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
      GEOGRAPHY_DATASET.sourceName,
      GEOGRAPHY_DATASET.sourceType,
      GEOGRAPHY_DATASET.sourceUrl,
      sourceExternalId,
      batchId,
    ]
  );

  if (result.rows[0]?.id) {
    return { id: result.rows[0].id, action: 'inserted' };
  }

  let existing = null;
  if (type === 'country' && countryId) {
    existing = await client.query(
      `SELECT id FROM locations WHERE type = 'country' AND country_id = $1`,
      [countryId]
    );
  } else if (type === 'state' && stateId) {
    existing = await client.query(
      `SELECT id FROM locations WHERE type = 'state' AND state_id = $1`,
      [stateId]
    );
  } else if (type === 'lga' && lgaId) {
    existing = await client.query(
      `SELECT id FROM locations WHERE type = 'lga' AND lga_id = $1`,
      [lgaId]
    );
  } else if (type === 'area' && areaId) {
    existing = await client.query(
      `SELECT id FROM locations WHERE type = 'area' AND area_id = $1`,
      [areaId]
    );
  }

  const id = existing?.rows[0]?.id || null;
  if (id && !dryRun) {
    await client.query(
      `UPDATE locations SET
         latitude = COALESCE($2, latitude),
         longitude = COALESCE($3, longitude),
         source_name = COALESCE(source_name, $4),
         source_type = COALESCE(source_type, $5),
         source_external_id = COALESCE(source_external_id, $6),
         import_batch_id = COALESCE(import_batch_id, $7),
         metadata = metadata || $8::jsonb,
         updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        latitude,
        longitude,
        GEOGRAPHY_DATASET.sourceName,
        GEOGRAPHY_DATASET.sourceType,
        sourceExternalId,
        batchId,
        JSON.stringify(metadata),
      ]
    );
  }
  return { id, action: id ? 'updated' : 'skipped' };
}

/**
 * @param {{ dryRun?: boolean, importedBy?: string|null, datasetPath?: string }} options
 */
export async function importNigeriaGeographyReference(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const pool = getPool();
  const client = await pool.connect();
  const lgasData = loadLgasDataset(options.datasetPath || LGAS_DATASET_PATH);
  const validation = validateLgaDataset(lgasData);

  const summary = {
    dryRun,
    dataset: GEOGRAPHY_DATASET.key,
    validation,
    country: null,
    statesLinked: 0,
    lgasInserted: 0,
    lgasUpdated: 0,
    lgasSkipped: 0,
    locationsInserted: 0,
    locationsUpdated: 0,
    areasLinked: 0,
    warnings: [],
  };

  let batchId = null;

  try {
    await client.query('BEGIN');

    if (!dryRun) {
      const batch = await client.query(
        `INSERT INTO reference_import_batches (
           dataset_key, source_name, source_type, source_url, dry_run, status, imported_by
         ) VALUES ($1,$2,$3,$4,FALSE,'completed',$5)
         RETURNING id`,
        [
          GEOGRAPHY_DATASET.key,
          GEOGRAPHY_DATASET.sourceName,
          GEOGRAPHY_DATASET.sourceType,
          GEOGRAPHY_DATASET.sourceUrl,
          options.importedBy || null,
        ]
      );
      batchId = batch.rows[0].id;
    }

    const countryRes = dryRun
      ? await client.query(`SELECT id FROM countries WHERE iso2 = 'NG' LIMIT 1`)
      : await client.query(
          `INSERT INTO countries (iso2, iso3, name)
           VALUES ('NG', 'NGA', 'Nigeria')
           ON CONFLICT (iso2) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
           RETURNING id`
        );

    let countryId = countryRes.rows[0]?.id || null;
    if (dryRun && !countryId) {
      summary.warnings.push('Country Nigeria would be created');
      countryId = null;
    }
    summary.country = countryId ? 'present' : 'missing';

    if (!dryRun && countryId) {
      const linked = await client.query(
        `UPDATE states SET country_id = $1 WHERE country_id IS NULL RETURNING id`,
        [countryId]
      );
      summary.statesLinked = linked.rowCount || 0;
    }

    const statesRes = await client.query(`SELECT id, code, name FROM states`);
    const stateByCode = new Map(statesRes.rows.map((row) => [row.code.trim(), row]));

    if (!dryRun && stateByCode.get('FC')) {
      await client.query(
        `UPDATE states SET name = 'Federal Capital Territory', updated_at = NOW() WHERE code = 'FC'`
      );
      stateByCode.get('FC').name = 'Federal Capital Territory';
    }

    for (const item of lgasData) {
      const state = stateByCode.get(item.state_code);
      if (!state) {
        summary.lgasSkipped += 1;
        summary.warnings.push(`LGA skipped — unknown state_code ${item.state_code}: ${item.name}`);
        continue;
      }

      const lat = validCoord(item.latitude, item.longitude) ? item.latitude : null;
      const lng = validCoord(item.latitude, item.longitude) ? item.longitude : null;

      if (dryRun) {
        const exists = await client.query(
          `SELECT id FROM lgas WHERE state_id = $1 AND lower(name) = lower($2) LIMIT 1`,
          [state.id, item.name]
        );
        if (exists.rows[0]) summary.lgasUpdated += 1;
        else summary.lgasInserted += 1;
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
        [state.id, item.name, String(item.id), lat, lng]
      );
      if (lgaRes.rows[0]?.inserted) summary.lgasInserted += 1;
      else summary.lgasUpdated += 1;
    }

    // Locations hierarchy
    let countryLocId = null;
    if (countryId) {
      const r = await upsertLocation(
        client,
        {
          name: 'Nigeria',
          type: 'country',
          countryId,
          metadata: { country: 'Nigeria' },
          sourceExternalId: 'NG',
        },
        { dryRun, batchId }
      );
      countryLocId = r.id;
      if (r.action === 'inserted') summary.locationsInserted += 1;
      if (r.action === 'updated' || r.action === 'would_upsert') summary.locationsUpdated += 1;
    }

    const stateLocIds = new Map();
    for (const state of statesRes.rows) {
      const r = await upsertLocation(
        client,
        {
          name: state.code === 'FC' ? 'Federal Capital Territory' : state.name,
          type: 'state',
          parentId: countryLocId,
          countryId,
          stateId: state.id,
          metadata: { country: 'Nigeria', state: state.name, stateCode: state.code },
          sourceExternalId: state.code,
        },
        { dryRun, batchId }
      );
      stateLocIds.set(state.id, r.id);
      if (r.action === 'inserted') summary.locationsInserted += 1;
      if (r.action === 'updated' || r.action === 'would_upsert') summary.locationsUpdated += 1;
    }

    const lgasRes = await client.query(`SELECT id, state_id, name, latitude, longitude, code FROM lgas`);
    const lgaLocIds = new Map();
    for (const lga of lgasRes.rows) {
      const state = statesRes.rows.find((s) => s.id === lga.state_id);
      const r = await upsertLocation(
        client,
        {
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
          sourceExternalId: lga.code || null,
        },
        { dryRun, batchId }
      );
      lgaLocIds.set(lga.id, r.id);
      if (r.action === 'inserted') summary.locationsInserted += 1;
      if (r.action === 'updated' || r.action === 'would_upsert') summary.locationsUpdated += 1;
    }

    const areasRes = await client.query(
      `SELECT a.id, a.name, a.state_id, a.lga_id, a.centroid_lat, a.centroid_lng,
              s.name AS state_name, s.code AS state_code, l.name AS lga_name
       FROM areas a
       JOIN states s ON s.id = a.state_id
       JOIN lgas l ON l.id = a.lga_id`
    );

    for (const area of areasRes.rows) {
      const r = await upsertLocation(
        client,
        {
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
          sourceExternalId: `area:${area.id}`,
        },
        { dryRun, batchId }
      );
      if (r.action === 'inserted') {
        summary.locationsInserted += 1;
        summary.areasLinked += 1;
      }
      if (r.action === 'updated' || r.action === 'would_upsert') {
        summary.locationsUpdated += 1;
        summary.areasLinked += 1;
      }
    }

    if (!dryRun) {
      await client.query(
        `UPDATE users u
         SET current_location_id = loc.id
         FROM locations loc
         WHERE u.current_area_id IS NOT NULL
           AND loc.type = 'area'
           AND loc.area_id = u.current_area_id
           AND (u.current_location_id IS DISTINCT FROM loc.id)`
      );

      if (batchId) {
        await client.query(
          `UPDATE reference_import_batches
           SET completed_at = NOW(), summary = $2::jsonb, status = 'completed'
           WHERE id = $1`,
          [batchId, JSON.stringify(summary)]
        );
      }
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
      summary.status = 'dry_run';
    }

    return { success: true, batchId, summary };
  } catch (error) {
    await client.query('ROLLBACK');
    if (batchId) {
      try {
        await getPool().query(
          `UPDATE reference_import_batches
           SET status = 'failed', completed_at = NOW(), error_message = $2, summary = $3::jsonb
           WHERE id = $1`,
          [batchId, error.message, JSON.stringify(summary)]
        );
      } catch {
        /* ignore */
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

export const referenceGeographyImport = {
  importNigeriaGeographyReference,
  validateLgaDataset,
  loadLgasDataset,
  GEOGRAPHY_DATASET,
};
