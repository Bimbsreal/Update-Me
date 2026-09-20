/**
 * Fuel module tests — builds on Generic Report Engine.
 * Run: node --test tests/fuel.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { fuelService } from '../src/services/fuelService.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { createFuelReportSchema } from '../src/validators/fuel.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Fuel Tester', email, 'test-hash-not-for-login']
  );
  return created.rows[0].id;
}

async function sampleLocation() {
  const result = await getPool().query(
    `SELECT id, latitude, longitude FROM locations
     WHERE type = 'area' AND latitude IS NOT NULL
     ORDER BY name LIMIT 1`
  );
  assert.ok(result.rows[0], 'Need seeded area location');
  return result.rows[0];
}

test('creates station and prevents duplicates', async () => {
  const userId = await ensureUser('fuel.station@example.com');
  const loc = await sampleLocation();
  const name = `Test Station ${Date.now()}`;

  const station = await fuelService.createStation(userId, {
    name,
    brand: 'TestBrand',
    locationId: loc.id,
    latitude: loc.latitude,
    longitude: loc.longitude,
  });

  assert.ok(station.id);
  assert.equal(station.name, name);
  assert.equal(station.brand, 'TestBrand');
  assert.ok(station.map.ready);

  await assert.rejects(
    () =>
      fuelService.createStation(userId, {
        name,
        locationId: loc.id,
      }),
    (err) => err instanceof AppError && err.code === 'STATION_DUPLICATE'
  );
});

test('fuel report validation rejects invalid type/price/availability', () => {
  const badType = createFuelReportSchema.safeParse({
    stationId: '00000000-0000-4000-8000-000000000001',
    fuelType: 'kerosene',
    availability: 'available',
    priceAmount: 900,
  });
  assert.equal(badType.success, false);

  const badPrice = createFuelReportSchema.safeParse({
    stationId: '00000000-0000-4000-8000-000000000001',
    fuelType: 'pms',
    availability: 'available',
    priceAmount: -10,
  });
  assert.equal(badPrice.success, false);

  const missingPrice = createFuelReportSchema.safeParse({
    stationId: '00000000-0000-4000-8000-000000000001',
    fuelType: 'pms',
    availability: 'available',
  });
  assert.equal(missingPrice.success, false);

  const badAvailability = createFuelReportSchema.safeParse({
    stationId: '00000000-0000-4000-8000-000000000001',
    fuelType: 'pms',
    availability: 'maybe',
    priceAmount: 900,
  });
  assert.equal(badAvailability.success, false);
});

test('creates community fuel report with freshness and confirm/correct', async () => {
  const authorId = await ensureUser('fuel.author@example.com');
  const otherId = await ensureUser('fuel.other@example.com');
  const loc = await sampleLocation();

  const station = await fuelService.createStation(authorId, {
    name: `Community Fuel ${Date.now()}`,
    locationId: loc.id,
    latitude: Number(loc.latitude),
    longitude: Number(loc.longitude),
  });

  const fuel = await fuelService.createReport(authorId, {
    stationId: station.id,
    locationId: loc.id,
    fuelType: 'pms',
    availability: 'available',
    priceAmount: 945.5,
    queueCondition: 'short',
    notes: 'Verification fuel report — not live station data.',
  });

  assert.ok(fuel.id);
  assert.ok(fuel.reportId);
  assert.equal(fuel.fuelType, 'pms');
  assert.equal(fuel.availability, 'available');
  assert.equal(fuel.price.amount, 945.5);
  assert.equal(fuel.price.currency, 'NGN');
  assert.equal(fuel.report.sourceType, 'community');
  assert.ok(fuel.report.trustLabels.includes('Community Report'));
  assert.ok(!fuel.report.trustLabels.includes('Official'));
  assert.ok(fuel.report.freshness);
  assert.ok(fuel.report.expiresAt);

  const listed = await fuelService.listReports({
    stationId: station.id,
    freshness: 'any',
    page: 1,
    limit: 10,
  });
  assert.ok(listed.items.some((item) => item.id === fuel.id));

  const detail = await fuelService.getStation(station.id);
  assert.equal(detail.station.id, station.id);
  assert.ok(Array.isArray(detail.officialUpdates));
  assert.ok(detail.recentReports.some((r) => r.id === fuel.id));

  const confirmed = await fuelService.confirm(otherId, fuel.id, { type: 'still_accurate' });
  assert.ok(confirmed.report.trustLabels.includes('Community Confirmed'));
  assert.ok(confirmed.report.confirmation.stillAccurate >= 1);

  await assert.rejects(
    () => fuelService.confirm(otherId, fuel.id, { type: 'still_accurate' }),
    /already|confirm|duplicate/i
  );

  const corrected = await fuelService.correct(otherId, fuel.id, {
    type: 'no_longer_accurate',
    note: 'Price changed when I checked.',
  });
  assert.ok(corrected.report.confirmation.noLongerAccurate >= 1);

  if (loc.latitude != null) {
    const nearby = await fuelService.nearbyStations({
      lat: Number(loc.latitude),
      lng: Number(loc.longitude),
      radiusKm: 50,
      freshness: 'any',
      limit: 20,
    });
    assert.ok(nearby.some((s) => s.id === station.id));
  }
});

test('create report with newStation inline', async () => {
  const userId = await ensureUser('fuel.newstation@example.com');
  const loc = await sampleLocation();
  const fuel = await fuelService.createReport(userId, {
    locationId: loc.id,
    newStation: {
      name: `Inline Station ${Date.now()}`,
      brand: 'Oando',
      locationId: loc.id,
    },
    fuelType: 'ago',
    availability: 'limited',
    priceAmount: 1200,
    queueCondition: 'moderate',
  });
  assert.equal(fuel.fuelType, 'ago');
  assert.equal(fuel.availability, 'limited');
  assert.ok(fuel.stationId);
});

test.after(async () => {
  await closePool();
});
