/**
 * Production deployment guards unit tests (no server required for most cases).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProductionSafeEnv, safeEnvSummary } from '../src/config/productionGuards.js';

test('development env passes production guards', () => {
  const result = assertProductionSafeEnv({
    NODE_ENV: 'development',
    JWT_SECRET: 'local_dev_jwt_secret_change_before_any_real_use_32chars',
    CORS_ORIGIN: 'http://localhost:3000',
  });
  assert.equal(result.ok, true);
});

test('production rejects weak JWT and localhost CORS', () => {
  const result = assertProductionSafeEnv({
    NODE_ENV: 'production',
    JWT_SECRET: 'change_me_to_a_long_random_secret_ok',
    CORS_ORIGIN: 'http://localhost:3000',
    INGESTION_ALLOW_LOCALHOST: false,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /JWT_SECRET/.test(e)));
  assert.ok(result.errors.some((e) => /CORS_ORIGIN/.test(e)));
});

test('production rejects wildcard CORS and localhost ingestion', () => {
  const result = assertProductionSafeEnv({
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(40),
    CORS_ORIGIN: '*',
    INGESTION_ALLOW_LOCALHOST: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /wildcard|CORS_ORIGIN/.test(e)));
  assert.ok(result.errors.some((e) => /INGESTION_ALLOW_LOCALHOST/.test(e)));
});

test('production accepts https origin and strong secret', () => {
  const result = assertProductionSafeEnv({
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(40),
    CORS_ORIGIN: 'https://example.com',
    INGESTION_ALLOW_LOCALHOST: false,
    DATABASE_URL: 'postgresql://u:p@db.internal:5432/update_me',
  });
  assert.equal(result.ok, true);
});

test('safeEnvSummary never includes secrets', () => {
  const summary = safeEnvSummary({
    NODE_ENV: 'production',
    PORT: 5000,
    HOST: '127.0.0.1',
    API_PREFIX: '/api/v1',
    CORS_ORIGIN: 'https://example.com',
    DB_SSL: true,
    DATABASE_URL: 'postgresql://user:SUPERSECRET@db/update_me',
    FX_SYNC_ON_STARTUP: true,
    OFFICIAL_SYNC_ON_STARTUP: false,
    JWT_SECRET: 'should-not-appear',
  });
  const blob = JSON.stringify(summary);
  assert.doesNotMatch(blob, /SUPERSECRET|should-not-appear|JWT/);
  assert.equal(summary.hasDatabaseUrl, true);
  assert.equal(summary.cookieSecure, true);
});
