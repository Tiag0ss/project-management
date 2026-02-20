import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: CallRecords
 *   description: Call record management
 */

/**
 * @swagger
 * /api/call-records:
 *   get:
 *     summary: Get all call records
 *     tags: [CallRecords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: integer
 *         description: Filter by customer ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter up to this date
 *     responses:
 *       200:
 *         description: List of call records
 *       401:
 *         description: Unauthorized
 */
// Get all call records for current user
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { startDate, endDate } = req.query;

    let query = `
      SELECT cr.*, p.ProjectName, p.OrganizationId, o.Name as OrganizationName, t.TaskName
      FROM CallRecords cr
      LEFT JOIN Projects p ON cr.ProjectId = p.Id
      LEFT JOIN Organizations o ON p.OrganizationId = o.Id
      LEFT JOIN Tasks t ON cr.TaskId = t.Id
      WHERE cr.UserId = ?
    `;
    const params: any[] = [userId];

    if (startDate) {
      query += ' AND cr.CallDate >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND cr.CallDate <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY cr.CallDate DESC, cr.StartTime DESC';

    const [records] = await pool.execute<RowDataPacket[]>(query, params);

    res.json({
      success: true,
      data: records
    });
  } catch (error) {
    console.error('Error fetching call records:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching call records'
    });
  }
});

/**
 * @swagger
 * /api/call-records:
 *   post:
 *     summary: Create a new call record
 *     tags: [CallRecords]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerId
 *               - callDate
 *             properties:
 *               customerId:
 *                 type: integer
 *               subject:
 *                 type: string
 *               notes:
 *                 type: string
 *               duration:
 *                 type: integer
 *                 description: Duration in minutes
 *               callDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Call record created
 *       401:
 *         description: Unauthorized
 */
// Create a new call record
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const {
      callDate,
      startTime,
      durationMinutes,
      callType,
      participants,
      subject,
      notes,
      projectId,
      taskId
    } = req.body;

    if (!callDate || !startTime) {
      return res.status(400).json({
        success: false,
        message: 'Call date and start time are required'
      });
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO CallRecords 
       (UserId, CallDate, StartTime, DurationMinutes, CallType, Participants, Subject, Notes, ProjectId, TaskId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        callDate,
        startTime,
        durationMinutes || 0,
        callType || 'Teams',
        participants || null,
        subject || null,
        notes || null,
        projectId || null,
        taskId || null
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Call record created successfully',
      id: result.insertId
    });
  } catch (error) {
    console.error('Error creating call record:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating call record'
    });
  }
});

/**
 * @swagger
 * /api/call-records/{id}:
 *   put:
 *     summary: Update a call record
 *     tags: [CallRecords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Call record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               subject:
 *                 type: string
 *               notes:
 *                 type: string
 *               duration:
 *                 type: integer
 *               callDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Call record updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Call record not found
 */
// Update a call record
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const {
      callDate,
      startTime,
      durationMinutes,
      callType,
      participants,
      subject,
      notes,
      projectId,
      taskId
    } = req.body;

    // Check ownership
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM CallRecords WHERE Id = ? AND UserId = ?',
      [id, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Call record not found'
      });
    }

    await pool.execute(
      `UPDATE CallRecords SET
       CallDate = ?, StartTime = ?, DurationMinutes = ?, CallType = ?,
       Participants = ?, Subject = ?, Notes = ?, ProjectId = ?, TaskId = ?
       WHERE Id = ? AND UserId = ?`,
      [
        callDate,
        startTime,
        durationMinutes || 0,
        callType || 'Teams',
        participants || null,
        subject || null,
        notes || null,
        projectId || null,
        taskId || null,
        id,
        userId
      ]
    );

    res.json({
      success: true,
      message: 'Call record updated successfully'
    });
  } catch (error) {
    console.error('Error updating call record:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating call record'
    });
  }
});

/**
 * @swagger
 * /api/call-records/{id}:
 *   delete:
 *     summary: Delete a call record
 *     tags: [CallRecords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Call record ID
 *     responses:
 *       200:
 *         description: Call record deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Call record not found
 */
// Delete a call record
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM CallRecords WHERE Id = ? AND UserId = ?',
      [id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Call record not found'
      });
    }

    res.json({
      success: true,
      message: 'Call record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting call record:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting call record'
    });
  }
});

/**
 * @swagger
 * /api/call-records/import:
 *   post:
 *     summary: Import call records from CSV data
 *     tags: [CallRecords]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - records
 *             properties:
 *               records:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Call records imported
 *       401:
 *         description: Unauthorized
 */
// Import multiple call records (from CSV)
router.post('/import', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No records to import'
      });
    }

    let imported = 0;
    let failed = 0;

    for (const record of records) {
      try {
        await pool.execute(
          `INSERT INTO CallRecords 
           (UserId, CallDate, StartTime, DurationMinutes, CallType, Participants, Subject, Notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            record.callDate || record.CallDate || record.date,
            record.startTime || record.StartTime || record.time || '09:00',
            record.durationMinutes || record.DurationMinutes || record.duration || 0,
            record.callType || record.CallType || record.type || 'Teams',
            record.participants || record.Participants || null,
            record.subject || record.Subject || null,
            record.notes || record.Notes || null
          ]
        );
        imported++;
      } catch (err) {
        failed++;
        console.error('Failed to import record:', err);
      }
    }

    res.json({
      success: true,
      message: `Imported ${imported} records, ${failed} failed`,
      imported,
      failed
    });
  } catch (error) {
    console.error('Error importing call records:', error);
    res.status(500).json({
      success: false,
      message: 'Error importing call records'
    });
  }
});

export default router;
