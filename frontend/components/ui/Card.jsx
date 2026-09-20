import { cn } from '@/lib/cn';

export function Card({ children, className, padded = true, ...props }) {
  return (
    <div
      className={cn(
        'rounded-card border border-surface-border bg-white shadow-card',
        padded && 'p-5 md:p-6',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
