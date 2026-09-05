'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';

/** Organizations list lives under Administration; keep detail routes at /organizations/[id]. */
export default function OrganizationsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/administration?tab=organizations');
  }, [router]);

  return <PageLoadingSkeleton />;
}
