# Task Import Template - README

## Overview
Use this CSV to import multiple tasks into the currently opened project.

## File Format
- **Encoding**: UTF-8
- **Delimiter**: Comma (,)
- **Extension**: .csv

## Current Supported Columns

| Column | Required | Type | Description |
|--------|----------|------|-------------|
| **TaskName** | Yes | Text | Task title. This must be unique inside the import file if it is referenced by parent/dependency columns. |
| **Description** | No | Text | Task description. |
| **Status** | No | Text | Status name from your organization (mapped in import modal). |
| **Priority** | No | Text | Priority name from your organization (mapped in import modal). |
| **AssignedToUsername** | No | Text | Username of assignee. Must exist in the system. |
| **DueDate** | No | Date | Due date in `YYYY-MM-DD`. |
| **EstimatedHours** | No | Decimal | Estimated effort in hours (dot decimal). |
| **ParentTaskName** | No | Text | Parent task name (must match another `TaskName` in the same CSV). |
| **PlannedStartDate** | No | Date | Planned start date in `YYYY-MM-DD`. |
| **PlannedEndDate** | No | Date | Planned end date in `YYYY-MM-DD`. |
| **DependsOnTaskName** | No | Text | Dependency task name (must match another `TaskName` in the same CSV). |

## ProjectId Behavior
- In the **Project Detail > Import Tasks from CSV** modal, you do **not** need `ProjectId` in the CSV.
- The frontend injects the current project id automatically before sending rows to the backend.

## Mapping Behavior (Important)
- `Status` and `Priority` values in CSV are names.
- During import, the modal maps those names to your organization’s internal IDs.
- Unmapped values must be fixed in the mapping UI before import.

## Parent/Dependency Resolution
- Parent/dependency links are resolved **after** tasks are created.
- `ParentTaskName` and `DependsOnTaskName` must exactly match a `TaskName` from the same file.
- Keep task names unique in the file to avoid ambiguous linking.

## Example

```csv
TaskName,Description,Status,Priority,AssignedToUsername,DueDate,EstimatedHours,ParentTaskName,PlannedStartDate,PlannedEndDate,DependsOnTaskName
Platform Setup,Initial setup and baseline configuration,To Do,High,john.doe,2026-03-20,8.0,,2026-03-10,2026-03-12,
API Foundation,Create core API endpoints,In Progress,Critical,jane.smith,2026-03-28,20.0,,2026-03-13,2026-03-20,Platform Setup
API Validation Tests,Implement endpoint tests,To Do,Medium,john.doe,2026-03-30,10.0,API Foundation,2026-03-21,2026-03-25,API Foundation
```

## Common Validation Errors
- `ProjectId and TaskName are required` (when not importing via project modal/API payload missing ProjectId)
- `User '<name>' not found`
- `Parent task '<name>' not found in import`
- `Dependency task '<name>' not found in import`

## Practical Tips
1. Start with 2-3 rows and confirm mapping before large imports.
2. Use exact usernames for `AssignedToUsername`.
3. Use `YYYY-MM-DD` dates and dot decimal for hours (e.g., `7.5`).
4. Keep parent/dependency names consistent and typo-free.
