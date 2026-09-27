/**
 * Server-side user sessions. JWT carries sid; session rows enable revoke.
 * Tokens themselves are never stored or returned to Admin UI.
 */

import crypto from 'crypto';
import { getPool } from '../db/pool.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

function parseExpiresToMs(value) {
  const raw = String(value || '7d').trim();
  const match = /^(\d+)([smhd])$/i.exec(raw);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

function metaFromReq(req) {
  const fwd = req?.headers?.['x-forwarded-for'];
  const ip = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : null) || req?.ip || null;
  const ua = req?.get?.('user-agent') || req?.headers?.['user-agent'] || null;
  return {
    ipAddress: ip ? String(ip).slice(0, 120) : null,
    userAgent: ua ? String(ua).slice(0, 500) : null,
  };
}

function summarizeUserAgent(ua) {
  if (!ua) return 'Unknown device';
  const s = String(ua);
  if (/Mobile|Android|iPhone/i.test(s)) return 'Mobile browser';
  if (/Edg\//i.test(s)) return 'Edge';
  if (/Chrome\//i.test(s)) return 'Chrome';
  if (/Firefox\//i.test(s)) return 'Firefox';
  if (/Safari\//i.test(s)) return 'Safari';
  return 'Browser';
}

export const sessionService = {
  async create(userId, req) {
    const meta = metaFromReq(req);
    const ttlMs = parseExpiresToMs(env.JWT_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + ttlMs);
    const id = crypto.randomUUID();
    await getPool().query(
      `INSERT INTO user_sessions (id, user_id, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, expiresAt.toISOString(), meta.ipAddress, meta.userAgent]
    );
    await getPool().query(
      `UPDATE users SET last_login_at = NOW(), last_seen_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [userId]
    );
    return { id, expiresAt };
  },

  async assertActive(sessionId, userId) {
    if (!sessionId) {
      // Legacy JWTs without sid remain valid until natural expiry (no server revoke).
      return { legacy: true };
    }
    const result = await getPool().query(
      `SELECT id, user_id, revoked_at, expires_at
       FROM user_sessions WHERE id = $1`,
      [sessionId]
    );
    const row = result.rows[0];
    if (!row || row.user_id !== userId) {
      throw new AppError('Your session has expired. Please sign in again.', 401, 'UNAUTHORIZED');
    }
    if (row.revoked_at) {
      throw new AppError('This session was revoked. Please sign in again.', 401, 'SESSION_REVOKED');
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new AppError('Your session has expired. Please sign in again.', 401, 'UNAUTHORIZED');
    }
    // Throttle last_seen updates (every ~2 minutes)
    await getPool().query(
      `UPDATE user_sessions SET last_seen_at = NOW()
       WHERE id = $1 AND last_seen_at < NOW() - INTERVAL '2 minutes'`,
      [sessionId]
    );
    await getPool().query(
      `UPDATE users SET last_seen_at = NOW() WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '5 minutes')`,
      [userId]
    );
    return { legacy: false, sessionId };
  },

  async revoke(sessionId, { reason } = {}) {
    await getPool().query(
      `UPDATE user_sessions
       SET revoked_at = NOW(), revoke_reason = $2
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId, reason || 'Revoked']
    );
  },

  async revokeAllForUser(userId, { reason, exceptSessionId = null } = {}) {
    const params = [userId, reason || 'All sessions revoked'];
    let except = '';
    if (exceptSessionId) {
      params.push(exceptSessionId);
      except = `AND id <> $${params.length}`;
    }
    const result = await getPool().query(
      `UPDATE user_sessions
       SET revoked_at = NOW(), revoke_reason = $2
       WHERE user_id = $1 AND revoked_at IS NULL ${except}
       RETURNING id`,
      params
    );
    return { revoked: result.rowCount || 0 };
  },

  async listForUser(userId, { currentSessionId = null } = {}) {
    const result = await getPool().query(
      `SELECT id, created_at, last_seen_at, expires_at, revoked_at, ip_address, user_agent
       FROM user_sessions
       WHERE user_id = $1
       ORDER BY COALESCE(revoked_at, last_seen_at) DESC
       LIMIT 40`,
      [userId]
    );
    return result.rows.map((s) => ({
      id: s.id,
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      expiresAt: s.expires_at,
      isRevoked: Boolean(s.revoked_at),
      isCurrent: currentSessionId ? s.id === currentSessionId : false,
      ipAddress: s.ip_address,
      device: summarizeUserAgent(s.user_agent),
      // Never expose user_agent raw if overly long; device summary is enough for Admin
    }));
  },
};
