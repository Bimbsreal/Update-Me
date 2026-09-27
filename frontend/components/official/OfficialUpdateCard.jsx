'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import {
  affectedLocationLabel,
  formatOfficialTime,
  freshnessParts,
  jurisdictionLabel,
  priorityLabel,
} from '@/lib/official';

export function OfficialBadge({ className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border border-status-official/30 bg-status-official/10 px-2.5 py-1 text-[11px] font-bold tracking-wide text-status-official',
        className
      )}
    >
      OFFICIAL
    </span>
  );
}

export function OfficialUpdateCard({ update, compact = false, className }) {
  if (!update) return null;

  const agency =
    update.source?.shortName ||
    update.source?.organizationName ||
    update.attribution ||
    'Official source';
  const published = formatOfficialTime(update.publishedAt || update.retrievedAt);
  const href = `/official-updates/${update.id}`;
  const sourceHref = update.source?.id ? `/official-sources/${update.source.id}` : null;
  const location = affectedLocationLabel(update);
  const importance = priorityLabel(update.priority, update.priorityLabel);
  const freshness = freshnessParts(update);
  const expired = Boolean(update.isExpired);

  return (
    <article
      className={cn(
        'rounded-card border bg-white shadow-card',
        expired ? 'border-amber-300/60 opacity-90' : 'border-status-official/20',
        compact ? 'p-4' : 'p-5 sm:p-6',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <OfficialBadge />
        {sourceHref ? (
          <Link
            href={sourceHref}
            className="text-xs font-semibold text-status-official break-words hover:underline"
          >
            {agency}
          </Link>
        ) : (
          <span className="text-xs font-semibold text-status-official break-words">{agency}</span>
        )}
        {importance && update.priority && update.priority !== 'normal' ? (
          <span
            className={cn(
              'rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              update.priority === 'critical'
                ? 'bg-red-100 text-red-900'
                : update.priority === 'urgent'
                  ? 'bg-orange-100 text-orange-900'
                  : 'bg-amber-100 text-amber-900'
            )}
            title={importance}
          >
            {importance}
          </span>
        ) : null}
        {expired ? (
          <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-muted">
            Expired
          </span>
        ) : null}
      </div>

      <h3 className={cn('mt-3 font-bold text-ink break-words', compact ? 'text-base' : 'text-lg')}>
        <Link href={href} className="hover:text-status-official">
          {update.title}
        </Link>
      </h3>

      {update.summary ? (
        <p
          className={cn(
            'mt-2 text-sm leading-relaxed text-ink-muted break-words',
            compact && 'line-clamp-2'
          )}
        >
          {update.summary}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
        {update.categoryLabel ? <span>{update.categoryLabel}</span> : null}
        {update.updateTypeLabel ? <span>{update.updateTypeLabel}</span> : null}
        {update.jurisdictionLevel ? (
          <span>{jurisdictionLabel(update.jurisdictionLevel)}</span>
        ) : null}
        {location ? <span className="break-words">Affects {location}</span> : null}
        {published ? <span>{freshness[0]?.label || 'Published'} {published}</span> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={href}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-status-official hover:underline"
        >
          Read update
        </Link>
        {update.originalUrl ? (
          <a
            href={update.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-muted hover:text-ink hover:underline"
          >
            View original source
          </a>
        ) : null}
      </div>
    </article>
  );
}
