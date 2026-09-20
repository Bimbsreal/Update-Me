/**
 * SSE realtime registration helpers.
 */

import { realtimeBroker } from './broker.js';

export function sseHeaders() {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  };
}

/**
 * Called from src/index.js — starts broker maintenance (cleanup timers).
 * Express routes are mounted via routes/index.js → /realtime.
 */
export function createRealtimeRouter() {
  return {
    register(_app) {
      realtimeBroker.start();
    },
  };
}

export { realtimeBroker } from './broker.js';
export { realtimePublisher } from './publisher.js';
export { EVENT_TYPES } from './eventTypes.js';
export { createRealtimeRouter as createRealtimeHttpRouter } from './routes.js';
