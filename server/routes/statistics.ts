import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket } from '../config/database';
import { cachedJson, AGGREGATE_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import logger from '../utils/logger';
import { queryTaskAnalytics } from '../queries/taskAnalytics';

const router = Router();

const formatDateOnly = (date: Date): string => date.toISOString().split('T')[0];

const getCurrentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    dateFrom: formatDateOnly(start),
    dateTo: formatDateOnly(end),
  };
};

/**
 * @swagger
 * tags:
 *   name: Statistics
 *   description: System statistics
 */

/**
 * @swagger
 * /api/statistics/public:
 *   get:
 *     summary: Get public system statistics
 *     tags: [Statistics]
 *     security: []
 *     responses:
 *       200:
 *         description: Public statistics (total users, projects, tasks)
 *       500:
 *         description: Server error
 */
// Get public statistics (no authentication required)
router.get('/public', async (req, res: Response) => {
  try {
    const payload = await cachedJson(
      cacheKeys.stats('public'),
      AGGREGATE_TTL_SECONDS,
      async () => {
        const [userStats] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as totalUsers FROM Users WHERE IsActive = 1'
        );

        const [projectStats] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as totalProjects FROM Projects'
        );

        const [taskStats] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as totalTasks FROM Tasks'
        );

        return {
          success: true,
          totalUsers: userStats[0]?.totalUsers || 0,
          totalProjects: projectStats[0]?.totalProjects || 0,
          totalTasks: taskStats[0]?.totalTasks || 0
        };
      }
    );

    res.json(payload);
  } catch (error) {
    logger.error('Get public statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

/**
 * @swagger
 * /api/statistics/global:
 *   get:
 *     summary: Get global statistics for the authenticated user
 *     tags: [Statistics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Global statistics
 *       401:
 *         description: Unauthorized
 */
// Get global statistics for admin users
router.get('/global', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const rawPeriod = Array.isArray(req.query.period) ? req.query.period[0] : req.query.period;
    const rawDateFrom = Array.isArray(req.query.dateFrom) ? req.query.dateFrom[0] : req.query.dateFrom;
    const rawDateTo = Array.isArray(req.query.dateTo) ? req.query.dateTo[0] : req.query.dateTo;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const isAllTime = rawPeriod === 'allTime';

    const defaultRange = getCurrentMonthRange();
    const dateFrom = typeof rawDateFrom === 'string' && datePattern.test(rawDateFrom)
      ? rawDateFrom
      : defaultRange.dateFrom;
    const dateTo = typeof rawDateTo === 'string' && datePattern.test(rawDateTo)
      ? rawDateTo
      : defaultRange.dateTo;

    const scope = `global:${userId}:${isAllTime ? 'allTime' : 'range'}:${dateFrom}:${dateTo}`;
    const payload = await cachedJson(
      cacheKeys.stats(scope),
      AGGREGATE_TTL_SECONDS,
      async () => {
        const [userCheck] = await pool.execute<RowDataPacket[]>(
          'SELECT isAdmin FROM Users WHERE Id = ?',
          [userId]
        );

        if (!userCheck[0]?.isAdmin) {
          return {
            forbidden: true as const,
          };
        }

        const [orgStats] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as totalOrganizations FROM Organizations'
        );

        const [customerStats] = await pool.execute<RowDataPacket[]>(
          'SELECT COUNT(*) as totalCustomers FROM Customers'
        );

        const [userStats] = await pool.execute<RowDataPacket[]>(`
          SELECT 
            COUNT(*) as totalUsers,
            SUM(CASE WHEN isAdmin = 1 THEN 1 ELSE 0 END) as adminUsers,
            SUM(CASE WHEN CustomerId IS NOT NULL THEN 1 ELSE 0 END) as customerUsers,
            SUM(CASE WHEN isAdmin = 0 AND CustomerId IS NULL THEN 1 ELSE 0 END) as regularUsers
          FROM Users
        `);

        const [projectStats] = await pool.execute<RowDataPacket[]>(`
          SELECT 
            COUNT(*) as totalProjects,
            SUM(CASE WHEN COALESCE(psv.IsClosed, 0) = 0 AND COALESCE(psv.IsCancelled, 0) = 0 THEN 1 ELSE 0 END) as activeProjects,
            SUM(CASE WHEN COALESCE(psv.IsClosed, 0) = 1 THEN 1 ELSE 0 END) as completedProjects
          FROM Projects p
          LEFT JOIN ProjectStatusValues psv ON p.Status = psv.Id
        `);

        const [taskStats] = await pool.execute<RowDataPacket[]>(`
          SELECT 
            SUM(CASE WHEN COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 THEN 1 ELSE 0 END) as totalTasks,
            SUM(CASE WHEN COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 AND COALESCE(tsv.IsClosed, 0) = 1 THEN 1 ELSE 0 END) as completedTasks,
            SUM(CASE WHEN COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 AND COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0 AND t.PlannedStartDate IS NOT NULL THEN 1 ELSE 0 END) as inProgressTasks,
            SUM(CASE WHEN COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 AND t.PlannedEndDate < CURDATE() AND COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0 THEN 1 ELSE 0 END) as overdueTasks
          FROM Tasks t
          LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
          WHERE t.ParentTaskId IS NULL
        `);

        const [unplannedStats] = await pool.execute<RowDataPacket[]>(`
          SELECT COUNT(*) as unplannedTasks
          FROM Tasks t
          LEFT JOIN TaskAllocations ta ON t.Id = ta.TaskId
          LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
          WHERE t.ParentTaskId IS NULL
            AND ta.TaskId IS NULL
            AND COALESCE(t.UnscheduledWork, 0) = 0
            AND COALESCE(tsv.IsClosed, 0) = 0
            AND COALESCE(tsv.IsCancelled, 0) = 0
            AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
        `);

        const [hoursStats] = await pool.execute<RowDataPacket[]>(`
          SELECT 
            COALESCE(SUM(CASE WHEN p.IsHobby = 0 THEN t.EstimatedHours ELSE 0 END), 0) as totalEstimatedHours,
            COALESCE(SUM(CASE WHEN p.IsHobby = 1 THEN t.EstimatedHours ELSE 0 END), 0) as totalEstimatedHoursHobby
          FROM Tasks t
          INNER JOIN Projects p ON t.ProjectId = p.Id
          LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
          WHERE COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
            AND NOT EXISTS (
              SELECT 1
              FROM Tasks tChild
              WHERE tChild.ProjectId = t.ProjectId
                AND tChild.ParentTaskId = t.Id
            )
        `);

        const [workedHoursStats] = await pool.execute<RowDataPacket[]>(`
          SELECT 
            COALESCE(SUM(CASE WHEN p.IsHobby = 0 THEN te.Hours ELSE 0 END), 0) as totalWorkedHours,
            COALESCE(SUM(CASE WHEN p.IsHobby = 1 THEN te.Hours ELSE 0 END), 0) as totalWorkedHoursHobby
          FROM TimeEntries te
          INNER JOIN Tasks t ON te.TaskId = t.Id
          INNER JOIN Projects p ON t.ProjectId = p.Id
          LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
          WHERE COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
        `);

        const [weekHoursStats] = await pool.execute<RowDataPacket[]>(`
          SELECT 
            COALESCE(SUM(CASE WHEN p.IsHobby = 1 THEN te.Hours ELSE 0 END), 0) as hobbyHoursThisWeek,
            COALESCE(SUM(CASE WHEN p.IsHobby = 0 THEN te.Hours ELSE 0 END), 0) as normalHoursThisWeek
          FROM TimeEntries te
          INNER JOIN Tasks t ON te.TaskId = t.Id
          INNER JOIN Projects p ON t.ProjectId = p.Id
          LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
          WHERE te.WorkDate >= DATE_SUB(CURDATE(), INTERVAL DAYOFWEEK(CURDATE())-1 DAY)
            AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
        `);

        let monthHoursStats: RowDataPacket[] = [];
        if (isAllTime) {
          [monthHoursStats] = await pool.execute<RowDataPacket[]>(`
            SELECT 
              COALESCE(SUM(CASE WHEN p.IsHobby = 1 THEN te.Hours ELSE 0 END), 0) as hobbyHoursThisMonth,
              COALESCE(SUM(CASE WHEN p.IsHobby = 0 THEN te.Hours ELSE 0 END), 0) as normalHoursThisMonth
            FROM TimeEntries te
            INNER JOIN Tasks t ON te.TaskId = t.Id
            INNER JOIN Projects p ON t.ProjectId = p.Id
            LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
            WHERE COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
          `);
        } else {
          [monthHoursStats] = await pool.execute<RowDataPacket[]>(`
            SELECT 
              COALESCE(SUM(CASE WHEN p.IsHobby = 1 THEN te.Hours ELSE 0 END), 0) as hobbyHoursThisMonth,
              COALESCE(SUM(CASE WHEN p.IsHobby = 0 THEN te.Hours ELSE 0 END), 0) as normalHoursThisMonth
            FROM TimeEntries te
            INNER JOIN Tasks t ON te.TaskId = t.Id
            INNER JOIN Projects p ON t.ProjectId = p.Id
            LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
            WHERE te.WorkDate BETWEEN ? AND ?
              AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
          `, [dateFrom, dateTo]);
        }

        let topProjects: RowDataPacket[] = [];
        if (isAllTime) {
          [topProjects] = await pool.execute<RowDataPacket[]>(`
            SELECT 
              p.Id,
              p.ProjectName,
              o.Name as OrganizationName,
              COALESCE(SUM(te.Hours), 0) as hoursThisMonth
            FROM Projects p
            LEFT JOIN Organizations o ON p.OrganizationId = o.Id
            LEFT JOIN Tasks t ON t.ProjectId = p.Id
            LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
            LEFT JOIN TimeEntries te ON te.TaskId = t.Id
              AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
            GROUP BY p.Id, p.ProjectName, o.Name
            ORDER BY hoursThisMonth DESC
            LIMIT 5
          `);
        } else {
          [topProjects] = await pool.execute<RowDataPacket[]>(`
            SELECT 
              p.Id,
              p.ProjectName,
              o.Name as OrganizationName,
              COALESCE(SUM(te.Hours), 0) as hoursThisMonth
            FROM Projects p
            LEFT JOIN Organizations o ON p.OrganizationId = o.Id
            LEFT JOIN Tasks t ON t.ProjectId = p.Id
            LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
            LEFT JOIN TimeEntries te ON te.TaskId = t.Id 
              AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
              AND te.WorkDate BETWEEN ? AND ?
            GROUP BY p.Id, p.ProjectName, o.Name
            ORDER BY hoursThisMonth DESC
            LIMIT 5
          `, [dateFrom, dateTo]);
        }

        let topUsers: RowDataPacket[] = [];
        if (isAllTime) {
          [topUsers] = await pool.execute<RowDataPacket[]>(`
            SELECT 
              u.Id,
              u.FirstName,
              u.LastName,
              u.Username,
              COALESCE(SUM(CASE WHEN t.Id IS NOT NULL AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 THEN te.Hours ELSE 0 END), 0) as hoursThisMonth
            FROM Users u
            LEFT JOIN TimeEntries te ON te.UserId = u.Id
            LEFT JOIN Tasks t ON te.TaskId = t.Id
            LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
              AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
            WHERE u.CustomerId IS NULL
            GROUP BY u.Id, u.FirstName, u.LastName, u.Username
            HAVING COALESCE(SUM(CASE WHEN t.Id IS NOT NULL AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 THEN te.Hours ELSE 0 END), 0) > 0
            ORDER BY hoursThisMonth DESC
            LIMIT 5
          `);
        } else {
          [topUsers] = await pool.execute<RowDataPacket[]>(`
            SELECT 
              u.Id,
              u.FirstName,
              u.LastName,
              u.Username,
              COALESCE(SUM(CASE WHEN t.Id IS NOT NULL AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 THEN te.Hours ELSE 0 END), 0) as hoursThisMonth
            FROM Users u
            LEFT JOIN TimeEntries te ON te.UserId = u.Id 
              AND te.WorkDate BETWEEN ? AND ?
            LEFT JOIN Tasks t ON te.TaskId = t.Id
            LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
              AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
            WHERE u.CustomerId IS NULL
            GROUP BY u.Id, u.FirstName, u.LastName, u.Username
            HAVING COALESCE(SUM(CASE WHEN t.Id IS NOT NULL AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 THEN te.Hours ELSE 0 END), 0) > 0
            ORDER BY hoursThisMonth DESC
            LIMIT 5
          `, [dateFrom, dateTo]);
        }

        const [ticketStats] = await pool.execute<RowDataPacket[]>(`
          SELECT 
            COUNT(*) as totalTickets,
            SUM(CASE WHEN tsv.StatusType = 'open' THEN 1 ELSE 0 END) as openTickets,
            SUM(CASE WHEN tsv.StatusType = 'in_progress' THEN 1 ELSE 0 END) as inProgressTickets,
            SUM(CASE WHEN tsv.StatusType = 'waiting' THEN 1 ELSE 0 END) as waitingResponseTickets,
            SUM(CASE WHEN tsv.StatusType = 'resolved' THEN 1 ELSE 0 END) as resolvedTickets,
            SUM(CASE WHEN tsv.StatusType = 'closed' THEN 1 ELSE 0 END) as closedTickets,
            SUM(CASE WHEN COALESCE(tsv.IsClosed, 0) = 0 THEN 1 ELSE 0 END) as unresolvedTickets
          FROM Tickets t
          LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
        `);

        return {
          success: true,
          stats: {
            organizations: {
              total: orgStats[0]?.totalOrganizations || 0
            },
            customers: {
              total: customerStats[0]?.totalCustomers || 0
            },
            users: {
              total: userStats[0]?.totalUsers || 0,
              admins: userStats[0]?.adminUsers || 0,
              regular: userStats[0]?.regularUsers || 0,
              customerUsers: userStats[0]?.customerUsers || 0
            },
            projects: {
              total: projectStats[0]?.totalProjects || 0,
              active: projectStats[0]?.activeProjects || 0,
              completed: projectStats[0]?.completedProjects || 0
            },
            tasks: {
              total: taskStats[0]?.totalTasks || 0,
              completed: taskStats[0]?.completedTasks || 0,
              inProgress: taskStats[0]?.inProgressTasks || 0,
              overdue: taskStats[0]?.overdueTasks || 0,
              unplanned: unplannedStats[0]?.unplannedTasks || 0
            },
            tickets: {
              total: ticketStats[0]?.totalTickets || 0,
              open: ticketStats[0]?.openTickets || 0,
              inProgress: ticketStats[0]?.inProgressTickets || 0,
              waitingResponse: ticketStats[0]?.waitingResponseTickets || 0,
              resolved: ticketStats[0]?.resolvedTickets || 0,
              closed: ticketStats[0]?.closedTickets || 0,
              unresolvedCount: ticketStats[0]?.unresolvedTickets || 0
            },
            hours: {
              totalEstimated: Number(hoursStats[0]?.totalEstimatedHours || 0),
              totalWorked: Number(workedHoursStats[0]?.totalWorkedHours || 0),
              thisWeek: Number(weekHoursStats[0]?.normalHoursThisWeek || 0),
              thisMonth: Number(monthHoursStats[0]?.normalHoursThisMonth || 0),
              totalEstimatedHobby: Number(hoursStats[0]?.totalEstimatedHoursHobby || 0),
              totalWorkedHobby: Number(workedHoursStats[0]?.totalWorkedHoursHobby || 0),
              thisWeekHobby: Number(weekHoursStats[0]?.hobbyHoursThisWeek || 0),
              thisMonthHobby: Number(monthHoursStats[0]?.hobbyHoursThisMonth || 0)
            },
            topProjects: topProjects.map(p => ({
              id: p.Id,
              name: p.ProjectName,
              organization: p.OrganizationName,
              hours: Number(p.hoursThisMonth)
            })),
            topUsers: topUsers.map(u => ({
              id: u.Id,
              name: u.FirstName && u.LastName ? `${u.FirstName} ${u.LastName}` : u.Username,
              hours: Number(u.hoursThisMonth)
            })),
            taskAnalytics: await queryTaskAnalytics({}),
          }
        };
      }
    );

    if ('forbidden' in payload && payload.forbidden) {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can access global statistics'
      });
    }

    res.json(payload);
  } catch (error) {
    logger.error('Get global statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch global statistics'
    });
  }
});

export default router;
