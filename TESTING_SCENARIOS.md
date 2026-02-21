# Testing Scenarios - Project Management App

This document contains comprehensive test scenarios to verify all functionality is working correctly. Test scenarios are organized by feature area with detailed steps and expected results.

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
10. [Memos](#memos)
11. [Permissions](#permissions)
12. [Jira Integration](#jira-integration)
13. [Email Notifications](#email-notifications)
14. [Search & Navigation](#search--navigation)
15. [Dark Mode & UI](#dark-mode--ui)

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
**Prerequisites:** User with `CanManageApplications` permission  
**Steps:**
1. Navigate to Applications page
2. Click "Create Application"
3. Fill in: Name, Description (rich text), Repository URL
4. Select organization
5. Select associated customers using searchable dropdown
6. Click "Create"

**Expected:**
- Application created successfully
- Associated with selected organization
- Customers linked to application
- Appears in applications list
- Available in project/task application dropdowns

### TC-APP-002: Edit Application
**Steps:**
1. Navigate to Applications page
2. Click on an application
3. Edit application details
4. Modify customer associations
5. Click "Save Changes"

**Expected:**
- Changes saved successfully
- Customer associations updated
- Changes reflected in application list and detail page

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
- **Allocations**: All task allocations by date and user
- **Time Entries**: All logged time with descriptions
- CSV export downloads correctly with all data
- Hours match Overview tab (using leaf tasks only)

---

## Tasks

### TC-TASK-001: Create Task
**Prerequisites:** User with `CanCreateTasks` permission  
**Steps:**
1. From project Kanban or directly from Tasks
2. Click "Create Task"
3. Fill in: Name, Description (rich text), Status, Priority
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

---

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
1. Open application on mobile device or resize browser to mobile width
2. Navigate through pages
3. Open modals, dropdowns

**Expected:**
- Layout adapts to mobile screen
- Navigation collapses to hamburger menu
- Tables scroll horizontally
- Modals fit screen
- Touch interactions work
- Forms usable on mobile

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

### TC-SEC-005: JWT Token Security
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

### TC-BCK-001: Database Backup
**Steps:**
1. Create mysqldump backup
2. Verify backup file created
3. Check backup contains all data

**Expected:**
- Backup file created successfully
- Contains all tables and data
- No corruption

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

## Summary

This document contains **150+ test scenarios** covering all major features and edge cases. For a full validation:

1. **Critical Path**: Execute all TC-E2E-* scenarios first
2. **Feature Coverage**: Run all TC-*-001 scenarios for basic feature validation
3. **Security**: Run all TC-SEC-* scenarios
4. **Edge Cases**: Run TC-EDGE-* scenarios
5. **Regression**: Run all scenarios when making significant changes

**Test Completion Checklist:**
- [ ] All Authentication tests passed
- [ ] All Organization tests passed
- [ ] All Customer tests passed
- [ ] All Application & Release tests passed
- [ ] All Project tests passed
- [ ] All Task tests passed
- [ ] All Ticket tests passed
- [ ] All Planning tests passed
- [ ] All Time Tracking tests passed
- [ ] All Memo tests passed
- [ ] All Permission tests passed
- [ ] All Jira Integration tests passed
- [ ] All Email tests passed
- [ ] All Search tests passed
- [ ] All UI tests passed
- [ ] All E2E scenarios passed
- [ ] All Security tests passed
- [ ] Browser compatibility verified

**Estimated Testing Time:** 8-12 hours for complete coverage

**Priority Levels:**
- **P0 (Critical)**: Authentication, Authorization, Data Integrity
- **P1 (High)**: Core features (Projects, Tasks, Planning, Time Tracking)
- **P2 (Medium)**: Secondary features (Memos, Jira, Email)
- **P3 (Low)**: UI polish, edge cases, browser compatibility
