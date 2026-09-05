'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  CheckSquare,
  Code2,
  FolderKanban,
  GanttChart,
  Globe,
  LayoutDashboard,
  Phone,
  Pin,
  PinOff,
  StickyNote,
  Ticket,
  Timer,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AppChromeTools from '@/components/AppChromeTools';
import { getApiUrl } from '@/lib/api/config';
import { useRecentNavAccess } from '@/hooks/useRecentNavAccess';
import {
  recordRecentNavAccess,
  recentNavParentHref,
  type RecentNavKind,
} from '@/lib/recentNavAccess';

const SIDEBAR_PINNED_KEY = 'pm:appshell:sidebar-pinned';

function readSidebarPinned(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_PINNED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSidebarPinned(pinned: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SIDEBAR_PINNED_KEY, pinned ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
}
type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section?: string;
  recentKind?: RecentNavKind;
};

type FeatureFlags = {
  expensesEnabled: boolean;
  internalTicketsEnabled: boolean;
  memosEnabled: boolean;
};

/** Main product nav — account / search / timer / quick actions live in the top bar. */
function buildNav(flags: FeatureFlags): NavItem[] {
  return [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/projects', label: 'Projects', icon: FolderKanban, section: 'Delivery', recentKind: 'projects' },
    { href: '/planning', label: 'Planning', icon: GanttChart, section: 'Delivery' },
    { href: '/timesheet', label: 'Timesheet', icon: Timer, section: 'Work' },
    ...(flags.expensesEnabled
      ? [{ href: '/expenses', label: 'Expenses', icon: Wallet, section: 'Work' } as NavItem]
      : []),
    { href: '/call-records', label: 'Call Records', icon: Phone, section: 'Work' },
    { href: '/work-summary', label: 'Work Summary', icon: BookOpen, section: 'Work' },
    ...(flags.internalTicketsEnabled
      ? [{ href: '/tickets', label: 'Tickets', icon: Ticket, section: 'Service' } as NavItem]
      : []),
    ...(flags.memosEnabled
      ? [{ href: '/memos', label: 'Memos', icon: StickyNote, section: 'Service', recentKind: 'memos' } as NavItem]
      : []),
    { href: '/customers', label: 'Customers', icon: Building2, section: 'Management', recentKind: 'customers' },
    { href: '/applications', label: 'Applications', icon: Boxes, section: 'Management', recentKind: 'applications' },
    {
      href: '/approvals',
      label: flags.expensesEnabled ? 'Approvals & Expenses' : 'Approvals',
      icon: CheckSquare,
      section: 'Management',
    },
    { href: '/dev-support', label: 'Dev Support', icon: Code2, section: 'Management' },
    { href: '/reporting', label: 'Reporting', icon: BarChart3, section: 'Reporting' },
    { href: '/portal', label: 'Portal', icon: Globe, section: 'Portal' },
  ];
}

function SectionSplitter({ title, expanded }: { title: string; expanded: boolean }) {
  // Fixed 20px row — title must not change height vs divider (legacy Navbar h-5).
  return (
    <div className="flex h-5 shrink-0 items-center gap-2 overflow-hidden px-3 text-[11px] font-semibold uppercase leading-5 tracking-wide text-[var(--pm-muted)]">
      {expanded ? (
        <>
          <span className="shrink-0 leading-5">{title}</span>
          <span className="h-px min-w-0 flex-1 bg-[var(--pm-border)]" />
        </>
      ) : (
        <span className="h-px w-full bg-[var(--pm-border)]" aria-hidden />
      )}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [pinnedExpanded, setPinnedExpanded] = useState(false);
  const [pinnedHydrated, setPinnedHydrated] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [activeMemoId, setActiveMemoId] = useState<string | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({
    expensesEnabled: false,
    internalTicketsEnabled: true,
    memosEnabled: true,
  });
  const [companyName, setCompanyName] = useState('Project Management');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const expanded = pinnedExpanded || hovered;
  // Hover-only expand overlays; pinned expand must reserve content width.
  const contentOffsetClass = pinnedExpanded ? 'w-72' : 'w-16';
  const pathname = usePathname();
  const { user, token, isCustomerUser } = useAuth();
  const recentNav = useRecentNavAccess(user?.id);
  const brandLabel = (companyName || '').trim() || 'Project Management';
  const brandInitial = brandLabel.charAt(0).toUpperCase() || 'P';

  useEffect(() => {
    setPinnedExpanded(readSidebarPinned());
    setPinnedHydrated(true);
  }, []);

  useEffect(() => {
    if (!pinnedHydrated) return;
    writeSidebarPinned(pinnedExpanded);
  }, [pinnedExpanded, pinnedHydrated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setActiveMemoId(new URLSearchParams(window.location.search).get('memoId'));
  }, [pathname, recentNav.memos]);
  useEffect(() => {
    const match = pathname.match(/^\/(projects|customers|applications)\/(\d+)(?:\/|$)/);
    if (!match) return;
    const segment = match[1] as 'projects' | 'customers' | 'applications';
    const id = Number(match[2]);
    if (!Number.isFinite(id) || id <= 0) return;
    const kind: RecentNavKind = segment;
    const existing = recentNav[kind].find((item) => item.id === id);
    const fallbackLabel =
      existing?.label ||
      (kind === 'projects' ? `Project #${id}` : kind === 'customers' ? `Customer #${id}` : `Application #${id}`);
    recordRecentNavAccess(
      kind,
      { id, label: fallbackLabel, href: `${recentNavParentHref(kind)}/${id}` },
      user?.id
    );
    // Only re-run on route changes; recentNav is read for label reuse at touch time.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: pathname-driven touch
  }, [pathname, user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const publicRes = await fetch(`${getApiUrl()}/api/system-settings/public`);
        if (publicRes.ok && !cancelled) {
          const publicData = await publicRes.json();
          setCompanyName(publicData.companyName || 'Project Management');
          setCompanyLogoUrl(publicData.companyLogoUrl || '');
          setIsDemoMode(publicData.demoMode === true);
        } else if (!cancelled) {
          setCompanyName('Project Management');
          setCompanyLogoUrl('');
          setIsDemoMode(false);
        }
      } catch {
        if (!cancelled) {
          setCompanyName('Project Management');
          setCompanyLogoUrl('');
          setIsDemoMode(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setFeatureFlags({
        expensesEnabled: false,
        internalTicketsEnabled: true,
        memosEnabled: true,
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const flagsRes = await fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!flagsRes.ok || cancelled) return;
        const flagsData = await flagsRes.json();
        if (!cancelled) {
          setFeatureFlags({
            expensesEnabled: flagsData.expensesEnabled === true,
            internalTicketsEnabled: flagsData.internalTicketsEnabled !== false,
            memosEnabled: flagsData.memosEnabled !== false,
          });
        }
      } catch {
        if (!cancelled) {
          setFeatureFlags({
            expensesEnabled: false,
            internalTicketsEnabled: true,
            memosEnabled: true,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const NAV = useMemo(() => buildNav(featureFlags), [featureFlags]);

  const visibleNav = NAV.filter((item) => {
    if (item.href === '/portal') return isCustomerUser || Boolean(user?.customerId);
    if (
      isCustomerUser &&
      ['/planning', '/timesheet', '/dev-support', '/reporting', '/expenses'].includes(item.href)
    ) {
      return false;
    }
    return true;
  });

  // Group by section so spacing matches legacy (mt/pt on section wrappers).
  const groups: { section?: string; items: NavItem[] }[] = [];
  for (const item of visibleNav) {
    const section = item.section;
    const last = groups[groups.length - 1];
    if (last && last.section === section) {
      last.items.push(item);
    } else {
      groups.push({ section, items: [item] });
    }
  }

  return (
    <div className="pm-app flex h-dvh min-h-0 w-full overflow-hidden bg-[var(--pm-bg)] text-[var(--pm-text)]">
      {/* Spacer: collapsed rail always; full width only when pinned */}
      <div
        className={[
          'shrink-0 transition-[width] duration-200',
          contentOffsetClass,
        ].join(' ')}
        aria-hidden
      />

      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={[
          'fixed left-0 top-0 z-[80] flex h-dvh flex-col overflow-hidden border-r border-[var(--pm-border)] bg-[var(--pm-panel)] shadow-xl transition-[width] duration-200',
          expanded ? 'w-72' : 'w-16',
        ].join(' ')}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--pm-border)] px-3">
          {companyLogoUrl ? (
            <img
              src={companyLogoUrl}
              alt=""
              className="h-[18px] w-5 shrink-0 rounded object-contain"
              aria-hidden
            />
          ) : (
            <span className="flex h-[18px] w-5 shrink-0 items-center justify-center text-[var(--pm-muted)]" aria-hidden>
              ☰
            </span>
          )}
          {/* Keep header slots mounted so icon column never shifts */}
          <Link
            href="/dashboard"
            className={[
              'min-w-0 flex-1 truncate text-sm font-semibold text-[var(--pm-accent-soft)] no-underline',
              expanded ? '' : 'invisible',
            ].join(' ')}
            tabIndex={expanded ? 0 : -1}
            aria-hidden={!expanded}
            title={brandLabel}
          >
            {brandLabel}
          </Link>
          <button
            type="button"
            className={[
              'rounded p-1 text-[var(--pm-muted)] hover:bg-[var(--pm-surface-2)] hover:text-[var(--pm-text)]',
              expanded ? '' : 'invisible',
            ].join(' ')}
            onClick={() => setPinnedExpanded((v) => !v)}
            title={pinnedExpanded ? 'Unpin menu' : 'Pin menu'}
            aria-label={pinnedExpanded ? 'Unpin menu' : 'Pin menu'}
            tabIndex={expanded ? 0 : -1}
            aria-hidden={!expanded}
          >
            {pinnedExpanded ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        </div>

        <nav className="flex-1 overflow-x-hidden overflow-y-scroll p-2" style={{ scrollbarGutter: 'stable' }}>
          {groups.map((group, groupIndex) => (
            <div
              key={group.section ?? 'root'}
              className={groupIndex > 0 ? 'mt-1.5 space-y-0.5 pt-1.5' : 'space-y-0.5'}
            >
              {group.section && <SectionSplitter title={group.section} expanded={expanded} />}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const recentItems = item.recentKind ? recentNav[item.recentKind] : [];
                return (
                  <div key={item.href} className="space-y-0.5">
                    <a
                      href={item.href}
                      title={item.label}
                      className={[
                        'flex h-9 items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-3 text-sm leading-none no-underline',
                        active
                          ? 'bg-[var(--pm-surface-2)] text-[var(--pm-accent-soft)]'
                          : 'text-[var(--pm-muted)] hover:bg-[var(--pm-surface)] hover:text-[var(--pm-text)]',
                      ].join(' ')}
                    >
                      <span className="flex h-[18px] w-5 shrink-0 items-center justify-center">
                        <Icon size={18} className="opacity-90" strokeWidth={1.75} />
                      </span>
                      <span
                        className={[
                          'min-w-0 truncate leading-none',
                          expanded ? '' : 'invisible w-0 overflow-hidden',
                        ].join(' ')}
                      >
                        {item.label}
                      </span>
                    </a>
                    {expanded &&
                      recentItems.map((recent) => {
                        const recentPath = recent.href.split('?')[0];
                        const recentActive =
                          item.recentKind === 'memos'
                            ? pathname.startsWith('/memos') && activeMemoId === String(recent.id)
                            : pathname === recentPath || pathname.startsWith(`${recentPath}/`);
                        return (
                          <a
                            key={`${item.recentKind}-${recent.id}`}
                            href={recent.href}
                            title={recent.label}
                            className={[
                              'flex h-8 items-center gap-2 overflow-hidden whitespace-nowrap rounded-md py-0 pl-10 pr-3 text-xs leading-none no-underline',
                              recentActive
                                ? 'bg-[var(--pm-surface-2)] text-[var(--pm-accent-soft)]'
                                : 'text-[var(--pm-muted)] hover:bg-[var(--pm-surface)] hover:text-[var(--pm-text)]',
                            ].join(' ')}
                          >
                            <span className="min-w-0 truncate">{recent.label}</span>
                          </a>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-[70] flex min-h-12 shrink-0 items-center border-b border-[var(--pm-border)] bg-[var(--pm-panel)] px-2 py-1.5 sm:px-3">
          <AppChromeTools
            toolsOnly
            leading={
              <div className="flex min-w-0 max-w-[min(100%,20rem)] items-center gap-2 sm:max-w-[24rem]">
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={brandLabel}
                    className="h-8 w-8 shrink-0 rounded-md bg-[var(--pm-surface)] object-contain ring-1 ring-[var(--pm-border)]"
                  />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">
                    {brandInitial}
                  </div>
                )}
                <span className="truncate text-sm font-semibold text-[var(--pm-text)]" title={brandLabel}>
                  {brandLabel}
                </span>
                {isDemoMode && (
                  <span
                    className="hidden shrink-0 items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 sm:inline-flex dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    title="Demo mode is enabled"
                  >
                    Demo
                  </span>
                )}
              </div>
            }
          />
        </header>

        <main className="pm-density flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-2 md:p-3">{children}</main>
      </div>
    </div>
  );
}
