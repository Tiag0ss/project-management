import { Router, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

// Helper: SHA-256 hash
const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

// Helper: generate a new API token
const generateToken = (): { raw: string; prefix: string; hash: string } => {
  const raw = crypto.randomBytes(32).toString('hex');
  const full = `pt_${raw}`;
  return {
    raw: full,
    prefix: `pt_${raw.substring(0, 8)}`,
    hash: hashToken(full),
  };
};

/**
 * GET /api/api-tokens
 * Returns all tokens for the authenticated user (admins see all).
 */
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const isAdmin = req.user!.isAdmin;

    const query = isAdmin
      ? `SELECT t.Id, t.UserId, u.Username, u.Email, t.TokenName, t.TokenPrefix,
               t.IsActive, t.LastUsedAt, t.ExpiresAt, t.CreatedAt
         FROM ApiTokens t
         LEFT JOIN Users u ON t.UserId = u.Id
         ORDER BY t.CreatedAt DESC`
      : `SELECT Id, UserId, TokenName, TokenPrefix, IsActive, LastUsedAt, ExpiresAt, CreatedAt
         FROM ApiTokens WHERE UserId = ? ORDER BY CreatedAt DESC`;

    const params = isAdmin ? [] : [userId];
    const [tokens] = await pool.execute<RowDataPacket[]>(query, params);

    res.json({ success: true, tokens });
  } catch (error) {
    logger.error('Error fetching API tokens:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch API tokens' });
  }
});

/**
 * POST /api/api-tokens
 * Create a new API token for the authenticated user.
 * Body: { tokenName: string, expiresAt?: string | null }
 */
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { tokenName, expiresAt } = req.body;

    if (!tokenName || !tokenName.trim()) {
      return res.status(400).json({ success: false, message: 'Token name is required' });
    }

    const { raw, prefix, hash } = generateToken();
    const expiresAtValue = expiresAt ? new Date(expiresAt) : null;

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ApiTokens (UserId, TokenName, TokenHash, TokenPrefix, IsActive, ExpiresAt)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [userId, tokenName.trim(), hash, prefix, expiresAtValue]
    );

    logger.info(`API token created by user ${userId}: ${tokenName}`);

    res.status(201).json({
      success: true,
      token: {
        id: result.insertId,
        tokenName: tokenName.trim(),
        tokenPrefix: prefix,
        rawToken: raw, // ONLY returned once at creation
        expiresAt: expiresAtValue,
        createdAt: new Date(),
      },
      message: 'API token created. Save it now — it will not be shown again.',
    });
  } catch (error) {
    logger.error('Error creating API token:', error);
    res.status(500).json({ success: false, message: 'Failed to create API token' });
  }
});

/**
 * PATCH /api/api-tokens/:id/deactivate
 * Deactivate (revoke) a token. Admins can revoke any token; users only their own.
 */
router.patch('/:id/deactivate', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const isAdmin = req.user!.isAdmin;
    const tokenId = parseInt(String(req.params.id), 10);

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, UserId FROM ApiTokens WHERE Id = ?',
      [tokenId]
    );

    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Token not found' });
    }

    if (!isAdmin && existing[0].UserId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await pool.execute('UPDATE ApiTokens SET IsActive = 0 WHERE Id = ?', [tokenId]);

    res.json({ success: true, message: 'Token revoked successfully' });
  } catch (error) {
    logger.error('Error revoking API token:', error);
    res.status(500).json({ success: false, message: 'Failed to revoke token' });
  }
});

/**
 * DELETE /api/api-tokens/:id
 * Permanently delete a token. Admins can delete any; users only their own.
 */
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const isAdmin = req.user!.isAdmin;
    const tokenId = parseInt(String(req.params.id), 10);

    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, UserId FROM ApiTokens WHERE Id = ?',
      [tokenId]
    );

    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Token not found' });
    }

    if (!isAdmin && existing[0].UserId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await pool.execute('DELETE FROM ApiTokens WHERE Id = ?', [tokenId]);

    res.json({ success: true, message: 'Token deleted successfully' });
  } catch (error) {
    logger.error('Error deleting API token:', error);
    res.status(500).json({ success: false, message: 'Failed to delete token' });
  }
});

export default router;
