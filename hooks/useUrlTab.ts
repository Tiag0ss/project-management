'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type UseUrlTabOptions = {
  /** Query param name. Default: `tab`. */
  param?: string;
  /** Extra query keys to remove whenever the tab changes. */
  clearParamsOnChange?: string[];
};

/**
 * Syncs an allow-listed tab value with `?tab=` so refresh / share restore the active panel.
 * Always writes the param (including the default) so a hard refresh keeps the selection.
 */
export function useUrlTab<T extends string>(
  validTabs: readonly T[],
  defaultTab: T,
  options?: UseUrlTabOptions
): [T, (tab: T) => void] {
  const param = options?.param ?? 'tab';
  const clearParamsOnChange = options?.clearParamsOnChange;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const validSet = useMemo(() => new Set<string>(validTabs), [validTabs]);

  const parseTab = useCallback(
    (value: string | null): T =>
      value && validSet.has(value) ? (value as T) : defaultTab,
    [defaultTab, validSet]
  );

  const [activeTab, setActiveTabState] = useState<T>(() =>
    parseTab(searchParams.get(param))
  );

  useEffect(() => {
    const next = parseTab(searchParams.get(param));
    setActiveTabState((prev) => (prev === next ? prev : next));
  }, [searchParams, param, parseTab]);

  const setActiveTab = useCallback(
    (tab: T) => {
      if (!validSet.has(tab)) return;
      setActiveTabState(tab);
      const params = new URLSearchParams(searchParams.toString());
      params.set(param, tab);
      for (const key of clearParamsOnChange ?? []) {
        params.delete(key);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [clearParamsOnChange, param, pathname, router, searchParams, validSet]
  );

  return [activeTab, setActiveTab];
}
