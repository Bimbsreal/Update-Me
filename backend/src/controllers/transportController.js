import {
  createTransportFareSchema,
  createTransportRouteSchema,
  listTransportFaresQuerySchema,
  listTransportRoutesQuerySchema,
  searchTransportQuerySchema,
  transportConfirmSchema,
  transportCorrectSchema,
  transportIdParamSchema,
  transportSummaryQuerySchema,
} from '../validators/transport.js';
import { TRANSPORT_FARE_UNITS, TRANSPORT_MODES } from '../config/transport.js';
import { transportService } from '../services/transportService.js';

export async function getTransportTaxonomy(_req, res, next) {
  try {
    return res.json({
      success: true,
      taxonomy: {
        modes: TRANSPORT_MODES,
        fareUnits: TRANSPORT_FARE_UNITS,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function listTransportRoutes(req, res, next) {
  try {
    const query = listTransportRoutesQuerySchema.parse(req.query);
    const data = await transportService.listRoutes(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function createTransportRoute(req, res, next) {
  try {
    const body = createTransportRouteSchema.parse(req.body);
    const route = await transportService.createRoute(req.auth.userId, body);
    return res.status(201).json({ success: true, route });
  } catch (error) {
    return next(error);
  }
}

export async function getTransportRoute(req, res, next) {
  try {
    const { id } = transportIdParamSchema.parse(req.params);
    const data = await transportService.getRoute(id);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function searchTransport(req, res, next) {
  try {
    const query = searchTransportQuerySchema.parse(req.query);
    const results = await transportService.search(query);
    return res.json({ success: true, count: results.length, results });
  } catch (error) {
    return next(error);
  }
}

export async function transportSummary(req, res, next) {
  try {
    const query = transportSummaryQuerySchema.parse(req.query);
    const summary = await transportService.summary(query);
    return res.json({ success: true, summary });
  } catch (error) {
    return next(error);
  }
}

export async function listTransportFares(req, res, next) {
  try {
    const query = listTransportFaresQuerySchema.parse(req.query);
    const data = await transportService.listFares(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function createTransportFare(req, res, next) {
  try {
    const body = createTransportFareSchema.parse(req.body);
    const fare = await transportService.createFare(req.auth.userId, body);
    return res.status(201).json({ success: true, fare });
  } catch (error) {
    return next(error);
  }
}

export async function getTransportFare(req, res, next) {
  try {
    const { id } = transportIdParamSchema.parse(req.params);
    const fare = await transportService.getFare(id, req.auth?.userId || null);
    return res.json({ success: true, fare });
  } catch (error) {
    return next(error);
  }
}

export async function confirmTransportFare(req, res, next) {
  try {
    const { id } = transportIdParamSchema.parse(req.params);
    const body = transportConfirmSchema.parse(req.body || {});
    const fare = await transportService.confirm(req.auth.userId, id, body);
    return res.json({ success: true, fare });
  } catch (error) {
    return next(error);
  }
}

export async function correctTransportFare(req, res, next) {
  try {
    const { id } = transportIdParamSchema.parse(req.params);
    const body = transportCorrectSchema.parse(req.body);
    const fare = await transportService.correct(req.auth.userId, id, body);
    return res.json({ success: true, fare });
  } catch (error) {
    return next(error);
  }
}

export async function transportFareHistory(req, res, next) {
  try {
    const { id } = transportIdParamSchema.parse(req.params);
    const history = await transportService.history(id);
    return res.json({ success: true, history });
  } catch (error) {
    return next(error);
  }
}
