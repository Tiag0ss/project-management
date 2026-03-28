export interface AssistantDocumentationSection {
  id: string;
  title: string;
  keywords: string[];
  content: string[];
}

export const assistantDocumentationSections: AssistantDocumentationSection[] = [
  {
    id: 'navigation',
    title: 'Navigation and Module Discovery',
    keywords: ['navigation', 'menu', 'sidebar', 'where', 'find', 'module', 'screen', 'page'],
    content: [
      'Use the main navigation to access Dashboard, Projects, Planning, Timesheet, Tickets, Memos, and administrative areas based on permissions.',
      'The in-app Docs page is organized by module bundles with quick guide, detailed reference, and workflow sections grouped together.',
      'If users cannot see a menu item, confirm role and permission settings first.',
    ],
  },
  {
    id: 'projects-tasks',
    title: 'Projects and Tasks',
    keywords: ['project', 'task', 'subtask', 'parent', 'child', 'status', 'priority', 'estimate'],
    content: [
      'Projects contain tasks and subtasks; parent-child task hierarchy is supported via ParentTaskId.',
      'For total estimated-hour calculations, use leaf tasks only to avoid double counting parent and child hours together.',
      'Task counts and status breakdowns should include all tasks, including subtasks.',
      'Global project options are controlled by project-level flags and associated governance rules.',
    ],
  },
  {
    id: 'planning-allocations',
    title: 'Planning and Allocations',
    keywords: ['planning', 'allocation', 'capacity', 'gantt', 'header', 'slice', 'drag', 'schedule'],
    content: [
      'Planning uses allocation headers: each planning bar is tied to a TaskAllocationHeaderId slice.',
      'Availability checks must include both direct TaskAllocations and TaskChildAllocations.',
      'Slice moves/replans must remain header-aware to avoid affecting unrelated allocation slices.',
      'Week/Month/Year planning views use different timeline ranges and navigation increments.',
    ],
  },
  {
    id: 'timesheet-time',
    title: 'Timesheet and Time Tracking',
    keywords: ['timesheet', 'time entry', 'hours', 'weekly', 'daily', 'worklog', 'resume'],
    content: [
      'Time entries represent actual worked hours and are separate from planned allocations.',
      'Weekly timesheet behavior uses explicit save actions and supports week navigation.',
      'Setting hours to zero is the delete behavior for existing time rows in grid-like entry flows.',
    ],
  },
  {
    id: 'tickets-jira',
    title: 'Tickets and Jira Integration',
    keywords: ['ticket', 'jira', 'issue', 'board', 'integration', 'sync', 'project key'],
    content: [
      'Jira integration supports ticket-oriented and project-board-oriented configurations.',
      'Tasks can be linked to tickets, and Jira references can flow through task detail views.',
      'Customer users creating tickets must remain in a minimal flow and must not assign projects.',
    ],
  },
  {
    id: 'permissions',
    title: 'Roles and Permissions',
    keywords: ['permission', 'role', 'admin', 'manager', 'developer', 'support', 'access', 'authorize'],
    content: [
      'Permissions combine across assigned roles using OR logic; admin has full access override.',
      'UI actions should be permission-gated and backend endpoints must validate mutations.',
      'Budget visibility is controlled by role permissions plus organization permission groups.',
    ],
  },
  {
    id: 'settings-statuses',
    title: 'Settings and Custom Status Values',
    keywords: ['settings', 'status', 'priority', 'organization', 'system settings', 'smtp', 'configuration'],
    content: [
      'Organizations can define custom project statuses, task statuses, and priorities with colors and defaults.',
      'System settings include global controls such as AI assistant enablement and integration credentials.',
      'Sensitive settings should never expose secret values in plain form in API responses.',
    ],
  },
  {
    id: 'docs-workflows',
    title: 'Operational Workflows',
    keywords: ['workflow', 'playbook', 'release', 'delivery', 'planned vs actual', 'switch context', 'process'],
    content: [
      'Use module playbooks for common end-to-end flows such as ticket-to-delivery and release readiness.',
      'Timer context switching should preserve prior timer data before starting a new one.',
      'When users ask procedural questions, provide step-by-step guidance tied to the relevant module workflow.',
    ],
  },
];
