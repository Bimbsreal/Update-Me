'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/api';
import {
  ConfirmAction,
  EmptyState,
  FilterSelect,
  StatusPill,
} from '@/components/admin/AdminUI';

const ACTIONS = [
  { code: 'approve', label: 'Approve' },
  { code: 'confirm', label: 'Confirm' },
  { code: 'under_review', label: 'Further review' },
  { code: 'mark_inaccurate', label: 'Inaccurate', danger: true },
  { code: 'mark_duplicate', label: 'Duplicate', danger: true },
  { code: 'remove', label: 'Remove', danger: true },
  { code: 'restore', label: 'Restore' },
  { code: 'dismiss_flag', label: 'Dismiss flag' },
];

export default function AdminModerationPage() {
  const [items, setItems] = useState([]);
  const [type, setType] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    adminApi
      .moderation({ type: type || undefined, limit: 50 })
      .then((d) => setItems(d.items || []))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load queue'));
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(item, action, reason) {
    const id = item.queueId || `${item.contentType}:${item.id}`;
    setBusy(id);
    setError('');
    try {
      await adminApi.moderationAction(id, { action, reason });
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
        <h1 className="text-2xl font-bold tracking-tight">Moderation queue</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Flagged reports, questions, answers, and items under review.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect label="Type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All</option>
          <option value="report">Reports</option>
          <option value="alert">Alerts</option>
          <option value="question">Questions</option>
          <option value="answer">Answers</option>
        </FilterSelect>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!items.length ? (
        <EmptyState message="Nothing needs attention right now." />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.queueId || item.id}
              className="rounded-xl border border-surface-border bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {item.contentType}
                    {item.category ? ` · ${item.category}` : ''}
                  </p>
                  <h2 className="mt-1 text-base font-bold text-ink break-words">{item.title}</h2>
                  {item.summary ? (
                    <p className="mt-1 text-sm text-ink-muted break-words">{item.summary}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-ink-muted">
                    {item.location?.name || 'No location'}
                    {item.creator?.displayName ? ` · ${item.creator.displayName}` : ''}
                    {item.createdAt
                      ? ` · ${new Date(item.createdAt).toLocaleString()}`
                      : ''}
                  </p>
                  {item.reason ? (
                    <p className="mt-1 text-xs font-medium text-amber-800">Reason: {item.reason}</p>
                  ) : null}
                </div>
                <StatusPill status={item.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {ACTIONS.map((a) => (
                  <ConfirmAction
                    key={a.code}
                    label={a.label}
                    danger={a.danger}
                    disabled={busy === (item.queueId || `${item.contentType}:${item.id}`)}
                    onConfirm={(reason) => act(item, a.code, reason)}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
