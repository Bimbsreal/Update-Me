import { AppError } from '../middleware/errorHandler.js';
import { ALERT_CATEGORIES, ALERT_SEVERITIES, alertCategoryLabel } from '../config/alerts.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { reportRepository } from '../repositories/reportRepository.js';
import { alertsRepository } from '../repositories/alertsRepository.js';
import { trafficRepository } from '../repositories/trafficRepository.js';
import { reportService } from './reportService.js';
import { notificationService, safeNotify } from './notificationService.js';
import { realtimePublisher } from '../realtime/publisher.js';

function normalizeConfirmType(type) {
  if (type === 'still_happening') return 'still_accurate';
  if (type === 'no_longer_happening') return 'no_longer_accurate';
  return type;
}

function buildTitle(input) {
  if (input.title?.trim()) return input.title.trim();
  const category = alertCategoryLabel(input.alertCategory);
  const place = input.roadName?.trim() || input.affectedArea?.trim() || input.landmarkLabel?.trim();
  if (place) return `${category} — ${place}`;
  return category;
}

function buildDescription(input) {
  const parts = [];
  if (input.whatHappened?.trim()) parts.push(input.whatHappened.trim());
  if (input.notes?.trim() && input.notes.trim() !== input.whatHappened?.trim()) {
    parts.push(input.notes.trim());
  }
  if (input.roadName) parts.push(`Road: ${input.roadName.trim()}`);
  if (input.affectedArea) parts.push(`Affected area: ${input.affectedArea.trim()}`);
  if (input.landmarkLabel) parts.push(`Near: ${input.landmarkLabel.trim()}`);
  if (input.cause) parts.push(`Cause: ${input.cause.trim()}`);
  return parts.join('\n\n') || 'Community local alert. Confirm if you are nearby and this still matches what you see.';
}

export const alertsService = {
  taxonomy() {
    return {
      categories: ALERT_CATEGORIES,
      severities: ALERT_SEVERITIES,
    };
  },

  async create(userId, input) {
    const location = await locationRepository.findById(input.locationId);
    if (!location) {
      throw new AppError('Selected location was not found.', 404, 'LOCATION_NOT_FOUND');
    }

    if (input.relatedTrafficReportId) {
      const traffic = await trafficRepository.findById(input.relatedTrafficReportId);
      if (!traffic) {
        throw new AppError('Related traffic report was not found.', 404, 'TRAFFIC_NOT_FOUND');
      }
    }

    // Public coordinates: only accept if provided; never invent private GPS.
    // Prefer location centroid for map readiness when coords omitted.
    const latitude =
      input.latitude != null
        ? input.latitude
        : location.coordinates?.lat != null
          ? Number(location.coordinates.lat)
          : undefined;
    const longitude =
      input.longitude != null
        ? input.longitude
        : location.coordinates?.lng != null
          ? Number(location.coordinates.lng)
          : undefined;

    const title = buildTitle(input);
    const description = buildDescription(input);

    const report = await reportService.create(userId, {
      category: 'local_alerts',
      title,
      description,
      locationId: input.locationId,
      latitude,
      longitude,
      occurredAt: input.observedAt || undefined,
      metadata: {
        module: 'local_alerts',
        alertCategory: input.alertCategory,
        severity: input.severity,
        requiresReview: true,
      },
    });

    // Stronger moderation hook: queue community safety alerts for review tracking
    await reportRepository.update(report.id, {
      moderationState: 'queued',
    });

    const alert = await alertsRepository.create({
      reportId: report.id,
      alertCategory: input.alertCategory,
      severity: input.severity,
      roadId: input.roadId || null,
      roadName: input.roadName || null,
      affectedArea: input.affectedArea || null,
      cause: input.cause || null,
      landmarkLabel: input.landmarkLabel || null,
      relatedTrafficReportId: input.relatedTrafficReportId || null,
      requiresReview: true,
    });

    await reportRepository.addHistory({
      reportId: report.id,
      actorUserId: userId,
      eventType: 'system',
      previousState: null,
      newState: {
        alertId: alert.id,
        alertCategory: input.alertCategory,
        severity: input.severity,
        requiresReview: true,
        moderationQueued: true,
      },
      reason: 'Local alert details attached — queued for moderation review hooks',
    });

    safeNotify(
      notificationService.notifySafetyAlert(alert, { actorUserId: userId })
    );

    realtimePublisher.alertCreated(alert);

    return alert;
  },

  async list(query) {
    await reportRepository.applyFreshnessTransitions();
    return alertsRepository.list(query);
  },

  async nearby(query) {
    await reportRepository.applyFreshnessTransitions();
    return alertsRepository.nearby(query);
  },

  async getById(id, viewerUserId = null) {
    await reportRepository.applyFreshnessTransitions();
    const alert = await alertsRepository.findById(id);
    if (!alert) throw new AppError('Alert not found.', 404, 'ALERT_NOT_FOUND');
    if (alert.report.status === 'removed' && alert.report.author?.id !== viewerUserId) {
      throw new AppError('Alert not found.', 404, 'ALERT_NOT_FOUND');
    }

    const relatedTraffic = await alertsRepository.findRelatedTraffic({
      locationId: alert.location.id,
      roadName: alert.road?.name || null,
      limit: 5,
    });

    const potentialDuplicates = await alertsRepository.findPotentialDuplicates({
      locationId: alert.location.id,
      alertCategory: alert.alertCategory,
      excludeAlertId: alert.id,
      hours: 6,
    });

    return {
      ...alert,
      relatedTraffic: relatedTraffic.filter((t) => t.id !== alert.relatedTrafficReportId),
      linkedTraffic: alert.relatedTrafficReportId
        ? relatedTraffic.find((t) => t.id === alert.relatedTrafficReportId) ||
          (await trafficRepository.findById(alert.relatedTrafficReportId).catch(() => null))
        : null,
      relatedReports: potentialDuplicates.map((item) => ({
        id: item.id,
        title: item.report.title,
        severity: item.severity,
        status: item.report.status,
        createdAt: item.report.createdAt,
        trustLabels: item.report.trustLabels,
      })),
      relatedReportCount: potentialDuplicates.length,
    };
  },

  async confirm(userId, id, body) {
    const raw = await alertsRepository.findRawById(id);
    if (!raw) throw new AppError('Alert not found.', 404, 'ALERT_NOT_FOUND');
    await reportService.confirm(userId, raw.report_id, {
      type: normalizeConfirmType(body.type),
      note: body.note,
    });
    const alert = await this.getById(id, userId);
    realtimePublisher.alertUpdated(alert, { action: 'confirmed' });
    return alert;
  },

  async correct(userId, id, body) {
    const raw = await alertsRepository.findRawById(id);
    if (!raw) throw new AppError('Alert not found.', 404, 'ALERT_NOT_FOUND');
    await reportService.correct(userId, raw.report_id, {
      type: normalizeConfirmType(body.type),
      note: body.note,
    });
    const alert = await this.getById(id, userId);
    realtimePublisher.alertUpdated(alert, { action: 'corrected' });
    return alert;
  },

  async flag(userId, id, body) {
    const raw = await alertsRepository.findRawById(id);
    if (!raw) throw new AppError('Alert not found.', 404, 'ALERT_NOT_FOUND');
    await reportService.flag(userId, raw.report_id, body);
    return this.getById(id, userId);
  },

  async history(id, viewerUserId = null) {
    const alert = await this.getById(id, viewerUserId);
    const history = await reportService.history(alert.reportId, viewerUserId);
    return { alertId: alert.id, reportId: alert.reportId, events: history.events };
  },
};
