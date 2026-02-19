import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

// Helper function to check if user wants email for this notification type
export const shouldSendEmail = async (userId: number, notificationType: string): Promise<boolean> => {
  try {
    const [prefs] = await pool.execute<RowDataPacket[]>(
      'SELECT EmailEnabled FROM UserEmailPreferences WHERE UserId = ? AND NotificationType = ?',
      [userId, notificationType]
    );

    if (prefs.length === 0) {
      return true; // Default to enabled if no preference set
    }

    return prefs[0].EmailEnabled === 1;
  } catch (error) {
    console.error('Error checking email preference:', error);
    return true; // Default to enabled on error
  }
};
