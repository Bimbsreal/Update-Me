'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/api';
import {
  ConfirmAction,
  EmptyState,
  FilterInput,
  FilterSelect,
  Pagination,
  StatusPill,
} from '@/components/admin/AdminUI';
import { useAuth } from '@/components/auth/AuthProvider';

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [filters, setFilters] = useState({ q: '', status: '', role: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi
      .users({ ...filters, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load users'));
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function openUser(id) {
    try {
      const d = await adminApi.user(id);
      setSelected(d.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load user');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User management</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Basic account info only — passwords and secrets are never shown.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <FilterInput
          label="Search"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </FilterSelect>
        <FilterSelect
          label="Role"
          value={filters.role}
          onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}
        >
          <option value="">Any</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="moderator">Moderator</option>
          <option value="data_manager">Data Manager</option>
        </FilterSelect>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            load();
          }}
          className="self-end rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
        >
          Apply
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {!data.items?.length ? (
            <EmptyState message="No users found." />
          ) : (
            <ul className="space-y-2">
              {data.items.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => openUser(u.id)}
                    className="flex w-full flex-col gap-1 rounded-xl border border-surface-border bg-white p-3 text-left hover:border-brand-200 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold">{u.displayName}</p>
                      <p className="text-xs text-ink-muted">{u.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {u.adminRole ? <StatusPill status={u.adminRole} /> : null}
                      {u.isSuspended ? <StatusPill status="suspended" /> : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <div className="rounded-xl border border-surface-border bg-white p-4 shadow-sm">
              <h2 className="font-bold">{selected.displayName}</h2>
              <p className="text-sm text-ink-muted">{selected.email}</p>
              <p className="mt-2 text-xs text-ink-muted">
                Phone: {selected.phone || '—'}
                <br />
                Area: {selected.areaName || '—'}
                <br />
                Role: {selected.adminRole || 'none'}
                <br />
                Joined:{' '}
                {selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : '—'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.isSuspended ? (
                  <ConfirmAction
                    label="Restore account"
                    onConfirm={async (reason) => {
                      await adminApi.restoreUser(selected.id, { reason });
                      openUser(selected.id);
                      load();
                    }}
                  />
                ) : (
                  <ConfirmAction
                    label="Suspend"
                    danger
                    onConfirm={async (reason) => {
                      await adminApi.suspendUser(selected.id, { reason });
                      openUser(selected.id);
                      load();
                    }}
                  />
                )}
                {me?.adminRole === 'super_admin' ? (
                  <ConfirmAction
                    label="Set moderator"
                    onConfirm={async (reason) => {
                      await adminApi.setUserRole(selected.id, { role: 'moderator', reason });
                      openUser(selected.id);
                      load();
                    }}
                  />
                ) : null}
              </div>
              {selected.moderationHistory?.length ? (
                <div className="mt-4 border-t border-surface-border pt-3">
                  <p className="text-xs font-semibold uppercase text-ink-muted">History</p>
                  <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                    {selected.moderationHistory.map((h, i) => (
                      <li key={`${h.action}-${i}`}>
                        {h.action} · {h.reason || '—'} ·{' '}
                        {h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState message="Select a user to inspect." />
          )}
        </div>
      </div>
    </div>
  );
}
