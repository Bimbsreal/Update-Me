import { AppError } from '../middleware/errorHandler.js';

/** Hosts that must never be fetched by the ingestion HTTP client (SSRF). */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
]);

/**
 * Conservative allowlist for live (non-fixture) official feed hosts.
 * Fixture protocol bypasses this. Admins may still set draft sources,
 * but active sync only fetches allowlisted or fixture URLs.
 */
const DEFAULT_ALLOWED_HOST_SUFFIXES = [
  'gov.ng',
  'frsc.gov.ng',
  'nmdpra.gov.ng',
  'cbn.gov.ng',
  'lagosstate.gov.ng',
  'localhost', // local mock HTTP servers in tests only when explicitly enabled
];

function isPrivateIp(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (h === '::1' || h === '0.0.0.0') return true;
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  // Basic IPv6 local/link-local
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

function hostAllowed(hostname, allowlist) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  return allowlist.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * Validate a URL for storage/admin config.
 * Fixture URLs are allowed. Live URLs must be http(s) and not private.
 */
export function assertSafeIngestionUrl(value, fieldName = 'url', options = {}) {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new AppError(`Invalid ${fieldName}`, 400, 'VALIDATION_ERROR');
  }

  if (parsed.protocol === 'fixture:') {
    return parsed.toString();
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError(`${fieldName} must use http, https, or fixture protocol`, 400, 'VALIDATION_ERROR');
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || isPrivateIp(host)) {
    // Allow explicit local mock only when env flag set (tests)
    if (!(options.allowLocalhost && (host === 'localhost' || host === '127.0.0.1'))) {
      throw new AppError(
        `${fieldName} target is not allowed (private or blocked host)`,
        400,
        'SSRF_BLOCKED'
      );
    }
  }

  if (options.requireAllowlist) {
    const allowlist = options.allowlist || DEFAULT_ALLOWED_HOST_SUFFIXES;
    if (!hostAllowed(host, allowlist) && !(options.allowLocalhost && host === 'localhost')) {
      throw new AppError(
        `${fieldName} host is not on the approved official domain allowlist`,
        400,
        'DOMAIN_NOT_ALLOWED'
      );
    }
  }

  // Disallow credentials in URL
  if (parsed.username || parsed.password) {
    throw new AppError(`${fieldName} must not include credentials`, 400, 'VALIDATION_ERROR');
  }

  return parsed.toString();
}

export function isFixtureUrl(value) {
  try {
    return new URL(String(value)).protocol === 'fixture:';
  } catch {
    return false;
  }
}

export { DEFAULT_ALLOWED_HOST_SUFFIXES, isPrivateIp };
