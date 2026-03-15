import { getApiUrl } from './config';

const API_BASE_URL = getApiUrl();

export interface TaskAssignee {
  UserId: number;
  Username: string;
  FirstName?: string;
  LastName?: string;
  AssignedAt?: string;
}

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
  TaskType?: number | null;
  TaskTypeName?: string;
  TaskTypeColor?: string;
  AssignedTo?: number;
  AssigneeName?: string;
  Assignees?: TaskAssignee[];
  DueDate?: string;
  DueDateMandatory?: number;
  UnscheduledWork?: number;
  EstimatedHours?: number;
  StoryPoints?: number;
  PlannedHours?: number;
  WorkedHours?: number;
  ParentTaskId?: number;
  DisplayOrder: number;
  PlannedStartDate?: string;
  PlannedEndDate?: string;
  BaselineStartDate?: string;
  BaselineEndDate?: string;
  DependsOnTaskId?: number;
  DependsOnTaskName?: string;
  TicketId?: number;
  TicketIdRef?: number;
  TicketNumber?: string;
  TicketTitle?: string;
  CustomerId?: number | null;
  CustomerName?: string | null;
  ExternalTicketId?: string | null;
  JiraUrl?: string | null;
  ExternalIssueId?: string | null;
  JiraIssueKey?: string | null;
  GitHubIssueNumber?: number | null;
  GiteaIssueNumber?: number | null;
  ApplicationId?: number | null;
  ApplicationName?: string | null;
  ReleaseVersionId?: number | null;
  ReleaseVersionNumber?: string | null;
  CreatedBy: number;
  CreatorName?: string;
  CompletionPercentage?: number;
  CreatedAt: string;
  UpdatedAt: string;
  ClosedAt?: string | null;
}

export interface CreateTaskData {
  projectId: number;
  taskName: string;
  description?: string;
  status?: number | null;
  priority?: number | null;
  taskType?: number | null;
  assignedTo?: number;
  dueDate?: string;
  dueDateMandatory?: boolean;
  unscheduledWork?: boolean;
  estimatedHours?: number;
  storyPoints?: number;
  parentTaskId?: number;
  displayOrder?: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  dependsOnTaskId?: number;
  ticketId?: number;
  customerId?: number | null;
  jiraIssueKey?: string;
  gitHubIssueNumber?: number | null;
  giteaIssueNumber?: number | null;
  applicationId?: number | null;
  releaseVersionId?: number | null;
  syncAllocationHeaderDates?: boolean;
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

  async reorderKanban(
    updates: Array<{ taskId: number; displayOrder: number; status?: number }>,
    token: string
  ): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/reorder-kanban`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ updates }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to reorder');
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

  async getAssignees(taskId: number, token: string): Promise<{ success: boolean; assignees: TaskAssignee[] }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/assignees`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to fetch assignees');
    return data;
  },

  async addAssignee(taskId: number, assigneeUserId: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/assignees`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeUserId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to add assignee');
    return data;
  },

  async removeAssignee(taskId: number, assigneeUserId: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/assignees/${assigneeUserId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to remove assignee');
    return data;
  },

  async delete(id: number, token: string, options?: { deleteSubtasks?: boolean }): Promise<{ success: boolean }> {
    const query = options?.deleteSubtasks === undefined
      ? ''
      : `?deleteSubtasks=${options.deleteSubtasks ? '1' : '0'}`;

    const response = await fetch(`${API_BASE_URL}/api/tasks/${id}${query}`, {
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
