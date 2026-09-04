import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../../middleware/auth';
import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader } from '../../config/database';
import { cachedJson, ENTITY_TTL_SECONDS } from '../../utils/cachedJson';
import { cacheKeys } from '../../services/cacheKeys';
import { invalidateByEntity } from '../../services/cacheInvalidation';
import logger from '../../utils/logger';

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
    const sprints = await cachedJson(
      cacheKeys.projectSprints(String(projectId)),
      ENTITY_TTL_SECONDS,
      async () => {
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT s.*,
                  u.Username as CreatedByUsername,
                  COALESCE((SELECT COUNT(*) FROM Tasks t WHERE t.SprintId = s.Id), 0) as TotalTasks,
                  COALESCE((
                    SELECT SUM(CASE WHEN tsv.IsClosed = 1 THEN 1 ELSE 0 END)
                    FROM Tasks t
                    LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
                    WHERE t.SprintId = s.Id
                  ), 0) as CompletedTasks,
                  COALESCE((SELECT SUM(COALESCE(t.EstimatedHours, 0)) FROM Tasks t WHERE t.SprintId = s.Id), 0) as TotalEstimatedHours,
                  COALESCE((SELECT SUM(COALESCE(t.StoryPoints, 0)) FROM Tasks t WHERE t.SprintId = s.Id), 0) as TotalStoryPoints,
                  COALESCE((
                    SELECT SUM(CASE WHEN tsv.IsClosed = 1 THEN COALESCE(t.EstimatedHours, 0) ELSE 0 END)
                    FROM Tasks t
                    LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
                    WHERE t.SprintId = s.Id
                  ), 0) as CompletedHours,
                  COALESCE((
                    SELECT SUM(CASE WHEN tsv.IsClosed = 1 THEN COALESCE(t.StoryPoints, 0) ELSE 0 END)
                    FROM Tasks t
                    LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
                    WHERE t.SprintId = s.Id
                  ), 0) as CompletedStoryPoints
           FROM Sprints s
           LEFT JOIN Users u ON s.CreatedBy = u.Id
           WHERE s.ProjectId = ?
           ORDER BY s.StartDate ASC, s.Id ASC`,
          [projectId]
        );
        return rows;
      }
    );
    res.json({ success: true, sprints });
  } catch (error) {
    logger.error('Error fetching sprints:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sprints' });
  }
});

router.get('/project/:projectId/velocity-trend', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId } = req.params;

    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    const [sprints] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, Name, StartDate, EndDate, Status
       FROM Sprints
       WHERE ProjectId = ?
       ORDER BY StartDate ASC, Id ASC`,
      [projectId]
    );

    const [sprintTasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.SprintId,
              t.AssignedTo,
              COALESCE(t.StoryPoints, 0) as StoryPoints,
              COALESCE(tsv.IsClosed, 0) as IsClosed,
              u.Username,
              u.FirstName,
              u.LastName
       FROM Tasks t
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN Users u ON t.AssignedTo = u.Id
       WHERE t.ProjectId = ? AND t.SprintId IS NOT NULL`,
      [projectId]
    );

    const sprintRows = sprints.map((sprint) => {
      const rows = sprintTasks.filter((task) => Number(task.SprintId) === Number(sprint.Id));
      const committedStoryPoints = rows.reduce((sum, task) => sum + Number(task.StoryPoints || 0), 0);
      const completedStoryPoints = rows
        .filter((task) => Number(task.IsClosed || 0) === 1)
        .reduce((sum, task) => sum + Number(task.StoryPoints || 0), 0);

      const teamMap = new Map<number, { userId: number; username: string; fullName: string; completedStoryPoints: number }>();
      rows.forEach((task) => {
        const assignedTo = task.AssignedTo ? Number(task.AssignedTo) : null;
        if (!assignedTo || Number(task.IsClosed || 0) !== 1) return;

        const existing = teamMap.get(assignedTo) || {
          userId: assignedTo,
          username: task.Username || 'unknown',
          fullName: [task.FirstName, task.LastName].filter(Boolean).join(' ').trim() || task.Username || 'Unknown User',
          completedStoryPoints: 0,
        };
        existing.completedStoryPoints += Number(task.StoryPoints || 0);
        teamMap.set(assignedTo, existing);
      });

      return {
        sprintId: Number(sprint.Id),
        sprintName: String(sprint.Name || `Sprint ${sprint.Id}`),
        startDate: sprint.StartDate,
        endDate: sprint.EndDate,
        status: sprint.Status,
        committedStoryPoints,
        completedStoryPoints,
        completionRate: committedStoryPoints > 0 ? Math.round((completedStoryPoints / committedStoryPoints) * 100) : 0,
        teamBreakdown: Array.from(teamMap.values()).sort((a, b) => b.completedStoryPoints - a.completedStoryPoints),
      };
    });

    const completedSprints = sprintRows.filter((item) => item.status === 'completed');
    const recentWindow = completedSprints.slice(-3);
    const previousWindow = completedSprints.slice(-6, -3);

    const average = (items: Array<{ completedStoryPoints: number }>) => (
      items.length > 0
        ? items.reduce((sum, item) => sum + item.completedStoryPoints, 0) / items.length
        : 0
    );

    const recentAverage = average(recentWindow);
    const previousAverage = average(previousWindow);
    const trendDelta = recentAverage - previousAverage;
    const trendDirection = trendDelta > 0 ? 'up' : trendDelta < 0 ? 'down' : 'stable';

    res.json({
      success: true,
      data: {
        sprints: sprintRows,
        summary: {
          recentAverage,
          previousAverage,
          trendDelta,
          trendDirection,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching sprint velocity trend:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sprint velocity trend' });
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
              u.Username as AssigneeName, u.FirstName, u.LastName,
              COALESCE((SELECT SUM(ta.AllocatedHours) FROM TaskAllocations ta WHERE ta.TaskId = t.Id), 0) +
              COALESCE((SELECT SUM(tca.AllocatedHours) FROM TaskChildAllocations tca WHERE tca.ChildTaskId = t.Id), 0) as TotalAllocatedHours
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
    logger.error('Error fetching sprint:', error);
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
    const [projectRows] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Projects WHERE Id = ?',
      [projectId]
    );
    await invalidateByEntity('sprint', {
      projectId: Number(projectId),
      orgId: projectRows[0]?.OrganizationId,
    });
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    logger.error('Error creating sprint:', error);
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
    const [projectRows] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Projects WHERE Id = ?',
      [existing[0].ProjectId]
    );
    await invalidateByEntity('sprint', {
      projectId: Number(existing[0].ProjectId),
      orgId: projectRows[0]?.OrganizationId,
    });
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating sprint:', error);
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
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT ProjectId FROM Sprints WHERE Id = ?',
      [id]
    );
    // Unassign tasks before deleting
    await pool.execute('UPDATE Tasks SET SprintId = NULL WHERE SprintId = ?', [id]);
    await pool.execute('DELETE FROM Sprints WHERE Id = ?', [id]);
    if (existing.length > 0) {
      const [projectRows] = await pool.execute<RowDataPacket[]>(
        'SELECT OrganizationId FROM Projects WHERE Id = ?',
        [existing[0].ProjectId]
      );
      await invalidateByEntity('sprint', {
        projectId: Number(existing[0].ProjectId),
        orgId: projectRows[0]?.OrganizationId,
      });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting sprint:', error);
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
    const [sprintRows] = await pool.execute<RowDataPacket[]>(
      'SELECT ProjectId FROM Sprints WHERE Id = ?',
      [id]
    );
    if (sprintRows.length > 0) {
      const [projectRows] = await pool.execute<RowDataPacket[]>(
        'SELECT OrganizationId FROM Projects WHERE Id = ?',
        [sprintRows[0].ProjectId]
      );
      await invalidateByEntity('sprint', {
        projectId: Number(sprintRows[0].ProjectId),
        orgId: projectRows[0]?.OrganizationId,
      });
    }
    res.json({ success: true, updated: taskIds.length });
  } catch (error) {
    logger.error('Error assigning tasks to sprint:', error);
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
    const [sprintRows] = await pool.execute<RowDataPacket[]>(
      'SELECT ProjectId FROM Sprints WHERE Id = ?',
      [id]
    );
    if (sprintRows.length > 0) {
      const [projectRows] = await pool.execute<RowDataPacket[]>(
        'SELECT OrganizationId FROM Projects WHERE Id = ?',
        [sprintRows[0].ProjectId]
      );
      await invalidateByEntity('sprint', {
        projectId: Number(sprintRows[0].ProjectId),
        orgId: projectRows[0]?.OrganizationId,
      });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing tasks from sprint:', error);
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
              u.Username as AssigneeName, u.FirstName, u.LastName,
              COALESCE((SELECT SUM(ta.AllocatedHours) FROM TaskAllocations ta WHERE ta.TaskId = t.Id), 0) +
              COALESCE((SELECT SUM(tca.AllocatedHours) FROM TaskChildAllocations tca WHERE tca.ChildTaskId = t.Id), 0) as TotalAllocatedHours
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
    logger.error('Error fetching backlog:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch backlog' });
  }
});

export default router;
