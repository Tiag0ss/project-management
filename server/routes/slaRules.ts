import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: SLARules
 *   description: SLA rule management for ticket response/resolution time tracking
 */

/**
 * @swagger
 * /api/sla-rules/organization/{organizationId}:
 *   get:
 *     summary: Get SLA rules for an organization
 *     tags: [SLARules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: List of SLA rules with priority info
 */
router.get('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const [rules] = await pool.execute<RowDataPacket[]>(
      `SELECT sr.*, tpv.PriorityName, tpv.Color as PriorityColor
       FROM SLARules sr
       LEFT JOIN TicketPriorityValues tpv ON sr.PriorityId = tpv.Id
       WHERE sr.OrganizationId = ?
       ORDER BY sr.IsActive DESC, sr.Id ASC`,
      [organizationId]
    );
    res.json({ success: true, rules });
  } catch (error) {
    console.error('Error fetching SLA rules:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch SLA rules' });
  }
});

/**
 * @swagger
 * /api/sla-rules/ticket/{ticketId}/status:
 *   get:
 *     summary: Get SLA status for a specific ticket
 *     tags: [SLARules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: SLA status with breach info for first response and resolution
 */
router.get('/ticket/:ticketId/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { ticketId } = req.params;

    const [tickets] = await pool.execute<RowDataPacket[]>(
      `SELECT t.*, tpv.Value as PriorityName,
              TIMESTAMPDIFF(MINUTE, t.CreatedAt, NOW()) as AgeMinutes,
              TIMESTAMPDIFF(MINUTE, t.CreatedAt, COALESCE(t.FirstResponseAt, NOW())) as ResponseMinutes,
              TIMESTAMPDIFF(MINUTE, t.CreatedAt, COALESCE(t.ResolvedAt, NOW())) as ResolutionMinutes,
              tsv.StatusType
       FROM Tickets t
       LEFT JOIN TicketPriorityValues tpv ON t.PriorityId = tpv.Id
       LEFT JOIN TicketStatusValues tsv ON t.StatusId = tsv.Id
       WHERE t.Id = ?`,
      [ticketId]
    );

    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = tickets[0];

    // Find applicable SLA rule (by priority first, then catch-all)
    const [rules] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM SLARules
       WHERE OrganizationId = ? AND IsActive = 1
         AND (PriorityId = ? OR PriorityId IS NULL)
       ORDER BY PriorityId DESC
       LIMIT 1`,
      [ticket.OrganizationId, ticket.PriorityId]
    );

    if (rules.length === 0) {
      return res.json({ success: true, sla: null, message: 'No SLA rule configured for this ticket' });
    }

    const rule = rules[0];
    const isResolved = ['resolved', 'closed'].includes(ticket.StatusType ?? '');
    const hasFirstResponse = !!ticket.FirstResponseAt;

    const firstResponseBreachMinutes = rule.FirstResponseHours ? rule.FirstResponseHours * 60 : null;
    const resolutionBreachMinutes = rule.ResolutionHours ? rule.ResolutionHours * 60 : null;

    // Calculate statuses
    const responseStatus = firstResponseBreachMinutes
      ? hasFirstResponse
        ? ticket.ResponseMinutes <= firstResponseBreachMinutes ? 'met' : 'breached'
        : ticket.AgeMinutes > firstResponseBreachMinutes
          ? 'breached'
          : ticket.AgeMinutes > firstResponseBreachMinutes * 0.75
            ? 'warning'
            : 'ok'
      : null;

    const resolutionStatus = resolutionBreachMinutes
      ? isResolved
        ? ticket.ResolutionMinutes <= resolutionBreachMinutes ? 'met' : 'breached'
        : ticket.AgeMinutes > resolutionBreachMinutes
          ? 'breached'
          : ticket.AgeMinutes > resolutionBreachMinutes * 0.75
            ? 'warning'
            : 'ok'
      : null;

    res.json({
      success: true,
      sla: {
        rule,
        firstResponse: {
          status: responseStatus,
          hasResponse: hasFirstResponse,
          responseAt: ticket.FirstResponseAt,
          ageMinutes: ticket.AgeMinutes,
          limitMinutes: firstResponseBreachMinutes,
        },
        resolution: {
          status: resolutionStatus,
          isResolved,
          resolvedAt: ticket.ResolvedAt,
          ageMinutes: ticket.AgeMinutes,
          limitMinutes: resolutionBreachMinutes,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching SLA status:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch SLA status' });
  }
});

/**
 * @swagger
 * /api/sla-rules:
 *   post:
 *     summary: Create a new SLA rule
 *     tags: [SLARules]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, name]
 *             properties:
 *               organizationId: { type: integer }
 *               name: { type: string }
 *               priorityId: { type: integer }
 *               firstResponseHours: { type: number }
 *               resolutionHours: { type: number }
 *               isActive: { type: boolean }
 *     responses:
 *       201:
 *         description: SLA rule created
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId, name, priorityId, firstResponseHours, resolutionHours, isActive = true } = req.body;
    if (!organizationId || !name) {
      return res.status(400).json({ success: false, message: 'organizationId and name are required' });
    }
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO SLARules (OrganizationId, Name, PriorityId, FirstResponseHours, ResolutionHours, IsActive)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [organizationId, name, priorityId || null, firstResponseHours || null, resolutionHours || null, isActive ? 1 : 0]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Error creating SLA rule:', error);
    res.status(500).json({ success: false, message: 'Failed to create SLA rule' });
  }
});

/**
 * @swagger
 * /api/sla-rules/{id}:
 *   put:
 *     summary: Update an SLA rule
 *     tags: [SLARules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: SLA rule updated
 */
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, priorityId, firstResponseHours, resolutionHours, isActive } = req.body;
    await pool.execute(
      `UPDATE SLARules SET Name = ?, PriorityId = ?, FirstResponseHours = ?, ResolutionHours = ?, IsActive = ?
       WHERE Id = ?`,
      [name, priorityId || null, firstResponseHours || null, resolutionHours || null, isActive ? 1 : 0, id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating SLA rule:', error);
    res.status(500).json({ success: false, message: 'Failed to update SLA rule' });
  }
});

/**
 * @swagger
 * /api/sla-rules/{id}:
 *   delete:
 *     summary: Delete an SLA rule
 *     tags: [SLARules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: SLA rule deleted
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM SLARules WHERE Id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting SLA rule:', error);
    res.status(500).json({ success: false, message: 'Failed to delete SLA rule' });
  }
});

export default router;
