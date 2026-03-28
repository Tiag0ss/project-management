'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { getApiUrl } from '@/lib/api/config';
import { downloadCsv, toCsv } from '@/lib/csv';
import { downloadTablePdf } from '@/lib/api/pdfExport';

interface ReportColumn {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'boolean';
}

interface ReportSummaryMetric {
  key: string;
  label: string;
  value: string;
}

const LEADING_REPORT_COLUMNS: ReportColumn[] = [
  { key: 'OrganizationName', label: 'Organization' },
  { key: 'ProjectName', label: 'Project' },
  { key: 'TaskName', label: 'Task' },
];

const CUSTOMER_LEADING_REPORT_COLUMNS: ReportColumn[] = [
  { key: 'OrganizationName', label: 'Organization' },
];

interface EntityFilterConfig {
  idField: string;
  labelField: string;
  label: string;
}

interface ReportTabConfig {
  key: ReportTabKey;
  label: string;
  icon: string;
  columns: ReportColumn[];
  searchFields: string[];
  dateField?: string;
  organizationFilter?: EntityFilterConfig;
  projectFilter?: EntityFilterConfig;
  customerFilter?: EntityFilterConfig;
  userFilter?: EntityFilterConfig;
  statusField?: string;
  priorityField?: string;
}

type ReportTabKey =
  | 'projects'
  | 'tasks'
  | 'timeEntries'
  | 'callRecords'
  | 'customers'
  | 'applications'
  | 'tickets'
  | 'allocationDates';

type ReportRow = Record<string, unknown>;

type ReportFilterState = {
  search: string;
  organizationId: string;
  projectId: string;
  customerId: string;
  userId: string;
  status: string;
  priority: string;
  dateFrom: string;
  dateTo: string;
};

const DEFAULT_FILTERS: ReportFilterState = {
  search: '',
  organizationId: '',
  projectId: '',
  customerId: '',
  userId: '',
  status: '',
  priority: '',
  dateFrom: '',
  dateTo: '',
};

const REPORT_TABS: ReportTabConfig[] = [
  {
    key: 'projects',
    label: 'Projects',
    icon: '📁',
    searchFields: ['ProjectName', 'Description', 'OrganizationName', 'CustomerName', 'CreatorName', 'StatusName'],
    dateField: 'StartDate',
    organizationFilter: { idField: 'OrganizationId', labelField: 'OrganizationName', label: 'Organization' },
    customerFilter: { idField: 'CustomerId', labelField: 'CustomerName', label: 'Customer' },
    userFilter: { idField: 'CreatedBy', labelField: 'CreatorName', label: 'Created by' },
    statusField: 'StatusName',
    columns: [
      { key: 'ProjectName', label: 'Project' },
      { key: 'OrganizationName', label: 'Organization' },
      { key: 'CustomerName', label: 'Customer' },
      { key: 'StatusName', label: 'Status' },
      { key: 'TotalTasks', label: 'Total Tasks', type: 'number' },
      { key: 'OpenTasks', label: 'Open Tasks', type: 'number' },
      { key: 'ClosedTasks', label: 'Closed Tasks', type: 'number' },
      { key: 'TotalEstimatedHours', label: 'Estimation Hours', type: 'number' },
      { key: 'TotalWorkedHours', label: 'Consumed Hours', type: 'number' },
      { key: 'StartDate', label: 'Start', type: 'date' },
      { key: 'EndDate', label: 'End', type: 'date' },
      { key: 'CreatorName', label: 'Created by' },
      { key: 'IsHobby', label: 'Hobby', type: 'boolean' },
      { key: 'IsGlobal', label: 'Global', type: 'boolean' },
    ],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    icon: '✅',
    searchFields: ['TaskName', 'Description', 'ProjectName', 'OrganizationName', 'CustomerName', 'AssigneeName', 'CreatorName', 'StatusName', 'PriorityName'],
    dateField: 'PlannedStartDate',
    organizationFilter: { idField: 'OrganizationId', labelField: 'OrganizationName', label: 'Organization' },
    projectFilter: { idField: 'ProjectId', labelField: 'ProjectName', label: 'Project' },
    customerFilter: { idField: 'CustomerId', labelField: 'CustomerName', label: 'Customer' },
    userFilter: { idField: 'AssignedTo', labelField: 'AssigneeName', label: 'Assignee' },
    statusField: 'StatusName',
    priorityField: 'PriorityName',
    columns: [
      { key: 'TaskName', label: 'Task' },
      { key: 'ProjectName', label: 'Project' },
      { key: 'OrganizationName', label: 'Organization' },
      { key: 'CustomerName', label: 'Customer' },
      { key: 'StatusName', label: 'Status' },
      { key: 'PriorityName', label: 'Priority' },
      { key: 'AssigneeName', label: 'Assignee' },
      { key: 'EstimatedHours', label: 'Estimated', type: 'number' },
      { key: 'WorkedHours', label: 'Consumed Hours', type: 'number' },
      { key: 'PlannedStartDate', label: 'Planned start', type: 'date' },
      { key: 'PlannedEndDate', label: 'Planned end', type: 'date' },
    ],
  },
  {
    key: 'timeEntries',
    label: 'Time Entries',
    icon: '📝',
    searchFields: ['UserName', 'TaskName', 'ProjectName', 'OrganizationName', 'CustomerName', 'ApprovalStatus', 'Description'],
    dateField: 'WorkDate',
    organizationFilter: { idField: 'OrganizationId', labelField: 'OrganizationName', label: 'Organization' },
    projectFilter: { idField: 'ProjectId', labelField: 'ProjectName', label: 'Project' },
    customerFilter: { idField: 'CustomerId', labelField: 'CustomerName', label: 'Customer' },
    userFilter: { idField: 'UserId', labelField: 'UserName', label: 'User' },
    statusField: 'ApprovalStatus',
    columns: [
      { key: 'WorkDate', label: 'Date', type: 'date' },
      { key: 'UserName', label: 'User' },
      { key: 'ProjectName', label: 'Project' },
      { key: 'TaskName', label: 'Task' },
      { key: 'OrganizationName', label: 'Organization' },
      { key: 'CustomerName', label: 'Customer' },
      { key: 'Hours', label: 'Hours', type: 'number' },
      { key: 'ApprovalStatus', label: 'Approval' },
      { key: 'Description', label: 'Description' },
    ],
  },
  {
    key: 'callRecords',
    label: 'Call Records',
    icon: '📞',
    searchFields: ['UserName', 'Subject', 'CallType', 'ProjectName', 'TaskName', 'OrganizationName', 'CustomerName', 'Participants', 'Notes'],
    dateField: 'CallDate',
    organizationFilter: { idField: 'OrganizationId', labelField: 'OrganizationName', label: 'Organization' },
    projectFilter: { idField: 'ProjectId', labelField: 'ProjectName', label: 'Project' },
    customerFilter: { idField: 'CustomerId', labelField: 'CustomerName', label: 'Customer' },
    userFilter: { idField: 'UserId', labelField: 'UserName', label: 'User' },
    columns: [
      { key: 'CallDate', label: 'Date', type: 'date' },
      { key: 'UserName', label: 'User' },
      { key: 'Subject', label: 'Subject' },
      { key: 'CallType', label: 'Type' },
      { key: 'ProjectName', label: 'Project' },
      { key: 'TaskName', label: 'Task' },
      { key: 'OrganizationName', label: 'Organization' },
      { key: 'CustomerName', label: 'Customer' },
      { key: 'DurationMinutes', label: 'Minutes', type: 'number' },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    icon: '🏢',
    searchFields: ['OrganizationName', 'Name', 'ExternalName', 'Email', 'Phone', 'StatusName'],
    dateField: 'CreatedAt',
    organizationFilter: { idField: 'OrganizationId', labelField: 'OrganizationName', label: 'Organization' },
    statusField: 'StatusName',
    columns: [
      { key: 'OrganizationName', label: 'Organization' },
      { key: 'Name', label: 'Name' },
      { key: 'ExternalName', label: 'External name' },
      { key: 'Email', label: 'Email' },
      { key: 'Phone', label: 'Phone' },
      { key: 'StatusName', label: 'Status' },
      { key: 'TotalTasks', label: 'Total Tasks', type: 'number' },
      { key: 'OpenTasks', label: 'Open Tasks', type: 'number' },
      { key: 'ClosedTasks', label: 'Closed Tasks', type: 'number' },
      { key: 'TotalEstimatedHours', label: 'Estimation Hours', type: 'number' },
      { key: 'TotalWorkedHours', label: 'Consumed Hours', type: 'number' },
      { key: 'OpenTickets', label: 'Open tickets', type: 'number' },
    ],
  },
  {
    key: 'applications',
    label: 'Applications',
    icon: '🧩',
    searchFields: ['Name', 'Description', 'OrganizationName', 'CreatorName', 'RepositoryUrl'],
    dateField: 'CreatedAt',
    organizationFilter: { idField: 'OrganizationId', labelField: 'OrganizationName', label: 'Organization' },
    userFilter: { idField: 'CreatedBy', labelField: 'CreatorName', label: 'Created by' },
    columns: [
      { key: 'Name', label: 'Application' },
      { key: 'OrganizationName', label: 'Organization' },
      { key: 'CreatorName', label: 'Created by' },
      { key: 'RepositoryUrl', label: 'Repository' },
      { key: 'ProjectCount', label: 'Projects', type: 'number' },
      { key: 'CustomerCount', label: 'Customers', type: 'number' },
      { key: 'VersionCount', label: 'Versions', type: 'number' },
      { key: 'IsCustomerSpecific', label: 'Customer specific', type: 'boolean' },
    ],
  },
  {
    key: 'tickets',
    label: 'Tickets',
    icon: '🎫',
    searchFields: ['TicketNumber', 'Title', 'Category', 'OrganizationName', 'CustomerName', 'ProjectName', 'StatusName', 'PriorityName', 'CreatorName', 'AssigneeName', 'DeveloperName'],
    dateField: 'CreatedAt',
    organizationFilter: { idField: 'OrganizationId', labelField: 'OrganizationName', label: 'Organization' },
    projectFilter: { idField: 'ProjectId', labelField: 'ProjectName', label: 'Project' },
    customerFilter: { idField: 'CustomerId', labelField: 'CustomerName', label: 'Customer' },
    userFilter: { idField: 'AssignedToUserId', labelField: 'AssigneeName', label: 'Assignee' },
    statusField: 'StatusName',
    priorityField: 'PriorityName',
    columns: [
      { key: 'TicketNumber', label: 'Ticket #' },
      { key: 'Title', label: 'Title' },
      { key: 'OrganizationName', label: 'Organization' },
      { key: 'CustomerName', label: 'Customer' },
      { key: 'ProjectName', label: 'Project' },
      { key: 'StatusName', label: 'Status' },
      { key: 'PriorityName', label: 'Priority' },
      { key: 'AssigneeName', label: 'Assignee' },
      { key: 'DeveloperName', label: 'Developer' },
      { key: 'ScheduledDate', label: 'Scheduled', type: 'date' },
      { key: 'CreatedAt', label: 'Created', type: 'date' },
    ],
  },
  {
    key: 'allocationDates',
    label: 'Allocation Dates',
    icon: '📅',
    searchFields: ['UserName', 'TaskName', 'ProjectName', 'OrganizationName', 'CustomerName', 'AllocationMode'],
    dateField: 'AllocationDate',
    organizationFilter: { idField: 'OrganizationId', labelField: 'OrganizationName', label: 'Organization' },
    projectFilter: { idField: 'ProjectId', labelField: 'ProjectName', label: 'Project' },
    customerFilter: { idField: 'CustomerId', labelField: 'CustomerName', label: 'Customer' },
    userFilter: { idField: 'UserId', labelField: 'UserName', label: 'User' },
    columns: [
      { key: 'AllocationDate', label: 'Date', type: 'date' },
      { key: 'UserName', label: 'User' },
      { key: 'ProjectName', label: 'Project' },
      { key: 'TaskName', label: 'Task' },
      { key: 'ChildTaskNames', label: 'Subtask' },
      { key: 'OrganizationName', label: 'Organization' },
      { key: 'CustomerName', label: 'Customer' },
      { key: 'AllocationMode', label: 'Mode' },
      { key: 'TaskAllocationHeaderId', label: 'Allocation Id' },
      { key: 'PlannedHours', label: 'Estimation Hours', type: 'number' },
      { key: 'AllocatedHours', label: 'Allocation Hours', type: 'number' },
    ],
  },
];

const normalizeDateString = (value: unknown): string => {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  return String(value).split('T')[0];
};

const formatCellValue = (column: ReportColumn, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '-';

  if (column.type === 'date') {
    const normalized = normalizeDateString(value);
    if (!normalized) return '-';
    const date = new Date(`${normalized}T12:00:00`);
    return Number.isNaN(date.getTime()) ? normalized : date.toLocaleDateString();
  }

  if (column.type === 'number') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '-';
    return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
  }

  if (column.type === 'boolean') {
    return Number(value) === 1 || value === true ? 'Yes' : 'No';
  }

  const text = String(value).trim();
  return text.length > 0 ? text : '-';
};

const getUniqueOptions = (rows: ReportRow[], config?: EntityFilterConfig) => {
  if (!config) return [] as Array<{ value: string; label: string }>;

  const optionsMap = new Map<string, string>();
  rows.forEach((row) => {
    const idValue = row[config.idField];
    const labelValue = row[config.labelField];
    if (idValue === null || idValue === undefined || labelValue === null || labelValue === undefined) return;

    const value = String(idValue).trim();
    const label = String(labelValue).trim();
    if (!value || !label) return;

    if (!optionsMap.has(value)) {
      optionsMap.set(value, label);
    }
  });

  return Array.from(optionsMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const getUniqueStringOptions = (rows: ReportRow[], field?: string) => {
  if (!field) return [] as string[];

  return Array.from(
    new Set(
      rows
        .map((row) => row[field])
        .filter((value) => value !== null && value !== undefined)
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
};

const getOrderedColumns = (columns: ReportColumn[], tabKey?: ReportTabKey): ReportColumn[] => {
  const seen = new Set<string>();
  const ordered: ReportColumn[] = [];

  const leadingColumns = tabKey === 'customers' ? CUSTOMER_LEADING_REPORT_COLUMNS : LEADING_REPORT_COLUMNS;

  leadingColumns.forEach((column) => {
    if (!seen.has(column.key)) {
      ordered.push(column);
      seen.add(column.key);
    }
  });

  columns.forEach((column) => {
    if (!seen.has(column.key)) {
      ordered.push(column);
      seen.add(column.key);
    }
  });

  return ordered;
};

const formatNumberMetric = (value: number, decimals = 0): string => {
  if (!Number.isFinite(value)) return '0';
  if (decimals === 0) return String(Math.round(value));
  return value.toFixed(decimals);
};

export default function ReportsPage() {
  const router = useRouter();
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const [selectedTab, setSelectedTab] = useState<ReportTabKey>('projects');
  const [datasets, setDatasets] = useState<Partial<Record<ReportTabKey, ReportRow[]>>>({});
  const [loadingTabs, setLoadingTabs] = useState<Partial<Record<ReportTabKey, boolean>>>({});
  const [tabErrors, setTabErrors] = useState<Partial<Record<ReportTabKey, string>>>({});
  const [filtersByTab, setFiltersByTab] = useState<Record<ReportTabKey, ReportFilterState>>(() => ({
    projects: { ...DEFAULT_FILTERS },
    tasks: { ...DEFAULT_FILTERS },
    timeEntries: { ...DEFAULT_FILTERS },
    callRecords: { ...DEFAULT_FILTERS },
    customers: { ...DEFAULT_FILTERS },
    applications: { ...DEFAULT_FILTERS },
    tickets: { ...DEFAULT_FILTERS },
    allocationDates: { ...DEFAULT_FILTERS },
  }));
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);
  const [exportError, setExportError] = useState('');
  const [requestedTabs, setRequestedTabs] = useState<Partial<Record<ReportTabKey, boolean>>>({});

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!token) {
      setFeatureFlagsLoaded(true);
      return;
    }

    const loadFlags = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setInternalTicketsEnabled(data.internalTicketsEnabled !== false);
        } else {
          setInternalTicketsEnabled(true);
        }
      } catch {
        setInternalTicketsEnabled(true);
      } finally {
        setFeatureFlagsLoaded(true);
      }
    };

    loadFlags();
  }, [token]);

  const visibleTabs = useMemo(() => {
    return REPORT_TABS.filter((tab) => tab.key !== 'tickets' || internalTicketsEnabled);
  }, [internalTicketsEnabled]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.key === selectedTab) && visibleTabs.length > 0) {
      setSelectedTab(visibleTabs[0].key);
    }
  }, [selectedTab, visibleTabs]);

  const currentTab = useMemo(
    () => visibleTabs.find((tab) => tab.key === selectedTab) ?? visibleTabs[0],
    [selectedTab, visibleTabs]
  );

  const loadCurrentTabData = async () => {
    if (!token || !currentTab || !featureFlagsLoaded) return;

    setLoadingTabs((previous) => ({ ...previous, [currentTab.key]: true }));
    setTabErrors((previous) => ({ ...previous, [currentTab.key]: '' }));
    setRequestedTabs((previous) => ({ ...previous, [currentTab.key]: true }));

    try {
      const response = await fetch(`${getApiUrl()}/api/reports/datasets/${currentTab.key}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.message || 'Failed to load report data');
      }

      setDatasets((previous) => ({
        ...previous,
        [currentTab.key]: Array.isArray(payload.records) ? payload.records : [],
      }));
    } catch (error) {
      setTabErrors((previous) => ({
        ...previous,
        [currentTab.key]: error instanceof Error ? error.message : 'Failed to load report data',
      }));
    } finally {
      setLoadingTabs((previous) => ({ ...previous, [currentTab.key]: false }));
    }
  };

  const currentFilters = currentTab ? filtersByTab[currentTab.key] : DEFAULT_FILTERS;
  const currentRows = currentTab ? datasets[currentTab.key] || [] : [];
  const currentColumns = currentTab ? getOrderedColumns(currentTab.columns, currentTab.key) : [];
  const currentError = currentTab ? tabErrors[currentTab.key] || '' : '';
  const isLoadingCurrentTab = currentTab ? loadingTabs[currentTab.key] || false : false;
  const hasRequestedCurrentTab = currentTab ? !!requestedTabs[currentTab.key] : false;

  const filteredRows = useMemo(() => {
    if (!currentTab) return [] as ReportRow[];

    return currentRows.filter((row) => {
      if (currentFilters.search.trim()) {
        const searchValue = currentFilters.search.trim().toLowerCase();
        const matchesSearch = currentTab.searchFields.some((field) => {
          const rawValue = row[field];
          return rawValue !== null && rawValue !== undefined && String(rawValue).toLowerCase().includes(searchValue);
        });
        if (!matchesSearch) return false;
      }

      if (currentTab.organizationFilter && currentFilters.organizationId) {
        if (String(row[currentTab.organizationFilter.idField] ?? '') !== currentFilters.organizationId) return false;
      }

      if (currentTab.projectFilter && currentFilters.projectId) {
        if (String(row[currentTab.projectFilter.idField] ?? '') !== currentFilters.projectId) return false;
      }

      if (currentTab.customerFilter && currentFilters.customerId) {
        if (String(row[currentTab.customerFilter.idField] ?? '') !== currentFilters.customerId) return false;
      }

      if (currentTab.userFilter && currentFilters.userId) {
        if (String(row[currentTab.userFilter.idField] ?? '') !== currentFilters.userId) return false;
      }

      if (currentTab.statusField && currentFilters.status) {
        if (String(row[currentTab.statusField] ?? '') !== currentFilters.status) return false;
      }

      if (currentTab.priorityField && currentFilters.priority) {
        if (String(row[currentTab.priorityField] ?? '') !== currentFilters.priority) return false;
      }

      if (currentTab.dateField && (currentFilters.dateFrom || currentFilters.dateTo)) {
        const rowDate = normalizeDateString(row[currentTab.dateField]);
        if (!rowDate) return false;
        if (currentFilters.dateFrom && rowDate < currentFilters.dateFrom) return false;
        if (currentFilters.dateTo && rowDate > currentFilters.dateTo) return false;
      }

      return true;
    });
  }, [currentFilters, currentRows, currentTab]);

  const summaryMetrics = useMemo(() => {
    if (!currentTab || !hasRequestedCurrentTab) return [] as ReportSummaryMetric[];

    const sumField = (field: string) =>
      filteredRows.reduce((sum, row) => sum + Number(row[field] || 0), 0);

    if (currentTab.key === 'projects') {
      return [
        { key: 'projects', label: 'Projects', value: formatNumberMetric(filteredRows.length) },
        { key: 'openTasks', label: 'Open Tasks', value: formatNumberMetric(sumField('OpenTasks')) },
        { key: 'closedTasks', label: 'Closed Tasks', value: formatNumberMetric(sumField('ClosedTasks')) },
        { key: 'estimated', label: 'Estimation Hours', value: formatNumberMetric(sumField('TotalEstimatedHours'), 2) },
        { key: 'consumed', label: 'Consumed Hours', value: formatNumberMetric(sumField('TotalWorkedHours'), 2) },
      ];
    }

    if (currentTab.key === 'tasks') {
      const openTasks = filteredRows.filter((row) => Number(row.StatusIsClosed || 0) === 0 && Number(row.StatusIsCancelled || 0) === 0).length;
      const closedTasks = filteredRows.filter((row) => Number(row.StatusIsClosed || 0) === 1).length;
      return [
        { key: 'tasks', label: 'Tasks', value: formatNumberMetric(filteredRows.length) },
        { key: 'openTasks', label: 'Open Tasks', value: formatNumberMetric(openTasks) },
        { key: 'closedTasks', label: 'Closed Tasks', value: formatNumberMetric(closedTasks) },
        { key: 'estimated', label: 'Estimation Hours', value: formatNumberMetric(sumField('EstimatedHours'), 2) },
        { key: 'consumed', label: 'Consumed Hours', value: formatNumberMetric(sumField('WorkedHours'), 2) },
      ];
    }

    if (currentTab.key === 'customers') {
      return [
        { key: 'customers', label: 'Customers', value: formatNumberMetric(filteredRows.length) },
        { key: 'openTasks', label: 'Open Tasks', value: formatNumberMetric(sumField('OpenTasks')) },
        { key: 'closedTasks', label: 'Closed Tasks', value: formatNumberMetric(sumField('ClosedTasks')) },
        { key: 'estimated', label: 'Estimation Hours', value: formatNumberMetric(sumField('TotalEstimatedHours'), 2) },
        { key: 'consumed', label: 'Consumed Hours', value: formatNumberMetric(sumField('TotalWorkedHours'), 2) },
      ];
    }

    return [] as ReportSummaryMetric[];
  }, [currentTab, filteredRows, hasRequestedCurrentTab]);

  const organizationOptions = useMemo(
    () => getUniqueOptions(currentRows, currentTab?.organizationFilter),
    [currentRows, currentTab]
  );
  const projectOptions = useMemo(
    () => getUniqueOptions(currentRows, currentTab?.projectFilter),
    [currentRows, currentTab]
  );
  const customerOptions = useMemo(
    () => getUniqueOptions(currentRows, currentTab?.customerFilter),
    [currentRows, currentTab]
  );
  const userOptions = useMemo(
    () => getUniqueOptions(currentRows, currentTab?.userFilter),
    [currentRows, currentTab]
  );
  const statusOptions = useMemo(
    () => getUniqueStringOptions(currentRows, currentTab?.statusField),
    [currentRows, currentTab]
  );
  const priorityOptions = useMemo(
    () => getUniqueStringOptions(currentRows, currentTab?.priorityField),
    [currentRows, currentTab]
  );

  const handleFilterChange = (field: keyof ReportFilterState, value: string) => {
    if (!currentTab) return;

    setFiltersByTab((previous) => ({
      ...previous,
      [currentTab.key]: {
        ...previous[currentTab.key],
        [field]: value,
      },
    }));
  };

  const clearFilters = () => {
    if (!currentTab) return;
    setFiltersByTab((previous) => ({
      ...previous,
      [currentTab.key]: { ...DEFAULT_FILTERS },
    }));
  };

  const handleExportCsv = () => {
    if (!currentTab) return;

    const headers = currentColumns.map((column) => column.label);
    const rows = filteredRows.map((row) => {
      const mapped: Record<string, string> = {};
      currentColumns.forEach((column) => {
        mapped[column.label] = formatCellValue(column, row[column.key]);
      });
      return mapped;
    });

    downloadCsv(`${currentTab.key}-report.csv`, toCsv(rows, headers));
  };

  const handleExportPdf = async () => {
    if (!currentTab || !token) return;

    setExportError('');

    try {
      await downloadTablePdf(
        {
          title: `${currentTab.label} Report`,
          filename: `${currentTab.key}-report`,
          headers: currentColumns.map((column) => column.label),
          rows: filteredRows.map((row) => currentColumns.map((column) => formatCellValue(column, row[column.key]))),
        },
        token
      );
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Failed to export PDF');
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!permissionsLoading && !permissions?.canViewReports) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Navbar />
        <main className="w-full py-6 sm:px-6 lg:px-8">
          <div className="px-4 sm:px-0">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
              <div className="text-5xl mb-4">🔒</div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h2>
              <p className="text-gray-500 dark:text-gray-400">You don&apos;t have permission to view reports.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <CustomerUserGuard>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Navbar />

        <main className="w-full py-6 sm:px-6 lg:px-8">
          <div className="px-4 sm:px-0 space-y-6">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow p-6 text-white">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h1 className="text-3xl font-bold">📊 Reports</h1>
                  <p className="text-blue-100 mt-1">Filtered operational lists with CSV and PDF export.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="px-4 py-2 rounded-lg bg-white/10 text-sm font-medium">
                    {filteredRows.length} of {currentRows.length} rows
                  </div>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={!currentTab || !hasRequestedCurrentTab || filteredRows.length === 0}
                    className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleExportPdf();
                    }}
                    disabled={!currentTab || !hasRequestedCurrentTab || filteredRows.length === 0}
                    className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Export PDF
                  </button>
                </div>
              </div>
            </div>
 
            {(currentError || exportError) && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                {currentError || exportError}
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex flex-wrap gap-2">
                {visibleTabs.map((tab) => {
                  const isActive = currentTab?.key === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setSelectedTab(tab.key)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      <span className="mr-2">{tab.icon}</span>
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {currentTab && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{currentTab.label}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Use the filters below to narrow the exported list.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void loadCurrentTabData();
                      }}
                      disabled={!featureFlagsLoaded || isLoadingCurrentTab}
                      className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {hasRequestedCurrentTab ? 'Reload data' : 'Load data'}
                    </button>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    >
                      Clear filters
                    </button>
                  </div>
                </div>

                {summaryMetrics.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                    {summaryMetrics.map((metric) => (
                      <div key={metric.key} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-4 py-3">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{metric.label}</p>
                        <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{metric.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Search</label>
                    <input
                      type="text"
                      value={currentFilters.search}
                      onChange={(event) => handleFilterChange('search', event.target.value)}
                      placeholder={`Search ${currentTab.label.toLowerCase()}...`}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  {currentTab.organizationFilter && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{currentTab.organizationFilter.label}</label>
                      <select
                        value={currentFilters.organizationId}
                        onChange={(event) => handleFilterChange('organizationId', event.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">All</option>
                        {organizationOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {currentTab.projectFilter && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{currentTab.projectFilter.label}</label>
                      <select
                        value={currentFilters.projectId}
                        onChange={(event) => handleFilterChange('projectId', event.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">All</option>
                        {projectOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {currentTab.customerFilter && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{currentTab.customerFilter.label}</label>
                      <select
                        value={currentFilters.customerId}
                        onChange={(event) => handleFilterChange('customerId', event.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">All</option>
                        {customerOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {currentTab.userFilter && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{currentTab.userFilter.label}</label>
                      <select
                        value={currentFilters.userId}
                        onChange={(event) => handleFilterChange('userId', event.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">All</option>
                        {userOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {currentTab.statusField && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                      <select
                        value={currentFilters.status}
                        onChange={(event) => handleFilterChange('status', event.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">All</option>
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {currentTab.priorityField && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Priority</label>
                      <select
                        value={currentFilters.priority}
                        onChange={(event) => handleFilterChange('priority', event.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">All</option>
                        {priorityOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {currentTab.dateField && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date from</label>
                      <input
                        type="date"
                        value={currentFilters.dateFrom}
                        onChange={(event) => handleFilterChange('dateFrom', event.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  )}

                  {currentTab.dateField && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date to</label>
                      <input
                        type="date"
                        value={currentFilters.dateTo}
                        onChange={(event) => handleFilterChange('dateTo', event.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
              {isLoadingCurrentTab ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading report data...</div>
              ) : !hasRequestedCurrentTab ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">Click "Load data" to fetch records for this report.</div>
              ) : filteredRows.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">No rows match the selected filters.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        {currentColumns.map((column) => (
                          <th
                            key={column.key}
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 dark:text-gray-300 uppercase"
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredRows.map((row, index) => (
                        <tr key={`${currentTab?.key}-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                          {currentColumns.map((column) => (
                            <td
                              key={column.key}
                              className={`px-6 py-3 text-sm text-gray-900 dark:text-gray-100 ${column.type === 'number' ? 'text-right' : 'text-left'}`}
                            >
                              <span className="block max-w-xs truncate" title={formatCellValue(column, row[column.key])}>
                                {formatCellValue(column, row[column.key])}
                              </span>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </CustomerUserGuard>
  );
}
