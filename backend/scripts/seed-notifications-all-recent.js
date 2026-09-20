import { getPool, closePool } from '../src/db/pool.js';
import {
  notificationService,
  savedPlacesService,
} from '../src/services/notificationService.js';

async function main() {
  const pool = getPool();
  const users = await pool.query(
    `SELECT id, email, display_name FROM users
     ORDER BY last_seen_at DESC NULLS LAST, created_at DESC LIMIT 8`
  );
  console.log(
    users.rows.map((u) => ({ email: u.email, name: u.display_name, id: u.id }))
  );
  const lekki = await pool.query(
    `SELECT id FROM locations WHERE name = 'Lekki Phase 1' AND type = 'area' LIMIT 1`
  );
  const vi = await pool.query(
    `SELECT id FROM locations WHERE name = 'Victoria Island' AND type = 'area' LIMIT 1`
  );
  for (const u of users.rows.slice(0, 4)) {
    try {
      await savedPlacesService.createArea(u.id, {
        locationId: lekki.rows[0].id,
        placeKind: 'home',
        customName: 'Home',
      });
      console.log('area', u.email);
    } catch (e) {
      console.log('area skip', u.email, e.code || e.message);
    }
    try {
      await savedPlacesService.createRoute(u.id, {
        originLocationId: lekki.rows[0].id,
        destinationLocationId: vi.rows[0].id,
        customName: 'Home → Work',
        travelMode: 'driving',
      });
      console.log('route', u.email);
    } catch (e) {
      console.log('route skip', u.email, e.code || e.message);
    }
    const eid = crypto.randomUUID();
    await notificationService.publishForLocation(lekki.rows[0].id, {
      category: 'traffic',
      type: 'traffic.significant',
      title: 'Heavy traffic reported on your saved route',
      message: 'Congestion toward Victoria Island.',
      priority: 'important',
      relatedEntityType: 'traffic_report',
      relatedEntityId: eid,
      dedupeKey: `traffic:visual:${u.id}:${eid}`,
    });
  }
  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool();
  process.exit(1);
});
