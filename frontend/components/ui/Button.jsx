import { cn } from '@/lib/cn';

const variants = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 shadow-soft border border-transparent',
  secondary:
    'bg-white text-ink border border-ink/15 hover:border-brand-600/40 hover:text-brand-700',
  ghost: 'bg-transparent text-ink hover:bg-surface-muted border border-transparent',
  outline:
    'bg-transparent text-ink border border-ink/20 hover:border-brand-600 hover:text-brand-700',
};

const sizes = {
  sm: 'h-9 px-3 text-sm rounded-control',
  md: 'h-11 px-5 text-sm rounded-control',
  lg: 'h-12 px-6 text-base rounded-control',
};

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  as: Comp = 'button',
  ...props
}) {
  return (
    <Comp
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
