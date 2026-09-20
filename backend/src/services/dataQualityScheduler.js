/**
 * Lightweight freshness/expiry scheduler.
 * Reuses reportRepository.applyFreshnessTransitions — no job framework.
 * Publishes SSE only when status meaningfully changes (stale/expired).
 */

import { reportRepository } from '../repositories/reportRepository.js';
import { realtimePublisher } from '../realtime/publisher.js';

const TICK_MS = Number(process.env.DATA_QUALITY_TICK_MS || 5 * 60 * 1000);
let timer = null;
let running = false;

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

export async function runDataQualityTick() {
  if (running) return { skipped: true };
  running = true;
  try {
    const result = await reportRepository.applyFreshnessTransitions({ limit: 200 });
    const transitions = result.transitions || [];

    // Cap SSE fan-out to avoid spam on large catch-up batches
    const publishable = transitions.slice(0, 40);
    for (const row of publishable) {
      publishTransition(row);
    }

    if (transitions.length) {
      log('transitions applied', {
        expired: result.expired,
        stale: result.stale,
        published: publishable.length,
      });
    }
    return result;
  } catch (error) {
    console.error('[data-quality] tick failed:', error?.message || error);
    return { error: true, message: error?.message };
  } finally {
    running = false;
  }
}

export function startDataQualityScheduler() {
  if (timer) return;
  // Initial delayed tick so boot is not blocked
  setTimeout(() => {
    runDataQualityTick().catch(() => {});
  }, 15_000);
  timer = setInterval(() => {
    runDataQualityTick().catch(() => {});
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
