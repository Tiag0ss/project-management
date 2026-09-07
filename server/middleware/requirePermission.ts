import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { pool, RowDataPacket } from '../config/database';
import logger from '../utils/logger';

/** CamelCase permission keys matching RolePermissions / PermissionsContext. */
export type PermissionKey =
  | 'canViewDashboard'
  | 'canViewPlanning'
  | 'canViewProjects'
  | 'canManageProjects'
  | 'canCreateProjects'
  | 'canDeleteProjects'
  | 'canViewTasks'
  | 'canManageTasks'
  | 'canCreateTasks'
  | 'canDeleteTasks'
  | 'canAssignTasks'
  | 'canManageTimeEntries'
  | 'canViewReports'
  | 'canViewBudgetInfo'
  | 'canManageOrganizations'
  | 'canViewCustomers'
  | 'canManageCustomers'
  | 'canCreateCustomers'
  | 'canDeleteCustomers'
  | 'canManageUsers'
  | 'canManageTickets'
  | 'canCreateTickets'
  | 'canDeleteTickets'
  | 'canAssignTickets'
  | 'canCreateTaskFromTicket'
  | 'canPlanTasks'
  | 'canViewOthersPlanning'
  | 'canViewApplications'
  | 'canManageApplications'
  | 'canCreateApplications'
  | 'canDeleteApplications'
  | 'canManageReleases'
  | 'canViewExpenses'
  | 'canCreateExpenses'
  | 'canManageExpenses'
  | 'canApproveExpenses';

const COLUMN_BY_KEY: Record<PermissionKey, string> = {
  canViewDashboard: 'CanViewDashboard',
  canViewPlanning: 'CanViewPlanning',
  canViewProjects: 'CanViewProjects',
  canManageProjects: 'CanManageProjects',
  canCreateProjects: 'CanCreateProjects',
  canDeleteProjects: 'CanDeleteProjects',
  canViewTasks: 'CanViewTasks',
  canManageTasks: 'CanManageTasks',
  canCreateTasks: 'CanCreateTasks',
  canDeleteTasks: 'CanDeleteTasks',
  canAssignTasks: 'CanAssignTasks',
  canManageTimeEntries: 'CanManageTimeEntries',
  canViewReports: 'CanViewReports',
  canViewBudgetInfo: 'CanViewBudgetInfo',
  canManageOrganizations: 'CanManageOrganizations',
  canViewCustomers: 'CanViewCustomers',
  canManageCustomers: 'CanManageCustomers',
  canCreateCustomers: 'CanCreateCustomers',
  canDeleteCustomers: 'CanDeleteCustomers',
  canManageUsers: 'CanManageUsers',
  canManageTickets: 'CanManageTickets',
  canCreateTickets: 'CanCreateTickets',
  canDeleteTickets: 'CanDeleteTickets',
  canAssignTickets: 'CanAssignTickets',
  canCreateTaskFromTicket: 'CanCreateTaskFromTicket',
  canPlanTasks: 'CanPlanTasks',
  canViewOthersPlanning: 'CanViewOthersPlanning',
  canViewApplications: 'CanViewApplications',
  canManageApplications: 'CanManageApplications',
  canCreateApplications: 'CanCreateApplications',
  canDeleteApplications: 'CanDeleteApplications',
  canManageReleases: 'CanManageReleases',
  canViewExpenses: 'CanViewExpenses',
  canCreateExpenses: 'CanCreateExpenses',
  canManageExpenses: 'CanManageExpenses',
  canApproveExpenses: 'CanApproveExpenses',
};

/**
 * Express middleware: require the authenticated user to have at least one of the given permissions
 * (admin always passes). Reduces copy-paste role checks on mutation routes.
 */
export function requirePermission(...keys: PermissionKey[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      if (req.user?.isAdmin) {
        return next();
      }

      const [userRows] = await pool.execute<RowDataPacket[]>(
        'SELECT IsDeveloper, IsSupport, IsManager, isAdmin FROM Users WHERE Id = ?',
        [userId]
      );
      const user = userRows[0];
      if (!user) {
        return res.status(403).json({ success: false, message: 'Permission denied' });
      }
      if (user.isAdmin) {
        return next();
      }

      const roles: string[] = [];
      if (user.IsDeveloper) roles.push('Developer');
      if (user.IsSupport) roles.push('Support');
      if (user.IsManager) roles.push('Manager');
      if (roles.length === 0) {
        return res.status(403).json({ success: false, message: 'Permission denied' });
      }

      const columns = [...new Set(keys.map((k) => COLUMN_BY_KEY[k]))];
      const placeholders = roles.map(() => '?').join(',');
      const [perms] = await pool.execute<RowDataPacket[]>(
        `SELECT ${columns.join(', ')} FROM RolePermissions WHERE RoleName IN (${placeholders})`,
        roles
      );

      const granted = keys.some((key) => {
        const col = COLUMN_BY_KEY[key];
        return perms.some((row) => !!row[col]);
      });

      if (!granted) {
        return res.status(403).json({ success: false, message: 'Permission denied' });
      }
      next();
    } catch (error) {
      logger.error('requirePermission failed', {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({ success: false, message: 'Failed to validate permissions' });
    }
  };
}
