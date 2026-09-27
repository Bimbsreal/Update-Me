/**
 * Lightweight in-process API metrics + hourly DB rollup.
 * No PII, no bodies, no query strings.
 */
import { getPool } from '../db/pool.js';

const SLOW_MS = Number(process.env.SLOW_REQUEST_MS || 800);
const FLUSH_MS = Number(process.env.METRICS_FLUSH_MS || 60_000);
const RETENTION_DAYS = Number(process.env.API_METRICS_RETENTION_DAYS || 14);

/** @type {Map<string, object>} */
const buckets = new Map();
/** Ring buffer of recent durations for live-window percentiles (no PII). */
const LATENCY_SAMPLES = [];
const LATENCY_SAMPLE_CAP = 800;
let flushTimer = null;
let startedAt = Date.now();

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function pushLatencySample(durationMs) {
  const n = Math.max(0, Math.round(Number(durationMs) || 0));
  LATENCY_SAMPLES.push(n);
  if (LATENCY_SAMPLES.length > LATENCY_SAMPLE_CAP) {
    LATENCY_SAMPLES.splice(0, LATENCY_SAMPLES.length - LATENCY_SAMPLE_CAP);
  }
}

function hourBucket(d = new Date()) {
  const x = new Date(d);
  x.setUTCMinutes(0, 0, 0);
  return x.toISOString();
}

function pathGroup(path) {
  if (!path) return '*';
  // Collapse UUIDs and numeric ids for cardinality control
  return String(path)
    .split('?')[0]
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      ':id'
    )
    .replace(/\/\d+/g, '/:id')
    .slice(0, 120);
}

function key(bucket, method, group) {
  return `${bucket}|${method}|${group}`;
}

export function recordHttpMetric({ method, path, status, durationMs }) {
  const bucket = hourBucket();
  const group = pathGroup(path);
  const m = String(method || 'GET').toUpperCase();
  const k = key(bucket, m, group);
  let row = buckets.get(k);
  if (!row) {
    row = {
      bucketStart: bucket,
      method: m,
      pathGroup: group,
      requestCount: 0,
      error4xx: 0,
      error5xx: 0,
      slowCount: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
    };
    buckets.set(k, row);
  }
  row.requestCount += 1;
  row.totalDurationMs += durationMs || 0;
  row.maxDurationMs = Math.max(row.maxDurationMs, durationMs || 0);
  if (status >= 500) row.error5xx += 1;
  else if (status >= 400) row.error4xx += 1;
  if ((durationMs || 0) >= SLOW_MS) row.slowCount += 1;
  pushLatencySample(durationMs);
}

export async function flushMetrics() {
  if (!buckets.size) return { flushed: 0 };
  const rows = [...buckets.values()];
  buckets.clear();
  const pool = getPool();
  let flushed = 0;
  for (const row of rows) {
    try {
      await pool.query(
        `INSERT INTO api_metrics_hourly (
           bucket_start, method, path_group, request_count, error_4xx, error_5xx,
           slow_count, total_duration_ms, max_duration_ms
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (bucket_start, method, path_group) DO UPDATE SET
           request_count = api_metrics_hourly.request_count + EXCLUDED.request_count,
           error_4xx = api_metrics_hourly.error_4xx + EXCLUDED.error_4xx,
           error_5xx = api_metrics_hourly.error_5xx + EXCLUDED.error_5xx,
           slow_count = api_metrics_hourly.slow_count + EXCLUDED.slow_count,
           total_duration_ms = api_metrics_hourly.total_duration_ms + EXCLUDED.total_duration_ms,
           max_duration_ms = GREATEST(api_metrics_hourly.max_duration_ms, EXCLUDED.max_duration_ms)`,
        [
          row.bucketStart,
          row.method,
          row.pathGroup,
          row.requestCount,
          row.error4xx,
          row.error5xx,
          row.slowCount,
          row.totalDurationMs,
          row.maxDurationMs,
        ]
      );
      flushed += 1;
    } catch (error) {
      // Re-queue on failure so we don't lose the sample entirely
      const k = key(row.bucketStart, row.method, row.pathGroup);
      const existing = buckets.get(k);
      if (existing) {
        existing.requestCount += row.requestCount;
        existing.error4xx += row.error4xx;
        existing.error5xx += row.error5xx;
        existing.slowCount += row.slowCount;
        existing.totalDurationMs += row.totalDurationMs;
        existing.maxDurationMs = Math.max(existing.maxDurationMs, row.maxDurationMs);
      } else {
        buckets.set(k, row);
      }
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'metrics_flush_failed',
          error: error?.message,
        })
      );
    }
  }
  return { flushed };
}

export async function purgeOldMetrics({ olderThanDays = RETENTION_DAYS } = {}) {
  const days = Math.max(3, Number(olderThanDays) || 14);
  const result = await getPool().query(
    `DELETE FROM api_metrics_hourly
     WHERE bucket_start < NOW() - ($1 || ' days')::interval`,
    [String(days)]
  );
  return { deleted: result.rowCount || 0, retentionDays: days };
}

export async function getRecentMetricsSummary({ hours = 24 } = {}) {
  const h = Math.min(Math.max(Number(hours) || 24, 1), 168);
  const result = await getPool().query(
    `SELECT
       COALESCE(SUM(request_count), 0)::int AS requests,
       COALESCE(SUM(error_4xx), 0)::int AS error_4xx,
       COALESCE(SUM(error_5xx), 0)::int AS error_5xx,
       COALESCE(SUM(slow_count), 0)::int AS slow,
       COALESCE(MAX(max_duration_ms), 0)::int AS max_duration_ms,
       CASE WHEN COALESCE(SUM(request_count), 0) > 0
         THEN ROUND(SUM(total_duration_ms)::numeric / SUM(request_count))
         ELSE 0 END AS avg_duration_ms
     FROM api_metrics_hourly
     WHERE bucket_start > NOW() - ($1 || ' hours')::interval`,
    [String(h)]
  );
  const row = result.rows[0] || {};
  const sorted = [...LATENCY_SAMPLES].sort((a, b) => a - b);
  const latency =
    sorted.length >= 5
      ? {
          sampleSize: sorted.length,
          p50: percentile(sorted, 50),
          p95: percentile(sorted, 95),
          p99: percentile(sorted, 99),
          note: 'Percentiles from recent in-process samples (live window), not historical hourly rollups.',
        }
      : {
          sampleSize: sorted.length,
          p50: null,
          p95: null,
          p99: null,
          note: 'Insufficient live samples for percentiles; avg/max from hourly rollups still available.',
        };

  return {
    windowHours: h,
    requests: row.requests || 0,
    error4xx: row.error_4xx || 0,
    error5xx: row.error_5xx || 0,
    slow: row.slow || 0,
    avgDurationMs: Number(row.avg_duration_ms) || 0,
    maxDurationMs: row.max_duration_ms || 0,
    latency,
    pendingInMemory: buckets.size,
    processUptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  };
}

export function startMetricsFlusher() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushMetrics().catch(() => {});
  }, FLUSH_MS);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

export function stopMetricsFlusher() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export const metricsService = {
  recordHttpMetric,
  flushMetrics,
  purgeOldMetrics,
  getRecentMetricsSummary,
  startMetricsFlusher,
  stopMetricsFlusher,
  SLOW_MS,
};
