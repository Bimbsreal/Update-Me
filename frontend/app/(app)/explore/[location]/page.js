'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LocationBreadcrumbs } from '@/components/location/LocationBreadcrumbs';
import { MapFoundation } from '@/components/location/MapFoundation';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, locationsApi } from '@/lib/api';

const modules = [
  { key: 'traffic', title: 'Traffic', body: 'Community traffic conditions for this area.' },
  { key: 'fuel', title: 'Fuel', body: 'Fuel prices and availability nearby.' },
  { key: 'transport', title: 'Transport', body: 'Routes and fares connected to this area.' },
  { key: 'prices', title: 'Prices', body: 'Everyday commodity prices around here.' },
  { key: 'alerts', title: 'Alerts', body: 'Local alerts and road conditions.' },
  { key: 'directions', title: 'Directions', body: 'Local route context and community knowledge.' },
  { key: 'community', title: 'Community', body: 'Utility questions and local knowledge.' },
];

export default function ExploreLocationPage() {
  const params = useParams();
  const locationKey = params?.location;
  const { setLocation } = useAuth();
  const [location, setLoc] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!locationKey) return;
    setLoading(true);
    locationsApi
      .get(locationKey)
      .then((data) => {
        setLoc(data.location);
        setError('');
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Unable to load location.');
        setLoc(null);
      })
      .finally(() => setLoading(false));
  }, [locationKey]);

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading location…</p>;
  }

  if (error || !location) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-status-urgent">{error || 'Location not found.'}</p>
        <Button as={Link} href="/explore" variant="secondary">
          Back to Explore
        </Button>
      </div>
    );
  }

  const crumbs = (location.breadcrumb || []).map((item, index, arr) => {
    const isLast = index === arr.length - 1;
    if (isLast) return { ...item };
    if (item.type === 'area' || item.type === 'lga' || item.type === 'state') {
      return { ...item, href: `/explore/${item.id}` };
    }
    return { ...item };
  });

  return (
    <div className="space-y-6">
      <LocationBreadcrumbs items={crumbs.length ? crumbs : [{ name: 'Nigeria' }, { name: location.name }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink break-words sm:text-3xl">
            {location.name}
          </h1>
          <p className="mt-2 text-sm text-ink-muted break-words">
            {location.subtitle ||
              [location.lga?.name ? `${location.lga.name} LGA` : null, location.state?.name]
                .filter(Boolean)
                .join(' · ')}
          </p>
        </div>
        {location.type === 'area' ? (
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await setLocation({
                  locationId: location.id,
                  areaId: location.area?.id,
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Set as my area'}
          </Button>
        ) : null}
      </div>

      <MapFoundation
        label="Location map foundation"
        coordinates={location.coordinates}
      />

      <div className="flex flex-wrap gap-2">
        <Button as={Link} href={`/explore?locationId=${location.id}`} variant="secondary">
          Explore this area
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <article
            key={mod.key}
            className="rounded-card border border-surface-border bg-surface-muted/60 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold text-ink">{mod.title}</h2>
              <span className="rounded-pill bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                {['traffic', 'fuel', 'transport', 'prices', 'alerts', 'directions', 'community'].includes(
                  mod.key
                )
                  ? 'Open module'
                  : 'Not available yet'}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-muted">{mod.body}</p>
            {mod.key === 'traffic' ? (
              <Link
                href="/traffic"
                className="mt-3 inline-flex text-sm font-semibold text-brand-700 hover:underline"
              >
                View traffic →
              </Link>
            ) : null}
            {mod.key === 'community' ? (
              <Link
                href="/community"
                className="mt-3 inline-flex text-sm font-semibold text-brand-700 hover:underline"
              >
                Ask the Community →
              </Link>
            ) : null}
            {mod.key === 'directions' ? (
              <Link
                href="/directions"
                className="mt-3 inline-flex text-sm font-semibold text-brand-700 hover:underline"
              >
                Open Directions →
              </Link>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
