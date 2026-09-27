'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { LocationSelector } from '@/components/location/LocationSelector';
import { useLocationSource } from '@/components/location/LocationSourceProvider';
import { useRealtime } from '@/components/realtime/RealtimeProvider';
import { ConflictBreakdown } from '@/components/quality/QualitySignals';
import {
  HomeLiveNotice,
  HomeLocationBar,
  HomeMetaLine,
  HomeSavedSwitcher,
  HomeSection,
  formatHomeAge,
  formatNaira,
} from '@/components/home/HomeParts';
import { ApiError, homeApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { LOCATION_SOURCES, contextModeTitle } from '@/lib/locationSource';

function qualityBits(item) {
  const parts = [];
  if (item?.quality?.source?.label) parts.push(item.quality.source.label);
  else if (item?.trustLabel) parts.push(item.trustLabel);
  else if (item?.sourceType === 'official') parts.push('Official');
  else if (item?.sourceType === 'community') parts.push('Community Report');

  const age =
    item?.quality?.freshness?.label ||
    formatHomeAge(item?.updatedAt || item?.publishedAt);
  if (age) {
    parts.push(
      /ago|Just now|Today|Stale|Expired/i.test(age) && !/^Updated /i.test(age)
        ? `Updated ${age}`
        : age
    );
  }
  if (item?.quality?.corroboration?.count >= 2) {
    parts.push(item.quality.corroboration.label);
  }
  return parts.filter(Boolean).join(' · ');
}

export default function HomePage() {
  const { user, setLocation } = useAuth();
  const { context, setSavedSource, setFromSelection, source } = useLocationSource();
  const { subscribe, setExploreLocationId } = useRealtime();
  const [home, setHome] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedAreaId, setSavedAreaId] = useState('');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingLabel, setPendingLabel] = useState('');

  const loadHome = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await homeApi.get({
        savedAreaId: savedAreaId || undefined,
      });
      setHome(data.home || null);
      const locId = data.home?.location?.location?.id;
      if (locId) setExploreLocationId(locId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load your home updates.');
      if (!silent) setHome(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [savedAreaId, setExploreLocationId]);

  useEffect(() => {
    loadHome();
  }, [loadHome]);

  useEffect(() => {
    return subscribe(({ type }) => {
      if (!type || type.startsWith('notification.') || type.startsWith('saved_')) return;
      if (
        type.includes('traffic') ||
        type.includes('alert') ||
        type.includes('fuel') ||
        type.includes('transport') ||
        type.includes('price') ||
        type.includes('official') ||
        type.includes('report')
      ) {
        setPendingCount((n) => Math.min(99, n + 1));
        if (type.includes('traffic')) setPendingLabel('New traffic update');
        else if (type.includes('alert')) setPendingLabel('New safety alert');
        else if (type.includes('official')) setPendingLabel('New official update');
        else setPendingLabel('');
      }
    });
  }, [subscribe]);

  async function handleSelectArea(selection) {
    await setLocation(selection);
    setSavedAreaId('');
    setFromSelection({
      ...selection,
      source: selection.source || (selection.privateLat ? LOCATION_SOURCES.DEVICE : LOCATION_SOURCES.MANUAL),
    });
    setSelectorOpen(false);
  }

  async function handleRefreshLive() {
    setPendingCount(0);
    setPendingLabel('');
    await loadHome({ silent: true });
  }

  const contextLabel = home?.location?.label || user?.currentArea?.name || context.label || 'Your area';
  const contextSubtitle = home?.location?.contextLabel || null;
  const modeTitle =
    savedAreaId
      ? contextModeTitle(LOCATION_SOURCES.SAVED)
      : contextModeTitle(source || context.source || (home?.location?.mode === 'saved_area' ? 'saved' : 'manual'));

  const empty = home?.meta?.empty;

  const content = useMemo(() => {
    if (loading && !home) {
      return <p className="text-sm text-ink-muted">Loading updates around you…</p>;
    }
    if (error && !home) {
      return (
        <div className="rounded-card border border-status-attention/30 bg-white p-4 text-sm text-ink-muted">
          {error}
          <button
            type="button"
            className="mt-3 block text-sm font-semibold text-brand-700"
            onClick={() => loadHome()}
          >
            Try again
          </button>
        </div>
      );
    }
    if (!home) return null;

    return (
      <>
        {empty ? (
          <section className="rounded-card border border-dashed border-brand-200 bg-white p-5 text-center shadow-card sm:p-8">
            <h2 className="text-lg font-bold text-ink">Your local updates will appear here.</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
              Choose an area, save a place you care about, explore nearby information, or report a useful update.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setSelectorOpen(true)}
                className="rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Choose an area
              </button>
              <Link
                href="/profile/saved-places"
                className="rounded-control border border-surface-border px-4 py-2 text-sm font-semibold text-ink"
              >
                Save a place
              </Link>
              <Link
                href={home.meta.explorePath}
                className="rounded-control border border-surface-border px-4 py-2 text-sm font-semibold text-ink"
              >
                Explore nearby
              </Link>
              <Link
                href={home.meta.reportPath}
                className="rounded-control border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700"
              >
                Report an update
              </Link>
            </div>
          </section>
        ) : null}

        {(home.conflicts || []).length ? (
          <div className="space-y-2">
            {home.conflicts.map((c, idx) => (
              <ConflictBreakdown key={`${c.placeName}-${idx}`} conflict={c} />
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <HomeSection
            title="Traffic"
            href={home.traffic.modulePath}
            actionLabel="View traffic"
            emptyMessage={home.traffic.emptyMessage}
          >
            {home.traffic.items?.length
              ? home.traffic.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.detailPath}
                    className="block rounded-lg border border-surface-border/80 px-3 py-2 hover:border-brand-200"
                  >
                    <p className="text-sm font-bold capitalize text-ink">
                      {String(item.severity).replace(/_/g, ' ')} traffic
                    </p>
                    <p className="text-sm text-ink-muted">{item.roadName || item.locationName}</p>
                    <HomeMetaLine>{qualityBits(item)}</HomeMetaLine>
                  </Link>
                ))
              : null}
          </HomeSection>

          <HomeSection
            title="Safety"
            href={home.safety.modulePath}
            actionLabel="View alerts"
            emptyMessage={home.safety.emptyMessage}
            emphasize={Boolean(home.safety.items?.length)}
          >
            {home.safety.items?.length
              ? home.safety.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.detailPath}
                    className="block rounded-lg border border-surface-border/80 px-3 py-2 hover:border-brand-200"
                  >
                    <p className="text-sm font-bold text-ink">
                      {item.alertCategoryLabel || item.title}
                    </p>
                    <p className="text-sm capitalize text-ink-muted">
                      {item.locationName}
                      {item.severityLabel ? ` · ${item.severityLabel}` : ''}
                    </p>
                    <HomeMetaLine>{qualityBits(item)}</HomeMetaLine>
                  </Link>
                ))
              : null}
          </HomeSection>

          <HomeSection
            title="Fuel Prices Near You"
            href={home.fuel.modulePath}
            actionLabel="View Fuel Prices"
            emptyMessage={
              home.fuel.emptyMessage || 'Choose your location to see nearby pump prices.'
            }
          >
            {home.fuel.items?.length
              ? home.fuel.items.slice(0, 2).map((item) => (
                  <Link
                    key={item.id}
                    href={item.detailPath}
                    className="block rounded-lg border border-surface-border/80 px-3 py-2 hover:border-brand-200"
                  >
                    <p className="text-sm font-bold text-ink">
                      PMS
                      {formatNaira(item.price?.amount)
                        ? `: ${formatNaira(item.price.amount)}/L`
                        : ''}
                    </p>
                    <p className="text-sm text-ink-muted">{item.name}</p>
                    <HomeMetaLine>
                      {item.price?.observedAt || item.updatedAt
                        ? `Last updated: ${formatHomeAge(item.price?.observedAt || item.updatedAt)}`
                        : qualityBits(item)}
                    </HomeMetaLine>
                  </Link>
                ))
              : null}
          </HomeSection>

          <HomeSection
            title="Transport"
            href={home.transport.modulePath}
            actionLabel="View transport"
            emptyMessage={home.transport.emptyMessage}
          >
            {home.transport.items?.length
              ? home.transport.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.detailPath}
                    className="block rounded-lg border border-surface-border/80 px-3 py-2 hover:border-brand-200"
                  >
                    <p className="text-sm font-bold text-ink">{item.name}</p>
                    <p className="text-sm text-ink-muted">
                      {item.mode ? String(item.mode).replace(/_/g, ' ') : 'Fare'}
                      {item.fareSummary?.amount != null
                        ? ` · ${formatNaira(item.fareSummary.amount)}`
                        : item.fareSummary?.min != null
                          ? ` · ${formatNaira(item.fareSummary.min)}${
                              item.fareSummary.max != null && item.fareSummary.max !== item.fareSummary.min
                                ? `–${formatNaira(item.fareSummary.max)}`
                                : ''
                            }`
                          : ''}
                    </p>
                    <HomeMetaLine>{formatHomeAge(item.updatedAt)}</HomeMetaLine>
                  </Link>
                ))
              : null}
          </HomeSection>

          <HomeSection
            title="Commodity Watch"
            href={home.prices.modulePath}
            actionLabel="View Prices"
            emptyMessage={
              home.prices.emptyMessage || 'Choose your location to see nearby commodity prices.'
            }
          >
            {home.prices.items?.length
              ? home.prices.items.slice(0, 3).map((item) => (
                  <Link
                    key={`${item.commodity?.id}-${item.variant?.id}`}
                    href={item.detailPath}
                    className={cn(
                      'block rounded-lg border border-surface-border/80 px-3 py-2 hover:border-brand-200',
                      (item.freshness === 'stale' || item.quality?.freshness?.state === 'stale') &&
                        'opacity-80'
                    )}
                  >
                    <p className="text-sm font-bold text-ink">
                      {item.commodity?.name}
                      {item.priceRange?.min != null
                        ? ` · ${formatNaira(item.priceRange.min)}${
                            item.priceRange.max != null &&
                            item.priceRange.max !== item.priceRange.min
                              ? `–${formatNaira(item.priceRange.max)}`
                              : ''
                          }`
                        : ''}
                      {item.variant?.displayName ? ` / ${item.variant.displayName}` : ''}
                    </p>
                    <HomeMetaLine>
                      {formatHomeAge(item.updatedAt)
                        ? `Last updated: ${formatHomeAge(item.updatedAt)}`
                        : 'Community observations — not an official price'}
                    </HomeMetaLine>
                  </Link>
                ))
              : null}
          </HomeSection>

          <HomeSection
            title="Official Updates"
            href={home.official.modulePath}
            actionLabel="View official"
            emptyMessage={home.official.emptyMessage}
          >
            {home.official.items?.length
              ? home.official.items.map((item) => (
                  <Link
                    key={item.id}
                    href={item.detailPath}
                    className="block rounded-lg border border-status-official/25 bg-status-official/5 px-3 py-2 hover:border-status-official/40"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide text-status-official">
                      Official
                    </p>
                    <p className="text-sm font-bold text-ink">{item.title}</p>
                    <HomeMetaLine>
                      {item.agencyName}
                      {formatHomeAge(item.publishedAt)
                        ? ` · Published ${formatHomeAge(item.publishedAt)}`
                        : ''}
                    </HomeMetaLine>
                  </Link>
                ))
              : null}
          </HomeSection>
        </div>

        {home.routes?.items?.length ? (
          <HomeSection title="Your Routes" href={home.routes.modulePath} actionLabel="Manage">
            {home.routes.items.map((route) => (
              <Link
                key={route.id}
                href={route.detailPath}
                className="block rounded-lg border border-surface-border/80 px-3 py-2.5 hover:border-brand-200"
              >
                <p className="text-sm font-bold text-ink">{route.displayName}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Traffic: <span className="font-semibold capitalize text-ink">{route.traffic}</span>
                  {' · '}
                  Safety: <span className="font-semibold text-ink">{route.safety}</span>
                </p>
                <HomeMetaLine>{formatHomeAge(route.updatedAt)}</HomeMetaLine>
              </Link>
            ))}
          </HomeSection>
        ) : null}

        <HomeSection
          title="Recent Changes"
          href={home.recentChanges.notificationsPath}
          actionLabel="Inbox"
          emptyMessage={home.recentChanges.emptyMessage}
        >
          {home.recentChanges.items?.length
            ? home.recentChanges.items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block rounded-lg border border-surface-border/80 px-3 py-2 hover:border-brand-200"
                >
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  <HomeMetaLine>
                    {item.category?.replace(/_/g, ' ')}
                    {formatHomeAge(item.createdAt) ? ` · ${formatHomeAge(item.createdAt)}` : ''}
                  </HomeMetaLine>
                </Link>
              ))
            : null}
        </HomeSection>

        {home.fx?.rate != null ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-surface-border bg-white px-4 py-3 text-sm shadow-card">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">FX</p>
              <p className="font-bold text-ink">
                {home.fx.pair}{' '}
                <span className="tabular-nums text-brand-800">{formatNaira(home.fx.rate)}</span>
              </p>
            </div>
            <p className="text-xs text-ink-muted">
              {formatHomeAge(home.fx.observedAt)
                ? `Updated ${formatHomeAge(home.fx.observedAt)}`
                : 'Market reference'}
            </p>
          </div>
        ) : null}

        <div className="rounded-card border border-brand-100 bg-brand-50/60 p-4 sm:p-5">
          <h2 className="text-base font-bold text-ink">Report an update</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Share traffic, fuel, fares, prices, or safety information for {contextLabel}.
          </p>
          <Link
            href={home.meta.reportPath}
            className="mt-3 inline-flex rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Report an update
          </Link>
        </div>
      </>
    );
  }, [loading, home, error, empty, contextLabel, loadHome]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          What’s happening around you?
        </h1>
        <p className="mt-1 text-sm text-ink-muted">Updates from your selected and saved places.</p>
      </div>

      <HomeLocationBar
        modeTitle={modeTitle}
        label={contextLabel}
        subtitle={
          user?.currentArea
            ? [user.currentArea.lga, user.currentArea.state].filter(Boolean).join(', ')
            : contextSubtitle
        }
        onChangeArea={() => setSelectorOpen(true)}
      />

      <HomeSavedSwitcher
        areas={home?.savedAreas || []}
        activeSavedAreaId={savedAreaId}
        onSelectCurrent={() => {
          setSavedAreaId('');
          if (context.source === LOCATION_SOURCES.SAVED) {
            setFromSelection({
              source: LOCATION_SOURCES.MANUAL,
              locationId: user?.currentArea?.locationId,
              areaId: user?.currentArea?.id,
              label: user?.currentArea?.name,
            });
          }
        }}
        onSelectArea={(area) => {
          setSavedAreaId(area.id);
          setSavedSource({
            label: area.displayName || area.locationName,
            locationId: area.locationId,
            public: { name: area.displayName || area.locationName },
          });
        }}
      />

      <HomeLiveNotice count={pendingCount} label={pendingLabel} onRefresh={handleRefreshLive} />

      {content}

      <LocationSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={handleSelectArea}
      />
    </div>
  );
}
