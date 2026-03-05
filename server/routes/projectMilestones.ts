import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { ResultSetHeader, RowDataPacket } from '../config/database';

const router = Router();

const canManageProjectMilestones = async (userId: number, organizationId: number) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT om.Role, pg.CanManageProjects
     FROM OrganizationMembers om
     LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
     WHERE om.OrganizationId = ? AND om.UserId = ?`,
    [organizationId, userId]
  );

  if (rows.length === 0) return false;
  const member = rows[0];
  return member.Role === 'Owner' || member.Role === 'Admin' || Number(member.CanManageProjects || 0) === 1;
};

router.get('/project/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const projectId = Number(req.params.projectId);

    const [projectRows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.OrganizationId
       FROM Projects p
       INNER JOIN OrganizationMembers om ON om.OrganizationId = p.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    const [milestones] = await pool.execute<RowDataPacket[]>(
      `SELECT pm.*, mtv.TypeName as MilestoneTypeName, mtv.IconSvg as MilestoneTypeIconSvg, mtv.ColorCode as MilestoneTypeColor
       FROM ProjectMilestones pm
       LEFT JOIN MilestoneTypeValues mtv ON pm.MilestoneTypeId = mtv.Id
       WHERE pm.ProjectId = ?
       ORDER BY pm.SortOrder ASC, pm.DueDate ASC, pm.Id ASC`,
      [projectId]
    );

    res.json({ success: true, milestones });
  } catch (error) {
    console.error('Get project milestones error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch project milestones' });
  }
});

router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { projectId, name, description, dueDate, milestoneTypeId, isCompleted, sortOrder } = req.body;

    if (!projectId || !name) {
      return res.status(400).json({ success: false, message: 'Project and milestone name are required' });
    }

    const [projectRows] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, OrganizationId FROM Projects WHERE Id = ?',
      [projectId]
    );

    if (projectRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const organizationId = Number(projectRows[0].OrganizationId);
    const canManage = await canManageProjectMilestones(Number(userId), organizationId);
    if (!canManage) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const completed = Number(isCompleted || 0) === 1;
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ProjectMilestones
        (ProjectId, MilestoneTypeId, Name, Description, DueDate, IsCompleted, CompletedAt, SortOrder, CreatedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(projectId),
        milestoneTypeId ? Number(milestoneTypeId) : null,
        String(name).trim(),
        description || null,
        dueDate || null,
        completed ? 1 : 0,
        completed ? new Date() : null,
        Number(sortOrder || 0),
        Number(userId),
      ]
    );

    res.status(201).json({ success: true, milestoneId: result.insertId });
  } catch (error) {
    console.error('Create project milestone error:', error);
    res.status(500).json({ success: false, message: 'Failed to create project milestone' });
  }
});

router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const id = Number(req.params.id);
    const { name, description, dueDate, milestoneTypeId, isCompleted, sortOrder } = req.body;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT pm.Id, pm.IsCompleted, pm.CompletedAt, p.OrganizationId
       FROM ProjectMilestones pm
       INNER JOIN Projects p ON p.Id = pm.ProjectId
       WHERE pm.Id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Milestone not found' });
    }

    const existing = rows[0];
    const canManage = await canManageProjectMilestones(Number(userId), Number(existing.OrganizationId));
    if (!canManage) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const nextCompleted = typeof isCompleted === 'boolean' ? isCompleted : Number(isCompleted || 0) === 1;
    const wasCompleted = Number(existing.IsCompleted || 0) === 1;
    const nextCompletedAt = nextCompleted
      ? (wasCompleted ? existing.CompletedAt : new Date())
      : null;

    await pool.execute(
      `UPDATE ProjectMilestones
       SET Name = ?,
           Description = ?,
           DueDate = ?,
           MilestoneTypeId = ?,
           IsCompleted = ?,
           CompletedAt = ?,
           SortOrder = ?
       WHERE Id = ?`,
      [
        String(name || '').trim(),
        description || null,
        dueDate || null,
        milestoneTypeId ? Number(milestoneTypeId) : null,
        nextCompleted ? 1 : 0,
        nextCompletedAt,
        Number(sortOrder || 0),
        id,
      ]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update project milestone error:', error);
    res.status(500).json({ success: false, message: 'Failed to update project milestone' });
  }
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const id = Number(req.params.id);

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT pm.Id, p.OrganizationId
       FROM ProjectMilestones pm
       INNER JOIN Projects p ON p.Id = pm.ProjectId
       WHERE pm.Id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Milestone not found' });
    }

    const canManage = await canManageProjectMilestones(Number(userId), Number(rows[0].OrganizationId));
    if (!canManage) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    await pool.execute('DELETE FROM ProjectMilestones WHERE Id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete project milestone error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete project milestone' });
  }
});

export default router;
