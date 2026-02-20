import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { createNotification } from './notifications';
import { logActivity } from './activityLogs';
import { sanitizeRichText } from '../utils/sanitize';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Tickets
 *   description: Ticket management endpoints
 */

// Helper function to normalize string values from request
function normalizeString(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

// Helper function to log ticket history
async function logTicketHistory(
  ticketId: number,
  userId: number,
  action: string,
  fieldName: string | null = null,
  oldValue: any = null,
  newValue: any = null
) {
  try {
    // Convert values to string or null
    const oldStr = oldValue !== null && oldValue !== undefined ? String(oldValue) : null;
    const newStr = newValue !== null && newValue !== undefined ? String(newValue) : null;
    
    await pool.execute(
      `INSERT INTO TicketHistory (TicketId, UserId, Action, FieldName, OldValue, NewValue) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ticketId, userId, action, fieldName, oldStr, newStr]
    );
  } catch (error) {
    console.error('Error logging ticket history:', error);
    // Don't throw - history logging should not break the main operation
  }
}

/**
 * @swagger
 * /api/tickets:
 *   get:
 *     summary: Get all tickets
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         description: Filter by organization
 *         schema: { type: integer }
 *       - in: query
 *         name: projectId
 *         description: Filter by project
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         description: Filter by status name
 *         schema: { type: string }
 *       - in: query
 *         name: assignedTo
 *         description: Filter by assigned user ID
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of tickets
 *       500:
 *         description: Internal server error
 */
// Get all tickets (filtered by user role)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;
    const { organizationId, projectId, status, priority, category, assignedTo, developer, customer, search, excludeClosed, createdFrom, createdTo, scheduledFrom, scheduledTo } = req.query;

    let query = `
      SELECT 
        t.*,
        o.Name as OrganizationName,
        c.Name as CustomerName,
        p.ProjectName,
        creator.FirstName as CreatorFirstName,
        creator.LastName as CreatorLastName,
        creator.Username as CreatorUsername,
        assignee.FirstName as AssigneeFirstName,
        assignee.LastName as AssigneeLastName,
        assignee.Username as AssigneeUsername,
        developer.FirstName as DeveloperFirstName,
        developer.LastName as DeveloperLastName,
        developer.Username as DeveloperUsername,
        (SELECT COUNT(*) FROM TicketComments tc WHERE tc.TicketId = t.Id) as CommentCount,
        tsv.StatusName as Status,
        tsv.Color as StatusColor,
        COALESCE(tsv.IsClosed, 0) as StatusIsClosed,
        tsv.StatusType as StatusType,
        tpv.PriorityName as Priority,
        tpv.Color as PriorityColor
      FROM Tickets t
      LEFT JOIN Organizations o ON t.OrganizationId = o.Id
      LEFT JOIN Customers c ON t.CustomerId = c.Id
      LEFT JOIN Projects p ON t.ProjectId = p.Id
      LEFT JOIN Users creator ON t.CreatedByUserId = creator.Id
      LEFT JOIN Users assignee ON t.AssignedToUserId = assignee.Id
      LEFT JOIN Users developer ON t.DeveloperUserId = developer.Id
      LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
      LEFT JOIN TicketPriorityValues tpv ON t.PriorityId = tpv.Id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Customer users can only see their own tickets
    if (customerId) {
      query += ` AND t.CustomerId = ?`;
      params.push(customerId);
    } else {
      // Regular users see tickets from their organizations
      query += ` AND t.OrganizationId IN (
        SELECT OrganizationId FROM OrganizationMembers WHERE UserId = ?
      )`;
      params.push(userId);
    }

    if (organizationId) {
      query += ` AND t.OrganizationId = ?`;
      params.push(organizationId);
    }

    if (projectId) {
      query += ` AND t.ProjectId = ?`;
      params.push(projectId);
    }

    if (status) {
      query += ` AND tsv.StatusName = ?`;
      params.push(status);
    }

    if (priority) {
      query += ` AND tpv.PriorityName = ?`;
      params.push(priority);
    }

    if (category) {
      query += ` AND t.Category = ?`;
      params.push(category);
    }

    if (assignedTo) {
      query += ` AND t.AssignedToUserId = ?`;
      params.push(assignedTo);
    }

    if (developer) {
      query += ` AND t.DeveloperUserId = ?`;
      params.push(developer);
    }

    if (customer) {
      query += ` AND t.CustomerId = ?`;
      params.push(customer);
    }

    if (search) {
      query += ` AND (t.Title LIKE ? OR t.TicketNumber LIKE ? OR t.Description LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (excludeClosed === 'true') {
      query += ` AND COALESCE(tsv.IsClosed, 0) = 0`;
    }

    if (createdFrom) {
      query += ` AND DATE(t.CreatedAt) >= ?`;
      params.push(createdFrom);
    }

    if (createdTo) {
      query += ` AND DATE(t.CreatedAt) <= ?`;
      params.push(createdTo);
    }

    if (scheduledFrom) {
      query += ` AND DATE(t.ScheduledDate) >= ?`;
      params.push(scheduledFrom);
    }

    if (scheduledTo) {
      query += ` AND DATE(t.ScheduledDate) <= ?`;
      params.push(scheduledTo);
    }

    query += ` ORDER BY t.CreatedAt DESC`;

    const [tickets] = await pool.execute<RowDataPacket[]>(query, params);

    res.json({ success: true, tickets });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

/**
 * @swagger
 * /api/tickets/my-tickets:
 *   get:
 *     summary: Get tickets assigned to the current user
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tickets assigned to or developed by current user
 *       500:
 *         description: Internal server error
 */
// Get my tickets (where I'm assignee OR developer)
// MUST be before /:id to avoid route conflict
router.get('/my-tickets', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    const query = `
      SELECT 
        t.*,
        o.Name as OrganizationName,
        c.Name as CustomerName,
        p.ProjectName,
        creator.FirstName as CreatorFirstName,
        creator.LastName as CreatorLastName,
        creator.Username as CreatorUsername,
        assignee.FirstName as AssigneeFirstName,
        assignee.LastName as AssigneeLastName,
        assignee.Username as AssigneeUsername,
        developer.FirstName as DeveloperFirstName,
        developer.LastName as DeveloperLastName,
        developer.Username as DeveloperUsername,
        (SELECT COUNT(*) FROM TicketComments tc WHERE tc.TicketId = t.Id) as CommentCount,
        tsv.StatusName as Status,
        tsv.Color as StatusColor,
        COALESCE(tsv.IsClosed, 0) as StatusIsClosed,
        tsv.StatusType as StatusType,
        tpv.PriorityName as Priority,
        tpv.Color as PriorityColor
      FROM Tickets t
      LEFT JOIN Organizations o ON t.OrganizationId = o.Id
      LEFT JOIN Customers c ON t.CustomerId = c.Id
      LEFT JOIN Projects p ON t.ProjectId = p.Id
      LEFT JOIN Users creator ON t.CreatedByUserId = creator.Id
      LEFT JOIN Users assignee ON t.AssignedToUserId = assignee.Id
      LEFT JOIN Users developer ON t.DeveloperUserId = developer.Id
      LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
      LEFT JOIN TicketPriorityValues tpv ON t.PriorityId = tpv.Id
      WHERE (t.AssignedToUserId = ? OR t.DeveloperUserId = ?)
      ORDER BY t.CreatedAt DESC
    `;

    const [tickets] = await pool.execute<RowDataPacket[]>(query, [userId, userId]);

    res.json({ success: true, tickets });
  } catch (error) {
    console.error('Error fetching my tickets:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

/**
 * @swagger
 * /api/tickets/{id}:
 *   get:
 *     summary: Get a single ticket with comments and history
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Ticket ID
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ticket object with comments
 *       404:
 *         description: Ticket not found
 *       403:
 *         description: Access denied
 *       500:
 *         description: Internal server error
 */
// Get single ticket by ID
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;

    const [tickets] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        t.*,
        o.Name as OrganizationName,
        c.Name as CustomerName,
        p.ProjectName,
        creator.FirstName as CreatorFirstName,
        creator.LastName as CreatorLastName,
        creator.Username as CreatorUsername,
        creator.Email as CreatorEmail,
        assignee.FirstName as AssigneeFirstName,
        assignee.LastName as AssigneeLastName,
        assignee.Username as AssigneeUsername,
        developer.FirstName as DeveloperFirstName,
        developer.LastName as DeveloperLastName,
        developer.Username as DeveloperUsername,
        tsv.StatusName as Status,
        tsv.Color as StatusColor,
        COALESCE(tsv.IsClosed, 0) as StatusIsClosed,
        tsv.StatusType as StatusType,
        tpv.PriorityName as Priority,
        tpv.Color as PriorityColor
      FROM Tickets t
      LEFT JOIN Organizations o ON t.OrganizationId = o.Id
      LEFT JOIN Customers c ON t.CustomerId = c.Id
      LEFT JOIN Projects p ON t.ProjectId = p.Id
      LEFT JOIN Users creator ON t.CreatedByUserId = creator.Id
      LEFT JOIN Users assignee ON t.AssignedToUserId = assignee.Id
      LEFT JOIN Users developer ON t.DeveloperUserId = developer.Id
      LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
      LEFT JOIN TicketPriorityValues tpv ON t.PriorityId = tpv.Id
      WHERE t.Id = ?
    `, [id]);

    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = tickets[0];

    // Check access
    if (customerId && ticket.CustomerId !== customerId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Get comments (filter internal comments for customer users)
    let commentsQuery = `
      SELECT 
        tc.*,
        u.FirstName,
        u.LastName,
        u.Username,
        u.Email
      FROM TicketComments tc
      LEFT JOIN Users u ON tc.UserId = u.Id
      WHERE tc.TicketId = ?
    `;
    
    if (customerId) {
      commentsQuery += ` AND tc.IsInternal = 0`;
    }
    
    commentsQuery += ` ORDER BY tc.CreatedAt ASC`;

    const [comments] = await pool.execute<RowDataPacket[]>(commentsQuery, [id]);

    res.json({ success: true, ticket, comments });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
  }
});

/**
 * @swagger
 * /api/tickets:
 *   post:
 *     summary: Create a new ticket
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, title]
 *             properties:
 *               organizationId:
 *                 type: integer
 *               projectId:
 *                 type: integer
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               priority:
 *                 type: string
 *               assignedTo:
 *                 type: integer
 *               status:
 *                 type: string
 *               externalTicketId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ticket created successfully
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
// Create new ticket
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;
    const { organizationId, projectId, title, description, priority, category, customerId: bodyCustomerId, externalTicketId } = req.body;

    if (!organizationId || !title) {
      return res.status(400).json({ success: false, message: 'Organization and title are required' });
    }

    // Get organization abbreviation
    const [orgResult] = await pool.execute<RowDataPacket[]>(
      'SELECT Abbreviation FROM Organizations WHERE Id = ?',
      [organizationId]
    );
    
    if (orgResult.length === 0) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }
    
    const orgAbbr = orgResult[0].Abbreviation || `ORG${organizationId}`;

    // Determine customer: from JWT (customer user), from body, or from project
    let ticketCustomerId = customerId || bodyCustomerId || null;
    
    // If not customer user and no bodyCustomerId but has projectId, get customer from project
    if (!ticketCustomerId && projectId) {
      console.log('[Ticket Creation] Getting customer from projectId:', projectId);
      const [projectResult] = await pool.execute<RowDataPacket[]>(
        'SELECT CustomerId FROM Projects WHERE Id = ?',
        [projectId]
      );
      if (projectResult.length > 0 && projectResult[0].CustomerId) {
        ticketCustomerId = projectResult[0].CustomerId;
        console.log('[Ticket Creation] Found customer from project:', ticketCustomerId);
      }
    }

    // Customer is required
    if (!ticketCustomerId) {
      return res.status(400).json({ success: false, message: 'Customer is required. Please select a customer or a project with a customer.' });
    }

    // If we have a customer, get default support user for auto-assignment
    let assignedToUserId = null;
    if (ticketCustomerId) {
      console.log('[Ticket Creation] Ticket for customerId:', ticketCustomerId);
      const [customerResult] = await pool.execute<RowDataPacket[]>(
        'SELECT DefaultSupportUserId FROM Customers WHERE Id = ?',
        [ticketCustomerId]
      );
      console.log('[Ticket Creation] Customer query result:', customerResult);
      if (customerResult.length > 0 && customerResult[0].DefaultSupportUserId) {
        assignedToUserId = customerResult[0].DefaultSupportUserId;
        console.log('[Ticket Creation] Auto-assigning to support user:', assignedToUserId);
      } else {
        console.log('[Ticket Creation] No DefaultSupportUserId found for customer');
      }
    } else {
      console.log('[Ticket Creation] No customer for this ticket (neither from user nor project)');
    }

    // Resolve StatusId (default for org) and PriorityId from name
    const [defaultStatusRows] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM TicketStatusValues WHERE OrganizationId = ? AND IsDefault = 1 LIMIT 1',
      [organizationId]
    );
    const [firstStatusRows] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM TicketStatusValues WHERE OrganizationId = ? ORDER BY SortOrder LIMIT 1',
      [organizationId]
    );
    const newStatusId = defaultStatusRows[0]?.Id || firstStatusRows[0]?.Id || null;

    const priorityName = priority || 'Medium';
    const [priorityRows] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM TicketPriorityValues WHERE OrganizationId = ? AND PriorityName = ?',
      [organizationId, priorityName]
    );
    const [defaultPriorityRows] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM TicketPriorityValues WHERE OrganizationId = ? AND IsDefault = 1 LIMIT 1',
      [organizationId]
    );
    const newPriorityId = priorityRows[0]?.Id || defaultPriorityRows[0]?.Id || null;

    // Insert ticket first to get the ID
    console.log('[Ticket Creation] Inserting ticket with AssignedToUserId:', assignedToUserId);
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Tickets (
        OrganizationId, CustomerId, ProjectId, CreatedByUserId, AssignedToUserId,
        Title, Description, StatusId, PriorityId, Category, ExternalTicketId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        ticketCustomerId,
        projectId || null,
        userId,
        assignedToUserId,
        title,
        sanitizeRichText(description) || null,
        newStatusId,
        newPriorityId,
        category || 'Support',
        externalTicketId || null
      ]
    );

    const ticketId = result.insertId;
    console.log('[Ticket Creation] Ticket created with ID:', ticketId);
    
    // Generate ticket number using abbreviation and ticket ID
    const ticketNumber = `TKT-${orgAbbr}-${ticketId}`;
    
    // Update ticket with the generated number
    await pool.execute(
      'UPDATE Tickets SET TicketNumber = ? WHERE Id = ?',
      [ticketNumber, ticketId]
    );

    // Log ticket creation
    await logTicketHistory(ticketId, userId!, 'Created', null, null, null);

    // Log activity
    await logActivity(
      userId ?? null,
      req.user?.username || null,
      'TICKET_CREATE',
      'Ticket',
      ticketId,
      ticketNumber,
      `Created ticket: ${ticketNumber} - ${title}`,
      req.ip,
      req.get('user-agent')
    );

    // Notify organization managers about new ticket
    const [orgManagers] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT u.Id 
       FROM Users u
       INNER JOIN OrganizationMembers om ON u.Id = om.UserId
       WHERE om.OrganizationId = ? AND (u.IsManager = 1 OR u.IsAdmin = 1) AND u.Id != ?`,
      [organizationId, userId]
    );
    
    for (const manager of orgManagers) {
      await createNotification(
        manager.Id,
        'ticket_created',
        'New Ticket Created',
        `Ticket ${ticketNumber}: ${title}`,
        `/tickets/${ticketId}`
      );
    }

    // Notify assigned support user if auto-assigned
    if (assignedToUserId && assignedToUserId !== userId) {
      console.log('[Ticket Creation] Sending notification to assigned support user:', assignedToUserId);
      await createNotification(
        assignedToUserId,
        'ticket_assigned',
        'Ticket Assigned',
        `You have been assigned to ticket ${ticketNumber}: ${title}`,
        `/tickets/${ticketId}`
      );
    } else {
      console.log('[Ticket Creation] No notification sent. AssignedUser:', assignedToUserId, 'CreatedBy:', userId);
    }

    res.json({ 
      success: true, 
      message: 'Ticket created successfully',
      ticketId,
      ticketNumber
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ success: false, message: 'Failed to create ticket' });
  }
});

/**
 * @swagger
 * /api/tickets/{id}:
 *   put:
 *     summary: Update a ticket
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Ticket ID
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *               priority:
 *                 type: string
 *               assignedToUserId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Ticket updated successfully
 *       404:
 *         description: Ticket not found
 *       403:
 *         description: Access denied
 *       500:
 *         description: Internal server error
 */
// Update ticket
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const ticketId = parseInt(Array.isArray(id) ? id[0] : id);
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;
    
    // Normalize all string values from request body
    const title = normalizeString(req.body.title);
    const description = normalizeString(req.body.description);
    const status = normalizeString(req.body.status);
    const priority = normalizeString(req.body.priority);
    const category = normalizeString(req.body.category);
    const assignedToUserId = req.body.assignedToUserId;
    const projectId = req.body.projectId;
    const developerUserId = req.body.developerUserId;
    const scheduledDate = normalizeString(req.body.scheduledDate);
    const organizationId = req.body.organizationId;
    const customerId_new = req.body.customerId; // Different from user's customerId

    // Verify access - include status/priority names via JOIN for logging
    const [tickets] = await pool.execute<RowDataPacket[]>(
      `SELECT t.*, tsv.StatusName as Status, tpv.PriorityName as Priority
       FROM Tickets t
       LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
       LEFT JOIN TicketPriorityValues tpv ON t.PriorityId = tpv.Id
       WHERE t.Id = ?`,
      [ticketId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = tickets[0];

    // Check if user is manager or admin
    const [users] = await pool.execute<RowDataPacket[]>(
      'SELECT IsManager, IsAdmin FROM Users WHERE Id = ?',
      [userId]
    );
    const isManagerOrAdmin = users.length > 0 && (users[0].IsManager || users[0].IsAdmin);

    // Customer users can only update their own tickets and limited fields
    if (customerId) {
      if (ticket.CustomerId !== customerId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      // Customer can only update title and description
      if (title !== undefined && title !== ticket.Title) {
        await logTicketHistory(ticketId, userId!, 'Updated', 'Title', ticket.Title, title);
      }
      if (description !== undefined && description !== ticket.Description) {
        await logTicketHistory(ticketId, userId!, 'Updated', 'Description', ticket.Description, description);
      }
      
      await pool.execute(
        `UPDATE Tickets SET Title = ?, Description = ?, UpdatedAt = NOW() WHERE Id = ?`,
        [title || ticket.Title, sanitizeRichText(description) || ticket.Description, ticketId]
      );
    } else {
      // Regular users can update all fields
      const updates: string[] = [];
      const params: any[] = [];

      if (title !== undefined) {
        if (title !== ticket.Title) {
          await logTicketHistory(ticketId, userId!, 'Updated', 'Title', ticket.Title, title);
        }
        updates.push('Title = ?');
        params.push(title);
      }
      if (description !== undefined) {
        if (description !== ticket.Description) {
          await logTicketHistory(ticketId, userId!, 'Updated', 'Description', ticket.Description, description);
        }
        updates.push('Description = ?');
        params.push(description);
      }
      if (status !== undefined) {
        // Resolve new StatusId from name
        const [statusRow] = await pool.execute<RowDataPacket[]>(
          'SELECT Id, IsClosed FROM TicketStatusValues WHERE OrganizationId = ? AND StatusName = ?',
          [ticket.OrganizationId, status]
        );
        if (statusRow.length === 0) {
          return res.status(400).json({ success: false, message: `Invalid status: ${status}` });
        }
        const newStatusId = statusRow[0].Id;
        const newStatusIsClosed = statusRow[0].IsClosed;

        if (status !== ticket.Status) {
          await logTicketHistory(ticketId, userId!, 'StatusChanged', 'Status', ticket.Status, status);
          
          // Notify ticket creator about ANY status change (if they're not the one making the change)
          if (ticket.CreatedByUserId && ticket.CreatedByUserId !== userId) {
            await createNotification(
              ticket.CreatedByUserId,
              'ticket_status',
              'Ticket Status Changed',
              `Your ticket ${ticket.TicketNumber} status changed from "${ticket.Status}" to "${status}"`,
              `/tickets/${ticketId}`
            );
          }
          
          // Also notify assignee if different from creator and updater
          if (ticket.AssignedToUserId && ticket.AssignedToUserId !== userId && ticket.AssignedToUserId !== ticket.CreatedByUserId) {
            await createNotification(
              ticket.AssignedToUserId,
              'ticket_status',
              'Assigned Ticket Status Changed',
              `Ticket ${ticket.TicketNumber} status changed from "${ticket.Status}" to "${status}"`,
              `/tickets/${ticketId}`
            );
          }
        }
        updates.push('StatusId = ?');
        params.push(newStatusId);
        
        // Set timestamps based on IsClosed flag (not hardcoded status names)
        if (newStatusIsClosed && !ticket.ResolvedAt) {
          updates.push('ResolvedAt = NOW()');
        }
        if (newStatusIsClosed && !ticket.ClosedAt) {
          updates.push('ClosedAt = NOW()');
        }
      }
      if (priority !== undefined) {
        // Resolve new PriorityId from name
        const [priorityRow] = await pool.execute<RowDataPacket[]>(
          'SELECT Id FROM TicketPriorityValues WHERE OrganizationId = ? AND PriorityName = ?',
          [ticket.OrganizationId, priority]
        );
        if (priorityRow.length === 0) {
          return res.status(400).json({ success: false, message: `Invalid priority: ${priority}` });
        }
        const newPriorityId = priorityRow[0].Id;

        if (priority !== ticket.Priority) {
          await logTicketHistory(ticketId, userId!, 'PriorityChanged', 'Priority', ticket.Priority, priority);
        }
        updates.push('PriorityId = ?');
        params.push(newPriorityId);
      }
      if (category !== undefined) {
        if (category !== ticket.Category) {
          await logTicketHistory(ticketId, userId!, 'Updated', 'Category', ticket.Category, category);
        }
        updates.push('Category = ?');
        params.push(category);
      }
      if (assignedToUserId !== undefined) {
        const oldAssignee = ticket.AssignedToUserId ? ticket.AssignedToUserId.toString() : null;
        const newAssignee = assignedToUserId ? assignedToUserId.toString() : null;
        if (oldAssignee !== newAssignee) {
          await logTicketHistory(ticketId, userId!, 'AssignedToChanged', 'AssignedToUserId', oldAssignee, newAssignee);
          
          // Notify new assignee
          if (assignedToUserId) {
            await createNotification(
              assignedToUserId,
              'ticket_assigned',
              'Ticket Assigned to You',
              `You have been assigned to ticket ${ticket.TicketNumber}: ${ticket.Title}`,
              `/tickets/${ticketId}`
            );
          }
        }
        updates.push('AssignedToUserId = ?');
        params.push(assignedToUserId || null);
      }
      if (projectId !== undefined) {
        const oldProject = ticket.ProjectId ? ticket.ProjectId.toString() : null;
        const newProject = projectId ? projectId.toString() : null;
        if (oldProject !== newProject) {
          await logTicketHistory(ticketId, userId!, 'Updated', 'ProjectId', oldProject, newProject);
        }
        updates.push('ProjectId = ?');
        params.push(projectId || null);
      }
      if (developerUserId !== undefined) {
        const oldDeveloper = ticket.DeveloperUserId ? ticket.DeveloperUserId.toString() : null;
        const newDeveloper = developerUserId ? developerUserId.toString() : null;
        if (oldDeveloper !== newDeveloper) {
          await logTicketHistory(ticketId, userId!, 'DeveloperChanged', 'DeveloperUserId', oldDeveloper, newDeveloper);
          
          // Notify new developer
          if (developerUserId) {
            await createNotification(
              developerUserId,
              'ticket_developer',
              'Assigned as Developer',
              `You are now the developer for ticket ${ticket.TicketNumber}: ${ticket.Title}`,
              `/tickets/${ticketId}`
            );
          }
        }
        updates.push('DeveloperUserId = ?');
        params.push(developerUserId || null);
      }
      if (scheduledDate !== undefined) {
        const oldDate = ticket.ScheduledDate ? ticket.ScheduledDate.toString() : null;
        const newDate = scheduledDate ? scheduledDate.toString() : null;
        if (oldDate !== newDate) {
          await logTicketHistory(ticketId, userId!, 'Updated', 'ScheduledDate', oldDate, newDate);
        }
        updates.push('ScheduledDate = ?');
        params.push(scheduledDate || null);
      }
      
      // Only managers and admins can change organization and customer
      if (isManagerOrAdmin) {
        if (organizationId !== undefined) {
          const oldOrg = ticket.OrganizationId ? ticket.OrganizationId.toString() : null;
          const newOrg = organizationId ? organizationId.toString() : null;
          if (oldOrg !== newOrg) {
            await logTicketHistory(ticketId, userId!, 'Updated', 'OrganizationId', oldOrg, newOrg);
          }
          updates.push('OrganizationId = ?');
          params.push(organizationId || null);
        }
        if (customerId_new !== undefined) {
          const oldCust = ticket.CustomerId ? ticket.CustomerId.toString() : null;
          const newCust = customerId_new ? customerId_new.toString() : null;
          if (oldCust !== newCust) {
            await logTicketHistory(ticketId, userId!, 'Updated', 'CustomerId', oldCust, newCust);
          }
          updates.push('CustomerId = ?');
          params.push(customerId_new || null);
        }
      }

      updates.push('UpdatedAt = NOW()');
      params.push(ticketId);

      await pool.execute(
        `UPDATE Tickets SET ${updates.join(', ')} WHERE Id = ?`,
        params
      );
      
      // Log activity for ticket update
      await logActivity(
        userId ?? null,
        req.user?.username || null,
        'TICKET_UPDATE',
        'Ticket',
        ticketId,
        ticket.TicketNumber,
        `Updated ticket: ${ticket.TicketNumber}`,
        req.ip,
        req.get('user-agent')
      );
    }

    res.json({ success: true, message: 'Ticket updated successfully' });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ success: false, message: 'Failed to update ticket' });
  }
});

/**
 * @swagger
 * /api/tickets/{id}/comments:
 *   post:
 *     summary: Add a comment to a ticket
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Ticket ID
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [comment]
 *             properties:
 *               comment:
 *                 type: string
 *               isInternal:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Comment added successfully
 *       404:
 *         description: Ticket not found
 *       403:
 *         description: Access denied
 *       500:
 *         description: Internal server error
 */
// Add comment to ticket
router.post('/:id/comments', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;
    const { comment, isInternal } = req.body;

    if (!comment) {
      return res.status(400).json({ success: false, message: 'Comment is required' });
    }

    // Verify ticket exists and user has access
    const [tickets] = await pool.execute<RowDataPacket[]>(
      `SELECT t.*, tsv.StatusName as Status, COALESCE(tsv.IsClosed, 0) as StatusIsClosed
       FROM Tickets t
       LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
       WHERE t.Id = ?`,
      [id]
    );

    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = tickets[0];

    if (customerId && ticket.CustomerId !== customerId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Customer users cannot create internal comments
    const isInternalComment = customerId ? false : (isInternal || false);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO TicketComments (TicketId, UserId, Comment, IsInternal) VALUES (?, ?, ?, ?)`,
      [id, userId, comment, isInternalComment ? 1 : 0]
    );

    // Auto-update ticket status based on who is commenting
    // Internal notes don't trigger status changes
    if (!isInternalComment) {
      const currentStatus = ticket.Status;
      let newStatus = null;

      if (customerId) {
        // Customer is replying
        // If ticket was "Waiting Response", move to "Open" (needs attention)
        // If ticket was "Resolved", move to "Open" (customer has follow-up)
        if (currentStatus === 'Waiting Response' || currentStatus === 'Resolved') {
          newStatus = 'Open';
        }
      } else {
        // Staff is replying (non-internal comment visible to customer)
        // If ticket is "Open", move to "Waiting Response" (waiting for customer reply)
        if (currentStatus === 'Open') {
          newStatus = 'Waiting Response';
        }
        // Auto-set FirstResponseAt on first staff response
        await pool.execute(
          `UPDATE Tickets SET FirstResponseAt = NOW() WHERE Id = ? AND FirstResponseAt IS NULL AND CreatedByUserId != ?`,
          [id, userId]
        );
      }

      if (newStatus) {
        // Look up the StatusId for the new status name in this org
        const [newStatusRow] = await pool.execute<RowDataPacket[]>(
          'SELECT Id FROM TicketStatusValues WHERE OrganizationId = ? AND StatusName = ?',
          [ticket.OrganizationId, newStatus]
        );
        if (newStatusRow.length > 0) {
          await pool.execute(
            'UPDATE Tickets SET StatusId = ?, UpdatedAt = NOW() WHERE Id = ?',
            [newStatusRow[0].Id, id]
          );
        } else {
          await pool.execute('UPDATE Tickets SET UpdatedAt = NOW() WHERE Id = ?', [id]);
        }
      } else {
        // Just update the timestamp
        await pool.execute('UPDATE Tickets SET UpdatedAt = NOW() WHERE Id = ?', [id]);
      }
    } else {
      // Internal note - just update timestamp
      await pool.execute('UPDATE Tickets SET UpdatedAt = NOW() WHERE Id = ?', [id]);
    }

    // Notify relevant users about new comment (unless it's internal)
    if (!isInternalComment) {
      // Notify ticket creator if they're not the commenter
      if (ticket.CreatedByUserId !== userId) {
        await createNotification(
          ticket.CreatedByUserId,
          'ticket_comment',
          'New Comment on Your Ticket',
          `New comment on ticket ${ticket.TicketNumber}`,
          `/tickets/${id}`
        );
      }
      
      // Notify assignee if different from creator and commenter
      if (ticket.AssignedToUserId && ticket.AssignedToUserId !== userId && ticket.AssignedToUserId !== ticket.CreatedByUserId) {
        await createNotification(
          ticket.AssignedToUserId,
          'ticket_comment',
          'New Comment on Assigned Ticket',
          `New comment on ticket ${ticket.TicketNumber}`,
          `/tickets/${id}`
        );
      }
    }

    res.json({ 
      success: true, 
      message: 'Comment added successfully',
      commentId: result.insertId
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ success: false, message: 'Failed to add comment' });
  }
});

/**
 * @swagger
 * /api/tickets/stats/summary:
 *   get:
 *     summary: Get ticket statistics summary (counts by status)
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         description: Filter statistics by organization
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ticket statistics object with counts by status and priority
 *       500:
 *         description: Internal server error
 */
// Get ticket statistics
router.get('/stats/summary', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;
    const { organizationId } = req.query;

    let baseCondition = '';
    const params: any[] = [];

    if (customerId) {
      baseCondition = 'WHERE t.CustomerId = ?';
      params.push(customerId);
    } else if (organizationId) {
      baseCondition = 'WHERE t.OrganizationId = ?';
      params.push(organizationId);
    } else {
      baseCondition = `WHERE t.OrganizationId IN (
        SELECT OrganizationId FROM OrganizationMembers WHERE UserId = ?
      )`;
      params.push(userId);
    }

    const [stats] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN tsv.StatusType = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN tsv.StatusType = 'in_progress' THEN 1 ELSE 0 END) as inProgress,
        SUM(CASE WHEN tsv.StatusType = 'waiting' THEN 1 ELSE 0 END) as waiting,
        SUM(CASE WHEN tsv.StatusType = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN tsv.StatusType = 'closed' THEN 1 ELSE 0 END) as closed,
        SUM(CASE WHEN tpv.PriorityName = 'Urgent' THEN 1 ELSE 0 END) as urgent,
        SUM(CASE WHEN tpv.PriorityName = 'High' THEN 1 ELSE 0 END) as high
      FROM Tickets t
      LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
      LEFT JOIN TicketPriorityValues tpv ON t.PriorityId = tpv.Id
      ${baseCondition}
    `, params);

    res.json({ success: true, stats: stats[0] });
  } catch (error) {
    console.error('Error fetching ticket stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
  }
});

/**
 * @swagger
 * /api/tickets/{id}:
 *   delete:
 *     summary: Delete a ticket (admin only)
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Ticket ID
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ticket deleted successfully
 *       403:
 *         description: Only admins can delete tickets
 *       500:
 *         description: Internal server error
 */
// Delete ticket (admin only)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user?.isAdmin;

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Only admins can delete tickets' });
    }

    // Get ticket info before deletion
    const [ticket] = await pool.execute<RowDataPacket[]>(
      'SELECT TicketNumber, Title FROM Tickets WHERE Id = ?',
      [id]
    );

    const ticketInfo = ticket.length > 0 ? ticket[0] : null;

    // Delete comments first
    await pool.execute('DELETE FROM TicketComments WHERE TicketId = ?', [id]);
    
    // Delete history
    await pool.execute('DELETE FROM TicketHistory WHERE TicketId = ?', [id]);
    
    // Delete ticket
    await pool.execute('DELETE FROM Tickets WHERE Id = ?', [id]);

    // Log activity
    if (ticketInfo) {
      await logActivity(
        req.user?.userId ?? null,
        req.user?.username || null,
        'TICKET_DELETE',
        'Ticket',
        Number(id),
        ticketInfo.TicketNumber,
        `Deleted ticket: ${ticketInfo.TicketNumber} - ${ticketInfo.Title}`,
        req.ip,
        req.get('user-agent')
      );
    }

    res.json({ success: true, message: 'Ticket deleted successfully' });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ success: false, message: 'Failed to delete ticket' });
  }
});

/**
 * @swagger
 * /api/tickets/{id}/history:
 *   get:
 *     summary: Get change history for a ticket
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Ticket ID
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of history entries
 *       404:
 *         description: Ticket not found
 *       403:
 *         description: Access denied
 *       500:
 *         description: Internal server error
 */
// Get ticket history
router.get('/:id/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;

    // Verify access to ticket
    const [tickets] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Tickets WHERE Id = ?',
      [id]
    );

    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = tickets[0];

    // Check access
    if (customerId) {
      if (ticket.CustomerId !== customerId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } else {
      // Regular users must be in the organization
      const [orgMembers] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
        [ticket.OrganizationId, userId]
      );

      if (orgMembers.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Get history
    const [history] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        th.*,
        u.FirstName,
        u.LastName,
        u.Username
      FROM TicketHistory th
      LEFT JOIN Users u ON th.UserId = u.Id
      WHERE th.TicketId = ?
      ORDER BY th.CreatedAt DESC`,
      [id]
    );

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching ticket history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket history' });
  }
});

/**
 * @swagger
 * /api/tickets/migrate-ticket-numbers:
 *   post:
 *     summary: Migrate ticket number format (admin utility)
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully migrated ticket numbers
 *       403:
 *         description: Only admins can migrate ticket numbers
 *       500:
 *         description: Internal server error
 */
// Migrate ticket numbers to new format (admin only)
router.post('/migrate-ticket-numbers', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.user?.isAdmin;

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Only admins can migrate ticket numbers' });
    }

    // Get all tickets with their organization abbreviations
    const [tickets] = await pool.execute<RowDataPacket[]>(`
      SELECT t.Id, t.OrganizationId, o.Abbreviation
      FROM Tickets t
      LEFT JOIN Organizations o ON t.OrganizationId = o.Id
      ORDER BY t.Id
    `);

    let updatedCount = 0;
    
    for (const ticket of tickets) {
      const orgAbbr = ticket.Abbreviation || `ORG${ticket.OrganizationId}`;
      const newTicketNumber = `TKT-${orgAbbr}-${ticket.Id}`;
      
      await pool.execute(
        'UPDATE Tickets SET TicketNumber = ? WHERE Id = ?',
        [newTicketNumber, ticket.Id]
      );
      
      updatedCount++;
    }

    res.json({ 
      success: true, 
      message: `Successfully migrated ${updatedCount} ticket numbers`,
      count: updatedCount
    });
  } catch (error) {
    console.error('Error migrating ticket numbers:', error);
    res.status(500).json({ success: false, message: 'Failed to migrate ticket numbers' });
  }
});

export default router;
