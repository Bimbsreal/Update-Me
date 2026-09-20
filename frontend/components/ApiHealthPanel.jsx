'use client';

import { useEffect, useState } from 'react';
import { fetchHealth } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { StatusIndicator } from '@/components/ui/StatusIndicator';

export function ApiHealthPanel() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await fetchHealth();
        if (active) {
          setHealth(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Unable to reach API');
          setHealth(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <Card className="border-brand-100 bg-brand-50/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
            Local foundation status
          </p>
          <h3 className="mt-1 text-lg font-bold text-ink">API Health</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Connected to <code className="text-brand-700">localhost:5000/api/v1/health</code>
          </p>
        </div>
        {loading ? (
          <Badge tone="neutral">Checking…</Badge>
        ) : error ? (
          <StatusIndicator status="urgent" label="API offline" />
        ) : (
          <StatusIndicator status="available" label="API online" />
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-control bg-white/80 p-3 border border-surface-border">
          <p className="text-xs text-ink-muted">Service</p>
          <p className="mt-1 text-sm font-semibold">{health?.service || '—'}</p>
        </div>
        <div className="rounded-control bg-white/80 p-3 border border-surface-border">
          <p className="text-xs text-ink-muted">Database</p>
          <p className="mt-1 text-sm font-semibold">
            {error
              ? 'Unreachable'
              : health?.database?.connected
                ? `Connected${health.database.postgis ? ' · PostGIS' : ''}`
                : 'Not connected'}
          </p>
        </div>
        <div className="rounded-control bg-white/80 p-3 border border-surface-border">
          <p className="text-xs text-ink-muted">Timestamp</p>
          <p className="mt-1 text-sm font-semibold">
            {health?.timestamp
              ? new Date(health.timestamp).toLocaleTimeString()
              : '—'}
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-status-urgent">
          {error}. Start the backend with <code>npm run dev</code> in{' '}
          <code>/backend</code>.
        </p>
      ) : null}
    </Card>
  );
}
