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
import { useActiveOrganization } from '@/contexts/ActiveOrganizationContext';
import AppChromeTools from '@/components/AppChromeTools';
import { getApiUrl } from '@/lib/api/config';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section?: string;
};

/** Main product nav — account / search / timer / quick actions live in the top bar. */
function buildNav(expensesEnabled: boolean): NavItem[] {
  return [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/projects', label: 'Projects', icon: FolderKanban, section: 'Delivery' },
    { href: '/planning', label: 'Planning', icon: GanttChart, section: 'Delivery' },
    { href: '/timesheet', label: 'Timesheet', icon: Timer, section: 'Work' },
    ...(expensesEnabled
      ? [{ href: '/expenses', label: 'Expenses', icon: Wallet, section: 'Work' } as NavItem]
      : []),
    { href: '/call-records', label: 'Call Records', icon: Phone, section: 'Work' },
    { href: '/work-summary', label: 'Work Summary', icon: BookOpen, section: 'Work' },
    { href: '/tickets', label: 'Tickets', icon: Ticket, section: 'Service' },
    { href: '/memos', label: 'Memos', icon: StickyNote, section: 'Service' },
    { href: '/customers', label: 'Customers', icon: Building2, section: 'Management' },
    { href: '/applications', label: 'Applications', icon: Boxes, section: 'Management' },
    {
      href: '/approvals',
      label: expensesEnabled ? 'Approvals & Expenses' : 'Approvals',
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
  const [hovered, setHovered] = useState(false);
  const [expensesEnabled, setExpensesEnabled] = useState(false);
  const expanded = pinnedExpanded || hovered;
  // Hover-only expand overlays; pinned expand must reserve content width.
  const contentOffsetClass = pinnedExpanded ? 'w-72' : 'w-16';
  const pathname = usePathname();
  const { user, token, isCustomerUser } = useAuth();
  const { organizations, activeOrganizationId, setActiveOrganizationId, loading: orgLoading } =
    useActiveOrganization();

  useEffect(() => {
    if (!token) {
      setExpensesEnabled(false);
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
        if (!cancelled) setExpensesEnabled(flagsData.expensesEnabled === true);
      } catch {
        if (!cancelled) setExpensesEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const NAV = useMemo(() => buildNav(expensesEnabled), [expensesEnabled]);

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
          'fixed left-0 top-0 z-50 flex h-dvh flex-col overflow-hidden border-r border-[var(--pm-border)] bg-[var(--pm-panel)] shadow-xl transition-[width] duration-200',
          expanded ? 'w-72' : 'w-16',
        ].join(' ')}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--pm-border)] px-3">
          <span className="flex h-[18px] w-5 shrink-0 items-center justify-center text-[var(--pm-muted)]" aria-hidden>
            ☰
          </span>
          {/* Keep header slots mounted so icon column never shifts */}
          <Link
            href="/dashboard"
            className={[
              'min-w-0 flex-1 truncate text-sm font-semibold text-[var(--pm-accent-soft)] no-underline',
              expanded ? '' : 'invisible',
            ].join(' ')}
            tabIndex={expanded ? 0 : -1}
            aria-hidden={!expanded}
          >
            PM
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
                return (
                  <a
                    key={item.href}
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
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-40 flex min-h-12 shrink-0 items-center gap-3 border-b border-[var(--pm-border)] bg-[var(--pm-panel)] px-2 py-1.5 sm:px-3">
          <div className="z-10 flex min-w-[10rem] shrink-0 items-center gap-2 sm:min-w-[12rem]">
            <Building2 size={16} className="shrink-0 text-[var(--pm-accent)]" />
            {orgLoading ? (
              <span className="text-sm text-[var(--pm-muted)]">Organizations…</span>
            ) : organizations.length <= 1 ? (
              <span className="truncate text-sm font-medium" title={organizations[0]?.Name}>
                {organizations[0]?.Name ?? 'No organization'}
              </span>
            ) : (
              <select
                className="w-full max-w-[14rem] rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-2 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
                value={activeOrganizationId ?? ''}
                onChange={(e) => setActiveOrganizationId(Number(e.target.value) || null)}
                aria-label="Active organization"
              >
                {organizations.map((o) => (
                  <option key={o.Id} value={o.Id}>
                    {o.Name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <AppChromeTools toolsOnly />
          </div>
        </header>

        <main className="pm-density flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-2 md:p-3">{children}</main>
      </div>
    </div>
  );
}
