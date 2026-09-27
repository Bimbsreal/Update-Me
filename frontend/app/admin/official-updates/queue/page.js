'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import {
  ConfirmAction,
  EmptyState,
  FilterInput,
  FilterSelect,
  Pagination,
  StatusPill,
} from '@/components/admin/AdminUI';

export default function OfficialReviewQueuePage() {
  const [filters, setFilters] = useState({ q: '', kind: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({
    items: [],
    total: 0,
    limit: 30,
    failedIngestions: [],
    nearDuplicates: [],
  });
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    adminApi
      .officialReviewQueue({ ...filters, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load queue'));
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(id) {
    setSelectedId(id);
    try {
      const d = await adminApi.officialUpdateDetail(id);
      setDetail(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load detail');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Official review queue</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Newly ingested or manually entered official-source information awaiting publish. Community
          reports never appear here as agency updates.
        </p>
        <Link
          href="/admin/official-updates"
          className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline"
        >
          All official updates →
        </Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <FilterInput
          label="Search"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <FilterSelect
          label="Origin"
          value={filters.kind}
          onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))}
        >
          <option value="">All</option>
          <option value="ingested">Ingested</option>
          <option value="manual">Admin manual</option>
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

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          {!data.items?.length ? (
            <EmptyState message="No updates pending review." />
          ) : (
            <ul className="space-y-2" aria-label="Pending official updates">
              {data.items.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => openDetail(u.id)}
                    className={`w-full rounded-xl border p-3 text-left ${
                      selectedId === u.id
                        ? 'border-brand-600 bg-brand-50'
                        : 'border-surface-border bg-white hover:border-brand-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{u.title}</p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {u.source?.shortName || u.source?.organizationName}
                          {u.location?.name ? ` · ${u.location.name}` : ''}
                          {u.location?.stateName ? ` · ${u.location.stateName}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <StatusPill status="Official" />
                        <StatusPill status={u.entryOrigin} />
                        <StatusPill status={u.status} />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      Received{' '}
                      {u.receivedAt || u.retrievedAt
                        ? new Date(u.receivedAt || u.retrievedAt).toLocaleString('en-NG')
                        : '—'}
                      {u.publishedAt
                        ? ` · source published ${new Date(u.publishedAt).toLocaleString('en-NG')}`
                        : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />
        </div>

        <aside className="space-y-3 rounded-xl border border-surface-border bg-white p-3 lg:sticky lg:top-4 lg:self-start">
          {!detail?.item ? (
            <p className="text-sm text-ink-muted">Select an update to review.</p>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase text-ink-muted">
                {detail.item.entryAttribution || detail.item.attribution}
              </p>
              <h2 className="text-lg font-bold">{detail.item.title}</h2>
              <p className="text-sm text-ink-muted whitespace-pre-wrap">
                {detail.item.summary || detail.item.body || '—'}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-ink-muted">Source</dt>
                  <dd className="font-medium">
                    {detail.item.source?.shortName || detail.item.source?.organizationName}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Category</dt>
                  <dd className="font-medium">{detail.item.categoryLabel || detail.item.category}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Location</dt>
                  <dd className="font-medium">
                    {[detail.item.locationName, detail.item.stateName].filter(Boolean).join(' · ') ||
                      '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Source URL</dt>
                  <dd className="font-medium break-all">
                    {detail.item.originalUrl ? (
                      <a
                        href={detail.item.originalUrl}
                        className="text-brand-700 hover:underline"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <ConfirmAction
                  label="Publish"
                  onConfirm={async (reason) => {
                    await adminApi.approveOfficialUpdate(selectedId, { reason });
                    setDetail(null);
                    setSelectedId(null);
                    load();
                  }}
                />
                <ConfirmAction
                  label="Reject"
                  danger
                  onConfirm={async (reason) => {
                    await adminApi.rejectOfficialUpdate(selectedId, { reason });
                    setDetail(null);
                    setSelectedId(null);
                    load();
                  }}
                />
              </div>
              <p className="text-xs text-ink-muted">{detail.note}</p>
            </>
          )}
        </aside>
      </div>

      {data.failedIngestions?.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Failed ingestions (7d)</h2>
          <ul className="space-y-2">
            {data.failedIngestions.map((f) => (
              <li
                key={f.id}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm"
              >
                <Link
                  href={`/admin/official-sources/${f.sourceId}`}
                  className="font-semibold text-brand-800 hover:underline"
                >
                  {f.sourceId}
                </Link>
                <p className="text-xs text-red-800 break-words">{f.errorMessage || 'Failed'}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.nearDuplicates?.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Near-duplicate candidates</h2>
          <p className="text-xs text-ink-muted">
            Review signals only — records are not auto-deleted.
          </p>
          <ul className="space-y-2">
            {data.nearDuplicates.map((d, i) => (
              <li key={i} className="rounded-lg border border-surface-border bg-white px-3 py-2 text-sm">
                <p className="text-xs text-ink-muted">{d.sourceId} · {d.signal}</p>
                {d.updates?.map((u) => (
                  <p key={u.id} className="mt-1">
                    {u.title} <StatusPill status={u.status} />
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
