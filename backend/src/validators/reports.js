import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common.js';

export const REPORT_CATEGORY_CODES = [
  'traffic',
  'fuel',
  'transport',
  'prices',
  'road_conditions',
  'local_alerts',
  'directions',
  'other',
];

export const REPORT_STATUSES = [
  'submitted',
  'active',
  'confirmed',
  'stale',
  'expired',
  'flagged',
  'under_review',
  'removed',
];

export const SOURCE_TYPES = ['community', 'official', 'aggregated'];

export const CONFIRMATION_TYPES = ['still_accurate', 'no_longer_accurate', 'needs_correction'];

export const FLAG_REASONS = [
  'inaccurate',
  'duplicate',
  'inappropriate',
  'misleading',
  'spam',
  'unsafe',
  'other',
];

export const createReportSchema = z.object({
  category: z.enum(REPORT_CATEGORY_CODES),
  title: z
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters')
    .max(120, 'Title is too long'),
  description: z
    .string()
    .trim()
    .min(5, 'Please add a few more details')
    .max(4000, 'Description is too long'),
  locationId: uuidSchema,
  occurredAt: z.coerce.date().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  visibility: z.enum(['public', 'area', 'private']).optional().default('public'),
  metadata: z.record(z.unknown()).optional().default({}),
}).refine(
  (data) =>
    (data.latitude == null && data.longitude == null) ||
    (data.latitude != null && data.longitude != null),
  { message: 'Latitude and longitude must be provided together', path: ['latitude'] }
);

export const updateReportSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().min(5).max(4000).optional(),
    locationId: uuidSchema.optional(),
    occurredAt: z.coerce.date().optional(),
    latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
    longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
    visibility: z.enum(['public', 'area', 'private']).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listReportsQuerySchema = paginationSchema.extend({
  category: z.enum(REPORT_CATEGORY_CODES).optional(),
  locationId: uuidSchema.optional(),
  status: z.enum(REPORT_STATUSES).optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('any'),
  q: z.string().trim().min(2).max(100).optional(),
});

export const nearbyReportsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.1).max(50).default(10),
  category: z.enum(REPORT_CATEGORY_CODES).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const confirmReportSchema = z.object({
  type: z.enum(CONFIRMATION_TYPES).default('still_accurate'),
  note: z.string().trim().max(500).optional(),
});

export const correctReportSchema = z.object({
  type: z.enum(['no_longer_accurate', 'needs_correction']).default('no_longer_accurate'),
  note: z.string().trim().min(3).max(500),
});

export const flagReportSchema = z.object({
  reason: z.enum(FLAG_REASONS),
  details: z.string().trim().max(1000).optional(),
});

export const reportIdParamSchema = z.object({
  id: uuidSchema,
});
