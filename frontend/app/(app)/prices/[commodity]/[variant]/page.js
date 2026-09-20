'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { FxLineChart } from '@/components/fx/FxLineChart';
import { PricesComposer } from '@/components/prices/PricesComposer';
import { PriceReportCard } from '@/components/prices/CommodityPriceCard';
import { OfficialUpdateCard } from '@/components/official/OfficialUpdateCard';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, pricesApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { PRICE_HISTORY_PERIODS, formatPriceAge, formatPriceRange } from '@/lib/prices';

export default function PriceDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const commodity = params?.commodity;
  const variant = params?.variant;
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('30d');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(searchParams?.get('report') === '1');

  async function load(nextPeriod = period) {
    setLoading(true);
    try {
      const result = await pricesApi.detail(commodity, variant, {
        period: nextPeriod,
        locationId: user?.currentArea?.locationId,
        freshness: 'any',
      });
      setData(result);
      setError('');
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError ? err.message : 'Unable to load price detail.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (commodity && variant) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commodity, variant, user?.currentArea?.locationId]);

  async function handleConfirm(id) {
    setActionError('');
    try {
      await pricesApi.confirm(id, { type: 'still_accurate' });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Confirmation failed.');
    }
  }

  async function handleCorrect(id) {
    setActionError('');
    try {
      await pricesApi.correct(id, {
        type: 'no_longer_accurate',
        note: 'Marked no longer accurate from price page',
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Correction failed.');
    }
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading prices…</p>;
  if (error || !data?.commodity) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-status-urgent">{error || 'Not found.'}</p>
        <Button as={Link} href="/prices" variant="secondary">
          Back to Prices
        </Button>
      </div>
    );
  }

  const {
    commodity: commodityData,
    variant: variantData,
    summary,
    recentReports = [],
    history,
    officialUpdates = [],
  } = data;

  return (
    <div className="space-y-6">
      <Button as={Link} href="/prices" variant="secondary" size="sm">
        ← Prices around you
      </Button>

      <div className="rounded-card border border-surface-border bg-white p-5 shadow-card sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
          Commodity price
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink break-words sm:text-3xl">
          {commodityData.name}
        </h1>
        <p className="mt-1 text-sm font-semibold text-ink-muted">{variantData.displayName}</p>

        <p className="mt-4 text-2xl font-bold tabular-nums text-ink">
          {formatPriceRange(summary?.priceRange) || 'No recent range'}
        </p>
        {summary?.mostRecentAt ? (
          <p className="mt-2 text-xs text-ink-soft">
            Most recent observation {formatPriceAge(summary.mostRecentAt)}
            {summary.reportCount ? ` · ${summary.reportCount} reports` : ''}
          </p>
        ) : null}
        {summary?.location?.name ? (
          <p className="mt-2 text-sm text-ink-muted break-words">{summary.location.name}</p>
        ) : null}

        <Button className="mt-4" onClick={() => setComposerOpen((v) => !v)}>
          {composerOpen ? 'Close form' : 'Report a price'}
        </Button>
      </div>

      {composerOpen ? (
        <PricesComposer
          presetCommodity={commodityData}
          presetVariant={variantData}
          onSubmitted={() => {
            setComposerOpen(false);
            load();
          }}
        />
      ) : null}

      {actionError ? <FormError message={actionError} /> : null}

      <section className="space-y-3 rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">Price history</h2>
          <div className="flex flex-wrap gap-1.5">
            {PRICE_HISTORY_PERIODS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPeriod(item.id);
                  load(item.id);
                }}
                className={cn(
                  'min-h-9 rounded-pill px-3 py-1 text-xs font-semibold',
                  period === item.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface-muted text-ink-muted'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {history?.chartAvailable ? (
          <FxLineChart points={history.points || []} />
        ) : (
          <div className="rounded-control border border-dashed border-surface-border bg-surface-muted/80 px-4 py-8 text-center text-sm text-ink-muted">
            {history?.message || 'Not enough historical data yet.'}
          </div>
        )}
        <p className="text-xs text-ink-soft">
          Daily averages from community observations only — not an official index.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Recent community reports</h2>
        {!recentReports.length ? (
          <p className="text-sm text-ink-muted">No reports yet for this unit.</p>
        ) : (
          recentReports.map((report) => (
            <PriceReportCard
              key={report.id}
              report={report}
              onConfirm={handleConfirm}
              onCorrect={handleCorrect}
            />
          ))
        )}
      </section>

      {officialUpdates.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink">Related official updates</h2>
          <p className="text-xs text-ink-soft">
            Official economic notices — never shown as community market prices.
          </p>
          {officialUpdates.map((item) => (
            <OfficialUpdateCard key={item.id} update={item} compact />
          ))}
        </section>
      ) : null}
    </div>
  );
}
