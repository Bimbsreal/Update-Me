'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/reports';
import { notificationHref, priorityClass } from '@/lib/notifications';

export function NotificationCard({ item, onOpen }) {
  if (!item) return null;
  const href = notificationHref(item);

  return (
    <article
      className={cn(
        'rounded-card border bg-white p-4 shadow-card sm:p-5',
        item.read ? 'border-surface-border' : 'border-brand-100 bg-brand-50/30'
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-pill border border-brand-100 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800">
          {item.categoryLabel || item.category}
        </span>
        {!item.read ? (
          <span className="inline-flex items-center rounded-pill bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Unread
          </span>
        ) : null}
        {item.expired ? (
          <span className="inline-flex items-center rounded-pill border border-surface-border bg-surface-muted px-2.5 py-1 text-[11px] font-bold text-ink-muted">
            Expired
          </span>
        ) : null}
        <span className={cn('text-[11px] font-semibold capitalize', priorityClass(item.priority))}>
          {item.priority}
        </span>
      </div>

      <h3 className="mt-3 text-base font-bold text-ink break-words">
        <Link
          href={href}
          className="hover:text-brand-700"
          onClick={() => onOpen?.(item)}
        >
          {item.title}
        </Link>
      </h3>

      {item.message ? (
        <p className="mt-2 text-sm text-ink-muted break-words line-clamp-3">{item.message}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
        {item.location?.name ? <span className="break-words">{item.location.name}</span> : null}
        <span>{formatRelativeTime(item.createdAt)}</span>
      </div>
    </article>
  );
}
