/**
 * PM2 process file for a single-VPS Update Me deployment.
 * Run from the repository root after builds:
 *   pm2 start deploy/pm2/ecosystem.config.cjs --env production
 *
 * Only one API instance — in-process schedulers and SSE must not be duplicated.
 */
const path = require('path');

const root = path.resolve(__dirname, '../..');

module.exports = {
  apps: [
    {
      name: 'update-me-api',
      cwd: path.join(root, 'backend'),
      script: 'src/index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      kill_timeout: 16000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
      },
      // Prefer systemd/PM2 env files or `pm2 start --env-file` — do not commit secrets.
    },
    {
      name: 'update-me-web',
      cwd: path.join(root, 'frontend'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000 -H 127.0.0.1',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
