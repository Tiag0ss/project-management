import { getApiUrl } from '@/lib/api/config';
import {
  TaskFieldVisibilityConfig,
  normalizeTaskFieldVisibility,
} from '@/lib/taskFieldVisibility';

export type TaskFieldVisibilitySource = 'user' | 'organization' | 'global';

export interface TaskFieldVisibilityResponse extends TaskFieldVisibilityConfig {
  lockedFields: string[];
  lockedTabs: string[];
  source?: TaskFieldVisibilitySource;
  hasUserOverride?: boolean;
}

async function parseResponse(response: Response): Promise<{
  success: boolean;
  data?: TaskFieldVisibilityResponse;
  message?: string;
}> {
  const json = await response.json();
  if (!response.ok || !json.success) {
    return { success: false, message: json.message || 'Request failed' };
  }
  const normalized = normalizeTaskFieldVisibility(json.data);
  return {
    success: true,
    data: {
      ...normalized,
      lockedFields: json.data?.lockedFields || [],
      lockedTabs: json.data?.lockedTabs || [],
      source: json.data?.source,
      hasUserOverride: json.data?.hasUserOverride,
    },
    message: json.message,
  };
}

export const taskFieldVisibilityApi = {
  async getGlobal(token: string) {
    const response = await fetch(`${getApiUrl()}/api/task-field-visibility/global`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseResponse(response);
  },

  async updateGlobal(token: string, config: TaskFieldVisibilityConfig) {
    const response = await fetch(`${getApiUrl()}/api/task-field-visibility/global`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    return parseResponse(response);
  },

  async getOrganization(orgId: number, token: string) {
    const response = await fetch(
      `${getApiUrl()}/api/task-field-visibility/organization/${orgId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return parseResponse(response);
  },

  async updateOrganization(orgId: number, token: string, config: TaskFieldVisibilityConfig) {
    const response = await fetch(
      `${getApiUrl()}/api/task-field-visibility/organization/${orgId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      }
    );
    return parseResponse(response);
  },

  async syncOrganizationFromGlobal(orgId: number, token: string) {
    const response = await fetch(
      `${getApiUrl()}/api/task-field-visibility/organization/${orgId}/sync-from-global`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return parseResponse(response);
  },

  async getEffective(orgId: number, token: string) {
    const response = await fetch(
      `${getApiUrl()}/api/task-field-visibility/effective/${orgId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return parseResponse(response);
  },

  async getMine(orgId: number, token: string) {
    const response = await fetch(
      `${getApiUrl()}/api/task-field-visibility/me/organization/${orgId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return parseResponse(response);
  },

  async updateMine(orgId: number, token: string, config: TaskFieldVisibilityConfig) {
    const response = await fetch(
      `${getApiUrl()}/api/task-field-visibility/me/organization/${orgId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      }
    );
    return parseResponse(response);
  },

  async clearMine(orgId: number, token: string) {
    const response = await fetch(
      `${getApiUrl()}/api/task-field-visibility/me/organization/${orgId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return parseResponse(response);
  },
};
