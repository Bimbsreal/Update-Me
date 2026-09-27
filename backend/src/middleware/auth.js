import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errorHandler.js';
import { getPool } from '../db/pool.js';
import { sessionService } from '../services/sessionService.js';

export const COOKIE_NAME = env.COOKIE_NAME || 'um_session';

function parseExpiresToMs(value) {
  const raw = String(value || '7d').trim();
  const match = /^(\d+)([smhd])$/i.exec(raw);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

export function signToken(payload) {
  if (!env.JWT_SECRET) {
    throw new AppError('Server auth is not configured', 500, 'AUTH_CONFIG');
  }
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN || '7d',
  });
}

export function verifyToken(token) {
  if (!env.JWT_SECRET) {
    throw new AppError('Server auth is not configured', 500, 'AUTH_CONFIG');
  }
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AppError('Your session has expired. Please sign in again.', 401, 'UNAUTHORIZED');
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: parseExpiresToMs(env.JWT_EXPIRES_IN),
  };
}

/**
 * Require a valid session cookie for an active, non-suspended user.
 * When JWT includes sid, the session row must be active (enables revoke).
 */
export async function requireAuth(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      throw new AppError('Please sign in to continue.', 401, 'UNAUTHORIZED');
    }
    const decoded = verifyToken(token);
    if (!decoded?.sub) {
      throw new AppError('Please sign in to continue.', 401, 'UNAUTHORIZED');
    }

    const result = await getPool().query(
      `SELECT id, is_active, suspended_at FROM users WHERE id = $1`,
      [decoded.sub]
    );
    const user = result.rows[0];
    if (!user || user.is_active === false) {
      throw new AppError('Please sign in to continue.', 401, 'UNAUTHORIZED');
    }
    if (user.suspended_at) {
      throw new AppError(
        'This account is suspended. Contact support if you need help.',
        403,
        'ACCOUNT_SUSPENDED'
      );
    }

    if (decoded.sid) {
      await sessionService.assertActive(decoded.sid, user.id);
    }

    req.auth = { userId: user.id, sessionId: decoded.sid || null };
    next();
  } catch (error) {
    next(error);
  }
}
