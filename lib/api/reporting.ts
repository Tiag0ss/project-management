import { getApiUrl } from './config';

const API_BASE_URL = getApiUrl();

async function reportingFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}`);
  }
  return data as T;
}

export type ReportingAccessInfo = {
  canAccessHub: boolean;
  canAccessManagerPacks: boolean;
  canAccessCapacity: boolean;
  canAccessExplore: boolean;
  canViewBudgetInfo: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isCustomerUser: boolean;
};

export type DeltaMetric = {
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

export const reportingApi = {
  getAccess(token: string) {
    return reportingFetch<{ success: boolean; data: ReportingAccessInfo }>('/api/reporting/access', token);
  },
  getMyWork(token: string, from: string, to: string) {
    const qs = new URLSearchParams({ from, to });
    return reportingFetch<{ success: boolean; data: any }>(`/api/reporting/my-work?${qs}`, token);
  },
  getOrganizationOverview(
    token: string,
    params: { organizationId: number; from: string; to: string; projectId?: number | null }
  ) {
    const qs = new URLSearchParams({
      organizationId: String(params.organizationId),
      from: params.from,
      to: params.to,
    });
    if (params.projectId) qs.set('projectId', String(params.projectId));
    return reportingFetch<{ success: boolean; data: any }>(`/api/reporting/organization-overview?${qs}`, token);
  },
  getPortfolio(token: string, organizationId: number) {
    return reportingFetch<{ success: boolean; data: any }>(
      `/api/reporting/portfolio?organizationId=${organizationId}`,
      token
    );
  },
  getCapacity(token: string, organizationId: number, from: string, to: string) {
    const qs = new URLSearchParams({
      organizationId: String(organizationId),
      from,
      to,
    });
    return reportingFetch<{ success: boolean; data: any }>(`/api/reporting/capacity?${qs}`, token);
  },
  getDelivery(
    token: string,
    params: { organizationId: number; from: string; to: string; projectId?: number | null }
  ) {
    const qs = new URLSearchParams({
      organizationId: String(params.organizationId),
      from: params.from,
      to: params.to,
    });
    if (params.projectId) qs.set('projectId', String(params.projectId));
    return reportingFetch<{ success: boolean; data: any }>(`/api/reporting/delivery?${qs}`, token);
  },
  getDataQuality(token: string, organizationId: number, projectId?: number | null) {
    const qs = new URLSearchParams({ organizationId: String(organizationId) });
    if (projectId) qs.set('projectId', String(projectId));
    return reportingFetch<{ success: boolean; data: any }>(`/api/reporting/data-quality?${qs}`, token);
  },
  getDigests(token: string, organizationId: number) {
    return reportingFetch<{ success: boolean; data: any[] }>(
      `/api/reporting/digests?organizationId=${organizationId}`,
      token
    );
  },
  async createDigest(
    token: string,
    body: {
      organizationId: number;
      frequency: 'weekly' | 'monthly';
      recipients: string;
      dayOfWeek?: number;
      dayOfMonth?: number;
    }
  ) {
    const response = await fetch(`${API_BASE_URL}/api/reporting/digests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
    return data;
  },
  async deleteDigest(token: string, id: number) {
    const response = await fetch(`${API_BASE_URL}/api/reporting/digests/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
    return data;
  },
};
