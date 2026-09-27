'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { trafficApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { getCurrentPosition, GEO_STATUS } from '@/lib/geolocation';

/**
 * Landing compact "Traffic Near You" — never labels cached data as live.
 */
export function TrafficNearYou({ className }) {
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
      const data = await trafficApi.events({ lat, lng, radiusKm: 12, limit: 5 });
      const first = (data.items || [])[0] || null;
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
        error: 'Traffic unavailable right now.',
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
  const severity = item?.severityBand?.label || 'Update';
  const href = item?.id ? `/traffic/events/${item.id}` : '/traffic';

  return (
    <section
      className={cn(
        'rounded-card border border-surface-border bg-white/90 p-4 shadow-card sm:p-5',
        className
      )}
      aria-labelledby="traffic-near-you-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Traffic
          </p>
          <h2 id="traffic-near-you-heading" className="mt-1 text-lg font-bold text-ink">
            Traffic Near You
          </h2>
        </div>
        <Link
          href={href}
          className="rounded-pill border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800 hover:bg-brand-100"
        >
          View Traffic
        </Link>
      </div>

      {state.status === 'loading' || state.status === 'idle' ? (
        <p className="mt-3 text-sm text-ink-muted">Checking nearby traffic…</p>
      ) : null}

      {state.needsLocation ? (
        <div className="mt-3">
          <p className="text-sm text-ink-muted">
            Location permission is off. Choose an area to see nearby traffic.
          </p>
          <Link
            href="/traffic"
            className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline"
          >
            Set your location
          </Link>
        </div>
      ) : null}

      {!state.needsLocation && state.status === 'ready' && !item ? (
        <p className="mt-3 text-sm text-ink-muted">
          {state.error || 'No active traffic events near you right now.'}
        </p>
      ) : null}

      {item ? (
        <div className="mt-3 space-y-1">
          <p className="text-base font-bold text-ink">
            <span aria-hidden="true">● </span>
            {severity}
            <span className="sr-only"> severity</span>
          </p>
          <p className="text-sm font-semibold text-ink">
            {item.roadName || item.locationName || item.title}
          </p>
          {item.directionLabel ? (
            <p className="text-sm text-ink-muted">{item.directionLabel}</p>
          ) : null}
          <p className="text-xs text-ink-muted">
            {item.observedLabel || 'Recently observed'}
            {item.sourceLabel ? ` · ${item.sourceLabel}` : ''}
          </p>
          {item.mayBeOutdated ? (
            <p className="text-xs font-semibold text-amber-800">May be outdated — verify if nearby</p>
          ) : null}
          {state.asOf ? (
            <p className="text-[11px] text-ink-soft">
              Snapshot as of {new Date(state.asOf).toLocaleTimeString()} — refresh on the traffic page
              for live data.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
