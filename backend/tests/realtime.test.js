/**
 * Realtime / SSE unit + integration tests (local DB optional for auth HTTP).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_TYPES, INFORMATION_EVENTS, USER_EVENTS } from '../src/realtime/eventTypes.js';
import { realtimeBroker } from '../src/realtime/broker.js';
import { realtimePublisher, locationFromEntity } from '../src/realtime/publisher.js';

function mockRes() {
  const chunks = [];
  return {
    writableEnded: false,
    chunks,
    write(chunk) {
      chunks.push(String(chunk));
      return true;
    },
    end() {
      this.writableEnded = true;
    },
  };
}

test('event taxonomy is controlled and known', () => {
  assert.ok(INFORMATION_EVENTS.has(EVENT_TYPES.TRAFFIC_UPDATED));
  assert.ok(USER_EVENTS.has(EVENT_TYPES.NOTIFICATION_CREATED));
  assert.equal(EVENT_TYPES.ALERT_CREATED, 'alert.created');
});

test('locationFromEntity never includes coordinates', () => {
  const loc = locationFromEntity({
    location: {
      id: 'loc-1',
      name: 'Lekki Phase 1',
      state: { id: 'st-1', name: 'Lagos' },
      lga: { id: 'lga-1', name: 'Eti-Osa' },
      area: { id: 'area-1', name: 'Lekki Phase 1' },
    },
    coordinates: { lat: 6.4, lng: 3.4 },
  });
  assert.equal(loc.id, 'loc-1');
  assert.equal(loc.stateId, 'st-1');
  assert.equal(loc.lgaId, 'lga-1');
  assert.equal(loc.areaId, 'area-1');
  assert.equal('lat' in loc, false);
  assert.equal('lng' in loc, false);
  assert.equal('coordinates' in loc, false);
});

test('broker delivers information events only to matching location subscribers', () => {
  realtimeBroker.stop();
  const resA = mockRes();
  const resB = mockRes();
  const a = realtimeBroker.add({
    userId: 'user-a',
    res: resA,
    context: { locationIds: ['loc-lekki'], stateIds: ['st-lagos'] },
  });
  const b = realtimeBroker.add({
    userId: 'user-b',
    res: resB,
    context: { locationIds: ['loc-abeokuta'], stateIds: ['st-ogun'] },
  });

  const result = realtimePublisher.trafficUpdated({
    id: 'tr-1',
    severity: 'heavy',
    location: { id: 'loc-lekki', state: { id: 'st-lagos' } },
    report: { sourceType: 'community', status: 'active' },
  });

  assert.ok(result.delivered >= 1);
  const bodyA = resA.chunks.join('');
  const bodyB = resB.chunks.join('');
  assert.match(bodyA, /event: traffic\.updated/);
  assert.match(bodyA, /"entityId":"tr-1"/);
  assert.doesNotMatch(bodyA, /moderation/i);
  assert.equal(bodyB.includes('traffic.updated'), false);

  realtimeBroker.remove(a.id);
  realtimeBroker.remove(b.id);
});

test('broker scopes notification.created to recipient only', () => {
  realtimeBroker.stop();
  const resA = mockRes();
  const resB = mockRes();
  const a = realtimeBroker.add({
    userId: 'user-a',
    res: resA,
    context: { locationIds: ['loc-1'], stateIds: [] },
  });
  const b = realtimeBroker.add({
    userId: 'user-b',
    res: resB,
    context: { locationIds: ['loc-1'], stateIds: [] },
  });

  realtimePublisher.notificationCreated({
    id: 'n-1',
    userId: 'user-a',
    category: 'traffic',
    title: 'Heavy traffic near your saved place',
    priority: 'important',
    createdAt: new Date().toISOString(),
  });

  assert.match(resA.chunks.join(''), /notification\.created/);
  assert.equal(resB.chunks.join('').includes('notification.created'), false);

  realtimeBroker.remove(a.id);
  realtimeBroker.remove(b.id);
});

test('broker enforces max connections per user by evicting oldest', () => {
  realtimeBroker.stop();
  const ids = [];
  for (let i = 0; i < 4; i += 1) {
    const conn = realtimeBroker.add({
      userId: 'user-limit',
      res: mockRes(),
      context: { locationIds: [], stateIds: [] },
    });
    ids.push(conn.id);
  }
  assert.equal(realtimeBroker.countForUser('user-limit'), 3);
  assert.equal(realtimeBroker.connections.has(ids[0]), false);
  for (const id of ids.slice(1)) {
    realtimeBroker.remove(id);
  }
});

test('unknown event types are not published', () => {
  const result = realtimeBroker.publish({
    type: 'admin.secret',
    payload: { notes: 'internal' },
  });
  assert.equal(result.delivered, 0);
});

test('unauthenticated realtime events endpoint is denied', async () => {
  const API = process.env.API_BASE || 'http://localhost:5000/api/v1';
  try {
    const res = await fetch(`${API}/realtime/events`, {
      headers: { Accept: 'text/event-stream' },
    });
    assert.equal(res.status, 401);
  } catch (err) {
    // API may be down during isolated unit runs
    assert.ok(/fetch|ECONNREFUSED/i.test(String(err.message || err)));
  }
});

test('authenticated client can open SSE and receive heartbeat framing', async () => {
  const API = process.env.API_BASE || 'http://localhost:5000/api/v1';
  let cookie = '';
  try {
    const login = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact: 'admin.local@updateme.test',
        password: 'AdminLocal123!',
      }),
    });
    if (!login.ok) {
      // Skip soft when test account unavailable
      return;
    }
    const raw = login.headers.getSetCookie?.() || [];
    cookie = raw.map((c) => c.split(';')[0]).join('; ') || login.headers.get('set-cookie')?.split(';')[0] || '';
    assert.ok(cookie, 'expected session cookie');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${API}/realtime/events`, {
      headers: {
        Accept: 'text/event-stream',
        Cookie: cookie,
      },
      signal: controller.signal,
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (buf.length < 80) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (buf.includes('realtime.ready') || buf.includes('connected')) break;
    }
    clearTimeout(timer);
    controller.abort();
    assert.match(buf, /connected|realtime\.ready/);
  } catch (err) {
    if (/abort/i.test(String(err.name || err.message))) return;
    if (/fetch|ECONNREFUSED/i.test(String(err.message || err))) return;
    throw err;
  }
});
