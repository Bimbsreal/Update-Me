/**
 * Data Quality / Freshness / Trust signals tests (no AI, no truth score).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAboutLines,
  buildQualityMetadata,
  computeFreshnessState,
  corroborationLabel,
  sourceFromType,
  verificationFromRow,
} from '../src/services/dataQualityService.js';
import { getPool, closePool } from '../src/db/pool.js';
import { reportRepository } from '../src/repositories/reportRepository.js';
import { reportService } from '../src/services/reportService.js';
import { trafficService } from '../src/services/trafficService.js';
import { adminService } from '../src/services/adminService.js';

const policyTraffic = {
  fresh_within_minutes: 15,
  recent_within_minutes: 30,
  stale_after_minutes: 60,
  default_ttl_minutes: 180,
};

test('freshness bands: fresh / recent / aging / stale / expired', () => {
  const nowMs = Date.parse('2026-09-19T12:00:00.000Z');
  const now = new Date(nowMs);

  const fresh = computeFreshnessState(
    {
      status: 'active',
      occurred_at: new Date(nowMs - 5 * 60 * 1000),
      expires_at: new Date(nowMs + 3 * 60 * 60 * 1000),
    },
    policyTraffic,
    now
  );
  assert.equal(fresh.state, 'fresh');

  const recent = computeFreshnessState(
    {
      status: 'active',
      occurred_at: new Date(nowMs - 20 * 60 * 1000),
      expires_at: new Date(nowMs + 3 * 60 * 60 * 1000),
    },
    policyTraffic,
    now
  );
  assert.equal(recent.state, 'recent');

  const aging = computeFreshnessState(
    {
      status: 'active',
      occurred_at: new Date(nowMs - 45 * 60 * 1000),
      expires_at: new Date(nowMs + 3 * 60 * 60 * 1000),
    },
    policyTraffic,
    now
  );
  assert.equal(aging.state, 'aging');

  const stale = computeFreshnessState(
    {
      status: 'stale',
      occurred_at: new Date(nowMs - 90 * 60 * 1000),
      expires_at: new Date(nowMs + 3 * 60 * 60 * 1000),
    },
    policyTraffic,
    now
  );
  assert.equal(stale.state, 'stale');

  const expired = computeFreshnessState(
    {
      status: 'expired',
      occurred_at: new Date(nowMs - 200 * 60 * 1000),
      expires_at: new Date(nowMs - 1000),
    },
    policyTraffic,
    now
  );
  assert.equal(expired.state, 'expired');
});

test('source labels: community / official / aggregated', () => {
  assert.equal(sourceFromType('community').label, 'Community Report');
  assert.equal(sourceFromType('official').label, 'Official');
  assert.equal(sourceFromType('aggregated').label, 'Aggregated');
});

test('verification never promotes community to official via confirmations', () => {
  const communityConfirmed = verificationFromRow({
    status: 'confirmed',
    source_type: 'community',
    confirmed_accurate_count: 5,
  });
  assert.equal(communityConfirmed.state, 'confirmed');
  assert.notEqual(communityConfirmed.state, 'official');

  const official = verificationFromRow({ status: 'active', source_type: 'official' });
  assert.equal(official.state, 'official');

  const unverified = verificationFromRow({ status: 'active', source_type: 'community' });
  assert.equal(unverified.state, 'unverified');

  const expired = verificationFromRow({ status: 'expired', source_type: 'community' });
  assert.equal(expired.state, 'expired');
});

test('corroboration labels', () => {
  assert.equal(corroborationLabel(1), '1 report');
  assert.equal(corroborationLabel(2), '2 reports');
  assert.equal(corroborationLabel(5), '3+ reports');
});

test('quality metadata is public-safe and explainable', () => {
  const q = buildQualityMetadata(
    {
      status: 'active',
      source_type: 'community',
      occurred_at: new Date(),
      expires_at: new Date(Date.now() + 3600_000),
      corroboration_count: 2,
    },
    policyTraffic
  );
  assert.equal(q.freshness.state, 'fresh');
  assert.equal(q.source.type, 'community');
  assert.equal(q.verification.state, 'unverified');
  assert.equal(q.corroboration.count, 2);
  const about = buildAboutLines(q);
  assert.ok(about.some((l) => /community/i.test(l)));
  assert.ok(about.some((l) => /not officially verified/i.test(l)));
});

test('migration columns exist for data quality', async () => {
  const pool = getPool();
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'category_freshness_policies'
       AND column_name IN ('fresh_within_minutes','recent_within_minutes','corroboration_window_minutes')`
  );
  assert.equal(cols.rowCount, 3);

  const reportCols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'reports'
       AND column_name IN ('corroboration_count','quality_updated_at')`
  );
  assert.equal(reportCols.rowCount, 2);
});

test('admin data quality summary returns operational counts', async () => {
  const quality = await adminService.dataQuality();
  assert.ok(typeof quality.freshReports === 'number');
  assert.ok(typeof quality.staleReports === 'number');
  assert.ok(typeof quality.expiredReports === 'number');
  assert.ok(typeof quality.conflictingGroups === 'number');
  assert.ok(!('trustScore' in quality));
});

test('duplicate same-user reports do not inflate corroboration', async () => {
  const pool = getPool();
  const stamp = Date.now();
  const user = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ('DQ Tester', $1, 'x', TRUE)
     RETURNING id`,
    [`dq-tester-${stamp}@example.com`]
  );
  const userId = user.rows[0].id;
  const loc = await pool.query(
    `SELECT id FROM locations WHERE type = 'area' AND latitude IS NOT NULL ORDER BY name LIMIT 1`
  );
  assert.ok(loc.rows[0]);
  const locationId = loc.rows[0].id;
  const roadName = `DQ Isolated Road ${stamp}`;

  const a = await trafficService.create(userId, {
    locationId,
    severity: 'heavy',
    roadName,
  });
  const afterFirst = await reportRepository.findById(a.reportId);
  const count1 = afterFirst.quality.corroboration.count;

  const b = await trafficService.create(userId, {
    locationId,
    severity: 'heavy',
    roadName,
  });
  const afterSecond = await reportRepository.findById(b.reportId);
  const count2 = afterSecond.quality.corroboration.count;

  // Same user cannot increase independent corroboration
  assert.equal(count2, count1);

  const user2 = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ('DQ Tester 2', $1, 'x', TRUE)
     RETURNING id`,
    [`dq-tester-2-${stamp}@example.com`]
  );
  await trafficService.create(user2.rows[0].id, {
    locationId,
    severity: 'heavy',
    roadName,
  });
  const afterThird = await reportRepository.findById(a.reportId);
  assert.ok(afterThird.quality.corroboration.count >= count1 + 1);
});

test('freshness transitions return transition list without inventing truth', async () => {
  const result = await reportRepository.applyFreshnessTransitions({ limit: 50 });
  assert.ok(typeof result.expired === 'number');
  assert.ok(typeof result.stale === 'number');
  assert.ok(Array.isArray(result.transitions));
});

test('report API quality block shape', async () => {
  const pool = getPool();
  const existing = await pool.query(
    `SELECT id FROM reports WHERE status IN ('active','confirmed','stale') ORDER BY created_at DESC LIMIT 1`
  );
  if (!existing.rows[0]) {
    // Skip softly if empty DB
    return;
  }
  const report = await reportService.getById(existing.rows[0].id);
  assert.ok(report.quality);
  assert.ok(report.quality.freshness.state);
  assert.ok(report.quality.source.type);
  assert.ok(report.quality.verification.state);
  assert.ok(report.quality.corroboration.label);
  assert.ok(report.quality.confidence?.level);
  assert.ok(Array.isArray(report.quality.confidence.reasons));
  assert.ok(Array.isArray(report.about));
});

test('quality intelligence: confidence reasons + dimensions + events', async () => {
  const {
    computeConfidenceWithReasons,
    evaluateQualityDimensions,
    qualityIntelligenceService,
  } = await import('../src/services/qualityIntelligenceService.js');

  const conf = computeConfidenceWithReasons({
    source_type: 'official',
    status: 'active',
    corroboration_count: 3,
    location_id: '00000000-0000-4000-8000-000000000001',
    last_confirmed_at: new Date(),
  });
  assert.ok(['low', 'medium', 'high'].includes(conf.level));
  assert.ok(conf.reasons.length >= 2);
  assert.match(conf.note, /not absolute truth/i);

  const dims = evaluateQualityDimensions({
    title: 'Test',
    location_id: '00000000-0000-4000-8000-000000000001',
    status: 'active',
    source_type: 'community',
    created_at: new Date(),
    corroboration_count: 1,
  });
  assert.equal(dims.completeness.status, 'pass');
  assert.ok(dims.freshness);
  assert.ok(dims.provenance);

  const dash = await qualityIntelligenceService.intelligenceDashboard();
  assert.equal(dash.framework.opaqueTrustScore, false);
  assert.equal(dash.framework.autoMerge, false);
  assert.ok(Array.isArray(dash.domains));

  const domain = await qualityIntelligenceService.domainDashboard('traffic');
  assert.equal(domain.domain, 'traffic');
  assert.ok(domain.percentages);

  const rules = await qualityIntelligenceService.listRules();
  assert.ok(rules.items.some((r) => r.code === 'price_positive'));

  const ev = await qualityIntelligenceService.recordEvent({
    eventType: 'anomaly_detected',
    severity: 'medium',
    domain: 'fuel',
    entityType: 'report',
    title: 'Test anomaly event',
    explanation: 'Unit test anomaly — safe to resolve.',
    reasons: ['Automated test'],
  });
  assert.ok(ev.id);
  const queue = await qualityIntelligenceService.reviewQueue({ limit: 10 });
  assert.ok(Array.isArray(queue.items));
});

test.after(async () => {
  await closePool();
});
