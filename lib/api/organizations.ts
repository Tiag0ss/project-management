import { getApiUrl } from './config';

const API_BASE_URL = getApiUrl();

export interface Organization {
  Id: number;
  Name: string;
  Abbreviation?: string;
  Description?: string;
  CreatedBy: number;
  CreatorName?: string;
  Role: string;
  PermissionGroupId?: number;
  MemberCount?: number;
  ProjectCount?: number;
  OpenTickets?: number;
  TotalTasks?: number;
  CompletedTasks?: number;
  ActiveProjects?: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface OrganizationMember {
  Id: number;
  OrganizationId: number;
  UserId: number;
  Username: string;
  Email: string;
  Role: string;
  PermissionGroupId?: number;
  GroupName?: string;
  JoinedAt: string;
}

export interface CreateOrganizationData {
  name: string;
  abbreviation?: string;
  description?: string;
}

export interface AddMemberData {
  userEmail: string;
  role?: string;
  permissionGroupId?: number;
}

export const organizationsApi = {
  async getAll(token: string): Promise<{ success: boolean; organizations: Organization[] }> {
    const response = await fetch(`${API_BASE_URL}/api/organizations`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch organizations');
    }

    return data;
  },

  async getById(id: number, token: string): Promise<{ success: boolean; organization: Organization }> {
    const response = await fetch(`${API_BASE_URL}/api/organizations/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch organization');
    }

    return data;
  },

  async create(orgData: CreateOrganizationData, token: string): Promise<{ success: boolean; organizationId: number }> {
    const response = await fetch(`${API_BASE_URL}/api/organizations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orgData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create organization');
    }

    return data;
  },

  async update(id: number, orgData: CreateOrganizationData, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/organizations/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orgData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update organization');
    }

    return data;
  },

  async delete(id: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/organizations/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to delete organization');
    }

    return data;
  },

  async getMembers(id: number, token: string): Promise<{ success: boolean; members: OrganizationMember[] }> {
    const response = await fetch(`${API_BASE_URL}/api/organizations/${id}/members`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch members');
    }

    return data;
  },

  async addMember(id: number, memberData: AddMemberData, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/organizations/${id}/members`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(memberData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to add member');
    }

    return data;
  },

  async updateMember(orgId: number, memberId: number, memberData: Partial<AddMemberData>, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/organizations/${orgId}/members/${memberId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(memberData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update member');
    }

    return data;
  },

  async removeMember(orgId: number, memberId: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/organizations/${orgId}/members/${memberId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to remove member');
    }

    return data;
  },
};
