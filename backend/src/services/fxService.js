import {
  FX_BASE_CURRENCIES,
  FX_HISTORY_PERIODS,
  FX_QUOTE_CURRENCY,
  FX_SUPPORTED_PAIRS,
  normalizeCurrency,
} from '../config/fx.js';
import { fxRepository } from '../repositories/fxRepository.js';
import { AppError } from '../middleware/errorHandler.js';

function freshnessLabel(observedAt, fetchedAt) {
  const ref = new Date(fetchedAt || observedAt);
  if (Number.isNaN(ref.getTime())) return 'Historical';

  const ageMs = Date.now() - ref.getTime();
  const ageMin = Math.floor(ageMs / 60000);
  const ageHrs = Math.floor(ageMs / 3600000);

  if (ageMin < 2) return 'Updated just now';
  if (ageMin < 60) return `Updated ${ageMin} min ago`;
  if (ageHrs < 24) return `Updated ${ageHrs} hr${ageHrs === 1 ? '' : 's'} ago`;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  if (ref >= dayStart) return 'Updated today';

  const ageDays = Math.floor(ageMs / 86400000);
  if (ageDays <= 7) return `Updated ${ageDays} day${ageDays === 1 ? '' : 's'} ago`;
  return 'Historical';
}

function isStale(observedAt, fetchedAt) {
  const ref = new Date(fetchedAt || observedAt);
  if (Number.isNaN(ref.getTime())) return true;
  return Date.now() - ref.getTime() > 36 * 60 * 60 * 1000;
}

function rateTypeLabel(rateType) {
  if (rateType === 'official_reference') return 'Official / reference';
  if (rateType === 'market_indicative') return 'Market / indicative';
  return rateType;
}

function enrichObservation(obs, previous = null) {
  if (!obs) return null;

  let change = null;
  let changePercent = null;
  if (previous && Number.isFinite(previous.rate) && previous.rate > 0) {
    change = Number((obs.rate - previous.rate).toFixed(6));
    changePercent = Number((((obs.rate - previous.rate) / previous.rate) * 100).toFixed(4));
  }

  return {
    baseCurrency: obs.baseCurrency,
    quoteCurrency: obs.quoteCurrency,
    pair: `${obs.baseCurrency} / ${obs.quoteCurrency}`,
    rate: obs.rate,
    previousRate: previous?.rate ?? null,
    change,
    changePercent,
    direction: change == null ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    rateType: obs.rateType,
    rateTypeLabel: rateTypeLabel(obs.rateType),
    source: {
      id: obs.sourceId,
      displayName: obs.sourceDisplayName,
    },
    observedAt: obs.observedAt,
    fetchedAt: obs.fetchedAt,
    effectiveDate: obs.effectiveDate,
    freshness: freshnessLabel(obs.observedAt, obs.fetchedAt),
    stale: isStale(obs.observedAt, obs.fetchedAt),
  };
}

function resolvePairsFilter(basesFilter) {
  if (!basesFilter?.length) return [...FX_SUPPORTED_PAIRS];
  return FX_SUPPORTED_PAIRS.filter((p) => basesFilter.includes(p.base));
}

export const fxService = {
  getSupportedCurrencies() {
    return {
      quoteCurrency: FX_QUOTE_CURRENCY,
      baseCurrencies: [...FX_BASE_CURRENCIES],
      pairs: FX_SUPPORTED_PAIRS.map((p) => ({ ...p })),
      historyPeriods: Object.keys(FX_HISTORY_PERIODS),
    };
  },

  async getLatest({ bases = null, rateType = null } = {}) {
    const pairs = resolvePairsFilter(bases);
    const latestRows = await fxRepository.getLatestForPairs(pairs, {
      preferredRateType: rateType,
    });

    const sync = await fxRepository.getSyncState();
    const items = [];

    for (const row of latestRows) {
      const previous = await fxRepository.getPrevious(row.baseCurrency, row.quoteCurrency, {
        beforeObservedAt: row.observedAt,
        rateType: row.rateType,
        sourceId: row.sourceId,
      });
      items.push(enrichObservation(row, previous));
    }

    // Preserve configured pair order; omit missing pairs (empty = unavailable)
    const ordered = pairs
      .map((pair) => items.find((i) => i.baseCurrency === pair.base && i.quoteCurrency === pair.quote))
      .filter(Boolean);

    return {
      available: ordered.length > 0,
      message: ordered.length
        ? null
        : 'FX data temporarily unavailable.',
      quoteCurrency: FX_QUOTE_CURRENCY,
      lastSuccessfulSyncAt: sync.lastSuccessfulSyncAt,
      items: ordered,
    };
  },

  async getPair(baseRaw, quoteRaw) {
    const base = normalizeCurrency(baseRaw);
    const quote = normalizeCurrency(quoteRaw);

    const supported = FX_SUPPORTED_PAIRS.some((p) => p.base === base && p.quote === quote);
    if (!supported) {
      throw new AppError(
        `Currency pair ${base}/${quote} is not supported yet.`,
        404,
        'FX_PAIR_UNSUPPORTED'
      );
    }

    const latest = await fxRepository.getLatest({ base, quote });
    if (!latest) {
      return {
        available: false,
        message: 'FX data temporarily unavailable.',
        pair: `${base} / ${quote}`,
        baseCurrency: base,
        quoteCurrency: quote,
        latest: null,
      };
    }

    const previous = await fxRepository.getPrevious(base, quote, {
      beforeObservedAt: latest.observedAt,
      rateType: latest.rateType,
      sourceId: latest.sourceId,
    });

    return {
      available: true,
      pair: `${base} / ${quote}`,
      baseCurrency: base,
      quoteCurrency: quote,
      latest: enrichObservation(latest, previous),
      previous: previous
        ? {
            rate: previous.rate,
            observedAt: previous.observedAt,
            effectiveDate: previous.effectiveDate,
            source: { id: previous.sourceId, displayName: previous.sourceDisplayName },
          }
        : null,
    };
  },

  async getHistory({
    base: baseRaw,
    quote: quoteRaw = FX_QUOTE_CURRENCY,
    period = '30d',
    from = null,
    to = null,
    rateType = null,
    sourceId = null,
  } = {}) {
    const base = normalizeCurrency(baseRaw);
    const quote = normalizeCurrency(quoteRaw);

    const supported = FX_SUPPORTED_PAIRS.some((p) => p.base === base && p.quote === quote);
    if (!supported) {
      throw new AppError(
        `Currency pair ${base}/${quote} is not supported yet.`,
        404,
        'FX_PAIR_UNSUPPORTED'
      );
    }

    const days = from || to ? null : FX_HISTORY_PERIODS[period] || 30;
    const points = await fxRepository.getHistory({
      base,
      quote,
      days,
      fromDate: from,
      toDate: to,
      rateType,
      sourceId,
    });

    const latest = points.length ? points[points.length - 1] : null;
    const first = points.length ? points[0] : null;
    let changePercent = null;
    if (latest && first && first.rate > 0) {
      changePercent = Number((((latest.rate - first.rate) / first.rate) * 100).toFixed(4));
    }

    const minPointsForChart = period === '7d' ? 3 : period === '30d' ? 5 : 8;

    return {
      available: points.length > 0,
      pair: `${base} / ${quote}`,
      baseCurrency: base,
      quoteCurrency: quote,
      period: from || to ? 'custom' : period,
      from: from || (points[0]?.effectiveDate ?? null),
      to: to || (points[points.length - 1]?.effectiveDate ?? null),
      pointCount: points.length,
      chartAvailable: points.length >= minPointsForChart,
      message:
        points.length === 0
          ? 'No historical FX data available for this period yet.'
          : points.length < minPointsForChart
            ? 'Not enough historical observations to draw a reliable chart yet.'
            : null,
      currentRate: latest
        ? enrichObservation(
            latest,
            points.length > 1 ? points[points.length - 2] : null
          )
        : null,
      changePercent,
      source: latest
        ? { id: latest.sourceId, displayName: latest.sourceDisplayName }
        : null,
      points: points.map((p) => ({
        date: p.effectiveDate,
        rate: p.rate,
        observedAt: p.observedAt,
        sourceId: p.sourceId,
        rateType: p.rateType,
      })),
    };
  },

  async getAdminStatus() {
    const [sync, sources, observationCount, currencies] = await Promise.all([
      fxRepository.getSyncState(),
      fxRepository.listSources(),
      fxRepository.countObservations(),
      Promise.resolve(this.getSupportedCurrencies()),
    ]);

    return {
      currencies,
      sources,
      observationCount,
      sync,
    };
  },
};
