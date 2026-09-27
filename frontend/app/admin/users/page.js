'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi, ApiError } from '@/lib/api';
import {
  ConfirmAction,
  EmptyState,
  FilterInput,
  FilterSelect,
  Pagination,
  StatusPill,
} from '@/components/admin/AdminUI';
import { AdminPageHeader, useAdmin } from '@/components/admin/AdminContext';

const STAFF_ROLES = [
  { value: '', label: 'Clear staff role' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'data_manager', label: 'Data Manager' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];

function accountTone(status) {
  if (status === 'suspended' || status === 'disabled') return status;
  return 'active';
}

export default function AdminUsersPage() {
  const searchParams = useSearchParams();
  const { can, role: actorRole, admin } = useAdmin();
  const canRoles = can('users_roles');
  const canSuspend = can('users_suspend');

  const [filters, setFilters] = useState({
    q: '',
    status: searchParams.get('status') || '',
    role: searchParams.get('role') || '',
    staffOnly: 'true',
    sort: 'created',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [selected, setSelected] = useState(null);
  const [roleDraft, setRoleDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminApi
      .users({
        q: filters.q || undefined,
        status: filters.status || undefined,
        role: filters.role || undefined,
        staffOnly: filters.staffOnly === 'true',
        sort: filters.sort,
        page,
        limit: 30,
      })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load users'));
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function openUser(id) {
    try {
      const d = await adminApi.user(id);
      setSelected(d.user);
      setRoleDraft(d.user?.adminRole || '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load user');
    }
  }

  useEffect(() => {
    const focus = searchParams.get('focus');
    if (focus) openUser(focus);
  }, [searchParams]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        breadcrumb="Users & access"
        title="Admin Users"
        subtitle="Staff accounts, roles, and status. Passwords and tokens are never shown."
        actions={
          canRoles ? (
            <Link
              href="/admin/invitations"
              className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
            >
              Invite admin
            </Link>
          ) : null
        }
      />

      <div className="rounded-xl border border-surface-border bg-white p-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-sm font-semibold md:hidden"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
        >
          Search & filters
          <span aria-hidden>{filtersOpen ? '−' : '+'}</span>
        </button>
        <div
          className={`mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 ${
            filtersOpen ? 'grid' : 'hidden md:grid'
          }`}
        >
          <FilterInput
            label="Search"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Name or email"
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="disabled">Disabled</option>
          </FilterSelect>
          <FilterSelect
            label="Role"
            value={filters.role}
            onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="">Any role</option>
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="moderator">Moderator</option>
            <option value="data_manager">Data Manager</option>
          </FilterSelect>
          <FilterSelect
            label="Scope"
            value={filters.staffOnly}
            onChange={(e) => setFilters((f) => ({ ...f, staffOnly: e.target.value }))}
          >
            <option value="true">Staff only</option>
            <option value="false">All users</option>
          </FilterSelect>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              load();
            }}
            className="self-end rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white"
          >
            Apply
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-2 lg:col-span-3">
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-surface-border bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-surface-border bg-surface-muted/50 text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Admin</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Last login</th>
                  <th className="px-3 py-2 font-semibold">Created</th>
                  <th className="px-3 py-2 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {!data.items?.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-ink-muted">
                      No accounts match these filters.
                    </td>
                  </tr>
                ) : (
                  data.items.map((u) => (
                    <tr
                      key={u.id}
                      className={`border-t border-surface-border ${
                        selected?.id === u.id ? 'bg-brand-50/40' : ''
                      }`}
                    >
                      <td className="px-3 py-2">
                        <p className="font-semibold text-ink">{u.displayName}</p>
                        <p className="text-xs text-ink-muted break-all">{u.email || '—'}</p>
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {u.adminRole ? String(u.adminRole).replace(/_/g, ' ') : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill status={accountTone(u.accountStatus)} />
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-muted">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-muted">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => openUser(u.id)}
                          className="rounded-lg border border-surface-border px-2 py-1 text-xs font-semibold"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {!data.items?.length ? (
              <EmptyState message="No accounts match these filters." />
            ) : (
              data.items.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => openUser(u.id)}
                    className="w-full rounded-xl border border-surface-border bg-white p-3 text-left shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{u.displayName}</p>
                        <p className="text-xs text-ink-muted break-all">{u.email}</p>
                        <p className="mt-1 text-xs capitalize text-ink-muted">
                          {u.adminRole ? String(u.adminRole).replace(/_/g, ' ') : 'No staff role'}
                        </p>
                      </div>
                      <StatusPill status={accountTone(u.accountStatus)} />
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>

          <Pagination
            page={page}
            total={data.total}
            limit={data.limit || 30}
            onPage={setPage}
          />
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            <div className="rounded-xl border border-surface-border bg-white p-4 shadow-sm lg:sticky lg:top-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold">{selected.displayName}</h2>
                  <p className="text-xs text-ink-muted break-all">{selected.email}</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-surface-border px-2 py-1 text-xs lg:hidden"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <StatusPill status={accountTone(selected.accountStatus)} />
                {selected.reportingDisabled ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-950">
                    Reporting restricted
                  </span>
                ) : null}
                {selected.adminRole ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize">
                    {String(selected.adminRole).replace(/_/g, ' ')}
                  </span>
                ) : null}
              </div>
              {selected.reportingDisabled && selected.reportingDisabledReason ? (
                <p className="mt-2 text-xs text-amber-900">
                  Reporting restriction: {selected.reportingDisabledReason}
                </p>
              ) : null}

              <dl className="mt-3 grid gap-2 text-sm">
                <div>
                  <dt className="text-xs text-ink-muted">Last login</dt>
                  <dd>
                    {selected.lastLoginAt
                      ? new Date(selected.lastLoginAt).toLocaleString()
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Last activity</dt>
                  <dd>
                    {selected.lastSeenAt
                      ? new Date(selected.lastSeenAt).toLocaleString()
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Created</dt>
                  <dd>
                    {selected.createdAt
                      ? new Date(selected.createdAt).toLocaleString()
                      : '—'}
                  </dd>
                </div>
              </dl>

              {selected.rolePermissions?.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase text-ink-muted">Role permits</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {selected.rolePermissions.length} permissions ·{' '}
                    <Link href={`/admin/roles?focus=${selected.adminRole}`} className="text-brand-700">
                      View matrix
                    </Link>
                  </p>
                </div>
              ) : null}

              {canSuspend ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-surface-border pt-3">
                  {selected.isSuspended || selected.accountStatus === 'disabled' ? (
                    <ConfirmAction
                      label="Restore account"
                      impact="The account can sign in again with its existing role."
                      disabled={busy}
                      onConfirm={async (reason) => {
                        setBusy(true);
                        try {
                          await adminApi.restoreUser(selected.id, { reason });
                          openUser(selected.id);
                          load();
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  ) : (
                    <>
                      <ConfirmAction
                        label="Suspend"
                        danger
                        impact="They cannot sign in until restored. Active sessions will be revoked."
                        disabled={busy || selected.id === admin?.userId}
                        onConfirm={async (reason) => {
                          setBusy(true);
                          try {
                            await adminApi.suspendUser(selected.id, { reason });
                            openUser(selected.id);
                            load();
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                      <ConfirmAction
                        label="Disable"
                        danger
                        impact="Disables the account and revokes sessions. Super Admins cannot be disabled this way."
                        disabled={
                          busy ||
                          selected.id === admin?.userId ||
                          selected.adminRole === 'super_admin'
                        }
                        onConfirm={async (reason) => {
                          setBusy(true);
                          try {
                            await adminApi.disableUser(selected.id, { reason });
                            openUser(selected.id);
                            load();
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                      {selected.reportingDisabled ? (
                        <ConfirmAction
                          label="Restore reporting"
                          impact="Allows this account to submit, confirm, and flag community reports again."
                          disabled={busy}
                          onConfirm={async (reason) => {
                            setBusy(true);
                            try {
                              await adminApi.enableReporting(selected.id, { reason });
                              openUser(selected.id);
                              load();
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      ) : (
                        <ConfirmAction
                          label="Restrict reporting"
                          danger
                          impact="Blocks create/confirm/flag for community reports. Sign-in and browsing stay allowed."
                          disabled={busy || selected.id === admin?.userId}
                          onConfirm={async (reason) => {
                            setBusy(true);
                            try {
                              await adminApi.disableReporting(selected.id, { reason });
                              openUser(selected.id);
                              load();
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      )}
                    </>
                  )}
                  <ConfirmAction
                    label="Revoke all sessions"
                    danger
                    impact="Signs this administrator out of every device. They must sign in again."
                    disabled={busy || selected.id === admin?.userId}
                    onConfirm={async (reason) => {
                      setBusy(true);
                      try {
                        await adminApi.revokeAllUserSessions(selected.id, { reason });
                        openUser(selected.id);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </div>
              ) : null}

              {canRoles ? (
                <div className="mt-4 border-t border-surface-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Assign staff role
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Actor: {actorRole?.replace(/_/g, ' ')}. You cannot change your own role.
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <select
                      value={roleDraft}
                      onChange={(e) => setRoleDraft(e.target.value)}
                      className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
                      aria-label="Staff role"
                      disabled={selected.id === admin?.userId}
                    >
                      {STAFF_ROLES.map((r) => (
                        <option key={r.value || 'none'} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <ConfirmAction
                      label="Save role"
                      impact={
                        roleDraft === 'super_admin'
                          ? 'Grants full Super Admin control, including role assignment.'
                          : roleDraft
                            ? `Assign ${roleDraft.replace(/_/g, ' ')} permissions.`
                            : 'Remove all staff permissions from this account.'
                      }
                      disabled={busy || selected.id === admin?.userId}
                      onConfirm={async (reason) => {
                        setBusy(true);
                        try {
                          await adminApi.setUserRole(selected.id, {
                            role: roleDraft || null,
                            reason,
                          });
                          openUser(selected.id);
                          load();
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {selected.sessions?.length ? (
                <div className="mt-4 border-t border-surface-border pt-3">
                  <p className="text-xs font-semibold uppercase text-ink-muted">Active sessions</p>
                  <ul className="mt-2 space-y-2">
                    {selected.sessions.map((s) => (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border px-2 py-1.5 text-xs"
                      >
                        <div>
                          <p className="font-medium text-ink">
                            {s.device}
                            {s.isCurrent ? ' · this browser' : ''}
                          </p>
                          <p className="text-ink-muted">
                            Seen {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : '—'}
                            {s.ipAddress ? ` · ${s.ipAddress}` : ''}
                          </p>
                        </div>
                        {canSuspend && !s.isCurrent ? (
                          <ConfirmAction
                            label="Revoke"
                            danger
                            impact="This device will be signed out immediately."
                            disabled={busy}
                            onConfirm={async (reason) => {
                              setBusy(true);
                              try {
                                await adminApi.revokeUserSession(selected.id, s.id, { reason });
                                openUser(selected.id);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selected.moderationHistory?.length ? (
                <div className="mt-4 border-t border-surface-border pt-3">
                  <p className="text-xs font-semibold uppercase text-ink-muted">Account history</p>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-ink-muted">
                    {selected.moderationHistory.map((h, i) => (
                      <li key={`${h.action}-${i}`}>
                        {h.action} · {h.reason || '—'} ·{' '}
                        {h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="hidden rounded-xl border border-dashed border-surface-border bg-white p-4 lg:block">
              <EmptyState message="Select an administrator to view details." />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
