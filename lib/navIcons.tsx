'use client';

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
  StickyNote,
  Ticket,
  Timer,
  Wallet,
} from 'lucide-react';

/** Lucide icons used by the AppShell sidebar — single source of truth for module icons. */
export const NAV_ICONS = {
  '/dashboard': LayoutDashboard,
  '/projects': FolderKanban,
  '/planning': GanttChart,
  '/timesheet': Timer,
  '/expenses': Wallet,
  '/call-records': Phone,
  '/work-summary': BookOpen,
  '/tickets': Ticket,
  '/memos': StickyNote,
  '/customers': Building2,
  '/applications': Boxes,
  '/approvals': CheckSquare,
  '/dev-support': Code2,
  '/reporting': BarChart3,
  '/portal': Globe,
} as const satisfies Record<string, LucideIcon>;

export type NavIconHref = keyof typeof NAV_ICONS;

export function getNavIcon(href: string): LucideIcon | null {
  if (href in NAV_ICONS) {
    return NAV_ICONS[href as NavIconHref];
  }
  return null;
}

type NavModuleIconProps = {
  href: NavIconHref | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
};

/** Renders the Lucide icon for a sidebar module path. */
export function NavModuleIcon({
  href,
  size = 18,
  className = 'opacity-90',
  strokeWidth = 1.75,
}: NavModuleIconProps) {
  const Icon = getNavIcon(href);
  if (!Icon) return null;
  return <Icon size={size} className={className} strokeWidth={strokeWidth} aria-hidden />;
}
