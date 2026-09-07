/**
 * Label/href cache for projects pinned in the list (`pinnedListItems` / projects)
 * so they can appear in the AppShell navbar when not in recent.
 * Pin count is unbounded; recent nav remains limited to 2.
 */

export type PinnedNavProjectMeta = {
  id: number;
  label: string;
  href: string;
};

export type PinnedNavProjectMetaMap = Record<number, PinnedNavProjectMeta>;

export const PINNED_NAV_PROJECT_META_EVENT = 'pm:pinned-nav-project-meta';

export function pinnedNavProjectMetaStorageKey(userId?: number | null): string {
  return typeof userId === 'number' && Number.isFinite(userId)
    ? `pm:pinned-nav-project-meta:u${userId}`
    : 'pm:pinned-nav-project-meta';
}

function getLocalStorage(): Storage | null {
  try {
    const root =
      typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;
    if (!root || !('localStorage' in root)) return null;
    return (root as typeof globalThis & { localStorage: Storage }).localStorage;
  } catch {
    return null;
  }
}

/** True when label is the generic fallback (`Project #123`). */
export function isPlaceholderPinnedNavLabel(id: number, label: string): boolean {
  const trimmed = String(label || '').trim();
  return trimmed.toLowerCase() === `project #${id}`.toLowerCase();
}

/** Prefer the first non-placeholder label among candidates. */
export function pickPinnedNavLabel(id: number, ...candidates: Array<string | null | undefined>): string {
  const trimmed = candidates
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  const real = trimmed.find((label) => !isPlaceholderPinnedNavLabel(id, label));
  return real || trimmed[0] || `Project #${id}`;
}

/** Pure: parse stored meta map. */
export function parsePinnedNavProjectMeta(raw: string | null | undefined): PinnedNavProjectMetaMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: PinnedNavProjectMetaMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const id = Number(key);
      if (!Number.isFinite(id) || id <= 0 || !value || typeof value !== 'object') continue;
      const entry = value as Partial<PinnedNavProjectMeta>;
      const label = typeof entry.label === 'string' ? entry.label.trim() : '';
      const href = typeof entry.href === 'string' ? entry.href.trim() : '';
      if (!label || !href) continue;
      out[id] = { id, label, href };
    }
    return out;
  } catch {
    return {};
  }
}

export function readPinnedNavProjectMeta(userId?: number | null): PinnedNavProjectMetaMap {
  const storage = getLocalStorage();
  if (!storage) return {};
  try {
    return parsePinnedNavProjectMeta(storage.getItem(pinnedNavProjectMetaStorageKey(userId)));
  } catch {
    return {};
  }
}

function writePinnedNavProjectMeta(map: PinnedNavProjectMetaMap, userId?: number | null): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(pinnedNavProjectMetaStorageKey(userId), JSON.stringify(map));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(PINNED_NAV_PROJECT_META_EVENT, { detail: { userId: userId ?? null } })
      );
    }
  } catch {
    // ignore quota / private mode
  }
}

export function upsertPinnedNavProjectMeta(
  item: { id: number; label: string; href: string },
  userId?: number | null
): PinnedNavProjectMetaMap {
  const id = Number(item.id);
  const label = String(item.label || '').trim();
  const href = String(item.href || '').trim();
  const current = readPinnedNavProjectMeta(userId);
  if (!Number.isFinite(id) || id <= 0 || !label || !href) {
    return current;
  }
  const existing = current[id];
  // Never replace a real name with the generic Project #id fallback.
  if (
    existing &&
    isPlaceholderPinnedNavLabel(id, label) &&
    !isPlaceholderPinnedNavLabel(id, existing.label)
  ) {
    return current;
  }
  if (existing && existing.label === label && existing.href === href) {
    return current;
  }
  const next = {
    ...current,
    [id]: { id, label, href },
  };
  writePinnedNavProjectMeta(next, userId);
  return next;
}

export function removePinnedNavProjectMeta(entityId: number, userId?: number | null): PinnedNavProjectMetaMap {
  const id = Number(entityId);
  const current = readPinnedNavProjectMeta(userId);
  if (!Number.isFinite(id) || id <= 0 || !(id in current)) return current;
  const next = { ...current };
  delete next[id];
  writePinnedNavProjectMeta(next, userId);
  return next;
}

/** Build nav rows for list-pinned project ids (pin order); prefer real names over placeholders. */
export function resolvePinnedNavProjects(
  pinnedIds: number[],
  recent: Array<{ id: number; label: string; href: string }>,
  meta: PinnedNavProjectMetaMap
): Array<{ id: number; label: string; href: string }> {
  return pinnedIds
    .map((id) => {
      const fromRecent = recent.find((entry) => entry.id === id);
      const fromMeta = meta[id];
      const label = pickPinnedNavLabel(id, fromMeta?.label, fromRecent?.label);
      const href = fromMeta?.href || fromRecent?.href || `/projects/${id}`;
      return { id, label, href };
    })
    .filter((entry) => entry.id > 0);
}
