/**
 * Unified Explore API tests.
 * Run: node --test tests/explore.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { exploreService } from '../src/services/exploreService.js';
import { exploreQuerySchema, exploreSearchQuerySchema } from '../src/validators/explore.js';
import { AppError } from '../src/middleware/errorHandler.js';

test('explore query validation', () => {
  const ok = exploreQuerySchema.parse({
    lat: 6.45,
    lng: 3.4,
    radiusKm: 10,
    category: 'traffic',
    freshness: 'recent',
  });
  assert.equal(ok.category, 'traffic');
  assert.throws(() => exploreQuerySchema.parse({ lat: 6.45 }));
  assert.throws(() => exploreSearchQuerySchema.parse({ q: 'a' }));
});

test('explore taxonomy is stable', () => {
  const tax = exploreService.getTaxonomy();
  assert.ok(tax.categories.some((c) => c.id === 'traffic'));
  assert.ok(tax.statusByCategory.fuel.length >= 3);
  assert.ok(tax.freshness.some((f) => f.id === '30m'));
});

test('explore nearby returns structured items + geojson', async () => {
  const loc = await getPool().query(
    `SELECT id, latitude, longitude FROM locations
     WHERE type = 'area' AND latitude IS NOT NULL ORDER BY name LIMIT 1`
  );
  assert.ok(loc.rows[0], 'need seeded area');

  const data = await exploreService.explore({
    lat: Number(loc.rows[0].latitude),
    lng: Number(loc.rows[0].longitude),
    radiusKm: 25,
    category: 'all',
    freshness: 'any',
    page: 1,
    limit: 40,
  });

  assert.equal(typeof data.center.lat, 'number');
  assert.equal(typeof data.center.lng, 'number');
  assert.ok(Array.isArray(data.items));
  assert.equal(data.geojson.type, 'FeatureCollection');
  assert.ok(Array.isArray(data.geojson.features));

  for (const item of data.items) {
    assert.ok(item.id);
    assert.ok(item.category);
    assert.ok(item.title);
    assert.ok(item.detailPath);
    // No private user GPS fields
    assert.equal(item.privateLat, undefined);
    assert.equal(item.userCoordinates, undefined);
  }
});

test('category and freshness filtering', async () => {
  const loc = await getPool().query(
    `SELECT latitude, longitude FROM locations
     WHERE type = 'area' AND latitude IS NOT NULL LIMIT 1`
  );
  const base = {
    lat: Number(loc.rows[0].latitude),
    lng: Number(loc.rows[0].longitude),
    radiusKm: 30,
    page: 1,
    limit: 20,
  };

  const traffic = await exploreService.explore({ ...base, category: 'traffic', freshness: 'any' });
  assert.ok(traffic.items.every((i) => i.category === 'traffic' || i.markerKind === 'traffic'));

  const recent = await exploreService.explore({ ...base, category: 'all', freshness: '30m' });
  assert.ok(Array.isArray(recent.items));
});

test('bbox too large is rejected', async () => {
  await assert.rejects(
    () =>
      exploreService.explore({
        bbox: '2,4,10,12',
        category: 'all',
        freshness: 'any',
        page: 1,
        limit: 10,
      }),
    (err) => err instanceof AppError && err.code === 'BBOX_TOO_LARGE'
  );
});

test('spatial search suggestions do not leak private data', async () => {
  const result = await exploreService.search({ q: 'Lekki', limit: 12 });
  assert.equal(result.q, 'Lekki');
  assert.ok(Array.isArray(result.suggestions));
  for (const s of result.suggestions) {
    assert.ok(s.title);
    assert.ok(s.href);
    assert.equal(s.password, undefined);
    assert.equal(s.email, undefined);
  }
});

test('pagination returns limited page size', async () => {
  const loc = await getPool().query(
    `SELECT latitude, longitude FROM locations
     WHERE type = 'area' AND latitude IS NOT NULL LIMIT 1`
  );
  const data = await exploreService.explore({
    lat: Number(loc.rows[0].latitude),
    lng: Number(loc.rows[0].longitude),
    radiusKm: 40,
    category: 'all',
    freshness: 'any',
    page: 1,
    limit: 5,
  });
  assert.ok(data.items.length <= 5);
  assert.equal(data.limit, 5);
});

test('empty area still returns success shape', async () => {
  // Middle of ocean — expect empty or near-empty
  const data = await exploreService.explore({
    lat: 0.1,
    lng: 0.1,
    radiusKm: 1,
    category: 'traffic',
    freshness: '30m',
    page: 1,
    limit: 10,
  });
  assert.equal(data.success ?? true, true);
  assert.ok(Array.isArray(data.items));
  assert.equal(data.geojson.features.length, data.items.filter((i) => i.coordinates).length);
});

test.after(async () => {
  await closePool();
});
