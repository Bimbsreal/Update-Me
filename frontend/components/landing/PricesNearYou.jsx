'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { pricesApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCommodityPrice, formatPriceAge } from '@/lib/prices';
import { getCurrentPosition, GEO_STATUS } from '@/lib/geolocation';

/**
 * Landing compact "Basic Prices Near You" — never labels cached data as live.
 */
export function PricesNearYou({ className }) {
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
      const data = await pricesApi.nearby(lat, lng, {
        commodity: 'rice',
        radiusKm: 12,
        limit: 5,
        freshness: 'fresh',
      });
      const first = (data.results || data.items || [])[0] || null;
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
        error: 'Commodity prices unavailable right now.',
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
  const priceLabel = formatCommodityPrice(item?.price?.amount, item?.price?.currency);
  const unitLabel =
    item?.variant?.displayName || item?.price?.displayName || item?.price?.unit?.symbol || '';
  const age = formatPriceAge(
    item?.report?.observedAt || item?.report?.occurredAt || item?.report?.createdAt
  );
  const place =
    item?.place?.name || item?.location?.area?.name || item?.location?.name || null;
  const source =
    item?.report?.sourceTypeLabel ||
    (item?.pricingContext === 'official_publication'
      ? 'Official'
      : item?.pricingContext === 'market'
        ? 'Market'
        : 'Community');

  return (
    <section
      className={cn(
        'rounded-card border border-surface-border bg-white/90 p-4 shadow-card sm:p-5',
        className
      )}
      aria-labelledby="prices-near-you-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Commodities
          </p>
          <h2 id="prices-near-you-heading" className="mt-1 text-lg font-bold text-ink">
            Basic Prices Near You
          </h2>
        </div>
        <Link
          href="/prices"
          className="rounded-pill border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800 hover:bg-brand-100"
        >
          View Prices
        </Link>
      </div>

      {state.status === 'loading' || state.status === 'idle' ? (
        <p className="mt-3 text-sm text-ink-muted">Checking nearby commodity prices…</p>
      ) : null}

      {state.needsLocation ? (
        <div className="mt-3">
          <p className="text-sm text-ink-muted">
            Location permission is off. Choose an area to see nearby staple prices.
          </p>
          <Link href="/prices" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline">
            Set your location
          </Link>
        </div>
      ) : null}

      {!state.needsLocation && state.status === 'ready' && !item ? (
        <p className="mt-3 text-sm text-ink-muted">
          {state.error || 'No recent staple price observations near you right now.'}
        </p>
      ) : null}

      {item ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm font-semibold text-ink">{item.commodity?.name || 'Rice'}</p>
          <p className="text-xl font-bold text-ink">
            {priceLabel || 'Price not reported'}
            {unitLabel ? (
              <span className="text-sm font-semibold text-ink-muted"> / {unitLabel}</span>
            ) : null}
          </p>
          {place ? <p className="text-sm text-ink-muted">Observed at {place}</p> : null}
          <p className="text-xs text-ink-muted">
            {age || 'Observation time unknown'} · {source}
          </p>
          {item.report?.freshness === 'stale' || item.report?.freshness === 'expired' ? (
            <p className="text-xs font-semibold text-amber-800">
              May be outdated — confirm if you are at the market
            </p>
          ) : null}
          {state.asOf ? (
            <p className="text-[11px] text-ink-soft">
              Snapshot as of {new Date(state.asOf).toLocaleTimeString()} — refresh on Prices for
              live data. Cached copies must not be treated as current prices.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
