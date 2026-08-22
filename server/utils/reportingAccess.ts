import { pool, RowDataPacket } from '../config/database';

export type ReportingAccess = {
  userId: number;
  isAdmin: boolean;
  isManager: boolean;
  isCustomerUser: boolean;
  canViewReports: boolean;
  canViewOthersPlanning: boolean;
  canViewBudgetInfo: boolean;
};

async function loadRoleAndGroupFlags(userId: number): Promise<{
  canViewReports: boolean;
  canViewOthersPlanning: boolean;
  canViewBudgetInfo: boolean;
  isAdmin: boolean;
  isManager: boolean;
}> {
  const [userRows] = await pool.execute<RowDataPacket[]>(
    'SELECT isAdmin, IsManager, IsDeveloper, IsSupport, CustomerId FROM Users WHERE Id = ?',
    [userId]
  );
  if (!userRows.length) {
    return {
      canViewReports: false,
      canViewOthersPlanning: false,
      canViewBudgetInfo: false,
      isAdmin: false,
      isManager: false,
    };
  }

  const user = userRows[0];
  if (user.isAdmin) {
    return {
      canViewReports: true,
      canViewOthersPlanning: true,
      canViewBudgetInfo: true,
      isAdmin: true,
      isManager: true,
    };
  }

  const roles: string[] = [];
  if (user.IsDeveloper) roles.push('Developer');
  if (user.IsSupport) roles.push('Support');
  if (user.IsManager) roles.push('Manager');

  let canViewReports = false;
  let canViewOthersPlanning = false;
  let canViewBudgetInfo = false;

  if (roles.length > 0) {
    const placeholders = roles.map(() => '?').join(',');
    const [permissions] = await pool.execute<RowDataPacket[]>(
      `SELECT CanViewReports, CanViewOthersPlanning, CanViewBudgetInfo
       FROM RolePermissions WHERE RoleName IN (${placeholders})`,
      roles
    );
    permissions.forEach((perm) => {
      if (perm.CanViewReports) canViewReports = true;
      if (perm.CanViewOthersPlanning) canViewOthersPlanning = true;
      if (perm.CanViewBudgetInfo) canViewBudgetInfo = true;
    });
  }

  const [orgGroupPerms] = await pool.execute<RowDataPacket[]>(
    `SELECT pg.CanViewReports, pg.CanViewOthersPlanning, pg.CanViewBudgetInfo
     FROM PermissionGroups pg
     INNER JOIN OrganizationMembers om ON om.PermissionGroupId = pg.Id
     WHERE om.UserId = ?`,
    [userId]
  );
  orgGroupPerms.forEach((perm) => {
    if (perm.CanViewReports) canViewReports = true;
    if (perm.CanViewOthersPlanning) canViewOthersPlanning = true;
    if (perm.CanViewBudgetInfo) canViewBudgetInfo = true;
  });

  return {
    canViewReports,
    canViewOthersPlanning,
    canViewBudgetInfo,
    isAdmin: false,
    isManager: Number(user.IsManager || 0) === 1,
  };
}

export async function getReportingAccess(userId: number, customerId?: number | null): Promise<ReportingAccess | null> {
  if (!userId) return null;
  const flags = await loadRoleAndGroupFlags(userId);
  const isCustomerUser = customerId != null && Number(customerId) > 0;
  return {
    userId,
    isAdmin: flags.isAdmin,
    isManager: flags.isManager,
    isCustomerUser,
    canViewReports: flags.canViewReports && !isCustomerUser,
    canViewOthersPlanning: flags.canViewOthersPlanning,
    canViewBudgetInfo: flags.canViewBudgetInfo,
  };
}

/** Internal users with CanViewReports (not customer portal). */
export function canAccessReportingHub(access: ReportingAccess): boolean {
  return !access.isCustomerUser && access.canViewReports;
}

/** Admins or managers — Explore + Organization packs. */
export function canAccessManagerReporting(access: ReportingAccess): boolean {
  return canAccessReportingHub(access) && (access.isAdmin || access.isManager);
}

/** Capacity: managers/admins, or anyone who can view others' planning. */
export function canAccessCapacityReporting(access: ReportingAccess): boolean {
  return (
    canAccessReportingHub(access) &&
    (access.isAdmin || access.isManager || access.canViewOthersPlanning)
  );
}

export async function userBelongsToOrganization(userId: number, organizationId: number): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT 1 AS Ok FROM OrganizationMembers WHERE UserId = ? AND OrganizationId = ?',
    [userId, organizationId]
  );
  return rows.length > 0;
}

/** Express middleware: hub access (CanViewReports, not customer). */
export async function requireReportingHubMiddleware(
  req: import('../middleware/auth').AuthRequest,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  const userId = Number(req.user?.userId || 0);
  const access = await getReportingAccess(userId, req.user?.customerId);
  if (!access || !canAccessReportingHub(access)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  return next();
}

/** Express middleware: Explore / advanced pivots — admin or manager only. */
export async function requireManagerReportingMiddleware(
  req: import('../middleware/auth').AuthRequest,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  const userId = Number(req.user?.userId || 0);
  const access = await getReportingAccess(userId, req.user?.customerId);
  if (!access || !canAccessManagerReporting(access)) {
    return res.status(403).json({ success: false, message: 'Manager or admin access required' });
  }
  return next();
}

export function parseDateOnly(value: unknown): string | null {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/** Previous period of equal length ending the day before `from`. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(prevStart), to: fmt(prevEnd) };
}

export function deltaMetric(current: number, previous: number): { current: number; previous: number; delta: number; deltaPct: number | null } {
  const delta = current - previous;
  const deltaPct = previous === 0 ? (current === 0 ? 0 : null) : Number(((delta / previous) * 100).toFixed(1));
  return { current, previous, delta, deltaPct };
}
