'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import { AdminCard, EmptyState, StatusPill } from '@/components/admin/AdminUI';

const FRESHNESS_FILTERS = [
  { value: '', label: 'All bands' },
  { value: 'fresh', label: 'Fresh' },
  { value: 'recent', label: 'Recent' },
  { value: 'aging', label: 'Aging' },
  { value: 'stale', label: 'Stale' },
  { value: 'expired', label: 'Expired' },
];

const DOMAINS = ['traffic', 'fuel', 'prices', 'fx', 'official', 'locations'];

export default function AdminDataQualityPage() {
  const [tab, setTab] = useState('overview');
  const [quality, setQuality] = useState(null);
  const [reports, setReports] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [domainDash, setDomainDash] = useState(null);
  const [queue, setQueue] = useState(null);
  const [rules, setRules] = useState([]);
  const [inspection, setInspection] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [category, setCategory] = useState('');
  const [freshness, setFreshness] = useState('');
  const [source, setSource] = useState('');
  const [domain, setDomain] = useState('traffic');
  const [loadingList, setLoadingList] = useState(false);

  const loadSummary = useCallback(() => {
    adminApi
      .dataQualityIntelligence()
      .then((d) => setQuality(d.quality))
      .catch(() =>
        adminApi
          .dataQuality()
          .then((d) => setQuality(d.quality))
          .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      );
  }, []);

  const loadLists = useCallback(() => {
    setLoadingList(true);
    Promise.all([
      adminApi.dataQualityReports({
        category: category || undefined,
        freshness: freshness || undefined,
        source: source || undefined,
        limit: 30,
      }),
      adminApi.dataQualityConflicts({ category: category || 'traffic', limit: 20 }),
    ])
      .then(([rep, conf]) => {
        setReports(rep.items || []);
        setConflicts(conf.conflicts || []);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load lists'))
      .finally(() => setLoadingList(false));
  }, [category, freshness, source]);

  const loadDomain = useCallback(() => {
    adminApi
      .dataQualityDomain(domain)
      .then((d) => setDomainDash(d.dashboard))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Domain load failed'));
  }, [domain]);

  const loadQueue = useCallback(() => {
    adminApi
      .dataQualityReviewQueue()
      .then((d) => setQueue(d))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Queue load failed'));
    adminApi
      .dataQualityRules()
      .then((d) => setRules(d.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (tab === 'overview') loadLists();
    if (tab === 'domains') loadDomain();
    if (tab === 'review' || tab === 'rules') loadQueue();
  }, [tab, loadLists, loadDomain, loadQueue]);

  async function runScan() {
    setBusy('scan');
    setError('');
    try {
      const result = await adminApi.dataQualityScanAnomalies();
      alert(`Scan complete — ${result.created?.length || 0} events created for review.`);
      loadSummary();
      loadQueue();
      setTab('review');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Scan failed');
    } finally {
      setBusy('');
    }
  }

  async function resolveEvent(id, action) {
    const note = window.prompt(
      'Reason / note (required)',
      action === 'dismiss' ? 'Dismissed after review' : 'Resolved'
    );
    if (!note || note.trim().length < 3) return;
    setBusy(id);
    try {
      await adminApi.dataQualityResolveEvent(id, { action, note: note.trim() });
      loadQueue();
      loadSummary();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Resolve failed');
    } finally {
      setBusy('');
    }
  }

  async function toggleRule(rule) {
    const reason = window.prompt(
      'Reason for rule change',
      rule.enabled ? 'Disable rule' : 'Enable rule'
    );
    if (!reason || reason.trim().length < 3) return;
    setBusy(rule.code);
    try {
      await adminApi.dataQualityPatchRule(rule.code, {
        enabled: !rule.enabled,
        reason: reason.trim(),
      });
      loadQueue();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Rule update failed');
    } finally {
      setBusy('');
    }
  }

  async function inspectReport(id) {
    setBusy('inspect');
    try {
      const d = await adminApi.dataQualityInspect('report', id);
      setInspection(d.inspection);
      setTab('inspect');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Inspect failed');
    } finally {
      setBusy('');
    }
  }

  if (error && !quality) return <EmptyState message={error} />;
  if (!quality) return <p className="text-sm text-ink-muted">Loading data quality…</p>;

  const intel = quality.intelligence;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data quality</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Freshness, provenance, corroboration, and review — no invented trust scores.
          </p>
        </div>
        <button
          type="button"
          onClick={runScan}
          disabled={busy === 'scan'}
          className="rounded-lg border border-surface-border px-3 py-1.5 text-sm hover:bg-surface-muted disabled:opacity-50"
        >
          Scan anomalies
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Data quality sections">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'domains', label: 'Domains' },
          { id: 'review', label: 'Review queue' },
          { id: 'rules', label: 'Rules' },
          { id: 'inspect', label: 'Inspection' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`rounded-full px-3 py-1.5 text-sm ${
              tab === t.id ? 'bg-brand-600 text-white' : 'border border-surface-border bg-white'
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-status-attention">{error}</p> : null}

      {tab === 'overview' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AdminCard title="Fresh" value={quality.freshReports ?? 0} />
            <AdminCard title="Recent" value={quality.recentReports ?? 0} />
            <AdminCard title="Aging" value={quality.agingReports ?? 0} />
            <AdminCard title="Stale reports" value={quality.staleReports} />
            <AdminCard title="Expired reports" value={quality.expiredReports} />
            <AdminCard
              title="Awaiting review"
              value={quality.awaitingReview ?? quality.unresolvedFlags}
              href="/admin/moderation"
            />
            <AdminCard title="Conflicting groups" value={quality.conflictingGroups ?? 0} />
            <AdminCard title="Open quality events" value={intel?.events?.open ?? '—'} />
            <AdminCard title="Open anomalies" value={intel?.events?.anomalies ?? '—'} />
            <AdminCard title="Duplicate station candidates" value={quality.duplicateStationCandidates ?? 0} />
            <AdminCard
              title="Failed official syncs"
              value={quality.failedOfficialSyncs}
              href="/admin/official-sources"
            />
            <AdminCard
              title="Incomplete locations"
              value={quality.incompleteLocations}
              href="/admin/locations"
            />
          </div>

          {intel?.framework ? (
            <p className="rounded-xl border border-surface-border bg-white px-3 py-2 text-xs text-ink-muted">
              Opaque trust score: <strong>{String(intel.framework.opaqueTrustScore)}</strong>
              {' · '}Auto-merge: <strong>{String(intel.framework.autoMerge)}</strong>
              {' · '}
              {intel.framework.note}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3 rounded-card border border-surface-border bg-white p-3 sm:p-4">
            <label className="text-xs font-semibold text-ink-muted">
              Category
              <select
                className="mt-1 block min-w-[8rem] rounded-control border border-surface-border px-2 py-1.5 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All</option>
                <option value="traffic">Traffic</option>
                <option value="fuel">Fuel</option>
                <option value="transport">Transport</option>
                <option value="prices">Prices</option>
                <option value="local_alerts">Alerts</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-ink-muted">
              Freshness
              <select
                className="mt-1 block min-w-[8rem] rounded-control border border-surface-border px-2 py-1.5 text-sm"
                value={freshness}
                onChange={(e) => setFreshness(e.target.value)}
              >
                {FRESHNESS_FILTERS.map((f) => (
                  <option key={f.value || 'all'} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-ink-muted">
              Source
              <select
                className="mt-1 block min-w-[8rem] rounded-control border border-surface-border px-2 py-1.5 text-sm"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">All</option>
                <option value="community">Community</option>
                <option value="official">Official</option>
                <option value="aggregated">Aggregated</option>
              </select>
            </label>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">Conflicting reports</h2>
            {loadingList ? (
              <p className="text-sm text-ink-muted">Loading…</p>
            ) : conflicts.length === 0 ? (
              <p className="text-sm text-ink-muted">No conflicting traffic groups in the current window.</p>
            ) : (
              <ul className="space-y-2">
                {conflicts.map((c) => (
                  <li
                    key={c.groupKey}
                    className="rounded-card border border-status-caution/30 bg-white p-3 text-sm"
                  >
                    <p className="font-semibold text-status-caution">{c.headline}</p>
                    <p className="text-ink-muted">{c.placeName}</p>
                    <ul className="mt-1 text-xs capitalize text-ink-soft">
                      {(c.breakdown || []).map((b) => (
                        <li key={b.value}>
                          {b.label} — {b.count} reports
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">Reports</h2>
            {loadingList ? (
              <p className="text-sm text-ink-muted">Loading…</p>
            ) : reports.length === 0 ? (
              <p className="text-sm text-ink-muted">No reports match these filters.</p>
            ) : (
              <ul className="divide-y divide-surface-border rounded-card border border-surface-border bg-white">
                {reports.map((r) => (
                  <li key={r.id} className="px-3 py-3 sm:px-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">{r.title}</p>
                        <p className="text-xs text-ink-muted">
                          {r.category?.name} · {r.locationName || 'No location'} · {r.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase text-ink-soft">
                          {r.quality?.freshness?.state}
                        </span>
                        <button
                          type="button"
                          className="text-xs font-semibold text-brand-700"
                          onClick={() => inspectReport(r.id)}
                        >
                          Inspect
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {r.quality?.source?.label} · {r.quality?.verification?.label} ·{' '}
                      {r.quality?.corroboration?.label} · {r.quality?.freshness?.label}
                      {r.quality?.confidence?.label
                        ? ` · Confidence ${r.quality.confidence.label}`
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {tab === 'domains' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {DOMAINS.map((d) => (
              <button
                key={d}
                type="button"
                className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
                  domain === d ? 'bg-ink text-white' : 'border border-surface-border bg-white'
                }`}
                onClick={() => setDomain(d)}
              >
                {d}
              </button>
            ))}
          </div>
          {domainDash ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  {
                    label: 'Current / fresh',
                    value: `${domainDash.percentages?.current ?? 0}%`,
                    raw: domainDash.snapshot?.current,
                  },
                  {
                    label: 'Stale',
                    value: `${domainDash.percentages?.stale ?? 0}%`,
                    raw: domainDash.snapshot?.stale,
                  },
                  {
                    label: 'Expired',
                    value: `${domainDash.percentages?.expired ?? 0}%`,
                    raw: domainDash.snapshot?.expired,
                  },
                  {
                    label: 'Pending',
                    value: `${domainDash.percentages?.pending ?? 0}%`,
                    raw: domainDash.snapshot?.pending,
                  },
                  {
                    label: 'Flagged',
                    value: `${domainDash.percentages?.flagged ?? 0}%`,
                    raw: domainDash.snapshot?.flagged,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-surface-border bg-white px-3 py-3"
                  >
                    <p className="text-xs text-ink-muted">{item.label}</p>
                    <p className="mt-1 text-xl font-semibold">{item.value}</p>
                    <p className="text-xs text-ink-muted">{item.raw ?? 0} records</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-muted">{domainDash.methodology}</p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Loading domain…</p>
          )}
        </section>
      ) : null}

      {tab === 'review' ? (
        <section className="space-y-3">
          <p className="text-sm text-ink-muted">
            Open flags: {queue?.openFlags ?? '—'} · Moderation backlog: {queue?.moderationBacklog ?? '—'}
            <br />
            {queue?.note}
          </p>
          <ul className="space-y-2">
            {(queue?.items || []).length === 0 ? (
              <li className="text-sm text-ink-muted">No open quality events.</li>
            ) : (
              (queue?.items || []).map((e) => (
                <li
                  key={e.id}
                  className="rounded-xl border border-surface-border bg-white p-3 text-sm lg:flex lg:justify-between lg:gap-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{e.title}</p>
                      <StatusPill status={e.eventType} />
                      <span className="text-xs text-ink-muted">priority {e.priority}</span>
                    </div>
                    <p className="mt-1 text-ink-muted">{e.explanation}</p>
                    <ul className="mt-1 list-disc pl-4 text-xs text-ink-soft">
                      {(e.reasons || []).map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 lg:mt-0 lg:flex-col">
                    <button
                      type="button"
                      className="rounded-lg bg-brand-600 px-2 py-1 text-xs text-white"
                      disabled={busy === e.id}
                      onClick={() => resolveEvent(e.id, 'resolve')}
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-surface-border px-2 py-1 text-xs"
                      disabled={busy === e.id}
                      onClick={() => resolveEvent(e.id, 'dismiss')}
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
          <p className="text-sm text-ink-muted">
            Act on community flags in{' '}
            <Link href="/admin/moderation" className="font-semibold text-brand-700">
              Moderation Center
            </Link>
            .
          </p>
        </section>
      ) : null}

      {tab === 'rules' ? (
        <section className="space-y-3">
          <p className="text-sm text-ink-muted">
            Configurable validation rules. Anomalies are flagged for review — never auto-classified as
            false.
          </p>
          <ul className="space-y-2 lg:hidden">
            {rules.map((rule) => (
              <li key={rule.code} className="rounded-xl border border-surface-border bg-white p-3 text-sm">
                <p className="font-medium">{rule.name}</p>
                <p className="text-xs text-ink-muted">
                  {rule.domain} · {rule.ruleKind} · {rule.enabled ? 'enabled' : 'disabled'}
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-brand-700"
                  disabled={busy === rule.code}
                  onClick={() => toggleRule(rule)}
                >
                  {rule.enabled ? 'Disable' : 'Enable'}
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-surface-border bg-white lg:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-surface-border text-xs text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Rule</th>
                  <th className="px-3 py-2">Domain</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.code} className="border-b border-surface-border/60">
                    <td className="px-3 py-2">
                      <p className="font-medium">{rule.name}</p>
                      <p className="text-xs text-ink-muted">{rule.description}</p>
                    </td>
                    <td className="px-3 py-2 capitalize">{rule.domain}</td>
                    <td className="px-3 py-2">{rule.severity}</td>
                    <td className="px-3 py-2">{rule.enabled ? 'Enabled' : 'Disabled'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs font-semibold text-brand-700"
                        disabled={busy === rule.code}
                        onClick={() => toggleRule(rule)}
                      >
                        Toggle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'inspect' ? (
        <section className="space-y-3">
          {!inspection ? (
            <p className="text-sm text-ink-muted">
              Select Inspect on a report from Overview to view lineage and validation.
            </p>
          ) : (
            <div className="space-y-4 rounded-xl border border-surface-border bg-white p-4">
              <div>
                <h2 className="text-lg font-bold">{inspection.original?.title}</h2>
                <p className="text-sm text-ink-muted">
                  {inspection.original?.category} · {inspection.original?.locationName} ·{' '}
                  {inspection.original?.status}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Lineage</h3>
                <ol className="mt-2 space-y-1 text-sm">
                  {(inspection.lineage || []).map((step) => (
                    <li key={step.step}>
                      <strong>{step.step}:</strong> {step.detail}
                    </li>
                  ))}
                </ol>
              </div>
              {inspection.quality?.confidence ? (
                <div>
                  <h3 className="text-sm font-semibold">
                    Confidence — {inspection.quality.confidence.label}
                  </h3>
                  <p className="text-xs text-ink-muted">{inspection.quality.confidence.note}</p>
                  <ul className="mt-1 list-disc pl-4 text-sm">
                    {(inspection.quality.confidence.reasons || []).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {inspection.quality?.dimensions ? (
                <div>
                  <h3 className="text-sm font-semibold">Quality dimensions</h3>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {Object.entries(inspection.quality.dimensions).map(([key, val]) => (
                      <li key={key} className="rounded-lg border border-surface-border px-2 py-2 text-xs">
                        <p className="font-semibold capitalize">
                          {key} — {val.status}
                        </p>
                        <p className="text-ink-muted">{val.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
