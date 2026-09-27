'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import { ConfirmAction, EmptyState, StatusPill } from '@/components/admin/AdminUI';

export default function AdminOfficialSourcesPage() {
  const [sources, setSources] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [tab, setTab] = useState('sources');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    id: '',
    organizationName: '',
    shortName: '',
    agencyType: 'other',
    jurisdictionLevel: 'national',
    ingestionMethod: 'fixture',
    providerKey: 'fixture',
    syncIntervalMinutes: 360,
    status: 'draft',
    verificationStatus: 'unverified',
    officialWebsite: '',
    feedUrl: '',
  });

  const load = useCallback(() => {
    adminApi
      .officialSources()
      .then((d) => setSources(d.sources || []))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load sources'));
    adminApi
      .officialOrganizations({ limit: 100 })
      .then((d) => setOrganizations(d.items || []))
      .catch(() => setOrganizations([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createSource(e) {
    e.preventDefault();
    setError('');
    try {
      await adminApi.createOfficialSource({
        ...form,
        officialWebsite: form.officialWebsite || null,
        feedUrl: form.feedUrl || null,
        syncIntervalMinutes: Number(form.syncIntervalMinutes),
      });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Create failed');
    }
  }

  async function toggleStatus(source, nextStatus, reason) {
    setBusy(source.id);
    try {
      await adminApi.updateOfficialSource(source.id, { status: nextStatus, notes: reason });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusy('');
    }
  }

  async function verify(source, reason) {
    setBusy(source.id);
    try {
      await adminApi.updateOfficialSource(source.id, {
        verificationStatus: 'verified',
        status: source.status === 'draft' ? 'approved' : source.status,
        notes: reason,
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verify failed');
    } finally {
      setBusy('');
    }
  }

  async function sync(id) {
    setBusy(id || 'all');
    try {
      if (id) await adminApi.syncOfficialSource(id);
      else await adminApi.syncOfficialAll();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync failed');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Government & Official Sources</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Approved public-institution sources only. Official ≠ verified community, and credentials
            are never shown.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/admin/source-health"
            className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold"
          >
            Source health
          </a>
          <a
            href="/admin/ingestion-runs"
            className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold"
          >
            Ingestion runs
          </a>
          <button
            type="button"
            onClick={() => sync(null)}
            disabled={busy === 'all'}
            className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold"
          >
            Sync all
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
          >
            {showForm ? 'Cancel' : 'Add source'}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex flex-wrap gap-1 border-b border-surface-border pb-2" role="tablist">
        {[
          { id: 'sources', label: 'Sources' },
          { id: 'organizations', label: 'Organizations' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              tab === t.id ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-surface-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'organizations' ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-muted">
            Organizations are distinct from individual feed/API sources. Sources link to an
            organization when mapped.
          </p>
          {!organizations.length ? (
            <EmptyState message="No organizations yet — they are created from verified sources." />
          ) : (
            <ul className="space-y-2">
              {organizations.map((o) => (
                <li
                  key={o.id}
                  className="rounded-xl border border-surface-border bg-white p-3 text-sm"
                >
                  <p className="font-semibold">
                    {o.shortName || o.name}{' '}
                    <span className="text-xs font-normal text-ink-muted">({o.code})</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {o.agencyType} · {o.jurisdictionLevel} · {o.sourceCount} source
                    {o.sourceCount === 1 ? '' : 's'}
                    {!o.isActive ? ' · inactive' : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'sources' && showForm ? (
        <form
          onSubmit={createSource}
          className="grid gap-2 rounded-xl border border-surface-border bg-white p-4 sm:grid-cols-2"
        >
          {[
            ['id', 'Source id'],
            ['organizationName', 'Organization'],
            ['shortName', 'Short name'],
            ['providerKey', 'Provider key'],
            ['officialWebsite', 'Website'],
            ['feedUrl', 'Feed URL'],
          ].map(([key, label]) => (
            <label key={key} className="text-xs font-medium text-ink-muted">
              {label}
              <input
                required={['id', 'organizationName', 'providerKey'].includes(key)}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
              />
            </label>
          ))}
          <label className="text-xs font-medium text-ink-muted">
            Ingestion method
            <select
              value={form.ingestionMethod}
              onChange={(e) => setForm((f) => ({ ...f, ingestionMethod: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
            >
              <option value="api">api</option>
              <option value="rss">rss</option>
              <option value="atom">atom</option>
              <option value="structured_feed">structured_feed</option>
              <option value="web_publication">web_publication</option>
              <option value="fixture">fixture</option>
              <option value="manual_entry">manual_entry</option>
            </select>
          </label>
          <label className="text-xs font-medium text-ink-muted">
            Sync interval (minutes)
            <input
              type="number"
              min={5}
              value={form.syncIntervalMinutes}
              onChange={(e) => setForm((f) => ({ ...f, syncIntervalMinutes: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white sm:col-span-2"
          >
            Create approved source
          </button>
        </form>
      ) : null}

      {!sources.length ? (
        <EmptyState message="No official sources configured." />
      ) : tab !== 'sources' ? null : (
        <ul className="space-y-3">
          {sources.map((s) => (
            <li key={s.id} className="rounded-xl border border-surface-border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/admin/official-sources/${s.id}`}
                    className="font-bold text-brand-800 hover:underline"
                  >
                    {s.organizationName}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {s.id} · {s.agencyType} · {s.ingestionMethod} · every {s.syncIntervalMinutes}m
                    {s.organizationId ? ' · org linked' : ''}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Last success:{' '}
                    {s.lastSuccessAt ? new Date(s.lastSuccessAt).toLocaleString() : 'never'}
                    {' · '}
                    Last failure:{' '}
                    {s.lastFailureAt ? new Date(s.lastFailureAt).toLocaleString() : 'never'}
                    {' · '}
                    Last attempt:{' '}
                    {s.lastAttemptAt ? new Date(s.lastAttemptAt).toLocaleString() : 'never'}
                  </p>
                  {s.lastErrorMessage ? (
                    <p className="mt-1 text-xs text-red-700 break-words">{s.lastErrorMessage}</p>
                  ) : null}
                  {s.credentialsConfigured ? (
                    <p className="mt-1 text-xs text-ink-muted">Credentials: Configured</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusPill status={s.healthStatus || 'unknown'} />
                  <StatusPill status={s.status} />
                  <StatusPill status={s.verificationStatus} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <ConfirmAction
                  label="Verify"
                  disabled={busy === s.id}
                  onConfirm={(reason) => verify(s, reason)}
                />
                <ConfirmAction
                  label={s.status === 'active' ? 'Disable' : 'Enable'}
                  disabled={busy === s.id}
                  onConfirm={(reason) =>
                    toggleStatus(s, s.status === 'active' ? 'disabled' : 'active', reason)
                  }
                />
                <button
                  type="button"
                  disabled={busy === s.id || s.status !== 'active'}
                  onClick={() => sync(s.id)}
                  className="min-h-10 rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Sync now
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
