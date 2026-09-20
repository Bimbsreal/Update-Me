import { getPool, closePool } from '../src/db/pool.js';

const pool = getPool();
await pool.query(
  `UPDATE users
   SET admin_role = 'super_admin'::admin_role, is_moderator = TRUE, updated_at = NOW()
   WHERE email = 'uitester@example.com'`
);
const r = await pool.query(
  `SELECT email, display_name, admin_role, is_moderator FROM users WHERE email = 'uitester@example.com'`
);
console.log(r.rows[0]);
await closePool();
