export type RecentNavKind = 'projects' | 'memos' | 'customers' | 'applications';

export type RecentNavItem = {
  id: number;
  label: string;
  href: string;
  accessedAt: number;
};

export type RecentNavAccessState = Record<RecentNavKind, RecentNavItem[]>;

export const RECENT_NAV_LIMIT = 2;
export const RECENT_NAV_EVENT = 'pm:recent-nav-access';

const RECENT_NAV_KINDS: RecentNavKind[] = ['projects', 'memos', 'customers', 'applications'];

export function recentNavStorageKey(userId?: number | null): string {
  return typeof userId === 'number' && Number.isFinite(userId)
    ? `pm:recent-nav-access:u${userId}`
    : 'pm:recent-nav-access';
}

export function emptyRecentNavAccess(): RecentNavAccessState {
  return {
    projects: [],
    memos: [],
    customers: [],
    applications: [],
  };
}

function isRecentNavKind(value: unknown): value is RecentNavKind {
  return typeof value === 'string' && (RECENT_NAV_KINDS as string[]).includes(value);
}

function normalizeItem(raw: unknown): RecentNavItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<RecentNavItem>;
  const id = Number(candidate.id);
  const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
  const href = typeof candidate.href === 'string' ? candidate.href.trim() : '';
  const accessedAt = Number(candidate.accessedAt);
  if (!Number.isFinite(id) || id <= 0 || !label || !href) return null;
  return {
    id,
    label,
    href,
    accessedAt: Number.isFinite(accessedAt) ? accessedAt : 0,
  };
}

/** Pure: insert/update an item at the front and keep at most `limit` entries. */
export function pushRecentNavItem(
  items: RecentNavItem[],
  next: Omit<RecentNavItem, 'accessedAt'> & { accessedAt?: number },
  limit: number = RECENT_NAV_LIMIT
): RecentNavItem[] {
  const accessedAt = next.accessedAt ?? Date.now();
  const normalized: RecentNavItem = {
    id: next.id,
    label: next.label.trim(),
    href: next.href.trim(),
    accessedAt,
  };
  if (!normalized.label || !normalized.href || !Number.isFinite(normalized.id) || normalized.id <= 0) {
    return items.slice(0, Math.max(0, limit));
  }
  const without = items.filter((item) => item.id !== normalized.id);
  return [normalized, ...without].slice(0, Math.max(0, limit));
}

export function parseRecentNavAccess(raw: string | null | undefined): RecentNavAccessState {
  const empty = emptyRecentNavAccess();
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<RecentNavKind, unknown>>;
    for (const kind of RECENT_NAV_KINDS) {
      const list = parsed[kind];
      if (!Array.isArray(list)) continue;
      empty[kind] = list
        .map(normalizeItem)
        .filter((item): item is RecentNavItem => item !== null)
        .slice(0, RECENT_NAV_LIMIT);
    }
    return empty;
  } catch {
    return empty;
  }
}

export function readRecentNavAccess(userId?: number | null): RecentNavAccessState {
  if (typeof window === 'undefined') return emptyRecentNavAccess();
  try {
    return parseRecentNavAccess(window.localStorage.getItem(recentNavStorageKey(userId)));
  } catch {
    return emptyRecentNavAccess();
  }
}

function writeRecentNavAccess(state: RecentNavAccessState, userId?: number | null): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(recentNavStorageKey(userId), JSON.stringify(state));
    window.dispatchEvent(new CustomEvent(RECENT_NAV_EVENT, { detail: { userId: userId ?? null } }));
  } catch {
    // ignore quota / private mode
  }
}

export function recordRecentNavAccess(
  kind: RecentNavKind,
  item: { id: number; label: string; href: string },
  userId?: number | null
): RecentNavAccessState {
  if (!isRecentNavKind(kind)) return readRecentNavAccess(userId);
  const current = readRecentNavAccess(userId);
  const next: RecentNavAccessState = {
    ...current,
    [kind]: pushRecentNavItem(current[kind], item),
  };
  writeRecentNavAccess(next, userId);
  return next;
}

export function recentNavParentHref(kind: RecentNavKind): string {
  switch (kind) {
    case 'projects':
      return '/projects';
    case 'memos':
      return '/memos';
    case 'customers':
      return '/customers';
    case 'applications':
      return '/applications';
  }
}
