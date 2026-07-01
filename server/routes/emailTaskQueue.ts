import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { normalizeEmailBodyForTaskDescription } from '../utils/emailBody';
import { logActivity } from './activityLogs';
import logger from '../utils/logger';

const router = Router();
const webhookRouter = Router();

const DEFAULT_TASK_TYPES = [
  { name: 'Feature', color: '#3b82f6', order: 1, isDefault: 1 },
  { name: 'Bug', color: '#ef4444', order: 2, isDefault: 0 },
  { name: 'Improvement', color: '#f59e0b', order: 3, isDefault: 0 },
  { name: 'Chore', color: '#6b7280', order: 4, isDefault: 0 },
];

const extractEmailAddress = (raw: unknown): string => {
  const value = String(raw ?? '').trim();
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim().toLowerCase();
};

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
};

const ensureTaskTypesForOrg = async (organizationId: number): Promise<RowDataPacket[]> => {
  const [taskTypes] = await pool.execute<RowDataPacket[]>(
    'SELECT Id, TypeName, IsDefault, SortOrder FROM TaskTypeValues WHERE OrganizationId = ? ORDER BY SortOrder ASC, Id ASC',
    [organizationId]
  );

  if (taskTypes.length > 0) return taskTypes;

  for (const type of DEFAULT_TASK_TYPES) {
    await pool.execute(
      `INSERT INTO TaskTypeValues (OrganizationId, TypeName, ColorCode, SortOrder, IsDefault)
       VALUES (?, ?, ?, ?, ?)`,
      [organizationId, type.name, type.color, type.order, type.isDefault]
    );
  }

  const [newTaskTypes] = await pool.execute<RowDataPacket[]>(
    'SELECT Id, TypeName, IsDefault, SortOrder FROM TaskTypeValues WHERE OrganizationId = ? ORDER BY SortOrder ASC, Id ASC',
    [organizationId]
  );

  return newTaskTypes;
};

const resolveDescription = (bodyText: string | null, bodyHtml: string | null): string | null =>
  normalizeEmailBodyForTaskDescription(bodyText, bodyHtml);

/**
 * @swagger
 * tags:
 *   name: EmailTaskQueue
 *   description: Outlook email task queue
 */

/**
 * POST /api/webhooks/email-task-queue
 * Inbound webhook from Cloudflare Email Worker (API token auth).
 */
webhookRouter.post('/email-task-queue', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { messageId, from, to, subject, text, html, receivedAt } = req.body ?? {};
    const normalizedMessageId = String(messageId ?? '').trim();
    if (!normalizedMessageId) {
      return res.status(400).json({ success: false, message: 'messageId is required' });
    }

    const fromEmail = extractEmailAddress(from);
    if (!fromEmail) {
      return res.status(400).json({ success: false, message: 'from is required' });
    }

    const [existingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM EmailTaskQueue WHERE ExternalMessageId = ?',
      [normalizedMessageId]
    );
    if (existingRows.length > 0) {
      await logActivity(
        null,
        fromEmail,
        'EMAIL_QUEUE_DUPLICATE',
        'EmailTaskQueue',
        Number(existingRows[0].Id),
        String(subject ?? '').trim() || null,
        `Duplicate messageId: ${normalizedMessageId}`,
        req.ip || null,
        req.get('user-agent') || null
      );
      return res.status(200).json({ success: true, duplicate: true });
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, Username, Email FROM Users WHERE LOWER(Email) = LOWER(?) AND IsActive = 1',
      [fromEmail]
    );

    if (users.length === 0) {
      await logActivity(
        null,
        fromEmail,
        'EMAIL_QUEUE_REJECTED',
        'EmailTaskQueue',
        null,
        String(subject ?? '').trim() || null,
        'Sender email does not match an active application user',
        req.ip || null,
        req.get('user-agent') || null
      );
      return res.status(202).json({ success: true, accepted: false, reason: 'unknown_sender' });
    }

    const user = users[0];
    const receivedAtValue = receivedAt ? new Date(receivedAt) : new Date();
    const safeReceivedAt = Number.isNaN(receivedAtValue.getTime()) ? new Date() : receivedAtValue;

    const [insertResult] = await pool.execute<ResultSetHeader>(
      `INSERT INTO EmailTaskQueue
        (UserId, ExternalMessageId, FromEmail, ToEmail, Subject, BodyText, BodyHtml, Status, ReceivedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        Number(user.Id),
        normalizedMessageId,
        fromEmail,
        extractEmailAddress(to) || String(to ?? '').trim() || null,
        truncate(String(subject ?? '').trim(), 500) || null,
        String(text ?? '').trim() || null,
        String(html ?? '').trim() || null,
        safeReceivedAt,
      ]
    );

    await logActivity(
      Number(user.Id),
      String(user.Username ?? fromEmail),
      'EMAIL_QUEUE_RECEIVED',
      'EmailTaskQueue',
      Number(insertResult.insertId),
      truncate(String(subject ?? '').trim() || 'Email task', 255),
      `Queued email from ${fromEmail}`,
      req.ip || null,
      req.get('user-agent') || null
    );

    return res.status(201).json({
      success: true,
      id: insertResult.insertId,
    });
  } catch (error) {
    logger.error('Email task queue webhook error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process inbound email' });
  }
});

/**
 * GET /api/email-task-queue
 * List pending queue items for the authenticated user.
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;

    const [items] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, UserId, ExternalMessageId, FromEmail, ToEmail, Subject, BodyText, BodyHtml,
              Status, ReceivedAt, CreatedAt
       FROM EmailTaskQueue
       WHERE UserId = ? AND Status = 'pending'
       ORDER BY ReceivedAt DESC, Id DESC
       LIMIT ${limit}`,
      [userId]
    );

    return res.json({
      success: true,
      items,
    });
  } catch (error) {
    logger.error('List email task queue error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch email task queue' });
  }
});

/**
 * POST /api/email-task-queue/import
 * Import selected queue items as tasks in a project.
 */
router.post('/import', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { projectId, queueItemIds, defaults, itemOverrides } = req.body ?? {};
    const normalizedProjectId = Number(projectId);
    if (!normalizedProjectId || Number.isNaN(normalizedProjectId)) {
      return res.status(400).json({ success: false, message: 'projectId is required' });
    }

    if (!Array.isArray(queueItemIds) || queueItemIds.length === 0) {
      return res.status(400).json({ success: false, message: 'queueItemIds is required' });
    }

    const uniqueIds = Array.from(
      new Set(
        queueItemIds
          .map((id: unknown) => Number(id))
          .filter((id: number) => Number.isFinite(id) && id > 0)
      )
    );

    if (uniqueIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid queue item IDs provided' });
    }

    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.OrganizationId
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [normalizedProjectId, userId]
    );

    if (projects.length === 0) {
      return res.status(403).json({ success: false, message: 'Project not found or access denied' });
    }

    const organizationId = Number(projects[0].OrganizationId);

    const [taskStatuses] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, StatusName, IsDefault, SortOrder FROM TaskStatusValues WHERE OrganizationId = ? ORDER BY SortOrder ASC, Id ASC',
      [organizationId]
    );
    const [taskPriorities] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, PriorityName, IsDefault, SortOrder FROM TaskPriorityValues WHERE OrganizationId = ? ORDER BY SortOrder ASC, Id ASC',
      [organizationId]
    );
    const taskTypes = await ensureTaskTypesForOrg(organizationId);

    const defaultStatusId = taskStatuses.find((s) => Number(s.IsDefault) === 1)?.Id || taskStatuses[0]?.Id || null;
    const defaultPriorityId = taskPriorities.find((p) => Number(p.IsDefault) === 1)?.Id || taskPriorities[0]?.Id || null;
    const defaultTaskTypeId = taskTypes.find((t) => Number(t.IsDefault) === 1)?.Id || taskTypes[0]?.Id || null;

    if (!defaultStatusId || !defaultPriorityId || !defaultTaskTypeId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot import because task status, priority, or type values are not configured for this organization',
      });
    }

    const resolveOverrideId = (
      rawValue: unknown,
      values: RowDataPacket[],
      nameField: 'StatusName' | 'PriorityName' | 'TypeName',
      fallbackId: number
    ): number => {
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        return fallbackId;
      }
      const asNumber = Number(rawValue);
      if (!Number.isNaN(asNumber)) {
        const byId = values.find((item) => Number(item.Id) === asNumber);
        if (byId) return Number(byId.Id);
      }
      const byName = values.find(
        (item) => String(item[nameField] ?? '').toLowerCase().trim() === String(rawValue).toLowerCase().trim()
      );
      return byName ? Number(byName.Id) : fallbackId;
    };

    const globalDefaults = defaults && typeof defaults === 'object' ? defaults : {};
    const globalStatusId = resolveOverrideId(globalDefaults.status, taskStatuses, 'StatusName', Number(defaultStatusId));
    const globalPriorityId = resolveOverrideId(globalDefaults.priority, taskPriorities, 'PriorityName', Number(defaultPriorityId));
    const globalTaskTypeId = resolveOverrideId(globalDefaults.taskType, taskTypes, 'TypeName', Number(defaultTaskTypeId));
    const globalAssignedTo = globalDefaults.assignedTo !== undefined && globalDefaults.assignedTo !== null && globalDefaults.assignedTo !== ''
      ? Number(globalDefaults.assignedTo)
      : userId;

    const placeholders = uniqueIds.map(() => '?').join(', ');
    const [queueItems] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, UserId, Subject, BodyText, BodyHtml, Status
       FROM EmailTaskQueue
       WHERE UserId = ? AND Status = 'pending' AND Id IN (${placeholders})`,
      [userId, ...uniqueIds]
    );

    if (queueItems.length === 0) {
      return res.status(404).json({ success: false, message: 'No pending queue items found for import' });
    }

    const [maxOrderRows] = await pool.execute<RowDataPacket[]>(
      'SELECT COALESCE(MAX(DisplayOrder), 0) as maxOrder FROM Tasks WHERE ProjectId = ?',
      [normalizedProjectId]
    );
    let nextDisplayOrder = Number(maxOrderRows[0]?.maxOrder || 0);

    const createdTasks: Array<{ id: number; name: string; queueItemId: number }> = [];
    let skipped = 0;

    for (const item of queueItems) {
      const itemId = Number(item.Id);
      const override = itemOverrides && typeof itemOverrides === 'object' ? itemOverrides[itemId] : undefined;

      const statusId = resolveOverrideId(override?.status, taskStatuses, 'StatusName', globalStatusId);
      const priorityId = resolveOverrideId(override?.priority, taskPriorities, 'PriorityName', globalPriorityId);
      const taskTypeId = resolveOverrideId(override?.taskType, taskTypes, 'TypeName', globalTaskTypeId);
      const assignedTo = override?.assignedTo !== undefined && override?.assignedTo !== null && override?.assignedTo !== ''
        ? Number(override.assignedTo)
        : globalAssignedTo;

      const subject = String(item.Subject ?? '').trim();
      const taskName = truncate(subject || 'Email task', 255);
      const description = resolveDescription(
        item.BodyText === null || item.BodyText === undefined ? null : String(item.BodyText),
        item.BodyHtml === null || item.BodyHtml === undefined ? null : String(item.BodyHtml)
      );

      nextDisplayOrder += 1;

      const [insertResult] = await pool.execute<ResultSetHeader>(
        `INSERT INTO Tasks
          (ProjectId, TaskName, Description, Status, Priority, TaskType, AssignedTo, UnscheduledWork, DisplayOrder, CreatedBy)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          normalizedProjectId,
          taskName,
          description,
          statusId,
          priorityId,
          taskTypeId,
          assignedTo || null,
          nextDisplayOrder,
          userId,
        ]
      );

      const taskId = Number(insertResult.insertId);

      await pool.execute(
        `UPDATE EmailTaskQueue
         SET Status = 'imported',
             ImportedTaskId = ?,
             ImportedProjectId = ?,
             ImportedAt = CURRENT_TIMESTAMP
         WHERE Id = ? AND UserId = ? AND Status = 'pending'`,
        [taskId, normalizedProjectId, itemId, userId]
      );

      createdTasks.push({ id: taskId, name: taskName, queueItemId: itemId });
    }

    skipped = uniqueIds.length - queueItems.length;

    await logActivity(
      userId,
      req.user?.username || null,
      'EMAIL_QUEUE_IMPORTED',
      'Project',
      normalizedProjectId,
      null,
      `Imported ${createdTasks.length} task(s) from email queue`,
      req.ip || null,
      req.get('user-agent') || null
    );

    return res.json({
      success: true,
      data: {
        imported: createdTasks.length,
        skipped,
        tasks: createdTasks,
      },
      message: `Imported ${createdTasks.length} task(s) from Outlook queue${skipped > 0 ? ` (${skipped} skipped)` : ''}`,
    });
  } catch (error) {
    logger.error('Import email task queue error:', error);
    return res.status(500).json({ success: false, message: 'Failed to import email queue items' });
  }
});

/**
 * DELETE /api/email-task-queue/:id
 * Dismiss a pending queue item.
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const queueItemId = Number(req.params.id);

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!queueItemId || Number.isNaN(queueItemId)) {
      return res.status(400).json({ success: false, message: 'Invalid queue item ID' });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE EmailTaskQueue
       SET Status = 'rejected'
       WHERE Id = ? AND UserId = ? AND Status = 'pending'`,
      [queueItemId, userId]
    );

    const affectedRows = Number(result.affectedRows || 0);
    if (affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Queue item not found or not dismissible' });
    }

    return res.json({ success: true, message: 'Queue item dismissed' });
  } catch (error) {
    logger.error('Dismiss email task queue item error:', error);
    return res.status(500).json({ success: false, message: 'Failed to dismiss queue item' });
  }
});

export { webhookRouter };
export default router;
