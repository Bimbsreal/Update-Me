/**
 * Data Quality, Freshness & Trust Engine
 *
 * Transparent signals only — no AI, no truth score, no community→official promotion.
 */

import { getPool } from '../db/pool.js';

const POLICY_CACHE = new Map();
const POLICY_TTL_MS = 60_000;
let policyCacheAt = 0;

function minutesBetween(from, to = new Date()) {
  if (!from) return null;
  return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 60000));
}

/** Human-readable relative age for UI (not a trust score). */
export function formatAgeLabel(anchor, now = new Date()) {
  if (!anchor) return null;
  const mins = minutesBetween(anchor, now);
  if (mins == null) return null;
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  if (hours < 48) return 'Today';
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function sourceFromType(sourceType) {
  if (sourceType === 'official') {
    return { type: 'official', label: 'Official' };
  }
  if (sourceType === 'aggregated') {
    return { type: 'aggregated', label: 'Aggregated' };
  }
  return { type: 'community', label: 'Community Report' };
}

/**
 * Verification is lifecycle-derived. Community confirmations never become Official.
 */
export function verificationFromRow(row = {}) {
  const status = row.status;
  const sourceType = row.source_type || row.sourceType;

  if (status === 'removed') {
    return { state: 'removed', label: 'Removed' };
  }
  if (status === 'expired' || (row.expires_at && new Date(row.expires_at) <= new Date())) {
    return { state: 'expired', label: 'Expired' };
  }
  if (sourceType === 'official') {
    return { state: 'official', label: 'Official' };
  }
  if (status === 'under_review' || row.moderation_state === 'queued' || row.moderation_state === 'in_review') {
    return { state: 'under_review', label: 'Under Review' };
  }
  if (status === 'flagged' || row.moderation_state === 'flagged') {
    return { state: 'under_review', label: 'Under Review' };
  }
  if (status === 'confirmed' || Number(row.confirmed_accurate_count || 0) > 0) {
    return { state: 'confirmed', label: 'Confirmed' };
  }
  return { state: 'unverified', label: 'Unverified' };
}

export function corroborationLabel(count) {
  const n = Math.max(0, Number(count) || 0);
  if (n <= 1) return '1 report';
  if (n === 2) return '2 reports';
  return '3+ reports';
}

/**
 * Compute freshness state from category policy + timestamps + status.
 * Prefer status=expired/stale when already persisted by the transition job.
 */
export function computeFreshnessState(row = {}, policy = {}, now = new Date()) {
  const expiresAt = row.expires_at || row.expiresAt || null;
  const status = row.status;

  if (status === 'expired' || (expiresAt && new Date(expiresAt) <= now)) {
    return {
      state: 'expired',
      label: formatAgeLabel(row.last_confirmed_at || row.lastConfirmedAt || row.occurred_at || row.occurredAt || row.created_at || row.createdAt, now) || 'Expired',
      observedAt: row.last_confirmed_at || row.lastConfirmedAt || row.occurred_at || row.occurredAt || row.created_at || row.createdAt || null,
      expiresAt,
    };
  }

  const anchor =
    row.last_confirmed_at ||
    row.lastConfirmedAt ||
    row.occurred_at ||
    row.occurredAt ||
    row.created_at ||
    row.createdAt ||
    null;

  const ageMins = minutesBetween(anchor, now) ?? 0;
  const freshWithin = Number(policy.fresh_within_minutes ?? row.fresh_within_minutes ?? 60);
  const recentWithin = Number(policy.recent_within_minutes ?? row.recent_within_minutes ?? 180);
  const staleAfter = Number(policy.stale_after_minutes ?? row.stale_after_minutes ?? 360);

  let state;
  if (status === 'stale' || ageMins >= staleAfter) {
    state = 'stale';
  } else if (ageMins < freshWithin) {
    state = 'fresh';
  } else if (ageMins < recentWithin) {
    state = 'recent';
  } else {
    state = 'aging';
  }

  return {
    state,
    label: formatAgeLabel(anchor, now) || state,
    observedAt: anchor,
    expiresAt,
  };
}

/** Legacy string used by older clients: fresh | stale | expired (+ recent/aging). */
export function computeFreshnessLabel(row, policy, now = new Date()) {
  return computeFreshnessState(row, policy, now).state;
}

export function computeTrustLabels(row = {}) {
  const labels = [];
  const source = sourceFromType(row.source_type || row.sourceType);
  labels.push(source.label);

  const verification = verificationFromRow(row);
  if (verification.state === 'confirmed' && source.type !== 'official') {
    labels.push('Community Confirmed');
  }
  if (verification.state === 'under_review') {
    labels.push(verification.label);
  }
  if (row.status === 'stale') labels.push('Stale');
  if (row.status === 'expired' || verification.state === 'expired') labels.push('Expired');
  if (
    row.updated_at &&
    row.created_at &&
    new Date(row.updated_at).getTime() > new Date(row.created_at).getTime() + 1000
  ) {
    labels.push('Updated');
  }
  return [...new Set(labels)];
}

export function buildQualityMetadata(row = {}, policy = {}, now = new Date()) {
  const freshness = computeFreshnessState(row, policy, now);
  const source = sourceFromType(row.source_type || row.sourceType);
  const verification = verificationFromRow(row);
  const count = Number(row.corroboration_count ?? row.corroborationCount ?? 1);
  const corroboration = {
    count,
    label: corroborationLabel(count),
  };

  return {
    freshness: {
      state: freshness.state,
      label: freshness.label,
      observedAt: freshness.observedAt
        ? new Date(freshness.observedAt).toISOString()
        : null,
      expiresAt: freshness.expiresAt
        ? new Date(freshness.expiresAt).toISOString()
        : null,
    },
    source,
    verification,
    corroboration,
  };
}

export function buildAboutLines(quality, { conflict = null } = {}) {
  const lines = [];
  if (!quality) return lines;

  const src = quality.source?.type;
  const age = quality.freshness?.label;
  if (src === 'official') {
    lines.push(age ? `Published by an approved official source (${age}).` : 'Published by an approved official source.');
  } else if (src === 'aggregated') {
    lines.push(age ? `Aggregated update (${age}).` : 'Aggregated update.');
  } else {
    lines.push(age ? `Reported by the community ${age.replace(/^Updated /, '')}.` : 'Reported by the community.');
  }

  const corr = quality.corroboration?.count || 0;
  if (corr >= 2) {
    lines.push(`${quality.corroboration.label} currently describe similar conditions in this area.`);
  }

  if (quality.verification?.state === 'official') {
    lines.push('Official source — distinct from community reports.');
  } else if (quality.verification?.state === 'confirmed') {
    lines.push('Community members marked this as still accurate. Not officially verified.');
  } else if (quality.verification?.state === 'unverified') {
    lines.push('Not officially verified.');
  } else if (quality.verification?.state === 'under_review') {
    lines.push('Under review by moderation.');
  } else if (quality.verification?.state === 'expired') {
    lines.push('This update has expired and is no longer treated as current.');
  }

  if (conflict?.hasConflict) {
    lines.push('Recent reports differ — see breakdown below.');
  }

  return lines;
}

async function loadPolicies(force = false) {
  const now = Date.now();
  if (!force && POLICY_CACHE.size && now - policyCacheAt < POLICY_TTL_MS) {
    return POLICY_CACHE;
  }
  const result = await getPool().query(
    `SELECT c.code, p.*
     FROM category_freshness_policies p
     JOIN report_categories c ON c.id = p.category_id`
  );
  POLICY_CACHE.clear();
  for (const row of result.rows) {
    POLICY_CACHE.set(row.code, row);
    POLICY_CACHE.set(row.category_id, row);
  }
  policyCacheAt = now;
  return POLICY_CACHE;
}

export async function getPolicyForCategory(categoryCodeOrId) {
  const map = await loadPolicies();
  return map.get(categoryCodeOrId) || {
    fresh_within_minutes: 60,
    recent_within_minutes: 180,
    stale_after_minutes: 360,
    default_ttl_minutes: 1440,
    corroboration_window_minutes: 360,
  };
}

/**
 * Count independent reporters for a related situation.
 * Same user cannot inflate the count. Deterministic — no AI similarity.
 */
export async function countIndependentCorroboration({
  categoryId,
  locationId,
  roadId = null,
  windowMinutes = 360,
  now = new Date(),
} = {}) {
  if (!categoryId || !locationId) return 1;

  const params = [categoryId, locationId, Number(windowMinutes) || 360, now.toISOString()];
  let roadClause = '';
  if (roadId) {
    params.push(roadId);
    // Prefer matching the same road when available; otherwise same location only.
    roadClause = `AND (tr.road_id IS NULL OR tr.road_id = $${params.length})`;
  }

  const result = await getPool().query(
    `SELECT COUNT(DISTINCT r.user_id)::int AS independent_count
     FROM reports r
     LEFT JOIN traffic_reports tr ON tr.report_id = r.id
     WHERE r.category_id = $1
       AND r.location_id = $2
       AND r.status IN ('submitted','active','confirmed','stale')
       AND r.visibility = 'public'
       AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
           >= $4::timestamptz - make_interval(mins => $3)
       ${roadClause}`,
    params
  );

  const count = Number(result.rows[0]?.independent_count || 0);
  return Math.max(1, count);
}

export async function refreshCorroborationForReport(reportId) {
  const pool = getPool();
  const report = await pool.query(
    `SELECT r.id, r.category_id, r.location_id, r.user_id, c.code AS category_code,
            p.corroboration_window_minutes, tr.road_id
     FROM reports r
     JOIN report_categories c ON c.id = r.category_id
     LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
     LEFT JOIN traffic_reports tr ON tr.report_id = r.id
     WHERE r.id = $1`,
    [reportId]
  );
  const row = report.rows[0];
  if (!row) return null;

  const count = await countIndependentCorroboration({
    categoryId: row.category_id,
    locationId: row.location_id,
    roadId: row.road_id,
    windowMinutes: row.corroboration_window_minutes || 360,
  });

  await pool.query(
    `UPDATE reports
     SET corroboration_count = $2,
         quality_updated_at = NOW(),
         updated_at = updated_at
     WHERE id = $1`,
    [reportId, count]
  );

  // Keep peers in the same cluster roughly in sync (bounded)
  await pool.query(
    `UPDATE reports r
     SET corroboration_count = $2,
         quality_updated_at = NOW()
     WHERE r.category_id = $3
       AND r.location_id = $4
       AND r.status IN ('submitted','active','confirmed','stale')
       AND r.visibility = 'public'
       AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
           >= NOW() - make_interval(mins => $5)
       AND r.id <> $1
     `,
    [reportId, count, row.category_id, row.location_id, row.corroboration_window_minutes || 360]
  );

  return count;
}

/**
 * Detect conflicting recent traffic (or similar) reports at the same place.
 * Does NOT pick a winner — returns transparent breakdown.
 */
export async function findConflicts({
  categoryCode = 'traffic',
  stateId = null,
  lgaId = null,
  areaId = null,
  locationId = null,
  windowMinutes = 60,
  limit = 40,
} = {}) {
  const params = [categoryCode, windowMinutes];
  const where = [
    `c.code = $1`,
    `r.status IN ('submitted','active','confirmed','stale')`,
    `r.visibility = 'public'`,
    `COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) >= NOW() - make_interval(mins => $2)`,
  ];

  if (locationId) {
    params.push(locationId);
    where.push(`r.location_id = $${params.length}`);
  }
  if (stateId) {
    params.push(stateId);
    where.push(`loc.state_id = $${params.length}`);
  }
  if (lgaId) {
    params.push(lgaId);
    where.push(`loc.lga_id = $${params.length}`);
  }
  if (areaId) {
    params.push(areaId);
    where.push(`loc.area_id = $${params.length}`);
  }

  params.push(limit);

  // Traffic conflicts: same location/road, different severity
  if (categoryCode === 'traffic') {
    const result = await getPool().query(
      `WITH recent AS (
         SELECT r.id, r.location_id, loc.name AS location_name,
                tr.road_id, COALESCE(tr.road_name, loc.name) AS road_name,
                tr.severity::text AS signal_value,
                r.user_id
         FROM reports r
         JOIN report_categories c ON c.id = r.category_id
         LEFT JOIN locations loc ON loc.id = r.location_id
         JOIN traffic_reports tr ON tr.report_id = r.id
         WHERE ${where.join(' AND ')}
       ),
       signal_counts AS (
         SELECT COALESCE(road_id::text, location_id::text) AS group_key,
                signal_value,
                COUNT(*)::int AS signal_count,
                COUNT(DISTINCT user_id)::int AS independent_for_signal
         FROM recent
         GROUP BY COALESCE(road_id::text, location_id::text), signal_value
       ),
       groups AS (
         SELECT COALESCE(r.road_id::text, r.location_id::text) AS group_key,
                MAX(r.road_name) AS place_name,
                MAX(r.location_id::text) AS location_id,
                COUNT(*)::int AS report_count,
                COUNT(DISTINCT r.signal_value)::int AS distinct_signals,
                COUNT(DISTINCT r.user_id)::int AS independent_reporters
         FROM recent r
         GROUP BY COALESCE(r.road_id::text, r.location_id::text)
         HAVING COUNT(DISTINCT r.signal_value) > 1
       )
       SELECT g.*,
              COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'value', sc.signal_value,
                      'label', replace(sc.signal_value, '_', ' '),
                      'count', sc.signal_count
                    )
                    ORDER BY sc.signal_count DESC
                  )
                  FROM signal_counts sc
                  WHERE sc.group_key = g.group_key
                ),
                '[]'::jsonb
              ) AS breakdown
       FROM groups g
       ORDER BY g.report_count DESC
       LIMIT $${params.length}`,
      params
    );

    return result.rows.map((row) => ({
      groupKey: row.group_key,
      placeName: row.place_name,
      locationId: row.location_id,
      reportCount: row.report_count,
      independentReporters: row.independent_reporters,
      hasConflict: true,
      headline: 'Recent reports differ',
      breakdown: row.breakdown || [],
      windowMinutes,
    }));
  }

  // Generic: conflicting titles/status for same location
  const result = await getPool().query(
    `WITH recent AS (
       SELECT r.id, r.location_id, loc.name AS location_name,
              r.status::text AS signal_value, r.user_id,
              COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) AS observed_at
       FROM reports r
       JOIN report_categories c ON c.id = r.category_id
       LEFT JOIN locations loc ON loc.id = r.location_id
       WHERE ${where.join(' AND ')}
     ),
     groups AS (
       SELECT location_id::text AS group_key,
              MAX(location_name) AS place_name,
              MAX(location_id::text) AS location_id,
              COUNT(*)::int AS report_count,
              COUNT(DISTINCT signal_value)::int AS distinct_signals,
              COUNT(DISTINCT user_id)::int AS independent_reporters
       FROM recent
       GROUP BY location_id
       HAVING COUNT(DISTINCT signal_value) > 1 AND COUNT(*) >= 2
     )
     SELECT * FROM groups
     ORDER BY report_count DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows.map((row) => ({
    groupKey: row.group_key,
    placeName: row.place_name,
    locationId: row.location_id,
    reportCount: row.report_count,
    independentReporters: row.independent_reporters,
    hasConflict: true,
    headline: 'Recent reports differ',
    breakdown: [],
    windowMinutes,
  }));
}

export async function conflictForReport(reportRow) {
  if (!reportRow?.location_id && !reportRow?.locationId) return null;
  const categoryCode = reportRow.category_code || reportRow.category?.code || 'traffic';
  if (categoryCode !== 'traffic') return null;

  const policy = await getPolicyForCategory(categoryCode);
  const windowMinutes = Math.min(
    Number(policy.corroboration_window_minutes || 90),
    Number(policy.stale_after_minutes || 60) * 2
  );

  const conflicts = await findConflicts({
    categoryCode: 'traffic',
    locationId: reportRow.location_id || reportRow.locationId,
    windowMinutes,
    limit: 5,
  });
  return conflicts[0] || null;
}

/**
 * Apply expiry/stale transitions and return changed rows for SSE.
 * Delegates persistence to reportRepository; enriches for publishers.
 */
export async function applyFreshnessTransitions(options) {
  // Lazy import avoids circular dependency with reportRepository.
  const { reportRepository } = await import('../repositories/reportRepository.js');
  return reportRepository.applyFreshnessTransitions(options);
}

export async function adminQualitySummary() {
  const pool = getPool();
  const [freshness, awaiting, conflicts, highDup, corrections, syncFail, staleSources] =
    await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (
             WHERE r.status IN ('submitted','active','confirmed')
               AND (r.expires_at IS NULL OR r.expires_at > NOW())
               AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
                   > NOW() - make_interval(mins => COALESCE(p.fresh_within_minutes, 60))
           )::int AS fresh,
           COUNT(*) FILTER (
             WHERE r.status IN ('submitted','active','confirmed')
               AND (r.expires_at IS NULL OR r.expires_at > NOW())
               AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
                   <= NOW() - make_interval(mins => COALESCE(p.fresh_within_minutes, 60))
               AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
                   > NOW() - make_interval(mins => COALESCE(p.recent_within_minutes, 180))
           )::int AS recent,
           COUNT(*) FILTER (
             WHERE r.status IN ('submitted','active','confirmed')
               AND (r.expires_at IS NULL OR r.expires_at > NOW())
               AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
                   <= NOW() - make_interval(mins => COALESCE(p.recent_within_minutes, 180))
               AND COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at)
                   > NOW() - make_interval(mins => p.stale_after_minutes)
           )::int AS aging,
           COUNT(*) FILTER (WHERE r.status = 'stale')::int AS stale,
           COUNT(*) FILTER (WHERE r.status = 'expired')::int AS expired
         FROM reports r
         LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
         WHERE r.status <> 'removed'`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM reports
         WHERE status IN ('flagged','under_review')
            OR moderation_state IN ('flagged','queued','in_review')`
      ),
      findConflicts({ categoryCode: 'traffic', windowMinutes: 90, limit: 200 }),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM (
           SELECT r.location_id, r.category_id
           FROM reports r
           WHERE r.status IN ('submitted','active','confirmed','stale')
             AND r.visibility = 'public'
             AND r.created_at > NOW() - INTERVAL '24 hours'
           GROUP BY r.location_id, r.category_id, r.user_id
           HAVING COUNT(*) >= 3
         ) d`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM reports
         WHERE confirmed_inaccurate_count >= 2
           AND status IN ('submitted','active','confirmed','stale','flagged')`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM official_sync_runs
         WHERE status = 'failed' AND started_at > NOW() - INTERVAL '14 days'`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM official_sources
         WHERE status IN ('active','approved')
           AND (last_success_at IS NULL
                OR last_success_at < NOW() - (sync_interval_minutes || ' minutes')::interval * 3)`
      ),
    ]);

  const f = freshness.rows[0] || {};
  return {
    freshReports: f.fresh || 0,
    recentReports: f.recent || 0,
    agingReports: f.aging || 0,
    staleReports: f.stale || 0,
    expiredReports: f.expired || 0,
    awaitingReview: awaiting.rows[0]?.c || 0,
    conflictingGroups: conflicts.length,
    highDuplicationAreas: highDup.rows[0]?.c || 0,
    repeatedCorrections: corrections.rows[0]?.c || 0,
    failedOfficialSyncs: syncFail.rows[0]?.c || 0,
    sourcesNotSyncedRecently: staleSources.rows[0]?.c || 0,
  };
}

export async function adminListByFreshness({
  freshnessState,
  category,
  stateId,
  lgaId,
  areaId,
  sourceType,
  from,
  to,
  limit = 40,
  offset = 0,
} = {}) {
  const params = [];
  const where = [`r.status <> 'removed'`];

  if (category) {
    params.push(category);
    where.push(`c.code = $${params.length}`);
  }
  if (stateId) {
    params.push(stateId);
    where.push(`loc.state_id = $${params.length}`);
  }
  if (lgaId) {
    params.push(lgaId);
    where.push(`loc.lga_id = $${params.length}`);
  }
  if (areaId) {
    params.push(areaId);
    where.push(`loc.area_id = $${params.length}`);
  }
  if (sourceType) {
    params.push(sourceType);
    where.push(`r.source_type = $${params.length}::report_source_type`);
  }
  if (from) {
    params.push(from);
    where.push(`r.created_at >= $${params.length}::timestamptz`);
  }
  if (to) {
    params.push(to);
    where.push(`r.created_at <= $${params.length}::timestamptz`);
  }

  if (freshnessState === 'expired') {
    where.push(`(r.status = 'expired' OR (r.expires_at IS NOT NULL AND r.expires_at <= NOW()))`);
  } else if (freshnessState === 'stale') {
    where.push(`r.status = 'stale'`);
  } else if (freshnessState === 'fresh') {
    where.push(`r.status IN ('submitted','active','confirmed')`);
    where.push(`(r.expires_at IS NULL OR r.expires_at > NOW())`);
    where.push(
      `COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) > NOW() - make_interval(mins => COALESCE(p.fresh_within_minutes, 60))`
    );
  } else if (freshnessState === 'recent') {
    where.push(`r.status IN ('submitted','active','confirmed')`);
    where.push(`(r.expires_at IS NULL OR r.expires_at > NOW())`);
    where.push(
      `COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) <= NOW() - make_interval(mins => COALESCE(p.fresh_within_minutes, 60))`
    );
    where.push(
      `COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) > NOW() - make_interval(mins => COALESCE(p.recent_within_minutes, 180))`
    );
  } else if (freshnessState === 'aging') {
    where.push(`r.status IN ('submitted','active','confirmed')`);
    where.push(`(r.expires_at IS NULL OR r.expires_at > NOW())`);
    where.push(
      `COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) <= NOW() - make_interval(mins => COALESCE(p.recent_within_minutes, 180))`
    );
    where.push(
      `COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) > NOW() - make_interval(mins => p.stale_after_minutes)`
    );
  }

  params.push(Math.min(Number(limit) || 40, 100), Number(offset) || 0);

  const result = await getPool().query(
    `SELECT r.id, r.title, r.status, r.source_type, r.occurred_at, r.expires_at,
            r.last_confirmed_at, r.corroboration_count, r.confirmed_accurate_count,
            r.confirmed_inaccurate_count, r.quality_updated_at, r.created_at,
            c.code AS category_code, c.name AS category_name,
            loc.name AS location_name,
            p.fresh_within_minutes, p.recent_within_minutes, p.stale_after_minutes
     FROM reports r
     JOIN report_categories c ON c.id = r.category_id
     LEFT JOIN locations loc ON loc.id = r.location_id
     LEFT JOIN category_freshness_policies p ON p.category_id = r.category_id
     WHERE ${where.join(' AND ')}
     ORDER BY COALESCE(r.last_confirmed_at, r.occurred_at, r.created_at) DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return result.rows.map((row) => {
    const quality = buildQualityMetadata(row, row);
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      category: { code: row.category_code, name: row.category_name },
      locationName: row.location_name,
      quality,
      about: buildAboutLines(quality),
      createdAt: row.created_at,
    };
  });
}

export const dataQualityService = {
  formatAgeLabel,
  sourceFromType,
  verificationFromRow,
  corroborationLabel,
  computeFreshnessState,
  computeFreshnessLabel,
  computeTrustLabels,
  buildQualityMetadata,
  buildAboutLines,
  getPolicyForCategory,
  countIndependentCorroboration,
  refreshCorroborationForReport,
  findConflicts,
  conflictForReport,
  applyFreshnessTransitions,
  adminQualitySummary,
  adminListByFreshness,
  loadPolicies,
};

export default dataQualityService;
