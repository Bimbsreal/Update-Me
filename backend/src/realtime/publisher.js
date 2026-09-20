import { CATEGORY_FOR_EVENT, EVENT_TYPES } from './eventTypes.js';
import { realtimeBroker } from './broker.js';

/**
 * Build a public-safe location fragment from a module entity.
 * Never includes exact private user coordinates.
 */
export function locationFromEntity(entity = {}) {
  const loc = entity.location || {};
  const locationId =
    loc.id || entity.locationId || entity.location_id || null;
  return {
    id: locationId || null,
    stateId: loc.state?.id || entity.stateId || null,
    lgaId: loc.lga?.id || entity.lgaId || null,
    areaId: loc.area?.id || entity.areaId || null,
    name: loc.name || null,
  };
}

function basePayload({ type, entityId, entity, status, extra = {} }) {
  const location = locationFromEntity(entity);
  return {
    type,
    entityId: entityId || entity?.id || null,
    category: CATEGORY_FOR_EVENT[type] || extra.category || null,
    location,
    status: status || entity?.severity || entity?.availability || entity?.report?.status || null,
    updatedAt:
      entity?.report?.updatedAt ||
      entity?.updatedAt ||
      entity?.publishedAt ||
      new Date().toISOString(),
    ...extra,
  };
}

/**
 * Publish after a successful DB operation. Never throws to callers.
 */
export function safePublish(type, payload) {
  try {
    return realtimeBroker.publish({ type, payload });
  } catch (err) {
    console.error('[realtime] publish failed', err?.message || err);
    return { delivered: 0, error: true };
  }
}

export const realtimePublisher = {
  trafficUpdated(entity, extra = {}) {
    return safePublish(
      EVENT_TYPES.TRAFFIC_UPDATED,
      basePayload({
        type: EVENT_TYPES.TRAFFIC_UPDATED,
        entityId: entity?.id,
        entity,
        status: entity?.severity,
        extra: {
          reportId: entity?.reportId || entity?.report?.id || null,
          sourceType: entity?.report?.sourceType || 'community',
          ...extra,
        },
      })
    );
  },

  fuelUpdated(entity, extra = {}) {
    return safePublish(
      EVENT_TYPES.FUEL_UPDATED,
      basePayload({
        type: EVENT_TYPES.FUEL_UPDATED,
        entityId: entity?.id || entity?.station?.id,
        entity: {
          ...entity,
          location: entity?.station?.location || entity?.location,
          locationId: entity?.location?.id || entity?.station?.location?.id,
        },
        status: entity?.availability,
        extra: {
          stationId: entity?.station?.id || entity?.stationId || null,
          fuelType: entity?.fuelType || null,
          sourceType: entity?.report?.sourceType || 'community',
          ...extra,
        },
      })
    );
  },

  transportUpdated(entity, extra = {}) {
    return safePublish(
      EVENT_TYPES.TRANSPORT_UPDATED,
      basePayload({
        type: EVENT_TYPES.TRANSPORT_UPDATED,
        entityId: entity?.id,
        entity: {
          ...entity,
          location: entity?.route?.origin || entity?.location,
          locationId: entity?.route?.origin?.id || entity?.location?.id,
        },
        status: entity?.report?.status,
        extra: {
          routeId: entity?.route?.id || entity?.routeId || null,
          sourceType: entity?.report?.sourceType || 'community',
          ...extra,
        },
      })
    );
  },

  priceUpdated(entity, extra = {}) {
    return safePublish(
      EVENT_TYPES.PRICE_UPDATED,
      basePayload({
        type: EVENT_TYPES.PRICE_UPDATED,
        entityId: entity?.id,
        entity,
        status: entity?.report?.status,
        extra: {
          commoditySlug: entity?.commodity?.slug || null,
          variantCode: entity?.variant?.code || null,
          sourceType: entity?.report?.sourceType || 'community',
          ...extra,
        },
      })
    );
  },

  alertCreated(entity, extra = {}) {
    return safePublish(
      EVENT_TYPES.ALERT_CREATED,
      basePayload({
        type: EVENT_TYPES.ALERT_CREATED,
        entityId: entity?.id,
        entity,
        status: entity?.severity,
        extra: {
          alertCategory: entity?.alertCategory || null,
          sourceType: entity?.report?.sourceType || 'community',
          trustLabel: 'Community Report — Unverified',
          ...extra,
        },
      })
    );
  },

  alertUpdated(entity, extra = {}) {
    return safePublish(
      EVENT_TYPES.ALERT_UPDATED,
      basePayload({
        type: EVENT_TYPES.ALERT_UPDATED,
        entityId: entity?.id,
        entity,
        status: entity?.severity || entity?.report?.status,
        extra: {
          alertCategory: entity?.alertCategory || null,
          sourceType: entity?.report?.sourceType || 'community',
          ...extra,
        },
      })
    );
  },

  officialUpdated(entity, extra = {}) {
    return safePublish(
      EVENT_TYPES.OFFICIAL_UPDATED,
      basePayload({
        type: EVENT_TYPES.OFFICIAL_UPDATED,
        entityId: entity?.id,
        entity: {
          ...entity,
          location: entity.location || { id: entity.locationId, state: entity.stateId ? { id: entity.stateId } : null },
          locationId: entity.locationId,
          stateId: entity.stateId,
        },
        status: entity?.status || 'published',
        extra: {
          sourceType: 'official',
          agency: entity?.source?.name || entity?.agencyName || null,
          ...extra,
        },
      })
    );
  },

  reportConfirmed(entity, extra = {}) {
    return safePublish(
      EVENT_TYPES.REPORT_CONFIRMED,
      basePayload({
        type: EVENT_TYPES.REPORT_CONFIRMED,
        entityId: entity?.id || entity?.reportId,
        entity,
        status: entity?.report?.status || 'confirmed',
        extra,
      })
    );
  },

  reportUpdated(entity, extra = {}) {
    return safePublish(
      EVENT_TYPES.REPORT_UPDATED,
      basePayload({
        type: EVENT_TYPES.REPORT_UPDATED,
        entityId: entity?.id,
        entity,
        status: entity?.status,
        extra: {
          category: entity?.category?.code || entity?.category || null,
          ...extra,
        },
      })
    );
  },

  notificationCreated(notification) {
    if (!notification?.id || !notification?.userId) return { delivered: 0 };
    return safePublish(EVENT_TYPES.NOTIFICATION_CREATED, {
      type: EVENT_TYPES.NOTIFICATION_CREATED,
      entityId: notification.id,
      category: 'notification',
      userId: notification.userId,
      notificationCategory: notification.category || null,
      priority: notification.priority || 'normal',
      title: notification.title || null,
      updatedAt: notification.createdAt || new Date().toISOString(),
      location: {
        id: notification.locationId || null,
        stateId: null,
        lgaId: null,
        areaId: null,
        name: null,
      },
    });
  },

  savedAreaUpdated(userId, area) {
    return safePublish(EVENT_TYPES.SAVED_AREA_UPDATED, {
      type: EVENT_TYPES.SAVED_AREA_UPDATED,
      entityId: area?.id,
      category: 'saved_area',
      userId,
      updatedAt: area?.updatedAt || new Date().toISOString(),
      location: {
        id: area?.location?.id || null,
        stateId: area?.location?.state?.id || null,
        lgaId: null,
        areaId: null,
        name: area?.location?.name || null,
      },
    });
  },

  savedRouteUpdated(userId, route) {
    return safePublish(EVENT_TYPES.SAVED_ROUTE_UPDATED, {
      type: EVENT_TYPES.SAVED_ROUTE_UPDATED,
      entityId: route?.id,
      category: 'saved_route',
      userId,
      updatedAt: route?.updatedAt || new Date().toISOString(),
      location: {
        id: route?.origin?.id || null,
        stateId: null,
        lgaId: null,
        areaId: null,
        name: route?.displayName || null,
      },
    });
  },
};
