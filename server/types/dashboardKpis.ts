export interface KpiDetailItem {
  id: number;
  label: string;
  value: number | string;
  drillDownType?: string;
  drillDownId?: number;
}
