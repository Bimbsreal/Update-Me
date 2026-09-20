/**
 * Lightweight realtime client unit tests (no browser EventSource required).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { REALTIME_EVENTS } from '../lib/realtime.js';

test('realtime event sets are defined', () => {
  assert.ok(REALTIME_EVENTS.INFORMATION.has('traffic.updated'));
  assert.ok(REALTIME_EVENTS.INFORMATION.has('fuel.updated'));
  assert.ok(REALTIME_EVENTS.USER.has('notification.created'));
  assert.equal(REALTIME_EVENTS.INFORMATION.has('notification.created'), false);
});
