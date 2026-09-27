/**
 * Location & Address Intelligence tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { closePool, getPool } from '../src/db/pool.js';
import { locationAdminService } from '../src/services/locationAdminService.js';
import { locationService } from '../src/services/locationService.js';
import { geocodingService } from '../src/services/geocoding/geocodingService.js';
import {
  normalizeLocationQuery,
  disambiguationLabel,
} from '../src/config/locationIntelligence.js';
import { AppError } from '../src/middleware/errorHandler.js';

test('normalize aliases VI and road abbreviations', () => {
  assert.match(normalizeLocationQuery('VI Lekki'), /victoria island/);
  assert.match(normalizeLocationQuery('Admiralty Rd'), /admiralty road/);
  assert.equal(
    disambiguationLabel({
      name: 'Chevron Drive',
      area: 'Lekki',
      lga: 'Eti-Osa',
      state: 'Lagos',
    }),
    'Chevron Drive — Lekki · Eti-Osa · Lagos'
  );
});

test('dashboard includes unresolved and verification metrics', async () => {
  const dash = await locationAdminService.dashboard();
  assert.equal(typeof dash.states, 'number');
  assert.equal(typeof dash.lgas, 'number');
  assert.equal(typeof dash.areas, 'number');
  assert.equal(typeof dash.pendingVerification, 'number');
  assert.equal(typeof dash.unresolvedQueries, 'number');
  assert.equal(typeof dash.openConflicts, 'number');
  assert.equal(typeof dash.busStops, 'number');
  assert.ok(dash.states >= 1, 'Nigeria states should be seeded');
});

test('search returns disambiguation context and geocode local provider works', async () => {
  const results = await locationService.search({ q: 'Lagos', limit: 5 });
  assert.ok(Array.isArray(results));
  assert.ok(results.length >= 1);
  assert.ok(results[0].name);
  assert.ok(results[0].label || results[0].subtitle);

  const resolved = await locationService.resolvePlace({ q: 'Lagos' });
  assert.equal(typeof resolved.ambiguous, 'boolean');
  assert.ok(Array.isArray(resolved.candidates));

  const forward = await geocodingService.forward('Lagos');
  assert.equal(forward.provider, 'local');
  assert.ok(Array.isArray(forward.results));

  const health = await geocodingService.health({ hours: 24 });
  assert.equal(health.provider, 'local');
  assert.equal(typeof health.requestCount, 'number');
});

test('unresolved queue enqueue and admin map to alias', async () => {
  const pool = getPool();
  const adminId = (
    await pool.query(
      `INSERT INTO users (display_name, email, password_hash, onboarding_completed, is_moderator, admin_role)
       VALUES ('Loc Intel Admin', $1, 'hash', TRUE, TRUE, 'admin'::admin_role)
       ON CONFLICT (email) DO UPDATE SET admin_role = 'admin'::admin_role
       RETURNING id`,
      [`loc.intel.admin.${Date.now()}@example.com`]
    )
  ).rows[0].id;

  const area = await pool.query(
    `SELECT id, name FROM locations WHERE type = 'area' AND status = 'active' ORDER BY name LIMIT 1`
  );
  assert.ok(area.rows[0], 'Need seeded area');

  const weird = `Behind that big mall near nowhere ${Date.now()}`;
  const unresolved = await locationService.resolvePlace({ q: weird, userId: adminId });
  assert.equal(unresolved.unresolved, true);

  const queue = await locationAdminService.listUnresolved({ status: 'open', q: weird.slice(0, 20) });
  assert.ok(queue.items.some((i) => i.rawQuery.includes('big mall')));

  const item = queue.items.find((i) => i.rawQuery === weird) || queue.items[0];
  const admin = { userId: adminId, role: 'admin' };
  const req = { ip: '127.0.0.1', get: () => 't', requestId: 'loc-intel-1' };

  await locationAdminService.resolveQueueItem(
    item.id,
    {
      status: 'aliased',
      locationId: area.rows[0].id,
      alias: weird.slice(0, 80),
      reason: 'Mapped vague query to known area for search',
    },
    admin,
    req
  );

  const verified = await locationAdminService.setVerification(
    area.rows[0].id,
    { verificationStatus: 'verified', confidence: 'high', reason: 'Admin verified reference area' },
    admin,
    req
  );
  assert.equal(verified.location.verificationStatus, 'verified');
});

test('soft merge preserves source row', async () => {
  const pool = getPool();
  const parent = await pool.query(
    `SELECT id, state_id, lga_id, area_id, country_id FROM locations
     WHERE type = 'area' AND status = 'active' ORDER BY name LIMIT 1`
  );
  assert.ok(parent.rows[0]);

  const admin = { userId: null, role: 'admin' };
  const req = { ip: '127.0.0.1', get: () => 't', requestId: 'merge-loc' };

  const a = await locationAdminService.createChild(
    {
      name: `Merge Place A ${Date.now()}`,
      type: 'place',
      parentId: parent.rows[0].id,
      reason: 'Survivor place',
    },
    admin,
    req
  );
  const b = await locationAdminService.createChild(
    {
      name: `Merge Place B ${Date.now()}`,
      type: 'place',
      parentId: parent.rows[0].id,
      reason: 'Source place',
    },
    admin,
    req
  );

  const merged = await locationAdminService.merge(
    a.id,
    { sourceLocationIds: [b.id], reason: 'Same place — soft merge' },
    admin,
    req
  );
  assert.equal(merged.location.id, a.id);

  const source = await pool.query(
    `SELECT merged_into_location_id, status, verification_status FROM locations WHERE id = $1`,
    [b.id]
  );
  assert.equal(source.rows[0].merged_into_location_id, a.id);
  assert.equal(source.rows[0].status, 'inactive');
  assert.equal(source.rows[0].verification_status, 'deprecated');
});

test('reverse geocode rejects out-of-bounds and resolves Nigeria coords', async () => {
  const out = await geocodingService.reverse({ lat: 51.5, lng: -0.12 });
  assert.equal(out.error, 'OUT_OF_BOUNDS');
  assert.equal(out.results.length, 0);

  const area = await getPool().query(
    `SELECT latitude, longitude FROM locations
     WHERE type = 'area' AND latitude IS NOT NULL AND longitude IS NOT NULL
     LIMIT 1`
  );
  if (area.rows[0]) {
    const rev = await geocodingService.reverse({
      lat: area.rows[0].latitude,
      lng: area.rows[0].longitude,
    });
    assert.equal(rev.provider, 'local');
    assert.ok(Array.isArray(rev.results));
  }
});

test('usage counts include traffic and transport stops columns', async () => {
  const loc = await getPool().query(
    `SELECT id FROM locations WHERE type = 'area' ORDER BY name LIMIT 1`
  );
  assert.ok(loc.rows[0]);
  const { countLocationUsage } = await import('../src/services/locationAdminService.js');
  const usage = await countLocationUsage(loc.rows[0].id);
  assert.equal(typeof usage.trafficEvents, 'number');
  assert.equal(typeof usage.transportStops, 'number');
  assert.equal(typeof usage.directionKnowledge, 'number');
});

test.after(async () => {
  await closePool();
});
