/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';

export default function UsersPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/administration');
  }, [router]);

  return <PageLoadingSkeleton />;
}
