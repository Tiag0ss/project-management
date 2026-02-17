import { Router, Response } from 'express';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

// Get all recurring allocations for a user
router.get('/user/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const [allocations] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM RecurringAllocations 
       WHERE UserId = ? 
       ORDER BY StartDate DESC, StartTime ASC`,
      [userId]
    );

    res.json({ success: true, allocations });
  } catch (error) {
    console.error('Error fetching recurring allocations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch recurring allocations' });
  }
});

// Get single recurring allocation
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [allocations] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM RecurringAllocations WHERE Id = ?`,
      [id]
    );

    if (allocations.length === 0) {
      return res.status(404).json({ success: false, message: 'Recurring allocation not found' });
    }

    res.json({ success: true, allocation: allocations[0] });
  } catch (error) {
    console.error('Error fetching recurring allocation:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch recurring allocation' });
  }
});

// Create recurring allocation and generate occurrences
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const {
      userId,
      title,
      description,
      recurrenceType,
      recurrenceInterval,
      daysOfWeek,
      startDate,
      endDate,
      startTime,
      endTime
    } = req.body;

    if (!userId || !title || !recurrenceType || !startDate || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'userId, title, recurrenceType, startDate, startTime, and endTime are required'
      });
    }

    // Validate recurrence type
    const validTypes = ['daily', 'weekly', 'monthly', 'custom_days', 'interval_days', 'interval_weeks', 'interval_months'];
    if (!validTypes.includes(recurrenceType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid recurrence type'
      });
    }

    // Calculate hours from start and end time
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    const durationMinutes = endMinutes - startMinutes;
    
    if (durationMinutes <= 0) {
      return res.status(400).json({
        success: false,
        message: 'End time must be after start time'
      });
    }

    const allocatedHours = durationMinutes / 60;

    // Insert recurring allocation
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO RecurringAllocations 
       (UserId, Title, Description, RecurrenceType, RecurrenceInterval, DaysOfWeek, StartDate, EndDate, StartTime, EndTime, IsActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [userId, title, description || null, recurrenceType, recurrenceInterval || null, daysOfWeek || null, startDate, endDate || null, startTime, endTime]
    );

    const recurringAllocationId = result.insertId;

    // Generate occurrences
    await generateOccurrences(recurringAllocationId, userId, recurrenceType, recurrenceInterval, daysOfWeek, startDate, endDate, startTime, endTime, allocatedHours);

    res.json({
      success: true,
      message: 'Recurring allocation created',
      recurringAllocationId
    });
  } catch (error) {
    console.error('Error creating recurring allocation:', error);
    res.status(500).json({ success: false, message: 'Failed to create recurring allocation' });
  }
});

// Update recurring allocation
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      recurrenceType,
      recurrenceInterval,
      daysOfWeek,
      startDate,
      endDate,
      startTime,
      endTime,
      isActive
    } = req.body;

    // Get existing allocation
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM RecurringAllocations WHERE Id = ?`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Recurring allocation not found' });
    }

    const allocation = existing[0];

    // Calculate hours from start and end time
    const [startHour, startMin] = (startTime || allocation.StartTime).split(':').map(Number);
    const [endHour, endMin] = (endTime || allocation.EndTime).split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    const durationMinutes = endMinutes - startMinutes;
    
    if (durationMinutes <= 0) {
      return res.status(400).json({
        success: false,
        message: 'End time must be after start time'
      });
    }

    const allocatedHours = durationMinutes / 60;

    // Update recurring allocation
    await pool.execute(
      `UPDATE RecurringAllocations 
       SET Title = ?, Description = ?, RecurrenceType = ?, RecurrenceInterval = ?, 
           DaysOfWeek = ?, StartDate = ?, EndDate = ?, StartTime = ?, EndTime = ?, IsActive = ?
       WHERE Id = ?`,
      [
        title || allocation.Title,
        description !== undefined ? description : allocation.Description,
        recurrenceType || allocation.RecurrenceType,
        recurrenceInterval !== undefined ? recurrenceInterval : allocation.RecurrenceInterval,
        daysOfWeek !== undefined ? daysOfWeek : allocation.DaysOfWeek,
        startDate || allocation.StartDate,
        endDate !== undefined ? endDate : allocation.EndDate,
        startTime || allocation.StartTime,
        endTime || allocation.EndTime,
        isActive !== undefined ? isActive : allocation.IsActive,
        id
      ]
    );

    // Delete old occurrences
    await pool.execute(
      `DELETE FROM RecurringAllocationOccurrences WHERE RecurringAllocationId = ?`,
      [id]
    );

    // Regenerate occurrences if active
    if (isActive !== false && allocation.IsActive !== 0) {
      await generateOccurrences(
        parseInt(String(id)),
        allocation.UserId,
        recurrenceType || allocation.RecurrenceType,
        recurrenceInterval !== undefined ? recurrenceInterval : allocation.RecurrenceInterval,
        daysOfWeek !== undefined ? daysOfWeek : allocation.DaysOfWeek,
        startDate || allocation.StartDate,
        endDate !== undefined ? endDate : allocation.EndDate,
        startTime || allocation.StartTime,
        endTime || allocation.EndTime,
        allocatedHours
      );
    }

    res.json({ success: true, message: 'Recurring allocation updated' });
  } catch (error) {
    console.error('Error updating recurring allocation:', error);
    res.status(500).json({ success: false, message: 'Failed to update recurring allocation' });
  }
});

// Delete recurring allocation
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Delete occurrences first
    await pool.execute(
      `DELETE FROM RecurringAllocationOccurrences WHERE RecurringAllocationId = ?`,
      [id]
    );

    // Delete recurring allocation
    const [result] = await pool.execute<ResultSetHeader>(
      `DELETE FROM RecurringAllocations WHERE Id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Recurring allocation not found' });
    }

    res.json({ success: true, message: 'Recurring allocation deleted' });
  } catch (error) {
    console.error('Error deleting recurring allocation:', error);
    res.status(500).json({ success: false, message: 'Failed to delete recurring allocation' });
  }
});

// Get occurrences for a user in a date range
router.get('/occurrences/user/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    let query = `
      SELECT rao.*, ra.Title, ra.Description
      FROM RecurringAllocationOccurrences rao
      INNER JOIN RecurringAllocations ra ON rao.RecurringAllocationId = ra.Id
      WHERE rao.UserId = ?
    `;
    const params: any[] = [userId];

    if (startDate) {
      query += ` AND rao.OccurrenceDate >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND rao.OccurrenceDate <= ?`;
      params.push(endDate);
    }

    query += ` ORDER BY rao.OccurrenceDate ASC, rao.StartTime ASC`;

    const [occurrences] = await pool.execute<RowDataPacket[]>(query, params);

    res.json({ success: true, occurrences });
  } catch (error) {
    console.error('Error fetching recurring allocation occurrences:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch occurrences' });
  }
});

// Helper function to generate occurrences
async function generateOccurrences(
  recurringAllocationId: number,
  userId: number,
  recurrenceType: string,
  recurrenceInterval: number | null,
  daysOfWeek: string | null,
  startDate: string,
  endDate: string | null,
  startTime: string,
  endTime: string,
  allocatedHours: number
) {
  const start = new Date(startDate + 'T12:00:00');
  const end = endDate ? new Date(endDate + 'T12:00:00') : new Date(start.getTime() + (365 * 24 * 60 * 60 * 1000)); // Default 1 year

  const occurrences: any[] = [];

  let currentDate = new Date(start);

  while (currentDate <= end) {
    let shouldInclude = false;

    switch (recurrenceType) {
      case 'daily':
        shouldInclude = true;
        break;

      case 'weekly':
        // Every week on the same day of week as start date
        if (currentDate.getDay() === start.getDay()) {
          shouldInclude = true;
        }
        break;

      case 'custom_days':
        // Specific days of week (comma-separated: "0,2,4" for Sun,Tue,Thu)
        if (daysOfWeek) {
          const days = daysOfWeek.split(',').map(d => parseInt(d.trim()));
          if (days.includes(currentDate.getDay())) {
            shouldInclude = true;
          }
        }
        break;

      case 'interval_days':
        // Every X days
        if (recurrenceInterval) {
          const daysDiff = Math.floor((currentDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
          if (daysDiff % recurrenceInterval === 0) {
            shouldInclude = true;
          }
        }
        break;

      case 'interval_weeks':
        // Every X weeks on the same day of week
        if (recurrenceInterval && currentDate.getDay() === start.getDay()) {
          const weeksDiff = Math.floor((currentDate.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000));
          if (weeksDiff % recurrenceInterval === 0) {
            shouldInclude = true;
          }
        }
        break;

      case 'interval_months':
        // Every X months on the same day of month
        if (recurrenceInterval && currentDate.getDate() === start.getDate()) {
          const monthsDiff = (currentDate.getFullYear() - start.getFullYear()) * 12 + (currentDate.getMonth() - start.getMonth());
          if (monthsDiff % recurrenceInterval === 0) {
            shouldInclude = true;
          }
        }
        break;

      case 'monthly':
        // Every month on the same day
        if (currentDate.getDate() === start.getDate()) {
          shouldInclude = true;
        }
        break;
    }

    if (shouldInclude) {
      const dateStr = currentDate.toISOString().split('T')[0];
      occurrences.push([recurringAllocationId, userId, dateStr, startTime, endTime, allocatedHours]);
    }

    // Advance to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Batch insert occurrences
  if (occurrences.length > 0) {
    const values = occurrences.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const flatParams = occurrences.flat();

    await pool.execute(
      `INSERT INTO RecurringAllocationOccurrences 
       (RecurringAllocationId, UserId, OccurrenceDate, StartTime, EndTime, AllocatedHours)
       VALUES ${values}`,
      flatParams
    );
  }
}

export default router;
