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

export default function AdminCommunityPage() {
  const [filters, setFilters] = useState({ type: 'questions', q: '', status: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi
      .community({ ...filters, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load community'));
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function moderate(item, action, reason) {
    const queueId = `${item.contentType}:${item.id}`;
    await adminApi.moderationAction(queueId, { action, reason });
    load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Community moderation</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Questions and answers — remove from public display without destroying history.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <FilterSelect
          label="Type"
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
        >
          <option value="questions">Questions</option>
          <option value="answers">Answers</option>
        </FilterSelect>
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
          <option value="open">Open</option>
          <option value="answered">Answered</option>
          <option value="active">Active</option>
          <option value="flagged">Flagged</option>
          <option value="under_review">Under review</option>
          <option value="removed">Removed</option>
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
        <EmptyState message="No community items found." />
      ) : (
        <ul className="space-y-3">
          {data.items.map((item) => (
            <li key={item.id} className="rounded-xl border border-surface-border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs uppercase text-ink-muted">{item.contentType}</p>
                  <h2 className="font-bold break-words">{item.title}</h2>
                  {item.summary ? (
                    <p className="mt-1 text-sm text-ink-muted break-words">{item.summary}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-muted">
                    {item.creatorName || 'Unknown'}
                    {item.locationName ? ` · ${item.locationName}` : ''}
                  </p>
                </div>
                <StatusPill status={item.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ConfirmAction
                  label="Remove"
                  danger
                  onConfirm={(reason) => moderate(item, 'remove', reason)}
                />
                <ConfirmAction
                  label="Restore"
                  onConfirm={(reason) => moderate(item, 'restore', reason)}
                />
                <ConfirmAction
                  label="Under review"
                  onConfirm={(reason) => moderate(item, 'under_review', reason)}
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
