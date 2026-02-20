/**
 * Recursively computes CompletionPercentage for a flat list of tasks.
 *
 * - Leaf task  → min(100, round(TotalWorked / EstimatedHours × 100))
 *   If EstimatedHours is 0/null but work exists → 100%
 *   If nothing estimated and no work → 0%
 * - Parent task → weighted average of children by EstimatedHours
 *   Falls back to simple average if children have no estimated hours.
 *
 * The function accepts tasks where the worked-hours column may be named
 * TotalWorked (summary/ticket endpoints) or WorkedHours (project endpoint).
 */
export function computeCompletionPercentages(tasks: any[]): any[] {
  // Build lookup map (shallow copy so we don't mutate originals)
  const taskMap = new Map<number, any>();
  for (const t of tasks) {
    taskMap.set(t.Id, { ...t });
  }

  // Build parent → children map
  const childrenOf = new Map<number, number[]>();
  for (const t of tasks) {
    if (t.ParentTaskId && taskMap.has(t.ParentTaskId)) {
      if (!childrenOf.has(t.ParentTaskId)) childrenOf.set(t.ParentTaskId, []);
      childrenOf.get(t.ParentTaskId)!.push(t.Id);
    }
  }

  // Memoised recursive computation
  const memo = new Map<number, number>();

  function compute(taskId: number): number {
    if (memo.has(taskId)) return memo.get(taskId)!;

    const task = taskMap.get(taskId);
    if (!task) return 0;

    const children = childrenOf.get(taskId) || [];

    let pct: number;

    if (children.length === 0) {
      // Leaf task – based on actual time entries
      const worked = parseFloat(task.TotalWorked ?? task.WorkedHours ?? 0) || 0;
      const estimated = parseFloat(task.EstimatedHours || 0) || 0;
      if (estimated <= 0) {
        pct = worked > 0 ? 100 : 0;
      } else {
        pct = Math.min(100, Math.round((worked / estimated) * 100));
      }
    } else {
      // Parent task – weighted average by estimated hours
      let totalWeight = 0;
      let weightedSum = 0;
      for (const childId of children) {
        const child = taskMap.get(childId);
        if (!child) continue;
        const weight = parseFloat(child.EstimatedHours || 0) || 0;
        const childPct = compute(childId);
        totalWeight += weight;
        weightedSum += childPct * weight;
      }
      if (totalWeight <= 0) {
        // Equal weighting fallback
        const sum = children.reduce((s, cid) => s + compute(cid), 0);
        pct = children.length > 0 ? Math.round(sum / children.length) : 0;
      } else {
        pct = Math.round(weightedSum / totalWeight);
      }
    }

    memo.set(taskId, pct);
    return pct;
  }

  const result: any[] = [];
  for (const t of tasks) {
    const copy = taskMap.get(t.Id)!;
    copy.CompletionPercentage = compute(t.Id);
    result.push(copy);
  }
  return result;
}
