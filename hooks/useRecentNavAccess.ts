'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  RECENT_NAV_EVENT,
  emptyRecentNavAccess,
  readRecentNavAccess,
  recentNavStorageKey,
  type RecentNavAccessState,
} from '@/lib/recentNavAccess';

/** Live recent nav entries for the sidebar (localStorage + cross-tab + same-tab events). */
export function useRecentNavAccess(userId?: number | null): RecentNavAccessState {
  const [state, setState] = useState<RecentNavAccessState>(() => emptyRecentNavAccess());

  const refresh = useCallback(() => {
    setState(readRecentNavAccess(userId));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: number | null }>).detail;
      if (detail && detail.userId != null && userId != null && detail.userId !== userId) return;
      refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== recentNavStorageKey(userId)) return;
      refresh();
    };
    window.addEventListener(RECENT_NAV_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(RECENT_NAV_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh, userId]);

  return state;
}
