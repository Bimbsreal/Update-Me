import { createHash } from 'node:crypto';

/**
 * Strip potentially dangerous markup from official imported text.
 * Prefer plain text — do not execute or preserve scripts/handlers.
 */
export function sanitizeOfficialText(value, { maxLength = 20000 } = {}) {
  if (value == null) return null;
  let text = String(value);
  text = text.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

export function hashOfficialContent(item) {
  const raw = [
    item.title || '',
    item.summary || '',
    item.body || '',
    item.originalUrl || '',
    item.publishedAt || '',
    item.category || '',
    item.status || '',
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 48);
}
