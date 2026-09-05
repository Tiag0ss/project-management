'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
import AuthShell, {
  authFieldClass,
  authLabelClass,
  authPrimaryButtonClass,
  authSecondaryButtonClass,
} from '@/components/AuthShell';

const API_URL = getApiUrl();

export default function InstallPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [organizationName, setOrganizationName] = useState('');
  const [organizationAbbreviation, setOrganizationAbbreviation] = useState('');
  const [organizationDescription, setOrganizationDescription] = useState('');

  useEffect(() => {
    checkInstallStatus();
  }, []);

  const checkInstallStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/install/check`);
      if (response.ok) {
        const data = await response.json();
        if (!data.needsInstall) {
          router.replace('/login');
          return;
        }
      }
    } catch {
      // Show wizard if probe fails.
    } finally {
      setIsLoading(false);
    }
  };

  const validateStep1 = (): boolean => {
    if (!username.trim()) {
      setError('Username is required');
      return false;
    }
    if (!email.trim()) {
      setError('Email is required');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Invalid email format');
      return false;
    }
    const password = readPasswordInput(passwordRef);
    const confirmPassword = readPasswordInput(confirmPasswordRef);
    if (!password) {
      setError('Password is required');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!organizationName.trim()) {
      setError('Organization name is required');
      return false;
    }
    if (organizationAbbreviation && organizationAbbreviation.length > 10) {
      setError('Abbreviation must be 10 characters or less');
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    setError('');
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handlePrevStep = () => {
    setError('');
    setStep(1);
  };

  const handleSubmit = async () => {
    setError('');
    if (!validateStep2()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/api/install/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          email: email.trim(),
          password: readPasswordInput(passwordRef),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          organizationName: organizationName.trim(),
          organizationAbbreviation: organizationAbbreviation.trim() || undefined,
          organizationDescription: organizationDescription.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        let errorMessage = data.message || 'Setup failed';
        if (data.error?.sqlMessage) {
          errorMessage += `\nDatabase Error: ${data.error.sqlMessage}`;
        } else if (data.error?.details) {
          errorMessage += `\nDetails: ${data.error.details}`;
        }
        throw new Error(errorMessage);
      }

      if (data.token && data.user) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('authUser', JSON.stringify(data.user));
      }
      clearPasswordInput(passwordRef);
      clearPasswordInput(confirmPasswordRef);

      window.location.href = '/dashboard';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during setup');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--pm-bg)]">
        <div className="text-sm text-[var(--pm-muted)]">Checking system status…</div>
      </div>
    );
  }

  return (
    <AuthShell
      title="System Setup"
      description="Welcome. Configure the administrator account and primary organization."
      companyName="Project Management"
      maxWidthClassName="max-w-lg"
      footer={
        <p>This setup wizard only appears when no users exist in the system.</p>
      }
    >
      <div className="mb-4 flex items-center justify-center gap-2 text-xs">
        <span
          className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 font-medium ${
            step >= 1
              ? 'bg-[var(--pm-accent)] text-[var(--pm-accent-fg)]'
              : 'bg-[var(--pm-surface-2)] text-[var(--pm-muted)]'
          }`}
        >
          {step > 1 ? '✓' : '1'}
        </span>
        <span className={step >= 1 ? 'text-[var(--pm-text)]' : 'text-[var(--pm-muted)]'}>Admin</span>
        <span className={`h-px w-8 ${step >= 2 ? 'bg-[var(--pm-accent)]' : 'bg-[var(--pm-border)]'}`} />
        <span
          className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 font-medium ${
            step >= 2
              ? 'bg-[var(--pm-accent)] text-[var(--pm-accent-fg)]'
              : 'bg-[var(--pm-surface-2)] text-[var(--pm-muted)]'
          }`}
        >
          2
        </span>
        <span className={step >= 2 ? 'text-[var(--pm-text)]' : 'text-[var(--pm-muted)]'}>Organization</span>
      </div>

      {error && (
        <div className="mb-3 whitespace-pre-wrap rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--pm-muted)]">
            Create the main administrator account with full system access.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={authLabelClass}>First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                className={authFieldClass}
              />
            </div>
            <div>
              <label className={authLabelClass}>Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                className={authFieldClass}
              />
            </div>
          </div>

          <div>
            <label className={authLabelClass}>
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className={authFieldClass}
              required
            />
          </div>

          <div>
            <label className={authLabelClass}>
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className={authFieldClass}
              required
            />
          </div>

          <div>
            <label className={authLabelClass}>
              Password <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              ref={passwordRef}
              name="password"
              placeholder="Min. 6 characters"
              required
              autoComplete="new-password"
              preventAutofill
            />
          </div>

          <div>
            <label className={authLabelClass}>
              Confirm Password <span className="text-red-500">*</span>
            </label>
            <PasswordInput
              ref={confirmPasswordRef}
              name="confirmPassword"
              placeholder="Repeat password"
              required
              autoComplete="new-password"
              preventAutofill
            />
          </div>

          <button type="button" onClick={handleNextStep} className={authPrimaryButtonClass}>
            Next: Organization
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--pm-muted)]">
            Create the primary organization. You can add more organizations later.
          </p>
          <div>
            <label className={authLabelClass}>
              Organization Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="My Company"
              className={authFieldClass}
              required
            />
          </div>

          <div>
            <label className={authLabelClass}>Abbreviation</label>
            <input
              type="text"
              value={organizationAbbreviation}
              onChange={(e) => setOrganizationAbbreviation(e.target.value.toUpperCase())}
              placeholder="e.g., ACME"
              maxLength={10}
              className={authFieldClass}
            />
            <p className="mt-0.5 text-[11px] text-[var(--pm-muted)]">
              Used in ticket numbers (e.g., TKT-ACME-1). Max 10 characters.
            </p>
          </div>

          <div>
            <label className={authLabelClass}>Description</label>
            <textarea
              value={organizationDescription}
              onChange={(e) => setOrganizationDescription(e.target.value)}
              placeholder="Brief description of the organization…"
              rows={3}
              className={`${authFieldClass} resize-none`}
            />
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={handlePrevStep} className={authSecondaryButtonClass}>
              Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={authPrimaryButtonClass}
            >
              {isSubmitting ? 'Installing…' : 'Complete Setup'}
            </button>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
