'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { LocationSelector } from '@/components/location/LocationSelector';
import { TrafficCard } from '@/components/traffic/TrafficCard';
import { TrafficComposer } from '@/components/traffic/TrafficComposer';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, trafficApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { severityClass, TRAFFIC_SEVERITIES } from '@/lib/traffic';

const SUMMARY_KEYS = ['clear', 'moderate', 'heavy', 'standstill'];

export default function TrafficPage() {
  const { user, setLocation } = useAuth();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('');

  const area = user?.currentArea;
  const locationLabel = area
    ? `${area.name}${area.state ? `, ${area.state}` : ''}`
    : 'Choose your area';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { freshness: 'any', limit: 30 };
      const summaryParams = {};
      if (area?.locationId) {
        params.locationId = area.locationId;
        summaryParams.locationId = area.locationId;
      }
      if (severityFilter) params.severity = severityFilter;

      const [listData, summaryData] = await Promise.all([
        trafficApi.list(params),
        trafficApi.summary(summaryParams),
      ]);
      setItems(listData.items || []);
      setSummary(summaryData.summary || null);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load traffic.');
    } finally {
      setLoading(false);
    }
  }, [area?.locationId, severityFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConfirm(traffic) {
    setActionError('');
    try {
      await trafficApi.confirm(traffic.id, { type: 'still_accurate' });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Confirmation failed.');
    }
  }

  async function handleCorrect(traffic) {
    setActionError('');
    try {
      await trafficApi.correct(traffic.id, {
        type: 'no_longer_accurate',
        note: 'Marked no longer accurate from traffic feed',
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Update failed.');
    }
  }

  const hasSummaryData = summary && summary.total > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Traffic
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Traffic around you
          </h1>
          <button
            type="button"
            onClick={() => setSelectorOpen(true)}
            className="mt-3 inline-flex max-w-full items-center gap-2 rounded-pill border border-brand-100 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-800"
          >
            <span className="truncate">{locationLabel}</span>
            <span className="text-[10px] uppercase tracking-wide text-brand-600">Change</span>
          </button>
        </div>
        <Button onClick={() => setComposerOpen((v) => !v)}>
          {composerOpen ? 'Hide form' : 'Report Traffic'}
        </Button>
      </div>

      {composerOpen ? (
        <TrafficComposer
          onSubmitted={() => {
            setComposerOpen(false);
            load();
          }}
        />
      ) : null}

      <section className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-sm font-bold text-ink">Area overview</h2>
        {hasSummaryData ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SUMMARY_KEYS.map((key) => {
              const count = summary.bySeverity?.[key] || 0;
              const label = TRAFFIC_SEVERITIES.find((s) => s.value === key)?.label || key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSeverityFilter((prev) => (prev === key ? '' : key))}
                  className={cn(
                    'rounded-control border px-3 py-3 text-left',
                    severityFilter === key ? 'border-brand-500 bg-brand-50' : 'border-surface-border',
                    severityClass(key)
                  )}
                >
                  <span className="block text-xs font-semibold uppercase tracking-wide opacity-80">
                    {label}
                  </span>
                  <span className="mt-1 block text-xl font-bold">{count}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            No recent traffic reports for this area.
          </p>
        )}
      </section>

      <FormError message={actionError || error} />

      {loading ? <p className="text-sm text-ink-muted">Loading traffic updates…</p> : null}

      {!loading && items.length === 0 ? (
        <div className="rounded-card border border-dashed border-surface-border bg-surface-muted/50 p-6 text-center">
          <h2 className="text-lg font-bold text-ink">No recent traffic updates</h2>
          <p className="mt-2 text-sm text-ink-muted">
            There are no recent traffic reports around this location.
          </p>
          <Button className="mt-4" onClick={() => setComposerOpen(true)}>
            Report Traffic
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3">
        {items.map((traffic) => (
          <TrafficCard
            key={traffic.id}
            traffic={traffic}
            showActions
            onConfirm={handleConfirm}
            onCorrect={handleCorrect}
          />
        ))}
      </div>

      <p className="text-xs text-ink-muted">
        Looking for the full report composer?{' '}
        <Link href="/app/report" className="font-semibold text-brand-700 hover:underline">
          Open Report
        </Link>
      </p>

      <LocationSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={async (selection) => {
          await setLocation(selection);
        }}
      />
    </div>
  );
}
