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

// List GitHub integrations for an organization
router.get('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    if (!(await assertOrgMember(organizationId, req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [integrations] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, OrganizationId, Name, IsEnabled, IsDefault, GitHubUrl, CreatedAt, UpdatedAt
       FROM OrganizationGitHubIntegrations
       WHERE OrganizationId = ?
       ORDER BY IsDefault DESC, Name ASC, Id ASC`,
      [organizationId]
    );

    res.json({
      success: true,
      integrations,
      // Backward-compat for callers still expecting a single row
      integration: integrations[0] || null,
    });
  } catch (error) {
    logger.error('Get GitHub integrations error:', error);
    res.status(500).json({ success: false, message: 'Failed to get GitHub integrations' });
  }
});

// Create a new GitHub integration instance
router.post('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;
    const { name, isEnabled = true, isDefault = false, gitHubUrl, gitHubToken } = req.body;

    if (!(await assertOrgManager(organizationId, userId))) {
      return res.status(403).json({ success: false, message: 'Only admins and managers can configure integrations' });
    }

    if (!gitHubUrl || !gitHubToken) {
      return res.status(400).json({ success: false, message: 'GitHub URL and token are required' });
    }

    const displayName = String(name || '').trim() || new URL(gitHubUrl).hostname || 'GitHub';
    const encryptedToken = encrypt(gitHubToken);

    if (isDefault) {
      await clearOtherVcsDefaults('github', Number(organizationId));
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO OrganizationGitHubIntegrations
         (OrganizationId, Name, IsEnabled, IsDefault, GitHubUrl, GitHubToken)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [organizationId, displayName, isEnabled ? 1 : 0, isDefault ? 1 : 0, gitHubUrl, encryptedToken]
    );

    res.json({
      success: true,
      message: 'GitHub integration created successfully',
      integrationId: result.insertId,
    });
  } catch (error) {
    logger.error('Create GitHub integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to create GitHub integration' });
  }
});

// Update by Id
router.put('/:integrationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const integrationId = Number(req.params.integrationId);
    const userId = req.user?.userId;
    const { name, isEnabled, isDefault, gitHubUrl, gitHubToken } = req.body;

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationGitHubIntegrations WHERE Id = ?',
      [integrationId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Integration not found' });
    }

    const row = existing[0];
    if (!(await assertOrgManager(row.OrganizationId, userId))) {
      return res.status(403).json({ success: false, message: 'Only admins and managers can configure integrations' });
    }

    const finalName = name !== undefined ? String(name).trim() || row.Name : row.Name;
    const finalUrl = gitHubUrl !== undefined ? gitHubUrl : row.GitHubUrl;
    const finalEnabled = isEnabled !== undefined ? (isEnabled ? 1 : 0) : row.IsEnabled;
    const finalDefault = isDefault !== undefined ? (isDefault ? 1 : 0) : row.IsDefault;
    const encryptedToken = gitHubToken ? encrypt(gitHubToken) : row.GitHubToken;

    if (finalDefault) {
      await clearOtherVcsDefaults('github', Number(row.OrganizationId), integrationId);
    }

    await pool.execute(
      `UPDATE OrganizationGitHubIntegrations
       SET Name = ?, IsEnabled = ?, IsDefault = ?, GitHubUrl = ?, GitHubToken = ?, UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [finalName, finalEnabled, finalDefault, finalUrl, encryptedToken, integrationId]
    );

    res.json({ success: true, message: 'GitHub integration updated successfully' });
  } catch (error) {
    logger.error('Update GitHub integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to update GitHub integration' });
  }
});

// Delete by Id
router.delete('/:integrationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const integrationId = Number(req.params.integrationId);
    const userId = req.user?.userId;

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationGitHubIntegrations WHERE Id = ?',
      [integrationId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Integration not found' });
    }

    if (!(await assertOrgManager(existing[0].OrganizationId, userId))) {
      return res.status(403).json({ success: false, message: 'Only admins and managers can delete integrations' });
    }

    await nullApplicationFksForIntegration('github', integrationId);
    await pool.execute('DELETE FROM OrganizationGitHubIntegrations WHERE Id = ?', [integrationId]);

    res.json({ success: true, message: 'GitHub integration deleted successfully' });
  } catch (error) {
    logger.error('Delete GitHub integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete GitHub integration' });
  }
});

// Test connection
router.post('/organization/:organizationId/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { gitHubUrl, gitHubToken } = req.body;

    if (!(await assertOrgMember(organizationId, req.user?.userId))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!gitHubUrl || !gitHubToken) {
      return res.status(400).json({ success: false, message: 'GitHub URL and token are required' });
    }

    const response = await fetch(`${gitHubUrl.replace(/\/$/, '')}/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${gitHubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        message: `Failed to connect to GitHub: ${response.status} ${response.statusText}`,
      });
    }

    const userData = await response.json();
    res.json({
      success: true,
      message: 'Successfully connected to GitHub',
      gitHubUser: userData.login || userData.name,
    });
  } catch (error: any) {
    logger.error('Test GitHub connection error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to test GitHub connection' });
  }
});

// Search issues — prefer integrationId / applicationId
router.get('/organization/:organizationId/search', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { query, owner, repo, integrationId, applicationId } = req.query;
    const userId = req.user?.userId;

    if (!(await assertOrgMember(organizationId, userId))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    let resolvedIntegrationId = integrationId ? Number(integrationId) : null;
    let resolvedOwner = owner ? String(owner) : '';
    let resolvedRepo = repo ? String(repo) : '';

    if (applicationId) {
      const [apps] = await pool.execute<RowDataPacket[]>(
        `SELECT GitHubIntegrationId, RepositoryUrl FROM Applications
         WHERE Id = ? AND OrganizationId = ?`,
        [applicationId, organizationId]
      );
      if (apps.length === 0) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }
      if (apps[0].GitHubIntegrationId) {
        resolvedIntegrationId = Number(apps[0].GitHubIntegrationId);
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

    const integration = await resolveVcsIntegration('github', Number(organizationId), resolvedIntegrationId);
    if (!integration || !integration.IsEnabled) {
      return res.status(404).json({ success: false, message: 'GitHub integration not configured or disabled' });
    }

    const GitHubToken = decryptTokenField(integration.GitHubToken);
    const GitHubUrl = String(integration.GitHubUrl).replace(/\/$/, '');

    const params = new URLSearchParams();
    params.append('state', 'all');
    params.append('sort', 'created');
    params.append('direction', 'desc');
    params.append('per_page', '50');

    const response = await fetch(
      `${GitHubUrl}/repos/${resolvedOwner}/${resolvedRepo}/issues?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${GitHubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        message: `Failed to search GitHub: ${response.status} ${response.statusText}`,
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
        assignee: issue.assignee?.login,
        assigneeName: issue.assignee?.name || issue.assignee?.login,
        author: issue.user?.login,
        authorName: issue.user?.name || issue.user?.login,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        html_url: issue.html_url,
        repository_url: issue.repository_url,
        isPullRequest: !!issue.pull_request,
      }))
      .filter((issue: any) => !issue.isPullRequest);

    res.json({ success: true, issues: formattedIssues, total: formattedIssues.length });
  } catch (error: any) {
    logger.error('GitHub search error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to search GitHub issues' });
  }
});

export default router;
