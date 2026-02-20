import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

/**
 * @swagger
 * /api/status-values/project/{organizationId}:
 *   get:
 *     summary: Get project status values for an organization
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of project status values
 *       403:
 *         description: Access denied
 */
/**
 * @swagger
 * tags:
 *   name: StatusValues
 *   description: Custom status and priority value management
 */

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

/**
 * @swagger
 * /api/status-values/task/{organizationId}:
 *   get:
 *     summary: Get task status values for an organization
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of task status values
 *       403:
 *         description: Access denied
 */
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

/**
 * @swagger
 * /api/status-values/project:
 *   post:
 *     summary: Create a project status value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, statusName]
 *             properties:
 *               organizationId:
 *                 type: integer
 *               statusName:
 *                 type: string
 *               colorCode:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Project status value created
 *       400:
 *         description: Bad request
 *       403:
 *         description: Permission denied
 */
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

/**
 * @swagger
 * /api/status-values/task:
 *   post:
 *     summary: Create a task status value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, statusName]
 *             properties:
 *               organizationId:
 *                 type: integer
 *               statusName:
 *                 type: string
 *               colorCode:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Task status value created
 *       400:
 *         description: Bad request
 *       403:
 *         description: Permission denied
 */
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

/**
 * @swagger
 * /api/status-values/project/{id}:
 *   put:
 *     summary: Update a project status value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               statusName:
 *                 type: string
 *               colorCode:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Project status value updated
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Status not found
 */
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

/**
 * @swagger
 * /api/status-values/task/{id}:
 *   put:
 *     summary: Update a task status value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               statusName:
 *                 type: string
 *               colorCode:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Task status value updated
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Status not found
 */
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

/**
 * @swagger
 * /api/status-values/project/{id}:
 *   delete:
 *     summary: Delete a project status value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Project status value deleted
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Status not found
 */
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

/**
 * @swagger
 * /api/status-values/task/{id}:
 *   delete:
 *     summary: Delete a task status value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Task status value deleted
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Status not found
 */
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

/**
 * @swagger
 * /api/status-values/priority/{organizationId}:
 *   get:
 *     summary: Get task priority values for an organization
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of task priority values
 *       403:
 *         description: Access denied
 */
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

/**
 * @swagger
 * /api/status-values/priority:
 *   post:
 *     summary: Create a task priority value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, priorityName]
 *             properties:
 *               organizationId:
 *                 type: integer
 *               priorityName:
 *                 type: string
 *               colorCode:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Task priority value created
 *       400:
 *         description: Bad request
 *       403:
 *         description: Permission denied
 */
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

/**
 * @swagger
 * /api/status-values/priority/{id}:
 *   put:
 *     summary: Update a task priority value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               priorityName:
 *                 type: string
 *               colorCode:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Task priority value updated
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Priority not found
 */
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

/**
 * @swagger
 * /api/status-values/priority/{id}:
 *   delete:
 *     summary: Delete a task priority value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Task priority value deleted
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Priority not found
 */
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

// ─── Ticket Status Values ────────────────────────────────────────────────────

const DEFAULT_TICKET_STATUSES = [
  { name: 'Open',              color: '#3b82f6', order: 1, isDefault: 1, isClosed: 0, statusType: 'open' },
  { name: 'In Progress',      color: '#f59e0b', order: 2, isDefault: 0, isClosed: 0, statusType: 'in_progress' },
  { name: 'With Developer',   color: '#8b5cf6', order: 3, isDefault: 0, isClosed: 0, statusType: 'in_progress' },
  { name: 'Scheduled',        color: '#06b6d4', order: 4, isDefault: 0, isClosed: 0, statusType: 'in_progress' },
  { name: 'Waiting Response', color: '#f97316', order: 5, isDefault: 0, isClosed: 0, statusType: 'waiting' },
  { name: 'Resolved',         color: '#22c55e', order: 6, isDefault: 0, isClosed: 1, statusType: 'resolved' },
  { name: 'Closed',           color: '#6b7280', order: 7, isDefault: 0, isClosed: 1, statusType: 'closed' },
];

const DEFAULT_TICKET_PRIORITIES = [
  { name: 'Low',    color: '#6b7280', order: 1, isDefault: 0 },
  { name: 'Medium', color: '#3b82f6', order: 2, isDefault: 1 },
  { name: 'High',   color: '#f59e0b', order: 3, isDefault: 0 },
  { name: 'Urgent', color: '#ef4444', order: 4, isDefault: 0 },
];

async function ensureTicketStatuses(orgId: number): Promise<RowDataPacket[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM TicketStatusValues WHERE OrganizationId = ? ORDER BY SortOrder, StatusName',
    [orgId]
  );
  if (rows.length > 0) return rows;
  for (const s of DEFAULT_TICKET_STATUSES) {
    await pool.execute(
      'INSERT INTO TicketStatusValues (OrganizationId, StatusName, Color, IsDefault, IsClosed, SortOrder, StatusType) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [orgId, s.name, s.color, s.isDefault, s.isClosed, s.order, s.statusType]
    );
  }
  const [newRows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM TicketStatusValues WHERE OrganizationId = ? ORDER BY SortOrder, StatusName',
    [orgId]
  );
  return newRows;
}

async function ensureTicketPriorities(orgId: number): Promise<RowDataPacket[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM TicketPriorityValues WHERE OrganizationId = ? ORDER BY SortOrder, PriorityName',
    [orgId]
  );
  if (rows.length > 0) return rows;
  for (const p of DEFAULT_TICKET_PRIORITIES) {
    await pool.execute(
      'INSERT INTO TicketPriorityValues (OrganizationId, PriorityName, Color, IsDefault, SortOrder) VALUES (?, ?, ?, ?, ?)',
      [orgId, p.name, p.color, p.isDefault, p.order]
    );
  }
  const [newRows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM TicketPriorityValues WHERE OrganizationId = ? ORDER BY SortOrder, PriorityName',
    [orgId]
  );
  return newRows;
}

/**
 * @swagger
 * /api/status-values/ticket/{organizationId}:
 *   get:
 *     summary: Get ticket status values for an organization
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of ticket status values
 *       403:
 *         description: Access denied
 */
// GET ticket statuses (auto-creates defaults)
router.get('/ticket/:orgId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = parseInt(req.params.orgId as string);
    const [access] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [orgId, userId]
    );
    if (access.length === 0) return res.status(403).json({ success: false, message: 'Access denied' });
    const statuses = await ensureTicketStatuses(orgId);
    res.json({ success: true, statuses });
  } catch (error) {
    console.error('Get ticket status values error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket status values' });
  }
});

/**
 * @swagger
 * /api/status-values/ticket:
 *   post:
 *     summary: Create a ticket status value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, statusName]
 *             properties:
 *               organizationId:
 *                 type: integer
 *               statusName:
 *                 type: string
 *               color:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Ticket status value created
 *       400:
 *         description: Bad request
 *       403:
 *         description: Permission denied
 */
// POST ticket status
router.post('/ticket', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { organizationId, statusName, color, sortOrder, isDefault, isClosed, statusType } = req.body;
    if (!statusName || !organizationId) return res.status(400).json({ success: false, message: 'Status name and organization ID are required' });
    const [member] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings FROM OrganizationMembers om LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [organizationId, userId]
    );
    if (member.length === 0 || (member[0].Role !== 'Owner' && !member[0].CanManageSettings)) return res.status(403).json({ success: false, message: 'Permission denied' });
    if (isDefault) await pool.execute('UPDATE TicketStatusValues SET IsDefault = 0 WHERE OrganizationId = ?', [organizationId]);
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO TicketStatusValues (OrganizationId, StatusName, Color, SortOrder, IsDefault, IsClosed, StatusType) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [organizationId, statusName, color || '#6b7280', sortOrder || 0, isDefault ? 1 : 0, isClosed ? 1 : 0, statusType || 'other']
    );
    res.status(201).json({ success: true, statusId: result.insertId });
  } catch (error) {
    console.error('Create ticket status error:', error);
    res.status(500).json({ success: false, message: 'Failed to create ticket status' });
  }
});

/**
 * @swagger
 * /api/status-values/ticket/{id}:
 *   put:
 *     summary: Update a ticket status value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               statusName:
 *                 type: string
 *               color:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Ticket status value updated
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Status not found
 */
// PUT ticket status
router.put('/ticket/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const statusId = req.params.id;
    const { statusName, color, sortOrder, isDefault, isClosed, statusType } = req.body;
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT OrganizationId FROM TicketStatusValues WHERE Id = ?', [statusId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Status not found' });
    const orgId = rows[0].OrganizationId;
    const [member] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings FROM OrganizationMembers om LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [orgId, userId]
    );
    if (member.length === 0 || (member[0].Role !== 'Owner' && !member[0].CanManageSettings)) return res.status(403).json({ success: false, message: 'Permission denied' });
    if (isDefault) await pool.execute('UPDATE TicketStatusValues SET IsDefault = 0 WHERE OrganizationId = ? AND Id != ?', [orgId, statusId]);
    await pool.execute(
      'UPDATE TicketStatusValues SET StatusName = ?, Color = ?, SortOrder = ?, IsDefault = ?, IsClosed = ?, StatusType = ? WHERE Id = ?',
      [statusName, color, sortOrder, isDefault ? 1 : 0, isClosed ? 1 : 0, statusType || 'other', statusId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Update ticket status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update ticket status' });
  }
});

/**
 * @swagger
 * /api/status-values/ticket/{id}:
 *   delete:
 *     summary: Delete a ticket status value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ticket status value deleted
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Status not found
 */
// DELETE ticket status
router.delete('/ticket/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const statusId = req.params.id;
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT OrganizationId FROM TicketStatusValues WHERE Id = ?', [statusId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Status not found' });
    const orgId = rows[0].OrganizationId;
    const [member] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings FROM OrganizationMembers om LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [orgId, userId]
    );
    if (member.length === 0 || (member[0].Role !== 'Owner' && !member[0].CanManageSettings)) return res.status(403).json({ success: false, message: 'Permission denied' });
    await pool.execute('DELETE FROM TicketStatusValues WHERE Id = ?', [statusId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete ticket status error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete ticket status' });
  }
});

// ─── Ticket Priority Values ───────────────────────────────────────────────────

/**
 * @swagger
 * /api/status-values/ticket-priority/{organizationId}:
 *   get:
 *     summary: Get ticket priority values for an organization
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of ticket priority values
 *       403:
 *         description: Access denied
 */
// GET ticket priorities (auto-creates defaults)
router.get('/ticket-priority/:orgId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = parseInt(req.params.orgId as string);
    const [access] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [orgId, userId]
    );
    if (access.length === 0) return res.status(403).json({ success: false, message: 'Access denied' });
    const priorities = await ensureTicketPriorities(orgId);
    res.json({ success: true, priorities });
  } catch (error) {
    console.error('Get ticket priority values error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket priority values' });
  }
});

/**
 * @swagger
 * /api/status-values/ticket-priority:
 *   post:
 *     summary: Create a ticket priority value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, priorityName]
 *             properties:
 *               organizationId:
 *                 type: integer
 *               priorityName:
 *                 type: string
 *               color:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Ticket priority value created
 *       400:
 *         description: Bad request
 *       403:
 *         description: Permission denied
 */
// POST ticket priority
router.post('/ticket-priority', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { organizationId, priorityName, color, sortOrder, isDefault } = req.body;
    if (!priorityName || !organizationId) return res.status(400).json({ success: false, message: 'Priority name and organization ID are required' });
    const [member] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings FROM OrganizationMembers om LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [organizationId, userId]
    );
    if (member.length === 0 || (member[0].Role !== 'Owner' && !member[0].CanManageSettings)) return res.status(403).json({ success: false, message: 'Permission denied' });
    if (isDefault) await pool.execute('UPDATE TicketPriorityValues SET IsDefault = 0 WHERE OrganizationId = ?', [organizationId]);
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO TicketPriorityValues (OrganizationId, PriorityName, Color, SortOrder, IsDefault) VALUES (?, ?, ?, ?, ?)',
      [organizationId, priorityName, color || '#6b7280', sortOrder || 0, isDefault ? 1 : 0]
    );
    res.status(201).json({ success: true, priorityId: result.insertId });
  } catch (error) {
    console.error('Create ticket priority error:', error);
    res.status(500).json({ success: false, message: 'Failed to create ticket priority' });
  }
});

/**
 * @swagger
 * /api/status-values/ticket-priority/{id}:
 *   put:
 *     summary: Update a ticket priority value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               priorityName:
 *                 type: string
 *               color:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Ticket priority value updated
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Priority not found
 */
// PUT ticket priority
router.put('/ticket-priority/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const priorityId = req.params.id;
    const { priorityName, color, sortOrder, isDefault } = req.body;
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT OrganizationId FROM TicketPriorityValues WHERE Id = ?', [priorityId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Priority not found' });
    const orgId = rows[0].OrganizationId;
    const [member] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings FROM OrganizationMembers om LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [orgId, userId]
    );
    if (member.length === 0 || (member[0].Role !== 'Owner' && !member[0].CanManageSettings)) return res.status(403).json({ success: false, message: 'Permission denied' });
    if (isDefault) await pool.execute('UPDATE TicketPriorityValues SET IsDefault = 0 WHERE OrganizationId = ? AND Id != ?', [orgId, priorityId]);
    await pool.execute(
      'UPDATE TicketPriorityValues SET PriorityName = ?, Color = ?, SortOrder = ?, IsDefault = ? WHERE Id = ?',
      [priorityName, color, sortOrder, isDefault ? 1 : 0, priorityId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Update ticket priority error:', error);
    res.status(500).json({ success: false, message: 'Failed to update ticket priority' });
  }
});

/**
 * @swagger
 * /api/status-values/ticket-priority/{id}:
 *   delete:
 *     summary: Delete a ticket priority value
 *     tags: [StatusValues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Ticket priority value deleted
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Priority not found
 */
// DELETE ticket priority
router.delete('/ticket-priority/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const priorityId = req.params.id;
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT OrganizationId FROM TicketPriorityValues WHERE Id = ?', [priorityId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Priority not found' });
    const orgId = rows[0].OrganizationId;
    const [member] = await pool.execute<RowDataPacket[]>(
      `SELECT om.Role, pg.CanManageSettings FROM OrganizationMembers om LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id WHERE om.OrganizationId = ? AND om.UserId = ?`,
      [orgId, userId]
    );
    if (member.length === 0 || (member[0].Role !== 'Owner' && !member[0].CanManageSettings)) return res.status(403).json({ success: false, message: 'Permission denied' });
    await pool.execute('DELETE FROM TicketPriorityValues WHERE Id = ?', [priorityId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete ticket priority error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete ticket priority' });
  }
});

export default router;
