/**
 * Seed community local alerts for visual verification (Lekki).
 */
import { getPool, closePool } from '../src/db/pool.js';
import { alertsService } from '../src/services/alertsService.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Alerts Visual', email, 'test-hash-not-for-login']
  );
  return created.rows[0].id;
}

const loc = await getPool().query(
  `SELECT loc.id
   FROM areas a
   JOIN locations loc ON loc.area_id = a.id AND loc.type = 'area'
   WHERE lower(a.name) = 'lekki phase 1'
   LIMIT 1`
);
const locationId = loc.rows[0]?.id;
if (!locationId) {
  console.log('Lekki Phase 1 location missing');
  await closePool();
  process.exit(1);
}

const userA = await ensureUser('alerts.visual@example.com');
const userB = await ensureUser('alerts.visual2@example.com');

const seeds = [
  {
    user: userA,
    alertCategory: 'road_blockage',
    severity: 'urgent',
    whatHappened: 'Lane partially blocked by stalled truck near the roundabout.',
    roadName: 'Admiralty Way',
    affectedArea: 'Near Lekki Phase 1 roundabout',
  },
  {
    user: userB,
    alertCategory: 'flooding',
    severity: 'caution',
    whatHappened: 'Standing water after rainfall on the service lane.',
    roadName: 'Lekki–Epe Expressway',
    affectedArea: 'Service lane approach',
  },
  {
    user: userA,
    alertCategory: 'accident',
    severity: 'urgent',
    whatHappened: 'Minor collision cleared to the shoulder; drivers should proceed carefully.',
    roadName: 'Lekki–Epe Expressway',
    affectedArea: 'Inbound near Chevron',
  },
];

for (const seed of seeds) {
  try {
    const alert = await alertsService.create(seed.user, {
      locationId,
      alertCategory: seed.alertCategory,
      severity: seed.severity,
      whatHappened: seed.whatHappened,
      roadName: seed.roadName,
      affectedArea: seed.affectedArea,
      notes: 'Local visual verification community alert — not an official emergency notice.',
    });
    console.log('created', seed.alertCategory, seed.severity, alert.id);
  } catch (err) {
    console.log('skip', seed.alertCategory, err.message);
  }
}

await closePool();
