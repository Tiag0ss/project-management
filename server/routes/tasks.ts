import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createNotification } from './notifications';
import { logActivity } from './activityLogs';

const router = Router();

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
              COALESCE((SELECT COUNT(*) FROM Tasks st WHERE st.ParentTaskId = t.Id), 0) as SubtaskCount
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
       LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
       LEFT JOIN Tasks depTask ON t.DependsOnTaskId = depTask.Id
       LEFT JOIN TaskAllocations ta ON t.Id = ta.TaskId
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
       WHERE (t.AssignedTo = ? OR ta.UserId = ? OR EXISTS (
         SELECT 1 FROM Tasks st WHERE st.ParentTaskId = t.Id
       )) AND om.UserId = ?
       ORDER BY p.IsHobby ASC, t.PlannedStartDate DESC, t.CreatedAt DESC`,
      [userId, userId, userId]
    );

    res.json({
      success: true,
      tasks
    });
  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch tasks' 
    });
  }
});

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
        COALESCE(worked.TotalWorked, 0) as TotalWorked
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
      tasks
    });
  } catch (error) {
    console.error('Get project tasks summary error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch tasks summary' 
    });
  }
});

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
                tk.Title as TicketTitle
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
         LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
         LEFT JOIN Tasks depTask ON t.DependsOnTaskId = depTask.Id
         LEFT JOIN Tickets tk ON t.TicketId = tk.Id
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
                tk.Title as TicketTitle
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
         LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
         LEFT JOIN Tasks depTask ON t.DependsOnTaskId = depTask.Id
         LEFT JOIN Tickets tk ON t.TicketId = tk.Id
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
         WHERE t.ProjectId = ? AND t.AssignedTo = ?
         ORDER BY t.CreatedAt DESC`,
        [projectId, userId]
      );
      tasks = myTasks;
    }

    res.json({
      success: true,
      tasks
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch tasks' 
    });
  }
});
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
              (SELECT SUM(Hours) FROM TimeEntries WHERE TaskId = t.Id) as TotalWorked
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN Users u1 ON t.CreatedBy = u1.Id
       LEFT JOIN Users u2 ON t.AssignedTo = u2.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
       WHERE t.TicketId = ? AND om.UserId = ?
       ORDER BY t.CreatedAt DESC`,
      [ticketId, userId]
    );

    res.json({
      success: true,
      tasks
    });
  } catch (error) {
    console.error('Get tasks by ticket error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch tasks' 
    });
  }
});
// Create new task
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId, taskName, description, status, priority, assignedTo, dueDate, estimatedHours, parentTaskId, displayOrder, plannedStartDate, plannedEndDate, dependsOnTaskId, ticketId } = req.body;

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
      `INSERT INTO Tasks (ProjectId, TaskName, Description, Status, Priority, AssignedTo, DueDate, EstimatedHours, ParentTaskId, DisplayOrder, PlannedStartDate, PlannedEndDate, DependsOnTaskId, TicketId, CreatedBy) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        taskName,
        description || null,
        status || null,
        priority || null,
        assignedTo || null,
        normalizeDateForDB(dueDate),
        estimatedHours || null,
        parentTaskId || null,
        order,
        normalizeDateForDB(plannedStartDate),
        normalizeDateForDB(plannedEndDate),
        dependsOnTaskId || null,
        ticketId || null,
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

// Update task
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const taskId = req.params.id;
    const { taskName, description, status, priority, assignedTo, dueDate, estimatedHours, parentTaskId, displayOrder, plannedStartDate, plannedEndDate, dependsOnTaskId } = req.body;

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
       SET TaskName = ?, Description = ?, Status = ?, Priority = ?, AssignedTo = ?, DueDate = ?, EstimatedHours = ?, ParentTaskId = ?, DisplayOrder = COALESCE(?, DisplayOrder), PlannedStartDate = ?, PlannedEndDate = ?, DependsOnTaskId = ?
       WHERE Id = ?`,
      [
        taskName, 
        description || null, 
        status || null, 
        priority || null, 
        assignedTo || null, 
        normalizeDateForDB(dueDate), 
        estimatedHours || null,
        parentTaskId || null,
        displayOrder || null,
        normalizeDateForDB(plannedStartDate),
        normalizeDateForDB(plannedEndDate),
        dependsOnTaskId || null,
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

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM Tasks WHERE Id = ?',
      [taskId]
    );

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

// Reorder subtasks - update DisplayOrder
router.post('/reorder-subtasks', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
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
      await pool.execute('UPDATE Tasks SET AssignedTo = ? WHERE Id = ?', [task.PlannedUserId, task.Id]);
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

    // Build key to internal ID mapping for created tasks
    const jiraKeyToTaskId: Record<string, number> = {};
    const createdTasks: any[] = [];

    // First pass: Create all tasks without parent relationships
    for (const issue of issues) {
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
        hierarchyUpdateCount++;
      }
    }

    res.json({ 
      success: true, 
      message: `Imported ${createdTasks.length} tasks from Jira (${hierarchyUpdateCount} with parent relationships)`,
      data: {
        imported: createdTasks.length,
        hierarchyLinked: hierarchyUpdateCount
      }
    });
  } catch (error) {
    console.error('Error importing Jira tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to import tasks from Jira' });
  }
});

export default router;