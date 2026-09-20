/**
 * Official Updates Engine tests — mocked providers; no live government sites.
 * Run: node --test tests/official.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { OfficialSourceProvider } from '../src/official/providers/OfficialSourceProvider.js';
import { validateNormalizedUpdate, validateNormalizedUpdates } from '../src/official/providers/utils.js';
import { getOfficialProvider, resolveProviderForSource } from '../src/official/providers/index.js';
import { officialRepository } from '../src/repositories/officialRepository.js';
import { officialService } from '../src/services/officialService.js';
import { syncOfficialSource } from '../src/services/officialSyncService.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { buildDedupeKey } from '../src/middleware/officialAdmin.js';

const TEST_SOURCE_ID = 'test_mock_agency';

class MockOfficialProvider extends OfficialSourceProvider {
  constructor({ fail = false, malformed = false, items = null } = {}) {
    super();
    this._fail = fail;
    this._malformed = malformed;
    this._items = items;
  }

  get key() {
    return 'fixture';
  }

  async fetchUpdates(source) {
    if (this._fail) throw new Error('Mock official source unavailable');
    if (this._malformed) return [{ not: 'valid' }];
    if (this._items) return this._items;
    return [
      {
        externalId: `${source.id}-item-1`,
        title: 'Mock official road advisory for testing',
        summary: 'This is a mocked official notice used only in automated tests.',
        originalUrl: 'https://example.gov.ng/notices/1',
        category: 'road_traffic',
        jurisdictionLevel: 'national',
        publishedAt: new Date().toISOString(),
      },
      {
        externalId: `${source.id}-item-2`,
        title: 'Mock fuel supply monitoring notice',
        summary: 'Second mocked official notice for duplicate and filter tests.',
        originalUrl: 'https://example.gov.ng/notices/2',
        category: 'fuel_petroleum',
        jurisdictionLevel: 'national',
        publishedAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ];
  }
}

async function ensureTestSource() {
  const existing = await officialRepository.getSource(TEST_SOURCE_ID);
  if (existing) {
    await officialRepository.updateSource(TEST_SOURCE_ID, {
      status: 'active',
      verificationStatus: 'verified',
      ingestionMethod: 'fixture',
      providerKey: 'fixture',
      syncIntervalMinutes: 60,
      config: { fixtureKey: 'frsc' },
    });
    return officialRepository.getSource(TEST_SOURCE_ID);
  }
  return officialRepository.createSource({
    id: TEST_SOURCE_ID,
    organizationName: 'Test Mock Agency',
    shortName: 'TMA',
    agencyType: 'federal',
    jurisdictionLevel: 'national',
    officialWebsite: 'https://example.gov.ng/',
    feedUrl: 'fixture://test',
    ingestionMethod: 'fixture',
    providerKey: 'fixture',
    status: 'active',
    verificationStatus: 'verified',
    syncIntervalMinutes: 60,
    config: { fixtureKey: 'frsc' },
    notes: 'Automated test source',
  });
}

async function wipeTestUpdates() {
  const pool = getPool();
  await pool.query(`DELETE FROM official_updates WHERE source_id = $1`, [TEST_SOURCE_ID]);
  await pool.query(`DELETE FROM official_sync_runs WHERE source_id = $1`, [TEST_SOURCE_ID]);
}

function patchFixtureProvider(mock) {
  const real = getOfficialProvider('fixture');
  const original = real.fetchUpdates.bind(real);
  real.fetchUpdates = (...args) => mock.fetchUpdates(...args);
  return () => {
    real.fetchUpdates = original;
  };
}

test('dedupe key prefers external id, then URL, then title/time', () => {
  assert.equal(
    buildDedupeKey({ externalId: 'ABC-1', originalUrl: 'https://x.test', title: 'T' }),
    'ext:abc-1'
  );
  assert.match(
    buildDedupeKey({ originalUrl: 'https://Example.GOV.NG/path', title: 'T' }),
    /^url:/
  );
  assert.match(buildDedupeKey({ title: 'Hello World', publishedAt: '2026-01-01T00:00:00Z' }), /^meta:/);
});

test('validateNormalizedUpdate rejects malformed payloads', () => {
  const source = { id: 'x', jurisdictionLevel: 'national' };
  assert.throws(() => validateNormalizedUpdate(null, source), /object/i);
  assert.throws(
    () => validateNormalizedUpdate({ title: 'ab', category: 'road_traffic' }, source),
    /title/i
  );
  assert.throws(
    () =>
      validateNormalizedUpdate(
        { title: 'Valid title here', category: 'politics' },
        source
      ),
    /category/i
  );
});

test('source creation validation and authorization boundaries', async () => {
  // DB refuses unverified active sources
  await assert.rejects(
    () =>
      officialRepository.createSource({
        id: `tmp_unverified_${Date.now()}`,
        organizationName: 'Unverified Agency',
        agencyType: 'other',
        jurisdictionLevel: 'national',
        ingestionMethod: 'fixture',
        providerKey: 'fixture',
        status: 'active',
        verificationStatus: 'unverified',
        syncIntervalMinutes: 60,
        config: {},
      }),
    /active_must_be_verified|check constraint|violates/i
  );

  await assert.rejects(
    () =>
      officialService.createSource({
        id: `tmp_bad_url_${Date.now()}`,
        organizationName: 'Bad URL Agency',
        agencyType: 'other',
        jurisdictionLevel: 'national',
        officialWebsite: 'javascript:alert(1)',
        ingestionMethod: 'fixture',
        providerKey: 'fixture',
        status: 'draft',
        verificationStatus: 'unverified',
        syncIntervalMinutes: 60,
        config: {},
      }),
    (err) => err instanceof AppError && err.code === 'VALIDATION_ERROR'
  );
});

test('successful sync, attribution, filters, and duplicate prevention', async () => {
  await ensureTestSource();
  await wipeTestUpdates();
  const restore = patchFixtureProvider(new MockOfficialProvider());

  try {
    const first = await syncOfficialSource(TEST_SOURCE_ID);
    assert.equal(first.status, 'success');
    assert.equal(first.added, 2);

    const second = await syncOfficialSource(TEST_SOURCE_ID);
    assert.equal(second.status, 'success');
    assert.equal(second.added, 0);
    assert.ok(second.updated >= 1);

    const listed = await officialService.list({ sourceId: TEST_SOURCE_ID, limit: 20, page: 1 });
    assert.equal(listed.items.length, 2);
    assert.ok(listed.items.every((i) => i.isOfficial === true));
    assert.ok(listed.items.every((i) => i.isCommunity === false));
    assert.ok(listed.items.every((i) => i.badge === 'OFFICIAL'));
    assert.ok(listed.items.every((i) => String(i.attribution).startsWith('Official')));
    assert.ok(listed.items.every((i) => i.source?.organizationName));

    const filtered = await officialService.list({
      sourceId: TEST_SOURCE_ID,
      category: 'fuel_petroleum',
      page: 1,
      limit: 20,
    });
    assert.equal(filtered.items.length, 1);
    assert.equal(filtered.items[0].category, 'fuel_petroleum');

    const one = await officialService.getById(listed.items[0].id);
    assert.equal(one.id, listed.items[0].id);
    assert.ok(one.originalUrl);
  } finally {
    restore();
  }
});

test('failed sync retains existing updates and records failure', async () => {
  await ensureTestSource();
  await wipeTestUpdates();
  let restore = patchFixtureProvider(new MockOfficialProvider());

  try {
    await syncOfficialSource(TEST_SOURCE_ID);
    restore();

    const before = await officialService.list({ sourceId: TEST_SOURCE_ID, page: 1, limit: 20 });
    assert.equal(before.items.length, 2);

    restore = patchFixtureProvider(new MockOfficialProvider({ fail: true }));
    const failed = await syncOfficialSource(TEST_SOURCE_ID);
    assert.equal(failed.status, 'failed');

    const after = await officialService.list({ sourceId: TEST_SOURCE_ID, page: 1, limit: 20 });
    assert.equal(after.items.length, 2);

    const source = await officialRepository.getSource(TEST_SOURCE_ID);
    assert.ok(source.consecutiveFailures >= 1);
    assert.ok(source.lastSuccessAt);
  } finally {
    restore();
  }
});

test('malformed provider response fails without inventing updates', async () => {
  await ensureTestSource();
  await wipeTestUpdates();
  const restore = patchFixtureProvider(new MockOfficialProvider({ malformed: true }));

  try {
    const result = await syncOfficialSource(TEST_SOURCE_ID);
    assert.equal(result.status, 'failed');
    const listed = await officialService.list({ sourceId: TEST_SOURCE_ID, page: 1, limit: 20 });
    assert.equal(listed.items.length, 0);
  } finally {
    restore();
  }
});

test('fixture provider resolves seeded sources and syncs without live network', async () => {
  const source = await officialRepository.getSource('fixture_frsc');
  assert.ok(source);
  assert.equal(source.verificationStatus, 'verified');
  const provider = resolveProviderForSource(source);
  assert.equal(provider.key, 'fixture');

  const result = await syncOfficialSource('fixture_frsc');
  // Under parallel test files another suite may briefly hold the advisory lock.
  if (result.status === 'skipped') {
    await new Promise((r) => setTimeout(r, 150));
    const retry = await syncOfficialSource('fixture_frsc');
    assert.ok(['success', 'partial'].includes(retry.status), retry.error || retry.status);
    assert.ok(retry.retrieved >= 1);
  } else {
    assert.ok(['success', 'partial'].includes(result.status), result.error || result.status);
    assert.ok(result.retrieved >= 1);
  }

  const listed = await officialService.list({ sourceId: 'fixture_frsc', page: 1, limit: 10 });
  assert.ok(listed.items.length >= 1);
  assert.match(listed.items[0].attribution, /FRSC|Official/i);
});

test('web publication provider refuses blind scraping', async () => {
  const web = getOfficialProvider('web_publication');
  await assert.rejects(
    () => web.fetchUpdates({ id: 'x', feedUrl: 'https://example.gov.ng/page' }),
    /not enabled|scraping/i
  );
});

test.after(async () => {
  await wipeTestUpdates();
  const pool = getPool();
  await pool.query(`DELETE FROM official_sync_runs WHERE source_id = $1`, [TEST_SOURCE_ID]);
  await pool.query(`DELETE FROM official_sources WHERE id = $1`, [TEST_SOURCE_ID]);
  await closePool();
});
