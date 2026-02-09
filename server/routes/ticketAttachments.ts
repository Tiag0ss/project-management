import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Allowed file types
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Get attachments for a ticket
router.get('/ticket/:ticketId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;

    // Verify access to ticket
    const [tickets] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Tickets WHERE Id = ?',
      [ticketId]
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
      const [orgMembers] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
        [ticket.OrganizationId, userId]
      );

      if (orgMembers.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Get attachments (without FileData for listing)
    const [attachments] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        ta.Id, ta.TicketId, ta.CommentId, ta.UploadedByUserId, ta.FileName, ta.FileType, ta.FileSize, ta.CreatedAt,
        u.FirstName, u.LastName, u.Username
      FROM TicketAttachments ta
      LEFT JOIN Users u ON ta.UploadedByUserId = u.Id
      WHERE ta.TicketId = ? AND ta.CommentId IS NULL
      ORDER BY ta.CreatedAt DESC`,
      [ticketId]
    );

    res.json({ success: true, data: attachments });
  } catch (error) {
    console.error('Error fetching ticket attachments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attachments' });
  }
});

// Get single attachment with data
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;

    // Get attachment
    const [attachments] = await pool.execute<RowDataPacket[]>(
      `SELECT ta.*, t.CustomerId, t.OrganizationId
      FROM TicketAttachments ta
      JOIN Tickets t ON ta.TicketId = t.Id
      WHERE ta.Id = ?`,
      [id]
    );

    if (attachments.length === 0) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const attachment = attachments[0];

    // Check access
    if (customerId) {
      if (attachment.CustomerId !== customerId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } else {
      const [orgMembers] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
        [attachment.OrganizationId, userId]
      );

      if (orgMembers.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    res.json({ success: true, data: attachment });
  } catch (error) {
    console.error('Error fetching attachment:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attachment' });
  }
});

// Upload attachment
router.post('/ticket/:ticketId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;
    const { fileName, fileType, fileSize, fileData } = req.body;

    if (!fileName || !fileType || !fileSize || !fileData) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(fileType)) {
      return res.status(400).json({ success: false, message: 'File type not allowed' });
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      return res.status(400).json({ success: false, message: 'File size exceeds 10MB limit' });
    }

    // Verify access to ticket
    const [tickets] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Tickets WHERE Id = ?',
      [ticketId]
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
      const [orgMembers] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
        [ticket.OrganizationId, userId]
      );

      if (orgMembers.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Insert attachment
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO TicketAttachments (TicketId, CommentId, UploadedByUserId, FileName, FileType, FileSize, FileData)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ticketId, null, userId, fileName, fileType, fileSize, fileData]
    );

    res.json({ success: true, attachmentId: result.insertId });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ success: false, message: 'Failed to upload attachment' });
  }
});

// Delete attachment
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const isAdmin = req.user?.isAdmin;

    // Get attachment
    const [attachments] = await pool.execute<RowDataPacket[]>(
      `SELECT ta.*, t.OrganizationId
      FROM TicketAttachments ta
      JOIN Tickets t ON ta.TicketId = t.Id
      WHERE ta.Id = ?`,
      [id]
    );

    if (attachments.length === 0) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const attachment = attachments[0];

    // Only uploader or admin can delete
    if (!isAdmin && attachment.UploadedByUserId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    await pool.execute('DELETE FROM TicketAttachments WHERE Id = ?', [id]);

    res.json({ success: true, message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ success: false, message: 'Failed to delete attachment' });
  }
});

// Get attachments for a comment
router.get('/comment/:commentId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { commentId } = req.params;
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;

    // Get comment and ticket info
    const [comments] = await pool.execute<RowDataPacket[]>(
      `SELECT tc.*, t.CustomerId, t.OrganizationId
       FROM TicketComments tc
       JOIN Tickets t ON tc.TicketId = t.Id
       WHERE tc.Id = ?`,
      [commentId]
    );

    if (comments.length === 0) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const comment = comments[0];

    // Check access
    if (customerId) {
      if (comment.CustomerId !== customerId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } else {
      const [orgMembers] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
        [comment.OrganizationId, userId]
      );

      if (orgMembers.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Get attachments
    const [attachments] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        ta.Id, ta.TicketId, ta.CommentId, ta.UploadedByUserId, ta.FileName, ta.FileType, ta.FileSize, ta.CreatedAt,
        u.FirstName, u.LastName, u.Username
      FROM TicketAttachments ta
      LEFT JOIN Users u ON ta.UploadedByUserId = u.Id
      WHERE ta.CommentId = ?
      ORDER BY ta.CreatedAt DESC`,
      [commentId]
    );

    res.json({ success: true, data: attachments });
  } catch (error) {
    console.error('Error fetching comment attachments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attachments' });
  }
});

// Upload attachment to comment
router.post('/comment/:commentId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { commentId } = req.params;
    const userId = req.user?.userId;
    const customerId = req.user?.customerId;
    const { fileName, fileType, fileSize, fileData } = req.body;

    if (!fileName || !fileType || !fileSize || !fileData) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(fileType)) {
      return res.status(400).json({ success: false, message: 'File type not allowed' });
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      return res.status(400).json({ success: false, message: 'File size exceeds 10MB limit' });
    }

    // Get comment and ticket info
    const [comments] = await pool.execute<RowDataPacket[]>(
      `SELECT tc.*, t.CustomerId, t.OrganizationId
       FROM TicketComments tc
       JOIN Tickets t ON tc.TicketId = t.Id
       WHERE tc.Id = ?`,
      [commentId]
    );

    if (comments.length === 0) {
      return res.status(404).json({ success: false, message: 'Comment not found' });
    }

    const comment = comments[0];

    // Check access
    if (customerId) {
      if (comment.CustomerId !== customerId) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    } else {
      const [orgMembers] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
        [comment.OrganizationId, userId]
      );

      if (orgMembers.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Insert attachment
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO TicketAttachments (TicketId, CommentId, UploadedByUserId, FileName, FileType, FileSize, FileData)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [comment.TicketId, commentId, userId, fileName, fileType, fileSize, fileData]
    );

    res.json({ success: true, attachmentId: result.insertId });
  } catch (error) {
    console.error('Error uploading comment attachment:', error);
    res.status(500).json({ success: false, message: 'Failed to upload attachment' });
  }
});

export default router;

