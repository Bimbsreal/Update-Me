'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/api';
import { EmptyState, FilterInput, FilterSelect, Pagination } from '@/components/admin/AdminUI';

export default function AdminLocationsPage() {
  const [filters, setFilters] = useState({ q: '', type: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 40 });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi
      .locations({ ...filters, page, limit: 40 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load locations'));
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Location management</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Inspect states, LGAs, areas, roads, and places. Destructive edits are not available here.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <FilterInput
          label="Search"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <FilterSelect
          label="Type"
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
        >
          <option value="">All</option>
          <option value="state">State</option>
          <option value="lga">LGA</option>
          <option value="city">City/town</option>
          <option value="area">Area</option>
          <option value="road">Road</option>
          <option value="landmark">Landmark</option>
          <option value="place">Place</option>
        </FilterSelect>
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
        <EmptyState message="No locations found." />
      ) : (
        <ul className="space-y-2">
          {data.items.map((loc) => (
            <li
              key={loc.id}
              className="rounded-xl border border-surface-border bg-white px-4 py-3 text-sm"
            >
              <p className="font-semibold">{loc.name}</p>
              <p className="text-xs text-ink-muted">
                {loc.type}
                {loc.stateName ? ` · ${loc.stateName}` : ''}
                {loc.lgaName ? ` · ${loc.lgaName}` : ''}
                {loc.coordinates
                  ? ` · ${loc.coordinates.lat.toFixed(4)}, ${loc.coordinates.lng.toFixed(4)}`
                  : ' · incomplete coords'}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />
    </div>
  );
}
