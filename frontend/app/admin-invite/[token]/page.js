'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi, ApiError } from '@/lib/api';

export default function AdminInviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token;
  const [invite, setInvite] = useState(null);
  const [existing, setExisting] = useState(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    adminApi
      .verifyAdminInvite(token)
      .then((d) => {
        setInvite(d.invitation);
        setExisting(d.existingAccount);
        if (d.existingAccount?.displayName) setFullName(d.existingAccount.displayName);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Invalid invitation'));
  }, [token]);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await adminApi.acceptAdminInvite(token, {
        fullName: existing ? undefined : fullName,
        password,
      });
      router.replace(result.next || '/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not accept invitation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-800/70">
        Update Me
      </p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">Admin invitation</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Complete setup to receive only the permissions for your assigned role.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {invite ? (
        <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-xl border border-surface-border bg-white p-4 shadow-sm">
          <p className="text-sm">
            <span className="text-ink-muted">Email:</span> {invite.email}
          </p>
          <p className="text-sm">
            <span className="text-ink-muted">Role:</span>{' '}
            <strong>{invite.roleLabel || invite.role}</strong>
          </p>
          <p className="text-xs text-ink-muted">
            {invite.permissions?.length || 0} permissions · expires{' '}
            {invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : '—'}
          </p>

          {!existing ? (
            <label className="block text-xs font-medium text-ink-muted">
              Full name
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
              />
            </label>
          ) : (
            <p className="rounded-lg bg-surface-muted/60 px-3 py-2 text-xs text-ink-muted">
              An account already exists for this email. Enter your password to accept the staff role.
            </p>
          )}

          <label className="block text-xs font-medium text-ink-muted">
            {existing ? 'Account password' : 'Create password'}
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-surface-border px-3 py-2 text-sm"
              autoComplete={existing ? 'current-password' : 'new-password'}
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Working…' : existing ? 'Accept invitation' : 'Create admin account'}
          </button>
        </form>
      ) : !error ? (
        <p className="mt-6 text-sm text-ink-muted">Verifying invitation…</p>
      ) : null}
    </main>
  );
}
