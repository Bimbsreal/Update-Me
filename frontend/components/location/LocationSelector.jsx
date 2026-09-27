'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormError, Select } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { ApiError, locationsApi } from '@/lib/api';
import {
  GEO_STATUS,
  getCurrentPosition,
  messageForStatus,
  queryPermissionState,
} from '@/lib/geolocation';
import { LOCATION_SOURCES } from '@/lib/locationSource';
import { resolveDeviceToPublicLocation } from '@/lib/resolveDeviceLocation';
import { useLocationSourceOptional } from '@/components/location/LocationSourceProvider';

export function LocationSelector({
  open,
  onClose,
  onSelect,
  title = 'Choose your area',
  initialQuery = '',
}) {
  const titleId = useId();
  const locationSource = useLocationSourceOptional();
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
  const [geoStatus, setGeoStatus] = useState(GEO_STATUS.IDLE);
  const [resolvedPreview, setResolvedPreview] = useState(null);
  const [permissionHint, setPermissionHint] = useState('');
  const pendingLgaIdRef = useRef('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setGeoStatus(GEO_STATUS.IDLE);
    setResolvedPreview(null);
    queryPermissionState().then((state) => {
      if (state === 'denied') {
        setPermissionHint(messageForStatus(GEO_STATUS.DENIED));
        setGeoStatus(GEO_STATUS.DENIED);
      } else if (state === 'granted') {
        setPermissionHint('');
      } else {
        setPermissionHint('Your browser will ask for permission to use your location.');
      }
    });
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
        setResults(
          (data.results || []).filter((item) =>
            ['area', 'lga', 'city', 'place'].includes(item.type)
          )
        );
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
    if (area) return `${area.name}, ${lga?.name}, ${state?.name}`;
    if (lga) return `${lga.name}, ${state?.name}`;
    return '';
  }, [areaId, areas, lgaId, lgas, stateId, states]);

  function clearManualSelection() {
    setStateId('');
    setLgaId('');
    setAreaId('');
    setLgas([]);
    setAreas([]);
    setError('');
  }

  async function emitSelect(payload) {
    locationSource?.setFromSelection(payload);
    await onSelect(payload);
    onClose?.();
  }

  async function useMyLocation() {
    setError('');
    setResolvedPreview(null);
    setGeoStatus(GEO_STATUS.REQUESTING);
    setBusy(true);

    const result = await getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 120000,
    });

    if (!result.ok) {
      setBusy(false);
      setGeoStatus(result.status);
      setError(result.message);
      if (result.status === GEO_STATUS.DENIED || result.status === GEO_STATUS.UNSUPPORTED) {
        setTab('manual');
      }
      return;
    }

    try {
      const resolved = await resolveDeviceToPublicLocation(result.position);
      if (!resolved.resolved) {
        setGeoStatus(GEO_STATUS.UNAVAILABLE);
        setError(
          'We found your position but could not match it to a known area. Choose a location manually.'
        );
        setTab('manual');
        locationSource?.setFromSelection({
          source: LOCATION_SOURCES.DEVICE,
          privateCoords: resolved.privateCoords,
          unresolved: true,
          lowAccuracy: resolved.lowAccuracy,
          label: 'Area not identified',
        });
        return;
      }

      setGeoStatus(GEO_STATUS.GRANTED);
      setResolvedPreview(resolved);
    } catch (err) {
      setGeoStatus(GEO_STATUS.ERROR);
      setError(err instanceof ApiError ? err.message : 'Location lookup failed.');
      setTab('manual');
    } finally {
      setBusy(false);
    }
  }

  async function confirmResolved() {
    if (!resolvedPreview) return;
    setBusy(true);
    try {
      await emitSelect({
        source: LOCATION_SOURCES.DEVICE,
        locationId: resolvedPreview.locationId,
        areaId: resolvedPreview.areaId,
        lgaId: resolvedPreview.lgaId,
        label: resolvedPreview.label,
        privateLat: resolvedPreview.privateCoords.lat,
        privateLng: resolvedPreview.privateCoords.lng,
        accuracy: resolvedPreview.privateCoords.accuracy,
        lowAccuracy: resolvedPreview.lowAccuracy,
        public: resolvedPreview.public,
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const locateStatusLabel =
    geoStatus === GEO_STATUS.REQUESTING
      ? messageForStatus(GEO_STATUS.REQUESTING)
      : geoStatus === GEO_STATUS.GRANTED && resolvedPreview
        ? messageForStatus(GEO_STATUS.GRANTED)
        : geoStatus === GEO_STATUS.IDLE
          ? messageForStatus(GEO_STATUS.IDLE)
          : messageForStatus(geoStatus);

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
              Use your current location or choose Nigeria → State → LGA → Area
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

        <div className="flex gap-2 px-4 pt-3 sm:px-5" role="tablist" aria-label="Location method">
          {[
            ['locate', 'Use my location'],
            ['search', 'Search'],
            ['manual', 'Choose manually'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={cn(
                'rounded-pill px-3 py-1.5 text-xs font-semibold',
                tab === id ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-muted'
              )}
              onClick={() => {
                setTab(id);
                setError('');
                if (id === 'locate' && !resolvedPreview && geoStatus !== GEO_STATUS.REQUESTING) {
                  useMyLocation();
                }
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
                        if (item.type === 'city' || item.type === 'place') {
                          await emitSelect({
                            source: LOCATION_SOURCES.MANUAL,
                            locationId: item.id,
                            areaId: item.area?.id || null,
                            label: `${item.name}${item.subtitle ? ` · ${item.subtitle}` : ''}`,
                          });
                          return;
                        }
                        if (item.type !== 'area') {
                          setError('Select a specific area/neighbourhood result.');
                          return;
                        }
                        await emitSelect({
                          source: LOCATION_SOURCES.MANUAL,
                          locationId: item.id,
                          areaId: item.area?.id,
                          label: `${item.name}${item.subtitle ? ` · ${item.subtitle}` : ''}`,
                        });
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
                <p className="text-sm text-ink-muted">No matching locations found.</p>
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
                label="Area / neighbourhood"
                value={areaId}
                disabled={!lgaId || busy || !areas.length}
                onChange={(e) => setAreaId(e.target.value)}
              >
                <option value="">
                  {areas.length
                    ? 'Select area (optional if LGA is enough)'
                    : 'No detailed areas for this LGA yet'}
                </option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="w-full"
                  disabled={(!areaId && !lgaId) || busy}
                  onClick={async () => {
                    if (areaId) {
                      const area = areas.find((item) => item.id === areaId);
                      await emitSelect({
                        source: LOCATION_SOURCES.MANUAL,
                        areaId,
                        locationId: area?.locationId,
                        label: selectedManualLabel,
                      });
                    } else {
                      const lga = lgas.find((item) => item.id === lgaId);
                      await emitSelect({
                        source: LOCATION_SOURCES.MANUAL,
                        areaId: null,
                        lgaId,
                        locationId: lga?.locationId || null,
                        label: selectedManualLabel,
                      });
                    }
                  }}
                >
                  {areaId ? 'Save area' : 'Use selected LGA'}
                </Button>
                <Button type="button" variant="secondary" className="w-full" onClick={clearManualSelection}>
                  Clear
                </Button>
              </div>
              <button
                type="button"
                className="text-sm font-semibold text-brand-700 hover:underline"
                onClick={() => {
                  setTab('locate');
                  useMyLocation();
                }}
              >
                Use my current location instead
              </button>
            </div>
          ) : null}

          {tab === 'locate' ? (
            <div className="space-y-4 py-2 text-center" aria-live="polite">
              <p className="text-sm font-medium text-ink">{locateStatusLabel}</p>
              {permissionHint && geoStatus === GEO_STATUS.IDLE ? (
                <p className="text-xs text-ink-muted">{permissionHint}</p>
              ) : null}
              {resolvedPreview ? (
                <div className="rounded-control border border-brand-100 bg-brand-50/80 px-3 py-3 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
                    Detected area
                  </p>
                  <p className="mt-1 text-sm font-bold text-ink">{resolvedPreview.label}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Exact GPS is kept private. Only this area is used publicly.
                    {resolvedPreview.lowAccuracy
                      ? ' Location accuracy looks approximate.'
                      : ''}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button className="w-full" onClick={confirmResolved} disabled={busy}>
                      Use this area
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={() => {
                        setResolvedPreview(null);
                        setTab('manual');
                        setGeoStatus(GEO_STATUS.IDLE);
                      }}
                    >
                      Choose manually
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button
                    onClick={useMyLocation}
                    disabled={busy || geoStatus === GEO_STATUS.REQUESTING}
                    aria-label={
                      geoStatus === GEO_STATUS.DENIED
                        ? 'Retry after enabling location in browser settings'
                        : 'Use my current location'
                    }
                  >
                    {geoStatus === GEO_STATUS.REQUESTING
                      ? 'Getting your location…'
                      : geoStatus === GEO_STATUS.DENIED
                        ? 'Try again'
                        : 'Use my current location'}
                  </Button>
                  <button
                    type="button"
                    className="block w-full text-sm font-semibold text-brand-700 hover:underline"
                    onClick={() => setTab('manual')}
                  >
                    Choose location manually
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
