'use client';

import Link from 'next/link';
import { ReportTrustLabel } from '@/components/reports/ReportTrustLabel';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatPriceAge, formatPriceRange } from '@/lib/prices';

export function CommodityPriceCard({ item, compact = false, className }) {
  if (!item) return null;
  const commodity = item.commodity;
  const variant = item.variant;
  const range = item.priceRange;
  const href = `/prices/${commodity?.slug || commodity?.code}/${variant?.code}`;

  return (
    <article
      className={cn(
        'rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="inline-flex items-center rounded-pill border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">
          {item.sourceLabel || 'Community Report'}
        </span>
        {item.reportCount ? (
          <span className="text-xs font-semibold text-ink-soft">
            {item.reportCount} recent report{item.reportCount === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      <h3 className={cn('mt-3 font-bold text-ink break-words', compact ? 'text-base' : 'text-lg')}>
        {commodity?.name}
      </h3>
      <p className="mt-1 text-sm font-medium text-ink-muted">{variant?.displayName}</p>

      <p className="mt-3 text-xl font-bold tabular-nums text-ink">
        {formatPriceRange(range) || '—'}
      </p>

      {item.location?.name ? (
        <p className="mt-2 text-sm text-ink-muted break-words">{item.location.name}</p>
      ) : null}
      {item.placeName ? (
        <p className="mt-1 text-xs text-ink-soft break-words">{item.placeName}</p>
      ) : null}
      {item.mostRecentAt ? (
        <p className="mt-2 text-xs text-ink-soft">
          Observed {formatPriceAge(item.mostRecentAt)}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button as={Link} href={href} variant="secondary" size="sm">
          View history
        </Button>
        <Button as={Link} href={`${href}?report=1`} size="sm" variant="outline">
          Report price
        </Button>
      </div>
    </article>
  );
}

export function PriceReportCard({ report, onConfirm, onCorrect }) {
  if (!report) return null;
  const unitLabel =
    report.variant?.displayName ||
    report.price?.unit?.symbol ||
    report.variant?.unit?.symbol ||
    report.variant?.unitCode ||
    '';
  const locationLabel =
    report.location?.area?.name ||
    report.location?.name ||
    report.place?.name ||
    null;
  const sourceLabel =
    report.source?.typeLabel ||
    report.report?.sourceTypeLabel ||
    (report.report?.trustLabels || [])[0] ||
    'Community report';
  const verificationLabel =
    report.verificationLabel ||
    report.report?.verificationLabel ||
    (report.verification === 'verified' || report.report?.verification === 'verified'
      ? 'Verified'
      : 'Unverified');
  const observedAt =
    report.observedAt || report.report?.observedAt || report.report?.occurredAt || report.createdAt;

  return (
    <article className="rounded-card border border-surface-border bg-white p-4 shadow-card">
      <div className="flex flex-wrap gap-1.5">
        <ReportTrustLabel label={sourceLabel} sourceType={report.report?.sourceType || report.source?.type} />
        {verificationLabel ? (
          <ReportTrustLabel label={verificationLabel} sourceType={report.report?.sourceType} />
        ) : null}
        {(report.report?.trustLabels || [])
          .filter((l) => l !== sourceLabel && !/verified|community|official|market/i.test(l))
          .map((label) => (
            <ReportTrustLabel key={label} label={label} sourceType={report.report?.sourceType} />
          ))}
      </div>
      <p className="mt-3 text-base font-bold text-ink tabular-nums">
        {formatPriceRange({
          min: report.price?.amount,
          max: report.price?.amount,
          currency: report.price?.currency,
          isRange: false,
        })}
        {unitLabel ? (
          <span className="text-sm font-semibold text-ink-muted"> / {unitLabel}</span>
        ) : null}
      </p>
      {locationLabel ? (
        <p className="mt-2 text-sm text-ink-muted break-words">{locationLabel}</p>
      ) : null}
      {report.place?.name && report.place.name !== locationLabel ? (
        <p className="mt-1 text-xs text-ink-soft break-words">{report.place.name}</p>
      ) : null}
      <p className="mt-2 text-xs text-ink-soft">
        {report.report?.lastConfirmedAt
          ? `Confirmed ${formatPriceAge(report.report.lastConfirmedAt)}`
          : `Observed ${formatPriceAge(observedAt)}`}
        {report.freshness || report.report?.freshness
          ? ` · ${String(report.freshness || report.report.freshness)}`
          : ''}
      </p>
      {(onConfirm || onCorrect) && report.id ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {onConfirm ? (
            <Button type="button" size="sm" variant="outline" onClick={() => onConfirm(report.id)}>
              Confirm
            </Button>
          ) : null}
          {onCorrect ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => onCorrect(report.id)}>
              No longer accurate
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
