import express, { Response } from 'express';
import { RowDataPacket, ResultSetHeader } from '../../config/database';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import { pool } from '../../config/database';
import { encrypt, decrypt } from '../../utils/encryption';
import logger from '../../utils/logger';

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
            JiraTicketsJqlFilter, HideIntegratedJiraTicketsByDefault,
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
    logger.error('Get Jira integration error:', error);
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
    const {
      isEnabled,
      jiraUrl,
      jiraEmail,
      jiraApiToken,
      jiraProjectKey,
      jiraTicketsJqlFilter,
      hideIntegratedJiraTicketsByDefault,
      jiraProjectsUrl,
      jiraProjectsEmail,
      jiraProjectsApiToken
    } = req.body;

    const normalizedJiraUrl = typeof jiraUrl === 'string' ? jiraUrl.trim() : '';
    const normalizedJiraEmail = typeof jiraEmail === 'string' ? jiraEmail.trim() : '';
    const normalizedMainToken = typeof jiraApiToken === 'string' ? jiraApiToken.trim() : '';
    const normalizedProjectsUrl = typeof jiraProjectsUrl === 'string' ? jiraProjectsUrl.trim() : '';
    const normalizedProjectsEmail = typeof jiraProjectsEmail === 'string' ? jiraProjectsEmail.trim() : '';
    const normalizedProjectsToken = typeof jiraProjectsApiToken === 'string' ? jiraProjectsApiToken.trim() : '';

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

    if (!normalizedJiraUrl || !normalizedJiraEmail) {
      return res.status(400).json({ success: false, message: 'Jira URL and email are required' });
    }

    // Check if integration exists
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId, JiraApiToken, JiraProjectsApiToken FROM OrganizationJiraIntegrations WHERE OrganizationId = ?',
      [organizationId]
    );

    const existingIntegration = existing.length > 0 ? existing[0] : null;

    const resolvedMainToken = normalizedMainToken || existingIntegration?.JiraApiToken || null;
    if (!resolvedMainToken) {
      return res.status(400).json({
        success: false,
        message: 'Jira API token is required when no token is currently configured'
      });
    }

    const hasProjectsCredentials = !!normalizedProjectsUrl || !!normalizedProjectsEmail || !!normalizedProjectsToken;
    const resolvedProjectsToken = hasProjectsCredentials
      ? (normalizedProjectsToken || existingIntegration?.JiraProjectsApiToken || null)
      : null;

    if (hasProjectsCredentials && normalizedProjectsUrl && normalizedProjectsEmail && !resolvedProjectsToken) {
      return res.status(400).json({
        success: false,
        message: 'Jira Projects API token is required when configuring Jira Projects credentials'
      });
    }

    // Encrypt the API tokens before storing
    const encryptedToken = normalizedMainToken ? encrypt(normalizedMainToken) : resolvedMainToken;
    const encryptedProjectsToken = normalizedProjectsToken
      ? encrypt(normalizedProjectsToken)
      : resolvedProjectsToken;

    if (existing.length > 0) {
      // Update existing
      await pool.execute(
        `UPDATE OrganizationJiraIntegrations 
         SET IsEnabled = ?, JiraUrl = ?, JiraEmail = ?, JiraApiToken = ?, JiraProjectKey = ?,
             JiraTicketsJqlFilter = ?, HideIntegratedJiraTicketsByDefault = ?,
             JiraProjectsUrl = ?, JiraProjectsEmail = ?, JiraProjectsApiToken = ?, UpdatedAt = CURRENT_TIMESTAMP
         WHERE OrganizationId = ?`,
        [
          isEnabled ? 1 : 0,
          normalizedJiraUrl,
          normalizedJiraEmail,
          encryptedToken,
          jiraProjectKey || null,
          jiraTicketsJqlFilter || null,
          hideIntegratedJiraTicketsByDefault ? 1 : 0,
          normalizedProjectsUrl || null,
          normalizedProjectsEmail || null,
          encryptedProjectsToken,
          organizationId
        ]
      );
    } else {
      // Create new
      await pool.execute(
        `INSERT INTO OrganizationJiraIntegrations (
          OrganizationId, IsEnabled, JiraUrl, JiraEmail, JiraApiToken, JiraProjectKey,
          JiraTicketsJqlFilter, HideIntegratedJiraTicketsByDefault,
          JiraProjectsUrl, JiraProjectsEmail, JiraProjectsApiToken
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          organizationId,
          isEnabled ? 1 : 0,
          normalizedJiraUrl,
          normalizedJiraEmail,
          encryptedToken,
          jiraProjectKey || null,
          jiraTicketsJqlFilter || null,
          hideIntegratedJiraTicketsByDefault ? 1 : 0,
          normalizedProjectsUrl || null,
          normalizedProjectsEmail || null,
          encryptedProjectsToken
        ]
      );
    }

    res.json({ success: true, message: 'Jira integration saved successfully' });
  } catch (error) {
    logger.error('Save Jira integration error:', error);
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
      logger.error('Jira test connection failed:', response.status, errorText);
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
    logger.error('Test Jira connection error:', error);
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
    const rawQuery = req.query.query;
    const query = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;
    const rawIgnoreConfiguredJql = req.query.ignoreConfiguredJql;
    const ignoreConfiguredJqlParam = Array.isArray(rawIgnoreConfiguredJql)
      ? rawIgnoreConfiguredJql[0]
      : rawIgnoreConfiguredJql;
    const hasSearchText = typeof query === 'string' && query.trim().length > 0;
    const ignoreConfiguredJql = hasSearchText || ignoreConfiguredJqlParam === 'true' || ignoreConfiguredJqlParam === '1';
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
      `SELECT IsEnabled, JiraUrl, JiraEmail, JiraApiToken, JiraProjectKey, JiraTicketsJqlFilter
       FROM OrganizationJiraIntegrations 
       WHERE OrganizationId = ? AND IsEnabled = 1`,
      [organizationId]
    );

    if (integration.length === 0) {
      return res.status(404).json({ success: false, message: 'Jira integration not configured or disabled' });
    }

    const { JiraUrl, JiraEmail, JiraApiToken: encryptedToken, JiraProjectKey, JiraTicketsJqlFilter } = integration[0];
    const JiraApiToken = decrypt(encryptedToken);

    // Build JQL query
    const jqlParts: string[] = [];

    if (!ignoreConfiguredJql && JiraProjectKey) {
      jqlParts.push(`project = "${JiraProjectKey}"`);
    }

    const rawConfiguredJql = ignoreConfiguredJql ? '' : String(JiraTicketsJqlFilter || '').trim();
    let configuredOrderBy = '';
    let configuredFilter = rawConfiguredJql;

    if (rawConfiguredJql) {
      const orderByMatch = rawConfiguredJql.match(/\border\s+by\b[\s\S]*$/i);
      if (orderByMatch) {
        configuredOrderBy = orderByMatch[0].trim();
        configuredFilter = rawConfiguredJql.slice(0, orderByMatch.index).trim();
      }

      if (configuredFilter) {
        jqlParts.push(`(${configuredFilter})`);
      }
    }

    if (query) {
      const searchTerm = String(query).trim();
      jqlParts.push(`(key = "${searchTerm}" OR summary ~ "${searchTerm}" OR description ~ "${searchTerm}")`);
    }

    const orderByClause = configuredOrderBy || 'ORDER BY created DESC';
    const baseQuery = jqlParts.length > 0
      ? jqlParts.join(' AND ')
      : 'created IS NOT EMPTY';
    const jql = `${baseQuery} ${orderByClause}`;

    // Search Jira
    const authHeader = 'Basic ' + Buffer.from(`${JiraEmail}:${JiraApiToken}`).toString('base64');
    const searchUrl = `${JiraUrl}/rest/api/3/search/jql`;

    const baseFields = ['summary', 'description', 'status', 'priority', 'issuetype', 'created', 'assignee', 'reporter'];
    let organizationsFieldId: string | null = null;
    let developerFieldId: string | null = null;

    try {
      const fieldsResponse = await fetch(`${JiraUrl}/rest/api/3/field`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      if (fieldsResponse.ok) {
        const fieldsData = await fieldsResponse.json();
        const allFields = Array.isArray(fieldsData) ? fieldsData : [];
        const organizationsField = allFields.find((field: any) => {
          const fieldName = String(field?.name || '').toLowerCase().trim();
          return fieldName === 'organizations' || fieldName.includes('organizations');
        });
        if (organizationsField?.id) {
          organizationsFieldId = String(organizationsField.id);
        }

        const developerField = allFields.find((field: any) => {
          const fieldName = String(field?.name || '').toLowerCase().trim();
          return fieldName === 'developer' || fieldName.includes('developer');
        });
        if (developerField?.id) {
          developerFieldId = String(developerField.id);
        }
      }
    } catch {
      organizationsFieldId = null;
      developerFieldId = null;
    }

    const requestedFields = [
      ...baseFields,
      ...(organizationsFieldId ? [organizationsFieldId] : []),
      ...(developerFieldId ? [developerFieldId] : []),
    ];

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jql,
        maxResults: 200,
        fields: requestedFields
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Jira search failed:', response.status, errorText);
      return res.status(400).json({ 
        success: false, 
        message: `Failed to search Jira: ${response.status} ${response.statusText}` 
      });
    }

    const data = await response.json();

    const extractOrganizations = (fields: any): string[] => {
      const toNames = (value: any): string[] => {
        if (!value) return [];
        const source = Array.isArray(value) ? value : [value];
        return source
          .map((entry: any) => {
            if (typeof entry === 'string') return entry;
            if (entry?.name) return String(entry.name);
            if (entry?.value) return String(entry.value);
            if (entry?.displayName) return String(entry.displayName);
            return '';
          })
          .filter((item: string) => item.trim().length > 0);
      };

      if (organizationsFieldId && fields?.[organizationsFieldId] !== undefined) {
        const extracted = toNames(fields[organizationsFieldId]);
        if (extracted.length > 0) return extracted;
      }

      const fallbackKey = Object.keys(fields || {}).find((key) => key.toLowerCase().includes('organization'));
      if (fallbackKey) {
        return toNames(fields[fallbackKey]);
      }

      return [];
    };

    const extractUserIdentity = (value: any): {
      displayName: string | null;
      email: string | null;
      accountId: string | null;
      key: string | null;
      name: string | null;
    } => {
      if (!value) {
        return { displayName: null, email: null, accountId: null, key: null, name: null };
      }

      const raw = Array.isArray(value) ? value[0] : value;
      if (!raw || typeof raw !== 'object') {
        return { displayName: null, email: null, accountId: null, key: null, name: null };
      }

      return {
        displayName: raw.displayName ? String(raw.displayName) : null,
        email: raw.emailAddress ? String(raw.emailAddress) : null,
        accountId: raw.accountId ? String(raw.accountId) : null,
        key: raw.key ? String(raw.key) : null,
        name: raw.name ? String(raw.name) : null,
      };
    };

    // Format results
    const issues = data.issues?.map((issue: any) => {
      const developerIdentity = extractUserIdentity(
        developerFieldId ? issue.fields?.[developerFieldId] : null
      );

      return {
        key: issue.key,
        summary: issue.fields?.summary,
        description: issue.fields?.description,
        status: issue.fields?.status?.name,
        priority: issue.fields?.priority?.name,
        issueType: issue.fields?.issuetype?.name,
        assignee: issue.fields?.assignee?.displayName,
        assigneeEmail: issue.fields?.assignee?.emailAddress || null,
        assigneeAccountId: issue.fields?.assignee?.accountId || null,
        assigneeKey: issue.fields?.assignee?.key || null,
        assigneeName: issue.fields?.assignee?.name || null,
        developer: developerIdentity.displayName,
        developerEmail: developerIdentity.email,
        developerAccountId: developerIdentity.accountId,
        developerKey: developerIdentity.key,
        developerName: developerIdentity.name,
        reporter: issue.fields?.reporter?.displayName || null,
        reporterEmail: issue.fields?.reporter?.emailAddress || null,
        reporterAccountId: issue.fields?.reporter?.accountId || null,
        organizations: extractOrganizations(issue.fields),
        created: issue.fields?.created
      };
    }) || [];

    res.json({ success: true, issues, total: data.total });
  } catch (error: any) {
    logger.error('Search Jira issues error:', error);
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

    logger.info('Using Jira config - URL:', jiraUrl, 'Board URL:', project.JiraBoardId, 'Extracted Project Key:', projectKey);

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

    logger.info('Fetching Jira issues with JQL:', jql);

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
      logger.error('Jira search failed:', response.status, errorText);
      return res.status(400).json({ 
        success: false, 
        message: `Failed to fetch Jira issues: ${response.status} ${response.statusText}` 
      });
    }

    const data = await response.json();
    logger.info('Jira returned', data.issues?.length || 0, 'issues');

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
        assigneeEmail: issue.fields?.assignee?.emailAddress || null,
        assigneeAccountId: issue.fields?.assignee?.accountId || null,
        assigneeKey: issue.fields?.assignee?.key || null,
        assigneeName: issue.fields?.assignee?.name || null,
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
    logger.error('Get Jira project issues error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch Jira issues' 
    });
  }
});

// Check live Jira status for board-linked issues in a project
router.get('/project/:projectId/check-board-statuses', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId;

    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.OrganizationId, p.JiraBoardId
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE p.Id = ? AND om.UserId = ?`,
      [projectId, userId]
    );

    if (projects.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or access denied' });
    }

    const project = projects[0];

    const [integration] = await pool.execute<RowDataPacket[]>(
      `SELECT IsEnabled, JiraProjectsUrl, JiraProjectsEmail, JiraProjectsApiToken, JiraUrl, JiraEmail, JiraApiToken
       FROM OrganizationJiraIntegrations
       WHERE OrganizationId = ? AND IsEnabled = 1`,
      [project.OrganizationId]
    );

    if (integration.length === 0) {
      return res.status(404).json({ success: false, message: 'Jira integration not configured or disabled' });
    }

    const config = integration[0];
    const useProjectsConfig = config.JiraProjectsUrl && config.JiraProjectsEmail && config.JiraProjectsApiToken;
    const jiraUrl = useProjectsConfig ? config.JiraProjectsUrl : config.JiraUrl;
    const jiraEmail = useProjectsConfig ? config.JiraProjectsEmail : config.JiraEmail;
    const jiraApiToken = useProjectsConfig ? decrypt(config.JiraProjectsApiToken) : decrypt(config.JiraApiToken);

    const [taskRows] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id as TaskId,
              t.TaskName,
              t.ExternalIssueId,
              t.JiraIssueKey,
              t.Status as StatusId,
              tsv.StatusName
       FROM Tasks t
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE t.ProjectId = ?
         AND (t.ExternalIssueId IS NOT NULL OR t.JiraIssueKey IS NOT NULL)`,
      [projectId]
    );

    if (taskRows.length === 0) {
      return res.json({ success: true, tickets: [] });
    }

    const issueKeyToTask = new Map<string, { taskId: number; taskName: string; taskStatusId: number | null; taskStatusName: string | null }>();
    for (const row of taskRows) {
      const key = String(row.ExternalIssueId || row.JiraIssueKey || '').trim();
      if (!key || issueKeyToTask.has(key)) continue;
      issueKeyToTask.set(key, {
        taskId: Number(row.TaskId),
        taskName: String(row.TaskName || ''),
        taskStatusId: row.StatusId === null || row.StatusId === undefined ? null : Number(row.StatusId),
        taskStatusName: row.StatusName ? String(row.StatusName) : null,
      });
    }

    const issueKeys = Array.from(issueKeyToTask.keys());
    if (issueKeys.length === 0) {
      return res.json({ success: true, tickets: [] });
    }

    const keysJql = issueKeys.map((k) => `"${k}"`).join(', ');
    const jql = `key in (${keysJql}) ORDER BY created DESC`;

    const authHeader = 'Basic ' + Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64');
    const searchUrl = `${jiraUrl}/rest/api/3/search/jql`;

    const jiraResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jql, maxResults: 500, fields: ['summary', 'status'] }),
    });

    if (!jiraResponse.ok) {
      const errorText = await jiraResponse.text();
      logger.error('Jira check-board-statuses search failed:', jiraResponse.status, errorText);
      return res.status(400).json({ success: false, message: `Failed to query Jira: ${jiraResponse.status} ${jiraResponse.statusText}` });
    }

    const jiraData = await jiraResponse.json();
    const jiraIssueMap = new Map<string, { jiraSummary: string; jiraStatus: string }>();
    for (const issue of (jiraData.issues || [])) {
      jiraIssueMap.set(String(issue.key), {
        jiraSummary: String(issue.fields?.summary || ''),
        jiraStatus: String(issue.fields?.status?.name || ''),
      });
    }

    const tickets = issueKeys
      .filter((key) => jiraIssueMap.has(key))
      .map((key) => {
        const task = issueKeyToTask.get(key)!;
        const jira = jiraIssueMap.get(key)!;
        return {
          issueKey: key,
          jiraSummary: jira.jiraSummary,
          jiraStatus: jira.jiraStatus,
          taskId: task.taskId,
          taskName: task.taskName,
          taskStatusId: task.taskStatusId,
          taskStatusName: task.taskStatusName,
        };
      });

    res.json({ success: true, tickets });
  } catch (error: any) {
    logger.error('Check board statuses error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to check board statuses' });
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
// Check live Jira status for all integrated tickets in a project
router.get('/organization/:organizationId/check-ticket-statuses', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const rawProjectId = req.query.projectId;
    const projectId = rawProjectId ? Number(rawProjectId) : null;
    const userId = req.user?.userId;

    // Access check
    const [memberCheck] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );
    if (memberCheck.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Get Jira integration credentials
    const [integration] = await pool.execute<RowDataPacket[]>(
      `SELECT IsEnabled, JiraUrl, JiraEmail, JiraApiToken
       FROM OrganizationJiraIntegrations
       WHERE OrganizationId = ? AND IsEnabled = 1`,
      [organizationId]
    );
    if (integration.length === 0) {
      return res.status(404).json({ success: false, message: 'Jira integration not configured or disabled' });
    }

    const { JiraUrl, JiraEmail, JiraApiToken: encryptedToken } = integration[0];
    const JiraApiToken = decrypt(encryptedToken);

    // Fetch tasks with Jira issue keys, optionally filtered by project
    const taskQuery = projectId
      ? `SELECT t.Id as TaskId, t.TaskName, t.JiraIssueKey, t.ExternalIssueId, t.Status as StatusId, tsv.StatusName
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         WHERE p.Id = ? AND p.OrganizationId = ?
           AND (t.JiraIssueKey IS NOT NULL OR t.ExternalIssueId IS NOT NULL)`
      : `SELECT t.Id as TaskId, t.TaskName, t.JiraIssueKey, t.ExternalIssueId, t.Status as StatusId, tsv.StatusName
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         WHERE p.OrganizationId = ?
           AND (t.JiraIssueKey IS NOT NULL OR t.ExternalIssueId IS NOT NULL)`;

    const taskParams = projectId ? [projectId, organizationId] : [organizationId];
    const [taskRows] = await pool.execute<RowDataPacket[]>(taskQuery, taskParams);

    if (taskRows.length === 0) {
      return res.json({ success: true, tickets: [] });
    }

    // Build issue key → task map (prefer JiraIssueKey, fallback to ExternalIssueId)
    const issueKeyToTask = new Map<string, { taskId: number; taskName: string; taskStatusId: number | null; taskStatusName: string | null }>();
    for (const row of taskRows) {
      const key = String(row.JiraIssueKey || row.ExternalIssueId || '').trim();
      if (key && !issueKeyToTask.has(key)) {
        issueKeyToTask.set(key, {
          taskId: Number(row.TaskId),
          taskName: String(row.TaskName || ''),
          taskStatusId: row.StatusId !== null && row.StatusId !== undefined ? Number(row.StatusId) : null,
          taskStatusName: row.StatusName ? String(row.StatusName) : null,
        });
      }
    }

    const issueKeys = Array.from(issueKeyToTask.keys());
    const keysJql = issueKeys.map(k => `"${k}"`).join(', ');
    const jql = `key in (${keysJql}) ORDER BY created DESC`;

    const authHeader = 'Basic ' + Buffer.from(`${JiraEmail}:${JiraApiToken}`).toString('base64');
    const searchUrl = `${JiraUrl}/rest/api/3/search/jql`;

    const jiraResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jql, maxResults: 500, fields: ['summary', 'status'] }),
    });

    if (!jiraResponse.ok) {
      const errorText = await jiraResponse.text();
      logger.error('Jira check-ticket-statuses search failed:', jiraResponse.status, errorText);
      return res.status(400).json({ success: false, message: `Failed to query Jira: ${jiraResponse.status} ${jiraResponse.statusText}` });
    }

    const jiraData = await jiraResponse.json();
    const jiraIssueMap = new Map<string, { jiraSummary: string; jiraStatus: string }>();
    for (const issue of (jiraData.issues || [])) {
      jiraIssueMap.set(String(issue.key), {
        jiraSummary: String(issue.fields?.summary || ''),
        jiraStatus: String(issue.fields?.status?.name || ''),
      });
    }

    // Merge results
    const tickets = issueKeys
      .filter(key => jiraIssueMap.has(key))
      .map(key => {
        const task = issueKeyToTask.get(key)!;
        const jira = jiraIssueMap.get(key)!;
        return {
          issueKey: key,
          jiraSummary: jira.jiraSummary,
          jiraStatus: jira.jiraStatus,
          taskId: task.taskId,
          taskName: task.taskName,
          taskStatusId: task.taskStatusId,
          taskStatusName: task.taskStatusName,
        };
      });

    res.json({ success: true, tickets });
  } catch (error: any) {
    logger.error('Check ticket statuses error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to check ticket statuses' });
  }
});

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
    logger.error('Delete Jira integration error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete Jira integration' });
  }
});

export default router;
