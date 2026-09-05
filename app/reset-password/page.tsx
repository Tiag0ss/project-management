'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { useToast } from '@/contexts/ToastContext';
import { getApiUrl } from '@/lib/api/config';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
import AuthShell, {
  authLabelClass,
  authLinkClass,
  authPrimaryButtonClass,
} from '@/components/AuthShell';

export default function ResetPasswordPage() {
  const { showToast } = useToast();
  const [token, setToken] = useState('');
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [isCheckingToken, setIsCheckingToken] = useState(true);
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [companyName, setCompanyName] = useState('Project Management');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token') || '';
    setToken(tokenParam);
  }, []);

  useEffect(() => {
    const loadBranding = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/system-settings/public`);
        if (response.ok) {
          const data = await response.json();
          setCompanyName(data.companyName || 'Project Management');
          setCompanyLogoUrl(data.companyLogoUrl || '');
        }
      } catch {
        // Keep defaults.
      }
    };
    void loadBranding();
  }, []);

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setIsTokenValid(false);
        setIsCheckingToken(false);
        return;
      }

      try {
        setIsCheckingToken(true);
        const result = await authApi.validateResetToken(token);
        setIsTokenValid(!!result.valid);
        if (!result.valid) {
          setError('This reset link is invalid or expired.');
        }
      } catch (err: unknown) {
        setIsTokenValid(false);
        setError(err instanceof Error ? err.message : 'Failed to validate reset link.');
      } finally {
        setIsCheckingToken(false);
      }
    };

    validateToken();
  }, [token]);

  const syncSubmitState = () => {
    const newPassword = readPasswordInput(newPasswordRef);
    const confirmPassword = readPasswordInput(confirmPasswordRef);
    setCanSubmit(
      isTokenValid &&
        newPassword.length >= 8 &&
        confirmPassword.length > 0 &&
        newPassword === confirmPassword
    );
  };

  useEffect(() => {
    syncSubmitState();
  }, [isTokenValid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const newPassword = readPasswordInput(newPasswordRef);
    const confirmPassword = readPasswordInput(confirmPasswordRef);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setIsSaving(true);
      const result = await authApi.resetPassword(token, newPassword);
      const message = result.message || 'Password reset successfully. Redirecting to login...';
      showToast({ type: 'success', title: 'Password Reset', message });
      clearPasswordInput(newPasswordRef);
      clearPasswordInput(confirmPasswordRef);
      setCanSubmit(false);
      setTimeout(() => router.push('/login'), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthShell
      title="Reset Password"
      description="Set a new password for your account."
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      footer={
        <Link href="/login" className={authLinkClass}>
          Back to login
        </Link>
      }
    >
      {error && (
        <div className="mb-3 rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {isCheckingToken ? (
        <div className="text-center text-sm text-[var(--pm-muted)]">Validating reset link…</div>
      ) : !isTokenValid ? (
        <div className="text-center">
          <Link href="/forgot-password" className={`text-sm ${authLinkClass}`}>
            Request a new reset link
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="newPassword" className={authLabelClass}>
              New Password
            </label>
            <PasswordInput
              ref={newPasswordRef}
              id="newPassword"
              name="newPassword"
              onInput={syncSubmitState}
              required
              minLength={8}
              autoComplete="new-password"
              preventAutofill
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className={authLabelClass}>
              Confirm Password
            </label>
            <PasswordInput
              ref={confirmPasswordRef}
              id="confirmPassword"
              name="confirmPassword"
              onInput={syncSubmitState}
              required
              minLength={8}
              autoComplete="new-password"
              preventAutofill
              placeholder="Repeat new password"
            />
          </div>

          <button type="submit" disabled={isSaving || !canSubmit} className={authPrimaryButtonClass}>
            {isSaving ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
