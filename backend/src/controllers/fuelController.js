import {
  createFuelReportSchema,
  createFuelStationSchema,
  fuelConfirmSchema,
  fuelCorrectSchema,
  fuelIdParamSchema,
  fuelSummaryQuerySchema,
  listFuelReportsQuerySchema,
  listFuelStationsQuerySchema,
  nearbyFuelQuerySchema,
} from '../validators/fuel.js';
import {
  FUEL_AVAILABILITY,
  FUEL_PRODUCT_TYPES,
  FUEL_QUEUE_CONDITIONS,
} from '../config/fuel.js';
import { FUEL_PRICING_CONTEXTS } from '../config/fuelIntelligence.js';
import { fuelService } from '../services/fuelService.js';
import { fuelAdminService } from '../services/fuelAdminService.js';

export async function getFuelTaxonomy(_req, res, next) {
  try {
    return res.json({
      success: true,
      taxonomy: {
        fuelTypes: FUEL_PRODUCT_TYPES,
        availability: FUEL_AVAILABILITY,
        queueConditions: FUEL_QUEUE_CONDITIONS,
        pricingContexts: FUEL_PRICING_CONTEXTS,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function listFuelStations(req, res, next) {
  try {
    const query = listFuelStationsQuerySchema.parse(req.query);
    const data = await fuelService.listStations(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function createFuelStation(req, res, next) {
  try {
    const body = createFuelStationSchema.parse(req.body);
    const station = await fuelService.createStation(req.auth.userId, body);
    return res.status(201).json({ success: true, station });
  } catch (error) {
    return next(error);
  }
}

export async function getFuelStation(req, res, next) {
  try {
    const { id } = fuelIdParamSchema.parse(req.params);
    const data = await fuelService.getStation(id, {
      fuelType: req.query.fuelType || 'pms',
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function stationPriceHistory(req, res, next) {
  try {
    const { id } = fuelIdParamSchema.parse(req.params);
    const hoursRaw = req.query.hours != null ? Number(req.query.hours) : null;
    const hours =
      hoursRaw != null && Number.isFinite(hoursRaw)
        ? Math.min(Math.max(Math.trunc(hoursRaw), 1), 24 * 90)
        : null;
    const history = await fuelAdminService.priceHistory(id, {
      fuelType: req.query.fuelType || 'pms',
      limit: req.query.limit != null ? Number(req.query.limit) : 40,
      hours,
    });
    const points = (history.items || [])
      .filter((h) => h.price?.amount != null)
      .map((h) => ({
        rate: Number(h.price.amount),
        at: h.observedAt,
        sourceType: h.sourceType,
      }));
    return res.json({
      success: true,
      ...history,
      points,
      hours: hours || null,
      asOf: new Date().toISOString(),
      note: 'Historical observations only — not a live pump price.',
    });
  } catch (error) {
    return next(error);
  }
}

export async function nearbyFuel(req, res, next) {
  try {
    const query = nearbyFuelQuerySchema.parse(req.query);
    const results = await fuelService.nearbyStations(query);
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

export async function compareFuel(req, res, next) {
  try {
    const result = await fuelAdminService.compareNearby({
      locationId: req.query.locationId,
      lat: req.query.lat != null ? Number(req.query.lat) : undefined,
      lng: req.query.lng != null ? Number(req.query.lng) : undefined,
      fuelType: req.query.fuelType || 'pms',
      radiusKm: req.query.radiusKm != null ? Number(req.query.radiusKm) : 5,
      limit: req.query.limit != null ? Number(req.query.limit) : 20,
    });
    return res.json({
      success: true,
      ...result,
      asOf: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function fuelSummary(req, res, next) {
  try {
    const query = fuelSummaryQuerySchema.parse(req.query);
    const summary = await fuelService.summary(query);
    return res.json({ success: true, summary });
  } catch (error) {
    return next(error);
  }
}

export async function listFuelReports(req, res, next) {
  try {
    const query = listFuelReportsQuerySchema.parse(req.query);
    const data = await fuelService.listReports(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function createFuelReport(req, res, next) {
  try {
    const body = createFuelReportSchema.parse(req.body);
    const fuel = await fuelService.createReport(req.auth.userId, body);
    return res.status(201).json({ success: true, fuel });
  } catch (error) {
    return next(error);
  }
}

export async function getFuelReport(req, res, next) {
  try {
    const { id } = fuelIdParamSchema.parse(req.params);
    const fuel = await fuelService.getReport(id, req.auth?.userId || null);
    return res.json({ success: true, fuel });
  } catch (error) {
    return next(error);
  }
}

export async function confirmFuelReport(req, res, next) {
  try {
    const { id } = fuelIdParamSchema.parse(req.params);
    const body = fuelConfirmSchema.parse(req.body || {});
    const fuel = await fuelService.confirm(req.auth.userId, id, body);
    return res.json({ success: true, fuel });
  } catch (error) {
    return next(error);
  }
}

export async function correctFuelReport(req, res, next) {
  try {
    const { id } = fuelIdParamSchema.parse(req.params);
    const body = fuelCorrectSchema.parse(req.body);
    const fuel = await fuelService.correct(req.auth.userId, id, body);
    return res.json({ success: true, fuel });
  } catch (error) {
    return next(error);
  }
}

export async function fuelReportHistory(req, res, next) {
  try {
    const { id } = fuelIdParamSchema.parse(req.params);
    const history = await fuelService.history(id);
    return res.json({ success: true, history });
  } catch (error) {
    return next(error);
  }
}
