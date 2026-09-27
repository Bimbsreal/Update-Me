/**
 * Admin system-health aggregation — authorized diagnostics only.
 * Public health endpoints stay minimal; this never returns secrets.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkDatabaseConnection, getPool } from '../db/pool.js';
import { env } from '../config/env.js';
import { isPostgisEnabled } from '../repositories/locationRepository.js';
import { realtimeBroker } from '../realtime/broker.js';
import { latestJobRunByName, listRecentJobRuns, JOB_NAMES } from './jobMonitor.js';
import { metricsService } from './metricsService.js';
import { listFxProviders } from '../fx/providers/index.js';
import { fxRepository } from '../repositories/fxRepository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readAppVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')
    );
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function migrationStatus() {
  try {
    const applied = await getPool().query(
      `SELECT filename, applied_at FROM schema_migrations ORDER BY filename DESC LIMIT 5`
    );
    const count = await getPool().query(`SELECT COUNT(*)::int AS c FROM schema_migrations`);
    return {
      appliedCount: count.rows[0]?.c || 0,
      latest: applied.rows[0]?.filename || null,
      recent: applied.rows.map((r) => ({
        filename: r.filename,
        appliedAt: r.applied_at,
      })),
    };
  } catch {
    return { appliedCount: 0, latest: null, recent: [], error: 'unavailable' };
  }
}

async function dbLatencyMs() {
  const start = Date.now();
  try {
    await getPool().query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - start, error: 'query_failed' };
  }
}

async function ingestionOverview() {
  const pool = getPool();
  const [sources, lastOk, lastFail] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('active','approved'))::int AS active,
         COUNT(*) FILTER (WHERE consecutive_failures >= 3 OR health_status = 'failing')::int AS failing,
         COUNT(*) FILTER (WHERE health_status = 'warning' OR consecutive_failures BETWEEN 1 AND 2)::int AS degraded
       FROM official_sources`
    ),
    pool.query(
      `SELECT MAX(completed_at) AS at FROM official_sync_runs WHERE status = 'success'`
    ),
    pool.query(
      `SELECT MAX(completed_at) AS at FROM official_sync_runs WHERE status = 'failed'`
    ),
  ]);
  const s = sources.rows[0] || {};
  return {
    sources: {
      total: s.total || 0,
      active: s.active || 0,
      failing: s.failing || 0,
      degraded: s.degraded || 0,
    },
    lastSuccessfulSyncAt: lastOk.rows[0]?.at || null,
    lastFailedSyncAt: lastFail.rows[0]?.at || null,
  };
}

async function providerOverview() {
  const fxState = await fxRepository.getSyncState().catch(() => ({ providers: [] }));
  const providers = listFxProviders().map((p) => {
    const state = (fxState.providers || []).find((x) => x.providerKey === p.key) || {};
    const failures = state.consecutiveFailures || 0;
    let status = 'unknown';
    if (!p.isEnabled) status = 'disabled';
    else if (failures >= 3) status = 'failing';
    else if (failures > 0) status = 'degraded';
    else if (state.lastSuccessAt) status = 'healthy';
    else status = 'idle';

    return {
      key: p.key,
      type: 'fx',
      enabled: Boolean(p.isEnabled),
      status,
      lastSuccessAt: state.lastSuccessAt || null,
      lastAttemptAt: state.lastAttemptAt || null,
      consecutiveFailures: failures,
      lastError: state.lastErrorMessage
        ? String(state.lastErrorMessage).slice(0, 200)
        : null,
      fallback:
        failures > 0 && state.lastSuccessAt
          ? {
              usingLastKnownGood: true,
              lastSuccessAt: state.lastSuccessAt,
              note: 'Serving last successful FX observations; not claimed as live.',
            }
          : null,
    };
  });

  return { fx: providers };
}

/**
 * Compute actionable operational signals (admin-visible thresholds).
 */
async function computeSignals({ dbOk, postgisMissing, metrics, ingestion, jobs, providers }) {
  const signals = [];

  if (!dbOk) {
    signals.push({
      code: 'database_unreachable',
      severity: 'critical',
      title: 'Database unreachable',
      message: 'PostgreSQL connectivity check failed.',
      component: 'database',
    });
  }

  if (dbOk && postgisMissing) {
    signals.push({
      code: 'postgis_missing',
      severity: 'info',
      title: 'PostGIS not installed',
      message: 'Nearby queries use Haversine fallback. Install PostGIS for native spatial indexes.',
      component: 'database',
    });
  }

  if ((metrics.error5xx || 0) >= 20 && (metrics.requests || 0) >= 50) {
    const rate = metrics.requests ? metrics.error5xx / metrics.requests : 0;
    if (rate >= 0.05) {
      signals.push({
        code: 'high_5xx_rate',
        severity: 'warning',
        title: 'Elevated API 5xx rate',
        message: `${metrics.error5xx} server errors in the last ${metrics.windowHours}h (${Math.round(rate * 100)}%).`,
        component: 'api',
      });
    }
  }

  if ((metrics.slow || 0) >= 30) {
    signals.push({
      code: 'many_slow_requests',
      severity: 'info',
      title: 'Many slow requests',
      message: `${metrics.slow} requests exceeded ${metricsService.SLOW_MS}ms in the last ${metrics.windowHours}h.`,
      component: 'api',
    });
  }

  if ((ingestion.sources?.failing || 0) >= 1) {
    signals.push({
      code: 'ingestion_sources_failing',
      severity: ingestion.sources.failing >= 3 ? 'critical' : 'warning',
      title: 'Ingestion sources failing',
      message: `${ingestion.sources.failing} source(s) marked failing.`,
      component: 'ingestion',
    });
  }

  for (const [name, run] of Object.entries(jobs || {})) {
    if (run?.status === 'failed') {
      signals.push({
        code: `job_failed_${name}`,
        severity: 'warning',
        title: `Job failed: ${name}`,
        message: run.errorSummary || 'Last run failed.',
        component: 'jobs',
      });
    }
  }

  for (const p of providers.fx || []) {
    if (p.status === 'failing') {
      signals.push({
        code: `fx_provider_${p.key}`,
        severity: 'warning',
        title: `FX provider unavailable: ${p.key}`,
        message: p.lastError || 'Repeated failures; last-known-good rates may be shown.',
        component: 'providers',
      });
    }
  }

  // Persist active signals (upsert) — best effort
  const pool = getPool();
  const activeCodes = new Set(signals.map((s) => s.code));
  for (const s of signals) {
    try {
      await pool.query(
        `INSERT INTO operational_signals (code, severity, title, message, component, active, last_seen_at, resolved_at)
         VALUES ($1,$2,$3,$4,$5,TRUE,NOW(),NULL)
         ON CONFLICT (code) DO UPDATE SET
           severity = EXCLUDED.severity,
           title = EXCLUDED.title,
           message = EXCLUDED.message,
           component = EXCLUDED.component,
           active = TRUE,
           last_seen_at = NOW(),
           resolved_at = NULL`,
        [s.code, s.severity, s.title, s.message, s.component]
      );
      // Deduped outbound ops alert (cooldown) — does not flood
      try {
        const { analyticsService } = await import('./analyticsService.js');
        await analyticsService.maybeAlertSignal({
          code: s.code,
          cooldownMinutes: s.severity === 'critical' ? 15 : 30,
        });
      } catch {
        /* ignore alert fan-out failures */
      }
    } catch {
      /* table may not exist yet during migrate race */
    }
  }
  try {
    if (activeCodes.size) {
      await pool.query(
        `UPDATE operational_signals
         SET active = FALSE, resolved_at = COALESCE(resolved_at, NOW())
         WHERE active = TRUE
           AND NOT (code = ANY($1::text[]))`,
        [[...activeCodes]]
      );
    }
  } catch {
    /* ignore */
  }

  return signals;
}

function overallStatus({ database, postgis, signals }) {
  if (!database.connected) return 'unhealthy';
  if (signals.some((s) => s.severity === 'critical')) return 'unhealthy';
  if (signals.some((s) => s.severity === 'warning') || !postgis) return 'degraded';
  return 'healthy';
}

export async function getSystemHealth() {
  const [dbCheck, latency, postgis, migrations, metrics, ingestion, providers, recentJobs, latestJobs] =
    await Promise.all([
      checkDatabaseConnection(),
      dbLatencyMs(),
      isPostgisEnabled().catch(() => false),
      migrationStatus(),
      metricsService.getRecentMetricsSummary({ hours: 24 }).catch(() => ({
        requests: 0,
        error4xx: 0,
        error5xx: 0,
        slow: 0,
        windowHours: 24,
      })),
      ingestionOverview().catch(() => ({
        sources: { total: 0, active: 0, failing: 0, degraded: 0 },
      })),
      providerOverview().catch(() => ({ fx: [] })),
      listRecentJobRuns({ limit: 15 }).catch(() => []),
      latestJobRunByName(Object.values(JOB_NAMES)).catch(() => ({})),
    ]);

  const sse = {
    ...realtimeBroker.stats(),
    status: 'ok',
    note: 'In-process SSE; counts reset on process restart.',
  };

  const application = {
    status: 'ok',
    service: 'update-me-api',
    environment: env.NODE_ENV,
    version: readAppVersion(),
    apiPrefix: env.API_PREFIX,
    uptimeSec: metrics.processUptimeSec || null,
  };

  const database = {
    connected: Boolean(dbCheck.connected),
    latencyMs: latency.ok ? latency.latencyMs : null,
    postgis: postgis ? 'enabled' : 'missing',
    migrations,
    // Never expose DB name/version to admin UI in a way that looks like a secret —
    // include only in non-production for ops convenience
    ...(env.NODE_ENV !== 'production' && dbCheck.connected
      ? { serverVersion: dbCheck.version || null }
      : {}),
  };

  const signals = await computeSignals({
    dbOk: database.connected,
    postgisMissing: !postgis,
    metrics,
    ingestion,
    jobs: latestJobs,
    providers,
  });

  const status = overallStatus({
    database,
    postgis,
    signals,
  });

  return {
    status,
    checkedAt: new Date().toISOString(),
    application,
    database,
    jobs: {
      latest: latestJobs,
      recent: recentJobs,
      definitions: [
        {
          name: JOB_NAMES.DATA_QUALITY_TICK,
          description: 'Report freshness / expiry transitions',
          intervalHint: process.env.DATA_QUALITY_TICK_MS || '5m',
        },
        {
          name: JOB_NAMES.FX_SYNC_TICK,
          description: 'FX provider synchronization',
          intervalHint: process.env.FX_SYNC_INTERVAL_MS || '24h',
        },
        {
          name: JOB_NAMES.OFFICIAL_SYNC_TICK,
          description: 'Official / ingestion source synchronization',
          intervalHint: process.env.OFFICIAL_SYNC_TICK_MS || '5m',
        },
        {
          name: JOB_NAMES.OPS_RETENTION,
          description: 'Purge old job runs and API metric buckets',
          intervalHint: 'with data-quality tick (periodic)',
        },
      ],
    },
    ingestion,
    providers,
    sse,
    metrics: {
      ...metrics,
      note: 'Aggregates are coarse path groups; no request bodies or tokens stored.',
    },
    signals,
    thresholds: {
      slowRequestMs: metricsService.SLOW_MS,
      high5xxRate: '≥5% with ≥20 errors / 24h',
      ingestionFailing: '≥1 failing source',
      fxFailing: '≥3 consecutive provider failures',
    },
  };
}

/**
 * Public combined health — healthy / degraded / unhealthy.
 * Optional providers never mark the app unhealthy.
 */
export async function getPublicHealthModel() {
  const database = await checkDatabaseConnection();
  const postgis = database.connected
    ? await isPostgisEnabled().catch(() => false)
    : false;

  let status = 'healthy';
  if (!database.connected) status = 'unhealthy';
  else if (!postgis) status = 'degraded';

  return {
    success: status !== 'unhealthy',
    status,
    service: 'update-me-api',
    timestamp: new Date().toISOString(),
    checks: {
      database: database.connected ? 'up' : 'down',
      postgis: database.connected ? (postgis ? 'enabled' : 'missing') : 'unknown',
    },
  };
}

export const systemHealthService = {
  getSystemHealth,
  getPublicHealthModel,
};
