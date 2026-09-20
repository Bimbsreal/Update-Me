export const COMMUNITY_CATEGORIES = [
  { value: 'traffic', label: 'Traffic' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'transport', label: 'Transport' },
  { value: 'prices', label: 'Prices' },
  { value: 'directions', label: 'Directions' },
  { value: 'road_conditions', label: 'Road Conditions' },
  { value: 'local_services', label: 'Local Services' },
  { value: 'local_information', label: 'Local Information' },
  { value: 'other', label: 'Other' },
];

export const COMMUNITY_FLAG_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'misleading', label: 'Misleading' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'inaccurate', label: 'Inaccurate' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'other', label: 'Other' },
];

export const COMMUNITY_RELEVANCE_OPTIONS = [
  { value: '', label: 'Default for category' },
  { value: '6', label: '6 hours' },
  { value: '12', label: '12 hours' },
  { value: '24', label: '24 hours' },
  { value: '48', label: '2 days' },
  { value: '168', label: '7 days' },
];

export function communityCategoryLabel(code) {
  return COMMUNITY_CATEGORIES.find((item) => item.value === code)?.label || code;
}
