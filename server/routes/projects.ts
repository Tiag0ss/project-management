import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { createNotification } from './notifications';
import { logActivity } from './activityLogs';
import { logProjectHistory } from '../utils/changeLog';
import { prepareCustomFieldData } from '../utils/customFields';
import { computeProjectHealth } from '../utils/projectHealth';

const router = Router();

const normalizeBudgetType = (value: unknown): 'monetary' | 'hours' => {
  return value === 'hours' ? 'hours' : 'monetary';
};

const resolveCanViewBudgetInfo = async (userId: number): Promise<boolean> => {
  const [users] = await pool.execute<RowDataPacket[]>(
    'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
    [userId]
  );

  if (!users.length) {
    return false;
  }

  const user = users[0];
  if (Number(user.isAdmin || 0) === 1) {
    return true;
  }

  const roles: string[] = [];
  if (Number(user.IsDeveloper || 0) === 1) roles.push('Developer');
  if (Number(user.IsSupport || 0) === 1) roles.push('Support');
  if (Number(user.IsManager || 0) === 1) roles.push('Manager');

  let canViewBudgetInfo = false;

  if (roles.length > 0) {
    const placeholders = roles.map(() => '?').join(',');
    const [rolePerms] = await pool.execute<RowDataPacket[]>(
      `SELECT CanViewBudgetInfo FROM RolePermissions WHERE RoleName IN (${placeholders})`,
      roles
    );

    rolePerms.forEach((perm) => {
      if (Number(perm.CanViewBudgetInfo || 0) === 1) {
        canViewBudgetInfo = true;
      }
    });
  }

  const [orgGroupPerms] = await pool.execute<RowDataPacket[]>(
    `SELECT pg.CanViewBudgetInfo
     FROM PermissionGroups pg
     INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
     WHERE om.UserId = ?`,
    [userId]
  );

  orgGroupPerms.forEach((perm) => {
    if (Number(perm.CanViewBudgetInfo || 0) === 1) {
      canViewBudgetInfo = true;
    }
  });

  return canViewBudgetInfo;
};

const attachProjectHealth = (projects: RowDataPacket[], canViewBudgetInfo: boolean) => projects.map((project) => {
  const health = computeProjectHealth({
    isClosed: project.StatusIsClosed,
    isCancelled: project.StatusIsCancelled,
    canViewBudgetInfo,
    budget: project.Budget,
    budgetSpent: project.BudgetSpent,
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
    ...project,
    HealthStatus: health.status,
    HealthReasons: health.reasons,
  };
});

/**
 * @swagger
 * tags:
 *   name: Projects
 *   description: Project management endpoints
 */

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get all projects for the current user
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         description: Filter by organization
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of projects with TotalTasks, CompletedTasks, hours, OpenTickets, UnplannedTasks, BudgetSpent
 */
// Get all projects for the current user (filtered by organization membership)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const organizationId = req.query.organizationId;
    const canViewBudgetInfo = await resolveCanViewBudgetInfo(Number(userId));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soonDate = new Date(today);
    soonDate.setDate(soonDate.getDate() + 7);
    const toDateString = (value: Date) => value.toISOString().split('T')[0];
    const todayStr = toDateString(today);
    const soonDateStr = toDateString(soonDate);

    let query = `SELECT p.*, u.Username as CreatorName, o.Name as OrganizationName,
       c.Name as CustomerName,
       psv.StatusName, psv.ColorCode as StatusColor,
       COALESCE(psv.IsClosed, 0) as StatusIsClosed, COALESCE(psv.IsCancelled, 0) as StatusIsCancelled,
       COALESCE(taskStats.TotalTasks, 0) as TotalTasks,
       COALESCE(taskStats.CompletedTasks, 0) as CompletedTasks,
       COALESCE(taskStats.TotalEstimatedHours, 0) as TotalEstimatedHours,
       COALESCE(taskStats.TotalWorkedHours, 0) as TotalWorkedHours,
       COALESCE(taskStats.OverdueTasks, 0) as OverdueTasks,
      COALESCE(healthTaskStats.HealthTotalTasks, 0) as HealthTotalTasks,
      COALESCE(healthTaskStats.HealthOverdueTasks, 0) as HealthOverdueTasks,
      COALESCE(healthTaskStats.HealthUnassignedTasks, 0) as HealthUnassignedTasks,
       COALESCE(milestoneStats.OverdueMilestones, 0) as OverdueMilestones,
       COALESCE(milestoneStats.UpcomingMilestonesSoon, 0) as UpcomingMilestonesSoon,
       milestoneStats.NextOpenMilestoneDueDate as NextOpenMilestoneDueDate,
       COALESCE(sprintStats.ActiveSprintCount, 0) as ActiveSprintCount,
       COALESCE(sprintStats.OverdueActiveSprints, 0) as OverdueActiveSprints,
       sprintStats.ActiveSprintEndDate as ActiveSprintEndDate,
       (SELECT COUNT(*) FROM Tickets tk LEFT JOIN TicketStatusValues tsv2 ON tk.StatusId = tsv2.Id WHERE tk.ProjectId = p.Id AND COALESCE(tsv2.IsClosed, 0) = 0) as OpenTickets,
       COALESCE(unplannedStats.UnplannedTasks, 0) as UnplannedTasks,
       CASE
         WHEN COALESCE(p.BudgetType, 'monetary') = 'hours' THEN COALESCE(budgetStats.HoursSpent, 0)
         ELSE COALESCE(budgetStats.CostSpent, 0)
       END as BudgetSpent
       FROM Projects p 
       LEFT JOIN Users u ON p.CreatedBy = u.Id
       LEFT JOIN Organizations o ON p.OrganizationId = o.Id
       LEFT JOIN Customers c ON p.CustomerId = c.Id
       LEFT JOIN ProjectStatusValues psv ON p.Status = psv.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN (
         SELECT 
           t.ProjectId,
           COUNT(CASE WHEN COALESCE(tsv2.HideFromPlanningAndStatistics, 0) = 0 THEN 1 END) as TotalTasks,
           COUNT(CASE WHEN COALESCE(tsv2.HideFromPlanningAndStatistics, 0) = 0 AND COALESCE(tsv2.IsClosed, 0) = 1 THEN 1 END) as CompletedTasks,
           SUM(CASE WHEN COALESCE(tsv2.HideFromPlanningAndStatistics, 0) = 0
                     AND NOT EXISTS (
                       SELECT 1
                       FROM Tasks tChild
                       WHERE tChild.ProjectId = t.ProjectId
                         AND tChild.ParentTaskId = t.Id
                     )
                    THEN t.EstimatedHours ELSE 0 END) as TotalEstimatedHours,
           COALESCE((SELECT SUM(te.Hours) FROM TimeEntries te WHERE te.TaskId IN (SELECT Id FROM Tasks WHERE ProjectId = t.ProjectId)), 0) as TotalWorkedHours,
           COUNT(CASE WHEN COALESCE(tsv2.HideFromPlanningAndStatistics, 0) = 0 AND t.DueDate IS NOT NULL AND t.DueDate < CURDATE() AND COALESCE(tsv2.IsClosed, 0) = 0 AND COALESCE(tsv2.IsCancelled, 0) = 0 THEN 1 END) as OverdueTasks
         FROM Tasks t
         LEFT JOIN TaskStatusValues tsv2 ON t.Status = tsv2.Id
         GROUP BY t.ProjectId
       ) taskStats ON p.Id = taskStats.ProjectId
       LEFT JOIN (
         SELECT
           t.ProjectId,
           COUNT(*) as HealthTotalTasks,
           COUNT(CASE WHEN t.AssignedTo IS NULL THEN 1 END) as HealthUnassignedTasks,
           COUNT(CASE WHEN t.DueDate IS NOT NULL AND t.DueDate < ? AND COALESCE(tsv3.IsClosed, 0) = 0 AND COALESCE(tsv3.IsCancelled, 0) = 0 THEN 1 END) as HealthOverdueTasks
         FROM Tasks t
         LEFT JOIN TaskStatusValues tsv3 ON t.Status = tsv3.Id
         GROUP BY t.ProjectId
       ) healthTaskStats ON p.Id = healthTaskStats.ProjectId
       LEFT JOIN (
         SELECT 
           t.ProjectId,
           COUNT(*) as UnplannedTasks
         FROM Tasks t
         LEFT JOIN TaskAllocations ta ON t.Id = ta.TaskId
         LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         WHERE t.ParentTaskId IS NULL
           AND ta.TaskId IS NULL
           AND COALESCE(t.UnscheduledWork, 0) = 0
           AND COALESCE(tsv.IsClosed, 0) = 0
           AND COALESCE(tsv.IsCancelled, 0) = 0
           AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
         GROUP BY t.ProjectId
       ) unplannedStats ON p.Id = unplannedStats.ProjectId
       LEFT JOIN (
         SELECT
           pm.ProjectId,
           COUNT(CASE WHEN COALESCE(pm.IsCompleted, 0) = 0 AND pm.DueDate IS NOT NULL AND pm.DueDate < ? THEN 1 END) as OverdueMilestones,
           COUNT(CASE WHEN COALESCE(pm.IsCompleted, 0) = 0 AND pm.DueDate IS NOT NULL AND pm.DueDate >= ? AND pm.DueDate <= ? THEN 1 END) as UpcomingMilestonesSoon,
           MIN(CASE WHEN COALESCE(pm.IsCompleted, 0) = 0 AND pm.DueDate IS NOT NULL AND pm.DueDate >= ? THEN pm.DueDate END) as NextOpenMilestoneDueDate
         FROM ProjectMilestones pm
         GROUP BY pm.ProjectId
       ) milestoneStats ON p.Id = milestoneStats.ProjectId
       LEFT JOIN (
         SELECT
           s.ProjectId,
           COUNT(CASE WHEN s.Status = 'active' THEN 1 END) as ActiveSprintCount,
           COUNT(CASE WHEN s.Status = 'active' AND s.EndDate IS NOT NULL AND s.EndDate < ? THEN 1 END) as OverdueActiveSprints,
           MIN(CASE WHEN s.Status = 'active' THEN s.EndDate END) as ActiveSprintEndDate
         FROM Sprints s
         GROUP BY s.ProjectId
       ) sprintStats ON p.Id = sprintStats.ProjectId
       LEFT JOIN (
         SELECT t2.ProjectId,
                SUM(te2.Hours * COALESCE(u2.HourlyRate, 0)) as CostSpent,
                SUM(te2.Hours) as HoursSpent
         FROM TimeEntries te2
         INNER JOIN Tasks t2 ON te2.TaskId = t2.Id
         LEFT JOIN Users u2 ON te2.UserId = u2.Id
         GROUP BY t2.ProjectId
       ) budgetStats ON p.Id = budgetStats.ProjectId
       WHERE om.UserId = ?`;
    const params: any[] = [todayStr, todayStr, todayStr, soonDateStr, todayStr, todayStr, userId];

    if (organizationId) {
      query += ' AND p.OrganizationId = ?';
      params.push(organizationId);
    }

    query += ' ORDER BY p.CreatedAt DESC';

    const [projects] = await pool.execute<RowDataPacket[]>(query, params);
    const projectsWithHealth = attachProjectHealth(projects, canViewBudgetInfo);

    res.json({
      success: true,
      projects: projectsWithHealth
    });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch projects' 
    });
  }
});

// Get single project by ID
/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     summary: Get a single project by ID
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Project data including BudgetSpent
 *       404:
 *         description: Project not found
 */
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = req.params.id;
    const canViewBudgetInfo = await resolveCanViewBudgetInfo(Number(userId));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soonDate = new Date(today);
    soonDate.setDate(soonDate.getDate() + 7);
    const toDateString = (value: Date) => value.toISOString().split('T')[0];
    const todayStr = toDateString(today);
    const soonDateStr = toDateString(soonDate);

    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.*, u.Username as CreatorName, o.Name as OrganizationName, c.Name as CustomerName,
              psv.StatusName, psv.ColorCode as StatusColor,
              COALESCE(psv.IsClosed, 0) as StatusIsClosed, COALESCE(psv.IsCancelled, 0) as StatusIsCancelled,
              COALESCE(taskStats.TotalTasks, 0) as TotalTasks,
              COALESCE(taskStats.CompletedTasks, 0) as CompletedTasks,
              COALESCE(taskStats.TotalEstimatedHours, 0) as TotalEstimatedHours,
              COALESCE(taskStats.TotalWorkedHours, 0) as TotalWorkedHours,
              COALESCE(taskStats.OverdueTasks, 0) as OverdueTasks,
              COALESCE(unplannedStats.UnplannedTasks, 0) as UnplannedTasks,
              COALESCE(healthTaskStats.HealthTotalTasks, 0) as HealthTotalTasks,
              COALESCE(healthTaskStats.HealthOverdueTasks, 0) as HealthOverdueTasks,
              COALESCE(healthTaskStats.HealthUnassignedTasks, 0) as HealthUnassignedTasks,
              COALESCE(milestoneStats.OverdueMilestones, 0) as OverdueMilestones,
              COALESCE(milestoneStats.UpcomingMilestonesSoon, 0) as UpcomingMilestonesSoon,
              milestoneStats.NextOpenMilestoneDueDate as NextOpenMilestoneDueDate,
              COALESCE(sprintStats.ActiveSprintCount, 0) as ActiveSprintCount,
              COALESCE(sprintStats.OverdueActiveSprints, 0) as OverdueActiveSprints,
              sprintStats.ActiveSprintEndDate as ActiveSprintEndDate,
              CASE
                WHEN COALESCE(p.BudgetType, 'monetary') = 'hours' THEN COALESCE(budgetStats.HoursSpent, 0)
                ELSE COALESCE(budgetStats.CostSpent, 0)
              END as BudgetSpent
       FROM Projects p 
       LEFT JOIN Users u ON p.CreatedBy = u.Id
       LEFT JOIN Organizations o ON p.OrganizationId = o.Id
       LEFT JOIN Customers c ON p.CustomerId = c.Id
       LEFT JOIN ProjectStatusValues psv ON p.Status = psv.Id
       LEFT JOIN (
         SELECT 
           t.ProjectId,
           COUNT(CASE WHEN COALESCE(tsv2.HideFromPlanningAndStatistics, 0) = 0 THEN 1 END) as TotalTasks,
           COUNT(CASE WHEN COALESCE(tsv2.HideFromPlanningAndStatistics, 0) = 0 AND COALESCE(tsv2.IsClosed, 0) = 1 THEN 1 END) as CompletedTasks,
           SUM(CASE WHEN COALESCE(tsv2.HideFromPlanningAndStatistics, 0) = 0
                     AND NOT EXISTS (
                       SELECT 1
                       FROM Tasks tChild
                       WHERE tChild.ProjectId = t.ProjectId
                         AND tChild.ParentTaskId = t.Id
                     )
                    THEN t.EstimatedHours ELSE 0 END) as TotalEstimatedHours,
           COALESCE((SELECT SUM(te.Hours) FROM TimeEntries te WHERE te.TaskId IN (SELECT Id FROM Tasks WHERE ProjectId = t.ProjectId)), 0) as TotalWorkedHours,
           COUNT(CASE WHEN COALESCE(tsv2.HideFromPlanningAndStatistics, 0) = 0 AND t.DueDate IS NOT NULL AND t.DueDate < CURDATE() AND COALESCE(tsv2.IsClosed, 0) = 0 AND COALESCE(tsv2.IsCancelled, 0) = 0 THEN 1 END) as OverdueTasks
         FROM Tasks t
         LEFT JOIN TaskStatusValues tsv2 ON t.Status = tsv2.Id
         GROUP BY t.ProjectId
       ) taskStats ON p.Id = taskStats.ProjectId
       LEFT JOIN (
         SELECT
           t.ProjectId,
           COUNT(*) as UnplannedTasks
         FROM Tasks t
         LEFT JOIN TaskAllocations ta ON t.Id = ta.TaskId
         LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         WHERE t.ParentTaskId IS NULL
           AND ta.TaskId IS NULL
           AND COALESCE(t.UnscheduledWork, 0) = 0
           AND COALESCE(tsv.IsClosed, 0) = 0
           AND COALESCE(tsv.IsCancelled, 0) = 0
           AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
         GROUP BY t.ProjectId
       ) unplannedStats ON p.Id = unplannedStats.ProjectId
       LEFT JOIN (
         SELECT
           t.ProjectId,
           COUNT(*) as HealthTotalTasks,
           COUNT(CASE WHEN t.AssignedTo IS NULL THEN 1 END) as HealthUnassignedTasks,
           COUNT(CASE WHEN t.DueDate IS NOT NULL AND t.DueDate < ? AND COALESCE(tsv3.IsClosed, 0) = 0 AND COALESCE(tsv3.IsCancelled, 0) = 0 THEN 1 END) as HealthOverdueTasks
         FROM Tasks t
         LEFT JOIN TaskStatusValues tsv3 ON t.Status = tsv3.Id
         GROUP BY t.ProjectId
       ) healthTaskStats ON p.Id = healthTaskStats.ProjectId
       LEFT JOIN (
         SELECT
           pm.ProjectId,
           COUNT(CASE WHEN COALESCE(pm.IsCompleted, 0) = 0 AND pm.DueDate IS NOT NULL AND pm.DueDate < ? THEN 1 END) as OverdueMilestones,
           COUNT(CASE WHEN COALESCE(pm.IsCompleted, 0) = 0 AND pm.DueDate IS NOT NULL AND pm.DueDate >= ? AND pm.DueDate <= ? THEN 1 END) as UpcomingMilestonesSoon,
           MIN(CASE WHEN COALESCE(pm.IsCompleted, 0) = 0 AND pm.DueDate IS NOT NULL AND pm.DueDate >= ? THEN pm.DueDate END) as NextOpenMilestoneDueDate
         FROM ProjectMilestones pm
         GROUP BY pm.ProjectId
       ) milestoneStats ON p.Id = milestoneStats.ProjectId
       LEFT JOIN (
         SELECT
           s.ProjectId,
           COUNT(CASE WHEN s.Status = 'active' THEN 1 END) as ActiveSprintCount,
           COUNT(CASE WHEN s.Status = 'active' AND s.EndDate IS NOT NULL AND s.EndDate < ? THEN 1 END) as OverdueActiveSprints,
           MIN(CASE WHEN s.Status = 'active' THEN s.EndDate END) as ActiveSprintEndDate
         FROM Sprints s
         GROUP BY s.ProjectId
       ) sprintStats ON p.Id = sprintStats.ProjectId
       LEFT JOIN (
         SELECT t2.ProjectId,
                SUM(te2.Hours * COALESCE(u2.HourlyRate, 0)) as CostSpent,
                SUM(te2.Hours) as HoursSpent
         FROM TimeEntries te2
         INNER JOIN Tasks t2 ON te2.TaskId = t2.Id
         LEFT JOIN Users u2 ON te2.UserId = u2.Id
         GROUP BY t2.ProjectId
       ) budgetStats ON p.Id = budgetStats.ProjectId
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [todayStr, todayStr, todayStr, soonDateStr, todayStr, todayStr, projectId, userId]
    );

    if (projects.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found' 
      });
    }

    // Load associated applications
    const [appRows] = await pool.execute<RowDataPacket[]>(
      `SELECT a.Id, a.Name FROM ApplicationProjects ap
       INNER JOIN Applications a ON ap.ApplicationId = a.Id
       WHERE ap.ProjectId = ?`,
      [projectId]
    );

    const projectWithHealth = attachProjectHealth(projects, canViewBudgetInfo)[0];

    const project = {
      ...projectWithHealth,
      ApplicationIds: appRows.map((r: any) => r.Id),
      ApplicationNames: appRows.map((r: any) => r.Name),
    };

    res.json({
      success: true,
      project
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch project' 
    });
  }
});

// Get user permissions for a project
// GET /:id/burndown — burndown/burnup chart data for a project
/**
 * @swagger
 * /api/projects/{id}/burndown:
 *   get:
 *     summary: Get burndown and burnup chart data for a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Series data with date, worked, cumulative, remaining, ideal fields
 */
router.get('/:id/burndown', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = parseInt(req.params.id as string);

    // Verify access
    const [accessCheck] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.StartDate, p.EndDate FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
       WHERE p.Id = ?`,
      [userId, projectId]
    );
    if (accessCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    const project = accessCheck[0];

    // Total estimated hours from leaf tasks only (tasks without children)
    const [leafHoursRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(t.EstimatedHours), 0) as TotalEstimatedHours
       FROM Tasks t
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE t.ProjectId = ?
         AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
         AND t.Id NOT IN (SELECT DISTINCT ParentTaskId FROM Tasks WHERE ParentTaskId IS NOT NULL AND ProjectId = ?)`,
      [projectId, projectId]
    );
    const totalEstimatedHours = parseFloat(leafHoursRows[0]?.TotalEstimatedHours || '0');

    // Get all time entries for this project grouped by date
    const [dailyEntries] = await pool.execute<RowDataPacket[]>(
      `SELECT DATE_FORMAT(te.WorkDate, '%Y-%m-%d') as WorkDate, SUM(te.Hours) as DailyHours
       FROM TimeEntries te
       INNER JOIN Tasks t ON te.TaskId = t.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE t.ProjectId = ?
         AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
       GROUP BY te.WorkDate
       ORDER BY te.WorkDate ASC`,
      [projectId]
    );

    // Determine chart date range
    const firstEntry = dailyEntries.length > 0 ? dailyEntries[0].WorkDate : null;
    const today = new Date().toISOString().split('T')[0];
    const startDate = project.StartDate
      ? new Date(project.StartDate).toISOString().split('T')[0]
      : (firstEntry || today);
    const endDate = project.EndDate
      ? new Date(project.EndDate).toISOString().split('T')[0]
      : today;

    // Build daily map
    const dailyMap: Record<string, number> = {};
    for (const row of dailyEntries) {
      dailyMap[row.WorkDate] = parseFloat(row.DailyHours);
    }

    // Generate date series from startDate to max(endDate, today)
    const maxDate = endDate > today ? endDate : today;
    const series: { date: string; worked: number; cumulative: number; remaining: number; ideal: number }[] = [];
    const start = new Date(startDate);
    const end = new Date(maxDate);
    const totalDays = Math.max(1, Math.round((new Date(endDate).getTime() - start.getTime()) / 86400000));

    let cumulative = 0;
    let dayIndex = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const worked = dailyMap[dateStr] || 0;
      cumulative += worked;
      const daysFromStart = Math.round((d.getTime() - start.getTime()) / 86400000);
      const idealProgress = totalEstimatedHours > 0
        ? Math.max(0, totalEstimatedHours - (totalEstimatedHours * (daysFromStart / totalDays)))
        : 0;
      series.push({
        date: dateStr,
        worked,
        cumulative,
        remaining: Math.max(0, totalEstimatedHours - cumulative),
        ideal: Math.round(idealProgress * 100) / 100
      });
      dayIndex++;
    }

    res.json({
      success: true,
      data: {
        startDate,
        endDate,
        today,
        totalEstimatedHours,
        series
      }
    });
  } catch (error) {
    console.error('Error fetching burndown data:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch burndown data' });
  }
});

router.get('/:id/flow-metrics', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = Number(req.params.id);

    const [accessCheck] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.OrganizationId
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
       WHERE p.Id = ?`,
      [userId, projectId]
    );

    if (accessCheck.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const project = accessCheck[0];

    const [closedStatuses] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, StatusName FROM TaskStatusValues WHERE OrganizationId = ? AND COALESCE(IsClosed, 0) = 1`,
      [project.OrganizationId]
    );

    const closedStatusValues = new Set<string>();
    closedStatuses.forEach((status) => {
      closedStatusValues.add(String(status.Id));
      closedStatusValues.add(String(status.StatusName || '').trim().toLowerCase());
    });

    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.TaskName, t.Status, t.CreatedAt, t.UpdatedAt, t.PlannedStartDate
       FROM Tasks t
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE t.ProjectId = ?
         AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0`,
      [projectId]
    );

    const [statusHistory] = await pool.execute<RowDataPacket[]>(
      `SELECT th.TaskId, th.NewValue, th.CreatedAt
       FROM TaskHistory th
       INNER JOIN Tasks t ON t.Id = th.TaskId
       WHERE t.ProjectId = ? AND th.FieldName = 'Status'
       ORDER BY th.TaskId ASC, th.CreatedAt ASC`,
      [projectId]
    );

    const [firstWorkRows] = await pool.execute<RowDataPacket[]>(
      `SELECT te.TaskId, MIN(te.WorkDate) as FirstWorkDate
       FROM TimeEntries te
       INNER JOIN Tasks t ON te.TaskId = t.Id
       WHERE t.ProjectId = ?
       GROUP BY te.TaskId`,
      [projectId]
    );

    const firstWorkMap = new Map<number, Date>();
    firstWorkRows.forEach((row) => {
      if (!row.FirstWorkDate) return;
      firstWorkMap.set(Number(row.TaskId), new Date(row.FirstWorkDate));
    });

    const historyMap = new Map<number, Array<{ newValue: string; createdAt: Date }>>();
    statusHistory.forEach((entry) => {
      const taskId = Number(entry.TaskId);
      if (!historyMap.has(taskId)) {
        historyMap.set(taskId, []);
      }
      historyMap.get(taskId)!.push({
        newValue: String(entry.NewValue || '').trim(),
        createdAt: new Date(entry.CreatedAt),
      });
    });

    const normalizeDay = (date: Date): string => {
      const year = date.getFullYear();
      const month = `${date.getMonth() + 1}`.padStart(2, '0');
      const day = `${date.getDate()}`.padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const dayDiff = (start: Date, end: Date): number => {
      return (new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() - new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()) / 86400000;
    };

    const today = new Date();
    const todayKey = normalizeDay(today);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    let totalLeadDays = 0;
    let totalCycleDays = 0;
    let completedCount = 0;

    const throughputByDay: Record<string, number> = {};
    const agingWip: Array<{ taskId: number; ageDays: number; taskName: string }> = [];

    const tasksWithTimeline = tasks.map((task) => {
      const taskId = Number(task.Id);
      const createdAt = new Date(task.CreatedAt);
      const taskHistoryEntries = historyMap.get(taskId) || [];
      const firstWorkDate = firstWorkMap.get(taskId);

      const startedAt = firstWorkDate || (task.PlannedStartDate ? new Date(task.PlannedStartDate) : createdAt);

      let closedAt: Date | null = null;
      for (const statusEvent of taskHistoryEntries) {
        const statusToken = String(statusEvent.newValue || '').trim().toLowerCase();
        if (closedStatusValues.has(statusToken) || closedStatusValues.has(String(statusEvent.newValue || '').trim())) {
          closedAt = statusEvent.createdAt;
          break;
        }
      }

      const currentStatusToken = String(task.Status ?? '').trim().toLowerCase();
      const isClosedNow = closedStatusValues.has(String(task.Status ?? '').trim()) || closedStatusValues.has(currentStatusToken);
      if (!closedAt && isClosedNow && task.UpdatedAt) {
        closedAt = new Date(task.UpdatedAt);
      }

      if (closedAt) {
        completedCount += 1;
        totalLeadDays += Math.max(0, dayDiff(createdAt, closedAt));
        totalCycleDays += Math.max(0, dayDiff(startedAt, closedAt));
        const completionDay = normalizeDay(closedAt);
        throughputByDay[completionDay] = (throughputByDay[completionDay] || 0) + 1;
      } else {
        agingWip.push({
          taskId,
          taskName: String(task.TaskName || `Task #${taskId}`),
          ageDays: Math.max(0, Math.floor(dayDiff(startedAt, today))),
        });
      }

      return {
        taskId,
        createdAt,
        startedAt,
        closedAt,
      };
    });

    const cfdSeries: Array<{ date: string; backlog: number; inProgress: number; done: number }> = [];
    for (let cursor = new Date(thirtyDaysAgo); cursor <= today; cursor.setDate(cursor.getDate() + 1)) {
      const day = new Date(cursor);
      const dayKey = normalizeDay(day);

      let backlog = 0;
      let inProgress = 0;
      let done = 0;

      tasksWithTimeline.forEach((task) => {
        if (task.createdAt > day) return;
        if (task.closedAt && task.closedAt <= day) {
          done += 1;
          return;
        }
        if (task.startedAt <= day) {
          inProgress += 1;
        } else {
          backlog += 1;
        }
      });

      cfdSeries.push({
        date: dayKey,
        backlog,
        inProgress,
        done,
      });
    }

    const throughputLast30Days = cfdSeries.reduce((sum, item) => sum + (throughputByDay[item.date] || 0), 0);

    res.json({
      success: true,
      data: {
        summary: {
          averageLeadTimeDays: completedCount > 0 ? Number((totalLeadDays / completedCount).toFixed(2)) : 0,
          averageCycleTimeDays: completedCount > 0 ? Number((totalCycleDays / completedCount).toFixed(2)) : 0,
          throughputLast30Days,
          completedInPeriod: completedCount,
          wipCount: agingWip.length,
          generatedAt: todayKey,
        },
        cfd: cfdSeries,
        throughputByDay,
        agingWip: agingWip.sort((a, b) => b.ageDays - a.ageDays),
      },
    });
  } catch (error) {
    console.error('Error fetching flow metrics data:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch flow metrics data' });
  }
});

/**
 * @swagger
 * /api/projects/{id}/permissions:
 *   get:
 *     summary: Get current user permissions for a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Permissions object with CanManageTasks, CanPlanTasks flags
 */
router.get('/:id/permissions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = req.params.id;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        p.Id,
        om.Role,
        COALESCE(pg.CanManageTasks, 0) as CanManageTasks,
        COALESCE(pg.CanPlanTasks, 0) as CanPlanTasks
      FROM Projects p
      INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId AND om.UserId = ?
      LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
      WHERE p.Id = ?`,
      [userId, projectId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found or access denied' 
      });
    }

    const project = rows[0];
    const canManageTasks = project.Role === 'Owner' || project.Role === 'Admin' || project.CanManageTasks === 1;
    const canPlanTasks = project.Role === 'Owner' || project.Role === 'Admin' || project.CanPlanTasks === 1;

    res.json({
      success: true,
      data: {
        canManageTasks,
        canPlanTasks,
        role: project.Role
      }
    });

  } catch (error) {
    console.error('Error fetching project permissions:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch project permissions' 
    });
  }
});

// Create new project
/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, projectName]
 *             properties:
 *               organizationId: { type: integer }
 *               projectName: { type: string }
 *               description: { type: string }
 *               status: { type: string }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *               isHobby: { type: boolean }
 *               budget: { type: number }
 *     responses:
 *       201:
 *         description: Project created
 *       403:
 *         description: Forbidden
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { organizationId, projectName, description, status, startDate, endDate, isHobby, isGlobal, isVisibleToCustomer, customerId, jiraBoardId, budget, budgetType, applicationIds, customFields } = req.body;
    const finalBudgetType = normalizeBudgetType(budgetType);
    const finalIsGlobal = isGlobal === true || isGlobal === 1;
    const hasCustomerInput = customerId !== undefined && customerId !== null && customerId !== '';

    if (finalIsGlobal && hasCustomerInput) {
      return res.status(400).json({
        success: false,
        message: 'Global projects cannot be associated with a customer'
      });
    }

    const finalCustomerId = finalIsGlobal ? null : (hasCustomerInput ? customerId : null);
    const finalIsVisibleToCustomer = finalCustomerId ? (isVisibleToCustomer ? 1 : 0) : 0;

    if (!projectName || !organizationId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Project name and organization are required' 
      });
    }

    if (status === undefined || status === null || status === '') {
      return res.status(400).json({
        success: false,
        message: 'Project status is required'
      });
    }

    // Verify user is member of organization
    const [members] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );

    if (members.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'You are not a member of this organization' 
      });
    }

    const customFieldData = await prepareCustomFieldData('Projects', customFields);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Projects (OrganizationId, ProjectName, Description, CreatedBy, Status, StartDate, EndDate, IsHobby, IsGlobal, IsVisibleToCustomer, CustomerId, JiraBoardId, Budget, BudgetType${customFieldData.insertColumns.length > 0 ? `, ${customFieldData.insertColumns.join(', ')}` : ''}) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${customFieldData.insertPlaceholders.length > 0 ? `, ${customFieldData.insertPlaceholders.join(', ')}` : ''})`,
      [
        organizationId,
        projectName, 
        description || null, 
        userId, 
        status || null,
        startDate || null, 
        endDate || null,
        isHobby ? 1 : 0,
        finalIsGlobal ? 1 : 0,
        finalIsVisibleToCustomer,
        finalCustomerId,
        jiraBoardId || null,
        budget !== undefined && budget !== '' ? parseFloat(budget) : null,
        finalBudgetType,
        ...customFieldData.insertValues
      ]
    );

    // Log project creation
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'PROJECT_CREATE',
      'Project',
      result.insertId,
      projectName,
      `Created project: ${projectName}`,
      req.ip,
      req.get('user-agent')
    );
    
    // Log to history
    await logProjectHistory(
      result.insertId,
      userId!,
      'created',
      null,
      null,
      null
    );

    // Sync application associations
    if (applicationIds && Array.isArray(applicationIds) && applicationIds.length > 0) {
      for (const appId of applicationIds) {
        await pool.execute(
          'INSERT IGNORE INTO ApplicationProjects (ApplicationId, ProjectId) VALUES (?, ?)',
          [appId, result.insertId]
        );
      }
    }

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      projectId: result.insertId
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create project' 
    });
  }
});

// Transfer project to another organization
/**
 * @swagger
 * /api/projects/{id}/transfer:
 *   put:
 *     summary: Transfer a project to a different organization
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId]
 *             properties:
 *               organizationId: { type: integer }
 *     responses:
 *       200:
 *         description: Project transferred
 *       403:
 *         description: Forbidden
 */
router.put('/:id/transfer', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = req.params.id;
    const { newOrganizationId } = req.body;

    if (!newOrganizationId) {
      return res.status(400).json({ 
        success: false, 
        message: 'New organization ID is required' 
      });
    }

    // Check if project exists and get current organization
    const [projects] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId, CreatedBy FROM Projects WHERE Id = ?',
      [projectId]
    );

    if (projects.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found' 
      });
    }

    const currentOrgId = projects[0].OrganizationId;

    // Verify user has admin rights in current organization
    const [currentOrgMember] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [currentOrgId, userId]
    );

    if (currentOrgMember.length === 0 || 
        (currentOrgMember[0].Role !== 'Owner' && !currentOrgMember[0].CanManageSettings)) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission to transfer this project' 
      });
    }

    // Verify user has access to new organization
    const [newOrgMember] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [newOrganizationId, userId]
    );

    if (newOrgMember.length === 0 || 
        (newOrgMember[0].Role !== 'Owner' && !newOrgMember[0].CanManageSettings)) {
      return res.status(403).json({ 
        success: false, 
        message: 'You do not have permission in the target organization' 
      });
    }

    // Transfer the project
    await pool.execute(
      'UPDATE Projects SET OrganizationId = ? WHERE Id = ?',
      [newOrganizationId, projectId]
    );

    res.json({
      success: true,
      message: 'Project transferred successfully'
    });
  } catch (error) {
    console.error('Transfer project error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to transfer project' 
    });
  }
});

router.put('/:id/task-mappings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    const { integrationType, statusMapping, priorityMapping, taskTypeMapping } = req.body;

    if (!projectId || !userId) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }

    const normalizedIntegrationType = String(integrationType || 'jira-board').toLowerCase();
    if (normalizedIntegrationType !== 'jira-board') {
      return res.status(400).json({ success: false, message: 'Unsupported mapping type. Use jira-board.' });
    }

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Projects WHERE Id = ?',
      [projectId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    const oldProject = existing[0];

    const [accessRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         COALESCE(u.isAdmin, 0) as IsAdmin,
         COALESCE(u.IsManager, 0) as IsManager,
         om.Role,
         COALESCE(pg.CanManageProjects, 0) as CanManageProjects
       FROM Users u
       LEFT JOIN OrganizationMembers om ON om.UserId = u.Id AND om.OrganizationId = ?
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE u.Id = ?`,
      [oldProject.OrganizationId, userId]
    );

    const access = accessRows[0];
    const canUpdateProject =
      Number(oldProject.CreatedBy) === Number(userId) ||
      Number(access?.IsAdmin || 0) === 1 ||
      Number(access?.IsManager || 0) === 1 ||
      access?.Role === 'Owner' ||
      access?.Role === 'Admin' ||
      Number(access?.CanManageProjects || 0) === 1;

    if (!canUpdateProject) {
      return res.status(403).json({ success: false, message: 'You do not have permission to update this project' });
    }

    const normalizeMapping = (value: any, fallback: string | null): string | null => {
      if (value === undefined) {
        return fallback;
      }
      if (value === null) {
        return null;
      }
      if (typeof value === 'object' && !Array.isArray(value)) {
        return JSON.stringify(value);
      }
      return fallback;
    };

    const normalizedStatusMapping = normalizeMapping(statusMapping, oldProject.JiraTaskStatusMappingJson || null);
    const normalizedPriorityMapping = normalizeMapping(priorityMapping, oldProject.JiraTaskPriorityMappingJson || null);
    const normalizedTaskTypeMapping = normalizeMapping(taskTypeMapping, oldProject.JiraTaskTypeMappingJson || null);

    await pool.execute(
      `UPDATE Projects
       SET JiraTaskStatusMappingJson = ?,
           JiraTaskPriorityMappingJson = ?,
           JiraTaskTypeMappingJson = ?
       WHERE Id = ?`,
      [normalizedStatusMapping, normalizedPriorityMapping, normalizedTaskTypeMapping, projectId]
    );

    const changes: { field: string; oldVal: string; newVal: string }[] = [];
    if (String(oldProject.JiraTaskStatusMappingJson || '') !== String(normalizedStatusMapping || '')) {
      changes.push({
        field: 'JiraTaskStatusMappingJson',
        oldVal: String(oldProject.JiraTaskStatusMappingJson || ''),
        newVal: String(normalizedStatusMapping || ''),
      });
    }
    if (String(oldProject.JiraTaskPriorityMappingJson || '') !== String(normalizedPriorityMapping || '')) {
      changes.push({
        field: 'JiraTaskPriorityMappingJson',
        oldVal: String(oldProject.JiraTaskPriorityMappingJson || ''),
        newVal: String(normalizedPriorityMapping || ''),
      });
    }
    if (String(oldProject.JiraTaskTypeMappingJson || '') !== String(normalizedTaskTypeMapping || '')) {
      changes.push({
        field: 'JiraTaskTypeMappingJson',
        oldVal: String(oldProject.JiraTaskTypeMappingJson || ''),
        newVal: String(normalizedTaskTypeMapping || ''),
      });
    }

    for (const change of changes) {
      await logProjectHistory(Number(projectId), userId, 'updated', change.field, change.oldVal, change.newVal);
    }

    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'PROJECT_UPDATE_TASK_MAPPINGS',
      'Project',
      Number(projectId),
      oldProject.ProjectName,
      `Updated Jira task mappings for project: ${oldProject.ProjectName}`,
      req.ip,
      req.get('user-agent')
    );

    res.json({ success: true, message: 'Task mappings updated successfully' });
  } catch (error) {
    console.error('Update task mappings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update task mappings' });
  }
});

// Update project
/**
 * @swagger
 * /api/projects/{id}:
 *   put:
 *     summary: Update a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               projectName: { type: string }
 *               description: { type: string }
 *               status: { type: string }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *               isHobby: { type: boolean }
 *               budget: { type: number }
 *               jiraBoardId: { type: string }
 *     responses:
 *       200:
 *         description: Project updated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = req.params.id;
    const { projectName, description, status, startDate, endDate, isHobby, isGlobal, isVisibleToCustomer, customerId, jiraBoardId, gitHubOwner, gitHubRepo, giteaOwner, giteaRepo, budget, budgetType, applicationIds, customFields } = req.body;

    // Check if project exists and get current data
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Projects WHERE Id = ?',
      [projectId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found or access denied' 
      });
    }
    
    const oldProject = existing[0];

    // Authorize: project creator, global admin/manager, or org owner/admin/manage-projects permission
    const [accessRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         COALESCE(u.isAdmin, 0) as IsAdmin,
         COALESCE(u.IsManager, 0) as IsManager,
         om.Role,
         COALESCE(pg.CanManageProjects, 0) as CanManageProjects
       FROM Users u
       LEFT JOIN OrganizationMembers om ON om.UserId = u.Id AND om.OrganizationId = ?
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE u.Id = ?`,
      [oldProject.OrganizationId, userId]
    );

    const access = accessRows[0];
    const canUpdateProject =
      Number(oldProject.CreatedBy) === Number(userId) ||
      Number(access?.IsAdmin || 0) === 1 ||
      Number(access?.IsManager || 0) === 1 ||
      access?.Role === 'Owner' ||
      access?.Role === 'Admin' ||
      Number(access?.CanManageProjects || 0) === 1;

    if (!canUpdateProject) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this project'
      });
    }

    const finalStatus = status !== undefined ? status : oldProject.Status;
    const finalBudgetType = budgetType !== undefined
      ? normalizeBudgetType(budgetType)
      : normalizeBudgetType(oldProject.BudgetType);
    const finalIsGlobal = isGlobal !== undefined
      ? (isGlobal === true || isGlobal === 1)
      : Boolean(oldProject.IsGlobal);
    const hasCustomerInput = customerId !== undefined && customerId !== null && customerId !== '';

    if (finalIsGlobal && hasCustomerInput) {
      return res.status(400).json({
        success: false,
        message: 'Global projects cannot be associated with a customer'
      });
    }

    const requestedCustomerId = customerId !== undefined
      ? (hasCustomerInput ? customerId : null)
      : (oldProject.CustomerId || null);
    const finalCustomerId = finalIsGlobal ? null : requestedCustomerId;
    const finalIsVisibleToCustomer = finalCustomerId
      ? (isVisibleToCustomer !== undefined ? (isVisibleToCustomer ? 1 : 0) : (oldProject.IsVisibleToCustomer ? 1 : 0))
      : 0;

    if (finalStatus === undefined || finalStatus === null || finalStatus === '') {
      return res.status(400).json({
        success: false,
        message: 'Project status is required'
      });
    }

    const customFieldData = await prepareCustomFieldData('Projects', customFields, oldProject as Record<string, unknown>);

    // Normalize empty values for comparison
    const normalizeValue = (value: any): string => {
      return value === null || value === undefined || value === '' ? '' : String(value);
    };

    // Track changes
    const changes: { field: string; oldVal: any; newVal: any }[] = [];
    
    if (projectName !== undefined && projectName !== oldProject.ProjectName) {
      changes.push({ field: 'ProjectName', oldVal: oldProject.ProjectName, newVal: projectName });
    }
    
    const oldDesc = normalizeValue(oldProject.Description);
    const newDesc = normalizeValue(description);
    if (description !== undefined && oldDesc !== newDesc) {
      changes.push({ field: 'Description', oldVal: oldDesc, newVal: newDesc });
    }
    
    if (status !== undefined && status !== oldProject.Status) {
      changes.push({ field: 'Status', oldVal: oldProject.Status, newVal: status });
    }
    if (startDate !== undefined && startDate !== oldProject.StartDate) {
      changes.push({ field: 'StartDate', oldVal: oldProject.StartDate, newVal: startDate });
    }
    if (endDate !== undefined && endDate !== oldProject.EndDate) {
      changes.push({ field: 'EndDate', oldVal: oldProject.EndDate, newVal: endDate });
    }
    if (isHobby !== undefined && isHobby !== Boolean(oldProject.IsHobby)) {
      changes.push({ field: 'IsHobby', oldVal: String(oldProject.IsHobby), newVal: String(isHobby) });
    }
    if (finalIsGlobal !== Boolean(oldProject.IsGlobal)) {
      changes.push({ field: 'IsGlobal', oldVal: String(oldProject.IsGlobal), newVal: String(finalIsGlobal ? 1 : 0) });
    }
    if (finalCustomerId !== (oldProject.CustomerId || null)) {
      changes.push({ field: 'CustomerId', oldVal: String(oldProject.CustomerId || ''), newVal: String(finalCustomerId || '') });
    }
    if (jiraBoardId !== undefined && jiraBoardId !== oldProject.JiraBoardId) {
      changes.push({ field: 'JiraBoardId', oldVal: String(oldProject.JiraBoardId || ''), newVal: String(jiraBoardId || '') });
    }
    if (gitHubOwner !== undefined && gitHubOwner !== oldProject.GitHubOwner) {
      changes.push({ field: 'GitHubOwner', oldVal: String(oldProject.GitHubOwner || ''), newVal: String(gitHubOwner || '') });
    }
    if (gitHubRepo !== undefined && gitHubRepo !== oldProject.GitHubRepo) {
      changes.push({ field: 'GitHubRepo', oldVal: String(oldProject.GitHubRepo || ''), newVal: String(gitHubRepo || '') });
    }
    if (giteaOwner !== undefined && giteaOwner !== oldProject.GiteaOwner) {
      changes.push({ field: 'GiteaOwner', oldVal: String(oldProject.GiteaOwner || ''), newVal: String(giteaOwner || '') });
    }
    if (giteaRepo !== undefined && giteaRepo !== oldProject.GiteaRepo) {
      changes.push({ field: 'GiteaRepo', oldVal: String(oldProject.GiteaRepo || ''), newVal: String(giteaRepo || '') });
    }
    if (budget !== undefined && parseFloat(budget) !== parseFloat(oldProject.Budget)) {
      changes.push({ field: 'Budget', oldVal: String(oldProject.Budget || ''), newVal: String(budget || '') });
    }
    if (budgetType !== undefined && finalBudgetType !== normalizeBudgetType(oldProject.BudgetType)) {
      changes.push({ field: 'BudgetType', oldVal: normalizeBudgetType(oldProject.BudgetType), newVal: finalBudgetType });
    }

    if (applicationIds !== undefined && Array.isArray(applicationIds)) {
      const [oldAppRows] = await pool.execute<RowDataPacket[]>(
        `SELECT a.Name
         FROM ApplicationProjects ap
         INNER JOIN Applications a ON ap.ApplicationId = a.Id
         WHERE ap.ProjectId = ?
         ORDER BY a.Name ASC`,
        [projectId]
      );

      let newAppNames: string[] = [];
      if (applicationIds.length > 0) {
        const uniqueNewIds = Array.from(new Set(applicationIds.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)));
        if (uniqueNewIds.length > 0) {
          const placeholders = uniqueNewIds.map(() => '?').join(',');
          const [newAppRows] = await pool.execute<RowDataPacket[]>(
            `SELECT Name FROM Applications WHERE Id IN (${placeholders}) ORDER BY Name ASC`,
            uniqueNewIds
          );
          newAppNames = newAppRows.map((row) => String(row.Name));
        }
      }

      const oldNamesJoined = oldAppRows.map((row) => String(row.Name)).join(', ');
      const newNamesJoined = newAppNames.join(', ');
      if (oldNamesJoined !== newNamesJoined) {
        changes.push({ field: 'Applications', oldVal: oldNamesJoined, newVal: newNamesJoined });
      }
    }

    if (finalIsVisibleToCustomer !== (oldProject.IsVisibleToCustomer ? 1 : 0)) {
      changes.push({ field: 'IsVisibleToCustomer', oldVal: String(oldProject.IsVisibleToCustomer), newVal: String(finalIsVisibleToCustomer) });
    }
    for (const change of customFieldData.changes) {
      changes.push({ field: change.field, oldVal: change.oldVal, newVal: change.newVal });
    }

    // Convert empty strings to null for date fields
    const normalizedStartDate = startDate === '' ? null : startDate;
    const normalizedEndDate = endDate === '' ? null : endDate;

    await pool.execute(
      `UPDATE Projects 
       SET ProjectName = ?, Description = ?, Status = ?, StartDate = ?, EndDate = ?, IsHobby = ?, IsGlobal = ?, IsVisibleToCustomer = ?, CustomerId = ?, JiraBoardId = ?, GitHubOwner = ?, GitHubRepo = ?, GiteaOwner = ?, GiteaRepo = ?, Budget = ?, BudgetType = ?${customFieldData.updateAssignments.length > 0 ? `, ${customFieldData.updateAssignments.join(', ')}` : ''}
       WHERE Id = ?`,
      [projectName, description, status, normalizedStartDate, normalizedEndDate, isHobby ? 1 : 0, finalIsGlobal ? 1 : 0, finalIsVisibleToCustomer, finalCustomerId, jiraBoardId || null, gitHubOwner || null, gitHubRepo || null, giteaOwner || null, giteaRepo || null, budget !== undefined && budget !== '' ? parseFloat(budget) : null, finalBudgetType, ...customFieldData.updateValues, projectId]
    );
    
    // Log changes to history
    for (const change of changes) {
      await logProjectHistory(
        Number(projectId),
        userId!,
        'updated',
        change.field,
        String(change.oldVal || ''),
        String(change.newVal || '')
      );
    }
    
    // Log project update
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'PROJECT_UPDATE',
      'Project',
      Number(projectId),
      projectName || oldProject.ProjectName,
      `Updated project: ${projectName || oldProject.ProjectName}`,
      req.ip,
      req.get('user-agent')
    );
    
    // If status changed, notify all team members (except current user)
    if (status !== undefined && status !== oldProject.Status) {
      // Resolve status names for notification text
      let oldStatusName = String(oldProject.Status);
      let newStatusName = String(status);
      try {
        const [oldStRes] = await pool.execute<RowDataPacket[]>('SELECT StatusName FROM ProjectStatusValues WHERE Id = ?', [oldProject.Status]);
        if (oldStRes.length > 0) oldStatusName = oldStRes[0].StatusName;
        const [newStRes] = await pool.execute<RowDataPacket[]>('SELECT StatusName FROM ProjectStatusValues WHERE Id = ?', [status]);
        if (newStRes.length > 0) newStatusName = newStRes[0].StatusName;
      } catch {}

      const [teamMembers] = await pool.execute<RowDataPacket[]>(
        `SELECT DISTINCT UserId FROM OrganizationMembers WHERE OrganizationId = ? AND UserId != ?`,
        [oldProject.OrganizationId, userId]
      );
      
      for (const member of teamMembers) {
        await createNotification(
          member.UserId,
          'project_status',
          'Project Status Changed',
          `Project "${projectName || oldProject.ProjectName}" status changed from "${oldStatusName}" to "${newStatusName}"`,
          `/projects/${projectId}`,
          undefined,
          Number(projectId)
        );
      }
    }

    // Sync application associations
    if (applicationIds !== undefined && Array.isArray(applicationIds)) {
      await pool.execute('DELETE FROM ApplicationProjects WHERE ProjectId = ?', [projectId]);
      for (const appId of applicationIds) {
        await pool.execute(
          'INSERT IGNORE INTO ApplicationProjects (ApplicationId, ProjectId) VALUES (?, ?)',
          [appId, projectId]
        );
      }
    }

    res.json({
      success: true,
      message: 'Project updated successfully'
    });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update project' 
    });
  }
});

// Delete project
/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: Delete a project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Project deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = req.params.id;

    // Get project name before deletion
    const [project] = await pool.execute<RowDataPacket[]>(
      'SELECT ProjectName FROM Projects WHERE Id = ? AND CreatedBy = ?',
      [projectId, userId]
    );

    if (project.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found or access denied' 
      });
    }

    const projectName = project[0].ProjectName;

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM Projects WHERE Id = ? AND CreatedBy = ?',
      [projectId, userId]
    );

    // Log project deletion
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'PROJECT_DELETE',
      'Project',
      Number(projectId),
      projectName,
      `Deleted project: ${projectName}`,
      req.ip,
      req.get('user-agent')
    );

    // Log to detailed history
    await logProjectHistory(
      Number(projectId),
      userId!,
      'deleted',
      null,
      projectName,
      null
    );

    // Log to detailed history
    await logProjectHistory(
      Number(projectId),
      userId!,
      'deleted',
      null,
      projectName,
      null
    );

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete project' 
    });
  }
});

export default router;
