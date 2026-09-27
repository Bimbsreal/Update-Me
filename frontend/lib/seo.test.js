/**
 * SEO / public-page boundary checks (Node, no browser).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  absoluteUrl,
  buildPublicMetadata,
  freshnessAwareLead,
  sanitizeMetaText,
  siteOrigin,
} from '../lib/seo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('seo helpers sanitize and build canonical metadata', () => {
  assert.equal(siteOrigin().includes('localhost') || siteOrigin().startsWith('http'), true);
  assert.equal(absoluteUrl('/traffic/abc'), `${siteOrigin()}/traffic/abc`);
  assert.equal(sanitizeMetaText('<b>Hello</b>  world\n', 20), 'Hello world');
  assert.match(freshnessAwareLead('stale', 'Traffic'), /outdated/i);
  assert.match(freshnessAwareLead('expired', 'Alert'), /expired/i);
  assert.doesNotMatch(freshnessAwareLead('stale', 'Traffic'), /live/i);

  const meta = buildPublicMetadata({
    title: 'Road closed — Lekki',
    description: 'Aging traffic report near Lekki.',
    path: '/traffic/123',
    type: 'article',
  });
  assert.equal(meta.alternates.canonical, `${siteOrigin()}/traffic/123`);
  assert.equal(meta.openGraph.url, meta.alternates.canonical);
  assert.equal(meta.robots.index, true);
  assert.ok(meta.twitter.title);
});

test('robots and sitemap modules exist', () => {
  assert.ok(existsSync(join(root, 'app', 'robots.js')));
  assert.ok(existsSync(join(root, 'app', 'sitemap.js')));
  const robots = readFileSync(join(root, 'app', 'robots.js'), 'utf8');
  assert.match(robots, /disallow/i);
  assert.match(robots, /\/admin/);
  assert.match(robots, /\/notifications/);
  assert.match(robots, /sitemap\.xml/);
  const sitemap = readFileSync(join(root, 'app', 'sitemap.js'), 'utf8');
  assert.doesNotMatch(sitemap, /entry\(`\/admin/);
  assert.doesNotMatch(sitemap, /entry\(`\/notifications/);
  assert.doesNotMatch(sitemap, /STATIC_PATHS[\s\S]*'\/admin'/);
  assert.match(sitemap, /official-updates/);
});

test('middleware protects private routes only', () => {
  const mw = readFileSync(join(root, 'middleware.js'), 'utf8');
  assert.match(mw, /\/home/);
  assert.match(mw, /\/notifications/);
  assert.match(mw, /\/profile/);
  assert.match(mw, /\/admin/);
  assert.doesNotMatch(mw, /'\/traffic'/);
  assert.doesNotMatch(mw, /'\/explore'/);
  assert.doesNotMatch(mw, /'\/fuel'/);
});

test('soft-auth app layout keeps private prefixes gated', () => {
  const layout = readFileSync(join(root, 'app', '(app)', 'layout.js'), 'utf8');
  assert.match(layout, /PRIVATE_PREFIXES/);
  assert.match(layout, /\/home/);
  assert.match(layout, /\/notifications/);
  assert.match(layout, /\/profile/);
});

test('BrandLogo still defaults to public landing', () => {
  const src = readFileSync(join(root, 'components', 'brand', 'BrandLogo.jsx'), 'utf8');
  assert.match(src, /href = '\/'/);
  assert.match(src, /Always navigates to the public landing page/);
});

test('share controls include copy and native share fallback', () => {
  const src = readFileSync(join(root, 'components', 'share', 'ShareControls.jsx'), 'utf8');
  assert.match(src, /navigator\.share/);
  assert.match(src, /clipboard/);
  assert.match(src, /Copy link/);
});

test('public location hub route exists', () => {
  assert.ok(existsSync(join(root, 'app', 'locations', '[...slug]', 'page.js')));
  assert.ok(existsSync(join(root, 'app', 'locations', '[...slug]', 'LocationHubClient.jsx')));
});

test('detail pages expose generateMetadata', () => {
  const traffic = readFileSync(join(root, 'app', '(app)', 'traffic', '[id]', 'page.js'), 'utf8');
  assert.match(traffic, /generateMetadata/);
  const official = readFileSync(join(root, 'app', 'official-updates', '[id]', 'page.js'), 'utf8');
  assert.match(official, /generateMetadata/);
  assert.match(official, /newsArticleJsonLd|JsonLd/);
});
