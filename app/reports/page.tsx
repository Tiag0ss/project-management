/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — redirects to the Reporting hub Extract tab. */
export default function ReportsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/reporting?tab=extract');
  }, [router]);

  return (
    <div className="w-full flex items-center justify-center text-gray-600 dark:text-gray-300">
      Redirecting to Reporting…
    </div>
  );
}
