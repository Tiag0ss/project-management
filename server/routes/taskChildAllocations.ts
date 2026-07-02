import express, { Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { dbProvider, pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { cachedJson, ENTITY_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import { invalidateByEntity } from '../services/cacheInvalidation';

const router = express.Router();

const getParentTaskPlanningContext = async (parentTaskId: number) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT t.Id as TaskId, t.ProjectId, p.OrganizationId
     FROM Tasks t
     INNER JOIN Projects p ON t.ProjectId = p.Id
     WHERE t.Id = ?`,
    [parentTaskId]
  );
  return rows[0] || null;
};

const invalidateChildAllocationWrites = async (parentTaskId: number) => {
  const context = await getParentTaskPlanningContext(parentTaskId);
  await invalidateByEntity('childAllocation', {
    parentAllocationId: parentTaskId,
    orgId: context?.OrganizationId,
    projectId: context?.ProjectId,
    taskId: context?.TaskId,
  });
};

const normalizeDateKey = (value: unknown): string => String(value || '').split('T')[0];

const getHolidayDateSetForUser = async (userId: number, startDate: string, endDate: string): Promise<Set<string>> => {
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

  const result = new Set<string>();
  for (const row of rows) {
    result.add(normalizeDateKey(row.HolidayDate));
  }

  const [vacationRows] = await pool.execute<RowDataPacket[]>(
    `SELECT VacationDate
     FROM UserVacations
     WHERE UserId = ?
       AND LOWER(Status) = 'approved'
       AND LOWER(COALESCE(DayPortion, 'full')) = 'full'
       AND VacationDate BETWEEN ? AND ?`,
    [userId, startDate, endDate]
  );

  for (const row of vacationRows) {
    result.add(normalizeDateKey(row.VacationDate));
  }

  const [outOfOfficeRows] = await pool.execute<RowDataPacket[]>(
    `SELECT OutOfOfficeDate
     FROM UserOutOfOffice
     WHERE UserId = ?
       AND LOWER(Status) = 'approved'
       AND LOWER(COALESCE(DayPortion, 'full')) = 'full'
       AND OutOfOfficeDate BETWEEN ? AND ?`,
    [userId, startDate, endDate]
  );

  for (const row of outOfOfficeRows) {
    result.add(normalizeDateKey(row.OutOfOfficeDate));
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
  let connection: Awaited<ReturnType<typeof pool.getConnection>> | null = null;
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

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const shouldReplaceParent = replaceParent !== false;
    if (shouldReplaceParent) {
      await connection.execute(
        'DELETE FROM TaskChildAllocations WHERE ParentTaskId = ?',
        [parentTaskId]
      );
    }

    // Insert new child allocations
    const values: any[] = [];
    const placeholders: string[] = [];

    for (const alloc of allocations) {
      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?)');
      values.push(
        alloc.ParentTaskId,
        alloc.TaskAllocationHeaderId || null,
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
      (ParentTaskId, TaskAllocationHeaderId, ChildTaskId, AllocationDate, AllocatedHours, Level, StartTime, EndTime)
      VALUES ${placeholders.join(', ')}
    `;

    await connection.execute(query, values);

    // Update PlannedStartDate and PlannedEndDate for each child task
    const childTaskIds = [...new Set(allocations.map((a: any) => a.ChildTaskId))];
    
    for (const childTaskId of childTaskIds) {
      const [childDateRange] = await connection.execute<RowDataPacket[]>(
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
        await connection.execute(
          'UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ? WHERE Id = ?',
          [plannedStartDate, plannedEndDate, childTaskId]
        );
      }
    }

    await connection.commit();

    await invalidateChildAllocationWrites(Number(parentTaskId));

    res.json({ 
      success: true, 
      message: `Saved ${allocations.length} child allocations`,
      count: allocations.length 
    });

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Error rolling back child allocations transaction:', rollbackError);
      }
    }
    console.error('Error saving child allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to save child allocations' });
  } finally {
    connection?.release();
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

    const allocations = await cachedJson(
      cacheKeys.childAllocations(String(parentTaskId)),
      ENTITY_TTL_SECONDS,
      async () => {
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
        return rows;
      }
    );

    res.json({ success: true, allocations });

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

// Delete child allocations for a specific slice header
router.delete('/header/:headerId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const headerId = Number(req.params.headerId || 0);

    if (!Number.isFinite(headerId) || headerId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid headerId is required' });
    }

    const [affectedChildren] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT ChildTaskId, ParentTaskId
       FROM TaskChildAllocations
       WHERE TaskAllocationHeaderId = ?`,
      [headerId]
    );

    const [deleteResult] = await pool.execute<ResultSetHeader>(
      `DELETE FROM TaskChildAllocations
       WHERE TaskAllocationHeaderId = ?`,
      [headerId]
    );

    const affectedChildIds = affectedChildren
      .map((row) => Number(row.ChildTaskId))
      .filter((id) => Number.isFinite(id) && id > 0);

    for (const childTaskId of affectedChildIds) {
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
      } else {
        const [directAllocs] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as count FROM TaskAllocations WHERE TaskId = ?',
          [childTaskId]
        );
        const hasDirectAllocs = Number(directAllocs[0]?.count || 0) > 0;
        if (!hasDirectAllocs) {
          await pool.execute(
            'UPDATE Tasks SET PlannedStartDate = NULL, PlannedEndDate = NULL WHERE Id = ?',
            [childTaskId]
          );
        }
      }
    }

    const parentTaskId = Number(affectedChildren[0]?.ParentTaskId || 0);
    if (parentTaskId > 0) {
      await invalidateChildAllocationWrites(parentTaskId);
    }

    res.json({
      success: true,
      message: 'Child allocation slice deleted successfully',
      deletedCount: Number((deleteResult as any)?.affectedRows || 0),
      headerId,
    });
  } catch (error) {
    console.error('Error deleting child allocation slice:', error);
    res.status(500).json({ success: false, message: 'Failed to delete child allocation slice' });
  }
});

// Delete child allocations for a parent task limited to specific dates
router.delete('/parent/:parentTaskId/dates', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const parentTaskId = Number(req.params.parentTaskId || 0);
    const rawDates = Array.isArray(req.body?.dates) ? req.body.dates : [];
    const sourceHeaderId = Number(req.body?.sourceHeaderId || 0);
    const rawChildTaskIds = Array.isArray(req.body?.childTaskIds) ? req.body.childTaskIds : [];

    if (!Number.isFinite(parentTaskId) || parentTaskId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid parentTaskId is required' });
    }

    const dates = Array.from(
      new Set(
        rawDates
          .map((value: unknown) => normalizeDateKey(value))
          .filter((date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date))
      )
    );

    if (dates.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one valid date is required' });
    }

    const childTaskIds = Array.from(
      new Set(
        rawChildTaskIds
          .map((value: unknown) => Number(value))
          .filter((id: number) => Number.isFinite(id) && id > 0)
      )
    );

    const datePlaceholders = dates.map(() => '?').join(', ');

    const scopedByHeaderClause = sourceHeaderId > 0
      ? ` AND TaskChildAllocations.TaskAllocationHeaderId = ?`
      : '';

    const childTaskFilterClause = childTaskIds.length > 0
      ? ` AND ChildTaskId IN (${childTaskIds.map(() => '?').join(', ')})`
      : '';

    const scopedParams = sourceHeaderId > 0
      ? [parentTaskId, ...dates, ...childTaskIds, sourceHeaderId]
      : [parentTaskId, ...dates, ...childTaskIds];

    const [affectedChildren] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT ChildTaskId
       FROM TaskChildAllocations
       WHERE ParentTaskId = ?
         AND AllocationDate IN (${datePlaceholders})
        ${childTaskFilterClause}
         ${scopedByHeaderClause}`,
      scopedParams
    );

    const [deleteResult] = await pool.execute<ResultSetHeader>(
      `DELETE FROM TaskChildAllocations
       WHERE ParentTaskId = ?
         AND AllocationDate IN (${datePlaceholders})
        ${childTaskFilterClause}
         ${scopedByHeaderClause}`,
      scopedParams
    );

    const affectedChildIds = affectedChildren
      .map((row) => Number(row.ChildTaskId))
      .filter((id) => Number.isFinite(id) && id > 0);

    for (const childTaskId of affectedChildIds) {
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
      } else {
        const [directAllocs] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as count FROM TaskAllocations WHERE TaskId = ?',
          [childTaskId]
        );
        const hasDirectAllocs = Number(directAllocs[0]?.count || 0) > 0;
        if (!hasDirectAllocs) {
          await pool.execute(
            'UPDATE Tasks SET PlannedStartDate = NULL, PlannedEndDate = NULL WHERE Id = ?',
            [childTaskId]
          );
        }
      }
    }

    const deletedCount = Number((deleteResult as any)?.affectedRows || 0);

    await invalidateChildAllocationWrites(parentTaskId);

    res.json({
      success: true,
      message: 'Child allocations deleted for selected dates',
      deletedCount,
      dates,
      childTaskIds,
      sourceHeaderId: sourceHeaderId > 0 ? sourceHeaderId : null,
    });
  } catch (error) {
    console.error('Error deleting child allocations by dates:', error);
    res.status(500).json({ success: false, message: 'Failed to delete child allocations for selected dates' });
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

    await invalidateChildAllocationWrites(Number(parentTaskId));

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
