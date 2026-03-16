# AI Assistant Database Views (Optional Optimization)

These views are **optional** but recommended to simplify `server/routes/aiAssistant.ts` and improve performance/maintainability.

> Important: run these commands manually in your DB environment.
> They are read-only views and do not change table schemas.

## MySQL

### 1) Project open tasks with allocation facts

```sql
CREATE OR REPLACE VIEW vAI_ProjectOpenTasks AS
SELECT
  p.OrganizationId,
  p.Id AS ProjectId,
  p.ProjectName,
  t.Id AS TaskId,
  t.TaskName,
  t.AssignedTo AS UserId,
  t.DueDate,
  COALESCE(tsv.StatusName, '(No Status)') AS StatusName,
  COALESCE(tsv.IsClosed, 0) AS IsClosed,
  COALESCE(tsv.IsCancelled, 0) AS IsCancelled,
  ta.AllocationDate,
  COALESCE(ta.AllocatedHours, 0) AS AllocatedHours
FROM Tasks t
INNER JOIN Projects p ON t.ProjectId = p.Id
LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
LEFT JOIN TaskAllocations ta ON ta.TaskId = t.Id;
```

### 2) User open tasks with allocation facts

```sql
CREATE OR REPLACE VIEW vAI_UserOpenTasks AS
SELECT
  p.OrganizationId,
  t.AssignedTo AS UserId,
  t.Id AS TaskId,
  t.TaskName,
  p.ProjectName,
  t.DueDate,
  COALESCE(tsv.StatusName, '(No Status)') AS StatusName,
  COALESCE(tsv.IsClosed, 0) AS IsClosed,
  COALESCE(tsv.IsCancelled, 0) AS IsCancelled,
  ta.AllocationDate,
  COALESCE(ta.AllocatedHours, 0) AS AllocatedHours
FROM Tasks t
INNER JOIN Projects p ON t.ProjectId = p.Id
LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
LEFT JOIN TaskAllocations ta ON ta.TaskId = t.Id
WHERE t.AssignedTo IS NOT NULL;
```

### 3) User workload base view

```sql
CREATE OR REPLACE VIEW vAI_UserWorkloadBase AS
SELECT
  om.OrganizationId,
  u.Id AS UserId,
  u.Username,
  u.FirstName,
  u.LastName,
  u.IsActive,
  u.IsManager,
  u.IsDeveloper,
  u.IsSupport,
  t.Id AS TaskId,
  COALESCE(tsv.IsClosed, 0) AS IsClosed,
  COALESCE(tsv.IsCancelled, 0) AS IsCancelled,
  te.WorkDate,
  COALESCE(te.Hours, 0) AS WorkedHours
FROM Users u
INNER JOIN OrganizationMembers om ON om.UserId = u.Id
LEFT JOIN Tasks t ON t.AssignedTo = u.Id
LEFT JOIN Projects p ON t.ProjectId = p.Id AND p.OrganizationId = om.OrganizationId
LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
LEFT JOIN TimeEntries te ON te.UserId = u.Id AND te.TaskId = t.Id;
```

## MSSQL (SQL Server)

### 1) Project open tasks with allocation facts

```sql
CREATE OR ALTER VIEW vAI_ProjectOpenTasks AS
SELECT
  p.OrganizationId,
  p.Id AS ProjectId,
  p.ProjectName,
  t.Id AS TaskId,
  t.TaskName,
  t.AssignedTo AS UserId,
  t.DueDate,
  COALESCE(tsv.StatusName, '(No Status)') AS StatusName,
  COALESCE(tsv.IsClosed, 0) AS IsClosed,
  COALESCE(tsv.IsCancelled, 0) AS IsCancelled,
  ta.AllocationDate,
  COALESCE(ta.AllocatedHours, 0) AS AllocatedHours
FROM Tasks t
INNER JOIN Projects p ON t.ProjectId = p.Id
LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
LEFT JOIN TaskAllocations ta ON ta.TaskId = t.Id;
```

### 2) User open tasks with allocation facts

```sql
CREATE OR ALTER VIEW vAI_UserOpenTasks AS
SELECT
  p.OrganizationId,
  t.AssignedTo AS UserId,
  t.Id AS TaskId,
  t.TaskName,
  p.ProjectName,
  t.DueDate,
  COALESCE(tsv.StatusName, '(No Status)') AS StatusName,
  COALESCE(tsv.IsClosed, 0) AS IsClosed,
  COALESCE(tsv.IsCancelled, 0) AS IsCancelled,
  ta.AllocationDate,
  COALESCE(ta.AllocatedHours, 0) AS AllocatedHours
FROM Tasks t
INNER JOIN Projects p ON t.ProjectId = p.Id
LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
LEFT JOIN TaskAllocations ta ON ta.TaskId = t.Id
WHERE t.AssignedTo IS NOT NULL;
```

### 3) User workload base view

```sql
CREATE OR ALTER VIEW vAI_UserWorkloadBase AS
SELECT
  om.OrganizationId,
  u.Id AS UserId,
  u.Username,
  u.FirstName,
  u.LastName,
  u.IsActive,
  u.IsManager,
  u.IsDeveloper,
  u.IsSupport,
  t.Id AS TaskId,
  COALESCE(tsv.IsClosed, 0) AS IsClosed,
  COALESCE(tsv.IsCancelled, 0) AS IsCancelled,
  te.WorkDate,
  COALESCE(te.Hours, 0) AS WorkedHours
FROM Users u
INNER JOIN OrganizationMembers om ON om.UserId = u.Id
LEFT JOIN Tasks t ON t.AssignedTo = u.Id
LEFT JOIN Projects p ON t.ProjectId = p.Id AND p.OrganizationId = om.OrganizationId
LEFT JOIN TaskStatusValues tsv ON t.Status = tsv.Id
LEFT JOIN TimeEntries te ON te.UserId = u.Id AND te.TaskId = t.Id;
```

## Suggested next refactor in `aiAssistant.ts`

1. Read from `vAI_ProjectOpenTasks` for project-specific open-task answers.
2. Read from `vAI_UserOpenTasks` for user-specific open-task answers.
3. Read from `vAI_UserWorkloadBase` for team workload summaries.
4. Keep current SQL as fallback if a view is not available.

This keeps behavior stable while enabling gradual migration.
