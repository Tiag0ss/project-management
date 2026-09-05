/** Leaf task missing plan dates — excludes Unscheduled Work (never planned by design). */
export type UnplannedTaskLike = {
  Id: number;
  ParentTaskId?: number | null;
  PlannedStartDate?: string | null;
  PlannedEndDate?: string | null;
  UnscheduledWork?: number | boolean | null;
  StatusIsClosed?: number | boolean | null;
  StatusIsCancelled?: number | boolean | null;
};

/**
 * Returns true for open leaf tasks that still need planning.
 * Parent tasks are never unplanned themselves — planning is judged on leaves.
 * UnscheduledWork tasks are excluded: they cannot receive allocations.
 */
export function isUnplannedLeafTask(
  task: UnplannedTaskLike,
  allTasks: Array<Pick<UnplannedTaskLike, 'Id' | 'ParentTaskId'>>,
  options?: { excludeClosed?: boolean }
): boolean {
  if (Number(task.UnscheduledWork || 0) === 1) return false;

  const excludeClosed = options?.excludeClosed !== false;
  if (
    excludeClosed &&
    (Number(task.StatusIsClosed || 0) === 1 || Number(task.StatusIsCancelled || 0) === 1)
  ) {
    return false;
  }

  const hasChildren = allTasks.some((child) => Number(child.ParentTaskId) === Number(task.Id));
  if (hasChildren) return false;

  if (task.PlannedStartDate && task.PlannedEndDate) return false;
  return true;
}
