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

// Get attachments for a project
router.get('/project/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId;

    // Verify access to project
    const [projects] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Projects WHERE Id = ?',
      [projectId]
    );

    if (projects.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const project = projects[0];

    // Check if user is in organization
    const [orgMembers] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [project.OrganizationId, userId]
    );

    if (orgMembers.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Get attachments (without FileData for listing)
    const [attachments] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        pa.Id, pa.ProjectId, pa.UploadedByUserId, pa.FileName, pa.FileType, pa.FileSize, pa.CreatedAt,
        u.FirstName, u.LastName, u.Username
      FROM ProjectAttachments pa
      LEFT JOIN Users u ON pa.UploadedByUserId = u.Id
      WHERE pa.ProjectId = ?
      ORDER BY pa.CreatedAt DESC`,
      [projectId]
    );

    res.json({ success: true, data: attachments });
  } catch (error) {
    console.error('Error fetching project attachments:', error);
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
      `SELECT pa.*, p.OrganizationId
      FROM ProjectAttachments pa
      JOIN Projects p ON pa.ProjectId = p.Id
      WHERE pa.Id = ?`,
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
router.post('/project/:projectId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
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

    // Verify access to project
    const [projects] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Projects WHERE Id = ?',
      [projectId]
    );

    if (projects.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const project = projects[0];

    // Check access
    const [orgMembers] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
      [project.OrganizationId, userId]
    );

    if (orgMembers.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Insert attachment
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ProjectAttachments (ProjectId, UploadedByUserId, FileName, FileType, FileSize, FileData)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [projectId, userId, fileName, fileType, fileSize, fileData]
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
      'SELECT * FROM ProjectAttachments WHERE Id = ?',
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

    await pool.execute('DELETE FROM ProjectAttachments WHERE Id = ?', [id]);

    res.json({ success: true, message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ success: false, message: 'Failed to delete attachment' });
  }
});

export default router;
