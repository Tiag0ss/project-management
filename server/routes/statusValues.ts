import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

// Get project status values for an organization
router.get('/project/:orgId', authenticateToken, async (req: AuthRequest, res: Response) => {
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

    const [statuses] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM ProjectStatusValues WHERE OrganizationId = ? ORDER BY SortOrder, StatusName',
      [orgId]
    );

    res.json({
      success: true,
      statuses
    });
  } catch (error) {
    console.error('Get project status values error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch project status values' 
    });
  }
});

// Get task status values for an organization
router.get('/task/:orgId', authenticateToken, async (req: AuthRequest, res: Response) => {
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

    const [statuses] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM TaskStatusValues WHERE OrganizationId = ? ORDER BY SortOrder, StatusName',
      [orgId]
    );

    res.json({
      success: true,
      statuses
    });
  } catch (error) {
    console.error('Get task status values error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch task status values' 
    });
  }
});

// Create project status value
router.post('/project', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { organizationId, statusName, colorCode, sortOrder, isDefault, isClosed, isCancelled } = req.body;

    if (!statusName || !organizationId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Status name and organization ID are required' 
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

    // If setting as default, unset other defaults
    if (isDefault) {
      await pool.execute(
        'UPDATE ProjectStatusValues SET IsDefault = 0 WHERE OrganizationId = ?',
        [organizationId]
      );
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ProjectStatusValues 
       (OrganizationId, StatusName, ColorCode, SortOrder, IsDefault, IsClosed, IsCancelled) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [organizationId, statusName, colorCode || null, sortOrder || 0, isDefault ? 1 : 0, isClosed ? 1 : 0, isCancelled ? 1 : 0]
    );

    res.status(201).json({
      success: true,
      message: 'Project status value created successfully',
      statusId: result.insertId
    });
  } catch (error) {
    console.error('Create project status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create project status value' 
    });
  }
});

// Create task status value
router.post('/task', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { organizationId, statusName, colorCode, sortOrder, isDefault, isClosed, isCancelled } = req.body;

    if (!statusName || !organizationId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Status name and organization ID are required' 
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

    // If setting as default, unset other defaults
    if (isDefault) {
      await pool.execute(
        'UPDATE TaskStatusValues SET IsDefault = 0 WHERE OrganizationId = ?',
        [organizationId]
      );
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO TaskStatusValues 
       (OrganizationId, StatusName, ColorCode, SortOrder, IsDefault, IsClosed, IsCancelled) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [organizationId, statusName, colorCode || null, sortOrder || 0, isDefault ? 1 : 0, isClosed ? 1 : 0, isCancelled ? 1 : 0]
    );

    res.status(201).json({
      success: true,
      message: 'Task status value created successfully',
      statusId: result.insertId
    });
  } catch (error) {
    console.error('Create task status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create task status value' 
    });
  }
});

// Update project status value
router.put('/project/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const statusId = req.params.id;
    const { statusName, colorCode, sortOrder, isDefault, isClosed, isCancelled } = req.body;

    // Get organization ID
    const [statuses] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM ProjectStatusValues WHERE Id = ?',
      [statusId]
    );

    if (statuses.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Status not found' 
      });
    }

    const orgId = statuses[0].OrganizationId;

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

    // If setting as default, unset other defaults
    if (isDefault) {
      await pool.execute(
        'UPDATE ProjectStatusValues SET IsDefault = 0 WHERE OrganizationId = ? AND Id != ?',
        [orgId, statusId]
      );
    }

    await pool.execute(
      'UPDATE ProjectStatusValues SET StatusName = ?, ColorCode = ?, SortOrder = ?, IsDefault = ?, IsClosed = ?, IsCancelled = ? WHERE Id = ?',
      [statusName, colorCode, sortOrder, isDefault ? 1 : 0, isClosed ? 1 : 0, isCancelled ? 1 : 0, statusId]
    );

    res.json({
      success: true,
      message: 'Project status value updated successfully'
    });
  } catch (error) {
    console.error('Update project status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update project status value' 
    });
  }
});

// Update task status value
router.put('/task/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const statusId = req.params.id;
    const { statusName, colorCode, sortOrder, isDefault, isClosed, isCancelled } = req.body;

    // Get organization ID
    const [statuses] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM TaskStatusValues WHERE Id = ?',
      [statusId]
    );

    if (statuses.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Status not found' 
      });
    }

    const orgId = statuses[0].OrganizationId;

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

    // If setting as default, unset other defaults
    if (isDefault) {
      await pool.execute(
        'UPDATE TaskStatusValues SET IsDefault = 0 WHERE OrganizationId = ? AND Id != ?',
        [orgId, statusId]
      );
    }

    await pool.execute(
      'UPDATE TaskStatusValues SET StatusName = ?, ColorCode = ?, SortOrder = ?, IsDefault = ?, IsClosed = ?, IsCancelled = ? WHERE Id = ?',
      [statusName, colorCode, sortOrder, isDefault ? 1 : 0, isClosed ? 1 : 0, isCancelled ? 1 : 0, statusId]
    );

    res.json({
      success: true,
      message: 'Task status value updated successfully'
    });
  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update task status value' 
    });
  }
});

// Delete project status value
router.delete('/project/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const statusId = req.params.id;

    // Get organization ID
    const [statuses] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM ProjectStatusValues WHERE Id = ?',
      [statusId]
    );

    if (statuses.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Status not found' 
      });
    }

    const orgId = statuses[0].OrganizationId;

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

    await pool.execute('DELETE FROM ProjectStatusValues WHERE Id = ?', [statusId]);

    res.json({
      success: true,
      message: 'Project status value deleted successfully'
    });
  } catch (error) {
    console.error('Delete project status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete project status value' 
    });
  }
});

// Delete task status value
router.delete('/task/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const statusId = req.params.id;

    // Get organization ID
    const [statuses] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM TaskStatusValues WHERE Id = ?',
      [statusId]
    );

    if (statuses.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Status not found' 
      });
    }

    const orgId = statuses[0].OrganizationId;

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

    await pool.execute('DELETE FROM TaskStatusValues WHERE Id = ?', [statusId]);

    res.json({
      success: true,
      message: 'Task status value deleted successfully'
    });
  } catch (error) {
    console.error('Delete task status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete task status value' 
    });
  }
});

// Get task priority values for an organization
router.get('/priority/:orgId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = req.params.orgId;

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

    const [priorities] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM TaskPriorityValues WHERE OrganizationId = ? ORDER BY SortOrder, PriorityName',
      [orgId]
    );

    // If no priorities exist, create default ones
    if (priorities.length === 0) {
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

      // Fetch the newly created priorities
      const [newPriorities] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM TaskPriorityValues WHERE OrganizationId = ? ORDER BY SortOrder, PriorityName',
        [orgId]
      );

      return res.json({
        success: true,
        priorities: newPriorities
      });
    }

    res.json({
      success: true,
      priorities
    });
  } catch (error) {
    console.error('Get task priority values error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch task priority values' 
    });
  }
});

// Create task priority value
router.post('/priority', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { organizationId, priorityName, colorCode, sortOrder, isDefault } = req.body;

    if (!organizationId || !priorityName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Organization ID and priority name are required' 
      });
    }

    const [member] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [organizationId, userId]
    );

    if (member.length === 0 || (member[0].Role !== 'Owner' && member[0].Role !== 'Admin' && !member[0].CanManageSettings)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }

    if (isDefault) {
      await pool.execute(
        'UPDATE TaskPriorityValues SET IsDefault = 0 WHERE OrganizationId = ?',
        [organizationId]
      );
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO TaskPriorityValues (OrganizationId, PriorityName, ColorCode, SortOrder, IsDefault)
       VALUES (?, ?, ?, ?, ?)`,
      [organizationId, priorityName, colorCode || '#3b82f6', sortOrder || 0, isDefault ? 1 : 0]
    );

    res.json({
      success: true,
      message: 'Task priority value created successfully',
      priorityId: result.insertId
    });
  } catch (error) {
    console.error('Create task priority error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create task priority value' 
    });
  }
});

// Update task priority value
router.put('/priority/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const priorityId = req.params.id;
    const { organizationId, priorityName, colorCode, sortOrder, isDefault } = req.body;

    const [priority] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM TaskPriorityValues WHERE Id = ?',
      [priorityId]
    );

    if (priority.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Priority value not found' 
      });
    }

    const orgId = priority[0].OrganizationId;

    const [member] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [orgId, userId]
    );

    if (member.length === 0 || (member[0].Role !== 'Owner' && member[0].Role !== 'Admin' && !member[0].CanManageSettings)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }

    if (isDefault) {
      await pool.execute(
        'UPDATE TaskPriorityValues SET IsDefault = 0 WHERE OrganizationId = ?',
        [orgId]
      );
    }

    await pool.execute(
      `UPDATE TaskPriorityValues 
       SET PriorityName = ?, ColorCode = ?, SortOrder = ?, IsDefault = ?
       WHERE Id = ?`,
      [priorityName, colorCode, sortOrder, isDefault ? 1 : 0, priorityId]
    );

    res.json({
      success: true,
      message: 'Task priority value updated successfully'
    });
  } catch (error) {
    console.error('Update task priority error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update task priority value' 
    });
  }
});

// Delete task priority value
router.delete('/priority/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const priorityId = req.params.id;

    const [priority] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM TaskPriorityValues WHERE Id = ?',
      [priorityId]
    );

    if (priority.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Priority value not found' 
      });
    }

    const orgId = priority[0].OrganizationId;

    const [member] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings
       FROM OrganizationMembers om
       LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
       WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [orgId, userId]
    );

    if (member.length === 0 || (member[0].Role !== 'Owner' && member[0].Role !== 'Admin' && !member[0].CanManageSettings)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied' 
      });
    }

    await pool.execute('DELETE FROM TaskPriorityValues WHERE Id = ?', [priorityId]);

    res.json({
      success: true,
      message: 'Task priority value deleted successfully'
    });
  } catch (error) {
    console.error('Delete task priority error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete task priority value' 
    });
  }
});

export default router;
