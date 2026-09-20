/**
 * Official Updates configuration — controlled taxonomies.
 */

export const OFFICIAL_CATEGORIES = Object.freeze([
  { id: 'road_traffic', label: 'Road & Traffic' },
  { id: 'fuel_petroleum', label: 'Fuel & Petroleum' },
  { id: 'financial_economic', label: 'Financial & Economic' },
  { id: 'public_safety', label: 'Public Safety' },
  { id: 'transport', label: 'Transport' },
  { id: 'public_services', label: 'Public Services' },
  { id: 'weather_emergency', label: 'Weather / Emergency' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'other', label: 'Other' },
]);

export const OFFICIAL_JURISDICTION_LEVELS = Object.freeze([
  'national',
  'state',
  'lga',
  'city',
  'area',
  'location_specific',
]);

export const OFFICIAL_INGESTION_METHODS = Object.freeze([
  'api',
  'rss',
  'atom',
  'structured_feed',
  'web_publication',
  'fixture',
]);

export const OFFICIAL_SOURCE_STATUSES = Object.freeze([
  'draft',
  'approved',
  'active',
  'disabled',
  'suspended',
]);

export function categoryLabel(id) {
  return OFFICIAL_CATEGORIES.find((c) => c.id === id)?.label || id;
}

export function isValidCategory(id) {
  return OFFICIAL_CATEGORIES.some((c) => c.id === id);
}
