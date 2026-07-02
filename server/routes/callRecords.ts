import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { prepareCustomFieldData } from '../utils/customFields';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { decrypt } from '../utils/encryption';
import { cachedJson, ENTITY_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import { invalidateByEntity } from '../services/cacheInvalidation';

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

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isGuidLike = (value: string): boolean => GUID_REGEX.test(value.trim());
const MACHINE_LIKE_NAME_REGEX = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/;
const isMachineLikeName = (value: string): boolean => MACHINE_LIKE_NAME_REGEX.test(value.trim());

const pushIdentity = (aadIds: Set<string>, names: Set<string>, identityLike: any): void => {
  const identity = identityLike?.identity || identityLike;
  const user = identity?.user || identityLike?.user;
  const associatedIdentity = identityLike?.associatedIdentity;
  const phone = identity?.phone || identityLike?.phone;
  const spoolUser = identity?.spoolUser || identityLike?.spoolUser;
  const acsUser = identity?.acsUser || identityLike?.acsUser;
  const applicationInstance = identity?.applicationInstance || identityLike?.applicationInstance;
  const device = identity?.device || identityLike?.device;
  const isSystemIdentity = !!(applicationInstance || device || spoolUser || acsUser);

  const aadId = cleanString(
    user?.id ||
    associatedIdentity?.id ||
    phone?.id ||
    spoolUser?.id ||
    acsUser?.id ||
    identityLike?.userId ||
    identityLike?.id
  ).toLowerCase();

  const name = cleanString(
    user?.displayName ||
    associatedIdentity?.displayName ||
    phone?.displayName ||
    spoolUser?.displayName ||
    acsUser?.displayName ||
    identityLike?.displayName ||
    identityLike?.name
  );

  if (aadId) aadIds.add(aadId);
  if (name && !isGuidLike(name) && !isMachineLikeName(name) && !isSystemIdentity) names.add(name);
};

const extractParticipants = (record: any): { aadIds: string[]; names: string[] } => {
  const aadIds = new Set<string>();
  const names = new Set<string>();

  if (record?.organizer_v2) {
    pushIdentity(aadIds, names, record.organizer_v2);
  }

  if (record?.organizer?.user) {
    pushIdentity(aadIds, names, record.organizer.user);
  }

  const participantsRoot = Array.isArray(record?.participants_v2)
    ? record.participants_v2
    : Array.isArray(record?.participants)
    ? record.participants
    : [];
  participantsRoot.forEach((p: any) => pushIdentity(aadIds, names, p));

  const sessions = Array.isArray(record?.sessions) ? record.sessions : [];
  sessions.forEach((session: any) => {
    if (session?.caller) pushIdentity(aadIds, names, session.caller);
    if (session?.callee) pushIdentity(aadIds, names, session.callee);

    const sessionParticipants = Array.isArray(session?.participants_v2)
      ? session.participants_v2
      : Array.isArray(session?.participants)
      ? session.participants
      : [];
    sessionParticipants.forEach((p: any) => pushIdentity(aadIds, names, p));

    const segments = Array.isArray(session?.segments) ? session.segments : [];
    segments.forEach((segment: any) => {
      if (segment?.caller) pushIdentity(aadIds, names, segment.caller);
      if (segment?.callee) pushIdentity(aadIds, names, segment.callee);
    });
  });

  return { aadIds: Array.from(aadIds), names: Array.from(names) };
};

const getExplicitTeamsSubject = (record: any): string => cleanString(
  record?.subject ||
  record?.title ||
  record?.meetingInfo?.subject ||
  record?.meetingInfo?.displayName ||
  record?.meetingSubject ||
  record?.callInfo?.subject
);

const escapeODataString = (value: string): string => value.replace(/'/g, "''");

const getCallRecordOrganizerAadId = (record: any): string => cleanString(
  record?.organizer_v2?.identity?.user?.id ||
  record?.organizer_v2?.user?.id ||
  record?.organizer?.user?.id
).toLowerCase();

/**
 * Teams meeting titles live on onlineMeeting.subject, not on callRecord.
 * Resolve via joinWebUrl (see Microsoft Graph callRecord.joinWebUrl).
 */
const resolveOnlineMeetingSubjectByJoinWebUrl = async (
  accessToken: string,
  joinWebUrl: string,
  graphUserIds: string[],
  cache: Map<string, string>
): Promise<string> => {
  const normalizedUrl = cleanString(joinWebUrl);
  if (!normalizedUrl) return '';

  if (cache.has(normalizedUrl)) {
    return cache.get(normalizedUrl) || '';
  }

  const filterValue = escapeODataString(normalizedUrl);
  const uniqueUserIds = Array.from(
    new Set(graphUserIds.map((id) => cleanString(id).toLowerCase()).filter(Boolean))
  );

  for (const graphUserId of uniqueUserIds) {
    const requestUrl =
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(graphUserId)}/onlineMeetings` +
      `?$filter=${encodeURIComponent(`joinWebUrl eq '${filterValue}'`)}` +
      '&$select=subject&$top=1';

    try {
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        continue;
      }

      const data: any = await response.json();
      const subject = cleanString(Array.isArray(data?.value) ? data.value[0]?.subject : '');
      if (subject) {
        cache.set(normalizedUrl, subject);
        return subject;
      }
    } catch {
      // try next user scope
    }
  }

  cache.set(normalizedUrl, '');
  return '';
};

const getTeamsSubject = (
  record: any,
  participantNames: string[],
  currentUserAadId?: string,
  resolvedMeetingSubject?: string
): string => {
  const explicitSubject = getExplicitTeamsSubject(record) || cleanString(resolvedMeetingSubject);
  if (explicitSubject) return explicitSubject;

  const recordType = cleanString(record?.type).toLowerCase();
  const organizerName = cleanString(record?.organizer_v2?.identity?.user?.displayName || record?.organizer?.user?.displayName);
  const participantCount = participantNames.length;

  if (recordType === 'groupcall') {
    if (participantCount > 0) {
      const others = participantNames.filter((name) => !!name);
      const shownNames = others.slice(0, 3).join(', ');
      if (participantCount > 3) {
        return `Group call with ${shownNames} +${participantCount - 3} more`;
      }
      return `Group call with ${shownNames}`;
    }
    if (organizerName) {
      return `Group call by ${organizerName}`;
    }
    return 'Teams Group Call';
  }

  if (recordType === 'peertopeer') {
    if (participantCount > 0) {
      return `Call with ${participantNames[0]}`;
    }
    if (organizerName) {
      return `Call by ${organizerName}`;
    }
    return 'Teams Call';
  }

  if (participantNames.length > 0) {
    const maxNames = participantNames.slice(0, 3).join(', ');
    return `Call with ${maxNames}`;
  }

  if (organizerName) {
    return `Call by ${organizerName}`;
  }

  return 'Teams Call';
};

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
    const cacheScope = `user:${userId}:start:${String(startDate || 'all')}:end:${String(endDate || 'all')}`;

    const records = await cachedJson(
      cacheKeys.callRecords(cacheScope),
      ENTITY_TTL_SECONDS,
      async () => {
        let query = `
                      SELECT cr.*, p.ProjectName, COALESCE(cr.OrganizationId, p.OrganizationId) as OrganizationId, o.Name as OrganizationName, t.TaskName, t.JiraIssueKey,
                 COALESCE(tc.ExternalName, tc.Name, pc.ExternalName, pc.Name) as CustomerName
          FROM CallRecords cr
          LEFT JOIN Tasks t ON cr.TaskId = t.Id
                LEFT JOIN Projects p ON COALESCE(t.ProjectId, cr.ProjectId) = p.Id
          LEFT JOIN Organizations o ON COALESCE(cr.OrganizationId, p.OrganizationId) = o.Id
          LEFT JOIN Customers tc ON t.CustomerId = tc.Id
          LEFT JOIN Customers pc ON p.CustomerId = pc.Id
          WHERE cr.UserId = ?
        `;
        const params: Array<string | number> = [userId as number];

        if (startDate) {
          query += ' AND cr.CallDate >= ?';
          params.push(String(startDate));
        }
        if (endDate) {
          query += ' AND cr.CallDate <= ?';
          params.push(String(endDate));
        }

        query += ' ORDER BY cr.CallDate DESC, cr.StartTime DESC';

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);
        return rows;
      }
    );

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

    await invalidateByEntity('callRecord', {
      orgId: organizationId || undefined,
      projectId: projectId || undefined,
      userId: Number(userId),
    });

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
      `SELECT cr.Id, cr.OrganizationId, cr.ProjectId
       FROM CallRecords cr
       WHERE cr.Id = ? AND cr.UserId = ?`,
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

    await invalidateByEntity('callRecord', {
      orgId: organizationId || existing[0].OrganizationId || undefined,
      projectId: projectId || existing[0].ProjectId || undefined,
      userId: Number(userId),
    });

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

    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT OrganizationId, ProjectId FROM CallRecords WHERE Id = ? AND UserId = ?`,
      [id, userId]
    );

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

    if (existing.length > 0) {
      await invalidateByEntity('callRecord', {
        orgId: existing[0].OrganizationId || undefined,
        projectId: existing[0].ProjectId || undefined,
        userId: Number(userId),
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

    await invalidateByEntity('callRecord', { userId: Number(req.user?.userId) });

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
    // Subtract a safety buffer from "now" to absorb clock skew between the Docker container
    // and Microsoft Graph servers. Graph rejects any endDateTime that is "in the future"
    // relative to its own clock, so we pull the upper bound back by 5 minutes.
    const clockSkewBufferMs = 5 * 60 * 1000;
    const safeNow = new Date(now.getTime() - clockSkewBufferMs);
    let computedStart = new Date(safeNow);
    let computedEnd = new Date(safeNow);

    // The Graph /communications/callRecords API only allows filtering within the last 30 days.
    // Use a 29-day lookback to leave a safety buffer below the strict 30-day boundary.
    const maxLookbackMs = 29 * 24 * 60 * 60 * 1000;
    const earliestAllowed = new Date(now.getTime() - maxLookbackMs);

    if (periodType === 'custom') {
      const customStart = cleanString(startDate);
      const customEnd = cleanString(endDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(customStart) || !/^\d{4}-\d{2}-\d{2}$/.test(customEnd)) {
        return res.status(400).json({ success: false, message: 'Custom period requires valid startDate and endDate (YYYY-MM-DD).' });
      }
      computedStart = new Date(`${customStart}T00:00:00`);
      computedEnd = new Date(`${customEnd}T23:59:59`);
      // Never send a future timestamp to Graph (use safeNow which already includes clock-skew buffer)
      if (computedEnd > safeNow) {
        computedEnd = new Date(safeNow);
      }
      if (computedEnd < computedStart) {
        return res.status(400).json({ success: false, message: 'End date must be after or equal to start date.' });
      }
      // Clamp to Graph API 30-day limit
      if (computedStart < earliestAllowed) {
        computedStart = earliestAllowed;
      }
    } else {
      const periodMap: Record<string, number> = {
        '7d': 7,
        '30d': 30,
      };
      const days = Math.min(periodMap[String(periodType || '30d')] || 30, 30);
      // Compute start as exactly N*24h ago from safeNow (already buffered for clock skew),
      // then clamp to the Graph 30-day boundary as an extra safety check.
      computedStart = new Date(safeNow.getTime() - days * 24 * 60 * 60 * 1000);
      if (computedStart < earliestAllowed) {
        computedStart = earliestAllowed;
      }
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
      `SELECT Id, Email, Username, FirstName, LastName, AzureAdObjectId
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

    const expandPagedParticipants = async (record: any): Promise<any> => {
      const mergedParticipants = Array.isArray(record?.participants_v2) ? [...record.participants_v2] : [];
      let nextParticipantsUrl = typeof record?.['participants_v2@odata.nextLink'] === 'string'
        ? record['participants_v2@odata.nextLink']
        : null;

      while (nextParticipantsUrl) {
        const participantsResp = await fetch(nextParticipantsUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!participantsResp.ok) {
          break;
        }

        const participantsData: any = await participantsResp.json();
        const pageItems = Array.isArray(participantsData?.value) ? participantsData.value : [];
        mergedParticipants.push(...pageItems);
        nextParticipantsUrl = typeof participantsData?.['@odata.nextLink'] === 'string'
          ? participantsData['@odata.nextLink']
          : null;
      }

      return {
        ...record,
        participants_v2: mergedParticipants,
      };
    };

    const expandPagedSessions = async (record: any): Promise<any> => {
      const mergedSessions = Array.isArray(record?.sessions) ? [...record.sessions] : [];
      let nextSessionsUrl = typeof record?.['sessions@odata.nextLink'] === 'string'
        ? record['sessions@odata.nextLink']
        : null;

      while (nextSessionsUrl) {
        const sessionsResp = await fetch(nextSessionsUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!sessionsResp.ok) {
          break;
        }

        const sessionsData: any = await sessionsResp.json();
        const pageItems = Array.isArray(sessionsData?.value) ? sessionsData.value : [];
        mergedSessions.push(...pageItems);
        nextSessionsUrl = typeof sessionsData?.['@odata.nextLink'] === 'string'
          ? sessionsData['@odata.nextLink']
          : null;
      }

      return {
        ...record,
        sessions: mergedSessions,
      };
    };

    // Resolve the current user's Azure AD object id. Call records identify participants by
    // AAD GUID (identity.user.id), NOT by email, so we cannot match against the email alone.
    // Prefer the value stored on the user profile (no Graph permission required). If absent,
    // try to look it up via Graph (requires User.ReadBasic.All or User.Read.All app permission).
    let currentUserAadId = cleanString(currentUser.AzureAdObjectId).toLowerCase();
    let userLookupError = '';

    if (!currentUserAadId) {
      const tryFetchUserId = async (url: string): Promise<string> => {
        try {
          const resp = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } });
          if (resp.ok) {
            const data: any = await resp.json();
            if (Array.isArray(data?.value) && data.value.length > 0) {
              return cleanString(data.value[0]?.id).toLowerCase();
            }
            return cleanString(data?.id).toLowerCase();
          }
          const body = await resp.text();
          userLookupError = `${resp.status} ${body.slice(0, 300)}`;
          return '';
        } catch (err: any) {
          userLookupError = String(err?.message || err);
          return '';
        }
      };

      currentUserAadId = await tryFetchUserId(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(currentUserEmail)}?$select=id`
      );
      if (!currentUserAadId) {
        currentUserAadId = await tryFetchUserId(
          `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(`mail eq '${currentUserEmail}'`)}&$select=id&$top=1`
        );
      }
      if (!currentUserAadId) {
        currentUserAadId = await tryFetchUserId(
          `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(`userPrincipalName eq '${currentUserEmail}'`)}&$select=id&$top=1`
        );
      }
      if (!currentUserAadId) {
        currentUserAadId = await tryFetchUserId(
          `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(`proxyAddresses/any(p:p eq 'SMTP:${currentUserEmail}')`)}&$select=id&$top=1`
        );
      }

      // Persist successful lookup so subsequent imports skip the Graph call entirely.
      if (currentUserAadId) {
        try {
          await pool.execute(
            `UPDATE Users SET AzureAdObjectId = ? WHERE Id = ?`,
            [currentUserAadId, userId]
          );
        } catch {
          // non-fatal
        }
      }
    }

    if (!currentUserAadId) {
      return res.status(400).json({
        success: false,
        message: `Unable to resolve Azure AD user id for ${currentUserEmail}. Set the AzureAdObjectId on your user profile (you can find your "oid" at https://myaccount.microsoft.com → Profile → Show JSON), or have an admin grant User.ReadBasic.All application permission to the app registration.`,
        details: userLookupError || 'No matching user found in Azure AD via UPN, mail, or proxyAddresses lookup.',
      });
    }

    // Filter by participant id at the Graph level so we fetch only the current user's calls.
    const firstUrl = new URL('https://graph.microsoft.com/v1.0/communications/callRecords');
    firstUrl.searchParams.set(
      '$filter',
      `startDateTime ge ${computedStart.toISOString()} and startDateTime lt ${computedEnd.toISOString()} and participants_v2/any(p:p/id eq '${currentUserAadId}')`
    );

    const records: any[] = [];
    let nextUrl: string | null = firstUrl.toString();
    const MAX_PAGES = 20; // safety cap
    let pagesFetched = 0;

    while (nextUrl && pagesFetched < MAX_PAGES) {
      const recordsResponse: Awaited<ReturnType<typeof fetch>> = await fetch(nextUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'odata.maxpagesize=130',
        },
      });

      if (!recordsResponse.ok) {
        const bodyText = await recordsResponse.text();
        return res.status(502).json({
          success: false,
          message: 'Failed to fetch Teams call records from Microsoft Graph.',
          details: bodyText,
        });
      }

      const recordsData: any = await recordsResponse.json();
      const pageRecords = Array.isArray(recordsData.value) ? recordsData.value : [];
      records.push(...pageRecords);
      nextUrl = typeof recordsData['@odata.nextLink'] === 'string' ? recordsData['@odata.nextLink'] : null;
      pagesFetched++;
    }

    let imported = 0;
    let skipped = 0;
    let failed = 0;
    let detailFetches = 0;
    let sessionsFetches = 0;
    let detailFetchFailures = 0;
    let sessionsFetchFailures = 0;
    const detailFetchSamples: Array<{ id: string; status: number; body: string }> = [];
    const sessionsFetchSamples: Array<{ id: string; status: number; body: string }> = [];
    const skipReasons: Record<string, number> = {
      invalidPayload: 0,
      notInvolved: 0,
      invalidStartDate: 0,
      duplicateExternal: 0,
      duplicateNatural: 0,
    };
    const meetingSubjectCache = new Map<string, string>();
    let meetingSubjectLookups = 0;
    let meetingSubjectHits = 0;
    const currentUserDisplayName = cleanString(
      [currentUser.FirstName, currentUser.LastName].filter(Boolean).join(' ') || currentUser.Username
    ).toLowerCase();

    const makeNaturalKey = (callDate: string, startTime: string, durationMinutes: number, subject: string): string =>
      `${callDate}|${startTime}|${durationMinutes}|Teams|${subject}`;

    const existingExternalIds = new Set<string>();
    const existingNaturalKeys = new Set<string>();
    const [existingRows] = await pool.execute<RowDataPacket[]>(
      `SELECT ExternalCallId, CallDate, StartTime, COALESCE(DurationMinutes, 0) AS DurationMinutes, COALESCE(Subject, '') AS Subject
       FROM CallRecords
       WHERE UserId = ?
         AND ExternalSource = ?
         AND CallDate >= ?
         AND CallDate <= ?`,
      [userId, 'teams', toDateKey(computedStart), toDateKey(computedEnd)]
    );

    existingRows.forEach((row) => {
      const externalId = cleanString(row.ExternalCallId);
      if (externalId) {
        existingExternalIds.add(externalId);
      }
      const callDate = cleanString(row.CallDate);
      const startTime = cleanString(row.StartTime);
      const durationMinutes = Number(row.DurationMinutes || 0);
      const subject = cleanString(row.Subject);
      if (callDate && startTime) {
        existingNaturalKeys.add(makeNaturalKey(callDate, startTime, durationMinutes, subject));
      }
    });

    for (const callRecord of records) {
      try {
        const externalCallId = cleanString(callRecord?.id);
        let startDateTime = cleanString(callRecord?.startDateTime);
        let endDateTime = cleanString(callRecord?.endDateTime);
        if (!externalCallId || !startDateTime) {
          skipReasons.invalidPayload++;
          skipped++;
          continue;
        }

        let sourceRecord = callRecord;
        let extracted = extractParticipants(sourceRecord);

        // The list endpoint of /communications/callRecords does NOT include the participants_v2
        // relationship, so we must always fetch the detail with $expand. Microsoft Graph allows
        // only ONE $expand at a time on this endpoint, so we expand participants_v2 (sessions
        // would need a separate call).
        const detailResp = await fetch(
          `https://graph.microsoft.com/v1.0/communications/callRecords/${encodeURIComponent(externalCallId)}?$expand=participants_v2`,
          { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } }
        );
        detailFetches++;
        if (detailResp.ok) {
          sourceRecord = await detailResp.json();
          sourceRecord = await expandPagedParticipants(sourceRecord);
        } else {
          detailFetchFailures++;
          const failBody = await detailResp.text().catch(() => '');
          if (detailFetchSamples.length < 3) {
            detailFetchSamples.push({ id: externalCallId, status: detailResp.status, body: failBody.slice(0, 500) });
          }
          console.error('Teams call detail fetch failed', externalCallId, detailResp.status, failBody.slice(0, 500));
        }

        // Graph only allows a single $expand item on this endpoint. Fetch sessions/segments
        // in a second call and merge into the same source record before extraction/subject logic.
        const sessionsResp = await fetch(
          `https://graph.microsoft.com/v1.0/communications/callRecords/${encodeURIComponent(externalCallId)}?$expand=sessions($expand=segments)`,
          { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } }
        );
        sessionsFetches++;
        if (sessionsResp.ok) {
          const sessionsRecord = await sessionsResp.json();
          const expandedSessionsRecord = await expandPagedSessions(sessionsRecord);
          sourceRecord = {
            ...sourceRecord,
            sessions: Array.isArray(expandedSessionsRecord?.sessions)
              ? expandedSessionsRecord.sessions
              : sourceRecord?.sessions,
          };
        } else {
          sessionsFetchFailures++;
          const failBody = await sessionsResp.text().catch(() => '');
          if (sessionsFetchSamples.length < 3) {
            sessionsFetchSamples.push({ id: externalCallId, status: sessionsResp.status, body: failBody.slice(0, 500) });
          }
          console.error('Teams call sessions fetch failed', externalCallId, sessionsResp.status, failBody.slice(0, 500));
        }

        startDateTime = cleanString(sourceRecord?.startDateTime || startDateTime);
        endDateTime = cleanString(sourceRecord?.endDateTime || endDateTime);
        extracted = extractParticipants(sourceRecord);

        const start = new Date(startDateTime);
        if (Number.isNaN(start.getTime())) {
          skipReasons.invalidStartDate++;
          skipped++;
          continue;
        }

        const end = endDateTime ? new Date(endDateTime) : null;
        const durationMinutes = end && !Number.isNaN(end.getTime())
          ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
          : 0;

        const callDate = toDateKey(start);
        const startTime = toTimeKey(start);
        const participants = extracted.names.join(', ') || null;

        const participantNamesForSubject = extracted.names.filter(
          (name) => cleanString(name).toLowerCase() !== currentUserDisplayName
        );

        const joinWebUrl = cleanString(sourceRecord?.joinWebUrl);
        let resolvedMeetingSubject = '';
        if (joinWebUrl) {
          meetingSubjectLookups++;
          resolvedMeetingSubject = await resolveOnlineMeetingSubjectByJoinWebUrl(
            accessToken,
            joinWebUrl,
            [currentUserAadId, getCallRecordOrganizerAadId(sourceRecord)],
            meetingSubjectCache
          );
          if (resolvedMeetingSubject) {
            meetingSubjectHits++;
          }
        }

        const subject = getTeamsSubject(
          sourceRecord,
          participantNamesForSubject.length > 0 ? participantNamesForSubject : extracted.names,
          currentUserAadId,
          resolvedMeetingSubject
        );
        const naturalKey = makeNaturalKey(callDate, startTime, durationMinutes, subject);

        if (existingExternalIds.has(externalCallId)) {
          skipReasons.duplicateExternal++;
          skipped++;
          continue;
        }

        if (existingNaturalKeys.has(naturalKey)) {
          skipReasons.duplicateNatural++;
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

        existingExternalIds.add(externalCallId);
        existingNaturalKeys.add(naturalKey);

        imported++;
      } catch (error) {
        failed++;
        console.error('Failed to import Teams call record:', error);
      }
    }

    await invalidateByEntity('callRecord', { userId: Number(req.user?.userId) });

    return res.json({
      success: true,
      message: `Teams import completed. Imported ${imported}, skipped ${skipped}, failed ${failed}.`,
      imported,
      skipped,
      failed,
      detailFetches,
      sessionsFetches,
      detailFetchFailures,
      sessionsFetchFailures,
      detailFetchSamples,
      sessionsFetchSamples,
      skipReasons,
      meetingSubjectLookups,
      meetingSubjectHits,
      recordsFetched: records.length,
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
