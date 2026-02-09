import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = express.Router();

// Helper function to log activity
export async function logActivity(
  userId: number | null,
  username: string | null,
  action: string,
  entityType: string | null = null,
  entityId: number | null = null,
  entityName: string | null = null,
  details: string | null = null,
  ipAddress: string | null = null,
  userAgent: string | null = null
): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO ActivityLogs (UserId, Username, Action, EntityType, EntityId, EntityName, Details, IpAddress, UserAgent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, username, action, entityType, entityId, entityName, details, ipAddress, userAgent]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw - logging should not break the main operation
  }
}

// Get activity logs with filters and pagination
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Check if user is admin
    const [userRows] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin FROM Users WHERE Id = ?',
      [userId]
    );

    if (!userRows.length || !userRows[0].isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
    }

    const {
      page = '1',
      limit = '50',
      action,
      entityType,
      username,
      startDate,
      endDate
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];

    if (action) {
      conditions.push('Action LIKE ?');
      params.push(`%${action}%`);
    }

    if (entityType) {
      conditions.push('EntityType = ?');
      params.push(entityType);
    }

    if (username) {
      conditions.push('Username LIKE ?');
      params.push(`%${username}%`);
    }

    if (startDate) {
      conditions.push('CreatedAt >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('CreatedAt <= ?');
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const [countResult] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM ActivityLogs ${whereClause}`,
      params
    );

    const total = countResult[0].total;

    // Get logs with LIMIT and OFFSET as integers (not bound parameters for better MySQL compatibility)
    const query = `SELECT * FROM ActivityLogs ${whereClause} ORDER BY CreatedAt DESC LIMIT ${limitNum} OFFSET ${offset}`;
    const [logs] = await pool.execute<RowDataPacket[]>(query, params);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activity logs' });
  }
});

// Get activity log statistics
router.get('/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Check if user is admin
    const [userRows] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin FROM Users WHERE Id = ?',
      [userId]
    );

    if (!userRows.length || !userRows[0].isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
    }

    // Get statistics
    const [totalCount] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM ActivityLogs'
    );

    const [todayCount] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM ActivityLogs WHERE DATE(CreatedAt) = CURDATE()'
    );

    const [weekCount] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM ActivityLogs WHERE CreatedAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)'
    );

    const [topActions] = await pool.execute<RowDataPacket[]>(
      `SELECT Action, COUNT(*) as count 
       FROM ActivityLogs 
       WHERE CreatedAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY Action 
       ORDER BY count DESC 
       LIMIT 10`
    );

    const [topUsers] = await pool.execute<RowDataPacket[]>(
      `SELECT Username, COUNT(*) as count 
       FROM ActivityLogs 
       WHERE CreatedAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND Username IS NOT NULL
       GROUP BY Username 
       ORDER BY count DESC 
       LIMIT 10`
    );

    const [recentActivity] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM ActivityLogs ORDER BY CreatedAt DESC LIMIT 10'
    );

    res.json({
      success: true,
      data: {
        totalLogs: totalCount[0].count,
        todayLogs: todayCount[0].count,
        weekLogs: weekCount[0].count,
        topActions,
        topUsers,
        recentActivity
      }
    });
  } catch (error) {
    console.error('Error fetching activity log stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activity log stats' });
  }
});

// Delete old logs (cleanup)
router.delete('/cleanup', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    // Check if user is admin
    const [userRows] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin FROM Users WHERE Id = ?',
      [userId]
    );

    if (!userRows.length || !userRows[0].isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
    }

    const { days = '90' } = req.body;

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM ActivityLogs WHERE CreatedAt < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [parseInt(days as string)]
    );

    await logActivity(
      userId ?? null,
      userRows[0].Username || null,
      'CLEANUP_LOGS',
      'ActivityLogs',
      null,
      null,
      `Deleted logs older than ${days} days (${result.affectedRows} records)`,
      null,
      null
    );

    res.json({
      success: true,
      message: `Deleted ${result.affectedRows} log entries older than ${days} days`
    });
  } catch (error) {
    console.error('Error cleaning up logs:', error);
    res.status(500).json({ success: false, message: 'Failed to cleanup logs' });
  }
});

export default router;
