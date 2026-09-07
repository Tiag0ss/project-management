export type TaskTreeNode = {
  Id: number;
  ParentTaskId?: number | null;
};

/** True when the task has no children in `tasks`. */
export function isLeafTask(tasks: TaskTreeNode[], taskId: number): boolean {
  return !tasks.some((t) => Number(t.ParentTaskId) === Number(taskId));
}

/** Recursively collect leaf tasks under `parentTaskId` (or the node itself if leaf). */
export function getAllLeafTasks(tasks: TaskTreeNode[], parentTaskId: number): TaskTreeNode[] {
  const children = tasks.filter((t) => Number(t.ParentTaskId) === Number(parentTaskId));
  if (children.length === 0) {
    const task = tasks.find((t) => Number(t.Id) === Number(parentTaskId));
    return task ? [task] : [];
  }
  let leafTasks: TaskTreeNode[] = [];
  for (const child of children) {
    leafTasks = leafTasks.concat(getAllLeafTasks(tasks, child.Id));
  }
  return leafTasks;
}
