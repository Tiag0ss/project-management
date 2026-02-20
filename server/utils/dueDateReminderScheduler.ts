import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { sendEmail } from './emailService';
import { shouldSendEmail } from './emailPreferencesHelper';
import logger from './logger';

// Number of days before due date to send reminder
const REMINDER_DAYS_BEFORE = 1;

// Format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Check if a reminder was already sent for this user/task/date combo
async function hasReminderBeenSent(userId: number, taskId: number, reminderDate: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT Id FROM DueDateReminderLog WHERE UserId = ? AND TaskId = ? AND ReminderDate = ?',
    [userId, taskId, reminderDate]
  );
  return rows.length > 0;
}

// Record a sent reminder
async function recordSentReminder(userId: number, taskId: number, reminderDate: string): Promise<void> {
  await pool.execute(
    'INSERT INTO DueDateReminderLog (UserId, TaskId, ReminderDate) VALUES (?, ?, ?)',
    [userId, taskId, reminderDate]
  );
}

// Clean up old log entries (older than 90 days)
async function cleanupOldLogs(): Promise<void> {
  try {
    await pool.execute(
      'DELETE FROM DueDateReminderLog WHERE SentAt < DATE_SUB(NOW(), INTERVAL 90 DAY)'
    );
  } catch (error) {
    logger.error('Error cleaning up DueDateReminderLog:', error);
  }
}

// Generate the HTML email for a due date reminder
function generateDueDateReminderEmail(
  displayName: string,
  tasks: Array<{ TaskName: string; ProjectName: string; DueDate: string; ProjectId: number; TaskId: number }>
): string {
  const appUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const taskRows = tasks
    .map(t => {
      const dueFormatted = new Date(t.DueDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            <a href="${appUrl}/projects/${t.ProjectId}?task=${t.TaskId}" style="color: #3b82f6; text-decoration: none; font-weight: 500;">
              ${t.TaskName}
            </a>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${t.ProjectName}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; color: #dc2626; font-weight: 600;">${dueFormatted}</td>
        </tr>`;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="border-bottom: 3px solid #f59e0b; padding-bottom: 20px; margin-bottom: 20px;">
            <h1 style="margin: 0; color: #1f2937; font-size: 24px;">⏰ Task Due Date Reminder</h1>
            <p style="margin: 10px 0 0; color: #6b7280;">
              ${tasks.length === 1 ? '1 task is' : `${tasks.length} tasks are`} due tomorrow
            </p>
          </div>

          <p style="margin-bottom: 20px;">Hello ${displayName},</p>

          <p>The following ${tasks.length === 1 ? 'task is' : 'tasks are'} due <strong>tomorrow</strong>:</p>

          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Task</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Project</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Due Date</th>
              </tr>
            </thead>
            <tbody>
              ${taskRows}
            </tbody>
          </table>

          <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-weight: 600;">
              ⚠️ Make sure to complete ${tasks.length === 1 ? 'this task' : 'these tasks'} on time!
            </p>
          </div>

          <a href="${appUrl}/dashboard"
             style="display: inline-block; background-color: #f59e0b; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 500; margin: 20px 0;">
            View Dashboard
          </a>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
            <p>You received this email because you enabled due date reminder notifications.</p>
            <p>To change this preference, visit your profile settings.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// Main function to check and send due date reminders
export async function checkAndSendDueDateReminders(): Promise<void> {
  try {
    logger.info('Running due date reminder scheduler check...');

    const today = formatDate(new Date());

    // Calculate the target due date (N days from now)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + REMINDER_DAYS_BEFORE);
    const targetDateStr = formatDate(targetDate);

    // Find all tasks due on the target date that are not done/completed/cancelled
    // and have an assigned user
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id AS TaskId, t.TaskName, t.DueDate, t.AssignedTo, t.ProjectId,
              p.ProjectName,
              u.Id AS UserId, u.Email, u.FirstName, u.LastName, u.Username
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       JOIN Users u ON t.AssignedTo = u.Id
       WHERE DATE(t.DueDate) = ?
         AND t.AssignedTo IS NOT NULL
         AND LOWER(COALESCE(t.Status, '')) NOT IN ('done', 'completed', 'closed', 'cancelled', 'canceled')
         AND u.Email IS NOT NULL AND u.Email != ''`,
      [targetDateStr]
    );

    if (tasks.length === 0) {
      logger.info('No tasks due tomorrow — skipping due date reminder emails');
      return;
    }

    // Group tasks by user
    const tasksByUser = new Map<
      number,
      {
        user: { UserId: number; Email: string; FirstName: string; LastName: string; Username: string };
        tasks: Array<{ TaskName: string; ProjectName: string; DueDate: string; ProjectId: number; TaskId: number }>;
      }
    >();

    for (const row of tasks as RowDataPacket[]) {
      const userId = row.UserId as number;
      if (!tasksByUser.has(userId)) {
        tasksByUser.set(userId, {
          user: {
            UserId: userId,
            Email: row.Email,
            FirstName: row.FirstName,
            LastName: row.LastName,
            Username: row.Username,
          },
          tasks: [],
        });
      }
      tasksByUser.get(userId)!.tasks.push({
        TaskName: row.TaskName,
        ProjectName: row.ProjectName,
        DueDate: row.DueDate,
        ProjectId: row.ProjectId,
        TaskId: row.TaskId,
      });
    }

    // Clean up old log entries periodically
    await cleanupOldLogs();

    // Send reminders per user
    for (const [userId, { user, tasks: userTasks }] of tasksByUser) {
      try {
        // Check user preference
        const wantsReminder = await shouldSendEmail(userId, 'due_date_reminder');
        if (!wantsReminder) {
          continue;
        }

        // Filter out tasks already reminded today
        const pendingTasks: typeof userTasks = [];
        for (const task of userTasks) {
          const alreadySent = await hasReminderBeenSent(userId, task.TaskId, today);
          if (!alreadySent) {
            pendingTasks.push(task);
          }
        }

        if (pendingTasks.length === 0) {
          continue;
        }

        const displayName =
          user.FirstName && user.LastName
            ? `${user.FirstName} ${user.LastName}`
            : user.FirstName || user.Username;

        const html = generateDueDateReminderEmail(displayName, pendingTasks);
        const taskWord = pendingTasks.length === 1 ? 'Task' : 'Tasks';
        const sent = await sendEmail({
          to: user.Email,
          subject: `⏰ Reminder: ${pendingTasks.length} ${taskWord} Due Tomorrow`,
          html,
          userId,
          username: user.Username,
        });

        if (sent) {
          for (const task of pendingTasks) {
            await recordSentReminder(userId, task.TaskId, today);
          }
          logger.info(
            `Sent due date reminder to user ${userId} (${user.Email}) for ${pendingTasks.length} task(s)`
          );
        }
      } catch (userError) {
        logger.error(`Error sending due date reminder for user ${userId}:`, userError);
      }
    }

    logger.info('Due date reminder scheduler check completed');
  } catch (error) {
    logger.error('Error in due date reminder scheduler:', error);
  }
}

// Start the scheduler (runs every hour; reminder logic deduplicates via log table)
let schedulerInterval: NodeJS.Timeout | null = null;

export function startDueDateReminderScheduler(): void {
  if (schedulerInterval) {
    return; // Already running
  }

  logger.info('Starting due date reminder scheduler...');

  // Run immediately on start, then every hour
  checkAndSendDueDateReminders().catch(err =>
    logger.error('Initial due date reminder check failed:', err)
  );

  schedulerInterval = setInterval(() => {
    checkAndSendDueDateReminders().catch(err =>
      logger.error('Due date reminder check failed:', err)
    );
  }, 60 * 60 * 1000); // Every hour
}

export function stopDueDateReminderScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Due date reminder scheduler stopped');
  }
}
