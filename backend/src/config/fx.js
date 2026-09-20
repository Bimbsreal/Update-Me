/**
 * FX configuration — currencies and sync settings are centralized here
 * so frontend/backends do not hardcode pairs throughout components.
 */

export const FX_QUOTE_CURRENCY = 'NGN';

/** Initial base currencies quoted against NGN. Add entries here to expand support. */
export const FX_BASE_CURRENCIES = Object.freeze(['USD', 'GBP', 'EUR']);

export const FX_SUPPORTED_PAIRS = Object.freeze(
  FX_BASE_CURRENCIES.map((base) => ({
    base,
    quote: FX_QUOTE_CURRENCY,
    label: `${base} / ${FX_QUOTE_CURRENCY}`,
  }))
);

export const FX_RATE_TYPES = Object.freeze({
  OFFICIAL_REFERENCE: 'official_reference',
  MARKET_INDICATIVE: 'market_indicative',
});

export const FX_HISTORY_PERIODS = Object.freeze({
  '7d': 7,
  '30d': 30,
  '90d': 90,
});

export function isSupportedCurrency(code) {
  if (!code || typeof code !== 'string') return false;
  const upper = code.toUpperCase();
  return upper === FX_QUOTE_CURRENCY || FX_BASE_CURRENCIES.includes(upper);
}

export function normalizeCurrency(code) {
  return String(code || '')
    .trim()
    .toUpperCase();
}

export function pairKey(base, quote) {
  return `${normalizeCurrency(base)}_${normalizeCurrency(quote)}`;
}
