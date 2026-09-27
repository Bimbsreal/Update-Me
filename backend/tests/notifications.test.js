/**
 * Notifications + Saved Areas/Routes tests.
 * Run: node --test tests/notifications.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import {
  notificationService,
  savedPlacesService,
} from '../src/services/notificationService.js';
import { createSavedAreaSchema, createSavedRouteSchema } from '../src/validators/notifications.js';
import { AppError } from '../src/middleware/errorHandler.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Notify Tester', email, 'test-hash-not-for-login']
  );
  return created.rows[0].id;
}

async function sampleLocations() {
  const result = await getPool().query(
    `SELECT id, name FROM locations
     WHERE type = 'area' AND latitude IS NOT NULL
     ORDER BY name LIMIT 3`
  );
  assert.ok(result.rows.length >= 2, 'Need at least two seeded areas');
  return result.rows;
}

test('saved area and route validation', () => {
  assert.throws(() =>
    createSavedAreaSchema.parse({ locationId: 'bad', placeKind: 'home' })
  );
  assert.throws(() =>
    createSavedRouteSchema.parse({
      originLocationId: '00000000-0000-4000-8000-000000000001',
      destinationLocationId: '00000000-0000-4000-8000-000000000001',
    })
  );
});

test('saved areas/routes CRUD + ownership isolation', async () => {
  const userA = await ensureUser('notify.user.a@example.com');
  const userB = await ensureUser('notify.user.b@example.com');
  const [loc1, loc2] = await sampleLocations();

  const area = await savedPlacesService.createArea(userA, {
    locationId: loc1.id,
    placeKind: 'home',
    customName: 'My Home',
  });
  assert.equal(area.placeKind, 'home');
  assert.equal(area.location.id, loc1.id);

  await assert.rejects(
    () => savedPlacesService.createArea(userA, { locationId: loc1.id, placeKind: 'work' }),
    (err) => err instanceof AppError && err.code === 'DUPLICATE_SAVED_AREA'
  );

  const route = await savedPlacesService.createRoute(userA, {
    originLocationId: loc1.id,
    destinationLocationId: loc2.id,
    customName: 'Home → Elsewhere',
    travelMode: 'driving',
  });
  assert.ok(route.id);
  assert.equal(route.origin.id, loc1.id);

  // User B cannot update A's area
  await assert.rejects(
    () => savedPlacesService.updateArea(userB, area.id, { customName: 'Hijack' }),
    (err) => err instanceof AppError && err.code === 'SAVED_AREA_NOT_FOUND'
  );

  const areasA = await savedPlacesService.listAreas(userA);
  const areasB = await savedPlacesService.listAreas(userB);
  assert.ok(areasA.some((a) => a.id === area.id));
  assert.ok(!areasB.some((a) => a.id === area.id));

  await savedPlacesService.deleteRoute(userA, route.id);
  await savedPlacesService.deleteArea(userA, area.id);
});

test('notification create, prefs, dedupe, read, isolation, expiry', async () => {
  const userA = await ensureUser('notify.user.c@example.com');
  const userB = await ensureUser('notify.user.d@example.com');
  const [loc1, loc2] = await sampleLocations();

  await savedPlacesService.createArea(userA, {
    locationId: loc1.id,
    placeKind: 'work',
    customName: 'Office',
  });

  // Preferences: traffic enabled by default
  const prefs = await notificationService.getPreferences(userA);
  assert.ok(prefs.some((p) => p.category === 'traffic' && p.enabled));

  const eventId = crypto.randomUUID();
  const first = await notificationService.publishForLocation(loc1.id, {
    category: 'traffic',
    type: 'traffic.significant',
    title: 'Heavy traffic reported on your saved route',
    message: 'Test corridor congestion.',
    priority: 'important',
    relatedEntityType: 'traffic_report',
    relatedEntityId: eventId,
    actorUserId: userB,
    dedupeKey: `traffic:report:${eventId}:test`,
  });
  assert.ok(first.notified >= 1);

  // Dedupe — same key does not create another
  const second = await notificationService.publishForLocation(loc1.id, {
    category: 'traffic',
    type: 'traffic.significant',
    title: 'Heavy traffic reported on your saved route',
    relatedEntityType: 'traffic_report',
    relatedEntityId: eventId,
    actorUserId: userB,
    dedupeKey: `traffic:report:${eventId}:test`,
  });
  assert.equal(second.notified, 0);

  // User B (no saved place) should not have this notification
  const listB = await notificationService.list(userB, {
    page: 1,
    limit: 20,
    status: 'all',
    includeExpired: false,
  });
  assert.ok(!listB.items.some((n) => n.relatedEntityId === eventId));

  const listA = await notificationService.list(userA, {
    page: 1,
    limit: 50,
    status: 'unread',
    includeExpired: false,
  });
  const mine = listA.items.find((n) => n.relatedEntityId === eventId);
  assert.ok(mine);
  assert.equal(mine.read, false);

  // User B cannot mark A's notification
  await assert.rejects(
    () => notificationService.markRead(userB, mine.id),
    (err) => err instanceof AppError && err.code === 'NOTIFICATION_NOT_FOUND'
  );

  const read = await notificationService.markRead(userA, mine.id);
  assert.equal(read.read, true);

  // Light traffic should not notify
  const light = await notificationService.notifyTrafficReport(
    {
      id: crypto.randomUUID(),
      severity: 'light',
      location: { id: loc1.id },
      road: { name: 'Test Road' },
    },
    { actorUserId: userB }
  );
  assert.equal(light.skipped, true);

  // Category disabled skips
  await notificationService.updatePreferences(userA, [
    { category: 'traffic', enabled: false },
  ]);
  const skipped = await notificationService.publish({
    userId: userA,
    category: 'traffic',
    type: 'traffic.significant',
    title: 'Should not appear',
    relatedEntityType: 'traffic_report',
    relatedEntityId: crypto.randomUUID(),
    dedupeKey: `traffic:disabled:${Date.now()}`,
  });
  assert.equal(skipped.reason, 'category_disabled');

  // Expiry: create expired notification and exclude from default list
  await notificationService.updatePreferences(userA, [
    { category: 'traffic', enabled: true },
  ]);
  const expiredId = crypto.randomUUID();
  await notificationService.publish({
    userId: userA,
    category: 'traffic',
    type: 'traffic.significant',
    title: 'Yesterday traffic near Work',
    relatedEntityType: 'traffic_report',
    relatedEntityId: expiredId,
    dedupeKey: `traffic:expired:${expiredId}`,
    expiresAt: new Date(Date.now() - 60_000),
  });
  const current = await notificationService.list(userA, {
    page: 1,
    limit: 50,
    status: 'all',
    includeExpired: false,
  });
  assert.ok(!current.items.some((n) => n.relatedEntityId === expiredId));
  const withExpired = await notificationService.list(userA, {
    page: 1,
    limit: 50,
    status: 'all',
    includeExpired: true,
  });
  assert.ok(withExpired.items.some((n) => n.relatedEntityId === expiredId));

  await notificationService.markAllRead(userA);
  const unread = await notificationService.unreadCount(userA);
  assert.equal(unread, 0);

  // Cleanup saved area
  const areas = await savedPlacesService.listAreas(userA);
  for (const a of areas) {
    await savedPlacesService.deleteArea(userA, a.id);
  }

  // Route-based subscription
  try {
    await savedPlacesService.createRoute(userA, {
      originLocationId: loc1.id,
      destinationLocationId: loc2.id,
      travelMode: 'any',
    });
  } catch (err) {
    if (err.code !== 'DUPLICATE_SAVED_ROUTE') throw err;
  }
  const alertId = crypto.randomUUID();
  const alertFanout = await notificationService.notifySafetyAlert(
    {
      id: alertId,
      severity: 'urgent',
      location: { id: loc2.id },
      report: { title: 'Flooding reported along your saved route' },
    },
    { actorUserId: userB }
  );
  assert.ok(alertFanout.notified >= 1);
});

test('alert engine quiet hours, cooldown escalation, templates, FX subscription', async () => {
  const { isInQuietHours, isSeverityEscalation, alertEngine } = await import(
    '../src/services/alertEngine.js'
  );
  const { renderNotificationTemplate } = await import('../src/services/notificationTemplates.js');
  const { userAlertService } = await import('../src/services/userAlertService.js');

  assert.equal(
    isInQuietHours({
      quietHoursEnabled: true,
      quietStartMinute: 22 * 60,
      quietEndMinute: 6 * 60,
      now: new Date('2026-01-15T23:30:00Z'),
      timezone: 'UTC',
      priority: 'normal',
    }),
    true
  );
  assert.equal(
    isInQuietHours({
      quietHoursEnabled: true,
      quietStartMinute: 22 * 60,
      quietEndMinute: 6 * 60,
      now: new Date('2026-01-15T23:30:00Z'),
      timezone: 'UTC',
      priority: 'critical',
      criticalOverridesQuiet: true,
    }),
    false
  );
  assert.equal(isSeverityEscalation('normal', 'urgent'), true);
  assert.equal(isSeverityEscalation('urgent', 'important'), false);

  const rendered = renderNotificationTemplate('fx.rate', {
    pair: 'USD/NGN',
    rate: '1600',
    threshold: '1500',
  });
  assert.match(rendered.title, /USD\/NGN/);
  assert.ok(!rendered.message.includes('<'));

  const rules = await alertEngine.listRules({ enabledOnly: true });
  assert.ok(rules.some((r) => r.code === 'traffic_significant'));

  const user = await ensureUser('notify.fx.alert@example.com');
  const sub = await userAlertService.create(user, {
    kind: 'fx_rate',
    fxBase: 'USD',
    fxQuote: 'NGN',
    thresholdValue: 1000,
    thresholdDirection: 'above',
  });
  assert.equal(sub.kind, 'fx_rate');
  const hits = await userAlertService.evaluateFxRate({ base: 'USD', quote: 'NGN', rate: 1600 });
  assert.ok(hits.some((h) => h.subscriptionId === sub.id));
  await userAlertService.remove(user, sub.id);
});

test('admin notification dashboard metrics shape', async () => {
  const { notificationAdminService } = await import('../src/services/notificationAdminService.js');
  const dash = await notificationAdminService.dashboard();
  assert.ok(dash.metrics?.notifications);
  assert.ok(Array.isArray(dash.rules));
  assert.equal(typeof dash.pushConfigured, 'boolean');
});

test('cleanup pool', async () => {
  await closePool();
});
