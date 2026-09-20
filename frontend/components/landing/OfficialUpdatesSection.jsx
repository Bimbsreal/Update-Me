'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { OfficialUpdateCard } from '@/components/official/OfficialUpdateCard';
import { officialApi } from '@/lib/api';

export function OfficialUpdatesSection() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    officialApi
      .list({ limit: 3 })
      .then((data) => {
        if (!cancelled) setItems(data.items || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="official-updates" className="section-y border-y border-surface-border bg-white">
      <Container>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-status-official">
              Official information
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Official Updates
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Practical notices from verified government sources — clearly separate from community
              reports.
            </p>
          </div>
          <Button as={Link} href="/official-updates" variant="secondary" size="sm" className="w-full sm:w-auto">
            View all official updates
          </Button>
        </div>

        <div className="mt-8">
          {loading ? (
            <p className="text-sm text-ink-muted">Loading official updates…</p>
          ) : null}

          {!loading && items.length === 0 ? (
            <div className="rounded-card border border-dashed border-surface-border px-4 py-8 text-center text-sm text-ink-muted">
              No official updates available yet.
            </div>
          ) : null}

          {!loading && items.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.slice(0, 3).map((item) => (
                <OfficialUpdateCard key={item.id} update={item} compact />
              ))}
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
