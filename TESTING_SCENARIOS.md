# Testing Scenarios - Project Management App

This document contains comprehensive test scenarios to verify all functionality is working correctly. Test scenarios are organized by feature area with detailed steps and expected results. Updated for Redis cache, API tokens, Outlook calendar/queue, task type icons, and GitHub/Gitea integrations.

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [Organizations & Users](#organizations--users)
3. [Customers](#customers)
4. [Applications & Releases](#applications--releases)
5. [Projects](#projects)
6. [Tasks](#tasks)
7. [Tickets](#tickets)
8. [Resource Planning (Gantt)](#resource-planning-gantt)
9. [Time Tracking](#time-tracking)
10. [Call Records](#call-records)
11. [Active Timers](#active-timers)
12. [Memos](#memos)
13. [Permissions](#permissions)
14. [Jira Integration](#jira-integration)
15. [API Tokens](#api-tokens)
16. [Outlook Calendar Integration](#outlook-calendar-integration)
17. [Email Task Queue (Cloudflare)](#email-task-queue-cloudflare)
18. [GitHub & Gitea Integration](#github--gitea-integration)
19. [Redis Cache](#redis-cache)
20. [Email Notifications](#email-notifications)
21. [Search & Navigation](#search--navigation)
22. [Dark Mode & UI](#dark-mode--ui)
23. [Integration & End-to-End Scenarios](#integration--end-to-end-scenarios)
24. [Performance & Stress Testing](#performance--stress-testing)
25. [Security Testing](#security-testing)
26. [Backup & Recovery](#backup--recovery)
27. [Edge Cases & Error Handling](#edge-cases--error-handling)
28. [Browser Compatibility](#browser-compatibility)

---

## Authentication & Authorization

### TC-AUTH-001: Install Wizard (First Time Setup)
**Prerequisites:** Fresh installation, database empty  
**Steps:**
1. Navigate to `http://localhost:3000`
2. Install wizard should appear automatically
3. Fill in admin account details (username, email, password, first name, last name)
4. Create initial organization
5. Configure SMTP settings (optional)
6. Complete wizard

**Expected:**
- Admin user created with all permissions
- Organization created
- Database tables initialized
- Redirected to login page
- Cannot access install wizard again

### TC-AUTH-002: Login with Valid Credentials
**Steps:**
1. Navigate to login page
2. Enter valid username and password
3. Click "Login"

**Expected:**
- JWT token stored in HTTP-only cookie
- Redirected to dashboard
- User info displayed in navbar
- Appropriate menu items visible based on permissions

### TC-AUTH-003: Login with Invalid Credentials
**Steps:**
1. Navigate to login page
2. Enter invalid username or password
3. Click "Login"

**Expected:**
- Error message displayed
- Remain on login page
- No token stored

### TC-AUTH-004: Logout
**Steps:**
1. While logged in, click user menu in navbar
2. Click "Logout"

**Expected:**
- JWT token cleared
- Redirected to login page
- Cannot access protected pages without re-login

### TC-AUTH-005: Session Persistence
**Steps:**
1. Login successfully
2. Refresh the page
3. Close and reopen browser tab

**Expected:**
- User remains logged in
- Session persists across page refreshes
- Session persists until logout or token expiry

### TC-AUTH-006: API Token Authentication
**Prerequisites:** User logged in  
**Steps:**
1. Navigate to Profile → API Tokens
2. Create a token with a name (e.g. `Test Integration`)
3. Copy the `pt_...` value (shown only once)
4. Call a protected API endpoint with `Authorization: Bearer pt_...`
5. Deactivate the token from Profile → API Tokens
6. Retry the same API call

**Expected:**
- Token created and listed with prefix only (not full secret)
- Valid token authenticates requests like a JWT
- Deactivated token returns 403
- Revoked token no longer accepted after cache invalidation

---

## Organizations & Users

### TC-ORG-001: Create Organization
**Prerequisites:** Admin or user with `CanManageOrganizations` permission  
**Steps:**
1. Navigate to Organizations page
2. Click "Create Organization"
3. Fill in: Name, Description (rich text)
4. Click "Create"

**Expected:**
- Organization created successfully
- Current user automatically added as member
- Appears in organizations list
- Can be selected in organization dropdown

### TC-ORG-002: Edit Organization
**Steps:**
1. Navigate to Organizations page
2. Click on an organization
3. Go to "Settings" tab
4. Edit organization details (Name, Description)
5. Click "Save Changes"

**Expected:**
- Changes saved successfully
- Updated details displayed
- Changes reflected in organization list

### TC-ORG-003: Add Members to Organization
**Steps:**
1. Navigate to organization detail page
2. Go to "Members" tab
3. Click "Add Member"
4. Select user from dropdown
5. Select role (Developer, Support, Manager)
6. Optionally assign permission group
7. Click "Add"

**Expected:**
- Member added successfully
- User appears in members list with correct role
- User can now access organization's data

### TC-ORG-004: Remove Member from Organization
**Steps:**
1. Navigate to organization detail page → Members tab
2. Find member to remove
3. Click "Remove" button
4. Confirm deletion

**Expected:**
- Member removed from organization
- User loses access to organization's projects/tasks/data
- If user has no other organizations, cannot see any data

### TC-ORG-005: Manage Permission Groups
**Steps:**
1. Navigate to organization detail page → Settings tab
2. Scroll to "Permission Groups" section
3. Click "Create Permission Group"
4. Enter group name
5. Set permissions (CanManageProjects, CanManageTasks, CanManageMembers, CanManageSettings)
6. Click "Create"

**Expected:**
- Permission group created
- Available when adding/editing members
- Permissions correctly override global role permissions

### TC-ORG-006: Manage Custom Statuses
**Steps:**
1. Navigate to organization detail page → Settings tab
2. Go to "Custom Statuses" section
3. Create Project Statuses (Name, Color, IsDefault)
4. Create Task Statuses (Name, Color, IsDefault)
5. Create Task Priorities (Name, Color, IsDefault)
6. Create Ticket Statuses (Name, Color, StatusType, IsClosed)
7. Create Ticket Priorities (Name, Color, IsDefault)

**Expected:**
- Custom statuses created for each type
- Default status automatically selected in new items
- Colors displayed correctly in dropdowns and labels
- Only one IsDefault per type allowed

### TC-ORG-007: Manage Task Types with Icons
**Steps:**
1. Navigate to organization detail page → Settings tab
2. Open "Task Types" section
3. Create a task type with name, color, and icon (searchable Lucide icon picker)
4. Set one type as default
5. Edit an existing type and change its icon
6. Save changes

**Expected:**
- Task types saved with `IconSvg` (Lucide icon name)
- Icon picker is searchable and shows preview with type color
- Default type auto-selected on new tasks when type not specified
- Icons visible in project Kanban, project Gantt, planning bars, and dashboard Kanban

---

## Customers

### TC-CUST-001: Create Customer
**Prerequisites:** Member of at least one organization  
**Steps:**
1. Navigate to Customers page
2. Click "Create Customer"
3. Fill in: Name, Email, Phone, Address, Website, Contact Person, Contact Email, Contact Phone
4. Add rich text description/notes
5. Select organizations to associate
6. Optionally select default support user
7. Click "Create"

**Expected:**
- Customer created successfully
- Associated with selected organizations
- Default support user assigned if selected
- Appears in customer list
- Available in searchable dropdowns

### TC-CUST-002: Edit Customer
**Steps:**
1. Navigate to customer detail page
2. Click "Edit Customer"
3. Modify customer details
4. Change organization associations
5. Change default support user
6. Click "Save Changes"

**Expected:**
- Changes saved successfully
- Updated details displayed
- Organization associations updated
- Default support user correctly assigned

### TC-CUST-003: Customer-Application Association
**Steps:**
1. Navigate to Applications page
2. Create or edit an application
3. Open "Associated Customers" searchable multi-select dropdown
4. Search for customer name
5. Select multiple customers
6. Save application

**Expected:**
- Customers associated with application
- Search filters customers correctly
- Selected customers displayed with count badge
- Can clear all selections

### TC-CUST-004: View Customer Projects and Tickets
**Steps:**
1. Navigate to customer detail page
2. Check "Projects" tab
3. Check "Tickets" tab

**Expected:**
- All projects linked to customer displayed
- All tickets for customer displayed
- Clicking project/ticket navigates to detail page

### TC-CUST-005: Customer User Portal Access
**Prerequisites:** Customer user account exists  
**Steps:**
1. Login as customer user
2. Navigate to portal

**Expected:**
- Only sees tickets for their customer
- Can create new tickets
- Cannot access projects, planning, admin features
- Restricted to customer scope

---

## Applications & Releases

### TC-APP-001: Create Application
**Prerequisites:** User with `CanManageApplications` / create permission  
**Steps:**
1. Navigate to Applications page
2. Click "Create Application" / "New Application"
3. Fill in: Name, Description, Repository URL
4. Optionally upload an application image (PNG/JPEG/WebP/SVG) — no external image URL field
5. Select organization
6. Select associated customers using searchable dropdown
7. Click "Create"

**Expected:**
- Application created successfully
- Associated with selected organization
- Customers linked to application
- Image appears as thumbnail on list/grid and on the detail header when uploaded
- Appears in applications list
- Available in project/task application dropdowns

### TC-APP-002: Edit Application
**Steps:**
1. Navigate to Applications page
2. Open edit on an application (or edit from detail flows that use the same modal)
3. Edit application details; change / remove uploaded image if desired
4. Modify customer associations
5. Click "Save" / "Update"

**Expected:**
- Changes saved successfully
- Customer associations updated
- Image updates or clears correctly (local `/uploads/applications/` path)
- Changes reflected in application list and detail page

### TC-APP-002b: Application detail tab URL
**Steps:**
1. Open an application detail page
2. Switch to Versions (or Commits)
3. Hard-refresh the browser

**Expected:**
- URL contains `?tab=versions` (or `commits`)
- Same tab remains active after refresh

### TC-APP-003: Manage Application Customers (Detail Page)
**Steps:**
1. Navigate to application detail page
2. Click "Manage" button in Customers section
3. Use searchable multi-select to add/remove customers
4. Click "Save Changes"

**Expected:**
- Modal opens with all customers loaded
- Search filters customer list correctly
- Current selections displayed with count
- Changes saved and reflected in customer list

### TC-APP-004: Create Application Version
**Prerequisites:** User with `CanManageApplicationReleases` permission  
**Steps:**
1. Navigate to application detail page
2. Go to "Versions" tab
3. Click "Create Version"
4. Fill in: Version Number, Version Name, Status, Release Date
5. Add patch notes using rich text editor (formatting, lists, images)
6. Optionally link tasks to this release
7. Click "Create"

**Expected:**
- Version created successfully
- Patch notes saved with formatting
- Tasks linked to version and `ReleaseVersionId` updated
- Version appears in versions list

### TC-APP-005: Edit Application Version
**Steps:**
1. Navigate to application detail page → Versions tab
2. Click on a version to view details
3. Click "Edit"
4. Modify version details, status, patch notes
5. Add/remove tasks
6. Click "Save Changes"

**Expected:**
- Changes saved successfully
- Task assignments updated
- Status changes reflected

### TC-APP-006: Prevent Duplicate Task Assignment to Releases
**Steps:**
1. Create Version A and assign Task X
2. Try to create Version B and assign Task X again

**Expected:**
- Task X should not appear in available tasks for Version B
- Error or visual indicator if task already assigned
- Only unassigned tasks appear in task selection

### TC-APP-007: Auto-Update Tasks on Release Creation
**Steps:**
1. Create tasks without `ReleaseVersionId`
2. Create a new release and link these tasks
3. Check task details

**Expected:**
- Tasks' `ReleaseVersionId` automatically set to new release
- Tasks now show version association
- Tasks removed from "available tasks" pool for other releases

### TC-APP-008: Export Single Release to PDF
**Prerequisites:** Release with patch notes and linked tasks  
**Steps:**
1. Navigate to application detail page → Versions tab
2. Click on a release to view details
3. Click "Print to PDF" button

**Expected:**
- PDF download initiated
- PDF contains:
  - Application name and version number
  - Release date
  - Patch notes with HTML formatting rendered
  - List of linked tasks with details
- PDF properly formatted and readable

### TC-APP-009: Export Date Range Releases to PDF
**Steps:**
1. Navigate to application detail page → Versions tab
2. Click "Print Date Range" button
3. Select start date and end date
4. Click "Generate PDF"

**Expected:**
- PDF download initiated
- PDF contains all releases within date range
- Each release shown with patch notes and tasks
- Releases ordered by release date
- Proper page breaks between releases

### TC-APP-010: Searchable Dropdowns in Application Forms
**Steps:**
1. Open create/edit application modal
2. Click on "Associated Customers" dropdown
3. Type to search for customers
4. Select multiple customers

**Expected:**
- Dropdown opens with search input
- Typing filters customer list in real-time
- Can select/deselect customers with checkboxes
- Selected count displayed
- "Clear all" button works
- Click outside closes dropdown

---

## Projects

### TC-PROJ-001: Create Project
**Prerequisites:** User with `CanCreateProjects` permission  
**Steps:**
1. Navigate to Projects page
2. Click"Create Project"
3. Fill in: Name, Description (rich text), Organization
4. Select status, start/end dates
5. Set budget (optional)
6. Link applications using searchable dropdown
7. Link customer (optional)
8. Click "Create"

**Expected:**
- Project created successfully
- Applications linked to project
- Customer linked if selected
- Appears in projects list
- Available for task creation

### TC-PROJ-002: Edit Project
**Steps:**
1. Navigate to project detail page
2. Go to "Settings" tab
3. Edit project details
4. Modify application associations
5. Change customer
6. Click "Save Changes"

**Expected:**
- Changes saved successfully
- Application links updated
- Customer association updated
- Changes reflected across all views

### TC-PROJ-003: View Project Overview
**Steps:**
1. Navigate to project detail page
2. View "Overview" tab

**Expected:**
- RAG health score displayed (Red/Amber/Green)
- Quick stats: dates, estimated hours (leaf tasks only), tickets, team size
- Priority breakdown (High/Medium/Low task counts)
- Alerts section: overdue tasks, upcoming tasks (next 7 days), unassigned tasks
- Team members grid with progress, completion rates, task counts
- Hours calculated from leaf tasks only (not double counting parent tasks)

### TC-PROJ-004: Kanban Board
**Steps:**
1. Navigate to project detail page
2. Go to "Kanban" tab
3. Drag task between columns

**Expected:**
- Tasks organized by status
- Task type icon shown before task name (colored Lucide icon)
- Drag-and-drop moves task to new status
- Task count per column updated
- Visual feedback during drag
- Changes saved automatically

### TC-PROJ-005: Project Gantt Chart
**Steps:**
1. Navigate to project detail page
2. Go to "Gantt" tab
3. View task timeline

**Expected:**
- All project tasks displayed (not filtered by user)
- Task type icon shown in task name column and unplanned list
- Tasks shown with start/end dates
- Parent-child relationships visible
- Dependencies indicated
- View modes work: Week (28 days), Month (90 days), Year (365 days)

### TC-PROJ-006: Project Reporting
**Steps:**
1. Navigate to project detail page
2. Go to "Reporting" tab
3. View Summary, By User, Allocations, Time Entries tabs
4. Export to CSV

**Expected:**
- **Summary**: Total estimated/allocated/worked hours (leaf tasks only)
- **By User**: User statistics with individual hours
- **Allocations**: All task allocations by date and user, including allocation slice identity (`TaskAllocationHeaderId`/split order)
- **Time Entries**: All logged time with descriptions
- CSV/PDF export downloads correctly with all data (including allocation slice metadata in allocations export)
- Hours match Overview tab (using leaf tasks only)

---

## Tasks

### TC-TASK-001: Create Task
**Prerequisites:** User with `CanCreateTasks` permission  
**Steps:**
1. From project Kanban or directly from Tasks
2. Click "Create Task"
3. Fill in: Name, Description (rich text), Status, Priority, Task Type
4. Set estimated hours
5. Assign to user
6. Set planned start/end dates
7. Link to application and version (searchable dropdowns)
8. Add dependencies (DependsOnTaskId)
9. Set parent task (creates subtask)
10. Click "Create"

**Expected:**
- Task created successfully
- Rich text description saved with formatting
- Application and version linked
- Dependencies tracked
- Parent-child relationship established
- Appears in project Kanban and Gantt

### TC-TASK-002: Edit Task
**Steps:**
1. Open task detail modal
2. Edit task fields
3. Change application/version using searchable dropdown
4. Add/remove dependencies
5. Change parent task
6. Click "Save"

**Expected:**
- Changes saved successfully
- Searchable dropdowns filter correctly
- Selected application/version displayed
- Dependencies updated
- Parent-child hierarchy updated

### TC-TASK-003: Task Hierarchy (Parent-Child)
**Steps:**
1. Create parent task
2. Create child  tasks with ParentTaskId set to parent
3. View in Kanban and Gantt
4. Calculate project totals

**Expected:**
- Child tasks indented under parent
- Parent shows summary of child progress
- **Leaf tasks only** used in hour calculations (no double counting)
- Parent task hours NOT added to totals if it has children
- Standalone tasks (no parent, no children) counted in totals

### TC-TASK-004: Task Dependencies
**Steps:**
1. Create Task A
2. Create Task B with dependency on Task A (DependsOnTaskId)
3. Try to complete Task B before Task A

**Expected:**
- Dependency relationship visible
- Visual indicator in Gantt chart
- Warning/validation when completing dependent task first

### TC-TASK-005: Task Allocations (Child Allocations)
**Steps:**
1. Create parent task with estimated hours
2. Create multiple child tasks
3. Allocate parent task to user on specific dates
4. Split parent allocation across specific child tasks using TaskChildAllocations
5. View in Planning Gantt

**Expected:**
- Parent task allocation shows in user's schedule
- Child allocations split time across subtasks
- Child tasks get PlannedStartDate/PlannedEndDate automatically
- Availability calculation includes both TaskAllocations and TaskChildAllocations
- No double counting when calculating user load

### TC-TASK-006: Task Attachments
**Steps:**
1. Open task detail modal
2. Click "Attachments" section
3. Upload files
4. Download attachment
5. Delete attachment

**Expected:**
- Files uploaded successfully
- Stored in `/app/uploads/attachments`
- Download works correctly
- Delete removes file from server and database

### TC-TASK-007: Convert Ticket to Task
**Steps:**
1. Navigate to ticket detail page
2. Click "Convert to Task"
3. Select project
4. Fill in task details (pre-populated from ticket)
5. Click "Create Task"

**Expected:**
- Task created with ticket details
- Task linked to ticket (TaskId set in Tickets table)
- Ticket shows associated task
- Click task link in ticket navigates to task

### TC-TASK-008: Import Tasks from CSV
**Steps:**
1. Navigate to project detail page → Kanban tab
2. Click "Import Tasks" button
3. Download CSV template
4. Fill in CSV with task data
5. Upload filled CSV
6. Review import preview
7. Confirm import

**Expected:**
- Template downloaded with correct headers
- CSV parsed correctly
- Preview shows all tasks to be imported
- Tasks created successfully
- Validation errors shown for invalid data

### TC-TASK-009: Task Checklist
**Steps:**
1. Open any task detail modal
2. Go to the "Checklist" tab
3. Add several checklist items
4. Check/uncheck items
5. Delete a checklist item

**Expected:**
- Checklist items created and listed in order
- Checking an item marks it complete (strikethrough)
- Progress bar shows completion percentage of checklist items
- Unchecking restores an item
- Delete removes item permanently
- Checklist progress visible in task detail header

### TC-TASK-010: Task Completion Percentage
**Steps:**
1. Open any task detail modal
2. Find the "Completion" field/slider
3. Set completion to 50%
4. Save the task

**Expected:**
- Completion percentage saved (0–100%)
- Displayed in task card in kanban and task list
- Does not affect status (manual status still required)
- Visible in project reporting

### TC-TASK-011: Task Templates
**Prerequisites:** User with `CanManageTasks` permission
**Steps:**
1. Navigate to a project → Tasks tab
2. Click "Task Templates" or similar button
3. Create a template with a name and several template items
4. Go to a project and click "Apply Template"
5. Select the template and confirm

**Expected:**
- Template items are turned into real tasks in the project
- Each template item creates a task with predefined fields (name, description, estimated hours, etc.)
- Templates available across all projects
- Template CRUD (create, edit, delete) works correctly

### TC-TASK-012: Split Allocation Button in Task Detail
**Steps:**
1. Open a task that has existing allocations
2. Go to the "Allocations" tab in the task detail modal
3. Click the "Split" button on an existing allocation slice
4. Divide the allocation hours between two or more users
5. Choose split mode (Parallel or Sequential)
6. Confirm the split

**Expected:**
- Original allocation header replaced by multiple new headers (one per assigned user)
- `SplitOrder` set correctly for each resulting header
- Parallel mode: both users share the same date range
- Sequential mode: users are chained in date order
- Planning Gantt shows separate bars per user for this task
- Each bar independently movable via drag

### TC-TASK-013: Import Task from Outlook Email Queue
**Prerequisites:** Cloudflare Email Worker configured; user has pending queue items ([cloudflare/README.md](cloudflare/README.md))  
**Steps:**
1. Send an email from your registered user address to the configured queue address
2. Verify webhook accepted (Activity Log: `EMAIL_QUEUE_RECEIVED`)
3. Open a project → Import Tasks → **Import from Outlook Queue**
4. Select the queued item and import as a new task
5. Dismiss a different queued item without importing

**Expected:**
- Import option only visible when user has pending queue items
- Imported task created with subject as name and normalized email body as description
- Queue item removed after import
- Dismissed item removed from queue without creating a task
- Duplicate `messageId` is idempotent (no duplicate queue rows)

### TC-TASK-014: Task Visible After Create (Cache Coherence)
**Prerequisites:** `REDIS_ENABLED=true` (optional but recommended for this test)  
**Steps:**
1. Note current task count on project Kanban and Planning Gantt
2. Create a new task in the project
3. Without waiting, refresh project Kanban and open Planning

**Expected:**
- New task appears immediately in project task list/Kanban
- New task appears in Planning Gantt (if within filters and permissions)
- No stale list from Redis cache (invalidate-on-write)

---

## Tickets

### TC-TICK-001: Create Ticket with Auto-Assignment
**Prerequisites:** Customer with default support user configured  
**Steps:**
1. Create ticket for customer project
2. Do NOT manually assign support user

**Expected:**
- Ticket auto-assigned to customer's default support user
- Ticket number auto-generated (TKT-ORG-123 format)
- Assignment notification sent to support user

### TC-TICK-002: Create Ticket (Manual Assignment)
**Steps:**
1. Navigate to Tickets page
2. Click "Create Ticket"
3. Fill in: Title, Description (rich text), Customer, Project
4. Select Priority, Category, Status
5. Manually assign support user and/or developer
6. Click "Create"

**Expected:**
- Ticket created successfully
- Auto-number generated
- Assigned users receive notifications
- Appears in tickets list

### TC-TICK-003: Edit Ticket
**Steps:**
1. Open ticket detail page
2. Edit ticket details (title, description, customer, project)
3. Change status, priority
4. Change assignments (support user, developer)
5. Click "Save"

**Expected:**
- Changes saved successfully
- Status/priority changes trigger notifications
- Assignment changes trigger notifications
- Change history recorded

### TC-TICK-004: Add Comment to Ticket
**Steps:**
1. Open ticket detail page
2. Go to "Comments" section
3. Write comment using rich text editor
4. @mention a user
5. Add attachments
6. Click "Add Comment"

**Expected:**
- Comment added to ticket
- Rich text formatting saved
- @mentioned user receives notification
- Attachments uploaded successfully
- Comment appears in conversation thread

### TC-TICK-005: Custom Ticket Statuses with StatusType
**Steps:**
1. Navigate to organization settings
2. Create custom ticket statuses with different StatusTypes:
   - "New" (StatusType: open)
   - "In Progress" (StatusType: in_progress)
   - "Waiting on Customer" (StatusType: waiting)
   - "Completed" (StatusType: resolved)
   - "Cancelled" (StatusType: closed, IsClosed: true)
3. Create tickets and change statuses

**Expected:**
- Custom statuses created with correct StatusType
- Filtering by status type works correctly
- Closed statuses (IsClosed=true) exclude tickets from open count
- StatusType provides consistent filtering regardless of custom names

### TC-TICK-006: View Ticket History
**Steps:**
1. Open ticket detail page
2. Make several changes (status, priority, assignment)
3. View "History" tab

**Expected:**
- All changes recorded with timestamp and user
- Status transitions shown
- Priority changes logged
- Assignment changes tracked
- Comments timestamped

---

## Resource Planning (Gantt)

### TC-PLAN-001: View Planning Gantt (User View)
**Steps:**
1. Navigate to Planning page
2. View user-specific allocations

**Expected:**
- Shows only current user's task allocations
- Timeline displays allocated tasks
- User capacity shown (WorkHoursMonday-Sunday)
- Recurring tasks visible with pink color and 🔄 icon
- View modes work (Week/Month/Year)

### TC-PLAN-002: Drag-and-Drop Task Allocation
**Steps:**
1. Navigate to Planning Gantt
2. Find unallocated task
3. Drag task onto user timeline on specific date
4. Set allocated hours

**Expected:**
- Task allocation created
- User availability checked before allocation
- Warning if user over-capacity
- PlannedStartDate and PlannedEndDate calculated
- Task appears in user's schedule

### TC-PLAN-003: Check User Availability
**Steps:**
1. Try to allocate task to user
2. System checks:
   - Daily work capacity (e.g., 8 hours on Monday)
   - Existing TaskAllocations for that day
   - Existing TaskChildAllocations for that day
   - Recurring tasks scheduled for that day
3. Calculate available hours

**Expected:**
- Availability calculated correctly
- Considers both direct allocations and child allocations
- Recurring task hours subtracted from availability
- Cannot over-allocate user beyond daily capacity
- Visual indicator of user load (green/yellow/red)

### TC-PLAN-004: Intelligent Replanning with Time Entries
**Steps:**
1. Create task with 10h estimate
2. Allocate 10h to user across several days
3. Log 4h of time entries
4. Replan task to different dates

**Expected:**
- System fetches existing time entries
- Calculates remaining hours: 10h - 4h = 6h
- Shows confirmation dialog with remaining hours
- Only allocates 6h remaining (not full 10h)
- Prevents double allocation of already-worked hours

### TC-PLAN-005: View Modes Navigation
**Steps:**
1. Navigate to Planning or Project Gantt
2. Switch between Week/Month/Year views
3. Use Previous/Next navigation

**Expected:**
- **Week view**: 28 days, daily columns, ±28 days navigation
- **Month view**: 90 days, week grouping, ±90 days navigation
- **Year view**: 365 days, month grouping, ±365 days navigation
- Timeline headers adapt to view mode
- Tasks displayed correctly in all modes

### TC-PLAN-006: Recurring Tasks in Planning
**Steps:**
1. Create recurring task from Profile page
2. View Planning Gantt
3. Try to allocate task during recurring block time

**Expected:**
- Recurring tasks shown with pink background and 🔄 icon
- Recurring task hours subtracted from availability
- Push-forward algorithm skips around recurring blocks
- Read-only modal when clicking recurring task
- "Edit from Profile" guidance provided

### TC-PLAN-007: Header-Driven Bars (No Date-Gap Merge)
**Steps:**
1. Create two separate allocation slices for the same task and same user (different `TaskAllocationHeaderId` values)
2. Open Planning Gantt in resource mode
3. Locate the task row for that user

**Expected:**
- Two separate bars are rendered (one per allocation header)
- Bars do not merge simply because date ranges are adjacent/overlapping
- Bar DOM identifiers remain stable for each allocation header

### TC-PLAN-008: Drag Contract (Normal vs Ctrl)
**Steps:**
1. In Planning Gantt, drag an existing allocated bar to another user without holding `Ctrl`
2. Confirm resulting allocations
3. Repeat by dragging while holding `Ctrl`
4. In the slice modal, move only part of hours and confirm

**Expected:**
- Normal drag moves the full allocation slice/header
- `Ctrl + drag` opens partial-slice flow by hours (not date range prompts)
- Source slice decreases by moved hours and target receives moved hours
- Availability/capacity checks still apply in both flows

### TC-PLAN-009: Split Allocation Across Multiple Users
**Steps:**
1. In the Planning Gantt, open an allocation modal for a task
2. Enable the "Split" toggle in the allocation form
3. Choose a split mode: **Parallel** (both users work simultaneously) or **Sequential** (one after the other)
4. Add entries for each user: specify user, planned hours, and hours-per-day
5. Confirm the allocation

**Expected:**
- Multiple `TaskAllocationHeaders` created (one per user per split order)
- Each header has a distinct `SplitOrder` value
- Parallel mode: date ranges overlap between users (concurrent work)
- Sequential mode: dates are chained (user B starts where user A ends)
- Each user's timeline row shows their individual allocation bar
- Availability is checked independently per user for their respective date range
- Reporting tab shows all allocation slices with `SplitOrder` column

### TC-PLAN-010: Unscheduled Work Tasks
**Steps:**
1. Mark a leaf task as "Unscheduled Work" (`UnscheduledWork = 1`) in its task details
2. Navigate to the Planning Gantt
3. Locate the affected user's rows

**Expected:**
- Task appears as a special **ghost marker** (distinct visual) on the day the task transitioned to "done" status or on today if still open
- Unscheduled tasks sorted to the bottom of the user's task list
- Unscheduled tasks that have a closed status with a recorded done-transition date display an anchor marker on that date
- Clicking the marker opens the task detail modal (read-only context)
- Tasks without a done-transition date show on today's column if still open
- Parent tasks with unscheduled children also appear in the parent row

### TC-PLAN-010b: Hide not-planned tasks without hours (View Options)
**Steps:**
1. Open Planning in resource (user) grouping with **Not Planned** parents: at least one with estimated hours &gt; 0 and one with no estimated hours (neither Unscheduled)
2. Open **View Options** and enable **Hide not-planned tasks without hours**
3. Confirm Unscheduled tasks still appear on assignee rows

**Expected:**
- Not-planned tasks with **no** estimated hours disappear from the **Not Planned** row
- Not-planned tasks that **still have** estimated hours remain visible in **Not Planned**
- If every remaining Not Planned task is hidden, the row itself disappears
- An amber top warning shows the count of hidden not-planned tasks without hours (expandable list with Open; link to show them again)
- Preference persists after refresh (localStorage)
- Unscheduled work remains visible on the assigned users
- Disabling the option restores all Not Planned tasks

### TC-PLAN-011: Move / Replan Allocation Slice
**Steps:**
1. In the Planning Gantt, find an existing allocation bar for a task
2. Click the bar to open the allocation detail modal
3. Click "Move" or drag the bar to a new date range
4. Confirm the new dates and hours

**Expected:**
- Old allocation records for that header are deleted
- New allocation records created at the target dates
- `TaskAllocationHeader` updated with new `PlannedHours`
- `Task.PlannedStartDate` / `PlannedEndDate` recalculated from the new allocation range
- User availability checked for each target day before committing
- If slice is part of a child allocation, only that slice's child rows are updated (other slices untouched)

### TC-PLAN-012: Recalculate Remaining Hours
**Steps:**
1. Create a task with 20h estimate
2. Log 8h of time entries
3. Open the allocation detail modal for this task in Planning
4. Click "Recalculate" or use the intelligent replan flow

**Expected:**
- System fetches existing time entries for this task
- Remaining hours shown: `20 - 8 = 12h`
- Allocation is created/updated for the remaining hours only
- Confirmation dialog shown if already-worked hours detected
- Blocks replanning if remaining hours ≤ 0

### TC-PLAN-013: Planning Import Page
**Steps:**
1. Navigate to `/planning-import`
2. Upload a CSV file with allocation data
3. Map CSV columns to system fields
4. Preview import results
5. Confirm import

**Expected:**
- CSV parsed and columns mapped correctly
- Preview shows allocations to be created per user/task
- Import creates `TaskAllocationHeaders` and `TaskAllocations` entries
- Errors highlighted for missing users, tasks, or invalid dates
- Success summary shows number of allocations created

### TC-PLAN-014: Planning View Modes (Resource vs Task)
**Steps:**
1. Navigate to the Planning Gantt
2. Switch between "Resource View" and "Task View" modes
3. Apply filters (organization, project, user, show only assigned)

**Expected:**
- **Resource View**: Rows grouped by user; shows each user's allocated tasks across projects
- **Task View**: Rows grouped by task; shows which users are allocated to each task
- Filter by organization narrows visible users and tasks
- Filter by project shows only tasks from selected projects
- "Show only my tasks" toggle restricts view to current user's allocations
- View mode preference preserved within session
- Critical path highlighting (🔴 toggle) available in both modes
- Baseline comparison (📏 toggle) shows original vs current planned dates

### TC-PLAN-014b: Mobile Read-Only Planning
**Steps:**
1. With Plan Tasks permission, open `/planning` at viewport width ≤767px
2. Confirm the yellow banner about read-only on this device
3. Attempt to drag/resize an allocation bar; open allocation header modal and task detail from a bar
4. Widen the viewport above 767px (or use desktop)

**Expected:**
- Banner shows device read-only message (not the missing-permission message)
- Bars use pointer cursor; drag/drop and resize do not change allocations
- Planning tools that mutate data (e.g. Set Baseline, delete allocations) are hidden
- Allocation / task modals open for viewing but edit/remove planning actions stay off
- Above 767px with permission, editing works again as on desktop

### TC-PLAN-015: Outlook Calendar Overlay (Non-Blocking Load)
**Prerequisites:** Outlook calendar enabled in System Settings with valid Microsoft Graph credentials  
**Steps:**
1. Open Planning Gantt with Outlook integration enabled
2. Observe page load behaviour while `/api/outlook-calendar/events` runs
3. Check banner near overdue milestones area during load

**Expected:**
- Planning Gantt renders without waiting for Outlook API
- Banner shows **"Still loading Outlook calendar…"** while fetch is in progress
- Banner disappears when events load or request completes
- Outlook events appear as calendar blocks on user rows (non-all-day events reduce available hours)
- Clicking own event opens modal (open in Outlook / start call timer)

### TC-DEVSUP-001: Regular User Cannot Access Dev Support Management
**Steps:**
1. Log in as a regular user (not team leader or admin)
2. Check main menu **Management** section
3. Navigate directly to `/dev-support`

**Expected:**
- **Dev Support** menu item is not visible
- Page redirects to dashboard (or shows access denied)
- `POST /api/dev-support/my/request` returns 403

### TC-DEVSUP-002: Planning Overlay Without Blocking Allocation
**Prerequisites:** User has dev support day(s) in the visible planning range  
**Steps:**
1. Open Planning Gantt for a range that includes a dev support day
2. Observe column styling for that user/date
3. Attempt drag-and-drop allocation onto the dev support day

**Expected:**
- Column shows sky/indigo tint (not amber unavailable)
- Footer row shows 🛠️ icon
- Tooltip shows "Dev Support" (or notes), not "Unavailable"
- Drag-drop and manual allocation still succeed
- Server allocation API does not treat dev support as unavailable

### TC-DEVSUP-003: Dashboard Calendar All-Day Event (Read-Only)
**Prerequisites:** Manager has assigned dev support days for the user  
**Steps:**
1. Open Dashboard → Calendar
2. Navigate to a day with dev support (week or month view)

**Expected:**
- All-day event **🛠️ Dev Support** appears in indigo styling
- Legend includes toggleable **Dev Support** type
- Clicking the event does not open an edit modal (informational only)
- Calendar slot picker does **not** offer a Dev Support create option

### TC-DEVSUP-004: Manager Deletes Dev Support Day
**Steps:**
1. Log in as team leader or admin
2. Open **Management → Dev Support**
3. Delete an existing entry for a managed user
4. Confirm in the delete modal

**Expected:**
- Entry removed from table and stats update
- Planning overlay and calendar no longer show the day

### TC-DEVSUP-005: Team Leader Calendar Visibility
**Prerequisites:** Team leader with at least one active subordinate  
**Steps:**
1. Subordinate creates dev support days
2. Team leader opens Planning (or calls `GET /api/dev-support/calendar` with subordinate userIds)

**Expected:**
- Subordinate dev support days visible to team leader on planning overlay
- Unrelated users' dev support days are not returned

### TC-DEVSUP-006: Manager Configures Dev Support for Team Member
**Prerequisites:** Team leader with at least one subordinate, or admin  
**Steps:**
1. Log in as team leader or admin
2. Open main menu **Management → Dev Support** (`/dev-support`)
3. Select a team member (subordinate for TL, any user for admin)
4. Add a date range with optional notes
5. Delete one of the member's days

**Expected:**
- Menu item visible only for team leaders/admins (below Approvals)
- Full-width layout with filters, stats cards, and entries table (similar to Approvals)
- `POST /api/dev-support/team-members/:userId/configure` creates rows immediately
- Member list shows year day count per user
- `CreatedBy` reflects the manager who added the days
- Delete works for managed users

### TC-PLAN-016: Task Type Icon on Planning Bars
**Prerequisites:** Tasks with configured task types (icons + colors)  
**Steps:**
1. Open Planning Gantt
2. Locate allocated task bars for tasks with different types

**Expected:**
- Task type icon appears first on the bar (before HOBBY, issue ref, emojis)
- Icon uses task type color (not black/dark background box)
- Icon visible in Resource and Task view modes

### TC-PLAN-017: Dashboard Kanban Task Type Icons
**Steps:**
1. Navigate to Dashboard → Kanban (if available for user)
2. View tasks with different task types

**Expected:**
- Task type icon shown before task name on each card
- Icon color matches organization task type configuration

---

## Time Tracking

### TC-TIME-001: Log Time (Daily Entry)
**Steps:**
1. Navigate to Dashboard → Timesheet
2. Go to "Daily Entry" tab
3. Select date
4. Add task
5. Enter hours worked
6. Add description
7. Click "Save Entry"

**Expected:**
- Time entry saved successfully
- Hours associated with task
- Description saved
- Entry appears in weekly grid and all entries

### TC-TIME-002: Log Time (Weekly Grid)
**Steps:**
1. Navigate to Dashboard → Timesheet → Weekly Grid
2. Find task in rows
3. Click on day cell
4. Enter hours
5. Click "Save All Changes"

**Expected:**
- Hours entered for specific task and day
- Multiple entries can be made before saving
- "Save All Changes" commits all entries
- Week navigation works (Previous/Current/Next)

### TC-TIME-003: View All Time Entries with Filters
**Steps:**
1. Navigate to Dashboard → Timesheet → All Entries
2. Filter by date range
3. Filter by project
4. Filter by user (if admin)
5. View summary cards (total hours, billable hours, entries count)
6. Export to CSV

**Expected:**
- Filters work correctly
- Summary cards update based on filters
- CSV export downloads with filtered data
- All entries displayed in table format

### TC-TIME-004: Time Entry Approval Workflow
**Prerequisites:** Manager or user with approval permissions  
**Steps:**
1. User submits time entries
2. Manager navigates to time entries
3. Review entries
4. Approve selected entries
5. User tries to edit approved entry

**Expected:**
- Manager can approve/reject entries
- Approved entries locked from editing
- Visual indicator of approval status
- Rejection comments visible to user

### TC-TIME-005: Delete Time Entry
**Steps:**
1. Navigate to Weekly Grid or All Entries
2. Find time entry
3. Delete entry (or set hours to 0 in grid)
4. Save changes

**Expected:**
- Time entry deleted successfully
- Removed from all views
- Hours subtracted from totals
- Task's worked hours reduced


## Call Records

### TC-CALL-001: Create Call Record Manually
**Prerequisites:** User is logged in
**Steps:**
1. Navigate to the Call Records page (`/call-records`)
2. Click "New Call Record"
3. Fill in: Date, Start Time, Duration (minutes), Call Type, Participants, Subject, Notes
4. Optionally link to an Organization, Project, or Task
5. Click "Save"

**Expected:**
- Call record created successfully
- All fields saved correctly
- Record appears in call records list with correct date/time/duration
- Linked project and task displayed inline
- Rich text notes preserved with any formatting

### TC-CALL-002: Edit and Delete Call Record
**Steps:**
1. Find an existing call record in the list
2. Click the edit icon
3. Modify Subject, Notes, Duration, linked Task
4. Save changes
5. Delete a different call record using the delete icon

**Expected:**
- Changes saved and reflected immediately in the list
- Delete shows a confirmation dialog before removing
- Deleted record removed from list and database

### TC-CALL-003: Import Call Records from CSV
**Steps:**
1. On the Call Records page, click "Import CSV"
2. Download the CSV template
3. Fill in call record rows (date, startTime, durationMinutes, callType, participants, subject, notes)
4. Upload the filled CSV
5. Review the preview of records to import
6. Confirm import

**Expected:**
- Template downloaded with correct headers
- CSV parsed and preview shown with all rows
- Records created after confirmation
- Count of imported records shown in success message
- Validation errors flagged (missing date, invalid duration, etc.)

### TC-CALL-004: Import Call Records from Microsoft Teams
**Steps:**
1. On the Call Records page, click "Import from Teams"
2. Select a period: 7 days, 30 days, 90 days, or custom date range
3. Click "Start Import"
4. Monitor import progress

**Expected:**
- Integration fetches call data from connected Microsoft Teams instance
- Progress messages displayed in real-time
- Result summary shows: imported, skipped (duplicates), failed counts
- Duplicate calls not re-imported (deduplication logic)
- Call records appear in list after successful import

### TC-CALL-005: Filter and Search Call Records
**Steps:**
1. On the Call Records page, use available filters (date range, call type, project)
2. Search by subject or participant name

**Expected:**
- Filters narrow the list correctly
- Multiple filters combine correctly (AND logic)
- Clear filters restores full list
- Empty state shown when no records match

### TC-CALL-006: Start Timer from Call Record
**Steps:**
1. On the Call Records page or within a call record detail
2. Click the "Start Timer" button on a call record
3. Timer starts and counter is visible in the Navbar
4. When finished, stop the timer

**Expected:**
- Timer type set to `call` (not `task`) in `ActiveTimers`
- Navbar shows live elapsed time for the call timer
- Duration of the call record auto-updated when timer is stopped
- Only one active timer allowed at a time (starting a new timer auto-saves existing timer and switches context)

---

## Active Timers

### TC-TIMER-001: Start Task Timer from TaskDetailModal
**Prerequisites:** User has an open task
**Steps:**
1. Open any task via the task detail modal
2. Click the "Start Timer" button in the timer section
3. Observe the elapsed time counter update live

**Expected:**
- Timer starts immediately
- Elapsed time displayed in HH:MM:SS format, updating every second
- `ActiveTimers` record created in database with `TimerType = 'task'` and `TaskId` set
- Timer is user-specific (other users not affected)
- Only one active timer per user is permitted (starting a new one persists existing timer, then starts the new timer)

### TC-TIMER-007: Switch & Save from Active Task Timer
**Prerequisites:** User has an active timer on Task A
**Steps:**
1. Open Task B while Task A timer is still running
2. Click "Switch & Save" in Task B timer area
3. Confirm switch action is started from Task B detail context (not from Timesheet)
4. Observe navbar timer and resulting records

**Expected:**
- Existing timer (Task A) is automatically persisted before Task B timer starts
- A new active timer is created for Task B only after Task A persistence succeeds
- Navbar immediately reflects Task B as running timer context
- Only one `ActiveTimers` row exists for the user at any moment
- Timesheet reflects persisted results after switch; it is not used to initiate context switch

### TC-TIMER-008: Start New Timer While Another Is Active (API Behavior)
**Prerequisites:** User has any active timer (task or call)
**Steps:**
1. Trigger `POST /api/timers/start` for a different context
2. Ensure UI trigger is from target task detail or target call context
3. Inspect resulting persisted data and active timer row

**Expected:**
- Backend auto-persists previous active timer via timer persistence flow
- Previous timer writes to the correct destination:
  - task timer -> new `TimeEntries` row
  - call timer -> `CallRecords.DurationMinutes` update
- Previous active timer row removed and replaced by the new active timer
- Request completes without creating overlapping active timers for same user

### TC-TIMER-002: Navbar Active Timer Indicator
**Prerequisites:** User has an active timer running
**Steps:**
1. Start a timer (task or call)
2. Navigate away from the task/call modal
3. Observe the Navbar

**Expected:**
- Navbar shows a live timer indicator button (e.g., ⏱ HH:MM:SS)
- Counter continues counting in real-time regardless of current page
- Timer polls every ~60 seconds to stay in sync with server
- Clicking the timer indicator opens the timer start/stop modal
- For task timers: shows linked task name and project
- For call timers: shows call subject or call type

### TC-TIMER-003: Stop Timer and Log Time
**Steps:**
1. With an active task timer, open the timer control (from Navbar or task modal)
2. Click "Stop Timer"
3. Confirm the time entry to create

**Expected:**
- Timer stopped and elapsed seconds recorded
- Time entry created automatically for the task with the elapsed hours
- User prompted to confirm/adjust description before saving
- `ActiveTimers` record deleted after stop
- Navbar indicator disappears
- Time entry appears in Timesheet → All Entries

### TC-TIMER-004: Discard Timer
**Steps:**
1. With an active timer running, click "Discard Timer"
2. Confirm the discard action

**Expected:**
- Timer stopped without creating a time entry
- `ActiveTimers` record deleted
- Navbar indicator disappears
- No time entry recorded

### TC-TIMER-005: Call Record Timer Integration
**Steps:**
1. Start a timer from a call record
2. Navigate to the Navbar timer indicator
3. Stop the timer

**Expected:**
- Timer has `TimerType = 'call'` in database
- On stop, the call record's `DurationMinutes` updated with elapsed time
- No separate `TimeEntry` created (call timers feed into call record duration, not time entries)
- Navbar shows call-type timer label

### TC-TIMER-006: Timer Persistence Across Page Reloads
**Steps:**
1. Start a task timer
2. Refresh the browser page
3. Observe Navbar and task modal

**Expected:**
- Timer restored from server on reload (polls `/api/timers/active`)
- Elapsed time calculated from server `StartedAt` timestamp (not client clock)
- Counter synced correctly even if tab was closed for a while
- Timer continues from correct elapsed position, not from zero


## Memos

### TC-MEMO-001: Create Private Memo
**Steps:**
1. Navigate to Memos page
2. Click "Create Memo"
3. Enter title and content (rich text)
4. Set visibility to "Private"
5. Add tags (comma-separated)
6. Click "Save"

**Expected:**
- Memo created successfully
- Only visible to creator
- Tags saved and can be used for filtering
- Rich text formatting preserved

### TC-MEMO-002: Create Organization/Public Memo
**Steps:**
1. Create memo with "Organizations" or "Public" visibility
2. Login as different user
3. Check if memo is visible

**Expected:**
- **Organizations**: Visible to users in creator's organizations
- **Public**: Visible to all users in system
- Visibility enforcement works correctly

### TC-MEMO-003: Calendar-Based Date Filtering
**Steps:**
1. Navigate to Memos page
2. By default, all memos shown (no date filter)
3. Click on a specific date in calendar
4. Date filter activated, shows only memos from that date
5. Click the same date again
6. Date filter removed, shows all memos again

**Expected:**
- Default: All memos across all dates shown
- Click date: Filters to that specific date only
- Click same date again: Removes date filter (back to all memos)
- "Clear Date Filter" button appears when filter active
- Calendar highlights selected date when filter active

### TC-MEMO-004: Tag Filtering
**Steps:**
1. Create memos with tags: "meeting", "idea", "todo"
2. Create Filter by "meeting" tag
3. Add "idea" tag filter
4. Remove "meeting" tag filter
5. Clear all filters

**Expected:**
- Tag filter shows only memos with selected tags
- Multiple tags can be filtered (AND logic)
- Click tag again to remove filter
- "Clear All Filters" button works
- Tag counts shown accurately

### TC-MEMO-005: Visibility Filtering
**Steps:**
1. Filter by "Private" memos
2. Filter by "Organizations" memos
3. Filter by "Public" memos
4. Select "All" memos

**Expected:**
- Each visibility filter shows correct memos
- "All" shows all visible memos (respecting permissions)
- Counts accurate for each visibility level

### TC-MEMO-006: Edit and Delete Memo
**Steps:**
1. Create memo
2. Edit memo content, tags, visibility
3. Save changes
4. Delete memo

**Expected:**
- Changes saved successfully
- Visibility changes enforced immediately
- Delete removes memo from all views
- Creator can edit/delete own memos
- Cannot edit/delete others' memos (unless admin)

---

## Permissions

### TC-PERM-001: Role-Based Permission Enforcement
**Steps:**
1. Create user with specific role (Developer, Support, Manager)
2. Login as that user
3. Try to access features based on permissions

**Expected:**
- **Developer**:
  - Can view dashboard, planning, reports
  - Can manage projects, tasks
  - Cannot manage organizations, users
  - Cannot manage tickets (unless assigned)

- **Support**:
  - Can manage tickets
  - Can view dashboard
  - Cannot manage projects, tasks (unless permitted)
  - Cannot manage organizations, users

- **Manager**:
  - Can view all reports
  - Can manage tasks, projects
  - Can approve time entries
  - Cannot manage organizations, users (unless admin)

### TC-PERM-002: Permission Combination (Multiple Roles)
**Steps:**
1. Assign user multiple roles (Developer + Support)
2.Login as user
3. Verify permissions

**Expected:**
- User gets permissions from ALL assigned roles (OR logic)
- Has both Developer AND Support capabilities
- UI shows all permitted actions
- Backend allows all permitted operations

### TC-PERM-003: Admin Override
**Steps:**
1. Login as admin user
2. Access all features

**Expected:**
- Admin has ALL permissions regardless of role assignments
- Can access all pages, perform all actions
- Cannot be restricted by permission groups

### TC-PERM-004: Organization Permission Groups
**Steps:**
1. Create organization permission group with specific permissions
2. Assign user to organization with this permission group
3. Login as user
4. Verify organization-specific permissions override

**Expected:**
- Permission group permissions applied within organization
- Global role permissions applied in other organizations
- Organization permissions override global where specified

### TC-PERM-005: Application Management Permissions
**Steps:**
1. User with `CanManageApplications`: Create/edit/delete applications
2. User without permission: Try same actions

**Expected:**
- **With permission**: All actions allowed
- **Without permission**: Buttons hidden, API requests denied

### TC-PERM-006: Release Management Permissions
**Steps:**
1. User with `CanManageApplicationReleases`: Create/edit versions, print PDFs
2. User without permission: Try same actions

**Expected:**
- **With permission**: Can manage releases
- **Without permission**: Buttons hidden, API requests denied

### TC-PERM-007: Backend Permission Validation
**Steps:**
1. User without permission
2. Try to make API call directly (e.g., POST /api/applications)

**Expected:**
- API returns 403 Forbidden
- Error message indicates insufficient permissions
- No unauthorized data modification

---

## Jira Integration

### TC-JIRA-001: Configure Jira for Tickets
**Steps:**
1. Navigate to organization settings
2. Go to "Jira Integration" section
3. Enter Jira URL, Email, API Token
4. Enter Project Key
5. Click "Test Connection"
6. Click "Save"

**Expected:**
- Connection test succeeds
- API token encrypted before storage (AES-256-CBC)
- Integration enabled
- Jira-related fields appear in ticket forms

### TC-JIRA-002: Configure Jira for Projects
**Steps:**
1. In organization Jira settings
2. Enter separate Jira Projects URL, Email, API Token
3. Save configuration
4. Navigate to project settings
5. Enter Jira Board ID field appears
6. Enter board ID and save

**Expected:**
- Projects Jira instance configured
- Board ID field only shows when Projects integration configured
- Project linked to Jira board

### TC-JIRA-003: Search Jira Issues for Tickets
**Steps:**
1. Create/edit ticket
2. Click "Search Jira" button
3. Enter search query
4. Select Jira issue from results
5. Import issue data

**Expected:**
- Search queries Jira for Tickets instance
- Results displayed with issue key, summary, status
- Selecting issue imports data into ticket
- Ticket linked to Jira issue (ExternalTicketId)

### TC-JIRA-004: View Jira Links in Tasks
**Steps:**
1. Create task from ticket with Jira link
2. Open task detail modal
3. View Jira badge/link

**Expected:**
- Task shows Jira issue key badge
- Badge links to Jira ticket (opens in new tab)
- Clicking badge navigates to correct Jira URL

### TC-JIRA-005: View Project Board Issues
**Steps:**
1. Navigate to project with Jira Board ID configured
2. Click "View Jira Board" or similar feature
3. Import issues from Jira board

**Expected:**
- Queries Jira for Projects instance
- Fetches issues from specified board
- Displays issue list
- Can import issues as tasks

### TC-JIRA-006: Jira Integration Security
**Steps:**
1. Configure Jira integration
2. Check database
3. Verify API tokens encrypted

**Expected:**
- API tokens stored as encrypted values (AES-256-CBC)
- Decryption occurs only when making API calls
- Tokens never exposed in logs or API responses

### TC-JIRA-007: Check Jira Ticket Status (Batch Update from Planning)
**Prerequisites:** Jira integration configured for tickets; project has tasks linked to Jira issues
**Steps:**
1. Navigate to project detail page → Tasks/Kanban tab
2. Click the "Import Tasks" dropdown
3. Select "🔍 Check Jira Ticket Status"
4. Modal opens; system fetches current Jira statuses for all linked tickets
5. View list of tickets grouped by changed vs unchanged
6. Toggle "Show only changed" filter
7. Configure global Jira → Task status mapping in the mapping panel
8. Override the mapping for specific tickets individually using per-ticket status selects
9. Select tickets to update using checkboxes (Select All / Deselect All)
10. Click "Apply Updates"

**Expected:**
- Modal lists each Jira-linked task with: Jira issue key, Jira summary, current Jira status, current task status
- "Show only changed" filter hides tickets where Jira status already matches task status
- No tickets pre-selected by default (starts with empty selection)
- "Select All" selects all visible tickets; "Deselect All" clears selection
- Global status mapping panel maps Jira status names → local task status values
- Per-ticket override overrides the global mapping for that specific ticket
- Per-ticket override dropdown shows only when user interacts with it
- After clicking "Apply Updates": task statuses updated in bulk for selected tickets
- Count of updated tasks shown in success message
- Only selected tickets are updated (unselected tickets unchanged)

---

## API Tokens

### TC-API-001: Create and List API Tokens
**Steps:**
1. Navigate to Profile → API Tokens
2. Create token with name and optional expiry
3. Copy full `pt_...` secret on creation
4. Refresh token list

**Expected:**
- Full secret shown only once at creation
- List shows prefix, name, active status, last used, expiry
- Admin users can see all tokens; regular users see only their own

### TC-API-002: Revoke API Token
**Steps:**
1. Create a token and verify it works on an API call
2. Deactivate token from Profile → API Tokens
3. Retry API call
4. Delete token permanently

**Expected:**
- Deactivated token returns 403 immediately (cache invalidated)
- Deleted token cannot be reactivated
- Activity/security: token no longer listed after delete

### TC-API-003: Webhook Authentication with API Token
**Prerequisites:** Email task queue or custom webhook integration  
**Steps:**
1. `POST /api/webhooks/email-task-queue` without token → expect 401
2. POST with invalid `pt_...` → expect 403
3. POST with valid active token and valid body → expect 201/200

**Expected:**
- Webhook rejects missing/invalid tokens
- Valid token allows request; business rules still apply (registered sender email, etc.)

---

## Outlook Calendar Integration

### TC-OUTLOOK-001: Enable Outlook Calendar in System Settings
**Prerequisites:** Admin access; Azure app registration with Calendar.Read permissions  
**Steps:**
1. Navigate to Administration → System Settings
2. Enable Outlook calendar integration
3. Enter Tenant ID, Client ID, Client Secret (Secret **Value**, not Secret ID)
4. Save settings

**Expected:**
- Credentials encrypted at rest (`ENCRYPTION_KEY` or `JWT_SECRET`)
- Settings masked on GET (secrets not returned in plain text)
- Integration can be disabled without deleting stored credentials

### TC-OUTLOOK-002: Outlook Events in Planning
**Prerequisites:** TC-OUTLOOK-001; users have mailbox with calendar events in visible date range  
**Steps:**
1. Open Planning Gantt
2. Wait for Outlook events to load
3. Verify events on user rows for the planning date range

**Expected:**
- Events fetched for visible planning window only
- Other users' events shown as "Busy" (privacy)
- Own events show subject and time range
- Non-all-day events reduce daily availability hours

### TC-OUTLOOK-003: Start Timer from Outlook Event
**Steps:**
1. Click an Outlook event block on your own row in Planning
2. Choose "Start Call Timer" in the modal

**Expected:**
- Active timer started with event subject as context
- Timer visible in navbar indicator
- Can stop timer and log time entry

---

## Email Task Queue (Cloudflare)

### TC-QUEUE-001: Webhook Receives Email
**Prerequisites:** Cloudflare Worker deployed per [cloudflare/README.md](cloudflare/README.md)  
**Steps:**
1. Send email from registered user to queue address
2. Check Activity Logs for `EMAIL_QUEUE_RECEIVED`
3. Query `EmailTaskQueue` table or use GET `/api/email-task-queue`

**Expected:**
- Row created with subject, normalized body, sender, `ExternalMessageId`
- Status `pending`
- Duplicate Message-ID returns 200 (idempotent)

### TC-QUEUE-002: Import Queued Email as Task
**Steps:**
1. Open project with import permission
2. Import Tasks → Import from Outlook Queue
3. Select item and confirm import

**Expected:**
- Task created in selected project
- Queue item marked imported / removed from pending list
- User's queue cache invalidated

### TC-QUEUE-003: Dismiss Queue Item
**Steps:**
1. Open Import from Outlook Queue
2. Dismiss an item without importing

**Expected:**
- Item removed from pending queue
- No task created

### TC-QUEUE-004: Unregistered Sender Rejected
**Steps:**
1. Send email from address not matching any active `Users.Email`
2. Check webhook response

**Expected:**
- Webhook returns 202 (accepted but not queued) or equivalent non-create response
- No queue row for unknown sender

---

## GitHub & Gitea Integration

### TC-GH-001: Configure GitHub Integration per Organization
**Steps:**
1. Navigate to organization settings → Integrations
2. Enable GitHub integration
3. Enter GitHub URL and personal access token
4. Save

**Expected:**
- Token encrypted at rest
- Integration can be disabled independently of Jira

### TC-GH-002: Import Tasks from GitHub Issues
**Prerequisites:** GitHub integration configured; project linked  
**Steps:**
1. Open project → Import Tasks → GitHub
2. Search/select issues
3. Import selected issues as tasks

**Expected:**
- Tasks created with GitHub issue number reference
- Duplicate import prevented for same issue
- GitHub fields shown only when integration enabled

### TC-GITEA-001: Configure and Import from Gitea
**Steps:**
1. Configure Gitea integration (URL + token) at organization level
2. Import issues into a project (same flow as GitHub)

**Expected:**
- Gitea issues imported as tasks with `GiteaIssueNumber`
- Search/import UI mirrors GitHub pattern

---

## Redis Cache

### TC-REDIS-001: Application Runs Without Redis
**Prerequisites:** `REDIS_ENABLED=false` or Redis unavailable  
**Steps:**
1. Start application
2. `GET /health`
3. Create/read tasks, projects, planning data

**Expected:**
- Health returns `redis: disabled` (or `error` without failing overall health)
- All features work via direct database reads
- No errors in logs related to cache

### TC-REDIS-002: Redis Enabled — Health and Reads
**Prerequisites:** Redis running; `REDIS_ENABLED=true`  
**Steps:**
1. Start app with Redis connected
2. `GET /health` → verify `redis: connected`
3. Load Planning, project Kanban, dashboard KPIs twice

**Expected:**
- Second load may be faster (cache hit)
- Data identical to database
- `/health` still healthy if Redis later goes down (degraded reads)

### TC-REDIS-003: Invalidate-on-Write (Tasks)
**Prerequisites:** `REDIS_ENABLED=true`  
**Steps:**
1. Load project tasks (populates cache)
2. Create, edit, and delete a task
3. Reload project tasks and Planning after each operation

**Expected:**
- Changes visible on next read without waiting for TTL
- Scoped cache keys cleared (e.g. `project:{id}:tasks:all`)
- No ghost tasks after delete

### TC-REDIS-004: Real-Time Endpoints Not Cached
**Steps:**
1. With Redis enabled, start active timer
2. Poll `/api/timers/active` and `/api/notifications/count` rapidly

**Expected:**
- Responses always reflect current state (not served from entity cache)
- Timer start/stop immediately visible

---

## Email Notifications

### TC-EMAIL-001: Configure SMTP
**Steps:**
1. Navigate to Administration → System Settings
2. Go to "Email Settings" section
3. Enter SMTP Host, Port, Username, Password
4. Select encryption type (TLS/SSL)
5. Enter FROM name and address
6. Click "Test Email"
7. Click "Save"

**Expected:**
- Test email sent successfully
- Password encrypted before storage
- Email settings saved
- System can send notifications

### TC-EMAIL-002: Task Assignment Notification
**Steps:**
1. Assign task to user
2. Check user's email

**Expected:**
- User receives email notification
- Email contains task details, link to task
- Sender is configured FROM address

### TC-EMAIL-003: @Mention Notification
**Steps:**
1. Add comment to task with @username
2. Check mentioned user's email

**Expected:**
- Mentioned user receives email
- Email contains comment text and task link
- Works in task and ticket comments

### TC-EMAIL-004: Due Date Reminder
**Steps:**
1. Create task with due date tomorrow
2. Wait for daily reminder job to run
3. Check assignee's email

**Expected:**
- Email sent 1 day before due date
- Contains task details and link
- Not sent again on same day (deduplication)

### TC-EMAIL-005: User Email Preferences
**Steps:**
1. Navigate to Profile → Email Preferences
2. Disable specific notification types
3. Trigger those notifications

**Expected:**
- Disabled notifications not sent
- Enabled notifications sent normally
- Preferences saved per user

---

## Search & Navigation

### TC-SEARCH-001: Global Search
**Steps:**
1. Click search icon in navbar
2. Enter search query
3. View results across categories

**Expected:**
- Results shown for: Tasks, Projects, Organizations, Users
- Results appear as you type (debounced)
- Each category paginated separately
- Click result navigates to detail page

### TC-SEARCH-002: Paginated Search Results
**Steps:**
1. Perform search with many results
2. Scroll to end of category
3. Click "Load More" button

**Expected:**
- Next page of results appended to list
- No scroll jump/reset
- Previous results remain visible
- Works independently per category

### TC-SEARCH-003: Searchable Dropdowns
**Steps:**
1. Open any searchable dropdown (customers, applications, versions)
2. Type search query
3. Select option

**Expected:**
- Dropdown filters in real-time
- Case-insensitive search
- Matches label and subtitle (if present)
- Selected option displayed
- Works with large datasets (100+ items)

### TC-SEARCH-004: Searchable Multi-Select
**Steps:**
1. Open searchable multi-select (customers in applications)
2. Search for items
3. Select multiple items
4. Clear all selections

**Expected:**
- Search filters checkbox list
- Can select multiple items
- Selected count displayed ("X selected")
- "Clear all" button removes all selections
- Click outside closes dropdown

---

## Dark Mode & UI

### TC-UI-001: Dark Mode Toggle
**Steps:**
1. Click theme toggle in navbar
2. Switch between light and dark modes

**Expected:**
- UI instantly switches themes
- All components support dark mode
- Text remains readable
- Colors properly contrasted
- Preference saved (persists on refresh)

### TC-UI-002: Dark Mode System Preference
**Steps:**
1. Set OS to dark mode
2. Open application without manual toggle

**Expected:**
- Application automatically uses dark mode
- Respects OS preference by default
- Can still override with manual toggle

### TC-UI-003: Responsive Design (Mobile)
**Steps:**
1. Open application on mobile device or resize browser to width ≤767px
2. With **top** navbar layout: open hamburger and navigate to Dashboard, Projects, Timesheet
3. On Dashboard / Project detail: switch tabs via the horizontal tab bar
4. Open a task (`TaskDetailModal`) and switch tabs
5. Open Timesheet Daily and Weekly views; open edit entry modal if available
6. Open Customer / Organization / Profile / Administration detail pages and switch tabs via the horizontal tab bar
7. Open Tickets, Call Records, Work Summary, Approvals — confirm tables scroll horizontally and toolbars wrap
8. Open Applications → Versions tab — version list stacks above detail on phone
9. Open Login / Register — forms usable; name fields stack on register
10. Open Planning Gantt with a user who has Plan Tasks permission; try to drag an allocation bar
11. On Project / Customer / Organization detail: switch to a non-default tab, hard-refresh, confirm `?tab=` restores the panel
12. Admin → System Settings → Branding: upload a logo (or favicon) and confirm preview + navbar/favicon update after save/reload

**Expected:**
- Layout adapts to mobile screen
- Top navigation collapses to hamburger menu (left layout keeps its existing hamburger)
- Sidebars (dashboard, project, customer, org, profile, admin) become horizontal tabs below `md`
- Tables scroll horizontally where still used; projects list prefers grid on phone
- TaskDetailModal fits as a full-height sheet with scrollable tabs
- Forms and shared modals usable on mobile (stacked actions / grids)
- Planning shows a read-only device banner; bars are not draggable; planning tools / deletes stay hidden; widen past 767px to edit again
- Detail sidebars keep the active tab across refresh via `?tab=`
- Branding upload stores a local `/uploads/branding/…` path (external URLs still allowed for branding)

### TC-UI-003b: Install app (PWA) on Dashboard
**Prerequisites:** Mobile viewport (≤767px) or phone browser; HTTPS or localhost  
**Steps:**
1. Open `/dashboard` on a phone (or narrow Chrome DevTools device mode)
2. Confirm an “Install app” banner appears (unless already installed or previously dismissed)
3. On Chromium: tap **Install app** when the browser deferred prompt is available
4. On iOS Safari: follow Share → Add to Home Screen tips
5. Open the installed shortcut and confirm standalone full-screen (no browser chrome)

**Expected:**
- Banner only on Dashboard and only on mobile / non-standalone
- Dismiss (“Not now”) hides the banner for that browser (localStorage)
- Installed app opens at `/dashboard` in standalone display mode
- `/manifest.webmanifest` and `/sw.js` are reachable

### TC-UI-004: Rich Text Editor
**Steps:**
1. Open any form with rich text editor (task, ticket, memo)
2. Use formatting toolbar: Bold, Italic, Headings, Lists
3. Paste/upload image
4. Add links
5. Save and view

**Expected:**
- All formatting options work
- Images uploaded (max 5MB) and displayed inline
- Links clickable in view mode
- HTML rendered correctly with Tailwind Typography
- Plain text preview in list views (HTML stripped)

### TC-UI-005: Tooltips and Help Text
**Steps:**
1. Hover over icons, buttons, complex fields
2. Read tooltips and placeholders

**Expected:**
- Helpful tooltips displayed
- Clear placeholder text in inputs
- Field descriptions where needed
- Visual cues for required fields

---

## Integration & End-to-End Scenarios

### TC-E2E-001: Complete Project Lifecycle
**Steps:**
1. Create organization
2. Add team members
3. Create customer
4. Create application and versions
5. Create project linked to application and customer
6. Create tasks for project
7. Link tasks to application version
8. Allocate tasks in planning Gantt
9. Log time entries
10. Create release with linked tasks and patch notes
11. Export release to PDF
12. close project

**Expected:**
- All steps complete successfully
- Data maintains integrity across features
- Reports show accurate data
- PDF export contains all expected information

### TC-E2E-002: Ticket to Task Workflow
**Steps:**
1. Customer creates ticket
2. Ticket auto-assigned to support user
3. Support user triages ticket
4. Ticket converted to task
5. Task allocated to developer in planning
6. Developer logs time
7. Task completed
8. Ticket marked as resolved

**Expected:**
- Auto-assignment works
- Notifications sent at each step
- Task links to ticket
- Time entries associated correctly
- Status updates reflected in both ticket and task

### TC-E2E-003: Multi-Organization User
**Steps:**
1. Create 2 organizations
2. Create user and add to both organizations
3. Assign different roles in each organization
4. Login as user
5. Switch between organizations
6. Verify data isolation and permissions

**Expected:**
- User sees data from both organizations
- Cannot see data from organizations they're not in
- Permissions differ by organization
- Project/task/ticket lists filtered correctly

---

## Performance & Stress Testing

### TC-PERF-001: Large Dataset Handling
**Steps:**
1. Create 100+ projects
2. Create 1000+ tasks
3. Create 100+ customers
4. Navigate pages, use search, use dropdowns

**Expected:**
- Pages load within acceptable time (<2s)
- Searchable dropdowns handle large lists efficiently
- Pagination works smoothly
- No browser lag or freezing
- Database queries optimized

### TC-PERF-002: Concurrent Users
**Steps:**
1. Have 10+ users logged in simultaneously
2. Perform various actions (create/edit/delete)
3. Check for conflicts

**Expected:**
- No data corruption
- Concurrent edits handled gracefully
- Real-time updates where applicable
- No race conditions

### TC-PERF-003: Redis Cache Performance (Optional)
**Prerequisites:** `REDIS_ENABLED=true`, Redis connected  
**Steps:**
1. Cold-load Planning page (clear Redis or restart app)
2. Note load time
3. Reload Planning without data changes
4. Create a task and reload again

**Expected:**
- Repeat read faster on cache hit (Planning bootstrap, task lists)
- After task create, next load shows new data (invalidation, not stale TTL)
- Redis failure falls back to DB without user-visible error

---

## Security Testing

### TC-SEC-001: SQL Injection Prevention
**Steps:**
1. Try entering SQL injection in search fields, form inputs
2. Examples: `'; DROP TABLE Users--`, `1' OR '1'='1`

**Expected:**
- All inputs properly sanitized
- Parameterized queries prevent injection
- No database errors exposed

### TC-SEC-002: XSS Prevention
**Steps:**
1. Try entering JavaScript in text fields
2. Examples: `<script>alert('XSS')</script>`, `<img src=x onerror=alert('XSS')>`

**Expected:**
- Scripts not executed
- Rich text editor sanitizes dangerous HTML
- Content escaped properly in display

### TC-SEC-003: Authorization Bypass Attempts
**Steps:**
1. Login as regular user
2. Try to access admin endpoints directly (API calls)
3. Try to access other organizations' data

**Expected:**
- 403 Forbidden for unauthorized endpoints
- Cannot view/edit data from other organizations
- Backend enforces permissions on all mutations

### TC-SEC-004: Password Security
**Steps:**
1. Create user with password
2. Check database

**Expected:**
- Password stored as bcrypt hash
- Original password never stored in plaintext
- Hash not reversible

### TC-SEC-005: API Token Security
**Steps:**
1. Create API token; verify full secret not stored in database (only hash)
2. Attempt to use revoked/expired token
3. Try accessing another user's resources with a valid token (scope = token owner only)

**Expected:**
- Only `TokenHash` stored server-side
- Revoked/expired tokens rejected
- Token authenticates as owning user only (no privilege escalation)

### TC-SEC-006: JWT Token Security
**Steps:**
1. Login and capture JWT token
2. Modify token payload
3. Try to use modified token

**Expected:**
- Modified token rejected
- Signature verification prevents tampering
- Token stored in HTTP-only cookie (not accessible via JavaScript)

---

## Backup & Recovery

### TC-BCK-001: Database Backup (MySQL)
**Steps:**
1. Create mysqldump backup
2. Verify backup file created
3. Check backup contains all data

**Expected:**
- Backup file created successfully
- Contains all tables and data
- No corruption

### TC-BCK-001b: Database Backup (MSSQL)
**Prerequisites:** `DB_PROVIDER=mssql`  
**Steps:**
1. Run `BACKUP DATABASE` to a `.bak` file
2. Verify backup file size and completion

**Expected:**
- Backup completes without errors
- Restore possible on same or compatible SQL Server instance

### TC-BCK-002: Database Restore
**Steps:**
1. Create test data
2. Create backup
3. Delete test data
4. Restore from backup
5. Verify data restored

**Expected:**
- Restore completes successfully
- All data recovered
- Application functional after restore

### TC-BCK-003: Upload Files Backup
**Steps:**
1. Upload attachments to tasks/tickets
2. Backup `/app/uploads` directory
3. Delete uploads
4. Restore uploads
5. Verify files accessible

**Expected:**
- Upload files backed up
- Restore successful
- Attachments downloadable after restore

---

## Edge Cases & Error Handling

### TC-EDGE-001: Empty States
**Steps:**
1. View pages with no data (new organization)
2. Check empty states for projects, tasks, tickets, etc.

**Expected:**
- Friendly empty state messages
- Call-to-action buttons to create first item
- No broken UI or errors

### TC-EDGE-002: Network Failures
**Steps:**
1. Disconnect network while performing action
2. Try to save form
3. Reconnect network

**Expected:**
- Graceful error message
- Data not lost (if possible)
- Retry mechanism or clear instruction to resubmit

### TC-EDGE-003: File Upload Limits
**Steps:**
1. Try to upload file >5MB
2. Try to upload invalid file type
3. Try to upload file with special characters in name

**Expected:**
- File size validation works
- File type validation works
- Special characters handled or sanitized
- Clear error messages

### TC-EDGE-004: Date Range Edge Cases
**Steps:**
1. Select end date before start date
2. Select invalid dates in reports
3. Test date calculations across timezone boundaries

**Expected:**
- Validation prevents invalid date ranges
- Clear error messages
- Dates handled consistently (UTC or configurable timezone)

### TC-EDGE-005: Circular Dependencies
**Steps:**
1. Create Task A depends on Task B
2. Try to make Task B depend on Task A

**Expected:**
- System prevents circular dependencies
- Validation error shown
- Dependency graph remains acyclic

---

## Browser Compatibility

### TC-BROWSER-001: Chrome/Edge
**Steps:**
1. Test all features in Chrome and Edge

**Expected:**
- All features work correctly
- No console errors
- UI renders properly

### TC-BROWSER-002: Firefox
**Steps:**
1. Test all features in Firefox

**Expected:**
- All features work correctly
- No console errors
- UI renders properly

### TC-BROWSER-003: Safari
**Steps:**
1. Test all features in Safari (macOS/iOS)

**Expected:**
- All features work correctly
- No console errors
- UI renders properly
- Touch interactions work on iOS

---

### TC-REPORT-001: Reporting hub — personal user
**Steps:**
1. Login as internal user with `CanViewReports` who is not admin/manager
2. Open Reporting from nav (`/reporting`)
3. Confirm default tab is **Extract** (no My Work pack — personal work stays on Dashboard)
4. Confirm Organization / Portfolio / Explore tabs are not shown
5. Open **Extract**, load a dataset, export CSV

**Expected:**
- Hub loads on Extract only for non-managers
- No org-wide packs or Explore
- Extract returns data scoped by membership / filters

### TC-REPORT-002: Reporting hub — manager organization overview
**Steps:**
1. Login as manager or admin with org membership
2. Open `/reporting` — default should be **Organization**
3. Select organization + date range; note “vs previous” deltas
4. Click Health / Risk cards to drill to Portfolio / Data Quality
5. Open Capacity and Data Quality; export one Data Quality CSV
6. From Portfolio / Delivery / Data Quality, open a project link and a task (task opens Task Detail modal)

**Expected:**
- Overview shows health/effort/delivery/risk with period comparison
- Drill keeps org + date context
- Project links go to `/projects/:id`; tasks open Task Detail modal
- No cross-org data for orgs the user does not belong to

### TC-REPORT-003: Explore gated to admins/managers
**Steps:**
1. As non-manager with `CanViewReports`, try `/reporting?tab=explore` and `/web-reports`
2. As manager, open Explore from hub and `/web-reports`

**Expected:**
- Non-manager denied / redirected to Extract; API `/api/saved-reports` returns 403
- Manager can use pivots and saved reports

### TC-REPORT-004: Customer user excluded
**Steps:**
1. Login as customer portal user
2. Attempt `/reporting` and `/api/reporting/organization-overview`

**Expected:**
- UI blocked / redirected; APIs return 403; no org effort data

### TC-REPORT-005: Digest schedule
**Steps:**
1. As manager, on Organization tab add a weekly digest with a test recipient
2. Confirm schedule appears in list; delete it

**Expected:**
- Row stored in `OrganizationReportDigests`; delete removes it

---

## Summary

1. **Critical Path**: Execute all TC-E2E-* scenarios first
2. **Feature Coverage**: Run all TC-*-001 scenarios for basic feature validation
3. **Security**: Run all TC-SEC-* scenarios
4. **Cache (if Redis enabled)**: Run all TC-REDIS-* scenarios
5. **Integrations**: Run TC-JIRA-*, TC-API-*, TC-OUTLOOK-*, TC-QUEUE-*, TC-GH-* as applicable
6. **Edge Cases**: Run TC-EDGE-* scenarios
7. **Regression**: Run all scenarios when making significant changes

**Test Completion Checklist:**
- [ ] All Authentication tests passed (including API tokens)
- [ ] All Organization tests passed (including task types with icons)
- [ ] All Customer tests passed
- [ ] All Application & Release tests passed
- [ ] All Project tests passed
- [ ] All Task tests passed (including Outlook queue import, cache coherence)
- [ ] All Ticket tests passed
- [ ] All Planning tests passed (including Outlook overlay, task type icons)
- [ ] All Time Tracking tests passed
- [ ] All Call Records tests passed
- [ ] All Active Timer tests passed
- [ ] All Memo tests passed
- [ ] All Permission tests passed
- [ ] All Jira Integration tests passed
- [ ] All API Token tests passed
- [ ] All Outlook Calendar tests passed
- [ ] All Email Task Queue tests passed
- [ ] All GitHub/Gitea tests passed (if used)
- [ ] All Redis Cache tests passed (if `REDIS_ENABLED=true`)
- [ ] All Email notification tests passed
- [ ] All Search tests passed
- [ ] All Reporting Hub tests passed (TC-REPORT-*)
- [ ] All UI tests passed
- [ ] All E2E scenarios passed
- [ ] All Security tests passed
- [ ] Browser compatibility verified

**Estimated Testing Time:** 10-14 hours for complete coverage (add 1-2h if testing Redis + Cloudflare queue)

**Priority Levels:**
- **P0 (Critical)**: Authentication, Authorization, Data Integrity, Cache invalidation (if Redis on)
- **P1 (High)**: Core features (Projects, Tasks, Planning, Time Tracking)
- **P2 (Medium)**: Integrations (Jira, Outlook, Email Queue, GitHub/Gitea, Memos)
- **P3 (Low)**: UI polish, Browser compatibility edge cases


### TC-BUDGET-RATE-001 — Project/task hourly rate cascade

**Preconditions:** User with `CanViewBudgetInfo`; monetary-budget project; users with/without `HourlyRate`.

1. Set project HourlyRate; leave task rate empty; log time as a user with a different user rate → cost uses **project** rate.
2. Set task HourlyRate → cost for that task’s time uses **task** rate.
3. Clear project and task rates; user has HourlyRate → cost uses **user** rate.
4. Clear all rates → Reporting Portfolio shows hours-without-rate warning; cost treats rate as 0.
5. Clear project Budget → task HourlyRate field is hidden; saving task clears task HourlyRate.
6. Portfolio budget spent for monetary projects matches Projects list/detail spend (typed cost, not raw hours).

