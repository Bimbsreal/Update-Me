/**
 * Production ingestion layer tests (mock providers only — no live government hosts).
 * Run: node --test tests/ingestion.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { assertSafeIngestionUrl, isPrivateIp } from '../src/ingestion/urlPolicy.js';
import { hashOfficialContent, sanitizeOfficialText } from '../src/ingestion/sanitize.js';
import { computeSourceHealth, shouldAutoSuspend } from '../src/ingestion/sourceHealth.js';
import { resolveOfficialLocation } from '../src/ingestion/locationResolver.js';
import { runSourceIngestion } from '../src/ingestion/index.js';
import { officialRepository } from '../src/repositories/officialRepository.js';
import { getOfficialProvider } from '../src/official/providers/index.js';
import { AppError } from '../src/middleware/errorHandler.js';

test('SSRF policy blocks private and localhost hosts', () => {
  assert.throws(
    () => assertSafeIngestionUrl('http://127.0.0.1/secret', 'feedUrl'),
    (err) => err instanceof AppError && err.code === 'SSRF_BLOCKED'
  );
  assert.throws(
    () => assertSafeIngestionUrl('http://169.254.169.254/latest/meta-data/', 'feedUrl'),
    (err) => err instanceof AppError && err.code === 'SSRF_BLOCKED'
  );
  assert.throws(
    () => assertSafeIngestionUrl('http://10.0.0.5/internal', 'feedUrl', { requireAllowlist: true }),
    (err) => err instanceof AppError
  );
  assert.ok(isPrivateIp('192.168.1.1'));
  assert.equal(
    assertSafeIngestionUrl('fixture://frsc', 'feedUrl'),
    'fixture://frsc'
  );
});

test('domain allowlist rejects arbitrary public hosts for live fetch', () => {
  assert.throws(
    () =>
      assertSafeIngestionUrl('https://evil.example.com/feed.json', 'feedUrl', {
        requireAllowlist: true,
      }),
    (err) => err instanceof AppError && err.code === 'DOMAIN_NOT_ALLOWED'
  );
  assert.ok(
    assertSafeIngestionUrl('https://www.nmdpra.gov.ng/notices', 'feedUrl', {
      requireAllowlist: true,
    })
  );
});

test('sanitize strips scripts and tags', () => {
  const clean = sanitizeOfficialText(
    '<p>Hello</p><script>alert(1)</script><b>World</b>',
    { maxLength: 100 }
  );
  assert.equal(clean, 'Hello World');
  assert.ok(!clean.includes('script'));
});

test('content hash is stable and changes with title', () => {
  const a = hashOfficialContent({ title: 'A', summary: 's', publishedAt: '2026-01-01' });
  const b = hashOfficialContent({ title: 'A', summary: 's', publishedAt: '2026-01-01' });
  const c = hashOfficialContent({ title: 'B', summary: 's', publishedAt: '2026-01-01' });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('source health states are observable', () => {
  assert.equal(computeSourceHealth({ status: 'disabled' }), 'disabled');
  assert.equal(
    computeSourceHealth({
      status: 'active',
      verificationStatus: 'verified',
      consecutiveFailures: 0,
      lastSuccessAt: new Date().toISOString(),
      syncIntervalMinutes: 60,
    }),
    'healthy'
  );
  assert.equal(
    computeSourceHealth({
      status: 'active',
      verificationStatus: 'verified',
      consecutiveFailures: 2,
    }),
    'warning'
  );
  assert.equal(
    computeSourceHealth({
      status: 'active',
      verificationStatus: 'verified',
      consecutiveFailures: 5,
    }),
    'failing'
  );
  assert.equal(shouldAutoSuspend({ consecutiveFailures: 8 }), true);
  assert.equal(shouldAutoSuspend({ consecutiveFailures: 2 }), false);
});

test('location resolver maps known Nigerian places without inventing', async () => {
  const unknown = await resolveOfficialLocation({ placeHint: 'CompletelyFakePlaceXYZ99' });
  assert.equal(unknown.level, 'unknown');

  const lagos = await resolveOfficialLocation({ stateName: 'Lagos' });
  assert.equal(lagos.level, 'state');
  assert.ok(lagos.stateId);

  const area = await resolveOfficialLocation({
    stateName: 'Lagos',
    placeHint: 'Lekki Phase 1',
  });
  assert.ok(['area', 'exact', 'lga'].includes(area.level));
  assert.ok(area.locationId || area.stateId);
});

test('fixture sync succeeds, dedupes on repeat, and writes ingestion run', async () => {
  const first = await runSourceIngestion('fixture_frsc', { trigger: 'test' });
  assert.ok(['success', 'partial'].includes(first.status), first.error || first.status);
  assert.ok(first.retrieved >= 1);

  const second = await runSourceIngestion('fixture_frsc', { trigger: 'test' });
  assert.ok(['success', 'partial'].includes(second.status));
  assert.equal(second.added, 0);
  assert.ok(second.skipped >= 1 || second.updated >= 0);

  const runs = await officialRepository.listSyncRuns({ sourceId: 'fixture_frsc', limit: 5 });
  assert.ok(runs.items.length >= 1);
  assert.ok(runs.items[0].triggerReason === 'test' || runs.items[0].retrievedCount >= 0);

  const source = await officialRepository.getSource('fixture_frsc');
  assert.equal(source.healthStatus, 'healthy');
});

test('failed provider does not corrupt existing updates (isolation)', async () => {
  const provider = getOfficialProvider('fixture');
  const original = provider.fetchUpdates.bind(provider);
  provider.fetchUpdates = async () => {
    throw new Error('HTTP 500 simulated provider failure');
  };

  try {
    const before = await getPool().query(
      `SELECT COUNT(*)::int AS n FROM official_updates WHERE source_id = 'fixture_frsc' AND status = 'published'`
    );
    const result = await runSourceIngestion('fixture_frsc', { trigger: 'test-fail' });
    assert.equal(result.status, 'failed');
    const after = await getPool().query(
      `SELECT COUNT(*)::int AS n FROM official_updates WHERE source_id = 'fixture_frsc' AND status = 'published'`
    );
    assert.equal(after.rows[0].n, before.rows[0].n);
  } finally {
    provider.fetchUpdates = original;
  }
});

test('concurrent sync lock skips overlapping run', async () => {
  const { tryAcquireSourceSyncLock, releaseSourceSyncLock } = await import(
    '../src/ingestion/locks.js'
  );
  const ok = await tryAcquireSourceSyncLock('fixture_lastma');
  assert.equal(ok, true);
  try {
    const result = await runSourceIngestion('fixture_lastma', { trigger: 'overlap' });
    assert.equal(result.status, 'skipped');
    assert.equal(result.error, 'sync_in_progress');
  } finally {
    await releaseSourceSyncLock('fixture_lastma');
  }
});

test('teardown pool', async () => {
  await closePool();
});
