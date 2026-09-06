/**
 * Per-user persisted UI filter/state blobs in localStorage.
 * Key shape: `pm:filters:{namespace}:u{userId}` or `…:u{userId}:s{scope}`.
 */

export const PERSISTED_FILTERS_EVENT = 'pm:persisted-filters';

export function persistedFiltersStorageKey(
  namespace: string,
  userId?: number | null,
  scope?: string | number | null
): string {
  const ns = String(namespace || 'default').trim() || 'default';
  const userPart =
    typeof userId === 'number' && Number.isFinite(userId) ? `u${userId}` : 'uanon';
  if (scope === null || scope === undefined || scope === '') {
    return `pm:filters:${ns}:${userPart}`;
  }
  return `pm:filters:${ns}:${userPart}:s${String(scope)}`;
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

/** Pure: parse JSON object or return null. */
export function parsePersistedFiltersObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readPersistedFilters<T extends Record<string, unknown>>(
  namespace: string,
  defaults: T,
  options?: {
    userId?: number | null;
    scope?: string | number | null;
    /** Merge/normalize stored values onto defaults */
    merge?: (stored: Record<string, unknown>, defaults: T) => T;
  }
): T {
  const storage = getLocalStorage();
  if (!storage) return { ...defaults };
  try {
    const key = persistedFiltersStorageKey(namespace, options?.userId, options?.scope);
    const stored = parsePersistedFiltersObject(storage.getItem(key));
    if (!stored) return { ...defaults };
    if (options?.merge) return options.merge(stored, defaults);
    return { ...defaults, ...stored } as T;
  } catch {
    return { ...defaults };
  }
}

export function writePersistedFilters<T extends Record<string, unknown>>(
  namespace: string,
  value: T,
  options?: {
    userId?: number | null;
    scope?: string | number | null;
  }
): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    const key = persistedFiltersStorageKey(namespace, options?.userId, options?.scope);
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

export function clearPersistedFilters(
  namespace: string,
  options?: {
    userId?: number | null;
    scope?: string | number | null;
  }
): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    const key = persistedFiltersStorageKey(namespace, options?.userId, options?.scope);
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Coerce optional positive number ids (filters that use undefined when unset). */
export function optionalPositiveNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

export function optionalNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const entry of value) {
    const id = Number(entry);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
