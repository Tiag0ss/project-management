import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createNotification } from './notifications';
import { logActivity } from './activityLogs';
import { sanitizeRichText } from '../utils/sanitize';
import { computeCompletionPercentages } from '../utils/taskCompletion';
import { sendNotificationEmail } from '../utils/emailService';

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
    await pool.execute(
      `INSERT INTO TaskHistory (TaskId, UserId, Action, FieldName, OldValue, NewValue) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [taskId, userId, action, fieldName, oldValue, newValue]
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
              p.IsHobby,
              u1.Username as CreatorName,
              u2.Username as AssigneeName,
              depTask.TaskName as DependsOnTaskName,
              tsv.StatusName, tsv.ColorCode as StatusColor,
              COALESCE(tsv.IsClosed, 0) as StatusIsClosed, COALESCE(tsv.IsCancelled, 0) as StatusIsCancelled,
              tpv.PriorityName, tpv.ColorCode as PriorityColor,
              COALESCE((SELECT COUNT(*) FROM Tasks st WHERE st.ParentTaskId = t.Id), 0) as SubtaskCount,
              COALESCE((SELECT SUM(Hours) FROM TimeEntries WHERE TaskId = t.Id), 0) as TotalWorked,
              tk.Id as TicketIdRef,
              tk.TicketNumber,
              tk.Title as TicketTitle,
              tk.ExternalTicketId,
              oji.JiraUrl,
              (
                SELECT JSON_ARRAYAGG(JSON_OBJECT('UserId', ua.UserId, 'Username', uu.Username, 'FirstName', uu.FirstName, 'LastName', uu.LastName))
                FROM TaskAssignees ua JOIN Users uu ON ua.UserId = uu.Id
                WHERE ua.TaskId = t.Id
              ) as AssigneesJson
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
       LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
       LEFT JOIN Tasks depTask ON t.DependsOnTaskId = depTask.Id
       LEFT JOIN TaskAllocations ta ON t.Id = ta.TaskId
       LEFT JOIN Tickets tk ON t.TicketId = tk.Id
       LEFT JOIN OrganizationJiraIntegrations oji ON tk.OrganizationId = oji.OrganizationId AND oji.IsEnabled = 1
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
       WHERE (t.AssignedTo = ? OR ta.UserId = ? OR EXISTS (
         SELECT 1 FROM TaskAssignees WHERE TaskId = t.Id AND UserId = ?
       ) OR EXISTS (
         SELECT 1 FROM Tasks st WHERE st.ParentTaskId = t.Id
       )) AND om.UserId = ?
       ORDER BY p.IsHobby ASC, t.PlannedStartDate DESC, t.CreatedAt DESC`,
      [userId, userId, userId, userId]
    );

    res.json({
      success: true,
      tasks: computeCompletionPercentages(parseAssigneesJson(tasks))
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
        COALESCE(alloc.TotalAllocated, 0) as TotalAllocated,
        COALESCE(worked.TotalWorked, 0) as TotalWorked,
        (
          SELECT JSON_ARRAYAGG(JSON_OBJECT('UserId', ua.UserId, 'Username', uu.Username, 'FirstName', uu.FirstName, 'LastName', uu.LastName))
          FROM TaskAssignees ua JOIN Users uu ON ua.UserId = uu.Id
          WHERE ua.TaskId = t.Id
        ) as AssigneesJson
       FROM Tasks t
       LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
       LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
       LEFT JOIN (
         SELECT TaskId, SUM(AllocatedHours) as TotalAllocated
         FROM TaskAllocations
         GROUP BY TaskId
       ) alloc ON t.Id = alloc.TaskId
       LEFT JOIN (
         SELECT TaskId, SUM(Hours) as TotalWorked
         FROM TimeEntries
         GROUP BY TaskId
       ) worked ON t.Id = worked.TaskId
       WHERE t.ProjectId = ?
       ORDER BY t.DisplayOrder, t.CreatedAt DESC`,
      [projectId]
    );

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
      `SELECT p.Id, COALESCE(pg.CanManageTasks, 0) as CanManageTasks, COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks, om.Role
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
                u1.Username as CreatorName,
                u2.Username as AssigneeName,
                depTask.TaskName as DependsOnTaskName,
                tsv.StatusName, tsv.ColorCode as StatusColor,
                COALESCE(tsv.IsClosed, 0) as StatusIsClosed, COALESCE(tsv.IsCancelled, 0) as StatusIsCancelled,
                tpv.PriorityName, tpv.ColorCode as PriorityColor,
                COALESCE(alloc.TotalAllocated, 0) as PlannedHours,
                COALESCE(worked.TotalWorked, 0) as WorkedHours,
                tk.Id as TicketIdRef,
                tk.TicketNumber,
                tk.Title as TicketTitle,
                tk.ExternalTicketId,
                oji.JiraUrl,
                (
                  SELECT JSON_ARRAYAGG(JSON_OBJECT('UserId', ua.UserId, 'Username', uu.Username, 'FirstName', uu.FirstName, 'LastName', uu.LastName))
                  FROM TaskAssignees ua JOIN Users uu ON ua.UserId = uu.Id
                  WHERE ua.TaskId = t.Id
                ) as AssigneesJson
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
         LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
         LEFT JOIN Tasks depTask ON t.DependsOnTaskId = depTask.Id
         LEFT JOIN Tickets tk ON t.TicketId = tk.Id
         LEFT JOIN OrganizationJiraIntegrations oji ON tk.OrganizationId = oji.OrganizationId AND oji.IsEnabled = 1
         LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
         LEFT JOIN (
           SELECT TaskId, SUM(AllocatedHours) as TotalAllocated
           FROM TaskAllocations
           GROUP BY TaskId
         ) alloc ON t.Id = alloc.TaskId
         LEFT JOIN (
           SELECT TaskId, SUM(Hours) as TotalWorked
           FROM TimeEntries
           GROUP BY TaskId
         ) worked ON t.Id = worked.TaskId
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
                u1.Username as CreatorName,
                u2.Username as AssigneeName,
                depTask.TaskName as DependsOnTaskName,
                tsv.StatusName, tsv.ColorCode as StatusColor,
                COALESCE(tsv.IsClosed, 0) as StatusIsClosed, COALESCE(tsv.IsCancelled, 0) as StatusIsCancelled,
                tpv.PriorityName, tpv.ColorCode as PriorityColor,
                COALESCE(alloc.TotalAllocated, 0) as PlannedHours,
                COALESCE(worked.TotalWorked, 0) as WorkedHours,
                tk.Id as TicketIdRef,
                tk.TicketNumber,
                tk.Title as TicketTitle,
                tk.ExternalTicketId,
                oji.JiraUrl,
                (
                  SELECT JSON_ARRAYAGG(JSON_OBJECT('UserId', ua.UserId, 'Username', uu.Username, 'FirstName', uu.FirstName, 'LastName', uu.LastName))
                  FROM TaskAssignees ua JOIN Users uu ON ua.UserId = uu.Id
                  WHERE ua.TaskId = t.Id
                ) as AssigneesJson
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
         LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
         LEFT JOIN Tasks depTask ON t.DependsOnTaskId = depTask.Id
         LEFT JOIN Tickets tk ON t.TicketId = tk.Id
         LEFT JOIN OrganizationJiraIntegrations oji ON tk.OrganizationId = oji.OrganizationId AND oji.IsEnabled = 1
         LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
         LEFT JOIN (
           SELECT TaskId, SUM(AllocatedHours) as TotalAllocated
           FROM TaskAllocations
           GROUP BY TaskId
         ) alloc ON t.Id = alloc.TaskId
         LEFT JOIN (
           SELECT TaskId, SUM(Hours) as TotalWorked
           FROM TimeEntries
           GROUP BY TaskId
         ) worked ON t.Id = worked.TaskId
         WHERE t.ProjectId = ? AND (t.AssignedTo = ? OR EXISTS (SELECT 1 FROM TaskAssignees WHERE TaskId = t.Id AND UserId = ?))
         ORDER BY t.CreatedAt DESC`,
        [projectId, userId, userId]
      );
      tasks = myTasks;
    }

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
              (SELECT SUM(AllocatedHours) FROM TaskAllocations WHERE TaskId = t.Id) as TotalAllocated,
              (SELECT SUM(Hours) FROM TimeEntries WHERE TaskId = t.Id) as TotalWorked,
              tk.Id as TicketIdRef,
              tk.TicketNumber,
              tk.Title as TicketTitle,
              tk.ExternalTicketId,
              oji.JiraUrl
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
       LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
       LEFT JOIN Tickets tk ON t.TicketId = tk.Id
       LEFT JOIN OrganizationJiraIntegrations oji ON tk.OrganizationId = oji.OrganizationId AND oji.IsEnabled = 1
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
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
    const { projectId, taskName, description, status, priority, assignedTo, dueDate, estimatedHours, parentTaskId, displayOrder, plannedStartDate, plannedEndDate, dependsOnTaskId, ticketId, applicationId, releaseVersionId } = req.body;

    if (!taskName || !projectId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Task name and project ID are required' 
      });
    }

    // Verify user has access to this project through organization membership
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id 
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

    // Get max display order if not provided
    let order = displayOrder;
    if (order === undefined || order === null) {
      const [maxOrder] = await pool.execute<RowDataPacket[]>(
        'SELECT COALESCE(MAX(DisplayOrder), 0) as maxOrder FROM Tasks WHERE ProjectId = ?',
        [projectId]
      );
      order = (maxOrder[0]?.maxOrder || 0) + 1;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Tasks (ProjectId, TaskName, Description, Status, Priority, AssignedTo, DueDate, EstimatedHours, ParentTaskId, DisplayOrder, PlannedStartDate, PlannedEndDate, DependsOnTaskId, TicketId, ApplicationId, CreatedBy) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        taskName,
        sanitizeRichText(description) || null,
        status || null,
        priority || null,
        assignedTo || null,
        toDateOnly(dueDate),
        estimatedHours || null,
        parentTaskId || null,
        order,
        toDateOnly(plannedStartDate),
        toDateOnly(plannedEndDate),
        dependsOnTaskId || null,
        ticketId || null,
        applicationId || null,
        userId
      ]
    );

    // If this task has a parent, recalculate parent's estimated hours
    if (parentTaskId) {
      await recalculateParentEstimatedHours(parentTaskId);
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
    const { taskName, description, status, priority, assignedTo, dueDate, estimatedHours, parentTaskId, displayOrder, plannedStartDate, plannedEndDate, dependsOnTaskId, applicationId, releaseVersionId } = req.body;

    // Verify user has access to this task's project through organization membership and has CanManageTasks permission
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.AssignedTo, t.ParentTaskId, COALESCE(pg.CanManageTasks, 0) as CanManageTasks, COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks, om.Role
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

    // Check if user has permission to manage or plan tasks
    const canManage = access[0].Role === 'Owner' || access[0].Role === 'Admin' || access[0].CanManageTasks === 1;
    const canPlan = canManage || access[0].CanPlanTasks === 1;
    
    // If user can only plan, restrict what fields they can update
    if (!canManage && canPlan) {
      // Can only update: AssignedTo, PlannedStartDate, PlannedEndDate, Status
      if (taskName !== undefined || description !== undefined || priority !== undefined || 
          dueDate !== undefined || estimatedHours !== undefined || parentTaskId !== undefined || displayOrder !== undefined) {
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

    await pool.execute(
      `UPDATE Tasks 
       SET TaskName = ?, Description = ?, Status = ?, Priority = ?, AssignedTo = ?, DueDate = ?, EstimatedHours = ?, ParentTaskId = ?, DisplayOrder = COALESCE(?, DisplayOrder), PlannedStartDate = ?, PlannedEndDate = ?, DependsOnTaskId = ?, ApplicationId = ?, ReleaseVersionId = ?
       WHERE Id = ?`,
      [
        taskName,
        sanitizeRichText(description) || null,
        status || null,
        priority || null,
        assignedTo || null,
        toDateOnly(dueDate),
        estimatedHours || null,
        parentTaskId || null,
        displayOrder || null,
        toDateOnly(plannedStartDate),
        toDateOnly(plannedEndDate),
        dependsOnTaskId || null,
        applicationId !== undefined ? (applicationId || null) : null,
        releaseVersionId !== undefined ? (releaseVersionId || null) : null,
        taskId
      ]
    );

    // If parent task changed or estimated hours changed, recalculate parent(s)
    if (oldParentTaskId) {
      await recalculateParentEstimatedHours(oldParentTaskId);
    }
    if (parentTaskId && parentTaskId !== oldParentTaskId) {
      await recalculateParentEstimatedHours(parentTaskId);
    }

    // Track changes in history
    const changes: { field: string; oldVal: string | null; newVal: string | null }[] = [];
    
    // Helper to normalize date for comparison
    const normalizeDateForComparison = (date: any): string | null => {
      if (!date) return null;
      if (date instanceof Date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      }
      if (typeof date === 'string') return date.split('T')[0];
      return String(date);
    };
    
    // Helper to normalize string values (treat empty string and null as equal)
    const normalizeString = (val: any): string | null => {
      if (val === null || val === undefined || val === '') return null;
      return String(val);
    };
    
    // Helper to check if values are actually different
    const hasChanged = (oldVal: any, newVal: any): boolean => {
      return normalizeString(oldVal) !== normalizeString(newVal);
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
    if (assignedTo !== undefined && hasChanged(oldTask.AssignedTo, assignedTo)) {
      changes.push({ field: 'AssignedTo', oldVal: String(oldTask.AssignedTo || ''), newVal: String(assignedTo || '') });
    }
    if (description !== undefined && hasChanged(oldTask.Description, description)) {
      changes.push({ field: 'Description', oldVal: oldTask.Description || '', newVal: description || '' });
    }
    if (estimatedHours !== undefined && hasChanged(oldTask.EstimatedHours, estimatedHours)) {
      changes.push({ field: 'EstimatedHours', oldVal: String(oldTask.EstimatedHours || ''), newVal: String(estimatedHours || '') });
    }
    
    // Date fields - normalize for comparison
    const oldDueDate = normalizeDateForComparison(oldTask.DueDate);
    const newDueDate = normalizeDateForComparison(dueDate);
    if (dueDate !== undefined && oldDueDate !== newDueDate) {
      changes.push({ field: 'DueDate', oldVal: oldDueDate, newVal: newDueDate });
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

    const ids = updates.map((u: any) => u.taskId);
    const placeholders = ids.map(() => '?').join(', ');

    // Verify the requesting user has access to all of these tasks
    const [accessRows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT t.Id
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE t.Id IN (${placeholders}) AND om.UserId = ?`,
      [...ids, userId]
    );

    if (accessRows.length !== ids.length) {
      return res.status(403).json({ success: false, message: 'Access denied to one or more tasks' });
    }

    // Build and execute a single CASE-based UPDATE
    const orderCase  = updates.map(() => 'WHEN ? THEN ?').join(' ');
    const statusCase = updates.map(() => 'WHEN ? THEN ?').join(' ');
    const orderParams: any[]  = updates.flatMap((u: any) => [u.taskId, u.displayOrder]);
    const statusParams: any[] = updates.flatMap((u: any) => [u.taskId, u.status ?? null]);

    await pool.execute(
      `UPDATE Tasks
       SET
         DisplayOrder = CASE Id ${orderCase} ELSE DisplayOrder END,
         Status       = CASE Id ${statusCase} ELSE Status END
       WHERE Id IN (${placeholders})`,
      [...orderParams, ...statusParams, ...ids]
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

    const descendantIds = await collectDescendants(Number(taskId));
    const allTaskIds = [Number(taskId), ...descendantIds];

    // Delete dependent data for all tasks (the task itself + all subtasks)
    for (const tid of allTaskIds) {
      await pool.execute('DELETE FROM TaskAllocations WHERE TaskId = ?', [tid]);
      await pool.execute('DELETE FROM TaskChildAllocations WHERE ParentTaskId = ? OR ChildTaskId = ?', [tid, tid]);
      await pool.execute('DELETE FROM ApplicationVersionTasks WHERE TaskId = ?', [tid]);
      // Null out ReleaseVersionId references in other tables we can reach
    }

    // Delete all descendant tasks first (deepest first to avoid FK issues)
    if (descendantIds.length > 0) {
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
      message: 'Task deleted successfully'
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
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, TaskName, DueDate, PlannedEndDate 
       FROM Tasks 
       WHERE ProjectId = ? 
       AND PlannedEndDate IS NOT NULL
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

    // Get existing tasks with external issue IDs to avoid duplicates
    const [existingTasks] = await pool.execute<RowDataPacket[]>(
      'SELECT ExternalIssueId FROM Tasks WHERE ProjectId = ? AND ExternalIssueId IS NOT NULL',
      [projectId]
    );
    
    const existingIssueIds = new Set(existingTasks.map((t: any) => t.ExternalIssueId));
    
    // Filter out issues that are already imported
    const newIssues = issues.filter(issue => !existingIssueIds.has(issue.key));
    const skippedCount = issues.length - newIssues.length;

    // If no new issues to import, return early
    if (newIssues.length === 0) {
      return res.json({
        success: true,
        message: `No new tasks to import. All ${issues.length} issues already exist in the project.`,
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

    // First pass: Create all tasks without parent relationships
    for (const issue of newIssues) {
      // Map status
      let statusId = null;
      if (issue.status && statusMapping && statusMapping[issue.status]) {
        // statusMapping contains the mapped status name, need to find its ID
        const mappedStatusName = statusMapping[issue.status];
        const matchingStatus = taskStatuses.find(
          (s: any) => s.StatusName.toLowerCase() === mappedStatusName.toLowerCase()
        );
        if (matchingStatus) {
          statusId = matchingStatus.Id;
        }
      } else if (issue.status) {
        // Try to find matching status by name (case insensitive)
        const matchingStatus = taskStatuses.find(
          (s: any) => s.StatusName.toLowerCase() === issue.status.toLowerCase()
        );
        if (matchingStatus) {
          statusId = matchingStatus.Id;
        }
      }

      // Map priority
      let priorityId = null;
      if (issue.priority) {
        const matchingPriority = taskPriorities.find(
          (p: any) => p.PriorityName.toLowerCase() === issue.priority.toLowerCase()
        );
        if (matchingPriority) {
          priorityId = matchingPriority.Id;
        }
      }

      const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO Tasks (ProjectId, TaskName, Description, Status, Priority, CreatedBy, ExternalIssueId)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          issue.summary || issue.key,
          issue.description || '',
          statusId || taskStatuses[0]?.Id || null,
          priorityId || taskPriorities[0]?.Id || null,
          userId,
          issue.key
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