import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { logActivity } from './activityLogs';
import { logOrganizationHistory } from '../utils/changeLog';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Organizations
 *   description: Organization management endpoints
 */

/**
 * @swagger
 * /api/organizations:
 *   get:
 *     summary: Get all organizations for the current user
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations with stats (MemberCount, ProjectCount, OpenTickets, TotalTasks, CompletedTasks, ActiveProjects)
 */
// Get all organizations for the current user
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const [organizations] = await pool.execute<RowDataPacket[]>(
      `SELECT o.*, om.Role, om.PermissionGroupId,
              u.Username as CreatorName,
              (SELECT COUNT(*) FROM OrganizationMembers WHERE OrganizationId = o.Id) as MemberCount,
              (SELECT COUNT(*) FROM Projects WHERE OrganizationId = o.Id) as ProjectCount,
              (SELECT COUNT(*) FROM Tickets tk 
               INNER JOIN Projects p ON tk.ProjectId = p.Id 
               LEFT JOIN TicketStatusValues tsv ON tk.StatusId = tsv.Id
               WHERE p.OrganizationId = o.Id AND COALESCE(tsv.IsClosed, 0) = 0) as OpenTickets,
              COALESCE(taskStats.TotalTasks, 0) as TotalTasks,
              COALESCE(taskStats.CompletedTasks, 0) as CompletedTasks,
              COALESCE(taskStats.ActiveProjects, 0) as ActiveProjects
       FROM Organizations o
       INNER JOIN OrganizationMembers om ON o.Id = om.OrganizationId
       LEFT JOIN Users u ON o.CreatedBy = u.Id
       LEFT JOIN (
         SELECT 
           p.OrganizationId,
           COUNT(DISTINCT CASE WHEN COALESCE(psv.IsClosed, 0) = 0 AND COALESCE(psv.IsCancelled, 0) = 0 THEN p.Id END) as ActiveProjects,
           COUNT(CASE WHEN t.ParentTaskId IS NULL THEN 1 END) as TotalTasks,
           COUNT(CASE WHEN t.ParentTaskId IS NULL AND COALESCE(tsv.IsClosed, 0) = 1 THEN 1 END) as CompletedTasks
         FROM Projects p
         LEFT JOIN ProjectStatusValues psv ON p.Status = psv.Id
         LEFT JOIN Tasks t ON p.Id = t.ProjectId
         LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         GROUP BY p.OrganizationId
       ) taskStats ON o.Id = taskStats.OrganizationId
       WHERE om.UserId = ?
       ORDER BY o.CreatedAt DESC`,
      [userId]
    );

    res.json({
      success: true,
      organizations
    });
  } catch (error) {
    console.error('Get organizations error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch organizations' 
    });
  }
});

// Get single organization
/**
 * @swagger
 * /api/organizations/{id}:
 *   get:
 *     summary: Get a single organization by ID
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Organization data
 *       404:
 *         description: Organization not found
 */
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = req.params.id;

    const [organizations] = await pool.execute<RowDataPacket[]>(
      `SELECT o.*, om.Role, om.PermissionGroupId, u.Username as CreatorName
       FROM Organizations o
       INNER JOIN OrganizationMembers om ON o.Id = om.OrganizationId
       LEFT JOIN Users u ON o.CreatedBy = u.Id
       WHERE o.Id = ? AND om.UserId = ?`,
      [orgId, userId]
    );

    if (organizations.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Organization not found or access denied' 
      });
    }

    res.json({
      success: true,
      organization: organizations[0]
    });
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch organization' 
    });
  }
});

// Create new organization
/**
 * @swagger
 * /api/organizations:
 *   post:
 *     summary: Create a new organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Organization created with default permission groups and status values
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { name, abbreviation, description } = req.body;

    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Organization name is required' 
      });
    }

    // Create organization
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO Organizations (Name, Abbreviation, Description, CreatedBy) VALUES (?, ?, ?, ?)',
      [name, abbreviation || null, description || null, userId]
    );

    const orgId = result.insertId;

    // Add creator as owner
    await pool.execute(
      'INSERT INTO OrganizationMembers (OrganizationId, UserId, Role) VALUES (?, ?, ?)',
      [orgId, userId, 'Owner']
    );

    // Create default permission groups based on global role permissions
    const [rolePerms] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM RolePermissions WHERE RoleName IN ('Developer', 'Support', 'Manager') ORDER BY FIELD(RoleName, 'Developer', 'Support', 'Manager')`
    );

    for (const rp of rolePerms) {
      await pool.execute(
        `INSERT INTO PermissionGroups 
         (OrganizationId, GroupName, LinkedRole, IsSystemGroup,
          CanManageProjects, CanCreateProjects, CanDeleteProjects,
          CanManageTasks, CanCreateTasks, CanDeleteTasks, CanAssignTasks, CanPlanTasks,
          CanManageTimeEntries, CanViewReports,
          CanManageTickets, CanCreateTickets, CanDeleteTickets, CanAssignTickets, CanCreateTaskFromTicket,
          CanManageMembers, CanManageSettings)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
        [
          orgId, rp.RoleName, rp.RoleName,
          rp.CanManageProjects ? 1 : 0, rp.CanCreateProjects ? 1 : 0, rp.CanDeleteProjects ? 1 : 0,
          rp.CanManageTasks ? 1 : 0, rp.CanCreateTasks ? 1 : 0, rp.CanDeleteTasks ? 1 : 0,
          rp.CanAssignTasks ? 1 : 0, rp.CanPlanTasks ? 1 : 0,
          rp.CanManageTimeEntries ? 1 : 0, rp.CanViewReports ? 1 : 0,
          rp.CanManageTickets ? 1 : 0, rp.CanCreateTickets ? 1 : 0,
          rp.CanDeleteTickets ? 1 : 0, rp.CanAssignTickets ? 1 : 0,
          rp.CanCreateTaskFromTicket ? 1 : 0,
        ]
      );
    }

    // Create default project status values
    const defaultProjectStatuses = [
      { name: 'Active', color: '#10b981', order: 1, isDefault: 1 },
      { name: 'On Hold', color: '#f59e0b', order: 2, isDefault: 0 },
      { name: 'Completed', color: '#3b82f6', order: 3, isDefault: 0 },
      { name: 'Cancelled', color: '#ef4444', order: 4, isDefault: 0 }
    ];

    for (const status of defaultProjectStatuses) {
      await pool.execute(
        `INSERT INTO ProjectStatusValues 
         (OrganizationId, StatusName, ColorCode, SortOrder, IsDefault) 
         VALUES (?, ?, ?, ?, ?)`,
        [orgId, status.name, status.color, status.order, status.isDefault]
      );
    }

    // Create default task status values
    const defaultTaskStatuses = [
      { name: 'To Do', color: '#6b7280', order: 1, isDefault: 1, isClosed: 0, isCancelled: 0 },
      { name: 'In Progress', color: '#3b82f6', order: 2, isDefault: 0, isClosed: 0, isCancelled: 0 },
      { name: 'Done', color: '#10b981', order: 3, isDefault: 0, isClosed: 1, isCancelled: 0 }
    ];

    for (const status of defaultTaskStatuses) {
      await pool.execute(
        `INSERT INTO TaskStatusValues 
         (OrganizationId, StatusName, ColorCode, SortOrder, IsDefault, IsClosed, IsCancelled) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orgId, status.name, status.color, status.order, status.isDefault, status.isClosed, status.isCancelled]
      );
    }

    // Create default task priority values
    const defaultTaskPriorities = [
      { name: 'Low', color: '#6b7280', order: 1, isDefault: 0 },
      { name: 'Medium', color: '#3b82f6', order: 2, isDefault: 1 },
      { name: 'High', color: '#f59e0b', order: 3, isDefault: 0 },
      { name: 'Critical', color: '#ef4444', order: 4, isDefault: 0 }
    ];

    for (const priority of defaultTaskPriorities) {
      await pool.execute(
        `INSERT INTO TaskPriorityValues 
         (OrganizationId, PriorityName, ColorCode, SortOrder, IsDefault) 
         VALUES (?, ?, ?, ?, ?)`,
        [orgId, priority.name, priority.color, priority.order, priority.isDefault]
      );
    }

    // Log organization creation
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'ORGANIZATION_CREATE',
      'Organization',
      orgId,
      name,
      `Created organization: ${name}`,
      req.ip,
      req.get('user-agent')
    );
    
    // Log to history
    await logOrganizationHistory(
      orgId,
      userId!,
      'created',
      null,
      null,
      null
    );

    res.status(201).json({
      success: true,
      message: 'Organization created successfully',
      organizationId: orgId
    });
  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create organization' 
    });
  }
});

// Update organization
/**
 * @swagger
 * /api/organizations/{id}:
 *   put:
 *     summary: Update an organization (requires Owner or CanManageSettings)
 *     tags: [Organizations]
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
 *               name: { type: string }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: Organization updated
 *       403:
 *         description: Forbidden - requires Owner or CanManageSettings
 *       404:
 *         description: Not found
 */
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = req.params.id;
    const { name, abbreviation, description } = req.body;

    // Check if user has permission (Owner or has CanManageSettings)
    const [members] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [orgId, userId]
    );

    if (members.length === 0 || (members[0].Role !== 'Owner' && !members[0].CanManageSettings)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }

    // Get current data for change tracking
    const [current] = await pool.execute<RowDataPacket[]>(
      'SELECT Name, Abbreviation, Description FROM Organizations WHERE Id = ?',
      [orgId]
    );
    
    const oldOrg = current[0];
    
    // Normalize empty values for comparison
    const normalizeValue = (value: any): string => {
      return value === null || value === undefined || value === '' ? '' : String(value);
    };
    
    // Track changes
    if (name !== undefined && name !== oldOrg.Name) {
      await logOrganizationHistory(
        Number(orgId),
        userId!,
        'updated',
        'Name',
        oldOrg.Name,
        name
      );
    }
    
    const oldDesc = normalizeValue(oldOrg.Description);
    const newDesc = normalizeValue(description);
    
    if (description !== undefined && oldDesc !== newDesc) {
      await logOrganizationHistory(
        Number(orgId),
        userId!,
        'updated',
        'Description',
        oldDesc,
        newDesc
      );
    }

    const oldAbbr = normalizeValue(oldOrg.Abbreviation);
    const newAbbr = normalizeValue(abbreviation);
    
    if (abbreviation !== undefined && oldAbbr !== newAbbr) {
      await logOrganizationHistory(
        Number(orgId),
        userId!,
        'updated',
        'Abbreviation',
        oldAbbr,
        newAbbr
      );
    }

    await pool.execute(
      'UPDATE Organizations SET Name = ?, Abbreviation = ?, Description = ? WHERE Id = ?',
      [name, abbreviation, description, orgId]
    );

    // Log organization update
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'ORGANIZATION_UPDATE',
      'Organization',
      Number(orgId),
      name,
      `Updated organization: ${name}`,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Organization updated successfully'
    });
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update organization' 
    });
  }
});

// Delete organization
/**
 * @swagger
 * /api/organizations/{id}:
 *   delete:
 *     summary: Delete an organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Organization deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = req.params.id;

    // Check if user is owner
    const [members] = await pool.execute<RowDataPacket[]>(
      'SELECT Role FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [orgId, userId]
    );

    if (members.length === 0 || members[0].Role !== 'Owner') {
      return res.status(403).json({ 
        success: false, 
        message: 'Only organization owner can delete the organization' 
      });
    }

    // Get organization name before deletion
    const [org] = await pool.execute<RowDataPacket[]>(
      'SELECT Name FROM Organizations WHERE Id = ?',
      [orgId]
    );

    const orgName = org.length > 0 ? org[0].Name : 'Unknown';

    await pool.execute('DELETE FROM Organizations WHERE Id = ?', [orgId]);

    // Log organization deletion
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'ORGANIZATION_DELETE',
      'Organization',
      Number(orgId),
      orgName,
      `Deleted organization: ${orgName}`,
      req.ip,
      req.get('user-agent')
    );

    // Log to detailed history
    await logOrganizationHistory(
      Number(orgId),
      userId!,
      'deleted',
      null,
      orgName,
      null
    );

    res.json({
      success: true,
      message: 'Organization deleted successfully'
    });
  } catch (error) {
    console.error('Delete organization error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete organization' 
    });
  }
});

// Get organization members
/**
 * @swagger
 * /api/organizations/{id}/members:
 *   get:
 *     summary: Get members of an organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of organization members
 */
router.get('/:id/members', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = req.params.id;

    // Verify user has access
    const [access] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [orgId, userId]
    );

    if (access.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    const [members] = await pool.execute<RowDataPacket[]>(
      `SELECT om.*, u.Username, u.Email, pg.GroupName
       FROM OrganizationMembers om
       INNER JOIN Users u ON om.UserId = u.Id
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ?
       ORDER BY om.JoinedAt DESC`,
      [orgId]
    );

    res.json({
      success: true,
      members
    });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch members' 
    });
  }
});

/**
 * @swagger
 * /api/organizations/{id}/users:
 *   get:
 *     summary: Get users in an organization (for task assignment)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of users with work hours info for planning
 *       403:
 *         description: Access denied
 */
// Get users from organization for task assignment
router.get('/:id/users', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = req.params.id;

    // Verify user has access
    const [access] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [orgId, userId]
    );

    if (access.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT u.Id, u.Username, u.Email, u.FirstName, u.LastName,
              u.WorkHoursMonday, u.WorkHoursTuesday, u.WorkHoursWednesday, 
              u.WorkHoursThursday, u.WorkHoursFriday, u.WorkHoursSaturday, u.WorkHoursSunday,
              u.WorkStartMonday, u.WorkStartTuesday, u.WorkStartWednesday,
              u.WorkStartThursday, u.WorkStartFriday, u.WorkStartSaturday, u.WorkStartSunday,
              u.LunchTime, u.LunchDuration,
              u.HobbyStartMonday, u.HobbyStartTuesday, u.HobbyStartWednesday,
              u.HobbyStartThursday, u.HobbyStartFriday, u.HobbyStartSaturday, u.HobbyStartSunday,
              u.HobbyHoursMonday, u.HobbyHoursTuesday, u.HobbyHoursWednesday,
              u.HobbyHoursThursday, u.HobbyHoursFriday, u.HobbyHoursSaturday, u.HobbyHoursSunday
       FROM Users u
       INNER JOIN OrganizationMembers om ON u.Id = om.UserId
       WHERE om.OrganizationId = ? AND u.IsActive = 1
       ORDER BY u.Username`,
      [orgId]
    );

    res.json({
      success: true,
      users
    });
  } catch (error) {
    console.error('Get organization users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users' 
    });
  }
});

// Add member to organization
/**
 * @swagger
 * /api/organizations/{id}/members:
 *   post:
 *     summary: Add a member to an organization
 *     tags: [Organizations]
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
 *             required: [userId, role]
 *             properties:
 *               userId: { type: integer }
 *               role: { type: string }
 *               permissionGroupId: { type: integer }
 *     responses:
 *       201:
 *         description: Member added
 *       403:
 *         description: Forbidden
 */
router.post('/:id/members', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = req.params.id;
    const { userEmail, role, permissionGroupId } = req.body;

    // Check if requester has permission
    const [requester] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageMembers
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [orgId, userId]
    );

    if (requester.length === 0 || (requester[0].Role !== 'Owner' && !requester[0].CanManageMembers)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }

    // Find user by email
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM Users WHERE Email = ?',
      [userEmail]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const newUserId = users[0].Id;

    // Check if already a member
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [orgId, newUserId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'User is already a member' 
      });
    }

    await pool.execute(
      'INSERT INTO OrganizationMembers (OrganizationId, UserId, Role, PermissionGroupId) VALUES (?, ?, ?, ?)',
      [orgId, newUserId, role || 'Member', permissionGroupId || null]
    );

    // Get user info for logging
    const [userInfo] = await pool.execute<RowDataPacket[]>(
      'SELECT Username, FirstName, LastName FROM Users WHERE Id = ?',
      [newUserId]
    );
    const userName = userInfo.length > 0 ? userInfo[0].Username : 'Unknown';

    // Log member addition
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'ORGANIZATION_MEMBER_ADD',
      'OrganizationMember',
      Number(newUserId),
      userName,
      `Added member ${userName} with role ${role} to organization`,
      req.ip,
      req.get('user-agent')
    );

    res.status(201).json({
      success: true,
      message: 'Member added successfully'
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to add member' 
    });
  }
});

// Update member
/**
 * @swagger
 * /api/organizations/{id}/members/{memberId}:
 *   put:
 *     summary: Update a member's role or permission group
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               role: { type: string }
 *               permissionGroupId: { type: integer }
 *     responses:
 *       200:
 *         description: Member updated
 *       403:
 *         description: Forbidden
 */
router.put('/:id/members/:memberId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = req.params.id;
    const memberId = req.params.memberId;
    const { role, permissionGroupId } = req.body;

    // Check if requester has permission
    const [requester] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageMembers
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [orgId, userId]
    );

    if (requester.length === 0 || (requester[0].Role !== 'Owner' && !requester[0].CanManageMembers)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }

    await pool.execute(
      'UPDATE OrganizationMembers SET Role = ?, PermissionGroupId = ? WHERE Id = ? AND OrganizationId = ?',
      [role, permissionGroupId, memberId, orgId]
    );

    // Get member info for logging
    const [memberInfo] = await pool.execute<RowDataPacket[]>(
      `SELECT u.Username, om.Role as OldRole FROM OrganizationMembers om
       JOIN Users u ON om.UserId = u.Id
       WHERE om.Id = ? AND om.OrganizationId = ?`,
      [memberId, orgId]
    );
    const memberName = memberInfo.length > 0 ? memberInfo[0].Username : 'Unknown';
    const oldRole = memberInfo.length > 0 ? memberInfo[0].OldRole : 'Unknown';

    // Log member update
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'ORGANIZATION_MEMBER_UPDATE',
      'OrganizationMember',
      Number(memberId),
      memberName,
      `Updated member ${memberName} role from ${oldRole} to ${role}`,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Member updated successfully'
    });
  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update member' 
    });
  }
});

// Remove member
/**
 * @swagger
 * /api/organizations/{id}/members/{memberId}:
 *   delete:
 *     summary: Remove a member from an organization
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Member removed
 *       403:
 *         description: Forbidden
 */
router.delete('/:id/members/:memberId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = req.params.id;
    const memberId = req.params.memberId;

    // Check if requester has permission
    const [requester] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageMembers
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [orgId, userId]
    );

    if (requester.length === 0 || (requester[0].Role !== 'Owner' && !requester[0].CanManageMembers)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }

    // Prevent removing owner
    const [member] = await pool.execute<RowDataPacket[]>(
      'SELECT Role FROM OrganizationMembers WHERE Id = ? AND OrganizationId = ?',
      [memberId, orgId]
    );

    if (member.length > 0 && member[0].Role === 'Owner') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot remove organization owner' 
      });
    }

    // Get member info before deletion
    const [memberInfo] = await pool.execute<RowDataPacket[]>(
      `SELECT u.Username, om.Role FROM OrganizationMembers om
       JOIN Users u ON om.UserId = u.Id
       WHERE om.Id = ? AND om.OrganizationId = ?`,
      [memberId, orgId]
    );
    const memberName = memberInfo.length > 0 ? memberInfo[0].Username : 'Unknown';
    const memberRole = memberInfo.length > 0 ? memberInfo[0].Role : 'Unknown';

    await pool.execute(
      'DELETE FROM OrganizationMembers WHERE Id = ? AND OrganizationId = ?',
      [memberId, orgId]
    );

    // Log member removal
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'ORGANIZATION_MEMBER_REMOVE',
      'OrganizationMember',
      Number(memberId),
      memberName,
      `Removed member ${memberName} (${memberRole}) from organization`,
      req.ip,
      req.get('user-agent')
    );

    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to remove member' 
    });
  }
});

/**
 * POST /api/organizations/admin/create-system-groups
 * Admin-only: Retroactively create missing system permission groups for all existing organizations.
 * System groups (Developer, Support, Manager) are created from current global RolePermissions values.
 * Orgs that already have system groups for a given role are skipped for that role.
 */
router.post('/admin/create-system-groups', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Admin only
    const [userRows] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin FROM Users WHERE Id = ?',
      [userId]
    );

    if (!userRows.length || !userRows[0].isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    // Fetch all global role permissions
    const [rolePerms] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM RolePermissions WHERE RoleName IN ('Developer', 'Support', 'Manager')`
    );

    if (!rolePerms.length) {
      return res.status(400).json({ 
        success: false, 
        message: 'Global role permissions not found. Please configure them in Administration first.' 
      });
    }

    const roleMap: Record<string, any> = {};
    rolePerms.forEach((rp: any) => { roleMap[rp.RoleName] = rp; });

    // Fetch all organizations
    const [orgs] = await pool.execute<RowDataPacket[]>('SELECT Id, Name FROM Organizations');

    // Fetch all existing system groups to avoid duplicates
    const [existingGroups] = await pool.execute<RowDataPacket[]>(
      `SELECT OrganizationId, LinkedRole FROM PermissionGroups WHERE IsSystemGroup = 1`
    );

    const existingSet = new Set(
      existingGroups.map((g: any) => `${g.OrganizationId}:${g.LinkedRole}`)
    );

    const roles = ['Developer', 'Support', 'Manager'];
    let created = 0;
    let skipped = 0;

    for (const org of orgs) {
      for (const roleName of roles) {
        const key = `${org.Id}:${roleName}`;
        if (existingSet.has(key)) {
          skipped++;
          continue;
        }

        const rp = roleMap[roleName];
        if (!rp) {
          skipped++;
          continue;
        }

        await pool.execute(
          `INSERT INTO PermissionGroups (
            OrganizationId, GroupName, Description, LinkedRole, IsSystemGroup,
            CanManageProjects, CanCreateProjects, CanDeleteProjects,
            CanManageTasks, CanCreateTasks, CanDeleteTasks, CanAssignTasks,
            CanPlanTasks, CanManageTimeEntries, CanViewReports,
            CanManageTickets, CanCreateTickets, CanDeleteTickets, CanAssignTickets,
            CanCreateTaskFromTicket, CanManageMembers, CanManageSettings
          ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
          [
            org.Id,
            roleName,
            `Default permissions for ${roleName} role (synced from global settings)`,
            roleName,
            rp.CanManageProjects ? 1 : 0, rp.CanCreateProjects ? 1 : 0, rp.CanDeleteProjects ? 1 : 0,
            rp.CanManageTasks ? 1 : 0, rp.CanCreateTasks ? 1 : 0, rp.CanDeleteTasks ? 1 : 0, rp.CanAssignTasks ? 1 : 0,
            rp.CanPlanTasks ? 1 : 0, rp.CanManageTimeEntries ? 1 : 0, rp.CanViewReports ? 1 : 0,
            rp.CanManageTickets ? 1 : 0, rp.CanCreateTickets ? 1 : 0, rp.CanDeleteTickets ? 1 : 0, rp.CanAssignTickets ? 1 : 0,
            rp.CanCreateTaskFromTicket ? 1 : 0
          ]
        );
        created++;
      }
    }

    res.json({ 
      success: true, 
      message: `Migration complete: ${created} system groups created, ${skipped} already existed.`,
      created,
      skipped
    });
  } catch (error) {
    console.error('Create system groups migration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create system groups' 
    });
  }
});

export default router;
