import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

/**
 * GET /api/portal/overview
 * Customer portal overview — returns customer info, ticket stats,
 * recent tickets, and linked projects. Only for customer users.
 */
router.get('/overview', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const customerId = req.user?.customerId;
    if (!customerId) {
      return res.status(403).json({ success: false, message: 'Access denied: not a customer user' });
    }

    // Customer info
    const [customers] = await pool.execute<RowDataPacket[]>(
      `SELECT Id, Name, Email, Phone, Address, Website, ContactPerson, ContactEmail, ContactPhone
       FROM Customers WHERE Id = ? AND IsActive = 1`,
      [customerId]
    );
    if (customers.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    const customer = customers[0];

    // Ticket stats
    const [statsRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN COALESCE(tsv.IsClosed, 0) = 0 THEN 1 ELSE 0 END) as open,
         SUM(CASE WHEN COALESCE(tsv.IsClosed, 0) = 1 THEN 1 ELSE 0 END) as closed,
         SUM(CASE WHEN COALESCE(tsv.StatusType, '') = 'in_progress' THEN 1 ELSE 0 END) as inProgress,
         SUM(CASE WHEN tpv.PriorityName IN ('Urgent', 'Critical') OR tpv.SortOrder = (SELECT MIN(SortOrder) FROM TicketPriorityValues WHERE OrganizationId = t.OrganizationId) THEN 1 ELSE 0 END) as urgent
       FROM Tickets t
       LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
       LEFT JOIN TicketPriorityValues tpv ON t.PriorityId = tpv.Id
       WHERE t.CustomerId = ?`,
      [customerId]
    );
    const stats = statsRows[0] || { total: 0, open: 0, closed: 0, inProgress: 0, urgent: 0 };

    // Recent tickets (last 20)
    const [tickets] = await pool.execute<RowDataPacket[]>(
      `SELECT t.Id, t.Title, t.Category, t.CreatedAt, t.UpdatedAt,
              tsv.StatusName, tsv.Color as StatusColor, COALESCE(tsv.IsClosed, 0) as IsClosed,
              tpv.PriorityName, tpv.Color as PriorityColor,
              p.ProjectName,
              u.Username as AssigneeName, u.FirstName as AssigneeFirst, u.LastName as AssigneeLast
       FROM Tickets t
       LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
       LEFT JOIN TicketPriorityValues tpv ON t.PriorityId = tpv.Id
       LEFT JOIN Projects p ON t.ProjectId = p.Id
       LEFT JOIN Users u ON t.AssignedToUserId = u.Id
       WHERE t.CustomerId = ?
       ORDER BY t.UpdatedAt DESC
       LIMIT 20`,
      [customerId]
    );

    // Projects linked to this customer
    const [projects] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id, p.ProjectName, p.Description, p.Status, p.StartDate, p.EndDate,
              psv.StatusName as StatusLabel, psv.ColorCode as StatusColor,
              o.Name as OrganizationName,
              COUNT(DISTINCT t.Id) as TotalTasks,
              SUM(CASE WHEN COALESCE(tsv.IsClosed, 0) = 1 THEN 1 ELSE 0 END) as CompletedTasks
       FROM Projects p
       LEFT JOIN ProjectStatusValues psv ON p.Status = psv.Id
       LEFT JOIN Organizations o ON p.OrganizationId = o.Id
       LEFT JOIN Tasks t ON t.ProjectId = p.Id
       LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
       WHERE p.CustomerId = ? AND p.IsVisibleToCustomer = 1
       GROUP BY p.Id
       ORDER BY p.UpdatedAt DESC`,
      [customerId]
    );

    res.json({
      success: true,
      customer,
      stats,
      tickets,
      projects,
    });
  } catch (error) {
    console.error('Portal overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to load portal data' });
  }
});

/**
 * POST /api/portal/tickets
 * Create a ticket as a customer user.
 */
router.post('/tickets', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const customerId = req.user?.customerId;
    const userId = req.user?.userId;
    if (!customerId) {
      return res.status(403).json({ success: false, message: 'Access denied: not a customer user' });
    }

    const { title, description, category, priorityId, projectId } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    // Resolve organizationId from projectId or customer's first org
    let organizationId: number | null = null;
    if (projectId) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT OrganizationId FROM Projects WHERE Id = ? AND CustomerId = ?`,
        [projectId, customerId]
      );
      if (rows.length > 0) organizationId = rows[0].OrganizationId;
    }
    if (!organizationId) {
      const [orgRows] = await pool.execute<RowDataPacket[]>(
        `SELECT OrganizationId FROM CustomerOrganizations WHERE CustomerId = ? LIMIT 1`,
        [customerId]
      );
      if (orgRows.length > 0) organizationId = orgRows[0].OrganizationId;
    }
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'Unable to determine organization' });
    }

    // Get default status
    const [defaultStatus] = await pool.execute<RowDataPacket[]>(
      `SELECT Id FROM TicketStatusValues WHERE OrganizationId = ? AND IsDefault = 1 LIMIT 1`,
      [organizationId]
    );
    const statusId = defaultStatus.length > 0 ? defaultStatus[0].Id : null;

    // Get default priority if not provided
    let resolvedPriorityId = priorityId || null;
    if (!resolvedPriorityId) {
      const [defPri] = await pool.execute<RowDataPacket[]>(
        `SELECT Id FROM TicketPriorityValues WHERE OrganizationId = ? AND IsDefault = 1 LIMIT 1`,
        [organizationId]
      );
      if (defPri.length > 0) resolvedPriorityId = defPri[0].Id;
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Tickets (OrganizationId, ProjectId, Title, Description, Category, StatusId, PriorityId, CustomerId, CreatedBy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [organizationId, projectId || null, title.trim(), description || null, category || 'Support', statusId, resolvedPriorityId, customerId, userId]
    );

    res.status(201).json({ success: true, ticketId: result.insertId, message: 'Ticket created successfully' });
  } catch (error) {
    console.error('Portal create ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to create ticket' });
  }
});

export default router;
