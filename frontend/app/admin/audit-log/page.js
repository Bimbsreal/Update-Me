'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/api';
import { EmptyState, FilterInput, Pagination } from '@/components/admin/AdminUI';

export default function AdminAuditLogPage() {
  const [entityType, setEntityType] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState({ items: [], total: 0, limit: 40 });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi
      .auditLog({ entityType: entityType || undefined, offset, limit: 40 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load audit log'));
  }, [entityType, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const page = Math.floor(offset / 40) + 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Who changed what, when, and why. Ordinary users cannot modify this history.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <FilterInput
          label="Entity type"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          placeholder="report, user, official_source…"
        />
        <button
          type="button"
          onClick={() => {
            setOffset(0);
            load();
          }}
          className="self-end rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
        >
          Filter
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!data.items?.length ? (
        <EmptyState message="No audit entries yet." />
      ) : (
        <ul className="space-y-2">
          {data.items.map((a) => (
            <li key={a.id} className="rounded-xl border border-surface-border bg-white p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold break-words">{a.action}</p>
                  <p className="text-xs text-ink-muted">
                    {a.entityType}
                    {a.entityId ? ` · ${a.entityId}` : ''}
                    {' · '}
                    {a.actor?.displayName || 'System'}
                  </p>
                  {a.reason ? (
                    <p className="mt-1 text-xs text-ink-muted break-words">Reason: {a.reason}</p>
                  ) : null}
                </div>
                <p className="shrink-0 text-xs text-ink-muted">
                  {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={page}
        total={data.total}
        limit={40}
        onPage={(p) => setOffset((p - 1) * 40)}
      />
    </div>
  );
}
