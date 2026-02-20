import { Router, Response } from 'express';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: ChangeHistory
 *   description: Entity change history tracking
 */

/**
 * @swagger
 * /api/change-history/organization/{id}:
 *   get:
 *     summary: Get change history for an organization
 *     tags: [ChangeHistory]
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
 *         description: Organization change history
 *       403:
 *         description: Access denied
 */
// Get organization history
router.get('/organization/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Verify user has access to this organization
    const [access] = await pool.execute<RowDataPacket[]>(
      'SELECT Id FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [id, userId]
    );

    if (access.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [history] = await pool.execute<RowDataPacket[]>(
      `SELECT oh.*, u.Username as ChangedByUsername
       FROM OrganizationHistory oh
       LEFT JOIN Users u ON oh.ChangedBy = u.Id
       WHERE oh.OrganizationId = ?
       ORDER BY oh.CreatedAt DESC`,
      [id]
    );

    res.json({ success: true, history });
  } catch (error) {
    console.error('Error fetching organization history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
});

/**
 * @swagger
 * /api/change-history/customer/{id}:
 *   get:
 *     summary: Get change history for a customer
 *     tags: [ChangeHistory]
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
 *         description: Customer change history
 *       403:
 *         description: Access denied
 */
// Get customer history
router.get('/customer/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Verify user has access to this customer
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT c.Id
       FROM Customers c
       INNER JOIN CustomerOrganizations co ON c.Id = co.CustomerId
       INNER JOIN OrganizationMembers om ON co.OrganizationId = om.OrganizationId
       WHERE om.UserId = ? AND c.Id = ?`,
      [userId, id]
    );

    if (access.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [history] = await pool.execute<RowDataPacket[]>(
      `SELECT ch.*, u.Username as ChangedByUsername
       FROM CustomerHistory ch
       LEFT JOIN Users u ON ch.ChangedBy = u.Id
       WHERE ch.CustomerId = ?
       ORDER BY ch.CreatedAt DESC`,
      [id]
    );

    res.json({ success: true, history });
  } catch (error) {
    console.error('Error fetching customer history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
});

/**
 * @swagger
 * /api/change-history/project/{id}:
 *   get:
 *     summary: Get change history for a project
 *     tags: [ChangeHistory]
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
 *         description: Project change history
 *       403:
 *         description: Access denied
 */
// Get project history
router.get('/project/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Verify user has access to this project
    const [access] = await pool.execute<RowDataPacket[]>(
      `SELECT p.Id
       FROM Projects p
       INNER JOIN OrganizationMembers om ON p.OrganizationId = om.OrganizationId
       WHERE om.UserId = ? AND p.Id = ?`,
      [userId, id]
    );

    if (access.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [history] = await pool.execute<RowDataPacket[]>(
      `SELECT ph.*, u.Username as ChangedByUsername
       FROM ProjectHistory ph
       LEFT JOIN Users u ON ph.ChangedBy = u.Id
       WHERE ph.ProjectId = ?
       ORDER BY ph.CreatedAt DESC`,
      [id]
    );

    res.json({ success: true, history });
  } catch (error) {
    console.error('Error fetching project history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
});

/**
 * @swagger
 * /api/change-history/user/{id}:
 *   get:
 *     summary: Get change history for a user
 *     tags: [ChangeHistory]
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
 *         description: User change history
 *       403:
 *         description: Admin access required or own profile
 */
// Get user history (admin only)
router.get('/user/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user?.userId;

    // Check if current user is admin or requesting their own history
    const [currentUser] = await pool.execute<RowDataPacket[]>(
      'SELECT IsAdmin FROM Users WHERE Id = ?',
      [currentUserId]
    );

    if (currentUser.length === 0 || (!currentUser[0].IsAdmin && currentUserId?.toString() !== id)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [history] = await pool.execute<RowDataPacket[]>(
      `SELECT uh.*, u.Username as ChangedByUsername
       FROM UserHistory uh
       LEFT JOIN Users u ON uh.ChangedBy = u.Id
       WHERE uh.UserId = ?
       ORDER BY uh.CreatedAt DESC`,
      [id]
    );

    res.json({ success: true, history });
  } catch (error) {
    console.error('Error fetching user history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
});

export default router;
