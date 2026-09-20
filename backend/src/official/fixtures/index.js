/**
 * Local development fixtures — explicitly approved sample official notices.
 * These are NOT live government scrapes. Used for UI/dev/tests only.
 * publishedAt values are fixed so repeated syncs stay idempotent.
 */

const FIXTURE_EPOCH = Date.parse('2026-09-01T08:00:00.000Z');

function hoursAgo(h) {
  return new Date(FIXTURE_EPOCH - h * 3600 * 1000).toISOString();
}

export const OFFICIAL_FIXTURES = {
  frsc: [
    {
      externalId: 'frsc-fixture-road-advisory-001',
      title: 'Road advisory: reduced speed on express corridors during peak rain',
      summary:
        'Motorists are advised to reduce speed and maintain safe following distance on major express corridors during heavy rainfall.',
      body: 'This is a development fixture representing a Federal Road Safety Corps public advisory. It is not a live government publication.',
      originalUrl: 'https://frsc.gov.ng/',
      category: 'road_traffic',
      jurisdictionLevel: 'national',
      publishedAt: hoursAgo(5),
      sourceMetadata: { fixture: true, agency: 'FRSC' },
    },
    {
      externalId: 'frsc-fixture-safety-002',
      title: 'Public safety reminder: seat belts and child restraints',
      summary:
        'FRSC reminds road users that seat belts and appropriate child restraints remain mandatory for safer journeys.',
      originalUrl: 'https://frsc.gov.ng/',
      category: 'public_safety',
      jurisdictionLevel: 'national',
      publishedAt: hoursAgo(30),
      sourceMetadata: { fixture: true, agency: 'FRSC' },
    },
  ],
  nmdpra: [
    {
      externalId: 'nmdpra-fixture-fuel-001',
      title: 'Petroleum products supply monitoring update',
      summary:
        'NMDPRA continues monitoring midstream and downstream petroleum product supply to support orderly distribution nationwide.',
      originalUrl: 'https://www.nmdpra.gov.ng/',
      category: 'fuel_petroleum',
      jurisdictionLevel: 'national',
      publishedAt: hoursAgo(12),
      sourceMetadata: { fixture: true, agency: 'NMDPRA' },
    },
  ],
  lastma: [
    {
      externalId: 'lastma-fixture-lagos-001',
      title: 'Lagos traffic management advisory for major corridors',
      summary:
        'LASTMA advises motorists to allow extra travel time on selected Lagos corridors due to enforcement and traffic management operations.',
      originalUrl: 'https://lastma.lagosstate.gov.ng/',
      category: 'road_traffic',
      jurisdictionLevel: 'state',
      publishedAt: hoursAgo(3),
      sourceMetadata: { fixture: true, agency: 'LASTMA' },
    },
    {
      externalId: 'lastma-fixture-lagos-002',
      title: 'Temporary lane restriction notice',
      summary:
        'Temporary lane restrictions may apply during scheduled traffic management activities. Follow on-ground directional instructions.',
      originalUrl: 'https://lastma.lagosstate.gov.ng/',
      category: 'road_traffic',
      jurisdictionLevel: 'state',
      publishedAt: hoursAgo(48),
      sourceMetadata: { fixture: true, agency: 'LASTMA' },
    },
  ],
};

export function getFixtureUpdates(fixtureKey) {
  const items = OFFICIAL_FIXTURES[fixtureKey];
  if (!items) {
    throw new Error(`Unknown official fixture key: ${fixtureKey}`);
  }
  // Return copies so callers cannot mutate the registry
  return items.map((item) => ({ ...item, sourceMetadata: { ...item.sourceMetadata } }));
}
