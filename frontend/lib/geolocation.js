/**
 * Browser Geolocation helpers for Update Me.
 * Prefer one-shot getCurrentPosition; use watchPosition only when a feature
 * explicitly needs movement updates (e.g. live Directions tracking).
 */

/** Approximate Nigeria bounding box — reject obviously foreign coordinates. */
export const NIGERIA_BOUNDS = {
  minLat: 4.0,
  maxLat: 14.0,
  minLng: 2.5,
  maxLng: 15.0,
};

export const GEO_STATUS = {
  IDLE: 'idle',
  UNSUPPORTED: 'unsupported',
  INSECURE: 'insecure',
  REQUESTING: 'requesting',
  GRANTED: 'granted',
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
  TIMEOUT: 'timeout',
  ERROR: 'error',
};

export const GEO_MESSAGES = {
  [GEO_STATUS.IDLE]: 'Use my current location',
  [GEO_STATUS.UNSUPPORTED]:
    'Location is not supported on this device. Choose a location manually.',
  [GEO_STATUS.INSECURE]:
    'Location needs a secure connection (HTTPS or localhost). Choose a location manually.',
  [GEO_STATUS.REQUESTING]: 'Getting your location…',
  [GEO_STATUS.GRANTED]: 'Using your current location',
  [GEO_STATUS.DENIED]:
    'Location access is blocked. You can enable it in your browser/device settings.',
  [GEO_STATUS.UNAVAILABLE]: 'Your current location is temporarily unavailable.',
  [GEO_STATUS.TIMEOUT]:
    "We couldn't determine your location. Try again or choose a location manually.",
  [GEO_STATUS.ERROR]:
    "We couldn't determine your location. Try again or choose a location manually.",
};

const DEFAULT_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 12000,
  maximumAge: 120000,
};

/** Metres — readings worse than this are treated as approximate / low-accuracy. */
export const LOW_ACCURACY_METERS = 500;

export function isSecureGeolocationContext(win = typeof globalThis !== 'undefined' ? globalThis.window || globalThis : null) {
  if (!win) return false;
  try {
    if (win.isSecureContext === true) return true;
    const host = win.location?.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

export function isGeolocationSupported(nav = typeof globalThis !== 'undefined' ? globalThis.navigator : null) {
  return Boolean(
    nav?.geolocation &&
      (typeof nav.geolocation.getCurrentPosition === 'function' ||
        typeof nav.geolocation.watchPosition === 'function')
  );
}

export function isWithinNigeriaBounds(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  return (
    la >= NIGERIA_BOUNDS.minLat &&
    la <= NIGERIA_BOUNDS.maxLat &&
    ln >= NIGERIA_BOUNDS.minLng &&
    ln <= NIGERIA_BOUNDS.maxLng
  );
}

export function isAccuracyReliable(accuracyMeters, threshold = LOW_ACCURACY_METERS) {
  if (accuracyMeters == null || !Number.isFinite(Number(accuracyMeters))) return null;
  return Number(accuracyMeters) <= threshold;
}

export function messageForStatus(status) {
  return GEO_MESSAGES[status] || GEO_MESSAGES[GEO_STATUS.ERROR];
}

export function mapGeolocationError(error) {
  if (!error) return GEO_STATUS.ERROR;
  const code = error.code;
  // GeolocationPositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT
  if (code === 1 || code === error.PERMISSION_DENIED) return GEO_STATUS.DENIED;
  if (code === 2 || code === error.POSITION_UNAVAILABLE) return GEO_STATUS.UNAVAILABLE;
  if (code === 3 || code === error.TIMEOUT) return GEO_STATUS.TIMEOUT;
  return GEO_STATUS.ERROR;
}

/**
 * Query Permissions API when available. Never invents a state.
 * @returns {Promise<'prompt'|'granted'|'denied'|'unknown'|'unsupported'>}
 */
export async function queryPermissionState(
  nav = typeof globalThis !== 'undefined' ? globalThis.navigator : null
) {
  if (!isGeolocationSupported(nav)) return 'unsupported';
  if (!nav?.permissions?.query) return 'unknown';
  try {
    const result = await nav.permissions.query({ name: 'geolocation' });
    if (result?.state === 'granted' || result?.state === 'denied' || result?.state === 'prompt') {
      return result.state;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function normalizePosition(position) {
  const coords = position?.coords;
  if (!coords) return null;
  const lat = Number(coords.latitude);
  const lng = Number(coords.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const accuracy =
    coords.accuracy != null && Number.isFinite(Number(coords.accuracy))
      ? Number(coords.accuracy)
      : null;
  return {
    lat,
    lng,
    accuracy,
    lowAccuracy: accuracy != null ? accuracy > LOW_ACCURACY_METERS : null,
    withinNigeria: isWithinNigeriaBounds(lat, lng),
    acquiredAt: position.timestamp || Date.now(),
  };
}

/**
 * One-shot device location. Prefer this for Home / Explore / Report.
 * @returns {Promise<{ ok: true, status: string, position: object } | { ok: false, status: string, message: string, error?: unknown }>}
 */
export function getCurrentPosition(options = {}) {
  const nav = typeof globalThis !== 'undefined' ? globalThis.navigator : null;
  const win = typeof globalThis !== 'undefined' ? globalThis.window || globalThis : null;
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!isGeolocationSupported(nav)) {
    return Promise.resolve({
      ok: false,
      status: GEO_STATUS.UNSUPPORTED,
      message: messageForStatus(GEO_STATUS.UNSUPPORTED),
    });
  }
  if (!isSecureGeolocationContext(win)) {
    return Promise.resolve({
      ok: false,
      status: GEO_STATUS.INSECURE,
      message: messageForStatus(GEO_STATUS.INSECURE),
    });
  }

  return new Promise((resolve) => {
    nav.geolocation.getCurrentPosition(
      (raw) => {
        const position = normalizePosition(raw);
        if (!position) {
          resolve({
            ok: false,
            status: GEO_STATUS.UNAVAILABLE,
            message: messageForStatus(GEO_STATUS.UNAVAILABLE),
          });
          return;
        }
        resolve({
          ok: true,
          status: GEO_STATUS.GRANTED,
          message: messageForStatus(GEO_STATUS.GRANTED),
          position,
        });
      },
      (error) => {
        const status = mapGeolocationError(error);
        resolve({
          ok: false,
          status,
          message: messageForStatus(status),
          error,
        });
      },
      opts
    );
  });
}

/**
 * Continuous tracking — only for features that need movement updates.
 * Caller must call clear() when done.
 */
export function watchPosition(onUpdate, onError, options = {}) {
  const nav = typeof globalThis !== 'undefined' ? globalThis.navigator : null;
  const win = typeof globalThis !== 'undefined' ? globalThis.window || globalThis : null;
  const opts = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 5000,
    ...options,
  };

  if (!isGeolocationSupported(nav) || !isSecureGeolocationContext(win)) {
    const status = !isGeolocationSupported(nav) ? GEO_STATUS.UNSUPPORTED : GEO_STATUS.INSECURE;
    onError?.({ ok: false, status, message: messageForStatus(status) });
    return { clear() {}, watchId: null };
  }

  const watchId = nav.geolocation.watchPosition(
    (raw) => {
      const position = normalizePosition(raw);
      if (!position) {
        onError?.({
          ok: false,
          status: GEO_STATUS.UNAVAILABLE,
          message: messageForStatus(GEO_STATUS.UNAVAILABLE),
        });
        return;
      }
      onUpdate?.({
        ok: true,
        status: GEO_STATUS.GRANTED,
        message: messageForStatus(GEO_STATUS.GRANTED),
        position,
      });
    },
    (error) => {
      const status = mapGeolocationError(error);
      onError?.({ ok: false, status, message: messageForStatus(status), error });
    },
    opts
  );

  return {
    watchId,
    clear() {
      try {
        if (watchId != null) nav.geolocation.clearWatch(watchId);
      } catch {
        /* ignore */
      }
    },
  };
}
