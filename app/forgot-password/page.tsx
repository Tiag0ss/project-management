'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api/auth';
import { useToast } from '@/contexts/ToastContext';
import { getApiUrl } from '@/lib/api/config';
import AuthShell, {
  authFieldClass,
  authLabelClass,
  authLinkClass,
  authPrimaryButtonClass,
} from '@/components/AuthShell';

export default function ForgotPasswordPage() {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [companyName, setCompanyName] = useState('Project Management');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const result = await authApi.forgotPassword(email);
      const successMessage =
        result.message || 'If an account with that email exists, a reset link has been sent.';
      setMessage(successMessage);
      showToast({ type: 'success', title: 'Reset Link Sent', message: successMessage });
      setEmail('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to request password reset');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Recover Password"
      description="Enter your email and we will send a temporary reset link."
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

      {message && (
        <div className="mb-3 rounded border border-green-400 bg-green-100 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400">
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="email" className={authLabelClass}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={authFieldClass}
            placeholder="Enter your email"
          />
        </div>

        <button type="submit" disabled={isLoading} className={authPrimaryButtonClass}>
          {isLoading ? 'Sending…' : 'Send Reset Link'}
        </button>
      </form>
    </AuthShell>
  );
}
