/**
 * Directions module tests — routing provider mocked; no live provider dependency.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../src/db/pool.js';
import { directionsService } from '../src/services/directionsService.js';
import { searchDirectionsQuerySchema, createLocalKnowledgeSchema } from '../src/validators/directions.js';
import {
  RoutingProvider,
  UnavailableRoutingProvider,
  OsmRoutingProviderStub,
  setRoutingProvider,
  resetRoutingProvider,
  getRoutingProvider,
} from '../src/services/routing/RoutingProvider.js';
import { corridorId, parseCorridorId } from '../src/config/directions.js';
import { AppError } from '../src/middleware/errorHandler.js';

async function ensureUser(email) {
  const pool = getPool();
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed)
     VALUES ($1,$2,$3,TRUE) RETURNING id`,
    ['Directions Tester', email, 'test-hash-not-for-login']
  );
  return created.rows[0].id;
}

async function sampleLocations() {
  const result = await getPool().query(
    `SELECT id, name, latitude, longitude FROM locations
     WHERE type = 'area' AND latitude IS NOT NULL
     ORDER BY name LIMIT 5`
  );
  assert.ok(result.rows.length >= 2, 'Need at least two seeded area locations');
  return result.rows;
}

test('directions request validation rejects same origin/destination', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  assert.throws(() =>
    searchDirectionsQuerySchema.parse({
      originLocationId: id,
      destinationLocationId: id,
      mode: 'driving',
    })
  );
});

test('local knowledge validation requires instruction and distinct ends', () => {
  assert.throws(() =>
    createLocalKnowledgeSchema.parse({
      originLocationId: '00000000-0000-4000-8000-000000000001',
      destinationLocationId: '00000000-0000-4000-8000-000000000002',
      instructionSummary: 'ab',
    })
  );
});

test('routing provider abstraction never fabricates routes by default', async () => {
  resetRoutingProvider();
  const provider = getRoutingProvider();
  assert.ok(provider instanceof UnavailableRoutingProvider);
  const result = await provider.getRoute({
    origin: { id: 'a', lat: 6.4, lng: 3.4 },
    destination: { id: 'b', lat: 6.5, lng: 3.5 },
    mode: 'driving',
  });
  assert.equal(result.available, false);
  assert.equal(result.route, null);
  assert.match(result.message, /unavailable/i);

  const stub = new OsmRoutingProviderStub({ enabled: false });
  const stubResult = await stub.getRoute({
    origin: { id: 'a' },
    destination: { id: 'b' },
    mode: 'walking',
  });
  assert.equal(stubResult.available, false);
});

test('custom mock routing provider can be plugged in without frontend changes', async () => {
  class MockProvider extends RoutingProvider {
    get name() {
      return 'mock_test';
    }
    async getRoute() {
      return {
        available: true,
        provider: this.name,
        message: null,
        route: { provider: 'mock_test', legs: [{ note: 'test-only geometry' }] },
      };
    }
  }
  setRoutingProvider(new MockProvider());
  const result = await getRoutingProvider().getRoute({
    origin: { id: 'a' },
    destination: { id: 'b' },
    mode: 'driving',
  });
  assert.equal(result.available, true);
  assert.equal(result.provider, 'mock_test');
  resetRoutingProvider();
});

test('corridor id helpers round-trip', () => {
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  const id = corridorId(a, b, 'driving');
  const parsed = parseCorridorId(id);
  assert.equal(parsed.originLocationId, a);
  assert.equal(parsed.destinationLocationId, b);
  assert.equal(parsed.mode, 'driving');
});

test('directions search resolves locations and integrates context without fabricating times', async () => {
  resetRoutingProvider();
  const locs = await sampleLocations();
  const origin = locs[0];
  const destination = locs[1];

  const data = await directionsService.search({
    originLocationId: origin.id,
    destinationLocationId: destination.id,
    mode: 'driving',
  });

  assert.equal(data.origin.id, origin.id);
  assert.equal(data.destination.id, destination.id);
  assert.equal(data.routing.available, false);
  assert.equal(data.estimatedTravelTimeMinutes, undefined);
  assert.ok(data.corridor?.id);
  assert.ok(Array.isArray(data.results));
  assert.ok(data.context);
  assert.ok(Array.isArray(data.context.traffic));
  assert.ok(Array.isArray(data.context.alerts));
  // Distance only when coords exist — never invent travel time
  if (origin.latitude != null && destination.latitude != null) {
    assert.ok(data.estimatedDistanceKm == null || typeof data.estimatedDistanceKm === 'number');
  }
  assert.equal(data.corridor.estimatedTravelTimeMinutes, null);
});

test('invalid origin rejected', async () => {
  const locs = await sampleLocations();
  await assert.rejects(
    () =>
      directionsService.search({
        originLocationId: '00000000-0000-4000-8000-000000000099',
        destinationLocationId: locs[0].id,
        mode: 'walking',
      }),
    (err) => err instanceof AppError && err.code === 'ORIGIN_NOT_FOUND'
  );
});

test('local knowledge create, list, confirm, privacy, permissions', async () => {
  resetRoutingProvider();
  const authorId = await ensureUser('directions.author@example.com');
  const otherId = await ensureUser('directions.other@example.com');
  const locs = await sampleLocations();

  const knowledge = await directionsService.createLocalKnowledge(authorId, {
    originLocationId: locs[0].id,
    destinationLocationId: locs[1].id,
    travelMode: 'driving',
    instructionSummary: 'After the filling station, take the service lane entrance on the right.',
    majorRoads: 'Test Approach Road',
    landmarks: 'Blue gate near the market',
  });

  assert.ok(knowledge.id);
  assert.ok(knowledge.report.trustLabels.includes('Community Local Knowledge'));
  assert.ok(!knowledge.report.trustLabels.includes('Official'));
  assert.equal(knowledge.report.author?.displayName, undefined);

  const listed = await directionsService.listLocalKnowledge({
    originLocationId: locs[0].id,
    destinationLocationId: locs[1].id,
    freshness: 'any',
    page: 1,
    limit: 10,
  });
  assert.ok(listed.items.some((item) => item.id === knowledge.id));

  await assert.rejects(
    () => directionsService.confirmKnowledge(authorId, knowledge.id, { type: 'still_accurate' }),
    (err) => err instanceof AppError && err.code === 'OWN_REPORT'
  );

  const confirmed = await directionsService.confirmKnowledge(otherId, knowledge.id, {
    type: 'still_accurate',
  });
  assert.ok(confirmed.report.trustLabels.includes('Community Confirmed'));

  const search = await directionsService.search({
    originLocationId: locs[0].id,
    destinationLocationId: locs[1].id,
    mode: 'driving',
  });
  assert.ok(search.results.some((r) => r.type === 'local_knowledge' && r.knowledgeId === knowledge.id));

  const detail = await directionsService.getById(`knowledge_${knowledge.id}`);
  assert.equal(detail.type, 'local_knowledge');
  assert.equal(detail.knowledge.id, knowledge.id);
});

test('cleanup pool', async () => {
  resetRoutingProvider();
  await closePool();
});
