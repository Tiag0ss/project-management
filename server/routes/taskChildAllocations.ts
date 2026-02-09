import express, { Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = express.Router();

// Save child allocations in batch
router.post('/batch', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { allocations } = req.body;

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ success: false, message: 'Allocations array is required' });
    }

    // Delete existing child allocations for the parent task
    const parentTaskId = allocations[0].ParentTaskId;
    await pool.execute(
      'DELETE FROM TaskChildAllocations WHERE ParentTaskId = ?',
      [parentTaskId]
    );

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
      const childAllocs = allocations.filter((a: any) => a.ChildTaskId === childTaskId);
      const dates = childAllocs.map((a: any) => a.AllocationDate).sort();
      
      if (dates.length > 0) {
        await pool.execute(
          'UPDATE Tasks SET PlannedStartDate = ?, PlannedEndDate = ? WHERE Id = ?',
          [dates[0], dates[dates.length - 1], childTaskId]
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
    const deleteQuery = `
      DELETE FROM TaskChildAllocations 
      WHERE Id IN (
        WITH RECURSIVE ChildHierarchy AS (
          -- Base: Direct children
          SELECT Id, ChildTaskId 
          FROM TaskChildAllocations 
          WHERE ParentTaskId = ?
          
          UNION ALL
          
          -- Recursive: Grandchildren and deeper
          SELECT tca.Id, tca.ChildTaskId
          FROM TaskChildAllocations tca
          INNER JOIN ChildHierarchy ch ON tca.ParentTaskId = ch.ChildTaskId
        )
        SELECT Id FROM ChildHierarchy
      )
    `;

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
