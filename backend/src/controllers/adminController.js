import { adminService } from '../services/adminService.js';
import {
  moderationActionSchema,
  queueIdParamSchema,
  entityIdParamSchema,
  officialSourceIdParamSchema,
  suspendUserSchema,
  restoreUserSchema,
  setRoleSchema,
  setActiveSchema,
  hideOfficialUpdateSchema,
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

export async function getModerationQueue(req, res, next) {
  try {
    const result = await adminService.moderationQueue({
      limit: req.query.limit,
      offset: req.query.offset,
      type: req.query.type,
    });
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
    const user = await adminService.getUser(id);
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
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function getFuelStations(req, res, next) {
  try {
    const result = await adminService.listFuelStations({
      q: req.query.q,
      active: req.query.active,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function patchFuelStation(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = setActiveSchema.parse(req.body);
    const station = await adminService.setFuelStationActive(req.admin, id, body, req);
    return ok(res, { station });
  } catch (error) {
    return next(error);
  }
}

export async function getTransportRoutes(req, res, next) {
  try {
    const result = await adminService.listTransportRoutes({
      q: req.query.q,
      active: req.query.active,
      page: req.query.page,
      limit: req.query.limit,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function patchTransportRoute(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = setActiveSchema.parse(req.body);
    const route = await adminService.setTransportRouteActive(req.admin, id, body, req);
    return ok(res, { route });
  } catch (error) {
    return next(error);
  }
}

export async function getCommodities(req, res, next) {
  try {
    const result = await adminService.listCommodities({
      q: req.query.q,
      active: req.query.active,
    });
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
}

export async function patchCommodity(req, res, next) {
  try {
    const { id } = entityIdParamSchema.parse(req.params);
    const body = setActiveSchema.parse(req.body);
    const commodity = await adminService.setCommodityActive(req.admin, id, body, req);
    return ok(res, { commodity });
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
    return ok(res, { results, q: req.query.q });
  } catch (error) {
    return next(error);
  }
}
