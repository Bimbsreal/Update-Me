import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { MODERATION_ACTIONS, ADMIN_ROLES, permissionsForRole } from '../config/admin.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import { reportService } from './reportService.js';
import { officialService } from './officialService.js';
import { officialSyncService } from './officialSyncService.js';
import { fxService } from './fxService.js';
import { fxSyncService } from './fxSyncService.js';
import { officialRepository } from '../repositories/officialRepository.js';

function metaFromReq(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.get?.('user-agent') || null,
  };
}

async function writeAudit(admin, { action, entityType, entityId, previousState, newState, reason }, req) {
  const m = metaFromReq(req);
  return adminAuditRepository.create({
    actorUserId: admin?.userId || null,
    action,
    entityType,
    entityId: entityId || null,
    previousState: previousState || null,
    newState: newState || null,
    reason: reason || null,
    ipAddress: m.ipAddress,
    userAgent: m.userAgent,
  });
}

function mapReportRow(r) {
  return {
    id: r.id,
    contentType: 'report',
    category: r.category_code,
    categoryName: r.category_name,
    title: r.title,
    summary: r.description ? String(r.description).slice(0, 180) : null,
    location: r.location_name
      ? { id: r.location_id, name: r.location_name }
      : r.location_id
        ? { id: r.location_id, name: null }
        : null,
    creator: r.user_display_name
      ? { id: r.user_id, displayName: r.user_display_name }
      : null,
    sourceType: r.source_type,
    status: r.status,
    moderationState: r.moderation_state,
    flagCount: Number(r.flag_count || 0),
    confirmationCount: Number(r.confirmed_accurate_count || r.confirmation_count || 0),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    reason: r.latest_flag_reason || r.moderation_state || null,
  };
}

export const adminService = {
  getRoles() {
    return ADMIN_ROLES.map((r) => ({
      ...r,
      permissions: permissionsForRole(r.code),
    }));
  },

  async dashboard() {
    const pool = getPool();
    const [
      awaiting,
      flagged,
      activeAlerts,
      sourceHealth,
      syncFails,
      users,
      recentReports,
      stale,
      openFlags,
      questionsFlagged,
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS c FROM reports
         WHERE status IN ('flagged', 'under_review') OR moderation_state IN ('flagged', 'queued', 'in_review')`
      ),
      pool.query(`SELECT COUNT(*)::int AS c FROM reports WHERE status = 'flagged' OR moderation_state = 'flagged'`),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM reports r
         JOIN report_categories c ON c.id = r.category_id
         WHERE c.code = 'local_alerts' AND r.status IN ('active', 'confirmed', 'submitted')`
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('active','approved'))::int AS active,
           COUNT(*) FILTER (WHERE consecutive_failures > 0)::int AS failing,
           COUNT(*) FILTER (WHERE verification_status = 'verified')::int AS verified,
           COUNT(*)::int AS total
         FROM official_sources`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM official_sync_runs
         WHERE status = 'failed' AND started_at > NOW() - INTERVAL '7 days'`
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE suspended_at IS NOT NULL)::int AS suspended,
           COUNT(*) FILTER (WHERE admin_role IS NOT NULL OR is_moderator)::int AS staff
         FROM users WHERE is_active = TRUE`
      ),
      pool.query(
        `SELECT r.id, r.title, r.status, r.created_at, c.code AS category_code, c.name AS category_name,
                loc.name AS location_name
         FROM reports r
         JOIN report_categories c ON c.id = r.category_id
         LEFT JOIN locations loc ON loc.id = r.location_id
         ORDER BY r.created_at DESC LIMIT 8`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM reports
         WHERE status = 'stale'
            OR (expires_at IS NOT NULL AND expires_at < NOW() AND status IN ('active','confirmed','submitted'))`
      ),
      pool.query(`SELECT COUNT(*)::int AS c FROM report_flags WHERE status = 'open'`),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM questions WHERE status IN ('flagged','under_review')`
      ),
    ]);

    const health = sourceHealth.rows[0] || {};
    const userStats = users.rows[0] || {};

    return {
      reportsAwaitingReview: awaiting.rows[0]?.c || 0,
      flaggedReports: flagged.rows[0]?.c || 0,
      openFlags: openFlags.rows[0]?.c || 0,
      activeAlerts: activeAlerts.rows[0]?.c || 0,
      flaggedQuestions: questionsFlagged.rows[0]?.c || 0,
      officialSourceHealth: {
        total: health.total || 0,
        active: health.active || 0,
        verified: health.verified || 0,
        failing: health.failing || 0,
      },
      recentSyncFailures: syncFails.rows[0]?.c || 0,
      users: {
        total: userStats.total || 0,
        suspended: userStats.suspended || 0,
        staff: userStats.staff || 0,
      },
      staleOrExpiring: stale.rows[0]?.c || 0,
      recentReports: recentReports.rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        category: r.category_code,
        locationName: r.location_name,
        createdAt: r.created_at,
      })),
    };
  },

  async dataQuality(filters = {}) {
    const { dataQualityService } = await import('./dataQualityService.js');
    const summary = await dataQualityService.adminQualitySummary();
    const pool = getPool();
    const [incompleteLoc, dupStations] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS c FROM locations
         WHERE (latitude IS NULL OR longitude IS NULL) AND type IN ('area','place','landmark','road')`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM (
           SELECT lower(trim(name)), location_id FROM fuel_stations
           WHERE is_active = TRUE
           GROUP BY lower(trim(name)), location_id HAVING COUNT(*) > 1
         ) d`
      ),
    ]);

    return {
      ...summary,
      unresolvedFlags: summary.awaitingReview,
      incompleteLocations: incompleteLoc.rows[0]?.c || 0,
      duplicateStationCandidates: dupStations.rows[0]?.c || 0,
      filtersApplied: filters,
    };
  },

  async dataQualityReports(query = {}) {
    const { dataQualityService } = await import('./dataQualityService.js');
    const items = await dataQualityService.adminListByFreshness({
      freshnessState: query.freshness || query.status,
      category: query.category,
      stateId: query.stateId,
      lgaId: query.lgaId,
      areaId: query.areaId,
      sourceType: query.source || query.sourceType,
      from: query.from,
      to: query.to,
      limit: query.limit,
      offset: query.offset,
    });
    return { items, total: items.length };
  },

  async dataQualityConflicts(query = {}) {
    const { dataQualityService } = await import('./dataQualityService.js');
    const conflicts = await dataQualityService.findConflicts({
      categoryCode: query.category || 'traffic',
      stateId: query.stateId,
      lgaId: query.lgaId,
      areaId: query.areaId,
      locationId: query.locationId,
      windowMinutes: Number(query.windowMinutes) || 90,
      limit: Number(query.limit) || 40,
    });
    return { conflicts };
  },

  async dataQualityStale(query = {}) {
    return this.dataQualityReports({ ...query, freshness: 'stale' });
  },

  async dataQualityExpired(query = {}) {
    return this.dataQualityReports({ ...query, freshness: 'expired' });
  },

  async moderationQueue({ limit = 40, offset = 0, type } = {}) {
    const pool = getPool();
    const items = [];

    if (!type || type === 'report' || type === 'alert') {
      const catFilter =
        type === 'alert'
          ? `AND c.code = 'local_alerts'`
          : type === 'report'
            ? `AND c.code <> 'local_alerts'`
            : '';
      const reports = await pool.query(
        `SELECT r.*, c.code AS category_code, c.name AS category_name,
                loc.name AS location_name, u.display_name AS user_display_name,
                (
                  SELECT f.reason::text FROM report_flags f
                  WHERE f.report_id = r.id AND f.status = 'open'
                  ORDER BY f.created_at DESC LIMIT 1
                ) AS latest_flag_reason
         FROM reports r
         JOIN report_categories c ON c.id = r.category_id
         LEFT JOIN locations loc ON loc.id = r.location_id
         LEFT JOIN users u ON u.id = r.user_id
         WHERE (
           r.status IN ('flagged', 'under_review')
           OR r.moderation_state IN ('flagged', 'queued', 'in_review')
           OR EXISTS (SELECT 1 FROM report_flags f WHERE f.report_id = r.id AND f.status = 'open')
         )
         ${catFilter}
         ORDER BY r.updated_at DESC
         LIMIT 80`
      );
      for (const r of reports.rows) {
        items.push({
          ...mapReportRow(r),
          contentType: r.category_code === 'local_alerts' ? 'alert' : 'report',
          queueId: `report:${r.id}`,
        });
      }
    }

    if (!type || type === 'question') {
      const qs = await pool.query(
        `SELECT q.id, q.title, q.description, q.status, q.moderation_state, q.flag_count, q.created_at,
                q.category::text AS category_code, loc.name AS location_name, loc.id AS location_id,
                u.id AS user_id, u.display_name AS user_display_name
         FROM questions q
         LEFT JOIN locations loc ON loc.id = q.location_id
         LEFT JOIN users u ON u.id = q.user_id
         WHERE q.status IN ('flagged', 'under_review')
            OR q.moderation_state IN ('flagged', 'queued', 'in_review')
         ORDER BY q.updated_at DESC LIMIT 40`
      );
      for (const q of qs.rows) {
        items.push({
          id: q.id,
          queueId: `question:${q.id}`,
          contentType: 'question',
          category: q.category_code,
          title: q.title,
          summary: q.description ? String(q.description).slice(0, 180) : null,
          location: q.location_id ? { id: q.location_id, name: q.location_name } : null,
          creator: q.user_id ? { id: q.user_id, displayName: q.user_display_name } : null,
          status: q.status,
          moderationState: q.moderation_state,
          flagCount: Number(q.flag_count || 0),
          createdAt: q.created_at,
          reason: 'Community question flagged or under review',
        });
      }
    }

    if (!type || type === 'answer') {
      const ans = await pool.query(
        `SELECT a.id, a.content, a.status, a.moderation_state, a.created_at,
                a.question_id, q.title AS question_title,
                loc.name AS location_name, loc.id AS location_id,
                u.id AS user_id, u.display_name AS user_display_name
         FROM answers a
         JOIN questions q ON q.id = a.question_id
         LEFT JOIN locations loc ON loc.id = COALESCE(a.location_id, q.location_id)
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.status IN ('flagged', 'under_review', 'removed')
            OR a.moderation_state IN ('flagged', 'queued', 'in_review')
         ORDER BY a.updated_at DESC LIMIT 40`
      );
      for (const a of ans.rows) {
        items.push({
          id: a.id,
          queueId: `answer:${a.id}`,
          contentType: 'answer',
          category: 'community',
          title: a.question_title || 'Answer',
          summary: a.content ? String(a.content).slice(0, 180) : null,
          location: a.location_id ? { id: a.location_id, name: a.location_name } : null,
          creator: a.user_id ? { id: a.user_id, displayName: a.user_display_name } : null,
          status: a.status,
          moderationState: a.moderation_state,
          flagCount: 0,
          createdAt: a.created_at,
          reason: 'Community answer requires review',
          questionId: a.question_id,
        });
      }
    }

    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = items.length;
    const page = items.slice(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 40));
    return { items: page, total, limit: Number(limit) || 40, offset: Number(offset) || 0 };
  },

  async moderationAction(admin, queueId, { action, reason }, req) {
    const def = MODERATION_ACTIONS.find((a) => a.code === action);
    if (!def) throw new AppError('Unknown moderation action.', 400, 'VALIDATION_ERROR');
    if (!reason || String(reason).trim().length < 3) {
      throw new AppError('A reason is required for moderation actions.', 400, 'VALIDATION_ERROR');
    }

    const [contentType, id] = String(queueId).includes(':')
      ? String(queueId).split(':')
      : ['report', queueId];

    if (contentType === 'report' || contentType === 'alert') {
      const raw = await getPool().query(`SELECT * FROM reports WHERE id = $1`, [id]);
      const report = raw.rows[0];
      if (!report) throw new AppError('Report not found.', 404, 'NOT_FOUND');
      const prev = {
        status: report.status,
        moderationState: report.moderation_state,
      };

      let nextStatus = def.nextStatus;
      let moderationState = def.moderationState;
      if (action === 'dismiss_flag') {
        nextStatus = ['flagged', 'under_review'].includes(report.status) ? 'active' : report.status;
        moderationState = 'cleared';
      }

      if (nextStatus && nextStatus !== report.status) {
        await reportService.transitionStatus(admin.userId, id, nextStatus, reason, {
          asModerator: true,
          moderationState,
        });
      } else if (moderationState) {
        await getPool().query(
          `UPDATE reports SET moderation_state = $2, updated_at = NOW() WHERE id = $1`,
          [id, moderationState]
        );
      }

      if (['approve', 'confirm', 'dismiss_flag', 'restore'].includes(action)) {
        await getPool().query(
          `UPDATE report_flags SET status = 'reviewed', reviewed_at = NOW()
           WHERE report_id = $1 AND status = 'open'`,
          [id]
        );
      } else if (['remove', 'mark_inaccurate', 'mark_duplicate'].includes(action)) {
        await getPool().query(
          `UPDATE report_flags SET status = 'actioned', reviewed_at = NOW()
           WHERE report_id = $1 AND status = 'open'`,
          [id]
        );
      }

      const after = await getPool().query(
        `SELECT status, moderation_state FROM reports WHERE id = $1`,
        [id]
      );
      await writeAudit(
        admin,
        {
          action: `moderation.${action}`,
          entityType: 'report',
          entityId: id,
          previousState: prev,
          newState: after.rows[0],
          reason,
        },
        req
      );
      return { contentType: 'report', id, status: after.rows[0]?.status, action };
    }

    if (contentType === 'question') {
      const prevRes = await getPool().query(`SELECT status, moderation_state FROM questions WHERE id = $1`, [
        id,
      ]);
      if (!prevRes.rows[0]) throw new AppError('Question not found.', 404, 'NOT_FOUND');
      const prev = prevRes.rows[0];
      let status = prev.status;
      let moderationState = def.moderationState || prev.moderation_state;
      if (['approve', 'restore', 'dismiss_flag'].includes(action)) {
        status = 'open';
        moderationState = 'cleared';
      } else if (['remove', 'mark_inaccurate', 'mark_duplicate'].includes(action)) {
        status = 'removed';
        moderationState = 'actioned';
      } else if (action === 'under_review') {
        status = 'under_review';
        moderationState = 'in_review';
      } else if (action === 'confirm') {
        status = 'answered';
        moderationState = 'cleared';
      }
      await getPool().query(
        `UPDATE questions SET status = $2::community_question_status,
           moderation_state = $3::community_moderation_state, updated_at = NOW()
         WHERE id = $1`,
        [id, status, moderationState]
      );
      await writeAudit(
        admin,
        {
          action: `moderation.${action}`,
          entityType: 'question',
          entityId: id,
          previousState: prev,
          newState: { status, moderationState },
          reason,
        },
        req
      );
      return { contentType: 'question', id, status, action };
    }

    if (contentType === 'answer') {
      const prevRes = await getPool().query(`SELECT status, moderation_state FROM answers WHERE id = $1`, [
        id,
      ]);
      if (!prevRes.rows[0]) throw new AppError('Answer not found.', 404, 'NOT_FOUND');
      const prev = prevRes.rows[0];
      let status = prev.status;
      let moderationState = def.moderationState || prev.moderation_state;
      if (['approve', 'restore', 'dismiss_flag', 'confirm'].includes(action)) {
        status = 'active';
        moderationState = 'cleared';
      } else if (['remove', 'mark_inaccurate', 'mark_duplicate'].includes(action)) {
        status = 'removed';
        moderationState = 'actioned';
      } else if (action === 'under_review') {
        status = 'under_review';
        moderationState = 'in_review';
      }
      await getPool().query(
        `UPDATE answers SET status = $2::community_answer_status,
           moderation_state = $3::community_moderation_state, updated_at = NOW()
         WHERE id = $1`,
        [id, status, moderationState]
      );
      await writeAudit(
        admin,
        {
          action: `moderation.${action}`,
          entityType: 'answer',
          entityId: id,
          previousState: prev,
          newState: { status, moderationState },
          reason,
        },
        req
      );
      return { contentType: 'answer', id, status, action };
    }

    throw new AppError('Unsupported moderation target.', 400, 'VALIDATION_ERROR');
  },

  async listReports(filters = {}) {
    const {
      category,
      status,
      sourceType,
      locationId,
      userId,
      flagged,
      q,
      from,
      to,
      page = 1,
      limit = 30,
    } = filters;
    const params = [];
    const where = [];
    if (category) {
      params.push(category);
      where.push(`c.code = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`r.status = $${params.length}`);
    }
    if (sourceType) {
      params.push(sourceType);
      where.push(`r.source_type = $${params.length}`);
    }
    if (locationId) {
      params.push(locationId);
      where.push(`r.location_id = $${params.length}`);
    }
    if (userId) {
      params.push(userId);
      where.push(`r.user_id = $${params.length}`);
    }
    if (flagged === true || flagged === 'true') {
      where.push(
        `(r.status = 'flagged' OR r.moderation_state = 'flagged' OR EXISTS (SELECT 1 FROM report_flags f WHERE f.report_id = r.id AND f.status = 'open'))`
      );
    }
    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(`(r.title ILIKE $${params.length} OR r.description ILIKE $${params.length})`);
    }
    if (from) {
      params.push(from);
      where.push(`r.created_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      where.push(`r.created_at <= $${params.length}::timestamptz`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);
    const result = await getPool().query(
      `SELECT r.id, r.title, r.description, r.status, r.moderation_state, r.source_type,
              r.flag_count, r.confirmed_accurate_count, r.created_at, r.expires_at,
              r.user_id, r.location_id, c.code AS category_code, c.name AS category_name,
              loc.name AS location_name, u.display_name AS user_display_name
       FROM reports r
       JOIN report_categories c ON c.id = r.category_id
       LEFT JOIN locations loc ON loc.id = r.location_id
       LEFT JOIN users u ON u.id = r.user_id
       ${whereSql}
       ORDER BY r.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countParams = params.slice(0, -2);
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total
       FROM reports r
       JOIN report_categories c ON c.id = r.category_id
       ${whereSql}`,
      countParams
    );
    return {
      items: result.rows.map(mapReportRow),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async listAlerts(filters = {}) {
    return this.listReports({ ...filters, category: 'local_alerts' });
  },

  async alertAction(admin, id, body, req) {
    return this.moderationAction(admin, `report:${id}`, body, req);
  },

  async listUsers({ q, status, role, page = 1, limit = 30 } = {}) {
    const params = [];
    const where = [`u.is_active = TRUE`];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(
        `(u.display_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.phone ILIKE $${params.length})`
      );
    }
    if (status === 'suspended') where.push(`u.suspended_at IS NOT NULL`);
    if (status === 'active') where.push(`u.suspended_at IS NULL`);
    if (role) {
      params.push(role);
      where.push(`u.admin_role = $${params.length}::admin_role`);
    }
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const result = await getPool().query(
      `SELECT u.id, u.display_name, u.email, u.phone, u.admin_role, u.is_moderator,
              u.suspended_at, u.suspension_reason, u.created_at, u.onboarding_completed,
              a.name AS area_name, s.name AS state_name
       FROM users u
       LEFT JOIN areas a ON a.id = u.current_area_id
       LEFT JOIN states s ON s.id = a.state_id
       ${whereSql}
       ORDER BY u.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM users u ${whereSql}`,
      params.slice(0, -2)
    );
    return {
      items: result.rows.map((u) => ({
        id: u.id,
        displayName: u.display_name,
        email: u.email,
        phone: u.phone ? `${String(u.phone).slice(0, 4)}****` : null,
        adminRole: u.admin_role,
        isModerator: Boolean(u.is_moderator),
        isSuspended: Boolean(u.suspended_at),
        suspensionReason: u.suspension_reason,
        onboardingCompleted: u.onboarding_completed,
        areaName: u.area_name,
        stateName: u.state_name,
        createdAt: u.created_at,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async getUser(id) {
    const result = await getPool().query(
      `SELECT u.id, u.display_name, u.email, u.phone, u.admin_role, u.is_moderator,
              u.suspended_at, u.suspension_reason, u.created_at, u.onboarding_completed,
              a.name AS area_name
       FROM users u
       LEFT JOIN areas a ON a.id = u.current_area_id
       WHERE u.id = $1`,
      [id]
    );
    const u = result.rows[0];
    if (!u) throw new AppError('User not found.', 404, 'NOT_FOUND');
    const history = await getPool().query(
      `SELECT action, entity_type, entity_id, reason, created_at
       FROM admin_audit_log
       WHERE entity_type = 'user' AND entity_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [id]
    );
    return {
      id: u.id,
      displayName: u.display_name,
      email: u.email,
      phone: u.phone ? `${String(u.phone).slice(0, 4)}****` : null,
      adminRole: u.admin_role,
      isModerator: Boolean(u.is_moderator),
      isSuspended: Boolean(u.suspended_at),
      suspensionReason: u.suspension_reason,
      onboardingCompleted: u.onboarding_completed,
      areaName: u.area_name,
      createdAt: u.created_at,
      moderationHistory: history.rows.map((h) => ({
        action: h.action,
        entityType: h.entity_type,
        entityId: h.entity_id,
        reason: h.reason,
        createdAt: h.created_at,
      })),
    };
  },

  async suspendUser(admin, id, { reason }, req) {
    if (!reason || String(reason).trim().length < 3) {
      throw new AppError('Suspension reason is required.', 400, 'VALIDATION_ERROR');
    }
    if (admin.userId === id) {
      throw new AppError('You cannot suspend your own account.', 400, 'VALIDATION_ERROR');
    }
    const target = await getPool().query(
      `SELECT id, admin_role, suspended_at FROM users WHERE id = $1`,
      [id]
    );
    if (!target.rows[0]) throw new AppError('User not found.', 404, 'NOT_FOUND');
    if (target.rows[0].admin_role === 'super_admin' && admin.role !== 'super_admin') {
      throw new AppError('Only a Super Admin can suspend a Super Admin.', 403, 'FORBIDDEN');
    }
    await getPool().query(
      `UPDATE users SET suspended_at = NOW(), suspension_reason = $2, updated_at = NOW() WHERE id = $1`,
      [id, reason.trim()]
    );
    await writeAudit(
      admin,
      {
        action: 'user.suspend',
        entityType: 'user',
        entityId: id,
        previousState: { suspended: Boolean(target.rows[0].suspended_at) },
        newState: { suspended: true },
        reason,
      },
      req
    );
    return this.getUser(id);
  },

  async restoreUser(admin, id, { reason }, req) {
    const target = await getPool().query(
      `SELECT id, suspended_at FROM users WHERE id = $1`,
      [id]
    );
    if (!target.rows[0]) throw new AppError('User not found.', 404, 'NOT_FOUND');
    await getPool().query(
      `UPDATE users SET suspended_at = NULL, suspension_reason = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await writeAudit(
      admin,
      {
        action: 'user.restore',
        entityType: 'user',
        entityId: id,
        previousState: { suspended: Boolean(target.rows[0].suspended_at) },
        newState: { suspended: false },
        reason: reason || 'Account restored',
      },
      req
    );
    return this.getUser(id);
  },

  async setUserRole(admin, id, { role, reason }, req) {
    if (admin.role !== 'super_admin') {
      throw new AppError('Only Super Admin can assign roles.', 403, 'FORBIDDEN');
    }
    const allowed = ADMIN_ROLES.map((r) => r.code);
    if (role !== null && role !== '' && !allowed.includes(role)) {
      throw new AppError('Invalid admin role.', 400, 'VALIDATION_ERROR');
    }
    const prev = await getPool().query(`SELECT admin_role, is_moderator FROM users WHERE id = $1`, [id]);
    if (!prev.rows[0]) throw new AppError('User not found.', 404, 'NOT_FOUND');
    const nextRole = role || null;
    await getPool().query(
      `UPDATE users
       SET admin_role = $2::admin_role,
           is_moderator = ($2::admin_role IS NOT NULL),
           updated_at = NOW()
       WHERE id = $1`,
      [id, nextRole]
    );
    await writeAudit(
      admin,
      {
        action: 'user.set_role',
        entityType: 'user',
        entityId: id,
        previousState: { adminRole: prev.rows[0].admin_role },
        newState: { adminRole: nextRole },
        reason: reason || 'Role updated',
      },
      req
    );
    return this.getUser(id);
  },

  async listOfficialSources() {
    const sources = await officialRepository.listSources({ includeInactive: true });
    return sources.map((s) => ({
      id: s.id,
      organizationName: s.organizationName,
      shortName: s.shortName,
      agencyType: s.agencyType,
      jurisdictionLevel: s.jurisdictionLevel,
      ingestionMethod: s.ingestionMethod,
      providerKey: s.providerKey,
      status: s.status,
      verificationStatus: s.verificationStatus,
      syncIntervalMinutes: s.syncIntervalMinutes,
      lastSuccessAt: s.lastSuccessAt,
      lastAttemptAt: s.lastAttemptAt,
      lastFailureAt: s.lastFailureAt,
      lastErrorMessage: s.lastErrorMessage,
      consecutiveFailures: s.consecutiveFailures,
      healthStatus: s.healthStatus || 'unknown',
      officialWebsite: s.officialWebsite,
      feedUrl: s.feedUrl,
      // Never expose config secrets / credentials
    }));
  },

  async listIngestionRuns(filters = {}) {
    return officialRepository.listSyncRuns(filters);
  },

  async createOfficialSource(admin, body, req) {
    const source = await officialService.createSource(body, { userId: admin.userId });
    await writeAudit(
      admin,
      {
        action: 'official_source.create',
        entityType: 'official_source',
        entityId: null,
        newState: { id: source.id, status: source.status },
        reason: body.notes || 'Official source created',
      },
      req
    );
    return source;
  },

  async updateOfficialSource(admin, id, body, req) {
    const prev = await officialService.getSource(id);
    const source = await officialService.updateSource(id, body, { userId: admin.userId });
    await writeAudit(
      admin,
      {
        action: 'official_source.update',
        entityType: 'official_source',
        entityId: null,
        previousState: { id: prev.id, status: prev.status, verificationStatus: prev.verificationStatus },
        newState: { id: source.id, status: source.status, verificationStatus: source.verificationStatus },
        reason: body.notes || 'Official source updated',
      },
      req
    );
    return source;
  },

  async syncOfficialSource(admin, id, req) {
    const result = id
      ? await officialSyncService.syncSource(id)
      : await officialSyncService.syncAllActive();
    await writeAudit(
      admin,
      {
        action: 'official_source.sync',
        entityType: 'official_source',
        entityId: null,
        newState: { sourceId: id || 'all', status: result.status || result?.results?.[0]?.status },
        reason: 'Manual synchronization',
      },
      req
    );
    return result;
  },

  async listOfficialUpdates(filters = {}) {
    const { agency, category, locationId, q, status, page = 1, limit = 30 } = filters;
    const params = [];
    const where = [];
    if (agency) {
      params.push(`%${String(agency).trim()}%`);
      where.push(
        `(ou.source_id ILIKE $${params.length} OR os.short_name ILIKE $${params.length} OR os.organization_name ILIKE $${params.length})`
      );
    }
    if (category) {
      params.push(category);
      where.push(`ou.category = $${params.length}`);
    }
    if (locationId) {
      params.push(locationId);
      where.push(`ou.location_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`ou.status = $${params.length}`);
    }
    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(`(ou.title ILIKE $${params.length} OR ou.summary ILIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);
    const result = await getPool().query(
      `SELECT ou.id, ou.title, ou.summary, ou.category, ou.status, ou.original_url,
              ou.published_at, ou.retrieved_at, ou.source_id, ou.source_metadata,
              ou.location_id, loc.name AS location_name,
              os.organization_name, os.short_name
       FROM official_updates ou
       JOIN official_sources os ON os.id = ou.source_id
       LEFT JOIN locations loc ON loc.id = ou.location_id
       ${whereSql}
       ORDER BY ou.published_at DESC NULLS LAST, ou.retrieved_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total
       FROM official_updates ou
       JOIN official_sources os ON os.id = ou.source_id
       ${whereSql}`,
      params.slice(0, -2)
    );
    return {
      items: result.rows.map((u) => ({
        id: u.id,
        title: u.title,
        summary: u.summary,
        category: u.category,
        status: u.status,
        originalUrl: u.original_url,
        publishedAt: u.published_at,
        retrievedAt: u.retrieved_at,
        sourceId: u.source_id,
        agency: u.short_name || u.organization_name,
        location: u.location_id ? { id: u.location_id, name: u.location_name } : null,
        syncMetadata: {
          retrievedAt: u.retrieved_at,
          hasMetadata: Boolean(u.source_metadata && Object.keys(u.source_metadata).length),
        },
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async hideOfficialUpdate(admin, id, { reason }, req) {
    if (!reason || String(reason).trim().length < 3) {
      throw new AppError('Reason required to hide an official update.', 400, 'VALIDATION_ERROR');
    }
    const prev = await getPool().query(
      `SELECT id, status, title, original_url FROM official_updates WHERE id = $1`,
      [id]
    );
    if (!prev.rows[0]) throw new AppError('Official update not found.', 404, 'NOT_FOUND');
    // Archive/withdraw only — never rewrite agency wording; preserve original URL
    await getPool().query(
      `UPDATE official_updates SET status = 'archived', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await writeAudit(
      admin,
      {
        action: 'official_update.hide',
        entityType: 'official_update',
        entityId: id,
        previousState: { status: prev.rows[0].status, originalUrl: prev.rows[0].original_url },
        newState: { status: 'archived', originalUrl: prev.rows[0].original_url },
        reason,
      },
      req
    );
    return { id, status: 'archived', originalUrl: prev.rows[0].original_url };
  },

  async restoreOfficialUpdate(admin, id, { reason }, req) {
    const prev = await getPool().query(
      `SELECT id, status, original_url FROM official_updates WHERE id = $1`,
      [id]
    );
    if (!prev.rows[0]) throw new AppError('Official update not found.', 404, 'NOT_FOUND');
    await getPool().query(
      `UPDATE official_updates SET status = 'published', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await writeAudit(
      admin,
      {
        action: 'official_update.restore',
        entityType: 'official_update',
        entityId: id,
        previousState: { status: prev.rows[0].status },
        newState: { status: 'published' },
        reason: reason || 'Restored to public display',
      },
      req
    );
    return { id, status: 'published', originalUrl: prev.rows[0].original_url };
  },

  async fxStatus() {
    return fxService.getAdminStatus();
  },

  async fxSync(admin, req) {
    const result = await fxSyncService.syncAll();
    await writeAudit(
      admin,
      {
        action: 'fx.sync',
        entityType: 'fx',
        entityId: null,
        newState: { status: result.status },
        reason: 'Manual FX synchronization',
      },
      req
    );
    return result;
  },

  async listLocations({ q, type, page = 1, limit = 40 } = {}) {
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(`(loc.name ILIKE $${params.length} OR loc.slug ILIKE $${params.length})`);
    }
    if (type) {
      params.push(type);
      where.push(`loc.type = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 40, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);
    const result = await getPool().query(
      `SELECT loc.id, loc.name, loc.type, loc.latitude, loc.longitude,
              s.name AS state_name, l.name AS lga_name, a.name AS area_name
       FROM locations loc
       LEFT JOIN states s ON s.id = loc.state_id
       LEFT JOIN lgas l ON l.id = loc.lga_id
       LEFT JOIN areas a ON a.id = loc.area_id
       ${whereSql}
       ORDER BY loc.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM locations loc ${whereSql}`,
      params.slice(0, -2)
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        coordinates:
          r.latitude != null && r.longitude != null
            ? { lat: Number(r.latitude), lng: Number(r.longitude) }
            : null,
        stateName: r.state_name,
        lgaName: r.lga_name,
        areaName: r.area_name,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async listFuelStations({ q, active, page = 1, limit = 30 } = {}) {
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(`(fs.name ILIKE $${params.length})`);
    }
    if (active === true || active === 'true') where.push(`fs.is_active = TRUE`);
    if (active === false || active === 'false') where.push(`fs.is_active = FALSE`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);
    const result = await getPool().query(
      `SELECT fs.id, fs.name, fs.is_active, fs.location_id, fs.created_at,
              loc.name AS location_name
       FROM fuel_stations fs
       LEFT JOIN locations loc ON loc.id = fs.location_id
       ${whereSql}
       ORDER BY fs.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM fuel_stations fs ${whereSql}`,
      params.slice(0, -2)
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        isActive: r.is_active,
        location: r.location_id ? { id: r.location_id, name: r.location_name } : null,
        createdAt: r.created_at,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async setFuelStationActive(admin, id, { isActive, reason }, req) {
    const prev = await getPool().query(`SELECT id, is_active, name FROM fuel_stations WHERE id = $1`, [
      id,
    ]);
    if (!prev.rows[0]) throw new AppError('Fuel station not found.', 404, 'NOT_FOUND');
    await getPool().query(
      `UPDATE fuel_stations SET is_active = $2, updated_at = NOW() WHERE id = $1`,
      [id, Boolean(isActive)]
    );
    await writeAudit(
      admin,
      {
        action: 'fuel_station.set_active',
        entityType: 'fuel_station',
        entityId: id,
        previousState: { isActive: prev.rows[0].is_active },
        newState: { isActive: Boolean(isActive) },
        reason: reason || 'Station status updated',
      },
      req
    );
    return { id, name: prev.rows[0].name, isActive: Boolean(isActive) };
  },

  async listTransportRoutes({ q, active, page = 1, limit = 30 } = {}) {
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(
        `(tr.name ILIKE $${params.length} OR tr.primary_mode::text ILIKE $${params.length})`
      );
    }
    if (active === true || active === 'true') where.push(`tr.is_active = TRUE`);
    if (active === false || active === 'false') where.push(`tr.is_active = FALSE`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    params.push(lim, off);
    const result = await getPool().query(
      `SELECT tr.id, tr.name, tr.primary_mode, tr.is_active, tr.origin_location_id, tr.destination_location_id,
              o.name AS origin_name, d.name AS destination_name
       FROM transport_routes tr
       LEFT JOIN locations o ON o.id = tr.origin_location_id
       LEFT JOIN locations d ON d.id = tr.destination_location_id
       ${whereSql}
       ORDER BY tr.name ASC NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM transport_routes tr ${whereSql}`,
      params.slice(0, -2)
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        mode: r.primary_mode,
        isActive: r.is_active,
        origin: r.origin_location_id ? { id: r.origin_location_id, name: r.origin_name } : null,
        destination: r.destination_location_id
          ? { id: r.destination_location_id, name: r.destination_name }
          : null,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async setTransportRouteActive(admin, id, { isActive, reason }, req) {
    const prev = await getPool().query(`SELECT id, is_active, name FROM transport_routes WHERE id = $1`, [
      id,
    ]);
    if (!prev.rows[0]) throw new AppError('Transport route not found.', 404, 'NOT_FOUND');
    await getPool().query(
      `UPDATE transport_routes SET is_active = $2, updated_at = NOW() WHERE id = $1`,
      [id, Boolean(isActive)]
    );
    await writeAudit(
      admin,
      {
        action: 'transport_route.set_active',
        entityType: 'transport_route',
        entityId: id,
        previousState: { isActive: prev.rows[0].is_active },
        newState: { isActive: Boolean(isActive) },
        reason: reason || 'Route status updated',
      },
      req
    );
    return { id, name: prev.rows[0].name, isActive: Boolean(isActive) };
  },

  async listCommodities({ q, active } = {}) {
    const params = [];
    const where = [];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(`(c.name ILIKE $${params.length} OR c.slug ILIKE $${params.length})`);
    }
    if (active === true || active === 'true') where.push(`c.is_active = TRUE`);
    if (active === false || active === 'false') where.push(`c.is_active = FALSE`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await getPool().query(
      `SELECT c.id, c.name, c.slug, c.is_active,
              (
                SELECT json_agg(json_build_object(
                  'id', v.id,
                  'name', v.display_name,
                  'label', v.label,
                  'unit', v.unit_code,
                  'isActive', v.is_active
                ) ORDER BY v.sort_order, v.display_name)
                FROM commodity_variants v WHERE v.commodity_id = c.id
              ) AS variants
       FROM commodities c
       ${whereSql}
       ORDER BY c.name ASC`,
      params
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        isActive: r.is_active,
        variants: r.variants || [],
      })),
    };
  },

  async setCommodityActive(admin, id, { isActive, reason }, req) {
    const prev = await getPool().query(`SELECT id, is_active, name FROM commodities WHERE id = $1`, [id]);
    if (!prev.rows[0]) throw new AppError('Commodity not found.', 404, 'NOT_FOUND');
    await getPool().query(
      `UPDATE commodities SET is_active = $2, updated_at = NOW() WHERE id = $1`,
      [id, Boolean(isActive)]
    );
    await writeAudit(
      admin,
      {
        action: 'commodity.set_active',
        entityType: 'commodity',
        entityId: id,
        previousState: { isActive: prev.rows[0].is_active },
        newState: { isActive: Boolean(isActive) },
        reason: reason || 'Commodity status updated',
      },
      req
    );
    return { id, name: prev.rows[0].name, isActive: Boolean(isActive) };
  },

  async listCommunity({ type = 'questions', q, status, page = 1, limit = 30 } = {}) {
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    if (type === 'answers') {
      const params = [];
      const where = [];
      if (q) {
        params.push(`%${String(q).trim()}%`);
        where.push(`(a.content ILIKE $${params.length} OR q.title ILIKE $${params.length})`);
      }
      if (status) {
        params.push(status);
        where.push(`a.status = $${params.length}`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      params.push(lim, off);
      const result = await getPool().query(
        `SELECT a.id, a.content, a.status, a.moderation_state, a.created_at, a.question_id,
                q.title AS question_title, u.display_name
         FROM answers a
         JOIN questions q ON q.id = a.question_id
         LEFT JOIN users u ON u.id = a.user_id
         ${whereSql}
         ORDER BY a.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      const count = await getPool().query(
        `SELECT COUNT(*)::int AS total FROM answers a JOIN questions q ON q.id = a.question_id ${whereSql}`,
        params.slice(0, -2)
      );
      return {
        items: result.rows.map((r) => ({
          id: r.id,
          contentType: 'answer',
          title: r.question_title,
          summary: String(r.content || '').slice(0, 180),
          status: r.status,
          moderationState: r.moderation_state,
          creatorName: r.display_name,
          questionId: r.question_id,
          createdAt: r.created_at,
        })),
        total: count.rows[0]?.total || 0,
        page: Number(page) || 1,
        limit: lim,
      };
    }

    const params = [];
    const where = [];
    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(`(q.title ILIKE $${params.length} OR q.description ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      where.push(`q.status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(lim, off);
    const result = await getPool().query(
      `SELECT q.id, q.title, q.description, q.status, q.moderation_state, q.category, q.created_at,
              u.display_name, loc.name AS location_name
       FROM questions q
       LEFT JOIN users u ON u.id = q.user_id
       LEFT JOIN locations loc ON loc.id = q.location_id
       ${whereSql}
       ORDER BY q.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS total FROM questions q ${whereSql}`,
      params.slice(0, -2)
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        contentType: 'question',
        title: r.title,
        summary: r.description ? String(r.description).slice(0, 180) : null,
        status: r.status,
        moderationState: r.moderation_state,
        category: r.category,
        creatorName: r.display_name,
        locationName: r.location_name,
        createdAt: r.created_at,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async listAuditLog(filters = {}) {
    const { items, total } = await adminAuditRepository.list(filters);
    return {
      items: items.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        previousState: a.previous_state,
        newState: a.new_state,
        reason: a.reason,
        createdAt: a.created_at,
        actor: a.actor_user_id
          ? { id: a.actor_user_id, displayName: a.actor_display_name, email: a.actor_email }
          : { displayName: 'System / Token' },
      })),
      total,
      limit: filters.limit || 40,
      offset: filters.offset || 0,
    };
  },

  async globalSearch(q, { limit = 8 } = {}) {
    const term = String(q || '').trim();
    if (term.length < 2) {
      throw new AppError('Search query must be at least 2 characters.', 400, 'VALIDATION_ERROR');
    }
    const like = `%${term}%`;
    const lim = Math.min(Number(limit) || 8, 20);
    const pool = getPool();
    const [reports, locations, updates, users, questions, stations, routes] = await Promise.all([
      pool.query(
        `SELECT id, title, status FROM reports WHERE title ILIKE $1 ORDER BY created_at DESC LIMIT $2`,
        [like, lim]
      ),
      pool.query(
        `SELECT id, name, type FROM locations WHERE name ILIKE $1 ORDER BY name LIMIT $2`,
        [like, lim]
      ),
      pool.query(
        `SELECT id, title, status FROM official_updates WHERE title ILIKE $1 ORDER BY retrieved_at DESC LIMIT $2`,
        [like, lim]
      ),
      pool.query(
        `SELECT id, display_name, email FROM users
         WHERE display_name ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC LIMIT $2`,
        [like, lim]
      ),
      pool.query(
        `SELECT id, title, status FROM questions WHERE title ILIKE $1 ORDER BY created_at DESC LIMIT $2`,
        [like, lim]
      ),
      pool.query(
        `SELECT id, name, is_active FROM fuel_stations WHERE name ILIKE $1 ORDER BY name LIMIT $2`,
        [like, lim]
      ),
      pool.query(
        `SELECT id, name, primary_mode AS mode FROM transport_routes WHERE name ILIKE $1 ORDER BY name NULLS LAST LIMIT $2`,
        [like, lim]
      ),
    ]);
    return {
      reports: reports.rows,
      locations: locations.rows,
      officialUpdates: updates.rows,
      users: users.rows.map((u) => ({ id: u.id, displayName: u.display_name, email: u.email })),
      questions: questions.rows,
      stations: stations.rows,
      routes: routes.rows,
    };
  },
};
