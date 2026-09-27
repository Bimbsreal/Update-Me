/**
 * Client-side location source model.
 * Distinguishes device GPS, manual hierarchy selection, and saved areas.
 * Precise coordinates stay in sessionStorage only — never in the service worker cache.
 */

export const LOCATION_SOURCES = {
  DEVICE: 'device',
  MANUAL: 'manual',
  SAVED: 'saved',
};

const STORAGE_KEY = 'um_location_context_v1';

const emptyContext = () => ({
  source: null,
  label: null,
  locationId: null,
  areaId: null,
  lgaId: null,
  /** Public geographic labels only */
  public: {
    name: null,
    lga: null,
    state: null,
    stateCode: null,
  },
  /** Session-only precise coords — never publish */
  privateCoords: null,
  resolvedAt: null,
  lowAccuracy: null,
  unresolved: false,
});

function canUseSessionStorage() {
  try {
    return typeof sessionStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function loadLocationContext() {
  if (!canUseSessionStorage()) return emptyContext();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyContext();
    const parsed = JSON.parse(raw);
    return {
      ...emptyContext(),
      ...parsed,
      public: { ...emptyContext().public, ...(parsed.public || {}) },
    };
  } catch {
    return emptyContext();
  }
}

export function saveLocationContext(ctx) {
  if (!canUseSessionStorage()) return ctx;
  try {
    const safe = {
      source: ctx.source || null,
      label: ctx.label || null,
      locationId: ctx.locationId || null,
      areaId: ctx.areaId || null,
      lgaId: ctx.lgaId || null,
      public: ctx.public || emptyContext().public,
      privateCoords: ctx.privateCoords
        ? {
            lat: ctx.privateCoords.lat,
            lng: ctx.privateCoords.lng,
            accuracy: ctx.privateCoords.accuracy ?? null,
            acquiredAt: ctx.privateCoords.acquiredAt || Date.now(),
          }
        : null,
      resolvedAt: ctx.resolvedAt || null,
      lowAccuracy: ctx.lowAccuracy ?? null,
      unresolved: Boolean(ctx.unresolved),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    return safe;
  } catch {
    return ctx;
  }
}

export function clearPrivateCoords(ctx = loadLocationContext()) {
  return saveLocationContext({ ...ctx, privateCoords: null });
}

export function clearLocationContext() {
  if (!canUseSessionStorage()) return emptyContext();
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return emptyContext();
}

/**
 * Human-readable mode title for Home / Explore chrome.
 * Does not imply GPS when the user selected manually.
 */
export function contextModeTitle(source) {
  if (source === LOCATION_SOURCES.DEVICE) return 'Near You';
  if (source === LOCATION_SOURCES.SAVED) return 'Saved Location';
  if (source === LOCATION_SOURCES.MANUAL) return 'Selected Location';
  return 'Your area';
}

export function buildLabelFromPublic(pub, fallback = '') {
  if (!pub) return fallback;
  const parts = [pub.name, pub.lga, pub.state].filter(Boolean);
  return parts.length ? parts.join(', ') : fallback;
}

/**
 * Apply a selection from LocationSelector / Near Me / saved switcher.
 */
export function applySelection(partial = {}) {
  const prev = loadLocationContext();
  const source =
    partial.source ||
    (partial.privateCoords ? LOCATION_SOURCES.DEVICE : prev.source || LOCATION_SOURCES.MANUAL);

  const next = {
    ...prev,
    source,
    label: partial.label ?? prev.label,
    locationId: partial.locationId ?? prev.locationId,
    areaId: partial.areaId !== undefined ? partial.areaId : prev.areaId,
    lgaId: partial.lgaId !== undefined ? partial.lgaId : prev.lgaId,
    public: {
      ...prev.public,
      ...(partial.public || {}),
      name: partial.public?.name ?? partial.name ?? prev.public?.name,
      lga: partial.public?.lga ?? partial.lga ?? prev.public?.lga,
      state: partial.public?.state ?? partial.state ?? prev.public?.state,
      stateCode: partial.public?.stateCode ?? partial.stateCode ?? prev.public?.stateCode,
    },
    privateCoords:
      partial.privateCoords !== undefined ? partial.privateCoords : prev.privateCoords,
    resolvedAt: Date.now(),
    lowAccuracy: partial.lowAccuracy ?? prev.lowAccuracy,
    unresolved: Boolean(partial.unresolved),
  };

  if (!next.label) {
    next.label = buildLabelFromPublic(next.public, 'Selected area');
  }

  return saveLocationContext(next);
}
