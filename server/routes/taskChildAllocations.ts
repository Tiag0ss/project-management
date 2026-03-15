import express, { Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { dbProvider, pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';

const router = express.Router();

const normalizeDateKey = (value: unknown): string => String(value || '').split('T')[0];

const getHolidayDateSetForUser = async (userId: number, startDate: string, endDate: string): Promise<Set<string>> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT h.HolidayDate
     FROM Users u
     INNER JOIN Holidays h ON h.CountryCode = COALESCE(NULLIF(UPPER(TRIM(u.CountryCode)), ''), 'PT')
     WHERE u.Id = ?
       AND h.IsActive = 1
       AND h.HolidayDate BETWEEN ? AND ?`,
    [userId, startDate, endDate]
  );

  const result = new Set<string>();
  for (const row of rows) {
    result.add(normalizeDateKey(row.HolidayDate));
  }

  const [vacationRows] = await pool.execute<RowDataPacket[]>(
    `SELECT VacationDate
     FROM UserVacations
     WHERE UserId = ?
       AND LOWER(Status) = 'approved'
       AND VacationDate BETWEEN ? AND ?`,
    [userId, startDate, endDate]
  );

  for (const row of vacationRows) {
    result.add(normalizeDateKey(row.VacationDate));
  }

  return result;
};

/**
 * @swagger
 * tags:
 *   name: TaskChildAllocations
 *   description: Parent task time allocation to child tasks
 */

/**
 * @swagger
 * /api/task-child-allocations/batch:
 *   post:
 *     summary: Create or update child allocations in batch
 *     tags: [TaskChildAllocations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parentTaskId:
 *                 type: integer
 *               allocations:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Child allocations saved successfully
 */
// Save child allocations in batch
router.post('/batch', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { allocations, replaceParent } = req.body;

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ success: false, message: 'Allocations array is required' });
    }

    // Delete existing child allocations for the parent task
    const parentTaskId = allocations[0].ParentTaskId;

    const normalizedDates = Array.from(
      new Set(
        allocations
          .map((alloc: any) => normalizeDateKey(alloc.AllocationDate))
          .filter((date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      )
    ).sort();

    if (normalizedDates.length > 0) {
      const [parentTaskRows] = await pool.execute<RowDataPacket[]>(
        'SELECT AssignedTo FROM Tasks WHERE Id = ?',
        [parentTaskId]
      );
      const assignedUserId = Number(parentTaskRows[0]?.AssignedTo || 0);

      if (assignedUserId > 0) {
        const holidayDates = await getHolidayDateSetForUser(assignedUserId, normalizedDates[0], normalizedDates[normalizedDates.length - 1]);
        const blockedDates = normalizedDates.filter((date) => holidayDates.has(date));

        if (blockedDates.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Cannot create child allocations on holidays for assigned user: ${blockedDates.join(', ')}`
          });
        }
      }
    }

    const shouldReplaceParent = replaceParent !== false;
    if (shouldReplaceParent) {
      await pool.execute(
        'DELETE FROM TaskChildAllocations WHERE ParentTaskId = ?',
        [parentTaskId]
      );
    }

    // Insert new child allocations
    const values: any[] = [];
    const placeholders: string[] = [];

    for (const alloc of allocations) {
      placeholders.push('(?, ?, ?, ?, ?, ?, ?)');
      values.push(
        alloc.ParentTaskId,
        alloc.ChildTaskId,
        alloc.AllocationDate,
        alloc.AllocatedHours,
        alloc.Level,
        alloc.StartTime || null,
        alloc.EndTime || null
      );
    }

    const query = `
      INSERT INTO TaskChildAllocations 
      (ParentTaskId, ChildTaskId, AllocationDate, AllocatedHours, Level, StartTime, EndTime)
      VALUES ${placeholders.join(', ')}
    `;

    await pool.execute(query, values);

    // Update PlannedStartDate and PlannedEndDate for each child task
    const childTaskIds = [...new Set(allocations.map((a: any) => a.ChildTaskId))];
    
    for (const childTaskId of childTaskIds) {
      const [childDateRange] = await pool.execute<RowDataPacket[]>(
        `SELECT MIN(AllocationDate) as PlannedStartDate, MAX(AllocationDate) as PlannedEndDate
         FROM TaskChildAllocations
         WHERE ChildTaskId = ?`,
        [childTaskId]
      );

      const plannedStartDate = childDateRange[0]?.PlannedStartDate
        ? normalizeDateKey(childDateRange[0].PlannedStartDate)
        : null;
      const plannedEndDate = childDateRange[0]?.PlannedEndDate
        ? normalizeDateKey(childDateRange[0].PlannedEndDate)
        : null;

      if (plannedStartDate && plannedEndDate) {
        await pool.execute(
          'UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ? WHERE Id = ?',
          [plannedStartDate, plannedEndDate, childTaskId]
        );
      }
    }

    res.json({ 
      success: true, 
      message: `Saved ${allocations.length} child allocations`,
      count: allocations.length 
    });

  } catch (error) {
    console.error('Error saving child allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to save child allocations' });
  }
});

/**
 * @swagger
 * /api/task-child-allocations/parent/{parentTaskId}:
 *   get:
 *     summary: Get child allocations for a parent task
 *     tags: [TaskChildAllocations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: parentTaskId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Child allocations retrieved successfully
 */
// Get child allocations for a parent task
router.get('/parent/:parentTaskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { parentTaskId } = req.params;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        tca.*,
        t.TaskName as ChildTaskName
      FROM TaskChildAllocations tca
      JOIN Tasks t ON t.Id = tca.ChildTaskId
      WHERE tca.ParentTaskId = ?
      ORDER BY tca.AllocationDate, tca.Level, tca.ChildTaskId`,
      [parentTaskId]
    );

    res.json({ success: true, allocations: rows });

  } catch (error) {
    console.error('Error fetching child allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch child allocations' });
  }
});

/**
 * @swagger
 * /api/task-child-allocations/child/{childTaskId}:
 *   get:
 *     summary: Get allocations for a child task
 *     tags: [TaskChildAllocations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: childTaskId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Child task allocations retrieved successfully
 */
// Get child allocations for a specific child task
router.get('/child/:childTaskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { childTaskId } = req.params;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT tca.*
      FROM TaskChildAllocations tca
      WHERE tca.ChildTaskId = ?
      ORDER BY tca.AllocationDate`,
      [childTaskId]
    );

    res.json({ success: true, allocations: rows });

  } catch (error) {
    console.error('Error fetching child allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch child allocations' });
  }
});

/**
 * @swagger
 * /api/task-child-allocations/user/{userId}/date/{date}:
 *   get:
 *     summary: Get child allocations for user on a date
 *     tags: [TaskChildAllocations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: isHobby
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: User child allocations for the date
 */
// Get child allocations for a user on a specific date (to calculate occupied hours)
router.get('/user/:userId/date/:date', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, date } = req.params;
    const { isHobby } = req.query;

    // Find all child allocations where the user is assigned to the parent task
    let query = `
      SELECT 
        tca.Id,
        tca.ParentTaskId,
        tca.ChildTaskId,
        tca.AllocationDate,
        tca.AllocatedHours,
        tca.StartTime,
        tca.EndTime,
        tca.Level,
        childTask.TaskName as ChildTaskName,
        parentTask.TaskName as ParentTaskName
      FROM TaskChildAllocations tca
      INNER JOIN Tasks childTask ON tca.ChildTaskId = childTask.Id
      INNER JOIN Tasks parentTask ON tca.ParentTaskId = parentTask.Id
      INNER JOIN TaskAllocations ta ON ta.TaskId = tca.ParentTaskId
      INNER JOIN Projects p ON parentTask.ProjectId = p.Id
      WHERE ta.UserId = ?
      AND tca.AllocationDate = ?
    `;
    
    const params: any[] = [userId, date];
    
    // Filter by hobby/work if specified
    if (isHobby !== undefined) {
      const forHobby = isHobby === 'true' || isHobby === '1';
      query += ` AND COALESCE(p.IsHobby, 0) = ?`;
      params.push(forHobby ? 1 : 0);
    }
    
    query += ` ORDER BY tca.StartTime`;

    const [allocations] = await pool.execute<RowDataPacket[]>(query, params);

    res.json({ success: true, allocations });

  } catch (error) {
    console.error('Error fetching user child allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch child allocations' });
  }
});

/**
 * @swagger
 * /api/task-child-allocations/parent/{parentTaskId}:
 *   delete:
 *     summary: Delete all child allocations for a parent task
 *     tags: [TaskChildAllocations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: parentTaskId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Child allocations deleted successfully
 */
// Delete child allocations for a parent task (RECURSIVE - all levels)
router.delete('/parent/:parentTaskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { parentTaskId } = req.params;

    // First, get all affected child task IDs before deletion
    const [affectedChildren] = await pool.execute<RowDataPacket[]>(
      `WITH RECURSIVE ChildHierarchy AS (
        SELECT Id, ChildTaskId 
        FROM TaskChildAllocations 
        WHERE ParentTaskId = ?
        
        UNION ALL
        
        SELECT tca.Id, tca.ChildTaskId
        FROM TaskChildAllocations tca
        INNER JOIN ChildHierarchy ch ON tca.ParentTaskId = ch.ChildTaskId
      )
      SELECT DISTINCT ChildTaskId FROM ChildHierarchy`,
      [parentTaskId]
    );

    // Use recursive CTE to find ALL child allocations at all levels
    const deleteQuery = dbProvider === 'mssql'
      ? `;WITH ChildHierarchy AS (
           SELECT Id, ChildTaskId
           FROM TaskChildAllocations
           WHERE ParentTaskId = ?

           UNION ALL

           SELECT tca.Id, tca.ChildTaskId
           FROM TaskChildAllocations tca
           INNER JOIN ChildHierarchy ch ON tca.ParentTaskId = ch.ChildTaskId
         )
         DELETE FROM TaskChildAllocations
         WHERE Id IN (SELECT Id FROM ChildHierarchy)`
      : `DELETE FROM TaskChildAllocations
         WHERE Id IN (
           WITH RECURSIVE ChildHierarchy AS (
             SELECT Id, ChildTaskId
             FROM TaskChildAllocations
             WHERE ParentTaskId = ?

             UNION ALL

             SELECT tca.Id, tca.ChildTaskId
             FROM TaskChildAllocations tca
             INNER JOIN ChildHierarchy ch ON tca.ParentTaskId = ch.ChildTaskId
           )
           SELECT Id FROM ChildHierarchy
         )`;

    const [result] = await pool.execute<ResultSetHeader>(deleteQuery, [parentTaskId]);

    // Clear PlannedStartDate and PlannedEndDate for affected child tasks
    // Only clear if they don't have direct TaskAllocations
    for (const child of affectedChildren) {
      const childTaskId = child.ChildTaskId;
      
      // Check if this child task has direct allocations
      const [directAllocs] = await pool.execute<RowDataPacket[]>(
        'SELECT COUNT(*) as count FROM TaskAllocations WHERE TaskId = ?',
        [childTaskId]
      );
      
      // Only clear dates if no direct allocations exist
      if (directAllocs[0].count === 0) {
        await pool.execute(
          'UPDATE Tasks SET PlannedStartDate = NULL, PlannedEndDate = NULL WHERE Id = ?',
          [childTaskId]
        );
      }
    }

    res.json({ 
      success: true, 
      message: 'Child allocations deleted recursively',
      deletedCount: result.affectedRows
    });

  } catch (error) {
    console.error('Error deleting child allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to delete child allocations' });
  }
});

export default router;
