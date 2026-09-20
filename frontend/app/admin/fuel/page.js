'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/api';
import { ConfirmAction, EmptyState, FilterInput, Pagination, StatusPill } from '@/components/admin/AdminUI';

export default function AdminFuelPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi
      .fuelStations({ q, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load stations'));
  }, [q, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Fuel stations</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Lightweight station status management — not an advertising platform.
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
        <EmptyState message="No fuel stations found." />
      ) : (
        <ul className="space-y-2">
          {data.items.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-xl border border-surface-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-ink-muted">{s.location?.name || 'No location'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={s.isActive ? 'active' : 'inactive'} />
                <ConfirmAction
                  label={s.isActive ? 'Deactivate' : 'Activate'}
                  danger={s.isActive}
                  onConfirm={async (reason) => {
                    await adminApi.patchFuelStation(s.id, { isActive: !s.isActive, reason });
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
