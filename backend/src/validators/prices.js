import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common.js';
import { PRICE_HISTORY_PERIODS, PRICE_PLACE_TYPES } from '../config/prices.js';

export const PLACE_TYPE_IDS = PRICE_PLACE_TYPES.map((p) => p.id);
export const HISTORY_PERIOD_IDS = PRICE_HISTORY_PERIODS.map((p) => p.id);

const placeTypeEnum = z.enum(PLACE_TYPE_IDS);
const periodEnum = z.enum(HISTORY_PERIOD_IDS);

export const createPriceReportSchema = z
  .object({
    commodityId: uuidSchema.optional(),
    commodityCode: z.string().trim().min(2).max(40).optional(),
    variantId: uuidSchema.optional(),
    variantCode: z.string().trim().min(1).max(40).optional(),
    locationId: uuidSchema,
    priceAmount: z.coerce.number().positive().max(10_000_000),
    priceCurrency: z.string().trim().length(3).toUpperCase().optional().default('NGN'),
    placeId: uuidSchema.optional(),
    placeLabel: z.string().trim().min(2).max(160).optional(),
    placeType: placeTypeEnum.optional().default('market'),
    pricingContext: z
      .enum([
        'retail',
        'wholesale',
        'market',
        'supermarket',
        'local_seller',
        'official_publication',
        'other',
      ])
      .optional()
      .default('retail'),
    notes: z.string().trim().max(4000).optional(),
    title: z.string().trim().min(3).max(160).optional(),
    observedAt: z.coerce.date().optional(),
    sourceReference: z.string().trim().min(2).max(240).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.commodityId && !data.commodityCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a commodity',
        path: ['commodityId'],
      });
    }
    if (!data.variantId && !data.variantCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a unit/variant',
        path: ['variantId'],
      });
    }
    if (data.priceCurrency && data.priceCurrency !== 'NGN') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only NGN prices are supported',
        path: ['priceCurrency'],
      });
    }
    if (data.observedAt && data.observedAt.getTime() > Date.now() + 60_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Observation time cannot be in the future',
        path: ['observedAt'],
      });
    }
  });

export const listPricesQuerySchema = paginationSchema.extend({
  commodityId: uuidSchema.optional(),
  commodity: z.string().trim().min(1).max(80).optional(),
  variantId: uuidSchema.optional(),
  variant: z.string().trim().min(1).max(40).optional(),
  locationId: uuidSchema.optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any', 'historical']).optional().default('fresh'),
  q: z.string().trim().min(1).max(120).optional(),
  group: z.enum(['variant', 'report']).optional().default('variant'),
});

export const nearbyPricesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.1).max(50).default(15),
  commodity: z.string().trim().min(1).max(80).optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('fresh'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const priceDetailQuerySchema = z.object({
  locationId: uuidSchema.optional(),
  period: periodEnum.optional().default('30d'),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any', 'historical']).optional().default('any'),
});

export const priceIdParamSchema = z.object({
  id: uuidSchema,
});

export const priceCommodityVariantParamSchema = z.object({
  commodity: z.string().trim().min(1).max(80),
  variant: z.string().trim().min(1).max(40),
});

export const priceConfirmSchema = z.object({
  type: z.enum(['still_accurate', 'no_longer_accurate', 'needs_correction']).default('still_accurate'),
  note: z.string().trim().max(500).optional(),
});

export const priceCorrectSchema = z.object({
  type: z.enum(['no_longer_accurate', 'needs_correction']).default('no_longer_accurate'),
  note: z.string().trim().min(3).max(500),
});

export const priceSummaryQuerySchema = z.object({
  locationId: uuidSchema.optional(),
  commodity: z.string().trim().min(1).max(80).optional(),
  hours: z.coerce.number().int().min(1).max(168).optional().default(24),
});
