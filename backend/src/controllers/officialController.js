import {
  createOfficialSourceSchema,
  officialContextQuerySchema,
  officialIdParamSchema,
  officialListQuerySchema,
  officialNearbyQuerySchema,
  officialSourceIdParamSchema,
  officialSyncBodySchema,
  updateOfficialSourceSchema,
} from '../validators/official.js';
import { officialService } from '../services/officialService.js';
import { officialSyncService } from '../services/officialSyncService.js';

export async function listOfficialUpdates(req, res, next) {
  try {
    const query = officialListQuerySchema.parse(req.query);
    const data = await officialService.list({
      category: query.category,
      sourceId: query.source,
      jurisdiction: query.jurisdiction,
      locationId: query.locationId,
      stateId: query.stateId,
      from: query.from,
      to: query.to,
      freshnessHours: query.freshnessHours,
      includeExpired: query.includeExpired,
      q: query.q,
      priority: query.priority,
      updateType: query.updateType,
      page: query.page,
      limit: query.limit,
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function getOfficialUpdate(req, res, next) {
  try {
    const { id } = officialIdParamSchema.parse(req.params);
    const data = await officialService.getById(id);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function nearbyOfficialUpdates(req, res, next) {
  try {
    const query = officialNearbyQuerySchema.parse(req.query);
    const data = await officialService.nearby(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function contextOfficialUpdates(req, res, next) {
  try {
    const query = officialContextQuerySchema.parse(req.query);
    const data = await officialService.forUserLocation(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function listOfficialTaxonomy(_req, res, next) {
  try {
    return res.json({ success: true, taxonomy: officialService.getTaxonomy() });
  } catch (error) {
    return next(error);
  }
}

export async function listOfficialSourcesPublic(_req, res, next) {
  try {
    const sources = await officialService.listPublicSources();
    return res.json({ success: true, sources });
  } catch (error) {
    return next(error);
  }
}

export async function getOfficialSourcePublic(req, res, next) {
  try {
    const { id } = officialSourceIdParamSchema.parse(req.params);
    const data = await officialService.getPublicSource(id, {
      limit: 30,
      includeExpired: false,
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function getOfficialAdminStatus(_req, res, next) {
  try {
    const status = await officialService.adminStatus();
    return res.json({ success: true, status });
  } catch (error) {
    return next(error);
  }
}

export async function createOfficialSource(req, res, next) {
  try {
    const body = createOfficialSourceSchema.parse(req.body);
    const source = await officialService.createSource(body, req.officialAdmin || {});
    return res.status(201).json({ success: true, source });
  } catch (error) {
    return next(error);
  }
}

export async function updateOfficialSource(req, res, next) {
  try {
    const { id } = officialSourceIdParamSchema.parse(req.params);
    const body = updateOfficialSourceSchema.parse(req.body);
    const source = await officialService.updateSource(id, body, req.officialAdmin || {});
    return res.json({ success: true, source });
  } catch (error) {
    return next(error);
  }
}

export async function getOfficialSourceAdmin(req, res, next) {
  try {
    const { id } = officialSourceIdParamSchema.parse(req.params);
    const source = await officialService.getSource(id);
    return res.json({ success: true, source });
  } catch (error) {
    return next(error);
  }
}

export async function postOfficialAdminSync(req, res, next) {
  try {
    const body = officialSyncBodySchema.parse(req.body || {});
    let sync;
    if (body.sourceId) {
      const result = await officialSyncService.syncSource(body.sourceId);
      sync = { status: result.status, results: [result] };
    } else {
      sync = await officialSyncService.syncAllActive();
    }
    return res.json({ success: true, sync });
  } catch (error) {
    return next(error);
  }
}
