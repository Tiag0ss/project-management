import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../../middleware/auth';
import { pool } from '../../config/database';
import { ResultSetHeader, RowDataPacket } from '../../config/database';
import { cachedJson, ENTITY_TTL_SECONDS } from '../../utils/cachedJson';
import { cacheKeys } from '../../services/cacheKeys';
import { invalidateByEntity } from '../../services/cacheInvalidation';
import logger from '../../utils/logger';

const router = Router();

const toFlag = (value: any): number => {
  if (value === true || value === 1 || value === '1') return 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === 'on') return 1;
  }
  return 0;
};

async function hasOrgAccess(orgId: number, userId?: number): Promise<boolean> {
  if (!userId) return false;
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT OrganizationId FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
    [orgId, userId]
  );
  return rows.length > 0;
}

async function canManageOrgSettings(orgId: number, userId?: number): Promise<boolean> {
  if (!userId) return false;

  const [globalRows] = await pool.execute<RowDataPacket[]>(
    `SELECT u.isAdmin,
            COALESCE(MAX(CASE WHEN rp.CanManageOrganizations = 1 THEN 1 ELSE 0 END), 0) AS CanManageOrganizations
     FROM Users u
     LEFT JOIN RolePermissions rp ON
       (u.IsDeveloper = 1 AND rp.RoleName = 'Developer') OR
       (u.IsSupport = 1 AND rp.RoleName = 'Support') OR
       (u.IsManager = 1 AND rp.RoleName = 'Manager')
     WHERE u.Id = ?
     GROUP BY u.Id, u.isAdmin`,
    [userId]
  );

  if (globalRows.length > 0 && (Number(globalRows[0].isAdmin) === 1 || Number(globalRows[0].CanManageOrganizations) === 1)) {
    return true;
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT om.Role, COALESCE(pg.CanManageSettings, 0) as CanManageSettings
     FROM OrganizationMembers om
     LEFT JOIN PermissionGroups pg ON om.PermissionGroupId = pg.Id
     WHERE om.OrganizationId = ? AND om.UserId = ?`,
    [orgId, userId]
  );

  if (rows.length === 0) return false;
  return rows[0].Role === 'Owner' || Number(rows[0].CanManageSettings) === 1;
}

router.get('/organization/:orgId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = Number(req.params.orgId);

    if (!orgId) {
      return res.status(400).json({ success: false, message: 'Invalid organization ID' });
    }

    if (!(await hasOrgAccess(orgId, userId))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const payload = await cachedJson(
      cacheKeys.orgWorkflow(orgId),
      ENTITY_TTL_SECONDS,
      async () => {
        const [policies] = await pool.execute<RowDataPacket[]>(
          `SELECT wtp.*,
                  fs.StatusName as FromStatusName,
                  ts.StatusName as ToStatusName,
                  u.Username as CreatedByUsername
           FROM WorkflowTransitionPolicies wtp
           INNER JOIN TaskStatusValues fs ON wtp.FromStatusId = fs.Id
           INNER JOIN TaskStatusValues ts ON wtp.ToStatusId = ts.Id
           LEFT JOIN Users u ON wtp.CreatedBy = u.Id
           WHERE wtp.OrganizationId = ?
           ORDER BY wtp.RuleType ASC, fs.SortOrder ASC, fs.StatusName ASC, ts.SortOrder ASC, ts.StatusName ASC`,
          [orgId]
        );
        return { success: true, policies };
      }
    );

    return res.json(payload);
  } catch (error) {
    logger.error('Get workflow transition policies error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch workflow transition policies' });
  }
});

router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const {
      organizationId,
      fromStatusId,
      toStatusId,
      policyName,
      ruleType,
      requireDescription,
      requireAssignee,
      requireDueDate,
      requireEstimatedHours,
      requireStoryPoints,
      requirePlannedDates,
      isActive,
    } = req.body;

    const orgId = Number(organizationId);
    const fromId = Number(fromStatusId);
    const toId = Number(toStatusId);

    if (!orgId || !fromId || !toId) {
      return res.status(400).json({ success: false, message: 'organizationId, fromStatusId and toStatusId are required' });
    }

    if (!(await canManageOrgSettings(orgId, userId))) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const [statusRows] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM TaskStatusValues
       WHERE OrganizationId = ? AND Id IN (?, ?)
       ORDER BY Id ASC`,
      [orgId, fromId, toId]
    );

    if (statusRows.length !== 2) {
      return res.status(400).json({ success: false, message: 'Selected statuses must belong to the organization' });
    }

    const [duplicates] = await pool.execute<RowDataPacket[]>(
      `SELECT Id
       FROM WorkflowTransitionPolicies
       WHERE OrganizationId = ? AND FromStatusId = ? AND ToStatusId = ?`,
      [orgId, fromId, toId]
    );

    if (duplicates.length > 0) {
      return res.status(409).json({ success: false, message: 'A policy already exists for this status transition' });
    }

    const normalizedPolicyName = policyName ? String(policyName).trim() : '';
    const fallbackRuleType = String(ruleType || 'Custom').trim();
    const finalRuleType = fallbackRuleType || 'Custom';
    const finalPolicyName = normalizedPolicyName || `${finalRuleType}: ${fromId} → ${toId}`;

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO WorkflowTransitionPolicies
       (OrganizationId, FromStatusId, ToStatusId, PolicyName, RuleType,
        RequireDescription, RequireAssignee, RequireDueDate, RequireEstimatedHours,
        RequireStoryPoints, RequirePlannedDates, IsActive, CreatedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        fromId,
        toId,
        finalPolicyName,
        finalRuleType,
        toFlag(requireDescription),
        toFlag(requireAssignee),
        toFlag(requireDueDate),
        toFlag(requireEstimatedHours),
        toFlag(requireStoryPoints),
        toFlag(requirePlannedDates),
        isActive === undefined ? 1 : toFlag(isActive),
        userId,
      ]
    );

    await invalidateByEntity('workflow', { orgId });

    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    logger.error('Create workflow transition policy error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create workflow transition policy' });
  }
});

router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid policy ID' });
    }

    const [existingRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM WorkflowTransitionPolicies WHERE Id = ?`,
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    const existing = existingRows[0];
    const orgId = Number(existing.OrganizationId);

    if (!(await canManageOrgSettings(orgId, userId))) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const fromId = req.body.fromStatusId !== undefined ? Number(req.body.fromStatusId) : Number(existing.FromStatusId);
    const toId = req.body.toStatusId !== undefined ? Number(req.body.toStatusId) : Number(existing.ToStatusId);

    if (!fromId || !toId) {
      return res.status(400).json({ success: false, message: 'fromStatusId and toStatusId are required' });
    }

    const [statusRows] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM TaskStatusValues
       WHERE OrganizationId = ? AND Id IN (?, ?)
       ORDER BY Id ASC`,
      [orgId, fromId, toId]
    );

    if (statusRows.length !== 2) {
      return res.status(400).json({ success: false, message: 'Selected statuses must belong to the organization' });
    }

    const [duplicates] = await pool.execute<RowDataPacket[]>(
      `SELECT Id
       FROM WorkflowTransitionPolicies
       WHERE OrganizationId = ? AND FromStatusId = ? AND ToStatusId = ? AND Id <> ?`,
      [orgId, fromId, toId, id]
    );

    if (duplicates.length > 0) {
      return res.status(409).json({ success: false, message: 'A policy already exists for this status transition' });
    }

    const finalRuleType = req.body.ruleType !== undefined
      ? String(req.body.ruleType || 'Custom').trim() || 'Custom'
      : String(existing.RuleType || 'Custom');
    const incomingName = req.body.policyName !== undefined
      ? String(req.body.policyName || '').trim()
      : String(existing.PolicyName || '');

    await pool.execute(
      `UPDATE WorkflowTransitionPolicies
       SET FromStatusId = ?,
           ToStatusId = ?,
           PolicyName = ?,
           RuleType = ?,
           RequireDescription = ?,
           RequireAssignee = ?,
           RequireDueDate = ?,
           RequireEstimatedHours = ?,
           RequireStoryPoints = ?,
           RequirePlannedDates = ?,
           IsActive = ?
       WHERE Id = ?`,
      [
        fromId,
        toId,
        incomingName || `${finalRuleType}: ${fromId} → ${toId}`,
        finalRuleType,
        req.body.requireDescription !== undefined ? toFlag(req.body.requireDescription) : Number(existing.RequireDescription || 0),
        req.body.requireAssignee !== undefined ? toFlag(req.body.requireAssignee) : Number(existing.RequireAssignee || 0),
        req.body.requireDueDate !== undefined ? toFlag(req.body.requireDueDate) : Number(existing.RequireDueDate || 0),
        req.body.requireEstimatedHours !== undefined ? toFlag(req.body.requireEstimatedHours) : Number(existing.RequireEstimatedHours || 0),
        req.body.requireStoryPoints !== undefined ? toFlag(req.body.requireStoryPoints) : Number(existing.RequireStoryPoints || 0),
        req.body.requirePlannedDates !== undefined ? toFlag(req.body.requirePlannedDates) : Number(existing.RequirePlannedDates || 0),
        req.body.isActive !== undefined ? toFlag(req.body.isActive) : Number(existing.IsActive || 0),
        id,
      ]
    );

    await invalidateByEntity('workflow', { orgId });

    return res.json({ success: true });
  } catch (error) {
    logger.error('Update workflow transition policy error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update workflow transition policy' });
  }
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({ success: false, message: 'Invalid policy ID' });
    }

    const [existingRows] = await pool.execute<RowDataPacket[]>(
      `SELECT OrganizationId FROM WorkflowTransitionPolicies WHERE Id = ?`,
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    const orgId = Number(existingRows[0].OrganizationId);
    if (!(await canManageOrgSettings(orgId, userId))) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    await pool.execute('DELETE FROM WorkflowTransitionPolicies WHERE Id = ?', [id]);
    await invalidateByEntity('workflow', { orgId });
    return res.json({ success: true });
  } catch (error) {
    logger.error('Delete workflow transition policy error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete workflow transition policy' });
  }
});

export default router;
