import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common.js';

export const NOTIFICATION_CATEGORY_CODES = [
  'traffic',
  'road_alerts',
  'fuel',
  'transport',
  'prices',
  'fx',
  'official',
  'community',
  'system',
];

export const SAVED_PLACE_KIND_CODES = ['home', 'work', 'school', 'other'];
export const SAVED_ROUTE_MODE_CODES = ['driving', 'public_transport', 'walking', 'any'];
export const USER_ALERT_KIND_CODES = [
  'traffic_area',
  'traffic_road',
  'fuel_price',
  'commodity_price',
  'fx_rate',
  'official_category',
  'official_source',
];
export const FREQUENCY_CODES = ['immediate', 'digest', 'daily_summary', 'off'];
export const CHANNEL_CODES = ['in_app', 'push', 'email'];

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
        enabled: z.boolean().optional(),
        frequency: z.enum(FREQUENCY_CODES).optional(),
        channels: z.array(z.enum(CHANNEL_CODES)).min(1).max(3).optional(),
        quietHoursEnabled: z.boolean().optional(),
        quietStartMinute: z.number().int().min(0).max(1439).optional().nullable(),
        quietEndMinute: z.number().int().min(0).max(1439).optional().nullable(),
        timezone: z.string().trim().min(2).max(64).optional(),
        criticalOverridesQuiet: z.boolean().optional(),
      })
    )
    .min(1)
    .max(20),
});

export const createUserAlertSchema = z.object({
  kind: z.enum(USER_ALERT_KIND_CODES),
  locationId: uuidSchema.optional().nullable(),
  stateId: uuidSchema.optional().nullable(),
  roadName: z.string().trim().min(2).max(120).optional().nullable(),
  sourceId: z.string().trim().min(2).max(64).optional().nullable(),
  officialCategory: z.string().trim().min(2).max(64).optional().nullable(),
  commodityCode: z.string().trim().min(2).max(64).optional().nullable(),
  commodityVariant: z.string().trim().min(1).max(64).optional().nullable(),
  fuelType: z.string().trim().min(2).max(32).optional().nullable(),
  fxBase: z.string().trim().min(3).max(8).optional().nullable(),
  fxQuote: z.string().trim().min(3).max(8).optional().nullable(),
  thresholdValue: z.number().finite().optional().nullable(),
  thresholdDirection: z.enum(['above', 'below', 'crosses', 'any_change']).optional(),
  frequency: z.enum(FREQUENCY_CODES).optional(),
  cooldownMinutes: z.number().int().min(0).max(10080).optional(),
});

export const updateUserAlertSchema = z
  .object({
    enabled: z.boolean().optional(),
    thresholdValue: z.number().finite().optional().nullable(),
    thresholdDirection: z.enum(['above', 'below', 'crosses', 'any_change']).optional(),
    frequency: z.enum(FREQUENCY_CODES).optional(),
    cooldownMinutes: z.number().int().min(0).max(10080).optional(),
    roadName: z.string().trim().min(2).max(120).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No changes provided.' });

export const userAlertIdParamSchema = z.object({
  id: uuidSchema,
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(8).max(255),
    auth: z.string().min(8).max(255),
  }),
  deviceLabel: z.string().trim().min(1).max(80).optional().nullable(),
});

export const pushUnsubscribeSchema = z
  .object({
    endpoint: z.string().url().max(2048).optional(),
    id: uuidSchema.optional(),
  })
  .refine((d) => d.endpoint || d.id, { message: 'endpoint or id required' });

export const adminAlertRulePatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
  priority: z.enum(['low', 'normal', 'important', 'urgent', 'critical']).optional(),
  cooldownMinutes: z.number().int().min(0).max(10080).optional(),
  ttlHours: z.number().int().min(1).max(720).optional(),
  minSeverity: z.string().trim().max(40).optional().nullable(),
  eligibleChannels: z.array(z.enum(CHANNEL_CODES)).min(1).max(3).optional(),
  conditions: z.record(z.any()).optional(),
  templateKey: z.string().trim().max(64).optional().nullable(),
  reason: z.string().trim().min(3).max(500),
});

export const adminEmergencyAlertSchema = z.object({
  title: z.string().trim().min(5).max(200),
  message: z.string().trim().min(10).max(2000),
  reason: z.string().trim().min(8).max(500),
  confirm: z.literal(true),
  locationId: uuidSchema.optional().nullable(),
  stateId: uuidSchema.optional().nullable(),
  scope: z.enum(['saved_places_only']).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});
