/**
 * Traffic Intelligence & Road Conditions — controlled vocabularies.
 * Reuses existing traffic_severity / traffic_cause DB enums.
 * Do not hard-code event names in UI — import from here.
 */

/** Public-facing severity bands mapped from DB enum values. */
export const TRAFFIC_SEVERITY_BANDS = {
  low: {
    label: 'Low',
    meaning: 'Traffic flowing with only light delay; lanes mostly open.',
    values: ['clear', 'light'],
  },
  moderate: {
    label: 'Moderate',
    meaning: 'Noticeable slowdown; expect extra travel time.',
    values: ['moderate'],
  },
  heavy: {
    label: 'Heavy',
    meaning: 'Significant congestion; movement is slow but continuing.',
    values: ['heavy'],
  },
  severe: {
    label: 'Severe',
    meaning: 'Near standstill or major disruption; avoid if possible.',
    values: ['standstill'],
  },
  critical: {
    label: 'Critical',
    meaning: 'Road blocked or impassable for the reported direction/section.',
    values: ['blocked'],
  },
  unknown: {
    label: 'Unknown',
    meaning: 'Severity not yet classified.',
    values: ['unknown'],
  },
};

/** Operational impact labels (Low / Moderate / High / Critical). */
export const TRAFFIC_IMPACT_SEVERITIES = ['low', 'moderate', 'high', 'critical'];

export const TRAFFIC_EVENT_TYPES = [
  'congestion',
  'accident',
  'vehicle_breakdown',
  'obstruction',
  'fire',
  'flooding',
  'road_damage',
  'fallen_object',
  'road_closure',
  'partial_closure',
  'diversion',
  'construction',
  'lane_restriction',
  'bus_disruption',
  'route_disruption',
  'transport_delay',
  'checkpoint',
  'security_incident',
  'other',
];

export const TRAFFIC_EVENT_TYPE_GROUPS = {
  congestion: ['congestion'],
  incidents: [
    'accident',
    'vehicle_breakdown',
    'obstruction',
    'fire',
    'flooding',
    'road_damage',
    'fallen_object',
  ],
  restrictions: [
    'road_closure',
    'partial_closure',
    'diversion',
    'construction',
    'lane_restriction',
  ],
  public_transport: ['bus_disruption', 'route_disruption', 'transport_delay'],
  security_movement: ['checkpoint', 'security_incident'],
  other: ['other'],
};

export const TRAFFIC_EVENT_STATUSES = [
  'reported',
  'investigating',
  'confirmed',
  'active',
  'improving',
  'resolved',
  'expired',
  'rejected',
  'cancelled', // legacy synonym of rejected
];

export const TRAFFIC_LIVE_STATUSES = [
  'reported',
  'investigating',
  'confirmed',
  'active',
  'improving',
];

export const TRAFFIC_DIRECTIONS = [
  'inbound',
  'outbound',
  'northbound',
  'southbound',
  'eastbound',
  'westbound',
  'both',
  'unspecified',
];

export const TRAFFIC_CONFIDENCE_LEVELS = ['low', 'medium', 'high'];

export const TRAFFIC_PASSABILITY = [
  'unknown',
  'passable',
  'passable_with_care',
  'impassable',
];

export const FARE_PERIODS = [
  'any',
  'peak',
  'off_peak',
  'weekday',
  'weekend',
  'night',
  'other',
];

/** Source labels for public cards — never blur community into official. */
export const TRAFFIC_SOURCE_LABELS = {
  official: 'Official',
  verified_community: 'Verified Community Report',
  community: 'Community Report',
  admin: 'Admin',
  mixed: 'Mixed sources',
};

/** Default per-type freshness (minutes) — DB policies override when present. */
export const DEFAULT_FRESHNESS_WINDOWS = {
  congestion: { fresh: 20, stale: 45, expire: 90 },
  accident: { fresh: 30, stale: 90, expire: 180 },
  vehicle_breakdown: { fresh: 25, stale: 60, expire: 120 },
  obstruction: { fresh: 30, stale: 90, expire: 240 },
  fallen_object: { fresh: 30, stale: 90, expire: 180 },
  fire: { fresh: 20, stale: 60, expire: 180 },
  flooding: { fresh: 45, stale: 180, expire: 720 },
  road_damage: { fresh: 120, stale: 720, expire: 2880 },
  road_closure: { fresh: 180, stale: 720, expire: 4320 },
  partial_closure: { fresh: 120, stale: 480, expire: 2880 },
  lane_restriction: { fresh: 90, stale: 360, expire: 1440 },
  diversion: { fresh: 120, stale: 480, expire: 2880 },
  construction: { fresh: 240, stale: 1440, expire: 10080 },
  checkpoint: { fresh: 60, stale: 240, expire: 720 },
  security_incident: { fresh: 45, stale: 180, expire: 720 },
  bus_disruption: { fresh: 45, stale: 180, expire: 480 },
  route_disruption: { fresh: 60, stale: 240, expire: 720 },
  transport_delay: { fresh: 30, stale: 90, expire: 240 },
  other: { fresh: 45, stale: 120, expire: 360 },
};

/** Map DB severity → public band. */
export function severityBand(severity) {
  const key = String(severity || 'unknown');
  for (const [band, meta] of Object.entries(TRAFFIC_SEVERITY_BANDS)) {
    if (meta.values.includes(key)) {
      return { code: band, label: meta.label, meaning: meta.meaning, dbValue: key };
    }
  }
  return {
    code: 'unknown',
    label: TRAFFIC_SEVERITY_BANDS.unknown.label,
    meaning: TRAFFIC_SEVERITY_BANDS.unknown.meaning,
    dbValue: key,
  };
}

/** Map severity band → operational impact (Low/Moderate/High/Critical). */
export function impactSeverity(severityOrBand) {
  const code =
    typeof severityOrBand === 'string' && TRAFFIC_IMPACT_SEVERITIES.includes(severityOrBand)
      ? severityOrBand
      : severityBand(severityOrBand).code;
  if (code === 'low') return { code: 'low', label: 'Low' };
  if (code === 'moderate') return { code: 'moderate', label: 'Moderate' };
  if (code === 'heavy' || code === 'severe') return { code: 'high', label: 'High' };
  if (code === 'critical') return { code: 'critical', label: 'Critical' };
  return { code: 'moderate', label: 'Moderate' };
}

export function isSevereOrCritical(severity) {
  const code = severityBand(severity).code;
  return code === 'severe' || code === 'critical';
}

export function isRoadClosureType(eventType) {
  return (
    eventType === 'road_closure' ||
    eventType === 'partial_closure' ||
    eventType === 'obstruction' ||
    eventType === 'lane_restriction' ||
    eventType === 'diversion'
  );
}

export function isTransportEventType(eventType) {
  return TRAFFIC_EVENT_TYPE_GROUPS.public_transport.includes(eventType);
}

export function isLiveEventStatus(status) {
  return TRAFFIC_LIVE_STATUSES.includes(status);
}

export function publicSourceLabel({
  sourceClassification,
  verificationStatus,
  officialAgencyName,
} = {}) {
  if (sourceClassification === 'official' || verificationStatus === 'officially_sourced') {
    return officialAgencyName
      ? `${TRAFFIC_SOURCE_LABELS.official} — ${officialAgencyName}`
      : TRAFFIC_SOURCE_LABELS.official;
  }
  if (sourceClassification === 'admin') return TRAFFIC_SOURCE_LABELS.admin;
  if (
    verificationStatus === 'admin_verified' ||
    verificationStatus === 'community_confirmed'
  ) {
    return TRAFFIC_SOURCE_LABELS.verified_community;
  }
  if (sourceClassification === 'mixed') return TRAFFIC_SOURCE_LABELS.mixed;
  return TRAFFIC_SOURCE_LABELS.community;
}

export function freshnessWindowForType(eventType) {
  return (
    DEFAULT_FRESHNESS_WINDOWS[eventType] || DEFAULT_FRESHNESS_WINDOWS.other
  );
}

/**
 * Compute freshness state from age + optional expected end.
 * Does not mutate DB — used by services / display.
 */
export function computeFreshnessState({
  eventType,
  observedAt,
  startedAt,
  updatedAt,
  expectedEndAt,
  status,
  policy,
} = {}) {
  if (status === 'resolved' || status === 'rejected' || status === 'cancelled') {
    return 'historical';
  }
  if (status === 'expired') return 'expired';

  const window = policy || freshnessWindowForType(eventType);
  const anchor = new Date(observedAt || startedAt || updatedAt || Date.now());
  const ageMin = Math.max(0, (Date.now() - anchor.getTime()) / 60000);

  if (expectedEndAt) {
    const end = new Date(expectedEndAt).getTime();
    if (Number.isFinite(end) && end <= Date.now()) return 'expired';
  }

  if (ageMin <= window.fresh) return 'fresh';
  if (ageMin <= window.stale) return 'aging';
  if (ageMin <= window.expire) return 'stale';
  return 'expired';
}

export function relativeObservationLabel(observedAt) {
  if (!observedAt) return 'Observation time unknown';
  const ms = Date.now() - new Date(observedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Reported just now';
  if (mins < 60) return `Reported ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Reported ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Reported ${days} day${days === 1 ? '' : 's'} ago`;
}
