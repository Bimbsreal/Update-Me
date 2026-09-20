import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common.js';

export const TRAFFIC_SEVERITIES = [
  'clear',
  'light',
  'moderate',
  'heavy',
  'standstill',
  'blocked',
  'unknown',
];

export const TRAFFIC_CAUSES = [
  'accident',
  'roadworks',
  'flooding',
  'vehicle_breakdown',
  'security_incident',
  'event',
  'construction',
  'lane_closure',
  'unknown',
  'other',
];

export const createTrafficSchema = z
  .object({
    locationId: uuidSchema,
    severity: z.enum(TRAFFIC_SEVERITIES),
    cause: z.enum(TRAFFIC_CAUSES).optional().nullable(),
    roadName: z.string().trim().min(2).max(160).optional(),
    roadId: uuidSchema.optional().nullable(),
    directionLabel: z.string().trim().min(2).max(160).optional(),
    fromLabel: z.string().trim().min(1).max(120).optional(),
    towardLabel: z.string().trim().min(1).max(120).optional(),
    fromLocationId: uuidSchema.optional().nullable(),
    towardLocationId: uuidSchema.optional().nullable(),
    affectedSection: z.string().trim().min(2).max(240).optional(),
    estimatedDelayMinutes: z.coerce.number().int().min(0).max(720).optional().nullable(),
    notes: z.string().trim().max(4000).optional(),
    title: z.string().trim().min(3).max(120).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine(
    (data) =>
      (data.latitude == null && data.longitude == null) ||
      (data.latitude != null && data.longitude != null),
    { message: 'Latitude and longitude must be provided together', path: ['latitude'] }
  )
  .refine(
    (data) => Boolean(data.roadName || data.directionLabel || data.fromLabel || data.towardLabel || data.notes),
    {
      message: 'Add a road, direction, or short note so others can use this update.',
      path: ['roadName'],
    }
  );

export const listTrafficQuerySchema = paginationSchema.extend({
  locationId: uuidSchema.optional(),
  road: z.string().trim().min(1).max(160).optional(),
  severity: z.enum(TRAFFIC_SEVERITIES).optional(),
  direction: z.string().trim().min(1).max(160).optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('fresh'),
  sourceType: z.enum(['community', 'official', 'aggregated']).optional(),
});

export const nearbyTrafficQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.1).max(50).default(10),
  severity: z.enum(TRAFFIC_SEVERITIES).optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('fresh'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const trafficIdParamSchema = z.object({
  id: uuidSchema,
});

export const trafficConfirmSchema = z.object({
  type: z.enum(['still_accurate', 'no_longer_accurate', 'needs_correction']).default('still_accurate'),
  note: z.string().trim().max(500).optional(),
});

export const trafficCorrectSchema = z.object({
  type: z.enum(['no_longer_accurate', 'needs_correction']).default('no_longer_accurate'),
  note: z.string().trim().min(3).max(500),
});

export const trafficSummaryQuerySchema = z.object({
  locationId: uuidSchema.optional(),
  radiusKm: z.coerce.number().min(0.1).max(50).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});
