import { resolveProviderForSource } from '../official/providers/index.js';
import { validateNormalizedUpdates } from '../official/providers/utils.js';
import { officialRepository } from '../repositories/officialRepository.js';
import { realtimePublisher } from '../realtime/publisher.js';
import { notificationService } from '../services/notificationService.js';
import { withSourceSyncLock } from './locks.js';
import { resolveOfficialLocation } from './locationResolver.js';
import { hashOfficialContent, sanitizeOfficialText } from './sanitize.js';
import { computeSourceHealth, shouldAutoSuspend } from './sourceHealth.js';
import { assessOfficialScope } from '../utils/officialScope.js';

function log(message, meta = {}) {
  console.log(`[ingestion] ${message}`, Object.keys(meta).length ? meta : '');
}

async function enrichLocation(item, source) {
  const cfg = source.config || {};
  const resolved = await resolveOfficialLocation({
    stateId: item.stateId || source.stateId || null,
    locationId: item.locationId || null,
    stateCode: item.sourceMetadata?.stateCode || cfg.stateCode || null,
    stateName: item.sourceMetadata?.stateName || null,
    lgaName: item.sourceMetadata?.lgaName || null,
    areaName: item.sourceMetadata?.areaName || null,
    placeHint: item.sourceMetadata?.placeHint || item.sourceMetadata?.locationHint || null,
  });

  return {
    ...item,
    stateId: resolved.stateId || item.stateId || source.stateId || null,
    locationId: resolved.locationId || item.locationId || null,
    sourceMetadata: {
      ...(item.sourceMetadata || {}),
      locationResolution: resolved.level,
      locationLabel: resolved.label,
    },
  };
}

function sanitizeItem(item) {
  const title = sanitizeOfficialText(item.title, { maxLength: 300 }) || item.title;
  const summary = sanitizeOfficialText(item.summary, { maxLength: 2000 });
  const body = sanitizeOfficialText(item.body, { maxLength: 20000 });
  const next = { ...item, title, summary, body };
  return {
    ...next,
    contentHash: hashOfficialContent(next),
  };
}

/**
 * Run ingestion for a single approved official source.
 * Pipeline: lock → fetch → validate → normalize → dedupe → locate → store → publish
 */
export async function runSourceIngestion(sourceId, { trigger = 'manual' } = {}) {
  const { locked, result } = await withSourceSyncLock(sourceId, async () => {
    const source = await officialRepository.getSource(sourceId);
    if (!source) {
      return { sourceId, status: 'failed', error: 'Source not found', trigger };
    }

    const startedAt = new Date().toISOString();

    if (source.status !== 'active' || source.verificationStatus !== 'verified') {
      const completedAt = new Date().toISOString();
      await officialRepository.createSyncRun({
        sourceId,
        status: 'failed',
        startedAt,
        completedAt,
        triggerReason: trigger,
        errorMessage: `Source ${sourceId} is not active and verified`,
        details: { status: source.status, verificationStatus: source.verificationStatus },
      });
      await officialRepository.markSourceAttempt(sourceId, {
        success: false,
        errorMessage: 'Source not active/verified',
      });
      return { sourceId, status: 'failed', error: 'not_active_or_verified', trigger };
    }

    try {
      const provider = resolveProviderForSource(source);
      const raw = await provider.fetchUpdates(source);

      let accepted = [];
      let rejected = 0;
      try {
        accepted = validateNormalizedUpdates(raw, source);
      } catch (err) {
        // Whole-feed validation failure
        throw err;
      }

      // Per-item sanitize + location (reject individual bad items)
      const prepared = [];
      for (const item of accepted) {
        try {
          const clean = sanitizeItem(item);
          if (!clean.title || clean.title.length < 3) {
            rejected += 1;
            continue;
          }
          prepared.push(await enrichLocation(clean, source));
        } catch {
          rejected += 1;
        }
      }

      let added = 0;
      let updated = 0;
      let skipped = 0;
      let materiallyChanged = 0;
      const autoPublish =
        source.config?.autoPublish === true ||
        source.ingestionMethod === 'fixture' ||
        process.env.OFFICIAL_AUTO_PUBLISH === 'true';

      for (const item of prepared) {
        try {
          const scopeAssessment = assessOfficialScope({
            title: item.title,
            summary: item.summary,
            body: item.body,
            category: item.category,
          });
          let status = autoPublish ? item.status || 'published' : 'pending_review';
          if (scopeAssessment !== 'in_scope') {
            status = 'pending_review';
          }
          const result = await officialRepository.upsertUpdate({
            ...item,
            status,
            entryOrigin: 'ingested',
            scopeAssessment,
            effectiveAt: item.effectiveAt || null,
            expiresAt: item.expiresAt || null,
            priority: item.priority || 'normal',
          });
          if (item.locationId || item.stateId || item.areaLocationIds?.length) {
            await officialRepository.replaceUpdateAreas(result.id, {
              locationIds: item.areaLocationIds || (item.locationId ? [item.locationId] : []),
              stateIds: item.areaStateIds || (item.stateId ? [item.stateId] : []),
              primaryLocationId: item.locationId || null,
              primaryStateId: item.stateId || null,
            });
          }
          if (result.inserted) {
            added += 1;
            if (result.status === 'published') {
              realtimePublisher.officialUpdated({
                id: result.id,
                locationId: item.locationId,
                stateId: item.stateId,
                status: 'published',
                title: item.title,
                publishedAt: item.publishedAt,
                source: { name: source.shortName || source.organizationName },
              });
              notificationService
                .notifyOfficialUpdate(
                  { id: result.id, title: item.title, summary: item.summary, body: item.body },
                  { locationId: item.locationId }
                )
                .catch(() => {});
            }
          } else if (result.changed) {
            updated += 1;
            materiallyChanged += 1;
            if (result.status === 'published') {
              realtimePublisher.officialUpdated({
                id: result.id,
                locationId: item.locationId,
                stateId: item.stateId,
                status: 'published',
                title: item.title,
                publishedAt: item.publishedAt,
                source: { name: source.shortName || source.organizationName },
              });
            }
          } else {
            skipped += 1;
          }
        } catch (err) {
          rejected += 1;
          log(`reject item for ${sourceId}`, { error: err.message, title: item.title });
        }
      }

      const completedAt = new Date().toISOString();
      const status =
        rejected > 0 && added + updated === 0
          ? 'failed'
          : rejected > 0
            ? 'partial'
            : 'success';

      await officialRepository.createSyncRun({
        sourceId,
        status,
        startedAt,
        completedAt,
        triggerReason: trigger,
        retrievedCount: Array.isArray(raw) ? raw.length : prepared.length,
        addedCount: added,
        updatedCount: updated,
        skippedCount: skipped,
        rejectedCount: rejected,
        details: {
          provider: provider.key,
          materiallyChanged,
          health: computeSourceHealth({ ...source, consecutiveFailures: 0, lastSuccessAt: completedAt }),
        },
      });
      await officialRepository.markSourceAttempt(sourceId, { success: true });

      log(`sync ${status} for ${sourceId}`, {
        retrieved: Array.isArray(raw) ? raw.length : prepared.length,
        added,
        updated,
        skipped,
        rejected,
      });

      return {
        sourceId,
        status: status === 'failed' ? 'failed' : status === 'partial' ? 'partial' : 'success',
        retrieved: Array.isArray(raw) ? raw.length : prepared.length,
        added,
        updated,
        skipped,
        rejected,
        trigger,
      };
    } catch (error) {
      const message = error?.message || 'Unknown official sync error';
      const completedAt = new Date().toISOString();
      log(`sync failed for ${sourceId}`, { error: message });

      await officialRepository.createSyncRun({
        sourceId,
        status: 'failed',
        startedAt,
        completedAt,
        triggerReason: trigger,
        errorMessage: message,
      });
      const marked = await officialRepository.markSourceAttempt(sourceId, {
        success: false,
        errorMessage: message,
      });

      if (shouldAutoSuspend({ consecutiveFailures: marked?.consecutiveFailures })) {
        await officialRepository.suspendSource(sourceId, 'Auto-suspended after repeated sync failures');
      }

      return { sourceId, status: 'failed', error: message, trigger };
    }
  });

  if (!locked) return result;
  return result;
}

export async function runDueIngestion() {
  const due = await officialRepository.listDueSources();
  const results = [];
  for (const source of due) {
    // Sequential — do not hammer providers
    // eslint-disable-next-line no-await-in-loop
    results.push(await runSourceIngestion(source.id, { trigger: 'schedule' }));
  }
  return summarizeResults(results);
}

export async function runAllActiveIngestion(trigger = 'manual') {
  const sources = await officialRepository.listSources({ status: 'active', includeInactive: false });
  const results = [];
  for (const source of sources) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await runSourceIngestion(source.id, { trigger }));
  }
  return summarizeResults(results);
}

function summarizeResults(results) {
  const anySuccess = results.some((r) => r.status === 'success' || r.status === 'partial');
  const anyFailed = results.some((r) => r.status === 'failed');
  return {
    status: !results.length
      ? 'success'
      : anySuccess && anyFailed
        ? 'partial'
        : anySuccess
          ? 'success'
          : 'failed',
    results,
  };
}

export const ingestionService = {
  runSource: runSourceIngestion,
  runDue: runDueIngestion,
  runAllActive: runAllActiveIngestion,
  computeSourceHealth,
};
