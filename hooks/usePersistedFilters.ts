'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearPersistedFilters,
  persistedFiltersStorageKey,
  readPersistedFilters,
  writePersistedFilters,
} from '@/lib/persistedFilters';

type UsePersistedFiltersOptions<T extends Record<string, unknown>> = {
  userId?: number | null;
  scope?: string | number | null;
  merge?: (stored: Record<string, unknown>, defaults: T) => T;
};

/**
 * Persist a filters object in localStorage (per user, optional scope).
 * Updates are written on change; `reset` restores defaults and clears storage.
 * Cross-tab sync uses the `storage` event only.
 */
export function usePersistedFilters<T extends Record<string, unknown>>(
  namespace: string,
  defaults: T,
  options?: UsePersistedFiltersOptions<T>
): [T, (patch: Partial<T> | ((prev: T) => T)) => void, () => void] {
  const userId = options?.userId ?? null;
  const scope = options?.scope ?? null;
  const merge = options?.merge;
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const mergeRef = useRef(merge);
  mergeRef.current = merge;

  const [filters, setFiltersState] = useState<T>(() =>
    readPersistedFilters(namespace, defaults, { userId, scope, merge })
  );

  // Re-hydrate when user/scope identity changes
  useEffect(() => {
    setFiltersState(
      readPersistedFilters(namespace, defaultsRef.current, {
        userId,
        scope,
        merge: mergeRef.current,
      })
    );
  }, [namespace, userId, scope]);

  useEffect(() => {
    writePersistedFilters(namespace, filters, { userId, scope });
  }, [namespace, userId, scope, filters]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== persistedFiltersStorageKey(namespace, userId, scope)) return;
      setFiltersState(
        readPersistedFilters(namespace, defaultsRef.current, {
          userId,
          scope,
          merge: mergeRef.current,
        })
      );
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [namespace, userId, scope]);

  const setFilters = useCallback((patch: Partial<T> | ((prev: T) => T)) => {
    setFiltersState((prev) => {
      if (typeof patch === 'function') return patch(prev);
      return { ...prev, ...patch };
    });
  }, []);

  const reset = useCallback(() => {
    clearPersistedFilters(namespace, { userId, scope });
    setFiltersState({ ...defaultsRef.current });
  }, [namespace, userId, scope]);

  return [filters, setFilters, reset];
}
