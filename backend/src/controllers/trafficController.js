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

export async function nearbyTraffic(req, res, next) {
  try {
    const query = nearbyTrafficQuerySchema.parse(req.query);
    const results = await trafficService.nearby(query);
    return res.json({ success: true, count: results.length, results });
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
