import { z } from 'zod';
import { MODERATION_ACTIONS, ADMIN_ROLES } from '../config/admin.js';

const uuid = z.string().uuid();

export const moderationActionSchema = z.object({
  action: z.enum(MODERATION_ACTIONS.map((a) => a.code)),
  reason: z.string().trim().min(3).max(1000),
});

export const queueIdParamSchema = z.object({
  id: z.string().min(3).max(80),
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

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().max(200).optional(),
});
