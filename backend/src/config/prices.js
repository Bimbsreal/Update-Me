/**
 * Commodity prices configuration helpers.
 */

export const PRICE_PLACE_TYPES = Object.freeze([
  { id: 'market', label: 'Market' },
  { id: 'supermarket', label: 'Supermarket' },
  { id: 'shop', label: 'Shop' },
  { id: 'trading_area', label: 'Trading area' },
  { id: 'neighbourhood', label: 'Neighbourhood' },
  { id: 'roadside', label: 'Roadside seller' },
  { id: 'wholesale_outlet', label: 'Wholesale outlet' },
  { id: 'other', label: 'Other' },
]);

/** Fallback labels; canonical categories live in commodity_categories. */
export const COMMODITY_CATEGORIES = Object.freeze([
  { id: 'grains', label: 'Grains' },
  { id: 'legumes', label: 'Legumes' },
  { id: 'tubers', label: 'Tubers' },
  { id: 'staples', label: 'Staples' },
  { id: 'cooking_ingredients', label: 'Cooking ingredients' },
  { id: 'proteins', label: 'Proteins' },
  { id: 'household_essentials', label: 'Household essentials' },
  { id: 'other', label: 'Other' },
]);

export const COMMODITY_PRICING_CONTEXTS = Object.freeze([
  {
    id: 'retail',
    label: 'Retail',
    meaning: 'End-customer purchase price.',
  },
  {
    id: 'wholesale',
    label: 'Wholesale',
    meaning: 'Wholesale trade price — not interchangeable with retail.',
  },
  {
    id: 'market',
    label: 'Open market',
    meaning: 'Price observed at an open market stall.',
  },
  {
    id: 'supermarket',
    label: 'Supermarket',
    meaning: 'Shelf price at a supermarket or similar retailer.',
  },
  {
    id: 'local_seller',
    label: 'Local seller',
    meaning: 'Roadside or neighbourhood seller — not a named business.',
  },
  {
    id: 'official_publication',
    label: 'Official publication',
    meaning: 'Published by an approved official or statistical source.',
  },
  {
    id: 'other',
    label: 'Other',
    meaning: 'Other documented pricing context.',
  },
]);

export const PRICE_HISTORY_PERIODS = Object.freeze([
  { id: '24h', label: '24H', days: 1 },
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
]);

export const PRICE_SOURCE_LABELS = Object.freeze({
  community: 'Community Report',
  official: 'Official Price Information',
  aggregated: 'Market Observation',
  admin: 'Verified Observation',
  market: 'Market Observation',
});

export function priceSourceLabel(sourceType, { pricingContext } = {}) {
  if (pricingContext === 'official_publication') return PRICE_SOURCE_LABELS.official;
  if (pricingContext === 'market') return PRICE_SOURCE_LABELS.market;
  if (sourceType === 'official') return PRICE_SOURCE_LABELS.official;
  if (sourceType === 'aggregated') return PRICE_SOURCE_LABELS.aggregated;
  if (sourceType === 'admin') return PRICE_SOURCE_LABELS.admin;
  return PRICE_SOURCE_LABELS.community;
}

export function placeTypeLabel(id) {
  return PRICE_PLACE_TYPES.find((p) => p.id === id)?.label || id;
}

export function commodityCategoryLabel(idOrCode) {
  if (!idOrCode) return null;
  return COMMODITY_CATEGORIES.find((c) => c.id === idOrCode)?.label || idOrCode;
}

export function pricingContextMeta(id) {
  return COMMODITY_PRICING_CONTEXTS.find((c) => c.id === id) || COMMODITY_PRICING_CONTEXTS[0];
}

export function pricingContextLabel(id) {
  return pricingContextMeta(id).label;
}

export function historyPeriodMeta(id) {
  return PRICE_HISTORY_PERIODS.find((p) => p.id === id) || PRICE_HISTORY_PERIODS[0];
}

/**
 * Display-only normalization: e.g. ₦50,000 / 50kg → ₦1,000/kg.
 * Never replaces the original observation; returns null when unsafe.
 */
export function normalizeUnitPrice({ amount, quantity, unitCode, unitType } = {}) {
  const amt = Number(amount);
  const qty = Number(quantity);
  if (!Number.isFinite(amt) || !Number.isFinite(qty) || qty <= 0) return null;
  const type = unitType || null;
  const code = String(unitCode || '').toLowerCase();
  const base =
    type === 'mass' || code === 'kg' || code === 'g'
      ? 'kg'
      : type === 'volume' || code === 'litre' || code === 'ml'
        ? 'litre'
        : null;
  if (!base) return null;
  let baseQty = qty;
  if (code === 'g') baseQty = qty / 1000;
  if (code === 'ml') baseQty = qty / 1000;
  if (baseQty <= 0) return null;
  return {
    amount: Math.round((amt / baseQty) * 100) / 100,
    unit: base,
    label: `≈ ₦${Math.round(amt / baseQty).toLocaleString('en-NG')}/${base}`,
    note: 'Normalized for display only — not a separate observation.',
  };
}
