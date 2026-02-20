import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();

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

    const [entries] = await pool.execute<RowDataPacket[]>(
      `SELECT te.*, t.TaskName, u.Username, u.FirstName, u.LastName
       FROM TimeEntries te
       INNER JOIN Tasks t ON te.TaskId = t.Id
       LEFT JOIN Users u ON te.UserId = u.Id
       WHERE t.ProjectId = ?
       ORDER BY te.WorkDate DESC, t.TaskName`,
      [projectId]
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

    let query = `
      SELECT te.*, t.TaskName, t.ProjectId, p.ProjectName, p.IsHobby, c.Name as CustomerName
      FROM TimeEntries te
      INNER JOIN Tasks t ON te.TaskId = t.Id
      INNER JOIN Projects p ON t.ProjectId = p.Id
      LEFT JOIN Customers c ON p.CustomerId = c.Id
      WHERE te.UserId = ?
    `;
    const params: any[] = [userId];

    if (startDate && endDate) {
      query += ` AND te.WorkDate BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    }

    query += ` ORDER BY te.WorkDate DESC, te.CreatedAt DESC`;

    const [entries] = await pool.execute<RowDataPacket[]>(query, params);

    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch time entries' });
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

    const [entries] = await pool.execute<RowDataPacket[]>(
      `SELECT te.*, u.Username, u.FirstName, u.LastName
       FROM TimeEntries te
       LEFT JOIN Users u ON te.UserId = u.Id
       WHERE te.TaskId = ?
       ORDER BY te.WorkDate DESC`,
      [taskId]
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
    const { taskId, workDate, hours, description, startTime, endTime } = req.body;

    if (!taskId || !workDate || !hours) {
      return res.status(400).json({ 
        success: false, 
        message: 'TaskId, workDate, and hours are required' 
      });
    }

    // Verify user has access to the task, also get IsHobby
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, p.OrganizationId, p.IsHobby
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
    const approvalStatus = isHobby ? 'approved' : 'pending';

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO TimeEntries (TaskId, UserId, WorkDate, Hours, Description, StartTime, EndTime, ApprovalStatus)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [taskId, userId, workDate, hours, description || null, startTime || null, endTime || null, approvalStatus]
    );

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
    const { workDate, hours, description, startTime, endTime } = req.body;

    // Verify user owns this entry, get IsHobby from project
    const [entries] = await pool.execute<RowDataPacket[]>(
      `SELECT te.Id, te.ApprovalStatus, p.IsHobby
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

    // Only block editing approved entries for non-hobby projects
    if (!isHobby && entries[0].ApprovalStatus === 'approved') {
      return res.status(403).json({ success: false, message: 'Cannot edit an approved time entry' });
    }

    // Hobby entries stay approved; rejected/pending entries reset to pending
    const newApprovalStatus = isHobby ? 'approved' : 'pending';

    await pool.execute(
      `UPDATE TimeEntries 
       SET WorkDate = COALESCE(?, WorkDate),
           Hours = COALESCE(?, Hours),
           Description = COALESCE(?, Description),
           StartTime = COALESCE(?, StartTime),
           EndTime = COALESCE(?, EndTime),
           ApprovalStatus = ?,
           ApprovedBy = NULL,
           ApprovedAt = IF(? = 'approved', CURRENT_TIMESTAMP, NULL),
           UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [
        workDate ?? null, 
        hours ?? null, 
        description ?? null, 
        startTime ?? null, 
        endTime ?? null,
        newApprovalStatus,
        newApprovalStatus,
        id
      ]
    );

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
      `SELECT te.Id, te.ApprovalStatus, p.IsHobby
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

    // Only block deleting approved entries for non-hobby projects
    if (!isHobby && entries[0].ApprovalStatus === 'approved') {
      return res.status(403).json({ success: false, message: 'Cannot delete an approved time entry' });
    }

    await pool.execute('DELETE FROM TimeEntries WHERE Id = ?', [id]);

    res.json({ success: true, message: 'Time entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting time entry:', error);
    res.status(500).json({ success: false, message: 'Failed to delete time entry' });
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
      `SELECT IsAdmin, IsManager FROM Users WHERE Id = ?`,
      [currentUserId]
    );
    if (callerRows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const isAdmin = !!callerRows[0].IsAdmin;
    const isManager = !!callerRows[0].IsManager;

    if (!isAdmin && !isManager) {
      return res.status(403).json({ success: false, message: 'Access denied - must be admin or manager' });
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
      `SELECT te.Id, te.TaskId, te.UserId, te.WorkDate, te.Hours, te.Description,
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
    const currentUserId = req.user?.userId;
    const { status } = req.body; // 'approved' | 'rejected'

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be approved or rejected' });
    }

    // Get the time entry and the owner's team leader
    const [entries] = await pool.execute<RowDataPacket[]>(
      `SELECT te.Id, te.UserId, u.TeamLeaderId
       FROM TimeEntries te
       INNER JOIN Users u ON te.UserId = u.Id
       WHERE te.Id = ?`,
      [id]
    );

    if (entries.length === 0) {
      return res.status(404).json({ success: false, message: 'Time entry not found' });
    }

    const entry = entries[0];

    // Verify the approver is the team leader of this user or an admin/manager
    const [callerRows] = await pool.execute<RowDataPacket[]>(
      `SELECT IsAdmin, IsManager FROM Users WHERE Id = ?`,
      [currentUserId]
    );
    const isAdmin = callerRows.length > 0 && !!callerRows[0].IsAdmin;
    const isManager = callerRows.length > 0 && !!callerRows[0].IsManager;
    const isTeamLeader = entry.TeamLeaderId === currentUserId;

    if (!isAdmin && !isManager && !isTeamLeader) {
      return res.status(403).json({ success: false, message: 'Access denied - not authorized to approve this entry' });
    }

    await pool.execute(
      `UPDATE TimeEntries SET ApprovalStatus = ?, ApprovedBy = ?, ApprovedAt = CURRENT_TIMESTAMP WHERE Id = ?`,
      [status, currentUserId, id]
    );

    res.json({ success: true, message: `Time entry ${status}` });
  } catch (error) {
    console.error('Error approving time entry:', error);
    res.status(500).json({ success: false, message: 'Failed to update time entry approval' });
  }
});

export default router;

