'use client';

import { createContext, useContext, useMemo } from 'react';

const AdminContext = createContext(null);

export function AdminProvider({ value, children }) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error('useAdmin must be used within AdminShell');
  }
  return ctx;
}

export function useAdminOptional() {
  return useContext(AdminContext);
}

export function useAdminPermission(permission) {
  const ctx = useAdminOptional();
  if (!permission) return true;
  return Boolean(ctx?.permissions?.includes(permission));
}

export function AdminPageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-800/70">
            {breadcrumb}
          </p>
        ) : null}
        <h1 className="mt-1 text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Compact attention list item for the dashboard. */
export function AttentionItem({ href, label, count, tone = 'attention' }) {
  const toneClass =
    tone === 'critical'
      ? 'border-red-200 bg-red-50/80 text-red-900'
      : tone === 'ok'
        ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900'
        : 'border-amber-200 bg-amber-50/80 text-amber-950';

  const content = (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${toneClass}`}
    >
      <span className="min-w-0 font-medium">{label}</span>
      {count != null ? (
        <span className="shrink-0 tabular-nums text-xs font-bold opacity-80">{count}</span>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block transition hover:opacity-90">
        {content}
      </a>
    );
  }
  return content;
}

export function QuickAction({ href, label, description, disabled }) {
  if (disabled || !href) return null;
  return (
    <a
      href={href}
      className="flex min-h-[4.5rem] flex-col justify-center rounded-xl border border-surface-border bg-white px-3 py-3 text-left shadow-sm transition hover:border-brand-300 hover:bg-brand-50/40"
    >
      <span className="text-sm font-semibold text-ink">{label}</span>
      {description ? <span className="mt-0.5 text-xs text-ink-muted">{description}</span> : null}
    </a>
  );
}

export function useAdminContextValue(adminMeta) {
  return useMemo(() => {
    const permissions = Array.isArray(adminMeta?.permissions) ? adminMeta.permissions : [];
    return {
      admin: adminMeta,
      role: adminMeta?.role || null,
      permissions,
      can: (permission) => !permission || permissions.includes(permission),
    };
  }, [adminMeta]);
}
