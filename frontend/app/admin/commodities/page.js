'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/api';
import { ConfirmAction, EmptyState, StatusPill } from '@/components/admin/AdminUI';

export default function AdminCommoditiesPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminApi
      .commodities()
      .then((d) => setItems(d.items || []))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load commodities'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Commodity management</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Catalogue and variants. Historical price observations are not rewritten here.
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!items.length ? (
        <EmptyState message="No commodities found." />
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="rounded-xl border border-surface-border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{c.name}</p>
                  <p className="text-xs text-ink-muted">{c.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={c.isActive ? 'active' : 'inactive'} />
                  <ConfirmAction
                    label={c.isActive ? 'Deactivate' : 'Activate'}
                    danger={c.isActive}
                    onConfirm={async (reason) => {
                      await adminApi.patchCommodity(c.id, { isActive: !c.isActive, reason });
                      load();
                    }}
                  />
                </div>
              </div>
              {c.variants?.length ? (
                <ul className="mt-3 space-y-1 text-xs text-ink-muted">
                  {c.variants.map((v) => (
                    <li key={v.id}>
                      {v.name || v.label} · {v.unit}
                      {v.isActive === false ? ' (inactive)' : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
