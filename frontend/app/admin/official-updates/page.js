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

export default function AdminOfficialUpdatesPage() {
  const [filters, setFilters] = useState({ q: '', agency: '', category: '', status: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [sources, setSources] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    sourceId: '',
    title: '',
    summary: '',
    category: 'road_traffic',
    originalUrl: '',
    publishNow: false,
    reason: '',
  });

  const load = useCallback(() => {
    adminApi
      .officialUpdates({ ...filters, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load updates'));
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    adminApi
      .officialSources()
      .then((d) => setSources(d.sources || []))
      .catch(() => {});
    adminApi
      .officialSourceHealth()
      .then((d) => setMetrics(d.counts || null))
      .catch(() => setMetrics(null));
  }, []);

  async function createManual(e) {
    e.preventDefault();
    setError('');
    try {
      await adminApi.createManualOfficialUpdate({
        ...form,
        originalUrl: form.originalUrl || null,
        publishNow: Boolean(form.publishNow),
      });
      setShowCreate(false);
      setForm({
        sourceId: '',
        title: '',
        summary: '',
        category: 'road_traffic',
        originalUrl: '',
        publishNow: false,
        reason: '',
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Create failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Official updates</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Agency-originated public information. Original wording and source URL are preserved —
            admins cannot rewrite agency content as if Update Me issued it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/official-updates/queue"
            className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold"
          >
            Review queue
          </Link>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
          >
            {showCreate ? 'Cancel' : 'Manual official entry'}
          </button>
        </div>
      </div>

      {metrics ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[
            { label: 'Active sources', value: metrics.activeSources ?? metrics.healthy },
            { label: 'Failed sources', value: metrics.failedSources ?? metrics.failing },
            { label: 'Updates today', value: metrics.updatesToday },
            { label: 'Pending updates', value: metrics.pendingUpdates ?? metrics.pendingReview },
            { label: 'Published', value: metrics.publishedUpdates },
            { label: 'Flagged', value: metrics.flaggedUpdates },
            { label: 'Expiring', value: metrics.expiringUpdates },
            { label: 'Expired', value: metrics.expiredUpdates },
            { label: 'Critical', value: metrics.criticalUpdates },
          ]
            .filter((m) => m.value != null)
            .map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-surface-border bg-white px-3 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {m.label}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{m.value}</p>
              </div>
            ))}
        </div>
      ) : null}

      {showCreate ? (
        <form
          onSubmit={createManual}
          className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50/40 p-4 sm:grid-cols-2"
        >
          <p className="sm:col-span-2 text-xs text-ink-muted">
            Marked as Admin-entered official-source information. Requires a verified agency source.
            Not freeform news.
          </p>
          <label className="text-xs font-medium text-ink-muted">
            Agency source
            <select
              required
              value={form.sourceId}
              onChange={(e) => setForm((f) => ({ ...f, sourceId: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
            >
              <option value="">Select…</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shortName || s.organizationName} ({s.id})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Category
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
            >
              <option value="road_traffic">Road & Traffic</option>
              <option value="fuel_petroleum">Fuel & Petroleum</option>
              <option value="public_safety">Public Safety</option>
              <option value="transport">Transport</option>
              <option value="public_services">Public Services</option>
              <option value="weather_emergency">Weather / Emergency</option>
              <option value="infrastructure">Infrastructure</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted sm:col-span-2">
            Title
            <input
              required
              minLength={3}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-ink-muted sm:col-span-2">
            Summary
            <textarea
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
              rows={3}
            />
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Source URL (optional)
            <input
              type="url"
              value={form.originalUrl}
              onChange={(e) => setForm((f) => ({ ...f, originalUrl: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Reason
            <input
              required
              minLength={3}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-ink-muted sm:col-span-2">
            <input
              type="checkbox"
              checked={form.publishNow}
              onChange={(e) => setForm((f) => ({ ...f, publishNow: e.target.checked }))}
            />
            Publish immediately (otherwise pending review)
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white sm:col-span-2"
          >
            Create official entry
          </button>
        </form>
      ) : null}

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
          <option value="pending_review">Pending review</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="rejected">Rejected</option>
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
                    Published:{' '}
                    {u.publishedAt ? new Date(u.publishedAt).toLocaleString('en-NG') : '—'}
                    {' · '}
                    Received:{' '}
                    {u.retrievedAt ? new Date(u.retrievedAt).toLocaleString('en-NG') : '—'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <StatusPill status="Official" />
                  <StatusPill status={u.status} />
                </div>
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
                ) : u.status === 'pending_review' ? (
                  <>
                    <ConfirmAction
                      label="Publish"
                      onConfirm={async (reason) => {
                        await adminApi.approveOfficialUpdate(u.id, { reason });
                        load();
                      }}
                    />
                    <ConfirmAction
                      label="Reject"
                      danger
                      onConfirm={async (reason) => {
                        await adminApi.rejectOfficialUpdate(u.id, { reason });
                        load();
                      }}
                    />
                  </>
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
