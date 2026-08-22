export type ExtractDatasetMeta = {
  id: string;
  label: string;
  description: string;
  requiresExpensesModule?: boolean;
  requiresInternalTickets?: boolean;
};

export const EXTRACT_DATASETS: ExtractDatasetMeta[] = [
  { id: 'projects', label: 'Projects', description: 'Projects with status, customer, and task/hour rollups' },
  { id: 'tasks', label: 'Tasks', description: 'Tasks with status, priority, type, sprint, and worked hours' },
  { id: 'timeEntries', label: 'Time entries', description: 'Logged time with approval status' },
  { id: 'callRecords', label: 'Call records', description: 'Calls with duration, type, and links' },
  { id: 'timeAndCalls', label: 'Time + calls (combined)', description: 'Unified timeline of time entries and calls' },
  { id: 'customers', label: 'Customers', description: 'Customers with task/ticket rollups' },
  { id: 'applications', label: 'Applications', description: 'Application registry entries' },
  {
    id: 'releases',
    label: 'Application releases',
    description: 'Application versions / release records',
  },
  {
    id: 'tickets',
    label: 'Tickets',
    description: 'Internal support tickets',
    requiresInternalTickets: true,
  },
  { id: 'allocationDates', label: 'Planning allocations', description: 'Per-day planned hours from the Gantt' },
  { id: 'vacations', label: 'Vacations', description: 'Vacation days for users in your organizations' },
  { id: 'outOfOffice', label: 'Out of office', description: 'Out-of-office days for users in your organizations' },
  { id: 'memos', label: 'Memos', description: 'Memo metadata (title, visibility, tags — not full body)' },
  {
    id: 'expenses',
    label: 'Expenses',
    description: 'Expenses with category, reimbursement, and approval fields',
    requiresExpensesModule: true,
  },
  {
    id: 'expenseReimbursements',
    label: 'Expense reimbursements',
    description: 'Individual reimbursement payment lines',
    requiresExpensesModule: true,
  },
];

export type ExtractFilterConfig = {
  /** Apply toolbar organization filter to this column (when present on rows). */
  organizationField?: 'OrganizationId';
  /** Apply toolbar project filter to this column. */
  projectField?: 'ProjectId';
  /** Date columns to use for toolbar period filter (first non-empty wins). */
  dateFields: readonly string[];
};

export const EXTRACT_FILTER_CONFIG: Record<string, ExtractFilterConfig> = {
  projects: { organizationField: 'OrganizationId', projectField: 'ProjectId', dateFields: ['StartDate', 'EndDate', 'CreatedAt', 'UpdatedAt'] },
  tasks: { organizationField: 'OrganizationId', projectField: 'ProjectId', dateFields: ['DueDate', 'PlannedStartDate', 'PlannedEndDate', 'CreatedAt', 'UpdatedAt'] },
  timeEntries: { organizationField: 'OrganizationId', projectField: 'ProjectId', dateFields: ['WorkDate', 'CreatedAt'] },
  callRecords: { organizationField: 'OrganizationId', projectField: 'ProjectId', dateFields: ['CallDate', 'CreatedAt'] },
  timeAndCalls: { organizationField: 'OrganizationId', projectField: 'ProjectId', dateFields: ['RecordDate', 'WorkDate', 'CallDate'] },
  customers: { organizationField: 'OrganizationId', dateFields: ['CreatedAt', 'UpdatedAt'] },
  applications: { organizationField: 'OrganizationId', dateFields: ['CreatedAt', 'UpdatedAt'] },
  releases: { organizationField: 'OrganizationId', dateFields: ['ReleaseDate', 'CreatedAt', 'UpdatedAt'] },
  tickets: { organizationField: 'OrganizationId', projectField: 'ProjectId', dateFields: ['ScheduledDate', 'CreatedAt'] },
  allocationDates: { organizationField: 'OrganizationId', projectField: 'ProjectId', dateFields: ['AllocationDate'] },
  vacations: { dateFields: ['VacationDate', 'CreatedAt', 'ApprovedAt'] },
  outOfOffice: { dateFields: ['OutOfOfficeDate', 'CreatedAt', 'ApprovedAt'] },
  memos: { dateFields: ['CreatedAt', 'UpdatedAt'] },
  expenses: { organizationField: 'OrganizationId', projectField: 'ProjectId', dateFields: ['ExpenseDate', 'CreatedAt', 'ApprovedAt', 'ReimbursedAt'] },
  expenseReimbursements: { organizationField: 'OrganizationId', projectField: 'ProjectId', dateFields: ['CreatedAt', 'ExpenseDate'] },
};

/** @deprecated Use per-dataset dateFields in EXTRACT_FILTER_CONFIG */
export const EXTRACT_DATE_FIELDS = [
  'WorkDate',
  'CallDate',
  'ExpenseDate',
  'VacationDate',
  'OutOfOfficeDate',
  'RecordDate',
  'ReleaseDate',
  'CreatedAt',
  'UpdatedAt',
  'DueDate',
  'StartDate',
  'EndDate',
  'AllocationDate',
  'ApprovedAt',
  'ReimbursedAt',
  'PaidAt',
] as const;
