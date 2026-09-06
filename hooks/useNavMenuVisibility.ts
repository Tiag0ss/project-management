'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  NAV_MENU_VISIBILITY_EVENT,
  isNavItemUserVisible,
  navMenuVisibilityStorageKey,
  readNavMenuHidden,
  setNavMenuItemHidden,
  type NavMenuHiddenState,
} from '@/lib/navMenuVisibility';

/** Live per-user hidden sidebar menus (localStorage; survives re-login). */
export function useNavMenuVisibility(userId?: number | null): {
  hidden: NavMenuHiddenState;
  isVisible: (href: string) => boolean;
  setHidden: (href: string, hide: boolean) => void;
} {
  const [hidden, setHiddenState] = useState<NavMenuHiddenState>([]);

  const refresh = useCallback(() => {
    setHiddenState(readNavMenuHidden(userId));
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
      if (event.key && event.key !== navMenuVisibilityStorageKey(userId)) return;
      refresh();
    };
    window.addEventListener(NAV_MENU_VISIBILITY_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(NAV_MENU_VISIBILITY_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh, userId]);

  const isVisible = useCallback((href: string) => isNavItemUserVisible(href, hidden), [hidden]);

  const setHidden = useCallback(
    (href: string, hide: boolean) => {
      setHiddenState(setNavMenuItemHidden(href, hide, userId));
    },
    [userId]
  );

  return { hidden, isVisible, setHidden };
}
