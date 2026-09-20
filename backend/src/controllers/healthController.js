import { checkDatabaseConnection } from '../db/pool.js';
import { env } from '../config/env.js';

/** Liveness — process is up. No dependency checks. */
export async function getLive(_req, res) {
  return res.status(200).json({
    success: true,
    status: 'ok',
    service: 'update-me-api',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Readiness — required dependencies.
 * Returns 503 when PostgreSQL is unreachable. Avoids leaking DB identity publicly.
 */
export async function getReady(_req, res) {
  const database = await checkDatabaseConnection();
  const ready = Boolean(database.connected);

  const payload = {
    success: ready,
    status: ready ? 'ready' : 'not_ready',
    service: 'update-me-api',
    timestamp: new Date().toISOString(),
    checks: {
      database: ready ? 'up' : 'down',
    },
  };

  if (env.NODE_ENV !== 'production' && database.connected) {
    payload.checks.postgis = database.postgis_enabled ? 'enabled' : 'missing';
  }

  return res.status(ready ? 200 : 503).json(payload);
}

/** Back-compat combined health — uses readiness semantics (503 when DB down). */
export async function getHealth(req, res) {
  return getReady(req, res);
}
