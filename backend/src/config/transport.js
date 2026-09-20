/**
 * Transport module configuration — controlled taxonomies (not UI-hardcoded).
 */

export const TRANSPORT_MODES = Object.freeze([
  { id: 'bus', label: 'Bus', shortLabel: 'Bus' },
  { id: 'brt', label: 'BRT', shortLabel: 'BRT' },
  { id: 'danfo', label: 'Danfo', shortLabel: 'Danfo' },
  { id: 'minibus', label: 'Minibus', shortLabel: 'Minibus' },
  { id: 'keke', label: 'Keke', shortLabel: 'Keke' },
  { id: 'okada', label: 'Okada', shortLabel: 'Okada' },
  { id: 'taxi', label: 'Taxi', shortLabel: 'Taxi' },
  { id: 'train', label: 'Train', shortLabel: 'Train' },
  { id: 'ferry', label: 'Ferry', shortLabel: 'Ferry' },
  { id: 'other', label: 'Other', shortLabel: 'Other' },
]);

export const TRANSPORT_FARE_UNITS = Object.freeze([
  { id: 'trip', label: 'Per trip' },
  { id: 'leg', label: 'Per leg' },
  { id: 'day_pass', label: 'Day pass' },
]);

export function transportModeMeta(id) {
  return TRANSPORT_MODES.find((m) => m.id === id) || null;
}

export function transportModeLabel(id) {
  return transportModeMeta(id)?.shortLabel || id;
}

export function fareUnitLabel(id) {
  return TRANSPORT_FARE_UNITS.find((u) => u.id === id)?.label || id;
}
