/**
 * Analytics & Operational Intelligence
 * Separates Product Analytics | Operational Monitoring | Data Quality Analytics.
 * Aggregate-only product metrics. No invasive profiling.
 */
import { createHash } from 'node:crypto';
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import { metricsService } from './metricsService.js';
import { listRecentJobRuns, latestJobRunByName, JOB_NAMES } from './jobMonitor.js';

const FEATURE_PATH_MAP = [
  { re: /^\/api\/v1\/traffic/, feature: 'traffic' },
  { re: /^\/api\/v1\/fuel/, feature: 'fuel' },
  { re: /^\/api\/v1\/prices/, feature: 'prices' },
  { re: /^\/api\/v1\/fx/, feature: 'fx' },
  { re: /^\/api\/v1\/official/, feature: 'official' },
  { re: /^\/api\/v1\/search/, feature: 'search' },
  { re: /^\/api\/v1\/notifications/, feature: 'notifications' },
  { re: /^\/api\/v1\/locations/, feature: 'locations' },
  { re: /^\/api\/v1\/home/, feature: 'home' },
  { re: /^\/api\/v1\/explore/, feature: 'explore' },
];

export function featureFromPath(path) {
  const p = String(path || '').split('?')[0];
  for (const entry of FEATURE_PATH_MAP) {
    if (entry.re.test(p)) return entry.feature;
  }
  if (p.startsWith('/api/v1/admin')) return 'admin';
  if (p.startsWith('/api/v1/auth')) return 'auth';
  return 'other';
}

export function parseRange(range = '7d', custom = {}) {
  const now = new Date();
  const end = custom.to ? new Date(custom.to) : now;
  let start;
  const key = String(range || '7d');
  if (key === 'today') {
    start = new Date(end);
    start.setHours(0, 0, 0, 0);
  } else if (key === 'yesterday') {
    start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 1);
    end.setHours(0, 0, 0, 0);
  } else if (key === '30d') {
    start = new Date(end.getTime() - 30 * 86400000);
  } else if (key === '90d') {
    start = new Date(end.getTime() - 90 * 86400000);
  } else if (key === 'custom' && custom.from) {
    start = new Date(custom.from);
  } else {
    start = new Date(end.getTime() - 7 * 86400000);
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new AppError('Invalid analytics date range.', 400, 'VALIDATION_ERROR');
  }
  return {
    range: key,
    start,
    end,
    label:
      key === 'today'
        ? 'Today'
        : key === 'yesterday'
          ? 'Yesterday'
          : key === '30d'
            ? 'Last 30 days'
            : key === '90d'
              ? 'Last 90 days'
              : key === 'custom'
                ? 'Custom range'
                : 'Last 7 days',
  };
}

function redactMessage(msg) {
  return String(msg || 'Error')
    .replace(/postgres:\/\/[^\s]+/gi, '[redacted-db]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=[redacted]')
    .replace(/password[=:]\s*\S+/gi, 'password=[redacted]')
    .slice(0, 400);
}

export function errorFingerprint({ errorType, message, endpoint, statusCode }) {
  const base = [
    String(errorType || 'Error'),
    redactMessage(message).replace(/\d+/g, 'N').slice(0, 120),
    String(endpoint || '*').replace(/[0-9a-f-]{36}/gi, ':id'),
    String(statusCode || 0),
  ].join('|');
  return createHash('sha256').update(base).digest('hex').slice(0, 40);
}

export const analyticsService = {
  featureFromPath,
  parseRange,

  async recordFeatureHit(path) {
    try {
      const feature = featureFromPath(path);
      if (feature === 'other' || feature === 'admin' || feature === 'auth') return;
      await getPool().query(
        `INSERT INTO feature_usage_daily (day, feature, hit_count, updated_at)
         VALUES ((CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date, $1, 1, NOW())
         ON CONFLICT (day, feature) DO UPDATE SET
           hit_count = feature_usage_daily.hit_count + 1,
           updated_at = NOW()`,
        [feature]
      );
    } catch {
      /* never break requests */
    }
  },

  async recordUserActivity(userId) {
    if (!userId) return;
    try {
      await getPool().query(
        `INSERT INTO user_activity_daily (day, user_id)
         VALUES ((CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date, $1)
         ON CONFLICT DO NOTHING`,
        [userId]
      );
    } catch {
      /* ignore */
    }
  },

  async recordErrorGroup({
    errorType,
    message,
    endpoint,
    statusCode,
    requestId,
    environment = process.env.NODE_ENV || 'development',
  }) {
    try {
      const sample = redactMessage(message);
      const fingerprint = errorFingerprint({
        errorType,
        message: sample,
        endpoint,
        statusCode,
      });
      const feature = featureFromPath(endpoint);
      await getPool().query(
        `INSERT INTO app_error_groups (
           fingerprint, error_type, message_sample, endpoint, feature, status_code,
           occurrence_count, last_request_id, environment
         ) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8)
         ON CONFLICT (fingerprint) DO UPDATE SET
           occurrence_count = app_error_groups.occurrence_count + 1,
           last_seen_at = NOW(),
           last_request_id = EXCLUDED.last_request_id,
           message_sample = EXCLUDED.message_sample`,
        [
          fingerprint,
          String(errorType || 'Error').slice(0, 80),
          sample,
          endpoint ? String(endpoint).slice(0, 160) : null,
          feature,
          statusCode || null,
          requestId ? String(requestId).slice(0, 128) : null,
          String(environment).slice(0, 40),
        ]
      );
    } catch {
      /* ignore */
    }
  },

  async overview(rangeInput = {}) {
    const range = this.parseRange(rangeInput.range, rangeInput);
    const pool = getPool();
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();

    const [
      users,
      activity,
      searches,
      reports,
      notifications,
      quality,
      api,
      features,
    ] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= $1 AND created_at <= $2)::int AS new_users,
           COUNT(*)::int AS total_users
         FROM users`,
        [startIso, endIso]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE day = (CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date)::int AS dau,
           COUNT(DISTINCT user_id) FILTER (
             WHERE day >= (CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date - 6
           )::int AS wau,
           COUNT(DISTINCT user_id) FILTER (
             WHERE day >= (CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date - 29
           )::int AS mau
         FROM user_activity_daily`
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS searches,
           COUNT(*) FILTER (WHERE zero_result)::int AS zero_results,
           COUNT(*) FILTER (WHERE NOT zero_result)::int AS with_results,
           COALESCE(AVG(latency_ms), 0)::int AS avg_latency_ms
         FROM search_query_metrics
         WHERE created_at >= $1 AND created_at <= $2`,
        [startIso, endIso]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= $1 AND created_at <= $2)::int AS reports_created,
           COUNT(*) FILTER (WHERE status IN ('submitted','active','confirmed'))::int AS active_reports,
           COUNT(*) FILTER (WHERE status = 'stale')::int AS stale_reports
         FROM reports`,
        [startIso, endIso]
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= $1 AND created_at <= $2)::int AS generated,
           COUNT(*) FILTER (WHERE status = 'delivered' AND created_at >= $1 AND created_at <= $2)::int AS delivered,
           COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= $1 AND created_at <= $2)::int AS failed,
           COUNT(*) FILTER (WHERE read_at IS NOT NULL AND created_at >= $1 AND created_at <= $2)::int AS read
         FROM notifications`,
        [startIso, endIso]
      ).catch(() => ({ rows: [{}] })),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'open')::int AS open_events,
           COUNT(*) FILTER (WHERE event_type = 'anomaly_detected' AND status = 'open')::int AS anomalies,
           COUNT(*) FILTER (WHERE event_type = 'conflict_detected' AND status = 'open')::int AS conflicts
         FROM quality_events`
      ).catch(() => ({ rows: [{}] })),
      metricsService.getRecentMetricsSummary({
        hours: Math.min(24 * 90, Math.ceil((range.end - range.start) / 3600000) || 24),
      }),
      pool.query(
        `SELECT feature, SUM(hit_count)::int AS hits
         FROM feature_usage_daily
         WHERE day >= $1::date AND day <= $2::date
         GROUP BY feature
         ORDER BY hits DESC`,
        [range.start.toISOString().slice(0, 10), range.end.toISOString().slice(0, 10)]
      ),
    ]);

    return {
      plane: 'overview',
      range,
      lastUpdated: new Date().toISOString(),
      dataMode: 'aggregated',
      platform: {
        totalUsers: Number(users.rows[0]?.total_users) || 0,
        newUsers: Number(users.rows[0]?.new_users) || 0,
        dau: Number(activity.rows[0]?.dau) || 0,
        wau: Number(activity.rows[0]?.wau) || 0,
        mau: Number(activity.rows[0]?.mau) || 0,
        searches: Number(searches.rows[0]?.searches) || 0,
        searchesWithResults: Number(searches.rows[0]?.with_results) || 0,
        zeroResultSearches: Number(searches.rows[0]?.zero_results) || 0,
        searchAvgLatencyMs: Number(searches.rows[0]?.avg_latency_ms) || 0,
      },
      data: {
        reportsCreated: Number(reports.rows[0]?.reports_created) || 0,
        activeReports: Number(reports.rows[0]?.active_reports) || 0,
        staleReports: Number(reports.rows[0]?.stale_reports) || 0,
      },
      quality: {
        openEvents: Number(quality.rows[0]?.open_events) || 0,
        anomalies: Number(quality.rows[0]?.anomalies) || 0,
        conflicts: Number(quality.rows[0]?.conflicts) || 0,
      },
      notifications: {
        generated: Number(notifications.rows[0]?.generated) || 0,
        delivered: Number(notifications.rows[0]?.delivered) || 0,
        failed: Number(notifications.rows[0]?.failed) || 0,
        read: Number(notifications.rows[0]?.read) || 0,
      },
      operations: {
        apiRequests: api.requests || 0,
        error5xx: api.error5xx || 0,
        error4xx: api.error4xx || 0,
        slow: api.slow || 0,
        avgLatencyMs: api.avgDurationMs || 0,
        maxLatencyMs: api.maxDurationMs || 0,
        latency: api.latency || null,
      },
      featureUsage: features.rows,
      note: 'Overview mixes high-level cards only. Use Product / Operations / Data Quality tabs for detail.',
    };
  },

  async productAnalytics(rangeInput = {}) {
    const range = this.parseRange(rangeInput.range, rangeInput);
    const pool = getPool();
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();
    const startDay = range.start.toISOString().slice(0, 10);
    const endDay = range.end.toISOString().slice(0, 10);

    const [activityTrend, registrations, features, searches] = await Promise.all([
      pool.query(
        `SELECT day::text, COUNT(*)::int AS active_users
         FROM user_activity_daily
         WHERE day >= $1::date AND day <= $2::date
         GROUP BY day ORDER BY day`,
        [startDay, endDay]
      ),
      pool.query(
        `SELECT date_trunc('day', created_at AT TIME ZONE 'Africa/Lagos')::date::text AS day,
                COUNT(*)::int AS registrations
         FROM users
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY 1 ORDER BY 1`,
        [startIso, endIso]
      ),
      pool.query(
        `SELECT feature, SUM(hit_count)::int AS hits
         FROM feature_usage_daily
         WHERE day >= $1::date AND day <= $2::date
         GROUP BY feature ORDER BY hits DESC`,
        [startDay, endDay]
      ),
      pool.query(
        `SELECT COALESCE(category, 'all') AS category, COUNT(*)::int AS hits,
                COUNT(*) FILTER (WHERE zero_result)::int AS zero_results
         FROM search_query_metrics
         WHERE created_at >= $1 AND created_at <= $2
         GROUP BY COALESCE(category, 'all')
         ORDER BY hits DESC`,
        [startIso, endIso]
      ),
    ]);

    return {
      plane: 'product',
      range,
      lastUpdated: new Date().toISOString(),
      dataMode: 'aggregated',
      privacy:
        'Product analytics are aggregate-only. No individual search histories, coordinates, or device fingerprints.',
      activityTrend: activityTrend.rows,
      registrations: registrations.rows,
      featureUsage: features.rows,
      searchCategories: searches.rows,
    };
  },

  async domainAnalytics(domain, rangeInput = {}) {
    const range = this.parseRange(rangeInput.range, rangeInput);
    const pool = getPool();
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();
    const code = String(domain || '').toLowerCase();

    if (code === 'traffic') {
      const r = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE r.created_at >= $1 AND r.created_at <= $2)::int AS received,
           COUNT(*) FILTER (WHERE r.status IN ('submitted','active','confirmed'))::int AS active,
           COUNT(*) FILTER (WHERE r.status IN ('expired','stale') AND r.updated_at >= $1)::int AS resolved_or_stale,
           COUNT(*) FILTER (WHERE r.source_type = 'official' AND r.created_at >= $1 AND r.created_at <= $2)::int AS official,
           COUNT(*) FILTER (WHERE r.source_type = 'community' AND r.created_at >= $1 AND r.created_at <= $2)::int AS community
         FROM reports r
         JOIN report_categories c ON c.id = r.category_id
         WHERE c.code = 'traffic'`,
        [startIso, endIso]
      );
      const byType = await pool.query(
        `SELECT COALESCE(tr.severity::text, 'unknown') AS type, COUNT(*)::int AS c
         FROM traffic_reports tr
         JOIN reports r ON r.id = tr.report_id
         WHERE r.created_at >= $1 AND r.created_at <= $2
         GROUP BY 1 ORDER BY c DESC LIMIT 12`,
        [startIso, endIso]
      );
      return {
        plane: 'domain',
        domain: 'traffic',
        range,
        lastUpdated: new Date().toISOString(),
        dataMode: 'aggregated',
        metrics: r.rows[0],
        byType: byType.rows,
      };
    }

    if (code === 'fuel') {
      const [r, byProduct, byState, freshness] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS observations
           FROM fuel_reports fr
           JOIN reports r ON r.id = fr.report_id
           WHERE r.created_at >= $1 AND r.created_at <= $2`,
          [startIso, endIso]
        ).catch(() => ({ rows: [{ observations: 0 }] })),
        pool.query(
          `SELECT fr.fuel_type::text AS product, fr.price_unit AS unit, COUNT(*)::int AS c
           FROM fuel_reports fr
           JOIN reports r ON r.id = fr.report_id
           WHERE r.created_at >= $1 AND r.created_at <= $2
           GROUP BY fr.fuel_type, fr.price_unit
           ORDER BY c DESC`,
          [startIso, endIso]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT COALESCE(s.name, 'Unknown') AS state, COUNT(*)::int AS c
           FROM fuel_reports fr
           JOIN reports r ON r.id = fr.report_id
           LEFT JOIN locations loc ON loc.id = r.location_id
           LEFT JOIN states s ON s.id = loc.state_id
           WHERE r.created_at >= $1 AND r.created_at <= $2
           GROUP BY 1 ORDER BY c DESC LIMIT 20`,
          [startIso, endIso]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE r.status IN ('active','confirmed','submitted'))::int AS freshish,
             COUNT(*) FILTER (WHERE r.status = 'stale')::int AS stale,
             COUNT(*) FILTER (WHERE r.status = 'expired')::int AS expired
           FROM fuel_reports fr
           JOIN reports r ON r.id = fr.report_id`
        ).catch(() => ({ rows: [{}] })),
      ]);
      return {
        plane: 'domain',
        domain: 'fuel',
        range,
        lastUpdated: new Date().toISOString(),
        dataMode: 'aggregated',
        metrics: {
          observations: Number(r.rows[0]?.observations) || 0,
          ...freshness.rows[0],
        },
        byProduct: byProduct.rows,
        byState: byState.rows,
        note: 'Product/unit/location/source preserved on underlying observations — not mixed here.',
      };
    }

    if (code === 'prices' || code === 'commodities') {
      const [r, byCommodity, byMarket, coverage] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS observations
           FROM commodity_price_reports cpr
           JOIN reports r ON r.id = cpr.report_id
           WHERE r.created_at >= $1 AND r.created_at <= $2`,
          [startIso, endIso]
        ).catch(() => ({ rows: [{ observations: 0 }] })),
        pool.query(
          `SELECT c.name AS commodity, COUNT(*)::int AS c
           FROM commodity_price_reports cpr
           JOIN commodities c ON c.id = cpr.commodity_id
           JOIN reports r ON r.id = cpr.report_id
           WHERE r.created_at >= $1 AND r.created_at <= $2
           GROUP BY c.name ORDER BY c DESC LIMIT 20`,
          [startIso, endIso]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT COALESCE(pp.name, 'Unknown market') AS market, COUNT(*)::int AS c
           FROM commodity_price_reports cpr
           LEFT JOIN price_places pp ON pp.id = cpr.place_id
           JOIN reports r ON r.id = cpr.report_id
           WHERE r.created_at >= $1 AND r.created_at <= $2
           GROUP BY 1 ORDER BY c DESC LIMIT 20`,
          [startIso, endIso]
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT COALESCE(s.name, 'Unknown') AS state, COUNT(*)::int AS observations
           FROM commodity_price_reports cpr
           JOIN reports r ON r.id = cpr.report_id
           LEFT JOIN locations loc ON loc.id = r.location_id
           LEFT JOIN states s ON s.id = loc.state_id
           WHERE r.created_at >= $1 AND r.created_at <= $2
           GROUP BY 1 ORDER BY observations ASC LIMIT 20`,
          [startIso, endIso]
        ).catch(() => ({ rows: [] })),
      ]);
      return {
        plane: 'domain',
        domain: 'commodities',
        range,
        lastUpdated: new Date().toISOString(),
        dataMode: 'aggregated',
        metrics: { observations: Number(r.rows[0]?.observations) || 0 },
        byCommodity: byCommodity.rows,
        byMarket: byMarket.rows,
        weakCoverageByState: coverage.rows,
        note: 'Weak-coverage list is sorted ascending to highlight sparse locations.',
      };
    }

    if (code === 'fx') {
      const [r, bySource] = await Promise.all([
        pool.query(
          `SELECT base_currency || '/' || quote_currency AS pair,
                  COUNT(*)::int AS observations,
                  MAX(observed_at) AS latest
           FROM fx_observations
           WHERE observed_at >= $1 AND observed_at <= $2
           GROUP BY 1 ORDER BY observations DESC`,
          [startIso, endIso]
        ),
        pool.query(
          `SELECT source_id AS source, rate_type::text AS rate_type,
                  COUNT(*)::int AS observations,
                  MAX(observed_at) AS latest
           FROM fx_observations
           WHERE observed_at >= $1 AND observed_at <= $2
           GROUP BY source_id, rate_type
           ORDER BY observations DESC`,
          [startIso, endIso]
        ).catch(() => ({ rows: [] })),
      ]);
      return {
        plane: 'domain',
        domain: 'fx',
        range,
        lastUpdated: new Date().toISOString(),
        dataMode: 'aggregated',
        pairs: r.rows,
        bySource: bySource.rows,
        note: 'Different FX sources/types are not a single universal market rate.',
      };
    }

    if (code === 'official') {
      const r = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at >= $1 AND created_at <= $2)::int AS ingested,
           COUNT(*) FILTER (WHERE status = 'published')::int AS published,
           COUNT(*) FILTER (WHERE processing_status IN ('pending_review','needs_attention'))::int AS pending,
           COUNT(*) FILTER (WHERE processing_status = 'rejected' OR status = 'hidden')::int AS rejected
         FROM official_updates`,
        [startIso, endIso]
      ).catch(() => ({ rows: [{}] }));
      return {
        plane: 'domain',
        domain: 'official',
        range,
        lastUpdated: new Date().toISOString(),
        dataMode: 'aggregated',
        metrics: r.rows[0],
        note: 'Agencies are not ranked by political importance.',
      };
    }

    if (code === 'search') {
      const { searchAdminService } = await import('./searchAdminService.js');
      const dash = await searchAdminService.dashboard({
        days: Math.min(90, Math.ceil((range.end - range.start) / 86400000) || 7),
      });
      return {
        plane: 'domain',
        domain: 'search',
        range,
        lastUpdated: new Date().toISOString(),
        dataMode: 'aggregated',
        metrics: dash.metrics,
        categories: dash.categories,
        zeroResultQueries: dash.zeroResultQueries,
        privacy: 'Normalized queries only — no private per-user history.',
      };
    }

    if (code === 'notifications') {
      const { notificationAdminService } = await import('./notificationAdminService.js');
      const dash = await notificationAdminService.dashboard();
      return {
        plane: 'domain',
        domain: 'notifications',
        range,
        lastUpdated: new Date().toISOString(),
        dataMode: 'aggregated',
        metrics: dash.metrics,
        privacy: 'No notification message bodies in analytics.',
      };
    }

    throw new AppError('Unknown analytics domain.', 400, 'VALIDATION_ERROR');
  },

  async operationsAnalytics() {
    const [healthMod, metrics, jobs, errors, signals] = await Promise.all([
      import('./systemHealthService.js').then((m) => m.systemHealthService.getSystemHealth()),
      metricsService.getRecentMetricsSummary({ hours: 24 }),
      listRecentJobRuns({ limit: 30 }),
      getPool().query(
        `SELECT id, fingerprint, error_type, message_sample, endpoint, feature, status_code,
                occurrence_count, first_seen_at, last_seen_at, last_request_id
         FROM app_error_groups
         ORDER BY last_seen_at DESC
         LIMIT 40`
      ),
      getPool().query(
        `SELECT code, severity, title, message, component, active, first_seen_at, last_seen_at,
                last_alerted_at, alert_count, cooldown_minutes, resolved_at
         FROM operational_signals
         ORDER BY active DESC, severity DESC, last_seen_at DESC
         LIMIT 40`
      ),
    ]);

    const latestJobs = await latestJobRunByName(Object.values(JOB_NAMES));

    return {
      plane: 'operations',
      lastUpdated: new Date().toISOString(),
      dataMode: metrics.latency ? 'live_window' : 'aggregated',
      health: {
        status: healthMod.status,
        checkedAt: healthMod.checkedAt,
        database: healthMod.database,
        postgis: healthMod.postgis,
        signals: healthMod.signals,
        thresholds: healthMod.thresholds,
      },
      api: metrics,
      jobs: {
        recent: jobs,
        latestByName: latestJobs,
      },
      errors: errors.rows.map((e) => ({
        id: e.id,
        fingerprint: e.fingerprint,
        errorType: e.error_type,
        messageSample: e.message_sample,
        endpoint: e.endpoint,
        feature: e.feature,
        statusCode: e.status_code,
        occurrenceCount: e.occurrence_count,
        firstSeenAt: e.first_seen_at,
        lastSeenAt: e.last_seen_at,
        lastRequestId: e.last_request_id,
      })),
      operationalSignals: signals.rows,
      note: 'Operational monitoring — not product engagement scoring.',
    };
  },

  async dataQualityAnalytics() {
    const { qualityIntelligenceService } = await import('./qualityIntelligenceService.js');
    const { dataQualityService } = await import('./dataQualityService.js');
    const [summary, intel, domains] = await Promise.all([
      dataQualityService.adminQualitySummary(),
      qualityIntelligenceService.intelligenceDashboard(),
      Promise.all(
        ['traffic', 'fuel', 'prices', 'fx', 'official', 'locations'].map((d) =>
          qualityIntelligenceService.domainDashboard(d).catch(() => null)
        )
      ),
    ]);
    return {
      plane: 'data_quality',
      lastUpdated: new Date().toISOString(),
      dataMode: 'aggregated',
      summary,
      intelligence: intel,
      domains: domains.filter(Boolean),
      drillDown: '/admin/data-quality',
    };
  },

  async securityAnalytics(rangeInput = {}) {
    const range = this.parseRange(rangeInput.range || '7d', rangeInput);
    const pool = getPool();
    const result = await pool.query(
      `SELECT action, COUNT(*)::int AS c, MAX(created_at) AS last_at
       FROM admin_audit_log
       WHERE created_at >= $1 AND created_at <= $2
         AND (
           action ILIKE '%login%'
           OR action ILIKE '%security%'
           OR action ILIKE '%suspend%'
           OR action ILIKE '%revoke%'
           OR action ILIKE '%rate%'
         )
       GROUP BY action
       ORDER BY c DESC
       LIMIT 30`,
      [range.start.toISOString(), range.end.toISOString()]
    );
    return {
      plane: 'security',
      range,
      lastUpdated: new Date().toISOString(),
      dataMode: 'aggregated',
      events: result.rows,
      note: 'Aggregate security indicators only — not surveillance of ordinary users.',
    };
  },

  async exportReport({ plane = 'overview', range = '7d', format = 'json', from, to } = {}) {
    const rangeInput = { range, from, to };
    let payload;
    if (plane === 'product') payload = await this.productAnalytics(rangeInput);
    else if (plane === 'operations') payload = await this.operationsAnalytics();
    else if (plane === 'data_quality') payload = await this.dataQualityAnalytics();
    else if (plane === 'security') payload = await this.securityAnalytics(rangeInput);
    else payload = await this.overview(rangeInput);

    // Strip any accidental nested secrets
    const safe = JSON.parse(JSON.stringify(payload));
    if (format === 'csv') {
      const rows = flattenForCsv(safe);
      return {
        contentType: 'text/csv; charset=utf-8',
        filename: `updateme-analytics-${plane}-${range}.csv`,
        body: toCsv(rows),
      };
    }
    return {
      contentType: 'application/json; charset=utf-8',
      filename: `updateme-analytics-${plane}-${range}.json`,
      body: JSON.stringify(safe, null, 2),
    };
  },

  /**
   * Emit outbound ops alert only if cooldown elapsed.
   * Uses operational_signals — does not flood.
   */
  async maybeAlertSignal(signal) {
    if (!signal?.code) return { sent: false, reason: 'missing_code' };
    const pool = getPool();
    const existing = await pool.query(`SELECT * FROM operational_signals WHERE code = $1`, [
      signal.code,
    ]);
    const row = existing.rows[0];
    const cooldown = Number(row?.cooldown_minutes || signal.cooldownMinutes || 30);
    if (row?.last_alerted_at) {
      const elapsed = Date.now() - new Date(row.last_alerted_at).getTime();
      if (elapsed < cooldown * 60000 && row.active) {
        return { sent: false, reason: 'cooldown', cooldownMinutes: cooldown };
      }
    }
    await pool.query(
      `UPDATE operational_signals
       SET last_alerted_at = NOW(),
           alert_count = COALESCE(alert_count, 0) + 1
       WHERE code = $1`,
      [signal.code]
    );
    return { sent: true, reason: 'emitted', cooldownMinutes: cooldown };
  },

  async purgeRetention() {
    const pool = getPool();
    const a = await pool.query(
      `DELETE FROM user_activity_daily
       WHERE day < (CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date - 90`
    );
    const b = await pool.query(
      `DELETE FROM feature_usage_daily
       WHERE day < (CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date - 180`
    );
    const c = await pool.query(
      `DELETE FROM app_error_groups
       WHERE last_seen_at < NOW() - INTERVAL '60 days'`
    );
    return {
      activityCleared: a.rowCount || 0,
      featureCleared: b.rowCount || 0,
      errorsCleared: c.rowCount || 0,
    };
  },
};

function flattenForCsv(payload) {
  const rows = [];
  const walk = (obj, prefix = '') => {
    if (obj == null) return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => {
        if (item && typeof item === 'object') walk(item, `${prefix}[${i}]`);
        else rows.push({ key: `${prefix}[${i}]`, value: item });
      });
      return;
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object') walk(v, key);
        else rows.push({ key, value: v });
      }
    }
  };
  walk(payload);
  return rows;
}

function toCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return ['key,value', ...rows.map((r) => `${esc(r.key)},${esc(r.value)}`)].join('\n');
}
