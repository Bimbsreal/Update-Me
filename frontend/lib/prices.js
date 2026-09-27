export const PRICE_HISTORY_PERIODS = [
  { id: '24h', label: '24H' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
];

export function formatCommodityPrice(amount, currency = 'NGN') {
  if (amount == null) return null;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function formatPriceRange(range) {
  if (!range || range.min == null) return null;
  const min = formatCommodityPrice(range.min, range.currency || 'NGN');
  if (!range.isRange || range.max == null || range.min === range.max) return min;
  const max = formatCommodityPrice(range.max, range.currency || 'NGN');
  return `${min}–${max}`;
}

export function formatPriceAge(value) {
  if (!value) return '';
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? 'Updated today' : `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Updated today';
  if (days < 7) return `${days} days old`;
  return `${days}d ago`;
}

/** Display-only pack normalization hint (never replaces the observation). */
export function formatNormalizedHint(normalized) {
  if (!normalized?.label) return null;
  return normalized.label;
}
