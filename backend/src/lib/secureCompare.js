import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string comparison for secrets.
 * Returns false when either value is missing or lengths differ.
 */
export function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Admin/automation tokens must not travel in query strings in production
 * (logs, proxies, Referer). Development may still accept query for local scripts.
 */
export function readAdminSecret(req, headerNames = []) {
  for (const name of headerNames) {
    const value = req.get(name);
    if (value) return value;
  }
  if (process.env.NODE_ENV === 'production') return null;
  return req.query?.adminToken || null;
}
