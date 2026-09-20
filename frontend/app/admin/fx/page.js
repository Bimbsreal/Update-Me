'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/api';
import { EmptyState } from '@/components/admin/AdminUI';

export default function AdminFxPage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminApi
      .fx()
      .then((d) => setStatus(d.status))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load FX status'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setBusy(true);
    setError('');
    try {
      await adminApi.fxSync();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }

  if (!status && !error) {
    return <p className="text-sm text-ink-muted">Loading FX status…</p>;
  }

  const syncState = status?.sync || status || {};
  const sources = status?.sources || [];
  const pairs = status?.supportedPairs || status?.pairs || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FX management</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Provider status and synchronization only. Rates cannot be invented in the admin UI.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={sync}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Syncing…' : 'Manual sync'}
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-surface-border bg-white p-4">
          <p className="text-xs font-semibold uppercase text-ink-muted">Last successful sync</p>
          <p className="mt-2 text-sm font-semibold">
            {syncState.lastSuccessfulSyncAt
              ? new Date(syncState.lastSuccessfulSyncAt).toLocaleString()
              : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-surface-border bg-white p-4">
          <p className="text-xs font-semibold uppercase text-ink-muted">Last attempt</p>
          <p className="mt-2 text-sm font-semibold">
            {syncState.lastAttemptAt ? new Date(syncState.lastAttemptAt).toLocaleString() : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-surface-border bg-white p-4">
          <p className="text-xs font-semibold uppercase text-ink-muted">Observations</p>
          <p className="mt-2 text-sm font-semibold">{status?.observationCount ?? '—'}</p>
        </div>
      </div>

      <section className="rounded-xl border border-surface-border bg-white p-4">
        <h2 className="font-bold">Configured providers</h2>
        {!sources.length ? (
          <EmptyState message="No FX providers configured." />
        ) : (
          <ul className="mt-3 space-y-2">
            {sources.map((s) => (
              <li key={s.id || s.providerKey} className="text-sm">
                <span className="font-semibold">{s.displayName || s.providerKey || s.id}</span>
                <span className="text-ink-muted">
                  {' '}
                  · {s.status || 'configured'}
                  {s.lastSuccessAt
                    ? ` · last success ${new Date(s.lastSuccessAt).toLocaleString()}`
                    : ''}
                  {s.lastErrorMessage ? ` · error: ${s.lastErrorMessage}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-surface-border bg-white p-4">
        <h2 className="font-bold">Supported pairs</h2>
        <p className="mt-2 text-sm text-ink-muted">
          {Array.isArray(pairs) && pairs.length
            ? pairs
                .map((p) => (typeof p === 'string' ? p : `${p.base}/${p.quote}`))
                .join(', ')
            : status?.currencies?.join?.(', ') || 'See FX public API for pairs.'}
        </p>
      </section>
    </div>
  );
}
