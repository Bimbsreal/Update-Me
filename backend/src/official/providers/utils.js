import { isValidCategory } from '../../config/official.js';
import { buildDedupeKey } from '../../middleware/officialAdmin.js';
import { fetchIngestionJson, fetchIngestionText } from '../../ingestion/httpClient.js';
import { sanitizeOfficialText } from '../../ingestion/sanitize.js';
import { env } from '../../config/env.js';

export function validateNormalizedUpdate(raw, source) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Official update payload must be an object');
  }

  const title = sanitizeOfficialText(String(raw.title || '').trim(), { maxLength: 300 });
  if (!title || title.length < 3 || title.length > 300) {
    throw new Error('Official update title is invalid');
  }

  const category = raw.category || 'other';
  if (!isValidCategory(category)) {
    throw new Error(`Invalid official category: ${category}`);
  }

  const publishedAt = raw.publishedAt ? new Date(raw.publishedAt) : null;
  if (raw.publishedAt && Number.isNaN(publishedAt.getTime())) {
    throw new Error('Invalid publishedAt');
  }

  const originalUrl = raw.originalUrl ? String(raw.originalUrl).trim() : null;
  if (originalUrl) {
    try {
      const u = new URL(originalUrl);
      if (!['http:', 'https:'].includes(u.protocol)) {
        throw new Error('bad protocol');
      }
    } catch {
      throw new Error('Invalid originalUrl');
    }
  }

  const externalId = raw.externalId ? String(raw.externalId).trim() : null;
  const dedupeKey =
    raw.dedupeKey ||
    buildDedupeKey({
      externalId,
      originalUrl,
      title,
      publishedAt: publishedAt?.toISOString() || null,
    });

  return {
    sourceId: source.id,
    externalId,
    dedupeKey,
    title,
    summary: sanitizeOfficialText(raw.summary, { maxLength: 2000 }),
    body: sanitizeOfficialText(raw.body, { maxLength: 20000 }),
    originalUrl,
    category,
    jurisdictionLevel: raw.jurisdictionLevel || source.jurisdictionLevel || 'national',
    stateId: raw.stateId || source.stateId || null,
    locationId: raw.locationId || null,
    status: raw.status || 'published',
    imageUrl: raw.imageUrl || null,
    publishedAt: publishedAt ? publishedAt.toISOString() : null,
    sourceMetadata: raw.sourceMetadata && typeof raw.sourceMetadata === 'object' ? raw.sourceMetadata : {},
  };
}

export function validateNormalizedUpdates(list, source) {
  if (!Array.isArray(list)) {
    throw new Error('Official provider response must be an array');
  }
  return list.map((item) => validateNormalizedUpdate(item, source));
}

/** @deprecated Prefer fetchIngestionText — kept for fixture/tests compatibility. */
export async function fetchTextWithTimeout(url, { timeoutMs = 12000, headers = {} } = {}) {
  if (String(url).startsWith('fixture:')) {
    throw new Error('Fixture URLs are not fetched over HTTP');
  }
  const result = await fetchIngestionText(url, {
    timeoutMs: timeoutMs || env.OFFICIAL_PROVIDER_TIMEOUT_MS || 12000,
    headers,
    allowLocalhost: env.INGESTION_ALLOW_LOCALHOST === true,
  });
  return { contentType: result.contentType, text: result.text };
}

export async function fetchJsonWithTimeout(url, options = {}) {
  const { data, contentType } = await fetchIngestionJson(url, {
    timeoutMs: options.timeoutMs || env.OFFICIAL_PROVIDER_TIMEOUT_MS || 12000,
    headers: options.headers || {},
    allowLocalhost: env.INGESTION_ALLOW_LOCALHOST === true,
  });
  return data;
}
