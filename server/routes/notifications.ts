import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { sendNotificationEmail } from '../utils/emailService';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: User notification management
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get all notifications for the current user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *         description: Return only unread notifications
 *     responses:
 *       200:
 *         description: List of notifications
 *       401:
 *         description: Unauthorized
 */
// Get all notifications for current user
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { unreadOnly } = req.query;

    let query = `
      SELECT n.*, 
             t.TaskName,
             p.ProjectName
      FROM Notifications n
      LEFT JOIN Tasks t ON n.RelatedTaskId = t.Id
      LEFT JOIN Projects p ON n.RelatedProjectId = p.Id
      WHERE n.UserId = ?
    `;
    
    if (unreadOnly === 'true') {
      query += ` AND n.IsRead = 0`;
    }
    
    query += ` ORDER BY n.CreatedAt DESC LIMIT 50`;

    const [notifications] = await pool.execute<RowDataPacket[]>(query, [userId]);

    // Get unread count
    const [countResult] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as unreadCount FROM Notifications WHERE UserId = ? AND IsRead = 0`,
      [userId]
    );

    res.json({ 
      success: true, 
      notifications,
      unreadCount: countResult[0].unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Error fetching notifications' });
  }
});

/**
 * @swagger
 * /api/notifications/count:
 *   get:
 *     summary: Get unread notification count
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread notification count
 *       401:
 *         description: Unauthorized
 */
// Get unread count
router.get('/count', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const [result] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM Notifications WHERE UserId = ? AND IsRead = 0`,
      [userId]
    );

    res.json({ success: true, count: result[0].count });
  } catch (error) {
    console.error('Error fetching notification count:', error);
    res.status(500).json({ success: false, message: 'Error fetching count' });
  }
});

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   put:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 */
// Mark notification as read
router.put('/:id/read', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    await pool.execute(
      `UPDATE Notifications SET IsRead = 1 WHERE Id = ? AND UserId = ?`,
      [id, userId]
    );

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, message: 'Error updating notification' });
  }
});

/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *       401:
 *         description: Unauthorized
 */
// Mark all notifications as read
router.put('/read-all', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    await pool.execute(
      `UPDATE Notifications SET IsRead = 1 WHERE UserId = ?`,
      [userId]
    );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ success: false, message: 'Error updating notifications' });
  }
});

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 */
// Delete a notification
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    await pool.execute(
      `DELETE FROM Notifications WHERE Id = ? AND UserId = ?`,
      [id, userId]
    );

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ success: false, message: 'Error deleting notification' });
  }
});

// Create a notification (internal use - can be called from other routes)
export const createNotification = async (
  userId: number,
  type: string,
  title: string,
  message: string,
  link?: string,
  relatedTaskId?: number,
  relatedProjectId?: number
) => {
  try {
    await pool.execute(
      `INSERT INTO Notifications (UserId, Type, Title, Message, Link, RelatedTaskId, RelatedProjectId) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, type, title, message, link || null, relatedTaskId || null, relatedProjectId || null]
    );

    // Get user email for email notification
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT Email, Username FROM Users WHERE Id = ?',
      [userId]
    );

    if (users.length > 0 && users[0].Email) {
      // Send email notification asynchronously (don't wait for it)
      sendNotificationEmail(
        userId,
        users[0].Email,
        type,
        title,
        message,
        link
      ).catch(err => {
        console.error('Failed to send notification email:', err);
      });
    }
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};

export default router;
