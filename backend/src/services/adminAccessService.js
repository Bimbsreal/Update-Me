/**
 * Admin invitations + staff access helpers.
 * Reuses users.admin_role, audit log, and config/admin.js RBAC.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  ADMIN_ROLES,
  getRolePermissionCatalog,
  isStaffRole,
  permissionsForRole,
} from '../config/admin.js';
import { adminAuditRepository } from '../repositories/adminAuditRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { sessionService } from './sessionService.js';

const INVITE_TTL_HOURS = 72;
const SALT_ROUNDS = 12;

function metaFromReq(req) {
  return {
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null,
    userAgent: req?.get?.('user-agent') || null,
  };
}

async function writeAudit(admin, payload, req) {
  const m = metaFromReq(req);
  const newState = payload.newState ? { ...payload.newState } : {};
  if (req?.requestId) newState.requestId = req.requestId;
  return adminAuditRepository.create({
    actorUserId: admin?.userId || null,
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId || null,
    previousState: payload.previousState || null,
    newState: Object.keys(newState).length ? newState : null,
    reason: payload.reason || null,
    ipAddress: m.ipAddress,
    userAgent: m.userAgent,
  });
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function inviteStatus(row) {
  if (row.revoked_at) return 'revoked';
  if (row.accepted_at) return 'accepted';
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  return 'pending';
}

export const adminAccessService = {
  getRoleCatalog() {
    return getRolePermissionCatalog();
  },

  async getRoleDetail(code) {
    const role = ADMIN_ROLES.find((r) => r.code === code);
    if (!role) throw new AppError('Role not found.', 404, 'NOT_FOUND');
    const catalog = getRolePermissionCatalog();
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS c FROM users
       WHERE admin_role = $1::admin_role AND is_active = TRUE`,
      [code]
    );
    const lastChange = await getPool().query(
      `SELECT a.created_at, a.actor_user_id, u.display_name AS actor_name, a.new_state, a.previous_state
       FROM admin_audit_log a
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.action = 'user.set_role'
         AND (a.new_state->>'adminRole' = $1 OR a.previous_state->>'adminRole' = $1)
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [code]
    );
    return {
      ...role,
      permissions: permissionsForRole(code),
      permissionGroups: catalog.permissionGroups.map((g) => ({
        ...g,
        permissions: g.permissions.map((p) => ({
          ...p,
          granted: permissionsForRole(code).includes(p.code),
        })),
      })),
      staffCount: count.rows[0]?.c || 0,
      lastModifiedAt: lastChange.rows[0]?.created_at || null,
      lastModifiedBy: lastChange.rows[0]?.actor_name || null,
      editable: false,
      note: catalog.note,
    };
  },

  async listInvitations({ status, page = 1, limit = 30 } = {}) {
    const lim = Math.min(Number(limit) || 30, 100);
    const off = Math.max((Number(page) || 1) - 1, 0) * lim;
    const params = [];
    const where = [];
    if (status === 'pending') {
      where.push(`accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`);
    } else if (status === 'accepted') {
      where.push(`accepted_at IS NOT NULL`);
    } else if (status === 'revoked') {
      where.push(`revoked_at IS NOT NULL`);
    } else if (status === 'expired') {
      where.push(`accepted_at IS NULL AND revoked_at IS NULL AND expires_at <= NOW()`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(lim, off);
    const result = await getPool().query(
      `SELECT i.id, i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
              i.invited_by, u.display_name AS invited_by_name
       FROM admin_invitations i
       LEFT JOIN users u ON u.id = i.invited_by
       ${whereSql}
       ORDER BY i.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await getPool().query(
      `SELECT COUNT(*)::int AS c FROM admin_invitations i ${whereSql}`,
      []
    );
    return {
      items: result.rows.map((r) => ({
        id: r.id,
        email: r.email,
        role: r.role,
        status: inviteStatus(r),
        expiresAt: r.expires_at,
        acceptedAt: r.accepted_at,
        revokedAt: r.revoked_at,
        createdAt: r.created_at,
        invitedBy: r.invited_by
          ? { id: r.invited_by, displayName: r.invited_by_name }
          : null,
      })),
      total: count.rows[0]?.c || 0,
      page: Number(page) || 1,
      limit: lim,
    };
  },

  async createInvitation(admin, { email, role, reason }, req) {
    if (admin.role !== 'super_admin') {
      throw new AppError('Only Super Admin can invite administrators.', 403, 'FORBIDDEN');
    }
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized.includes('@') || normalized.length < 5) {
      throw new AppError('A valid email is required.', 400, 'VALIDATION_ERROR');
    }
    if (!isStaffRole(role)) {
      throw new AppError('Invalid admin role for invitation.', 400, 'VALIDATION_ERROR');
    }
    if (role === 'super_admin' && admin.role !== 'super_admin') {
      throw new AppError('Only Super Admin can invite another Super Admin.', 403, 'FORBIDDEN');
    }

    const existingUser = await getPool().query(
      `SELECT id, admin_role FROM users WHERE lower(email) = $1`,
      [normalized]
    );
    if (existingUser.rows[0]?.admin_role) {
      throw new AppError('This email already belongs to a staff account.', 409, 'ALREADY_STAFF');
    }

    // Revoke prior pending invites for same email
    await getPool().query(
      `UPDATE admin_invitations
       SET revoked_at = NOW(), revoke_reason = 'Superseded by new invitation'
       WHERE lower(email) = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [normalized]
    );

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);
    const inserted = await getPool().query(
      `INSERT INTO admin_invitations (email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2::admin_role, $3, $4, $5)
       RETURNING id, email, role, expires_at, created_at`,
      [normalized, role, tokenHash, admin.userId, expiresAt.toISOString()]
    );
    const row = inserted.rows[0];
    await writeAudit(
      admin,
      {
        action: 'admin.invite.create',
        entityType: 'admin_invitation',
        entityId: row.id,
        previousState: null,
        newState: { email: normalized, role, expiresAt: row.expires_at },
        reason: reason || 'Administrator invitation',
      },
      req
    );

    // No email transport in this stack — return one-time URL for the inviter to share securely.
    return {
      invitation: {
        id: row.id,
        email: row.email,
        role: row.role,
        status: 'pending',
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      },
      // Raw token only in this response — never stored or re-fetched.
      inviteToken: rawToken,
      invitePath: `/admin-invite/${rawToken}`,
      expiresInHours: INVITE_TTL_HOURS,
    };
  },

  async revokeInvitation(admin, id, { reason }, req) {
    if (admin.role !== 'super_admin') {
      throw new AppError('Only Super Admin can revoke invitations.', 403, 'FORBIDDEN');
    }
    const prev = await getPool().query(`SELECT * FROM admin_invitations WHERE id = $1`, [id]);
    if (!prev.rows[0]) throw new AppError('Invitation not found.', 404, 'NOT_FOUND');
    if (prev.rows[0].accepted_at) {
      throw new AppError('This invitation was already accepted.', 400, 'VALIDATION_ERROR');
    }
    await getPool().query(
      `UPDATE admin_invitations
       SET revoked_at = NOW(), revoke_reason = $2
       WHERE id = $1 AND revoked_at IS NULL`,
      [id, reason || 'Invitation revoked']
    );
    await writeAudit(
      admin,
      {
        action: 'admin.invite.revoke',
        entityType: 'admin_invitation',
        entityId: id,
        previousState: { status: inviteStatus(prev.rows[0]) },
        newState: { status: 'revoked' },
        reason: reason || 'Invitation revoked',
      },
      req
    );
    return { id, status: 'revoked' };
  },

  async resendInvitation(admin, id, { reason }, req) {
    const prev = await getPool().query(`SELECT * FROM admin_invitations WHERE id = $1`, [id]);
    if (!prev.rows[0]) throw new AppError('Invitation not found.', 404, 'NOT_FOUND');
    if (prev.rows[0].accepted_at) {
      throw new AppError('This invitation was already accepted.', 400, 'VALIDATION_ERROR');
    }
    // Create a fresh invitation (new token) and revoke the old one
    return this.createInvitation(
      admin,
      {
        email: prev.rows[0].email,
        role: prev.rows[0].role,
        reason: reason || 'Invitation resent',
      },
      req
    );
  },

  async verifyInvitationToken(rawToken) {
    const tokenHash = hashToken(rawToken);
    const result = await getPool().query(
      `SELECT id, email, role, expires_at, accepted_at, revoked_at
       FROM admin_invitations WHERE token_hash = $1`,
      [tokenHash]
    );
    const row = result.rows[0];
    if (!row) throw new AppError('Invitation not found or invalid.', 404, 'INVITE_INVALID');
    const status = inviteStatus(row);
    if (status !== 'pending') {
      throw new AppError(`This invitation is ${status}.`, 400, 'INVITE_UNAVAILABLE');
    }
    const existing = await getPool().query(
      `SELECT id, display_name, onboarding_completed FROM users WHERE lower(email) = $1`,
      [row.email]
    );
    return {
      invitation: {
        id: row.id,
        email: row.email,
        role: row.role,
        roleLabel: ADMIN_ROLES.find((r) => r.code === row.role)?.label || row.role,
        permissions: permissionsForRole(row.role),
        expiresAt: row.expires_at,
        status,
      },
      existingAccount: existing.rows[0]
        ? {
            id: existing.rows[0].id,
            displayName: existing.rows[0].display_name,
            onboardingCompleted: existing.rows[0].onboarding_completed,
          }
        : null,
    };
  },

  async acceptInvitation(rawToken, { fullName, password }, req) {
    const verified = await this.verifyInvitationToken(rawToken);
    const invite = verified.invitation;
    const pool = getPool();

    let userId = verified.existingAccount?.id || null;
    if (!userId) {
      if (!fullName || String(fullName).trim().length < 2) {
        throw new AppError('Full name is required to create your account.', 400, 'VALIDATION_ERROR');
      }
      if (!password || String(password).length < 8) {
        throw new AppError('Password must be at least 8 characters.', 400, 'VALIDATION_ERROR');
      }
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const created = await pool.query(
        `INSERT INTO users (display_name, email, password_hash, onboarding_completed, admin_role, is_moderator)
         VALUES ($1, $2, $3, TRUE, $4::admin_role, TRUE)
         RETURNING id`,
        [String(fullName).trim(), invite.email, passwordHash, invite.role]
      );
      userId = created.rows[0].id;
    } else {
      // Existing account: require password confirmation to claim invite
      if (!password) {
        throw new AppError('Enter your account password to accept this invitation.', 400, 'VALIDATION_ERROR');
      }
      const user = await userRepository.findByEmail(invite.email);
      if (!user?.password_hash) {
        throw new AppError('Unable to verify this account.', 400, 'VALIDATION_ERROR');
      }
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        throw new AppError('Incorrect password.', 401, 'INVALID_CREDENTIALS');
      }
      await pool.query(
        `UPDATE users
         SET admin_role = $2::admin_role,
             is_moderator = TRUE,
             onboarding_completed = TRUE,
             updated_at = NOW()
         WHERE id = $1`,
        [userId, invite.role]
      );
    }

    await pool.query(
      `UPDATE admin_invitations
       SET accepted_at = NOW(), accepted_user_id = $2
       WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [invite.id, userId]
    );

    await writeAudit(
      { userId: null },
      {
        action: 'admin.invite.accept',
        entityType: 'admin_invitation',
        entityId: invite.id,
        previousState: { status: 'pending' },
        newState: { status: 'accepted', userId, role: invite.role },
        reason: 'Invitation accepted',
      },
      req
    );
    await writeAudit(
      { userId: null },
      {
        action: 'user.set_role',
        entityType: 'user',
        entityId: userId,
        previousState: { adminRole: verified.existingAccount ? null : null },
        newState: { adminRole: invite.role, via: 'invitation' },
        reason: 'Role granted via invitation',
      },
      req
    );

    const publicUser = await userRepository.toPublic(await userRepository.findById(userId));
    return { user: publicUser, role: invite.role, permissions: permissionsForRole(invite.role) };
  },

  async recordSecurityEvent(adminOrNull, payload, req) {
    await writeAudit(adminOrNull, payload, req);
  },
};

export { sessionService };
