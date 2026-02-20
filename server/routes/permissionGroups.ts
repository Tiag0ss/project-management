import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

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

    const [groups] = await pool.execute<RowDataPacket[]>(
      `SELECT pg.*, 
              (SELECT COUNT(*) FROM OrganizationMembers WHERE PermissionGroupId = pg.Id) as MemberCount
       FROM PermissionGroups pg
       WHERE pg.OrganizationId = ?
       ORDER BY pg.GroupName`,
      [orgId]
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
      canManageTasks,
      canPlanTasks,
      canManageMembers,
      canManageSettings
    } = req.body;

    if (!groupName || !organizationId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Group name and organization ID are required' 
      });
    }

    // Check if user has permission
    const [requester] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [organizationId, userId]
    );

    if (requester.length === 0 || (requester[0].Role !== 'Owner' && !requester[0].CanManageSettings)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO PermissionGroups 
       (OrganizationId, GroupName, Description, CanManageProjects, CanManageTasks, CanPlanTasks, CanManageMembers, CanManageSettings) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        groupName,
        description || null,
        canManageProjects ? 1 : 0,
        canManageTasks ? 1 : 0,
        canPlanTasks ? 1 : 0,
        canManageMembers ? 1 : 0,
        canManageSettings ? 1 : 0
      ]
    );

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
      canManageTasks,
      canPlanTasks,
      canManageMembers,
      canManageSettings
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

    // Check if user has permission
    const [requester] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [orgId, userId]
    );

    if (requester.length === 0 || (requester[0].Role !== 'Owner' && !requester[0].CanManageSettings)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }

    await pool.execute(
      `UPDATE PermissionGroups 
       SET GroupName = ?, Description = ?, 
           CanManageProjects = ?, CanManageTasks = ?, CanPlanTasks = ?, CanManageMembers = ?, CanManageSettings = ?
       WHERE Id = ?`,
      [
        groupName,
        description,
        canManageProjects ? 1 : 0,
        canManageTasks ? 1 : 0,
        canPlanTasks ? 1 : 0,
        canManageMembers ? 1 : 0,
        canManageSettings ? 1 : 0,
        groupId
      ]
    );

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

    // Check if user has permission
    const [requester] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [orgId, userId]
    );

    if (requester.length === 0 || (requester[0].Role !== 'Owner' && !requester[0].CanManageSettings)) {
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
