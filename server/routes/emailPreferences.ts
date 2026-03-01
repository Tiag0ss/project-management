import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { shouldSendEmail } from '../utils/emailPreferencesHelper';
import { sendTestSummaryEmail } from '../utils/workSummaryScheduler';

// Re-export for backwards compatibility
export { shouldSendEmail } from '../utils/emailPreferencesHelper';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: EmailPreferences
 *   description: User email notification preferences
 */

// All notification types available in the system
export const NOTIFICATION_TYPES = [
  { type: 'task_assigned', label: 'Task Assigned to You', category: 'Tasks' },
  { type: 'task_status', label: 'Task Status Changed', category: 'Tasks' },
  { type: 'task_comment', label: 'New Comment on Task', category: 'Tasks' },
  { type: 'task_due_soon', label: 'Task Due Soon', category: 'Tasks' },
  { type: 'task_overdue', label: 'Task Overdue', category: 'Tasks' },
  { type: 'task_mentioned', label: 'Mentioned in Task Comment', category: 'Tasks' },
  { type: 'project_added', label: 'Added to Project', category: 'Projects' },
  { type: 'project_status', label: 'Project Status Changed', category: 'Projects' },
  { type: 'ticket_created', label: 'New Ticket Created', category: 'Tickets' },
  { type: 'ticket_assigned', label: 'Ticket Assigned to You', category: 'Tickets' },
  { type: 'ticket_status', label: 'Ticket Status Changed', category: 'Tickets' },
  { type: 'ticket_comment', label: 'New Comment on Ticket', category: 'Tickets' },
  { type: 'ticket_developer', label: 'Assigned as Developer', category: 'Tickets' },
  { type: 'allocation_assigned', label: 'Task Allocation Assigned', category: 'Planning' },
  { type: 'allocation_conflict', label: 'Allocation Conflict Detected', category: 'Planning' },
  { type: 'daily_work_summary', label: 'Daily Work Summary', category: 'Summaries', description: 'Receive a summary of your scheduled work at the start of each work day' },
  { type: 'weekly_work_summary', label: 'Weekly Work Summary', category: 'Summaries', description: 'Receive a weekly summary on the first work day of the week' },
];

const CUSTOMER_NOTIFICATION_TYPES = new Set([
  'ticket_created',
  'ticket_status',
  'ticket_comment',
]);

const getAllowedNotificationTypes = (customerId?: number | null) => {
  if (customerId) {
    return NOTIFICATION_TYPES.filter((notificationType) =>
      CUSTOMER_NOTIFICATION_TYPES.has(notificationType.type)
    );
  }

  return NOTIFICATION_TYPES;
};

/**
 * @swagger
 * /api/email-preferences:
 *   get:
 *     summary: Get current user's email preferences
 *     tags: [EmailPreferences]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of notification types with email enabled/disabled status
 */
// Get user email preferences
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;

    // Get existing preferences
    const [preferences] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM UserEmailPreferences WHERE UserId = ?',
      [userId]
    );

    // Create a map of existing preferences
    const prefsMap = new Map();
    preferences.forEach((pref: any) => {
      prefsMap.set(pref.NotificationType, pref.EmailEnabled === 1);
    });

    const allowedNotificationTypes = getAllowedNotificationTypes(customerId);

    // Return allowed notification types with their current settings
    const result = allowedNotificationTypes.map(notif => ({
      type: notif.type,
      label: notif.label,
      category: notif.category,
      description: notif.description,
      emailEnabled: prefsMap.has(notif.type) ? prefsMap.get(notif.type) : true, // Default to enabled
    }));

    res.json({ success: true, preferences: result });
  } catch (error) {
    console.error('Error fetching email preferences:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch email preferences' });
  }
});

/**
 * @swagger
 * /api/email-preferences:
 *   put:
 *     summary: Update email preferences
 *     tags: [EmailPreferences]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [preferences]
 *             properties:
 *               preferences:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     emailEnabled:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: Email preferences updated
 */
// Update email preferences
router.put('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;
    const { preferences } = req.body;

    if (!Array.isArray(preferences)) {
      return res.status(400).json({ success: false, message: 'Invalid preferences format' });
    }

    const allowedNotificationTypes = getAllowedNotificationTypes(customerId);
    const allowedTypeSet = new Set(allowedNotificationTypes.map((notificationType) => notificationType.type));

    const sanitizedPreferences = new Map<string, boolean>();
    for (const preference of preferences) {
      if (
        preference &&
        typeof preference.type === 'string' &&
        typeof preference.emailEnabled === 'boolean' &&
        allowedTypeSet.has(preference.type)
      ) {
        sanitizedPreferences.set(preference.type, preference.emailEnabled);
      }
    }

    // Delete existing preferences and insert new ones
    await pool.execute('DELETE FROM UserEmailPreferences WHERE UserId = ?', [userId]);

    // Insert new preferences
    for (const [type, emailEnabled] of sanitizedPreferences.entries()) {
      await pool.execute(
        `INSERT INTO UserEmailPreferences (UserId, NotificationType, EmailEnabled) 
         VALUES (?, ?, ?)`,
        [userId, type, emailEnabled ? 1 : 0]
      );
    }

    res.json({ success: true, message: 'Email preferences updated successfully' });
  } catch (error) {
    console.error('Error updating email preferences:', error);
    res.status(500).json({ success: false, message: 'Failed to update email preferences' });
  }
});

/**
 * @swagger
 * /api/email-preferences/test-summary/{type}:
 *   post:
 *     summary: Send test email summary
 *     tags: [EmailPreferences]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [daily, weekly]
 *         description: Type of summary email to test
 *     responses:
 *       200:
 *         description: Test email sent
 */
// Send test summary email
router.post('/test-summary/:type', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const type = req.params.type as string; // 'daily' or 'weekly'

    if (type !== 'daily' && type !== 'weekly') {
      return res.status(400).json({ success: false, message: 'Invalid summary type. Use "daily" or "weekly"' });
    }

    const result = await sendTestSummaryEmail(userId!, type);

    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(500).json({ success: false, message: result.message });
    }
  } catch (error) {
    console.error('Error sending test summary email:', error);
    res.status(500).json({ success: false, message: 'Failed to send test summary email' });
  }
});

export default router;
