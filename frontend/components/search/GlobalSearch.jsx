'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, searchApi } from '@/lib/api';
import { cn } from '@/lib/cn';

const GROUP_HINT = {
  places: 'Place',
  fuel: 'Fuel',
  transport: 'Transport',
  prices: 'Prices',
  traffic: 'Traffic',
  alerts: 'Alert',
  official: 'Official',
  community: 'Community',
};

/**
 * Reusable global search field with debounced suggestions, recent searches,
 * and keyboard navigation. Full results live on /explore?q=…
 */
export function GlobalSearch({
  className,
  placeholder = 'Search areas, roads, fuel, traffic…',
  locationId,
  compact = false,
  onNavigate,
  initialQuery = '',
  showRecent = true,
}) {
  const router = useRouter();
  const { user } = useAuth();
  const inputId = useId();
  const listId = useId();
  const rootRef = useRef(null);
  const [q, setQ] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState([]);
  const [recent, setRecent] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setQ(initialQuery || '');
  }, [initialQuery]);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const loadRecent = useCallback(async () => {
    if (!showRecent || !user) {
      setRecent([]);
      return;
    }
    try {
      const data = await searchApi.recent({ limit: 6 });
      setRecent(data.items || []);
    } catch {
      setRecent([]);
    }
  }, [showRecent, user]);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setError('');
      return undefined;
    }
    if (offline) {
      setError('You are offline. Search needs a connection.');
      setSuggestions([]);
      return undefined;
    }

    const handle = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await searchApi.suggest(term, {
          limit: 10,
          locationId: locationId || undefined,
        });
        setSuggestions(data.suggestions || []);
        setOpen(true);
        setActiveIndex(-1);
      } catch (err) {
        setSuggestions([]);
        setError(err instanceof ApiError ? err.message : 'Search failed. Try again.');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [q, locationId, offline]);

  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function goFullSearch(term) {
    const value = String(term || q).trim();
    if (!value) return;
    setOpen(false);
    const params = new URLSearchParams({ q: value });
    if (locationId) params.set('locationId', locationId);
    const href = `/explore?${params.toString()}`;
    onNavigate?.(href);
    router.push(href);
  }

  function selectSuggestion(item) {
    setOpen(false);
    if (item?.href) {
      onNavigate?.(item.href);
      router.push(item.href);
      return;
    }
    goFullSearch(item?.title || q);
  }

  async function clearRecent() {
    try {
      await searchApi.clearRecent();
      setRecent([]);
    } catch {
      /* ignore */
    }
  }

  const panelItems =
    q.trim().length < 2
      ? recent.map((r) => ({ kind: 'recent', id: r.id, title: r.query }))
      : suggestions.map((s) => ({ kind: 'suggestion', ...s }));

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, panelItems.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && panelItems[activeIndex]) {
        const item = panelItems[activeIndex];
        if (item.kind === 'recent') goFullSearch(item.title);
        else selectSuggestion(item);
      } else {
        goFullSearch(q);
      }
    }
  }

  return (
    <div ref={rootRef} className={cn('relative min-w-0', className)}>
      <label htmlFor={inputId} className={compact ? 'sr-only' : 'mb-1 block text-sm font-medium text-ink'}>
        Search Update Me
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            'h-11 min-w-0 flex-1 rounded-control border border-surface-border bg-white px-3.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
            compact && 'h-10 text-sm'
          )}
        />
        <button
          type="button"
          onClick={() => goFullSearch(q)}
          className="h-11 shrink-0 rounded-control bg-brand-700 px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 sm:px-4"
        >
          Search
        </button>
      </div>
      {loading ? <p className="mt-1 text-xs text-ink-muted">Searching…</p> : null}
      {error ? (
        <p className="mt-1 text-xs text-status-urgent" role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-card border border-surface-border bg-white py-1 shadow-card"
        >
          {q.trim().length < 2 && recent.length ? (
            <div className="border-b border-surface-border px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Recent</p>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-brand-700"
                  onClick={clearRecent}
                >
                  Clear
                </button>
              </div>
              <ul>
                {recent.map((r, idx) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      id={`${listId}-option-${idx}`}
                      role="option"
                      aria-selected={activeIndex === idx}
                      className={cn(
                        'block w-full px-1 py-2.5 text-left text-sm hover:bg-brand-50',
                        activeIndex === idx && 'bg-brand-50'
                      )}
                      onClick={() => goFullSearch(r.query)}
                    >
                      {r.query}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {suggestions.length ? (
            <ul>
              {suggestions.map((s, idx) => (
                <li key={`${s.group}-${s.type}-${s.id}`}>
                  <button
                    type="button"
                    id={`${listId}-option-${idx}`}
                    role="option"
                    aria-selected={activeIndex === idx}
                    className={cn(
                      'block w-full px-3 py-2.5 text-left hover:bg-brand-50',
                      activeIndex === idx && 'bg-brand-50'
                    )}
                    onClick={() => selectSuggestion(s)}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                      {GROUP_HINT[s.group] || s.type}
                      {s.sourceLabel ? ` · ${s.sourceLabel}` : ''}
                    </p>
                    <p className="text-sm font-semibold text-ink break-words">{s.title}</p>
                    {s.subtitle ? <p className="text-xs text-ink-muted">{s.subtitle}</p> : null}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="block w-full border-t border-surface-border px-3 py-2.5 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50"
                  onClick={() => goFullSearch(q)}
                >
                  See all results for “{q.trim()}”
                </button>
              </li>
            </ul>
          ) : q.trim().length >= 2 && !loading && !error ? (
            <p className="px-3 py-3 text-sm text-ink-muted">No suggestions — press Search for full results.</p>
          ) : null}

          {!suggestions.length && !recent.length && q.trim().length < 2 ? (
            <p className="px-3 py-3 text-sm text-ink-muted">
              Try an area, road, station, or update (e.g. Lekki, fuel, rice).
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
