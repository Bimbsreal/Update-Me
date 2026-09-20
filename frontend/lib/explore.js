export const EXPLORE_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'traffic', label: 'Traffic' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'transport', label: 'Transport' },
  { id: 'prices', label: 'Prices' },
  { id: 'road_conditions', label: 'Road Conditions' },
  { id: 'local_alerts', label: 'Local Alerts' },
  { id: 'directions', label: 'Directions' },
  { id: 'official', label: 'Official' },
  { id: 'community', label: 'Community' },
];

export const EXPLORE_FRESHNESS = [
  { id: '30m', label: 'Last 30 min' },
  { id: '2h', label: 'Last 2 hours' },
  { id: 'today', label: 'Today' },
  { id: 'recent', label: 'Recent' },
  { id: 'any', label: 'All available' },
];

export const STATUS_BY_CATEGORY = {
  traffic: [
    { id: '', label: 'All' },
    { id: 'clear', label: 'Clear' },
    { id: 'light', label: 'Light' },
    { id: 'moderate', label: 'Moderate' },
    { id: 'heavy', label: 'Heavy' },
    { id: 'standstill', label: 'Standstill' },
    { id: 'blocked', label: 'Blocked' },
  ],
  fuel: [
    { id: '', label: 'All' },
    { id: 'available', label: 'Available' },
    { id: 'limited', label: 'Limited' },
    { id: 'unavailable', label: 'Unavailable' },
  ],
  local_alerts: [
    { id: '', label: 'All' },
    { id: 'informational', label: 'Informational' },
    { id: 'caution', label: 'Caution' },
    { id: 'urgent', label: 'Urgent' },
    { id: 'critical', label: 'Critical' },
  ],
};

export const MARKER_COLORS = {
  traffic: '#e67e22',
  fuel: '#006d44',
  transport: '#1b6ca8',
  prices: '#0a8f54',
  road_conditions: '#5b6b63',
  local_alerts: '#d62828',
  alert: '#d62828',
  directions: '#1b6ca8',
  official: '#1b6ca8',
  community: '#5b6b63',
  report: '#006d44',
};

export function categoryLabel(id) {
  return EXPLORE_CATEGORIES.find((c) => c.id === id)?.label || id;
}

export function emptyMessage(category) {
  switch (category) {
    case 'traffic':
      return 'No traffic reports match these filters.';
    case 'fuel':
      return 'No fuel information available nearby.';
    case 'transport':
      return 'No transport routes found nearby.';
    case 'prices':
      return 'No price reports match these filters.';
    case 'local_alerts':
      return 'No local alerts nearby.';
    case 'official':
      return 'No official updates found.';
    case 'community':
      return 'No community questions nearby.';
    default:
      return 'No recent updates in this area.';
  }
}

export function reportHref(category) {
  switch (category) {
    case 'traffic':
      return '/traffic';
    case 'fuel':
      return '/fuel';
    case 'transport':
      return '/transport';
    case 'prices':
      return '/prices';
    case 'local_alerts':
      return '/alerts';
    case 'community':
      return '/community';
    case 'directions':
      return '/directions';
    default:
      return '/app/report';
  }
}
