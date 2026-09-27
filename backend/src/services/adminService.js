import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  ADMIN_ROLES,
  permissionsForRole,
  getRolePermissionCatalog,
} from '../config/admin.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import { reportService } from './reportService.js';
import { officialService } from './officialService.js';
import { officialSyncService } from './officialSyncService.js';
import { fxService } from './fxService.js';
import { fxSyncService } from './fxSyncService.js';
import { officialRepository } from '../repositories/officialRepository.js';
import { moderationCenterService } from './moderationCenterService.js';
import { sessionService } from './sessionService.js';
import { adminAccessService } from './adminAccessService.js';

function metaFromReq(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.get?.('user-agent') || null,
  };
}

async function writeAudit(admin, { action, entityType, entityId, previousState, newState, reason }, req) {
  const m = metaFromReq(req);
  const nextState = newState ? { ...newState } : {};
  if (req?.requestId) nextState.requestId = req.requestId;
  return adminAuditRepository.create({
    actorUserId: admin?.userId || null,
    action,
    entityType,
    entityId: entityId || null,
    previousState: previousState || null,
    newState: Object.keys(nextState).length ? nextState : null,
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
    return getRolePermissionCatalog().roles;
  },

  getRoleCatalog() {
    return adminAccessService.getRoleCatalog();
  },

  getRoleDetail(code) {
    return adminAccessService.getRoleDetail(code);
  },

  async systemHealth() {
    const { systemHealthService } = await import('./systemHealthService.js');
    return systemHealthService.getSystemHealth();
  },

  async analyticsOverview(query) {
    const { analyticsService } = await import('./analyticsService.js');
    return analyticsService.overview(query);
  },

  async analyticsProduct(query) {
    const { analyticsService } = await import('./analyticsService.js');
    return analyticsService.productAnalytics(query);
  },

  async analyticsDomain(domain, query) {
    const { analyticsService } = await import('./analyticsService.js');
    return analyticsService.domainAnalytics(domain, query);
  },

  async analyticsOperations() {
    const { analyticsService } = await import('./analyticsService.js');
    return analyticsService.operationsAnalytics();
  },

  async analyticsDataQuality() {
    const { analyticsService } = await import('./analyticsService.js');
    return analyticsService.dataQualityAnalytics();
  },

  async analyticsSecurity(query) {
    const { analyticsService } = await import('./analyticsService.js');
    return analyticsService.securityAnalytics(query);
  },

  async analyticsExport(query) {
    const { analyticsService } = await import('./analyticsService.js');
    return analyticsService.exportReport(query);
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

  async dataQualityIntelligence() {
    const { qualityIntelligenceService } = await import('./qualityIntelligenceService.js');
    const base = await this.dataQuality();
    const intel = await qualityIntelligenceService.intelligenceDashboard();
    return { ...base, intelligence: intel };
  },

  async dataQualityDomain(domain) {
    const { qualityIntelligenceService } = await import('./qualityIntelligenceService.js');
    return qualityIntelligenceService.domainDashboard(domain);
  },

  async dataQualityEvents(query) {
    const { qualityIntelligenceService } = await import('./qualityIntelligenceService.js');
    return qualityIntelligenceService.listEvents(query);
  },

  async dataQualityReviewQueue(query) {
    const { qualityIntelligenceService } = await import('./qualityIntelligenceService.js');
    return qualityIntelligenceService.reviewQueue(query);
  },

  async dataQualityResolveEvent(admin, id, body, req) {
    const { qualityIntelligenceService } = await import('./qualityIntelligenceService.js');
    return qualityIntelligenceService.resolveEvent(admin, id, body, req);
  },

  async dataQualityRules(query) {
    const { qualityIntelligenceService } = await import('./qualityIntelligenceService.js');
    return qualityIntelligenceService.listRules(query);
  },

  async dataQualityUpdateRule(admin, code, body, req) {
    const { qualityIntelligenceService } = await import('./qualityIntelligenceService.js');
    return qualityIntelligenceService.updateRule(admin, code, body, req);
  },

  async dataQualityScanAnomalies(admin, req) {
    const { qualityIntelligenceService } = await import('./qualityIntelligenceService.js');
    const result = await qualityIntelligenceService.scanAnomalies();
    try {
      await adminAuditRepository.create({
        actorUserId: admin.userId || admin.id,
        action: 'quality.anomaly_scan',
        entityType: 'quality_events',
        entityId: null,
        previousState: null,
        newState: { created: result.created?.length || 0 },
        reason: 'Manual anomaly scan',
        ipAddress: req?.ip || null,
        userAgent: req?.get?.('user-agent') || null,
      });
    } catch {
      /* ignore */
    }
    return result;
  },

  async dataQualityInspect(entityType, entityId) {
    const { qualityIntelligenceService } = await import('./qualityIntelligenceService.js');
    return qualityIntelligenceService.inspectRecord(entityType, entityId);
  },

  async moderationMetrics() {
    return moderationCenterService.metrics();
  },

  async moderationQueue({
    limit = 40,
    offset = 0,
    type,
    view = 'attention',
    q,
    sort = 'updated',
    page,
  } = {}) {
    let off = Number(offset) || 0;
    const lim = Number(limit) || 40;
    if (page) {
      off = Math.max((Number(page) || 1) - 1, 0) * lim;
    }
    return moderationCenterService.queue({
      view: view || 'attention',
      type,
      q,
      limit: lim,
      offset: off,
      sort: sort || 'updated',
    });
  },

  async moderationDetail(queueId, admin = null) {
    const { roleHasPermission } = await import('../config/admin.js');
    const allowPii = roleHasPermission(admin?.role, 'moderation_reporter_pii');
    return moderationCenterService.getDetail(queueId, { includeReporterPii: allowPii });
  },

  async moderationAction(admin, queueId, body, req) {
    return moderationCenterService.applyAction(admin, queueId, body, req);
  },

  async correctReportLocation(admin, reportId, body, req) {
    return moderationCenterService.correctReportLocation(admin, reportId, body, req);
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

  async listUsers({
    q,
    status,
    role,
    staffOnly = false,
    sort = 'created',
    page = 1,
    limit = 30,
  } = {}) {
    const params = [];
    const where = [];
    // Include inactive (disabled) when explicitly filtered; default to active accounts
    if (status === 'disabled') {
      where.push(`u.is_active = FALSE`);
    } else if (status === 'suspended') {
      where.push(`u.is_active = TRUE AND u.suspended_at IS NOT NULL`);
    } else if (status === 'active') {
      where.push(`u.is_active = TRUE AND u.suspended_at IS NULL`);
    } else {
      where.push(`(u.is_active = TRUE OR u.admin_role IS NOT NULL)`);
    }
    if (staffOnly === true || staffOnly === 'true') {
      where.push(`u.admin_role IS NOT NULL`);
    }
    if (q) {
      params.push(`%${String(q).trim()}%`);
      where.push(
        `(u.display_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`
      );
    }
    if (role) {
      params.push(role);
      where.push(`u.admin_role = $${params.length}::admin_role`);
    }
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    const orderSql =
      sort === 'login'
        ? 'u.last_login_at DESC NULLS LAST, u.created_at DESC'
        : sort === 'name'
          ? 'u.display_name ASC'
          : 'u.created_at DESC';
    params.push(lim, off);
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const result = await getPool().query(
      `SELECT u.id, u.display_name, u.email, u.admin_role, u.is_moderator,
              u.suspended_at, u.suspension_reason, u.is_active, u.created_at,
              u.last_login_at, u.last_seen_at, u.onboarding_completed,
              a.name AS area_name, s.name AS state_name
       FROM users u
       LEFT JOIN areas a ON a.id = u.current_area_id
       LEFT JOIN states s ON s.id = a.state_id
       ${whereSql}
       ORDER BY ${orderSql}
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
        adminRole: u.admin_role,
        isModerator: Boolean(u.is_moderator),
        accountStatus: !u.is_active
          ? 'disabled'
          : u.suspended_at
            ? 'suspended'
            : 'active',
        isSuspended: Boolean(u.suspended_at),
        isActive: Boolean(u.is_active),
        suspensionReason: u.suspension_reason,
        onboardingCompleted: u.onboarding_completed,
        areaName: u.area_name,
        stateName: u.state_name,
        lastLoginAt: u.last_login_at,
        lastSeenAt: u.last_seen_at,
        createdAt: u.created_at,
      })),
      total: count.rows[0]?.total || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async getUser(id, { viewerSessionId = null } = {}) {
    const result = await getPool().query(
      `SELECT u.id, u.display_name, u.email, u.phone, u.admin_role, u.is_moderator,
              u.suspended_at, u.suspension_reason, u.is_active, u.created_at,
              u.last_login_at, u.last_seen_at, u.onboarding_completed,
              u.reporting_disabled_at, u.reporting_disabled_reason,
              a.name AS area_name
       FROM users u
       LEFT JOIN areas a ON a.id = u.current_area_id
       WHERE u.id = $1`,
      [id]
    );
    const u = result.rows[0];
    if (!u) throw new AppError('User not found.', 404, 'NOT_FOUND');
    const history = await getPool().query(
      `SELECT action, entity_type, entity_id, reason, created_at, previous_state, new_state
       FROM admin_audit_log
       WHERE entity_type = 'user' AND entity_id = $1
       ORDER BY created_at DESC LIMIT 30`,
      [id]
    );
    const [reportsSubmitted, flagsReceived, contentActions, sessions] = await Promise.all([
      getPool().query(`SELECT COUNT(*)::int AS c FROM reports WHERE user_id = $1`, [id]),
      getPool().query(
        `SELECT COUNT(*)::int AS c FROM report_flags f
         JOIN reports r ON r.id = f.report_id
         WHERE r.user_id = $1`,
        [id]
      ),
      getPool().query(
        `SELECT a.action, a.entity_type, a.entity_id, a.reason, a.created_at
         FROM admin_audit_log a
         WHERE a.action LIKE 'moderation.%'
           AND a.entity_id IN (
             SELECT id FROM reports WHERE user_id = $1
             UNION ALL
             SELECT id FROM questions WHERE user_id = $1
             UNION ALL
             SELECT id FROM answers WHERE user_id = $1
           )
         ORDER BY a.created_at DESC
         LIMIT 25`,
        [id]
      ),
      sessionService.listForUser(id, { currentSessionId: viewerSessionId }),
    ]);
    return {
      id: u.id,
      displayName: u.display_name,
      email: u.email,
      phone: u.phone ? `${String(u.phone).slice(0, 4)}****` : null,
      adminRole: u.admin_role,
      rolePermissions: u.admin_role ? permissionsForRole(u.admin_role) : [],
      isModerator: Boolean(u.is_moderator),
      accountStatus: !u.is_active ? 'disabled' : u.suspended_at ? 'suspended' : 'active',
      isSuspended: Boolean(u.suspended_at),
      isActive: Boolean(u.is_active),
      suspensionReason: u.suspension_reason,
      reportingDisabled: Boolean(u.reporting_disabled_at),
      reportingDisabledAt: u.reporting_disabled_at || null,
      reportingDisabledReason: u.reporting_disabled_reason || null,
      onboardingCompleted: u.onboarding_completed,
      areaName: u.area_name,
      lastLoginAt: u.last_login_at,
      lastSeenAt: u.last_seen_at,
      createdAt: u.created_at,
      sessions: sessions.filter((s) => !s.isRevoked).slice(0, 20),
      moderationHistory: history.rows.map((h) => ({
        action: h.action,
        entityType: h.entity_type,
        entityId: h.entity_id,
        reason: h.reason,
        previousState: h.previous_state,
        newState: h.new_state,
        createdAt: h.created_at,
      })),
      moderationSummary: {
        reportsSubmitted: reportsSubmitted.rows[0]?.c || 0,
        flagsReceived: flagsReceived.rows[0]?.c || 0,
        contentActions: contentActions.rows.map((h) => ({
          action: h.action,
          entityType: h.entity_type,
          entityId: h.entity_id,
          reason: h.reason,
          createdAt: h.created_at,
        })),
      },
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
    await sessionService.revokeAllForUser(id, { reason: 'Account suspended' });
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
      `SELECT id, suspended_at, is_active FROM users WHERE id = $1`,
      [id]
    );
    if (!target.rows[0]) throw new AppError('User not found.', 404, 'NOT_FOUND');
    await getPool().query(
      `UPDATE users SET suspended_at = NULL, suspension_reason = NULL, is_active = TRUE, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await writeAudit(
      admin,
      {
        action: 'user.restore',
        entityType: 'user',
        entityId: id,
        previousState: {
          suspended: Boolean(target.rows[0].suspended_at),
          isActive: target.rows[0].is_active,
        },
        newState: { suspended: false, isActive: true },
        reason: reason || 'Account restored',
      },
      req
    );
    return this.getUser(id);
  },

  async disableReporting(admin, id, { reason }, req) {
    if (!reason || String(reason).trim().length < 3) {
      throw new AppError('A reason is required to restrict reporting.', 400, 'VALIDATION_ERROR');
    }
    if (admin.userId === id) {
      throw new AppError('You cannot restrict your own reporting privileges.', 400, 'VALIDATION_ERROR');
    }
    const target = await getPool().query(
      `SELECT id, reporting_disabled_at, admin_role FROM users WHERE id = $1`,
      [id]
    );
    if (!target.rows[0]) throw new AppError('User not found.', 404, 'NOT_FOUND');
    if (target.rows[0].admin_role === 'super_admin' && admin.role !== 'super_admin') {
      throw new AppError('Only a Super Admin can restrict a Super Admin.', 403, 'FORBIDDEN');
    }
    await getPool().query(
      `UPDATE users
       SET reporting_disabled_at = NOW(),
           reporting_disabled_reason = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [id, reason.trim()]
    );
    await writeAudit(
      admin,
      {
        action: 'user.disable_reporting',
        entityType: 'user',
        entityId: id,
        previousState: {
          reportingDisabled: Boolean(target.rows[0].reporting_disabled_at),
        },
        newState: { reportingDisabled: true },
        reason,
      },
      req
    );
    return this.getUser(id);
  },

  async enableReporting(admin, id, { reason }, req) {
    const target = await getPool().query(
      `SELECT id, reporting_disabled_at FROM users WHERE id = $1`,
      [id]
    );
    if (!target.rows[0]) throw new AppError('User not found.', 404, 'NOT_FOUND');
    await getPool().query(
      `UPDATE users
       SET reporting_disabled_at = NULL,
           reporting_disabled_reason = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
    await writeAudit(
      admin,
      {
        action: 'user.enable_reporting',
        entityType: 'user',
        entityId: id,
        previousState: {
          reportingDisabled: Boolean(target.rows[0].reporting_disabled_at),
        },
        newState: { reportingDisabled: false },
        reason: reason || 'Reporting privileges restored',
      },
      req
    );
    return this.getUser(id);
  },

  async disableUser(admin, id, { reason }, req) {
    if (!reason || String(reason).trim().length < 3) {
      throw new AppError('A reason is required to disable an account.', 400, 'VALIDATION_ERROR');
    }
    if (admin.userId === id) {
      throw new AppError('You cannot disable your own account.', 400, 'VALIDATION_ERROR');
    }
    const target = await getPool().query(
      `SELECT id, admin_role, is_active FROM users WHERE id = $1`,
      [id]
    );
    if (!target.rows[0]) throw new AppError('User not found.', 404, 'NOT_FOUND');
    if (target.rows[0].admin_role === 'super_admin') {
      throw new AppError('Super Admin accounts cannot be disabled this way. Demote first.', 400, 'VALIDATION_ERROR');
    }
    await getPool().query(
      `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await sessionService.revokeAllForUser(id, { reason: 'Account disabled' });
    await writeAudit(
      admin,
      {
        action: 'user.disable',
        entityType: 'user',
        entityId: id,
        previousState: { isActive: target.rows[0].is_active },
        newState: { isActive: false },
        reason,
      },
      req
    );
    return this.getUser(id);
  },

  async setUserRole(admin, id, { role, reason }, req) {
    if (admin.role !== 'super_admin') {
      throw new AppError('Only Super Admin can assign roles.', 403, 'FORBIDDEN');
    }
    if (admin.userId === id) {
      throw new AppError(
        'You cannot change your own role. Ask another Super Admin.',
        400,
        'SELF_LOCKOUT_PREVENTION'
      );
    }
    const allowed = ADMIN_ROLES.map((r) => r.code);
    if (role !== null && role !== '' && !allowed.includes(role)) {
      throw new AppError('Invalid admin role.', 400, 'VALIDATION_ERROR');
    }
    const prev = await getPool().query(`SELECT admin_role, is_moderator FROM users WHERE id = $1`, [id]);
    if (!prev.rows[0]) throw new AppError('User not found.', 404, 'NOT_FOUND');
    const nextRole = role || null;
    const previousRole = prev.rows[0].admin_role;

    if (previousRole === 'super_admin' && nextRole !== 'super_admin') {
      const others = await getPool().query(
        `SELECT COUNT(*)::int AS c FROM users
         WHERE admin_role = 'super_admin' AND is_active = TRUE AND id <> $1`,
        [id]
      );
      if ((others.rows[0]?.c || 0) < 1) {
        throw new AppError(
          'Cannot remove or demote the final Super Admin.',
          400,
          'LAST_SUPER_ADMIN'
        );
      }
    }

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
        previousState: { adminRole: previousRole },
        newState: { adminRole: nextRole },
        reason: reason || 'Role updated',
      },
      req
    );
    return this.getUser(id);
  },

  async revokeUserSession(admin, userId, sessionId, { reason }, req) {
    if (admin.userId === userId && sessionId === req?.auth?.sessionId) {
      throw new AppError('Use Sign out to end your current session.', 400, 'VALIDATION_ERROR');
    }
    const owns = await getPool().query(
      `SELECT id FROM user_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    if (!owns.rows[0]) throw new AppError('Session not found.', 404, 'NOT_FOUND');
    await sessionService.revoke(sessionId, { reason: reason || 'Revoked by administrator' });
    await writeAudit(
      admin,
      {
        action: 'user.session_revoke',
        entityType: 'user',
        entityId: userId,
        previousState: { sessionId, active: true },
        newState: { sessionId, active: false },
        reason: reason || 'Session revoked',
      },
      req
    );
    return { userId, sessionId, revoked: true };
  },

  async revokeAllUserSessions(admin, userId, { reason }, req) {
    if (admin.userId === userId) {
      throw new AppError(
        'You cannot revoke all of your own sessions from this screen.',
        400,
        'SELF_LOCKOUT_PREVENTION'
      );
    }
    const result = await sessionService.revokeAllForUser(userId, {
      reason: reason || 'All sessions revoked by administrator',
    });
    await writeAudit(
      admin,
      {
        action: 'user.session_revoke_all',
        entityType: 'user',
        entityId: userId,
        previousState: null,
        newState: { revoked: result.revoked },
        reason: reason || 'All sessions revoked',
      },
      req
    );
    return result;
  },

  listInvitations(query) {
    return adminAccessService.listInvitations(query);
  },

  createInvitation(admin, body, req) {
    return adminAccessService.createInvitation(admin, body, req);
  },

  revokeInvitation(admin, id, body, req) {
    return adminAccessService.revokeInvitation(admin, id, body, req);
  },

  resendInvitation(admin, id, body, req) {
    return adminAccessService.resendInvitation(admin, id, body, req);
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

  async getOfficialSourceHealth() {
    const { officialAdminService } = await import('./officialAdminService.js');
    return officialAdminService.sourceHealth();
  },

  async getOfficialAgencyProfile(id) {
    const { officialAdminService } = await import('./officialAdminService.js');
    return officialAdminService.getAgencyProfile(id);
  },

  async getOfficialReviewQueue(filters = {}) {
    const { officialAdminService } = await import('./officialAdminService.js');
    return officialAdminService.reviewQueue(filters);
  },

  async getOfficialUpdateAdminDetail(id) {
    const { officialAdminService } = await import('./officialAdminService.js');
    return officialAdminService.getUpdateDetail(id);
  },

  async createManualOfficialUpdate(admin, body, req) {
    const { officialAdminService } = await import('./officialAdminService.js');
    return officialAdminService.createManualUpdate(admin, body, req);
  },

  async approveOfficialUpdate(admin, id, body, req) {
    const { officialAdminService } = await import('./officialAdminService.js');
    return officialAdminService.approveUpdate(admin, id, body, req);
  },

  async rejectOfficialUpdate(admin, id, body, req) {
    const { officialAdminService } = await import('./officialAdminService.js');
    return officialAdminService.rejectUpdate(admin, id, body, req);
  },

  async correctOfficialUpdateMetadata(admin, id, body, req) {
    const { officialAdminService } = await import('./officialAdminService.js');
    return officialAdminService.correctMetadata(admin, id, body, req);
  },

  async listOfficialOrganizations(query) {
    const { officialAdminService } = await import('./officialAdminService.js');
    return officialAdminService.listOrganizations(query);
  },

  async correlateOfficialUpdates(admin, body, req) {
    const { officialAdminService } = await import('./officialAdminService.js');
    return officialAdminService.correlateUpdates(admin, body, req);
  },

  async associateOfficialTraffic(admin, id, body, req) {
    const { officialAdminService } = await import('./officialAdminService.js');
    return officialAdminService.associateTrafficEvent(admin, id, body, req);
  },

  async setOfficialUpdatePriority(admin, id, body, req) {
    const { officialAdminService } = await import('./officialAdminService.js');
    return officialAdminService.setUpdatePriority(admin, id, body, req);
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

  async listLocations(filters = {}) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.list(filters);
  },

  async getLocation(id) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.get(id);
  },

  async updateLocation(id, body, admin, req) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.update(id, body, admin, req);
  },

  async deactivateLocation(id, body, admin, req) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.deactivate(id, body, admin, req);
  },

  async activateLocation(id, body, admin, req) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.activate(id, body, admin, req);
  },

  async createLocationArea(body, admin, req) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.createArea(body, admin, req);
  },

  async locationQualityIssues(filters = {}) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.qualityIssues(filters);
  },

  async locationDashboard() {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.dashboard();
  },

  async locationTree(query = {}) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.tree(query);
  },

  async locationDuplicates(query = {}) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.listDuplicates(query);
  },

  async locationImpact(id) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.impactPreview(id);
  },

  async addLocationAlias(id, body, admin, req) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.addAlias(id, body, admin, req);
  },

  async removeLocationAlias(id, aliasId, body, admin, req) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.removeAlias(id, aliasId, body, admin, req);
  },

  async createLocationChild(body, admin, req) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.createChild(body, admin, req);
  },

  async listUnresolvedLocations(filters = {}) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.listUnresolved(filters);
  },

  async resolveLocationQueueItem(id, body, admin, req) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.resolveQueueItem(id, body, admin, req);
  },

  async verifyLocation(id, body, admin, req) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.setVerification(id, body, admin, req);
  },

  async mergeLocations(id, body, admin, req) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.merge(id, body, admin, req);
  },

  async locationConflicts(filters = {}) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.listConflicts(filters);
  },

  async geocodingHealth(filters = {}) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.geocodingHealth(filters);
  },

  async locationSearchMetrics(filters = {}) {
    const { locationAdminService } = await import('./locationAdminService.js');
    return locationAdminService.searchMetrics(filters);
  },

  async listFuelStations(filters = {}) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.listStations(filters);
  },

  async getFuelStation(id) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.getStation(id);
  },

  async fuelDashboard() {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.dashboard();
  },

  async fuelSubmissions(filters = {}) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.listSubmissions(filters);
  },

  async fuelConflicts(query = {}) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.listConflicts(query);
  },

  async fuelDuplicates(query = {}) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.listDuplicates(query);
  },

  async fuelQuality(query = {}) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.qualityIssues(query);
  },

  async fuelPriceHistory(id, query = {}) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.priceHistory(id, query);
  },

  async fuelOfficialSources() {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.fuelOfficialSources();
  },

  async fuelBrands() {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.brands();
  },

  async fuelBrandCatalogue(filters) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.listBrandCatalogue(filters);
  },

  async createFuelBrand(body, admin, req) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.createBrand(body, admin, req);
  },

  async fuelProducts() {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.listProducts();
  },

  async fuelPriceAnomalies(query) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.listPriceAnomalies(query);
  },

  async recordFuelAvailability(body, admin, req) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.recordAvailability(body, admin, req);
  },

  async mergeFuelStations(body, admin, req) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.mergeStations(body, admin, req);
  },

  async compareFuelNearby(query) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.compareNearby(query);
  },

  async findSimilarFuelStations(query = {}) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.findSimilarStations(query);
  },

  async createFuelStationAdmin(body, admin, req) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.createStation(body, admin, req);
  },

  async updateFuelStationAdmin(id, body, admin, req) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.updateStation(id, body, admin, req);
  },

  async setFuelStationActive(admin, id, { isActive, lifecycleStatus, reason }, req) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.setLifecycle(
      id,
      { isActive, lifecycleStatus, reason },
      admin,
      req
    );
  },

  async addFuelStationAlias(id, body, admin, req) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.addAlias(id, body, admin, req);
  },

  async removeFuelStationAlias(id, aliasId, body, admin, req) {
    const { fuelAdminService } = await import('./fuelAdminService.js');
    return fuelAdminService.removeAlias(id, aliasId, body, admin, req);
  },

  async trafficDashboard() {
    const { trafficAdminService } = await import('./trafficAdminService.js');
    return trafficAdminService.dashboard();
  },

  async listTrafficReports(filters) {
    const { trafficAdminService } = await import('./trafficAdminService.js');
    return trafficAdminService.list(filters);
  },

  async getTrafficReport(id) {
    const { trafficAdminService } = await import('./trafficAdminService.js');
    return trafficAdminService.get(id);
  },

  async updateTrafficReport(id, body, admin, req) {
    const { trafficAdminService } = await import('./trafficAdminService.js');
    return trafficAdminService.update(id, body, admin, req);
  },

  async trafficDuplicates(query) {
    const { trafficAdminService } = await import('./trafficAdminService.js');
    return trafficAdminService.listDuplicates(query);
  },

  async trafficQuality(query) {
    const { trafficAdminService } = await import('./trafficAdminService.js');
    return trafficAdminService.qualityIssues(query);
  },

  async trafficOfficialSources() {
    const { trafficAdminService } = await import('./trafficAdminService.js');
    return trafficAdminService.officialSources();
  },

  async trafficEventVocab() {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.vocab();
  },

  async mergeTrafficEvent(id, body, admin, req) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.merge(id, body, admin, req);
  },

  async splitTrafficEvent(id, body, admin, req) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.split(id, body, admin, req);
  },

  async flagTrafficEventDuplicate(id, body, admin, req) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.flagDuplicate(id, body, admin, req);
  },

  async trafficEventDuplicates(filters = {}) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.findDuplicateCandidates(filters);
  },

  async recomputeTrafficEventConfidence(id) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.recomputeConfidence(id);
  },

  async expireTrafficEvents(opts = {}) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.expireStaleEvents(opts);
  },

  async listTrafficEvents(filters) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.list(filters);
  },

  async getTrafficEvent(id) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.get(id);
  },

  async createTrafficEvent(body, admin, req) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.create(body, admin, req);
  },

  async updateTrafficEvent(id, body, admin, req) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.update(id, body, admin, req);
  },

  async resolveTrafficEvent(id, body, admin, req) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.resolve(id, body, admin, req);
  },

  async linkTrafficEventReport(eventId, body, admin, req) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.linkReport(eventId, body, admin, req);
  },

  async listTrafficRoads(filters) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.listRoads(filters);
  },

  async createRoadSegment(body, admin, req) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.createRoadSegment(body, admin, req);
  },

  async addRoadAlias(roadId, body, admin, req) {
    const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
    return trafficEventAdminService.addRoadAlias(roadId, body, admin, req);
  },

  async transportDashboard() {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.dashboard();
  },

  async listTransportRoutes(filters) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.listRoutes(filters);
  },

  async getTransportRoute(id) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.getRoute(id);
  },

  async updateTransportRouteAdmin(id, body, admin, req) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.updateRoute(id, body, admin, req);
  },

  async createTransportRouteAdmin(body, admin, req) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.createRoute(body, admin, req);
  },

  async setTransportRouteActive(admin, id, body, req) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.setRouteActive(id, body, admin, req);
  },

  async listTransportStops(filters) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.listStops(filters);
  },

  async listTransportDirectoryStops(filters) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.listDirectoryStops(filters);
  },

  async createTransportDirectoryStop(body, admin, req) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.createDirectoryStop(body, admin, req);
  },

  async updateTransportStop(id, body, admin, req) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.updateStop(id, body, admin, req);
  },

  async listTransportFares(filters) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.listFares(filters);
  },

  async transportFareConflicts(query) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.listFareConflicts(query);
  },

  async transportFareAnomalies(query) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.listFareAnomalies(query);
  },

  async transportDuplicates(query) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.listDuplicates(query);
  },

  async transportQuality(query) {
    const { transportAdminService } = await import('./transportAdminService.js');
    return transportAdminService.qualityIssues(query);
  },

  async listCommodities(filters) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.listCatalogue(filters);
  },

  async commodityDashboard() {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.dashboard();
  },

  async getCommodityAdmin(id) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.getCommodity(id);
  },

  async createCommodityAdmin(body, admin, req) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.createCommodity(body, admin, req);
  },

  async updateCommodityAdmin(id, body, admin, req) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.updateCommodity(id, body, admin, req);
  },

  async setCommodityActive(admin, id, body, req) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.setCommodityActive(id, body, admin, req);
  },

  async createCommodityVariant(commodityId, body, admin, req) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.createVariant(commodityId, body, admin, req);
  },

  async updateCommodityVariant(variantId, body, admin, req) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.updateVariant(variantId, body, admin, req);
  },

  async listCommodityObservations(filters) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.listObservations(filters);
  },

  async getCommodityObservation(id) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.getObservation(id);
  },

  async updateCommodityObservation(id, body, admin, req) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.updateObservationMeta(id, body, admin, req);
  },

  async listCommodityMarkets(filters) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.listMarkets(filters);
  },

  async createCommodityMarket(body, admin, req) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.createMarket(body, admin, req);
  },

  async updateCommodityMarket(id, body, admin, req) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.updateMarket(id, body, admin, req);
  },

  async addCommodityMarketAlias(id, body, admin, req) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.addMarketAlias(id, body, admin, req);
  },

  async removeCommodityMarketAlias(id, aliasId, body, admin, req) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.removeMarketAlias(id, aliasId, body, admin, req);
  },

  async commodityConflicts(query) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.listConflicts(query);
  },

  async commodityDuplicates(query) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.listDuplicates(query);
  },

  async commodityQuality(query) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.qualityIssues(query);
  },

  async commodityOfficialSources() {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.officialSources();
  },

  async commodityPriceAnomalies(query) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.listPriceAnomalies(query);
  },

  async mergeCommodityMarkets(body, admin, req) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.mergeMarkets(body, admin, req);
  },

  async commodityCompare(query) {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.compareNearby(query);
  },

  async commodityCategories() {
    const { commodityAdminService } = await import('./commodityAdminService.js');
    return commodityAdminService.categories();
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

  async getNotificationDashboard() {
    const { notificationAdminService } = await import('./notificationAdminService.js');
    return notificationAdminService.dashboard();
  },

  async listNotificationRules() {
    const { notificationAdminService } = await import('./notificationAdminService.js');
    return notificationAdminService.listRules();
  },

  async updateNotificationRule(admin, code, body, req) {
    const { notificationAdminService } = await import('./notificationAdminService.js');
    return notificationAdminService.updateRule(admin, code, body, req);
  },

  async sendEmergencyNotification(admin, body, req) {
    const { notificationAdminService } = await import('./notificationAdminService.js');
    return notificationAdminService.sendEmergency(admin, body, req);
  },

  async getSearchDashboard(params) {
    const { searchAdminService } = await import('./searchAdminService.js');
    return searchAdminService.dashboard(params);
  },

  async listSearchAliases(params) {
    const { searchAdminService } = await import('./searchAdminService.js');
    return searchAdminService.listAliases(params);
  },

  async upsertSearchAlias(admin, body, req) {
    const { searchAdminService } = await import('./searchAdminService.js');
    return searchAdminService.upsertAlias(admin, body, req);
  },

  async deleteSearchAlias(admin, id, reason, req) {
    const { searchAdminService } = await import('./searchAdminService.js');
    return searchAdminService.deleteAlias(admin, id, reason, req);
  },

  async purgeSearchStale(admin, req) {
    const { searchAdminService } = await import('./searchAdminService.js');
    const result = await searchAdminService.purgeStaleRecent();
    try {
      const { adminAuditRepository } = await import('../repositories/adminAuditRepository.js');
      await adminAuditRepository.create({
        actorUserId: admin.userId || admin.id,
        action: 'search.purge_stale',
        entityType: 'search_query_metrics',
        entityId: null,
        previousState: null,
        newState: result,
        reason: 'Retention cleanup',
        ipAddress: req?.ip || null,
        userAgent: req?.get?.('user-agent') || null,
      });
    } catch {
      /* ignore */
    }
    return result;
  },
};
