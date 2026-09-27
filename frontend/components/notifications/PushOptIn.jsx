'use client';

import { useEffect, useState } from 'react';
import { notificationsApi, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Contextual Web Push opt-in — never prompts on first paint.
 */
export function PushOptIn({ className }) {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [subs, setSubs] = useState([]);

  useEffect(() => {
    notificationsApi
      .pushConfig()
      .then((d) => setConfig(d.push))
      .catch(() => setConfig({ enabled: false }));
    notificationsApi
      .pushSubscriptions()
      .then((d) => setSubs(d.items || []))
      .catch(() => setSubs([]));
  }, []);

  async function enable() {
    setError('');
    setStatus('working');
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        throw new Error('Push is not supported in this browser.');
      }
      if (!config?.enabled || !config.publicKey) {
        throw new Error(config?.note || 'Web Push is not configured on the server yet.');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permission was not granted. You can enable it later in browser settings.');
      }
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
      const json = subscription.toJSON();
      await notificationsApi.pushSubscribe({
        endpoint: json.endpoint,
        keys: json.keys,
        deviceLabel: navigator.platform || 'device',
      });
      const list = await notificationsApi.pushSubscriptions();
      setSubs(list.items || []);
      setStatus('ready');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof ApiError ? err.message : err.message || 'Could not enable push.');
    }
  }

  async function disable(sub) {
    setError('');
    try {
      await notificationsApi.pushUnsubscribe({ id: sub.id });
      setSubs((items) => items.filter((i) => i.id !== sub.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not revoke subscription.');
    }
  }

  return (
    <section className={className}>
      <h2 className="text-lg font-bold text-ink">Device alerts (PWA)</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Optional Web Push for this device. Permission is only requested when you choose Enable —
        never on first page load.
      </p>
      {config && !config.enabled ? (
        <p className="mt-2 text-xs text-ink-soft">{config.note}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-status-urgent">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={enable} disabled={status === 'working'}>
          {status === 'working' ? 'Enabling…' : 'Enable alerts on this device'}
        </Button>
      </div>
      {subs.length ? (
        <ul className="mt-3 space-y-2">
          {subs.map((sub) => (
            <li
              key={sub.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm"
            >
              <span className="text-ink-muted break-words">
                {sub.deviceLabel || 'Device'} · {sub.isActive ? 'Active' : 'Revoked'}
              </span>
              {sub.isActive ? (
                <button
                  type="button"
                  className="min-h-11 text-sm font-semibold text-ink-muted hover:underline"
                  onClick={() => disable(sub)}
                >
                  Revoke
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
