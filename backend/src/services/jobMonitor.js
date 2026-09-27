/**
 * Background job run recorder — shared by schedulers.
 * Does not replace FX/official per-source sync_runs tables.
 */
import { randomUUID } from 'crypto';
import { getPool } from '../db/pool.js';

const RETENTION_DAYS = Number(process.env.JOB_RUNS_RETENTION_DAYS || 30);

function safeSummary(err) {
  const msg = String(err?.message || err || 'unknown error').slice(0, 500);
  // Never leak connection strings / tokens from error text
  return msg
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted-db-url]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=[redacted]');
}

export async function startJobRun(jobName, { trigger = 'schedule', details = {} } = {}) {
  const executionId = randomUUID();
  const pool = getPool();
  try {
    const result = await pool.query(
      `INSERT INTO job_runs (job_name, execution_id, trigger, status, details)
       VALUES ($1, $2, $3, 'running', $4::jsonb)
       RETURNING id, execution_id, started_at`,
      [jobName, executionId, trigger, JSON.stringify(details || {})]
    );
    return {
      id: result.rows[0].id,
      executionId: result.rows[0].execution_id,
      startedAt: result.rows[0].started_at,
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'job_run_start_failed',
        jobName,
        error: safeSummary(error),
      })
    );
    return { id: null, executionId, startedAt: new Date() };
  }
}

export async function finishJobRun(
  run,
  {
    status = 'success',
    recordsProcessed = 0,
    recordsCreated = 0,
    recordsUpdated = 0,
    recordsSkipped = 0,
    recordsFailed = 0,
    errorSummary = null,
    details = null,
  } = {}
) {
  if (!run?.id) return null;
  const finishedAt = new Date();
  const started = run.startedAt ? new Date(run.startedAt).getTime() : Date.now();
  const durationMs = Math.max(0, finishedAt.getTime() - started);

  try {
    await getPool().query(
      `UPDATE job_runs SET
         status = $2,
         finished_at = $3,
         duration_ms = $4,
         records_processed = $5,
         records_created = $6,
         records_updated = $7,
         records_skipped = $8,
         records_failed = $9,
         error_summary = $10,
         details = CASE WHEN $11::jsonb IS NULL THEN details ELSE details || $11::jsonb END
       WHERE id = $1`,
      [
        run.id,
        status,
        finishedAt.toISOString(),
        durationMs,
        recordsProcessed || 0,
        recordsCreated || 0,
        recordsUpdated || 0,
        recordsSkipped || 0,
        recordsFailed || 0,
        errorSummary ? safeSummary(errorSummary) : null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'job_run_finish_failed',
        jobName: run.jobName,
        executionId: run.executionId,
        error: safeSummary(error),
      })
    );
  }

  console.log(
    JSON.stringify({
      level: status === 'failed' ? 'error' : status === 'partial' ? 'warn' : 'info',
      msg: 'job_run_finished',
      jobName: run.jobName || undefined,
      executionId: run.executionId,
      status,
      durationMs,
      recordsProcessed,
      recordsFailed,
    })
  );

  return { durationMs, status };
}

/**
 * Wrap an async job function with start/finish recording and isolation.
 */
export async function withJobRun(jobName, fn, { trigger = 'schedule', details = {} } = {}) {
  const run = await startJobRun(jobName, { trigger, details });
  run.jobName = jobName;
  try {
    const result = (await fn(run)) || {};
    const status =
      result.status ||
      (result.error || result.failed ? 'failed' : result.skipped ? 'skipped' : 'success');
    await finishJobRun(run, {
      status,
      recordsProcessed: result.recordsProcessed ?? result.processed ?? 0,
      recordsCreated: result.recordsCreated ?? result.created ?? 0,
      recordsUpdated: result.recordsUpdated ?? result.updated ?? 0,
      recordsSkipped: result.recordsSkipped ?? result.skippedCount ?? 0,
      recordsFailed: result.recordsFailed ?? result.failed ?? 0,
      errorSummary: result.errorSummary || result.message || result.error || null,
      details: result.details || null,
    });
    return { ...result, status, executionId: run.executionId };
  } catch (error) {
    await finishJobRun(run, {
      status: 'failed',
      errorSummary: safeSummary(error),
    });
    return { status: 'failed', error: safeSummary(error), executionId: run.executionId };
  }
}

export async function listRecentJobRuns({ jobName = null, limit = 20 } = {}) {
  const params = [];
  let where = '';
  if (jobName) {
    params.push(jobName);
    where = `WHERE job_name = $${params.length}`;
  }
  params.push(Math.min(Number(limit) || 20, 100));
  const result = await getPool().query(
    `SELECT id, job_name, execution_id, trigger, status, started_at, finished_at,
            duration_ms, records_processed, records_created, records_updated,
            records_skipped, records_failed, error_summary, details
     FROM job_runs
     ${where}
     ORDER BY started_at DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows.map(mapJobRun);
}

export async function latestJobRunByName(jobNames = []) {
  if (!jobNames.length) return {};
  const result = await getPool().query(
    `SELECT DISTINCT ON (job_name)
       id, job_name, execution_id, trigger, status, started_at, finished_at,
       duration_ms, records_processed, records_created, records_updated,
       records_skipped, records_failed, error_summary, details
     FROM job_runs
     WHERE job_name = ANY($1::text[])
     ORDER BY job_name, started_at DESC`,
    [jobNames]
  );
  const map = {};
  for (const row of result.rows) {
    map[row.job_name] = mapJobRun(row);
  }
  return map;
}

export async function purgeOldJobRuns({ olderThanDays = RETENTION_DAYS } = {}) {
  const days = Math.max(7, Number(olderThanDays) || 30);
  const result = await getPool().query(
    `DELETE FROM job_runs
     WHERE started_at < NOW() - ($1 || ' days')::interval
       AND status <> 'running'
     RETURNING id`,
    [String(days)]
  );
  return { deleted: result.rowCount || 0, retentionDays: days };
}

function mapJobRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobName: row.job_name,
    executionId: row.execution_id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    recordsProcessed: row.records_processed,
    recordsCreated: row.records_created,
    recordsUpdated: row.records_updated,
    recordsSkipped: row.records_skipped,
    recordsFailed: row.records_failed,
    errorSummary: row.error_summary,
    details: row.details || {},
  };
}

export const JOB_NAMES = {
  DATA_QUALITY_TICK: 'data_quality.freshness_tick',
  FX_SYNC_TICK: 'fx.sync_tick',
  OFFICIAL_SYNC_TICK: 'official.sync_tick',
  OPS_RETENTION: 'ops.retention_cleanup',
  TRAFFIC_EXPIRE_TICK: 'traffic.expire_stale',
};

export { safeSummary };
