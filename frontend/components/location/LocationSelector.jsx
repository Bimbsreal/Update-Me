'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormError, Select } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { ApiError, locationsApi } from '@/lib/api';

export function LocationSelector({
  open,
  onClose,
  onSelect,
  title = 'Choose your area',
  initialQuery = '',
}) {
  const titleId = useId();
  const [tab, setTab] = useState('search');
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [states, setStates] = useState([]);
  const [lgas, setLgas] = useState([]);
  const [areas, setAreas] = useState([]);
  const [stateId, setStateId] = useState('');
  const [lgaId, setLgaId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingLgaIdRef = useRef('');

  useEffect(() => {
    if (!open) return;
    setError('');
    locationsApi
      .states()
      .then((data) => setStates(data.states || []))
      .catch(() => setError('Unable to load states.'));
  }, [open]);

  useEffect(() => {
    if (!open || tab !== 'search') return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return undefined;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await locationsApi.search(q, { limit: 12 });
        setResults((data.results || []).filter((item) => item.type === 'area' || item.type === 'lga'));
        setError('');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Search failed.');
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open, tab]);

  useEffect(() => {
    if (!stateId) {
      setLgas([]);
      setLgaId('');
      setAreas([]);
      setAreaId('');
      return;
    }
    setBusy(true);
    locationsApi
      .lgas(stateId)
      .then((data) => {
        const list = data.lgas || [];
        setLgas(list);
        const preferred = pendingLgaIdRef.current;
        pendingLgaIdRef.current = '';
        const nextLga = preferred && list.some((item) => item.id === preferred) ? preferred : '';
        setLgaId(nextLga);
        setAreas([]);
        setAreaId('');
      })
      .catch(() => setError('Unable to load LGAs.'))
      .finally(() => setBusy(false));
  }, [stateId]);

  useEffect(() => {
    if (!lgaId) {
      setAreas([]);
      setAreaId('');
      return;
    }
    setBusy(true);
    locationsApi
      .areas(lgaId)
      .then((data) => {
        setAreas(data.areas || []);
        setAreaId('');
      })
      .catch(() => setError('Unable to load areas.'))
      .finally(() => setBusy(false));
  }, [lgaId]);

  const selectedManualLabel = useMemo(() => {
    const area = areas.find((item) => item.id === areaId);
    const lga = lgas.find((item) => item.id === lgaId);
    const state = states.find((item) => item.id === stateId);
    if (!area) return '';
    return `${area.name}, ${lga?.name}, ${state?.name}`;
  }, [areaId, areas, lgaId, lgas, stateId, states]);

  async function useMyLocation() {
    setError('');
    if (!navigator.geolocation) {
      setError('Location is not supported in this browser. Please choose manually.');
      setTab('manual');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const data = await locationsApi.nearby(
            position.coords.latitude,
            position.coords.longitude,
            { type: 'area', radiusKm: 25, limit: 5 }
          );
          const first = data.results?.[0];
          if (!first) {
            setError('No nearby areas found. Please choose manually.');
            setTab('manual');
            return;
          }
          await onSelect({
            locationId: first.id,
            areaId: first.area?.id,
            label: `${first.name}${first.subtitle ? ` · ${first.subtitle}` : ''}`,
            privateLat: position.coords.latitude,
            privateLng: position.coords.longitude,
          });
          onClose?.();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : 'Location lookup failed.');
          setTab('manual');
        } finally {
          setBusy(false);
        }
      },
      (geoError) => {
        setBusy(false);
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError('Location permission denied. Please choose manually.');
        } else {
          setError('Could not read your location. Please choose manually.');
        }
        setTab('manual');
      },
      { enableHighAccuracy: false, timeout: 12000 }
    );
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-card border border-surface-border bg-white shadow-soft sm:rounded-card">
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-4 py-4 sm:px-5">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-ink">
              {title}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Search or select Nigeria → State → LGA → Area
            </p>
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-control border border-surface-border text-ink"
            aria-label="Close location selector"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="flex gap-2 px-4 pt-3 sm:px-5">
          {[
            ['search', 'Search'],
            ['manual', 'Manual'],
            ['locate', 'Use location'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                'rounded-pill px-3 py-1.5 text-xs font-semibold',
                tab === id ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-muted'
              )}
              onClick={() => {
                setTab(id);
                setError('');
                if (id === 'locate') useMyLocation();
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <FormError message={error} />

          {tab === 'search' ? (
            <div className="space-y-3">
              <label className="block space-y-1.5" htmlFor="location-search">
                <span className="text-sm font-medium text-ink">Search locations</span>
                <input
                  id="location-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Try Lekki, Ikeja, Wuse…"
                  className="h-11 w-full rounded-control border border-surface-border px-3.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
              </label>
              {searching ? <p className="text-sm text-ink-muted">Searching…</p> : null}
              <ul className="space-y-2">
                {results.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="w-full rounded-control border border-surface-border px-3 py-3 text-left hover:border-brand-300 hover:bg-brand-50/50"
                      onClick={async () => {
                        if (item.type === 'lga') {
                          setTab('manual');
                          pendingLgaIdRef.current = item.lga?.id || '';
                          if (item.state?.id) setStateId(item.state.id);
                          setError('Choose a specific area within this LGA.');
                          return;
                        }
                        if (item.type !== 'area') {
                          setError('Select a specific area/neighbourhood result.');
                          return;
                        }
                        await onSelect({
                          locationId: item.id,
                          areaId: item.area?.id,
                          label: `${item.name}${item.subtitle ? ` · ${item.subtitle}` : ''}`,
                        });
                        onClose?.();
                      }}
                    >
                      <span className="block text-sm font-semibold text-ink">{item.name}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {item.subtitle || item.type}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {!searching && query.trim().length >= 2 && results.length === 0 ? (
                <p className="text-sm text-ink-muted">No matching areas found.</p>
              ) : null}
            </div>
          ) : null}

          {tab === 'manual' ? (
            <div className="space-y-3">
              <Select id="country" label="Country" value="NG" disabled>
                <option value="NG">Nigeria</option>
              </Select>
              <Select
                id="state"
                label="State"
                value={stateId}
                onChange={(e) => setStateId(e.target.value)}
              >
                <option value="">Select state</option>
                {states.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.name}
                  </option>
                ))}
              </Select>
              <Select
                id="lga"
                label="LGA"
                value={lgaId}
                disabled={!stateId || busy}
                onChange={(e) => setLgaId(e.target.value)}
              >
                <option value="">{lgas.length ? 'Select LGA' : 'No LGAs available'}</option>
                {lgas.map((lga) => (
                  <option key={lga.id} value={lga.id}>
                    {lga.name}
                  </option>
                ))}
              </Select>
              <Select
                id="area"
                label="Area"
                value={areaId}
                disabled={!lgaId || busy}
                onChange={(e) => setAreaId(e.target.value)}
              >
                <option value="">
                  {areas.length ? 'Select area' : 'No detailed areas seeded for this LGA yet'}
                </option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
              <Button
                className="w-full"
                disabled={!areaId || busy}
                onClick={async () => {
                  const area = areas.find((item) => item.id === areaId);
                  await onSelect({
                    areaId,
                    locationId: area?.locationId,
                    label: selectedManualLabel,
                  });
                  onClose?.();
                }}
              >
                Save area
              </Button>
            </div>
          ) : null}

          {tab === 'locate' ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-ink-muted">
                {busy ? 'Resolving your approximate area…' : 'Use the browser location prompt.'}
              </p>
              <Button onClick={useMyLocation} disabled={busy}>
                Try again
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
