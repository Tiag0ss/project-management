import express, { Response } from 'express';
import { pool, RowDataPacket, ResultSetHeader } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { cachedJson, ENTITY_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import { invalidateByEntity } from '../services/cacheInvalidation';
import { createDevSupportRequestSchema, validateRequest } from '../utils/validation';
import logger from '../utils/logger';
import { resolveLeaveCalendarUserIds } from '../utils/leaveCalendarScope';

const router = express.Router();

const normalizeDate = (value: unknown): string => String(value || '').split('T')[0];

const toDateRange = (startDate: string, endDate: string): string[] => {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  const result: string[] = [];
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return result;

  const cursor = new Date(start);
  while (cursor <= end) {
    result.push(normalizeDate(cursor.toISOString()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
};

const getWorkHoursFieldByWeekday = (weekday: number): string => {
  switch (weekday) {
    case 0:
      return 'WorkHoursSunday';
    case 1:
      return 'WorkHoursMonday';
    case 2:
      return 'WorkHoursTuesday';
    case 3:
      return 'WorkHoursWednesday';
    case 4:
      return 'WorkHoursThursday';
    case 5:
      return 'WorkHoursFriday';
    default:
      return 'WorkHoursSaturday';
  }
};

const splitWorkingAndNonWorkingDates = (dates: string[], userRow: RowDataPacket): { workingDates: string[]; nonWorkingDates: string[] } => {
  const workingDates: string[] = [];
  const nonWorkingDates: string[] = [];

  for (const date of dates) {
    const day = new Date(`${date}T12:00:00`).getDay();
    const fieldName = getWorkHoursFieldByWeekday(day);
    const hours = parseFloat(String(userRow[fieldName] ?? 0));

    if (hours > 0) {
      workingDates.push(date);
    } else {
      nonWorkingDates.push(date);
    }
  }

  return { workingDates, nonWorkingDates };
};

const canManageTargetUser = async (currentUserId: number, isAdmin: boolean, targetUserId: number): Promise<boolean> => {
  if (isAdmin) return true;
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT TeamLeaderId FROM Users WHERE Id = ?',
    [targetUserId]
  );
  if (rows.length === 0) return false;
  return Number(rows[0].TeamLeaderId || 0) === currentUserId;
};

const getCanManageTeamDevSupport = async (userId: number, isAdmin: boolean): Promise<boolean> => {
  if (isAdmin) return true;
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT COUNT(*) as Count FROM Users WHERE TeamLeaderId = ? AND IsActive = 1',
    [userId]
  );
  return Number(rows[0]?.Count || 0) > 0;
};

interface InsertDevSupportResult {
  created: number;
  skipped: number;
  nonWorkingDates: string[];
}

const insertDevSupportDays = async (
  targetUserId: number,
  createdByUserId: number,
  startDate: string,
  endDate: string,
  notes?: string | null
): Promise<InsertDevSupportResult> => {
  const normalizedStart = normalizeDate(startDate);
  const normalizedEnd = normalizeDate(endDate || startDate);
  const dates = toDateRange(normalizedStart, normalizedEnd);

  if (dates.length === 0) {
    throw new Error('INVALID_DATE_RANGE');
  }

  const [users] = await pool.execute<RowDataPacket[]>(
    `SELECT WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday,
            WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday
     FROM Users WHERE Id = ?`,
    [targetUserId]
  );

  if (users.length === 0) {
    throw new Error('USER_NOT_FOUND');
  }

  const { workingDates, nonWorkingDates } = splitWorkingAndNonWorkingDates(dates, users[0]);

  if (workingDates.length === 0) {
    const err = new Error('NON_WORKING_ONLY') as Error & { nonWorkingDates: string[] };
    err.nonWorkingDates = nonWorkingDates;
    throw err;
  }

  let created = 0;
  let skipped = 0;

  for (const date of workingDates) {
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM UserDevSupport
       WHERE UserId = ? AND DevSupportDate = ?`,
      [targetUserId, date]
    );

    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    await pool.execute<ResultSetHeader>(
      `INSERT INTO UserDevSupport (UserId, DevSupportDate, Notes, CreatedBy)
       VALUES (?, ?, ?, ?)`,
      [targetUserId, date, notes || null, createdByUserId]
    );
    created += 1;
  }

  await invalidateByEntity('devSupport', { userId: targetUserId });

  return { created, skipped, nonWorkingDates };
};

router.get('/manage-scope', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;
    const canManage = await getCanManageTeamDevSupport(userId, isAdmin);
    res.json({ success: true, canManage });
  } catch (error) {
    logger.error('Error checking dev support manage scope:', error);
    res.status(500).json({ success: false, message: 'Failed to check dev support manage scope' });
  }
});

router.get('/my', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const year = Number(req.query.year || new Date().getFullYear());
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM Users WHERE Id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const [entries] = await pool.execute<RowDataPacket[]>(
      `SELECT ds.*,
              CONCAT(cb.FirstName, ' ', cb.LastName) as CreatedByName
       FROM UserDevSupport ds
       LEFT JOIN Users cb ON ds.CreatedBy = cb.Id
       WHERE ds.UserId = ? AND ds.DevSupportDate BETWEEN ? AND ?
       ORDER BY ds.DevSupportDate ASC`,
      [userId, yearStart, yearEnd]
    );

    res.json({
      success: true,
      year,
      totalDays: entries.length,
      entries,
    });
  } catch (error) {
    logger.error('Error loading my dev support entries:', error);
    res.status(500).json({ success: false, message: 'Failed to load dev support entries' });
  }
});

router.post('/my/request', authenticateToken, validateRequest(createDevSupportRequestSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;
    const canManage = await getCanManageTeamDevSupport(userId, isAdmin);
    if (!canManage) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { startDate, endDate, notes } = req.body as {
      startDate: string;
      endDate?: string | null;
      notes?: string | null;
    };

    const result = await insertDevSupportDays(userId, userId, startDate, endDate || startDate, notes);

    res.json({
      success: true,
      message: 'Dev support days saved',
      created: result.created,
      skipped: result.skipped,
      nonWorkingSkipped: result.nonWorkingDates.length,
      nonWorkingDates: result.nonWorkingDates,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'INVALID_DATE_RANGE') {
        return res.status(400).json({ success: false, message: 'Invalid dev support date range' });
      }
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      if (error.message === 'NON_WORKING_ONLY') {
        const nonWorkingDates = (error as Error & { nonWorkingDates?: string[] }).nonWorkingDates || [];
        return res.status(400).json({
          success: false,
          message: 'Selected range contains only non-working days for this user.',
          nonWorkingDates,
        });
      }
    }
    logger.error('Error requesting dev support:', error);
    res.status(500).json({ success: false, message: 'Failed to submit dev support request' });
  }
});

router.get('/calendar', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;
    const startDate = normalizeDate(req.query.startDate);
    const endDate = normalizeDate(req.query.endDate || req.query.startDate);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
      return res.status(400).json({ success: false, message: 'Invalid date range' });
    }

    const requestedUserIds = String(req.query.userIds || '');

    const uniqueEffectiveUserIds = await resolveLeaveCalendarUserIds(
      currentUserId,
      isAdmin,
      requestedUserIds,
    );

    if (uniqueEffectiveUserIds.length === 0) {
      return res.json({ success: true, entries: [] });
    }

    const cacheScope = `viewer:${currentUserId}:admin:${isAdmin ? 1 : 0}:users:${uniqueEffectiveUserIds.sort((a, b) => a - b).join(',')}:start:${startDate}:end:${endDate}`;
    const entries = await cachedJson(
      cacheKeys.devSupport(cacheScope),
      ENTITY_TTL_SECONDS,
      async () => {
        const placeholders = uniqueEffectiveUserIds.map(() => '?').join(',');
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT Id, UserId, DevSupportDate, Notes
           FROM UserDevSupport
           WHERE DevSupportDate BETWEEN ? AND ?
             AND UserId IN (${placeholders})
           ORDER BY DevSupportDate ASC`,
          [startDate, endDate, ...uniqueEffectiveUserIds]
        );
        return rows;
      }
    );

    res.json({ success: true, entries });
  } catch (error) {
    logger.error('Error loading dev support calendar entries:', error);
    res.status(500).json({ success: false, message: 'Failed to load dev support calendar entries' });
  }
});

router.get('/team-members', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;
    const year = Number(req.query.year || new Date().getFullYear());

    const canManage = await getCanManageTeamDevSupport(userId, isAdmin);
    if (!canManage) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    let query = `SELECT u.Id, u.Username, u.FirstName, u.LastName,
              (SELECT COUNT(*) FROM UserDevSupport ds
               WHERE ds.UserId = u.Id AND YEAR(ds.DevSupportDate) = ?) as DevSupportDays
                 FROM Users u
                 WHERE u.IsActive = 1`;
    const params: number[] = [year];

    if (!isAdmin) {
      query += ' AND u.TeamLeaderId = ?';
      params.push(userId);
    }

    query += ' ORDER BY u.Username ASC';

    const [members] = await pool.execute<RowDataPacket[]>(query, params);
    res.json({ success: true, members, year });
  } catch (error) {
    logger.error('Error loading team members for dev support:', error);
    res.status(500).json({ success: false, message: 'Failed to load team members' });
  }
});

router.get('/entries', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;
    const year = Number(req.query.year || new Date().getFullYear());
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const filterUserId = req.query.userId ? Number(req.query.userId) : null;

    const canManage = await getCanManageTeamDevSupport(currentUserId, isAdmin);
    if (!canManage) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    let manageableUserIds: number[] = [];
    if (isAdmin) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT Id FROM Users WHERE IsActive = 1 ORDER BY Username ASC'
      );
      manageableUserIds = rows.map((row) => Number(row.Id));
    } else {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT Id FROM Users WHERE TeamLeaderId = ? AND IsActive = 1 ORDER BY Username ASC',
        [currentUserId]
      );
      manageableUserIds = rows.map((row) => Number(row.Id));
    }

    if (filterUserId) {
      const canManageUser = await canManageTargetUser(currentUserId, isAdmin, filterUserId);
      if (!canManageUser) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      manageableUserIds = [filterUserId];
    }

    if (manageableUserIds.length === 0) {
      return res.json({ success: true, year, entries: [] });
    }

    const placeholders = manageableUserIds.map(() => '?').join(',');
    const [entries] = await pool.execute<RowDataPacket[]>(
      `SELECT ds.*,
              u.Username, u.FirstName, u.LastName,
              CONCAT(cb.FirstName, ' ', cb.LastName) as CreatedByName
       FROM UserDevSupport ds
       INNER JOIN Users u ON ds.UserId = u.Id
       LEFT JOIN Users cb ON ds.CreatedBy = cb.Id
       WHERE ds.DevSupportDate BETWEEN ? AND ?
         AND ds.UserId IN (${placeholders})
       ORDER BY ds.DevSupportDate DESC, u.Username ASC`,
      [yearStart, yearEnd, ...manageableUserIds]
    );

    res.json({ success: true, year, entries });
  } catch (error) {
    logger.error('Error loading dev support entries:', error);
    res.status(500).json({ success: false, message: 'Failed to load dev support entries' });
  }
});

router.get('/users/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;
    const targetUserId = Number(req.params.userId);
    const year = Number(req.query.year || new Date().getFullYear());
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    const canManage = await canManageTargetUser(currentUserId, isAdmin, targetUserId);
    const isSelf = targetUserId === currentUserId;
    if (!isSelf && !canManage) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, Username, FirstName, LastName FROM Users WHERE Id = ?',
      [targetUserId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const [entries] = await pool.execute<RowDataPacket[]>(
      `SELECT ds.*,
              CONCAT(cb.FirstName, ' ', cb.LastName) as CreatedByName
       FROM UserDevSupport ds
       LEFT JOIN Users cb ON ds.CreatedBy = cb.Id
       WHERE ds.UserId = ? AND ds.DevSupportDate BETWEEN ? AND ?
       ORDER BY ds.DevSupportDate ASC`,
      [targetUserId, yearStart, yearEnd]
    );

    res.json({
      success: true,
      year,
      user: users[0],
      totalDays: entries.length,
      entries,
    });
  } catch (error) {
    logger.error('Error loading user dev support entries:', error);
    res.status(500).json({ success: false, message: 'Failed to load dev support entries' });
  }
});

router.post('/team-members/:userId/configure', authenticateToken, validateRequest(createDevSupportRequestSchema), async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;
    const targetUserId = Number(req.params.userId);
    const { startDate, endDate, notes } = req.body as {
      startDate: string;
      endDate?: string | null;
      notes?: string | null;
    };

    const canManage = await canManageTargetUser(currentUserId, isAdmin, targetUserId);
    if (!canManage) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const result = await insertDevSupportDays(
      targetUserId,
      currentUserId,
      startDate,
      endDate || startDate,
      notes
    );

    res.json({
      success: true,
      message: 'Dev support days saved',
      created: result.created,
      skipped: result.skipped,
      nonWorkingSkipped: result.nonWorkingDates.length,
      nonWorkingDates: result.nonWorkingDates,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'INVALID_DATE_RANGE') {
        return res.status(400).json({ success: false, message: 'Invalid dev support date range' });
      }
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      if (error.message === 'NON_WORKING_ONLY') {
        const nonWorkingDates = (error as Error & { nonWorkingDates?: string[] }).nonWorkingDates || [];
        return res.status(400).json({
          success: false,
          message: 'Selected range contains only non-working days for this user.',
          nonWorkingDates,
        });
      }
    }
    logger.error('Error configuring dev support:', error);
    res.status(500).json({ success: false, message: 'Failed to configure dev support' });
  }
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const devSupportId = Number(req.params.id);
    const currentUserId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;

    if (!Number.isInteger(devSupportId) || devSupportId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid dev support id' });
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ds.Id, ds.UserId
       FROM UserDevSupport ds
       WHERE ds.Id = ?`,
      [devSupportId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Dev support entry not found' });
    }

    const targetUserId = Number(rows[0].UserId || 0);
    const canDeleteOwn = targetUserId === currentUserId;
    const canDeleteManaged = await canManageTargetUser(currentUserId, isAdmin, targetUserId);

    if (!canDeleteOwn && !canDeleteManaged) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await pool.execute('DELETE FROM UserDevSupport WHERE Id = ?', [devSupportId]);

    await invalidateByEntity('devSupport', { userId: targetUserId });

    res.json({ success: true, message: 'Dev support day deleted' });
  } catch (error) {
    logger.error('Error deleting dev support entry:', error);
    res.status(500).json({ success: false, message: 'Failed to delete dev support entry' });
  }
});

export default router;
