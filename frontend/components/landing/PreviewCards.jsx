import { CategoryIcon } from '@/components/landing/CategoryIcon';
import { PreviewMeta, StatusPill } from '@/components/landing/FeatureCard';
import { cn } from '@/lib/cn';

function PreviewShell({ children, className, category }) {
  return (
    <article
      data-category={category}
      className={cn(
        'rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5',
        className
      )}
    >
      {children}
    </article>
  );
}

export function TrafficCard({ report }) {
  return (
    <PreviewShell category="traffic">
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-red-50 text-status-urgent">
          <CategoryIcon name="traffic" />
        </div>
        <StatusPill status="urgent" label={report.title} />
      </div>
      <h3 className="mt-4 text-base font-bold text-ink">{report.place}</h3>
      <PreviewMeta>{report.freshnessLabel} · {report.meta}</PreviewMeta>
    </PreviewShell>
  );
}

export function FuelCard({ report }) {
  return (
    <PreviewShell category="fuel">
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-brand-50 text-brand-700">
          <CategoryIcon name="fuel" />
        </div>
        <StatusPill status={report.availability} label={report.availabilityLabel} />
      </div>
      <h3 className="mt-4 text-base font-bold text-ink">{report.title}</h3>
      <p className="mt-1 text-sm text-ink-muted">{report.place}</p>
      <p className="mt-3 text-xl font-extrabold text-brand-700">{report.priceLabel}</p>
      <PreviewMeta>{report.freshnessLabel} · {report.meta}</PreviewMeta>
    </PreviewShell>
  );
}

export function TransportCard({ report }) {
  return (
    <PreviewShell category="transport">
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-blue-50 text-status-official">
          <CategoryIcon name="transport" />
        </div>
        <StatusPill status="official" label={report.modeLabel} />
      </div>
      <h3 className="mt-4 text-base font-bold text-ink">{report.title}</h3>
      <p className="mt-3 text-xl font-extrabold text-status-official">{report.fareLabel}</p>
      <PreviewMeta>{report.freshnessLabel} · {report.meta}</PreviewMeta>
    </PreviewShell>
  );
}

export function AlertCard({ report }) {
  return (
    <PreviewShell category="local_alert">
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-orange-50 text-status-attention">
          <CategoryIcon name="alerts" />
        </div>
        <StatusPill status={report.status} label="Local alert" />
      </div>
      <h3 className="mt-4 text-base font-bold text-ink">{report.title}</h3>
      <p className="mt-1 text-sm text-ink-muted">{report.place}</p>
      <PreviewMeta>{report.freshnessLabel} · {report.meta}</PreviewMeta>
    </PreviewShell>
  );
}
