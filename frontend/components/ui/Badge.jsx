import { cn } from '@/lib/cn';
import { statusClassMap } from '@/lib/status';

export function Badge({ children, className, status, tone = 'brand' }) {
  const toneClasses = {
    brand: 'bg-brand-50 text-brand-700 border-brand-100',
    neutral: 'bg-surface-muted text-ink-muted border-surface-border',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-semibold tracking-wide',
        status ? statusClassMap[status] : toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
