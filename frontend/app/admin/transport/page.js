'use client';

import { useCallback, useEffect, useState } from 'react';
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
  { id: 'routes', label: 'Routes' },
  { id: 'stops', label: 'Bus stops' },
  { id: 'directoryStops', label: 'Stop directory' },
  { id: 'fares', label: 'Fare observations' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'quality', label: 'Data quality' },
];

const MODES = [
  '',
  'bus',
  'brt',
  'danfo',
  'minibus',
  'keke',
  'okada',
  'taxi',
  'train',
  'ferry',
  'other',
];

function formatNaira(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

function labelize(value) {
  if (!value) return '—';
  return String(value).replace(/_/g, ' ');
}

function Sparkline({ points }) {
  if (!points?.length || points.length < 2) {
    return <p className="text-xs text-ink-muted">Not enough history for a chart.</p>;
  }
  const values = points.map((p) => p.amount);
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

function RouteMap({ points }) {
  const withCoords = (points || []).filter((p) => p.lat != null && p.lng != null);
  if (!withCoords.length) {
    return (
      <div className="rounded-lg border border-dashed border-surface-border bg-surface-muted/40 px-3 py-6 text-center text-xs text-ink-muted">
        No route coordinates available. Origin → stops → destination labels still apply.
      </div>
    );
  }
  const mid = withCoords[Math.floor(withCoords.length / 2)];
  const delta = 0.04;
  const bbox = `${mid.lng - delta}%2C${mid.lat - delta}%2C${mid.lng + delta}%2C${mid.lat + delta}`;
  const marker = `${mid.lat}%2C${mid.lng}`;
  return (
    <div className="overflow-hidden rounded-lg border border-surface-border">
      <iframe
        title="Route geography"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`}
        className="h-40 w-full border-0 sm:h-48"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <ol className="border-t border-surface-border bg-surface-muted/40 px-3 py-2 text-[11px] text-ink-muted">
        {withCoords.map((p, i) => (
          <li key={`${p.role}-${i}`}>
            {p.role}: {p.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function AdminTransportPage() {
  const { can } = useAdmin();
  const canEdit = can('transport');

  const [tab, setTab] = useState('routes');
  const [dashboard, setDashboard] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    q: '',
    stateId: '',
    mode: '',
    active: '',
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [states, setStates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [stops, setStops] = useState({ items: [], total: 0, limit: 30 });
  const [stopPage, setStopPage] = useState(1);
  const [stopQ, setStopQ] = useState('');
  const [fares, setFares] = useState({ items: [], total: 0, limit: 30 });
  const [farePage, setFarePage] = useState(1);
  const [fareFilters, setFareFilters] = useState({ q: '', mode: '', freshness: '', sourceType: '' });
  const [conflicts, setConflicts] = useState(null);
  const [duplicates, setDuplicates] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [directoryStops, setDirectoryStops] = useState({ items: [], total: 0, limit: 30 });
  const [dirStopPage, setDirStopPage] = useState(1);
  const [dirStopQ, setDirStopQ] = useState('');
  const [createStopOpen, setCreateStopOpen] = useState(false);
  const [newStop, setNewStop] = useState({ name: '', aliases: '', reason: 'Admin created stop' });
  const [createRouteOpen, setCreateRouteOpen] = useState(false);
  const [newRoute, setNewRoute] = useState({
    name: '',
    originLocationId: '',
    destinationLocationId: '',
    mode: 'bus',
    reason: 'Admin created route',
  });
  const [quality, setQuality] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const loadDashboard = useCallback(() => {
    adminApi
      .transportDashboard()
      .then((d) => setDashboard(d.dashboard || null))
      .catch(() => setDashboard(null));
  }, []);

  const loadRoutes = useCallback(() => {
    setError('');
    adminApi
      .transportRoutes({ ...filters, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load routes'));
  }, [filters, page]);

  useEffect(() => {
    loadDashboard();
    locationsApi
      .states()
      .then((d) => setStates(d.states || []))
      .catch(() => {});
  }, [loadDashboard]);

  useEffect(() => {
    if (tab === 'routes') loadRoutes();
    if (tab === 'stops') {
      adminApi
        .transportStops({ q: stopQ, page: stopPage, limit: 30 })
        .then(setStops)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load stops'));
    }
    if (tab === 'fares') {
      adminApi
        .transportFares({ ...fareFilters, page: farePage, limit: 30 })
        .then(setFares)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load fares'));
    }
    if (tab === 'conflicts') {
      Promise.all([
        adminApi.transportConflicts({ limit: 40 }),
        adminApi.transportDuplicates({ limit: 40 }),
      ])
        .then(([c, d]) => {
          setConflicts(c.conflicts || null);
          setDuplicates(d.duplicates || null);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load conflicts'));
    }
    if (tab === 'anomalies') {
      adminApi
        .transportAnomalies({ limit: 40 })
        .then((d) => setAnomalies(d.anomalies || null))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load anomalies'));
    }
    if (tab === 'directoryStops') {
      adminApi
        .transportDirectoryStops({ q: dirStopQ, page: dirStopPage, limit: 30 })
        .then(setDirectoryStops)
        .catch((err) =>
          setError(err instanceof ApiError ? err.message : 'Failed to load stop directory')
        );
    }
    if (tab === 'quality') {
      adminApi
        .transportQuality()
        .then((d) => setQuality(d.issues || null))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load quality'));
    }
  }, [tab, loadRoutes, stopPage, stopQ, farePage, fareFilters, dirStopPage, dirStopQ]);

  async function createRoute(e) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy('create-route');
    try {
      const created = await adminApi.createTransportRoute(newRoute);
      setCreateRouteOpen(false);
      loadDashboard();
      loadRoutes();
      if (created.route?.id) await openRoute(created.route.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create route');
    } finally {
      setBusy('');
    }
  }

  async function createDirectoryStop(e) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy('create-stop');
    try {
      await adminApi.createTransportDirectoryStop({
        name: newStop.name,
        aliases: newStop.aliases
          ? newStop.aliases.split(',').map((a) => a.trim()).filter(Boolean)
          : [],
        reason: newStop.reason,
      });
      setCreateStopOpen(false);
      setNewStop({ name: '', aliases: '', reason: 'Admin created stop' });
      setTab('directoryStops');
      adminApi
        .transportDirectoryStops({ q: dirStopQ, page: dirStopPage, limit: 30 })
        .then(setDirectoryStops);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create stop');
    } finally {
      setBusy('');
    }
  }

  async function openRoute(id) {
    if (!id) return;
    setBusy(id);
    setError('');
    try {
      const d = await adminApi.transportRoute(id);
      setSelectedId(id);
      setDetail(d);
      const r = d.route;
      setEditForm({
        name: r.name || '',
        primaryMode: r.primaryMode || '',
        isActive: r.isActive !== false,
        reason: '',
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load route');
    } finally {
      setBusy('');
    }
  }

  async function saveRoute(e) {
    e.preventDefault();
    if (!selectedId || !editForm || !canEdit) return;
    setBusy('save');
    try {
      await adminApi.patchTransportRoute(selectedId, {
        name: editForm.name,
        primaryMode: editForm.primaryMode || null,
        isActive: editForm.isActive,
        reason: editForm.reason || 'Admin route correction',
      });
      await openRoute(selectedId);
      loadDashboard();
      loadRoutes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy('');
    }
  }

  const route = detail?.route;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        breadcrumb="Content & Reports"
        title="Transport information"
        subtitle="Public transport corridors, bus stops, and fare observations — not booking or ticketing. One observation is never treated as the universal fare."
      />

      {dashboard ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <AdminCard title="Active routes" value={dashboard.activeRoutes} />
          <AdminCard title="Inactive routes" value={dashboard.inactiveRoutes} />
          <AdminCard title="Bus stops" value={dashboard.busStops} />
          <AdminCard title="Fares today" value={dashboard.fareObservationsToday} />
          <AdminCard title="Stale fares" value={dashboard.staleOrExpiredFares} />
          <AdminCard title="Fare conflicts" value={dashboard.conflictingFareGroups} />
          <AdminCard title="Stops missing location" value={dashboard.stopsMissingLocation} />
          <AdminCard title="Unverified" value={dashboard.unverifiedSubmissions} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-surface-border pb-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-surface-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {tab === 'routes' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <button
                type="button"
                className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold"
                onClick={() => setCreateRouteOpen((v) => !v)}
              >
                {createRouteOpen ? 'Cancel' : 'Create route'}
              </button>
            ) : null}
          </div>
          {createRouteOpen ? (
            <form
              onSubmit={createRoute}
              className="grid gap-2 rounded-xl border border-surface-border bg-white p-3 sm:grid-cols-2"
            >
              <FilterInput
                label="Route name"
                value={newRoute.name}
                onChange={(e) => setNewRoute((f) => ({ ...f, name: e.target.value }))}
              />
              <FilterSelect
                label="Mode"
                value={newRoute.mode}
                onChange={(e) => setNewRoute((f) => ({ ...f, mode: e.target.value }))}
              >
                {MODES.filter(Boolean).map((m) => (
                  <option key={m} value={m}>
                    {labelize(m)}
                  </option>
                ))}
              </FilterSelect>
              <FilterInput
                label="Origin location UUID"
                value={newRoute.originLocationId}
                onChange={(e) => setNewRoute((f) => ({ ...f, originLocationId: e.target.value }))}
              />
              <FilterInput
                label="Destination location UUID"
                value={newRoute.destinationLocationId}
                onChange={(e) =>
                  setNewRoute((f) => ({ ...f, destinationLocationId: e.target.value }))
                }
              />
              <button
                type="submit"
                disabled={busy === 'create-route'}
                className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
              >
                Save route
              </button>
            </form>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <button
              type="button"
              className="rounded-lg border border-surface-border px-3 py-2 text-sm sm:hidden"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              {filtersOpen ? 'Hide filters' : 'Show filters'}
            </button>
            <div
              className={`grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 ${
                filtersOpen ? '' : 'hidden sm:grid'
              }`}
            >
              <FilterInput
                label="Search"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
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
                label="Mode"
                value={filters.mode}
                onChange={(e) => setFilters((f) => ({ ...f, mode: e.target.value }))}
              >
                {MODES.map((m) => (
                  <option key={m || 'all'} value={m}>
                    {m ? labelize(m) : 'All modes'}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Status"
                value={filters.active}
                onChange={(e) => setFilters((f) => ({ ...f, active: e.target.value }))}
              >
                <option value="">All</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </FilterSelect>
            </div>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                loadRoutes();
              }}
              className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
            >
              Apply
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,400px)]">
            <div>
              {!data.items?.length ? (
                <EmptyState message="No transport routes found." />
              ) : (
                <ul className="space-y-2" aria-label="Transport routes">
                  {data.items.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => openRoute(r.id)}
                        className={`w-full rounded-xl border p-3 text-left ${
                          selectedId === r.id
                            ? 'border-brand-600 bg-brand-50'
                            : 'border-surface-border bg-white hover:border-brand-300'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{r.name}</p>
                            <p className="text-xs text-ink-muted">
                              {r.origin?.name || '—'} → {r.destination?.name || '—'}
                              {r.mode ? ` · ${labelize(r.mode)}` : ''}
                              {r.stopCount ? ` · ${r.stopCount} stops` : ''}
                            </p>
                          </div>
                          <StatusPill status={r.isActive ? 'active' : 'inactive'} />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />
            </div>

            <aside className="space-y-3 rounded-xl border border-surface-border bg-white p-3 lg:sticky lg:top-4 lg:self-start">
              {!route ? (
                <p className="text-sm text-ink-muted">Select a route to inspect stops and fares.</p>
              ) : (
                <>
                  <div>
                    <h2 className="text-lg font-bold">{route.name}</h2>
                    <p className="text-xs text-ink-muted">
                      {route.origin?.name} → {(route.stops || []).map((s) => s.label).filter(Boolean).join(' → ')}
                      {(route.stops || []).length ? ' → ' : ''}
                      {route.destination?.name}
                    </p>
                  </div>
                  <RouteMap points={detail.mapPoints} />
                  {detail.fareVariation ? (
                    <div className="rounded-lg bg-surface-muted/50 p-2 text-xs">
                      <p className="font-semibold">Fare variation (observations)</p>
                      <p>
                        {formatNaira(detail.fareVariation.min)}
                        {detail.fareVariation.spread > 0
                          ? ` – ${formatNaira(detail.fareVariation.max)} (${detail.fareVariation.count} reports)`
                          : ` · ${detail.fareVariation.count} report(s)`}
                      </p>
                      <p className="mt-1 text-ink-muted">{detail.note}</p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-semibold text-ink-muted">Fare history</p>
                    <Sparkline points={detail.fareHistoryPoints || []} />
                    <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs">
                      {(detail.fares || []).slice(0, 12).map((f) => (
                        <li key={f.id}>
                          {formatNaira(f.fare?.amount)} · {f.trustLabel} · {f.freshness} ·{' '}
                          {f.createdAt ? new Date(f.createdAt).toLocaleDateString('en-NG') : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {canEdit && editForm ? (
                    <form onSubmit={saveRoute} className="space-y-2 border-t border-surface-border pt-3">
                      <FilterInput
                        label="Route name"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      />
                      <FilterSelect
                        label="Primary mode"
                        value={editForm.primaryMode}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, primaryMode: e.target.value }))
                        }
                      >
                        <option value="">Unset</option>
                        {MODES.filter(Boolean).map((m) => (
                          <option key={m} value={m}>
                            {labelize(m)}
                          </option>
                        ))}
                      </FilterSelect>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editForm.isActive}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, isActive: e.target.checked }))
                          }
                        />
                        Active
                      </label>
                      <FilterInput
                        label="Reason (required)"
                        required
                        value={editForm.reason}
                        onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
                      />
                      <button
                        type="submit"
                        disabled={busy === 'save'}
                        className="w-full rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {busy === 'save' ? 'Saving…' : 'Save route'}
                      </button>
                    </form>
                  ) : null}
                  {canEdit ? (
                    <ConfirmAction
                      label={route.isActive ? 'Deactivate route' : 'Activate route'}
                      danger={route.isActive}
                      onConfirm={async (reason) => {
                        await adminApi.patchTransportRoute(route.id, {
                          isActive: !route.isActive,
                          reason,
                        });
                        await openRoute(route.id);
                        loadRoutes();
                        loadDashboard();
                      }}
                    />
                  ) : null}
                </>
              )}
            </aside>
          </div>
        </>
      ) : null}

      {tab === 'stops' ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <FilterInput label="Search stops" value={stopQ} onChange={(e) => setStopQ(e.target.value)} />
            <button
              type="button"
              onClick={() => setStopPage(1)}
              className="self-end rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
            >
              Search
            </button>
          </div>
          {!stops.items?.length ? (
            <EmptyState message="No bus stops found." />
          ) : (
            <ul className="space-y-2">
              {stops.items.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-surface-border bg-white p-3"
                >
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-ink-muted">
                    {s.routeName} · stop #{s.stopOrder}
                    {[s.area, s.lga, s.state].filter(Boolean).length
                      ? ` · ${[s.area, s.lga, s.state].filter(Boolean).join(' · ')}`
                      : ''}
                    {s.coordinates
                      ? ` · ${s.coordinates.lat.toFixed(4)}, ${s.coordinates.lng.toFixed(4)}`
                      : ' · no coordinates'}
                  </p>
                  {canEdit ? (
                    <div className="mt-2">
                      <ConfirmAction
                        label="Update label"
                        onConfirm={async (reason) => {
                          const next = window.prompt('New stop label', s.label || s.name);
                          if (next == null) return;
                          await adminApi.patchTransportStop(s.id, {
                            label: next.trim(),
                            reason,
                          });
                          const refreshed = await adminApi.transportStops({
                            q: stopQ,
                            page: stopPage,
                            limit: 30,
                          });
                          setStops(refreshed);
                        }}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={stopPage}
            total={stops.total}
            limit={stops.limit}
            onPage={setStopPage}
          />
        </div>
      ) : null}

      {tab === 'fares' ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <FilterInput
              label="Search"
              value={fareFilters.q}
              onChange={(e) => setFareFilters((f) => ({ ...f, q: e.target.value }))}
            />
            <FilterSelect
              label="Mode"
              value={fareFilters.mode}
              onChange={(e) => setFareFilters((f) => ({ ...f, mode: e.target.value }))}
            >
              {MODES.map((m) => (
                <option key={m || 'all'} value={m}>
                  {m ? labelize(m) : 'All modes'}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Source"
              value={fareFilters.sourceType}
              onChange={(e) => setFareFilters((f) => ({ ...f, sourceType: e.target.value }))}
            >
              <option value="">All</option>
              <option value="community">Community</option>
              <option value="official">Official</option>
            </FilterSelect>
            <FilterSelect
              label="Freshness"
              value={fareFilters.freshness}
              onChange={(e) => setFareFilters((f) => ({ ...f, freshness: e.target.value }))}
            >
              <option value="">Any</option>
              <option value="fresh">Fresh</option>
              <option value="stale">Stale</option>
              <option value="expired">Expired</option>
            </FilterSelect>
          </div>
          <p className="text-xs text-ink-muted">
            {fares.note || 'Observations are append-only. Moderate via Moderation Center.'}{' '}
            <Link href="/admin/moderation" className="text-brand-700 underline">
              Open Moderation
            </Link>
          </p>
          {!fares.items?.length ? (
            <EmptyState message="No fare observations found." />
          ) : (
            <ul className="space-y-2">
              {fares.items.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-col gap-1 rounded-xl border border-surface-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold">
                      {formatNaira(f.fare?.amount)} · {f.origin} → {f.destination}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {f.routeName} · {labelize(f.mode)} · {f.trustLabel} · {f.authorDisplayName || '—'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <StatusPill status={f.freshness} />
                    <StatusPill status={f.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Pagination page={farePage} total={fares.total} limit={fares.limit} onPage={setFarePage} />
        </div>
      ) : null}

      {tab === 'conflicts' ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-surface-border bg-white p-3">
            <h3 className="font-semibold">Conflicting fare observations</h3>
            <p className="text-xs text-ink-muted">
              {conflicts?.note || 'Variation shown for review — no automatic correct fare.'}
            </p>
            <ul className="mt-2 space-y-2">
              {(conflicts?.items || []).map((c) => (
                <li key={`${c.routeId}-${c.mode}`} className="text-sm">
                  <button
                    type="button"
                    className="font-medium text-brand-700 underline"
                    onClick={() => {
                      setTab('routes');
                      openRoute(c.routeId);
                    }}
                  >
                    {c.routeName}
                  </button>{' '}
                  · {labelize(c.mode)} · {formatNaira(c.min)}–{formatNaira(c.max)} (
                  {c.observationCount} reports)
                  {c.recentAmounts?.length ? (
                    <span className="block text-xs text-ink-muted">
                      Recent: {c.recentAmounts.map((a) => formatNaira(a)).join(', ')}
                    </span>
                  ) : null}
                </li>
              ))}
              {!conflicts?.items?.length ? (
                <li className="text-sm text-ink-muted">No material conflicts in the window.</li>
              ) : null}
            </ul>
          </section>
          <section className="rounded-xl border border-surface-border bg-white p-3">
            <h3 className="font-semibold">Duplicate candidates</h3>
            <p className="text-xs text-ink-muted">{duplicates?.note}</p>
            <p className="mt-2 text-xs font-semibold text-ink-muted">Corridors</p>
            <ul className="text-sm">
              {(duplicates?.duplicateCorridors || []).map((d) => (
                <li key={`${d.originId}-${d.destinationId}`}>
                  {d.originName} → {d.destinationName} · {d.count} records
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-semibold text-ink-muted">Similar stop names</p>
            <ul className="text-sm">
              {(duplicates?.similarStopNames || []).map((d) => (
                <li key={d.nameKey}>
                  {d.displayName} · {d.count}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === 'directoryStops' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <FilterInput
              label="Search stops"
              value={dirStopQ}
              onChange={(e) => setDirStopQ(e.target.value)}
            />
            {canEdit ? (
              <button
                type="button"
                className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold"
                onClick={() => setCreateStopOpen((v) => !v)}
              >
                {createStopOpen ? 'Cancel' : 'Add stop'}
              </button>
            ) : null}
          </div>
          {createStopOpen ? (
            <form
              onSubmit={createDirectoryStop}
              className="grid gap-2 rounded-xl border border-surface-border bg-white p-3 sm:grid-cols-2"
            >
              <FilterInput
                label="Name"
                value={newStop.name}
                onChange={(e) => setNewStop((f) => ({ ...f, name: e.target.value }))}
              />
              <FilterInput
                label="Aliases (comma-separated)"
                value={newStop.aliases}
                onChange={(e) => setNewStop((f) => ({ ...f, aliases: e.target.value }))}
              />
              <button
                type="submit"
                disabled={busy === 'create-stop'}
                className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
              >
                Save stop
              </button>
            </form>
          ) : null}
          <ul className="space-y-2">
            {(directoryStops.items || []).map((s) => (
              <li key={s.id} className="rounded-xl border border-surface-border bg-white p-3 text-sm">
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-ink-muted">
                  {[s.locationName, s.lgaName, s.stateName].filter(Boolean).join(' · ') || 'No location'}
                  {s.aliases?.length ? ` · aliases: ${s.aliases.join(', ')}` : ''}
                  {` · ${s.routeLinks || 0} route links`}
                </p>
              </li>
            ))}
            {!directoryStops.items?.length ? (
              <EmptyState message="No directory stops yet. Add commonly used boarding points." />
            ) : null}
          </ul>
          <Pagination
            page={dirStopPage}
            total={directoryStops.total}
            limit={directoryStops.limit}
            onPage={setDirStopPage}
          />
        </div>
      ) : null}

      {tab === 'anomalies' ? (
        <div className="rounded-xl border border-surface-border bg-white p-3">
          <h3 className="font-semibold">Fare anomalies</h3>
          <p className="text-xs text-ink-muted">
            {anomalies?.note ||
              'Outliers vs recent median — review only; never auto-deleted.'}
          </p>
          <ul className="mt-3 space-y-2">
            {(anomalies?.items || []).map((a) => (
              <li key={a.id} className="text-sm">
                <button
                  type="button"
                  className="font-medium text-brand-700 underline"
                  onClick={() => {
                    setTab('routes');
                    openRoute(a.routeId);
                  }}
                >
                  {a.routeName}
                </button>{' '}
                · {formatNaira(a.amount)} vs median {formatNaira(a.medianFare)} ({a.peerCount} peers)
                <span className="block text-xs text-amber-900">{a.flagReason}</span>
              </li>
            ))}
            {!anomalies?.items?.length ? (
              <li className="text-sm text-ink-muted">No outliers in the review window.</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {tab === 'quality' && quality ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(quality.counts || {}).map(([k, v]) => (
              <AdminCard key={k} title={labelize(k)} value={v} />
            ))}
          </div>
          <section className="rounded-xl border border-surface-border bg-white p-3">
            <h3 className="font-semibold">Stale routes (90d without fare updates)</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {(quality.staleRoutes || []).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="text-brand-700 underline"
                    onClick={() => {
                      setTab('routes');
                      openRoute(r.id);
                    }}
                  >
                    {r.name || `${r.origin_name} → ${r.destination_name}`}
                  </button>
                </li>
              ))}
              {!quality.staleRoutes?.length ? (
                <li className="text-ink-muted">None.</li>
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}
    </div>
  );
}
