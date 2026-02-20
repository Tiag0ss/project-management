import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: GiteaIntegrations
 *   description: Gitea integration management
 */

/**
 * @swagger
 * /api/gitea-integrations/organization/{organizationId}:
 *   get:
 *     summary: Get Gitea integration for an organization
 *     tags: [GiteaIntegrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Gitea integration retrieved successfully
 *       403:
 *         description: Access denied
 */
// Get Gitea integration for an organization
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
      `SELECT OrganizationId, IsEnabled, GiteaUrl, CreatedAt, UpdatedAt
       FROM OrganizationGiteaIntegrations 
       WHERE OrganizationId = ?`,
      [organizationId]
    );

    if (integration.length === 0) {
      return res.json({ success: true, integration: null });
    }

    res.json({ success: true, integration: integration[0] });
  } catch (error) {
    console.error('Get Gitea integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to get Gitea integration' });
  }
});

/**
 * @swagger
 * /api/gitea-integrations/organization/{organizationId}:
 *   post:
 *     summary: Create or update Gitea integration
 *     tags: [GiteaIntegrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               giteaUrl:
 *                 type: string
 *               accessToken:
 *                 type: string
 *               repoOwner:
 *                 type: string
 *               repoName:
 *                 type: string
 *               isEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Integration saved successfully
 *       403:
 *         description: Access denied
 */
// Create or update Gitea integration
router.post('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;
    const { isEnabled, giteaUrl, giteaToken } = req.body;

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
      'SELECT OrganizationId, GiteaUrl, GiteaToken FROM OrganizationGiteaIntegrations WHERE OrganizationId = ?',
      [organizationId]
    );

    // Determine values to use
    let finalUrl = giteaUrl;
    let finalToken = giteaToken;

    if (existing.length > 0) {
      // If updating and values not provided, keep existing ones
      if (!giteaUrl) finalUrl = existing[0].GiteaUrl;
      if (!giteaToken) {
        // Keep existing encrypted token
        finalToken = existing[0].GiteaToken;
      }
    }

    // Validate required fields only if enabling
    if (isEnabled && (!finalUrl || !finalToken)) {
      return res.status(400).json({ success: false, message: 'Gitea URL and token are required when enabling integration' });
    }

    // Encrypt the API token only if a new one was provided
    const encryptedToken = giteaToken ? encrypt(giteaToken) : finalToken;

    if (existing.length > 0) {
      // Update existing
      await pool.execute(
        `UPDATE OrganizationGiteaIntegrations 
         SET IsEnabled = ?, GiteaUrl = ?, GiteaToken = ?, UpdatedAt = CURRENT_TIMESTAMP
         WHERE OrganizationId = ?`,
        [isEnabled ? 1 : 0, finalUrl, encryptedToken, organizationId]
      );
    } else {
      // Create new - require all fields
      if (!giteaUrl || !giteaToken) {
        return res.status(400).json({ success: false, message: 'Gitea URL and token are required for new integration' });
      }
      await pool.execute(
        `INSERT INTO OrganizationGiteaIntegrations (OrganizationId, IsEnabled, GiteaUrl, GiteaToken)
         VALUES (?, ?, ?, ?)`,
        [organizationId, isEnabled ? 1 : 0, giteaUrl, encryptedToken]
      );
    }

    res.json({ success: true, message: 'Gitea integration saved successfully' });
  } catch (error) {
    console.error('Save Gitea integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to save Gitea integration' });
  }
});

/**
 * @swagger
 * /api/gitea-integrations/organization/{organizationId}/test:
 *   post:
 *     summary: Test Gitea connection
 *     tags: [GiteaIntegrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Connection test result
 *       403:
 *         description: Access denied
 */
// Test Gitea connection
router.post('/organization/:organizationId/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;
    const { giteaUrl, giteaToken } = req.body;

    // Check if user is member of the organization
    const [memberCheck] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!giteaUrl || !giteaToken) {
      return res.status(400).json({ success: false, message: 'Gitea URL and token are required' });
    }

    // Test connection by fetching current user
    const testUrl = `${giteaUrl}/api/v1/user`;

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `token ${giteaToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gitea test connection failed:', response.status, errorText);
      return res.status(400).json({ 
        success: false, 
        message: `Failed to connect to Gitea: ${response.status} ${response.statusText}` 
      });
    }

    const userData = await response.json();

    res.json({ 
      success: true,
      message: 'Successfully connected to Gitea',
      giteaUser: userData.login || userData.username
    });
  } catch (error: any) {
    console.error('Test Gitea connection error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to test Gitea connection' 
    });
  }
});

/**
 * @swagger
 * /api/gitea-integrations/organization/{organizationId}/search:
 *   get:
 *     summary: Search Gitea issues
 *     tags: [GiteaIntegrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Gitea issues returned
 *       403:
 *         description: Access denied
 */
// Search Gitea issues
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
      `SELECT IsEnabled, GiteaUrl, GiteaToken
       FROM OrganizationGiteaIntegrations 
       WHERE OrganizationId = ? AND IsEnabled = 1`,
      [organizationId]
    );

    if (integration.length === 0) {
      return res.status(404).json({ success: false, message: 'Gitea integration not configured or disabled' });
    }

    const { GiteaUrl, GiteaToken: encryptedToken } = integration[0];
    const GiteaToken = decrypt(encryptedToken);

    // Repository-specific search
    const searchUrl = `${GiteaUrl}/api/v1/repos/${owner}/${repo}/issues`;
    const params = new URLSearchParams();
    params.append('state', 'all');
    params.append('page', '1');
    params.append('limit', '50');

    const fullUrl = `${searchUrl}?${params.toString()}`;

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': `token ${GiteaToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gitea search failed:', response.status, errorText);
      return res.status(400).json({ 
        success: false, 
        message: `Failed to search Gitea: ${response.status} ${response.statusText}` 
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
      assignee: issue.assignee?.login || issue.assignee?.username,
      assigneeName: issue.assignee?.full_name || issue.assignee?.login || issue.assignee?.username,
      author: issue.user?.login || issue.user?.username,
      authorName: issue.user?.full_name || issue.user?.login || issue.user?.username,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      html_url: issue.html_url,
      repository_url: issue.repository?.html_url,
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
    console.error('Search Gitea error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to search Gitea issues' 
    });
  }
});

/**
 * @swagger
 * /api/gitea-integrations/organization/{organizationId}:
 *   delete:
 *     summary: Delete Gitea integration
 *     tags: [GiteaIntegrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Integration deleted successfully
 *       403:
 *         description: Access denied
 */
// Delete integration
router.delete('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;

    // Check if user is admin or manager
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
      'DELETE FROM OrganizationGiteaIntegrations WHERE OrganizationId = ?',
      [organizationId]
    );

    res.json({ success: true, message: 'Gitea integration deleted successfully' });
  } catch (error) {
    console.error('Delete Gitea integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete Gitea integration' });
  }
});

export default router;
