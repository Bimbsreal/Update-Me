import { AppError } from '../middleware/errorHandler.js';
import { getPool } from '../db/pool.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import { alertEngine } from './alertEngine.js';
import { listNotificationTemplates } from './notificationTemplates.js';
import { notificationRepository } from '../repositories/notificationRepository.js';
import { notificationService } from './notificationService.js';
import { pushService } from './pushService.js';
import { PER_EVENT_FANOUT_LIMIT } from '../config/notifications.js';

async function writeAudit(admin, payload, req) {
  if (!admin?.userId && !admin?.id) return null;
  try {
    const newState = payload.newState ? { ...payload.newState } : {};
    if (req?.requestId) newState.requestId = req.requestId;
    return await adminAuditRepository.create({
      actorUserId: admin.userId || admin.id,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId || null,
      previousState: payload.previousState || null,
      newState: Object.keys(newState).length ? newState : null,
      reason: payload.reason || null,
      ipAddress: req?.ip || null,
      userAgent: req?.get?.('user-agent') || req?.headers?.['user-agent'] || null,
    });
  } catch {
    return null;
  }
}

export const notificationAdminService = {
  async dashboard() {
    const metrics = await notificationRepository.adminMetrics();
    const rules = await alertEngine.listRules();
    return {
      metrics,
      rules: rules.slice(0, 20),
      templates: listNotificationTemplates(),
      pushConfigured: pushService.isConfigured(),
      pushActive: await pushService.countActive(),
    };
  },

  async listRules() {
    return { items: await alertEngine.listRules() };
  },

  async updateRule(admin, code, body, req) {
    const existing = await alertEngine.getRule(code);
    if (!existing) throw new AppError('Alert rule not found.', 404, 'NOT_FOUND');
    const reason = body.reason ? String(body.reason).trim() : null;
    if (!reason || reason.length < 3) {
      throw new AppError('A reason is required to change alert rules.', 400, 'VALIDATION_ERROR');
    }
    const updated = await alertEngine.upsertRule(
      {
        ...existing,
        ...body,
        code,
        category: existing.category,
      },
      admin?.userId || admin?.id || null
    );
    await writeAudit(
      admin,
      {
        action: 'notification.rule.update',
        entityType: 'notification_alert_rule',
        entityId: code,
        previousState: existing,
        newState: updated,
        reason,
      },
      req
    );
    return updated;
  },

  /**
   * Controlled emergency broadcast — requires confirmation + reason + location scope.
   * Never an unrestricted "send to everyone" without explicit confirm flag.
   */
  async sendEmergency(admin, body, req) {
    const reason = body.reason ? String(body.reason).trim() : '';
    if (reason.length < 8) {
      throw new AppError('Provide a clear reason (min 8 characters).', 400, 'VALIDATION_ERROR');
    }
    if (body.confirm !== true) {
      throw new AppError('Explicit confirm:true is required for emergency alerts.', 400, 'VALIDATION_ERROR');
    }
    const title = String(body.title || '').trim();
    const message = String(body.message || '').trim();
    if (title.length < 5 || message.length < 10) {
      throw new AppError('Title and message are required.', 400, 'VALIDATION_ERROR');
    }

    const locationId = body.locationId || null;
    const stateId = body.stateId || null;
    if (!locationId && !stateId && body.scope !== 'saved_places_only') {
      throw new AppError(
        'Emergency alerts require locationId, stateId, or scope=saved_places_only.',
        400,
        'VALIDATION_ERROR'
      );
    }

    const pool = getPool();
    let userIds = [];
    if (locationId) {
      const r = await pool.query(
        `SELECT DISTINCT user_id FROM saved_areas WHERE location_id = $1 AND notify_enabled = TRUE
         UNION
         SELECT DISTINCT user_id FROM saved_routes
         WHERE notify_enabled = TRUE
           AND (origin_location_id = $1 OR destination_location_id = $1)
         UNION
         SELECT DISTINCT user_id FROM user_alert_subscriptions
         WHERE enabled = TRUE AND location_id = $1`,
        [locationId]
      );
      userIds = r.rows.map((row) => row.user_id);
    } else if (stateId) {
      const r = await pool.query(
        `SELECT DISTINCT sa.user_id
         FROM saved_areas sa
         JOIN locations loc ON loc.id = sa.location_id
         WHERE sa.notify_enabled = TRUE AND loc.state_id = $1`,
        [stateId]
      );
      userIds = r.rows.map((row) => row.user_id);
    } else {
      const r = await pool.query(
        `SELECT DISTINCT user_id FROM saved_areas WHERE notify_enabled = TRUE`
      );
      userIds = r.rows.map((row) => row.user_id);
    }

    userIds = [...new Set(userIds)].slice(0, PER_EVENT_FANOUT_LIMIT);
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 48 * 3600 * 1000);

    const result = await notificationService.notifyEmergencyBroadcast({
      userIds,
      title,
      message,
      locationId,
      expiresAt,
      actorUserId: admin?.userId || admin?.id || null,
    });

    await writeAudit(
      admin,
      {
        action: 'notification.emergency.send',
        entityType: 'system_emergency',
        entityId: null,
        newState: {
          title,
          recipientCount: result.notified,
          locationId,
          stateId,
          scope: body.scope || null,
        },
        reason,
      },
      req
    );

    return {
      notified: result.notified,
      candidates: userIds.length,
      expiresAt: expiresAt.toISOString(),
    };
  },
};
