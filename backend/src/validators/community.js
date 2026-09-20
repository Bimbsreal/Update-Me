import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common.js';

export const COMMUNITY_CATEGORY_CODES = [
  'traffic',
  'fuel',
  'transport',
  'prices',
  'directions',
  'road_conditions',
  'local_services',
  'local_information',
  'other',
];

export const COMMUNITY_FLAG_REASON_CODES = [
  'spam',
  'misleading',
  'inappropriate',
  'inaccurate',
  'duplicate',
  'other',
];

export const createQuestionSchema = z
  .object({
    title: z.string().trim().min(5).max(160),
    description: z.string().trim().min(3).max(4000).optional().nullable(),
    category: z.enum(COMMUNITY_CATEGORY_CODES),
    locationId: uuidSchema,
    /** Optional relevance period end; must be in the future if set. */
    expiresAt: z.coerce.date().optional().nullable(),
    /** Convenience: hours until expiry (1–720). Ignored if expiresAt is set. */
    relevanceHours: z.coerce.number().int().min(1).max(720).optional().nullable(),
  })
  .refine(
    (data) => !data.expiresAt || data.expiresAt.getTime() > Date.now() + 60_000,
    { message: 'Expiry must be in the future.', path: ['expiresAt'] }
  );

export const listQuestionsQuerySchema = paginationSchema.extend({
  locationId: uuidSchema.optional(),
  category: z.enum(COMMUNITY_CATEGORY_CODES).optional(),
  status: z.enum(['open', 'answered', 'expired', 'flagged', 'any']).optional().default('any'),
  /** recent | unanswered | answered — no trending/popularity ranking */
  sort: z.enum(['recent', 'unanswered', 'answered']).optional().default('recent'),
  includeExpired: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1')
    .default(false),
  q: z.string().trim().min(1).max(120).optional(),
});

export const questionIdParamSchema = z.object({
  id: uuidSchema,
});

export const answerIdParamSchema = z.object({
  id: uuidSchema,
});

export const createAnswerSchema = z.object({
  content: z.string().trim().min(3).max(4000),
  locationId: uuidSchema.optional().nullable(),
});

export const updateAnswerSchema = z.object({
  content: z.string().trim().min(3).max(4000),
});

export const answerUsefulSchema = z.object({
  note: z.string().trim().min(3).max(500).optional(),
});

export const answerInaccurateSchema = z.object({
  type: z.enum(['no_longer_accurate', 'needs_correction']).default('no_longer_accurate'),
  note: z.string().trim().min(3).max(500).optional(),
});

export const questionFlagSchema = z.object({
  reason: z.enum(COMMUNITY_FLAG_REASON_CODES),
  details: z.string().trim().min(3).max(1000).optional(),
});
