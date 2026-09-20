/** Admin roles and granular permissions — keep simple, not enterprise IAM. */

export const ADMIN_ROLES = [
  { code: 'super_admin', label: 'Super Admin' },
  { code: 'admin', label: 'Admin' },
  { code: 'moderator', label: 'Moderator' },
  { code: 'data_manager', label: 'Data Manager' },
];

/**
 * Permission codes used by requireAdmin({ permission }).
 */
export const ADMIN_PERMISSIONS = {
  dashboard: 'dashboard',
  moderation: 'moderation',
  reports: 'reports',
  alerts: 'alerts',
  community: 'community',
  users: 'users',
  users_suspend: 'users_suspend',
  users_roles: 'users_roles',
  official_sources: 'official_sources',
  official_updates: 'official_updates',
  official_sync: 'official_sync',
  fx: 'fx',
  fx_sync: 'fx_sync',
  locations: 'locations',
  locations_edit: 'locations_edit',
  fuel_stations: 'fuel_stations',
  transport: 'transport',
  commodities: 'commodities',
  audit_log: 'audit_log',
  data_quality: 'data_quality',
  search: 'search',
};

const ALL = Object.values(ADMIN_PERMISSIONS);

const ROLE_PERMISSIONS = {
  super_admin: ALL,
  admin: ALL.filter((p) => p !== ADMIN_PERMISSIONS.users_roles),
  moderator: [
    ADMIN_PERMISSIONS.dashboard,
    ADMIN_PERMISSIONS.moderation,
    ADMIN_PERMISSIONS.reports,
    ADMIN_PERMISSIONS.alerts,
    ADMIN_PERMISSIONS.community,
    ADMIN_PERMISSIONS.official_updates,
    ADMIN_PERMISSIONS.audit_log,
    ADMIN_PERMISSIONS.data_quality,
    ADMIN_PERMISSIONS.search,
  ],
  data_manager: [
    ADMIN_PERMISSIONS.dashboard,
    ADMIN_PERMISSIONS.locations,
    ADMIN_PERMISSIONS.locations_edit,
    ADMIN_PERMISSIONS.fuel_stations,
    ADMIN_PERMISSIONS.transport,
    ADMIN_PERMISSIONS.commodities,
    ADMIN_PERMISSIONS.official_sources,
    ADMIN_PERMISSIONS.official_updates,
    ADMIN_PERMISSIONS.official_sync,
    ADMIN_PERMISSIONS.fx,
    ADMIN_PERMISSIONS.fx_sync,
    ADMIN_PERMISSIONS.data_quality,
    ADMIN_PERMISSIONS.search,
    ADMIN_PERMISSIONS.audit_log,
  ],
};

export function permissionsForRole(role) {
  if (!role) return [];
  return ROLE_PERMISSIONS[role] || [];
}

export function roleHasPermission(role, permission) {
  if (!role || !permission) return false;
  return permissionsForRole(role).includes(permission);
}

export function isStaffRole(role) {
  return Boolean(role && ROLE_PERMISSIONS[role]);
}

export const MODERATION_ACTIONS = [
  { code: 'approve', label: 'Approve / restore to public', nextStatus: 'active', moderationState: 'cleared' },
  { code: 'confirm', label: 'Confirm', nextStatus: 'confirmed', moderationState: 'cleared' },
  { code: 'mark_inaccurate', label: 'Mark inaccurate', nextStatus: 'removed', moderationState: 'actioned' },
  { code: 'mark_duplicate', label: 'Mark duplicate', nextStatus: 'removed', moderationState: 'actioned' },
  { code: 'under_review', label: 'Flag for further review', nextStatus: 'under_review', moderationState: 'in_review' },
  { code: 'remove', label: 'Remove from public display', nextStatus: 'removed', moderationState: 'actioned' },
  { code: 'restore', label: 'Restore', nextStatus: 'active', moderationState: 'cleared' },
  { code: 'expire', label: 'Expire', nextStatus: 'expired', moderationState: 'actioned' },
  { code: 'mark_stale', label: 'Mark stale', nextStatus: 'stale', moderationState: 'cleared' },
  { code: 'dismiss_flag', label: 'Dismiss flag', nextStatus: null, moderationState: 'cleared' },
];
