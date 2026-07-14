import express, { Response } from 'express';
import { pool, RowDataPacket, ResultSetHeader } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { cachedJson, ENTITY_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import { invalidateByEntity } from '../services/cacheInvalidation';
import logger from '../utils/logger';
import { resolveLeaveCalendarUserIds } from '../utils/leaveCalendarScope';

const router = express.Router();

const isAutoApproveOutOfOfficeEnabled = async (): Promise<boolean> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT SettingValue FROM SystemSettings WHERE SettingKey = ? LIMIT 1`,
    ['autoApproveOutOfOffice']
  );

  return rows.length > 0 && String(rows[0].SettingValue || '').toLowerCase() === 'true';
};

const normalizeDate = (value: unknown): string => String(value || '').split('T')[0];

const normalizeDayPortion = (value: unknown): 'full' | 'half' => {
  return String(value || '').toLowerCase() === 'half' ? 'half' : 'full';
};

const dayPortionWeight = (value: unknown): number => {
  return normalizeDayPortion(value) === 'half' ? 0.5 : 1;
};

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

const getCanApproveOutOfOffice = async (userId: number, isAdmin: boolean): Promise<boolean> => {
  if (isAdmin) return true;
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT COUNT(*) as Count FROM Users WHERE TeamLeaderId = ? AND IsActive = 1',
    [userId]
  );
  return Number(rows[0]?.Count || 0) > 0;
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

router.get('/approval-scope', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const canApprove = await getCanApproveOutOfOffice(userId, !!req.user?.isAdmin);
    res.json({ success: true, canApprove });
  } catch (error) {
    logger.error('Error checking out-of-office approval scope:', error);
    res.status(500).json({ success: false, message: 'Failed to check out-of-office approval scope' });
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
      `SELECT ooo.*,
              CONCAT(rb.FirstName, ' ', rb.LastName) as RequestedByName,
              CONCAT(ab.FirstName, ' ', ab.LastName) as ApprovedByName
       FROM UserOutOfOffice ooo
       LEFT JOIN Users rb ON ooo.RequestedBy = rb.Id
       LEFT JOIN Users ab ON ooo.ApprovedBy = ab.Id
       WHERE ooo.UserId = ? AND ooo.OutOfOfficeDate BETWEEN ? AND ?
       ORDER BY ooo.OutOfOfficeDate ASC`,
      [userId, yearStart, yearEnd]
    );

    const approvedDays = entries
      .filter((e: any) => String(e.Status).toLowerCase() === 'approved')
      .reduce((sum: number, e: any) => sum + dayPortionWeight(e.DayPortion), 0);
    const pendingDays = entries
      .filter((e: any) => String(e.Status).toLowerCase() === 'pending')
      .reduce((sum: number, e: any) => sum + dayPortionWeight(e.DayPortion), 0);
    const rejectedDays = entries
      .filter((e: any) => String(e.Status).toLowerCase() === 'rejected')
      .reduce((sum: number, e: any) => sum + dayPortionWeight(e.DayPortion), 0);

    res.json({
      success: true,
      year,
      approvedDays,
      pendingDays,
      rejectedDays,
      reservedDays: approvedDays + pendingDays,
      entries,
    });
  } catch (error) {
    logger.error('Error loading my out-of-office entries:', error);
    res.status(500).json({ success: false, message: 'Failed to load out-of-office entries' });
  }
});

router.post('/my/request', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const { startDate, endDate, notes, dayPortion } = req.body;
    const autoApproveOutOfOffice = await isAutoApproveOutOfOfficeEnabled();
    const normalizedDayPortion = normalizeDayPortion(dayPortion);

    const normalizedStart = normalizeDate(startDate);
    const normalizedEnd = normalizeDate(endDate || startDate);
    const dates = toDateRange(normalizedStart, normalizedEnd);

    if (dates.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid out-of-office date range' });
    }

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday,
              WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday
       FROM Users WHERE Id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { workingDates, nonWorkingDates } = splitWorkingAndNonWorkingDates(dates, users[0]);

    if (workingDates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Selected range contains only non-working days for this user.',
        nonWorkingDates,
      });
    }

    let created = 0;
    let skipped = 0;

    for (const date of workingDates) {
      const [existing] = await pool.execute<RowDataPacket[]>(
        `SELECT Id FROM UserOutOfOffice
         WHERE UserId = ? AND OutOfOfficeDate = ? AND LOWER(Status) IN ('pending', 'approved')`,
        [userId, date]
      );

      if (existing.length > 0) {
        skipped += 1;
        continue;
      }

      await pool.execute<ResultSetHeader>(
        `INSERT INTO UserOutOfOffice (UserId, OutOfOfficeDate, DayPortion, Status, Notes, RequestedBy, ApprovedBy, ApprovedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          date,
          normalizedDayPortion,
          autoApproveOutOfOffice ? 'approved' : 'pending',
          notes || null,
          userId,
          autoApproveOutOfOffice ? userId : null,
          autoApproveOutOfOffice ? new Date() : null,
        ]
      );
      created += 1;
    }

    await invalidateByEntity('ooo', { userId });

    res.json({
      success: true,
      message: autoApproveOutOfOffice
        ? 'Out-of-office request submitted and auto-approved'
        : 'Out-of-office request submitted',
      created,
      skipped,
      exceeded: 0,
      exceededDates: [],
      nonWorkingSkipped: nonWorkingDates.length,
      nonWorkingDates,
    });
  } catch (error) {
    logger.error('Error requesting out-of-office:', error);
    res.status(500).json({ success: false, message: 'Failed to submit out-of-office request' });
  }
});

router.get('/pending', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;
    const canApprove = await getCanApproveOutOfOffice(userId, isAdmin);

    if (!canApprove) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    let query = `SELECT ooo.*, u.Username, u.FirstName, u.LastName, u.TeamLeaderId
                 FROM UserOutOfOffice ooo
                 INNER JOIN Users u ON ooo.UserId = u.Id
                 WHERE LOWER(ooo.Status) = 'pending'`;
    const params: any[] = [];

    if (!isAdmin) {
      query += ' AND u.TeamLeaderId = ?';
      params.push(userId);
    }

    query += ' ORDER BY ooo.OutOfOfficeDate ASC';

    const [rows] = await pool.execute<RowDataPacket[]>(query, params);
    res.json({ success: true, requests: rows });
  } catch (error) {
    logger.error('Error loading pending out-of-office requests:', error);
    res.status(500).json({ success: false, message: 'Failed to load pending out-of-office requests' });
  }
});

router.get('/requests', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;
    const canApprove = await getCanApproveOutOfOffice(userId, isAdmin);

    if (!canApprove) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const year = Number(req.query.year || new Date().getFullYear());
    const status = String(req.query.status || 'all').toLowerCase();
    const filterUserId = req.query.userId ? Number(req.query.userId) : null;

    const conditions: string[] = ['ooo.OutOfOfficeDate BETWEEN ? AND ?'];
    const params: any[] = [`${year}-01-01`, `${year}-12-31`];

    if (!isAdmin) {
      conditions.push('(u.TeamLeaderId = ? OR u.Id = ?)');
      params.push(userId, userId);
    }

    if (filterUserId) {
      conditions.push('ooo.UserId = ?');
      params.push(filterUserId);
    }

    if (status !== 'all') {
      conditions.push('LOWER(ooo.Status) = ?');
      params.push(status);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ooo.*, u.Username, u.FirstName, u.LastName, u.TeamLeaderId,
              h.Id as HolidayId, h.HolidayName
       FROM UserOutOfOffice ooo
       INNER JOIN Users u ON ooo.UserId = u.Id
       LEFT JOIN Holidays h ON h.IsActive = 1
         AND h.HolidayDate = ooo.OutOfOfficeDate
         AND h.Year = YEAR(ooo.OutOfOfficeDate)
         AND h.CountryCode = COALESCE(NULLIF(u.CountryCode, ''), 'PT')
         AND (
           h.RegionCode IS NULL
           OR h.RegionCode = ''
           OR (
             u.RegionCode IS NOT NULL
             AND u.RegionCode <> ''
             AND h.RegionCode = u.RegionCode
           )
         )
       ${whereClause}
       ORDER BY ooo.OutOfOfficeDate DESC, u.Username ASC`,
      params
    );

    const requestsById = new Map<number, any>();

    rows.forEach((row) => {
      const requestId = Number(row.Id);
      if (!requestsById.has(requestId)) {
        const baseRequest: any = { ...row, HolidayConflict: false, HolidayNames: [] as string[] };
        delete baseRequest.HolidayId;
        delete baseRequest.HolidayName;
        requestsById.set(requestId, baseRequest);
      }

      const holidayName = String(row.HolidayName || '').trim();
      if (!holidayName) {
        return;
      }

      const request = requestsById.get(requestId);
      request.HolidayConflict = true;
      if (!request.HolidayNames.includes(holidayName)) {
        request.HolidayNames.push(holidayName);
      }
    });

    const requests = Array.from(requestsById.values());

    res.json({ success: true, requests, year });
  } catch (error) {
    logger.error('Error loading out-of-office requests:', error);
    res.status(500).json({ success: false, message: 'Failed to load out-of-office requests' });
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
      cacheKeys.ooo(cacheScope),
      ENTITY_TTL_SECONDS,
      async () => {
        const placeholders = uniqueEffectiveUserIds.map(() => '?').join(',');
        const [rows] = await pool.execute<RowDataPacket[]>(
          `SELECT Id, UserId, OutOfOfficeDate, COALESCE(DayPortion, 'full') as DayPortion, Status, Notes
           FROM UserOutOfOffice
           WHERE LOWER(Status) = 'approved'
             AND OutOfOfficeDate BETWEEN ? AND ?
             AND UserId IN (${placeholders})
           ORDER BY OutOfOfficeDate ASC`,
          [startDate, endDate, ...uniqueEffectiveUserIds]
        );
        return rows;
      }
    );

    res.json({ success: true, entries });
  } catch (error) {
    logger.error('Error loading out-of-office calendar entries:', error);
    res.status(500).json({ success: false, message: 'Failed to load out-of-office calendar entries' });
  }
});

router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const outOfOfficeId = Number(req.params.id);
    const currentUserId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;

    if (!Number.isInteger(outOfOfficeId) || outOfOfficeId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid out-of-office id' });
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ooo.Id, ooo.UserId
       FROM UserOutOfOffice ooo
       WHERE ooo.Id = ?`,
      [outOfOfficeId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Out-of-office entry not found' });
    }

    const targetUserId = Number(rows[0].UserId || 0);
    const canDeleteOwn = targetUserId === currentUserId;
    const canDeleteManaged = await canManageTargetUser(currentUserId, isAdmin, targetUserId);

    if (!canDeleteOwn && !canDeleteManaged) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await pool.execute('DELETE FROM UserOutOfOffice WHERE Id = ?', [outOfOfficeId]);

    await invalidateByEntity('ooo', { userId: targetUserId });

    res.json({ success: true, message: 'Out-of-office day deleted' });
  } catch (error) {
    logger.error('Error deleting out-of-office entry:', error);
    res.status(500).json({ success: false, message: 'Failed to delete out-of-office entry' });
  }
});

router.put('/:id/approval', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const outOfOfficeId = Number(req.params.id);
    const userId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;
    const { status } = req.body as { status: 'approved' | 'rejected' };

    if (!['approved', 'rejected'].includes(String(status || '').toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ooo.Id, ooo.UserId, u.TeamLeaderId
       FROM UserOutOfOffice ooo
       INNER JOIN Users u ON ooo.UserId = u.Id
       WHERE ooo.Id = ?`,
      [outOfOfficeId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Out-of-office request not found' });
    }

    const targetUserId = Number(rows[0].UserId || 0);
    const canManage = await canManageTargetUser(userId, isAdmin, targetUserId);
    if (!canManage) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await pool.execute(
      `UPDATE UserOutOfOffice
       SET Status = ?, ApprovedBy = ?, ApprovedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [String(status).toLowerCase(), userId, outOfOfficeId]
    );

    await invalidateByEntity('ooo', { userId: targetUserId });

    res.json({ success: true, message: `Out-of-office request ${status}` });
  } catch (error) {
    logger.error('Error approving out-of-office request:', error);
    res.status(500).json({ success: false, message: 'Failed to update out-of-office request' });
  }
});

router.get('/team-members', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;
    const year = Number(req.query.year || new Date().getFullYear());

    let query = `SELECT u.Id, u.Username, u.FirstName, u.LastName,
              (SELECT COALESCE(SUM(CASE WHEN LOWER(COALESCE(ooo.DayPortion, 'full')) = 'half' THEN 0.5 ELSE 1 END), 0) FROM UserOutOfOffice ooo WHERE ooo.UserId = u.Id AND YEAR(ooo.OutOfOfficeDate) = ? AND LOWER(ooo.Status) = 'approved') as ApprovedDays,
              (SELECT COALESCE(SUM(CASE WHEN LOWER(COALESCE(ooo.DayPortion, 'full')) = 'half' THEN 0.5 ELSE 1 END), 0) FROM UserOutOfOffice ooo WHERE ooo.UserId = u.Id AND YEAR(ooo.OutOfOfficeDate) = ? AND LOWER(ooo.Status) = 'pending') as PendingDays,
              (SELECT COALESCE(SUM(CASE WHEN LOWER(COALESCE(ooo.DayPortion, 'full')) = 'half' THEN 0.5 ELSE 1 END), 0) FROM UserOutOfOffice ooo WHERE ooo.UserId = u.Id AND YEAR(ooo.OutOfOfficeDate) = ? AND LOWER(ooo.Status) = 'rejected') as RejectedDays
                 FROM Users u
                 WHERE u.IsActive = 1`;
    const params: any[] = [year, year, year];

    if (!isAdmin) {
      query += ' AND u.TeamLeaderId = ?';
      params.push(userId);
    }

    query += ' ORDER BY u.Username ASC';

    const [members] = await pool.execute<RowDataPacket[]>(query, params);
    res.json({ success: true, members });
  } catch (error) {
    logger.error('Error loading team members for out-of-office:', error);
    res.status(500).json({ success: false, message: 'Failed to load team members' });
  }
});

router.post('/team-members/:userId/configure', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = Number(req.user?.userId || 0);
    const isAdmin = !!req.user?.isAdmin;
    const targetUserId = Number(req.params.userId);
    const { startDate, endDate, notes, status, dayPortion } = req.body;

    const canManage = await canManageTargetUser(currentUserId, isAdmin, targetUserId);
    if (!canManage) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const normalizedStart = normalizeDate(startDate);
    const normalizedEnd = normalizeDate(endDate || startDate);
    const dates = toDateRange(normalizedStart, normalizedEnd);
    if (dates.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid out-of-office date range' });
    }

    const normalizedStatus = ['approved', 'pending', 'rejected'].includes(String(status || '').toLowerCase())
      ? String(status).toLowerCase()
      : 'approved';
    const normalizedDayPortion = normalizeDayPortion(dayPortion);

    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT WorkHoursMonday, WorkHoursTuesday, WorkHoursWednesday, WorkHoursThursday,
              WorkHoursFriday, WorkHoursSaturday, WorkHoursSunday
       FROM Users WHERE Id = ?`,
      [targetUserId]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { workingDates, nonWorkingDates } = splitWorkingAndNonWorkingDates(dates, users[0]);
    if (workingDates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Selected range contains only non-working days for this user.',
        nonWorkingDates,
      });
    }

    let created = 0;
    let skipped = 0;

    for (const date of workingDates) {
      const [existing] = await pool.execute<RowDataPacket[]>(
        `SELECT Id FROM UserOutOfOffice
         WHERE UserId = ? AND OutOfOfficeDate = ? AND LOWER(Status) IN ('pending', 'approved')`,
        [targetUserId, date]
      );

      if (existing.length > 0) {
        skipped += 1;
        continue;
      }

      await pool.execute<ResultSetHeader>(
        `INSERT INTO UserOutOfOffice (UserId, OutOfOfficeDate, DayPortion, Status, Notes, RequestedBy, ApprovedBy, ApprovedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          targetUserId,
          date,
          normalizedDayPortion,
          normalizedStatus,
          notes || null,
          currentUserId,
          normalizedStatus === 'approved' ? currentUserId : null,
          normalizedStatus === 'approved' ? new Date() : null,
        ]
      );
      created += 1;
    }

    await invalidateByEntity('ooo', { userId: targetUserId });

    res.json({
      success: true,
      message: 'Out-of-office configuration saved',
      created,
      skipped,
      exceeded: 0,
      exceededDates: [],
      nonWorkingSkipped: nonWorkingDates.length,
      nonWorkingDates,
    });
  } catch (error) {
    logger.error('Error configuring out-of-office:', error);
    res.status(500).json({ success: false, message: 'Failed to configure out-of-office' });
  }
});

export default router;
