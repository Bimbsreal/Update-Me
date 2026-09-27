'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import { EmptyState, StatusPill } from '@/components/admin/AdminUI';

export default function AdminSourceHealthPage() {
  const [data, setData] = useState({ items: [], counts: {} });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi
      .officialSourceHealth()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load source health'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Source health</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Synchronization status for government and official sources. Credentials are never shown.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Healthy', data.counts?.healthy],
          ['Delayed / warning', data.counts?.warning],
          ['Failing', data.counts?.failing],
          ['Disabled', data.counts?.disabled],
          ['Never synced', data.counts?.neverSynchronized],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-surface-border bg-white p-3">
            <p className="text-xs font-semibold uppercase text-ink-muted">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value ?? 0}</p>
          </div>
        ))}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!data.items?.length ? (
        <EmptyState message="No official sources configured." />
      ) : (
        <ul className="space-y-3" aria-label="Source health list">
          {data.items.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-surface-border bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/admin/official-sources/${s.id}`}
                    className="font-semibold text-brand-800 hover:underline"
                  >
                    {s.shortName || s.organizationName}
                  </Link>
                  <p className="text-sm text-ink-muted">{s.organizationName}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {s.ingestionMethod} · {s.agencyType}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <StatusPill status={s.healthStatus} />
                  <StatusPill status={s.status} />
                  {s.neverSynchronized ? <StatusPill status="never synced" /> : null}
                </div>
              </div>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-ink-muted">Last attempt</dt>
                  <dd className="font-medium">
                    {s.lastAttemptAt ? new Date(s.lastAttemptAt).toLocaleString('en-NG') : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Last success</dt>
                  <dd className="font-medium">
                    {s.lastSuccessAt ? new Date(s.lastSuccessAt).toLocaleString('en-NG') : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Last failure</dt>
                  <dd className="font-medium">
                    {s.lastFailureAt ? new Date(s.lastFailureAt).toLocaleString('en-NG') : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Last run</dt>
                  <dd className="font-medium">
                    {s.lastRun
                      ? `${s.lastRun.status} · +${s.lastRun.created} / ~${s.lastRun.duplicatesIgnored} dup`
                      : '—'}
                  </dd>
                </div>
              </dl>
              {s.lastErrorMessage ? (
                <p className="mt-2 text-xs text-red-700 break-words">{s.lastErrorMessage}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
