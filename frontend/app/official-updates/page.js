'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { OfficialUpdateCard } from '@/components/official/OfficialUpdateCard';
import { officialApi } from '@/lib/api';
import { cn } from '@/lib/cn';

const CATEGORY_FILTERS = [
  { id: '', label: 'All' },
  { id: 'road_traffic', label: 'Road & Traffic' },
  { id: 'fuel_petroleum', label: 'Fuel & Petroleum' },
  { id: 'public_safety', label: 'Public Safety' },
  { id: 'financial_economic', label: 'Financial' },
  { id: 'transport', label: 'Transport' },
  { id: 'public_services', label: 'Public Services' },
  { id: 'weather_emergency', label: 'Weather' },
  { id: 'health', label: 'Health' },
];

export default function OfficialUpdatesPage() {
  const [items, setItems] = useState([]);
  const [sources, setSources] = useState([]);
  const [category, setCategory] = useState('');
  const [source, setSource] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [includeExpired, setIncludeExpired] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [asOf, setAsOf] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    officialApi
      .sources()
      .then((data) => setSources(data.sources || []))
      .catch(() => setSources([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { limit: 30, includeExpired };
    if (category) params.category = category;
    if (source) params.source = source;
    if (query) params.q = query;
    officialApi
      .list(params)
      .then((data) => {
        if (!cancelled) {
          setItems(data.items || []);
          setAsOf(data.asOf || null);
          setError('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setItems([]);
          setAsOf(null);
          setError(err?.message || 'Unable to load official updates.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, source, query, includeExpired]);

  function submitSearch(e) {
    e.preventDefault();
    setQuery(q.trim());
  }

  return (
    <div className="section-y">
      <Container>
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-status-official">
            Verified sources
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Official Updates
          </h1>
          <p className="mt-3 text-ink-muted">
            Information published by approved government agencies and regulators. These notices are
            not community reports.
          </p>

          <form onSubmit={submitSearch} className="mt-6 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="official-search">
              Search official updates
            </label>
            <input
              id="official-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search agency, title, location…"
              className="min-h-11 flex-1 rounded-control border border-surface-border bg-white px-3 text-sm"
            />
            <button
              type="submit"
              className="min-h-11 rounded-control bg-status-official px-4 text-sm font-semibold text-white"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="min-h-11 rounded-control border border-surface-border px-4 text-sm font-semibold text-ink-muted sm:hidden"
              aria-expanded={showFilters}
            >
              Filters
            </button>
          </form>

          <div
            className={cn(
              'mt-4 space-y-4',
              showFilters ? 'block' : 'hidden sm:block'
            )}
          >
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Category filters">
              {CATEGORY_FILTERS.map((item) => (
                <button
                  key={item.id || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={category === item.id}
                  onClick={() => setCategory(item.id)}
                  className={cn(
                    'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                    category === item.id
                      ? 'bg-status-official text-white'
                      : 'bg-surface-muted text-ink-muted hover:text-ink'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex min-h-11 flex-1 items-center gap-2 text-sm text-ink-muted">
                <span className="shrink-0 font-semibold">Agency</span>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="min-h-11 w-full rounded-control border border-surface-border bg-white px-3 text-sm"
                >
                  <option value="">All agencies</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shortName || s.organizationName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={includeExpired}
                  onChange={(e) => setIncludeExpired(e.target.checked)}
                  className="size-4"
                />
                Include expired
              </label>
            </div>
          </div>

          {asOf ? (
            <p className="mt-4 text-[11px] text-ink-soft">
              Snapshot as of {new Date(asOf).toLocaleTimeString()}. Offline or cached copies must not
              appear newly published.
            </p>
          ) : null}

          <div className="mt-6 space-y-4">
            {loading ? <p className="text-sm text-ink-muted">Loading…</p> : null}
            {error ? <p className="text-sm text-status-urgent">{error}</p> : null}
            {!loading && !error && items.length === 0 ? (
              <div className="rounded-card border border-dashed border-surface-border p-6 text-sm text-ink-muted">
                No official updates match these filters.
              </div>
            ) : null}
            {items.map((item) => (
              <OfficialUpdateCard key={item.id} update={item} />
            ))}
          </div>

          <p className="mt-8 text-sm text-ink-soft">
            Looking for community reports instead?{' '}
            <Link href="/explore" className="font-semibold text-brand-700 hover:underline">
              Open Explore
            </Link>
          </p>
        </div>
      </Container>
    </div>
  );
}
