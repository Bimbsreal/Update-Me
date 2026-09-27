import { adminService } from '../services/adminService.js';
import { z } from 'zod';
import {
  moderationActionSchema,
  moderationQueueQuerySchema,
  correctLocationSchema,
  queueIdParamSchema,
  entityIdParamSchema,
  officialSourceIdParamSchema,
  suspendUserSchema,
  restoreUserSchema,
  setRoleSchema,
  setActiveSchema,
  hideOfficialUpdateSchema,
  reviewOfficialUpdateSchema,
  correctOfficialUpdateMetadataSchema,
  createManualOfficialUpdateSchema,
  inviteAdminSchema,
} from '../validators/admin.js';
import {
  createOfficialSourceSchema,
  updateOfficialSourceSchema,
} from '../validators/official.js';
import { permissionsForRole } from '../config/admin.js';

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

export async function getAdminMe(req, res, next) {
  try {
    return ok(res, {
      admin: {
        userId: req.admin.userId,
        role: req.admin.role,
        displayName: req.admin.displayName,
        via: req.admin.via,
        permissions: permissionsForRole(req.admin.role),
      },
      roles: adminService.getRoles(),
      roleCatalog: adminService.getRoleCatalog(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function getDashboard(req, res, next) {
  try {
    const dashboard = await adminService.dashboard();
    return ok(res, { dashboard });
  } catch (error) {
    return next(error);
  }
}

export async function getSystemHealth(req, res, next) {
  try {
    const health = await adminService.systemHealth();
    return ok(res, { health });
  } catch (error) {
    return next(error);
  }
}

export async function getAnalyticsOverview(req, res, next) {
  try {
    const analytics = await adminService.analyticsOverview(req.query);
    return ok(res, { analytics });
  } catch (error) {
    return next(error);
  }
}

export async function getAnalyticsProduct(req, res, next) {
  try {
    const analytics = await adminService.analyticsProduct(req.query);
    return ok(res, { analytics });
  } catch (error) {
    return next(error);
  }
}

export async function getAnalyticsDomain(req, res, next) {
  try {
    const analytics = await adminService.analyticsDomain(req.params.domain, req.query);
    return ok(res, { analytics });
  } catch (error) {
    return next(error);
  }
}

export async function getAnalyticsOperations(req, res, next) {
  try {
    const analytics = await adminService.analyticsOperations();
    return ok(res, { analytics });
  } catch (error) {
    return next(error);
  }
}

export async function getAnalyticsDataQuality(req, res, next) {
  try {
    const analytics = await adminService.analyticsDataQuality();
    return ok(res, { analytics });
  } catch (error) {
    return next(error);
  }
}

export async function getAnalyticsSecurity(req, res, next) {
  try {
    const analytics = await adminService.analyticsSecurity(req.query);
    return ok(res, { analytics });
  } catch (error) {
    return next(error);
  }
}

export async function getAnalyticsExport(req, res, next) {
  try {
    const result = await adminService.analyticsExport({
      plane: req.query.plane,
      range: req.query.range,
      format: req.query.format || 'json',
      from: req.query.from,
      to: req.query.to,
    });
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.body);
  } catch (error) {
    return next(error);
  }
}

export async function getDataQuality(req, res, next) {
  try {
    const quality = await adminService.dataQuality(req.query);
    return ok(res, { quality });
  } catch (error) {
    return next(error);
  }
}

export async function getDataQualityReports(req, res, next) {
  try {
    const result = await adminService.dataQualityReports(req.query);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getDataQualityConflicts(req, res, next) {
  try {
    const result = await adminService.dataQualityConflicts(req.query);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getDataQualityStale(req, res, next) {
  try {
    const result = await adminService.dataQualityStale(req.query);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getDataQualityExpired(req, res, next) {
  try {
    const result = await adminService.dataQualityExpired(req.query);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getDataQualityIntelligence(req, res, next) {
  try {
    const quality = await adminService.dataQualityIntelligence();
    return ok(res, { quality });
  } catch (error) {
    return next(error);
  }
}

export async function getDataQualityDomain(req, res, next) {
  try {
    const domain = String(req.params.domain || '').trim();
    const dashboard = await adminService.dataQualityDomain(domain);
    return ok(res, { dashboard });
  } catch (error) {
    return next(error);
  }
}

export async function getDataQualityEvents(req, res, next) {
  try {
    const result = await adminService.dataQualityEvents({
      domain: req.query.domain,
      status: req.query.status || 'open',
      eventType: req.query.eventType,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getDataQualityReviewQueue(req, res, next) {
  try {
    const result = await adminService.dataQualityReviewQueue({ limit: req.query.limit });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postDataQualityResolveEvent(req, res, next) {
  try {
    const id = String(req.params.id || '').trim();
    const body = {
      action: String(req.body?.action || 'resolve'),
      note: String(req.body?.note || req.body?.reason || ''),
    };
    const item = await adminService.dataQualityResolveEvent(req.admin, id, body, req);
    return ok(res, { item });
  } catch (error) {
    return next(error);
  }
}

export async function getDataQualityRules(req, res, next) {
  try {
    const result = await adminService.dataQualityRules({ domain: req.query.domain });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function patchDataQualityRule(req, res, next) {
  try {
    const code = String(req.params.code || '').trim();
    const rule = await adminService.dataQualityUpdateRule(req.admin, code, req.body || {}, req);
    return ok(res, { rule });
  } catch (error) {
    return next(error);
  }
}

export async function postDataQualityScanAnomalies(req, res, next) {
  try {
    const result = await adminService.dataQualityScanAnomalies(req.admin, req);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getDataQualityInspect(req, res, next) {
  try {
    const entityType = String(req.params.entityType || '').trim();
    const entityId = String(req.params.entityId || '').trim();
    const inspection = await adminService.dataQualityInspect(entityType, entityId);
    return ok(res, { inspection });
  } catch (error) {
    return next(error);
  }
}

export async function getModerationMetrics(req, res, next) {
  try {
    const metrics = await adminService.moderationMetrics();
    return ok(res, { metrics });
  } catch (error) {
    return next(error);
  }
}

export async function getModerationQueue(req, res, next) {
  try {
    const query = moderationQueueQuerySchema.parse(req.query);
    const result = await adminService.moderationQueue(query);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getModerationDetail(req, res, next) {
  try {
    const { id } = queueIdParamSchema.parse(req.params);
    const result = await adminService.moderationDetail(id, req.admin);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postModerationAction(req, res, next) {
  try {
    const { id } = queueIdParamSchema.parse(req.params);
    const body = moderationActionSchema.parse(req.body);
    const result = await adminService.moderationAction(req.admin, id, body, req);
    return ok(res, { result });
  } catch (error) {
    return next(error);
  }
}

export async function postCorrectReportLocation(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = correctLocationSchema.parse(req.body);
    const result = await adminService.correctReportLocation(req.admin, id, body, req);
    return ok(res, { result });
  } catch (error) {
    return next(error);
  }
}

export async function getAdminReports(req, res, next) {
  try {
    const result = await adminService.listReports({
      category: req.query.category,
      status: req.query.status,
      sourceType: req.query.source,
      locationId: req.query.locationId,
      userId: req.query.userId,
      flagged: req.query.flagged,
      q: req.query.q,
      from: req.query.from,
      to: req.query.to,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getAdminAlerts(req, res, next) {
  try {
    const result = await adminService.listAlerts({
      status: req.query.status,
      locationId: req.query.locationId,
      flagged: req.query.flagged,
      q: req.query.q,
      from: req.query.from,
      to: req.query.to,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postAlertAction(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = moderationActionSchema.parse(req.body);
    const result = await adminService.alertAction(req.admin, id, body, req);
    return ok(res, { result });
  } catch (error) {
    return next(error);
  }
}

export async function getAdminUsers(req, res, next) {
  try {
    const result = await adminService.listUsers({
      q: req.query.q,
      status: req.query.status,
      role: req.query.role,
      staffOnly: req.query.staffOnly,
      sort: req.query.sort,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getAdminUser(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const user = await adminService.getUser(id, {
      viewerSessionId: req.auth?.sessionId || null,
    });
    return ok(res, { user });
  } catch (error) {
    return next(error);
  }
}

export async function postSuspendUser(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = suspendUserSchema.parse(req.body);
    const user = await adminService.suspendUser(req.admin, id, body, req);
    return ok(res, { user });
  } catch (error) {
    return next(error);
  }
}

export async function postRestoreUser(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = restoreUserSchema.parse(req.body || {});
    const user = await adminService.restoreUser(req.admin, id, body, req);
    return ok(res, { user });
  } catch (error) {
    return next(error);
  }
}

export async function postDisableUser(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = suspendUserSchema.parse(req.body);
    const user = await adminService.disableUser(req.admin, id, body, req);
    return ok(res, { user });
  } catch (error) {
    return next(error);
  }
}

export async function postDisableReporting(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = suspendUserSchema.parse(req.body);
    const user = await adminService.disableReporting(req.admin, id, body, req);
    return ok(res, { user });
  } catch (error) {
    return next(error);
  }
}

export async function postEnableReporting(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = restoreUserSchema.parse(req.body || {});
    const user = await adminService.enableReporting(req.admin, id, body, req);
    return ok(res, { user });
  } catch (error) {
    return next(error);
  }
}

export async function patchUserRole(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = setRoleSchema.parse(req.body);
    const user = await adminService.setUserRole(req.admin, id, body, req);
    return ok(res, { user });
  } catch (error) {
    return next(error);
  }
}

export async function postRevokeUserSession(req, res, next) {
  try {
    const { id, sessionId } = z
      .object({ id: z.string().uuid(), sessionId: z.string().uuid() })
      .parse(req.params);
    const body = restoreUserSchema.parse(req.body || {});
    const result = await adminService.revokeUserSession(req.admin, id, sessionId, body, req);
    return ok(res, { result });
  } catch (error) {
    return next(error);
  }
}

export async function postRevokeAllUserSessions(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = restoreUserSchema.parse(req.body || {});
    const result = await adminService.revokeAllUserSessions(req.admin, id, body, req);
    return ok(res, { result });
  } catch (error) {
    return next(error);
  }
}

export async function getRoleCatalog(req, res, next) {
  try {
    return ok(res, adminService.getRoleCatalog());
  } catch (error) {
    return next(error);
  }
}

export async function getRoleDetail(req, res, next) {
  try {
    const code = z.string().min(2).max(40).parse(req.params.code);
    const role = await adminService.getRoleDetail(code);
    return ok(res, { role });
  } catch (error) {
    return next(error);
  }
}

export async function getAdminInvitations(req, res, next) {
  try {
    const result = await adminService.listInvitations({
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postAdminInvitation(req, res, next) {
  try {
    const body = inviteAdminSchema.parse(req.body);
    const result = await adminService.createInvitation(req.admin, body, req);
    return ok(res, result, 201);
  } catch (error) {
    return next(error);
  }
}

export async function postRevokeInvitation(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = restoreUserSchema.parse(req.body || {});
    const result = await adminService.revokeInvitation(req.admin, id, body, req);
    return ok(res, { result });
  } catch (error) {
    return next(error);
  }
}

export async function postResendInvitation(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = restoreUserSchema.parse(req.body || {});
    const result = await adminService.resendInvitation(req.admin, id, body, req);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getOfficialSources(req, res, next) {
  try {
    const sources = await adminService.listOfficialSources();
    return ok(res, { sources });
  } catch (error) {
    return next(error);
  }
}

export async function getIngestionRuns(req, res, next) {
  try {
    const result = await adminService.listIngestionRuns({
      sourceId: req.query.sourceId || undefined,
      status: req.query.status || undefined,
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postOfficialSource(req, res, next) {
  try {
    const body = createOfficialSourceSchema.parse(req.body);
    const source = await adminService.createOfficialSource(req.admin, body, req);
    return ok(res, { source }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function patchOfficialSource(req, res, next) {
  try {
    const { id } = officialSourceIdParamSchema.parse(req.params);
    const body = updateOfficialSourceSchema.parse(req.body);
    const source = await adminService.updateOfficialSource(req.admin, id, body, req);
    return ok(res, { source });
  } catch (error) {
    return next(error);
  }
}

export async function postOfficialSourceSync(req, res, next) {
  try {
    const { id } = officialSourceIdParamSchema.parse(req.params);
    const sync = await adminService.syncOfficialSource(req.admin, id, req);
    return ok(res, { sync });
  } catch (error) {
    return next(error);
  }
}

export async function postOfficialSyncAll(req, res, next) {
  try {
    const sync = await adminService.syncOfficialSource(req.admin, null, req);
    return ok(res, { sync });
  } catch (error) {
    return next(error);
  }
}

export async function getOfficialUpdates(req, res, next) {
  try {
    const result = await adminService.listOfficialUpdates({
      agency: req.query.agency,
      category: req.query.category,
      locationId: req.query.locationId,
      q: req.query.q,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postHideOfficialUpdate(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = hideOfficialUpdateSchema.parse(req.body);
    const update = await adminService.hideOfficialUpdate(req.admin, id, body, req);
    return ok(res, { update });
  } catch (error) {
    return next(error);
  }
}

export async function postRestoreOfficialUpdate(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = restoreUserSchema.parse(req.body || {});
    const update = await adminService.restoreOfficialUpdate(req.admin, id, body, req);
    return ok(res, { update });
  } catch (error) {
    return next(error);
  }
}

export async function getOfficialSourceHealth(req, res, next) {
  try {
    const result = await adminService.getOfficialSourceHealth();
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getOfficialAgencyProfile(req, res, next) {
  try {
    const { id } = officialSourceIdParamSchema.parse(req.params);
    const result = await adminService.getOfficialAgencyProfile(id);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getOfficialReviewQueue(req, res, next) {
  try {
    const result = await adminService.getOfficialReviewQueue({
      q: req.query.q,
      sourceId: req.query.sourceId,
      kind: req.query.kind,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getOfficialUpdateAdminDetail(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const result = await adminService.getOfficialUpdateAdminDetail(id);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postManualOfficialUpdate(req, res, next) {
  try {
    const body = createManualOfficialUpdateSchema.parse(req.body);
    const result = await adminService.createManualOfficialUpdate(req.admin, body, req);
    return ok(res, result, 201);
  } catch (error) {
    return next(error);
  }
}

export async function postApproveOfficialUpdate(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = reviewOfficialUpdateSchema.parse(req.body);
    const result = await adminService.approveOfficialUpdate(req.admin, id, body, req);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postRejectOfficialUpdate(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = reviewOfficialUpdateSchema.parse(req.body);
    const result = await adminService.rejectOfficialUpdate(req.admin, id, body, req);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postCorrectOfficialUpdate(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = correctOfficialUpdateMetadataSchema.parse(req.body);
    const result = await adminService.correctOfficialUpdateMetadata(req.admin, id, body, req);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getOfficialOrganizations(req, res, next) {
  try {
    const result = await adminService.listOfficialOrganizations({
      q: req.query.q,
      active: req.query.active,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postCorrelateOfficialUpdate(req, res, next) {
  try {
    const result = await adminService.correlateOfficialUpdates(req.admin, req.body || {}, req);
    return ok(res, { correlation: result }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function postAssociateOfficialTraffic(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const result = await adminService.associateOfficialTraffic(req.admin, id, req.body || {}, req);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postOfficialUpdatePriority(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const result = await adminService.setOfficialUpdatePriority(req.admin, id, req.body || {}, req);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getFxAdmin(req, res, next) {
  try {
    const status = await adminService.fxStatus();
    return ok(res, { status });
  } catch (error) {
    return next(error);
  }
}

export async function postFxSync(req, res, next) {
  try {
    const sync = await adminService.fxSync(req.admin, req);
    return ok(res, { sync });
  } catch (error) {
    return next(error);
  }
}

export async function getAdminLocations(req, res, next) {
  try {
    const result = await adminService.listLocations({
      q: req.query.q,
      type: req.query.type,
      status: req.query.status,
      stateId: req.query.stateId,
      parentId: req.query.parentId,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getAdminLocationDashboard(req, res, next) {
  try {
    const dashboard = await adminService.locationDashboard();
    return ok(res, { dashboard });
  } catch (error) {
    return next(error);
  }
}

export async function getAdminLocationTree(req, res, next) {
  try {
    const tree = await adminService.locationTree({
      parentId: req.query.parentId || null,
      stateId: req.query.stateId || null,
      limit: req.query.limit,
    });
    return ok(res, tree);
  } catch (error) {
    return next(error);
  }
}

export async function getAdminLocationDuplicates(req, res, next) {
  try {
    const duplicates = await adminService.locationDuplicates({ limit: req.query.limit });
    return ok(res, { duplicates });
  } catch (error) {
    return next(error);
  }
}

export async function getAdminLocationImpact(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const impact = await adminService.locationImpact(id);
    return ok(res, { impact });
  } catch (error) {
    return next(error);
  }
}

export async function getAdminLocation(req, res, next) {
  try {
    const result = await adminService.getLocation(req.params.id);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function patchAdminLocation(req, res, next) {
  try {
    const result = await adminService.updateLocation(req.params.id, req.body || {}, req.admin, req);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postAdminLocationDeactivate(req, res, next) {
  try {
    const result = await adminService.deactivateLocation(
      req.params.id,
      req.body || {},
      req.admin,
      req
    );
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postAdminLocationActivate(req, res, next) {
  try {
    const result = await adminService.activateLocation(
      req.params.id,
      req.body || {},
      req.admin,
      req
    );
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postAdminLocationArea(req, res, next) {
  try {
    const location = await adminService.createLocationArea(req.body || {}, req.admin, req);
    return ok(res, { location }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function postAdminLocationChild(req, res, next) {
  try {
    const location = await adminService.createLocationChild(req.body || {}, req.admin, req);
    return ok(res, { location }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function postAdminLocationAlias(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const alias = await adminService.addLocationAlias(id, req.body || {}, req.admin, req);
    return ok(res, { alias }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function deleteAdminLocationAlias(req, res, next) {
  try {
    const { id, aliasId } = z
      .object({ id: z.string().uuid(), aliasId: z.string().uuid() })
      .parse(req.params);
    const result = await adminService.removeLocationAlias(
      id,
      aliasId,
      req.body || {},
      req.admin,
      req
    );
    return ok(res, { result });
  } catch (error) {
    return next(error);
  }
}

export async function getAdminLocationQuality(req, res, next) {
  try {
    const issues = await adminService.locationQualityIssues({ limit: req.query.limit });
    return ok(res, { issues });
  } catch (error) {
    return next(error);
  }
}

export async function getUnresolvedLocations(req, res, next) {
  try {
    const result = await adminService.listUnresolvedLocations({
      status: req.query.status,
      q: req.query.q,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postResolveLocationQueue(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const result = await adminService.resolveLocationQueueItem(
      id,
      req.body || {},
      req.admin,
      req
    );
    return ok(res, { item: result });
  } catch (error) {
    return next(error);
  }
}

export async function postVerifyLocation(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.verifyLocation(id, req.body || {}, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function postMergeLocations(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.mergeLocations(id, req.body || {}, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function getLocationConflicts(req, res, next) {
  try {
    const result = await adminService.locationConflicts({
      status: req.query.status,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getGeocodingHealth(req, res, next) {
  try {
    const health = await adminService.geocodingHealth({ hours: req.query.hours });
    return ok(res, { health });
  } catch (error) {
    return next(error);
  }
}

export async function getLocationSearchMetrics(req, res, next) {
  try {
    const result = await adminService.locationSearchMetrics({ limit: req.query.limit });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getFuelStations(req, res, next) {
  try {
    const status =
      req.query.status ||
      (req.query.active === 'true' || req.query.active === true
        ? 'active'
        : req.query.active === 'false' || req.query.active === false
          ? 'inactive'
          : undefined);
    const result = await adminService.listFuelStations({
      q: req.query.q,
      stateId: req.query.stateId,
      lgaId: req.query.lgaId,
      areaId: req.query.areaId,
      brand: req.query.brand,
      status,
      freshness: req.query.freshness,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getFuelDashboard(req, res, next) {
  try {
    const dashboard = await adminService.fuelDashboard();
    return ok(res, { dashboard });
  } catch (error) {
    return next(error);
  }
}

export async function getFuelStationDetail(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.getFuelStation(id);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function getFuelSubmissions(req, res, next) {
  try {
    const result = await adminService.fuelSubmissions({
      stationId: req.query.stationId,
      q: req.query.q,
      fuelType: req.query.fuelType,
      status: req.query.status,
      freshness: req.query.freshness,
      sourceType: req.query.sourceType,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getFuelConflicts(req, res, next) {
  try {
    const conflicts = await adminService.fuelConflicts({
      limit: req.query.limit,
      windowMinutes: req.query.windowMinutes,
    });
    return ok(res, { conflicts });
  } catch (error) {
    return next(error);
  }
}

export async function getFuelDuplicates(req, res, next) {
  try {
    const duplicates = await adminService.fuelDuplicates({ limit: req.query.limit });
    return ok(res, { duplicates });
  } catch (error) {
    return next(error);
  }
}

export async function getFuelQuality(req, res, next) {
  try {
    const issues = await adminService.fuelQuality({ limit: req.query.limit });
    return ok(res, { issues });
  } catch (error) {
    return next(error);
  }
}

export async function getFuelPriceHistory(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const history = await adminService.fuelPriceHistory(id, {
      fuelType: req.query.fuelType,
      limit: req.query.limit,
    });
    return ok(res, { history });
  } catch (error) {
    return next(error);
  }
}

export async function getFuelOfficialSources(req, res, next) {
  try {
    const sources = await adminService.fuelOfficialSources();
    return ok(res, { sources });
  } catch (error) {
    return next(error);
  }
}

export async function getFuelBrands(req, res, next) {
  try {
    const brands = await adminService.fuelBrands();
    return ok(res, { brands });
  } catch (error) {
    return next(error);
  }
}

export async function getFuelBrandCatalogue(req, res, next) {
  try {
    const result = await adminService.fuelBrandCatalogue({
      q: req.query.q,
      active: req.query.active,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postFuelBrand(req, res, next) {
  try {
    const brand = await adminService.createFuelBrand(req.body || {}, req.admin, req);
    return ok(res, { brand }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function getFuelProducts(req, res, next) {
  try {
    const result = await adminService.fuelProducts();
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getFuelPriceAnomalies(req, res, next) {
  try {
    const anomalies = await adminService.fuelPriceAnomalies({ limit: req.query.limit });
    return ok(res, { anomalies });
  } catch (error) {
    return next(error);
  }
}

export async function postFuelAvailability(req, res, next) {
  try {
    const observation = await adminService.recordFuelAvailability(req.body || {}, req.admin, req);
    return ok(res, { observation }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function postFuelStationMerge(req, res, next) {
  try {
    const result = await adminService.mergeFuelStations(req.body || {}, req.admin, req);
    return ok(res, { result });
  } catch (error) {
    return next(error);
  }
}

export async function getFuelCompare(req, res, next) {
  try {
    const result = await adminService.compareFuelNearby({
      locationId: req.query.locationId,
      lat: req.query.lat != null ? Number(req.query.lat) : undefined,
      lng: req.query.lng != null ? Number(req.query.lng) : undefined,
      fuelType: req.query.fuelType,
      radiusKm: req.query.radiusKm,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getFuelSimilarStations(req, res, next) {
  try {
    const similar = await adminService.findSimilarFuelStations({
      name: req.query.name,
      locationId: req.query.locationId,
      lat: req.query.lat != null ? Number(req.query.lat) : undefined,
      lng: req.query.lng != null ? Number(req.query.lng) : undefined,
    });
    return ok(res, { similar });
  } catch (error) {
    return next(error);
  }
}

export async function postFuelStation(req, res, next) {
  try {
    const detail = await adminService.createFuelStationAdmin(req.body || {}, req.admin, req);
    return ok(res, detail, 201);
  } catch (error) {
    return next(error);
  }
}

export async function patchFuelStation(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = req.body || {};
    // Backward-compatible activate toggle
    if (
      body.isActive != null &&
      body.name == null &&
      body.brand == null &&
      body.address == null &&
      body.locationId == null &&
      body.lifecycleStatus == null &&
      body.latitude == null &&
      body.longitude == null
    ) {
      const parsed = setActiveSchema.parse(body);
      const station = await adminService.setFuelStationActive(req.admin, id, parsed, req);
      return ok(res, { station: station.station || station });
    }
    const detail = await adminService.updateFuelStationAdmin(id, body, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function postFuelStationAlias(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const alias = await adminService.addFuelStationAlias(id, req.body || {}, req.admin, req);
    return ok(res, { alias }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function deleteFuelStationAlias(req, res, next) {
  try {
    const { id, aliasId } = z
      .object({ id: z.string().uuid(), aliasId: z.string().uuid() })
      .parse(req.params);
    const result = await adminService.removeFuelStationAlias(
      id,
      aliasId,
      req.body || {},
      req.admin,
      req
    );
    return ok(res, { result });
  } catch (error) {
    return next(error);
  }
}

export async function getTrafficDashboard(req, res, next) {
  try {
    const dashboard = await adminService.trafficDashboard();
    return ok(res, { dashboard });
  } catch (error) {
    return next(error);
  }
}

export async function getTrafficReports(req, res, next) {
  try {
    const result = await adminService.listTrafficReports({
      q: req.query.q,
      stateId: req.query.stateId,
      lgaId: req.query.lgaId,
      areaId: req.query.areaId,
      road: req.query.road,
      severity: req.query.severity,
      cause: req.query.cause,
      status: req.query.status,
      sourceType: req.query.sourceType,
      freshness: req.query.freshness,
      from: req.query.from,
      to: req.query.to,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getTrafficReportDetail(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.getTrafficReport(id);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function patchTrafficReport(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.updateTrafficReport(id, req.body || {}, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function getTrafficDuplicates(req, res, next) {
  try {
    const duplicates = await adminService.trafficDuplicates({ limit: req.query.limit });
    return ok(res, { duplicates });
  } catch (error) {
    return next(error);
  }
}

export async function getTrafficQuality(req, res, next) {
  try {
    const issues = await adminService.trafficQuality({ limit: req.query.limit });
    return ok(res, { issues });
  } catch (error) {
    return next(error);
  }
}

export async function getTrafficOfficialSources(req, res, next) {
  try {
    const sources = await adminService.trafficOfficialSources();
    return ok(res, { sources });
  } catch (error) {
    return next(error);
  }
}

export async function getTrafficEventVocab(req, res, next) {
  try {
    const vocab = await adminService.trafficEventVocab();
    return ok(res, { vocab });
  } catch (error) {
    return next(error);
  }
}

export async function getTrafficEvents(req, res, next) {
  try {
    const result = await adminService.listTrafficEvents({
      q: req.query.q,
      status: req.query.status,
      eventType: req.query.eventType,
      severity: req.query.severity,
      stateId: req.query.stateId,
      lgaId: req.query.lgaId,
      roadId: req.query.roadId,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getTrafficEventDetail(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.getTrafficEvent(id);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function postTrafficEvent(req, res, next) {
  try {
    const detail = await adminService.createTrafficEvent(req.body || {}, req.admin, req);
    return ok(res, detail, 201);
  } catch (error) {
    return next(error);
  }
}

export async function patchTrafficEvent(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.updateTrafficEvent(id, req.body || {}, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function postResolveTrafficEvent(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.resolveTrafficEvent(id, req.body || {}, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function postLinkTrafficEventReport(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.linkTrafficEventReport(id, req.body || {}, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function postMergeTrafficEvent(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.mergeTrafficEvent(id, req.body || {}, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function postSplitTrafficEvent(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.splitTrafficEvent(id, req.body || {}, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function postFlagTrafficEventDuplicate(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.flagTrafficEventDuplicate(id, req.body || {}, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function getTrafficEventDuplicates(req, res, next) {
  try {
    const result = await adminService.trafficEventDuplicates({
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postRecomputeTrafficEventConfidence(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const result = await adminService.recomputeTrafficEventConfidence(id);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postExpireTrafficEvents(req, res, next) {
  try {
    const result = await adminService.expireTrafficEvents({
      limit: req.body?.limit || req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getTrafficRoads(req, res, next) {
  try {
    const result = await adminService.listTrafficRoads({
      q: req.query.q,
      stateId: req.query.stateId,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postRoadSegment(req, res, next) {
  try {
    const result = await adminService.createRoadSegment(req.body || {}, req.admin, req);
    return ok(res, { segment: result }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function postRoadAlias(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const result = await adminService.addRoadAlias(id, req.body || {}, req.admin, req);
    return ok(res, { alias: result }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function getTransportDashboard(req, res, next) {
  try {
    const dashboard = await adminService.transportDashboard();
    return ok(res, { dashboard });
  } catch (error) {
    return next(error);
  }
}

export async function getTransportRoutes(req, res, next) {
  try {
    const result = await adminService.listTransportRoutes({
      q: req.query.q,
      stateId: req.query.stateId,
      lgaId: req.query.lgaId,
      mode: req.query.mode,
      active: req.query.active,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postTransportRoute(req, res, next) {
  try {
    const detail = await adminService.createTransportRouteAdmin(req.body || {}, req.admin, req);
    return ok(res, detail, 201);
  } catch (error) {
    return next(error);
  }
}

export async function getTransportDirectoryStops(req, res, next) {
  try {
    const result = await adminService.listTransportDirectoryStops({
      q: req.query.q,
      stateId: req.query.stateId,
      active: req.query.active,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postTransportDirectoryStop(req, res, next) {
  try {
    const stop = await adminService.createTransportDirectoryStop(req.body || {}, req.admin, req);
    return ok(res, { stop }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function getTransportFareAnomalies(req, res, next) {
  try {
    const anomalies = await adminService.transportFareAnomalies({ limit: req.query.limit });
    return ok(res, { anomalies });
  } catch (error) {
    return next(error);
  }
}

export async function getTransportRouteDetail(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.getTransportRoute(id);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function patchTransportRoute(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = req.body || {};
    if (
      body.isActive != null &&
      body.name == null &&
      body.primaryMode == null &&
      body.mode == null
    ) {
      const parsed = setActiveSchema.parse(body);
      const route = await adminService.setTransportRouteActive(req.admin, id, parsed, req);
      return ok(res, { route: route.route || route });
    }
    const detail = await adminService.updateTransportRouteAdmin(id, body, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function getTransportStops(req, res, next) {
  try {
    const result = await adminService.listTransportStops({
      q: req.query.q,
      stateId: req.query.stateId,
      lgaId: req.query.lgaId,
      routeId: req.query.routeId,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function patchTransportStop(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const stop = await adminService.updateTransportStop(id, req.body || {}, req.admin, req);
    return ok(res, { stop });
  } catch (error) {
    return next(error);
  }
}

export async function getTransportFares(req, res, next) {
  try {
    const result = await adminService.listTransportFares({
      q: req.query.q,
      routeId: req.query.routeId,
      mode: req.query.mode,
      status: req.query.status,
      sourceType: req.query.sourceType,
      freshness: req.query.freshness,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getTransportFareConflicts(req, res, next) {
  try {
    const conflicts = await adminService.transportFareConflicts({ limit: req.query.limit });
    return ok(res, { conflicts });
  } catch (error) {
    return next(error);
  }
}

export async function getTransportDuplicates(req, res, next) {
  try {
    const duplicates = await adminService.transportDuplicates({ limit: req.query.limit });
    return ok(res, { duplicates });
  } catch (error) {
    return next(error);
  }
}

export async function getTransportQuality(req, res, next) {
  try {
    const issues = await adminService.transportQuality({ limit: req.query.limit });
    return ok(res, { issues });
  } catch (error) {
    return next(error);
  }
}

export async function getCommodities(req, res, next) {
  try {
    const result = await adminService.listCommodities({
      q: req.query.q,
      category: req.query.category,
      active: req.query.active,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getCommodityDashboard(req, res, next) {
  try {
    const dashboard = await adminService.commodityDashboard();
    return ok(res, { dashboard });
  } catch (error) {
    return next(error);
  }
}

export async function getCommodityDetail(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.getCommodityAdmin(id);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function postCommodity(req, res, next) {
  try {
    const detail = await adminService.createCommodityAdmin(req.body || {}, req.admin, req);
    return ok(res, detail, 201);
  } catch (error) {
    return next(error);
  }
}

export async function patchCommodity(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = req.body || {};
    if (
      body.isActive != null &&
      body.name == null &&
      body.category == null &&
      body.description == null &&
      body.slug == null
    ) {
      const parsed = setActiveSchema.parse(body);
      const commodity = await adminService.setCommodityActive(req.admin, id, parsed, req);
      return ok(res, { commodity: commodity.commodity || commodity });
    }
    const detail = await adminService.updateCommodityAdmin(id, body, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function postCommodityVariant(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.createCommodityVariant(id, req.body || {}, req.admin, req);
    return ok(res, detail, 201);
  } catch (error) {
    return next(error);
  }
}

export async function patchCommodityVariant(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.updateCommodityVariant(id, req.body || {}, req.admin, req);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function getCommodityObservations(req, res, next) {
  try {
    const result = await adminService.listCommodityObservations({
      q: req.query.q,
      commodityId: req.query.commodityId,
      category: req.query.category,
      stateId: req.query.stateId,
      lgaId: req.query.lgaId,
      areaId: req.query.areaId,
      market: req.query.market,
      sourceType: req.query.sourceType,
      status: req.query.status,
      freshness: req.query.freshness,
      verification: req.query.verification,
      from: req.query.from,
      to: req.query.to,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getCommodityObservationDetail(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.getCommodityObservation(id);
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function patchCommodityObservation(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const detail = await adminService.updateCommodityObservation(
      id,
      req.body || {},
      req.admin,
      req
    );
    return ok(res, detail);
  } catch (error) {
    return next(error);
  }
}

export async function getCommodityMarkets(req, res, next) {
  try {
    const result = await adminService.listCommodityMarkets({
      q: req.query.q,
      stateId: req.query.stateId,
      lgaId: req.query.lgaId,
      active: req.query.active,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postCommodityMarket(req, res, next) {
  try {
    const result = await adminService.createCommodityMarket(req.body || {}, req.admin, req);
    return ok(res, result, 201);
  } catch (error) {
    return next(error);
  }
}

export async function patchCommodityMarket(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const result = await adminService.updateCommodityMarket(id, req.body || {}, req.admin, req);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postCommodityMarketAlias(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const alias = await adminService.addCommodityMarketAlias(id, req.body || {}, req.admin, req);
    return ok(res, { alias }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function deleteCommodityMarketAlias(req, res, next) {
  try {
    const { id, aliasId } = z
      .object({ id: z.string().uuid(), aliasId: z.string().uuid() })
      .parse(req.params);
    const result = await adminService.removeCommodityMarketAlias(
      id,
      aliasId,
      req.body || {},
      req.admin,
      req
    );
    return ok(res, { result });
  } catch (error) {
    return next(error);
  }
}

export async function getCommodityConflicts(req, res, next) {
  try {
    const conflicts = await adminService.commodityConflicts({ limit: req.query.limit });
    return ok(res, { conflicts });
  } catch (error) {
    return next(error);
  }
}

export async function getCommodityDuplicates(req, res, next) {
  try {
    const duplicates = await adminService.commodityDuplicates({ limit: req.query.limit });
    return ok(res, { duplicates });
  } catch (error) {
    return next(error);
  }
}

export async function getCommodityQuality(req, res, next) {
  try {
    const issues = await adminService.commodityQuality({ limit: req.query.limit });
    return ok(res, { issues });
  } catch (error) {
    return next(error);
  }
}

export async function getCommodityOfficialSources(req, res, next) {
  try {
    const sources = await adminService.commodityOfficialSources();
    return ok(res, { sources });
  } catch (error) {
    return next(error);
  }
}

export async function getCommodityPriceAnomalies(req, res, next) {
  try {
    const anomalies = await adminService.commodityPriceAnomalies({ limit: req.query.limit });
    return ok(res, { anomalies });
  } catch (error) {
    return next(error);
  }
}

export async function getCommodityCompare(req, res, next) {
  try {
    const result = await adminService.commodityCompare({
      commodity: req.query.commodity,
      variant: req.query.variant,
      locationId: req.query.locationId,
      lat: req.query.lat,
      lng: req.query.lng,
      pricingContext: req.query.pricingContext || 'retail',
      radiusKm: req.query.radiusKm,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postCommodityMarketMerge(req, res, next) {
  try {
    const result = await adminService.mergeCommodityMarkets(req.body || {}, req.admin, req);
    return ok(res, { result });
  } catch (error) {
    return next(error);
  }
}

export async function getCommodityCategories(req, res, next) {
  try {
    const categories = await adminService.commodityCategories();
    return ok(res, { categories });
  } catch (error) {
    return next(error);
  }
}

export async function getCommunity(req, res, next) {
  try {
    const result = await adminService.listCommunity({
      type: req.query.type,
      q: req.query.q,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getAuditLog(req, res, next) {
  try {
    const result = await adminService.listAuditLog({
      limit: req.query.limit,
      offset: req.query.offset,
      actorUserId: req.query.actorUserId,
      entityType: req.query.entityType,
      action: req.query.action,
      actionPrefix: req.query.actionPrefix,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getAdminSearch(req, res, next) {
  try {
    const results = await adminService.globalSearch(req.query.q, {
      limit: req.query.limit,
    });
    const perms = new Set(permissionsForRole(req.admin?.role) || []);
    const filtered = { ...results };
    if (!perms.has('reports')) delete filtered.reports;
    if (!perms.has('locations')) delete filtered.locations;
    if (!perms.has('official_updates')) delete filtered.officialUpdates;
    if (!perms.has('users')) delete filtered.users;
    if (!perms.has('community')) delete filtered.questions;
    if (!perms.has('fuel_stations')) delete filtered.stations;
    if (!perms.has('transport')) delete filtered.routes;
    return ok(res, { results: filtered, q: req.query.q });
  } catch (error) {
    return next(error);
  }
}

export async function getSearchIntelligenceDashboard(req, res, next) {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    const dashboard = await adminService.getSearchDashboard({ days });
    return ok(res, { dashboard });
  } catch (error) {
    return next(error);
  }
}

export async function getSearchAliases(req, res, next) {
  try {
    const result = await adminService.listSearchAliases({
      q: req.query.q,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function upsertSearchAlias(req, res, next) {
  try {
    const { adminSearchAliasSchema } = await import('../validators/search.js');
    const body = adminSearchAliasSchema.parse(req.body || {});
    const item = await adminService.upsertSearchAlias(req.admin, body, req);
    return ok(res, { item }, 201);
  } catch (error) {
    return next(error);
  }
}

export async function deleteSearchAlias(req, res, next) {
  try {
    const { adminSearchAliasIdSchema } = await import('../validators/search.js');
    const { id } = adminSearchAliasIdSchema.parse(req.params);
    const reason = String(req.body?.reason || req.query?.reason || '').trim();
    const result = await adminService.deleteSearchAlias(req.admin, id, reason, req);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function postSearchPurgeStale(req, res, next) {
  try {
    const result = await adminService.purgeSearchStale(req.admin, req);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getNotificationDashboard(req, res, next) {
  try {
    const dashboard = await adminService.getNotificationDashboard();
    return ok(res, { dashboard });
  } catch (error) {
    return next(error);
  }
}

export async function getNotificationRules(req, res, next) {
  try {
    const result = await adminService.listNotificationRules();
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function patchNotificationRule(req, res, next) {
  try {
    const code = String(req.params.code || '').trim();
    const { adminAlertRulePatchSchema } = await import('../validators/notifications.js');
    const body = adminAlertRulePatchSchema.parse(req.body || {});
    const rule = await adminService.updateNotificationRule(req.admin, code, body, req);
    return ok(res, { rule });
  } catch (error) {
    return next(error);
  }
}

export async function postEmergencyNotification(req, res, next) {
  try {
    const { adminEmergencyAlertSchema } = await import('../validators/notifications.js');
    const body = adminEmergencyAlertSchema.parse(req.body || {});
    const result = await adminService.sendEmergencyNotification(req.admin, body, req);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}
