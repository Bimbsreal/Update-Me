import { env } from '../config/env.js';
import { FX_SUPPORTED_PAIRS } from '../config/fx.js';
import { getEnabledFxProviders, getFxProvider, listFxProviders } from '../fx/providers/index.js';
import { validateNormalizedRates } from '../fx/providers/utils.js';
import { fxRepository } from '../repositories/fxRepository.js';

function log(message, meta = {}) {
  console.log(`[fx-sync] ${message}`, Object.keys(meta).length ? meta : '');
}

async function persistRates(rates) {
  let upserted = 0;
  for (const rate of rates) {
    const changed = await fxRepository.upsertObservation(rate);
    if (changed) upserted += 1;
  }
  return upserted;
}

/**
 * Synchronize FX rates from a single provider.
 * Failures are recorded; last good observations are retained.
 */
export async function syncFxProvider(providerKey, { includeHistory = true } = {}) {
  const provider = getFxProvider(providerKey);
  const startedAt = new Date().toISOString();
  const pairs = FX_SUPPORTED_PAIRS.map(({ base, quote }) => ({ base, quote }));

  if (!provider.isEnabled) {
    const finishedAt = new Date().toISOString();
    await fxRepository.createSyncRun({
      providerKey: provider.key,
      sourceId: provider.sourceId,
      status: 'failed',
      startedAt,
      finishedAt,
      upserted: 0,
      errorMessage: `Provider ${provider.key} is disabled`,
      details: { reason: 'disabled' },
    });
    await fxRepository.upsertSyncState({
      providerKey: provider.key,
      sourceId: provider.sourceId,
      lastAttemptAt: startedAt,
      lastStatus: 'failed',
      consecutiveFailures: 1,
      lastErrorMessage: `Provider ${provider.key} is disabled`,
    });
    return { provider: provider.key, status: 'failed', error: 'disabled', upserted: 0 };
  }

  try {
    let rates = validateNormalizedRates(await provider.fetchLatest(pairs), {
      sourceId: provider.sourceId,
      rateType: provider.rateType,
    });

    const existingCount = await fxRepository.countObservations();
    const shouldBackfillHistory = includeHistory && existingCount < 40;

    if (shouldBackfillHistory && typeof provider.fetchHistory === 'function') {
      try {
        const historyRaw = await provider.fetchHistory(pairs, {
          days: env.FX_HISTORY_BACKFILL_DAYS || 90,
        });
        if (Array.isArray(historyRaw) && historyRaw.length) {
          const history = validateNormalizedRates(historyRaw, {
            sourceId: provider.sourceId,
            rateType: provider.rateType,
          });
          // Prefer history + latest; latest overwrites same effective_date via upsert
          rates = [...history, ...rates];
        }
      } catch (historyError) {
        log(`history backfill failed for ${provider.key}; continuing with latest`, {
          error: historyError.message,
        });
      }
    } else if (includeHistory && !shouldBackfillHistory) {
      log(`skipping history backfill for ${provider.key}; sufficient observations exist`, {
        existingCount,
      });
    }

    const upserted = await persistRates(rates);
    const finishedAt = new Date().toISOString();

    await fxRepository.createSyncRun({
      providerKey: provider.key,
      sourceId: provider.sourceId,
      status: 'success',
      startedAt,
      finishedAt,
      upserted,
      details: {
        pairs: pairs.length,
        ratesReceived: rates.length,
        includeHistory,
      },
    });

    await fxRepository.upsertSyncState({
      providerKey: provider.key,
      sourceId: provider.sourceId,
      lastAttemptAt: startedAt,
      lastSuccessAt: finishedAt,
      lastStatus: 'success',
      consecutiveFailures: 0,
      lastErrorMessage: null,
    });

    log(`sync success for ${provider.key}`, { upserted, rates: rates.length });
    return { provider: provider.key, status: 'success', upserted, rates: rates.length };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error?.message || 'Unknown FX sync error';
    log(`sync failed for ${provider.key}`, { error: message });

    const prior = (await fxRepository.getSyncState()).providers.find(
      (p) => p.providerKey === provider.key
    );
    const failures = (prior?.consecutiveFailures || 0) + 1;

    await fxRepository.createSyncRun({
      providerKey: provider.key,
      sourceId: provider.sourceId,
      status: 'failed',
      startedAt,
      finishedAt,
      upserted: 0,
      errorMessage: message,
      details: { includeHistory },
    });

    await fxRepository.upsertSyncState({
      providerKey: provider.key,
      sourceId: provider.sourceId,
      lastAttemptAt: startedAt,
      lastStatus: 'failed',
      consecutiveFailures: failures,
      lastErrorMessage: message,
    });

    return { provider: provider.key, status: 'failed', error: message, upserted: 0 };
  }
}

/**
 * Sync all enabled providers. Never throws — aggregates results.
 */
export async function syncAllFxProviders(options = {}) {
  const enabled = getEnabledFxProviders();
  if (!enabled.length) {
    log('no enabled FX providers');
    return { status: 'failed', results: [], message: 'No enabled FX providers' };
  }

  const results = [];
  for (const provider of enabled) {
    // Sequential to avoid hammering providers
    // eslint-disable-next-line no-await-in-loop
    results.push(await syncFxProvider(provider.key, options));
  }

  const anySuccess = results.some((r) => r.status === 'success');
  const anyFailed = results.some((r) => r.status === 'failed');
  const status = anySuccess && anyFailed ? 'partial' : anySuccess ? 'success' : 'failed';

  return { status, results };
}

let syncTimer = null;
let syncInFlight = false;

export async function runScheduledFxSync(reason = 'schedule') {
  if (syncInFlight) {
    log('skip overlapping sync', { reason });
    return { status: 'skipped', reason: 'in_flight' };
  }
  syncInFlight = true;
  try {
    log(`starting sync (${reason})`);
    return await syncAllFxProviders({ includeHistory: reason === 'startup' || reason === 'manual' });
  } catch (error) {
    // Absolute safety net — never crash the process
    log('unexpected sync failure', { error: error?.message });
    return { status: 'failed', error: error?.message || 'unexpected' };
  } finally {
    syncInFlight = false;
  }
}

export function startFxSyncScheduler() {
  const intervalMs = env.FX_SYNC_INTERVAL_MS || 24 * 60 * 60 * 1000;

  if (env.FX_SYNC_ON_STARTUP !== false) {
    // Defer slightly so listen() completes first
    setTimeout(() => {
      runScheduledFxSync('startup').catch((err) => {
        console.error('[fx-sync] startup sync error (non-fatal):', err?.message);
      });
    }, 2500);
  }

  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    runScheduledFxSync('interval').catch((err) => {
      console.error('[fx-sync] interval sync error (non-fatal):', err?.message);
    });
  }, intervalMs);

  if (typeof syncTimer.unref === 'function') syncTimer.unref();
  log('scheduler started', { intervalMs, providers: listFxProviders().map((p) => p.key) });
  return { intervalMs };
}

export function stopFxSyncScheduler() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

export const fxSyncService = {
  syncProvider: syncFxProvider,
  syncAll: syncAllFxProviders,
  runScheduled: runScheduledFxSync,
  startScheduler: startFxSyncScheduler,
  stopScheduler: stopFxSyncScheduler,
};
