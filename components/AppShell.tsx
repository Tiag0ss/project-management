'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  ChevronRight,
  ListFilter,
  Pin,
  PinOff,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import AppChromeTools from '@/components/AppChromeTools';
import { getApiUrl } from '@/lib/api/config';
import { useRecentNavAccess } from '@/hooks/useRecentNavAccess';
import { useRecentNavExpanded } from '@/hooks/useRecentNavExpanded';
import { useNavMenuVisibility } from '@/hooks/useNavMenuVisibility';
import {
  recordRecentNavAccess,
  recentNavParentHref,
  type RecentNavKind,
} from '@/lib/recentNavAccess';
import { isNavMenuAlwaysVisible } from '@/lib/navMenuVisibility';
import {
  filterSidebarNavBySystem,
  filterSidebarNavByUserPreference,
} from '@/lib/sidebarNavAccess';
import { NAV_ICONS } from '@/lib/navIcons';

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

/** Full catalog — system flags/role/permissions filter what may appear; user prefs only hide. */
function buildNav(flags: FeatureFlags): NavItem[] {
  return [
    { href: '/dashboard', label: 'Dashboard', icon: NAV_ICONS['/dashboard'] },
    { href: '/projects', label: 'Projects', icon: NAV_ICONS['/projects'], section: 'Delivery', recentKind: 'projects' },
    { href: '/planning', label: 'Planning', icon: NAV_ICONS['/planning'], section: 'Delivery' },
    { href: '/timesheet', label: 'Timesheet', icon: NAV_ICONS['/timesheet'], section: 'Work' },
    { href: '/expenses', label: 'Expenses', icon: NAV_ICONS['/expenses'], section: 'Work' },
    { href: '/call-records', label: 'Call Records', icon: NAV_ICONS['/call-records'], section: 'Work' },
    { href: '/work-summary', label: 'Work Summary', icon: NAV_ICONS['/work-summary'], section: 'Work' },
    { href: '/tickets', label: 'Tickets', icon: NAV_ICONS['/tickets'], section: 'Service' },
    { href: '/memos', label: 'Memos', icon: NAV_ICONS['/memos'], section: 'Service', recentKind: 'memos' },
    { href: '/customers', label: 'Customers', icon: NAV_ICONS['/customers'], section: 'Management', recentKind: 'customers' },
    { href: '/applications', label: 'Applications', icon: NAV_ICONS['/applications'], section: 'Management', recentKind: 'applications' },
    {
      href: '/approvals',
      label: flags.expensesEnabled ? 'Approvals & Expenses' : 'Approvals',
      icon: NAV_ICONS['/approvals'],
      section: 'Management',
    },
    { href: '/dev-support', label: 'Dev Support', icon: NAV_ICONS['/dev-support'], section: 'Management' },
    { href: '/reporting', label: 'Reporting', icon: NAV_ICONS['/reporting'], section: 'Reporting' },
    { href: '/portal', label: 'Portal', icon: NAV_ICONS['/portal'], section: 'Portal' },
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
  const [menuVisibilityOpen, setMenuVisibilityOpen] = useState(false);
  const menuVisibilityRef = useRef<HTMLDivElement | null>(null);
  const expanded = pinnedExpanded || hovered;
  // Hover-only expand overlays; pinned expand must reserve content width.
  const contentOffsetClass = pinnedExpanded ? 'w-72' : 'w-16';
  const pathname = usePathname();
  const { user, token, isCustomerUser } = useAuth();
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const recentNav = useRecentNavAccess(user?.id);
  const { expanded: recentExpanded, toggleExpanded: toggleRecentExpanded } = useRecentNavExpanded(user?.id);
  const { hidden: navMenuHidden, isVisible: isNavMenuVisible, setHidden: setNavMenuHidden } =
    useNavMenuVisibility(user?.id);
  const brandLabel = (companyName || '').trim() || 'Project Management';

  useEffect(() => {
    setPinnedExpanded(readSidebarPinned());
    setPinnedHydrated(true);
  }, []);

  useEffect(() => {
    if (!pinnedHydrated) return;
    writeSidebarPinned(pinnedExpanded);
  }, [pinnedExpanded, pinnedHydrated]);

  useEffect(() => {
    if (!menuVisibilityOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuVisibilityRef.current && target && !menuVisibilityRef.current.contains(target)) {
        setMenuVisibilityOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuVisibilityOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuVisibilityOpen]);

  useEffect(() => {
    if (!expanded) setMenuVisibilityOpen(false);
  }, [expanded]);

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

  const roleAllowedNav = useMemo(
    () =>
      filterSidebarNavBySystem(NAV, {
        isCustomerUser,
        expensesEnabled: featureFlags.expensesEnabled,
        internalTicketsEnabled: featureFlags.internalTicketsEnabled,
        memosEnabled: featureFlags.memosEnabled,
        permissionsLoading,
        canViewExpenses: permissions?.canViewExpenses,
        canCreateExpenses: permissions?.canCreateExpenses,
        canManageTickets: permissions?.canManageTickets,
        canCreateTickets: permissions?.canCreateTickets,
        isAdmin: !!user?.isAdmin,
        isSupport: !!user?.isSupport,
      }),
    [
      NAV,
      isCustomerUser,
      featureFlags.expensesEnabled,
      featureFlags.internalTicketsEnabled,
      featureFlags.memosEnabled,
      permissionsLoading,
      permissions?.canViewExpenses,
      permissions?.canCreateExpenses,
      permissions?.canManageTickets,
      permissions?.canCreateTickets,
      user?.isAdmin,
      user?.isSupport,
    ]
  );

  const visibleNav = useMemo(
    () => filterSidebarNavByUserPreference(roleAllowedNav, navMenuHidden),
    [roleAllowedNav, navMenuHidden]
  );

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
          <div
            ref={menuVisibilityRef}
            className={['relative shrink-0', expanded ? '' : 'invisible'].join(' ')}
            aria-hidden={!expanded}
          >
            <button
              type="button"
              className="rounded p-1 text-[var(--pm-muted)] hover:bg-[var(--pm-surface-2)] hover:text-[var(--pm-text)]"
              onClick={() => setMenuVisibilityOpen((open) => !open)}
              title="Show or hide menus"
              aria-label="Show or hide menus"
              aria-expanded={menuVisibilityOpen}
              aria-haspopup="dialog"
              tabIndex={expanded ? 0 : -1}
            >
              <ListFilter size={14} />
            </button>
            {menuVisibilityOpen && (
              <div
                role="dialog"
                aria-label="Menu visibility"
                className="absolute right-0 top-full z-[90] mt-1 w-56 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] p-2 shadow-xl"
              >
                <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
                  Visible menus
                </p>
                <div className="max-h-72 space-y-0.5 overflow-y-auto">
                  {roleAllowedNav.map((item) => {
                    const locked = isNavMenuAlwaysVisible(item.href);
                    const checked = isNavMenuVisible(item.href);
                    return (
                      <label
                        key={item.href}
                        className={[
                          'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--pm-text)] hover:bg-[var(--pm-surface)]',
                          locked ? 'cursor-default opacity-80' : '',
                        ].join(' ')}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-[var(--pm-border)]"
                          checked={checked}
                          disabled={locked}
                          onChange={(event) => setNavMenuHidden(item.href, !event.target.checked)}
                        />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {locked && (
                          <span className="shrink-0 text-[10px] text-[var(--pm-muted)]">Required</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
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
                const recentItems =
                  !isCustomerUser && item.recentKind ? recentNav[item.recentKind] : [];
                const recentKind = item.recentKind;
                const showRecentToggle = expanded && !!recentKind && recentItems.length > 0;
                const recentGroupOpen =
                  !!recentKind && recentExpanded[recentKind] !== false;
                return (
                  <div key={item.href} className="space-y-0.5">
                    <div className="flex items-center gap-0.5">
                      <a
                        href={item.href}
                        title={item.label}
                        className={[
                          'flex h-9 min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-3 text-sm leading-none no-underline',
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
                      {showRecentToggle && recentKind && (
                        <button
                          type="button"
                          className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--pm-muted)] hover:bg-[var(--pm-surface)] hover:text-[var(--pm-text)]"
                          onClick={() => toggleRecentExpanded(recentKind)}
                          title={recentGroupOpen ? 'Collapse recent' : 'Expand recent'}
                          aria-label={
                            recentGroupOpen
                              ? `Collapse recent ${item.label}`
                              : `Expand recent ${item.label}`
                          }
                          aria-expanded={recentGroupOpen}
                        >
                          {recentGroupOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </div>
                    {expanded &&
                      recentGroupOpen &&
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
              isDemoMode ? (
                <span
                  className="inline-flex shrink-0 items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  title="Demo mode is enabled"
                >
                  Demo
                </span>
              ) : null
            }
          />
        </header>

        <main className="pm-density flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-2 md:p-3">{children}</main>
      </div>
    </div>
  );
}
