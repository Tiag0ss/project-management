# GitHub Copilot Instructions - Project Management App

## Language Guidelines

**IMPORTANT:** Respond ONLY in **English (EN)**.

Language policy (mandatory):
- All assistant responses must be in English, including confirmations, error messages, summaries, and follow-up questions.
- Do not switch to Portuguese even if the user writes in Portuguese; keep understanding requests, but always answer in English.
- If mixed-language content is required in generated app UI/text, ask explicitly before adding non-English strings.

## Prompt Library (Skills-like)

Use reusable prompt templates from `.github/prompts/` when tasks match these categories:

- `skill-frontend-feature.prompt.md`
- `skill-backend-route.prompt.md`
- `skill-db-schema-json.prompt.md`
- `skill-bugfix-debug.prompt.md`
- `skill-timesheet-summary.prompt.md`
- `skill-jira-integration.prompt.md`
- `skill-permission-gated-ui.prompt.md`
- `skill-release-pdf-flow.prompt.md`
- `skill-auth-password-recovery.prompt.md`
- `skill-dashboard-kpi-drilldown.prompt.md`

If a request is close to one of these templates, follow that template structure first, then adapt to the user-specific scope.

## Project Context

This is a full-stack project management application built with **Next.js 16** (App Router) and **Express.js** backend with **MySQL/MSSQL** database support. The application supports multi-tenant organizations with comprehensive task management, resource planning, and time tracking features.

## Technology Stack

### Frontend
- **Framework**: Next.js 16.1.6 with App Router (TypeScript)
- **UI**: React 19.2.3 with Tailwind CSS
- **State Management**: React Context API for authentication
- **Routing**: Next.js App Router (file-based)
- **Styling**: Tailwind CSS with dark mode support

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript
- **Database**: MySQL 8.0+ and MSSQL (SQL Server) via provider-aware wrapper in `server/config/database.ts`
- **Authentication**: JWT tokens with HTTP-only cookies
- **Password Security**: bcrypt for hashing

### Key Dependencies
```json
{
  "next": "16.1.6",
  "react": "19.2.3",
  "express": "^4.21.2",
  "mysql2": "^3.11.5",
  "mssql": "^11.0.1",
  "jsonwebtoken": "^9.0.2",
  "bcrypt": "^5.1.1"
}
```

## Project Architecture

### Database Schema

**Database Schema Management:**

The database schema is defined and managed through **JSON structure files** located in:
```
server/database/structure/systemtables/
```

**IMPORTANT: Never create manual SQL migration scripts for adding/modifying columns.** The database is automatically synchronized from the JSON files.

**CRITICAL: NEVER create temporary scripts to fix database issues.** If columns need to be dropped or database structure needs manual fixes, the developer will execute SQL commands directly. Only provide the SQL command, never create .ts scripts for database fixes.

**How to Add/Modify Database Fields:**

1. **Locate the table's JSON file** in `server/database/structure/systemtables/`
   - Example: `Users.json`, `Tasks.json`, `ProjectStatusValues.json`

2. **Add the field to the JSON schema:**
   ```json
   {
     "FieldName": "NewFieldName",
     "DataType": "varchar(255)",
     "NotNullable": true,
     "DefaultValue": "0"
   }
   ```
   **Note:** For string defaults, do NOT add extra quotes - use `"09:00"` not `"'09:00'"`

3. **Common data types:**
   - `int` - Integer numbers
   - `varchar(N)` - Variable character string (max N characters)
   - `text` - Large text fields
   - `tinyint(1)` - Boolean (0 or 1)
   - `decimal(M,D)` - Decimal numbers (M total digits, D decimal places)
   - `date` - Date only (YYYY-MM-DD)
   - `timestamp` - Date and time
   - `datetime` - Date and time

4. **Field properties:**
   - `FieldName`: Column name in database
   - `DataType`: MySQL data type
   - `NotNullable`: true if field cannot be null
   - `DefaultValue`: Default value (NO extra quotes for strings)
   - `AutoIncrement`: true for primary key auto-increment

5. **Run the database sync command** (the system will automatically apply changes from JSON)

**How to Create New Tables:**

When creating a new table JSON file, follow this exact structure:

```json
{
  "TableName": "NewTableName",
  "PrimaryKeyFields": "Id",
  "Fields": [
    {
      "FieldName": "Id",
      "DataType": "int",
      "NotNullable": true,
      "AutoIncrement": true
    },
    {
      "FieldName": "OtherField",
      "DataType": "varchar(255)",
      "NotNullable": true
    }
  ]
}
```

**CRITICAL: Use `PrimaryKeyFields` NOT `PrimaryKey`!**

- For single primary key: `"PrimaryKeyFields": "Id"`
- For composite primary key: `"PrimaryKeyFields": "Field1,Field2"` (comma-separated, no spaces)
- `PrimaryKeyFields` must be at the TOP level, right after `TableName`, NOT at the end of the file
- NEVER use an array for PrimaryKeyFields, always use a comma-separated string

**Example: Composite Primary Key Table**
```json
{
  "TableName": "CustomerOrganizations",
  "PrimaryKeyFields": "CustomerId,OrganizationId",
  "Fields": [
    {
      "FieldName": "CustomerId",
      "DataType": "int",
      "NotNullable": true
    },
    {
      "FieldName": "OrganizationId",
      "DataType": "int",
      "NotNullable": true
    }
  ]
}
```

**Example: Adding IsClosed and IsCancelled to ProjectStatusValues**
```json
{
  "FieldName": "IsClosed",
  "DataType": "tinyint(1)",
  "NotNullable": true,
  "DefaultValue": "0"
},
{
  "FieldName": "IsCancelled",
  "DataType": "tinyint(1)",
  "NotNullable": true,
  "DefaultValue": "0"
}
```

**Core Tables:**
```sql
Users (Id, Username, Email, PasswordHash, FirstName, LastName, isAdmin, IsDeveloper, IsSupport, IsManager, WorkHoursMonday-Sunday)
RolePermissions (Id, RoleName, CanViewDashboard, CanViewPlanning, CanManageProjects, CanCreateProjects, CanDeleteProjects, CanManageTasks, CanCreateTasks, CanDeleteTasks, CanAssignTasks, CanManageTimeEntries, CanViewReports, CanViewBudgetInfo, CanManageOrganizations, CanManageUsers, CanManageTickets, CanCreateTickets, CanDeleteTickets, CanAssignTickets)
Organizations (Id, Name, Description, CreatedBy)
OrganizationMembers (OrganizationId, UserId, Role, PermissionGroupId)
PermissionGroups (Id, OrganizationId, GroupName, CanManageProjects, CanManageTasks, CanManageMembers, CanManageSettings)
Projects (Id, OrganizationId, ProjectName, Description, Status, StartDate, EndDate, IsHobby)
Tasks (Id, ProjectId, TaskName, Description, Status, Priority, EstimatedHours, AssignedTo, PlannedStartDate, PlannedEndDate, DependsOnTaskId, ParentTaskId)
TaskAllocationHeaders (Id, TaskId, UserId, AllocationMode, SplitOrder, PlannedHours, CreatedBy)
TaskAllocations (TaskId, TaskAllocationHeaderId, UserId, AllocationDate DATE, AllocatedHours DECIMAL(4,2))
TaskChildAllocations (ParentTaskId, TaskAllocationHeaderId, ChildTaskId, UserId, AllocationDate DATE, AllocatedHours DECIMAL(4,2))
TimeEntries (Id, TaskId, UserId, WorkDate DATE, Hours DECIMAL(4,2), Description)
ProjectStatuses, TaskStatuses, TaskPriorities (Custom status values per organization)
```

**Key Relationships:**
- Users can have multiple roles (IsDeveloper, IsSupport, IsManager boolean fields)
- RolePermissions define capabilities per role (Developer, Support, Manager)
- User permissions are combined from all their assigned roles
- Organizations have many Projects, Members, and PermissionGroups
- Projects have many Tasks
- Tasks can have **Parent-Child hierarchy** (ParentTaskId creates subtasks)
- TaskAllocations belong to **TaskAllocationHeaders** (logical planning slices per task/user)
- Tasks have TaskAllocations (resource planning) and TimeEntries (actual work)
- **Parent tasks can have TaskChildAllocations** (allocating parent task time to specific subtasks)
- **TaskChildAllocations are slice-aware via `TaskAllocationHeaderId`**; when moving/replanning a slice, always filter, recalculate, insert, and delete child allocations by the same header ID so other slices are untouched
- Tasks can have dependencies (DependsOnTaskId)
- Users have daily work capacity (WorkHoursMonday through WorkHoursSunday)

**Task Hierarchy System:**
- Tasks can have a `ParentTaskId` to create subtasks/child tasks
- **Leaf tasks** are tasks without children (no other task has them as ParentTaskId)
- **Parent tasks** are tasks that have at least one child task
- **CRITICAL: When calculating total hours, ALWAYS use leaf tasks only** to avoid double counting
- Example calculation:
  ```typescript
  // Identify tasks with children
  const taskIdsWithChildren = new Set(tasks.filter(t => t.ParentTaskId).map(t => t.ParentTaskId));
  // Get only leaf tasks (tasks without children)
  const leafTasks = tasks.filter(t => !taskIdsWithChildren.has(t.Id));
  // Calculate totals only from leaf tasks
  const totalEstimatedHours = leafTasks.reduce((sum, t) => sum + parseFloat(String(t.EstimatedHours || 0)), 0);
  ```

### Folder Structure

```
app/                          # Next.js pages (App Router)
  ├── dashboard/              # User dashboard (overview, calendar, analytics)
  ├── planning/               # Gantt chart with drag-drop resource allocation
  ├── projects/               # Project list and details
  │   └── [id]/               # Project detail with Kanban, Gantt, Overview, Reporting
  ├── timesheet/              # Daily, weekly, all entries, and resume views
  ├── organizations/          # Organization management
  │   └── [id]/               # Org settings: members, permissions, statuses
  ├── users/                  # User management (admin only)
  └── login/register/         # Authentication pages

components/                   # Reusable React components
  └── Navbar.tsx              # Navigation with role-based menu items

contexts/                     # React Context providers
  └── AuthContext.tsx         # Authentication state and user info

lib/api/                      # Frontend API client functions
  ├── auth.ts                 # Login, register, logout
  ├── users.ts                # User CRUD operations
  ├── organizations.ts        # Organization management
  ├── projects.ts             # Project management
  ├── tasks.ts                # Task CRUD and dependencies
  └── ...                     # Other API clients

server/                       # Express backend
  ├── index.ts                # Server entry point
  ├── config/database.ts      # Provider-aware DB wrapper (MySQL + MSSQL)
  ├── middleware/auth.ts      # JWT authentication middleware
  └── routes/                 # API route handlers
      ├── auth.ts             # POST /api/auth/login, /register
      ├── users.ts            # /api/users
      ├── organizations.ts    # /api/organizations
      ├── projects.ts         # /api/projects
      ├── tasks.ts            # /api/tasks
      ├── taskAllocations.ts  # /api/task-allocations
      ├── taskChildAllocations.ts  # /api/task-child-allocations
      ├── timeEntries.ts      # /api/time-entries
      └── ...
```

## Coding Conventions

### TypeScript Guidelines
- **Always use TypeScript** for all new code
- Define interfaces for all data structures
- Use `interface` for object shapes, `type` for unions/intersections
- Avoid `any` - use `unknown` or proper types
- Enable strict mode compliance

### React/Next.js Patterns

**Component Structure:**
```typescript
'use client'; // Only when needed (useState, useEffect, etc.)

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface ComponentProps {
  title: string;
  onSave: (data: DataType) => void;
}

export default function ComponentName({ title, onSave }: ComponentProps) {
  const { user, token } = useAuth();
  const [data, setData] = useState<DataType | null>(null);

  // Effects, handlers, etc.
  
  return (
    <div className="w-full">
      {/* JSX */}
    </div>
  );
}
```

**API Calls:**
```typescript
// Always use try-catch
// Always check token
// Always handle errors gracefully

const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/endpoint`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data)
});

if (!response.ok) {
  throw new Error('Failed to...');
}

const result = await response.json();
```

### Backend Patterns

**Route Handler Structure:**
```typescript
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../config/database';

router.get('/endpoint', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    
    const [results] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM Table WHERE UserId = ?',
      [userId]
    );
    
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Error message' });
  }
});
```

**Database Queries:**
- Use parameterized queries (ALWAYS - prevent SQL injection)
- Use `pool.execute()` for query execution
- Type cast results: `pool.execute<RowDataPacket[]>()` or `<ResultSetHeader>`
- Keep route SQL provider-agnostic whenever possible; rely on `server/config/database.ts` for provider differences
- Join tables when needed to avoid N+1 queries
- Use transactions for multi-table operations

### Database Provider Abstraction (CRITICAL)

- Use the shared wrapper from `server/config/database.ts` (`pool`, `dbProvider`, exported DB types) in server routes.
- Do not import `mysql2` directly in route files; keep driver-specific concerns inside the wrapper.
- Prefer portable SQL patterns first; only branch on `dbProvider` when SQL semantics differ and cannot be safely translated.
- For MSSQL compatibility, avoid MySQL-only constructs in new route SQL:
  - `FIELD(...)` ordering → use `CASE WHEN ... THEN ... END`
  - `GROUP_CONCAT(...)` → assemble values in TypeScript (or use MSSQL-specific aggregate only when required)
  - `JSON_ARRAYAGG/JSON_OBJECT` → build JSON in TypeScript when cross-db compatibility is needed
  - `LIMIT/OFFSET` in custom SQL should either be portable or explicitly handled for MSSQL
  - Non-aggregated selected columns must be included in `GROUP BY` (MSSQL strictness)
  - Recursive CTE placement differs (`WITH RECURSIVE` vs `;WITH`), so do not embed recursive CTEs in fragile `IN (...)` forms for MSSQL

### Styling Guidelines

**Tailwind CSS Classes:**
```typescript
// Light and dark mode support
className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white"

// Responsive design
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"

// Interactive elements
className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"

// Form inputs
className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700"
```

**Screen Layout Standard (CRITICAL):**
- Use full-width page wrappers (`w-full`) across screens.
- Do not introduce `container` or fixed-width outer wrappers unless explicitly requested for a specific screen.
- Keep existing spacing/grid utilities, but preserve full-width behavior as the default layout baseline.

### Grid Styling Standard (CRITICAL)

- When implementing or updating list/table/grid UIs, align with the Applications list visual pattern in `app/applications/page.tsx`.
- Table shell pattern must follow Applications list style exactly:
  - Outer wrapper: `bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700`
  - Header row container: `<thead className="bg-gray-50 dark:bg-gray-900">`
  - Sortable header hover tone: `hover:bg-gray-100 dark:hover:bg-gray-800`
- For action columns (`Actions`) in tables/grids:
  - Do not render visible `Actions` header text; keep the column header visual empty and use `<span className="sr-only">Actions</span>` for accessibility.
  - Use icon-only buttons with tooltips (`title`) and accessibility labels (`aria-label`).
  - Prefer inline SVG icons (edit/trash) instead of text labels like `Edit`/`Delete`.
  - Use this interaction style consistently:
    - Base: `p-1.5 text-gray-400 rounded transition-colors`
    - Edit hover: `hover:text-blue-600 dark:hover:text-blue-400`
    - Delete hover: `hover:text-red-600 dark:hover:text-red-400`
- Keep icon button sizing and spacing consistent across grids (`w-4 h-4` icons, compact gaps).
- Preserve permission gating on each action button before rendering.
- Header pattern for action column must follow Applications list style:
  - `<th scope="col" className="relative px-6 py-3">` + `<span className="sr-only">Actions</span>`
  - Never show literal `Actions` as visible header text in table/grid UIs.
- Row action container pattern:
  - `<div className="flex items-center justify-end gap-1">` (or `gap-2` when spacing requires)
  - Do not use emoji icons in grid action columns; use inline SVG only.
- Top toolbar action buttons (e.g., `Import CSV`, `Export CSV`, `New ...`) must use normalized sizing:
  - Base pattern: `h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center`
  - Primary variant may add `gap-2` when it includes a leading plus icon.
  - Keep `Import`, `Export`, and primary `New ...` buttons the same height on the same toolbar.
  - Do not change `Quick Actions` button sizing unless explicitly requested.

**Modal Pattern:**
```typescript
{showModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
      <div className="p-6">
        {/* Modal content */}
      </div>
    </div>
  </div>
)}
```

## Feature-Specific Guidelines

### Authentication
- JWT stored in HTTP-only cookie (backend sets it)
- Frontend stores token in AuthContext
- All protected routes check `user` from `useAuth()`
- Redirect to `/login` if not authenticated
- Admin-only pages check `user.isAdmin`
- Password recovery flow is supported with:
  - `POST /api/auth/forgot-password`
  - `GET /api/auth/reset-password/validate?token=...`
  - `POST /api/auth/reset-password`
- Reset tokens are stored hashed in `PasswordResetTokens` and should be single-use with expiry
- Forgot-password responses must stay generic (do not reveal whether email exists)

### SMTP Settings Behavior
- `smtpPassword` must not be returned as a visible/masked placeholder token in API responses for admin UI forms
- In System Settings, saving an empty SMTP password means clear the stored password value
- Do not reintroduce SMTP password show/hide toggle unless explicitly requested

### Ticket Creation Constraints
- For customer users (`isCustomerUser` / JWT `customerId`), ticket creation must remain minimal
- Customer users must not select or assign `ProjectId` when creating tickets
- Frontend payload must send `projectId: null` for customer users
- Backend must validate and reject customer-user create requests that include `projectId`

### Task Hierarchy & Parent-Child Allocations
- Tasks can have `ParentTaskId` to create subtasks
- **Parent tasks with allocations can split time across child tasks using TaskChildAllocations**
- Example workflow:
  1. Parent task "Feature X" with 40h allocated to User A on specific dates
  2. Create child tasks: "Design" (10h), "Development" (20h), "Testing" (10h)
  3. Use TaskChildAllocations to split the 40h parent allocation across children
  4. Child tasks automatically get PlannedStartDate/PlannedEndDate when child allocations are created
- **CRITICAL: TaskChildAllocations consume parent task allocation time**
- When checking user availability, fetch BOTH TaskAllocations AND TaskChildAllocations
- Child allocation endpoint: `GET /api/task-child-allocations/user/:userId/date/:date?isHobby=true/false`

### Resource Planning (Gantt Chart)
- **Project Gantt** shows all project tasks (not filtered by user)
- **Planning Gantt** shows user-specific allocations
- **Project Gantt rendering must be hierarchical** (parent/child tree), not a flat list
- **View Modes**: Week (28 days), Month (90 days), Year (365 days)
- Dynamic navigation adjusts by view mode: ±28/±90/±365 days
- Timeline headers adapt to mode: week numbers, dates, or months
- TaskAllocations store planned hours per day
- **Planning bars must be header-driven**: render by `TaskAllocationHeaderId` (one bar per header slice), not by naive date-gap grouping
- Check user availability before allocating:
  - Daily work capacity (WorkHoursMonday-Sunday)
  - **Existing TaskAllocations AND TaskChildAllocations for the user**
  - Exclude current task when checking availability
- Calculate PlannedEndDate based on allocations
- Support drag-and-drop to assign tasks to users
- Drag behavior in Planning Gantt:
  - **Normal drag**: move the full allocation slice (entire header)
  - **Ctrl + drag**: move partial slice by **hours** (never by date prompt)
  - Partial slice operations must preserve allocation rules (capacity/availability/holidays)
- Show visual timeline with color-coded task bars
- Support reliable parent expand/collapse behavior with deterministic sibling ordering

### Allocation Header Rules (CRITICAL)
- New planning inserts must always set `TaskAllocations.TaskAllocationHeaderId`.
- Any replan/push-forward/manual flow that creates allocations must attach a header ID.
- New child planning inserts must always set `TaskChildAllocations.TaskAllocationHeaderId` to the parent slice header.
- Any parent slice move/replan must filter child allocations by `TaskChildAllocations.TaskAllocationHeaderId`, not by date alone.
- Deletions for slice operations should target header-aware endpoints when available (header or header+hours), not broad task/user/date deletions.
- Task Details → Planned Allocations must group by allocation header and allow expand/collapse to inspect per-day rows.
- On server startup, migrations must backfill headers for legacy allocations (`TaskAllocationHeaderId IS NULL`) and fix orphan header references.

### Time Tracking
- TimeEntries record actual hours worked
- Views: Daily Entry (form), Weekly Grid (spreadsheet-style), All Entries, and Resume
- Weekly grid shows tasks as rows, days as columns
- Manual save button (no auto-save)
- Week navigation: Previous/Current/Next Week buttons
- Load existing entries on grid mount
- Delete entries by setting hours to 0
- Resume supports period-based aggregation, including an explicit `allTime` mode
- In All Entries, keep detailed table + totals footer; avoid reintroducing removed top summary cards unless requested

### Dashboard Analytics
- Analytics supports selectable periods with default current month behavior
- Include `allTime` period option for aggregate metrics where applicable

### Dashboard KPI Drill-down (CRITICAL)
- KPI widgets with list-backed metrics must use a single source of truth: `/api/dashboard-kpis/values` should provide both summary values and backing lists (`detailsByWidget`)
- For list-backed KPI cards, displayed totals must be derived from the same backing list used by drill-down details (avoid separate count-only logic that can diverge)
- The details endpoint (`/api/dashboard-kpis/:widgetId/details`) must reuse the same backend query builder as `/values`; differences should be pagination only
- Task/detail payloads must include navigation identifiers (`taskId`, `projectId`) so rows can open the right target
- Task detail rows must include tags when available (from `TaskTags`/`Tags`)
- KPI modal rendering must be type-aware: `tasks`, `projects`, `customers`, `tickets`, `timeEntries`
- KPI modal click contract:
  - `tasks` and `timeEntries` open task details via `TaskDetailModal`
  - `projects` navigates to `/projects/:id`
  - `customers` navigates to `/customers/:id`
  - `tickets` navigates to `/tickets/:id`
- When resolving project customer labels in KPI queries, never read `Projects.CustomerName` directly; use `LEFT JOIN Customers` and `COALESCE(Customers.ExternalName, Customers.Name)`

### Applications & Versions
- `Applications.IsCustomerSpecific` and `ApplicationVersions.IsCustomerSpecific` are supported flags
- Default for both fields is `0` (false)
- Frontend forms and backend payload handling must preserve and persist these fields consistently

### Customer Tabs
- Customer change history must render only in the History tab
- Do not render history components inside Attachments or other tabs

### Intelligent Replanning
- When replanning a task, fetch existing TimeEntries
- Calculate: `remainingHours = estimatedHours - sum(timeEntries.Hours)`
- Show confirmation if hours already worked
- Block replanning if remainingHours <= 0
- Only allocate remaining hours, not full estimate

### Project Overview (Enhanced)
- **Progress Visualization**: Overall completion with color-coded progress bars
- **Quick Stats Grid**: Dates, estimated hours (leaf tasks only), tickets, team size
- **Priority Breakdown**: High/Medium/Low task counts with colored indicators
- **Alerts Section**: Overdue tasks, upcoming tasks (next 7 days), unassigned tasks
- **Overdue/Upcoming Lists**: Two-column layout with day counters
  - Days overdue: `Math.floor((today - dueDate) / 86400000)`
  - Days until due: `Math.ceil((dueDate - today) / 86400000)`
- **Team Members Grid**: Individual progress, completion rates, task counts, hours assigned
- **Statistics Use All Tasks**: Total, In Progress, Completed counts include subtasks
- **Hours Use Leaf Tasks**: Only sum EstimatedHours from tasks without children

### Project Reporting
- **Summary Tab**: Tasks table with estimated/allocated/worked hours, export to CSV
- **By User Tab**: User statistics with total allocated/worked hours per user
- **Allocations Tab**: All task allocations by date and user
- **Time Entries Tab**: All time entries with descriptions
- **CRITICAL**: All hour totals must use **leaf tasks only** to match Overview
- Example total calculation:
  ```typescript
  const taskIdsWithChildren = new Set(tasks.filter(t => t.ParentTaskId).map(t => t.ParentTaskId));
  const leafTasks = tasks.filter(t => !taskIdsWithChildren.has(t.Id));
  const totalEstimatedHours = leafTasks.reduce((sum, t) => sum + parseFloat(t.EstimatedHours || 0), 0);
  ```

### Custom Status Values
- Organizations can define custom:
  - ProjectStatuses
  - TaskStatuses  
  - TaskPriorities
- Each has: Value (name), Color (hex), IsDefault flag
- Use in dropdowns throughout the app

### Permissions System
- **Role-Based Permissions**: Users can have multiple roles (Developer, Support, Manager)
- **RolePermissions table**: Defines capabilities for each role
  - View permissions: CanViewDashboard, CanViewPlanning, CanViewReports, CanViewBudgetInfo
  - Project permissions: CanManageProjects, CanCreateProjects, CanDeleteProjects
  - Task permissions: CanManageTasks, CanCreateTasks, CanDeleteTasks, CanAssignTasks
  - Ticket permissions: CanManageTickets, CanCreateTickets, CanDeleteTickets, CanAssignTickets
  - Time permissions: CanManageTimeEntries
  - Admin permissions: CanManageOrganizations, CanManageUsers
- **Permission Combination**: User gets permission if ANY of their roles grants it
- **Admin Override**: isAdmin users have ALL permissions regardless of roles
- **PermissionsContext**: React context provides `usePermissions()` hook
- **Usage Pattern**:
  ```typescript
  const { permissions, isLoading } = usePermissions();
  
  // Check before showing UI
  {permissions?.canCreateProjects && (
    <button>Create Project</button>
  )}
  ```
- **Backend Validation**: API endpoints check permissions via `getUserPermissions()`
- **Organization Permissions**: PermissionGroups define org-specific capabilities
  - CanManageProjects, CanManageTasks, CanManageMembers, CanManageSettings, CanViewBudgetInfo
- **Budget Visibility Rule**:
  - Budget data in Projects list/detail and budget-derived indicators must be hidden when `canViewBudgetInfo` is false.
  - Role-level `CanViewBudgetInfo` and org-group `CanViewBudgetInfo` are combined with OR logic in `getUserPermissions()`.
- Check permissions before showing UI elements
- Backend validates permissions on all mutations

### Jira Integration
- **Two-tier Integration System**:
  - **Jira for Tickets** - Main instance for ticket management and issue search
  - **Jira for Projects** - Separate instance for project boards and kanban views (optional)
- **Organization-level Configuration** (`OrganizationJiraIntegrations` table):
  - `IsEnabled` - Master toggle for integration
  - `JiraUrl`, `JiraEmail`, `JiraApiToken` - Main Jira instance for tickets
  - `JiraProjectKey` - Default project key for ticket searches
  - `JiraProjectsUrl`, `JiraProjectsEmail`, `JiraProjectsApiToken` - Separate Projects instance
- **Project-level Board Association**:
  - `Projects.JiraBoardId` - Associates project with specific Jira board/URL
  - Only shows in UI when organization has Jira Projects integration configured
  - Can be edited in Project Settings tab alongside other project fields
- **Task-Jira Relationship Chain**:
  - `Tasks.TicketId` → `Tickets.ExternalTicketId` → `OrganizationJiraIntegrations.JiraUrl`
  - Tasks created from tickets automatically inherit Jira context
  - TaskDetailModal shows Jira ticket badges with external links
  - Ticket task lists display Jira integration status
- **API Endpoints**:
  - `/api/jira-integrations/organization/:id` - Get/Create/Update integration
  - `/api/jira-integrations/organization/:id/test` - Test connection
  - `/api/jira-integrations/organization/:id/search` - Search Jira issues
  - `/api/jira-integrations/project/:id/issues` - Get project board issues
- **Security**: All API tokens encrypted with AES-256-CBC before storage

### Memos System
- **Calendar-based Interface**: Month navigation with day selection
- **Filtering System**:
  - **Date Filter**: By default disabled, shows all memos
  - Click date → enables filter for that date
  - Click same selected date → disables date filter (shows all)
  - **Visibility Filter**: Private, Organizations, Public, All
  - **Tag Filter**: Filter by custom tags, click tag again to remove
- **Filter Controls**:
  - "Clear Date Filter" button when date filter active
  - "Clear All Filters" button when any filters active
  - "Show All Memos" button when no results found with date filter
- **Visibility Levels**:
  - `private` - Only visible to memo author
  - `organizations` - Shared with users in author's organizations
  - `public` - Visible to all system users
- **Rich Content Support**: Full Tiptap editor with images, formatting
- **Tag System**: Comma-separated tags for organization and filtering
- **Calendar Visual Indicators**:
  - Today highlighted in blue
  - Selected date (when filtered) highlighted in dark blue
  - Days with memos shown in bold font
  - Monthly navigation with Portuguese day abbreviations
- **Database**: `Memos` table with `UserId`, `Title`, `Content`, `Visibility`, tags in `MemoTags`

## Critical Patterns

### Hours Calculation Pattern
**ALWAYS use leaf tasks when calculating total hours to avoid double counting:**

```typescript
// Step 1: Identify which tasks have children
const taskIdsWithChildren = new Set(
  tasks.filter(t => t.ParentTaskId).map(t => t.ParentTaskId)
);

// Step 2: Filter to get only leaf tasks (tasks without children)
const leafTasks = tasks.filter(t => !taskIdsWithChildren.has(t.Id));

// Step 3: Calculate totals ONLY from leaf tasks
const totalEstimatedHours = leafTasks.reduce((sum, t) => 
  sum + parseFloat(String(t.EstimatedHours || 0)), 0
);
```

**When to use this pattern:**
- ✅ Project Overview total hours
- ✅ Reporting tab summary cards
- ✅ Any calculation that aggregates EstimatedHours
- ✅ Budget calculations
- ✅ Progress tracking by hours

**When NOT to use this pattern:**
- ❌ Task counts (use all tasks including subtasks)
- ❌ Status counts (In Progress, Completed - count all tasks)
- ❌ Priority breakdown (count all tasks)
- ❌ Displaying individual task hours (show actual EstimatedHours)

### Task Statistics Pattern
**Use all tasks (including subtasks) for counts and status:**

```typescript
// Use ALL tasks for statistics
const totalTasks = tasks.length;  // All tasks including subtasks
const completedTasks = tasks.filter(t => 
  t.Status?.toLowerCase() === 'done' || t.Status?.toLowerCase() === 'completed'
).length;

// But use LEAF tasks for hours
const taskIdsWithChildren = new Set(tasks.filter(t => t.ParentTaskId).map(t => t.ParentTaskId));
const leafTasks = tasks.filter(t => !taskIdsWithChildren.has(t.Id));
const totalHours = leafTasks.reduce((sum, t) => sum + parseFloat(String(t.EstimatedHours || 0)), 0);
```

### Availability Checking Pattern
**Check BOTH TaskAllocations AND TaskChildAllocations:**

```typescript
// Get direct task allocations
const allocationsRes = await fetch(
  `${API_URL}/api/task-allocations/user/${userId}/date/${dateStr}?isHobby=${isHobby}`
);
let allocatedHours = 0;
if (allocationsRes.ok) {
  const data = await allocationsRes.json();
  allocatedHours = data.allocations.reduce((sum, a) => 
    sum + parseFloat(a.AllocatedHours || 0), 0
  );
}

// Get child allocations (CRITICAL - don't forget this)
const childAllocationsRes = await fetch(
  `${API_URL}/api/task-child-allocations/user/${userId}/date/${dateStr}?isHobby=${isHobby}`
);
if (childAllocationsRes.ok) {
  const childData = await childAllocationsRes.json();
  const childHours = childData.allocations.reduce((sum, a) => 
    sum + parseFloat(a.AllocatedHours || 0), 0
  );
  allocatedHours += childHours; // Add to total
}

const availableHours = Math.max(0, userDayCapacity - allocatedHours);
```

## Important Date Handling

**MySQL DATE Fields:**
```typescript
// MySQL returns DATE as Date object OR string - normalize it
const normalizeDateString = (dateValue: any): string => {
  if (dateValue instanceof Date) {
    return dateValue.toISOString().split('T')[0];
  }
  return String(dateValue).split('T')[0];
};

// Use for comparing dates from database
const isMatch = normalizeDateString(entry.WorkDate) === dateString;
```

**Date Formatting:**
```typescript
// Create date at noon to avoid timezone issues
const date = new Date(year, month, day, 12, 0, 0);

// Format for input[type="date"]
const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD

// Display with weekday
const formatted = date.toLocaleDateString('en-US', { 
  weekday: 'short', 
  month: 'short', 
  day: 'numeric',
  year: 'numeric'
});
```

## Common Patterns to Follow
### Jira Integration Patterns
**Check organization integration before showing Jira fields:**

```typescript
const [jiraIntegration, setJiraIntegration] = useState<any>(null);

// Load integration status
const loadJiraIntegration = async () => {
  try {
    const response = await fetch(`${API_URL}/api/jira-integrations/organization/${orgId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const data = await response.json();
      if (data.integration?.IsEnabled && data.integration?.JiraProjectsUrl) {
        setJiraIntegration(data.integration);
      } else {
        setJiraIntegration(null);
      }
    }
  } catch (err) {
    setJiraIntegration(null);
  }
};

// Conditional UI rendering
{jiraIntegration && (
  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
    <input
      type="text"
      value={formData.jiraBoardId || ''}
      onChange={(e) => setFormData({ ...formData, jiraBoardId: e.target.value })}
      placeholder="e.g., 123 (from board URL)"
    />
  </div>
)}
```

**Task-Jira relationship display:**

```typescript
// In task queries, always JOIN for Jira data
SELECT t.*, tk.ExternalTicketId, oji.JiraUrl
FROM Tasks t
LEFT JOIN Tickets tk ON t.TicketId = tk.Id
LEFT JOIN OrganizationJiraIntegrations oji ON tk.OrganizationId = oji.OrganizationId

// UI display with external link
{task.ExternalTicketId && task.JiraUrl && (
  <a
    href={`${task.JiraUrl}/browse/${task.ExternalTicketId}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded"
    onClick={(e) => e.stopPropagation()}
  >
    🔗 {task.ExternalTicketId}
  </a>
)}
```

### Memos Filtering Patterns
**Date filter state management:**

```typescript
const [selectedDate, setSelectedDate] = useState(new Date());
const [enableDateFilter, setEnableDateFilter] = useState(false); // Default: show all
const [filterTag, setFilterTag] = useState<string | null>(null);
const [filterVisibility, setFilterVisibility] = useState<'all' | 'private' | 'organizations' | 'public'>('all');

// Date selection with toggle behavior
const handleDateSelect = (date: Date) => {
  if (enableDateFilter && isSameDate(date, selectedDate)) {
    setEnableDateFilter(false); // Toggle off
  } else {
    setSelectedDate(date);
    setEnableDateFilter(true); // Enable filter for new date
  }
};

// Filtering logic
const filteredMemos = memos.filter(memo => {
  // Date filter (only when enabled)
  if (enableDateFilter) {
    const memoDate = new Date(memo.CreatedAt);
    if (!isSameDate(memoDate, selectedDate)) return false;
  }
  // Other filters...
  return true;
});
```
### User Dialogs - NO alert() or confirm()
```typescript
// ALWAYS use custom modals, never alert() or confirm()
const [modalMessage, setModalMessage] = useState<{
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
} | null>(null);

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  setModalMessage({ type: 'confirm', title, message, onConfirm });
};

// Render modal component with proper styling
```

### Loading States
```typescript
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  const loadData = async () => {
    setIsLoading(true);
    try {
      // fetch data
    } finally {
      setIsLoading(false);
    }
  };
  loadData();
}, [dependencies]);

if (isLoading) return <div>Loading...</div>;
```

### Error Handling
```typescript
const [error, setError] = useState('');

// Show error message
{error && (
  <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
    {error}
  </div>
)}
```

### Form Submission
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  setError('');
  
  try {
    const response = await fetch(...);
    if (!response.ok) {
      throw new Error('Failed to save');
    }
    onSaved(); // callback to parent
    onClose(); // close modal
  } catch (err: any) {
    setError(err.message || 'An error occurred');
  } finally {
    setIsLoading(false);
  }
};
```

## Environment Variables

```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=password
DB_NAME=projectmanagement

# JWT
JWT_SECRET=your-secret-key

# Server
PORT=3000
NODE_ENV=development

# Frontend (must start with NEXT_PUBLIC_)
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## API Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error description"
}
```

## Testing Checklist

When generating code, ensure:
- [ ] TypeScript strict mode compliance
- [ ] Proper error handling (try-catch)
- [ ] Loading states for async operations
- [ ] Dark mode support in UI
- [ ] Responsive design (mobile-first)
- [ ] Authentication checks for protected routes
- [ ] Permission checks for restricted actions
- [ ] SQL injection prevention (parameterized queries)
- [ ] Input validation (frontend and backend)
- [ ] Proper cleanup (useEffect return functions)

## Common Issues to Avoid

1. **Never use `alert()` or `confirm()`** - use custom modals
2. **Never concatenate SQL queries** - use parameterized queries
3. **Always normalize dates** from MySQL DATE fields before comparison
4. **Don't forget dark mode** classes on all UI elements
5. **Always check token** exists before API calls
6. **Use `authenticateToken` middleware** on all protected routes
7. **Type cast database results** properly (RowDataPacket[] or ResultSetHeader)
8. **Handle 404s and errors** gracefully in the UI
9. **Clear sensitive data** from state on logout
10. **Use meaningful variable names** - no single letters except loop counters
11. **Always update JSON schema files** in `server/database/structure/systemtables/` when adding/modifying database fields
12. **NEVER create SQL migration scripts** for adding/modifying columns - only update the JSON files, the system auto-syncs
13. **DefaultValue in JSON** - never add extra quotes for strings (use `"09:00"` not `"'09:00'"`)
14. **New table JSON files** - ALWAYS use `PrimaryKeyFields` (NOT `PrimaryKey`), place it after `TableName`, use comma-separated string for composite keys (NOT array)
15. **Use full-width page wrappers** - default to `w-full` for screen layouts; avoid introducing `container` wrappers unless explicitly requested
16. **Keep history scoped to History tab** - never duplicate ChangeHistory content into non-history tabs
17. **Avoid MySQL-only SQL in new backend routes** - keep queries portable for MySQL and MSSQL, or isolate provider-specific SQL with `dbProvider`
18. **Avoid MySQL-only interval arithmetic in routes** - patterns like `DATE_ADD(..., INTERVAL ? HOUR)` are not portable; prefer app-calculated datetimes or provider-gated SQL
19. **Password recovery privacy** - never leak account existence in forgot-password responses
20. **Customer ticket creation rule** - do not allow project selection/assignment for customer users
21. **Hour display format is always `hh:MM:ss`** - never display hours as `1.5h` or `1.50h`; always use the `decimalHoursToHMS` helper (defined locally in each page that needs it). The helper converts decimal hours to `hh:MM:ss`. Duration in minutes must be divided by 60 before passing to the helper. This applies to all views: dashboard, reports, work summary, and any future page that shows time totals or per-entry hours.

```typescript
const decimalHoursToHMS = (hours: number): string => {
  const totalSeconds = Math.round(Math.abs(hours) * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const sign = hours < 0 ? '-' : '';
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
// Minutes → hh:MM:ss:  decimalHoursToHMS(durationMinutes / 60)
```

## Example Files for Reference

- **Good component example**: `app/timesheet/page.tsx` (daily/weekly/all entries/resume patterns)
- **Good API route**: `server/routes/taskAllocations.ts` (availability checking)
- **Good modal pattern**: `app/planning/page.tsx` (custom confirm dialogs)
- **Good form handling**: `app/users/page.tsx` (user management modals)
- **Leaf tasks calculation**: `app/projects/[id]/page.tsx` - OverviewTab and ReportingTab (consistent hour totals)
- **Child allocations**: `server/routes/taskChildAllocations.ts` (parent-child allocation logic)
- **View modes**: `app/projects/[id]/page.tsx` - GanttViewTab (Week/Month/Year timeline)

## Real-World Examples

### Example 1: Calculate Project Total Hours
```typescript
// ✅ CORRECT - Uses leaf tasks only
const taskIdsWithChildren = new Set(tasks.filter(t => t.ParentTaskId).map(t => t.ParentTaskId));
const leafTasks = tasks.filter(t => !taskIdsWithChildren.has(t.Id));
const totalHours = leafTasks.reduce((sum, t) => sum + parseFloat(String(t.EstimatedHours || 0)), 0);

// ❌ WRONG - Double counts parent and children hours
const totalHours = tasks.reduce((sum, t) => sum + parseFloat(t.EstimatedHours || 0), 0);

// ❌ WRONG - Only counts parents, misses standalone tasks
const totalHours = tasks.filter(t => !t.ParentTaskId).reduce((sum, t) => sum + parseFloat(t.EstimatedHours || 0), 0);
```

### Example 2: Check User Daily Availability
```typescript
// ✅ CORRECT - Checks both allocation types
const directAllocations = await fetch(`/api/task-allocations/user/${userId}/date/${date}`);
const childAllocations = await fetch(`/api/task-child-allocations/user/${userId}/date/${date}`);

let totalAllocated = 0;
if (directAllocations.ok) {
  const data = await directAllocations.json();
  totalAllocated += data.allocations.reduce((sum, a) => sum + parseFloat(a.AllocatedHours), 0);
}
if (childAllocations.ok) {
  const data = await childAllocations.json();
  totalAllocated += data.allocations.reduce((sum, a) => sum + parseFloat(a.AllocatedHours), 0);
}

const available = userDayCapacity - totalAllocated;

// ❌ WRONG - Only checks direct allocations, misses child allocations
const allocations = await fetch(`/api/task-allocations/user/${userId}/date/${date}`);
const totalAllocated = allocations.reduce((sum, a) => sum + parseFloat(a.AllocatedHours), 0);
```

### Example 3: Project Statistics
```typescript
// ✅ CORRECT - Counts use all tasks, hours use leaf tasks
const allTasks = tasks; // Include all tasks for counts
const totalTaskCount = allTasks.length;
const completedCount = allTasks.filter(t => t.Status === 'done').length;
const inProgressCount = allTasks.filter(t => t.Status === 'in progress').length;

// But use leaf tasks for hours
const taskIdsWithChildren = new Set(tasks.filter(t => t.ParentTaskId).map(t => t.ParentTaskId));
const leafTasks = tasks.filter(t => !taskIdsWithChildren.has(t.Id));
const totalEstimatedHours = leafTasks.reduce((sum, t) => sum + parseFloat(String(t.EstimatedHours || 0)), 0);

// ❌ WRONG - Uses leaf tasks for counts (loses subtask visibility)
const leafTasks = tasks.filter(t => !hasChildren(t));
const totalTaskCount = leafTasks.length; // Wrong! Doesn't show all work items
```

### Example 4: Gantt View Mode Navigation
```typescript
// ✅ CORRECT - Navigation adapts to view mode
const handleNext = () => {
  const daysToAdd = viewMode === 'Week' ? 28 : viewMode === 'Month' ? 90 : 365;
  setStartDate(new Date(startDate.setDate(startDate.getDate() + daysToAdd)));
};

// Timeline generation adapts too
useEffect(() => {
  const daysToGenerate = viewMode === 'Week' ? 28 : viewMode === 'Month' ? 90 : 365;
  const newDays = [];
  for (let i = 0; i < daysToGenerate; i++) {
    newDays.push(new Date(startDate.getTime() + i * 86400000));
  }
  setDays(newDays);
}, [startDate, viewMode]);

// ❌ WRONG - Fixed navigation regardless of view mode
const handleNext = () => {
  setStartDate(new Date(startDate.setDate(startDate.getDate() + 30))); // Always 30 days
};
```

---

**When suggesting code, follow these patterns exactly. Prioritize code quality, type safety, and user experience.**
