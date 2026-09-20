/**
 * Seed a few utility community questions for local visual verification.
 * Usage: node scripts/seed-community-visual.js
 */
import { getPool, closePool } from '../src/db/pool.js';
import { communityService } from '../src/services/communityService.js';

async function ensureUser(email, name) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    [name, email, 'seed-hash-not-for-login']
  );
  return created.rows[0].id;
}

async function lekkiLocationId() {
  const result = await getPool().query(
    `SELECT id FROM locations WHERE name ILIKE 'Lekki Phase 1' AND type = 'area' LIMIT 1`
  );
  if (!result.rows[0]) throw new Error('Lekki Phase 1 area not found — seed geography first.');
  return result.rows[0].id;
}

async function main() {
  const asker = await ensureUser('community.seed.asker@example.com', 'Community Seed Asker');
  const helper = await ensureUser('community.seed.helper@example.com', 'Community Seed Helper');
  const locationId = await lekkiLocationId();
  const stamp = Date.now();

  const q1 = await communityService.createQuestion(asker, {
    title: `Is there fuel around Lekki Phase 1 this morning? (${stamp})`,
    description: 'Looking for PMS near Admiralty / Chevron Drive.',
    category: 'fuel',
    locationId,
    relevanceHours: 12,
  });

  const q2 = await communityService.createQuestion(asker, {
    title: `What is the current fare from Lekki Phase 1 to Victoria Island? (${stamp})`,
    category: 'transport',
    locationId,
    relevanceHours: 48,
  });

  await communityService.createAnswer(helper, q2.id, {
    content:
      'VI-bound buses near the Phase 1 roundabout are commonly ₦800–₦1,000 depending on time of day. Board before the Admiralty interchange when possible.',
  });

  console.log('seeded questions', q1.id, q2.id);
  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
