'use client';

import AppShell from '@/components/AppShell';
import GlobalGridEnhancer from '@/components/GlobalGridEnhancer';
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

  if (isLoading || !token) {
    return (
      <div className="pm-app flex min-h-screen items-center justify-center bg-[var(--pm-bg)] text-[var(--pm-muted)]">
        Loading…
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
