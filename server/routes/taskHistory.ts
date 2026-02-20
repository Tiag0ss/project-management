import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: TaskHistory
 *   description: Task change history
 */

/**
 * @swagger
 * /api/task-history/task/{taskId}:
 *   get:
 *     summary: Get change history for a specific task
 *     tags: [TaskHistory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Task history retrieved successfully
 */
// Get history for a task
router.get('/task/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;

    const [history] = await pool.execute<RowDataPacket[]>(
      `SELECT th.*, u.Username, u.FirstName, u.LastName
       FROM TaskHistory th
       JOIN Users u ON th.UserId = u.Id
       WHERE th.TaskId = ?
       ORDER BY th.CreatedAt DESC`,
      [taskId]
    );

    res.json({ success: true, history });
  } catch (error) {
    console.error('Error fetching task history:', error);
    res.status(500).json({ success: false, message: 'Error fetching history' });
  }
});

// Helper function to record task history (exported for use in other routes)
export const recordTaskHistory = async (
  taskId: number,
  userId: number,
  action: string,
  fieldName?: string,
  oldValue?: string,
  newValue?: string
) => {
  try {
    await pool.execute(
      `INSERT INTO TaskHistory (TaskId, UserId, Action, FieldName, OldValue, NewValue) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [taskId, userId, action, fieldName || null, oldValue || null, newValue || null]
    );
  } catch (error) {
    console.error('Error recording task history:', error);
  }
};

export default router;
