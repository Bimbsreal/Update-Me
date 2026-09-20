/**
 * Seed saved places + a meaningful notification for visual verification.
 * Usage: node scripts/seed-notifications-visual.js
 */
import { getPool, closePool } from '../src/db/pool.js';
import {
  notificationService,
  savedPlacesService,
} from '../src/services/notificationService.js';

async function findUser() {
  const result = await getPool().query(
    `SELECT id, email FROM users
     WHERE email ILIKE '%tester%' OR email ILIKE '%ui%' OR onboarding_completed = TRUE
     ORDER BY created_at ASC LIMIT 5`
  );
  return result.rows;
}

async function lekkiAndVi() {
  const result = await getPool().query(
    `SELECT id, name FROM locations
     WHERE type = 'area' AND name IN ('Lekki Phase 1', 'Victoria Island')
     ORDER BY name`
  );
  const map = Object.fromEntries(result.rows.map((r) => [r.name, r.id]));
  if (!map['Lekki Phase 1'] || !map['Victoria Island']) {
    throw new Error('Need Lekki Phase 1 and Victoria Island locations');
  }
  return map;
}

async function main() {
  const users = await findUser();
  if (!users.length) throw new Error('No users found — register locally first.');
  const userId = users[0].id;
  const places = await lekkiAndVi();

  try {
    await savedPlacesService.createArea(userId, {
      locationId: places['Lekki Phase 1'],
      placeKind: 'home',
      customName: 'Home',
    });
  } catch (err) {
    if (err.code !== 'DUPLICATE_SAVED_AREA') throw err;
  }

  try {
    await savedPlacesService.createRoute(userId, {
      originLocationId: places['Lekki Phase 1'],
      destinationLocationId: places['Victoria Island'],
      customName: 'Home → Work',
      travelMode: 'driving',
    });
  } catch (err) {
    if (err.code !== 'DUPLICATE_SAVED_ROUTE') throw err;
  }

  const eventId = crypto.randomUUID();
  await notificationService.publishForLocation(places['Lekki Phase 1'], {
    category: 'traffic',
    type: 'traffic.significant',
    title: 'Heavy traffic reported on your saved route',
    message: 'Congestion reported toward Victoria Island on Lekki–Epe Expressway.',
    priority: 'important',
    relatedEntityType: 'traffic_report',
    relatedEntityId: eventId,
    actorUserId: users[1]?.id || null,
    dedupeKey: `traffic:seed:${eventId}`,
  });

  await notificationService.publishForLocation(places['Victoria Island'], {
    category: 'road_alerts',
    type: 'alert.significant',
    title: 'Flooding reported along your saved route',
    message: 'Standing water reported near Admiralty / VI approach.',
    priority: 'urgent',
    relatedEntityType: 'local_alert',
    relatedEntityId: crypto.randomUUID(),
    actorUserId: users[1]?.id || null,
    dedupeKey: `road_alerts:seed:${Date.now()}`,
  });

  console.log('seeded personalization for', users[0].email);
  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
