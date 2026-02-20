import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: JiraIntegrations
 *   description: Jira integration management
 */

/**
 * @swagger
 * /api/jira-integrations/organization/{organizationId}:
 *   get:
 *     summary: Get Jira integration for an organization
 *     tags: [JiraIntegrations]
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
 *         description: Jira integration retrieved successfully
 *       403:
 *         description: Access denied
 */
// Get Jira integration for an organization
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
      `SELECT OrganizationId, IsEnabled, JiraUrl, JiraEmail, JiraProjectKey, 
              JiraProjectsUrl, JiraProjectsEmail, CreatedAt, UpdatedAt
       FROM OrganizationJiraIntegrations 
       WHERE OrganizationId = ?`,
      [organizationId]
    );

    if (integration.length === 0) {
      return res.json({ success: true, integration: null });
    }

    res.json({ success: true, integration: integration[0] });
  } catch (error) {
    console.error('Get Jira integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to get Jira integration' });
  }
});

/**
 * @swagger
 * /api/jira-integrations/organization/{organizationId}:
 *   post:
 *     summary: Create or update Jira integration
 *     tags: [JiraIntegrations]
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
 *               jiraUrl:
 *                 type: string
 *               jiraEmail:
 *                 type: string
 *               jiraApiToken:
 *                 type: string
 *               jiraProjectKey:
 *                 type: string
 *               jiraProjectsUrl:
 *                 type: string
 *               jiraProjectsEmail:
 *                 type: string
 *               jiraProjectsApiToken:
 *                 type: string
 *               isEnabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Integration saved successfully
 *       403:
 *         description: Access denied
 */
// Create or update Jira integration
router.post('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;
    const { isEnabled, jiraUrl, jiraEmail, jiraApiToken, jiraProjectKey, jiraProjectsUrl, jiraProjectsEmail, jiraProjectsApiToken } = req.body;

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

    if (!jiraUrl || !jiraEmail || !jiraApiToken) {
      return res.status(400).json({ success: false, message: 'Jira URL, email, and API token are required' });
    }

    // Check if integration exists
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM OrganizationJiraIntegrations WHERE OrganizationId = ?',
      [organizationId]
    );

    // Encrypt the API tokens before storing
    const encryptedToken = encrypt(jiraApiToken);
    const encryptedProjectsToken = jiraProjectsApiToken ? encrypt(jiraProjectsApiToken) : null;

    if (existing.length > 0) {
      // Update existing
      await pool.execute(
        `UPDATE OrganizationJiraIntegrations 
         SET IsEnabled = ?, JiraUrl = ?, JiraEmail = ?, JiraApiToken = ?, JiraProjectKey = ?, 
             JiraProjectsUrl = ?, JiraProjectsEmail = ?, JiraProjectsApiToken = ?, UpdatedAt = CURRENT_TIMESTAMP
         WHERE OrganizationId = ?`,
        [isEnabled ? 1 : 0, jiraUrl, jiraEmail, encryptedToken, jiraProjectKey || null, 
         jiraProjectsUrl || null, jiraProjectsEmail || null, encryptedProjectsToken, organizationId]
      );
    } else {
      // Create new
      await pool.execute(
        `INSERT INTO OrganizationJiraIntegrations (OrganizationId, IsEnabled, JiraUrl, JiraEmail, JiraApiToken, JiraProjectKey, JiraProjectsUrl, JiraProjectsEmail, JiraProjectsApiToken)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [organizationId, isEnabled ? 1 : 0, jiraUrl, jiraEmail, encryptedToken, jiraProjectKey || null, 
         jiraProjectsUrl || null, jiraProjectsEmail || null, encryptedProjectsToken]
      );
    }

    res.json({ success: true, message: 'Jira integration saved successfully' });
  } catch (error) {
    console.error('Save Jira integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to save Jira integration' });
  }
});

/**
 * @swagger
 * /api/jira-integrations/organization/{organizationId}/test:
 *   post:
 *     summary: Test Jira connection
 *     tags: [JiraIntegrations]
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
// Test Jira connection
router.post('/organization/:organizationId/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;
    const { jiraUrl, jiraEmail, jiraApiToken } = req.body;

    // Check if user is member of the organization
    const [memberCheck] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!jiraUrl || !jiraEmail || !jiraApiToken) {
      return res.status(400).json({ success: false, message: 'Jira credentials are required' });
    }

    // Test connection by fetching current user
    const authHeader = 'Basic ' + Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');
    const testUrl = `${jiraUrl}/rest/api/3/myself`;

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jira test connection failed:', response.status, errorText);
      return res.status(400).json({ 
        success: false, 
        message: `Failed to connect to Jira: ${response.status} ${response.statusText}` 
      });
    }

    const userData = await response.json();

    res.json({ 
      success: true, 
      message: 'Successfully connected to Jira',
      jiraUser: userData.displayName || userData.emailAddress
    });
  } catch (error: any) {
    console.error('Test Jira connection error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to test Jira connection' 
    });
  }
});

/**
 * @swagger
 * /api/jira-integrations/organization/{organizationId}/search:
 *   get:
 *     summary: Search Jira issues
 *     tags: [JiraIntegrations]
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
 *       - in: query
 *         name: projectKey
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Jira issues returned
 *       403:
 *         description: Access denied
 */
// Search Jira issues
router.get('/organization/:organizationId/search', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const { query } = req.query;
    const userId = req.user?.userId;

    // Check if user is member of the organization
    const [memberCheck] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );

    if (memberCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Get integration settings
    const [integration] = await pool.execute<RowDataPacket[]>(
      `SELECT IsEnabled, JiraUrl, JiraEmail, JiraApiToken, JiraProjectKey
       FROM OrganizationJiraIntegrations 
       WHERE OrganizationId = ? AND IsEnabled = 1`,
      [organizationId]
    );

    if (integration.length === 0) {
      return res.status(404).json({ success: false, message: 'Jira integration not configured or disabled' });
    }

    const { JiraUrl, JiraEmail, JiraApiToken: encryptedToken, JiraProjectKey } = integration[0];
    const JiraApiToken = decrypt(encryptedToken);

    // Build JQL query
    let jql = '';
    if (JiraProjectKey) {
      jql = `project = "${JiraProjectKey}"`;
    }
    
    if (query) {
      const searchTerm = String(query);
      if (jql) jql += ' AND ';
      jql += `(key = "${searchTerm}" OR summary ~ "${searchTerm}" OR description ~ "${searchTerm}")`;
    }

    if (!jql) {
      jql = 'ORDER BY created DESC';
    } else {
      jql += ' ORDER BY created DESC';
    }

    // Search Jira
    const authHeader = 'Basic ' + Buffer.from(`${JiraEmail}:${JiraApiToken}`).toString('base64');
    const searchUrl = `${JiraUrl}/rest/api/3/search/jql`;

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jql,
        maxResults: 50,
        fields: ['summary', 'description', 'status', 'priority', 'issuetype', 'created', 'assignee']
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jira search failed:', response.status, errorText);
      return res.status(400).json({ 
        success: false, 
        message: `Failed to search Jira: ${response.status} ${response.statusText}` 
      });
    }

    const data = await response.json();

    // Format results
    const issues = data.issues?.map((issue: any) => ({
      key: issue.key,
      summary: issue.fields?.summary,
      description: issue.fields?.description,
      status: issue.fields?.status?.name,
      priority: issue.fields?.priority?.name,
      issueType: issue.fields?.issuetype?.name,
      assignee: issue.fields?.assignee?.displayName,
      created: issue.fields?.created
    })) || [];

    res.json({ success: true, issues, total: data.total });
  } catch (error: any) {
    console.error('Search Jira issues error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to search Jira issues' 
    });
  }
});

/**
 * @swagger
 * /api/jira-integrations/project/{id}/issues:
 *   get:
 *     summary: Get Jira board issues for a project
 *     tags: [JiraIntegrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Jira issues for project board
 *       403:
 *         description: Access denied
 */
// Get Jira issues for a project (for importing into tasks)
router.get('/project/:projectId/issues', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId;

    // Get project and check access
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.*, om.UserId 
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (projects.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    const project = projects[0];

    // Get Jira integration
    const [integration] = await pool.execute<RowDataPacket[]>(
      `SELECT IsEnabled, JiraProjectsUrl, JiraProjectsEmail, JiraProjectsApiToken, JiraUrl, JiraEmail, JiraApiToken, JiraProjectKey
       FROM OrganizationJiraIntegrations 
       WHERE OrganizationId = ? AND IsEnabled = 1`,
      [project.OrganizationId]
    );

    if (integration.length === 0) {
      return res.status(404).json({ success: false, message: 'Jira integration not configured or disabled' });
    }

    const config = integration[0];
    
    // Prefer Projects configuration if available, otherwise use Tickets configuration
    const useProjectsConfig = config.JiraProjectsUrl && config.JiraProjectsEmail && config.JiraProjectsApiToken;
    const jiraUrl = useProjectsConfig ? config.JiraProjectsUrl : config.JiraUrl;
    const jiraEmail = useProjectsConfig ? config.JiraProjectsEmail : config.JiraEmail;
    const jiraApiToken = useProjectsConfig ? decrypt(config.JiraProjectsApiToken) : decrypt(config.JiraApiToken);
    
    // Extract project key from board URL if available
    let projectKey = null;
    if (project.JiraBoardId) {
      // URL format: https://domain.atlassian.net/jira/software/c/projects/OT/boards/15
      const match = project.JiraBoardId.match(/\/projects\/([A-Z0-9]+)/);
      if (match) {
        projectKey = match[1];
      }
    }
    
    // Fallback to config project key if not found in board URL
    if (!projectKey) {
      projectKey = config.JiraProjectKey;
    }

    console.log('Using Jira config - URL:', jiraUrl, 'Board URL:', project.JiraBoardId, 'Extracted Project Key:', projectKey);

    const authHeader = 'Basic ' + Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');
    
    // Build JQL - filter only unresolved issues excluding Developed and Canceled
    let jql = '';
    
    // If we have a project key, filter by it
    if (projectKey) {
      jql = `project = "${projectKey}" AND resolution = Unresolved AND status NOT IN ("Developed", "Canceled", "Cancelled") ORDER BY created DESC`;
    } else {
      // No project key, get recent unresolved issues
      jql = 'resolution = Unresolved AND status NOT IN ("Developed", "Canceled", "Cancelled") ORDER BY created DESC';
    }

    const searchUrl = `${jiraUrl}/rest/api/3/search/jql`;

    console.log('Fetching Jira issues with JQL:', jql);

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jql,
        maxResults: 100,
        fields: ['summary', 'description', 'status', 'priority', 'issuetype', 'created', 'assignee', 'parent', 'subtasks']
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jira search failed:', response.status, errorText);
      return res.status(400).json({ 
        success: false, 
        message: `Failed to fetch Jira issues: ${response.status} ${response.statusText}` 
      });
    }

    const data = await response.json();
    console.log('Jira returned', data.issues?.length || 0, 'issues');

    // Format results with parent/child relationships
    const issues = data.issues?.map((issue: any) => {
      // Convert ADF description to plain text if needed
      let description = '';
      if (issue.fields?.description) {
        if (typeof issue.fields.description === 'string') {
          description = issue.fields.description;
        } else if (issue.fields.description.type === 'doc') {
          // ADF format - extract text
          const extractText = (node: any): string => {
            if (node.text) return node.text;
            if (node.content) {
              return node.content.map(extractText).join('');
            }
            return '';
          };
          description = extractText(issue.fields.description);
        }
      }

      return {
        key: issue.key,
        summary: issue.fields?.summary,
        description,
        status: issue.fields?.status?.name,
        statusColor: issue.fields?.status?.statusCategory?.colorName,
        priority: issue.fields?.priority?.name,
        issueType: issue.fields?.issuetype?.name,
        assignee: issue.fields?.assignee?.displayName,
        created: issue.fields?.created,
        parentKey: issue.fields?.parent?.key || null,
        subtasks: issue.fields?.subtasks?.map((st: any) => ({
          key: st.key,
          summary: st.fields?.summary
        })) || []
      };
    }) || [];

    res.json({ success: true, data: issues, total: data.total || issues.length });
  } catch (error: any) {
    console.error('Get Jira project issues error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch Jira issues' 
    });
  }
});

/**
 * @swagger
 * /api/jira-integrations/organization/{organizationId}:
 *   delete:
 *     summary: Delete Jira integration
 *     tags: [JiraIntegrations]
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
// Delete Jira integration
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
      'DELETE FROM OrganizationJiraIntegrations WHERE OrganizationId = ?',
      [organizationId]
    );

    res.json({ success: true, message: 'Jira integration deleted successfully' });
  } catch (error) {
    console.error('Delete Jira integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete Jira integration' });
  }
});

export default router;
