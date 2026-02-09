import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

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

// Import tasks from CSV data
router.post('/import', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { tasks } = req.body as { tasks: TaskImportRow[] };
    const userId = req.user?.userId;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No tasks provided' 
      });
    }

    const result: ImportResult = {
      success: true,
      created: 0,
      errors: [],
      tasks: []
    };

    // First pass: Validate and collect project IDs
    const projectIds = new Set<number>();
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      if (!task.ProjectId || !task.TaskName) {
        result.errors.push({ 
          row: i + 2, // +2 because row 1 is header, array is 0-indexed
          error: 'ProjectId and TaskName are required' 
        });
        continue;
      }

      const projectId = parseInt(task.ProjectId);
      if (isNaN(projectId)) {
        result.errors.push({ 
          row: i + 2, 
          error: 'Invalid ProjectId' 
        });
        continue;
      }

      projectIds.add(projectId);
    }

    // Validate project access
    for (const projectId of projectIds) {
      const [projects] = await pool.execute<RowDataPacket[]>(
        'SELECT Id FROM Projects WHERE Id = ?',
        [projectId]
      );

      if (projects.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: `Project ${projectId} not found` 
        });
      }
    }

    // Second pass: Create tasks
    const taskMap = new Map<string, number>(); // TaskName -> TaskId mapping

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      if (!task.ProjectId || !task.TaskName) {
        continue; // Skip already validated errors
      }

      const projectId = parseInt(task.ProjectId);

      try {
        // Get user ID if username provided
        let assignedTo: number | null = null;
        if (task.AssignedToUsername) {
          const [users] = await pool.execute<RowDataPacket[]>(
            'SELECT Id FROM Users WHERE Username = ?',
            [task.AssignedToUsername]
          );

          if (users.length === 0) {
            result.errors.push({ 
              row: i + 2, 
              error: `User '${task.AssignedToUsername}' not found` 
            });
            continue;
          }

          assignedTo = users[0].Id;
        }

        // Calculate planned dates if estimated hours and assigned user
        let plannedStartDate = task.PlannedStartDate || null;
        let plannedEndDate = task.PlannedEndDate || null;

        if (task.EstimatedHours && assignedTo && plannedStartDate && !plannedEndDate) {
          const estimatedHours = parseFloat(task.EstimatedHours);
          if (!isNaN(estimatedHours) && estimatedHours > 0) {
            const startDate = new Date(plannedStartDate);
            const endDate = await calculatePlannedEndDate(startDate, estimatedHours, assignedTo);
            plannedEndDate = endDate.toISOString().split('T')[0];
          }
        }

        // Insert task
        const [insertResult] = await pool.execute<ResultSetHeader>(
          `INSERT INTO Tasks (
            ProjectId, TaskName, Description, Status, Priority, 
            AssignedTo, DueDate, EstimatedHours, 
            PlannedStartDate, PlannedEndDate, CreatedBy, DisplayOrder
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            projectId,
            task.TaskName,
            task.Description || null,
            task.Status || 'To Do',
            task.Priority || 'Medium',
            assignedTo,
            task.DueDate || null,
            task.EstimatedHours ? parseFloat(task.EstimatedHours) : null,
            plannedStartDate,
            plannedEndDate,
            userId,
            i // Use row index as display order
          ]
        );

        const taskId = insertResult.insertId;
        taskMap.set(task.TaskName, taskId);
        
        result.created++;
        result.tasks.push({ id: taskId, name: task.TaskName });

      } catch (error: any) {
        result.errors.push({ 
          row: i + 2, 
          error: error.message || 'Failed to create task' 
        });
      }
    }

    // Third pass: Set parent tasks and dependencies
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      if (!task.TaskName) continue;

      const taskId = taskMap.get(task.TaskName);
      if (!taskId) continue;

      try {
        // Set parent task
        if (task.ParentTaskName) {
          const parentId = taskMap.get(task.ParentTaskName);
          if (parentId) {
            await pool.execute(
              'UPDATE Tasks SET ParentTaskId = ? WHERE Id = ?',
              [parentId, taskId]
            );
          } else {
            result.errors.push({ 
              row: i + 2, 
              error: `Parent task '${task.ParentTaskName}' not found in import` 
            });
          }
        }

        // Set dependency
        if (task.DependsOnTaskName) {
          const dependsOnId = taskMap.get(task.DependsOnTaskName);
          if (dependsOnId) {
            await pool.execute(
              'UPDATE Tasks SET DependsOnTaskId = ? WHERE Id = ?',
              [dependsOnId, taskId]
            );
          } else {
            result.errors.push({ 
              row: i + 2, 
              error: `Dependency task '${task.DependsOnTaskName}' not found in import` 
            });
          }
        }
      } catch (error: any) {
        result.errors.push({ 
          row: i + 2, 
          error: `Failed to set relationships: ${error.message}` 
        });
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Import tasks error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to import tasks',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
