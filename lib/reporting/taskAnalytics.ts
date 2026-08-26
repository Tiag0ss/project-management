export type TaskAnalyticsSlice = {
  key: string;
  label: string;
  value: number;
  color?: string;
};

export type TaskAnalyticsParentProgress = {
  id: number | null;
  label: string;
  done: number;
  inProgress: number;
  todo: number;
};

export type TaskAnalyticsData = {
  priorityBreakdown: TaskAnalyticsSlice[];
  typesOfWork: TaskAnalyticsSlice[];
  teamWorkload: TaskAnalyticsSlice[];
  parentProgress: TaskAnalyticsParentProgress[];
};

export type TaskAnalyticsTaskLike = {
  Id: number;
  TaskName?: string;
  ParentTaskId?: number | null;
  Priority?: number | null;
  PriorityName?: string | null;
  PriorityColor?: string | null;
  PrioritySortOrder?: number | null;
  TaskType?: number | null;
  TaskTypeName?: string | null;
  TaskTypeColor?: string | null;
  AssignedTo?: number | null;
  AssigneeName?: string | null;
  StatusIsClosed?: number | boolean | null;
  StatusIsCancelled?: number | boolean | null;
  StatusName?: string | null;
};

const DEFAULT_COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#4b5563'];

function isTruthyFlag(value: number | boolean | string | null | undefined): boolean {
  return value === true || value === 1 || value === '1';
}

function isClosed(task: TaskAnalyticsTaskLike): boolean {
  return isTruthyFlag(task.StatusIsClosed);
}

function isCancelled(task: TaskAnalyticsTaskLike): boolean {
  return isTruthyFlag(task.StatusIsCancelled);
}

function isOpen(task: TaskAnalyticsTaskLike): boolean {
  return !isClosed(task) && !isCancelled(task);
}

function isInProgress(task: TaskAnalyticsTaskLike): boolean {
  if (!isOpen(task)) return false;
  const name = String(task.StatusName || '').toLowerCase();
  if (!name || name === 'to do' || name === 'todo' || name === 'backlog') return false;
  return true;
}

function statusBucket(task: TaskAnalyticsTaskLike): 'done' | 'inProgress' | 'todo' {
  if (isClosed(task)) return 'done';
  if (isCancelled(task)) return 'todo';
  if (isInProgress(task)) return 'inProgress';
  return 'todo';
}

function topNWithOther(
  entries: Array<{ key: string; label: string; value: number; color?: string }>,
  limit: number
): TaskAnalyticsSlice[] {
  const sorted = [...entries].filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit - 1);
  const otherValue = sorted.slice(limit - 1).reduce((sum, e) => sum + e.value, 0);
  if (otherValue > 0) {
    head.push({ key: 'other', label: 'Other', value: otherValue, color: '#9ca3af' });
  }
  return head;
}

/** Build task analytics widgets from an in-memory task list (project overview). */
export function buildTaskAnalytics(tasks: TaskAnalyticsTaskLike[]): TaskAnalyticsData {
  const priorityMap = new Map<string, TaskAnalyticsSlice & { sort: number }>();
  const typeMap = new Map<string, TaskAnalyticsSlice>();
  const workloadMap = new Map<string, TaskAnalyticsSlice>();

  for (const task of tasks) {
    const priorityKey = task.Priority != null ? String(task.Priority) : 'unset';
    const priorityLabel = task.PriorityName?.trim() || 'Unset';
    const existingPriority = priorityMap.get(priorityKey);
    if (existingPriority) {
      existingPriority.value += 1;
    } else {
      priorityMap.set(priorityKey, {
        key: priorityKey,
        label: priorityLabel,
        value: 1,
        color: task.PriorityColor || undefined,
        sort: Number(task.PrioritySortOrder ?? (task.Priority == null ? 9999 : task.Priority)),
      });
    }

    const typeKey = task.TaskType != null ? String(task.TaskType) : 'unset';
    const typeLabel = task.TaskTypeName?.trim() || 'Unset';
    const existingType = typeMap.get(typeKey);
    if (existingType) {
      existingType.value += 1;
    } else {
      typeMap.set(typeKey, {
        key: typeKey,
        label: typeLabel,
        value: 1,
        color: task.TaskTypeColor || undefined,
      });
    }

    if (isOpen(task)) {
      const assigneeKey = task.AssignedTo != null ? String(task.AssignedTo) : 'unassigned';
      const assigneeLabel = task.AssignedTo != null ? task.AssigneeName?.trim() || `User #${task.AssignedTo}` : 'Unassigned';
      const existingAssignee = workloadMap.get(assigneeKey);
      if (existingAssignee) {
        existingAssignee.value += 1;
      } else {
        workloadMap.set(assigneeKey, {
          key: assigneeKey,
          label: assigneeLabel,
          value: 1,
          color: assigneeKey === 'unassigned' ? '#9ca3af' : '#2563eb',
        });
      }
    }
  }

  const priorityBreakdown = [...priorityMap.values()]
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
    .map(({ sort: _sort, ...rest }, index) => ({
      ...rest,
      color: rest.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    }));

  const typesOfWork = topNWithOther([...typeMap.values()], 6).map((row, index) => ({
    ...row,
    color: row.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
  }));

  const teamWorkload = topNWithOther([...workloadMap.values()], 8);

  const childIds = new Set(tasks.filter((t) => t.ParentTaskId != null).map((t) => Number(t.ParentTaskId)));
  const parents = tasks.filter((t) => t.ParentTaskId == null && childIds.has(t.Id));
  const childrenByParent = new Map<number, TaskAnalyticsTaskLike[]>();
  for (const task of tasks) {
    if (task.ParentTaskId == null) continue;
    const parentId = Number(task.ParentTaskId);
    const list = childrenByParent.get(parentId) || [];
    list.push(task);
    childrenByParent.set(parentId, list);
  }

  let parentProgress: TaskAnalyticsParentProgress[] = parents
    .map((parent) => {
      const children = childrenByParent.get(parent.Id) || [];
      let done = 0;
      let inProgress = 0;
      let todo = 0;
      for (const child of children) {
        const bucket = statusBucket(child);
        if (bucket === 'done') done += 1;
        else if (bucket === 'inProgress') inProgress += 1;
        else todo += 1;
      }
      return {
        id: parent.Id,
        label: parent.TaskName || `Task #${parent.Id}`,
        done,
        inProgress,
        todo,
      };
    })
    .filter((row) => row.done + row.inProgress + row.todo > 0)
    .sort((a, b) => b.done + b.inProgress + b.todo - (a.done + a.inProgress + a.todo))
    .slice(0, 8);

  if (parentProgress.length === 0 && tasks.length > 0) {
    let done = 0;
    let inProgress = 0;
    let todo = 0;
    for (const task of tasks) {
      const bucket = statusBucket(task);
      if (bucket === 'done') done += 1;
      else if (bucket === 'inProgress') inProgress += 1;
      else todo += 1;
    }
    parentProgress = [{ id: null, label: 'All tasks', done, inProgress, todo }];
  }

  return {
    priorityBreakdown,
    typesOfWork,
    teamWorkload,
    parentProgress,
  };
}
