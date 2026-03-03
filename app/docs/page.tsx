'use client';

import Navbar from '@/components/Navbar';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface ManualSection {
  id: string;
  title: string;
  purpose: string;
  whenToUse: string;
  steps: string[];
  tips: string[];
  commonMistakes: string[];
  imagePlaceholders: { label: string; fileName: string; note: string }[];
}

interface FeatureDetailSection {
  id: string;
  title: string;
  modulePurpose: string;
  createFlow: string[];
  editFlow: string[];
  deleteFlow: string[];
  optionExplanations: { option: string; meaning: string }[];
  moduleRelations: string[];
  imagePlaceholders: { label: string; fileName: string; note: string }[];
}

interface WorkflowPlaybook {
  id: string;
  title: string;
  goal: string;
  modulesInvolved: string[];
  steps: string[];
  doneCriteria: string[];
}

interface FieldDictionaryEntry {
  field: string;
  whereUsed: string;
  whatItControls: string;
  howToChoose: string;
  commonError: string;
}

interface RoleMatrixRow {
  module: string;
  admin: string;
  manager: string;
  support: string;
  developer: string;
  customerUser: string;
}

interface PermissionMatrixRow {
  module: string;
  admin: string;
  manager: string;
  support: string;
  developer: string;
  customerUser: string;
}

const manualSections: ManualSection[] = [
  {
    id: 'start',
    title: 'Getting Started',
    purpose: 'Understand the interface and confirm your account is ready for daily work.',
    whenToUse: 'Use this on your first login, after role changes, or when changing organizations.',
    steps: [
      'Open the main navigation and identify your available modules.',
      'Open your user menu and review profile shortcuts (Profile, Docs, Theme).',
      'Confirm you can access your expected work areas (for example Projects, Timesheet, Tickets).',
      'If a required module is missing, request permission updates from your manager/admin.',
    ],
    tips: [
      'Use the search box in the navbar for quick navigation to tasks, projects, and users.',
      'Keep your profile details updated so mentions and assignments are clear for teammates.',
    ],
    commonMistakes: [
      'Assuming missing menu items are a bug; most are permission-based visibility rules.',
      'Starting work before confirming timezone/work-hours profile settings.',
    ],
    imagePlaceholders: [
      { label: 'Main navigation overview', fileName: 'docs-getting-started-navigation.png', note: 'Capture top menu and/or left sidebar with sections visible.' },
      { label: 'User menu shortcuts', fileName: 'docs-getting-started-user-menu.png', note: 'Capture profile dropdown with key options.' },
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    purpose: 'Get a fast overview of workload, calendar events, and performance trends.',
    whenToUse: 'Open at the start of every day and before planning weekly priorities.',
    steps: [
      'Review Overview for active tasks and current activity indicators.',
      'Open Calendar tab to inspect planned allocations, time entries, and events by date.',
      'Use Analytics tab and switch period filters to compare trends.',
      'Open linked tasks directly from dashboard widgets to take action quickly.',
    ],
    tips: [
      'Use dashboard as your daily standup prep screen.',
      'If numbers look wrong, validate task statuses and time entries first.',
    ],
    commonMistakes: [
      'Using analytics without checking selected period filters.',
      'Interpreting dashboard cards without considering permission-limited data scope.',
    ],
    imagePlaceholders: [
      { label: 'Dashboard overview widgets', fileName: 'docs-dashboard-overview.png', note: 'Capture top summary cards and key lists.' },
      { label: 'Dashboard calendar tab', fileName: 'docs-dashboard-calendar-tab.png', note: 'Capture calendar with events and timeline context.' },
      { label: 'Dashboard analytics tab', fileName: 'docs-dashboard-analytics-tab.png', note: 'Capture period selector and chart/cards.' },
    ],
  },
  {
    id: 'projects-tasks',
    title: 'Projects and Tasks',
    purpose: 'Track delivery scope and execute work through task-level operations.',
    whenToUse: 'Use whenever you create, update, assign, or review project work.',
    steps: [
      'Open Projects and select the project you will work on.',
      'Use the project tabs (Overview, Kanban, Gantt, Reporting) based on your goal.',
      'Create/update tasks with clear names, ownership, due dates, and estimated hours.',
      'Use parent-child structure to break large work into subtasks when needed.',
      'Keep task comments and attachments up to date for handovers and audits.',
    ],
    tips: [
      'Use specific action verbs in task names (for example “Implement”, “Review”, “Validate”).',
      'When work is blocked, update status immediately and document blocker context.',
    ],
    commonMistakes: [
      'Creating parent tasks without actionable subtasks.',
      'Leaving old assignees/statuses unchanged after responsibility transitions.',
    ],
    imagePlaceholders: [
      { label: 'Projects list screen', fileName: 'docs-projects-list.png', note: 'Capture project cards/table and filters.' },
      { label: 'Project detail tabs', fileName: 'docs-project-detail-tabs.png', note: 'Capture Overview/Kanban/Gantt/Reporting tab row.' },
      { label: 'Task detail modal', fileName: 'docs-task-detail-modal.png', note: 'Capture fields for status, assignee, due date, comments, attachments.' },
    ],
  },
  {
    id: 'planning',
    title: 'Planning (Gantt)',
    purpose: 'Build and adjust delivery plans with clear ownership and realistic dates.',
    whenToUse: 'Use for sprint/weekly planning, allocation balancing, and replan actions.',
    steps: [
      'Open Planning and select the relevant date range/view mode (Week, Month, Year).',
      'Review current assignments and user capacity before adding allocations.',
      'Allocate hours to tasks on specific days and monitor availability feedback.',
      'Use replanning when deadlines shift; confirm the remaining hours strategy.',
      'Validate that critical tasks have planned dates and assigned owners.',
    ],
    tips: [
      'Use Week mode for detailed scheduling and Month/Year for macro balancing.',
      'Review current-day highlight to quickly anchor timeline discussions.',
    ],
    commonMistakes: [
      'Planning without checking already allocated hours for the same user/date.',
      'Overallocating parent tasks without validating child task distribution.',
    ],
    imagePlaceholders: [
      { label: 'Planning timeline (week mode)', fileName: 'docs-planning-week-mode.png', note: 'Capture user rows, day columns, and allocations.' },
      { label: 'Planning allocation modal', fileName: 'docs-planning-allocation-modal.png', note: 'Capture fields for hours/date/user assignment.' },
      { label: 'Planning current-day highlight', fileName: 'docs-planning-today-highlight.png', note: 'Capture blue today column and header marker.' },
    ],
  },
  {
    id: 'timesheet',
    title: 'Timesheet',
    purpose: 'Record actual work done and keep utilization/reporting accurate.',
    whenToUse: 'Use daily for logging hours and weekly for review/adjustment.',
    steps: [
      'Use Daily Entry for quick logging on a specific task/date.',
      'Use Weekly Grid to fill or review the entire week in one place.',
      'Open All Entries to filter historical logs and export when needed.',
      'Before finalizing, verify task/date/hours/description are correct.',
      'If approvals are active, submit entries according to your team process.',
    ],
    tips: [
      'Write concise, action-based descriptions (what was done and why).',
      'Log time at the end of each day to avoid memory-based estimates later.',
    ],
    commonMistakes: [
      'Entering hours on wrong dates due to week navigation confusion.',
      'Editing approved entries and expecting changes to persist.',
    ],
    imagePlaceholders: [
      { label: 'Timesheet daily entry', fileName: 'docs-timesheet-daily-entry.png', note: 'Capture daily form with task and hours fields.' },
      { label: 'Timesheet weekly grid', fileName: 'docs-timesheet-weekly-grid.png', note: 'Capture rows by task and day columns.' },
      { label: 'Timesheet all entries + export', fileName: 'docs-timesheet-all-entries-export.png', note: 'Capture filters and CSV/PDF export buttons.' },
    ],
  },
  {
    id: 'tickets',
    title: 'Tickets',
    purpose: 'Manage support demands and customer/internal issue lifecycle.',
    whenToUse: 'Use for incident handling, service requests, and communication tracking.',
    steps: [
      'Create a ticket with clear title, category/type, priority, and details.',
      'Assign owner(s) and keep status aligned with real progress.',
      'Use comments for updates and attach relevant files/evidence.',
      'Convert to task when development work must be tracked in project flow.',
      'Close/resolved only after confirmation and proper documentation.',
    ],
    tips: [
      'Use consistent ticket descriptions to speed triage and search.',
      'Link related tickets/tasks to preserve end-to-end traceability.',
    ],
    commonMistakes: [
      'Using vague titles like “Problem” or “Urgent” without context.',
      'Skipping status updates after assignment changes.',
    ],
    imagePlaceholders: [
      { label: 'Tickets list and filters', fileName: 'docs-tickets-list-filters.png', note: 'Capture ticket table/cards and filter controls.' },
      { label: 'Ticket detail view', fileName: 'docs-ticket-detail.png', note: 'Capture timeline/comments/attachments section.' },
      { label: 'Convert ticket to task flow', fileName: 'docs-ticket-convert-to-task.png', note: 'Capture conversion action and confirmation state.' },
    ],
  },
  {
    id: 'memos',
    title: 'Memos',
    purpose: 'Capture notes and share information with controlled visibility.',
    whenToUse: 'Use for meeting notes, ideas, internal references, and lightweight logs.',
    steps: [
      'Create memo with title and rich content.',
      'Set visibility (Private, Organizations, Public) based on intended audience.',
      'Add tags for retrieval and filtering consistency.',
      'Use calendar date selection when you need date-specific review.',
      'Clear filters to return to global memo view.',
    ],
    tips: [
      'Use predictable tags (for example team names, projects, themes).',
      'Keep private notes separate from shared operational notes.',
    ],
    commonMistakes: [
      'Forgetting visibility scope and oversharing internal notes.',
      'Applying too many inconsistent tags that reduce search value.',
    ],
    imagePlaceholders: [
      { label: 'Memos calendar and list', fileName: 'docs-memos-calendar-list.png', note: 'Capture date selection and memo list together.' },
      { label: 'Memo editor and visibility selector', fileName: 'docs-memos-editor-visibility.png', note: 'Capture rich editor and visibility dropdown.' },
    ],
  },
  {
    id: 'calls',
    title: 'Call Records',
    purpose: 'Keep structured communication logs linked to real work context.',
    whenToUse: 'Use after meetings/calls with customers, stakeholders, or internal teams.',
    steps: [
      'Open Call Records and create a new record after each relevant call.',
      'Fill participants, call type, subject, time, and concise notes.',
      'Link project/task where applicable to keep context centralized.',
      'Use date filters to review communication history before follow-ups.',
    ],
    tips: [
      'Record action items and owners in the notes field.',
      'Use consistent subject prefixes for recurring meetings.',
    ],
    commonMistakes: [
      'Saving incomplete records without participants or clear summary.',
      'Keeping call notes outside the platform, breaking traceability.',
    ],
    imagePlaceholders: [
      { label: 'Call records list', fileName: 'docs-calls-list.png', note: 'Capture call history with date filter controls.' },
      { label: 'Call record form', fileName: 'docs-calls-form.png', note: 'Capture key fields including participants/subject/notes.' },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications and Mentions',
    purpose: 'Respond quickly to assignments, updates, and mentions.',
    whenToUse: 'Use continuously during the day and before ending your shift.',
    steps: [
      'Check the navbar bell icon for unread count.',
      'Open notification dropdown for quick triage.',
      'Go to Notifications page for complete history and deeper context.',
      'Open linked entities directly (task, ticket, project) and update status as needed.',
    ],
    tips: [
      'Triage unread notifications by urgency first.',
      'After acting on an item, verify it is no longer pending in your queue.',
    ],
    commonMistakes: [
      'Treating notification read status as work completion.',
      'Ignoring mention notifications that contain blockers or requests.',
    ],
    imagePlaceholders: [
      { label: 'Navbar notifications dropdown', fileName: 'docs-notifications-dropdown.png', note: 'Capture unread list from bell icon.' },
      { label: 'Notifications history page', fileName: 'docs-notifications-page.png', note: 'Capture full list with actions/filters.' },
    ],
  },
  {
    id: 'profile',
    title: 'Profile and Preferences',
    purpose: 'Maintain personal settings that affect planning and usability.',
    whenToUse: 'Use during onboarding and whenever schedule/preferences change.',
    steps: [
      'Open My Profile from the user menu.',
      'Review personal details and update as needed.',
      'Set work hours correctly for each weekday.',
      'Set recurring allocation blocks if your team uses scheduled routines.',
      'Review theme and navigation preferences for your workflow.',
    ],
    tips: [
      'Update work-hours immediately after schedule changes (part-time, shift change).',
      'Keep recurring blocks realistic so planning availability stays accurate.',
    ],
    commonMistakes: [
      'Leaving default work-hours values that do not match your real capacity.',
      'Creating overlapping recurring blocks that reduce useful planning slots.',
    ],
    imagePlaceholders: [
      { label: 'Profile account settings', fileName: 'docs-profile-account-settings.png', note: 'Capture personal details section.' },
      { label: 'Profile work hours + recurring', fileName: 'docs-profile-work-hours-recurring.png', note: 'Capture availability and recurring allocation controls.' },
    ],
  },
  {
    id: 'customer-users',
    title: 'Customer User Experience',
    purpose: 'Clarify what customer users can expect in a scoped interface.',
    whenToUse: 'Use this section when onboarding customer users.',
    steps: [
      'Use Dashboard for high-level visibility and Tickets for support interactions.',
      'Create tickets using the minimal form and provide complete context.',
      'Track progress from ticket statuses and comments.',
      'Use attachments when evidence is required (screenshots, logs, files).',
    ],
    tips: [
      'Write expected result vs actual result for faster support triage.',
      'Use one issue per ticket to avoid mixed troubleshooting threads.',
    ],
    commonMistakes: [
      'Expecting internal-only modules (Planning, Organizations, Administration).',
      'Trying to set project assignment when restricted by customer-safe flow.',
    ],
    imagePlaceholders: [
      { label: 'Customer ticket creation form', fileName: 'docs-customer-ticket-create.png', note: 'Capture simplified customer ticket form.' },
      { label: 'Customer ticket tracking view', fileName: 'docs-customer-ticket-tracking.png', note: 'Capture status timeline/comments from customer perspective.' },
    ],
  },
  {
    id: 'vacations-holidays',
    title: 'Vacations and Holidays',
    purpose: 'Manage personal availability and understand non-working day impacts on planning.',
    whenToUse: 'Use when requesting time off, validating calendar availability, or planning around holidays.',
    steps: [
      'Open vacation-related views (profile/approvals context depending on permission).',
      'Create vacation request with correct date range and confirm working-day calculation.',
      'Review approved/pending/rejected status before planning commitments.',
      'Verify holidays in your country/organization calendar so timelines stay realistic.',
      'Re-check Planning and task dates after vacations/holidays are applied.',
    ],
    tips: [
      'Submit vacation requests early to reduce allocation conflicts.',
      'Coordinate vacations with sprint/release milestones whenever possible.',
    ],
    commonMistakes: [
      'Assuming every date in range counts as vacation day (non-working days can be skipped).',
      'Planning critical deliveries without checking holiday overlap.',
    ],
    imagePlaceholders: [
      { label: 'Vacation request form', fileName: 'docs-vacations-request-form.png', note: 'Capture date range selection and validation feedback.' },
      { label: 'Vacation approval status view', fileName: 'docs-vacations-approval-status.png', note: 'Capture pending/approved/rejected visibility.' },
      { label: 'Holiday calendar overview', fileName: 'docs-holidays-calendar-overview.png', note: 'Capture holiday list/calendar by year/country.' },
    ],
  },
  {
    id: 'settings-overview',
    title: 'Global and Organization Settings (User Perspective)',
    purpose: 'Explain where settings live and how they affect user experience.',
    whenToUse: 'Use when behavior differs across organizations or feature visibility changes unexpectedly.',
    steps: [
      'Check your current organization context first.',
      'Identify whether behavior comes from global settings (system-wide) or organization settings (tenant-specific).',
      'For missing features, confirm feature flags and permissions with admin/manager.',
      'For custom statuses/priorities/types, validate organization-level configuration.',
      'Re-test your workflow after settings updates to confirm expected behavior.',
    ],
    tips: [
      'Treat settings changes as process changes and communicate them to users.',
      'Document organization-specific status semantics to reduce ambiguity.',
    ],
    commonMistakes: [
      'Assuming one organization configuration applies to all organizations.',
      'Confusing permission restrictions with disabled feature flags.',
    ],
    imagePlaceholders: [
      { label: 'Administration global settings page', fileName: 'docs-settings-global-admin-page.png', note: 'Capture key global toggles and system options.' },
      { label: 'Organization settings tabs', fileName: 'docs-settings-organization-tabs.png', note: 'Capture organization-level tabs (members, permissions, statuses, etc).' },
      { label: 'Custom statuses/priorities config', fileName: 'docs-settings-custom-status-priority.png', note: 'Capture value, color, default semantics configuration.' },
    ],
  },
  {
    id: 'exports',
    title: 'Reports and Exports (User Scope)',
    purpose: 'Generate user-facing outputs from filtered work data.',
    whenToUse: 'Use for weekly/monthly reviews, handovers, and management summaries.',
    steps: [
      'Open Reports or module-specific export areas (for example Timesheet All Entries).',
      'Apply filters first (date range, project, user, status where available).',
      'Export data (CSV/PDF where available in that screen).',
      'Validate output scope before sharing externally.',
    ],
    tips: [
      'Save exact filter combinations if you run recurring reporting routines.',
      'Cross-check totals with the selected period before distribution.',
    ],
    commonMistakes: [
      'Exporting without filters and sharing overly broad data.',
      'Comparing reports built from different date windows.',
    ],
    imagePlaceholders: [
      { label: 'Reports page filters', fileName: 'docs-reports-filters.png', note: 'Capture reports filter controls and generated output panel.' },
      { label: 'Timesheet export buttons', fileName: 'docs-timesheet-export-buttons.png', note: 'Capture CSV/PDF export actions in All Entries tab.' },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting and FAQ',
    purpose: 'Resolve common user-side issues before escalating support.',
    whenToUse: 'Use whenever data, visibility, or workflow actions appear incorrect.',
    steps: [
      'If a page is missing, verify organization and permissions first.',
      'If a task/ticket cannot be edited, check status/approval/ownership constraints.',
      'If filters return unexpected results, clear all filters and reapply one by one.',
      'If exports look wrong, validate selected period and active filters before retrying.',
      'Escalate with screenshots, entity IDs, and timestamp of issue reproduction.',
    ],
    tips: [
      'Capture exact steps and data used when reporting a bug.',
      'Include expected vs actual behavior in every support request.',
    ],
    commonMistakes: [
      'Reporting generic “not working” without reproducible steps.',
      'Ignoring hidden active filters in list views.',
    ],
    imagePlaceholders: [
      { label: 'Clear filters example', fileName: 'docs-troubleshooting-clear-filters.png', note: 'Capture active filters + clear button in a list page.' },
      { label: 'Support-ready bug report example', fileName: 'docs-troubleshooting-report-example.png', note: 'Capture a good issue report template with IDs and context.' },
    ],
  },
  {
    id: 'tips',
    title: 'Daily Best Practices',
    purpose: 'Maintain high-quality project data with lightweight habits.',
    whenToUse: 'Apply continuously during normal daily work.',
    steps: [
      'Start day: check Dashboard + Notifications and list your top priorities.',
      'During day: keep statuses current and log time after work blocks.',
      'Before meetings: review task/ticket comments and attach latest evidence.',
      'End day: verify remaining blockers and update ownership/status clearly.',
    ],
    tips: [
      'Use short, objective notes with timestamps for critical updates.',
      'Prefer one source of truth per work item (avoid duplicating status elsewhere).',
    ],
    commonMistakes: [
      'Batch-updating everything at end of week, causing data drift.',
      'Leaving blockers in comments without status change.',
    ],
    imagePlaceholders: [
      { label: 'Example daily workflow checklist', fileName: 'docs-daily-workflow-checklist.png', note: 'Capture a sample checklist card for daily routine.' },
    ],
  },
  {
    id: 'scope',
    title: 'What This Manual Covers',
    purpose: 'Set expectations for this guide scope.',
    whenToUse: 'Read once to understand boundaries of this documentation.',
    steps: [
      'This manual focuses on end-user operations and day-to-day workflows.',
      'Administration, server setup, and database internals are intentionally excluded.',
      'Permission differences are expected; your organization can enable/disable modules.',
      'Use this guide together with team-specific SOPs when available.',
    ],
    tips: [
      'Maintain a small internal appendix for team-specific naming/status conventions.',
    ],
    commonMistakes: [
      'Using end-user manual for admin configuration tasks.',
    ],
    imagePlaceholders: [
      { label: 'Manual scope summary card', fileName: 'docs-manual-scope-summary.png', note: 'Capture top-of-page scope and audience statement.' },
    ],
  },
];

const featureDetails: FeatureDetailSection[] = [
  {
    id: 'detail-projects',
    title: 'Projects and Tasks - Complete Reference',
    modulePurpose: 'Plan and execute delivery using projects, tasks, hierarchy, and progress tracking.',
    createFlow: [
      'Create a project from Projects list (name, organization, dates, status).',
      'Open project detail and create tasks with status, priority, type, assignee, and estimates.',
      'For large work, create parent tasks and then subtasks using Parent Task relation.',
      'If ticket-driven, link task to ticket or convert from ticket flow where available.',
    ],
    editFlow: [
      'Edit project settings when scope, dates, or status changes.',
      'Edit task fields in task modal: assignee, status, priority, type, dates, description.',
      'Update dependencies when execution order changes.',
      'Keep comments/attachments current to preserve implementation context.',
    ],
    deleteFlow: [
      'Delete tasks only when they are invalid/duplicate and not needed for traceability.',
      'Before deleting parent tasks, review child tasks and linked allocations/time entries.',
      'Delete projects only when organization policy allows and data is no longer needed.',
    ],
    optionExplanations: [
      { option: 'Task Status', meaning: 'Execution stage of a task (for example To Do, In Progress, Done). Status values are organization-specific and can include closed/cancelled semantics.' },
      { option: 'Task Priority', meaning: 'Business urgency (for example Low, Medium, High). Use consistently for triage and reports.' },
      { option: 'Task Type', meaning: 'Nature of work (for example Feature, Bug, Support, Chore), used for filtering and analytics.' },
      { option: 'Parent Task', meaning: 'Creates hierarchy; child tasks roll up into parent-level visibility.' },
      { option: 'Depends On Task', meaning: 'Blocks start/progress until predecessor task is completed.' },
      { option: 'Estimated Hours', meaning: 'Planned effort; should represent realistic implementation time.' },
    ],
    moduleRelations: [
      'Organizations -> Projects (project belongs to one organization).',
      'Projects -> Tasks (project has many tasks).',
      'Tasks -> TaskAllocations (planned effort by date/user).',
      'Tasks -> TimeEntries (actual effort logged by users).',
      'Tasks -> Tickets (optional support-to-delivery linkage).',
    ],
    imagePlaceholders: [
      { label: 'Create project modal', fileName: 'docs-detail-project-create-modal.png', note: 'Capture project create fields and status selector.' },
      { label: 'Task create/edit modal', fileName: 'docs-detail-task-create-edit-modal.png', note: 'Capture task fields including status/priority/type/dependency.' },
      { label: 'Task hierarchy example', fileName: 'docs-detail-task-hierarchy-example.png', note: 'Capture parent + child task structure in one view.' },
    ],
  },
  {
    id: 'detail-planning',
    title: 'Planning and Allocations - Complete Reference',
    modulePurpose: 'Transform task backlog into realistic date/user plans with capacity control.',
    createFlow: [
      'Open Planning and choose timeline mode (Week, Month, Year).',
      'Select a task and allocate hours to user/date combinations.',
      'For parent tasks, distribute planned hours to child tasks when needed.',
      'Confirm start/end dates auto-adjust according to allocations.',
    ],
    editFlow: [
      'Adjust allocated hours when priorities or team capacity changes.',
      'Replan tasks considering already worked hours and remaining effort.',
      'Move allocations across dates carefully to avoid overbooking users.',
    ],
    deleteFlow: [
      'Remove wrong allocations rather than creating compensating negative entries.',
      'When deleting parent/child allocations, re-check resulting task dates and capacity.',
    ],
    optionExplanations: [
      { option: 'View Mode', meaning: 'Week (detailed), Month (mid-range), Year (long-range) timeline granularity.' },
      { option: 'Allocated Hours', meaning: 'Planned hours for a user on a specific date; affects availability.' },
      { option: 'Replan', meaning: 'Reschedules remaining hours after accounting for time already worked.' },
      { option: 'Current Day Highlight', meaning: 'Visual marker to orient planning around today.' },
    ],
    moduleRelations: [
      'Planning consumes Tasks as planning units.',
      'Planning checks User work-hours profile for daily capacity limits.',
      'Planning data should align with Timesheet actuals for accurate forecasts.',
    ],
    imagePlaceholders: [
      { label: 'Planning allocation interaction', fileName: 'docs-detail-planning-allocation-interaction.png', note: 'Capture assigning hours to a user/day cell.' },
      { label: 'Replan confirmation example', fileName: 'docs-detail-planning-replan-confirmation.png', note: 'Capture replan flow with remaining-hours validation.' },
    ],
  },
  {
    id: 'detail-timesheet',
    title: 'Timesheet and Approvals - Complete Reference',
    modulePurpose: 'Track real effort and keep approval/reporting processes accurate.',
    createFlow: [
      'Add entries in Daily or Weekly view with task, date, and hours.',
      'Include useful work description for auditability and context.',
      'Use All Entries for review and exports once entries are complete.',
    ],
    editFlow: [
      'Adjust hours/descriptions before approval lock.',
      'Correct task/date mapping when work was logged under wrong item.',
      'Use weekly review to normalize inconsistent entries.',
    ],
    deleteFlow: [
      'Remove invalid entries (or set to 0 in grid behavior where supported).',
      'Do not delete approved entries unless your policy explicitly allows rollback.',
    ],
    optionExplanations: [
      { option: 'Daily View', meaning: 'Fast single-day entry interface.' },
      { option: 'Weekly Grid', meaning: 'Spreadsheet-style interface for complete week input/review.' },
      { option: 'All Entries', meaning: 'Historical list with filtering and export actions.' },
      { option: 'Approval Status', meaning: 'Approved entries may become read-only and count as finalized.' },
    ],
    moduleRelations: [
      'Timesheet entries are linked to Tasks and Users.',
      'Time data feeds project reporting and analytics.',
      'Approvals module consumes Timesheet records for manager decisions.',
    ],
    imagePlaceholders: [
      { label: 'Weekly grid with saved entries', fileName: 'docs-detail-timesheet-weekly-saved.png', note: 'Capture several tasks with hours across weekdays.' },
      { label: 'Approvals time tab', fileName: 'docs-detail-approvals-time-tab.png', note: 'Capture approve/reject workflow from approver perspective.' },
    ],
  },
  {
    id: 'detail-tickets',
    title: 'Tickets, Statuses, and Conversion - Complete Reference',
    modulePurpose: 'Manage service lifecycle with clear ownership, communication, and transition rules.',
    createFlow: [
      'Create ticket with title, description, priority, and category/type.',
      'Assign responsible user(s) and keep ticket context updated via comments/attachments.',
      'If work requires delivery tracking, convert ticket to task and follow task lifecycle.',
    ],
    editFlow: [
      'Update status based on real workflow stage (not only to tidy list views).',
      'Reassign when ownership changes and add transition note in comments/history.',
      'Adjust priority when impact/urgency changes.',
    ],
    deleteFlow: [
      'Delete only invalid/duplicate tickets according to policy.',
      'Prefer resolving/closing instead of deleting for auditability.',
    ],
    optionExplanations: [
      { option: 'Ticket Status', meaning: 'Current lifecycle stage; organizations can customize labels/colors while keeping status type meaning (for example open/in_progress/waiting/resolved/closed).' },
      { option: 'Status Type', meaning: 'Normalized behavior category used by system logic and consistent filtering independent of custom status names.' },
      { option: 'Ticket Priority', meaning: 'Urgency/impact level for support triage and SLA handling.' },
      { option: 'Assignee / Developer', meaning: 'Operational owner and optional technical owner depending on process.' },
      { option: 'Convert to Task', meaning: 'Creates delivery item in project space while preserving service context.' },
    ],
    moduleRelations: [
      'Tickets can be linked to Customers and Organizations.',
      'Tickets can convert into Tasks for delivery execution.',
      'Ticket updates produce Notifications and history events.',
      'Jira-integrated tickets may include external issue context/links.',
    ],
    imagePlaceholders: [
      { label: 'Ticket status dropdown examples', fileName: 'docs-detail-ticket-status-options.png', note: 'Capture custom status options and selected value.' },
      { label: 'Ticket history timeline', fileName: 'docs-detail-ticket-history-timeline.png', note: 'Capture status/assignee/comment history in detail view.' },
      { label: 'Ticket-to-task conversion confirmation', fileName: 'docs-detail-ticket-task-conversion-confirm.png', note: 'Capture conversion action and resulting task linkage.' },
    ],
  },
  {
    id: 'detail-status-config',
    title: 'Custom Status and Priority Values - User Interpretation',
    modulePurpose: 'Help end users understand what each selectable status/priority/type option means in daily operation.',
    createFlow: [
      'Select values from dropdowns while creating tickets/tasks.',
      'Prefer team-standard naming and transitions for consistency.',
    ],
    editFlow: [
      'Update status/priority/type as work reality changes.',
      'When uncertain between statuses, use Status Type semantics as decision reference.',
    ],
    deleteFlow: [
      'End users usually do not delete status values; this is organization configuration scope.',
    ],
    optionExplanations: [
      { option: 'To Do / Open', meaning: 'Work has not started yet.' },
      { option: 'In Progress', meaning: 'Work is actively being executed.' },
      { option: 'Waiting / Blocked', meaning: 'Work is paused awaiting dependency/external input.' },
      { option: 'Resolved / Done', meaning: 'Work is completed and ready for validation/closure.' },
      { option: 'Closed / Cancelled', meaning: 'Terminal state; no further action expected unless reopened.' },
      { option: 'Priority Low/Medium/High/Critical', meaning: 'Relative urgency and impact; align with SLA expectations and business risk.' },
    ],
    moduleRelations: [
      'Status and priority selections affect filtering, dashboards, and reports.',
      'Status transitions can drive notifications and automation depending on configuration.',
      'Shared option semantics improve cross-team communication and metric quality.',
    ],
    imagePlaceholders: [
      { label: 'Task status + priority selector example', fileName: 'docs-detail-task-status-priority-selector.png', note: 'Capture both selectors in task modal.' },
      { label: 'Ticket status type interpretation guide', fileName: 'docs-detail-ticket-status-type-guide.png', note: 'Capture status list with type meaning annotation.' },
    ],
  },
  {
    id: 'detail-vacations-holidays',
    title: 'Vacations and Holidays - Complete Reference',
    modulePurpose: 'Control user availability, avoid scheduling conflicts, and keep planning realistic.',
    createFlow: [
      'Create vacation requests with start/end dates and verify computed days.',
      'For approvers, review and approve/reject requests in approvals area.',
      'Configure/import holiday calendars (where permission exists) by country/year.',
      'Ensure planning reflects non-working periods before confirming allocations.',
    ],
    editFlow: [
      'Update pending vacation requests when dates change.',
      'Adjust holiday entries when official calendars are updated.',
      'Re-balance allocations and task dates after availability changes.',
    ],
    deleteFlow: [
      'Delete invalid/duplicated vacation requests only according to policy.',
      'Remove incorrect holiday entries to avoid false non-working constraints.',
    ],
    optionExplanations: [
      { option: 'Vacation Status', meaning: 'Approval state of request (pending/approved/rejected) controlling planning visibility and execution.' },
      { option: 'Working-Day Calculation', meaning: 'Skips non-working weekdays according to user schedule when counting vacation days.' },
      { option: 'Holiday Date', meaning: 'Marks non-working date at calendar level for planning and scheduling awareness.' },
      { option: 'Approval Action', meaning: 'Manager/admin action that finalizes availability impact.' },
    ],
    moduleRelations: [
      'Vacations/holidays affect Planning user availability.',
      'Dashboard calendar reflects non-working periods for operational awareness.',
      'Approvals module governs final state for vacation requests.',
    ],
    imagePlaceholders: [
      { label: 'Vacation approvals list', fileName: 'docs-detail-vacation-approvals-list.png', note: 'Capture approval queue and actions.' },
      { label: 'Vacation calendar impact in planning', fileName: 'docs-detail-vacation-planning-impact.png', note: 'Capture blocked/non-working dates in planning timeline.' },
      { label: 'Holiday management panel', fileName: 'docs-detail-holiday-management-panel.png', note: 'Capture holiday create/edit list with date/country.' },
    ],
  },
  {
    id: 'detail-settings',
    title: 'Global and Organization Settings - Complete Reference',
    modulePurpose: 'Clarify setting scope and impact: system-wide vs organization-specific.',
    createFlow: [
      'Global settings (admin): configure system-wide behavior (branding, feature toggles, communications).',
      'Organization settings: configure team-specific statuses, priorities, permissions, and integrations.',
      'Define permission groups and membership rules for controlled access.',
    ],
    editFlow: [
      'Update global options carefully because changes affect all users/organizations.',
      'Edit organization settings to match local process without breaking shared standards.',
      'Adjust custom statuses/priorities and defaults when workflow evolves.',
    ],
    deleteFlow: [
      'Remove obsolete custom values only after confirming no active workflow dependency.',
      'Avoid deleting permission structures without migration plan for affected users.',
    ],
    optionExplanations: [
      { option: 'Global Setting', meaning: 'System-level control applied across the entire installation.' },
      { option: 'Organization Setting', meaning: 'Tenant-level configuration affecting only one organization.' },
      { option: 'Permission Group', meaning: 'Organization-scoped access bundle controlling what members can see/do.' },
      { option: 'Is Default (status/priority/type)', meaning: 'Fallback value used when no explicit choice is made.' },
      { option: 'Feature Toggle', meaning: 'Enable/disable specific modules or behaviors in UI/flows.' },
    ],
    moduleRelations: [
      'Global settings influence navbar/module visibility and shared behavior.',
      'Organization settings drive task/ticket value lists and local process rules.',
      'Permissions combine with settings to determine real user experience.',
    ],
    imagePlaceholders: [
      { label: 'System settings key options', fileName: 'docs-detail-system-settings-key-options.png', note: 'Capture high-impact global settings.' },
      { label: 'Organization permissions and members', fileName: 'docs-detail-org-permissions-members.png', note: 'Capture permission groups and membership assignment.' },
      { label: 'Organization status values configuration', fileName: 'docs-detail-org-status-values-config.png', note: 'Capture status/priority/type setup with defaults/colors.' },
    ],
  },
  {
    id: 'detail-relations',
    title: 'Module Relationships Map',
    modulePurpose: 'Explain how data moves across modules so users understand impact of each action.',
    createFlow: [
      'Create Organizations/Projects to establish work containers.',
      'Create Tasks/Tickets and link them when service work becomes delivery work.',
      'Add Allocations (planned) and Time Entries (actual) to track effort lifecycle.',
    ],
    editFlow: [
      'Adjust status/ownership in source modules and validate downstream views (dashboard/reports).',
      'Keep linked entities synchronized (for example ticket update reflected in related task notes).',
    ],
    deleteFlow: [
      'Deleting upstream entities can affect downstream visibility and historical continuity.',
      'Prefer closure/status terminal states over deletion for traceability.',
    ],
    optionExplanations: [
      { option: 'Planned vs Actual', meaning: 'Planning reflects intended effort; Timesheet reflects executed effort.' },
      { option: 'Hierarchy', meaning: 'Parent/child relationships structure work and rollup views.' },
      { option: 'Permissions', meaning: 'Visibility and actions depend on role + organization settings.' },
    ],
    moduleRelations: [
      'Organizations -> Projects -> Tasks -> TimeEntries/Allocations.',
      'Customers -> Tickets -> (optional) Tasks.',
      'Tasks/Tickets updates -> Notifications + Reports + Dashboard summaries.',
      'Profile work-hours/recurrence -> Planning availability calculations.',
    ],
    imagePlaceholders: [
      { label: 'Cross-module data flow diagram', fileName: 'docs-detail-module-relations-flow.png', note: 'Capture or create a visual relationship map between modules.' },
    ],
  },
];

const workflowPlaybooks: WorkflowPlaybook[] = [
  {
    id: 'playbook-ticket-to-delivery',
    title: 'Ticket to Delivery Workflow',
    goal: 'Turn a support request into delivered and tracked implementation work.',
    modulesInvolved: ['Tickets', 'Projects', 'Planning', 'Timesheet', 'Notifications'],
    steps: [
      'Create or triage ticket with clear impact, priority, and desired outcome.',
      'Assign ticket owner and set status to active stage.',
      'Convert ticket to task (or create linked task) in target project.',
      'Plan task allocations in Planning with realistic dates/owners.',
      'Execute and log time in Timesheet against linked task.',
      'Update ticket/task statuses until resolved and documented.',
    ],
    doneCriteria: [
      'Ticket is in terminal status (resolved/closed or equivalent).',
      'Linked task reflects final delivery state and comments/attachments are complete.',
      'Timesheet contains actual effort for reporting consistency.',
    ],
  },
  {
    id: 'playbook-planned-vs-actual',
    title: 'Planned vs Actual Control Workflow',
    goal: 'Keep planning realistic by continuously reconciling allocations and real execution.',
    modulesInvolved: ['Planning', 'Timesheet', 'Dashboard', 'Project Reporting'],
    steps: [
      'Create/adjust allocations in Planning based on capacity and priority.',
      'Log daily actual hours in Timesheet per task.',
      'Review deviations weekly (planned hours vs worked hours).',
      'Replan remaining effort for tasks with schedule drift.',
      'Validate dashboard/report trend consistency after adjustments.',
    ],
    doneCriteria: [
      'Critical tasks have current realistic planned end dates.',
      'Large planned/actual variances are explained and acted on.',
      'Team capacity is not persistently overbooked.',
    ],
  },
  {
    id: 'playbook-release-readiness',
    title: 'Release Readiness Workflow (User Perspective)',
    goal: 'Prepare a reliable release snapshot from task and ticket progress.',
    modulesInvolved: ['Projects', 'Tasks', 'Tickets', 'Applications/Releases', 'Reports'],
    steps: [
      'Filter tasks by target version/scope and verify owners/statuses.',
      'Ensure linked tickets are resolved or documented as known pending items.',
      'Confirm estimates, actual time, and major comments are complete.',
      'Generate exports/reports for release communication.',
    ],
    doneCriteria: [
      'In-scope tasks have final status and proper traceability.',
      'Known exceptions are explicitly documented.',
      'Exported output matches agreed reporting period/scope.',
    ],
  },
];

const fieldDictionary: FieldDictionaryEntry[] = [
  {
    field: 'Status',
    whereUsed: 'Tasks, Tickets',
    whatItControls: 'Lifecycle stage and filtering/reporting visibility.',
    howToChoose: 'Pick the value that reflects real work state right now, not expected future state.',
    commonError: 'Setting status to done before completion evidence exists.',
  },
  {
    field: 'Status Type',
    whereUsed: 'Ticket statuses (organization-defined labels)',
    whatItControls: 'Normalized behavior (open/in_progress/waiting/resolved/closed) regardless of label text.',
    howToChoose: 'Use type semantics as source of truth when labels are customized.',
    commonError: 'Assuming custom label text always implies same behavior across organizations.',
  },
  {
    field: 'Priority',
    whereUsed: 'Tasks, Tickets',
    whatItControls: 'Ordering/urgency for triage and planning decisions.',
    howToChoose: 'Set by impact + urgency; review when context changes.',
    commonError: 'Keeping all items in high priority, making prioritization meaningless.',
  },
  {
    field: 'Task Type',
    whereUsed: 'Tasks',
    whatItControls: 'Work classification for filtering and analytics segmentation.',
    howToChoose: 'Choose the category that best describes the implementation nature.',
    commonError: 'Using type as priority indicator instead of work category.',
  },
  {
    field: 'Assignee',
    whereUsed: 'Tasks, Tickets',
    whatItControls: 'Primary accountable owner for execution/tracking.',
    howToChoose: 'Assign to the person currently responsible for next action.',
    commonError: 'Leaving stale assignees after ownership handoff.',
  },
  {
    field: 'Estimated Hours',
    whereUsed: 'Tasks',
    whatItControls: 'Expected effort used in planning and forecast discussions.',
    howToChoose: 'Use realistic implementation estimate; revise when scope changes.',
    commonError: 'Never updating estimate after major requirement changes.',
  },
  {
    field: 'Allocated Hours',
    whereUsed: 'Planning allocations',
    whatItControls: 'Planned daily effort per user/date and availability consumption.',
    howToChoose: 'Allocate within daily capacity and according to priority sequence.',
    commonError: 'Overbooking same user/day across multiple tasks.',
  },
  {
    field: 'Work Date',
    whereUsed: 'Timesheet entries',
    whatItControls: 'Period attribution for reporting, approvals, and trend analysis.',
    howToChoose: 'Use the actual day the work was performed.',
    commonError: 'Logging all hours on one date at week end.',
  },
  {
    field: 'Parent Task / Dependency',
    whereUsed: 'Task planning and project execution',
    whatItControls: 'Execution structure and sequence constraints.',
    howToChoose: 'Use parent for decomposition; dependency for execution order.',
    commonError: 'Using parent relationship when a dependency relationship is intended.',
  },
];

const roleMatrixRows: RoleMatrixRow[] = [
  {
    module: 'Dashboard',
    admin: 'Monitors global delivery and blockers across organizations.',
    manager: 'Tracks team progress, capacity signals, and upcoming risks.',
    support: 'Follows ticket/task load and operational priorities.',
    developer: 'Checks assigned work and daily execution priorities.',
    customerUser: 'Views customer-scoped summary and ticket progress.',
  },
  {
    module: 'Projects and Tasks',
    admin: 'Creates standards and oversees governance for project data quality.',
    manager: 'Creates/organizes projects, assigns owners, and manages execution.',
    support: 'Creates/supports service-related tasks and links ticket work.',
    developer: 'Executes assigned tasks, updates status/comments, and estimates.',
    customerUser: 'Usually read-only or no access (depends on tenant policy).',
  },
  {
    module: 'Planning (Gantt)',
    admin: 'Audits planning quality and resolves cross-team conflicts.',
    manager: 'Allocates work, rebalances dates/capacity, and approves replans.',
    support: 'Plans support-driven work with delivery teams when applicable.',
    developer: 'Reviews own allocations and flags schedule risks.',
    customerUser: 'Typically no access.',
  },
  {
    module: 'Timesheet',
    admin: 'Audits consistency and approval health across teams.',
    manager: 'Reviews/approves team time and resolves anomalies.',
    support: 'Logs support execution time and keeps ticket effort traceable.',
    developer: 'Logs daily effort per task and maintains clear descriptions.',
    customerUser: 'Typically no access.',
  },
  {
    module: 'Tickets',
    admin: 'Defines global quality expectations and monitors SLA behavior.',
    manager: 'Triage/assignment escalation and closure governance.',
    support: 'Primary owner of ticket lifecycle, communication, and resolution.',
    developer: 'Handles technical implementation linked to tickets.',
    customerUser: 'Creates and follows own tickets via simplified flow.',
  },
  {
    module: 'Vacations and Holidays',
    admin: 'Oversees policy consistency and non-working calendars.',
    manager: 'Approves/rejects vacation requests and balances team availability.',
    support: 'Submits requests and plans support coverage windows.',
    developer: 'Submits requests and adjusts delivery commitments.',
    customerUser: 'No access in standard setups.',
  },
  {
    module: 'Organization Settings',
    admin: 'Can manage organizational configuration and access models.',
    manager: 'May manage local statuses/priorities/permissions (if granted).',
    support: 'Usually consumer of settings; limited edit rights.',
    developer: 'Usually consumer of settings; limited edit rights.',
    customerUser: 'No access.',
  },
  {
    module: 'Global Settings / Administration',
    admin: 'Owns system-wide configuration, feature toggles, branding, and controls.',
    manager: 'Typically no access unless elevated privileges are granted.',
    support: 'No access in standard role model.',
    developer: 'No access in standard role model.',
    customerUser: 'No access.',
  },
  {
    module: 'Reports and Exports',
    admin: 'Audits cross-module metrics and governance indicators.',
    manager: 'Produces team/project reporting and review snapshots.',
    support: 'Exports operational ticket/time views for service follow-up.',
    developer: 'Uses personal/team reports for execution retrospectives.',
    customerUser: 'Limited or no access depending on portal scope.',
  },
];

const permissionMatrixRows: PermissionMatrixRow[] = [
  {
    module: 'Dashboard',
    admin: 'V:✓ C:- E:- D:- A:-',
    manager: 'V:✓ C:- E:- D:- A:-',
    support: 'V:✓ C:- E:- D:- A:-',
    developer: 'V:✓ C:- E:- D:- A:-',
    customerUser: 'V:✓ C:- E:- D:- A:-',
  },
  {
    module: 'Projects',
    admin: 'V:✓ C:✓ E:✓ D:✓ A:-',
    manager: 'V:✓ C:✓ E:✓ D:(policy)',
    support: 'V:(policy) C:(policy) E:(policy) D:(policy)',
    developer: 'V:✓ C:(policy) E:(assigned/scope) D:-',
    customerUser: 'V:(limited/none) C:- E:- D:-',
  },
  {
    module: 'Tasks',
    admin: 'V:✓ C:✓ E:✓ D:✓ A:-',
    manager: 'V:✓ C:✓ E:✓ D:(policy)',
    support: 'V:✓ C:✓ E:✓ D:(policy)',
    developer: 'V:✓ C:(policy) E:(assigned/scope) D:-',
    customerUser: 'V:(limited/none) C:- E:- D:-',
  },
  {
    module: 'Planning',
    admin: 'V:✓ C:✓ E:✓ D:✓ A:-',
    manager: 'V:✓ C:✓ E:✓ D:(policy)',
    support: 'V:(policy) C:(policy) E:(policy) D:-',
    developer: 'V:(own/scope) C:(policy) E:(own/scope) D:-',
    customerUser: 'V:- C:- E:- D:- A:-',
  },
  {
    module: 'Timesheet',
    admin: 'V:✓ C:✓ E:✓ D:(policy) A:✓',
    manager: 'V:✓ C:✓ E:✓ D:(policy) A:✓',
    support: 'V:✓ C:✓ E:✓ D:(own/policy) A:-',
    developer: 'V:✓ C:✓ E:✓ D:(own/policy) A:-',
    customerUser: 'V:- C:- E:- D:- A:-',
  },
  {
    module: 'Tickets',
    admin: 'V:✓ C:✓ E:✓ D:✓ A:✓',
    manager: 'V:✓ C:✓ E:✓ D:(policy) A:✓',
    support: 'V:✓ C:✓ E:✓ D:(policy) A:(workflow)',
    developer: 'V:✓ C:(policy) E:(assigned/scope) D:- A:-',
    customerUser: 'V:✓ C:✓ E:(own limited) D:- A:-',
  },
  {
    module: 'Memos',
    admin: 'V:✓ C:✓ E:✓ D:✓ A:-',
    manager: 'V:✓ C:✓ E:✓ D:(own/policy) A:-',
    support: 'V:✓ C:✓ E:✓ D:(own/policy) A:-',
    developer: 'V:✓ C:✓ E:✓ D:(own/policy) A:-',
    customerUser: 'V:(usually no) C:(usually no) E:- D:- A:-',
  },
  {
    module: 'Call Records',
    admin: 'V:✓ C:✓ E:✓ D:✓ A:-',
    manager: 'V:✓ C:✓ E:✓ D:(own/policy) A:-',
    support: 'V:✓ C:✓ E:✓ D:(own/policy) A:-',
    developer: 'V:✓ C:✓ E:✓ D:(own/policy) A:-',
    customerUser: 'V:- C:- E:- D:- A:-',
  },
  {
    module: 'Vacations / Holidays',
    admin: 'V:✓ C:✓ E:✓ D:✓ A:✓',
    manager: 'V:✓ C:✓ E:(scope) D:(scope) A:✓',
    support: 'V:✓ C:✓ E:(own) D:(own pending) A:-',
    developer: 'V:✓ C:✓ E:(own) D:(own pending) A:-',
    customerUser: 'V:- C:- E:- D:- A:-',
  },
  {
    module: 'Organization Settings',
    admin: 'V:✓ C:✓ E:✓ D:✓ A:✓',
    manager: 'V:(policy) C:(policy) E:(policy) D:(policy) A:(policy)',
    support: 'V:(limited) C:- E:- D:- A:-',
    developer: 'V:(limited) C:- E:- D:- A:-',
    customerUser: 'V:- C:- E:- D:- A:-',
  },
  {
    module: 'Global Settings / Administration',
    admin: 'V:✓ C:✓ E:✓ D:✓ A:✓',
    manager: 'V:(usually no) C:- E:- D:- A:-',
    support: 'V:- C:- E:- D:- A:-',
    developer: 'V:- C:- E:- D:- A:-',
    customerUser: 'V:- C:- E:- D:- A:-',
  },
  {
    module: 'Reports / Exports',
    admin: 'V:✓ C:✓ E:✓ D:(policy) A:-',
    manager: 'V:✓ C:✓ E:(filters/scope) D:- A:-',
    support: 'V:(policy) C:✓ E:(filters/scope) D:- A:-',
    developer: 'V:(policy) C:✓ E:(filters/scope) D:- A:-',
    customerUser: 'V:(limited/none) C:- E:- D:- A:-',
  },
];

function ImagePlaceholderCard({
  title,
  fileName,
  note,
}: {
  title: string;
  fileName: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40 p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">🖼️ {title}</h4>
        <span className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200">placeholder</span>
      </div>
      <p className="text-xs text-gray-700 dark:text-gray-300">
        Suggested filename: <span className="font-semibold">{fileName}</span>
      </p>
      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{note}</p>
      <div className="mt-3 h-24 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
        Drop screenshot here later
      </div>
    </div>
  );
}

function ManualList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
            <span className="mt-1 text-blue-600 dark:text-blue-400">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OptionExplanationList({ items }: { items: { option: string; meaning: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Option explanation</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={`${item.option}-${item.meaning}`} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-700/30">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.option}</p>
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-1">{item.meaning}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowPlaybookCard({ playbook }: { playbook: WorkflowPlaybook }) {
  return (
    <section id={playbook.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{playbook.title}</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300"><span className="font-semibold">Goal:</span> {playbook.goal}</p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        <span className="font-semibold">Modules involved:</span> {playbook.modulesInvolved.join(' -> ')}
      </p>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ManualList title="Workflow steps" items={playbook.steps} />
        <ManualList title="Done criteria" items={playbook.doneCriteria} />
      </div>
    </section>
  );
}

function FieldDictionaryTable({ items }: { items: FieldDictionaryEntry[] }) {
  return (
    <section id="field-dictionary" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Field and Option Dictionary</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Practical reference for core fields used across modules, including how to choose values and common mistakes.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <thead className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
            <tr>
              <th className="text-left p-3">Field</th>
              <th className="text-left p-3">Where Used</th>
              <th className="text-left p-3">What It Controls</th>
              <th className="text-left p-3">How To Choose</th>
              <th className="text-left p-3">Common Error</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.field} className="border-t border-gray-200 dark:border-gray-700 align-top">
                <td className="p-3 font-semibold text-gray-900 dark:text-white">{item.field}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{item.whereUsed}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{item.whatItControls}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{item.howToChoose}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{item.commonError}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RoleResponsibilityMatrix({ rows }: { rows: RoleMatrixRow[] }) {
  return (
    <section id="role-matrix" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Role-by-Role Responsibility Matrix</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Typical responsibilities per module. Final access always depends on configured permissions and organization rules.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[1100px] w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <thead className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
            <tr>
              <th className="text-left p-3">Module</th>
              <th className="text-left p-3">Admin</th>
              <th className="text-left p-3">Manager</th>
              <th className="text-left p-3">Support</th>
              <th className="text-left p-3">Developer</th>
              <th className="text-left p-3">Customer User</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.module} className="border-t border-gray-200 dark:border-gray-700 align-top">
                <td className="p-3 font-semibold text-gray-900 dark:text-white">{row.module}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{row.admin}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{row.manager}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{row.support}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{row.developer}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{row.customerUser}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40 p-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">🖼️ Screenshot placeholder</p>
        <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">Suggested filename: <span className="font-semibold">docs-role-matrix-overview.png</span></p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Capture the full matrix in desktop view for onboarding material.</p>
      </div>
    </section>
  );
}

function PermissionExpectationMatrix({ rows }: { rows: PermissionMatrixRow[] }) {
  const renderPermissionCell = (value: string) => {
    const tokens = value.split(' ').filter(Boolean);

    return (
      <div className="flex flex-wrap gap-1.5">
        {tokens.map((token, index) => {
          const isPermissionToken = token.includes(':');

          if (!isPermissionToken) {
            return (
              <span
                key={`${token}-${index}`}
                className="px-2 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
              >
                {token}
              </span>
            );
          }

          const [labelRaw, statusRaw] = token.split(':');
          const label = String(labelRaw || '').trim();
          const status = String(statusRaw || '').trim();
          const isAllowed = status.includes('✓');
          const isConditional = status.includes('(');

          const badgeClass = isAllowed
            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
            : isConditional
              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';

          return (
            <span
              key={`${token}-${index}`}
              className={`px-2 py-0.5 rounded text-xs font-semibold ${badgeClass}`}
              title={token}
            >
              {label}:{status}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <section id="permission-matrix" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Permission Expectation Matrix (V/C/E/D/A)</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Legend: <span className="font-semibold">V</span>=View, <span className="font-semibold">C</span>=Create, <span className="font-semibold">E</span>=Edit, <span className="font-semibold">D</span>=Delete, <span className="font-semibold">A</span>=Approve.
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        This is an operational expectation guide. Final access always depends on configured role permissions, organization permissions, and feature toggles.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[1150px] w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <thead className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
            <tr>
              <th className="text-left p-3">Module</th>
              <th className="text-left p-3">Admin</th>
              <th className="text-left p-3">Manager</th>
              <th className="text-left p-3">Support</th>
              <th className="text-left p-3">Developer</th>
              <th className="text-left p-3">Customer User</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.module} className="border-t border-gray-200 dark:border-gray-700 align-top">
                <td className="p-3 font-semibold text-gray-900 dark:text-white">{row.module}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{renderPermissionCell(row.admin)}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{renderPermissionCell(row.manager)}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{renderPermissionCell(row.support)}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{renderPermissionCell(row.developer)}</td>
                <td className="p-3 text-gray-700 dark:text-gray-200">{renderPermissionCell(row.customerUser)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/40 p-4">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">🖼️ Screenshot placeholder</p>
        <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">Suggested filename: <span className="font-semibold">docs-permission-matrix-overview.png</span></p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Capture the full permission matrix at desktop width for onboarding and governance guides.</p>
      </div>
    </section>
  );
}

function CsvTemplatesReference() {
  const modules = [
    {
      name: 'Tasks (inside Project detail)',
      exportSupport: 'Template docs + project task exports where available',
      required: ['TaskName'],
      optional: ['Description', 'Status', 'Priority', 'AssignedToUsername', 'DueDate', 'EstimatedHours', 'ParentTaskName', 'PlannedStartDate', 'PlannedEndDate', 'DependsOnTaskName'],
      sample: 'TaskName,Status,Priority,AssignedToUsername,DueDate,EstimatedHours\nDesign API,In Progress,High,john.doe,2026-03-20,8'
    },
    {
      name: 'Customers',
      exportSupport: 'Customers list -> Export CSV',
      required: ['Name', 'OrganizationNames (pipe-separated)'],
      optional: ['ExternalName', 'Email', 'Phone', 'Address', 'Notes', 'DefaultSupportUsername', 'CreateDefaultProject', 'DefaultProjectName'],
      sample: 'Name,OrganizationNames,Email,CreateDefaultProject\nAcme Corp,"Core Org|Support Org",ops@acme.com,true'
    },
    {
      name: 'Organizations',
      exportSupport: 'Organizations list -> Export CSV',
      required: ['Name'],
      optional: ['Abbreviation', 'Description'],
      sample: 'Name,Abbreviation,Description\nNorth Division,ND,Regional operations organization'
    },
    {
      name: 'Applications',
      exportSupport: 'Applications list -> Export CSV',
      required: ['Name', 'OrganizationName'],
      optional: ['Description', 'RepositoryUrl', 'IsCustomerSpecific', 'CustomerNames (pipe-separated)'],
      sample: 'Name,OrganizationName,IsCustomerSpecific,CustomerNames\nPortal API,Core Org,true,"Acme Corp|Globex"'
    },
    {
      name: 'Projects',
      exportSupport: 'Projects list -> Export CSV',
      required: ['ProjectName', 'OrganizationName'],
      optional: ['Description', 'CustomerName', 'StartDate', 'EndDate', 'IsHobby', 'IsGlobal', 'IsVisibleToCustomer', 'Budget', 'BudgetType'],
      sample: 'ProjectName,OrganizationName,StartDate,EndDate,Budget,BudgetType\nPlatform Revamp,Core Org,2026-01-01,2026-06-30,1200,hours'
    },
  ];

  return (
    <section id="csv-templates" className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">CSV Import and Export Templates</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Use these templates when importing bulk data. Keep header names exactly as shown. For multi-value columns use <span className="font-semibold">|</span> (pipe) separator.
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Boolean fields accept: true/false, yes/no, or 1/0. Dates should use YYYY-MM-DD.
      </p>

      <div className="mt-5 space-y-4">
        {modules.map((module) => (
          <div key={module.name} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/30">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{module.name}</h3>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300"><span className="font-semibold">Export source:</span> {module.exportSupport}</p>
            <p className="mt-2 text-xs text-gray-700 dark:text-gray-200"><span className="font-semibold">Required columns:</span> {module.required.join(', ')}</p>
            <p className="mt-1 text-xs text-gray-700 dark:text-gray-200"><span className="font-semibold">Optional columns:</span> {module.optional.join(', ')}</p>
            <div className="mt-3 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3">
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Example row</p>
              <pre className="mt-1 text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">{module.sample}</pre>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">Import validation rules</p>
        <ul className="mt-2 space-y-1 text-xs text-blue-800 dark:text-blue-200">
          <li>Rows with unknown organization/customer/user names are skipped and reported.</li>
          <li>Import runs as batch create (no update/upsert); duplicates depend on backend validation.</li>
          <li>After import, reload the list and export again if you need a normalized CSV snapshot.</li>
        </ul>
      </div>
    </section>
  );
}

export default function DocsPage() {
  const { user, isLoading, isCustomerUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading documentation...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Manual</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Detailed manual for end users. This guide explains daily workflows step by step and includes screenshot placeholders so you can add real images later.
          </p>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Audience: final users (internal and customer users). This page intentionally avoids administration/server setup instructions.
          </p>
          {isCustomerUser && (
            <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-sm">
              You are logged in as a customer user. Internal-only modules may not appear in your account based on role and organization policy.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <aside className="xl:col-span-3">
            <div className="xl:sticky xl:top-24 space-y-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Contents</h2>
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold mb-2">Core Guide</p>
                    <div className="space-y-1">
                      {manualSections.map((section) => (
                        <a
                          key={section.id}
                          href={`#${section.id}`}
                          className="block text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        >
                          {section.title}
                        </a>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold mb-2">Detailed Reference</p>
                    <div className="space-y-1">
                      {featureDetails.map((detail) => (
                        <a
                          key={detail.id}
                          href={`#${detail.id}`}
                          className="block text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        >
                          {detail.title}
                        </a>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold mb-2">Operational Playbooks</p>
                    <div className="space-y-1">
                      {workflowPlaybooks.map((playbook) => (
                        <a
                          key={playbook.id}
                          href={`#${playbook.id}`}
                          className="block text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        >
                          {playbook.title}
                        </a>
                      ))}
                      <a
                        href="#field-dictionary"
                        className="block text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      >
                        Field and Option Dictionary
                      </a>
                      <a
                        href="#role-matrix"
                        className="block text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      >
                        Role Responsibility Matrix
                      </a>
                      <a
                        href="#permission-matrix"
                        className="block text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      >
                        Permission Expectation Matrix
                      </a>
                      <a
                        href="#csv-templates"
                        className="block text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      >
                        CSV Templates
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-300">How to use this manual</h3>
                <ul className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-200">
                  <li>1) Start in Core Guide.</li>
                  <li>2) Use Detailed Reference for exact option behavior.</li>
                  <li>3) Use Playbooks for end-to-end real workflows.</li>
                </ul>
              </div>
            </div>
          </aside>

          <main className="xl:col-span-9 space-y-6">
            {manualSections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{section.title}</h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300"><span className="font-semibold">Purpose:</span> {section.purpose}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300"><span className="font-semibold">When to use:</span> {section.whenToUse}</p>

                <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-5">
                    <ManualList title="Step-by-step" items={section.steps} />
                    <ManualList title="Tips" items={section.tips} />
                    <ManualList title="Common mistakes to avoid" items={section.commonMistakes} />
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Screenshot placeholders</h3>
                    <div className="space-y-3">
                      {section.imagePlaceholders.map((placeholder) => (
                        <ImagePlaceholderCard
                          key={`${section.id}-${placeholder.fileName}`}
                          title={placeholder.label}
                          fileName={placeholder.fileName}
                          note={placeholder.note}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ))}

            <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Complete Functionality Reference</h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Detailed reference by module: how to add, edit, delete, what each option means, and how modules relate to each other.
              </p>
            </section>

            {featureDetails.map((detail) => (
              <section
                key={detail.id}
                id={detail.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
              >
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{detail.title}</h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300"><span className="font-semibold">Purpose:</span> {detail.modulePurpose}</p>

                <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-5">
                    <ManualList title="How to add" items={detail.createFlow} />
                    <ManualList title="How to edit" items={detail.editFlow} />
                    <ManualList title="How to delete" items={detail.deleteFlow} />
                    <OptionExplanationList items={detail.optionExplanations} />
                    <ManualList title="Relationships with other modules" items={detail.moduleRelations} />
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Screenshot placeholders</h3>
                    <div className="space-y-3">
                      {detail.imagePlaceholders.map((placeholder) => (
                        <ImagePlaceholderCard
                          key={`${detail.id}-${placeholder.fileName}`}
                          title={placeholder.label}
                          fileName={placeholder.fileName}
                          note={placeholder.note}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            ))}

            <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Operational Playbooks</h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                End-to-end scenarios you can follow to execute work consistently across modules.
              </p>
            </section>

            {workflowPlaybooks.map((playbook) => (
              <WorkflowPlaybookCard key={playbook.id} playbook={playbook} />
            ))}

            <FieldDictionaryTable items={fieldDictionary} />

            <RoleResponsibilityMatrix rows={roleMatrixRows} />

            <PermissionExpectationMatrix rows={permissionMatrixRows} />

            <CsvTemplatesReference />

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-300">Permissions Reminder</h2>
              <p className="mt-2 text-amber-800 dark:text-amber-200 text-sm">
                This application is role and permission based. If a page/action in this manual is missing for you, your account likely does not have access in the current organization.
              </p>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
