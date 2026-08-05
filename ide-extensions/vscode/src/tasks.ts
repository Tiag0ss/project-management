export interface PmTask {
  Id: number;
  ProjectId: number;
  OrganizationId?: number;
  ProjectName?: string;
  TaskName: string;
  Description?: string | null;
  /** Task status value id (`Tasks.Status`) */
  Status?: number | null;
  StatusName?: string;
  StatusColor?: string;
  StatusIsClosed?: number | boolean;
  StatusIsCancelled?: number | boolean;
  StatusIsInProgress?: number | boolean;
  StatusHideFromPlanningAndStatistics?: number | boolean;
  PriorityName?: string;
  PriorityColor?: string;
  PrioritySortOrder?: number;
  TaskTypeName?: string;
  TaskTypeColor?: string;
  DisplayOrder?: number;
  DueDate?: string | null;
}
