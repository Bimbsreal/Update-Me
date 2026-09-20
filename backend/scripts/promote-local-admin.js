import { getPool, closePool } from '../src/db/pool.js';

const pool = getPool();
const users = await pool.query(
  `SELECT email, display_name, admin_role, is_moderator, onboarding_completed
   FROM users ORDER BY created_at ASC LIMIT 20`
);
console.log(JSON.stringify(users.rows, null, 2));

// Promote first onboarded user without staff role to super_admin for local testing
const candidate = await pool.query(
  `SELECT id, email, display_name FROM users
   WHERE onboarding_completed = TRUE AND email IS NOT NULL
   ORDER BY created_at ASC LIMIT 1`
);
if (candidate.rows[0]) {
  await pool.query(
    `UPDATE users
     SET admin_role = 'super_admin', is_moderator = TRUE, updated_at = NOW()
     WHERE id = $1`,
    [candidate.rows[0].id]
  );
  console.log('Promoted to super_admin:', candidate.rows[0]);
}
await closePool();
