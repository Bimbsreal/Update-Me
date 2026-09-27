'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/api';
import { ConfirmAction, EmptyState, StatusPill } from '@/components/admin/AdminUI';

export default function AdminNotificationsPage() {
  const [dashboard, setDashboard] = useState(null);
  const [rules, setRules] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [emergency, setEmergency] = useState({
    title: '',
    message: '',
    reason: '',
    scope: 'saved_places_only',
    confirm: false,
  });

  const load = useCallback(() => {
    adminApi
      .notificationDashboard()
      .then((d) => {
        setDashboard(d.dashboard);
        setRules(d.dashboard?.rules || []);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'));
    adminApi
      .notificationRules()
      .then((d) => setRules(d.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleRule(rule) {
    setBusy(rule.code);
    setError('');
    try {
      await adminApi.patchNotificationRule(rule.code, {
        enabled: !rule.enabled,
        reason: rule.enabled ? 'Disable alert rule' : 'Enable alert rule',
      });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed');
    } finally {
      setBusy('');
    }
  }

  async function sendEmergency(e) {
    e.preventDefault();
    setBusy('emergency');
    setError('');
    try {
      const result = await adminApi.sendEmergencyNotification({
        ...emergency,
        confirm: true,
      });
      setEmergency({ title: '', message: '', reason: '', scope: 'saved_places_only', confirm: false });
      alert(`Emergency sent to ${result.notified} of ${result.candidates} candidates.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Emergency send failed');
    } finally {
      setBusy('');
    }
  }

  const m = dashboard?.metrics;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Centralized alert engine metrics and rules. Does not override individual user preferences.
        </p>
      </div>

      {error ? <p className="text-sm text-status-urgent">{error}</p> : null}

      {m ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[
            { label: 'Generated (7d)', value: m.notifications?.generated },
            { label: 'Delivered', value: m.notifications?.delivered },
            { label: 'Failed', value: m.notifications?.failed },
            { label: 'Unread', value: m.notifications?.unread },
            { label: 'Read', value: m.notifications?.read },
            { label: 'Push subscriptions', value: m.pushSubscriptions?.active },
            { label: 'Email deliveries', value: m.deliveries?.email },
            { label: 'Active inbox', value: m.notifications?.active },
            { label: 'Alert rules', value: m.alertRules?.enabled },
            { label: 'Suppressed', value: m.deliveries?.suppressed },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-surface-border bg-white px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{item.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{item.value ?? 0}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="Loading metrics…" />
      )}

      <section className="rounded-xl border border-surface-border bg-white p-4">
        <h2 className="text-lg font-bold">Alert rules</h2>
        <p className="mt-1 text-xs text-ink-muted">
          System defaults for cooldowns, TTL, and channels. Changing a rule does not rewrite user prefs.
        </p>
        <div className="mt-4 space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.code}
              className="flex flex-col gap-2 rounded-lg border border-surface-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink break-words">{rule.name}</p>
                <p className="text-xs text-ink-muted break-words">
                  {rule.code} · {rule.category} · cooldown {rule.cooldownMinutes}m · TTL{' '}
                  {rule.ttlHours}h
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={rule.enabled ? 'active' : 'disabled'} />
                <ConfirmAction
                  label={busy === rule.code ? '…' : rule.enabled ? 'Disable' : 'Enable'}
                  disabled={busy === rule.code}
                  onConfirm={() => toggleRule(rule)}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
        <h2 className="text-lg font-bold text-ink">Emergency public alert</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Controlled broadcast to users with saved places (or a scoped location). Requires explicit
          confirmation and a reason. Audited.
        </p>
        <form onSubmit={sendEmergency} className="mt-4 grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium text-ink-muted sm:col-span-2">
            Title
            <input
              required
              minLength={5}
              value={emergency.title}
              onChange={(e) => setEmergency((s) => ({ ...s, title: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-ink-muted sm:col-span-2">
            Message
            <textarea
              required
              minLength={10}
              rows={3}
              value={emergency.message}
              onChange={(e) => setEmergency((s) => ({ ...s, message: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-ink-muted sm:col-span-2">
            Reason (audit)
            <input
              required
              minLength={8}
              value={emergency.reason}
              onChange={(e) => setEmergency((s) => ({ ...s, reason: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-ink-muted sm:col-span-2">
            <input
              type="checkbox"
              checked={emergency.confirm}
              onChange={(e) => setEmergency((s) => ({ ...s, confirm: e.target.checked }))}
              className="size-4"
              required
            />
            I confirm this is a legitimate emergency / public advisory (saved-places scope).
          </label>
          <button
            type="submit"
            disabled={busy === 'emergency' || !emergency.confirm}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
          >
            {busy === 'emergency' ? 'Sending…' : 'Send emergency alert'}
          </button>
        </form>
      </section>
    </div>
  );
}
