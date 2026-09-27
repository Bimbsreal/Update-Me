/**
 * Scope assessment for official updates — operational public-service vs out-of-scope.
 * Heuristic review signals only; administrators make the final decision.
 */

const OUT_OF_SCOPE_PATTERNS = [
  /\bcampaign\b/i,
  /\belectioneer/i,
  /\bvote for\b/i,
  /\bpolitical party\b/i,
  /\bpartisan\b/i,
  /\bcelebrity\b/i,
  /\bentertainment\b/i,
  /\bsports?\b/i,
  /\bfootball\b/i,
  /\bmovie\b/i,
  /\blifestyle\b/i,
  /\breligious debate\b/i,
];

const IN_SCOPE_HINTS = [
  /\btraffic\b/i,
  /\broad\b/i,
  /\bclosure\b/i,
  /\baccident\b/i,
  /\bfuel\b/i,
  /\bpms\b/i,
  /\bdiesel\b/i,
  /\btransport\b/i,
  /\bemerge?ncy\b/i,
  /\bsafety\b/i,
  /\badvisory\b/i,
  /\brestriction\b/i,
  /\bflood\b/i,
  /\bprice\b/i,
  /\bmarket\b/i,
];

/**
 * @returns {'in_scope'|'needs_review'|'out_of_scope'}
 */
export function assessOfficialScope({ title = '', summary = '', body = '', category } = {}) {
  const text = `${title}\n${summary || ''}\n${body || ''}`;
  const outHits = OUT_OF_SCOPE_PATTERNS.filter((re) => re.test(text)).length;
  const inHits = IN_SCOPE_HINTS.filter((re) => re.test(text)).length;

  if (outHits >= 2 && inHits === 0) return 'out_of_scope';
  if (outHits >= 1 && inHits === 0) return 'needs_review';
  if (outHits >= 1 && inHits >= 1) return 'needs_review';

  const operationalCategories = new Set([
    'road_traffic',
    'fuel_petroleum',
    'public_safety',
    'transport',
    'weather_emergency',
    'infrastructure',
    'financial_economic',
  ]);
  if (category && !operationalCategories.has(category) && inHits === 0) {
    return 'needs_review';
  }
  return 'in_scope';
}

export function scopeAssessmentLabel(id) {
  if (id === 'out_of_scope') return 'Out of scope';
  if (id === 'needs_review') return 'Needs scope review';
  return 'In scope';
}
