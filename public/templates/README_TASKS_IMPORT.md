# Task Import Template - README

## Overview
This CSV template allows you to import multiple tasks into a project at once.

## File Format
- **Encoding**: UTF-8
- **Delimiter**: Comma (,)
- **Extension**: .csv

## Column Descriptions

| Column | Required | Type | Description | Example |
|--------|----------|------|-------------|---------|
| **TaskName** | Yes | Text | Name of the task (max 255 characters) | "Implement login feature" |
| **Description** | No | Text | Detailed description of the task | "Create login form with email and password validation" |
| **Status** | No | Text | Task status (default: "To Do") | To Do, In Progress, Done |
| **Priority** | No | Text | Task priority (default: "Medium") | Low, Medium, High, Critical |
| **AssignedToUsername** | No | Text | Username of the assigned user | john.doe |
| **DueDate** | No | Date | Due date in YYYY-MM-DD format | 2026-03-15 |
| **EstimatedHours** | No | Decimal | Estimated hours (max 2 decimal places) | 8.5 |
| **ParentTaskName** | No | Text | Name of parent task (for subtasks) | "Example Task 1" |
| **PlannedStartDate** | No | Date | Planned start date in YYYY-MM-DD format | 2026-02-10 |
| **PlannedEndDate** | No | Date | Planned end date in YYYY-MM-DD format | 2026-02-15 |
| **DependsOnTaskName** | No | Text | Name of task this depends on | "Example Task 1" |

## Important Notes

1. **TaskName**: This is the only required field besides ProjectId. Must be unique within the import file for dependency resolution.

2. **Status & Priority**: Use the exact values defined in your organization. The template shows common examples.

3. **AssignedToUsername**: Must match an existing username. Leave empty if unassigned.

4. **Parent Tasks & Dependencies**: 
   - Use the exact TaskName from within the same CSV file
   - Parent tasks and dependencies will be resolved after all tasks are created
   - Ensure parent tasks appear before their children in the CSV

5. **Date Format**: Always use YYYY-MM-DD format (e.g., 2026-03-15)

6. **Decimal Numbers**: Use dot (.) as decimal separator (e.g., 8.5, not 8,5)

## Example Usage

### Simple Tasks
```csv
TaskName,Description,Status,Priority,AssignedToUsername,DueDate,EstimatedHours
Setup Database,Create MySQL database and tables,To Do,High,admin,2026-03-01,4.0
Design UI,Create mockups for main pages,To Do,Medium,designer,2026-03-05,8.0
```

### Tasks with Dependencies
```csv
TaskName,Description,Status,Priority,AssignedToUsername,DueDate,EstimatedHours,DependsOnTaskName
Setup Database,Create MySQL database,To Do,High,admin,2026-03-01,4.0,
Create API,Build REST API endpoints,To Do,High,developer,2026-03-10,16.0,Setup Database
Connect Frontend,Integrate frontend with API,To Do,Medium,developer,2026-03-15,8.0,Create API
```

### Tasks with Subtasks
```csv
TaskName,Description,Status,Priority,AssignedToUsername,DueDate,EstimatedHours,ParentTaskName
User Management,Main task for user features,In Progress,High,admin,2026-04-01,40.0,
Create User Model,Database model for users,To Do,High,developer,2026-03-10,4.0,User Management
User Registration,Registration form and logic,To Do,High,developer,2026-03-15,8.0,User Management
User Login,Login form and authentication,To Do,High,developer,2026-03-20,8.0,User Management
```

## Tips

1. **Start Simple**: Begin with just TaskName to test the import
2. **Check Usernames**: Verify all usernames exist before importing
3. **Review Status/Priority**: Ensure they match your organization's custom values
4. **Order Matters**: For dependencies, list prerequisite tasks before dependent tasks
5. **Test First**: Try importing a small subset before importing hundreds of tasks

## Common Errors

- **"Project not found"**: Invalid ProjectId
- **"User not found"**: AssignedToUsername doesn't exist
- **"Parent task not found"**: ParentTaskName doesn't match any task in the import
- **"Invalid date format"**: Use YYYY-MM-DD format only
- **"Circular dependency"**: Task A depends on B which depends on A

## Import Process

The import will:
1. Validate all required fields
2. Create all tasks with basic information
3. Resolve and set parent task relationships
4. Resolve and set task dependencies
5. Return a summary of created tasks and any errors
