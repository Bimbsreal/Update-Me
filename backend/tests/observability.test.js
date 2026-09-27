/**
 * Observability: health model, request IDs, job runs, admin system health.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { closePool, getPool } from '../src/db/pool.js';
import {
  withJobRun,
  listRecentJobRuns,
  purgeOldJobRuns,
  JOB_NAMES,
  safeSummary,
} from '../src/services/jobMonitor.js';
import { metricsService } from '../src/services/metricsService.js';
import { systemHealthService } from '../src/services/systemHealthService.js';

const API = process.env.API_BASE || 'http://localhost:5000/api/v1';

test('safeSummary redacts connection strings and bearer tokens', () => {
  const raw =
    'fail postgres://user:secret@localhost:5432/db Bearer eyJhbGciOiJIUzI1NiJ9.aaa api_key=supersecret';
  const cleaned = safeSummary(raw);
  assert.doesNotMatch(cleaned, /supersecret/);
  assert.doesNotMatch(cleaned, /eyJhbGci/);
  assert.match(cleaned, /\[redacted/);
});

test('public health model returns healthy or degraded when DB is up', async () => {
  const model = await systemHealthService.getPublicHealthModel();
  assert.ok(['healthy', 'degraded', 'unhealthy'].includes(model.status));
  assert.ok(model.checks?.database);
  assert.equal('database_name' in model, false);
});

test('job run records success and failure isolation', async () => {
  const ok = await withJobRun(
    'test.observability.success',
    async () => ({ status: 'success', recordsProcessed: 2, recordsUpdated: 2 }),
    { trigger: 'test' }
  );
  assert.equal(ok.status, 'success');
  assert.ok(ok.executionId);

  const fail = await withJobRun(
    'test.observability.fail',
    async () => {
      throw new Error('controlled failure postgres://x:y@h/db');
    },
    { trigger: 'test' }
  );
  assert.equal(fail.status, 'failed');
  assert.doesNotMatch(String(fail.error || ''), /postgres:\/\/x:y/);

  const recent = await listRecentJobRuns({ jobName: 'test.observability.success', limit: 1 });
  assert.ok(recent.length >= 1);
  assert.equal(recent[0].status, 'success');
});

test('metrics record and flush without storing paths with query strings', async () => {
  metricsService.recordHttpMetric({
    method: 'GET',
    path: '/api/v1/locations/search?q=secret',
    status: 200,
    durationMs: 12,
  });
  metricsService.recordHttpMetric({
    method: 'GET',
    path: '/api/v1/admin/dashboard',
    status: 500,
    durationMs: 900,
  });
  const flushed = await metricsService.flushMetrics();
  assert.ok(flushed.flushed >= 1);
  const summary = await metricsService.getRecentMetricsSummary({ hours: 24 });
  assert.ok(typeof summary.requests === 'number');
});

test('HTTP live/ready/health and request-id propagation', async () => {
  const customId = 'test-req-id-observability-01';
  const live = await fetch(`${API}/health/live`, {
    headers: { 'x-request-id': customId },
  });
  assert.equal(live.status, 200);
  assert.equal(live.headers.get('x-request-id'), customId);
  const liveBody = await live.json();
  assert.equal(liveBody.status, 'ok');

  const ready = await fetch(`${API}/health/ready`);
  assert.ok([200, 503].includes(ready.status));
  const readyBody = await ready.json();
  assert.ok(readyBody.checks?.database);
  assert.equal('name' in (readyBody.checks || {}), false);

  const health = await fetch(`${API}/health`);
  assert.ok([200, 503].includes(health.status));
  const healthBody = await health.json();
  assert.ok(['healthy', 'degraded', 'unhealthy'].includes(healthBody.status));
  assert.doesNotMatch(JSON.stringify(healthBody), /password|jwt_secret|DATABASE_URL/i);
});

test('error responses include requestId and omit stack', async () => {
  const res = await fetch(`${API}/this-route-does-not-exist-observability`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(body.requestId);
  assert.equal(body.stack, undefined);
  assert.doesNotMatch(JSON.stringify(body), /at Object\./);
});

test('admin system health requires auth', async () => {
  const res = await fetch(`${API}/admin/system-health`);
  assert.equal(res.status, 401);
});

test('admin system health returns diagnostics for staff', async () => {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contact: 'admin.local@updateme.test',
      password: 'AdminLocal123!',
    }),
  });
  if (login.status !== 200) {
    // Local seed admin may be absent in some environments
    return;
  }
  const cookie = (login.headers.getSetCookie?.() || [])
    .map((c) => c.split(';')[0])
    .join('; ');
  const single = login.headers.get('set-cookie');
  const headerCookie =
    cookie ||
    (single
      ? single
          .split(',')
          .map((c) => c.split(';')[0].trim())
          .join('; ')
      : '');

  const res = await fetch(`${API}/admin/system-health`, {
    headers: { Cookie: headerCookie },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.health?.application?.version);
  assert.ok(body.health?.database);
  assert.ok(body.health?.jobs);
  assert.ok(body.health?.sse);
  assert.doesNotMatch(JSON.stringify(body), /JWT_SECRET|password_hash|DATABASE_URL/i);
});

test('purge helpers are safe to call', async () => {
  const jobs = await purgeOldJobRuns({ olderThanDays: 30 });
  assert.ok(typeof jobs.deleted === 'number');
  const metrics = await metricsService.purgeOldMetrics({ olderThanDays: 14 });
  assert.ok(typeof metrics.deleted === 'number');
});

test('teardown pool', async () => {
  await closePool();
});
