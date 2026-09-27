'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { locationsApi } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Compact landing search — opens location experience; not a giant map.
 */
export function PlaceSearchCompact({ className }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setNote('');
      return undefined;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await locationsApi.resolve(trimmed);
        setResults(data.candidates || []);
        setNote(
          data.ambiguous
            ? 'Multiple matches — pick one. We will not guess.'
            : data.unresolved
              ? 'No match yet. Try another name or choose manually in Locations.'
              : ''
        );
      } catch {
        setResults([]);
        setNote('Search temporarily unavailable.');
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(handle);
  }, [q]);

  return (
    <section
      className={cn(
        'rounded-card border border-surface-border bg-white/90 p-4 shadow-card sm:p-5',
        className
      )}
      aria-labelledby="place-search-heading"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
        Places
      </p>
      <h2 id="place-search-heading" className="mt-1 text-lg font-bold text-ink">
        Where are you going?
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Search an address, area, or landmark in Nigeria.
      </p>

      <label className="mt-3 block">
        <span className="sr-only">Search a place in Nigeria</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a place in Nigeria…"
          autoComplete="off"
          className="h-11 w-full rounded-control border border-surface-border bg-white px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        />
      </label>

      {loading ? <p className="mt-2 text-xs text-ink-muted">Searching…</p> : null}
      {note ? <p className="mt-2 text-xs text-ink-muted">{note}</p> : null}

      {results.length ? (
        <ul className="mt-3 space-y-1" role="listbox" aria-label="Place matches">
          {results.slice(0, 6).map((item) => (
            <li key={item.locationId || item.id}>
              <button
                type="button"
                role="option"
                className="w-full rounded-lg border border-transparent px-3 py-2 text-left hover:border-brand-200 hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                onClick={() => {
                  const id = item.locationId || item.id;
                  router.push(id ? `/locations/${id}` : '/explore');
                }}
              >
                <span className="block text-sm font-semibold text-ink">{item.name}</span>
                <span className="block text-xs text-ink-muted">
                  {[item.area, item.lga, item.state].filter(Boolean).join(' · ') ||
                    item.label ||
                    item.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3">
        <Link
          href="/explore"
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          Open explore map
        </Link>
      </div>
    </section>
  );
}
