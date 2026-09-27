import { AppError } from '../middleware/errorHandler.js';
import { locationRepository } from '../repositories/locationRepository.js';
import { reportRepository } from '../repositories/reportRepository.js';
import { pricesRepository } from '../repositories/pricesRepository.js';
import { officialService } from './officialService.js';
import { reportService } from './reportService.js';
import { realtimePublisher } from '../realtime/publisher.js';

function formatPrice(amount) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

function buildTitle(input, commodity, variant) {
  if (input.title?.trim()) return input.title.trim();
  return `${commodity.name} · ${variant.displayName} · ${formatPrice(input.priceAmount)}`;
}

function buildDescription(input, commodity, variant, placeLabel) {
  if (input.notes?.trim()) return input.notes.trim();
  const parts = [
    `Commodity: ${commodity.name}`,
    `Unit: ${variant.displayName}`,
    `Price: ${formatPrice(input.priceAmount)}`,
  ];
  if (placeLabel) parts.push(`Place: ${placeLabel}`);
  parts.push('Community price update. Confirm if this still matches what you see.');
  return parts.join('. ');
}

export const pricesService = {
  async listCommodities() {
    return pricesRepository.listCommodities();
  },

  async list(query) {
    await reportRepository.applyFreshnessTransitions();
    if (query.group === 'report') {
      return pricesRepository.listReports(query);
    }
    return pricesRepository.listVariantSummaries(query);
  },

  async nearby(query) {
    await reportRepository.applyFreshnessTransitions();
    return pricesRepository.nearby(query);
  },

  async getDetail(commoditySlug, variantCode, query = {}) {
    await reportRepository.applyFreshnessTransitions();
    const commodity = await pricesRepository.findCommodityByCodeOrSlug(commoditySlug);
    if (!commodity || !commodity.isActive) {
      throw new AppError('Commodity not found.', 404, 'COMMODITY_NOT_FOUND');
    }
    const variant = await pricesRepository.findVariant({
      commodityId: commodity.id,
      variantCode,
    });
    if (!variant) {
      throw new AppError('Unit/variant not found.', 404, 'VARIANT_NOT_FOUND');
    }

    const [summaries, reports, history, official] = await Promise.all([
      pricesRepository.listVariantSummaries({
        commodityId: commodity.id,
        variantId: variant.id,
        locationId: query.locationId,
        freshness: query.freshness === 'historical' ? 'any' : query.freshness || 'any',
        page: 1,
        limit: 1,
      }),
      pricesRepository.listReports({
        commodityId: commodity.id,
        variantId: variant.id,
        locationId: query.locationId,
        freshness: 'any',
        page: 1,
        limit: 25,
      }),
      pricesRepository.history({
        commodityId: commodity.id,
        variantId: variant.id,
        locationId: query.locationId,
        period: query.period || '30d',
      }),
      officialService
        .list({ category: 'financial_economic', page: 1, limit: 5 })
        .catch(() => ({ items: [] })),
    ]);

    return {
      commodity,
      variant,
      summary: summaries.items[0] || null,
      recentReports: reports.items,
      history,
      officialUpdates: (official.items || []).filter((item) => item.isOfficial),
      asOf: new Date().toISOString(),
    };
  },

  async createReport(userId, input) {
    let commodity = null;
    if (input.commodityId) {
      commodity = await pricesRepository.findCommodityById(input.commodityId);
    } else if (input.commodityCode) {
      commodity = await pricesRepository.findCommodityByCodeOrSlug(input.commodityCode);
    }
    if (!commodity || !commodity.isActive) {
      throw new AppError('Commodity not found.', 404, 'COMMODITY_NOT_FOUND');
    }

    const variant = await pricesRepository.findVariant({
      commodityId: commodity.id,
      variantId: input.variantId,
      variantCode: input.variantCode,
    });
    if (!variant) {
      throw new AppError('Unit/variant not found.', 404, 'VARIANT_NOT_FOUND');
    }
    if (variant.commodityId !== commodity.id) {
      throw new AppError('Variant does not belong to this commodity.', 400, 'VARIANT_MISMATCH');
    }

    const location = await locationRepository.findById(input.locationId);
    if (!location) {
      throw new AppError('Selected location was not found.', 404, 'LOCATION_NOT_FOUND');
    }

    const duplicate = await pricesRepository.findRecentDuplicate({
      userId,
      variantId: variant.id,
      locationId: input.locationId,
      withinMinutes: 120,
    });
    if (duplicate) {
      throw new AppError(
        'You already reported this price for this unit and location recently.',
        409,
        'PRICE_DUPLICATE'
      );
    }

    let placeId = input.placeId || null;
    const placeLabel = input.placeLabel?.trim() || null;
    if (!placeId && placeLabel) {
      placeId = await pricesRepository.findOrCreatePlace({
        locationId: input.locationId,
        name: placeLabel,
        placeType: input.placeType || 'market',
        createdBy: userId,
      });
    }

    const title = buildTitle(input, commodity, variant);
    const description = buildDescription(input, commodity, variant, placeLabel);
    const coords = location.coordinates || {};

    const report = await reportService.create(userId, {
      category: 'prices',
      title,
      description,
      locationId: input.locationId,
      latitude: coords.lat ?? null,
      longitude: coords.lng ?? null,
      occurredAt: input.observedAt || undefined,
      metadata: {
        module: 'prices',
        commodityId: commodity.id,
        variantId: variant.id,
        priceAmount: input.priceAmount,
      },
    });

    if (report.sourceType === 'official') {
      throw new AppError('Invalid report source.', 400, 'INVALID_SOURCE');
    }

    const price = await pricesRepository.createPriceReport({
      reportId: report.id,
      commodityId: commodity.id,
      variantId: variant.id,
      placeId,
      placeLabel,
      priceAmount: input.priceAmount,
      priceCurrency: input.priceCurrency || 'NGN',
      sourceReference: input.sourceReference || null,
      pricingContext: input.pricingContext || 'retail',
      publishedAt: input.publishedAt || null,
      effectiveAt: input.effectiveAt || null,
    });

    await reportRepository.addHistory({
      reportId: report.id,
      actorUserId: userId,
      eventType: 'system',
      previousState: null,
      newState: {
        priceId: price.id,
        commodityId: commodity.id,
        variantId: variant.id,
        priceAmount: input.priceAmount,
      },
      reason: 'Commodity price details attached',
    });

    realtimePublisher.priceUpdated(price);

    try {
      const { userAlertService } = await import('./userAlertService.js');
      const { notificationService, safeNotify } = await import('./notificationService.js');
      const hits = await userAlertService.evaluateCommodityPrice({
        commodityCode: commodity.code || commodity.slug,
        commodityLabel: commodity.name || commodity.code,
        commodityVariant: variant.code || variant.label,
        price: input.priceAmount,
        locationId: input.locationId,
        locationName: location.name,
        observationId: price.id,
        href: `/prices/${commodity.code || commodity.slug}/${variant.code || 'default'}`,
      });
      for (const hit of hits) {
        safeNotify(notificationService.notifyCommodityThreshold(hit, { actorUserId: userId }));
      }
    } catch (err) {
      console.error('[prices] notify failed', err?.message || err);
    }

    return price;
  },

  async getReport(id, viewerUserId = null) {
    await reportRepository.applyFreshnessTransitions();
    const price = await pricesRepository.findPriceById(id);
    if (!price) throw new AppError('Price report not found.', 404, 'PRICE_NOT_FOUND');
    if (price.report.status === 'removed' && price.report.author?.id !== viewerUserId) {
      throw new AppError('Price report not found.', 404, 'PRICE_NOT_FOUND');
    }
    return price;
  },

  async confirm(userId, id, body) {
    const raw = await pricesRepository.findRawPriceById(id);
    if (!raw) throw new AppError('Price report not found.', 404, 'PRICE_NOT_FOUND');
    await reportService.confirm(userId, raw.report_id, body);
    return this.getReport(id, userId);
  },

  async correct(userId, id, body) {
    const raw = await pricesRepository.findRawPriceById(id);
    if (!raw) throw new AppError('Price report not found.', 404, 'PRICE_NOT_FOUND');
    await reportService.correct(userId, raw.report_id, body);
    return this.getReport(id, userId);
  },

  async history(id) {
    const raw = await pricesRepository.findRawPriceById(id);
    if (!raw) throw new AppError('Price report not found.', 404, 'PRICE_NOT_FOUND');
    return reportService.history(raw.report_id);
  },

  async summary(query) {
    await reportRepository.applyFreshnessTransitions();
    return pricesRepository.summary(query);
  },
};
