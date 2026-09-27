'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';

function PinIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function HomeLocationBar({
  label,
  subtitle,
  modeTitle,
  onChangeArea,
  className,
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-card border border-brand-100 bg-brand-50/80 px-3 py-2.5 sm:px-4',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm">
          <PinIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          {modeTitle ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-800/80">
              {modeTitle}
            </p>
          ) : null}
          <p className="truncate text-sm font-bold text-brand-900">{label || 'Choose an area'}</p>
          {subtitle ? <p className="truncate text-xs text-brand-800/70">{subtitle}</p> : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onChangeArea}
        className="shrink-0 rounded-control border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-800 hover:border-brand-400"
        aria-label="Change location"
      >
        Change location
      </button>
    </div>
  );
}

export function HomeSavedSwitcher({
  areas = [],
  activeSavedAreaId,
  onSelectCurrent,
  onSelectArea,
  className,
}) {
  if (!areas.length) return null;

  return (
    <div className={cn('flex gap-2 overflow-x-auto pb-1', className)} role="tablist" aria-label="Saved places">
      <button
        type="button"
        role="tab"
        aria-selected={!activeSavedAreaId}
        onClick={onSelectCurrent}
        className={cn(
          'shrink-0 rounded-pill border px-3 py-1.5 text-xs font-semibold',
          !activeSavedAreaId
            ? 'border-brand-600 bg-brand-600 text-white'
            : 'border-surface-border bg-white text-ink-muted hover:border-brand-300'
        )}
      >
        Nearby
      </button>
      {areas.map((area) => (
        <button
          key={area.id}
          type="button"
          role="tab"
          aria-selected={activeSavedAreaId === area.id}
          onClick={() => onSelectArea(area)}
          className={cn(
            'shrink-0 rounded-pill border px-3 py-1.5 text-xs font-semibold',
            activeSavedAreaId === area.id
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-surface-border bg-white text-ink-muted hover:border-brand-300'
          )}
        >
          {area.displayName}
        </button>
      ))}
      <Link
        href="/explore"
        className="shrink-0 rounded-pill border border-dashed border-surface-border px-3 py-1.5 text-xs font-semibold text-brand-700 hover:border-brand-300"
      >
        Explore
      </Link>
    </div>
  );
}

export function HomeLiveNotice({ count, label, onRefresh }) {
  if (!count) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-brand-200 bg-white px-3 py-2 text-sm shadow-sm">
      <p className="font-semibold text-brand-800">
        {label || `${count} new update${count === 1 ? '' : 's'}`}
      </p>
      <button
        type="button"
        onClick={onRefresh}
        className="rounded-control bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
      >
        View updates
      </button>
    </div>
  );
}

export function HomeSection({
  title,
  href,
  actionLabel = 'View',
  emptyMessage,
  children,
  emphasize = false,
}) {
  const hasChildren = Boolean(children);
  return (
    <section
      className={cn(
        'rounded-card border bg-white p-4 shadow-card sm:p-5',
        emphasize ? 'border-status-attention/30' : 'border-surface-border'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-bold text-ink sm:text-lg">{title}</h2>
        {href ? (
          <Link href={href} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">
            {actionLabel} →
          </Link>
        ) : null}
      </div>
      {hasChildren ? (
        <div className="mt-3 space-y-2.5">{children}</div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">{emptyMessage}</p>
      )}
    </section>
  );
}

export function HomeMetaLine({ children }) {
  return <p className="mt-1 text-[11px] leading-snug text-ink-muted">{children}</p>;
}

export function formatHomeAge(value) {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatNaira(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return null;
  return `₦${Number(amount).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}
