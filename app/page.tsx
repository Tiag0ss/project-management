'use client';

import { getApiUrl } from '@/lib/api/config';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Old marketing / pre-Synapse stock HTML — prefer the live React Synapse default instead. */
function isLegacyStockFrontpage(html: string): boolean {
  return (
    html.includes('from-blue-600 via-indigo-600 to-purple-600') ||
    (html.includes('Your Projects,') && html.includes('Your Infrastructure')) ||
    (html.includes('cdn.tailwindcss.com') &&
      html.includes('bg-white dark:bg-gray-900') &&
      html.includes('Built for Self-Hosting'))
  );
}

export default function Home() {
  const router = useRouter();
  const [stats, setStats] = useState({
    users: 0,
    projects: 0,
    tasks: 0,
  });
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(false);
  const [registrationType, setRegistrationType] = useState<'internal' | 'customer'>('internal');
  const [isCheckingInstall, setIsCheckingInstall] = useState(true);
  const [customFrontpage, setCustomFrontpage] = useState<string | null>(null);
  const [isLoadingFrontpage, setIsLoadingFrontpage] = useState(true);
  const [companyName, setCompanyName] = useState('Project Management');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');

  const loadStats = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/statistics/public`);

      if (response.ok) {
        const data = await response.json();
        setStats({
          users: data.totalUsers || 0,
          projects: data.totalProjects || 0,
          tasks: data.totalTasks || 0,
        });
      }
    } catch {
      // Stats are optional on the public page.
    }
  };

  const loadPublicSettingsAndFrontpage = async () => {
    setIsLoadingFrontpage(true);
    setCustomFrontpage(null);

    let isDemo = false;
    try {
      const response = await fetch(`${getApiUrl()}/api/system-settings/public`);

      if (response.ok) {
        const data = await response.json();
        if (data.frontpageEnabled === false) {
          router.replace('/login');
          return;
        }
        isDemo = data.demoMode === true;
        setAllowPublicRegistration(data.allowPublicRegistration === true);
        setRegistrationType(data.publicRegistrationType || 'internal');
        setCompanyName(data.companyName || 'Project Management');
        setCompanyLogoUrl(data.companyLogoUrl || '');
      }
    } catch {
      // Keep defaults when public settings are unavailable.
    }

    // Demo mode must always use the built-in Synapse default, never stored HTML.
    if (isDemo) {
      setIsLoadingFrontpage(false);
      return;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/system-settings/public-frontpage`);

      if (response.ok) {
        const data = await response.json();
        if (data.demoMode === true) {
          setIsLoadingFrontpage(false);
          return;
        }
        const content = typeof data.content === 'string' ? data.content.trim() : '';
        // Skip legacy stock HTML so the Synapse React default frontpage is used.
        if (content && !isLegacyStockFrontpage(content)) {
          setCustomFrontpage(content);
        }
      }
    } catch {
      // Fall back to default frontpage.
    } finally {
      setIsLoadingFrontpage(false);
    }
  };

  const checkInstallStatus = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/install/check`);
      if (response.ok) {
        const data = await response.json();
        if (data.needsInstall) {
          router.replace('/install');
          return;
        }
      }
    } catch {
      // Continue to frontpage if install probe fails.
    }
    setIsCheckingInstall(false);
    loadStats();
    void loadPublicSettingsAndFrontpage();
  };

  useEffect(() => {
    checkInstallStatus();
  }, []);

  if (isCheckingInstall || isLoadingFrontpage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--pm-bg)]">
        <div className="text-sm text-[var(--pm-muted)]">Loading…</div>
      </div>
    );
  }

  if (customFrontpage) {
    return <div dangerouslySetInnerHTML={{ __html: customFrontpage }} />;
  }

  const brand = (companyName || '').trim() || 'Project Management';
  const initial = brand.charAt(0).toUpperCase() || 'P';
  const hasStats = stats.users > 0 || stats.projects > 0 || stats.tasks > 0;

  const features = [
    {
      title: 'Full Data Ownership',
      body: 'Your data stays on your servers. No third-party access, complete privacy and control.',
    },
    {
      title: 'Enterprise Security',
      body: 'JWT authentication, role-based permissions, and encrypted data storage.',
    },
    {
      title: 'Fully Customizable',
      body: 'Custom statuses, workflows, and permissions tailored to your organization.',
    },
    {
      title: 'Advanced Planning',
      body: 'Gantt charts, resource allocation, and capacity planning tools.',
    },
    {
      title: 'Time Tracking',
      body: 'Comprehensive time tracking with daily and weekly timesheets.',
    },
    {
      title: 'Multi-Tenant Support',
      body: 'Manage multiple organizations with isolated data and custom permissions.',
    },
  ];

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 border-b border-[var(--pm-border)] bg-[color-mix(in_srgb,var(--pm-bg)_88%,transparent)] backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {companyLogoUrl ? (
              <img
                src={companyLogoUrl}
                alt={brand}
                className="h-8 w-8 rounded object-contain bg-[var(--pm-panel)] ring-1 ring-[var(--pm-border)]"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">
                {initial}
              </div>
            )}
            <span className="truncate text-base font-semibold text-[var(--pm-text)]">{brand}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 text-sm text-[var(--pm-muted)] transition-colors hover:text-[var(--pm-text)]"
            >
              Login
            </Link>
            {allowPublicRegistration && (
              <Link
                href="/register"
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                {registrationType === 'customer' ? 'Create Account' : 'Get Started'}
              </Link>
            )}
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-20">
          <div className="max-w-3xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Self-hosted · Open source · Full control
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-[var(--pm-text)] sm:text-5xl">
              {brand}
            </h1>
            <p className="mt-2 text-xl text-[var(--pm-muted)] sm:text-2xl">
              Your projects, your infrastructure.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--pm-muted)] sm:text-base">
              A self-hosted project management platform. Deploy on your own servers, keep full control
              over your data, and tailor workflows to your team.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-2">
              <Link
                href="/login"
                className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Access Dashboard
              </Link>
              {allowPublicRegistration && (
                <Link
                  href="/register"
                  className="inline-flex h-10 items-center rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] px-4 text-sm font-medium text-[var(--pm-text)] transition-colors hover:bg-[var(--pm-surface-2)]"
                >
                  {registrationType === 'customer' ? 'Create Account' : 'Get Started'}
                </Link>
              )}
            </div>

            {hasStats && (
              <div className="mt-10 grid max-w-xl grid-cols-3 gap-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-3">
                <div>
                  <p className="text-[11px] text-[var(--pm-muted)]">Users</p>
                  <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">{stats.users}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--pm-muted)]">Projects</p>
                  <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">{stats.projects}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--pm-muted)]">Tasks</p>
                  <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">{stats.tasks}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--pm-border)] bg-[var(--pm-surface)] py-14">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="mb-8 max-w-2xl">
            <h2 className="text-2xl font-semibold text-[var(--pm-text)]">Built for self-hosting</h2>
            <p className="mt-2 text-sm text-[var(--pm-muted)]">
              Deploy on your infrastructure and keep complete control over project data.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] p-4"
              >
                <h3 className="text-sm font-semibold text-[var(--pm-text)]">{feature.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--pm-muted)]">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--pm-border)] py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white">
                {initial}
              </div>
              <span className="text-sm font-semibold text-[var(--pm-text)]">{brand}</span>
            </div>
            <p className="text-xs text-[var(--pm-muted)]">Self-hosted project management platform</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
              Getting started
            </p>
            <Link href="/login" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Access your instance
            </Link>
          </div>
        </div>
        <div className="mx-auto mt-8 w-full max-w-6xl border-t border-[var(--pm-border)] px-4 pt-6 text-center text-xs text-[var(--pm-muted)] sm:px-6">
          &copy; {new Date().getFullYear()} {brand}. Self-hosted solution.
        </div>
      </footer>
    </div>
  );
}
