import { getApiUrl } from './config';

const API_URL = getApiUrl();

export interface Tag {
  Id: number;
  OrganizationId: number;
  Name: string;
  Color: string;
  Description?: string;
  CreatedBy: number;
  CreatedAt: string;
  FirstName?: string;
  LastName?: string;
  Username?: string;
  AddedAt?: string; // When used with TaskTags
}

export const tagsApi = {
  // Get all tags for an organization
  getByOrganization: async (organizationId: number, token: string): Promise<{ tags: Tag[] }> => {
    const response = await fetch(`${API_URL}/api/tags/organization/${organizationId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch tags');
    }
    
    return response.json();
  },

  // Get tags for a specific task
  getByTask: async (taskId: number, token: string): Promise<{ tags: Tag[] }> => {
    const response = await fetch(`${API_URL}/api/tags/task/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch task tags');
    }
    
    return response.json();
  },

  // Create a new tag
  create: async (data: { organizationId: number; name: string; color?: string; description?: string }, token: string) => {
    const response = await fetch(`${API_URL}/api/tags`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.message || 'Failed to create tag');
    }
    
    return response.json();
  },

  // Update a tag
  update: async (id: number, data: { name: string; color?: string; description?: string }, token: string) => {
    const response = await fetch(`${API_URL}/api/tags/${id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.message || 'Failed to update tag');
    }
    
    return response.json();
  },

  // Delete a tag
  delete: async (id: number, token: string) => {
    const response = await fetch(`${API_URL}/api/tags/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete tag');
    }
    
    return response.json();
  },

  // Add a tag to a task
  addToTask: async (taskId: number, tagId: number, token: string) => {
    const response = await fetch(`${API_URL}/api/tags/task/${taskId}/tag/${tagId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to add tag to task');
    }
    
    return response.json();
  },

  // Remove a tag from a task
  removeFromTask: async (taskId: number, tagId: number, token: string) => {
    const response = await fetch(`${API_URL}/api/tags/task/${taskId}/tag/${tagId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to remove tag from task');
    }
    
    return response.json();
  },

  // Bulk update tags for a task
  updateTaskTags: async (taskId: number, tagIds: number[], token: string) => {
    const response = await fetch(`${API_URL}/api/tags/task/${taskId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tagIds }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to update task tags');
    }
    
    return response.json();
  },
};
