import { fuelService } from '../src/services/fuelService.js';
import { getPool, closePool } from '../src/db/pool.js';

const pool = getPool();
let user = await pool.query(`SELECT id FROM users WHERE email = $1`, ['fuel.visual@example.com']);
let userId = user.rows[0]?.id;
if (!userId) {
  user = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Fuel Visual', 'fuel.visual@example.com', 'x']
  );
  userId = user.rows[0].id;
}

const st = await pool.query(
  `SELECT id, location_id FROM fuel_stations WHERE name = $1 LIMIT 1`,
  ['Admiralty Way Filling Station']
);
const station = st.rows[0];
if (!station) {
  console.log('no station');
  await closePool();
  process.exit(1);
}

const fuel = await fuelService.createReport(userId, {
  stationId: station.id,
  locationId: station.location_id,
  fuelType: 'pms',
  availability: 'available',
  priceAmount: 945,
  queueCondition: 'short',
  notes: 'Local visual verification community report.',
});
console.log(JSON.stringify({ id: fuel.id, stationId: fuel.stationId, price: fuel.price }));
await closePool();
