'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import { EmptyState, StatusPill } from '@/components/admin/AdminUI';

export default function AdminIngestionRunsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [sources, setSources] = useState([]);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setError('');
    adminApi
      .ingestionRuns({
        status: status || undefined,
        sourceId: sourceId || undefined,
        page,
        limit: 25,
      })
      .then((d) => {
        setItems(d.items || []);
        setTotal(d.total || 0);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load runs'));
  }, [status, sourceId, page]);

  useEffect(() => {
    adminApi
      .officialSources()
      .then((d) => setSources(d.sources || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ingestion runs</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Traceable sync results for approved official sources. Secrets are never shown.
          </p>
        </div>
        <Link
          href="/admin/official-sources"
          className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold"
        >
          Data sources
        </Link>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <label className="text-xs font-medium text-ink-muted">
          Source
          <select
            value={sourceId}
            onChange={(e) => {
              setPage(1);
              setSourceId(e.target.value);
            }}
            className="mt-1 block min-h-11 w-full rounded-lg border border-surface-border px-3 py-2 text-sm sm:w-56"
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shortName || s.organizationName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-muted">
          Status
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
            className="mt-1 block min-h-11 w-full rounded-lg border border-surface-border px-3 py-2 text-sm sm:w-40"
          >
            <option value="">All</option>
            <option value="success">success</option>
            <option value="partial">partial</option>
            <option value="failed">failed</option>
          </select>
        </label>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!items.length ? (
        <EmptyState message="No ingestion runs yet." />
      ) : (
        <ul className="space-y-3">
          {items.map((run) => (
            <li
              key={run.id}
              className="rounded-xl border border-surface-border bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-bold break-words">{run.sourceName || run.sourceId}</h2>
                  <p className="text-xs text-ink-muted">
                    {run.triggerReason || 'sync'} ·{' '}
                    {run.startedAt ? new Date(run.startedAt).toLocaleString() : '—'}
                  </p>
                  <p className="mt-2 text-xs text-ink-muted">
                    Fetched {run.retrievedCount} · Accepted {run.addedCount} · Updated{' '}
                    {run.updatedCount} · Skipped {run.skippedCount} · Rejected {run.rejectedCount}
                  </p>
                  {run.errorMessage ? (
                    <p className="mt-1 text-xs text-red-700 break-words">{run.errorMessage}</p>
                  ) : null}
                </div>
                <StatusPill status={run.status} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="text-ink-muted">
          {total} run{total === 1 ? '' : 's'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="min-h-10 rounded-lg border border-surface-border px-3 py-1.5 font-semibold disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page * 25 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="min-h-10 rounded-lg border border-surface-border px-3 py-1.5 font-semibold disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
