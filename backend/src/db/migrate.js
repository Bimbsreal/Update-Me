import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool, closePool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(
    'SELECT filename FROM schema_migrations ORDER BY filename ASC'
  );
  return new Set(result.rows.map((row) => row.filename));
}

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries.filter((name) => name.endsWith('.sql')).sort();
}

async function applyMigration(client, filename) {
  const sql = await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
    console.log(`Applied: ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function showStatus() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = await listMigrationFiles();

    console.log('\nMigration status:');
    for (const file of files) {
      const mark = applied.has(file) ? '[x]' : '[ ]';
      console.log(`  ${mark} ${file}`);
    }
    console.log('');
  } finally {
    client.release();
  }
}

async function runMigrations() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = await listMigrationFiles();
    const pending = files.filter((file) => !applied.has(file));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    console.log(`Applying ${pending.length} migration(s)...`);
    for (const file of pending) {
      await applyMigration(client, file);
    }
    console.log('Migrations complete.');
  } finally {
    client.release();
  }
}

const args = process.argv.slice(2);

try {
  if (args.includes('--status')) {
    await showStatus();
  } else {
    await runMigrations();
  }
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
