import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { dbProvider, pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { createNotification } from './notifications';
import { recordTaskHistory } from './taskHistory';
import { cachedJson, ENTITY_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import { invalidateByEntity } from '../services/cacheInvalidation';
import logger from '../utils/logger';

const router = express.Router();

const invalidateAllocationWrites = async (params: {
  orgId?: number | string;
  projectId?: number | string;
  taskId?: number | string;
}) => {
  await invalidateByEntity('allocation', params);
};

const getTaskPlanningContext = async (taskId: number) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT t.Id as TaskId, t.ProjectId, p.OrganizationId
     FROM Tasks t
     INNER JOIN Projects p ON t.ProjectId = p.Id
     WHERE t.Id = ?`,
    [taskId]
  );
  return rows[0] || null;
};

const normalizeDateKey = (value: unknown): string => String(value || '').split('T')[0];
const PLANNING_HOUR_STEP = 0.5;

const roundToPlanningStep = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const scaled = Math.round((value / PLANNING_HOUR_STEP) + Number.EPSILON);
  return Number((scaled * PLANNING_HOUR_STEP).toFixed(2));
};

const isPlanningStepValue = (value: number): boolean => {
  if (!Number.isFinite(value) || value <= 0) return false;
  const scaled = value / PLANNING_HOUR_STEP;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
};

const getTaskUnscheduledFlag = async (taskId: number): Promise<number | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(UnscheduledWork, 0) as UnscheduledWork
     FROM Tasks
     WHERE Id = ?`,
    [taskId]
  );

  if (rows.length === 0) return null;
  return Number(rows[0].UnscheduledWork || 0);
};

const normalizeDayPortion = (value: unknown): 'full' | 'half' => {
  return String(value || '').toLowerCase() === 'half' ? 'half' : 'full';
};

const getDayPortionCapacityFactor = (value: unknown): number => {
  return normalizeDayPortion(value) === 'half' ? 0.5 : 0;
};

const getDailyCapacityFactorMapForUser = async (userId: number, startDate: string, endDate: string): Promise<Map<string, number>> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT h.HolidayDate
     FROM Users u
     INNER JOIN Holidays h ON h.CountryCode = COALESCE(NULLIF(UPPER(TRIM(u.CountryCode)), ''), 'PT')
     WHERE u.Id = ?
       AND h.IsActive = 1
       AND h.HolidayDate BETWEEN ? AND ?
       AND (
         COALESCE(TRIM(h.RegionCode), '') = ''
         OR UPPER(TRIM(h.RegionCode)) = UPPER(COALESCE(NULLIF(TRIM(u.RegionCode), ''), ''))
       )`,
    [userId, startDate, endDate]
  );

  const result = new Map<string, number>();
  for (const row of rows) {
    result.set(normalizeDateKey(row.HolidayDate), 0);
  }

  const [vacationRows] = await pool.execute<RowDataPacket[]>(
    `SELECT VacationDate, COALESCE(DayPortion, 'full') as DayPortion
     FROM UserVacations
     WHERE UserId = ?
       AND LOWER(Status) = 'approved'
       AND VacationDate BETWEEN ? AND ?`,
    [userId, startDate, endDate]
  );

  for (const row of vacationRows) {
    const dateKey = normalizeDateKey(row.VacationDate);
    const nextFactor = getDayPortionCapacityFactor(row.DayPortion);
    const existing = result.get(dateKey);
    if (existing === undefined) {
      result.set(dateKey, nextFactor);
    } else {
      result.set(dateKey, Math.min(existing, nextFactor));
    }
  }

  const [outOfOfficeRows] = await pool.execute<RowDataPacket[]>(
    `SELECT OutOfOfficeDate, COALESCE(DayPortion, 'full') as DayPortion
     FROM UserOutOfOffice
     WHERE UserId = ?
       AND LOWER(Status) = 'approved'
       AND OutOfOfficeDate BETWEEN ? AND ?`,
    [userId, startDate, endDate]
  );

  for (const row of outOfOfficeRows) {
    const dateKey = normalizeDateKey(row.OutOfOfficeDate);
    const nextFactor = getDayPortionCapacityFactor(row.DayPortion);
    const existing = result.get(dateKey);
    if (existing === undefined) {
      result.set(dateKey, nextFactor);
    } else {
      result.set(dateKey, Math.min(existing, nextFactor));
    }
  }

  return result;
};

const getHolidayDateSetForUser = async (userId: number, startDate: string, endDate: string): Promise<Set<string>> => {
  const factorMap = await getDailyCapacityFactorMapForUser(userId, startDate, endDate);
  const result = new Set<string>();

  for (const [dateKey, factor] of factorMap.entries()) {
    if (factor <= 0) {
      result.add(dateKey);
    }
  }

  return result;
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

const normalizeAllocationMode = (value: any): 'parallel' | 'sequential' => {
  return String(value || '').toLowerCase() === 'sequential' ? 'sequential' : 'parallel';
};

const ensureTaskAllocationHeader = async (
  taskId: number,
  userId: number,
  options?: {
    allocationMode?: string;
    splitOrder?: number | null;
    plannedHours?: number | null;
    createdBy?: number | null;
    forceCreate?: boolean;
    hoursPerDay?: number | null;
  }
): Promise<number> => {
  const allocationMode = normalizeAllocationMode(options?.allocationMode);
  const requestedSplitOrder = Number.isFinite(Number(options?.splitOrder)) ? Number(options?.splitOrder) : null;
  let splitOrder = requestedSplitOrder;
  const plannedHours = Number.isFinite(Number(options?.plannedHours)) ? roundToPlanningStep(Number(options?.plannedHours)) : null;
  const rawHoursPerDay = Number(options?.hoursPerDay);
  const hoursPerDay = Number.isFinite(rawHoursPerDay) && rawHoursPerDay > 0 ? roundToPlanningStep(rawHoursPerDay) : null;

  if (options?.forceCreate) {
    if (splitOrder === null) {
      const [maxOrderRows] = await pool.execute<RowDataPacket[]>(
        `SELECT MAX(SplitOrder) as MaxSplitOrder
         FROM TaskAllocationHeaders
         WHERE TaskId = ?`,
        [taskId]
      );
      const maxSplitOrder = Number(maxOrderRows[0]?.MaxSplitOrder || 0);
      splitOrder = Number.isFinite(maxSplitOrder) ? maxSplitOrder + 1 : 1;
    }

    const [insertResult] = await pool.execute<ResultSetHeader>(
      `INSERT INTO TaskAllocationHeaders (TaskId, UserId, AllocationMode, SplitOrder, PlannedHours, HoursPerDay, CreatedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [taskId, userId, allocationMode, splitOrder, plannedHours, hoursPerDay, options?.createdBy || null]
    );

    return Number(insertResult.insertId);
  }

  const [existingRows] = await pool.execute<RowDataPacket[]>(
    `SELECT Id FROM TaskAllocationHeaders WHERE TaskId = ? AND UserId = ? ORDER BY Id ASC`,
    [taskId, userId]
  );

  if (existingRows.length > 0) {
    const headerId = Number(existingRows[0].Id);
    await pool.execute(
      `UPDATE TaskAllocationHeaders
       SET AllocationMode = ?, SplitOrder = ?, PlannedHours = ?, HoursPerDay = ?
       WHERE Id = ?`,
      [allocationMode, splitOrder, plannedHours, hoursPerDay, headerId]
    );
    return headerId;
  }

  const [insertResult] = await pool.execute<ResultSetHeader>(
    `INSERT INTO TaskAllocationHeaders (TaskId, UserId, AllocationMode, SplitOrder, PlannedHours, HoursPerDay, CreatedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [taskId, userId, allocationMode, splitOrder, plannedHours, hoursPerDay, options?.createdBy || null]
  );

  return Number(insertResult.insertId);
};

const recomputeTaskPlanDatesFromAllocations = async (
  taskId: number,
  changedByUserId: number | null | undefined
): Promise<{ startDate: string | null; endDate: string | null; primaryUserId: number | null }> => {
  const [taskRows] = await pool.execute<RowDataPacket[]>(
    `SELECT PlannedStartDate, PlannedEndDate, AssignedTo
     FROM Tasks
     WHERE Id = ?`,
    [taskId]
  );

  const previousStartDate = taskRows[0]?.PlannedStartDate ? normalizeDateKey(taskRows[0].PlannedStartDate) : null;
  const previousEndDate = taskRows[0]?.PlannedEndDate ? normalizeDateKey(taskRows[0].PlannedEndDate) : null;
  const previousAssignedTo = taskRows[0]?.AssignedTo === null || taskRows[0]?.AssignedTo === undefined
    ? null
    : Number(taskRows[0].AssignedTo);

  const [dateRows] = await pool.execute<RowDataPacket[]>(
    `SELECT MIN(AllocationDate) as startDate, MAX(AllocationDate) as endDate
     FROM TaskAllocations
     WHERE TaskId = ?`,
    [taskId]
  );

  const startDate = dateRows[0]?.startDate ? normalizeDateKey(dateRows[0].startDate) : null;
  const endDate = dateRows[0]?.endDate ? normalizeDateKey(dateRows[0].endDate) : null;

  const [primaryRows] = await pool.execute<RowDataPacket[]>(
    `SELECT tah.UserId
     FROM TaskAllocationHeaders tah
     WHERE tah.TaskId = ?
     ORDER BY CASE WHEN tah.SplitOrder IS NULL THEN 2147483647 ELSE tah.SplitOrder END ASC, tah.Id ASC`,
    [taskId]
  );

  let primaryUserId = primaryRows.length > 0 ? Number(primaryRows[0].UserId) : null;

  if (!primaryUserId) {
    const [fallbackUserRows] = await pool.execute<RowDataPacket[]>(
      `SELECT UserId
       FROM TaskAllocations
       WHERE TaskId = ?
       ORDER BY AllocationDate ASC, StartTime ASC, Id ASC`,
      [taskId]
    );

    primaryUserId = fallbackUserRows.length > 0 ? Number(fallbackUserRows[0].UserId) : null;
  }

  await pool.execute(
    `UPDATE Tasks
     SET PlannedStartDate = ?, PlannedEndDate = ?, AssignedTo = ?
     WHERE Id = ?`,
    [startDate, endDate, primaryUserId, taskId]
  );

  // Update each allocation header with its own date range
  const [headerRows] = await pool.execute<RowDataPacket[]>(
    `SELECT DISTINCT tah.Id
     FROM TaskAllocationHeaders tah
     WHERE tah.TaskId = ?`,
    [taskId]
  );

  for (const headerRow of headerRows) {
    const headerId = Number(headerRow.Id);
    const [allocationDates] = await pool.execute<RowDataPacket[]>(
      `SELECT MIN(AllocationDate) as startDate, MAX(AllocationDate) as endDate
       FROM TaskAllocations
       WHERE TaskAllocationHeaderId = ?`,
      [headerId]
    );

    const headerStartDate = allocationDates[0]?.startDate 
      ? normalizeDateKey(allocationDates[0].startDate)
      : null;
    const headerEndDate = allocationDates[0]?.endDate 
      ? normalizeDateKey(allocationDates[0].endDate)
      : null;

    await pool.execute(
      `UPDATE TaskAllocationHeaders
       SET PlannedStartDate = ?, PlannedEndDate = ?
       WHERE Id = ?`,
      [headerStartDate, headerEndDate, headerId]
    );
  }

  if (primaryUserId) {
    await syncTaskPrimaryAssignee(taskId, primaryUserId, changedByUserId);
  }

  if (changedByUserId) {
    if (previousStartDate !== startDate) {
      await recordTaskHistory(
        taskId,
        changedByUserId,
        'updated',
        'PlannedStartDate',
        previousStartDate || undefined,
        startDate || undefined
      );
    }

    if (previousEndDate !== endDate) {
      await recordTaskHistory(
        taskId,
        changedByUserId,
        'updated',
        'PlannedEndDate',
        previousEndDate || undefined,
        endDate || undefined
      );
    }

    if (previousAssignedTo !== primaryUserId) {
      await recordTaskHistory(
        taskId,
        changedByUserId,
        'updated',
        'AssignedTo',
        previousAssignedTo === null ? undefined : String(previousAssignedTo),
        primaryUserId === null ? undefined : String(primaryUserId)
      );
    }
  }

  return { startDate, endDate, primaryUserId };
};

/**
 * @swagger
 * tags:
 *   name: TaskAllocations
 *   description: Resource planning and allocation endpoints
 */

// Helper function to replan dependent tasks when a task's end date changes
async function replanDependentTasks(taskId: number, newEndDate: string, changedByUserId?: number | null): Promise<void> {
  // Find all tasks that depend on this task and have allocations that start on or before the new end date
  // Include IsHobby flag from Project
  const [dependentTasks] = await pool.execute<RowDataPacket[]>(
    `SELECT t.Id, t.TaskName, t.PlannedStartDate, t.PlannedEndDate, t.AssignedTo,
            ta.UserId,
            COALESCE(p.IsHobby, 0) as IsHobby
     FROM Tasks t
     INNER JOIN TaskAllocations ta ON t.Id = ta.TaskId
     INNER JOIN Projects p ON t.ProjectId = p.Id
     WHERE t.DependsOnTaskId = ?
     GROUP BY t.Id, t.TaskName, t.PlannedStartDate, t.PlannedEndDate, t.AssignedTo, ta.UserId, p.IsHobby
     HAVING MIN(ta.AllocationDate) <= ?`,
    [taskId, newEndDate]
  );

  if (dependentTasks.length === 0) return;

  const newEndDateObj = new Date(newEndDate);
  newEndDateObj.setHours(12, 0, 0, 0);
  const minStartDate = new Date(newEndDateObj);
  minStartDate.setDate(minStartDate.getDate() + 1);

  for (const depTask of dependentTasks) {
    const userId = depTask.UserId || depTask.AssignedTo;
    if (!userId) continue;
    
    const isHobby = depTask.IsHobby === 1;

    // Get TOTAL allocated hours for this task (all allocations, not just conflicting ones)
    const [totalHoursResult] = await pool.execute<RowDataPacket[]>(
      `SELECT SUM(AllocatedHours) as TotalAllocatedHours FROM TaskAllocations WHERE TaskId = ?`,
      [depTask.Id]
    );
    const totalAllocatedHours = parseFloat(totalHoursResult[0]?.TotalAllocatedHours || 0);
    
    if (totalAllocatedHours <= 0) continue;

    // Get user's work hours configuration (including hobby settings)
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday, 
              WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday,
              WorkStartMonday, WorkStartTuesday, WorkStartWednesday, WorkStartThursday,
              WorkStartFriday, WorkStartSaturday, WorkStartSunday,
              HobbyHoursMonday, HobbyHoursTuesday, HobbyHoursWednesday, HobbyHoursThursday,
              HobbyHoursFriday, HobbyHoursSaturday, HobbyHoursSunday,
              HobbyStartMonday, HobbyStartTuesday, HobbyStartWednesday, HobbyStartThursday,
              HobbyStartFriday, HobbyStartSaturday, HobbyStartSunday,
              LunchTime, LunchDuration
       FROM Users WHERE Id = ?`,
      [userId]
    );

    if (users.length === 0) continue;
    const user = users[0];
    
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const getWorkHoursForDay = (date: Date): number => {
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek];
      return parseFloat(user[`WorkHours${dayName}`] || 0);
    };

    const getWorkStartForDay = (date: Date): string => {
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek];
      return user[`WorkStart${dayName}`] || '09:00';
    };

    const getHobbyHoursForDay = (date: Date): number => {
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek];
      return parseFloat(user[`HobbyHours${dayName}`] || 0);
    };

    const getHobbyStartForDay = (date: Date): string => {
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek];
      return user[`HobbyStart${dayName}`] || '19:00';
    };

    // Select appropriate functions based on task type
    const getHoursForDay = isHobby ? getHobbyHoursForDay : getWorkHoursForDay;
    const getStartForDay = isHobby ? getHobbyStartForDay : getWorkStartForDay;

    // Delete current allocations for the dependent task
    await pool.execute('DELETE FROM TaskAllocations WHERE TaskId = ?', [depTask.Id]);
    // Delete child allocations at ALL levels (multi-level hierarchy)
    await pool.execute('DELETE FROM TaskChildAllocations WHERE ChildTaskId = ?', [depTask.Id]);
    await pool.execute(
      `DELETE FROM TaskChildAllocations WHERE ParentTaskId IN (
        WITH RECURSIVE Descendants AS (
          SELECT Id FROM Tasks WHERE Id = ?
          UNION ALL
          SELECT t.Id FROM Tasks t INNER JOIN Descendants d ON t.ParentTaskId = d.Id
        )
        SELECT Id FROM Descendants
      )`,
      [depTask.Id]
    );

    // Replan starting from the day after the parent task ends
    let currentDate = new Date(minStartDate);
    let hoursRemaining = totalAllocatedHours;
    const newAllocations: { date: string; hours: number; startTime: string; endTime: string }[] = [];
    let newStartDate: string | null = null;
    let newTaskEndDate: string | null = null;

    while (hoursRemaining > 0.01) { // Use small threshold to avoid floating point issues
      const maxHours = getHoursForDay(currentDate);
      
      if (maxHours > 0) {
        const hoursToAllocate = Math.min(hoursRemaining, maxHours);
        const dateStr = currentDate.toISOString().split('T')[0];
        const startTime = getStartForDay(currentDate);
        
        // Calculate end time
        const [startHour, startMin] = startTime.split(':').map(Number);
        const endMinutes = (startHour * 60 + startMin) + (hoursToAllocate * 60);
        const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(Math.round(endMinutes % 60)).padStart(2, '0')}`;
        
        newAllocations.push({ date: dateStr, hours: hoursToAllocate, startTime, endTime });
        hoursRemaining -= hoursToAllocate;
        
        if (!newStartDate) newStartDate = dateStr;
        newTaskEndDate = dateStr;
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
      
      // Safety check - don't go more than 365 days
      if (currentDate.getTime() - minStartDate.getTime() > 365 * 24 * 60 * 60 * 1000) break;
    }

    // Insert new allocations
    if (newAllocations.length > 0) {
      const dependentHeaderId = await ensureTaskAllocationHeader(Number(depTask.Id), Number(userId), {
        allocationMode: 'parallel',
        plannedHours: newAllocations.reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0),
        createdBy: null,
      });
      const values = newAllocations.map(a => [depTask.Id, dependentHeaderId, userId, a.date, a.hours, a.startTime, a.endTime, 0]);
      await pool.query(
        'INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual) VALUES ?',
        [values]
      );

      await recomputeTaskPlanDatesFromAllocations(Number(depTask.Id), changedByUserId ?? null);

      // Recursively replan tasks that depend on this dependent task
      if (newTaskEndDate) {
        await replanDependentTasks(depTask.Id, newTaskEndDate, changedByUserId ?? null);
      }
    }
  }
}

/**
 * @swagger
 * /api/task-allocations:
 *   get:
 *     summary: Get all task allocations
 *     tags: [TaskAllocations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: integer
 *         description: Optional project ID to filter allocations
 *     responses:
 *       200:
 *         description: List of task allocations
 *       401:
 *         description: Unauthorized
 */
// Get all allocations (for planning view totals)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { startDate, endDate, projectId } = req.query;
    const cacheScope = `user:${userId}:list:start:${String(startDate || 'all')}:end:${String(endDate || 'all')}:project:${projectId || 'all'}`;

    const allocations = await cachedJson(
      cacheKeys.allocationsList(cacheScope),
      ENTITY_TTL_SECONDS,
      async () => {
        const params: Array<string | number> = [userId as number];
        let dateFilter = '';
        if (startDate && endDate) {
          dateFilter = ' AND ta.AllocationDate BETWEEN ? AND ?';
          params.push(String(startDate), String(endDate));
        }

        let projectFilter = '';
        if (projectId) {
          projectFilter = ' AND t.ProjectId = ?';
          params.push(Number(projectId));
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT ta.TaskId, ta.TaskAllocationHeaderId, ta.UserId, ta.AllocationDate, ta.AllocatedHours,
                  COALESCE(p.IsHobby, 0) as IsHobby,
                  tah.PlannedStartDate, tah.PlannedEndDate
                        , tah.HoursPerDay
           FROM TaskAllocations ta
           INNER JOIN Tasks t ON ta.TaskId = t.Id
           INNER JOIN Projects p ON t.ProjectId = p.Id
           INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
           LEFT JOIN TaskAllocationHeaders tah ON ta.TaskAllocationHeaderId = tah.Id
           WHERE om.UserId = ?${projectFilter}${dateFilter}
           ORDER BY ta.AllocationDate`,
          params
        );
        return rows;
      }
    );

    res.json({ success: true, allocations });
  } catch (error) {
    logger.error('Error fetching all allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch allocations' });
  }
});

/**
 * @swagger
 * /api/task-allocations/project/{projectId}:
 *   get:
 *     summary: Get allocations for a project
 *     tags: [TaskAllocations]
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
 *         description: List of allocations for the project
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
// Get allocations for a project
router.get('/project/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;

    // Verify user has access to this project
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.OrganizationId
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, req.user?.userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    const allocations = await cachedJson(
      cacheKeys.allocationsList(`project:${projectId}:list`),
      ENTITY_TTL_SECONDS,
      async () => {
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT ta.*, t.TaskName, u.Username, u.FirstName, u.LastName,
                  tah.AllocationMode, tah.SplitOrder, tah.PlannedHours
           FROM TaskAllocations ta
           INNER JOIN Tasks t ON ta.TaskId = t.Id
           LEFT JOIN TaskAllocationHeaders tah ON ta.TaskAllocationHeaderId = tah.Id
           LEFT JOIN Users u ON ta.UserId = u.Id
           WHERE t.ProjectId = ?
           ORDER BY ta.AllocationDate DESC,
                    CASE WHEN tah.SplitOrder IS NULL THEN 2147483647 ELSE tah.SplitOrder END ASC,
                    t.TaskName`,
          [projectId]
        );
        return rows;
      }
    );

    res.json({ success: true, allocations });
  } catch (error) {
    logger.error('Error fetching project allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch project allocations' });
  }
});

/**
 * @swagger
 * /api/task-allocations/task/{taskId}:
 *   get:
 *     summary: Get allocations for a task
 *     tags: [TaskAllocations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Task ID
 *     responses:
 *       200:
 *         description: List of allocations for the task
 *       401:
 *         description: Unauthorized
 */
// Get allocations for a task
router.get('/task/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;

    const payload = await cachedJson(
      cacheKeys.allocationsList(`task:${taskId}:list`),
      ENTITY_TTL_SECONDS,
      async () => {
        const [allocations] = await pool.execute<RowDataPacket[]>(
          `SELECT ta.*, u.Username, u.FirstName, u.LastName,
                  tah.AllocationMode, tah.SplitOrder, tah.PlannedHours
           FROM TaskAllocations ta
           LEFT JOIN TaskAllocationHeaders tah ON ta.TaskAllocationHeaderId = tah.Id
           LEFT JOIN Users u ON ta.UserId = u.Id
           WHERE ta.TaskId = ?
           ORDER BY ta.AllocationDate`,
          [taskId]
        );

        const [headers] = await pool.execute<RowDataPacket[]>(
          `SELECT tah.*, u.Username, u.FirstName, u.LastName
           FROM TaskAllocationHeaders tah
           LEFT JOIN Users u ON tah.UserId = u.Id
           WHERE tah.TaskId = ?
           ORDER BY CASE WHEN tah.SplitOrder IS NULL THEN 2147483647 ELSE tah.SplitOrder END ASC, tah.Id ASC`,
          [taskId]
        );

        return { allocations, headers };
      }
    );

    res.json({ success: true, allocations: payload.allocations, headers: payload.headers });
  } catch (error) {
    logger.error('Error fetching task allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch task allocations' });
  }
});

// Update allocation headers for a task (multi-user split metadata)
router.put('/task/:taskId/headers', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = Number(req.params.taskId);
    const headerItems = Array.isArray(req.body?.headers) ? req.body.headers : [];

    if (!Number.isFinite(taskId) || taskId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid taskId is required' });
    }

    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, om.Role, COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE t.Id = ?`,
      [req.user?.userId, taskId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const task = tasks[0];
    const canPlan = task.Role === 'Owner' || task.Role === 'Admin' || task.CanPlanTasks === 1;
    if (!canPlan) {
      return res.status(403).json({ success: false, message: 'No permission to plan tasks' });
    }

    const targetUserIds = new Set<number>();
    for (const item of headerItems) {
      const targetUserId = Number(item?.userId);
      if (!Number.isFinite(targetUserId) || targetUserId <= 0) continue;
      targetUserIds.add(targetUserId);

      await ensureTaskAllocationHeader(taskId, targetUserId, {
        allocationMode: item?.allocationMode,
        splitOrder: item?.splitOrder,
        plannedHours: item?.plannedHours,
        createdBy: req.user?.userId
      });
    }

    const [existingHeaders] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, UserId
       FROM TaskAllocationHeaders
       WHERE TaskId = ?`,
      [taskId]
    );

    for (const existingHeader of existingHeaders) {
      const headerUserId = Number(existingHeader.UserId);
      if (targetUserIds.has(headerUserId)) continue;

      const [userAllocRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count
         FROM TaskAllocations
         WHERE TaskId = ? AND UserId = ?`,
        [taskId, headerUserId]
      );

      if (Number(userAllocRows[0]?.count || 0) === 0) {
        await pool.execute(
          `DELETE FROM TaskAllocationHeaders WHERE Id = ?`,
          [existingHeader.Id]
        );
      }
    }

    await recomputeTaskPlanDatesFromAllocations(taskId, req.user?.userId);

    const [headers] = await pool.execute<RowDataPacket[]>(
      `SELECT tah.*, u.Username, u.FirstName, u.LastName
       FROM TaskAllocationHeaders tah
       LEFT JOIN Users u ON tah.UserId = u.Id
       WHERE tah.TaskId = ?
       ORDER BY CASE WHEN tah.SplitOrder IS NULL THEN 2147483647 ELSE tah.SplitOrder END ASC, tah.Id ASC`,
      [taskId]
    );

    const planningContext = await getTaskPlanningContext(taskId);
    await invalidateAllocationWrites({
      orgId: planningContext?.OrganizationId,
      projectId: planningContext?.ProjectId,
      taskId,
    });

    res.json({ success: true, headers });
  } catch (error) {
    logger.error('Error updating task allocation headers:', error);
    res.status(500).json({ success: false, message: 'Failed to update task allocation headers' });
  }
});

/**
 * @swagger
 * /api/task-allocations/user/{userId}/date/{date}:
 *   get:
 *     summary: Get allocations for a user on a specific date
 *     tags: [TaskAllocations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Date in YYYY-MM-DD format
 *       - in: query
 *         name: isHobby
 *         schema:
 *           type: boolean
 *         description: Filter by hobby/work project type
 *     responses:
 *       200:
 *         description: List of allocations for the user on the date
 *       401:
 *         description: Unauthorized
 */
// Get allocations for a user on a specific date (optionally filtered by hobby/work)
router.get('/user/:userId/date/:date', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, date } = req.params;
    const { isHobby } = req.query;

    let query = `SELECT ta.*, t.TaskName, t.Id as TaskId, COALESCE(p.IsHobby, 0) as IsHobby
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE ta.UserId = ? AND ta.AllocationDate = ?`;
    
    const params: any[] = [userId, date];
    
    // Filter by hobby/work if specified
    if (isHobby !== undefined) {
      const forHobby = isHobby === 'true' || isHobby === '1';
      query += ` AND COALESCE(p.IsHobby, 0) = ?`;
      params.push(forHobby ? 1 : 0);
    }
    
    query += ` ORDER BY ta.StartTime`;

    const [allocations] = await pool.execute<RowDataPacket[]>(query, params);

    // Also fetch recurring allocation occurrences for this date
    const [recurringOccurrences] = await pool.execute<RowDataPacket[]>(
      `SELECT rao.*, ra.Title as TaskName, 0 as IsHobby
       FROM RecurringAllocationOccurrences rao
       INNER JOIN RecurringAllocations ra ON rao.RecurringAllocationId = ra.Id
       WHERE rao.UserId = ? AND rao.OccurrenceDate = ? AND ra.IsActive = 1
       ORDER BY rao.StartTime`,
      [userId, date]
    );

    // Combine allocations with recurring occurrences
    const combinedAllocations = [
      ...allocations,
      ...recurringOccurrences.map(occ => ({
        ...occ,
        TaskId: null, // Recurring tasks don't have a TaskId
        IsRecurring: true
      }))
    ];

    res.json({ success: true, allocations: combinedAllocations });
  } catch (error) {
    logger.error('Error fetching user date allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch allocations' });
  }
});

/**
 * @swagger
 * /api/task-allocations/push-forward:
 *   post:
 *     summary: Push forward allocations from a date
 *     tags: [TaskAllocations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [taskId, fromDate, days]
 *             properties:
 *               taskId:
 *                 type: integer
 *               fromDate:
 *                 type: string
 *                 format: date
 *               days:
 *                 type: integer
 *                 description: Number of days to push forward
 *     responses:
 *       200:
 *         description: Allocations pushed forward successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
// Push forward allocations from a date - clears conflicts and replans tasks
router.post('/push-forward', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, fromDate, newTaskId, newTaskHours } = req.body;

    if (!userId || !fromDate || !newTaskId || !newTaskHours) {
      return res.status(400).json({ 
        success: false, 
        message: 'userId, fromDate, newTaskId, and newTaskHours are required' 
      });
    }

    const newTaskUnscheduled = await getTaskUnscheduledFlag(Number(newTaskId));
    if (newTaskUnscheduled === null) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }
    if (newTaskUnscheduled === 1) {
      return res.status(400).json({
        success: false,
        message: 'Unscheduled work tasks cannot be planned'
      });
    }

    // Get user's work hours configuration (including hobby settings)
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday, 
              WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday,
              WorkStartMonday, WorkStartTuesday, WorkStartWednesday, WorkStartThursday,
              WorkStartFriday, WorkStartSaturday, WorkStartSunday,
              LunchTime, LunchDuration,
              HobbyStartMonday, HobbyStartTuesday, HobbyStartWednesday, HobbyStartThursday,
              HobbyStartFriday, HobbyStartSaturday, HobbyStartSunday,
              HobbyHoursMonday, HobbyHoursTuesday, HobbyHoursWednesday, HobbyHoursThursday,
              HobbyHoursFriday, HobbyHoursSaturday, HobbyHoursSunday,
              CountryCode
       FROM Users WHERE Id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const holidayWindowEnd = new Date(fromDate + 'T12:00:00');
    holidayWindowEnd.setDate(holidayWindowEnd.getDate() + 5475);
    const holidayWindowEndStr = normalizeDateKey(holidayWindowEnd.toISOString());
    const dayCapacityFactors = await getDailyCapacityFactorMapForUser(Number(userId), normalizeDateKey(fromDate), holidayWindowEndStr);

    const getDateKey = (date: Date): string => {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    
    // Helper function to check if a date is a work day and get max hours
    const getWorkHoursForDay = (date: Date): number => {
      const dayFactor = Math.max(0, Math.min(1, Number(dayCapacityFactors.get(getDateKey(date)) ?? 1)));
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek];
      const workHoursKey = `WorkHours${dayName}`;
      return parseFloat(user[workHoursKey] || 0) * dayFactor;
    };

    const getWorkStartForDay = (date: Date): string => {
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek];
      const workStartKey = `WorkStart${dayName}`;
      return user[workStartKey] || '09:00';
    };

    // Hobby helper functions
    const getHobbyHoursForDay = (date: Date): number => {
      const dayFactor = Math.max(0, Math.min(1, Number(dayCapacityFactors.get(getDateKey(date)) ?? 1)));
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek];
      const hobbyHoursKey = `HobbyHours${dayName}`;
      return parseFloat(user[hobbyHoursKey] || 0) * dayFactor;
    };

    const getHobbyStartForDay = (date: Date): string => {
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek];
      const hobbyStartKey = `HobbyStart${dayName}`;
      return user[hobbyStartKey] || '19:00';
    };

    // Helper function to get the work end time for a given day
    const getWorkEndForDay = (date: Date): string => {
      const workStart = getWorkStartForDay(date);
      const workHours = getWorkHoursForDay(date);
      const [startHour, startMin] = workStart.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      
      // Calculate end time: start + work hours + lunch duration (if lunch is within work hours)
      const lunchTimeRaw = user.LunchTime;
      const lunchTime = (typeof lunchTimeRaw === 'string' && lunchTimeRaw.includes(':')) ? lunchTimeRaw : '13:00';
      const lunchDur = (typeof user.LunchDuration === 'number' && user.LunchDuration >= 0) ? user.LunchDuration : 60;
      const [lunchH, lunchM] = lunchTime.split(':').map(Number);
      const lunchStartMins = lunchH * 60 + lunchM;
      
      let endMinutes = startMinutes + workHours * 60;
      // If work spans lunch, add lunch duration
      if (lunchDur > 0 && startMinutes < lunchStartMins && (startMinutes + workHours * 60) > lunchStartMins) {
        endMinutes += lunchDur;
      }
      
      return `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
    };

    // Helper function to advance to next work day (considers hobby flag)
    const advanceToNextWorkDay = (date: Date, isHobby: boolean = false): Date => {
      const result = new Date(date);
      result.setDate(result.getDate() + 1);
      const getHoursForDay = isHobby ? getHobbyHoursForDay : getWorkHoursForDay;
      while (getHoursForDay(result) <= 0) {
        result.setDate(result.getDate() + 1);
      }
      return result;
    };

    // Get all distinct tasks that have allocations from the given date onwards
    // Calculate the ACTUAL hours allocated from that date, not estimated hours
    // Order by the FIRST allocation date from the conflict date AND the start time to preserve original order
    // Include IsHobby flag from Project
    const [affectedTasksRows] = await pool.execute<RowDataPacket[]>(
      `SELECT ta.TaskId, 
              SUM(ta.AllocatedHours) as AllocatedHoursFromDate,
              MIN(ta.AllocationDate) as FirstAllocationDate,
              MIN(ta.StartTime) as FirstStartTime,
              MIN(TIMESTAMP(ta.AllocationDate, ta.StartTime)) as FirstAllocationDateTime,
              COALESCE(t.DueDateMandatory, 0) as DueDateMandatory,
              COALESCE(p.IsHobby, 0) as IsHobby
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
      WHERE ta.UserId = ? AND ta.AllocationDate >= ? AND COALESCE(t.UnscheduledWork, 0) = 0
       GROUP BY ta.TaskId, t.DueDateMandatory, p.IsHobby
       ORDER BY FirstAllocationDate ASC, FirstStartTime ASC, ta.TaskId ASC`,
      [userId, fromDate]
    );

    const affectedTasksData = [...affectedTasksRows] as RowDataPacket[];

    // CRITICAL: Also detect parent tasks that have child allocations from this date onward.
    // If omitted, push-forward can add new planning without replanning the related main task,
    // causing apparent extra planned hours.
    const [parentTasksFromChildRows] = await pool.execute<RowDataPacket[]>(
      `SELECT tca.ParentTaskId as TaskId,
              MIN(tca.AllocationDate) as FirstChildAllocationDate
       FROM TaskChildAllocations tca
       INNER JOIN TaskAllocations ta
         ON ta.TaskId = tca.ParentTaskId
        AND ta.AllocationDate = tca.AllocationDate
       WHERE ta.UserId = ?
         AND tca.AllocationDate >= ?
       GROUP BY tca.ParentTaskId`,
      [userId, fromDate]
    );

    const parentTaskIdsFromChildAllocations = new Set<number>();
    const parentTaskFirstChildAllocationDate = new Map<number, string>();
    for (const row of parentTasksFromChildRows as RowDataPacket[]) {
      const taskId = Number(row.TaskId);
      if (!Number.isFinite(taskId) || taskId <= 0) continue;
      parentTaskIdsFromChildAllocations.add(taskId);
      if (row.FirstChildAllocationDate) {
        const dateText = row.FirstChildAllocationDate instanceof Date
          ? `${row.FirstChildAllocationDate.getFullYear()}-${String(row.FirstChildAllocationDate.getMonth() + 1).padStart(2, '0')}-${String(row.FirstChildAllocationDate.getDate()).padStart(2, '0')}`
          : String(row.FirstChildAllocationDate).split('T')[0];
        parentTaskFirstChildAllocationDate.set(taskId, dateText);
      }
    }

    if (parentTaskIdsFromChildAllocations.size > 0) {
      const affectedTaskIdSet = new Set<number>(
        affectedTasksData.map((row) => Number(row.TaskId)).filter((taskId) => Number.isFinite(taskId) && taskId > 0)
      );

      const missingParentIds = Array.from(parentTaskIdsFromChildAllocations).filter((taskId) => !affectedTaskIdSet.has(taskId));

      if (missingParentIds.length > 0) {
        const placeholders = missingParentIds.map(() => '?').join(',');
        const [missingParentTaskRows] = await pool.execute<RowDataPacket[]>(
          `SELECT ta.TaskId,
                  SUM(ta.AllocatedHours) as AllocatedHoursFromDate,
                  MIN(ta.AllocationDate) as FirstAllocationDate,
                  MIN(ta.StartTime) as FirstStartTime,
                  MIN(TIMESTAMP(ta.AllocationDate, ta.StartTime)) as FirstAllocationDateTime,
                  COALESCE(t.DueDateMandatory, 0) as DueDateMandatory,
                  COALESCE(p.IsHobby, 0) as IsHobby
           FROM TaskAllocations ta
           INNER JOIN Tasks t ON ta.TaskId = t.Id
           INNER JOIN Projects p ON t.ProjectId = p.Id
           WHERE ta.UserId = ? AND ta.AllocationDate >= ? AND ta.TaskId IN (${placeholders}) AND COALESCE(t.UnscheduledWork, 0) = 0
           GROUP BY ta.TaskId, t.DueDateMandatory, p.IsHobby`,
          [userId, fromDate, ...missingParentIds]
        );

        affectedTasksData.push(...(missingParentTaskRows as RowDataPacket[]));
      }
    }

    affectedTasksData.sort((a, b) => {
      const dateA = String(a.FirstAllocationDate || '9999-12-31');
      const dateB = String(b.FirstAllocationDate || '9999-12-31');
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = String(a.FirstStartTime || '23:59');
      const timeB = String(b.FirstStartTime || '23:59');
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      return Number(a.TaskId) - Number(b.TaskId);
    });

    if (affectedTasksData.length === 0) {
      return res.json({ success: true, message: 'No allocations to push forward' });
    }

    // FIRST: Delete ALL existing allocations for the NEW task being planned
    // (not just from fromDate, but ALL of them to avoid duplicates)
    await pool.execute(
      `DELETE FROM TaskAllocations WHERE TaskId = ?`,
      [newTaskId]
    );
    await pool.execute(
      `DELETE FROM TaskChildAllocations WHERE ChildTaskId = ?`,
      [newTaskId]
    );
    const deleteNewTaskChildAllocationsQuery = dbProvider === 'mssql'
      ? `;WITH Descendants AS (
           SELECT Id FROM Tasks WHERE Id = ?
           UNION ALL
           SELECT t.Id FROM Tasks t INNER JOIN Descendants d ON t.ParentTaskId = d.Id
         )
         DELETE FROM TaskChildAllocations
         WHERE ParentTaskId IN (SELECT Id FROM Descendants)`
      : `DELETE FROM TaskChildAllocations WHERE ParentTaskId IN (
           WITH RECURSIVE Descendants AS (
             SELECT Id FROM Tasks WHERE Id = ?
             UNION ALL
             SELECT t.Id FROM Tasks t INNER JOIN Descendants d ON t.ParentTaskId = d.Id
           )
           SELECT Id FROM Descendants
         )`;
    await pool.execute(deleteNewTaskChildAllocationsQuery, [newTaskId]);

    // Get lunch settings (only for work tasks, not hobby)
    const lunchTimeRaw = user.LunchTime;
    const lunchTime = (typeof lunchTimeRaw === 'string' && lunchTimeRaw.includes(':')) ? lunchTimeRaw : '12:00';
    const lunchDuration = (typeof user.LunchDuration === 'number' && user.LunchDuration >= 0) ? user.LunchDuration : 60;
    const [lunchHour, lunchMin] = lunchTime.split(':').map(Number);
    const lunchStartMinutes = lunchHour * 60 + lunchMin;
    const lunchEndMinutes = lunchStartMinutes + lunchDuration;

    // Track slots separately for work and hobby tasks
    const workDaySlots: { [date: string]: number } = {};
    const hobbyDaySlots: { [date: string]: number } = {};
    
    // Track recurring allocation time blocks per day (these cannot be moved)
    // Format: { date: [{startMinutes, endMinutes, hours}] }
    const recurringBlocks: { [date: string]: Array<{startMinutes: number, endMinutes: number, hours: number}> } = {};
    
    // Pre-load recurring allocations for the next 365 days
    const recurringEndDate = new Date(fromDate);
    recurringEndDate.setDate(recurringEndDate.getDate() + 365);
    
    const [recurringOccurrences] = await pool.execute<RowDataPacket[]>(
      `SELECT rao.OccurrenceDate, rao.StartTime, rao.EndTime, rao.AllocatedHours
       FROM RecurringAllocationOccurrences rao
       INNER JOIN RecurringAllocations ra ON rao.RecurringAllocationId = ra.Id
       WHERE rao.UserId = ? AND rao.OccurrenceDate >= ? AND rao.OccurrenceDate <= ?
       AND ra.IsActive = 1
       ORDER BY rao.OccurrenceDate, rao.StartTime`,
      [userId, fromDate, recurringEndDate.toISOString().split('T')[0]]
    );
    
    // Build recurring blocks map
    for (const occ of recurringOccurrences as RowDataPacket[]) {
      let dateStr: string;
      if (occ.OccurrenceDate instanceof Date) {
        const d = occ.OccurrenceDate;
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      } else {
        dateStr = String(occ.OccurrenceDate).split('T')[0];
      }
      
      if (!recurringBlocks[dateStr]) {
        recurringBlocks[dateStr] = [];
      }
      
      const [startH, startM] = (occ.StartTime || '09:00').split(':').map(Number);
      const [endH, endM] = (occ.EndTime || '10:00').split(':').map(Number);
      
      recurringBlocks[dateStr].push({
        startMinutes: startH * 60 + startM,
        endMinutes: endH * 60 + endM,
        hours: parseFloat(occ.AllocatedHours) || 0
      });
    }
    
    logger.info(`Push-forward: loaded ${recurringOccurrences.length} recurring blocks for user ${userId}`);

    // Get IsHobby for the new task
    const [newTaskInfo] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(p.IsHobby, 0) as IsHobby
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE t.Id = ?`,
      [newTaskId]
    );
    const newTaskIsHobby = newTaskInfo.length > 0 && newTaskInfo[0].IsHobby === 1;

    logger.info(`Push-forward: new task ${newTaskId} (${newTaskHours}h, hobby=${newTaskIsHobby}) starting from ${fromDate}`);
    
    const formatTime = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = Math.round(mins % 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const parseTimeToMinutes = (timeValue: any): number => {
      const timeText = String(timeValue || '00:00');
      const [hours, minutes] = timeText.split(':').map(Number);
      return ((Number.isFinite(hours) ? hours : 0) * 60) + (Number.isFinite(minutes) ? minutes : 0);
    };

    const reserveExistingTaskSlots = async (taskId: number, isHobby: boolean) => {
      const [existingAllocations] = await pool.execute<RowDataPacket[]>(
        `SELECT AllocationDate, StartTime, EndTime, AllocatedHours
         FROM TaskAllocations
         WHERE TaskId = ? AND UserId = ? AND AllocationDate >= ?
         ORDER BY AllocationDate ASC, StartTime ASC`,
        [taskId, userId, fromDate]
      );

      const daySlots = isHobby ? hobbyDaySlots : workDaySlots;

      for (const allocation of existingAllocations as RowDataPacket[]) {
        const dateStr = allocation.AllocationDate instanceof Date
          ? `${allocation.AllocationDate.getFullYear()}-${String(allocation.AllocationDate.getMonth() + 1).padStart(2, '0')}-${String(allocation.AllocationDate.getDate()).padStart(2, '0')}`
          : String(allocation.AllocationDate).split('T')[0];

        const startMinutes = parseTimeToMinutes(allocation.StartTime || '09:00');
        const endMinutes = allocation.EndTime
          ? parseTimeToMinutes(allocation.EndTime)
          : startMinutes + Math.round((parseFloat(String(allocation.AllocatedHours || 0)) || 0) * 60);

        daySlots[dateStr] = Math.max(daySlots[dateStr] ?? 0, endMinutes);
      }
    };
    
    // Allocate hours for a task using available slots - returns the last allocation date
    const allocateTask = async (taskId: number, hoursToAllocate: number, startFromDate: Date, isHobby: boolean = false): Promise<Date> => {
      let lastAllocationDate = new Date(startFromDate);
      let currentDate = new Date(startFromDate);
      let remaining = hoursToAllocate;
      const taskHeaderId = await ensureTaskAllocationHeader(Number(taskId), Number(userId), {
        allocationMode: 'parallel',
        plannedHours: hoursToAllocate,
        createdBy: req.user?.userId || null,
      });
      
      // Select appropriate functions and slot tracker based on task type
      const getHoursForDay = isHobby ? getHobbyHoursForDay : getWorkHoursForDay;
      const getStartForDay = isHobby ? getHobbyStartForDay : getWorkStartForDay;
      const daySlots = isHobby ? hobbyDaySlots : workDaySlots;
      // Hobby tasks don't have lunch break
      const effectiveLunchDuration = isHobby ? 0 : lunchDuration;
      
      while (remaining > 0) {
        const dayMaxHours = getHoursForDay(currentDate);
        if (dayMaxHours <= 0) {
          currentDate = advanceToNextWorkDay(currentDate, isHobby);
          continue;
        }
        
        const dateStr = currentDate.toISOString().split('T')[0];
        const slotStartTime = getStartForDay(currentDate);
        const [startHour, startMin] = slotStartTime.split(':').map(Number);
        const dayStartMinutes = startHour * 60 + startMin;
        
        // Calculate work periods (hobby doesn't have lunch)
        const morningHours = effectiveLunchDuration > 0 ? Math.max(0, (lunchStartMinutes - dayStartMinutes) / 60) : dayMaxHours;
        const afternoonHours = dayMaxHours - morningHours;
        const workEndMinutes = effectiveLunchDuration > 0 ? lunchEndMinutes + afternoonHours * 60 : dayStartMinutes + dayMaxHours * 60;
        
        // Get current slot position for this day
        let slotStart = daySlots[dateStr] ?? dayStartMinutes;
        
        // Skip lunch if we're at lunch time (only for work tasks)
        if (effectiveLunchDuration > 0 && slotStart >= lunchStartMinutes && slotStart < lunchEndMinutes) {
          slotStart = lunchEndMinutes;
        }
        
        // Check for recurring blocks on this day and skip past them if we overlap
        const dayRecurringBlocks = recurringBlocks[dateStr] || [];
        for (const block of dayRecurringBlocks) {
          // If our slot start is within a recurring block, skip past it
          if (slotStart >= block.startMinutes && slotStart < block.endMinutes) {
            logger.info(`  Task ${taskId} @ ${dateStr}: skipping recurring block ${formatTime(block.startMinutes)}-${formatTime(block.endMinutes)}`);
            slotStart = block.endMinutes;
          }
        }
        
        // Check if day is full
        if (slotStart >= workEndMinutes) {
          currentDate = advanceToNextWorkDay(currentDate, isHobby);
          continue;
        }
        
        // Calculate available minutes from current slot (accounting for lunch if not hobby)
        let availableMinutes: number;
        if (slotStart < lunchStartMinutes && effectiveLunchDuration > 0) {
          // In morning - can use until lunch + afternoon
          const morningAvail = lunchStartMinutes - slotStart;
          const afternoonAvail = workEndMinutes - lunchEndMinutes;
          availableMinutes = morningAvail + afternoonAvail;
        } else {
          // In afternoon (or no lunch/hobby) - just until work end
          availableMinutes = workEndMinutes - slotStart;
        }
        
        // Subtract any recurring blocks that fall between slotStart and workEnd
        for (const block of dayRecurringBlocks) {
          if (block.startMinutes >= slotStart && block.endMinutes <= workEndMinutes) {
            // Block is entirely within our available window - subtract its duration
            availableMinutes -= (block.endMinutes - block.startMinutes);
          } else if (block.startMinutes < workEndMinutes && block.endMinutes > slotStart) {
            // Partial overlap - handle more carefully
            const overlapStart = Math.max(block.startMinutes, slotStart);
            const overlapEnd = Math.min(block.endMinutes, workEndMinutes);
            if (overlapEnd > overlapStart) {
              availableMinutes -= (overlapEnd - overlapStart);
            }
          }
        }
        
        if (availableMinutes <= 0) {
          currentDate = advanceToNextWorkDay(currentDate, isHobby);
          continue;
        }
        
        const hoursNow = Math.min(remaining, availableMinutes / 60);
        const minutesToAllocate = hoursNow * 60;
        
        // Check if this allocation crosses lunch - if so, split it (only for work tasks)
        if (effectiveLunchDuration > 0 && slotStart < lunchStartMinutes) {
          const morningAvail = lunchStartMinutes - slotStart;
          
          if (minutesToAllocate > morningAvail) {
            // SPLIT: Create morning allocation first
            const morningHoursToAllocate = morningAvail / 60;
            const morningStart = slotStart;
            const morningEnd = lunchStartMinutes;
            
            logger.info(`  Task ${taskId} @ ${dateStr} (morning): ${formatTime(morningStart)}-${formatTime(morningEnd)} (${morningHoursToAllocate}h)`);
            
            await pool.execute(
              `INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
              [taskId, taskHeaderId, userId, dateStr, morningHoursToAllocate, formatTime(morningStart), formatTime(morningEnd)]
            );
            
            // Create afternoon allocation
            const afternoonMinutes = minutesToAllocate - morningAvail;
            const afternoonHoursToAllocate = afternoonMinutes / 60;
            const afternoonStart = lunchEndMinutes;
            let afternoonEnd = lunchEndMinutes + afternoonMinutes;
            
            // Cap at work end
            if (afternoonEnd > workEndMinutes) {
              afternoonEnd = workEndMinutes;
            }
            
            logger.info(`  Task ${taskId} @ ${dateStr} (afternoon): ${formatTime(afternoonStart)}-${formatTime(afternoonEnd)} (${afternoonHoursToAllocate}h)`);
            
            await pool.execute(
              `INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
              [taskId, taskHeaderId, userId, dateStr, afternoonHoursToAllocate, formatTime(afternoonStart), formatTime(afternoonEnd)]
            );
            
            // Update slot position
            daySlots[dateStr] = afternoonEnd;
            remaining -= hoursNow;
            
            // If day is now full, advance
            if (daySlots[dateStr] >= workEndMinutes) {
              currentDate = advanceToNextWorkDay(currentDate, isHobby);
            }
            continue;
          }
        }
        
        // Single allocation (doesn't cross lunch or is hobby)
        let actualStart = slotStart;
        let actualEnd = actualStart + minutesToAllocate;
        
        // Safety cap at work end
        if (actualEnd > workEndMinutes) {
          actualEnd = workEndMinutes;
        }
        
        // Check if allocation would cross a recurring block - if so, stop before it
        for (const block of dayRecurringBlocks) {
          if (actualStart < block.startMinutes && actualEnd > block.startMinutes) {
            // Proposed allocation would cross into a recurring block - stop before it
            logger.info(`  Task ${taskId} @ ${dateStr}: stopping at ${formatTime(block.startMinutes)} due to recurring block`);
            actualEnd = block.startMinutes;
            break;
          }
        }
        
        // Recalculate hours based on potentially shortened allocation
        const actualMinutes = actualEnd - actualStart;
        if (actualMinutes <= 0) {
          // No room left before the recurring block, skip to after the block
          currentDate = advanceToNextWorkDay(currentDate, isHobby);
          continue;
        }
        const actualHours = actualMinutes / 60;
        
        logger.info(`  Task ${taskId} @ ${dateStr}: ${formatTime(actualStart)}-${formatTime(actualEnd)} (${actualHours}h, hobby=${isHobby})`);
        
        // Create allocation
        await pool.execute(
          `INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
          [taskId, taskHeaderId, userId, dateStr, actualHours, formatTime(actualStart), formatTime(actualEnd)]
        );
        
        // Track the last allocation date
        lastAllocationDate = new Date(currentDate);
        
        // Update slot position for this day
        daySlots[dateStr] = actualEnd;
        
        // Skip past recurring blocks if we're now at one
        for (const block of dayRecurringBlocks) {
          if (daySlots[dateStr] >= block.startMinutes && daySlots[dateStr] < block.endMinutes) {
            daySlots[dateStr] = block.endMinutes;
          }
        }
        
        // Skip lunch if we're now at lunch (only for work tasks)
        if (effectiveLunchDuration > 0 && daySlots[dateStr] >= lunchStartMinutes && daySlots[dateStr] < lunchEndMinutes) {
          daySlots[dateStr] = lunchEndMinutes;
        }
        
        remaining -= actualHours;
        
        // If day is now full, advance
        if (daySlots[dateStr] >= workEndMinutes) {
          currentDate = advanceToNextWorkDay(currentDate, isHobby);
        }
      }
      
      return lastAllocationDate;
    };

    const startDate = new Date(fromDate + 'T12:00:00');

    // FIRST: Allocate the NEW task with its hobby flag and get its end date
    logger.info(`Allocating NEW Task ${newTaskId}: ${newTaskHours}h (hobby=${newTaskIsHobby})`);
    const newTaskEndDate = await allocateTask(newTaskId, newTaskHours, startDate, newTaskIsHobby);
    const newTaskEndDateStr = newTaskEndDate.toISOString().split('T')[0];
    logger.info(`New task ends on: ${newTaskEndDateStr}`);

    const [newTaskLastAllocationRows] = await pool.execute<RowDataPacket[]>(
      `SELECT AllocationDate, EndTime
       FROM TaskAllocations
       WHERE TaskId = ? AND UserId = ?
       ORDER BY AllocationDate DESC, EndTime DESC
       LIMIT 1`,
      [newTaskId, userId]
    );

    let newTaskEndDateTime = new Date(`${newTaskEndDateStr}T23:59:59`);
    if (newTaskLastAllocationRows.length > 0) {
      const lastAlloc = newTaskLastAllocationRows[0];
      const allocDate = lastAlloc.AllocationDate instanceof Date
        ? `${lastAlloc.AllocationDate.getFullYear()}-${String(lastAlloc.AllocationDate.getMonth() + 1).padStart(2, '0')}-${String(lastAlloc.AllocationDate.getDate()).padStart(2, '0')}`
        : String(lastAlloc.AllocationDate).split('T')[0];
      const endTime = String(lastAlloc.EndTime || '23:59');
      const parsedEnd = new Date(`${allocDate}T${endTime}:00`);
      if (!Number.isNaN(parsedEnd.getTime())) {
        newTaskEndDateTime = parsedEnd;
      }
    }

    // Replanned conflicting tasks must start AFTER the pushed task is finished.
    // Use next day at noon to avoid timezone edge cases.
    const replanStartDate = new Date(newTaskEndDateStr + 'T12:00:00');
    replanStartDate.setDate(replanStartDate.getDate() + 1);

    // Decide which tasks to replan:
    // - Replan only tasks that truly conflict with the pushed task window
    // - Keep mandatory due date tasks fixed
    // - Keep non-conflicting tasks fixed
    // Fixed tasks reserve their occupied slots so replanned tasks continue after occupied periods.
    const tasksToReplan: RowDataPacket[] = [];

    for (const taskData of affectedTasksData) {
      if (Number(taskData.TaskId) === Number(newTaskId)) continue;

      const remainingHours = parseFloat(String(taskData.AllocatedHoursFromDate || 0)) || 0;
      if (remainingHours <= 0) continue;

      const hasMandatoryDueDate = Number(taskData.DueDateMandatory || 0) === 1;
      const taskIsHobby = Number(taskData.IsHobby || 0) === 1;

      const firstAllocDateTime = taskData.FirstAllocationDateTime
        ? (taskData.FirstAllocationDateTime instanceof Date
            ? taskData.FirstAllocationDateTime
            : new Date(String(taskData.FirstAllocationDateTime).replace(' ', 'T')))
        : (taskData.FirstAllocationDate
            ? new Date(`${String(taskData.FirstAllocationDate).split('T')[0]}T${String(taskData.FirstStartTime || '00:00')}:00`)
            : null);

      const childFirstDateText = parentTaskFirstChildAllocationDate.get(Number(taskData.TaskId));
      const childFirstDateTime = childFirstDateText ? new Date(`${childFirstDateText}T00:00:00`) : null;
      const hasChildChainConflict = !!(
        childFirstDateTime &&
        !Number.isNaN(childFirstDateTime.getTime()) &&
        childFirstDateTime <= newTaskEndDateTime
      );

      const hasDirectConflict = !!(
        firstAllocDateTime &&
        !Number.isNaN(firstAllocDateTime.getTime()) &&
        firstAllocDateTime <= newTaskEndDateTime
      );

      const shouldReplan = hasDirectConflict || hasChildChainConflict;

      if (hasMandatoryDueDate) {
        logger.info(`Task ${taskData.TaskId} preserved: mandatory due date (allocation locked)`);
        await reserveExistingTaskSlots(Number(taskData.TaskId), taskIsHobby);
        continue;
      }

      if (!shouldReplan) {
        logger.info(`Task ${taskData.TaskId} preserved: no conflict with pushed task window`);
        await reserveExistingTaskSlots(Number(taskData.TaskId), taskIsHobby);
        continue;
      }

      tasksToReplan.push(taskData);
    }

    // Replan movable conflicting tasks in stable chronological order
    for (const taskData of tasksToReplan) {
      const remainingHours = parseFloat(taskData.AllocatedHoursFromDate) || 0;

      logger.info(`Task ${taskData.TaskId} starts on ${taskData.FirstAllocationDate} (conflict) - DELETING and replanning`);
      await pool.execute(
        `DELETE FROM TaskAllocations 
         WHERE TaskId = ? AND UserId = ? AND AllocationDate >= ?`,
        [taskData.TaskId, userId, fromDate]
      );
      // Delete child allocations at ALL levels from the given date onwards
      await pool.execute(
        `DELETE FROM TaskChildAllocations WHERE ChildTaskId = ? AND AllocationDate >= ?`,
        [taskData.TaskId, fromDate]
      );
      const deleteReplanChildAllocationsQuery = dbProvider === 'mssql'
        ? `;WITH Descendants AS (
             SELECT Id FROM Tasks WHERE Id = ?
             UNION ALL
             SELECT t.Id FROM Tasks t INNER JOIN Descendants d ON t.ParentTaskId = d.Id
           )
           DELETE FROM TaskChildAllocations
           WHERE AllocationDate >= ?
             AND ParentTaskId IN (SELECT Id FROM Descendants)`
        : `DELETE FROM TaskChildAllocations WHERE AllocationDate >= ? AND ParentTaskId IN (
             WITH RECURSIVE Descendants AS (
               SELECT Id FROM Tasks WHERE Id = ?
               UNION ALL
               SELECT t.Id FROM Tasks t INNER JOIN Descendants d ON t.ParentTaskId = d.Id
             )
             SELECT Id FROM Descendants
           )`;
      if (dbProvider === 'mssql') {
        await pool.execute(deleteReplanChildAllocationsQuery, [taskData.TaskId, fromDate]);
      } else {
        await pool.execute(deleteReplanChildAllocationsQuery, [fromDate, taskData.TaskId]);
      }
      
      const taskIsHobby = taskData.IsHobby === 1;
      logger.info(`Re-allocating Task ${taskData.TaskId}: ${remainingHours}h (hobby=${taskIsHobby})`);
      await allocateTask(taskData.TaskId, remainingHours, replanStartDate, taskIsHobby);
    }


    await recomputeTaskPlanDatesFromAllocations(Number(newTaskId), req.user?.userId);

    // Update PlannedStartDate and PlannedEndDate for affected tasks
    for (const taskData of affectedTasksData) {
      await recomputeTaskPlanDatesFromAllocations(Number(taskData.TaskId), req.user?.userId);
    }

    const planningContext = await getTaskPlanningContext(Number(newTaskId));
    await invalidateAllocationWrites({
      orgId: planningContext?.OrganizationId,
      projectId: planningContext?.ProjectId,
      taskId: Number(newTaskId),
    });

    res.json({ 
      success: true, 
      message: `Allocated new task and replanned ${tasksToReplan.length} tasks` 
    });
  } catch (error) {
    logger.error('Error pushing forward allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to push forward allocations' });
  }
});

/**
 * @swagger
 * /api/task-allocations/availability/{userId}:
 *   get:
 *     summary: Get user availability for a date range
 *     tags: [TaskAllocations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date (YYYY-MM-DD)
 *       - in: query
 *         name: taskId
 *         schema:
 *           type: integer
 *         description: Task ID to exclude from availability calculation
 *       - in: query
 *         name: isHobby
 *         schema:
 *           type: boolean
 *         description: Filter by hobby/work project type
 *     responses:
 *       200:
 *         description: User availability data for the date range
 *       401:
 *         description: Unauthorized
 */
// Get user availability for a date range
router.get('/availability/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, excludeTaskId, excludeHeaderId, isHobby } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start and end dates required' });
    }

    const forHobby = isHobby === 'true' || isHobby === '1';

    // Get user's work hours configuration (including hobby settings)
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday, 
              WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday,
              WorkStartMonday, WorkStartTuesday, WorkStartWednesday, WorkStartThursday,
              WorkStartFriday, WorkStartSaturday, WorkStartSunday,
              HobbyStartMonday, HobbyStartTuesday, HobbyStartWednesday, HobbyStartThursday,
              HobbyStartFriday, HobbyStartSaturday, HobbyStartSunday,
              HobbyHoursMonday, HobbyHoursTuesday, HobbyHoursWednesday, HobbyHoursThursday,
              HobbyHoursFriday, HobbyHoursSaturday, HobbyHoursSunday,
              LunchTime, LunchDuration
       FROM Users WHERE Id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];
    const dayCapacityFactors = await getDailyCapacityFactorMapForUser(Number(userId), String(startDate), String(endDate));

    // Pre-compute lunch parameters for window sizing (hobby tasks have no lunch break)
    const lunchDurForWindow = forHobby
      ? 0
      : ((typeof user.LunchDuration === 'number' && user.LunchDuration >= 0) ? user.LunchDuration : 60);
    const lunchTimeForWindow = (typeof user.LunchTime === 'string' && user.LunchTime.includes(':'))
      ? user.LunchTime
      : '13:00';
    const [lunchWindowH, lunchWindowM] = lunchTimeForWindow.split(':').map(Number);
    const lunchWindowStartMinutes = lunchWindowH * 60 + lunchWindowM;

    // Get existing direct allocations for the date range, optionally excluding a specific task
    // Filter by hobby/work projects
    let directQuery = `SELECT ta.AllocationDate, SUM(ta.AllocatedHours) as TotalAllocated, MAX(ta.EndTime) as LatestEndTime
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE ta.UserId = ? AND ta.AllocationDate BETWEEN ? AND ?
       AND COALESCE(p.IsHobby, 0) = ?`;
    const directParams: any[] = [userId, startDate, endDate, forHobby ? 1 : 0];
    
    if (excludeTaskId) {
      directQuery += ` AND ta.TaskId != ?`;
      directParams.push(excludeTaskId);
    }
    if (excludeHeaderId) {
      directQuery += ` AND (ta.TaskAllocationHeaderId IS NULL OR ta.TaskAllocationHeaderId != ?)`;
      directParams.push(excludeHeaderId);
    }
    
    directQuery += ` GROUP BY ta.AllocationDate`;
    
    const [directAllocations] = await pool.execute<RowDataPacket[]>(directQuery, directParams);

    // NOTE: Child allocations (TaskChildAllocations) are NOT included in availability calculation.
    // Child allocations are a SUBDIVISION of the parent's direct allocation — they don't consume
    // additional availability. The parent's TaskAllocation already reserves the time.
    // Including them would double-count hours.

    // Get recurring allocation occurrences for the date range
    // These DO consume availability as they are independent time blocks
    const [recurringOccurrences] = await pool.execute<RowDataPacket[]>(
      `SELECT rao.OccurrenceDate, SUM(rao.AllocatedHours) as TotalRecurring, MAX(rao.EndTime) as LatestRecurringEndTime
       FROM RecurringAllocationOccurrences rao
       INNER JOIN RecurringAllocations ra ON rao.RecurringAllocationId = ra.Id
       WHERE rao.UserId = ? AND rao.OccurrenceDate BETWEEN ? AND ?
       AND ra.IsActive = 1
       GROUP BY rao.OccurrenceDate`,
      [userId, startDate, endDate]
    );

    // Build allocation map from direct allocations only
    const allocationMap = new Map<string, { totalAllocated: number; latestEndTime: string | null }>();
    
    for (const alloc of directAllocations as RowDataPacket[]) {
      let dateStr: string;
      if (alloc.AllocationDate instanceof Date) {
        // Use local date components to avoid timezone shift
        const d = alloc.AllocationDate;
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      } else {
        dateStr = String(alloc.AllocationDate).split('T')[0];
      }
      allocationMap.set(dateStr, {
        totalAllocated: parseFloat(alloc.TotalAllocated) || 0,
        latestEndTime: alloc.LatestEndTime || null,
      });
    }

    // Add recurring allocation occurrences to the map
    for (const recur of recurringOccurrences as RowDataPacket[]) {
      let dateStr: string;
      if (recur.OccurrenceDate instanceof Date) {
        const d = recur.OccurrenceDate;
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      } else {
        dateStr = String(recur.OccurrenceDate).split('T')[0];
      }
      
      const existing = allocationMap.get(dateStr);
      const recurringHours = parseFloat(recur.TotalRecurring) || 0;
      // NOTE: Do NOT use recurring end time for latestEndTime calculation
      // Recurring tasks can be in the middle of the day (e.g., 10-11am meeting)
      // and should not block the time slot calculation - they just reduce available hours
      
      if (existing) {
        // Combine with existing task allocations
        // Keep the task allocation's latestEndTime, just add recurring hours
        allocationMap.set(dateStr, {
          totalAllocated: existing.totalAllocated + recurringHours,
          // Keep existing task allocation end time - don't use recurring end time
          latestEndTime: existing.latestEndTime
        });
      } else {
        // Only recurring allocations on this date - no task allocations
        // Set latestEndTime to null since recurring tasks don't block time slots
        allocationMap.set(dateStr, {
          totalAllocated: recurringHours,
          latestEndTime: null  // Don't use recurring end time for slot calculation
        });
      }
    }

    // Build availability map
    const availability: any[] = [];
    // Anchor at noon to avoid timezone mismatch between getDay() (local) and toISOString() (UTC)
    const start = new Date(startDate as string + 'T12:00:00');
    const end = new Date(endDate as string + 'T12:00:00');

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, etc.
      const dayName = dayNames[dayOfWeek];
      
      // Use hobby or work hours based on the request
      const hoursKey = forHobby ? `HobbyHours${dayName}` : `WorkHours${dayName}`;
      const startKey = forHobby ? `HobbyStart${dayName}` : `WorkStart${dayName}`;
      const maxHours = parseFloat(user[hoursKey] || 0);
      const slotStartTime = user[startKey] || (forHobby ? '19:00' : '09:00');

      // Use local date components to stay consistent with getDay()
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const dayCapacityFactor = Math.max(0, Math.min(1, Number(dayCapacityFactors.get(dateStr) ?? 1)));
      const adjustedMaxHours = maxHours * dayCapacityFactor;
      const isHoliday = adjustedMaxHours <= 0;
      
      // Find allocation from merged map (direct + child allocations)
      const allocated = allocationMap.get(dateStr);
      const allocatedHours = allocated ? allocated.totalAllocated : 0;
      const latestEndTime = allocated?.latestEndTime || null;

      // Calculate available hours based on remaining time window, not just capacity minus allocated
      let availableHours = isHoliday ? 0 : Math.max(0, adjustedMaxHours - allocatedHours);
      
      // If there are existing allocations with an end time, cap available hours
      // by the remaining time in the configured window.
      // EXCEPTION: When excludeHeaderId is provided (slice drag/replan), the new allocation
      // is an independent header that can start at the beginning of the work day, so the
      // latestEndTime from other slices must NOT restrict the window — only raw capacity matters.
      const skipLatestEndTimeCap = !!excludeHeaderId;
      if (!isHoliday && latestEndTime && adjustedMaxHours > 0 && !skipLatestEndTimeCap) {
        const [slotStartH, slotStartM] = slotStartTime.split(':').map(Number);
        const slotStartMinutes = slotStartH * 60 + slotStartM;
        // Account for lunch duration when computing the end of the work-day window:
        // WorkHours = productive hours (not counting lunch), so the calendar window is
        // WorkHours * 60 + lunchDuration if lunch falls inside the work period.
        let slotEndMinutes = slotStartMinutes + adjustedMaxHours * 60;
        if (
          lunchDurForWindow > 0 &&
          slotStartMinutes < lunchWindowStartMinutes &&
          slotStartMinutes + adjustedMaxHours * 60 > lunchWindowStartMinutes
        ) {
          slotEndMinutes += lunchDurForWindow;
        }
        
        const [endH, endM] = latestEndTime.split(':').map(Number);
        const latestEndMinutes = endH * 60 + endM;
        
        // Remaining minutes in the window after the latest allocation ends
        const remainingWindowMinutes = Math.max(0, slotEndMinutes - latestEndMinutes);
        const remainingWindowHours = remainingWindowMinutes / 60;
        
        // Cap available hours to the time window remaining
        availableHours = Math.min(availableHours, remainingWindowHours);
      }

      availability.push({
        date: dateStr,
        dayOfWeek: dayName,
        maxHours: isHoliday ? 0 : adjustedMaxHours,
        allocatedHours,
        availableHours,
        workStartTime: slotStartTime,
        // When placing an independent new slice (excludeHeaderId), the caller should start from
        // work-day start, not after existing slices — signal this by omitting latestEndTime.
        latestEndTime: skipLatestEndTimeCap ? null : latestEndTime,
        isHobby: forHobby,
        isHoliday,
        dayCapacityFactor
      });
    }

    res.json({ success: true, availability });
  } catch (error) {
    logger.error('Error fetching user availability:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user availability' });
  }
});

/**
 * @swagger
 * /api/task-allocations:
 *   post:
 *     summary: Create or update task allocations
 *     tags: [TaskAllocations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [taskId, userId, allocationDate, allocatedHours]
 *             properties:
 *               taskId:
 *                 type: integer
 *               userId:
 *                 type: integer
 *               allocationDate:
 *                 type: string
 *                 format: date
 *               allocatedHours:
 *                 type: number
 *     responses:
 *       200:
 *         description: Allocation created or updated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
// Create/update task allocations
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId, userId, allocations, header, suppressDependentReplan, appendToExistingUserSlice } = req.body;

    if (!taskId || !userId || !Array.isArray(allocations)) {
      return res.status(400).json({ 
        success: false, 
        message: 'TaskId, userId, and allocations array are required' 
      });
    }

    // Verify user has permission to plan tasks
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ProjectId, p.OrganizationId, om.Role,
              COALESCE(t.UnscheduledWork, 0) as UnscheduledWork,
              COALESCE(pg.CanManageTasks, 0) as CanManageTasks,
              COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE t.Id = ?`,
      [req.user?.userId, taskId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const task = tasks[0];
    if (Number(task.UnscheduledWork || 0) === 1) {
      return res.status(400).json({
        success: false,
        message: 'Unscheduled work tasks cannot be planned'
      });
    }
    const canPlan = task.Role === 'Owner' || task.Role === 'Admin' || task.CanPlanTasks === 1;

    if (!canPlan) {
      return res.status(403).json({ success: false, message: 'No permission to plan tasks' });
    }

    const normalizedAllocations = allocations
      .map((allocation: any) => {
        const normalizedHours = roundToPlanningStep(Number(allocation?.hours || 0));
        return {
          date: normalizeDateKey(allocation?.date),
          hours: normalizedHours,
          startTime: allocation?.startTime || '09:00',
          endTime: allocation?.endTime || '17:00',
        };
      })
      .filter((allocation: { date: string; hours: number }) => /^\d{4}-\d{2}-\d{2}$/.test(allocation.date) && allocation.hours > 0);

    const hasInvalidStepHours = normalizedAllocations.some((allocation: { hours: number }) => !isPlanningStepValue(allocation.hours));
    if (normalizedAllocations.length > 0 && hasInvalidStepHours) {
      return res.status(400).json({ success: false, message: 'Planning supports 30-minute steps only (0.5h)' });
    }

    const normalizedDates = Array.from(
      new Set(
        normalizedAllocations
          .map((a: any) => normalizeDateKey(a.date))
          .filter((date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      )
    ).sort();

    if (normalizedDates.length > 0) {
      const holidayDates = await getHolidayDateSetForUser(Number(userId), normalizedDates[0], normalizedDates[normalizedDates.length - 1]);
      const blockedDates = normalizedDates.filter((date) => holidayDates.has(date));
      if (blockedDates.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot allocate on holidays for this user: ${blockedDates.join(', ')}`
        });
      }
    }

    const headerId = await ensureTaskAllocationHeader(Number(taskId), Number(userId), {
      allocationMode: header?.allocationMode,
      splitOrder: header?.splitOrder,
      plannedHours: roundToPlanningStep(
        Number(header?.plannedHours || normalizedAllocations.reduce((sum: number, allocation: any) => sum + (Number(allocation?.hours || 0)), 0))
      ),
      createdBy: req.user?.userId,
      forceCreate: !!appendToExistingUserSlice,
      hoursPerDay: roundToPlanningStep(Number(header?.hoursPerDay || 0)),
    });

    if (!appendToExistingUserSlice) {
      // Delete only this user's allocations for this task (preserve other users' plan slices)
      await pool.execute(
        'DELETE FROM TaskAllocations WHERE TaskId = ? AND UserId = ?',
        [taskId, userId]
      );

      // Delete child allocations for this parent/user slice only
      const deleteTaskChildSliceQuery = dbProvider === 'mssql'
        ? `DELETE FROM TaskChildAllocations
           WHERE ParentTaskId = ?
             AND EXISTS (
               SELECT 1
               FROM TaskAllocations ta
               WHERE ta.TaskId = TaskChildAllocations.ParentTaskId
                 AND ta.AllocationDate = TaskChildAllocations.AllocationDate
                 AND ta.UserId = ?
             )`
        : `DELETE FROM TaskChildAllocations
           WHERE ParentTaskId = ?
             AND EXISTS (
               SELECT 1
               FROM TaskAllocations ta
               WHERE ta.TaskId = TaskChildAllocations.ParentTaskId
                 AND ta.AllocationDate = TaskChildAllocations.AllocationDate
                 AND ta.UserId = ?
             )`;

      await pool.execute(deleteTaskChildSliceQuery, [taskId, userId]);
    }

    // Insert new allocations with start and end times
    if (normalizedAllocations.length > 0) {
      if (dbProvider === 'mssql') {
        for (const allocation of normalizedAllocations) {
          await pool.execute(
            `INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
            [
              taskId,
              headerId,
              userId,
              allocation.date,
              allocation.hours,
              allocation.startTime || '09:00',
              allocation.endTime || '17:00',
            ]
          );
        }
      } else {
        const values = normalizedAllocations.map((a: any) => [
          taskId,
          headerId,
          userId,
          a.date,
          a.hours,
          a.startTime || '09:00',
          a.endTime || '17:00',
          0
        ]);
        await pool.query(
          'INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual) VALUES ?',
          [values]
        );
      }
    }

    const updatedPlanRange = await recomputeTaskPlanDatesFromAllocations(Number(taskId), req.user?.userId);
    const newEndDate = updatedPlanRange.endDate;

    if (normalizedAllocations.length > 0) {
      
      // Get task info for notification
      const [taskInfo] = await pool.execute<RowDataPacket[]>(
        `SELECT t.Id, t.TaskName, t.AssignedTo, p.Id as ProjectId, p.ProjectName
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         WHERE t.Id = ?`,
        [taskId]
      );

      // Notify user about allocation (if different from current user making the allocation)
      if (taskInfo.length > 0 && userId !== req.user?.userId) {
        const totalHours = normalizedAllocations.reduce((sum: number, a: any) => sum + Number(a.hours || 0), 0);
        await createNotification(
          userId,
          'allocation_assigned',
          'Task Allocated to You',
          `You have been allocated ${totalHours.toFixed(1)}h on task "${taskInfo[0].TaskName}" in project "${taskInfo[0].ProjectName}"`,
          `/projects/${taskInfo[0].ProjectId}`,
          Number(taskId),
          taskInfo[0].ProjectId
        );
      }

      // Replan dependent tasks unless explicitly suppressed (used by drag-drop slice replanning)
      if (newEndDate && !suppressDependentReplan) {
        await replanDependentTasks(Number(taskId), newEndDate, req.user?.userId);
      }
    }

    await invalidateAllocationWrites({
      orgId: task.OrganizationId,
      projectId: task.ProjectId,
      taskId: Number(taskId),
    });

    res.json({ success: true, message: 'Allocations saved successfully', headerId });
  } catch (error) {
    logger.error('Error saving task allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to save task allocations' });
  }
});

/**
 * @swagger
 * /api/task-allocations/delete:
 *   delete:
 *     summary: Delete task allocations
 *     tags: [TaskAllocations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [taskId, userId, dates]
 *             properties:
 *               taskId:
 *                 type: integer
 *               userId:
 *                 type: integer
 *               dates:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: date
 *                 description: Array of dates to delete allocations for
 *     responses:
 *       200:
 *         description: Allocations deleted successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
// Delete a specific allocation
router.delete('/delete', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId, userId, allocationDate } = req.body;

    if (!taskId || !userId || !allocationDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Verify permission
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ProjectId, p.OrganizationId, om.Role,
              COALESCE(pg.CanManageTasks, 0) as CanManageTasks,
              COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE t.Id = ?`,
      [req.user?.userId, taskId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const task = tasks[0];
    const canPlan = task.Role === 'Owner' || task.Role === 'Admin' || task.CanPlanTasks === 1;

    if (!canPlan) {
      return res.status(403).json({ success: false, message: 'No permission to plan tasks' });
    }

    // Delete the specific allocation
    await pool.execute(
      'DELETE FROM TaskAllocations WHERE TaskId = ? AND UserId = ? AND AllocationDate = ?',
      [taskId, userId, allocationDate]
    );

    // Also delete child allocations for this task/date and this same user slice
    await pool.execute(
      `DELETE FROM TaskChildAllocations
       WHERE ParentTaskId = ?
         AND AllocationDate = ?
         AND EXISTS (
           SELECT 1
           FROM TaskAllocations ta
           WHERE ta.TaskId = TaskChildAllocations.ParentTaskId
             AND ta.AllocationDate = TaskChildAllocations.AllocationDate
             AND ta.UserId = ?
         )`,
      [taskId, allocationDate, userId]
    );

    const [remainingForUserRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count
       FROM TaskAllocations
       WHERE TaskId = ? AND UserId = ?`,
      [taskId, userId]
    );

    if (Number(remainingForUserRows[0]?.count || 0) === 0) {
      await pool.execute(
        `DELETE FROM TaskAllocationHeaders
         WHERE TaskId = ? AND UserId = ?`,
        [taskId, userId]
      );
    }

    await recomputeTaskPlanDatesFromAllocations(Number(taskId), req.user?.userId);

    await invalidateAllocationWrites({
      orgId: task.OrganizationId,
      projectId: task.ProjectId,
      taskId: Number(taskId),
    });

    res.json({ success: true, message: 'Allocation deleted successfully' });
  } catch (error) {
    logger.error('Error deleting allocation:', error);
    res.status(500).json({ success: false, message: 'Failed to delete allocation' });
  }
});

// Delete allocations by allocation header slice
router.get('/header/:headerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const headerId = Number(req.params.headerId);
    if (!Number.isFinite(headerId) || headerId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid headerId' });
    }

    const [headerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT tah.Id, tah.TaskId, tah.UserId, tah.AllocationMode, tah.SplitOrder, tah.PlannedHours,
              tah.HoursPerDay, tah.PlannedStartDate, tah.PlannedEndDate,
              t.TaskName, t.ProjectId, p.ProjectName, p.OrganizationId,
              u.Username, u.FirstName, u.LastName,
              om.Role,
              COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks
       FROM TaskAllocationHeaders tah
       INNER JOIN Tasks t ON tah.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN Users u ON tah.UserId = u.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE tah.Id = ?`,
      [req.user?.userId, headerId]
    );

    if (headerRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Allocation header not found or access denied' });
    }

    const headerRow = headerRows[0];
    const canView =
      headerRow.Role === 'Owner' ||
      headerRow.Role === 'Admin' ||
      Number(headerRow.CanPlanTasks || 0) === 1;

    if (!canView) {
      return res.status(403).json({ success: false, message: 'No permission to view this allocation slice' });
    }

    const payload = await cachedJson(
      cacheKeys.allocationsList(`header:${headerId}:user:${req.user?.userId}`),
      ENTITY_TTL_SECONDS,
      async () => {
        const [allocationRows] = await pool.execute<RowDataPacket[]>(
          `SELECT Id, TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual
           FROM TaskAllocations
           WHERE TaskAllocationHeaderId = ?
           ORDER BY AllocationDate ASC, StartTime ASC, Id ASC`,
          [headerId]
        );

        return {
          header: {
            Id: Number(headerRow.Id),
            TaskId: Number(headerRow.TaskId),
            UserId: Number(headerRow.UserId),
            AllocationMode: headerRow.AllocationMode,
            SplitOrder: headerRow.SplitOrder === null || headerRow.SplitOrder === undefined ? null : Number(headerRow.SplitOrder),
            PlannedHours: headerRow.PlannedHours === null || headerRow.PlannedHours === undefined ? null : Number(headerRow.PlannedHours),
            HoursPerDay: headerRow.HoursPerDay === null || headerRow.HoursPerDay === undefined ? null : Number(headerRow.HoursPerDay),
            PlannedStartDate: headerRow.PlannedStartDate ? normalizeDateKey(headerRow.PlannedStartDate) : null,
            PlannedEndDate: headerRow.PlannedEndDate ? normalizeDateKey(headerRow.PlannedEndDate) : null,
          },
          task: {
            Id: Number(headerRow.TaskId),
            TaskName: String(headerRow.TaskName || ''),
            ProjectId: Number(headerRow.ProjectId),
            ProjectName: String(headerRow.ProjectName || ''),
            OrganizationId: Number(headerRow.OrganizationId),
          },
          user: {
            Id: Number(headerRow.UserId),
            Username: String(headerRow.Username || ''),
            FirstName: String(headerRow.FirstName || ''),
            LastName: String(headerRow.LastName || ''),
          },
          allocations: allocationRows.map((allocation) => ({
            Id: Number(allocation.Id),
            TaskId: Number(allocation.TaskId),
            TaskAllocationHeaderId: allocation.TaskAllocationHeaderId === null || allocation.TaskAllocationHeaderId === undefined
              ? null
              : Number(allocation.TaskAllocationHeaderId),
            UserId: Number(allocation.UserId),
            AllocationDate: normalizeDateKey(allocation.AllocationDate),
            AllocatedHours: Number(allocation.AllocatedHours || 0),
            StartTime: allocation.StartTime ? String(allocation.StartTime).slice(0, 5) : '09:00',
            EndTime: allocation.EndTime ? String(allocation.EndTime).slice(0, 5) : '17:00',
            IsManual: Number(allocation.IsManual || 0),
          })),
        };
      }
    );

    res.json({
      success: true,
      ...payload,
    });
  } catch (error) {
    logger.error('Error loading allocation header detail:', error);
    res.status(500).json({ success: false, message: 'Failed to load allocation header detail' });
  }
});

router.put('/header/:headerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const headerId = Number(req.params.headerId);
    const requestedStartDate = normalizeDateKey(req.body?.startDate);
    const requestedTotalHours = roundToPlanningStep(Number(req.body?.totalHours || 0));
    const requestedHoursPerDay = roundToPlanningStep(Number(req.body?.hoursPerDay || 0));
    const rawAllocations = Array.isArray(req.body?.allocations) ? req.body.allocations : [];

    if (!Number.isFinite(headerId) || headerId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid headerId' });
    }

    const [headerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT tah.Id, tah.TaskId, tah.UserId, t.ProjectId, p.OrganizationId,
              om.Role,
              COALESCE(pg.CanManageTasks, 0) as CanManageTasks,
              COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks
       FROM TaskAllocationHeaders tah
       INNER JOIN Tasks t ON tah.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE tah.Id = ?`,
      [req.user?.userId, headerId]
    );

    if (headerRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Allocation header not found or access denied' });
    }

    const headerRow = headerRows[0];
    const canPlan = headerRow.Role === 'Owner' || headerRow.Role === 'Admin' || Number(headerRow.CanPlanTasks || 0) === 1;
    if (!canPlan) {
      return res.status(403).json({ success: false, message: 'No permission to plan tasks' });
    }

    const taskId = Number(headerRow.TaskId);
    const userId = Number(headerRow.UserId);

    const isValidTime = (value: string): boolean => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);

    const normalizedAllocations = rawAllocations
      .map((item: any) => {
        const date = normalizeDateKey(item?.date || item?.AllocationDate);
        const hours = roundToPlanningStep(Number(item?.hours ?? item?.AllocatedHours ?? 0));
        const startTime = String(item?.startTime || item?.StartTime || '09:00').slice(0, 5);
        const endTime = String(item?.endTime || item?.EndTime || '17:00').slice(0, 5);
        return { date, hours, startTime, endTime };
      })
      .filter((item: { date: string; hours: number }) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.hours) && item.hours > 0)
      .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));

    if (normalizedAllocations.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one allocation day with positive hours is required' });
    }

    const hasInvalidStepHours = normalizedAllocations.some((item: { hours: number }) => !isPlanningStepValue(item.hours));
    if (hasInvalidStepHours) {
      return res.status(400).json({ success: false, message: 'Planning supports 30-minute steps only (0.5h)' });
    }

    if (requestedHoursPerDay > 0 && !isPlanningStepValue(requestedHoursPerDay)) {
      return res.status(400).json({ success: false, message: 'Hours per day must use 30-minute steps (0.5h)' });
    }

    const hasInvalidTimes = normalizedAllocations.some((item: { startTime: string; endTime: string }) => !isValidTime(item.startTime) || !isValidTime(item.endTime));
    if (hasInvalidTimes) {
      return res.status(400).json({ success: false, message: 'StartTime and EndTime must use HH:MM format' });
    }

    const allocationDates = normalizedAllocations.map((item: { date: string }) => item.date);
    const firstDate = allocationDates[0];
    const lastDate = allocationDates[allocationDates.length - 1];

    const holidayDateSet = await getHolidayDateSetForUser(userId, firstDate, lastDate);
    const blockedDates = Array.from(new Set(allocationDates.filter((date: string) => holidayDateSet.has(date))));
    if (blockedDates.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot allocate on holidays for this user: ${blockedDates.join(', ')}`
      });
    }

    const [existingRows] = await pool.execute<RowDataPacket[]>(
      `SELECT AllocationDate
       FROM TaskAllocations
       WHERE TaskAllocationHeaderId = ?`,
      [headerId]
    );

    const previousDateSet = new Set(
      existingRows
        .map((row) => normalizeDateKey(row.AllocationDate))
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    );
    const newDateSet = new Set(allocationDates);

    await pool.execute(
      `DELETE FROM TaskAllocations WHERE TaskAllocationHeaderId = ?`,
      [headerId]
    );

    if (dbProvider === 'mssql') {
      for (const allocation of normalizedAllocations) {
        await pool.execute(
          `INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
          [taskId, headerId, userId, allocation.date, allocation.hours, allocation.startTime, allocation.endTime]
        );
      }
    } else {
      const values = normalizedAllocations.map((allocation: { date: string; hours: number; startTime: string; endTime: string }) => [
        taskId,
        headerId,
        userId,
        allocation.date,
        allocation.hours,
        allocation.startTime,
        allocation.endTime,
        0,
      ]);

      await pool.query(
        'INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual) VALUES ?',
        [values]
      );
    }

    const removedDates = Array.from(previousDateSet).filter((date) => !newDateSet.has(date));
    if (removedDates.length > 0) {
      const removedPlaceholders = removedDates.map(() => '?').join(',');
      await pool.execute(
        `DELETE FROM TaskChildAllocations
         WHERE TaskAllocationHeaderId = ?
           AND AllocationDate IN (${removedPlaceholders})
           AND NOT EXISTS (
             SELECT 1
             FROM TaskAllocations ta
             WHERE ta.TaskAllocationHeaderId = TaskChildAllocations.TaskAllocationHeaderId
               AND ta.AllocationDate = TaskChildAllocations.AllocationDate
           )`,
        [headerId, ...removedDates]
      );
    }

    const computedTotalHours = roundToPlanningStep(normalizedAllocations.reduce((sum: number, item: { hours: number }) => sum + item.hours, 0));
    const plannedHours = Number.isFinite(requestedTotalHours) && requestedTotalHours > 0 ? requestedTotalHours : computedTotalHours;
    const hoursPerDay = Number.isFinite(requestedHoursPerDay) && requestedHoursPerDay > 0 ? requestedHoursPerDay : null;

    await pool.execute(
      `UPDATE TaskAllocationHeaders
       SET PlannedHours = ?, HoursPerDay = ?
       WHERE Id = ?`,
      [plannedHours, hoursPerDay, headerId]
    );

    await recomputeTaskPlanDatesFromAllocations(taskId, req.user?.userId);

    await invalidateAllocationWrites({
      orgId: headerRow.OrganizationId,
      projectId: headerRow.ProjectId,
      taskId,
    });

    res.json({
      success: true,
      message: 'Allocation slice updated successfully',
      headerId,
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(requestedStartDate) ? requestedStartDate : firstDate,
      endDate: lastDate,
      totalHours: computedTotalHours,
    });
  } catch (error) {
    logger.error('Error updating allocation slice:', error);
    res.status(500).json({ success: false, message: 'Failed to update allocation slice' });
  }
});

router.delete('/header/:headerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const headerId = Number(req.params.headerId);
    if (!Number.isFinite(headerId) || headerId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid headerId' });
    }

    const [headerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT tah.Id, tah.TaskId, tah.UserId, t.ProjectId, p.OrganizationId, om.Role,
              COALESCE(pg.CanManageTasks, 0) as CanManageTasks,
              COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks
       FROM TaskAllocationHeaders tah
       INNER JOIN Tasks t ON tah.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE tah.Id = ?`,
      [req.user?.userId, headerId]
    );

    if (headerRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Allocation header not found or access denied' });
    }

    const headerRow = headerRows[0];
    const canPlan = headerRow.Role === 'Owner' || headerRow.Role === 'Admin' || headerRow.CanPlanTasks === 1;
    if (!canPlan) {
      return res.status(403).json({ success: false, message: 'No permission to plan tasks' });
    }

    const taskId = Number(headerRow.TaskId);

    // Remove child allocations that belong to this exact slice header
    await pool.execute(
      `DELETE FROM TaskChildAllocations
       WHERE TaskAllocationHeaderId = ?`,
      [headerId]
    );

    await pool.execute(
      `DELETE FROM TaskAllocations WHERE TaskAllocationHeaderId = ?`,
      [headerId]
    );

    await pool.execute(
      `DELETE FROM TaskAllocationHeaders WHERE Id = ?`,
      [headerId]
    );

    await recomputeTaskPlanDatesFromAllocations(taskId, req.user?.userId);

    await invalidateAllocationWrites({
      orgId: headerRow.OrganizationId,
      projectId: headerRow.ProjectId,
      taskId,
    });

    res.json({ success: true, message: 'Allocation slice deleted successfully' });
  } catch (error) {
    logger.error('Error deleting allocation slice:', error);
    res.status(500).json({ success: false, message: 'Failed to delete allocation slice' });
  }
});

// Delete selected dates from an allocation header slice
router.delete('/header/:headerId/dates', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const headerId = Number(req.params.headerId);
    const rawDates = Array.isArray(req.body?.dates) ? req.body.dates : [];
    const dates = Array.from(
      new Set(
        rawDates
          .map((value: any) => normalizeDateKey(value))
          .filter((value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      )
    );

    if (!Number.isFinite(headerId) || headerId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid headerId' });
    }

    if (dates.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one valid date is required' });
    }

    const [headerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT tah.Id, tah.TaskId, tah.UserId, t.ProjectId, p.OrganizationId, om.Role,
              COALESCE(pg.CanManageTasks, 0) as CanManageTasks,
              COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks
       FROM TaskAllocationHeaders tah
       INNER JOIN Tasks t ON tah.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE tah.Id = ?`,
      [req.user?.userId, headerId]
    );

    if (headerRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Allocation header not found or access denied' });
    }

    const headerRow = headerRows[0];
    const canPlan = headerRow.Role === 'Owner' || headerRow.Role === 'Admin' || headerRow.CanPlanTasks === 1;
    if (!canPlan) {
      return res.status(403).json({ success: false, message: 'No permission to plan tasks' });
    }

    const taskId = Number(headerRow.TaskId);
    const placeholders = dates.map(() => '?').join(',');

    await pool.execute(
      `DELETE FROM TaskAllocations
       WHERE TaskAllocationHeaderId = ?
         AND AllocationDate IN (${placeholders})`,
      [headerId, ...dates]
    );

    await pool.execute(
      `DELETE FROM TaskChildAllocations
       WHERE TaskAllocationHeaderId = ?
         AND AllocationDate IN (${placeholders})
         AND NOT EXISTS (
           SELECT 1
           FROM TaskAllocations ta
           WHERE ta.TaskAllocationHeaderId = TaskChildAllocations.TaskAllocationHeaderId
             AND ta.AllocationDate = TaskChildAllocations.AllocationDate
         )`,
      [headerId, ...dates]
    );

    const [remainingRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count
       FROM TaskAllocations
       WHERE TaskAllocationHeaderId = ?`,
      [headerId]
    );

    if (Number(remainingRows[0]?.count || 0) === 0) {
      await pool.execute(
        `DELETE FROM TaskAllocationHeaders WHERE Id = ?`,
        [headerId]
      );
    }

    await recomputeTaskPlanDatesFromAllocations(taskId, req.user?.userId);

    await invalidateAllocationWrites({
      orgId: headerRow.OrganizationId,
      projectId: headerRow.ProjectId,
      taskId,
    });

    res.json({ success: true, message: 'Allocation slice dates deleted successfully' });
  } catch (error) {
    logger.error('Error deleting allocation slice dates:', error);
    res.status(500).json({ success: false, message: 'Failed to delete allocation slice dates' });
  }
});

// Delete a partial amount (hours) from an allocation header slice (consumes latest allocations first)
router.delete('/header/:headerId/hours', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const headerId = Number(req.params.headerId);
    const hoursToRemove = Number(req.body?.hours || 0);

    if (!Number.isFinite(headerId) || headerId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid headerId' });
    }

    if (!Number.isFinite(hoursToRemove) || hoursToRemove <= 0) {
      return res.status(400).json({ success: false, message: 'A positive hours value is required' });
    }

    const [headerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT tah.Id, tah.TaskId, tah.UserId, t.ProjectId, p.OrganizationId, om.Role,
              COALESCE(pg.CanManageTasks, 0) as CanManageTasks,
              COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks
       FROM TaskAllocationHeaders tah
       INNER JOIN Tasks t ON tah.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE tah.Id = ?`,
      [req.user?.userId, headerId]
    );

    if (headerRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Allocation header not found or access denied' });
    }

    const headerRow = headerRows[0];
    const canPlan = headerRow.Role === 'Owner' || headerRow.Role === 'Admin' || headerRow.CanPlanTasks === 1;
    if (!canPlan) {
      return res.status(403).json({ success: false, message: 'No permission to plan tasks' });
    }

    const taskId = Number(headerRow.TaskId);

    const [allocationRows] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, AllocationDate, StartTime, EndTime, AllocatedHours
       FROM TaskAllocations
       WHERE TaskAllocationHeaderId = ?
       ORDER BY AllocationDate DESC, StartTime DESC, Id DESC`,
      [headerId]
    );

    const totalHoursInHeader = allocationRows.reduce((sum, row) => sum + Number(row.AllocatedHours || 0), 0);
    if (totalHoursInHeader <= 0) {
      return res.status(400).json({ success: false, message: 'No allocation hours available in this header' });
    }

    let remaining = Math.min(hoursToRemove, totalHoursInHeader);

    const toDeleteIds: number[] = [];
    const toUpdate: Array<{ id: number; newHours: number; startTime: string | null }> = [];

    for (const row of allocationRows) {
      if (remaining <= 0) break;

      const rowHours = Number(row.AllocatedHours || 0);
      if (rowHours <= 0) continue;

      if (remaining >= rowHours - 0.0001) {
        toDeleteIds.push(Number(row.Id));
        remaining -= rowHours;
      } else {
        const nextHours = Math.max(0, rowHours - remaining);
        toUpdate.push({
          id: Number(row.Id),
          newHours: nextHours,
          startTime: row.StartTime ? String(row.StartTime) : null,
        });
        remaining = 0;
        break;
      }
    }

    for (const allocationId of toDeleteIds) {
      await pool.execute(`DELETE FROM TaskAllocations WHERE Id = ?`, [allocationId]);
    }

    for (const item of toUpdate) {
      let newEndTime: string | null = null;
      if (item.startTime && item.startTime.includes(':')) {
        const [startHour, startMinute] = item.startTime.split(':').map(Number);
        const startMinutes = (Number.isFinite(startHour) ? startHour : 0) * 60 + (Number.isFinite(startMinute) ? startMinute : 0);
        const endMinutes = startMinutes + Math.round(item.newHours * 60);
        newEndTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
      }

      await pool.execute(
        `UPDATE TaskAllocations
         SET AllocatedHours = ?, EndTime = COALESCE(?, EndTime)
         WHERE Id = ?`,
        [item.newHours, newEndTime, item.id]
      );
    }

    const [remainingRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count
       FROM TaskAllocations
       WHERE TaskAllocationHeaderId = ?`,
      [headerId]
    );

    if (Number(remainingRows[0]?.count || 0) === 0) {
      await pool.execute(`DELETE FROM TaskAllocationHeaders WHERE Id = ?`, [headerId]);
    }

    await recomputeTaskPlanDatesFromAllocations(taskId, req.user?.userId);

    await invalidateAllocationWrites({
      orgId: headerRow.OrganizationId,
      projectId: headerRow.ProjectId,
      taskId,
    });

    res.json({
      success: true,
      message: 'Allocation slice hours removed successfully',
      removedHours: Math.min(hoursToRemove, totalHoursInHeader),
    });
  } catch (error) {
    logger.error('Error deleting allocation slice hours:', error);
    res.status(500).json({ success: false, message: 'Failed to delete allocation slice hours' });
  }
});

/**
 * @swagger
 * /api/task-allocations/task/{taskId}:
 *   delete:
 *     summary: Delete all allocations for a task
 *     tags: [TaskAllocations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Task ID
 *     responses:
 *       200:
 *         description: All allocations for the task deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
// Delete all allocations for a task
router.delete('/task/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;

    // Verify permission
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ProjectId, p.OrganizationId, om.Role,
              COALESCE(pg.CanManageTasks, 0) as CanManageTasks,
              COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE t.Id = ?`,
      [req.user?.userId, taskId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const task = tasks[0];
    const canPlan = task.Role === 'Owner' || task.Role === 'Admin' || task.CanPlanTasks === 1;

    if (!canPlan) {
      return res.status(403).json({ success: false, message: 'No permission to plan tasks' });
    }

    const descendantsQuery = dbProvider === 'mssql'
      ? `;WITH Descendants AS (
           SELECT Id FROM Tasks WHERE Id = ?
           UNION ALL
           SELECT t.Id FROM Tasks t INNER JOIN Descendants d ON t.ParentTaskId = d.Id
         )
         SELECT Id FROM Descendants`
      : `WITH RECURSIVE Descendants AS (
           SELECT Id FROM Tasks WHERE Id = ?
           UNION ALL
           SELECT t.Id FROM Tasks t INNER JOIN Descendants d ON t.ParentTaskId = d.Id
         )
         SELECT Id FROM Descendants`;

    const [descendantRows] = await pool.execute<RowDataPacket[]>(descendantsQuery, [taskId]);
    const descendantTaskIds = descendantRows
      .map((row) => Number(row.Id))
      .filter((id) => Number.isFinite(id));

    if (descendantTaskIds.length === 0) {
      descendantTaskIds.push(Number(taskId));
    }

    const descendantPlaceholders = descendantTaskIds.map(() => '?').join(',');

    // Get task info and current allocations for notification before deleting
    const [taskInfo] = await pool.execute<RowDataPacket[]>(
      `SELECT t.TaskName, p.Id as ProjectId, p.ProjectName
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE t.Id = ?`,
      [taskId]
    );
    
    const [currentAllocations] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT UserId FROM (
         SELECT ta.UserId
         FROM TaskAllocations ta
         WHERE ta.TaskId IN (${descendantPlaceholders})
         UNION
         SELECT ta2.UserId
         FROM TaskChildAllocations tca
         INNER JOIN TaskAllocations ta2 ON ta2.TaskId = tca.ParentTaskId
         WHERE tca.ParentTaskId IN (${descendantPlaceholders})
            OR tca.ChildTaskId IN (${descendantPlaceholders})
       ) users`,
      [...descendantTaskIds, ...descendantTaskIds, ...descendantTaskIds]
    );

    // Delete direct allocations for this task and all descendants
    await pool.execute(
      `DELETE FROM TaskAllocations WHERE TaskId IN (${descendantPlaceholders})`,
      descendantTaskIds
    );

    // Delete allocation headers for this task and all descendants
    await pool.execute(
      `DELETE FROM TaskAllocationHeaders WHERE TaskId IN (${descendantPlaceholders})`,
      descendantTaskIds
    );

    // Delete child allocations at ALL levels (multi-level hierarchy)
    // - rows where descendant tasks are parents
    // - rows where descendant tasks are children
    await pool.execute(
      `DELETE FROM TaskChildAllocations
       WHERE ParentTaskId IN (${descendantPlaceholders})
          OR ChildTaskId IN (${descendantPlaceholders})`,
      [...descendantTaskIds, ...descendantTaskIds]
    );

    // Clear planned dates for this task and all descendants
    await pool.execute(
      `UPDATE Tasks SET PlannedStartDate = NULL, PlannedEndDate = NULL WHERE Id IN (${descendantPlaceholders})`,
      descendantTaskIds
    );
    
    // Notify all users who had allocations (if different from current user)
    if (taskInfo.length > 0) {
      for (const allocation of currentAllocations) {
        if (allocation.UserId !== req.user?.userId) {
          await createNotification(
            allocation.UserId,
            'allocation_assigned',
            'Task Allocation Removed',
            `Your allocation on task "${taskInfo[0].TaskName}" has been removed`,
            `/projects/${taskInfo[0].ProjectId}`,
            Number(taskId),
            taskInfo[0].ProjectId
          );
        }
      }
    }

    await invalidateAllocationWrites({
      orgId: task.OrganizationId,
      projectId: task.ProjectId,
      taskId: Number(taskId),
    });

    res.json({ success: true, message: 'Allocations deleted successfully' });
  } catch (error) {
    logger.error('Error deleting task allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to delete task allocations' });
  }
});

/**
 * @swagger
 * /api/task-allocations/my-allocations:
 *   get:
 *     summary: Get current user's allocations
 *     tags: [TaskAllocations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: List of allocations for the current user
 *       401:
 *         description: Unauthorized
 */
// Get my allocations (for calendar view)
router.get('/my-allocations', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { startDate, endDate } = req.query;
    const cacheScope = `user:${userId}:my:start:${String(startDate || 'all')}:end:${String(endDate || 'all')}`;

    const allocations = await cachedJson(
      cacheKeys.allocationsList(cacheScope),
      ENTITY_TTL_SECONDS,
      async () => {
        const castText = (expression: string) => dbProvider === 'mssql'
          ? `CAST(${expression} AS NVARCHAR(1000))`
          : `CAST(${expression} AS CHAR(1000))`;

        let directDateFilter = '';
        let childDateFilter = '';
        const hasDateFilter = Boolean(startDate && endDate);

        const params: Array<string | number> = [userId as number, userId as number, userId as number];
        if (hasDateFilter) {
          directDateFilter = ' AND ta.AllocationDate BETWEEN ? AND ?';
          childDateFilter = ' AND th.AllocationDate BETWEEN ? AND ?';
          params.push(String(startDate), String(endDate), String(startDate), String(endDate));
        }

        let query = `
          WITH RECURSIVE TaskHierarchy AS (
            SELECT 
              tca.Id,
              tca.ChildTaskId,
              tca.ParentTaskId,
              tca.AllocationDate,
              tca.AllocatedHours,
              tca.StartTime,
              tca.EndTime,
              ${castText('child.TaskName')} as ChildName,
              ${castText('parent.TaskName')} as ParentName,
              child.ProjectId,
              1 as Level
            FROM TaskChildAllocations tca
            INNER JOIN Tasks child ON tca.ChildTaskId = child.Id
            INNER JOIN Tasks parent ON tca.ParentTaskId = parent.Id
            WHERE EXISTS (
              SELECT 1 FROM TaskAllocations parent_ta 
              WHERE parent_ta.TaskId = tca.ParentTaskId 
              AND parent_ta.UserId = ?
            )
            
            UNION ALL
            
            SELECT 
              tca2.Id,
              tca2.ChildTaskId,
              tca2.ParentTaskId,
              tca2.AllocationDate,
              tca2.AllocatedHours,
              tca2.StartTime,
              tca2.EndTime,
              ${castText('child2.TaskName')} as ChildName,
              ${castText("CONCAT(th.ParentName, ' > ', parent2.TaskName)")} as ParentName,
              child2.ProjectId,
              th.Level + 1
            FROM TaskHierarchy th
            INNER JOIN TaskChildAllocations tca2 ON tca2.ParentTaskId = th.ChildTaskId
            INNER JOIN Tasks child2 ON tca2.ChildTaskId = child2.Id
            INNER JOIN Tasks parent2 ON tca2.ParentTaskId = parent2.Id
          )
          SELECT 
            ${castText('ta.Id')} as Id,
            ta.TaskId,
            t.TaskName,
            p.Id as ProjectId,
            p.ProjectName,
            p.IsHobby,
            ta.UserId,
            ta.AllocationDate,
            ta.AllocatedHours,
            ta.StartTime,
            ta.EndTime
          FROM TaskAllocations ta
          INNER JOIN Tasks t ON ta.TaskId = t.Id
          INNER JOIN Projects p ON t.ProjectId = p.Id
          WHERE ta.UserId = ?
          AND NOT EXISTS (
            SELECT 1 FROM Tasks child WHERE child.ParentTaskId = t.Id
          )
          ${directDateFilter}
          
          UNION ALL
          
          SELECT DISTINCT
            CONCAT('child-', th.ChildTaskId, '-', DATE_FORMAT(th.AllocationDate, '%Y%m%d')) as Id,
            th.ChildTaskId as TaskId,
            CONCAT(th.ParentName, ' > ', th.ChildName) as TaskName,
            p.Id as ProjectId,
            p.ProjectName,
            p.IsHobby,
            ? as UserId,
            th.AllocationDate,
            th.AllocatedHours,
            th.StartTime,
            th.EndTime
          FROM TaskHierarchy th
          INNER JOIN Projects p ON th.ProjectId = p.Id
          WHERE NOT EXISTS (
            SELECT 1 FROM TaskChildAllocations tca_child 
            WHERE tca_child.ParentTaskId = th.ChildTaskId
          )
          ${childDateFilter}
        `;

        query += ` ORDER BY AllocationDate, StartTime`;

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);
        return rows;
      }
    );

    res.json({ success: true, allocations });
  } catch (error) {
    logger.error('Error fetching my allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch allocations' });
  }
});

/**
 * @swagger
 * /api/task-allocations/manual:
 *   post:
 *     summary: Create a manual allocation for a task
 *     tags: [TaskAllocations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [taskId, userId, allocationDate, allocatedHours]
 *             properties:
 *               taskId:
 *                 type: integer
 *               userId:
 *                 type: integer
 *               allocationDate:
 *                 type: string
 *                 format: date
 *               allocatedHours:
 *                 type: number
 *     responses:
 *       201:
 *         description: Manual allocation created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
/**
 * @route   POST /api/task-allocations/manual
 * @desc    Create a manual allocation for a task
 * @access  Authenticated users with task assignment permissions
 */
router.post('/manual', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId, userId, allocationDate } = req.body;
    const allocatedHours = roundToPlanningStep(Number(req.body?.allocatedHours || 0));

    if (!taskId || !userId || !allocationDate || !allocatedHours) {
      return res.status(400).json({
        success: false,
        message: 'TaskId, UserId, AllocationDate, and AllocatedHours are required'
      });
    }

    if (!isPlanningStepValue(allocatedHours)) {
      return res.status(400).json({
        success: false,
        message: 'AllocatedHours must use 30-minute steps (0.5h)'
      });
    }

    // Verify task exists and get project info
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ProjectId, p.OrganizationId, COALESCE(t.UnscheduledWork, 0) as UnscheduledWork, COALESCE(p.IsHobby, 0) as IsHobby
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE t.Id = ?`,
      [taskId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const task = tasks[0];
    if (Number(task.UnscheduledWork || 0) === 1) {
      return res.status(400).json({
        success: false,
        message: 'Unscheduled work tasks cannot be planned'
      });
    }
    const isHobby = task.IsHobby === 1;

    const normalizedAllocationDate = normalizeDateKey(allocationDate);
    const dayCapacityFactorsForDate = await getDailyCapacityFactorMapForUser(Number(userId), normalizedAllocationDate, normalizedAllocationDate);
    const dayCapacityFactor = Math.max(0, Math.min(1, Number(dayCapacityFactorsForDate.get(normalizedAllocationDate) ?? 1)));
    if (dayCapacityFactor <= 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot allocate on holiday date ${normalizedAllocationDate}`
      });
    }

    // Get user's work configuration
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday,
              WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday,
              WorkStartMonday, WorkStartTuesday, WorkStartWednesday, WorkStartThursday,
              WorkStartFriday, WorkStartSaturday, WorkStartSunday,
              HobbyHoursMonday, HobbyHoursTuesday, HobbyHoursWednesday, HobbyHoursThursday,
              HobbyHoursFriday, HobbyHoursSaturday, HobbyHoursSunday,
              HobbyStartMonday, HobbyStartTuesday, HobbyStartWednesday, HobbyStartThursday,
              HobbyStartFriday, HobbyStartSaturday, HobbyStartSunday,
              LunchTime, LunchDuration
       FROM Users WHERE Id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];
    const date = new Date(allocationDate);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = date.getDay();
    const dayName = dayNames[dayOfWeek];

    // Get work hours for this day based on task type
    const dailyCapacityBase = isHobby
      ? parseFloat(user[`HobbyHours${dayName}`] || 0)
      : parseFloat(user[`WorkHours${dayName}`] || 0);
    const dailyCapacity = dailyCapacityBase * dayCapacityFactor;

    if (dailyCapacity <= 0) {
      return res.status(400).json({
        success: false,
        message: `User has no ${isHobby ? 'hobby' : 'work'} hours configured for ${dayName}`
      });
    }

    const workStart = isHobby
      ? (user[`HobbyStart${dayName}`] || '19:00')
      : (user[`WorkStart${dayName}`] || '09:00');

    // Get existing allocations for this user on this date
    const [existingAllocations] = await pool.execute<RowDataPacket[]>(
      `SELECT ta.AllocatedHours, COALESCE(p.IsHobby, 0) as IsHobby
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE ta.UserId = ? AND ta.AllocationDate = ?`,
      [userId, normalizedAllocationDate]
    );

    // Calculate already allocated hours for the same task type
    const allocatedHoursToday = existingAllocations
      .filter((a: any) => (a.IsHobby === 1) === isHobby)
      .reduce((sum: number, a: any) => sum + parseFloat(a.AllocatedHours || 0), 0);

    const availableHours = dailyCapacity - allocatedHoursToday;

    if (allocatedHours > availableHours) {
      return res.status(400).json({
        success: false,
        message: `Insufficient hours available. User has ${availableHours.toFixed(1)}h available for ${isHobby ? 'hobby' : 'work'} tasks on this date (capacity: ${dailyCapacity}h, allocated: ${allocatedHoursToday.toFixed(1)}h)`
      });
    }

    // Get lunch settings (only for work tasks)
    const effectiveLunchDuration = isHobby ? 0 : (typeof user.LunchDuration === 'number' && user.LunchDuration >= 0 ? user.LunchDuration : 60);
    const lunchTimeRaw = user.LunchTime;
    const lunchTime = (typeof lunchTimeRaw === 'string' && lunchTimeRaw.includes(':')) ? lunchTimeRaw : '13:00';
    const [lunchHour, lunchMin] = lunchTime.split(':').map(Number);
    const lunchStartMinutes = lunchHour * 60 + lunchMin;
    const lunchEndMinutes = lunchStartMinutes + effectiveLunchDuration;

    // Calculate work end time
    const [startH, startM] = workStart.split(':').map(Number);
    let workStartMinutes = startH * 60 + startM;
    let workEndMinutes = workStartMinutes + dailyCapacity * 60;
    if (!isHobby && effectiveLunchDuration > 0) {
      workEndMinutes += effectiveLunchDuration;
    }

    // Find current slot position (where to start this allocation)
    const [lastAllocation] = await pool.execute<RowDataPacket[]>(
      `SELECT MAX(EndTime) as LastEndTime
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE ta.UserId = ? AND ta.AllocationDate = ? AND COALESCE(p.IsHobby, 0) = ?`,
      [userId, normalizedAllocationDate, isHobby ? 1 : 0]
    );

    let slotStart = workStartMinutes;
    if (lastAllocation[0]?.LastEndTime) {
      const lastEndTime = lastAllocation[0].LastEndTime;
      const [endH, endM] = String(lastEndTime).split(':').map(Number);
      slotStart = Math.max(slotStart, endH * 60 + endM);
    }

    // Skip lunch if we're at lunch time (only for work)
    if (!isHobby && effectiveLunchDuration > 0 && slotStart >= lunchStartMinutes && slotStart < lunchEndMinutes) {
      slotStart = lunchEndMinutes;
    }

    const formatTime = (mins: number) => {
      return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    };

    const manualHeaderId = await ensureTaskAllocationHeader(Number(taskId), Number(userId), {
      allocationMode: 'parallel',
      plannedHours: allocatedHours,
      createdBy: req.user?.userId
    });

    const minutesToAllocate = allocatedHours * 60;

    // Check if allocation crosses lunch - if so, split it (only for work)
    if (!isHobby && effectiveLunchDuration > 0 && slotStart < lunchStartMinutes) {
      const morningAvail = lunchStartMinutes - slotStart;

      if (minutesToAllocate > morningAvail) {
        // SPLIT: Create morning allocation
        const morningHours = morningAvail / 60;
        const morningStart = slotStart;
        const morningEnd = lunchStartMinutes;

        await pool.execute<ResultSetHeader>(
          `INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [taskId, manualHeaderId, userId, normalizedAllocationDate, morningHours, formatTime(morningStart), formatTime(morningEnd)]
        );

        // Create afternoon allocation
        const afternoonMinutes = minutesToAllocate - morningAvail;
        const afternoonHours = afternoonMinutes / 60;
        const afternoonStart = lunchEndMinutes;
        const afternoonEnd = afternoonStart + afternoonMinutes;

        await pool.execute<ResultSetHeader>(
          `INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [taskId, manualHeaderId, userId, normalizedAllocationDate, afternoonHours, formatTime(afternoonStart), formatTime(afternoonEnd)]
        );

        await recomputeTaskPlanDatesFromAllocations(Number(taskId), req.user?.userId);

        await invalidateAllocationWrites({
          orgId: task.OrganizationId,
          projectId: task.ProjectId,
          taskId: Number(taskId),
        });

        return res.json({ success: true, message: 'Manual allocation created (split across lunch break)' });
      }
    }

    // Single allocation (doesn't cross lunch or is hobby)
    const startTime = formatTime(slotStart);
    const endTime = formatTime(slotStart + minutesToAllocate);

    await pool.execute<ResultSetHeader>(
      `INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [taskId, manualHeaderId, userId, normalizedAllocationDate, allocatedHours, startTime, endTime]
    );

    await recomputeTaskPlanDatesFromAllocations(Number(taskId), req.user?.userId);

    await invalidateAllocationWrites({
      orgId: task.OrganizationId,
      projectId: task.ProjectId,
      taskId: Number(taskId),
    });

    res.json({ success: true, message: 'Manual allocation created successfully' });
  } catch (error) {
    logger.error('Error creating manual allocation:', error);
    res.status(500).json({ success: false, message: 'Failed to create manual allocation' });
  }
});

/**
 * @swagger
 * /api/task-allocations/manual/{id}:
 *   put:
 *     summary: Update a manual allocation
 *     tags: [TaskAllocations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Allocation ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               allocatedHours:
 *                 type: number
 *     responses:
 *       200:
 *         description: Manual allocation updated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Allocation not found
 */
/**
 * @route   PUT /api/task-allocations/manual/:id
 * @desc    Update a manual allocation
 * @access  Authenticated users with task assignment permissions
 */
router.put('/manual/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const allocatedHours = roundToPlanningStep(Number(req.body?.allocatedHours || 0));

    if (!allocatedHours) {
      return res.status(400).json({
        success: false,
        message: 'AllocatedHours is required'
      });
    }

    if (!isPlanningStepValue(allocatedHours)) {
      return res.status(400).json({
        success: false,
        message: 'AllocatedHours must use 30-minute steps (0.5h)'
      });
    }

    // Get the allocation details
    const [allocations] = await pool.execute<RowDataPacket[]>(
      `SELECT ta.Id, ta.IsManual, ta.TaskId, ta.UserId, ta.AllocationDate,
              t.ProjectId, p.OrganizationId,
              COALESCE(t.UnscheduledWork, 0) as UnscheduledWork,
              COALESCE(p.IsHobby, 0) as IsHobby
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE ta.Id = ?`,
      [id]
    );

    if (allocations.length === 0) {
      return res.status(404).json({ success: false, message: 'Allocation not found' });
    }

    if (allocations[0].IsManual !== 1) {
      return res.status(400).json({
        success: false,
        message: 'Only manual allocations can be edited this way'
      });
    }

    const allocation = allocations[0];
    if (Number(allocation.UnscheduledWork || 0) === 1) {
      return res.status(400).json({
        success: false,
        message: 'Unscheduled work tasks cannot be planned'
      });
    }
    const { TaskId, UserId, AllocationDate } = allocation;
    const allocationDateKey = normalizeDateKey(AllocationDate);
    const dayCapacityFactorsForDate = await getDailyCapacityFactorMapForUser(Number(UserId), allocationDateKey, allocationDateKey);
    const dayCapacityFactor = Math.max(0, Math.min(1, Number(dayCapacityFactorsForDate.get(allocationDateKey) ?? 1)));
    if (dayCapacityFactor <= 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot allocate on holiday date ${allocationDateKey}`
      });
    }

    // Delete all manual allocations for this task/user/date
    // (there might be 2 if it was split across lunch)
    await pool.execute<ResultSetHeader>(
      'DELETE FROM TaskAllocations WHERE TaskId = ? AND UserId = ? AND AllocationDate = ? AND IsManual = 1',
      [TaskId, UserId, AllocationDate]
    );

    // Now recreate using the same logic as POST
    // This will recalculate start/end times and split if needed
    const isHobby = allocation.IsHobby === 1;

    // Get user's work configuration
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday,
              WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday,
              WorkStartMonday, WorkStartTuesday, WorkStartWednesday, WorkStartThursday,
              WorkStartFriday, WorkStartSaturday, WorkStartSunday,
              HobbyHoursMonday, HobbyHoursTuesday, HobbyHoursWednesday, HobbyHoursThursday,
              HobbyHoursFriday, HobbyHoursSaturday, HobbyHoursSunday,
              HobbyStartMonday, HobbyStartTuesday, HobbyStartWednesday, HobbyStartThursday,
              HobbyStartFriday, HobbyStartSaturday, HobbyStartSunday,
              LunchTime, LunchDuration
       FROM Users WHERE Id = ?`,
      [UserId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];
    const date = new Date(AllocationDate);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = date.getDay();
    const dayName = dayNames[dayOfWeek];

    const dailyCapacityBase = isHobby
      ? parseFloat(user[`HobbyHours${dayName}`] || 0)
      : parseFloat(user[`WorkHours${dayName}`] || 0);
    const dailyCapacity = dailyCapacityBase * dayCapacityFactor;

    if (dailyCapacity <= 0) {
      return res.status(400).json({
        success: false,
        message: `User has no ${isHobby ? 'hobby' : 'work'} hours configured for ${dayName}`
      });
    }

    const workStart = isHobby
      ? (user[`HobbyStart${dayName}`] || '19:00')
      : (user[`WorkStart${dayName}`] || '09:00');

    // Get existing allocations (excluding the ones we just deleted)
    const [existingAllocations] = await pool.execute<RowDataPacket[]>(
      `SELECT ta.AllocatedHours, COALESCE(p.IsHobby, 0) as IsHobby
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE ta.UserId = ? AND ta.AllocationDate = ?`,
      [UserId, AllocationDate]
    );

    const allocatedHoursToday = existingAllocations
      .filter((a: any) => (a.IsHobby === 1) === isHobby)
      .reduce((sum: number, a: any) => sum + parseFloat(a.AllocatedHours || 0), 0);

    const availableHours = dailyCapacity - allocatedHoursToday;

    if (allocatedHours > availableHours) {
      return res.status(400).json({
        success: false,
        message: `Insufficient hours available. User has ${availableHours.toFixed(1)}h available for ${isHobby ? 'hobby' : 'work'} tasks on this date (capacity: ${dailyCapacity}h, allocated: ${allocatedHoursToday.toFixed(1)}h)`
      });
    }

    const effectiveLunchDuration = isHobby ? 0 : (typeof user.LunchDuration === 'number' && user.LunchDuration >= 0 ? user.LunchDuration : 60);
    const lunchTimeRaw = user.LunchTime;
    const lunchTime = (typeof lunchTimeRaw === 'string' && lunchTimeRaw.includes(':')) ? lunchTimeRaw : '13:00';
    const [lunchHour, lunchMin] = lunchTime.split(':').map(Number);
    const lunchStartMinutes = lunchHour * 60 + lunchMin;
    const lunchEndMinutes = lunchStartMinutes + effectiveLunchDuration;

    const [startH, startM] = workStart.split(':').map(Number);
    let workStartMinutes = startH * 60 + startM;
    let workEndMinutes = workStartMinutes + dailyCapacity * 60;
    if (!isHobby && effectiveLunchDuration > 0) {
      workEndMinutes += effectiveLunchDuration;
    }

    const [lastAllocation] = await pool.execute<RowDataPacket[]>(
      `SELECT MAX(EndTime) as LastEndTime
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE ta.UserId = ? AND ta.AllocationDate = ? AND COALESCE(p.IsHobby, 0) = ?`,
      [UserId, AllocationDate, isHobby ? 1 : 0]
    );

    let slotStart = workStartMinutes;
    if (lastAllocation[0]?.LastEndTime) {
      const lastEndTime = lastAllocation[0].LastEndTime;
      const [endH, endM] = String(lastEndTime).split(':').map(Number);
      slotStart = Math.max(slotStart, endH * 60 + endM);
    }

    if (!isHobby && effectiveLunchDuration > 0 && slotStart >= lunchStartMinutes && slotStart < lunchEndMinutes) {
      slotStart = lunchEndMinutes;
    }

    const formatTime = (mins: number) => {
      return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    };

    const manualHeaderId = await ensureTaskAllocationHeader(Number(TaskId), Number(UserId), {
      allocationMode: 'parallel',
      plannedHours: allocatedHours,
      createdBy: req.user?.userId
    });

    const minutesToAllocate = allocatedHours * 60;

    if (!isHobby && effectiveLunchDuration > 0 && slotStart < lunchStartMinutes) {
      const morningAvail = lunchStartMinutes - slotStart;

      if (minutesToAllocate > morningAvail) {
        const morningHours = morningAvail / 60;
        const morningStart = slotStart;
        const morningEnd = lunchStartMinutes;

        await pool.execute<ResultSetHeader>(
          `INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [TaskId, manualHeaderId, UserId, AllocationDate, morningHours, formatTime(morningStart), formatTime(morningEnd)]
        );

        const afternoonMinutes = minutesToAllocate - morningAvail;
        const afternoonHours = afternoonMinutes / 60;
        const afternoonStart = lunchEndMinutes;
        const afternoonEnd = afternoonStart + afternoonMinutes;

        await pool.execute<ResultSetHeader>(
          `INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [TaskId, manualHeaderId, UserId, AllocationDate, afternoonHours, formatTime(afternoonStart), formatTime(afternoonEnd)]
        );

        await recomputeTaskPlanDatesFromAllocations(Number(TaskId), req.user?.userId);

        await invalidateAllocationWrites({
          orgId: allocation.OrganizationId,
          projectId: allocation.ProjectId,
          taskId: Number(TaskId),
        });

        return res.json({ success: true, message: 'Manual allocation updated (split across lunch break)' });
      }
    }

    const startTime = formatTime(slotStart);
    const endTime = formatTime(slotStart + minutesToAllocate);

    await pool.execute<ResultSetHeader>(
      `INSERT INTO TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [TaskId, manualHeaderId, UserId, AllocationDate, allocatedHours, startTime, endTime]
    );

    await recomputeTaskPlanDatesFromAllocations(Number(TaskId), req.user?.userId);

    await invalidateAllocationWrites({
      orgId: allocation.OrganizationId,
      projectId: allocation.ProjectId,
      taskId: Number(TaskId),
    });

    res.json({ success: true, message: 'Manual allocation updated successfully' });
  } catch (error) {
    logger.error('Error updating manual allocation:', error);
    res.status(500).json({ success: false, message: 'Failed to update manual allocation' });
  }
});

/**
 * @swagger
 * /api/task-allocations/manual/{id}:
 *   delete:
 *     summary: Delete a manual allocation
 *     tags: [TaskAllocations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Allocation ID
 *     responses:
 *       200:
 *         description: Manual allocation deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Allocation not found
 */
/**
 * @route   DELETE /api/task-allocations/manual/:id
 * @desc    Delete a manual allocation
 * @access  Authenticated users with task assignment permissions
 */
router.delete('/manual/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Verify it's a manual allocation and get task ID
    const [allocations] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, IsManual, TaskId, UserId FROM TaskAllocations WHERE Id = ?',
      [id]
    );

    if (allocations.length === 0) {
      return res.status(404).json({ success: false, message: 'Allocation not found' });
    }

    if (allocations[0].IsManual !== 1) {
      return res.status(400).json({
        success: false,
        message: 'Only manual allocations can be deleted this way'
      });
    }

    const taskId = allocations[0].TaskId;
    const userId = allocations[0].UserId;

    // Delete allocation
    await pool.execute<ResultSetHeader>(
      'DELETE FROM TaskAllocations WHERE Id = ?',
      [id]
    );

    const [remainingForUserRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count
       FROM TaskAllocations
       WHERE TaskId = ? AND UserId = ?`,
      [taskId, userId]
    );

    if (Number(remainingForUserRows[0]?.count || 0) === 0) {
      await pool.execute(
        `DELETE FROM TaskAllocationHeaders
         WHERE TaskId = ? AND UserId = ?`,
        [taskId, userId]
      );
    }

    await recomputeTaskPlanDatesFromAllocations(Number(taskId), req.user?.userId);

    const planningContext = await getTaskPlanningContext(Number(taskId));
    await invalidateAllocationWrites({
      orgId: planningContext?.OrganizationId,
      projectId: planningContext?.ProjectId,
      taskId: Number(taskId),
    });

    res.json({ success: true, message: 'Manual allocation deleted successfully' });
  } catch (error) {
    logger.error('Error deleting manual allocation:', error);
    res.status(500).json({ success: false, message: 'Failed to delete manual allocation' });
  }
});

export default router;
