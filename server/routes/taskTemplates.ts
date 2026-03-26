import { Router, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

const normalizeLabel = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const resolveNamedId = (
  rows: RowDataPacket[],
  rawValue: unknown,
  idField: string,
  nameField: string,
  defaultResolver: (items: RowDataPacket[]) => number | null
): number | null => {
  const fallbackId = defaultResolver(rows);

  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
    return fallbackId;
  }

  const numericValue = Number(rawValue);
  if (Number.isFinite(numericValue)) {
    const exact = rows.find((item) => Number(item[idField]) === numericValue);
    if (exact) return Number(exact[idField]);
  }

  const normalized = normalizeLabel(rawValue);
  const byName = rows.find((item) => normalizeLabel(item[nameField]) === normalized);
  if (byName) return Number(byName[idField]);

  return fallbackId;
};

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
          `INSERT INTO TaskTemplateItems (TemplateId, ParentItemId, Title, Description, EstimatedHours, Priority, TaskType, SortOrder)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            templateId,
            parentId,
            item.title,
            item.description || null,
            item.estimatedHours || null,
            item.priority || null,
            item.taskType || null,
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
    const { projectId, statusOverride, priorityOverride, selectedItemIds } = req.body;
    const userId = Number(req.user?.userId || 0);

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const [projectRows] = await conn.execute<RowDataPacket[]>(
      `SELECT Id, OrganizationId FROM Projects WHERE Id = ?`,
      [projectId]
    );

    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const organizationId = Number(projectRows[0].OrganizationId);

    const [statusRows] = await conn.execute<RowDataPacket[]>(
      `SELECT Id, StatusName, IsDefault, SortOrder, COALESCE(IsClosed, 0) as IsClosed, COALESCE(IsCancelled, 0) as IsCancelled
       FROM TaskStatusValues
       WHERE OrganizationId = ?
       ORDER BY COALESCE(SortOrder, 9999) ASC, Id ASC`,
      [organizationId]
    );

    const [priorityRows] = await conn.execute<RowDataPacket[]>(
      `SELECT Id, PriorityName, IsDefault, SortOrder
       FROM TaskPriorityValues
       WHERE OrganizationId = ?
       ORDER BY COALESCE(SortOrder, 9999) ASC, Id ASC`,
      [organizationId]
    );

    const [taskTypeRows] = await conn.execute<RowDataPacket[]>(
      `SELECT Id, TypeName, IsDefault, SortOrder
       FROM TaskTypeValues
       WHERE OrganizationId = ?
       ORDER BY COALESCE(SortOrder, 9999) ASC, Id ASC`,
      [organizationId]
    );

    if (statusRows.length === 0) {
      return res.status(400).json({ success: false, message: 'No task statuses configured for this organization' });
    }

    const defaultStatusId = resolveNamedId(
      statusRows,
      statusOverride,
      'Id',
      'StatusName',
      (items) => {
        const defaultRow = items.find((item) => Number(item.IsDefault || 0) === 1);
        if (defaultRow) return Number(defaultRow.Id);

        const todoRow = items.find((item) => {
          const statusName = normalizeLabel(item.StatusName);
          return Number(item.IsClosed || 0) === 0
            && Number(item.IsCancelled || 0) === 0
            && (statusName.includes('to do') || statusName.includes('todo') || statusName.includes('open'));
        });
        if (todoRow) return Number(todoRow.Id);

        const activeRow = items.find((item) => Number(item.IsClosed || 0) === 0 && Number(item.IsCancelled || 0) === 0);
        if (activeRow) return Number(activeRow.Id);

        return items[0] ? Number(items[0].Id) : null;
      }
    );

    if (!defaultStatusId) {
      return res.status(400).json({ success: false, message: 'Could not resolve a valid task status for this organization' });
    }

    const defaultPriorityId = resolveNamedId(
      priorityRows,
      priorityOverride,
      'Id',
      'PriorityName',
      (items) => {
        if (items.length === 0) return null;

        const defaultRow = items.find((item) => Number(item.IsDefault || 0) === 1);
        if (defaultRow) return Number(defaultRow.Id);

        const mediumRow = items.find((item) => {
          const priorityName = normalizeLabel(item.PriorityName);
          return priorityName === 'medium' || priorityName.includes('normal');
        });
        if (mediumRow) return Number(mediumRow.Id);

        return Number(items[0].Id);
      }
    );

    const [items] = await conn.execute<RowDataPacket[]>(
      `SELECT * FROM TaskTemplateItems WHERE TemplateId = ? ORDER BY SortOrder ASC, Id ASC`,
      [id]
    );

    const selectedIdSet = new Set<number>(
      Array.isArray(selectedItemIds)
        ? selectedItemIds
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isFinite(value) && value > 0)
        : []
    );

    const itemsToApply = selectedIdSet.size > 0
      ? items.filter((item) => selectedIdSet.has(Number(item.Id)))
      : items;

    const defaultTaskTypeId = resolveNamedId(
      taskTypeRows,
      null,
      'Id',
      'TypeName',
      (rows) => {
        if (rows.length === 0) return null;

        const defaultRow = rows.find((item) => Number(item.IsDefault || 0) === 1);
        if (defaultRow) return Number(defaultRow.Id);

        return Number(rows[0].Id);
      }
    );

    if (itemsToApply.length === 0) {
      return res.json({ success: true, created: 0, message: 'Template has no items' });
    }

    await conn.beginTransaction();

    const idMap: Record<number, number> = {}; // template item Id → new Task Id

    for (const item of itemsToApply) {
      const parentTaskId = item.ParentItemId !== null ? (idMap[item.ParentItemId] ?? null) : null;

      const resolvedPriorityId = resolveNamedId(
        priorityRows,
        priorityOverride ?? item.Priority,
        'Id',
        'PriorityName',
        () => defaultPriorityId
      );

      const resolvedTaskTypeId = resolveNamedId(
        taskTypeRows,
        item.TaskType,
        'Id',
        'TypeName',
        () => defaultTaskTypeId
      );

      const [taskResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO Tasks (ProjectId, TaskName, Description, Status, Priority, TaskType, EstimatedHours, ParentTaskId, CreatedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          item.Title,
          item.Description || null,
          defaultStatusId,
          resolvedPriorityId,
          resolvedTaskTypeId,
          item.EstimatedHours || null,
          parentTaskId,
          userId,
        ]
      );
      idMap[item.Id] = taskResult.insertId;
    }

    await conn.commit();
    res.json({ success: true, created: itemsToApply.length, message: `${itemsToApply.length} tasks created from template` });
  } catch (error) {
    await conn.rollback();
    console.error('Error applying task template:', error);
    res.status(500).json({ success: false, message: 'Failed to apply task template' });
  } finally {
    conn.release();
  }
});

export default router;
