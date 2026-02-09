import { Router, Response } from 'express';
import { pool } from '../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

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

// Get attachments for an organization
router.get('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;

    // Check if user is in organization
    const [orgMembers] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );

    if (orgMembers.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Get attachments (without FileData for listing)
    const [attachments] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        oa.Id, oa.OrganizationId, oa.UploadedByUserId, oa.FileName, oa.FileType, oa.FileSize, oa.CreatedAt,
        u.FirstName, u.LastName, u.Username
      FROM OrganizationAttachments oa
      LEFT JOIN Users u ON oa.UploadedByUserId = u.Id
      WHERE oa.OrganizationId = ?
      ORDER BY oa.CreatedAt DESC`,
      [organizationId]
    );

    res.json({ success: true, data: attachments });
  } catch (error) {
    console.error('Error fetching organization attachments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attachments' });
  }
});

// Get single attachment with data
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    // Get attachment
    const [attachments] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationAttachments WHERE Id = ?',
      [id]
    );

    if (attachments.length === 0) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const attachment = attachments[0];

    // Check access
    const [orgMembers] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [attachment.OrganizationId, userId]
    );

    if (orgMembers.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: attachment });
  } catch (error) {
    console.error('Error fetching attachment:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attachment' });
  }
});

// Upload attachment
router.post('/organization/:organizationId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { organizationId } = req.params;
    const userId = req.user?.userId;
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

    // Check access
    const [orgMembers] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [organizationId, userId]
    );

    if (orgMembers.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Insert attachment
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO OrganizationAttachments (OrganizationId, UploadedByUserId, FileName, FileType, FileSize, FileData)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [organizationId, userId, fileName, fileType, fileSize, fileData]
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
      'SELECT * FROM OrganizationAttachments WHERE Id = ?',
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

    await pool.execute('DELETE FROM OrganizationAttachments WHERE Id = ?', [id]);

    res.json({ success: true, message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ success: false, message: 'Failed to delete attachment' });
  }
});

export default router;
