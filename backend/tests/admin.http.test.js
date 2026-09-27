/**
 * HTTP-level admin authorization checks against local API.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.API_BASE || 'http://localhost:5000/api/v1';

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() || [];
  if (raw.length) {
    return raw.map((c) => c.split(';')[0]).join('; ');
  }
  const single = res.headers.get('set-cookie');
  return single ? single.split(',').map((c) => c.split(';')[0].trim()).join('; ') : '';
}

async function login(contact, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact, password }),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data, cookie: cookieFrom(res) };
}

test('unauthenticated admin dashboard is denied', async () => {
  const res = await fetch(`${API}/admin/dashboard`);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.success, false);
});

test('ordinary user cannot call admin APIs', async () => {
  const email = `ordinary.admin.deny.${Date.now()}@example.com`;
  const password = 'OrdinaryUser123!';
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Ordinary Deny',
      contact: email,
      password,
      confirmPassword: password,
    }),
  });
  const regBody = await reg.json().catch(() => ({}));
  assert.ok(reg.status === 201 || reg.status === 200, regBody.message || `register ${reg.status}`);
  const cookie = cookieFrom(reg);
  assert.ok(cookie, 'expected session cookie');

  const dash = await fetch(`${API}/admin/dashboard`, {
    headers: { Cookie: cookie },
  });
  assert.equal(dash.status, 403);
  const body = await dash.json();
  assert.equal(body.success, false);
});

test('authorized admin can access dashboard', async () => {
  const { res, data, cookie } = await login('admin.local@updateme.test', 'AdminLocal123!');
  assert.equal(res.status, 200, data.message || JSON.stringify(data));
  assert.ok(data.user?.adminRole === 'super_admin' || data.user?.isModerator);
  const dash = await fetch(`${API}/admin/dashboard`, {
    headers: { Cookie: cookie },
  });
  assert.equal(dash.status, 200);
  const body = await dash.json();
  assert.equal(body.success, true);
  assert.equal(typeof body.dashboard.reportsAwaitingReview, 'number');
});

test('authorized admin can access moderation center APIs', async () => {
  const { res, data, cookie } = await login('admin.local@updateme.test', 'AdminLocal123!');
  assert.equal(res.status, 200, data.message || JSON.stringify(data));

  const metrics = await fetch(`${API}/admin/moderation/metrics`, {
    headers: { Cookie: cookie },
  });
  assert.equal(metrics.status, 200);
  const metricsBody = await metrics.json();
  assert.equal(typeof metricsBody.metrics?.pending, 'number');

  const queue = await fetch(`${API}/admin/moderation?view=attention&limit=10`, {
    headers: { Cookie: cookie },
  });
  assert.equal(queue.status, 200);
  const queueBody = await queue.json();
  assert.ok(Array.isArray(queueBody.items));
  assert.ok(Array.isArray(queueBody.reasons));
});

test('authorized super admin can access roles and invitations', async () => {
  const { res, data, cookie } = await login('admin.local@updateme.test', 'AdminLocal123!');
  assert.equal(res.status, 200, data.message || JSON.stringify(data));

  const roles = await fetch(`${API}/admin/roles`, { headers: { Cookie: cookie } });
  assert.equal(roles.status, 200);
  const rolesBody = await roles.json();
  assert.equal(rolesBody.editable, false);
  assert.ok(Array.isArray(rolesBody.roles));

  const staff = await fetch(`${API}/admin/users?staffOnly=true&limit=5`, {
    headers: { Cookie: cookie },
  });
  assert.equal(staff.status, 200);
  const staffBody = await staff.json();
  assert.ok(Array.isArray(staffBody.items));
});

test('ordinary user cannot call moderation action', async () => {
  const email = `ordinary.mod.deny.${Date.now()}@example.com`;
  const password = 'OrdinaryUser123!';
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Ordinary Mod Deny',
      contact: email,
      password,
      confirmPassword: password,
    }),
  });
  assert.ok(reg.status === 201 || reg.status === 200);
  const cookie = cookieFrom(reg);

  const action = await fetch(`${API}/admin/moderation/report:00000000-0000-4000-8000-000000000001/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ action: 'approve', reason: 'Should be forbidden' }),
  });
  assert.equal(action.status, 403);
});
