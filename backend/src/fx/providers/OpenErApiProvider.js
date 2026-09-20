import { FXProvider } from './FXProvider.js';
import { FX_RATE_TYPES } from '../../config/fx.js';
import {
  fetchJsonWithTimeout,
  validateNormalizedRate,
  withRetries,
} from './utils.js';
import { env } from '../../config/env.js';

function isoDateUTC(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysUTC(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * External market/indicative FX provider for NGN pairs.
 * Latest: Open Exchange Rate API (open.er-api.com) — free, no API key.
 * History: Fawaz Ahmed currency-api CDN — dated daily snapshots.
 *
 * Rate type is ALWAYS market_indicative. Never labeled as CBN.
 */
export class OpenErApiProvider extends FXProvider {
  get key() {
    return 'open_er_api';
  }

  get sourceId() {
    return 'open_er_api';
  }

  get displayName() {
    return 'External market data provider';
  }

  get rateType() {
    return FX_RATE_TYPES.MARKET_INDICATIVE;
  }

  get isEnabled() {
    return env.FX_OPEN_ER_API_ENABLED !== false;
  }

  get latestBaseUrl() {
    return (env.FX_OPEN_ER_API_BASE_URL || 'https://open.er-api.com/v6').replace(/\/$/, '');
  }

  get historyBaseUrl() {
    return (
      env.FX_HISTORY_CDN_BASE_URL ||
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api'
    ).replace(/\/$/, '');
  }

  get timeoutMs() {
    return env.FX_PROVIDER_TIMEOUT_MS || 12000;
  }

  async fetchLatest(pairs) {
    const results = [];
    const byBase = new Map();

    for (const pair of pairs) {
      const base = pair.base.toUpperCase();
      const quote = pair.quote.toUpperCase();
      if (!byBase.has(base)) byBase.set(base, new Set());
      byBase.get(base).add(quote);
    }

    for (const [base, quotes] of byBase.entries()) {
      const url = `${this.latestBaseUrl}/latest/${encodeURIComponent(base)}`;
      const data = await withRetries(
        () => fetchJsonWithTimeout(url, { timeoutMs: this.timeoutMs }),
        { label: `open-er-api-latest-${base}` }
      );

      if (data?.result && data.result !== 'success') {
        throw new Error(`Open ER API unsuccessful result for ${base}: ${data.result}`);
      }

      const rates = data?.rates;
      if (!rates || typeof rates !== 'object') {
        throw new Error(`Open ER API missing rates for ${base}`);
      }

      const timeMs = Number(data.time_last_update_unix)
        ? Number(data.time_last_update_unix) * 1000
        : Date.now();
      const observedAt = new Date(timeMs);
      if (Number.isNaN(observedAt.getTime())) {
        throw new Error('Open ER API returned invalid update time');
      }
      const effectiveDate = isoDateUTC(observedAt);

      for (const quote of quotes) {
        const rate = rates[quote];
        if (rate == null) {
          throw new Error(`Open ER API missing rate for ${base}/${quote}`);
        }
        results.push(
          validateNormalizedRate(
            {
              sourceId: this.sourceId,
              baseCurrency: base,
              quoteCurrency: quote,
              rate: Number(rate),
              rateType: this.rateType,
              observedAt: observedAt.toISOString(),
              effectiveDate,
              rawFingerprint: `open_er_api:${base}:${quote}:${effectiveDate}:${rate}`,
            },
            { sourceId: this.sourceId, rateType: this.rateType }
          )
        );
      }
    }

    return results;
  }

  async fetchHistory(pairs, { days = 90 } = {}) {
    const results = [];
    const end = new Date();
    const start = addDaysUTC(end, -Math.max(1, days));

    // Sample every other weekday — enough points for 7D/30D/90D charts without flooding the CDN
    const dates = [];
    let take = true;
    for (let d = new Date(start.getTime()); d <= end; d = addDaysUTC(d, 1)) {
      const day = d.getUTCDay();
      if (day === 0 || day === 6) continue;
      if (take) dates.push(isoDateUTC(d));
      take = !take;
    }

    const basesNeeded = [...new Set(pairs.map((p) => p.base.toUpperCase()))];
    const quoteSet = new Set(pairs.map((p) => p.quote.toUpperCase()));
    const jobs = [];
    for (const date of dates) {
      for (const base of basesNeeded) {
        jobs.push({ date, base });
      }
    }

    const concurrency = 6;
    for (let i = 0; i < jobs.length; i += concurrency) {
      const batch = jobs.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async ({ date, base }) => {
          const baseLower = base.toLowerCase();
          const url = `${this.historyBaseUrl}@${date}/v1/currencies/${baseLower}.min.json`;
          try {
            const data = await withRetries(
              () => fetchJsonWithTimeout(url, { timeoutMs: this.timeoutMs }),
              { retries: 1, delayMs: 200, label: `fx-history-${base}-${date}` }
            );
            const bucket = data?.[baseLower];
            if (!bucket || typeof bucket !== 'object') return [];

            const dayRates = [];
            for (const quote of quoteSet) {
              const quoteLower = quote.toLowerCase();
              const rate = bucket[quoteLower];
              if (rate == null) continue;
              dayRates.push(
                validateNormalizedRate(
                  {
                    sourceId: this.sourceId,
                    baseCurrency: base,
                    quoteCurrency: quote,
                    rate: Number(rate),
                    rateType: this.rateType,
                    observedAt: `${date}T16:00:00.000Z`,
                    effectiveDate: date,
                    rawFingerprint: `open_er_api:${base}:${quote}:${date}:${rate}`,
                  },
                  { sourceId: this.sourceId, rateType: this.rateType }
                )
              );
            }
            return dayRates;
          } catch (error) {
            console.warn(`[fx-history] skip ${base} ${date}: ${error.message}`);
            return [];
          }
        })
      );
      for (const part of batchResults) results.push(...part);
    }

    return results;
  }
}
