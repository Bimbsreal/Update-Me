/**
 * Precise location privacy / resolution tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWithinNigeriaBounds,
  isLowAccuracy,
  sanitizeAccuracy,
  MAX_RESOLVE_DISTANCE_KM,
} from '../src/utils/geoBounds.js';
import { nearbyQuerySchema, setUserLocationSchema } from '../src/validators/locations.js';
import { resolveLocationSchema } from '../src/validators/auth.js';
import { userRepository } from '../src/repositories/userRepository.js';

test('Nigeria bounds and accuracy helpers', () => {
  assert.equal(isWithinNigeriaBounds(9.08, 7.4), true);
  assert.equal(isWithinNigeriaBounds(40.7, -74), false);
  assert.equal(sanitizeAccuracy(undefined), null);
  assert.equal(sanitizeAccuracy(-1), null);
  assert.equal(isLowAccuracy(40), false);
  assert.equal(isLowAccuracy(900), true);
  assert.ok(MAX_RESOLVE_DISTANCE_KM >= 20);
});

test('nearby query rejects out-of-bounds coordinates', () => {
  assert.throws(() => nearbyQuerySchema.parse({ lat: 51.5, lng: -0.1 }));
  const ok = nearbyQuerySchema.parse({ lat: 6.5, lng: 3.4, radiusKm: 10 });
  assert.equal(ok.lat, 6.5);
});

test('resolve schema accepts optional accuracy', () => {
  const parsed = resolveLocationSchema.parse({ lat: 6.45, lng: 3.39, accuracy: 25 });
  assert.equal(parsed.accuracy, 25);
  assert.throws(() => resolveLocationSchema.parse({ lat: 0, lng: 0 }));
});

test('setUserLocation requires paired private coords inside Nigeria', () => {
  assert.throws(() =>
    setUserLocationSchema.parse({
      areaId: '00000000-0000-4000-8000-000000000001',
      privateLat: 6.5,
    })
  );
  assert.throws(() =>
    setUserLocationSchema.parse({
      areaId: '00000000-0000-4000-8000-000000000001',
      privateLat: 48.8,
      privateLng: 2.3,
    })
  );
  const ok = setUserLocationSchema.parse({
    areaId: '00000000-0000-4000-8000-000000000001',
    privateLat: 6.5,
    privateLng: 3.4,
    accuracy: 50,
  });
  assert.equal(ok.accuracy, 50);
});

test('publicUser never exposes private_lat/lng', () => {
  const publicShape = userRepository.toPublic({
    id: 'u1',
    display_name: 'Test',
    email: 'a@b.c',
    phone: null,
    onboarding_completed: true,
    is_moderator: false,
    admin_role: null,
    suspended_at: null,
    area_id: 'a1',
    area_name: 'Lekki',
    lga_name: 'Eti-Osa',
    state_name: 'Lagos',
    state_code: 'LA',
    location_id: 'l1',
    private_lat: 6.123456,
    private_lng: 3.654321,
    created_at: new Date().toISOString(),
  });
  const json = JSON.stringify(publicShape);
  assert.equal(json.includes('6.123456'), false);
  assert.equal(json.includes('3.654321'), false);
  assert.equal(publicShape.privateLat, undefined);
  assert.equal(publicShape.currentArea?.name, 'Lekki');
});
