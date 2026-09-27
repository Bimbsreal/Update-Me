'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi, ApiError, locationsApi } from '@/lib/api';
import { AdminPageHeader, useAdmin } from '@/components/admin/AdminContext';
import {
  AdminCard,
  ConfirmAction,
  EmptyState,
  FilterInput,
  FilterSelect,
  Pagination,
  StatusPill,
} from '@/components/admin/AdminUI';

const TABS = [
  { id: 'directory', label: 'Stations' },
  { id: 'submissions', label: 'Price observations' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'brands', label: 'Brands' },
  { id: 'products', label: 'Products' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'quality', label: 'Data quality' },
  { id: 'sources', label: 'Sources' },
];

function formatNaira(amount, unit = 'litre') {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const formatted = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(amount));
  const u = unit === 'kg' ? 'kg' : unit === 'cylinder' ? 'cyl' : 'L';
  return `${formatted}/${u}`;
}

function OsmMap({ lat, lng, name }) {
  if (lat == null || lng == null) {
    return (
      <div className="rounded-lg border border-dashed border-surface-border bg-surface-muted/40 px-3 py-8 text-center text-xs text-ink-muted">
        No coordinates on file.
      </div>
    );
  }
  const delta = 0.015;
  const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`;
  const marker = `${lat}%2C${lng}`;
  return (
    <div className="overflow-hidden rounded-lg border border-surface-border">
      <iframe
        title={`Map of ${name || 'station'}`}
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`}
        className="h-44 w-full border-0 sm:h-52"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <p className="border-t border-surface-border bg-surface-muted/40 px-3 py-1.5 text-[11px] text-ink-muted">
        {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
      </p>
    </div>
  );
}

function Sparkline({ points }) {
  if (!points?.length || points.length < 2) {
    return <p className="text-xs text-ink-muted">Not enough history for a chart.</p>;
  }
  const values = points.map((p) => p.price.amount);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 280;
  const h = 64;
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 8) - 4;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full text-brand-700" aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function AdminFuelPage() {
  const searchParams = useSearchParams();
  const { can } = useAdmin();
  const canEdit = can('fuel_stations');

  const [tab, setTab] = useState('directory');
  const [dashboard, setDashboard] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    q: '',
    stateId: '',
    brand: '',
    status: '',
    freshness: '',
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [states, setStates] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [submissions, setSubmissions] = useState({ items: [], total: 0, limit: 30 });
  const [subPage, setSubPage] = useState(1);
  const [conflicts, setConflicts] = useState(null);
  const [duplicates, setDuplicates] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [brandCatalogue, setBrandCatalogue] = useState({ items: [] });
  const [products, setProducts] = useState({ items: [] });
  const [mergeForm, setMergeForm] = useState({
    survivorStationId: '',
    mergedStationId: '',
    reason: '',
  });
  const [quality, setQuality] = useState(null);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    brand: '',
    locationId: '',
    address: '',
    latitude: '',
    longitude: '',
    reason: '',
  });
  const [editForm, setEditForm] = useState(null);
  const [aliasDraft, setAliasDraft] = useState('');
  const [similar, setSimilar] = useState(null);

  const loadDashboard = useCallback(() => {
    adminApi
      .fuelDashboard()
      .then((d) => setDashboard(d.dashboard || null))
      .catch(() => setDashboard(null));
  }, []);

  const loadList = useCallback(() => {
    setError('');
    adminApi
      .fuelStations({ ...filters, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load stations'));
  }, [filters, page]);

  useEffect(() => {
    loadDashboard();
    locationsApi
      .states()
      .then((d) => setStates(d.states || []))
      .catch(() => {});
    adminApi
      .fuelBrands()
      .then((d) => setBrands(d.brands || []))
      .catch(() => {});
  }, [loadDashboard]);

  useEffect(() => {
    if (tab === 'directory') loadList();
    if (tab === 'submissions') {
      adminApi
        .fuelSubmissions({ page: subPage, limit: 30, sourceType: 'community' })
        .then(setSubmissions)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load submissions'));
    }
    if (tab === 'anomalies') {
      adminApi
        .fuelAnomalies({ limit: 40 })
        .then((d) => setAnomalies(d.anomalies || null))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load anomalies'));
    }
    if (tab === 'brands') {
      adminApi
        .fuelBrandCatalogue({ limit: 100 })
        .then(setBrandCatalogue)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load brands'));
    }
    if (tab === 'products') {
      adminApi
        .fuelProducts()
        .then(setProducts)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load products'));
    }
    if (tab === 'conflicts') {
      Promise.all([
        adminApi.fuelConflicts({ limit: 40 }),
        adminApi.fuelDuplicates({ limit: 40 }),
      ])
        .then(([c, d]) => {
          setConflicts(c.conflicts || null);
          setDuplicates(d.duplicates || null);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load conflicts'));
    }
    if (tab === 'quality') {
      adminApi
        .fuelQuality()
        .then((d) => setQuality(d.issues || null))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load quality'));
    }
    if (tab === 'sources') {
      adminApi
        .fuelSources()
        .then((d) => setSources(d.sources || []))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load sources'));
    }
  }, [tab, loadList, subPage]);

  async function openDetail(id) {
    if (!id) return;
    setBusy(id);
    setError('');
    try {
      const d = await adminApi.fuelStation(id);
      setSelectedId(id);
      setDetail(d);
      const s = d.station;
      setEditForm({
        name: s.name || '',
        brand: s.brand || '',
        address: s.address || '',
        locationId: s.locationId || '',
        latitude: s.coordinates?.lat ?? '',
        longitude: s.coordinates?.lng ?? '',
        lifecycleStatus: s.lifecycleStatus || 'active',
        reason: '',
      });
      setAliasDraft('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load station');
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    const focus = searchParams.get('focus');
    if (focus) {
      setTab('directory');
      openDetail(focus);
    }
  }, [searchParams]);

  async function saveStation(e) {
    e.preventDefault();
    if (!selectedId || !editForm || !canEdit) return;
    setBusy('save');
    try {
      await adminApi.patchFuelStation(selectedId, {
        ...editForm,
        latitude: editForm.latitude === '' ? null : editForm.latitude,
        longitude: editForm.longitude === '' ? null : editForm.longitude,
        reason: editForm.reason || 'Admin station correction',
      });
      await openDetail(selectedId);
      loadDashboard();
      loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy('');
    }
  }

  async function createStation(e) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy('create');
    setError('');
    try {
      const similarRes = await adminApi.fuelSimilar({
        name: createForm.name,
        locationId: createForm.locationId || undefined,
        lat: createForm.latitude || undefined,
        lng: createForm.longitude || undefined,
      });
      setSimilar(similarRes.similar || null);
      const detailRes = await adminApi.createFuelStation({
        ...createForm,
        latitude: createForm.latitude || null,
        longitude: createForm.longitude || null,
        reason: createForm.reason || 'Admin created station',
      });
      setShowCreate(false);
      setCreateForm({
        name: '',
        brand: '',
        locationId: '',
        address: '',
        latitude: '',
        longitude: '',
        reason: '',
      });
      loadDashboard();
      loadList();
      if (detailRes.station?.id) await openDetail(detailRes.station.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Create failed');
    } finally {
      setBusy('');
    }
  }

  async function addAlias(e) {
    e.preventDefault();
    if (!selectedId || !canEdit || !aliasDraft.trim()) return;
    setBusy('alias');
    try {
      await adminApi.addFuelStationAlias(selectedId, {
        alias: aliasDraft.trim(),
        reason: 'Admin alias',
      });
      setAliasDraft('');
      await openDetail(selectedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Alias failed');
    } finally {
      setBusy('');
    }
  }

  const station = detail?.station;
  const history = detail?.priceHistory || [];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        breadcrumb="Content & Reports"
        title="Fuel & Filling Station Management"
        subtitle="Stations, community price observations, official petroleum notices, and data quality — without presenting unverified reports as official prices."
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
            >
              {showCreate ? 'Cancel' : 'Add station'}
            </button>
          ) : null
        }
      />

      {dashboard ? (
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <AdminCard title="Active stations" value={dashboard.activeStations} />
          <AdminCard title="Verified stations" value={dashboard.verifiedStations ?? 0} />
          <AdminCard title="Pending review" value={dashboard.pendingVerificationStations} />
          <AdminCard title="Observations today" value={dashboard.priceSubmissionsToday} />
          <AdminCard title="Unverified obs." value={dashboard.unverifiedObservations ?? 0} />
          <AdminCard title="Flagged obs." value={dashboard.flaggedObservations ?? 0} />
          <AdminCard title="Stale / expired" value={dashboard.staleOrExpiredPrices} />
          <AdminCard title="Price conflicts" value={dashboard.conflictingPriceGroups} />
          <AdminCard title="Anomalies" value={dashboard.priceAnomalies ?? 0} />
          <AdminCard title="Inactive stations" value={dashboard.inactiveStations} />
          <AdminCard title="Source failures" value={dashboard.failedFuelSourceUpdates} />
          <AdminCard title="Community (7d)" value={dashboard.communitySubmissions7d} />
        </div>
      ) : null}

      {showCreate && canEdit ? (
        <form
          onSubmit={createStation}
          className="grid gap-2 rounded-xl border border-surface-border bg-white p-4 sm:grid-cols-2"
        >
          <FilterInput
            label="Station name"
            required
            value={createForm.name}
            onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
          />
          <FilterInput
            label="Brand / operator"
            value={createForm.brand}
            onChange={(e) => setCreateForm((f) => ({ ...f, brand: e.target.value }))}
          />
          <FilterInput
            label="Location id"
            required
            value={createForm.locationId}
            onChange={(e) => setCreateForm((f) => ({ ...f, locationId: e.target.value }))}
            placeholder="UUID of area / LGA location"
          />
          <FilterInput
            label="Address"
            value={createForm.address}
            onChange={(e) => setCreateForm((f) => ({ ...f, address: e.target.value }))}
          />
          <FilterInput
            label="Latitude"
            value={createForm.latitude}
            onChange={(e) => setCreateForm((f) => ({ ...f, latitude: e.target.value }))}
          />
          <FilterInput
            label="Longitude"
            value={createForm.longitude}
            onChange={(e) => setCreateForm((f) => ({ ...f, longitude: e.target.value }))}
          />
          <FilterInput
            label="Reason"
            value={createForm.reason}
            onChange={(e) => setCreateForm((f) => ({ ...f, reason: e.target.value }))}
          />
          {similar?.byName?.length || similar?.nearby?.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2 text-xs sm:col-span-2">
              <p className="font-semibold text-amber-950">Similar stations found (not auto-merged)</p>
              <ul className="mt-1 space-y-0.5 text-amber-900/80">
                {(similar.byName || []).slice(0, 5).map((s) => (
                  <li key={s.id}>
                    {s.name}
                    {s.brand ? ` · ${s.brand}` : ''} · {s.location_name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="submit"
            disabled={busy === 'create'}
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white sm:col-span-2"
          >
            Create station
          </button>
        </form>
      ) : null}

      <div
        role="tablist"
        aria-label="Fuel admin views"
        className="flex gap-1 overflow-x-auto rounded-xl border border-surface-border bg-white p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${
              tab === t.id ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-surface-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {tab === 'directory' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="min-w-0 space-y-3">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-surface-border bg-white px-3 py-2 text-sm font-semibold md:hidden"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              Filters
              <span aria-hidden>{filtersOpen ? '▴' : '▾'}</span>
            </button>
            <div
              className={`grid gap-2 rounded-xl border border-surface-border bg-white p-3 sm:grid-cols-2 lg:grid-cols-3 ${
                filtersOpen ? '' : 'hidden md:grid'
              }`}
            >
              <FilterInput
                label="Search"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                placeholder="Name, brand, alias"
              />
              <FilterSelect
                label="State"
                value={filters.stateId}
                onChange={(e) => setFilters((f) => ({ ...f, stateId: e.target.value }))}
              >
                <option value="">All states</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Brand"
                value={filters.brand}
                onChange={(e) => setFilters((f) => ({ ...f, brand: e.target.value }))}
              >
                <option value="">All brands</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Status"
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="pending_verification">Pending verification</option>
                <option value="temporarily_inactive">Temporarily inactive</option>
                <option value="permanently_inactive">Permanently inactive</option>
                <option value="inactive">Any inactive</option>
              </FilterSelect>
              <FilterSelect
                label="Petrol freshness"
                value={filters.freshness}
                onChange={(e) => setFilters((f) => ({ ...f, freshness: e.target.value }))}
              >
                <option value="">Any</option>
                <option value="fresh">Fresh</option>
                <option value="aging">Aging</option>
                <option value="stale">Stale</option>
                <option value="expired">Expired</option>
              </FilterSelect>
              <button
                type="button"
                onClick={() => {
                  setPage(1);
                  loadList();
                }}
                className="self-end rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
              >
                Search
              </button>
            </div>

            <ul className="space-y-2 md:hidden">
              {!data.items?.length ? (
                <EmptyState message="No stations found." />
              ) : (
                data.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openDetail(item.id)}
                      className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${
                        selectedId === item.id
                          ? 'border-brand-400 bg-brand-50'
                          : 'border-surface-border bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">{item.name}</p>
                        <StatusPill status={item.lifecycleStatus || 'unknown'} />
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        {[item.brand, item.areaName || item.lgaName, item.stateName]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </p>
                      <p className="mt-1 text-xs">
                        {item.latestPetrol
                          ? `${formatNaira(item.latestPetrol.amount, item.latestPetrol.unit)} · ${item.latestPetrol.trustLabel} · ${item.latestPetrol.freshness}`
                          : 'No recent petrol price'}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>

            <div className="hidden overflow-hidden rounded-xl border border-surface-border bg-white md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-surface-border bg-surface-muted/50 text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Station</th>
                    <th className="px-3 py-2 font-semibold">Location</th>
                    <th className="px-3 py-2 font-semibold">Petrol</th>
                    <th className="px-3 py-2 font-semibold">Source</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {!data.items?.length ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-ink-muted">
                        No stations found.
                      </td>
                    </tr>
                  ) : (
                    data.items.map((item) => (
                      <tr
                        key={item.id}
                        tabIndex={0}
                        className={`cursor-pointer border-b border-surface-border/70 hover:bg-brand-50/40 ${
                          selectedId === item.id ? 'bg-brand-50' : ''
                        }`}
                        onClick={() => openDetail(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openDetail(item.id);
                          }
                        }}
                      >
                        <td className="px-3 py-2">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-ink-muted">{item.brand || '—'}</p>
                        </td>
                        <td className="px-3 py-2 text-xs text-ink-muted">
                          {[item.areaName || item.lgaName, item.stateName].filter(Boolean).join(' · ') ||
                            item.locationName ||
                            '—'}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {item.latestPetrol
                            ? formatNaira(item.latestPetrol.amount, item.latestPetrol.unit)
                            : '—'}
                          {item.latestPetrol?.freshness ? (
                            <span className="ml-1 text-xs text-ink-muted">
                              · {item.latestPetrol.freshness}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {item.latestPetrol?.trustLabel || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <StatusPill status={item.lifecycleStatus || 'unknown'} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />
          </div>

          <div className="min-w-0 rounded-xl border border-surface-border bg-white p-4 shadow-sm">
            {!station ? (
              <p className="text-sm text-ink-muted">
                Select a station to inspect current price, freshness, source, location, and history.
              </p>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">{station.name}</h2>
                    <p className="text-xs text-ink-muted">
                      {[station.brand, station.address, station.lgaName, station.stateName]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <StatusPill status={station.lifecycleStatus} />
                </div>

                <div className="rounded-lg border border-surface-border bg-surface-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Current petrol
                  </p>
                  {station.latestPetrol ? (
                    <>
                      <p className="mt-1 text-2xl font-bold tabular-nums">
                        {formatNaira(station.latestPetrol.amount, station.latestPetrol.unit)}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {station.latestPetrol.trustLabel} · {station.latestPetrol.freshness}
                        {station.latestPetrol.observedAt
                          ? ` · ${new Date(station.latestPetrol.observedAt).toLocaleString()}`
                          : ''}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-ink-muted">No petrol observation on file.</p>
                  )}
                </div>

                {detail.latestByType?.length ? (
                  <ul className="grid gap-2 sm:grid-cols-3">
                    {detail.latestByType.map((row) => (
                      <li
                        key={row.fuelType}
                        className="rounded-lg border border-surface-border px-2 py-2 text-xs"
                      >
                        <p className="font-semibold">{row.fuelTypeLabel}</p>
                        <p className="tabular-nums">
                          {row.price ? formatNaira(row.price.amount, row.price.unit) : '—'}
                        </p>
                        <p className="text-ink-muted">
                          {row.trustLabel} · {row.freshness}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <OsmMap
                  lat={station.coordinates?.lat}
                  lng={station.coordinates?.lng}
                  name={station.name}
                />

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Price history (PMS)
                  </p>
                  <Sparkline points={history} />
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                    {[...history].reverse().slice(0, 12).map((h) => (
                      <li key={h.id} className="flex justify-between gap-2">
                        <span>
                          {formatNaira(h.price.amount, h.price.unit)}
                          {h.change != null ? (
                            <span className="text-ink-muted">
                              {' '}
                              ({h.change > 0 ? '+' : ''}
                              {h.change})
                            </span>
                          ) : null}
                        </span>
                        <span className="text-ink-muted">
                          {h.trustLabel} · {new Date(h.observedAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {canEdit && editForm ? (
                  <form onSubmit={saveStation} className="grid gap-2 sm:grid-cols-2">
                    <FilterInput
                      label="Name"
                      required
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    />
                    <FilterInput
                      label="Brand"
                      value={editForm.brand}
                      onChange={(e) => setEditForm((f) => ({ ...f, brand: e.target.value }))}
                    />
                    <FilterSelect
                      label="Lifecycle"
                      value={editForm.lifecycleStatus}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, lifecycleStatus: e.target.value }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="pending_verification">Pending verification</option>
                      <option value="temporarily_inactive">Temporarily inactive</option>
                      <option value="permanently_inactive">Permanently inactive</option>
                    </FilterSelect>
                    <FilterInput
                      label="Location id"
                      value={editForm.locationId}
                      onChange={(e) => setEditForm((f) => ({ ...f, locationId: e.target.value }))}
                    />
                    <FilterInput
                      label="Latitude"
                      value={editForm.latitude}
                      onChange={(e) => setEditForm((f) => ({ ...f, latitude: e.target.value }))}
                    />
                    <FilterInput
                      label="Longitude"
                      value={editForm.longitude}
                      onChange={(e) => setEditForm((f) => ({ ...f, longitude: e.target.value }))}
                    />
                    <FilterInput
                      label="Address"
                      value={editForm.address}
                      onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                    />
                    <FilterInput
                      label="Correction reason"
                      required
                      value={editForm.reason}
                      onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
                    />
                    <button
                      type="submit"
                      disabled={busy === 'save'}
                      className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white sm:col-span-2"
                    >
                      Save correction
                    </button>
                  </form>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {canEdit && station.lifecycleStatus === 'active' ? (
                    <ConfirmAction
                      label="Deactivate"
                      danger
                      onConfirm={async (reason) => {
                        await adminApi.patchFuelStation(selectedId, {
                          lifecycleStatus: 'temporarily_inactive',
                          reason,
                        });
                        await openDetail(selectedId);
                        loadList();
                        loadDashboard();
                      }}
                    />
                  ) : null}
                  {canEdit && station.lifecycleStatus !== 'active' ? (
                    <ConfirmAction
                      label="Activate"
                      onConfirm={async (reason) => {
                        await adminApi.patchFuelStation(selectedId, {
                          lifecycleStatus: 'active',
                          reason,
                        });
                        await openDetail(selectedId);
                        loadList();
                        loadDashboard();
                      }}
                    />
                  ) : null}
                  <Link
                    href="/admin/moderation"
                    className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold"
                  >
                    Open Moderation Center
                  </Link>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Aliases
                  </p>
                  {detail.aliases?.length ? (
                    <ul className="mt-1 space-y-1">
                      {detail.aliases.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-2 rounded bg-surface-muted/50 px-2 py-1 text-xs"
                        >
                          <span>{a.alias}</span>
                          {canEdit ? (
                            <button
                              type="button"
                              className="text-red-700 hover:underline"
                              onClick={async () => {
                                await adminApi.removeFuelStationAlias(selectedId, a.id, {
                                  reason: 'Alias removed',
                                });
                                await openDetail(selectedId);
                              }}
                            >
                              Remove
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-ink-muted">No aliases.</p>
                  )}
                  {canEdit ? (
                    <form onSubmit={addAlias} className="mt-2 flex gap-2">
                      <input
                        value={aliasDraft}
                        onChange={(e) => setAliasDraft(e.target.value)}
                        aria-label="New station alias"
                        placeholder="Search alias"
                        className="min-w-0 flex-1 rounded-lg border border-surface-border px-3 py-2 text-sm"
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold"
                      >
                        Add
                      </button>
                    </form>
                  ) : null}
                </div>

                {detail.recentSubmissions?.length ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      Recent submissions
                    </p>
                    <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto text-xs">
                      {detail.recentSubmissions.map((s) => (
                        <li key={s.id}>
                          {s.fuelTypeLabel}:{' '}
                          {s.price ? formatNaira(s.price.amount, s.price.unit) : '—'} ·{' '}
                          {s.trustLabel} · {s.freshness}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'submissions' ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Community fuel-price observations. Verification uses the existing confirm / moderation
            workflow — not a one-click &quot;verified&quot; stamp.
          </p>
          {!submissions.items?.length ? (
            <EmptyState message="No community submissions found." />
          ) : (
            <ul className="space-y-2">
              {submissions.items.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-surface-border bg-white px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {s.stationName} · {s.fuelTypeLabel}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {s.price ? formatNaira(s.price.amount, s.price.unit) : 'No price'} ·{' '}
                        {s.trustLabel} · {s.freshness} · {s.authorDisplayName || 'Reporter'}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {[s.locationName, s.lgaName, s.stateName].filter(Boolean).join(' · ')}
                        {s.createdAt ? ` · ${new Date(s.createdAt).toLocaleString()}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill status={s.status} />
                      <button
                        type="button"
                        className="rounded-lg border border-surface-border px-2 py-1 text-xs font-semibold"
                        onClick={() => {
                          setTab('directory');
                          openDetail(s.stationId);
                        }}
                      >
                        Station
                      </button>
                      <Link
                        href={`/admin/moderation?focus=${encodeURIComponent(s.reportId)}`}
                        className="rounded-lg border border-surface-border px-2 py-1 text-xs font-semibold"
                      >
                        Moderate
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={subPage}
            total={submissions.total}
            limit={submissions.limit}
            onPage={setSubPage}
          />
        </div>
      ) : null}

      {tab === 'anomalies' ? (
        <div className="rounded-xl border border-surface-border bg-white p-3">
          <h3 className="font-semibold">Price anomalies</h3>
          <p className="text-xs text-ink-muted">
            {anomalies?.note || 'Outliers vs recent median — review only; never auto-rejected.'}
          </p>
          <ul className="mt-3 space-y-2">
            {(anomalies?.items || []).map((a) => (
              <li key={a.id} className="text-sm">
                <button
                  type="button"
                  className="font-medium text-brand-700 underline"
                  onClick={() => {
                    setTab('directory');
                    openDetail(a.stationId);
                  }}
                >
                  {a.stationName}
                </button>{' '}
                · {String(a.fuelType).toUpperCase()} · {formatNaira(a.amount, a.unit)} vs median{' '}
                {formatNaira(a.medianPrice, a.unit)}
                <span className="block text-xs text-amber-900">
                  {a.flagReason} · {a.pricingContext} · {a.sourceType}
                </span>
              </li>
            ))}
            {!anomalies?.items?.length ? (
              <li className="text-sm text-ink-muted">No outliers in the review window.</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {tab === 'brands' ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-muted">
            Controlled marketer brands with aliases (e.g. NNPC / NNPCL). Independent is first-class.
          </p>
          <ul className="space-y-2">
            {(brandCatalogue.items || []).map((b) => (
              <li key={b.id} className="rounded-xl border border-surface-border bg-white p-3 text-sm">
                <p className="font-semibold">
                  {b.name}
                  {b.isIndependent ? ' · Independent' : ''}
                </p>
                <p className="text-xs text-ink-muted">
                  code:{b.code} · {b.stationCount} stations
                  {b.aliases?.length ? ` · aliases: ${b.aliases.join(', ')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === 'products' ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-muted">
            Controlled fuel products — do not hard-code product names in UI logic.
          </p>
          <ul className="space-y-2">
            {(products.items || []).map((p) => (
              <li key={p.id} className="rounded-xl border border-surface-border bg-white p-3 text-sm">
                <p className="font-semibold">
                  {p.name} ({p.abbreviation || p.code})
                </p>
                <p className="text-xs text-ink-muted">
                  {p.description || '—'} · default unit: {p.defaultUnit}
                  {!p.isActive ? ' · inactive' : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === 'conflicts' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-surface-border bg-white p-4">
            <h2 className="text-sm font-bold">Conflicting price observations</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Same station + fuel type with ≥ ₦20 spread in recent community reports. No automatic
              &quot;correct&quot; price is chosen.
            </p>
            {!conflicts?.items?.length ? (
              <p className="mt-3 text-sm text-ink-muted">No conflicting groups found.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {conflicts.items.map((c) => (
                  <li
                    key={`${c.stationId}-${c.fuelType}`}
                    className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm"
                  >
                    <button
                      type="button"
                      className="font-semibold text-brand-800 hover:underline"
                      onClick={() => {
                        setTab('directory');
                        openDetail(c.stationId);
                      }}
                    >
                      {c.stationName}
                    </button>
                    <span className="text-ink-muted">
                      {' '}
                      · {c.fuelTypeLabel} · ₦{c.minPrice}–₦{c.maxPrice} (spread ₦{c.spread}) ·{' '}
                      {c.observationCount} reports
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-surface-border bg-white p-4">
            <h2 className="text-sm font-bold">Duplicate station candidates</h2>
            <p className="mt-1 text-xs text-ink-muted">{duplicates?.note}</p>
            {canEdit ? (
              <form
                className="mt-3 grid gap-2 rounded-lg border border-dashed border-surface-border p-3 sm:grid-cols-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy('merge');
                  try {
                    await adminApi.mergeFuelStations(mergeForm);
                    setMergeForm({ survivorStationId: '', mergedStationId: '', reason: '' });
                    loadDashboard();
                    const d = await adminApi.fuelDuplicates({ limit: 40 });
                    setDuplicates(d.duplicates || null);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'Merge failed');
                  } finally {
                    setBusy('');
                  }
                }}
              >
                <p className="text-xs font-semibold text-ink sm:col-span-2">
                  Merge stations (moves reports/aliases; deactivates merged station)
                </p>
                <FilterInput
                  label="Survivor station UUID"
                  value={mergeForm.survivorStationId}
                  onChange={(e) =>
                    setMergeForm((f) => ({ ...f, survivorStationId: e.target.value.trim() }))
                  }
                />
                <FilterInput
                  label="Merged (duplicate) station UUID"
                  value={mergeForm.mergedStationId}
                  onChange={(e) =>
                    setMergeForm((f) => ({ ...f, mergedStationId: e.target.value.trim() }))
                  }
                />
                <FilterInput
                  label="Reason"
                  value={mergeForm.reason}
                  onChange={(e) => setMergeForm((f) => ({ ...f, reason: e.target.value }))}
                />
                <button
                  type="submit"
                  disabled={busy === 'merge'}
                  className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Merge into survivor
                </button>
              </form>
            ) : null}
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-ink-muted">Same name + location</p>
                {!duplicates?.sameNameSameLocation?.length ? (
                  <p className="mt-1 text-xs text-ink-muted">None</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs">
                    {duplicates.sameNameSameLocation.map((g) => (
                      <li key={`${g.locationId}-${g.normalizedName}`}>
                        {g.normalizedName} · {g.count} records
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-ink-muted">Near coordinates</p>
                {!duplicates?.nearDuplicateCoordinates?.length ? (
                  <p className="mt-1 text-xs text-ink-muted">None</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs">
                    {duplicates.nearDuplicateCoordinates.map((p) => (
                      <li key={`${p.a.id}-${p.b.id}`}>
                        {p.a.name} ↔ {p.b.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'quality' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Missing coordinates', quality?.missingCoordinates],
            ['Missing recent prices', quality?.missingRecentPrices],
            ['Stale / expired', quality?.staleOrExpired],
            ['Unusual prices', quality?.unusualPrices],
            ['Flagged submissions', quality?.flaggedSubmissions],
          ].map(([title, rows]) => (
            <div key={title} className="rounded-xl border border-surface-border bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{rows?.length ?? 0}</p>
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-ink-muted">
                {(rows || []).slice(0, 8).map((r) => (
                  <li key={r.id}>
                    {r.name || r.station_name || r.id}
                    {r.price_amount != null ? ` · ₦${r.price_amount}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="rounded-xl border border-surface-border bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Duplicate signals
            </p>
            <p className="mt-1 text-sm">
              Name groups: {quality?.duplicateCandidates?.sameName ?? 0}
            </p>
            <p className="text-sm">
              Near-coord pairs: {quality?.duplicateCandidates?.nearCoords ?? 0}
            </p>
          </div>
        </div>
      ) : null}

      {tab === 'sources' ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Official petroleum notice sources from the existing ingestion system. These are not
            treated as exact retail prices at every station.
          </p>
          {!sources.length ? (
            <EmptyState message="No fuel-related official sources configured." />
          ) : (
            <ul className="space-y-2">
              {sources.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-surface-border bg-white px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{s.name}</p>
                    <StatusPill status={s.status || 'unknown'} />
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {s.ingestionMethod} · last success{' '}
                    {s.lastSuccessAt ? new Date(s.lastSuccessAt).toLocaleString() : '—'}
                    {s.lastError ? ` · error: ${s.lastError}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">{s.note}</p>
                  <Link
                    href="/admin/official-sources"
                    className="mt-2 inline-block text-xs font-semibold text-brand-800 hover:underline"
                  >
                    Manage in Data Sources
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
