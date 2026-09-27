'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { adminApi, ApiError } from '@/lib/api';
import { ConfirmAction, EmptyState, StatusPill } from '@/components/admin/AdminUI';

export default function AdminAgencyProfilePage() {
  const params = useParams();
  const id = params?.id;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    adminApi
      .officialAgency(id)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load agency'));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setBusy(true);
    setError('');
    try {
      await adminApi.syncOfficialSource(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  }

  if (!data?.source && !error) {
    return <p className="text-sm text-ink-muted">Loading agency…</p>;
  }

  const s = data?.source;
  const m = data?.metrics || {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/official-sources" className="text-sm font-semibold text-brand-700">
            ← Government & Official Sources
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            {s?.shortName || s?.organizationName || id}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{s?.organizationName}</p>
          <p className="mt-2 text-xs text-ink-soft max-w-2xl">{data?.trustNote}</p>
        </div>
        <ConfirmAction
          label={busy ? 'Syncing…' : 'Run sync'}
          disabled={busy || !s}
          onConfirm={async () => {
            await sync();
          }}
        />
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {s ? (
        <>
          <div className="flex flex-wrap gap-1">
            <StatusPill status={s.healthStatus} />
            <StatusPill status={s.status} />
            <StatusPill status={s.verificationStatus} />
            <span className="rounded-pill border border-surface-border px-2 py-0.5 text-xs font-semibold">
              Official source
            </span>
          </div>

          <dl className="grid gap-3 rounded-xl border border-surface-border bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-muted">Agency type</dt>
              <dd className="font-medium">{s.agencyType}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Jurisdiction</dt>
              <dd className="font-medium">
                {s.jurisdictionLevel}
                {s.stateName ? ` · ${s.stateName}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Integration</dt>
              <dd className="font-medium">{s.ingestionMethod}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Official reference</dt>
              <dd className="font-medium break-all">
                {s.officialWebsite ? (
                  <a href={s.officialWebsite} className="text-brand-700 hover:underline" rel="noreferrer">
                    {s.officialWebsite}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Last success</dt>
              <dd className="font-medium">
                {s.lastSuccessAt ? new Date(s.lastSuccessAt).toLocaleString('en-NG') : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Last attempt / failure</dt>
              <dd className="font-medium">
                {s.lastAttemptAt ? new Date(s.lastAttemptAt).toLocaleString('en-NG') : '—'}
                {s.lastErrorMessage ? (
                  <span className="mt-1 block text-xs text-red-700 break-words">{s.lastErrorMessage}</span>
                ) : null}
              </dd>
            </div>
          </dl>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Published updates', m.publishedTotal],
              ['Active (published)', m.activeUpdates],
              ['Pending review', m.pendingReview],
              ['Stale (7d+)', m.staleUpdates],
              ['Archived', m.archived],
              ['Rejected', m.rejected],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-surface-border bg-white p-3">
                <p className="text-xs font-semibold uppercase text-ink-muted">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{value ?? 0}</p>
              </div>
            ))}
          </div>

          <section className="space-y-2">
            <h2 className="text-lg font-bold">Recent sync runs</h2>
            {!data.recentRuns?.length ? (
              <EmptyState message="No synchronization runs yet." />
            ) : (
              <ul className="space-y-2">
                {data.recentRuns.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusPill status={r.status} />
                      <span className="text-xs text-ink-muted">
                        {r.startedAt ? new Date(r.startedAt).toLocaleString('en-NG') : ''}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      retrieved {r.retrieved} · created {r.created} · updated {r.updated} ·
                      duplicates {r.duplicatesIgnored} · rejected {r.rejected}
                      {r.trigger ? ` · ${r.trigger}` : ''}
                    </p>
                    {r.errorMessage ? (
                      <p className="mt-1 text-xs text-red-700 break-words">{r.errorMessage}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-bold">Recent updates</h2>
            {!data.recentUpdates?.length ? (
              <EmptyState message="No updates from this agency yet." />
            ) : (
              <ul className="space-y-2">
                {data.recentUpdates.map((u) => (
                  <li key={u.id} className="rounded-lg border border-surface-border bg-white px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium text-sm">{u.title}</p>
                      <StatusPill status={u.status} />
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {u.category} · {u.entryOrigin}
                      {u.publishedAt
                        ? ` · published ${new Date(u.publishedAt).toLocaleString('en-NG')}`
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
