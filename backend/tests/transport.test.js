/**
 * Transport module tests — builds on Generic Report Engine.
 * Run: node --test tests/transport.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { transportService } from '../src/services/transportService.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { createTransportFareSchema } from '../src/validators/transport.js';
import { transportRepository } from '../src/repositories/transportRepository.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Transport Tester', email, 'test-hash-not-for-login']
  );
  return created.rows[0].id;
}

async function unusedCorridorPair() {
  const result = await getPool().query(
    `SELECT a.id AS origin_id, b.id AS destination_id, a.name AS origin_name, b.name AS destination_name
     FROM locations a
     JOIN locations b ON b.type = 'area' AND a.id <> b.id
     WHERE a.type = 'area'
       AND NOT EXISTS (
         SELECT 1 FROM transport_routes tr
         WHERE tr.origin_location_id = a.id
           AND tr.destination_location_id = b.id
           AND tr.is_active = TRUE
       )
     ORDER BY a.name, b.name
     LIMIT 1`
  );
  assert.ok(result.rows[0], 'Need an unused origin/destination pair');
  return result.rows[0];
}

test('creates route and prevents duplicates', async () => {
  const userId = await ensureUser('transport.route@example.com');
  const pair = await unusedCorridorPair();
  const name = `Test Corridor ${Date.now()}`;

  const route = await transportService.createRoute(userId, {
    name,
    originLocationId: pair.origin_id,
    destinationLocationId: pair.destination_id,
    primaryMode: 'bus',
    stops: [{ stopOrder: 1, label: 'Main boarding point' }],
  });

  assert.ok(route.id);
  assert.equal(route.origin.id, pair.origin_id);
  assert.equal(route.destination.id, pair.destination_id);
  assert.ok(route.stops.length >= 1);

  await assert.rejects(
    () =>
      transportService.createRoute(userId, {
        originLocationId: pair.origin_id,
        destinationLocationId: pair.destination_id,
        primaryMode: 'danfo',
      }),
    (err) => err instanceof AppError && err.code === 'ROUTE_DUPLICATE'
  );
});

test('fare validation rejects invalid mode/amount', () => {
  const badMode = createTransportFareSchema.safeParse({
    routeId: '00000000-0000-4000-8000-000000000001',
    transportMode: 'helicopter',
    fareAmount: 500,
  });
  assert.equal(badMode.success, false);

  const badFare = createTransportFareSchema.safeParse({
    routeId: '00000000-0000-4000-8000-000000000001',
    transportMode: 'bus',
    fareAmount: -50,
  });
  assert.equal(badFare.success, false);

  const zeroFare = createTransportFareSchema.safeParse({
    routeId: '00000000-0000-4000-8000-000000000001',
    transportMode: 'bus',
    fareAmount: 0,
  });
  assert.equal(zeroFare.success, false);
});

test('creates fare report with freshness, range, confirm/correct, search', async () => {
  const authorId = await ensureUser(`transport.author.${Date.now()}@example.com`);
  const otherId = await ensureUser(`transport.other.${Date.now()}@example.com`);
  const pair = await unusedCorridorPair();

  const route = await transportService.createRoute(authorId, {
    name: `Community Route ${Date.now()}`,
    originLocationId: pair.origin_id,
    destinationLocationId: pair.destination_id,
    primaryMode: 'bus',
  });

  const fare = await transportService.createFare(authorId, {
    routeId: route.id,
    transportMode: 'bus',
    fareAmount: 800,
    boardingPointLabel: 'Park gate',
    notes: 'Verification fare report — not live market data.',
  });

  assert.ok(fare.id);
  assert.ok(fare.reportId);
  assert.equal(fare.transportMode, 'bus');
  assert.equal(fare.fare.amount, 800);
  assert.equal(fare.fare.currency, 'NGN');
  assert.equal(fare.report.sourceType, 'community');
  assert.ok(fare.report.trustLabels.includes('Community Report'));
  assert.ok(!fare.report.trustLabels.includes('Official'));
  assert.ok(fare.report.freshness);
  assert.ok(fare.report.expiresAt);

  const second = await transportService.createFare(otherId, {
    routeId: route.id,
    transportMode: 'bus',
    fareAmount: 1000,
    boardingPointLabel: 'Roundabout',
  });
  assert.equal(second.fare.amount, 1000);

  const ranges = await transportRepository.fareRangeForRoute(route.id, {
    mode: 'bus',
    freshness: 'any',
  });
  assert.ok(ranges.length >= 1);
  assert.equal(ranges[0].fareRange.min, 800);
  assert.equal(ranges[0].fareRange.max, 1000);
  assert.equal(ranges[0].fareRange.isRange, true);
  assert.ok(ranges[0].reportCount >= 2);

  const listed = await transportService.listFares({
    routeId: route.id,
    freshness: 'any',
    page: 1,
    limit: 10,
  });
  assert.ok(listed.items.some((item) => item.id === fare.id));

  const detail = await transportService.getRoute(route.id);
  assert.equal(detail.route.id, route.id);
  assert.ok(Array.isArray(detail.officialUpdates));
  assert.ok(detail.recentFares.some((r) => r.id === fare.id));
  assert.ok(Array.isArray(detail.fareRanges));
  assert.ok(Array.isArray(detail.relatedTraffic));

  const searched = await transportService.search({
    originLocationId: pair.origin_id,
    destinationLocationId: pair.destination_id,
    freshness: 'any',
    limit: 10,
  });
  assert.ok(searched.some((r) => r.id === route.id));

  const confirmed = await transportService.confirm(otherId, fare.id, {
    type: 'still_accurate',
  });
  assert.ok(confirmed.report.trustLabels.includes('Community Confirmed'));
  assert.ok(confirmed.report.confirmation.stillAccurate >= 1);

  await assert.rejects(
    () => transportService.confirm(otherId, fare.id, { type: 'still_accurate' }),
    /already|confirm|duplicate/i
  );

  const corrected = await transportService.correct(otherId, fare.id, {
    type: 'no_longer_accurate',
    note: 'Fare changed when I boarded.',
  });
  assert.ok(corrected.report.confirmation.noLongerAccurate >= 1);

  await assert.rejects(
    () =>
      transportService.createFare(authorId, {
        routeId: route.id,
        transportMode: 'bus',
        fareAmount: 850,
      }),
    (err) => err instanceof AppError && err.code === 'FARE_DUPLICATE'
  );
});

test('create fare with newRoute inline', async () => {
  const userId = await ensureUser(`transport.newroute.${Date.now()}@example.com`);
  const pair = await unusedCorridorPair();
  const fare = await transportService.createFare(userId, {
    newRoute: {
      originLocationId: pair.origin_id,
      destinationLocationId: pair.destination_id,
      primaryMode: 'keke',
    },
    transportMode: 'keke',
    fareAmount: 400,
  });
  assert.equal(fare.transportMode, 'keke');
  assert.ok(fare.routeId);
});

test.after(async () => {
  await closePool();
});
