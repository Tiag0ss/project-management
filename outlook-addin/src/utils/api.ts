import { storage } from './storage';

const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${storage.getApiToken()}`,
});

const endpoint = (path: string) => `${storage.getEndpoint()}${path}`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(endpoint(path), {
    ...options,
    headers: { ...headers(), ...(options?.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

export interface Organization {
  Id: number;
  Name: string;
}

export interface Project {
  Id: number;
  ProjectName: string;
  Status: string;
  OrganizationId: number;
}

export interface TaskStatus {
  Id: number;
  StatusName: string;
  IsDefault: number;
  Color: string;
}

export interface TaskPriority {
  Id: number;
  PriorityName: string;
  IsDefault: number;
  Color: string;
}

export interface OrgUser {
  Id: number;
  Username: string;
  Email: string;
  FirstName: string;
  LastName: string;
}

export interface CreateTaskPayload {
  projectId: number;
  taskName: string;
  description?: string;
  status?: number | null;
  priority?: number | null;
  assignedTo?: number | null;
  estimatedHours?: number | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
}

// Test connection by fetching current user
export async function testConnection(): Promise<{ username: string; email: string }> {
  const data = await request<any>('/api/user/profile');
  return { username: data.username || data.Username, email: data.email || data.Email };
}

// Fetch organizations the user belongs to
export async function getOrganizations(): Promise<Organization[]> {
  const data = await request<any>('/api/organizations');
  return data.organizations || data.data || data || [];
}

// Fetch projects for an organization
export async function getProjects(organizationId: number): Promise<Project[]> {
  const data = await request<any>(`/api/projects?organizationId=${organizationId}`);
  return data.projects || data.data || data || [];
}

// Fetch task statuses for an organization
export async function getTaskStatuses(organizationId: number): Promise<TaskStatus[]> {
  const data = await request<any>(`/api/status-values/task-statuses/${organizationId}`);
  return data.statuses || data.data || data || [];
}

// Fetch task priorities for an organization
export async function getTaskPriorities(organizationId: number): Promise<TaskPriority[]> {
  const data = await request<any>(`/api/status-values/task-priorities/${organizationId}`);
  return data.priorities || data.data || data || [];
}

// Fetch members of an organization (for assignee)
export async function getOrgUsers(organizationId: number): Promise<OrgUser[]> {
  const data = await request<any>(`/api/organizations/${organizationId}/members`);
  return data.members || data.data || data || [];
}

// Create a task
export async function createTask(payload: CreateTaskPayload): Promise<{ id: number; taskName: string }> {
  const data = await request<any>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      projectId: payload.projectId,
      taskName: payload.taskName,
      description: payload.description || '',
      status: payload.status ?? null,
      priority: payload.priority ?? null,
      assignedTo: payload.assignedTo ?? null,
      estimatedHours: payload.estimatedHours ?? null,
      plannedStartDate: payload.plannedStartDate ?? null,
      plannedEndDate: payload.plannedEndDate ?? null,
    }),
  });
  return { id: data.task?.Id || data.id, taskName: payload.taskName };
}
