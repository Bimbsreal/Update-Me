import { AppError } from '../middleware/errorHandler.js';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_FREQUENCIES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_TYPES,
  USER_ALERT_KINDS,
  DEFAULT_NOTIFICATION_TTL_HOURS,
  DEFAULT_COOLDOWN_MINUTES,
  NOTIFY_TRAFFIC_SEVERITIES,
  NOTIFY_ALERT_SEVERITIES,
  categoryLabel,
} from '../config/notifications.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { notificationRepository } from '../repositories/notificationRepository.js';
import { savedPlacesRepository } from '../repositories/savedPlacesRepository.js';
import { realtimePublisher } from '../realtime/publisher.js';
import { alertEngine, fingerprintForEvent, isInQuietHours } from './alertEngine.js';
import { renderNotificationTemplate } from './notificationTemplates.js';
import { pushService } from './pushService.js';
import { getPool } from '../db/pool.js';

function dayBucket(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function expiresAtFor(category, ttlHours = null) {
  const hours = ttlHours || DEFAULT_NOTIFICATION_TTL_HOURS[category] || 24;
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
      return `/fuel/stations/${entityId}`;
    case 'transport':
      return `/transport/routes/${entityId}`;
    case 'prices':
      return `/prices`;
    case 'fx':
      return `/fx`;
    case 'official':
      return `/official-updates/${entityId}`;
    case 'community':
      return `/community/questions/${entityId}`;
    default:
      return '/notifications';
  }
}

function formatTimeLabel(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-NG', {
      timeZone: 'Africa/Lagos',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * Central notification pipeline:
 * Event → rules → preferences → location → cooldown → dedupe → generate → channel → deliver
 */
export const notificationService = {
  taxonomy() {
    return {
      categories: NOTIFICATION_CATEGORIES,
      types: NOTIFICATION_TYPES,
      priorities: NOTIFICATION_PRIORITIES,
      frequencies: NOTIFICATION_FREQUENCIES,
      channels: NOTIFICATION_CHANNELS.map((c) => ({
        ...c,
        available:
          c.code === 'in_app' ||
          (c.code === 'push' && pushService.isConfigured()) ||
          (c.code === 'email' && false),
      })),
      alertKinds: USER_ALERT_KINDS,
      push: pushService.publicConfig(),
    };
  },

  async getPreferences(userId) {
    await notificationRepository.ensureDefaultPreferences(userId, NOTIFICATION_CATEGORIES);
    const rows = await notificationRepository.getPreferences(userId);
    const map = Object.fromEntries(rows.map((r) => [r.category, r]));
    return NOTIFICATION_CATEGORIES.map((c) => {
      const row = map[c.code];
      return {
        category: c.code,
        label: c.label,
        enabled: row?.enabled ?? c.defaultEnabled,
        frequency: row?.frequency || 'immediate',
        channels: row?.channels || ['in_app'],
        quietHoursEnabled: row?.quietHoursEnabled || false,
        quietStartMinute: row?.quietStartMinute ?? null,
        quietEndMinute: row?.quietEndMinute ?? null,
        timezone: row?.timezone || 'Africa/Lagos',
        criticalOverridesQuiet: row?.criticalOverridesQuiet !== false,
      };
    });
  },

  async updatePreferences(userId, preferences) {
    for (const item of preferences) {
      await notificationRepository.upsertPreference(userId, item);
    }
    return this.getPreferences(userId);
  },

  async isCategoryEnabled(userId, category) {
    const prefs = await this.getPreferences(userId);
    const row = prefs.find((p) => p.category === category);
    if (!row?.enabled) return false;
    if (row.frequency === 'off') return false;
    return true;
  },

  async list(userId, query) {
    await notificationRepository.expireDue().catch(() => 0);
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

  async archive(userId, id) {
    const ok = await notificationRepository.archive(userId, id);
    if (!ok) throw new AppError('Notification not found.', 404, 'NOTIFICATION_NOT_FOUND');
    return { archived: true };
  },

  /**
   * Core publish API with preference, quiet hours, cooldown, rate-limit, dedupe.
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
    ruleCode = null,
    templateKey = null,
    templateVars = null,
    sourceRef = null,
    fingerprintExtra = '',
    subscriptionId = null,
    skipQuietHours = false,
    channels = null,
  }) {
    if (!userId) return { skipped: true, reason: 'no_user' };
    if (actorUserId && actorUserId === userId) {
      return { skipped: true, reason: 'actor_is_recipient' };
    }

    const pref = (await notificationRepository.getPreference(userId, category)) || {
      enabled: NOTIFICATION_CATEGORIES.find((c) => c.code === category)?.defaultEnabled,
      frequency: 'immediate',
      channels: ['in_app'],
      quietHoursEnabled: false,
      timezone: 'Africa/Lagos',
      criticalOverridesQuiet: true,
    };

    if (!pref.enabled || pref.frequency === 'off') {
      return { skipped: true, reason: 'category_disabled' };
    }
    // Digest/daily_summary: still store in-app immediately as a generated inbox item,
    // but skip push/email fan-out (batched later).
    const deferChannels = pref.frequency === 'digest' || pref.frequency === 'daily_summary';

    const rule = ruleCode ? await alertEngine.getRule(ruleCode) : null;
    if (rule && !rule.enabled) return { skipped: true, reason: 'rule_disabled' };

    const effectivePriority = priority || rule?.priority || 'normal';
    const cooldownMinutes =
      rule?.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES[category] ?? 30;

    if (
      !skipQuietHours &&
      isInQuietHours({
        quietHoursEnabled: pref.quietHoursEnabled,
        quietStartMinute: pref.quietStartMinute,
        quietEndMinute: pref.quietEndMinute,
        timezone: pref.timezone,
        priority: effectivePriority,
        criticalOverridesQuiet: pref.criticalOverridesQuiet,
      })
    ) {
      await alertEngine.recordDelivery({
        userId,
        channel: 'in_app',
        status: 'suppressed',
        errorCode: 'quiet_hours',
      });
      return { skipped: true, reason: 'quiet_hours' };
    }

    const withinLimit = await alertEngine.withinUserHourlyLimit(userId);
    if (!withinLimit) {
      await alertEngine.recordDelivery({
        userId,
        channel: 'in_app',
        status: 'suppressed',
        errorCode: 'rate_limited',
      });
      return { skipped: true, reason: 'rate_limited' };
    }

    const fingerprint = fingerprintForEvent({
      category,
      relatedEntityType,
      relatedEntityId,
      subscriptionId,
      extra: fingerprintExtra,
    });

    const cooldown = await alertEngine.checkCooldown({
      userId,
      fingerprint,
      category,
      priority: effectivePriority,
    });
    if (!cooldown.allowed) {
      await alertEngine.recordDelivery({
        userId,
        channel: 'in_app',
        status: 'suppressed',
        errorCode: 'cooldown',
      });
      return { skipped: true, reason: 'cooldown', suppressUntil: cooldown.suppressUntil };
    }

    let finalTitle = title;
    let finalMessage = message;
    const tplKey = templateKey || rule?.templateKey || null;
    if (tplKey && templateVars) {
      const rendered = renderNotificationTemplate(tplKey, templateVars);
      finalTitle = rendered.title;
      finalMessage = rendered.message;
    }

    const key =
      dedupeKey ||
      `${category}:${relatedEntityType || 'entity'}:${relatedEntityId || 'none'}:${dayBucket()}`;

    const created = await notificationRepository.create({
      userId,
      channel: 'in_app',
      category,
      type,
      title: finalTitle,
      message: finalMessage,
      priority: effectivePriority,
      relatedEntityType,
      relatedEntityId,
      locationId,
      linkPath: linkPath || defaultLink(category, relatedEntityType, relatedEntityId),
      dedupeKey: key,
      expiresAt: expiresAt || expiresAtFor(category, rule?.ttlHours),
      status: 'delivered',
      sourceRef,
      templateKey: tplKey,
      metadata: { ruleCode, fingerprint, escalated: cooldown.reason === 'severity_escalation' },
    });

    if (created?.duplicate) {
      await alertEngine.recordDelivery({
        userId,
        channel: 'in_app',
        status: 'suppressed',
        errorCode: 'duplicate',
      });
      return { skipped: true, reason: 'duplicate' };
    }

    await alertEngine.recordCooldown({
      userId,
      fingerprint,
      category,
      priority: effectivePriority,
      cooldownMinutes,
    });

    await alertEngine.recordDelivery({
      notificationId: created.id,
      userId,
      channel: 'in_app',
      status: 'delivered',
    });

    if (created) {
      realtimePublisher.notificationCreated({
        ...created,
        userId,
      });
    }

    const wantedChannels = channels || pref.channels || ['in_app'];
    if (!deferChannels && wantedChannels.includes('push')) {
      try {
        const pushResult = await pushService.deliverToUser(userId, {
          id: created.id,
          title: created.title,
          message: created.message,
          linkPath: created.linkPath,
          dedupeKey: key,
        });
        await alertEngine.recordDelivery({
          notificationId: created.id,
          userId,
          channel: 'push',
          status: pushResult.skipped ? 'suppressed' : pushResult.delivered > 0 ? 'sent' : 'failed',
          errorCode: pushResult.reason || null,
        });
      } catch (err) {
        await alertEngine.recordDelivery({
          notificationId: created.id,
          userId,
          channel: 'push',
          status: 'failed',
          errorMessage: err?.message || 'push_failed',
        });
      }
    }

    return { notification: created, escalated: cooldown.reason === 'severity_escalation' };
  },

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

  async notifyTrafficReport(report, { actorUserId } = {}) {
    if (!NOTIFY_TRAFFIC_SEVERITIES.has(report.severity)) {
      return { skipped: true, reason: 'not_significant' };
    }
    const locationId = report.location?.id || report.locationId;
    const road = report.road?.name || report.roadName;
    const locationName = report.location?.name || 'your saved place';
    const priority =
      report.severity === 'blocked'
        ? 'critical'
        : report.severity === 'standstill'
          ? 'urgent'
          : 'important';
    return this.publishForLocation(locationId, {
      category: 'traffic',
      type: report.severity === 'blocked' ? 'traffic.closure' : 'traffic.significant',
      ruleCode: 'traffic_significant',
      templateKey: report.severity === 'blocked' ? 'traffic.closure' : 'traffic.alert',
      templateVars: {
        road: road || 'a nearby road',
        location: locationName,
        severity: report.severityLabel || report.severity,
        time: formatTimeLabel(),
        detail: report.report?.description || report.description || '',
      },
      title: road
        ? `${report.severityLabel || report.severity} reported on ${road}`
        : `Significant traffic near your saved place`,
      message: report.report?.description || report.description || null,
      priority,
      relatedEntityType: 'traffic_report',
      relatedEntityId: report.id || report.reportId,
      actorUserId,
      dedupeKey: `traffic:report:${report.id || report.reportId}`,
      fingerprintExtra: report.severity || '',
    });
  },

  async notifySafetyAlert(alert, { actorUserId } = {}) {
    if (!NOTIFY_ALERT_SEVERITIES.has(alert.severity)) {
      return { skipped: true, reason: 'not_significant' };
    }
    const locationId = alert.location?.id || alert.locationId;
    const locationName = alert.location?.name || 'your saved place';
    const priority =
      alert.severity === 'critical' ? 'critical' : alert.severity === 'urgent' ? 'urgent' : 'important';
    return this.publishForLocation(locationId, {
      category: 'road_alerts',
      type: 'road.hazard',
      ruleCode: 'road_closure_hazard',
      templateKey: 'road.hazard',
      templateVars: {
        location: locationName,
        detail: alert.report?.description || alert.description || alert.title || '',
      },
      title:
        alert.report?.title ||
        alert.title ||
        `${categoryLabel('road_alerts')} near your saved place`,
      message: alert.report?.description || alert.description || null,
      priority,
      relatedEntityType: 'local_alert',
      relatedEntityId: alert.id,
      actorUserId,
      dedupeKey: `road_alerts:alert:${alert.id}`,
      fingerprintExtra: alert.severity || '',
    });
  },

  async notifyOfficialUpdate(update, { locationId, actorUserId } = {}) {
    const locId = locationId || update.location?.id || update.locationId;
    const priorityMap = {
      critical: 'critical',
      urgent: 'urgent',
      important: 'important',
      normal: 'normal',
    };
    const priority = priorityMap[update.priority] || 'important';

    // Avoid spam: location fan-out only for important+; subscriptions handle finer filters.
    const significant = ['important', 'urgent', 'critical'].includes(update.priority || 'important');

    const payload = {
      category: 'official',
      type: 'official.advisory',
      ruleCode: 'official_important',
      templateKey: 'official.update',
      templateVars: {
        agency: update.source?.shortName || update.source?.organizationName || 'Official',
        headline: update.title || 'Official update',
        summary: update.summary || '',
      },
      title: update.title || 'Official advisory for your area',
      message: update.summary || update.body || null,
      priority,
      relatedEntityType: 'official_update',
      relatedEntityId: update.id,
      actorUserId,
      dedupeKey: `official:update:${update.id}`,
      sourceRef: update.sourceId || update.source?.id || null,
    };

    if (locId && significant) {
      return this.publishForLocation(locId, payload);
    }

    const subs = await getPool().query(
      `SELECT DISTINCT user_id FROM user_alert_subscriptions
       WHERE enabled = TRUE
         AND kind IN ('official_category','official_source')
         AND (
           (kind = 'official_source' AND source_id = $1)
           OR (kind = 'official_category' AND (official_category IS NULL OR official_category = $2))
           OR (state_id IS NOT NULL AND state_id = $3)
         )`,
      [update.sourceId || update.source?.id || null, update.category || null, update.stateId || null]
    );
    let notified = 0;
    for (const row of subs.rows) {
      const result = await this.publish({ ...payload, userId: row.user_id });
      if (result.notification) notified += 1;
    }
    if (!locId && !subs.rows.length) {
      return { skipped: true, reason: 'no_location_or_subscription' };
    }
    return { notified };
  },

  async notifyFuelObservation(observation, { actorUserId } = {}) {
    const locationId = observation.locationId || observation.station?.locationId;
    if (!locationId) return { skipped: true, reason: 'no_location' };
    const product = observation.fuelType || observation.product || 'Fuel';
    const price = observation.price != null ? Number(observation.price).toLocaleString('en-NG') : '—';
    return this.publishForLocation(locationId, {
      category: 'fuel',
      type: 'fuel.price',
      ruleCode: 'fuel_price_change',
      templateKey: 'fuel.price',
      templateVars: {
        location: observation.station?.name || observation.locationName || 'your area',
        product,
        price,
        detail: observation.note || 'New observation recorded.',
      },
      title: `${product} price update near your saved place`,
      message: `₦${price} reported.`,
      priority: 'normal',
      relatedEntityType: 'fuel_station',
      relatedEntityId: observation.stationId || observation.station?.id,
      actorUserId,
      dedupeKey: `fuel:station:${observation.stationId || observation.station?.id}:${product}:${dayBucket()}`,
    });
  },

  async notifyCommodityThreshold(hit, { actorUserId } = {}) {
    return this.publish({
      userId: hit.userId,
      category: 'prices',
      type: 'commodity.price',
      ruleCode: 'commodity_threshold',
      templateKey: 'commodity.price',
      templateVars: {
        commodity: hit.commodityLabel || hit.commodityCode,
        location: hit.locationName || 'selected market',
        detail: hit.detail || `Price is now ₦${hit.price}`,
      },
      title: `${hit.commodityLabel || hit.commodityCode} price alert`,
      message: hit.detail || null,
      priority: 'important',
      relatedEntityType: 'commodity',
      relatedEntityId: hit.observationId || null,
      locationId: hit.locationId || null,
      linkPath: hit.href || '/prices',
      actorUserId,
      subscriptionId: hit.subscriptionId,
      dedupeKey: `prices:sub:${hit.subscriptionId}:${dayBucket()}`,
    });
  },

  async notifyFxThreshold(hit, { actorUserId } = {}) {
    const pair = `${hit.base}/${hit.quote}`;
    return this.publish({
      userId: hit.userId,
      category: 'fx',
      type: 'fx.rate',
      ruleCode: 'fx_threshold',
      templateKey: 'fx.rate',
      templateVars: {
        pair,
        rate: hit.rate,
        threshold: hit.threshold,
      },
      title: `${pair} rate alert`,
      message: `Rate is now ${hit.rate}.`,
      priority: 'important',
      relatedEntityType: 'fx_rate',
      relatedEntityId: null,
      linkPath: '/fx',
      actorUserId,
      subscriptionId: hit.subscriptionId,
      dedupeKey: `fx:sub:${hit.subscriptionId}:${hit.rate}`,
    });
  },

  async notifyEmergencyBroadcast({
    userIds,
    title,
    message,
    locationId = null,
    expiresAt = null,
    actorUserId = null,
  }) {
    let notified = 0;
    for (const userId of userIds) {
      const result = await this.publish({
        userId,
        category: 'system',
        type: 'system.emergency',
        ruleCode: 'system_emergency',
        templateKey: 'system.emergency',
        templateVars: { summary: message },
        title,
        message,
        priority: 'critical',
        relatedEntityType: 'system_emergency',
        locationId,
        expiresAt,
        actorUserId,
        skipQuietHours: true,
        channels: ['in_app', 'push'],
        dedupeKey: `system:emergency:${actorUserId || 'admin'}:${dayBucket()}:${userId}`,
        fingerprintExtra: title,
      });
      if (result.notification) notified += 1;
    }
    return { notified };
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
