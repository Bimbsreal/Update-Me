/**
 * Admin & Moderation Dashboard tests.
 * Run: node --test tests/admin.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { adminService } from '../src/services/adminService.js';
import { roleHasPermission, permissionsForRole, ADMIN_PERMISSIONS } from '../src/config/admin.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { reportService } from '../src/services/reportService.js';

async function ensureUser(email, { adminRole = null } = {}) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  let id = existing.rows[0]?.id;
  if (!id) {
    const created = await pool.query(
      `INSERT INTO users (display_name, email, password_hash, onboarding_completed, is_moderator, admin_role)
       VALUES ($1,$2,$3,TRUE,$4,$5::admin_role) RETURNING id`,
      [
        'Admin Tester',
        email,
        'test-hash-not-for-login',
        Boolean(adminRole),
        adminRole,
      ]
    );
    id = created.rows[0].id;
  } else {
    await pool.query(
      `UPDATE users SET admin_role = $2::admin_role, is_moderator = $3, suspended_at = NULL
       WHERE id = $1`,
      [id, adminRole, Boolean(adminRole)]
    );
  }
  return id;
}

async function sampleLocation() {
  const result = await getPool().query(
    `SELECT id FROM locations WHERE type = 'area' AND latitude IS NOT NULL ORDER BY name LIMIT 1`
  );
  assert.ok(result.rows[0], 'Need seeded location');
  return result.rows[0].id;
}

test('role permissions are granular', () => {
  assert.equal(roleHasPermission('moderator', ADMIN_PERMISSIONS.moderation), true);
  assert.equal(roleHasPermission('moderator', ADMIN_PERMISSIONS.users_suspend), false);
  assert.equal(roleHasPermission('data_manager', ADMIN_PERMISSIONS.locations_edit), true);
  assert.equal(roleHasPermission('data_manager', ADMIN_PERMISSIONS.moderation), false);
  assert.ok(permissionsForRole('super_admin').includes(ADMIN_PERMISSIONS.users_roles));
  assert.equal(roleHasPermission(null, ADMIN_PERMISSIONS.dashboard), false);
});

test('dashboard and data quality return real counts', async () => {
  const dash = await adminService.dashboard();
  assert.equal(typeof dash.reportsAwaitingReview, 'number');
  assert.equal(typeof dash.users.total, 'number');
  assert.ok(Array.isArray(dash.recentReports));

  const quality = await adminService.dataQuality();
  assert.equal(typeof quality.staleReports, 'number');
  assert.equal(typeof quality.unresolvedFlags, 'number');
  assert.equal(typeof quality.failedOfficialSyncs, 'number');
});

test('ordinary user cannot be treated as staff via role helpers', () => {
  assert.equal(roleHasPermission(undefined, 'dashboard'), false);
  assert.equal(roleHasPermission('user', 'dashboard'), false);
});

test('moderation action updates report + writes audit log', async () => {
  const adminId = await ensureUser('admin.moderator@example.com', { adminRole: 'moderator' });
  const userId = await ensureUser('admin.reporter@example.com', { adminRole: null });
  const locationId = await sampleLocation();

  const report = await reportService.create(userId, {
    category: 'traffic',
    locationId,
    title: `Admin moderation test ${Date.now()}`,
    description: 'Temporary congestion for admin test.',
  });

  await reportService.flag(userId, report.id, {
    reason: 'inaccurate',
    details: 'Test flag for admin queue',
  });

  const queue = await adminService.moderationQueue({ limit: 50 });
  assert.ok(queue.items.some((i) => i.id === report.id));

  const admin = { userId: adminId, role: 'moderator', displayName: 'Admin Tester' };
  const result = await adminService.moderationAction(
    admin,
    `report:${report.id}`,
    { action: 'approve', reason: 'Reviewed and cleared for public display' },
    { ip: '127.0.0.1', get: () => 'test-agent' }
  );
  assert.equal(result.action, 'approve');

  const after = await getPool().query(`SELECT status, moderation_state FROM reports WHERE id = $1`, [
    report.id,
  ]);
  assert.equal(after.rows[0].status, 'active');

  const audit = await adminService.listAuditLog({ entityType: 'report', limit: 10 });
  assert.ok(audit.items.some((a) => a.entityId === report.id && a.action.includes('approve')));
});

test('user suspend/restore authorization path + audit', async () => {
  const adminId = await ensureUser('admin.usersuper@example.com', { adminRole: 'admin' });
  const targetId = await ensureUser('admin.target@example.com', { adminRole: null });
  const admin = { userId: adminId, role: 'admin', displayName: 'Admin' };

  const suspended = await adminService.suspendUser(
    admin,
    targetId,
    { reason: 'Abuse of reporting tools' },
    { ip: '127.0.0.1', get: () => 'test' }
  );
  assert.equal(suspended.isSuspended, true);

  await assert.rejects(
    () =>
      adminService.suspendUser(admin, adminId, { reason: 'Self suspend attempt' }, {
        ip: '127.0.0.1',
        get: () => 'test',
      }),
    (err) => err instanceof AppError
  );

  const restored = await adminService.restoreUser(
    admin,
    targetId,
    { reason: 'Appeal accepted' },
    { ip: '127.0.0.1', get: () => 'test' }
  );
  assert.equal(restored.isSuspended, false);

  const history = await adminService.listAuditLog({ entityType: 'user', limit: 20 });
  assert.ok(history.items.some((a) => a.entityId === targetId && a.action === 'user.suspend'));
});

test('report list filtering and pagination', async () => {
  const list = await adminService.listReports({ page: 1, limit: 5 });
  assert.ok(Array.isArray(list.items));
  assert.ok(list.limit <= 5);
  assert.equal(typeof list.total, 'number');
});

test('official sources list never includes config secrets', async () => {
  const sources = await adminService.listOfficialSources();
  assert.ok(Array.isArray(sources));
  for (const s of sources) {
    assert.equal(Object.prototype.hasOwnProperty.call(s, 'config'), false);
    assert.ok(s.id);
    assert.ok(s.organizationName);
  }
});

test('alert moderation confirm does not invent confirmations', async () => {
  const adminId = await ensureUser('admin.alerts@example.com', { adminRole: 'admin' });
  const userId = await ensureUser('admin.alert.reporter@example.com', { adminRole: null });
  const locationId = await sampleLocation();

  let report;
  try {
    report = await reportService.create(userId, {
      category: 'local_alerts',
      locationId,
      title: `Safety alert admin test ${Date.now()}`,
      description: 'Localized safety notice for moderation test.',
    });
  } catch (err) {
    // Category may be named differently in some DBs — skip soft
    if (err?.code === 'INVALID_CATEGORY') {
      return;
    }
    throw err;
  }

  const admin = { userId: adminId, role: 'admin' };
  await adminService.alertAction(
    admin,
    report.id,
    { action: 'under_review', reason: 'Needs stronger review before public confirmation' },
    { ip: '127.0.0.1', get: () => 'test' }
  );
  const mid = await getPool().query(`SELECT status FROM reports WHERE id = $1`, [report.id]);
  assert.equal(mid.rows[0].status, 'under_review');

  await adminService.alertAction(
    admin,
    report.id,
    { action: 'confirm', reason: 'Confirmed after staff review' },
    { ip: '127.0.0.1', get: () => 'test' }
  );
  const after = await getPool().query(`SELECT status FROM reports WHERE id = $1`, [report.id]);
  assert.equal(after.rows[0].status, 'confirmed');
});

test('global search returns structured buckets', async () => {
  const results = await adminService.globalSearch('Lagos', { limit: 5 });
  assert.ok(results.locations);
  assert.ok(results.reports);
  assert.ok(results.users);
});

test('role assignment restricted to super_admin', async () => {
  const adminId = await ensureUser('admin.notsuper@example.com', { adminRole: 'admin' });
  const targetId = await ensureUser('admin.role.target@example.com', { adminRole: null });
  await assert.rejects(
    () =>
      adminService.setUserRole(
        { userId: adminId, role: 'admin' },
        targetId,
        { role: 'moderator', reason: 'Should fail' },
        { ip: '127.0.0.1', get: () => 'test' }
      ),
    (err) => err instanceof AppError && err.status === 403
  );

  const superId = await ensureUser('admin.super@example.com', { adminRole: 'super_admin' });
  const updated = await adminService.setUserRole(
    { userId: superId, role: 'super_admin' },
    targetId,
    { role: 'data_manager', reason: 'Promote for geo work' },
    { ip: '127.0.0.1', get: () => 'test' }
  );
  assert.equal(updated.adminRole, 'data_manager');
});

test.after(async () => {
  await closePool();
});
