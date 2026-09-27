export const NOTIFICATION_CATEGORIES = [
  { value: 'traffic', label: 'Traffic' },
  { value: 'road_alerts', label: 'Road Alerts' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'transport', label: 'Transport' },
  { value: 'prices', label: 'Commodity Prices' },
  { value: 'fx', label: 'Foreign Exchange' },
  { value: 'official', label: 'Official Updates' },
  { value: 'community', label: 'Community Questions' },
  { value: 'system', label: 'System / Emergency' },
];

export const SAVED_PLACE_KINDS = [
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'school', label: 'School' },
  { value: 'other', label: 'Other' },
];

export const SAVED_ROUTE_MODES = [
  { value: 'any', label: 'Any' },
  { value: 'driving', label: 'Driving' },
  { value: 'public_transport', label: 'Public Transport' },
  { value: 'walking', label: 'Walking' },
];

export function notificationHref(item) {
  if (item?.linkPath) return item.linkPath;
  const id = item?.relatedEntityId;
  if (!id) return '/notifications';
  switch (item.category) {
    case 'traffic':
      return `/traffic/${id}`;
    case 'road_alerts':
      return `/alerts/${id}`;
    case 'fuel':
      return `/fuel/stations/${id}`;
    case 'transport':
      return `/transport/routes/${id}`;
    case 'prices':
      return `/prices`;
    case 'fx':
      return `/fx`;
    case 'official':
      return `/official-updates/${id}`;
    case 'community':
      return `/community/questions/${id}`;
    default:
      return '/notifications';
  }
}

export function priorityClass(priority) {
  if (priority === 'critical' || priority === 'urgent') return 'text-status-urgent';
  if (priority === 'important') return 'text-brand-700';
  return 'text-ink-muted';
}

export function priorityLabel(priority) {
  const map = {
    low: 'Low',
    normal: 'Normal',
    important: 'High',
    urgent: 'High',
    critical: 'Critical',
  };
  return map[priority] || priority || 'Normal';
}
