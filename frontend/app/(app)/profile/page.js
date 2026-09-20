'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { ApiError, userApi } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function ProfilePage() {
  const { user } = useAuth();
  const [areas, setAreas] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [preferences, setPreferences] = useState([]);
  const [error, setError] = useState('');
  const [savingPref, setSavingPref] = useState('');

  useEffect(() => {
    Promise.all([
      userApi.savedAreas().catch(() => ({ items: [] })),
      userApi.savedRoutes().catch(() => ({ items: [] })),
      userApi.notificationPreferences().catch(() => ({ preferences: [] })),
    ]).then(([a, r, p]) => {
      setAreas(a.items || []);
      setRoutes(r.items || []);
      setPreferences(p.preferences || []);
    });
  }, []);

  async function togglePref(category, enabled) {
    setSavingPref(category);
    setError('');
    try {
      const next = preferences.map((item) =>
        item.category === category ? { ...item, enabled } : item
      );
      const data = await userApi.updateNotificationPreferences(
        next.map((item) => ({ category: item.category, enabled: item.enabled }))
      );
      setPreferences(data.preferences || next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update preferences.');
    } finally {
      setSavingPref('');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Profile</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {user?.displayName || 'Your account'}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Manage saved places, routes, and which useful updates you receive in-app.
        </p>
        {(user?.adminRole || user?.isModerator) && (
          <p className="mt-3">
            <Link href="/admin" className="text-sm font-semibold text-brand-700 underline">
              Open Admin dashboard
            </Link>
          </p>
        )}
      </div>

      <section className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">Saved places</h2>
          <Button as={Link} href="/profile/saved-places" size="sm">
            Manage
          </Button>
        </div>
        {areas.length ? (
          <ul className="mt-3 space-y-2">
            {areas.slice(0, 4).map((item) => (
              <li key={item.id} className="text-sm text-ink-muted break-words">
                <span className="font-semibold text-ink">{item.displayName}</span>
                {item.location?.name ? ` · ${item.location.name}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No saved places yet.</p>
        )}
      </section>

      <section className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">Saved routes</h2>
          <Button as={Link} href="/profile/saved-routes" size="sm">
            Manage
          </Button>
        </div>
        {routes.length ? (
          <ul className="mt-3 space-y-2">
            {routes.slice(0, 4).map((item) => (
              <li key={item.id} className="text-sm text-ink-muted break-words">
                <span className="font-semibold text-ink">{item.displayName}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No saved routes yet.</p>
        )}
      </section>

      <section className="rounded-card border border-surface-border bg-white p-4 shadow-card sm:p-5">
        <h2 className="text-lg font-bold text-ink">Notification preferences</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Keep this quiet. Only enable categories you want to hear about.
        </p>
        <FormError message={error} />
        <ul className="mt-4 space-y-3">
          {preferences.map((item) => (
            <li
              key={item.category}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border/70 pb-3 last:border-0"
            >
              <span className="text-sm font-medium text-ink">{item.label || item.category}</span>
              <button
                type="button"
                disabled={savingPref === item.category}
                onClick={() => togglePref(item.category, !item.enabled)}
                className={cn(
                  'min-h-10 rounded-pill px-3 py-1.5 text-xs font-semibold',
                  item.enabled ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-muted'
                )}
              >
                {item.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Button as={Link} href="/notifications" variant="secondary">
        Open notifications
      </Button>
    </div>
  );
}
