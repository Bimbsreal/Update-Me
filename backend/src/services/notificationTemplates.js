/**
 * Safe notification templates — variable substitution only; never concatenate HTML.
 */

const TEMPLATES = Object.freeze({
  'traffic.alert': {
    title: 'Traffic alert on {road}',
    message: '{severity} reported near {location}. Reported {time}.',
  },
  'traffic.closure': {
    title: 'Road closure near {location}',
    message: '{road} — {detail}',
  },
  'road.hazard': {
    title: 'Road hazard near {location}',
    message: '{detail}',
  },
  'fuel.price': {
    title: 'Fuel price update near {location}',
    message: '{product}: ₦{price}. {detail}',
  },
  'commodity.price': {
    title: '{commodity} price alert',
    message: '{detail} near {location}.',
  },
  'fx.rate': {
    title: '{pair} rate alert',
    message: 'Rate is now {rate}. Threshold: {threshold}.',
  },
  'official.update': {
    title: '{agency}: {headline}',
    message: '{summary}',
  },
  'system.emergency': {
    title: 'Emergency public alert',
    message: '{summary}',
  },
  'system.notice': {
    title: '{headline}',
    message: '{summary}',
  },
});

function sanitizeValue(value) {
  if (value == null) return '';
  return String(value)
    .replace(/[<>&"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function renderNotificationTemplate(templateKey, vars = {}) {
  const tpl = TEMPLATES[templateKey] || TEMPLATES['system.notice'];
  const safe = Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [k, sanitizeValue(v)])
  );
  const fill = (text) =>
    String(text).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => safe[key] || '');

  return {
    templateKey,
    title: fill(tpl.title).slice(0, 200) || 'Update Me notification',
    message: fill(tpl.message).slice(0, 2000) || null,
  };
}

export function listNotificationTemplates() {
  return Object.entries(TEMPLATES).map(([key, value]) => ({
    key,
    titlePattern: value.title,
    messagePattern: value.message,
  }));
}
