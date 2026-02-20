import { Router, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: TaskTemplates
 *   description: Reusable task templates
 */

/**
 * @swagger
 * /api/task-templates:
 *   get:
 *     summary: Get all task templates for an organization
 *     tags: [TaskTemplates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Organization ID
 *     responses:
 *       200:
 *         description: List of task templates
 *       400:
 *         description: organizationId is required
 *       500:
 *         description: Server error
 */
// GET /api/task-templates?organizationId=X
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.query;

    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'organizationId is required' });
    }

    const [templates] = await pool.execute<RowDataPacket[]>(
      `SELECT tt.*, u.FirstName, u.LastName,
              (SELECT COUNT(*) FROM TaskTemplateItems tti WHERE tti.TemplateId = tt.Id) AS ItemCount
       FROM TaskTemplates tt
       LEFT JOIN Users u ON tt.CreatedBy = u.Id
       WHERE tt.OrganizationId = ?
       ORDER BY tt.Name ASC`,
      [organizationId]
    );

    res.json({ success: true, templates });
  } catch (error) {
    console.error('Error fetching task templates:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch task templates' });
  }
});

/**
 * @swagger
 * /api/task-templates/{id}:
 *   get:
 *     summary: Get a specific task template with its items
 *     tags: [TaskTemplates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template with items
 *       404:
 *         description: Template not found
 *       500:
 *         description: Server error
 */
// GET /api/task-templates/:id  (with items)
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [templates] = await pool.execute<RowDataPacket[]>(
      `SELECT tt.*, u.FirstName, u.LastName
       FROM TaskTemplates tt
       LEFT JOIN Users u ON tt.CreatedBy = u.Id
       WHERE tt.Id = ?`,
      [id]
    );

    if (templates.length === 0) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    const [items] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM TaskTemplateItems WHERE TemplateId = ? ORDER BY SortOrder ASC, Id ASC`,
      [id]
    );

    res.json({ success: true, template: templates[0], items });
  } catch (error) {
    console.error('Error fetching task template:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch task template' });
  }
});

/**
 * @swagger
 * /api/task-templates:
 *   post:
 *     summary: Create a task template with items
 *     tags: [TaskTemplates]
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
 *               - name
 *             properties:
 *               organizationId:
 *                 type: integer
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Template created
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Server error
 */
// POST /api/task-templates  — create template with items
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  const conn = await pool.getConnection();
  try {
    const { organizationId, name, description, items } = req.body;
    const userId = req.user?.userId;

    if (!organizationId || !name) {
      return res.status(400).json({ success: false, message: 'organizationId and name are required' });
    }

    await conn.beginTransaction();

    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO TaskTemplates (OrganizationId, CreatedBy, Name, Description) VALUES (?, ?, ?, ?)`,
      [organizationId, userId, name, description || null]
    );
    const templateId = result.insertId;

    if (Array.isArray(items) && items.length > 0) {
      // Two-pass insert: first pass for root items, second for children (to resolve parentItemId correctly)
      const idMap: Record<number, number> = {}; // local index → real DB id

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const parentId = item.parentIndex !== undefined && item.parentIndex !== null
          ? (idMap[item.parentIndex] ?? null)
          : null;

        const [itemResult] = await conn.execute<ResultSetHeader>(
          `INSERT INTO TaskTemplateItems (TemplateId, ParentItemId, Title, Description, EstimatedHours, Priority, SortOrder)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            templateId,
            parentId,
            item.title,
            item.description || null,
            item.estimatedHours || null,
            item.priority || null,
            item.sortOrder ?? i,
          ]
        );
        idMap[i] = itemResult.insertId;
      }
    }

    await conn.commit();
    res.json({ success: true, templateId, message: 'Template created successfully' });
  } catch (error) {
    await conn.rollback();
    console.error('Error creating task template:', error);
    res.status(500).json({ success: false, message: 'Failed to create task template' });
  } finally {
    conn.release();
  }
});

/**
 * @swagger
 * /api/task-templates/{id}:
 *   put:
 *     summary: Update a task template
 *     tags: [TaskTemplates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Template updated
 *       500:
 *         description: Server error
 */
// PUT /api/task-templates/:id — update name/description only (items managed separately)
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    await pool.execute(
      `UPDATE TaskTemplates SET Name = ?, Description = ? WHERE Id = ?`,
      [name, description || null, id]
    );

    res.json({ success: true, message: 'Template updated' });
  } catch (error) {
    console.error('Error updating task template:', error);
    res.status(500).json({ success: false, message: 'Failed to update task template' });
  }
});

/**
 * @swagger
 * /api/task-templates/{id}:
 *   delete:
 *     summary: Delete a task template
 *     tags: [TaskTemplates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template deleted
 *       500:
 *         description: Server error
 */
// DELETE /api/task-templates/:id
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    await conn.beginTransaction();
    await conn.execute(`DELETE FROM TaskTemplateItems WHERE TemplateId = ?`, [id]);
    await conn.execute(`DELETE FROM TaskTemplates WHERE Id = ?`, [id]);
    await conn.commit();

    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    await conn.rollback();
    console.error('Error deleting task template:', error);
    res.status(500).json({ success: false, message: 'Failed to delete task template' });
  } finally {
    conn.release();
  }
});

/**
 * @swagger
 * /api/task-templates/{id}/apply:
 *   post:
 *     summary: Apply a template to a project, creating all tasks
 *     tags: [TaskTemplates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *             properties:
 *               projectId:
 *                 type: integer
 *               statusOverride:
 *                 type: string
 *               priorityOverride:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tasks created from template
 *       400:
 *         description: projectId is required
 *       500:
 *         description: Server error
 */
// POST /api/task-templates/:id/apply?projectId=X — create Tasks from template
router.post('/:id/apply', authenticateToken, async (req: AuthRequest, res: Response) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { projectId, statusOverride, priorityOverride } = req.body;

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    const [items] = await conn.execute<RowDataPacket[]>(
      `SELECT * FROM TaskTemplateItems WHERE TemplateId = ? ORDER BY SortOrder ASC, Id ASC`,
      [id]
    );

    if (items.length === 0) {
      return res.json({ success: true, created: 0, message: 'Template has no items' });
    }

    await conn.beginTransaction();

    const idMap: Record<number, number> = {}; // template item Id → new Task Id

    for (const item of items) {
      const parentTaskId = item.ParentItemId !== null ? (idMap[item.ParentItemId] ?? null) : null;

      const [taskResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO Tasks (ProjectId, TaskName, Description, Status, Priority, EstimatedHours, ParentTaskId)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          item.Title,
          item.Description || null,
          statusOverride || 'To Do',
          priorityOverride || item.Priority || 'Medium',
          item.EstimatedHours || null,
          parentTaskId,
        ]
      );
      idMap[item.Id] = taskResult.insertId;
    }

    await conn.commit();
    res.json({ success: true, created: items.length, message: `${items.length} tasks created from template` });
  } catch (error) {
    await conn.rollback();
    console.error('Error applying task template:', error);
    res.status(500).json({ success: false, message: 'Failed to apply task template' });
  } finally {
    conn.release();
  }
});

export default router;
