import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get all comments for a task
router.get('/task/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;

    const [comments] = await pool.execute<RowDataPacket[]>(
      `SELECT tc.*, u.Username, u.FirstName, u.LastName, u.Email
       FROM TaskComments tc
       JOIN Users u ON tc.UserId = u.Id
       WHERE tc.TaskId = ?
       ORDER BY tc.CreatedAt DESC`,
      [taskId]
    );

    res.json({ success: true, comments });
  } catch (error) {
    console.error('Error fetching task comments:', error);
    res.status(500).json({ success: false, message: 'Error fetching comments' });
  }
});

// Create a new comment
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId, comment } = req.body;
    const userId = req.user?.userId;

    if (!taskId || !comment) {
      return res.status(400).json({ success: false, message: 'TaskId and comment are required' });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO TaskComments (TaskId, UserId, Comment) VALUES (?, ?, ?)`,
      [taskId, userId, comment]
    );

    // Fetch the created comment with user info
    const [comments] = await pool.execute<RowDataPacket[]>(
      `SELECT tc.*, u.Username, u.FirstName, u.LastName, u.Email
       FROM TaskComments tc
       JOIN Users u ON tc.UserId = u.Id
       WHERE tc.Id = ?`,
      [result.insertId]
    );

    res.status(201).json({ success: true, comment: comments[0] });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ success: false, message: 'Error creating comment' });
  }
});

// Update a comment
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.user?.userId;

    // Check if user owns the comment
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM TaskComments WHERE Id = ?`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    if (existing[0].UserId !== userId) {
      return res.status(403).json({ success: false, message: 'You can only edit your own comments' });
    }

    await pool.execute(
      `UPDATE TaskComments SET Comment = ? WHERE Id = ?`,
      [comment, id]
    );

    // Fetch updated comment
    const [comments] = await pool.execute<RowDataPacket[]>(
      `SELECT tc.*, u.Username, u.FirstName, u.LastName, u.Email
       FROM TaskComments tc
       JOIN Users u ON tc.UserId = u.Id
       WHERE tc.Id = ?`,
      [id]
    );

    res.json({ success: true, comment: comments[0] });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ success: false, message: 'Error updating comment' });
  }
});

// Delete a comment
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Check if user owns the comment
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM TaskComments WHERE Id = ?`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    if (existing[0].UserId !== userId) {
      return res.status(403).json({ success: false, message: 'You can only delete your own comments' });
    }

    await pool.execute(`DELETE FROM TaskComments WHERE Id = ?`, [id]);

    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ success: false, message: 'Error deleting comment' });
  }
});

export default router;
