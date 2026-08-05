import express, { Response } from 'express';
import { RowDataPacket } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { encrypt } from '../utils/encryption';
import logger from '../utils/logger';
import { bitbucketAuthHeader } from '../utils/gitRemote';

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

// Get Bitbucket integration for an organization
router.get('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;

    const [memberCheck] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [integration] = await pool.execute<RowDataPacket[]>(
      `SELECT OrganizationId, IsEnabled, BitbucketUrl, BitbucketUsername, CreatedAt, UpdatedAt
       FROM OrganizationBitbucketIntegrations
       WHERE OrganizationId = ?`,
      [organizationId]
    );

    if (integration.length === 0) {
      return res.json({ success: true, integration: null });
    }

    res.json({ success: true, integration: integration[0] });
  } catch (error) {
    logger.error('Get Bitbucket integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to get Bitbucket integration' });
  }
});

// Create or update Bitbucket integration
router.post('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;
    const { isEnabled, bitbucketUrl, bitbucketToken, bitbucketUsername } = req.body;

    const [memberCheck] = await pool.execute<RowDataPacket[]>(
      `SELECT om.*, u.IsAdmin
       FROM OrganizationMembers om
       INNER JOIN Users u ON om.UserId = u.Id
       WHERE om.OrganizationId = ? AND om.UserId = ? AND (u.IsAdmin = 1 OR u.IsManager = 1)`,
      [organizationId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Only admins and managers can configure integrations' });
    }

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId, BitbucketUrl, BitbucketToken, BitbucketUsername FROM OrganizationBitbucketIntegrations WHERE OrganizationId = ?',
      [organizationId]
    );

    let finalUrl = bitbucketUrl;
    let finalToken = bitbucketToken;
    let finalUsername = bitbucketUsername !== undefined ? bitbucketUsername : null;

    if (existing.length > 0) {
      if (!bitbucketUrl) finalUrl = existing[0].BitbucketUrl;
      if (!bitbucketToken) {
        finalToken = existing[0].BitbucketToken;
      }
      if (bitbucketUsername === undefined) {
        finalUsername = existing[0].BitbucketUsername;
      }
    }

    if (isEnabled && (!finalUrl || !finalToken)) {
      return res.status(400).json({
        success: false,
        message: 'Bitbucket URL and token are required when enabling integration',
      });
    }

    if (isEnabled && finalUrl && isBitbucketCloud(finalUrl)) {
      const email = String(finalUsername || '').trim();
      if (!email || !looksLikeEmail(email)) {
        return res.status(400).json({
          success: false,
          message: cloudAuthHint(),
        });
      }
    }

    const encryptedToken = bitbucketToken ? encrypt(bitbucketToken) : finalToken;

    if (existing.length > 0) {
      await pool.execute(
        `UPDATE OrganizationBitbucketIntegrations
         SET IsEnabled = ?, BitbucketUrl = ?, BitbucketUsername = ?, BitbucketToken = ?, UpdatedAt = CURRENT_TIMESTAMP
         WHERE OrganizationId = ?`,
        [isEnabled ? 1 : 0, finalUrl, finalUsername || null, encryptedToken, organizationId]
      );
    } else {
      if (!bitbucketUrl || !bitbucketToken) {
        return res.status(400).json({
          success: false,
          message: 'Bitbucket URL and token are required for new integration',
        });
      }
      await pool.execute(
        `INSERT INTO OrganizationBitbucketIntegrations (OrganizationId, IsEnabled, BitbucketUrl, BitbucketUsername, BitbucketToken)
         VALUES (?, ?, ?, ?, ?)`,
        [organizationId, isEnabled ? 1 : 0, bitbucketUrl, finalUsername || null, encryptedToken]
      );
    }

    res.json({ success: true, message: 'Bitbucket integration saved successfully' });
  } catch (error) {
    logger.error('Save Bitbucket integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to save Bitbucket integration' });
  }
});

// Test Bitbucket connection
router.post('/organization/:organizationId/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;
    const { bitbucketUrl, bitbucketToken, bitbucketUsername } = req.body;

    const [memberCheck] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!bitbucketUrl || !bitbucketToken) {
      return res.status(400).json({ success: false, message: 'Bitbucket URL and token are required' });
    }

    const cloud = isBitbucketCloud(bitbucketUrl);
    if (cloud) {
      const email = String(bitbucketUsername || '').trim();
      if (!email || !looksLikeEmail(email)) {
        return res.status(400).json({
          success: false,
          message: cloudAuthHint(),
        });
      }
    }

    let headers: Record<string, string>;
    let testUrl: string;
    try {
      if (cloud) {
        testUrl = 'https://api.bitbucket.org/2.0/user';
        headers = {
          Accept: 'application/json',
          ...bitbucketAuthHeader({
            kind: 'cloud',
            token: bitbucketToken,
            username: bitbucketUsername,
          }),
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
      const errorText = await response.text();
      logger.error('Bitbucket test connection failed:', response.status, errorText);
      const hint =
        cloud && response.status === 401
          ? ` ${cloudAuthHint()}`
          : '';
      return res.status(400).json({
        success: false,
        message: `Failed to connect to Bitbucket: ${response.status} ${response.statusText}.${hint}`,
      });
    }

    let displayName = 'Bitbucket user';
    try {
      const userData = await response.json() as { username?: string; display_name?: string; displayName?: string; name?: string };
      displayName = userData.display_name || userData.displayName || userData.username || userData.name || displayName;
    } catch {
      // Server user list may not be a single user object
    }

    res.json({
      success: true,
      message: 'Successfully connected to Bitbucket',
      bitbucketUser: displayName,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to test Bitbucket connection';
    logger.error('Test Bitbucket connection error:', error);
    res.status(500).json({ success: false, message });
  }
});

// Delete integration
router.delete('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;

    const [memberCheck] = await pool.execute<RowDataPacket[]>(
      `SELECT om.*, u.IsAdmin
       FROM OrganizationMembers om
       INNER JOIN Users u ON om.UserId = u.Id
       WHERE om.OrganizationId = ? AND om.UserId = ? AND (u.IsAdmin = 1 OR u.IsManager = 1)`,
      [organizationId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Only admins and managers can delete integrations' });
    }

    await pool.execute(
      'DELETE FROM OrganizationBitbucketIntegrations WHERE OrganizationId = ?',
      [organizationId]
    );

    res.json({ success: true, message: 'Bitbucket integration deleted successfully' });
  } catch (error) {
    logger.error('Delete Bitbucket integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete Bitbucket integration' });
  }
});

export default router;
