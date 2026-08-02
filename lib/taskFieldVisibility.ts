export const TASK_FIELD_VISIBILITY_SETTING_KEY = 'taskFieldVisibility';

export type TaskFormTabKey =
  | 'details'
  | 'history'
  | 'comments'
  | 'attachments'
  | 'hours'
  | 'checklist';

export type TaskFormFieldKey =
  | 'taskName'
  | 'status'
  | 'priority'
  | 'taskType'
  | 'customerId'
  | 'description'
  | 'assignees'
  | 'dueDate'
  | 'dueDateMandatory'
  | 'unscheduledWork'
  | 'estimatedHours'
  | 'storyPoints'
  | 'application'
  | 'releaseVersion'
  | 'jiraIssueKey'
  | 'gitHubIssueNumber'
  | 'giteaIssueNumber'
  | 'linkedTicketRefs'
  | 'customFields'
  | 'parentTask'
  | 'dependsOn'
  | 'childTasks'
  | 'plannedAllocations'
  | 'timeEntries'
  | 'headerProject'
  | 'headerCustomer'
  | 'headerSynapse'
  | 'headerTimer'
  | 'headerHoursSummary'
  | 'headerTags'
  | 'headerPrint'
  | 'headerTaskActions'
  | 'sectionLabels';

export interface TaskFieldVisibilityConfig {
  fields: Record<string, boolean>;
  tabs: Record<string, boolean>;
}

export interface TaskFieldVisibilityCatalogItem {
  key: string;
  label: string;
  locked: boolean;
  section?: string;
  /** Short location hint shown in the admin editor */
  hint?: string;
}

export const LOCKED_TASK_FORM_TABS: TaskFormTabKey[] = ['details'];

export const LOCKED_TASK_FORM_FIELDS: TaskFormFieldKey[] = [
  'taskName',
  'status',
  'priority',
  'taskType',
];

export const TASK_FORM_TAB_CATALOG: TaskFieldVisibilityCatalogItem[] = [
  { key: 'details', label: 'Details', locked: true, hint: 'Always shown; main task fields live here.' },
  { key: 'history', label: 'History', locked: false, hint: 'Change log of the task.' },
  { key: 'comments', label: 'Comments', locked: false, hint: 'Discussion thread on the task.' },
  { key: 'attachments', label: 'Attachments', locked: false, hint: 'Files attached to the task.' },
  { key: 'hours', label: 'Hours', locked: false, hint: 'Planning, allocations, and time entries.' },
  { key: 'checklist', label: 'Checklist', locked: false, hint: 'Checklist items for the task.' },
];

export const TASK_FORM_FIELD_CATALOG: TaskFieldVisibilityCatalogItem[] = [
  // Section labels (headings only — fields stay visible)
  {
    key: 'sectionLabels',
    label: 'Section labels',
    locked: false,
    section: 'Section labels',
    hint: 'Show headings like Basic Information, Linked Tickets & Jira, Task Setup, Assignment, Effort & Completion, Release Tracking, Plan & Dependencies. Hide to save space; fields stay visible.',
  },
  // Header
  { key: 'headerProject', label: 'Project pill', locked: false, section: 'Header', hint: 'Under the title — opens the project.' },
  { key: 'headerCustomer', label: 'Customer pill', locked: false, section: 'Header', hint: 'Under the title — customer name chip.' },
  { key: 'headerSynapse', label: 'Synapse link', locked: false, section: 'Header', hint: 'Under the title — opens linked Synapse note.' },
  { key: 'headerTimer', label: 'Timer controls', locked: false, section: 'Header', hint: 'Start / stop timer next to status pills.' },
  { key: 'headerHoursSummary', label: 'Hours summary cards', locked: false, section: 'Header', hint: 'Estimated / allocated / worked / completion row.' },
  { key: 'headerTags', label: 'Tags', locked: false, section: 'Header', hint: 'Tag chips and Add Tag under the summary.' },
  { key: 'headerPrint', label: 'Print action', locked: false, section: 'Header', hint: 'Print / PDF icon in the top-right.' },
  { key: 'headerTaskActions', label: 'Task actions menu', locked: false, section: 'Header', hint: '⋯ menu (move / delete) in the top-right.' },
  // Basic / details
  { key: 'taskName', label: 'Task Name', locked: true, section: 'Basic Information', hint: 'Title of the task (always required).' },
  { key: 'description', label: 'Description', locked: false, section: 'Basic Information', hint: 'Rich-text description on Details.' },
  { key: 'linkedTicketRefs', label: 'Linked ticket / Jira board refs', locked: false, section: 'Linked Tickets & Jira', hint: 'Read-only ticket and imported Jira links.' },
  { key: 'jiraIssueKey', label: 'Jira Issue Key', locked: false, section: 'Linked Tickets & Jira', hint: 'Editable Jira key field.' },
  { key: 'gitHubIssueNumber', label: 'GitHub Issue ID', locked: false, section: 'Linked Tickets & Jira', hint: 'GitHub issue number field.' },
  { key: 'giteaIssueNumber', label: 'Gitea Issue ID', locked: false, section: 'Linked Tickets & Jira', hint: 'Gitea issue number field.' },
  { key: 'status', label: 'Status', locked: true, section: 'Task Setup', hint: 'Status dropdown (always required).' },
  { key: 'priority', label: 'Priority', locked: true, section: 'Task Setup', hint: 'Priority dropdown (always required).' },
  { key: 'taskType', label: 'Task Type', locked: true, section: 'Task Setup', hint: 'Task type dropdown (always required).' },
  { key: 'customerId', label: 'Customer (form field)', locked: false, section: 'Assignment', hint: 'Customer selector on global projects.' },
  { key: 'assignees', label: 'Assignees', locked: false, section: 'Assignment', hint: 'Principal and additional assignees.' },
  { key: 'dueDate', label: 'Due Date', locked: false, section: 'Effort & Completion', hint: 'Due date picker.' },
  { key: 'dueDateMandatory', label: 'Due date is mandatory', locked: false, section: 'Effort & Completion', hint: 'Checkbox requiring a due date.' },
  { key: 'unscheduledWork', label: 'Unscheduled work', locked: false, section: 'Effort & Completion', hint: 'Unscheduled work checkbox.' },
  { key: 'estimatedHours', label: 'Estimated Hours', locked: false, section: 'Effort & Completion', hint: 'Estimated effort input.' },
  { key: 'storyPoints', label: 'Story Points', locked: false, section: 'Effort & Completion', hint: 'Story points input.' },
  { key: 'application', label: 'Application', locked: false, section: 'Release Tracking', hint: 'Application selector for release tracking.' },
  { key: 'releaseVersion', label: 'Release Version', locked: false, section: 'Release Tracking', hint: 'Release version selector.' },
  { key: 'customFields', label: 'Custom fields block', locked: false, section: 'Custom Fields', hint: 'Org-defined custom fields at the bottom of Details.' },
  // Hours tab
  { key: 'parentTask', label: 'Parent Task', locked: false, section: 'Hours — Planning', hint: 'Hours → Planning: parent task selector.' },
  { key: 'dependsOn', label: 'Depends On', locked: false, section: 'Hours — Planning', hint: 'Hours → Planning: dependency selector.' },
  { key: 'childTasks', label: 'Child tasks list', locked: false, section: 'Hours — Planning', hint: 'Hours → Planning: list of child tasks.' },
  { key: 'plannedAllocations', label: 'Planned allocations', locked: false, section: 'Hours — Allocations', hint: 'Hours → Planned Allocations sub-tab.' },
  { key: 'timeEntries', label: 'Time entries', locked: false, section: 'Hours — Time Entries', hint: 'Hours → Time Entries sub-tab.' },
];

export function createDefaultTaskFieldVisibility(): TaskFieldVisibilityConfig {
  const fields: Record<string, boolean> = {};
  const tabs: Record<string, boolean> = {};
  for (const item of TASK_FORM_FIELD_CATALOG) {
    fields[item.key] = true;
  }
  for (const item of TASK_FORM_TAB_CATALOG) {
    tabs[item.key] = true;
  }
  return { fields, tabs };
}

function asBoolMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    result[key] = raw !== false && raw !== 0 && raw !== '0' && raw !== 'false';
  }
  return result;
}

/** Merge stored JSON with defaults and force locked keys visible. */
export function normalizeTaskFieldVisibility(raw: unknown): TaskFieldVisibilityConfig {
  const defaults = createDefaultTaskFieldVisibility();
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }

  const source =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as { fields?: unknown; tabs?: unknown })
      : {};

  const fieldOverrides = asBoolMap(source.fields);
  const tabOverrides = asBoolMap(source.tabs);

  const fields = { ...defaults.fields, ...fieldOverrides };
  const tabs = { ...defaults.tabs, ...tabOverrides };

  for (const key of LOCKED_TASK_FORM_FIELDS) {
    fields[key] = true;
  }
  for (const key of LOCKED_TASK_FORM_TABS) {
    tabs[key] = true;
  }

  return { fields, tabs };
}

export function isTaskFieldVisible(
  config: TaskFieldVisibilityConfig | null | undefined,
  fieldKey: TaskFormFieldKey | string
): boolean {
  if (LOCKED_TASK_FORM_FIELDS.includes(fieldKey as TaskFormFieldKey)) {
    return true;
  }
  if (!config) return true;
  return config.fields[fieldKey] !== false;
}

export function isTaskTabVisible(
  config: TaskFieldVisibilityConfig | null | undefined,
  tabKey: TaskFormTabKey | string
): boolean {
  if (LOCKED_TASK_FORM_TABS.includes(tabKey as TaskFormTabKey)) {
    return true;
  }
  if (!config) return true;
  return config.tabs[tabKey] !== false;
}
