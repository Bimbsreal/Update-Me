export const NOTIFICATION_CATEGORIES = [
  { value: 'traffic', label: 'Traffic' },
  { value: 'road_alerts', label: 'Road Alerts' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'transport', label: 'Transport' },
  { value: 'prices', label: 'Commodity Prices' },
  { value: 'official', label: 'Official Updates' },
  { value: 'community', label: 'Community Questions' },
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
      return `/fuel/${id}`;
    case 'transport':
      return `/transport/${id}`;
    case 'prices':
      return `/prices/${id}`;
    case 'official':
      return `/official-updates/${id}`;
    case 'community':
      return `/community/questions/${id}`;
    default:
      return '/notifications';
  }
}

export function priorityClass(priority) {
  if (priority === 'urgent') return 'text-status-urgent';
  if (priority === 'important') return 'text-brand-700';
  return 'text-ink-muted';
}
