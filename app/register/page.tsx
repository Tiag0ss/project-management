'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { prepareAuthEncryptionSession } from '@/lib/api/auth';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
import AuthShell, {
  authFieldClass,
  authLabelClass,
  authLinkClass,
  authPrimaryButtonClass,
} from '@/components/AuthShell';

export default function RegisterPage() {
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSettings, setIsCheckingSettings] = useState(true);
  const [companyName, setCompanyName] = useState('Project Management');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const { register } = useAuth();
  const router = useRouter();

  useEffect(() => {
    checkRegistrationSettings();
    prepareAuthEncryptionSession().catch(() => {
      // Encryption session is best-effort before submit.
    });
  }, []);

  const checkRegistrationSettings = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/system-settings/public`);

      if (response.ok) {
        const data = await response.json();
        if (data.allowPublicRegistration !== true) {
          router.replace('/login');
          return;
        }
        setCompanyName(data.companyName || 'Project Management');
        setCompanyLogoUrl(data.companyLogoUrl || '');
      }
    } catch {
      // Fall through to show form if settings probe fails.
    } finally {
      setIsCheckingSettings(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const password = readPasswordInput(passwordRef);
    const confirmPassword = readPasswordInput(confirmPasswordRef);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    try {
      await register({
        username: formData.username,
        email: formData.email,
        password,
        firstName: formData.firstName || undefined,
        lastName: formData.lastName || undefined,
      });
      clearPasswordInput(passwordRef);
      clearPasswordInput(confirmPasswordRef);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingSettings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--pm-bg)]">
        <div className="text-sm text-[var(--pm-muted)]">Loading…</div>
      </div>
    );
  }

  return (
    <AuthShell
      title="Create Account"
      description="Register to start using the workspace."
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      footer={
        <p>
          Already have an account?{' '}
          <Link href="/login" className={`${authLinkClass} font-medium`}>
            Login here
          </Link>
        </p>
      }
    >
      {error && (
        <div className="mb-3 rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="username" className={authLabelClass}>
            Username *
          </label>
          <input
            id="username"
            name="username"
            type="text"
            value={formData.username}
            onChange={handleChange}
            required
            className={authFieldClass}
            placeholder="Choose a username"
          />
        </div>

        <div>
          <label htmlFor="email" className={authLabelClass}>
            Email *
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
            className={authFieldClass}
            placeholder="your@email.com"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className={authLabelClass}>
              First Name
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              value={formData.firstName}
              onChange={handleChange}
              className={authFieldClass}
              placeholder="First name"
            />
          </div>

          <div>
            <label htmlFor="lastName" className={authLabelClass}>
              Last Name
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              value={formData.lastName}
              onChange={handleChange}
              className={authFieldClass}
              placeholder="Last name"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className={authLabelClass}>
            Password *
          </label>
          <PasswordInput
            ref={passwordRef}
            id="password"
            name="password"
            required
            autoComplete="new-password"
            preventAutofill
            placeholder="At least 6 characters"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className={authLabelClass}>
            Confirm Password *
          </label>
          <PasswordInput
            ref={confirmPasswordRef}
            id="confirmPassword"
            name="confirmPassword"
            required
            autoComplete="new-password"
            preventAutofill
            placeholder="Re-enter password"
          />
        </div>

        <button type="submit" disabled={isLoading} className={authPrimaryButtonClass}>
          {isLoading ? 'Creating Account…' : 'Create Account'}
        </button>
      </form>
    </AuthShell>
  );
}
