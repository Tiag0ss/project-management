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

export const LOCKED_TASK_FORM_TABS: TaskFormTabKey[] = ['details'];

export const LOCKED_TASK_FORM_FIELDS: TaskFormFieldKey[] = [
  'taskName',
  'status',
  'priority',
  'taskType',
];

export const ALL_TASK_FORM_FIELD_KEYS: TaskFormFieldKey[] = [
  'taskName',
  'status',
  'priority',
  'taskType',
  'customerId',
  'description',
  'assignees',
  'dueDate',
  'dueDateMandatory',
  'unscheduledWork',
  'estimatedHours',
  'storyPoints',
  'application',
  'releaseVersion',
  'jiraIssueKey',
  'gitHubIssueNumber',
  'giteaIssueNumber',
  'linkedTicketRefs',
  'customFields',
  'parentTask',
  'dependsOn',
  'childTasks',
  'plannedAllocations',
  'timeEntries',
  'headerProject',
  'headerCustomer',
  'headerSynapse',
  'headerTimer',
  'headerHoursSummary',
  'headerTags',
  'headerPrint',
  'headerTaskActions',
  'sectionLabels',
];

export const ALL_TASK_FORM_TAB_KEYS: TaskFormTabKey[] = [
  'details',
  'history',
  'comments',
  'attachments',
  'hours',
  'checklist',
];

export function createDefaultTaskFieldVisibility(): TaskFieldVisibilityConfig {
  const fields: Record<string, boolean> = {};
  const tabs: Record<string, boolean> = {};
  for (const key of ALL_TASK_FORM_FIELD_KEYS) {
    fields[key] = true;
  }
  for (const key of ALL_TASK_FORM_TAB_KEYS) {
    tabs[key] = true;
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

  const fields = { ...defaults.fields, ...asBoolMap(source.fields) };
  const tabs = { ...defaults.tabs, ...asBoolMap(source.tabs) };

  for (const key of LOCKED_TASK_FORM_FIELDS) {
    fields[key] = true;
  }
  for (const key of LOCKED_TASK_FORM_TABS) {
    tabs[key] = true;
  }

  return { fields, tabs };
}

export function serializeTaskFieldVisibility(config: TaskFieldVisibilityConfig): string {
  const normalized = normalizeTaskFieldVisibility(config);
  return JSON.stringify(normalized);
}

export function assertNoLockedHidden(config: TaskFieldVisibilityConfig): string | null {
  for (const key of LOCKED_TASK_FORM_FIELDS) {
    if (config.fields[key] === false) {
      return `Field "${key}" is required and cannot be hidden`;
    }
  }
  for (const key of LOCKED_TASK_FORM_TABS) {
    if (config.tabs[key] === false) {
      return `Tab "${key}" is required and cannot be hidden`;
    }
  }
  return null;
}
