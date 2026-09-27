'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/api';
import { EmptyState, StatusPill } from '@/components/admin/AdminUI';

export default function AdminSearchPage() {
  const [dashboard, setDashboard] = useState(null);
  const [aliases, setAliases] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({
    alias: '',
    canonical: '',
    category: '',
    notes: '',
    reason: '',
  });

  const load = useCallback(() => {
    setError('');
    adminApi
      .searchIntelligence({ days: 7 })
      .then((d) => setDashboard(d.dashboard))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load dashboard'));
    adminApi
      .searchAliases({ limit: 80 })
      .then((d) => setAliases(d.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveAlias(e) {
    e.preventDefault();
    setBusy('alias');
    setError('');
    try {
      await adminApi.upsertSearchAlias({
        ...form,
        category: form.category || null,
        notes: form.notes || null,
      });
      setForm({ alias: '', canonical: '', category: '', notes: '', reason: '' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save alias');
    } finally {
      setBusy('');
    }
  }

  async function removeAlias(item) {
    const reason = window.prompt('Reason for deleting this alias?', 'Remove unused alias');
    if (!reason || reason.trim().length < 3) return;
    setBusy(item.id);
    try {
      await adminApi.deleteSearchAlias(item.id, { reason: reason.trim() });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setBusy('');
    }
  }

  async function purgeStale() {
    setBusy('purge');
    try {
      const result = await adminApi.purgeSearchStale();
      alert(
        `Cleared ${result.recentCleared || 0} stale recent searches and ${result.metricsCleared || 0} old metric rows.`
      );
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Purge failed');
    } finally {
      setBusy('');
    }
  }

  const m = dashboard?.metrics;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Search &amp; Discovery</h1>
          <p className="mt-1 text-sm text-ink-muted">
            PostgreSQL-first global search analytics. Popularity metrics describe volume — not
            editorial or political importance.
          </p>
        </div>
        <button
          type="button"
          onClick={purgeStale}
          disabled={busy === 'purge'}
          className="rounded-lg border border-surface-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-50"
        >
          Purge stale history
        </button>
      </div>

      {error ? <p className="text-sm text-status-urgent">{error}</p> : null}

      {dashboard?.architecture ? (
        <p className="rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-ink-muted">
          Engine: <strong className="text-ink">{dashboard.architecture.engine}</strong>
          {' · '}
          {dashboard.architecture.note}
        </p>
      ) : null}

      {m ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[
            { label: 'Searches today', value: m.searchesToday },
            { label: 'Searches (7d)', value: m.searchesWindow },
            { label: 'Zero-result (7d)', value: m.zeroResults },
            { label: 'Avg latency', value: `${m.avgLatencyMs} ms` },
            { label: 'p95 latency', value: `${m.p95LatencyMs} ms` },
            { label: 'Aliases', value: m.aliasCount },
            { label: 'Active recent (users)', value: m.activeRecentSearches },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-surface-border bg-white px-3 py-3">
              <p className="text-xs text-ink-muted">{item.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{item.value ?? '—'}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Loading search metrics…" />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-surface-border bg-white p-4">
          <h2 className="text-base font-semibold">Zero-result queries</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Anonymized normalized queries with no hits — useful for missing vocabulary.
          </p>
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {(dashboard?.zeroResultQueries || []).length === 0 ? (
              <li className="text-sm text-ink-muted">No zero-result queries in this window.</li>
            ) : (
              (dashboard?.zeroResultQueries || []).map((row) => (
                <li
                  key={row.query}
                  className="flex items-center justify-between gap-2 rounded-lg border border-surface-border px-2.5 py-2 text-sm"
                >
                  <span className="truncate font-medium">{row.query}</span>
                  <StatusPill tone="neutral">{row.hits} hits</StatusPill>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-surface-border bg-white p-4">
          <h2 className="text-base font-semibold">Index health (live)</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Entity counts from operational tables — not a separate search index.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {(dashboard?.indexHealth || []).map((row) => (
              <li
                key={row.entity}
                className="rounded-lg border border-surface-border px-2.5 py-2 text-sm"
              >
                <p className="text-xs text-ink-muted">{row.entity}</p>
                <p className="font-semibold tabular-nums">{row.indexedCount.toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {(dashboard?.categories || []).length ? (
        <section className="rounded-xl border border-surface-border bg-white p-4">
          <h2 className="text-base font-semibold">Top query categories</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {dashboard.categories.map((c) => (
              <span
                key={c.category}
                className="rounded-full border border-surface-border px-3 py-1 text-sm"
              >
                {c.category}: <strong>{c.hits}</strong>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-surface-border bg-white p-4">
        <h2 className="text-base font-semibold">Search aliases</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          Controlled synonyms for roads, FX, agencies, and commodities. Does not auto-create entities.
        </p>

        <form onSubmit={saveAlias} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">
            <span className="text-ink-muted">Alias</span>
            <input
              className="mt-1 w-full rounded-lg border border-surface-border px-2 py-1.5"
              value={form.alias}
              onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
              required
              minLength={2}
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-muted">Canonical</span>
            <input
              className="mt-1 w-full rounded-lg border border-surface-border px-2 py-1.5"
              value={form.canonical}
              onChange={(e) => setForm((f) => ({ ...f, canonical: e.target.value }))}
              required
              minLength={2}
            />
          </label>
          <label className="text-sm">
            <span className="text-ink-muted">Category</span>
            <input
              className="mt-1 w-full rounded-lg border border-surface-border px-2 py-1.5"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="fx, traffic, fuel…"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-ink-muted">Reason (required)</span>
            <input
              className="mt-1 w-full rounded-lg border border-surface-border px-2 py-1.5"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              required
              minLength={3}
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy === 'alias'}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Save alias
            </button>
          </div>
        </form>

        <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto lg:hidden">
          {aliases.map((a) => (
            <li key={a.id} className="rounded-lg border border-surface-border p-3 text-sm">
              <p className="font-medium">
                {a.alias} → {a.canonical}
              </p>
              <p className="text-xs text-ink-muted">{a.category || 'uncategorized'}</p>
              <button
                type="button"
                className="mt-2 text-xs text-status-urgent"
                onClick={() => removeAlias(a)}
                disabled={busy === a.id}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 hidden overflow-x-auto lg:block">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-surface-border text-xs text-ink-muted">
              <tr>
                <th className="px-2 py-2">Alias</th>
                <th className="px-2 py-2">Canonical</th>
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {aliases.map((a) => (
                <tr key={a.id} className="border-b border-surface-border/60">
                  <td className="px-2 py-2 font-medium">{a.alias}</td>
                  <td className="px-2 py-2">{a.canonical}</td>
                  <td className="px-2 py-2 text-ink-muted">{a.category || '—'}</td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs text-status-urgent"
                      onClick={() => removeAlias(a)}
                      disabled={busy === a.id}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {dashboard?.rankingNote ? (
        <p className="text-xs text-ink-muted">{dashboard.rankingNote}</p>
      ) : null}
    </div>
  );
}
