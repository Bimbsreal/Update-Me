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

export default function AdminOfficialUpdatesPage() {
  const [filters, setFilters] = useState({ q: '', agency: '', category: '', status: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi
      .officialUpdates({ ...filters, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load updates'));
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Official updates</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Inspect imported agency updates. Original wording and source URL are preserved — admins
          cannot rewrite agency content.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <FilterInput
          label="Search"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <FilterInput
          label="Agency"
          value={filters.agency}
          onChange={(e) => setFilters((f) => ({ ...f, agency: e.target.value }))}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
          <option value="withdrawn">Withdrawn</option>
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

      {!data.items?.length ? (
        <EmptyState message="No official updates found." />
      ) : (
        <ul className="space-y-3">
          {data.items.map((u) => (
            <li key={u.id} className="rounded-xl border border-surface-border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-bold break-words">{u.title}</h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    {u.agency} · {u.category}
                    {u.location?.name ? ` · ${u.location.name}` : ''}
                  </p>
                  {u.summary ? (
                    <p className="mt-2 text-sm text-ink-muted break-words">{u.summary}</p>
                  ) : null}
                  {u.originalUrl ? (
                    <a
                      href={u.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block break-all text-xs font-semibold text-brand-700"
                    >
                      Original source
                    </a>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-muted">
                    Retrieved: {u.retrievedAt ? new Date(u.retrievedAt).toLocaleString() : '—'}
                  </p>
                </div>
                <StatusPill status={u.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {u.status === 'published' ? (
                  <ConfirmAction
                    label="Hide / archive"
                    danger
                    onConfirm={async (reason) => {
                      await adminApi.hideOfficialUpdate(u.id, { reason });
                      load();
                    }}
                  />
                ) : (
                  <ConfirmAction
                    label="Restore"
                    onConfirm={async (reason) => {
                      await adminApi.restoreOfficialUpdate(u.id, { reason });
                      load();
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />
    </div>
  );
}
