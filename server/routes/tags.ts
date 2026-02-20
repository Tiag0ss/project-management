import { Router, Response } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Tags
 *   description: Tag management for tasks
 */

/**
 * @swagger
 * /api/tags/organization/{organizationId}:
 *   get:
 *     summary: Get all tags for an organization
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Organization ID
 *     responses:
 *       200:
 *         description: List of tags for the organization
 *       401:
 *         description: Unauthorized
 */
// Get all tags for an organization
router.get('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const organizationId = parseInt(req.params.organizationId as string);
    
    const [tags] = await pool.execute<RowDataPacket[]>(
      `SELECT t.*, u.FirstName, u.LastName, u.Username
       FROM Tags t
       LEFT JOIN Users u ON t.CreatedBy = u.Id
       WHERE t.OrganizationId = ?
       ORDER BY t.Name ASC`,
      [organizationId]
    );
    
    res.json({ success: true, tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tags' });
  }
});

/**
 * @swagger
 * /api/tags/task/{taskId}:
 *   get:
 *     summary: Get tags for a specific task
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Task ID
 *     responses:
 *       200:
 *         description: List of tags assigned to the task
 *       401:
 *         description: Unauthorized
 */
// Get tags for a specific task
router.get('/task/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId as string);
    
    const [tags] = await pool.execute<RowDataPacket[]>(
      `SELECT t.*, tt.AddedAt, u.FirstName, u.LastName, u.Username
       FROM TaskTags tt
       JOIN Tags t ON tt.TagId = t.Id
       LEFT JOIN Users u ON tt.AddedBy = u.Id
       WHERE tt.TaskId = ?
       ORDER BY t.Name ASC`,
      [taskId]
    );
    
    res.json({ success: true, tags });
  } catch (error) {
    console.error('Error fetching task tags:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch task tags' });
  }
});

/**
 * @swagger
 * /api/tags:
 *   post:
 *     summary: Create a new tag
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - organizationId
 *             properties:
 *               name:
 *                 type: string
 *               color:
 *                 type: string
 *                 description: Hex color code
 *               organizationId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Tag created
 *       401:
 *         description: Unauthorized
 */
// Create a new tag
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { organizationId, name, color, description } = req.body;
    
    if (!organizationId || !name) {
      return res.status(400).json({ success: false, message: 'Organization ID and name are required' });
    }
    
    // Check if tag with same name exists in organization
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM Tags WHERE OrganizationId = ? AND LOWER(Name) = LOWER(?)',
      [organizationId, name]
    );
    
    if ((existing as any[]).length > 0) {
      return res.status(400).json({ success: false, message: 'A tag with this name already exists' });
    }
    
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Tags (OrganizationId, Name, Color, Description, CreatedBy)
       VALUES (?, ?, ?, ?, ?)`,
      [organizationId, name.trim(), color || '#6B7280', description || null, userId]
    );
    
    res.status(201).json({ 
      success: true, 
      message: 'Tag created successfully',
      tagId: result.insertId
    });
  } catch (error) {
    console.error('Error creating tag:', error);
    res.status(500).json({ success: false, message: 'Failed to create tag' });
  }
});

/**
 * @swagger
 * /api/tags/{id}:
 *   put:
 *     summary: Update a tag
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Tag ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               color:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tag updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tag not found
 */
// Update a tag
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const tagId = parseInt(req.params.id as string);
    const { name, color, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    
    // Get the tag to check organization
    const [tagRows] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Tags WHERE Id = ?',
      [tagId]
    );
    
    if ((tagRows as any[]).length === 0) {
      return res.status(404).json({ success: false, message: 'Tag not found' });
    }
    
    const organizationId = (tagRows as any[])[0].OrganizationId;
    
    // Check for duplicate name in same organization
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM Tags WHERE OrganizationId = ? AND LOWER(Name) = LOWER(?) AND Id != ?',
      [organizationId, name, tagId]
    );
    
    if ((existing as any[]).length > 0) {
      return res.status(400).json({ success: false, message: 'A tag with this name already exists' });
    }
    
    await pool.execute(
      `UPDATE Tags SET Name = ?, Color = ?, Description = ? WHERE Id = ?`,
      [name.trim(), color || '#6B7280', description || null, tagId]
    );
    
    res.json({ success: true, message: 'Tag updated successfully' });
  } catch (error) {
    console.error('Error updating tag:', error);
    res.status(500).json({ success: false, message: 'Failed to update tag' });
  }
});

/**
 * @swagger
 * /api/tags/{id}:
 *   delete:
 *     summary: Delete a tag
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Tag ID
 *     responses:
 *       200:
 *         description: Tag deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tag not found
 */
// Delete a tag
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const tagId = parseInt(req.params.id as string);
    
    // Delete all task associations first
    await pool.execute('DELETE FROM TaskTags WHERE TagId = ?', [tagId]);
    
    // Delete the tag
    await pool.execute('DELETE FROM Tags WHERE Id = ?', [tagId]);
    
    res.json({ success: true, message: 'Tag deleted successfully' });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ success: false, message: 'Failed to delete tag' });
  }
});

/**
 * @swagger
 * /api/tags/task/{taskId}/tag/{tagId}:
 *   post:
 *     summary: Assign a tag to a task
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Task ID
 *       - in: path
 *         name: tagId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Tag ID
 *     responses:
 *       201:
 *         description: Tag assigned to task
 *       401:
 *         description: Unauthorized
 */
// Add a tag to a task
router.post('/task/:taskId/tag/:tagId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const taskId = parseInt(req.params.taskId as string);
    const tagId = parseInt(req.params.tagId as string);
    
    // Check if already assigned
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT TaskId FROM TaskTags WHERE TaskId = ? AND TagId = ?',
      [taskId, tagId]
    );
    
    if ((existing as any[]).length > 0) {
      return res.json({ success: true, message: 'Tag already assigned to task' });
    }
    
    await pool.execute(
      'INSERT INTO TaskTags (TaskId, TagId, AddedBy) VALUES (?, ?, ?)',
      [taskId, tagId, userId]
    );
    
    res.status(201).json({ success: true, message: 'Tag added to task' });
  } catch (error) {
    console.error('Error adding tag to task:', error);
    res.status(500).json({ success: false, message: 'Failed to add tag to task' });
  }
});

/**
 * @swagger
 * /api/tags/task/{taskId}/tag/{tagId}:
 *   delete:
 *     summary: Remove a tag from a task
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Task ID
 *       - in: path
 *         name: tagId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Tag ID
 *     responses:
 *       200:
 *         description: Tag removed from task
 *       401:
 *         description: Unauthorized
 */
// Remove a tag from a task
router.delete('/task/:taskId/tag/:tagId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId as string);
    const tagId = parseInt(req.params.tagId as string);
    
    await pool.execute(
      'DELETE FROM TaskTags WHERE TaskId = ? AND TagId = ?',
      [taskId, tagId]
    );
    
    res.json({ success: true, message: 'Tag removed from task' });
  } catch (error) {
    console.error('Error removing tag from task:', error);
    res.status(500).json({ success: false, message: 'Failed to remove tag from task' });
  }
});

/**
 * @swagger
 * /api/tags/task/{taskId}:
 *   put:
 *     summary: Update task tags (replace all tags)
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Task ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tagIds
 *             properties:
 *               tagIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Task tags updated
 *       401:
 *         description: Unauthorized
 */
// Bulk update tags for a task
router.put('/task/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const taskId = parseInt(req.params.taskId as string);
    const { tagIds } = req.body;
    
    if (!Array.isArray(tagIds)) {
      return res.status(400).json({ success: false, message: 'tagIds must be an array' });
    }
    
    // Remove all existing tags
    await pool.execute('DELETE FROM TaskTags WHERE TaskId = ?', [taskId]);
    
    // Add new tags
    if (tagIds.length > 0) {
      const values = tagIds.map(tagId => `(${taskId}, ${tagId}, ${userId})`).join(', ');
      await pool.execute(`INSERT INTO TaskTags (TaskId, TagId, AddedBy) VALUES ${values}`);
    }
    
    res.json({ success: true, message: 'Task tags updated successfully' });
  } catch (error) {
    console.error('Error updating task tags:', error);
    res.status(500).json({ success: false, message: 'Failed to update task tags' });
  }
});

export default router;
