import { AppError } from '../middleware/errorHandler.js';
import { transportModeLabel } from '../config/transport.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { reportRepository } from '../repositories/reportRepository.js';
import { transportRepository } from '../repositories/transportRepository.js';
import { officialService } from './officialService.js';
import { reportService } from './reportService.js';
import { trafficService } from './trafficService.js';
import { realtimePublisher } from '../realtime/publisher.js';

function formatFare(amount) {
  if (amount == null) return null;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

function routeLabel(route) {
  return route?.name || `${route?.origin?.name || 'Origin'} → ${route?.destination?.name || 'Destination'}`;
}

function buildTitle(input, route) {
  if (input.title?.trim()) return input.title.trim();
  const mode = transportModeLabel(input.transportMode);
  return `${routeLabel(route)} · ${mode} · ${formatFare(input.fareAmount)}`;
}

function buildDescription(input, route) {
  if (input.notes?.trim()) return input.notes.trim();
  const parts = [
    `Route: ${routeLabel(route)}`,
    `Mode: ${transportModeLabel(input.transportMode)}`,
    `Fare: ${formatFare(input.fareAmount)}`,
  ];
  if (input.boardingPointLabel) parts.push(`Board: ${input.boardingPointLabel}`);
  if (input.alightingPointLabel) parts.push(`Alight: ${input.alightingPointLabel}`);
  parts.push('Community fare update. Confirm if this still matches what you paid.');
  return parts.join('. ');
}

async function resolveLocation(locationId, label) {
  const location = await locationRepository.findById(locationId);
  if (!location) {
    throw new AppError(`${label} location was not found.`, 404, 'LOCATION_NOT_FOUND');
  }
  return location;
}

export const transportService = {
  async createRoute(userId, input) {
    await resolveLocation(input.originLocationId, 'Origin');
    await resolveLocation(input.destinationLocationId, 'Destination');

    const existing = await transportRepository.findRouteRawByEnds(
      input.originLocationId,
      input.destinationLocationId
    );
    if (existing) {
      throw new AppError(
        'A transport route already exists between these locations.',
        409,
        'ROUTE_DUPLICATE'
      );
    }

    return transportRepository.createRoute({
      name: input.name,
      originLocationId: input.originLocationId,
      destinationLocationId: input.destinationLocationId,
      primaryMode: input.primaryMode,
      stops: input.stops,
      createdBy: userId,
    });
  },

  async listRoutes(query) {
    await reportRepository.applyFreshnessTransitions();
    return transportRepository.listRoutes(query);
  },

  async search(query) {
    await reportRepository.applyFreshnessTransitions();
    await resolveLocation(query.originLocationId, 'Origin');
    await resolveLocation(query.destinationLocationId, 'Destination');
    const routes = await transportRepository.searchRoutes(query);

    // Attach nearby traffic for origin (supported Traffic module only — no invented ETAs)
    const trafficByRoute = await Promise.all(
      routes.map(async (route) => {
        const locationId = route.origin?.id;
        if (!locationId) return { routeId: route.id, traffic: [] };
        try {
          const traffic = await trafficService.list({
            locationId,
            freshness: 'fresh',
            page: 1,
            limit: 3,
          });
          return { routeId: route.id, traffic: traffic.items || [] };
        } catch {
          return { routeId: route.id, traffic: [] };
        }
      })
    );
    const trafficMap = new Map(trafficByRoute.map((t) => [t.routeId, t.traffic]));

    return routes.map((route) => ({
      ...route,
      relatedTraffic: (trafficMap.get(route.id) || []).map((item) => ({
        id: item.id,
        title: item.report?.title || null,
        severity: item.severity,
        locationName: item.location?.name || item.road?.name || null,
        freshness: item.report?.freshness || null,
      })),
    }));
  },

  async getRoute(id) {
    await reportRepository.applyFreshnessTransitions();
    const route = await transportRepository.findRouteById(id);
    if (!route || !route.isActive) {
      throw new AppError('Transport route not found.', 404, 'ROUTE_NOT_FOUND');
    }

    const [fares, fareRanges, official, trafficOrigin, trafficDest] = await Promise.all([
      transportRepository.listFares({
        routeId: id,
        freshness: 'any',
        page: 1,
        limit: 25,
      }),
      transportRepository.fareRangeForRoute(id, { freshness: 'fresh' }),
      officialService
        .list({ category: 'transport', page: 1, limit: 5 })
        .catch(() => ({ items: [] })),
      route.origin?.id
        ? trafficService
            .list({ locationId: route.origin.id, freshness: 'fresh', page: 1, limit: 5 })
            .catch(() => ({ items: [] }))
        : Promise.resolve({ items: [] }),
      route.destination?.id
        ? trafficService
            .list({ locationId: route.destination.id, freshness: 'fresh', page: 1, limit: 5 })
            .catch(() => ({ items: [] }))
        : Promise.resolve({ items: [] }),
    ]);

    const trafficItems = [...(trafficOrigin.items || []), ...(trafficDest.items || [])];
    const seen = new Set();
    const relatedTraffic = trafficItems.filter((item) => {
      const key = item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      route,
      recentFares: fares.items,
      fareRanges,
      relatedTraffic,
      officialUpdates: (official.items || []).filter((item) => item.isOfficial),
    };
  },

  async createFare(userId, input) {
    let route = null;
    if (input.routeId) {
      route = await transportRepository.findRouteById(input.routeId);
      if (!route) throw new AppError('Transport route not found.', 404, 'ROUTE_NOT_FOUND');
    } else if (input.newRoute) {
      const existing = await transportRepository.findRouteRawByEnds(
        input.newRoute.originLocationId,
        input.newRoute.destinationLocationId
      );
      if (existing) {
        route = await transportRepository.findRouteById(existing.id);
      } else {
        route = await this.createRoute(userId, {
          ...input.newRoute,
          primaryMode: input.newRoute.primaryMode || input.transportMode,
        });
      }
    } else {
      throw new AppError('Select a route or provide origin and destination.', 400, 'ROUTE_REQUIRED');
    }

    const originLocationId = input.originLocationId || route.origin.id;
    const destinationLocationId = input.destinationLocationId || route.destination.id;
    await resolveLocation(originLocationId, 'Origin');
    await resolveLocation(destinationLocationId, 'Destination');

    const duplicate = await transportRepository.findRecentDuplicateFare({
      userId,
      routeId: route.id,
      transportMode: input.transportMode,
      withinMinutes: 60,
    });
    if (duplicate) {
      throw new AppError(
        'You already reported a fare for this route and mode recently.',
        409,
        'FARE_DUPLICATE'
      );
    }

    const title = buildTitle(input, route);
    const description = buildDescription(input, route);
    const coords = route.origin?.coordinates || {};

    const report = await reportService.create(userId, {
      category: 'transport',
      title,
      description,
      locationId: originLocationId,
      latitude: coords.lat ?? null,
      longitude: coords.lng ?? null,
      metadata: {
        module: 'transport',
        transportMode: input.transportMode,
        routeId: route.id,
        fareAmount: input.fareAmount,
      },
    });

    if (report.sourceType === 'official') {
      throw new AppError('Invalid report source.', 400, 'INVALID_SOURCE');
    }

    const fare = await transportRepository.createFareReport({
      reportId: report.id,
      routeId: route.id,
      transportMode: input.transportMode,
      originLocationId,
      destinationLocationId,
      fareAmount: input.fareAmount,
      fareCurrency: input.fareCurrency || 'NGN',
      fareUnit: input.fareUnit || 'trip',
      boardingPointLabel: input.boardingPointLabel,
      alightingPointLabel: input.alightingPointLabel,
    });

    await reportRepository.addHistory({
      reportId: report.id,
      actorUserId: userId,
      eventType: 'system',
      previousState: null,
      newState: {
        fareId: fare.id,
        routeId: route.id,
        transportMode: input.transportMode,
        fareAmount: input.fareAmount,
      },
      reason: 'Transport fare details attached',
    });

    realtimePublisher.transportUpdated(fare);

    return fare;
  },

  async listFares(query) {
    await reportRepository.applyFreshnessTransitions();
    return transportRepository.listFares(query);
  },

  async getFare(id, viewerUserId = null) {
    await reportRepository.applyFreshnessTransitions();
    const fare = await transportRepository.findFareById(id);
    if (!fare) throw new AppError('Fare report not found.', 404, 'FARE_NOT_FOUND');
    if (fare.report.status === 'removed' && fare.report.author?.id !== viewerUserId) {
      throw new AppError('Fare report not found.', 404, 'FARE_NOT_FOUND');
    }
    return fare;
  },

  async confirm(userId, id, body) {
    const raw = await transportRepository.findRawFareById(id);
    if (!raw) throw new AppError('Fare report not found.', 404, 'FARE_NOT_FOUND');
    await reportService.confirm(userId, raw.report_id, body);
    return this.getFare(id, userId);
  },

  async correct(userId, id, body) {
    const raw = await transportRepository.findRawFareById(id);
    if (!raw) throw new AppError('Fare report not found.', 404, 'FARE_NOT_FOUND');
    await reportService.correct(userId, raw.report_id, body);
    return this.getFare(id, userId);
  },

  async history(id) {
    const raw = await transportRepository.findRawFareById(id);
    if (!raw) throw new AppError('Fare report not found.', 404, 'FARE_NOT_FOUND');
    return reportService.history(raw.report_id);
  },

  async summary(query) {
    await reportRepository.applyFreshnessTransitions();
    return transportRepository.summary(query);
  },
};
