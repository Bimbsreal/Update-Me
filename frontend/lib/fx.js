export const FX_QUOTE_CURRENCY = 'NGN';

/** Fallback pairs until /fx/currencies loads — keep in sync with backend config/fx.js */
export const FX_DEFAULT_BASES = Object.freeze(['USD', 'GBP', 'EUR']);

export function formatNaira(rate) {
  if (rate == null || !Number.isFinite(Number(rate))) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(rate));
}

export function formatChangePercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function sourceLabel(source) {
  if (!source?.displayName && !source?.id) return 'Source unavailable';
  const name = source.displayName || source.id;
  // Never shorten non-CBN sources to "CBN"
  if (source.id === 'cbn') return 'Source: CBN';
  return `Source: ${name}`;
}
