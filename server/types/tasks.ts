export interface TaskAssigneeRow {
  TaskId: number;
  UserId: number;
  Username: string;
  FirstName: string | null;
  LastName: string | null;
}

export interface TaskAssigneeSummary {
  UserId: number;
  Username: string;
  FirstName: string | null;
  LastName: string | null;
}

export interface TaskListRow {
  Id: number;
  ProjectId: number;
  TaskName: string;
  Status: number | null;
  Priority: number | null;
  TaskType: number | null;
  AssignedTo: number | null;
  ParentTaskId: number | null;
  DisplayOrder: number | null;
  EstimatedHours: number | null;
  AssigneesJson?: string;
  TaskTagsJson?: string;
}

export interface AllocationAvailabilityRow {
  TaskId: number;
  AllocationDate: string;
  totalAllocated: number;
  latestEndTime: string | null;
}
