'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';

interface CustomerUserGuardProps {
  children: React.ReactNode;
}

/**
 * Guard component that prevents customer users from accessing internal pages.
 * Customer users (those with a CustomerId set) will be redirected to the dashboard.
 */
export default function CustomerUserGuard({ children }: CustomerUserGuardProps) {
  const { user, isLoading, isCustomerUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user && isCustomerUser) {
      // Redirect customer users to the customer portal
      router.push('/portal');
    }
  }, [isLoading, user, isCustomerUser, router]);

  if (isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (isCustomerUser) {
    return (
      <div className="w-full rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] p-8 text-center">
        <h2 className="mb-2 text-xl font-semibold text-[var(--pm-text)]">Access Restricted</h2>
        <p className="text-[var(--pm-muted)]">You don&apos;t have permission to access this page.</p>
        <a
          href="/dashboard"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  return <>{children}</>;
}
