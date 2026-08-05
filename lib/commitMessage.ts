/**
 * Default git commit message for a PM task.
 * Includes Task #<Id> so commit history matching can link commits back.
 */
export function formatTaskCommitMessage(task: {
  Id: number | string;
  TaskName?: string | null;
}): string {
  const id = Number(task.Id);
  const name = String(task.TaskName || '').trim();
  const tag = Number.isFinite(id) && id > 0 ? `Task #${id}` : 'Task #';
  if (!name) return tag;
  return `${tag} - ${name}`;
}
