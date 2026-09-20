import { z } from 'zod';
import { paginationSchema, uuidSchema } from './common.js';
import {
  FUEL_AVAILABILITY,
  FUEL_PRICE_UNITS,
  FUEL_PRODUCT_TYPES,
  FUEL_QUEUE_CONDITIONS,
} from '../config/fuel.js';

export const FUEL_TYPE_IDS = FUEL_PRODUCT_TYPES.map((t) => t.id);
export const FUEL_AVAILABILITY_IDS = FUEL_AVAILABILITY.map((a) => a.id);
export const FUEL_QUEUE_IDS = FUEL_QUEUE_CONDITIONS.map((q) => q.id);

const fuelTypeEnum = z.enum(FUEL_TYPE_IDS);
const availabilityEnum = z.enum(FUEL_AVAILABILITY_IDS);
const queueEnum = z.enum(FUEL_QUEUE_IDS);
const unitEnum = z.enum(FUEL_PRICE_UNITS);

const newStationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  brand: z.string().trim().min(1).max(80).optional(),
  locationId: uuidSchema.optional(),
  address: z.string().trim().min(2).max(240).optional(),
  landmarkLabel: z.string().trim().min(2).max(160).optional(),
  roadName: z.string().trim().min(2).max(160).optional(),
});

export const createFuelStationSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    brand: z.string().trim().min(1).max(80).optional(),
    locationId: uuidSchema,
    address: z.string().trim().min(2).max(240).optional(),
    landmarkLabel: z.string().trim().min(2).max(160).optional(),
    roadName: z.string().trim().min(2).max(160).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine(
    (data) =>
      (data.latitude == null && data.longitude == null) ||
      (data.latitude != null && data.longitude != null),
    { message: 'Latitude and longitude must be provided together', path: ['latitude'] }
  );

export const createFuelReportSchema = z
  .object({
    stationId: uuidSchema.optional(),
    newStation: newStationSchema.optional(),
    locationId: uuidSchema.optional(),
    fuelType: fuelTypeEnum,
    availability: availabilityEnum,
    priceAmount: z.coerce.number().positive().max(1_000_000).optional().nullable(),
    priceUnit: unitEnum.optional(),
    queueCondition: queueEnum.optional().nullable(),
    notes: z.string().trim().max(4000).optional(),
    title: z.string().trim().min(3).max(160).optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.stationId && !data.newStation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a station or provide a new station',
        path: ['stationId'],
      });
    }
    if (data.newStation && !data.newStation.locationId && !data.locationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Location is required when creating a new station',
        path: ['locationId'],
      });
    }
    if (
      (data.availability === 'available' || data.availability === 'limited') &&
      (data.priceAmount == null || !(data.priceAmount > 0))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter the observed price when fuel is available or limited',
        path: ['priceAmount'],
      });
    }
    if (
      (data.latitude == null && data.longitude != null) ||
      (data.latitude != null && data.longitude == null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Latitude and longitude must be provided together',
        path: ['latitude'],
      });
    }
  });

export const listFuelStationsQuerySchema = paginationSchema.extend({
  locationId: uuidSchema.optional(),
  q: z.string().trim().min(1).max(120).optional(),
  fuelType: fuelTypeEnum.optional(),
  availability: availabilityEnum.optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('any'),
});

export const listFuelReportsQuerySchema = paginationSchema.extend({
  stationId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  fuelType: fuelTypeEnum.optional(),
  availability: availabilityEnum.optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('fresh'),
  sourceType: z.enum(['community', 'official', 'aggregated']).optional(),
});

export const nearbyFuelQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.1).max(50).default(10),
  fuelType: fuelTypeEnum.optional(),
  availability: availabilityEnum.optional(),
  freshness: z.enum(['fresh', 'stale', 'expired', 'any']).optional().default('fresh'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const fuelIdParamSchema = z.object({
  id: uuidSchema,
});

export const fuelConfirmSchema = z.object({
  type: z.enum(['still_accurate', 'no_longer_accurate', 'needs_correction']).default('still_accurate'),
  note: z.string().trim().max(500).optional(),
});

export const fuelCorrectSchema = z.object({
  type: z.enum(['no_longer_accurate', 'needs_correction']).default('no_longer_accurate'),
  note: z.string().trim().min(3).max(500),
});

export const fuelSummaryQuerySchema = z.object({
  locationId: uuidSchema.optional(),
});
