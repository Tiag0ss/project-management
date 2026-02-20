import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: TaskChecklists
 *   description: Checklists within tasks
 */

/**
 * @swagger
 * /api/task-checklists/task/{taskId}:
 *   get:
 *     summary: Get checklist items for a task
 *     tags: [TaskChecklists]
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
 *         description: List of checklist items
 *       404:
 *         description: Task not found or access denied
 *       500:
 *         description: Server error
 */
router.get('/task/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.userId;

    // Verify user has access to the task's project
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    const [items] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM TaskChecklists WHERE TaskId = ? ORDER BY DisplayOrder ASC, CreatedAt ASC',
      [taskId]
    );

    res.json({ success: true, items });
  } catch (error) {
    console.error('Error fetching checklist items:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch checklist items' });
  }
});

/**
 * @swagger
 * /api/task-checklists:
 *   post:
 *     summary: Create a checklist item
 *     tags: [TaskChecklists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskId
 *               - text
 *             properties:
 *               taskId:
 *                 type: integer
 *               text:
 *                 type: string
 *               isCompleted:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Checklist item created
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: Task not found or access denied
 *       500:
 *         description: Server error
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { taskId, text } = req.body;

    if (!taskId || !text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'TaskId and text are required' });
    }

    // Verify user has access
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id FROM Tasks t
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE t.Id = ? AND om.UserId = ?`,
      [taskId, userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Task not found or access denied' });
    }

    // Get next display order
    const [maxOrder] = await pool.execute<RowDataPacket[]>(
      'SELECT COALESCE(MAX(DisplayOrder), 0) as maxOrder FROM TaskChecklists WHERE TaskId = ?',
      [taskId]
    );
    const nextOrder = (maxOrder[0]?.maxOrder || 0) + 1;

    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO TaskChecklists (TaskId, Text, IsChecked, DisplayOrder, CreatedBy) VALUES (?, ?, 0, ?, ?)',
      [taskId, text.trim(), nextOrder, userId]
    );

    const [newItems] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM TaskChecklists WHERE Id = ?',
      [result.insertId]
    );

    res.json({ success: true, message: 'Checklist item created', item: newItems[0] });
  } catch (error) {
    console.error('Error creating checklist item:', error);
    res.status(500).json({ success: false, message: 'Failed to create checklist item' });
  }
});

/**
 * @swagger
 * /api/task-checklists/{id}:
 *   put:
 *     summary: Update a checklist item
 *     tags: [TaskChecklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Checklist item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               isChecked:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Checklist item updated
 *       400:
 *         description: Nothing to update
 *       404:
 *         description: Item not found or access denied
 *       500:
 *         description: Server error
 */
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const { text, isChecked } = req.body;

    // Verify access
    const [items] = await pool.execute<RowDataPacket[]>(
      `SELECT cl.Id FROM TaskChecklists cl
       JOIN Tasks t ON cl.TaskId = t.Id
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE cl.Id = ? AND om.UserId = ?`,
      [id, userId]
    );

    if (items.length === 0) {
      return res.status(404).json({ success: false, message: 'Checklist item not found or access denied' });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (text !== undefined) {
      updates.push('Text = ?');
      params.push(text.trim());
    }
    if (isChecked !== undefined) {
      updates.push('IsChecked = ?');
      params.push(isChecked ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    params.push(id);
    await pool.execute(`UPDATE TaskChecklists SET ${updates.join(', ')} WHERE Id = ?`, params);

    res.json({ success: true, message: 'Checklist item updated' });
  } catch (error) {
    console.error('Error updating checklist item:', error);
    res.status(500).json({ success: false, message: 'Failed to update checklist item' });
  }
});

/**
 * @swagger
 * /api/task-checklists/{id}:
 *   delete:
 *     summary: Delete a checklist item
 *     tags: [TaskChecklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Checklist item ID
 *     responses:
 *       200:
 *         description: Checklist item deleted
 *       404:
 *         description: Item not found or access denied
 *       500:
 *         description: Server error
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Verify access
    const [items] = await pool.execute<RowDataPacket[]>(
      `SELECT cl.Id FROM TaskChecklists cl
       JOIN Tasks t ON cl.TaskId = t.Id
       JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE cl.Id = ? AND om.UserId = ?`,
      [id, userId]
    );

    if (items.length === 0) {
      return res.status(404).json({ success: false, message: 'Checklist item not found or access denied' });
    }

    await pool.execute('DELETE FROM TaskChecklists WHERE Id = ?', [id]);

    res.json({ success: true, message: 'Checklist item deleted' });
  } catch (error) {
    console.error('Error deleting checklist item:', error);
    res.status(500).json({ success: false, message: 'Failed to delete checklist item' });
  }
});

export default router;
