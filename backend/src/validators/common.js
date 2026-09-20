import { z } from 'zod';

/** Shared Zod primitives for upcoming request validation */

export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const geoPointSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const reportCategorySchema = z.enum([
  'traffic',
  'fuel',
  'transport',
  'prices',
  'road_conditions',
  'local_alerts',
  'directions',
  'other',
]);
