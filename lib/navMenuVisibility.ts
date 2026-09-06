/**
 * Per-user sidebar menu visibility (localStorage).
 * Hidden hrefs are stored; missing/invalid entries default to visible.
 * Dashboard cannot be hidden.
 *
 * These prefs are subtractive only: they never override feature flags, role rules,
 * or permission gates applied by `filterSidebarNavBySystem`.
 */

export const NAV_MENU_ALWAYS_VISIBLE = ['/dashboard'] as const;

export const NAV_MENU_VISIBILITY_EVENT = 'pm:nav-menu-visibility';

export type NavMenuHiddenState = string[];

export function navMenuVisibilityStorageKey(userId?: number | null): string {
  return typeof userId === 'number' && Number.isFinite(userId)
    ? `pm:nav-menu-hidden:u${userId}`
    : 'pm:nav-menu-hidden';
}

export function isNavMenuAlwaysVisible(href: string): boolean {
  return (NAV_MENU_ALWAYS_VISIBLE as readonly string[]).includes(href);
}

/** Pure: normalize a stored JSON array of hidden hrefs. */
export function parseNavMenuHidden(raw: string | null | undefined): NavMenuHiddenState {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const hidden: string[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue;
      const href = entry.trim();
      if (!href.startsWith('/') || isNavMenuAlwaysVisible(href) || seen.has(href)) continue;
      seen.add(href);
      hidden.push(href);
    }
    return hidden;
  } catch {
    return [];
  }
}

export function readNavMenuHidden(userId?: number | null): NavMenuHiddenState {
  if (typeof window === 'undefined') return [];
  try {
    return parseNavMenuHidden(window.localStorage.getItem(navMenuVisibilityStorageKey(userId)));
  } catch {
    return [];
  }
}

function writeNavMenuHidden(hidden: NavMenuHiddenState, userId?: number | null): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(navMenuVisibilityStorageKey(userId), JSON.stringify(hidden));
    window.dispatchEvent(
      new CustomEvent(NAV_MENU_VISIBILITY_EVENT, { detail: { userId: userId ?? null } })
    );
  } catch {
    // ignore quota / private mode
  }
}

export function isNavItemUserVisible(href: string, hidden: NavMenuHiddenState): boolean {
  if (isNavMenuAlwaysVisible(href)) return true;
  return !hidden.includes(href);
}

export function setNavMenuItemHidden(
  href: string,
  hide: boolean,
  userId?: number | null
): NavMenuHiddenState {
  const current = readNavMenuHidden(userId);
  if (isNavMenuAlwaysVisible(href)) return current;
  const without = current.filter((entry) => entry !== href);
  const next = hide ? [...without, href] : without;
  writeNavMenuHidden(next, userId);
  return next;
}

export function toggleNavMenuItemHidden(href: string, userId?: number | null): NavMenuHiddenState {
  const current = readNavMenuHidden(userId);
  if (isNavMenuAlwaysVisible(href)) return current;
  return setNavMenuItemHidden(href, !current.includes(href), userId);
}
