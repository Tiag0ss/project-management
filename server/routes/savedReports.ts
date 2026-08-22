import express, { Response } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { dbProvider } from '../config/database';
import logger from '../utils/logger';
import { requireManagerReportingMiddleware } from '../utils/reportingAccess';

const router = express.Router();

router.use(authenticateToken, requireManagerReportingMiddleware);

type DefaultSavedReport = {
  Id: number;
  UserId: number;
  DataSource: string;
  ReportName: string;
  PivotConfig: Record<string, unknown>;
  Filters: unknown[];
  CreatedAt: string;
  UpdatedAt: string;
  SharedWith: string;
  IsPublic: number;
  IsSystemDefault: number;
};

const createDefaultReports = (): DefaultSavedReport[] => {
  const now = new Date().toISOString();
  let nextId = -1000;

  const create = (
    dataSource: string,
    reportName: string,
    rows: string[],
    columns: string[],
    values: Array<{ field: string; aggregation: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinctCount' }>,
    filters: unknown[] = []
  ): DefaultSavedReport => ({
    Id: nextId--,
    UserId: 0,
    DataSource: dataSource,
    ReportName: reportName,
    PivotConfig: { rows, columns, values },
    Filters: filters,
    CreatedAt: now,
    UpdatedAt: now,
    SharedWith: '',
    IsPublic: 1,
    IsSystemDefault: 1,
  });

  return [
    create('time-entries', 'Time by Project and Task', ['ProjectName', 'TaskName'], ['WorkDate'], [{ field: 'Hours', aggregation: 'sum' }]),
    create('time-entries', 'Hours by Day', ['WorkDate'], ['ProjectName'], [{ field: 'Hours', aggregation: 'sum' }]),
    create('time-entries', 'Hours by Project', ['ProjectName'], ['TaskName'], [{ field: 'Hours', aggregation: 'sum' }]),
    create('time-entries', 'Entries Count by Project', ['ProjectName'], ['WorkDate'], [{ field: 'TaskName', aggregation: 'count' }]),
    create('time-entries', 'Start/End Time Coverage', ['ProjectName', 'TaskName'], ['StartTime'], [{ field: 'Hours', aggregation: 'sum' }]),

    create('tasks', 'Tasks by Status', ['ProjectName', 'StatusName'], ['PriorityName'], [{ field: 'TaskName', aggregation: 'count' }]),
    create(
      'tasks',
      'Estimated Hours by Project',
      ['ProjectName'],
      ['StatusName'],
      [{ field: 'EstimatedHours', aggregation: 'sum' }],
      [{ id: 'default-leaf-only', field: 'SubtaskCount', operator: 'equals', value: '0' }]
    ),
    create('tasks', 'Tasks by Assignee', ['AssigneeName'], ['StatusName'], [{ field: 'TaskName', aggregation: 'count' }]),
    create('tasks', 'Planned Start by Project', ['ProjectName'], ['PlannedStartDate'], [{ field: 'TaskName', aggregation: 'count' }]),
    create('tasks', 'Subtask Distribution', ['ProjectName'], ['StatusName'], [{ field: 'SubtaskCount', aggregation: 'sum' }]),

    create('projects', 'Projects by Organization and Status', ['OrganizationName'], ['StatusName'], [{ field: 'ProjectName', aggregation: 'count' }]),
    create('projects', 'Estimated vs Worked Hours', ['ProjectName'], ['StatusName'], [
      { field: 'TotalEstimatedHours', aggregation: 'sum' },
      { field: 'TotalWorkedHours', aggregation: 'sum' },
    ]),
    create('projects', 'Open Tickets by Project', ['ProjectName'], ['StatusName'], [{ field: 'OpenTickets', aggregation: 'sum' }]),
    create('projects', 'Unplanned Tasks by Project', ['ProjectName'], ['StatusName'], [{ field: 'UnplannedTasks', aggregation: 'sum' }]),
    create('projects', 'Projects by Customer', ['CustomerName'], ['StatusName'], [{ field: 'ProjectName', aggregation: 'count' }]),

    create('task-allocations', 'Allocated Hours by Date', ['AllocationDate'], ['ProjectName'], [{ field: 'AllocatedHours', aggregation: 'sum' }]),
    create('task-allocations', 'Allocated Hours by Project', ['ProjectName'], ['TaskName'], [{ field: 'AllocatedHours', aggregation: 'sum' }]),
    create('task-allocations', 'Allocation Count by Task', ['TaskName'], ['AllocationDate'], [{ field: 'AllocatedHours', aggregation: 'count' }]),
    create('task-allocations', 'Allocation Coverage by Start Time', ['ProjectName'], ['StartTime'], [{ field: 'AllocatedHours', aggregation: 'sum' }]),
    create('task-allocations', 'Allocation Coverage by End Time', ['ProjectName'], ['EndTime'], [{ field: 'AllocatedHours', aggregation: 'sum' }]),

    create('tickets', 'Tickets by Status', ['StatusName'], ['PriorityName'], [{ field: 'Title', aggregation: 'count' }]),
    create('tickets', 'Tickets by Customer and Type', ['CustomerName'], ['TypeName'], [{ field: 'Title', aggregation: 'count' }]),
    create('tickets', 'Ticket Estimated Hours', ['ProjectName'], ['StatusName'], [{ field: 'EstimatedHours', aggregation: 'sum' }]),
    create('tickets', 'Tickets by Assignee', ['AssigneeName'], ['StatusName'], [{ field: 'Title', aggregation: 'count' }]),
    create('tickets', 'Created vs Resolved by Date', ['CreatedAt'], ['ResolvedAt'], [{ field: 'Title', aggregation: 'count' }]),
  ];
};

export const SYSTEM_DEFAULT_REPORTS = createDefaultReports();

const normalizeStoredReport = (report: any) => ({
  ...report,
  PivotConfig: typeof report.PivotConfig === 'string' ? JSON.parse(report.PivotConfig) : report.PivotConfig,
  Filters: typeof report.Filters === 'string' ? JSON.parse(report.Filters) : (report.Filters || []),
  SharedWith: report.SharedWith || '',
  IsSystemDefault: Number(report.IsSystemDefault || 0),
});

const isSystemDefaultReportId = (id: string | number): boolean => {
  const numericId = Number(id);
  return Number.isFinite(numericId) && numericId <= 0;
};

/**
 * @swagger
 * tags:
 *   name: SavedReports
 *   description: Saved dynamic report management
 */

/**
 * @swagger
 * /api/saved-reports:
 *   get:
 *     summary: Get all saved reports
 *     tags: [SavedReports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of saved reports accessible by the current user
 */
// Get all saved reports for the current user
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const sharedPredicate = dbProvider === 'mssql'
      ? "CHARINDEX(',' + CAST(? AS varchar(20)) + ',', ',' + COALESCE(SharedWith, '') + ',') > 0"
      : 'FIND_IN_SET(?, SharedWith) > 0';

    const [reports] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, DataSource, ReportName, PivotConfig, Filters, CreatedAt, UpdatedAt, SharedWith, IsPublic
       FROM SavedReports
       WHERE UserId = ? OR IsPublic = 1 OR ${sharedPredicate}
       ORDER BY DataSource, ReportName`,
      [userId, userId]
    );

    const parsedReports = reports.map(normalizeStoredReport);
    const mergedReports = [...SYSTEM_DEFAULT_REPORTS, ...parsedReports];

    res.json({ success: true, reports: mergedReports });
  } catch (error) {
    logger.error('Error fetching saved reports:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch saved reports' });
  }
});

/**
 * @swagger
 * /api/saved-reports/datasource/{dataSource}:
 *   get:
 *     summary: Get reports for a specific data source
 *     tags: [SavedReports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dataSource
 *         required: true
 *         schema:
 *           type: string
 *         description: Data source name
 *     responses:
 *       200:
 *         description: List of saved reports for the data source
 */
// Get saved reports for a specific data source
router.get('/datasource/:dataSource', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { dataSource } = req.params;

    const sharedPredicate = dbProvider === 'mssql'
      ? "CHARINDEX(',' + CAST(? AS varchar(20)) + ',', ',' + COALESCE(SharedWith, '') + ',') > 0"
      : 'FIND_IN_SET(?, SharedWith) > 0';

    const [reports] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, DataSource, ReportName, PivotConfig, Filters, CreatedAt, UpdatedAt, SharedWith, IsPublic
       FROM SavedReports
       WHERE (UserId = ? OR IsPublic = 1 OR ${sharedPredicate}) AND DataSource = ?
       ORDER BY ReportName`,
      [userId, userId, dataSource]
    );

    const parsedReports = reports.map(normalizeStoredReport);
    const defaultReportsForSource = SYSTEM_DEFAULT_REPORTS.filter((report) => report.DataSource === dataSource);
    const mergedReports = [...defaultReportsForSource, ...parsedReports];

    res.json({ success: true, reports: mergedReports });
  } catch (error) {
    logger.error('Error fetching saved reports:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch saved reports' });
  }
});

/**
 * @swagger
 * /api/saved-reports:
 *   post:
 *     summary: Create a saved report
 *     tags: [SavedReports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dataSource, reportName, pivotConfig]
 *             properties:
 *               dataSource:
 *                 type: string
 *               reportName:
 *                 type: string
 *               pivotConfig:
 *                 type: object
 *               filters:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Saved report created
 */
// Create a new saved report
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { dataSource, reportName, pivotConfig, filters } = req.body;

    if (!dataSource || !reportName || !pivotConfig) {
      return res.status(400).json({ 
        success: false, 
        message: 'Data source, report name, and pivot config are required' 
      });
    }

    // Check if report name already exists for this user and data source
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM SavedReports WHERE UserId = ? AND DataSource = ? AND ReportName = ?',
      [userId, dataSource, reportName]
    );

    if (existing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'A report with this name already exists for this data source' 
      });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO SavedReports (UserId, DataSource, ReportName, PivotConfig, Filters)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        dataSource,
        reportName,
        JSON.stringify(pivotConfig),
        filters ? JSON.stringify(filters) : null
      ]
    );

    res.json({ 
      success: true, 
      message: 'Report saved successfully',
      reportId: result.insertId
    });
  } catch (error) {
    logger.error('Error creating saved report:', error);
    res.status(500).json({ success: false, message: 'Failed to save report' });
  }
});

/**
 * @swagger
 * /api/saved-reports/{id}:
 *   put:
 *     summary: Update a saved report
 *     tags: [SavedReports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reportName:
 *                 type: string
 *               pivotConfig:
 *                 type: object
 *               filters:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Saved report updated
 */
// Update a saved report
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = String(rawId || '');

    if (isSystemDefaultReportId(id)) {
      return res.status(403).json({ success: false, message: 'System default reports cannot be modified' });
    }

    const { reportName, pivotConfig, filters } = req.body;

    if (!reportName || !pivotConfig) {
      return res.status(400).json({ 
        success: false, 
        message: 'Report name and pivot config are required' 
      });
    }

    // Verify the report belongs to the user
    const [report] = await pool.execute<RowDataPacket[]>(
      'SELECT UserId FROM SavedReports WHERE Id = ?',
      [id]
    );

    if (report.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (report[0].UserId !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await pool.execute(
      `UPDATE SavedReports 
       SET ReportName = ?, PivotConfig = ?, Filters = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [
        reportName,
        JSON.stringify(pivotConfig),
        filters ? JSON.stringify(filters) : null,
        id
      ]
    );

    res.json({ success: true, message: 'Report updated successfully' });
  } catch (error) {
    logger.error('Error updating saved report:', error);
    res.status(500).json({ success: false, message: 'Failed to update report' });
  }
});

/**
 * @swagger
 * /api/saved-reports/{id}:
 *   delete:
 *     summary: Delete a saved report
 *     tags: [SavedReports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Saved report deleted
 */
// Delete a saved report
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = String(rawId || '');

    if (isSystemDefaultReportId(id)) {
      return res.status(403).json({ success: false, message: 'System default reports cannot be deleted' });
    }

    // Verify the report belongs to the user
    const [report] = await pool.execute<RowDataPacket[]>(
      'SELECT UserId FROM SavedReports WHERE Id = ?',
      [id]
    );

    if (report.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (report[0].UserId !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await pool.execute('DELETE FROM SavedReports WHERE Id = ?', [id]);

    res.json({ success: true, message: 'Report deleted successfully' });
  } catch (error) {
    logger.error('Error deleting saved report:', error);
    res.status(500).json({ success: false, message: 'Failed to delete report' });
  }
});

/**
 * @swagger
 * /api/saved-reports/{id}/share:
 *   post:
 *     summary: Share a report with users
 *     tags: [SavedReports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds]
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of user IDs to share the report with
 *     responses:
 *       200:
 *         description: Report shared successfully
 */
// Share a saved report with other users
router.post('/:id/share', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = String(rawId || '');

    if (isSystemDefaultReportId(id)) {
      return res.status(403).json({ success: false, message: 'System default reports cannot be shared' });
    }

    const { userIds } = req.body; // Array of user IDs

    // Verify the report belongs to the user
    const [report] = await pool.execute<RowDataPacket[]>(
      'SELECT UserId FROM SavedReports WHERE Id = ?',
      [id]
    );

    if (report.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (report[0].UserId !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Update SharedWith field (comma-separated user IDs)
    const sharedWith = Array.isArray(userIds) && userIds.length > 0 ? userIds.join(',') : null;

    await pool.execute(
      'UPDATE SavedReports SET SharedWith = ? WHERE Id = ?',
      [sharedWith, id]
    );

    res.json({ success: true, message: 'Report shared successfully' });
  } catch (error) {
    logger.error('Error sharing report:', error);
    res.status(500).json({ success: false, message: 'Failed to share report' });
  }
});

/**
 * @swagger
 * /api/saved-reports/{id}/toggle-public:
 *   post:
 *     summary: Toggle report public/private status
 *     tags: [SavedReports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Public status toggled
 */
// Toggle public status of a saved report
router.post('/:id/toggle-public', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = String(rawId || '');

    if (isSystemDefaultReportId(id)) {
      return res.status(403).json({ success: false, message: 'System default reports are always public' });
    }

    const { isPublic } = req.body;

    // Verify the report belongs to the user
    const [report] = await pool.execute<RowDataPacket[]>(
      'SELECT UserId FROM SavedReports WHERE Id = ?',
      [id]
    );

    if (report.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (report[0].UserId !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await pool.execute(
      'UPDATE SavedReports SET IsPublic = ? WHERE Id = ?',
      [isPublic ? 1 : 0, id]
    );

    res.json({ success: true, message: 'Report visibility updated successfully' });
  } catch (error) {
    logger.error('Error updating report visibility:', error);
    res.status(500).json({ success: false, message: 'Failed to update report visibility' });
  }
});

export default router;
