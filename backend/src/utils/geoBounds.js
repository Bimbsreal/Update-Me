/**
 * Shared Nigeria geographic bounds for coordinate validation.
 * Soft envelope — rejects clearly non-Nigeria points without inventing places.
 */
export const NIGERIA_BOUNDS = {
  minLat: 4.0,
  maxLat: 14.0,
  minLng: 2.5,
  maxLng: 15.0,
};

/** Max distance (km) when matching GPS to a known area — avoid fabricating distant matches. */
export const MAX_RESOLVE_DISTANCE_KM = 40;

/** Accuracy readings above this (metres) are flagged lowAccuracy. */
export const LOW_ACCURACY_METERS = 500;

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

export function sanitizeAccuracy(accuracy) {
  if (accuracy == null || accuracy === '') return null;
  const n = Number(accuracy);
  if (!Number.isFinite(n) || n < 0 || n > 100000) return null;
  return n;
}

export function isLowAccuracy(accuracyMeters) {
  const n = sanitizeAccuracy(accuracyMeters);
  if (n == null) return null;
  return n > LOW_ACCURACY_METERS;
}
