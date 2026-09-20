'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { LocationSelector } from '@/components/location/LocationSelector';
import { TransportComposer } from '@/components/transport/TransportComposer';
import { TransportRouteCard } from '@/components/transport/TransportRouteCard';
import { OfficialUpdateCard } from '@/components/official/OfficialUpdateCard';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { ApiError, officialApi, transportApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { TRANSPORT_MODES } from '@/lib/transport';

export default function TransportPage() {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [selectorFor, setSelectorFor] = useState(null);
  const [mode, setMode] = useState('');
  const [results, setResults] = useState([]);
  const [nearbyRoutes, setNearbyRoutes] = useState([]);
  const [officialItems, setOfficialItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  const loadOfficial = useCallback(async () => {
    try {
      const data = await officialApi.list({ category: 'transport', limit: 3 });
      setOfficialItems(data.items || []);
    } catch {
      setOfficialItems([]);
    }
  }, []);

  const loadNearby = useCallback(async (locationId) => {
    if (!locationId) return;
    try {
      const data = await transportApi.routes({
        locationId,
        freshness: 'any',
        limit: 8,
        ...(mode ? { mode } : {}),
      });
      setNearbyRoutes(data.items || []);
    } catch {
      setNearbyRoutes([]);
    }
  }, [mode]);

  async function findTransport() {
    if (!from?.locationId || !to?.locationId) {
      setError('Select both From and To locations.');
      return;
    }
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const [searchData] = await Promise.all([
        transportApi.search({
          originLocationId: from.locationId,
          destinationLocationId: to.locationId,
          freshness: 'any',
          ...(mode ? { mode } : {}),
          limit: 20,
        }),
        loadOfficial(),
      ]);
      setResults(searchData.results || []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to search transport.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Transport & fares
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Where are you going?
          </h1>
        </div>
        <Button onClick={() => setComposerOpen((v) => !v)} className="w-full sm:w-auto">
          {composerOpen ? 'Close form' : 'Report a fare'}
        </Button>
      </div>

      {composerOpen ? (
        <TransportComposer
          onSubmitted={() => {
            setComposerOpen(false);
            if (from?.locationId && to?.locationId) findTransport();
            else if (from?.locationId) loadNearby(from.locationId);
          }}
        />
      ) : null}

      <div className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setSelectorFor('from')}
            className="flex min-h-12 flex-col items-start justify-center rounded-control border border-surface-border px-3.5 py-2 text-left hover:border-brand-300"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">From</span>
            <span className="mt-0.5 w-full truncate text-sm font-semibold text-ink">
              {from?.label || 'Select origin'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSelectorFor('to')}
            className="flex min-h-12 flex-col items-start justify-center rounded-control border border-surface-border px-3.5 py-2 text-left hover:border-brand-300"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">To</span>
            <span className="mt-0.5 w-full truncate text-sm font-semibold text-ink">
              {to?.label || 'Select destination'}
            </span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Transport mode">
          <button
            type="button"
            onClick={() => setMode('')}
            className={cn(
              'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
              !mode ? 'bg-ink text-white' : 'bg-surface-muted text-ink-muted'
            )}
          >
            Any mode
          </button>
          {TRANSPORT_MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={mode === item.value}
              onClick={() => setMode(item.value)}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                mode === item.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted hover:text-ink'
              )}
            >
              {item.shortLabel}
            </button>
          ))}
        </div>

        <Button className="mt-4 w-full sm:w-auto" onClick={findTransport} disabled={loading}>
          {loading ? 'Searching…' : 'Find transport'}
        </Button>
      </div>

      {error ? <FormError message={error} /> : null}

      {searched ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink">Transport options</h2>
          {!loading && results.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-border p-5 text-sm text-ink-muted">
              No stored routes match that From / To yet.{' '}
              <button
                type="button"
                className="font-semibold text-brand-700 hover:underline"
                onClick={() => setComposerOpen(true)}
              >
                Report a fare
              </button>
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {results.map((route) => (
              <TransportRouteCard key={route.id} route={route} preferredMode={mode || null} />
            ))}
          </div>
        </section>
      ) : null}

      {!searched && nearbyRoutes.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink">Routes near your selection</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {nearbyRoutes.map((route) => (
              <TransportRouteCard key={route.id} route={route} preferredMode={mode || null} />
            ))}
          </div>
        </section>
      ) : null}

      {officialItems.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-ink">Official transport updates</h2>
            <Link
              href="/official-updates"
              className="text-sm font-semibold text-status-official hover:underline"
            >
              View all
            </Link>
          </div>
          <p className="text-xs text-ink-soft">
            Official notices from verified sources — not community-reported fares.
          </p>
          {officialItems.map((item) => (
            <OfficialUpdateCard key={item.id} update={item} compact />
          ))}
        </section>
      ) : null}

      <LocationSelector
        open={Boolean(selectorFor)}
        onClose={() => setSelectorFor(null)}
        onSelect={(selection) => {
          const payload = {
            locationId: selection.locationId,
            label: selection.label || 'Selected area',
          };
          if (selectorFor === 'from') {
            setFrom(payload);
            loadNearby(selection.locationId);
            loadOfficial();
          }
          if (selectorFor === 'to') setTo(payload);
          setSelectorFor(null);
        }}
      />
    </div>
  );
}
