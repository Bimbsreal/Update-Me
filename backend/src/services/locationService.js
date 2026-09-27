import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { geoRepository, userRepository } from '../repositories/userRepository.js';
import {
  normalizeLocationQuery,
  disambiguationLabel,
  LOCATION_PLACE_KINDS,
} from '../config/locationIntelligence.js';

async function recordSearchMetric({ query, resultCount, ambiguous, unresolved }) {
  const normalized = normalizeLocationQuery(query);
  if (!normalized || normalized.length < 2) return;
  try {
    await getPool().query(
      `INSERT INTO location_search_metrics
         (normalized_query, result_count, was_ambiguous, was_unresolved, hit_count, last_seen_at)
       VALUES ($1, $2, $3, $4, 1, NOW())
       ON CONFLICT (normalized_query) DO UPDATE SET
         result_count = EXCLUDED.result_count,
         was_ambiguous = EXCLUDED.was_ambiguous,
         was_unresolved = EXCLUDED.was_unresolved,
         hit_count = location_search_metrics.hit_count + 1,
         last_seen_at = NOW()`,
      [normalized.slice(0, 240), resultCount, Boolean(ambiguous), Boolean(unresolved)]
    );
  } catch {
    // metrics must not break search
  }
}

async function enqueueUnresolved({ rawQuery, context, lat, lng, userId }) {
  const normalized = normalizeLocationQuery(rawQuery);
  if (!normalized || normalized.length < 2) return null;
  try {
    const result = await getPool().query(
      `INSERT INTO location_resolve_queue
         (raw_query, normalized_query, query_context, latitude, longitude, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (normalized_query) WHERE status = 'open'
       DO UPDATE SET
         hit_count = location_resolve_queue.hit_count + 1,
         updated_at = NOW(),
         query_context = COALESCE(EXCLUDED.query_context, location_resolve_queue.query_context)
       RETURNING id, hit_count`,
      [
        String(rawQuery).trim().slice(0, 240),
        normalized.slice(0, 240),
        context || null,
        lat ?? null,
        lng ?? null,
        userId || null,
      ]
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

function mapResolveResult(row) {
  return {
    locationId: row.locationId || row.id,
    name: row.name,
    type: row.type,
    label: disambiguationLabel({
      name: row.name,
      area: row.area || row.area?.name,
      lga: row.lga || row.lga?.name,
      state: row.state || row.state?.name,
      type: row.type,
    }),
    area: typeof row.area === 'object' ? row.area?.name : row.area,
    lga: typeof row.lga === 'object' ? row.lga?.name : row.lga,
    state: typeof row.state === 'object' ? row.state?.name : row.state,
    coordinates: row.coordinates || null,
    confidence: row.confidence || null,
    verificationStatus: row.verificationStatus || null,
    providerReference: row.providerReference || row.locationId || row.id,
  };
}

export const locationService = {
  vocab() {
    return { placeKinds: LOCATION_PLACE_KINDS };
  },

  async search(query) {
    const results = await locationRepository.search(query);
    const ambiguous = results.length > 1;
    const unresolved = results.length === 0 && query?.q;
    await recordSearchMetric({
      query: query?.q,
      resultCount: results.length,
      ambiguous,
      unresolved,
    });
    if (unresolved) {
      await enqueueUnresolved({
        rawQuery: query.q,
        context: 'locations.search',
      });
    }
    return results.map((r) => ({
      ...r,
      label: disambiguationLabel({
        name: r.name,
        area: r.area?.name,
        lga: r.lga?.name,
        state: r.state?.name,
        type: r.type,
      }),
      subtitle:
        r.subtitle ||
        [r.area?.name, r.lga?.name, r.state?.name].filter(Boolean).join(' · ') ||
        null,
    }));
  },

  nearby: (query) => locationRepository.nearby(query),
  listStates: (country) => locationRepository.listStates(country),
  listLgas: (stateId) => locationRepository.listLgas(stateId),
  listAreas: (lgaId) => locationRepository.listAreas(lgaId),
  capabilities: () => locationRepository.getCapabilities(),

  async getById(id) {
    const location = await locationRepository.findById(id);
    if (!location) throw new AppError('Location not found.', 404, 'LOCATION_NOT_FOUND');
    return location;
  },

  async getBySlugOrId(value) {
    const location = await locationRepository.findBySlugOrId(value);
    if (!location) throw new AppError('Location not found.', 404, 'LOCATION_NOT_FOUND');
    return location;
  },

  /**
   * Place resolution for ambiguous queries ("Where is Chevron?").
   * Never silently guesses when multiple candidates exist.
   */
  async resolvePlace({ q, lat, lng, userId } = {}) {
    const { geocodingService } = await import('./geocoding/geocodingService.js');
    if (!q || String(q).trim().length < 2) {
      throw new AppError('Search query is required.', 400, 'VALIDATION_ERROR');
    }

    const geocoded = await geocodingService.forward(q);
    const candidates = (geocoded.results || []).map(mapResolveResult);

    if (candidates.length === 0 && lat != null && lng != null) {
      const reverse = await geocodingService.reverse({ lat, lng });
      for (const r of reverse.results || []) {
        candidates.push(mapResolveResult(r));
      }
    }

    const ambiguous = candidates.length > 1;
    const unresolved = candidates.length === 0;
    await recordSearchMetric({
      query: q,
      resultCount: candidates.length,
      ambiguous,
      unresolved,
    });

    if (unresolved) {
      await enqueueUnresolved({
        rawQuery: q,
        context: 'locations.resolve',
        lat,
        lng,
        userId,
      });
    }

    return {
      query: q,
      ambiguous,
      unresolved,
      candidates,
      provider: geocoded.provider,
      cached: Boolean(geocoded.cached),
      note: ambiguous
        ? 'Multiple matches — choose a location. The system will not guess silently.'
        : unresolved
          ? 'No match in the location index. Query queued for admin review where appropriate.'
          : null,
      asOf: new Date().toISOString(),
    };
  },

  async geocodeForward(q) {
    const { geocodingService } = await import('./geocoding/geocodingService.js');
    if (!q || String(q).trim().length < 2) {
      throw new AppError('Query is required.', 400, 'VALIDATION_ERROR');
    }
    return geocodingService.forward(q);
  },

  async geocodeReverse({ lat, lng }) {
    const { geocodingService } = await import('./geocoding/geocodingService.js');
    return geocodingService.reverse({ lat, lng });
  },

  async setUserLocation(userId, { locationId, areaId, privateLat, privateLng }) {
    let area = null;
    let location = null;
    let lgaId = null;
    let stateId = null;

    if (locationId) {
      location = await locationRepository.findById(locationId);
      if (!location) throw new AppError('Location not found.', 404, 'LOCATION_NOT_FOUND');
      if (location.status && location.status !== 'active') {
        throw new AppError('Selected location is not active.', 400, 'LOCATION_INACTIVE');
      }

      if (location.type === 'area' && location.area?.id) {
        area = await geoRepository.findAreaById(location.area.id);
        lgaId = area?.lga_id || location.lga?.id || null;
        stateId = area?.state_id || location.state?.id || null;
      } else if (location.type === 'lga' && location.lga?.id) {
        lgaId = location.lga.id;
        stateId = location.state?.id || null;
      } else {
        throw new AppError(
          'Please select an area (neighbourhood) or LGA as your primary location.',
          400,
          'AREA_REQUIRED'
        );
      }
    } else if (areaId) {
      area = await geoRepository.findAreaById(areaId);
      if (!area) throw new AppError('Selected area was not found.', 404, 'AREA_NOT_FOUND');
      location = await locationRepository.findAreaLocationByAreaId(area.id);
      lgaId = area.lga_id;
      stateId = area.state_id;
    }

    if (!area && !lgaId) {
      throw new AppError('Selected area was not found.', 404, 'AREA_NOT_FOUND');
    }

    await getPool().query(
      `UPDATE users
       SET current_area_id = $2,
           current_lga_id = $3,
           current_state_id = $4,
           current_location_id = $5,
           private_lat = COALESCE($6, private_lat),
           private_lng = COALESCE($7, private_lng),
           onboarding_completed = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [
        userId,
        area?.id || null,
        lgaId,
        stateId,
        location?.id || null,
        privateLat ?? null,
        privateLng ?? null,
      ]
    );

    return userRepository.toPublic(await userRepository.findById(userId));
  },
};
