import { randomUUID } from 'crypto';
import { env } from '../config/env.js';
import { recordHttpMetric } from '../services/metricsService.js';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Attach a correlation ID and lightweight access logging.
 * Does not log bodies, cookies, or Authorization headers.
 */
export function requestContext(req, res, next) {
  const incoming = req.get(REQUEST_ID_HEADER);
  const requestId =
    incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming) ? incoming : randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const started = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - started;
    const pathOnly = req.originalUrl?.split('?')[0] || req.path;
    const userId = req.auth?.userId || req.admin?.userId || null;
    const role = req.admin?.role || null;
    const entry = {
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      msg: 'http_request',
      ts: new Date().toISOString(),
      requestId,
      method: req.method,
      path: pathOnly,
      status: res.statusCode,
      durationMs,
      userId,
      role,
    };

    try {
      recordHttpMetric({
        method: req.method,
        path: pathOnly,
        status: res.statusCode,
        durationMs,
      });
    } catch {
      /* metrics must never break responses */
    }

    // Aggregate product usage + DAU markers (no path storage on activity table)
    try {
      import('../services/analyticsService.js')
        .then(({ analyticsService }) => {
          analyticsService.recordFeatureHit(pathOnly);
          if (userId) analyticsService.recordUserActivity(userId);
          if (res.statusCode >= 500) {
            analyticsService.recordErrorGroup({
              errorType: 'HttpError',
              message: `HTTP ${res.statusCode} ${req.method} ${pathOnly}`,
              endpoint: pathOnly,
              statusCode: res.statusCode,
              requestId,
            });
          }
        })
        .catch(() => {});
    } catch {
      /* ignore */
    }

    // Skip noisy health polls in production logs
    if (
      env.NODE_ENV === 'production' &&
      entry.status < 400 &&
      (entry.path === '/api/v1/health' ||
        entry.path === '/api/v1/health/live' ||
        entry.path === '/api/v1/health/ready')
    ) {
      return;
    }

    const line = JSON.stringify(entry);
    if (entry.level === 'error') console.error(line);
    else if (entry.level === 'warn') console.warn(line);
    else if (env.NODE_ENV !== 'production' || durationMs >= 800) console.log(line);
  });

  next();
}
