/**
 * Location & Address Intelligence — controlled vocabularies.
 * Nigeria is the primary country context; do not hard-code Lagos.
 */

export const LOCATION_TYPES = [
  'country',
  'state',
  'lga',
  'city',
  'area',
  'road',
  'landmark',
  'place',
];

export const LOCATION_PLACE_KINDS = [
  'landmark',
  'road',
  'junction',
  'bus_stop',
  'market',
  'fuel_station',
  'government_facility',
  'hospital',
  'school',
  'estate',
  'transport_hub',
  'public_place',
  'other',
];

export const LOCATION_VERIFICATION_STATUSES = [
  'unverified',
  'pending',
  'verified',
  'deprecated',
];

export const LOCATION_CONFIDENCE_LEVELS = ['low', 'medium', 'high'];

export const LOCATION_RESOLVE_STATUSES = [
  'open',
  'mapped',
  'aliased',
  'rejected',
  'ignored',
];

export function normalizeLocationQuery(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .replace(/\b(phase|ph)\s*(\d+)\b/g, 'phase $2')
    .replace(/\b(st|str|street)\b/g, 'street')
    .replace(/\b(rd|road)\b/g, 'road')
    .replace(/\b(ave|avenue)\b/g, 'avenue')
    .replace(/\b(blvd|boulevard)\b/g, 'boulevard')
    .replace(/\b(vi)\b/g, 'victoria island')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAddressText(input) {
  if (!input) return null;
  const n = normalizeLocationQuery(input);
  return n.length >= 2 ? n.slice(0, 500) : null;
}

export function disambiguationLabel({ name, area, lga, state, type } = {}) {
  const parts = [
    area || null,
    lga || null,
    state || null,
  ].filter(Boolean);
  const context = parts.length ? parts.join(' · ') : type || null;
  return context ? `${name} — ${context}` : name || 'Unknown place';
}
