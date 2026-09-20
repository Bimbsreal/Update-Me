import { cn } from '@/lib/cn';

export function Input({
  className,
  label,
  id,
  hint,
  error,
  ...props
}) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      {label ? <span className="text-sm font-medium text-ink">{label}</span> : null}
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          'h-11 w-full rounded-control border bg-white px-3.5 text-sm text-ink placeholder:text-ink-soft outline-none transition focus:ring-2',
          error
            ? 'border-status-urgent focus:border-status-urgent focus:ring-status-urgent/20'
            : 'border-surface-border focus:border-brand-500 focus:ring-brand-500/20',
          className
        )}
        {...props}
      />
      {error ? (
        <span id={`${id}-error`} className="block text-xs font-medium text-status-urgent" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function Select({ className, label, id, error, children, ...props }) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      {label ? <span className="text-sm font-medium text-ink">{label}</span> : null}
      <select
        id={id}
        aria-invalid={Boolean(error)}
        className={cn(
          'h-11 w-full rounded-control border bg-white px-3.5 text-sm text-ink outline-none transition focus:ring-2',
          error
            ? 'border-status-urgent focus:border-status-urgent focus:ring-status-urgent/20'
            : 'border-surface-border focus:border-brand-500 focus:ring-brand-500/20',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <span className="block text-xs font-medium text-status-urgent" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return (
    <div
      className="rounded-control border border-status-urgent/30 bg-red-50 px-3 py-2 text-sm text-status-urgent"
      role="alert"
    >
      {message}
    </div>
  );
}
