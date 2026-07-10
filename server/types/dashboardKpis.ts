export interface KpiDetailItem {
  id: number;
  label: string;
  value: number | string;
  drillDownType?: string;
  drillDownId?: number;
}

export interface DashboardWidgetConfig {
  id: string;
  type: string;
  title?: string;
  reportId?: number;
  pivotConfig?: Record<string, unknown>;
}
