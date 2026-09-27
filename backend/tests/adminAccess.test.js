/**
 * Admin access: invitations, sessions, Super Admin protections.
 * Run: node --test tests/adminAccess.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { adminService } from '../src/services/adminService.js';
import { sessionService } from '../src/services/sessionService.js';
import { adminAccessService } from '../src/services/adminAccessService.js';
import {
  getRolePermissionCatalog,
  roleHasPermission,
  ADMIN_PERMISSIONS,
} from '../src/config/admin.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { verifyToken, signToken } from '../src/middleware/auth.js';

async function ensureUser(email, { adminRole = null } = {}) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  let id = existing.rows[0]?.id;
  if (!id) {
    const created = await pool.query(
      `INSERT INTO users (display_name, email, password_hash, onboarding_completed, is_moderator, admin_role)
       VALUES ($1,$2,$3,TRUE,$4,$5::admin_role) RETURNING id`,
      ['Access Tester', email, 'test-hash-not-for-login', Boolean(adminRole), adminRole]
    );
    id = created.rows[0].id;
  } else {
    await pool.query(
      `UPDATE users SET admin_role = $2::admin_role, is_moderator = $3, suspended_at = NULL, is_active = TRUE
       WHERE id = $1`,
      [id, adminRole, Boolean(adminRole)]
    );
  }
  return id;
}

test('role catalog is code-defined and not runtime-editable', () => {
  const catalog = getRolePermissionCatalog();
  assert.equal(catalog.editable, false);
  assert.ok(catalog.roles.some((r) => r.code === 'super_admin'));
  assert.ok(catalog.permissionGroups.length >= 4);
  assert.equal(roleHasPermission('moderator', ADMIN_PERMISSIONS.users_roles), false);
  assert.equal(roleHasPermission('super_admin', ADMIN_PERMISSIONS.users_roles), true);
});

test('session create + revoke blocks assertActive', async () => {
  const userId = await ensureUser('access.session@example.com', { adminRole: 'moderator' });
  const session = await sessionService.create(userId, {
    ip: '127.0.0.1',
    get: () => 'test-agent',
  });
  await sessionService.assertActive(session.id, userId);
  await sessionService.revoke(session.id, { reason: 'test revoke' });
  await assert.rejects(
    () => sessionService.assertActive(session.id, userId),
    (err) => err instanceof AppError && err.code === 'SESSION_REVOKED'
  );
  const token = signToken({ sub: userId, sid: session.id });
  const decoded = verifyToken(token);
  assert.equal(decoded.sid, session.id);
});

test('invitation create, verify, accept, and revoke', async () => {
  const superId = await ensureUser('access.super@example.com', { adminRole: 'super_admin' });
  const admin = { userId: superId, role: 'super_admin', displayName: 'Super' };
  const email = `invitee.${Date.now()}@example.com`;

  const created = await adminService.createInvitation(
    admin,
    { email, role: 'data_manager', reason: 'Onboard data manager' },
    { ip: '127.0.0.1', get: () => 't', requestId: 'inv-1' }
  );
  assert.ok(created.inviteToken);
  assert.equal(created.invitation.role, 'data_manager');

  const verified = await adminAccessService.verifyInvitationToken(created.inviteToken);
  assert.equal(verified.invitation.email, email);

  const accepted = await adminAccessService.acceptInvitation(
    created.inviteToken,
    { fullName: 'Invitee User', password: 'InviteePass123!' },
    { ip: '127.0.0.1', get: () => 't', requestId: 'inv-2' }
  );
  assert.equal(accepted.role, 'data_manager');
  assert.ok(accepted.permissions.includes(ADMIN_PERMISSIONS.locations));
  assert.equal(accepted.permissions.includes(ADMIN_PERMISSIONS.users_roles), false);

  const user = await getPool().query(`SELECT admin_role FROM users WHERE email = $1`, [email]);
  assert.equal(user.rows[0].admin_role, 'data_manager');

  // Second accept fails
  await assert.rejects(
    () =>
      adminAccessService.acceptInvitation(
        created.inviteToken,
        { fullName: 'X', password: 'InviteePass123!' },
        {}
      ),
    (err) => err instanceof AppError
  );
});

test('super admin protections: self role change and last super admin', async () => {
  const superA = await ensureUser('access.supera@example.com', { adminRole: 'super_admin' });
  const superB = await ensureUser('access.superb@example.com', { adminRole: 'super_admin' });

  await assert.rejects(
    () =>
      adminService.setUserRole(
        { userId: superA, role: 'super_admin' },
        superA,
        { role: 'admin', reason: 'self demote' },
        {}
      ),
    (err) => err instanceof AppError && err.code === 'SELF_LOCKOUT_PREVENTION'
  );

  // Snapshot all other supers so we can isolate A/B, then restore.
  const others = await getPool().query(
    `SELECT id FROM users WHERE admin_role = 'super_admin' AND id <> ALL($1::uuid[])`,
    [[superA, superB]]
  );
  for (const row of others.rows) {
    await getPool().query(`UPDATE users SET admin_role = 'admin'::admin_role WHERE id = $1`, [
      row.id,
    ]);
  }

  try {
    await adminService.setUserRole(
      { userId: superB, role: 'super_admin' },
      superA,
      { role: 'admin', reason: 'Demote with spare super' },
      { ip: '127.0.0.1', get: () => 't' }
    );

    await assert.rejects(
      () =>
        adminService.setUserRole(
          { userId: superB, role: 'super_admin' },
          superB,
          { role: 'admin', reason: 'self demote blocked' },
          {}
        ),
      (err) => err instanceof AppError && err.code === 'SELF_LOCKOUT_PREVENTION'
    );

    await assert.rejects(
      () =>
        adminService.setUserRole(
          { userId: superA, role: 'super_admin' },
          superB,
          { role: 'admin', reason: 'remove last super' },
          {}
        ),
      (err) => err instanceof AppError && err.code === 'LAST_SUPER_ADMIN'
    );
  } finally {
    await getPool().query(
      `UPDATE users SET admin_role = 'super_admin'::admin_role, is_moderator = TRUE
       WHERE id = ANY($1::uuid[])`,
      [[superA, superB, ...others.rows.map((r) => r.id)]]
    );
  }
});

test('cannot suspend self; suspend revokes sessions', async () => {
  const adminId = await ensureUser('access.suspender@example.com', { adminRole: 'admin' });
  const targetId = await ensureUser('access.victim@example.com', { adminRole: 'moderator' });
  const session = await sessionService.create(targetId, { ip: '1.1.1.1', get: () => 'ua' });
  const admin = { userId: adminId, role: 'admin', displayName: 'Admin' };

  await assert.rejects(
    () => adminService.suspendUser(admin, adminId, { reason: 'self suspend attempt' }, {}),
    (err) => err instanceof AppError
  );

  await adminService.suspendUser(
    admin,
    targetId,
    { reason: 'Policy violation test' },
    { ip: '127.0.0.1', get: () => 't', requestId: 'sus-1' }
  );
  await assert.rejects(
    () => sessionService.assertActive(session.id, targetId),
    (err) => err.code === 'SESSION_REVOKED'
  );
});

test('staff list supports staffOnly and never returns password fields', async () => {
  const list = await adminService.listUsers({ staffOnly: true, limit: 10 });
  assert.ok(Array.isArray(list.items));
  for (const u of list.items) {
    assert.ok(u.adminRole);
    assert.equal(u.passwordHash, undefined);
    assert.equal(u.password_hash, undefined);
  }
  const detail = await adminService.getUser(list.items[0].id);
  assert.equal(detail.passwordHash, undefined);
  assert.ok(Array.isArray(detail.sessions));
});

test('moderator cannot create invitations', async () => {
  const modId = await ensureUser('access.modinvite@example.com', { adminRole: 'moderator' });
  await assert.rejects(
    () =>
      adminService.createInvitation(
        { userId: modId, role: 'moderator' },
        { email: 'x@example.com', role: 'moderator' },
        {}
      ),
    (err) => err instanceof AppError && err.status === 403
  );
});

test.after(async () => {
  await closePool();
});
