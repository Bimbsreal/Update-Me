'use client';

import { cn } from '@/lib/cn';
import {
  EXPLORE_CATEGORIES,
  EXPLORE_FRESHNESS,
  STATUS_BY_CATEGORY,
} from '@/lib/explore';

export function ExploreFilters({
  category,
  freshness,
  status,
  onCategory,
  onFreshness,
  onStatus,
  open,
  onClose,
  variant = 'inline',
}) {
  const statusOptions = STATUS_BY_CATEGORY[category] || null;

  const body = (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Category</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXPLORE_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onCategory(item.id)}
              className={cn(
                'min-h-10 rounded-pill px-3 py-1.5 text-xs font-semibold',
                category === item.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted hover:text-ink'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Freshness</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXPLORE_FRESHNESS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onFreshness(item.id)}
              className={cn(
                'min-h-10 rounded-pill px-3 py-1.5 text-xs font-semibold',
                freshness === item.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted hover:text-ink'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {statusOptions ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Status</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {statusOptions.map((item) => (
              <button
                key={item.id || 'all-status'}
                type="button"
                onClick={() => onStatus(item.id)}
                className={cn(
                  'min-h-10 rounded-pill px-3 py-1.5 text-xs font-semibold',
                  status === item.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface-muted text-ink-muted hover:text-ink'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (variant === 'sheet') {
    if (!open) return null;
    return (
      <div className="fixed inset-0 z-40 lg:hidden">
        <button
          type="button"
          className="absolute inset-0 bg-ink/40"
          aria-label="Close filters"
          onClick={onClose}
        />
        <div className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-8 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">Filters</h2>
            <button type="button" className="text-sm font-semibold text-ink-muted" onClick={onClose}>
              Done
            </button>
          </div>
          {body}
        </div>
      </div>
    );
  }

  return body;
}
