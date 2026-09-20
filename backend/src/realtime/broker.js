import { randomUUID } from 'crypto';
import {
  CATEGORY_FOR_EVENT,
  INFORMATION_EVENTS,
  USER_EVENTS,
  isKnownEventType,
} from './eventTypes.js';

const MAX_CONNECTIONS_PER_USER = 3;
const HEARTBEAT_MS = 25_000;
const STALE_CONNECTION_MS = 90_000;

/**
 * In-process SSE broker.
 * Designed so a Redis adapter can replace fan-out later without changing publishers.
 */
class RealtimeBroker {
  constructor() {
    /** @type {Map<string, object>} */
    this.connections = new Map();
    this._eventSeq = 0;
    this._cleanupTimer = null;
  }

  start() {
    if (this._cleanupTimer) return;
    this._cleanupTimer = setInterval(() => this.pruneStale(), 60_000);
    if (typeof this._cleanupTimer.unref === 'function') {
      this._cleanupTimer.unref();
    }
  }

  stop() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    for (const conn of this.connections.values()) {
      this.remove(conn.id);
    }
  }

  countForUser(userId) {
    let n = 0;
    for (const c of this.connections.values()) {
      if (c.userId === userId) n += 1;
    }
    return n;
  }

  /**
   * @param {{ userId: string, res: import('express').Response, context?: object }} opts
   */
  add({ userId, res, context = {} }) {
    if (this.countForUser(userId) >= MAX_CONNECTIONS_PER_USER) {
      const oldest = [...this.connections.values()]
        .filter((c) => c.userId === userId)
        .sort((a, b) => a.connectedAt - b.connectedAt)[0];
      if (oldest) this.remove(oldest.id);
    }

    const id = randomUUID();
    const conn = {
      id,
      userId,
      res,
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
      locationIds: new Set(context.locationIds || []),
      stateIds: new Set(context.stateIds || []),
      categories: context.categories ? new Set(context.categories) : null,
      heartbeatTimer: null,
    };

    conn.heartbeatTimer = setInterval(() => {
      try {
        if (res.writableEnded) {
          this.remove(id);
          return;
        }
        res.write(`: heartbeat ${Date.now()}\n\n`);
        conn.lastActivityAt = Date.now();
      } catch {
        this.remove(id);
      }
    }, HEARTBEAT_MS);
    if (typeof conn.heartbeatTimer.unref === 'function') {
      conn.heartbeatTimer.unref();
    }

    this.connections.set(id, conn);
    return conn;
  }

  updateContext(connectionId, context = {}) {
    const conn = this.connections.get(connectionId);
    if (!conn) return null;
    if (context.locationIds) {
      conn.locationIds = new Set(context.locationIds);
    }
    if (context.stateIds) {
      conn.stateIds = new Set(context.stateIds);
    }
    if (context.categories !== undefined) {
      conn.categories = context.categories ? new Set(context.categories) : null;
    }
    conn.lastActivityAt = Date.now();
    return conn;
  }

  remove(connectionId) {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    if (conn.heartbeatTimer) clearInterval(conn.heartbeatTimer);
    this.connections.delete(connectionId);
    try {
      if (!conn.res.writableEnded) conn.res.end();
    } catch {
      /* already closed */
    }
  }

  pruneStale() {
    const now = Date.now();
    for (const conn of [...this.connections.values()]) {
      if (conn.res.writableEnded || now - conn.lastActivityAt > STALE_CONNECTION_MS) {
        this.remove(conn.id);
      }
    }
  }

  /**
   * Publish a sanitized event to eligible connections.
   * @param {{ type: string, payload: object }} event
   */
  publish(event) {
    if (!event?.type || !isKnownEventType(event.type)) return { delivered: 0 };
    const payload = event.payload || {};
    const id = String(++this._eventSeq);
    const envelope = {
      id,
      type: event.type,
      ...payload,
      publishedAt: payload.publishedAt || new Date().toISOString(),
    };

    let delivered = 0;
    for (const conn of this.connections.values()) {
      if (!this._matches(conn, event.type, envelope)) continue;
      if (this._write(conn, event.type, id, envelope)) delivered += 1;
    }
    return { delivered, eventId: id };
  }

  _matches(conn, type, envelope) {
    if (USER_EVENTS.has(type)) {
      return envelope.userId && envelope.userId === conn.userId;
    }

    if (!INFORMATION_EVENTS.has(type)) return false;

    const category = envelope.category || CATEGORY_FOR_EVENT[type];
    if (conn.categories && category && !conn.categories.has(category) && !conn.categories.has('all')) {
      return false;
    }

    const loc = envelope.location || {};
    const hasGeo =
      Boolean(loc.id) || Boolean(loc.stateId) || Boolean(loc.lgaId) || Boolean(loc.areaId);

    // National / unscoped notices: category gate already applied above.
    if (!hasGeo) {
      if (!category) return Boolean(!conn.categories || conn.categories.has('all'));
      return true;
    }

    if (loc.id && conn.locationIds.has(loc.id)) return true;
    if (loc.areaId && conn.locationIds.has(loc.areaId)) return true;
    if (loc.lgaId && conn.locationIds.has(loc.lgaId)) return true;
    if (loc.stateId && (conn.locationIds.has(loc.stateId) || conn.stateIds.has(loc.stateId))) {
      return true;
    }

    return false;
  }

  _write(conn, type, id, envelope) {
    try {
      if (conn.res.writableEnded) {
        this.remove(conn.id);
        return false;
      }
      // Strip recipient-only fields from wire payload for information events
      const wire = { ...envelope };
      if (INFORMATION_EVENTS.has(type)) {
        delete wire.userId;
      }
      const data = JSON.stringify(wire);
      conn.res.write(`id: ${id}\n`);
      conn.res.write(`event: ${type}\n`);
      conn.res.write(`data: ${data}\n\n`);
      conn.lastActivityAt = Date.now();
      return true;
    } catch {
      this.remove(conn.id);
      return false;
    }
  }

  stats() {
    return {
      connections: this.connections.size,
      users: new Set([...this.connections.values()].map((c) => c.userId)).size,
    };
  }
}

export const realtimeBroker = new RealtimeBroker();
export { MAX_CONNECTIONS_PER_USER, HEARTBEAT_MS };
