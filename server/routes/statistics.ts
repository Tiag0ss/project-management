import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

const router = Router();

// Get public statistics (no authentication required)
router.get('/public', async (req, res: Response) => {
  try {
    // Get total active users
    const [userStats] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as totalUsers FROM Users WHERE IsActive = 1'
    );

    // Get total projects
    const [projectStats] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as totalProjects FROM Projects'
    );

    // Get total tasks
    const [taskStats] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as totalTasks FROM Tasks'
    );

    res.json({
      success: true,
      totalUsers: userStats[0]?.totalUsers || 0,
      totalProjects: projectStats[0]?.totalProjects || 0,
      totalTasks: taskStats[0]?.totalTasks || 0
    });
  } catch (error) {
    console.error('Get public statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// Get global statistics for admin users
router.get('/global', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Check if user is admin
    const [userCheck] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin FROM Users WHERE Id = ?',
      [userId]
    );

    if (!userCheck[0]?.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only administrators can access global statistics'
      });
    }

    // Get total organizations
    const [orgStats] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as totalOrganizations FROM Organizations'
    );

    // Get total customers
    const [customerStats] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as totalCustomers FROM Customers'
    );

    // Get total users and breakdown
    const [userStats] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        COUNT(*) as totalUsers,
        SUM(CASE WHEN isAdmin = 1 THEN 1 ELSE 0 END) as adminUsers,
        SUM(CASE WHEN CustomerId IS NOT NULL THEN 1 ELSE 0 END) as customerUsers,
        SUM(CASE WHEN isAdmin = 0 AND CustomerId IS NULL THEN 1 ELSE 0 END) as regularUsers
      FROM Users
    `);

    // Get project statistics (using ProjectStatusValues flags)
    const [projectStats] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        COUNT(*) as totalProjects,
        SUM(CASE WHEN COALESCE(psv.IsClosed, 0) = 0 AND COALESCE(psv.IsCancelled, 0) = 0 THEN 1 ELSE 0 END) as activeProjects,
        SUM(CASE WHEN COALESCE(psv.IsClosed, 0) = 1 THEN 1 ELSE 0 END) as completedProjects
      FROM Projects p
      LEFT JOIN ProjectStatusValues psv ON p.Status = psv.Id
    `);

    // Get task statistics (using TaskStatusValues flags instead of hardcoded status names)
    const [taskStats] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        COUNT(*) as totalTasks,
        SUM(CASE WHEN COALESCE(tsv.IsClosed, 0) = 1 THEN 1 ELSE 0 END) as completedTasks,
        SUM(CASE WHEN COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0 AND t.PlannedStartDate IS NOT NULL THEN 1 ELSE 0 END) as inProgressTasks,
        SUM(CASE WHEN t.PlannedEndDate < CURDATE() AND COALESCE(tsv.IsClosed, 0) = 0 AND COALESCE(tsv.IsCancelled, 0) = 0 THEN 1 ELSE 0 END) as overdueTasks
      FROM Tasks t
      LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
      WHERE t.ParentTaskId IS NULL
    `);

    // Get unplanned tasks count (parent tasks without allocations, not closed/cancelled)
    const [unplannedStats] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) as unplannedTasks
      FROM Tasks t
      LEFT JOIN TaskAllocations ta ON t.Id = ta.TaskId
      LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
      WHERE t.ParentTaskId IS NULL
        AND ta.TaskId IS NULL
        AND COALESCE(tsv.IsClosed, 0) = 0
        AND COALESCE(tsv.IsCancelled, 0) = 0
    `);

    // Get hours statistics
    const [hoursStats] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        COALESCE(SUM(t.EstimatedHours), 0) as totalEstimatedHours,
        COALESCE((SELECT SUM(Hours) FROM TimeEntries), 0) as totalWorkedHours
      FROM Tasks t
      WHERE t.ParentTaskId IS NULL
    `);

    // Get this week's hours across all users
    const [weekHoursStats] = await pool.execute<RowDataPacket[]>(`
      SELECT COALESCE(SUM(Hours), 0) as totalHoursThisWeek
      FROM TimeEntries
      WHERE WorkDate >= DATE_SUB(CURDATE(), INTERVAL DAYOFWEEK(CURDATE())-1 DAY)
    `);

    // Get this month's hours across all users
    const [monthHoursStats] = await pool.execute<RowDataPacket[]>(`
      SELECT COALESCE(SUM(Hours), 0) as totalHoursThisMonth
      FROM TimeEntries
      WHERE YEAR(WorkDate) = YEAR(CURDATE()) AND MONTH(WorkDate) = MONTH(CURDATE())
    `);

    // Get top 5 projects by hours this month
    const [topProjects] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        p.Id,
        p.ProjectName,
        o.Name as OrganizationName,
        COALESCE(SUM(te.Hours), 0) as hoursThisMonth
      FROM Projects p
      LEFT JOIN Organizations o ON p.OrganizationId = o.Id
      LEFT JOIN Tasks t ON t.ProjectId = p.Id
      LEFT JOIN TimeEntries te ON te.TaskId = t.Id 
        AND YEAR(te.WorkDate) = YEAR(CURDATE()) 
        AND MONTH(te.WorkDate) = MONTH(CURDATE())
      GROUP BY p.Id, p.ProjectName, o.Name
      ORDER BY hoursThisMonth DESC
      LIMIT 5
    `);

    // Get top 5 users by hours this month
    const [topUsers] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        u.Id,
        u.FirstName,
        u.LastName,
        u.Username,
        COALESCE(SUM(te.Hours), 0) as hoursThisMonth
      FROM Users u
      LEFT JOIN TimeEntries te ON te.UserId = u.Id 
        AND YEAR(te.WorkDate) = YEAR(CURDATE()) 
        AND MONTH(te.WorkDate) = MONTH(CURDATE())
      WHERE u.CustomerId IS NULL
      GROUP BY u.Id, u.FirstName, u.LastName, u.Username
      HAVING hoursThisMonth > 0
      ORDER BY hoursThisMonth DESC
      LIMIT 5
    `);

    // Get ticket statistics
    const [ticketStats] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        COUNT(*) as totalTickets,
        SUM(CASE WHEN Status = 'Open' THEN 1 ELSE 0 END) as openTickets,
        SUM(CASE WHEN Status = 'In Progress' THEN 1 ELSE 0 END) as inProgressTickets,
        SUM(CASE WHEN Status = 'With Developer' THEN 1 ELSE 0 END) as withDeveloperTickets,
        SUM(CASE WHEN Status = 'Scheduled' THEN 1 ELSE 0 END) as scheduledTickets,
        SUM(CASE WHEN Status = 'Waiting Response' THEN 1 ELSE 0 END) as waitingResponseTickets,
        SUM(CASE WHEN Status = 'Resolved' THEN 1 ELSE 0 END) as resolvedTickets,
        SUM(CASE WHEN Status = 'Closed' THEN 1 ELSE 0 END) as closedTickets,
        SUM(CASE WHEN Status NOT IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as unresolvedTickets
      FROM Tickets
    `);

    res.json({
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
          withDeveloper: ticketStats[0]?.withDeveloperTickets || 0,
          scheduled: ticketStats[0]?.scheduledTickets || 0,
          waitingResponse: ticketStats[0]?.waitingResponseTickets || 0,
          resolved: ticketStats[0]?.resolvedTickets || 0,
          closed: ticketStats[0]?.closedTickets || 0,
          unresolvedCount: ticketStats[0]?.unresolvedTickets || 0
        },
        hours: {
          totalEstimated: Number(hoursStats[0]?.totalEstimatedHours || 0),
          totalWorked: Number(hoursStats[0]?.totalWorkedHours || 0),
          thisWeek: Number(weekHoursStats[0]?.totalHoursThisWeek || 0),
          thisMonth: Number(monthHoursStats[0]?.totalHoursThisMonth || 0)
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
        }))
      }
    });
  } catch (error) {
    console.error('Get global statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch global statistics'
    });
  }
});

export default router;
