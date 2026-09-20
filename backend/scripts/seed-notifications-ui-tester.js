import { getPool, closePool } from '../src/db/pool.js';
import {
  notificationService,
  savedPlacesService,
} from '../src/services/notificationService.js';

async function main() {
  const pool = getPool();
  const users = await pool.query(
    `SELECT id, email, display_name FROM users
     WHERE display_name ILIKE '%UI%' OR email ILIKE '%ui%' OR display_name = 'UI Tester'
     ORDER BY created_at`
  );
  console.log('matches', users.rows);
  let user = users.rows[0];
  if (!user) {
    const fallback = await pool.query(
      `SELECT id, email, display_name FROM users WHERE onboarding_completed = TRUE ORDER BY created_at LIMIT 1`
    );
    user = fallback.rows[0];
  }
  if (!user) throw new Error('No user');
  console.log('using', user);

  const lekki = (
    await pool.query(
      `SELECT id FROM locations WHERE name = 'Lekki Phase 1' AND type = 'area' LIMIT 1`
    )
  ).rows[0];
  const vi = (
    await pool.query(
      `SELECT id FROM locations WHERE name = 'Victoria Island' AND type = 'area' LIMIT 1`
    )
  ).rows[0];

  try {
    await savedPlacesService.createArea(user.id, {
      locationId: lekki.id,
      placeKind: 'home',
      customName: 'Home',
    });
  } catch (e) {
    console.log('area', e.code || e.message);
  }
  try {
    await savedPlacesService.createArea(user.id, {
      locationId: vi.id,
      placeKind: 'work',
      customName: 'Work',
    });
  } catch (e) {
    console.log('area2', e.code || e.message);
  }
  try {
    await savedPlacesService.createRoute(user.id, {
      originLocationId: lekki.id,
      destinationLocationId: vi.id,
      customName: 'Home → Work',
      travelMode: 'driving',
    });
  } catch (e) {
    console.log('route', e.code || e.message);
  }

  const eid = crypto.randomUUID();
  await notificationService.publishForLocation(lekki.id, {
    category: 'traffic',
    type: 'traffic.significant',
    title: 'Heavy traffic reported on your saved route',
    message: 'Congestion toward Victoria Island on Lekki–Epe Expressway.',
    priority: 'important',
    relatedEntityType: 'traffic_report',
    relatedEntityId: eid,
    dedupeKey: `traffic:uitester:${eid}`,
  });
  await notificationService.publishForLocation(vi.id, {
    category: 'road_alerts',
    type: 'alert.significant',
    title: 'Flooding reported along your saved route',
    message: 'Standing water reported near Admiralty / VI approach.',
    priority: 'urgent',
    relatedEntityType: 'local_alert',
    relatedEntityId: crypto.randomUUID(),
    dedupeKey: `road_alerts:uitester:${Date.now()}`,
  });

  console.log('done for', user.email || user.display_name);
  await closePool();
}

main().catch(async (e) => {
  console.error(e);
  await closePool();
  process.exit(1);
});
