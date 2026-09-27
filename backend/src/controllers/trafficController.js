import {
  createTrafficSchema,
  listTrafficQuerySchema,
  nearbyTrafficQuerySchema,
  trafficConfirmSchema,
  trafficCorrectSchema,
  trafficIdParamSchema,
  trafficSummaryQuerySchema,
} from '../validators/traffic.js';
import { trafficService } from '../services/trafficService.js';

export async function createTraffic(req, res, next) {
  try {
    const body = createTrafficSchema.parse(req.body);
    const traffic = await trafficService.create(req.auth.userId, body);
    return res.status(201).json({ success: true, traffic });
  } catch (error) {
    return next(error);
  }
}

export async function listTraffic(req, res, next) {
  try {
    const query = listTrafficQuerySchema.parse(req.query);
    const data = await trafficService.list(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function listTrafficEvents(req, res, next) {
  try {
    const q = req.query || {};
    const data = await trafficService.listEvents({
      locationId: q.locationId,
      stateId: q.stateId,
      lgaId: q.lgaId,
      road: q.road,
      eventType: q.eventType,
      q: q.q,
      lat: q.lat != null ? Number(q.lat) : undefined,
      lng: q.lng != null ? Number(q.lng) : undefined,
      radiusKm: q.radiusKm != null ? Number(q.radiusKm) : undefined,
      limit: q.limit != null ? Number(q.limit) : 60,
      bbox:
        q.west != null
          ? {
              west: Number(q.west),
              south: Number(q.south),
              east: Number(q.east),
              north: Number(q.north),
            }
          : undefined,
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function nearbyTraffic(req, res, next) {
  try {
    const query = nearbyTrafficQuerySchema.parse(req.query);
    const results = await trafficService.nearby(query);
    return res.json({
      success: true,
      count: results.length,
      results,
      asOf: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function trafficSummary(req, res, next) {
  try {
    const query = trafficSummaryQuerySchema.parse(req.query);
    const summary = await trafficService.summary(query);
    return res.json({ success: true, summary });
  } catch (error) {
    return next(error);
  }
}

export async function getTrafficEvent(req, res, next) {
  try {
    const { id } = trafficIdParamSchema.parse(req.params);
    const { trafficEventAdminService } = await import('../services/trafficEventAdminService.js');
    const data = await trafficEventAdminService.getPublic(id);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function getTraffic(req, res, next) {
  try {
    const { id } = trafficIdParamSchema.parse(req.params);
    const traffic = await trafficService.getById(id, req.auth?.userId || null);
    return res.json({ success: true, traffic });
  } catch (error) {
    return next(error);
  }
}

export async function confirmTraffic(req, res, next) {
  try {
    const { id } = trafficIdParamSchema.parse(req.params);
    const body = trafficConfirmSchema.parse(req.body || {});
    const traffic = await trafficService.confirm(req.auth.userId, id, body);
    return res.json({ success: true, traffic });
  } catch (error) {
    return next(error);
  }
}

export async function correctTraffic(req, res, next) {
  try {
    const { id } = trafficIdParamSchema.parse(req.params);
    const body = trafficCorrectSchema.parse(req.body);
    const traffic = await trafficService.correct(req.auth.userId, id, body);
    return res.json({ success: true, traffic });
  } catch (error) {
    return next(error);
  }
}

export async function trafficHistory(req, res, next) {
  try {
    const { id } = trafficIdParamSchema.parse(req.params);
    const data = await trafficService.history(id, req.auth?.userId || null);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}
