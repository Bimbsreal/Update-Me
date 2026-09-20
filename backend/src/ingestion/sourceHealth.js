/**
 * Observable source health — no opaque numerical score.
 */
export function computeSourceHealth(source) {
  if (!source) return 'unknown';
  if (['disabled', 'suspended', 'draft'].includes(source.status)) return 'disabled';
  if (source.verificationStatus && source.verificationStatus !== 'verified') return 'unknown';

  const failures = Number(source.consecutiveFailures || 0);
  if (failures >= 3) return 'failing';
  if (failures >= 1) return 'warning';

  if (source.lastSuccessAt) {
    const ageMs = Date.now() - new Date(source.lastSuccessAt).getTime();
    const intervalMs = (Number(source.syncIntervalMinutes) || 360) * 60_000;
    // Stale: more than 3x interval since last success
    if (Number.isFinite(ageMs) && ageMs > intervalMs * 3) return 'warning';
    return 'healthy';
  }

  return 'unknown';
}

export function shouldAutoSuspend(source) {
  return Number(source?.consecutiveFailures || 0) >= 8;
}
