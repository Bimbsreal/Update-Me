'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, ApiError } from '@/lib/api';
import {
  ConfirmAction,
  EmptyState,
  FilterSelect,
  Pagination,
  StatusPill,
} from '@/components/admin/AdminUI';
import { AdminPageHeader } from '@/components/admin/AdminContext';

export default function AdminInvitationsPage() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, limit: 30 });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('moderator');
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminApi
      .invitations({ status: status || undefined, page, limit: 30 })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load invitations'));
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function createInvite(reason) {
    setBusy(true);
    setError('');
    setCreated(null);
    try {
      const result = await adminApi.createInvitation({ email, role, reason });
      setCreated(result);
      setEmail('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invitation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        breadcrumb="Users & access"
        title="Admin invitations"
        subtitle="Invite staff by email. Tokens expire, are single-use, and never include passwords."
      />

      <section className="rounded-xl border border-surface-border bg-white p-4">
        <h2 className="text-sm font-bold">Invite administrator</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs font-medium text-ink-muted">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
              placeholder="colleague@example.com"
            />
          </label>
          <FilterSelect label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="moderator">Moderator</option>
            <option value="data_manager">Data Manager</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </FilterSelect>
          <div className="self-end">
            <ConfirmAction
              label="Send invitation"
              impact={
                role === 'super_admin'
                  ? 'This grants full Super Admin control after acceptance.'
                  : `Invite will grant the ${role.replace(/_/g, ' ')} role for 72 hours.`
              }
              disabled={busy || !email.includes('@')}
              onConfirm={createInvite}
            />
          </div>
        </div>

        {created?.invitePath ? (
          <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/50 p-3 text-sm">
            <p className="font-semibold text-ink">Invitation created — share this link securely once</p>
            <p className="mt-1 break-all text-xs text-ink-muted">
              {typeof window !== 'undefined'
                ? `${window.location.origin}${created.invitePath}`
                : created.invitePath}
            </p>
            <p className="mt-2 text-xs text-ink-muted">
              Expires {created.invitation?.expiresAt
                ? new Date(created.invitation.expiresAt).toLocaleString()
                : `in ${created.expiresInHours}h`}
              . The raw token is not stored and cannot be retrieved again.
            </p>
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <FilterSelect
          label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="revoked">Revoked</option>
          <option value="expired">Expired</option>
        </FilterSelect>
      </div>

      {!data.items?.length ? (
        <EmptyState message="No invitations in this view." />
      ) : (
        <ul className="space-y-2">
          {data.items.map((inv) => (
            <li
              key={inv.id}
              className="rounded-xl border border-surface-border bg-white p-3 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold break-all">{inv.email}</p>
                <p className="text-xs capitalize text-ink-muted">
                  {String(inv.role).replace(/_/g, ' ')} · invited{' '}
                  {inv.createdAt ? new Date(inv.createdAt).toLocaleString() : ''}
                  {inv.invitedBy?.displayName ? ` by ${inv.invitedBy.displayName}` : ''}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  Expires {inv.expiresAt ? new Date(inv.expiresAt).toLocaleString() : '—'}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0">
                <StatusPill status={inv.status} />
                {inv.status === 'pending' ? (
                  <>
                    <ConfirmAction
                      label="Resend"
                      impact="Creates a new token and revokes the previous pending invite."
                      disabled={busy}
                      onConfirm={async (reason) => {
                        setBusy(true);
                        try {
                          const result = await adminApi.resendInvitation(inv.id, { reason });
                          setCreated(result);
                          load();
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                    <ConfirmAction
                      label="Revoke"
                      danger
                      impact="The invitation link will stop working immediately."
                      disabled={busy}
                      onConfirm={async (reason) => {
                        setBusy(true);
                        try {
                          await adminApi.revokeInvitation(inv.id, { reason });
                          load();
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} total={data.total} limit={data.limit || 30} onPage={setPage} />
    </div>
  );
}
