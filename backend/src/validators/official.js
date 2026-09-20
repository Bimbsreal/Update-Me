import { z } from 'zod';
import {
  OFFICIAL_CATEGORIES,
  OFFICIAL_INGESTION_METHODS,
  OFFICIAL_JURISDICTION_LEVELS,
  OFFICIAL_SOURCE_STATUSES,
} from '../config/official.js';

const categoryEnum = z.enum(OFFICIAL_CATEGORIES.map((c) => c.id));
const jurisdictionEnum = z.enum(OFFICIAL_JURISDICTION_LEVELS);
const ingestionEnum = z.enum(OFFICIAL_INGESTION_METHODS);
const sourceStatusEnum = z.enum(OFFICIAL_SOURCE_STATUSES);
const verificationEnum = z.enum(['unverified', 'pending', 'verified', 'rejected']);
const agencyTypeEnum = z.enum([
  'federal',
  'state',
  'local',
  'parastatal',
  'regulator',
  'emergency',
  'other',
]);

export const officialListQuerySchema = z.object({
  category: categoryEnum.optional(),
  source: z.string().trim().min(2).max(64).optional(),
  jurisdiction: jurisdictionEnum.optional(),
  locationId: z.string().uuid().optional(),
  stateId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  freshnessHours: z.coerce.number().int().min(1).max(24 * 90).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const officialNearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(1).max(250).default(50),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: categoryEnum.optional(),
});

export const officialIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const officialSourceIdParamSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_]+$/, 'Source id must be lowercase letters, numbers, underscores'),
});

export const createOfficialSourceSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_]+$/, 'Source id must be lowercase letters, numbers, underscores'),
  organizationName: z.string().trim().min(2).max(200),
  shortName: z.string().trim().min(2).max(40).optional(),
  agencyType: agencyTypeEnum.default('other'),
  jurisdictionLevel: jurisdictionEnum.default('national'),
  stateId: z.string().uuid().optional().nullable(),
  officialWebsite: z.string().url().optional().nullable(),
  feedUrl: z.string().min(3).max(500).optional().nullable(),
  ingestionMethod: ingestionEnum,
  providerKey: z.string().trim().min(2).max(64),
  status: sourceStatusEnum.default('draft'),
  verificationStatus: verificationEnum.default('unverified'),
  syncIntervalMinutes: z.coerce.number().int().min(5).max(10080).default(360),
  config: z.record(z.any()).optional().default({}),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateOfficialSourceSchema = createOfficialSourceSchema
  .omit({ id: true })
  .partial();

export const officialSyncBodySchema = z
  .object({
    sourceId: z.string().trim().min(2).max(64).optional(),
  })
  .default({});

export const officialContextQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  stateId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
