import { FXProvider } from './FXProvider.js';
import { FX_RATE_TYPES, normalizeCurrency } from '../../config/fx.js';

/**
 * Validate and normalize a provider rate payload.
 * Throws on malformed data — never invents values.
 */
export function validateNormalizedRate(raw, expected = {}) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('FX rate payload must be an object');
  }

  const baseCurrency = normalizeCurrency(raw.baseCurrency || raw.base);
  const quoteCurrency = normalizeCurrency(raw.quoteCurrency || raw.quote);
  const rate = Number(raw.rate);
  const rateType = raw.rateType;
  const sourceId = String(raw.sourceId || '').trim();
  const effectiveDate = String(raw.effectiveDate || '').trim();
  const observedAt = raw.observedAt ? new Date(raw.observedAt) : null;

  if (!/^[A-Z]{3}$/.test(baseCurrency)) {
    throw new Error(`Invalid base currency: ${raw.baseCurrency || raw.base}`);
  }
  if (!/^[A-Z]{3}$/.test(quoteCurrency)) {
    throw new Error(`Invalid quote currency: ${raw.quoteCurrency || raw.quote}`);
  }
  if (baseCurrency === quoteCurrency) {
    throw new Error('Base and quote currencies must differ');
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Invalid FX rate value: ${raw.rate}`);
  }
  if (rateType !== FX_RATE_TYPES.OFFICIAL_REFERENCE && rateType !== FX_RATE_TYPES.MARKET_INDICATIVE) {
    throw new Error(`Invalid rate_type: ${rateType}`);
  }
  if (!sourceId) {
    throw new Error('sourceId is required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    throw new Error(`Invalid effectiveDate: ${raw.effectiveDate}`);
  }
  if (!observedAt || Number.isNaN(observedAt.getTime())) {
    throw new Error(`Invalid observedAt: ${raw.observedAt}`);
  }

  if (expected.sourceId && sourceId !== expected.sourceId) {
    throw new Error(`sourceId mismatch: expected ${expected.sourceId}`);
  }
  if (expected.rateType && rateType !== expected.rateType) {
    throw new Error(`rateType mismatch: expected ${expected.rateType}`);
  }

  return {
    sourceId,
    baseCurrency,
    quoteCurrency,
    rate,
    rateType,
    observedAt: observedAt.toISOString(),
    effectiveDate,
    rawFingerprint:
      raw.rawFingerprint ||
      `${sourceId}:${baseCurrency}:${quoteCurrency}:${rateType}:${effectiveDate}:${rate}`,
  };
}

export function validateNormalizedRates(list, expected = {}) {
  if (!Array.isArray(list)) {
    throw new Error('FX rates response must be an array');
  }
  return list.map((item) => validateNormalizedRate(item, expected));
}

/**
 * Fetch JSON with timeout. Does not swallow network errors.
 */
export async function fetchJsonWithTimeout(url, { timeoutMs = 12000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...headers,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
      // Some APIs omit content-type; still try parse
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response from ${url}`);
      }
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function withRetries(fn, { retries = 2, delayMs = 400, label = 'fx-fetch' } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        console.warn(`[${label}] attempt ${attempt + 1} failed: ${error.message}; retrying...`);
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export { FXProvider };
