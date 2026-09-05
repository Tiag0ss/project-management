import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from '../../config/database';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import { pool } from '../../config/database';
import { encrypt } from '../../utils/encryption';
import logger from '../../utils/logger';
import { bitbucketAuthHeader } from '../../utils/gitRemote';
import {
  clearOtherVcsDefaults,
  nullApplicationFksForIntegration,
} from '../../utils/vcsIntegrationResolve';

const router = express.Router();

function isBitbucketCloud(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'bitbucket.org' || host === 'www.bitbucket.org' || host === 'api.bitbucket.org';
  } catch {
    return /bitbucket\.org/i.test(url);
  }
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function cloudAuthHint(): string {
  return (
    'Bitbucket Cloud no longer supports app passwords. Use your Atlassian account email as username ' +
    'and an API token (with repository read scopes) as the password. ' +
    'Create tokens at: Atlassian account → Security → Create and manage API tokens → Bitbucket. ' +
    'Do not use your Bitbucket username or account login password.'
  );
}

async function assertOrgMember(organizationId: string | string[] | number, userId: number | undefined) {
  const orgId = Array.isArray(organizationId) ? organizationId[0] : organizationId;
  const [memberCheck] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
    [orgId, userId]
  );
  return memberCheck.length > 0;
}

async function assertOrgManager(organizationId: string | string[] | number, userId: number | undefined) {
  const orgId = Array.isArray(organizationId) ? organizationId[0] : organizationId;
  const [memberCheck] = await pool.execute<RowDataPacket[]>(
    `SELECT om.*, u.IsAdmin
     FROM OrganizationMembers om
     INNER JOIN Users u ON om.UserId = u.Id
     WHERE om.OrganizationId = ? AND om.UserId = ? AND (u.IsAdmin = 1 OR u.IsManager = 1)`,
    [orgId, userId]
  );
  return memberCheck.length > 0;
}

router.get('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    if (!(await assertOrgMember(organizationId, req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [integrations] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, OrganizationId, Name, IsEnabled, IsDefault, BitbucketUrl, BitbucketUsername, CreatedAt, UpdatedAt
       FROM OrganizationBitbucketIntegrations
       WHERE OrganizationId = ?
       ORDER BY IsDefault DESC, Name ASC, Id ASC`,
      [organizationId]
    );

    res.json({ success: true, integrations, integration: integrations[0] || null });
  } catch (error) {
    logger.error('Get Bitbucket integrations error:', error);
    res.status(500).json({ success: false, message: 'Failed to get Bitbucket integrations' });
  }
});

router.post('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { name, isEnabled = true, isDefault = false, bitbucketUrl, bitbucketToken, bitbucketUsername } = req.body;

    if (!(await assertOrgManager(organizationId, req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Only admins and managers can configure integrations' });
    }

    if (!bitbucketUrl || !bitbucketToken) {
      return res.status(400).json({ success: false, message: 'Bitbucket URL and token are required' });
    }

    if (isEnabled && isBitbucketCloud(bitbucketUrl)) {
      const email = String(bitbucketUsername || '').trim();
      if (!email || !looksLikeEmail(email)) {
        return res.status(400).json({ success: false, message: cloudAuthHint() });
      }
    }

    let displayName = String(name || '').trim();
    if (!displayName) {
      try {
        displayName = new URL(bitbucketUrl).hostname || 'Bitbucket';
      } catch {
        displayName = 'Bitbucket';
      }
    }

    if (isDefault) {
      await clearOtherVcsDefaults('bitbucket', Number(organizationId));
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO OrganizationBitbucketIntegrations
         (OrganizationId, Name, IsEnabled, IsDefault, BitbucketUrl, BitbucketUsername, BitbucketToken)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        displayName,
        isEnabled ? 1 : 0,
        isDefault ? 1 : 0,
        bitbucketUrl,
        bitbucketUsername || null,
        encrypt(bitbucketToken),
      ]
    );

    res.json({
      success: true,
      message: 'Bitbucket integration created successfully',
      integrationId: result.insertId,
    });
  } catch (error) {
    logger.error('Create Bitbucket integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to create Bitbucket integration' });
  }
});

router.put('/:integrationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const integrationId = Number(req.params.integrationId);
    const { name, isEnabled, isDefault, bitbucketUrl, bitbucketToken, bitbucketUsername } = req.body;

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationBitbucketIntegrations WHERE Id = ?',
      [integrationId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Integration not found' });
    }

    const row = existing[0];
    if (!(await assertOrgManager(row.OrganizationId, req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Only admins and managers can configure integrations' });
    }

    const finalName = name !== undefined ? String(name).trim() || row.Name : row.Name;
    const finalUrl = bitbucketUrl !== undefined ? bitbucketUrl : row.BitbucketUrl;
    const finalEnabled = isEnabled !== undefined ? (isEnabled ? 1 : 0) : row.IsEnabled;
    const finalDefault = isDefault !== undefined ? (isDefault ? 1 : 0) : row.IsDefault;
    const finalUsername =
      bitbucketUsername !== undefined ? bitbucketUsername || null : row.BitbucketUsername;
    const encryptedToken = bitbucketToken ? encrypt(bitbucketToken) : row.BitbucketToken;

    if (finalEnabled && finalUrl && isBitbucketCloud(finalUrl)) {
      const email = String(finalUsername || '').trim();
      if (!email || !looksLikeEmail(email)) {
        return res.status(400).json({ success: false, message: cloudAuthHint() });
      }
    }

    if (finalDefault) {
      await clearOtherVcsDefaults('bitbucket', Number(row.OrganizationId), integrationId);
    }

    await pool.execute(
      `UPDATE OrganizationBitbucketIntegrations
       SET Name = ?, IsEnabled = ?, IsDefault = ?, BitbucketUrl = ?, BitbucketUsername = ?, BitbucketToken = ?,
           UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [finalName, finalEnabled, finalDefault, finalUrl, finalUsername, encryptedToken, integrationId]
    );

    res.json({ success: true, message: 'Bitbucket integration updated successfully' });
  } catch (error) {
    logger.error('Update Bitbucket integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to update Bitbucket integration' });
  }
});

router.delete('/:integrationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const integrationId = Number(req.params.integrationId);
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationBitbucketIntegrations WHERE Id = ?',
      [integrationId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Integration not found' });
    }
    if (!(await assertOrgManager(existing[0].OrganizationId, req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Only admins and managers can delete integrations' });
    }

    await nullApplicationFksForIntegration('bitbucket', integrationId);
    await pool.execute('DELETE FROM OrganizationBitbucketIntegrations WHERE Id = ?', [integrationId]);
    res.json({ success: true, message: 'Bitbucket integration deleted successfully' });
  } catch (error) {
    logger.error('Delete Bitbucket integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete Bitbucket integration' });
  }
});

router.post('/organization/:organizationId/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { bitbucketUrl, bitbucketToken, bitbucketUsername } = req.body;

    if (!(await assertOrgMember(organizationId, req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!bitbucketUrl || !bitbucketToken) {
      return res.status(400).json({ success: false, message: 'Bitbucket URL and token are required' });
    }

    const cloud = isBitbucketCloud(bitbucketUrl);
    if (cloud) {
      const email = String(bitbucketUsername || '').trim();
      if (!email || !looksLikeEmail(email)) {
        return res.status(400).json({ success: false, message: cloudAuthHint() });
      }
    }

    let headers: Record<string, string>;
    let testUrl: string;
    try {
      if (cloud) {
        testUrl = 'https://api.bitbucket.org/2.0/user';
        headers = {
          Accept: 'application/json',
          ...bitbucketAuthHeader({ kind: 'cloud', token: bitbucketToken, username: bitbucketUsername }),
        };
      } else {
        const base = String(bitbucketUrl).replace(/\/$/, '');
        testUrl = `${base}/rest/api/1.0/users?limit=1`;
        headers = {
          Accept: 'application/json',
          ...bitbucketAuthHeader({ kind: 'server', token: bitbucketToken }),
        };
      }
    } catch (authError: unknown) {
      const message = authError instanceof Error ? authError.message : cloudAuthHint();
      return res.status(400).json({ success: false, message });
    }

    const response = await fetch(testUrl, { method: 'GET', headers });
    if (!response.ok) {
      const hint = cloud && response.status === 401 ? ` ${cloudAuthHint()}` : '';
      return res.status(400).json({
        success: false,
        message: `Failed to connect to Bitbucket: ${response.status} ${response.statusText}.${hint}`,
      });
    }

    let displayName = 'Bitbucket user';
    try {
      const userData = (await response.json()) as {
        username?: string;
        display_name?: string;
        displayName?: string;
        name?: string;
      };
      displayName =
        userData.display_name || userData.displayName || userData.username || userData.name || displayName;
    } catch {
      // ignore
    }

    res.json({ success: true, message: 'Successfully connected to Bitbucket', bitbucketUser: displayName });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to test Bitbucket connection';
    logger.error('Test Bitbucket connection error:', error);
    res.status(500).json({ success: false, message });
  }
});

export default router;
