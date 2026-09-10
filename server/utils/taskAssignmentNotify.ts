/**
 * Whether to email/notify a user about being assigned to a task.
 * Skips self-assignment and people already on the task (primary or extra assignee).
 */
export function shouldNotifyTaskAssignee(params: {
  actorUserId: number | null | undefined;
  assigneeUserId: number | null | undefined;
  alreadyOnTask: boolean;
}): boolean {
  const assignee = Number(params.assigneeUserId);
  if (!Number.isFinite(assignee) || assignee <= 0) return false;
  const actor = Number(params.actorUserId);
  if (Number.isFinite(actor) && actor === assignee) return false;
  if (params.alreadyOnTask) return false;
  return true;
}
