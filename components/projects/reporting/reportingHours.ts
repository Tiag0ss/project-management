/** Leaf-only hour helpers for project reporting (avoid parent+child double-count). */

export type ReportTask = {
  Id: number;
  ParentTaskId?: number | null;
  EstimatedHours?: number | string | null;
  TotalAllocated?: number | string | null;
  TotalWorked?: number | string | null;
  [key: string]: unknown;
};

export function getSubtasks<T extends ReportTask>(tasks: T[], parentId: number): T[] {
  return tasks.filter((t) => t.ParentTaskId === parentId);
}

export function getParentTasks<T extends ReportTask>(tasks: T[]): T[] {
  return tasks.filter((t) => !t.ParentTaskId);
}

/** Tasks that have at least one child. */
export function getTaskIdsWithChildren<T extends ReportTask>(tasks: T[]): Set<number> {
  return new Set(
    tasks.filter((t) => t.ParentTaskId).map((t) => t.ParentTaskId as number)
  );
}

/** Leaf tasks only — actual work items without children. */
export function getLeafTasks<T extends ReportTask>(tasks: T[]): T[] {
  const withChildren = getTaskIdsWithChildren(tasks);
  return tasks.filter((t) => !withChildren.has(t.Id));
}

/** Recursive worked hours: leaf returns own TotalWorked; parent sums children. */
export function calculateRecursiveWorked<T extends ReportTask>(
  tasks: T[],
  taskId: number
): number {
  const subtasks = getSubtasks(tasks, taskId);

  if (subtasks.length === 0) {
    const task = tasks.find((t) => t.Id === taskId);
    return parseFloat(String(task?.TotalWorked || 0));
  }

  return subtasks.reduce(
    (sum, subtask) => sum + calculateRecursiveWorked(tasks, subtask.Id),
    0
  );
}

export function sumLeafEstimatedHours<T extends ReportTask>(tasks: T[]): number {
  return getLeafTasks(tasks).reduce(
    (sum, t) => sum + parseFloat(String(t.EstimatedHours || 0)),
    0
  );
}

export function sumParentAllocatedHours<T extends ReportTask>(tasks: T[]): number {
  return getParentTasks(tasks).reduce(
    (sum, t) => sum + parseFloat(String(t.TotalAllocated || 0)),
    0
  );
}

export function sumLeafWorkedHours<T extends ReportTask>(tasks: T[]): number {
  return getLeafTasks(tasks).reduce(
    (sum, t) => sum + parseFloat(String(t.TotalWorked || 0)),
    0
  );
}
