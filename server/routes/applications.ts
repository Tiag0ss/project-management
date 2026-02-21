import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import PDFDocument from 'pdfkit';

const router = Router();

// ─── Applications ─────────────────────────────────────────────────────────────

// GET /api/applications - list all applications visible to the current user
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { organizationId } = req.query;

    let query = `
      SELECT a.*,
             u.FirstName, u.LastName, u.Username as CreatorUsername,
             o.Name as OrganizationName,
             COUNT(DISTINCT ap.ProjectId) as ProjectCount,
             COUNT(DISTINCT ac.CustomerId) as CustomerCount,
             COUNT(DISTINCT av.Id) as VersionCount
      FROM Applications a
      LEFT JOIN Users u ON a.CreatedBy = u.Id
      LEFT JOIN Organizations o ON a.OrganizationId = o.Id
      LEFT JOIN ApplicationProjects ap ON a.Id = ap.ApplicationId
      LEFT JOIN ApplicationCustomers ac ON a.Id = ac.ApplicationId
      LEFT JOIN ApplicationVersions av ON a.Id = av.ApplicationId
      INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
      WHERE a.IsActive = 1
    `;
    const params: (number | string)[] = [userId!];

    if (organizationId) {
      query += ' AND a.OrganizationId = ?';
      params.push(parseInt(organizationId as string));
    }

    query += ' GROUP BY a.Id ORDER BY a.Name ASC';

    const [apps] = await pool.execute<RowDataPacket[]>(query, params);

    // Load customers for each app
    for (const app of apps) {
      const [customers] = await pool.execute<RowDataPacket[]>(
        `SELECT c.Id, c.Name FROM Customers c
         INNER JOIN ApplicationCustomers ac ON c.Id = ac.CustomerId
         WHERE ac.ApplicationId = ?`,
        [app.Id]
      );
      app.Customers = customers;
    }

    res.json({ success: true, applications: apps });
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch applications' });
  }
});

// GET /api/applications/:id - get application detail
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const [apps] = await pool.execute<RowDataPacket[]>(
      `SELECT a.*, u.FirstName, u.LastName, u.Username as CreatorUsername, o.Name as OrganizationName
       FROM Applications a
       LEFT JOIN Users u ON a.CreatedBy = u.Id
       LEFT JOIN Organizations o ON a.OrganizationId = o.Id
       INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
       WHERE a.Id = ? AND a.IsActive = 1`,
      [userId, id]
    );

    if (apps.length === 0) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const app = apps[0];

    // Load customers
    const [customers] = await pool.execute<RowDataPacket[]>(
      `SELECT c.Id, c.Name, c.Email FROM Customers c
       INNER JOIN ApplicationCustomers ac ON c.Id = ac.CustomerId
       WHERE ac.ApplicationId = ?`,
      [id]
    );
    app.Customers = customers;

    // Load projects
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.ProjectName, p.Status, psv.StatusName, psv.ColorCode as StatusColor
       FROM Projects p
       INNER JOIN ApplicationProjects ap ON p.Id = ap.ProjectId
       LEFT JOIN ProjectStatusValues psv ON p.Status = psv.Id
       WHERE ap.ApplicationId = ?`,
      [id]
    );
    app.Projects = projects;

    // Load versions
    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT av.*, u.FirstName, u.LastName,
              COUNT(DISTINCT avt.TaskId) as TaskCount
       FROM ApplicationVersions av
       LEFT JOIN Users u ON av.CreatedBy = u.Id
       LEFT JOIN ApplicationVersionTasks avt ON av.Id = avt.VersionId
       WHERE av.ApplicationId = ?
       GROUP BY av.Id
       ORDER BY av.CreatedAt DESC`,
      [id]
    );
    app.Versions = versions;

    res.json({ success: true, application: app });
  } catch (error) {
    console.error('Error fetching application:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch application' });
  }
});

// POST /api/applications - create application
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { Name, Description, RepositoryUrl, OrganizationId, CustomerIds } = req.body;

    if (!Name || !OrganizationId) {
      return res.status(400).json({ success: false, message: 'Name and OrganizationId are required' });
    }

    // Check permissions
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Admin can create applications
    if (!user[0].isAdmin) {
      // Check role permissions
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanCreateApplications FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanCreateApplications === 1);
      }

      // Check organization-level permissions
      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanCreateApplications FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, OrganizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanCreateApplications === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to create applications.' });
      }
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Applications (Name, Description, RepositoryUrl, OrganizationId, CreatedBy)
       VALUES (?, ?, ?, ?, ?)`,
      [Name, Description || null, RepositoryUrl || null, OrganizationId, userId]
    );

    const appId = result.insertId;

    // Associate customers
    if (Array.isArray(CustomerIds) && CustomerIds.length > 0) {
      for (const customerId of CustomerIds) {
        await pool.execute(
          'INSERT IGNORE INTO ApplicationCustomers (ApplicationId, CustomerId) VALUES (?, ?)',
          [appId, customerId]
        );
      }
    }

    res.status(201).json({ success: true, id: appId, message: 'Application created' });
  } catch (error) {
    console.error('Error creating application:', error);
    res.status(500).json({ success: false, message: 'Failed to create application' });
  }
});

// PUT /api/applications/:id - update application
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { Name, Description, RepositoryUrl, CustomerIds } = req.body;

    if (!Name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    // Get application organization ID
    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
      [id]
    );

    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const organizationId = apps[0].OrganizationId;

    // Check permissions
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Admin can manage applications
    if (!user[0].isAdmin) {
      // Check role permissions
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanManageApplications FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanManageApplications === 1);
      }

      // Check organization-level permissions
      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanManageApplications FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, organizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanManageApplications === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage applications.' });
      }
    }

    await pool.execute(
      `UPDATE Applications SET Name = ?, Description = ?, RepositoryUrl = ? WHERE Id = ?`,
      [Name, Description || null, RepositoryUrl || null, id]
    );

    // Sync customers
    if (Array.isArray(CustomerIds)) {
      await pool.execute('DELETE FROM ApplicationCustomers WHERE ApplicationId = ?', [id]);
      for (const customerId of CustomerIds) {
        await pool.execute(
          'INSERT IGNORE INTO ApplicationCustomers (ApplicationId, CustomerId) VALUES (?, ?)',
          [id, customerId]
        );
      }
    }

    res.json({ success: true, message: 'Application updated' });
  } catch (error) {
    console.error('Error updating application:', error);
    res.status(500).json({ success: false, message: 'Failed to update application' });
  }
});

// DELETE /api/applications/:id - soft delete
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    // Get application organization ID
    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
      [id]
    );

    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const organizationId = apps[0].OrganizationId;

    // Check permissions
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Admin can delete applications
    if (!user[0].isAdmin) {
      // Check role permissions
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanDeleteApplications FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanDeleteApplications === 1);
      }

      // Check organization-level permissions
      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanDeleteApplications FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, organizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanDeleteApplications === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to delete applications.' });
      }
    }

    await pool.execute('UPDATE Applications SET IsActive = 0 WHERE Id = ?', [id]);
    res.json({ success: true, message: 'Application deleted' });
  } catch (error) {
    console.error('Error deleting application:', error);
    res.status(500).json({ success: false, message: 'Failed to delete application' });
  }
});

// ─── Application ↔ Projects ────────────────────────────────────────────────────

// PUT /api/applications/:id/projects - set project associations
router.put('/:id/projects', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { ProjectIds } = req.body;

    await pool.execute('DELETE FROM ApplicationProjects WHERE ApplicationId = ?', [id]);
    if (Array.isArray(ProjectIds)) {
      for (const projectId of ProjectIds) {
        await pool.execute(
          'INSERT IGNORE INTO ApplicationProjects (ApplicationId, ProjectId) VALUES (?, ?)',
          [id, projectId]
        );
      }
    }

    res.json({ success: true, message: 'Project associations updated' });
  } catch (error) {
    console.error('Error updating project associations:', error);
    res.status(500).json({ success: false, message: 'Failed to update project associations' });
  }
});

// GET /api/applications/:id/tasks - list all tasks from the application's associated projects
router.get('/:id/tasks', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { excludeVersion } = req.query;

    const appId = parseInt(Array.isArray(id) ? id[0] : id);

    // Build query to exclude tasks already in other versions
    let query = `
      SELECT t.Id, t.TaskName, t.Description, t.Status, t.Priority, t.ProjectId,
             tsv.StatusName, tsv.ColorCode as StatusColor,
             tpv.PriorityName, tpv.ColorCode as PriorityColor,
             p.ProjectName,
             u.FirstName as AssigneeFN, u.LastName as AssigneeLN
      FROM Tasks t
      INNER JOIN ApplicationProjects ap ON t.ProjectId = ap.ProjectId AND ap.ApplicationId = ?
      LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
      LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
      LEFT JOIN Projects p ON t.ProjectId = p.Id
      LEFT JOIN Users u ON t.AssignedTo = u.Id
      WHERE t.Id NOT IN (
        SELECT avt.TaskId FROM ApplicationVersionTasks avt
        INNER JOIN ApplicationVersions av ON avt.VersionId = av.Id
        WHERE av.ApplicationId = ?`;
    
    const params: number[] = [appId, appId];

    // If editing a version, allow tasks from that version to be shown
    if (excludeVersion) {
      query += ' AND avt.VersionId != ?';
      const versionId = parseInt(String(Array.isArray(excludeVersion) ? excludeVersion[0] : excludeVersion));
      params.push(versionId);
    }

    query += `
      )
      ORDER BY p.ProjectName, t.DisplayOrder, t.Id`;

    const [tasks] = await pool.execute<RowDataPacket[]>(query, params);

    res.json({ success: true, tasks });
  } catch (error) {
    console.error('Error fetching application tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tasks' });
  }
});

// ─── Versions ─────────────────────────────────────────────────────────────────

// GET /api/applications/:id/versions - list versions
router.get('/:id/versions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT av.*, u.FirstName, u.LastName,
              COUNT(DISTINCT avt.TaskId) as TaskCount
       FROM ApplicationVersions av
       LEFT JOIN Users u ON av.CreatedBy = u.Id
       LEFT JOIN ApplicationVersionTasks avt ON av.Id = avt.VersionId
       WHERE av.ApplicationId = ?
       GROUP BY av.Id
       ORDER BY av.CreatedAt DESC`,
      [id]
    );

    res.json({ success: true, versions });
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch versions' });
  }
});

// GET /api/applications/:id/versions/:versionId - get version detail with tasks and patch notes
router.get('/:id/versions/:versionId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { versionId } = req.params;

    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT av.*, u.FirstName, u.LastName, a.Name as ApplicationName
       FROM ApplicationVersions av
       LEFT JOIN Users u ON av.CreatedBy = u.Id
       LEFT JOIN Applications a ON av.ApplicationId = a.Id
       WHERE av.Id = ?`,
      [versionId]
    );

    if (versions.length === 0) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    const version = versions[0];

    // Load tasks in this version
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.TaskName, t.Description, t.Status, t.Priority,
              tsv.StatusName, tsv.ColorCode as StatusColor,
              tpv.PriorityName, tpv.ColorCode as PriorityColor,
              p.ProjectName,
              u.FirstName as AssigneeFN, u.LastName as AssigneeLN
       FROM Tasks t
       INNER JOIN ApplicationVersionTasks avt ON t.Id = avt.TaskId
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
       LEFT JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN Users u ON t.AssignedTo = u.Id
       WHERE avt.VersionId = ?
       ORDER BY t.DisplayOrder, t.Id`,
      [versionId]
    );

    version.Tasks = tasks;

    res.json({ success: true, version });
  } catch (error) {
    console.error('Error fetching version:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch version' });
  }
});

// POST /api/applications/:id/versions - create version
router.post('/:id/versions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { VersionNumber, VersionName, Status, ReleaseDate, PatchNotes } = req.body;

    if (!VersionNumber) {
      return res.status(400).json({ success: false, message: 'VersionNumber is required' });
    }

    // Get application organization ID
    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
      [id]
    );

    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const organizationId = apps[0].OrganizationId;

    // Check permissions
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Admin can manage releases
    if (!user[0].isAdmin) {
      // Check role permissions
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanManageReleases FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanManageReleases === 1);
      }

      // Check organization-level permissions
      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanManageReleases FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, organizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanManageReleases === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage releases.' });
      }
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ApplicationVersions (ApplicationId, VersionNumber, VersionName, Status, ReleaseDate, PatchNotes, CreatedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, VersionNumber, VersionName || null, Status || 'Planning', ReleaseDate || null, PatchNotes || null, userId]
    );

    res.status(201).json({ success: true, id: result.insertId, message: 'Version created' });
  } catch (error) {
    console.error('Error creating version:', error);
    res.status(500).json({ success: false, message: 'Failed to create version' });
  }
});

// PUT /api/applications/:id/versions/:versionId - update version
router.put('/:id/versions/:versionId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id, versionId } = req.params;
    const { VersionNumber, VersionName, Status, ReleaseDate, PatchNotes } = req.body;

    // Get application organization ID
    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
      [id]
    );

    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const organizationId = apps[0].OrganizationId;

    // Check permissions
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Admin can manage releases
    if (!user[0].isAdmin) {
      // Check role permissions
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanManageReleases FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanManageReleases === 1);
      }

      // Check organization-level permissions
      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanManageReleases FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, organizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanManageReleases === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage releases.' });
      }
    }

    // Get current version status to detect status change
    const [currentVersion] = await pool.execute<RowDataPacket[]>(
      'SELECT Status FROM ApplicationVersions WHERE Id = ?',
      [versionId]
    );

    const wasReleased = currentVersion.length > 0 && currentVersion[0].Status === 'Released';
    const isNowReleased = Status === 'Released';

    await pool.execute(
      `UPDATE ApplicationVersions SET VersionNumber = ?, VersionName = ?, Status = ?, ReleaseDate = ?, PatchNotes = ?
       WHERE Id = ?`,
      [VersionNumber, VersionName || null, Status || 'Planning', ReleaseDate || null, PatchNotes || null, versionId]
    );

    // If version is being released (status changed to Released), update associated tasks
    if (isNowReleased && !wasReleased) {
      // Get organization ID from application
      const [apps] = await pool.execute<RowDataPacket[]>(
        'SELECT OrganizationId FROM Applications WHERE Id = ?',
        [id]
      );

      if (apps.length > 0) {
        const organizationId = apps[0].OrganizationId;

        // Find the "closed/completed" status for this organization
        const [closedStatuses] = await pool.execute<RowDataPacket[]>(
          'SELECT Id FROM TaskStatusValues WHERE OrganizationId = ? AND IsClosed = 1 ORDER BY SortOrder ASC LIMIT 1',
          [organizationId]
        );

        if (closedStatuses.length > 0) {
          const closedStatusId = closedStatuses[0].Id;

          // Get all tasks associated with this version
          const [versionTasks] = await pool.execute<RowDataPacket[]>(
            'SELECT TaskId FROM ApplicationVersionTasks WHERE VersionId = ?',
            [versionId]
          );

          // Update each task: set ReleaseVersionId and mark as closed
          for (const vt of versionTasks) {
            await pool.execute(
              'UPDATE Tasks SET ReleaseVersionId = ?, Status = ? WHERE Id = ?',
              [versionId, closedStatusId, vt.TaskId]
            );
          }
        }
      }
    }

    res.json({ success: true, message: 'Version updated' });
  } catch (error) {
    console.error('Error updating version:', error);
    res.status(500).json({ success: false, message: 'Failed to update version' });
  }
});

// DELETE /api/applications/:id/versions/:versionId - delete version
router.delete('/:id/versions/:versionId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id, versionId } = req.params;

    // Get application organization ID
    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
      [id]
    );

    if (!apps.length) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const organizationId = apps[0].OrganizationId;

    // Check permissions
    const [user] = await pool.execute<RowDataPacket[]>(
      'SELECT isAdmin, IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
      [userId]
    );

    if (!user.length) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Admin can manage releases
    if (!user[0].isAdmin) {
      // Check role permissions
      const roles: string[] = [];
      if (user[0].IsDeveloper) roles.push('Developer');
      if (user[0].IsSupport) roles.push('Support');
      if (user[0].IsManager) roles.push('Manager');

      let hasPermission = false;
      if (roles.length > 0) {
        const placeholders = roles.map(() => '?').join(',');
        const [rolePerms] = await pool.execute<RowDataPacket[]>(
          `SELECT CanManageReleases FROM RolePermissions WHERE RoleName IN (${placeholders})`,
          roles
        );
        hasPermission = rolePerms.some((rp: any) => rp.CanManageReleases === 1);
      }

      // Check organization-level permissions
      if (!hasPermission) {
        const [orgPerms] = await pool.execute<RowDataPacket[]>(
          `SELECT pg.CanManageReleases FROM PermissionGroups pg
           INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
           WHERE om.UserId = ? AND pg.OrganizationId = ?`,
          [userId, organizationId]
        );
        hasPermission = orgPerms.some((op: any) => op.CanManageReleases === 1);
      }

      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'Access denied. You do not have permission to manage releases.' });
      }
    }

    await pool.execute('DELETE FROM ApplicationVersionTasks WHERE VersionId = ?', [versionId]);
    // Set ReleaseVersionId to null on tasks that reference this version
    await pool.execute('UPDATE Tasks SET ReleaseVersionId = NULL WHERE ReleaseVersionId = ?', [versionId]);
    await pool.execute('DELETE FROM ApplicationVersions WHERE Id = ?', [versionId]);
    res.json({ success: true, message: 'Version deleted' });
  } catch (error) {
    console.error('Error deleting version:', error);
    res.status(500).json({ success: false, message: 'Failed to delete version' });
  }
});

// ─── Version ↔ Tasks ──────────────────────────────────────────────────────────

// PUT /api/applications/:id/versions/:versionId/tasks - set tasks in a version
router.put('/:id/versions/:versionId/tasks', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { versionId } = req.params;
    const { TaskIds } = req.body;

    await pool.execute('DELETE FROM ApplicationVersionTasks WHERE VersionId = ?', [versionId]);
    if (Array.isArray(TaskIds)) {
      for (const taskId of TaskIds) {
        await pool.execute(
          'INSERT IGNORE INTO ApplicationVersionTasks (VersionId, TaskId) VALUES (?, ?)',
          [versionId, taskId]
        );
      }
    }

    res.json({ success: true, message: 'Version tasks updated' });
  } catch (error) {
    console.error('Error updating version tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to update version tasks' });
  }
});

// POST /api/applications/:id/versions/:versionId/tasks/:taskId - add task to version
router.post('/:id/versions/:versionId/tasks/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { versionId, taskId } = req.params;
    await pool.execute(
      'INSERT IGNORE INTO ApplicationVersionTasks (VersionId, TaskId) VALUES (?, ?)',
      [versionId, taskId]
    );
    res.json({ success: true, message: 'Task added to version' });
  } catch (error) {
    console.error('Error adding task to version:', error);
    res.status(500).json({ success: false, message: 'Failed to add task to version' });
  }
});

// DELETE /api/applications/:id/versions/:versionId/tasks/:taskId - remove task from version
router.delete('/:id/versions/:versionId/tasks/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { versionId, taskId } = req.params;
    await pool.execute(
      'DELETE FROM ApplicationVersionTasks WHERE VersionId = ? AND TaskId = ?',
      [versionId, taskId]
    );
    res.json({ success: true, message: 'Task removed from version' });
  } catch (error) {
    console.error('Error removing task from version:', error);
    res.status(500).json({ success: false, message: 'Failed to remove task from version' });
  }
});

// GET /api/applications/public/patch-notes/:versionId - public patch notes (no auth required)
router.get('/public/patch-notes/:versionId', async (req, res) => {
  try {
    const { versionId } = req.params;

    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT av.VersionNumber, av.VersionName, av.ReleaseDate, av.PatchNotes, av.Status,
              a.Name as ApplicationName, a.RepositoryUrl
       FROM ApplicationVersions av
       INNER JOIN Applications a ON av.ApplicationId = a.Id
       WHERE av.Id = ? AND av.Status = 'Released'`,
      [versionId]
    );

    if (versions.length === 0) {
      return res.status(404).json({ success: false, message: 'Version not found or not yet released' });
    }

    const version = versions[0];

    // Load tasks
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.TaskName, t.Description, tsv.StatusName,
              tpv.PriorityName, tpv.ColorCode as PriorityColor
       FROM Tasks t
       INNER JOIN ApplicationVersionTasks avt ON t.Id = avt.TaskId
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
       WHERE avt.VersionId = ?
       ORDER BY t.DisplayOrder, t.Id`,
      [versionId]
    );

    version.Tasks = tasks;

    res.json({ success: true, version });
  } catch (error) {
    console.error('Error fetching patch notes:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patch notes' });
  }
});

// GET /api/applications/:id/versions/:versionId/pdf - download PDF for a specific version
router.get('/:id/versions/:versionId/pdf', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id, versionId } = req.params;
    const userId = req.user?.userId;

    // Check access
    const [apps] = await pool.execute<RowDataPacket[]>(
      `SELECT a.Name FROM Applications a
       INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
       WHERE a.Id = ? AND a.IsActive = 1`,
      [userId, id]
    );

    if (apps.length === 0) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const appName = apps[0].Name;

    // Get version details
    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT av.VersionNumber, av.VersionName, av.ReleaseDate, av.PatchNotes, av.Status
       FROM ApplicationVersions av
       WHERE av.Id = ? AND av.ApplicationId = ?`,
      [versionId, id]
    );

    if (versions.length === 0) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    const version = versions[0];

    // Generate PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const filename = `${appName.replace(/[^a-z0-9]/gi, '_')}-v${version.VersionNumber}-release-notes.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    const blue = '#3b82f6';
    const darkGray = '#1f2937';
    const midGray = '#6b7280';
    const green = '#10b981';

    // Header
    doc.rect(0, 0, 595, 70).fill(blue);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
      .text('Release Notes', 40, 20);
    doc.fontSize(14).font('Helvetica')
      .text(`${appName} - Version ${version.VersionNumber}`, 40, 45);
    doc.fillColor(darkGray);

    doc.y = 90;

    // Version info
    doc.fontSize(11).fillColor(midGray);
    if (version.VersionName) {
      doc.text(`Version Name: ${version.VersionName}`, 40);
      doc.moveDown(0.3);
    }
    if (version.ReleaseDate) {
      doc.text(`Release Date: ${new Date(version.ReleaseDate).toLocaleDateString()}`, 40);
      doc.moveDown(0.3);
    }
    const statusColor = version.Status === 'Released' ? green : midGray;
    doc.fillColor(statusColor).text(`Status: ${version.Status}`, 40);
    doc.moveDown(1);

    // Patch notes
    doc.fillColor(darkGray).fontSize(12).font('Helvetica-Bold')
      .text('Patch Notes', 40);
    doc.moveDown(0.5);

    if (version.PatchNotes) {
      // Convert HTML to formatted text
      let plainText = version.PatchNotes
        // Convert list items to bullet points
        .replace(/<li>/gi, '• ')
        .replace(/<\/li>/gi, '\n')
        // Convert paragraphs to line breaks
        .replace(/<p>/gi, '')
        .replace(/<\/p>/gi, '\n\n')
        // Convert strong/bold tags
        .replace(/<strong>/gi, '')
        .replace(/<\/strong>/gi, '')
        // Remove other HTML tags
        .replace(/<[^>]*>/g, '')
        // Decode HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        // Clean up extra whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (plainText) {
        const lines = plainText.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            if (line.trim().startsWith('•')) {
              // Bullet point
              doc.fillColor(darkGray).fontSize(10).font('Helvetica')
                .text(line.trim(), 50, doc.y, { lineGap: 2 });
            } else {
              // Regular text
              doc.fillColor(darkGray).fontSize(10).font('Helvetica')
                .text(line.trim(), 40, doc.y, { lineGap: 2 });
            }
          } else {
            // Empty line for spacing
            doc.moveDown(0.3);
          }
        }
      } else {
        doc.fillColor(midGray).fontSize(10).font('Helvetica-Oblique')
          .text('No patch notes available.', 40);
      }
    } else {
      doc.fillColor(midGray).fontSize(10).font('Helvetica-Oblique')
        .text('No patch notes available.', 40);
    }

    // Footer
    doc.fontSize(7).fillColor(midGray)
      .text(
        `Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`,
        40,
        780,
        { align: 'center', width: 515 }
      );

    doc.end();
  } catch (error) {
    console.error('Error generating version PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
  }
});

// GET /api/applications/:id/pdf - download PDF for date range
router.get('/:id/pdf', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    const userId = req.user?.userId;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }

    // Check access
    const [apps] = await pool.execute<RowDataPacket[]>(
      `SELECT a.Name FROM Applications a
       INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
       WHERE a.Id = ? AND a.IsActive = 1`,
      [userId, id]
    );

    if (apps.length === 0) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const appName = apps[0].Name;

    // Get versions in date range
    const [versions] = await pool.execute<RowDataPacket[]>(
      `SELECT av.VersionNumber, av.VersionName, av.ReleaseDate, av.PatchNotes, av.Status
       FROM ApplicationVersions av
       WHERE av.ApplicationId = ?
         AND av.Status = 'Released'
         AND av.ReleaseDate >= ?
         AND av.ReleaseDate <= ?
       ORDER BY av.ReleaseDate DESC`,
      [id, startDate, endDate]
    );

    if (versions.length === 0) {
      return res.status(404).json({ success: false, message: 'No released versions found in the specified date range' });
    }

    // Generate PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const filename = `${appName.replace(/[^a-z0-9]/gi, '_')}-release-notes-${startDate}-to-${endDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    const blue = '#3b82f6';
    const darkGray = '#1f2937';
    const midGray = '#6b7280';
    const green = '#10b981';

    // Header
    doc.rect(0, 0, 595, 80).fill(blue);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
      .text('Release Notes', 40, 20);
    doc.fontSize(14).font('Helvetica')
      .text(appName, 40, 45);
    doc.fontSize(10)
      .text(`${new Date(startDate as string).toLocaleDateString()} - ${new Date(endDate as string).toLocaleDateString()}`, 40, 62);
    doc.fillColor(darkGray);

    doc.y = 95;

    // Summary
    doc.fontSize(9).fillColor(midGray)
      .text(`${versions.length} version(s) released in this period`, 40);
    doc.moveDown(1);

    // Each version
    for (let i = 0; i < versions.length; i++) {
      const version = versions[i];

      if (doc.y > 700) {
        doc.addPage();
      }

      // Version header with background
      const boxY = doc.y;
      doc.rect(40, boxY, 515, 30).fill('#f3f4f6');
      doc.fillColor(darkGray).fontSize(14).font('Helvetica-Bold')
        .text(`Version ${version.VersionNumber}`, 45, boxY + 6);
      if (version.VersionName) {
        doc.fontSize(10).font('Helvetica')
          .text(version.VersionName, 45, boxY + 22);
      }
      doc.y = boxY + 35;

      // Version info
      doc.fontSize(9).fillColor(midGray);
      if (version.ReleaseDate) {
        doc.text(`Released: ${new Date(version.ReleaseDate).toLocaleDateString()}`, 45);
        doc.moveDown(0.3);
      }
      doc.fillColor(green).text(`Status: ${version.Status}`, 45);
      doc.moveDown(0.8);

      // Patch notes
      if (version.PatchNotes) {
        // Convert HTML to formatted text
        let plainText = version.PatchNotes
          // Convert list items to bullet points
          .replace(/<li>/gi, '• ')
          .replace(/<\/li>/gi, '\n')
          // Convert paragraphs to line breaks
          .replace(/<p>/gi, '')
          .replace(/<\/p>/gi, '\n\n')
          // Convert strong/bold tags
          .replace(/<strong>/gi, '')
          .replace(/<\/strong>/gi, '')
          // Remove other HTML tags
          .replace(/<[^>]*>/g, '')
          // Decode HTML entities
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          // Clean up extra whitespace
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        if (plainText) {
          const lines = plainText.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              if (line.trim().startsWith('•')) {
                // Bullet point
                doc.fillColor(darkGray).fontSize(9).font('Helvetica')
                  .text(line.trim(), 50, doc.y, { lineGap: 2, width: 500 });
              } else {
                // Regular text
                doc.fillColor(darkGray).fontSize(9).font('Helvetica')
                  .text(line.trim(), 45, doc.y, { lineGap: 2, width: 505 });
              }
            } else {
              // Empty line for spacing
              doc.moveDown(0.3);
            }
          }
        } else {
          doc.fillColor(midGray).fontSize(9).font('Helvetica-Oblique')
            .text('No patch notes available.', 45);
        }
      } else {
        doc.fillColor(midGray).fontSize(9).font('Helvetica-Oblique')
          .text('No patch notes available.', 45);
      }

      doc.moveDown(1.5);

      // Separator line (except for last item)
      if (i < versions.length - 1) {
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#e5e7eb');
        doc.moveDown(1);
      }
    }

    // Footer
    doc.fontSize(7).fillColor(midGray)
      .text(
        `Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`,
        40,
        780,
        { align: 'center', width: 515 }
      );

    doc.end();
  } catch (error) {
    console.error('Error generating date range PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
  }
});

export default router;
