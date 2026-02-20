import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: RolePermissions
 *   description: Role-based permission management
 */

/**
 * @swagger
 * /api/role-permissions:
 *   get:
 *     summary: Get all role permissions (admin only)
 *     tags: [RolePermissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all role permissions
 *       403:
 *         description: Access denied, admin only
 *       500:
 *         description: Server error
 */
// Get all role permissions
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Check if user is admin
    const [userRows] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin FROM Users WHERE Id = ?',
      [userId]
    );

    if (!userRows.length || !userRows[0].isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
    }

    const [permissions] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM RolePermissions ORDER BY RoleName'
    );

    res.json({ success: true, data: permissions });
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch role permissions' });
  }
});

/**
 * @swagger
 * /api/role-permissions/{roleName}:
 *   get:
 *     summary: Get permissions for a specific role
 *     tags: [RolePermissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Developer, Support, Manager]
 *         description: Role name
 *     responses:
 *       200:
 *         description: Role permissions
 *       404:
 *         description: Role permissions not found
 *       500:
 *         description: Server error
 */
// Get permissions for a specific role
router.get('/:roleName', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { roleName } = req.params;

    const [permissions] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM RolePermissions WHERE RoleName = ?',
      [roleName]
    );

    if (!permissions.length) {
      return res.status(404).json({ success: false, message: 'Role permissions not found' });
    }

    res.json({ success: true, data: permissions[0] });
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch role permissions' });
  }
});

/**
 * @swagger
 * /api/role-permissions/{roleName}:
 *   put:
 *     summary: Update permissions for a role (admin only)
 *     tags: [RolePermissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Developer, Support, Manager]
 *         description: Role name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               canViewDashboard:
 *                 type: boolean
 *               canViewPlanning:
 *                 type: boolean
 *               canManageProjects:
 *                 type: boolean
 *               canCreateProjects:
 *                 type: boolean
 *               canDeleteProjects:
 *                 type: boolean
 *               canManageTasks:
 *                 type: boolean
 *               canCreateTasks:
 *                 type: boolean
 *               canDeleteTasks:
 *                 type: boolean
 *               canAssignTasks:
 *                 type: boolean
 *               canManageTimeEntries:
 *                 type: boolean
 *               canViewReports:
 *                 type: boolean
 *               canManageOrganizations:
 *                 type: boolean
 *               canManageUsers:
 *                 type: boolean
 *               canManageTickets:
 *                 type: boolean
 *               canCreateTickets:
 *                 type: boolean
 *               canDeleteTickets:
 *                 type: boolean
 *               canAssignTickets:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Role permissions updated
 *       403:
 *         description: Access denied, admin only
 *       500:
 *         description: Server error
 */
// Update role permissions
router.put('/:roleName', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { roleName } = req.params;

    // Check if user is admin
    const [userRows] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin FROM Users WHERE Id = ?',
      [userId]
    );

    if (!userRows.length || !userRows[0].isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
    }

    // Accept both camelCase and PascalCase for compatibility
    const body = req.body;
    const getValue = (pascalKey: string, camelKey: string) => {
      return body[pascalKey] !== undefined ? body[pascalKey] : body[camelKey];
    };

    const canViewDashboard = getValue('CanViewDashboard', 'canViewDashboard');
    const canViewPlanning = getValue('CanViewPlanning', 'canViewPlanning');
    const canViewProjects = getValue('CanViewProjects', 'canViewProjects');
    const canManageProjects = getValue('CanManageProjects', 'canManageProjects');
    const canCreateProjects = getValue('CanCreateProjects', 'canCreateProjects');
    const canDeleteProjects = getValue('CanDeleteProjects', 'canDeleteProjects');
    const canViewTasks = getValue('CanViewTasks', 'canViewTasks');
    const canManageTasks = getValue('CanManageTasks', 'canManageTasks');
    const canCreateTasks = getValue('CanCreateTasks', 'canCreateTasks');
    const canDeleteTasks = getValue('CanDeleteTasks', 'canDeleteTasks');
    const canAssignTasks = getValue('CanAssignTasks', 'canAssignTasks');
    const canManageTimeEntries = getValue('CanManageTimeEntries', 'canManageTimeEntries');
    const canViewReports = getValue('CanViewReports', 'canViewReports');
    const canManageOrganizations = getValue('CanManageOrganizations', 'canManageOrganizations');
    const canManageUsers = getValue('CanManageUsers', 'canManageUsers');
    const canManageTickets = getValue('CanManageTickets', 'canManageTickets');
    const canCreateTickets = getValue('CanCreateTickets', 'canCreateTickets');
    const canDeleteTickets = getValue('CanDeleteTickets', 'canDeleteTickets');
    const canAssignTickets = getValue('CanAssignTickets', 'canAssignTickets');
    const canPlanTasks = getValue('CanPlanTasks', 'canPlanTasks');
    const canViewOthersPlanning = getValue('CanViewOthersPlanning', 'canViewOthersPlanning');
    const canViewCustomers = getValue('CanViewCustomers', 'canViewCustomers');
    const canManageCustomers = getValue('CanManageCustomers', 'canManageCustomers');
    const canCreateCustomers = getValue('CanCreateCustomers', 'canCreateCustomers');
    const canDeleteCustomers = getValue('CanDeleteCustomers', 'canDeleteCustomers');
    const canCreateTaskFromTicket = getValue('CanCreateTaskFromTicket', 'canCreateTaskFromTicket');

    // Check if role permissions exist
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM RolePermissions WHERE RoleName = ?',
      [roleName]
    );

    if (existing.length) {
      // Update existing
      await pool.execute<ResultSetHeader>(
        `UPDATE RolePermissions SET
          CanViewDashboard = ?,
          CanViewPlanning = ?,
          CanViewProjects = ?,
          CanManageProjects = ?,
          CanCreateProjects = ?,
          CanDeleteProjects = ?,
          CanViewTasks = ?,
          CanManageTasks = ?,
          CanCreateTasks = ?,
          CanDeleteTasks = ?,
          CanAssignTasks = ?,
          CanManageTimeEntries = ?,
          CanViewReports = ?,
          CanManageOrganizations = ?,
          CanManageUsers = ?,
          CanViewCustomers = ?,
          CanManageCustomers = ?,
          CanCreateCustomers = ?,
          CanDeleteCustomers = ?,
          CanManageTickets = ?,
          CanCreateTickets = ?,
          CanDeleteTickets = ?,
          CanAssignTickets = ?,
          CanCreateTaskFromTicket = ?,
          CanPlanTasks = ?,
          CanViewOthersPlanning = ?
        WHERE RoleName = ?`,
        [
          canViewDashboard ? 1 : 0,
          canViewPlanning ? 1 : 0,
          canViewProjects ? 1 : 0,
          canManageProjects ? 1 : 0,
          canCreateProjects ? 1 : 0,
          canDeleteProjects ? 1 : 0,
          canViewTasks ? 1 : 0,
          canManageTasks ? 1 : 0,
          canCreateTasks ? 1 : 0,
          canDeleteTasks ? 1 : 0,
          canAssignTasks ? 1 : 0,
          canManageTimeEntries ? 1 : 0,
          canViewReports ? 1 : 0,
          canManageOrganizations ? 1 : 0,
          canManageUsers ? 1 : 0,
          canViewCustomers ? 1 : 0,
          canManageCustomers ? 1 : 0,
          canCreateCustomers ? 1 : 0,
          canDeleteCustomers ? 1 : 0,
          canManageTickets ? 1 : 0,
          canCreateTickets ? 1 : 0,
          canDeleteTickets ? 1 : 0,
          canAssignTickets ? 1 : 0,
          canCreateTaskFromTicket ? 1 : 0,
          canPlanTasks ? 1 : 0,
          canViewOthersPlanning ? 1 : 0,
          roleName
        ]
      );
    } else {
      // Create new
      await pool.execute<ResultSetHeader>(
        `INSERT INTO RolePermissions (
          RoleName,
          CanViewDashboard,
          CanViewPlanning,
          CanViewProjects,
          CanManageProjects,
          CanCreateProjects,
          CanDeleteProjects,
          CanViewTasks,
          CanManageTasks,
          CanCreateTasks,
          CanDeleteTasks,
          CanAssignTasks,
          CanManageTimeEntries,
          CanViewReports,
          CanManageOrganizations,
          CanManageUsers,
          CanViewCustomers,
          CanManageCustomers,
          CanCreateCustomers,
          CanDeleteCustomers,
          CanManageTickets,
          CanCreateTickets,
          CanDeleteTickets,
          CanAssignTickets,
          CanCreateTaskFromTicket,
          CanPlanTasks,
          CanViewOthersPlanning
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          roleName,
          canViewDashboard ? 1 : 0,
          canViewPlanning ? 1 : 0,
          canViewProjects ? 1 : 0,
          canManageProjects ? 1 : 0,
          canCreateProjects ? 1 : 0,
          canDeleteProjects ? 1 : 0,
          canViewTasks ? 1 : 0,
          canManageTasks ? 1 : 0,
          canCreateTasks ? 1 : 0,
          canDeleteTasks ? 1 : 0,
          canAssignTasks ? 1 : 0,
          canManageTimeEntries ? 1 : 0,
          canViewReports ? 1 : 0,
          canManageOrganizations ? 1 : 0,
          canManageUsers ? 1 : 0,
          canViewCustomers ? 1 : 0,
          canManageCustomers ? 1 : 0,
          canCreateCustomers ? 1 : 0,
          canDeleteCustomers ? 1 : 0,
          canManageTickets ? 1 : 0,
          canCreateTickets ? 1 : 0,
          canDeleteTickets ? 1 : 0,
          canAssignTickets ? 1 : 0,
          canCreateTaskFromTicket ? 1 : 0,
          canPlanTasks ? 1 : 0,
          canViewOthersPlanning ? 1 : 0
        ]
      );
    }

    res.json({ success: true, message: 'Role permissions updated successfully' });
  } catch (error) {
    console.error('Error updating role permissions:', error);
    res.status(500).json({ success: false, message: 'Failed to update role permissions' });
  }
});

/**
 * @swagger
 * /api/role-permissions/user/{userId}:
 *   get:
 *     summary: Get combined permissions for a user based on all their roles
 *     tags: [RolePermissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: Combined permissions for the user
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
// Get user's combined permissions (from all their roles)
router.get('/user/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.userId as string);
    const requestingUserId = req.user?.userId;

    // Users can only get their own permissions unless they're admin
    if (requestingUserId !== userId) {
      const [userRows] = await pool.execute<RowDataPacket[]>(
        'SELECT isAdmin FROM Users WHERE Id = ?',
        [requestingUserId]
      );

      if (!userRows.length || !userRows[0].isAdmin) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Get user's roles
    const [userRows] = await pool.execute<RowDataPacket[]>(
      'SELECT IsDeveloper, IsSupport, IsManager, isAdmin FROM Users WHERE Id = ?',
      [userId]
    );

    if (!userRows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = userRows[0];

    // Admin has all permissions
    if (user.isAdmin) {
      return res.json({
        success: true,
        data: {
          canViewDashboard: true,
          canViewPlanning: true,
          canViewProjects: true,
          canManageProjects: true,
          canCreateProjects: true,
          canDeleteProjects: true,
          canViewTasks: true,
          canManageTasks: true,
          canCreateTasks: true,
          canDeleteTasks: true,
          canAssignTasks: true,
          canManageTimeEntries: true,
          canViewReports: true,
          canManageOrganizations: true,
          canViewCustomers: true,
          canManageCustomers: true,
          canCreateCustomers: true,
          canDeleteCustomers: true,
          canManageUsers: true,
          canManageTickets: true,
          canCreateTickets: true,
          canDeleteTickets: true,
          canAssignTickets: true,
          canPlanTasks: true,
          canViewOthersPlanning: true
        }
      });
    }

    // Get permissions for each role the user has
    const roles: string[] = [];
    if (user.IsDeveloper) roles.push('Developer');
    if (user.IsSupport) roles.push('Support');
    if (user.IsManager) roles.push('Manager');
/*
    console.log('User roles:', roles);
    console.log('User data:', user);
*/
    if (!roles.length) {
      // No roles, no permissions
      return res.json({
        success: true,
        data: {
          canViewDashboard: false,
          canViewPlanning: false,
          canManageProjects: false,
          canCreateProjects: false,
          canDeleteProjects: false,
          canManageTasks: false,
          canCreateTasks: false,
          canDeleteTasks: false,
          canAssignTasks: false,
          canManageTimeEntries: false,
          canViewReports: false,
          canManageOrganizations: false,
          canViewCustomers: false,
          canManageCustomers: false,
          canCreateCustomers: false,
          canDeleteCustomers: false,
          canManageUsers: false,
          canManageTickets: false,
          canCreateTickets: false,
          canDeleteTickets: false,
          canAssignTickets: false,
          canPlanTasks: false,
          canViewOthersPlanning: false
        }
      });
    }

    // Build placeholders for IN clause
    const placeholders = roles.map(() => '?').join(',');
    const [permissions] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM RolePermissions WHERE RoleName IN (${placeholders})`,
      roles
    );

    //console.log('Permissions from DB:', permissions);

    // Combine permissions (user has permission if ANY of their roles has it)
    const combined = {
      canViewDashboard: false,
      canViewPlanning: false,
      canViewProjects: false,
      canManageProjects: false,
      canCreateProjects: false,
      canDeleteProjects: false,
      canViewTasks: false,
      canManageTasks: false,
      canCreateTasks: false,
      canDeleteTasks: false,
      canAssignTasks: false,
      canManageTimeEntries: false,
      canViewReports: false,
      canManageOrganizations: false,
      canViewCustomers: false,
      canManageCustomers: false,
      canCreateCustomers: false,
      canDeleteCustomers: false,
      canManageUsers: false,
      canManageTickets: false,
      canCreateTickets: false,
      canDeleteTickets: false,
      canAssignTickets: false,
      canPlanTasks: false,
      canViewOthersPlanning: false
    };

    permissions.forEach((perm: any) => {
      if (perm.CanViewDashboard) combined.canViewDashboard = true;
      if (perm.CanViewPlanning) combined.canViewPlanning = true;
      if (perm.CanViewProjects) combined.canViewProjects = true;
      if (perm.CanManageProjects) combined.canManageProjects = true;
      if (perm.CanCreateProjects) combined.canCreateProjects = true;
      if (perm.CanDeleteProjects) combined.canDeleteProjects = true;
      if (perm.CanViewTasks) combined.canViewTasks = true;
      if (perm.CanManageTasks) combined.canManageTasks = true;
      if (perm.CanCreateTasks) combined.canCreateTasks = true;
      if (perm.CanDeleteTasks) combined.canDeleteTasks = true;
      if (perm.CanAssignTasks) combined.canAssignTasks = true;
      if (perm.CanManageTimeEntries) combined.canManageTimeEntries = true;
      if (perm.CanViewReports) combined.canViewReports = true;
      if (perm.CanManageOrganizations) combined.canManageOrganizations = true;
      if (perm.CanViewCustomers) combined.canViewCustomers = true;
      if (perm.CanManageCustomers) combined.canManageCustomers = true;
      if (perm.CanCreateCustomers) combined.canCreateCustomers = true;
      if (perm.CanDeleteCustomers) combined.canDeleteCustomers = true;
      if (perm.CanManageUsers) combined.canManageUsers = true;
      if (perm.CanManageTickets) combined.canManageTickets = true;
      if (perm.CanCreateTickets) combined.canCreateTickets = true;
      if (perm.CanDeleteTickets) combined.canDeleteTickets = true;
      if (perm.CanAssignTickets) combined.canAssignTickets = true;
      if (perm.CanPlanTasks) combined.canPlanTasks = true;
      if (perm.CanViewOthersPlanning) combined.canViewOthersPlanning = true;
    });

    res.json({ success: true, data: combined });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user permissions' });
  }
});

export default router;
