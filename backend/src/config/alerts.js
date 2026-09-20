export const ALERT_CATEGORIES = [
  { code: 'road_incident', label: 'Road Incident', sortOrder: 10 },
  { code: 'flooding', label: 'Flooding', sortOrder: 20 },
  { code: 'fire', label: 'Fire', sortOrder: 30 },
  { code: 'accident', label: 'Accident', sortOrder: 40 },
  { code: 'security_incident', label: 'Security Incident', sortOrder: 50 },
  { code: 'road_blockage', label: 'Road Blockage', sortOrder: 60 },
  { code: 'dangerous_road_condition', label: 'Dangerous Road Condition', sortOrder: 70 },
  { code: 'public_safety_advisory', label: 'Public Safety Advisory', sortOrder: 80 },
  { code: 'other', label: 'Other', sortOrder: 90 },
];

export const ALERT_SEVERITIES = [
  { code: 'informational', label: 'Informational', tone: 'official' },
  { code: 'caution', label: 'Caution', tone: 'caution' },
  { code: 'urgent', label: 'Urgent', tone: 'attention' },
  { code: 'critical', label: 'Critical', tone: 'urgent' },
];

export function alertCategoryLabel(code) {
  return ALERT_CATEGORIES.find((item) => item.code === code)?.label || String(code || '').replace(/_/g, ' ');
}

export function alertSeverityLabel(code) {
  return ALERT_SEVERITIES.find((item) => item.code === code)?.label || code;
}

export function alertSeverityTone(code) {
  return ALERT_SEVERITIES.find((item) => item.code === code)?.tone || 'caution';
}
