import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { sendEmail } from './emailService';
import logger from './logger';
import PDFDocument from 'pdfkit';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportSchedule extends RowDataPacket {
  Id: number;
  ProjectId: number;
  ProjectName: string;
  OrganizationId: number;
  Frequency: 'weekly' | 'monthly';
  DayOfWeek: number | null;
  DayOfMonth: number | null;
  Recipients: string;
  IncludeTaskTable: number;
  IncludeTimeEntries: number;
  IncludeBudget: number;
  IsEnabled: number;
  LastSentAt: Date | null;
}

interface TaskRow extends RowDataPacket {
  Id: number;
  TaskName: string;
  Status: string;
  Priority: string;
  EstimatedHours: number;
  AllocatedHours: number;
  WorkedHours: number;
  AssigneeName: string | null;
  PlannedStartDate: string | null;
  PlannedEndDate: string | null;
  ParentTaskId: number | null;
}

interface TimeEntryRow extends RowDataPacket {
  WorkDate: string;
  DisplayName: string;
  TaskName: string;
  Hours: number;
  Description: string | null;
}

interface ProjectStats extends RowDataPacket {
  ProjectName: string;
  OrganizationName: string;
  Status: string;
  StartDate: string | null;
  EndDate: string | null;
  Budget: number | null;
  TotalTasks: number;
  CompletedTasks: number;
  InProgressTasks: number;
  TotalEstimatedHours: number;
  TotalWorkedHours: number;
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

function generatePDFBuffer(
  stats: ProjectStats,
  tasks: TaskRow[],
  timeEntries: TimeEntryRow[],
  options: { includeTaskTable: boolean; includeTimeEntries: boolean; includeBudget: boolean },
  periodLabel: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const blue = '#3b82f6';
    const darkGray = '#1f2937';
    const midGray = '#6b7280';
    const lightGray = '#f3f4f6';
    const green = '#10b981';
    const red = '#ef4444';
    const amber = '#f59e0b';

    const pageWidth = 595 - 80; // A4 minus margins

    // ── Header ──
    doc.rect(0, 0, 595, 70).fill(blue);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
      .text('Project Report', 40, 20, { align: 'left' });
    doc.fontSize(11).font('Helvetica')
      .text(stats.ProjectName, 40, 44);
    doc.fillColor(darkGray);

    doc.y = 85;

    // ── Period & Meta ──
    doc.fontSize(9).fillColor(midGray)
      .text(`Report period: ${periodLabel}   |   Organization: ${stats.OrganizationName}   |   Status: ${stats.Status}`, 40, doc.y);
    doc.moveDown(0.5);

    // ── Summary Cards (horizontal) ──
    const cardY = doc.y + 4;
    const cardW = (pageWidth - 30) / 4;
    const progressPct = stats.TotalTasks > 0
      ? Math.round((stats.CompletedTasks / stats.TotalTasks) * 100)
      : 0;

    const cards = [
      { label: 'Total Tasks', value: String(stats.TotalTasks), color: blue },
      { label: 'Completed', value: `${stats.CompletedTasks} (${progressPct}%)`, color: green },
      { label: 'Est. Hours', value: stats.TotalEstimatedHours.toFixed(1) + 'h', color: amber },
      { label: 'Worked Hours', value: stats.TotalWorkedHours.toFixed(1) + 'h', color: stats.TotalWorkedHours > stats.TotalEstimatedHours ? red : green },
    ];

    cards.forEach((card, i) => {
      const x = 40 + i * (cardW + 10);
      doc.rect(x, cardY, cardW, 50).fill(lightGray);
      doc.rect(x, cardY, 4, 50).fill(card.color);
      doc.fillColor(midGray).fontSize(8).font('Helvetica')
        .text(card.label, x + 10, cardY + 8);
      doc.fillColor(darkGray).fontSize(14).font('Helvetica-Bold')
        .text(card.value, x + 10, cardY + 22);
    });
    doc.fillColor(darkGray).font('Helvetica');
    doc.y = cardY + 60;

    // ── Budget section ──
    if (options.includeBudget && stats.Budget !== null && stats.Budget > 0) {
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica-Bold').fillColor(darkGray).text('Budget', 40);
      doc.fontSize(9).font('Helvetica').fillColor(midGray);

      const budgetBar = (pageWidth * 0.6);
      const spentPct = Math.min(stats.TotalWorkedHours / Math.max(stats.TotalEstimatedHours, 1), 1);
      const barY = doc.y + 4;
      doc.rect(40, barY, budgetBar, 12).fill('#e5e7eb');
      doc.rect(40, barY, budgetBar * spentPct, 12).fill(spentPct > 0.9 ? red : blue);
      doc.fillColor(darkGray).fontSize(9)
        .text(`Budget: $${stats.Budget.toFixed(2)}   |   Hours consumed: ${(spentPct * 100).toFixed(0)}%`, 40, barY + 16);
      doc.y = barY + 32;
    }

    // ── Task Table ──
    if (options.includeTaskTable && tasks.length > 0) {
      doc.moveDown(0.6);
      doc.fontSize(12).font('Helvetica-Bold').fillColor(darkGray).text('Tasks');
      doc.moveDown(0.3);

      // Table header
      const colX = [40, 185, 265, 330, 390, 450, 510];
      const headers = ['Task', 'Status', 'Priority', 'Assignee', 'Est.h', 'Work.h', 'Done%'];
      const hY = doc.y;
      doc.rect(40, hY, pageWidth, 16).fill(blue);
      headers.forEach((h, i) => {
        doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold')
          .text(h, colX[i] + 2, hY + 4, { width: (colX[i + 1] ?? colX[i] + 60) - colX[i] - 4, align: 'left' });
      });
      doc.y = hY + 18;

      // Identify leaf tasks for accurate totals (skip parent-only tasks in count but show all)
      const taskIdsWithChildren = new Set(tasks.filter(t => t.ParentTaskId).map(t => t.ParentTaskId));

      let rowIdx = 0;
      for (const task of tasks) {
        if (doc.y > 760) {
          doc.addPage();
        }
        const rowY = doc.y;
        const isLeaf = !taskIdsWithChildren.has(task.Id);
        const bgColor = rowIdx % 2 === 0 ? '#ffffff' : lightGray;
        doc.rect(40, rowY, pageWidth, 14).fill(bgColor);

        const indent = task.ParentTaskId ? 6 : 0;
        const cols = [
          task.TaskName.substring(0, 30) + (task.TaskName.length > 30 ? '…' : ''),
          task.Status?.substring(0, 14) ?? '',
          task.Priority?.substring(0, 12) ?? '',
          (task.AssigneeName ?? 'Unassigned').substring(0, 14),
          isLeaf ? (task.EstimatedHours ?? 0).toFixed(1) : '',
          isLeaf ? (task.WorkedHours ?? 0).toFixed(1) : '',
          isLeaf ? `${Math.round(Math.min(((task.WorkedHours ?? 0) / Math.max(task.EstimatedHours ?? 1, 0.1)) * 100, 100))}%` : '',
        ];
        cols.forEach((val, i) => {
          doc.fillColor(darkGray).fontSize(7).font(i === 0 && task.ParentTaskId ? 'Helvetica-Oblique' : 'Helvetica')
            .text(val, colX[i] + indent + 2, rowY + 3, {
              width: (colX[i + 1] ?? colX[i] + 60) - colX[i] - 4,
              align: 'left',
            });
        });
        doc.y = rowY + 15;
        rowIdx++;
      }
    }

    // ── Time Entries ──
    if (options.includeTimeEntries && timeEntries.length > 0) {
      if (doc.y > 680) doc.addPage();
      doc.moveDown(0.8);
      doc.fontSize(12).font('Helvetica-Bold').fillColor(darkGray).text('Time Entries');
      doc.moveDown(0.3);

      const colX2 = [40, 110, 210, 310, 360];
      const headers2 = ['Date', 'User', 'Task', 'Hours', 'Notes'];
      const hY2 = doc.y;
      doc.rect(40, hY2, pageWidth, 16).fill(blue);
      headers2.forEach((h, i) => {
        doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold')
          .text(h, colX2[i] + 2, hY2 + 4, { width: (colX2[i + 1] ?? colX2[i] + 180) - colX2[i] - 4 });
      });
      doc.y = hY2 + 18;

      let rowIdx = 0;
      for (const entry of timeEntries) {
        if (doc.y > 760) doc.addPage();
        const rowY = doc.y;
        const bgColor = rowIdx % 2 === 0 ? '#ffffff' : lightGray;
        doc.rect(40, rowY, pageWidth, 13).fill(bgColor);

        const dateStr = entry.WorkDate ? String(entry.WorkDate).split('T')[0] : '';
        const cols2 = [
          dateStr,
          (entry.DisplayName ?? '').substring(0, 22),
          (entry.TaskName ?? '').substring(0, 24),
          (entry.Hours ?? 0).toFixed(1),
          (entry.Description ?? '').substring(0, 50),
        ];
        cols2.forEach((val, i) => {
          doc.fillColor(darkGray).fontSize(7).font('Helvetica')
            .text(val, colX2[i] + 2, rowY + 3, {
              width: (colX2[i + 1] ?? colX2[i] + 180) - colX2[i] - 4,
            });
        });
        doc.y = rowY + 14;
        rowIdx++;
      }
    }

    // ── Footer ──
    const totalPages = (doc as any)._pageCount ?? 1;
    doc.fontSize(7).fillColor(midGray)
      .text(
        `Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}  |  Project Management System`,
        40,
        800,
        { align: 'center', width: pageWidth }
      );

    doc.end();
  });
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

async function fetchProjectStats(projectId: number, since: Date): Promise<{
  stats: ProjectStats;
  tasks: TaskRow[];
  timeEntries: TimeEntryRow[];
} | null> {
  const sinceStr = since.toISOString().split('T')[0];

  const [projectRows] = await pool.execute<ProjectStats[]>(
    `SELECT p.ProjectName, o.Name AS OrganizationName, p.Status, p.StartDate, p.EndDate,
            p.Budget, p.OrganizationId,
            COUNT(DISTINCT t.Id) AS TotalTasks,
            SUM(CASE WHEN tsv.IsClosed = 1 THEN 1 ELSE 0 END) AS CompletedTasks,
            SUM(CASE WHEN tsv.IsClosed = 0 AND tsv.IsDefault = 0 THEN 1 ELSE 0 END) AS InProgressTasks,
            COALESCE(SUM(CASE WHEN t2.Id IS NULL THEN t.EstimatedHours ELSE 0 END), 0) AS TotalEstimatedHours,
            COALESCE((SELECT SUM(te.Hours) FROM TimeEntries te
                      INNER JOIN Tasks tk ON te.TaskId = tk.Id
                      WHERE tk.ProjectId = p.Id), 0) AS TotalWorkedHours
     FROM Projects p
     INNER JOIN Organizations o ON p.OrganizationId = o.Id
     LEFT JOIN Tasks t ON t.ProjectId = p.Id
     LEFT JOIN Tasks t2 ON t2.ParentTaskId = t.Id
     LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
     WHERE p.Id = ?
     GROUP BY p.Id`,
    [projectId]
  );

  if (!projectRows.length) return null;
  const stats = projectRows[0];
  // MySQL aggregate functions return strings — coerce to numbers
  stats.TotalTasks = Number(stats.TotalTasks);
  stats.CompletedTasks = Number(stats.CompletedTasks);
  stats.InProgressTasks = Number(stats.InProgressTasks);
  stats.TotalEstimatedHours = parseFloat(String(stats.TotalEstimatedHours)) || 0;
  stats.TotalWorkedHours = parseFloat(String(stats.TotalWorkedHours)) || 0;
  if (stats.Budget !== null && stats.Budget !== undefined) stats.Budget = parseFloat(String(stats.Budget));

  const [tasks] = await pool.execute<TaskRow[]>(
    `SELECT t.Id, t.TaskName, t.ParentTaskId,
            COALESCE(tsv.StatusName, t.Status) AS Status,
            COALESCE(tpv.PriorityName, t.Priority) AS Priority,
            COALESCE(t.EstimatedHours, 0) AS EstimatedHours,
            COALESCE((SELECT SUM(ta.AllocatedHours) FROM TaskAllocations ta WHERE ta.TaskId = t.Id), 0) AS AllocatedHours,
            COALESCE((SELECT SUM(te.Hours) FROM TimeEntries te WHERE te.TaskId = t.Id), 0) AS WorkedHours,
            CONCAT(u.FirstName, ' ', u.LastName) AS AssigneeName,
            t.PlannedStartDate, t.PlannedEndDate
     FROM Tasks t
     LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
     LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
     LEFT JOIN Users u ON t.AssignedTo = u.Id
     WHERE t.ProjectId = ?
     ORDER BY t.ParentTaskId IS NULL DESC, t.ParentTaskId, t.Id`,
    [projectId]
  );

  const [timeEntries] = await pool.execute<TimeEntryRow[]>(
    `SELECT te.WorkDate, te.Hours, te.Description,
            CONCAT(u.FirstName, ' ', u.LastName) AS DisplayName,
            t.TaskName
     FROM TimeEntries te
     INNER JOIN Tasks t ON te.TaskId = t.Id
     INNER JOIN Users u ON te.UserId = u.Id
     WHERE t.ProjectId = ? AND te.WorkDate >= ?
     ORDER BY te.WorkDate DESC, u.FirstName
     LIMIT 200`,
    [projectId, sinceStr]
  );

  // Coerce task numeric fields returned as strings by MySQL
  for (const t of tasks as any[]) {
    t.EstimatedHours = parseFloat(String(t.EstimatedHours)) || 0;
    t.AllocatedHours = parseFloat(String(t.AllocatedHours)) || 0;
    t.WorkedHours = parseFloat(String(t.WorkedHours)) || 0;
  }
  // Coerce time entry hours
  for (const e of timeEntries as any[]) {
    e.Hours = parseFloat(String(e.Hours)) || 0;
  }

  return { stats, tasks, timeEntries };
}

// ─── Schedule Checking ────────────────────────────────────────────────────────

function shouldRunNow(schedule: ReportSchedule): boolean {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const dom = now.getDate();

  if (schedule.Frequency === 'weekly') {
    if (schedule.DayOfWeek !== null && dow !== schedule.DayOfWeek) return false;
  } else if (schedule.Frequency === 'monthly') {
    if (schedule.DayOfMonth !== null && dom !== schedule.DayOfMonth) return false;
  }

  // Avoid sending twice on the same day
  if (schedule.LastSentAt) {
    const lastSent = new Date(schedule.LastSentAt);
    const todayStr = now.toISOString().split('T')[0];
    const lastSentStr = lastSent.toISOString().split('T')[0];
    if (todayStr === lastSentStr) return false;
  }

  return true;
}

function getPeriodStart(frequency: 'weekly' | 'monthly'): Date {
  const now = new Date();
  if (frequency === 'weekly') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  } else {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d;
  }
}

function getPeriodLabel(frequency: 'weekly' | 'monthly', since: Date): string {
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  const from = since.toLocaleDateString('en-US', opts);
  const to = new Date().toLocaleDateString('en-US', opts);
  return `${from} – ${to}`;
}

// ─── Email HTML Builder ───────────────────────────────────────────────────────

function buildEmailHtml(stats: ProjectStats, periodLabel: string, frequency: 'weekly' | 'monthly'): string {
  return `
    <div style="font-family: sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto;">
      <div style="background: #3b82f6; color: white; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin:0;font-size:20px;">📊 ${frequency === 'weekly' ? 'Weekly' : 'Monthly'} Project Report</h1>
        <p style="margin:8px 0 0;">${stats.ProjectName}</p>
      </div>
      <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Please find the ${frequency} project report attached as a PDF.</p>
        <p><strong>Period:</strong> ${periodLabel}</p>
        <table style="width:100%; border-collapse: collapse; margin-top: 16px;">
          <tr style="background:#f3f4f6;">
            <td style="padding:8px;border:1px solid #e5e7eb;"><strong>Total Tasks</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${stats.TotalTasks}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;"><strong>Completed</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${stats.CompletedTasks}</td>
          </tr>
          <tr style="background:#f3f4f6;">
            <td style="padding:8px;border:1px solid #e5e7eb;"><strong>Est. Hours</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${Number(stats.TotalEstimatedHours).toFixed(1)}h</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #e5e7eb;"><strong>Worked Hours</strong></td>
            <td style="padding:8px;border:1px solid #e5e7eb;">${Number(stats.TotalWorkedHours).toFixed(1)}h</td>
          </tr>
        </table>
        <p style="margin-top:24px;color:#6b7280;font-size:12px;">
          This report was automatically generated by Project Management System.
          To manage report schedules, open the project settings.
        </p>
      </div>
    </div>`;
}

// ─── Main Runner ──────────────────────────────────────────────────────────────

async function runPdfReportScheduler(): Promise<void> {
  try {
    const [schedules] = await pool.execute<ReportSchedule[]>(
      `SELECT prs.*, p.ProjectName, p.OrganizationId
       FROM ProjectReportSchedules prs
       INNER JOIN Projects p ON prs.ProjectId = p.Id
       WHERE prs.IsEnabled = 1`
    );

    for (const schedule of schedules) {
      if (!shouldRunNow(schedule)) continue;

      try {
        const since = getPeriodStart(schedule.Frequency);
        const periodLabel = getPeriodLabel(schedule.Frequency, since);

        const data = await fetchProjectStats(schedule.ProjectId, since);
        if (!data) {
          logger.warn(`[PDF Scheduler] Project ${schedule.ProjectId} not found — skipping.`);
          continue;
        }

        const { stats, tasks, timeEntries } = data;

        const pdfBuffer = await generatePDFBuffer(
          stats,
          tasks,
          timeEntries,
          {
            includeTaskTable: Boolean(schedule.IncludeTaskTable),
            includeTimeEntries: Boolean(schedule.IncludeTimeEntries),
            includeBudget: Boolean(schedule.IncludeBudget),
          },
          periodLabel
        );

        const recipients = (schedule.Recipients || '')
          .split(',')
          .map((r: string) => r.trim())
          .filter(Boolean);

        if (recipients.length === 0) {
          logger.warn(`[PDF Scheduler] Schedule ${schedule.Id} has no recipients — skipping.`);
          continue;
        }

        const subject = `📊 ${schedule.Frequency === 'weekly' ? 'Weekly' : 'Monthly'} Report: ${stats.ProjectName}`;
        const html = buildEmailHtml(stats, periodLabel, schedule.Frequency);

        for (const to of recipients) {
          await sendEmail({
            to,
            subject,
            html,
            attachments: [
              {
                filename: `report-${stats.ProjectName.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().split('T')[0]}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
              },
            ],
          });
        }

        // Update LastSentAt
        await pool.execute(
          'UPDATE ProjectReportSchedules SET LastSentAt = NOW() WHERE Id = ?',
          [schedule.Id]
        );

        logger.info(`[PDF Scheduler] Sent ${schedule.Frequency} report for project ${stats.ProjectName} to ${recipients.join(', ')}`);
      } catch (err) {
        logger.error(`[PDF Scheduler] Error processing schedule ${schedule.Id}:`, err);
      }
    }
  } catch (err) {
    logger.error('[PDF Scheduler] Fatal error:', err);
  }
}

// ─── On-demand send (used by API route for test sends) ────────────────────────

export async function sendReportNow(schedule: ReportSchedule): Promise<void> {
  const since = getPeriodStart(schedule.Frequency);
  const periodLabel = getPeriodLabel(schedule.Frequency, since);

  const data = await fetchProjectStats(schedule.ProjectId, since);
  if (!data) throw new Error(`Project ${schedule.ProjectId} not found`);

  const { stats, tasks, timeEntries } = data;

  const pdfBuffer = await generatePDFBuffer(
    stats,
    tasks,
    timeEntries,
    {
      includeTaskTable: Boolean(schedule.IncludeTaskTable),
      includeTimeEntries: Boolean(schedule.IncludeTimeEntries),
      includeBudget: Boolean(schedule.IncludeBudget),
    },
    periodLabel
  );

  const recipients = (schedule.Recipients || '')
    .split(',')
    .map((r: string) => r.trim())
    .filter(Boolean);

  if (recipients.length === 0) throw new Error('No recipients configured');

  const subject = `📊 ${schedule.Frequency === 'weekly' ? 'Weekly' : 'Monthly'} Report: ${stats.ProjectName}`;
  const html = buildEmailHtml(stats, periodLabel, schedule.Frequency);

  for (const to of recipients) {
    await sendEmail({
      to,
      subject,
      html,
      attachments: [
        {
          filename: `report-${stats.ProjectName.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().split('T')[0]}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  await pool.execute('UPDATE ProjectReportSchedules SET LastSentAt = NOW() WHERE Id = ?', [schedule.Id]);
  logger.info(`[PDF Scheduler] Manual send for ${stats.ProjectName} to ${recipients.join(', ')}`);
}

// ─── Exported start function ──────────────────────────────────────────────────

export function startPdfReportScheduler(): void {
  // Run once at startup (in case the server was down during the scheduled time)
  setTimeout(runPdfReportScheduler, 30_000); // wait 30s after boot

  // Then check every hour
  setInterval(runPdfReportScheduler, 60 * 60 * 1000);

  logger.info('[PDF Scheduler] Started — checking hourly.');
}
