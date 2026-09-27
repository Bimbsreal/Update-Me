'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import { AdminCard, EmptyState, StatusPill } from '@/components/admin/AdminUI';
import {
  AdminPageHeader,
  AttentionItem,
  QuickAction,
  useAdminOptional,
} from '@/components/admin/AdminContext';

function formatWhen(value) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString();
  } catch {
    return null;
  }
}

export default function AdminDashboardPage() {
  const admin = useAdminOptional();
  const can = admin?.can || (() => false);

  const [dashboard, setDashboard] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [healthError, setHealthError] = useState('');

  useEffect(() => {
    let cancelled = false;
    adminApi
      .dashboard()
      .then((d) => {
        if (!cancelled) setDashboard(d.dashboard);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load dashboard');
        }
      });

    if (can('dashboard')) {
      adminApi
        .systemHealth()
        .then((d) => {
          if (!cancelled) setHealth(d.health);
        })
        .catch((err) => {
          if (!cancelled) {
            setHealthError(err instanceof ApiError ? err.message : 'Health unavailable');
          }
        });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- can() identity changes; permissions on admin are stable enough
  }, [admin?.role]);

  const attention = useMemo(() => {
    if (!dashboard) return [];
    const items = [];
    if (can('moderation') && dashboard.reportsAwaitingReview > 0) {
      items.push({
        href: '/admin/moderation',
        label: 'Reports awaiting moderation',
        count: dashboard.reportsAwaitingReview,
        tone: 'attention',
      });
    }
    if (can('moderation') && dashboard.openFlags > 0) {
      items.push({
        href: '/admin/moderation',
        label: 'Open report flags',
        count: dashboard.openFlags,
        tone: 'critical',
      });
    }
    if (can('community') && dashboard.flaggedQuestions > 0) {
      items.push({
        href: '/admin/community',
        label: 'Flagged community questions',
        count: dashboard.flaggedQuestions,
        tone: 'attention',
      });
    }
    if (can('official_sources') && (dashboard.officialSourceHealth?.failing || 0) > 0) {
      items.push({
        href: '/admin/official-sources',
        label: 'Official sources failing',
        count: dashboard.officialSourceHealth.failing,
        tone: 'critical',
      });
    }
    if (can('official_sources') && dashboard.recentSyncFailures > 0) {
      items.push({
        href: '/admin/ingestion-runs',
        label: 'Failed sync runs (7 days)',
        count: dashboard.recentSyncFailures,
        tone: 'attention',
      });
    }
    if (can('data_quality') && dashboard.staleOrExpiring > 0) {
      items.push({
        href: '/admin/data-quality',
        label: 'Stale or expiring reports',
        count: dashboard.staleOrExpiring,
        tone: 'attention',
      });
    }
    if (can('users') && (dashboard.users?.suspended || 0) > 0) {
      items.push({
        href: '/admin/users?status=suspended',
        label: 'Suspended accounts',
        count: dashboard.users.suspended,
        tone: 'ok',
      });
    }
    if (health?.status && health.status !== 'healthy' && can('dashboard')) {
      items.unshift({
        href: '/admin/system-health',
        label: `Platform status: ${health.status}`,
        count: null,
        tone: health.status === 'unhealthy' ? 'critical' : 'attention',
      });
    }
    return items;
  }, [dashboard, health, can, admin?.permissions]);

  if (error) return <EmptyState message={error} />;
  if (!dashboard) {
    return <p className="text-sm text-ink-muted">Loading operational overview…</p>;
  }

  const sourceHealth = dashboard.officialSourceHealth || {};

  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumb="Overview"
        title="Operations Center"
        subtitle="What needs attention, whether information is flowing, and whether the platform is healthy."
        actions={
          can('dashboard') ? (
            <Link
              href="/admin/system-health"
              className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50"
            >
              System health
              {health?.status ? <StatusPill status={health.status} /> : null}
            </Link>
          ) : null
        }
      />

      {attention.length ? (
        <section className="rounded-xl border border-amber-200/80 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-ink">Needs attention</h2>
              <p className="text-xs text-ink-muted">Prioritized from live database counts — nothing invented.</p>
            </div>
            <span className="text-xs font-semibold tabular-nums text-amber-900">
              {attention.length} item{attention.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {attention.map((item) => (
              <AttentionItem
                key={`${item.href}-${item.label}`}
                href={item.href}
                label={item.label}
                count={item.count}
                tone={item.tone}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-900">
          No urgent moderation or source issues right now.
        </section>
      )}

      <section>
        <h2 className="mb-3 text-base font-bold text-ink">Platform overview</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {can('moderation') ? (
            <AdminCard
              title="Awaiting review"
              value={dashboard.reportsAwaitingReview}
              href="/admin/moderation"
            />
          ) : null}
          {can('reports') ? (
            <AdminCard
              title="Flagged reports"
              value={dashboard.flaggedReports}
              href="/admin/reports?flagged=true"
            />
          ) : null}
          {can('alerts') ? (
            <AdminCard title="Active alerts" value={dashboard.activeAlerts} href="/admin/alerts" />
          ) : null}
          {can('community') ? (
            <AdminCard
              title="Flagged questions"
              value={dashboard.flaggedQuestions}
              href="/admin/community"
            />
          ) : null}
          {can('official_sources') ? (
            <AdminCard
              title="Official sources"
              value={`${sourceHealth.active || 0}/${sourceHealth.total || 0}`}
              hint={`${sourceHealth.failing || 0} failing · ${sourceHealth.verified || 0} verified`}
              href="/admin/official-sources"
            />
          ) : null}
          {can('data_quality') ? (
            <AdminCard
              title="Stale / expiring"
              value={dashboard.staleOrExpiring}
              href="/admin/data-quality"
            />
          ) : null}
          {can('users') ? (
            <AdminCard
              title="Users"
              value={dashboard.users?.total}
              hint={`${dashboard.users?.staff || 0} staff · ${dashboard.users?.suspended || 0} suspended`}
              href="/admin/users"
            />
          ) : null}
          {can('official_sources') ? (
            <AdminCard
              title="Sync failures (7d)"
              value={dashboard.recentSyncFailures}
              href="/admin/ingestion-runs"
            />
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-surface-border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-ink">System health</h2>
            {can('dashboard') ? (
              <Link href="/admin/system-health" className="text-xs font-semibold text-brand-700">
                Details
              </Link>
            ) : null}
          </div>
          {healthError ? (
            <p className="text-sm text-ink-muted">{healthError}</p>
          ) : health ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={health.status} />
                {health.checkedAt ? (
                  <span className="text-xs text-ink-muted">Checked {formatWhen(health.checkedAt)}</span>
                ) : null}
              </div>
              <ul className="space-y-1.5 text-ink-muted">
                <li>
                  Database:{' '}
                  <span className="font-medium text-ink">{health.database?.status || '—'}</span>
                </li>
                <li>
                  Jobs:{' '}
                  <span className="font-medium text-ink">
                    {health.jobs?.latest?.status || health.jobs?.status || '—'}
                  </span>
                </li>
                <li>
                  Ingestion:{' '}
                  <span className="font-medium text-ink">{health.ingestion?.status || '—'}</span>
                </li>
                <li>
                  SSE:{' '}
                  <span className="font-medium text-ink">{health.sse?.status || '—'}</span>
                </li>
              </ul>
              {(health.signals || []).slice(0, 3).map((signal) => (
                <p key={signal.code || signal.message} className="text-xs text-ink-muted">
                  {signal.message || signal.code}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Loading health…</p>
          )}
        </div>

        <div className="rounded-xl border border-surface-border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-ink">Quick actions</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <QuickAction
              href={can('moderation') ? '/admin/moderation' : null}
              label="Review reports"
              description="Moderation queue"
            />
            <QuickAction
              href={can('community') ? '/admin/community' : null}
              label="Review community"
              description="Questions & answers"
            />
            <QuickAction
              href={can('locations') ? '/admin/locations' : null}
              label="Manage locations"
              description="Reference geography"
            />
            <QuickAction
              href={can('official_sources') ? '/admin/official-sources' : null}
              label="Review data sources"
              description="Official providers"
            />
            <QuickAction
              href={can('data_quality') ? '/admin/data-quality' : null}
              label="Data quality"
              description="Stale & conflicts"
            />
            <QuickAction
              href={can('dashboard') ? '/admin/system-health' : null}
              label="System health"
              description="Jobs & infrastructure"
            />
            <QuickAction
              href={can('audit_log') ? '/admin/audit-log' : null}
              label="Audit logs"
              description="Admin actions"
            />
            <QuickAction
              href={can('official_sync') ? '/admin/official-sources' : null}
              label="Run approved sync"
              description="From data sources"
            />
          </div>
        </div>
      </section>

      {can('reports') || can('moderation') ? (
        <section className="rounded-xl border border-surface-border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-ink">Recent reports</h2>
            {can('reports') ? (
              <Link href="/admin/reports" className="text-sm font-semibold text-brand-700">
                View all
              </Link>
            ) : null}
          </div>
          {dashboard.recentReports?.length ? (
            <ul className="divide-y divide-surface-border">
              {dashboard.recentReports.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{r.title}</p>
                    <p className="text-xs text-ink-muted">
                      {r.category}
                      {r.locationName ? ` · ${r.locationName}` : ''}
                    </p>
                  </div>
                  <StatusPill status={r.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="No reports yet." />
          )}
        </section>
      ) : null}
    </div>
  );
}
