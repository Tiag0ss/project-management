import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { sanitizeRichText } from '../utils/sanitize';

const router = express.Router();

// Get all memos (filtered by visibility and user's organizations)
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    console.log('[Memos] Fetching memos for userId:', userId);

    // Get user's organizations
    const [userOrgs] = await pool.execute<RowDataPacket[]>(
      'SELECT OrganizationId FROM OrganizationMembers WHERE UserId = ?',
      [userId]
    );
    const orgIds = userOrgs.map(o => o.OrganizationId);
    console.log('[Memos] User organizations:', orgIds);

    // Get memos:
    // - Private: only user's own
    // - Organizations: user's own + memos from users in same organizations
    // - Public: all public memos
    let query = `
      SELECT DISTINCT m.*, 
        u.Username, u.FirstName, u.LastName,
        (SELECT GROUP_CONCAT(TagName SEPARATOR ',') FROM MemoTags WHERE MemoId = m.Id) as Tags
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

    console.log('[Memos] Query params:', params);
    const [memos] = await pool.execute<RowDataPacket[]>(query, params);
    console.log('[Memos] Found memos:', memos.length);

    // Get attachments for each memo
    for (const memo of memos) {
      const [attachments] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM MemoAttachments WHERE MemoId = ?',
        [memo.Id]
      );
      memo.Attachments = attachments;
    }

    res.json({ success: true, memos });
  } catch (error) {
    console.error('Error fetching memos:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch memos' });
  }
});

// Get single memo
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const [memos] = await pool.execute<RowDataPacket[]>(
      `SELECT m.*, 
        u.Username, u.FirstName, u.LastName,
        (SELECT GROUP_CONCAT(TagName SEPARATOR ',') FROM MemoTags WHERE MemoId = m.Id) as Tags
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
    memo.Attachments = attachments;

    res.json({ success: true, memo });
  } catch (error) {
    console.error('Error fetching memo:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch memo' });
  }
});

// Create new memo
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { title, content, visibility, tags } = req.body;

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

    res.json({ success: true, memoId, message: 'Memo created successfully' });
  } catch (error) {
    console.error('Error creating memo:', error);
    res.status(500).json({ success: false, message: 'Failed to create memo' });
  }
});

// Update memo
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { title, content, visibility, tags } = req.body;

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

    res.json({ success: true, message: 'Memo updated successfully' });
  } catch (error) {
    console.error('Error updating memo:', error);
    res.status(500).json({ success: false, message: 'Failed to update memo' });
  }
});

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
    
    // Delete attachments records (files should be cleaned up separately)
    await pool.execute('DELETE FROM MemoAttachments WHERE MemoId = ?', [id]);
    
    // Delete memo
    await pool.execute('DELETE FROM Memos WHERE Id = ?', [id]);

    res.json({ success: true, message: 'Memo deleted successfully' });
  } catch (error) {
    console.error('Error deleting memo:', error);
    res.status(500).json({ success: false, message: 'Failed to delete memo' });
  }
});

// Get all unique tags
router.get('/tags', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const [tags] = await pool.execute<RowDataPacket[]>(
      'SELECT DISTINCT TagName, COUNT(*) as count FROM MemoTags GROUP BY TagName ORDER BY count DESC, TagName'
    );

    res.json({ success: true, tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tags' });
  }
});

export default router;
