import { pool, RowDataPacket } from '../config/database';

/** Effective cap approved for reimbursement on an expense row. */
export const EXPENSE_REIMBURSABLE_CAP_SQL = 'COALESCE(e.ReimbursableAmount, e.Amount)';

export const EXPENSE_REMAINING_SQL = `CASE
  WHEN e.PaidBy = 'employee' AND e.ReimbursementStatus IN ('pending', 'partial')
  THEN GREATEST(0, ${EXPENSE_REIMBURSABLE_CAP_SQL} - e.ReimbursedAmount)
  ELSE 0
END`;

const EXPENSE_FROM = `
  FROM Expenses e
  LEFT JOIN ExpenseCategoryValues cat ON e.CategoryId = cat.Id
  LEFT JOIN ExpenseCategoryGroups grp ON cat.GroupId = grp.Id
  LEFT JOIN Users u ON e.SubmittedByUserId = u.Id
  LEFT JOIN Projects p ON e.ProjectId = p.Id
`;

export type ExpenseReportFilters = {
  organizationId: number;
  /** When omitted, expense date is not filtered (all time). */
  from?: string | null;
  to?: string | null;
  projectId?: number | null;
  groupId?: number | null;
  categoryId?: number | null;
  userId?: number | null;
  reimbursementStatus?: string | null;
  internalOnly?: boolean;
  approvalStatus?: string;
};

export function normalizeExpenseReportPeriod(from?: string | null, to?: string | null): { from?: string; to?: string } {
  const parsedFrom = from?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const parsedTo = to?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!parsedFrom && !parsedTo) return {};
  if (parsedFrom && parsedTo && parsedFrom > parsedTo) {
    return { from: parsedTo, to: parsedFrom };
  }
  return {
    ...(parsedFrom ? { from: parsedFrom } : {}),
    ...(parsedTo ? { to: parsedTo } : {}),
  };
}

export async function isExpensesModuleEnabled(): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'expensesEnabled'`
  );
  if (!rows.length) return false;
  return rows[0].SettingValue === 'true';
}

function buildExpenseReportWhere(filters: ExpenseReportFilters): { where: string; params: unknown[] } {
  const period = normalizeExpenseReportPeriod(filters.from, filters.to);
  const conditions = ['e.OrganizationId = ?', 'e.ApprovalStatus = ?'];
  const params: unknown[] = [filters.organizationId, filters.approvalStatus ?? 'approved'];

  if (period.from) {
    conditions.push('e.ExpenseDate >= ?');
    params.push(period.from);
  }
  if (period.to) {
    conditions.push('e.ExpenseDate <= ?');
    params.push(period.to);
  }

  if (filters.projectId) {
    conditions.push('e.ProjectId = ?');
    params.push(filters.projectId);
  }
  if (filters.internalOnly) {
    conditions.push('e.ProjectId IS NULL');
  }
  if (filters.groupId) {
    conditions.push('cat.GroupId = ?');
    params.push(filters.groupId);
  }
  if (filters.categoryId) {
    conditions.push('e.CategoryId = ?');
    params.push(filters.categoryId);
  }
  if (filters.userId) {
    conditions.push('e.SubmittedByUserId = ?');
    params.push(filters.userId);
  }
  if (filters.reimbursementStatus === 'needs_reimbursement') {
    conditions.push(`e.PaidBy = 'employee'`);
    conditions.push(`e.ReimbursementStatus IN ('pending', 'partial')`);
  } else if (filters.reimbursementStatus) {
    conditions.push('e.ReimbursementStatus = ?');
    params.push(filters.reimbursementStatus);
  }

  return { where: `WHERE ${conditions.join(' AND ')}`, params };
}

export async function queryExpenseReporting(filters: ExpenseReportFilters) {
  const period = normalizeExpenseReportPeriod(filters.from, filters.to);
  const { where, params } = buildExpenseReportWhere(filters);

  const [totalsRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       SUM(CASE WHEN e.ProjectId IS NULL THEN e.Amount ELSE 0 END) AS InternalTotal,
       SUM(CASE WHEN e.ProjectId IS NOT NULL THEN e.Amount ELSE 0 END) AS ProjectTotal,
       SUM(e.Amount) AS GrandTotal,
       SUM(CASE WHEN e.PaidBy = 'employee' THEN e.ReimbursedAmount ELSE 0 END) AS ReimbursedTotal,
       SUM(CASE WHEN e.PaidBy = 'employee' THEN ${EXPENSE_REIMBURSABLE_CAP_SQL} ELSE 0 END) AS ReimbursableCapTotal,
       SUM(${EXPENSE_REMAINING_SQL}) AS RemainingTotal,
       SUM(CASE WHEN e.PaidBy = 'employee' AND e.ReimbursementStatus = 'reimbursed' THEN 1 ELSE 0 END) AS FullyReimbursedCount,
       COUNT(*) AS ExpenseCount
     ${EXPENSE_FROM}
     ${where}`,
    params
  );

  const [byGroup] = await pool.execute<RowDataPacket[]>(
    `SELECT grp.Id AS GroupId, grp.GroupName,
            SUM(e.Amount) AS TotalAmount,
            SUM(CASE WHEN e.PaidBy = 'employee' THEN ${EXPENSE_REIMBURSABLE_CAP_SQL} ELSE 0 END) AS ReimbursableCap,
            SUM(CASE WHEN e.PaidBy = 'employee' THEN e.ReimbursedAmount ELSE 0 END) AS Reimbursed,
            SUM(${EXPENSE_REMAINING_SQL}) AS Remaining
     ${EXPENSE_FROM}
     ${where}
     GROUP BY grp.Id, grp.GroupName
     ORDER BY TotalAmount DESC`,
    params
  );

  const [byCategory] = await pool.execute<RowDataPacket[]>(
    `SELECT cat.Id AS CategoryId, cat.CategoryName, grp.GroupName,
            SUM(e.Amount) AS TotalAmount,
            SUM(CASE WHEN e.PaidBy = 'employee' THEN ${EXPENSE_REIMBURSABLE_CAP_SQL} ELSE 0 END) AS ReimbursableCap,
            SUM(CASE WHEN e.PaidBy = 'employee' THEN e.ReimbursedAmount ELSE 0 END) AS Reimbursed,
            SUM(${EXPENSE_REMAINING_SQL}) AS Remaining,
            COUNT(*) AS ExpenseCount
     ${EXPENSE_FROM}
     ${where}
     GROUP BY cat.Id, cat.CategoryName, grp.GroupName
     ORDER BY TotalAmount DESC`,
    params
  );

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       e.Id, e.Title, e.Amount, e.ExpenseDate, e.PaidBy, e.ApprovalStatus, e.ReimbursementStatus,
       e.ReimbursedAmount, ${EXPENSE_REIMBURSABLE_CAP_SQL} AS ReimbursableCap,
       ${EXPENSE_REMAINING_SQL} AS RemainingAmount,
       e.ProjectId, p.ProjectName,
       cat.Id AS CategoryId, cat.CategoryName, grp.Id AS GroupId, grp.GroupName,
       e.SubmittedByUserId, u.Username AS SubmittedByUsername,
       u.FirstName AS SubmittedByFirstName, u.LastName AS SubmittedByLastName
     ${EXPENSE_FROM}
     ${where}
     ORDER BY e.ExpenseDate DESC, e.Id DESC`,
    params
  );

  const [submitters] = await pool.execute<RowDataPacket[]>(
    `SELECT DISTINCT e.SubmittedByUserId AS Id,
            u.Username, u.FirstName, u.LastName
     ${EXPENSE_FROM}
     WHERE e.OrganizationId = ? AND e.ApprovalStatus = 'approved'
       ${period.from ? 'AND e.ExpenseDate >= ?' : ''}
       ${period.to ? 'AND e.ExpenseDate <= ?' : ''}
     ORDER BY u.FirstName, u.Username`,
    [
      filters.organizationId,
      ...(period.from ? [period.from] : []),
      ...(period.to ? [period.to] : []),
    ]
  );

  const [filterGroups] = await pool.execute<RowDataPacket[]>(
    `SELECT Id, GroupName FROM ExpenseCategoryGroups WHERE OrganizationId = ? ORDER BY SortOrder, GroupName`,
    [filters.organizationId]
  );
  const [filterCategories] = await pool.execute<RowDataPacket[]>(
    `SELECT c.Id, c.CategoryName, c.GroupId, g.GroupName
     FROM ExpenseCategoryValues c
     INNER JOIN ExpenseCategoryGroups g ON c.GroupId = g.Id
     WHERE c.OrganizationId = ?
     ORDER BY g.SortOrder, g.GroupName, c.SortOrder, c.CategoryName`,
    [filters.organizationId]
  );

  const totals = totalsRows[0] || {};

  return {
    totals: {
      InternalTotal: Number(totals.InternalTotal || 0),
      ProjectTotal: Number(totals.ProjectTotal || 0),
      GrandTotal: Number(totals.GrandTotal || 0),
      ReimbursedTotal: Number(totals.ReimbursedTotal || 0),
      ReimbursableCapTotal: Number(totals.ReimbursableCapTotal || 0),
      RemainingTotal: Number(totals.RemainingTotal || 0),
      FullyReimbursedCount: Number(totals.FullyReimbursedCount || 0),
      ExpenseCount: Number(totals.ExpenseCount || 0),
    },
    byGroup: byGroup.map((row) => ({
      groupId: row.GroupId ? Number(row.GroupId) : null,
      groupName: String(row.GroupName || 'Ungrouped'),
      totalAmount: Number(row.TotalAmount || 0),
      reimbursableCap: Number(row.ReimbursableCap || 0),
      reimbursed: Number(row.Reimbursed || 0),
      remaining: Number(row.Remaining || 0),
    })),
    byCategory: byCategory.map((row) => ({
      categoryId: row.CategoryId ? Number(row.CategoryId) : null,
      categoryName: String(row.CategoryName || 'Uncategorized'),
      groupName: String(row.GroupName || 'Ungrouped'),
      totalAmount: Number(row.TotalAmount || 0),
      reimbursableCap: Number(row.ReimbursableCap || 0),
      reimbursed: Number(row.Reimbursed || 0),
      remaining: Number(row.Remaining || 0),
      expenseCount: Number(row.ExpenseCount || 0),
    })),
    rows: rows.map((row) => ({
      id: Number(row.Id),
      title: String(row.Title || ''),
      amount: Number(row.Amount || 0),
      expenseDate: String(row.ExpenseDate).slice(0, 10),
      paidBy: String(row.PaidBy || ''),
      approvalStatus: String(row.ApprovalStatus || ''),
      reimbursementStatus: String(row.ReimbursementStatus || ''),
      reimbursedAmount: Number(row.ReimbursedAmount || 0),
      reimbursableCap: Number(row.ReimbursableCap || 0),
      remainingAmount: Number(row.RemainingAmount || 0),
      projectId: row.ProjectId ? Number(row.ProjectId) : null,
      projectName: row.ProjectName ? String(row.ProjectName) : null,
      categoryId: row.CategoryId ? Number(row.CategoryId) : null,
      categoryName: row.CategoryName ? String(row.CategoryName) : null,
      groupId: row.GroupId ? Number(row.GroupId) : null,
      groupName: row.GroupName ? String(row.GroupName) : null,
      submittedByUserId: Number(row.SubmittedByUserId),
      submittedByUsername: row.SubmittedByUsername ? String(row.SubmittedByUsername) : null,
      submittedByFirstName: row.SubmittedByFirstName ? String(row.SubmittedByFirstName) : null,
      submittedByLastName: row.SubmittedByLastName ? String(row.SubmittedByLastName) : null,
    })),
    submitters: submitters.map((row) => ({
      id: Number(row.Id),
      username: row.Username ? String(row.Username) : null,
      firstName: row.FirstName ? String(row.FirstName) : null,
      lastName: row.LastName ? String(row.LastName) : null,
    })),
    filterOptions: {
      groups: filterGroups.map((row) => ({
        id: Number(row.Id),
        name: String(row.GroupName),
      })),
      categories: filterCategories.map((row) => ({
        id: Number(row.Id),
        name: String(row.CategoryName),
        groupId: Number(row.GroupId),
        groupName: String(row.GroupName),
      })),
    },
  };
}
