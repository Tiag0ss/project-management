'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  RECENT_NAV_EXPANDED_EVENT,
  defaultRecentNavExpanded,
  readRecentNavExpanded,
  recentNavExpandedStorageKey,
  setRecentNavExpanded,
  toggleRecentNavExpanded,
  type RecentNavExpandedState,
  type RecentNavKind,
} from '@/lib/recentNavAccess';

/** Live expand/collapse flags for sidebar recent groups (localStorage; survives re-login). */
export function useRecentNavExpanded(userId?: number | null): {
  expanded: RecentNavExpandedState;
  setExpanded: (kind: RecentNavKind, value: boolean) => void;
  toggleExpanded: (kind: RecentNavKind) => void;
} {
  const [expanded, setExpandedState] = useState<RecentNavExpandedState>(() => defaultRecentNavExpanded());

  const refresh = useCallback(() => {
    setExpandedState(readRecentNavExpanded(userId));
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
      if (event.key && event.key !== recentNavExpandedStorageKey(userId)) return;
      refresh();
    };
    window.addEventListener(RECENT_NAV_EXPANDED_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(RECENT_NAV_EXPANDED_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh, userId]);

  const setExpanded = useCallback(
    (kind: RecentNavKind, value: boolean) => {
      setExpandedState(setRecentNavExpanded(kind, value, userId));
    },
    [userId]
  );

  const toggleExpanded = useCallback(
    (kind: RecentNavKind) => {
      setExpandedState(toggleRecentNavExpanded(kind, userId));
    },
    [userId]
  );

  return { expanded, setExpanded, toggleExpanded };
}
