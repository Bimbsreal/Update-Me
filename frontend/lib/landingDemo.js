/**
 * Demonstration preview data for the landing page only.
 * Structured so UI can later map API report payloads.
 * Not live production data.
 */
export const DEMO_PREVIEW_LABEL = 'Demonstration preview — not live data';

export const demoTraffic = {
  id: 'demo-traffic-1',
  category: 'traffic',
  title: 'Heavy traffic',
  place: 'Lekki–Epe Expressway',
  status: 'urgent',
  freshnessLabel: 'Recently reported',
  meta: 'Demo example',
};

export const demoFuel = {
  id: 'demo-fuel-1',
  category: 'fuel',
  title: 'Nearby filling station',
  place: 'Lekki Phase 1',
  priceLabel: '₦945/L',
  availability: 'available',
  availabilityLabel: 'Available',
  freshnessLabel: 'Community-reported price',
  meta: 'Demo example',
};

export const demoTransport = {
  id: 'demo-transport-1',
  category: 'transport',
  title: 'Ajah → CMS',
  fareLabel: '₦1,200',
  modeLabel: 'Bus fare',
  freshnessLabel: 'Recently reported',
  meta: 'Demo example',
};

export const demoAlert = {
  id: 'demo-alert-1',
  category: 'local_alert',
  title: 'Road works ahead',
  place: 'Ikorodu Road',
  status: 'attention',
  freshnessLabel: 'Local update example',
  meta: 'Demo example',
};

export const demoFeatures = [
  {
    id: 'traffic',
    title: 'Traffic',
    body: 'Know current community-reported traffic conditions.',
    accent: 'traffic',
  },
  {
    id: 'fuel',
    title: 'Fuel',
    body: 'Discover recent fuel prices and availability.',
    accent: 'fuel',
  },
  {
    id: 'transport',
    title: 'Transport',
    body: 'Find community-reported routes and fares.',
    accent: 'transport',
  },
  {
    id: 'prices',
    title: 'Prices',
    body: 'Discover recent prices for everyday commodities.',
    accent: 'prices',
  },
  {
    id: 'directions',
    title: 'Directions',
    body: 'Ask people who know the area.',
    accent: 'directions',
  },
  {
    id: 'alerts',
    title: 'Local Alerts',
    body: 'Stay informed about reported local conditions.',
    accent: 'alerts',
  },
];

export const demoSteps = [
  {
    step: 1,
    title: 'Choose your area',
    body: 'Pick the places that matter for your daily movement.',
  },
  {
    step: 2,
    title: 'Discover updates',
    body: 'See community-reported traffic, fuel, fares, and alerts.',
  },
  {
    step: 3,
    title: 'Share useful information',
    body: 'Add what you see so others can decide with confidence.',
  },
  {
    step: 4,
    title: 'Help keep information current',
    body: 'Confirm or update reports so freshness stays useful.',
  },
];

export const demoCommunity = [
  {
    id: 'q1',
    question: 'Is there fuel at the NNPC on Admiralty Way right now?',
    answer: 'Yes — queue is short. Petrol around ₦945/L when I left 20 minutes ago.',
    place: 'Lekki Phase 1',
  },
  {
    id: 'q2',
    question: 'What’s the fastest way from Surulere to VI this evening?',
    answer: 'Avoid Third Mainland if you can. Coastal road was clearer when I passed.',
    place: 'Lagos',
  },
];

export const demoNearby = [
  demoTraffic,
  demoFuel,
  demoTransport,
  {
    id: 'demo-price-1',
    category: 'commodity',
    title: '5kg Rice',
    place: 'Lekki Market',
    priceLabel: '₦7,500',
    status: 'attention',
    freshnessLabel: 'Example price report',
  },
];
