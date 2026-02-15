import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';

const router = express.Router();

// Get GitHub integration for an organization
router.get('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;

    // Check if user is member of the organization
    const [memberCheck] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [integration] = await pool.execute<RowDataPacket[]>(
      `SELECT OrganizationId, IsEnabled, GitHubUrl, CreatedAt, UpdatedAt
       FROM OrganizationGitHubIntegrations 
       WHERE OrganizationId = ?`,
      [organizationId]
    );

    if (integration.length === 0) {
      return res.json({ success: true, integration: null });
    }

    res.json({ success: true, integration: integration[0] });
  } catch (error) {
    console.error('Get GitHub integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to get GitHub integration' });
  }
});

// Create or update GitHub integration
router.post('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;
    const { isEnabled, gitHubUrl, gitHubToken } = req.body;

    // Check if user is admin or manager of the organization
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

    // Check if integration exists
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId, GitHubUrl, GitHubToken FROM OrganizationGitHubIntegrations WHERE OrganizationId = ?',
      [organizationId]
    );

    // Determine values to use
    let finalUrl = gitHubUrl;
    let finalToken = gitHubToken;

    if (existing.length > 0) {
      // If updating and values not provided, keep existing ones
      if (!gitHubUrl) finalUrl = existing[0].GitHubUrl;
      if (!gitHubToken) {
        // Keep existing encrypted token
        finalToken = existing[0].GitHubToken;
      }
    }

    // Validate required fields only if enabling
    if (isEnabled && (!finalUrl || !finalToken)) {
      return res.status(400).json({ success: false, message: 'GitHub URL and token are required when enabling integration' });
    }

    // Encrypt the API token only if a new one was provided
    const encryptedToken = gitHubToken ? encrypt(gitHubToken) : finalToken;

    if (existing.length > 0) {
      // Update existing
      await pool.execute(
        `UPDATE OrganizationGitHubIntegrations 
         SET IsEnabled = ?, GitHubUrl = ?, GitHubToken = ?, UpdatedAt = CURRENT_TIMESTAMP
         WHERE OrganizationId = ?`,
        [isEnabled ? 1 : 0, finalUrl, encryptedToken, organizationId]
      );
    } else {
      // Create new - require all fields
      if (!gitHubUrl || !gitHubToken) {
        return res.status(400).json({ success: false, message: 'GitHub URL and token are required for new integration' });
      }
      await pool.execute(
        `INSERT INTO OrganizationGitHubIntegrations (OrganizationId, IsEnabled, GitHubUrl, GitHubToken)
         VALUES (?, ?, ?, ?)`,
        [organizationId, isEnabled ? 1 : 0, gitHubUrl, encryptedToken]
      );
    }

    res.json({ success: true, message: 'GitHub integration saved successfully' });
  } catch (error) {
    console.error('Save GitHub integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to save GitHub integration' });
  }
});

// Test GitHub connection
router.post('/organization/:organizationId/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;
    const { gitHubUrl, gitHubToken } = req.body;

    // Check if user is member of the organization
    const [memberCheck] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!gitHubUrl || !gitHubToken) {
      return res.status(400).json({ success: false, message: 'GitHub URL and token are required' });
    }

    // Test connection by fetching current user
    const testUrl = `${gitHubUrl}/user`;

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${gitHubToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub test connection failed:', response.status, errorText);
      return res.status(400).json({ 
        success: false, 
        message: `Failed to connect to GitHub: ${response.status} ${response.statusText}` 
      });
    }

    const userData = await response.json();

    res.json({ 
      success: true,
      message: 'Successfully connected to GitHub',
      gitHubUser: userData.login || userData.name
    });
  } catch (error: any) {
    console.error('Test GitHub connection error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to test GitHub connection' 
    });
  }
});

// Search GitHub issues
router.get('/organization/:organizationId/search', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { query, owner, repo } = req.query;
    const userId = req.user?.userId;

    // Check if user is member of the organization
    const [memberCheck] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Owner and repo are now required
    if (!owner || !repo) {
      return res.status(400).json({ success: false, message: 'Repository owner and name are required' });
    }

    // Get integration settings
    const [integration] = await pool.execute<RowDataPacket[]>(
      `SELECT IsEnabled, GitHubUrl, GitHubToken
       FROM OrganizationGitHubIntegrations 
       WHERE OrganizationId = ? AND IsEnabled = 1`,
      [organizationId]
    );

    if (integration.length === 0) {
      return res.status(404).json({ success: false, message: 'GitHub integration not configured or disabled' });
    }

    const { GitHubUrl, GitHubToken: encryptedToken } = integration[0];
    const GitHubToken = decrypt(encryptedToken);

    // Repository-specific search
    const searchUrl = `${GitHubUrl}/repos/${owner}/${repo}/issues`;
    const params = new URLSearchParams();
    params.append('state', 'all');
    params.append('sort', 'created');
    params.append('direction', 'desc');
    params.append('per_page', '50');

    const fullUrl = `${searchUrl}?${params.toString()}`;

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GitHubToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub search failed:', response.status, errorText);
      return res.status(400).json({ 
        success: false, 
        message: `Failed to search GitHub: ${response.status} ${response.statusText}` 
      });
    }

    let issues = await response.json();

    // Filter by query if provided
    if (query) {
      const searchTerm = String(query).toLowerCase();
      issues = issues.filter((issue: any) => 
        issue.title?.toLowerCase().includes(searchTerm) ||
        issue.body?.toLowerCase().includes(searchTerm) ||
        issue.number?.toString().includes(searchTerm)
      );
    }
    
    // Map and format issues
    const formattedIssues = issues.map((issue: any) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: issue.labels?.map((label: any) => ({
        name: label.name,
        color: label.color
      })) || [],
      assignee: issue.assignee?.login,
      assigneeName: issue.assignee?.name || issue.assignee?.login,
      author: issue.user?.login,
      authorName: issue.user?.name || issue.user?.login,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      html_url: issue.html_url,
      repository_url: issue.repository_url,
      isPullRequest: !!issue.pull_request
    }));

    // Filter out pull requests
    const issuesOnly = formattedIssues.filter((issue: any) => !issue.isPullRequest);

    res.json({ 
      success: true, 
      issues: issuesOnly,
      total: issuesOnly.length
    });
  } catch (error: any) {
    console.error('GitHub search error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to search GitHub issues' 
    });
  }
});

export default router;