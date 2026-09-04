import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../../middleware/auth';
import { pool } from '../../config/database';
import { RowDataPacket } from '../../config/database';
import { decrypt } from '../../utils/encryption';
import logger from '../../utils/logger';

const router = Router();

const INVALID_USER_CACHE_TTL_MS = 15 * 60 * 1000;
const TOKEN_SAFETY_WINDOW_MS = 30 * 1000;

let graphTokenCache: {
  accessToken: string;
  expiresAtMs: number;
} | null = null;

const invalidOutlookUserCache = new Map<string, number>();

const normalizeCacheEmail = (email: string): string => String(email || '').trim().toLowerCase();

const isInvalidOutlookUserCached = (email: string): boolean => {
  const key = normalizeCacheEmail(email);
  const expiresAt = invalidOutlookUserCache.get(key);
  if (!expiresAt) return false;
  if (Date.now() >= expiresAt) {
    invalidOutlookUserCache.delete(key);
    return false;
  }
  return true;
};

const markInvalidOutlookUserCached = (email: string) => {
  const key = normalizeCacheEmail(email);
  invalidOutlookUserCache.set(key, Date.now() + INVALID_USER_CACHE_TTL_MS);
};

interface OutlookTargetUser {
  Id: number;
  Email: string;
  Username?: string;
  FirstName?: string;
  LastName?: string;
}

const toDateKey = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

router.get('/events', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.user?.userId || 0);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const [settingsRows] = await pool.execute<RowDataPacket[]>(
      `SELECT SettingKey, SettingValue
       FROM SystemSettings
       WHERE SettingKey IN (?, ?, ?, ?, ?)` ,
      [
        'outlookCalendarEnabled',
        'outlookTenantId',
        'outlookClientId',
        'outlookClientSecret',
        'outlookIncludeTeamEventsForManagers',
      ]
    );

    const settings = new Map<string, string>();
    settingsRows.forEach((row) => settings.set(String(row.SettingKey), String(row.SettingValue ?? '')));

    const enabled = settings.get('outlookCalendarEnabled') === 'true';
    if (!enabled) {
      return res.json({ success: true, enabled: false, events: [] });
    }

    const tenantId = decrypt(settings.get('outlookTenantId') || '').trim();
    const clientId = decrypt(settings.get('outlookClientId') || '').trim();
    const clientSecretEncrypted = settings.get('outlookClientSecret') || '';
    const clientSecret = decrypt(clientSecretEncrypted).trim();
    const includeTeamForManagers = (settings.get('outlookIncludeTeamEventsForManagers') || 'true') === 'true';

    if (!tenantId || !clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        message: 'Outlook calendar integration is enabled but not fully configured in System Settings.',
      });
    }

    // Detect common misconfiguration: decryption failure returns the raw "enc:…" ciphertext
    if (clientSecret.startsWith('enc:') || tenantId.startsWith('enc:') || clientId.startsWith('enc:')) {
      logger.error('[OutlookCalendar] Decryption failed for one or more credentials. The ENCRYPTION_KEY env variable may have changed.');
      return res.status(500).json({
        success: false,
        message: 'Failed to decrypt Outlook credentials. The server ENCRYPTION_KEY may have changed — re-enter the credentials in System Settings.',
      });
    }

    // Detect if the clientSecret looks like a UUID (Secret ID instead of Secret Value)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(clientSecret)) {
      logger.error('[OutlookCalendar] outlookClientSecret appears to be a GUID (Secret ID). The Secret Value must be used instead.');
      return res.status(400).json({
        success: false,
        message: 'The configured Outlook Client Secret appears to be the Secret ID (a GUID). Go to System Settings and use the Secret Value instead — it is shown only when the secret is first created in Azure.',
      });
    }

    const [currentUserRows] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, Email, Username, FirstName, LastName,
              COALESCE(IsAdmin, 0) as IsAdmin,
              COALESCE(IsManager, 0) as IsManager
       FROM Users
       WHERE Id = ?`,
      [userId]
    );

    if (!currentUserRows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const currentUser = currentUserRows[0];
    const isAdmin = Number(currentUser.IsAdmin || 0) === 1;
    const isManager = Number(currentUser.IsManager || 0) === 1;

    const selfOnly = req.query.selfOnly === 'true' || req.query.selfOnly === '1';

    const targetUsersMap = new Map<number, OutlookTargetUser>();
    if (currentUser.Email && String(currentUser.Email).trim()) {
      targetUsersMap.set(Number(currentUser.Id), {
        Id: Number(currentUser.Id),
        Email: String(currentUser.Email).trim(),
        Username: currentUser.Username,
        FirstName: currentUser.FirstName,
        LastName: currentUser.LastName,
      });
    }

    if (!selfOnly && includeTeamForManagers && (isAdmin || isManager)) {
      const [teamRows] = await pool.execute<RowDataPacket[]>(
        `SELECT DISTINCT u.Id, u.Email, u.Username, u.FirstName, u.LastName
         FROM OrganizationMembers omSelf
         INNER JOIN OrganizationMembers omTeam ON omTeam.OrganizationId = omSelf.OrganizationId
         INNER JOIN Users u ON u.Id = omTeam.UserId
         WHERE omSelf.UserId = ?
           AND u.Email IS NOT NULL
           AND u.Email <> ''`,
        [userId]
      );

      teamRows.forEach((row) => {
        const rowId = Number(row.Id || 0);
        const rowEmail = String(row.Email || '').trim();
        if (!rowId || !rowEmail) return;
        targetUsersMap.set(rowId, {
          Id: rowId,
          Email: rowEmail,
          Username: row.Username,
          FirstName: row.FirstName,
          LastName: row.LastName,
        });
      });
    }

    const targetUsers = Array.from(targetUsersMap.values());
    if (targetUsers.length === 0) {
      return res.json({
        success: true,
        enabled: true,
        events: [],
        warnings: ['No users with valid email found for Outlook calendar sync.'],
      });
    }

    const queryStart = typeof req.query.startDate === 'string' ? req.query.startDate : '';
    const queryEnd = typeof req.query.endDate === 'string' ? req.query.endDate : '';

    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(queryStart) ? queryStart : toDateKey(defaultStart);
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(queryEnd) ? queryEnd : toDateKey(defaultEnd);

    const startDateTime = `${startDate}T00:00:00Z`;
    const endDateTime = `${endDate}T23:59:59Z`;

    let accessToken = '';
    if (graphTokenCache && graphTokenCache.expiresAtMs > Date.now() + TOKEN_SAFETY_WINDOW_MS) {
      accessToken = graphTokenCache.accessToken;
    } else {
      const tokenParams = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      });

      const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error('[OutlookCalendar] Microsoft Graph token request failed:', errorText);
        return res.status(502).json({
          success: false,
          message: 'Failed to authenticate with Microsoft Graph.',
          details: errorText,
        });
      }

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token as string;
      if (!accessToken) {
        return res.status(502).json({ success: false, message: 'Microsoft Graph token was not returned.' });
      }

      const expiresInSec = Number(tokenData.expires_in || 3600);
      graphTokenCache = {
        accessToken,
        expiresAtMs: Date.now() + Math.max(60, expiresInSec) * 1000,
      };
    }

    const warnings: string[] = [];
    const events: any[] = [];

    await Promise.all(targetUsers.map(async (targetUser) => {
      try {
      /*  if (isInvalidOutlookUserCached(targetUser.Email)) {
          warnings.push(`Skipped Outlook events for ${targetUser.Email}: cached invalid user.`);
          return;
        }*/

        const graphUrl = new URL(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(targetUser.Email)}/calendarView`);
        graphUrl.searchParams.set('startDateTime', startDateTime);
        graphUrl.searchParams.set('endDateTime', endDateTime);
        graphUrl.searchParams.set('$select', 'id,subject,start,end,isAllDay,showAs,webLink,organizer');
        graphUrl.searchParams.set('$top', '500');

        const eventsResponse = await fetch(graphUrl.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Prefer: 'outlook.timezone="UTC"',
          },
        });

        if (!eventsResponse.ok) {
          const bodyText = await eventsResponse.text();
          if (bodyText.includes('ErrorInvalidUser')) {
            markInvalidOutlookUserCached(targetUser.Email);
          }
          warnings.push(`Failed to fetch Outlook events for ${targetUser.Email}: ${bodyText}`);
          return;
        }

        const eventsData = await eventsResponse.json();
        const values = Array.isArray(eventsData.value) ? eventsData.value : [];

        const ownerName = targetUser.FirstName || targetUser.LastName
          ? `${String(targetUser.FirstName || '').trim()} ${String(targetUser.LastName || '').trim()}`.trim()
          : (targetUser.Username || targetUser.Email);

        values.forEach((eventItem: any) => {
          // Graph returns UTC datetimes without a timezone designator (e.g. "2026-06-03T09:00:00.0000000").
          // Append 'Z' so browsers and Date.parse() always treat them as UTC, not local time.
          const normalizeGraphDt = (dt: string | undefined): string | undefined => {
            if (!dt) return dt;
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dt) && !/[Zz]$/.test(dt) && !/[+-]\d{2}:\d{2}$/.test(dt)) {
              return dt + 'Z';
            }
            return dt;
          };
          const start = normalizeGraphDt(eventItem?.start?.dateTime) || eventItem?.start?.date;
          const end = normalizeGraphDt(eventItem?.end?.dateTime) || eventItem?.end?.date;
          if (!start || !end) return;

          events.push({
            id: `${targetUser.Id}-${String(eventItem.id || '')}`,
            outlookEventId: eventItem.id,
            subject: eventItem.subject || '(No subject)',
            start,
            end,
            isAllDay: !!eventItem.isAllDay,
            showAs: eventItem.showAs || null,
            webLink: eventItem.webLink || null,
            organizer: eventItem?.organizer?.emailAddress?.address || null,
            userId: targetUser.Id,
            userEmail: targetUser.Email,
            userName: ownerName,
          });
        });
      } catch (error) {
        warnings.push(`Failed to fetch Outlook events for ${targetUser.Email}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));

    return res.json({
      success: true,
      enabled: true,
      events,
      warnings,
    });
  } catch (error) {
    logger.error('Outlook calendar events error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch Outlook calendar events',
    });
  }
});

export default router;
