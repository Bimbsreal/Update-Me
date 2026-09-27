/**
 * Admin commodity price management tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { closePool } from '../src/db/pool.js';
import { commodityAdminService } from '../src/services/commodityAdminService.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { ADMIN_PERMISSIONS, roleHasPermission } from '../src/config/admin.js';

test('commodities permission for data_manager and admin', () => {
  assert.equal(roleHasPermission('admin', ADMIN_PERMISSIONS.commodities), true);
  assert.equal(roleHasPermission('data_manager', ADMIN_PERMISSIONS.commodities), true);
  assert.equal(roleHasPermission('moderator', ADMIN_PERMISSIONS.commodities), false);
});

test('commodity admin dashboard returns numeric metrics', async () => {
  const dash = await commodityAdminService.dashboard();
  assert.equal(typeof dash.activeCommodities, 'number');
  assert.equal(typeof dash.observationsToday, 'number');
  assert.equal(typeof dash.awaitingReview, 'number');
  assert.equal(typeof dash.verifiedObservations, 'number');
  assert.equal(typeof dash.staleOrExpired, 'number');
  assert.equal(typeof dash.conflictingGroups, 'number');
  assert.ok(Array.isArray(dash.recentLocations));
});

test('commodity catalogue list supports pagination', async () => {
  const list = await commodityAdminService.listCatalogue({ page: 1, limit: 10 });
  assert.ok(Array.isArray(list.items));
  assert.equal(typeof list.total, 'number');
  assert.ok(Array.isArray(list.categories));
});

test('commodity create/update requires reason', async () => {
  await assert.rejects(
    () => commodityAdminService.createCommodity({ name: 'Test Grain' }, { userId: null }, null),
    (err) => err instanceof AppError && err.code === 'VALIDATION_ERROR'
  );
  const list = await commodityAdminService.listCatalogue({ limit: 1 });
  if (!list.items.length) return;
  await assert.rejects(
    () =>
      commodityAdminService.updateCommodity(
        list.items[0].id,
        { name: list.items[0].name },
        { userId: null },
        null
      ),
    (err) => err instanceof AppError && err.code === 'VALIDATION_ERROR'
  );
});

test('commodity observations list and note', async () => {
  const list = await commodityAdminService.listObservations({ page: 1, limit: 10 });
  assert.ok(Array.isArray(list.items));
  assert.match(list.note, /location-specific/i);
});

test('conflicts compare same unit only', async () => {
  const conflicts = await commodityAdminService.listConflicts({ limit: 10 });
  assert.ok(Array.isArray(conflicts.items));
  assert.match(conflicts.note, /same commodity/i);
});

test('duplicates are review-only', async () => {
  const dups = await commodityAdminService.listDuplicates({ limit: 10 });
  assert.ok(Array.isArray(dups.sameReporterSamePlace));
  assert.match(dups.note, /human review/i);
});

test('quality issues shape', async () => {
  const issues = await commodityAdminService.qualityIssues({ limit: 10 });
  assert.ok(issues.counts);
  assert.ok(Array.isArray(issues.staleOrExpired));
  assert.ok(Array.isArray(issues.unusualHighPrices));
});

test('markets list shape', async () => {
  const markets = await commodityAdminService.listMarkets({ page: 1, limit: 10 });
  assert.ok(Array.isArray(markets.items));
  assert.ok(Array.isArray(markets.placeTypes));
});

test('observation metadata update preserves amount', async () => {
  const list = await commodityAdminService.listObservations({ limit: 1 });
  if (!list.items.length) return;
  const id = list.items[0].id;
  const before = await commodityAdminService.getObservation(id);
  const amount = before.item.price.amount;
  const after = await commodityAdminService.updateObservationMeta(
    id,
    {
      placeLabel: before.item.place?.name || 'Dev market label',
      status: before.item.status,
      reason: 'test metadata correction',
    },
    { userId: null },
    null
  );
  assert.equal(after.item.price.amount, amount);
});

test('commodity dashboard includes intelligence metrics', async () => {
  const dash = await commodityAdminService.dashboard();
  assert.equal(typeof dash.activeMarkets, 'number');
  assert.equal(typeof dash.priceAnomalies, 'number');
  assert.equal(typeof dash.flaggedObservations, 'number');
});

test('commodity price anomalies are review-only', async () => {
  const anomalies = await commodityAdminService.listPriceAnomalies({ limit: 20 });
  assert.ok(Array.isArray(anomalies.items));
  assert.match(anomalies.note, /review/i);
});

test('normalizeUnitPrice is display-only', async () => {
  const { normalizeUnitPrice } = await import('../src/config/prices.js');
  const n = normalizeUnitPrice({ amount: 50000, quantity: 50, unitCode: 'kg', unitType: 'mass' });
  assert.equal(n.amount, 1000);
  assert.equal(n.unit, 'kg');
  assert.match(n.note, /display only/i);
  assert.equal(
    normalizeUnitPrice({ amount: 50000, quantity: 1, unitCode: 'bag', unitType: 'package' }),
    null
  );
});

test('teardown pool', async () => {
  await closePool();
});
