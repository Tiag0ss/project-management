import { Router, Response } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { RowDataPacket } from 'mysql2';

const router = Router();

// Global search endpoint
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const query = req.query.q as string;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 50);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const offset = (page - 1) * limit;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Search query must be at least 2 characters' 
      });
    }

    const searchTerm = `%${query.trim()}%`;

    // Search tasks - user must be member of the organization
    const [tasks] = await pool.query<RowDataPacket[]>(
      `SELECT 
        t.Id, t.TaskName, t.Description,
        t.Status, tsv.StatusName, tsv.ColorCode as StatusColor,
        t.Priority, tpv.PriorityName, tpv.ColorCode as PriorityColor,
        p.Id as ProjectId, p.ProjectName,
        o.Id as OrganizationId, o.Name as OrganizationName,
        'task' as ResultType
       FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       JOIN Organizations o ON p.OrganizationId = o.Id
       JOIN OrganizationMembers om ON o.Id = om.OrganizationId AND om.UserId = ?
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
       WHERE (t.TaskName LIKE ? OR t.Description LIKE ?)
       ORDER BY t.TaskName ASC
       LIMIT ${limit} OFFSET ${offset}`,
      [userId, searchTerm, searchTerm]
    );

    // Search projects
    const [projects] = await pool.query<RowDataPacket[]>(
      `SELECT 
        p.Id, p.ProjectName, p.Description,
        p.Status, psv.StatusName, psv.ColorCode as StatusColor,
        o.Id as OrganizationId, o.Name as OrganizationName,
        'project' as ResultType
       FROM Projects p
       JOIN Organizations o ON p.OrganizationId = o.Id
       JOIN OrganizationMembers om ON o.Id = om.OrganizationId AND om.UserId = ?
       LEFT JOIN ProjectStatusValues psv ON p.Status = psv.Id
       WHERE (p.ProjectName LIKE ? OR p.Description LIKE ?)
       ORDER BY p.ProjectName ASC
       LIMIT ${limit} OFFSET ${offset}`,
      [userId, searchTerm, searchTerm]
    );

    // Search organizations
    const [organizations] = await pool.query<RowDataPacket[]>(
      `SELECT 
        o.Id, o.Name, o.Description,
        'organization' as ResultType
       FROM Organizations o
       JOIN OrganizationMembers om ON o.Id = om.OrganizationId AND om.UserId = ?
       WHERE (o.Name LIKE ? OR o.Description LIKE ?)
       ORDER BY o.Name ASC
       LIMIT ${limit} OFFSET ${offset}`,
      [userId, searchTerm, searchTerm]
    );

    // Search users (only users in same organizations)
    const [users] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT
        u.Id, u.Username, u.FirstName, u.LastName, u.Email,
        'user' as ResultType
       FROM Users u
       JOIN OrganizationMembers om ON u.Id = om.UserId
       WHERE om.OrganizationId IN (
         SELECT OrganizationId FROM OrganizationMembers WHERE UserId = ?
       )
       AND (u.Username LIKE ? OR u.FirstName LIKE ? OR u.LastName LIKE ? OR u.Email LIKE ?)
       ORDER BY u.FirstName, u.LastName ASC
       LIMIT ${limit} OFFSET ${offset}`,
      [userId, searchTerm, searchTerm, searchTerm, searchTerm]
    );

    const hasMore = tasks.length === limit || projects.length === limit || organizations.length === limit || users.length === limit;

    // Combine and sort results
    const results = {
      tasks: tasks,
      projects: projects,
      organizations: organizations,
      users: users,
      total: tasks.length + projects.length + organizations.length + users.length
    };

    res.json({ success: true, query: query.trim(), page, limit, hasMore, results });
  } catch (error) {
    console.error('Error performing search:', error);
    res.status(500).json({ success: false, message: 'Failed to perform search' });
  }
});

export default router;
