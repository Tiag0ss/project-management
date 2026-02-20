import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

// GET /api/timers/active — return running timer for current user (with task/project info)
router.get('/active', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT at.*, t.TaskName, t.ProjectId, p.ProjectName
       FROM ActiveTimers at
       JOIN Tasks t ON at.TaskId = t.Id
       JOIN Projects p ON t.ProjectId = p.Id
       WHERE at.UserId = ?
       LIMIT 1`,
      [userId]
    );
    res.json({ success: true, timer: rows[0] || null });
  } catch (error) {
    console.error('Error fetching active timer:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch timer' });
  }
});

// POST /api/timers/start — start a timer for a task (stops any existing timer first, without saving)
router.post('/start', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { taskId, description } = req.body;

    if (!taskId) {
      return res.status(400).json({ success: false, message: 'taskId is required' });
    }

    // Verify user has access to this task's project
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );
    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    // Save any existing timer for this user as a time entry instead of discarding it
    const [existingTimers] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM ActiveTimers WHERE UserId = ?',
      [userId]
    );
    if (existingTimers.length > 0) {
      const existing = existingTimers[0];
      const startedAt = new Date(existing.StartedAt);
      const now = new Date();
      const elapsedMs = now.getTime() - startedAt.getTime();
      const elapsedHours = Math.max(0.01, Math.round((elapsedMs / (1000 * 60 * 60)) * 100) / 100);
      const workDate = startedAt.toISOString().split('T')[0];
      const startTime = startedAt.toTimeString().slice(0, 5);
      const endTime = now.toTimeString().slice(0, 5);
      await pool.execute(
        `INSERT INTO TimeEntries (TaskId, UserId, WorkDate, Hours, StartTime, EndTime, Description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [existing.TaskId, userId, workDate, elapsedHours, startTime, endTime, existing.Description || '']
      );
      await pool.execute('DELETE FROM ActiveTimers WHERE UserId = ?', [userId]);
    }

    // Start new timer
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO ActiveTimers (UserId, TaskId, StartedAt, Description) VALUES (?, ?, NOW(), ?)',
      [userId, taskId, description || null]
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT at.*, t.TaskName, t.ProjectId, p.ProjectName
       FROM ActiveTimers at
       JOIN Tasks t ON at.TaskId = t.Id
       JOIN Projects p ON t.ProjectId = p.Id
       WHERE at.Id = ?`,
      [result.insertId]
    );

    res.json({ success: true, timer: rows[0] });
  } catch (error) {
    console.error('Error starting timer:', error);
    res.status(500).json({ success: false, message: 'Failed to start timer' });
  }
});

// POST /api/timers/:id/stop — stop timer, create a time entry, delete timer
router.post('/:id/stop', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const timerId = req.params.id;
    const { description: overrideDescription } = req.body;

    const [timers] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM ActiveTimers WHERE Id = ? AND UserId = ?',
      [timerId, userId]
    );
    if (timers.length === 0) {
      return res.status(404).json({ success: false, message: 'Timer not found' });
    }

    const timer = timers[0];
    const startedAt = new Date(timer.StartedAt);
    const now = new Date();
    const elapsedMs = now.getTime() - startedAt.getTime();
    const elapsedHours = Math.max(0.01, Math.round((elapsedMs / (1000 * 60 * 60)) * 100) / 100);
    const workDate = startedAt.toISOString().split('T')[0];
    const startTime = startedAt.toTimeString().slice(0, 5);
    const endTime = now.toTimeString().slice(0, 5);
    const finalDescription = overrideDescription || timer.Description || '';

    // Create time entry
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO TimeEntries (TaskId, UserId, WorkDate, Hours, StartTime, EndTime, Description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [timer.TaskId, userId, workDate, elapsedHours, startTime, endTime, finalDescription]
    );

    // Delete timer
    await pool.execute('DELETE FROM ActiveTimers WHERE Id = ?', [timerId]);

    res.json({
      success: true,
      message: `Logged ${elapsedHours.toFixed(2)}h`,
      timeEntryId: result.insertId,
      hours: elapsedHours,
    });
  } catch (error) {
    console.error('Error stopping timer:', error);
    res.status(500).json({ success: false, message: 'Failed to stop timer' });
  }
});

// DELETE /api/timers/:id — discard timer without creating a time entry
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    await pool.execute('DELETE FROM ActiveTimers WHERE Id = ? AND UserId = ?', [req.params.id, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error discarding timer:', error);
    res.status(500).json({ success: false, message: 'Failed to discard timer' });
  }
});

export default router;
