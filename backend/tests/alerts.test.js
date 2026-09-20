/**
 * Local Safety & Road Alerts module tests.
 * Run: node --test tests/alerts.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { alertsService } from '../src/services/alertsService.js';
import { createAlertSchema } from '../src/validators/alerts.js';
import { AppError } from '../src/middleware/errorHandler.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Alerts Tester', email, 'test-hash-not-for-login']
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

test('taxonomy includes initial alert categories and severities', () => {
  const tax = alertsService.taxonomy();
  assert.ok(tax.categories.some((c) => c.code === 'flooding'));
  assert.ok(tax.categories.some((c) => c.code === 'road_blockage'));
  assert.ok(tax.severities.some((s) => s.code === 'critical'));
  assert.ok(!tax.categories.some((c) => /sport|politic|entertain/i.test(c.code)));
});

test('alert validation rejects invalid category, severity, and future observation', () => {
  assert.throws(() =>
    createAlertSchema.parse({
      locationId: '00000000-0000-4000-8000-000000000001',
      alertCategory: 'sports',
      severity: 'caution',
      whatHappened: 'Something happened',
    })
  );
  assert.throws(() =>
    createAlertSchema.parse({
      locationId: '00000000-0000-4000-8000-000000000001',
      alertCategory: 'flooding',
      severity: 'extreme',
      whatHappened: 'Flooding on the road',
    })
  );
  assert.throws(() =>
    createAlertSchema.parse({
      locationId: '00000000-0000-4000-8000-000000000001',
      alertCategory: 'flooding',
      severity: 'caution',
      whatHappened: 'Flooding on the road',
      observedAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
  );
});

test('creates community alert with unverified trust and location association', async () => {
  const authorId = await ensureUser('alerts.author@example.com');
  const loc = await sampleLocationId();

  const alert = await alertsService.create(authorId, {
    locationId: loc.id,
    alertCategory: 'road_blockage',
    severity: 'urgent',
    whatHappened: 'Road blocked near the junction due to fallen container.',
    roadName: 'Test Safety Expressway',
    affectedArea: 'Junction approach',
  });

  assert.ok(alert.id);
  assert.ok(alert.reportId);
  assert.equal(alert.alertCategory, 'road_blockage');
  assert.equal(alert.severity, 'urgent');
  assert.equal(alert.report.sourceType, 'community');
  assert.ok(alert.report.trustLabels.includes('Community Report — Unverified'));
  assert.ok(!alert.report.trustLabels.includes('Official'));
  assert.ok(!alert.report.trustLabels.includes('Community Confirmed'));
  assert.equal(alert.location.id, loc.id);
  assert.equal(alert.requiresReview, true);
  // Privacy: no public reporter display name
  assert.ok(alert.report.author?.id);
  assert.equal(alert.report.author.displayName, undefined);
});

test('list, nearby, confirm, correct, flag, duplicates, permissions', async (t) => {
  const authorId = await ensureUser('alerts.author2@example.com');
  const otherId = await ensureUser('alerts.other@example.com');
  const loc = await sampleLocationId();

  const alert = await alertsService.create(authorId, {
    locationId: loc.id,
    alertCategory: 'flooding',
    severity: 'caution',
    whatHappened: 'Standing water on the access road after heavy rain.',
    roadName: 'Maryland Link Road',
    affectedArea: 'Under the bridge',
  });

  // Second report same category/location for duplicate foundation
  const sibling = await alertsService.create(otherId, {
    locationId: loc.id,
    alertCategory: 'flooding',
    severity: 'caution',
    whatHappened: 'Flooding still covering part of the access road.',
    roadName: 'Maryland Link Road',
  });

  await t.test('retrieves and filters alerts', async () => {
    const listed = await alertsService.list({
      page: 1,
      limit: 20,
      freshness: 'any',
      locationId: loc.id,
      category: 'flooding',
      severity: 'caution',
    });
    assert.ok(listed.items.some((item) => item.id === alert.id));

    const one = await alertsService.getById(alert.id);
    assert.equal(one.id, alert.id);
    assert.ok(one.relatedReportCount >= 1);
    assert.ok(one.relatedReports.some((r) => r.id === sibling.id));
  });

  await t.test('nearby alerts foundation', async () => {
    const results = await alertsService.nearby({
      lat: Number(loc.latitude),
      lng: Number(loc.longitude),
      radiusKm: 25,
      freshness: 'any',
      limit: 20,
    });
    assert.ok(Array.isArray(results));
    assert.ok(results.some((item) => item.id === alert.id));
  });

  await t.test('owner cannot confirm own alert', async () => {
    await assert.rejects(
      () => alertsService.confirm(authorId, alert.id, { type: 'still_happening' }),
      (err) => err instanceof AppError && err.code === 'OWN_REPORT'
    );
  });

  await t.test('other user can confirm once', async () => {
    const confirmed = await alertsService.confirm(otherId, alert.id, {
      type: 'still_happening',
    });
    assert.ok(confirmed.report.trustLabels.includes('Community Confirmed'));
    assert.ok(!confirmed.report.trustLabels.includes('Community Report — Unverified'));
    assert.ok(confirmed.report.confirmation.stillAccurate >= 1);

    await assert.rejects(
      () => alertsService.confirm(otherId, alert.id, { type: 'still_happening' }),
      /already|DUPLICATE/i
    );
  });

  await t.test('correction path', async () => {
    const third = await ensureUser('alerts.third@example.com');
    const corrected = await alertsService.correct(third, sibling.id, {
      type: 'no_longer_happening',
      note: 'Water has receded at this section.',
    });
    assert.ok(corrected.report.confirmation.noLongerAccurate >= 1);
  });

  await t.test('flagging queues moderation without deleting', async () => {
    const flagged = await alertsService.flag(otherId, sibling.id, {
      reason: 'inaccurate',
      details: 'Does not match conditions on the ground.',
    });
    assert.ok(['flagged', 'under_review', 'active', 'confirmed', 'stale'].includes(flagged.report.status));
    assert.notEqual(flagged.report.status, 'removed');
    const again = await alertsService.getById(sibling.id, otherId);
    assert.ok(again);
  });

  await t.test('community cannot claim official source', async () => {
    const listed = await alertsService.list({
      page: 1,
      limit: 5,
      freshness: 'any',
      locationId: loc.id,
      sourceType: 'community',
    });
    for (const item of listed.items) {
      assert.notEqual(item.report.sourceType, 'official');
      assert.ok(!item.report.trustLabels.includes('Official'));
    }
  });
});

test('cleanup pool', async () => {
  await closePool();
});
