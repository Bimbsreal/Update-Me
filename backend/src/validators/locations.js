import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'Search query must be at least 2 characters')
    .max(100, 'Search query is too long'),
  type: z
    .enum(['country', 'state', 'lga', 'city', 'area', 'road', 'landmark', 'place'])
    .optional(),
  stateId: z.string().uuid().optional(),
  lgaId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

export const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.1).max(100).default(15),
  type: z
    .enum(['country', 'state', 'lga', 'city', 'area', 'road', 'landmark', 'place'])
    .optional()
    .default('area'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const uuidParamSchema = z.string().uuid('Invalid location id');

export const listStatesQuerySchema = z.object({
  country: z.string().trim().default('NG'),
});

export const listLgasQuerySchema = z.object({
  stateId: z.string().uuid('stateId must be a valid UUID'),
});

export const listAreasQuerySchema = z.object({
  lgaId: z.string().uuid('lgaId must be a valid UUID'),
});

export const setUserLocationSchema = z
  .object({
    locationId: z.string().uuid().optional(),
    areaId: z.string().uuid().optional(),
    privateLat: z.coerce.number().min(-90).max(90).optional(),
    privateLng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((data) => data.locationId || data.areaId, {
    message: 'locationId or areaId is required',
  });
