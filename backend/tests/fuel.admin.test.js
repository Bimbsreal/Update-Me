/**
 * Admin fuel management tests — uses existing stations/reports only where present.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { closePool, getPool } from '../src/db/pool.js';
import { fuelAdminService } from '../src/services/fuelAdminService.js';
import { AppError } from '../src/middleware/errorHandler.js';

test('fuel admin dashboard returns numeric metrics', async () => {
  const dash = await fuelAdminService.dashboard();
  assert.equal(typeof dash.activeStations, 'number');
  assert.equal(typeof dash.priceSubmissionsToday, 'number');
  assert.equal(typeof dash.staleOrExpiredPrices, 'number');
  assert.equal(typeof dash.conflictingPriceGroups, 'number');
  assert.equal(typeof dash.failedFuelSourceUpdates, 'number');
});

test('fuel admin list supports pagination and filters', async () => {
  const list = await fuelAdminService.listStations({ page: 1, limit: 10 });
  assert.ok(Array.isArray(list.items));
  assert.equal(typeof list.total, 'number');
  assert.ok(list.limit <= 10);
});

test('fuel admin rejects out-of-bounds coordinates on update', async () => {
  const list = await fuelAdminService.listStations({ limit: 1 });
  if (!list.items.length) return;
  await assert.rejects(
    () =>
      fuelAdminService.updateStation(
        list.items[0].id,
        { latitude: 51.5, longitude: -0.12, reason: 'test' },
        { userId: null },
        null
      ),
    (err) => err instanceof AppError && err.code === 'OUT_OF_BOUNDS'
  );
});

test('fuel admin duplicates and conflicts are review-only shapes', async () => {
  const dups = await fuelAdminService.listDuplicates({ limit: 10 });
  assert.ok(Array.isArray(dups.sameNameSameLocation));
  assert.ok(Array.isArray(dups.nearDuplicateCoordinates));
  assert.match(dups.note, /human review/i);

  const conflicts = await fuelAdminService.listConflicts({ limit: 10 });
  assert.ok(Array.isArray(conflicts.items));
});

test('fuel admin quality issues shape', async () => {
  const issues = await fuelAdminService.qualityIssues({ limit: 10 });
  assert.ok(issues.counts);
  assert.ok(Array.isArray(issues.missingCoordinates));
  assert.ok(Array.isArray(issues.unusualPrices));
});

test('fuel admin lifecycle deactivate/activate preserves reports', async () => {
  const list = await fuelAdminService.listStations({ status: 'active', limit: 1 });
  if (!list.items.length) return;
  const id = list.items[0].id;
  const beforeReports = await getPool().query(
    `SELECT COUNT(*)::int AS c FROM fuel_reports WHERE station_id = $1`,
    [id]
  );

  await fuelAdminService.setLifecycle(
    id,
    { lifecycleStatus: 'temporarily_inactive', reason: 'test deactivate' },
    { userId: null },
    null
  );
  const after = await fuelAdminService.getStation(id);
  assert.equal(after.station.lifecycleStatus, 'temporarily_inactive');
  assert.equal(after.station.isActive, false);

  await fuelAdminService.setLifecycle(
    id,
    { lifecycleStatus: 'active', reason: 'test restore' },
    { userId: null },
    null
  );
  const restored = await fuelAdminService.getStation(id);
  assert.equal(restored.station.lifecycleStatus, 'active');
  assert.equal(restored.station.isActive, true);

  const afterReports = await getPool().query(
    `SELECT COUNT(*)::int AS c FROM fuel_reports WHERE station_id = $1`,
    [id]
  );
  assert.equal(afterReports.rows[0].c, beforeReports.rows[0].c);
});

test('fuel admin aliases do not rename station', async () => {
  const list = await fuelAdminService.listStations({ status: 'active', limit: 1 });
  if (!list.items.length) return;
  const id = list.items[0].id;
  const before = await fuelAdminService.getStation(id);
  const alias = `fuel-alias-${Date.now().toString(36)}`;
  const created = await fuelAdminService.addAlias(
    id,
    { alias, reason: 'test' },
    { userId: null },
    null
  );
  assert.ok(created.id);
  const found = await fuelAdminService.listStations({ q: alias, limit: 5 });
  assert.ok(found.items.some((i) => i.id === id));
  await fuelAdminService.removeAlias(id, created.id, { reason: 'cleanup' }, { userId: null }, null);
  const after = await fuelAdminService.getStation(id);
  assert.equal(after.station.name, before.station.name);
});

test('fuel products catalogue includes PMS AGO DPK', async () => {
  const products = await fuelAdminService.listProducts();
  assert.ok(Array.isArray(products.items));
  const codes = products.items.map((p) => p.code);
  assert.ok(codes.includes('pms'));
  assert.ok(codes.includes('ago'));
  assert.ok(codes.includes('dpk'));
});

test('fuel brand catalogue supports independent stations', async () => {
  const brands = await fuelAdminService.listBrandCatalogue({ limit: 50 });
  assert.ok(Array.isArray(brands.items));
  assert.ok(brands.items.some((b) => b.isIndependent || b.code === 'independent'));
});

test('fuel price anomalies are review-only', async () => {
  const anomalies = await fuelAdminService.listPriceAnomalies({ limit: 20 });
  assert.ok(Array.isArray(anomalies.items));
  assert.match(anomalies.note || '', /review|flag|anomal/i);
});

test('fuel dashboard includes intelligence metrics', async () => {
  const dash = await fuelAdminService.dashboard();
  assert.equal(typeof dash.verifiedStations, 'number');
  assert.equal(typeof dash.pendingVerificationStations, 'number');
  assert.equal(typeof dash.unverifiedObservations, 'number');
  assert.equal(typeof dash.priceAnomalies, 'number');
});

test('price history and public station detail include chart points', async () => {
  const list = await fuelAdminService.listStations({ limit: 5 });
  if (!list.items.length) return;
  const id = list.items[0].id;
  const history = await fuelAdminService.priceHistory(id, { fuelType: 'pms', limit: 20 });
  assert.ok(Array.isArray(history.items));
  const { fuelService } = await import('../src/services/fuelService.js');
  const detail = await fuelService.getStation(id, { fuelType: 'pms' });
  assert.ok(detail.station?.id);
  assert.ok(detail.priceHistory);
  assert.ok(Array.isArray(detail.priceHistory.points));
  assert.ok(detail.asOf);
});

test('fuel summary exposes observed range window note', async () => {
  const { fuelRepository } = await import('../src/repositories/fuelRepository.js');
  const summary = await fuelRepository.summary({ fuelType: 'pms', hours: 24 });
  assert.equal(typeof summary.total, 'number');
  assert.ok(summary.byFuelType);
  assert.equal(typeof summary.byFuelType.dpk, 'number');
  if (summary.observedRange) {
    assert.ok(summary.observedRange.min <= summary.observedRange.max);
    assert.match(summary.observedRange.note, /Not a claim of every station/i);
  }
});

test('teardown pool', async () => {
  await closePool();
});
