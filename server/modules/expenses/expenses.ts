import { Router, Response } from 'express';
import { pool, RowDataPacket, ResultSetHeader } from '../../config/database';
import { authenticateToken, AuthRequest } from '../../middleware/auth';
import {
  createExpenseSchema,
  updateExpenseSchema,
  expenseApprovalSchema,
  expenseReimbursementSchema,
  validateRequest,
} from '../../utils/validation';
import { invalidateByEntity } from '../../services/cacheInvalidation';
import logger from '../../utils/logger';

const router = Router();

const isExpensesEnabled = async (): Promise<boolean> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT SettingValue FROM SystemSettings WHERE SettingKey = ?',
    ['expensesEnabled']
  );
  if (rows.length === 0) return false;
  return rows[0].SettingValue === 'true';
};

const isAutoApproveExpenses = async (): Promise<boolean> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT SettingValue FROM SystemSettings WHERE SettingKey = ?',
    ['autoApproveExpenses']
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
    logger.error('Expense feature flag check error:', error);
    res.status(500).json({ success: false, message: 'Failed to validate expenses setting' });
  }
});

type ExpensePerms = {
  canViewExpenses: boolean;
  canCreateExpenses: boolean;
  canManageExpenses: boolean;
  canApproveExpenses: boolean;
  isAdmin: boolean;
  isTeamLeader: boolean;
};

const getExpensePermissions = async (userId: number, isAdmin: boolean): Promise<ExpensePerms> => {
  if (isAdmin) {
    return {
      canViewExpenses: true,
      canCreateExpenses: true,
      canManageExpenses: true,
      canApproveExpenses: true,
      isAdmin: true,
      isTeamLeader: true,
    };
  }

  const [userRows] = await pool.execute<RowDataPacket[]>(
    'SELECT IsDeveloper, IsSupport, IsManager FROM Users WHERE Id = ?',
    [userId]
  );
  const user = userRows[0];
  const roles: string[] = [];
  if (user?.IsDeveloper) roles.push('Developer');
  if (user?.IsSupport) roles.push('Support');
  if (user?.IsManager) roles.push('Manager');

  let canViewExpenses = false;
  let canCreateExpenses = false;
  let canManageExpenses = false;
  let canApproveExpenses = false;

  if (roles.length > 0) {
    const placeholders = roles.map(() => '?').join(',');
    const [perms] = await pool.execute<RowDataPacket[]>(
      `SELECT CanViewExpenses, CanCreateExpenses, CanManageExpenses, CanApproveExpenses
       FROM RolePermissions WHERE RoleName IN (${placeholders})`,
      roles
    );
    for (const p of perms) {
      if (p.CanViewExpenses) canViewExpenses = true;
      if (p.CanCreateExpenses) canCreateExpenses = true;
      if (p.CanManageExpenses) canManageExpenses = true;
      if (p.CanApproveExpenses) canApproveExpenses = true;
    }
  }

  const [groupPerms] = await pool.execute<RowDataPacket[]>(
    `SELECT pg.CanViewExpenses, pg.CanCreateExpenses, pg.CanManageExpenses, pg.CanApproveExpenses
     FROM PermissionGroups pg
     INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
     WHERE om.UserId = ?`,
    [userId]
  );
  for (const p of groupPerms) {
    if (p.CanViewExpenses) canViewExpenses = true;
    if (p.CanCreateExpenses) canCreateExpenses = true;
    if (p.CanManageExpenses) canManageExpenses = true;
    if (p.CanApproveExpenses) canApproveExpenses = true;
  }

  const [subs] = await pool.execute<RowDataPacket[]>(
    'SELECT COUNT(*) AS Count FROM Users WHERE TeamLeaderId = ? AND IsActive = 1',
    [userId]
  );
  const isTeamLeader = Number(subs[0]?.Count || 0) > 0;

  return {
    canViewExpenses,
    canCreateExpenses,
    canManageExpenses,
    canApproveExpenses,
    isAdmin: false,
    isTeamLeader,
  };
};

const deriveReimbursementStatus = (
  paidBy: string,
  reimbursableAmount: number,
  reimbursedAmount: number
): string => {
  if (paidBy === 'company') return 'not_required';
  if (reimbursedAmount <= 0) return 'pending';
  if (reimbursedAmount + 0.001 >= reimbursableAmount) return 'reimbursed';
  return 'partial';
};

const resolveReimbursableAmount = (expense: RowDataPacket): number => {
  if (expense.ReimbursableAmount !== null && expense.ReimbursableAmount !== undefined && expense.ReimbursableAmount !== '') {
    return Number(expense.ReimbursableAmount);
  }
  return Number(expense.Amount);
};

const parseCategoryMaxReimbursement = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
};

const capReimbursableAmount = (
  expenseAmount: number,
  requestedReimbursable: number,
  categoryMax: number | null
): number => {
  let capped = Math.min(requestedReimbursable, expenseAmount);
  if (categoryMax !== null) {
    capped = Math.min(capped, categoryMax);
  }
  return capped;
};

const fetchCategoryMaxReimbursement = async (categoryId: number): Promise<number | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT MaxReimbursementAmount FROM ExpenseCategoryValues WHERE Id = ?',
    [categoryId]
  );
  if (!rows.length) return null;
  return parseCategoryMaxReimbursement(rows[0].MaxReimbursementAmount);
};

const EXPENSE_SELECT = `
  e.Id, e.OrganizationId, e.ProjectId, e.TaskId, e.CategoryId, e.SubmittedByUserId,
  e.Title, e.Description, e.Vendor, e.Amount, e.ReimbursableAmount, e.ExpenseDate, e.PaidBy,
  e.ApprovalStatus, e.ApprovedBy, e.ApprovedAt,
  e.ReimbursedAmount, e.ReimbursementStatus, e.ReimbursedBy, e.ReimbursedAt,
  e.CreatedAt, e.UpdatedAt,
  o.Name AS OrganizationName,
  p.ProjectName AS ProjectName,
  t.TaskName AS TaskName,
  cat.CategoryName, cat.ColorCode AS CategoryColor, cat.GroupId AS CategoryGroupId,
  cat.MaxReimbursementAmount AS CategoryMaxReimbursementAmount,
  grp.GroupName AS CategoryGroupName, grp.ColorCode AS CategoryGroupColor,
  u.Username AS SubmittedByUsername, u.FirstName AS SubmittedByFirstName, u.LastName AS SubmittedByLastName,
  (COALESCE(e.ReimbursableAmount, e.Amount) - e.ReimbursedAmount) AS RemainingAmount,
  (SELECT COUNT(*) FROM ExpenseAttachments ea WHERE ea.ExpenseId = e.Id) AS AttachmentCount
`;

const EXPENSE_FROM = `
  FROM Expenses e
  INNER JOIN Organizations o ON e.OrganizationId = o.Id
  LEFT JOIN Projects p ON e.ProjectId = p.Id
  LEFT JOIN Tasks t ON e.TaskId = t.Id
  LEFT JOIN ExpenseCategoryValues cat ON e.CategoryId = cat.Id
  LEFT JOIN ExpenseCategoryGroups grp ON cat.GroupId = grp.Id
  LEFT JOIN Users u ON e.SubmittedByUserId = u.Id
`;

const assertOrgMember = async (orgId: number, userId: number): Promise<boolean> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT Id FROM OrganizationMembers WHERE OrganizationId = ? AND UserId = ?',
    [orgId, userId]
  );
  return rows.length > 0;
};

const canUserApproveExpense = async (
  expense: RowDataPacket,
  userId: number,
  perms: ExpensePerms
): Promise<boolean> => {
  if (perms.isAdmin || perms.canApproveExpenses || perms.canManageExpenses) return true;
  if (!perms.isTeamLeader) return false;
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT Id FROM Users WHERE Id = ? AND TeamLeaderId = ?',
    [expense.SubmittedByUserId, userId]
  );
  return rows.length > 0;
};

const canUserViewExpense = async (
  expense: RowDataPacket,
  userId: number,
  perms: ExpensePerms
): Promise<boolean> => {
  if (expense.SubmittedByUserId === userId) return true;
  if (!perms.canViewExpenses && !perms.canManageExpenses && !perms.canApproveExpenses && !perms.isAdmin) {
    return false;
  }
  if (perms.isAdmin || perms.canManageExpenses || perms.canApproveExpenses) return true;
  return canUserApproveExpense(expense, userId, perms);
};

router.get('/approval-scope', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const perms = await getExpensePermissions(userId, !!req.user?.isAdmin);
    res.json({
      success: true,
      canApprove: perms.isAdmin || perms.canApproveExpenses || perms.isTeamLeader,
      canManage: perms.isAdmin || perms.canManageExpenses,
      canCreate: perms.isAdmin || perms.canCreateExpenses,
      canView: perms.isAdmin || perms.canViewExpenses || perms.canCreateExpenses,
      isTeamLeader: perms.isTeamLeader,
    });
  } catch (error) {
    logger.error('Expense approval scope error', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ success: false, message: 'Failed to load approval scope' });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const perms = await getExpensePermissions(userId, !!req.user?.isAdmin);
    if (!perms.canViewExpenses && !perms.canCreateExpenses && !perms.isAdmin) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const {
      organizationId,
      projectId,
      internalOnly,
      categoryId,
      categoryGroupId,
      submittedByUserId,
      approvalStatus,
      reimbursementStatus,
      dateFrom,
      dateTo,
    } = req.query;

    const conditions: string[] = [];
    const params: unknown[] = [];

    const canSeeAll = perms.isAdmin || perms.canManageExpenses || perms.canApproveExpenses;
    if (!canSeeAll) {
      if (perms.isTeamLeader) {
        conditions.push('(e.SubmittedByUserId = ? OR u.TeamLeaderId = ?)');
        params.push(userId, userId);
      } else {
        conditions.push('e.SubmittedByUserId = ?');
        params.push(userId);
      }
    }

    if (organizationId) {
      conditions.push('e.OrganizationId = ?');
      params.push(Number(organizationId));
    }
    if (projectId) {
      conditions.push('e.ProjectId = ?');
      params.push(Number(projectId));
    }
    if (internalOnly === 'true' || internalOnly === '1') {
      conditions.push('e.ProjectId IS NULL');
    }
    if (categoryId) {
      conditions.push('e.CategoryId = ?');
      params.push(Number(categoryId));
    }
    if (categoryGroupId) {
      conditions.push('cat.GroupId = ?');
      params.push(Number(categoryGroupId));
    }
    if (submittedByUserId) {
      conditions.push('e.SubmittedByUserId = ?');
      params.push(Number(submittedByUserId));
    }
    if (approvalStatus) {
      conditions.push('e.ApprovalStatus = ?');
      params.push(String(approvalStatus));
    }
    if (reimbursementStatus === 'needs_reimbursement') {
      conditions.push(`e.ApprovalStatus = 'approved'`);
      conditions.push(`e.PaidBy = 'employee'`);
      conditions.push(`e.ReimbursementStatus IN ('pending', 'partial')`);
    } else if (reimbursementStatus) {
      conditions.push('e.ReimbursementStatus = ?');
      params.push(String(reimbursementStatus));
    }
    if (dateFrom) {
      conditions.push('e.ExpenseDate >= ?');
      params.push(String(dateFrom));
    }
    if (dateTo) {
      conditions.push('e.ExpenseDate <= ?');
      params.push(String(dateTo));
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ${EXPENSE_SELECT}
       ${EXPENSE_FROM}
       ${where}
       ORDER BY e.ExpenseDate DESC, e.Id DESC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('List expenses failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ success: false, message: 'Failed to list expenses' });
  }
});

router.get('/summary', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const perms = await getExpensePermissions(userId, !!req.user?.isAdmin);
    if (!perms.canViewExpenses && !perms.isAdmin) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const orgId = req.query.organizationId ? Number(req.query.organizationId) : null;
    const conditions: string[] = [`e.ApprovalStatus = 'approved'`];
    const params: unknown[] = [];
    if (orgId) {
      conditions.push('e.OrganizationId = ?');
      params.push(orgId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const [byScope] = await pool.execute<RowDataPacket[]>(
      `SELECT
         SUM(CASE WHEN e.ProjectId IS NULL THEN e.Amount ELSE 0 END) AS InternalTotal,
         SUM(CASE WHEN e.ProjectId IS NOT NULL THEN e.Amount ELSE 0 END) AS ProjectTotal,
         SUM(e.Amount) AS GrandTotal,
         SUM(CASE WHEN e.PaidBy = 'employee' THEN e.ReimbursedAmount ELSE 0 END) AS ReimbursedTotal,
         SUM(CASE WHEN e.PaidBy = 'employee' THEN (COALESCE(e.ReimbursableAmount, e.Amount) - e.ReimbursedAmount) ELSE 0 END) AS RemainingTotal
       FROM Expenses e
       ${where}`,
      params
    );

    const [byGroup] = await pool.execute<RowDataPacket[]>(
      `SELECT grp.Id AS GroupId, grp.GroupName, grp.ColorCode,
              SUM(e.Amount) AS TotalAmount, COUNT(*) AS ExpenseCount
       FROM Expenses e
       LEFT JOIN ExpenseCategoryValues cat ON e.CategoryId = cat.Id
       LEFT JOIN ExpenseCategoryGroups grp ON cat.GroupId = grp.Id
       ${where}
       GROUP BY grp.Id, grp.GroupName, grp.ColorCode
       ORDER BY TotalAmount DESC`,
      params
    );

    const [byCategory] = await pool.execute<RowDataPacket[]>(
      `SELECT cat.Id AS CategoryId, cat.CategoryName, cat.ColorCode, cat.GroupId,
              grp.GroupName, SUM(e.Amount) AS TotalAmount, COUNT(*) AS ExpenseCount
       FROM Expenses e
       LEFT JOIN ExpenseCategoryValues cat ON e.CategoryId = cat.Id
       LEFT JOIN ExpenseCategoryGroups grp ON cat.GroupId = grp.Id
       ${where}
       GROUP BY cat.Id, cat.CategoryName, cat.ColorCode, cat.GroupId, grp.GroupName
       ORDER BY TotalAmount DESC`,
      params
    );

    res.json({
      success: true,
      data: {
        totals: byScope[0] || {},
        byGroup,
        byCategory,
      },
    });
  } catch (error) {
    logger.error('Expense summary failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ success: false, message: 'Failed to load expense summary' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const expenseId = Number(req.params.id);
    const perms = await getExpensePermissions(userId, !!req.user?.isAdmin);

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT ${EXPENSE_SELECT} ${EXPENSE_FROM} WHERE e.Id = ?`,
      [expenseId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    const expense = rows[0];
    if (!(await canUserViewExpense(expense, userId, perms))) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    res.json({ success: true, data: expense });
  } catch (error) {
    logger.error('Get expense failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ success: false, message: 'Failed to get expense' });
  }
});

router.post('/', validateRequest(createExpenseSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const perms = await getExpensePermissions(userId, !!req.user?.isAdmin);
    if (!perms.canCreateExpenses && !perms.isAdmin) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const {
      organizationId,
      categoryId,
      title,
      amount,
      expenseDate,
      projectId,
      taskId,
      description,
      vendor,
      paidBy = 'employee',
    } = req.body;

    if (!(await assertOrgMember(organizationId, userId)) && !req.user?.isAdmin) {
      return res.status(403).json({ success: false, message: 'Not a member of this organization' });
    }

    const [cats] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, MaxReimbursementAmount FROM ExpenseCategoryValues WHERE Id = ? AND OrganizationId = ?',
      [categoryId, organizationId]
    );
    if (!cats.length) {
      return res.status(400).json({ success: false, message: 'Invalid category for organization' });
    }
    const categoryMax = parseCategoryMaxReimbursement(cats[0].MaxReimbursementAmount);
    const expenseAmount = Number(amount);
    const initialReimbursable =
      paidBy === 'company' ? null : capReimbursableAmount(expenseAmount, expenseAmount, categoryMax);

    let resolvedProjectId: number | null = projectId ?? null;
    let resolvedTaskId: number | null = taskId ?? null;

    if (resolvedTaskId && !resolvedProjectId) {
      return res.status(400).json({ success: false, message: 'Task requires a project' });
    }

    if (resolvedProjectId) {
      const [projects] = await pool.execute<RowDataPacket[]>(
        'SELECT Id FROM Projects WHERE Id = ? AND OrganizationId = ?',
        [resolvedProjectId, organizationId]
      );
      if (!projects.length) {
        return res.status(400).json({ success: false, message: 'Invalid project for organization' });
      }
    }

    if (resolvedTaskId) {
      const [tasks] = await pool.execute<RowDataPacket[]>(
        'SELECT Id, ProjectId FROM Tasks WHERE Id = ?',
        [resolvedTaskId]
      );
      if (!tasks.length || Number(tasks[0].ProjectId) !== Number(resolvedProjectId)) {
        return res.status(400).json({ success: false, message: 'Task does not belong to the selected project' });
      }
    }

    const autoApprove = await isAutoApproveExpenses();
    const approvalStatus = autoApprove ? 'approved' : 'pending';
    const reimbursementStatus = paidBy === 'company' ? 'not_required' : 'pending';

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO Expenses (
        OrganizationId, ProjectId, TaskId, CategoryId, SubmittedByUserId,
        Title, Description, Vendor, Amount, ReimbursableAmount, ExpenseDate, PaidBy,
        ApprovalStatus, ApprovedBy, ApprovedAt,
        ReimbursedAmount, ReimbursementStatus, CreatedAt, UpdatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        organizationId,
        resolvedProjectId,
        resolvedTaskId,
        categoryId,
        userId,
        title,
        description || null,
        vendor || null,
        amount,
        initialReimbursable ?? amount,
        expenseDate,
        paidBy,
        approvalStatus,
        autoApprove ? userId : null,
        autoApprove ? new Date() : null,
        reimbursementStatus,
      ]
    );

    await invalidateByEntity('expense', { orgId: organizationId, projectId: resolvedProjectId ?? undefined });

    const [created] = await pool.execute<RowDataPacket[]>(
      `SELECT ${EXPENSE_SELECT} ${EXPENSE_FROM} WHERE e.Id = ?`,
      [result.insertId]
    );

    res.status(201).json({ success: true, data: created[0], message: 'Expense created' });
  } catch (error) {
    logger.error('Create expense failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ success: false, message: 'Failed to create expense' });
  }
});

router.put('/:id', validateRequest(updateExpenseSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const expenseId = Number(req.params.id);
    const perms = await getExpensePermissions(userId, !!req.user?.isAdmin);

    const [existingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Expenses WHERE Id = ?',
      [expenseId]
    );
    if (!existingRows.length) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    const existing = existingRows[0];
    const isOwner = existing.SubmittedByUserId === userId;
    const canManage = perms.isAdmin || perms.canManageExpenses;
    const hasReimbursement = Number(existing.ReimbursedAmount || 0) > 0;

    if (!isOwner && !canManage && !perms.isAdmin) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    // After any reimbursement, only admins may change fields other than Description.
    // Owners may always update Description (and attachments via the attachments API).
    const bodyKeys = Object.keys(req.body || {}).filter((k) => req.body[k] !== undefined);
    const restrictedOnly =
      bodyKeys.length > 0 && bodyKeys.every((k) => k === 'description');

    if (hasReimbursement && !perms.isAdmin) {
      if (!isOwner || !restrictedOnly) {
        return res.status(403).json({
          success: false,
          message:
            'After reimbursement starts, only description (and attachments) can be updated. Admins can correct other fields from Approvals.',
        });
      }
      await pool.execute(
        `UPDATE Expenses SET Description = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE Id = ?`,
        [req.body.description || null, expenseId]
      );
      await invalidateByEntity('expense', {
        orgId: existing.OrganizationId,
        projectId: existing.ProjectId ?? undefined,
      });
      const [updatedRestricted] = await pool.execute<RowDataPacket[]>(
        `SELECT ${EXPENSE_SELECT} ${EXPENSE_FROM} WHERE e.Id = ?`,
        [expenseId]
      );
      return res.json({ success: true, data: updatedRestricted[0], message: 'Expense updated' });
    }

    if (isOwner && !canManage && existing.ApprovalStatus === 'approved' && !restrictedOnly) {
      return res.status(403).json({
        success: false,
        message: 'Approved expenses: submitters can only update description and attachments',
      });
    }

    if (isOwner && !canManage && existing.ApprovalStatus === 'approved' && restrictedOnly) {
      await pool.execute(
        `UPDATE Expenses SET Description = ?, UpdatedAt = CURRENT_TIMESTAMP WHERE Id = ?`,
        [req.body.description || null, expenseId]
      );
      await invalidateByEntity('expense', {
        orgId: existing.OrganizationId,
        projectId: existing.ProjectId ?? undefined,
      });
      const [updatedDesc] = await pool.execute<RowDataPacket[]>(
        `SELECT ${EXPENSE_SELECT} ${EXPENSE_FROM} WHERE e.Id = ?`,
        [expenseId]
      );
      return res.json({ success: true, data: updatedDesc[0], message: 'Expense updated' });
    }

    const categoryId = req.body.categoryId ?? existing.CategoryId;
    const [catRows] = await pool.execute<RowDataPacket[]>(
      'SELECT Id, MaxReimbursementAmount FROM ExpenseCategoryValues WHERE Id = ? AND OrganizationId = ?',
      [categoryId, existing.OrganizationId]
    );
    if (!catRows.length) {
      return res.status(400).json({ success: false, message: 'Invalid category for organization' });
    }
    const categoryMax = parseCategoryMaxReimbursement(catRows[0].MaxReimbursementAmount);

    const title = req.body.title ?? existing.Title;
    const amount = req.body.amount !== undefined ? Number(req.body.amount) : Number(existing.Amount);
    const expenseDate = req.body.expenseDate ?? existing.ExpenseDate;
    const description = req.body.description !== undefined ? req.body.description : existing.Description;
    const vendor = req.body.vendor !== undefined ? req.body.vendor : existing.Vendor;
    const paidBy = req.body.paidBy ?? existing.PaidBy;
    let projectId = req.body.projectId !== undefined ? req.body.projectId : existing.ProjectId;
    let taskId = req.body.taskId !== undefined ? req.body.taskId : existing.TaskId;

    if (taskId && !projectId) {
      return res.status(400).json({ success: false, message: 'Task requires a project' });
    }

    const reimbursedAmount = Number(existing.ReimbursedAmount || 0);
    if (amount < reimbursedAmount) {
      return res.status(400).json({ success: false, message: 'Amount cannot be less than already reimbursed amount' });
    }

    let reimbursableAmount =
      req.body.reimbursableAmount !== undefined
        ? req.body.reimbursableAmount === null
          ? amount
          : Number(req.body.reimbursableAmount)
        : resolveReimbursableAmount({ ...existing, Amount: amount });

    // Only admins / expense approvers / managers may change reimbursable amount
    if (req.body.reimbursableAmount !== undefined) {
      const canSetReimbursable =
        perms.isAdmin || perms.canApproveExpenses || perms.canManageExpenses;
      if (!canSetReimbursable) {
        return res.status(403).json({ success: false, message: 'Permission denied to set reimbursable amount' });
      }
    }

    if (reimbursableAmount > amount + 0.001) {
      return res.status(400).json({
        success: false,
        message: 'Reimbursable amount cannot exceed the expense total',
      });
    }
    reimbursableAmount = capReimbursableAmount(amount, reimbursableAmount, categoryMax);
    if (req.body.reimbursableAmount !== undefined && categoryMax !== null && Number(req.body.reimbursableAmount) > categoryMax + 0.001) {
      return res.status(400).json({
        success: false,
        message: `Reimbursable amount cannot exceed category maximum (${categoryMax.toFixed(2)})`,
      });
    }
    if (reimbursableAmount + 0.001 < reimbursedAmount) {
      return res.status(400).json({
        success: false,
        message: 'Reimbursable amount cannot be less than already reimbursed amount',
      });
    }

    let reimbursementStatus = deriveReimbursementStatus(paidBy, reimbursableAmount, reimbursedAmount);
    if (paidBy === 'company') {
      reimbursementStatus = 'not_required';
      reimbursableAmount = amount;
    }

    await pool.execute(
      `UPDATE Expenses SET
        CategoryId = ?, Title = ?, Description = ?, Vendor = ?, Amount = ?, ReimbursableAmount = ?, ExpenseDate = ?,
        PaidBy = ?, ProjectId = ?, TaskId = ?,
        ReimbursementStatus = ?,
        ReimbursedAmount = CASE WHEN ? = 'company' THEN 0 ELSE ReimbursedAmount END,
        UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [
        categoryId,
        title,
        description || null,
        vendor || null,
        amount,
        paidBy === 'company' ? null : reimbursableAmount,
        expenseDate,
        paidBy,
        projectId || null,
        taskId || null,
        reimbursementStatus,
        paidBy,
        expenseId,
      ]
    );

    await invalidateByEntity('expense', {
      orgId: existing.OrganizationId,
      projectId: projectId ?? existing.ProjectId ?? undefined,
    });

    const [updated] = await pool.execute<RowDataPacket[]>(
      `SELECT ${EXPENSE_SELECT} ${EXPENSE_FROM} WHERE e.Id = ?`,
      [expenseId]
    );

    res.json({ success: true, data: updated[0], message: 'Expense updated' });
  } catch (error) {
    logger.error('Update expense failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ success: false, message: 'Failed to update expense' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const expenseId = Number(req.params.id);
    const perms = await getExpensePermissions(userId, !!req.user?.isAdmin);

    const [existingRows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Expenses WHERE Id = ?',
      [expenseId]
    );
    if (!existingRows.length) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    const existing = existingRows[0];
    const isOwner = existing.SubmittedByUserId === userId;
    const canManage = perms.isAdmin || perms.canManageExpenses;

    if (perms.isAdmin) {
      // Admins may delete from Approvals even after approval/reimbursement
    } else if (!isOwner && !canManage) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    } else if (existing.ApprovalStatus !== 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Expenses can only be deleted before the first approval action (admins can delete anytime from Approvals)',
      });
    }

    await pool.execute('DELETE FROM ExpenseReimbursementPayments WHERE ExpenseId = ?', [expenseId]);
    await pool.execute('DELETE FROM ExpenseAttachments WHERE ExpenseId = ?', [expenseId]);
    await pool.execute('DELETE FROM Expenses WHERE Id = ?', [expenseId]);

    await invalidateByEntity('expense', {
      orgId: existing.OrganizationId,
      projectId: existing.ProjectId ?? undefined,
    });

    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    logger.error('Delete expense failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ success: false, message: 'Failed to delete expense' });
  }
});

router.patch('/:id/approval', validateRequest(expenseApprovalSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const expenseId = Number(req.params.id);
    const { status } = req.body;
    const perms = await getExpensePermissions(userId, !!req.user?.isAdmin);

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Expenses WHERE Id = ?',
      [expenseId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    const expense = rows[0];

    if (!(await canUserApproveExpense(expense, userId, perms))) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const currentApproval = String(expense.ApprovalStatus);

    if (status === 'pending') {
      if (!perms.isAdmin) {
        return res.status(403).json({ success: false, message: 'Only admins can revert rejected expenses' });
      }
      if (currentApproval !== 'rejected') {
        return res.status(400).json({ success: false, message: 'Only rejected expenses can be reverted to pending' });
      }
      const reimbursementStatus = expense.PaidBy === 'company' ? 'not_required' : 'pending';
      await pool.execute(
        `UPDATE Expenses SET
          ApprovalStatus = 'pending',
          ApprovedBy = NULL,
          ApprovedAt = NULL,
          ReimbursementStatus = ?,
          UpdatedAt = CURRENT_TIMESTAMP
         WHERE Id = ?`,
        [reimbursementStatus, expenseId]
      );
    } else if (status === 'rejected') {
      await pool.execute(
        `UPDATE Expenses SET
          ApprovalStatus = 'rejected',
          ApprovedBy = ?,
          ApprovedAt = CURRENT_TIMESTAMP,
          ReimbursementStatus = 'not_applicable',
          UpdatedAt = CURRENT_TIMESTAMP
         WHERE Id = ?`,
        [userId, expenseId]
      );
    } else {
      const reimbursable = resolveReimbursableAmount(expense);
      const reimbursed = Number(expense.ReimbursedAmount || 0);
      const reimbursementStatus =
        expense.PaidBy === 'company'
          ? 'not_required'
          : deriveReimbursementStatus('employee', reimbursable, reimbursed);

      await pool.execute(
        `UPDATE Expenses SET
          ApprovalStatus = 'approved',
          ApprovedBy = ?,
          ApprovedAt = CURRENT_TIMESTAMP,
          ReimbursementStatus = ?,
          UpdatedAt = CURRENT_TIMESTAMP
         WHERE Id = ?`,
        [userId, reimbursementStatus, expenseId]
      );
    }

    await invalidateByEntity('expense', {
      orgId: expense.OrganizationId,
      projectId: expense.ProjectId ?? undefined,
    });

    const [updated] = await pool.execute<RowDataPacket[]>(
      `SELECT ${EXPENSE_SELECT} ${EXPENSE_FROM} WHERE e.Id = ?`,
      [expenseId]
    );

    res.json({ success: true, data: updated[0], message: `Expense ${status}` });
  } catch (error) {
    logger.error('Expense approval failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ success: false, message: 'Failed to update approval' });
  }
});

router.get('/:id/reimbursements', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const expenseId = Number(req.params.id);
    const perms = await getExpensePermissions(userId, !!req.user?.isAdmin);

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Expenses WHERE Id = ?',
      [expenseId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    if (!(await canUserViewExpense(rows[0], userId, perms))) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const [payments] = await pool.execute<RowDataPacket[]>(
      `SELECT p.*, u.Username, u.FirstName, u.LastName
       FROM ExpenseReimbursementPayments p
       LEFT JOIN Users u ON p.CreatedByUserId = u.Id
       WHERE p.ExpenseId = ?
       ORDER BY p.CreatedAt ASC`,
      [expenseId]
    );

    res.json({ success: true, data: payments });
  } catch (error) {
    logger.error('List reimbursements failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ success: false, message: 'Failed to list reimbursements' });
  }
});

router.post('/:id/reimbursements', validateRequest(expenseReimbursementSchema), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const expenseId = Number(req.params.id);
    const { amount, notes, reimbursableAmount: reimbursableBody, settleRemaining } = req.body;
    const perms = await getExpensePermissions(userId, !!req.user?.isAdmin);

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Expenses WHERE Id = ?',
      [expenseId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    const expense = rows[0];

    if (!(await canUserApproveExpense(expense, userId, perms))) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    if (expense.ApprovalStatus !== 'approved') {
      return res.status(400).json({ success: false, message: 'Expense must be approved before reimbursement' });
    }
    if (expense.PaidBy === 'company') {
      return res.status(400).json({ success: false, message: 'Company-paid expenses do not require reimbursement' });
    }

    const totalAmount = Number(expense.Amount);
    const currentReimbursed = Number(expense.ReimbursedAmount || 0);
    const categoryMax = await fetchCategoryMaxReimbursement(Number(expense.CategoryId));
    let reimbursableCap = capReimbursableAmount(
      totalAmount,
      resolveReimbursableAmount(expense),
      categoryMax
    );

    if (reimbursableBody !== undefined && reimbursableBody !== null) {
      const requestedCap = Number(reimbursableBody);
      if (requestedCap > totalAmount + 0.001) {
        return res.status(400).json({
          success: false,
          message: 'Reimbursable amount cannot exceed the expense total',
        });
      }
      if (categoryMax !== null && requestedCap > categoryMax + 0.001) {
        return res.status(400).json({
          success: false,
          message: `Reimbursable amount cannot exceed category maximum (${categoryMax.toFixed(2)})`,
        });
      }
      if (requestedCap + 0.001 < currentReimbursed) {
        return res.status(400).json({
          success: false,
          message: 'Reimbursable amount cannot be less than already reimbursed amount',
        });
      }
      reimbursableCap = capReimbursableAmount(totalAmount, requestedCap, categoryMax);
    }

    const paymentAmount = Number(amount);
    const remaining = reimbursableCap - currentReimbursed;

    if (paymentAmount > remaining + 0.001) {
      return res.status(400).json({
        success: false,
        message: `Payment exceeds remaining reimbursable amount (${remaining.toFixed(2)})`,
      });
    }

    await pool.execute(
      `INSERT INTO ExpenseReimbursementPayments (ExpenseId, Amount, Notes, CreatedByUserId, CreatedAt)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [expenseId, paymentAmount, notes || null, userId]
    );

    const newReimbursed = currentReimbursed + paymentAmount;
    // Settle for less: this payment closes reimbursement; cap becomes the new reimbursed total.
    if (settleRemaining || (reimbursableBody !== undefined && reimbursableBody !== null)) {
      if (settleRemaining) {
        reimbursableCap = newReimbursed;
      }
    }
    reimbursableCap = capReimbursableAmount(totalAmount, reimbursableCap, categoryMax);
    const newStatus = deriveReimbursementStatus('employee', reimbursableCap, newReimbursed);

    await pool.execute(
      `UPDATE Expenses SET
        ReimbursableAmount = ?,
        ReimbursedAmount = ?,
        ReimbursementStatus = ?,
        ReimbursedBy = ?,
        ReimbursedAt = CURRENT_TIMESTAMP,
        UpdatedAt = CURRENT_TIMESTAMP
       WHERE Id = ?`,
      [reimbursableCap, newReimbursed, newStatus, userId, expenseId]
    );

    await invalidateByEntity('expense', {
      orgId: expense.OrganizationId,
      projectId: expense.ProjectId ?? undefined,
    });

    const [updated] = await pool.execute<RowDataPacket[]>(
      `SELECT ${EXPENSE_SELECT} ${EXPENSE_FROM} WHERE e.Id = ?`,
      [expenseId]
    );

    res.status(201).json({ success: true, data: updated[0], message: 'Reimbursement recorded' });
  } catch (error) {
    logger.error('Record reimbursement failed', { error: error instanceof Error ? error.message : error });
    res.status(500).json({ success: false, message: 'Failed to record reimbursement' });
  }
});

export default router;
