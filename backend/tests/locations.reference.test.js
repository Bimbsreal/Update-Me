/**
 * Reference geography / location management tests.
 * Uses existing verified datasets only — no fabricated places.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { closePool, getPool } from '../src/db/pool.js';
import {
  importNigeriaGeographyReference,
  validateLgaDataset,
  loadLgasDataset,
} from '../src/db/referenceGeographyImport.js';
import { locationAdminService, countLocationUsage } from '../src/services/locationAdminService.js';
import { AppError } from '../src/middleware/errorHandler.js';

test('LGA dataset validates without inventing rows', () => {
  const data = loadLgasDataset();
  assert.ok(data.length >= 700);
  const v = validateLgaDataset(data);
  assert.equal(v.total, data.length);
  assert.ok(v.uniqueKeys >= 700);
  assert.ok(v.withCoords > 0);
});

test('geography reference import is idempotent', async () => {
  const first = await importNigeriaGeographyReference({ dryRun: false });
  assert.equal(first.success, true);
  const second = await importNigeriaGeographyReference({ dryRun: false });
  assert.equal(second.success, true);
  // Second run should not insert many new LGAs
  assert.ok(second.summary.lgasInserted <= 5);

  const pool = getPool();
  const states = await pool.query(`SELECT COUNT(*)::int AS c FROM states`);
  const lgas = await pool.query(`SELECT COUNT(*)::int AS c FROM lgas`);
  const locStates = await pool.query(
    `SELECT COUNT(*)::int AS c FROM locations WHERE type = 'state' AND status = 'active'`
  );
  const locLgas = await pool.query(
    `SELECT COUNT(*)::int AS c FROM locations WHERE type = 'lga' AND status = 'active'`
  );
  assert.ok(states.rows[0].c >= 36);
  assert.ok(lgas.rows[0].c >= 700);
  assert.ok(locStates.rows[0].c >= 36);
  assert.ok(locLgas.rows[0].c >= 700);
});

test('dry-run import does not commit', async () => {
  const before = await getPool().query(
    `SELECT COUNT(*)::int AS c FROM reference_import_batches WHERE dry_run = FALSE`
  );
  const result = await importNigeriaGeographyReference({ dryRun: true });
  assert.equal(result.summary.dryRun, true);
  const after = await getPool().query(
    `SELECT COUNT(*)::int AS c FROM reference_import_batches WHERE dry_run = FALSE`
  );
  assert.equal(after.rows[0].c, before.rows[0].c);
});

test('admin location update rejects hard delete and invalid coords', async () => {
  const list = await locationAdminService.list({ type: 'lga', limit: 1 });
  assert.ok(list.items.length >= 1);
  const id = list.items[0].id;

  await assert.rejects(
    () => locationAdminService.update(id, { delete: true }, { userId: null }, null),
    (err) => err instanceof AppError && err.code === 'DELETE_FORBIDDEN'
  );

  await assert.rejects(
    () =>
      locationAdminService.update(
        id,
        { latitude: 999, longitude: 1 },
        { userId: null },
        null
      ),
    (err) => err instanceof AppError && err.code === 'VALIDATION_ERROR'
  );
});

test('usage counting and deactivate/activate round-trip', async () => {
  const list = await locationAdminService.list({ type: 'area', status: 'active', limit: 5 });
  if (!list.items.length) {
    // Starter areas may exist from seed:geo — skip soft if empty
    return;
  }
  const id = list.items[0].id;
  const usage = await countLocationUsage(id);
  assert.ok(typeof usage.total === 'number');

  await locationAdminService.deactivate(id, { reason: 'test' }, { userId: null }, null);
  const after = await locationAdminService.get(id);
  assert.equal(after.location.status, 'inactive');

  await locationAdminService.activate(id, { reason: 'test restore' }, { userId: null }, null);
  const restored = await locationAdminService.get(id);
  assert.equal(restored.location.status, 'active');
});

test('location quality issues endpoint shape', async () => {
  const issues = await locationAdminService.qualityIssues({ limit: 10 });
  assert.ok(issues.counts);
  assert.ok(Array.isArray(issues.missingCoordinates));
  assert.ok(Array.isArray(issues.inactiveStillReferenced));
});

test('admin location dashboard reports real type counts', async () => {
  const dash = await locationAdminService.dashboard();
  assert.ok(dash.states >= 36);
  assert.ok(dash.lgas >= 700);
  assert.equal(typeof dash.inactive, 'number');
  assert.equal(typeof dash.pendingReview, 'number');
  assert.equal(typeof dash.duplicateGroups, 'number');
});

test('admin location tree roots are states and expand to children', async () => {
  const roots = await locationAdminService.tree({});
  assert.ok(roots.items.length >= 1);
  assert.ok(roots.items.every((r) => r.type === 'state'));
  const parent = roots.items.find((r) => r.hasChildren) || roots.items[0];
  const children = await locationAdminService.tree({ parentId: parent.id });
  assert.ok(Array.isArray(children.items));
});

test('admin location duplicates returns review candidates only', async () => {
  const dups = await locationAdminService.listDuplicates({ limit: 10 });
  assert.ok(Array.isArray(dups.sameNameSameParent));
  assert.ok(Array.isArray(dups.nearDuplicateCoordinates));
  assert.match(dups.note, /human review/i);
});

test('admin location aliases improve search without changing name', async () => {
  const list = await locationAdminService.list({ type: 'area', status: 'active', limit: 1 });
  if (!list.items.length) return;
  const id = list.items[0].id;
  const before = await locationAdminService.get(id);
  const alias = `test-alias-${Date.now().toString(36)}`;
  const created = await locationAdminService.addAlias(
    id,
    { alias, reason: 'test alias' },
    { userId: null },
    null
  );
  assert.ok(created.id);
  const found = await locationAdminService.list({ q: alias, limit: 5 });
  assert.ok(found.items.some((i) => i.id === id));
  await locationAdminService.removeAlias(id, created.id, { reason: 'cleanup' }, { userId: null }, null);
  const after = await locationAdminService.get(id);
  assert.equal(after.location.name, before.location.name);
});

test('out-of-Nigeria coordinates rejected on update', async () => {
  const list = await locationAdminService.list({ type: 'lga', limit: 1 });
  assert.ok(list.items.length >= 1);
  await assert.rejects(
    () =>
      locationAdminService.update(
        list.items[0].id,
        { latitude: 51.5, longitude: -0.12, reason: 'test' },
        { userId: null },
        null
      ),
    (err) => err instanceof AppError && err.code === 'OUT_OF_BOUNDS'
  );
});

test('search prefers active locations and supports partial names', async () => {
  const { locationRepository } = await import('../src/repositories/locationRepository.js');
  const results = await locationRepository.search({ q: 'Lagos', limit: 10 });
  assert.ok(Array.isArray(results));
  assert.ok(results.length >= 1);
  assert.ok(results.every((r) => !r.status || r.status === 'active'));
});

test('teardown pool', async () => {
  await closePool();
});
