/** Controlled Community Q&A taxonomy — utility categories only. */

export const COMMUNITY_QUESTION_CATEGORIES = [
  { code: 'traffic', label: 'Traffic', defaultTtlHours: 6, sortOrder: 10 },
  { code: 'fuel', label: 'Fuel', defaultTtlHours: 12, sortOrder: 20 },
  { code: 'transport', label: 'Transport', defaultTtlHours: 48, sortOrder: 30 },
  { code: 'prices', label: 'Prices', defaultTtlHours: 72, sortOrder: 40 },
  { code: 'directions', label: 'Directions', defaultTtlHours: 168, sortOrder: 50 },
  { code: 'road_conditions', label: 'Road Conditions', defaultTtlHours: 24, sortOrder: 60 },
  { code: 'local_services', label: 'Local Services', defaultTtlHours: 168, sortOrder: 70 },
  { code: 'local_information', label: 'Local Information', defaultTtlHours: 168, sortOrder: 80 },
  { code: 'other', label: 'Other', defaultTtlHours: 48, sortOrder: 90 },
];

/** Answers need this many "useful" marks before showing Community Confirmed. */
export const COMMUNITY_CONFIRMED_USEFUL_THRESHOLD = 2;

export const COMMUNITY_FLAG_REASONS = [
  { code: 'spam', label: 'Spam' },
  { code: 'misleading', label: 'Misleading' },
  { code: 'inappropriate', label: 'Inappropriate' },
  { code: 'inaccurate', label: 'Inaccurate' },
  { code: 'duplicate', label: 'Duplicate' },
  { code: 'other', label: 'Other' },
];

export function communityCategoryLabel(code) {
  return (
    COMMUNITY_QUESTION_CATEGORIES.find((item) => item.code === code)?.label ||
    String(code || '').replace(/_/g, ' ')
  );
}

export function communityCategoryTtlHours(code) {
  return (
    COMMUNITY_QUESTION_CATEGORIES.find((item) => item.code === code)?.defaultTtlHours || 48
  );
}

export function communityFlagReasonLabel(code) {
  return COMMUNITY_FLAG_REASONS.find((item) => item.code === code)?.label || code;
}
