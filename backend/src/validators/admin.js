import { z } from 'zod';
import { MODERATION_ACTIONS, MODERATION_REASONS, ADMIN_ROLES } from '../config/admin.js';

const uuid = z.string().uuid();

const reasonCodes = MODERATION_REASONS.map((r) => r.code);

export const moderationActionSchema = z
  .object({
    action: z.enum(MODERATION_ACTIONS.map((a) => a.code)),
    reason: z.string().trim().max(1000).optional(),
    reasonCode: z.enum(reasonCodes).optional(),
    relatedReportId: uuid.optional(),
    officialUpdateId: uuid.optional(),
    priority: z.enum(['priority', 'urgent']).optional(),
  })
  .superRefine((val, ctx) => {
    const text = String(val.reason || '').trim();
    if (!val.reasonCode && text.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide a reason code or a custom reason (min 3 characters).',
        path: ['reason'],
      });
    }
  });

export const moderationQueueQuerySchema = z.object({
  view: z
    .enum(['attention', 'pending', 'flagged', 'reviewed', 'removed', 'escalated'])
    .optional(),
  type: z.enum(['report', 'alert', 'question', 'answer']).optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['updated', 'created', 'flags']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const correctLocationSchema = z.object({
  locationId: uuid,
  reason: z.string().trim().min(3).max(1000),
});

export const queueIdParamSchema = z.object({
  id: z.string().min(3).max(80),
});

export const inviteAdminSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(ADMIN_ROLES.map((r) => r.code)),
  reason: z.string().trim().min(2).max(500).optional(),
});

export const acceptInviteSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(8).max(128),
});

export const entityIdParamSchema = z.object({
  id: uuid,
});

export const officialSourceIdParamSchema = z.object({
  id: z.string().trim().min(2).max(64),
});

export const suspendUserSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const restoreUserSchema = z.object({
  reason: z.string().trim().min(2).max(500).optional(),
});

export const setRoleSchema = z.object({
  role: z
    .union([z.enum(ADMIN_ROLES.map((r) => r.code)), z.null(), z.literal('')])
    .transform((v) => (v === '' ? null : v)),
  reason: z.string().trim().min(2).max(500).optional(),
});

export const setActiveSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().trim().min(2).max(500).optional(),
});

export const hideOfficialUpdateSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const reviewOfficialUpdateSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const correctOfficialUpdateMetadataSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  category: z.string().trim().min(2).max(40).optional(),
  jurisdictionLevel: z.string().trim().min(2).max(40).optional(),
  stateId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  areaLocationIds: z.array(z.string().uuid()).max(20).optional(),
  areaStateIds: z.array(z.string().uuid()).max(20).optional(),
});

export const createManualOfficialUpdateSchema = z.object({
  sourceId: z.string().trim().min(2).max(64),
  title: z.string().trim().min(3).max(300),
  summary: z.string().trim().max(2000).optional().nullable(),
  body: z.string().trim().max(20000).optional().nullable(),
  category: z.string().trim().min(2).max(40),
  jurisdictionLevel: z.string().trim().min(2).max(40).optional(),
  stateId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  areaLocationIds: z.array(z.string().uuid()).max(20).optional(),
  areaStateIds: z.array(z.string().uuid()).max(20).optional(),
  originalUrl: z.string().url().optional().nullable(),
  sourceUrl: z.string().url().optional().nullable(),
  externalId: z.string().trim().min(2).max(200).optional(),
  publishedAt: z.coerce.date().optional(),
  publishNow: z.boolean().optional().default(false),
  reason: z.string().trim().min(3).max(1000),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().max(200).optional(),
});
