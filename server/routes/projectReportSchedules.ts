import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { sendReportNow } from '../utils/pdfReportScheduler';

const router = Router();

// ─── GET /api/project-report-schedules/project/:projectId ────────────────────
router.get('/project/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = parseInt(String(req.params.projectId), 10);
    const userId = req.user?.userId;
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id FROM Projects p
       INNER JOIN OrganizationMembers om ON om.OrganizationId = p.OrganizationId AND om.UserId = ?
       WHERE p.Id = ?
       UNION
       SELECT p.Id FROM Projects p WHERE p.Id = ? AND ? IN (SELECT Id FROM Users WHERE isAdmin = 1)`,
      [userId, projectId, projectId, userId]
    );

    if (!access.length) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [schedules] = await pool.execute<RowDataPacket[]>(
      `SELECT prs.*, CONCAT(u.FirstName, ' ', u.LastName) AS CreatedByName
       FROM ProjectReportSchedules prs
       LEFT JOIN Users u ON prs.CreatedBy = u.Id
       WHERE prs.ProjectId = ?
       ORDER BY prs.Id`,
      [projectId]
    );

    res.json({ success: true, schedules });
  } catch (error) {
    console.error('Error fetching report schedules:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch report schedules' });
  }
});

// ─── POST /api/project-report-schedules ───────────────────────────────────────
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const {
      projectId,
      frequency,
      dayOfWeek,
      dayOfMonth,
      recipients,
      includeTaskTable,
      includeTimeEntries,
      includeBudget,
      isEnabled,
    } = req.body;

    if (!projectId || !frequency || !recipients) {
      return res.status(400).json({ success: false, message: 'projectId, frequency and recipients are required' });
    }

    if (!['weekly', 'monthly'].includes(frequency)) {
      return res.status(400).json({ success: false, message: 'frequency must be weekly or monthly' });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ProjectReportSchedules
         (ProjectId, Frequency, DayOfWeek, DayOfMonth, Recipients,
          IncludeTaskTable, IncludeTimeEntries, IncludeBudget, IsEnabled, CreatedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId,
        frequency,
        dayOfWeek ?? null,
        dayOfMonth ?? null,
        recipients,
        includeTaskTable !== false ? 1 : 0,
        includeTimeEntries !== false ? 1 : 0,
        includeBudget !== false ? 1 : 0,
        isEnabled !== false ? 1 : 0,
        userId,
      ]
    );

    const [created] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM ProjectReportSchedules WHERE Id = ?',
      [result.insertId]
    );

    res.status(201).json({ success: true, schedule: created[0] });
  } catch (error) {
    console.error('Error creating report schedule:', error);
    res.status(500).json({ success: false, message: 'Failed to create report schedule' });
  }
});

// ─── PUT /api/project-report-schedules/:id ────────────────────────────────────
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const userId = req.user?.userId;
    const {
      frequency,
      dayOfWeek,
      dayOfMonth,
      recipients,
      includeTaskTable,
      includeTimeEntries,
      includeBudget,
      isEnabled,
    } = req.body;

    // Verify ownership or admin
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT prs.Id FROM ProjectReportSchedules prs
       INNER JOIN Projects p ON prs.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON om.OrganizationId = p.OrganizationId AND om.UserId = ?
       WHERE prs.Id = ?
       UNION
       SELECT prs.Id FROM ProjectReportSchedules prs
       WHERE prs.Id = ? AND ? IN (SELECT Id FROM Users WHERE isAdmin = 1)`,
      [userId, id, id, userId]
    );

    if (!existing.length) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await pool.execute(
      `UPDATE ProjectReportSchedules SET
         Frequency = ?, DayOfWeek = ?, DayOfMonth = ?, Recipients = ?,
         IncludeTaskTable = ?, IncludeTimeEntries = ?, IncludeBudget = ?,
         IsEnabled = ?, UpdatedAt = NOW()
       WHERE Id = ?`,
      [
        frequency,
        dayOfWeek ?? null,
        dayOfMonth ?? null,
        recipients,
        includeTaskTable !== false ? 1 : 0,
        includeTimeEntries !== false ? 1 : 0,
        includeBudget !== false ? 1 : 0,
        isEnabled !== false ? 1 : 0,
        id,
      ]
    );

    const [updated] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM ProjectReportSchedules WHERE Id = ?',
      [id]
    );

    res.json({ success: true, schedule: updated[0] });
  } catch (error) {
    console.error('Error updating report schedule:', error);
    res.status(500).json({ success: false, message: 'Failed to update report schedule' });
  }
});

// ─── DELETE /api/project-report-schedules/:id ─────────────────────────────────
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const userId = req.user?.userId;

    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT prs.Id FROM ProjectReportSchedules prs
       INNER JOIN Projects p ON prs.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON om.OrganizationId = p.OrganizationId AND om.UserId = ?
       WHERE prs.Id = ?
       UNION
       SELECT prs.Id FROM ProjectReportSchedules prs
       WHERE prs.Id = ? AND ? IN (SELECT Id FROM Users WHERE isAdmin = 1)`,
      [userId, id, id, userId]
    );

    if (!existing.length) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await pool.execute('DELETE FROM ProjectReportSchedules WHERE Id = ?', [id]);
    res.json({ success: true, message: 'Schedule deleted' });
  } catch (error) {
    console.error('Error deleting report schedule:', error);
    res.status(500).json({ success: false, message: 'Failed to delete report schedule' });
  }
});

// ─── GET /api/project-report-schedules/:id/send-now ───────────────────────────
// Trigger an immediate report send for testing purposes
router.post('/:id/send-now', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const userId = req.user?.userId;

    const [schedules] = await pool.execute<RowDataPacket[]>(
      `SELECT prs.*, p.ProjectName, p.OrganizationId
       FROM ProjectReportSchedules prs
       INNER JOIN Projects p ON prs.ProjectId = p.Id
       INNER JOIN OrganizationMembers om ON om.OrganizationId = p.OrganizationId AND om.UserId = ?
       WHERE prs.Id = ?`,
      [userId, id]
    );

    if (!schedules.length) {
      return res.status(403).json({ success: false, message: 'Schedule not found or access denied' });
    }

    // Run the scheduler for this specific schedule
    await sendReportNow(schedules[0] as any);

    res.json({ success: true, message: 'Report sent successfully' });
  } catch (error: any) {
    console.error('Error sending report:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to send report' });
  }
});

export default router;
