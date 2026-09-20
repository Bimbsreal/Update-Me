'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';

const GROUP_LABELS = {
  places: 'Place',
  fuel: 'Fuel Station',
  transport: 'Transport',
  prices: 'Prices',
  traffic: 'Traffic',
  alerts: 'Alert',
  official: 'Official Update',
  community: 'Community',
};

export function SearchResultCard({ item, compact = false, className }) {
  const typeLabel = GROUP_LABELS[item.group] || item.type || 'Result';
  const isOfficial = item.sourceType === 'official' || item.group === 'official';
  const isCommunity =
    item.sourceType === 'community' ||
    item.group === 'community' ||
    item.sourceLabel === 'Community Report';

  return (
    <Link
      href={item.href || '/explore'}
      className={cn(
        'block rounded-control border border-surface-border bg-white px-3 py-2.5 transition hover:border-brand-200 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
        compact && 'py-2',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">{typeLabel}</p>
        {isOfficial ? (
          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800">
            Official
          </span>
        ) : isCommunity ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
            Community
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 text-sm font-semibold text-ink break-words">{item.title}</p>
      {item.locationName || item.subtitle ? (
        <p className="mt-0.5 text-xs text-ink-muted break-words">
          {item.locationName || item.subtitle}
        </p>
      ) : null}
      {item.status ? <p className="mt-1 text-xs font-medium text-ink">{item.status}</p> : null}
      {item.freshnessLabel ? (
        <p className="mt-1 text-[11px] text-ink-muted">Updated {item.freshnessLabel}</p>
      ) : null}
    </Link>
  );
}

export function SearchGroupSection({ group, items }) {
  if (!items?.length) return null;
  const heading =
    {
      places: 'Places',
      fuel: 'Fuel',
      transport: 'Transport',
      prices: 'Prices',
      traffic: 'Traffic',
      alerts: 'Alerts',
      official: 'Official',
      community: 'Community',
    }[group] || group;

  return (
    <section className="space-y-2" aria-label={heading}>
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">{heading}</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={`${item.group}-${item.type}-${item.id}`}>
            <SearchResultCard item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
