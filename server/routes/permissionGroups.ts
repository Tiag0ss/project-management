import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { cachedJson, ENTITY_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import { invalidateByEntity } from '../services/cacheInvalidation';

const router = Router();

const getGlobalOrganizationManagementPermission = async (userId?: number): Promise<boolean> => {
  if (!userId) {
    return false;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT u.isAdmin,
            COALESCE(MAX(CASE WHEN rp.CanManageOrganizations = 1 THEN 1 ELSE 0 END), 0) AS CanManageOrganizations
     FROM Users u
     LEFT JOIN RolePermissions rp ON
       (u.IsDeveloper = 1 AND rp.RoleName = 'Developer') OR
       (u.IsSupport = 1 AND rp.RoleName = 'Support') OR
       (u.IsManager = 1 AND rp.RoleName = 'Manager')
     WHERE u.Id = ?
     GROUP BY u.Id, u.isAdmin`,
    [userId]
  );

  if (rows.length === 0) {
    return false;
  }

  return Number(rows[0].isAdmin) === 1 || Number(rows[0].CanManageOrganizations) === 1;
};

const canManageOrganizationSettings = async (organizationId: number | string, userId?: number): Promise<boolean> => {
  if (!userId) {
    return false;
  }

  const [globalManage, requester] = await Promise.all([
    getGlobalOrganizationManagementPermission(userId),
    pool.execute<RowDataPacket[]>(
      `SELECT om.Role, COALESCE(pg.CanManageSettings, 0) AS CanManageSettings
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [organizationId, userId]
    ),
  ]);

  const requesterRows = requester[0];
  if (requesterRows.length === 0) {
    return false;
  }

  return (
    globalManage ||
    requesterRows[0].Role === 'Owner' ||
    requesterRows[0].Role === 'Admin' ||
    Number(requesterRows[0].CanManageSettings) === 1
  );
};

const invalidatePermissionGroupCaches = async (orgId: number | string): Promise<void> => {
  await invalidateByEntity('permissionGroup', { orgId });

  const [members] = await pool.execute<RowDataPacket[]>(
    'SELECT UserId FROM OrganizationMembers WHERE OrganizationId = ?',
    [orgId]
  );

  if (members.length > 0) {
    await invalidateByEntity('permission', {
      orgId: 'global',
      userIds: members.map((member) => Number(member.UserId)),
    });
  }
};

/**
 * @swagger
 * tags:
 *   name: PermissionGroups
 *   description: Organization-level permission groups
 */

/**
 * @swagger
 * /api/permission-groups/organization/{orgId}:
 *   get:
 *     summary: Get permission groups for an organization
 *     tags: [PermissionGroups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orgId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Organization ID
 *     responses:
 *       200:
 *         description: List of permission groups
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
// Get permission groups for an organization
router.get('/organization/:orgId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = req.params.orgId;

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

    const groups = await cachedJson(
      cacheKeys.orgPermissionGroups(String(orgId)),
      ENTITY_TTL_SECONDS,
      async () => {
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.*, 
                  (SELECT COUNT(*) FROM OrganizationMembers WHERE PermissionGroupId = pg.Id) as MemberCount
           FROM PermissionGroups pg
           WHERE pg.OrganizationId = ?
           ORDER BY pg.GroupName`,
          [orgId]
        );

        return rows;
      }
    );

    res.json({
      success: true,
      groups
    });
  } catch (error) {
    console.error('Get permission groups error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch permission groups' 
    });
  }
});

/**
 * @swagger
 * /api/permission-groups:
 *   post:
 *     summary: Create a permission group
 *     tags: [PermissionGroups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organizationId
 *               - groupName
 *             properties:
 *               organizationId:
 *                 type: integer
 *               groupName:
 *                 type: string
 *               description:
 *                 type: string
 *               canManageProjects:
 *                 type: boolean
 *               canManageTasks:
 *                 type: boolean
 *               canPlanTasks:
 *                 type: boolean
 *               canManageMembers:
 *                 type: boolean
 *               canManageSettings:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Permission group created
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Permission denied
 *       500:
 *         description: Server error
 */
// Create permission group
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { 
      organizationId, 
      groupName, 
      description,
      canManageProjects,
      canCreateProjects,
      canDeleteProjects,
      canManageTasks,
      canCreateTasks,
      canDeleteTasks,
      canAssignTasks,
      canPlanTasks,
      canManageTimeEntries,
      canViewReports,
      canViewBudgetInfo,
      canManageTickets,
      canCreateTickets,
      canDeleteTickets,
      canAssignTickets,
      canCreateTaskFromTicket,
      canViewOthersPlanning,
      canViewApplications,
      canManageMembers,
      canManageSettings,
      canManageApplications,
      canCreateApplications,
      canDeleteApplications,
      canManageReleases
    } = req.body;

    if (!groupName || !organizationId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Group name and organization ID are required' 
      });
    }

    if (!(await canManageOrganizationSettings(organizationId, userId))) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO PermissionGroups 
        (OrganizationId, GroupName, Description, CanManageProjects, CanCreateProjects, CanDeleteProjects, CanManageTasks, CanCreateTasks, CanDeleteTasks, CanAssignTasks, CanPlanTasks, CanManageTimeEntries, CanViewReports, CanViewBudgetInfo, CanManageTickets, CanCreateTickets, CanDeleteTickets, CanAssignTickets, CanCreateTaskFromTicket, CanViewOthersPlanning, CanViewApplications, CanManageMembers, CanManageSettings, CanManageApplications, CanCreateApplications, CanDeleteApplications, CanManageReleases) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        groupName,
        description || null,
        canManageProjects ? 1 : 0,
        canCreateProjects ? 1 : 0,
        canDeleteProjects ? 1 : 0,
        canManageTasks ? 1 : 0,
        canCreateTasks ? 1 : 0,
        canDeleteTasks ? 1 : 0,
        canAssignTasks ? 1 : 0,
        canPlanTasks ? 1 : 0,
        canManageTimeEntries ? 1 : 0,
        canViewReports ? 1 : 0,
        canViewBudgetInfo ? 1 : 0,
        canManageTickets ? 1 : 0,
        canCreateTickets ? 1 : 0,
        canDeleteTickets ? 1 : 0,
        canAssignTickets ? 1 : 0,
        canCreateTaskFromTicket ? 1 : 0,
        canViewOthersPlanning ? 1 : 0,
        canViewApplications ? 1 : 0,
        canManageMembers ? 1 : 0,
        canManageSettings ? 1 : 0,
        canManageApplications ? 1 : 0,
        canCreateApplications ? 1 : 0,
        canDeleteApplications ? 1 : 0,
        canManageReleases ? 1 : 0
      ]
    );

    await invalidatePermissionGroupCaches(organizationId);

    res.status(201).json({
      success: true,
      message: 'Permission group created successfully',
      groupId: result.insertId
    });
  } catch (error) {
    console.error('Create permission group error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create permission group' 
    });
  }
});

/**
 * @swagger
 * /api/permission-groups/{id}:
 *   put:
 *     summary: Update a permission group
 *     tags: [PermissionGroups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Permission group ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               groupName:
 *                 type: string
 *               description:
 *                 type: string
 *               canManageProjects:
 *                 type: boolean
 *               canManageTasks:
 *                 type: boolean
 *               canPlanTasks:
 *                 type: boolean
 *               canManageMembers:
 *                 type: boolean
 *               canManageSettings:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Permission group updated
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Group not found
 *       500:
 *         description: Server error
 */
// Update permission group
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.id;
    const { 
      groupName, 
      description,
      canManageProjects,
      canCreateProjects,
      canDeleteProjects,
      canManageTasks,
      canCreateTasks,
      canDeleteTasks,
      canAssignTasks,
      canPlanTasks,
      canManageTimeEntries,
      canViewReports,
      canViewBudgetInfo,
      canManageTickets,
      canCreateTickets,
      canDeleteTickets,
      canAssignTickets,
      canCreateTaskFromTicket,
      canViewOthersPlanning,
      canViewApplications,
      canManageMembers,
      canManageSettings,
      canManageApplications,
      canCreateApplications,
      canDeleteApplications,
      canManageReleases
    } = req.body;

    // Get organization ID from group
    const [groups] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM PermissionGroups WHERE Id = ?',
      [groupId]
    );

    if (groups.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Permission group not found' 
      });
    }

    const orgId = groups[0].OrganizationId;

    if (!(await canManageOrganizationSettings(orgId, userId))) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }

    await pool.execute(
      `UPDATE PermissionGroups 
       SET GroupName = ?, Description = ?, 
           CanManageProjects = ?, CanCreateProjects = ?, CanDeleteProjects = ?,
           CanManageTasks = ?, CanCreateTasks = ?, CanDeleteTasks = ?, CanAssignTasks = ?,
           CanPlanTasks = ?, CanManageTimeEntries = ?, CanViewReports = ?,
           CanViewBudgetInfo = ?,
           CanManageTickets = ?, CanCreateTickets = ?, CanDeleteTickets = ?, CanAssignTickets = ?,
             CanCreateTaskFromTicket = ?, CanViewOthersPlanning = ?, CanViewApplications = ?, CanManageMembers = ?, CanManageSettings = ?,
             CanManageApplications = ?, CanCreateApplications = ?, CanDeleteApplications = ?, CanManageReleases = ?
       WHERE Id = ?`,
      [
        groupName,
        description,
        canManageProjects ? 1 : 0,
        canCreateProjects ? 1 : 0,
        canDeleteProjects ? 1 : 0,
        canManageTasks ? 1 : 0,
        canCreateTasks ? 1 : 0,
        canDeleteTasks ? 1 : 0,
        canAssignTasks ? 1 : 0,
        canPlanTasks ? 1 : 0,
        canManageTimeEntries ? 1 : 0,
        canViewReports ? 1 : 0,
        canViewBudgetInfo ? 1 : 0,
        canManageTickets ? 1 : 0,
        canCreateTickets ? 1 : 0,
        canDeleteTickets ? 1 : 0,
        canAssignTickets ? 1 : 0,
        canCreateTaskFromTicket ? 1 : 0,
        canViewOthersPlanning ? 1 : 0,
        canViewApplications ? 1 : 0,
        canManageMembers ? 1 : 0,
        canManageSettings ? 1 : 0,
        canManageApplications ? 1 : 0,
        canCreateApplications ? 1 : 0,
        canDeleteApplications ? 1 : 0,
        canManageReleases ? 1 : 0,
        groupId
      ]
    );

    await invalidatePermissionGroupCaches(orgId);

    res.json({
      success: true,
      message: 'Permission group updated successfully'
    });
  } catch (error) {
    console.error('Update permission group error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update permission group' 
    });
  }
});

/**
 * POST /api/permission-groups/:id/sync-from-global
 * Reset a system permission group to the current global role defaults.
 */
router.post('/:id/sync-from-global', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.id;

    const [groups] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId, LinkedRole, IsSystemGroup FROM PermissionGroups WHERE Id = ?',
      [groupId]
    );

    if (groups.length === 0) {
      return res.status(404).json({ success: false, message: 'Permission group not found' });
    }

    if (!groups[0].IsSystemGroup || !groups[0].LinkedRole) {
      return res.status(400).json({ success: false, message: 'Only system groups linked to a global role can be synced' });
    }

    const orgId = groups[0].OrganizationId;

    if (!(await canManageOrganizationSettings(orgId, userId))) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    // Get the global role permissions
    const [rolePerms] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM RolePermissions WHERE RoleName = ?',
      [groups[0].LinkedRole]
    );

    if (rolePerms.length === 0) {
      return res.status(404).json({ success: false, message: 'Global role not found' });
    }

    const rp = rolePerms[0];

    await pool.execute(
      `UPDATE PermissionGroups
       SET CanManageProjects = ?, CanCreateProjects = ?, CanDeleteProjects = ?,
           CanManageTasks = ?, CanCreateTasks = ?, CanDeleteTasks = ?, CanAssignTasks = ?,
           CanPlanTasks = ?, CanManageTimeEntries = ?, CanViewReports = ?,
           CanViewBudgetInfo = ?,
           CanManageTickets = ?, CanCreateTickets = ?, CanDeleteTickets = ?, CanAssignTickets = ?,
             CanCreateTaskFromTicket = ?,
            CanViewOthersPlanning = ?, CanViewApplications = ?,
             CanManageApplications = ?, CanCreateApplications = ?, CanDeleteApplications = ?, CanManageReleases = ?
       WHERE Id = ?`,
      [
        rp.CanManageProjects ? 1 : 0, rp.CanCreateProjects ? 1 : 0, rp.CanDeleteProjects ? 1 : 0,
        rp.CanManageTasks ? 1 : 0, rp.CanCreateTasks ? 1 : 0, rp.CanDeleteTasks ? 1 : 0, rp.CanAssignTasks ? 1 : 0,
        rp.CanPlanTasks ? 1 : 0, rp.CanManageTimeEntries ? 1 : 0, rp.CanViewReports ? 1 : 0,
        rp.CanViewBudgetInfo ? 1 : 0,
        rp.CanManageTickets ? 1 : 0, rp.CanCreateTickets ? 1 : 0, rp.CanDeleteTickets ? 1 : 0, rp.CanAssignTickets ? 1 : 0,
        rp.CanCreateTaskFromTicket ? 1 : 0,
        rp.CanViewOthersPlanning ? 1 : 0, rp.CanViewApplications ? 1 : 0,
        rp.CanManageApplications ? 1 : 0, rp.CanCreateApplications ? 1 : 0, rp.CanDeleteApplications ? 1 : 0, rp.CanManageReleases ? 1 : 0,
        groupId
      ]
    );

    await invalidatePermissionGroupCaches(orgId);

    res.json({ success: true, message: `Permission group synced from global ${groups[0].LinkedRole} role defaults` });
  } catch (error) {
    console.error('Sync permission group error:', error);
    res.status(500).json({ success: false, message: 'Failed to sync permission group' });
  }
});

/**
 * @swagger
 * /api/permission-groups/{id}:
 *   delete:
 *     summary: Delete a permission group
 *     tags: [PermissionGroups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Permission group ID
 *     responses:
 *       200:
 *         description: Permission group deleted
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Group not found
 *       500:
 *         description: Server error
 */
// Delete permission group
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.id;

    // Get organization ID from group
    const [groups] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId, IsSystemGroup FROM PermissionGroups WHERE Id = ?',
      [groupId]
    );

    if (groups.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Permission group not found' 
      });
    }

    const orgId = groups[0].OrganizationId;

    // Prevent deletion of system groups (linked to global roles)
    if (groups[0].IsSystemGroup) {
      return res.status(400).json({
        success: false,
        message: 'System permission groups (linked to global roles) cannot be deleted. You can edit their permissions to override defaults for this organization.'
      });
    }

    if (!(await canManageOrganizationSettings(orgId, userId))) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }

    // Check if group has members
    const [members] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM OrganizationMembers WHERE PermissionGroupId = ?',
      [groupId]
    );

    if (members[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete permission group with active members' 
      });
    }

    await pool.execute('DELETE FROM PermissionGroups WHERE Id = ?', [groupId]);

    await invalidatePermissionGroupCaches(orgId);

    res.json({
      success: true,
      message: 'Permission group deleted successfully'
    });
  } catch (error) {
    console.error('Delete permission group error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete permission group' 
    });
  }
});

export default router;
