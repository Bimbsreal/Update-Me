/**
 * Lightweight freshness/expiry scheduler.
 * Reuses reportRepository.applyFreshnessTransitions — no job framework.
 * Publishes SSE only when status meaningfully changes (stale/expired).
 */

import { reportRepository } from '../repositories/reportRepository.js';
import { realtimePublisher } from '../realtime/publisher.js';
import { withJobRun, JOB_NAMES, purgeOldJobRuns } from './jobMonitor.js';
import { metricsService } from './metricsService.js';

const TICK_MS = Number(process.env.DATA_QUALITY_TICK_MS || 5 * 60 * 1000);
let timer = null;
let running = false;
let tickCount = 0;


function log(message, extra = {}) {
  console.log('[data-quality]', message, Object.keys(extra).length ? extra : '');
}

function publishTransition(row) {
  const entity = {
    id: row.id,
    status: row.status,
    title: row.title,
    sourceType: row.sourceType,
    location: { id: row.locationId },
    category: { code: row.categoryCode },
    updatedAt: new Date().toISOString(),
  };

  const extra = {
    qualityTransition: row.transition,
    previousStatus: row.prevStatus,
  };

  // Prefer module-specific events when known; otherwise generic report.updated
  switch (row.categoryCode) {
    case 'traffic':
      return realtimePublisher.trafficUpdated(
        { id: row.id, reportId: row.id, severity: null, report: entity, location: entity.location },
        extra
      );
    case 'fuel':
      return realtimePublisher.fuelUpdated(
        { id: row.id, report: entity, location: entity.location },
        extra
      );
    case 'transport':
      return realtimePublisher.transportUpdated(
        { id: row.id, report: entity, location: entity.location },
        extra
      );
    case 'prices':
      return realtimePublisher.priceUpdated(
        { id: row.id, report: entity, location: entity.location },
        extra
      );
    case 'local_alerts':
      return realtimePublisher.alertUpdated(
        { id: row.id, report: entity, location: entity.location },
        extra
      );
    default:
      return realtimePublisher.reportUpdated(entity, extra);
  }
}

export async function runDataQualityTick(trigger = 'schedule') {
  if (running) return { skipped: true, status: 'skipped' };
  running = true;
  try {
    return await withJobRun(
      JOB_NAMES.DATA_QUALITY_TICK,
      async () => {
        const result = await reportRepository.applyFreshnessTransitions({ limit: 200 });
        const transitions = result.transitions || [];

        let trafficExpired = 0;
        try {
          const { trafficEventAdminService } = await import('./trafficEventAdminService.js');
          const trafficResult = await withJobRun(
            JOB_NAMES.TRAFFIC_EXPIRE_TICK,
            async () => {
              const expired = await trafficEventAdminService.expireStaleEvents({ limit: 200 });
              return {
                status: 'success',
                recordsProcessed: expired.expired || 0,
                details: expired,
              };
            },
            { trigger }
          );
          trafficExpired = trafficResult?.recordsProcessed || 0;
        } catch (err) {
          console.error('[data-quality] traffic expire failed:', err?.message || err);
        }

        const publishable = transitions.slice(0, 40);
        for (const row of publishable) {
          try {
            publishTransition(row);
          } catch (err) {
            // Per-record isolation — one SSE publish failure must not abort the tick
            console.error(
              JSON.stringify({
                level: 'warn',
                msg: 'data_quality_publish_failed',
                reportId: row.id,
                error: err?.message,
              })
            );
          }
        }

        if (transitions.length) {
          log('transitions applied', {
            expired: result.expired,
            stale: result.stale,
            published: publishable.length,
          });
          try {
            const { qualityIntelligenceService } = await import('./qualityIntelligenceService.js');
            await qualityIntelligenceService.recordFreshnessTransitions(
              transitions.map((t) => ({
                id: t.id,
                status: t.status,
                category_code: t.categoryCode,
                location_id: t.locationId,
              }))
            );
          } catch (err) {
            console.error('[data-quality] quality events failed:', err?.message || err);
          }
        }

        // Periodic retention every ~12 ticks (~1h at 5m)
        tickCount += 1;
        if (tickCount === 1 || tickCount % 12 === 0) {
          await withJobRun(
            JOB_NAMES.OPS_RETENTION,
            async () => {
              const jobs = await purgeOldJobRuns();
              const metrics = await metricsService.purgeOldMetrics();
              await metricsService.flushMetrics();
              let analyticsRetention = {};
              try {
                const { analyticsService } = await import('./analyticsService.js');
                analyticsRetention = await analyticsService.purgeRetention();
              } catch {
                analyticsRetention = {};
              }
              return {
                status: 'success',
                recordsProcessed:
                  (jobs.deleted || 0) +
                  (metrics.deleted || 0) +
                  (analyticsRetention.activityCleared || 0) +
                  (analyticsRetention.featureCleared || 0) +
                  (analyticsRetention.errorsCleared || 0),
                details: { jobs, metrics, analyticsRetention },
              };
            },
            { trigger: 'retention' }
          );
        }

        return {
          status: 'success',
          recordsProcessed: transitions.length + trafficExpired,
          recordsUpdated: transitions.length + trafficExpired,
          details: {
            expired: result.expired,
            stale: result.stale,
            published: publishable.length,
            trafficEventsExpired: trafficExpired,
          },
        };
      },
      { trigger }
    );
  } catch (error) {
    console.error('[data-quality] tick failed:', error?.message || error);
    return { status: 'failed', error: true, message: error?.message };
  } finally {
    running = false;
  }
}


export function startDataQualityScheduler() {
  if (timer) return;
  // Initial delayed tick so boot is not blocked
  setTimeout(() => {
    runDataQualityTick('startup').catch(() => {});
  }, 15_000);
  timer = setInterval(() => {
    runDataQualityTick('schedule').catch(() => {});
  }, TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  log('scheduler started', { tickMs: TICK_MS });
}

export function stopDataQualityScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
