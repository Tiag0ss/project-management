import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';

const router = Router();

const parseBooleanSetting = (value: unknown): boolean => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

const isAutoApproveTimeEntriesEnabled = async (): Promise<boolean> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT SettingValue FROM SystemSettings WHERE SettingKey = ? LIMIT 1`,
    ['autoApproveTimeEntries']
  );

  return rows.length > 0 && parseBooleanSetting(rows[0].SettingValue);
};

const getApprovalStatusForTask = async (taskId: number): Promise<'approved' | 'pending'> => {
  const autoApproveTimeEntries = await isAutoApproveTimeEntriesEnabled();

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT p.IsHobby
     FROM Tasks t
     INNER JOIN Projects p ON t.ProjectId = p.Id
     WHERE t.Id = ?`,
    [taskId]
  );

  const isHobby = rows.length > 0 && !!rows[0].IsHobby;
  return (isHobby || autoApproveTimeEntries) ? 'approved' : 'pending';
};

const persistActiveTimer = async (timer: RowDataPacket, userId: number, overrideDescription?: string) => {
  const timerType = String(timer.TimerType || 'task');
  // StartedAt is stored in UTC but comes back from MySQL as a plain string without timezone info
  // (e.g. "2026-04-06 09:30:00"). new Date() would parse that as local time on non-UTC systems,
  // shifting the value by the UTC offset. Force UTC by appending 'Z' when no offset is present.
  const rawStartedAt = String(timer.StartedAt || '');
  const startedAt = /Z$|[+-]\d{2}:\d{2}$/.test(rawStartedAt)
    ? new Date(rawStartedAt)
    : new Date(rawStartedAt.replace(' ', 'T') + 'Z');
  const now = new Date();
  const elapsedMs = now.getTime() - startedAt.getTime();
  const elapsedHours = Math.max(0.01, Math.round((elapsedMs / (1000 * 60 * 60)) * 100) / 100);
  const elapsedMinutes = Math.max(1, Math.round(elapsedMs / 60000));
  // Use local date/time (not UTC) for workDate/startTime/endTime so they reflect what the user sees
  const pad = (n: number) => String(n).padStart(2, '0');
  const workDate = `${startedAt.getFullYear()}-${pad(startedAt.getMonth() + 1)}-${pad(startedAt.getDate())}`;
  const startTime = startedAt.toTimeString().slice(0, 5);
  const endTime = now.toTimeString().slice(0, 5);
  const finalDescription = overrideDescription || timer.Description || '';

  if (timerType === 'callRecord') {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO CallRecords (UserId, CallDate, StartTime, DurationMinutes, CallType, Participants, Subject, Notes, OrganizationId, ProjectId, TaskId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        workDate,
        startTime,
        elapsedMinutes,
        timer.CallType || 'Teams',
        timer.Participants || null,
        timer.Subject || null,
        finalDescription || null,
        timer.OrganizationId || null,
        timer.ProjectId || null,
        timer.TaskId || null,
      ]
    );

    return {
      timerType,
      id: result.insertId,
      minutes: elapsedMinutes,
      hours: elapsedHours,
      message: `Logged ${elapsedMinutes} min call`,
    };
  }

  const approvalStatus = await getApprovalStatusForTask(Number(timer.TaskId));
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO TimeEntries (TaskId, UserId, WorkDate, Hours, StartTime, EndTime, Description, ApprovalStatus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [timer.TaskId, userId, workDate, elapsedHours, startTime, endTime, finalDescription, approvalStatus]
  );

  return {
    timerType,
    id: result.insertId,
    hours: elapsedHours,
    message: `Logged ${elapsedHours.toFixed(2)}h`,
  };
};

/**
 * @swagger
 * tags:
 *   name: Timers
 *   description: Work timers for time tracking
 */

/**
 * @swagger
 * /api/timers/active:
 *   get:
 *     summary: Get the current user's active timer
 *     tags: [Timers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active timer or null
 *       500:
 *         description: Server error
 */
// GET /api/timers/active — return running timer for current user (task or call record)
router.get('/active', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT at.*, t.TaskName, COALESCE(t.ProjectId, at.ProjectId) as ProjectId, p.ProjectName
       FROM ActiveTimers at
       LEFT JOIN Tasks t ON at.TaskId = t.Id
       LEFT JOIN Projects p ON COALESCE(t.ProjectId, at.ProjectId) = p.Id
       WHERE at.UserId = ?
       LIMIT 1`,
      [userId]
    );
    res.json({ success: true, timer: rows[0] || null });
  } catch (error) {
    console.error('Error fetching active timer:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch timer' });
  }
});

/**
 * @swagger
 * /api/timers/start:
 *   post:
 *     summary: Start a timer for a task
 *     tags: [Timers]
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
 *             properties:
 *               taskId:
 *                 type: integer
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Timer started
 *       400:
 *         description: taskId is required
 *       404:
 *         description: Task not found or access denied
 *       500:
 *         description: Server error
 */
// POST /api/timers/start — start a timer for a task or call record (saves any existing timer first)
router.post('/start', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const {
      timerType,
      taskId,
      organizationId,
      projectId,
      description,
      startedAt,
      callType,
      participants,
      subject,
    } = req.body;

    const normalizedTimerType = String(timerType || 'task') === 'callRecord' ? 'callRecord' : 'task';

    let finalTaskId: number | null = taskId ? Number(taskId) : null;
    let finalOrganizationId: number | null = organizationId ? Number(organizationId) : null;
    let finalProjectId: number | null = projectId ? Number(projectId) : null;

    if (normalizedTimerType === 'task' && !finalTaskId) {
      return res.status(400).json({ success: false, message: 'taskId is required' });
    }

    if (normalizedTimerType === 'task' && finalTaskId) {
      const [access] = await pool.execute<RowDataPacket[]>(
        `SELECT t.Id, t.ProjectId
         FROM Tasks t
         JOIN Projects p ON t.ProjectId = p.Id
         JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
         WHERE t.Id = ? AND om.UserId = ?`,
        [finalTaskId, userId]
      );
      if (access.length === 0) {
        return res.status(404).json({ success: false, message: 'Task not found or access denied' });
      }
      finalProjectId = Number(access[0].ProjectId || finalProjectId || 0) || null;
    }

    if (normalizedTimerType === 'callRecord' && finalProjectId) {
      const [projectAccess] = await pool.execute<RowDataPacket[]>(
        `SELECT p.Id, p.OrganizationId
         FROM Projects p
         JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
         WHERE p.Id = ? AND om.UserId = ?`,
        [finalProjectId, userId]
      );
      if (projectAccess.length === 0) {
        return res.status(404).json({ success: false, message: 'Project not found or access denied' });
      }
      finalOrganizationId = Number(projectAccess[0].OrganizationId || finalOrganizationId || 0) || finalOrganizationId;
    }

    if (normalizedTimerType === 'callRecord' && finalOrganizationId && !finalProjectId) {
      const [organizationAccess] = await pool.execute<RowDataPacket[]>(
        `SELECT o.Id
         FROM Organizations o
         JOIN OrganizationMembers om ON o.Id = om.OrganizationId
         WHERE o.Id = ? AND om.UserId = ?`,
        [finalOrganizationId, userId]
      );
      if (organizationAccess.length === 0) {
        return res.status(404).json({ success: false, message: 'Organization not found or access denied' });
      }
    }

    if (normalizedTimerType === 'callRecord' && finalTaskId) {
      const [taskAccess] = await pool.execute<RowDataPacket[]>(
        `SELECT t.Id, t.ProjectId, p.OrganizationId
         FROM Tasks t
         JOIN Projects p ON t.ProjectId = p.Id
         JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
         WHERE t.Id = ? AND om.UserId = ?`,
        [finalTaskId, userId]
      );
      if (taskAccess.length === 0) {
        return res.status(404).json({ success: false, message: 'Task not found or access denied' });
      }
      finalProjectId = Number(taskAccess[0].ProjectId || finalProjectId || 0) || finalProjectId;
      finalOrganizationId = Number(taskAccess[0].OrganizationId || finalOrganizationId || 0) || finalOrganizationId;
    }

    let timerStartDate = new Date();
    if (startedAt) {
      const parsedStartDate = new Date(startedAt);
      if (Number.isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid startedAt value' });
      }
      if (parsedStartDate.getTime() > Date.now()) {
        return res.status(400).json({ success: false, message: 'startedAt cannot be in the future' });
      }
      timerStartDate = parsedStartDate;
    }

    // Save any existing timer for this user before starting a new one
    const [existingTimers] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM ActiveTimers WHERE UserId = ?',
      [userId]
    );
    if (existingTimers.length > 0) {
      await persistActiveTimer(existingTimers[0], Number(userId));
      await pool.execute('DELETE FROM ActiveTimers WHERE UserId = ?', [userId]);
    }

    // Start new timer
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ActiveTimers (UserId, TaskId, OrganizationId, ProjectId, TimerType, CallType, Participants, Subject, StartedAt, Description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        finalTaskId,
        finalOrganizationId,
        finalProjectId,
        normalizedTimerType,
        normalizedTimerType === 'callRecord' ? (callType || 'Teams') : null,
        normalizedTimerType === 'callRecord' ? (participants || null) : null,
        normalizedTimerType === 'callRecord' ? (subject || null) : null,
        timerStartDate,
        description || null,
      ]
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT at.*, t.TaskName, COALESCE(t.ProjectId, at.ProjectId) as ProjectId, p.ProjectName
       FROM ActiveTimers at
       LEFT JOIN Tasks t ON at.TaskId = t.Id
       LEFT JOIN Projects p ON COALESCE(t.ProjectId, at.ProjectId) = p.Id
       WHERE at.Id = ?`,
      [result.insertId]
    );

    res.json({ success: true, timer: rows[0] });
  } catch (error) {
    console.error('Error starting timer:', error);
    res.status(500).json({ success: false, message: 'Failed to start timer' });
  }
});

/**
 * @swagger
 * /api/timers/available-tasks:
 *   get:
 *     summary: Get all tasks from projects accessible to current user
 *     tags: [Timers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available tasks
 *       500:
 *         description: Server error
 */
// GET /api/timers/available-tasks — all tasks from projects user can access via organization membership
router.get('/available-tasks', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT
          t.Id,
          t.TaskName,
          t.ProjectId,
          p.ProjectName,
          p.IsHobby,
          COALESCE(tsv.IsClosed, 0) as StatusIsClosed,
          COALESCE(tsv.IsCancelled, 0) as StatusIsCancelled
       FROM Tasks t
       INNER JOIN Projects p ON t.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE om.UserId = ?
       ORDER BY p.IsHobby ASC, p.ProjectName ASC, t.TaskName ASC`,
      [userId]
    );

    res.json({ success: true, tasks });
  } catch (error) {
    console.error('Error fetching available timer tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch available tasks' });
  }
});

/**
 * @swagger
 * /api/timers/{id}/stop:
 *   post:
 *     summary: Stop a timer and create a time entry
 *     tags: [Timers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Timer ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Timer stopped and time entry created
 *       404:
 *         description: Timer not found
 *       500:
 *         description: Server error
 */
// POST /api/timers/:id/stop — stop timer, create a time entry or call record, delete timer
router.post('/:id/stop', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const timerId = req.params.id;
    const { description: overrideDescription } = req.body;

    const [timers] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM ActiveTimers WHERE Id = ? AND UserId = ?',
      [timerId, userId]
    );
    if (timers.length === 0) {
      return res.status(404).json({ success: false, message: 'Timer not found' });
    }

    const timer = timers[0];
    const persisted = await persistActiveTimer(timer, Number(userId), overrideDescription);

    // Delete timer
    await pool.execute('DELETE FROM ActiveTimers WHERE Id = ?', [timerId]);

    if (persisted.timerType === 'callRecord') {
      return res.json({
        success: true,
        message: persisted.message,
        callRecordId: persisted.id,
        minutes: persisted.minutes,
        hours: persisted.hours,
      });
    }

    res.json({
      success: true,
      message: persisted.message,
      timeEntryId: persisted.id,
      hours: persisted.hours,
    });
  } catch (error) {
    console.error('Error stopping timer:', error);
    res.status(500).json({ success: false, message: 'Failed to stop timer' });
  }
});

/**
 * @swagger
 * /api/timers/{id}:
 *   delete:
 *     summary: Delete a timer without saving a time entry
 *     tags: [Timers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Timer ID
 *     responses:
 *       200:
 *         description: Timer discarded
 *       500:
 *         description: Server error
 */
// DELETE /api/timers/:id — discard timer without creating a time entry
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    await pool.execute('DELETE FROM ActiveTimers WHERE Id = ? AND UserId = ?', [req.params.id, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error discarding timer:', error);
    res.status(500).json({ success: false, message: 'Failed to discard timer' });
  }
});

export default router;
