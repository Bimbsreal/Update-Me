import { AppError } from '../middleware/errorHandler.js';
import { env } from '../config/env.js';
import { requireAuth } from './auth.js';
import { getPool } from '../db/pool.js';
import { readAdminSecret, secureCompare } from '../lib/secureCompare.js';
import { createHash } from 'crypto';
import { assertSafeIngestionUrl } from '../ingestion/urlPolicy.js';

/**
 * Admin gate for official sources / sync:
 * - OFFICIAL_ADMIN_TOKEN via header only (production), OR
 * - authenticated moderator / staff with official permissions
 *
 * Does not accept FX_ADMIN_TOKEN as a substitute.
 */
export async function requireOfficialAdmin(req, res, next) {
  try {
    const token = readAdminSecret(req, [
      'x-official-admin-token',
      'x-admin-token',
    ]);

    if (env.OFFICIAL_ADMIN_TOKEN && token && secureCompare(token, env.OFFICIAL_ADMIN_TOKEN)) {
      req.officialAdmin = { via: 'token' };
      return next();
    }

    await new Promise((resolve, reject) => {
      requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
    });

    const result = await getPool().query(
      `SELECT id, is_moderator, admin_role, suspended_at, is_active
       FROM users WHERE id = $1`,
      [req.auth.userId]
    );
    const user = result.rows[0];
    if (!user?.is_active || user.suspended_at) {
      throw new AppError('Official source admin access denied.', 403, 'FORBIDDEN');
    }
    const staff = Boolean(user.is_moderator || user.admin_role);
    if (!staff) {
      throw new AppError(
        'Official source admin access requires a staff account or admin token.',
        403,
        'FORBIDDEN'
      );
    }
    req.officialAdmin = { via: 'moderator', userId: user.id };
    return next();
  } catch (error) {
    return next(error);
  }
}

export function buildDedupeKey({ externalId, originalUrl, title, publishedAt }) {
  if (externalId) {
    return `ext:${String(externalId).trim().toLowerCase()}`;
  }
  const url = originalUrl ? String(originalUrl).trim().toLowerCase() : '';
  if (url) {
    return `url:${createHash('sha256').update(url).digest('hex').slice(0, 40)}`;
  }
  const titlePart = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const timePart = publishedAt ? new Date(publishedAt).toISOString() : 'unknown';
  const raw = `${titlePart}|${timePart}`;
  return `meta:${createHash('sha256').update(raw).digest('hex').slice(0, 40)}`;
}

export function assertSafeHttpUrl(value, fieldName = 'url') {
  // Delegate to ingestion URL policy (protocol + SSRF basics).
  // Feed URLs used for live sync apply allowlist separately at fetch time.
  return assertSafeIngestionUrl(value, fieldName, {
    allowLocalhost: process.env.INGESTION_ALLOW_LOCALHOST === 'true',
  });
}
