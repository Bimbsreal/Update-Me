import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { getPool } from '../db/pool.js';
import { savedPlacesRepository } from '../repositories/savedPlacesRepository.js';
import { realtimeBroker, MAX_CONNECTIONS_PER_USER } from './broker.js';

function sseHeaders() {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  };
}

const connectLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many realtime connection attempts. Please wait.',
  },
});

function parseCategories(raw) {
  if (!raw || raw === 'all') return null;
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

/**
 * Resolve location + state IDs the user is eligible to receive events for.
 * Arbitrary client locationId is only accepted when it belongs to the user's
 * current area or an enabled saved area/route (no open subscription to any UUID).
 */
export async function buildSubscriptionContext(userId, { locationId, categories } = {}) {
  const locationIds = new Set();
  const stateIds = new Set();

  const pool = getPool();

  // User current area → location UUID + state
  const me = await pool.query(
    `SELECT
       COALESCE(
         u.current_location_id,
         (SELECT id FROM locations WHERE type = 'area' AND area_id = u.current_area_id LIMIT 1)
       ) AS location_id,
       a.state_id
     FROM users u
     LEFT JOIN areas a ON a.id = u.current_area_id
     WHERE u.id = $1`,
    [userId]
  );
  const row = me.rows[0];
  if (row?.location_id) {
    locationIds.add(row.location_id);
  }
  if (row?.state_id) stateIds.add(row.state_id);

  // Saved areas + routes
  try {
    const [areas, routes] = await Promise.all([
      savedPlacesRepository.listAreas(userId),
      savedPlacesRepository.listRoutes(userId),
    ]);
    for (const area of areas || []) {
      if (area.notifyEnabled === false) continue;
      if (area.location?.id) {
        locationIds.add(area.location.id);
        if (area.location.state?.id) stateIds.add(area.location.state.id);
      }
    }
    for (const route of routes || []) {
      if (route.notifyEnabled === false) continue;
      if (route.origin?.id) locationIds.add(route.origin.id);
      if (route.destination?.id) locationIds.add(route.destination.id);
    }
  } catch {
    /* saved places optional for stream */
  }

  // Explore context: only add locationId when it is in a state the user already follows.
  if (locationId && !locationIds.has(locationId)) {
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(String(locationId)) && stateIds.size > 0) {
      const geo = await pool.query(
        `SELECT id, state_id FROM locations WHERE id = $1`,
        [locationId]
      );
      const loc = geo.rows[0];
      if (loc?.state_id && stateIds.has(loc.state_id)) {
        locationIds.add(loc.id);
      }
    }
  }

  // Enrich state IDs for any remaining location UUIDs
  const ids = [...locationIds];
  if (ids.length) {
    const geo = await pool.query(
      `SELECT id, state_id FROM locations WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    for (const g of geo.rows) {
      if (g.state_id) stateIds.add(g.state_id);
    }
  }

  return {
    locationIds: [...locationIds],
    stateIds: [...stateIds],
    categories: parseCategories(categories),
  };
}

export function createRealtimeRouter() {
  const router = Router();

  router.get('/health', requireAuth, (_req, res) => {
    res.json({ success: true, realtime: realtimeBroker.stats() });
  });

  /**
   * GET /api/v1/realtime/events
   * Long-lived SSE stream. Auth required. Location-scoped fan-out.
   *
   * Query:
   *   locationId — current Explore / selected area location UUID
   *   categories — comma list or "all"
   *
   * Reconnect: clients should reconcile via REST after reconnect.
   * Last-Event-ID is accepted but historical replay is not retained
   * across process restarts (in-process only, no Redis).
   */
  router.get('/events', connectLimiter, requireAuth, async (req, res, next) => {
    try {
      const userId = req.auth.userId;
      if (realtimeBroker.countForUser(userId) >= MAX_CONNECTIONS_PER_USER) {
        // Broker will evict oldest on add; still allow reconnect.
      }

      const context = await buildSubscriptionContext(userId, {
        locationId: req.query.locationId || undefined,
        categories: req.query.categories,
      });

      res.writeHead(200, {
        ...sseHeaders(),
        'X-Accel-Buffering': 'no',
      });
      res.write(`: connected ${Date.now()}\n\n`);
      res.write(
        `event: realtime.ready\ndata: ${JSON.stringify({
          type: 'realtime.ready',
          locationCount: context.locationIds.length,
          reconnect: 'Use REST for initial/reconcile state. Event history is not replayed.',
        })}\n\n`
      );

      const conn = realtimeBroker.add({ userId, res, context });

      req.on('close', () => {
        realtimeBroker.remove(conn.id);
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/v1/realtime/context
   * Update subscription without opening a new EventSource.
   * Body: { connectionId?, locationId?, categories? }
   * Note: browsers EventSource cannot send connectionId easily —
   * prefer reconnect with query params. This endpoint supports
   * future custom clients / tests.
   */
  router.patch('/context', requireAuth, async (req, res, next) => {
    try {
      const { connectionId, locationId, categories } = req.body || {};
      if (!connectionId) {
        throw new AppError('connectionId is required.', 400, 'VALIDATION_ERROR');
      }
      const conn = realtimeBroker.connections.get(connectionId);
      if (!conn || conn.userId !== req.auth.userId) {
        throw new AppError('Connection not found.', 404, 'CONNECTION_NOT_FOUND');
      }
      const context = await buildSubscriptionContext(req.auth.userId, {
        locationId,
        categories,
      });
      realtimeBroker.updateContext(connectionId, context);
      res.json({ success: true, context: { locationCount: context.locationIds.length } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
