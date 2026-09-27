'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import { EmptyState, StatusPill } from '@/components/admin/AdminUI';
import { AdminPageHeader } from '@/components/admin/AdminContext';

function toneForStatus(status) {
  if (status === 'healthy' || status === 'ok' || status === 'success' || status === 'ready') {
    return 'text-emerald-800 bg-emerald-50 border-emerald-200';
  }
  if (status === 'degraded' || status === 'partial' || status === 'warning') {
    return 'text-amber-900 bg-amber-50 border-amber-200';
  }
  if (status === 'unhealthy' || status === 'failed' || status === 'failing' || status === 'critical') {
    return 'text-red-800 bg-red-50 border-red-200';
  }
  return 'text-ink-muted bg-surface-muted border-surface-border';
}

function Panel({ title, children, action }) {
  return (
    <section className="rounded-xl border border-surface-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {action || null}
      </div>
      {children}
    </section>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-surface-border/70 py-2 text-sm last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className="max-w-[60%] text-right font-medium text-ink break-words">{value ?? '—'}</span>
    </div>
  );
}

export default function AdminSystemHealthPage() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    setError('');
    adminApi
      .systemHealth()
      .then((d) => setHealth(d.health))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load system health'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <EmptyState message={error} />;
  if (!health) {
    return <p className="text-sm text-ink-muted">Loading system health…</p>;
  }

  const app = health.application || {};
  const db = health.database || {};
  const ingestion = health.ingestion || {};
  const sse = health.sse || {};
  const metrics = health.metrics || {};
  const signals = health.signals || [];
  const latestJobs = health.jobs?.latest || {};
  const recentJobs = health.jobs?.recent || [];
  const fxProviders = health.providers?.fx || [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        breadcrumb="Overview"
        title="System health"
        subtitle="Operational status for application, database, jobs, ingestion, providers, and SSE. Secrets are never shown."
        actions={
          <button
            type="button"
            onClick={load}
            disabled={busy}
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Refresh
          </button>
        }
      />

      <div
        className={`rounded-xl border px-4 py-3 text-sm font-semibold ${toneForStatus(health.status)}`}
      >
        Overall: {health.status}
        <span className="ml-2 font-normal opacity-80">
          checked {health.checkedAt ? new Date(health.checkedAt).toLocaleString() : '—'}
        </span>
      </div>

      {signals.length ? (
        <Panel title="Active signals">
          <ul className="space-y-2">
            {signals.map((s) => (
              <li
                key={s.code}
                className={`rounded-lg border px-3 py-2 text-sm ${toneForStatus(s.severity)}`}
              >
                <p className="font-semibold">
                  {s.title} · {s.severity}
                </p>
                <p className="mt-0.5 opacity-90">{s.message}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <p className="text-sm text-ink-muted">No active operational signals.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Application">
          <MetaRow label="Service" value={app.service} />
          <MetaRow label="Environment" value={app.environment} />
          <MetaRow label="Version" value={app.version} />
          <MetaRow
            label="Uptime"
            value={app.uptimeSec != null ? `${Math.floor(app.uptimeSec / 60)} min` : null}
          />
        </Panel>

        <Panel title="Database">
          <MetaRow label="Connectivity" value={db.connected ? 'up' : 'down'} />
          <MetaRow label="Latency" value={db.latencyMs != null ? `${db.latencyMs} ms` : null} />
          <MetaRow label="PostGIS" value={db.postgis} />
          <MetaRow label="Migrations applied" value={db.migrations?.appliedCount} />
          <MetaRow label="Latest migration" value={db.migrations?.latest} />
          {db.serverVersion ? <MetaRow label="Server version" value={db.serverVersion} /> : null}
        </Panel>

        <Panel
          title="Ingestion"
          action={
            <Link href="/admin/ingestion-runs" className="text-xs font-semibold text-brand-700">
              Runs
            </Link>
          }
        >
          <MetaRow label="Active sources" value={ingestion.sources?.active} />
          <MetaRow label="Degraded" value={ingestion.sources?.degraded} />
          <MetaRow label="Failing" value={ingestion.sources?.failing} />
          <MetaRow
            label="Last success"
            value={
              ingestion.lastSuccessfulSyncAt
                ? new Date(ingestion.lastSuccessfulSyncAt).toLocaleString()
                : null
            }
          />
          <MetaRow
            label="Last failure"
            value={
              ingestion.lastFailedSyncAt
                ? new Date(ingestion.lastFailedSyncAt).toLocaleString()
                : null
            }
          />
        </Panel>

        <Panel title="SSE">
          <MetaRow label="Connections" value={sse.connections} />
          <MetaRow label="Users" value={sse.users} />
          <MetaRow label="Write errors" value={sse.writeErrors} />
          <MetaRow label="Disconnects" value={sse.disconnects} />
          <MetaRow
            label="Last write error"
            value={sse.lastErrorAt ? new Date(sse.lastErrorAt).toLocaleString() : 'none'}
          />
          <p className="mt-2 text-xs text-ink-muted">{sse.note}</p>
        </Panel>

        <Panel title="API metrics (24h)">
          <MetaRow label="Requests" value={metrics.requests} />
          <MetaRow label="4xx" value={metrics.error4xx} />
          <MetaRow label="5xx" value={metrics.error5xx} />
          <MetaRow label="Slow" value={metrics.slow} />
          <MetaRow label="Avg duration" value={`${metrics.avgDurationMs || 0} ms`} />
          <MetaRow label="Max duration" value={`${metrics.maxDurationMs || 0} ms`} />
          <p className="mt-2 text-xs text-ink-muted">{metrics.note}</p>
        </Panel>

        <Panel
          title="FX providers"
          action={
            <Link href="/admin/fx" className="text-xs font-semibold text-brand-700">
              FX admin
            </Link>
          }
        >
          {fxProviders.length ? (
            <ul className="space-y-2">
              {fxProviders.map((p) => (
                <li key={p.key} className="rounded-lg border border-surface-border px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{p.key}</span>
                    <StatusPill status={p.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    failures: {p.consecutiveFailures}
                    {p.lastSuccessAt
                      ? ` · last ok ${new Date(p.lastSuccessAt).toLocaleString()}`
                      : ''}
                  </p>
                  {p.fallback?.usingLastKnownGood ? (
                    <p className="mt-1 text-xs text-amber-800">
                      Fallback: last-known-good observations (not claimed as live).
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="No FX providers configured." />
          )}
        </Panel>
      </div>

      <Panel title="Latest job runs">
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.keys(latestJobs).length ? (
            Object.values(latestJobs).map((job) => (
              <div key={job.jobName} className="rounded-lg border border-surface-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{job.jobName}</p>
                  <StatusPill status={job.status} />
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {job.startedAt ? new Date(job.startedAt).toLocaleString() : '—'}
                  {job.durationMs != null ? ` · ${job.durationMs} ms` : ''}
                </p>
                {job.errorSummary ? (
                  <p className="mt-1 text-xs text-red-700">{job.errorSummary}</p>
                ) : null}
              </div>
            ))
          ) : (
            <EmptyState message="No job runs recorded yet." />
          )}
        </div>
      </Panel>

      <Panel title="Recent job history">
        {recentJobs.length ? (
          <ul className="divide-y divide-surface-border text-sm">
            {recentJobs.map((job) => (
              <li key={job.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{job.jobName}</p>
                  <p className="text-xs text-ink-muted">
                    {job.trigger} · {job.startedAt ? new Date(job.startedAt).toLocaleString() : '—'}
                    {job.durationMs != null ? ` · ${job.durationMs} ms` : ''}
                  </p>
                </div>
                <StatusPill status={job.status} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState message="No recent runs." />
        )}
      </Panel>
    </div>
  );
}
