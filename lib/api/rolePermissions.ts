import { getApiUrl } from './config';

const API_URL = getApiUrl();

export interface RolePermission {
  Id: number;
  RoleName: string;
  CanViewDashboard: boolean;
  CanViewPlanning: boolean;
  CanViewProjects: boolean;
  CanManageProjects: boolean;
  CanCreateProjects: boolean;
  CanDeleteProjects: boolean;
  CanViewTasks: boolean;
  CanManageTasks: boolean;
  CanCreateTasks: boolean;
  CanDeleteTasks: boolean;
  CanAssignTasks: boolean;
  CanManageTimeEntries: boolean;
  CanViewReports: boolean;
  CanManageOrganizations: boolean;
  CanViewCustomers: boolean;
  CanManageCustomers: boolean;
  CanCreateCustomers: boolean;
  CanDeleteCustomers: boolean;
  CanManageUsers: boolean;
  CanManageTickets: boolean;
  CanCreateTickets: boolean;
  CanDeleteTickets: boolean;
  CanAssignTickets: boolean;
  CanCreateTaskFromTicket: boolean;
  CanPlanTasks: boolean;
  CanViewOthersPlanning: boolean;
  CanViewApplications: boolean;
  CanManageApplications: boolean;
  CanCreateApplications: boolean;
  CanDeleteApplications: boolean;
  CanManageReleases: boolean;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface UserPermissions {
  canViewDashboard: boolean;
  canViewPlanning: boolean;
  canViewProjects: boolean;
  canManageProjects: boolean;
  canCreateProjects: boolean;
  canDeleteProjects: boolean;
  canViewTasks: boolean;
  canManageTasks: boolean;
  canCreateTasks: boolean;
  canDeleteTasks: boolean;
  canAssignTasks: boolean;
  canManageTimeEntries: boolean;
  canViewReports: boolean;
  canManageOrganizations: boolean;
  canViewCustomers: boolean;
  canManageCustomers: boolean;
  canCreateCustomers: boolean;
  canDeleteCustomers: boolean;
  canManageUsers: boolean;
  canManageTickets: boolean;
  canCreateTickets: boolean;
  canDeleteTickets: boolean;
  canAssignTickets: boolean;
  canCreateTaskFromTicket: boolean;
  canPlanTasks: boolean;
  canViewOthersPlanning: boolean;
  canViewApplications: boolean;
  canManageApplications: boolean;
  canCreateApplications: boolean;
  canDeleteApplications: boolean;
  canManageReleases: boolean;
}

export const getRolePermissions = async (token: string): Promise<RolePermission[]> => {
  const response = await fetch(`${API_URL}/api/role-permissions`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch role permissions');
  }

  const result = await response.json();
  return result.data;
};

export const getRolePermission = async (
  token: string,
  roleName: string
): Promise<RolePermission> => {
  const response = await fetch(`${API_URL}/api/role-permissions/${roleName}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch role permission');
  }

  const result = await response.json();
  return result.data;
};

export const updateRolePermission = async (
  token: string,
  roleName: string,
  permissions: Partial<RolePermission>
): Promise<void> => {
  const response = await fetch(`${API_URL}/api/role-permissions/${roleName}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(permissions),
  });

  if (!response.ok) {
    throw new Error('Failed to update role permissions');
  }
};

export const getUserPermissions = async (
  token: string,
  userId: number
): Promise<UserPermissions> => {
  const response = await fetch(`${API_URL}/api/role-permissions/user/${userId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user permissions');
  }

  const result = await response.json();
  return result.data;
};
