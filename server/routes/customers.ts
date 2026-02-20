import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { logCustomerHistory } from '../utils/changeLog';

const router = Router();

// Get all customers for the current user's organizations
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { organizationId } = req.query;

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
      params = [userId!, parseInt(organizationId as string)];
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
      params = [userId!];
    }

    const [customers] = await pool.execute<RowDataPacket[]>(query, params);

    // Get organization associations and open ticket count for each customer
    for (const customer of customers) {
      const [orgs] = await pool.execute<RowDataPacket[]>(
        `SELECT co.CustomerId, co.OrganizationId, o.Name as OrganizationName, co.CreatedAt
         FROM CustomerOrganizations co
         INNER JOIN Organizations o ON co.OrganizationId = o.Id
         WHERE co.CustomerId = ?`,
        [customer.Id]
      );
      customer.Organizations = orgs;

      // Get open ticket count (excluding closed statuses)
      const [ticketCount] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count
         FROM Tickets t
         LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
         WHERE t.CustomerId = ? AND COALESCE(tsv.IsClosed, 0) = 0`,
        [customer.Id]
      );
      customer.OpenTickets = ticketCount[0].count;
    }

    res.json({
      success: true,
      data: customers
    });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch customers' 
    });
  }
});

// Get a specific customer
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = parseInt(req.params.id as string);

    // Check if user has access to this customer through their organizations
    const [customers] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT c.*
       FROM Customers c
       INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
       INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId
       WHERE om.UserId = ? AND c.Id = ?`,
      [userId, customerId]
    );

    if (customers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

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

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch customer' 
    });
  }
});

// Create a new customer
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { Name, Email, Phone, Address, Notes, DefaultSupportUserId, OrganizationIds, CreateDefaultProject, DefaultProjectName } = req.body;

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

    // Create customer
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Customers (Name, Email, Phone, Address, Notes, DefaultSupportUserId, IsActive, CreatedBy)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [Name.trim(), Email || null, Phone || null, Address || null, Notes || null, DefaultSupportUserId || null, userId]
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
    if (CreateDefaultProject) {
      const projectName = (DefaultProjectName && DefaultProjectName.trim()) || Name.trim();
      for (const orgId of OrganizationIds) {
        await pool.execute<ResultSetHeader>(
          `INSERT INTO Projects (OrganizationId, ProjectName, Description, CreatedBy, Status, StartDate, EndDate, IsHobby, CustomerId)
           VALUES (?, ?, ?, ?, (SELECT Id FROM ProjectStatusValues WHERE OrganizationId = ? AND IsDefault = 1 LIMIT 1), NULL, NULL, 0, ?)`,
          [orgId, projectName, `Default project for customer ${Name.trim()}`, userId, orgId, customerId]
        );
      }
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

    res.status(201).json({
      success: true,
      data: customer,
      message: 'Customer created successfully'
    });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create customer' 
    });
  }
});

// Update a customer
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = parseInt(req.params.id as string);
    const { Name, Email, Phone, Address, Notes, DefaultSupportUserId, IsActive, OrganizationIds, Website, ContactPerson, ContactEmail, ContactPhone, ProjectManagerId } = req.body;

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

    res.json({
      success: true,
      data: customer,
      message: 'Customer updated successfully'
    });
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update customer' 
    });
  }
});

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

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete customer' 
    });
  }
});

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

    // Get projects for this customer with statistics
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.ProjectName, p.Status, p.StartDate, p.EndDate,
              psv.StatusName, psv.ColorCode as StatusColor, psv.IsClosed as StatusIsClosed, psv.IsCancelled as StatusIsCancelled,
              COUNT(t.Id) as TotalTasks,
              SUM(CASE WHEN tsv.IsClosed = 1 THEN 1 ELSE 0 END) as CompletedTasks,
              COALESCE(SUM(t.EstimatedHours), 0) as TotalEstimatedHours,
              COALESCE(SUM(te.Hours), 0) as TotalWorkedHours
       FROM Projects p
       LEFT JOIN ProjectStatusValues psv ON p.Status = psv.Id
       LEFT JOIN Tasks t ON p.Id = t.ProjectId
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       LEFT JOIN TimeEntries te ON t.Id = te.TaskId
       WHERE p.CustomerId = ?
       GROUP BY p.Id, psv.StatusName, psv.ColorCode, psv.IsClosed, psv.IsCancelled
       ORDER BY p.ProjectName`,
      [customerId]
    );

    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('Get customer projects error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer projects' });
  }
});

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
    console.error('Get customer users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer users' });
  }
});

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

    res.status(201).json({ success: true, message: 'User added to customer successfully' });
  } catch (error) {
    console.error('Add customer user error:', error);
    res.status(500).json({ success: false, message: 'Failed to add user to customer' });
  }
});

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

    res.json({ success: true, message: 'User removed from customer successfully' });
  } catch (error) {
    console.error('Remove customer user error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove user from customer' });
  }
});

export default router;
