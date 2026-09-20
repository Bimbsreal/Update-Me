import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { createRealtimeRouter } from './realtime/sse.js';
import { startFxSyncScheduler } from './services/fxSyncService.js';
import { startOfficialSyncScheduler } from './services/officialSyncService.js';
import { startDataQualityScheduler } from './services/dataQualityScheduler.js';

const app = express();

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

const server = app.listen(env.PORT, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'api_listening',
      port: env.PORT,
      env: env.NODE_ENV,
      health: `http://localhost:${env.PORT}${env.API_PREFIX}/health`,
    })
  );
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

function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', msg: 'shutdown', signal }));
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
