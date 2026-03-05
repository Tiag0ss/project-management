import { getApiUrl } from './config';

const API_BASE_URL = getApiUrl();

export interface ProjectMilestone {
  Id: number;
  ProjectId: number;
  MilestoneTypeId: number | null;
  MilestoneTypeName?: string | null;
  MilestoneTypeIconSvg?: string | null;
  MilestoneTypeColor?: string | null;
  Name: string;
  Description?: string | null;
  DueDate?: string | null;
  IsCompleted: number;
  CompletedAt?: string | null;
  SortOrder: number;
  CreatedBy: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface SaveProjectMilestoneData {
  projectId?: number;
  milestoneTypeId?: number | null;
  name: string;
  description?: string;
  dueDate?: string;
  isCompleted?: boolean;
  sortOrder?: number;
}

export const projectMilestonesApi = {
  async getByProject(projectId: number, token: string): Promise<{ success: boolean; milestones: ProjectMilestone[] }> {
    const response = await fetch(`${API_BASE_URL}/api/project-milestones/project/${projectId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch project milestones');
    }

    return data;
  },

  async create(data: SaveProjectMilestoneData & { projectId: number }, token: string): Promise<{ success: boolean; milestoneId: number }> {
    const response = await fetch(`${API_BASE_URL}/api/project-milestones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Failed to create project milestone');
    }

    return result;
  },

  async update(id: number, data: SaveProjectMilestoneData, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/project-milestones/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Failed to update project milestone');
    }

    return result;
  },

  async delete(id: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/project-milestones/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Failed to delete project milestone');
    }

    return result;
  },
};
