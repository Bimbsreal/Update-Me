'use client';

import { useCallback, useEffect, useState } from 'react';
import { ReportCard } from '@/components/reports/ReportCard';
import { ReportComposer } from '@/components/reports/ReportComposer';
import { FormError } from '@/components/ui/Input';
import { useAuth } from '@/components/auth/AuthProvider';
import { ApiError, reportsApi } from '@/lib/api';

export default function AppReportPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 20, freshness: 'any' };
      if (user?.currentArea?.locationId) {
        params.locationId = user.currentArea.locationId;
      }
      const data = await reportsApi.list(params);
      setReports(data.items || []);
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }, [user?.currentArea?.locationId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function handleConfirm(report) {
    setActionError('');
    try {
      await reportsApi.confirm(report.id, { type: 'still_accurate' });
      await loadReports();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Confirmation failed.');
    }
  }

  async function handleCorrect(report) {
    setActionError('');
    try {
      await reportsApi.correct(report.id, {
        type: 'no_longer_accurate',
        note: 'Marked no longer accurate from report feed',
      });
      await loadReports();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Update failed.');
    }
  }

  async function handleFlag(report) {
    setActionError('');
    try {
      await reportsApi.flag(report.id, { reason: 'inaccurate' });
      await loadReports();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Flag failed.');
    }
  }

  return (
    <div className="space-y-8">
      <ReportComposer onSubmitted={() => loadReports()} />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-ink">Recent reports nearby</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Generic report cards for this area. Category-specific modules are not live yet — no fake
            traffic or fuel data is shown.
          </p>
        </div>

        <FormError message={actionError || error} />

        {loading ? <p className="text-sm text-ink-muted">Loading reports…</p> : null}

        {!loading && reports.length === 0 ? (
          <div className="rounded-card border border-dashed border-surface-border bg-surface-muted/50 p-5 text-sm text-ink-muted">
            No reports for this area yet. Be the first to share useful information.
          </div>
        ) : null}

        <div className="grid gap-3">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              showActions
              onConfirm={handleConfirm}
              onCorrect={handleCorrect}
              onFlag={handleFlag}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
