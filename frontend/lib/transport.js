export const TRANSPORT_MODES = [
  { value: 'bus', label: 'Bus', shortLabel: 'Bus' },
  { value: 'brt', label: 'BRT', shortLabel: 'BRT' },
  { value: 'danfo', label: 'Danfo', shortLabel: 'Danfo' },
  { value: 'minibus', label: 'Minibus', shortLabel: 'Minibus' },
  { value: 'keke', label: 'Keke', shortLabel: 'Keke' },
  { value: 'okada', label: 'Okada', shortLabel: 'Okada' },
  { value: 'taxi', label: 'Taxi', shortLabel: 'Taxi' },
  { value: 'train', label: 'Train', shortLabel: 'Train' },
  { value: 'ferry', label: 'Ferry', shortLabel: 'Ferry' },
  { value: 'other', label: 'Other', shortLabel: 'Other' },
];

export function transportModeMeta(value) {
  return TRANSPORT_MODES.find((item) => item.value === value) || null;
}

export function transportModeLabel(value) {
  return transportModeMeta(value)?.shortLabel || value;
}

export function formatFareAmount(amount, currency = 'NGN') {
  if (amount == null) return null;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function formatFareRange(range) {
  if (!range || range.min == null) return null;
  const min = formatFareAmount(range.min, range.currency || 'NGN');
  if (!range.isRange || range.max == null || range.min === range.max) return min;
  const max = formatFareAmount(range.max, range.currency || 'NGN');
  return `${min}–${max}`;
}

export function formatTransportAge(value) {
  if (!value) return '';
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function pickPrimaryFareSummary(route, preferredMode = null) {
  const summary = route?.fareSummary || [];
  if (!summary.length) return null;
  if (preferredMode) {
    const match = summary.find((s) => s.transportMode === preferredMode);
    if (match) return match;
  }
  return summary[0];
}

export function routeDisplayName(route) {
  if (!route) return 'Transport route';
  if (route.name) return route.name;
  const from = route.origin?.name || 'Origin';
  const to = route.destination?.name || 'Destination';
  return `${from} → ${to}`;
}
