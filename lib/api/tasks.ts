import { getApiUrl } from './config';

const API_BASE_URL = getApiUrl();

export interface Task {
  Id: number;
  ProjectId: number;
  ProjectName?: string;
  TaskName: string;
  Description?: string;
  Status: number | null;
  StatusName?: string;
  StatusColor?: string;
  StatusIsClosed?: number;
  StatusIsCancelled?: number;
  Priority: number | null;
  PriorityName?: string;
  PriorityColor?: string;
  AssignedTo?: number;
  AssigneeName?: string;
  DueDate?: string;
  EstimatedHours?: number;
  PlannedHours?: number;
  WorkedHours?: number;
  ParentTaskId?: number;
  DisplayOrder: number;
  PlannedStartDate?: string;
  PlannedEndDate?: string;
  DependsOnTaskId?: number;
  DependsOnTaskName?: string;
  TicketId?: number;
  TicketIdRef?: number;
  TicketNumber?: string;
  TicketTitle?: string;
  CreatedBy: number;
  CreatorName?: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface CreateTaskData {
  projectId: number;
  taskName: string;
  description?: string;
  status?: number | null;
  priority?: number | null;
  assignedTo?: number;
  dueDate?: string;
  estimatedHours?: number;
  parentTaskId?: number;
  displayOrder?: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  dependsOnTaskId?: number;
  ticketId?: number;
}

export const tasksApi = {
  async getByProject(projectId: number, token: string): Promise<{ success: boolean; tasks: Task[] }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/project/${projectId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch tasks');
    }

    return data;
  },

  async getByTicket(ticketId: number, token: string): Promise<{ success: boolean; tasks: Task[] }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/ticket/${ticketId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch tasks');
    }

    return data;
  },

  async create(taskData: CreateTaskData, token: string): Promise<{ success: boolean; taskId: number }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create task');
    }

    return data;
  },

  async update(id: number, taskData: Partial<CreateTaskData>, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskData),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update task');
    }

    return data;
  },

  async updateOrder(taskId: number, displayOrder: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/order`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ displayOrder }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update task order');
    }

    return data;
  },

  async delete(id: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Failed to delete task');
    }

    return data;
  },
};
