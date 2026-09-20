'use client';

import Link from 'next/link';
import { ReportStatusBadge, ReportTrustLabel } from '@/components/reports/ReportTrustLabel';
import { QualitySignals } from '@/components/quality/QualitySignals';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

function CategoryIcon({ code }) {
  const props = {
    className: 'h-4 w-4',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    'aria-hidden': true,
  };
  switch (code) {
    case 'traffic':
      return (
        <svg {...props}>
          <path d="M4 16h16M7 16V9a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v7M9 19h.01M15 19h.01" />
        </svg>
      );
    case 'fuel':
      return (
        <svg {...props}>
          <path d="M7 20V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14M7 10h8M17 8h2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 2.5" />
        </svg>
      );
  }
}

export function ReportCard({
  report,
  className,
  onConfirm,
  onCorrect,
  onFlag,
  showActions = false,
  compact = false,
}) {
  if (!report) return null;

  const locationLabel = [
    report.location?.name,
    report.location?.subtitle ||
      [report.location?.lga?.name, report.location?.state?.name].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article
      className={cn(
        'rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5',
        report.sourceType === 'official' && 'border-status-official/30',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-brand-700">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <CategoryIcon code={report.category?.code} />
          </span>
          <span className="truncate">{report.category?.name || 'Report'}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ReportStatusBadge status={report.status} />
          {(report.trustLabels || [])
            .filter((label) => !(report.sourceType === 'community' && label === 'Official'))
            .slice(0, 3)
            .map((label) => (
              <ReportTrustLabel key={label} label={label} sourceType={report.sourceType} />
            ))}
        </div>
      </div>

      <h3 className={cn('mt-3 font-bold text-ink break-words', compact ? 'text-base' : 'text-lg')}>
        {report.title}
      </h3>

      {!compact ? (
        <p className="mt-2 text-sm leading-relaxed text-ink-muted break-words whitespace-pre-wrap">
          {report.description}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span className="min-w-0 break-words">{locationLabel}</span>
      </div>

      <div className="mt-2">
        <QualitySignals quality={report.quality} about={report.about} compact={compact} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <span>
          Confirmed accurate: <strong className="text-ink">{report.confirmation?.stillAccurate || 0}</strong>
        </span>
        <span>
          Needs update:{' '}
          <strong className="text-ink">{report.confirmation?.noLongerAccurate || 0}</strong>
        </span>
        {report.sourceType === 'community' ? (
          <span className="rounded-pill bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">
            Community source
          </span>
        ) : report.sourceType === 'official' ? (
          <span className="rounded-pill bg-status-official/10 px-2 py-0.5 font-semibold text-status-official">
            Official source
          </span>
        ) : null}
      </div>

      {showActions ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onConfirm?.(report)}>
            Still accurate
          </Button>
          <Button size="sm" variant="outline" onClick={() => onCorrect?.(report)}>
            No longer accurate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onFlag?.(report)}>
            Flag
          </Button>
          <Link
            href={`/app/report?focus=${report.id}`}
            className="inline-flex min-h-9 items-center px-2 text-sm font-semibold text-brand-700 hover:underline"
          >
            Details
          </Link>
        </div>
      ) : null}
    </article>
  );
}
