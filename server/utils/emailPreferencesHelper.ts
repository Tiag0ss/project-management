import { pool } from '../config/database';
import { RowDataPacket } from '../config/database';
import logger from './logger';

const EMAIL_NOTIFICATION_TYPE_ALIASES: Record<string, string> = {
  task_updated: 'task_status',
  task_allocated: 'allocation_assigned',
  mention: 'task_mentioned',
  project_updated: 'project_status',
  due_date_reminder: 'task_due_soon',
};

const normalizeNotificationType = (notificationType: string): string => {
  const normalized = String(notificationType || '').trim();
  if (!normalized) return normalized;
  return EMAIL_NOTIFICATION_TYPE_ALIASES[normalized] || normalized;
};

// Helper function to check if user wants email for this notification type
export const shouldSendEmail = async (userId: number, notificationType: string): Promise<boolean> => {
  try {
    const normalizedType = normalizeNotificationType(notificationType);

    const [prefs] = await pool.execute<RowDataPacket[]>(
      `SELECT NotificationType, EmailEnabled
       FROM UserEmailPreferences
       WHERE UserId = ? AND NotificationType IN (?, ?)
       ORDER BY CASE WHEN NotificationType = ? THEN 0 ELSE 1 END
       LIMIT 1`,
      [userId, notificationType, normalizedType, notificationType]
    );

    if (prefs.length === 0) {
      return true; // Default to enabled if no preference set
    }

    return prefs[0].EmailEnabled === 1;
  } catch (error) {
    logger.error('Error checking email preference:', error);
    return true; // Default to enabled on error
  }
};
