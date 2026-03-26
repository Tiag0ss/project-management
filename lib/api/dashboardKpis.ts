import { getApiUrl } from './config';

const API_URL = getApiUrl();

export type DashboardKpiType =
  | 'totalProjects'
  | 'myTasks'
  | 'myPendingTasks'
  | 'myCompletedTasks'
  | 'hoursThisWeek'
  | 'hoursThisMonth'
  | 'myTickets'
  | 'customersTotal'
  | 'organizationProjects'
  | 'organizationTasks'
  | 'organizationPendingTasks'
  | 'organizationCompletedTasks'
  | 'tasksByStatus'
  | 'tasksByPriority'
  | 'tasksByTag'
  | 'tasksFiltered'
  | 'overdueTasksFiltered'
  | 'blockedTasksFiltered'
  | 'unestimatedTasksFiltered'
  | 'reopenedTasksFiltered'
  | 'throughputThisWeek'
  | 'throughputThisMonth'
  | 'cycleTimeMedianDays'
  | 'leadTimeMedianDays'
  | 'ticketsSlaRisk';

export interface DashboardKpiWidget {
  id: string;
  type: DashboardKpiType;
  title?: string;
  organizationId?: number | null;
  statusValueId?: number | null;
  priorityValueId?: number | null;
  tagId?: number | null;
}

export interface DashboardKpiMetricValue {
  value: number;
  suffix?: string;
  subtitle?: string;
}

export interface DashboardKpiDetailItem {
  id: number;
  name: string;
  taskId?: number;
  projectId?: number;
  tags?: Array<{ name: string; color?: string | null }>;
  project?: string;
  customer?: string;
  status?: string;
  date?: string;
  hours?: number;
  isClosed?: boolean;
}

export interface DashboardKpiDetailResult {
  type: 'tasks' | 'projects' | 'customers' | 'tickets' | 'timeEntries' | 'unknown';
  items: DashboardKpiDetailItem[];
}

export interface DashboardKpiValuesResponse {
  values: Record<string, DashboardKpiMetricValue>;
  detailsByWidget: Record<string, DashboardKpiDetailResult>;
}

export interface DashboardKpiOptionOrganization {
  Id: number;
  Name: string;
}

export interface DashboardKpiOptionStatus {
  Id: number;
  StatusName: string;
  ColorCode: string | null;
}

export interface DashboardKpiOptionPriority {
  Id: number;
  PriorityName: string;
  ColorCode: string | null;
}

export interface DashboardKpiOptionTag {
  Id: number;
  Name: string;
  Color: string | null;
}

export interface DashboardKpiMetadata {
  organizations: DashboardKpiOptionOrganization[];
  statusesByOrganization: Record<string, DashboardKpiOptionStatus[]>;
  prioritiesByOrganization: Record<string, DashboardKpiOptionPriority[]>;
  tagsByOrganization: Record<string, DashboardKpiOptionTag[]>;
}

export async function getDashboardKpis(token: string): Promise<{ widgets: DashboardKpiWidget[]; hasCustomConfig: boolean; metadata: DashboardKpiMetadata }> {
  const response = await fetch(`${API_URL}/api/dashboard-kpis`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to load dashboard KPI configuration');
  }

  return {
    widgets: Array.isArray(data.widgets) ? data.widgets : [],
    hasCustomConfig: data.hasCustomConfig === true,
    metadata: {
      organizations: Array.isArray(data.metadata?.organizations) ? data.metadata.organizations : [],
      statusesByOrganization: data.metadata?.statusesByOrganization || {},
      prioritiesByOrganization: data.metadata?.prioritiesByOrganization || {},
      tagsByOrganization: data.metadata?.tagsByOrganization || {},
    },
  };
}

export async function saveDashboardKpis(token: string, widgets: DashboardKpiWidget[]): Promise<DashboardKpiWidget[]> {
  const response = await fetch(`${API_URL}/api/dashboard-kpis`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ widgets }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to save dashboard KPI configuration');
  }

  return Array.isArray(data.widgets) ? data.widgets : [];
}

export async function getDashboardKpiValues(
  token: string,
  widgets: DashboardKpiWidget[]
): Promise<DashboardKpiValuesResponse> {
  const response = await fetch(`${API_URL}/api/dashboard-kpis/values`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ widgets }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to load dashboard KPI values');
  }

  return {
    values: data.values || {},
    detailsByWidget: data.detailsByWidget || {},
  };
}
