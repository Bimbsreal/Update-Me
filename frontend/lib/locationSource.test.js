/**
 * Location source model tests — public vs private separation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCATION_SOURCES,
  applySelection,
  buildLabelFromPublic,
  clearLocationContext,
  contextModeTitle,
  loadLocationContext,
} from './locationSource.js';

const memory = new Map();

function mockSessionStorage() {
  globalThis.sessionStorage = {
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, String(value));
    },
    removeItem(key) {
      memory.delete(key);
    },
  };
}

test('context mode titles do not imply GPS for manual/saved', () => {
  assert.equal(contextModeTitle(LOCATION_SOURCES.DEVICE), 'Near You');
  assert.equal(contextModeTitle(LOCATION_SOURCES.MANUAL), 'Selected Location');
  assert.equal(contextModeTitle(LOCATION_SOURCES.SAVED), 'Saved Location');
});

test('applySelection stores private coords only for device source', () => {
  mockSessionStorage();
  clearLocationContext();

  const device = applySelection({
    source: LOCATION_SOURCES.DEVICE,
    label: 'Lekki Phase 1, Lagos',
    locationId: 'loc-1',
    areaId: 'area-1',
    public: { name: 'Lekki Phase 1', lga: 'Eti-Osa', state: 'Lagos' },
    privateCoords: { lat: 6.45, lng: 3.47, accuracy: 35 },
  });
  assert.equal(device.source, LOCATION_SOURCES.DEVICE);
  assert.ok(device.privateCoords);
  assert.equal(device.privateCoords.lat, 6.45);

  const manual = applySelection({
    source: LOCATION_SOURCES.MANUAL,
    label: 'Ikeja, Lagos',
    locationId: 'loc-2',
    privateCoords: null,
    public: { name: 'Ikeja', state: 'Lagos' },
  });
  assert.equal(manual.source, LOCATION_SOURCES.MANUAL);
  assert.equal(manual.privateCoords, null);

  const reloaded = loadLocationContext();
  assert.equal(reloaded.source, LOCATION_SOURCES.MANUAL);
  assert.equal(reloaded.privateCoords, null);
});

test('buildLabelFromPublic', () => {
  assert.equal(
    buildLabelFromPublic({ name: 'Lekki', lga: 'Eti-Osa', state: 'Lagos' }),
    'Lekki, Eti-Osa, Lagos'
  );
});
