import { randomUUID } from 'crypto';
import { env } from '../config/env.js';

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
    const userId = req.auth?.userId || req.admin?.userId || null;
    const entry = {
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      msg: 'http_request',
      requestId,
      method: req.method,
      path: req.originalUrl?.split('?')[0] || req.path,
      status: res.statusCode,
      durationMs,
      userId,
    };

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
