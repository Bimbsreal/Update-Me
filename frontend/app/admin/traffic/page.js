'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi, ApiError, locationsApi } from '@/lib/api';
import { AdminPageHeader, useAdmin } from '@/components/admin/AdminContext';
import {
  AdminCard,
  EmptyState,
  FilterInput,
  FilterSelect,
  Pagination,
  StatusPill,
} from '@/components/admin/AdminUI';

const TABS = [
  { id: 'events', label: 'Events' },
  { id: 'directory', label: 'Reports' },
  { id: 'quality', label: 'Data quality' },
  { id: 'sources', label: 'Official sources' },
];

const EVENT_TYPES = [
  '',
  'congestion',
  'accident',
  'road_closure',
  'partial_closure',
  'diversion',
  'lane_restriction',
  'obstruction',
  'construction',
  'flooding',
  'vehicle_breakdown',
  'fallen_object',
  'fire',
  'checkpoint',
  'security_incident',
  'road_damage',
  'bus_disruption',
  'route_disruption',
  'transport_delay',
  'other',
];

const EVENT_STATUSES = [
  '',
  'reported',
  'investigating',
  'confirmed',
  'active',
  'improving',
  'resolved',
  'expired',
  'rejected',
  'cancelled',
];

const DIRECTIONS = [
  '',
  'inbound',
  'outbound',
  'northbound',
  'southbound',
  'eastbound',
  'westbound',
  'both',
  'unspecified',
];

const SEVERITIES = [
  '',
  'clear',
  'light',
  'moderate',
  'heavy',
  'standstill',
  'blocked',
  'unknown',
];
const CAUSES = [
  '',
  'accident',
  'roadworks',
  'flooding',
  'vehicle_breakdown',
  'security_incident',
  'event',
  'construction',
  'lane_closure',
  'unknown',
  'other',
];
const STATUSES = [
  '',
  'submitted',
  'active',
  'confirmed',
  'stale',
  'expired',
  'flagged',
  'under_review',
];

function OsmMap({ lat, lng, name }) {
  if (lat == null || lng == null) {
    return (
      <div className="rounded-lg border border-dashed border-surface-border bg-surface-muted/40 px-3 py-8 text-center text-xs text-ink-muted">
        No coordinates on file.
      </div>
    );
  }
  const delta = 0.02;
  const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`;
  const marker = `${lat}%2C${lng}`;
  return (
    <div className="overflow-hidden rounded-lg border border-surface-border">
      <iframe
        title={`Map of ${name || 'incident'}`}
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`}
        className="h-44 w-full border-0 sm:h-52"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <p className="border-t border-surface-border bg-surface-muted/40 px-3 py-1.5 text-[11px] text-ink-muted">
        {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)} · approximate public location
      </p>
    </div>
  );
}

function labelize(value) {
  if (!value) return '—';
  return String(value).replace(/_/g, ' ');
}

export default function AdminTrafficPage() {
  const { can } = useAdmin();
  const canEdit = can('traffic');

  const [tab, setTab] = useState('events');
  const [dashboard, setDashboard] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    q: '',
    stateId: '',
    road: '',
    severity: '',
    cause: '',
    status: '',
    sourceType: '',
    freshness: '',
  });
  const [eventFilters, setEventFilters] = useState({
    q: '',
    status: 'active',
    eventType: '',
    severity: '',
  });
  const [eventPage, setEventPage] = useState(1);
  const [events, setEvents] = useState({ items: [], total: 0, limit: 30 });
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [eventDetail, setEventDetail] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    eventType: 'congestion',
    severity: 'heavy',
    direction: 'unspecified',
    directionLabel: '',
    roadName: '',
    description: '',
    reportId: '',
    reason: 'Admin-created development event',
  });
  const [linkReportId, setLinkReportId] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [states, setStates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [quality, setQuality] = useState(null);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const loadDashboard = useCallback(() => {
    adminApi
      .trafficDashboard()
      .then((d) => setDashboard(d.dashboard || null))
      .catch(() => setDashboard(null));
  }, []);

  const loadList = useCallback(() => {
    setError('');
    adminApi
      .trafficReports({ ...filters, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load traffic'));
  }, [filters, page]);

  const loadEvents = useCallback(() => {
    setError('');
    adminApi
      .trafficEvents({ ...eventFilters, page: eventPage, limit: 30 })
      .then(setEvents)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load events'));
  }, [eventFilters, eventPage]);

  useEffect(() => {
    loadDashboard();
    locationsApi
      .states()
      .then((d) => setStates(d.states || []))
      .catch(() => {});
  }, [loadDashboard]);

  useEffect(() => {
    if (tab === 'directory') loadList();
    if (tab === 'events') loadEvents();
    if (tab === 'quality') {
      adminApi
        .trafficQuality()
        .then((d) => setQuality(d.issues || null))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load quality'));
    }
    if (tab === 'sources') {
      adminApi
        .trafficSources()
        .then((d) => setSources(d.sources || []))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load sources'));
    }
  }, [tab, loadList, loadEvents]);

  async function openEvent(id) {
    if (!id) return;
    setBusy(id);
    setError('');
    try {
      const d = await adminApi.trafficEvent(id);
      setSelectedEventId(id);
      setEventDetail(d);
      setSelectedId(null);
      setDetail(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load event');
    } finally {
      setBusy('');
    }
  }

  async function createEvent(e) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy('create-event');
    setError('');
    try {
      const created = await adminApi.createTrafficEvent({
        ...createForm,
        reportId: createForm.reportId || undefined,
      });
      setCreateOpen(false);
      setCreateForm({
        title: '',
        eventType: 'congestion',
        severity: 'heavy',
        direction: 'unspecified',
        directionLabel: '',
        roadName: '',
        description: '',
        reportId: '',
        reason: 'Admin-created development event',
      });
      loadDashboard();
      loadEvents();
      await openEvent(created.item?.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create event');
    } finally {
      setBusy('');
    }
  }

  async function resolveEvent() {
    if (!selectedEventId || !canEdit) return;
    const reason = window.prompt('Reason for resolving this event?');
    if (!reason || reason.trim().length < 3) return;
    setBusy('resolve');
    try {
      await adminApi.resolveTrafficEvent(selectedEventId, { reason: reason.trim() });
      loadDashboard();
      loadEvents();
      await openEvent(selectedEventId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to resolve');
    } finally {
      setBusy('');
    }
  }

  async function mergeIntoSelected() {
    if (!selectedEventId || !canEdit) return;
    const sourceId = window.prompt('UUID of source event to merge INTO this survivor?');
    if (!sourceId?.trim()) return;
    const reason = window.prompt('Reason for merge?');
    if (!reason || reason.trim().length < 3) return;
    setBusy('merge');
    try {
      await adminApi.mergeTrafficEvent(selectedEventId, {
        sourceEventIds: [sourceId.trim()],
        reason: reason.trim(),
      });
      loadDashboard();
      loadEvents();
      await openEvent(selectedEventId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to merge');
    } finally {
      setBusy('');
    }
  }

  async function recomputeConfidence() {
    if (!selectedEventId || !canEdit) return;
    setBusy('confidence');
    try {
      await adminApi.recomputeTrafficEventConfidence(selectedEventId);
      await openEvent(selectedEventId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to recompute confidence');
    } finally {
      setBusy('');
    }
  }

  async function flagAsDuplicate() {
    if (!selectedEventId || !canEdit) return;
    const other = window.prompt('Optional: UUID of canonical event this may duplicate');
    const reason = window.prompt('Reason for flagging duplicate?') || 'Potential duplicate — review';
    setBusy('dup');
    try {
      await adminApi.flagTrafficEventDuplicate(selectedEventId, {
        duplicateOfEventId: other?.trim() || null,
        reason: reason.trim(),
      });
      await openEvent(selectedEventId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to flag duplicate');
    } finally {
      setBusy('');
    }
  }

  async function runExpireStale() {
    if (!canEdit) return;
    setBusy('expire');
    try {
      await adminApi.expireTrafficEvents({ limit: 200 });
      loadDashboard();
      loadEvents();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Expire tick failed');
    } finally {
      setBusy('');
    }
  }

  async function linkReportToEvent() {
    if (!selectedEventId || !linkReportId || !canEdit) return;
    setBusy('link');
    try {
      await adminApi.linkTrafficEventReport(selectedEventId, {
        reportId: linkReportId.trim(),
        reason: 'Admin linked report to event',
      });
      setLinkReportId('');
      await openEvent(selectedEventId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to link report');
    } finally {
      setBusy('');
    }
  }

  async function openDetail(id) {
    if (!id) return;
    setBusy(id);
    setError('');
    try {
      const d = await adminApi.trafficReport(id);
      setSelectedId(id);
      setDetail(d);
      const item = d.item;
      setEditForm({
        severity: item.severity || '',
        cause: item.cause || '',
        roadName: item.roadName || '',
        affectedSection: item.affectedSection || '',
        status: item.status || '',
        reason: '',
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load incident');
    } finally {
      setBusy('');
    }
  }

  async function saveIncident(e) {
    e.preventDefault();
    if (!selectedId || !editForm || !canEdit) return;
    setBusy('save');
    try {
      await adminApi.patchTrafficReport(selectedId, {
        ...editForm,
        reason: editForm.reason || 'Admin traffic correction',
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

  const item = detail?.item;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        breadcrumb="Content & Reports"
        title="Traffic operations"
        subtitle="Road conditions, incidents, and community reports — freshness is separate from resolution. Community is never shown as government-confirmed."
      />

      {dashboard ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <AdminCard title="Active events" value={dashboard.activeEvents ?? 0} />
          <AdminCard title="Severe events" value={dashboard.severeEvents ?? 0} />
          <AdminCard title="High / critical" value={dashboard.highCriticalEvents ?? 0} />
          <AdminCard title="Road closures" value={dashboard.roadClosures ?? 0} />
          <AdminCard title="Official events" value={dashboard.officialEvents ?? 0} />
          <AdminCard title="Community events" value={dashboard.communityEvents ?? 0} />
          <AdminCard title="Pending verification" value={dashboard.pendingVerification ?? 0} />
          <AdminCard title="Flagged duplicates" value={dashboard.flaggedDuplicates ?? 0} />
          <AdminCard title="Active reports" value={dashboard.activeReports} />
          <AdminCard title="Awaiting review" value={dashboard.awaitingReview} />
          <AdminCard title="Heavy / blocked" value={dashboard.currentIncidents} />
          <AdminCard title="Flagged reports" value={dashboard.flaggedReports ?? 0} />
          <AdminCard title="Stale / expired" value={dashboard.staleOrExpired} />
          <AdminCard title="Stale events" value={dashboard.staleEvents ?? 0} />
          <AdminCard title="Community today" value={dashboard.communityReportsToday} />
          <AdminCard title="Resolved today" value={dashboard.resolvedEventsToday ?? 0} />
          <AdminCard title="Official (7d)" value={dashboard.officialUpdates7d} />
          <AdminCard title="Conflict groups" value={dashboard.conflictGroups} />
        </div>
      ) : null}

      {dashboard?.busyAreas?.length ? (
        <div className="rounded-xl border border-surface-border bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Areas with increased report activity (24h)
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {dashboard.busyAreas.map((a) => (
              <li
                key={a.areaId}
                className="rounded-md bg-surface-muted px-2 py-1 text-xs text-ink"
              >
                {a.areaName} · {a.reportCount}
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

      {tab === 'events' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <FilterInput
              label="Search events"
              value={eventFilters.q}
              onChange={(e) => setEventFilters((f) => ({ ...f, q: e.target.value }))}
            />
            <FilterSelect
              label="Status"
              value={eventFilters.status}
              onChange={(e) => setEventFilters((f) => ({ ...f, status: e.target.value }))}
            >
              {EVENT_STATUSES.map((s) => (
                <option key={s || 'all'} value={s}>
                  {s ? labelize(s) : 'All statuses'}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Type"
              value={eventFilters.eventType}
              onChange={(e) => setEventFilters((f) => ({ ...f, eventType: e.target.value }))}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t || 'all'} value={t}>
                  {t ? labelize(t) : 'All types'}
                </option>
              ))}
            </FilterSelect>
            <button
              type="button"
              className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => {
                setEventPage(1);
                loadEvents();
              }}
            >
              Apply
            </button>
            {canEdit ? (
              <button
                type="button"
                className="rounded-lg border border-surface-border px-3 py-2 text-sm font-semibold"
                onClick={() => setCreateOpen((v) => !v)}
              >
                {createOpen ? 'Cancel create' : 'Create event'}
              </button>
            ) : null}
          </div>

          {createOpen ? (
            <form
              onSubmit={createEvent}
              className="grid gap-2 rounded-xl border border-surface-border bg-white p-3 sm:grid-cols-2"
            >
              <label className="block text-xs font-medium text-ink-muted sm:col-span-2">
                Title
                <input
                  required
                  minLength={3}
                  value={createForm.title}
                  onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
                />
              </label>
              <FilterSelect
                label="Type"
                value={createForm.eventType}
                onChange={(e) => setCreateForm((f) => ({ ...f, eventType: e.target.value }))}
              >
                {EVENT_TYPES.filter(Boolean).map((t) => (
                  <option key={t} value={t}>
                    {labelize(t)}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Severity"
                value={createForm.severity}
                onChange={(e) => setCreateForm((f) => ({ ...f, severity: e.target.value }))}
              >
                {SEVERITIES.filter(Boolean).map((s) => (
                  <option key={s} value={s}>
                    {labelize(s)}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Direction"
                value={createForm.direction}
                onChange={(e) => setCreateForm((f) => ({ ...f, direction: e.target.value }))}
              >
                {DIRECTIONS.filter(Boolean).map((d) => (
                  <option key={d} value={d}>
                    {labelize(d)}
                  </option>
                ))}
              </FilterSelect>
              <FilterInput
                label="Direction label (e.g. Lekki → VI)"
                value={createForm.directionLabel}
                onChange={(e) => setCreateForm((f) => ({ ...f, directionLabel: e.target.value }))}
              />
              <FilterInput
                label="Road name"
                value={createForm.roadName}
                onChange={(e) => setCreateForm((f) => ({ ...f, roadName: e.target.value }))}
              />
              <FilterInput
                label="Optional report ID to link"
                value={createForm.reportId}
                onChange={(e) => setCreateForm((f) => ({ ...f, reportId: e.target.value }))}
              />
              <label className="block text-xs font-medium text-ink-muted sm:col-span-2">
                Description
                <textarea
                  rows={2}
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
                />
              </label>
              <button
                type="submit"
                disabled={busy === 'create-event'}
                className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
              >
                Save event
              </button>
            </form>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-5">
            <div className="space-y-2 lg:col-span-3">
              {!events.items?.length ? (
                <EmptyState message="No traffic events match these filters." />
              ) : (
                events.items.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => openEvent(ev.id)}
                    className={`w-full rounded-xl border p-3 text-left ${
                      selectedEventId === ev.id
                        ? 'border-brand-400 ring-1 ring-brand-200'
                        : 'border-surface-border bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase text-ink-muted">
                          {labelize(ev.eventType)}
                          {ev.isClosure ? ' · Closure' : ''}
                          {ev.severityBand?.label ? ` · ${ev.severityBand.label}` : ''}
                        </p>
                        <h3 className="mt-1 text-sm font-bold text-ink">{ev.title}</h3>
                        <p className="mt-1 text-xs text-ink-muted">
                          {ev.roadName || ev.locationName || 'No road/location'}
                          {ev.directionLabel ? ` · ${ev.directionLabel}` : ''}
                          {` · ${ev.reportCount || 0} linked reports`}
                        </p>
                      </div>
                      <StatusPill status={ev.status} />
                    </div>
                  </button>
                ))
              )}
              <Pagination
                page={eventPage}
                total={events.total}
                limit={events.limit || 30}
                onPage={setEventPage}
              />
            </div>

            <aside className="rounded-xl border border-surface-border bg-white p-3 lg:col-span-2 lg:sticky lg:top-4">
              {!eventDetail ? (
                <EmptyState message="Select an event to review location, sources, and linked reports." />
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-ink-muted">
                      {labelize(eventDetail.item.eventType)} ·{' '}
                      {eventDetail.item.severityBand?.label || labelize(eventDetail.item.severity)}
                    </p>
                    <h3 className="mt-1 text-base font-bold">{eventDetail.item.title}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusPill status={eventDetail.item.status} />
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">
                        {labelize(eventDetail.item.sourceClassification)}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                        {labelize(eventDetail.item.verificationStatus)}
                      </span>
                    </div>
                  </div>
                  {eventDetail.item.description ? (
                    <p className="whitespace-pre-wrap text-sm text-ink-muted">
                      {eventDetail.item.description}
                    </p>
                  ) : null}
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-ink-muted">Location</dt>
                      <dd>
                        {[eventDetail.item.locationName, eventDetail.item.lgaName, eventDetail.item.stateName]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">Road / segment</dt>
                      <dd>
                        {eventDetail.item.roadName || '—'}
                        {eventDetail.item.segmentName ? ` · ${eventDetail.item.segmentName}` : ''}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">Direction</dt>
                      <dd>
                        {eventDetail.item.directionLabel || labelize(eventDetail.item.direction)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-muted">Observed</dt>
                      <dd>
                        {eventDetail.item.observedAt
                          ? new Date(eventDetail.item.observedAt).toLocaleString()
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                  <OsmMap
                    lat={eventDetail.item.coordinates?.lat}
                    lng={eventDetail.item.coordinates?.lng}
                    name={eventDetail.item.title}
                  />
                  {eventDetail.note ? (
                    <p className="text-[11px] text-amber-900">{eventDetail.note}</p>
                  ) : null}
                  <section>
                    <h4 className="text-xs font-semibold uppercase text-ink-muted">
                      Linked reports ({eventDetail.reports?.length || 0})
                    </h4>
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-ink-muted">
                      {(eventDetail.reports || []).map((r) => (
                        <li key={r.reportId}>
                          <span className="font-medium text-ink">{r.title}</span>
                          {' · '}
                          {labelize(r.severity)} · {r.sourceType} · {r.status}
                        </li>
                      ))}
                    </ul>
                  </section>
                  {canEdit ? (
                    <div className="space-y-2 border-t border-surface-border pt-3">
                      <FilterInput
                        label="Link report UUID"
                        value={linkReportId}
                        onChange={(e) => setLinkReportId(e.target.value)}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy === 'link' || !linkReportId}
                          onClick={linkReportToEvent}
                          className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          Link report
                        </button>
                        {eventDetail.item.status !== 'resolved' ? (
                          <button
                            type="button"
                            disabled={busy === 'resolve'}
                            onClick={resolveEvent}
                            className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Resolve event
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy === 'merge'}
                          onClick={mergeIntoSelected}
                          className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          Merge into this
                        </button>
                        <button
                          type="button"
                          disabled={busy === 'confidence'}
                          onClick={recomputeConfidence}
                          className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          Recompute confidence
                        </button>
                        <button
                          type="button"
                          disabled={busy === 'dup'}
                          onClick={flagAsDuplicate}
                          className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          Flag duplicate
                        </button>
                        <button
                          type="button"
                          disabled={busy === 'expire'}
                          onClick={runExpireStale}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-50"
                        >
                          Run expire tick
                        </button>
                      </div>
                      <p className="text-[11px] text-ink-muted">
                        Confidence: {labelize(eventDetail.item.confidence)} · Freshness:{' '}
                        {labelize(eventDetail.item.freshnessState)} · Source:{' '}
                        {eventDetail.item.sourceLabel || labelize(eventDetail.item.sourceClassification)}
                      </p>
                    </div>
                  ) : null}
                  <section>
                    <h4 className="text-xs font-semibold uppercase text-ink-muted">Audit</h4>
                    <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-ink-muted">
                      {(eventDetail.adminActivity || []).map((a, i) => (
                        <li key={`${a.action}-${i}`}>
                          {a.action} · {a.reason || '—'} ·{' '}
                          {a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}
                        </li>
                      ))}
                      {!eventDetail.adminActivity?.length ? <li>No admin actions yet.</li> : null}
                    </ul>
                  </section>
                </div>
              )}
            </aside>
          </div>
        </div>
      ) : null}

      {tab === 'directory' ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <button
              type="button"
              className="rounded-lg border border-surface-border px-3 py-2 text-sm sm:hidden"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
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
              <FilterInput
                label="Road"
                value={filters.road}
                onChange={(e) => setFilters((f) => ({ ...f, road: e.target.value }))}
              />
              <FilterSelect
                label="Severity"
                value={filters.severity}
                onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
              >
                {SEVERITIES.map((s) => (
                  <option key={s || 'all'} value={s}>
                    {s ? labelize(s) : 'All severities'}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Cause"
                value={filters.cause}
                onChange={(e) => setFilters((f) => ({ ...f, cause: e.target.value }))}
              >
                {CAUSES.map((c) => (
                  <option key={c || 'all'} value={c}>
                    {c ? labelize(c) : 'All causes'}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Status"
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              >
                {STATUSES.map((s) => (
                  <option key={s || 'all'} value={s}>
                    {s ? labelize(s) : 'All statuses'}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                label="Source"
                value={filters.sourceType}
                onChange={(e) => setFilters((f) => ({ ...f, sourceType: e.target.value }))}
              >
                <option value="">All sources</option>
                <option value="community">Community</option>
                <option value="official">Official</option>
                <option value="aggregated">Aggregated</option>
              </FilterSelect>
              <FilterSelect
                label="Freshness"
                value={filters.freshness}
                onChange={(e) => setFilters((f) => ({ ...f, freshness: e.target.value }))}
              >
                <option value="">Any freshness</option>
                <option value="fresh">Fresh</option>
                <option value="aging">Aging</option>
                <option value="stale">Stale</option>
                <option value="expired">Expired</option>
              </FilterSelect>
            </div>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                loadList();
              }}
              className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
            >
              Apply
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,380px)]">
            <div>
              {!data.items?.length ? (
                <EmptyState message="No traffic reports match these filters." />
              ) : (
                <ul className="space-y-2" aria-label="Traffic reports">
                  {data.items.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => openDetail(row.id)}
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          selectedId === row.id
                            ? 'border-brand-600 bg-brand-50'
                            : 'border-surface-border bg-white hover:border-brand-300'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-ink">
                              {labelize(row.cause) || labelize(row.severity)} ·{' '}
                              {row.roadName || row.locationName || 'Unnamed road'}
                            </p>
                            <p className="mt-0.5 text-xs text-ink-muted">
                              {[row.areaName, row.lgaName, row.stateName].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <StatusPill status={row.freshness} />
                            <StatusPill status={row.status} />
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-ink-muted">
                          {row.trustLabel} · {labelize(row.severity)} ·{' '}
                          {row.createdAt
                            ? new Date(row.createdAt).toLocaleString('en-NG')
                            : '—'}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Pagination
                page={page}
                total={data.total}
                limit={data.limit}
                onPage={setPage}
              />
            </div>

            <aside className="space-y-3 rounded-xl border border-surface-border bg-white p-3 lg:sticky lg:top-4 lg:self-start">
              {!item ? (
                <p className="text-sm text-ink-muted">Select a report to inspect details.</p>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {item.trustLabel}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-ink">{item.title}</h2>
                    <p className="mt-1 text-sm text-ink-muted">{item.description}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-ink-muted">Road</dt>
                      <dd className="font-medium">{item.roadName || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Severity</dt>
                      <dd className="font-medium">{labelize(item.severity)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Cause</dt>
                      <dd className="font-medium">{labelize(item.cause)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Status</dt>
                      <dd>
                        <StatusPill status={item.status} />
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-ink-muted">Location</dt>
                      <dd className="font-medium">
                        {[item.locationName, item.areaName, item.lgaName, item.stateName]
                          .filter(Boolean)
                          .join(' · ')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Freshness</dt>
                      <dd>
                        <StatusPill status={item.freshness} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Reporter</dt>
                      <dd className="font-medium">{item.authorDisplayName || '—'}</dd>
                    </div>
                  </dl>
                  <OsmMap
                    lat={item.coordinates?.lat}
                    lng={item.coordinates?.lng}
                    name={item.roadName || item.locationName}
                  />
                  {detail.related?.length ? (
                    <div>
                      <p className="text-xs font-semibold text-ink-muted">Related (same area, 12h)</p>
                      <ul className="mt-1 space-y-1 text-xs">
                        {detail.related.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              className="text-brand-700 underline"
                              onClick={() => openDetail(r.id)}
                            >
                              {labelize(r.severity)} · {r.roadName || '—'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p className="text-xs text-ink-muted">
                    Moderate community submissions in the{' '}
                    <Link href="/admin/moderation" className="text-brand-700 underline">
                      Moderation Center
                    </Link>
                    . Original report text is preserved.
                  </p>
                  {canEdit && editForm ? (
                    <form onSubmit={saveIncident} className="space-y-2 border-t border-surface-border pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        Admin correction
                      </p>
                      <FilterSelect
                        label="Severity"
                        value={editForm.severity}
                        onChange={(e) => setEditForm((f) => ({ ...f, severity: e.target.value }))}
                      >
                        {SEVERITIES.filter(Boolean).map((s) => (
                          <option key={s} value={s}>
                            {labelize(s)}
                          </option>
                        ))}
                      </FilterSelect>
                      <FilterSelect
                        label="Cause"
                        value={editForm.cause}
                        onChange={(e) => setEditForm((f) => ({ ...f, cause: e.target.value }))}
                      >
                        {CAUSES.filter(Boolean).map((c) => (
                          <option key={c} value={c}>
                            {labelize(c)}
                          </option>
                        ))}
                      </FilterSelect>
                      <FilterInput
                        label="Road name"
                        value={editForm.roadName}
                        onChange={(e) => setEditForm((f) => ({ ...f, roadName: e.target.value }))}
                      />
                      <FilterInput
                        label="Affected section"
                        value={editForm.affectedSection}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, affectedSection: e.target.value }))
                        }
                      />
                      <FilterSelect
                        label="Status"
                        value={editForm.status}
                        onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                      >
                        {STATUSES.filter(Boolean).map((s) => (
                          <option key={s} value={s}>
                            {labelize(s)}
                          </option>
                        ))}
                      </FilterSelect>
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
                        {busy === 'save' ? 'Saving…' : 'Save correction'}
                      </button>
                    </form>
                  ) : null}
                  {detail.adminActivity?.length ? (
                    <div>
                      <p className="text-xs font-semibold text-ink-muted">Admin history</p>
                      <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs text-ink-muted">
                        {detail.adminActivity.map((a, i) => (
                          <li key={`${a.action}-${i}`}>
                            {a.action} · {a.reason || '—'} ·{' '}
                            {a.createdAt ? new Date(a.createdAt).toLocaleString('en-NG') : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}
            </aside>
          </div>
        </>
      ) : null}

      {tab === 'quality' && quality ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(quality.counts || {}).map(([k, v]) => (
              <AdminCard key={k} title={labelize(k)} value={v} />
            ))}
          </div>
          <section className="rounded-xl border border-surface-border bg-white p-3">
            <h3 className="font-semibold">Duplicate candidates (same road, 6h)</h3>
            <p className="text-xs text-ink-muted">Review only — not auto-merged.</p>
            <ul className="mt-2 space-y-1 text-sm">
              {(quality.duplicateCandidates || []).map((d) => (
                <li key={`${d.placeKey}-${d.locationId}`}>
                  {d.roadName || d.locationName} · {d.count} reports
                </li>
              ))}
              {!quality.duplicateCandidates?.length ? (
                <li className="text-ink-muted">None flagged.</li>
              ) : null}
            </ul>
          </section>
          <section className="rounded-xl border border-surface-border bg-white p-3">
            <h3 className="font-semibold">Missing road context</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {(quality.missingRoadContext || []).slice(0, 15).map((r) => (
                <li key={r.id}>
                  <button type="button" className="text-brand-700 underline" onClick={() => {
                    setTab('directory');
                    openDetail(r.id);
                  }}>
                    {r.title || r.id}
                  </button>{' '}
                  · {r.location_name}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === 'sources' ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">
            Official advisories from approved sources (LASTMA, FRSC, etc.). These are not GPS-measured
            live traffic unless the source provides that.
          </p>
          {!sources.length ? (
            <EmptyState message="No traffic-related official sources configured." />
          ) : (
            <ul className="space-y-2">
              {sources.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-surface-border bg-white p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-xs text-ink-muted">{s.organizationName}</p>
                    </div>
                    <StatusPill status={s.status} />
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    Method: {s.ingestionMethod || '—'} · Last success:{' '}
                    {s.lastSuccessAt
                      ? new Date(s.lastSuccessAt).toLocaleString('en-NG')
                      : 'never'}
                    {s.lastError ? ` · Error: ${s.lastError}` : ''}
                  </p>
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
