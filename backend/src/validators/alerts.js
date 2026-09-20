import { z } from 'zod';
import { FLAG_REASONS } from './reports.js';
import { paginationSchema, uuidSchema } from './common.js';

export const ALERT_CATEGORY_CODES = [
  'road_incident',
  'flooding',
  'fire',
  'accident',
  'security_incident',
  'road_blockage',
  'dangerous_road_condition',
  'public_safety_advisory',
  'other',
];

export const ALERT_SEVERITY_CODES = ['informational', 'caution', 'urgent', 'critical'];

export const createAlertSchema = z
  .object({
    locationId: uuidSchema,
    alertCategory: z.enum(ALERT_CATEGORY_CODES),
    severity: z.enum(ALERT_SEVERITY_CODES),
    title: z.string().trim().min(3).max(120).optional(),
    whatHappened: z.string().trim().min(3).max(4000),
    notes: z.string().trim().max(4000).optional(),
    roadName: z.string().trim().min(2).max(160).optional(),
    roadId: uuidSchema.optional().nullable(),
    affectedArea: z.string().trim().min(2).max(240).optional(),
    landmarkLabel: z.string().trim().min(2).max(160).optional(),
    cause: z.string().trim().min(2).max(160).optional(),
    relatedTrafficReportId: uuidSchema.optional().nullable(),
    observedAt: z.coerce.date().optional(),
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
    (data) => !data.observedAt || data.observedAt.getTime() <= Date.now() + 60_000,
    { message: 'Observation time cannot be in the future.', path: ['observedAt'] }
  );

export const listAlertsQuerySchema = paginationSchema.extend({
  locationId: uuidSchema.optional(),
  category: z.enum(ALERT_CATEGORY_CODES).optional(),
  severity: z.enum(ALERT_SEVERITY_CODES).optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('fresh'),
  sourceType: z.enum(['community', 'official', 'aggregated']).optional(),
  q: z.string().trim().min(1).max(120).optional(),
});

export const nearbyAlertsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.1).max(50).default(10),
  category: z.enum(ALERT_CATEGORY_CODES).optional(),
  severity: z.enum(ALERT_SEVERITY_CODES).optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('fresh'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const alertIdParamSchema = z.object({
  id: uuidSchema,
});

export const alertConfirmSchema = z.object({
  type: z
    .enum(['still_accurate', 'no_longer_accurate', 'needs_correction', 'still_happening', 'no_longer_happening'])
    .default('still_happening'),
  note: z.string().trim().max(500).optional(),
});

export const alertCorrectSchema = z.object({
  type: z.enum(['no_longer_accurate', 'needs_correction', 'no_longer_happening']).default('no_longer_happening'),
  note: z.string().trim().min(3).max(500),
});

export const alertFlagSchema = z.object({
  reason: z.enum(FLAG_REASONS),
  details: z.string().trim().max(1000).optional(),
});
