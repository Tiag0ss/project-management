'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

/** Minimal chrome for frozen `/docs` (no AppShell, no legacy Navbar). */
export default function DocsChrome() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/docs" className="truncate text-sm font-semibold text-gray-900 no-underline dark:text-white">
            User Manual
          </Link>
          {user && (
            <Link href="/dashboard" className="text-sm text-gray-600 no-underline hover:text-blue-600 dark:text-gray-300 dark:hover:text-blue-400">
              Back to app
            </Link>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <button
              type="button"
              onClick={() => logout()}
              className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-gray-100 dark:text-red-400 dark:hover:bg-gray-700"
            >
              Logout
            </button>
          ) : (
            <Link href="/login" className="text-sm text-blue-600 no-underline dark:text-blue-400">
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
