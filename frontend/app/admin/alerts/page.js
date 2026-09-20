'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/api';
import {
  ConfirmAction,
  EmptyState,
  FilterInput,
  FilterSelect,
  Pagination,
  StatusPill,
} from '@/components/admin/AdminUI';

const ALERT_ACTIONS = [
  { code: 'under_review', label: 'Review' },
  { code: 'confirm', label: 'Confirm' },
  { code: 'mark_stale', label: 'Mark stale' },
  { code: 'expire', label: 'Expire' },
  { code: 'remove', label: 'Remove', danger: true },
  { code: 'restore', label: 'Restore' },
];

export default function AdminAlertsPage() {
  const [filters, setFilters] = useState({ q: '', status: '', flagged: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    adminApi
      .alerts({ ...filters, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load alerts'));
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id, action, reason) {
    setBusy(id);
    try {
      await adminApi.alertAction(id, { action, reason });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Safety alert moderation</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Stronger review controls. Alerts are not auto-confirmed from a single report.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <FilterInput
          label="Search"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="confirmed">Confirmed</option>
          <option value="flagged">Flagged</option>
          <option value="under_review">Under review</option>
          <option value="stale">Stale</option>
          <option value="expired">Expired</option>
          <option value="removed">Removed</option>
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
        <EmptyState message="No alerts found." />
      ) : (
        <ul className="space-y-3">
          {data.items.map((a) => (
            <li key={a.id} className="rounded-xl border border-surface-border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-bold break-words">{a.title}</h2>
                  <p className="mt-1 text-xs text-ink-muted">
                    {a.location?.name || 'Unknown location'}
                    {a.createdAt ? ` · age since ${new Date(a.createdAt).toLocaleString()}` : ''}
                    {` · source ${a.sourceType || '—'}`}
                    {` · flags ${a.flagCount || 0}`}
                    {` · confirmations ${a.confirmationCount || 0}`}
                  </p>
                </div>
                <StatusPill status={a.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {ALERT_ACTIONS.map((actDef) => (
                  <ConfirmAction
                    key={actDef.code}
                    label={actDef.label}
                    danger={actDef.danger}
                    disabled={busy === a.id}
                    onConfirm={(reason) => act(a.id, actDef.code, reason)}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />
    </div>
  );
}
