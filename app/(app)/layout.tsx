'use client';

import AppShell from '@/components/AppShell';
import { ActiveOrganizationProvider } from '@/contexts/ActiveOrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace('/login');
    }
  }, [isLoading, token, router]);

  if (isLoading || !token) {
    return (
      <div className="pm-app flex min-h-screen items-center justify-center bg-[var(--pm-bg)] text-[var(--pm-muted)]">
        Loading…
      </div>
    );
  }

  return (
    <ActiveOrganizationProvider>
      <AppShell>{children}</AppShell>
    </ActiveOrganizationProvider>
  );
}
