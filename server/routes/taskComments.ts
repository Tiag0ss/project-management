import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { sanitizeRichText, sanitizePlainText } from '../utils/sanitize';
import { createNotification } from './notifications';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: TaskComments
 *   description: Comments on tasks
 */

/**
 * @swagger
 * /api/task-comments/task/{taskId}:
 *   get:
 *     summary: Get all comments for a task
 *     tags: [TaskComments]
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
 *         description: List of comments
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /api/task-comments:
 *   post:
 *     summary: Add a comment to a task
 *     tags: [TaskComments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskId
 *               - comment
 *             properties:
 *               taskId:
 *                 type: integer
 *               comment:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment created
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId, comment } = req.body;
    const userId = req.user?.userId;

    if (!taskId || !comment) {
      return res.status(400).json({ success: false, message: 'TaskId and comment are required' });
    }

    const sanitizedComment = sanitizeRichText(comment) || comment;
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO TaskComments (TaskId, UserId, Comment) VALUES (?, ?, ?)`,
      [taskId, userId, sanitizedComment]
    );

    // Fetch the created comment with user info
    const [comments] = await pool.execute<RowDataPacket[]>(
      `SELECT tc.*, u.Username, u.FirstName, u.LastName, u.Email
       FROM TaskComments tc
       JOIN Users u ON tc.UserId = u.Id
       WHERE tc.Id = ?`,
      [result.insertId]
    );

    // Parse @mentions and send notifications
    try {
      const [commenter] = await pool.execute<RowDataPacket[]>(
        'SELECT Username, FirstName, LastName FROM Users WHERE Id = ?',
        [userId]
      );
      const [taskRows] = await pool.execute<RowDataPacket[]>(
        'SELECT TaskName, ProjectId FROM Tasks WHERE Id = ?',
        [taskId]
      );
      const commenterName = commenter.length > 0
        ? (commenter[0].FirstName && commenter[0].LastName
            ? `${commenter[0].FirstName} ${commenter[0].LastName}`
            : commenter[0].Username)
        : 'Someone';
      const taskName = taskRows.length > 0 ? taskRows[0].TaskName : 'a task';
      const projectId = taskRows.length > 0 ? taskRows[0].ProjectId : null;
      const plainText = sanitizePlainText(sanitizedComment) ?? '';
      const mentionMatches = plainText.match(/@(\w+)/g) || [];
      const notifiedUsers = new Set<number>();
      for (const mention of mentionMatches) {
        const username = mention.slice(1);
        const [mentionedUsers] = await pool.execute<RowDataPacket[]>(
          'SELECT Id FROM Users WHERE Username = ?',
          [username]
        );
        if (mentionedUsers.length > 0) {
          const mentionedUserId = mentionedUsers[0].Id;
          if (mentionedUserId !== userId && !notifiedUsers.has(mentionedUserId)) {
            notifiedUsers.add(mentionedUserId);
            await createNotification(
              mentionedUserId,
              'mention',
              `You were mentioned in a comment`,
              `${commenterName} mentioned you in a comment on "${taskName}"`,
              projectId ? `/projects/${projectId}?task=${taskId}` : undefined,
              taskId,
              projectId || undefined
            );
          }
        }
      }
    } catch (mentionError) {
      console.error('Error processing @mentions:', mentionError);
    }

    res.status(201).json({ success: true, comment: comments[0] });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ success: false, message: 'Error creating comment' });
  }
});

/**
 * @swagger
 * /api/task-comments/{id}:
 *   put:
 *     summary: Update a comment
 *     tags: [TaskComments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Comment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - comment
 *             properties:
 *               comment:
 *                 type: string
 *     responses:
 *       200:
 *         description: Comment updated
 *       403:
 *         description: Not your comment
 *       404:
 *         description: Comment not found
 *       500:
 *         description: Server error
 */
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
      [sanitizeRichText(comment) || comment, id]
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

/**
 * @swagger
 * /api/task-comments/{id}:
 *   delete:
 *     summary: Delete a comment
 *     tags: [TaskComments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Comment ID
 *     responses:
 *       200:
 *         description: Comment deleted
 *       403:
 *         description: Not your comment
 *       404:
 *         description: Comment not found
 *       500:
 *         description: Server error
 */
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
