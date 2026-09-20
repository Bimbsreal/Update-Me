import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common.js';
import { TRANSPORT_FARE_UNITS, TRANSPORT_MODES } from '../config/transport.js';

export const TRANSPORT_MODE_IDS = TRANSPORT_MODES.map((m) => m.id);
export const TRANSPORT_FARE_UNIT_IDS = TRANSPORT_FARE_UNITS.map((u) => u.id);

const modeEnum = z.enum(TRANSPORT_MODE_IDS);
const unitEnum = z.enum(TRANSPORT_FARE_UNIT_IDS);

const stopSchema = z.object({
  stopOrder: z.coerce.number().int().min(1).max(50),
  locationId: uuidSchema.optional(),
  label: z.string().trim().min(2).max(160).optional(),
}).refine((s) => Boolean(s.locationId || s.label), {
  message: 'Stop needs a location or label',
});

const newRouteSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  originLocationId: uuidSchema,
  destinationLocationId: uuidSchema,
  primaryMode: modeEnum.optional(),
  stops: z.array(stopSchema).max(20).optional(),
}).refine((r) => r.originLocationId !== r.destinationLocationId, {
  message: 'Origin and destination must be different',
  path: ['destinationLocationId'],
});

export const createTransportRouteSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    originLocationId: uuidSchema,
    destinationLocationId: uuidSchema,
    primaryMode: modeEnum.optional(),
    stops: z.array(stopSchema).max(20).optional(),
  })
  .refine((data) => data.originLocationId !== data.destinationLocationId, {
    message: 'Origin and destination must be different',
    path: ['destinationLocationId'],
  });

export const createTransportFareSchema = z
  .object({
    routeId: uuidSchema.optional(),
    newRoute: newRouteSchema.optional(),
    transportMode: modeEnum,
    originLocationId: uuidSchema.optional(),
    destinationLocationId: uuidSchema.optional(),
    fareAmount: z.coerce.number().positive().max(1_000_000),
    fareCurrency: z.string().trim().length(3).toUpperCase().optional().default('NGN'),
    fareUnit: unitEnum.optional().default('trip'),
    boardingPointLabel: z.string().trim().min(2).max(160).optional(),
    alightingPointLabel: z.string().trim().min(2).max(160).optional(),
    notes: z.string().trim().max(4000).optional(),
    title: z.string().trim().min(3).max(160).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.routeId && !data.newRoute) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a route or provide origin and destination',
        path: ['routeId'],
      });
    }
    if (data.fareCurrency && data.fareCurrency !== 'NGN') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only NGN fares are supported',
        path: ['fareCurrency'],
      });
    }
  });

export const listTransportRoutesQuerySchema = paginationSchema.extend({
  originLocationId: uuidSchema.optional(),
  destinationLocationId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  mode: modeEnum.optional(),
  q: z.string().trim().min(1).max(120).optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('any'),
});

export const listTransportFaresQuerySchema = paginationSchema.extend({
  routeId: uuidSchema.optional(),
  originLocationId: uuidSchema.optional(),
  destinationLocationId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  mode: modeEnum.optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('fresh'),
  sourceType: z.enum(['community', 'official', 'aggregated']).optional(),
});

export const searchTransportQuerySchema = z.object({
  originLocationId: uuidSchema,
  destinationLocationId: uuidSchema,
  mode: modeEnum.optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('fresh'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const transportIdParamSchema = z.object({
  id: uuidSchema,
});

export const transportConfirmSchema = z.object({
  type: z.enum(['still_accurate', 'no_longer_accurate', 'needs_correction']).default('still_accurate'),
  note: z.string().trim().max(500).optional(),
});

export const transportCorrectSchema = z.object({
  type: z.enum(['no_longer_accurate', 'needs_correction']).default('no_longer_accurate'),
  note: z.string().trim().min(3).max(500),
});

export const transportSummaryQuerySchema = z.object({
  locationId: uuidSchema.optional(),
});
