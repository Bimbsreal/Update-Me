import pg from 'pg';
import { getDatabaseConfig } from '../config/env.js';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool(getDatabaseConfig());
    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err.message);
    });
  }
  return pool;
}

export async function checkDatabaseConnection() {
  try {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        `SELECT
           current_database() AS database,
           current_setting('server_version') AS version,
           EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS postgis_enabled`
      );
      return {
        connected: true,
        ...result.rows[0],
      };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      connected: false,
      error: error.message,
    };
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
