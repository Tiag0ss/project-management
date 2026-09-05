'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

function LoginPageInner() {
  const [username, setUsername] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(false);
  const [registrationType, setRegistrationType] = useState<'internal' | 'customer'>('internal');
  const [companyName, setCompanyName] = useState('Project Management');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    checkInstallStatus();
    checkRegistrationSettings();
    prepareAuthEncryptionSession().catch(() => {
      // Encryption session is best-effort before submit.
    });
  }, []);

  const checkInstallStatus = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/install/check`);
      if (response.ok) {
        const data = await response.json();
        if (data.needsInstall) {
          router.replace('/install');
          return;
        }
      }
    } catch {
      // Ignore install probe failures on login.
    }
  };

  const checkRegistrationSettings = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/system-settings/public`);

      if (response.ok) {
        const data = await response.json();
        setAllowPublicRegistration(data.allowPublicRegistration === true);
        setRegistrationType(data.publicRegistrationType || 'internal');
        setCompanyName(data.companyName || 'Project Management');
        setCompanyLogoUrl(data.companyLogoUrl || '');
      }
    } catch {
      // Keep defaults when public settings are unavailable.
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login({ username, password: readPasswordInput(passwordRef) });
      clearPasswordInput(passwordRef);
      const returnUrl = searchParams.get('returnUrl');
      if (returnUrl && returnUrl.startsWith('/')) {
        router.push(returnUrl);
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title="Login"
      description="Sign in to access your workspace."
      companyName={companyName}
      companyLogoUrl={companyLogoUrl}
      footer={
        allowPublicRegistration ? (
          <p>
            {registrationType === 'customer' ? 'Need customer access?' : "Don't have an account?"}{' '}
            <Link href="/register" className={`${authLinkClass} font-medium`}>
              {registrationType === 'customer' ? 'Register as customer' : 'Create account'}
            </Link>
          </p>
        ) : null
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
            Username or Email
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className={authFieldClass}
            placeholder="Enter your username or email"
          />
        </div>

        <div>
          <label htmlFor="password" className={authLabelClass}>
            Password
          </label>
          <PasswordInput
            ref={passwordRef}
            id="password"
            name="password"
            required
            autoComplete="current-password"
            placeholder="Enter your password"
          />
          <div className="mt-1.5 text-right">
            <Link href="/forgot-password" className={`text-xs ${authLinkClass}`}>
              Forgot password?
            </Link>
          </div>
        </div>

        <button type="submit" disabled={isLoading} className={authPrimaryButtonClass}>
          {isLoading ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--pm-bg)]">
          <div className="text-sm text-[var(--pm-muted)]">Loading…</div>
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
