import cron, { ScheduledTask } from 'node-cron';
import { pool, RowDataPacket, ResultSetHeader } from '../config/database';
import { computeProjectHealth } from './projectHealth';
import { sendEmail } from './emailService';
import logger from './logger';
import { previousPeriod } from './reportingAccess';

let snapshotTask: ScheduledTask | null = null;
let digestTask: ScheduledTask | null = null;
let isSnapshotRunning = false;
let isDigestRunning = false;

async function captureHealthSnapshots(): Promise<void> {
  if (isSnapshotRunning) return;
  isSnapshotRunning = true;
  try {
    const snapshotDate = new Date().toISOString().slice(0, 10);
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.OrganizationId, p.ProjectName, p.Budget, p.EndDate,
              COALESCE(ps.IsClosed, 0) AS StatusIsClosed,
              COALESCE(ps.IsCancelled, 0) AS StatusIsCancelled,
              (SELECT COALESCE(SUM(te.Hours), 0) FROM TimeEntries te
                INNER JOIN Tasks t ON te.TaskId = t.Id WHERE t.ProjectId = p.Id
                AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)) AS BudgetSpent,
              (SELECT COUNT(*) FROM Tasks t LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
                WHERE t.ProjectId = p.Id AND COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
                AND t.DueDate IS NOT NULL AND t.DueDate < CURRENT_TIMESTAMP) AS HealthOverdueTasks,
              (SELECT COUNT(*) FROM Tasks t WHERE t.ProjectId = p.Id) AS HealthTotalTasks,
              (SELECT COUNT(*) FROM Tasks t WHERE t.ProjectId = p.Id AND t.AssignedTo IS NULL
                AND NOT EXISTS (SELECT 1 FROM TaskAssignees ta WHERE ta.TaskId = t.Id)) AS HealthUnassignedTasks,
              (SELECT COUNT(*) FROM Sprints s WHERE s.ProjectId = p.Id AND s.Status = 'active') AS ActiveSprintCount,
              (SELECT COUNT(*) FROM Sprints s WHERE s.ProjectId = p.Id AND s.Status = 'active'
                AND s.EndDate IS NOT NULL AND s.EndDate < CURRENT_TIMESTAMP) AS OverdueActiveSprints,
              (SELECT MIN(s.EndDate) FROM Sprints s WHERE s.ProjectId = p.Id AND s.Status = 'active') AS ActiveSprintEndDate,
              (SELECT COALESCE(SUM(COALESCE(t.EstimatedHours,0)),0) FROM Tasks t WHERE t.ProjectId = p.Id
                AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)) AS EstimatedHours,
              (SELECT COALESCE(SUM(te.Hours),0) FROM TimeEntries te
                INNER JOIN Tasks t ON te.TaskId = t.Id WHERE t.ProjectId = p.Id) AS LoggedHours
       FROM Projects p
       LEFT JOIN ProjectStatusValues ps ON p.Status = ps.Id
       WHERE COALESCE(ps.IsClosed, 0) = 0 AND COALESCE(ps.IsCancelled, 0) = 0`
    );

    for (const project of projects) {
      const health = computeProjectHealth({
        isClosed: project.StatusIsClosed,
        isCancelled: project.StatusIsCancelled,
        canViewBudgetInfo: true,
        budget: project.Budget,
        budgetSpent: project.BudgetSpent,
        endDate: project.EndDate,
        overdueTasks: project.HealthOverdueTasks,
        totalTasks: project.HealthTotalTasks,
        unassignedTasks: project.HealthUnassignedTasks,
        overdueMilestones: 0,
        upcomingMilestonesSoon: 0,
        activeSprintCount: project.ActiveSprintCount,
        overdueActiveSprints: project.OverdueActiveSprints,
        activeSprintEndDate: project.ActiveSprintEndDate,
      });

      await pool.execute(
        `DELETE FROM ProjectHealthSnapshots WHERE ProjectId = ? AND SnapshotDate = ?`,
        [project.Id, snapshotDate]
      );
      await pool.execute(
        `INSERT INTO ProjectHealthSnapshots
          (OrganizationId, ProjectId, SnapshotDate, HealthStatus, HealthReasons, OpenTasks, OverdueTasks, EstimatedHours, LoggedHours, CreatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          project.OrganizationId,
          project.Id,
          snapshotDate,
          health.status,
          JSON.stringify(health.reasons || []),
          Number(project.HealthTotalTasks || 0),
          Number(project.HealthOverdueTasks || 0),
          Number(project.EstimatedHours || 0),
          Number(project.LoggedHours || 0),
        ]
      );
    }
    logger.info(`Project health snapshots captured for ${snapshotDate} (${projects.length} projects)`);
  } catch (error) {
    logger.error('Health snapshot job failed:', error);
  } finally {
    isSnapshotRunning = false;
  }
}

async function buildOrgDigestHtml(organizationId: number): Promise<{ subject: string; html: string } | null> {
  const [orgRows] = await pool.execute<RowDataPacket[]>(
    'SELECT Name FROM Organizations WHERE Id = ?',
    [organizationId]
  );
  if (!orgRows.length) return null;
  const orgName = String(orgRows[0].Name || `Organization #${organizationId}`);

  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const prev = previousPeriod(fromStr, toStr);

  const [health] = await pool.execute<RowDataPacket[]>(
    `SELECT
       SUM(CASE WHEN HealthStatus = 'green' THEN 1 ELSE 0 END) AS GreenCnt,
       SUM(CASE WHEN HealthStatus = 'amber' THEN 1 ELSE 0 END) AS AmberCnt,
       SUM(CASE WHEN HealthStatus = 'red' THEN 1 ELSE 0 END) AS RedCnt
     FROM ProjectHealthSnapshots
     WHERE OrganizationId = ? AND SnapshotDate = ?`,
    [organizationId, toStr]
  );

  const [hours] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(te.Hours), 0) AS Hours
     FROM TimeEntries te
     INNER JOIN Tasks t ON te.TaskId = t.Id
     INNER JOIN Projects p ON t.ProjectId = p.Id
     WHERE p.OrganizationId = ? AND te.WorkDate >= ? AND te.WorkDate <= ?`,
    [organizationId, fromStr, toStr]
  );
  const [hoursPrev] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(te.Hours), 0) AS Hours
     FROM TimeEntries te
     INNER JOIN Tasks t ON te.TaskId = t.Id
     INNER JOIN Projects p ON t.ProjectId = p.Id
     WHERE p.OrganizationId = ? AND te.WorkDate >= ? AND te.WorkDate <= ?`,
    [organizationId, prev.from, prev.to]
  );

  const baseUrl = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const link = baseUrl
    ? `${baseUrl}/reporting?tab=organization&organizationId=${organizationId}`
    : `/reporting?tab=organization&organizationId=${organizationId}`;

  const logged = Number(hours[0]?.Hours || 0);
  const loggedPrev = Number(hoursPrev[0]?.Hours || 0);
  const green = Number(health[0]?.GreenCnt || 0);
  const amber = Number(health[0]?.AmberCnt || 0);
  const red = Number(health[0]?.RedCnt || 0);

  return {
    subject: `[Reporting] ${orgName} overview (${fromStr} → ${toStr})`,
    html: `
      <h2>${orgName} — Organization Overview</h2>
      <p>Period: <strong>${fromStr}</strong> to <strong>${toStr}</strong></p>
      <ul>
        <li>Health: ${green} green / ${amber} amber / ${red} red</li>
        <li>Logged hours: ${logged.toFixed(1)}h (previous period ${loggedPrev.toFixed(1)}h)</li>
      </ul>
      <p><a href="${link}">Open Reporting hub</a></p>
    `,
  };
}

async function runOrgDigestScheduler(): Promise<void> {
  if (isDigestRunning) return;
  isDigestRunning = true;
  try {
    const now = new Date();
    const dow = now.getDay();
    const dom = now.getDate();

    const [schedules] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM OrganizationReportDigests WHERE IsActive = 1`
    );

    for (const schedule of schedules) {
      const frequency = String(schedule.Frequency || 'weekly');
      const shouldRun =
        frequency === 'weekly'
          ? Number(schedule.DayOfWeek ?? 1) === dow
          : Number(schedule.DayOfMonth ?? 1) === Math.min(dom, 28);

      if (!shouldRun) continue;

      const lastSent = schedule.LastSentAt ? new Date(schedule.LastSentAt) : null;
      if (lastSent && lastSent.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) {
        continue;
      }

      const content = await buildOrgDigestHtml(Number(schedule.OrganizationId));
      if (!content) continue;

      const recipients = String(schedule.Recipients || '')
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);

      for (const email of recipients) {
        await sendEmail({
          to: email,
          subject: content.subject,
          html: content.html,
        });
      }

      await pool.execute<ResultSetHeader>(
        `UPDATE OrganizationReportDigests SET LastSentAt = CURRENT_TIMESTAMP, UpdatedAt = CURRENT_TIMESTAMP WHERE Id = ?`,
        [schedule.Id]
      );
      logger.info(`Organization digest sent for schedule ${schedule.Id}`);
    }
  } catch (error) {
    logger.error('Organization digest scheduler failed:', error);
  } finally {
    isDigestRunning = false;
  }
}

/** Daily 01:00 snapshots; hourly check for digests (same pattern as PDF reports). */
export function startReportingSchedulers(): void {
  if (!snapshotTask) {
    snapshotTask = cron.schedule('0 1 * * *', () => {
      void captureHealthSnapshots();
    });
    logger.info('Project health snapshot scheduler started (daily 01:00)');
  }
  if (!digestTask) {
    digestTask = cron.schedule('0 * * * *', () => {
      void runOrgDigestScheduler();
    });
    logger.info('Organization report digest scheduler started (hourly)');
  }
}

export { captureHealthSnapshots, runOrgDigestScheduler };
