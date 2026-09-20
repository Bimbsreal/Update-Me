import {
  alertConfirmSchema,
  alertCorrectSchema,
  alertFlagSchema,
  alertIdParamSchema,
  createAlertSchema,
  listAlertsQuerySchema,
  nearbyAlertsQuerySchema,
} from '../validators/alerts.js';
import { alertsService } from '../services/alertsService.js';

export async function getAlertsTaxonomy(_req, res, next) {
  try {
    return res.json({ success: true, ...alertsService.taxonomy() });
  } catch (error) {
    return next(error);
  }
}

export async function createAlert(req, res, next) {
  try {
    const body = createAlertSchema.parse(req.body);
    const alert = await alertsService.create(req.auth.userId, body);
    return res.status(201).json({ success: true, alert });
  } catch (error) {
    return next(error);
  }
}

export async function listAlerts(req, res, next) {
  try {
    const query = listAlertsQuerySchema.parse(req.query);
    const data = await alertsService.list(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function nearbyAlerts(req, res, next) {
  try {
    const query = nearbyAlertsQuerySchema.parse(req.query);
    const results = await alertsService.nearby(query);
    return res.json({ success: true, count: results.length, results });
  } catch (error) {
    return next(error);
  }
}

export async function getAlert(req, res, next) {
  try {
    const { id } = alertIdParamSchema.parse(req.params);
    const alert = await alertsService.getById(id, req.auth?.userId || null);
    return res.json({ success: true, alert });
  } catch (error) {
    return next(error);
  }
}

export async function confirmAlert(req, res, next) {
  try {
    const { id } = alertIdParamSchema.parse(req.params);
    const body = alertConfirmSchema.parse(req.body || {});
    const alert = await alertsService.confirm(req.auth.userId, id, body);
    return res.json({ success: true, alert });
  } catch (error) {
    return next(error);
  }
}

export async function correctAlert(req, res, next) {
  try {
    const { id } = alertIdParamSchema.parse(req.params);
    const body = alertCorrectSchema.parse(req.body);
    const alert = await alertsService.correct(req.auth.userId, id, body);
    return res.json({ success: true, alert });
  } catch (error) {
    return next(error);
  }
}

export async function flagAlert(req, res, next) {
  try {
    const { id } = alertIdParamSchema.parse(req.params);
    const body = alertFlagSchema.parse(req.body);
    const alert = await alertsService.flag(req.auth.userId, id, body);
    return res.json({ success: true, alert });
  } catch (error) {
    return next(error);
  }
}

export async function alertHistory(req, res, next) {
  try {
    const { id } = alertIdParamSchema.parse(req.params);
    const data = await alertsService.history(id, req.auth?.userId || null);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}
