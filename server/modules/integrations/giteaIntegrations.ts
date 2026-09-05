import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from '../../config/database';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import { pool } from '../../config/database';
import { encrypt } from '../../utils/encryption';
import logger from '../../utils/logger';
import {
  clearOtherVcsDefaults,
  decryptTokenField,
  nullApplicationFksForIntegration,
  resolveVcsIntegration,
} from '../../utils/vcsIntegrationResolve';
import { parseOwnerRepoFromUrl } from '../../utils/vcsIntegrationHelpers';

const router = express.Router();

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
      `SELECT Id, OrganizationId, Name, IsEnabled, IsDefault, GiteaUrl, CreatedAt, UpdatedAt
       FROM OrganizationGiteaIntegrations
       WHERE OrganizationId = ?
       ORDER BY IsDefault DESC, Name ASC, Id ASC`,
      [organizationId]
    );

    res.json({ success: true, integrations, integration: integrations[0] || null });
  } catch (error) {
    logger.error('Get Gitea integrations error:', error);
    res.status(500).json({ success: false, message: 'Failed to get Gitea integrations' });
  }
});

router.post('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { name, isEnabled = true, isDefault = false, giteaUrl, giteaToken } = req.body;

    if (!(await assertOrgManager(organizationId, req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Only admins and managers can configure integrations' });
    }

    if (!giteaUrl || !giteaToken) {
      return res.status(400).json({ success: false, message: 'Gitea URL and token are required' });
    }

    let displayName = String(name || '').trim();
    if (!displayName) {
      try {
        displayName = new URL(giteaUrl).hostname || 'Gitea';
      } catch {
        displayName = 'Gitea';
      }
    }

    if (isDefault) {
      await clearOtherVcsDefaults('gitea', Number(organizationId));
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO OrganizationGiteaIntegrations
         (OrganizationId, Name, IsEnabled, IsDefault, GiteaUrl, GiteaToken)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [organizationId, displayName, isEnabled ? 1 : 0, isDefault ? 1 : 0, giteaUrl, encrypt(giteaToken)]
    );

    res.json({ success: true, message: 'Gitea integration created successfully', integrationId: result.insertId });
  } catch (error) {
    logger.error('Create Gitea integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to create Gitea integration' });
  }
});

router.put('/:integrationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const integrationId = Number(req.params.integrationId);
    const { name, isEnabled, isDefault, giteaUrl, giteaToken } = req.body;

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationGiteaIntegrations WHERE Id = ?',
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
    const finalUrl = giteaUrl !== undefined ? giteaUrl : row.GiteaUrl;
    const finalEnabled = isEnabled !== undefined ? (isEnabled ? 1 : 0) : row.IsEnabled;
    const finalDefault = isDefault !== undefined ? (isDefault ? 1 : 0) : row.IsDefault;
    const encryptedToken = giteaToken ? encrypt(giteaToken) : row.GiteaToken;

    if (finalDefault) {
      await clearOtherVcsDefaults('gitea', Number(row.OrganizationId), integrationId);
    }

    await pool.execute(
      `UPDATE OrganizationGiteaIntegrations
       SET Name = ?, IsEnabled = ?, IsDefault = ?, GiteaUrl = ?, GiteaToken = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [finalName, finalEnabled, finalDefault, finalUrl, encryptedToken, integrationId]
    );

    res.json({ success: true, message: 'Gitea integration updated successfully' });
  } catch (error) {
    logger.error('Update Gitea integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to update Gitea integration' });
  }
});

router.delete('/:integrationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const integrationId = Number(req.params.integrationId);
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationGiteaIntegrations WHERE Id = ?',
      [integrationId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Integration not found' });
    }
    if (!(await assertOrgManager(existing[0].OrganizationId, req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Only admins and managers can delete integrations' });
    }

    await nullApplicationFksForIntegration('gitea', integrationId);
    await pool.execute('DELETE FROM OrganizationGiteaIntegrations WHERE Id = ?', [integrationId]);
    res.json({ success: true, message: 'Gitea integration deleted successfully' });
  } catch (error) {
    logger.error('Delete Gitea integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete Gitea integration' });
  }
});

router.post('/organization/:organizationId/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { giteaUrl, giteaToken } = req.body;
    if (!(await assertOrgMember(organizationId, req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!giteaUrl || !giteaToken) {
      return res.status(400).json({ success: false, message: 'Gitea URL and token are required' });
    }

    const response = await fetch(`${String(giteaUrl).replace(/\/$/, '')}/api/v1/user`, {
      method: 'GET',
      headers: { Authorization: `token ${giteaToken}`, Accept: 'application/json' },
    });

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        message: `Failed to connect to Gitea: ${response.status} ${response.statusText}`,
      });
    }

    const userData = await response.json();
    res.json({
      success: true,
      message: 'Successfully connected to Gitea',
      giteaUser: userData.login || userData.username,
    });
  } catch (error: any) {
    logger.error('Test Gitea connection error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to test Gitea connection' });
  }
});

router.get('/organization/:organizationId/search', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { query, owner, repo, integrationId, applicationId } = req.query;

    if (!(await assertOrgMember(organizationId, req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    let resolvedIntegrationId = integrationId ? Number(integrationId) : null;
    let resolvedOwner = owner ? String(owner) : '';
    let resolvedRepo = repo ? String(repo) : '';

    if (applicationId) {
      const [apps] = await pool.execute<RowDataPacket[]>(
        `SELECT GiteaIntegrationId, RepositoryUrl FROM Applications
         WHERE Id = ? AND OrganizationId = ?`,
        [applicationId, organizationId]
      );
      if (apps.length === 0) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }
      if (apps[0].GiteaIntegrationId) {
        resolvedIntegrationId = Number(apps[0].GiteaIntegrationId);
      }
      const parsed = parseOwnerRepoFromUrl(apps[0].RepositoryUrl);
      if (parsed) {
        resolvedOwner = resolvedOwner || parsed.owner;
        resolvedRepo = resolvedRepo || parsed.repo;
      }
    }

    if (!resolvedOwner || !resolvedRepo) {
      return res.status(400).json({ success: false, message: 'Repository owner and name are required' });
    }

    const integration = await resolveVcsIntegration('gitea', Number(organizationId), resolvedIntegrationId);
    if (!integration || !integration.IsEnabled) {
      return res.status(404).json({ success: false, message: 'Gitea integration not configured or disabled' });
    }

    const GiteaToken = decryptTokenField(integration.GiteaToken);
    const GiteaUrl = String(integration.GiteaUrl).replace(/\/$/, '');
    const params = new URLSearchParams({ state: 'all', page: '1', limit: '50' });

    const response = await fetch(
      `${GiteaUrl}/api/v1/repos/${resolvedOwner}/${resolvedRepo}/issues?${params}`,
      {
        method: 'GET',
        headers: { Authorization: `token ${GiteaToken}`, Accept: 'application/json' },
      }
    );

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        message: `Failed to search Gitea: ${response.status} ${response.statusText}`,
      });
    }

    let issues = await response.json();
    if (query) {
      const searchTerm = String(query).toLowerCase();
      issues = issues.filter(
        (issue: any) =>
          issue.title?.toLowerCase().includes(searchTerm) ||
          issue.body?.toLowerCase().includes(searchTerm) ||
          issue.number?.toString().includes(searchTerm)
      );
    }

    const formattedIssues = issues
      .map((issue: any) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels?.map((label: any) => ({ name: label.name, color: label.color })) || [],
        assignee: issue.assignee?.login || issue.assignee?.username,
        assigneeName: issue.assignee?.full_name || issue.assignee?.login || issue.assignee?.username,
        author: issue.user?.login || issue.user?.username,
        authorName: issue.user?.full_name || issue.user?.login || issue.user?.username,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        html_url: issue.html_url,
        repository_url: issue.repository?.html_url,
        isPullRequest: !!issue.pull_request,
      }))
      .filter((issue: any) => !issue.isPullRequest);

    res.json({ success: true, issues: formattedIssues, total: formattedIssues.length });
  } catch (error: any) {
    logger.error('Search Gitea error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to search Gitea issues' });
  }
});

export default router;
