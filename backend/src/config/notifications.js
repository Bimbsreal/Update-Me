/** Notification categories, priorities, frequencies, and quiet defaults. */

export const NOTIFICATION_CATEGORIES = [
  { code: 'traffic', label: 'Traffic', defaultEnabled: true },
  { code: 'road_alerts', label: 'Road Alerts', defaultEnabled: true },
  { code: 'fuel', label: 'Fuel', defaultEnabled: false },
  { code: 'transport', label: 'Transport', defaultEnabled: false },
  { code: 'prices', label: 'Commodity Prices', defaultEnabled: false },
  { code: 'fx', label: 'Foreign Exchange', defaultEnabled: false },
  { code: 'official', label: 'Official Updates', defaultEnabled: true },
  { code: 'community', label: 'Community Questions', defaultEnabled: false },
  { code: 'system', label: 'System / Emergency', defaultEnabled: true },
];

export const NOTIFICATION_TYPES = Object.freeze([
  { code: 'traffic.significant', label: 'Traffic Alert', category: 'traffic' },
  { code: 'traffic.closure', label: 'Road Closure', category: 'traffic' },
  { code: 'road.hazard', label: 'Road Hazard', category: 'road_alerts' },
  { code: 'fuel.price', label: 'Fuel Price Alert', category: 'fuel' },
  { code: 'commodity.price', label: 'Commodity Price Alert', category: 'prices' },
  { code: 'fx.rate', label: 'FX Alert', category: 'fx' },
  { code: 'official.advisory', label: 'Official Update', category: 'official' },
  { code: 'system.emergency', label: 'Emergency / Public Advisory', category: 'system' },
  { code: 'system.notice', label: 'System Notification', category: 'system' },
]);

/** Low → Critical — Critical reserved for genuine emergencies / blocked roads / critical official. */
export const NOTIFICATION_PRIORITIES = [
  { code: 'low', label: 'Low' },
  { code: 'normal', label: 'Normal' },
  { code: 'important', label: 'High' },
  { code: 'urgent', label: 'High' },
  { code: 'critical', label: 'Critical' },
];

export const NOTIFICATION_FREQUENCIES = [
  { code: 'immediate', label: 'Immediate' },
  { code: 'digest', label: 'Digest' },
  { code: 'daily_summary', label: 'Daily summary' },
  { code: 'off', label: 'Off' },
];

export const NOTIFICATION_CHANNELS = [
  { code: 'in_app', label: 'In-app', available: true },
  { code: 'push', label: 'Web Push / PWA', available: true },
  { code: 'email', label: 'Email', available: false },
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

export const USER_ALERT_KINDS = [
  { code: 'traffic_area', label: 'Traffic near an area', category: 'traffic' },
  { code: 'traffic_road', label: 'Traffic on a road', category: 'traffic' },
  { code: 'fuel_price', label: 'Fuel price alert', category: 'fuel' },
  { code: 'commodity_price', label: 'Commodity price alert', category: 'prices' },
  { code: 'fx_rate', label: 'FX rate alert', category: 'fx' },
  { code: 'official_category', label: 'Official category', category: 'official' },
  { code: 'official_source', label: 'Official agency', category: 'official' },
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
  fx: 24,
  official: 168,
  community: 48,
  system: 48,
};

export const DEFAULT_COOLDOWN_MINUTES = {
  traffic: 30,
  road_alerts: 30,
  fuel: 60,
  prices: 120,
  fx: 60,
  official: 0,
  system: 0,
  transport: 60,
  community: 120,
};

export const PER_USER_HOURLY_LIMIT = 40;
export const PER_EVENT_FANOUT_LIMIT = 5000;

export function categoryLabel(code) {
  return NOTIFICATION_CATEGORIES.find((c) => c.code === code)?.label || code;
}

export function placeKindLabel(code) {
  return SAVED_PLACE_KINDS.find((c) => c.code === code)?.label || code;
}

export function priorityLabel(code) {
  return NOTIFICATION_PRIORITIES.find((p) => p.code === code)?.label || code;
}

export function frequencyLabel(code) {
  return NOTIFICATION_FREQUENCIES.find((f) => f.code === code)?.label || code;
}
