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
