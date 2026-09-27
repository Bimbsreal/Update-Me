/**
 * Admin roles, permissions, and moderation action catalog.
 * Single source of truth — no parallel RBAC / DB permission matrix.
 */

export const ADMIN_ROLES = [
  {
    code: 'super_admin',
    label: 'Super Admin',
    description: 'Full administrative control, including staff role assignment.',
  },
  {
    code: 'admin',
    label: 'Admin',
    description: 'General operational management across content and data.',
  },
  {
    code: 'moderator',
    label: 'Moderator',
    description: 'Community and report moderation with limited operational access.',
  },
  {
    code: 'data_manager',
    label: 'Data Manager',
    description: 'Locations, reference data, sources, and data-quality operations.',
  },
];

/**
 * Permission codes used by requireAdmin({ permission }).
 * Only codes that gate real routes belong here.
 */
export const ADMIN_PERMISSIONS = {
  dashboard: 'dashboard',
  analytics: 'analytics',
  analytics_security: 'analytics_security',
  analytics_export: 'analytics_export',
  moderation: 'moderation',
  moderation_reporter_pii: 'moderation_reporter_pii',
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
  traffic: 'traffic',
  transport: 'transport',
  commodities: 'commodities',
  notifications: 'notifications',
  audit_log: 'audit_log',
  data_quality: 'data_quality',
  search: 'search',
};

/** Human labels + module grouping for Admin UI (not a second permission system). */
export const PERMISSION_CATALOG = [
  {
    group: 'Dashboard',
    permissions: [
      { code: ADMIN_PERMISSIONS.dashboard, label: 'View dashboard & system health' },
      { code: ADMIN_PERMISSIONS.analytics, label: 'View analytics & operational intelligence' },
      {
        code: ADMIN_PERMISSIONS.analytics_security,
        label: 'View security monitoring aggregates',
      },
      { code: ADMIN_PERMISSIONS.analytics_export, label: 'Export aggregate analytics reports' },
    ],
  },
  {
    group: 'Users & access',
    permissions: [
      { code: ADMIN_PERMISSIONS.users, label: 'View users & staff' },
      { code: ADMIN_PERMISSIONS.users_suspend, label: 'Suspend / restore accounts & revoke sessions' },
      { code: ADMIN_PERMISSIONS.users_roles, label: 'Assign roles & manage invitations' },
    ],
  },
  {
    group: 'Content & moderation',
    permissions: [
      { code: ADMIN_PERMISSIONS.moderation, label: 'Moderation Center' },
      {
        code: ADMIN_PERMISSIONS.moderation_reporter_pii,
        label: 'View private reporter contact (email)',
      },
      { code: ADMIN_PERMISSIONS.reports, label: 'View reports' },
      { code: ADMIN_PERMISSIONS.alerts, label: 'Safety alerts' },
      { code: ADMIN_PERMISSIONS.community, label: 'Community Q&A' },
      { code: ADMIN_PERMISSIONS.traffic, label: 'Traffic operations' },
    ],
  },
  {
    group: 'Locations & reference data',
    permissions: [
      { code: ADMIN_PERMISSIONS.locations, label: 'View locations' },
      { code: ADMIN_PERMISSIONS.locations_edit, label: 'Edit locations' },
      { code: ADMIN_PERMISSIONS.fuel_stations, label: 'Fuel stations' },
      { code: ADMIN_PERMISSIONS.transport, label: 'Transport routes & fares' },
      { code: ADMIN_PERMISSIONS.commodities, label: 'Commodity prices' },
    ],
  },
  {
    group: 'Sources & sync',
    permissions: [
      { code: ADMIN_PERMISSIONS.official_sources, label: 'Official sources' },
      { code: ADMIN_PERMISSIONS.official_updates, label: 'Official updates' },
      { code: ADMIN_PERMISSIONS.official_sync, label: 'Run official sync' },
      { code: ADMIN_PERMISSIONS.fx, label: 'FX rates' },
      { code: ADMIN_PERMISSIONS.fx_sync, label: 'Run FX sync' },
    ],
  },
  {
    group: 'Operations',
    permissions: [
      { code: ADMIN_PERMISSIONS.notifications, label: 'Notifications & alerts' },
      { code: ADMIN_PERMISSIONS.data_quality, label: 'Data quality' },
      { code: ADMIN_PERMISSIONS.audit_log, label: 'Audit & admin activity' },
      { code: ADMIN_PERMISSIONS.search, label: 'Admin search' },
    ],
  },
];

const ALL = Object.values(ADMIN_PERMISSIONS);

const ROLE_PERMISSIONS = {
  super_admin: ALL,
  admin: ALL.filter((p) => p !== ADMIN_PERMISSIONS.users_roles),
  moderator: [
    ADMIN_PERMISSIONS.dashboard,
    ADMIN_PERMISSIONS.analytics,
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
    ADMIN_PERMISSIONS.analytics,
    ADMIN_PERMISSIONS.analytics_export,
    ADMIN_PERMISSIONS.locations,
    ADMIN_PERMISSIONS.locations_edit,
    ADMIN_PERMISSIONS.fuel_stations,
    ADMIN_PERMISSIONS.traffic,
    ADMIN_PERMISSIONS.transport,
    ADMIN_PERMISSIONS.commodities,
    ADMIN_PERMISSIONS.official_sources,
    ADMIN_PERMISSIONS.official_updates,
    ADMIN_PERMISSIONS.official_sync,
    ADMIN_PERMISSIONS.fx,
    ADMIN_PERMISSIONS.fx_sync,
    ADMIN_PERMISSIONS.notifications,
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

/** Full catalog for Admin Roles UI — still code-defined, not editable at runtime. */
export function getRolePermissionCatalog() {
  return {
    roles: ADMIN_ROLES.map((r) => ({
      ...r,
      permissions: permissionsForRole(r.code),
      permissionCount: permissionsForRole(r.code).length,
    })),
    permissionGroups: PERMISSION_CATALOG,
    editable: false,
    note: 'Role permissions are defined in application configuration for security. Assign roles to staff; do not edit the matrix at runtime.',
  };
}

export const MODERATION_ACTIONS = [
  { code: 'approve', label: 'Approve / restore to public', nextStatus: 'active', moderationState: 'cleared' },
  { code: 'confirm', label: 'Confirm', nextStatus: 'confirmed', moderationState: 'cleared' },
  { code: 'mark_inaccurate', label: 'Mark inaccurate', nextStatus: 'removed', moderationState: 'actioned' },
  { code: 'mark_duplicate', label: 'Mark duplicate', nextStatus: 'removed', moderationState: 'actioned' },
  { code: 'under_review', label: 'Flag for further review', nextStatus: 'under_review', moderationState: 'in_review' },
  { code: 'escalate', label: 'Escalate for higher review', nextStatus: null, moderationState: 'escalated' },
  { code: 'remove', label: 'Remove from public display', nextStatus: 'removed', moderationState: 'actioned' },
  { code: 'restore', label: 'Restore', nextStatus: 'active', moderationState: 'cleared' },
  { code: 'expire', label: 'Expire', nextStatus: 'expired', moderationState: 'actioned' },
  { code: 'mark_stale', label: 'Mark stale', nextStatus: 'stale', moderationState: 'cleared' },
  { code: 'dismiss_flag', label: 'Dismiss flag', nextStatus: null, moderationState: 'cleared' },
  { code: 'set_priority', label: 'Mark priority for review', nextStatus: null, moderationState: null },
  { code: 'clear_priority', label: 'Clear priority', nextStatus: null, moderationState: null },
  { code: 'link_event', label: 'Link as duplicate event group', nextStatus: null, moderationState: null },
  { code: 'link_official', label: 'Associate related official update', nextStatus: null, moderationState: null },
];

export const MODERATION_REASONS = [
  { code: 'spam', label: 'Spam' },
  { code: 'incorrect_information', label: 'Incorrect / false information' },
  { code: 'duplicate', label: 'Duplicate' },
  { code: 'offensive', label: 'Offensive content' },
  { code: 'wrong_location', label: 'Wrong location' },
  { code: 'misleading', label: 'Misleading information' },
  { code: 'outdated', label: 'Outdated information' },
  { code: 'insufficient_information', label: 'Insufficient information' },
  { code: 'outside_scope', label: 'Outside Update Me scope' },
  { code: 'safety_concern', label: 'Safety concern' },
  { code: 'promotional_spam', label: 'Promotional spam' },
  { code: 'invalid_location', label: 'Invalid location' },
  { code: 'policy_violation', label: 'Policy violation' },
  { code: 'other', label: 'Other' },
];

export const ACTIONS_BY_CONTENT_TYPE = {
  report: [
    'approve',
    'confirm',
    'under_review',
    'escalate',
    'mark_inaccurate',
    'mark_duplicate',
    'remove',
    'restore',
    'expire',
    'mark_stale',
    'dismiss_flag',
    'set_priority',
    'clear_priority',
    'link_event',
    'link_official',
  ],
  alert: [
    'approve',
    'confirm',
    'under_review',
    'escalate',
    'mark_inaccurate',
    'mark_duplicate',
    'remove',
    'restore',
    'expire',
    'mark_stale',
    'dismiss_flag',
    'set_priority',
    'clear_priority',
    'link_event',
    'link_official',
  ],
  question: [
    'approve',
    'confirm',
    'under_review',
    'escalate',
    'mark_inaccurate',
    'mark_duplicate',
    'remove',
    'restore',
    'dismiss_flag',
  ],
  answer: [
    'approve',
    'confirm',
    'under_review',
    'escalate',
    'mark_inaccurate',
    'mark_duplicate',
    'remove',
    'restore',
    'dismiss_flag',
  ],
};

export function allowedActionsForContentType(contentType) {
  return ACTIONS_BY_CONTENT_TYPE[contentType] || [];
}

export function isActionAllowedForContentType(contentType, action) {
  return allowedActionsForContentType(contentType).includes(action);
}

export function moderationReasonLabel(code) {
  return MODERATION_REASONS.find((r) => r.code === code)?.label || null;
}
