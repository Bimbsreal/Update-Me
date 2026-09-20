'use client';

import Link from 'next/link';
import { ReportTrustLabel } from '@/components/reports/ReportTrustLabel';
import { QualitySignals } from '@/components/quality/QualitySignals';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { causeLabel, severityClass, severityMeta } from '@/lib/traffic';

export function TrafficCard({
  traffic,
  className,
  showActions = false,
  onConfirm,
  onCorrect,
  compact = false,
}) {
  if (!traffic) return null;
  const severity = severityMeta(traffic.severity);
  const road =
    traffic.road?.name ||
    traffic.location?.name ||
    'Location update';
  const direction = traffic.direction?.label;
  const freshness = traffic.report?.freshness;
  const quality = traffic.report?.quality;

  return (
    <article
      className={cn(
        'rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5',
        traffic.report?.sourceType === 'official' && 'border-status-official/30',
        (freshness === 'stale' || quality?.freshness?.state === 'stale') && 'opacity-90',
        (freshness === 'expired' || quality?.freshness?.state === 'expired') && 'opacity-75',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-pill border px-2.5 py-1 text-xs font-bold',
            severityClass(traffic.severity)
          )}
        >
          {severity.label}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {(traffic.report?.trustLabels || [])
            .filter((label) => !(traffic.report?.sourceType === 'community' && label === 'Official'))
            .slice(0, 2)
            .map((label) => (
              <ReportTrustLabel
                key={label}
                label={label}
                sourceType={traffic.report?.sourceType}
              />
            ))}
        </div>
      </div>

      <h3 className={cn('mt-3 font-bold text-ink break-words', compact ? 'text-base' : 'text-lg')}>
        {severity.label} traffic
      </h3>
      <p className="mt-1 text-sm font-semibold text-ink break-words">{road}</p>
      {direction ? (
        <p className="mt-1 text-sm text-ink-muted break-words">{direction}</p>
      ) : null}

      {!compact && traffic.cause ? (
        <p className="mt-2 text-sm text-ink-muted">
          Possible cause: <span className="font-medium text-ink">{causeLabel(traffic.cause)}</span>
        </p>
      ) : null}

      {!compact && traffic.affectedSection ? (
        <p className="mt-1 text-sm text-ink-muted break-words">
          Affected: {traffic.affectedSection}
        </p>
      ) : null}

      <div className="mt-3">
        <QualitySignals
          quality={quality}
          about={traffic.report?.about}
          conflict={traffic.conflict}
          compact={compact}
        />
      </div>

      <div className="mt-2 text-xs text-ink-muted">
        Confirmed accurate:{' '}
        <strong className="text-ink">{traffic.report?.confirmation?.stillAccurate || 0}</strong>
        {' · '}
        Needs update:{' '}
        <strong className="text-ink">{traffic.report?.confirmation?.noLongerAccurate || 0}</strong>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/traffic/${traffic.id}`}
          className="inline-flex min-h-9 items-center rounded-control border border-surface-border px-3 text-sm font-semibold text-ink hover:border-brand-300"
        >
          Details
        </Link>
        {showActions ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => onConfirm?.(traffic)}>
              Still accurate
            </Button>
            <Button size="sm" variant="outline" onClick={() => onCorrect?.(traffic)}>
              No longer accurate
            </Button>
          </>
        ) : null}
      </div>
    </article>
  );
}
