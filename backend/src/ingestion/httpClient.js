import { assertSafeIngestionUrl, assertResolvedHostSafe, isFixtureUrl } from './urlPolicy.js';
import { env } from '../config/env.js';

const DEFAULT_TIMEOUT_MS = env.OFFICIAL_PROVIDER_TIMEOUT_MS || 12_000;
const DEFAULT_MAX_BYTES = 1_500_000; // ~1.5 MB hard cap for feed bodies

function isRetryableError(error) {
  const msg = String(error?.message || '').toLowerCase();
  if (error?.name === 'AbortError') return true;
  if (msg.includes('timeout') || msg.includes('aborted')) return true;
  if (msg.includes('econnreset') || msg.includes('econnrefused') || msg.includes('etimedout')) {
    return true;
  }
  const statusMatch = /http (5\d\d)/i.exec(error?.message || '');
  if (statusMatch) return true;
  return false;
}

function isPermanentHttpError(status) {
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 410;
}

export async function withBoundedRetries(fn, { retries = 2, delayMs = 400, label = 'ingestion' } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const statusMatch = /HTTP (\d{3})/i.exec(error?.message || '');
      const status = statusMatch ? Number(statusMatch[1]) : null;
      if (status && isPermanentHttpError(status)) throw error;
      if (!isRetryableError(error) || attempt >= retries) throw error;
      console.warn(`[${label}] attempt ${attempt + 1} failed: ${error.message}; retrying…`);
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * Safe fetch for official ingestion: SSRF checks, timeout, size limit, bounded retries.
 * Does not follow redirects to private hosts (redirect: 'error' then manual check not needed —
 * Node fetch follows redirects by default; we use redirect: 'manual' and only accept final 2xx
 * without auto-following into private ranges).
 */
export async function fetchIngestionText(url, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  headers = {},
  maxBytes = DEFAULT_MAX_BYTES,
  retries = 2,
  allowLocalhost = env.INGESTION_ALLOW_LOCALHOST === true,
} = {}) {
  if (isFixtureUrl(url)) {
    throw new Error('Fixture URLs must be resolved by the fixture provider, not HTTP client');
  }

  assertSafeIngestionUrl(url, 'feedUrl', {
    requireAllowlist: true,
    allowLocalhost,
  });

  const parsed = new URL(url);
  await assertResolvedHostSafe(parsed.hostname, { allowLocalhost });

  return withBoundedRetries(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          redirect: 'error',
          headers: {
            Accept: 'application/json, application/rss+xml, application/atom+xml, text/xml, text/plain, */*',
            'User-Agent': 'UpdateMe-OfficialIngestion/1.0 (+local)',
            ...headers,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} from ${url}`);
        }

        const contentType = response.headers.get('content-type') || '';
        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength && contentLength > maxBytes) {
          throw new Error(`Response too large (${contentLength} bytes)`);
        }

        const reader = response.body?.getReader?.();
        if (!reader) {
          const text = await response.text();
          if (Buffer.byteLength(text, 'utf8') > maxBytes) {
            throw new Error(`Response too large (>${maxBytes} bytes)`);
          }
          return { contentType, text, bytes: Buffer.byteLength(text, 'utf8') };
        }

        const chunks = [];
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            throw new Error(`Response too large (>${maxBytes} bytes)`);
          }
          chunks.push(value);
        }
        const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
        return { contentType, text: buffer.toString('utf8'), bytes: buffer.byteLength };
      } finally {
        clearTimeout(timer);
      }
    },
    { retries, label: 'official-ingestion' }
  );
}

export async function fetchIngestionJson(url, options = {}) {
  const { contentType, text, bytes } = await fetchIngestionText(url, options);
  try {
    return { data: JSON.parse(text), contentType, bytes };
  } catch {
    throw new Error(`Non-JSON response from ${url} (${contentType || 'unknown type'})`);
  }
}
