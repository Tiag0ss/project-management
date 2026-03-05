import { getApiUrl } from './config';

const API_BASE_URL = getApiUrl();

export interface WorkflowTransitionPolicy {
  Id: number;
  OrganizationId: number;
  FromStatusId: number;
  ToStatusId: number;
  FromStatusName?: string;
  ToStatusName?: string;
  PolicyName: string;
  RuleType: string;
  RequireDescription: number;
  RequireAssignee: number;
  RequireDueDate: number;
  RequireEstimatedHours: number;
  RequireStoryPoints: number;
  RequirePlannedDates: number;
  IsActive: number;
  CreatedBy?: number;
  CreatedByUsername?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
}

export interface UpsertWorkflowTransitionPolicyData {
  organizationId: number;
  fromStatusId: number;
  toStatusId: number;
  policyName?: string;
  ruleType?: string;
  requireDescription?: boolean;
  requireAssignee?: boolean;
  requireDueDate?: boolean;
  requireEstimatedHours?: boolean;
  requireStoryPoints?: boolean;
  requirePlannedDates?: boolean;
  isActive?: boolean;
}

export const workflowTransitionPoliciesApi = {
  async getByOrganization(orgId: number, token: string): Promise<{ success: boolean; policies: WorkflowTransitionPolicy[] }> {
    const response = await fetch(`${API_BASE_URL}/api/workflow-transition-policies/organization/${orgId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch workflow transition policies');
    }

    return data;
  },

  async create(policyData: UpsertWorkflowTransitionPolicyData, token: string): Promise<{ success: boolean; id: number }> {
    const response = await fetch(`${API_BASE_URL}/api/workflow-transition-policies`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(policyData),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create workflow transition policy');
    }

    return data;
  },

  async update(id: number, policyData: Partial<UpsertWorkflowTransitionPolicyData>, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/workflow-transition-policies/${id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(policyData),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update workflow transition policy');
    }

    return data;
  },

  async delete(id: number, token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/workflow-transition-policies/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to delete workflow transition policy');
    }

    return data;
  },
};
