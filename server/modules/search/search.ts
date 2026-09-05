import { Router, Response } from 'express';
import { createHash } from 'crypto';
import { pool } from '../../config/database';
import { dbProvider } from '../../config/database';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import { RowDataPacket } from '../../config/database';
import { cachedJson, AGGREGATE_TTL_SECONDS } from '../../utils/cachedJson';
import { cacheKeys } from '../../services/cacheKeys';
import logger from '../../utils/logger';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Search
 *   description: Global search across entities
 */

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Global search across tasks, projects, and other entities
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term (minimum 2 characters)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of results
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Query too short
 *       401:
 *         description: Unauthorized
 */
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

    const trimmedQuery = query.trim();
    const queryTokens = trimmedQuery.split(/\s+/).filter(Boolean);
    const tagTokens = queryTokens
      .filter(token => token.toLowerCase().startsWith('tag:'))
      .map(token => token.slice(4).trim().toLowerCase())
      .filter(Boolean);
    const normalizedTags = Array.from(new Set(tagTokens));
    const textTerms = queryTokens.filter(token => !token.toLowerCase().startsWith('tag:')).join(' ').trim();

    if (!textTerms && normalizedTags.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Provide text or tag filters (example: tag:backend auth)'
      });
    }

    const cacheHash = createHash('sha256')
      .update(`${trimmedQuery}:${userId}:${limit}:${page}`)
      .digest('hex');

    const payload = await cachedJson(
      cacheKeys.search(cacheHash),
      AGGREGATE_TTL_SECONDS,
      async () => {
        const searchTerm = textTerms ? `%${textTerms}%` : null;
        const tagPlaceholders = normalizedTags.map(() => '?').join(',');
        const hasTagFilter = normalizedTags.length > 0;
        const gitHubIssueSearchExpr = dbProvider === 'mssql'
          ? 'CAST(t.GitHubIssueNumber AS NVARCHAR(50))'
          : 'CAST(t.GitHubIssueNumber AS CHAR)';
        const giteaIssueSearchExpr = dbProvider === 'mssql'
          ? 'CAST(t.GiteaIssueNumber AS NVARCHAR(50))'
          : 'CAST(t.GiteaIssueNumber AS CHAR)';

        const [ticketSetting] = await pool.execute<RowDataPacket[]>(
          'SELECT SettingValue FROM SystemSettings WHERE SettingKey = ?',
          ['internalTicketsEnabled']
        );
        const internalTicketsEnabled = ticketSetting.length === 0 || ticketSetting[0].SettingValue !== 'false';

        const taskParams: any[] = [userId];
        const taskConditions: string[] = [];

        if (searchTerm) {
          taskConditions.push(`(
            t.TaskName LIKE ?
            OR t.Description LIKE ?
            OR t.JiraIssueKey LIKE ?
            OR t.ExternalIssueId LIKE ?
            OR ${gitHubIssueSearchExpr} LIKE ?
            OR ${giteaIssueSearchExpr} LIKE ?
          )`);
          taskParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (hasTagFilter) {
          taskConditions.push(`t.Id IN (
            SELECT tt2.TaskId
            FROM TaskTags tt2
            JOIN Tags tg2 ON tg2.Id = tt2.TagId
            WHERE LOWER(tg2.Name) IN (${tagPlaceholders})
            GROUP BY tt2.TaskId
            HAVING COUNT(DISTINCT LOWER(tg2.Name)) = ?
          )`);
          taskParams.push(...normalizedTags, normalizedTags.length);
        }

        const taskWhereSql = taskConditions.length > 0 ? `AND ${taskConditions.join(' AND ')}` : '';

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
           WHERE 1 = 1
           ${taskWhereSql}
           ORDER BY t.TaskName ASC
           LIMIT ${limit} OFFSET ${offset}`,
          taskParams
        );

        const ticketParams: any[] = [userId];
        const ticketConditions: string[] = [];

        if (searchTerm) {
          ticketConditions.push('(t.Title LIKE ? OR t.TicketNumber LIKE ? OR t.Description LIKE ? OR t.ExternalTicketId LIKE ?)');
          ticketParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (hasTagFilter) {
          ticketConditions.push(`t.ProjectId IN (
            SELECT t2.ProjectId
            FROM Tasks t2
            JOIN TaskTags tt2 ON tt2.TaskId = t2.Id
            JOIN Tags tg2 ON tg2.Id = tt2.TagId
            WHERE LOWER(tg2.Name) IN (${tagPlaceholders})
            GROUP BY t2.ProjectId
            HAVING COUNT(DISTINCT LOWER(tg2.Name)) = ?
          )`);
          ticketParams.push(...normalizedTags, normalizedTags.length);
        }

        const ticketWhereSql = ticketConditions.length > 0 ? `AND ${ticketConditions.join(' AND ')}` : '';

        const tickets: RowDataPacket[] = internalTicketsEnabled
          ? (await pool.query<RowDataPacket[]>(
              `SELECT
                t.Id,
                t.TicketNumber,
                t.Title,
                t.Description,
                t.ProjectId,
                p.ProjectName,
                o.Id as OrganizationId,
                o.Name as OrganizationName,
                tsv.StatusName,
                tpv.PriorityName,
                'ticket' as ResultType
               FROM Tickets t
               JOIN Organizations o ON t.OrganizationId = o.Id
               JOIN OrganizationMembers om ON o.Id = om.OrganizationId AND om.UserId = ?
               LEFT JOIN Projects p ON t.ProjectId = p.Id
               LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
               LEFT JOIN TicketPriorityValues tpv ON t.PriorityId = tpv.Id
               WHERE 1 = 1
               ${ticketWhereSql}
               ORDER BY t.CreatedAt DESC
               LIMIT ${limit} OFFSET ${offset}`,
              ticketParams
            ))[0]
          : [];

        const projectParams: any[] = [userId];
        const projectConditions: string[] = [];

        if (searchTerm) {
          projectConditions.push('(p.ProjectName LIKE ? OR p.Description LIKE ? OR p.JiraBoardId LIKE ?)');
          projectParams.push(searchTerm, searchTerm, searchTerm);
        }

        if (hasTagFilter) {
          projectConditions.push(`p.Id IN (
            SELECT t2.ProjectId
            FROM Tasks t2
            JOIN TaskTags tt2 ON tt2.TaskId = t2.Id
            JOIN Tags tg2 ON tg2.Id = tt2.TagId
            WHERE LOWER(tg2.Name) IN (${tagPlaceholders})
            GROUP BY t2.ProjectId
            HAVING COUNT(DISTINCT LOWER(tg2.Name)) = ?
          )`);
          projectParams.push(...normalizedTags, normalizedTags.length);
        }

        const projectWhereSql = projectConditions.length > 0 ? `AND ${projectConditions.join(' AND ')}` : '';

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
           WHERE 1 = 1
           ${projectWhereSql}
           ORDER BY p.ProjectName ASC
           LIMIT ${limit} OFFSET ${offset}`,
          projectParams
        );

        const organizationParams: any[] = [userId];
        const organizationConditions: string[] = [];

        if (searchTerm) {
          organizationConditions.push('(o.Name LIKE ? OR o.Description LIKE ?)');
          organizationParams.push(searchTerm, searchTerm);
        }

        if (hasTagFilter) {
          organizationConditions.push(`o.Id IN (
            SELECT DISTINCT tgs.OrganizationId
            FROM Tags tgs
            WHERE LOWER(tgs.Name) IN (${tagPlaceholders})
          )`);
          organizationParams.push(...normalizedTags);
        }

        const organizationWhereSql = organizationConditions.length > 0 ? `AND ${organizationConditions.join(' AND ')}` : '';

        const [organizations] = await pool.query<RowDataPacket[]>(
          `SELECT 
            o.Id, o.Name, o.Description,
            'organization' as ResultType
           FROM Organizations o
           JOIN OrganizationMembers om ON o.Id = om.OrganizationId AND om.UserId = ?
           WHERE 1 = 1
           ${organizationWhereSql}
           ORDER BY o.Name ASC
           LIMIT ${limit} OFFSET ${offset}`,
          organizationParams
        );

        const userParams: any[] = [userId];
        const userConditions: string[] = [];

        if (searchTerm) {
          userConditions.push('(u.Username LIKE ? OR u.FirstName LIKE ? OR u.LastName LIKE ? OR u.Email LIKE ?)');
          userParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (hasTagFilter) {
          userConditions.push(`om.OrganizationId IN (
            SELECT DISTINCT tgs.OrganizationId
            FROM Tags tgs
            WHERE LOWER(tgs.Name) IN (${tagPlaceholders})
          )`);
          userParams.push(...normalizedTags);
        }

        const userWhereSql = userConditions.length > 0 ? `AND ${userConditions.join(' AND ')}` : '';

        const [users] = await pool.query<RowDataPacket[]>(
          `SELECT DISTINCT
            u.Id, u.Username, u.FirstName, u.LastName, u.Email,
            'user' as ResultType
           FROM Users u
           JOIN OrganizationMembers om ON u.Id = om.UserId
           WHERE om.OrganizationId IN (
             SELECT OrganizationId FROM OrganizationMembers WHERE UserId = ?
           )
           ${userWhereSql}
           ORDER BY u.FirstName, u.LastName ASC
           LIMIT ${limit} OFFSET ${offset}`,
          userParams
        );

        const hasMore = tasks.length === limit || tickets.length === limit || projects.length === limit || organizations.length === limit || users.length === limit;

        return {
          success: true,
          query: trimmedQuery,
          queryText: textTerms,
          queryTags: normalizedTags,
          page,
          limit,
          hasMore,
          results: {
            tasks,
            tickets,
            projects,
            organizations,
            users,
            total: tasks.length + tickets.length + projects.length + organizations.length + users.length
          }
        };
      }
    );

    res.json(payload);
  } catch (error) {
    logger.error('Error performing search:', error);
    res.status(500).json({ success: false, message: 'Failed to perform search' });
  }
});

export default router;
