/**
 * Precise-location / Geolocation API unit tests (mocked navigator).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GEO_STATUS,
  getCurrentPosition,
  isAccuracyReliable,
  isGeolocationSupported,
  isSecureGeolocationContext,
  isWithinNigeriaBounds,
  mapGeolocationError,
  messageForStatus,
  watchPosition,
} from './geolocation.js';

test('Nigeria bounds accept Lagos and reject foreign points', () => {
  assert.equal(isWithinNigeriaBounds(6.45, 3.39), true);
  assert.equal(isWithinNigeriaBounds(51.5, -0.12), false);
  assert.equal(isWithinNigeriaBounds(NaN, 3), false);
});

test('accuracy reliability does not invent values', () => {
  assert.equal(isAccuracyReliable(null), null);
  assert.equal(isAccuracyReliable(undefined), null);
  assert.equal(isAccuracyReliable(50), true);
  assert.equal(isAccuracyReliable(2000), false);
});

test('permission error mapping', () => {
  assert.equal(mapGeolocationError({ code: 1 }), GEO_STATUS.DENIED);
  assert.equal(mapGeolocationError({ code: 2 }), GEO_STATUS.UNAVAILABLE);
  assert.equal(mapGeolocationError({ code: 3 }), GEO_STATUS.TIMEOUT);
});

test('user-facing messages are non-technical', () => {
  assert.match(messageForStatus(GEO_STATUS.DENIED), /blocked/i);
  assert.match(messageForStatus(GEO_STATUS.TIMEOUT), /manually/i);
  assert.match(messageForStatus(GEO_STATUS.REQUESTING), /Getting your location/i);
});

test('getCurrentPosition returns unsupported without geolocation', async () => {
  const prev = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: {},
    configurable: true,
  });
  const result = await getCurrentPosition();
  assert.equal(result.ok, false);
  assert.equal(result.status, GEO_STATUS.UNSUPPORTED);
  Object.defineProperty(globalThis, 'navigator', { value: prev, configurable: true });
});

test('getCurrentPosition success path with mock', async () => {
  const prevNav = globalThis.navigator;
  const prevWin = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    value: { isSecureContext: true, location: { hostname: 'localhost' } },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      geolocation: {
        getCurrentPosition(success) {
          success({
            coords: { latitude: 6.5244, longitude: 3.3792, accuracy: 40 },
            timestamp: Date.now(),
          });
        },
      },
    },
    configurable: true,
  });

  const result = await getCurrentPosition();
  assert.equal(result.ok, true);
  assert.equal(result.status, GEO_STATUS.GRANTED);
  assert.equal(result.position.lat, 6.5244);
  assert.equal(result.position.lowAccuracy, false);
  assert.equal(result.position.withinNigeria, true);

  Object.defineProperty(globalThis, 'navigator', { value: prevNav, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: prevWin, configurable: true });
});

test('getCurrentPosition denied path with mock', async () => {
  const prevNav = globalThis.navigator;
  const prevWin = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    value: { isSecureContext: true, location: { hostname: 'localhost' } },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      geolocation: {
        getCurrentPosition(_success, error) {
          error({ code: 1, PERMISSION_DENIED: 1, message: 'denied' });
        },
      },
    },
    configurable: true,
  });

  const result = await getCurrentPosition();
  assert.equal(result.ok, false);
  assert.equal(result.status, GEO_STATUS.DENIED);

  Object.defineProperty(globalThis, 'navigator', { value: prevNav, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: prevWin, configurable: true });
});

test('watchPosition clears watcher', () => {
  const prevNav = globalThis.navigator;
  const prevWin = globalThis.window;
  let cleared = null;
  Object.defineProperty(globalThis, 'window', {
    value: { isSecureContext: true, location: { hostname: 'localhost' } },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      geolocation: {
        getCurrentPosition() {},
        watchPosition() {
          return 42;
        },
        clearWatch(id) {
          cleared = id;
        },
      },
    },
    configurable: true,
  });

  const handle = watchPosition(() => {}, () => {});
  handle.clear();
  assert.equal(cleared, 42);

  Object.defineProperty(globalThis, 'navigator', { value: prevNav, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: prevWin, configurable: true });
});

test('secure context detection', () => {
  assert.equal(isSecureGeolocationContext({ isSecureContext: true }), true);
  assert.equal(
    isSecureGeolocationContext({ isSecureContext: false, location: { hostname: 'localhost' } }),
    true
  );
  assert.equal(
    isSecureGeolocationContext({
      isSecureContext: false,
      location: { hostname: 'example.com' },
    }),
    false
  );
  assert.equal(isGeolocationSupported({ geolocation: { getCurrentPosition() {} } }), true);
});
