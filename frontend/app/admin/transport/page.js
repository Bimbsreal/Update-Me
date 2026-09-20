'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/api';
import { ConfirmAction, EmptyState, FilterInput, Pagination, StatusPill } from '@/components/admin/AdminUI';

export default function AdminTransportPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi
      .transportRoutes({ q, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load routes'));
  }, [q, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Transport management</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Route visibility and structural status. Community fare history is preserved.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <FilterInput label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <button
          type="button"
          onClick={() => {
            setPage(1);
            load();
          }}
          className="self-end rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
        >
          Search
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!data.items?.length ? (
        <EmptyState message="No transport routes found." />
      ) : (
        <ul className="space-y-2">
          {data.items.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-xl border border-surface-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold">{r.name || 'Unnamed route'}</p>
                <p className="text-xs text-ink-muted">
                  {r.mode || '—'}
                  {r.origin?.name ? ` · ${r.origin.name}` : ''}
                  {r.destination?.name ? ` → ${r.destination.name}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={r.isActive ? 'active' : 'inactive'} />
                <ConfirmAction
                  label={r.isActive ? 'Deactivate' : 'Activate'}
                  danger={r.isActive}
                  onConfirm={async (reason) => {
                    await adminApi.patchTransportRoute(r.id, { isActive: !r.isActive, reason });
                    load();
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />
    </div>
  );
}
