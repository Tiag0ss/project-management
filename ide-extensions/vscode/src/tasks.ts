export interface PmTask {
  Id: number;
  ProjectId: number;
  ProjectName?: string;
  TaskName: string;
  Description?: string | null;
  StatusName?: string;
  StatusIsClosed?: number | boolean;
  StatusIsCancelled?: number | boolean;
  StatusHideFromPlanningAndStatistics?: number | boolean;
  PriorityName?: string;
  PrioritySortOrder?: number;
  DueDate?: string | null;
}

const flag = (value: unknown): boolean => Number(value) === 1 || value === true;

export function isPendingTask(task: PmTask): boolean {
  return (
    !flag(task.StatusIsClosed) &&
    !flag(task.StatusIsCancelled) &&
    !flag(task.StatusHideFromPlanningAndStatistics)
  );
}

function dueDay(dueDate: string | null | undefined): number | null {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function todayDay(): number {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

export function compareTasks(a: PmTask, b: PmTask): number {
  const today = todayDay();
  const aDue = dueDay(a.DueDate);
  const bDue = dueDay(b.DueDate);
  const aOverdue = aDue !== null && aDue < today ? 0 : 1;
  const bOverdue = bDue !== null && bDue < today ? 0 : 1;
  if (aOverdue !== bOverdue) return aOverdue - bOverdue;

  if (aDue === null && bDue !== null) return 1;
  if (aDue !== null && bDue === null) return -1;
  if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;

  const aPri = a.PrioritySortOrder ?? 9999;
  const bPri = b.PrioritySortOrder ?? 9999;
  if (aPri !== bPri) return aPri - bPri;

  return String(a.TaskName || '').localeCompare(String(b.TaskName || ''), undefined, {
    sensitivity: 'base',
  });
}

export function groupByProject(tasks: PmTask[]): Map<string, PmTask[]> {
  const map = new Map<string, PmTask[]>();
  for (const task of tasks) {
    const key = String(task.ProjectName || `Project #${task.ProjectId}`).trim() || `Project #${task.ProjectId}`;
    const list = map.get(key) || [];
    list.push(task);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort(compareTasks);
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
}
