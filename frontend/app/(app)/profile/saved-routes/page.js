'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PlaceSearchField } from '@/components/directions/PlaceSearchField';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Input';
import { ApiError, userApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { SAVED_ROUTE_MODES } from '@/lib/notifications';

export default function SavedRoutesPage() {
  const [items, setItems] = useState([]);
  const [origin, setOrigin] = useState(null);
  const [destination, setDestination] = useState(null);
  const [customName, setCustomName] = useState('');
  const [travelMode, setTravelMode] = useState('any');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await userApi.savedRoutes();
      setItems(data.items || []);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load saved routes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!origin?.locationId || !destination?.locationId) {
      setError('Choose both origin and destination.');
      return;
    }
    setBusy(true);
    try {
      await userApi.createSavedRoute({
        originLocationId: origin.locationId,
        destinationLocationId: destination.locationId,
        customName: customName.trim() || undefined,
        travelMode,
        notifyEnabled: true,
      });
      setCustomName('');
      setOrigin(null);
      setDestination(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save route.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setBusy(true);
    try {
      await userApi.deleteSavedRoute(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove route.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleNotify(item) {
    try {
      await userApi.updateSavedRoute(item.id, { notifyEnabled: !item.notifyEnabled });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update notifications.');
    }
  }

  return (
    <div className="space-y-6">
      <Button as={Link} href="/profile" variant="secondary" size="sm">
        ← Profile
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Saved routes</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Save corridors you care about — e.g. Home → Work — to surface relevant traffic and alerts.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5"
      >
        <PlaceSearchField
          id="saved-route-from"
          label="From"
          value={origin}
          onChange={setOrigin}
          placeholder="Origin area, road, landmark…"
        />
        <PlaceSearchField
          id="saved-route-to"
          label="To"
          value={destination}
          onChange={setDestination}
          placeholder="Destination…"
        />
        <Input
          id="saved-route-name"
          label="Custom name (optional)"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="e.g. Home → Work"
          maxLength={80}
        />
        <div>
          <p className="mb-2 text-sm font-medium text-ink">Transport mode</p>
          <div className="flex flex-wrap gap-2">
            {SAVED_ROUTE_MODES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setTravelMode(item.value)}
                className={cn(
                  'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                  travelMode === item.value
                    ? 'bg-brand-600 text-white'
                    : 'bg-surface-muted text-ink-muted'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save route'}
        </Button>
      </form>

      <FormError message={error} />

      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : items.length ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-card border border-surface-border bg-white p-4 shadow-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink break-words">{item.displayName}</p>
                  <p className="mt-1 text-sm text-ink-muted break-words">
                    {item.origin?.name} → {item.destination?.name}
                  </p>
                  <p className="mt-2 text-xs capitalize text-ink-soft">
                    {item.travelMode?.replace(/_/g, ' ')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => toggleNotify(item)}
                  >
                    {item.notifyEnabled ? 'Notify on' : 'Notify off'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => remove(item.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">No saved routes yet.</p>
      )}
    </div>
  );
}
