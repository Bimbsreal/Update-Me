import { AppError } from '../middleware/errorHandler.js';
import {
  corridorId,
  knowledgeResultId,
  parseCorridorId,
  parseKnowledgeResultId,
  parseTransportResultId,
  transportResultId,
  travelModeLabel,
} from '../config/directions.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { reportRepository } from '../repositories/reportRepository.js';
import { directionsRepository } from '../repositories/directionsRepository.js';
import { transportRepository } from '../repositories/transportRepository.js';
import { getRoutingProvider } from './routing/RoutingProvider.js';
import { reportService } from './reportService.js';
import { trafficService } from './trafficService.js';
import { alertsService } from './alertsService.js';
import { fuelService } from './fuelService.js';
import { transportService } from './transportService.js';

function coordsOf(location) {
  if (location?.coordinates?.lat != null && location?.coordinates?.lng != null) {
    return { lat: Number(location.coordinates.lat), lng: Number(location.coordinates.lng) };
  }
  return null;
}

function haversineKm(a, b) {
  if (!a || !b) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Number((2 * R * Math.asin(Math.min(1, Math.sqrt(h)))).toFixed(2));
}

function mapLocationBrief(location) {
  if (!location) return null;
  return {
    id: location.id,
    name: location.name,
    type: location.type,
    state: location.state || null,
    lga: location.lga || null,
    coordinates: coordsOf(location),
  };
}

function summarizeTraffic(items = []) {
  return items.map((item) => ({
    id: item.id,
    title: item.report?.title || null,
    severity: item.severity,
    roadName: item.road?.name || null,
    locationName: item.location?.name || null,
    freshness: item.report?.freshness || null,
    trustLabels: item.report?.trustLabels || [],
    occurredAt: item.report?.occurredAt || item.report?.createdAt || null,
  }));
}

function summarizeAlerts(items = []) {
  return items.map((item) => ({
    id: item.id,
    title: item.report?.title || null,
    alertCategory: item.alertCategory,
    severity: item.severity,
    roadName: item.road?.name || null,
    locationName: item.location?.name || null,
    freshness: item.report?.freshness || null,
    trustLabels: item.report?.trustLabels || [],
    occurredAt: item.report?.occurredAt || item.report?.createdAt || null,
  }));
}

function summarizeFuel(stations = []) {
  return stations.slice(0, 3).map((station) => ({
    id: station.id,
    name: station.name,
    locationName: station.location?.name || null,
    distanceKm: station.distanceKm ?? null,
  }));
}

async function loadContext(origin, destination, mode) {
  const locationIds = [origin.id, destination.id].filter(Boolean);
  const trafficLists = await Promise.all(
    locationIds.map((locationId) =>
      trafficService
        .list({ locationId, freshness: 'fresh', page: 1, limit: 5 })
        .then((data) => data.items || [])
        .catch(() => [])
    )
  );
  const alertLists = await Promise.all(
    locationIds.map((locationId) =>
      alertsService
        .list({ locationId, freshness: 'fresh', page: 1, limit: 5 })
        .then((data) => data.items || [])
        .catch(() => [])
    )
  );

  let fuelNearby = [];
  if (mode === 'driving') {
    const originCoords = coordsOf(origin);
    if (originCoords) {
      try {
        fuelNearby = await fuelService.nearbyStations({
          lat: originCoords.lat,
          lng: originCoords.lng,
          radiusKm: 5,
          limit: 5,
          freshness: 'any',
        });
      } catch {
        fuelNearby = [];
      }
    }
  }

  const traffic = summarizeTraffic([...trafficLists[0], ...trafficLists[1]]);
  const alerts = summarizeAlerts([...alertLists[0], ...alertLists[1]]);
  // de-dupe by id
  const uniq = (arr) => {
    const seen = new Set();
    return arr.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };

  return {
    traffic: uniq(traffic),
    alerts: uniq(alerts),
    fuelNearby: mode === 'driving' ? summarizeFuel(fuelNearby) : [],
    // Honest: absence of traffic data does NOT mean the route is clear
    trafficNote:
      uniq(traffic).length === 0
        ? 'No recent traffic reports for these locations. This does not mean the roads are clear.'
        : null,
    alertsNote:
      uniq(alerts).length === 0
        ? null
        : 'Alerts are informational and do not automatically block a route.',
  };
}

function buildKnowledgeTitle(input, origin, destination) {
  if (input.title?.trim()) return input.title.trim();
  return `Local tip: ${origin.name} → ${destination.name}`;
}

function buildKnowledgeDescription(input) {
  const parts = [input.instructionSummary.trim()];
  if (input.majorRoads) parts.push(`Roads: ${input.majorRoads.trim()}`);
  if (input.landmarks) parts.push(`Landmarks: ${input.landmarks.trim()}`);
  if (input.boardingHint) parts.push(`Boarding: ${input.boardingHint.trim()}`);
  if (input.notes?.trim()) parts.push(input.notes.trim());
  return parts.join('\n\n');
}

export const directionsService = {
  taxonomy() {
    return {
      modes: [
        { code: 'driving', label: 'Driving' },
        { code: 'public_transport', label: 'Public Transport' },
        { code: 'walking', label: 'Walking' },
      ],
    };
  },

  async search(query) {
    await reportRepository.applyFreshnessTransitions();

    const origin = await locationRepository.findById(query.originLocationId);
    const destination = await locationRepository.findById(query.destinationLocationId);
    if (!origin) throw new AppError('Origin location was not found.', 404, 'ORIGIN_NOT_FOUND');
    if (!destination) {
      throw new AppError('Destination location was not found.', 404, 'DESTINATION_NOT_FOUND');
    }
    if (origin.id === destination.id) {
      throw new AppError('Origin and destination must be different.', 400, 'SAME_LOCATION');
    }

    const mode = query.mode || 'driving';
    const originCoords = coordsOf(origin);
    const destinationCoords = coordsOf(destination);

    const provider = getRoutingProvider();
    const routing = await provider.getRoute({
      origin: { id: origin.id, name: origin.name, ...originCoords },
      destination: { id: destination.id, name: destination.name, ...destinationCoords },
      mode,
    });

    // Estimated straight-line distance only when both coordinates exist — never fabricate travel time
    const estimatedDistanceKm = haversineKm(originCoords, destinationCoords);

    const results = [];

    // Transport corridors (public transport / all modes as related options)
    if (mode === 'public_transport' || mode === 'driving' || mode === 'walking') {
      const transportListed = await transportRepository.listRoutes({
        originLocationId: origin.id,
        destinationLocationId: destination.id,
        page: 1,
        limit: 10,
        freshness: 'any',
      });
      for (const route of transportListed.items || []) {
        const primaryFare = (route.fareSummaries || [])[0] || null;
        results.push({
          id: transportResultId(route.id),
          type: 'transport_corridor',
          title: route.name || `${route.origin?.name} → ${route.destination?.name}`,
          mode: 'public_transport',
          modeLabel: travelModeLabel('public_transport'),
          origin: route.origin,
          destination: route.destination,
          majorRoads: null,
          transport: {
            routeId: route.id,
            primaryMode: route.primaryMode,
            stops: route.stops || [],
            fareSummary: primaryFare
              ? {
                  transportMode: primaryFare.transportMode,
                  fareRange: primaryFare.fareRange || null,
                  freshness: primaryFare.freshness || null,
                }
              : null,
          },
          localKnowledgeAvailable: false,
          estimatedDistanceKm: null,
          routingAvailable: false,
        });
      }
    }

    // Community local knowledge for this pair
    const knowledge = await directionsRepository.listKnowledge({
      originLocationId: origin.id,
      destinationLocationId: destination.id,
      mode,
      freshness: 'any',
      page: 1,
      limit: 20,
    });

    for (const item of knowledge.items || []) {
      results.push({
        id: knowledgeResultId(item.id),
        type: 'local_knowledge',
        title: item.report?.title,
        mode: item.travelMode || mode,
        modeLabel: item.travelModeLabel || travelModeLabel(mode),
        origin: item.origin,
        destination: item.destination,
        majorRoads: item.majorRoads,
        landmarks: item.landmarks,
        boardingHint: item.boardingHint,
        instructionSummary: item.instructionSummary,
        trustLabels: item.report?.trustLabels || [],
        freshness: item.report?.freshness || null,
        knowledgeId: item.id,
        localKnowledgeAvailable: true,
        estimatedDistanceKm: null,
        routingAvailable: false,
      });
    }

    // Mark transport results that have paired knowledge
    const knowledgePairs = new Set(
      (knowledge.items || []).map((k) => `${k.origin?.id}:${k.destination?.id}`)
    );
    for (const result of results) {
      if (result.type === 'transport_corridor') {
        result.localKnowledgeAvailable = knowledgePairs.has(
          `${result.origin?.id}:${result.destination?.id}`
        );
      }
    }

    const context = await loadContext(origin, destination, mode);

    // Corridor summary card when we have any related information or explicit context
    const corridor = {
      id: corridorId(origin.id, destination.id, mode),
      type: 'corridor_context',
      title: `${origin.name} → ${destination.name}`,
      mode,
      modeLabel: travelModeLabel(mode),
      origin: mapLocationBrief(origin),
      destination: mapLocationBrief(destination),
      estimatedDistanceKm,
      // Never invent travel time
      estimatedTravelTimeMinutes: null,
      routingAvailable: Boolean(routing?.available),
      routingMessage: routing?.available
        ? null
        : routing?.message || 'Directions are temporarily unavailable for this route.',
      localKnowledgeCount: knowledge.total || 0,
      transportRouteCount: results.filter((r) => r.type === 'transport_corridor').length,
      hasTrafficUpdates: context.traffic.length > 0,
      hasAlerts: context.alerts.length > 0,
    };

    return {
      origin: mapLocationBrief(origin),
      destination: mapLocationBrief(destination),
      mode,
      modeLabel: travelModeLabel(mode),
      routing: {
        available: Boolean(routing?.available),
        provider: routing?.provider || provider.name,
        message: routing?.available
          ? null
          : routing?.message || 'Directions are temporarily unavailable for this route.',
        route: routing?.route || null,
      },
      estimatedDistanceKm,
      corridor,
      results,
      context,
      empty: {
        noRouting: !routing?.available,
        noTransport: results.every((r) => r.type !== 'transport_corridor'),
        noLocalKnowledge: (knowledge.total || 0) === 0,
        message:
          !routing?.available && results.length === 0
            ? 'Directions are temporarily unavailable for this route.'
            : (knowledge.total || 0) === 0
              ? 'No local directions have been reported for this route yet.'
              : null,
      },
    };
  },

  async getById(id) {
    await reportRepository.applyFreshnessTransitions();

    const knowledgeId = parseKnowledgeResultId(id);
    if (knowledgeId) {
      const knowledge = await directionsRepository.findKnowledgeById(knowledgeId);
      if (!knowledge) throw new AppError('Local knowledge not found.', 404, 'KNOWLEDGE_NOT_FOUND');
      const origin = await locationRepository.findById(knowledge.origin.id);
      const destination = await locationRepository.findById(knowledge.destination.id);
      const context = await loadContext(origin, destination, knowledge.travelMode || 'driving');
      return {
        id,
        type: 'local_knowledge',
        knowledge,
        context,
        routing: {
          available: false,
          provider: getRoutingProvider().name,
          message: 'Community local knowledge is not a turn-by-turn navigation route.',
          route: null,
        },
      };
    }

    const transportId = parseTransportResultId(id);
    if (transportId) {
      const route = await transportService.getRoute(transportId);
      const origin = await locationRepository.findById(route.origin.id);
      const destination = await locationRepository.findById(route.destination.id);
      const context = await loadContext(origin, destination, 'public_transport');
      const knowledge = await directionsRepository.listKnowledge({
        originLocationId: route.origin.id,
        destinationLocationId: route.destination.id,
        freshness: 'any',
        page: 1,
        limit: 10,
      });
      return {
        id,
        type: 'transport_corridor',
        route,
        localKnowledge: knowledge.items || [],
        context,
        routing: {
          available: false,
          provider: getRoutingProvider().name,
          message: 'Transport corridor information from Update Me — not turn-by-turn navigation.',
          route: null,
        },
      };
    }

    const corridor = parseCorridorId(id);
    if (corridor) {
      return this.search({
        originLocationId: corridor.originLocationId,
        destinationLocationId: corridor.destinationLocationId,
        mode: corridor.mode || 'driving',
      });
    }

    throw new AppError('Directions result not found.', 404, 'DIRECTIONS_NOT_FOUND');
  },

  async listLocalKnowledge(query) {
    await reportRepository.applyFreshnessTransitions();
    return directionsRepository.listKnowledge(query);
  },

  async createLocalKnowledge(userId, input) {
    const origin = await locationRepository.findById(input.originLocationId);
    const destination = await locationRepository.findById(input.destinationLocationId);
    if (!origin) throw new AppError('Origin location was not found.', 404, 'ORIGIN_NOT_FOUND');
    if (!destination) {
      throw new AppError('Destination location was not found.', 404, 'DESTINATION_NOT_FOUND');
    }
    if (origin.id === destination.id) {
      throw new AppError('Origin and destination must be different.', 400, 'SAME_LOCATION');
    }

    if (input.transportRouteId) {
      const route = await transportRepository.findRouteById(input.transportRouteId);
      if (!route) {
        throw new AppError('Transport route was not found.', 404, 'ROUTE_NOT_FOUND');
      }
    }

    const title = buildKnowledgeTitle(input, origin, destination);
    const description = buildKnowledgeDescription(input);
    const originCoords = coordsOf(origin);

    const report = await reportService.create(userId, {
      category: 'directions',
      title,
      description,
      locationId: input.originLocationId,
      latitude: originCoords?.lat,
      longitude: originCoords?.lng,
      metadata: {
        module: 'directions',
        destinationLocationId: input.destinationLocationId,
        travelMode: input.travelMode || null,
      },
    });

    const knowledge = await directionsRepository.createKnowledge({
      reportId: report.id,
      originLocationId: input.originLocationId,
      destinationLocationId: input.destinationLocationId,
      travelMode: input.travelMode || null,
      transportRouteId: input.transportRouteId || null,
      majorRoads: input.majorRoads || null,
      landmarks: input.landmarks || null,
      boardingHint: input.boardingHint || null,
      instructionSummary: input.instructionSummary,
    });

    await reportRepository.addHistory({
      reportId: report.id,
      actorUserId: userId,
      eventType: 'system',
      previousState: null,
      newState: {
        knowledgeId: knowledge.id,
        originLocationId: input.originLocationId,
        destinationLocationId: input.destinationLocationId,
      },
      reason: 'Direction local-knowledge details attached',
    });

    return knowledge;
  },

  async confirmKnowledge(userId, id, body) {
    const raw = await directionsRepository.findRawKnowledgeById(id);
    if (!raw) throw new AppError('Local knowledge not found.', 404, 'KNOWLEDGE_NOT_FOUND');
    await reportService.confirm(userId, raw.report_id, body);
    return directionsRepository.findKnowledgeById(id);
  },

  async correctKnowledge(userId, id, body) {
    const raw = await directionsRepository.findRawKnowledgeById(id);
    if (!raw) throw new AppError('Local knowledge not found.', 404, 'KNOWLEDGE_NOT_FOUND');
    await reportService.correct(userId, raw.report_id, body);
    return directionsRepository.findKnowledgeById(id);
  },
};
