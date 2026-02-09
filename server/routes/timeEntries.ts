import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get time entries for a project
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

    const [entries] = await pool.execute<RowDataPacket[]>(
      `SELECT te.*, t.TaskName, u.Username, u.FirstName, u.LastName
       FROM TimeEntries te
       INNER JOIN Tasks t ON te.TaskId = t.Id
       LEFT JOIN Users u ON te.UserId = u.Id
       WHERE t.ProjectId = ?
       ORDER BY te.WorkDate DESC, t.TaskName`,
      [projectId]
    );

    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error fetching project time entries:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch project time entries' });
  }
});

// Get time entries for current user
router.get('/my-entries', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { startDate, endDate } = req.query;

    let query = `
      SELECT te.*, t.TaskName, t.ProjectId, p.ProjectName
      FROM TimeEntries te
      INNER JOIN Tasks t ON te.TaskId = t.Id
      INNER JOIN Projects p ON t.ProjectId = p.Id
      WHERE te.UserId = ?
    `;
    const params: any[] = [userId];

    if (startDate && endDate) {
      query += ` AND te.WorkDate BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    }

    query += ` ORDER BY te.WorkDate DESC, te.CreatedAt DESC`;

    const [entries] = await pool.execute<RowDataPacket[]>(query, params);

    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch time entries' });
  }
});

// Get time entries for a specific task
router.get('/task/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.userId;

    // Verify user has access to the task
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, p.OrganizationId
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const [entries] = await pool.execute<RowDataPacket[]>(
      `SELECT te.*, u.Username, u.FirstName, u.LastName
       FROM TimeEntries te
       LEFT JOIN Users u ON te.UserId = u.Id
       WHERE te.TaskId = ?
       ORDER BY te.WorkDate DESC`,
      [taskId]
    );

    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error fetching task time entries:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch task time entries' });
  }
});

// Create time entry
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { taskId, workDate, hours, description, startTime, endTime } = req.body;

    if (!taskId || !workDate || !hours) {
      return res.status(400).json({ 
        success: false, 
        message: 'TaskId, workDate, and hours are required' 
      });
    }

    // Verify user has access to the task
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, p.OrganizationId
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO TimeEntries (TaskId, UserId, WorkDate, Hours, Description, StartTime, EndTime)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [taskId, userId, workDate, hours, description || null, startTime || null, endTime || null]
    );

    res.json({ 
      success: true, 
      message: 'Time entry created successfully',
      entryId: result.insertId
    });
  } catch (error) {
    console.error('Error creating time entry:', error);
    res.status(500).json({ success: false, message: 'Failed to create time entry' });
  }
});

// Update time entry
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { workDate, hours, description, startTime, endTime } = req.body;

    // Verify user owns this entry
    const [entries] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM TimeEntries WHERE Id = ? AND UserId = ?',
      [id, userId]
    );

    if (entries.length === 0) {
      return res.status(404).json({ success: false, message: 'Time entry not found or access denied' });
    }

    await pool.execute(
      `UPDATE TimeEntries 
       SET WorkDate = COALESCE(?, WorkDate),
           Hours = COALESCE(?, Hours),
           Description = COALESCE(?, Description),
           StartTime = ?,
           EndTime = ?,
           UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [
        workDate ?? null, 
        hours ?? null, 
        description ?? null, 
        startTime ?? null, 
        endTime ?? null, 
        id
      ]
    );

    res.json({ success: true, message: 'Time entry updated successfully' });
  } catch (error) {
    console.error('Error updating time entry:', error);
    res.status(500).json({ success: false, message: 'Failed to update time entry' });
  }
});

// Delete time entry
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    // Verify user owns this entry
    const [entries] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM TimeEntries WHERE Id = ? AND UserId = ?',
      [id, userId]
    );

    if (entries.length === 0) {
      return res.status(404).json({ success: false, message: 'Time entry not found or access denied' });
    }

    await pool.execute('DELETE FROM TimeEntries WHERE Id = ?', [id]);

    res.json({ success: true, message: 'Time entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting time entry:', error);
    res.status(500).json({ success: false, message: 'Failed to delete time entry' });
  }
});

export default router;
