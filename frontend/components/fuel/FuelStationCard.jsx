'use client';

import Link from 'next/link';
import { ReportTrustLabel } from '@/components/reports/ReportTrustLabel';
import { QualitySignals } from '@/components/quality/QualitySignals';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
  availabilityClass,
  availabilityMeta,
  formatFuelAge,
  formatFuelPrice,
  fuelTypeLabel,
  pickPrimaryReport,
} from '@/lib/fuel';

export function FuelStationCard({
  station,
  preferredFuelType = 'pms',
  compact = false,
  className,
  showActions = false,
  onConfirm,
}) {
  if (!station) return null;
  const report = pickPrimaryReport(station, preferredFuelType);
  const availability = availabilityMeta(report?.availability || 'unknown');
  const priceLabel = formatFuelPrice(report?.price);
  const updatedAt = report?.lastConfirmedAt || report?.occurredAt || report?.createdAt;
  const place =
    station.location?.subtitle ||
    station.location?.name ||
    station.address ||
    station.landmarkLabel;

  return (
    <article
      className={cn(
        'rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-pill border px-2.5 py-1 text-xs font-bold',
            availabilityClass(report?.availability || 'unknown')
          )}
        >
          {availability.label}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {(report?.trustLabels || [])
            .filter((label) => !(report?.sourceType === 'community' && label === 'Official'))
            .slice(0, 3)
            .map((label) => (
              <ReportTrustLabel key={label} label={label} sourceType={report?.sourceType} />
            ))}
          {report?.freshness === 'stale' || report?.freshness === 'expired' ? (
            <ReportTrustLabel
              label={report.freshness === 'expired' ? 'Expired' : 'Stale'}
              sourceType={report?.sourceType}
            />
          ) : null}
        </div>
      </div>

      <h3 className={cn('mt-3 font-bold text-ink break-words', compact ? 'text-base' : 'text-lg')}>
        {station.name}
      </h3>
      {station.brand ? (
        <p className="mt-1 text-sm font-medium text-ink-muted break-words">{station.brand}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {report ? fuelTypeLabel(report.fuelType) : 'No recent report'}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-ink">
            {priceLabel || '—'}
          </p>
        </div>
        {station.distanceKm != null ? (
          <p className="text-xs font-semibold text-ink-soft">{station.distanceKm} km</p>
        ) : null}
      </div>

      {place ? <p className="mt-2 text-sm text-ink-muted break-words">{place}</p> : null}
      {report?.quality ? (
        <div className="mt-2">
          <QualitySignals quality={report.quality} about={report.about} compact />
        </div>
      ) : updatedAt ? (
        <p className="mt-2 text-xs text-ink-soft">
          {report?.lastConfirmedAt ? 'Confirmed' : 'Updated'} {formatFuelAge(updatedAt)}
          {report?.sourceType === 'community' ? ' · Community reported' : ''}
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-soft">No recent fuel information</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button as={Link} href={`/fuel/stations/${station.id}`} variant="secondary" size="sm">
          View
        </Button>
        {showActions && report?.reportId && onConfirm ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onConfirm(report)}>
            Confirm
          </Button>
        ) : null}
      </div>
    </article>
  );
}
