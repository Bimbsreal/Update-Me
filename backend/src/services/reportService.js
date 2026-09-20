import { AppError } from '../middleware/errorHandler.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { reportRepository } from '../repositories/reportRepository.js';
import { refreshCorroborationForReport } from './dataQualityService.js';

/** Controlled status transitions — history is always recorded by callers. */
const ALLOWED_TRANSITIONS = {
  submitted: ['active', 'flagged', 'under_review', 'removed'],
  active: ['confirmed', 'stale', 'expired', 'flagged', 'under_review', 'removed'],
  confirmed: ['active', 'stale', 'expired', 'flagged', 'under_review', 'removed'],
  stale: ['active', 'confirmed', 'expired', 'flagged', 'under_review', 'removed'],
  expired: ['flagged', 'under_review', 'removed'],
  flagged: ['under_review', 'active', 'removed'],
  under_review: ['active', 'flagged', 'removed'],
  removed: [],
};

/** Moderators may restore / reclassify without permanently deleting history. */
const MODERATOR_TRANSITIONS = {
  submitted: ['active', 'confirmed', 'flagged', 'under_review', 'removed', 'stale', 'expired'],
  active: ['confirmed', 'stale', 'expired', 'flagged', 'under_review', 'removed'],
  confirmed: ['active', 'stale', 'expired', 'flagged', 'under_review', 'removed'],
  stale: ['active', 'confirmed', 'expired', 'flagged', 'under_review', 'removed'],
  expired: ['active', 'confirmed', 'flagged', 'under_review', 'removed', 'stale'],
  flagged: ['under_review', 'active', 'confirmed', 'removed', 'stale', 'expired'],
  under_review: ['active', 'confirmed', 'flagged', 'removed', 'stale', 'expired'],
  removed: ['active', 'under_review', 'flagged'],
};

const OWNER_EDITABLE_STATUSES = new Set(['submitted', 'active', 'confirmed']);

function assertTransition(from, to, { asModerator = false } = {}) {
  const map = asModerator ? MODERATOR_TRANSITIONS : ALLOWED_TRANSITIONS;
  const allowed = map[from] || [];
  if (!allowed.includes(to)) {
    throw new AppError(
      `Status cannot move from ${from} to ${to}.`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }
}

function snapshot(raw) {
  if (!raw) return null;
  return {
    title: raw.title,
    description: raw.description,
    status: raw.status,
    locationId: raw.location_id,
    moderationState: raw.moderation_state,
    sourceType: raw.source_type,
    visibility: raw.visibility,
    occurredAt: raw.occurred_at,
    expiresAt: raw.expires_at,
  };
}

export const reportService = {
  listCategories: () => reportRepository.listCategories(),

  async create(userId, input) {
    const category = await reportRepository.findCategoryByCode(input.category);
    if (!category) {
      throw new AppError('Unknown report category.', 400, 'INVALID_CATEGORY');
    }

    const location = await locationRepository.findById(input.locationId);
    if (!location) {
      throw new AppError('Selected location was not found.', 404, 'LOCATION_NOT_FOUND');
    }

    // Users may only create community reports. Official/aggregated are reserved.
    const sourceType = 'community';
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
    if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new AppError('Occurrence time cannot be in the future.', 400, 'INVALID_OCCURRED_AT');
    }

    const ttlMinutes = category.default_ttl_minutes || 1440;
    const expiresAt = new Date(occurredAt.getTime() + ttlMinutes * 60 * 1000);

    // Prefer explicit approximate coords, else location coords — never private user coords.
    let latitude = input.latitude ?? null;
    let longitude = input.longitude ?? null;
    if (latitude == null && location.coordinates) {
      latitude = location.coordinates.lat;
      longitude = location.coordinates.lng;
    }

    const report = await reportRepository.create({
      userId,
      categoryId: category.id,
      locationId: input.locationId,
      title: input.title,
      description: input.description,
      sourceType,
      status: 'active',
      visibility: input.visibility || 'public',
      latitude,
      longitude,
      occurredAt,
      expiresAt,
      metadata: {
        ...(input.metadata || {}),
        engine: 'generic',
        categoryCode: category.code,
      },
    });

    await reportRepository.addHistory({
      reportId: report.id,
      actorUserId: userId,
      eventType: 'created',
      previousState: null,
      newState: snapshot(await reportRepository.findRawById(report.id)),
      reason: 'Report submitted',
    });

    try {
      await refreshCorroborationForReport(report.id);
    } catch (err) {
      console.error('[data-quality] corroboration refresh failed:', err?.message);
    }

    return reportRepository.findById(report.id);
  },

  async getById(id, viewerUserId = null) {
    await reportRepository.applyFreshnessTransitions();
    const report = await reportRepository.findById(id);
    if (!report) throw new AppError('Report not found.', 404, 'REPORT_NOT_FOUND');
    if (report.status === 'removed' && report.author?.id !== viewerUserId) {
      throw new AppError('Report not found.', 404, 'REPORT_NOT_FOUND');
    }
    return report;
  },

  async list(query) {
    await reportRepository.applyFreshnessTransitions();
    return reportRepository.list(query);
  },

  async nearby(query) {
    await reportRepository.applyFreshnessTransitions();
    return reportRepository.nearby(query);
  },

  async update(userId, id, input) {
    const raw = await reportRepository.findRawById(id);
    if (!raw) throw new AppError('Report not found.', 404, 'REPORT_NOT_FOUND');
    if (raw.user_id !== userId) {
      throw new AppError('You can only edit your own reports.', 403, 'FORBIDDEN');
    }
    if (!OWNER_EDITABLE_STATUSES.has(raw.status)) {
      throw new AppError(
        'This report can no longer be edited in its current status.',
        400,
        'NOT_EDITABLE'
      );
    }
    if (raw.source_type !== 'community') {
      throw new AppError('Only community reports can be edited here.', 403, 'FORBIDDEN');
    }

    if (input.locationId) {
      const location = await locationRepository.findById(input.locationId);
      if (!location) throw new AppError('Selected location was not found.', 404, 'LOCATION_NOT_FOUND');
    }

    const previous = snapshot(raw);
    const patch = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description;
    if (input.locationId !== undefined) patch.locationId = input.locationId;
    if (input.latitude !== undefined) patch.latitude = input.latitude;
    if (input.longitude !== undefined) patch.longitude = input.longitude;
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (input.occurredAt !== undefined) patch.occurredAt = input.occurredAt;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const updated = await reportRepository.update(id, patch);

    await reportRepository.addHistory({
      reportId: id,
      actorUserId: userId,
      eventType: 'updated',
      previousState: previous,
      newState: snapshot(await reportRepository.findRawById(id)),
      reason: 'Owner updated report details',
    });

    return updated;
  },

  async confirm(userId, id, { type, note }) {
    const raw = await reportRepository.findRawById(id);
    if (!raw) throw new AppError('Report not found.', 404, 'REPORT_NOT_FOUND');
    if (raw.status === 'removed' || raw.status === 'expired') {
      throw new AppError('This report cannot be confirmed in its current status.', 400, 'NOT_CONFIRMABLE');
    }
    if (raw.user_id === userId) {
      throw new AppError('You cannot confirm your own report.', 400, 'OWN_REPORT');
    }

    const result = await reportRepository.upsertConfirmation({
      reportId: id,
      userId,
      type,
      note,
    });

    if (result.duplicate) {
      throw new AppError(
        'You already submitted this confirmation for the report.',
        409,
        'DUPLICATE_CONFIRMATION'
      );
    }

    const counts = await reportRepository.recountConfirmations(id);
    const fields = {
      confirmedAccurateCount: counts.accurate,
      confirmedInaccurateCount: counts.inaccurate,
    };

    if (type === 'still_accurate') {
      fields.lastConfirmedAt = new Date();
      if (raw.status === 'submitted') {
        assertTransition('submitted', 'active');
        fields.status = 'active';
      } else if (raw.status === 'active' || raw.status === 'stale') {
        assertTransition(raw.status, 'confirmed');
        fields.status = 'confirmed';
      } else if (raw.status === 'confirmed') {
        // refresh confirmation only
      }
    }

    const updated = await reportRepository.update(id, fields);

    await reportRepository.addHistory({
      reportId: id,
      actorUserId: userId,
      eventType: 'confirmed',
      previousState: snapshot(raw),
      newState: snapshot(await reportRepository.findRawById(id)),
      reason: `Confirmation: ${type}`,
    });

    return updated;
  },

  async correct(userId, id, { type, note }) {
    return this.confirm(userId, id, { type, note });
  },

  async flag(userId, id, { reason, details }) {
    const raw = await reportRepository.findRawById(id);
    if (!raw) throw new AppError('Report not found.', 404, 'REPORT_NOT_FOUND');
    if (raw.status === 'removed') {
      throw new AppError('Removed reports cannot be flagged.', 400, 'NOT_FLAGGABLE');
    }

    const existing = await reportRepository.findFlag(id, userId);
    if (existing) {
      throw new AppError('You already flagged this report.', 409, 'DUPLICATE_FLAG');
    }

    await reportRepository.createFlag({ reportId: id, userId, reason, details });

    const fields = {
      flagCount: Number(raw.flag_count || 0) + 1,
      moderationState: 'flagged',
    };

    if (['submitted', 'active', 'confirmed', 'stale'].includes(raw.status)) {
      assertTransition(raw.status, 'flagged');
      fields.status = 'flagged';
    }

    const updated = await reportRepository.update(id, fields);

    await reportRepository.addHistory({
      reportId: id,
      actorUserId: userId,
      eventType: 'flagged',
      previousState: snapshot(raw),
      newState: snapshot(await reportRepository.findRawById(id)),
      reason: `Flagged: ${reason}`,
    });

    // Moderation hook payload for future queue workers
    return {
      report: updated,
      moderationHook: {
        type: 'report_flagged',
        reportId: id,
        reason,
        queued: true,
      },
    };
  },

  async history(id, viewerUserId = null) {
    const report = await this.getById(id, viewerUserId);
    const events = await reportRepository.listHistory(report.id);
    return { reportId: report.id, events };
  },

  async transitionStatus(
    actorUserId,
    id,
    nextStatus,
    reason,
    { asModerator = false, moderationState = null } = {}
  ) {
    const raw = await reportRepository.findRawById(id);
    if (!raw) throw new AppError('Report not found.', 404, 'REPORT_NOT_FOUND');
    if (!asModerator && raw.user_id !== actorUserId) {
      throw new AppError('Forbidden.', 403, 'FORBIDDEN');
    }
    assertTransition(raw.status, nextStatus, { asModerator });
    const fields = { status: nextStatus };
    if (moderationState) fields.moderationState = moderationState;
    const updated = await reportRepository.update(id, fields);
    await reportRepository.addHistory({
      reportId: id,
      actorUserId,
      eventType: 'status_changed',
      previousState: snapshot(raw),
      newState: snapshot(await reportRepository.findRawById(id)),
      reason: reason || `Status changed to ${nextStatus}`,
    });
    return updated;
  },
};
