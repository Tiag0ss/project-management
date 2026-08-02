import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool, RowDataPacket, ResultSetHeader } from '../config/database';
import { cachedJson, ENTITY_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import { invalidateByEntity } from '../services/cacheInvalidation';
import { validateRequest } from '../utils/validation';
import { z } from 'zod';
import logger from '../utils/logger';
import {
  LOCKED_TASK_FORM_FIELDS,
  LOCKED_TASK_FORM_TABS,
  TASK_FIELD_VISIBILITY_SETTING_KEY,
  assertNoLockedHidden,
  normalizeTaskFieldVisibility,
  serializeTaskFieldVisibility,
  TaskFieldVisibilityConfig,
} from '../utils/taskFieldVisibility';
import {
  clearUserTaskFieldVisibility,
  ensureOrgTaskFieldVisibility,
  loadGlobalVisibility,
  resolveEffectiveTaskFieldVisibility,
  saveUserTaskFieldVisibility,
  seedOrgTaskFieldVisibility,
} from '../utils/taskFieldVisibilitySeed';

export { seedOrgTaskFieldVisibility };

const router = Router();

const visibilityBodySchema = z.object({
  fields: z.record(z.string(), z.boolean()),
  tabs: z.record(z.string(), z.boolean()),
});

async function isAdminUser(userId?: number): Promise<boolean> {
  if (!userId) return false;
  const [users] = await pool.execute<RowDataPacket[]>(
    'SELECT IsAdmin FROM Users WHERE Id = ?',
    [userId]
  );
  return users.length > 0 && (users[0].IsAdmin === 1 || users[0].IsAdmin === true);
}

async function hasOrgAccess(orgId: number, userId?: number): Promise<boolean> {
  if (!userId) return false;
  if (await isAdminUser(userId)) return true;
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

  if (
    globalRows.length > 0 &&
    (Number(globalRows[0].isAdmin) === 1 || Number(globalRows[0].CanManageOrganizations) === 1)
  ) {
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
  return rows[0].Role === 'Owner' || rows[0].Role === 'Admin' || Number(rows[0].CanManageSettings) === 1;
}

async function saveGlobalVisibility(config: TaskFieldVisibilityConfig): Promise<void> {
  const value = serializeTaskFieldVisibility(config);
  const [updateResult, updateMeta] = await pool.execute(
    'UPDATE SystemSettings SET SettingValue = ? WHERE SettingKey = ?',
    [value, TASK_FIELD_VISIBILITY_SETTING_KEY]
  );
  const affectedRows = Number(
    (updateResult as ResultSetHeader)?.affectedRows ||
      (updateResult as { rowsAffected?: number[] })?.rowsAffected?.[0] ||
      (updateMeta as { affectedRows?: number })?.affectedRows ||
      0
  );
  if (affectedRows === 0) {
    await pool.execute('INSERT INTO SystemSettings (SettingKey, SettingValue) VALUES (?, ?)', [
      TASK_FIELD_VISIBILITY_SETTING_KEY,
      value,
    ]);
  }
}

function toResponse(
  config: TaskFieldVisibilityConfig,
  extras?: { source?: string; hasUserOverride?: boolean }
) {
  return {
    fields: config.fields,
    tabs: config.tabs,
    lockedFields: [...LOCKED_TASK_FORM_FIELDS],
    lockedTabs: [...LOCKED_TASK_FORM_TABS],
    ...(extras?.source ? { source: extras.source } : {}),
    ...(typeof extras?.hasUserOverride === 'boolean'
      ? { hasUserOverride: extras.hasUserOverride }
      : {}),
  };
}

router.get('/global', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isAdminUser(req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const payload = await cachedJson(cacheKeys.taskFieldVisibilityGlobal(), ENTITY_TTL_SECONDS, async () => {
      const config = await loadGlobalVisibility();
      return { success: true, data: toResponse(config) };
    });

    return res.json(payload);
  } catch (error) {
    logger.error('Get global task field visibility error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch task field visibility' });
  }
});

router.put('/global', authenticateToken, validateRequest(visibilityBodySchema), async (req: AuthRequest, res: Response) => {
  try {
    if (!(await isAdminUser(req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const config = normalizeTaskFieldVisibility(req.body);
    const lockedError = assertNoLockedHidden(req.body);
    if (lockedError) {
      return res.status(400).json({ success: false, message: lockedError });
    }

    await saveGlobalVisibility(config);
    await invalidateByEntity('taskFieldVisibility');

    return res.json({
      success: true,
      message: 'Global task form visibility updated',
      data: toResponse(config),
    });
  } catch (error) {
    logger.error('Update global task field visibility error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update task field visibility' });
  }
});

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
      cacheKeys.orgTaskFieldVisibility(orgId),
      ENTITY_TTL_SECONDS,
      async () => {
        const config = await ensureOrgTaskFieldVisibility(orgId);
        return { success: true, data: toResponse(config) };
      }
    );

    return res.json(payload);
  } catch (error) {
    logger.error('Get org task field visibility error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch task field visibility' });
  }
});

router.put(
  '/organization/:orgId',
  authenticateToken,
  validateRequest(visibilityBodySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const orgId = Number(req.params.orgId);
      if (!orgId) {
        return res.status(400).json({ success: false, message: 'Invalid organization ID' });
      }
      if (!(await canManageOrgSettings(orgId, userId))) {
        return res.status(403).json({ success: false, message: 'Permission denied' });
      }

      const lockedError = assertNoLockedHidden(req.body);
      if (lockedError) {
        return res.status(400).json({ success: false, message: lockedError });
      }

      const config = normalizeTaskFieldVisibility(req.body);
      const value = serializeTaskFieldVisibility(config);

      const [existing] = await pool.execute<RowDataPacket[]>(
        'SELECT OrganizationId FROM OrganizationTaskFieldVisibility WHERE OrganizationId = ?',
        [orgId]
      );
      if (existing.length === 0) {
        await pool.execute(
          'INSERT INTO OrganizationTaskFieldVisibility (OrganizationId, VisibilityJson) VALUES (?, ?)',
          [orgId, value]
        );
      } else {
        await pool.execute(
          'UPDATE OrganizationTaskFieldVisibility SET VisibilityJson = ? WHERE OrganizationId = ?',
          [value, orgId]
        );
      }

      await invalidateByEntity('taskFieldVisibility', { orgId });

      return res.json({
        success: true,
        message: 'Organization task form visibility updated',
        data: toResponse(config),
      });
    } catch (error) {
      logger.error('Update org task field visibility error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update task field visibility' });
    }
  }
);

router.post('/organization/:orgId/sync-from-global', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = Number(req.params.orgId);
    if (!orgId) {
      return res.status(400).json({ success: false, message: 'Invalid organization ID' });
    }
    if (!(await canManageOrgSettings(orgId, userId))) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const config = await loadGlobalVisibility();
    const value = serializeTaskFieldVisibility(config);

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM OrganizationTaskFieldVisibility WHERE OrganizationId = ?',
      [orgId]
    );
    if (existing.length === 0) {
      await pool.execute(
        'INSERT INTO OrganizationTaskFieldVisibility (OrganizationId, VisibilityJson) VALUES (?, ?)',
        [orgId, value]
      );
    } else {
      await pool.execute(
        'UPDATE OrganizationTaskFieldVisibility SET VisibilityJson = ? WHERE OrganizationId = ?',
        [value, orgId]
      );
    }

    await invalidateByEntity('taskFieldVisibility', { orgId });

    return res.json({
      success: true,
      message: 'Organization task form visibility synced from global template',
      data: toResponse(config),
    });
  } catch (error) {
    logger.error('Sync org task field visibility error:', error);
    return res.status(500).json({ success: false, message: 'Failed to sync task field visibility' });
  }
});

/** Effective config for the current user in an org: user → organization → global */
router.get('/effective/:orgId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = Number(req.params.orgId);
    if (!userId || !orgId) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    if (!(await hasOrgAccess(orgId, userId))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const resolved = await resolveEffectiveTaskFieldVisibility(userId, orgId);
    return res.json({
      success: true,
      data: toResponse(resolved.config, {
        source: resolved.source,
        hasUserOverride: resolved.hasUserOverride,
      }),
    });
  } catch (error) {
    logger.error('Get effective task field visibility error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch task field visibility' });
  }
});

/** Personal override editor payload (effective config + whether user customized it) */
router.get('/me/organization/:orgId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = Number(req.params.orgId);
    if (!userId || !orgId) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    if (!(await hasOrgAccess(orgId, userId))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const resolved = await resolveEffectiveTaskFieldVisibility(userId, orgId);
    return res.json({
      success: true,
      data: toResponse(resolved.config, {
        source: resolved.source,
        hasUserOverride: resolved.hasUserOverride,
      }),
    });
  } catch (error) {
    logger.error('Get my task field visibility error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch task field visibility' });
  }
});

router.put(
  '/me/organization/:orgId',
  authenticateToken,
  validateRequest(visibilityBodySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const orgId = Number(req.params.orgId);
      if (!userId || !orgId) {
        return res.status(400).json({ success: false, message: 'Invalid request' });
      }
      if (!(await hasOrgAccess(orgId, userId))) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const lockedError = assertNoLockedHidden(req.body);
      if (lockedError) {
        return res.status(400).json({ success: false, message: lockedError });
      }

      const config = await saveUserTaskFieldVisibility(userId, orgId, req.body);
      return res.json({
        success: true,
        message: 'Personal task form visibility saved',
        data: toResponse(config, { source: 'user', hasUserOverride: true }),
      });
    } catch (error) {
      logger.error('Update my task field visibility error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update task field visibility' });
    }
  }
);

router.delete('/me/organization/:orgId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const orgId = Number(req.params.orgId);
    if (!userId || !orgId) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    if (!(await hasOrgAccess(orgId, userId))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await clearUserTaskFieldVisibility(userId, orgId);
    const resolved = await resolveEffectiveTaskFieldVisibility(userId, orgId);
    return res.json({
      success: true,
      message: 'Personal override cleared; using organization or global defaults',
      data: toResponse(resolved.config, {
        source: resolved.source,
        hasUserOverride: resolved.hasUserOverride,
      }),
    });
  } catch (error) {
    logger.error('Clear my task field visibility error:', error);
    return res.status(500).json({ success: false, message: 'Failed to clear task field visibility' });
  }
});

export default router;
