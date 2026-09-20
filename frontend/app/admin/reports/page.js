'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminApi, ApiError } from '@/lib/api';
import {
  AdminFilters,
  EmptyState,
  FilterInput,
  FilterSelect,
  Pagination,
  StatusPill,
} from '@/components/admin/AdminUI';

function ReportsInner() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState({
    q: '',
    category: '',
    status: searchParams.get('status') || '',
    source: '',
    flagged: searchParams.get('flagged') || '',
    from: '',
    to: '',
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi
      .reports({ ...filters, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load reports'));
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Report management</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Search and filter the Generic Report Engine — Traffic, Fuel, Transport, Prices, Alerts,
          Directions, and more.
        </p>
      </div>

      <AdminFilters
        onSubmit={() => {
          setPage(1);
          load();
        }}
      >
        <FilterInput
          label="Search"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <FilterSelect
          label="Category"
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
        >
          <option value="">All</option>
          <option value="traffic">Traffic</option>
          <option value="fuel">Fuel</option>
          <option value="transport">Transport</option>
          <option value="prices">Prices</option>
          <option value="local_alerts">Alerts</option>
          <option value="directions">Directions</option>
          <option value="other">Other</option>
        </FilterSelect>
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All</option>
          <option value="submitted">Submitted</option>
          <option value="active">Active</option>
          <option value="confirmed">Confirmed</option>
          <option value="stale">Stale</option>
          <option value="expired">Expired</option>
          <option value="flagged">Flagged</option>
          <option value="under_review">Under review</option>
          <option value="removed">Removed</option>
        </FilterSelect>
        <FilterSelect
          label="Source"
          value={filters.source}
          onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
        >
          <option value="">All</option>
          <option value="community">Community</option>
          <option value="official">Official</option>
          <option value="aggregated">Aggregated</option>
        </FilterSelect>
        <FilterSelect
          label="Flagged"
          value={filters.flagged}
          onChange={(e) => setFilters((f) => ({ ...f, flagged: e.target.value }))}
        >
          <option value="">Any</option>
          <option value="true">Flagged only</option>
        </FilterSelect>
        <FilterInput
          label="From"
          type="date"
          value={filters.from ? filters.from.slice(0, 10) : ''}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              from: e.target.value ? new Date(e.target.value).toISOString() : '',
            }))
          }
        />
        <FilterInput
          label="To"
          type="date"
          value={filters.to ? filters.to.slice(0, 10) : ''}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              to: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : '',
            }))
          }
        />
      </AdminFilters>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!data.items?.length ? (
        <EmptyState message="No reports match these filters." />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-surface-border bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-surface-border bg-surface-muted text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="border-b border-surface-border/70">
                    <td className="max-w-xs truncate px-3 py-2 font-medium">{r.title}</td>
                    <td className="px-3 py-2">{r.category}</td>
                    <td className="px-3 py-2">{r.location?.name || '—'}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {data.items.map((r) => (
              <li key={r.id} className="rounded-xl border border-surface-border bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="break-words font-semibold">{r.title}</p>
                  <StatusPill status={r.status} />
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {r.category}
                  {r.location?.name ? ` · ${r.location.name}` : ''}
                </p>
              </li>
            ))}
          </ul>

          <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />
        </>
      )}
    </div>
  );
}

export default function AdminReportsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Loading reports…</p>}>
      <ReportsInner />
    </Suspense>
  );
}
