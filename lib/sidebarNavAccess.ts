/**
 * System/role/permission gates for sidebar nav.
 * User hide prefs (localStorage) are applied only after this — they can never
 * re-show menus disabled by feature flags or role rules.
 */

import {
  isNavHrefAllowedForCustomer,
  isNavHrefAllowedForInternalUser,
} from '@/lib/customerNav';
import { isNavItemUserVisible, type NavMenuHiddenState } from '@/lib/navMenuVisibility';

export type SidebarNavSystemContext = {
  isCustomerUser: boolean;
  expensesEnabled: boolean;
  internalTicketsEnabled: boolean;
  memosEnabled: boolean;
  /** While true, expense permission checks stay permissive (legacy AppChromeTools). */
  permissionsLoading: boolean;
  canViewExpenses?: boolean;
  canCreateExpenses?: boolean;
  canManageTickets?: boolean;
  canCreateTickets?: boolean;
  isAdmin?: boolean;
  isSupport?: boolean;
};

/** Feature flags + customer/internal rules + ticket/expense permission gates. */
export function isSidebarHrefAllowedBySystem(
  href: string,
  ctx: SidebarNavSystemContext
): boolean {
  // Feature flags always win — user prefs cannot override these.
  if (href === '/expenses' && !ctx.expensesEnabled) return false;
  if (href === '/tickets' && !ctx.internalTicketsEnabled) return false;
  if (href === '/memos' && !ctx.memosEnabled) return false;

  if (ctx.isCustomerUser) {
    return isNavHrefAllowedForCustomer(href, {
      internalTicketsEnabled: ctx.internalTicketsEnabled,
    });
  }

  if (!isNavHrefAllowedForInternalUser(href)) return false;

  if (href === '/expenses') {
    return (
      ctx.permissionsLoading ||
      !!ctx.canViewExpenses ||
      !!ctx.canCreateExpenses ||
      !!ctx.isAdmin
    );
  }

  if (href === '/tickets') {
    return !!ctx.isSupport || !!ctx.canManageTickets || !!ctx.canCreateTickets;
  }

  return true;
}

export function filterSidebarNavBySystem<T extends { href: string }>(
  items: T[],
  ctx: SidebarNavSystemContext
): T[] {
  return items.filter((item) => isSidebarHrefAllowedBySystem(item.href, ctx));
}

/** Subtractive only: hide menus the user opted out of (after system allow-list). */
export function filterSidebarNavByUserPreference<T extends { href: string }>(
  items: T[],
  hidden: NavMenuHiddenState
): T[] {
  return items.filter((item) => isNavItemUserVisible(item.href, hidden));
}
