'use client';

import { useEffect, useId, useState } from 'react';
import { FormError } from '@/components/ui/Input';
import { ApiError, locationsApi } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Compact From/To place picker using existing locations search API.
 */
export function PlaceSearchField({
  id,
  label,
  value,
  onChange,
  placeholder = 'Search places…',
}) {
  const listId = useId();
  const [query, setQuery] = useState(value?.label || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setQuery(value?.label || '');
  }, [value?.label]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return undefined;
    }
    if (value?.label && q === value.label) {
      setResults([]);
      return undefined;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await locationsApi.search(q, { limit: 12 });
        setResults(data.results || []);
        setError('');
        setOpen(true);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Search failed.');
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, value?.label]);

  function selectResult(item) {
    const label = item.subtitle ? `${item.name} · ${item.subtitle}` : item.name;
    onChange?.({
      locationId: item.id,
      label,
      name: item.name,
      type: item.type,
      coordinates: item.coordinates || null,
    });
    setQuery(label);
    setOpen(false);
    setResults([]);
  }

  return (
    <div className="relative space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        className="min-h-11 w-full rounded-control border border-surface-border bg-white px-3.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange?.(null);
        }}
        onFocus={() => {
          if (results.length) setOpen(true);
        }}
      />
      {searching ? <p className="text-xs text-ink-soft">Searching…</p> : null}
      <FormError message={error} />
      {open && results.length ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-card border border-surface-border bg-white py-1 shadow-card"
        >
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                className={cn(
                  'flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-brand-50'
                )}
                onClick={() => selectResult(item)}
              >
                <span className="font-semibold text-ink break-words">{item.name}</span>
                <span className="text-xs capitalize text-ink-soft">
                  {item.type}
                  {item.subtitle ? ` · ${item.subtitle}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
