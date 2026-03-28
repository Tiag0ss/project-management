import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { dbProvider, pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import PDFDocument from 'pdfkit';
import path from 'path';
import { promises as fs } from 'fs';
import { decrypt } from '../utils/encryption';

const router = Router();

function normalizeDateOnly(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().split('T')[0];
}

async function syncReleasedVersionTasks(versionId: string | number, applicationId: string | number): Promise<void> {
  const [versionRows] = await pool.execute<RowDataPacket[]>(
    `SELECT av.Status, a.OrganizationId
     FROM ApplicationVersions av
     INNER JOIN Applications a ON a.Id = av.ApplicationId
     WHERE av.Id = ? AND av.ApplicationId = ?
     LIMIT 1`,
    [versionId, applicationId]
  );

  if (!versionRows.length || versionRows[0].Status !== 'Released') {
    return;
  }

  const organizationId = versionRows[0].OrganizationId;

  const [closedStatuses] = await pool.execute<RowDataPacket[]>(
    `SELECT Id
     FROM TaskStatusValues
     WHERE OrganizationId = ? AND IsClosed = 1
     ORDER BY SortOrder ASC
     LIMIT 1`,
    [organizationId]
  );

  if (!closedStatuses.length) {
    return;
  }

  const closedStatusId = closedStatuses[0].Id;

  if (dbProvider === 'mssql') {
    await pool.execute(
      `UPDATE t
       SET t.ReleaseVersionId = ?, t.Status = ?
       FROM Tasks t
       INNER JOIN ApplicationVersionTasks avt ON avt.TaskId = t.Id
       WHERE avt.VersionId = ?`,
      [versionId, closedStatusId, versionId]
    );
  } else {
    await pool.execute(
      `UPDATE Tasks t
       INNER JOIN ApplicationVersionTasks avt ON avt.TaskId = t.Id
       SET t.ReleaseVersionId = ?, t.Status = ?
       WHERE avt.VersionId = ?`,
      [versionId, closedStatusId, versionId]
    );
  }
}

async function ensureApplicationCustomerAssociation(
  applicationId: string | number,
  customerId: number
): Promise<void> {
  if (dbProvider === 'mssql') {
    await pool.execute(
      `INSERT INTO ApplicationCustomers (ApplicationId, CustomerId, CreatedAt)
       SELECT ?, ?, CURRENT_TIMESTAMP
       WHERE NOT EXISTS (
         SELECT 1 FROM ApplicationCustomers WHERE ApplicationId = ? AND CustomerId = ?
       )`,
      [applicationId, customerId, applicationId, customerId]
    );
    return;
  }

  await pool.execute(
    'INSERT IGNORE INTO ApplicationCustomers (ApplicationId, CustomerId, CreatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [applicationId, customerId]
  );
}

type PatchBlock =
  | { type: 'text'; text: string; bullet: boolean }
  | { type: 'image'; src: string; alt?: string };

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToTextLines(html: string): Array<{ text: string; bullet: boolean }> {
  const normalized = html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<strong[^>]*>/gi, '')
    .replace(/<\/strong>/gi, '')
    .replace(/<em[^>]*>/gi, '')
    .replace(/<\/em>/gi, '')
    .replace(/<[^>]*>/g, '');

  return decodeHtmlEntities(normalized)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({
      text: line,
      bullet: line.startsWith('•'),
    }));
}

function parsePatchBlocks(html: string): PatchBlock[] {
  const blocks: PatchBlock[] = [];
  const imgRegex = /<img\b[^>]*>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = imgRegex.exec(html)) !== null) {
    const before = html.slice(lastIndex, match.index);
    const beforeLines = htmlToTextLines(before);
    for (const line of beforeLines) {
      blocks.push({ type: 'text', text: line.text, bullet: line.bullet });
    }

    const imgTag = match[0];
    const srcMatch = imgTag.match(/src\s*=\s*["']([^"']+)["']/i);
    const altMatch = imgTag.match(/alt\s*=\s*["']([^"']*)["']/i);
    const src = srcMatch?.[1]?.trim();
    if (src) {
      blocks.push({ type: 'image', src, alt: altMatch?.[1] || '' });
    }

    lastIndex = imgRegex.lastIndex;
  }

  const after = html.slice(lastIndex);
  const afterLines = htmlToTextLines(after);
  for (const line of afterLines) {
    blocks.push({ type: 'text', text: line.text, bullet: line.bullet });
  }

  return blocks;
}

async function loadPatchImageBuffer(src: string): Promise<Buffer | null> {
  try {
    if (!src) return null;

    if (src.startsWith('data:image/')) {
      const base64Part = src.split(',')[1];
      if (!base64Part) return null;
      return Buffer.from(base64Part, 'base64');
    }

    const normalized = src.trim();
    const isLocalUploadPath =
      normalized.startsWith('/uploads/') ||
      normalized.startsWith('uploads/') ||
      normalized.startsWith('/attachments/') ||
      normalized.startsWith('attachments/');

    if (isLocalUploadPath) {
      const relativePath = normalized.replace(/^\//, '');
      const absolutePath = path.resolve(process.cwd(), relativePath);
      return await fs.readFile(absolutePath);
    }

    if (/^https?:\/\//i.test(normalized)) {
      const response = await fetch(normalized);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    return null;
  } catch {
    return null;
  }
}

async function renderPatchNotesToPdf(
  doc: PDFKit.PDFDocument,
  patchHtml: string | null | undefined,
  options: {
    textSize: number;
    x: number;
    width: number;
    darkGray: string;
    midGray: string;
  }
): Promise<void> {
  if (!patchHtml) {
    doc.fillColor(options.midGray).fontSize(options.textSize).font('Helvetica-Oblique')
      .text('No patch notes available.', options.x);
    return;
  }

  const blocks = parsePatchBlocks(String(patchHtml));
  if (blocks.length === 0) {
    doc.fillColor(options.midGray).fontSize(options.textSize).font('Helvetica-Oblique')
      .text('No patch notes available.', options.x);
    return;
  }

  for (const block of blocks) {
    if (block.type === 'text') {
      const line = block.text.trim();
      if (!line) {
        doc.moveDown(0.25);
        continue;
      }

      const textX = block.bullet ? options.x + 8 : options.x;
      const textWidth = block.bullet ? options.width - 8 : options.width;

      doc.fillColor(options.darkGray)
        .fontSize(options.textSize)
        .font('Helvetica')
        .text(line, textX, doc.y, { width: textWidth, lineGap: 2 });
      continue;
    }

    const imageBuffer = await loadPatchImageBuffer(block.src);
    if (!imageBuffer) {
      if (block.alt) {
        doc.fillColor(options.midGray)
          .fontSize(options.textSize - 1)
          .font('Helvetica-Oblique')
          .text(`[Image not available: ${block.alt}]`, options.x, doc.y, { width: options.width });
      }
      continue;
    }

    try {
      const opened = (doc as any).openImage(imageBuffer);
      const maxWidth = options.width;
      const maxHeight = 240;
      const scale = Math.min(maxWidth / opened.width, maxHeight / opened.height, 1);
      const renderWidth = Math.max(1, Math.floor(opened.width * scale));
      const renderHeight = Math.max(1, Math.floor(opened.height * scale));

      const pageBottom = doc.page.height - doc.page.margins.bottom;
      if (doc.y + renderHeight + 12 > pageBottom) {
        doc.addPage();
      }

      doc.image(imageBuffer, options.x, doc.y, { width: renderWidth, height: renderHeight });
      doc.y += renderHeight + 8;
    } catch {
      if (block.alt) {
        doc.fillColor(options.midGray)
          .fontSize(options.textSize - 1)
          .font('Helvetica-Oblique')
          .text(`[Image could not be rendered: ${block.alt}]`, options.x, doc.y, { width: options.width });
      }
    }
  }
}

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
             (
               SELECT COUNT(DISTINCT ap.ProjectId)
               FROM ApplicationProjects ap
               WHERE ap.ApplicationId = a.Id
             ) as ProjectCount,
             (
               SELECT COUNT(DISTINCT ac.CustomerId)
               FROM ApplicationCustomers ac
               WHERE ac.ApplicationId = a.Id
             ) as CustomerCount,
             (
               SELECT COUNT(DISTINCT av.Id)
               FROM ApplicationVersions av
               WHERE av.ApplicationId = a.Id
             ) as VersionCount
      FROM Applications a
      LEFT JOIN Users u ON a.CreatedBy = u.Id
      LEFT JOIN Organizations o ON a.OrganizationId = o.Id
      INNER JOIN OrganizationMembers om ON a.OrganizationId = om.OrganizationId AND om.UserId = ?
      WHERE a.IsActive = 1
    `;
    const params: (number | string)[] = [userId!];

    if (organizationId) {
      query += ' AND a.OrganizationId = ?';
      params.push(parseInt(organizationId as string));
    }

    query += ' ORDER BY a.Name ASC';

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

// GET /api/applications/ai/availability - checks if OpenAI key is configured
router.get('/ai/availability', authenticateToken, async (_req: AuthRequest, res: Response) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT SettingValue FROM SystemSettings WHERE SettingKey = ? LIMIT 1',
      ['openAIApiKey']
    );

    const encryptedKey = String(rows[0]?.SettingValue || '').trim();
    const decryptedKey = encryptedKey ? decrypt(encryptedKey).trim() : '';

    return res.json({
      success: true,
      configured: !!decryptedKey,
    });
  } catch (error: any) {
    console.error('AI availability check error:', error);
    return res.status(500).json({ success: false, message: 'Failed to check AI availability' });
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
              c.Name as CustomerName,
              (
                SELECT COUNT(DISTINCT avt.TaskId)
                FROM ApplicationVersionTasks avt
                WHERE avt.VersionId = av.Id
              ) as TaskCount
       FROM ApplicationVersions av
       LEFT JOIN Users u ON av.CreatedBy = u.Id
       LEFT JOIN Customers c ON c.Id = av.CustomerId
       WHERE av.ApplicationId = ?
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
    const { Name, Description, RepositoryUrl, OrganizationId, CustomerIds, IsCustomerSpecific } = req.body;

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
      `INSERT INTO Applications (Name, Description, RepositoryUrl, IsCustomerSpecific, OrganizationId, CreatedBy, CreatedAt, UpdatedAt)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [Name, Description || null, RepositoryUrl || null, IsCustomerSpecific ? 1 : 0, OrganizationId, userId]
    );

    const appId = result.insertId;

    // Associate customers
    if (Array.isArray(CustomerIds) && CustomerIds.length > 0) {
      for (const customerId of CustomerIds) {
        await pool.execute(
          'INSERT IGNORE INTO ApplicationCustomers (ApplicationId, CustomerId, CreatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
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
    const { Name, Description, RepositoryUrl, CustomerIds, IsCustomerSpecific } = req.body;

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

    const isCustomerSpecificValue = IsCustomerSpecific === undefined ? null : (IsCustomerSpecific ? 1 : 0);

    await pool.execute(
      `UPDATE Applications
       SET Name = ?, Description = ?, RepositoryUrl = ?, IsCustomerSpecific = COALESCE(?, IsCustomerSpecific), UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [Name, Description || null, RepositoryUrl || null, isCustomerSpecificValue, id]
    );

    // Sync customers
    if (Array.isArray(CustomerIds)) {
      await pool.execute('DELETE FROM ApplicationCustomers WHERE ApplicationId = ?', [id]);
      for (const customerId of CustomerIds) {
        await pool.execute(
          'INSERT IGNORE INTO ApplicationCustomers (ApplicationId, CustomerId, CreatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)',
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
              (
                SELECT COUNT(DISTINCT avt.TaskId)
                FROM ApplicationVersionTasks avt
                WHERE avt.VersionId = av.Id
              ) as TaskCount
       FROM ApplicationVersions av
       LEFT JOIN Users u ON av.CreatedBy = u.Id
       WHERE av.ApplicationId = ?
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
      `SELECT av.*, u.FirstName, u.LastName, a.Name as ApplicationName, c.Name as CustomerName
       FROM ApplicationVersions av
       LEFT JOIN Users u ON av.CreatedBy = u.Id
       LEFT JOIN Applications a ON av.ApplicationId = a.Id
       LEFT JOIN Customers c ON c.Id = av.CustomerId
       WHERE av.Id = ?`,
      [versionId]
    );

    if (versions.length === 0) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    const version = versions[0];

    // Load tasks in this version
    const [tasks] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.ProjectId, t.TaskName, t.Description, t.Status, t.Priority,
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
    const applicationId = Array.isArray(id) ? id[0] : id;
    const { VersionNumber, VersionName, Status, ReleaseDate, PatchNotes, IsCustomerSpecific, CustomerId } = req.body;
    const normalizedReleaseDate = normalizeDateOnly(ReleaseDate);
    const isCustomerSpecific = IsCustomerSpecific ? 1 : 0;
    const normalizedCustomerId = CustomerId === null || CustomerId === undefined || CustomerId === '' ? null : Number(CustomerId);

    if (!VersionNumber) {
      return res.status(400).json({ success: false, message: 'VersionNumber is required' });
    }

    if (isCustomerSpecific === 1 && !normalizedCustomerId) {
      return res.status(400).json({ success: false, message: 'Customer is required when version is customer-specific' });
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
      `INSERT INTO ApplicationVersions (ApplicationId, VersionNumber, VersionName, Status, ReleaseDate, PatchNotes, IsCustomerSpecific, CustomerId, CreatedBy, CreatedAt, UpdatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [applicationId, VersionNumber, VersionName || null, Status || 'Planning', normalizedReleaseDate, PatchNotes || null, isCustomerSpecific, isCustomerSpecific === 1 ? normalizedCustomerId : null, userId]
    );

    if (isCustomerSpecific === 1 && normalizedCustomerId) {
      await ensureApplicationCustomerAssociation(applicationId, normalizedCustomerId);
    }

    if ((Status || 'Planning') === 'Released') {
      await syncReleasedVersionTasks(result.insertId, applicationId);
    }

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
    const applicationId = Array.isArray(id) ? id[0] : id;
    const normalizedVersionId = Array.isArray(versionId) ? versionId[0] : versionId;
    const { VersionNumber, VersionName, Status, ReleaseDate, PatchNotes, IsCustomerSpecific, CustomerId } = req.body;
    const normalizedReleaseDate = normalizeDateOnly(ReleaseDate);
    const normalizedCustomerId = CustomerId === null || CustomerId === undefined || CustomerId === '' ? null : Number(CustomerId);

    // Get application organization ID
    const [apps] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM Applications WHERE Id = ? AND IsActive = 1',
      [applicationId]
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
      [normalizedVersionId]
    );

    const wasReleased = currentVersion.length > 0 && currentVersion[0].Status === 'Released';
    const isNowReleased = Status === 'Released';

    const versionIsCustomerSpecificValue = IsCustomerSpecific === undefined ? null : (IsCustomerSpecific ? 1 : 0);

    if (versionIsCustomerSpecificValue === 1 && !normalizedCustomerId) {
      return res.status(400).json({ success: false, message: 'Customer is required when version is customer-specific' });
    }

    await pool.execute(
      `UPDATE ApplicationVersions
       SET VersionNumber = ?, VersionName = ?, Status = ?, ReleaseDate = ?, PatchNotes = ?,
           IsCustomerSpecific = COALESCE(?, IsCustomerSpecific),
           CustomerId = CASE
             WHEN ? IS NULL THEN CustomerId
             WHEN ? = 1 THEN ?
             ELSE NULL
           END,
           UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [
        VersionNumber,
        VersionName || null,
        Status || 'Planning',
        normalizedReleaseDate,
        PatchNotes || null,
        versionIsCustomerSpecificValue,
        versionIsCustomerSpecificValue,
        versionIsCustomerSpecificValue,
        normalizedCustomerId,
        normalizedVersionId,
      ]
    );

    if (versionIsCustomerSpecificValue === 1 && normalizedCustomerId) {
      await ensureApplicationCustomerAssociation(applicationId, normalizedCustomerId);
    }

    // If version is being released (status changed to Released), update associated tasks
    if (isNowReleased && !wasReleased) {
      await syncReleasedVersionTasks(normalizedVersionId, applicationId);
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
    const { id, versionId } = req.params;
    const applicationId = Array.isArray(id) ? id[0] : id;
    const normalizedVersionId = Array.isArray(versionId) ? versionId[0] : versionId;
    const { TaskIds } = req.body;

    const normalizedTaskIds = Array.isArray(TaskIds)
      ? Array.from(new Set(TaskIds.map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)))
      : [];

    const [existingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT TaskId FROM ApplicationVersionTasks WHERE VersionId = ?',
      [normalizedVersionId]
    );
    const existingTaskIds = existingRows
      .map((row) => Number(row.TaskId))
      .filter((value) => Number.isFinite(value) && value > 0);

    await pool.execute('DELETE FROM ApplicationVersionTasks WHERE VersionId = ?', [normalizedVersionId]);
    if (normalizedTaskIds.length > 0) {
      for (const taskId of normalizedTaskIds) {
        await pool.execute(
          'INSERT IGNORE INTO ApplicationVersionTasks (VersionId, TaskId) VALUES (?, ?)',
          [normalizedVersionId, taskId]
        );
      }
    }

    await pool.execute('UPDATE Tasks SET ReleaseVersionId = NULL WHERE ReleaseVersionId = ?', [normalizedVersionId]);

    if (normalizedTaskIds.length > 0) {
      const placeholders = normalizedTaskIds.map(() => '?').join(',');
      await pool.execute(
        `UPDATE Tasks
         SET ApplicationId = ?, ReleaseVersionId = ?
         WHERE Id IN (${placeholders})`,
        [applicationId, normalizedVersionId, ...normalizedTaskIds]
      );
    }

    const removedTaskIds = existingTaskIds.filter((taskId) => !normalizedTaskIds.includes(taskId));
    if (removedTaskIds.length > 0) {
      const placeholders = removedTaskIds.map(() => '?').join(',');
      await pool.execute(
        `UPDATE Tasks
         SET ReleaseVersionId = NULL,
             ApplicationId = CASE WHEN ApplicationId = ? THEN NULL ELSE ApplicationId END
         WHERE Id IN (${placeholders}) AND ReleaseVersionId = ?`,
        [applicationId, ...removedTaskIds, normalizedVersionId]
      );
    }

    await syncReleasedVersionTasks(normalizedVersionId, applicationId);

    res.json({ success: true, message: 'Version tasks updated' });
  } catch (error) {
    console.error('Error updating version tasks:', error);
    res.status(500).json({ success: false, message: 'Failed to update version tasks' });
  }
});

// POST /api/applications/:id/versions/improve-patch-notes - improve patch notes with AI (bullet format)
router.post('/:id/versions/improve-patch-notes', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const applicationId = Number(req.params.id);
    const patchNotes = String(req.body?.patchNotes || '').trim();
    const taskIdsRaw = Array.isArray(req.body?.taskIds) ? req.body.taskIds : [];
    const taskIds = taskIdsRaw
      .map((value: any) => Number(value))
      .filter((value: number) => Number.isFinite(value) && value > 0);

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!Number.isFinite(applicationId) || applicationId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid application id' });
    }

    const [accessRows] = await pool.execute<RowDataPacket[]>(
      `SELECT a.Id
       FROM Applications a
       INNER JOIN OrganizationMembers om ON om.OrganizationId = a.OrganizationId
       WHERE a.Id = ? AND om.UserId = ?
       LIMIT 1`,
      [applicationId, userId]
    );

    if (!accessRows.length) {
      return res.status(404).json({ success: false, message: 'Application not found or access denied' });
    }

    const [settingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN (?, ?)',
      ['openAIApiKey', 'openAIModel']
    );

    const settingsMap: Record<string, string> = {};
    for (const row of settingRows) {
      settingsMap[String(row.SettingKey || '')] = String(row.SettingValue || '');
    }

    const encryptedKey = String(settingsMap.openAIApiKey || '').trim();
    const openAiApiKey = encryptedKey ? decrypt(encryptedKey).trim() : '';
    const model = String(settingsMap.openAIModel || '').trim() || 'gpt-4o-mini';

    if (!openAiApiKey) {
      return res.status(400).json({ success: false, message: 'OpenAI API key is not configured.' });
    }

    let taskContext: Array<{ id: number; name: string; project: string }> = [];
    if (taskIds.length > 0) {
      const placeholders = taskIds.map(() => '?').join(',');
      const [taskRows] = await pool.execute<RowDataPacket[]>(
        `SELECT t.Id, t.TaskName, p.ProjectName
         FROM Tasks t
         INNER JOIN Projects p ON p.Id = t.ProjectId
         WHERE p.OrganizationId = (
           SELECT OrganizationId FROM Applications WHERE Id = ? LIMIT 1
         )
           AND t.Id IN (${placeholders})
         ORDER BY p.ProjectName ASC, t.TaskName ASC`,
        [applicationId, ...taskIds]
      );

      taskContext = taskRows.map((row) => ({
        id: Number(row.Id),
        name: String(row.TaskName || ''),
        project: String(row.ProjectName || ''),
      }));
    }

    const systemPrompt = [
      'You improve software release patch notes.',
      'Mandatory output format rules:',
      '- Return HTML only (no markdown, no code fences).',
      '- Keep bullet structure using <ul><li>...</li></ul>.',
      '- Use concise, clear bullet points.',
      '- Preserve factual meaning; do not invent features.',
      '- If grouping helps, you may use <p><strong>Group</strong></p> before bullet lists.',
      '- Ensure the final output still contains bullet lists.',
    ].join('\n');

    const userPrompt = JSON.stringify({
      currentPatchNotesHtml: patchNotes,
      selectedTasks: taskContext,
      instruction: 'Improve clarity and readability while preserving meaning. Keep bullets in the final result.',
    });

    const llmResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!llmResponse.ok) {
      const errorJson = await llmResponse.json().catch(() => ({}));
      const apiMessage = String(errorJson?.error?.message || errorJson?.message || '').trim();
      return res.status(502).json({
        success: false,
        message: apiMessage || 'OpenAI request failed. Check API key and model configuration.',
      });
    }

    const llmJson = await llmResponse.json();
    const improved = String(llmJson?.choices?.[0]?.message?.content || '').trim();

    if (!improved) {
      return res.status(500).json({ success: false, message: 'AI returned empty patch notes.' });
    }

    const normalized = improved.includes('<li')
      ? improved
      : `<ul>${improved
          .split(/\n+/)
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0)
          .map((line: string) => `<li>${line.replace(/^[-•]\s*/, '')}</li>`)
          .join('')}</ul>`;

    return res.json({ success: true, patchNotes: normalized });
  } catch (error: any) {
    console.error('Improve patch notes error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to improve patch notes' });
  }
});

// POST /api/applications/:id/versions/:versionId/tasks/:taskId - add task to version
router.post('/:id/versions/:versionId/tasks/:taskId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id, versionId, taskId } = req.params;
    const applicationId = Array.isArray(id) ? id[0] : id;
    const normalizedTaskId = Number(taskId);
    await pool.execute(
      'INSERT IGNORE INTO ApplicationVersionTasks (VersionId, TaskId) VALUES (?, ?)',
      [versionId, normalizedTaskId]
    );
    await pool.execute(
      'UPDATE Tasks SET ApplicationId = ?, ReleaseVersionId = ? WHERE Id = ?',
      [applicationId, versionId, normalizedTaskId]
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
    const { id, versionId, taskId } = req.params;
    const applicationId = Array.isArray(id) ? id[0] : id;
    const normalizedTaskId = Number(taskId);
    await pool.execute(
      'DELETE FROM ApplicationVersionTasks WHERE VersionId = ? AND TaskId = ?',
      [versionId, normalizedTaskId]
    );
    await pool.execute(
      `UPDATE Tasks
       SET ReleaseVersionId = NULL,
           ApplicationId = CASE WHEN ApplicationId = ? THEN NULL ELSE ApplicationId END
       WHERE Id = ? AND ReleaseVersionId = ?`,
      [applicationId, normalizedTaskId, versionId]
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

    await renderPatchNotesToPdf(doc, version.PatchNotes, {
      textSize: 10,
      x: 40,
      width: 515,
      darkGray,
      midGray,
    });

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
      await renderPatchNotesToPdf(doc, version.PatchNotes, {
        textSize: 9,
        x: 45,
        width: 505,
        darkGray,
        midGray,
      });

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
