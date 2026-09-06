'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  PINNED_LIST_EVENT,
  isListItemPinned,
  pinnedListStorageKey,
  readPinnedListIds,
  setListItemPinned,
  toggleListItemPinned,
  type PinnedListIds,
  type PinnedListKind,
} from '@/lib/pinnedListItems';

/** Live per-user pinned entity ids for a list kind (localStorage). */
export function usePinnedListItems(
  kind: PinnedListKind,
  userId?: number | null
): {
  pinnedIds: PinnedListIds;
  isPinned: (entityId: number) => boolean;
  togglePinned: (entityId: number) => void;
  setPinned: (entityId: number, pinned: boolean) => void;
} {
  const [pinnedIds, setPinnedIds] = useState<PinnedListIds>([]);

  const refresh = useCallback(() => {
    setPinnedIds(readPinnedListIds(kind, userId));
  }, [kind, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: PinnedListKind; userId?: number | null }>).detail;
      if (detail?.kind && detail.kind !== kind) return;
      if (detail && detail.userId != null && userId != null && detail.userId !== userId) return;
      refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== pinnedListStorageKey(kind, userId)) return;
      refresh();
    };
    window.addEventListener(PINNED_LIST_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PINNED_LIST_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh, kind, userId]);

  const isPinned = useCallback(
    (entityId: number) => isListItemPinned(entityId, pinnedIds),
    [pinnedIds]
  );

  const togglePinned = useCallback(
    (entityId: number) => {
      setPinnedIds(toggleListItemPinned(kind, entityId, userId));
    },
    [kind, userId]
  );

  const setPinned = useCallback(
    (entityId: number, pinned: boolean) => {
      setPinnedIds(setListItemPinned(kind, entityId, pinned, userId));
    },
    [kind, userId]
  );

  return { pinnedIds, isPinned, togglePinned, setPinned };
}
