/**
 * Seed community local-knowledge for Directions visual verification.
 */
import { getPool, closePool } from '../src/db/pool.js';
import { directionsService } from '../src/services/directionsService.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Directions Visual', email, 'test-hash-not-for-login']
  );
  return created.rows[0].id;
}

async function areaLocation(name) {
  const result = await getPool().query(
    `SELECT loc.id
     FROM areas a
     JOIN locations loc ON loc.area_id = a.id AND loc.type = 'area'
     WHERE lower(a.name) = lower($1)
     LIMIT 1`,
    [name]
  );
  return result.rows[0]?.id || null;
}

const originId = await areaLocation('Lekki Phase 1');
const destId =
  (await areaLocation('Victoria Island')) ||
  (await getPool().query(
    `SELECT id FROM locations WHERE type = 'area' AND id <> $1 ORDER BY name LIMIT 1`,
    [originId]
  ).then((r) => r.rows[0]?.id));

if (!originId || !destId) {
  console.log('Need Lekki Phase 1 and another area location');
  await closePool();
  process.exit(1);
}

const userId = await ensureUser('directions.visual@example.com');

try {
  const knowledge = await directionsService.createLocalKnowledge(userId, {
    originLocationId: originId,
    destinationLocationId: destId,
    travelMode: 'driving',
    instructionSummary:
      'Use Lekki–Epe Expressway toward Victoria Island, then exit at the Admiralty interchange. Look for the Landmark Beach area as a reference.',
    majorRoads: 'Lekki–Epe Expressway → Admiralty Way',
    landmarks: 'Admiralty interchange · Landmark Beach area',
    boardingHint: 'For public transport, board VI-bound buses near the Phase 1 roundabout.',
    notes: 'Local visual verification community tip — not official navigation.',
  });
  console.log('created knowledge', knowledge.id);
} catch (err) {
  console.log('skip', err.message);
}

await closePool();
