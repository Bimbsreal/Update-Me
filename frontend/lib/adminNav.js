/**
 * Admin Operations Center navigation — grouped IA with permission gates.
 * Permission codes match backend/src/config/admin.js ADMIN_PERMISSIONS.
 */

export const ADMIN_NAV_SECTIONS = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        href: '/admin',
        label: 'Dashboard',
        match: 'exact',
        permission: 'dashboard',
        description: 'Operational overview',
      },
      {
        href: '/admin/system-health',
        label: 'System Health',
        permission: 'dashboard',
        description: 'API, database, jobs, ingestion',
      },
      {
        href: '/admin/analytics',
        label: 'Analytics',
        permission: 'analytics',
        description: 'Product, operations, and data-quality intelligence',
      },
    ],
  },
  {
    id: 'content',
    label: 'Content & Reports',
    items: [
      {
        href: '/admin/moderation',
        label: 'Moderation Center',
        permission: 'moderation',
        description: 'Queue, flags, and trust review',
      },
      {
        href: '/admin/reports',
        label: 'Reports',
        permission: 'reports',
        description: 'Browse community reports',
      },
      {
        href: '/admin/notifications',
        label: 'Notifications',
        permission: 'notifications',
        description: 'Alert rules, delivery metrics, emergency alerts',
      },
      {
        href: '/admin/search',
        label: 'Search',
        permission: 'search',
        description: 'Discovery analytics, aliases, index health',
      },
      {
        href: '/admin/alerts',
        label: 'Safety Alerts',
        permission: 'alerts',
        description: 'Local safety alerts',
      },
      {
        href: '/admin/community',
        label: 'Community',
        permission: 'community',
        description: 'Questions and answers',
      },
      {
        href: '/admin/official-updates',
        label: 'Official Updates',
        permission: 'official_updates',
        description: 'Published agency updates',
      },
      {
        href: '/admin/official-updates/queue',
        label: 'Official Review Queue',
        permission: 'official_updates',
        description: 'Pending review and ingestion issues',
      },
      {
        href: '/admin/fuel',
        label: 'Fuel',
        permission: 'fuel_stations',
        description: 'Stations, prices, and submissions',
      },
      {
        href: '/admin/traffic',
        label: 'Traffic',
        permission: 'traffic',
        description: 'Road incidents and traffic reports',
      },
      {
        href: '/admin/transport',
        label: 'Transport',
        permission: 'transport',
        description: 'Routes, stops, and fare observations',
      },
      {
        href: '/admin/commodities',
        label: 'Commodities',
        permission: 'commodities',
        description: 'Catalogue, markets, and price observations',
      },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    items: [
      {
        href: '/admin/locations',
        label: 'Locations',
        permission: 'locations',
        description: 'Nigeria geographic hierarchy',
      },
      {
        href: '/admin/data-quality',
        label: 'Data Quality',
        permission: 'data_quality',
        description: 'Stale, conflicts, incomplete',
      },
      {
        href: '/admin/official-sources',
        label: 'Government & Official Sources',
        permission: 'official_sources',
        description: 'Agency directory and integrations',
      },
      {
        href: '/admin/source-health',
        label: 'Source Health',
        permission: 'official_sources',
        description: 'Sync status and failures',
      },
      {
        href: '/admin/ingestion-runs',
        label: 'Ingestion Runs',
        permission: 'official_sources',
        description: 'Sync history',
      },
      {
        href: '/admin/fx',
        label: 'FX Rates',
        permission: 'fx',
      },
    ],
  },
  {
    id: 'users',
    label: 'Users & access',
    items: [
      {
        href: '/admin/users',
        label: 'Admin Users',
        permission: 'users',
        description: 'Staff accounts and status',
      },
      {
        href: '/admin/roles',
        label: 'Roles & Permissions',
        permission: 'users_roles',
        description: 'Role–permission matrix',
      },
      {
        href: '/admin/invitations',
        label: 'Invitations',
        permission: 'users_roles',
        description: 'Invite administrators',
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        href: '/admin/audit-log',
        label: 'Audit Logs',
        permission: 'audit_log',
        description: 'Admin action history',
      },
    ],
  },
];

export function hasAdminPermission(permissions, permission) {
  if (!permission) return true;
  if (!Array.isArray(permissions) || !permissions.length) return false;
  return permissions.includes(permission);
}

/** Filter nav sections to items the admin may access. */
export function filterAdminNav(permissions) {
  return ADMIN_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => hasAdminPermission(permissions, item.permission)),
  })).filter((section) => section.items.length > 0);
}

export function pageTitleForPath(pathname) {
  for (const section of ADMIN_NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.match === 'exact') {
        if (pathname === item.href) return { title: item.label, section: section.label };
      } else if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        return { title: item.label, section: section.label };
      }
    }
  }
  return { title: 'Operations', section: 'Admin' };
}

/**
 * Deep-link admin search hits by result group key.
 * Only returns href when the admin has the matching permission.
 */
export function searchResultHref(groupKey, row, permissions) {
  const map = {
    reports: { href: '/admin/reports', permission: 'reports' },
    locations: { href: (id) => `/admin/locations?focus=${encodeURIComponent(id)}`, permission: 'locations' },
    officialUpdates: { href: '/admin/official-updates', permission: 'official_updates' },
    users: { href: (id) => `/admin/users?focus=${encodeURIComponent(id)}`, permission: 'users' },
    questions: { href: '/admin/community', permission: 'community' },
    stations: { href: '/admin/fuel', permission: 'fuel_stations' },
    routes: { href: '/admin/transport', permission: 'transport' },
    traffic: { href: '/admin/traffic', permission: 'traffic' },
  };
  const entry = map[groupKey];
  if (!entry || !hasAdminPermission(permissions, entry.permission)) return null;
  if (typeof entry.href === 'function') return entry.href(row.id);
  return entry.href;
}

export const SEARCH_GROUP_LABELS = {
  reports: 'Reports',
  locations: 'Locations',
  officialUpdates: 'Official updates',
  users: 'Users',
  questions: 'Community',
  stations: 'Fuel stations',
  routes: 'Transport routes',
  traffic: 'Traffic reports',
};

export function roleDisplayLabel(role) {
  if (!role) return 'Staff';
  return String(role)
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
