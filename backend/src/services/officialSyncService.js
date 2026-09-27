import { env } from '../config/env.js';
import { runAllActiveIngestion, runDueIngestion, runSourceIngestion } from '../ingestion/index.js';
import { withJobRun, JOB_NAMES } from './jobMonitor.js';
import { officialAdminService } from './officialAdminService.js';

function log(message, meta = {}) {
  console.log(`[official-sync] ${message}`, Object.keys(meta).length ? meta : '');
}

export async function syncOfficialSource(sourceId) {
  return runSourceIngestion(sourceId, { trigger: 'manual' });
}

export async function syncDueOfficialSources() {
  return runDueIngestion();
}

export async function syncAllActiveOfficialSources() {
  return runAllActiveIngestion('manual');
}

let timer = null;
let inFlight = false;

export async function runScheduledOfficialSync(reason = 'schedule') {
  if (inFlight) {
    log('skip overlapping sync', { reason });
    return { status: 'skipped', reason: 'in_flight' };
  }
  inFlight = true;
  try {
    log(`starting sync (${reason})`);
    const trigger =
      reason === 'startup' ? 'startup' : reason === 'manual' ? 'manual' : 'schedule';
    return await withJobRun(
      JOB_NAMES.OFFICIAL_SYNC_TICK,
      async () => {
        const outcome =
          reason === 'startup' || reason === 'manual'
            ? await runAllActiveIngestion(reason)
            : await runDueIngestion();

        const expired = await officialAdminService
          .expireDueUpdates()
          .catch(() => ({ archived: 0 }));

        const results = outcome?.results || outcome?.sources || [];
        const list = Array.isArray(results) ? results : [];
        const failed = list.filter((r) => r.status === 'failed' || r.error).length;
        const success = list.filter((r) => r.status === 'success' || r.status === 'completed').length;
        let status = outcome?.status || 'success';
        if (failed && success) status = 'partial';
        else if (failed && !success) status = 'failed';

        return {
          status,
          recordsProcessed: list.length || outcome?.processed || 0,
          recordsCreated: outcome?.created || 0,
          recordsUpdated: outcome?.updated || 0,
          recordsFailed: failed,
          errorSummary: status === 'failed' ? outcome?.error || outcome?.message || null : null,
          details: {
            reason,
            sourceCount: list.length,
            expiredArchived: expired.archived || 0,
          },
        };
      },
      { trigger, details: { reason } }
    );
  } catch (error) {
    log('unexpected sync failure', { error: error?.message });
    return { status: 'failed', error: error?.message || 'unexpected' };
  } finally {
    inFlight = false;
  }
}

export function startOfficialSyncScheduler() {
  const tickMs = env.OFFICIAL_SYNC_TICK_MS || 5 * 60 * 1000;

  if (env.OFFICIAL_SYNC_ON_STARTUP !== false) {
    setTimeout(() => {
      runScheduledOfficialSync('startup').catch((err) => {
        console.error('[official-sync] startup sync error (non-fatal):', err?.message);
      });
    }, 4000);
  }

  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    runScheduledOfficialSync('interval').catch((err) => {
      console.error('[official-sync] interval sync error (non-fatal):', err?.message);
    });
  }, tickMs);

  if (typeof timer.unref === 'function') timer.unref();
  log('scheduler started', { tickMs });
  return { tickMs };
}

export function stopOfficialSyncScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export const officialSyncService = {
  syncSource: syncOfficialSource,
  syncDue: syncDueOfficialSources,
  syncAllActive: syncAllActiveOfficialSources,
  runScheduled: runScheduledOfficialSync,
  startScheduler: startOfficialSyncScheduler,
  stopScheduler: stopOfficialSyncScheduler,
};
