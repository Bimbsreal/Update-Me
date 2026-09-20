'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import { AdminCard, EmptyState } from '@/components/admin/AdminUI';

const FRESHNESS_FILTERS = [
  { value: '', label: 'All bands' },
  { value: 'fresh', label: 'Fresh' },
  { value: 'recent', label: 'Recent' },
  { value: 'aging', label: 'Aging' },
  { value: 'stale', label: 'Stale' },
  { value: 'expired', label: 'Expired' },
];

export default function AdminDataQualityPage() {
  const [quality, setQuality] = useState(null);
  const [reports, setReports] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('');
  const [freshness, setFreshness] = useState('');
  const [source, setSource] = useState('');
  const [loadingList, setLoadingList] = useState(false);

  const loadSummary = useCallback(() => {
    adminApi
      .dataQuality()
      .then((d) => setQuality(d.quality))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'));
  }, []);

  const loadLists = useCallback(() => {
    setLoadingList(true);
    Promise.all([
      adminApi.dataQualityReports({
        category: category || undefined,
        freshness: freshness || undefined,
        source: source || undefined,
        limit: 30,
      }),
      adminApi.dataQualityConflicts({ category: category || 'traffic', limit: 20 }),
    ])
      .then(([rep, conf]) => {
        setReports(rep.items || []);
        setConflicts(conf.conflicts || []);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load lists'))
      .finally(() => setLoadingList(false));
  }, [category, freshness, source]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  if (error && !quality) return <EmptyState message={error} />;
  if (!quality) return <p className="text-sm text-ink-muted">Loading data quality…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data quality</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Operational freshness and corroboration signals — no invented trust scores.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <AdminCard title="Fresh" value={quality.freshReports ?? 0} />
        <AdminCard title="Recent" value={quality.recentReports ?? 0} />
        <AdminCard title="Aging" value={quality.agingReports ?? 0} />
        <AdminCard
          title="Stale reports"
          value={quality.staleReports}
          href="/admin/data-quality?freshness=stale"
        />
        <AdminCard
          title="Expired reports"
          value={quality.expiredReports}
          href="/admin/data-quality?freshness=expired"
        />
        <AdminCard
          title="Awaiting review"
          value={quality.awaitingReview ?? quality.unresolvedFlags}
          href="/admin/moderation"
        />
        <AdminCard title="Conflicting groups" value={quality.conflictingGroups ?? 0} />
        <AdminCard title="High-duplication areas" value={quality.highDuplicationAreas ?? 0} />
        <AdminCard title="Repeated corrections" value={quality.repeatedCorrections ?? 0} />
        <AdminCard
          title="Failed official syncs"
          value={quality.failedOfficialSyncs}
          href="/admin/official-sources"
        />
        <AdminCard
          title="Sources not synced recently"
          value={quality.sourcesNotSyncedRecently}
          href="/admin/official-sources"
        />
        <AdminCard
          title="Incomplete locations"
          value={quality.incompleteLocations}
          href="/admin/locations"
        />
      </div>

      <div className="flex flex-wrap gap-3 rounded-card border border-surface-border bg-white p-3 sm:p-4">
        <label className="text-xs font-semibold text-ink-muted">
          Category
          <select
            className="mt-1 block min-w-[8rem] rounded-control border border-surface-border px-2 py-1.5 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All</option>
            <option value="traffic">Traffic</option>
            <option value="fuel">Fuel</option>
            <option value="transport">Transport</option>
            <option value="prices">Prices</option>
            <option value="local_alerts">Alerts</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          Freshness
          <select
            className="mt-1 block min-w-[8rem] rounded-control border border-surface-border px-2 py-1.5 text-sm"
            value={freshness}
            onChange={(e) => setFreshness(e.target.value)}
          >
            {FRESHNESS_FILTERS.map((f) => (
              <option key={f.value || 'all'} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-muted">
          Source
          <select
            className="mt-1 block min-w-[8rem] rounded-control border border-surface-border px-2 py-1.5 text-sm"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">All</option>
            <option value="community">Community</option>
            <option value="official">Official</option>
            <option value="aggregated">Aggregated</option>
          </select>
        </label>
      </div>

      {error ? <p className="text-sm text-status-attention">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Conflicting reports</h2>
        {loadingList ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : conflicts.length === 0 ? (
          <p className="text-sm text-ink-muted">No conflicting traffic groups in the current window.</p>
        ) : (
          <ul className="space-y-2">
            {conflicts.map((c) => (
              <li
                key={c.groupKey}
                className="rounded-card border border-status-caution/30 bg-white p-3 text-sm"
              >
                <p className="font-semibold text-status-caution">{c.headline}</p>
                <p className="text-ink-muted">{c.placeName}</p>
                <ul className="mt-1 text-xs capitalize text-ink-soft">
                  {(c.breakdown || []).map((b) => (
                    <li key={b.value}>
                      {b.label} — {b.count} reports
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Reports</h2>
        {loadingList ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-ink-muted">No reports match these filters.</p>
        ) : (
          <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white">
            {reports.map((r) => (
              <li key={r.id} className="px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{r.title}</p>
                    <p className="text-xs text-ink-muted">
                      {r.category?.name} · {r.locationName || 'No location'} · {r.status}
                    </p>
                  </div>
                  <span className="text-xs font-bold uppercase text-ink-soft">
                    {r.quality?.freshness?.state}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {r.quality?.source?.label} · {r.quality?.verification?.label} ·{' '}
                  {r.quality?.corroboration?.label} · {r.quality?.freshness?.label}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-ink-muted">
        Open{' '}
        <Link href="/admin/moderation" className="font-semibold text-brand-700">
          moderation
        </Link>{' '}
        to act on unresolved items.
      </p>
    </div>
  );
}
