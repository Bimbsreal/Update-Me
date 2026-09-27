/**
 * Pre-deploy sanity checks — does not mutate data.
 * Usage: node deploy/scripts/pre-deploy-check.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const required = [
  'backend/package.json',
  'frontend/package.json',
  'backend/src/index.js',
  'deploy/nginx/update-me.conf',
  'deploy/systemd/update-me-api.service',
  'deploy/pm2/ecosystem.config.cjs',
  'docs/DEPLOYMENT.md',
  'backend/.env.example',
  'frontend/.env.example',
];

let failed = 0;
for (const rel of required) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.error(`MISSING ${rel}`);
    failed += 1;
  } else {
    console.log(`OK ${rel}`);
  }
}

const nginx = fs.readFileSync(path.join(root, 'deploy/nginx/update-me.conf'), 'utf8');
for (const needle of ['proxy_buffering off', '/api/v1/realtime/', '127.0.0.1:5000', '127.0.0.1:3000']) {
  if (!nginx.includes(needle)) {
    console.error(`NGINX_MISSING ${needle}`);
    failed += 1;
  } else {
    console.log(`OK nginx:${needle}`);
  }
}

const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
if (!gitignore.includes('.env') && !gitignore.includes('*.env')) {
  console.error('WARN .gitignore may not ignore env files — verify manually');
}

console.log(JSON.stringify({ ok: failed === 0, failed }));
process.exit(failed === 0 ? 0 : 1);
