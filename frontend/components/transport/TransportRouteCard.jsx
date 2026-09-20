'use client';

import Link from 'next/link';
import { ReportTrustLabel } from '@/components/reports/ReportTrustLabel';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
  formatFareRange,
  formatTransportAge,
  pickPrimaryFareSummary,
  routeDisplayName,
  transportModeLabel,
} from '@/lib/transport';

export function TransportRouteCard({
  route,
  preferredMode = null,
  compact = false,
  className,
  showActions = false,
  onConfirm,
}) {
  if (!route) return null;
  const summary = pickPrimaryFareSummary(route, preferredMode);
  const fareLabel = formatFareRange(summary?.fareRange);
  const updatedAt = summary?.mostRecentAt;
  const boarding =
    summary?.boardingPointLabel ||
    route.stops?.[0]?.label ||
    null;
  const trafficHint = route.relatedTraffic?.[0];

  return (
    <article
      className={cn(
        'rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="inline-flex items-center rounded-pill border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">
          {summary ? transportModeLabel(summary.transportMode) : route.primaryModeLabel || 'Transport'}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {summary?.reportCount ? (
            <span className="text-xs font-semibold text-ink-soft">
              {summary.reportCount} recent report{summary.reportCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </div>

      <h3 className={cn('mt-3 font-bold text-ink break-words', compact ? 'text-base' : 'text-lg')}>
        {routeDisplayName(route)}
      </h3>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {summary ? 'Reported fare' : 'No recent fare'}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-ink">{fareLabel || '—'}</p>
        </div>
      </div>

      {boarding ? (
        <p className="mt-2 text-sm text-ink-muted break-words">Board near {boarding}</p>
      ) : null}

      {updatedAt ? (
        <p className="mt-2 text-xs text-ink-soft">Reported {formatTransportAge(updatedAt)}</p>
      ) : (
        <p className="mt-2 text-xs text-ink-soft">No recent fare information</p>
      )}

      {trafficHint ? (
        <p className="mt-2 text-xs text-status-caution break-words">
          Traffic: {trafficHint.title || trafficHint.severity}
          {trafficHint.locationName ? ` near ${trafficHint.locationName}` : ''}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button as={Link} href={`/transport/routes/${route.id}`} variant="secondary" size="sm">
          View
        </Button>
        {showActions && summary && onConfirm ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onConfirm(summary)}>
            Confirm latest
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export function TransportFareCard({ fare, onConfirm, onCorrect }) {
  if (!fare) return null;
  return (
    <article className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <div className="flex flex-wrap gap-1.5">
        {(fare.report?.trustLabels || []).map((label) => (
          <ReportTrustLabel key={label} label={label} sourceType={fare.report?.sourceType} />
        ))}
        {fare.report?.freshness === 'stale' || fare.report?.freshness === 'expired' ? (
          <ReportTrustLabel
            label={fare.report.freshness === 'expired' ? 'Expired' : 'Stale'}
            sourceType={fare.report?.sourceType}
          />
        ) : null}
      </div>
      <p className="mt-3 text-base font-bold text-ink">
        {fare.transportModeLabel} · {formatFareRange({ min: fare.fare?.amount, max: fare.fare?.amount, currency: fare.fare?.currency, isRange: false })}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        {fare.report?.lastConfirmedAt
          ? `Confirmed ${formatTransportAge(fare.report.lastConfirmedAt)}`
          : `Reported ${formatTransportAge(fare.report?.occurredAt || fare.createdAt)}`}
      </p>
      {fare.boardingPointLabel ? (
        <p className="mt-2 text-sm text-ink-muted break-words">Board: {fare.boardingPointLabel}</p>
      ) : null}
      {(onConfirm || onCorrect) && fare.id ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {onConfirm ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onConfirm(fare.id)}>
              Confirm
            </Button>
          ) : null}
          {onCorrect ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => onCorrect(fare.id)}>
              No longer accurate
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
