/**
 * Controlled SSE event taxonomy for Update Me.
 * Keep small and extensible — do not invent dozens of types.
 */

export const EVENT_TYPES = Object.freeze({
  TRAFFIC_UPDATED: 'traffic.updated',
  FUEL_UPDATED: 'fuel.updated',
  TRANSPORT_UPDATED: 'transport.updated',
  PRICE_UPDATED: 'price.updated',
  ALERT_CREATED: 'alert.created',
  ALERT_UPDATED: 'alert.updated',
  OFFICIAL_UPDATED: 'official.updated',
  REPORT_UPDATED: 'report.updated',
  REPORT_CONFIRMED: 'report.confirmed',
  NOTIFICATION_CREATED: 'notification.created',
  SAVED_AREA_UPDATED: 'saved_area.updated',
  SAVED_ROUTE_UPDATED: 'saved_route.updated',
});

export const INFORMATION_EVENTS = new Set([
  EVENT_TYPES.TRAFFIC_UPDATED,
  EVENT_TYPES.FUEL_UPDATED,
  EVENT_TYPES.TRANSPORT_UPDATED,
  EVENT_TYPES.PRICE_UPDATED,
  EVENT_TYPES.ALERT_CREATED,
  EVENT_TYPES.ALERT_UPDATED,
  EVENT_TYPES.OFFICIAL_UPDATED,
  EVENT_TYPES.REPORT_UPDATED,
  EVENT_TYPES.REPORT_CONFIRMED,
]);

export const USER_EVENTS = new Set([
  EVENT_TYPES.NOTIFICATION_CREATED,
  EVENT_TYPES.SAVED_AREA_UPDATED,
  EVENT_TYPES.SAVED_ROUTE_UPDATED,
]);

export const CATEGORY_FOR_EVENT = Object.freeze({
  [EVENT_TYPES.TRAFFIC_UPDATED]: 'traffic',
  [EVENT_TYPES.FUEL_UPDATED]: 'fuel',
  [EVENT_TYPES.TRANSPORT_UPDATED]: 'transport',
  [EVENT_TYPES.PRICE_UPDATED]: 'prices',
  [EVENT_TYPES.ALERT_CREATED]: 'local_alerts',
  [EVENT_TYPES.ALERT_UPDATED]: 'local_alerts',
  [EVENT_TYPES.OFFICIAL_UPDATED]: 'official',
  [EVENT_TYPES.REPORT_UPDATED]: 'report',
  [EVENT_TYPES.REPORT_CONFIRMED]: 'report',
  [EVENT_TYPES.NOTIFICATION_CREATED]: 'notification',
  [EVENT_TYPES.SAVED_AREA_UPDATED]: 'saved_area',
  [EVENT_TYPES.SAVED_ROUTE_UPDATED]: 'saved_route',
});

export function isKnownEventType(type) {
  return Object.values(EVENT_TYPES).includes(type);
}
