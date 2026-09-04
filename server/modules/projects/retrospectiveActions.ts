import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../../middleware/auth';
import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader } from '../../config/database';
import logger from '../../utils/logger';

const router = Router();

const toDateOnly = (value: any): string | null => {
  if (!value) return null;
  const asString = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) return asString;
  const match = asString.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

async function canAccessProject(projectId: number, userId?: number): Promise<boolean> {
  if (!userId) return false;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT p.Id
     FROM Projects p
     INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
     WHERE p.Id = ? AND om.UserId = ?`,
    [projectId, userId]
  );
  return rows.length > 0;
}

async function getProjectIdForSprint(sprintId: number): Promise<number | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ProjectId FROM Sprints WHERE Id = ?`,
    [sprintId]
  );
  return rows.length > 0 ? Number(rows[0].ProjectId) : null;
}

async function getProjectIdForAction(actionId: number): Promise<number | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT s.ProjectId
     FROM RetrospectiveActions ra
     INNER JOIN Sprints s ON ra.SprintId = s.Id
     WHERE ra.Id = ?`,
    [actionId]
  );
  return rows.length > 0 ? Number(rows[0].ProjectId) : null;
}

router.get('/project/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = Number(req.params.projectId);

    if (!(await canAccessProject(projectId, userId))) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    const [actions] = await pool.execute<RowDataPacket[]>(
      `SELECT ra.*, s.Name as SprintName,
              ou.Username as OwnerUsername, ou.FirstName as OwnerFirstName, ou.LastName as OwnerLastName,
              cu.Username as ClosedByUsername
       FROM RetrospectiveActions ra
       INNER JOIN Sprints s ON ra.SprintId = s.Id
       LEFT JOIN Users ou ON ra.OwnerUserId = ou.Id
       LEFT JOIN Users cu ON ra.ClosedBy = cu.Id
       WHERE s.ProjectId = ?
       ORDER BY COALESCE(s.StartDate, s.CreatedAt) DESC, ra.IsClosed ASC, ra.DueDate ASC, ra.Id DESC`,
      [projectId]
    );

    const [closureBySprint] = await pool.execute<RowDataPacket[]>(
      `SELECT s.Id as SprintId,
              s.Name as SprintName,
              COUNT(ra.Id) as TotalActions,
              COALESCE(SUM(CASE WHEN COALESCE(ra.IsClosed, 0) = 1 THEN 1 ELSE 0 END), 0) as ClosedActions
       FROM Sprints s
       LEFT JOIN RetrospectiveActions ra ON ra.SprintId = s.Id
       WHERE s.ProjectId = ?
       GROUP BY s.Id, s.Name
       ORDER BY COALESCE(s.StartDate, s.CreatedAt) DESC, s.Id DESC`,
      [projectId]
    );

    res.json({
      success: true,
      actions,
      closureBySprint: closureBySprint.map((row) => {
        const total = Number(row.TotalActions || 0);
        const closed = Number(row.ClosedActions || 0);
        return {
          sprintId: Number(row.SprintId),
          sprintName: row.SprintName,
          totalActions: total,
          closedActions: closed,
          closureRate: total > 0 ? Math.round((closed / total) * 100) : 0,
        };
      }),
    });
  } catch (error) {
    logger.error('Error fetching retrospective actions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch retrospective actions' });
  }
});

router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { sprintId, title, description, ownerUserId, dueDate } = req.body;

    if (!sprintId || !title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: 'sprintId and title are required' });
    }

    const projectId = await getProjectIdForSprint(Number(sprintId));
    if (!projectId || !(await canAccessProject(projectId, userId))) {
      return res.status(404).json({ success: false, message: 'Sprint not found or access denied' });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO RetrospectiveActions (SprintId, Title, Description, OwnerUserId, DueDate, CreatedBy)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        Number(sprintId),
        String(title).trim(),
        description ? String(description).trim() : null,
        ownerUserId ? Number(ownerUserId) : null,
        toDateOnly(dueDate),
        userId,
      ]
    );

    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    logger.error('Error creating retrospective action:', error);
    res.status(500).json({ success: false, message: 'Failed to create retrospective action' });
  }
});

router.patch('/:id/close', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const actionId = Number(req.params.id);
    const isClosed = Number(req.body?.isClosed) === 1;

    const projectId = await getProjectIdForAction(actionId);
    if (!projectId || !(await canAccessProject(projectId, userId))) {
      return res.status(404).json({ success: false, message: 'Action not found or access denied' });
    }

    await pool.execute(
      `UPDATE RetrospectiveActions
       SET IsClosed = ?,
           ClosedAt = ?,
           ClosedBy = ?
       WHERE Id = ?`,
      [
        isClosed ? 1 : 0,
        isClosed ? new Date() : null,
        isClosed ? userId : null,
        actionId,
      ]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating retrospective action status:', error);
    res.status(500).json({ success: false, message: 'Failed to update retrospective action status' });
  }
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const actionId = Number(req.params.id);

    const projectId = await getProjectIdForAction(actionId);
    if (!projectId || !(await canAccessProject(projectId, userId))) {
      return res.status(404).json({ success: false, message: 'Action not found or access denied' });
    }

    await pool.execute('DELETE FROM RetrospectiveActions WHERE Id = ?', [actionId]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting retrospective action:', error);
    res.status(500).json({ success: false, message: 'Failed to delete retrospective action' });
  }
});

export default router;
