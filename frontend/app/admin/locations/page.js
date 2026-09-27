'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminApi, ApiError, locationsApi } from '@/lib/api';
import {
  AdminPageHeader,
  useAdmin,
} from '@/components/admin/AdminContext';
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
  { id: 'overview', label: 'Overview' },
  { id: 'tree', label: 'Hierarchy' },
  { id: 'search', label: 'Search' },
  { id: 'duplicates', label: 'Duplicates' },
  { id: 'unresolved', label: 'Unresolved' },
  { id: 'geocoding', label: 'Geocoding' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'state', label: 'State' },
  { value: 'lga', label: 'LGA' },
  { value: 'city', label: 'City / town' },
  { value: 'area', label: 'Area' },
  { value: 'road', label: 'Road' },
  { value: 'landmark', label: 'Landmark' },
  { value: 'place', label: 'Place' },
];

function MetricGrid({ dashboard }) {
  if (!dashboard) return null;
  const cards = [
    ['States', dashboard.states],
    ['LGAs', dashboard.lgas],
    ['Cities / towns', dashboard.cities],
    ['Areas', dashboard.areas],
    ['Roads', dashboard.roads],
    ['Places / landmarks', dashboard.places],
    ['Bus stops', dashboard.busStops],
    ['Inactive', dashboard.inactive],
    ['Pending review', dashboard.pendingReview],
    ['Pending verification', dashboard.pendingVerification],
    ['Unresolved queries', dashboard.unresolvedQueries],
    ['Open conflicts', dashboard.openConflicts],
    ['Missing coordinates', dashboard.missingCoordinates],
    ['Duplicate groups', dashboard.duplicateGroups],
  ];
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map(([title, value]) => (
        <AdminCard key={title} title={title} value={value ?? 0} />
      ))}
    </div>
  );
}

function OsmMap({ lat, lng, name }) {
  if (lat == null || lng == null) {
    return (
      <div className="rounded-lg border border-dashed border-surface-border bg-surface-muted/40 px-3 py-8 text-center text-xs text-ink-muted">
        No coordinates on file for this location.
      </div>
    );
  }
  const delta = 0.02;
  const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`;
  const marker = `${lat}%2C${lng}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
  return (
    <div className="overflow-hidden rounded-lg border border-surface-border">
      <iframe
        title={`Map of ${name || 'location'}`}
        src={src}
        className="h-48 w-full border-0 sm:h-56"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <p className="border-t border-surface-border bg-surface-muted/40 px-3 py-1.5 text-[11px] text-ink-muted">
        {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)} · OpenStreetMap embed
      </p>
    </div>
  );
}

function TreeNode({ node, depth, selectedId, onSelect, loadChildren }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState(null);
  const [loading, setLoading] = useState(false);
  const panelId = useId();

  async function toggle() {
    if (!node.hasChildren) {
      onSelect(node.id);
      return;
    }
    const next = !open;
    setOpen(next);
    onSelect(node.id);
    if (next && children == null) {
      setLoading(true);
      try {
        const data = await loadChildren(node.id);
        setChildren(data.items || []);
      } catch {
        setChildren([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <li>
      <div
        className={`flex items-stretch gap-1 rounded-lg ${
          selectedId === node.id ? 'bg-brand-50 ring-1 ring-brand-300' : ''
        }`}
        style={{ paddingLeft: Math.min(depth, 6) * 12 }}
      >
        <button
          type="button"
          aria-expanded={node.hasChildren ? open : undefined}
          aria-controls={node.hasChildren ? panelId : undefined}
          onClick={toggle}
          className="flex min-h-10 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
        >
          <span className="w-4 shrink-0 text-ink-muted" aria-hidden>
            {node.hasChildren ? (open ? '▾' : '▸') : '·'}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-muted">
            {node.type}
            {node.childCount != null ? ` · ${node.childCount}` : ''}
          </span>
          <StatusPill status={node.status || 'unknown'} />
        </button>
      </div>
      {open && node.hasChildren ? (
        <ul id={panelId} role="group" className="mt-0.5 space-y-0.5">
          {loading ? (
            <li className="px-3 py-1 text-xs text-ink-muted" style={{ paddingLeft: (depth + 1) * 12 }}>
              Loading…
            </li>
          ) : null}
          {(children || []).map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              loadChildren={loadChildren}
            />
          ))}
          {!loading && children?.length === 0 ? (
            <li className="px-3 py-1 text-xs text-ink-muted" style={{ paddingLeft: (depth + 1) * 12 }}>
              No children
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

export default function AdminLocationsPage() {
  const searchParams = useSearchParams();
  const { can } = useAdmin();
  const canEdit = can('locations_edit');

  const [tab, setTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ q: '', type: '', status: '', stateId: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 40 });
  const [states, setStates] = useState([]);
  const [treeRoots, setTreeRoots] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [duplicates, setDuplicates] = useState(null);
  const [unresolved, setUnresolved] = useState({ items: [], total: 0 });
  const [geocodeHealth, setGeocodeHealth] = useState(null);
  const [searchMetrics, setSearchMetrics] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [aliasDraft, setAliasDraft] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    mode: 'area',
    name: '',
    lgaId: '',
    parentId: '',
    type: 'road',
    latitude: '',
    longitude: '',
    reason: '',
  });

  const loadDashboard = useCallback(() => {
    adminApi
      .locationDashboard()
      .then((d) => setDashboard(d.dashboard || null))
      .catch(() => setDashboard(null));
  }, []);

  const loadList = useCallback(() => {
    setError('');
    adminApi
      .locations({ ...filters, page, limit: 40 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load locations'));
  }, [filters, page]);

  const loadTree = useCallback(() => {
    setError('');
    setTreeLoading(true);
    return adminApi
      .locationTree({})
      .then((d) => {
        const items = Array.isArray(d?.items) ? d.items : [];
        setTreeRoots(items);
        if (!items.length) {
          setError('Hierarchy returned no state roots. Check geography seed/import.');
        }
      })
      .catch((err) => {
        setTreeRoots([]);
        setError(err instanceof ApiError ? err.message : 'Failed to load hierarchy');
      })
      .finally(() => setTreeLoading(false));
  }, []);

  const loadDuplicates = useCallback(() => {
    adminApi
      .locationDuplicates({ limit: 40 })
      .then((d) => setDuplicates(d.duplicates || null))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load duplicates'));
  }, []);

  const loadUnresolved = useCallback(() => {
    adminApi
      .unresolvedLocations({ status: 'open', limit: 40 })
      .then((d) => setUnresolved({ items: d.items || [], total: d.total || 0 }))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load unresolved'));
  }, []);

  const loadGeocoding = useCallback(() => {
    Promise.all([
      adminApi.geocodingHealth({ hours: 24 }),
      adminApi.locationSearchMetrics({ limit: 30 }),
    ])
      .then(([h, m]) => {
        setGeocodeHealth(h.health || null);
        setSearchMetrics(m.items || []);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load geocoding health'));
  }, []);

  useEffect(() => {
    loadDashboard();
    locationsApi
      .states()
      .then((d) => setStates(d.states || []))
      .catch(() => {});
  }, [loadDashboard]);

  useEffect(() => {
    if (tab === 'search' || tab === 'overview') loadList();
    if (tab === 'tree') loadTree();
    if (tab === 'duplicates') loadDuplicates();
    if (tab === 'unresolved') loadUnresolved();
    if (tab === 'geocoding') loadGeocoding();
  }, [tab, loadList, loadTree, loadDuplicates, loadUnresolved, loadGeocoding]);

  async function resolveUnresolved(item) {
    if (!canEdit) return;
    const locationId = window.prompt('Map to location UUID (or leave blank to reject):');
    const reason = window.prompt('Reason for this resolution?');
    if (!reason || reason.trim().length < 3) return;
    setBusy('resolve');
    try {
      await adminApi.resolveLocationQueue(item.id, {
        status: locationId?.trim() ? 'mapped' : 'rejected',
        locationId: locationId?.trim() || undefined,
        alias: locationId?.trim() ? item.rawQuery : undefined,
        reason: reason.trim(),
      });
      loadUnresolved();
      loadDashboard();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to resolve');
    } finally {
      setBusy('');
    }
  }

  async function verifySelected() {
    if (!selected || !canEdit) return;
    const reason = window.prompt('Reason for verifying this location?');
    if (!reason || reason.trim().length < 3) return;
    setBusy('verify');
    try {
      await adminApi.verifyLocation(selected, {
        verificationStatus: 'verified',
        confidence: 'high',
        reason: reason.trim(),
      });
      await openDetail(selected);
      loadDashboard();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setBusy('');
    }
  }

  async function openDetail(id) {
    if (!id) return;
    setBusy(id);
    setError('');
    try {
      const d = await adminApi.location(id);
      setSelected(id);
      setDetail(d);
      const loc = d.location;
      setEditForm({
        name: loc.name || '',
        status: loc.status || 'active',
        notes: loc.notes || '',
        latitude: loc.coordinates?.lat ?? '',
        longitude: loc.coordinates?.lng ?? '',
        parentId: loc.parentId || '',
        reason: '',
      });
      setAliasDraft('');
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
        document.getElementById('location-detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load location');
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    const focus = searchParams.get('focus');
    if (focus) {
      setTab('search');
      openDetail(focus);
    }
  }, [searchParams]);

  async function saveEdit(e) {
    e.preventDefault();
    if (!selected || !editForm || !canEdit) return;
    setBusy('save');
    setError('');
    try {
      await adminApi.patchLocation(selected, {
        name: editForm.name,
        status: editForm.status,
        notes: editForm.notes,
        latitude: editForm.latitude === '' ? null : editForm.latitude,
        longitude: editForm.longitude === '' ? null : editForm.longitude,
        parentId: editForm.parentId || undefined,
        reason: editForm.reason || 'Admin location correction',
      });
      await openDetail(selected);
      loadDashboard();
      if (tab === 'search' || tab === 'overview') loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy('');
    }
  }

  async function toggleStatus(next, reason) {
    if (!selected || !canEdit) return;
    setBusy('status');
    try {
      if (next === 'inactive') await adminApi.deactivateLocation(selected, { reason });
      else await adminApi.activateLocation(selected, { reason });
      await openDetail(selected);
      loadDashboard();
      loadList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Status update failed');
    } finally {
      setBusy('');
    }
  }

  async function addAlias(e) {
    e.preventDefault();
    if (!selected || !canEdit || !aliasDraft.trim()) return;
    setBusy('alias');
    try {
      await adminApi.addLocationAlias(selected, {
        alias: aliasDraft.trim(),
        reason: 'Admin alias for search',
      });
      setAliasDraft('');
      await openDetail(selected);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Alias failed');
    } finally {
      setBusy('');
    }
  }

  async function removeAlias(aliasId) {
    if (!selected || !canEdit) return;
    setBusy('alias');
    try {
      await adminApi.removeLocationAlias(selected, aliasId, { reason: 'Alias removed' });
      await openDetail(selected);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Remove alias failed');
    } finally {
      setBusy('');
    }
  }

  async function createRecord(e) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy('create');
    setError('');
    try {
      if (createForm.mode === 'area') {
        await adminApi.createLocationArea({
          name: createForm.name,
          lgaId: createForm.lgaId,
          latitude: createForm.latitude || null,
          longitude: createForm.longitude || null,
          reason: createForm.reason || 'Admin-verified area',
        });
      } else {
        await adminApi.createLocationChild({
          name: createForm.name,
          type: createForm.type,
          parentId: createForm.parentId || selected,
          latitude: createForm.latitude || null,
          longitude: createForm.longitude || null,
          reason: createForm.reason || 'Admin-verified child',
        });
      }
      setShowCreate(false);
      setCreateForm({
        mode: 'area',
        name: '',
        lgaId: '',
        parentId: '',
        type: 'road',
        latitude: '',
        longitude: '',
        reason: '',
      });
      loadDashboard();
      loadList();
      if (selected) await openDetail(selected);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Create failed');
    } finally {
      setBusy('');
    }
  }

  const loc = detail?.location;
  const usage = loc?.usage;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        breadcrumb="Data"
        title="Location & Geographic Management"
        subtitle="Authoritative Nigeria hierarchy for selection, resolution, traffic, fuel, transport, prices, alerts, and search. Prefer deactivation over deletion."
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              {showCreate ? 'Cancel' : 'Add location'}
            </button>
          ) : null
        }
      />

      <MetricGrid dashboard={dashboard} />

      {showCreate && canEdit ? (
        <form
          onSubmit={createRecord}
          className="grid gap-2 rounded-xl border border-surface-border bg-white p-4 sm:grid-cols-2"
        >
          <FilterSelect
            label="Create"
            value={createForm.mode}
            onChange={(e) => setCreateForm((f) => ({ ...f, mode: e.target.value }))}
          >
            <option value="area">Verified area under LGA</option>
            <option value="child">Road / landmark / place / city under parent</option>
          </FilterSelect>
          <FilterInput
            label="Name"
            required
            value={createForm.name}
            onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
          />
          {createForm.mode === 'area' ? (
            <FilterInput
              label="Parent LGA id"
              required
              value={createForm.lgaId}
              onChange={(e) => setCreateForm((f) => ({ ...f, lgaId: e.target.value }))}
              placeholder="UUID of existing LGA (areas / lgas table)"
            />
          ) : (
            <>
              <FilterSelect
                label="Type"
                value={createForm.type}
                onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="road">Road</option>
                <option value="landmark">Landmark</option>
                <option value="place">Place</option>
                <option value="city">City / town</option>
              </FilterSelect>
              <FilterInput
                label="Parent location id"
                required={!selected}
                value={createForm.parentId}
                onChange={(e) => setCreateForm((f) => ({ ...f, parentId: e.target.value }))}
                placeholder={selected ? `Defaults to selected (${selected})` : 'UUID'}
              />
            </>
          )}
          <FilterInput
            label="Latitude (optional)"
            value={createForm.latitude}
            onChange={(e) => setCreateForm((f) => ({ ...f, latitude: e.target.value }))}
          />
          <FilterInput
            label="Longitude (optional)"
            value={createForm.longitude}
            onChange={(e) => setCreateForm((f) => ({ ...f, longitude: e.target.value }))}
          />
          <FilterInput
            label="Reason"
            value={createForm.reason}
            onChange={(e) => setCreateForm((f) => ({ ...f, reason: e.target.value }))}
            className="sm:col-span-2"
          />
          <button
            type="submit"
            disabled={busy === 'create'}
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white sm:col-span-2"
          >
            Create
          </button>
        </form>
      ) : null}

      <div
        role="tablist"
        aria-label="Location views"
        className="flex gap-1 overflow-x-auto rounded-xl border border-surface-border bg-white p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 ${
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="min-w-0 space-y-3">
          {tab === 'overview' || tab === 'search' ? (
            <>
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
                className={`grid gap-2 rounded-xl border border-surface-border bg-white p-3 sm:grid-cols-2 lg:grid-cols-5 ${
                  filtersOpen ? '' : 'hidden md:grid'
                }`}
              >
                <FilterInput
                  label="Search"
                  value={filters.q}
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                  placeholder="Name or alias"
                />
                <FilterSelect
                  label="Type"
                  value={filters.type}
                  onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FilterSelect>
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
                  label="Status"
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="draft">Pending review</option>
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

              {/* Mobile cards */}
              <ul className="space-y-2 md:hidden">
                {!data.items?.length ? (
                  <EmptyState message="No locations found." />
                ) : (
                  data.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openDetail(item.id)}
                        className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${
                          selected === item.id
                            ? 'border-brand-400 bg-brand-50'
                            : 'border-surface-border bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold">{item.name}</p>
                          <StatusPill status={item.status || 'unknown'} />
                        </div>
                        <p className="mt-1 text-xs text-ink-muted">
                          {item.type}
                          {item.stateName ? ` · ${item.stateName}` : ''}
                          {item.lgaName ? ` · ${item.lgaName}` : ''}
                          {item.childCount != null ? ` · ${item.childCount} children` : ''}
                        </p>
                      </button>
                    </li>
                  ))
                )}
              </ul>

              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-xl border border-surface-border bg-white md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-surface-border bg-surface-muted/50 text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Type</th>
                      <th className="px-3 py-2 font-semibold">Context</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">Children</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!data.items?.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-ink-muted">
                          No locations found.
                        </td>
                      </tr>
                    ) : (
                      data.items.map((item) => (
                        <tr
                          key={item.id}
                          className={`cursor-pointer border-b border-surface-border/70 hover:bg-brand-50/40 ${
                            selected === item.id ? 'bg-brand-50' : ''
                          }`}
                          onClick={() => openDetail(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openDetail(item.id);
                            }
                          }}
                          tabIndex={0}
                        >
                          <td className="px-3 py-2 font-medium">{item.name}</td>
                          <td className="px-3 py-2 capitalize text-ink-muted">{item.type}</td>
                          <td className="px-3 py-2 text-xs text-ink-muted">
                            {[item.stateName, item.lgaName, item.areaName].filter(Boolean).join(' · ') ||
                              '—'}
                          </td>
                          <td className="px-3 py-2">
                            <StatusPill status={item.status || 'unknown'} />
                          </td>
                          <td className="px-3 py-2 tabular-nums text-ink-muted">
                            {item.childCount ?? '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />
            </>
          ) : null}

          {tab === 'tree' ? (
            <div className="rounded-xl border border-surface-border bg-white p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Nigeria → State → LGA → …
              </p>
              {treeLoading ? (
                <p className="px-2 py-6 text-sm text-ink-muted">Loading hierarchy…</p>
              ) : !treeRoots.length ? (
                <EmptyState message="No state roots available." />
              ) : (
                <ul role="tree" aria-label="Geographic hierarchy" className="space-y-0.5">
                  {treeRoots.map((node) => (
                    <TreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedId={selected}
                      onSelect={openDetail}
                      loadChildren={(parentId) => adminApi.locationTree({ parentId })}
                    />
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === 'duplicates' ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">
                {duplicates?.note ||
                  'Candidates for human review only — nothing is auto-merged or deleted.'}
              </p>
              <div className="rounded-xl border border-surface-border bg-white p-3">
                <h2 className="text-sm font-bold">Same name under same parent</h2>
                {!duplicates?.sameNameSameParent?.length ? (
                  <p className="mt-2 text-xs text-ink-muted">No name-duplicate groups found.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {duplicates.sameNameSameParent.map((g) => (
                      <li
                        key={`${g.parentId}-${g.type}-${g.normalizedName}`}
                        className="rounded-lg border border-surface-border px-3 py-2 text-sm"
                      >
                        <p className="font-semibold">
                          {g.normalizedName}{' '}
                          <span className="text-xs font-normal text-ink-muted">
                            · {g.type} · {g.count} records
                          </span>
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(g.ids || []).map((id, i) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => openDetail(id)}
                              className="rounded bg-surface-muted px-2 py-0.5 text-xs hover:bg-brand-50"
                            >
                              {(g.names && g.names[i]) || id.slice(0, 8)}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-surface-border bg-white p-3">
                <h2 className="text-sm font-bold">Near-duplicate coordinates</h2>
                {!duplicates?.nearDuplicateCoordinates?.length ? (
                  <p className="mt-2 text-xs text-ink-muted">No near-coordinate pairs found.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {duplicates.nearDuplicateCoordinates.map((pair) => (
                      <li
                        key={`${pair.a.id}-${pair.b.id}`}
                        className="rounded-lg border border-surface-border px-3 py-2 text-sm"
                      >
                        <button
                          type="button"
                          className="font-medium text-brand-800 underline-offset-2 hover:underline"
                          onClick={() => openDetail(pair.a.id)}
                        >
                          {pair.a.name}
                        </button>
                        <span className="text-ink-muted"> ↔ </span>
                        <button
                          type="button"
                          className="font-medium text-brand-800 underline-offset-2 hover:underline"
                          onClick={() => openDetail(pair.b.id)}
                        >
                          {pair.b.name}
                        </button>
                        <p className="mt-1 text-xs text-ink-muted">
                          {pair.a.type} · {pair.coordinates.lat.toFixed(5)},{' '}
                          {pair.coordinates.lng.toFixed(5)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          {tab === 'unresolved' ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">
                Vague or unmatched queries for human triage. Do not auto-create places from every
                string.
              </p>
              {!unresolved.items?.length ? (
                <EmptyState title="No open unresolved queries" />
              ) : (
                <ul className="space-y-2">
                  {unresolved.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl border border-surface-border bg-white px-3 py-2 text-sm"
                    >
                      <p className="font-semibold text-ink">{item.rawQuery}</p>
                      <p className="text-xs text-ink-muted">
                        Hits: {item.hitCount}
                        {item.queryContext ? ` · ${item.queryContext}` : ''}
                      </p>
                      {canEdit ? (
                        <button
                          type="button"
                          disabled={busy === 'resolve'}
                          onClick={() => resolveUnresolved(item)}
                          className="mt-2 rounded-lg border border-surface-border px-2 py-1 text-xs font-semibold"
                        >
                          Resolve / map
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === 'geocoding' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-surface-border bg-white p-3 text-sm">
                <h2 className="text-sm font-bold">Geocoding health</h2>
                {!geocodeHealth ? (
                  <p className="mt-2 text-xs text-ink-muted">No health data yet.</p>
                ) : (
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    <div>
                      <dt className="text-ink-muted">Provider</dt>
                      <dd className="font-semibold">{geocodeHealth.provider}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Requests (24h)</dt>
                      <dd className="font-semibold">{geocodeHealth.requestCount}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Success rate</dt>
                      <dd className="font-semibold">
                        {geocodeHealth.successRate != null
                          ? `${Math.round(geocodeHealth.successRate * 100)}%`
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Avg latency</dt>
                      <dd className="font-semibold">{geocodeHealth.avgLatencyMs} ms</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Cache entries</dt>
                      <dd className="font-semibold">{geocodeHealth.activeCacheEntries}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Last success</dt>
                      <dd className="font-semibold">
                        {geocodeHealth.lastSuccessAt
                          ? new Date(geocodeHealth.lastSuccessAt).toLocaleString()
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                )}
                <p className="mt-2 text-[11px] text-ink-muted">
                  {geocodeHealth?.note || 'Provider secrets are never shown.'}
                </p>
              </div>
              <div className="rounded-xl border border-surface-border bg-white p-3 text-sm">
                <h2 className="text-sm font-bold">Frequent / unresolved searches</h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Anonymized metrics only — no personal location history.
                </p>
                {!searchMetrics.length ? (
                  <p className="mt-2 text-xs text-ink-muted">No search metrics yet.</p>
                ) : (
                  <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto text-xs">
                    {searchMetrics.map((m) => (
                      <li
                        key={m.query}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted/50 px-2 py-1.5"
                      >
                        <span className="font-medium text-ink">{m.query}</span>
                        <span className="text-ink-muted">
                          {m.hitCount} hits · {m.resultCount} results
                          {m.unresolved ? ' · unresolved' : ''}
                          {m.ambiguous ? ' · ambiguous' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div
          id="location-detail-panel"
          className="min-w-0 rounded-xl border border-surface-border bg-white p-4 shadow-sm"
        >
          {!loc ? (
            <p className="text-sm text-ink-muted">
              Select a location from the list, hierarchy, or duplicates to inspect hierarchy, map,
              dependencies, and corrections.
            </p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">{loc.name}</h2>
                  <p className="text-xs text-ink-muted">
                    {loc.type}
                    {loc.stateName ? ` · ${loc.stateName}` : ''}
                    {loc.lgaName ? ` · ${loc.lgaName}` : ''}
                  </p>
                </div>
                <StatusPill status={loc.status} />
              </div>

              {detail.breadcrumb?.length ? (
                <nav aria-label="Hierarchy breadcrumb" className="flex flex-wrap items-center gap-1 text-xs">
                  {detail.breadcrumb.map((crumb, i) => (
                    <span key={crumb.id} className="inline-flex items-center gap-1">
                      {i > 0 ? <span className="text-ink-muted">→</span> : null}
                      <button
                        type="button"
                        onClick={() => openDetail(crumb.id)}
                        className="rounded px-1 py-0.5 font-medium text-brand-800 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
                      >
                        {crumb.name}
                      </button>
                    </span>
                  ))}
                </nav>
              ) : null}

              <OsmMap
                lat={loc.coordinates?.lat}
                lng={loc.coordinates?.lng}
                name={loc.name}
              />

              {usage ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs">
                  <p className="font-semibold text-amber-950">
                    Impact preview · {usage.total} dependent record
                    {usage.total === 1 ? '' : 's'}
                  </p>
                  <ul className="mt-2 grid grid-cols-2 gap-1 text-amber-950/80 sm:grid-cols-3">
                    <li>Reports: {usage.reports}</li>
                    <li>Fuel: {usage.fuelStations}</li>
                    <li>Transport: {usage.transportRoutes}</li>
                    <li>Prices: {usage.pricePlaces}</li>
                    <li>Questions: {usage.questions}</li>
                    <li>Saved: {(usage.savedAreas || 0) + (usage.savedRoutes || 0)}</li>
                    <li>Children: {usage.childLocations}</li>
                    <li>Official: {usage.officialUpdates}</li>
                  </ul>
                  <p className="mt-2 text-amber-900/70">
                    {detail.canDelete
                      ? 'No content dependents — still prefer deactivation over deletion.'
                      : 'Deletion blocked. Soft-deactivate to preserve historical references.'}
                  </p>
                </div>
              ) : null}

              {canEdit && editForm ? (
                <form onSubmit={saveEdit} className="grid gap-2 sm:grid-cols-2">
                  <FilterInput
                    label="Name"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <FilterSelect
                    label="Status"
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="draft">Pending review</option>
                  </FilterSelect>
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
                    label="Parent location id"
                    value={editForm.parentId}
                    onChange={(e) => setEditForm((f) => ({ ...f, parentId: e.target.value }))}
                    className="sm:col-span-2"
                  />
                  <label className="block text-xs font-medium text-ink-muted sm:col-span-2">
                    Notes
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm text-ink"
                    />
                  </label>
                  <FilterInput
                    label="Correction reason (audit)"
                    required
                    value={editForm.reason}
                    onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
                    className="sm:col-span-2"
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
                {canEdit && loc.status === 'active' ? (
                  <ConfirmAction
                    label="Deactivate"
                    danger
                    disabled={busy === 'status'}
                    onConfirm={(reason) => toggleStatus('inactive', reason)}
                  />
                ) : null}
                {canEdit && loc.status !== 'active' ? (
                  <ConfirmAction
                    label="Activate"
                    disabled={busy === 'status'}
                    onConfirm={(reason) => toggleStatus('active', reason)}
                  />
                ) : null}
                {canEdit && loc.verificationStatus !== 'verified' ? (
                  <button
                    type="button"
                    disabled={busy === 'verify'}
                    onClick={verifySelected}
                    className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-900"
                  >
                    Mark verified
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-ink-muted">
                Verification: {loc.verificationStatus || 'unverified'} · Confidence:{' '}
                {loc.confidence || 'medium'}
              </p>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Aliases
                </p>
                {detail.aliases?.length ? (
                  <ul className="mt-1 space-y-1">
                    {detail.aliases.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-surface-muted/50 px-2 py-1 text-xs"
                      >
                        <span>{a.alias}</span>
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => removeAlias(a.id)}
                            className="text-red-700 hover:underline"
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
                  <form onSubmit={addAlias} className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={aliasDraft}
                      onChange={(e) => setAliasDraft(e.target.value)}
                      placeholder="Add alias (e.g. MMIA)"
                      aria-label="New alias"
                      className="min-w-0 flex-1 rounded-lg border border-surface-border px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={busy === 'alias' || !aliasDraft.trim()}
                      className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold"
                    >
                      Add
                    </button>
                  </form>
                ) : null}
              </div>

              {detail.children?.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Children
                  </p>
                  <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs">
                    {detail.children.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => openDetail(c.id)}
                          className="text-left text-brand-800 hover:underline"
                        >
                          {c.name} · {c.type} · {c.status}
                          {c.childCount ? ` · ${c.childCount}↓` : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-lg bg-surface-muted/60 p-3 text-xs">
                <p className="font-semibold text-ink">Provenance</p>
                <p className="mt-1 text-ink-muted">
                  {loc.provenance?.sourceName || 'No source recorded'}
                  {loc.provenance?.sourceType ? ` (${loc.provenance.sourceType})` : ''}
                </p>
                {loc.updatedAt ? (
                  <p className="mt-1 text-ink-muted">
                    Updated {new Date(loc.updatedAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
