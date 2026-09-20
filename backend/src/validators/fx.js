import { z } from 'zod';
import { FX_BASE_CURRENCIES, FX_HISTORY_PERIODS, FX_QUOTE_CURRENCY } from '../config/fx.js';

const currencyCode = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z]{3}$/.test(v), 'Currency must be a 3-letter ISO code');

export const fxLatestQuerySchema = z.object({
  base: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return null;
      return v
        .split(',')
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
    })
    .refine(
      (arr) => !arr || arr.every((c) => FX_BASE_CURRENCIES.includes(c)),
      `base must be one of: ${FX_BASE_CURRENCIES.join(', ')}`
    ),
  rateType: z.enum(['official_reference', 'market_indicative']).optional(),
});

export const fxHistoryQuerySchema = z
  .object({
    base: currencyCode.default('USD'),
    quote: currencyCode.default(FX_QUOTE_CURRENCY),
    period: z.enum(['7d', '30d', '90d']).optional().default('30d'),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD')
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD')
      .optional(),
    rateType: z.enum(['official_reference', 'market_indicative']).optional(),
    sourceId: z.string().trim().min(2).max(64).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.quote !== FX_QUOTE_CURRENCY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Only ${FX_QUOTE_CURRENCY} quote currency is supported initially`,
        path: ['quote'],
      });
    }
    if (!FX_BASE_CURRENCIES.includes(val.base)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `base must be one of: ${FX_BASE_CURRENCIES.join(', ')}`,
        path: ['base'],
      });
    }
    if (val.from && val.to && val.from > val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from must be on or before to',
        path: ['from'],
      });
    }
    if (val.period && !FX_HISTORY_PERIODS[val.period]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid period',
        path: ['period'],
      });
    }
  });

export const fxPairParamSchema = z.object({
  base: currencyCode,
  quote: currencyCode,
});

export const fxSyncBodySchema = z
  .object({
    provider: z.string().trim().min(2).max(64).optional(),
    includeHistory: z.boolean().optional().default(true),
  })
  .default({ includeHistory: true });
