import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { pool } from '../config/database';
import { prepareCustomFieldData } from '../utils/customFields';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { cachedJson, ENTITY_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import { invalidateByEntity } from '../services/cacheInvalidation';

const router = express.Router();

const parseBooleanSetting = (value: unknown): boolean => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

const isAutoApproveTimeEntriesEnabled = async (): Promise<boolean> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT SettingValue FROM SystemSettings WHERE SettingKey = ? LIMIT 1`,
    ['autoApproveTimeEntries']
  );

  return rows.length > 0 && parseBooleanSetting(rows[0].SettingValue);
};

const canManageTeamEntry = async (entryId: string, currentUserId: number | undefined) => {
  const [entries] = await pool.execute<RowDataPacket[]>(
    `SELECT te.Id, te.UserId, te.ApprovalStatus, u.TeamLeaderId
     FROM TimeEntries te
     INNER JOIN Users u ON te.UserId = u.Id
     WHERE te.Id = ?`,
    [entryId]
  );

  if (entries.length === 0) {
    return { ok: false as const, status: 404 as const, message: 'Time entry not found' };
  }

  const entry = entries[0];

  const [callerRows] = await pool.execute<RowDataPacket[]>(
    `SELECT IsAdmin FROM Users WHERE Id = ?`,
    [currentUserId]
  );

  const isAdmin = callerRows.length > 0 && !!callerRows[0].IsAdmin;
  const isTeamLeader = entry.TeamLeaderId === currentUserId;

  if (!isAdmin && !isTeamLeader) {
    return { ok: false as const, status: 403 as const, message: 'Access denied - not authorized to manage this entry' };
  }

  return { ok: true as const, entry };
};

/**
 * @swagger
 * /api/time-entries/project/{projectId}:
 *   get:
 *     summary: Get all time entries for a project
 *     tags: [TimeEntries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         description: Project ID
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of time entries for the project
 *       404:
 *         description: Project not found or access denied
 *       500:
 *         description: Internal server error
 */
/**
 * @swagger
 * tags:
 *   name: TimeEntries
 *   description: Time tracking endpoints
 */

// Get time entries for a project
router.get('/project/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;

    // Verify user has access to this project
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, req.user?.userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    const entries = await cachedJson(
      cacheKeys.timeEntriesPlanning(`project:${projectId}`),
      ENTITY_TTL_SECONDS,
      async () => {
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT te.*, t.TaskName, u.Username, u.FirstName, u.LastName
           FROM TimeEntries te
           INNER JOIN Tasks t ON te.TaskId = t.Id
           LEFT JOIN Users u ON te.UserId = u.Id
           WHERE t.ProjectId = ?
           ORDER BY te.WorkDate DESC, t.TaskName`,
          [projectId]
        );
        return rows;
      }
    );

    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error fetching project time entries:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch project time entries' });
  }
});

/**
 * @swagger
 * /api/time-entries/my-entries:
 *   get:
 *     summary: Get current user's time entries
 *     tags: [TimeEntries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         description: Filter from this date (YYYY-MM-DD)
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         description: Filter to this date (YYYY-MM-DD)
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: List of time entries for the current user
 *       500:
 *         description: Internal server error
 */
// Get time entries for current user
router.get('/my-entries', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { startDate, endDate } = req.query;
    const cacheScope = `user:${userId}:my:start:${String(startDate || 'all')}:end:${String(endDate || 'all')}`;

    const entries = await cachedJson(
      cacheKeys.timeEntriesPlanning(cacheScope),
      ENTITY_TTL_SECONDS,
      async () => {
        let query = `
          SELECT te.*, t.TaskName, t.JiraIssueKey, t.ProjectId, p.ProjectName, p.IsHobby, c.Name as CustomerName
          FROM TimeEntries te
          INNER JOIN Tasks t ON te.TaskId = t.Id
          INNER JOIN Projects p ON t.ProjectId = p.Id
          LEFT JOIN Customers c ON p.CustomerId = c.Id
          WHERE te.UserId = ?
        `;
        const params: Array<string | number> = [userId as number];

        if (startDate && endDate) {
          query += ` AND te.WorkDate BETWEEN ? AND ?`;
          params.push(String(startDate), String(endDate));
        }

        query += ` ORDER BY te.WorkDate DESC, te.CreatedAt DESC`;

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);
        return rows;
      }
    );

    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch time entries' });
  }
});

// Combined: time entries + call records for web reports
router.get('/my-entries-and-calls', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { startDate, endDate } = req.query;

    const teParams: any[] = [userId];
    let teQuery = `
      SELECT
        'TimeEntry'         AS RecordType,
        te.WorkDate         AS WorkDate,
        te.Hours            AS Hours,
        0                   AS DurationMinutes,
        t.TaskName          AS TaskName,
        p.ProjectName       AS ProjectName,
        te.Description      AS Description,
        te.StartTime        AS StartTime,
        te.EndTime          AS EndTime,
        NULL                AS CallType,
        NULL                AS Subject,
        NULL                AS Participants,
        COALESCE(c.ExternalName, c.Name) AS CustomerName,
        o.Name              AS OrganizationName
      FROM TimeEntries te
      INNER JOIN Tasks t ON te.TaskId = t.Id
      INNER JOIN Projects p ON t.ProjectId = p.Id
      LEFT JOIN Customers c ON p.CustomerId = c.Id
      LEFT JOIN Organizations o ON p.OrganizationId = o.Id
      WHERE te.UserId = ?
    `;
    if (startDate && endDate) {
      teQuery += ` AND te.WorkDate BETWEEN ? AND ?`;
      teParams.push(startDate, endDate);
    }

    const crParams: any[] = [userId];
    let crQuery = `
      SELECT
        'CallRecord'        AS RecordType,
        cr.CallDate         AS WorkDate,
        ROUND(cr.DurationMinutes / 60.0, 2) AS Hours,
        cr.DurationMinutes  AS DurationMinutes,
        t.TaskName          AS TaskName,
        p.ProjectName       AS ProjectName,
        cr.Notes            AS Description,
        cr.StartTime        AS StartTime,
        NULL                AS EndTime,
        cr.CallType         AS CallType,
        cr.Subject          AS Subject,
        cr.Participants     AS Participants,
        COALESCE(tc.ExternalName, tc.Name, pc.ExternalName, pc.Name) AS CustomerName,
        o.Name              AS OrganizationName
      FROM CallRecords cr
      LEFT JOIN Tasks t ON cr.TaskId = t.Id
      LEFT JOIN Projects p ON COALESCE(t.ProjectId, cr.ProjectId) = p.Id
      LEFT JOIN Organizations o ON COALESCE(cr.OrganizationId, p.OrganizationId) = o.Id
      LEFT JOIN Customers tc ON t.CustomerId = tc.Id
      LEFT JOIN Customers pc ON p.CustomerId = pc.Id
      WHERE cr.UserId = ?
    `;
    if (startDate && endDate) {
      crQuery += ` AND cr.CallDate BETWEEN ? AND ?`;
      crParams.push(startDate, endDate);
    }

    const [[teRows], [crRows]] = await Promise.all([
      pool.execute<RowDataPacket[]>(teQuery, teParams),
      pool.execute<RowDataPacket[]>(crQuery, crParams),
    ]);

    const entries = [...(teRows as any[]), ...(crRows as any[])].sort((a, b) => {
      if (a.WorkDate < b.WorkDate) return 1;
      if (a.WorkDate > b.WorkDate) return -1;
      return 0;
    });

    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error fetching time entries + call records:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch combined entries' });
  }
});

/**
 * @swagger
 * /api/time-entries/task/{taskId}:
 *   get:
 *     summary: Get time entries for a specific task
 *     tags: [TimeEntries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         description: Task ID
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of time entries for the task
 *       404:
 *         description: Task not found or access denied
 *       500:
 *         description: Internal server error
 */
// Get time entries for a specific task
router.get('/task/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.userId;

    // Verify user has access to the task
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, p.OrganizationId
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const entries = await cachedJson(
      cacheKeys.timeEntriesPlanning(`task:${taskId}`),
      ENTITY_TTL_SECONDS,
      async () => {
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT te.*, u.Username, u.FirstName, u.LastName
           FROM TimeEntries te
           LEFT JOIN Users u ON te.UserId = u.Id
           WHERE te.TaskId = ?
           ORDER BY te.WorkDate DESC`,
          [taskId]
        );
        return rows;
      }
    );

    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error fetching task time entries:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch task time entries' });
  }
});

/**
 * @swagger
 * /api/time-entries:
 *   post:
 *     summary: Create a time entry
 *     tags: [TimeEntries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [taskId, workDate, hours]
 *             properties:
 *               taskId:
 *                 type: integer
 *               workDate:
 *                 type: string
 *                 format: date
 *               hours:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Time entry created successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Task not found or access denied
 *       500:
 *         description: Internal server error
 */
// Create time entry
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { taskId, workDate, hours, description, startTime, endTime, customFields } = req.body;

    if (!taskId || !workDate || !hours) {
      return res.status(400).json({ 
        success: false, 
        message: 'TaskId, workDate, and hours are required' 
      });
    }

    // Verify user has access to the task, also get IsHobby
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ProjectId, p.OrganizationId, p.IsHobby
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    // Hobby entries are automatically approved
    const isHobby = !!tasks[0].IsHobby;
    const autoApproveTimeEntries = await isAutoApproveTimeEntriesEnabled();
    const approvalStatus = (isHobby || autoApproveTimeEntries) ? 'approved' : 'pending';
    const customFieldData = await prepareCustomFieldData('TimeEntries', customFields);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO TimeEntries (TaskId, UserId, WorkDate, Hours, Description, StartTime, EndTime, ApprovalStatus${customFieldData.insertColumns.length > 0 ? `, ${customFieldData.insertColumns.join(', ')}` : ''})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?${customFieldData.insertPlaceholders.length > 0 ? `, ${customFieldData.insertPlaceholders.join(', ')}` : ''})`,
      [taskId, userId, workDate, hours, description || null, startTime || null, endTime || null, approvalStatus, ...customFieldData.insertValues]
    );

    await invalidateByEntity('timeEntry', {
      orgId: tasks[0].OrganizationId,
      projectId: tasks[0].ProjectId,
      taskId,
    });

    res.json({ 
      success: true, 
      message: 'Time entry created successfully',
      entryId: result.insertId
    });
  } catch (error) {
    console.error('Error creating time entry:', error);
    res.status(500).json({ success: false, message: 'Failed to create time entry' });
  }
});

/**
 * @swagger
 * /api/time-entries/{id}:
 *   put:
 *     summary: Update a time entry
 *     tags: [TimeEntries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Time entry ID
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workDate:
 *                 type: string
 *                 format: date
 *               hours:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Time entry updated successfully
 *       403:
 *         description: Cannot edit an approved time entry
 *       404:
 *         description: Time entry not found or access denied
 *       500:
 *         description: Internal server error
 */
// Update time entry
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { workDate, hours, description, startTime, endTime, customFields } = req.body;

    // Verify user owns this entry, get IsHobby from project
    const [entries] = await pool.execute<RowDataPacket[]>(
      `SELECT te.Id, te.ApprovalStatus, te.TaskId, p.IsHobby, p.OrganizationId, t.ProjectId
       FROM TimeEntries te
       INNER JOIN Tasks t ON te.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE te.Id = ? AND te.UserId = ?`,
      [id, userId]
    );

    if (entries.length === 0) {
      return res.status(404).json({ success: false, message: 'Time entry not found or access denied' });
    }

    const isHobby = !!entries[0].IsHobby;
    const autoApproveTimeEntries = await isAutoApproveTimeEntriesEnabled();

    // Only block editing approved entries for non-hobby projects
    if (!isHobby && !autoApproveTimeEntries && entries[0].ApprovalStatus === 'approved') {
      return res.status(403).json({ success: false, message: 'Cannot edit an approved time entry' });
    }

    const newApprovalStatus = (isHobby || autoApproveTimeEntries) ? 'approved' : 'pending';
    const newApprovedBy = newApprovalStatus === 'approved' ? userId : null;
    const approvedAtExpression = newApprovalStatus === 'approved' ? 'CURRENT_TIMESTAMP' : 'NULL';
    const currentEntry = entries[0];
    const customFieldData = await prepareCustomFieldData('TimeEntries', customFields, currentEntry as Record<string, unknown>);

    await pool.execute(
      `UPDATE TimeEntries 
       SET WorkDate = COALESCE(?, WorkDate),
           Hours = COALESCE(?, Hours),
           Description = COALESCE(?, Description),
           StartTime = COALESCE(?, StartTime),
           EndTime = COALESCE(?, EndTime),
           ApprovalStatus = ?,
           ApprovedBy = ?,
           ApprovedAt = ${approvedAtExpression},
           UpdatedAt = CURRENT_TIMESTAMP${customFieldData.updateAssignments.length > 0 ? `, ${customFieldData.updateAssignments.join(', ')}` : ''}
       WHERE Id = ?`,
      [
        workDate ?? null, 
        hours ?? null, 
        description ?? null, 
        startTime ?? null, 
        endTime ?? null,
        newApprovalStatus,
        newApprovedBy,
        ...customFieldData.updateValues,
        id
      ]
    );

    await invalidateByEntity('timeEntry', {
      orgId: entries[0].OrganizationId,
      projectId: entries[0].ProjectId,
      taskId: entries[0].TaskId,
    });

    res.json({ success: true, message: 'Time entry updated successfully' });
  } catch (error) {
    console.error('Error updating time entry:', error);
    res.status(500).json({ success: false, message: 'Failed to update time entry' });
  }
});

/**
 * @swagger
 * /api/time-entries/{id}:
 *   delete:
 *     summary: Delete a time entry
 *     tags: [TimeEntries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Time entry ID
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Time entry deleted successfully
 *       403:
 *         description: Cannot delete an approved time entry
 *       404:
 *         description: Time entry not found or access denied
 *       500:
 *         description: Internal server error
 */
// Delete time entry
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    // Verify user owns this entry, get IsHobby from project
    const [entries] = await pool.execute<RowDataPacket[]>(
      `SELECT te.Id, te.ApprovalStatus, te.TaskId, p.IsHobby, p.OrganizationId, t.ProjectId
       FROM TimeEntries te
       INNER JOIN Tasks t ON te.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       WHERE te.Id = ? AND te.UserId = ?`,
      [id, userId]
    );

    if (entries.length === 0) {
      return res.status(404).json({ success: false, message: 'Time entry not found or access denied' });
    }

    const isHobby = !!entries[0].IsHobby;
    const autoApproveTimeEntries = await isAutoApproveTimeEntriesEnabled();

    // Only block deleting approved entries for non-hobby projects
    if (!isHobby && !autoApproveTimeEntries && entries[0].ApprovalStatus === 'approved') {
      return res.status(403).json({ success: false, message: 'Cannot delete an approved time entry' });
    }

    await pool.execute('DELETE FROM TimeEntries WHERE Id = ?', [id]);

    await invalidateByEntity('timeEntry', {
      orgId: entries[0].OrganizationId,
      projectId: entries[0].ProjectId,
      taskId: entries[0].TaskId,
    });

    res.json({ success: true, message: 'Time entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting time entry:', error);
    res.status(500).json({ success: false, message: 'Failed to delete time entry' });
  }
});

// Get per-user time summary for a date range
// Admin: sees all users
// Team leader: sees own entries + users where TeamLeaderId = current user
// Other users: sees only own entries
router.get('/summary-by-user', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.userId;
    const rawPeriod = req.query.period;
    const rawDateFrom = req.query.dateFrom;
    const rawDateTo = req.query.dateTo;
    const period = Array.isArray(rawPeriod) ? rawPeriod[0] : rawPeriod;
    const isAllTime = period === 'allTime';

    const dateFrom = Array.isArray(rawDateFrom) ? rawDateFrom[0] : rawDateFrom;
    const dateTo = Array.isArray(rawDateTo) ? rawDateTo[0] : rawDateTo;

    if (!isAllTime && (!dateFrom || !dateTo)) {
      return res.status(400).json({ success: false, message: 'dateFrom and dateTo are required' });
    }

    const [callerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT IsAdmin FROM Users WHERE Id = ?`,
      [currentUserId]
    );

    if (callerRows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const isAdmin = !!callerRows[0].IsAdmin;

    const conditions: string[] = [
      `u.CustomerId IS NULL`
    ];
    const params: any[] = [];

    if (!isAllTime) {
      conditions.push(`te.WorkDate BETWEEN ? AND ?`);
      params.push(dateFrom, dateTo);
    }

    if (!isAdmin) {
      conditions.push(`(te.UserId = ? OR u.TeamLeaderId = ?)`);
      params.push(currentUserId, currentUserId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [summary] = await pool.execute<RowDataPacket[]>(
      `SELECT
          u.Id AS UserId,
          u.Username,
          u.FirstName,
          u.LastName,
          COUNT(te.Id) AS EntryCount,
          COALESCE(SUM(te.Hours), 0) AS TotalHours,
         COUNT(DISTINCT te.TaskId) AS TaskCount,
         COUNT(DISTINCT p.Id) AS ProjectCount,
         COUNT(DISTINCT c.Id) AS CustomerCount,
          SUM(CASE WHEN te.ApprovalStatus = 'approved' THEN 1 ELSE 0 END) AS ApprovedCount,
          SUM(CASE WHEN te.ApprovalStatus = 'pending' THEN 1 ELSE 0 END) AS PendingCount,
          SUM(CASE WHEN te.ApprovalStatus = 'rejected' THEN 1 ELSE 0 END) AS RejectedCount
       FROM TimeEntries te
       INNER JOIN Users u ON te.UserId = u.Id
       INNER JOIN Tasks t ON te.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN Customers c ON p.CustomerId = c.Id
       ${whereClause}
       GROUP BY u.Id, u.Username, u.FirstName, u.LastName
       ORDER BY TotalHours DESC, EntryCount DESC, u.Username ASC`,
      params
    );

    const [nameRows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT
          u.Id AS UserId,
          t.TaskName,
          p.ProjectName,
          c.Name AS CustomerName
       FROM TimeEntries te
       INNER JOIN Users u ON te.UserId = u.Id
       INNER JOIN Tasks t ON te.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN Customers c ON p.CustomerId = c.Id
       ${whereClause}`,
      params
    );

    const namesByUser = new Map<number, {
      taskNames: Set<string>;
      projectNames: Set<string>;
      customerNames: Set<string>;
    }>();

    for (const row of nameRows) {
      const userIdNum = Number(row.UserId);
      if (!namesByUser.has(userIdNum)) {
        namesByUser.set(userIdNum, {
          taskNames: new Set<string>(),
          projectNames: new Set<string>(),
          customerNames: new Set<string>(),
        });
      }

      const bucket = namesByUser.get(userIdNum)!;
      if (row.TaskName) bucket.taskNames.add(String(row.TaskName));
      if (row.ProjectName) bucket.projectNames.add(String(row.ProjectName));
      if (row.CustomerName) bucket.customerNames.add(String(row.CustomerName));
    }

    const enrichedSummary = summary.map((item) => {
      const userIdNum = Number(item.UserId);
      const bucket = namesByUser.get(userIdNum);

      return {
        ...item,
        TaskNames: bucket ? Array.from(bucket.taskNames).sort().join(' || ') : '',
        ProjectNames: bucket ? Array.from(bucket.projectNames).sort().join(' || ') : '',
        CustomerNames: bucket ? Array.from(bucket.customerNames).sort().join(' || ') : '',
      };
    });

    res.json({ success: true, summary: enrichedSummary });
  } catch (error) {
    console.error('Error fetching summary by user:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch summary by user' });
  }
});


/**
 * @swagger
 * /api/time-entries/pending-approval/team:
 *   get:
 *     summary: Get team time entries pending approval (manager only)
 *     tags: [TimeEntries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         description: Filter by team member user ID
 *         schema:
 *           type: integer
 *       - in: query
 *         name: projectId
 *         description: Filter by project
 *         schema:
 *           type: integer
 *       - in: query
 *         name: dateFrom
 *         description: Filter from date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: dateTo
 *         description: Filter to date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: status
 *         description: "Approval status filter (default: pending)"
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of time entries with subordinate list
 *       403:
 *         description: Access denied - must be admin or manager
 *       500:
 *         description: Internal server error
 */
// Get time entries pending approval for the logged-in team leader (or all if admin)
// Supports optional filters: userId, projectId, dateFrom, dateTo
router.get('/pending-approval/team', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.userId;
    const { userId, projectId, dateFrom, dateTo, status } = req.query;

    // Check if caller is admin
    const [callerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT IsAdmin FROM Users WHERE Id = ?`,
      [currentUserId]
    );
    if (callerRows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const isAdmin = !!callerRows[0].IsAdmin;

    let subordinateCount = 0;
    if (!isAdmin) {
      const [subCountRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS Count FROM Users WHERE TeamLeaderId = ? AND IsActive = 1`,
        [currentUserId]
      );
      subordinateCount = Number(subCountRows[0]?.Count || 0);
      if (subordinateCount <= 0) {
        return res.status(403).json({ success: false, message: 'Access denied - must be admin or team leader' });
      }
    }

    const approvalStatus = status || 'pending';
    const conditions: string[] = [`te.ApprovalStatus = ?`];
    const params: any[] = [approvalStatus];

    // Admins see all subordinates; managers/leaders see only their team
    if (!isAdmin) {
      conditions.push(`u.TeamLeaderId = ?`);
      params.push(currentUserId);
    }

    if (userId) {
      conditions.push(`te.UserId = ?`);
      params.push(userId);
    }
    if (projectId) {
      conditions.push(`p.Id = ?`);
      params.push(projectId);
    }
    if (dateFrom) {
      conditions.push(`te.WorkDate >= ?`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`te.WorkDate <= ?`);
      params.push(dateTo);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [entries] = await pool.execute<RowDataPacket[]>(
      `SELECT te.Id, te.TaskId, te.UserId, te.WorkDate, te.Hours, te.Description, te.AdminEditedDescription,
              te.StartTime, te.EndTime, te.ApprovalStatus, te.ApprovedBy, te.ApprovedAt,
              t.TaskName, t.ProjectId, p.ProjectName,
              u.Username, u.FirstName, u.LastName,
              tl.Username as TeamLeaderUsername
       FROM TimeEntries te
       INNER JOIN Tasks t ON te.TaskId = t.Id
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN Users u ON te.UserId = u.Id
       LEFT JOIN Users tl ON u.TeamLeaderId = tl.Id
       ${whereClause}
       ORDER BY u.Username ASC, te.WorkDate DESC`,
      params
    );

    // Also return the list of subordinates for the filter dropdown
    let subordinates: RowDataPacket[] = [];
    if (isAdmin) {
      const [allUsers] = await pool.execute<RowDataPacket[]>(
        `SELECT Id, Username, FirstName, LastName FROM Users WHERE IsActive = 1 AND CustomerId IS NULL ORDER BY Username ASC`
      );
      subordinates = allUsers;
    } else {
      const [sub] = await pool.execute<RowDataPacket[]>(
        `SELECT Id, Username, FirstName, LastName FROM Users WHERE TeamLeaderId = ? AND IsActive = 1 ORDER BY Username ASC`,
        [currentUserId]
      );
      subordinates = sub;
    }

    res.json({ success: true, entries, subordinates });
  } catch (error) {
    console.error('Error fetching pending time entries:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending time entries' });
  }
});

router.get('/approval-scope', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.userId;

    const [callerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT IsAdmin FROM Users WHERE Id = ?`,
      [currentUserId]
    );

    if (callerRows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const isAdmin = !!callerRows[0].IsAdmin;

    if (isAdmin) {
      return res.json({
        success: true,
        canApprove: true,
        isAdmin: true,
        isTeamLeader: true,
        subordinateCount: -1
      });
    }

    const [subCountRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Count FROM Users WHERE TeamLeaderId = ? AND IsActive = 1`,
      [currentUserId]
    );

    const subordinateCount = Number(subCountRows[0]?.Count || 0);
    const isTeamLeader = subordinateCount > 0;

    return res.json({
      success: true,
      canApprove: isTeamLeader,
      isAdmin: false,
      isTeamLeader,
      subordinateCount
    });
  } catch (error) {
    console.error('Error fetching approval scope:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch approval scope' });
  }
});

/**
 * @swagger
 * /api/time-entries/{id}/approval:
 *   put:
 *     summary: Approve or reject a time entry
 *     tags: [TimeEntries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Time entry ID
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *     responses:
 *       200:
 *         description: Time entry approval status updated
 *       400:
 *         description: Invalid status value
 *       403:
 *         description: Not authorized to approve this entry
 *       404:
 *         description: Time entry not found
 *       500:
 *         description: Internal server error
 */
// Approve or reject a time entry (team leader of entry owner, or admin)
router.put('/:id/approval', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const entryId = Array.isArray(id) ? id[0] : id;
    const currentUserId = req.user?.userId;
    const { status } = req.body; // 'approved' | 'rejected'

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be approved or rejected' });
    }

    const access = await canManageTeamEntry(entryId, currentUserId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    await pool.execute(
      `UPDATE TimeEntries SET ApprovalStatus = ?, ApprovedBy = ?, ApprovedAt = CURRENT_TIMESTAMP WHERE Id = ?`,
      [status, currentUserId, entryId]
    );

    res.json({ success: true, message: `Time entry ${status}` });
  } catch (error) {
    console.error('Error approving time entry:', error);
    res.status(500).json({ success: false, message: 'Failed to update time entry approval' });
  }
});

// Reopen a time entry for user edits (set back to pending)
router.put('/:id/reopen', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const entryId = Array.isArray(id) ? id[0] : id;
    const currentUserId = req.user?.userId;

    const access = await canManageTeamEntry(entryId, currentUserId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    await pool.execute(
      `UPDATE TimeEntries
       SET ApprovalStatus = 'pending',
           ApprovedBy = NULL,
           ApprovedAt = NULL,
           UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [entryId]
    );

    res.json({ success: true, message: 'Time entry reopened for user edits' });
  } catch (error) {
    console.error('Error reopening time entry:', error);
    res.status(500).json({ success: false, message: 'Failed to reopen time entry' });
  }
});

// Save admin/manager edited description in dedicated field
router.put('/:id/admin-description', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const entryId = Array.isArray(id) ? id[0] : id;
    const currentUserId = req.user?.userId;
    const { adminEditedDescription } = req.body;

    if (adminEditedDescription !== null && adminEditedDescription !== undefined && typeof adminEditedDescription !== 'string') {
      return res.status(400).json({ success: false, message: 'adminEditedDescription must be a string or null' });
    }

    const access = await canManageTeamEntry(entryId, currentUserId);
    if (!access.ok) {
      return res.status(access.status).json({ success: false, message: access.message });
    }

    await pool.execute(
      `UPDATE TimeEntries
       SET AdminEditedDescription = ?,
           UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [adminEditedDescription ?? null, entryId]
    );

    res.json({ success: true, message: 'Admin edited description saved' });
  } catch (error) {
    console.error('Error saving admin edited description:', error);
    res.status(500).json({ success: false, message: 'Failed to save admin edited description' });
  }
});

// Planning view: time entries + call records for all accessible users in a date range
// Admins/managers see all users; others see only themselves
router.get('/planning-view', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.userId;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }

    const [callerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT IsAdmin, IsManager FROM Users WHERE Id = ?`,
      [currentUserId]
    );
    if (callerRows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const isAdmin = !!callerRows[0].IsAdmin;
    const isManager = !!callerRows[0].IsManager;
    const canViewAll = isAdmin || isManager;
    const cacheScope = `user:${currentUserId}:view:start:${String(startDate)}:end:${String(endDate)}:scope:${canViewAll ? 'all' : 'self'}`;

    const entries = await cachedJson(
      cacheKeys.timeEntriesPlanning(cacheScope),
      ENTITY_TTL_SECONDS,
      async () => {
        const teParams: Array<string | number> = [String(startDate), String(endDate)];
        let teWhere = `te.WorkDate BETWEEN ? AND ?`;
        if (!canViewAll) {
          teWhere += ` AND te.UserId = ?`;
          teParams.push(currentUserId as number);
        }

        const [teRows] = await pool.execute<RowDataPacket[]>(
          `SELECT
             'TimeEntry' AS RecordType,
             te.Id,
             te.UserId,
             u.Username,
             u.FirstName,
             u.LastName,
             te.WorkDate AS WorkDate,
             te.Hours AS Hours,
             0 AS DurationMinutes,
             t.TaskName,
             t.Id AS TaskId,
             p.ProjectName,
             p.Id AS ProjectId,
             te.Description,
             te.StartTime,
             te.EndTime,
             COALESCE(c.ExternalName, c.Name) AS CustomerName
           FROM TimeEntries te
           INNER JOIN Tasks t ON te.TaskId = t.Id
           INNER JOIN Projects p ON t.ProjectId = p.Id
           LEFT JOIN Customers c ON p.CustomerId = c.Id
           LEFT JOIN Users u ON te.UserId = u.Id
           WHERE ${teWhere}
           ORDER BY te.WorkDate, te.UserId, te.StartTime`,
          teParams
        );

        const crParams: Array<string | number> = [String(startDate), String(endDate)];
        let crWhere = `cr.CallDate BETWEEN ? AND ?`;
        if (!canViewAll) {
          crWhere += ` AND cr.UserId = ?`;
          crParams.push(currentUserId as number);
        }

        const [crRows] = await pool.execute<RowDataPacket[]>(
          `SELECT
             'CallRecord' AS RecordType,
             cr.Id,
             cr.UserId,
             u.Username,
             u.FirstName,
             u.LastName,
             cr.CallDate AS WorkDate,
             ROUND(cr.DurationMinutes / 60.0, 2) AS Hours,
             cr.DurationMinutes AS DurationMinutes,
             COALESCE(t.TaskName, '') AS TaskName,
             t.Id AS TaskId,
             COALESCE(p.ProjectName, '') AS ProjectName,
             COALESCE(p.Id, 0) AS ProjectId,
             cr.Notes AS Description,
             cr.StartTime,
             NULL AS EndTime,
             cr.Subject,
             cr.CallType,
             COALESCE(tc.ExternalName, tc.Name, pc.ExternalName, pc.Name) AS CustomerName
           FROM CallRecords cr
           LEFT JOIN Tasks t ON cr.TaskId = t.Id
           LEFT JOIN Projects p ON COALESCE(t.ProjectId, cr.ProjectId) = p.Id
           LEFT JOIN Users u ON cr.UserId = u.Id
           LEFT JOIN Customers tc ON t.CustomerId = tc.Id
           LEFT JOIN Customers pc ON p.CustomerId = pc.Id
           WHERE ${crWhere}
           ORDER BY cr.CallDate, cr.UserId, cr.StartTime`,
          crParams
        );

        return [...(teRows as RowDataPacket[]), ...(crRows as RowDataPacket[])];
      }
    );

    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error fetching planning-view time entries:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch planning view data' });
  }
});

export default router;

