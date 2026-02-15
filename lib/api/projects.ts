import { getApiUrl } from './config';

const API_BASE_URL = getApiUrl();

export interface Project {
  Id: number;
  OrganizationId: number;
  OrganizationName?: string;
  ProjectName: string;
  Description?: string;
  Status: number | null;
  StatusName?: string;
  StatusColor?: string;
  StatusIsClosed?: number;
  StatusIsCancelled?: number;
  StartDate?: string;
  EndDate?: string;
  IsHobby?: boolean;
  CustomerId?: number;
  CustomerName?: string;
  JiraBoardId?: string | null;
  GitHubOwner?: string | null;
  GitHubRepo?: string | null;
  CreatedBy: number;
  CreatorName?: string;
  CreatedAt: string;
  UpdatedAt: string;
  TotalTasks?: number;
  CompletedTasks?: number;
  TotalEstimatedHours?: number;
  TotalWorkedHours?: number;
  OpenTickets?: number;
  UnplannedTasks?: number;
}

export interface CreateProjectData {
  organizationId: number;
  projectName: string;
  description?: string;
  status?: number | null;
  startDate?: string;
  endDate?: string;
  isHobby?: boolean;
  customerId?: number;
  jiraBoardId?: string;
  gitHubOwner?: string;
  gitHubRepo?: string;
}

export interface UpdateProjectData {
  projectName: string;
  description?: string;
  status?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  isHobby?: boolean;
  customerId?: number | null;
  jiraBoardId?: string | null;
  gitHubOwner?: string | null;
  gitHubRepo?: string | null;
}

export interface UpdateProjectDataWithId extends UpdateProjectData {
  id: number;
}

export const projectsApi = {
  async getAll(token: string): Promise<{ success: boolean; projects: Project[] }> {
    const response = await fetch(`${API_BASE_URL}/api/projects`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch projects');
    }

    return data;
  },

  async getById(id: number, token: string): Promise<{ success: boolean; project: Project }> {
    const response = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch project');
    }

    return data;
  },

  async create(projectData: CreateProjectData, token: string): Promise<{ success: boolean; projectId: number }> {
    const response = await fetch(`${API_BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(projectData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create project');
    }

    return data;
  },

  async update(id: number, projectData: UpdateProjectData, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(projectData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update project');
    }

    return data;
  },

  async delete(id: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to delete project');
    }

    return data;
  },

  async transfer(id: number, newOrganizationId: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/projects/${id}/transfer`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newOrganizationId }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to transfer project');
    }

    return data;
  },
};
