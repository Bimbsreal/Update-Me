import {
  createPriceReportSchema,
  listPricesQuerySchema,
  nearbyPricesQuerySchema,
  priceCommodityVariantParamSchema,
  priceConfirmSchema,
  priceCorrectSchema,
  priceDetailQuerySchema,
  priceIdParamSchema,
  priceSummaryQuerySchema,
} from '../validators/prices.js';
import { PRICE_HISTORY_PERIODS, PRICE_PLACE_TYPES, COMMODITY_PRICING_CONTEXTS } from '../config/prices.js';
import { pricesService } from '../services/pricesService.js';
import { commodityAdminService } from '../services/commodityAdminService.js';

export async function getPricesTaxonomy(_req, res, next) {
  try {
    const commodities = await pricesService.listCommodities();
    return res.json({
      success: true,
      taxonomy: {
        commodities,
        placeTypes: PRICE_PLACE_TYPES,
        historyPeriods: PRICE_HISTORY_PERIODS,
        pricingContexts: COMMODITY_PRICING_CONTEXTS,
      },
    });
  } catch (error) {
    return next(error);
  }
}

export async function listCommodities(_req, res, next) {
  try {
    const commodities = await pricesService.listCommodities();
    return res.json({ success: true, commodities });
  } catch (error) {
    return next(error);
  }
}

export async function listPrices(req, res, next) {
  try {
    const query = listPricesQuerySchema.parse(req.query);
    const data = await pricesService.list(query);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function nearbyPrices(req, res, next) {
  try {
    const query = nearbyPricesQuerySchema.parse(req.query);
    const results = await pricesService.nearby(query);
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

export async function comparePrices(req, res, next) {
  try {
    const result = await commodityAdminService.compareNearby({
      commodity: req.query.commodity,
      variant: req.query.variant,
      locationId: req.query.locationId,
      lat: req.query.lat != null ? Number(req.query.lat) : undefined,
      lng: req.query.lng != null ? Number(req.query.lng) : undefined,
      pricingContext: req.query.pricingContext || 'retail',
      radiusKm: req.query.radiusKm,
      limit: req.query.limit,
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

export async function pricesSummary(req, res, next) {
  try {
    const query = priceSummaryQuerySchema.parse(req.query);
    const summary = await pricesService.summary(query);
    return res.json({ success: true, summary });
  } catch (error) {
    return next(error);
  }
}

export async function getPriceDetail(req, res, next) {
  try {
    const params = priceCommodityVariantParamSchema.parse(req.params);
    const query = priceDetailQuerySchema.parse(req.query);
    const data = await pricesService.getDetail(params.commodity, params.variant, query);
    return res.json({
      success: true,
      ...data,
      asOf: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
}

export async function createPriceReport(req, res, next) {
  try {
    const body = createPriceReportSchema.parse(req.body);
    const price = await pricesService.createReport(req.auth.userId, body);
    return res.status(201).json({ success: true, price });
  } catch (error) {
    return next(error);
  }
}

export async function getPriceReport(req, res, next) {
  try {
    const { id } = priceIdParamSchema.parse(req.params);
    const price = await pricesService.getReport(id, req.auth?.userId || null);
    return res.json({ success: true, price });
  } catch (error) {
    return next(error);
  }
}

export async function confirmPriceReport(req, res, next) {
  try {
    const { id } = priceIdParamSchema.parse(req.params);
    const body = priceConfirmSchema.parse(req.body || {});
    const price = await pricesService.confirm(req.auth.userId, id, body);
    return res.json({ success: true, price });
  } catch (error) {
    return next(error);
  }
}

export async function correctPriceReport(req, res, next) {
  try {
    const { id } = priceIdParamSchema.parse(req.params);
    const body = priceCorrectSchema.parse(req.body);
    const price = await pricesService.correct(req.auth.userId, id, body);
    return res.json({ success: true, price });
  } catch (error) {
    return next(error);
  }
}

export async function priceReportHistory(req, res, next) {
  try {
    const { id } = priceIdParamSchema.parse(req.params);
    const history = await pricesService.history(id);
    return res.json({ success: true, history });
  } catch (error) {
    return next(error);
  }
}
