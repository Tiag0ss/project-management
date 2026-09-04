import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../../middleware/auth';
import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader } from '../../config/database';
import { logCustomerHistory } from '../../utils/changeLog';
import { prepareCustomFieldData } from '../../utils/customFields';
import { cachedJson, ENTITY_TTL_SECONDS } from '../../utils/cachedJson';
import { cacheKeys } from '../../services/cacheKeys';
import { invalidateByEntity } from '../../services/cacheInvalidation';
import logger from '../../utils/logger';

const router = Router();

type CustomerContactInput = {
  Name: string;
  Email: string | null;
  Phone: string | null;
  IsDefault: boolean;
};

const normalizeCustomerContacts = (contacts: any[]): { contacts: CustomerContactInput[]; error?: string } => {
  const normalized = contacts
    .map((contact) => ({
      Name: String(contact?.Name || '').trim(),
      Email: String(contact?.Email || '').trim() || null,
      Phone: String(contact?.Phone || '').trim() || null,
      IsDefault: contact?.IsDefault === true || contact?.IsDefault === 1,
    }))
    .filter((contact) => contact.Name || contact.Email || contact.Phone);

  for (const contact of normalized) {
    if (!contact.Name) {
      return { contacts: [], error: 'Each contact must have a name' };
    }
  }

  const defaultCount = normalized.filter((contact) => contact.IsDefault).length;
  if (defaultCount > 1) {
    return { contacts: [], error: 'Only one default contact is allowed' };
  }

  if (normalized.length > 0 && defaultCount === 0) {
    normalized[0].IsDefault = true;
  }

  return { contacts: normalized };
};

const replaceCustomerContacts = async (customerId: number, contacts: CustomerContactInput[], userId: number | undefined) => {
  await pool.execute('DELETE FROM CustomerContacts WHERE CustomerId = ?', [customerId]);

  for (const contact of contacts) {
    await pool.execute(
      `INSERT INTO CustomerContacts (CustomerId, Name, Email, Phone, IsDefault, CreatedBy)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customerId, contact.Name, contact.Email, contact.Phone, contact.IsDefault ? 1 : 0, userId || null]
    );
  }
};

const syncDefaultContactToCustomer = async (customerId: number) => {
  const [contacts] = await pool.execute<RowDataPacket[]>(
    `SELECT Name, Email, Phone
     FROM CustomerContacts
     WHERE CustomerId = ?
     ORDER BY IsDefault DESC, Id ASC
     LIMIT 1`,
    [customerId]
  );

  const defaultContact = contacts[0];
  await pool.execute(
    `UPDATE Customers
     SET ContactPerson = ?, ContactEmail = ?, ContactPhone = ?
     WHERE Id = ?`,
    [defaultContact?.Name || null, defaultContact?.Email || null, defaultContact?.Phone || null, customerId]
  );
};

const getCustomerContacts = async (customerId: number) => {
  const [contacts] = await pool.execute<RowDataPacket[]>(
    `SELECT Id, CustomerId, Name, Email, Phone, IsDefault
     FROM CustomerContacts
     WHERE CustomerId = ?
     ORDER BY IsDefault DESC, Name ASC, Id ASC`,
    [customerId]
  );

  return contacts;
};

const getCustomerOrgIds = async (customerId: number): Promise<number[]> => {
  const [orgs] = await pool.execute<RowDataPacket[]>(
    'SELECT OrganizationId FROM CustomerOrganizations WHERE CustomerId = ?',
    [customerId]
  );
  return orgs.map((row) => Number(row.OrganizationId));
};

const invalidateCustomerCachesForOrgs = async (customerId: number, orgIds: number[]): Promise<void> => {
  for (const orgId of orgIds) {
    await invalidateByEntity('customer', { customerId, orgId });
  }
};

/**
 * @swagger
 * tags:
 *   name: Customers
 *   description: Customer management
 */

/**
 * @swagger
 * /api/customers:
 *   get:
 *     summary: Get all customers
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         schema:
 *           type: integer
 *         description: Filter customers by organization
 *     responses:
 *       200:
 *         description: List of customers
 *       401:
 *         description: Unauthorized
 */
// Get all customers for the current user's organizations
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId!;
    const { organizationId } = req.query;

    const listKey = organizationId
      ? cacheKeys.orgCustomers(parseInt(organizationId as string))
      : `${cacheKeys.userOrganizations(userId)}:customers`;

    const customers = await cachedJson(listKey, ENTITY_TTL_SECONDS, async () => {
    let query: string;
    let params: (number | string)[];

    if (organizationId) {
      // Get customers for a specific organization
      query = `
        SELECT DISTINCT c.*
        FROM Customers c
        INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
        INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId
        WHERE om.UserId = ? AND co.OrganizationId = ? AND c.IsActive = 1
        ORDER BY c.Name ASC
      `;
      params = [userId, parseInt(organizationId as string)];
    } else {
      // Get all customers from user's organizations
      query = `
        SELECT DISTINCT c.*
        FROM Customers c
        INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
        INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId
        WHERE om.UserId = ? AND c.IsActive = 1
        ORDER BY c.Name ASC
      `;
      params = [userId];
    }

    const [customerRows] = await pool.execute<RowDataPacket[]>(query, params);
    const statsParams: (number | string)[] = [userId, userId];
    let customerStatsQuery = `
      SELECT c.Id as CustomerId,
             COUNT(DISTINCT CASE
               WHEN pom.UserId IS NULL THEN NULL
               WHEN COALESCE(p.IsGlobal, 0) = 0 THEN p.Id
               WHEN t.Id IS NOT NULL THEN p.Id
               ELSE NULL
             END) as ProjectCount,
             COUNT(DISTINCT CASE
               WHEN pom.UserId IS NULL THEN NULL
               WHEN COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 THEN t.Id
               ELSE NULL
             END) as TotalTasks,
             COUNT(DISTINCT CASE
               WHEN pom.UserId IS NULL THEN NULL
               WHEN COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 AND COALESCE(tsv.IsClosed, 0) = 1 THEN t.Id
               ELSE NULL
             END) as CompletedTasks
      FROM Customers c
      INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
      INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId AND om.UserId = ?
      LEFT JOIN Projects p ON (
        (COALESCE(p.IsGlobal, 0) = 0 AND p.CustomerId = c.Id)
        OR COALESCE(p.IsGlobal, 0) = 1
      )
      LEFT JOIN OrganizationMembers pom ON p.OrganizationId = pom.OrganizationId AND pom.UserId = ?
      LEFT JOIN Tasks t ON t.ProjectId = p.Id
        AND (COALESCE(p.IsGlobal, 0) = 0 OR t.CustomerId = c.Id)
      LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
      WHERE c.IsActive = 1`;

    if (organizationId) {
      customerStatsQuery += ' AND co.OrganizationId = ?';
      statsParams.push(parseInt(organizationId as string));
    }

    customerStatsQuery += '\n      GROUP BY c.Id';

    const [customerStatsRows] = await pool.execute<RowDataPacket[]>(customerStatsQuery, statsParams);
    const customerStatsById = new Map<number, { projectCount: number; totalTasks: number; completedTasks: number }>();

    customerStatsRows.forEach((row) => {
      customerStatsById.set(Number(row.CustomerId), {
        projectCount: Number(row.ProjectCount) || 0,
        totalTasks: Number(row.TotalTasks) || 0,
        completedTasks: Number(row.CompletedTasks) || 0,
      });
    });

    // Get organization associations and open ticket count for each customer
    for (const customer of customerRows) {
      const [orgs] = await pool.execute<RowDataPacket[]>(
        `SELECT co.CustomerId, co.OrganizationId, o.Name as OrganizationName, co.CreatedAt
         FROM CustomerOrganizations co
         INNER JOIN Organizations o ON co.OrganizationId = o.Id
         WHERE co.CustomerId = ?`,
        [customer.Id]
      );
      customer.Organizations = orgs;

      const contacts = await getCustomerContacts(customer.Id);
      customer.Contacts = contacts;

      if (contacts.length > 0) {
        const defaultContact = contacts.find((c: any) => c.IsDefault === 1) || contacts[0];
        customer.ContactPerson = defaultContact.Name || customer.ContactPerson || null;
        customer.ContactEmail = defaultContact.Email || customer.ContactEmail || null;
        customer.ContactPhone = defaultContact.Phone || customer.ContactPhone || null;
      }

      // Get open ticket count (excluding closed statuses)
      const [ticketCount] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count
         FROM Tickets t
         LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
         WHERE t.CustomerId = ? AND COALESCE(tsv.IsClosed, 0) = 0`,
        [customer.Id]
      );
      customer.OpenTickets = ticketCount[0].count;

      const customerStats = customerStatsById.get(Number(customer.Id));
      customer.ProjectCount = customerStats?.projectCount || 0;
      customer.TotalTasks = customerStats?.totalTasks || 0;
      customer.CompletedTasks = customerStats?.completedTasks || 0;
    }

    return customerRows;
    });

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    logger.error('Get customers error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch customers' 
    });
  }
});

/**
 * @swagger
 * /api/customers/{id}:
 *   get:
 *     summary: Get a single customer
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Customer not found
 */
// Get a specific customer
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = parseInt(req.params.id as string);

    const customer = await cachedJson(cacheKeys.customer(customerId), ENTITY_TTL_SECONDS, async () => {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT DISTINCT c.*
         FROM Customers c
         INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
         INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId
         WHERE om.UserId = ? AND c.Id = ?`,
        [userId, customerId]
      );

      if (rows.length === 0) {
        return null;
      }

      const record = rows[0];

      const [orgs] = await pool.execute<RowDataPacket[]>(
        `SELECT co.CustomerId, co.OrganizationId, o.Name as OrganizationName, co.CreatedAt
         FROM CustomerOrganizations co
         INNER JOIN Organizations o ON co.OrganizationId = o.Id
         WHERE co.CustomerId = ?`,
        [customerId]
      );
      record.Organizations = orgs;

      const contacts = await getCustomerContacts(customerId);
      record.Contacts = contacts;
      if (contacts.length > 0) {
        const defaultContact = contacts.find((c: any) => c.IsDefault === 1) || contacts[0];
        record.ContactPerson = defaultContact.Name || record.ContactPerson || null;
        record.ContactEmail = defaultContact.Email || record.ContactEmail || null;
        record.ContactPhone = defaultContact.Phone || record.ContactPhone || null;
      }

      return record;
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    logger.error('Get customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch customer' 
    });
  }
});

/**
 * @swagger
 * /api/customers:
 *   post:
 *     summary: Create a new customer
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               company:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Customer created
 *       401:
 *         description: Unauthorized
 */
// Create a new customer
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { Name, ExternalName, Email, Phone, Address, Notes, DefaultSupportUserId, OrganizationIds, CreateDefaultProject, DefaultProjectName, Contacts, customFields } = req.body;
    let projectCustomFieldData: Awaited<ReturnType<typeof prepareCustomFieldData>> | null = null;

    if (!Name || !Name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Customer name is required'
      });
    }

    if (!OrganizationIds || !Array.isArray(OrganizationIds) || OrganizationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one organization must be selected'
      });
    }

    if (Contacts !== undefined && !Array.isArray(Contacts)) {
      return res.status(400).json({ success: false, message: 'Contacts must be an array' });
    }

    // Verify user has access to all specified organizations
    const [userOrgs] = await pool.execute<RowDataPacket[]>(
      `SELECT OrganizationId FROM OrganizationMembers WHERE UserId = ?`,
      [userId]
    );
    const userOrgIds = userOrgs.map(o => o.OrganizationId);
    
    for (const orgId of OrganizationIds) {
      if (!userOrgIds.includes(orgId)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to one or more selected organizations'
        });
      }
    }

    const customFieldData = await prepareCustomFieldData('Customers', customFields);

    if (CreateDefaultProject) {
      try {
        projectCustomFieldData = await prepareCustomFieldData('Projects', {});
      } catch (projectCustomFieldError: any) {
        return res.status(400).json({
          success: false,
          message: `Cannot create default project: ${projectCustomFieldError?.message || 'required Project custom fields are missing'}. Disable "Create default project" or make required Project custom fields optional.`
        });
      }
    }

    // Create customer
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Customers (Name, ExternalName, Email, Phone, Address, Notes, DefaultSupportUserId, IsActive, CreatedBy${customFieldData.insertColumns.length > 0 ? `, ${customFieldData.insertColumns.join(', ')}` : ''})
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?${customFieldData.insertPlaceholders.length > 0 ? `, ${customFieldData.insertPlaceholders.join(', ')}` : ''})`,
      [Name.trim(), ExternalName || null, Email || null, Phone || null, Address || null, Notes || null, DefaultSupportUserId || null, userId, ...customFieldData.insertValues]
    );

    const customerId = result.insertId;
    
    // Log to history
    await logCustomerHistory(
      customerId,
      userId!,
      'created',
      null,
      null,
      null
    );

    // Create organization associations
    for (const orgId of OrganizationIds) {
      await pool.execute(
        `INSERT INTO CustomerOrganizations (CustomerId, OrganizationId) VALUES (?, ?)`,
        [customerId, orgId]
      );
    }

    // Create default project(s) if requested
    if (CreateDefaultProject && projectCustomFieldData) {
      const projectName = (DefaultProjectName && DefaultProjectName.trim()) || Name.trim();
      for (const orgId of OrganizationIds) {
        await pool.execute<ResultSetHeader>(
          `INSERT INTO Projects (OrganizationId, ProjectName, Description, CreatedBy, Status, StartDate, EndDate, IsHobby, CustomerId${projectCustomFieldData.insertColumns.length > 0 ? `, ${projectCustomFieldData.insertColumns.join(', ')}` : ''})
           VALUES (?, ?, ?, ?, (SELECT Id FROM ProjectStatusValues WHERE OrganizationId = ? AND IsDefault = 1 LIMIT 1), NULL, NULL, 0, ?${projectCustomFieldData.insertPlaceholders.length > 0 ? `, ${projectCustomFieldData.insertPlaceholders.join(', ')}` : ''})`,
          [orgId, projectName, `Default project for customer ${Name.trim()}`, userId, orgId, customerId, ...projectCustomFieldData.insertValues]
        );
      }
    }

    if (Array.isArray(Contacts)) {
      const { contacts, error } = normalizeCustomerContacts(Contacts);
      if (error) {
        return res.status(400).json({ success: false, message: error });
      }

      await replaceCustomerContacts(customerId, contacts, userId);
      await syncDefaultContactToCustomer(customerId);
    }

    // Fetch the created customer
    const [customers] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM Customers WHERE Id = ?`,
      [customerId]
    );

    const customer = customers[0];

    // Get organization associations
    const [orgs] = await pool.execute<RowDataPacket[]>(
      `SELECT co.CustomerId, co.OrganizationId, o.Name as OrganizationName, co.CreatedAt
       FROM CustomerOrganizations co
       INNER JOIN Organizations o ON co.OrganizationId = o.Id
       WHERE co.CustomerId = ?`,
      [customerId]
    );
    customer.Organizations = orgs;

    customer.Contacts = await getCustomerContacts(customerId);

    await invalidateCustomerCachesForOrgs(customerId, OrganizationIds);

    res.status(201).json({
      success: true,
      data: customer,
      message: 'Customer created successfully'
    });
  } catch (error) {
    logger.error('Create customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create customer' 
    });
  }
});

/**
 * @swagger
 * /api/customers/{id}:
 *   put:
 *     summary: Update a customer
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Customer ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               company:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Customer updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Customer not found
 */
// Update a customer
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = parseInt(req.params.id as string);
    const { Name, ExternalName, Email, Phone, Address, Notes, DefaultSupportUserId, IsActive, OrganizationIds, Website, ContactPerson, ContactEmail, ContactPhone, ProjectManagerId, Contacts, customFields } = req.body;

    // Check if user has access to this customer
    const [existingCustomers] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT c.*
       FROM Customers c
       INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
       INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId
       WHERE om.UserId = ? AND c.Id = ?`,
      [userId, customerId]
    );

    if (existingCustomers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    const oldCustomer = existingCustomers[0];

    // Normalize empty values for comparison
    const normalizeValue = (value: any): string => {
      return value === null || value === undefined || value === '' ? '' : String(value);
    };

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    const changes: { field: string; oldVal: any; newVal: any }[] = [];

    if (Name !== undefined) {
      const oldVal = normalizeValue(oldCustomer.Name);
      const newVal = normalizeValue(Name.trim());
      if (newVal !== oldVal) {
        changes.push({ field: 'Name', oldVal, newVal });
      }
      updates.push('Name = ?');
      values.push(Name.trim());
    }
    if (ExternalName !== undefined) {
      const oldVal = normalizeValue(oldCustomer.ExternalName);
      const newVal = normalizeValue(ExternalName);
      if (newVal !== oldVal) {
        changes.push({ field: 'ExternalName', oldVal, newVal });
      }
      updates.push('ExternalName = ?');
      values.push(ExternalName || null);
    }
    if (Email !== undefined) {
      const oldVal = normalizeValue(oldCustomer.Email);
      const newVal = normalizeValue(Email);
      if (newVal !== oldVal) {
        changes.push({ field: 'Email', oldVal, newVal });
      }
      updates.push('Email = ?');
      values.push(Email || null);
    }
    if (Phone !== undefined) {
      const oldVal = normalizeValue(oldCustomer.Phone);
      const newVal = normalizeValue(Phone);
      if (newVal !== oldVal) {
        changes.push({ field: 'Phone', oldVal, newVal });
      }
      updates.push('Phone = ?');
      values.push(Phone || null);
    }
    if (Address !== undefined) {
      const oldVal = normalizeValue(oldCustomer.Address);
      const newVal = normalizeValue(Address);
      if (newVal !== oldVal) {
        changes.push({ field: 'Address', oldVal, newVal });
      }
      updates.push('Address = ?');
      values.push(Address || null);
    }
    if (Notes !== undefined) {
      const oldVal = normalizeValue(oldCustomer.Notes);
      const newVal = normalizeValue(Notes);
      if (newVal !== oldVal) {
        changes.push({ field: 'Notes', oldVal, newVal });
      }
      updates.push('Notes = ?');
      values.push(Notes || null);
    }
    if (IsActive !== undefined) {
      if (IsActive !== Boolean(oldCustomer.IsActive)) {
        changes.push({ field: 'IsActive', oldVal: String(oldCustomer.IsActive), newVal: String(IsActive) });
      }
      updates.push('IsActive = ?');
      values.push(IsActive);
    }
    if (Website !== undefined) {
      const oldVal = normalizeValue(oldCustomer.Website);
      const newVal = normalizeValue(Website);
      if (newVal !== oldVal) {
        changes.push({ field: 'Website', oldVal, newVal });
      }
      updates.push('Website = ?');
      values.push(Website || null);
    }
    if (ContactPerson !== undefined) {
      const oldVal = normalizeValue(oldCustomer.ContactPerson);
      const newVal = normalizeValue(ContactPerson);
      if (newVal !== oldVal) {
        changes.push({ field: 'ContactPerson', oldVal, newVal });
      }
      updates.push('ContactPerson = ?');
      values.push(ContactPerson || null);
    }
    if (ContactEmail !== undefined) {
      const oldVal = normalizeValue(oldCustomer.ContactEmail);
      const newVal = normalizeValue(ContactEmail);
      if (newVal !== oldVal) {
        changes.push({ field: 'ContactEmail', oldVal, newVal });
      }
      updates.push('ContactEmail = ?');
      values.push(ContactEmail || null);
    }
    if (ContactPhone !== undefined) {
      const oldVal = normalizeValue(oldCustomer.ContactPhone);
      const newVal = normalizeValue(ContactPhone);
      if (newVal !== oldVal) {
        changes.push({ field: 'ContactPhone', oldVal, newVal });
      }
      updates.push('ContactPhone = ?');
      values.push(ContactPhone || null);
    }
    if (ProjectManagerId !== undefined) {
      if ((ProjectManagerId || null) !== (oldCustomer.ProjectManagerId || null)) {
        changes.push({ field: 'ProjectManagerId', oldVal: String(oldCustomer.ProjectManagerId || ''), newVal: String(ProjectManagerId || '') });
      }
      updates.push('ProjectManagerId = ?');
      values.push(ProjectManagerId || null);
    }
    if (DefaultSupportUserId !== undefined) {
      if ((DefaultSupportUserId || null) !== (oldCustomer.DefaultSupportUserId || null)) {
        changes.push({ field: 'DefaultSupportUserId', oldVal: String(oldCustomer.DefaultSupportUserId || ''), newVal: String(DefaultSupportUserId || '') });
      }
      updates.push('DefaultSupportUserId = ?');
      values.push(DefaultSupportUserId || null);
    }

    const customFieldData = await prepareCustomFieldData('Customers', customFields, oldCustomer as Record<string, unknown>);
    for (const change of customFieldData.changes) {
      changes.push({ field: change.field, oldVal: change.oldVal, newVal: change.newVal });
    }
    if (customFieldData.updateAssignments.length > 0) {
      updates.push(...customFieldData.updateAssignments);
      values.push(...customFieldData.updateValues);
    }

    if (updates.length > 0) {
      values.push(customerId);
      await pool.execute(
        `UPDATE Customers SET ${updates.join(', ')} WHERE Id = ?`,
        values
      );
      
      // Log changes to history
      for (const change of changes) {
        await logCustomerHistory(
          customerId,
          userId!,
          'updated',
          change.field,
          String(change.oldVal || ''),
          String(change.newVal || '')
        );
      }
    }

    if (Contacts !== undefined) {
      if (!Array.isArray(Contacts)) {
        return res.status(400).json({ success: false, message: 'Contacts must be an array' });
      }

      const { contacts, error } = normalizeCustomerContacts(Contacts);
      if (error) {
        return res.status(400).json({ success: false, message: error });
      }

      await replaceCustomerContacts(customerId, contacts, userId);
      await syncDefaultContactToCustomer(customerId);
    }

    // Update organization associations if provided
    if (OrganizationIds !== undefined && Array.isArray(OrganizationIds)) {
      if (OrganizationIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one organization must be selected'
        });
      }

      // Verify user has access to all specified organizations
      const [userOrgs] = await pool.execute<RowDataPacket[]>(
        `SELECT OrganizationId FROM OrganizationMembers WHERE UserId = ?`,
        [userId]
      );
      const userOrgIds = userOrgs.map(o => o.OrganizationId);
      
      for (const orgId of OrganizationIds) {
        if (!userOrgIds.includes(orgId)) {
          return res.status(403).json({
            success: false,
            message: 'You do not have access to one or more selected organizations'
          });
        }
      }

      const [oldOrgRows] = await pool.execute<RowDataPacket[]>(
        `SELECT o.Name
         FROM CustomerOrganizations co
         INNER JOIN Organizations o ON co.OrganizationId = o.Id
         WHERE co.CustomerId = ?
         ORDER BY o.Name ASC`,
        [customerId]
      );

      let newOrgNames: string[] = [];
      if (OrganizationIds.length > 0) {
        const uniqueOrgIds = Array.from(new Set(OrganizationIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
        if (uniqueOrgIds.length > 0) {
          const placeholders = uniqueOrgIds.map(() => '?').join(',');
          const [newOrgRows] = await pool.execute<RowDataPacket[]>(
            `SELECT Name FROM Organizations WHERE Id IN (${placeholders}) ORDER BY Name ASC`,
            uniqueOrgIds
          );
          newOrgNames = newOrgRows.map((row) => String(row.Name));
        }
      }

      const oldOrgNamesJoined = oldOrgRows.map((row) => String(row.Name)).join(', ');
      const newOrgNamesJoined = newOrgNames.join(', ');
      if (oldOrgNamesJoined !== newOrgNamesJoined) {
        await logCustomerHistory(
          customerId,
          userId!,
          'updated',
          'OrganizationIds',
          oldOrgNamesJoined,
          newOrgNamesJoined
        );
      }

      // Delete existing associations
      await pool.execute(
        `DELETE FROM CustomerOrganizations WHERE CustomerId = ?`,
        [customerId]
      );

      // Create new associations
      for (const orgId of OrganizationIds) {
        await pool.execute(
          `INSERT INTO CustomerOrganizations (CustomerId, OrganizationId) VALUES (?, ?)`,
          [customerId, orgId]
        );
      }
    }

    // Fetch the updated customer
    const [customers] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM Customers WHERE Id = ?`,
      [customerId]
    );

    const customer = customers[0];

    // Get organization associations
    const [orgs] = await pool.execute<RowDataPacket[]>(
      `SELECT co.CustomerId, co.OrganizationId, o.Name as OrganizationName, co.CreatedAt
       FROM CustomerOrganizations co
       INNER JOIN Organizations o ON co.OrganizationId = o.Id
       WHERE co.CustomerId = ?`,
      [customerId]
    );
    customer.Organizations = orgs;
    customer.Contacts = await getCustomerContacts(customerId);

    const orgIds = await getCustomerOrgIds(customerId);
    await invalidateCustomerCachesForOrgs(customerId, orgIds);

    res.json({
      success: true,
      data: customer,
      message: 'Customer updated successfully'
    });
  } catch (error) {
    logger.error('Update customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update customer' 
    });
  }
});

/**
 * @swagger
 * /api/customers/{id}:
 *   delete:
 *     summary: Delete a customer
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Customer not found
 */
// Delete (deactivate) a customer
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = parseInt(req.params.id as string);

    // Check if user has access to this customer
    const [existingCustomers] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT c.*
       FROM Customers c
       INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
       INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId
       WHERE om.UserId = ? AND c.Id = ?`,
      [userId, customerId]
    );

    if (existingCustomers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Soft delete - just deactivate
    await pool.execute(
      `UPDATE Customers SET IsActive = 0 WHERE Id = ?`,
      [customerId]
    );

    const orgIds = await getCustomerOrgIds(customerId);
    await invalidateCustomerCachesForOrgs(customerId, orgIds);

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    logger.error('Delete customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete customer' 
    });
  }
});

/**
 * @swagger
 * /api/customers/{id}/projects:
 *   get:
 *     summary: Get projects linked to a customer
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: List of projects for the customer
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Customer not found
 */
// Get projects for a customer
router.get('/:id/projects', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = parseInt(req.params.id as string);

    // Check if user has access to this customer
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM Customers c
       INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
       INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId
       WHERE om.UserId = ? AND c.Id = ?`,
      [userId, customerId]
    );

    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const projects = await cachedJson(cacheKeys.customerProjects(customerId), ENTITY_TTL_SECONDS, async () => {
    // Get projects for this customer with statistics
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.ProjectName, p.Status, p.StartDate, p.EndDate,
              psv.StatusName, psv.ColorCode as StatusColor, psv.IsClosed as StatusIsClosed, psv.IsCancelled as StatusIsCancelled,
              COUNT(CASE WHEN COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 THEN t.Id END) as TotalTasks,
              SUM(CASE WHEN COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 AND tsv.IsClosed = 1 THEN 1 ELSE 0 END) as CompletedTasks,
              COALESCE(SUM(CASE WHEN COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 THEN t.EstimatedHours ELSE 0 END), 0) as TotalEstimatedHours,
              COALESCE(SUM(CASE WHEN COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0 THEN te.Hours ELSE 0 END), 0) as TotalWorkedHours
       FROM Projects p
       LEFT JOIN ProjectStatusValues psv ON p.Status = psv.Id
       LEFT JOIN Tasks t ON p.Id = t.ProjectId
         AND (COALESCE(p.IsGlobal, 0) = 0 OR t.CustomerId = ?)
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TimeEntries te ON t.Id = te.TaskId
       WHERE p.CustomerId = ?
          OR (
            COALESCE(p.IsGlobal, 0) = 1
            AND EXISTS (
              SELECT 1
              FROM Tasks tg
              WHERE tg.ProjectId = p.Id
                AND tg.CustomerId = ?
            )
          )
       GROUP BY p.Id, p.ProjectName, p.Status, p.StartDate, p.EndDate,
                      psv.StatusName, psv.ColorCode, psv.IsClosed, psv.IsCancelled
       ORDER BY p.ProjectName`,
      [customerId, customerId, customerId]
    );
    return rows;
    });

    res.json({ success: true, data: projects });
  } catch (error) {
    logger.error('Get customer projects error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer projects' });
  }
});

/**
 * @swagger
 * /api/customers/{id}/users:
 *   get:
 *     summary: Get users associated with a customer
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: List of users associated with the customer
 *       401:
 *         description: Unauthorized
 */
// Get users associated with a customer
router.get('/:id/users', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = parseInt(req.params.id as string);

    // Check if user has access to this customer
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM Customers c
       INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
       INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId
       WHERE om.UserId = ? AND c.Id = ?`,
      [userId, customerId]
    );

    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Get users associated with this customer
    const [users] = await pool.execute<RowDataPacket[]>(
      `SELECT cu.UserId, u.Username, u.Email, u.FirstName, u.LastName, cu.Role, cu.CreatedAt
       FROM CustomerUsers cu
       INNER JOIN Users u ON cu.UserId = u.Id
       WHERE cu.CustomerId = ?
       ORDER BY u.FirstName, u.LastName`,
      [customerId]
    );

    res.json({ success: true, data: users });
  } catch (error) {
    logger.error('Get customer users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer users' });
  }
});

/**
 * @swagger
 * /api/customers/{id}/users:
 *   post:
 *     summary: Associate a user with a customer
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Customer ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: User associated with customer
 *       401:
 *         description: Unauthorized
 */
// Add a user to a customer
router.post('/:id/users', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.userId;
    const customerId = parseInt(req.params.id as string);
    const { userId, role } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Check if current user has access to this customer
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM Customers c
       INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
       INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId
       WHERE om.UserId = ? AND c.Id = ?`,
      [currentUserId, customerId]
    );

    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Check if user exists
    const [userExists] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM Users WHERE Id = ?`,
      [userId]
    );

    if (userExists.length === 0) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }

    // Check if already associated
    const [existing] = await pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM CustomerUsers WHERE CustomerId = ? AND UserId = ?`,
      [customerId, userId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'User is already associated with this customer' });
    }

    // Add the association
    await pool.execute(
      `INSERT INTO CustomerUsers (CustomerId, UserId, Role) VALUES (?, ?, ?)`,
      [customerId, userId, role || 'User']
    );

    const orgIds = await getCustomerOrgIds(customerId);
    await invalidateCustomerCachesForOrgs(customerId, orgIds);

    res.status(201).json({ success: true, message: 'User added to customer successfully' });
  } catch (error) {
    logger.error('Add customer user error:', error);
    res.status(500).json({ success: false, message: 'Failed to add user to customer' });
  }
});

/**
 * @swagger
 * /api/customers/{id}/users/{userId}:
 *   delete:
 *     summary: Remove a user association from a customer
 *     tags: [Customers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Customer ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID to remove
 *     responses:
 *       200:
 *         description: User association removed
 *       401:
 *         description: Unauthorized
 */
// Remove a user from a customer
router.delete('/:id/users/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const currentUserId = req.user?.userId;
    const customerId = parseInt(req.params.id as string);
    const userIdToRemove = parseInt(req.params.userId as string);

    // Check if current user has access to this customer
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM Customers c
       INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
       INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId
       WHERE om.UserId = ? AND c.Id = ?`,
      [currentUserId, customerId]
    );

    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Remove the association
    await pool.execute(
      `DELETE FROM CustomerUsers WHERE CustomerId = ? AND UserId = ?`,
      [customerId, userIdToRemove]
    );

    const orgIds = await getCustomerOrgIds(customerId);
    await invalidateCustomerCachesForOrgs(customerId, orgIds);

    res.json({ success: true, message: 'User removed from customer successfully' });
  } catch (error) {
    logger.error('Remove customer user error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove user from customer' });
  }
});

// Get enriched overview data for a customer (tasks by status/priority, team, overdue, upcoming, recent activity)
router.get('/:id/overview', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = parseInt(req.params.id as string);

    // Access check
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM Customers c
       INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
       INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId
       WHERE om.UserId = ? AND c.Id = ?`,
      [userId, customerId]
    );

    if (access.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const overviewData = await cachedJson(cacheKeys.customerOverview(customerId), ENTITY_TTL_SECONDS, async () => {
    // Calculate date boundaries in app layer to stay DB-agnostic
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const in14Days = new Date(today);
    in14Days.setDate(today.getDate() + 14);
    const in14DaysStr = in14Days.toISOString().split('T')[0];

    // Scope: a task belongs to this customer if:
    //   - project is directly owned by the customer (non-global), OR
    //   - project is global and the task has CustomerId = this customer
    const scopeSql = `(
      (p.CustomerId = ? AND COALESCE(p.IsGlobal, 0) = 0)
      OR (COALESCE(p.IsGlobal, 0) = 1 AND t.CustomerId = ?)
    )`;

    // Run all queries in parallel
    const [
      [tasksByStatus],
      [tasksByPriority],
      [recentTimeEntries],
      [teamMembers],
      [pendingTasks],
      [overdueTasks],
      [upcomingTasks],
    ] = await Promise.all([
      // Tasks by status
      pool.execute<RowDataPacket[]>(
        `SELECT tsv.StatusName, tsv.ColorCode as StatusColor,
                COALESCE(tsv.IsClosed, 0) as IsClosed,
                COUNT(t.Id) as TaskCount
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         INNER JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         WHERE ${scopeSql}
           AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
         GROUP BY tsv.Id, tsv.StatusName, tsv.ColorCode, tsv.IsClosed
         ORDER BY TaskCount DESC`,
        [customerId, customerId]
      ),
      // Tasks by priority
      pool.execute<RowDataPacket[]>(
        `SELECT tpv.PriorityName, tpv.ColorCode as PriorityColor, COUNT(t.Id) as TaskCount
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         INNER JOIN TaskPriorityValues tpv ON t.Priority = tpv.Id
         LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         WHERE ${scopeSql}
           AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
         GROUP BY tpv.Id, tpv.PriorityName, tpv.ColorCode
         ORDER BY TaskCount DESC`,
        [customerId, customerId]
      ),
      // Recent time entries (last 10)
      pool.execute<RowDataPacket[]>(
        `SELECT te.Id, te.WorkDate, te.Hours, te.Description,
                u.Id as UserId, u.FirstName, u.LastName, u.Username,
                t.Id as TaskId, t.TaskName,
                p.Id as ProjectId, p.ProjectName
         FROM TimeEntries te
         INNER JOIN Tasks t ON te.TaskId = t.Id
         INNER JOIN Projects p ON t.ProjectId = p.Id
         INNER JOIN Users u ON te.UserId = u.Id
         WHERE ${scopeSql}
         ORDER BY te.WorkDate DESC, te.Id DESC
         LIMIT 10`,
        [customerId, customerId]
      ),
      // Team members (users with time entries on this customer's tasks)
      pool.execute<RowDataPacket[]>(
        `SELECT u.Id as UserId, u.FirstName, u.LastName, u.Username,
                COUNT(DISTINCT t.Id) as TaskCount,
                COALESCE(SUM(te.Hours), 0) as WorkedHours
         FROM Users u
         INNER JOIN TimeEntries te ON u.Id = te.UserId
         INNER JOIN Tasks t ON te.TaskId = t.Id
         INNER JOIN Projects p ON t.ProjectId = p.Id
         WHERE ${scopeSql}
         GROUP BY u.Id, u.FirstName, u.LastName, u.Username
         ORDER BY WorkedHours DESC
         LIMIT 8`,
        [customerId, customerId]
      ),
      // Pending tasks (all non-closed tasks for this customer scope)
      pool.execute<RowDataPacket[]>(
        `SELECT t.Id, t.TaskName, t.PlannedEndDate,
                p.Id as ProjectId, p.ProjectName,
                u.FirstName as AssignedFirstName, u.LastName as AssignedLastName, u.Username as AssignedUsername,
                tsv.StatusName, tsv.ColorCode as StatusColor
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         INNER JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         LEFT JOIN Users u ON t.AssignedTo = u.Id
         WHERE ${scopeSql}
           AND COALESCE(tsv.IsClosed, 0) = 0
           AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
         ORDER BY CASE WHEN t.PlannedEndDate IS NULL THEN 1 ELSE 0 END,
                  t.PlannedEndDate ASC,
                  t.Id DESC
         LIMIT 20`,
        [customerId, customerId]
      ),
      // Overdue tasks (PlannedEndDate < today, not closed)
      pool.execute<RowDataPacket[]>(
        `SELECT t.Id, t.TaskName, t.PlannedEndDate,
                p.Id as ProjectId, p.ProjectName,
                u.FirstName as AssignedFirstName, u.LastName as AssignedLastName, u.Username as AssignedUsername,
                tsv.StatusName, tsv.ColorCode as StatusColor
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         INNER JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         LEFT JOIN Users u ON t.AssignedTo = u.Id
         WHERE ${scopeSql}
           AND t.PlannedEndDate < ?
           AND COALESCE(tsv.IsClosed, 0) = 0
           AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
         ORDER BY t.PlannedEndDate ASC
         LIMIT 10`,
        [customerId, customerId, todayStr]
      ),
      // Upcoming tasks in the next 14 days, not yet closed
      pool.execute<RowDataPacket[]>(
        `SELECT t.Id, t.TaskName, t.PlannedEndDate,
                p.Id as ProjectId, p.ProjectName,
                u.FirstName as AssignedFirstName, u.LastName as AssignedLastName, u.Username as AssignedUsername,
                tsv.StatusName, tsv.ColorCode as StatusColor
         FROM Tasks t
         INNER JOIN Projects p ON t.ProjectId = p.Id
         INNER JOIN TaskStatusValues tsv ON t.Status = tsv.Id
         LEFT JOIN Users u ON t.AssignedTo = u.Id
         WHERE ${scopeSql}
           AND t.PlannedEndDate >= ?
           AND t.PlannedEndDate <= ?
           AND COALESCE(tsv.IsClosed, 0) = 0
           AND COALESCE(tsv.HideFromPlanningAndStatistics, 0) = 0
         ORDER BY t.PlannedEndDate ASC
         LIMIT 10`,
        [customerId, customerId, todayStr, in14DaysStr]
      ),
    ]);

    return {
        tasksByStatus,
        tasksByPriority,
        recentTimeEntries,
        teamMembers,
        pendingTasks,
        overdueTasks,
        upcomingTasks,
      };
    });

    res.json({
      success: true,
      data: overviewData,
    });
  } catch (error) {
    logger.error('Get customer overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer overview' });
  }
});

export default router;
