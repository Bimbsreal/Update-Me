import { cn } from '@/lib/cn';
import { statusClassMap } from '@/lib/status';

const dots = {
  normal: 'bg-status-normal',
  available: 'bg-status-available',
  caution: 'bg-status-caution',
  attention: 'bg-status-attention',
  urgent: 'bg-status-urgent',
  official: 'bg-status-official',
  expired: 'bg-status-expired',
};

export function StatusIndicator({ status = 'normal', label, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-pill border px-2.5 py-1 text-xs font-semibold',
        statusClassMap[status],
        className
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', dots[status])} />
      {label}
    </span>
  );
}
