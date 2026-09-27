import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertProductionSafeEnv, safeEnvSummary } from './productionGuards.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  // Never override process env (systemd/PM2/shell win). .env only fills gaps.
  override: false,
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  /** Bind address. Prefer 127.0.0.1 in production behind Nginx. */
  HOST: z.string().default('0.0.0.0'),
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('update_me'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),
  DB_SSL: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be set'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_NAME: z.string().default('um_session'),
  MAP_TILE_URL: z.string().optional(),
  MAP_STYLE_URL: z.string().optional(),
  MAP_API_KEY: z.string().optional(),

  // FX engine — provider credentials stay server-side
  FX_SYNC_ON_STARTUP: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  FX_SYNC_INTERVAL_MS: z.coerce.number().default(24 * 60 * 60 * 1000),
  FX_HISTORY_BACKFILL_DAYS: z.coerce.number().default(90),
  FX_PROVIDER_TIMEOUT_MS: z.coerce.number().default(12000),
  FX_OPEN_ER_API_ENABLED: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  FX_OPEN_ER_API_BASE_URL: z.string().default('https://open.er-api.com/v6'),
  FX_HISTORY_CDN_BASE_URL: z
    .string()
    .default('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api'),
  FX_FRANKFURTER_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  FX_FRANKFURTER_BASE_URL: z.string().default('https://api.frankfurter.app'),
  FX_CBN_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  FX_CBN_API_URL: z.string().optional(),
  FX_CBN_API_KEY: z.string().optional(),
  FX_ADMIN_TOKEN: z.string().optional(),

  // Official Updates Engine
  OFFICIAL_SYNC_ON_STARTUP: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  OFFICIAL_SYNC_TICK_MS: z.coerce.number().default(5 * 60 * 1000),
  OFFICIAL_PROVIDER_TIMEOUT_MS: z.coerce.number().default(12000),
  OFFICIAL_ADMIN_TOKEN: z.string().optional(),
  /** Allow localhost feed URLs for local mock-provider tests only. Never enable in production. */
  INGESTION_ALLOW_LOCALHOST: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  // Web Push (optional). When unset, push delivery is a no-op; in-app still works.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:ops@updateme.local'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'invalid_env',
      fields: parsed.error.flatten().fieldErrors,
    })
  );
  process.exit(1);
}

export const env = parsed.data;

const prodCheck = assertProductionSafeEnv(env);
for (const warning of prodCheck.warnings) {
  console.warn(JSON.stringify({ level: 'warn', msg: 'env_warning', warning }));
}
if (!prodCheck.ok) {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'production_env_rejected',
      errors: prodCheck.errors,
    })
  );
  process.exit(1);
}

if (env.NODE_ENV === 'production') {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'env_validated',
      ...safeEnvSummary(env),
    })
  );
}

export function getDatabaseConfig() {
  const sslEnabled = Boolean(env.DB_SSL);
  // Only disable certificate verification when explicitly opted in.
  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
  const ssl = sslEnabled
    ? { rejectUnauthorized }
    : false;

  if (env.DATABASE_URL) {
    return {
      connectionString: env.DATABASE_URL,
      ssl,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      max: Number(process.env.DB_POOL_MAX) || 20,
    };
  }

  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    ssl,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: Number(process.env.DB_POOL_MAX) || 20,
  };
}
