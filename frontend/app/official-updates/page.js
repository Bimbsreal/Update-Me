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
];

export default function OfficialUpdatesPage() {
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { limit: 30 };
    if (category) params.category = category;
    officialApi
      .list(params)
      .then((data) => {
        if (!cancelled) {
          setItems(data.items || []);
          setError('');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setItems([]);
          setError(err?.message || 'Unable to load official updates.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

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

          <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Category filters">
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

          <div className="mt-8 space-y-4">
            {loading ? <p className="text-sm text-ink-muted">Loading…</p> : null}
            {error ? <p className="text-sm text-status-urgent">{error}</p> : null}
            {!loading && !error && items.length === 0 ? (
              <div className="rounded-card border border-dashed border-surface-border p-6 text-sm text-ink-muted">
                No official updates in this category yet.
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
