/**
 * Admin traffic & transport operations tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { closePool, getPool } from '../src/db/pool.js';
import { trafficAdminService } from '../src/services/trafficAdminService.js';
import { transportAdminService } from '../src/services/transportAdminService.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { ADMIN_PERMISSIONS, roleHasPermission } from '../src/config/admin.js';

test('traffic permission is granted to admin and data_manager, not moderator', () => {
  assert.equal(roleHasPermission('admin', ADMIN_PERMISSIONS.traffic), true);
  assert.equal(roleHasPermission('data_manager', ADMIN_PERMISSIONS.traffic), true);
  assert.equal(roleHasPermission('moderator', ADMIN_PERMISSIONS.traffic), false);
  assert.equal(roleHasPermission('data_manager', ADMIN_PERMISSIONS.transport), true);
});

test('traffic admin dashboard returns numeric metrics', async () => {
  const dash = await trafficAdminService.dashboard();
  assert.equal(typeof dash.activeReports, 'number');
  assert.equal(typeof dash.awaitingReview, 'number');
  assert.equal(typeof dash.currentIncidents, 'number');
  assert.equal(typeof dash.staleOrExpired, 'number');
  assert.equal(typeof dash.communityReportsToday, 'number');
  assert.equal(typeof dash.officialUpdates7d, 'number');
  assert.ok(Array.isArray(dash.busyAreas));
});

test('traffic admin list supports pagination', async () => {
  const list = await trafficAdminService.list({ page: 1, limit: 10 });
  assert.ok(Array.isArray(list.items));
  assert.equal(typeof list.total, 'number');
  assert.ok(list.limit <= 10);
});

test('traffic admin update requires reason', async () => {
  const list = await trafficAdminService.list({ limit: 1 });
  if (!list.items.length) return;
  await assert.rejects(
    () => trafficAdminService.update(list.items[0].id, { severity: 'heavy' }, { userId: null }, null),
    (err) => err instanceof AppError && err.code === 'VALIDATION_ERROR'
  );
});

test('traffic admin quality and duplicates shapes', async () => {
  const issues = await trafficAdminService.qualityIssues({ limit: 10 });
  assert.ok(issues.counts);
  assert.ok(Array.isArray(issues.staleOrExpired));
  const dups = await trafficAdminService.listDuplicates({ limit: 10 });
  assert.ok(Array.isArray(dups.sameRoadRecent));
  assert.match(dups.note, /human review/i);
});

test('transport admin dashboard returns numeric metrics', async () => {
  const dash = await transportAdminService.dashboard();
  assert.equal(typeof dash.activeRoutes, 'number');
  assert.equal(typeof dash.busStops, 'number');
  assert.equal(typeof dash.fareObservationsToday, 'number');
  assert.equal(typeof dash.conflictingFareGroups, 'number');
});

test('transport admin list routes and fares', async () => {
  const routes = await transportAdminService.listRoutes({ page: 1, limit: 10 });
  assert.ok(Array.isArray(routes.items));
  const fares = await transportAdminService.listFares({ page: 1, limit: 10 });
  assert.ok(Array.isArray(fares.items));
  assert.ok(fares.note);
});

test('transport fare conflicts are review-only', async () => {
  const conflicts = await transportAdminService.listFareConflicts({ limit: 10 });
  assert.ok(Array.isArray(conflicts.items));
  assert.match(conflicts.note, /universal/i);
});

test('transport route update requires reason', async () => {
  const list = await transportAdminService.listRoutes({ limit: 1 });
  if (!list.items.length) return;
  await assert.rejects(
    () =>
      transportAdminService.updateRoute(
        list.items[0].id,
        { name: list.items[0].name },
        { userId: null },
        null
      ),
    (err) => err instanceof AppError && err.code === 'VALIDATION_ERROR'
  );
});

test('transport quality issues shape', async () => {
  const issues = await transportAdminService.qualityIssues({ limit: 10 });
  assert.ok(issues.counts);
  assert.ok(Array.isArray(issues.staleRoutes));
  assert.ok(Array.isArray(issues.stopsMissingLocation));
});

test('teardown pool', async () => {
  await closePool();
});
