/**
 * Commodity prices configuration helpers.
 */

export const PRICE_PLACE_TYPES = Object.freeze([
  { id: 'market', label: 'Market' },
  { id: 'supermarket', label: 'Supermarket' },
  { id: 'shop', label: 'Shop' },
  { id: 'trading_area', label: 'Trading area' },
  { id: 'neighbourhood', label: 'Neighbourhood' },
  { id: 'other', label: 'Other' },
]);

export const PRICE_HISTORY_PERIODS = Object.freeze([
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
]);

export function placeTypeLabel(id) {
  return PRICE_PLACE_TYPES.find((p) => p.id === id)?.label || id;
}

export function historyPeriodMeta(id) {
  return PRICE_HISTORY_PERIODS.find((p) => p.id === id) || PRICE_HISTORY_PERIODS[0];
}
