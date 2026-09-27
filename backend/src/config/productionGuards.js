/**
 * Production-safe environment validation helpers.
 * Never log secret values.
 */
const WEAK_JWT_PATTERNS = [
  /^change_me/i,
  /^local_dev/i,
  /^test/i,
  /^secret$/i,
  /^password/i,
  /^123456/,
];

export function assertProductionSafeEnv(env) {
  const errors = [];

  if (env.NODE_ENV !== 'production') {
    return { ok: true, errors: [], warnings: [] };
  }

  const warnings = [];

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters in production');
  }
  if (env.JWT_SECRET && WEAK_JWT_PATTERNS.some((re) => re.test(env.JWT_SECRET))) {
    errors.push('JWT_SECRET looks like a development placeholder — set a strong random secret');
  }

  if (!env.CORS_ORIGIN || env.CORS_ORIGIN === '*') {
    errors.push('CORS_ORIGIN must be an exact frontend origin in production (no wildcard)');
  } else if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(env.CORS_ORIGIN)) {
    errors.push('CORS_ORIGIN must not be localhost in production');
  } else if (!/^https:\/\//i.test(env.CORS_ORIGIN)) {
    warnings.push('CORS_ORIGIN should use https:// in production behind TLS');
  }

  if (env.INGESTION_ALLOW_LOCALHOST) {
    errors.push('INGESTION_ALLOW_LOCALHOST must be false/unset in production');
  }

  if (!env.DATABASE_URL && !env.DB_PASSWORD) {
    warnings.push('Prefer DATABASE_URL for production database configuration');
  }

  if (env.DATABASE_URL && /@(localhost|127\.0\.0\.1)/i.test(env.DATABASE_URL) && !process.env.ALLOW_LOCAL_DB_IN_PRODUCTION) {
    warnings.push(
      'DATABASE_URL points at localhost — set ALLOW_LOCAL_DB_IN_PRODUCTION=true only for single-box VPS'
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function safeEnvSummary(env) {
  return {
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    HOST: env.HOST || '0.0.0.0',
    API_PREFIX: env.API_PREFIX,
    CORS_ORIGIN: env.CORS_ORIGIN,
    TRUST_PROXY: process.env.TRUST_PROXY === 'true' || env.NODE_ENV === 'production',
    DB_SSL: Boolean(env.DB_SSL),
    hasDatabaseUrl: Boolean(env.DATABASE_URL),
    fxSyncOnStartup: env.FX_SYNC_ON_STARTUP !== false,
    officialSyncOnStartup: env.OFFICIAL_SYNC_ON_STARTUP !== false,
    cookieSecure: env.NODE_ENV === 'production',
  };
}
