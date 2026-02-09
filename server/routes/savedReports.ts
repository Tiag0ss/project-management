import express, { Response } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = express.Router();

// Get all saved reports for the current user
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const [reports] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, DataSource, ReportName, PivotConfig, Filters, CreatedAt, UpdatedAt, SharedWith, IsPublic
       FROM SavedReports
       WHERE UserId = ? OR IsPublic = 1 OR FIND_IN_SET(?, SharedWith) > 0
       ORDER BY DataSource, ReportName`,
      [userId, userId]
    );

    // Parse JSON fields
    const parsedReports = reports.map(report => ({
      ...report,
      PivotConfig: JSON.parse(report.PivotConfig),
      Filters: report.Filters ? JSON.parse(report.Filters) : [],
      SharedWith: report.SharedWith || ''
    }));

    res.json({ success: true, reports: parsedReports });
  } catch (error) {
    console.error('Error fetching saved reports:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch saved reports' });
  }
});

// Get saved reports for a specific data source
router.get('/datasource/:dataSource', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { dataSource } = req.params;

    const [reports] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, DataSource, ReportName, PivotConfig, Filters, CreatedAt, UpdatedAt, SharedWith, IsPublic
       FROM SavedReports
       WHERE (UserId = ? OR IsPublic = 1 OR FIND_IN_SET(?, SharedWith) > 0) AND DataSource = ?
       ORDER BY ReportName`,
      [userId, userId, dataSource]
    );

    // Parse JSON fields
    const parsedReports = reports.map(report => ({
      ...report,
      PivotConfig: JSON.parse(report.PivotConfig),
      Filters: report.Filters ? JSON.parse(report.Filters) : [],
      SharedWith: report.SharedWith || ''
    }));

    res.json({ success: true, reports: parsedReports });
  } catch (error) {
    console.error('Error fetching saved reports:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch saved reports' });
  }
});

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
    console.error('Error creating saved report:', error);
    res.status(500).json({ success: false, message: 'Failed to save report' });
  }
});

// Update a saved report
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
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
    console.error('Error updating saved report:', error);
    res.status(500).json({ success: false, message: 'Failed to update report' });
  }
});

// Delete a saved report
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

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
    console.error('Error deleting saved report:', error);
    res.status(500).json({ success: false, message: 'Failed to delete report' });
  }
});

// Share a saved report with other users
router.post('/:id/share', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
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
    console.error('Error sharing report:', error);
    res.status(500).json({ success: false, message: 'Failed to share report' });
  }
});

// Toggle public status of a saved report
router.post('/:id/toggle-public', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
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
    console.error('Error updating report visibility:', error);
    res.status(500).json({ success: false, message: 'Failed to update report visibility' });
  }
});

export default router;
