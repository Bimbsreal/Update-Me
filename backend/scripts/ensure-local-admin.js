import bcrypt from 'bcryptjs';
import { getPool, closePool } from '../src/db/pool.js';

const email = 'admin.local@updateme.test';
const password = 'AdminLocal123!';
const hash = await bcrypt.hash(password, 10);
const pool = getPool();

const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
let id = existing.rows[0]?.id;
if (!id) {
  const created = await pool.query(
    `INSERT INTO users (display_name, email, password_hash, onboarding_completed, is_moderator, admin_role)
     VALUES ($1,$2,$3,TRUE,TRUE,'super_admin'::admin_role)
     RETURNING id`,
    ['Local Admin', email, hash]
  );
  id = created.rows[0].id;
} else {
  await pool.query(
    `UPDATE users
     SET password_hash = $2, admin_role = 'super_admin'::admin_role, is_moderator = TRUE,
         onboarding_completed = TRUE, suspended_at = NULL, updated_at = NOW()
     WHERE id = $1`,
    [id, hash]
  );
}

// Ensure current area so onboarding is happy
const area = await pool.query(
  `SELECT id FROM areas WHERE is_active = TRUE ORDER BY name LIMIT 1`
);
if (area.rows[0]) {
  await pool.query(
    `UPDATE users SET current_area_id = $2,
       current_state_id = (SELECT state_id FROM areas WHERE id = $2),
       current_lga_id = (SELECT lga_id FROM areas WHERE id = $2)
     WHERE id = $1`,
    [id, area.rows[0].id]
  );
}

console.log(JSON.stringify({ email, password, id }, null, 2));
await closePool();
