/**
 * Traffic module tests — builds on Generic Report Engine.
 * Run: node --test tests/traffic.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { trafficService } from '../src/services/trafficService.js';
import { AppError } from '../src/middleware/errorHandler.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Traffic Tester', email, 'test-hash-not-for-login']
  );
  return created.rows[0].id;
}

async function sampleLocationId() {
  const result = await getPool().query(
    `SELECT id, latitude, longitude FROM locations
     WHERE type = 'area' AND latitude IS NOT NULL
     ORDER BY name LIMIT 1`
  );
  assert.ok(result.rows[0], 'Need seeded area location');
  return result.rows[0];
}

test('creates traffic report via generic engine', async () => {
  const authorId = await ensureUser('traffic.author@example.com');
  const loc = await sampleLocationId();

  const traffic = await trafficService.create(authorId, {
    locationId: loc.id,
    severity: 'heavy',
    cause: 'accident',
    roadName: 'Test Expressway',
    fromLabel: 'Area A',
    towardLabel: 'Area B',
    notes: 'Verification traffic report — not live road data.',
  });

  assert.ok(traffic.id);
  assert.ok(traffic.reportId);
  assert.equal(traffic.severity, 'heavy');
  assert.equal(traffic.cause, 'accident');
  assert.equal(traffic.report.sourceType, 'community');
  assert.ok(traffic.report.trustLabels.includes('Community Report'));
  assert.ok(!traffic.report.trustLabels.includes('Official'));
  assert.match(traffic.direction.label, /Area A/);
  assert.ok(traffic.report.expiresAt);
});

test('rejects invalid severity and cause at service boundary via create validation upstream', async () => {
  // Service assumes validated enums; invalid DB cast should fail if somehow passed.
  const authorId = await ensureUser('traffic.author@example.com');
  const loc = await sampleLocationId();
  await assert.rejects(
    () =>
      trafficService.create(authorId, {
        locationId: loc.id,
        severity: 'not-a-severity',
        roadName: 'Somewhere Road',
      }),
    /invalid input value|traffic_severity|error/i
  );
});

test('list, get, nearby, summary, confirm, duplicate confirm, correct', async (t) => {
  const authorId = await ensureUser('traffic.author2@example.com');
  const otherId = await ensureUser('traffic.other@example.com');
  const loc = await sampleLocationId();

  const traffic = await trafficService.create(authorId, {
    locationId: loc.id,
    severity: 'moderate',
    roadName: 'Maryland Link Road',
    towardLabel: 'Ikeja',
    notes: 'Moderate traffic for module testing.',
  });

  await t.test('retrieves and filters traffic', async () => {
    const listed = await trafficService.list({
      page: 1,
      limit: 20,
      freshness: 'any',
      locationId: loc.id,
      severity: 'moderate',
    });
    assert.ok(listed.items.some((item) => item.id === traffic.id));

    const one = await trafficService.getById(traffic.id);
    assert.equal(one.id, traffic.id);
    assert.equal(one.location.id, loc.id);
  });

  await t.test('nearby traffic foundation', async () => {
    const results = await trafficService.nearby({
      lat: Number(loc.latitude),
      lng: Number(loc.longitude),
      radiusKm: 25,
      freshness: 'any',
      limit: 20,
    });
    assert.ok(Array.isArray(results));
    assert.ok(results.some((item) => item.id === traffic.id));
  });

  await t.test('summary uses real counts', async () => {
    const summary = await trafficService.summary({ locationId: loc.id });
    assert.ok(summary.total >= 1);
    assert.ok(summary.bySeverity.moderate >= 1);
  });

  await t.test('confirmation through report engine', async () => {
    await assert.rejects(
      () => trafficService.confirm(authorId, traffic.id, { type: 'still_accurate' }),
      (err) => err instanceof AppError && err.code === 'OWN_REPORT'
    );

    const confirmed = await trafficService.confirm(otherId, traffic.id, {
      type: 'still_accurate',
    });
    assert.equal(confirmed.report.status, 'confirmed');
    assert.ok(confirmed.report.confirmation.stillAccurate >= 1);

    await assert.rejects(
      () => trafficService.confirm(otherId, traffic.id, { type: 'still_accurate' }),
      (err) => err instanceof AppError && err.code === 'DUPLICATE_CONFIRMATION'
    );
  });

  await t.test('correction path', async () => {
    const flagger = await ensureUser('traffic.corrector@example.com');
    const corrected = await trafficService.correct(flagger, traffic.id, {
      type: 'no_longer_accurate',
      note: 'Traffic has cleared on this corridor.',
    });
    assert.ok(corrected.report.confirmation.noLongerAccurate >= 1);
  });

  await t.test('history available', async () => {
    const history = await trafficService.history(traffic.id);
    assert.ok(history.events.some((e) => e.eventType === 'created'));
  });
});

test('missing location rejected', async () => {
  const authorId = await ensureUser('traffic.author@example.com');
  await assert.rejects(
    () =>
      trafficService.create(authorId, {
        locationId: '00000000-0000-0000-0000-000000000000',
        severity: 'light',
        roadName: 'Ghost Road',
      }),
    (err) => err instanceof AppError && err.code === 'LOCATION_NOT_FOUND'
  );
});

test('cleanup pool', async () => {
  await closePool();
});
