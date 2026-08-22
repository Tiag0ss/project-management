import { Router, Response } from 'express';
import { pool, RowDataPacket, ResultSetHeader } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { computeProjectHealth } from '../utils/projectHealth';
import {
  canAccessCapacityReporting,
  canAccessManagerReporting,
  canAccessReportingHub,
  deltaMetric,
  getReportingAccess,
  parseDateOnly,
  previousPeriod,
  userBelongsToOrganization,
} from '../utils/reportingAccess';

const router = Router();

const defaultDateRange = (): { from: string; to: string } => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
};

async function requireHubAccess(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.userId || 0);
  const access = await getReportingAccess(userId, req.user?.customerId);
  if (!access || !canAccessReportingHub(access)) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return null;
  }
  return access;
}

async function requireManagerAccess(req: AuthRequest, res: Response) {
  const access = await requireHubAccess(req, res);
  if (!access) return null;
  if (!canAccessManagerReporting(access)) {
    res.status(403).json({ success: false, message: 'Manager or admin access required' });
    return null;
  }
  return access;
}

router.get('/access', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const access = await getReportingAccess(userId, req.user?.customerId);
    if (!access) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    return res.json({
      success: true,
      data: {
        canAccessHub: canAccessReportingHub(access),
        canAccessManagerPacks: canAccessManagerReporting(access),
        canAccessCapacity: canAccessCapacityReporting(access),
        canAccessExplore: canAccessManagerReporting(access),
        canViewBudgetInfo: access.canViewBudgetInfo,
        isAdmin: access.isAdmin,
        isManager: access.isManager,
        isCustomerUser: access.isCustomerUser,
      },
    });
  } catch (error) {
    logger.error('Reporting access error:', error);
    return res.status(500).json({ success: false, message: 'Failed to resolve reporting access' });
  }
});

router.get('/my-work', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const access = await requireHubAccess(req, res);
    if (!access) return;

    const defaults = defaultDateRange();
    const from = parseDateOnly(req.query.from) || defaults.from;
    const to = parseDateOnly(req.query.to) || defaults.to;
    const prev = previousPeriod(from, to);
    const userId = access.userId;

    const [openTasks] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Cnt
       FROM Tasks t
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE (t.AssignedTo = ? OR EXISTS (SELECT 1 FROM TaskAssignees ta WHERE ta.TaskId = t.Id AND ta.UserId = ?))
         AND COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0`,
      [userId, userId]
    );

    const [overdueTasks] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Cnt
       FROM Tasks t
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE (t.AssignedTo = ? OR EXISTS (SELECT 1 FROM TaskAssignees ta WHERE ta.TaskId = t.Id AND ta.UserId = ?))
         AND COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0
         AND t.DueDate IS NOT NULL AND t.DueDate < CURRENT_TIMESTAMP`,
      [userId, userId]
    );

    const [hoursCurrent] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(Hours), 0) AS Hours
       FROM TimeEntries
       WHERE UserId = ? AND WorkDate >= ? AND WorkDate <= ?`,
      [userId, from, to]
    );

    const [hoursPrevious] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(Hours), 0) AS Hours
       FROM TimeEntries
       WHERE UserId = ? AND WorkDate >= ? AND WorkDate <= ?`,
      [userId, prev.from, prev.to]
    );

    const [plannedCurrent] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(AllocatedHours), 0) AS Hours
       FROM TaskAllocations
       WHERE UserId = ? AND AllocationDate >= ? AND AllocationDate <= ?`,
      [userId, from, to]
    );

    // Tickets.StatusId → TicketStatusValues.Id (no IsCancelled on ticket statuses).
    const [ticketsOpen] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Cnt
       FROM Tickets tk
       LEFT JOIN TicketStatusValues tsv ON tk.StatusId = tsv.Id
       WHERE (tk.AssignedToUserId = ? OR tk.DeveloperUserId = ?)
         AND COALESCE(tsv.IsClosed, 0) = 0`,
      [userId, userId]
    );

    const [recentTasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ProjectId, t.TaskName, t.DueDate, p.ProjectName,
              CASE WHEN t.DueDate IS NOT NULL AND t.DueDate < CURRENT_TIMESTAMP THEN 1 ELSE 0 END AS IsOverdue
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE (t.AssignedTo = ? OR EXISTS (SELECT 1 FROM TaskAssignees ta WHERE ta.TaskId = t.Id AND ta.UserId = ?))
         AND COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0
       ORDER BY IsOverdue DESC, t.DueDate ASC
       LIMIT 15`,
      [userId, userId]
    );

    const hours = deltaMetric(Number(hoursCurrent[0]?.Hours || 0), Number(hoursPrevious[0]?.Hours || 0));

    return res.json({
      success: true,
      data: {
        period: { from, to, previous: prev },
        openTasks: Number(openTasks[0]?.Cnt || 0),
        overdueTasks: Number(overdueTasks[0]?.Cnt || 0),
        openTickets: Number(ticketsOpen[0]?.Cnt || 0),
        loggedHours: hours,
        plannedHours: Number(plannedCurrent[0]?.Hours || 0),
        recentOpenTasks: recentTasks.map((r) => ({
          id: Number(r.Id),
          projectId: Number(r.ProjectId || 0),
          name: String(r.TaskName || ''),
          projectName: String(r.ProjectName || ''),
          dueDate: r.DueDate ? String(r.DueDate).slice(0, 10) : null,
          isOverdue: Number(r.IsOverdue || 0) === 1,
        })),
      },
    });
  } catch (error) {
    logger.error('Reporting my-work error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load My Work metrics' });
  }
});

router.get('/organization-overview', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const access = await requireManagerAccess(req, res);
    if (!access) return;

    const organizationId = Number(req.query.organizationId || 0);
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId is required' });
    }
    if (!(await userBelongsToOrganization(access.userId, organizationId)) && !access.isAdmin) {
      return res.status(403).json({ success: false, message: 'Not a member of this organization' });
    }

    const defaults = defaultDateRange();
    const from = parseDateOnly(req.query.from) || defaults.from;
    const to = parseDateOnly(req.query.to) || defaults.to;
    const prev = previousPeriod(from, to);
    const projectId = Number(req.query.projectId || 0) || null;

    const projectFilter = projectId ? ' AND p.Id = ?' : '';
    const baseParams: Array<number | string> = [organizationId];
    if (projectId) baseParams.push(projectId);

    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.ProjectName, p.Budget, p.EndDate,
              COALESCE(ps.IsClosed, 0) AS StatusIsClosed,
              COALESCE(ps.IsCancelled, 0) AS StatusIsCancelled,
              (SELECT COALESCE(SUM(te.Hours), 0) FROM TimeEntries te
                INNER JOIN Tasks t ON te.TaskId = t.Id
                WHERE t.ProjectId = p.Id
                  AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)
              ) AS HoursSpent,
              (SELECT COALESCE(SUM(te.Hours * COALESCE(t.HourlyRate, p.HourlyRate, u.HourlyRate, 0)), 0)
                FROM TimeEntries te
                INNER JOIN Tasks t ON te.TaskId = t.Id
                LEFT JOIN Users u ON te.UserId = u.Id
                WHERE t.ProjectId = p.Id
                  AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)
              ) AS CostSpent,
              COALESCE(p.BudgetType, 'monetary') AS BudgetType,
              (SELECT COUNT(*) FROM Tasks t
                LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
                WHERE t.ProjectId = p.Id AND COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
                  AND t.DueDate IS NOT NULL AND t.DueDate < CURRENT_TIMESTAMP) AS HealthOverdueTasks,
              (SELECT COUNT(*) FROM Tasks t WHERE t.ProjectId = p.Id) AS HealthTotalTasks,
              (SELECT COUNT(*) FROM Tasks t
                WHERE t.ProjectId = p.Id AND t.AssignedTo IS NULL
                  AND NOT EXISTS (SELECT 1 FROM TaskAssignees ta WHERE ta.TaskId = t.Id)) AS HealthUnassignedTasks,
              0 AS OverdueMilestones,
              0 AS UpcomingMilestonesSoon,
              NULL AS NextOpenMilestoneDueDate,
              (SELECT COUNT(*) FROM Sprints s WHERE s.ProjectId = p.Id AND s.Status = 'active') AS ActiveSprintCount,
              (SELECT COUNT(*) FROM Sprints s WHERE s.ProjectId = p.Id AND s.Status = 'active'
                AND s.EndDate IS NOT NULL AND s.EndDate < CURRENT_TIMESTAMP) AS OverdueActiveSprints,
              (SELECT MIN(s.EndDate) FROM Sprints s WHERE s.ProjectId = p.Id AND s.Status = 'active') AS ActiveSprintEndDate
       FROM Projects p
       LEFT JOIN ProjectStatusValues ps ON p.Status = ps.Id
       WHERE p.OrganizationId = ?${projectFilter}`,
      baseParams
    );

    const withHealth = projects.map((project) => {
      const hoursSpent = Number(project.HoursSpent || 0);
      const costSpent = Number(project.CostSpent || 0);
      const budgetType = String(project.BudgetType || 'monetary');
      const typedBudgetSpent = budgetType === 'hours' ? hoursSpent : costSpent;
      const health = computeProjectHealth({
        isClosed: project.StatusIsClosed,
        isCancelled: project.StatusIsCancelled,
        canViewBudgetInfo: access.canViewBudgetInfo,
        budget: project.Budget,
        budgetSpent: typedBudgetSpent,
        endDate: project.EndDate,
        overdueTasks: project.HealthOverdueTasks,
        totalTasks: project.HealthTotalTasks,
        unassignedTasks: project.HealthUnassignedTasks,
        overdueMilestones: project.OverdueMilestones,
        upcomingMilestonesSoon: project.UpcomingMilestonesSoon,
        nextOpenMilestoneDueDate: project.NextOpenMilestoneDueDate,
        activeSprintCount: project.ActiveSprintCount,
        overdueActiveSprints: project.OverdueActiveSprints,
        activeSprintEndDate: project.ActiveSprintEndDate,
      });
      return {
        id: Number(project.Id),
        name: String(project.ProjectName || ''),
        healthStatus: health.status,
        healthReasons: health.reasons,
        overdueTasks: Number(project.HealthOverdueTasks || 0),
        totalTasks: Number(project.HealthTotalTasks || 0),
        unassignedTasks: Number(project.HealthUnassignedTasks || 0),
        budgetType,
        budget: access.canViewBudgetInfo ? Number(project.Budget || 0) : null,
        budgetSpent: access.canViewBudgetInfo ? typedBudgetSpent : null,
      };
    });

    const healthCounts = { green: 0, amber: 0, red: 0 };
    withHealth.forEach((p) => {
      healthCounts[p.healthStatus] += 1;
    });

    const taskParams: Array<number | string> = [organizationId];
    let taskProjectSql = '';
    if (projectId) {
      taskProjectSql = ' AND t.ProjectId = ?';
      taskParams.push(projectId);
    }

    const [openClosed] = await pool.execute<RowDataPacket[]>(
      `SELECT
         SUM(CASE WHEN COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0 THEN 1 ELSE 0 END) AS OpenTasks,
         SUM(CASE WHEN COALESCE(tsv.IsClosed,0)=1 OR COALESCE(tsv.IsCancelled,0)=1 THEN 1 ELSE 0 END) AS ClosedTasks,
         SUM(CASE WHEN COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
           AND t.DueDate IS NOT NULL AND t.DueDate < CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS OverdueTasks,
         SUM(CASE WHEN COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
           AND (t.EstimatedHours IS NULL OR t.EstimatedHours = 0)
           AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id) THEN 1 ELSE 0 END) AS UnestimatedLeafTasks,
         SUM(CASE WHEN COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
           AND t.AssignedTo IS NULL
           AND NOT EXISTS (SELECT 1 FROM TaskAssignees ta WHERE ta.TaskId = t.Id) THEN 1 ELSE 0 END) AS UnassignedTasks
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE p.OrganizationId = ?${taskProjectSql}`,
      taskParams
    );

    const hoursParamsCurrent: Array<number | string> = [organizationId, from, to];
    const hoursParamsPrev: Array<number | string> = [organizationId, prev.from, prev.to];
    let hoursProjectSql = '';
    if (projectId) {
      hoursProjectSql = ' AND t.ProjectId = ?';
      hoursParamsCurrent.push(projectId);
      hoursParamsPrev.push(projectId);
    }

    const [loggedCurrent] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(te.Hours), 0) AS Hours
       FROM TimeEntries te
       INNER JOIN Tasks t ON te.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE p.OrganizationId = ? AND te.WorkDate >= ? AND te.WorkDate <= ?${hoursProjectSql}
         AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)`,
      hoursParamsCurrent
    );
    const [loggedPrevious] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(te.Hours), 0) AS Hours
       FROM TimeEntries te
       INNER JOIN Tasks t ON te.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE p.OrganizationId = ? AND te.WorkDate >= ? AND te.WorkDate <= ?${hoursProjectSql}
         AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)`,
      hoursParamsPrev
    );

    const [estimatedLeaf] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(COALESCE(t.EstimatedHours, 0)), 0) AS Hours
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE p.OrganizationId = ?${taskProjectSql}
         AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)`,
      taskParams
    );

    const topProjectParams: Array<number | string> = [organizationId, from, to];
    if (projectId) topProjectParams.push(projectId);
    const [topProjects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.ProjectName, COALESCE(SUM(te.Hours), 0) AS Hours
       FROM TimeEntries te
       INNER JOIN Tasks t ON te.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE p.OrganizationId = ? AND te.WorkDate >= ? AND te.WorkDate <= ?${hoursProjectSql}
       GROUP BY p.Id, p.ProjectName
       ORDER BY Hours DESC`,
      topProjectParams
    );

    const [activeSprints] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Cnt
       FROM Sprints s
       INNER JOIN Projects p ON s.ProjectId = p.Id
       WHERE p.OrganizationId = ? AND s.Status = 'active'${projectId ? ' AND p.Id = ?' : ''}`,
      projectId ? [organizationId, projectId] : [organizationId]
    );

    const [completedInPeriod] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Cnt
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE p.OrganizationId = ?${taskProjectSql}
         AND COALESCE(tsv.IsClosed, 0) = 1
         AND t.UpdatedAt >= ? AND t.UpdatedAt < ?`,
      [...taskParams, `${from} 00:00:00`, `${to} 23:59:59.999`]
    );

    const [completedPrev] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Cnt
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE p.OrganizationId = ?${taskProjectSql}
         AND COALESCE(tsv.IsClosed, 0) = 1
         AND t.UpdatedAt >= ? AND t.UpdatedAt < ?`,
      [...taskParams, `${prev.from} 00:00:00`, `${prev.to} 23:59:59.999`]
    );

    const plannedParamsCurrent: Array<number | string> = [organizationId, from, to];
    const plannedParamsPrev: Array<number | string> = [organizationId, prev.from, prev.to];
    if (projectId) {
      plannedParamsCurrent.push(projectId);
      plannedParamsPrev.push(projectId);
    }
    const [plannedCurrent] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(ta.AllocatedHours), 0) AS Hours
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE p.OrganizationId = ? AND ta.AllocationDate >= ? AND ta.AllocationDate <= ?${hoursProjectSql}`,
      plannedParamsCurrent
    );
    const [plannedPrevious] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(ta.AllocatedHours), 0) AS Hours
       FROM TaskAllocations ta
       INNER JOIN Tasks t ON ta.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE p.OrganizationId = ? AND ta.AllocationDate >= ? AND ta.AllocationDate <= ?${hoursProjectSql}`,
      plannedParamsPrev
    );

    const [taskHoursSplit] = await pool.execute<RowDataPacket[]>(
      `SELECT
         SUM(CASE WHEN COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
           AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)
           AND COALESCE(t.EstimatedHours, 0) > 0 THEN 1 ELSE 0 END) AS LeafWithHours,
         SUM(CASE WHEN COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
           AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)
           AND COALESCE(t.EstimatedHours, 0) = 0 THEN 1 ELSE 0 END) AS LeafWithoutHours,
         SUM(CASE WHEN COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
           AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)
           AND COALESCE(t.UnscheduledWork, 0) = 1 THEN 1 ELSE 0 END) AS UnscheduledLeaf,
         SUM(CASE WHEN COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
           AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)
           AND COALESCE(t.UnscheduledWork, 0) = 0 THEN 1 ELSE 0 END) AS ScheduledLeaf
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE p.OrganizationId = ?${taskProjectSql}`,
      taskParams
    );

    const openTasks = Number(openClosed[0]?.OpenTasks || 0);
    const closedTasks = Number(openClosed[0]?.ClosedTasks || 0);
    const overdueTasks = Number(openClosed[0]?.OverdueTasks || 0);
    const logged = deltaMetric(Number(loggedCurrent[0]?.Hours || 0), Number(loggedPrevious[0]?.Hours || 0));
    const planned = deltaMetric(Number(plannedCurrent[0]?.Hours || 0), Number(plannedPrevious[0]?.Hours || 0));
    const throughput = deltaMetric(
      Number(completedInPeriod[0]?.Cnt || 0),
      Number(completedPrev[0]?.Cnt || 0)
    );

    const [snapshots] = await pool.execute<RowDataPacket[]>(
      `SELECT SnapshotDate, HealthStatus, COUNT(*) AS Cnt
       FROM ProjectHealthSnapshots
       WHERE OrganizationId = ?
         AND SnapshotDate >= ?
         AND SnapshotDate <= ?
         ${projectId ? 'AND ProjectId = ?' : ''}
       GROUP BY SnapshotDate, HealthStatus
       ORDER BY SnapshotDate`,
      projectId ? [organizationId, from, to, projectId] : [organizationId, from, to]
    ).catch(() => [[] as RowDataPacket[]]);

    const trendByDate = new Map<string, { date: string; green: number; amber: number; red: number }>();
    for (const row of snapshots) {
      const date = String(row.SnapshotDate).slice(0, 10);
      if (!trendByDate.has(date)) {
        trendByDate.set(date, { date, green: 0, amber: 0, red: 0 });
      }
      const bucket = trendByDate.get(date)!;
      const status = String(row.HealthStatus || '').toLowerCase();
      if (status === 'green' || status === 'amber' || status === 'red') {
        bucket[status] += Number(row.Cnt || 0);
      }
    }

    return res.json({
      success: true,
      data: {
        period: { from, to, previous: prev },
        organizationId,
        projectId,
        health: {
          counts: healthCounts,
          projectCount: withHealth.length,
          projects: withHealth,
        },
        tasks: {
          open: openTasks,
          closed: closedTasks,
          overdue: overdueTasks,
          unestimatedLeaf: Number(openClosed[0]?.UnestimatedLeafTasks || 0),
          unassigned: Number(openClosed[0]?.UnassignedTasks || 0),
          leafWithHours: Number(taskHoursSplit[0]?.LeafWithHours || 0),
          leafWithoutHours: Number(taskHoursSplit[0]?.LeafWithoutHours || 0),
          unscheduledLeaf: Number(taskHoursSplit[0]?.UnscheduledLeaf || 0),
          scheduledLeaf: Number(taskHoursSplit[0]?.ScheduledLeaf || 0),
        },
        effort: {
          estimatedLeafHours: Number(estimatedLeaf[0]?.Hours || 0),
          loggedHours: logged,
          plannedHours: planned,
          topProjects: topProjects.slice(0, 8).map((row) => ({
            id: Number(row.Id),
            name: String(row.ProjectName || ''),
            hours: Number(row.Hours || 0),
          })),
        },
        delivery: {
          throughput,
          activeSprints: Number(activeSprints[0]?.Cnt || 0),
        },
        risk: {
          overdueTasks,
          unestimatedLeaf: Number(openClosed[0]?.UnestimatedLeafTasks || 0),
          unassigned: Number(openClosed[0]?.UnassignedTasks || 0),
          redProjects: healthCounts.red,
          amberProjects: healthCounts.amber,
        },
        charts: {
          rag: [
            { key: 'green', label: 'Green', value: healthCounts.green, color: '#16a34a' },
            { key: 'amber', label: 'Amber', value: healthCounts.amber, color: '#d97706' },
            { key: 'red', label: 'Red', value: healthCounts.red, color: '#dc2626' },
          ],
          hoursCompare: [
            { key: 'planned', label: 'Planned', current: planned.current, previous: planned.previous },
            { key: 'logged', label: 'Logged', current: logged.current, previous: logged.previous },
          ],
          topProjects: topProjects.slice(0, 8).map((row) => ({
            id: Number(row.Id),
            name: String(row.ProjectName || ''),
            hours: Number(row.Hours || 0),
          })),
          throughput: [
            { key: 'current', label: 'This period', value: throughput.current },
            { key: 'previous', label: 'Previous', value: throughput.previous },
          ],
          openVsOverdue: [
            { key: 'open', label: 'Open', value: openTasks, color: '#2563eb' },
            { key: 'overdue', label: 'Overdue', value: overdueTasks, color: '#dc2626' },
          ],
          taskHours: [
            { key: 'withHours', label: 'With estimate', value: Number(taskHoursSplit[0]?.LeafWithHours || 0), color: '#059669' },
            { key: 'withoutHours', label: 'No estimate', value: Number(taskHoursSplit[0]?.LeafWithoutHours || 0), color: '#9ca3af' },
          ],
          schedule: [
            { key: 'scheduled', label: 'Scheduled', value: Number(taskHoursSplit[0]?.ScheduledLeaf || 0), color: '#2563eb' },
            { key: 'unscheduled', label: 'Unscheduled', value: Number(taskHoursSplit[0]?.UnscheduledLeaf || 0), color: '#ea580c' },
          ],
          ragTrend: Array.from(trendByDate.values()),
        },
        healthTrend: snapshots,
      },
    });
  } catch (error) {
    logger.error('Organization overview error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load organization overview' });
  }
});

router.get('/data-quality', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const access = await requireManagerAccess(req, res);
    if (!access) return;

    const organizationId = Number(req.query.organizationId || 0);
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId is required' });
    }
    if (!(await userBelongsToOrganization(access.userId, organizationId)) && !access.isAdmin) {
      return res.status(403).json({ success: false, message: 'Not a member of this organization' });
    }

    const staleDays = Math.min(90, Math.max(1, Number(req.query.staleDays || 7)));
    const projectId = Number(req.query.projectId || 0) || null;
    const projectSql = projectId ? ' AND t.ProjectId = ?' : '';
    const params: Array<number | string> = [organizationId];
    if (projectId) params.push(projectId);

    const [unestimated] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.TaskName, t.ProjectId, p.ProjectName, t.EstimatedHours
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE p.OrganizationId = ?${projectSql}
         AND COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
         AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)
         AND (t.EstimatedHours IS NULL OR t.EstimatedHours = 0)
       ORDER BY p.ProjectName, t.TaskName`,
      params
    );

    const [unassigned] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.TaskName, t.ProjectId, p.ProjectName
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE p.OrganizationId = ?${projectSql}
         AND COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
         AND t.AssignedTo IS NULL
         AND NOT EXISTS (SELECT 1 FROM TaskAssignees ta WHERE ta.TaskId = t.Id)
       ORDER BY p.ProjectName, t.TaskName`,
      params
    );

    const [noSprint] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.TaskName, t.ProjectId, p.ProjectName
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE p.OrganizationId = ?${projectSql}
         AND COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
         AND t.SprintId IS NULL
         AND EXISTS (SELECT 1 FROM Sprints s WHERE s.ProjectId = p.Id)
       ORDER BY p.ProjectName, t.TaskName`,
      params
    );

    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - staleDays);
    const staleCutoffStr = staleCutoff.toISOString().slice(0, 10);

    const [staleOverdue] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.TaskName, t.ProjectId, p.ProjectName, t.DueDate, t.UpdatedAt
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE p.OrganizationId = ?${projectSql}
         AND COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
         AND t.DueDate IS NOT NULL AND t.DueDate < CURRENT_TIMESTAMP
         AND t.UpdatedAt < ?
         AND NOT EXISTS (
           SELECT 1 FROM TimeEntries te
           WHERE te.TaskId = t.Id AND te.WorkDate >= ?
         )
       ORDER BY t.DueDate`,
      projectId
        ? [organizationId, projectId, `${staleCutoffStr} 00:00:00`, staleCutoffStr]
        : [organizationId, `${staleCutoffStr} 00:00:00`, staleCutoffStr]
    );

    const approvalParams: Array<number | string> = [organizationId];
    if (projectId) approvalParams.push(projectId);
    const [pendingApprovals] = await pool.execute<RowDataPacket[]>(
      `SELECT te.Id, te.Hours, te.WorkDate, te.UserId, u.Username,
              t.Id AS TaskId, t.TaskName, p.Id AS ProjectId, p.ProjectName
       FROM TimeEntries te
       INNER JOIN Tasks t ON te.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN Users u ON te.UserId = u.Id
       WHERE p.OrganizationId = ?${projectId ? ' AND p.Id = ?' : ''}
         AND te.ApprovalStatus = 'pending'
       ORDER BY te.WorkDate DESC`,
      approvalParams
    );

    return res.json({
      success: true,
      data: {
        organizationId,
        projectId,
        staleDays,
        unestimated,
        unassigned,
        noSprint,
        staleOverdue,
        pendingApprovals,
      },
    });
  } catch (error) {
    logger.error('Data quality error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load data quality report' });
  }
});

router.get('/portfolio', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const access = await requireManagerAccess(req, res);
    if (!access) return;
    const organizationId = Number(req.query.organizationId || 0);
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId is required' });
    }
    if (!(await userBelongsToOrganization(access.userId, organizationId)) && !access.isAdmin) {
      return res.status(403).json({ success: false, message: 'Not a member of this organization' });
    }

    // keep a thin dedicated payload for the Portfolio tab.
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.ProjectName, p.Budget, p.BudgetType, p.EndDate, p.StartDate,
              COALESCE(ps.IsClosed, 0) AS StatusIsClosed,
              COALESCE(ps.IsCancelled, 0) AS StatusIsCancelled,
              ps.StatusName,
              (SELECT COALESCE(SUM(te.Hours), 0) FROM TimeEntries te
                INNER JOIN Tasks t ON te.TaskId = t.Id WHERE t.ProjectId = p.Id
                AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)) AS LoggedHours,
              (SELECT COALESCE(SUM(te.Hours * COALESCE(t.HourlyRate, p.HourlyRate, u.HourlyRate, 0)), 0)
                FROM TimeEntries te
                INNER JOIN Tasks t ON te.TaskId = t.Id
                LEFT JOIN Users u ON te.UserId = u.Id
                WHERE t.ProjectId = p.Id
                  AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)) AS CostSpent,
              (SELECT COALESCE(SUM(CASE WHEN COALESCE(t.HourlyRate, p.HourlyRate, u.HourlyRate, 0) = 0 THEN te.Hours ELSE 0 END), 0)
                FROM TimeEntries te
                INNER JOIN Tasks t ON te.TaskId = t.Id
                LEFT JOIN Users u ON te.UserId = u.Id
                WHERE t.ProjectId = p.Id
                  AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)) AS HoursWithoutRate,
              (SELECT COALESCE(SUM(COALESCE(t.EstimatedHours, 0)), 0) FROM Tasks t WHERE t.ProjectId = p.Id
                AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)) AS EstimatedHours,
              (SELECT COUNT(*) FROM Tasks t LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
                WHERE t.ProjectId = p.Id AND COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0
                AND t.DueDate IS NOT NULL AND t.DueDate < CURRENT_TIMESTAMP) AS HealthOverdueTasks,
              (SELECT COUNT(*) FROM Tasks t WHERE t.ProjectId = p.Id) AS HealthTotalTasks,
              (SELECT COUNT(*) FROM Tasks t WHERE t.ProjectId = p.Id AND t.AssignedTo IS NULL
                AND NOT EXISTS (SELECT 1 FROM TaskAssignees ta WHERE ta.TaskId = t.Id)) AS HealthUnassignedTasks,
              (SELECT COUNT(*) FROM Tasks t LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
                WHERE t.ProjectId = p.Id AND COALESCE(tsv.IsClosed,0)=0 AND COALESCE(tsv.IsCancelled,0)=0) AS OpenTasks,
              0 AS OverdueMilestones, 0 AS UpcomingMilestonesSoon, NULL AS NextOpenMilestoneDueDate,
              (SELECT COUNT(*) FROM Sprints s WHERE s.ProjectId = p.Id AND s.Status = 'active') AS ActiveSprintCount,
              (SELECT COUNT(*) FROM Sprints s WHERE s.ProjectId = p.Id AND s.Status = 'active'
                AND s.EndDate IS NOT NULL AND s.EndDate < CURRENT_TIMESTAMP) AS OverdueActiveSprints,
              (SELECT MIN(s.EndDate) FROM Sprints s WHERE s.ProjectId = p.Id AND s.Status = 'active') AS ActiveSprintEndDate,
              (SELECT COUNT(*) FROM Tasks t LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
                WHERE t.ProjectId = p.Id AND (COALESCE(tsv.IsClosed,0)=1 OR COALESCE(tsv.IsCancelled,0)=1)) AS CompletedTasks
       FROM Projects p
       LEFT JOIN ProjectStatusValues ps ON p.Status = ps.Id
       WHERE p.OrganizationId = ?
       ORDER BY p.ProjectName`,
      [organizationId]
    );

    const [leafTasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ProjectId, t.TaskName, t.DueDate, t.EstimatedHours,
              COALESCE(tsv.StatusName, '') AS StatusName,
              COALESCE(tsv.IsClosed, 0) AS StatusIsClosed,
              COALESCE(tsv.IsCancelled, 0) AS StatusIsCancelled,
              CASE
                WHEN COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0
                 AND t.DueDate IS NOT NULL AND t.DueDate < CURRENT_TIMESTAMP THEN 1
                ELSE 0
              END AS IsOverdue,
              COALESCE(u.Username, '') AS AssigneeName,
              COALESCE((
                SELECT SUM(te.Hours) FROM TimeEntries te WHERE te.TaskId = t.Id
              ), 0) AS LoggedHours,
              COALESCE((
                SELECT SUM(te.Hours * COALESCE(t.HourlyRate, p.HourlyRate, u2.HourlyRate, 0))
                FROM TimeEntries te
                LEFT JOIN Users u2 ON te.UserId = u2.Id
                WHERE te.TaskId = t.Id
              ), 0) AS CostSpent,
              COALESCE((
                SELECT SUM(CASE WHEN COALESCE(t.HourlyRate, p.HourlyRate, u2.HourlyRate, 0) = 0 THEN te.Hours ELSE 0 END)
                FROM TimeEntries te
                LEFT JOIN Users u2 ON te.UserId = u2.Id
                WHERE te.TaskId = t.Id
              ), 0) AS HoursWithoutRate,
              COALESCE((
                SELECT SUM(ta.AllocatedHours) FROM TaskAllocations ta WHERE ta.TaskId = t.Id
              ), 0) AS PlannedHours
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN Users u ON t.AssignedTo = u.Id
       WHERE p.OrganizationId = ?
         AND NOT EXISTS (SELECT 1 FROM Tasks c WHERE c.ParentTaskId = t.Id)
       ORDER BY IsOverdue DESC, t.TaskName`,
      [organizationId]
    );

    const tasksByProject = new Map<number, Array<{
      id: number;
      name: string;
      statusName: string;
      isClosed: boolean;
      isOverdue: boolean;
      dueDate: string | null;
      assigneeName: string | null;
      estimatedHours: number;
      loggedHours: number;
      plannedHours: number;
      varianceHours: number;
      costSpent: number;
      hoursWithoutRate: number;
    }>>();

    for (const task of leafTasks) {
      const projectId = Number(task.ProjectId);
      const estimatedHours = Number(task.EstimatedHours || 0);
      const loggedHours = Number(task.LoggedHours || 0);
      const entry = {
        id: Number(task.Id),
        name: String(task.TaskName || ''),
        statusName: String(task.StatusName || ''),
        isClosed: Number(task.StatusIsClosed || 0) === 1 || Number(task.StatusIsCancelled || 0) === 1,
        isOverdue: Number(task.IsOverdue || 0) === 1,
        dueDate: task.DueDate ? String(task.DueDate).slice(0, 10) : null,
        assigneeName: task.AssigneeName ? String(task.AssigneeName) : null,
        estimatedHours,
        loggedHours,
        plannedHours: Number(task.PlannedHours || 0),
        varianceHours: loggedHours - estimatedHours,
        costSpent: Number(task.CostSpent || 0),
        hoursWithoutRate: Number(task.HoursWithoutRate || 0),
      };
      const list = tasksByProject.get(projectId) || [];
      list.push(entry);
      tasksByProject.set(projectId, list);
    }

    const rows = projects.map((project) => {
      const loggedHours = Number(project.LoggedHours || 0);
      const costSpent = Number(project.CostSpent || 0);
      const hoursWithoutRate = Number(project.HoursWithoutRate || 0);
      const budgetType = String(project.BudgetType || 'monetary');
      const typedBudgetSpent = budgetType === 'hours' ? loggedHours : costSpent;
      const budgetTotal = project.Budget != null ? Number(project.Budget) : null;
      const budgetRemaining =
        budgetTotal != null && Number.isFinite(budgetTotal) ? budgetTotal - typedBudgetSpent : null;
      const budgetBurnPct =
        budgetTotal != null && budgetTotal > 0
          ? Math.round((typedBudgetSpent / budgetTotal) * 100)
          : null;
      const health = computeProjectHealth({
        isClosed: project.StatusIsClosed,
        isCancelled: project.StatusIsCancelled,
        canViewBudgetInfo: access.canViewBudgetInfo,
        budget: project.Budget,
        budgetSpent: typedBudgetSpent,
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
      const total = Number(project.HealthTotalTasks || 0);
      const completed = Number(project.CompletedTasks || 0);
      const projectId = Number(project.Id);
      return {
        id: projectId,
        name: String(project.ProjectName || ''),
        statusName: project.StatusName || null,
        healthStatus: health.status,
        healthReasons: health.reasons,
        overdueTasks: Number(project.HealthOverdueTasks || 0),
        openTasks: Number(project.OpenTasks || 0),
        totalTasks: total,
        completedTasks: completed,
        progressPct: total > 0 ? Math.round((completed / total) * 100) : 0,
        estimatedHours: Number(project.EstimatedHours || 0),
        loggedHours,
        costSpent,
        hoursWithoutRate,
        budgetType,
        budget: access.canViewBudgetInfo ? budgetTotal : null,
        budgetSpent: access.canViewBudgetInfo ? typedBudgetSpent : null,
        budgetRemaining: access.canViewBudgetInfo ? budgetRemaining : null,
        budgetBurnPct: access.canViewBudgetInfo ? budgetBurnPct : null,
        endDate: project.EndDate || null,
        tasks: tasksByProject.get(projectId) || [],
      };
    });

    return res.json({ success: true, data: { organizationId, projects: rows } });
  } catch (error) {
    logger.error('Portfolio reporting error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load portfolio' });
  }
});

router.get('/delivery', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const access = await requireManagerAccess(req, res);
    if (!access) return;
    const organizationId = Number(req.query.organizationId || 0);
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId is required' });
    }
    if (!(await userBelongsToOrganization(access.userId, organizationId)) && !access.isAdmin) {
      return res.status(403).json({ success: false, message: 'Not a member of this organization' });
    }

    const defaults = defaultDateRange();
    const from = parseDateOnly(req.query.from) || defaults.from;
    const to = parseDateOnly(req.query.to) || defaults.to;
    const prev = previousPeriod(from, to);
    const projectId = Number(req.query.projectId || 0) || null;
    const projectSql = projectId ? ' AND p.Id = ?' : '';
    const params: Array<number | string> = [organizationId];
    if (projectId) params.push(projectId);

    const [closedCurrent] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Cnt
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE p.OrganizationId = ?${projectSql}
         AND COALESCE(tsv.IsClosed, 0) = 1
         AND t.UpdatedAt >= ? AND t.UpdatedAt <= ?`,
      [...params, `${from} 00:00:00`, `${to} 23:59:59.999`]
    );
    const [closedPrev] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Cnt
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE p.OrganizationId = ?${projectSql}
         AND COALESCE(tsv.IsClosed, 0) = 1
         AND t.UpdatedAt >= ? AND t.UpdatedAt <= ?`,
      [...params, `${prev.from} 00:00:00`, `${prev.to} 23:59:59.999`]
    );

    const [createdCurrent] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Cnt
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE p.OrganizationId = ?${projectSql}
         AND t.CreatedAt >= ? AND t.CreatedAt <= ?`,
      [...params, `${from} 00:00:00`, `${to} 23:59:59.999`]
    );

    const [activeSprints] = await pool.execute<RowDataPacket[]>(
      `SELECT s.Id, s.Name AS SprintName, s.StartDate, s.EndDate, s.Status, p.Id AS ProjectId, p.ProjectName,
              (SELECT COUNT(*) FROM Tasks t WHERE t.SprintId = s.Id) AS TaskCount,
              (SELECT COUNT(*) FROM Tasks t
                LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
                WHERE t.SprintId = s.Id AND COALESCE(tsv.IsClosed,0)=1) AS ClosedTaskCount
       FROM Sprints s
       INNER JOIN Projects p ON s.ProjectId = p.Id
       WHERE p.OrganizationId = ?${projectSql} AND s.Status = 'active'
       ORDER BY s.EndDate ASC`,
      params
    );

    const [recentlyClosed] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ProjectId, t.TaskName, t.UpdatedAt, p.ProjectName
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE p.OrganizationId = ?${projectSql}
         AND COALESCE(tsv.IsClosed, 0) = 1
         AND t.UpdatedAt >= ? AND t.UpdatedAt <= ?
       ORDER BY t.UpdatedAt DESC
       LIMIT 25`,
      [...params, `${from} 00:00:00`, `${to} 23:59:59.999`]
    );

    const throughput = deltaMetric(Number(closedCurrent[0]?.Cnt || 0), Number(closedPrev[0]?.Cnt || 0));

    return res.json({
      success: true,
      data: {
        organizationId,
        projectId,
        period: { from, to, previous: prev },
        throughput,
        tasksCreated: Number(createdCurrent[0]?.Cnt || 0),
        activeSprints: activeSprints.map((s) => ({
          id: Number(s.Id),
          name: String(s.SprintName || ''),
          projectId: Number(s.ProjectId),
          projectName: String(s.ProjectName || ''),
          startDate: s.StartDate ? String(s.StartDate).slice(0, 10) : null,
          endDate: s.EndDate ? String(s.EndDate).slice(0, 10) : null,
          taskCount: Number(s.TaskCount || 0),
          closedTaskCount: Number(s.ClosedTaskCount || 0),
        })),
        recentlyClosed: recentlyClosed.map((t) => ({
          id: Number(t.Id),
          projectId: Number(t.ProjectId),
          name: String(t.TaskName || ''),
          projectName: String(t.ProjectName || ''),
          closedAt: t.UpdatedAt ? String(t.UpdatedAt).slice(0, 10) : null,
        })),
      },
    });
  } catch (error) {
    logger.error('Delivery reporting error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load delivery' });
  }
});

router.get('/capacity', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const hub = await requireHubAccess(req, res);
    if (!hub) return;
    if (!canAccessCapacityReporting(hub)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const organizationId = Number(req.query.organizationId || 0);
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId is required' });
    }
    if (!(await userBelongsToOrganization(hub.userId, organizationId)) && !hub.isAdmin) {
      return res.status(403).json({ success: false, message: 'Not a member of this organization' });
    }

    const defaults = defaultDateRange();
    const from = parseDateOnly(req.query.from) || defaults.from;
    const to = parseDateOnly(req.query.to) || defaults.to;

    const [byUser] = await pool.execute<RowDataPacket[]>(
      `SELECT u.Id AS UserId, u.Username, u.FirstName, u.LastName,
              COALESCE(u.WorkHoursMonday, 0) AS WorkHoursMonday,
              COALESCE(u.WorkHoursTuesday, 0) AS WorkHoursTuesday,
              COALESCE(u.WorkHoursWednesday, 0) AS WorkHoursWednesday,
              COALESCE(u.WorkHoursThursday, 0) AS WorkHoursThursday,
              COALESCE(u.WorkHoursFriday, 0) AS WorkHoursFriday,
              COALESCE(u.WorkHoursSaturday, 0) AS WorkHoursSaturday,
              COALESCE(u.WorkHoursSunday, 0) AS WorkHoursSunday,
              COALESCE((
                SELECT SUM(ta.AllocatedHours) FROM TaskAllocations ta
                INNER JOIN Tasks t ON ta.TaskId = t.Id
                INNER JOIN Projects p ON t.ProjectId = p.Id
                WHERE ta.UserId = u.Id AND p.OrganizationId = ?
                  AND ta.AllocationDate >= ? AND ta.AllocationDate <= ?
              ), 0) AS PlannedHours,
              COALESCE((
                SELECT SUM(te.Hours) FROM TimeEntries te
                INNER JOIN Tasks t ON te.TaskId = t.Id
                INNER JOIN Projects p ON t.ProjectId = p.Id
                WHERE te.UserId = u.Id AND p.OrganizationId = ?
                  AND te.WorkDate >= ? AND te.WorkDate <= ?
              ), 0) AS LoggedHours
       FROM Users u
       INNER JOIN OrganizationMembers om ON om.UserId = u.Id
       WHERE om.OrganizationId = ?
       ORDER BY LoggedHours DESC, u.Username`,
      [organizationId, from, to, organizationId, from, to, organizationId]
    );

    const capacityHoursForRange = (row: RowDataPacket): number => {
      const byDow = [
        Number(row.WorkHoursSunday || 0),
        Number(row.WorkHoursMonday || 0),
        Number(row.WorkHoursTuesday || 0),
        Number(row.WorkHoursWednesday || 0),
        Number(row.WorkHoursThursday || 0),
        Number(row.WorkHoursFriday || 0),
        Number(row.WorkHoursSaturday || 0),
      ];
      let total = 0;
      const cursor = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T00:00:00`);
      while (cursor <= end) {
        total += byDow[cursor.getDay()] || 0;
        cursor.setDate(cursor.getDate() + 1);
      }
      return total;
    };

    const [pendingCount] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Cnt
       FROM TimeEntries te
       INNER JOIN Tasks t ON te.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE p.OrganizationId = ? AND te.ApprovalStatus = 'pending'`,
      [organizationId]
    );

    return res.json({
      success: true,
      data: {
        organizationId,
        period: { from, to },
        byUser: byUser.map((row) => {
          const capacityHours = capacityHoursForRange(row);
          const plannedHours = Number(row.PlannedHours || 0);
          const loggedHours = Number(row.LoggedHours || 0);
          return {
            userId: Number(row.UserId),
            username: row.Username,
            displayName: [row.FirstName, row.LastName].filter(Boolean).join(' ') || row.Username,
            capacityHours,
            plannedHours,
            loggedHours,
            utilizationPct: capacityHours > 0 ? Math.round((loggedHours / capacityHours) * 100) : null,
            planVsCapacityPct: capacityHours > 0 ? Math.round((plannedHours / capacityHours) * 100) : null,
          };
        }),
        pendingApprovals: Number(pendingCount[0]?.Cnt || 0),
      },
    });
  } catch (error) {
    logger.error('Capacity reporting error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load capacity' });
  }
});

router.get('/digests', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const access = await requireManagerAccess(req, res);
    if (!access) return;
    const organizationId = Number(req.query.organizationId || 0);
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId is required' });
    }
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM OrganizationReportDigests WHERE OrganizationId = ? ORDER BY Id DESC`,
      [organizationId]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('List digests error:', error);
    return res.status(500).json({ success: false, message: 'Failed to list digests' });
  }
});

router.post('/digests', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const access = await requireManagerAccess(req, res);
    if (!access) return;
    const organizationId = Number(req.body.organizationId || 0);
    const frequency = req.body.frequency === 'monthly' ? 'monthly' : 'weekly';
    const recipients = String(req.body.recipients || '').trim();
    if (!organizationId || !recipients) {
      return res.status(400).json({ success: false, message: 'organizationId and recipients are required' });
    }
    if (!(await userBelongsToOrganization(access.userId, organizationId)) && !access.isAdmin) {
      return res.status(403).json({ success: false, message: 'Not a member of this organization' });
    }
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO OrganizationReportDigests
        (OrganizationId, Frequency, DayOfWeek, DayOfMonth, Recipients, IsActive, CreatedBy, CreatedAt, UpdatedAt)
       VALUES (?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        organizationId,
        frequency,
        frequency === 'weekly' ? Number(req.body.dayOfWeek ?? 1) : null,
        frequency === 'monthly' ? Number(req.body.dayOfMonth ?? 1) : null,
        recipients,
        access.userId,
      ]
    );
    return res.json({ success: true, data: { id: result.insertId }, message: 'Digest schedule created' });
  } catch (error) {
    logger.error('Create digest error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create digest schedule' });
  }
});

router.delete('/digests/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const access = await requireManagerAccess(req, res);
    if (!access) return;
    const id = Number(req.params.id);
    await pool.execute(`DELETE FROM OrganizationReportDigests WHERE Id = ?`, [id]);
    return res.json({ success: true, message: 'Digest schedule deleted' });
  } catch (error) {
    logger.error('Delete digest error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete digest schedule' });
  }
});

export default router;
