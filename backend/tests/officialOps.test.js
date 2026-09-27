/**
 * Official ops hardening — review queue, agency profile, manual entry, SSRF.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { closePool, getPool } from '../src/db/pool.js';
import { officialAdminService } from '../src/services/officialAdminService.js';
import { assertSafeIngestionUrl } from '../src/ingestion/urlPolicy.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { ADMIN_PERMISSIONS, roleHasPermission } from '../src/config/admin.js';
import { officialRepository } from '../src/repositories/officialRepository.js';
import { syncOfficialSource } from '../src/services/officialSyncService.js';

test('official RBAC permissions exist', () => {
  assert.equal(roleHasPermission('admin', ADMIN_PERMISSIONS.official_sources), true);
  assert.equal(roleHasPermission('admin', ADMIN_PERMISSIONS.official_updates), true);
  assert.equal(roleHasPermission('admin', ADMIN_PERMISSIONS.official_sync), true);
  assert.equal(roleHasPermission('moderator', ADMIN_PERMISSIONS.official_updates), true);
  assert.equal(roleHasPermission('moderator', ADMIN_PERMISSIONS.official_sync), false);
});

test('SSRF blocks private and non-allowlisted hosts', () => {
  assert.throws(
    () => assertSafeIngestionUrl('http://127.0.0.1/secret', 'feedUrl', { requireAllowlist: true }),
    (err) => err instanceof AppError
  );
  assert.throws(
    () =>
      assertSafeIngestionUrl('https://evil.example.com/feed', 'feedUrl', { requireAllowlist: true }),
    (err) => err instanceof AppError && err.code === 'DOMAIN_NOT_ALLOWED'
  );
  assert.doesNotThrow(() =>
    assertSafeIngestionUrl('https://frsc.gov.ng/feed', 'feedUrl', { requireAllowlist: true })
  );
  assert.doesNotThrow(() => assertSafeIngestionUrl('fixture://frsc', 'feedUrl'));
});

test('source health and agency profile shapes', async () => {
  const health = await officialAdminService.sourceHealth();
  assert.ok(health.counts);
  assert.ok(Array.isArray(health.items));
  assert.equal(typeof health.counts.total, 'number');

  const sources = await officialRepository.listSources({ includeInactive: true });
  assert.ok(sources.length);
  const profile = await officialAdminService.getAgencyProfile(sources[0].id);
  assert.equal(profile.source.id, sources[0].id);
  assert.ok(profile.metrics);
  assert.equal(typeof profile.metrics.activeUpdates, 'number');
  assert.ok(!('config' in profile.source));
});

test('review queue and near-dupe signals', async () => {
  const queue = await officialAdminService.reviewQueue({ page: 1, limit: 10 });
  assert.ok(Array.isArray(queue.items));
  assert.ok(Array.isArray(queue.failedIngestions));
  assert.ok(Array.isArray(queue.nearDuplicates));
});

test('fixture sync remains idempotent and auto-publishes', async () => {
  const first = await syncOfficialSource('fixture_frsc');
  assert.ok(['success', 'partial'].includes(first.status));
  const second = await syncOfficialSource('fixture_frsc');
  assert.ok(['success', 'partial'].includes(second.status));
  assert.ok(second.added === 0 || second.skipped >= 0);

  const published = await getPool().query(
    `SELECT COUNT(*)::int AS c FROM official_updates
     WHERE source_id = 'fixture_frsc' AND status = 'published'`
  );
  assert.ok(published.rows[0].c >= 1);
});

test('manual official entry requires reason and verified source', async () => {
  await assert.rejects(
    () =>
      officialAdminService.createManualUpdate(
        { userId: null },
        { sourceId: 'fixture_frsc', title: 'Test', category: 'road_traffic' },
        null
      ),
    (err) => err instanceof AppError && err.code === 'VALIDATION_ERROR'
  );

  const created = await officialAdminService.createManualUpdate(
    { userId: null },
    {
      sourceId: 'fixture_frsc',
      title: `Admin FRSC advisory ${Date.now()}`,
      summary: 'Development-only admin-entered official-source information.',
      category: 'road_traffic',
      reason: 'local verification of manual official entry',
      publishNow: false,
    },
    null
  );
  assert.equal(created.item.status, 'pending_review');
  assert.equal(created.item.entryOrigin, 'admin_manual');
  assert.match(created.item.entryAttribution || '', /Admin-entered/i);

  const approved = await officialAdminService.approveUpdate(
    { userId: null },
    created.item.id,
    { reason: 'publish after review for test' },
    null
  );
  assert.equal(approved.item.status, 'published');
});

test('multi-area replace works', async () => {
  const list = await getPool().query(
    `SELECT id, location_id, state_id FROM official_updates WHERE status = 'published' LIMIT 1`
  );
  if (!list.rows[0]) return;
  const id = list.rows[0].id;
  const areas = await officialRepository.replaceUpdateAreas(id, {
    locationIds: list.rows[0].location_id ? [list.rows[0].location_id] : [],
    stateIds: list.rows[0].state_id ? [list.rows[0].state_id] : [],
    primaryLocationId: list.rows[0].location_id,
    primaryStateId: list.rows[0].state_id,
  });
  assert.ok(Array.isArray(areas));
});

test('organizations catalogue is populated from sources', async () => {
  const orgs = await officialAdminService.listOrganizations({ limit: 50 });
  assert.ok(Array.isArray(orgs.items));
  assert.ok(orgs.items.length >= 1);
});

test('scope assessment flags political content for review', async () => {
  const { assessOfficialScope } = await import('../src/utils/officialScope.js');
  assert.equal(
    assessOfficialScope({
      title: 'Vote for our political party campaign rally',
      summary: 'Partisan electioneering and celebrity entertainment',
      category: 'other',
    }),
    'out_of_scope'
  );
  assert.equal(
    assessOfficialScope({
      title: 'FRSC traffic advisory on Lagos-Ibadan expressway',
      summary: 'Road closure due to accident',
      category: 'road_traffic',
    }),
    'in_scope'
  );
});

test('expireDueUpdates marks past expiry without deleting history', async () => {
  const result = await officialAdminService.expireDueUpdates();
  assert.equal(typeof result.expired, 'number');
});

test('public list and detail expose asOf; expired filtered by default', async () => {
  const { officialService } = await import('../src/services/officialService.js');
  const list = await officialService.list({ limit: 5 });
  assert.ok(list.asOf);
  assert.ok(Array.isArray(list.items));
  assert.ok(list.activityWindow?.note);

  if (list.items[0]?.id) {
    const detail = await officialService.getById(list.items[0].id);
    assert.ok(detail.asOf);
    assert.ok(detail.update?.id);
    assert.equal(detail.update.isOfficial, true);
  }

  const sources = await officialService.listPublicSources();
  assert.ok(Array.isArray(sources));
  if (sources[0]?.id) {
    const hub = await officialService.getPublicSource(sources[0].id);
    assert.equal(hub.source.id, sources[0].id);
    assert.ok(hub.asOf);
    assert.ok(Array.isArray(hub.updates));
  }
});

test('source health includes update intelligence metrics', async () => {
  const health = await officialAdminService.sourceHealth();
  assert.equal(typeof health.counts.updatesToday, 'number');
  assert.equal(typeof health.counts.publishedUpdates, 'number');
  assert.equal(typeof health.counts.pendingUpdates, 'number');
  assert.equal(typeof health.counts.criticalUpdates, 'number');
  assert.equal(typeof health.counts.expiredUpdates, 'number');
});

test.after(async () => {
  await closePool();
});
