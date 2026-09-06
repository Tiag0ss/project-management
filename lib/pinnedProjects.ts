/**
 * @deprecated Prefer `@/lib/pinnedListItems` with kind `'projects'`.
 * Thin compatibility wrappers so existing project-list imports keep working.
 */

export {
  compareWithPinnedFirst,
  parsePinnedListIds as parsePinnedProjectIds,
  type PinnedListIds as PinnedProjectIds,
} from '@/lib/pinnedListItems';

import {
  PINNED_LIST_EVENT,
  isListItemPinned,
  pinnedListStorageKey,
  readPinnedListIds,
  setListItemPinned,
  toggleListItemPinned,
  type PinnedListIds,
} from '@/lib/pinnedListItems';

const KIND = 'projects' as const;

export const PINNED_PROJECTS_EVENT = PINNED_LIST_EVENT;

export function pinnedProjectsStorageKey(userId?: number | null): string {
  return pinnedListStorageKey(KIND, userId);
}

export function readPinnedProjectIds(userId?: number | null): PinnedListIds {
  return readPinnedListIds(KIND, userId);
}

export function isProjectPinned(projectId: number, pinnedIds: PinnedListIds): boolean {
  return isListItemPinned(projectId, pinnedIds);
}

export function setProjectPinned(
  projectId: number,
  pinned: boolean,
  userId?: number | null
): PinnedListIds {
  return setListItemPinned(KIND, projectId, pinned, userId);
}

export function toggleProjectPinned(projectId: number, userId?: number | null): PinnedListIds {
  return toggleListItemPinned(KIND, projectId, userId);
}
