'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Compact list/map card for traffic events.
 * Severity is never color-only — label + text always present.
 */
export function TrafficEventCard({ event, className, compact = false }) {
  if (!event) return null;
  const severityLabel = event.severityBand?.label || event.impactSeverity?.label || 'Unknown';
  const road = event.roadName || event.locationName || 'Road update';
  const direction = event.directionLabel;
  const freshness = event.freshnessState;
  const outdated =
    event.mayBeOutdated || freshness === 'stale' || freshness === 'aging';

  return (
    <article
      className={cn(
        'rounded-card border border-surface-border bg-white p-4 shadow-card',
        event.sourceClassification === 'official' && 'border-status-official/30',
        outdated && 'opacity-90',
        freshness === 'expired' && 'opacity-75',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-bold',
            severityLabel === 'Critical' || severityLabel === 'Severe'
              ? 'border-red-200 bg-red-50 text-red-900'
              : severityLabel === 'Heavy' || severityLabel === 'High'
                ? 'border-orange-200 bg-orange-50 text-orange-900'
                : severityLabel === 'Moderate'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-surface-border bg-surface-muted text-ink'
          )}
          aria-label={`Severity: ${severityLabel}`}
        >
          <span aria-hidden="true">
            {severityLabel === 'Critical' || severityLabel === 'Severe'
              ? '●'
              : severityLabel === 'Heavy' || severityLabel === 'High'
                ? '◐'
                : '○'}
          </span>
          {severityLabel}
        </span>
        <span className="rounded-pill border border-surface-border bg-surface-muted/60 px-2 py-0.5 text-[11px] font-semibold text-ink">
          {event.sourceLabel || 'Community Report'}
        </span>
      </div>

      <h3 className={cn('mt-3 font-bold text-ink break-words', compact ? 'text-base' : 'text-lg')}>
        {event.title}
      </h3>
      <p className="mt-1 text-sm font-semibold text-ink break-words">{road}</p>
      {event.segmentName ? (
        <p className="mt-0.5 text-xs text-ink-muted">Segment: {event.segmentName}</p>
      ) : null}
      {direction ? (
        <p className="mt-1 text-sm text-ink-muted break-words">{direction}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-muted">
        <span>{event.observedLabel || 'Observation time unknown'}</span>
        {outdated ? (
          <span className="font-semibold text-amber-800">Report may be outdated</span>
        ) : null}
        {event.confidence ? (
          <span className="capitalize">Confidence: {event.confidence}</span>
        ) : null}
        <span className="capitalize">{String(event.eventType || '').replace(/_/g, ' ')}</span>
      </div>

      {!compact && event.diversionNotes ? (
        <p className="mt-2 text-sm text-ink-muted">
          Official diversion note: {event.diversionNotes}
        </p>
      ) : null}

      <div className="mt-3">
        <Link
          href={`/traffic/events/${event.id}`}
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          View details
        </Link>
      </div>
    </article>
  );
}
