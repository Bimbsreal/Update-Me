import { locationsApi } from '@/lib/api';

/**
 * Resolve device coordinates to a public Nigeria location without exposing GPS publicly.
 * Uses existing /locations/nearby — returns privacy-safe place metadata only.
 */
export async function resolveDeviceToPublicLocation(position, { radiusKm = 25, limit = 8 } = {}) {
  const data = await locationsApi.nearby(position.lat, position.lng, {
    type: 'area',
    radiusKm,
    limit,
  });
  let first = (data.results || [])[0];
  if (!first) {
    for (const type of ['city', 'lga', 'place']) {
      const broader = await locationsApi.nearby(position.lat, position.lng, {
        type,
        radiusKm: Math.max(radiusKm, 40),
        limit,
      });
      first = (broader.results || [])[0];
      if (first) break;
    }
  }
  if (!first) {
    return {
      resolved: false,
      privateCoords: {
        lat: position.lat,
        lng: position.lng,
        accuracy: position.accuracy ?? null,
        acquiredAt: position.acquiredAt || Date.now(),
      },
      lowAccuracy: position.lowAccuracy,
    };
  }

  const subtitleParts = String(first.subtitle || '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    resolved: true,
    locationId: first.id,
    areaId: first.area?.id || null,
    lgaId: first.lga?.id || null,
    label: first.subtitle ? `${first.name} · ${first.subtitle}` : first.name,
    public: {
      name: first.name,
      lga: first.lga?.name || subtitleParts[0] || null,
      state: first.state?.name || subtitleParts[1] || null,
      stateCode: first.state?.code || null,
    },
    /** Place centroid only — never the user's GPS */
    placeCoordinates: first.coordinates || null,
    distanceKm: first.distanceKm ?? first.distance_km ?? null,
    privateCoords: {
      lat: position.lat,
      lng: position.lng,
      accuracy: position.accuracy ?? null,
      acquiredAt: position.acquiredAt || Date.now(),
    },
    lowAccuracy: position.lowAccuracy,
    type: first.type,
  };
}
