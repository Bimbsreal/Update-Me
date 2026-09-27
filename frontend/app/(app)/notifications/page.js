'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NotificationCard } from '@/components/notifications/NotificationCard';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { ApiError, notificationsApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import { NOTIFICATION_CATEGORIES, notificationHref } from '@/lib/notifications';

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { status, limit: 40 };
      if (category) params.category = category;
      const data = await notificationsApi.list(params);
      setItems(data.items || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      setItems([]);
      setError(err instanceof ApiError ? err.message : 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [status, category]);

  useEffect(() => {
    load();
  }, [load]);

  async function openItem(item) {
    try {
      if (!item.read) await notificationsApi.markRead(item.id);
    } catch {
      // still navigate
    }
    router.push(notificationHref(item));
  }

  async function markAll() {
    setBusy(true);
    try {
      await notificationsApi.markAllRead();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not mark all as read.');
    } finally {
      setBusy(false);
    }
  }

  async function archiveItem(item) {
    try {
      await notificationsApi.archive(item.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not archive.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Notifications
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Useful updates for your places
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            In-app alerts for meaningful changes near your saved areas and routes — not every
            community confirmation. Manage preferences and price/FX alerts in Profile.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as={Link} href="/profile" variant="ghost" size="sm">
            Preferences
          </Button>
          <Button type="button" variant="secondary" disabled={busy || unreadCount === 0} onClick={markAll}>
            {busy ? 'Updating…' : 'Mark all as read'}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { value: 'all', label: 'All' },
          { value: 'unread', label: `Unread${unreadCount ? ` (${unreadCount})` : ''}` },
          { value: 'read', label: 'Read' },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setStatus(item.value)}
            className={cn(
              'min-h-11 rounded-pill px-3 py-1.5 text-xs font-semibold',
              status === item.value ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink-muted'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory('')}
          className={cn(
            'min-h-10 rounded-pill px-3 py-1.5 text-xs font-semibold',
            !category ? 'border border-brand-200 bg-brand-50 text-brand-800' : 'text-ink-muted'
          )}
        >
          All categories
        </button>
        {NOTIFICATION_CATEGORIES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setCategory(item.value)}
            className={cn(
              'min-h-10 rounded-pill px-3 py-1.5 text-xs font-semibold',
              category === item.value
                ? 'border border-brand-200 bg-brand-50 text-brand-800'
                : 'text-ink-muted'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <FormError message={error} />

      {loading ? (
        <p className="text-sm text-ink-muted">Loading notifications…</p>
      ) : items.length ? (
        <div className="grid gap-3">
          {items.map((item) => (
            <NotificationCard key={item.id} item={item} onOpen={openItem} onArchive={archiveItem} />
          ))}
        </div>
      ) : (
        <div className="rounded-card border border-dashed border-surface-border p-5 text-sm text-ink-muted">
          No notifications yet. Save places and routes in Profile to receive useful local updates.
        </div>
      )}
    </div>
  );
}
