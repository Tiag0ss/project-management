'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UsersPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/administration');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-xl">Redirecting...</div>
    </div>
  );
}

interface CustomerOption {
  Id: number;
  Name: string;
}
 