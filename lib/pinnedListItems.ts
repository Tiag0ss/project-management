/**
 * Per-user pinned ids for list pages (localStorage).
 * Order in the array is display order among pinned rows (index 0 = top).
 *
 * Storage key: `pm:pinned-{kind}:u{userId}` (e.g. `pm:pinned-projects:u7`).
 */

export const PINNED_LIST_KINDS = ['projects', 'applications', 'customers', 'memos'] as const;

export type PinnedListKind = (typeof PINNED_LIST_KINDS)[number];

export type PinnedListIds = number[];

export const PINNED_LIST_EVENT = 'pm:pinned-list';

export function pinnedListStorageKey(kind: PinnedListKind, userId?: number | null): string {
  const base = `pm:pinned-${kind}`;
  return typeof userId === 'number' && Number.isFinite(userId) ? `${base}:u${userId}` : base;
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

/** Pure: normalize a stored JSON array of entity ids. */
export function parsePinnedListIds(raw: string | null | undefined): PinnedListIds {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids: number[] = [];
    const seen = new Set<number>();
    for (const entry of parsed) {
      const id = Number(entry);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

export function readPinnedListIds(kind: PinnedListKind, userId?: number | null): PinnedListIds {
  const storage = getLocalStorage();
  if (!storage) return [];
  try {
    return parsePinnedListIds(storage.getItem(pinnedListStorageKey(kind, userId)));
  } catch {
    return [];
  }
}

function writePinnedListIds(kind: PinnedListKind, ids: PinnedListIds, userId?: number | null): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(pinnedListStorageKey(kind, userId), JSON.stringify(ids));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(PINNED_LIST_EVENT, { detail: { kind, userId: userId ?? null } })
      );
    }
  } catch {
    // ignore quota / private mode
  }
}

export function isListItemPinned(entityId: number, pinnedIds: PinnedListIds): boolean {
  return pinnedIds.includes(Number(entityId));
}

/** Pin (prepend) or unpin an entity id. Returns the next pinned list. */
export function setListItemPinned(
  kind: PinnedListKind,
  entityId: number,
  pinned: boolean,
  userId?: number | null
): PinnedListIds {
  const id = Number(entityId);
  if (!Number.isFinite(id) || id <= 0) return readPinnedListIds(kind, userId);

  const current = readPinnedListIds(kind, userId);
  const without = current.filter((entry) => entry !== id);
  const next = pinned ? [id, ...without] : without;
  writePinnedListIds(kind, next, userId);
  return next;
}

export function toggleListItemPinned(
  kind: PinnedListKind,
  entityId: number,
  userId?: number | null
): PinnedListIds {
  const current = readPinnedListIds(kind, userId);
  const id = Number(entityId);
  return setListItemPinned(kind, id, !current.includes(id), userId);
}

/**
 * Sort comparator: pinned ids (in pin order) first, then `compareUnpinned`.
 * Pure — safe for unit tests.
 */
export function compareWithPinnedFirst<T>(
  a: T,
  b: T,
  getId: (item: T) => number,
  pinnedIds: PinnedListIds,
  compareUnpinned: (a: T, b: T) => number
): number {
  const ai = pinnedIds.indexOf(getId(a));
  const bi = pinnedIds.indexOf(getId(b));
  if (ai >= 0 && bi >= 0) return ai - bi;
  if (ai >= 0) return -1;
  if (bi >= 0) return 1;
  return compareUnpinned(a, b);
}
