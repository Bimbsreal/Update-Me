'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { officialApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { affectedLocationLabel, formatOfficialTime } from '@/lib/official';
import { getCurrentPosition, GEO_STATUS } from '@/lib/geolocation';

/**
 * Landing compact "Official Near You" — never labels cached data as newly published.
 */
export function OfficialNearYou({ className }) {
  const [state, setState] = useState({
    status: 'idle',
    item: null,
    asOf: null,
    needsLocation: false,
    error: '',
  });

  const loadForCoords = useCallback(async (lat, lng) => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const data = await officialApi.nearby(lat, lng, { radiusKm: 40, limit: 5 });
      const first = (data.results || [])[0] || null;
      setState({
        status: 'ready',
        item: first,
        asOf: data.asOf || null,
        needsLocation: false,
        error: '',
      });
    } catch {
      setState({
        status: 'ready',
        item: null,
        asOf: null,
        needsLocation: false,
        error: 'Official updates unavailable right now.',
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setState((s) => ({ ...s, needsLocation: true, status: 'ready' }));
      return;
    }
    getCurrentPosition({ enableHighAccuracy: false }).then((result) => {
      if (result.status === GEO_STATUS.GRANTED && result.position) {
        loadForCoords(result.position.lat, result.position.lng);
        return;
      }
      setState({
        status: 'ready',
        item: null,
        asOf: null,
        needsLocation: true,
        error: '',
      });
    });
  }, [loadForCoords]);

  const item = state.item;
  const agency =
    item?.source?.shortName || item?.source?.organizationName || item?.attribution || 'Official';
  const location = affectedLocationLabel(item);
  const when = formatOfficialTime(item?.publishedAt || item?.retrievedAt);
  const href = item?.id ? `/official-updates/${item.id}` : '/official-updates';

  return (
    <section
      className={cn(
        'rounded-card border border-surface-border bg-white/90 p-4 shadow-card sm:p-5',
        className
      )}
      aria-labelledby="official-near-you-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-status-official">
            Official
          </p>
          <h2 id="official-near-you-heading" className="mt-1 text-lg font-bold text-ink">
            Official Near You
          </h2>
        </div>
        <Link
          href="/official-updates"
          className="rounded-pill border border-status-official/30 bg-status-official/10 px-3 py-1.5 text-sm font-semibold text-status-official hover:bg-status-official/15"
        >
          View updates
        </Link>
      </div>

      {state.status === 'loading' || state.status === 'idle' ? (
        <p className="mt-3 text-sm text-ink-muted">Checking nearby official notices…</p>
      ) : null}

      {state.needsLocation ? (
        <div className="mt-3">
          <p className="text-sm text-ink-muted">
            Location permission is off. Browse recent official updates by agency or category.
          </p>
          <Link
            href="/official-updates"
            className="mt-2 inline-block text-sm font-semibold text-status-official hover:underline"
          >
            Open Official Updates
          </Link>
        </div>
      ) : null}

      {!state.needsLocation && state.status === 'ready' && !item ? (
        <p className="mt-3 text-sm text-ink-muted">
          {state.error || 'No location-linked official updates near you right now.'}
        </p>
      ) : null}

      {item ? (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-status-official">{agency}</p>
          <p className="text-base font-bold text-ink break-words">{item.title}</p>
          <p className="text-xs text-ink-muted">
            {location ? `Affecting ${location}` : 'Location not specified'}
            {when ? ` · ${when}` : ''}
          </p>
          {item.isExpired ? (
            <p className="text-xs font-semibold text-amber-800">No longer current</p>
          ) : null}
          <Link href={href} className="mt-2 inline-block text-sm font-semibold text-status-official hover:underline">
            Read update
          </Link>
          {state.asOf ? (
            <p className="text-[11px] text-ink-soft">
              Snapshot as of {new Date(state.asOf).toLocaleTimeString()} — refresh on Official Updates
              for live data. Cached copies must not be treated as newly published.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
