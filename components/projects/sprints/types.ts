export interface Sprint {
  Id: number;
  ProjectId: number;
  Name: string;
  Goal: string | null;
  StartDate: string | null;
  EndDate: string | null;
  Status: 'planned' | 'active' | 'completed' | 'cancelled';
  Velocity: number | null;
  TotalTasks: number;
  CompletedTasks: number;
  TotalEstimatedHours: number;
  TotalStoryPoints: number;
  CompletedHours: number;
  CompletedStoryPoints: number;
}

export interface BacklogTask {
  Id: number;
  ParentTaskId: number | null;
  TaskName: string;
  EstimatedHours: number | null;
  StoryPoints: number | null;
  TotalAllocatedHours: number | null;
  PlannedStartDate: string | null;
  PlannedEndDate: string | null;
  DueDate: string | null;
  StatusName: string;
  StatusColor: string;
  PriorityName: string;
  PriorityColor: string;
  AssigneeName: string | null;
  FirstName: string | null;
  LastName: string | null;
}

export interface RetrospectiveActionItem {
  Id: number;
  SprintId: number;
  SprintName?: string;
  Title: string;
  Description?: string | null;
  OwnerUserId?: number | null;
  OwnerUsername?: string | null;
  OwnerFirstName?: string | null;
  OwnerLastName?: string | null;
  DueDate?: string | null;
  IsClosed: number;
  ClosedAt?: string | null;
}

export interface RetrospectiveClosureBySprint {
  sprintId: number;
  sprintName: string;
  totalActions: number;
  closedActions: number;
  closureRate: number;
}

export interface VelocityTrendEntry {
  sprintId: number;
  sprintName: string;
  status: string;
  completedStoryPoints: number;
  committedStoryPoints: number;
  completionRate: number;
  teamBreakdown: Array<{ userId: number; username: string; fullName: string; completedStoryPoints: number }>;
}

export interface VelocitySummary {
  recentAverage: number;
  previousAverage: number;
  trendDelta: number;
  trendDirection: 'up' | 'down' | 'stable';
}

export type TaskFilterState = {
  search: string;
  status: string;
  priority: string;
  assignee: string;
};
