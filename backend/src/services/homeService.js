/**
 * Personalized Home Intelligence — composes existing services.
 * Location-aware dashboard payload. No AI ranking. No duplicate data stores.
 */

import { AppError } from '../middleware/errorHandler.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { savedPlacesRepository } from '../repositories/savedPlacesRepository.js';
import { trafficService } from './trafficService.js';
import { alertsService } from './alertsService.js';
import { fuelService } from './fuelService.js';
import { transportService } from './transportService.js';
import { pricesService } from './pricesService.js';
import { officialService } from './officialService.js';
import { fxService } from './fxService.js';
import { notificationService } from './notificationService.js';
import { findConflicts } from './dataQualityService.js';
import { reportRepository } from '../repositories/reportRepository.js';

const CURRENT_FRESHNESS = new Set(['fresh', 'recent', 'aging']);
const SEVERITY_RANK = {
  blocked: 0,
  standstill: 1,
  urgent: 1,
  heavy: 2,
  caution: 2,
  moderate: 3,
  light: 4,
  clear: 5,
  available: 3,
  limited: 2,
  unavailable: 1,
};

function freshnessStateOf(entity) {
  return (
    entity?.quality?.freshness?.state ||
    entity?.report?.quality?.freshness?.state ||
    entity?.report?.freshness ||
    entity?.freshnessKey ||
    entity?.freshness ||
    null
  );
}

function dbStatusOf(entity) {
  return entity?.report?.status || entity?.status || null;
}

/** Exclude expired/removed/DB-stale. Prefer fresh→aging; allow quality-stale only as fallback. */
function pickCurrentItems(items, { severityKey, limit = 3 } = {}) {
  const usable = (items || []).filter((item) => {
    const status = dbStatusOf(item);
    if (status === 'expired' || status === 'removed' || status === 'stale') return false;
    const state = freshnessStateOf(item);
    if (state === 'expired') return false;
    return true;
  });

  const preferred = usable.filter((item) => {
    const state = freshnessStateOf(item);
    return !state || CURRENT_FRESHNESS.has(state);
  });

  const pool = preferred.length ? preferred : usable;
  return sortByRelevance(pool, { severityKey }).slice(0, limit);
}

/** Keep one card per place+status so Home stays scannable. */
function dedupeHomeCards(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    if (!item) continue;
    const key = keyFn(item);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(item);
  }
  return out;
}

function isCurrent(entity) {
  const status = dbStatusOf(entity);
  if (status === 'expired' || status === 'removed' || status === 'stale') return false;
  const state = freshnessStateOf(entity);
  if (state === 'expired') return false;
  if (!state) return true;
  return CURRENT_FRESHNESS.has(state);
}

function sortByRelevance(items, { severityKey } = {}) {
  return [...items].sort((a, b) => {
    const sa = freshnessStateOf(a);
    const sb = freshnessStateOf(b);
    const rank = (s) =>
      s === 'fresh' ? 0 : s === 'recent' ? 1 : s === 'aging' ? 2 : s === 'stale' ? 3 : 4;
    if (rank(sa) !== rank(sb)) return rank(sa) - rank(sb);
    if (severityKey) {
      const va = SEVERITY_RANK[a[severityKey]] ?? 9;
      const vb = SEVERITY_RANK[b[severityKey]] ?? 9;
      if (va !== vb) return va - vb;
    }
    const ta = new Date(a.report?.lastConfirmedAt || a.report?.occurredAt || a.occurredAt || a.createdAt || 0);
    const tb = new Date(b.report?.lastConfirmedAt || b.report?.occurredAt || b.occurredAt || b.createdAt || 0);
    return tb - ta;
  });
}

function publicLocation(loc) {
  if (!loc) return null;
  return {
    id: loc.id,
    name: loc.name,
    type: loc.type,
    subtitle: loc.subtitle || null,
    state: loc.state || null,
    lga: loc.lga || null,
    area: loc.area || null,
    coordinates: loc.coordinates
      ? { lat: loc.coordinates.lat, lng: loc.coordinates.lng }
      : null,
  };
}

async function resolveContext(userId, query = {}) {
  const user = await userRepository.findById(userId);
  if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');

  const savedAreas = await savedPlacesRepository.listAreas(userId);
  const savedRoutes = await savedPlacesRepository.listRoutes(userId);

  let mode = 'current';
  let label = null;
  let location = null;
  let savedArea = null;
  let savedRoute = null;
  let widerContextNote = null;

  if (query.savedAreaId) {
    savedArea = await savedPlacesRepository.findAreaById(userId, query.savedAreaId);
    if (!savedArea) throw new AppError('Saved area not found.', 404, 'SAVED_AREA_NOT_FOUND');
    location = await locationRepository.findById(savedArea.location?.id);
    mode = 'saved_area';
    label = savedArea.displayName || location?.name || 'Saved area';
  } else if (query.savedRouteId) {
    savedRoute = await savedPlacesRepository.findRouteById(userId, query.savedRouteId);
    if (!savedRoute) throw new AppError('Saved route not found.', 404, 'SAVED_ROUTE_NOT_FOUND');
    location = await locationRepository.findById(savedRoute.origin?.id);
    mode = 'saved_route';
    label = savedRoute.displayName || 'Saved route';
    widerContextNote = `Along your route toward ${savedRoute.destination?.name || 'destination'}`;
  } else if (query.locationId) {
    location = await locationRepository.findById(query.locationId);
    if (!location) throw new AppError('Location not found.', 404, 'LOCATION_NOT_FOUND');
    mode = 'selected';
    label = location.name;
  } else {
    const locationId = user.current_location_id || user.location_id;
    if (locationId) {
      location = await locationRepository.findById(locationId);
    }
    if (!location && user.current_area_id) {
      location = await locationRepository.findAreaLocationByAreaId(user.current_area_id);
    }
    mode = 'current';
    label = location?.name || user.area_name || null;
  }

  const publicUserArea = userRepository.toPublic(user)?.currentArea || null;

  return {
    user,
    mode,
    label: label || publicUserArea?.name || 'Your area',
    location: publicLocation(location),
    coordinates: location?.coordinates || null,
    savedArea,
    savedRoute,
    savedAreas,
    savedRoutes,
    widerContextNote,
    currentArea: publicUserArea,
  };
}

function compactTraffic(item) {
  if (!item) return null;
  return {
    id: item.id,
    severity: item.severity,
    severityLabel: item.severity,
    roadName: item.road?.name || item.location?.name || null,
    locationName: item.location?.name || null,
    detailPath: `/traffic/${item.id}`,
    quality: item.report?.quality || null,
    about: item.report?.about || null,
    conflict: item.conflict || null,
    sourceType: item.report?.sourceType || 'community',
    freshness: item.report?.freshness || item.report?.quality?.freshness?.state || null,
    updatedAt:
      item.report?.lastConfirmedAt || item.report?.occurredAt || item.updatedAt || item.createdAt,
  };
}

function compactAlert(item) {
  if (!item) return null;
  return {
    id: item.id,
    alertCategory: item.alertCategory,
    alertCategoryLabel: item.alertCategoryLabel || item.alertCategory,
    severity: item.severity,
    severityLabel: item.severityLabel || item.severity,
    title: item.report?.title || null,
    locationName: item.location?.name || item.road?.name || null,
    detailPath: `/alerts/${item.id}`,
    quality: item.report?.quality || null,
    trustLabel: (item.report?.trustLabels || [])[0] || 'Community Report — Unverified',
    sourceType: item.report?.sourceType || 'community',
    freshness: item.report?.freshness || item.report?.quality?.freshness?.state || null,
    updatedAt:
      item.report?.lastConfirmedAt || item.report?.occurredAt || item.updatedAt || item.createdAt,
  };
}

function compactFuelStation(station) {
  if (!station) return null;
  const reports = station.latestReports || station.reports || [];
  const primary =
    reports.find((r) => r.fuelType === 'pms' || r.fuel_type === 'pms') || reports[0] || null;
  if (primary && (primary.freshness === 'expired' || primary.status === 'expired')) {
    return null;
  }
  return {
    id: station.id,
    name: station.name,
    brand: station.brand || null,
    locationName: station.location?.name || null,
    detailPath: `/fuel/stations/${station.id}`,
    fuelType: primary?.fuelType || primary?.fuel_type || 'pms',
    availability: primary?.availability || null,
    availabilityLabel: primary?.availabilityLabel || primary?.availability || null,
    price: primary?.price || primary?.priceAmount || null,
    quality: primary?.report?.quality || primary?.quality || null,
    freshness: primary?.freshness || null,
    sourceType: primary?.sourceType || 'community',
    updatedAt:
      primary?.lastConfirmedAt ||
      primary?.occurredAt ||
      primary?.report?.occurredAt ||
      station.updatedAt ||
      null,
  };
}

function compactTransportRoute(route) {
  if (!route) return null;
  const summaries = Array.isArray(route.fareSummary)
    ? route.fareSummary
    : route.fareSummary
      ? [route.fareSummary]
      : [];
  const summary = summaries[0] || route.primaryFare || null;
  return {
    id: route.id,
    name:
      route.displayName ||
      route.name ||
      `${route.origin?.name || '?'} → ${route.destination?.name || '?'}`,
    mode: summary?.transportMode || route.primaryMode || null,
    fareSummary: summary
      ? {
          amount: summary.amount ?? summary.fareAmount ?? null,
          min: summary.fareRange?.min ?? summary.minAmount ?? null,
          max: summary.fareRange?.max ?? summary.maxAmount ?? null,
          currency: 'NGN',
          freshness: summary.freshness || null,
        }
      : null,
    detailPath: `/transport/routes/${route.id}`,
    locationName: route.origin?.name || null,
    updatedAt: summary?.occurredAt || summary?.updatedAt || route.updatedAt || null,
  };
}

function compactPrice(item) {
  if (!item) return null;
  return {
    commodity: item.commodity
      ? { id: item.commodity.id, name: item.commodity.name, slug: item.commodity.slug }
      : null,
    variant: item.variant
      ? { id: item.variant.id, code: item.variant.code, displayName: item.variant.displayName }
      : null,
    priceRange: item.priceRange || null,
    detailPath:
      item.commodity?.slug && item.variant?.code
        ? `/prices/${item.commodity.slug}/${item.variant.code}`
        : '/prices',
    freshness: item.freshness || item.report?.freshness || null,
    quality: item.report?.quality || item.quality || null,
    updatedAt: item.lastReportedAt || item.updatedAt || null,
  };
}

function compactOfficial(item) {
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    agencyName: item.source?.shortName || item.source?.organizationName || item.agencyName || 'Official',
    publishedAt: item.publishedAt || item.retrievedAt || item.createdAt,
    detailPath: `/official-updates/${item.id}`,
    informationType: 'official',
    sourceType: 'official',
  };
}

async function buildRouteSummaries(routes, { limit = 3 } = {}) {
  const selected = routes.slice(0, limit);
  const summaries = [];

  for (const route of selected) {
    const originId = route.origin?.id;
    const destId = route.destination?.id;
    let trafficLabel = 'No recent reports';
    let safetyLabel = 'No active alerts';
    let updatedAt = null;

    try {
      const [originTraffic, destTraffic, originAlerts, destAlerts] = await Promise.all([
        originId
          ? trafficService.list({ locationId: originId, freshness: 'fresh', page: 1, limit: 2 }).catch(() => ({ items: [] }))
          : { items: [] },
        destId
          ? trafficService.list({ locationId: destId, freshness: 'fresh', page: 1, limit: 2 }).catch(() => ({ items: [] }))
          : { items: [] },
        originId
          ? alertsService.list({ locationId: originId, freshness: 'fresh', page: 1, limit: 2 }).catch(() => ({ items: [] }))
          : { items: [] },
        destId
          ? alertsService.list({ locationId: destId, freshness: 'fresh', page: 1, limit: 2 }).catch(() => ({ items: [] }))
          : { items: [] },
      ]);

      const trafficItems = sortByRelevance(
        [...(originTraffic.items || []), ...(destTraffic.items || [])].filter(isCurrent),
        { severityKey: 'severity' }
      );
      const alertItems = sortByRelevance(
        [...(originAlerts.items || []), ...(destAlerts.items || [])].filter(isCurrent),
        { severityKey: 'severity' }
      );

      if (trafficItems[0]) {
        trafficLabel = String(trafficItems[0].severity || 'Update').replace(/_/g, ' ');
        updatedAt = trafficItems[0].report?.lastConfirmedAt || trafficItems[0].createdAt;
      }
      if (alertItems[0]) {
        safetyLabel = alertItems[0].alertCategoryLabel || alertItems[0].severity || 'Alert nearby';
        const alertAt = alertItems[0].report?.lastConfirmedAt || alertItems[0].createdAt;
        if (!updatedAt || new Date(alertAt) > new Date(updatedAt)) updatedAt = alertAt;
      }
    } catch {
      /* keep defaults */
    }

    summaries.push({
      id: route.id,
      displayName: route.displayName,
      origin: route.origin,
      destination: route.destination,
      traffic: trafficLabel,
      roadCondition: 'Normal',
      safety: safetyLabel,
      updatedAt,
      detailPath: `/directions?origin=${originId || ''}&destination=${destId || ''}`,
    });
  }

  return summaries;
}

export const homeService = {
  async getHome(userId, query = {}) {
    await reportRepository.applyFreshnessTransitions().catch(() => null);

    const ctx = await resolveContext(userId, query);
    const locationId = ctx.location?.id || null;
    const coords = ctx.coordinates;
    const radiusKm = Math.min(Number(query.radiusKm) || 12, 25);

    const emptySections = !locationId && !coords;

    const [
      trafficResult,
      trafficSummary,
      alertsResult,
      fuelResult,
      transportResult,
      pricesResult,
      officialItems,
      fxLatest,
      notifications,
      conflicts,
      routeSummaries,
    ] = await Promise.all([
      emptySections
        ? Promise.resolve({ items: [] })
        : (async () => {
            let result = { items: [] };
            if (locationId) {
              result = await trafficService
                .list({ locationId, freshness: 'fresh', page: 1, limit: 5 })
                .catch(() => ({ items: [] }));
            }
            if ((!result.items || !result.items.length) && coords?.lat != null) {
              result = await trafficService
                .nearby({
                  lat: coords.lat,
                  lng: coords.lng,
                  radiusKm,
                  freshness: 'fresh',
                  limit: 5,
                })
                .catch(() => ({ items: [] }));
            }
            return result;
          })(),
      emptySections || !locationId
        ? Promise.resolve(null)
        : trafficService.summary({ locationId }).catch(() => null),
      emptySections
        ? Promise.resolve({ items: [] })
        : (async () => {
            let result = { items: [] };
            if (locationId) {
              result = await alertsService
                .list({ locationId, freshness: 'fresh', page: 1, limit: 4 })
                .catch(() => ({ items: [] }));
            }
            if ((!result.items || !result.items.length) && coords?.lat != null) {
              result = await alertsService
                .nearby({
                  lat: coords.lat,
                  lng: coords.lng,
                  radiusKm,
                  freshness: 'fresh',
                  limit: 4,
                })
                .catch(() => ({ items: [] }));
            }
            return result;
          })(),
      emptySections
        ? Promise.resolve({ items: [] })
        : (async () => {
            let result = { items: [] };
            if (locationId) {
              result = await fuelService
                .listStations({ locationId, freshness: 'any', fuelType: 'pms', page: 1, limit: 3 })
                .catch(() => ({ items: [] }));
            }
            if ((!result.items || !result.items.length) && coords?.lat != null) {
              result = await fuelService
                .nearbyStations({
                  lat: coords.lat,
                  lng: coords.lng,
                  radiusKm,
                  freshness: 'any',
                  fuelType: 'pms',
                  limit: 3,
                })
                .catch(() => ({ items: [] }));
            }
            return result;
          })(),
      emptySections
        ? Promise.resolve({ items: [] })
        : transportService
            .listRoutes({
              locationId: locationId || undefined,
              freshness: 'any',
              page: 1,
              limit: 3,
            })
            .catch(() => ({ items: [] })),
      emptySections
        ? Promise.resolve({ items: [] })
        : pricesService
            .list({
              locationId: locationId || undefined,
              freshness: 'any',
              group: 'variant',
              page: 1,
              limit: 3,
            })
            .catch(() => ({ items: [] })),
      locationId
        ? officialService
            .forUserLocation({ locationId, limit: 3 })
            .then((data) => data.items || [])
            .catch(() => [])
        : Promise.resolve([]),
      fxService.getLatest({ bases: ['USD'] }).catch(() => ({ items: [] })),
      notificationService.list(userId, { limit: 8 }).catch(() => ({ items: [] })),
      locationId
        ? findConflicts({ categoryCode: 'traffic', locationId, windowMinutes: 90, limit: 3 }).catch(
            () => []
          )
        : Promise.resolve([]),
      buildRouteSummaries(ctx.savedRoutes, { limit: 3 }),
    ]);

    const trafficItems = dedupeHomeCards(
      pickCurrentItems(trafficResult.items || [], {
        severityKey: 'severity',
        limit: 8,
      }).map(compactTraffic),
      (item) =>
        `${item.roadName || item.locationName || item.id}:${item.severity || ''}`.toLowerCase()
    ).slice(0, 3);

    const safetyItems = dedupeHomeCards(
      pickCurrentItems(alertsResult.items || [], {
        severityKey: 'severity',
        limit: 8,
      }).map(compactAlert),
      (item) =>
        `${item.locationName || item.id}:${item.alertCategory || ''}:${item.severity || ''}`.toLowerCase()
    ).slice(0, 3);

    const fuelItems = (fuelResult.items || [])
      .slice(0, 3)
      .map(compactFuelStation)
      .filter(Boolean);

    const transportItems = (transportResult.items || [])
      .slice(0, 3)
      .map(compactTransportRoute)
      .filter(Boolean);

    const priceItems = (pricesResult.items || [])
      .filter((item) => {
        const state = freshnessStateOf(item) || item.freshness;
        return state !== 'expired';
      })
      .slice(0, 3)
      .map(compactPrice);

    const official = (Array.isArray(officialItems) ? officialItems : []).slice(0, 3).map(compactOfficial);

    const usdNgn =
      (fxLatest?.items || []).find(
        (r) => r.baseCurrency === 'USD' && r.quoteCurrency === 'NGN'
      ) || null;

    const recentChanges = (notifications.items || [])
      .filter((n) =>
        ['traffic', 'road_alerts', 'fuel', 'transport', 'prices', 'official'].includes(n.category)
      )
      .slice(0, 5)
      .map((n) => ({
        id: n.id,
        category: n.category,
        title: n.title,
        body: n.message || n.body || null,
        href: n.linkPath || '/notifications',
        createdAt: n.createdAt,
        readAt: n.readAt || null,
      }));

    const hasAnyData =
      trafficItems.length ||
      safetyItems.length ||
      fuelItems.length ||
      transportItems.length ||
      priceItems.length ||
      official.length ||
      routeSummaries.length;

    return {
      location: {
        mode: ctx.mode,
        label: ctx.label,
        contextLabel: ctx.widerContextNote
          ? `${ctx.label} · ${ctx.widerContextNote}`
          : `Updates around ${ctx.label}`,
        location: ctx.location,
        currentArea: ctx.currentArea,
        widerContextNote: ctx.widerContextNote,
      },
      savedAreas: ctx.savedAreas.map((a) => ({
        id: a.id,
        displayName: a.displayName,
        placeKind: a.placeKind,
        locationId: a.location?.id || null,
        locationName: a.location?.name || null,
      })),
      savedRoutes: ctx.savedRoutes.map((r) => ({
        id: r.id,
        displayName: r.displayName,
        originId: r.origin?.id || null,
        destinationId: r.destination?.id || null,
      })),
      traffic: {
        items: trafficItems,
        summary: trafficSummary,
        emptyMessage: 'No recent traffic reports for this area.',
        explorePath: locationId
          ? `/explore?category=traffic&locationId=${locationId}`
          : '/explore?category=traffic',
        modulePath: '/traffic',
      },
      safety: {
        items: safetyItems,
        emptyMessage: 'No active safety alerts nearby.',
        explorePath: locationId
          ? `/explore?category=local_alerts&locationId=${locationId}`
          : '/alerts',
        modulePath: '/alerts',
      },
      fuel: {
        items: fuelItems,
        emptyMessage: 'No recent fuel reports around you.',
        explorePath: locationId
          ? `/explore?category=fuel&locationId=${locationId}`
          : '/explore?category=fuel',
        modulePath: '/fuel',
      },
      transport: {
        items: transportItems,
        emptyMessage: 'No recent transport fare reports nearby.',
        explorePath: locationId
          ? `/explore?category=transport&locationId=${locationId}`
          : '/explore?category=transport',
        modulePath: '/transport',
      },
      prices: {
        items: priceItems,
        emptyMessage: 'No recent price reports around you.',
        explorePath: locationId
          ? `/explore?category=prices&locationId=${locationId}`
          : '/explore?category=prices',
        modulePath: '/prices',
      },
      official: {
        items: official,
        emptyMessage: 'No official updates for your location context yet.',
        modulePath: '/official-updates',
      },
      routes: {
        items: routeSummaries,
        emptyMessage: null,
        modulePath: '/profile/saved-routes',
      },
      recentChanges: {
        items: recentChanges,
        emptyMessage: 'No major changes since your last visit.',
        notificationsPath: '/notifications',
      },
      conflicts: (conflicts || []).slice(0, 2).map((c) => ({
        headline: c.headline,
        placeName: c.placeName,
        breakdown: c.breakdown,
        windowMinutes: c.windowMinutes,
        hasConflict: true,
      })),
      fx: usdNgn
        ? {
            pair: 'USD/NGN',
            rate: usdNgn.rate ?? usdNgn.value ?? null,
            observedAt: usdNgn.observedAt || usdNgn.updatedAt || null,
            path: '/fx',
          }
        : null,
      meta: {
        hasAnyData: Boolean(hasAnyData),
        empty: !hasAnyData,
        reportPath: locationId
          ? `/app/report?locationId=${locationId}`
          : '/app/report',
        explorePath: locationId ? `/explore?locationId=${locationId}` : '/explore',
        radiusKm,
      },
    };
  },
};

export default homeService;
