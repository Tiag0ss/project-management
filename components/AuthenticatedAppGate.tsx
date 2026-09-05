'use client';

import AppShell from '@/components/AppShell';
import GlobalGridEnhancer from '@/components/GlobalGridEnhancer';
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';
import { ActiveOrganizationProvider } from '@/contexts/ActiveOrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

/** Routes that must not use AppShell / auth redirect (public + marketing). */
const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/install',
  '/docs',
  '/sso',
] as const;

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Applies AppShell + org context to authenticated app routes.
 * Public routes render children as-is (no shell, no login redirect).
 */
export default function AuthenticatedAppGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/';
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const publicRoute = isPublicPath(pathname);

  useEffect(() => {
    if (publicRoute || isLoading || token) return;
    router.replace('/login');
  }, [publicRoute, isLoading, token, router]);

  if (publicRoute) {
    return <div className="pm-app min-h-screen text-[var(--pm-text)]">{children}</div>;
  }

  // Keep chrome visible while session is restoring/validating — never a centered blank "Loading…".
  if (!token) {
    return (
      <div className="pm-app min-h-screen bg-[var(--pm-bg)] p-3 text-[var(--pm-text)] md:p-4">
        <PageLoadingSkeleton />
      </div>
    );
  }

  return (
    <ActiveOrganizationProvider>
      <GlobalGridEnhancer />
      <AppShell>{children}</AppShell>
    </ActiveOrganizationProvider>
  );
}
