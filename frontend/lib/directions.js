export const DIRECTION_MODES = [
  { value: 'driving', label: 'Driving' },
  { value: 'public_transport', label: 'Public Transport' },
  { value: 'walking', label: 'Walking' },
];

export function travelModeLabel(mode) {
  return DIRECTION_MODES.find((item) => item.value === mode)?.label || mode;
}

export function formatDistanceKm(km) {
  if (km == null || Number.isNaN(Number(km))) return null;
  return `${Number(km).toFixed(Number(km) < 10 ? 1 : 0)} km (straight-line estimate)`;
}

export function formatDirectionsAge(value) {
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
