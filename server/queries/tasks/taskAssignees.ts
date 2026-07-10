import { pool, RowDataPacket } from '../../config/database';
import type { TaskAssigneeRow, TaskAssigneeSummary } from '../../types/tasks';

/** Populate AssigneesJson on task rows from TaskAssignees join. */
export async function populateAssigneesJson(tasks: RowDataPacket[]): Promise<void> {
  const taskIds = tasks
    .map((task) => task?.Id)
    .filter((taskId) => taskId !== null && taskId !== undefined);

  for (const task of tasks) {
    if (task.AssigneesJson === undefined || task.AssigneesJson === null) {
      task.AssigneesJson = '[]';
    }
  }

  if (taskIds.length === 0) {
    return;
  }

  const placeholders = taskIds.map(() => '?').join(',');
  const [assigneeRows] = await pool.execute<TaskAssigneeRow[]>(
    `SELECT ua.TaskId, ua.UserId, uu.Username, uu.FirstName, uu.LastName
     FROM TaskAssignees ua
     INNER JOIN Users uu ON ua.UserId = uu.Id
     WHERE ua.TaskId IN (${placeholders})
     ORDER BY ua.TaskId, ua.AssignedAt ASC`,
    taskIds
  );

  const assigneesByTask = new Map<number, TaskAssigneeSummary[]>();
  for (const row of assigneeRows) {
    const taskId = Number(row.TaskId);
    if (!assigneesByTask.has(taskId)) {
      assigneesByTask.set(taskId, []);
    }
    assigneesByTask.get(taskId)?.push({
      UserId: row.UserId,
      Username: row.Username,
      FirstName: row.FirstName,
      LastName: row.LastName,
    });
  }

  for (const task of tasks) {
    const assignees = assigneesByTask.get(Number(task.Id)) || [];
    task.AssigneesJson = JSON.stringify(assignees);
  }
}