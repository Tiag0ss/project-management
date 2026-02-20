import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { createNotification } from './notifications';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: TaskAllocations
 *   description: Resource planning and allocation endpoints
 */

// Helper function to replan dependent tasks when a task's end date changes
async function replanDependentTasks(taskId: number, newEndDate: string): Promise<void> {
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
      const values = newAllocations.map(a => [depTask.Id, userId, a.date, a.hours, a.startTime, a.endTime, 0]);
      await pool.query(
        'INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual) VALUES ?',
        [values]
      );

      // Update task dates
      await pool.execute(
        'UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ? WHERE Id = ?',
        [newStartDate, newTaskEndDate, depTask.Id]
      );

      // Recursively replan tasks that depend on this dependent task
      if (newTaskEndDate) {
        await replanDependentTasks(depTask.Id, newTaskEndDate);
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

    // Get allocations for all tasks the user has access to (through organization membership)
    const [allocations] = await pool.execute<RowDataPacket[]>(
      `SELECT ta.TaskId, ta.UserId, ta.AllocationDate, ta.AllocatedHours, 
              COALESCE(p.IsHobby, 0) as IsHobby
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE om.UserId = ?
       ORDER BY ta.AllocationDate`,
      [userId]
    );

    res.json({ success: true, allocations });
  } catch (error) {
    console.error('Error fetching all allocations:', error);
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
      `SELECT p.Id
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, req.user?.userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    const [allocations] = await pool.execute<RowDataPacket[]>(
      `SELECT ta.*, t.TaskName, u.Username, u.FirstName, u.LastName
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       LEFT JOIN Users u ON ta.UserId = u.Id
       WHERE t.ProjectId = ?
       ORDER BY ta.AllocationDate DESC, t.TaskName`,
      [projectId]
    );

    res.json({ success: true, allocations });
  } catch (error) {
    console.error('Error fetching project allocations:', error);
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

    const [allocations] = await pool.execute<RowDataPacket[]>(
      `SELECT ta.*, u.Username, u.FirstName, u.LastName
       FROM TaskAllocations ta
       LEFT JOIN Users u ON ta.UserId = u.Id
       WHERE ta.TaskId = ?
       ORDER BY ta.AllocationDate`,
      [taskId]
    );

    res.json({ success: true, allocations });
  } catch (error) {
    console.error('Error fetching task allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch task allocations' });
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
    console.error('Error fetching user date allocations:', error);
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
              HobbyHoursFriday, HobbyHoursSaturday, HobbyHoursSunday
       FROM Users WHERE Id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Helper function to check if a date is a work day and get max hours
    const getWorkHoursForDay = (date: Date): number => {
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek];
      const workHoursKey = `WorkHours${dayName}`;
      return parseFloat(user[workHoursKey] || 0);
    };

    const getWorkStartForDay = (date: Date): string => {
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek];
      const workStartKey = `WorkStart${dayName}`;
      return user[workStartKey] || '09:00';
    };

    // Hobby helper functions
    const getHobbyHoursForDay = (date: Date): number => {
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek];
      const hobbyHoursKey = `HobbyHours${dayName}`;
      return parseFloat(user[hobbyHoursKey] || 0);
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
    const [affectedTasksData] = await pool.execute<RowDataPacket[]>(
      `SELECT ta.TaskId, 
              SUM(ta.AllocatedHours) as AllocatedHoursFromDate,
              MIN(ta.AllocationDate) as FirstAllocationDate,
              MIN(ta.StartTime) as FirstStartTime,
              COALESCE(p.IsHobby, 0) as IsHobby
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE ta.UserId = ? AND ta.AllocationDate >= ?
       GROUP BY ta.TaskId, p.IsHobby
       ORDER BY FirstAllocationDate ASC, FirstStartTime ASC, ta.TaskId ASC`,
      [userId, fromDate]
    );

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
    await pool.execute(
      `DELETE FROM TaskChildAllocations WHERE ParentTaskId IN (
        WITH RECURSIVE Descendants AS (
          SELECT Id FROM Tasks WHERE Id = ?
          UNION ALL
          SELECT t.Id FROM Tasks t INNER JOIN Descendants d ON t.ParentTaskId = d.Id
        )
        SELECT Id FROM Descendants
      )`,
      [newTaskId]
    );

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
    
    console.log(`Push-forward: loaded ${recurringOccurrences.length} recurring blocks for user ${userId}`);

    // Get IsHobby for the new task
    const [newTaskInfo] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(p.IsHobby, 0) as IsHobby
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE t.Id = ?`,
      [newTaskId]
    );
    const newTaskIsHobby = newTaskInfo.length > 0 && newTaskInfo[0].IsHobby === 1;

    console.log(`Push-forward: new task ${newTaskId} (${newTaskHours}h, hobby=${newTaskIsHobby}) starting from ${fromDate}`);
    
    const formatTime = (mins: number) => {
      const h = Math.floor(mins / 60);
      const m = Math.round(mins % 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    
    // Allocate hours for a task using available slots - returns the last allocation date
    const allocateTask = async (taskId: number, hoursToAllocate: number, startFromDate: Date, isHobby: boolean = false): Promise<Date> => {
      let lastAllocationDate = new Date(startFromDate);
      let currentDate = new Date(startFromDate);
      let remaining = hoursToAllocate;
      
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
            console.log(`  Task ${taskId} @ ${dateStr}: skipping recurring block ${formatTime(block.startMinutes)}-${formatTime(block.endMinutes)}`);
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
            
            console.log(`  Task ${taskId} @ ${dateStr} (morning): ${formatTime(morningStart)}-${formatTime(morningEnd)} (${morningHoursToAllocate}h)`);
            
            await pool.execute(
              `INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
               VALUES (?, ?, ?, ?, ?, ?, 0)`,
              [taskId, userId, dateStr, morningHoursToAllocate, formatTime(morningStart), formatTime(morningEnd)]
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
            
            console.log(`  Task ${taskId} @ ${dateStr} (afternoon): ${formatTime(afternoonStart)}-${formatTime(afternoonEnd)} (${afternoonHoursToAllocate}h)`);
            
            await pool.execute(
              `INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
               VALUES (?, ?, ?, ?, ?, ?, 0)`,
              [taskId, userId, dateStr, afternoonHoursToAllocate, formatTime(afternoonStart), formatTime(afternoonEnd)]
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
            console.log(`  Task ${taskId} @ ${dateStr}: stopping at ${formatTime(block.startMinutes)} due to recurring block`);
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
        
        console.log(`  Task ${taskId} @ ${dateStr}: ${formatTime(actualStart)}-${formatTime(actualEnd)} (${actualHours}h, hobby=${isHobby})`);
        
        // Create allocation
        await pool.execute(
          `INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
           VALUES (?, ?, ?, ?, ?, ?, 0)`,
          [taskId, userId, dateStr, actualHours, formatTime(actualStart), formatTime(actualEnd)]
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
    console.log(`Allocating NEW Task ${newTaskId}: ${newTaskHours}h (hobby=${newTaskIsHobby})`);
    const newTaskEndDate = await allocateTask(newTaskId, newTaskHours, startDate, newTaskIsHobby);
    const newTaskEndDateStr = newTaskEndDate.toISOString().split('T')[0];
    console.log(`New task ends on: ${newTaskEndDateStr}`);

    // THEN: Only reallocate tasks that START on or before the new task's END date
    // Tasks that start after the new task ends are not affected (allocations remain intact)
    for (const taskData of affectedTasksData) {
      // Skip the new task - it was already allocated above with the user-specified hours
      if (taskData.TaskId === newTaskId) continue;
      
      const remainingHours = parseFloat(taskData.AllocatedHoursFromDate) || 0;
      if (remainingHours <= 0) continue;
      
      // Check if this task starts before or on the new task's end date
      const taskFirstAllocation = new Date(taskData.FirstAllocationDate);
      if (taskFirstAllocation > newTaskEndDate) {
        console.log(`Task ${taskData.TaskId} starts on ${taskData.FirstAllocationDate} (after new task ends on ${newTaskEndDateStr}) - NOT replanning (allocations preserved)`);
        continue;
      }
      
      // This task IS affected - delete its existing allocations before re-allocating
      console.log(`Task ${taskData.TaskId} starts on ${taskData.FirstAllocationDate} (overlaps with new task) - DELETING and replanning`);
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
      await pool.execute(
        `DELETE FROM TaskChildAllocations WHERE AllocationDate >= ? AND ParentTaskId IN (
          WITH RECURSIVE Descendants AS (
            SELECT Id FROM Tasks WHERE Id = ?
            UNION ALL
            SELECT t.Id FROM Tasks t INNER JOIN Descendants d ON t.ParentTaskId = d.Id
          )
          SELECT Id FROM Descendants
        )`,
        [fromDate, taskData.TaskId]
      );
      
      const taskIsHobby = taskData.IsHobby === 1;
      console.log(`Re-allocating Task ${taskData.TaskId}: ${remainingHours}h (hobby=${taskIsHobby})`);
      await allocateTask(taskData.TaskId, remainingHours, startDate, taskIsHobby);
    }

    // Update the PlannedStartDate and PlannedEndDate of the new task
    const [newTaskAllocations] = await pool.execute<RowDataPacket[]>(
      `SELECT MIN(AllocationDate) as StartDate, MAX(AllocationDate) as EndDate
       FROM TaskAllocations WHERE TaskId = ?`,
      [newTaskId]
    );
    
    if (newTaskAllocations.length > 0 && newTaskAllocations[0].StartDate) {
      await pool.execute(
        `UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ? WHERE Id = ?`,
        [newTaskAllocations[0].StartDate, newTaskAllocations[0].EndDate, newTaskId]
      );
      // Note: Don't call replanDependentTasks here - push-forward already handles all affected tasks
    }

    // Update the PlannedStartDate and PlannedEndDate of affected tasks
    for (const taskData of affectedTasksData) {
      const [taskAllocations] = await pool.execute<RowDataPacket[]>(
        `SELECT MIN(AllocationDate) as StartDate, MAX(AllocationDate) as EndDate
         FROM TaskAllocations WHERE TaskId = ?`,
        [taskData.TaskId]
      );
      
      if (taskAllocations.length > 0 && taskAllocations[0].StartDate) {
        await pool.execute(
          `UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ? WHERE Id = ?`,
          [taskAllocations[0].StartDate, taskAllocations[0].EndDate, taskData.TaskId]
        );
        // Note: Don't call replanDependentTasks here - push-forward already handles all affected tasks
      }
    }

    res.json({ 
      success: true, 
      message: `Allocated new task and replanned ${affectedTasksData.length} tasks` 
    });
  } catch (error) {
    console.error('Error pushing forward allocations:', error);
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
    const { startDate, endDate, excludeTaskId, isHobby } = req.query;

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
              HobbyHoursFriday, HobbyHoursSaturday, HobbyHoursSunday
       FROM Users WHERE Id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];

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
      
      // Find allocation from merged map (direct + child allocations)
      const allocated = allocationMap.get(dateStr);
      const allocatedHours = allocated ? allocated.totalAllocated : 0;
      const latestEndTime = allocated?.latestEndTime || null;

      // Calculate available hours based on remaining time window, not just capacity minus allocated
      let availableHours = Math.max(0, maxHours - allocatedHours);
      
      // If there are existing allocations with an end time, cap available hours
      // by the remaining time in the configured window
      if (latestEndTime && maxHours > 0) {
        const [slotStartH, slotStartM] = slotStartTime.split(':').map(Number);
        const slotStartMinutes = slotStartH * 60 + slotStartM;
        const slotEndMinutes = slotStartMinutes + maxHours * 60;
        
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
        maxHours,
        allocatedHours,
        availableHours,
        workStartTime: slotStartTime,
        latestEndTime,
        isHobby: forHobby
      });
    }

    res.json({ success: true, availability });
  } catch (error) {
    console.error('Error fetching user availability:', error);
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
    const { taskId, userId, allocations } = req.body;

    if (!taskId || !userId || !Array.isArray(allocations)) {
      return res.status(400).json({ 
        success: false, 
        message: 'TaskId, userId, and allocations array are required' 
      });
    }

    // Verify user has permission to plan tasks
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, p.OrganizationId, om.Role,
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

    // Delete existing allocations for this task
    await pool.execute(
      'DELETE FROM TaskAllocations WHERE TaskId = ?',
      [taskId]
    );

    // Delete child allocations at ALL levels (multi-level hierarchy)
    await pool.execute('DELETE FROM TaskChildAllocations WHERE ChildTaskId = ?', [taskId]);
    await pool.execute(
      `DELETE FROM TaskChildAllocations WHERE ParentTaskId IN (
        WITH RECURSIVE Descendants AS (
          SELECT Id FROM Tasks WHERE Id = ?
          UNION ALL
          SELECT t.Id FROM Tasks t INNER JOIN Descendants d ON t.ParentTaskId = d.Id
        )
        SELECT Id FROM Descendants
      )`,
      [taskId]
    );

    // Insert new allocations with start and end times
    if (allocations.length > 0) {
      const values = allocations.map((a: any) => [
        taskId, 
        userId, 
        a.date, 
        a.hours,
        a.startTime || '09:00',
        a.endTime || '17:00',
        0
      ]);
      await pool.query(
        'INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual) VALUES ?',
        [values]
      );
    }

    // Update task's PlannedStartDate and PlannedEndDate
    if (allocations.length > 0) {
      const dates = allocations.map((a: any) => a.date).sort();
      const newEndDate = dates[dates.length - 1];
      
      // Get task info for notification
      const [taskInfo] = await pool.execute<RowDataPacket[]>(
        `SELECT t.Id, t.TaskName, t.AssignedTo, p.Id as ProjectId, p.ProjectName
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         WHERE t.Id = ?`,
        [taskId]
      );
      
      await pool.execute(
        'UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ?, AssignedTo = ? WHERE Id = ?',
        [dates[0], newEndDate, userId, taskId]
      );

      // Notify user about allocation (if different from current user making the allocation)
      if (taskInfo.length > 0 && userId !== req.user?.userId) {
        const totalHours = allocations.reduce((sum: number, a: any) => sum + parseFloat(a.hours || 0), 0);
        await createNotification(
          userId,
          'task_allocated',
          'Task Allocated to You',
          `You have been allocated ${totalHours.toFixed(1)}h on task "${taskInfo[0].TaskName}" in project "${taskInfo[0].ProjectName}"`,
          `/projects/${taskInfo[0].ProjectId}`,
          Number(taskId),
          taskInfo[0].ProjectId
        );
      }

      // Replan any tasks that depend on this task
      await replanDependentTasks(Number(taskId), newEndDate);
    }

    res.json({ success: true, message: 'Allocations saved successfully' });
  } catch (error) {
    console.error('Error saving task allocations:', error);
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
      `SELECT t.Id, p.OrganizationId, om.Role,
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

    // Also delete child allocations for this task on this date (at all levels)
    await pool.execute(
      'DELETE FROM TaskChildAllocations WHERE ParentTaskId = ? AND AllocationDate = ?',
      [taskId, allocationDate]
    );

    // Check if task has any remaining allocations
    const [remaining] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM TaskAllocations WHERE TaskId = ?',
      [taskId]
    );

    // If no allocations left, clear planned dates
    if (remaining[0].count === 0) {
      await pool.execute(
        'UPDATE Tasks SET PlannedStartDate = NULL, PlannedEndDate = NULL WHERE Id = ?',
        [taskId]
      );
    } else {
      // Update planned dates based on remaining allocations
      const [dates] = await pool.execute<RowDataPacket[]>(
        'SELECT MIN(AllocationDate) as startDate, MAX(AllocationDate) as endDate FROM TaskAllocations WHERE TaskId = ?',
        [taskId]
      );
      
      if (dates[0].startDate && dates[0].endDate) {
        await pool.execute(
          'UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ? WHERE Id = ?',
          [dates[0].startDate, dates[0].endDate, taskId]
        );
      }
    }

    res.json({ success: true, message: 'Allocation deleted successfully' });
  } catch (error) {
    console.error('Error deleting allocation:', error);
    res.status(500).json({ success: false, message: 'Failed to delete allocation' });
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
      `SELECT t.Id, p.OrganizationId, om.Role,
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

    // Get task info and current allocations for notification before deleting
    const [taskInfo] = await pool.execute<RowDataPacket[]>(
      `SELECT t.TaskName, p.Id as ProjectId, p.ProjectName
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE t.Id = ?`,
      [taskId]
    );
    
    const [currentAllocations] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT UserId FROM TaskAllocations WHERE TaskId = ?`,
      [taskId]
    );

    await pool.execute('DELETE FROM TaskAllocations WHERE TaskId = ?', [taskId]);

    // Delete child allocations at ALL levels (multi-level hierarchy)
    // 1. Delete where this task is a child in another parent's allocations
    await pool.execute('DELETE FROM TaskChildAllocations WHERE ChildTaskId = ?', [taskId]);
    // 2. Recursively find all descendant tasks and delete their child allocations
    await pool.execute(
      `DELETE FROM TaskChildAllocations WHERE ParentTaskId IN (
        WITH RECURSIVE Descendants AS (
          SELECT Id FROM Tasks WHERE Id = ?
          UNION ALL
          SELECT t.Id FROM Tasks t INNER JOIN Descendants d ON t.ParentTaskId = d.Id
        )
        SELECT Id FROM Descendants
      )`,
      [taskId]
    );

    // Clear planned dates for this task and all descendants
    await pool.execute(
      `UPDATE Tasks SET PlannedStartDate = NULL, PlannedEndDate = NULL WHERE Id IN (
        WITH RECURSIVE Descendants AS (
          SELECT Id FROM Tasks WHERE Id = ?
          UNION ALL
          SELECT t.Id FROM Tasks t INNER JOIN Descendants d ON t.ParentTaskId = d.Id
        )
        SELECT Id FROM Descendants
      )`,
      [taskId]
    );
    
    // Notify all users who had allocations (if different from current user)
    if (taskInfo.length > 0) {
      for (const allocation of currentAllocations) {
        if (allocation.UserId !== req.user?.userId) {
          await createNotification(
            allocation.UserId,
            'task_updated',
            'Task Allocation Removed',
            `Your allocation on task "${taskInfo[0].TaskName}" has been removed`,
            `/projects/${taskInfo[0].ProjectId}`,
            Number(taskId),
            taskInfo[0].ProjectId
          );
        }
      }
    }

    res.json({ success: true, message: 'Allocations deleted successfully' });
  } catch (error) {
    console.error('Error deleting task allocations:', error);
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

    // Get allocations from leaf tasks and child allocations (only leaf children - no intermediate levels)
    let query = `
      WITH RECURSIVE TaskHierarchy AS (
        -- Base: get all direct child allocations
        SELECT 
          tca.Id,
          tca.ChildTaskId,
          tca.ParentTaskId,
          tca.AllocationDate,
          tca.AllocatedHours,
          tca.StartTime,
          tca.EndTime,
          child.TaskName as ChildName,
          parent.TaskName as ParentName,
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
        
        -- Recursive: get grandchildren and deeper levels
        SELECT 
          tca2.Id,
          tca2.ChildTaskId,
          tca2.ParentTaskId,
          tca2.AllocationDate,
          tca2.AllocatedHours,
          tca2.StartTime,
          tca2.EndTime,
          child2.TaskName as ChildName,
          CONCAT(th.ParentName, ' > ', parent2.TaskName) as ParentName,
          child2.ProjectId,
          th.Level + 1
        FROM TaskHierarchy th
        INNER JOIN TaskChildAllocations tca2 ON tca2.ParentTaskId = th.ChildTaskId
        INNER JOIN Tasks child2 ON tca2.ChildTaskId = child2.Id
        INNER JOIN Tasks parent2 ON tca2.ParentTaskId = parent2.Id
      )
      SELECT 
        ta.Id,
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
    `;
    const params: any[] = [userId, userId, userId];

    if (startDate && endDate) {
      query = `
        SELECT * FROM (${query}) AS combined
        WHERE AllocationDate BETWEEN ? AND ?
        ORDER BY AllocationDate, StartTime
      `;
      params.push(startDate, endDate);
    } else {
      query += ` ORDER BY AllocationDate, StartTime`;
    }

    const [allocations] = await pool.execute<RowDataPacket[]>(query, params);

    res.json({ success: true, allocations });
  } catch (error) {
    console.error('Error fetching my allocations:', error);
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
    const { taskId, userId, allocationDate, allocatedHours } = req.body;

    if (!taskId || !userId || !allocationDate || !allocatedHours) {
      return res.status(400).json({
        success: false,
        message: 'TaskId, UserId, AllocationDate, and AllocatedHours are required'
      });
    }

    // Verify task exists and get project info
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ProjectId, COALESCE(p.IsHobby, 0) as IsHobby
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE t.Id = ?`,
      [taskId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const task = tasks[0];
    const isHobby = task.IsHobby === 1;

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
    const dailyCapacity = isHobby
      ? parseFloat(user[`HobbyHours${dayName}`] || 0)
      : parseFloat(user[`WorkHours${dayName}`] || 0);

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
      [userId, allocationDate]
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
      [userId, allocationDate, isHobby ? 1 : 0]
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
          `INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [taskId, userId, allocationDate, morningHours, formatTime(morningStart), formatTime(morningEnd)]
        );

        // Create afternoon allocation
        const afternoonMinutes = minutesToAllocate - morningAvail;
        const afternoonHours = afternoonMinutes / 60;
        const afternoonStart = lunchEndMinutes;
        const afternoonEnd = afternoonStart + afternoonMinutes;

        await pool.execute<ResultSetHeader>(
          `INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [taskId, userId, allocationDate, afternoonHours, formatTime(afternoonStart), formatTime(afternoonEnd)]
        );

        // Update task's PlannedStartDate and PlannedEndDate
        const [allAllocations] = await pool.execute<RowDataPacket[]>(
          'SELECT DISTINCT AllocationDate FROM TaskAllocations WHERE TaskId = ? ORDER BY AllocationDate',
          [taskId]
        );
        if (allAllocations.length > 0) {
          const startDate = allAllocations[0].AllocationDate;
          const endDate = allAllocations[allAllocations.length - 1].AllocationDate;
          await pool.execute(
            'UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ?, AssignedTo = ? WHERE Id = ?',
            [startDate, endDate, userId, taskId]
          );
        }

        return res.json({ success: true, message: 'Manual allocation created (split across lunch break)' });
      }
    }

    // Single allocation (doesn't cross lunch or is hobby)
    const startTime = formatTime(slotStart);
    const endTime = formatTime(slotStart + minutesToAllocate);

    await pool.execute<ResultSetHeader>(
      `INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [taskId, userId, allocationDate, allocatedHours, startTime, endTime]
    );

    // Update task's PlannedStartDate and PlannedEndDate
    const [allAllocations] = await pool.execute<RowDataPacket[]>(
      'SELECT DISTINCT AllocationDate FROM TaskAllocations WHERE TaskId = ? ORDER BY AllocationDate',
      [taskId]
    );
    if (allAllocations.length > 0) {
      const startDate = allAllocations[0].AllocationDate;
      const endDate = allAllocations[allAllocations.length - 1].AllocationDate;
      await pool.execute(
        'UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ?, AssignedTo = ? WHERE Id = ?',
        [startDate, endDate, userId, taskId]
      );
    }

    res.json({ success: true, message: 'Manual allocation created successfully' });
  } catch (error) {
    console.error('Error creating manual allocation:', error);
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
    const { allocatedHours } = req.body;

    if (!allocatedHours) {
      return res.status(400).json({
        success: false,
        message: 'AllocatedHours is required'
      });
    }

    // Get the allocation details
    const [allocations] = await pool.execute<RowDataPacket[]>(
      `SELECT ta.Id, ta.IsManual, ta.TaskId, ta.UserId, ta.AllocationDate,
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
    const { TaskId, UserId, AllocationDate } = allocation;

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

    const dailyCapacity = isHobby
      ? parseFloat(user[`HobbyHours${dayName}`] || 0)
      : parseFloat(user[`WorkHours${dayName}`] || 0);

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

    const minutesToAllocate = allocatedHours * 60;

    if (!isHobby && effectiveLunchDuration > 0 && slotStart < lunchStartMinutes) {
      const morningAvail = lunchStartMinutes - slotStart;

      if (minutesToAllocate > morningAvail) {
        const morningHours = morningAvail / 60;
        const morningStart = slotStart;
        const morningEnd = lunchStartMinutes;

        await pool.execute<ResultSetHeader>(
          `INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [TaskId, UserId, AllocationDate, morningHours, formatTime(morningStart), formatTime(morningEnd)]
        );

        const afternoonMinutes = minutesToAllocate - morningAvail;
        const afternoonHours = afternoonMinutes / 60;
        const afternoonStart = lunchEndMinutes;
        const afternoonEnd = afternoonStart + afternoonMinutes;

        await pool.execute<ResultSetHeader>(
          `INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [TaskId, UserId, AllocationDate, afternoonHours, formatTime(afternoonStart), formatTime(afternoonEnd)]
        );

        // Update task's PlannedStartDate and PlannedEndDate
        const [allAllocations] = await pool.execute<RowDataPacket[]>(
          'SELECT DISTINCT AllocationDate FROM TaskAllocations WHERE TaskId = ? ORDER BY AllocationDate',
          [TaskId]
        );
        if (allAllocations.length > 0) {
          const startDate = allAllocations[0].AllocationDate;
          const endDate = allAllocations[allAllocations.length - 1].AllocationDate;
          await pool.execute(
            'UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ?, AssignedTo = ? WHERE Id = ?',
            [startDate, endDate, UserId, TaskId]
          );
        }

        return res.json({ success: true, message: 'Manual allocation updated (split across lunch break)' });
      }
    }

    const startTime = formatTime(slotStart);
    const endTime = formatTime(slotStart + minutesToAllocate);

    await pool.execute<ResultSetHeader>(
      `INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime, IsManual)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [TaskId, UserId, AllocationDate, allocatedHours, startTime, endTime]
    );

    // Update task's PlannedStartDate and PlannedEndDate
    const [allAllocations] = await pool.execute<RowDataPacket[]>(
      'SELECT DISTINCT AllocationDate FROM TaskAllocations WHERE TaskId = ? ORDER BY AllocationDate',
      [TaskId]
    );
    if (allAllocations.length > 0) {
      const startDate = allAllocations[0].AllocationDate;
      const endDate = allAllocations[allAllocations.length - 1].AllocationDate;
      await pool.execute(
        'UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ?, AssignedTo = ? WHERE Id = ?',
        [startDate, endDate, UserId, TaskId]
      );
    }

    res.json({ success: true, message: 'Manual allocation updated successfully' });
  } catch (error) {
    console.error('Error updating manual allocation:', error);
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
      'SELECT Id, IsManual, TaskId FROM TaskAllocations WHERE Id = ?',
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

    // Delete allocation
    await pool.execute<ResultSetHeader>(
      'DELETE FROM TaskAllocations WHERE Id = ?',
      [id]
    );

    // Update task's PlannedStartDate and PlannedEndDate
    const [remainingAllocations] = await pool.execute<RowDataPacket[]>(
      'SELECT DISTINCT AllocationDate, UserId FROM TaskAllocations WHERE TaskId = ? ORDER BY AllocationDate',
      [taskId]
    );

    if (remainingAllocations.length > 0) {
      const startDate = remainingAllocations[0].AllocationDate;
      const endDate = remainingAllocations[remainingAllocations.length - 1].AllocationDate;
      // Get the most recent user from remaining allocations
      const assignedUserId = remainingAllocations[remainingAllocations.length - 1].UserId;
      await pool.execute(
        'UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ?, AssignedTo = ? WHERE Id = ?',
        [startDate, endDate, assignedUserId, taskId]
      );
    } else {
      // No more allocations - clear planned dates and assignment
      await pool.execute(
        'UPDATE Tasks SET PlannedStartDate = NULL, PlannedEndDate = NULL, AssignedTo = NULL WHERE Id = ?',
        [taskId]
      );
    }

    res.json({ success: true, message: 'Manual allocation deleted successfully' });
  } catch (error) {
    console.error('Error deleting manual allocation:', error);
    res.status(500).json({ success: false, message: 'Failed to delete manual allocation' });
  }
});

export default router;
