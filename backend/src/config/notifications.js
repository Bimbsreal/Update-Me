/** Notification categories, priorities, and quiet defaults. */

export const NOTIFICATION_CATEGORIES = [
  { code: 'traffic', label: 'Traffic', defaultEnabled: true },
  { code: 'road_alerts', label: 'Road Alerts', defaultEnabled: true },
  { code: 'fuel', label: 'Fuel', defaultEnabled: false },
  { code: 'transport', label: 'Transport', defaultEnabled: false },
  { code: 'prices', label: 'Commodity Prices', defaultEnabled: false },
  { code: 'official', label: 'Official Updates', defaultEnabled: true },
  { code: 'community', label: 'Community Questions', defaultEnabled: false },
];

export const NOTIFICATION_PRIORITIES = [
  { code: 'normal', label: 'Normal' },
  { code: 'important', label: 'Important' },
  { code: 'urgent', label: 'Urgent' },
];

export const SAVED_PLACE_KINDS = [
  { code: 'home', label: 'Home' },
  { code: 'work', label: 'Work' },
  { code: 'school', label: 'School' },
  { code: 'other', label: 'Other' },
];

export const SAVED_ROUTE_MODES = [
  { code: 'any', label: 'Any' },
  { code: 'driving', label: 'Driving' },
  { code: 'public_transport', label: 'Public Transport' },
  { code: 'walking', label: 'Walking' },
];

/** Traffic severities meaningful enough to notify. */
export const NOTIFY_TRAFFIC_SEVERITIES = new Set(['heavy', 'standstill', 'blocked']);

/** Alert severities meaningful enough to notify. */
export const NOTIFY_ALERT_SEVERITIES = new Set(['caution', 'urgent', 'critical']);

export const DEFAULT_NOTIFICATION_TTL_HOURS = {
  traffic: 12,
  road_alerts: 24,
  fuel: 24,
  transport: 48,
  prices: 72,
  official: 168,
  community: 48,
};

export function categoryLabel(code) {
  return NOTIFICATION_CATEGORIES.find((c) => c.code === code)?.label || code;
}

export function placeKindLabel(code) {
  return SAVED_PLACE_KINDS.find((c) => c.code === code)?.label || code;
}
