import { z } from 'zod';

const freshnessEnum = z.enum(['30m', '2h', 'today', 'recent', 'any', 'all']);
const categoryEnum = z.enum([
  'all',
  'traffic',
  'fuel',
  'transport',
  'prices',
  'road_conditions',
  'local_alerts',
  'directions',
  'official',
  'community',
]);

export const exploreQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(0.5).max(50).default(12),
    bbox: z
      .string()
      .trim()
      .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'bbox must be west,south,east,north')
      .optional(),
    locationId: z.string().uuid().optional(),
    stateId: z.string().uuid().optional(),
    lgaId: z.string().uuid().optional(),
    areaId: z.string().uuid().optional(),
    category: categoryEnum.default('all'),
    status: z.string().trim().max(40).optional(),
    freshness: freshnessEnum.default('recent'),
    q: z.string().trim().max(120).optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(80).default(40),
  })
  .superRefine((data, ctx) => {
    if ((data.lat == null) !== (data.lng == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide both lat and lng, or neither.',
        path: ['lat'],
      });
    }
  });

export const exploreSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(25).default(12),
});
