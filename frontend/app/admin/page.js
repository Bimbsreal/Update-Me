'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import { AdminCard, EmptyState, StatusPill } from '@/components/admin/AdminUI';

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi
      .dashboard()
      .then((d) => setDashboard(d.dashboard))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load dashboard'));
  }, []);

  if (error) return <EmptyState message={error} />;
  if (!dashboard) {
    return <p className="text-sm text-ink-muted">Loading operational overview…</p>;
  }

  const health = dashboard.officialSourceHealth || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Admin overview</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Live counts from the Update Me information systems.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminCard
          title="Awaiting review"
          value={dashboard.reportsAwaitingReview}
          href="/admin/moderation"
        />
        <AdminCard title="Flagged reports" value={dashboard.flaggedReports} href="/admin/reports?flagged=true" />
        <AdminCard title="Open flags" value={dashboard.openFlags} href="/admin/moderation" />
        <AdminCard title="Active alerts" value={dashboard.activeAlerts} href="/admin/alerts" />
        <AdminCard
          title="Official sources"
          value={`${health.active || 0}/${health.total || 0}`}
          hint={`${health.failing || 0} failing · ${health.verified || 0} verified`}
          href="/admin/official-sources"
        />
        <AdminCard
          title="Sync failures (7d)"
          value={dashboard.recentSyncFailures}
          href="/admin/data-quality"
        />
        <AdminCard
          title="Users"
          value={dashboard.users?.total}
          hint={`${dashboard.users?.staff || 0} staff · ${dashboard.users?.suspended || 0} suspended`}
          href="/admin/users"
        />
        <AdminCard
          title="Stale / expiring"
          value={dashboard.staleOrExpiring}
          href="/admin/data-quality"
        />
      </div>

      <section className="rounded-xl border border-surface-border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Recent reports</h2>
          <Link href="/admin/reports" className="text-sm font-semibold text-brand-700">
            View all
          </Link>
        </div>
        {dashboard.recentReports?.length ? (
          <ul className="divide-y divide-surface-border">
            {dashboard.recentReports.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
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
    </div>
  );
}
