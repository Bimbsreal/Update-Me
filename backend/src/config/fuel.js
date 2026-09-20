/**
 * Fuel module configuration — controlled taxonomies (not UI-hardcoded).
 */

export const FUEL_PRODUCT_TYPES = Object.freeze([
  { id: 'pms', label: 'PMS / Petrol', shortLabel: 'Petrol', defaultUnit: 'litre' },
  { id: 'ago', label: 'AGO / Diesel', shortLabel: 'Diesel', defaultUnit: 'litre' },
  { id: 'lpg', label: 'LPG / Cooking Gas', shortLabel: 'LPG', defaultUnit: 'kg' },
]);

export const FUEL_AVAILABILITY = Object.freeze([
  { id: 'available', label: 'Available' },
  { id: 'limited', label: 'Limited' },
  { id: 'unavailable', label: 'Unavailable' },
  { id: 'unknown', label: 'Unknown' },
]);

export const FUEL_QUEUE_CONDITIONS = Object.freeze([
  { id: 'none', label: 'No queue' },
  { id: 'short', label: 'Short queue' },
  { id: 'moderate', label: 'Moderate queue' },
  { id: 'long', label: 'Long queue' },
  { id: 'unknown', label: 'Unknown' },
]);

export const FUEL_PRICE_UNITS = Object.freeze(['litre', 'kg', 'cylinder']);

export function fuelTypeMeta(id) {
  return FUEL_PRODUCT_TYPES.find((t) => t.id === id) || null;
}

export function fuelTypeLabel(id) {
  return fuelTypeMeta(id)?.shortLabel || id;
}

export function availabilityLabel(id) {
  return FUEL_AVAILABILITY.find((a) => a.id === id)?.label || id;
}

export function queueLabel(id) {
  if (!id) return null;
  return FUEL_QUEUE_CONDITIONS.find((q) => q.id === id)?.label || id;
}

export function defaultUnitForFuelType(fuelType) {
  return fuelTypeMeta(fuelType)?.defaultUnit || 'litre';
}
