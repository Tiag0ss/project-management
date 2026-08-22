import { getApiUrl } from './config';
import { CustomFieldValues } from '@/lib/customFields';
import { getApiErrorMessageFromPayload } from '@/lib/api/httpErrors';

const API_BASE_URL = getApiUrl();

export interface TaskAssignee {
  UserId: number;
  Username: string;
  FirstName?: string;
  LastName?: string;
  AssignedAt?: string;
}

export interface TaskTag {
  Id: number;
  Name: string;
  Color?: string | null;
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
  StatusHideFromPlanningAndStatistics?: number | boolean;
  Priority: number | null;
  PriorityName?: string;
  PriorityColor?: string;
  PrioritySortOrder?: number | null;
  TaskType?: number | null;
  TaskTypeName?: string;
  TaskTypeIconSvg?: string;
  TaskTypeColor?: string;
  AssignedTo?: number;
  AssigneeName?: string;
  Assignees?: TaskAssignee[];
  TaskTags?: TaskTag[];
  DueDate?: string;
  DueDateMandatory?: number;
  UnscheduledWork?: number;
  EstimatedHours?: number;
  HourlyRate?: number | null;
  StoryPoints?: number;
  PlannedHours?: number;
  WorkedHours?: number;
  SprintId?: number | null;
  SprintName?: string | null;
  SprintStartDate?: string | null;
  SprintEndDate?: string | null;
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
  ProjectCustomerName?: string | null;
  ExternalTicketId?: string | null;
  JiraUrl?: string | null;
  ExternalIssueId?: string | null;
  JiraIssueKey?: string | null;
  GitHubIssueNumber?: number | null;
  GiteaIssueNumber?: number | null;
  SynapseVaultId?: number | null;
  SynapseNoteId?: number | null;
  SynapseMarkerId?: string | null;
  SynapseNoteUrl?: string | null;
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
  InProgressAt?: string | null;
  DoneTransitionsByDay?: Array<{
    date: string;
    count: number;
    startDate?: string | null;
  }>;
  [key: string]: unknown;
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
  hourlyRate?: number | null;
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
  synapseVaultId?: number | null;
  synapseNoteId?: number | null;
  synapseMarkerId?: string | null;
  synapseNoteUrl?: string | null;
  syncAllocationHeaderDates?: boolean;
  customFields?: CustomFieldValues;
}

export type UpdateTaskData = Omit<Partial<CreateTaskData>,
  'assignedTo' | 'estimatedHours' | 'storyPoints' | 'parentTaskId' | 'dependsOnTaskId' |
  'customerId' | 'gitHubIssueNumber' | 'giteaIssueNumber' | 'applicationId' |
  'releaseVersionId' | 'jiraIssueKey'
> & {
  assignedTo?: number | null;
  estimatedHours?: number | null;
  storyPoints?: number | null;
  parentTaskId?: number | null;
  dependsOnTaskId?: number | null;
  customerId?: number | null;
  gitHubIssueNumber?: number | null;
  giteaIssueNumber?: number | null;
  applicationId?: number | null;
  releaseVersionId?: number | null;
  jiraIssueKey?: string | null;
};

export const tasksApi = {
  async getById(id: number, token: string): Promise<{ success: boolean; task: Task }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch task');
    }

    return data;
  },

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

  async update(id: number, taskData: Partial<UpdateTaskData>, token: string): Promise<{ success: boolean }> {
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
      throw new Error(getApiErrorMessageFromPayload(data, 'Failed to update task'));
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
