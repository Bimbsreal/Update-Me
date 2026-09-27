'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

const FRESHNESS_STYLES = {
  fresh: 'text-status-normal',
  recent: 'text-ink-muted',
  aging: 'text-status-caution',
  stale: 'text-status-caution',
  expired: 'text-status-expired',
};

/**
 * Compact, transparent quality signals — not a trust score.
 */
export function QualitySignals({ quality, about, conflict, className, compact = false }) {
  if (!quality && !about?.length && !conflict) return null;

  const freshness = quality?.freshness;
  const source = quality?.source;
  const verification = quality?.verification;
  const corroboration = quality?.corroboration;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
        {freshness?.label ? (
          <span className={cn('font-medium', FRESHNESS_STYLES[freshness.state] || 'text-ink-muted')}>
            {freshness.state === 'stale' || freshness.state === 'expired'
              ? freshness.state.charAt(0).toUpperCase() + freshness.state.slice(1)
              : `Updated ${freshness.label.replace(/^Updated /, '')}`}
          </span>
        ) : null}
        {source?.label ? (
          <>
            <span aria-hidden>·</span>
            <span className="font-semibold text-ink-soft">{source.label}</span>
          </>
        ) : null}
        {verification?.state &&
        verification.state !== 'unverified' &&
        verification.state !== 'official' ? (
          <>
            <span aria-hidden>·</span>
            <span>{verification.label}</span>
          </>
        ) : null}
        {corroboration?.count >= 2 ? (
          <>
            <span aria-hidden>·</span>
            <span>{corroboration.label}</span>
          </>
        ) : null}
        {quality?.confidence?.label ? (
          <>
            <span aria-hidden>·</span>
            <span title={(quality.confidence.reasons || []).join('; ')}>
              Confidence {quality.confidence.label}
            </span>
          </>
        ) : null}
      </div>

      {conflict?.hasConflict ? (
        <ConflictBreakdown conflict={conflict} compact={compact} />
      ) : null}

      {about?.length ? <AboutThisUpdate lines={about} /> : null}
    </div>
  );
}

export function ConflictBreakdown({ conflict, compact = false }) {
  if (!conflict?.hasConflict) return null;
  return (
    <div className="rounded-lg border border-status-caution/30 bg-status-caution/5 px-2.5 py-2 text-xs">
      <p className="font-semibold text-status-caution">{conflict.headline || 'Recent reports differ'}</p>
      {!compact && Array.isArray(conflict.breakdown) ? (
        <ul className="mt-1 space-y-0.5 text-ink-soft">
          {conflict.breakdown.map((item) => (
            <li key={item.value} className="capitalize">
              {item.label} — {item.count} report{item.count === 1 ? '' : 's'}
            </li>
          ))}
        </ul>
      ) : null}
      {conflict.windowMinutes ? (
        <p className="mt-1 text-[11px] text-ink-muted">
          Updated within the last {conflict.windowMinutes} min
        </p>
      ) : null}
    </div>
  );
}

export function AboutThisUpdate({ lines }) {
  const [open, setOpen] = useState(false);
  if (!lines?.length) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-semibold text-brand-700 hover:underline"
        aria-expanded={open}
      >
        {open ? 'Hide about this update' : 'About this update'}
      </button>
      {open ? (
        <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-ink-muted">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
