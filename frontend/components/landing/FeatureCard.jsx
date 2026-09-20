import { cn } from '@/lib/cn';
import { statusClassMap } from '@/lib/status';
import { CategoryIcon } from '@/components/landing/CategoryIcon';

const accentStyles = {
  traffic: 'bg-red-50 text-status-urgent',
  fuel: 'bg-brand-50 text-brand-700',
  transport: 'bg-blue-50 text-status-official',
  prices: 'bg-orange-50 text-status-attention',
  directions: 'bg-brand-50 text-brand-700',
  alerts: 'bg-red-50 text-status-urgent',
};

export function FeatureCard({ title, body, accent = 'traffic', className }) {
  return (
    <article
      className={cn(
        'rounded-card border border-surface-border bg-white p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-soft sm:p-6',
        className
      )}
    >
      <div
        className={cn(
          'mb-4 inline-flex h-11 w-11 items-center justify-center rounded-control',
          accentStyles[accent] || accentStyles.traffic
        )}
      >
        <CategoryIcon name={accent} />
      </div>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
    </article>
  );
}

export function PreviewMeta({ children }) {
  return <p className="mt-2 text-xs text-ink-soft">{children}</p>;
}

export function StatusPill({ status, label }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold',
        statusClassMap[status] || statusClassMap.normal
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}
