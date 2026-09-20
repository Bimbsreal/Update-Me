/**
 * Global Search Engine tests.
 * Run: node --test tests/search.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { searchService } from '../src/services/searchService.js';
import {
  globalSearchQuerySchema,
  searchSuggestQuerySchema,
} from '../src/validators/search.js';
import { AppError } from '../src/middleware/errorHandler.js';

test('search query validation', () => {
  const ok = globalSearchQuerySchema.parse({
    q: 'Lekki',
    category: 'places',
    freshness: 'today',
  });
  assert.equal(ok.q, 'Lekki');
  assert.throws(() => globalSearchQuerySchema.parse({ q: '' }));
  assert.throws(() => searchSuggestQuerySchema.parse({ q: 'a' }));
  assert.throws(() => globalSearchQuerySchema.parse({ q: 'x', lat: 6.4 }));
});

test('normalize and category hints', () => {
  assert.equal(searchService.normalizeQuery('  LEKKI–Epe  '), 'lekki-epe');
  const hints = searchService.detectCategoryHints('fuel ikeja');
  assert.ok(hints.includes('fuel'));
  const traffic = searchService.detectCategoryHints('traffic lekki');
  assert.ok(traffic.includes('traffic'));
  const route = searchService.detectCategoryHints('ajah to lekki');
  assert.ok(route.includes('transport'));
});

test('exact and case-insensitive place search', async () => {
  const data = await searchService.search({
    q: 'lekki',
    category: 'places',
    freshness: 'any',
    limit: 20,
  });
  assert.equal(data.empty, false);
  assert.ok(data.items.some((i) => /lekki/i.test(i.title)));
  assert.ok(data.items.every((i) => i.group === 'places' || i.href));
  for (const item of data.items) {
    assert.equal(item.privateLat, undefined);
    assert.equal(item.userCoordinates, undefined);
  }
});

test('partial match and pagination', async () => {
  const page1 = await searchService.search({
    q: 'a',
    category: 'places',
    freshness: 'any',
    page: 1,
    limit: 5,
  });
  // min length enforced by validator in HTTP; service allows short for unit use
  assert.ok(Array.isArray(page1.items));
  const page2 = await searchService.search({
    q: 'lagos',
    category: 'places',
    freshness: 'any',
    page: 1,
    limit: 3,
  });
  assert.ok(page2.pagination.limit === 3);
  assert.ok(page2.pagination.page === 1);
});

test('basic typo tolerance via trigram when available', async () => {
  const data = await searchService.search({
    q: 'Leky',
    category: 'places',
    freshness: 'any',
    limit: 10,
  });
  // May be empty if no similar names; when hits exist they should relate to Lekki-like names
  if (!data.empty) {
    assert.ok(data.items.some((i) => /lekki|leky/i.test(i.title) || i.matchKind === 'trgm'));
  }
});

test('category filtering fuel and prices', async () => {
  const fuel = await searchService.search({
    q: 'fuel',
    category: 'fuel',
    freshness: 'any',
    limit: 15,
  });
  assert.ok(Array.isArray(fuel.items));
  assert.ok(fuel.items.every((i) => i.group === 'fuel'));

  const prices = await searchService.search({
    q: 'rice',
    category: 'prices',
    freshness: 'any',
    limit: 10,
  });
  assert.ok(Array.isArray(prices.items));
  assert.ok(prices.items.every((i) => i.group === 'prices'));
});

test('empty query rejected', async () => {
  await assert.rejects(
    () => searchService.search({ q: '   ' }),
    (err) => err instanceof AppError && err.status === 400
  );
});

test('SQL injection style query does not throw', async () => {
  const data = await searchService.search({
    q: `'; DROP TABLE users; --`,
    freshness: 'any',
    limit: 5,
  });
  assert.ok(data.empty === true || Array.isArray(data.items));
  const pool = getPool();
  const users = await pool.query(`SELECT 1 FROM users LIMIT 1`);
  assert.ok(users.rows.length >= 0);
});

test('private recent searches are user-scoped', async () => {
  const pool = getPool();
  const userA = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ('Search A', $1, 'hash', TRUE) RETURNING id`,
    [`search-a-${Date.now()}@example.com`]
  );
  const userB = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ('Search B', $1, 'hash', TRUE) RETURNING id`,
    [`search-b-${Date.now()}@example.com`]
  );
  const idA = userA.rows[0].id;
  const idB = userB.rows[0].id;

  await searchService.recordRecent(idA, 'Lekki Phase 1');
  await searchService.recordRecent(idB, 'Ikeja');

  const recentA = await searchService.listRecent(idA);
  assert.ok(recentA.items.some((i) => i.query === 'Lekki Phase 1'));
  assert.ok(!recentA.items.some((i) => i.query === 'Ikeja'));

  const recentB = await searchService.listRecent(idB);
  assert.ok(recentB.items.some((i) => i.query === 'Ikeja'));
  assert.ok(!recentB.items.some((i) => i.query === 'Lekki Phase 1'));

  await searchService.clearRecent(idA);
  const cleared = await searchService.listRecent(idA);
  assert.equal(cleared.items.length, 0);
  const stillB = await searchService.listRecent(idB);
  assert.ok(stillB.items.length >= 1);

  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[idA, idB]]);
});

test('admin/private fields never appear in search payloads', async () => {
  const data = await searchService.search({
    q: 'lagos',
    freshness: 'any',
    limit: 20,
  });
  const blob = JSON.stringify(data);
  assert.equal(blob.includes('moderation'), false);
  assert.equal(blob.includes('password_hash'), false);
  assert.equal(blob.includes('notification'), false);
});

test('teardown pool', async () => {
  await closePool();
});
