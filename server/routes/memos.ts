import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from '../config/database';
import { sanitizeRichText } from '../utils/sanitize';
import { cachedJson, ENTITY_TTL_SECONDS } from '../utils/cachedJson';
import { cacheKeys } from '../services/cacheKeys';
import { invalidateByEntity } from '../services/cacheInvalidation';
import logger from '../utils/logger';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Memos
 *   description: Memo and note management
 */

/**
 * @swagger
 * /api/memos:
 *   get:
 *     summary: Get all memos
 *     tags: [Memos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter memos by date
 *       - in: query
 *         name: visibility
 *         schema:
 *           type: string
 *           enum: [private, organizations, public]
 *         description: Filter by visibility level
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *         description: Filter by tag name
 *     responses:
 *       200:
 *         description: List of memos
 *       401:
 *         description: Unauthorized
 */
// Get all memos (filtered by visibility and user's organizations)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const payload = await cachedJson(
      cacheKeys.orgMemos(`user-${userId}`),
      ENTITY_TTL_SECONDS,
      async () => {
        logger.info('[Memos] Fetching memos for userId:', userId);

        // Get user's organizations
        const [userOrgs] = await pool.execute<RowDataPacket[]>(
          'SELECT OrganizationId FROM OrganizationMembers WHERE UserId = ?',
          [userId]
        );
        const orgIds = userOrgs.map(o => o.OrganizationId);
        logger.info('[Memos] User organizations:', orgIds);

        // Get memos:
        // - Private: only user's own
        // - Organizations: user's own + memos from users in same organizations
        // - Public: all public memos
        let query = `
          SELECT DISTINCT m.*, 
            u.Username, u.FirstName, u.LastName
          FROM Memos m
          LEFT JOIN Users u ON m.UserId = u.Id
          WHERE 
            (m.Visibility = 'public')
            OR (m.Visibility = 'private' AND m.UserId = ?)
        `;
        const params: any[] = [userId];

        if (orgIds.length > 0) {
          // Build placeholders for IN clause
          const placeholders = orgIds.map(() => '?').join(',');
          query += `
            OR (m.Visibility = 'organizations' AND m.UserId IN (
              SELECT DISTINCT UserId FROM OrganizationMembers WHERE OrganizationId IN (${placeholders})
            ))
          `;
          params.push(...orgIds);
        }

        query += ' ORDER BY m.CreatedAt DESC';

        logger.info('[Memos] Query params:', params);
        const [memos] = await pool.execute<RowDataPacket[]>(query, params);
        logger.info('[Memos] Found memos:', memos.length);

        const memoIds = memos.map((memo) => memo.Id).filter((memoId) => memoId !== null && memoId !== undefined);
        const tagsByMemoId = new Map<number, string[]>();
        const relatedByMemoId = new Map<number, Array<{ Id: number; Title: string; Visibility: string; CreatedAt: string }>>();

        if (memoIds.length > 0) {
          const placeholders = memoIds.map(() => '?').join(',');
          const [tagRows] = await pool.execute<RowDataPacket[]>(
            `SELECT MemoId, TagName
             FROM MemoTags
             WHERE MemoId IN (${placeholders})
             ORDER BY MemoId, TagName`,
            memoIds
          );

          for (const row of tagRows) {
            const memoId = Number(row.MemoId);
            if (!tagsByMemoId.has(memoId)) {
              tagsByMemoId.set(memoId, []);
            }
            tagsByMemoId.get(memoId)?.push(String(row.TagName));
          }
        }

        if (memoIds.length > 0) {
          const memoIdPlaceholders = memoIds.map(() => '?').join(',');
          const relationVisibilityClause = orgIds.length > 0
            ? `(rm.Visibility = 'public' OR (rm.Visibility = 'private' AND rm.UserId = ?) OR (rm.Visibility = 'organizations' AND rm.UserId IN (SELECT DISTINCT UserId FROM OrganizationMembers WHERE OrganizationId IN (${orgIds.map(() => '?').join(',')}))))`
            : `(rm.Visibility = 'public' OR (rm.Visibility = 'private' AND rm.UserId = ?))`;

          const relationSql = `
            SELECT mr.MemoId AS SourceMemoId, rm.Id, rm.Title, rm.Visibility, rm.CreatedAt
            FROM MemoRelations mr
            INNER JOIN Memos rm ON rm.Id = mr.RelatedMemoId
            WHERE mr.MemoId IN (${memoIdPlaceholders})
              AND ${relationVisibilityClause}

            UNION ALL

            SELECT mr.RelatedMemoId AS SourceMemoId, rm.Id, rm.Title, rm.Visibility, rm.CreatedAt
            FROM MemoRelations mr
            INNER JOIN Memos rm ON rm.Id = mr.MemoId
            WHERE mr.RelatedMemoId IN (${memoIdPlaceholders})
              AND ${relationVisibilityClause}
          `;

          const relationParams = [
            ...memoIds,
            userId,
            ...orgIds,
            ...memoIds,
            userId,
            ...orgIds,
          ];

          const [relationRows] = await pool.execute<RowDataPacket[]>(relationSql, relationParams);

          for (const row of relationRows) {
            const sourceMemoId = Number(row.SourceMemoId);
            const relatedMemo = {
              Id: Number(row.Id),
              Title: String(row.Title || ''),
              Visibility: String(row.Visibility || 'private'),
              CreatedAt: String(row.CreatedAt || ''),
            };

            if (!relatedByMemoId.has(sourceMemoId)) {
              relatedByMemoId.set(sourceMemoId, []);
            }

            const existing = relatedByMemoId.get(sourceMemoId) || [];
            if (!existing.some((item) => item.Id === relatedMemo.Id)) {
              existing.push(relatedMemo);
              relatedByMemoId.set(sourceMemoId, existing);
            }
          }
        }

        // Get attachments for each memo
        for (const memo of memos) {
          const [attachments] = await pool.execute<RowDataPacket[]>(
            'SELECT * FROM MemoAttachments WHERE MemoId = ?',
            [memo.Id]
          );
          memo.Attachments = attachments;
          memo.Tags = (tagsByMemoId.get(Number(memo.Id)) || []).join(',');
          memo.RelatedMemos = relatedByMemoId.get(Number(memo.Id)) || [];
        }

        return { success: true, memos };
      }
    );

    res.json(payload);
  } catch (error) {
    logger.error('Error fetching memos:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch memos' });
  }
});

/**
 * @swagger
 * /api/memos/{id}:
 *   get:
 *     summary: Get a single memo
 *     tags: [Memos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Memo ID
 *     responses:
 *       200:
 *         description: Memo object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Memo not found
 */
// Get single memo
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const [memos] = await pool.execute<RowDataPacket[]>(
      `SELECT m.*, 
        u.Username, u.FirstName, u.LastName
      FROM Memos m
      LEFT JOIN Users u ON m.UserId = u.Id
      WHERE m.Id = ?`,
      [id]
    );

    if (memos.length === 0) {
      return res.status(404).json({ success: false, message: 'Memo not found' });
    }

    const memo = memos[0];

    // Check visibility permissions
    if (memo.Visibility === 'private' && memo.UserId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (memo.Visibility === 'organizations') {
      // Check if user is in same organization
      const [userOrgs] = await pool.execute<RowDataPacket[]>(
        'SELECT OrganizationId FROM OrganizationMembers WHERE UserId = ?',
        [userId]
      );
      const [memoUserOrgs] = await pool.execute<RowDataPacket[]>(
        'SELECT OrganizationId FROM OrganizationMembers WHERE UserId = ?',
        [memo.UserId]
      );
      
      const userOrgIds = userOrgs.map(o => o.OrganizationId);
      const memoOrgIds = memoUserOrgs.map(o => o.OrganizationId);
      const hasCommonOrg = userOrgIds.some(id => memoOrgIds.includes(id));

      if (!hasCommonOrg && memo.UserId !== userId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Get attachments
    const [attachments] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM MemoAttachments WHERE MemoId = ?',
      [id]
    );
    const [memoTags] = await pool.execute<RowDataPacket[]>(
      'SELECT TagName FROM MemoTags WHERE MemoId = ? ORDER BY TagName',
      [id]
    );
    memo.Attachments = attachments;
    memo.Tags = memoTags.map((tag) => String(tag.TagName)).join(',');

    const [currentUserOrgs] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM OrganizationMembers WHERE UserId = ?',
      [userId]
    );
    const currentOrgIds = currentUserOrgs.map((org) => Number(org.OrganizationId));

    const relationVisibilityClause = currentOrgIds.length > 0
      ? `(rm.Visibility = 'public' OR (rm.Visibility = 'private' AND rm.UserId = ?) OR (rm.Visibility = 'organizations' AND rm.UserId IN (SELECT DISTINCT UserId FROM OrganizationMembers WHERE OrganizationId IN (${currentOrgIds.map(() => '?').join(',')}))))`
      : `(rm.Visibility = 'public' OR (rm.Visibility = 'private' AND rm.UserId = ?))`;

    const relationSql = `
      SELECT rm.Id, rm.Title, rm.Visibility, rm.CreatedAt
      FROM MemoRelations mr
      INNER JOIN Memos rm ON rm.Id = mr.RelatedMemoId
      WHERE mr.MemoId = ?
        AND ${relationVisibilityClause}

      UNION ALL

      SELECT rm.Id, rm.Title, rm.Visibility, rm.CreatedAt
      FROM MemoRelations mr
      INNER JOIN Memos rm ON rm.Id = mr.MemoId
      WHERE mr.RelatedMemoId = ?
        AND ${relationVisibilityClause}
    `;

    const relationParams = [
      Number(id),
      userId,
      ...currentOrgIds,
      Number(id),
      userId,
      ...currentOrgIds,
    ];
    const [relationRows] = await pool.execute<RowDataPacket[]>(relationSql, relationParams);

    const uniqueRelated = new Map<number, { Id: number; Title: string; Visibility: string; CreatedAt: string }>();
    for (const row of relationRows) {
      const relatedId = Number(row.Id);
      if (!uniqueRelated.has(relatedId)) {
        uniqueRelated.set(relatedId, {
          Id: relatedId,
          Title: String(row.Title || ''),
          Visibility: String(row.Visibility || 'private'),
          CreatedAt: String(row.CreatedAt || ''),
        });
      }
    }
    memo.RelatedMemos = Array.from(uniqueRelated.values());

    res.json({ success: true, memo });
  } catch (error) {
    logger.error('Error fetching memo:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch memo' });
  }
});

/**
 * @swagger
 * /api/memos:
 *   post:
 *     summary: Create a new memo
 *     tags: [Memos]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               visibility:
 *                 type: string
 *                 enum: [private, organizations, public]
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Memo created
 *       401:
 *         description: Unauthorized
 */
// Create new memo
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { title, content, visibility, tags, relatedMemoIds } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    // Create memo
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO Memos (UserId, Title, Content, Visibility) VALUES (?, ?, ?, ?)',
      [userId, title, sanitizeRichText(content) ?? null, visibility || 'private']
    );

    const memoId = result.insertId;

    // Add tags if provided
    if (tags && Array.isArray(tags) && tags.length > 0) {
      for (const tag of tags) {
        if (tag.trim()) {
          await pool.execute(
            'INSERT INTO MemoTags (MemoId, TagName) VALUES (?, ?)',
            [memoId, tag.trim()]
          );
        }
      }
    }

    if (Array.isArray(relatedMemoIds) && relatedMemoIds.length > 0) {
      const normalizedRelatedIds = Array.from(
        new Set(
          relatedMemoIds
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isInteger(value) && value > 0 && value !== memoId)
        )
      );

      if (normalizedRelatedIds.length > 0) {
        const placeholders = normalizedRelatedIds.map(() => '?').join(',');
        const [existingRelated] = await pool.execute<RowDataPacket[]>(
          `SELECT Id FROM Memos WHERE Id IN (${placeholders})`,
          normalizedRelatedIds
        );
        const validRelatedIds = existingRelated.map((row) => Number(row.Id));

        for (const relatedId of validRelatedIds) {
          await pool.execute(
            'INSERT INTO MemoRelations (MemoId, RelatedMemoId) VALUES (?, ?)',
            [memoId, relatedId]
          );
        }
      }
    }

    await invalidateByEntity('memo', { orgId: `user-${userId}` });

    res.json({ success: true, memoId, message: 'Memo created successfully' });
  } catch (error) {
    logger.error('Error creating memo:', error);
    res.status(500).json({ success: false, message: 'Failed to create memo' });
  }
});

/**
 * @swagger
 * /api/memos/{id}:
 *   put:
 *     summary: Update a memo
 *     tags: [Memos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Memo ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               visibility:
 *                 type: string
 *                 enum: [private, organizations, public]
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Memo updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Memo not found
 */
// Update memo
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { title, content, visibility, tags, relatedMemoIds } = req.body;

    // Check if user owns the memo
    const [memos] = await pool.execute<RowDataPacket[]>(
      'SELECT UserId FROM Memos WHERE Id = ?',
      [id]
    );

    if (memos.length === 0) {
      return res.status(404).json({ success: false, message: 'Memo not found' });
    }

    if (memos[0].UserId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Update memo
    await pool.execute(
      'UPDATE Memos SET Title = ?, Content = ?, Visibility = ? WHERE Id = ?',
      [title, sanitizeRichText(content) ?? null, visibility || 'private', id]
    );

    // Update tags - delete old ones and insert new ones
    if (tags !== undefined) {
      await pool.execute('DELETE FROM MemoTags WHERE MemoId = ?', [id]);
      
      if (Array.isArray(tags) && tags.length > 0) {
        for (const tag of tags) {
          if (tag.trim()) {
            await pool.execute(
              'INSERT INTO MemoTags (MemoId, TagName) VALUES (?, ?)',
              [id, tag.trim()]
            );
          }
        }
      }
    }

    // Update relations - replace outgoing relations from this memo
    await pool.execute('DELETE FROM MemoRelations WHERE MemoId = ?', [id]);

    if (Array.isArray(relatedMemoIds) && relatedMemoIds.length > 0) {
      const memoId = Number(id);
      const normalizedRelatedIds = Array.from(
        new Set(
          relatedMemoIds
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isInteger(value) && value > 0 && value !== memoId)
        )
      );

      if (normalizedRelatedIds.length > 0) {
        const placeholders = normalizedRelatedIds.map(() => '?').join(',');
        const [existingRelated] = await pool.execute<RowDataPacket[]>(
          `SELECT Id FROM Memos WHERE Id IN (${placeholders})`,
          normalizedRelatedIds
        );
        const validRelatedIds = existingRelated.map((row) => Number(row.Id));

        for (const relatedId of validRelatedIds) {
          await pool.execute(
            'INSERT INTO MemoRelations (MemoId, RelatedMemoId) VALUES (?, ?)',
            [id, relatedId]
          );
        }
      }
    }

    await invalidateByEntity('memo', { orgId: `user-${userId}` });

    res.json({ success: true, message: 'Memo updated successfully' });
  } catch (error) {
    logger.error('Error updating memo:', error);
    res.status(500).json({ success: false, message: 'Failed to update memo' });
  }
});

/**
 * @swagger
 * /api/memos/{id}:
 *   delete:
 *     summary: Delete a memo
 *     tags: [Memos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Memo ID
 *     responses:
 *       200:
 *         description: Memo deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Memo not found
 */
// Delete memo
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    // Check if user owns the memo
    const [memos] = await pool.execute<RowDataPacket[]>(
      'SELECT UserId FROM Memos WHERE Id = ?',
      [id]
    );

    if (memos.length === 0) {
      return res.status(404).json({ success: false, message: 'Memo not found' });
    }

    if (memos[0].UserId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Delete tags
    await pool.execute('DELETE FROM MemoTags WHERE MemoId = ?', [id]);

    // Delete memo relations (both directions)
    await pool.execute('DELETE FROM MemoRelations WHERE MemoId = ? OR RelatedMemoId = ?', [id, id]);
    
    // Delete attachments records (files should be cleaned up separately)
    await pool.execute('DELETE FROM MemoAttachments WHERE MemoId = ?', [id]);
    
    // Delete memo
    await pool.execute('DELETE FROM Memos WHERE Id = ?', [id]);

    await invalidateByEntity('memo', { orgId: `user-${userId}` });

    res.json({ success: true, message: 'Memo deleted successfully' });
  } catch (error) {
    logger.error('Error deleting memo:', error);
    res.status(500).json({ success: false, message: 'Failed to delete memo' });
  }
});

/**
 * @swagger
 * /api/memos/tags:
 *   get:
 *     summary: Get all distinct tags used in memos
 *     tags: [Memos]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of distinct memo tags
 *       401:
 *         description: Unauthorized
 */
// Get all unique tags
router.get('/tags', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const [tags] = await pool.execute<RowDataPacket[]>(
      'SELECT DISTINCT TagName, COUNT(*) as count FROM MemoTags GROUP BY TagName ORDER BY count DESC, TagName'
    );

    res.json({ success: true, tags });
  } catch (error) {
    logger.error('Error fetching tags:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tags' });
  }
});

export default router;
