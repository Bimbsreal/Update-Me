'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import { AdminCard, EmptyState, StatusPill } from '@/components/admin/AdminUI';

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'custom', label: 'Custom' },
];

const PLANES = [
  { id: 'overview', label: 'Overview' },
  { id: 'product', label: 'Product' },
  { id: 'operations', label: 'Operations' },
  { id: 'data_quality', label: 'Data quality' },
  { id: 'domains', label: 'Domains' },
  { id: 'security', label: 'Security' },
];

const DOMAINS = [
  'traffic',
  'fuel',
  'commodities',
  'fx',
  'official',
  'search',
  'notifications',
];

function MetricList({ title, rows, labelKey, valueKey }) {
  if (!rows?.length) return null;
  return (
    <div className="rounded-xl border border-surface-border bg-white p-4">
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm" aria-label={title}>
        {rows.map((row, i) => (
          <li key={`${row[labelKey]}-${i}`} className="flex justify-between gap-2">
            <span className="capitalize">{String(row[labelKey] ?? '—')}</span>
            <strong>{row[valueKey] ?? '—'}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DomainSummary({ data }) {
  const metrics = data.metrics || {};
  const cards = Object.entries(metrics).filter(([, v]) => typeof v === 'number' || typeof v === 'string');
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold capitalize">{data.domain} analytics</h2>
      {data.note || data.privacy ? (
        <p className="text-sm text-ink-muted">{data.note || data.privacy}</p>
      ) : null}
      {cards.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(([k, v]) => (
            <AdminCard key={k} title={k.replace(/_/g, ' ')} value={v} />
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <MetricList title="By type" rows={data.byType} labelKey="type" valueKey="c" />
        <MetricList title="By product" rows={data.byProduct} labelKey="product" valueKey="c" />
        <MetricList title="By state" rows={data.byState} labelKey="state" valueKey="c" />
        <MetricList title="By commodity" rows={data.byCommodity} labelKey="commodity" valueKey="c" />
        <MetricList title="By market" rows={data.byMarket} labelKey="market" valueKey="c" />
        <MetricList
          title="Weak coverage (ascending)"
          rows={data.weakCoverageByState}
          labelKey="state"
          valueKey="observations"
        />
        <MetricList title="FX pairs" rows={data.pairs} labelKey="pair" valueKey="observations" />
        <MetricList title="FX by source" rows={data.bySource} labelKey="source" valueKey="observations" />
        <MetricList title="Search categories" rows={data.categories} labelKey="category" valueKey="hits" />
      </div>
    </section>
  );
}

export default function AdminAnalyticsPage() {
  const [plane, setPlane] = useState('overview');
  const [range, setRange] = useState('7d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [domain, setDomain] = useState('traffic');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [exportMsg, setExportMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = { range };
    if (range === 'custom') {
      if (from) params.from = from;
      if (to) params.to = to;
    }
    let req;
    if (plane === 'product') req = adminApi.analyticsProduct(params);
    else if (plane === 'operations') req = adminApi.analyticsOperations();
    else if (plane === 'data_quality') req = adminApi.analyticsDataQuality();
    else if (plane === 'domains') req = adminApi.analyticsDomain(domain, params);
    else if (plane === 'security') req = adminApi.analyticsSecurity(params);
    else req = adminApi.analyticsOverview(params);

    req
      .then((d) => setData(d.analytics))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [plane, range, domain, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  async function exportReport(format) {
    setExportMsg('');
    try {
      const result = await adminApi.analyticsExport({
        plane: plane === 'domains' ? 'overview' : plane,
        range,
        format,
        ...(range === 'custom' ? { from, to } : {}),
      });
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      setExportMsg(`Exported ${result.filename}`);
    } catch (err) {
      setExportMsg(err instanceof ApiError ? err.message : 'Export failed');
    }
  }

  if (error && !data) return <EmptyState message={error} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Product analytics, operational monitoring, and data-quality intelligence — kept separate.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-surface-border px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            onClick={() => exportReport('json')}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="rounded-lg border border-surface-border px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            onClick={() => exportReport('csv')}
          >
            Export CSV
          </button>
        </div>
      </div>
      {exportMsg ? <p className="text-xs text-ink-muted" role="status">{exportMsg}</p> : null}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Analytics planes">
        {PLANES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={plane === p.id}
            className={`rounded-full px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 ${
              plane === p.id ? 'bg-brand-600 text-white' : 'border border-surface-border bg-white'
            }`}
            onClick={() => setPlane(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-surface-border bg-white p-3">
        <label className="text-xs font-semibold text-ink-muted">
          Period
          <select
            className="mt-1 block rounded-control border border-surface-border px-2 py-1.5 text-sm"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            aria-label="Analytics period"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        {range === 'custom' ? (
          <>
            <label className="text-xs font-semibold text-ink-muted">
              From
              <input
                type="date"
                className="mt-1 block rounded-control border border-surface-border px-2 py-1.5 text-sm"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-ink-muted">
              To
              <input
                type="date"
                className="mt-1 block rounded-control border border-surface-border px-2 py-1.5 text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        ) : null}
        {plane === 'domains' ? (
          <label className="text-xs font-semibold text-ink-muted">
            Domain
            <select
              className="mt-1 block rounded-control border border-surface-border px-2 py-1.5 text-sm capitalize"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              aria-label="Analytics domain"
            >
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {data?.lastUpdated ? (
          <p className="text-xs text-ink-muted self-end pb-1">
            Last updated: {new Date(data.lastUpdated).toLocaleString()}
            {data.dataMode ? ` · ${data.dataMode}` : ''}
            {data.range?.label ? ` · ${data.range.label}` : ''}
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-status-attention">{error}</p> : null}
      {loading ? <p className="text-sm text-ink-muted">Loading…</p> : null}

      {!loading && plane === 'overview' && data ? (
        <>
          <h2 className="text-lg font-bold">Platform</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminCard title="DAU" value={data.platform?.dau ?? 0} />
            <AdminCard title="WAU" value={data.platform?.wau ?? 0} />
            <AdminCard title="MAU" value={data.platform?.mau ?? 0} />
            <AdminCard title="New users" value={data.platform?.newUsers ?? 0} />
            <AdminCard title="Searches" value={data.platform?.searches ?? 0} />
            <AdminCard title="Zero-result" value={data.platform?.zeroResultSearches ?? 0} />
            <AdminCard title="With results" value={data.platform?.searchesWithResults ?? 0} />
            <AdminCard title="Search avg latency" value={`${data.platform?.searchAvgLatencyMs ?? 0} ms`} />
          </div>
          <h2 className="text-lg font-bold">Data / Quality / Notifications / Ops</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminCard title="Reports created" value={data.data?.reportsCreated ?? 0} />
            <AdminCard title="Active reports" value={data.data?.activeReports ?? 0} />
            <AdminCard title="DQ open events" value={data.quality?.openEvents ?? 0} />
            <AdminCard title="Anomalies" value={data.quality?.anomalies ?? 0} />
            <AdminCard title="Notifications generated" value={data.notifications?.generated ?? 0} />
            <AdminCard title="Delivered" value={data.notifications?.delivered ?? 0} />
            <AdminCard title="API requests" value={data.operations?.apiRequests ?? 0} />
            <AdminCard title="5xx errors" value={data.operations?.error5xx ?? 0} />
          </div>
          {(data.featureUsage || []).length ? (
            <section>
              <h2 className="text-lg font-bold">Feature usage</h2>
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Feature usage">
                {data.featureUsage.map((f) => (
                  <li
                    key={f.feature}
                    className="rounded-full border border-surface-border bg-white px-3 py-1 text-sm"
                  >
                    {f.feature}: <strong>{f.hits}</strong>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="text-xs text-ink-muted">{data.note}</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/admin/system-health" className="font-semibold text-brand-700">
              System Health →
            </Link>
            <Link href="/admin/data-quality" className="font-semibold text-brand-700">
              Data Quality →
            </Link>
          </div>
        </>
      ) : null}

      {!loading && plane === 'product' && data ? (
        <section className="space-y-4">
          <p className="text-sm text-ink-muted">{data.privacy}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-surface-border bg-white p-4">
              <h3 className="font-semibold">Daily active users</h3>
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm" aria-label="DAU trend">
                {(data.activityTrend || []).length === 0 ? (
                  <li className="text-ink-muted">No activity markers yet for this period.</li>
                ) : (
                  data.activityTrend.map((row) => (
                    <li key={row.day} className="flex justify-between gap-2">
                      <span>{row.day}</span>
                      <strong>{row.active_users}</strong>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="rounded-xl border border-surface-border bg-white p-4">
              <h3 className="font-semibold">Registrations</h3>
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm" aria-label="Registrations">
                {(data.registrations || []).length === 0 ? (
                  <li className="text-ink-muted">No registrations in this period.</li>
                ) : (
                  data.registrations.map((row) => (
                    <li key={row.day} className="flex justify-between gap-2">
                      <span>{row.day}</span>
                      <strong>{row.registrations}</strong>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
          <div className="rounded-xl border border-surface-border bg-white p-4 overflow-x-auto">
            <h3 className="font-semibold">Search categories</h3>
            <ul className="mt-2 flex flex-wrap gap-2 text-sm" aria-label="Search categories">
              {(data.searchCategories || []).map((c) => (
                <li key={c.category} className="rounded-full border border-surface-border px-3 py-1">
                  {c.category}: {c.hits} ({c.zero_results} zero)
                </li>
              ))}
            </ul>
          </div>
          {(data.featureUsage || []).length ? (
            <MetricList title="Feature usage" rows={data.featureUsage} labelKey="feature" valueKey="hits" />
          ) : null}
        </section>
      ) : null}

      {!loading && plane === 'operations' && data ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={data.health?.status || 'unknown'} />
            <span className="text-xs text-ink-muted" aria-hidden="true">
              ({data.health?.status || 'unknown'})
            </span>
            <Link href="/admin/system-health" className="text-sm font-semibold text-brand-700">
              Open System Health
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminCard title="API requests (24h rollup)" value={data.api?.requests ?? 0} />
            <AdminCard title="Avg latency" value={`${data.api?.avgDurationMs ?? 0} ms`} />
            <AdminCard title="p50 (process window)" value={data.api?.latency?.p50 ?? '—'} />
            <AdminCard title="p95 (process window)" value={data.api?.latency?.p95 ?? '—'} />
            <AdminCard title="p99 (process window)" value={data.api?.latency?.p99 ?? '—'} />
            <AdminCard title="5xx" value={data.api?.error5xx ?? 0} />
            <AdminCard title="4xx" value={data.api?.error4xx ?? 0} />
            <AdminCard title="Slow" value={data.api?.slow ?? 0} />
          </div>
          {data.api?.latency?.note ? (
            <p className="text-xs text-ink-muted">{data.api.latency.note}</p>
          ) : null}

          <h3 className="font-semibold">Background jobs (recent)</h3>
          <ul className="space-y-2 lg:hidden" aria-label="Recent jobs mobile">
            {(data.jobs?.recent || []).slice(0, 12).map((j) => (
              <li key={j.id || `${j.jobName}-${j.startedAt}`} className="rounded-xl border border-surface-border bg-white p-3 text-sm">
                <p className="font-medium">{j.jobName}</p>
                <p className="text-xs text-ink-muted">
                  {j.status} · {j.durationMs ?? '—'} ms
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-surface-border bg-white lg:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-surface-border text-xs text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2">Job</th>
                  <th scope="col" className="px-3 py-2">Status</th>
                  <th scope="col" className="px-3 py-2">Duration</th>
                  <th scope="col" className="px-3 py-2">Started</th>
                </tr>
              </thead>
              <tbody>
                {(data.jobs?.recent || []).slice(0, 20).map((j) => (
                  <tr key={j.id || `${j.jobName}-${j.startedAt}`} className="border-b border-surface-border/60">
                    <td className="px-3 py-2">{j.jobName}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={j.status} />
                    </td>
                    <td className="px-3 py-2">{j.durationMs ?? '—'} ms</td>
                    <td className="px-3 py-2 text-xs text-ink-muted">
                      {j.startedAt ? new Date(j.startedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="font-semibold">Error groups</h3>
          <ul className="space-y-2" aria-label="Error groups">
            {(data.errors || []).length === 0 ? (
              <li className="text-sm text-ink-muted">No grouped errors yet.</li>
            ) : (
              data.errors.slice(0, 15).map((e) => (
                <li key={e.id} className="rounded-xl border border-surface-border bg-white p-3 text-sm">
                  <p className="font-medium">
                    {e.errorType} · {e.occurrenceCount}×
                  </p>
                  <p className="text-xs text-ink-muted">{e.messageSample}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {e.endpoint} · last {e.lastSeenAt ? new Date(e.lastSeenAt).toLocaleString() : '—'}
                    {e.lastRequestId ? ` · req ${e.lastRequestId}` : ''}
                  </p>
                </li>
              ))
            )}
          </ul>

          <h3 className="font-semibold">Operational signals</h3>
          <ul className="space-y-2" aria-label="Operational signals">
            {(data.operationalSignals || []).map((s) => (
              <li key={s.code} className="rounded-xl border border-surface-border bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={s.severity} />
                  <strong>{s.title}</strong>
                  {!s.active ? <span className="text-xs text-ink-muted">resolved</span> : null}
                </div>
                <p className="mt-1 text-ink-muted">{s.message}</p>
                <p className="text-xs text-ink-soft">
                  cooldown {s.cooldown_minutes || 30}m · alerts {s.alert_count || 0}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">{data.note}</p>
        </section>
      ) : null}

      {!loading && plane === 'data_quality' && data ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AdminCard title="Fresh" value={data.summary?.freshReports ?? 0} />
            <AdminCard title="Stale" value={data.summary?.staleReports ?? 0} />
            <AdminCard title="Expired" value={data.summary?.expiredReports ?? 0} />
            <AdminCard title="Awaiting review" value={data.summary?.awaitingReview ?? 0} />
            <AdminCard title="Conflicts" value={data.summary?.conflictingGroups ?? 0} />
            <AdminCard title="Open DQ events" value={data.intelligence?.events?.open ?? 0} />
            <AdminCard title="Anomalies" value={data.intelligence?.events?.anomalies ?? 0} />
          </div>
          <Link href="/admin/data-quality" className="text-sm font-semibold text-brand-700">
            Open Data Quality review →
          </Link>
        </section>
      ) : null}

      {!loading && plane === 'domains' && data ? <DomainSummary data={data} /> : null}

      {!loading && plane === 'security' && data ? (
        <section className="space-y-4">
          <p className="text-sm text-ink-muted">{data.note}</p>
          <ul className="space-y-2" aria-label="Security aggregates">
            {(data.events || []).length === 0 ? (
              <li className="text-sm text-ink-muted">No matching security audit aggregates for this period.</li>
            ) : (
              data.events.map((e) => (
                <li
                  key={e.action}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-surface-border bg-white p-3 text-sm"
                >
                  <span className="font-medium">{e.action}</span>
                  <span>
                    {e.c} · last {e.last_at ? new Date(e.last_at).toLocaleString() : '—'}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
