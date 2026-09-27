/**
 * Moderation & Trust Center tests.
 * Run: node --test tests/moderationCenter.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { adminService } from '../src/services/adminService.js';
import {
  MODERATION_REASONS,
  isActionAllowedForContentType,
  roleHasPermission,
  ADMIN_PERMISSIONS,
} from '../src/config/admin.js';
import { reportService } from '../src/services/reportService.js';
import { AppError } from '../src/middleware/errorHandler.js';

async function ensureUser(email, { adminRole = null } = {}) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  let id = existing.rows[0]?.id;
  if (!id) {
    const created = await pool.query(
      `INSERT INTO users (display_name, email, password_hash, onboarding_completed, is_moderator, admin_role)
       VALUES ($1,$2,$3,TRUE,$4,$5::admin_role) RETURNING id`,
      ['Mod Center Tester', email, 'test-hash-not-for-login', Boolean(adminRole), adminRole]
    );
    id = created.rows[0].id;
  } else {
    await pool.query(
      `UPDATE users SET admin_role = $2::admin_role, is_moderator = $3, suspended_at = NULL WHERE id = $1`,
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

async function secondLocation(excludeId) {
  const result = await getPool().query(
    `SELECT id FROM locations
     WHERE type = 'area' AND latitude IS NOT NULL AND id <> $1
     ORDER BY name LIMIT 1`,
    [excludeId]
  );
  assert.ok(result.rows[0], 'Need a second seeded location');
  return result.rows[0].id;
}

test('outside scope reason exists and actions are content-scoped', () => {
  assert.ok(MODERATION_REASONS.some((r) => r.code === 'outside_scope'));
  assert.ok(MODERATION_REASONS.some((r) => r.code === 'promotional_spam'));
  assert.equal(isActionAllowedForContentType('question', 'mark_stale'), false);
  assert.equal(isActionAllowedForContentType('report', 'escalate'), true);
  assert.equal(isActionAllowedForContentType('answer', 'expire'), false);
});

test('moderation metrics return real counts', async () => {
  const metrics = await adminService.moderationMetrics();
  assert.equal(typeof metrics.pending, 'number');
  assert.equal(typeof metrics.flagged, 'number');
  assert.equal(typeof metrics.escalated, 'number');
  assert.equal(typeof metrics.removed, 'number');
  assert.equal(typeof metrics.reviewedToday, 'number');
  assert.equal(typeof metrics.staleReports, 'number');
});

test('queue supports views, search, pagination; detail and escalate work', async () => {
  const adminId = await ensureUser('modcenter.admin@example.com', { adminRole: 'moderator' });
  const userId = await ensureUser('modcenter.user@example.com', { adminRole: null });
  const locationId = await sampleLocation();
  const title = `Moderation center queue ${Date.now()}`;

  const report = await reportService.create(userId, {
    category: 'traffic',
    locationId,
    title,
    description: 'Congestion near bridge for moderation center test <script>alert(1)</script>',
  });

  await reportService.flag(userId, report.id, {
    reason: 'inaccurate',
    details: 'Test flag for moderation center',
  });

  const attention = await adminService.moderationQueue({ view: 'flagged', limit: 40 });
  assert.ok(attention.items.some((i) => i.id === report.id));
  assert.ok(attention.reasons?.length);

  const searched = await adminService.moderationQueue({
    view: 'attention',
    q: title.slice(0, 18),
    limit: 20,
  });
  assert.ok(searched.items.some((i) => i.id === report.id));

  const detail = await adminService.moderationDetail(`report:${report.id}`);
  assert.equal(detail.item.id, report.id);
  assert.ok(detail.item.body.includes('<script>'));
  assert.ok(Array.isArray(detail.flags));
  assert.ok(detail.item.allowedActions.includes('escalate'));
  assert.ok(detail.item.freshness);

  const admin = { userId: adminId, role: 'moderator', displayName: 'Mod Center Tester' };
  const req = { ip: '127.0.0.1', get: () => 'test-agent', requestId: 'test-req-mod-1' };

  const escalated = await adminService.moderationAction(
    admin,
    `report:${report.id}`,
    { action: 'escalate', reasonCode: 'safety_concern', reason: 'Needs senior review' },
    req
  );
  assert.equal(escalated.action, 'escalate');

  const afterEsc = await getPool().query(
    `SELECT moderation_state FROM reports WHERE id = $1`,
    [report.id]
  );
  assert.equal(afterEsc.rows[0].moderation_state, 'escalated');

  const escQueue = await adminService.moderationQueue({ view: 'escalated', limit: 40 });
  assert.ok(escQueue.items.some((i) => i.id === report.id));

  await adminService.moderationAction(
    admin,
    `report:${report.id}`,
    { action: 'approve', reason: 'Cleared after escalation review' },
    req
  );

  const audit = await getPool().query(
    `SELECT action, reason, new_state FROM admin_audit_log
     WHERE entity_type = 'report' AND entity_id = $1 AND action LIKE 'moderation.%'
     ORDER BY created_at DESC LIMIT 5`,
    [report.id]
  );
  assert.ok(audit.rows.some((r) => r.action === 'moderation.escalate'));
  assert.ok(audit.rows.some((r) => r.action === 'moderation.approve'));
  const escRow = audit.rows.find((r) => r.action === 'moderation.escalate');
  assert.ok(String(escRow.reason).includes('Safety concern') || String(escRow.reason).length >= 3);
  assert.equal(escRow.new_state?.requestId, 'test-req-mod-1');
});

test('location correction is audited and does not rewrite title', async () => {
  const adminId = await ensureUser('modcenter.locadmin@example.com', { adminRole: 'admin' });
  const userId = await ensureUser('modcenter.locuser@example.com', { adminRole: null });
  const locationId = await sampleLocation();
  const otherLocation = await secondLocation(locationId);

  const report = await reportService.create(userId, {
    category: 'fuel',
    locationId,
    title: `Location correction ${Date.now()}`,
    description: 'Fuel price observation for location correction test.',
  });

  const admin = { userId: adminId, role: 'admin', displayName: 'Loc Admin' };
  const result = await adminService.correctReportLocation(
    admin,
    report.id,
    { locationId: otherLocation, reason: 'Wrong area selected by submitter' },
    { ip: '127.0.0.1', get: () => 'test', requestId: 'loc-corr-1' }
  );
  assert.equal(result.locationId, otherLocation);

  const row = await getPool().query(`SELECT title, location_id FROM reports WHERE id = $1`, [
    report.id,
  ]);
  assert.equal(row.rows[0].title, report.title);
  assert.equal(row.rows[0].location_id, otherLocation);

  const audit = await getPool().query(
    `SELECT action, previous_state, new_state FROM admin_audit_log
     WHERE entity_id = $1 AND action = 'moderation.correct_location'
     ORDER BY created_at DESC LIMIT 1`,
    [report.id]
  );
  assert.equal(audit.rows[0]?.previous_state?.locationId, locationId);
  assert.equal(audit.rows[0]?.new_state?.locationId, otherLocation);
  assert.equal(audit.rows[0]?.new_state?.requestId, 'loc-corr-1');
});

test('official content cannot be approved as community authorship', async () => {
  const adminId = await ensureUser('modcenter.offadmin@example.com', { adminRole: 'moderator' });
  const ownerId = await ensureUser('modcenter.offowner@example.com', { adminRole: null });
  const locationId = await sampleLocation();
  const pool = getPool();
  const cat = await pool.query(`SELECT id FROM report_categories WHERE code = 'traffic' LIMIT 1`);
  const inserted = await pool.query(
    `INSERT INTO reports (
       user_id, category_id, location_id, title, description, status, source_type, moderation_state
     ) VALUES (
       $1, $2, $3, $4, $5, 'active', 'official', 'cleared'
     ) RETURNING id, title`,
    [ownerId, cat.rows[0].id, locationId, `Official protected ${Date.now()}`, 'Official traffic advisory']
  );
  const id = inserted.rows[0].id;
  const admin = { userId: adminId, role: 'moderator', displayName: 'Mod' };

  await assert.rejects(
    () =>
      adminService.moderationAction(
        admin,
        `report:${id}`,
        { action: 'approve', reason: 'Trying to rewrite official' },
        { ip: '127.0.0.1', get: () => 't' }
      ),
    (err) => err instanceof AppError && err.code === 'OFFICIAL_CONTENT_PROTECTED'
  );

  const detail = await adminService.moderationDetail(`report:${id}`);
  assert.equal(detail.item.allowedActions.includes('approve'), false);
  assert.equal(detail.item.allowedActions.includes('escalate'), true);
});

test('metrics include trust-hardening aggregates', async () => {
  const metrics = await adminService.moderationMetrics();
  assert.equal(typeof metrics.reportsToday, 'number');
  assert.equal(typeof metrics.approvedToday, 'number');
  assert.equal(typeof metrics.rejectedToday, 'number');
  assert.equal(typeof metrics.priorityReports, 'number');
  assert.equal(typeof metrics.duplicateCandidates, 'number');
});

test('reporting disable blocks create/confirm/flag; priority and duplicate linking work', async () => {
  const adminId = await ensureUser('modcenter.trustadmin@example.com', { adminRole: 'admin' });
  const userId = await ensureUser('modcenter.trustuser@example.com', { adminRole: null });
  const otherId = await ensureUser('modcenter.trustpeer@example.com', { adminRole: null });
  const locationId = await sampleLocation();
  const admin = { userId: adminId, role: 'admin', displayName: 'Trust Admin' };
  const req = { ip: '127.0.0.1', get: () => 'test', requestId: 'trust-1' };

  await adminService.disableReporting(admin, userId, { reason: 'Repeated spam submissions' }, req);

  await assert.rejects(
    () =>
      reportService.create(userId, {
        category: 'traffic',
        locationId,
        title: `Blocked ${Date.now()}`,
        description: 'Should not create while reporting disabled',
      }),
    (err) => err instanceof AppError && err.code === 'REPORTING_DISABLED'
  );

  await adminService.enableReporting(admin, userId, { reason: 'Restriction lifted' }, req);

  const a = await reportService.create(userId, {
    category: 'traffic',
    locationId,
    title: `Trust traffic A ${Date.now()}`,
    description: 'Heavy traffic on the expressway for duplicate grouping test.',
  });
  const b = await reportService.create(otherId, {
    category: 'traffic',
    locationId,
    title: `Trust traffic B ${Date.now()}`,
    description: 'Same stretch still congested a few minutes later.',
  });

  await assert.rejects(
    () => reportService.confirm(userId, a.id, { type: 'still_accurate', note: 'self' }),
    (err) => err instanceof AppError
  );

  await reportService.confirm(otherId, a.id, { type: 'still_accurate', note: 'Still happening' });

  const detailNoPii = await adminService.moderationDetail(`report:${a.id}`, {
    userId: adminId,
    role: 'moderator',
  });
  assert.equal(detailNoPii.item.creator?.email, undefined);
  assert.ok(detailNoPii.item.qualitySignals);
  assert.equal(detailNoPii.item.confirmations.accurate >= 1, true);

  const detailPii = await adminService.moderationDetail(`report:${a.id}`, {
    userId: adminId,
    role: 'admin',
  });
  assert.ok(detailPii.item.creator?.email);

  await adminService.moderationAction(
    admin,
    `report:${a.id}`,
    { action: 'set_priority', priority: 'urgent', reasonCode: 'safety_concern' },
    req
  );
  const pri = await getPool().query(`SELECT moderation_priority FROM reports WHERE id = $1`, [a.id]);
  assert.equal(pri.rows[0].moderation_priority, 'urgent');

  await adminService.moderationAction(
    admin,
    `report:${b.id}`,
    {
      action: 'mark_duplicate',
      reasonCode: 'duplicate',
      relatedReportId: a.id,
      reason: 'Same congestion event',
    },
    req
  );
  const linked = await getPool().query(
    `SELECT event_group_id, status FROM reports WHERE id = $1`,
    [b.id]
  );
  assert.ok(linked.rows[0].event_group_id);
  assert.equal(linked.rows[0].status, 'removed');

  const peers = await adminService.moderationDetail(`report:${a.id}`, admin);
  assert.ok(peers.eventGroupReports.some((r) => r.id === b.id));
});

test('moderator cannot see reporter Pii without permission', async () => {
  assert.equal(roleHasPermission('moderator', ADMIN_PERMISSIONS.moderation_reporter_pii), false);
  assert.equal(roleHasPermission('admin', ADMIN_PERMISSIONS.moderation_reporter_pii), true);
});

test('data manager cannot use moderation permission gate helpers', () => {
  assert.equal(roleHasPermission('data_manager', ADMIN_PERMISSIONS.moderation), false);
  assert.equal(roleHasPermission('data_manager', ADMIN_PERMISSIONS.locations_edit), true);
  assert.equal(roleHasPermission('moderator', ADMIN_PERMISSIONS.moderation), true);
});

test('user moderation summary includes report counts', async () => {
  const userId = await ensureUser('modcenter.summary@example.com', { adminRole: null });
  const profile = await adminService.getUser(userId);
  assert.ok(profile.moderationSummary);
  assert.equal(typeof profile.moderationSummary.reportsSubmitted, 'number');
  assert.equal(typeof profile.moderationSummary.flagsReceived, 'number');
  assert.ok(Array.isArray(profile.moderationSummary.contentActions));
  assert.equal(profile.passwordHash, undefined);
  assert.equal(profile.refreshToken, undefined);
});

test.after(async () => {
  await closePool();
});
