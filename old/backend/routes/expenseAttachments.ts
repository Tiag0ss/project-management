import { Router, Response } from 'express';
import { pool, RowDataPacket, ResultSetHeader } from '../../config/database';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import { invalidateByEntity } from '../../services/cacheInvalidation';
import logger from '../../utils/logger';

const router = Router();

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const isExpensesEnabled = async (): Promise<boolean> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT SettingValue FROM SystemSettings WHERE SettingKey = ?',
    ['expensesEnabled']
  );
  if (rows.length === 0) return false;
  return rows[0].SettingValue === 'true';
};

router.use(authenticateToken, async (_req: AuthRequest, res: Response, next) => {
  try {
    const enabled = await isExpensesEnabled();
    if (!enabled) {
      return res.status(403).json({ success: false, message: 'Expenses module is disabled' });
    }
    next();
  } catch (error) {
    logger.error('Expense attachment feature flag check error:', error);
    res.status(500).json({ success: false, message: 'Failed to validate expenses setting' });
  }
});

const getExpenseAccess = async (expenseId: number, userId: number, isAdmin: boolean) => {
  const [expenses] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM Expenses WHERE Id = ?',
    [expenseId]
  );
  if (!expenses.length) return { expense: null as RowDataPacket | null, allowed: false };

  const expense = expenses[0];
  if (isAdmin || expense.SubmittedByUserId === userId) {
    return { expense, allowed: true };
  }

  const [members] = await pool.execute<RowDataPacket[]>(
    'SELECT Id FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
    [expense.OrganizationId, userId]
  );
  return { expense, allowed: members.length > 0 };
};

router.get('/expense/:expenseId', async (req: AuthRequest, res: Response) => {
  try {
    const expenseId = Number(req.params.expenseId);
    const userId = req.user!.userId;
    const { expense, allowed } = await getExpenseAccess(expenseId, userId, !!req.user?.isAdmin);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });

    const [attachments] = await pool.execute<RowDataPacket[]>(
      `SELECT ea.Id, ea.ExpenseId, ea.UploadedByUserId, ea.FileName, ea.FileType, ea.FileSize, ea.CreatedAt,
              u.FirstName, u.LastName, u.Username
       FROM ExpenseAttachments ea
       LEFT JOIN Users u ON ea.UploadedByUserId = u.Id
       WHERE ea.ExpenseId = ?
       ORDER BY ea.CreatedAt DESC`,
      [expenseId]
    );

    res.json({ success: true, data: attachments });
  } catch (error) {
    logger.error('Error fetching expense attachments:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attachments' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const attachmentId = Number(req.params.id);
    const userId = req.user!.userId;

    const [attachments] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM ExpenseAttachments WHERE Id = ?',
      [attachmentId]
    );
    if (!attachments.length) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const { allowed } = await getExpenseAccess(attachments[0].ExpenseId, userId, !!req.user?.isAdmin);
    if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });

    res.json({ success: true, data: attachments[0] });
  } catch (error) {
    logger.error('Error fetching expense attachment:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attachment' });
  }
});

router.post('/expense/:expenseId', async (req: AuthRequest, res: Response) => {
  try {
    const expenseId = Number(req.params.expenseId);
    const userId = req.user!.userId;
    const { fileName, fileType, fileSize, fileData } = req.body;

    if (!fileName || !fileType || !fileData) {
      return res.status(400).json({ success: false, message: 'fileName, fileType and fileData are required' });
    }
    if (!ALLOWED_TYPES.includes(fileType)) {
      return res.status(400).json({ success: false, message: 'File type not allowed. Use images or PDF.' });
    }
    if (Number(fileSize) > MAX_FILE_SIZE) {
      return res.status(400).json({ success: false, message: 'File size exceeds 10MB limit' });
    }

    const { expense, allowed } = await getExpenseAccess(expenseId, userId, !!req.user?.isAdmin);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' });

    let data = String(fileData);
    if (data.includes(',')) data = data.split(',')[1];

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO ExpenseAttachments
       (ExpenseId, UploadedByUserId, FileName, FileType, FileSize, FileData, CreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [expenseId, userId, fileName, fileType, Number(fileSize) || 0, data]
    );

    await invalidateByEntity('expense', {
      orgId: expense.OrganizationId,
      projectId: expense.ProjectId ?? undefined,
    });

    res.status(201).json({
      success: true,
      data: {
        Id: result.insertId,
        ExpenseId: expenseId,
        UploadedByUserId: userId,
        FileName: fileName,
        FileType: fileType,
        FileSize: Number(fileSize) || 0,
      },
      message: 'Attachment uploaded',
    });
  } catch (error) {
    logger.error('Error uploading expense attachment:', error);
    res.status(500).json({ success: false, message: 'Failed to upload attachment' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const attachmentId = Number(req.params.id);
    const userId = req.user!.userId;

    const [attachments] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM ExpenseAttachments WHERE Id = ?',
      [attachmentId]
    );
    if (!attachments.length) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const { expense, allowed } = await getExpenseAccess(attachments[0].ExpenseId, userId, !!req.user?.isAdmin);
    if (!expense || !allowed) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const isOwner = attachments[0].UploadedByUserId === userId || expense.SubmittedByUserId === userId;
    if (!isOwner && !req.user?.isAdmin) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    await pool.execute('DELETE FROM ExpenseAttachments WHERE Id = ?', [attachmentId]);
    await invalidateByEntity('expense', {
      orgId: expense.OrganizationId,
      projectId: expense.ProjectId ?? undefined,
    });

    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    logger.error('Error deleting expense attachment:', error);
    res.status(500).json({ success: false, message: 'Failed to delete attachment' });
  }
});

export default router;
