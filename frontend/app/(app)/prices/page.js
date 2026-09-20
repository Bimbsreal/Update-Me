'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

export default function PricesPage() {
  const { user, setLocation } = useAuth();
  const [commodities, setCommodities] = useState([]);
  const [items, setItems] = useState([]);
  const [officialItems, setOfficialItems] = useState([]);
  const [commodity, setCommodity] = useState('');
  const [variant, setVariant] = useState('');
  const [freshness, setFreshness] = useState('fresh');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const area = user?.currentArea;
  const locationLabel = area
    ? `${area.name}${area.state ? `, ${area.state}` : ''}`
    : 'Choose your area';

  const selectedCommodity = useMemo(
    () => commodities.find((c) => c.code === commodity || c.slug === commodity),
    [commodities, commodity]
  );

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

      const [listData, officialData] = await Promise.all([
        pricesApi.list(params),
        officialApi.list({ category: 'financial_economic', limit: 3 }).catch(() => ({ items: [] })),
      ]);
      setItems(listData.items || []);
      setOfficialItems(officialData.items || []);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load prices.');
    } finally {
      setLoading(false);
    }
  }, [area?.locationId, commodity, variant, freshness, q]);

  useEffect(() => {
    pricesApi
      .commodities()
      .then((data) => setCommodities(data.commodities || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

      {error ? <FormError message={error} /> : null}
      {loading ? <p className="text-sm text-ink-muted">Loading prices…</p> : null}

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
          <CommodityPriceCard
            key={`${item.commodity?.id}-${item.variant?.id}`}
            item={item}
          />
        ))}
      </div>

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
