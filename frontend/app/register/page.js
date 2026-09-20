'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth/AuthShell';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Input';
import { ApiError } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({
    fullName: '',
    contact: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validateClient() {
    const next = {};
    if (!form.fullName.trim() || form.fullName.trim().length < 2) {
      next.fullName = 'Please enter your full name';
    }
    if (!form.contact.trim()) next.contact = 'Email or phone is required';
    if (form.password.length < 8) next.password = 'Password must be at least 8 characters';
    else if (!/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      next.password = 'Password must include a letter and a number';
    }
    if (form.password !== form.confirmPassword) {
      next.confirmPassword = 'Passwords do not match';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    if (!validateClient()) return;

    setSubmitting(true);
    try {
      const data = await register(form);
      router.replace(data.next || '/onboarding');
    } catch (err) {
      if (err instanceof ApiError && err.details?.length) {
        const mapped = {};
        err.details.forEach((item) => {
          const key = item.path?.[0];
          if (key) mapped[key] = item.message;
        });
        setFieldErrors(mapped);
      }
      setError(err.message || 'Unable to create your account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join free. Useful information for everyday life in Nigeria."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            Sign In
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <FormError message={error} />
        <Input
          id="fullName"
          label="Full Name"
          autoComplete="name"
          value={form.fullName}
          onChange={(e) => update('fullName', e.target.value)}
          error={fieldErrors.fullName}
          required
        />
        <Input
          id="contact"
          label="Email or Phone"
          autoComplete="username"
          inputMode="email"
          value={form.contact}
          onChange={(e) => update('contact', e.target.value)}
          error={fieldErrors.contact}
          hint="Use an email address or Nigerian phone number"
          required
        />
        <Input
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          error={fieldErrors.password}
          hint="At least 8 characters with a letter and a number"
          required
        />
        <Input
          id="confirmPassword"
          label="Confirm Password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(e) => update('confirmPassword', e.target.value)}
          error={fieldErrors.confirmPassword}
          required
        />
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Continue'}
        </Button>
      </form>
    </AuthShell>
  );
}
