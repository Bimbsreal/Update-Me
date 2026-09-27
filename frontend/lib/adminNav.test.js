/**
 * Admin navigation permission filtering tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterAdminNav,
  hasAdminPermission,
  searchResultHref,
  pageTitleForPath,
} from './adminNav.js';

test('moderator nav excludes users and data sources', () => {
  const perms = [
    'dashboard',
    'moderation',
    'reports',
    'alerts',
    'community',
    'official_updates',
    'audit_log',
    'data_quality',
    'search',
  ];
  const sections = filterAdminNav(perms);
  const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  assert.ok(hrefs.includes('/admin'));
  assert.ok(hrefs.includes('/admin/moderation'));
  assert.equal(hrefs.includes('/admin/users'), false);
  assert.equal(hrefs.includes('/admin/official-sources'), false);
  assert.equal(hrefs.includes('/admin/locations'), false);
});

test('data manager nav includes locations, traffic, transport, commodities', () => {
  const perms = [
    'dashboard',
    'locations',
    'locations_edit',
    'fuel_stations',
    'traffic',
    'transport',
    'commodities',
    'official_sources',
    'official_updates',
    'official_sync',
    'fx',
    'fx_sync',
    'data_quality',
    'search',
    'audit_log',
  ];
  const sections = filterAdminNav(perms);
  const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  assert.ok(hrefs.includes('/admin/locations'));
  assert.ok(hrefs.includes('/admin/traffic'));
  assert.ok(hrefs.includes('/admin/transport'));
  assert.ok(hrefs.includes('/admin/commodities'));
  assert.ok(hrefs.includes('/admin/official-sources'));
  assert.equal(hrefs.includes('/admin/moderation'), false);
  assert.equal(hrefs.includes('/admin/users'), false);
});

test('search deep links respect permissions', () => {
  assert.equal(searchResultHref('users', { id: 'u1' }, ['search']), null);
  assert.match(searchResultHref('users', { id: 'u1' }, ['users']), /\/admin\/users\?focus=u1/);
  assert.equal(searchResultHref('reports', { id: 'r1' }, ['reports']), '/admin/reports');
});

test('page titles resolve', () => {
  assert.equal(pageTitleForPath('/admin').title, 'Dashboard');
  assert.equal(pageTitleForPath('/admin/system-health').section, 'Overview');
  assert.equal(pageTitleForPath('/admin/moderation').title, 'Moderation Center');
  assert.equal(pageTitleForPath('/admin/users').title, 'Admin Users');
  assert.equal(pageTitleForPath('/admin/roles').title, 'Roles & Permissions');
  assert.ok(hasAdminPermission(['dashboard'], 'dashboard'));
  assert.equal(hasAdminPermission([], 'dashboard'), false);
});
