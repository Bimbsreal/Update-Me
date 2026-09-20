import { getPool } from '../db/pool.js';
import { createHash } from 'node:crypto';

function lockKey(sourceId) {
  const hex = createHash('md5').update(`official-sync:${sourceId}`).digest('hex').slice(0, 16);
  const a = Number.parseInt(hex.slice(0, 8), 16) & 0x7fffffff;
  const b = Number.parseInt(hex.slice(8, 16), 16) & 0x7fffffff;
  return [a, b];
}

/**
 * Hold a dedicated pool client for the advisory lock lifetime.
 * Session locks cannot span random pooled connections.
 */
export async function withSourceSyncLock(sourceId, fn) {
  const pool = getPool();
  const client = await pool.connect();
  const [a, b] = lockKey(sourceId);
  try {
    const got = await client.query(`SELECT pg_try_advisory_lock($1, $2) AS ok`, [a, b]);
    if (!got.rows[0]?.ok) {
      return {
        locked: false,
        result: { sourceId, status: 'skipped', error: 'sync_in_progress' },
      };
    }
    try {
      const result = await fn();
      return { locked: true, result };
    } finally {
      try {
        await client.query(`SELECT pg_advisory_unlock($1, $2)`, [a, b]);
      } catch {
        /* ignore unlock errors */
      }
    }
  } finally {
    client.release();
  }
}

export async function tryAcquireSourceSyncLock(sourceId) {
  // Test helper — prefer withSourceSyncLock for production paths.
  const pool = getPool();
  const client = await pool.connect();
  const [a, b] = lockKey(sourceId);
  try {
    const got = await client.query(`SELECT pg_try_advisory_lock($1, $2) AS ok`, [a, b]);
    if (!got.rows[0]?.ok) {
      client.release();
      return false;
    }
    // Stash client on a module map so release can free it
    heldClients.set(sourceId, { client, a, b });
    return true;
  } catch (error) {
    client.release();
    throw error;
  }
}

const heldClients = new Map();

export async function releaseSourceSyncLock(sourceId) {
  const held = heldClients.get(sourceId);
  if (!held) return;
  heldClients.delete(sourceId);
  try {
    await held.client.query(`SELECT pg_advisory_unlock($1, $2)`, [held.a, held.b]);
  } finally {
    held.client.release();
  }
}
