'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fuelApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatFuelAge, formatFuelPrice } from '@/lib/fuel';
import { getCurrentPosition, GEO_STATUS } from '@/lib/geolocation';

/**
 * Landing compact "Fuel Prices Near You" — never labels cached data as live.
 */
export function FuelNearYou({ className }) {
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
      const data = await fuelApi.nearby(lat, lng, {
        fuelType: 'pms',
        radiusKm: 8,
        limit: 5,
        freshness: 'fresh',
      });
      const first = (data.results || data.items || [])[0] || null;
      const latest = first?.latestReports?.find((r) => r.fuelType === 'pms') || first?.latestReports?.[0];
      setState({
        status: 'ready',
        item: first
          ? {
              station: first,
              report: latest || null,
            }
          : null,
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
        error: 'Fuel prices unavailable right now.',
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

  const station = state.item?.station;
  const report = state.item?.report;
  const priceLabel = formatFuelPrice(report?.price);
  const age = formatFuelAge(report?.report?.occurredAt || report?.occurredAt || report?.createdAt);
  const source =
    report?.report?.sourceType === 'official'
      ? 'Official'
      : report?.report?.sourceType === 'admin'
        ? 'Admin-verified'
        : 'Community';

  return (
    <section
      className={cn(
        'rounded-card border border-surface-border bg-white/90 p-4 shadow-card sm:p-5',
        className
      )}
      aria-labelledby="fuel-near-you-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Fuel</p>
          <h2 id="fuel-near-you-heading" className="mt-1 text-lg font-bold text-ink">
            Fuel Prices Near You
          </h2>
        </div>
        <Link
          href="/fuel"
          className="rounded-pill border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800 hover:bg-brand-100"
        >
          View Fuel Prices
        </Link>
      </div>

      {state.status === 'loading' || state.status === 'idle' ? (
        <p className="mt-3 text-sm text-ink-muted">Checking nearby pump prices…</p>
      ) : null}

      {state.needsLocation ? (
        <div className="mt-3">
          <p className="text-sm text-ink-muted">
            Location permission is off. Choose an area to see nearby fuel prices.
          </p>
          <Link href="/fuel" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline">
            Set your location
          </Link>
        </div>
      ) : null}

      {!state.needsLocation && state.status === 'ready' && !station ? (
        <p className="mt-3 text-sm text-ink-muted">
          {state.error || 'No recent fuel observations near you right now.'}
        </p>
      ) : null}

      {station ? (
        <div className="mt-3 space-y-1">
          <p className="text-xl font-bold text-ink">{priceLabel || 'Price not reported'}</p>
          <p className="text-sm font-semibold text-ink">
            {station.name}
            {station.brand ? ` · ${station.brand}` : ''}
          </p>
          <p className="text-xs text-ink-muted">
            {age ? `Updated ${age}` : 'Observation time unknown'} · {source}
          </p>
          {report?.report?.freshness === 'stale' || report?.report?.freshness === 'expired' ? (
            <p className="text-xs font-semibold text-amber-800">
              May be outdated — confirm if you are at the station
            </p>
          ) : null}
          {state.asOf ? (
            <p className="text-[11px] text-ink-soft">
              Snapshot as of {new Date(state.asOf).toLocaleTimeString()} — refresh on Fuel for live
              data. Cached copies must not be treated as current prices.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
