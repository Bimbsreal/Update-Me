import {
  confirmReportSchema,
  correctReportSchema,
  createReportSchema,
  flagReportSchema,
  listReportsQuerySchema,
  nearbyReportsQuerySchema,
  reportIdParamSchema,
  updateReportSchema,
} from '../validators/reports.js';
import { reportService } from '../services/reportService.js';

export async function listCategories(_req, res, next) {
  try {
    const categories = await reportService.listCategories();
    return res.json({ success: true, categories });
  } catch (error) {
    return next(error);
  }
}

export async function createReport(req, res, next) {
  try {
    const body = createReportSchema.parse(req.body);
    const report = await reportService.create(req.auth.userId, body);
    return res.status(201).json({ success: true, report });
  } catch (error) {
    return next(error);
  }
}

export async function listReports(req, res, next) {
  try {
    const query = listReportsQuerySchema.parse(req.query);
    const data = await reportService.list(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function nearbyReports(req, res, next) {
  try {
    const query = nearbyReportsQuerySchema.parse(req.query);
    const results = await reportService.nearby(query);
    return res.json({ success: true, count: results.length, results });
  } catch (error) {
    return next(error);
  }
}

export async function getReport(req, res, next) {
  try {
    const { id } = reportIdParamSchema.parse(req.params);
    const report = await reportService.getById(id, req.auth?.userId || null);
    return res.json({ success: true, report });
  } catch (error) {
    return next(error);
  }
}

export async function updateReport(req, res, next) {
  try {
    const { id } = reportIdParamSchema.parse(req.params);
    const body = updateReportSchema.parse(req.body);
    const report = await reportService.update(req.auth.userId, id, body);
    return res.json({ success: true, report });
  } catch (error) {
    return next(error);
  }
}

export async function confirmReport(req, res, next) {
  try {
    const { id } = reportIdParamSchema.parse(req.params);
    const body = confirmReportSchema.parse(req.body || {});
    const report = await reportService.confirm(req.auth.userId, id, body);
    return res.json({ success: true, report });
  } catch (error) {
    return next(error);
  }
}

export async function correctReport(req, res, next) {
  try {
    const { id } = reportIdParamSchema.parse(req.params);
    const body = correctReportSchema.parse(req.body);
    const report = await reportService.correct(req.auth.userId, id, body);
    return res.json({ success: true, report });
  } catch (error) {
    return next(error);
  }
}

export async function flagReport(req, res, next) {
  try {
    const { id } = reportIdParamSchema.parse(req.params);
    const body = flagReportSchema.parse(req.body);
    const result = await reportService.flag(req.auth.userId, id, body);
    return res.json({
      success: true,
      report: result.report,
      moderation: result.moderationHook,
    });
  } catch (error) {
    return next(error);
  }
}

export async function reportHistory(req, res, next) {
  try {
    const { id } = reportIdParamSchema.parse(req.params);
    const data = await reportService.history(id, req.auth?.userId || null);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}
