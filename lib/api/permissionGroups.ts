import { getApiUrl } from './config';

const API_BASE_URL = getApiUrl();

export interface PermissionGroup {
  Id: number;
  OrganizationId: number;
  GroupName: string;
  Description?: string;
  CanManageProjects: number;
  CanCreateProjects: number;
  CanDeleteProjects: number;
  CanManageTasks: number;
  CanCreateTasks: number;
  CanDeleteTasks: number;
  CanAssignTasks: number;
  CanPlanTasks: number;
  CanManageTimeEntries: number;
  CanViewReports: number;
  CanManageTickets: number;
  CanCreateTickets: number;
  CanDeleteTickets: number;
  CanAssignTickets: number;
  CanCreateTaskFromTicket: number;
  CanManageMembers: number;
  CanManageSettings: number;
  LinkedRole?: string | null;
  IsSystemGroup?: number;
  MemberCount?: number;
  CreatedAt: string;
}

export interface CreatePermissionGroupData {
  organizationId: number;
  groupName: string;
  description?: string;
  canManageProjects: boolean;
  canCreateProjects: boolean;
  canDeleteProjects: boolean;
  canManageTasks: boolean;
  canCreateTasks: boolean;
  canDeleteTasks: boolean;
  canAssignTasks: boolean;
  canPlanTasks: boolean;
  canManageTimeEntries: boolean;
  canViewReports: boolean;
  canManageTickets: boolean;
  canCreateTickets: boolean;
  canDeleteTickets: boolean;
  canAssignTickets: boolean;
  canCreateTaskFromTicket: boolean;
  canManageMembers: boolean;
  canManageSettings: boolean;
}

export const permissionGroupsApi = {
  async getByOrganization(orgId: number, token: string): Promise<{ success: boolean; groups: PermissionGroup[] }> {
    const response = await fetch(`${API_BASE_URL}/api/permission-groups/organization/${orgId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch permission groups');
    }

    return data;
  },

  async create(groupData: CreatePermissionGroupData, token: string): Promise<{ success: boolean; groupId: number }> {
    const response = await fetch(`${API_BASE_URL}/api/permission-groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(groupData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create permission group');
    }

    return data;
  },

  async update(id: number, groupData: Partial<CreatePermissionGroupData>, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/permission-groups/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(groupData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update permission group');
    }

    return data;
  },

  async delete(id: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/permission-groups/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to delete permission group');
    }

    return data;
  },

  async syncFromGlobal(id: number, token: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/permission-groups/${id}/sync-from-global`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to sync permission group');
    }

    return data;
  },
};
