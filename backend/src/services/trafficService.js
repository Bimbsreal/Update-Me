import { AppError } from '../middleware/errorHandler.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { reportRepository } from '../repositories/reportRepository.js';
import { trafficRepository } from '../repositories/trafficRepository.js';
import { reportService } from './reportService.js';
import { notificationService, safeNotify } from './notificationService.js';
import { realtimePublisher } from '../realtime/publisher.js';
import { refreshCorroborationForReport } from './dataQualityService.js';

const SEVERITY_LABELS = {
  clear: 'Clear',
  light: 'Light traffic',
  moderate: 'Moderate traffic',
  heavy: 'Heavy traffic',
  standstill: 'Standstill',
  blocked: 'Road blocked',
  unknown: 'Traffic update',
};

function buildDirectionLabel(input) {
  if (input.directionLabel) return input.directionLabel.trim();
  if (input.fromLabel && input.towardLabel) {
    return `${input.fromLabel.trim()} → ${input.towardLabel.trim()}`;
  }
  if (input.towardLabel) return `Toward ${input.towardLabel.trim()}`;
  if (input.fromLabel) return `From ${input.fromLabel.trim()}`;
  return null;
}

function buildTitle(input, directionLabel) {
  if (input.title?.trim()) return input.title.trim();
  const severity = SEVERITY_LABELS[input.severity] || 'Traffic update';
  const road = input.roadName?.trim();
  if (road && directionLabel) return `${severity} on ${road}`;
  if (road) return `${severity} — ${road}`;
  if (directionLabel) return `${severity} (${directionLabel})`;
  return severity;
}

function buildDescription(input, directionLabel) {
  if (input.notes?.trim()) return input.notes.trim();
  const parts = [];
  if (input.roadName) parts.push(`Road: ${input.roadName.trim()}`);
  if (directionLabel) parts.push(`Direction: ${directionLabel}`);
  if (input.affectedSection) parts.push(`Affected section: ${input.affectedSection.trim()}`);
  if (input.cause) parts.push(`Possible cause: ${input.cause.replace(/_/g, ' ')}`);
  if (input.estimatedDelayMinutes != null) {
    parts.push(`Estimated delay: about ${input.estimatedDelayMinutes} minutes`);
  }
  if (!parts.length) {
    return 'Community traffic update. Confirm if you are nearby and this still matches what you see.';
  }
  return parts.join('. ') + '.';
}

export const trafficService = {
  async create(userId, input) {
    const location = await locationRepository.findById(input.locationId);
    if (!location) {
      throw new AppError('Selected location was not found.', 404, 'LOCATION_NOT_FOUND');
    }

    for (const key of ['fromLocationId', 'towardLocationId']) {
      if (input[key]) {
        const loc = await locationRepository.findById(input[key]);
        if (!loc) {
          throw new AppError(`Invalid ${key}.`, 400, 'INVALID_LOCATION');
        }
      }
    }

    const directionLabel = buildDirectionLabel(input);
    const title = buildTitle(input, directionLabel);
    const description = buildDescription(input, directionLabel);

    const report = await reportService.create(userId, {
      category: 'traffic',
      title,
      description,
      locationId: input.locationId,
      latitude: input.latitude,
      longitude: input.longitude,
      metadata: {
        module: 'traffic',
        severity: input.severity,
        cause: input.cause || null,
      },
    });

    const traffic = await trafficRepository.create({
      reportId: report.id,
      severity: input.severity,
      cause: input.cause || null,
      roadId: input.roadId || null,
      roadName: input.roadName || null,
      directionLabel,
      fromLocationId: input.fromLocationId || null,
      towardLocationId: input.towardLocationId || null,
      fromLabel: input.fromLabel || null,
      towardLabel: input.towardLabel || null,
      affectedSection: input.affectedSection || null,
      estimatedDelayMinutes: input.estimatedDelayMinutes ?? null,
    });

    await reportRepository.addHistory({
      reportId: report.id,
      actorUserId: userId,
      eventType: 'system',
      previousState: null,
      newState: {
        trafficId: traffic.id,
        severity: input.severity,
        cause: input.cause || null,
      },
      reason: 'Traffic-specific details attached',
    });

    try {
      await refreshCorroborationForReport(report.id);
    } catch (err) {
      console.error('[data-quality] traffic corroboration refresh failed:', err?.message);
    }

    safeNotify(
      notificationService.notifyTrafficReport(
        {
          ...traffic,
          severity: input.severity,
          severityLabel: SEVERITY_LABELS[input.severity],
          locationId: input.locationId,
          location: traffic.location,
          road: traffic.road || { name: input.roadName },
        },
        { actorUserId: userId }
      )
    );

    realtimePublisher.trafficUpdated(traffic);

    return traffic;
  },

  async list(query) {
    await reportRepository.applyFreshnessTransitions();
    return trafficRepository.list(query);
  },

  async nearby(query) {
    await reportRepository.applyFreshnessTransitions();
    return trafficRepository.nearby(query);
  },

  async summary(query) {
    await reportRepository.applyFreshnessTransitions();
    return trafficRepository.summary(query);
  },

  async getById(id, viewerUserId = null) {
    await reportRepository.applyFreshnessTransitions();
    const traffic = await trafficRepository.findById(id);
    if (!traffic) throw new AppError('Traffic report not found.', 404, 'TRAFFIC_NOT_FOUND');
    if (traffic.report.status === 'removed' && traffic.report.author?.id !== viewerUserId) {
      throw new AppError('Traffic report not found.', 404, 'TRAFFIC_NOT_FOUND');
    }

    try {
      const { conflictForReport } = await import('./dataQualityService.js');
      const conflict = await conflictForReport({
        location_id: traffic.location?.id,
        category_code: 'traffic',
      });
      if (conflict) {
        traffic.conflict = conflict;
        if (traffic.report?.about) {
          const { buildAboutLines } = await import('./dataQualityService.js');
          traffic.report.about = buildAboutLines(traffic.report.quality, { conflict });
        }
      }
    } catch (err) {
      console.error('[data-quality] conflict lookup failed:', err?.message);
    }

    return traffic;
  },

  async confirm(userId, id, body) {
    const raw = await trafficRepository.findRawById(id);
    if (!raw) throw new AppError('Traffic report not found.', 404, 'TRAFFIC_NOT_FOUND');
    await reportService.confirm(userId, raw.report_id, body);
    const traffic = await this.getById(id, userId);
    realtimePublisher.trafficUpdated(traffic, { action: 'confirmed' });
    realtimePublisher.reportConfirmed(traffic);
    return traffic;
  },

  async correct(userId, id, body) {
    const raw = await trafficRepository.findRawById(id);
    if (!raw) throw new AppError('Traffic report not found.', 404, 'TRAFFIC_NOT_FOUND');
    await reportService.correct(userId, raw.report_id, body);
    const traffic = await this.getById(id, userId);
    realtimePublisher.trafficUpdated(traffic, { action: 'corrected' });
    return traffic;
  },

  async history(id, viewerUserId = null) {
    const traffic = await this.getById(id, viewerUserId);
    const history = await reportService.history(traffic.reportId, viewerUserId);
    return { trafficId: traffic.id, reportId: traffic.reportId, events: history.events };
  },
};
