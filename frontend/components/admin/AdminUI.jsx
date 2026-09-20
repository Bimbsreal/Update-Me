'use client';

export function AdminCard({ title, value, hint, href }) {
  const inner = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-ink">{value ?? '—'}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </>
  );
  const className =
    'block rounded-xl border border-surface-border bg-white p-4 shadow-sm transition hover:border-brand-200';
  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }
  return <div className={className}>{inner}</div>;
}

export function AdminFilters({ children, onSubmit }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(e);
      }}
      className="mb-4 grid gap-2 rounded-xl border border-surface-border bg-white p-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {children}
      <button
        type="submit"
        className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white sm:col-span-2 lg:col-span-1"
      >
        Apply filters
      </button>
    </form>
  );
}

export function FilterInput({ label, ...props }) {
  return (
    <label className="block text-xs font-medium text-ink-muted">
      {label}
      <input
        {...props}
        className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm text-ink"
      />
    </label>
  );
}

export function FilterSelect({ label, children, ...props }) {
  return (
    <label className="block text-xs font-medium text-ink-muted">
      {label}
      <select
        {...props}
        className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm text-ink"
      >
        {children}
      </select>
    </label>
  );
}

export function StatusPill({ status }) {
  const tone =
    status === 'flagged' ||
    status === 'removed' ||
    status === 'suspended' ||
    status === 'failing' ||
    status === 'failed'
      ? 'bg-red-50 text-red-800'
      : status === 'under_review' ||
          status === 'stale' ||
          status === 'warning' ||
          status === 'partial'
        ? 'bg-amber-50 text-amber-900'
        : status === 'confirmed' ||
            status === 'active' ||
            status === 'published' ||
            status === 'healthy' ||
            status === 'success' ||
            status === 'verified'
          ? 'bg-emerald-50 text-emerald-800'
          : 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {status || '—'}
    </span>
  );
}

export function EmptyState({ message }) {
  return (
    <p className="rounded-xl border border-dashed border-surface-border bg-white px-4 py-8 text-center text-sm text-ink-muted">
      {message}
    </p>
  );
}

export function ConfirmAction({ label, danger, onConfirm, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        const reason = window.prompt(`${label}\n\nEnter a reason (required):`);
        if (!reason || reason.trim().length < 3) return;
        const ok = window.confirm(`Confirm: ${label}?`);
        if (!ok) return;
        onConfirm(reason.trim());
      }}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
        danger
          ? 'bg-red-50 text-red-800 hover:bg-red-100'
          : 'bg-surface-muted text-ink hover:bg-brand-50'
      }`}
    >
      {label}
    </button>
  );
}

export function Pagination({ page, total, limit, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 30)));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-2 text-sm">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="rounded-lg border border-surface-border px-3 py-1.5 disabled:opacity-40"
      >
        Previous
      </button>
      <span className="text-ink-muted">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        className="rounded-lg border border-surface-border px-3 py-1.5 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
