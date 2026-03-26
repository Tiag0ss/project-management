import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { createNotification } from './notifications';
import { prepareCustomFieldData } from '../utils/customFields';
import { logActivity } from './activityLogs';
import { sanitizeRichText } from '../utils/sanitize';
import { computeCompletionPercentages } from '../utils/taskCompletion';
import { sendNotificationEmail } from '../utils/emailService';
import { resolveHistoryValues } from '../utils/changeLog';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Tasks
 *   description: Task management endpoints
 */

// Normalize any date value to YYYY-MM-DD for MySQL DATE columns
function toDateOnly(value: any): string | null {
  if (!value) return null;
  const s = String(value);
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // ISO/datetime string — take the date part
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// Helper function to normalize dates to YYYY-MM-DD format for MySQL DATE columns
const normalizeDateForDB = (dateValue: any): string | null => {
  if (!dateValue) return null;
  if (typeof dateValue === 'string') {
    return dateValue.split('T')[0]; // Extract YYYY-MM-DD from ISO string
  }
  if (dateValue instanceof Date) {
    // Use local date components to avoid timezone shift
    const d = dateValue;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return dateValue;
};

const toBooleanFlag = (value: any): number => {
  if (value === true || value === 1 || value === '1') return 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === 'on') return 1;
  }
  return 0;
};

const hasMeaningfulText = (value: any): boolean => {
  if (value === null || value === undefined) return false;
  const normalized = String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 0;
};

const syncTaskPrimaryAssignee = async (
  taskId: number,
  assigneeId: any,
  assignedBy: number | null | undefined
): Promise<void> => {
  const normalizedAssigneeId = assigneeId === null || assigneeId === undefined ? null : Number(assigneeId);
  if (!normalizedAssigneeId) return;

  await pool.execute(
    `INSERT IGNORE INTO TaskAssignees (TaskId, UserId, AssignedBy) VALUES (?, ?, ?)`,
    [taskId, normalizedAssigneeId, assignedBy || null]
  );
};

// Convert Jira description payloads (plain text, JSON string, or Atlassian Document Format) to HTML for RichTextEditor
const normalizeJiraDescription = (value: any): string => {
  const escapeHtml = (text: string): string => {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const wrapTextAsHtml = (text: string): string => {
    const trimmed = text.trim();
    if (!trimmed) return '';

    const paragraphs = trimmed
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`);

    return paragraphs.join('');
  };

  const applyMarks = (html: string, marks: any[] | undefined): string => {
    if (!marks || !Array.isArray(marks)) return html;

    return marks.reduce((acc, mark) => {
      const type = mark?.type;
      if (type === 'strong') return `<strong>${acc}</strong>`;
      if (type === 'em') return `<em>${acc}</em>`;
      if (type === 'underline') return `<u>${acc}</u>`;
      if (type === 'code') return `<code>${acc}</code>`;
      if (type === 'link' && mark?.attrs?.href) {
        const href = escapeHtml(String(mark.attrs.href));
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${acc}</a>`;
      }
      return acc;
    }, html);
  };

  const extractAdfHtml = (node: any): string => {
    if (!node) return '';

    if (Array.isArray(node)) {
      return node.map(extractAdfHtml).join('');
    }

    if (typeof node === 'string') {
      return escapeHtml(node);
    }

    if (typeof node !== 'object') {
      return '';
    }

    if (node.type === 'text') {
      return applyMarks(escapeHtml(String(node.text || '')), node.marks);
    }

    if (node.type === 'hardBreak') {
      return '<br/>';
    }

    if (node.type === 'paragraph') {
      const inner = extractAdfHtml(node.content || []);
      return `<p>${inner || '<br/>'}</p>`;
    }

    if (node.type === 'heading') {
      const level = Math.max(1, Math.min(6, Number(node?.attrs?.level || 1)));
      const inner = extractAdfHtml(node.content || []);
      return `<h${level}>${inner}</h${level}>`;
    }

    if (node.type === 'bulletList') {
      return `<ul>${extractAdfHtml(node.content || [])}</ul>`;
    }

    if (node.type === 'orderedList') {
      return `<ol>${extractAdfHtml(node.content || [])}</ol>`;
    }

    if (node.type === 'listItem') {
      return `<li>${extractAdfHtml(node.content || [])}</li>`;
    }

    if (node.type === 'blockquote') {
      return `<blockquote>${extractAdfHtml(node.content || [])}</blockquote>`;
    }

    if (node.type === 'codeBlock') {
      const code = extractAdfHtml(node.content || []);
      return `<pre><code>${code}</code></pre>`;
    }

    if (node.content) {
      return extractAdfHtml(node.content);
    }

    return '';
  };

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        const htmlFromJson = extractAdfHtml(parsed).trim();
        return htmlFromJson || wrapTextAsHtml(trimmed);
      } catch {
        return wrapTextAsHtml(trimmed);
      }
    }

    return wrapTextAsHtml(trimmed);
  }

  if (typeof value === 'object') {
    const htmlFromObject = extractAdfHtml(value).trim();
    return htmlFromObject || '';
  }

  return wrapTextAsHtml(String(value));
};

// Helper function to create task history entry
const createTaskHistory = async (
  taskId: number,
  userId: number,
  action: string,
  fieldName: string | null,
  oldValue: string | null,
  newValue: string | null
) => {
  try {
    const resolved = await resolveHistoryValues('task', fieldName, oldValue, newValue);
    await pool.execute(
      `INSERT INTO TaskHistory (TaskId, UserId, Action, FieldName, OldValue, NewValue) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [taskId, userId, action, fieldName, resolved.oldValue, resolved.newValue]
    );
  } catch (error) {
    console.error('Error creating task history:', error);
  }
};

// Parse AssigneesJson column returned by MySQL JSON_ARRAYAGG
function parseAssigneesJson(tasks: any[]): any[] {
  return tasks.map(t => {
    let assignees: any[] = [];
    if (t.AssigneesJson) {
      try {
        assignees = typeof t.AssigneesJson === 'string' ? JSON.parse(t.AssigneesJson) : t.AssigneesJson;
      } catch {
        assignees = [];
      }
    }
    return { ...t, Assignees: assignees ?? [] };
  });
}

function parseTaskTagsJson(tasks: any[]): any[] {
  return tasks.map((task) => {
    let taskTags: any[] = [];
    if (task.TaskTagsJson) {
      try {
        taskTags = typeof task.TaskTagsJson === 'string' ? JSON.parse(task.TaskTagsJson) : task.TaskTagsJson;
      } catch {
        taskTags = [];
      }
    }

    return {
      ...task,
      TaskTags: Array.isArray(taskTags) ? taskTags : [],
    };
  });
}

async function populateAssigneesJson(tasks: any[]): Promise<void> {
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
  const [assigneeRows] = await pool.execute<RowDataPacket[]>(
    `SELECT ua.TaskId, ua.UserId, uu.Username, uu.FirstName, uu.LastName
     FROM TaskAssignees ua
     INNER JOIN Users uu ON ua.UserId = uu.Id
     WHERE ua.TaskId IN (${placeholders})
     ORDER BY ua.TaskId, ua.AssignedAt ASC`,
    taskIds
  );

  const assigneesByTask = new Map<number, any[]>();
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

async function populateTaskTagsJson(tasks: any[]): Promise<void> {
  const taskIds = tasks
    .map((task) => task?.Id)
    .filter((taskId) => taskId !== null && taskId !== undefined);

  for (const task of tasks) {
    if (task.TaskTagsJson === undefined || task.TaskTagsJson === null) {
      task.TaskTagsJson = '[]';
    }
  }

  if (taskIds.length === 0) {
    return;
  }

  const placeholders = taskIds.map(() => '?').join(',');
  const [tagRows] = await pool.execute<RowDataPacket[]>(
    `SELECT tt.TaskId, t.Id as TagId, t.Name as TagName, t.Color as TagColor
     FROM TaskTags tt
     INNER JOIN Tags t ON t.Id = tt.TagId
     WHERE tt.TaskId IN (${placeholders})
     ORDER BY tt.TaskId ASC, t.Name ASC`,
    taskIds
  );

  const tagsByTask = new Map<number, Array<{ Id: number; Name: string; Color: string | null }>>();
  for (const row of tagRows) {
    const taskId = Number(row.TaskId);
    if (!tagsByTask.has(taskId)) {
      tagsByTask.set(taskId, []);
    }

    tagsByTask.get(taskId)?.push({
      Id: Number(row.TagId),
      Name: String(row.TagName || ''),
      Color: row.TagColor ? String(row.TagColor) : null,
    });
  }

  for (const task of tasks) {
    const tags = tagsByTask.get(Number(task.Id)) || [];
    task.TaskTagsJson = JSON.stringify(tags);
  }
}

// Helper to get project info for a task
const getTaskProjectInfo = async (taskId: number): Promise<{ projectId: number; projectName: string } | null> => {
  try {
    const [result] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id as projectId, p.ProjectName as projectName 
       FROM Tasks t 
       JOIN Projects p ON t.ProjectId = p.Id 
       WHERE t.Id = ?`,
      [taskId]
    );
    return result.length > 0 ? { projectId: result[0].projectId, projectName: result[0].projectName } : null;
  } catch {
    return null;
  }
};

const DEFAULT_TASK_TYPES = [
  { name: 'Feature', color: '#3b82f6', order: 1, isDefault: 1 },
  { name: 'Bug', color: '#ef4444', order: 2, isDefault: 0 },
  { name: 'Improvement', color: '#f59e0b', order: 3, isDefault: 0 },
  { name: 'Chore', color: '#6b7280', order: 4, isDefault: 0 },
];

const ensureTaskTypesForOrg = async (organizationId: number): Promise<RowDataPacket[]> => {
  const [taskTypes] = await pool.execute<RowDataPacket[]>(
    'SELECT Id, TypeName, IsDefault, SortOrder FROM TaskTypeValues WHERE OrganizationId = ? ORDER BY SortOrder ASC, Id ASC',
    [organizationId]
  );

  if (taskTypes.length > 0) return taskTypes;

  for (const type of DEFAULT_TASK_TYPES) {
    await pool.execute(
      `INSERT INTO TaskTypeValues (OrganizationId, TypeName, ColorCode, SortOrder, IsDefault)
       VALUES (?, ?, ?, ?, ?)`,
      [organizationId, type.name, type.color, type.order, type.isDefault]
    );
  }

  const [newTaskTypes] = await pool.execute<RowDataPacket[]>(
    'SELECT Id, TypeName, IsDefault, SortOrder FROM TaskTypeValues WHERE OrganizationId = ? ORDER BY SortOrder ASC, Id ASC',
    [organizationId]
  );

  return newTaskTypes;
};

/**
 * @swagger
 * /api/tasks/my-tasks:
 *   get:
 *     summary: Get tasks assigned to current user
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tasks assigned to current user
 */
// Get all tasks assigned to current user across all organizations
router.get('/my-tasks', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Get all tasks assigned to this user or tasks with subtasks allocated to them
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT t.*, 
              p.ProjectName,
              COALESCE(tc.ExternalName, tc.Name, pc.ExternalName, pc.Name) as CustomerName,
              COALESCE(pc.ExternalName, pc.Name) as ProjectCustomerName,
              p.IsHobby,
              u1.Username as CreatorName,
              u2.Username as AssigneeName,
              depTask.TaskName as DependsOnTaskName,
              tsv.StatusName, tsv.ColorCode as StatusColor,
              COALESCE(tsv.IsClosed, 0) as StatusIsClosed, COALESCE(tsv.IsCancelled, 0) as StatusIsCancelled,
              COALESCE(tsv.HideFromPlanningAndStatistics, 0) as StatusHideFromPlanningAndStatistics,
              tpv.PriorityName, tpv.ColorCode as PriorityColor, tpv.SortOrder as PrioritySortOrder,
              ttv.TypeName as TaskTypeName, ttv.ColorCode as TaskTypeColor,
              COALESCE((SELECT COUNT(*) FROM Tasks st WHERE st.ParentTaskId = t.Id), 0) as SubtaskCount,
              COALESCE((SELECT SUM(Hours) FROM TimeEntries WHERE TaskId = t.Id), 0) as TotalWorked,
              tk.Id as TicketIdRef,
              tk.TicketNumber,
              tk.Title as TicketTitle,
              tk.ExternalTicketId,
              oji.JiraUrl,
              '[]' as AssigneesJson,
              '[]' as TaskTagsJson
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
       LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
      LEFT JOIN Customers tc ON t.CustomerId = tc.Id
      LEFT JOIN Customers pc ON p.CustomerId = pc.Id
       LEFT JOIN Tasks depTask ON t.DependsOnTaskId = depTask.Id
       LEFT JOIN TaskAllocations ta ON t.Id = ta.TaskId
       LEFT JOIN Tickets tk ON t.TicketId = tk.Id
       LEFT JOIN OrganizationJiraIntegrations oji ON tk.OrganizationId = oji.OrganizationId AND oji.IsEnabled = 1
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
      LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
       WHERE (t.AssignedTo = ? OR ta.UserId = ? OR EXISTS (
         SELECT 1 FROM TaskAssignees WHERE TaskId = t.Id AND UserId = ?
       ) OR EXISTS (
         SELECT 1 FROM Tasks st WHERE st.ParentTaskId = t.Id
       )) AND om.UserId = ?
       ORDER BY p.IsHobby ASC, t.PlannedStartDate DESC, t.CreatedAt DESC`,
      [userId, userId, userId, userId]
    );

    await populateAssigneesJson(tasks);
    await populateTaskTagsJson(tasks);

    res.json({
      success: true,
      tasks: computeCompletionPercentages(parseTaskTagsJson(parseAssigneesJson(tasks)))
    });
  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch tasks' 
    });
  }
});

/**
 * @swagger
 * /api/tasks/project/{projectId}/summary:
 *   get:
 *     summary: Get task summary for a project (counts by status/priority)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Task summary with counts by status and priority
 */
// Get all tasks for a project with summary (total allocated and worked hours)
router.get('/project/:projectId/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = req.params.projectId;

    // Verify user has access to this project
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found or access denied' 
      });
    }

    // Get tasks with aggregated allocations and time entries using subqueries to avoid cartesian product
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        t.*,
        u1.Username as CreatorName,
        u2.Username as AssigneeName,
        tsv.StatusName, tsv.ColorCode as StatusColor,
        COALESCE(tsv.IsClosed, 0) as StatusIsClosed, COALESCE(tsv.IsCancelled, 0) as StatusIsCancelled,
        tpv.PriorityName, tpv.ColorCode as PriorityColor,
        ttv.TypeName as TaskTypeName, ttv.ColorCode as TaskTypeColor,
        COALESCE(alloc.TotalAllocated, 0) as TotalAllocated,
        COALESCE(workedAgg.TotalWorked, 0) as TotalWorked,
        '[]' as AssigneesJson
       FROM Tasks t
       LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
       LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
      LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
       LEFT JOIN (
         SELECT TaskId, SUM(AllocatedHours) as TotalAllocated
         FROM TaskAllocations
         GROUP BY TaskId
       ) AS alloc ON t.Id = alloc.TaskId
       LEFT JOIN (
         SELECT TaskId, SUM(Hours) as TotalWorked
         FROM TimeEntries
         GROUP BY TaskId
       ) AS workedAgg ON t.Id = workedAgg.TaskId
       WHERE t.ProjectId = ?
       ORDER BY t.DisplayOrder, t.CreatedAt DESC`,
      [projectId]
    );

    await populateAssigneesJson(tasks);

    res.json({
      success: true,
      tasks: computeCompletionPercentages(parseAssigneesJson(tasks))
    });
  } catch (error) {
    console.error('Get project tasks summary error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch tasks summary' 
    });
  }
});

/**
 * @swagger
 * /api/tasks/project/{projectId}:
 *   get:
 *     summary: Get all tasks for a project (with subtasks)
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: List of tasks for the project including subtask hierarchy
 */
// Get all tasks for a project
router.get('/project/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = req.params.projectId;

    // Verify user has access to this project and check permissions
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.OrganizationId, COALESCE(pg.CanManageTasks, 0) as CanManageTasks, COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks, om.Role
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found or access denied' 
      });
    }

    // Check if user can manage tasks (see all) or plan tasks (see all) or only their own
    const canManageTasks = access[0].Role === 'Owner' || access[0].Role === 'Admin' || access[0].CanManageTasks === 1;
    const canPlanTasks = canManageTasks || access[0].CanPlanTasks === 1;

    let tasks;
    if (canPlanTasks) {
      // Can see all tasks (either manage or plan permission)
      const [allTasks] = await pool.execute<RowDataPacket[]>(
          `SELECT t.*, 
              p.ProjectName,
            COALESCE(tc.ExternalName, tc.Name, pc.ExternalName, pc.Name) as CustomerName,
                u1.Username as CreatorName,
                u2.Username as AssigneeName,
                depTask.TaskName as DependsOnTaskName,
                tsv.StatusName, tsv.ColorCode as StatusColor,
                COALESCE(tsv.IsClosed, 0) as StatusIsClosed, COALESCE(tsv.IsCancelled, 0) as StatusIsCancelled,
                COALESCE(tsv.HideFromPlanningAndStatistics, 0) as StatusHideFromPlanningAndStatistics,
                tpv.PriorityName, tpv.ColorCode as PriorityColor, tpv.SortOrder as PrioritySortOrder,
                ttv.TypeName as TaskTypeName, ttv.ColorCode as TaskTypeColor,
                COALESCE(alloc.TotalAllocated, 0) as PlannedHours,
                COALESCE(workedAgg.TotalWorked, 0) as WorkedHours,
                tk.Id as TicketIdRef,
                tk.TicketNumber,
                tk.Title as TicketTitle,
                tk.ExternalTicketId,
                oji.JiraUrl,
                t.JiraIssueKey,
                '[]' as AssigneesJson
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
         LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
         LEFT JOIN Customers tc ON t.CustomerId = tc.Id
         LEFT JOIN Customers pc ON p.CustomerId = pc.Id
         LEFT JOIN Tasks depTask ON t.DependsOnTaskId = depTask.Id
         LEFT JOIN Tickets tk ON t.TicketId = tk.Id
         LEFT JOIN OrganizationJiraIntegrations oji ON tk.OrganizationId = oji.OrganizationId AND oji.IsEnabled = 1
         LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
         LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
         LEFT JOIN (
           SELECT TaskId, SUM(AllocatedHours) as TotalAllocated
           FROM TaskAllocations
           GROUP BY TaskId
         ) AS alloc ON t.Id = alloc.TaskId
         LEFT JOIN (
           SELECT TaskId, SUM(Hours) as TotalWorked
           FROM TimeEntries
           GROUP BY TaskId
         ) AS workedAgg ON t.Id = workedAgg.TaskId
         WHERE t.ProjectId = ?
         ORDER BY t.CreatedAt DESC`,
        [projectId]
      );
      tasks = allTasks;
    } else {
      // Can only see tasks assigned to them
      const [myTasks] = await pool.execute<RowDataPacket[]>(
          `SELECT t.*, 
              p.ProjectName,
            COALESCE(tc.ExternalName, tc.Name, pc.ExternalName, pc.Name) as CustomerName,
                u1.Username as CreatorName,
                u2.Username as AssigneeName,
                depTask.TaskName as DependsOnTaskName,
                tsv.StatusName, tsv.ColorCode as StatusColor,
                COALESCE(tsv.IsClosed, 0) as StatusIsClosed, COALESCE(tsv.IsCancelled, 0) as StatusIsCancelled,
                COALESCE(tsv.HideFromPlanningAndStatistics, 0) as StatusHideFromPlanningAndStatistics,
                tpv.PriorityName, tpv.ColorCode as PriorityColor, tpv.SortOrder as PrioritySortOrder,
                ttv.TypeName as TaskTypeName, ttv.ColorCode as TaskTypeColor,
                COALESCE(alloc.TotalAllocated, 0) as PlannedHours,
                COALESCE(workedAgg.TotalWorked, 0) as WorkedHours,
                tk.Id as TicketIdRef,
                tk.TicketNumber,
                tk.Title as TicketTitle,
                tk.ExternalTicketId,
                oji.JiraUrl,
                t.JiraIssueKey,
                '[]' as AssigneesJson
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
         LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
         LEFT JOIN Customers tc ON t.CustomerId = tc.Id
         LEFT JOIN Customers pc ON p.CustomerId = pc.Id
         LEFT JOIN Tasks depTask ON t.DependsOnTaskId = depTask.Id
         LEFT JOIN Tickets tk ON t.TicketId = tk.Id
         LEFT JOIN OrganizationJiraIntegrations oji ON tk.OrganizationId = oji.OrganizationId AND oji.IsEnabled = 1
         LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
         LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
         LEFT JOIN (
           SELECT TaskId, SUM(AllocatedHours) as TotalAllocated
           FROM TaskAllocations
           GROUP BY TaskId
         ) AS alloc ON t.Id = alloc.TaskId
         LEFT JOIN (
           SELECT TaskId, SUM(Hours) as TotalWorked
           FROM TimeEntries
           GROUP BY TaskId
         ) AS workedAgg ON t.Id = workedAgg.TaskId
         WHERE t.ProjectId = ? AND (t.AssignedTo = ? OR EXISTS (SELECT 1 FROM TaskAssignees WHERE TaskId = t.Id AND UserId = ?))
         ORDER BY t.CreatedAt DESC`,
        [projectId, userId, userId]
      );
      tasks = myTasks;
    }

    const organizationId = Number(access[0].OrganizationId);
    const [closedStatuses] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, StatusName
       FROM TaskStatusValues
       WHERE OrganizationId = ?
         AND (COALESCE(IsClosed, 0) = 1 OR COALESCE(IsCancelled, 0) = 1)`,
      [organizationId]
    );

    const closedStatusValues = new Set<string>();
    closedStatuses.forEach((status) => {
      closedStatusValues.add(String(status.Id));
      closedStatusValues.add(String(status.StatusName || '').trim().toLowerCase());
    });

    const closedAtByTaskId = new Map<number, string>();
    const doneTransitionsByTaskId = new Map<number, Map<string, number>>();
    if (tasks.length > 0 && closedStatusValues.size > 0) {
      const [statusHistory] = await pool.execute<RowDataPacket[]>(
        `SELECT th.TaskId, th.NewValue, th.CreatedAt
         FROM TaskHistory th
         INNER JOIN Tasks t ON t.Id = th.TaskId
         WHERE t.ProjectId = ?
           AND th.FieldName = 'Status'
         ORDER BY th.TaskId ASC, th.CreatedAt ASC`,
        [projectId]
      );

      statusHistory.forEach((entry) => {
        const taskId = Number(entry.TaskId);

        const statusToken = String(entry.NewValue || '').trim();
        if (!closedStatusValues.has(statusToken) && !closedStatusValues.has(statusToken.toLowerCase())) {
          return;
        }

        const closedDate = toDateOnly(entry.CreatedAt);
        if (closedDate) {
          if (!closedAtByTaskId.has(taskId)) {
            closedAtByTaskId.set(taskId, closedDate);
          }

          if (!doneTransitionsByTaskId.has(taskId)) {
            doneTransitionsByTaskId.set(taskId, new Map<string, number>());
          }

          const dayMap = doneTransitionsByTaskId.get(taskId);
          if (dayMap) {
            dayMap.set(closedDate, (dayMap.get(closedDate) || 0) + 1);
          }
        }
      });
    }

    tasks = tasks.map((task) => {
      const currentStatusToken = String(task.Status ?? '').trim();
      const isClosedNow =
        Number(task.StatusIsClosed || 0) === 1 ||
        Number(task.StatusIsCancelled || 0) === 1 ||
        closedStatusValues.has(currentStatusToken) ||
        closedStatusValues.has(currentStatusToken.toLowerCase());

      const doneTransitionsByDay = Number(task.UnscheduledWork || 0) === 1
        ? Array.from(doneTransitionsByTaskId.get(Number(task.Id))?.entries() || [])
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, count]) => ({ date, count }))
        : [];

      return {
        ...task,
        ClosedAt: closedAtByTaskId.get(Number(task.Id)) || (isClosedNow ? toDateOnly(task.UpdatedAt) : null),
        DoneTransitionsByDay: doneTransitionsByDay,
      };
    });

    await populateAssigneesJson(tasks);

    res.json({
      success: true,
      tasks: computeCompletionPercentages(parseAssigneesJson(tasks))
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch tasks' 
    });
  }
});

// Get organization-wide integrated Jira issue IDs (for import dedupe/hide)
router.get('/project/:projectId/integrated-issue-ids', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = Number(req.params.projectId);

    if (Number.isNaN(projectId)) {
      return res.status(400).json({ success: false, message: 'Invalid project ID' });
    }

    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.OrganizationId
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    const organizationId = Number(access[0].OrganizationId);

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT t.JiraIssueKey, t.ExternalIssueId
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE p.OrganizationId = ?
         AND (t.JiraIssueKey IS NOT NULL OR t.ExternalIssueId IS NOT NULL)`,
      [organizationId]
    );

    const issueIds = Array.from(new Set(
      rows
        .flatMap((row: any) => [row.JiraIssueKey, row.ExternalIssueId])
        .filter((value: any) => value !== null && value !== undefined && String(value).trim() !== '')
        .map((value: any) => String(value).trim())
    ));

    res.json({ success: true, issueIds });
  } catch (error) {
    console.error('Get integrated issue IDs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch integrated issue IDs' });
  }
});
/**
 * @swagger
 * /api/tasks/ticket/{ticketId}:
 *   get:
 *     summary: Get tasks linked to a ticket
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Ticket ID
 *     responses:
 *       200:
 *         description: List of tasks linked to the specified ticket
 */
// Get tasks by ticket ID
router.get('/ticket/:ticketId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const ticketId = req.params.ticketId;

    // Get tasks associated with this ticket
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.*, 
              p.ProjectName,
              u1.Username as CreatorName,
              u2.Username as AssigneeName,
              tsv.StatusName, tsv.ColorCode as StatusColor,
              COALESCE(tsv.IsClosed, 0) as StatusIsClosed, COALESCE(tsv.IsCancelled, 0) as StatusIsCancelled,
              tpv.PriorityName, tpv.ColorCode as PriorityColor,
              ttv.TypeName as TaskTypeName, ttv.ColorCode as TaskTypeColor,
              (SELECT SUM(AllocatedHours) FROM TaskAllocations WHERE TaskId = t.Id) as TotalAllocated,
              (SELECT SUM(Hours) FROM TimeEntries WHERE TaskId = t.Id) as TotalWorked,
              tk.Id as TicketIdRef,
              tk.TicketNumber,
              tk.Title as TicketTitle,
              tk.ExternalTicketId,
              oji.JiraUrl,
              t.JiraIssueKey
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
       LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
       LEFT JOIN Tickets tk ON t.TicketId = tk.Id
       LEFT JOIN OrganizationJiraIntegrations oji ON tk.OrganizationId = oji.OrganizationId AND oji.IsEnabled = 1
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
      LEFT JOIN TaskTypeValues ttv ON t.TaskType = ttv.Id
       WHERE t.TicketId = ? AND om.UserId = ?
       ORDER BY t.CreatedAt DESC`,
      [ticketId, userId]
    );

    res.json({
      success: true,
      tasks: computeCompletionPercentages(parseAssigneesJson(tasks))
    });
  } catch (error) {
    console.error('Get tasks by ticket error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch tasks' 
    });
  }
});
/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create a new task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - taskName
 *             properties:
 *               projectId:
 *                 type: integer
 *               taskName:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *               priority:
 *                 type: string
 *               estimatedHours:
 *                 type: number
 *               assignedTo:
 *                 type: integer
 *               plannedStartDate:
 *                 type: string
 *                 format: date
 *               plannedEndDate:
 *                 type: string
 *                 format: date
 *               parentTaskId:
 *                 type: integer
 *               ticketId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Task created successfully
 *       400:
 *         description: Missing required fields
 */
// Create new task
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId, taskName, description, status, priority, taskType, assignedTo, dueDate, dueDateMandatory, unscheduledWork, estimatedHours, storyPoints, parentTaskId, displayOrder, plannedStartDate, plannedEndDate, dependsOnTaskId, ticketId, customerId, jiraIssueKey, gitHubIssueNumber, giteaIssueNumber, applicationId, releaseVersionId, customFields } = req.body;

    if (!taskName || !projectId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Task name and project ID are required' 
      });
    }

    if (status === undefined || status === null || status === '' || priority === undefined || priority === null || priority === '') {
      return res.status(400).json({
        success: false,
        message: 'Task status and priority are required'
      });
    }

    const mandatoryDueFlag = toBooleanFlag(dueDateMandatory);
    if (mandatoryDueFlag === 1 && !toDateOnly(dueDate)) {
      return res.status(400).json({
        success: false,
        message: 'Due date is required when due date is marked as mandatory'
      });
    }

    // Verify user has access to this project through organization membership
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.OrganizationId, COALESCE(p.IsGlobal, 0) as IsGlobal
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (projects.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found or access denied' 
      });
    }

    let resolvedTaskTypeId: number | null = taskType || null;
    if (!resolvedTaskTypeId) {
      const taskTypes = await ensureTaskTypesForOrg(projects[0].OrganizationId);
      resolvedTaskTypeId = taskTypes.find((t: any) => Number(t.IsDefault) === 1)?.Id || taskTypes[0]?.Id || null;
    }

    if (!resolvedTaskTypeId) {
      return res.status(400).json({
        success: false,
        message: 'Task type is required'
      });
    }

    const isGlobalProject = Number(projects[0].IsGlobal) === 1;
    const normalizedCustomerId = customerId !== undefined && customerId !== null && customerId !== ''
      ? Number(customerId)
      : null;

    if (isGlobalProject && !normalizedCustomerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer is required for tasks in global projects'
      });
    }

    // Get max display order if not provided
    let order = displayOrder;
    if (order === undefined || order === null) {
      const [maxOrder] = await pool.execute<RowDataPacket[]>(
        'SELECT COALESCE(MAX(DisplayOrder), 0) as maxOrder FROM Tasks WHERE ProjectId = ?',
        [projectId]
      );
      order = (maxOrder[0]?.maxOrder || 0) + 1;
    }

    const normalizedEstimatedHours = estimatedHours === undefined || estimatedHours === null || estimatedHours === ''
      ? null
      : Number(estimatedHours);
    const normalizedStoryPoints = storyPoints === undefined || storyPoints === null || storyPoints === ''
      ? null
      : Number(storyPoints);
    const normalizedGitHubIssueNumber = gitHubIssueNumber === undefined || gitHubIssueNumber === null || gitHubIssueNumber === ''
      ? null
      : Number(gitHubIssueNumber);
    const normalizedGiteaIssueNumber = giteaIssueNumber === undefined || giteaIssueNumber === null || giteaIssueNumber === ''
      ? null
      : Number(giteaIssueNumber);
    const finalStoryPointsForInsert =
      (normalizedStoryPoints === null || normalizedStoryPoints === 0) && normalizedEstimatedHours !== null
        ? normalizedEstimatedHours
        : normalizedStoryPoints;

    const customFieldData = await prepareCustomFieldData('Tasks', customFields);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Tasks (ProjectId, TaskName, Description, Status, Priority, TaskType, AssignedTo, DueDate, DueDateMandatory, UnscheduledWork, EstimatedHours, StoryPoints, ParentTaskId, DisplayOrder, PlannedStartDate, PlannedEndDate, DependsOnTaskId, TicketId, CustomerId, JiraIssueKey, GitHubIssueNumber, GiteaIssueNumber, ApplicationId, CreatedBy${customFieldData.insertColumns.length > 0 ? `, ${customFieldData.insertColumns.join(', ')}` : ''}) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${customFieldData.insertPlaceholders.length > 0 ? `, ${customFieldData.insertPlaceholders.join(', ')}` : ''})`,
      [
        projectId,
        taskName,
        sanitizeRichText(description) || null,
        status || null,
        priority || null,
        resolvedTaskTypeId,
        assignedTo || null,
        toDateOnly(dueDate),
        mandatoryDueFlag,
        toBooleanFlag(unscheduledWork),
        normalizedEstimatedHours,
        finalStoryPointsForInsert,
        parentTaskId || null,
        order,
        toDateOnly(plannedStartDate),
        toDateOnly(plannedEndDate),
        dependsOnTaskId || null,
        ticketId || null,
        isGlobalProject ? normalizedCustomerId : null,
        jiraIssueKey || null,
        normalizedGitHubIssueNumber,
        normalizedGiteaIssueNumber,
        applicationId || null,
        userId,
        ...customFieldData.insertValues
      ]
    );

    // If this task has a parent, recalculate parent's estimated hours
    if (parentTaskId) {
      await recalculateParentEstimatedHours(parentTaskId);
    }

    if (assignedTo !== undefined && assignedTo !== null) {
      await syncTaskPrimaryAssignee(result.insertId, assignedTo, userId);
    }

    // Create task history entry for creation
    await createTaskHistory(result.insertId, userId!, 'created', null, null, null);

    // Log task creation
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'TASK_CREATE',
      'Task',
      result.insertId,
      taskName,
      `Created task: ${taskName} in project ID ${projectId}`,
      req.ip,
      req.get('user-agent')
    );

    // If task is assigned, notify the assignee
    if (assignedTo && assignedTo !== userId) {
      // Get project info
      const [projectInfo] = await pool.execute<RowDataPacket[]>(
        'SELECT ProjectName FROM Projects WHERE Id = ?',
        [projectId]
      );
      const projectName = projectInfo[0]?.ProjectName || 'Unknown Project';
      
      await createNotification(
        assignedTo,
        'task_assigned',
        'New Task Assigned',
        `You have been assigned to task "${taskName}" in project "${projectName}"`,
        `/projects/${projectId}`,
        result.insertId,
        projectId
      );
    }

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      taskId: result.insertId
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create task' 
    });
  }
});

// Helper function to recalculate parent task estimated hours
async function recalculateParentEstimatedHours(parentTaskId: number) {
  try {
    // Get sum of all subtask estimated hours
    const [subtasks] = await pool.execute<RowDataPacket[]>(
      'SELECT COALESCE(SUM(EstimatedHours), 0) as totalHours FROM Tasks WHERE ParentTaskId = ?',
      [parentTaskId]
    );
    
    const totalHours = subtasks[0]?.totalHours || 0;
    
    // Update parent task estimated hours
    await pool.execute(
      'UPDATE Tasks SET EstimatedHours = ? WHERE Id = ?',
      [totalHours, parentTaskId]
    );
  } catch (error) {
    console.error('Error recalculating parent estimated hours:', error);
  }
}

/**
 * @swagger
 * /api/tasks/{id}:
 *   put:
 *     summary: Update a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Task ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               taskName:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *               priority:
 *                 type: string
 *               estimatedHours:
 *                 type: number
 *               assignedTo:
 *                 type: integer
 *               plannedStartDate:
 *                 type: string
 *                 format: date
 *               plannedEndDate:
 *                 type: string
 *                 format: date
 *               parentTaskId:
 *                 type: integer
 *               ticketId:
 *                 type: integer
 *               statusNote:
 *                 type: string
 *     responses:
 *       200:
 *         description: Task updated successfully
 *       404:
 *         description: Task not found
 */
// Update task
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const taskId = req.params.id;
    const { taskName, description, status, priority, taskType, assignedTo, dueDate, dueDateMandatory, unscheduledWork, estimatedHours, storyPoints, parentTaskId, displayOrder, plannedStartDate, plannedEndDate, dependsOnTaskId, jiraIssueKey, gitHubIssueNumber, giteaIssueNumber, applicationId, releaseVersionId, customerId, syncAllocationHeaderDates, customFields } = req.body;

    // Verify user has access to this task's project through organization membership and has CanManageTasks permission
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.AssignedTo, t.ParentTaskId, p.OrganizationId, COALESCE(p.IsGlobal, 0) as IsGlobal,
              COALESCE(pg.CanManageTasks, 0) as CanManageTasks, COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks, om.Role
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Task not found or access denied' 
      });
    }

    const oldParentTaskId = access[0].ParentTaskId;

    // Get current task data for history comparison - JOIN with status/priority for display names
    const [currentTask] = await pool.execute<RowDataPacket[]>(
      `SELECT t.*, p.ProjectName, p.Id as ProjectId,
              tsv.StatusName as OldStatusName, tpv.PriorityName as OldPriorityName
       FROM Tasks t 
       JOIN Projects p ON t.ProjectId = p.Id 
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
       WHERE t.Id = ?`,
      [taskId]
    );
    const oldTask = currentTask[0];
    const isGlobalProject = Number(access[0].IsGlobal) === 1;

    const finalStatus = status !== undefined ? status : oldTask.Status;
    const finalPriority = priority !== undefined ? priority : oldTask.Priority;
    const finalTaskType = taskType !== undefined ? taskType : oldTask.TaskType;
    const finalDueDateMandatory = dueDateMandatory !== undefined
      ? toBooleanFlag(dueDateMandatory)
      : toBooleanFlag(oldTask.DueDateMandatory);
    const incomingCustomerId = customerId !== undefined
      ? (customerId === null || customerId === '' ? null : Number(customerId))
      : undefined;
    const finalCustomerId = isGlobalProject
      ? (incomingCustomerId !== undefined ? incomingCustomerId : (oldTask.CustomerId ? Number(oldTask.CustomerId) : null))
      : null;

    if (
      finalStatus === undefined || finalStatus === null || finalStatus === '' ||
      finalPriority === undefined || finalPriority === null || finalPriority === '' ||
      finalTaskType === undefined || finalTaskType === null || finalTaskType === ''
    ) {
      return res.status(400).json({
        success: false,
        message: 'Task status, priority, and type are required'
      });
    }

    if (isGlobalProject && !finalCustomerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer is required for tasks in global projects'
      });
    }

    const effectiveDueDate = dueDate !== undefined ? toDateOnly(dueDate) : toDateOnly(oldTask.DueDate);
    if (finalDueDateMandatory === 1 && !effectiveDueDate) {
      return res.status(400).json({
        success: false,
        message: 'Due date is required when due date is marked as mandatory'
      });
    }

    const normalizeComparable = (value: any): string | null => {
      if (value === null || value === undefined || value === '') return null;
      return String(value);
    };

    const hasEffectiveChange = (oldVal: any, newVal: any): boolean => {
      return normalizeComparable(oldVal) !== normalizeComparable(newVal);
    };

    // Check if user has permission to manage or plan tasks
    const canManage = access[0].Role === 'Owner' || access[0].Role === 'Admin' || access[0].CanManageTasks === 1;
    const canPlan = canManage || access[0].CanPlanTasks === 1;
    
    // If user can only plan, restrict what fields they can update
    if (!canManage && canPlan) {
      // Can only update: AssignedTo, PlannedStartDate, PlannedEndDate, Status
      const restrictedChanged =
        (taskName !== undefined && hasEffectiveChange(oldTask.TaskName, taskName)) ||
        (description !== undefined && hasEffectiveChange(oldTask.Description, description)) ||
        (priority !== undefined && hasEffectiveChange(oldTask.Priority, priority)) ||
        (taskType !== undefined && hasEffectiveChange(oldTask.TaskType, taskType)) ||
        (dueDate !== undefined && hasEffectiveChange(toDateOnly(oldTask.DueDate), toDateOnly(dueDate))) ||
        (dueDateMandatory !== undefined && hasEffectiveChange(toBooleanFlag(oldTask.DueDateMandatory), finalDueDateMandatory)) ||
        (unscheduledWork !== undefined && hasEffectiveChange(toBooleanFlag(oldTask.UnscheduledWork), toBooleanFlag(unscheduledWork))) ||
        (estimatedHours !== undefined && hasEffectiveChange(oldTask.EstimatedHours, estimatedHours)) ||
        (storyPoints !== undefined && hasEffectiveChange(oldTask.StoryPoints, storyPoints)) ||
        (parentTaskId !== undefined && hasEffectiveChange(oldTask.ParentTaskId, parentTaskId)) ||
        (displayOrder !== undefined && hasEffectiveChange(oldTask.DisplayOrder, displayOrder)) ||
        (dependsOnTaskId !== undefined && hasEffectiveChange(oldTask.DependsOnTaskId, dependsOnTaskId)) ||
        (jiraIssueKey !== undefined && hasEffectiveChange(oldTask.JiraIssueKey, jiraIssueKey)) ||
        (gitHubIssueNumber !== undefined && hasEffectiveChange(oldTask.GitHubIssueNumber, gitHubIssueNumber)) ||
        (giteaIssueNumber !== undefined && hasEffectiveChange(oldTask.GiteaIssueNumber, giteaIssueNumber)) ||
        (customerId !== undefined && hasEffectiveChange(oldTask.CustomerId, finalCustomerId)) ||
        (applicationId !== undefined && hasEffectiveChange(oldTask.ApplicationId, applicationId)) ||
        (releaseVersionId !== undefined && hasEffectiveChange(oldTask.ReleaseVersionId, releaseVersionId));

      if (restrictedChanged) {
        return res.status(403).json({ 
          success: false, 
          message: 'You can only update assignment, planning dates, and status' 
        });
      }
    } else if (!canManage && !canPlan) {
      // Can only update their own tasks
      if (assignedTo !== undefined && assignedTo !== userId && assignedTo !== null) {
        return res.status(403).json({ 
          success: false, 
          message: 'You can only assign tasks to yourself' 
        });
      }
    }

    const finalTaskName = taskName !== undefined ? taskName : oldTask.TaskName;
    const finalDescription = description !== undefined
      ? (sanitizeRichText(description) || null)
      : oldTask.Description;
    const finalAssignedTo = assignedTo !== undefined
      ? (assignedTo === null || assignedTo === '' ? null : Number(assignedTo))
      : (oldTask.AssignedTo ?? null);
    const finalEstimatedHours = estimatedHours !== undefined
      ? (estimatedHours === null || estimatedHours === '' ? null : Number(estimatedHours))
      : (oldTask.EstimatedHours ?? null);
    const finalUnscheduledWork = unscheduledWork !== undefined
      ? toBooleanFlag(unscheduledWork)
      : toBooleanFlag(oldTask.UnscheduledWork);
    const finalStoryPointsRaw = storyPoints !== undefined
      ? (storyPoints === null || storyPoints === '' ? null : Number(storyPoints))
      : (oldTask.StoryPoints ?? null);
    const finalStoryPoints =
      (finalStoryPointsRaw === null || finalStoryPointsRaw === 0) && finalEstimatedHours !== null
        ? finalEstimatedHours
        : finalStoryPointsRaw;
    const finalParentTaskId = parentTaskId !== undefined
      ? (parentTaskId === null || parentTaskId === '' ? null : Number(parentTaskId))
      : (oldTask.ParentTaskId ?? null);
    const finalDisplayOrder = displayOrder !== undefined
      ? Number(displayOrder)
      : Number(oldTask.DisplayOrder);
    const requestedPlannedStartDate = plannedStartDate !== undefined
      ? toDateOnly(plannedStartDate)
      : toDateOnly(oldTask.PlannedStartDate);
    const requestedPlannedEndDate = plannedEndDate !== undefined
      ? toDateOnly(plannedEndDate)
      : toDateOnly(oldTask.PlannedEndDate);
    const finalPlannedStartDate = finalUnscheduledWork === 1 ? null : requestedPlannedStartDate;
    const finalPlannedEndDate = finalUnscheduledWork === 1 ? null : requestedPlannedEndDate;
    const finalDependsOnTaskId = dependsOnTaskId !== undefined
      ? (dependsOnTaskId === null || dependsOnTaskId === '' ? null : Number(dependsOnTaskId))
      : (oldTask.DependsOnTaskId ?? null);
    const finalJiraIssueKey = jiraIssueKey !== undefined
      ? (jiraIssueKey === null || String(jiraIssueKey).trim() === '' ? null : String(jiraIssueKey).trim())
      : (oldTask.JiraIssueKey ?? null);
    const finalGitHubIssueNumber = gitHubIssueNumber !== undefined
      ? (gitHubIssueNumber === null || gitHubIssueNumber === '' ? null : Number(gitHubIssueNumber))
      : (oldTask.GitHubIssueNumber ?? null);
    const finalGiteaIssueNumber = giteaIssueNumber !== undefined
      ? (giteaIssueNumber === null || giteaIssueNumber === '' ? null : Number(giteaIssueNumber))
      : (oldTask.GiteaIssueNumber ?? null);
    const finalApplicationId = applicationId !== undefined
      ? (applicationId === null || applicationId === '' ? null : Number(applicationId))
      : (oldTask.ApplicationId ?? null);
    const finalReleaseVersionId = releaseVersionId !== undefined
      ? (releaseVersionId === null || releaseVersionId === '' ? null : Number(releaseVersionId))
      : (oldTask.ReleaseVersionId ?? null);

    const oldStatusId = Number(oldTask.Status);
    const newStatusId = Number(finalStatus);
    const isStatusTransition = Number.isFinite(oldStatusId) && Number.isFinite(newStatusId) && oldStatusId !== newStatusId;

    if (isStatusTransition) {
      const organizationId = Number(access[0].OrganizationId);
      const [policyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT *
         FROM WorkflowTransitionPolicies
         WHERE OrganizationId = ?
           AND FromStatusId = ?
           AND ToStatusId = ?
           AND IsActive = 1
         ORDER BY Id DESC
         LIMIT 1`,
        [organizationId, oldStatusId, newStatusId]
      );

      if (policyRows.length > 0) {
        const policy = policyRows[0];
        const missingFields: string[] = [];

        if (Number(policy.RequireDescription || 0) === 1 && !hasMeaningfulText(finalDescription)) {
          missingFields.push('description');
        }
        if (Number(policy.RequireAssignee || 0) === 1 && !finalAssignedTo) {
          missingFields.push('assignee');
        }
        if (Number(policy.RequireDueDate || 0) === 1 && !effectiveDueDate) {
          missingFields.push('due date');
        }
        if (Number(policy.RequireEstimatedHours || 0) === 1 && !(finalEstimatedHours && finalEstimatedHours > 0)) {
          missingFields.push('estimated hours');
        }
        if (Number(policy.RequireStoryPoints || 0) === 1 && !(finalStoryPoints && finalStoryPoints > 0)) {
          missingFields.push('story points');
        }
        if (Number(policy.RequirePlannedDates || 0) === 1 && (!finalPlannedStartDate || !finalPlannedEndDate)) {
          missingFields.push('planned start and end dates');
        }

        if (missingFields.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Transition blocked by workflow policy "${policy.PolicyName}". Missing required fields: ${missingFields.join(', ')}`,
          });
        }
      }
    }

    const customFieldData = await prepareCustomFieldData('Tasks', customFields, oldTask as Record<string, unknown>);

    await pool.execute(
      `UPDATE Tasks 
       SET TaskName = ?, Description = ?, Status = ?, Priority = ?, TaskType = ?, AssignedTo = ?, DueDate = ?, DueDateMandatory = ?, UnscheduledWork = ?, EstimatedHours = ?, StoryPoints = ?, ParentTaskId = ?, DisplayOrder = ?, PlannedStartDate = ?, PlannedEndDate = ?, DependsOnTaskId = ?, JiraIssueKey = ?, GitHubIssueNumber = ?, GiteaIssueNumber = ?, CustomerId = ?, ApplicationId = ?, ReleaseVersionId = ?${customFieldData.updateAssignments.length > 0 ? `, ${customFieldData.updateAssignments.join(', ')}` : ''}
       WHERE Id = ?`,
      [
        finalTaskName,
        finalDescription,
        finalStatus,
        finalPriority,
        finalTaskType,
        finalAssignedTo,
        effectiveDueDate,
        finalDueDateMandatory,
        finalUnscheduledWork,
        finalEstimatedHours,
        finalStoryPoints,
        finalParentTaskId,
        finalDisplayOrder,
        finalPlannedStartDate,
        finalPlannedEndDate,
        finalDependsOnTaskId,
        finalJiraIssueKey,
        finalGitHubIssueNumber,
        finalGiteaIssueNumber,
        finalCustomerId,
        finalApplicationId,
        finalReleaseVersionId,
        ...customFieldData.updateValues,
        taskId
      ]
    );

    if (assignedTo !== undefined && assignedTo !== null) {
      await syncTaskPrimaryAssignee(Number(taskId), assignedTo, userId);
    }

    if (finalUnscheduledWork === 1) {
      await pool.execute('DELETE FROM TaskChildAllocations WHERE ParentTaskId = ?', [taskId]);
      await pool.execute('DELETE FROM TaskAllocations WHERE TaskId = ?', [taskId]);
      await pool.execute('DELETE FROM TaskAllocationHeaders WHERE TaskId = ?', [taskId]);
    }

    // If parent task changed or estimated hours changed, recalculate parent(s)
    // If planned dates changed, sync allocation header dates
        // Helper to normalize date for comparison - define early for use in sync check
        const normalizeDateForComparison = (date: any): string | null => {
          if (!date) return null;
          if (date instanceof Date) {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          }
          if (typeof date === 'string') return date.split('T')[0];
          return String(date);
        };

    const hasExplicitPlannedDateUpdate = plannedStartDate !== undefined || plannedEndDate !== undefined;
    const hasPlannedDateChanged =
      (plannedStartDate !== undefined && normalizeDateForComparison(oldTask.PlannedStartDate) !== normalizeDateForComparison(plannedStartDate)) ||
      (plannedEndDate !== undefined && normalizeDateForComparison(oldTask.PlannedEndDate) !== normalizeDateForComparison(plannedEndDate));
    const shouldSyncAllocationHeaderDates = toBooleanFlag(syncAllocationHeaderDates) === 1;

    if (shouldSyncAllocationHeaderDates || hasPlannedDateChanged) {
      try {
        await pool.execute(
          `UPDATE TaskAllocationHeaders
           SET PlannedStartDate = ?, PlannedEndDate = ?
           WHERE TaskId = ?`,
          [finalPlannedStartDate, finalPlannedEndDate, taskId]
        );
      } catch (err) {
        console.error('Error syncing allocation header dates:', err);
        // Don't fail the entire request if sync fails
      }
    }

    // If parent task changed or estimated hours changed, recalculate parent(s)
    if (oldParentTaskId) {
      await recalculateParentEstimatedHours(oldParentTaskId);
    }
    if (parentTaskId && parentTaskId !== oldParentTaskId) {
      await recalculateParentEstimatedHours(parentTaskId);
    }

    // Track changes in history
    const changes: { field: string; oldVal: string | null; newVal: string | null }[] = [];
    
    // Helper to normalize string values (treat empty string and null as equal)
    const normalizeString = (val: any): string | null => {
      if (val === null || val === undefined || val === '') return null;
      return String(val);
    };
    
    // Helper to check if values are actually different
    const hasChanged = (oldVal: any, newVal: any): boolean => {
      return normalizeString(oldVal) !== normalizeString(newVal);
    };

    const normalizeDescriptionForHistory = (value: any): string | null => {
      const sanitized = sanitizeRichText(value);
      if (!sanitized) return null;
      return sanitized.replace(/\s+/g, ' ').trim();
    };
    
    if (taskName !== undefined && hasChanged(oldTask.TaskName, taskName)) {
      changes.push({ field: 'TaskName', oldVal: oldTask.TaskName, newVal: taskName });
    }
    if (status !== undefined && hasChanged(oldTask.Status, status)) {
      changes.push({ field: 'Status', oldVal: oldTask.Status, newVal: status });
    }
    if (priority !== undefined && hasChanged(oldTask.Priority, priority)) {
      changes.push({ field: 'Priority', oldVal: oldTask.Priority, newVal: priority });
    }
    if (taskType !== undefined && hasChanged(oldTask.TaskType, finalTaskType)) {
      changes.push({ field: 'TaskType', oldVal: String(oldTask.TaskType || ''), newVal: String(finalTaskType || '') });
    }
    if (assignedTo !== undefined && hasChanged(oldTask.AssignedTo, assignedTo)) {
      changes.push({ field: 'AssignedTo', oldVal: String(oldTask.AssignedTo || ''), newVal: String(assignedTo || '') });
    }
    if (description !== undefined) {
      const oldDescriptionNormalized = normalizeDescriptionForHistory(oldTask.Description);
      const newDescriptionNormalized = normalizeDescriptionForHistory(finalDescription);
      if (oldDescriptionNormalized !== newDescriptionNormalized) {
        changes.push({ field: 'Description', oldVal: oldDescriptionNormalized, newVal: newDescriptionNormalized });
      }
    }
    if (estimatedHours !== undefined && hasChanged(oldTask.EstimatedHours, estimatedHours)) {
      changes.push({ field: 'EstimatedHours', oldVal: String(oldTask.EstimatedHours || ''), newVal: String(estimatedHours || '') });
    }
    if (storyPoints !== undefined && hasChanged(oldTask.StoryPoints, storyPoints)) {
      changes.push({ field: 'StoryPoints', oldVal: String(oldTask.StoryPoints || ''), newVal: String(storyPoints || '') });
    }
    
    // Date fields - normalize for comparison
    const oldDueDate = normalizeDateForComparison(oldTask.DueDate);
    const newDueDate = normalizeDateForComparison(dueDate);
    if (dueDate !== undefined && oldDueDate !== newDueDate) {
      changes.push({ field: 'DueDate', oldVal: oldDueDate, newVal: newDueDate });
    }

    if (dueDateMandatory !== undefined && hasChanged(toBooleanFlag(oldTask.DueDateMandatory), finalDueDateMandatory)) {
      changes.push({
        field: 'DueDateMandatory',
        oldVal: toBooleanFlag(oldTask.DueDateMandatory) === 1 ? 'Yes' : 'No',
        newVal: finalDueDateMandatory === 1 ? 'Yes' : 'No'
      });
    }
    if (unscheduledWork !== undefined && hasChanged(toBooleanFlag(oldTask.UnscheduledWork), finalUnscheduledWork)) {
      changes.push({
        field: 'UnscheduledWork',
        oldVal: toBooleanFlag(oldTask.UnscheduledWork) === 1 ? 'Yes' : 'No',
        newVal: finalUnscheduledWork === 1 ? 'Yes' : 'No'
      });
    }
    
    const oldPlannedStart = normalizeDateForComparison(oldTask.PlannedStartDate);
    const newPlannedStart = normalizeDateForComparison(plannedStartDate);
    if (plannedStartDate !== undefined && oldPlannedStart !== newPlannedStart) {
      changes.push({ field: 'PlannedStartDate', oldVal: oldPlannedStart, newVal: newPlannedStart });
    }
    
    const oldPlannedEnd = normalizeDateForComparison(oldTask.PlannedEndDate);
    const newPlannedEnd = normalizeDateForComparison(plannedEndDate);
    if (plannedEndDate !== undefined && oldPlannedEnd !== newPlannedEnd) {
      changes.push({ field: 'PlannedEndDate', oldVal: oldPlannedEnd, newVal: newPlannedEnd });
    }
    
    if (dependsOnTaskId !== undefined && hasChanged(oldTask.DependsOnTaskId, dependsOnTaskId)) {
      changes.push({ field: 'DependsOnTaskId', oldVal: String(oldTask.DependsOnTaskId || ''), newVal: String(dependsOnTaskId || '') });
    }
    if (jiraIssueKey !== undefined && hasChanged(oldTask.JiraIssueKey, finalJiraIssueKey)) {
      changes.push({ field: 'JiraIssueKey', oldVal: String(oldTask.JiraIssueKey || ''), newVal: String(finalJiraIssueKey || '') });
    }
    if (gitHubIssueNumber !== undefined && hasChanged(oldTask.GitHubIssueNumber, finalGitHubIssueNumber)) {
      changes.push({ field: 'GitHubIssueNumber', oldVal: String(oldTask.GitHubIssueNumber || ''), newVal: String(finalGitHubIssueNumber || '') });
    }
    if (giteaIssueNumber !== undefined && hasChanged(oldTask.GiteaIssueNumber, finalGiteaIssueNumber)) {
      changes.push({ field: 'GiteaIssueNumber', oldVal: String(oldTask.GiteaIssueNumber || ''), newVal: String(finalGiteaIssueNumber || '') });
    }
    if (parentTaskId !== undefined && hasChanged(oldTask.ParentTaskId, parentTaskId)) {
      changes.push({ field: 'ParentTaskId', oldVal: String(oldTask.ParentTaskId || ''), newVal: String(parentTaskId || '') });
    }
    if (displayOrder !== undefined && hasChanged(oldTask.DisplayOrder, displayOrder)) {
      changes.push({ field: 'DisplayOrder', oldVal: String(oldTask.DisplayOrder || ''), newVal: String(displayOrder || '') });
    }
    if (customerId !== undefined && hasChanged(oldTask.CustomerId, finalCustomerId)) {
      changes.push({ field: 'CustomerId', oldVal: String(oldTask.CustomerId || ''), newVal: String(finalCustomerId || '') });
    }
    if (applicationId !== undefined && hasChanged(oldTask.ApplicationId, applicationId)) {
      changes.push({ field: 'ApplicationId', oldVal: String(oldTask.ApplicationId || ''), newVal: String(applicationId || '') });
    }
    if (releaseVersionId !== undefined && hasChanged(oldTask.ReleaseVersionId, releaseVersionId)) {
      changes.push({ field: 'ReleaseVersionId', oldVal: String(oldTask.ReleaseVersionId || ''), newVal: String(releaseVersionId || '') });
    }
    for (const change of customFieldData.changes) {
      changes.push({ field: change.field, oldVal: change.oldVal, newVal: change.newVal });
    }

    // Create history entries for each change
    for (const change of changes) {
      await createTaskHistory(Number(taskId), userId!, 'updated', change.field, change.oldVal, change.newVal);
    }
    
    // Log task update
    if (changes.length > 0) {
      const changedFields = changes.map(c => c.field).join(', ');
      await logActivity(
        userId ?? null,
        req.user?.username || null,
        'TASK_UPDATE',
        'Task',
        Number(taskId),
        taskName || oldTask.TaskName,
        `Updated task: ${taskName || oldTask.TaskName} (Changed: ${changedFields})`,
        req.ip,
        req.get('user-agent')
      );
    }
    
    // If priority changed, notify assignee and creator
    if (priority !== undefined && priority !== oldTask.Priority) {
      // Resolve priority names for notification text
      const oldPriorityName = oldTask.OldPriorityName || String(oldTask.Priority);
      let newPriorityName = String(priority);
      try {
        const [newPriRes] = await pool.execute<RowDataPacket[]>('SELECT PriorityName FROM TaskPriorityValues WHERE Id = ?', [priority]);
        if (newPriRes.length > 0) newPriorityName = newPriRes[0].PriorityName;
      } catch {}
      
      // Notify assignee
      if (oldTask.AssignedTo && oldTask.AssignedTo !== userId) {
        await createNotification(
          oldTask.AssignedTo,
          'task_updated',
          'Task Priority Changed',
          `Task "${taskName || oldTask.TaskName}" priority changed from "${oldPriorityName}" to "${newPriorityName}"`,
          `/projects/${oldTask.ProjectId}`,
          Number(taskId),
          oldTask.ProjectId
        );
        try {
          const [uRows] = await pool.execute<RowDataPacket[]>('SELECT Email FROM Users WHERE Id = ?', [oldTask.AssignedTo]);
          if (uRows.length > 0) {
            await sendNotificationEmail(oldTask.AssignedTo, uRows[0].Email, 'task_updated', 'Task Priority Changed',
              `Task "${taskName || oldTask.TaskName}" priority changed from "${oldPriorityName}" to "${newPriorityName}"`,
              `/projects/${oldTask.ProjectId}`);
          }
        } catch {}
      }
      
      // Notify creator (if different)
      if (oldTask.CreatedBy && oldTask.CreatedBy !== userId && oldTask.CreatedBy !== oldTask.AssignedTo) {
        await createNotification(
          oldTask.CreatedBy,
          'task_updated',
          'Task Priority Changed',
          `Task "${taskName || oldTask.TaskName}" priority changed from "${oldPriorityName}" to "${newPriorityName}"`,
          `/projects/${oldTask.ProjectId}`,
          Number(taskId),
          oldTask.ProjectId
        );
        try {
          const [uRows] = await pool.execute<RowDataPacket[]>('SELECT Email FROM Users WHERE Id = ?', [oldTask.CreatedBy]);
          if (uRows.length > 0) {
            await sendNotificationEmail(oldTask.CreatedBy, uRows[0].Email, 'task_updated', 'Task Priority Changed',
              `Task "${taskName || oldTask.TaskName}" priority changed from "${oldPriorityName}" to "${newPriorityName}"`,
              `/projects/${oldTask.ProjectId}`);
          }
        } catch {}
      }
    }

    // If assignee changed, notify the new assignee
    if (assignedTo !== undefined && assignedTo !== oldTask.AssignedTo && assignedTo && assignedTo !== userId) {
      await createNotification(
        assignedTo,
        'task_assigned',
        'Task Assigned to You',
        `You have been assigned to task "${taskName || oldTask.TaskName}" in project "${oldTask.ProjectName}"`,
        `/projects/${oldTask.ProjectId}`,
        Number(taskId),
        oldTask.ProjectId
      );
      try {
        const [uRows] = await pool.execute<RowDataPacket[]>('SELECT Email FROM Users WHERE Id = ?', [assignedTo]);
        if (uRows.length > 0) {
          await sendNotificationEmail(assignedTo, uRows[0].Email, 'task_assigned', 'Task Assigned to You',
            `You have been assigned to task "${taskName || oldTask.TaskName}" in project "${oldTask.ProjectName}"`,
            `/projects/${oldTask.ProjectId}`);
        }
      } catch {}
    }

    // If status changed, notify the assignee and creator
    if (status !== undefined && status !== oldTask.Status) {
      // Resolve status names for notification text
      const oldStatusName = oldTask.OldStatusName || String(oldTask.Status);
      let newStatusName = String(status);
      try {
        const [newStRes] = await pool.execute<RowDataPacket[]>('SELECT StatusName FROM TaskStatusValues WHERE Id = ?', [status]);
        if (newStRes.length > 0) newStatusName = newStRes[0].StatusName;
      } catch {}

      // Notify assignee (if different from current user)
      if (oldTask.AssignedTo && oldTask.AssignedTo !== userId) {
        await createNotification(
          oldTask.AssignedTo,
          'task_updated',
          'Task Status Changed',
          `Task "${taskName || oldTask.TaskName}" status changed from "${oldStatusName}" to "${newStatusName}"`,
          `/projects/${oldTask.ProjectId}`,
          Number(taskId),
          oldTask.ProjectId
        );
        try {
          const [uRows] = await pool.execute<RowDataPacket[]>('SELECT Email FROM Users WHERE Id = ?', [oldTask.AssignedTo]);
          if (uRows.length > 0) {
            await sendNotificationEmail(oldTask.AssignedTo, uRows[0].Email, 'task_updated', 'Task Status Changed',
              `Task "${taskName || oldTask.TaskName}" status changed from "${oldStatusName}" to "${newStatusName}"`,
              `/projects/${oldTask.ProjectId}`);
          }
        } catch {}
      }
      
      // Notify creator (if different from current user and assignee)
      if (oldTask.CreatedBy && oldTask.CreatedBy !== userId && oldTask.CreatedBy !== oldTask.AssignedTo) {
        await createNotification(
          oldTask.CreatedBy,
          'task_updated',
          'Task Status Changed',
          `Task "${taskName || oldTask.TaskName}" status changed from "${oldStatusName}" to "${newStatusName}"`,
          `/projects/${oldTask.ProjectId}`,
          Number(taskId),
          oldTask.ProjectId
        );
        try {
          const [uRows] = await pool.execute<RowDataPacket[]>('SELECT Email FROM Users WHERE Id = ?', [oldTask.CreatedBy]);
          if (uRows.length > 0) {
            await sendNotificationEmail(oldTask.CreatedBy, uRows[0].Email, 'task_updated', 'Task Status Changed',
              `Task "${taskName || oldTask.TaskName}" status changed from "${oldStatusName}" to "${newStatusName}"`,
              `/projects/${oldTask.ProjectId}`);
          }
        } catch {}
      }
    }

    res.json({
      success: true,
      message: 'Task updated successfully'
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update task' 
    });
  }
});

// ─── Task Assignees ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/tasks/{id}/assignees:
 *   get:
 *     summary: Get assignees of a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Task ID
 *     responses:
 *       200:
 *         description: List of assignees for the task
 */
// GET /:id/assignees – list all assignees for a task
router.get('/:id/assignees', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const taskId = req.params.id;

    // Verify access
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );
    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ta.UserId, ta.AssignedAt, ta.AssignedBy,
              u.Username, u.FirstName, u.LastName
       FROM TaskAssignees ta
       JOIN Users u ON ta.UserId = u.Id
       WHERE ta.TaskId = ?
       ORDER BY ta.AssignedAt ASC`,
      [taskId]
    );

    res.json({ success: true, assignees: rows });
  } catch (error) {
    console.error('Get task assignees error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assignees' });
  }
});

/**
 * @swagger
 * /api/tasks/{id}/assignees:
 *   post:
 *     summary: Add an assignee to a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Task ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Assignee added successfully
 *       409:
 *         description: User is already an assignee
 */
// POST /:id/assignees – add an assignee to a task
router.post('/:id/assignees', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const taskId = req.params.id;
    const { assigneeUserId } = req.body;

    if (!assigneeUserId) {
      return res.status(400).json({ success: false, message: 'assigneeUserId is required' });
    }

    // Verify access
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.TaskName, p.Id as ProjectId, p.ProjectName, p.OrganizationId,
              COALESCE(pg.CanManageTasks, 0) as CanManageTasks, om.Role
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );
    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }
    const canManage = access[0].Role === 'Owner' || access[0].Role === 'Admin' || access[0].CanManageTasks === 1;
    if (!canManage) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    // Verify assignee is a member of the same organisation
    const [memberCheck] = await pool.execute<RowDataPacket[]>(
      `SELECT UserId FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?`,
      [access[0].OrganizationId, assigneeUserId]
    );
    if (memberCheck.length === 0) {
      return res.status(400).json({ success: false, message: 'User is not a member of this organisation' });
    }

    // Insert (ignore duplicate)
    await pool.execute(
      `INSERT IGNORE INTO TaskAssignees (TaskId, UserId, AssignedBy) VALUES (?, ?, ?)`,
      [taskId, assigneeUserId, userId]
    );

    // Also sync Tasks.AssignedTo if it is currently null (first assignee)
    await pool.execute(
      `UPDATE Tasks SET AssignedTo = ? WHERE Id = ? AND (AssignedTo IS NULL)`,
      [assigneeUserId, taskId]
    );

    // Notify the new assignee (if different from current user)
    if (Number(assigneeUserId) !== userId) {
      await createNotification(
        Number(assigneeUserId),
        'task_assigned',
        'New Task Assigned',
        `You have been assigned to task "${access[0].TaskName}" in project "${access[0].ProjectName}"`,
        `/projects/${access[0].ProjectId}`,
        Number(taskId),
        access[0].ProjectId
      );
    }

    // Track in history
    await createTaskHistory(Number(taskId), userId!, 'updated', 'Assignees', null, String(assigneeUserId));

    res.json({ success: true, message: 'Assignee added' });
  } catch (error) {
    console.error('Add task assignee error:', error);
    res.status(500).json({ success: false, message: 'Failed to add assignee' });
  }
});

/**
 * @swagger
 * /api/tasks/{id}/assignees/{assigneeUserId}:
 *   delete:
 *     summary: Remove an assignee from a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Task ID
 *       - in: path
 *         name: assigneeUserId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID of the assignee to remove
 *     responses:
 *       200:
 *         description: Assignee removed successfully
 *       404:
 *         description: Assignee not found
 */
// DELETE /:id/assignees/:assigneeUserId – remove an assignee from a task
router.delete('/:id/assignees/:assigneeUserId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const taskId = req.params.id;
    const { assigneeUserId } = req.params;

    // Verify access
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, COALESCE(pg.CanManageTasks, 0) as CanManageTasks, om.Role
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );
    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }
    const canManage = access[0].Role === 'Owner' || access[0].Role === 'Admin' || access[0].CanManageTasks === 1;
    if (!canManage) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    await pool.execute(
      `DELETE FROM TaskAssignees WHERE TaskId = ? AND UserId = ?`,
      [taskId, assigneeUserId]
    );

    // Sync Tasks.AssignedTo: set to remaining first assignee or null
    const [remaining] = await pool.execute<RowDataPacket[]>(
      `SELECT UserId FROM TaskAssignees WHERE TaskId = ? ORDER BY AssignedAt ASC LIMIT 1`,
      [taskId]
    );
    const newPrimary = remaining.length > 0 ? remaining[0].UserId : null;
    await pool.execute(`UPDATE Tasks SET AssignedTo = ? WHERE Id = ?`, [newPrimary, taskId]);

    // Track in history
    await createTaskHistory(Number(taskId), userId!, 'updated', 'Assignees', String(assigneeUserId), null);

    res.json({ success: true, message: 'Assignee removed' });
  } catch (error) {
    console.error('Remove task assignee error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove assignee' });
  }
});

// ─── End Task Assignees ───────────────────────────────────────────────────────

/**
 * @swagger
 * /api/tasks/reorder-kanban:
 *   post:
 *     summary: Reorder tasks in kanban view
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updates
 *             properties:
 *               updates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     taskId:
 *                       type: integer
 *                     displayOrder:
 *                       type: integer
 *                     status:
 *                       type: string
 *     responses:
 *       200:
 *         description: Tasks reordered successfully
 */
// Batch reorder/restatus tasks – single transaction, single round-trip
// Body: { updates: Array<{ taskId: number; displayOrder: number; status?: number }> }
router.post('/reorder-kanban', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid updates array' });
    }

    const ids = updates
      .map((u: any) => Number(u.taskId))
      .filter((id: number) => Number.isInteger(id) && id > 0);

    if (ids.length !== updates.length) {
      return res.status(400).json({ success: false, message: 'Invalid taskId in updates array' });
    }

    const uniqueIds = Array.from(new Set(ids));
    const placeholders = uniqueIds.map(() => '?').join(', ');

    // Verify the requesting user has access to all of these tasks
    const [accessRows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT t.Id
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE t.Id IN (${placeholders}) AND om.UserId = ?`,
      [...uniqueIds, userId]
    );

    if (accessRows.length !== uniqueIds.length) {
      return res.status(403).json({ success: false, message: 'Access denied to one or more tasks' });
    }

    const [taskRows] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.TaskName, t.Status, t.Description, t.AssignedTo, t.DueDate,
              t.EstimatedHours, t.StoryPoints, t.PlannedStartDate, t.PlannedEndDate,
              p.OrganizationId
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       WHERE t.Id IN (${placeholders})`,
      uniqueIds
    );

    const taskById = new Map<number, RowDataPacket>();
    for (const row of taskRows) {
      taskById.set(Number(row.Id), row);
    }

    const normalizedUpdates = updates.map((update: any) => {
      const taskId = Number(update.taskId);
      const task = taskById.get(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} was not found`);
      }

      const displayOrder = Number(update.displayOrder);
      if (!Number.isFinite(displayOrder)) {
        throw new Error(`Invalid displayOrder for task ${taskId}`);
      }

      const incomingStatus = update.status;
      const nextStatus = incomingStatus === undefined || incomingStatus === null || incomingStatus === ''
        ? Number(task.Status)
        : Number(incomingStatus);

      if (!Number.isFinite(nextStatus)) {
        throw new Error(`Invalid status for task ${taskId}`);
      }

      return {
        taskId,
        displayOrder,
        status: nextStatus,
        currentTask: task,
      };
    });

    const transitions = normalizedUpdates.filter((update) => Number(update.currentTask.Status) !== update.status);

    if (transitions.length > 0) {
      const transitionClauses: string[] = [];
      const transitionParams: any[] = [];

      for (const transition of transitions) {
        transitionClauses.push('(OrganizationId = ? AND FromStatusId = ? AND ToStatusId = ? AND IsActive = 1)');
        transitionParams.push(
          Number(transition.currentTask.OrganizationId),
          Number(transition.currentTask.Status),
          Number(transition.status)
        );
      }

      const [policyRows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM WorkflowTransitionPolicies WHERE ${transitionClauses.join(' OR ')}`,
        transitionParams
      );

      const policyByTransition = new Map<string, RowDataPacket>();
      for (const policy of policyRows) {
        const key = `${Number(policy.OrganizationId)}:${Number(policy.FromStatusId)}:${Number(policy.ToStatusId)}`;
        if (!policyByTransition.has(key)) {
          policyByTransition.set(key, policy);
        }
      }

      for (const transition of transitions) {
        const organizationId = Number(transition.currentTask.OrganizationId);
        const fromStatusId = Number(transition.currentTask.Status);
        const toStatusId = Number(transition.status);
        const policy = policyByTransition.get(`${organizationId}:${fromStatusId}:${toStatusId}`);

        if (!policy) continue;

        const missingFields: string[] = [];
        if (Number(policy.RequireDescription || 0) === 1 && !hasMeaningfulText(transition.currentTask.Description)) {
          missingFields.push('description');
        }
        if (Number(policy.RequireAssignee || 0) === 1 && !transition.currentTask.AssignedTo) {
          missingFields.push('assignee');
        }
        if (Number(policy.RequireDueDate || 0) === 1 && !toDateOnly(transition.currentTask.DueDate)) {
          missingFields.push('due date');
        }
        if (Number(policy.RequireEstimatedHours || 0) === 1 && !(Number(transition.currentTask.EstimatedHours || 0) > 0)) {
          missingFields.push('estimated hours');
        }
        if (Number(policy.RequireStoryPoints || 0) === 1 && !(Number(transition.currentTask.StoryPoints || 0) > 0)) {
          missingFields.push('story points');
        }
        if (Number(policy.RequirePlannedDates || 0) === 1 && (!toDateOnly(transition.currentTask.PlannedStartDate) || !toDateOnly(transition.currentTask.PlannedEndDate))) {
          missingFields.push('planned start and end dates');
        }

        if (missingFields.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Transition blocked by workflow policy "${policy.PolicyName}" for task "${transition.currentTask.TaskName}". Missing required fields: ${missingFields.join(', ')}`,
          });
        }
      }
    }

    // Build and execute a single CASE-based UPDATE
    const orderCase  = normalizedUpdates.map(() => 'WHEN ? THEN ?').join(' ');
    const statusCase = normalizedUpdates.map(() => 'WHEN ? THEN ?').join(' ');
    const orderParams: any[]  = normalizedUpdates.flatMap((u) => [u.taskId, u.displayOrder]);
    const statusParams: any[] = normalizedUpdates.flatMap((u) => [u.taskId, u.status]);

    await pool.execute(
      `UPDATE Tasks
       SET
         DisplayOrder = CASE Id ${orderCase} ELSE DisplayOrder END,
         Status       = CASE Id ${statusCase} ELSE Status END
       WHERE Id IN (${placeholders})`,
      [...orderParams, ...statusParams, ...uniqueIds]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error in reorder-kanban:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder tasks' });
  }
});

/**
 * @swagger
 * /api/tasks/{id}/order:
 *   put:
 *     summary: Update display order of a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Task ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - order
 *             properties:
 *               order:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Task order updated successfully
 */
// Update task order
router.put('/:id/order', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const taskId = req.params.id;
    const { displayOrder } = req.body;

    if (displayOrder === undefined || displayOrder === null) {
      return res.status(400).json({ 
        success: false, 
        message: 'Display order is required' 
      });
    }

    // Verify user has access to this task's project through organization membership and has CanManageTasks permission
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, COALESCE(pg.CanManageTasks, 0) as CanManageTasks, om.Role
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Task not found or access denied' 
      });
    }

    // Check if user has permission to manage tasks
    const canManage = access[0].Role === 'Owner' || access[0].Role === 'Admin' || access[0].CanManageTasks === 1;
    if (!canManage) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to edit tasks' 
      });
    }

    await pool.execute(
      'UPDATE Tasks SET DisplayOrder = ? WHERE Id = ?',
      [displayOrder, taskId]
    );

    // Create task history entry for display order change
    await createTaskHistory(Number(taskId), userId!, 'updated', 'DisplayOrder', null, String(displayOrder));

    res.json({
      success: true,
      message: 'Task order updated successfully'
    });
  } catch (error) {
    console.error('Update task order error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update task order' 
    });
  }
});

// Move task (and all descendants) to another project
router.post('/:id/move-project', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const taskId = Number(req.params.id);
    const targetProjectId = Number(req.body?.targetProjectId);

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid task id' });
    }

    if (!Number.isInteger(targetProjectId) || targetProjectId <= 0) {
      return res.status(400).json({ success: false, message: 'targetProjectId is required' });
    }

    const [sourceRows] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ProjectId, t.ParentTaskId, t.TaskName,
              p.OrganizationId,
              COALESCE(pg.CanManageTasks, 0) as CanManageTasks,
              om.Role
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );

    if (sourceRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const sourceTask = sourceRows[0];
    const canManage = sourceTask.Role === 'Owner' || sourceTask.Role === 'Admin' || Number(sourceTask.CanManageTasks || 0) === 1;
    if (!canManage) {
      return res.status(403).json({ success: false, message: 'You do not have permission to move tasks' });
    }

    const [targetRows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.OrganizationId, COALESCE(p.IsGlobal, 0) as IsGlobal
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [targetProjectId, userId]
    );

    if (targetRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Target project not found or access denied' });
    }

    const targetProject = targetRows[0];

    if (Number(targetProject.OrganizationId) !== Number(sourceTask.OrganizationId)) {
      return res.status(400).json({
        success: false,
        message: 'Tasks can only be moved between projects in the same organization'
      });
    }

    if (Number(sourceTask.ProjectId) === targetProjectId) {
      return res.json({ success: true, message: 'Task is already in this project', movedTaskCount: 0 });
    }

    const collectDescendants = async (parentId: number): Promise<number[]> => {
      const [children] = await pool.execute<RowDataPacket[]>(
        'SELECT Id FROM Tasks WHERE ParentTaskId = ?',
        [parentId]
      );

      let ids: number[] = [];
      for (const child of children) {
        ids.push(Number(child.Id));
        ids = ids.concat(await collectDescendants(Number(child.Id)));
      }
      return ids;
    };

    const descendantIds = await collectDescendants(taskId);
    const movedTaskIds = [taskId, ...descendantIds];
    const taskPlaceholders = movedTaskIds.map(() => '?').join(',');

    // Move all tasks in the selected subtree to target project
    if (Number(targetProject.IsGlobal) === 1) {
      await pool.execute(
        `UPDATE Tasks SET ProjectId = ? WHERE Id IN (${taskPlaceholders})`,
        [targetProjectId, ...movedTaskIds]
      );
    } else {
      await pool.execute(
        `UPDATE Tasks SET ProjectId = ?, CustomerId = NULL WHERE Id IN (${taskPlaceholders})`,
        [targetProjectId, ...movedTaskIds]
      );
    }

    // Root task might have a parent in the old project; detach to avoid cross-project hierarchy
    await pool.execute('UPDATE Tasks SET ParentTaskId = NULL WHERE Id = ?', [taskId]);

    // Remove dependencies pointing to tasks outside the moved subtree
    await pool.execute(
      `UPDATE Tasks
       SET DependsOnTaskId = NULL
       WHERE Id IN (${taskPlaceholders})
         AND DependsOnTaskId IS NOT NULL
         AND DependsOnTaskId NOT IN (${taskPlaceholders})`,
      [...movedTaskIds, ...movedTaskIds]
    );

    await createTaskHistory(taskId, userId!, 'updated', 'ProjectId', String(sourceTask.ProjectId), String(targetProjectId));

    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'TASK_MOVE_PROJECT',
      'Task',
      taskId,
      sourceTask.TaskName,
      `Moved task subtree "${sourceTask.TaskName}" to project ${targetProjectId} (${movedTaskIds.length} task(s))`,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: `Task moved successfully (${movedTaskIds.length} task(s) moved)` ,
      movedTaskCount: movedTaskIds.length
    });
  } catch (error) {
    console.error('Move task project error:', error);
    res.status(500).json({ success: false, message: 'Failed to move task to another project' });
  }
});

/**
 * @swagger
 * /api/tasks/{id}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Task deleted successfully
 *       404:
 *         description: Task not found
 */
// Delete task
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const taskId = req.params.id;
    const rawDeleteSubtasks = Array.isArray(req.query.deleteSubtasks)
      ? req.query.deleteSubtasks[0]
      : req.query.deleteSubtasks;
    const deleteSubtasks = rawDeleteSubtasks === undefined
      ? true
      : !['false', '0', 'no'].includes(String(rawDeleteSubtasks).toLowerCase());

    // Verify user has permission to delete tasks
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ParentTaskId, COALESCE(pg.CanManageTasks, 0) as CanManageTasks, om.Role
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Task not found or access denied' 
      });
    }

    const parentTaskId = access[0].ParentTaskId;

    const canManage = access[0].Role === 'Owner' || access[0].Role === 'Admin' || access[0].CanManageTasks === 1;
    if (!canManage) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to delete tasks' 
      });
    }

    // Get task info before deletion for history and notification
    const [taskInfo] = await pool.execute<RowDataPacket[]>(
      `SELECT t.TaskName, t.AssignedTo, p.Id as ProjectId, p.ProjectName 
       FROM Tasks t JOIN Projects p ON t.ProjectId = p.Id WHERE t.Id = ?`,
      [taskId]
    );
    const taskData = taskInfo[0];

    // Recursively collect all descendant task IDs
    const collectDescendants = async (parentId: number | string): Promise<number[]> => {
      const [children] = await pool.execute<RowDataPacket[]>(
        'SELECT Id FROM Tasks WHERE ParentTaskId = ?', [parentId]
      );
      let ids: number[] = [];
      for (const child of children) {
        ids.push(child.Id);
        ids = ids.concat(await collectDescendants(child.Id));
      }
      return ids;
    };

    const descendantIds = deleteSubtasks ? await collectDescendants(Number(taskId)) : [];
    const allTaskIds = [Number(taskId), ...descendantIds];

    if (!deleteSubtasks) {
      // Keep subtasks: detach direct children from parent task
      await pool.execute('UPDATE Tasks SET ParentTaskId = NULL WHERE ParentTaskId = ?', [taskId]);
    }

    // Clear dependencies in remaining tasks that reference tasks being deleted
    if (allTaskIds.length > 0) {
      const dependencyPlaceholders = allTaskIds.map(() => '?').join(',');
      await pool.execute(
        `UPDATE Tasks SET DependsOnTaskId = NULL WHERE DependsOnTaskId IN (${dependencyPlaceholders})`,
        allTaskIds
      );
    }

    // Delete dependent data for all tasks (the task itself + all subtasks)
    for (const tid of allTaskIds) {
      await pool.execute('DELETE FROM TaskAllocations WHERE TaskId = ?', [tid]);
      await pool.execute('DELETE FROM TaskAllocationHeaders WHERE TaskId = ?', [tid]);
      await pool.execute('DELETE FROM TaskChildAllocations WHERE ParentTaskId = ? OR ChildTaskId = ?', [tid, tid]);
      await pool.execute('DELETE FROM ApplicationVersionTasks WHERE TaskId = ?', [tid]);
      // Null out ReleaseVersionId references in other tables we can reach
    }

    // Delete all descendant tasks first (deepest first to avoid FK issues)
    if (deleteSubtasks && descendantIds.length > 0) {
      const placeholders = descendantIds.map(() => '?').join(',');
      await pool.execute(`DELETE FROM Tasks WHERE Id IN (${placeholders})`, descendantIds);
    }

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM Tasks WHERE Id = ?',
      [taskId]
    );

    // Create task history entry for deletion
    await createTaskHistory(Number(taskId), userId!, 'deleted', null, null, taskData.TaskName);

    // Log task deletion
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'TASK_DELETE',
      'Task',
      Number(taskId),
      taskData.TaskName,
      `Deleted task: ${taskData.TaskName} from project ${taskData.ProjectName}`,
      req.ip,
      req.get('user-agent')
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Task not found or access denied' 
      });
    }

    // If task had a parent, recalculate parent's estimated hours
    if (parentTaskId) {
      await recalculateParentEstimatedHours(parentTaskId);
    }

    // Notify the assignee about task deletion (if different from current user)
    if (taskData && taskData.AssignedTo && taskData.AssignedTo !== userId) {
      await createNotification(
        taskData.AssignedTo,
        'task_deleted',
        'Task Deleted',
        `Task "${taskData.TaskName}" in project "${taskData.ProjectName}" has been deleted`,
        `/projects/${taskData.ProjectId}`,
        undefined,
        taskData.ProjectId
      );
    }

    res.json({
      success: true,
      message: deleteSubtasks
        ? 'Task and subtasks deleted successfully'
        : 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete task' 
    });
  }
});

/**
 * @swagger
 * /api/tasks/reorder-subtasks:
 *   post:
 *     summary: Reorder subtasks
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subtasks
 *             properties:
 *               subtasks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     order:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Subtasks reordered successfully
 */
// Reorder subtasks - update DisplayOrder
router.post('/reorder-subtasks', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { updates } = req.body; // Array of { taskId, displayOrder }
    
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid updates array' });
    }

    // Update each task's DisplayOrder
    for (const update of updates) {
      await pool.execute(
        'UPDATE Tasks SET DisplayOrder = ? WHERE Id = ?',
        [update.displayOrder, update.taskId]
      );
      
      // Create task history entry for reorder
      await createTaskHistory(
        Number(update.taskId), 
        userId!, 
        'updated', 
        'DisplayOrder', 
        null, 
        String(update.displayOrder)
      );
    }

    res.json({ success: true, message: 'Subtasks reordered successfully' });
  } catch (error) {
    console.error('Error reordering subtasks:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder subtasks' });
  }
});

// =====================================================
// PROJECT UTILITIES - Bulk operations for project tasks
// =====================================================

/**
 * @swagger
 * /api/tasks/utilities/recalculate-hours/{projectId}:
 *   post:
 *     summary: Recalculate estimated hours for parent tasks from children
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Parent task hours recalculated successfully
 */
// Utility: Recalculate all parent task hours from children (bottom-up, multi-level)
router.post('/utilities/recalculate-hours/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId } = req.params;

    // Verify user has access
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );
    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    // Get all tasks for this project
    const [allTasks] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, ParentTaskId, EstimatedHours, TaskName FROM Tasks WHERE ProjectId = ?',
      [projectId]
    );

    const tasks = allTasks as RowDataPacket[];
    const taskMap = new Map(tasks.map(t => [t.Id, t]));
    const childrenMap = new Map<number, RowDataPacket[]>();

    // Build children map
    for (const task of tasks) {
      if (task.ParentTaskId) {
        const children = childrenMap.get(task.ParentTaskId) || [];
        children.push(task);
        childrenMap.set(task.ParentTaskId, children);
      }
    }

    // Find the depth level of each task (leaf = 0, parent of leaf = 1, etc.)
    const getDepth = (taskId: number, visited = new Set<number>()): number => {
      if (visited.has(taskId)) return 0;
      visited.add(taskId);
      const children = childrenMap.get(taskId);
      if (!children || children.length === 0) return 0;
      return 1 + Math.max(...children.map(c => getDepth(c.Id, visited)));
    };

    // Get all parent tasks sorted by depth (deepest first = bottom-up)
    // Get all parent tasks sorted by depth (deepest first = bottom-up)
    const parentTasks = tasks.filter(t => childrenMap.has(t.Id));
    const parentTasksWithDepth = parentTasks.map(t => ({ task: t, depth: getDepth(t.Id) }));
    // Sort by depth ascending: depth=1 first (closest to leaves), then depth=2, etc.
    // depth=1 means direct parent of leaves. These should update first.
    // Then depth=2 picks up the updated depth=1 values.
    parentTasksWithDepth.sort((a, b) => a.depth - b.depth);

    let updatedCount = 0;
    const updates: { taskId: number; taskName: string; oldHours: number; newHours: number }[] = [];

    for (const { task: parent } of parentTasksWithDepth) {
      // Re-fetch children hours (may have been updated in previous iteration)
      const [freshChildren] = await pool.execute<RowDataPacket[]>(
        'SELECT COALESCE(SUM(EstimatedHours), 0) as totalHours FROM Tasks WHERE ParentTaskId = ?',
        [parent.Id]
      );
      const newHours = parseFloat(freshChildren[0]?.totalHours || 0);
      const oldHours = parseFloat(parent.EstimatedHours || 0);

      if (Math.abs(newHours - oldHours) > 0.01) {
        await pool.execute('UPDATE Tasks SET EstimatedHours = ? WHERE Id = ?', [newHours, parent.Id]);
        
        // Create task history entry for estimated hours recalculation
        await createTaskHistory(
          parent.Id,
          userId!,
          'updated',
          'EstimatedHours',
          String(oldHours),
          String(newHours)
        );
        
        updates.push({ taskId: parent.Id, taskName: parent.TaskName, oldHours, newHours });
        updatedCount++;
      }
    }

    res.json({ success: true, message: `Updated ${updatedCount} parent tasks`, updates });
  } catch (error) {
    console.error('Error recalculating hours:', error);
    res.status(500).json({ success: false, message: 'Failed to recalculate hours' });
  }
});

/**
 * @swagger
 * /api/tasks/utilities/reassign-from-planning/{projectId}:
 *   post:
 *     summary: Reassign tasks from planning allocations
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Tasks reassigned from planning allocations successfully
 */
// Utility: Reassign tasks based on who they are planned/allocated to
router.post('/utilities/reassign-from-planning/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId } = req.params;

    // Verify user has access
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );
    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    // Use recursive CTE to find the planned user for ALL tasks in the hierarchy.
    // Strategy: walk up each task's parent chain until we find a task with a direct TaskAllocation.
    // That allocation's UserId is the planned user for all descendants.
    const [mismatches] = await pool.execute<RowDataPacket[]>(
      `WITH RECURSIVE TaskAncestors AS (
         -- Base case: each task in the project points to itself
         SELECT t.Id as TaskId, t.Id as AncestorId, t.ParentTaskId, 0 as Depth
         FROM Tasks t
         WHERE t.ProjectId = ?
         
         UNION ALL
         
         -- Recursive: walk up the parent chain
         SELECT ta.TaskId, parent.Id as AncestorId, parent.ParentTaskId, ta.Depth + 1
         FROM TaskAncestors ta
         INNER JOIN Tasks parent ON ta.ParentTaskId = parent.Id
         WHERE ta.Depth < 20
       ),
       -- Find the nearest ancestor that has a direct TaskAllocation
       PlannedUsers AS (
         SELECT 
           ta_cte.TaskId,
           alloc.UserId as PlannedUserId,
           ta_cte.Depth,
           ROW_NUMBER() OVER (PARTITION BY ta_cte.TaskId ORDER BY ta_cte.Depth ASC) as rn
         FROM TaskAncestors ta_cte
         INNER JOIN TaskAllocations alloc ON ta_cte.AncestorId = alloc.TaskId
         GROUP BY ta_cte.TaskId, alloc.UserId, ta_cte.Depth
       )
       SELECT t.Id, t.TaskName, t.AssignedTo,
              pu.PlannedUserId,
              CONCAT(u.FirstName, ' ', u.LastName) as PlannedUserName,
              CONCAT(cu.FirstName, ' ', cu.LastName) as CurrentUserName
       FROM Tasks t
       INNER JOIN PlannedUsers pu ON t.Id = pu.TaskId AND pu.rn = 1
       LEFT JOIN Users u ON pu.PlannedUserId = u.Id
       LEFT JOIN Users cu ON t.AssignedTo = cu.Id
       WHERE t.ProjectId = ?
       AND (t.AssignedTo IS NULL OR t.AssignedTo != pu.PlannedUserId)`,
      [projectId, projectId]
    );

    let updatedCount = 0;
    const updates: { taskId: number; taskName: string; oldUser: string | null; newUser: string }[] = [];

    for (const task of mismatches as RowDataPacket[]) {
      const oldAssignedTo = task.AssignedTo;
      await pool.execute('UPDATE Tasks SET AssignedTo = ? WHERE Id = ?', [task.PlannedUserId, task.Id]);
      await syncTaskPrimaryAssignee(task.Id, task.PlannedUserId, userId);
      
      // Create task history entry for reassignment
      await createTaskHistory(
        task.Id, 
        userId!, 
        'updated', 
        'AssignedTo', 
        oldAssignedTo ? String(oldAssignedTo) : null, 
        String(task.PlannedUserId)
      );
      
      updates.push({
        taskId: task.Id,
        taskName: task.TaskName,
        oldUser: task.CurrentUserName || 'Unassigned',
        newUser: task.PlannedUserName,
      });
      updatedCount++;
    }

    res.json({ success: true, message: `Reassigned ${updatedCount} tasks`, updates });
  } catch (error) {
    console.error('Error reassigning tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to reassign tasks' });
  }
});

/**
 * @swagger
 * /api/tasks/utilities/update-due-dates/{projectId}:
 *   post:
 *     summary: Update due dates based on planning allocations
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Task due dates updated from planned end dates successfully
 */
// Utility: Update due dates based on planning (PlannedEndDate → DueDate)
router.post('/utilities/update-due-dates/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId } = req.params;

    // Verify user has access
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );
    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    // Find tasks with PlannedEndDate that differs from DueDate or has no DueDate
    // Skip tasks with mandatory due dates.
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, TaskName, DueDate, PlannedEndDate 
       FROM Tasks 
       WHERE ProjectId = ? 
       AND PlannedEndDate IS NOT NULL
       AND COALESCE(DueDateMandatory, 0) = 0
       AND (DueDate IS NULL OR DATE(DueDate) != DATE(PlannedEndDate))`,
      [projectId]
    );

    let updatedCount = 0;
    const updates: { taskId: number; taskName: string; oldDueDate: string | null; newDueDate: string }[] = [];

    for (const task of tasks as RowDataPacket[]) {
      const newDueDate = task.PlannedEndDate instanceof Date
        ? `${task.PlannedEndDate.getFullYear()}-${String(task.PlannedEndDate.getMonth() + 1).padStart(2, '0')}-${String(task.PlannedEndDate.getDate()).padStart(2, '0')}`
        : String(task.PlannedEndDate).split('T')[0];
      const oldDueDate = task.DueDate
        ? (task.DueDate instanceof Date 
            ? `${task.DueDate.getFullYear()}-${String(task.DueDate.getMonth() + 1).padStart(2, '0')}-${String(task.DueDate.getDate()).padStart(2, '0')}`
            : String(task.DueDate).split('T')[0])
        : null;

      await pool.execute('UPDATE Tasks SET DueDate = ? WHERE Id = ?', [newDueDate, task.Id]);
      
      // Create task history entry for due date change
      await createTaskHistory(
        task.Id, 
        userId!, 
        'updated', 
        'DueDate', 
        oldDueDate, 
        newDueDate
      );
      
      updates.push({
        taskId: task.Id,
        taskName: task.TaskName,
        oldDueDate,
        newDueDate,
      });
      updatedCount++;
    }

    res.json({ success: true, message: `Updated ${updatedCount} task due dates`, updates });
  } catch (error) {
    console.error('Error updating due dates:', error);
    res.status(500).json({ success: false, message: 'Failed to update due dates' });
  }
});

/**
 * @swagger
 * /api/tasks/utilities/clear-planning/{projectId}:
 *   post:
 *     summary: Clear all planning allocations for a project
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Planning allocations cleared successfully
 */
// Utility: Clear planning from all tasks (remove allocations, planned dates)
router.post('/utilities/clear-planning/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId } = req.params;

    // Verify user has access
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );
    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    // Delete all task allocations for this project
    const [allocResult] = await pool.execute<ResultSetHeader>(
      `DELETE ta FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       WHERE t.ProjectId = ?`,
      [projectId]
    );

    // Delete all allocation headers for this project
    await pool.execute<ResultSetHeader>(
      `DELETE FROM TaskAllocationHeaders
       WHERE TaskId IN (SELECT Id FROM Tasks WHERE ProjectId = ?)`,
      [projectId]
    );

    // Delete all child allocations for this project
    const [childAllocResult] = await pool.execute<ResultSetHeader>(
      `DELETE tca FROM TaskChildAllocations tca
       INNER JOIN Tasks t ON tca.ChildTaskId = t.Id
       WHERE t.ProjectId = ?`,
      [projectId]
    );

    // Clear planned dates and assigned user from all tasks
    const [taskResult] = await pool.execute<ResultSetHeader>(
      `UPDATE Tasks SET PlannedStartDate = NULL, PlannedEndDate = NULL, AssignedTo = NULL
       WHERE ProjectId = ?`,
      [projectId]
    );

    // Get all tasks that were updated for history
    const [updatedTasks] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, TaskName FROM Tasks WHERE ProjectId = ?',
      [projectId]
    );

    // Create task history entries for cleared planning
    for (const task of updatedTasks as RowDataPacket[]) {
      await createTaskHistory(
        task.Id,
        userId!,
        'updated',
        'PlanningCleared',
        'Planned dates and assignment',
        null
      );
    }

    res.json({
      success: true,
      message: `Cleared planning: ${allocResult.affectedRows} allocations, ${childAllocResult.affectedRows} child allocations, ${taskResult.affectedRows} tasks updated`,
      deletedAllocations: allocResult.affectedRows,
      deletedChildAllocations: childAllocResult.affectedRows,
      updatedTasks: taskResult.affectedRows,
    });
  } catch (error) {
    console.error('Error clearing planning:', error);
    res.status(500).json({ success: false, message: 'Failed to clear planning' });
  }
});

/**
 * @swagger
 * /api/tasks/utilities/sync-parent-status/{projectId}:
 *   post:
 *     summary: Sync parent task status from children
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: Parent task statuses synced from children successfully
 */
// Utility: Sync parent task status from children
router.post('/utilities/sync-parent-status/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId } = req.params;

    // Verify user has access
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );
    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    // Get all tasks with their status info
    const [allTasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ParentTaskId, t.Status, t.TaskName,
              tsv.StatusName, COALESCE(tsv.IsClosed, 0) as IsClosed, COALESCE(tsv.IsCancelled, 0) as IsCancelled
       FROM Tasks t
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE t.ProjectId = ?`,
      [projectId]
    );

    // Get the organization's status values to find the right IDs
    const [projectInfo] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Projects WHERE Id = ?',
      [projectId]
    );
    const orgId = projectInfo[0]?.OrganizationId;

    const [statusValues] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, StatusName, IsClosed, IsCancelled FROM TaskStatusValues WHERE OrganizationId = ? ORDER BY SortOrder',
      [orgId]
    );

    // Find status IDs by characteristics
    const doneStatusId = statusValues.find(s => s.IsClosed === 1)?.Id;
    const inProgressStatusId = statusValues.find(s => s.StatusName?.toLowerCase().includes('progress') || s.SortOrder === 2)?.Id;
    const todoStatusId = statusValues.find(s => s.IsClosed === 0 && s.IsCancelled === 0 && s.StatusName?.toLowerCase().includes('to do'))?.Id || statusValues[0]?.Id;

    const tasks = allTasks as RowDataPacket[];
    const childrenMap = new Map<number, RowDataPacket[]>();

    for (const task of tasks) {
      if (task.ParentTaskId) {
        const children = childrenMap.get(task.ParentTaskId) || [];
        children.push(task);
        childrenMap.set(task.ParentTaskId, children);
      }
    }

    let updatedCount = 0;
    const updates: { taskId: number; taskName: string; oldStatus: string; newStatus: string }[] = [];

    for (const task of tasks) {
      const children = childrenMap.get(task.Id);
      if (!children || children.length === 0) continue;

      let newStatusId: number | null = null;

      const allClosed = children.every(c => c.IsClosed === 1);
      const someInProgress = children.some(c => !c.IsClosed && !c.IsCancelled && c.Status !== todoStatusId);
      const allTodo = children.every(c => c.IsClosed === 0 && c.IsCancelled === 0 && c.Status === todoStatusId);

      if (allClosed && doneStatusId) {
        newStatusId = doneStatusId;
      } else if (someInProgress && inProgressStatusId) {
        newStatusId = inProgressStatusId;
      } else if (allTodo && todoStatusId) {
        newStatusId = todoStatusId;
      }

      if (newStatusId && newStatusId !== task.Status) {
        const oldStatusName = task.StatusName || 'None';
        const newStatusName = statusValues.find(s => s.Id === newStatusId)?.StatusName || 'Unknown';
        await pool.execute('UPDATE Tasks SET Status = ? WHERE Id = ?', [newStatusId, task.Id]);
        
        // Create task history entry for status sync
        await createTaskHistory(
          task.Id,
          userId!,
          'updated',
          'Status',
          oldStatusName,
          newStatusName
        );
        
        updates.push({
          taskId: task.Id,
          taskName: task.TaskName,
          oldStatus: oldStatusName,
          newStatus: newStatusName,
        });
        updatedCount++;
      }
    }

    res.json({ success: true, message: `Updated ${updatedCount} parent task statuses`, updates });
  } catch (error) {
    console.error('Error syncing parent status:', error);
    res.status(500).json({ success: false, message: 'Failed to sync parent status' });
  }
});

/**
 * @swagger
 * /api/tasks/import-from-jira:
 *   post:
 *     summary: Import tasks from Jira
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - issues
 *             properties:
 *               projectId:
 *                 type: integer
 *               issues:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Tasks imported from Jira successfully
 */
// Import tasks from Jira
router.post('/import-from-jira', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId, issues, statusMapping, priorityMapping, taskTypeMapping, ticketMappings, importSource } = req.body;

    const normalizedImportSource = importSource === 'project' || importSource === 'ticket'
      ? importSource
      : (statusMapping && typeof statusMapping === 'object' ? 'project' : 'ticket');

    if (!projectId || !issues || !Array.isArray(issues) || issues.length === 0) {
      return res.status(400).json({ success: false, message: 'Project ID and issues are required' });
    }

    // Verify user has access to project
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.*, om.UserId 
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (projects.length === 0) {
      return res.status(403).json({ success: false, message: 'Project not found or access denied' });
    }

    const project = projects[0];
    const isGlobalProject = Number(project.IsGlobal) === 1;

    const [orgUsers] = await pool.execute<RowDataPacket[]>(
      `SELECT u.Id
       FROM Users u
       INNER JOIN OrganizationMembers om ON om.UserId = u.Id
       WHERE om.OrganizationId = ? AND u.IsActive = 1`,
      [project.OrganizationId]
    );
    const validOrganizationUserIds = new Set<number>(orgUsers.map((u: any) => Number(u.Id)).filter((id: number) => !Number.isNaN(id)));

    const [orgCustomers] = await pool.execute<RowDataPacket[]>(
      `SELECT c.Id
       FROM Customers c
       INNER JOIN CustomerOrganizations co ON co.CustomerId = c.Id
       WHERE co.OrganizationId = ? AND c.IsActive = 1`,
      [project.OrganizationId]
    );
    const validOrganizationCustomerIds = new Set<number>(orgCustomers.map((c: any) => Number(c.Id)).filter((id: number) => !Number.isNaN(id)));

    // Persist current Jira mapping preferences on the project for next imports.
    // Keep existing values when a specific mapping payload is omitted.
    const statusMappingJson = statusMapping && typeof statusMapping === 'object' ? JSON.stringify(statusMapping) : null;
    const priorityMappingJson = priorityMapping && typeof priorityMapping === 'object' ? JSON.stringify(priorityMapping) : null;
    const taskTypeMappingJson = taskTypeMapping && typeof taskTypeMapping === 'object' ? JSON.stringify(taskTypeMapping) : null;

    await pool.execute(
      `UPDATE Projects
       SET JiraTaskStatusMappingJson = COALESCE(?, JiraTaskStatusMappingJson),
           JiraTaskPriorityMappingJson = COALESCE(?, JiraTaskPriorityMappingJson),
           JiraTaskTypeMappingJson = COALESCE(?, JiraTaskTypeMappingJson)
       WHERE Id = ?`,
      [
        statusMappingJson,
        priorityMappingJson,
        taskTypeMappingJson,
        projectId
      ]
    );

    // Get task statuses for the organization
    const [taskStatuses] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, StatusName, IsDefault, SortOrder FROM TaskStatusValues WHERE OrganizationId = ? ORDER BY SortOrder ASC, Id ASC',
      [project.OrganizationId]
    );

    // Get task priorities for the organization
    const [taskPriorities] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, PriorityName, IsDefault, SortOrder FROM TaskPriorityValues WHERE OrganizationId = ? ORDER BY SortOrder ASC, Id ASC',
      [project.OrganizationId]
    );

    const taskTypes = await ensureTaskTypesForOrg(project.OrganizationId);

    const defaultStatusId = taskStatuses.find((s: any) => Number(s.IsDefault) === 1)?.Id || taskStatuses[0]?.Id || null;
    const defaultPriorityId = taskPriorities.find((p: any) => Number(p.IsDefault) === 1)?.Id || taskPriorities[0]?.Id || null;
    const defaultTaskTypeId = taskTypes.find((t: any) => Number(t.IsDefault) === 1)?.Id || taskTypes[0]?.Id || null;

    if (!defaultStatusId || !defaultPriorityId || !defaultTaskTypeId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot import from Jira because task status/priority/type values are not configured for this organization'
      });
    }

    // Get existing tasks with Jira issue identifiers to avoid duplicates (organization-wide)
    const [existingTasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.JiraIssueKey, t.ExternalIssueId
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE p.OrganizationId = ?
         AND (t.JiraIssueKey IS NOT NULL OR t.ExternalIssueId IS NOT NULL)`,
      [project.OrganizationId]
    );

    const existingIssueIds = new Set(
      existingTasks
        .flatMap((t: any) => [t.JiraIssueKey, t.ExternalIssueId])
        .filter((value: any) => value !== null && value !== undefined && String(value).trim() !== '')
        .map((value: any) => String(value).trim())
    );
    
    // Filter out issues that are already imported
    const newIssues = issues.filter(issue => !existingIssueIds.has(issue.key));
    const skippedCount = issues.length - newIssues.length;

    // If no new issues to import, return early
    if (newIssues.length === 0) {
      return res.json({
        success: true,
        message: `No new tasks to import. All ${issues.length} issues already exist in this organization.`,
        data: {
          imported: 0,
          hierarchyLinked: 0,
          skipped: skippedCount,
          total: issues.length
        }
      });
    }

    // Build key to internal ID mapping for created tasks
    const jiraKeyToTaskId: Record<string, number> = {};
    const createdTasks: any[] = [];

    const resolveMappedStatusId = (jiraStatus: string | undefined) => {
      if (!jiraStatus) return null;

      const mappedValue = statusMapping?.[jiraStatus];
      if (mappedValue !== undefined && mappedValue !== null && mappedValue !== '') {
        const mappedId = Number(mappedValue);
        if (!Number.isNaN(mappedId)) {
          const byId = taskStatuses.find((s: any) => Number(s.Id) === mappedId);
          if (byId) return byId.Id;
        }

        const byName = taskStatuses.find(
          (s: any) => String(s.StatusName).toLowerCase().trim() === String(mappedValue).toLowerCase().trim()
        );
        if (byName) return byName.Id;
      }

      const directMatch = taskStatuses.find(
        (s: any) => String(s.StatusName).toLowerCase().trim() === String(jiraStatus).toLowerCase().trim()
      );
      return directMatch?.Id || null;
    };

    const resolveMappedPriorityId = (jiraPriority: string | undefined) => {
      if (!jiraPriority) return null;

      const mappedValue = priorityMapping?.[jiraPriority];
      if (mappedValue !== undefined && mappedValue !== null && mappedValue !== '') {
        const mappedId = Number(mappedValue);
        if (!Number.isNaN(mappedId)) {
          const byId = taskPriorities.find((p: any) => Number(p.Id) === mappedId);
          if (byId) return byId.Id;
        }

        const byName = taskPriorities.find(
          (p: any) => String(p.PriorityName).toLowerCase().trim() === String(mappedValue).toLowerCase().trim()
        );
        if (byName) return byName.Id;
      }

      const directMatch = taskPriorities.find(
        (p: any) => String(p.PriorityName).toLowerCase().trim() === String(jiraPriority).toLowerCase().trim()
      );
      return directMatch?.Id || null;
    };

    const resolveMappedTaskTypeId = (jiraIssueType: string | undefined) => {
      if (!jiraIssueType) return null;

      const mappedValue = taskTypeMapping?.[jiraIssueType];
      if (mappedValue !== undefined && mappedValue !== null && mappedValue !== '') {
        const mappedId = Number(mappedValue);
        if (!Number.isNaN(mappedId)) {
          const byId = taskTypes.find((t: any) => Number(t.Id) === mappedId);
          if (byId) return byId.Id;
        }

        const byName = taskTypes.find(
          (t: any) => String(t.TypeName).toLowerCase().trim() === String(mappedValue).toLowerCase().trim()
        );
        if (byName) return byName.Id;
      }

      const directMatch = taskTypes.find(
        (t: any) => String(t.TypeName).toLowerCase().trim() === String(jiraIssueType).toLowerCase().trim()
      );
      return directMatch?.Id || null;
    };

    // Cache for customers auto-created from Jira organization names (avoid duplicates)
    const createdCustomersCache: Record<string, number> = {};

    // First pass: Create all tasks without parent relationships
    for (const issue of newIssues) {
      const statusId = resolveMappedStatusId(issue.status);
      const priorityId = resolveMappedPriorityId(issue.priority);
      const taskTypeId = resolveMappedTaskTypeId(issue.issueType);
      const normalizedDescription = normalizeJiraDescription(issue.description);
      const issueMapping = ticketMappings && typeof ticketMappings === 'object' ? ticketMappings[issue.key] : null;

      let mappedAssigneeId: number | null = null;
      if (issueMapping && issueMapping.assigneeId !== undefined && issueMapping.assigneeId !== null && issueMapping.assigneeId !== '') {
        const parsedAssigneeId = Number(issueMapping.assigneeId);
        if (!Number.isNaN(parsedAssigneeId) && validOrganizationUserIds.has(parsedAssigneeId)) {
          mappedAssigneeId = parsedAssigneeId;
        }
      }

      let mappedCustomerId: number | null = null;
      const autoCreateCustomerName: string | null = issueMapping?.autoCreateCustomerName || null;
      if (autoCreateCustomerName) {
        // Use cached result if we already created/found this customer within this import batch
        if (createdCustomersCache[autoCreateCustomerName] !== undefined) {
          mappedCustomerId = createdCustomersCache[autoCreateCustomerName];
        } else {
          // Check if customer already exists in the organization
          const [existingCustomers] = await pool.execute<RowDataPacket[]>(
            `SELECT c.Id FROM Customers c
             INNER JOIN CustomerOrganizations co ON co.CustomerId = c.Id
             WHERE co.OrganizationId = ? AND (c.Name = ? OR c.ExternalName = ?) AND c.IsActive = 1
             LIMIT 1`,
            [project.OrganizationId, autoCreateCustomerName, autoCreateCustomerName]
          );
          if (existingCustomers.length > 0) {
            mappedCustomerId = existingCustomers[0].Id;
          } else {
            const [insertCustomer] = await pool.execute<ResultSetHeader>(
              'INSERT INTO Customers (Name, ExternalName, IsActive, CreatedBy) VALUES (?, ?, 1, ?)',
              [autoCreateCustomerName, autoCreateCustomerName, userId]
            );
            mappedCustomerId = insertCustomer.insertId;
            await pool.execute(
              'INSERT INTO CustomerOrganizations (CustomerId, OrganizationId) VALUES (?, ?)',
              [mappedCustomerId, project.OrganizationId]
            );
            // Refresh valid customer IDs set so later issues in the same batch can use this new customer normally
            validOrganizationCustomerIds.add(mappedCustomerId);
          }
          createdCustomersCache[autoCreateCustomerName] = mappedCustomerId!;
        }
      } else if (issueMapping && issueMapping.customerId !== undefined && issueMapping.customerId !== null && issueMapping.customerId !== '') {
        const parsedCustomerId = Number(issueMapping.customerId);
        if (!Number.isNaN(parsedCustomerId) && validOrganizationCustomerIds.has(parsedCustomerId)) {
          mappedCustomerId = parsedCustomerId;
        }
      }

      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO Tasks (ProjectId, TaskName, Description, Status, Priority, TaskType, AssignedTo, CustomerId, CreatedBy, JiraIssueKey, ExternalIssueId, UnscheduledWork)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          issue.summary || issue.key,
          sanitizeRichText(normalizedDescription) || '',
          statusId || defaultStatusId,
          priorityId || defaultPriorityId,
          taskTypeId || defaultTaskTypeId,
          mappedAssigneeId,
          mappedCustomerId,
          userId,
          normalizedImportSource === 'ticket' ? issue.key : null,
          normalizedImportSource === 'project' ? issue.key : null,
          normalizedImportSource === 'ticket' ? 1 : 0
        ]
      );

      // Create task history entry for Jira import
      await createTaskHistory(
        result.insertId,
        userId!,
        'created',
        'JiraImport',
        null,
        issue.key
      );

      jiraKeyToTaskId[issue.key] = result.insertId;
      createdTasks.push({
        taskId: result.insertId,
        jiraKey: issue.key,
        parentKey: issue.parentKey,
        taskName: issue.summary || issue.key
      });
    }

    // Second pass: Update parent relationships
    let hierarchyUpdateCount = 0;
    for (const task of createdTasks) {
      if (task.parentKey && jiraKeyToTaskId[task.parentKey]) {
        await pool.execute(
          'UPDATE Tasks SET ParentTaskId = ? WHERE Id = ?',
          [jiraKeyToTaskId[task.parentKey], task.taskId]
        );
        
        // Create task history entry for parent relationship
        await createTaskHistory(
          task.taskId,
          userId!,
          'updated',
          'ParentTaskId',
          null,
          String(jiraKeyToTaskId[task.parentKey])
        );
        
        hierarchyUpdateCount++;
      }
    }

    res.json({ 
      success: true, 
      message: `Imported ${createdTasks.length} tasks from Jira (${hierarchyUpdateCount} with parent relationships)${skippedCount > 0 ? `, skipped ${skippedCount} already existing` : ''}`,
      data: {
        imported: createdTasks.length,
        hierarchyLinked: hierarchyUpdateCount,
        skipped: skippedCount,
        total: issues.length
      }
    });
  } catch (error) {
    console.error('Error importing Jira tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to import tasks from Jira' });
  }
});

/**
 * @swagger
 * /api/tasks/github-issues/{projectId}:
 *   get:
 *     summary: Get GitHub issues available for import to a project
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: List of GitHub issues for the project
 */
// Get GitHub issues already imported for a project
router.get('/github-issues/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId;

    // Verify user has access to project
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.*, om.UserId 
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (projects.length === 0) {
      return res.status(403).json({ success: false, message: 'Project not found or access denied' });
    }

    // Get tasks with GitHub issue numbers
    const [tasks] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, TaskName, GitHubIssueNumber, ExternalUrl FROM Tasks WHERE ProjectId = ? AND GitHubIssueNumber IS NOT NULL',
      [projectId]
    );

    res.json({ 
      success: true, 
      issues: tasks.map(task => ({
        taskId: task.Id,
        taskName: task.TaskName,
        GitHubIssueNumber: task.GitHubIssueNumber,
        externalUrl: task.ExternalUrl
      }))
    });
  } catch (error) {
    console.error('Error fetching GitHub issues:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch GitHub issues' });
  }
});

/**
 * @swagger
 * /api/tasks/import-from-github:
 *   post:
 *     summary: Import tasks from GitHub
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - issues
 *             properties:
 *               projectId:
 *                 type: integer
 *               issues:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Tasks imported from GitHub successfully
 */
// Import tasks from GitHub
router.post('/import-from-github', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId, issues, statusMapping } = req.body;

    if (!projectId || !issues || !Array.isArray(issues) || issues.length === 0) {
      return res.status(400).json({ success: false, message: 'Project ID and issues are required' });
    }

    // Verify user has access to project
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.*, om.UserId 
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (projects.length === 0) {
      return res.status(403).json({ success: false, message: 'Project not found or access denied' });
    }

    const project = projects[0];

    // Get task statuses for the organization
    const [taskStatuses] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, StatusName FROM TaskStatusValues WHERE OrganizationId = ?',
      [project.OrganizationId]
    );

    // Get task priorities for the organization
    const [taskPriorities] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, PriorityName FROM TaskPriorityValues WHERE OrganizationId = ?',
      [project.OrganizationId]
    );

    // Get existing tasks with GitHub issue numbers to avoid duplicates
    const [existingTasks] = await pool.execute<RowDataPacket[]>(
      'SELECT GitHubIssueNumber FROM Tasks WHERE ProjectId = ? AND GitHubIssueNumber IS NOT NULL',
      [projectId]
    );
    
    const existingIssueNumbers = new Set(existingTasks.map((t: any) => String(t.GitHubIssueNumber)));
    
    // Filter out issues that are already imported
    const newIssues = issues.filter(issue => !existingIssueNumbers.has(String(issue.number)));
    const skippedCount = issues.length - newIssues.length;

    // If no new issues to import, return early
    if (newIssues.length === 0) {
      return res.json({
        success: true,
        message: `No new tasks to import. All ${issues.length} issues already exist in the project.`,
        data: {
          imported: 0,
          skipped: skippedCount,
          total: issues.length
        }
      });
    }

    const createdTasks: any[] = [];

    // Create tasks for each GitHub issue
    for (const issue of newIssues) {
      // Map status from GitHub state to project task status
      let statusId = null;
      if (issue.state && statusMapping && statusMapping[issue.state]) {
        statusId = parseInt(statusMapping[issue.state]);
      } else if (issue.state) {
        // Try to find matching status by GitHub state (open -> To Do, closed -> Done)
        const stateMapping: Record<string, string> = {
          'open': 'to do',
          'closed': 'done'
        };
        const mappedStateName = stateMapping[issue.state.toLowerCase()];
        if (mappedStateName) {
          const matchingStatus = taskStatuses.find(
            (s: any) => s.StatusName.toLowerCase() === mappedStateName
          );
          if (matchingStatus) {
            statusId = matchingStatus.Id;
          }
        }
      }

      // Map priority based on labels (if any contain priority keywords)
      let priorityId = null;
      if (issue.labels && issue.labels.length > 0) {
        const priorityLabels = issue.labels.filter((label: any) => 
          /priority|urgent|critical|high|medium|low/i.test(label.name)
        );
        if (priorityLabels.length > 0) {
          const priorityLabel = priorityLabels[0].name.toLowerCase();
          let mappedPriority = 'medium'; // default
          if (/critical|urgent|high/i.test(priorityLabel)) mappedPriority = 'high';
          else if (/low/i.test(priorityLabel)) mappedPriority = 'low';
          
          const matchingPriority = taskPriorities.find(
            (p: any) => p.PriorityName.toLowerCase() === mappedPriority
          );
          if (matchingPriority) {
            priorityId = matchingPriority.Id;
          }
        }
      }

      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO Tasks (ProjectId, TaskName, Description, Status, Priority, CreatedBy, GitHubIssueNumber, ExternalUrl)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          issue.title || `GitHub Issue #${issue.number}`,
          issue.body || '',
          statusId || taskStatuses[0]?.Id || null,
          priorityId || taskPriorities.find((p: any) => p.PriorityName.toLowerCase() === 'medium')?.Id || null,
          userId,
          issue.number,
          issue.html_url || null
        ]
      );

      // Create task history entry for GitHub import
      await createTaskHistory(
        result.insertId,
        userId!,
        'created',
        'GitHubImport',
        null,
        `#${issue.number}`
      );

      createdTasks.push({
        taskId: result.insertId,
        issueNumber: issue.number,
        taskName: issue.title || `GitHub Issue #${issue.number}`
      });
    }

    res.json({ 
      success: true, 
      message: `Imported ${createdTasks.length} tasks from GitHub${skippedCount > 0 ? `, skipped ${skippedCount} already existing` : ''}`,
      data: {
        imported: createdTasks.length,
        skipped: skippedCount,
        total: issues.length
      }
    });
  } catch (error) {
    console.error('Error importing GitHub tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to import tasks from GitHub' });
  }
});

/**
 * @swagger
 * /api/tasks/gitea-issues/{projectId}:
 *   get:
 *     summary: Get Gitea issues available for import to a project
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Project ID
 *     responses:
 *       200:
 *         description: List of Gitea issues for the project
 */
// Get Gitea issues already imported for a project
router.get('/gitea-issues/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId;

    // Verify user has access to project
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.*, om.UserId 
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (projects.length === 0) {
      return res.status(403).json({ success: false, message: 'Project not found or access denied' });
    }

    // Get tasks with Gitea issue numbers
    const [tasks] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, TaskName, GiteaIssueNumber, ExternalUrl FROM Tasks WHERE ProjectId = ? AND GiteaIssueNumber IS NOT NULL',
      [projectId]
    );

    res.json({ 
      success: true, 
      issues: tasks.map(task => ({
        taskId: task.Id,
        taskName: task.TaskName,
        GiteaIssueNumber: task.GiteaIssueNumber,
        externalUrl: task.ExternalUrl
      }))
    });
  } catch (error) {
    console.error('Error fetching Gitea issues:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Gitea issues' });
  }
});

/**
 * @swagger
 * /api/tasks/import-from-gitea:
 *   post:
 *     summary: Import tasks from Gitea
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - issues
 *             properties:
 *               projectId:
 *                 type: integer
 *               issues:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Tasks imported from Gitea successfully
 */
// Import tasks from Gitea
router.post('/import-from-gitea', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId, issues, statusMapping } = req.body;

    if (!projectId || !issues || !Array.isArray(issues) || issues.length === 0) {
      return res.status(400).json({ success: false, message: 'Project ID and issues are required' });
    }

    // Verify user has access to project
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.*, om.UserId 
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (projects.length === 0) {
      return res.status(403).json({ success: false, message: 'Project not found or access denied' });
    }

    const project = projects[0];

    // Get task statuses for the organization
    const [taskStatuses] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, StatusName FROM TaskStatusValues WHERE OrganizationId = ?',
      [project.OrganizationId]
    );

    // Get task priorities for the organization
    const [taskPriorities] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, PriorityName FROM TaskPriorityValues WHERE OrganizationId = ?',
      [project.OrganizationId]
    );

    // Get existing tasks with Gitea issue numbers to avoid duplicates
    const [existingTasks] = await pool.execute<RowDataPacket[]>(
      'SELECT GiteaIssueNumber FROM Tasks WHERE ProjectId = ? AND GiteaIssueNumber IS NOT NULL',
      [projectId]
    );
    
    const existingIssueNumbers = new Set(existingTasks.map((t: any) => String(t.GiteaIssueNumber)));
    
    // Filter out issues that are already imported
    const newIssues = issues.filter((issue: any) => !existingIssueNumbers.has(String(issue.number)));
    const skippedCount = issues.length - newIssues.length;

    // If no new issues to import, return early
    if (newIssues.length === 0) {
      return res.json({
        success: true,
        message: `No new tasks to import. All ${issues.length} issues already exist in the project.`,
        data: {
          imported: 0,
          skipped: skippedCount,
          total: issues.length
        }
      });
    }

    const createdTasks: any[] = [];

    // Create tasks for each Gitea issue
    for (const issue of newIssues) {
      // Map status from Gitea state to project task status
      let statusId = null;
      if (issue.state && statusMapping && statusMapping[issue.state]) {
        // statusMapping maps state to StatusName, find the Id
        const mappedValue = statusMapping[issue.state];
        const matchingStatus = taskStatuses.find((s: any) => s.StatusName === mappedValue);
        if (matchingStatus) {
          statusId = matchingStatus.Id;
        }
      } else if (issue.state) {
        // Try to find matching status by Gitea state (open -> To Do, closed -> Done)
        const stateMapping: Record<string, string> = {
          'open': 'to do',
          'closed': 'done'
        };
        const mappedStateName = stateMapping[issue.state.toLowerCase()];
        if (mappedStateName) {
          const matchingStatus = taskStatuses.find(
            (s: any) => s.StatusName.toLowerCase() === mappedStateName
          );
          if (matchingStatus) {
            statusId = matchingStatus.Id;
          }
        }
      }

      // Map priority based on labels (if any contain priority keywords)
      let priorityId = null;
      if (issue.labels && issue.labels.length > 0) {
        const priorityLabels = issue.labels.filter((label: any) => 
          /priority|urgent|critical|high|medium|low/i.test(label.name)
        );
        if (priorityLabels.length > 0) {
          const priorityLabel = priorityLabels[0].name.toLowerCase();
          let mappedPriority = 'medium'; // default
          if (/critical|urgent|high/i.test(priorityLabel)) mappedPriority = 'high';
          else if (/low/i.test(priorityLabel)) mappedPriority = 'low';
          
          const matchingPriority = taskPriorities.find(
            (p: any) => p.PriorityName.toLowerCase() === mappedPriority
          );
          if (matchingPriority) {
            priorityId = matchingPriority.Id;
          }
        }
      }

      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO Tasks (ProjectId, TaskName, Description, Status, Priority, CreatedBy, GiteaIssueNumber, ExternalUrl)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          issue.title || `Gitea Issue #${issue.number}`,
          issue.body || '',
          statusId || taskStatuses[0]?.Id || null,
          priorityId || taskPriorities.find((p: any) => p.PriorityName.toLowerCase() === 'medium')?.Id || null,
          userId,
          issue.number,
          issue.html_url || null
        ]
      );

      // Create task history entry for Gitea import
      await createTaskHistory(
        result.insertId,
        userId!,
        'created',
        'GiteaImport',
        null,
        `#${issue.number}`
      );

      createdTasks.push({
        taskId: result.insertId,
        issueNumber: issue.number,
        taskName: issue.title || `Gitea Issue #${issue.number}`
      });
    }

    res.json({ 
      success: true, 
      message: `Imported ${createdTasks.length} tasks from Gitea${skippedCount > 0 ? `, skipped ${skippedCount} already existing` : ''}`,
      data: {
        imported: createdTasks.length,
        skipped: skippedCount,
        total: issues.length
      }
    });
  } catch (error) {
    console.error('Error importing Gitea tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to import tasks from Gitea' });
  }
});

/**
 * PUT /api/tasks/:taskId/baseline
 * Snapshot current PlannedStartDate/PlannedEndDate into BaselineStartDate/BaselineEndDate
 * for a single task.
 */
router.put('/:taskId/baseline', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const taskId = Number(req.params.taskId);

    if (!userId || Number.isNaN(taskId)) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }

    const [accessRows] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.PlannedStartDate, t.PlannedEndDate,
              COALESCE(pg.CanManageTasks, 0) as CanManageTasks,
              COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks,
              om.Role
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );

    if (accessRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const access = accessRows[0] as any;
    const canManageTasks = access.Role === 'Owner' || access.Role === 'Admin' || Number(access.CanManageTasks || 0) === 1;
    const canPlanTasks = canManageTasks || Number(access.CanPlanTasks || 0) === 1;

    if (!canPlanTasks) {
      return res.status(403).json({ success: false, message: 'You do not have permission to set baseline for this task' });
    }

    if (!access.PlannedStartDate || !access.PlannedEndDate) {
      return res.status(400).json({ success: false, message: 'Task must have planned start and end dates before setting baseline' });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE Tasks
       SET BaselineStartDate = PlannedStartDate,
           BaselineEndDate = PlannedEndDate
       WHERE Id = ?`,
      [taskId]
    );

    return res.json({
      success: true,
      message: 'Task baseline set successfully',
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error('Set task baseline error:', error);
    return res.status(500).json({ success: false, message: 'Failed to set task baseline' });
  }
});

/**
 * PUT /api/tasks/project/:projectId/baseline
 * Snapshot current PlannedStartDate/PlannedEndDate into BaselineStartDate/BaselineEndDate
 * for all tasks in the project that have planned dates.
 */
router.put('/project/:projectId/baseline', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId } = req.params;

    // Verify user has access to this project
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND (om.UserId = ? OR p.CreatedBy = ?)`,
      [projectId, userId, userId]
    );
    if (projects.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE Tasks
       SET BaselineStartDate = PlannedStartDate,
           BaselineEndDate   = PlannedEndDate
       WHERE ProjectId = ? AND PlannedStartDate IS NOT NULL AND PlannedEndDate IS NOT NULL`,
      [projectId]
    );

    res.json({
      success: true,
      message: `Baseline set for ${result.affectedRows} task(s)`,
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error('Set baseline error:', error);
    res.status(500).json({ success: false, message: 'Failed to set baseline' });
  }
});

export default router;