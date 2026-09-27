/**
 * Fuel price intelligence — controlled vocabularies beyond base taxonomies.
 */

export const FUEL_PRICING_CONTEXTS = Object.freeze([
  {
    id: 'retail_pump',
    label: 'Retail pump price',
    meaning: 'Price at the filling-station pump for end customers.',
  },
  {
    id: 'ex_depot',
    label: 'Ex-depot price',
    meaning: 'Depot / rack price — not a station pump price.',
  },
  {
    id: 'wholesale',
    label: 'Wholesale price',
    meaning: 'Wholesale trade price — not interchangeable with pump prices.',
  },
  {
    id: 'marketer_guidance',
    label: 'Marketer guidance',
    meaning: 'Guidance from a marketer; may differ from individual stations.',
  },
  {
    id: 'official_publication',
    label: 'Official publication',
    meaning: 'Published by an approved official source.',
  },
  {
    id: 'other',
    label: 'Other',
    meaning: 'Other documented pricing context.',
  },
]);

export const FUEL_SOURCE_LABELS = Object.freeze({
  community: 'Community Report',
  official: 'Official Price',
  admin: 'Admin-verified observation',
  aggregated: 'Market Observation',
  station: 'Station Report',
});

export function pricingContextMeta(id) {
  return FUEL_PRICING_CONTEXTS.find((c) => c.id === id) || FUEL_PRICING_CONTEXTS[0];
}

export function pricingContextLabel(id) {
  return pricingContextMeta(id).label;
}

export function fuelSourceLabel(sourceType, { pricingContext } = {}) {
  if (pricingContext === 'official_publication') return FUEL_SOURCE_LABELS.official;
  if (pricingContext === 'marketer_guidance') return 'Marketer guidance';
  return FUEL_SOURCE_LABELS[sourceType] || FUEL_SOURCE_LABELS.community;
}
