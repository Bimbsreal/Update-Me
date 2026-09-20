import {
  fxHistoryQuerySchema,
  fxLatestQuerySchema,
  fxPairParamSchema,
  fxSyncBodySchema,
} from '../validators/fx.js';
import { fxService } from '../services/fxService.js';
import { fxSyncService } from '../services/fxSyncService.js';

export async function getFxCurrencies(_req, res, next) {
  try {
    return res.json({ success: true, currencies: fxService.getSupportedCurrencies() });
  } catch (error) {
    return next(error);
  }
}

export async function getFxLatest(req, res, next) {
  try {
    const query = fxLatestQuerySchema.parse(req.query);
    const data = await fxService.getLatest({
      bases: query.base,
      rateType: query.rateType,
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function getFxHistory(req, res, next) {
  try {
    const query = fxHistoryQuerySchema.parse(req.query);
    const data = await fxService.getHistory({
      base: query.base,
      quote: query.quote,
      period: query.period,
      from: query.from,
      to: query.to,
      rateType: query.rateType,
      sourceId: query.sourceId,
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function getFxPair(req, res, next) {
  try {
    const { base, quote } = fxPairParamSchema.parse(req.params);
    const data = await fxService.getPair(base, quote);
    return res.json({ success: true, ...data });
  } catch (error) {
    return next(error);
  }
}

export async function getFxAdminStatus(_req, res, next) {
  try {
    const status = await fxService.getAdminStatus();
    return res.json({ success: true, status });
  } catch (error) {
    return next(error);
  }
}

export async function postFxAdminSync(req, res, next) {
  try {
    const body = fxSyncBodySchema.parse(req.body || {});
    let result;
    if (body.provider) {
      result = {
        status: undefined,
        results: [
          await fxSyncService.syncProvider(body.provider, {
            includeHistory: body.includeHistory,
          }),
        ],
      };
      result.status = result.results[0]?.status || 'failed';
    } else {
      result = await fxSyncService.syncAll({ includeHistory: body.includeHistory });
    }
    return res.json({ success: true, sync: result });
  } catch (error) {
    return next(error);
  }
}
