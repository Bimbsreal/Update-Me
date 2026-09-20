'use client';

import Link from 'next/link';
import { ReportTrustLabel, ReportStatusBadge } from '@/components/reports/ReportTrustLabel';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
  alertCategoryLabel,
  alertFreshnessLabel,
  alertSeverityClass,
  alertSeverityMeta,
} from '@/lib/alerts';

export function AlertCard({ alert, compact = false, className }) {
  if (!alert) return null;
  const severity = alertSeverityMeta(alert.severity);
  const href = `/alerts/${alert.id}`;

  return (
    <article
      className={cn(
        'rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5',
        className
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-pill border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide',
            alertSeverityClass(alert.severity)
          )}
        >
          {severity.label}
        </span>
        <span className="inline-flex items-center rounded-pill border border-surface-border bg-surface-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          {alert.alertCategoryLabel || alertCategoryLabel(alert.alertCategory)}
        </span>
        <ReportStatusBadge status={alert.report?.status} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {(alert.report?.trustLabels || []).map((label) => (
          <ReportTrustLabel key={label} label={label} sourceType={alert.report?.sourceType} />
        ))}
      </div>

      <h3 className={cn('mt-3 font-bold text-ink break-words', compact ? 'text-base' : 'text-lg')}>
        {alert.report?.title}
      </h3>

      {(alert.road?.name || alert.location?.name) && (
        <p className="mt-2 text-sm text-ink-muted break-words">
          {alert.road?.name || alert.location?.name}
        </p>
      )}

      <p className="mt-2 text-xs text-ink-soft">{alertFreshnessLabel(alert)}</p>

      <div className="mt-4">
        <Button as={Link} href={href} variant="secondary" size="sm">
          View details
        </Button>
      </div>
    </article>
  );
}
