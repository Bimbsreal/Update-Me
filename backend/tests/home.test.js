/**
 * Personalized Home Intelligence tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { homeService } from '../src/services/homeService.js';
import { AppError } from '../src/middleware/errorHandler.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const area = await pool.query(
    `SELECT a.id AS area_id, loc.id AS location_id, a.lga_id, a.state_id
     FROM areas a
     JOIN locations loc ON loc.type = 'area' AND loc.area_id = a.id
     WHERE loc.latitude IS NOT NULL
     ORDER BY a.name
     LIMIT 1`
  );
  assert.ok(area.rows[0], 'Need seeded area location');
  const created = await pool.query(
    `INSERT INTO users (
       display_name, email, password_hash, onboarding_completed,
       current_area_id, current_lga_id, current_state_id, current_location_id
     ) VALUES ($1,$2,$3,TRUE,$4,$5,$6,$7)
     RETURNING id`,
    [
      'Home Tester',
      email,
      'test-hash',
      area.rows[0].area_id,
      area.rows[0].lga_id,
      area.rows[0].state_id,
      area.rows[0].location_id,
    ]
  );
  return created.rows[0].id;
}

test('home rejects missing user', async () => {
  await assert.rejects(
    () => homeService.getHome('00000000-0000-0000-0000-000000000000'),
    (err) => err instanceof AppError && err.status === 404
  );
});

test('authenticated home returns composed sections for current area', async () => {
  const userId = await ensureUser(`home-tester-${Date.now()}@example.com`);
  const home = await homeService.getHome(userId);

  assert.ok(home.location);
  assert.ok(home.location.label);
  assert.ok(home.traffic);
  assert.ok(Array.isArray(home.traffic.items));
  assert.ok(home.safety);
  assert.ok(home.fuel);
  assert.ok(home.transport);
  assert.ok(home.prices);
  assert.ok(home.official);
  assert.ok(home.recentChanges);
  assert.ok(home.routes);
  assert.ok(home.meta);
  assert.equal(typeof home.meta.empty, 'boolean');
  assert.ok(home.meta.reportPath.includes('/app/report'));

  // Primary sections should not include expired traffic items
  for (const item of home.traffic.items) {
    assert.notEqual(item.freshness, 'expired');
  }
  for (const item of home.safety.items) {
    assert.notEqual(item.freshness, 'expired');
  }
});

test('saved area must belong to the authenticated user', async () => {
  const userId = await ensureUser(`home-owner-${Date.now()}@example.com`);
  await assert.rejects(
    () =>
      homeService.getHome(userId, {
        savedAreaId: '00000000-0000-0000-0000-000000000099',
      }),
    (err) => err instanceof AppError && err.status === 404
  );
});

test('home does not invent traffic or alerts', async () => {
  const userId = await ensureUser(`home-emptyish-${Date.now()}@example.com`);
  const home = await homeService.getHome(userId);
  assert.ok(Array.isArray(home.traffic.items));
  assert.ok(home.traffic.emptyMessage);
  assert.ok(home.safety.emptyMessage);
  // Official vs community stay distinct when present
  for (const item of home.official.items) {
    assert.equal(item.sourceType, 'official');
    assert.equal(item.informationType, 'official');
  }
});

test('home empty location marks empty meta and skips fabricated sections', async () => {
  const pool = getPool();
  const email = `home-noloc-${Date.now()}@example.com`;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,FALSE)
     RETURNING id`,
    ['No Loc', email, 'test-hash']
  );
  const home = await homeService.getHome(created.rows[0].id);
  assert.equal(home.meta.empty, true);
  assert.equal(home.traffic.items.length, 0);
  assert.equal(home.safety.items.length, 0);
  assert.equal(home.fuel.items.length, 0);
  assert.ok(!home.location.location || !home.location.location.id);
});

test('home traffic cards dedupe same road+severity', async () => {
  const userId = await ensureUser(`home-dedupe-${Date.now()}@example.com`);
  const home = await homeService.getHome(userId);
  const keys = home.traffic.items.map(
    (item) => `${item.roadName || item.locationName}:${item.severity}`.toLowerCase()
  );
  assert.equal(keys.length, new Set(keys).size);
});

const API = process.env.API_BASE || 'http://localhost:5000/api/v1';

test('HTTP GET /home requires authentication', async () => {
  const res = await fetch(`${API}/home`);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.success, false);
});

test('HTTP GET /home returns composed payload for session cookie', async () => {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contact: 'admin.local@updateme.test',
      password: 'Password123!',
    }),
  });
  if (login.status !== 200) {
    // Local seed account may be absent in some environments
    return;
  }
  const raw = login.headers.getSetCookie?.() || [];
  const cookie = raw.length
    ? raw.map((c) => c.split(';')[0]).join('; ')
    : (login.headers.get('set-cookie') || '').split(',')[0]?.split(';')[0] || '';
  assert.ok(cookie, 'expected session cookie');

  const res = await fetch(`${API}/home`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.home?.location);
  assert.ok(data.home?.traffic);
  assert.ok(Array.isArray(data.home.traffic.items));
});

test.after(async () => {
  await closePool();
});
