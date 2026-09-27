'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import { EmptyState, StatusPill } from '@/components/admin/AdminUI';
import { AdminPageHeader } from '@/components/admin/AdminContext';

export default function AdminRolesPage() {
  const searchParams = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [focus, setFocus] = useState(searchParams.get('focus') || 'super_admin');
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [openGroups, setOpenGroups] = useState({});

  const load = useCallback(() => {
    adminApi
      .roleCatalog()
      .then((d) => {
        setCatalog(d);
        const code = searchParams.get('focus') || d.roles?.[0]?.code || 'super_admin';
        setFocus(code);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load roles'));
  }, [searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!focus) return;
    adminApi
      .roleDetail(focus)
      .then((d) => {
        setDetail(d.role);
        const open = {};
        (d.role?.permissionGroups || []).forEach((g) => {
          open[g.group] = true;
        });
        setOpenGroups(open);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load role'));
  }, [focus]);

  const roles = catalog?.roles || [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        breadcrumb="Users & access"
        title="Roles & Permissions"
        subtitle="Code-defined RBAC matrix. Assign roles to staff — the matrix itself is not editable at runtime."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {catalog?.note ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
          {catalog.note}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Roles">
        {roles.map((r) => (
          <button
            key={r.code}
            type="button"
            role="tab"
            aria-selected={focus === r.code}
            onClick={() => setFocus(r.code)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:text-sm ${
              focus === r.code
                ? 'bg-brand-700 text-white'
                : 'border border-surface-border bg-white text-ink hover:bg-surface-muted'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Matrix overview — cards on mobile, compact table on desktop */}
      <section className="rounded-xl border border-surface-border bg-white p-3 sm:p-4">
        <h2 className="text-sm font-bold text-ink">Permission matrix</h2>
        <div className="mt-3 hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs uppercase text-ink-muted">
                <th className="py-2 pr-3 font-semibold">Permission</th>
                {roles.map((r) => (
                  <th key={r.code} className="px-2 py-2 text-center font-semibold">
                    {r.label.replace(' Admin', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(catalog?.permissionGroups || []).flatMap((g) =>
                g.permissions.map((p) => (
                  <tr key={p.code} className="border-t border-surface-border">
                    <td className="py-2 pr-3">
                      <span className="text-xs text-ink-muted">{g.group}</span>
                      <br />
                      {p.label}
                    </td>
                    {roles.map((r) => {
                      const granted = (r.permissions || []).includes(p.code);
                      return (
                        <td key={`${r.code}-${p.code}`} className="px-2 py-2 text-center">
                          <span
                            className={granted ? 'font-bold text-emerald-800' : 'text-ink-muted'}
                            aria-label={granted ? 'Granted' : 'Not granted'}
                          >
                            {granted ? '✓' : '—'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <ul className="mt-3 space-y-2 lg:hidden">
          {(catalog?.permissionGroups || []).map((g) => (
            <li key={g.group} className="rounded-lg border border-surface-border p-3">
              <p className="text-xs font-semibold uppercase text-ink-muted">{g.group}</p>
              <ul className="mt-2 space-y-2">
                {g.permissions.map((p) => (
                  <li key={p.code}>
                    <p className="text-sm font-medium">{p.label}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {roles.map((r) => {
                        const granted = (r.permissions || []).includes(p.code);
                        return (
                          <span
                            key={r.code}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              granted
                                ? 'bg-emerald-50 text-emerald-900'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {r.label.split(' ')[0]}
                            {granted ? ' ✓' : ''}
                          </span>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {detail ? (
        <section className="rounded-xl border border-surface-border bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">{detail.label}</h2>
              <p className="mt-1 text-sm text-ink-muted">{detail.description}</p>
            </div>
            <StatusPill status="active" />
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-muted">Staff using role</dt>
              <dd className="font-semibold tabular-nums">{detail.staffCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Permissions</dt>
              <dd className="font-semibold tabular-nums">{detail.permissions?.length || 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Last role change</dt>
              <dd className="text-xs">
                {detail.lastModifiedAt
                  ? `${new Date(detail.lastModifiedAt).toLocaleString()}${
                      detail.lastModifiedBy ? ` · ${detail.lastModifiedBy}` : ''
                    }`
                  : '—'}
              </dd>
            </div>
          </dl>

          <div className="mt-4 space-y-2">
            {(detail.permissionGroups || []).map((g) => (
              <details
                key={g.group}
                open={openGroups[g.group]}
                className="rounded-lg border border-surface-border"
              >
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                  {g.group}
                </summary>
                <ul className="space-y-1 border-t border-surface-border px-3 py-2">
                  {g.permissions.map((p) => (
                    <li key={p.code} className="flex items-center gap-2 text-sm">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded border text-xs ${
                          p.granted
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                            : 'border-slate-200 bg-slate-50 text-slate-400'
                        }`}
                        aria-hidden
                      >
                        {p.granted ? '✓' : ''}
                      </span>
                      <span className={p.granted ? 'text-ink' : 'text-ink-muted'}>{p.label}</span>
                      <span className="sr-only">{p.granted ? 'Granted' : 'Not granted'}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>

          <p className="mt-4 text-xs text-ink-muted">
            Assign this role from{' '}
            <Link href="/admin/users" className="font-semibold text-brand-700">
              Admin Users
            </Link>
            .
          </p>
        </section>
      ) : (
        <EmptyState message="Select a role to inspect permissions." />
      )}
    </div>
  );
}
