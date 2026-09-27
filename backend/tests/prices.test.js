/**
 * Commodity prices module tests.
 * Run: node --test tests/prices.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { pricesService } from '../src/services/pricesService.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { createPriceReportSchema } from '../src/validators/prices.js';
import { pricesRepository } from '../src/repositories/pricesRepository.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Prices Tester', email, 'test-hash-not-for-login']
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

test('commodity catalogue includes initial everyday items', async () => {
  const list = await pricesService.listCommodities();
  assert.ok(list.length >= 11);
  const rice = list.find((c) => c.code === 'rice');
  assert.ok(rice);
  assert.ok(rice.variants.some((v) => v.code === '5kg'));
  const eggs = list.find((c) => c.code === 'eggs');
  assert.ok(eggs.variants.some((v) => v.code === 'crate'));
});

test('price validation rejects invalid amount and missing commodity', () => {
  const bad = createPriceReportSchema.safeParse({
    commodityCode: 'rice',
    variantCode: '5kg',
    locationId: '00000000-0000-4000-8000-000000000001',
    priceAmount: -10,
  });
  assert.equal(bad.success, false);

  const missing = createPriceReportSchema.safeParse({
    locationId: '00000000-0000-4000-8000-000000000001',
    priceAmount: 100,
  });
  assert.equal(missing.success, false);

  const badVariant = createPriceReportSchema.safeParse({
    commodityCode: 'rice',
    locationId: '00000000-0000-4000-8000-000000000001',
    priceAmount: 100,
  });
  assert.equal(badVariant.success, false);
});

test('creates price report with range, history, confirm/correct, nearby', async () => {
  const authorId = await ensureUser(`prices.author.${Date.now()}@example.com`);
  const otherId = await ensureUser(`prices.other.${Date.now()}@example.com`);
  const loc = await sampleLocation();

  const price = await pricesService.createReport(authorId, {
    commodityCode: 'rice',
    variantCode: '5kg',
    locationId: loc.id,
    priceAmount: 7500,
    placeLabel: 'Test Market Stall',
    placeType: 'market',
    notes: 'Verification price report — not live market data.',
  });

  assert.ok(price.id);
  assert.equal(price.commodity.code, 'rice');
  assert.equal(price.variant.code, '5kg');
  assert.equal(price.price.amount, 7500);
  assert.equal(price.price.currency, 'NGN');
  assert.equal(price.report.sourceType, 'community');
  assert.ok(price.report.trustLabels.includes('Community report'));
  assert.ok(!price.report.trustLabels.some((l) => /^Official$/i.test(l)));
  assert.ok(price.report.freshness);
  assert.equal(price.source?.type, 'community');
  assert.equal(price.verification, 'unverified');
  assert.ok(price.observedAt || price.submittedAt);

  const second = await pricesService.createReport(otherId, {
    commodityCode: 'rice',
    variantCode: '5kg',
    locationId: loc.id,
    priceAmount: 8200,
    placeLabel: 'Second stall',
  });
  assert.equal(second.price.amount, 8200);

  const listed = await pricesService.list({
    commodity: 'rice',
    variant: '5kg',
    locationId: loc.id,
    freshness: 'any',
    group: 'variant',
    page: 1,
    limit: 10,
  });
  assert.ok(listed.items.length >= 1);
  const summary = listed.items[0];
  assert.equal(summary.priceRange.min, 7500);
  assert.equal(summary.priceRange.max, 8200);
  assert.equal(summary.priceRange.isRange, true);

  const detail = await pricesService.getDetail('rice', '5kg', {
    locationId: loc.id,
    period: '30d',
  });
  assert.equal(detail.commodity.code, 'rice');
  assert.equal(detail.variant.code, '5kg');
  assert.ok(detail.recentReports.some((r) => r.id === price.id));
  assert.ok(detail.history);
  assert.equal(typeof detail.history.chartAvailable, 'boolean');

  const confirmed = await pricesService.confirm(otherId, price.id, {
    type: 'still_accurate',
  });
  assert.ok(confirmed.report.trustLabels.includes('Verified'));
  assert.equal(confirmed.verification, 'verified');
  assert.equal(confirmed.source?.type, 'community');

  await assert.rejects(
    () => pricesService.confirm(otherId, price.id, { type: 'still_accurate' }),
    /already|confirm|duplicate/i
  );

  await assert.rejects(
    () =>
      pricesService.createReport(authorId, {
        commodityCode: 'rice',
        variantCode: '5kg',
        locationId: loc.id,
        priceAmount: 7600,
      }),
    (err) => err instanceof AppError && err.code === 'PRICE_DUPLICATE'
  );

  const corrected = await pricesService.correct(otherId, price.id, {
    type: 'no_longer_accurate',
    note: 'Price changed at the stall.',
  });
  assert.ok(corrected.report.confirmation.noLongerAccurate >= 1);

  // Seed an older observation for history points (after duplicate checks)
  await getPool().query(
    `UPDATE reports SET occurred_at = NOW() - INTERVAL '3 days', created_at = NOW() - INTERVAL '3 days'
     WHERE id = $1`,
    [price.reportId]
  );
  const history = await pricesRepository.history({
    commodityId: detail.commodity.id,
    variantId: detail.variant.id,
    locationId: loc.id,
    period: '7d',
  });
  assert.ok(history.points.length >= 1);

  if (loc.latitude != null) {
    const nearby = await pricesService.nearby({
      lat: Number(loc.latitude),
      lng: Number(loc.longitude),
      radiusKm: 50,
      commodity: 'rice',
      freshness: 'any',
      limit: 20,
    });
    assert.ok(nearby.some((item) => item.commodity.code === 'rice'));
  }
});

test('invalid commodity or variant rejected', async () => {
  const userId = await ensureUser(`prices.bad.${Date.now()}@example.com`);
  const loc = await sampleLocation();
  await assert.rejects(
    () =>
      pricesService.createReport(userId, {
        commodityCode: 'not-a-real-commodity',
        variantCode: '1kg',
        locationId: loc.id,
        priceAmount: 100,
      }),
    (err) => err instanceof AppError && err.code === 'COMMODITY_NOT_FOUND'
  );
});

test('prices summary exposes observed range window and asOf', async () => {
  const summary = await pricesService.summary({ hours: 24, commodity: 'rice' });
  assert.equal(typeof summary.total, 'number');
  assert.ok(summary.asOf);
  if (summary.observedRange) {
    assert.ok(summary.observedRange.min != null);
    assert.ok(summary.observedRange.max != null);
    assert.equal(summary.observedRange.windowHours, 24);
    assert.match(summary.observedRange.note, /not a claim/i);
  }
});

test('price detail includes asOf and history periods include 24h', async () => {
  const detail = await pricesService.getDetail('rice', '5kg', { period: '24h', freshness: 'any' });
  assert.ok(detail.commodity);
  assert.ok(detail.variant);
  assert.ok(detail.asOf);
  assert.equal(detail.history?.period, '24h');
});

test.after(async () => {
  await closePool();
});
