'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertsComposer } from '@/components/alerts/AlertsComposer';
import { OfficialUpdateCard } from '@/components/official/OfficialUpdateCard';
import { ReportTrustLabel, ReportStatusBadge } from '@/components/reports/ReportTrustLabel';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Input';
import { ApiError, alertsApi, officialApi } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  ALERT_FLAG_REASONS,
  alertCategoryLabel,
  alertFreshnessLabel,
  alertSeverityClass,
  alertSeverityMeta,
  formatAlertAge,
} from '@/lib/alerts';

export default function AlertDetailPage() {
  const params = useParams();
  const id = params?.id;
  const [alert, setAlert] = useState(null);
  const [history, setHistory] = useState([]);
  const [officialItems, setOfficialItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [flagReason, setFlagReason] = useState('inaccurate');
  const [composerOpen, setComposerOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [detail, hist, official] = await Promise.all([
        alertsApi.get(id),
        alertsApi.history(id).catch(() => ({ events: [] })),
        officialApi
          .context({ limit: 3, category: 'road_traffic' })
          .catch(() => ({ items: [] })),
      ]);
      setAlert(detail.alert);
      setHistory(hist.events || []);
      setOfficialItems(official.items || []);
      setError('');
    } catch (err) {
      setAlert(null);
      setError(err instanceof ApiError ? err.message : 'Unable to load alert.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleConfirm(type) {
    setActionError('');
    try {
      await alertsApi.confirm(id, { type });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Confirmation failed.');
    }
  }

  async function handleCorrect() {
    setActionError('');
    try {
      await alertsApi.correct(id, {
        type: 'no_longer_happening',
        note: 'Marked no longer happening from alert page',
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Correction failed.');
    }
  }

  async function handleFlag() {
    setActionError('');
    try {
      await alertsApi.flag(id, { reason: flagReason });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Flag failed.');
    }
  }

  if (loading) return <p className="text-sm text-ink-muted">Loading alert…</p>;
  if (error || !alert) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-status-urgent">{error || 'Not found.'}</p>
        <Button as={Link} href="/alerts" variant="secondary">
          Back to Alerts
        </Button>
      </div>
    );
  }

  const severity = alertSeverityMeta(alert.severity);

  return (
    <div className="space-y-6">
      <Button as={Link} href="/alerts" variant="secondary" size="sm">
        ← Alerts around you
      </Button>

      <div className="rounded-card border border-surface-border bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-pill border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide',
              alertSeverityClass(alert.severity)
            )}
          >
            {severity.label}
          </span>
          <span className="inline-flex items-center rounded-pill border border-surface-border bg-surface-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
            {alert.alertCategoryLabel || alertCategoryLabel(alert.alertCategory)}
          </span>
          <ReportStatusBadge status={alert.report?.status} />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(alert.report?.trustLabels || []).map((label) => (
            <ReportTrustLabel key={label} label={label} sourceType={alert.report?.sourceType} />
          ))}
        </div>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink break-words sm:text-3xl">
          {alert.report?.title}
        </h1>

        <p className="mt-3 whitespace-pre-wrap text-sm text-ink-muted break-words">
          {alert.report?.description}
        </p>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Location</dt>
            <dd className="mt-1 text-ink break-words">{alert.location?.name}</dd>
          </div>
          {alert.road?.name ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Road</dt>
              <dd className="mt-1 text-ink break-words">{alert.road.name}</dd>
            </div>
          ) : null}
          {alert.affectedArea ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Affected area
              </dt>
              <dd className="mt-1 text-ink break-words">{alert.affectedArea}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Occurrence
            </dt>
            <dd className="mt-1 text-ink">
              {formatAlertAge(alert.report?.occurredAt || alert.report?.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Freshness
            </dt>
            <dd className="mt-1 text-ink">{alertFreshnessLabel(alert)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Source</dt>
            <dd className="mt-1 text-ink capitalize">{alert.report?.sourceType}</dd>
          </div>
        </dl>

        {actionError ? (
          <div className="mt-4">
            <FormError message={actionError} />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => handleConfirm('still_happening')}>
            Still happening
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleCorrect}>
            No longer happening
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => handleConfirm('needs_correction')}
          >
            Needs correction
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink-muted">
            Flag reason
            <select
              className="mt-1 block min-h-10 rounded-control border border-surface-border bg-white px-3 text-sm"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
            >
              {ALERT_FLAG_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" size="sm" variant="secondary" onClick={handleFlag}>
            Flag
          </Button>
        </div>

        <Button className="mt-4" variant="outline" onClick={() => setComposerOpen((v) => !v)}>
          {composerOpen ? 'Close form' : 'Report related alert'}
        </Button>
      </div>

      {composerOpen ? (
        <AlertsComposer
          onSubmitted={() => {
            setComposerOpen(false);
            load();
          }}
        />
      ) : null}

      {alert.relatedTraffic?.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink">Related traffic nearby</h2>
          <p className="text-xs text-ink-soft">
            Separate Traffic reports in the same area — not automatic proof of this alert.
          </p>
          <ul className="space-y-2">
            {alert.relatedTraffic.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/traffic/${item.id}`}
                  className="block rounded-card border border-surface-border bg-white px-4 py-3 text-sm hover:border-brand-200"
                >
                  <span className="font-semibold text-ink">{item.title}</span>
                  {item.roadName ? (
                    <span className="mt-1 block text-ink-muted">{item.roadName}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {alert.relatedReports?.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink">Related reports</h2>
          <p className="text-xs text-ink-soft">
            {alert.relatedReportCount} other report
            {alert.relatedReportCount === 1 ? '' : 's'} referring to a similar incident nearby.
            Individual reports are preserved.
          </p>
          <ul className="space-y-2">
            {alert.relatedReports.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/alerts/${item.id}`}
                  className="block rounded-card border border-surface-border bg-white px-4 py-3 text-sm hover:border-brand-200"
                >
                  <span className="font-semibold text-ink">{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">History</h2>
        {!history.length ? (
          <p className="text-sm text-ink-muted">No history events yet.</p>
        ) : (
          <ul className="space-y-2 text-sm text-ink-muted">
            {history.map((event) => (
              <li
                key={event.id || `${event.eventType}-${event.createdAt}`}
                className="rounded-control border border-surface-border bg-white px-3 py-2"
              >
                <span className="font-semibold text-ink capitalize">
                  {String(event.eventType || '').replace(/_/g, ' ')}
                </span>
                {event.reason ? <span> — {event.reason}</span> : null}
                <span className="mt-1 block text-xs text-ink-soft">
                  {formatAlertAge(event.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {officialItems.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink">Official Source</h2>
          <p className="text-xs text-ink-soft">
            Official economic/road notices — never presented as this community alert.
          </p>
          {officialItems.map((item) => (
            <OfficialUpdateCard key={item.id} update={item} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
