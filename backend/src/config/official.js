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
  { id: 'education', label: 'Education' },
  { id: 'health', label: 'Health' },
  { id: 'agriculture', label: 'Agriculture' },
  { id: 'environment', label: 'Environment' },
  { id: 'regulation', label: 'Regulation' },
  { id: 'consumer_information', label: 'Consumer Information' },
  { id: 'other', label: 'Other' },
]);

/** Operational importance — criteria-based, not sensational. */
export const OFFICIAL_UPDATE_TYPES = Object.freeze([
  { id: 'announcement', label: 'Announcement' },
  { id: 'advisory', label: 'Advisory' },
  { id: 'alert', label: 'Alert' },
  { id: 'notice', label: 'Notice' },
  { id: 'policy_regulatory', label: 'Policy / Regulatory Update' },
  { id: 'service_update', label: 'Service Update' },
  { id: 'event', label: 'Event' },
  { id: 'closure', label: 'Closure' },
  { id: 'warning', label: 'Warning' },
  { id: 'public_information', label: 'Public Information' },
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
  'official_publication',
  'fixture',
  'manual_entry',
  'webhook',
]);

export const OFFICIAL_UPDATE_STATUSES = Object.freeze([
  'pending_review',
  'published',
  'archived',
  'withdrawn',
  'rejected',
]);

export const OFFICIAL_SOURCE_STATUSES = Object.freeze([
  'draft',
  'approved',
  'active',
  'disabled',
  'suspended',
]);

export const OFFICIAL_PRIORITIES = Object.freeze([
  {
    id: 'normal',
    label: 'Informational',
    criteria: 'General public-service information; no immediate action required.',
  },
  {
    id: 'important',
    label: 'Important',
    criteria: 'Affects travel, services, or planning for a defined area within days.',
  },
  {
    id: 'urgent',
    label: 'High Priority',
    criteria: 'Time-sensitive disruption or advisory requiring near-term attention.',
  },
  {
    id: 'critical',
    label: 'Critical',
    criteria: 'Immediate public-safety or emergency notice; rate-limit notifications tightly.',
  },
]);

export const OFFICIAL_SCOPE_ASSESSMENTS = Object.freeze([
  { id: 'in_scope', label: 'In scope' },
  { id: 'needs_review', label: 'Needs scope review' },
  { id: 'out_of_scope', label: 'Out of scope' },
]);

export function categoryLabel(id) {
  return OFFICIAL_CATEGORIES.find((c) => c.id === id)?.label || id;
}

export function isValidCategory(id) {
  return OFFICIAL_CATEGORIES.some((c) => c.id === id);
}

export function priorityLabel(id) {
  return OFFICIAL_PRIORITIES.find((p) => p.id === id)?.label || id;
}

export function isValidPriority(id) {
  return OFFICIAL_PRIORITIES.some((p) => p.id === id);
}

export function updateTypeLabel(id) {
  return OFFICIAL_UPDATE_TYPES.find((t) => t.id === id)?.label || id;
}

export function isValidUpdateType(id) {
  return OFFICIAL_UPDATE_TYPES.some((t) => t.id === id);
}

export function verificationLabel(id) {
  const map = {
    unverified: 'Pending',
    pending: 'Pending',
    verified: 'Verified',
    rejected: 'Suspended',
    suspended: 'Suspended',
    retired: 'Deprecated',
    deprecated: 'Deprecated',
  };
  return map[id] || id;
}
