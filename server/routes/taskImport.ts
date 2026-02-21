import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: TaskImport
 *   description: Bulk task import
 */

interface TaskImportRow {
  ProjectId: string;
  TaskName: string;
  Description?: string;
  Status?: string;
  Priority?: string;
  AssignedToUsername?: string;
  DueDate?: string;
  EstimatedHours?: string;
  ParentTaskName?: string;
  PlannedStartDate?: string;
  PlannedEndDate?: string;
  DependsOnTaskName?: string;
}

interface ImportResult {
  success: boolean;
  created: number;
  errors: Array<{row: number; error: string}>;
  tasks: Array<{id: number; name: string}>;
}

// Helper function to get work hours for a specific date
function getWorkHoursForDate(date: Date, workHours: any): number {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[dayOfWeek];
  return workHours[dayName] || 0;
}

// Helper function to calculate end date based on start date, estimated hours, and user's work schedule
async function calculatePlannedEndDate(
  startDate: Date,
  estimatedHours: number,
  userId: number
): Promise<Date> {
  // Get user's work hours
  const [users] = await pool.execute<RowDataPacket[]>(
    `SELECT WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday,
            WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday
     FROM Users WHERE Id = ?`,
    [userId]
  );

  if (users.length === 0) {
    // Default: 8 hours Mon-Fri
    const workDays = Math.ceil(estimatedHours / 8);
    const endDate = new Date(startDate);
    let addedDays = 0;
    while (addedDays < workDays) {
      endDate.setDate(endDate.getDate() + 1);
      const dayOfWeek = endDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip weekends
        addedDays++;
      }
    }
    return endDate;
  }

  const workHours = {
    sunday: users[0].WorkHoursSunday || 0,
    monday: users[0].WorkHoursMonday || 8,
    tuesday: users[0].WorkHoursTuesday || 8,
    wednesday: users[0].WorkHoursWednesday || 8,
    thursday: users[0].WorkHoursThursday || 8,
    friday: users[0].WorkHoursFriday || 8,
    saturday: users[0].WorkHoursSaturday || 0,
  };

  let remainingHours = estimatedHours;
  const currentDate = new Date(startDate);
  
  while (remainingHours > 0) {
    const hoursForDay = getWorkHoursForDate(currentDate, workHours);
    remainingHours -= hoursForDay;
    if (remainingHours > 0) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return currentDate;
}

/**
 * @swagger
 * /api/task-import/import:
 *   post:
 *     summary: Import tasks from CSV
 *     tags: [TaskImport]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Tasks imported successfully
 *       400:
 *         description: Invalid input
 */
// Import tasks from CSV data
router.post('/import', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { tasks } = req.body as { tasks: TaskImportRow[] };
  const userId = req.user?.userId;

  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    return res.status(400).json({ success: false, message: 'No tasks provided' });
  }

  // ── PASS 1: Full pre-validation (no DB writes) ────────────────────────────
  const validationErrors: Array<{ row: number; error: string }> = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const row = i + 2; // row 1 is the CSV header

    if (!task.ProjectId || !task.TaskName) {
      validationErrors.push({ row, error: 'ProjectId and TaskName are required' });
      continue;
    }

    const projectId = parseInt(task.ProjectId);
    if (isNaN(projectId)) {
      validationErrors.push({ row, error: 'Invalid ProjectId (must be a number)' });
      continue;
    }

    // Verify project exists
    const [projects] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM Projects WHERE Id = ?',
      [projectId]
    );
    if ((projects as RowDataPacket[]).length === 0) {
      validationErrors.push({ row, error: `Project ${projectId} not found` });
      continue;
    }

    // Verify assigned user exists
    if (task.AssignedToUsername) {
      const [users] = await pool.execute<RowDataPacket[]>(
        'SELECT Id FROM Users WHERE Username = ?',
        [task.AssignedToUsername]
      );
      if ((users as RowDataPacket[]).length === 0) {
        validationErrors.push({ row, error: `User '${task.AssignedToUsername}' not found` });
      }
    }
  }

  if (validationErrors.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Import cancelled: ${validationErrors.length} validation error(s) found. No tasks were created.`,
      errors: validationErrors,
      created: 0,
      tasks: [],
    });
  }

  // ── PASS 2 & 3: Insert inside a transaction ───────────────────────────────
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const taskMap = new Map<string, number>(); // TaskName -> inserted TaskId
    const insertedTasks: Array<{ id: number; name: string }> = [];

    // Pass 2: insert tasks
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const projectId = parseInt(task.ProjectId);

      // Resolve AssignedTo user id (already validated above, so will always be found)
      let assignedTo: number | null = null;
      if (task.AssignedToUsername) {
        const [users] = await connection.execute<RowDataPacket[]>(
          'SELECT Id FROM Users WHERE Username = ?',
          [task.AssignedToUsername]
        );
        assignedTo = (users as RowDataPacket[])[0].Id;
      }

      // Calculate planned end date when only start date is provided
      let plannedStartDate = task.PlannedStartDate || null;
      let plannedEndDate = task.PlannedEndDate || null;
      if (task.EstimatedHours && assignedTo && plannedStartDate && !plannedEndDate) {
        const estimatedHours = parseFloat(task.EstimatedHours);
        if (!isNaN(estimatedHours) && estimatedHours > 0) {
          const endDate = await calculatePlannedEndDate(new Date(plannedStartDate), estimatedHours, assignedTo);
          plannedEndDate = endDate.toISOString().split('T')[0];
        }
      }

      // Status/Priority are already mapped to numeric IDs by the frontend
      const statusId = task.Status ? (isNaN(parseInt(String(task.Status))) ? null : parseInt(String(task.Status))) : null;
      const priorityId = task.Priority ? (isNaN(parseInt(String(task.Priority))) ? null : parseInt(String(task.Priority))) : null;

      const [insertResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO Tasks (
          ProjectId, TaskName, Description, Status, Priority,
          AssignedTo, DueDate, EstimatedHours,
          PlannedStartDate, PlannedEndDate, CreatedBy, DisplayOrder
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          task.TaskName,
          task.Description || null,
          statusId,
          priorityId,
          assignedTo,
          task.DueDate || null,
          task.EstimatedHours ? parseFloat(task.EstimatedHours) : null,
          plannedStartDate,
          plannedEndDate,
          userId,
          i,
        ]
      );

      const taskId = (insertResult as ResultSetHeader).insertId;
      taskMap.set(task.TaskName, taskId);
      insertedTasks.push({ id: taskId, name: task.TaskName });
    }

    // Pass 3: set parent/dependency relationships
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!task.TaskName) continue;
      const taskId = taskMap.get(task.TaskName);
      if (!taskId) continue;

      if (task.ParentTaskName) {
        const parentId = taskMap.get(task.ParentTaskName);
        if (!parentId) {
          throw new Error(`Row ${i + 2}: Parent task '${task.ParentTaskName}' not found in import`);
        }
        await connection.execute('UPDATE Tasks SET ParentTaskId = ? WHERE Id = ?', [parentId, taskId]);
      }

      if (task.DependsOnTaskName) {
        const dependsOnId = taskMap.get(task.DependsOnTaskName);
        if (!dependsOnId) {
          throw new Error(`Row ${i + 2}: Dependency task '${task.DependsOnTaskName}' not found in import`);
        }
        await connection.execute('UPDATE Tasks SET DependsOnTaskId = ? WHERE Id = ?', [dependsOnId, taskId]);
      }
    }

    await connection.commit();

    res.json({
      success: true,
      created: insertedTasks.length,
      errors: [],
      tasks: insertedTasks,
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Import tasks error (rolled back):', error);
    res.status(500).json({
      success: false,
      message: `Import failed and was rolled back: ${error.message}`,
      errors: [{ row: 0, error: error.message }],
      created: 0,
      tasks: [],
    });
  } finally {
    connection.release();
  }
});

export default router;
