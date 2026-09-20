import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common.js';

export const NOTIFICATION_CATEGORY_CODES = [
  'traffic',
  'road_alerts',
  'fuel',
  'transport',
  'prices',
  'official',
  'community',
];

export const SAVED_PLACE_KIND_CODES = ['home', 'work', 'school', 'other'];
export const SAVED_ROUTE_MODE_CODES = ['driving', 'public_transport', 'walking', 'any'];

export const listNotificationsQuerySchema = paginationSchema.extend({
  status: z.enum(['all', 'unread', 'read']).optional().default('all'),
  category: z.enum(NOTIFICATION_CATEGORY_CODES).optional(),
  includeExpired: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1')
    .default(false),
});

export const notificationIdParamSchema = z.object({
  id: uuidSchema,
});

export const createSavedAreaSchema = z.object({
  locationId: uuidSchema,
  placeKind: z.enum(SAVED_PLACE_KIND_CODES).default('other'),
  customName: z.string().trim().min(1).max(80).optional().nullable(),
  notifyEnabled: z.boolean().optional().default(true),
});

export const updateSavedAreaSchema = z
  .object({
    placeKind: z.enum(SAVED_PLACE_KIND_CODES).optional(),
    customName: z.string().trim().min(1).max(80).optional().nullable(),
    notifyEnabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes provided.' });

export const savedAreaIdParamSchema = z.object({
  id: uuidSchema,
});

export const createSavedRouteSchema = z
  .object({
    originLocationId: uuidSchema,
    destinationLocationId: uuidSchema,
    customName: z.string().trim().min(1).max(80).optional().nullable(),
    travelMode: z.enum(SAVED_ROUTE_MODE_CODES).default('any'),
    transportRouteId: uuidSchema.optional().nullable(),
    notifyEnabled: z.boolean().optional().default(true),
  })
  .refine((data) => data.originLocationId !== data.destinationLocationId, {
    message: 'Origin and destination must be different.',
    path: ['destinationLocationId'],
  });

export const updateSavedRouteSchema = z
  .object({
    customName: z.string().trim().min(1).max(80).optional().nullable(),
    travelMode: z.enum(SAVED_ROUTE_MODE_CODES).optional(),
    transportRouteId: uuidSchema.optional().nullable(),
    notifyEnabled: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes provided.' });

export const savedRouteIdParamSchema = z.object({
  id: uuidSchema,
});

export const updatePreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        category: z.enum(NOTIFICATION_CATEGORY_CODES),
        enabled: z.boolean(),
      })
    )
    .min(1)
    .max(20),
});
