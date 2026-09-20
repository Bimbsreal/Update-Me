/**
 * Generic Report Engine integration tests (node:test).
 * Run: npm test  (requires local DB + migrated schema)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { reportService } from '../src/services/reportService.js';
import { AppError } from '../src/middleware/errorHandler.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Report Tester', email, 'test-hash-not-for-login']
  );
  return created.rows[0].id;
}

async function sampleLocationId() {
  const result = await getPool().query(
    `SELECT id FROM locations WHERE type = 'area' AND latitude IS NOT NULL ORDER BY name LIMIT 1`
  );
  assert.ok(result.rows[0], 'Need at least one seeded area location');
  return result.rows[0].id;
}

test('report categories are available', async () => {
  const categories = await reportService.listCategories();
  assert.ok(categories.length >= 8);
  assert.ok(categories.some((c) => c.code === 'traffic'));
  assert.ok(categories.every((c) => c.freshness?.defaultTtlMinutes > 0));
});

test('unauthenticated-style create requires user id (service ownership)', async () => {
  const locationId = await sampleLocationId();
  await assert.rejects(
    () =>
      reportService.create(null, {
        category: 'traffic',
        title: 'Test jam',
        description: 'Slow moving traffic near the junction',
        locationId,
      }),
    /null value|violates|Failed|error|not/i
  );
});

test('create, list, get, history, confirm, duplicate confirm, flag, ownership', async (t) => {
  const authorId = await ensureUser('report.author@example.com');
  const otherId = await ensureUser('report.other@example.com');
  const locationId = await sampleLocationId();

  let report;
  await t.test('creates community report as active', async () => {
    report = await reportService.create(authorId, {
      category: 'other',
      title: 'Power outage notice test',
      description: 'Temporary utility notice for engine verification only.',
      locationId,
    });
    assert.equal(report.sourceType, 'community');
    assert.equal(report.status, 'active');
    assert.ok(report.trustLabels.includes('Community Report'));
    assert.ok(!report.trustLabels.includes('Official'));
    assert.ok(report.expiresAt);
  });

  await t.test('rejects invalid category payload via missing category', async () => {
    await assert.rejects(
      () =>
        reportService.create(authorId, {
          category: 'not-a-real-category',
          title: 'Bad',
          description: 'Bad description here',
          locationId,
        }),
      (err) => err instanceof AppError && err.code === 'INVALID_CATEGORY'
    );
  });

  await t.test('lists and gets report', async () => {
    const listed = await reportService.list({ page: 1, limit: 20, freshness: 'any' });
    assert.ok(listed.items.some((item) => item.id === report.id));
    const one = await reportService.getById(report.id);
    assert.equal(one.id, report.id);
  });

  await t.test('history records creation', async () => {
    const history = await reportService.history(report.id);
    assert.ok(history.events.some((e) => e.eventType === 'created'));
  });

  await t.test('owner cannot confirm own report', async () => {
    await assert.rejects(
      () => reportService.confirm(authorId, report.id, { type: 'still_accurate' }),
      (err) => err instanceof AppError && err.code === 'OWN_REPORT'
    );
  });

  await t.test('other user can confirm once', async () => {
    const confirmed = await reportService.confirm(otherId, report.id, {
      type: 'still_accurate',
    });
    assert.equal(confirmed.status, 'confirmed');
    assert.ok(confirmed.confirmation.stillAccurate >= 1);

    await assert.rejects(
      () => reportService.confirm(otherId, report.id, { type: 'still_accurate' }),
      (err) => err instanceof AppError && err.code === 'DUPLICATE_CONFIRMATION'
    );
  });

  await t.test('non-owner cannot update report', async () => {
    await assert.rejects(
      () =>
        reportService.update(otherId, report.id, {
          title: 'Hijacked title attempt',
        }),
      (err) => err instanceof AppError && err.code === 'FORBIDDEN'
    );
  });

  await t.test('owner can update own report', async () => {
    const updated = await reportService.update(authorId, report.id, {
      description: 'Updated utility notice details for verification.',
    });
    assert.match(updated.description, /Updated utility/);
    const history = await reportService.history(report.id);
    assert.ok(history.events.some((e) => e.eventType === 'updated'));
  });

  await t.test('flagging queues moderation hook without deleting', async () => {
    // need a third user because other already may flag later
    const flaggerId = await ensureUser('report.flagger@example.com');
    const result = await reportService.flag(flaggerId, report.id, {
      reason: 'misleading',
      details: 'Test flag',
    });
    assert.equal(result.report.status, 'flagged');
    assert.equal(result.moderationHook.queued, true);
    const stillThere = await reportService.getById(report.id, authorId);
    assert.equal(stillThere.id, report.id);
  });

  await t.test('nearby foundation returns array', async () => {
    const loc = await getPool().query(`SELECT latitude, longitude FROM locations WHERE id = $1`, [
      locationId,
    ]);
    const { latitude: lat, longitude: lng } = loc.rows[0];
    const results = await reportService.nearby({
      lat: Number(lat),
      lng: Number(lng),
      radiusKm: 25,
      limit: 10,
    });
    assert.ok(Array.isArray(results));
  });
});

test('cleanup pool', async () => {
  await closePool();
});
