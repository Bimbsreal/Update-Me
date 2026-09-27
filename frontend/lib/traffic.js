import { statusClassMap } from '@/lib/status';

export const TRAFFIC_SEVERITIES = [
  { value: 'clear', label: 'Clear', tone: 'normal' },
  { value: 'light', label: 'Light', tone: 'normal' },
  { value: 'moderate', label: 'Moderate', tone: 'caution' },
  { value: 'heavy', label: 'Heavy', tone: 'attention' },
  { value: 'standstill', label: 'Standstill', tone: 'urgent' },
  { value: 'blocked', label: 'Blocked', tone: 'urgent' },
  { value: 'unknown', label: 'Unknown', tone: 'expired' },
];

export const TRAFFIC_CAUSES = [
  { value: 'accident', label: 'Accident' },
  { value: 'roadworks', label: 'Roadworks' },
  { value: 'flooding', label: 'Flooding' },
  { value: 'vehicle_breakdown', label: 'Vehicle breakdown' },
  { value: 'security_incident', label: 'Security incident' },
  { value: 'event', label: 'Event' },
  { value: 'construction', label: 'Construction' },
  { value: 'lane_closure', label: 'Lane closure' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'other', label: 'Other' },
];

export function severityMeta(severity) {
  return TRAFFIC_SEVERITIES.find((item) => item.value === severity) || TRAFFIC_SEVERITIES.at(-1);
}

/** Public band labels (Low → Critical) mapped from DB severity values. */
export function severityBandLabel(severity) {
  switch (severity) {
    case 'clear':
    case 'light':
      return 'Low';
    case 'moderate':
      return 'Moderate';
    case 'heavy':
      return 'Heavy';
    case 'standstill':
      return 'Severe';
    case 'blocked':
      return 'Critical';
    default:
      return 'Unknown';
  }
}

export function severityClass(severity) {
  const tone = severityMeta(severity).tone;
  return statusClassMap[tone] || statusClassMap.expired;
}

export function causeLabel(cause) {
  if (!cause) return null;
  return TRAFFIC_CAUSES.find((item) => item.value === cause)?.label || cause.replace(/_/g, ' ');
}

export function formatTrafficAge(value) {
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
