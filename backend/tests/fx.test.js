/**
 * FX engine tests — mocked providers; no live external dependency required.
 * Run: node --test tests/fx.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { FXProvider } from '../src/fx/providers/FXProvider.js';
import { validateNormalizedRate, validateNormalizedRates } from '../src/fx/providers/utils.js';
import { fxRepository } from '../src/repositories/fxRepository.js';
import { fxService } from '../src/services/fxService.js';
import { syncFxProvider } from '../src/services/fxSyncService.js';
import { FX_RATE_TYPES } from '../src/config/fx.js';
import { getFxProvider } from '../src/fx/providers/index.js';

const PROVIDER_KEY = 'open_er_api';
const SOURCE_ID = 'open_er_api';

class MockMarketProvider extends FXProvider {
  constructor({ fail = false, malformed = false, rates = null } = {}) {
    super();
    this._fail = fail;
    this._malformed = malformed;
    this._rates = rates;
  }

  get key() {
    return PROVIDER_KEY;
  }

  get sourceId() {
    return SOURCE_ID;
  }

  get displayName() {
    return 'Mock market provider';
  }

  get rateType() {
    return FX_RATE_TYPES.MARKET_INDICATIVE;
  }

  get isEnabled() {
    return true;
  }

  async fetchLatest(pairs) {
    if (this._fail) throw new Error('Mock provider unavailable');
    if (this._malformed) return [{ not: 'a-rate' }];

    if (this._rates) return this._rates;

    const today = new Date().toISOString().slice(0, 10);
    return pairs.map((p, i) =>
      validateNormalizedRate({
        sourceId: this.sourceId,
        baseCurrency: p.base,
        quoteCurrency: p.quote,
        rate: 1500 + i * 100 + Math.random(),
        rateType: this.rateType,
        observedAt: `${today}T16:00:00.000Z`,
        effectiveDate: today,
      })
    );
  }

  async fetchHistory(pairs, { days = 30 } = {}) {
    if (this._fail || this._malformed) return [];
    const out = [];
    for (const p of pairs) {
      for (let d = days; d >= 1; d -= 1) {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() - d);
        if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
        const effectiveDate = date.toISOString().slice(0, 10);
        out.push(
          validateNormalizedRate({
            sourceId: this.sourceId,
            baseCurrency: p.base,
            quoteCurrency: p.quote,
            rate: 1400 + d + (p.base === 'GBP' ? 400 : p.base === 'EUR' ? 200 : 0),
            rateType: this.rateType,
            observedAt: `${effectiveDate}T16:00:00.000Z`,
            effectiveDate,
          })
        );
      }
    }
    return out;
  }
}

async function wipeFxData() {
  const pool = getPool();
  await pool.query(`DELETE FROM fx_observations`);
  await pool.query(`DELETE FROM fx_sync_runs`);
  await pool.query(`DELETE FROM fx_sync_state`);
}

function patchProvider(mock) {
  const real = getFxProvider(PROVIDER_KEY);
  const originalLatest = real.fetchLatest.bind(real);
  const originalHistory = real.fetchHistory.bind(real);
  real.fetchLatest = (...args) => mock.fetchLatest(...args);
  real.fetchHistory = (...args) => mock.fetchHistory(...args);
  return () => {
    real.fetchLatest = originalLatest;
    real.fetchHistory = originalHistory;
  };
}

test('validateNormalizedRate rejects malformed payloads', () => {
  assert.throws(() => validateNormalizedRate(null), /object/i);
  assert.throws(
    () =>
      validateNormalizedRate({
        sourceId: 'x',
        baseCurrency: 'USD',
        quoteCurrency: 'NGN',
        rate: -1,
        rateType: 'market_indicative',
        observedAt: new Date().toISOString(),
        effectiveDate: '2026-01-01',
      }),
    /Invalid FX rate/i
  );
  assert.throws(() => validateNormalizedRates({ rates: [] }), /array/i);
});

test('successful sync stores latest rates and supports duplicate prevention', async () => {
  await wipeFxData();
  const restore = patchProvider(new MockMarketProvider());

  try {
    const first = await syncFxProvider(PROVIDER_KEY, { includeHistory: true });
    assert.equal(first.status, 'success');
    assert.ok(first.upserted > 0);

    const countBefore = await fxRepository.countObservations();
    const second = await syncFxProvider(PROVIDER_KEY, { includeHistory: true });
    assert.equal(second.status, 'success');

    const countAfter = await fxRepository.countObservations();
    assert.equal(countAfter, countBefore);

    const latest = await fxService.getLatest();
    assert.equal(latest.available, true);
    assert.ok(latest.items.length >= 3);
    assert.ok(latest.items.every((i) => i.rateType === 'market_indicative'));
    assert.ok(latest.items.every((i) => i.source.id === SOURCE_ID));
    assert.ok(!latest.items.some((i) => (i.source.displayName || '').includes('CBN')));
  } finally {
    restore();
  }
});

test('failed synchronization retains last good rates and records failure', async () => {
  await wipeFxData();
  let restore = patchProvider(new MockMarketProvider());

  try {
    await syncFxProvider(PROVIDER_KEY, { includeHistory: false });
    restore();

    const before = await fxService.getLatest();
    assert.equal(before.available, true);
    const beforeRate = before.items.find((i) => i.baseCurrency === 'USD')?.rate;
    assert.ok(beforeRate > 0);

    restore = patchProvider(new MockMarketProvider({ fail: true }));
    const failed = await syncFxProvider(PROVIDER_KEY, { includeHistory: false });
    assert.equal(failed.status, 'failed');

    const after = await fxService.getLatest();
    assert.equal(after.available, true);
    assert.equal(after.items.find((i) => i.baseCurrency === 'USD')?.rate, beforeRate);

    const status = await fxService.getAdminStatus();
    const providerState = status.sync.providers.find((p) => p.providerKey === PROVIDER_KEY);
    assert.equal(providerState.lastStatus, 'failed');
    assert.ok(providerState.consecutiveFailures >= 1);
    assert.ok(providerState.lastSuccessAt);
  } finally {
    restore();
  }
});

test('malformed provider response fails sync without inventing data', async () => {
  await wipeFxData();
  const restore = patchProvider(new MockMarketProvider({ malformed: true }));

  try {
    const result = await syncFxProvider(PROVIDER_KEY, { includeHistory: false });
    assert.equal(result.status, 'failed');

    const latest = await fxService.getLatest();
    assert.equal(latest.available, false);
    assert.match(latest.message, /temporarily unavailable/i);
  } finally {
    restore();
  }
});

test('latest filtering, pair detail, and history periods', async () => {
  await wipeFxData();
  const restore = patchProvider(new MockMarketProvider());

  try {
    await syncFxProvider(PROVIDER_KEY, { includeHistory: true });

    const filtered = await fxService.getLatest({ bases: ['USD'] });
    assert.equal(filtered.items.length, 1);
    assert.equal(filtered.items[0].baseCurrency, 'USD');

    const pair = await fxService.getPair('USD', 'NGN');
    assert.equal(pair.available, true);
    assert.ok(pair.latest.rate > 0);
    assert.ok(pair.latest.freshness);
    assert.equal(pair.latest.rateType, 'market_indicative');

    const hist7 = await fxService.getHistory({ base: 'USD', quote: 'NGN', period: '7d' });
    const hist30 = await fxService.getHistory({ base: 'USD', quote: 'NGN', period: '30d' });
    const hist90 = await fxService.getHistory({ base: 'USD', quote: 'NGN', period: '90d' });

    assert.ok(hist7.pointCount > 0);
    assert.ok(hist30.pointCount >= hist7.pointCount);
    assert.ok(hist90.pointCount >= hist30.pointCount);
    assert.equal(hist30.chartAvailable, true);
  } finally {
    restore();
  }
});

test('insufficient history is reported honestly', async () => {
  await wipeFxData();
  const today = new Date().toISOString().slice(0, 10);
  await fxRepository.upsertObservation(
    validateNormalizedRate({
      sourceId: SOURCE_ID,
      baseCurrency: 'USD',
      quoteCurrency: 'NGN',
      rate: 1600,
      rateType: FX_RATE_TYPES.MARKET_INDICATIVE,
      observedAt: `${today}T16:00:00.000Z`,
      effectiveDate: today,
    })
  );

  const hist = await fxService.getHistory({ base: 'USD', quote: 'NGN', period: '30d' });
  assert.equal(hist.available, true);
  assert.equal(hist.chartAvailable, false);
  assert.match(hist.message || '', /Not enough historical/i);
});

test('CBN provider stays disabled and does not invent official rates', async () => {
  const cbn = getFxProvider('cbn');
  assert.equal(cbn.isEnabled, false);
  await assert.rejects(() => cbn.fetchLatest([{ base: 'USD', quote: 'NGN' }]), /not configured/i);
});

test.after(async () => {
  await closePool();
});
