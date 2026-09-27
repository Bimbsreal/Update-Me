/**
 * §7A Commodity price observation data model tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { closePool, getPool } from '../src/db/pool.js';
import {
  buildObservationApiFields,
  freshnessFromObservation,
  mapModerationStatus,
  mapSourceType,
  mapVerificationStatus,
} from '../src/utils/priceObservationModel.js';
import { pricesRepository } from '../src/repositories/pricesRepository.js';
import { commodityAdminService } from '../src/services/commodityAdminService.js';

test('source ≠ verification ≠ moderation ≠ freshness', () => {
  assert.equal(mapSourceType('community'), 'community');
  assert.equal(mapSourceType('official'), 'official');
  assert.equal(mapSourceType('aggregated'), 'market_reference');

  const communityVerified = {
    source_type: 'community',
    status: 'confirmed',
    moderation_state: 'none',
    confirmed_accurate_count: 2,
    occurred_at: new Date(),
    created_at: new Date(),
  };
  assert.equal(mapVerificationStatus(communityVerified), 'verified');
  assert.equal(mapModerationStatus('none', 'confirmed'), 'approved');
  assert.equal(mapSourceType(communityVerified.source_type), 'community');

  const flaggedOfficial = {
    source_type: 'official',
    status: 'flagged',
    moderation_state: 'flagged',
    occurred_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    created_at: new Date(),
    stale_after_minutes: 720,
  };
  assert.equal(mapVerificationStatus(flaggedOfficial), 'needs_review');
  assert.equal(mapModerationStatus('flagged', 'flagged'), 'flagged');
  assert.equal(freshnessFromObservation(flaggedOfficial), 'stale');

  const fields = buildObservationApiFields(communityVerified);
  assert.equal(fields.source.type, 'community');
  assert.equal(fields.verification, 'verified');
  assert.ok(fields.observedAt);
  assert.ok(fields.submittedAt);
  assert.equal(fields.reporter, undefined);
});

test('categories and units tables exist after migration', async () => {
  const pool = getPool();
  const cats = await pool.query(
    `SELECT code FROM commodity_categories WHERE is_active = TRUE ORDER BY sort_order`
  );
  assert.ok(cats.rows.length >= 5);
  assert.ok(cats.rows.some((r) => r.code === 'grains'));

  const units = await pool.query(`SELECT code FROM price_units WHERE is_active = TRUE`);
  assert.ok(units.rows.some((r) => r.code === 'kg'));
  assert.ok(units.rows.some((r) => r.code === 'bag'));

  const linked = await pool.query(
    `SELECT COUNT(*)::int AS c FROM commodity_variants WHERE unit_id IS NOT NULL`
  );
  assert.ok(linked.rows[0].c > 0);

  const catsApi = await commodityAdminService.categories();
  assert.ok(catsApi.some((c) => c.id === 'grains'));
  const unitsApi = await commodityAdminService.listUnits();
  assert.ok(unitsApi.some((u) => u.code === 'bag'));
});

test('commodities have no current_price column', async () => {
  const result = await getPool().query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'commodities' AND column_name = 'current_price'`
  );
  assert.equal(result.rows.length, 0);
});

test('price amount is numeric and currency is NGN', async () => {
  const col = await getPool().query(
    `SELECT data_type, numeric_precision, numeric_scale
     FROM information_schema.columns
     WHERE table_name = 'commodity_price_reports' AND column_name = 'price_amount'`
  );
  assert.equal(col.rows[0]?.data_type, 'numeric');
  assert.ok(Number(col.rows[0]?.numeric_scale) >= 2);

  const cur = await getPool().query(
    `SELECT column_default FROM information_schema.columns
     WHERE table_name = 'commodity_price_reports' AND column_name = 'price_currency'`
  );
  assert.match(String(cur.rows[0]?.column_default || ''), /NGN/);
});

test('multiple observations for same commodity/location remain distinct', async () => {
  const pool = getPool();
  const sample = await pool.query(
    `SELECT cpr.commodity_id, r.location_id, cpr.variant_id, COUNT(*)::int AS c
     FROM commodity_price_reports cpr
     JOIN reports r ON r.id = cpr.report_id
     WHERE r.status <> 'removed'
     GROUP BY cpr.commodity_id, r.location_id, cpr.variant_id
     HAVING COUNT(*) >= 2
     LIMIT 1`
  );
  if (!sample.rows[0]) {
    // Seed not required — verify uniqueness constraint does not exist on that triple
    const uniq = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'commodity_price_reports'
         AND indexdef ILIKE '%UNIQUE%commodity_id%location%'`
    );
    assert.equal(uniq.rows.length, 0);
    return;
  }
  const { commodity_id, location_id, variant_id, c } = sample.rows[0];
  assert.ok(c >= 2);
  const rows = await pool.query(
    `SELECT cpr.id, cpr.price_amount, r.occurred_at, r.created_at
     FROM commodity_price_reports cpr
     JOIN reports r ON r.id = cpr.report_id
     WHERE cpr.commodity_id = $1 AND r.location_id = $2 AND cpr.variant_id = $3
       AND r.status <> 'removed'
     ORDER BY r.occurred_at DESC NULLS LAST, r.created_at DESC`,
    [commodity_id, location_id, variant_id]
  );
  assert.equal(rows.rows.length, c);
  const ids = new Set(rows.rows.map((r) => r.id));
  assert.equal(ids.size, c);
});

test('observation API mapping exposes structured price/location/source', async () => {
  const list = await commodityAdminService.listObservations({ page: 1, limit: 5 });
  if (!list.items.length) return;
  const item = list.items[0];
  assert.ok(item.commodity?.name);
  assert.equal(typeof item.price?.amount, 'number');
  assert.equal(item.price?.currency, 'NGN');
  assert.ok(item.verification);
  assert.ok(item.moderation || item.moderationState);
  assert.ok(item.freshness);
  assert.ok(item.sourceTypeMapped || item.source?.type);
  assert.notEqual(item.verification, item.freshness);
  // Public mapper must not embed private author on top-level public shape
  const publicMapped = pricesRepository.mapPriceReport({
    price_id: item.id,
    report_id: item.reportId,
    price_amount: item.price.amount,
    price_currency: 'NGN',
    commodity_id: item.commodity.id,
    commodity_name: item.commodity.name,
    commodity_code: item.commodity.code,
    variant_id: item.variant?.id,
    variant_code: item.variant?.code,
    unit_code: item.variant?.unitCode,
    location_id: item.location?.id,
    location_name: item.location?.name,
    source_type: item.sourceType,
    status: item.status,
    moderation_state: item.moderationState,
    occurred_at: item.occurredAt,
    created_at: item.createdAt,
    confirmed_accurate_count: 0,
    user_id: '00000000-0000-0000-0000-000000000099',
    author_display_name: 'Secret Reporter',
  });
  assert.equal(publicMapped.report.author, undefined);
  assert.ok(publicMapped.source);
  assert.ok(publicMapped.observedAt !== undefined);
  assert.ok(publicMapped.submittedAt !== undefined);
});

test('catalogue returns category and unit references', async () => {
  const list = await commodityAdminService.listCatalogue({ page: 1, limit: 5 });
  assert.ok(Array.isArray(list.categories));
  assert.ok(Array.isArray(list.units));
  if (list.items[0]) {
    // category may be null for uncategorized, but field exists
    assert.ok('category' in list.items[0] || 'categoryId' in list.items[0]);
  }
});

test.after(async () => {
  await closePool();
});
