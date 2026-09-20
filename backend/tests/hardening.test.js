/**
 * Production-hardening security checks (local API).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { secureCompare, readAdminSecret } from '../src/lib/secureCompare.js';
import { roleHasPermission } from '../src/config/admin.js';

const API = process.env.API_BASE || 'http://localhost:5000/api/v1';

test('secureCompare rejects mismatched secrets', () => {
  assert.equal(secureCompare('abc', 'abc'), true);
  assert.equal(secureCompare('abc', 'abd'), false);
  assert.equal(secureCompare('abc', 'ab'), false);
  assert.equal(secureCompare('', 'x'), false);
  assert.equal(secureCompare(null, 'x'), false);
});

test('readAdminSecret ignores query tokens in production', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const req = {
    get: () => null,
    query: { adminToken: 'leaked' },
  };
  assert.equal(readAdminSecret(req, ['x-admin-token']), null);
  process.env.NODE_ENV = prev || 'development';
});

test('moderator cannot manage user roles', () => {
  assert.equal(roleHasPermission('moderator', 'users_roles'), false);
  assert.equal(roleHasPermission('super_admin', 'users_roles'), true);
});

test('health live is always ok; ready reflects database', async () => {
  const live = await fetch(`${API}/health/live`);
  assert.equal(live.status, 200);
  const liveBody = await live.json();
  assert.equal(liveBody.status, 'ok');
  assert.ok(live.headers.get('x-request-id'));
  assert.ok(live.headers.get('x-content-type-options') === 'nosniff');

  const ready = await fetch(`${API}/health/ready`);
  assert.ok([200, 503].includes(ready.status));
  const readyBody = await ready.json();
  assert.ok(readyBody.checks?.database);
  assert.equal('name' in (readyBody.checks || {}), false);
  assert.equal('version' in (readyBody || {}), false);
});

test('unauthenticated admin dashboard is denied', async () => {
  const res = await fetch(`${API}/admin/dashboard`);
  assert.equal(res.status, 401);
});

test('FX/Official automation token cannot call /admin dashboard', async () => {
  const token = process.env.FX_ADMIN_TOKEN || process.env.OFFICIAL_ADMIN_TOKEN;
  if (!token) return;
  const res = await fetch(`${API}/admin/dashboard`, {
    headers: {
      'x-fx-admin-token': token,
      'x-official-admin-token': token,
      'x-admin-token': token,
    },
  });
  assert.equal(res.status, 401);
});

test('invalid JSON body returns safe error', async () => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not-json',
  });
  assert.ok(res.status >= 400);
  const text = await res.text();
  assert.doesNotMatch(text, /stack/i);
  assert.doesNotMatch(text, /at Object\./);
});

test('SQL injection style login payload does not crash', async () => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contact: "admin' OR '1'='1",
      password: "' OR '1'='1",
    }),
  });
  assert.ok([400, 401].includes(res.status));
  const body = await res.json();
  assert.equal(body.success, false);
  assert.doesNotMatch(JSON.stringify(body), /password_hash/i);
});

test('realtime health requires authentication', async () => {
  const res = await fetch(`${API}/realtime/health`);
  assert.equal(res.status, 401);
});
