import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common.js';

export const DIRECTION_MODES = ['driving', 'public_transport', 'walking'];

export const searchDirectionsQuerySchema = z
  .object({
    originLocationId: uuidSchema,
    destinationLocationId: uuidSchema,
    mode: z.enum(DIRECTION_MODES).default('driving'),
  })
  .refine((data) => data.originLocationId !== data.destinationLocationId, {
    message: 'Origin and destination must be different locations.',
    path: ['destinationLocationId'],
  });

export const directionsIdParamSchema = z.object({
  id: z.string().trim().min(8).max(200),
});

export const listLocalKnowledgeQuerySchema = paginationSchema.extend({
  originLocationId: uuidSchema.optional(),
  destinationLocationId: uuidSchema.optional(),
  mode: z.enum(DIRECTION_MODES).optional(),
  locationId: uuidSchema.optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('fresh'),
  q: z.string().trim().min(1).max(160).optional(),
});

export const createLocalKnowledgeSchema = z
  .object({
    originLocationId: uuidSchema,
    destinationLocationId: uuidSchema,
    travelMode: z.enum(DIRECTION_MODES).optional().nullable(),
    transportRouteId: uuidSchema.optional().nullable(),
    instructionSummary: z.string().trim().min(3).max(4000),
    majorRoads: z.string().trim().min(2).max(400).optional(),
    landmarks: z.string().trim().min(2).max(400).optional(),
    boardingHint: z.string().trim().min(2).max(240).optional(),
    notes: z.string().trim().max(2000).optional(),
    title: z.string().trim().min(3).max(120).optional(),
  })
  .refine((data) => data.originLocationId !== data.destinationLocationId, {
    message: 'Origin and destination must be different locations.',
    path: ['destinationLocationId'],
  });

export const localKnowledgeIdParamSchema = z.object({
  id: uuidSchema,
});

export const localKnowledgeConfirmSchema = z.object({
  type: z.enum(['still_accurate', 'no_longer_accurate', 'needs_correction']).default('still_accurate'),
  note: z.string().trim().max(500).optional(),
});

export const localKnowledgeCorrectSchema = z.object({
  type: z.enum(['no_longer_accurate', 'needs_correction']).default('no_longer_accurate'),
  note: z.string().trim().min(3).max(500),
});
