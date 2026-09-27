/**
 * PWA + BrandLogo routing checks (Node, no browser).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('manifest exists and is valid JSON with required PWA fields', () => {
  const path = join(root, 'public', 'manifest.webmanifest');
  assert.ok(existsSync(path));
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(manifest.name, 'Update Me');
  assert.equal(manifest.short_name, 'Update Me');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#006D44');
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192'));
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
});

test('PWA icon files exist', () => {
  for (const file of [
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-192.png',
    'icon-maskable-512.png',
    'apple-touch-icon.png',
  ]) {
    assert.ok(existsSync(join(root, 'public', 'icons', file)), file);
  }
});

test('service worker never caches API, SSE, or precise location payloads', () => {
  const sw = readFileSync(join(root, 'public', 'sw.js'), 'utf8');
  assert.match(sw, /isApiRequest/);
  assert.match(sw, /isRealtime/);
  assert.match(sw, /\/realtime\//);
  assert.match(sw, /\/api\//);
  assert.doesNotMatch(sw, /cache\.addAll\(\[[^\]]*\/api\/v1/);
  assert.match(sw, /CACHE_VERSION/);
  assert.match(sw, /Never caches API/);
  assert.doesNotMatch(sw, /private_lat|privateLat|geolocation\.getCurrentPosition/);
});

test('geolocation helpers exist for PWA-safe precise location', () => {
  const geo = readFileSync(join(root, 'lib', 'geolocation.js'), 'utf8');
  assert.match(geo, /getCurrentPosition/);
  assert.match(geo, /watchPosition/);
  assert.match(geo, /clearWatch/);
  assert.match(geo, /isSecureContext/);
});

test('BrandLogo defaults to public landing route', () => {
  const src = readFileSync(join(root, 'components', 'brand', 'BrandLogo.jsx'), 'utf8');
  assert.match(src, /href = '\/'/);
  assert.match(src, /Update Me — Home/);
  assert.match(src, /<Link/);
});

test('authenticated shells use BrandLogo (not /home for brand mark)', () => {
  const appShell = readFileSync(join(root, 'components', 'app', 'AppShell.jsx'), 'utf8');
  assert.match(appShell, /BrandLogo/);
  assert.doesNotMatch(appShell, /href=\"\/home\" className=\"inline-flex min-w-0 items-center gap-2 font-bold/);
  assert.doesNotMatch(appShell, /href=\"\/home\" className=\"mb-4 inline-flex items-center gap-2\"/);

  const header = readFileSync(join(root, 'components', 'layout', 'SiteHeader.jsx'), 'utf8');
  assert.match(header, /BrandLogo/);

  const auth = readFileSync(join(root, 'components', 'auth', 'AuthShell.jsx'), 'utf8');
  assert.match(auth, /BrandLogo/);
});
