import { statusClassMap } from '@/lib/status';

export const FUEL_TYPES = [
  { value: 'pms', label: 'PMS / Petrol', shortLabel: 'Petrol', defaultUnit: 'litre' },
  { value: 'ago', label: 'AGO / Diesel', shortLabel: 'Diesel', defaultUnit: 'litre' },
  { value: 'lpg', label: 'LPG / Cooking Gas', shortLabel: 'LPG', defaultUnit: 'kg' },
];

export const FUEL_AVAILABILITY = [
  { value: 'available', label: 'Available', tone: 'normal' },
  { value: 'limited', label: 'Limited', tone: 'caution' },
  { value: 'unavailable', label: 'Unavailable', tone: 'urgent' },
  { value: 'unknown', label: 'Unknown', tone: 'expired' },
];

export const FUEL_QUEUE = [
  { value: 'none', label: 'No queue' },
  { value: 'short', label: 'Short queue' },
  { value: 'moderate', label: 'Moderate queue' },
  { value: 'long', label: 'Long queue' },
  { value: 'unknown', label: 'Unknown' },
];

export function fuelTypeMeta(value) {
  return FUEL_TYPES.find((item) => item.value === value) || null;
}

export function fuelTypeLabel(value) {
  return fuelTypeMeta(value)?.shortLabel || value;
}

export function availabilityMeta(value) {
  return FUEL_AVAILABILITY.find((item) => item.value === value) || FUEL_AVAILABILITY.at(-1);
}

export function availabilityClass(value) {
  return statusClassMap[availabilityMeta(value).tone] || statusClassMap.expired;
}

export function formatFuelPrice(price) {
  if (!price || price.amount == null) return null;
  const amount = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: price.currency || 'NGN',
    maximumFractionDigits: 2,
  }).format(Number(price.amount));
  const unit = price.unit === 'kg' ? 'kg' : price.unit === 'cylinder' ? 'cyl' : 'L';
  return `${amount}/${unit}`;
}

export function formatFuelAge(value) {
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

export function pickPrimaryReport(station, preferredType = 'pms') {
  const reports = station?.latestReports || [];
  if (!reports.length) return null;
  return (
    reports.find((r) => r.fuelType === preferredType) ||
    reports.find((r) => r.availability === 'available') ||
    reports[0]
  );
}
