import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Sprints
 *   description: Sprint and iteration management
 */

/**
 * @swagger
 * /api/sprints/project/{projectId}:
 *   get:
 *     summary: Get all sprints for a project
 *     tags: [Sprints]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of sprints with task counts and velocity info
 */
router.get('/project/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const [sprints] = await pool.execute<RowDataPacket[]>(
      `SELECT s.*,
              u.Username as CreatedByUsername,
              COUNT(t.Id) as TotalTasks,
              SUM(CASE WHEN tsv.IsClosed = 1 THEN 1 ELSE 0 END) as CompletedTasks,
              SUM(COALESCE(t.EstimatedHours, 0)) as TotalEstimatedHours,
              SUM(CASE WHEN tsv.IsClosed = 1 THEN COALESCE(t.EstimatedHours, 0) ELSE 0 END) as CompletedHours
       FROM Sprints s
       LEFT JOIN Users u ON s.CreatedBy = u.Id
       LEFT JOIN Tasks t ON t.SprintId = s.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE s.ProjectId = ?
       GROUP BY s.Id
       ORDER BY s.StartDate ASC, s.Id ASC`,
      [projectId]
    );
    res.json({ success: true, sprints });
  } catch (error) {
    console.error('Error fetching sprints:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sprints' });
  }
});

/**
 * @swagger
 * /api/sprints/{id}:
 *   get:
 *     summary: Get a single sprint with its tasks
 *     tags: [Sprints]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Sprint details with tasks
 */
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const [sprints] = await pool.execute<RowDataPacket[]>(
      `SELECT s.*, u.Username as CreatedByUsername
       FROM Sprints s
       LEFT JOIN Users u ON s.CreatedBy = u.Id
       WHERE s.Id = ?`,
      [id]
    );
    if (sprints.length === 0) {
      return res.status(404).json({ success: false, message: 'Sprint not found' });
    }
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.*, tsv.StatusName, tsv.ColorCode as StatusColor, tsv.IsClosed,
              tpv.PriorityName, tpv.ColorCode as PriorityColor,
              u.Username as AssigneeName, u.FirstName, u.LastName
       FROM Tasks t
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
       LEFT JOIN Users u ON t.AssignedTo = u.Id
       WHERE t.SprintId = ?
       ORDER BY t.DisplayOrder ASC, t.Id ASC`,
      [id]
    );
    res.json({ success: true, sprint: sprints[0], tasks });
  } catch (error) {
    console.error('Error fetching sprint:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sprint' });
  }
});

/**
 * @swagger
 * /api/sprints:
 *   post:
 *     summary: Create a new sprint
 *     tags: [Sprints]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectId, name]
 *             properties:
 *               projectId: { type: integer }
 *               name: { type: string }
 *               goal: { type: string }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *               status: { type: string, enum: [planned, active, completed, cancelled] }
 *     responses:
 *       201:
 *         description: Sprint created
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId, name, goal, startDate, endDate, status = 'planned' } = req.body;
    if (!projectId || !name) {
      return res.status(400).json({ success: false, message: 'projectId and name are required' });
    }
    // Only one active sprint per project
    if (status === 'active') {
      const [existing] = await pool.execute<RowDataPacket[]>(
        `SELECT Id FROM Sprints WHERE ProjectId = ? AND Status = 'active'`,
        [projectId]
      );
      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: 'A project can only have one active sprint at a time' });
      }
    }
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Sprints (ProjectId, Name, Goal, StartDate, EndDate, Status, CreatedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [projectId, name, goal || null, startDate || null, endDate || null, status, userId]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Error creating sprint:', error);
    res.status(500).json({ success: false, message: 'Failed to create sprint' });
  }
});

/**
 * @swagger
 * /api/sprints/{id}:
 *   put:
 *     summary: Update a sprint
 *     tags: [Sprints]
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
 *               goal: { type: string }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *               status: { type: string }
 *               velocity: { type: number }
 *     responses:
 *       200:
 *         description: Sprint updated
 */
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, goal, startDate, endDate, status, velocity } = req.body;

    const [existing] = await pool.execute<RowDataPacket[]>('SELECT * FROM Sprints WHERE Id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Sprint not found' });
    }

    // Only one active sprint per project
    if (status === 'active') {
      const [activeCheck] = await pool.execute<RowDataPacket[]>(
        `SELECT Id FROM Sprints WHERE ProjectId = ? AND Status = 'active' AND Id != ?`,
        [existing[0].ProjectId, id]
      );
      if (activeCheck.length > 0) {
        return res.status(409).json({ success: false, message: 'A project can only have one active sprint at a time' });
      }
    }

    await pool.execute(
      `UPDATE Sprints SET Name = ?, Goal = ?, StartDate = ?, EndDate = ?, Status = ?, Velocity = ?
       WHERE Id = ?`,
      [name, goal || null, startDate || null, endDate || null, status, velocity || null, id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating sprint:', error);
    res.status(500).json({ success: false, message: 'Failed to update sprint' });
  }
});

/**
 * @swagger
 * /api/sprints/{id}:
 *   delete:
 *     summary: Delete a sprint (unassigns tasks from it)
 *     tags: [Sprints]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Sprint deleted, tasks unassigned
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    // Unassign tasks before deleting
    await pool.execute('UPDATE Tasks SET SprintId = NULL WHERE SprintId = ?', [id]);
    await pool.execute('DELETE FROM Sprints WHERE Id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting sprint:', error);
    res.status(500).json({ success: false, message: 'Failed to delete sprint' });
  }
});

/**
 * @swagger
 * /api/sprints/{id}/tasks:
 *   post:
 *     summary: Assign tasks to a sprint
 *     tags: [Sprints]
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
 *             required: [taskIds]
 *             properties:
 *               taskIds:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200:
 *         description: Tasks assigned to sprint
 */
router.post('/:id/tasks', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { taskIds } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ success: false, message: 'taskIds array is required' });
    }
    const placeholders = taskIds.map(() => '?').join(',');
    await pool.execute(
      `UPDATE Tasks SET SprintId = ? WHERE Id IN (${placeholders})`,
      [id, ...taskIds]
    );
    res.json({ success: true, updated: taskIds.length });
  } catch (error) {
    console.error('Error assigning tasks to sprint:', error);
    res.status(500).json({ success: false, message: 'Failed to assign tasks to sprint' });
  }
});

/**
 * @swagger
 * /api/sprints/{id}/tasks/remove:
 *   post:
 *     summary: Remove tasks from a sprint (moves to backlog)
 *     tags: [Sprints]
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
 *             required: [taskIds]
 *             properties:
 *               taskIds:
 *                 type: array
 *                 items: { type: integer }
 *     responses:
 *       200:
 *         description: Tasks removed from sprint
 */
router.post('/:id/tasks/remove', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { taskIds } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ success: false, message: 'taskIds array is required' });
    }
    const placeholders = taskIds.map(() => '?').join(',');
    await pool.execute(
      `UPDATE Tasks SET SprintId = NULL WHERE SprintId = ? AND Id IN (${placeholders})`,
      [id, ...taskIds]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing tasks from sprint:', error);
    res.status(500).json({ success: false, message: 'Failed to remove tasks from sprint' });
  }
});

/**
 * @swagger
 * /api/sprints/project/{projectId}/backlog:
 *   get:
 *     summary: Get tasks not assigned to any sprint (backlog) for a project
 *     tags: [Sprints]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of backlog tasks
 */
router.get('/project/:projectId/backlog', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.*, tsv.StatusName, tsv.ColorCode as StatusColor,
              tpv.PriorityName, tpv.ColorCode as PriorityColor,
              u.Username as AssigneeName, u.FirstName, u.LastName
       FROM Tasks t
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
       LEFT JOIN Users u ON t.AssignedTo = u.Id
       WHERE t.ProjectId = ? AND t.SprintId IS NULL
       ORDER BY t.DisplayOrder ASC, t.Id ASC`,
      [projectId]
    );
    res.json({ success: true, tasks });
  } catch (error) {
    console.error('Error fetching backlog:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch backlog' });
  }
});

export default router;
