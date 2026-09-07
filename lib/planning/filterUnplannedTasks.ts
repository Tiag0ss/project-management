export type UnplannedTaskSearchFields = {
  TaskName?: string | null;
  ProjectName?: string | null;
  CustomerName?: string | null;
};

/** Case-insensitive match against task / project / customer labels. */
export function matchesUnplannedTaskSearch<T extends UnplannedTaskSearchFields>(
  task: T,
  query: string,
  projectName?: string | null
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  const haystack = [
    task.TaskName,
    task.ProjectName,
    projectName,
    task.CustomerName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(normalized);
}

export function filterUnplannedTasksForTray<T extends UnplannedTaskSearchFields>(
  tasks: T[],
  query: string,
  resolveProjectName?: (task: T) => string | null | undefined,
  limit = 50
): { matches: T[]; totalMatches: number; truncated: boolean } {
  const matched = tasks.filter((task) =>
    matchesUnplannedTaskSearch(task, query, resolveProjectName?.(task) ?? null)
  );
  return {
    matches: matched.slice(0, Math.max(0, limit)),
    totalMatches: matched.length,
    truncated: matched.length > limit,
  };
}
