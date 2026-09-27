import { z } from 'zod';
import { isWithinNigeriaBounds } from '../utils/geoBounds.js';

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

const nigeriaCoordRefine = (data, ctx) => {
  if (!isWithinNigeriaBounds(data.lat, data.lng)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Coordinates are outside the supported Nigeria coverage area.',
      path: ['lat'],
    });
  }
};

export const nearbyQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radiusKm: z.coerce.number().min(0.1).max(100).default(15),
    type: z
      .enum(['country', 'state', 'lga', 'city', 'area', 'road', 'landmark', 'place'])
      .optional()
      .default('area'),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    accuracy: z.coerce.number().min(0).max(100000).optional(),
  })
  .superRefine(nigeriaCoordRefine);

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
    accuracy: z.coerce.number().min(0).max(100000).optional(),
  })
  .refine((data) => data.locationId || data.areaId, {
    message: 'locationId or areaId is required',
  })
  .superRefine((data, ctx) => {
    const hasLat = data.privateLat != null;
    const hasLng = data.privateLng != null;
    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'privateLat and privateLng must be provided together.',
        path: ['privateLat'],
      });
      return;
    }
    if (hasLat && hasLng && !isWithinNigeriaBounds(data.privateLat, data.privateLng)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Private coordinates are outside the supported Nigeria coverage area.',
        path: ['privateLat'],
      });
    }
  });
