import { getApiUrl } from './config';

const API_BASE_URL = getApiUrl();

export interface StatusValue {
  Id: number;
  OrganizationId: number;
  StatusName: string;
  PriorityName?: string; // For task priorities
  ColorCode?: string;
  SortOrder: number;
  IsDefault: number;
  IsClosed?: number;
  IsCancelled?: number;
  CreatedAt: string;
}

export interface CreateStatusValueData {
  organizationId: number;
  statusName: string;
  colorCode?: string;
  sortOrder?: number;
  isDefault?: boolean;
  isClosed?: boolean;
  isCancelled?: boolean;
}

export const statusValuesApi = {
  // Project Status Values
  async getProjectStatuses(orgId: number, token: string): Promise<{ success: boolean; statuses: StatusValue[] }> {
    const response = await fetch(`${API_BASE_URL}/api/status-values/project/${orgId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch project statuses');
    }

    return data;
  },

  async createProjectStatus(statusData: CreateStatusValueData, token: string): Promise<{ success: boolean; statusId: number }> {
    const response = await fetch(`${API_BASE_URL}/api/status-values/project`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(statusData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create project status');
    }

    return data;
  },

  async updateProjectStatus(id: number, statusData: Partial<CreateStatusValueData>, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/status-values/project/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(statusData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update project status');
    }

    return data;
  },

  async deleteProjectStatus(id: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/status-values/project/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to delete project status');
    }

    return data;
  },

  // Task Status Values
  async getTaskStatuses(orgId: number, token: string): Promise<{ success: boolean; statuses: StatusValue[] }> {
    const response = await fetch(`${API_BASE_URL}/api/status-values/task/${orgId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch task statuses');
    }

    return data;
  },

  async createTaskStatus(statusData: CreateStatusValueData, token: string): Promise<{ success: boolean; statusId: number }> {
    const response = await fetch(`${API_BASE_URL}/api/status-values/task`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(statusData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create task status');
    }

    return data;
  },

  async updateTaskStatus(id: number, statusData: Partial<CreateStatusValueData>, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/status-values/task/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(statusData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update task status');
    }

    return data;
  },

  async deleteTaskStatus(id: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/status-values/task/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to delete task status');
    }

    return data;
  },

  // Task Priority Values
  async getTaskPriorities(orgId: number, token: string): Promise<{ success: boolean; priorities: StatusValue[] }> {
    const response = await fetch(`${API_BASE_URL}/api/status-values/priority/${orgId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch task priorities');
    }

    return data;
  },

  async createTaskPriority(priorityData: CreateStatusValueData, token: string): Promise<{ success: boolean; priorityId: number }> {
    const response = await fetch(`${API_BASE_URL}/api/status-values/priority`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(priorityData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create task priority');
    }

    return data;
  },

  async updateTaskPriority(id: number, priorityData: CreateStatusValueData, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/status-values/priority/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(priorityData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update task priority');
    }

    return data;
  },

  async deleteTaskPriority(id: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/status-values/priority/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to delete task priority');
    }

    return data;
  },
};
