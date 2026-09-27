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
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'observations', label: 'Observations' },
  { id: 'markets', label: 'Markets' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'quality', label: 'Data quality' },
  { id: 'sources', label: 'Sources' },
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

export default function AdminCommoditiesPage() {
  const { can } = useAdmin();
  const canEdit = can('commodities');

  const [tab, setTab] = useState('catalogue');
  const [dashboard, setDashboard] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [states, setStates] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const [catFilters, setCatFilters] = useState({ q: '', category: '', active: '' });
  const [catPage, setCatPage] = useState(1);
  const [catalogue, setCatalogue] = useState({ items: [], total: 0, limit: 50 });
  const [selectedCommodityId, setSelectedCommodityId] = useState(null);
  const [commodityDetail, setCommodityDetail] = useState(null);
  const [editCommodity, setEditCommodity] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    category: '',
    description: '',
    unitCode: 'kg',
    unitLabel: '1 kg',
    reason: '',
  });
  const [variantDraft, setVariantDraft] = useState({
    code: '',
    label: '',
    unitCode: '',
    displayName: '',
    reason: '',
  });

  const [obsFilters, setObsFilters] = useState({
    q: '',
    commodityId: '',
    category: '',
    stateId: '',
    market: '',
    sourceType: '',
    freshness: '',
    verification: '',
  });
  const [obsPage, setObsPage] = useState(1);
  const [observations, setObservations] = useState({ items: [], total: 0, limit: 30 });
  const [selectedObsId, setSelectedObsId] = useState(null);
  const [obsDetail, setObsDetail] = useState(null);
  const [obsEdit, setObsEdit] = useState(null);

  const [marketQ, setMarketQ] = useState('');
  const [marketPage, setMarketPage] = useState(1);
  const [markets, setMarkets] = useState({ items: [], total: 0, limit: 30 });
  const [conflicts, setConflicts] = useState(null);
  const [duplicates, setDuplicates] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [quality, setQuality] = useState(null);
  const [sources, setSources] = useState([]);
  const [mergeForm, setMergeForm] = useState({
    survivorPlaceId: '',
    mergedPlaceId: '',
    reason: '',
  });

  const loadDashboard = useCallback(() => {
    adminApi
      .commodityDashboard()
      .then((d) => setDashboard(d.dashboard || null))
      .catch(() => setDashboard(null));
  }, []);

  const loadCatalogue = useCallback(() => {
    setError('');
    adminApi
      .commodities({ ...catFilters, page: catPage, limit: 50 })
      .then((d) => {
        setCatalogue(d);
        if (d.categories) setCategories(d.categories);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load catalogue'));
  }, [catFilters, catPage]);

  const loadObservations = useCallback(() => {
    setError('');
    adminApi
      .commodityObservations({ ...obsFilters, page: obsPage, limit: 30 })
      .then(setObservations)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Failed to load observations')
      );
  }, [obsFilters, obsPage]);

  useEffect(() => {
    loadDashboard();
    adminApi
      .commodityCategories()
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});
    locationsApi
      .states()
      .then((d) => setStates(d.states || []))
      .catch(() => {});
  }, [loadDashboard]);

  useEffect(() => {
    if (tab === 'catalogue') loadCatalogue();
    if (tab === 'observations') loadObservations();
    if (tab === 'markets') {
      adminApi
        .commodityMarkets({ q: marketQ, page: marketPage, limit: 30 })
        .then(setMarkets)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load markets'));
    }
    if (tab === 'conflicts') {
      Promise.all([
        adminApi.commodityConflicts({ limit: 40 }),
        adminApi.commodityDuplicates({ limit: 40 }),
      ])
        .then(([c, d]) => {
          setConflicts(c.conflicts || null);
          setDuplicates(d.duplicates || null);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load conflicts'));
    }
    if (tab === 'anomalies') {
      adminApi
        .commodityAnomalies({ limit: 40 })
        .then((d) => setAnomalies(d.anomalies || null))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load anomalies'));
    }
    if (tab === 'quality') {
      adminApi
        .commodityQuality()
        .then((d) => setQuality(d.issues || null))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load quality'));
    }
    if (tab === 'sources') {
      adminApi
        .commoditySources()
        .then((d) => setSources(d.sources || []))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load sources'));
    }
  }, [tab, loadCatalogue, loadObservations, marketQ, marketPage]);

  async function openCommodity(id) {
    setBusy(id);
    try {
      const d = await adminApi.commodity(id);
      setSelectedCommodityId(id);
      setCommodityDetail(d);
      const c = d.commodity;
      setEditCommodity({
        name: c.name || '',
        category: c.category || '',
        description: c.description || '',
        isActive: c.isActive !== false,
        reason: '',
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load commodity');
    } finally {
      setBusy('');
    }
  }

  async function openObservation(id) {
    setBusy(id);
    try {
      const d = await adminApi.commodityObservation(id);
      setSelectedObsId(id);
      setObsDetail(d);
      setObsEdit({
        placeLabel: d.item?.place?.name || '',
        status: d.item?.status || '',
        reason: '',
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load observation');
    } finally {
      setBusy('');
    }
  }

  async function saveCommodity(e) {
    e.preventDefault();
    if (!selectedCommodityId || !editCommodity || !canEdit) return;
    setBusy('save-cat');
    try {
      await adminApi.patchCommodity(selectedCommodityId, {
        ...editCommodity,
        reason: editCommodity.reason || 'Admin catalogue correction',
      });
      await openCommodity(selectedCommodityId);
      loadCatalogue();
      loadDashboard();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy('');
    }
  }

  async function createCommodity(e) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy('create');
    try {
      const detail = await adminApi.createCommodity({
        name: createForm.name,
        category: createForm.category || null,
        description: createForm.description || null,
        reason: createForm.reason || 'Admin created commodity',
        variants: createForm.unitCode
          ? [
              {
                code: createForm.unitCode,
                label: createForm.unitLabel || createForm.unitCode,
                unitCode: createForm.unitCode,
                displayName: createForm.unitLabel || createForm.unitCode,
              },
            ]
          : [],
      });
      setShowCreate(false);
      setCreateForm({
        name: '',
        category: '',
        description: '',
        unitCode: 'kg',
        unitLabel: '1 kg',
        reason: '',
      });
      loadCatalogue();
      loadDashboard();
      if (detail.commodity?.id) await openCommodity(detail.commodity.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Create failed');
    } finally {
      setBusy('');
    }
  }

  async function addVariant(e) {
    e.preventDefault();
    if (!selectedCommodityId || !canEdit) return;
    setBusy('variant');
    try {
      await adminApi.createCommodityVariant(selectedCommodityId, {
        ...variantDraft,
        reason: variantDraft.reason || 'Admin added unit variant',
      });
      setVariantDraft({ code: '', label: '', unitCode: '', displayName: '', reason: '' });
      await openCommodity(selectedCommodityId);
      loadCatalogue();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Variant failed');
    } finally {
      setBusy('');
    }
  }

  async function saveObservation(e) {
    e.preventDefault();
    if (!selectedObsId || !obsEdit || !canEdit) return;
    setBusy('save-obs');
    try {
      await adminApi.patchCommodityObservation(selectedObsId, {
        placeLabel: obsEdit.placeLabel,
        status: obsEdit.status,
        reason: obsEdit.reason || 'Admin observation metadata correction',
      });
      await openObservation(selectedObsId);
      loadObservations();
      loadDashboard();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy('');
    }
  }

  const commodity = commodityDetail?.commodity;
  const observation = obsDetail?.item;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        breadcrumb="Content & Reports"
        title="Commodity price management"
        subtitle="Everyday price observations by location and unit — community reports are never shown as official national prices."
        actions={
          canEdit && tab === 'catalogue' ? (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
            >
              {showCreate ? 'Cancel' : 'Add commodity'}
            </button>
          ) : null
        }
      />

      {dashboard ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <AdminCard title="Active commodities" value={dashboard.activeCommodities} />
          <AdminCard title="Observations today" value={dashboard.observationsToday} />
          <AdminCard title="Awaiting review" value={dashboard.awaitingReview} />
          <AdminCard title="Verified" value={dashboard.verifiedObservations} />
          <AdminCard title="Stale / expired" value={dashboard.staleOrExpired} />
          <AdminCard title="Conflicts" value={dashboard.conflictingGroups} />
          <AdminCard title="Active markets" value={dashboard.activeMarkets ?? 0} />
          <AdminCard title="Anomalies" value={dashboard.priceAnomalies ?? 0} />
          <AdminCard title="Flagged" value={dashboard.flaggedObservations ?? 0} />
        </div>
      ) : null}

      {dashboard?.recentLocations?.length ? (
        <div className="rounded-xl border border-surface-border bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Locations with recent reports (24h)
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {dashboard.recentLocations.map((l) => (
              <li key={l.locationId} className="rounded-md bg-surface-muted px-2 py-1 text-xs">
                {l.locationName} · {l.reportCount}
              </li>
            ))}
          </ul>
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

      {showCreate && canEdit && tab === 'catalogue' ? (
        <form
          onSubmit={createCommodity}
          className="grid gap-2 rounded-xl border border-surface-border bg-white p-4 sm:grid-cols-2"
        >
          <FilterInput
            label="Name"
            required
            value={createForm.name}
            onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
          />
          <FilterSelect
            label="Category"
            value={createForm.category}
            onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
          >
            <option value="">Unset</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </FilterSelect>
          <FilterInput
            label="Primary unit code"
            value={createForm.unitCode}
            onChange={(e) => setCreateForm((f) => ({ ...f, unitCode: e.target.value }))}
          />
          <FilterInput
            label="Unit label"
            value={createForm.unitLabel}
            onChange={(e) => setCreateForm((f) => ({ ...f, unitLabel: e.target.value }))}
          />
          <FilterInput
            label="Description"
            value={createForm.description}
            onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
          />
          <FilterInput
            label="Reason"
            required
            value={createForm.reason}
            onChange={(e) => setCreateForm((f) => ({ ...f, reason: e.target.value }))}
          />
          <button
            type="submit"
            disabled={busy === 'create'}
            className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white sm:col-span-2 disabled:opacity-60"
          >
            {busy === 'create' ? 'Creating…' : 'Create commodity'}
          </button>
        </form>
      ) : null}

      {tab === 'catalogue' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,380px)]">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <button
                type="button"
                className="rounded-lg border border-surface-border px-3 py-2 text-sm sm:hidden"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                {filtersOpen ? 'Hide filters' : 'Show filters'}
              </button>
              <div
                className={`grid flex-1 gap-2 sm:grid-cols-3 ${filtersOpen ? '' : 'hidden sm:grid'}`}
              >
                <FilterInput
                  label="Search"
                  value={catFilters.q}
                  onChange={(e) => setCatFilters((f) => ({ ...f, q: e.target.value }))}
                />
                <FilterSelect
                  label="Category"
                  value={catFilters.category}
                  onChange={(e) => setCatFilters((f) => ({ ...f, category: e.target.value }))}
                >
                  <option value="">All</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect
                  label="Status"
                  value={catFilters.active}
                  onChange={(e) => setCatFilters((f) => ({ ...f, active: e.target.value }))}
                >
                  <option value="">All</option>
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </FilterSelect>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCatPage(1);
                  loadCatalogue();
                }}
                className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
              >
                Apply
              </button>
            </div>
            {!catalogue.items?.length ? (
              <EmptyState message="No commodities found." />
            ) : (
              <ul className="space-y-2" aria-label="Commodity catalogue">
                {catalogue.items.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openCommodity(c.id)}
                      className={`w-full rounded-xl border p-3 text-left ${
                        selectedCommodityId === c.id
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-surface-border bg-white hover:border-brand-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{c.name}</p>
                          <p className="text-xs text-ink-muted">
                            {c.categoryLabel || 'Uncategorised'}
                            {c.variants?.length
                              ? ` · ${c.variants.map((v) => v.displayName || v.unitCode).join(', ')}`
                              : ''}
                            {` · ${c.observationCount} observations`}
                          </p>
                        </div>
                        <StatusPill status={c.isActive ? 'active' : 'inactive'} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Pagination
              page={catPage}
              total={catalogue.total}
              limit={catalogue.limit}
              onPage={setCatPage}
            />
          </div>

          <aside className="space-y-3 rounded-xl border border-surface-border bg-white p-3 lg:sticky lg:top-4 lg:self-start">
            {!commodity ? (
              <p className="text-sm text-ink-muted">Select a commodity to edit catalogue details.</p>
            ) : (
              <>
                <div>
                  <h2 className="text-lg font-bold">{commodity.name}</h2>
                  <p className="text-xs text-ink-muted">
                    {commodity.code} · {commodity.slug}
                  </p>
                </div>
                <ul className="space-y-1 text-xs text-ink-muted">
                  {(commodity.variants || []).map((v) => (
                    <li key={v.id}>
                      {v.displayName} · {v.unitCode}
                      {v.isActive === false ? ' (inactive)' : ''}
                      {canEdit ? (
                        <ConfirmAction
                          label="Toggle unit"
                          onConfirm={async (reason) => {
                            await adminApi.patchCommodityVariant(v.id, {
                              isActive: !v.isActive,
                              reason,
                            });
                            await openCommodity(commodity.id);
                            loadCatalogue();
                          }}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
                {canEdit && editCommodity ? (
                  <form onSubmit={saveCommodity} className="space-y-2 border-t border-surface-border pt-3">
                    <FilterInput
                      label="Name"
                      value={editCommodity.name}
                      onChange={(e) => setEditCommodity((f) => ({ ...f, name: e.target.value }))}
                    />
                    <FilterSelect
                      label="Category"
                      value={editCommodity.category}
                      onChange={(e) =>
                        setEditCommodity((f) => ({ ...f, category: e.target.value }))
                      }
                    >
                      <option value="">Unset</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </FilterSelect>
                    <FilterInput
                      label="Description"
                      value={editCommodity.description}
                      onChange={(e) =>
                        setEditCommodity((f) => ({ ...f, description: e.target.value }))
                      }
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editCommodity.isActive}
                        onChange={(e) =>
                          setEditCommodity((f) => ({ ...f, isActive: e.target.checked }))
                        }
                      />
                      Active
                    </label>
                    <FilterInput
                      label="Reason"
                      required
                      value={editCommodity.reason}
                      onChange={(e) => setEditCommodity((f) => ({ ...f, reason: e.target.value }))}
                    />
                    <button
                      type="submit"
                      disabled={busy === 'save-cat'}
                      className="w-full rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      Save catalogue
                    </button>
                  </form>
                ) : null}
                {canEdit ? (
                  <form onSubmit={addVariant} className="space-y-2 border-t border-surface-border pt-3">
                    <p className="text-xs font-semibold uppercase text-ink-muted">Add unit variant</p>
                    <FilterInput
                      label="Code"
                      value={variantDraft.code}
                      onChange={(e) => setVariantDraft((f) => ({ ...f, code: e.target.value }))}
                    />
                    <FilterInput
                      label="Unit code"
                      value={variantDraft.unitCode}
                      onChange={(e) => setVariantDraft((f) => ({ ...f, unitCode: e.target.value }))}
                    />
                    <FilterInput
                      label="Display name"
                      value={variantDraft.displayName}
                      onChange={(e) =>
                        setVariantDraft((f) => ({ ...f, displayName: e.target.value }))
                      }
                    />
                    <FilterInput
                      label="Reason"
                      required
                      value={variantDraft.reason}
                      onChange={(e) => setVariantDraft((f) => ({ ...f, reason: e.target.value }))}
                    />
                    <button
                      type="submit"
                      className="w-full rounded-lg border border-brand-700 px-3 py-2 text-sm font-semibold text-brand-700"
                    >
                      Add unit
                    </button>
                  </form>
                ) : null}
              </>
            )}
          </aside>
        </div>
      ) : null}

      {tab === 'observations' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,400px)]">
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <FilterInput
                label="Search"
                value={obsFilters.q}
                onChange={(e) => setObsFilters((f) => ({ ...f, q: e.target.value }))}
              />
              <FilterSelect
                label="Commodity"
                value={obsFilters.commodityId}
                onChange={(e) => setObsFilters((f) => ({ ...f, commodityId: e.target.value }))}
              >
                <option value="">All</option>
                {(catalogue.items?.length ? catalogue.items : []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="State"
                value={obsFilters.stateId}
                onChange={(e) => setObsFilters((f) => ({ ...f, stateId: e.target.value }))}
              >
                <option value="">All states</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Freshness"
                value={obsFilters.freshness}
                onChange={(e) => setObsFilters((f) => ({ ...f, freshness: e.target.value }))}
              >
                <option value="">Any</option>
                <option value="fresh">Fresh</option>
                <option value="aging">Aging</option>
                <option value="stale">Stale</option>
                <option value="expired">Expired</option>
              </FilterSelect>
              <FilterSelect
                label="Source"
                value={obsFilters.sourceType}
                onChange={(e) => setObsFilters((f) => ({ ...f, sourceType: e.target.value }))}
              >
                <option value="">All</option>
                <option value="community">Community</option>
                <option value="official">Official</option>
              </FilterSelect>
              <FilterSelect
                label="Verification"
                value={obsFilters.verification}
                onChange={(e) => setObsFilters((f) => ({ ...f, verification: e.target.value }))}
              >
                <option value="">Any</option>
                <option value="verified">Verified</option>
                <option value="unverified">Unverified</option>
              </FilterSelect>
              <FilterInput
                label="Market"
                value={obsFilters.market}
                onChange={(e) => setObsFilters((f) => ({ ...f, market: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => {
                  setObsPage(1);
                  if (!catalogue.items?.length) loadCatalogue();
                  loadObservations();
                }}
                className="self-end rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
              >
                Apply
              </button>
            </div>
            <p className="text-xs text-ink-muted">
              {observations.note}{' '}
              <Link href="/admin/moderation" className="text-brand-700 underline">
                Moderation Center
              </Link>
            </p>
            {!observations.items?.length ? (
              <EmptyState message="No price observations match these filters." />
            ) : (
              <ul className="space-y-2" aria-label="Price observations">
                {observations.items.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => openObservation(o.id)}
                      className={`w-full rounded-xl border p-3 text-left ${
                        selectedObsId === o.id
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-surface-border bg-white hover:border-brand-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">
                            {o.commodity?.name} · {formatNaira(o.price?.amount)}/
                            {o.variant?.unitCode || 'unit'}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {[o.location?.areaName, o.location?.lgaName, o.location?.stateName]
                              .filter(Boolean)
                              .join(' · ')}
                            {o.place?.name ? ` · ${o.place.name}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <StatusPill status={o.freshness} />
                          <StatusPill status={o.verification || 'unverified'} />
                          <StatusPill status={o.moderation || o.moderationState || 'pending'} />
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">
                        {o.sourceTypeLabel || o.trustLabel} · {o.variant?.displayName} · observed{' '}
                        {o.observedAt || o.occurredAt
                          ? new Date(o.observedAt || o.occurredAt).toLocaleString('en-NG')
                          : '—'}
                        {o.submittedAt || o.createdAt
                          ? ` · submitted ${new Date(o.submittedAt || o.createdAt).toLocaleString('en-NG')}`
                          : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Pagination
              page={obsPage}
              total={observations.total}
              limit={observations.limit}
              onPage={setObsPage}
            />
          </div>

          <aside className="space-y-3 rounded-xl border border-surface-border bg-white p-3 lg:sticky lg:top-4 lg:self-start">
            {!observation ? (
              <p className="text-sm text-ink-muted">Select an observation for detail and history.</p>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase text-ink-muted">
                    {observation.trustLabel}
                  </p>
                  <h2 className="mt-1 text-lg font-bold">
                    {observation.commodity?.name} — {formatNaira(observation.price?.amount)}/
                    {observation.variant?.unitCode}
                  </h2>
                  <p className="text-sm text-ink-muted">
                    Reported in {[observation.location?.name, observation.location?.stateName]
                      .filter(Boolean)
                      .join(', ')}{' '}
                    · {observation.occurredAt
                      ? new Date(observation.occurredAt).toLocaleString('en-NG')
                      : ''}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-ink-muted">Unit</dt>
                    <dd className="font-medium">{observation.variant?.displayName}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Category</dt>
                    <dd className="font-medium">
                      {observation.commodity?.categoryLabel || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Market</dt>
                    <dd className="font-medium">{observation.place?.name || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Source</dt>
                    <dd className="font-medium">
                      {observation.sourceTypeLabel || observation.source?.typeLabel || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Verification</dt>
                    <dd>
                      <StatusPill status={observation.verification || 'unverified'} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Moderation</dt>
                    <dd>
                      <StatusPill
                        status={observation.moderation || observation.moderationState || 'pending'}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Freshness</dt>
                    <dd>
                      <StatusPill status={observation.freshness} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Observed / submitted</dt>
                    <dd className="font-medium">
                      {observation.observedAt || observation.occurredAt
                        ? new Date(observation.observedAt || observation.occurredAt).toLocaleString(
                            'en-NG'
                          )
                        : '—'}
                      {' / '}
                      {observation.submittedAt || observation.createdAt
                        ? new Date(
                            observation.submittedAt || observation.createdAt
                          ).toLocaleString('en-NG')
                        : '—'}
                    </dd>
                  </div>
                </dl>
                {obsDetail.variation ? (
                  <div className="rounded-lg bg-surface-muted/50 p-2 text-xs">
                    <p className="font-semibold">Local variation (same unit & place)</p>
                    <p>
                      {formatNaira(obsDetail.variation.min)}
                      {obsDetail.variation.spread > 0
                        ? ` – ${formatNaira(obsDetail.variation.max)}`
                        : ''}{' '}
                      · {obsDetail.variation.count} observations
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs font-semibold text-ink-muted">Price history</p>
                  <Sparkline points={obsDetail.historyPoints || []} />
                  <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs">
                    {(obsDetail.historyPoints || []).slice(-12).reverse().map((p) => (
                      <li key={`${p.id}-${p.at}`}>
                        {formatNaira(p.amount)} · {p.trustLabel} ·{' '}
                        {p.at ? new Date(p.at).toLocaleDateString('en-NG') : ''}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-ink-muted">{obsDetail.note}</p>
                {canEdit && obsEdit ? (
                  <form
                    onSubmit={saveObservation}
                    className="space-y-2 border-t border-surface-border pt-3"
                  >
                    <p className="text-xs font-semibold uppercase text-ink-muted">
                      Metadata correction (price amount preserved)
                    </p>
                    <FilterInput
                      label="Market / place label"
                      value={obsEdit.placeLabel}
                      onChange={(e) => setObsEdit((f) => ({ ...f, placeLabel: e.target.value }))}
                    />
                    <FilterSelect
                      label="Status"
                      value={obsEdit.status}
                      onChange={(e) => setObsEdit((f) => ({ ...f, status: e.target.value }))}
                    >
                      <option value="submitted">submitted</option>
                      <option value="active">active</option>
                      <option value="confirmed">confirmed</option>
                      <option value="stale">stale</option>
                      <option value="expired">expired</option>
                      <option value="flagged">flagged</option>
                      <option value="under_review">under_review</option>
                    </FilterSelect>
                    <FilterInput
                      label="Reason"
                      required
                      value={obsEdit.reason}
                      onChange={(e) => setObsEdit((f) => ({ ...f, reason: e.target.value }))}
                    />
                    <button
                      type="submit"
                      disabled={busy === 'save-obs'}
                      className="w-full rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      Save metadata
                    </button>
                  </form>
                ) : null}
              </>
            )}
          </aside>
        </div>
      ) : null}

      {tab === 'markets' ? (
        <div className="space-y-3">
          {canEdit ? (
            <form
              className="grid gap-2 rounded-xl border border-dashed border-surface-border bg-white p-3 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy('merge');
                try {
                  await adminApi.mergeCommodityMarkets(mergeForm);
                  setMergeForm({ survivorPlaceId: '', mergedPlaceId: '', reason: '' });
                  loadDashboard();
                  const m = await adminApi.commodityMarkets({
                    q: marketQ,
                    page: marketPage,
                    limit: 30,
                  });
                  setMarkets(m);
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Merge failed');
                } finally {
                  setBusy('');
                }
              }}
            >
              <p className="text-xs font-semibold text-ink sm:col-span-2">
                Merge markets (moves observations/aliases; deactivates merged market)
              </p>
              <FilterInput
                label="Survivor market UUID"
                value={mergeForm.survivorPlaceId}
                onChange={(e) =>
                  setMergeForm((f) => ({ ...f, survivorPlaceId: e.target.value.trim() }))
                }
              />
              <FilterInput
                label="Merged market UUID"
                value={mergeForm.mergedPlaceId}
                onChange={(e) =>
                  setMergeForm((f) => ({ ...f, mergedPlaceId: e.target.value.trim() }))
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <FilterInput
              label="Search markets"
              value={marketQ}
              onChange={(e) => setMarketQ(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setMarketPage(1)}
              className="self-end rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
            >
              Search
            </button>
          </div>
          {!markets.items?.length ? (
            <EmptyState message="No markets found." />
          ) : (
            <ul className="space-y-2">
              {markets.items.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-surface-border bg-white p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{m.name}</p>
                      <p className="text-xs text-ink-muted">
                        {m.placeTypeLabel} ·{' '}
                        {[m.areaName, m.lgaName, m.stateName].filter(Boolean).join(' · ')}
                      </p>
                      {m.aliases?.length ? (
                        <p className="mt-1 text-xs text-ink-muted">
                          Aliases: {m.aliases.map((a) => a.alias).join(', ')}
                        </p>
                      ) : null}
                    </div>
                    <StatusPill status={m.isActive ? 'active' : 'inactive'} />
                  </div>
                  {canEdit ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ConfirmAction
                        label={m.isActive ? 'Deactivate' : 'Activate'}
                        danger={m.isActive}
                        onConfirm={async (reason) => {
                          await adminApi.patchCommodityMarket(m.id, {
                            isActive: !m.isActive,
                            reason,
                          });
                          const refreshed = await adminApi.commodityMarkets({
                            q: marketQ,
                            page: marketPage,
                            limit: 30,
                          });
                          setMarkets(refreshed);
                        }}
                      />
                      <ConfirmAction
                        label="Add alias"
                        onConfirm={async (reason) => {
                          const alias = window.prompt('Alias name');
                          if (!alias) return;
                          await adminApi.addCommodityMarketAlias(m.id, { alias, reason });
                          const refreshed = await adminApi.commodityMarkets({
                            q: marketQ,
                            page: marketPage,
                            limit: 30,
                          });
                          setMarkets(refreshed);
                        }}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <Pagination
            page={marketPage}
            total={markets.total}
            limit={markets.limit}
            onPage={setMarketPage}
          />
        </div>
      ) : null}

      {tab === 'anomalies' ? (
        <div className="rounded-xl border border-surface-border bg-white p-3">
          <h3 className="font-semibold">Price anomalies</h3>
          <p className="text-xs text-ink-muted">
            {anomalies?.note ||
              'Outliers vs recent median for the same variant and pricing context — review only.'}
          </p>
          <ul className="mt-3 space-y-2">
            {(anomalies?.items || []).map((a) => (
              <li key={a.id} className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm">
                <button
                  type="button"
                  className="font-medium text-brand-700 underline"
                  onClick={() => {
                    setTab('observations');
                    openObservation(a.id);
                  }}
                >
                  {a.commodityName} · {a.variantName}
                </button>
                <span className="text-ink-muted">
                  {' '}
                  · {formatNaira(a.amount)} vs median {formatNaira(a.medianPrice)} · {a.locationName}
                </span>
                <span className="mt-0.5 block text-xs text-amber-900">
                  {a.flagReason} · {a.pricingContextLabel || a.pricingContext} · {a.sourceType}
                </span>
              </li>
            ))}
            {!anomalies?.items?.length ? (
              <li className="text-sm text-ink-muted">No outliers in the review window.</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {tab === 'conflicts' ? (
        <div className="space-y-4">
          <section className="rounded-xl border border-surface-border bg-white p-3">
            <h3 className="font-semibold">Conflicting observations</h3>
            <p className="text-xs text-ink-muted">{conflicts?.note}</p>
            <ul className="mt-2 space-y-2 text-sm">
              {(conflicts?.items || []).map((c) => (
                <li key={`${c.commodityId}-${c.variantId}-${c.locationId}`}>
                  <span className="font-medium">
                    {c.commodityName} · {c.variantName}
                  </span>{' '}
                  @ {c.locationName}: {formatNaira(c.min)}–{formatNaira(c.max)} (
                  {c.observationCount})
                </li>
              ))}
              {!conflicts?.items?.length ? (
                <li className="text-ink-muted">No material conflicts in the window.</li>
              ) : null}
            </ul>
          </section>
          <section className="rounded-xl border border-surface-border bg-white p-3">
            <h3 className="font-semibold">Duplicate candidates</h3>
            <p className="text-xs text-ink-muted">{duplicates?.note}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {(duplicates?.sameReporterSamePlace || []).map((d) => (
                <li key={d.ids?.[0] || `${d.commodityId}-${d.locationId}`}>
                  {d.commodityName} · {d.variantName} @ {d.locationName} · {d.count}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === 'quality' && quality ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(quality.counts || {}).map(([k, v]) => (
              <AdminCard key={k} title={labelize(k)} value={v} />
            ))}
          </div>
          <p className="text-xs text-ink-muted">{quality.note}</p>
          <section className="rounded-xl border border-surface-border bg-white p-3">
            <h3 className="font-semibold">Unusual high prices (review)</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {(quality.unusualHighPrices || []).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="text-brand-700 underline"
                    onClick={() => {
                      setTab('observations');
                      openObservation(r.id);
                    }}
                  >
                    {r.commodity_name}
                  </button>{' '}
                  · {formatNaira(r.price_amount)} · {r.location_name}
                </li>
              ))}
              {!quality.unusualHighPrices?.length ? (
                <li className="text-ink-muted">None flagged.</li>
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === 'sources' ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">
            Reference sources only when configured. Not every agency provides a public retail API.
          </p>
          {!sources.length ? (
            <EmptyState message="No commodity-related official sources configured yet." />
          ) : (
            <ul className="space-y-2">
              {sources.map((s) => (
                <li key={s.id} className="rounded-xl border border-surface-border bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{s.name}</p>
                    <StatusPill status={s.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">{s.note}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
