/**
 * Seed community commodity prices for local visual verification.
 */
import { getPool, closePool } from '../src/db/pool.js';
import { pricesService } from '../src/services/pricesService.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Prices Visual', email, 'test-hash-not-for-login']
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

const userA = await ensureUser('prices.visual@example.com');
const userB = await ensureUser('prices.visual2@example.com');

const seeds = [
  { commodityCode: 'rice', variantCode: '5kg', amount: 7500, place: 'Lekki Phase 1 Market', user: userA },
  { commodityCode: 'rice', variantCode: '5kg', amount: 8200, place: 'Circle Mall area', user: userB },
  { commodityCode: 'beans', variantCode: '1kg', amount: 1800, place: 'Neighbourhood shop', user: userA },
  { commodityCode: 'eggs', variantCode: 'crate', amount: 4500, place: 'Open market', user: userB },
  { commodityCode: 'vegetable_oil', variantCode: '1l', amount: 2200, place: 'Supermarket', user: userA },
];

for (const seed of seeds) {
  try {
    const price = await pricesService.createReport(seed.user, {
      commodityCode: seed.commodityCode,
      variantCode: seed.variantCode,
      locationId,
      priceAmount: seed.amount,
      placeLabel: seed.place,
      placeType: 'market',
      notes: 'Local visual verification community price — not an official figure.',
    });
    console.log('created', seed.commodityCode, seed.variantCode, seed.amount, price.id);
  } catch (err) {
    console.log('skip', seed.commodityCode, seed.variantCode, err.message);
  }
}

// Add an older rice observation for history
const older = await getPool().query(
  `SELECT cpr.report_id
   FROM commodity_price_reports cpr
   JOIN commodities c ON c.id = cpr.commodity_id
   JOIN commodity_variants cv ON cv.id = cpr.variant_id
   JOIN reports r ON r.id = cpr.report_id
   WHERE c.code = 'rice' AND cv.code = '5kg' AND r.location_id = $1
   ORDER BY r.created_at ASC LIMIT 1`,
  [locationId]
);
if (older.rows[0]) {
  await getPool().query(
    `UPDATE reports SET occurred_at = NOW() - INTERVAL '5 days', created_at = NOW() - INTERVAL '5 days'
     WHERE id = $1`,
    [older.rows[0].report_id]
  );
  console.log('backdated one rice observation for chart history');
}

await closePool();
