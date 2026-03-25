import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { prepareCustomFieldData } from '../utils/customFields';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { decrypt } from '../utils/encryption';

const router = Router();

const toDateKey = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toTimeKey = (value: Date): string => {
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  const seconds = String(value.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

const cleanString = (value: unknown): string => String(value || '').trim();

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
      SELECT cr.*, p.ProjectName, COALESCE(cr.OrganizationId, p.OrganizationId) as OrganizationId, o.Name as OrganizationName, t.TaskName
      FROM CallRecords cr
      LEFT JOIN Projects p ON cr.ProjectId = p.Id
      LEFT JOIN Organizations o ON COALESCE(cr.OrganizationId, p.OrganizationId) = o.Id
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
      organizationId,
      projectId,
      taskId,
      customFields,
    } = req.body;

    if (!callDate || !startTime) {
      return res.status(400).json({
        success: false,
        message: 'Call date and start time are required'
      });
    }

    const customFieldData = await prepareCustomFieldData('CallRecords', customFields);


    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO CallRecords 
       (UserId, CallDate, StartTime, DurationMinutes, CallType, Participants, Subject, Notes, OrganizationId, ProjectId, TaskId${customFieldData.insertColumns.length > 0 ? `, ${customFieldData.insertColumns.join(', ')}` : ''})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${customFieldData.insertPlaceholders.length > 0 ? `, ${customFieldData.insertPlaceholders.join(', ')}` : ''})`,
      [
        userId,
        callDate,
        startTime,
        durationMinutes || 0,
        callType || 'Teams',
        participants || null,
        subject || null,
        notes || null,
        organizationId || null,
        projectId || null,
        taskId || null,
        ...customFieldData.insertValues
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
      organizationId,
      projectId,
      taskId,
      customFields,
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

    const customFieldData = await prepareCustomFieldData('CallRecords', customFields, existing[0] as Record<string, unknown>);

    await pool.execute(
      `UPDATE CallRecords SET
       CallDate = ?, StartTime = ?, DurationMinutes = ?, CallType = ?,
       Participants = ?, Subject = ?, Notes = ?, OrganizationId = ?, ProjectId = ?, TaskId = ?${customFieldData.updateAssignments.length > 0 ? `, ${customFieldData.updateAssignments.join(', ')}` : ''}
       WHERE Id = ? AND UserId = ?`,
      [
        callDate,
        startTime,
        durationMinutes || 0,
        callType || 'Teams',
        participants || null,
        subject || null,
        notes || null,
        organizationId || null,
        projectId || null,
        taskId || null,
        ...customFieldData.updateValues,
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

// Import recent Teams call records for current user (dedup-safe)
router.post('/import/teams-recent', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { periodType, startDate, endDate } = req.body || {};

    const now = new Date();
    let computedStart = new Date(now);
    let computedEnd = new Date(now);
    computedEnd.setHours(23, 59, 59, 999);

    if (periodType === 'custom') {
      const customStart = cleanString(startDate);
      const customEnd = cleanString(endDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)) {
        return res.status(400).json({ success: false, message: 'Custom period requires valid startDate and endDate (YYYY-MM-DD).' });
      }
      computedStart = new Date(`${customStart}T00:00:00`);
      computedEnd = new Date(`${customEnd}T23:59:59`);
      if (computedEnd < computedStart) {
        return res.status(400).json({ success: false, message: 'End date must be after or equal to start date.' });
      }
    } else {
      const periodMap: Record<string, number> = {
        '7d': 7,
        '30d': 30,
        '90d': 90,
      };
      const days = periodMap[String(periodType || '30d')] || 30;
      computedStart = new Date(now);
      computedStart.setDate(computedStart.getDate() - (days - 1));
      computedStart.setHours(0, 0, 0, 0);
    }

    const [settingsRows] = await pool.execute<RowDataPacket[]>(
      `SELECT SettingKey, SettingValue
       FROM SystemSettings
       WHERE SettingKey IN (?, ?, ?)` ,
      ['outlookTenantId', 'outlookClientId', 'outlookClientSecret']
    );

    const settingsMap = new Map<string, string>();
    settingsRows.forEach((row) => settingsMap.set(String(row.SettingKey), String(row.SettingValue || '')));

    const tenantId = cleanString(decrypt(settingsMap.get('outlookTenantId') || ''));
    const clientId = cleanString(decrypt(settingsMap.get('outlookClientId') || ''));
    const encryptedSecret = cleanString(settingsMap.get('outlookClientSecret'));
    const clientSecret = cleanString(decrypt(encryptedSecret));

    if (!tenantId || !clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        message: 'Outlook/Azure integration is not configured. Please set Tenant ID, Client ID and Client Secret in System Settings.',
      });
    }

    const [userRows] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, Email, Username, FirstName, LastName
       FROM Users
       WHERE Id = ?`,
      [userId]
    );

    if (!userRows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const currentUser = userRows[0];
    const currentUserEmail = cleanString(currentUser.Email).toLowerCase();
    if (!currentUserEmail) {
      return res.status(400).json({ success: false, message: 'Current user does not have an email configured.' });
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    });

    const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const bodyText = await tokenResponse.text();
      return res.status(502).json({
        success: false,
        message: 'Failed to authenticate with Microsoft Graph.',
        details: bodyText,
      });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = cleanString(tokenData.access_token);
    if (!accessToken) {
      return res.status(502).json({ success: false, message: 'Microsoft Graph access token was not returned.' });
    }

    const graphUrl = new URL('https://graph.microsoft.com/v1.0/communications/callRecords');
    graphUrl.searchParams.set('$top', '200');
    graphUrl.searchParams.set(
      '$filter',
      `startDateTime ge ${computedStart.toISOString()} and startDateTime le ${computedEnd.toISOString()}`
    );

    const recordsResponse = await fetch(graphUrl.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!recordsResponse.ok) {
      const bodyText = await recordsResponse.text();
      return res.status(502).json({
        success: false,
        message: 'Failed to fetch Teams call records from Microsoft Graph.',
        details: bodyText,
      });
    }

    const recordsData = await recordsResponse.json();
    const records = Array.isArray(recordsData.value) ? recordsData.value : [];

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const callRecord of records) {
      try {
        const externalCallId = cleanString(callRecord?.id);
        const startDateTime = cleanString(callRecord?.startDateTime);
        const endDateTime = cleanString(callRecord?.endDateTime);
        if (!externalCallId || !startDateTime) {
          skipped++;
          continue;
        }

        const organizerEmail = cleanString(callRecord?.organizer?.user?.id || callRecord?.organizer?.user?.email).toLowerCase();

        const participantsRaw = Array.isArray(callRecord?.participants_v2)
          ? callRecord.participants_v2
          : Array.isArray(callRecord?.participants)
          ? callRecord.participants
          : [];

        const participantEmails = participantsRaw
          .map((participant: any) => cleanString(participant?.identity?.user?.id || participant?.identity?.user?.email || participant?.userId).toLowerCase())
          .filter((email: string) => !!email);

        const participantNames = participantsRaw
          .map((participant: any) => cleanString(participant?.identity?.user?.displayName || participant?.displayName))
          .filter((name: string) => !!name);

        const involved = organizerEmail === currentUserEmail || participantEmails.includes(currentUserEmail);
        if (!involved) {
          skipped++;
          continue;
        }

        const start = new Date(startDateTime);
        if (Number.isNaN(start.getTime())) {
          skipped++;
          continue;
        }

        const end = endDateTime ? new Date(endDateTime) : null;
        const durationMinutes = end && !Number.isNaN(end.getTime())
          ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
          : 0;

        const callDate = toDateKey(start);
        const startTime = toTimeKey(start);
        const participants = participantNames.join(', ') || null;
        const subject = cleanString(callRecord?.type || 'Teams Call') || 'Teams Call';

        const [existingByExternal] = await pool.execute<RowDataPacket[]>(
          `SELECT Id
           FROM CallRecords
           WHERE UserId = ? AND ExternalSource = ? AND ExternalCallId = ?
           LIMIT 1`,
          [userId, 'teams', externalCallId]
        );

        if (existingByExternal.length > 0) {
          skipped++;
          continue;
        }

        const [existingByNatural] = await pool.execute<RowDataPacket[]>(
          `SELECT Id
           FROM CallRecords
           WHERE UserId = ?
             AND CallDate = ?
             AND StartTime = ?
             AND COALESCE(DurationMinutes, 0) = ?
             AND COALESCE(CallType, '') = ?
             AND COALESCE(Subject, '') = ?
           LIMIT 1`,
          [userId, callDate, startTime, durationMinutes, 'Teams', subject]
        );

        if (existingByNatural.length > 0) {
          skipped++;
          continue;
        }

        await pool.execute(
          `INSERT INTO CallRecords
           (UserId, CallDate, StartTime, DurationMinutes, CallType, Participants, Subject, Notes, ExternalSource, ExternalCallId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            callDate,
            startTime,
            durationMinutes,
            'Teams',
            participants,
            subject,
            'Imported from Teams',
            'teams',
            externalCallId,
          ]
        );

        imported++;
      } catch (error) {
        failed++;
        console.error('Failed to import Teams call record:', error);
      }
    }

    return res.json({
      success: true,
      message: `Teams import completed. Imported ${imported}, skipped ${skipped}, failed ${failed}.`,
      imported,
      skipped,
      failed,
      period: {
        startDate: toDateKey(computedStart),
        endDate: toDateKey(computedEnd),
      },
    });
  } catch (error) {
    console.error('Error importing Teams recent calls:', error);
    return res.status(500).json({
      success: false,
      message: 'Error importing Teams recent calls',
    });
  }
});

export default router;
