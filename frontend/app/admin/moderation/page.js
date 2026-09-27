'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import { useAdmin } from '@/components/admin/AdminContext';
import {
  AdminCard,
  EmptyState,
  FilterInput,
  FilterSelect,
  Pagination,
  StatusPill,
} from '@/components/admin/AdminUI';

const VIEWS = [
  { id: 'attention', label: 'Needs attention' },
  { id: 'pending', label: 'Pending review' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'reviewed', label: 'Recently reviewed' },
  { id: 'removed', label: 'Removed / hidden' },
];

const ACTION_META = {
  approve: { label: 'Approve', danger: false },
  confirm: { label: 'Confirm', danger: false },
  under_review: { label: 'Further review', danger: false },
  escalate: { label: 'Escalate', danger: false },
  dismiss_flag: { label: 'Dismiss flag', danger: false },
  restore: { label: 'Restore', danger: false },
  mark_stale: { label: 'Mark stale', danger: false },
  expire: { label: 'Expire', danger: false },
  set_priority: { label: 'Mark priority', danger: false },
  clear_priority: { label: 'Clear priority', danger: false },
  link_event: { label: 'Link event group', danger: false },
  link_official: { label: 'Link official update', danger: false },
  mark_duplicate: { label: 'Mark duplicate', danger: true },
  mark_inaccurate: { label: 'Mark inaccurate', danger: true },
  remove: { label: 'Hide / remove', danger: true },
};

function freshnessLabel(freshness) {
  if (!freshness) return null;
  if (freshness.state) {
    return `${String(freshness.state).replace(/_/g, ' ')}${
      freshness.ageLabel ? ` · ${freshness.ageLabel}` : ''
    }`;
  }
  return freshness.ageLabel || freshness.label || null;
}

function ModerationActionDialog({ open, action, reasons, onClose, onSubmit, busy }) {
  const titleId = useId();
  const [reasonCode, setReasonCode] = useState('');
  const [reason, setReason] = useState('');
  const [relatedReportId, setRelatedReportId] = useState('');
  const [officialUpdateId, setOfficialUpdateId] = useState('');
  const [priority, setPriority] = useState('priority');
  const firstField = useRef(null);

  useEffect(() => {
    if (open) {
      setReasonCode('');
      setReason('');
      setRelatedReportId('');
      setOfficialUpdateId('');
      setPriority('priority');
      queueMicrotask(() => firstField.current?.focus());
    }
  }, [open, action]);

  if (!open || !action) return null;
  const meta = ACTION_META[action] || { label: action, danger: false };
  const needsRelated =
    action === 'mark_duplicate' || action === 'link_event';
  const needsOfficial = action === 'link_official';
  const needsPriority = action === 'set_priority';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-surface-border bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-bold text-ink">
          {meta.label}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Choose a structured reason when it fits, or write a custom explanation. Actions are
          audited.
        </p>

        <label className="mt-4 block text-xs font-medium text-ink-muted">
          Reason (optional picker)
          <select
            ref={firstField}
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
          >
            <option value="">Custom / write below</option>
            {(reasons || []).map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block text-xs font-medium text-ink-muted">
          Explanation {reasonCode ? '(optional notes)' : '(required)'}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
            placeholder="Briefly explain the decision"
          />
        </label>

        {needsPriority ? (
          <label className="mt-3 block text-xs font-medium text-ink-muted">
            Priority level
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
            >
              <option value="priority">Priority</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
        ) : null}

        {needsRelated ? (
          <label className="mt-3 block text-xs font-medium text-ink-muted">
            Related report ID (optional — groups duplicates without deleting provenance)
            <input
              value={relatedReportId}
              onChange={(e) => setRelatedReportId(e.target.value.trim())}
              className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 font-mono text-sm"
              placeholder="UUID of canonical / related report"
            />
          </label>
        ) : null}

        {needsOfficial ? (
          <label className="mt-3 block text-xs font-medium text-ink-muted">
            Official update ID
            <input
              value={officialUpdateId}
              onChange={(e) => setOfficialUpdateId(e.target.value.trim())}
              className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 font-mono text-sm"
              placeholder="UUID of related official update"
              required
            />
          </label>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              busy ||
              (!reasonCode && reason.trim().length < 3) ||
              (needsOfficial && !officialUpdateId)
            }
            onClick={() =>
              onSubmit({
                action,
                reasonCode: reasonCode || undefined,
                reason: reason.trim() || undefined,
                relatedReportId: relatedReportId || undefined,
                officialUpdateId: officialUpdateId || undefined,
                priority: needsPriority ? priority : undefined,
              })
            }
            className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              meta.danger ? 'bg-red-700 hover:bg-red-800' : 'bg-brand-700 hover:bg-brand-800'
            }`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function QueueItemCard({ item, selected, onSelect, onQuickAction }) {
  const actions = (item.allowedActions || []).filter((a) => ACTION_META[a]);
  const primary = actions.filter((a) => !ACTION_META[a]?.danger).slice(0, 2);
  const destructive = actions.filter((a) => ACTION_META[a]?.danger);

  return (
    <article
      className={`rounded-xl border bg-white p-3 shadow-sm sm:p-4 ${
        selected ? 'border-brand-400 ring-1 ring-brand-200' : 'border-surface-border'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelect(item)}
          className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {item.contentType}
            {item.category ? ` · ${item.category}` : ''}
            {item.isOfficial ? ' · Official' : ''}
            {item.isSafety ? ' · Safety' : ''}
            {item.moderationPriority && item.moderationPriority !== 'normal'
              ? ` · ${item.moderationPriority}`
              : ''}
          </p>
          <h2 className="mt-1 text-sm font-bold text-ink break-words sm:text-base">{item.title}</h2>
          {item.summary ? (
            <p className="mt-1 text-sm text-ink-muted break-words line-clamp-2">{item.summary}</p>
          ) : null}
        </button>
        <div className="flex flex-col items-end gap-1">
          <StatusPill status={item.status} />
          {item.moderationState ? (
            <span className="text-[11px] text-ink-muted">
              {String(item.moderationState).replace(/_/g, ' ')}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-muted sm:grid-cols-4">
        <div>
          <dt className="font-medium text-ink/70">Location</dt>
          <dd className="break-words">
            {item.location?.name || '—'}
            {item.location?.state ? `, ${item.location.state}` : ''}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink/70">Submitted by</dt>
          <dd>{item.creator?.displayName || item.reviewedBy || '—'}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink/70">When</dt>
          <dd>
            {item.createdAt
              ? new Date(item.createdAt).toLocaleString()
              : item.reviewedAt
                ? new Date(item.reviewedAt).toLocaleString()
                : '—'}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink/70">Flags</dt>
          <dd>
            {item.flagCount ?? 0}
            {item.openFlagCount != null && item.openFlagCount !== item.flagCount
              ? ` (${item.openFlagCount} open)`
              : ''}
          </dd>
        </div>
      </dl>

      {freshnessLabel(item.freshness) ? (
        <p className="mt-2 text-xs text-ink-muted">
          Freshness: <span className="font-medium text-ink">{freshnessLabel(item.freshness)}</span>
          <span className="sr-only"> (separate from accuracy)</span>
        </p>
      ) : null}

      {item.reason ? (
        <p className="mt-1 text-xs font-medium text-amber-900">Flag: {item.reason}</p>
      ) : null}

      {!item.isReviewedItem ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="rounded-lg border border-surface-border px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-surface-muted"
          >
            Review
          </button>
          {primary.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => onQuickAction(item, code)}
              className="rounded-lg bg-surface-muted px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-brand-50"
            >
              {ACTION_META[code]?.label || code}
            </button>
          ))}
          {destructive.length ? (
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-800">
                More actions
              </summary>
              <div className="absolute right-0 z-10 mt-1 min-w-[10rem] rounded-lg border border-surface-border bg-white p-1 shadow-md">
                {destructive.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => onQuickAction(item, code)}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-red-800 hover:bg-red-50"
                  >
                    {ACTION_META[code]?.label || code}
                  </button>
                ))}
                {actions
                  .filter((a) => !primary.includes(a) && !destructive.includes(a))
                  .map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => onQuickAction(item, code)}
                      className="block w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-ink hover:bg-surface-muted"
                    >
                      {ACTION_META[code]?.label || code}
                    </button>
                  ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function DetailPanel({
  detail,
  loading,
  error,
  onClose,
  onAction,
  onCorrectLocation,
  canCorrectLocation,
  busy,
}) {
  const [locationId, setLocationId] = useState('');
  const [locReason, setLocReason] = useState('');
  const item = detail?.item;

  if (!detail && !loading) {
    return (
      <aside className="hidden rounded-xl border border-dashed border-surface-border bg-white p-4 lg:block">
        <EmptyState message="Select an item to review details, flags, and history." />
      </aside>
    );
  }

  return (
    <aside className="rounded-xl border border-surface-border bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-base font-bold text-ink">Review detail</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-surface-border px-2 py-1 text-xs font-semibold lg:hidden"
        >
          Close
        </button>
      </div>

      {loading ? <p className="text-sm text-ink-muted">Loading…</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {item ? (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {item.contentType}
              {item.category ? ` · ${item.category}` : ''}
            </p>
            <h3 className="mt-1 text-lg font-bold break-words">{item.title}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill status={item.status} />
              {item.moderationState ? <StatusPill status={item.moderationState} /> : null}
              {item.moderationPriority && item.moderationPriority !== 'normal' ? (
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-950">
                  {item.moderationPriority === 'urgent' ? 'Urgent' : 'Priority'}
                </span>
              ) : null}
              {item.isOfficial ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                  Officially sourced
                </span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                  Community report
                </span>
              )}
              {item.isSafety ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-950">
                  Safety-related
                </span>
              ) : null}
            </div>
          </div>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Original submission
            </h4>
            <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-surface-muted/60 p-3 text-sm text-ink">
              {item.body || item.summary || '—'}
            </p>
          </section>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-ink-muted">Location</dt>
              <dd>
                {item.location?.name || '—'}
                {item.location?.lga ? ` · ${item.location.lga}` : ''}
                {item.location?.state ? ` · ${item.location.state}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted">Submitted</dt>
              <dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted">Submitter</dt>
              <dd>
                {item.creator?.displayName || '—'}
                {item.creator?.email ? (
                  <span className="ml-1 break-all text-xs text-ink-muted">
                    ({item.creator.email})
                  </span>
                ) : null}
                {item.creator?.reportingDisabled ? (
                  <span className="ml-1 text-xs font-semibold text-amber-900">
                    · reporting restricted
                  </span>
                ) : null}
                {item.creator?.id ? (
                  <>
                    {' · '}
                    <Link
                      href={`/admin/users?focus=${encodeURIComponent(item.creator.id)}`}
                      className="font-semibold text-brand-700 underline-offset-2 hover:underline"
                    >
                      Account
                    </Link>
                  </>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted">Observed</dt>
              <dd>
                {item.observedAt ? new Date(item.observedAt).toLocaleString() : '—'}
              </dd>
            </div>
            {item.confirmations ? (
              <div>
                <dt className="text-xs font-medium text-ink-muted">Community confirmations</dt>
                <dd>
                  Still accurate: {item.confirmations.accurate ?? 0}
                  {' · '}
                  Inaccurate: {item.confirmations.inaccurate ?? 0}
                  {item.confirmations.lastConfirmedAt
                    ? ` · last ${new Date(item.confirmations.lastConfirmedAt).toLocaleString()}`
                    : ''}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs font-medium text-ink-muted">Source</dt>
              <dd>
                {item.sourceLabel || item.sourceType || '—'}
                {item.verificationLabel ? ` · ${item.verificationLabel}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-muted">Freshness</dt>
              <dd>{freshnessLabel(item.freshness) || '—'}</dd>
            </div>
            {item.coordinates ? (
              <div>
                <dt className="text-xs font-medium text-ink-muted">Map context</dt>
                <dd className="tabular-nums text-xs">
                  {item.coordinates.lat.toFixed(5)}, {item.coordinates.lng.toFixed(5)}
                </dd>
              </div>
            ) : null}
            {item.alertSeverity ? (
              <div>
                <dt className="text-xs font-medium text-ink-muted">Alert severity</dt>
                <dd>{item.alertSeverity}</dd>
              </div>
            ) : null}
          </dl>

          {item.isOfficial ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
              Official-source content cannot be rewritten as community authorship. Use hide,
              restore, escalate, or freshness actions only.
            </p>
          ) : null}

          {detail.privacyNote ? (
            <p className="text-[11px] text-ink-muted">{detail.privacyNote}</p>
          ) : null}

          {item.qualitySignals ? (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Quality signals
              </h4>
              <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {Object.entries(item.qualitySignals)
                  .filter(([, v]) => v)
                  .map(([k]) => (
                    <li
                      key={k}
                      className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-950"
                    >
                      {String(k).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                    </li>
                  ))}
                {!Object.values(item.qualitySignals).some(Boolean) ? (
                  <li className="text-ink-muted">No concrete quality issues flagged.</li>
                ) : null}
              </ul>
            </section>
          ) : null}

          {item.relatedOfficial ? (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Related official update
              </h4>
              <p className="mt-1 text-sm text-ink">
                {item.relatedOfficial.title || item.relatedOfficial.id}
                {item.relatedOfficial.status ? ` · ${item.relatedOfficial.status}` : ''}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Cross-reference only — community and official records stay distinct.
              </p>
            </section>
          ) : null}

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Flags ({detail.flags?.length || 0})
            </h4>
            {!detail.flags?.length ? (
              <p className="mt-1 text-sm text-ink-muted">No flags recorded.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {detail.flags.map((f) => (
                  <li
                    key={f.id}
                    className="rounded-lg border border-surface-border px-3 py-2 text-xs"
                  >
                    <p className="font-semibold text-ink">{f.reason}</p>
                    {f.details ? <p className="mt-0.5 text-ink-muted break-words">{f.details}</p> : null}
                    <p className="mt-1 text-ink-muted">
                      {f.flaggerName || 'User'} · {f.status || 'open'} ·{' '}
                      {f.createdAt ? new Date(f.createdAt).toLocaleString() : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {detail.relatedReports?.length ? (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Possible related (same location/category, 24h)
              </h4>
              <ul className="mt-2 space-y-1 text-sm">
                {detail.relatedReports.map((r) => (
                  <li key={r.id} className="break-words text-ink-muted">
                    <span className="font-medium text-ink">{r.title}</span>
                    {' · '}
                    {r.category} · {r.status} ·{' '}
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-ink-muted">
                Deterministic proximity only — not auto-merged.
              </p>
            </section>
          ) : null}

          {detail.eventGroupReports?.length ? (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Same event group
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                {detail.eventGroupReports.map((r) => (
                  <li key={r.id}>
                    <span className="font-medium text-ink">{r.title}</span>
                    {' · '}
                    {r.status}
                    {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleString()}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {detail.conflictingReports?.length ? (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Conflicting signals nearby
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                {detail.conflictingReports.map((r) => (
                  <li key={r.id}>
                    <span className="font-medium text-ink">{r.title}</span>
                    {' · '}
                    {r.status}
                    {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleString()}` : ''}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-ink-muted">
                Presented for investigation — the system does not auto-pick a winner.
              </p>
            </section>
          ) : null}

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Moderation audit
            </h4>
            {!detail.moderationAudit?.length ? (
              <p className="mt-1 text-sm text-ink-muted">No prior moderation actions.</p>
            ) : (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-ink-muted">
                {detail.moderationAudit.map((a, i) => (
                  <li key={`${a.action}-${i}`}>
                    <span className="font-medium text-ink">{a.action.replace('moderation.', '')}</span>
                    {' · '}
                    {a.actorName || 'Staff'} · {a.reason || '—'} ·{' '}
                    {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {detail.history?.length ? (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Report history
              </h4>
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-ink-muted">
                {detail.history.map((h, i) => (
                  <li key={`${h.eventType}-${i}`}>
                    {h.eventType}: {h.fromStatus || '—'} → {h.toStatus || '—'}
                    {h.note ? ` · ${h.note}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Actions
            </h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {(item.allowedActions || []).map((code) => {
                const meta = ACTION_META[code] || { label: code, danger: false };
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(item, code)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                      meta.danger
                        ? 'bg-red-50 text-red-800 hover:bg-red-100'
                        : 'bg-surface-muted text-ink hover:bg-brand-50'
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </section>

          {canCorrectLocation &&
          (item.contentType === 'report' || item.contentType === 'alert') &&
          !item.isOfficial ? (
            <section className="border-t border-surface-border pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Correct location metadata
              </h4>
              <p className="mt-1 text-xs text-ink-muted">
                Does not change the original submission text. Audit trail records the previous
                location.
              </p>
              <label className="mt-2 block text-xs font-medium text-ink-muted">
                New location ID
                <input
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
                  placeholder="UUID"
                />
              </label>
              <label className="mt-2 block text-xs font-medium text-ink-muted">
                Reason
                <input
                  value={locReason}
                  onChange={(e) => setLocReason(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy || !locationId || locReason.trim().length < 3}
                onClick={() => onCorrectLocation(item.id, locationId.trim(), locReason.trim())}
                className="mt-2 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Apply location correction
              </button>
            </section>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

export default function AdminModerationPage() {
  const { can } = useAdmin();
  const [view, setView] = useState('attention');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('updated');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [reasons, setReasons] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [dialog, setDialog] = useState({ open: false, action: null, target: null });
  const limit = 20;

  const loadMetrics = useCallback(() => {
    adminApi
      .moderationMetrics()
      .then((d) => setMetrics(d.metrics || null))
      .catch(() => setMetrics(null));
  }, []);

  const load = useCallback(() => {
    setError('');
    adminApi
      .moderation({
        view,
        type: type || undefined,
        q: q.trim() || undefined,
        sort,
        limit,
        page,
      })
      .then((d) => {
        setItems(d.items || []);
        setTotal(d.total || 0);
        if (d.reasons?.length) setReasons(d.reasons);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load queue'));
  }, [view, type, q, sort, page]);

  useEffect(() => {
    load();
    loadMetrics();
  }, [load, loadMetrics]);

  const openDetail = useCallback((item) => {
    if (!item?.queueId || item.isReviewedItem) {
      setSelectedId(item?.queueId || null);
      setDetail(item?.isReviewedItem ? { item, flags: [], moderationAudit: [], history: [] } : null);
      return;
    }
    setSelectedId(item.queueId);
    setDetailLoading(true);
    setDetailError('');
    adminApi
      .moderationDetail(item.queueId)
      .then((d) => setDetail(d))
      .catch((err) => {
        setDetail(null);
        setDetailError(err instanceof ApiError ? err.message : 'Failed to load detail');
      })
      .finally(() => setDetailLoading(false));
  }, []);

  function requestAction(item, action) {
    setDialog({ open: true, action, target: item });
  }

  async function submitAction(payload) {
    const target = dialog.target;
    if (!target) return;
    const id = target.queueId || `${target.contentType}:${target.id}`;
    setBusy(true);
    setError('');
    try {
      await adminApi.moderationAction(id, payload);
      setDialog({ open: false, action: null, target: null });
      load();
      loadMetrics();
      if (selectedId === id) {
        const refreshed = await adminApi.moderationDetail(id);
        setDetail(refreshed);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function correctLocation(reportId, locationId, reason) {
    setBusy(true);
    setError('');
    try {
      await adminApi.correctReportLocation(reportId, { locationId, reason });
      load();
      if (selectedId) {
        const refreshed = await adminApi.moderationDetail(selectedId);
        setDetail(refreshed);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Location correction failed');
    } finally {
      setBusy(false);
    }
  }

  const canCorrect = can('moderation') || can('locations_edit');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Moderation Center</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Keep Update Me useful and accurate for traffic, transport, fuel, commodities, safety,
          and related everyday information in Nigeria.
        </p>
      </div>

      {metrics ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <button type="button" className="text-left" onClick={() => { setView('pending'); setPage(1); }}>
            <AdminCard title="Pending" value={metrics.pending} hint="Under review" />
          </button>
          <button type="button" className="text-left" onClick={() => { setView('flagged'); setPage(1); }}>
            <AdminCard title="Flagged" value={metrics.flagged} />
          </button>
          <AdminCard title="Reports today" value={metrics.reportsToday ?? 0} />
          <AdminCard title="Approved today" value={metrics.approvedToday ?? 0} />
          <AdminCard title="Rejected today" value={metrics.rejectedToday ?? 0} />
          <button type="button" className="text-left" onClick={() => { setView('escalated'); setPage(1); }}>
            <AdminCard title="Escalated" value={metrics.escalated} />
          </button>
          <button type="button" className="text-left" onClick={() => { setView('removed'); setPage(1); }}>
            <AdminCard title="Hidden" value={metrics.removed} />
          </button>
          <AdminCard title="Priority queue" value={metrics.priorityReports ?? 0} />
          <AdminCard title="Duplicate candidates" value={metrics.duplicateCandidates ?? 0} />
          <AdminCard title="Stale reports" value={metrics.staleReports} />
          <button type="button" className="text-left" onClick={() => { setView('reviewed'); setPage(1); }}>
            <AdminCard title="Reviewed today" value={metrics.reviewedToday} />
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Moderation views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => {
              setView(v.id);
              setPage(1);
              setSelectedId(null);
              setDetail(null);
            }}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:text-sm ${
              view === v.id
                ? 'bg-brand-700 text-white'
                : 'border border-surface-border bg-white text-ink hover:bg-surface-muted'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-surface-border bg-white p-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-sm font-semibold text-ink md:hidden"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
        >
          Filters & search
          <span aria-hidden>{filtersOpen ? '−' : '+'}</span>
        </button>
        <div className={`mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 ${filtersOpen ? 'block' : 'hidden md:grid'}`}>
          <FilterInput
            label="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title or description"
          />
          <FilterSelect label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            <option value="report">Reports</option>
            <option value="alert">Safety alerts</option>
            <option value="question">Questions</option>
            <option value="answer">Answers</option>
          </FilterSelect>
          <FilterSelect label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="updated">Recently updated</option>
            <option value="created">Newest submitted</option>
            <option value="flags">Most flags</option>
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
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <div className="space-y-3">
          {!items.length ? (
            <EmptyState message="Nothing in this view right now." />
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.queueId || item.id}>
                  <QueueItemCard
                    item={item}
                    selected={selectedId === item.queueId}
                    onSelect={openDetail}
                    onQuickAction={requestAction}
                  />
                </li>
              ))}
            </ul>
          )}
          <Pagination page={page} total={total} limit={limit} onPage={setPage} />
        </div>

        <div className={selectedId || detailLoading ? 'block' : 'hidden lg:block'}>
          <DetailPanel
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onClose={() => {
              setSelectedId(null);
              setDetail(null);
            }}
            onAction={requestAction}
            onCorrectLocation={correctLocation}
            canCorrectLocation={canCorrect}
            busy={busy}
          />
        </div>
      </div>

      <ModerationActionDialog
        open={dialog.open}
        action={dialog.action}
        reasons={reasons}
        busy={busy}
        onClose={() => setDialog({ open: false, action: null, target: null })}
        onSubmit={submitAction}
      />
    </div>
  );
}
