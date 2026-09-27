'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { LocationSelector } from '@/components/location/LocationSelector';
import { CommodityPriceCard } from '@/components/prices/CommodityPriceCard';
import { PricesComposer } from '@/components/prices/PricesComposer';
import { OfficialUpdateCard } from '@/components/official/OfficialUpdateCard';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, officialApi, pricesApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCommodityPrice, formatPriceAge, formatNormalizedHint, formatPriceRange } from '@/lib/prices';
import { getCurrentPosition, GEO_STATUS } from '@/lib/geolocation';

const ExploreMap = dynamic(
  () => import('@/components/explore/ExploreMap').then((m) => m.ExploreMap),
  { ssr: false, loading: () => <p className="p-4 text-sm text-ink-muted">Loading map…</p> }
);

export default function PricesPage() {
  const { user, setLocation } = useAuth();
  const [commodities, setCommodities] = useState([]);
  const [items, setItems] = useState([]);
  const [nearbyItems, setNearbyItems] = useState([]);
  const [compareRows, setCompareRows] = useState([]);
  const [compareMeta, setCompareMeta] = useState(null);
  const [officialItems, setOfficialItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [asOf, setAsOf] = useState(null);
  const [commodity, setCommodity] = useState('');
  const [variant, setVariant] = useState('');
  const [freshness, setFreshness] = useState('fresh');
  const [q, setQ] = useState('');
  const [view, setView] = useState('list');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [deviceCoords, setDeviceCoords] = useState(null);
  const [geoBusy, setGeoBusy] = useState(false);

  const area = user?.currentArea;
  const locationLabel = area
    ? `${area.name}${area.state ? `, ${area.state}` : ''}`
    : 'Choose your area';

  const selectedCommodity = useMemo(
    () => commodities.find((c) => c.code === commodity || c.slug === commodity),
    [commodities, commodity]
  );

  const mapCenter = useMemo(() => {
    const withCoords = nearbyItems.find((r) => r.coordinates?.lat != null);
    if (withCoords?.coordinates) return withCoords.coordinates;
    if (deviceCoords) return deviceCoords;
    return { lat: 6.5244, lng: 3.3792 };
  }, [nearbyItems, deviceCoords]);

  const geojson = useMemo(() => {
    const features = nearbyItems
      .map((r) => {
        const lat = r.coordinates?.lat;
        const lng = r.coordinates?.lng;
        if (lat == null || lng == null) return null;
        return {
          type: 'Feature',
          id: r.id,
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {
            id: r.id,
            title: `${r.commodity?.name || 'Price'} · ${formatCommodityPrice(r.price?.amount) || '—'}`,
            brand: r.place?.name || r.location?.name,
            price: r.price?.amount ?? null,
            freshness: r.report?.freshness || null,
            sourceType: r.report?.sourceType || 'community',
          },
        };
      })
      .filter(Boolean);
    return { type: 'FeatureCollection', features };
  }, [nearbyItems]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        freshness,
        group: 'variant',
        limit: 30,
      };
      if (commodity) params.commodity = commodity;
      if (variant) params.variant = variant;
      if (q.trim()) params.q = q.trim();
      if (area?.locationId) params.locationId = area.locationId;

      const summaryParams = { hours: 24 };
      if (area?.locationId) summaryParams.locationId = area.locationId;
      if (commodity) summaryParams.commodity = commodity;

      const comparePromise =
        commodity && variant && (area?.locationId || deviceCoords)
          ? pricesApi
              .compare({
                commodity,
                variant,
                ...(deviceCoords
                  ? { lat: deviceCoords.lat, lng: deviceCoords.lng }
                  : { locationId: area.locationId }),
                pricingContext: 'retail',
                limit: 12,
              })
              .catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] });

      const nearbyPromise =
        deviceCoords?.lat != null
          ? pricesApi
              .nearby(deviceCoords.lat, deviceCoords.lng, {
                commodity: commodity || undefined,
                freshness: freshness === 'historical' ? 'any' : freshness,
                radiusKm: 12,
                limit: 40,
              })
              .catch(() => ({ results: [] }))
          : Promise.resolve({ results: [] });

      const [listData, officialData, compareData, summaryData, nearbyData] = await Promise.all([
        pricesApi.list(params),
        officialApi.list({ category: 'financial_economic', limit: 3 }).catch(() => ({ items: [] })),
        comparePromise,
        pricesApi.summary(summaryParams).catch(() => ({ summary: null })),
        nearbyPromise,
      ]);
      setItems(listData.items || []);
      setNearbyItems(nearbyData.results || []);
      setCompareRows(compareData.items || []);
      setCompareMeta(
        compareData.commodity
          ? {
              commodity: compareData.commodity,
              variant: compareData.variant,
              note: compareData.note,
            }
          : null
      );
      setSummary(summaryData.summary || null);
      setAsOf(summaryData.summary?.asOf || nearbyData.asOf || compareData.asOf || null);
      setOfficialItems(officialData.items || []);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load prices.');
    } finally {
      setLoading(false);
    }
  }, [area?.locationId, commodity, variant, freshness, q, deviceCoords?.lat, deviceCoords?.lng]);

  useEffect(() => {
    pricesApi
      .commodities()
      .then((data) => setCommodities(data.commodities || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function useMyLocation() {
    setGeoBusy(true);
    try {
      const result = await getCurrentPosition({ enableHighAccuracy: false });
      if (result.status === GEO_STATUS.GRANTED && result.position) {
        setDeviceCoords({ lat: result.position.lat, lng: result.position.lng });
      }
    } finally {
      setGeoBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Commodity prices around you
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Everyday prices
          </h1>
          <button
            type="button"
            onClick={() => setSelectorOpen(true)}
            className="mt-3 inline-flex max-w-full items-center gap-2 rounded-pill border border-brand-100 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800"
          >
            <span className="truncate">{locationLabel}</span>
            <span aria-hidden>▾</span>
          </button>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={useMyLocation} disabled={geoBusy}>
              {geoBusy ? 'Locating…' : 'Prices near me'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Community market observations — not official government prices. Snapshot
            {asOf ? ` as of ${new Date(asOf).toLocaleTimeString()}` : ''}. Your precise
            coordinates are never shown to other users.
          </p>
        </div>
        <Button onClick={() => setComposerOpen((v) => !v)} className="w-full sm:w-auto">
          {composerOpen ? 'Close form' : 'Report a price'}
        </Button>
      </div>

      {composerOpen ? (
        <PricesComposer
          onSubmitted={() => {
            setComposerOpen(false);
            load();
          }}
        />
      ) : null}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Prices view">
        {[
          { id: 'list', label: 'List' },
          { id: 'map', label: 'Map' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => setView(tab.id)}
            className={cn(
              'min-h-11 rounded-pill px-4 py-1.5 text-sm font-semibold',
              view === tab.id ? 'bg-ink text-white' : 'bg-surface-muted text-ink-muted'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search commodities…"
          className="h-11 w-full rounded-control border border-surface-border px-3.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setCommodity('');
              setVariant('');
            }}
            className={cn(
              'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
              !commodity ? 'bg-ink text-white' : 'bg-surface-muted text-ink-muted'
            )}
          >
            All
          </button>
          {commodities.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setCommodity(item.code);
                setVariant('');
              }}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                commodity === item.code
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted'
              )}
            >
              {item.name}
            </button>
          ))}
        </div>

        {selectedCommodity?.variants?.length ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setVariant('')}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                !variant ? 'bg-ink text-white' : 'bg-surface-muted text-ink-muted'
              )}
            >
              Any unit
            </button>
            {selectedCommodity.variants.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setVariant(item.code)}
                className={cn(
                  'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                  variant === item.code
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface-muted text-ink-muted'
                )}
              >
                {item.displayName}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {[
            ['fresh', 'Recent'],
            ['any', 'All statuses'],
            ['historical', 'Historical'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFreshness(value)}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                freshness === value
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {summary?.observedRange ? (
        <div className="rounded-card border border-surface-border bg-white px-4 py-3 text-sm shadow-card">
          <p className="font-semibold text-ink">
            Observed range:{' '}
            <span className="tabular-nums">
              {formatPriceRange({
                min: summary.observedRange.min,
                max: summary.observedRange.max,
                currency: summary.observedRange.currency || 'NGN',
                isRange: summary.observedRange.min !== summary.observedRange.max,
              })}
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-muted">{summary.observedRange.note}</p>
        </div>
      ) : null}

      {view === 'map' ? (
        <section
          className="overflow-hidden rounded-card border border-surface-border bg-white shadow-card"
          aria-label="Commodity prices map"
        >
          <div className="h-[min(70vh,520px)] min-h-[280px]">
            <ExploreMap center={mapCenter} geojson={geojson} className="h-full w-full" />
          </div>
          <p className="border-t border-surface-border px-3 py-2 text-xs text-ink-muted">
            Latest observations only — not every historical price. Use the list for full
            detail and accessibility.
          </p>
        </section>
      ) : null}

      {compareRows.length ? (
        <section aria-labelledby="price-compare-heading" className="space-y-3">
          <div>
            <h2 id="price-compare-heading" className="text-lg font-bold text-ink">
              Nearby comparison
              {compareMeta?.commodity?.name ? ` · ${compareMeta.commodity.name}` : ''}
              {compareMeta?.variant?.displayName ? ` · ${compareMeta.variant.displayName}` : ''}
            </h2>
            <p className="text-xs text-ink-muted">
              {compareMeta?.note ||
                'Fresh/aging retail observations only · freshness before distance — not cheapest alone.'}
            </p>
          </div>
          <div className="hidden overflow-x-auto rounded-card border border-surface-border bg-white shadow-card md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-surface-border bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Place
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Price
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Reported
                  </th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.id} className="border-b border-surface-border/70 last:border-0">
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-ink">{row.placeName}</span>
                      {row.locationName ? (
                        <span className="mt-0.5 block text-xs text-ink-muted">{row.locationName}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 font-semibold tabular-nums">
                      {formatCommodityPrice(row.amount, row.currency)}
                      {formatNormalizedHint(row.normalized) ? (
                        <span className="mt-0.5 block text-xs font-normal text-ink-muted">
                          {formatNormalizedHint(row.normalized)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">
                      {formatPriceAge(row.observedAt) || '—'}
                      <span className="mt-0.5 block text-xs">{row.pricingContextLabel}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden" aria-label="Nearby price comparison">
            {compareRows.map((row) => (
              <li
                key={`m-${row.id}`}
                className="rounded-card border border-surface-border bg-white p-3 shadow-card"
              >
                <p className="font-semibold text-ink">{row.placeName}</p>
                <p className="mt-1 text-sm font-bold tabular-nums">
                  {formatCommodityPrice(row.amount, row.currency)}
                </p>
                <p className="text-xs text-ink-muted">
                  {formatPriceAge(row.observedAt)} · {row.pricingContextLabel}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <FormError message={error} /> : null}
      {loading ? <p className="text-sm text-ink-muted">Loading prices…</p> : null}

      {view === 'list' ? (
        <>
          {!loading && items.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-border p-5 text-sm text-ink-muted">
              No recent price reports around you.{' '}
              <button
                type="button"
                className="font-semibold text-brand-700 hover:underline"
                onClick={() => setComposerOpen(true)}
              >
                Report a price
              </button>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <CommodityPriceCard key={`${item.commodity?.id}-${item.variant?.id}`} item={item} />
            ))}
          </div>
        </>
      ) : null}

      {officialItems.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-ink">Official economic updates</h2>
            <Link
              href="/official-updates"
              className="text-sm font-semibold text-status-official hover:underline"
            >
              View all
            </Link>
          </div>
          <p className="text-xs text-ink-soft">
            Official notices from verified sources — not community market prices.
          </p>
          {officialItems.map((item) => (
            <OfficialUpdateCard key={item.id} update={item} compact />
          ))}
        </section>
      ) : null}

      <LocationSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={async (selection) => {
          await setLocation(selection);
          setSelectorOpen(false);
        }}
      />
    </div>
  );
}
