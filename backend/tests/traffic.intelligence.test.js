/**
 * Traffic & Transport Intelligence tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { closePool, getPool } from '../src/db/pool.js';
import { trafficAdminService } from '../src/services/trafficAdminService.js';
import { trafficEventAdminService } from '../src/services/trafficEventAdminService.js';
import { transportAdminService } from '../src/services/transportAdminService.js';
import { severityBand, isRoadClosureType } from '../src/config/trafficIntelligence.js';
import { AppError } from '../src/middleware/errorHandler.js';
import { reportService } from '../src/services/reportService.js';

test('severity bands map DB values to public labels', () => {
  assert.equal(severityBand('light').label, 'Low');
  assert.equal(severityBand('moderate').label, 'Moderate');
  assert.equal(severityBand('heavy').label, 'Heavy');
  assert.equal(severityBand('standstill').label, 'Severe');
  assert.equal(severityBand('blocked').label, 'Critical');
  assert.equal(isRoadClosureType('road_closure'), true);
});

test('traffic dashboard includes event intelligence metrics', async () => {
  const dash = await trafficAdminService.dashboard();
  assert.equal(typeof dash.activeReports, 'number');
  assert.equal(typeof dash.activeEvents, 'number');
  assert.equal(typeof dash.severeEvents, 'number');
  assert.equal(typeof dash.roadClosures, 'number');
  assert.equal(typeof dash.flaggedReports, 'number');
  assert.equal(typeof dash.resolvedEventsToday, 'number');
});

test('admin can create traffic event, link report, and resolve', async () => {
  const pool = getPool();
  const adminId = (
    await pool.query(
      `INSERT INTO users (display_name, email, password_hash, onboarding_completed, is_moderator, admin_role)
       VALUES ('Traffic Intel Admin', $1, 'hash', TRUE, TRUE, 'admin'::admin_role)
       ON CONFLICT (email) DO UPDATE SET admin_role = 'admin'::admin_role
       RETURNING id`,
      [`traffic.intel.admin.${Date.now()}@example.com`]
    )
  ).rows[0].id;

  const userId = (
    await pool.query(
      `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
       VALUES ('Traffic Intel User', $1, 'hash', TRUE)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id`,
      [`traffic.intel.user.${Date.now()}@example.com`]
    )
  ).rows[0].id;

  const location = await pool.query(
    `SELECT id FROM locations WHERE type = 'area' AND latitude IS NOT NULL ORDER BY name LIMIT 1`
  );
  assert.ok(location.rows[0], 'Need seeded location');

  const report = await reportService.create(userId, {
    category: 'traffic',
    locationId: location.rows[0].id,
    title: `Intel congestion ${Date.now()}`,
    description: 'Heavy traffic for event linking test.',
  });

  // Ensure traffic_reports row exists (reportService may create via traffic path differently)
  const traf = await pool.query(`SELECT id FROM traffic_reports WHERE report_id = $1`, [report.id]);
  if (!traf.rows[0]) {
    await pool.query(
      `INSERT INTO traffic_reports (report_id, severity, cause, road_name)
       VALUES ($1, 'heavy'::traffic_severity, 'other'::traffic_cause, 'Test Expressway')`,
      [report.id]
    );
  }

  const admin = { userId: adminId, role: 'admin', displayName: 'Traffic Intel Admin' };
  const req = { ip: '127.0.0.1', get: () => 'test', requestId: 'traffic-intel-1' };

  const created = await trafficEventAdminService.create(
    {
      title: `Severe congestion Lekki entrance ${Date.now()}`,
      eventType: 'congestion',
      severity: 'standstill',
      direction: 'inbound',
      directionLabel: 'Lekki → Victoria Island',
      roadName: 'Lekki-Epe Expressway',
      locationId: location.rows[0].id,
      description: 'Development traffic event',
      reportId: report.id,
      reason: 'Dev seed event',
    },
    admin,
    req
  );

  assert.ok(created.item?.id);
  assert.equal(created.item.severityBand.label, 'Severe');
  assert.ok(created.reports.some((r) => r.reportId === report.id));

  const listed = await trafficEventAdminService.list({ status: 'active', limit: 20 });
  assert.ok(listed.items.some((i) => i.id === created.item.id));

  const resolved = await trafficEventAdminService.resolve(
    created.item.id,
    { reason: 'Traffic cleared after peak' },
    admin,
    req
  );
  assert.equal(resolved.item.status, 'resolved');
  assert.ok(resolved.item.resolvedAt);

  await assert.rejects(
    () =>
      trafficEventAdminService.create(
        {
          title: 'Bad coords',
          eventType: 'accident',
          latitude: 51.5,
          longitude: -0.12,
        },
        admin,
        req
      ),
    (err) => err instanceof AppError && err.code === 'INVALID_COORDINATES'
  );
});

test('transport admin can create route, directory stop, and list anomalies', async () => {
  const pool = getPool();
  const locs = await pool.query(
    `SELECT id FROM locations WHERE type = 'area' AND latitude IS NOT NULL ORDER BY name LIMIT 8`
  );
  assert.ok(locs.rows.length >= 2, 'Need two locations');

  let originId = null;
  let destId = null;
  for (let i = 0; i < locs.rows.length; i++) {
    for (let j = i + 1; j < locs.rows.length; j++) {
      const existing = await pool.query(
        `SELECT id FROM transport_routes
         WHERE origin_location_id = $1 AND destination_location_id = $2 AND is_active = TRUE`,
        [locs.rows[i].id, locs.rows[j].id]
      );
      if (!existing.rows[0]) {
        originId = locs.rows[i].id;
        destId = locs.rows[j].id;
        break;
      }
    }
    if (originId) break;
  }
  assert.ok(originId && destId, 'Need an unused corridor pair');

  const admin = { userId: null, role: 'admin', displayName: 'Transport Admin' };
  const req = { ip: '127.0.0.1', get: () => 't', requestId: 'transport-intel-1' };

  const route = await transportAdminService.createRoute(
    {
      name: `Intel corridor ${Date.now()}`,
      originLocationId: originId,
      destinationLocationId: destId,
      mode: 'danfo',
      reason: 'Test corridor',
      stops: [{ label: 'Landmark stop A' }, { label: 'Landmark stop B' }],
    },
    admin,
    req
  );
  assert.ok(route.route?.id);
  assert.ok((route.route.stops || []).length >= 2);

  const stop = await transportAdminService.createDirectoryStop(
    {
      name: `CMS Bus Stop ${Date.now()}`,
      aliases: ['CMS', 'Marina CMS'],
      locationId: locs.rows[0].id,
      reason: 'Directory stop',
    },
    admin,
    req
  );
  assert.ok(stop.id || stop.name);

  const anomalies = await transportAdminService.listFareAnomalies({ limit: 10 });
  assert.ok(Array.isArray(anomalies.items));
  assert.match(anomalies.note, /never auto-deleted/i);

  const directory = await transportAdminService.listDirectoryStops({ limit: 10 });
  assert.ok(Array.isArray(directory.items));
});

test('road segment creation requires existing road or fails cleanly', async () => {
  const admin = { userId: null, role: 'admin' };
  await assert.rejects(
    () =>
      trafficEventAdminService.createRoadSegment(
        { name: 'Chevron → Jakande' },
        admin,
        { ip: '127.0.0.1', get: () => 't' }
      ),
    (err) => err instanceof AppError && err.code === 'VALIDATION_ERROR'
  );
});

test('freshness windows differ by event type', async () => {
  const {
    freshnessWindowForType,
    computeFreshnessState,
    publicSourceLabel,
    impactSeverity,
  } = await import('../src/config/trafficIntelligence.js');

  const congestion = freshnessWindowForType('congestion');
  const closure = freshnessWindowForType('road_closure');
  assert.ok(congestion.expire < closure.expire);

  const fresh = computeFreshnessState({
    eventType: 'congestion',
    observedAt: new Date(),
    status: 'active',
  });
  assert.equal(fresh, 'fresh');

  const expired = computeFreshnessState({
    eventType: 'congestion',
    observedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    status: 'active',
  });
  assert.equal(expired, 'expired');

  assert.match(publicSourceLabel({ sourceClassification: 'official' }), /Official/);
  assert.match(
    publicSourceLabel({ verificationStatus: 'community_confirmed' }),
    /Verified Community/
  );
  assert.equal(publicSourceLabel({ sourceClassification: 'community' }), 'Community Report');
  assert.equal(impactSeverity('blocked').label, 'Critical');
});

test('merge preserves provenance and expire tick does not delete', async () => {
  const pool = getPool();
  const adminId = (
    await pool.query(
      `INSERT INTO users (display_name, email, password_hash, onboarding_completed, is_moderator, admin_role)
       VALUES ('Traffic Merge Admin', $1, 'hash', TRUE, TRUE, 'admin'::admin_role)
       ON CONFLICT (email) DO UPDATE SET admin_role = 'admin'::admin_role
       RETURNING id`,
      [`traffic.merge.admin.${Date.now()}@example.com`]
    )
  ).rows[0].id;

  const location = await pool.query(
    `SELECT id FROM locations WHERE type = 'area' AND latitude IS NOT NULL ORDER BY name LIMIT 1`
  );
  assert.ok(location.rows[0]);

  const admin = { userId: adminId, role: 'admin' };
  const req = { ip: '127.0.0.1', get: () => 't', requestId: 'merge-1' };

  const a = await trafficEventAdminService.create(
    {
      title: `Merge survivor ${Date.now()}`,
      eventType: 'accident',
      severity: 'heavy',
      locationId: location.rows[0].id,
      roadName: 'Third Mainland Bridge',
      directionLabel: 'Toward Lagos Island',
      reason: 'Survivor',
    },
    admin,
    req
  );
  const b = await trafficEventAdminService.create(
    {
      title: `Merge source ${Date.now()}`,
      eventType: 'accident',
      severity: 'heavy',
      locationId: location.rows[0].id,
      roadName: 'Third Mainland Bridge',
      directionLabel: 'Toward Lagos Island',
      reason: 'Source',
    },
    admin,
    req
  );

  const merged = await trafficEventAdminService.merge(
    a.item.id,
    { sourceEventIds: [b.item.id], reason: 'Same accident — correlate reports' },
    admin,
    req
  );
  assert.ok(merged.item.id === a.item.id);

  const sourceRow = await pool.query(
    `SELECT merged_into_event_id, status FROM traffic_events WHERE id = $1`,
    [b.item.id]
  );
  assert.equal(sourceRow.rows[0].merged_into_event_id, a.item.id);
  assert.equal(sourceRow.rows[0].status, 'expired');

  const conf = await trafficEventAdminService.recomputeConfidence(a.item.id);
  assert.ok(['low', 'medium', 'high'].includes(conf.confidence));

  const pub = await trafficEventAdminService.listPublic({ limit: 20 });
  assert.ok(Array.isArray(pub.items));
  assert.ok(pub.geojson?.type === 'FeatureCollection');
  assert.ok(!pub.items.some((i) => i.id === b.item.id));

  const dups = await trafficEventAdminService.findDuplicateCandidates({ limit: 10 });
  assert.ok(Array.isArray(dups.items));

  // Stale congestion should expire without delete
  const stale = await trafficEventAdminService.create(
    {
      title: `Stale congestion ${Date.now()}`,
      eventType: 'congestion',
      severity: 'heavy',
      locationId: location.rows[0].id,
      observedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      reason: 'Stale seed',
    },
    admin,
    req
  );
  await pool.query(
    `UPDATE traffic_events SET
       observed_at = NOW() - INTERVAL '4 hours',
       expires_at = NOW() - INTERVAL '1 hour',
       freshness_state = 'stale'
     WHERE id = $1`,
    [stale.item.id]
  );
  const expired = await trafficEventAdminService.expireStaleEvents({ limit: 50 });
  assert.ok(typeof expired.expired === 'number');
  const stillThere = await pool.query(`SELECT id, status FROM traffic_events WHERE id = $1`, [
    stale.item.id,
  ]);
  assert.ok(stillThere.rows[0], 'Historical row must remain');
  assert.equal(stillThere.rows[0].status, 'expired');
});

test('traffic summary exposes asOf and activity window', async () => {
  const { trafficService } = await import('../src/services/trafficService.js');
  const summary = await trafficService.summary({});
  assert.equal(typeof summary.total, 'number');
  assert.ok(summary.asOf);
  assert.ok(summary.activityWindow);
  assert.equal(summary.activityWindow.hours, 1);
  assert.match(summary.activityWindow.note, /not a claim/i);
});

test('public traffic event detail returns related reports without private reporters', async () => {
  const list = await trafficEventAdminService.listPublic({ limit: 1 });
  if (!list.items.length) return;
  const detail = await trafficEventAdminService.getPublic(list.items[0].id);
  assert.ok(detail.event?.id);
  assert.ok(detail.asOf);
  assert.ok(Array.isArray(detail.relatedReports));
  for (const r of detail.relatedReports) {
    assert.equal(r.author, undefined);
    assert.ok(r.reportId);
  }
});

test.after(async () => {
  await closePool();
});
