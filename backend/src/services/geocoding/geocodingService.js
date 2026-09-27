/**
 * Geocoding provider abstraction.
 * Default: local DB matching against `locations` (no external network).
 * Optional HTTP providers can be plugged in later without rewriting call sites.
 *
 * Never invent coordinates. Never bypass Nigeria bounds checks upstream.
 */

import { getPool } from '../../db/pool.js';
import { normalizeLocationQuery } from '../../config/locationIntelligence.js';
import { isWithinNigeriaBounds } from '../../utils/geoBounds.js';

const PROVIDER_NAME = process.env.GEOCODING_PROVIDER || 'local';
const CACHE_TTL_HOURS = Number(process.env.GEOCODING_CACHE_TTL_HOURS || 72);

function normalizeQuery(q) {
  return normalizeLocationQuery(q).slice(0, 320);
}

async function logRequest({ provider, requestKind, success, latencyMs, errorCode, cached }) {
  try {
    await getPool().query(
      `INSERT INTO geocode_request_log
         (provider, request_kind, success, latency_ms, error_code, cached)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [provider, requestKind, success, latencyMs ?? null, errorCode || null, Boolean(cached)]
    );
  } catch {
    // Observability must not break geocoding
  }
}

async function readCache(provider, requestKind, queryNormalized) {
  const result = await getPool().query(
    `SELECT * FROM geocode_cache
     WHERE provider = $1 AND request_kind = $2 AND query_normalized = $3
       AND expires_at > NOW()
     LIMIT 1`,
    [provider, requestKind, queryNormalized]
  );
  return result.rows[0] || null;
}

async function writeCache({
  provider,
  requestKind,
  queryNormalized,
  latitude,
  longitude,
  responseJson,
  matchedLocationId,
  confidence,
}) {
  const expires = new Date(Date.now() + CACHE_TTL_HOURS * 3600_000);
  await getPool().query(
    `INSERT INTO geocode_cache (
       provider, request_kind, query_normalized, latitude, longitude,
       response_json, matched_location_id, confidence, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::location_confidence, $9)
     ON CONFLICT (provider, request_kind, query_normalized) DO UPDATE SET
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       response_json = EXCLUDED.response_json,
       matched_location_id = EXCLUDED.matched_location_id,
       confidence = EXCLUDED.confidence,
       expires_at = EXCLUDED.expires_at`,
    [
      provider,
      requestKind,
      queryNormalized,
      latitude ?? null,
      longitude ?? null,
      JSON.stringify(responseJson || {}),
      matchedLocationId || null,
      confidence || null,
      expires,
    ]
  );
}

/**
 * Local provider: resolve against existing Nigerian location index only.
 * Does not call external geocoders and never invents points.
 */
async function localForward(query) {
  const q = normalizeQuery(query);
  if (q.length < 2) {
    return { results: [], provider: 'local', confidence: null };
  }
  const like = `%${q}%`;
  const result = await getPool().query(
    `SELECT loc.id, loc.name, loc.type, loc.latitude, loc.longitude,
            loc.address, loc.street_name, loc.verification_status, loc.confidence,
            s.name AS state_name, l.name AS lga_name, a.name AS area_name
     FROM locations loc
     LEFT JOIN states s ON s.id = loc.state_id
     LEFT JOIN lgas l ON l.id = loc.lga_id
     LEFT JOIN areas a ON a.id = loc.area_id
     WHERE loc.status = 'active'
       AND loc.merged_into_location_id IS NULL
       AND (
         loc.normalized_name ILIKE $1
         OR loc.name ILIKE $1
         OR loc.address_normalized ILIKE $1
         OR loc.street_name ILIKE $1
         OR EXISTS (
           SELECT 1 FROM location_aliases la
           WHERE la.location_id = loc.id
             AND (la.normalized_alias ILIKE $1 OR la.alias ILIKE $1)
         )
       )
     ORDER BY
       CASE loc.type
         WHEN 'area' THEN 1 WHEN 'landmark' THEN 2 WHEN 'place' THEN 3
         WHEN 'road' THEN 4 WHEN 'lga' THEN 5 WHEN 'city' THEN 6
         WHEN 'state' THEN 7 ELSE 9
       END,
       CASE loc.verification_status WHEN 'verified' THEN 0 ELSE 1 END,
       loc.name ASC
     LIMIT 12`,
    [like]
  );

  const results = result.rows.map((r) => ({
    locationId: r.id,
    name: r.name,
    type: r.type,
    address: r.address || null,
    streetName: r.street_name || null,
    area: r.area_name || null,
    lga: r.lga_name || null,
    state: r.state_name || null,
    coordinates:
      r.latitude != null && r.longitude != null
        ? { lat: Number(r.latitude), lng: Number(r.longitude) }
        : null,
    verificationStatus: r.verification_status,
    confidence: r.confidence || 'medium',
    providerReference: r.id,
  }));

  return {
    results,
    provider: 'local',
    confidence: results[0]?.confidence || null,
    ambiguous: results.length > 1,
  };
}

async function localReverse({ lat, lng }) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { results: [], provider: 'local' };
  }
  if (!isWithinNigeriaBounds(latitude, longitude)) {
    return {
      results: [],
      provider: 'local',
      error: 'OUT_OF_BOUNDS',
      message: 'Coordinates are outside Nigeria operational bounds.',
    };
  }

  // Approximate nearby using bounding box then Haversine ordering
  const deg = 0.15; // ~15km
  const result = await getPool().query(
    `SELECT loc.id, loc.name, loc.type, loc.latitude, loc.longitude,
            loc.address, loc.verification_status, loc.confidence,
            s.name AS state_name, l.name AS lga_name, a.name AS area_name,
            (
              6371 * acos(
                LEAST(1.0, GREATEST(-1.0,
                  cos(radians($1)) * cos(radians(loc.latitude))
                  * cos(radians(loc.longitude) - radians($2))
                  + sin(radians($1)) * sin(radians(loc.latitude))
                ))
              )
            ) AS distance_km
     FROM locations loc
     LEFT JOIN states s ON s.id = loc.state_id
     LEFT JOIN lgas l ON l.id = loc.lga_id
     LEFT JOIN areas a ON a.id = loc.area_id
     WHERE loc.status = 'active'
       AND loc.merged_into_location_id IS NULL
       AND loc.latitude IS NOT NULL AND loc.longitude IS NOT NULL
       AND loc.latitude BETWEEN $1 - $3 AND $1 + $3
       AND loc.longitude BETWEEN $2 - $3 AND $2 + $3
     ORDER BY
       CASE loc.type
         WHEN 'area' THEN 0 WHEN 'landmark' THEN 1 WHEN 'place' THEN 2
         WHEN 'road' THEN 3 WHEN 'lga' THEN 4 WHEN 'city' THEN 5
         WHEN 'state' THEN 6 ELSE 9
       END,
       distance_km ASC
     LIMIT 10`,
    [latitude, longitude, deg]
  );

  const results = result.rows.map((r) => ({
    locationId: r.id,
    name: r.name,
    type: r.type,
    address: r.address || null,
    area: r.area_name || null,
    lga: r.lga_name || null,
    state: r.state_name || null,
    coordinates: { lat: Number(r.latitude), lng: Number(r.longitude) },
    distanceKm: Number(Number(r.distance_km).toFixed(2)),
    verificationStatus: r.verification_status,
    confidence: r.confidence || 'medium',
    providerReference: r.id,
  }));

  return { results, provider: 'local', confidence: results[0]?.confidence || null };
}

export const geocodingService = {
  getProviderName() {
    return PROVIDER_NAME;
  },

  async forward(query, { skipCache = false } = {}) {
    const provider = PROVIDER_NAME;
    const queryNormalized = normalizeQuery(query);
    const started = Date.now();

    if (!skipCache && queryNormalized) {
      const cached = await readCache(provider, 'forward', queryNormalized);
      if (cached) {
        await logRequest({
          provider,
          requestKind: 'forward',
          success: true,
          latencyMs: Date.now() - started,
          cached: true,
        });
        return {
          ...(cached.response_json || {}),
          cached: true,
          provider,
          matchedLocationId: cached.matched_location_id,
        };
      }
    }

    try {
      // Only local provider is active by default — no blind external scraping.
      const payload = await localForward(query);
      const top = payload.results?.[0];
      if (queryNormalized) {
        await writeCache({
          provider,
          requestKind: 'forward',
          queryNormalized,
          latitude: top?.coordinates?.lat,
          longitude: top?.coordinates?.lng,
          responseJson: payload,
          matchedLocationId: top?.locationId,
          confidence: payload.confidence,
        });
      }
      await logRequest({
        provider,
        requestKind: 'forward',
        success: true,
        latencyMs: Date.now() - started,
        cached: false,
      });
      return { ...payload, cached: false };
    } catch (err) {
      await logRequest({
        provider,
        requestKind: 'forward',
        success: false,
        latencyMs: Date.now() - started,
        errorCode: err?.code || 'GEOCODE_FAILED',
        cached: false,
      });
      throw err;
    }
  },

  async reverse({ lat, lng }, { skipCache = false } = {}) {
    const provider = PROVIDER_NAME;
    const queryNormalized = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
    const started = Date.now();

    if (!skipCache) {
      const cached = await readCache(provider, 'reverse', queryNormalized);
      if (cached) {
        await logRequest({
          provider,
          requestKind: 'reverse',
          success: true,
          latencyMs: Date.now() - started,
          cached: true,
        });
        return {
          ...(cached.response_json || {}),
          cached: true,
          provider,
          matchedLocationId: cached.matched_location_id,
        };
      }
    }

    try {
      const payload = await localReverse({ lat, lng });
      const top = payload.results?.[0];
      await writeCache({
        provider,
        requestKind: 'reverse',
        queryNormalized,
        latitude: Number(lat),
        longitude: Number(lng),
        responseJson: payload,
        matchedLocationId: top?.locationId,
        confidence: payload.confidence,
      });
      await logRequest({
        provider,
        requestKind: 'reverse',
        success: Boolean(top),
        latencyMs: Date.now() - started,
        cached: false,
        errorCode: payload.error || null,
      });
      return { ...payload, cached: false };
    } catch (err) {
      await logRequest({
        provider,
        requestKind: 'reverse',
        success: false,
        latencyMs: Date.now() - started,
        errorCode: err?.code || 'REVERSE_FAILED',
        cached: false,
      });
      throw err;
    }
  },

  async health({ hours = 24 } = {}) {
    const windowHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
    const pool = getPool();
    const [stats, lastSuccess, lastFailure, cacheSize] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE success)::int AS successes,
           COUNT(*) FILTER (WHERE NOT success)::int AS failures,
           COUNT(*) FILTER (WHERE cached)::int AS cached,
           COALESCE(AVG(latency_ms) FILTER (WHERE success AND NOT cached), 0)::int AS avg_latency_ms
         FROM geocode_request_log
         WHERE created_at >= NOW() - make_interval(hours => $1)`,
        [windowHours]
      ),
      pool.query(
        `SELECT created_at, provider FROM geocode_request_log
         WHERE success = TRUE ORDER BY created_at DESC LIMIT 1`
      ),
      pool.query(
        `SELECT created_at, provider, error_code FROM geocode_request_log
         WHERE success = FALSE ORDER BY created_at DESC LIMIT 1`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM geocode_cache WHERE expires_at > NOW()`
      ),
    ]);
    const row = stats.rows[0] || {};
    const total = row.total || 0;
    return {
      provider: PROVIDER_NAME,
      windowHours,
      requestCount: total,
      successCount: row.successes || 0,
      failureCount: row.failures || 0,
      cachedCount: row.cached || 0,
      successRate: total ? Number(((row.successes || 0) / total).toFixed(3)) : null,
      avgLatencyMs: row.avg_latency_ms || 0,
      activeCacheEntries: cacheSize.rows[0]?.c || 0,
      lastSuccessAt: lastSuccess.rows[0]?.created_at || null,
      lastFailureAt: lastFailure.rows[0]?.created_at || null,
      lastFailureCode: lastFailure.rows[0]?.error_code || null,
      note: 'Provider secrets are never exposed. Local provider uses the locations index only.',
    };
  },
};

export default geocodingService;
