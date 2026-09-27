export function formatOfficialTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const ageMs = Date.now() - date.getTime();
  const ageMin = Math.floor(ageMs / 60000);
  const ageHrs = Math.floor(ageMs / 3600000);
  const ageDays = Math.floor(ageMs / 86400000);

  if (ageMin < 2) return 'Just now';
  if (ageMin < 60) return `${ageMin} min ago`;
  if (ageHrs < 24) return `${ageHrs} hr${ageHrs === 1 ? '' : 's'} ago`;
  if (ageDays < 7) return `${ageDays} day${ageDays === 1 ? '' : 's'} ago`;

  return date.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function jurisdictionLabel(level) {
  const map = {
    national: 'National',
    state: 'State',
    lga: 'LGA',
    city: 'City',
    area: 'Area',
    location_specific: 'Local',
  };
  return map[level] || level;
}

export function priorityLabel(priority, fallbackLabel) {
  if (fallbackLabel) return fallbackLabel;
  const map = {
    normal: 'Informational',
    important: 'Important',
    urgent: 'High Priority',
    critical: 'Critical',
  };
  return map[priority] || priority || null;
}

export function freshnessParts(update) {
  if (!update) return [];
  const parts = [];
  if (update.isExpired || update.freshnessLabel === 'Expired') {
    parts.push({ label: 'Expired', tone: 'expired' });
  } else if (update.freshnessLabel === 'Updated') {
    parts.push({ label: 'Updated', tone: 'updated' });
  } else {
    parts.push({ label: 'Published', tone: 'published' });
  }
  if (update.effectiveAt) {
    parts.push({ label: `Effective ${formatOfficialTime(update.effectiveAt)}`, tone: 'effective' });
  }
  if (update.expiresAt && !update.isExpired) {
    parts.push({ label: `Expires ${formatOfficialTime(update.expiresAt)}`, tone: 'expires' });
  }
  return parts;
}

export function affectedLocationLabel(update) {
  if (!update) return null;
  const bits = [update.locationName, update.stateName].filter(Boolean);
  if (bits.length) return bits.join(', ');
  if (update.jurisdictionLevel === 'national') return 'Nigeria';
  return jurisdictionLabel(update.jurisdictionLevel) || null;
}
