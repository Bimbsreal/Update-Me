import { statusClassMap } from '@/lib/status';

export const ALERT_CATEGORIES = [
  { value: 'road_incident', label: 'Road Incident' },
  { value: 'flooding', label: 'Flooding' },
  { value: 'fire', label: 'Fire' },
  { value: 'accident', label: 'Accident' },
  { value: 'security_incident', label: 'Security Incident' },
  { value: 'road_blockage', label: 'Road Blockage' },
  { value: 'dangerous_road_condition', label: 'Dangerous Road Condition' },
  { value: 'public_safety_advisory', label: 'Public Safety Advisory' },
  { value: 'other', label: 'Other' },
];

export const ALERT_SEVERITIES = [
  { value: 'informational', label: 'Informational', tone: 'official' },
  { value: 'caution', label: 'Caution', tone: 'caution' },
  { value: 'urgent', label: 'Urgent', tone: 'attention' },
  { value: 'critical', label: 'Critical', tone: 'urgent' },
];

export const ALERT_FLAG_REASONS = [
  { value: 'inaccurate', label: 'Inaccurate' },
  { value: 'misleading', label: 'Misleading' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'unsafe', label: 'Unsafe' },
  { value: 'other', label: 'Other' },
];

export function alertCategoryLabel(code) {
  return ALERT_CATEGORIES.find((item) => item.value === code)?.label || String(code || '').replace(/_/g, ' ');
}

export function alertSeverityMeta(severity) {
  return ALERT_SEVERITIES.find((item) => item.value === severity) || ALERT_SEVERITIES[1];
}

export function alertSeverityClass(severity) {
  const tone = alertSeverityMeta(severity).tone;
  return statusClassMap[tone] || statusClassMap.caution;
}

export function formatAlertAge(value) {
  if (!value) return '';
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function alertFreshnessLabel(alert) {
  const freshness = alert?.report?.freshness;
  if (freshness === 'expired' || alert?.report?.status === 'expired') return 'Expired';
  if (freshness === 'stale' || alert?.report?.status === 'stale') return 'Stale';
  if (alert?.report?.status === 'under_review' || alert?.report?.status === 'flagged') {
    return 'Under review';
  }
  if (alert?.report?.lastConfirmedAt) {
    return `Confirmed ${formatAlertAge(alert.report.lastConfirmedAt)}`;
  }
  return `Reported ${formatAlertAge(alert?.report?.occurredAt || alert?.report?.createdAt)}`;
}
