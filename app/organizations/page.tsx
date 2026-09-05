'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Organizations list lives under Administration; keep detail routes at /organizations/[id]. */
export default function OrganizationsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/administration?tab=organizations');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-xl text-[var(--pm-muted)]">Redirecting…</div>
    </div>
  );
}
