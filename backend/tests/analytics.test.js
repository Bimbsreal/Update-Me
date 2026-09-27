/**
 * Analytics / operational intelligence tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { closePool } from '../src/db/pool.js';
import {
  analyticsService,
  errorFingerprint,
  featureFromPath,
  parseRange,
} from '../src/services/analyticsService.js';
import { metricsService } from '../src/services/metricsService.js';

test('feature path mapping and range parsing', () => {
  assert.equal(featureFromPath('/api/v1/traffic/nearby'), 'traffic');
  assert.equal(featureFromPath('/api/v1/search?q=x'), 'search');
  assert.equal(featureFromPath('/api/v1/admin/dashboard'), 'admin');
  const r = parseRange('7d');
  assert.equal(r.range, '7d');
  assert.ok(r.start < r.end);
  assert.throws(() => parseRange('custom', { from: '2099-01-01', to: '2000-01-01' }));
});

test('error fingerprint redacts secrets and is stable', () => {
  const a = errorFingerprint({
    errorType: 'Error',
    message: 'fail postgres://u:secret@h/db',
    endpoint: '/api/v1/x',
    statusCode: 500,
  });
  const b = errorFingerprint({
    errorType: 'Error',
    message: 'fail postgres://u:secret@h/db',
    endpoint: '/api/v1/x',
    statusCode: 500,
  });
  assert.equal(a, b);
  assert.equal(a.length, 40);
});

test('analytics overview and planes return labeled data modes', async () => {
  const overview = await analyticsService.overview({ range: '7d' });
  assert.equal(overview.plane, 'overview');
  assert.ok(overview.lastUpdated);
  assert.equal(typeof overview.platform.dau, 'number');
  assert.ok(overview.note);

  const product = await analyticsService.productAnalytics({ range: '7d' });
  assert.equal(product.plane, 'product');
  assert.match(product.privacy, /aggregate/i);

  const ops = await analyticsService.operationsAnalytics();
  assert.equal(ops.plane, 'operations');
  assert.ok(ops.api);
  assert.ok(Array.isArray(ops.errors));

  const dq = await analyticsService.dataQualityAnalytics();
  assert.equal(dq.plane, 'data_quality');
  assert.ok(dq.drillDown);

  const traffic = await analyticsService.domainAnalytics('traffic', { range: '7d' });
  assert.equal(traffic.domain, 'traffic');

  const fx = await analyticsService.domainAnalytics('fx', { range: '30d' });
  assert.equal(fx.domain, 'fx');
  assert.match(fx.note || '', /universal/i);
});

test('metrics summary exposes latency percentile shape', async () => {
  for (let i = 0; i < 20; i += 1) {
    metricsService.recordHttpMetric({
      method: 'GET',
      path: '/api/v1/analytics-test',
      status: 200,
      durationMs: 40 + i * 3,
    });
  }
  const summary = await metricsService.getRecentMetricsSummary({ hours: 24 });
  assert.ok(summary.latency);
  assert.equal(typeof summary.latency.sampleSize, 'number');
  if (summary.latency.sampleSize >= 5) {
    assert.ok(summary.latency.p50 != null);
    assert.ok(summary.latency.p95 != null);
  }
});

test('export json and csv respect minimization', async () => {
  const json = await analyticsService.exportReport({ plane: 'overview', range: '7d', format: 'json' });
  assert.match(json.contentType, /json/);
  assert.doesNotMatch(json.body, /password/i);
  const csv = await analyticsService.exportReport({ plane: 'product', range: '7d', format: 'csv' });
  assert.match(csv.contentType, /csv/);
  assert.match(csv.body, /key,value/);
});

test('record feature hit and error group do not throw', async () => {
  await analyticsService.recordFeatureHit('/api/v1/fuel/stations');
  await analyticsService.recordErrorGroup({
    errorType: 'TestError',
    message: 'controlled analytics test Bearer eyJhbGciOi.secret',
    endpoint: '/api/v1/fuel/stations',
    statusCode: 500,
    requestId: 'analytics-test-req-001',
  });
});

test('RBAC separates analytics from security and export', async () => {
  const { roleHasPermission, ADMIN_PERMISSIONS } = await import('../src/config/admin.js');
  assert.equal(roleHasPermission('moderator', ADMIN_PERMISSIONS.analytics), true);
  assert.equal(roleHasPermission('moderator', ADMIN_PERMISSIONS.analytics_security), false);
  assert.equal(roleHasPermission('moderator', ADMIN_PERMISSIONS.analytics_export), false);
  assert.equal(roleHasPermission('data_manager', ADMIN_PERMISSIONS.analytics_export), true);
  assert.equal(roleHasPermission('data_manager', ADMIN_PERMISSIONS.analytics_security), false);
  assert.equal(roleHasPermission('admin', ADMIN_PERMISSIONS.analytics_security), true);
  assert.equal(roleHasPermission('admin', ADMIN_PERMISSIONS.analytics_export), true);
});

test('teardown', async () => {
  await closePool();
});
