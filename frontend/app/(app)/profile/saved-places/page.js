'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { LocationSelector } from '@/components/location/LocationSelector';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Input';
import { ApiError, userApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { SAVED_PLACE_KINDS } from '@/lib/notifications';

export default function SavedPlacesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [placeKind, setPlaceKind] = useState('home');
  const [customName, setCustomName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await userApi.savedAreas();
      setItems(data.items || []);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load saved places.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addPlace(selection) {
    setBusy(true);
    setError('');
    try {
      await userApi.createSavedArea({
        locationId: selection.locationId,
        placeKind,
        customName: customName.trim() || undefined,
        notifyEnabled: true,
      });
      setCustomName('');
      setSelectorOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save place.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setBusy(true);
    try {
      await userApi.deleteSavedArea(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove place.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleNotify(item) {
    try {
      await userApi.updateSavedArea(item.id, { notifyEnabled: !item.notifyEnabled });
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
        <h1 className="text-2xl font-bold tracking-tight text-ink">Saved places</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Save Home, Work, or other areas — without private street addresses.
        </p>
      </div>

      <div className="space-y-4 rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
        <p className="text-sm font-medium text-ink">Add a place</p>
        <div className="flex flex-wrap gap-2">
          {SAVED_PLACE_KINDS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setPlaceKind(item.value)}
              className={cn(
                'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
                placeKind === item.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-muted text-ink-muted'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <Input
          id="saved-place-name"
          label="Custom name (optional)"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="e.g. Mum's place"
          maxLength={80}
        />
        <Button type="button" disabled={busy} onClick={() => setSelectorOpen(true)}>
          Choose location
        </Button>
      </div>

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
                    {item.location?.name}
                    {item.location?.subtitle ? ` · ${item.location.subtitle}` : ''}
                  </p>
                  <p className="mt-2 text-xs text-ink-soft capitalize">{item.placeKindLabel}</p>
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
        <p className="text-sm text-ink-muted">No saved places yet.</p>
      )}

      <LocationSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={async (selection) => {
          await addPlace(selection);
        }}
      />
    </div>
  );
}
