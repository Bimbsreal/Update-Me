import { env } from '../config/env.js';
import {
  runAllActiveIngestion,
  runDueIngestion,
  runSourceIngestion,
} from '../ingestion/index.js';

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
    if (reason === 'startup' || reason === 'manual') {
      return await runAllActiveIngestion(reason);
    }
    return await runDueIngestion();
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
