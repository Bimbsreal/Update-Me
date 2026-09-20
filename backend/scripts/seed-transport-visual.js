/**
 * Seed a couple of community fare reports for local visual verification.
 * Does not invent official fares.
 */
import { getPool, closePool } from '../src/db/pool.js';
import { transportService } from '../src/services/transportService.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Transport Visual', email, 'test-hash-not-for-login']
  );
  return created.rows[0].id;
}

const pool = getPool();
const routes = await pool.query(
  `SELECT id, name FROM transport_routes WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 5`
);
console.log('routes', routes.rows);

if (!routes.rows.length) {
  console.log('No transport routes seeded.');
  await closePool();
  process.exit(0);
}

const userId = await ensureUser('transport.visual@example.com');
const otherId = await ensureUser('transport.visual2@example.com');

for (const route of routes.rows.slice(0, 2)) {
  try {
    const fare = await transportService.createFare(userId, {
      routeId: route.id,
      transportMode: 'bus',
      fareAmount: 800,
      boardingPointLabel: 'Main stand',
      notes: 'Local visual verification community fare — not an official price.',
    });
    console.log('created', fare.id, route.name, 800);
  } catch (err) {
    console.log('skip/create', route.name, err.message);
  }
  try {
    const fare2 = await transportService.createFare(otherId, {
      routeId: route.id,
      transportMode: 'bus',
      fareAmount: 1000,
      boardingPointLabel: 'Secondary stand',
      notes: 'Second verification fare for range display.',
    });
    console.log('created', fare2.id, route.name, 1000);
  } catch (err) {
    console.log('skip/create2', route.name, err.message);
  }
}

await closePool();
