import { z } from 'zod';

export const searchCategoryEnum = z.enum([
  'all',
  'places',
  'fuel',
  'transport',
  'prices',
  'traffic',
  'alerts',
  'official',
  'community',
]);

export const searchFreshnessEnum = z.enum(['30m', '2h', 'today', 'recent', 'any']);

export const globalSearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(120),
    category: searchCategoryEnum.default('all'),
    locationId: z.string().uuid().optional(),
    stateId: z.string().uuid().optional(),
    lgaId: z.string().uuid().optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(0.5).max(50).default(12),
    freshness: searchFreshnessEnum.default('recent'),
    source: z.enum(['all', 'official', 'community']).default('all'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(40).default(20),
    mode: z.enum(['full', 'suggest']).default('full'),
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

export const searchSuggestQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  locationId: z.string().uuid().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(12),
});
