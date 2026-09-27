import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { createRealtimeRouter, realtimeBroker } from './realtime/sse.js';
import {
  startFxSyncScheduler,
  stopFxSyncScheduler,
} from './services/fxSyncService.js';
import {
  startOfficialSyncScheduler,
  stopOfficialSyncScheduler,
} from './services/officialSyncService.js';
import {
  startDataQualityScheduler,
  stopDataQualityScheduler,
} from './services/dataQualityScheduler.js';
import { startMetricsFlusher, stopMetricsFlusher } from './services/metricsService.js';
import { closePool } from './db/pool.js';

const app = express();
const SHUTDOWN_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 15_000);

if (env.NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(securityHeaders);
app.use(requestContext);

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 600 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please slow down and try again.',
  },
});
app.use(env.API_PREFIX, globalLimiter);

app.get('/', (_req, res) => {
  res.json({
    success: true,
    name: 'Update Me API',
    version: 'v1',
    health: `${env.API_PREFIX}/health`,
    ready: `${env.API_PREFIX}/health/ready`,
    live: `${env.API_PREFIX}/health/live`,
  });
});

app.use(env.API_PREFIX, apiRouter);

createRealtimeRouter().register(app);

app.use(notFoundHandler);
app.use(errorHandler);

const listenHost = env.HOST || '0.0.0.0';
const server = app.listen(env.PORT, listenHost, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'api_listening',
      host: listenHost,
      port: env.PORT,
      env: env.NODE_ENV,
      health: `http://${listenHost === '0.0.0.0' ? '127.0.0.1' : listenHost}:${env.PORT}${env.API_PREFIX}/health`,
    })
  );
  try {
    startMetricsFlusher();
  } catch (error) {
    console.error('[metrics] failed to start flusher (non-fatal):', error?.message);
  }
  try {
    startFxSyncScheduler();
  } catch (error) {
    console.error('[fx-sync] failed to start scheduler (non-fatal):', error?.message);
  }
  try {
    startOfficialSyncScheduler();
  } catch (error) {
    console.error('[official-sync] failed to start scheduler (non-fatal):', error?.message);
  }
  try {
    startDataQualityScheduler();
  } catch (error) {
    console.error('[data-quality] failed to start scheduler (non-fatal):', error?.message);
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: 'info', msg: 'shutdown_start', signal }));

  const forceTimer = setTimeout(() => {
    console.error(JSON.stringify({ level: 'error', msg: 'shutdown_forced', afterMs: SHUTDOWN_MS }));
    process.exit(1);
  }, SHUTDOWN_MS);
  if (typeof forceTimer.unref === 'function') forceTimer.unref();

  try {
    stopMetricsFlusher();
    stopFxSyncScheduler();
    stopOfficialSyncScheduler();
    stopDataQualityScheduler();
  } catch (error) {
    console.error(JSON.stringify({ level: 'warn', msg: 'scheduler_stop_error', error: error?.message }));
  }

  try {
    realtimeBroker.stop();
  } catch (error) {
    console.error(JSON.stringify({ level: 'warn', msg: 'sse_stop_error', error: error?.message }));
  }

  await new Promise((resolve) => {
    server.close(() => resolve());
  });

  try {
    await closePool();
  } catch (error) {
    console.error(JSON.stringify({ level: 'warn', msg: 'pool_close_error', error: error?.message }));
  }

  clearTimeout(forceTimer);
  console.log(JSON.stringify({ level: 'info', msg: 'shutdown_complete', signal }));
  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown('SIGINT').catch(() => process.exit(1));
});
process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch(() => process.exit(1));
});
