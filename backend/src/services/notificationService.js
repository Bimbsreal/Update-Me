import { AppError } from '../middleware/errorHandler.js';
import {
  NOTIFICATION_CATEGORIES,
  DEFAULT_NOTIFICATION_TTL_HOURS,
  NOTIFY_TRAFFIC_SEVERITIES,
  NOTIFY_ALERT_SEVERITIES,
  categoryLabel,
} from '../config/notifications.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { notificationRepository } from '../repositories/notificationRepository.js';
import { savedPlacesRepository } from '../repositories/savedPlacesRepository.js';
import { realtimePublisher } from '../realtime/publisher.js';

function dayBucket(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function expiresAtFor(category) {
  const hours = DEFAULT_NOTIFICATION_TTL_HOURS[category] || 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function defaultLink(category, entityType, entityId) {
  if (!entityId) return null;
  switch (category) {
    case 'traffic':
      return `/traffic/${entityId}`;
    case 'road_alerts':
      return `/alerts/${entityId}`;
    case 'fuel':
      return `/fuel/${entityId}`;
    case 'transport':
      return `/transport/${entityId}`;
    case 'prices':
      return `/prices/${entityId}`;
    case 'official':
      return `/official-updates/${entityId}`;
    case 'community':
      return `/community/questions/${entityId}`;
    default:
      return null;
  }
}

/**
 * NotificationService — in-app first; pluggable delivery later.
 * Modules call publishEvent after meaningful creates (not every confirmation).
 */
export const notificationService = {
  taxonomy() {
    return {
      categories: NOTIFICATION_CATEGORIES,
      channels: ['in_app'],
    };
  },

  async getPreferences(userId) {
    await notificationRepository.ensureDefaultPreferences(userId, NOTIFICATION_CATEGORIES);
    const rows = await notificationRepository.getPreferences(userId);
    const map = Object.fromEntries(rows.map((r) => [r.category, r.enabled]));
    return NOTIFICATION_CATEGORIES.map((c) => ({
      category: c.code,
      label: c.label,
      enabled: map[c.code] ?? c.defaultEnabled,
    }));
  },

  async updatePreferences(userId, preferences) {
    for (const item of preferences) {
      await notificationRepository.upsertPreference(userId, item.category, item.enabled);
    }
    return this.getPreferences(userId);
  },

  async isCategoryEnabled(userId, category) {
    const prefs = await this.getPreferences(userId);
    const row = prefs.find((p) => p.category === category);
    return Boolean(row?.enabled);
  },

  async list(userId, query) {
    return notificationRepository.list(userId, query);
  },

  async unreadCount(userId) {
    return notificationRepository.unreadCount(userId);
  },

  async markRead(userId, id) {
    const item = await notificationRepository.markRead(userId, id);
    if (!item) throw new AppError('Notification not found.', 404, 'NOTIFICATION_NOT_FOUND');
    return item;
  },

  async markAllRead(userId) {
    const count = await notificationRepository.markAllRead(userId);
    return { updated: count };
  },

  /**
   * Core publish API. Dedupes on (userId, dedupeKey). Never throws to callers of notify* helpers.
   */
  async publish({
    userId,
    category,
    type,
    title,
    message,
    priority = 'normal',
    relatedEntityType,
    relatedEntityId,
    locationId,
    linkPath,
    dedupeKey,
    expiresAt,
    actorUserId,
  }) {
    if (!userId) return { skipped: true, reason: 'no_user' };
    if (actorUserId && actorUserId === userId) {
      return { skipped: true, reason: 'actor_is_recipient' };
    }

    const enabled = await this.isCategoryEnabled(userId, category);
    if (!enabled) return { skipped: true, reason: 'category_disabled' };

    const key =
      dedupeKey ||
      `${category}:${relatedEntityType || 'entity'}:${relatedEntityId || 'none'}:${dayBucket()}`;

    const created = await notificationRepository.create({
      userId,
      category,
      type,
      title,
      message,
      priority,
      relatedEntityType,
      relatedEntityId,
      locationId,
      linkPath: linkPath || defaultLink(category, relatedEntityType, relatedEntityId),
      dedupeKey: key,
      expiresAt: expiresAt || expiresAtFor(category),
    });

    if (created?.duplicate) return { skipped: true, reason: 'duplicate' };
    if (created) {
      realtimePublisher.notificationCreated({
        ...created,
        userId,
      });
    }
    return { notification: created };
  },

  /**
   * Fan-out to users who saved this location (area or route endpoint).
   * Fire-and-forget safe: errors are returned, not thrown by notify* wrappers.
   */
  async publishForLocation(locationId, event) {
    if (!locationId) return { notified: 0 };
    const userIds = await savedPlacesRepository.findSubscriberUserIds(locationId);
    let notified = 0;
    const results = [];
    for (const userId of userIds) {
      const result = await this.publish({
        ...event,
        userId,
        locationId,
      });
      results.push(result);
      if (result.notification) notified += 1;
    }
    return { notified, results };
  },

  /** Meaningful traffic only — heavy / standstill / blocked. */
  async notifyTrafficReport(report, { actorUserId } = {}) {
    if (!NOTIFY_TRAFFIC_SEVERITIES.has(report.severity)) {
      return { skipped: true, reason: 'not_significant' };
    }
    const locationId = report.location?.id || report.locationId;
    const road = report.road?.name || report.roadName;
    const title = road
      ? `${report.severityLabel || report.severity} reported on ${road}`
      : `Significant traffic near your saved place`;
    return this.publishForLocation(locationId, {
      category: 'traffic',
      type: 'traffic.significant',
      title,
      message: report.report?.description || report.description || null,
      priority: report.severity === 'blocked' || report.severity === 'standstill' ? 'urgent' : 'important',
      relatedEntityType: 'traffic_report',
      relatedEntityId: report.id || report.reportId,
      actorUserId,
      dedupeKey: `traffic:report:${report.id || report.reportId}:${dayBucket()}`,
    });
  },

  /** Meaningful alerts only — caution / urgent / critical. */
  async notifySafetyAlert(alert, { actorUserId } = {}) {
    if (!NOTIFY_ALERT_SEVERITIES.has(alert.severity)) {
      return { skipped: true, reason: 'not_significant' };
    }
    const locationId = alert.location?.id || alert.locationId;
    const title =
      alert.report?.title ||
      alert.title ||
      `${categoryLabel('road_alerts')} near your saved place`;
    const priority =
      alert.severity === 'critical' || alert.severity === 'urgent' ? 'urgent' : 'important';
    return this.publishForLocation(locationId, {
      category: 'road_alerts',
      type: 'alert.significant',
      title,
      message: alert.report?.description || alert.description || null,
      priority,
      relatedEntityType: 'local_alert',
      relatedEntityId: alert.id,
      actorUserId,
      dedupeKey: `road_alerts:alert:${alert.id}:${dayBucket()}`,
    });
  },

  async notifyOfficialUpdate(update, { locationId, actorUserId } = {}) {
    const locId = locationId || update.location?.id || update.locationId;
    if (!locId) return { skipped: true, reason: 'no_location' };
    return this.publishForLocation(locId, {
      category: 'official',
      type: 'official.advisory',
      title: update.title || 'Official advisory for your area',
      message: update.summary || update.body || null,
      priority: 'important',
      relatedEntityType: 'official_update',
      relatedEntityId: update.id,
      actorUserId,
      dedupeKey: `official:update:${update.id}`,
    });
  },
};

export const savedPlacesService = {
  listAreas: (userId) => savedPlacesRepository.listAreas(userId),
  listRoutes: (userId) => savedPlacesRepository.listRoutes(userId),

  async createArea(userId, input) {
    const location = await locationRepository.findById(input.locationId);
    if (!location) throw new AppError('Selected location was not found.', 404, 'LOCATION_NOT_FOUND');
    try {
      const area = await savedPlacesRepository.createArea({ userId, ...input });
      realtimePublisher.savedAreaUpdated(userId, area);
      return area;
    } catch (error) {
      if (error.code === '23505') {
        throw new AppError('You already saved this location.', 409, 'DUPLICATE_SAVED_AREA');
      }
      throw error;
    }
  },

  async updateArea(userId, id, input) {
    const existing = await savedPlacesRepository.findAreaRaw(userId, id);
    if (!existing) throw new AppError('Saved area not found.', 404, 'SAVED_AREA_NOT_FOUND');
    const area = await savedPlacesRepository.updateArea(userId, id, input);
    realtimePublisher.savedAreaUpdated(userId, area);
    return area;
  },

  async deleteArea(userId, id) {
    const ok = await savedPlacesRepository.deleteArea(userId, id);
    if (!ok) throw new AppError('Saved area not found.', 404, 'SAVED_AREA_NOT_FOUND');
    return { deleted: true };
  },

  async createRoute(userId, input) {
    const origin = await locationRepository.findById(input.originLocationId);
    const destination = await locationRepository.findById(input.destinationLocationId);
    if (!origin || !destination) {
      throw new AppError('Origin or destination location was not found.', 404, 'LOCATION_NOT_FOUND');
    }
    try {
      const route = await savedPlacesRepository.createRoute({ userId, ...input });
      realtimePublisher.savedRouteUpdated(userId, route);
      return route;
    } catch (error) {
      if (error.code === '23505') {
        throw new AppError('You already saved this route.', 409, 'DUPLICATE_SAVED_ROUTE');
      }
      throw error;
    }
  },

  async updateRoute(userId, id, input) {
    const existing = await savedPlacesRepository.findRouteById(userId, id);
    if (!existing) throw new AppError('Saved route not found.', 404, 'SAVED_ROUTE_NOT_FOUND');
    const route = await savedPlacesRepository.updateRoute(userId, id, input);
    realtimePublisher.savedRouteUpdated(userId, route);
    return route;
  },

  async deleteRoute(userId, id) {
    const ok = await savedPlacesRepository.deleteRoute(userId, id);
    if (!ok) throw new AppError('Saved route not found.', 404, 'SAVED_ROUTE_NOT_FOUND');
    return { deleted: true };
  },

  async personalization(userId) {
    const [areas, routes] = await Promise.all([
      savedPlacesRepository.listAreas(userId),
      savedPlacesRepository.listRoutes(userId),
    ]);
    return { areas, routes };
  },
};

/** Safe wrapper — never fails the parent request. */
export function safeNotify(promise) {
  Promise.resolve(promise).catch((err) => {
    console.error('[notifications]', err?.message || err);
  });
}
