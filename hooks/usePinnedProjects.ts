'use client';

import { usePinnedListItems } from '@/hooks/usePinnedListItems';

/** @deprecated Prefer `usePinnedListItems('projects', userId)`. */
export function usePinnedProjects(userId?: number | null) {
  return usePinnedListItems('projects', userId);
}
