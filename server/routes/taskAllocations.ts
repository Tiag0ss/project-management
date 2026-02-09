import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { createNotification } from './notifications';

const router = express.Router();

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
      const values = newAllocations.map(a => [depTask.Id, userId, a.date, a.hours, a.startTime, a.endTime]);
      await pool.query(
        'INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime) VALUES ?',
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

    res.json({ success: true, allocations });
  } catch (error) {
    console.error('Error fetching user date allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch allocations' });
  }
});

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

    // Delete all allocations for these tasks from the given date onwards
    for (const taskData of affectedTasksData) {
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
    }

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
    
    // Allocate hours for a task using available slots
    const allocateTask = async (taskId: number, hoursToAllocate: number, startFromDate: Date, isHobby: boolean = false) => {
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
              `INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime)
               VALUES (?, ?, ?, ?, ?, ?)`,
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
              `INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime)
               VALUES (?, ?, ?, ?, ?, ?)`,
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
        
        console.log(`  Task ${taskId} @ ${dateStr}: ${formatTime(actualStart)}-${formatTime(actualEnd)} (${hoursNow}h, hobby=${isHobby})`);
        
        // Create allocation
        await pool.execute(
          `INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [taskId, userId, dateStr, hoursNow, formatTime(actualStart), formatTime(actualEnd)]
        );
        
        // Update slot position for this day
        daySlots[dateStr] = actualEnd;
        
        // Skip lunch if we're now at lunch (only for work tasks)
        if (effectiveLunchDuration > 0 && daySlots[dateStr] >= lunchStartMinutes && daySlots[dateStr] < lunchEndMinutes) {
          daySlots[dateStr] = lunchEndMinutes;
        }
        
        remaining -= hoursNow;
        
        // If day is now full, advance
        if (daySlots[dateStr] >= workEndMinutes) {
          currentDate = advanceToNextWorkDay(currentDate, isHobby);
        }
      }
    };

    const startDate = new Date(fromDate + 'T12:00:00');

    // FIRST: Allocate the NEW task with its hobby flag
    console.log(`Allocating NEW Task ${newTaskId}: ${newTaskHours}h (hobby=${newTaskIsHobby})`);
    await allocateTask(newTaskId, newTaskHours, startDate, newTaskIsHobby);

    // THEN: Allocate the affected tasks after the new task (slots now have the new task's allocations)
    for (const taskData of affectedTasksData) {
      const remainingHours = parseFloat(taskData.AllocatedHoursFromDate) || 0;
      if (remainingHours <= 0) continue;
      
      const taskIsHobby = taskData.IsHobby === 1;
      console.log(`Allocating Task ${taskData.TaskId}: ${remainingHours}h (hobby=${taskIsHobby})`);
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
        a.endTime || '17:00'
      ]);
      await pool.query(
        'INSERT INTO TaskAllocations (TaskId, UserId, AllocationDate, AllocatedHours, StartTime, EndTime) VALUES ?',
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

export default router;
