import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { sendEmail } from './emailService';
import { shouldSendEmail } from './emailPreferencesHelper';
import logger from './logger';

interface UserWorkInfo {
  Id: number;
  Email: string;
  FirstName: string;
  LastName: string;
  Username: string;
  Timezone: string | null;
  WorkHoursMonday: number;
  WorkHoursTuesday: number;
  WorkHoursWednesday: number;
  WorkHoursThursday: number;
  WorkHoursFriday: number;
  WorkHoursSaturday: number;
  WorkHoursSunday: number;
  WorkStartMonday: string;
  WorkStartTuesday: string;
  WorkStartWednesday: string;
  WorkStartThursday: string;
  WorkStartFriday: string;
  WorkStartSaturday: string;
  WorkStartSunday: string;
}

interface TaskAllocation {
  TaskId: number;
  TaskName: string;
  ProjectName: string;
  AllocatedHours: number;
  AllocationDate: string;
  DueDate: string | null;
  IsHobby: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_KEYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Get user's work hours for a specific day
function getWorkHoursForDay(user: UserWorkInfo, dayOfWeek: number): number {
  const dayKey = DAY_KEYS[dayOfWeek];
  return user[`WorkHours${dayKey}` as keyof UserWorkInfo] as number || 0;
}

// Get user's work start time for a specific day (returns "HH:MM" format)
function getWorkStartTimeForDay(user: UserWorkInfo, dayOfWeek: number): string {
  const dayKey = DAY_KEYS[dayOfWeek];
  return (user[`WorkStart${dayKey}` as keyof UserWorkInfo] as string) || '09:00';
}

// Get the first work day of the week for a user
function getFirstWorkDayOfWeek(user: UserWorkInfo): number {
  for (let i = 1; i <= 7; i++) {
    const dayIndex = i % 7; // Start from Monday (1) through Sunday (0)
    if (getWorkHoursForDay(user, dayIndex) > 0) {
      return dayIndex;
    }
  }
  return -1; // No work days
}

// Get current date/time in user's timezone
function getUserCurrentTime(timezone: string | null): Date {
  const now = new Date();
  if (!timezone) {
    return now;
  }
  try {
    // Get the offset string for the timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const dateParts: { [key: string]: string } = {};
    parts.forEach(part => {
      dateParts[part.type] = part.value;
    });
    
    return new Date(
      parseInt(dateParts.year),
      parseInt(dateParts.month) - 1,
      parseInt(dateParts.day),
      parseInt(dateParts.hour),
      parseInt(dateParts.minute)
    );
  } catch {
    return now;
  }
}

// Format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Get task allocations for a user on a specific date
async function getUserAllocationsForDate(userId: number, date: string): Promise<TaskAllocation[]> {
  const [allocations] = await pool.execute<RowDataPacket[]>(
    `SELECT 
      ta.TaskId,
      t.TaskName,
      p.ProjectName,
      ta.AllocatedHours,
      ta.AllocationDate,
      t.DueDate,
      p.IsHobby
    FROM TaskAllocations ta
    JOIN Tasks t ON ta.TaskId = t.Id
    JOIN Projects p ON t.ProjectId = p.Id
    WHERE ta.UserId = ? AND DATE(ta.AllocationDate) = ?
    ORDER BY p.IsHobby ASC, ta.AllocatedHours DESC`,
    [userId, date]
  );
  return allocations as TaskAllocation[];
}

// Get task allocations for a user for a week
async function getUserAllocationsForWeek(userId: number, startDate: string, endDate: string): Promise<TaskAllocation[]> {
  const [allocations] = await pool.execute<RowDataPacket[]>(
    `SELECT 
      ta.TaskId,
      t.TaskName,
      p.ProjectName,
      SUM(ta.AllocatedHours) as AllocatedHours,
      MIN(ta.AllocationDate) as AllocationDate,
      t.DueDate,
      p.IsHobby
    FROM TaskAllocations ta
    JOIN Tasks t ON ta.TaskId = t.Id
    JOIN Projects p ON t.ProjectId = p.Id
    WHERE ta.UserId = ? AND DATE(ta.AllocationDate) BETWEEN ? AND ?
    GROUP BY ta.TaskId, t.TaskName, p.ProjectName, t.DueDate, p.IsHobby
    ORDER BY p.IsHobby ASC, SUM(ta.AllocatedHours) DESC`,
    [userId, startDate, endDate]
  );
  return allocations as TaskAllocation[];
}

// Build task rows HTML for a group of allocations
function buildTaskRows(allocations: TaskAllocation[], refDate: string): string {
  return allocations.map(alloc => {
    const isOverdue = alloc.DueDate && new Date(alloc.DueDate) < new Date(refDate);
    const dueDateStr = alloc.DueDate ? new Date(alloc.DueDate).toLocaleDateString('en-GB') : null;
    return `
      <tr style="${isOverdue ? 'background-color: #fff5f5;' : ''}">
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          ${alloc.TaskName}
          ${isOverdue ? '<span style="margin-left: 6px; font-size: 11px; background-color: #fee2e2; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-weight: 600;">OVERDUE</span>' : ''}
          ${dueDateStr ? `<div style="font-size: 11px; color: ${isOverdue ? '#dc2626' : '#6b7280'}; margin-top: 2px;">Due: ${dueDateStr}</div>` : ''}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${alloc.ProjectName}</td>
        <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb;">${Number(alloc.AllocatedHours).toFixed(1)}h</td>
      </tr>`;
  }).join('');
}

function buildTaskTableHtml(allocations: TaskAllocation[], refDate: string, noTasksLabel: string): string {
  if (allocations.length === 0) {
    return `<p style="color: #6b7280; font-style: italic;">${noTasksLabel}</p>`;
  }

  const normal = allocations.filter(a => !a.IsHobby);
  const hobby  = allocations.filter(a => a.IsHobby);
  const normalHours = normal.reduce((s, a) => s + Number(a.AllocatedHours), 0);
  const hobbyHours  = hobby.reduce((s, a)  => s + Number(a.AllocatedHours), 0);
  const totalHours  = normalHours + hobbyHours;
  const hasGroups   = normal.length > 0 && hobby.length > 0;

  const tableHead = `
    <table style="width: 100%; border-collapse: collapse; margin: 0 0 8px 0;">
      <thead>
        <tr style="background-color: #f3f4f6;">
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Task</th>
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Project</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Hours</th>
        </tr>
      </thead>`;

  let html = '';

  if (normal.length > 0) {
    if (hasGroups) {
      html += `<div style="margin: 16px 0 4px 0;"><span style="font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.05em;">💼 Work Tasks</span></div>`;
    }
    html += `${tableHead}<tbody>${buildTaskRows(normal, refDate)}`;
    if (!hasGroups) {
      html += `<tr style="background-color: #f3f4f6; font-weight: bold;">
        <td style="padding: 12px;" colspan="2">Total</td>
        <td style="padding: 12px; text-align: right;">${totalHours.toFixed(1)}h</td>
      </tr>`;
    } else {
      html += `<tr style="background-color: #f3f4f6;">
        <td style="padding: 10px 12px; font-size: 13px; color: #374151;" colspan="2">Work subtotal</td>
        <td style="padding: 10px 12px; text-align: right; font-size: 13px; color: #374151;">${normalHours.toFixed(1)}h</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }

  if (hobby.length > 0) {
    if (hasGroups) {
      html += `<div style="margin: 20px 0 4px 0;"><span style="font-size: 12px; font-weight: 600; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.05em;">🎯 Hobby Tasks</span></div>`;
    }
    html += `${tableHead}<tbody>${buildTaskRows(hobby, refDate)}`;
    if (!hasGroups) {
      html += `<tr style="background-color: #f3f4f6; font-weight: bold;">
        <td style="padding: 12px;" colspan="2">Total</td>
        <td style="padding: 12px; text-align: right;">${totalHours.toFixed(1)}h</td>
      </tr>`;
    } else {
      html += `<tr style="background-color: #f5f3ff;">
        <td style="padding: 10px 12px; font-size: 13px; color: #7c3aed;" colspan="2">Hobby subtotal</td>
        <td style="padding: 10px 12px; text-align: right; font-size: 13px; color: #7c3aed;">${hobbyHours.toFixed(1)}h</td>
      </tr>`;
    }
    html += `</tbody></table>`;
  }

  if (hasGroups) {
    html += `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 8px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;">
      <tr>
        <td style="padding: 10px 14px; font-weight: 700; color: #111827;">Grand Total</td>
        <td style="padding: 10px 14px; text-align: right; font-weight: 700; color: #111827;">${totalHours.toFixed(1)}h</td>
      </tr>
    </table>`;
  }

  return html;
}

// Generate HTML email template for daily summary
function generateDailySummaryEmail(user: UserWorkInfo, date: string, allocations: TaskAllocation[], totalHours: number): string {
  const displayName = user.FirstName ? `${user.FirstName} ${user.LastName || ''}`.trim() : user.Username;
  const formattedDate = new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const overdueCount = allocations.filter(a => a.DueDate && new Date(a.DueDate) < new Date(date)).length;
  const tasksHtml = buildTaskTableHtml(allocations, date, 'No tasks allocated for today.');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="border-bottom: 3px solid #3b82f6; padding-bottom: 20px; margin-bottom: 20px;">
            <h1 style="margin: 0; color: #1f2937; font-size: 24px;">📋 Daily Work Summary</h1>
            <p style="margin: 10px 0 0; color: #6b7280;">${formattedDate}</p>
          </div>
          
          <p style="margin-bottom: 20px;">Hello ${displayName},</p>
          
          <p>Here's your work summary for today:</p>
          
          ${overdueCount > 0 ? `
          <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 15px; margin: 16px 0;">
            <p style="margin: 0; color: #b91c1c; font-weight: 600;">⚠️ ${overdueCount} overdue task${overdueCount > 1 ? 's' : ''} in today's schedule</p>
          </div>` : ''}
          
          ${tasksHtml}
          
          <div style="background-color: #dbeafe; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 4px 0; color: #1e40af;">
              <strong>📊 Today's scheduled work:</strong> ${totalHours.toFixed(1)} hours across ${allocations.length} task(s)
            </p>
            ${(() => {
              const wh = allocations.filter(a => !a.IsHobby).reduce((s, a) => s + Number(a.AllocatedHours), 0);
              const hh = allocations.filter(a =>  a.IsHobby).reduce((s, a) => s + Number(a.AllocatedHours), 0);
              return wh > 0 && hh > 0 ? `<p style="margin: 0; font-size: 13px; color: #1e40af;">💼 Work: ${wh.toFixed(1)}h &nbsp;|&nbsp; 🎯 Hobby: ${hh.toFixed(1)}h</p>` : '';
            })()}
          </div>
          
          <a href="${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/dashboard" 
             style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 500; margin: 20px 0;">
            View Dashboard
          </a>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
            <p>You received this email because you enabled daily work summary notifications.</p>
            <p>To change this preference, visit your profile settings.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// Generate HTML email template for weekly summary
function generateWeeklySummaryEmail(
  user: UserWorkInfo, 
  weekStart: string, 
  weekEnd: string, 
  allocations: TaskAllocation[], 
  totalHours: number,
  dailyBreakdown: { date: string; workHours: number; hobbyHours: number }[]
): string {
  const displayName = user.FirstName ? `${user.FirstName} ${user.LastName || ''}`.trim() : user.Username;
  const formattedStart = new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formattedEnd = new Date(weekEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const overdueCount = allocations.filter(a => a.DueDate && new Date(a.DueDate) < new Date(weekEnd)).length;
  const tasksHtml = buildTaskTableHtml(allocations, weekEnd, 'No tasks allocated for this week.');

  const hasHobbyInWeek = dailyBreakdown.some(d => d.hobbyHours > 0);
  const dailyHtml = `
    <div style="margin: 20px 0;">
      <h3 style="margin-bottom: 10px; color: #374151;">Daily Breakdown</h3>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: separate; border-spacing: 4px;">
        <tr>
          ${dailyBreakdown.map(day => {
            const dayName = new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' });
            const total   = day.workHours + day.hobbyHours;
            const bgColor = total > 0 ? '#dbeafe' : '#f3f4f6';
            return `<td style="background-color: ${bgColor}; border-radius: 6px; text-align: center; padding: 10px 6px; width: 14%;">
              <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">${dayName}</div>
              ${day.workHours  > 0 ? `<div style="font-weight: 600; color: #1d4ed8; font-size: 13px; line-height: 1.4;">${day.workHours.toFixed(1)}h</div>` : ''}
              ${day.hobbyHours > 0 ? `<div style="font-weight: 600; color: #7c3aed; font-size: 13px; line-height: 1.4;">${day.hobbyHours.toFixed(1)}h &#127919;</div>` : ''}
              ${total === 0       ? `<div style="color: #9ca3af; font-size: 13px;">&#8212;</div>` : ''}
            </td>`;
          }).join('')}
        </tr>
      </table>
      ${hasHobbyInWeek ? `<div style="margin-top: 8px; font-size: 11px; color: #6b7280;">
        <span style="display: inline-block; width: 10px; height: 10px; background-color: #1d4ed8; border-radius: 2px; vertical-align: middle;"></span>&nbsp;Work &nbsp;&nbsp;
        <span style="display: inline-block; width: 10px; height: 10px; background-color: #7c3aed; border-radius: 2px; vertical-align: middle;"></span>&nbsp;Hobby
      </div>` : ''}
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="border-bottom: 3px solid #10b981; padding-bottom: 20px; margin-bottom: 20px;">
            <h1 style="margin: 0; color: #1f2937; font-size: 24px;">📅 Weekly Work Summary</h1>
            <p style="margin: 10px 0 0; color: #6b7280;">${formattedStart} - ${formattedEnd}</p>
          </div>
          
          <p style="margin-bottom: 20px;">Hello ${displayName},</p>
          
          <p>Here's your work summary for the upcoming week:</p>
          
          ${overdueCount > 0 ? `
          <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 15px; margin: 16px 0;">
            <p style="margin: 0; color: #b91c1c; font-weight: 600;">⚠️ ${overdueCount} overdue task${overdueCount > 1 ? 's' : ''} in this week's schedule</p>
          </div>` : ''}
          
          <div style="background-color: #d1fae5; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 4px 0; color: #065f46;">
              <strong>📊 This week:</strong> ${totalHours.toFixed(1)} hours across ${allocations.length} task(s)
            </p>
            ${(() => {
              const wh = allocations.filter(a => !a.IsHobby).reduce((s, a) => s + Number(a.AllocatedHours), 0);
              const hh = allocations.filter(a =>  a.IsHobby).reduce((s, a) => s + Number(a.AllocatedHours), 0);
              return wh > 0 && hh > 0 ? `<p style="margin: 0; font-size: 13px; color: #065f46;">💼 Work: ${wh.toFixed(1)}h &nbsp;|&nbsp; 🎯 Hobby: ${hh.toFixed(1)}h</p>` : '';
            })()}
          </div>
          
          ${dailyHtml}
          
          ${tasksHtml}
          
          <a href="${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/planning" 
             style="display: inline-block; background-color: #10b981; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 500; margin: 20px 0;">
            View Planning
          </a>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
            <p>You received this email because you enabled weekly work summary notifications.</p>
            <p>To change this preference, visit your profile settings.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// Check if a summary email was already sent to a user for this period
async function hasSummaryBeenSent(userId: number, summaryType: 'daily' | 'weekly', summaryDate: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT Id FROM WorkSummaryEmailLog WHERE UserId = ? AND SummaryType = ? AND SummaryDate = ?',
    [userId, summaryType, summaryDate]
  );
  return rows.length > 0;
}

// Record a sent summary email in the database
async function recordSentSummary(userId: number, summaryType: 'daily' | 'weekly', summaryDate: string): Promise<void> {
  await pool.execute(
    'INSERT INTO WorkSummaryEmailLog (UserId, SummaryType, SummaryDate) VALUES (?, ?, ?)',
    [userId, summaryType, summaryDate]
  );
}

// Clean up old log entries (older than 60 days)
async function cleanupOldLogs(): Promise<void> {
  try {
    await pool.execute(
      'DELETE FROM WorkSummaryEmailLog WHERE SentAt < DATE_SUB(NOW(), INTERVAL 60 DAY)'
    );
  } catch (error) {
    logger.error('Error cleaning up old WorkSummaryEmailLog entries:', error);
  }
}

// Main function to check and send work summaries
export async function checkAndSendWorkSummaries(): Promise<void> {
  try {
    logger.info('Running work summary scheduler check...');

    // Get all active users with their work settings
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, Email, FirstName, LastName, Username, Timezone,
              WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday,
              WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday,
              WorkStartMonday, WorkStartTuesday, WorkStartWednesday, WorkStartThursday,
              WorkStartFriday, WorkStartSaturday, WorkStartSunday
       FROM Users 
       WHERE IsActive = 1 AND Email IS NOT NULL AND Email != ''`
    );

    // Periodically clean up old log entries
    await cleanupOldLogs();

    for (const user of users as UserWorkInfo[]) {
      try {
        // Get user's local time
        const userTime = getUserCurrentTime(user.Timezone);
        const userHour = userTime.getHours();
        const userDayOfWeek = userTime.getDay();
        const todayDate = formatDate(userTime);

        // Check if user has work hours today
        const todayWorkHours = getWorkHoursForDay(user, userDayOfWeek);
        if (todayWorkHours <= 0) {
          continue; // No work today, skip
        }

        // Get user's work start time for today
        const workStartTime = getWorkStartTimeForDay(user, userDayOfWeek);
        const [startHour] = workStartTime.split(':').map(Number);

        // Check if current hour matches work start hour
        if (userHour !== startHour) {
          continue; // Not the start of work day
        }

        // Check daily summary
        const wantsDailySummary = await shouldSendEmail(user.Id, 'daily_work_summary');
        const dailyAlreadySent = await hasSummaryBeenSent(user.Id, 'daily', todayDate);
        if (wantsDailySummary && !dailyAlreadySent) {
          // Get allocations for today
          const allocations = await getUserAllocationsForDate(user.Id, todayDate);
          const totalHours = allocations.reduce((sum, a) => sum + Number(a.AllocatedHours), 0);

          // Send daily summary email
          const html = generateDailySummaryEmail(user, todayDate, allocations, totalHours);
          const sent = await sendEmail({
            to: user.Email,
            subject: `📋 Your Work Summary for ${new Date(todayDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
            html,
            userId: user.Id,
            username: user.Username,
          });

          if (sent) {
            await recordSentSummary(user.Id, 'daily', todayDate);
            logger.info(`Sent daily work summary to user ${user.Id} (${user.Email})`);
          }
        }

        // Check weekly summary - only on user's first work day of the week
        const firstWorkDay = getFirstWorkDayOfWeek(user);
        if (userDayOfWeek === firstWorkDay) {
          // Calculate week range (Monday to Sunday)
          const weekStart = new Date(userTime);
          const diff = userTime.getDay() === 0 ? -6 : 1 - userTime.getDay(); // Adjust to Monday
          weekStart.setDate(userTime.getDate() + diff);
          const weekStartStr = formatDate(weekStart);
          
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          const weekEndStr = formatDate(weekEnd);

          const wantsWeeklySummary = await shouldSendEmail(user.Id, 'weekly_work_summary');
          const weeklyAlreadySent = await hasSummaryBeenSent(user.Id, 'weekly', weekStartStr);
          if (wantsWeeklySummary && !weeklyAlreadySent) {
            // Get allocations for the week
            const allocations = await getUserAllocationsForWeek(user.Id, weekStartStr, weekEndStr);
            const totalHours = allocations.reduce((sum, a) => sum + Number(a.AllocatedHours), 0);

            // Calculate daily breakdown
            const dailyBreakdown: { date: string; workHours: number; hobbyHours: number }[] = [];
            for (let i = 0; i < 7; i++) {
              const dayDate = new Date(weekStart);
              dayDate.setDate(weekStart.getDate() + i);
              const dayDateStr = formatDate(dayDate);
              const dayAllocations = await getUserAllocationsForDate(user.Id, dayDateStr);
              const workHours  = dayAllocations.filter(a => !a.IsHobby).reduce((sum, a) => sum + Number(a.AllocatedHours), 0);
              const hobbyHours = dayAllocations.filter(a =>  a.IsHobby).reduce((sum, a) => sum + Number(a.AllocatedHours), 0);
              dailyBreakdown.push({ date: dayDateStr, workHours, hobbyHours });
            }

            // Send weekly summary email
            const html = generateWeeklySummaryEmail(user, weekStartStr, weekEndStr, allocations, totalHours, dailyBreakdown);
            const sent = await sendEmail({
              to: user.Email,
              subject: `📅 Your Weekly Work Summary (${new Date(weekStartStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(weekEndStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`,
              html,
              userId: user.Id,
              username: user.Username,
            });

            if (sent) {
              await recordSentSummary(user.Id, 'weekly', weekStartStr);
              logger.info(`Sent weekly work summary to user ${user.Id} (${user.Email})`);
            }
          }
        }
      } catch (userError) {
        logger.error(`Error processing work summary for user ${user.Id}:`, userError);
      }
    }

    logger.info('Work summary scheduler check completed');
  } catch (error) {
    logger.error('Error in work summary scheduler:', error);
  }
}

// Start the scheduler (runs every hour)
let schedulerInterval: NodeJS.Timeout | null = null;

export function startWorkSummaryScheduler(): void {
  if (schedulerInterval) {
    logger.warn('Work summary scheduler is already running');
    return;
  }

  // Run immediately on startup
  checkAndSendWorkSummaries();

  // Then run every hour
  const ONE_HOUR = 60 * 60 * 1000;
  schedulerInterval = setInterval(() => {
    checkAndSendWorkSummaries();
  }, ONE_HOUR);

  logger.info('Work summary scheduler started (runs every hour)');
}

export function stopWorkSummaryScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Work summary scheduler stopped');
  }
}

// Send a test summary email for a user
export async function sendTestSummaryEmail(
  userId: number, 
  type: 'daily' | 'weekly'
): Promise<{ success: boolean; message: string }> {
  try {
    // Get user info
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, Email, FirstName, LastName, Username, Timezone,
              WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday,
              WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday,
              WorkStartMonday, WorkStartTuesday, WorkStartWednesday, WorkStartThursday,
              WorkStartFriday, WorkStartSaturday, WorkStartSunday
       FROM Users 
       WHERE Id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return { success: false, message: 'User not found' };
    }

    const user = users[0] as UserWorkInfo;

    if (!user.Email) {
      return { success: false, message: 'User does not have an email address configured' };
    }

    const userTime = getUserCurrentTime(user.Timezone);
    const todayDate = formatDate(userTime);

    if (type === 'daily') {
      // Get allocations for today
      const allocations = await getUserAllocationsForDate(user.Id, todayDate);
      const totalHours = allocations.reduce((sum, a) => sum + Number(a.AllocatedHours), 0);

      // Generate and send daily summary email
      const html = generateDailySummaryEmail(user, todayDate, allocations, totalHours);
      const sent = await sendEmail({
        to: user.Email,
        subject: `[TEST] 📋 Your Work Summary for ${new Date(todayDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
        html,
        userId: user.Id,
        username: user.Username,
      });

      if (sent) {
        logger.info(`Sent TEST daily work summary to user ${user.Id} (${user.Email})`);
        return { success: true, message: `Test daily summary email sent to ${user.Email}` };
      } else {
        return { success: false, message: 'Failed to send email. Check SMTP configuration.' };
      }
    } else {
      // Weekly summary
      // Calculate week range (Monday to Sunday)
      const weekStart = new Date(userTime);
      const diff = userTime.getDay() === 0 ? -6 : 1 - userTime.getDay(); // Adjust to Monday
      weekStart.setDate(userTime.getDate() + diff);
      const weekStartStr = formatDate(weekStart);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekEndStr = formatDate(weekEnd);

      // Get allocations for the week
      const allocations = await getUserAllocationsForWeek(user.Id, weekStartStr, weekEndStr);
      const totalHours = allocations.reduce((sum, a) => sum + Number(a.AllocatedHours), 0);

      // Calculate daily breakdown
      const dailyBreakdown: { date: string; workHours: number; hobbyHours: number }[] = [];
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + i);
        const dayDateStr = formatDate(dayDate);
        const dayAllocations = await getUserAllocationsForDate(user.Id, dayDateStr);
        const workHours  = dayAllocations.filter(a => !a.IsHobby).reduce((sum, a) => sum + Number(a.AllocatedHours), 0);
        const hobbyHours = dayAllocations.filter(a =>  a.IsHobby).reduce((sum, a) => sum + Number(a.AllocatedHours), 0);
        dailyBreakdown.push({ date: dayDateStr, workHours, hobbyHours });
      }

      // Send weekly summary email
      const html = generateWeeklySummaryEmail(user, weekStartStr, weekEndStr, allocations, totalHours, dailyBreakdown);
      const sent = await sendEmail({
        to: user.Email,
        subject: `[TEST] 📅 Your Weekly Work Summary (${new Date(weekStartStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(weekEndStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`,
        html,
        userId: user.Id,
        username: user.Username,
      });

      if (sent) {
        logger.info(`Sent TEST weekly work summary to user ${user.Id} (${user.Email})`);
        return { success: true, message: `Test weekly summary email sent to ${user.Email}` };
      } else {
        return { success: false, message: 'Failed to send email. Check SMTP configuration.' };
      }
    }
  } catch (error: any) {
    logger.error('Error sending test summary email:', error);
    return { success: false, message: error.message || 'Failed to send test email' };
  }
}
