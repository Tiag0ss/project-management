'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

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

  // Show loading while checking
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  // Don't render children if customer user
  if (isCustomerUser) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Access Restricted</h2>
          <p className="text-gray-600 dark:text-gray-400">You don&apos;t have permission to access this page.</p>
          <a 
            href="/dashboard" 
            className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  // Render children for non-customer users
  return <>{children}</>;
}
