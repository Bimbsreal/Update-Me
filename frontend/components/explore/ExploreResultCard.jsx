'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { categoryLabel, MARKER_COLORS } from '@/lib/explore';
import { QualitySignals } from '@/components/quality/QualitySignals';

export function ExploreResultCard({ item, selected, onSelect, compact = false }) {
  if (!item) return null;
  const color = MARKER_COLORS[item.markerKind || item.category] || MARKER_COLORS.report;
  const stale = item.freshnessKey === 'stale' || item.freshnessKey === 'aging';
  const expired = item.freshnessKey === 'expired';

  return (
    <article
      className={cn(
        'rounded-card border bg-white p-3 shadow-card transition sm:p-4',
        selected ? 'border-brand-400 ring-2 ring-brand-500/20' : 'border-surface-border',
        item.sourceType === 'official' && 'border-status-official/30',
        stale && 'opacity-90',
        expired && 'opacity-70'
      )}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onSelect?.(item)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: color }}
          >
            {categoryLabel(item.category === 'local_alerts' ? 'local_alerts' : item.category)}
          </span>
          {item.sourceLabel ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              {item.sourceLabel}
            </span>
          ) : null}
          {stale || expired ? (
            <span className="text-[10px] font-bold uppercase text-status-expired">
              {item.freshnessKey}
            </span>
          ) : null}
        </div>

        <h3 className={cn('mt-2 font-bold text-ink break-words', compact ? 'text-sm' : 'text-base')}>
          {item.title}
        </h3>

        {item.statusLabel ? (
          <p className="mt-1 text-sm font-semibold capitalize text-ink">{item.statusLabel}</p>
        ) : null}

        {item.keyValue ? (
          <p className="mt-1 text-sm font-semibold text-brand-800">{item.keyValue}</p>
        ) : null}

        <p className="mt-1 text-xs text-ink-muted break-words">
          {item.locationName || 'Nearby'}
          {item.distanceKm != null ? ` · ${item.distanceKm} km` : ''}
        </p>

        <div className="mt-2">
          <QualitySignals
            quality={item.quality}
            about={item.about}
            compact
          />
        </div>

        {item.summary && !compact ? (
          <p className="mt-2 text-sm text-ink-muted break-words line-clamp-2">{item.summary}</p>
        ) : null}
      </button>

      {item.detailPath ? (
        <Link
          href={item.detailPath}
          className="mt-3 inline-flex text-sm font-semibold text-brand-700 hover:underline"
        >
          View details →
        </Link>
      ) : null}
    </article>
  );
}
