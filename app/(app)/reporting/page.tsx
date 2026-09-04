/* Migrated into AppShell — Navbar removed; chrome from app/(app)/layout */
'use client';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useUrlTab } from '@/hooks/useUrlTab';
import { organizationsApi } from '@/lib/api/organizations';
import { projectsApi, Project } from '@/lib/api/projects';
import { tasksApi, Task } from '@/lib/api/tasks';
import TaskDetailModal from '@/components/TaskDetailModal';
import { getApiUrl } from '@/lib/api/config';
import { reportingApi, ReportingAccessInfo, DeltaMetric } from '@/lib/api/reporting';
import { defaultReportingRange, formatDelta, previousPeriod } from '@/lib/reporting/period';
import { EXTRACT_DATASETS, EXTRACT_FILTER_CONFIG } from '@/lib/reporting/extractDatasets';
import { downloadCsv, toCsv } from '@/lib/csv';
import { useFormatHours } from '@/lib/useFormatHours';
import { WebReportsExplorer } from '@/app/web-reports/page';
import { OrganizationCharts } from '@/components/reporting/OrganizationCharts';
import { TaskAnalyticsCharts } from '@/components/reporting/TaskAnalyticsCharts';

const MANAGER_TABS = [
  'organization',
  'portfolio',
  'delivery',
  'capacity',
  'data-quality',
  'expenses',
  'extract',
  'explore',
] as const;

const USER_TABS = ['extract'] as const;

type ReportingTab = (typeof MANAGER_TABS)[number];

type OrgOption = { Id: number; Name: string };

/** App route only — never `/api/...`. */
function projectHref(projectId: number | string) {
  return `/projects/${Number(projectId)}`;
}

function userHref(userId: number | string) {
  return `/users/${Number(userId)}`;
}

function formatMoney(n: number | string | null | undefined) {
  return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MetricCard({
  label,
  value,
  delta,
  onClick,
}: {
  label: string;
  value: string;
  delta?: string;
  onClick?: () => void;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-left ${
        onClick ? 'hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer' : ''
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{value}</div>
      {delta ? <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">vs previous: {delta}</div> : null}
    </Comp>
  );
}

function formatDeltaMetric(metric: DeltaMetric | undefined, hours = false): string | undefined {
  if (!metric) return undefined;
  return formatDelta(metric.delta, metric.deltaPct, hours ? 'h' : '');
}

function normalizeExtractRowDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const match = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function renderExtractCell(row: Record<string, unknown>, key: string) {
  const raw = row[key];
  if (raw == null || raw === '') return '';
  const text = String(raw);
  const projectId = Number(row.ProjectId ?? row.projectId ?? 0);
  const taskId = Number(row.TaskId ?? row.taskId ?? row.Id ?? 0);

  if (
    projectId > 0 &&
    (key === 'ProjectId' ||
      key === 'projectId' ||
      key === 'ProjectName' ||
      key === 'projectName' ||
      key === 'Project')
  ) {
    return (
      <Link href={projectHref(projectId)} className="text-blue-600 dark:text-blue-400 hover:underline">
        {text}
      </Link>
    );
  }

  if (
    projectId > 0 &&
    taskId > 0 &&
    (key === 'TaskId' || key === 'taskId' || key === 'TaskName' || key === 'taskName' || key === 'Task')
  ) {
    return (
      <Link
        href={`${projectHref(projectId)}?tab=tasks&taskId=${taskId}`}
        className="text-blue-600 dark:text-blue-400 hover:underline"
      >
        {text}
      </Link>
    );
  }

  if (key === 'UserId' || key === 'userId') {
    const userId = Number(raw);
    if (userId > 0) {
      return (
        <Link href={userHref(userId)} className="text-blue-600 dark:text-blue-400 hover:underline">
          {text}
        </Link>
      );
    }
  }

  return text;
}

function ReportingHubInner() {
  const { token, user, isCustomerUser } = useAuth();
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const formatHours = useFormatHours();

  const formatPortfolioBudget = (amount: number, budgetType: string) => {
    if (budgetType === 'hours') return formatHours(amount);
    return `$${Number(amount).toFixed(2)}`;
  };


  const [access, setAccess] = useState<ReportingAccessInfo | null>(null);
  const [accessError, setAccessError] = useState('');
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [organizationId, setOrganizationId] = useState<number | ''>(() => {
    if (typeof window === 'undefined') return '';
    const stored = localStorage.getItem('reporting.organizationId');
    return stored ? Number(stored) : '';
  });
  const [projectId, setProjectId] = useState<number | ''>('');
  const rangeDefaults = useMemo(() => defaultReportingRange(30), []);
  const [dateFrom, setDateFrom] = useState(() => {
    if (typeof window === 'undefined') return rangeDefaults.from;
    return localStorage.getItem('reporting.dateFrom') || rangeDefaults.from;
  });
  const [dateTo, setDateTo] = useState(() => {
    if (typeof window === 'undefined') return rangeDefaults.to;
    return localStorage.getItem('reporting.dateTo') || rangeDefaults.to;
  });

  useEffect(() => {
    if (organizationId) localStorage.setItem('reporting.organizationId', String(organizationId));
  }, [organizationId]);
  useEffect(() => {
    localStorage.setItem('reporting.dateFrom', dateFrom);
    localStorage.setItem('reporting.dateTo', dateTo);
  }, [dateFrom, dateTo]);

  const canManager = !!(access?.canAccessManagerPacks || user?.isAdmin || user?.isManager);
  const canCapacity = !!(
    access?.canAccessCapacity ||
    canManager ||
    permissions?.canViewOthersPlanning
  );
  const canExplore = !!(access?.canAccessExplore || canManager);

  const validTabs = useMemo(() => {
    if (canManager) return MANAGER_TABS;
    return USER_TABS;
  }, [canManager]);

  const defaultTab: ReportingTab = canManager ? 'organization' : 'extract';
  const [activeTab, setActiveTab] = useUrlTab(validTabs as unknown as readonly ReportingTab[], defaultTab);
  const [overview, setOverview] = useState<any>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [delivery, setDelivery] = useState<any>(null);
  const [capacity, setCapacity] = useState<any>(null);
  const [dataQuality, setDataQuality] = useState<any>(null);
  const [expensesEnabled, setExpensesEnabled] = useState(false);
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [expenseReport, setExpenseReport] = useState<any>(null);
  const [expenseGroupId, setExpenseGroupId] = useState<number | ''>('');
  const [expenseCategoryId, setExpenseCategoryId] = useState<number | ''>('');
  const [expenseUserId, setExpenseUserId] = useState<number | ''>('');
  const [expenseReimbFilter, setExpenseReimbFilter] = useState('');
  const [expenseInternalOnly, setExpenseInternalOnly] = useState(false);
  const [expenseDateFrom, setExpenseDateFrom] = useState('');
  const [expenseDateTo, setExpenseDateTo] = useState('');
  const [expenseBreakdown, setExpenseBreakdown] = useState<'rows' | 'category' | 'group'>('rows');
  const [dqSubTab, setDqSubTab] = useState<
    'unestimated' | 'unassigned' | 'noSprint' | 'staleOverdue' | 'pendingApprovals'
  >('unestimated');
  const [portfolioRagFilter, setPortfolioRagFilter] = useState<'all' | 'green' | 'amber' | 'red'>('all');
  const [expandedPortfolioIds, setExpandedPortfolioIds] = useState<Set<number>>(new Set());
  const [capacitySearch, setCapacitySearch] = useState('');
  const [deliverySection, setDeliverySection] = useState<'sprints' | 'closed'>('sprints');
  const [digests, setDigests] = useState<any[]>([]);
  const [digestRecipients, setDigestRecipients] = useState('');
  const [digestFrequency, setDigestFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [loading, setLoading] = useState(false);
  const [taskModalState, setTaskModalState] = useState<{
    show: boolean;
    isLoading: boolean;
    project: Project | null;
    task: Task | null;
    tasks: Task[];
    error: string;
  }>({
    show: false,
    isLoading: false,
    project: null,
    task: null,
    tasks: [],
    error: '',
  });

  const closeTaskDetails = () => {
    setTaskModalState({
      show: false,
      isLoading: false,
      project: null,
      task: null,
      tasks: [],
      error: '',
    });
  };

  const openTaskDetails = async (projectId: number, taskId: number) => {
    if (!token || !projectId || !taskId) return;
    setTaskModalState({
      show: true,
      isLoading: true,
      project: null,
      task: null,
      tasks: [],
      error: '',
    });
    try {
      const [projectRes, tasksRes] = await Promise.all([
        projectsApi.getById(projectId, token),
        tasksApi.getByProject(projectId, token),
      ]);
      const project = projectRes?.project || null;
      const projectTasks = Array.isArray(tasksRes?.tasks) ? tasksRes.tasks : [];
      const activeTask = projectTasks.find((entry) => Number(entry.Id) === Number(taskId)) || null;
      if (!project || !activeTask) {
        throw new Error('Task no longer exists in this project');
      }
      setTaskModalState({
        show: true,
        isLoading: false,
        project,
        task: activeTask,
        tasks: projectTasks,
        error: '',
      });
    } catch (err: any) {
      setTaskModalState({
        show: true,
        isLoading: false,
        project: null,
        task: null,
        tasks: [],
        error: err?.message || 'Failed to open task detail',
      });
    }
  };


  const [error, setError] = useState('');

  const drillTo = useCallback(
    (
      tab: ReportingTab,
      options?: {
        dq?: typeof dqSubTab;
        rag?: typeof portfolioRagFilter;
        delivery?: typeof deliverySection;
      }
    ) => {
      if (options?.dq) setDqSubTab(options.dq);
      if (options?.rag) setPortfolioRagFilter(options.rag);
      if (options?.delivery) setDeliverySection(options.delivery);
      setActiveTab(tab);
    },
    [setActiveTab]
  );

  // Extract
  const [extractDataset, setExtractDataset] = useState('tasks');
  const [extractRecords, setExtractRecords] = useState<any[]>([]);
  const [extractLoadedCount, setExtractLoadedCount] = useState<number | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);

  const prev = useMemo(() => previousPeriod(dateFrom, dateTo), [dateFrom, dateTo]);

  const extractDatasetOptions = useMemo(
    () =>
      EXTRACT_DATASETS.filter((d) => {
        if (d.requiresExpensesModule && !expensesEnabled) return false;
        if (d.requiresInternalTickets && !internalTicketsEnabled) return false;
        return true;
      }),
    [expensesEnabled, internalTicketsEnabled]
  );

  const extractColumnKeys = useMemo(
    () => (extractRecords.length > 0 ? Object.keys(extractRecords[0]) : []),
    [extractRecords]
  );

  const filteredProjects = useMemo(() => {
    if (!organizationId) return projects;
    return projects.filter((p) => Number(p.OrganizationId) === Number(organizationId));
  }, [projects, organizationId]);

  useEffect(() => {
    if (!token || isCustomerUser) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await reportingApi.getAccess(token);
        if (cancelled) return;
        setAccess(result.data);
        if (!result.data.canAccessHub) {
          setAccessError('You do not have permission to view reports.');
        }
      } catch (err: any) {
        if (!cancelled) setAccessError(err?.message || 'Failed to load access');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isCustomerUser]);

  useEffect(() => {
    if (!token || !access?.canAccessHub) return;
    let cancelled = false;
    (async () => {
      try {
        const [orgRes, projRes, flagsRes] = await Promise.all([
          organizationsApi.getAll(token),
          projectsApi.getAll(token),
          fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (cancelled) return;
        const flagsData = flagsRes.ok ? await flagsRes.json() : {};
        setExpensesEnabled(flagsData.expensesEnabled === true);
        setInternalTicketsEnabled(flagsData.internalTicketsEnabled !== false);
        const organizations = (orgRes.organizations || []).map((o: any) => ({
          Id: Number(o.Id),
          Name: String(o.Name || `Organization #${o.Id}`),
        }));
        setOrgs(organizations);
        setProjects(projRes.projects || []);
        if (!organizationId && organizations.length > 0) {
          setOrganizationId(organizations[0].Id);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load filters');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, access?.canAccessHub]);

  const loadTabData = useCallback(async () => {
    if (!token || !access?.canAccessHub) return;
    setError('');
    setLoading(true);
    try {
      if (activeTab === 'organization' && organizationId && canManager) {
        const res = await reportingApi.getOrganizationOverview(token, {
          organizationId: Number(organizationId),
          from: dateFrom,
          to: dateTo,
          projectId: projectId ? Number(projectId) : null,
        });
        setOverview(res.data);
        const dig = await reportingApi.getDigests(token, Number(organizationId));
        setDigests(dig.data || []);
      } else if (activeTab === 'portfolio' && organizationId && canManager) {
        const res = await reportingApi.getPortfolio(token, Number(organizationId));
        setPortfolio(res.data);
        setExpandedPortfolioIds(new Set());
      } else if (activeTab === 'delivery' && organizationId && canManager) {
        const res = await reportingApi.getDelivery(token, {
          organizationId: Number(organizationId),
          from: dateFrom,
          to: dateTo,
          projectId: projectId ? Number(projectId) : null,
        });
        setDelivery(res.data);
      } else if (activeTab === 'capacity' && organizationId && canCapacity) {
        const res = await reportingApi.getCapacity(token, Number(organizationId), dateFrom, dateTo);
        setCapacity(res.data);
      } else if (activeTab === 'data-quality' && organizationId && canManager) {
        const res = await reportingApi.getDataQuality(
          token,
          Number(organizationId),
          projectId ? Number(projectId) : null
        );
        setDataQuality(res.data);
      } else if (activeTab === 'expenses' && organizationId && canManager && expensesEnabled) {
        const res = await reportingApi.getExpensesReport(token, {
          organizationId: Number(organizationId),
          from: expenseDateFrom || null,
          to: expenseDateTo || null,
          projectId: projectId ? Number(projectId) : null,
          groupId: expenseGroupId ? Number(expenseGroupId) : null,
          categoryId: expenseCategoryId ? Number(expenseCategoryId) : null,
          userId: expenseUserId ? Number(expenseUserId) : null,
          reimbursementStatus: expenseReimbFilter || null,
          internalOnly: expenseInternalOnly,
        });
        setExpenseReport(res.data ?? null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [
    token,
    access?.canAccessHub,
    activeTab,
    dateFrom,
    dateTo,
    organizationId,
    projectId,
    canManager,
    canCapacity,
    expensesEnabled,
    expenseGroupId,
    expenseCategoryId,
    expenseUserId,
    expenseReimbFilter,
    expenseInternalOnly,
    expenseDateFrom,
    expenseDateTo,
  ]);

  useEffect(() => {
    if (!extractDatasetOptions.some((d) => d.id === extractDataset)) {
      setExtractDataset(extractDatasetOptions[0]?.id || 'tasks');
    }
  }, [extractDataset, extractDatasetOptions]);

  useEffect(() => {
    void loadTabData();
  }, [loadTabData]);

  useEffect(() => {
    if (activeTab === 'explore' && !canExplore) {
      setActiveTab(defaultTab);
    }
    if (
      ['organization', 'portfolio', 'delivery', 'capacity', 'data-quality', 'expenses'].includes(activeTab) &&
      !canManager &&
      activeTab !== 'capacity'
    ) {
      setActiveTab(defaultTab);
    }
    if (activeTab === 'capacity' && !canCapacity) {
      setActiveTab(defaultTab);
    }
    if (activeTab === 'expenses' && (!canManager || !expensesEnabled)) {
      setActiveTab(defaultTab);
    }
  }, [activeTab, canExplore, canManager, canCapacity, expensesEnabled, defaultTab, setActiveTab]);

  const loadExtract = async () => {
    if (!token) return;
    setExtractLoading(true);
    setError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/reports/datasets/${extractDataset}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to load dataset');
      let records = data.records || [];
      setExtractLoadedCount(records.length);
      const filterConfig =
        EXTRACT_FILTER_CONFIG[extractDataset] ?? {
          organizationField: 'OrganizationId' as const,
          projectField: 'ProjectId' as const,
          dateFields: ['CreatedAt', 'UpdatedAt'],
        };

      if (organizationId && filterConfig.organizationField) {
        const orgKey = filterConfig.organizationField;
        records = records.filter(
          (r: any) => Number(r[orgKey] || 0) === Number(organizationId)
        );
      }
      if (projectId && filterConfig.projectField) {
        const projectKey = filterConfig.projectField;
        records = records.filter((r: any) => Number(r[projectKey] || 0) === Number(projectId));
      }
      const skipDateFilter = extractDataset === 'expenses' || extractDataset === 'expenseReimbursements';
      if (!skipDateFilter && (dateFrom || dateTo)) {
        let from = dateFrom;
        let to = dateTo;
        if (from && to && from > to) {
          [from, to] = [to, from];
        }
        records = records.filter((r: any) => {
          const raw = filterConfig.dateFields.map((k) => r[k]).find((v) => v != null && v !== '');
          const d = normalizeExtractRowDate(raw);
          if (!d) return true;
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        });
      }
      setExtractRecords(records);
    } catch (err: any) {
      setError(err?.message || 'Extract failed');
      setExtractRecords([]);
      setExtractLoadedCount(null);
    } finally {
      setExtractLoading(false);
    }
  };

  const exportExtractCsv = () => {
    if (!extractRecords.length) return;
    const keys = Object.keys(extractRecords[0]);
    downloadCsv(toCsv(extractRecords, keys), `extract-${extractDataset}.csv`);
  };

  const exportQualityCsv = (rows: any[], name: string) => {
    if (!rows?.length) return;
    const keys = Object.keys(rows[0]);
    downloadCsv(toCsv(rows, keys), `data-quality-${name}.csv`);
  };

  const createDigest = async () => {
    if (!token || !organizationId || !digestRecipients.trim()) return;
    try {
      await reportingApi.createDigest(token, {
        organizationId: Number(organizationId),
        frequency: digestFrequency,
        recipients: digestRecipients.trim(),
        dayOfWeek: 1,
        dayOfMonth: 1,
      });
      setDigestRecipients('');
      const dig = await reportingApi.getDigests(token, Number(organizationId));
      setDigests(dig.data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to create digest');
    }
  };

  if (isCustomerUser) {
    return (
      <CustomerUserGuard>
        <div className="w-full">
          <main className="w-full p-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center text-gray-700 dark:text-gray-200">
              Reporting is not available for customer portal users.
            </div>
          </main>
        </div>
      </CustomerUserGuard>
    );
  }

  if (permissionsLoading || !access) {
    return (
      <CustomerUserGuard>
        <div className="w-full">
          <main className="w-full p-6 text-gray-600 dark:text-gray-300">Loading reporting…</main>
        </div>
      </CustomerUserGuard>
    );
  }

  if (!access.canAccessHub && !permissions?.canViewReports && !user?.isAdmin) {
    return (
      <CustomerUserGuard>
        <div className="w-full">
          <main className="w-full p-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-8 text-center">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Access denied</h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                {accessError || 'You need the CanViewReports permission.'}
              </p>
            </div>
          </main>
        </div>
      </CustomerUserGuard>
    );
  }

  const tabs: { id: ReportingTab; label: string; show: boolean }[] = [
    { id: 'organization', label: 'Organization', show: canManager },
    { id: 'portfolio', label: 'Portfolio', show: canManager },
    { id: 'delivery', label: 'Delivery', show: canManager },
    { id: 'capacity', label: 'Capacity', show: canCapacity },
    { id: 'data-quality', label: 'Data Quality', show: canManager },
    { id: 'expenses', label: 'Expenses', show: canManager && expensesEnabled },
    { id: 'extract', label: 'Extract', show: true },
    { id: 'explore', label: 'Explore (advanced)', show: canExplore },
  ];

  return (
    <CustomerUserGuard>
      <div className="w-full flex flex-col">
        <main className="w-full flex-1 flex flex-col min-h-0">
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reporting</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Guided packs for analysis and export. Previous period: {prev.from} → {prev.to}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 items-end">
              {(canManager || canCapacity) && activeTab !== 'explore' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Organization
                  </label>
                  <select
                    value={organizationId}
                    onChange={(e) => {
                      setOrganizationId(e.target.value ? Number(e.target.value) : '');
                      setProjectId('');
                      setExpenseGroupId('');
                      setExpenseCategoryId('');
                      setExpenseUserId('');
                      setExpenseReimbFilter('');
                      setExpenseInternalOnly(false);
                    }}
                    className="h-10 min-w-[200px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    {orgs.map((o) => (
                      <option key={o.Id} value={o.Id}>
                        {o.Name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(activeTab === 'organization' ||
                activeTab === 'delivery' ||
                activeTab === 'data-quality' ||
                activeTab === 'expenses' ||
                activeTab === 'extract') && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Project
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}
                    className="h-10 min-w-[200px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">All projects</option>
                    {filteredProjects.map((p) => (
                      <option key={p.Id} value={p.Id}>
                        {p.ProjectName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {activeTab !== 'explore' && activeTab !== 'data-quality' && activeTab !== 'portfolio' && activeTab !== 'expenses' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">From</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">To</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </>
              )}
              {activeTab === 'portfolio' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">RAG</label>
                  <select
                    value={portfolioRagFilter}
                    onChange={(e) => setPortfolioRagFilter(e.target.value as typeof portfolioRagFilter)}
                    className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="all">All</option>
                    <option value="red">Red</option>
                    <option value="amber">Amber</option>
                    <option value="green">Green</option>
                  </select>
                </div>
              )}
              {activeTab === 'capacity' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Person
                  </label>
                  <input
                    type="search"
                    value={capacitySearch}
                    onChange={(e) => setCapacitySearch(e.target.value)}
                    placeholder="Filter by name…"
                    className="h-10 min-w-[180px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
              )}
              {activeTab === 'expenses' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Expense from</label>
                    <input
                      type="date"
                      value={expenseDateFrom}
                      onChange={(e) => setExpenseDateFrom(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Expense to</label>
                    <input
                      type="date"
                      value={expenseDateTo}
                      onChange={(e) => setExpenseDateTo(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Group</label>
                    <select
                      value={expenseGroupId}
                      onChange={(e) => {
                        setExpenseGroupId(e.target.value ? Number(e.target.value) : '');
                        setExpenseCategoryId('');
                      }}
                      className="h-10 min-w-[160px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">All groups</option>
                      {(expenseReport?.filterOptions?.groups || []).map((g: any) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category</label>
                    <select
                      value={expenseCategoryId}
                      onChange={(e) => setExpenseCategoryId(e.target.value ? Number(e.target.value) : '')}
                      className="h-10 min-w-[180px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">All categories</option>
                      {(expenseReport?.filterOptions?.categories || [])
                        .filter((c: any) => !expenseGroupId || c.groupId === expenseGroupId)
                        .map((c: any) => (
                          <option key={c.id} value={c.id}>{c.groupName} / {c.name}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Submitted by</label>
                    <select
                      value={expenseUserId}
                      onChange={(e) => setExpenseUserId(e.target.value ? Number(e.target.value) : '')}
                      className="h-10 min-w-[160px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">All users</option>
                      {(expenseReport?.submitters || []).map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName || u.username || `User #${u.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reimbursement</label>
                    <select
                      value={expenseReimbFilter}
                      onChange={(e) => setExpenseReimbFilter(e.target.value)}
                      className="h-10 min-w-[160px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">All</option>
                      <option value="needs_reimbursement">Needs reimbursement</option>
                      <option value="reimbursed">Fully reimbursed</option>
                      <option value="partial">Partial</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                  <label className="inline-flex items-center gap-2 h-10 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={expenseInternalOnly}
                      onChange={(e) => setExpenseInternalOnly(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Internal only
                  </label>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">View</label>
                    <select
                      value={expenseBreakdown}
                      onChange={(e) => setExpenseBreakdown(e.target.value as typeof expenseBreakdown)}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="rows">Expense lines</option>
                      <option value="category">By category</option>
                      <option value="group">By group</option>
                    </select>
                  </div>
                </>
              )}
              {activeTab === 'delivery' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Focus
                  </label>
                  <select
                    value={deliverySection}
                    onChange={(e) => setDeliverySection(e.target.value as typeof deliverySection)}
                    className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="sprints">Active sprints</option>
                    <option value="closed">Recently closed</option>
                  </select>
                </div>
              )}
              {activeTab !== 'explore' && (
                <button
                  type="button"
                  onClick={() => void loadTabData()}
                  className="h-10 px-4 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Refresh
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 -mb-px">
              {tabs
                .filter((t) => t.show)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === t.id
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {error && (
              <div className="mb-4 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 px-4 py-3 text-sm">
                {error}
              </div>
            )}
            {loading && (
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">Loading…</div>
            )}

            {activeTab === 'organization' && overview && (
              <div className="space-y-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Organization overview for the selected period. Click a card to open the matching pack
                  (Portfolio, Delivery, or Data Quality) with the same organization context.
                </p>
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Health</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                      label="Projects"
                      value={String(overview.health?.projectCount || 0)}
                      onClick={() => drillTo('portfolio', { rag: 'all' })}
                    />
                    <MetricCard
                      label="Green"
                      value={String(overview.health?.counts?.green || 0)}
                      onClick={() => drillTo('portfolio', { rag: 'green' })}
                    />
                    <MetricCard
                      label="Amber"
                      value={String(overview.health?.counts?.amber || 0)}
                      onClick={() => drillTo('portfolio', { rag: 'amber' })}
                    />
                    <MetricCard
                      label="Red"
                      value={String(overview.health?.counts?.red || 0)}
                      onClick={() => drillTo('portfolio', { rag: 'red' })}
                    />
                  </div>
                </section>
                {overview.expenses && (
                  <section>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Expenses (approved)</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-3">
                      <MetricCard
                        label="Project expenses"
                        value={formatMoney(overview.expenses.totals?.ProjectTotal)}
                        onClick={() => drillTo('expenses')}
                      />
                      <MetricCard
                        label="Internal expenses"
                        value={formatMoney(overview.expenses.totals?.InternalTotal)}
                        onClick={() => drillTo('expenses')}
                      />
                      <MetricCard
                        label="Reimbursable cap"
                        value={formatMoney(overview.expenses.totals?.ReimbursableCapTotal)}
                        onClick={() => drillTo('expenses')}
                      />
                      <MetricCard
                        label="Reimbursed"
                        value={formatMoney(overview.expenses.totals?.ReimbursedTotal)}
                        onClick={() => drillTo('expenses')}
                      />
                      <MetricCard
                        label="Remaining to reimburse"
                        value={formatMoney(overview.expenses.totals?.RemainingTotal)}
                        onClick={() => drillTo('expenses')}
                      />
                      <MetricCard
                        label="Fully reimbursed"
                        value={String(overview.expenses.totals?.FullyReimbursedCount || 0)}
                        onClick={() => drillTo('expenses')}
                      />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Open the Expenses tab for breakdown by group, category, submitter, and line detail.
                    </p>
                  </section>
                )}
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Effort</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <MetricCard
                      label="Estimated (leaf)"
                      value={formatHours(overview.effort?.estimatedLeafHours || 0)}
                      onClick={() => drillTo('portfolio', { rag: 'all' })}
                    />
                    <MetricCard
                      label="Planned (period)"
                      value={formatHours(overview.effort?.plannedHours?.current || 0)}
                      delta={formatDeltaMetric(overview.effort?.plannedHours, true)}
                      onClick={() => drillTo('capacity')}
                    />
                    <MetricCard
                      label="Logged (period)"
                      value={formatHours(overview.effort?.loggedHours?.current || 0)}
                      delta={formatDeltaMetric(overview.effort?.loggedHours, true)}
                      onClick={() => drillTo('capacity')}
                    />
                    <MetricCard
                      label="Open tasks"
                      value={String(overview.tasks?.open || 0)}
                      onClick={() => drillTo('portfolio', { rag: 'all' })}
                    />
                    <MetricCard
                      label="Leaf with hours"
                      value={String(overview.tasks?.leafWithHours || 0)}
                      onClick={() => drillTo('data-quality', { dq: 'unestimated' })}
                    />
                    <MetricCard
                      label="Unscheduled leaf"
                      value={String(overview.tasks?.unscheduledLeaf || 0)}
                      onClick={() => drillTo('data-quality', { dq: 'unestimated' })}
                    />
                  </div>
                </section>
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Delivery & risk</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                      label="Throughput (closed)"
                      value={String(overview.delivery?.throughput?.current || 0)}
                      delta={formatDeltaMetric(overview.delivery?.throughput)}
                      onClick={() => drillTo('delivery', { delivery: 'closed' })}
                    />
                    <MetricCard
                      label="Active sprints"
                      value={String(overview.delivery?.activeSprints || 0)}
                      onClick={() => drillTo('delivery', { delivery: 'sprints' })}
                    />
                    <MetricCard
                      label="Overdue tasks"
                      value={String(overview.tasks?.overdue || 0)}
                      onClick={() => drillTo('data-quality', { dq: 'staleOverdue' })}
                    />
                    <MetricCard
                      label="Unestimated leaf"
                      value={String(overview.risk?.unestimatedLeaf || 0)}
                      onClick={() => drillTo('data-quality', { dq: 'unestimated' })}
                    />
                    <MetricCard
                      label="Unassigned"
                      value={String(overview.risk?.unassigned || 0)}
                      onClick={() => drillTo('data-quality', { dq: 'unassigned' })}
                    />
                  </div>
                </section>

                <OrganizationCharts charts={overview.charts} formatHours={formatHours} />

                {overview.taskAnalytics && (
                  <TaskAnalyticsCharts
                    data={overview.taskAnalytics}
                    viewAllHref="/reporting?tab=data-quality"
                  />
                )}

                <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Email digest
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    Schedule a weekly or monthly organization overview email (structured metrics only).
                  </p>
                  <div className="flex flex-wrap gap-2 items-end">
                    <input
                      type="text"
                      value={digestRecipients}
                      onChange={(e) => setDigestRecipients(e.target.value)}
                      placeholder="email1@example.com, email2@…"
                      className="h-10 flex-1 min-w-[220px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    <select
                      value={digestFrequency}
                      onChange={(e) => setDigestFrequency(e.target.value as 'weekly' | 'monthly')}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                    >
                      <option value="weekly">Weekly (Mon)</option>
                      <option value="monthly">Monthly (day 1)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void createDigest()}
                      className="h-10 px-4 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Add schedule
                    </button>
                  </div>
                  {digests.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                      {digests.map((d) => (
                        <li key={d.Id} className="flex justify-between gap-2">
                          <span>
                            {d.Frequency} → {d.Recipients}
                            {d.LastSentAt ? ` (last: ${String(d.LastSentAt).slice(0, 10)})` : ''}
                          </span>
                          <button
                            type="button"
                            className="text-red-600 dark:text-red-400"
                            onClick={async () => {
                              if (!token) return;
                              await reportingApi.deleteDigest(token, Number(d.Id));
                              const dig = await reportingApi.getDigests(token, Number(organizationId));
                              setDigests(dig.data || []);
                            }}
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'portfolio' && portfolio && (() => {
              const rows = (portfolio.projects || []).filter(
                (p: any) => portfolioRagFilter === 'all' || p.healthStatus === portfolioRagFilter
              );
              const toggleProject = (id: number) => {
                setExpandedPortfolioIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                });
              };
              const expandAll = () => {
                setExpandedPortfolioIds(new Set(rows.map((p: any) => Number(p.id))));
              };
              const collapseAll = () => setExpandedPortfolioIds(new Set());
              return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Showing {rows.length} project(s)
                    {portfolioRagFilter !== 'all' ? ` · RAG = ${portfolioRagFilter}` : ''}
                    . Projects stay collapsed by default — expand to compare leaf-task estimate vs logged hours.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={expandAll}
                      className="h-9 px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Expand all
                    </button>
                    <button
                      type="button"
                      onClick={collapseAll}
                      className="h-9 px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Collapse all
                    </button>
                  </div>
                </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="text-left px-3 py-2 w-10" aria-label="Expand" />
                      <th className="text-left px-3 py-2">Project / Task</th>
                      <th className="text-left px-3 py-2">Health / Status</th>
                      <th className="text-right px-3 py-2">Progress</th>
                      <th className="text-right px-3 py-2">Open</th>
                      <th className="text-right px-3 py-2">Overdue</th>
                      <th className="text-right px-3 py-2">Est. hours</th>
                      <th className="text-right px-3 py-2">Planned</th>
                      <th className="text-right px-3 py-2">Logged</th>
                      <th className="text-right px-3 py-2">Variance</th>
                      <th className="text-right px-3 py-2">Budget spent</th>
                      <th className="text-right px-3 py-2">Remaining</th>
                      <th className="text-right px-3 py-2">Burn</th>
                      <th className="text-left px-3 py-2">End / Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p: any) => {
                      const expanded = expandedPortfolioIds.has(Number(p.id));
                      const tasks = Array.isArray(p.tasks) ? p.tasks : [];
                      const projectVariance = Number(p.loggedHours || 0) - Number(p.estimatedHours || 0);
                      return (
                        <Fragment key={p.id}>
                          <tr className="border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={() => toggleProject(Number(p.id))}
                                className="h-8 w-8 inline-flex items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                title={expanded ? 'Collapse tasks' : 'Expand tasks'}
                                aria-label={expanded ? 'Collapse tasks' : 'Expand tasks'}
                                aria-expanded={expanded}
                              >
                                {expanded ? '▾' : '▸'}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <Link
                                href={projectHref(p.id)}
                                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                              >
                                {p.name}
                              </Link>
                              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                {tasks.length} leaf task(s)
                              </span>
                            </td>
                            <td className="px-3 py-2 capitalize">
                              <span
                                className={
                                  p.healthStatus === 'red'
                                    ? 'text-red-600'
                                    : p.healthStatus === 'amber'
                                      ? 'text-amber-600'
                                      : 'text-green-600'
                                }
                              >
                                {p.healthStatus}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">{p.progressPct}%</td>
                            <td className="px-3 py-2 text-right">{p.openTasks ?? '—'}</td>
                            <td className="px-3 py-2 text-right">{p.overdueTasks}</td>
                            <td className="px-3 py-2 text-right">{formatHours(p.estimatedHours || 0)}</td>
                            <td className="px-3 py-2 text-right text-gray-400 dark:text-gray-500">—</td>
                            <td className="px-3 py-2 text-right">{formatHours(p.loggedHours || 0)}</td>
                            <td
                              className={`px-3 py-2 text-right ${
                                projectVariance > 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : projectVariance < 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {formatHours(projectVariance)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {p.budget != null && Number(p.budget) > 0 ? (
                                <span title={Number(p.hoursWithoutRate || 0) > 0 ? `${Number(p.hoursWithoutRate).toFixed(1)}h logged without an effective rate` : undefined}>
                                  {formatPortfolioBudget(Number(p.budgetSpent || 0), String(p.budgetType || 'monetary'))}
                                  {' / '}
                                  {formatPortfolioBudget(Number(p.budget), String(p.budgetType || 'monetary'))}
                                  {Number(p.hoursWithoutRate || 0) > 0 && String(p.budgetType || '') !== 'hours' ? (
                                    <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">!</span>
                                  ) : null}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {p.budgetRemaining != null && p.budget != null && Number(p.budget) > 0
                                ? formatPortfolioBudget(Number(p.budgetRemaining), String(p.budgetType || 'monetary'))
                                : '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {p.budgetBurnPct != null ? `${p.budgetBurnPct}%` : '—'}
                            </td>
                            <td className="px-3 py-2">{p.endDate ? String(p.endDate).slice(0, 10) : '—'}</td>
                          </tr>
                          {expanded && tasks.length === 0 && (
                            <tr className="bg-gray-50/80 dark:bg-gray-900/30">
                              <td />
                              <td colSpan={13} className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                                No leaf tasks in this project.
                              </td>
                            </tr>
                          )}
                          {expanded &&
                            tasks.map((t: any) => (
                              <tr
                                key={`${p.id}-${t.id}`}
                                className="border-t border-gray-100 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-900/30"
                              >
                                <td />
                                <td className="px-3 py-2 pl-8">
                                  <button
                                    type="button"
                                    onClick={() => void openTaskDetails(Number(p.id), Number(t.id))}
                                    className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                                  >
                                    {t.name}
                                  </button>
                                  {t.isOverdue ? (
                                    <span className="ml-2 text-xs text-red-600 dark:text-red-400">overdue</span>
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                                  {t.statusName || '—'}
                                  {t.assigneeName ? (
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                                      {t.assigneeName}
                                    </span>
                                  ) : (
                                    <span className="block text-xs text-amber-600 dark:text-amber-400">
                                      Unassigned
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-400">—</td>
                                <td className="px-3 py-2 text-right text-gray-400">—</td>
                                <td className="px-3 py-2 text-right">
                                  {t.isOverdue ? 'Yes' : '—'}
                                </td>
                                <td className="px-3 py-2 text-right">{formatHours(t.estimatedHours || 0)}</td>
                                <td className="px-3 py-2 text-right">{formatHours(t.plannedHours || 0)}</td>
                                <td className="px-3 py-2 text-right">{formatHours(t.loggedHours || 0)}</td>
                                <td
                                  className={`px-3 py-2 text-right ${
                                    Number(t.varianceHours || 0) > 0
                                      ? 'text-red-600 dark:text-red-400'
                                      : Number(t.varianceHours || 0) < 0
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {formatHours(t.varianceHours || 0)}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  {String(p.budgetType || '') === 'monetary'
                                    ? (
                                      <span title={Number(t.hoursWithoutRate || 0) > 0 ? 'Some hours lack an effective rate' : undefined}>
                                        {formatPortfolioBudget(Number(t.costSpent || 0), 'monetary')}
                                        {Number(t.hoursWithoutRate || 0) > 0 ? (
                                          <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">!</span>
                                        ) : null}
                                      </span>
                                    )
                                    : '—'}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-400">—</td>
                                <td className="px-3 py-2 text-right text-gray-400">—</td>
                                <td className="px-3 py-2">{t.dueDate || '—'}</td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
              );
            })()}

            {activeTab === 'delivery' && delivery && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <MetricCard
                    label="Tasks closed in period"
                    value={String(delivery.throughput?.current || 0)}
                    delta={formatDeltaMetric(delivery.throughput)}
                  />
                  <MetricCard label="Tasks created in period" value={String(delivery.tasksCreated || 0)} />
                  <MetricCard
                    label="Active sprints"
                    value={String((delivery.activeSprints || []).length)}
                  />
                </div>

                {deliverySection === 'sprints' && (
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Active sprints</h2>
                  {(delivery.activeSprints || []).length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No active sprints in this organization for the current filters. Throughput still counts
                      closed tasks in the selected date range.
                    </p>
                  ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300">
                          <tr>
                            <th className="text-left px-3 py-2">Sprint</th>
                            <th className="text-left px-3 py-2">Project</th>
                            <th className="text-left px-3 py-2">Window</th>
                            <th className="text-right px-3 py-2">Closed / total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {delivery.activeSprints.map((s: any) => (
                            <tr key={s.id} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-2 text-gray-900 dark:text-white">{s.name}</td>
                              <td className="px-3 py-2">
                                <Link href={projectHref(s.projectId)} className="text-blue-600 dark:text-blue-400 hover:underline">
                                  {s.projectName}
                                </Link>
                              </td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                                {s.startDate || '—'} → {s.endDate || '—'}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {s.closedTaskCount} / {s.taskCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                )}

                {deliverySection === 'closed' && (
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Recently closed ({(delivery.recentlyClosed || []).length})
                  </h2>
                  {(delivery.recentlyClosed || []).length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No tasks were closed in this period. Try widening the date range.
                    </p>
                  ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300">
                          <tr>
                            <th className="text-left px-3 py-2">Task</th>
                            <th className="text-left px-3 py-2">Project</th>
                            <th className="text-left px-3 py-2">Closed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {delivery.recentlyClosed.map((t: any) => (
                            <tr key={t.id} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => void openTaskDetails(Number(t.projectId), Number(t.id))}
                                  className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                                >
                                  {t.name}
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <Link
                                  href={projectHref(t.projectId)}
                                  className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                  {t.projectName}
                                </Link>
                              </td>
                              <td className="px-3 py-2">{t.closedAt || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                )}
              </div>
            )}

            {activeTab === 'capacity' && capacity && (
              <div className="space-y-4">
                <MetricCard
                  label="Pending time approvals"
                  value={String(capacity.pendingApprovals || 0)}
                />
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300">
                      <tr>
                        <th className="text-left px-3 py-2">User</th>
                        <th className="text-right px-3 py-2">Capacity</th>
                        <th className="text-right px-3 py-2">Planned</th>
                        <th className="text-right px-3 py-2">Logged</th>
                        <th className="text-right px-3 py-2">Util. %</th>
                        <th className="text-right px-3 py-2">Plan vs capacity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(capacity.byUser || [])
                        .filter((u: any) => {
                          if (!capacitySearch.trim()) return true;
                          const q = capacitySearch.trim().toLowerCase();
                          return String(u.displayName || u.username || '')
                            .toLowerCase()
                            .includes(q);
                        })
                        .map((u: any) => (
                        <tr key={u.userId} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="px-3 py-2">
                            {u.userId ? (
                              <Link
                                href={userHref(u.userId)}
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {u.displayName || u.username}
                              </Link>
                            ) : (
                              <span className="text-gray-900 dark:text-white">{u.displayName}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{formatHours(u.capacityHours || 0)}</td>
                          <td className="px-3 py-2 text-right">{formatHours(u.plannedHours)}</td>
                          <td className="px-3 py-2 text-right">{formatHours(u.loggedHours)}</td>
                          <td className="px-3 py-2 text-right">
                            {u.utilizationPct == null ? '—' : `${u.utilizationPct}%`}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {u.planVsCapacityPct == null ? '—' : `${u.planVsCapacityPct}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'data-quality' && dataQuality && (() => {
              const dqTabs = [
                { id: 'unestimated' as const, label: 'Unestimated', rows: dataQuality.unestimated || [] },
                { id: 'unassigned' as const, label: 'Unassigned', rows: dataQuality.unassigned || [] },
                { id: 'noSprint' as const, label: 'No sprint', rows: dataQuality.noSprint || [] },
                { id: 'staleOverdue' as const, label: 'Stale overdue', rows: dataQuality.staleOverdue || [] },
                {
                  id: 'pendingApprovals' as const,
                  label: 'Pending approvals',
                  rows: dataQuality.pendingApprovals || [],
                },
              ];
              const activeDq = dqTabs.find((t) => t.id === dqSubTab) || dqTabs[0];
              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700">
                    {dqTabs.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setDqSubTab(t.id)}
                        className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                          dqSubTab === t.id
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {t.label} ({t.rows.length})
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => exportQualityCsv(activeDq.rows, activeDq.id)}
                      className="h-10 px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600"
                      disabled={!activeDq.rows.length}
                    >
                      Export CSV
                    </button>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 max-h-[60vh] overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/40">
                        <tr>
                          <th className="text-left px-3 py-2">Project</th>
                          <th className="text-left px-3 py-2">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeDq.rows.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                              No issues in this category.
                            </td>
                          </tr>
                        ) : (
                          activeDq.rows.map((r: any) => (
                            <tr key={`${activeDq.id}-${r.Id}`} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-2">
                                {r.ProjectId ? (
                                  <Link
                                    href={projectHref(r.ProjectId)}
                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    {r.ProjectName || `Project #${r.ProjectId}`}
                                  </Link>
                                ) : (
                                  r.ProjectName || '—'
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {r.TaskName && r.ProjectId ? (
                                  <button
                                    type="button"
                                    onClick={() => void openTaskDetails(Number(r.ProjectId), Number(r.Id))}
                                    className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                                  >
                                    {r.TaskName}
                                  </button>
                                ) : (
                                  r.TaskName || r.Username || `#${r.Id}`
                                )}
                                {r.Hours != null ? ` (${r.Hours}h)` : ''}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {activeTab === 'expenses' && expenseReport && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Approved expenses
                  {expenseDateFrom || expenseDateTo
                    ? ` with expense date ${expenseDateFrom || '…'} – ${expenseDateTo || '…'}`
                    : ' (all dates)'}
                  . Use Expense from/to above to narrow by invoice date.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  <MetricCard label="Expenses" value={String(expenseReport.totals?.ExpenseCount || 0)} />
                  <MetricCard label="Total amount" value={formatMoney(expenseReport.totals?.GrandTotal)} />
                  <MetricCard label="Reimbursable cap" value={formatMoney(expenseReport.totals?.ReimbursableCapTotal)} />
                  <MetricCard label="Reimbursed" value={formatMoney(expenseReport.totals?.ReimbursedTotal)} />
                  <MetricCard label="Remaining" value={formatMoney(expenseReport.totals?.RemainingTotal)} />
                  <MetricCard label="Fully reimbursed" value={String(expenseReport.totals?.FullyReimbursedCount || 0)} />
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 max-h-[65vh] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300">
                      {expenseBreakdown === 'rows' ? (
                        <tr>
                          <th className="text-left px-3 py-2">Date</th>
                          <th className="text-left px-3 py-2">Title</th>
                          <th className="text-left px-3 py-2">Submitted by</th>
                          <th className="text-left px-3 py-2">Group</th>
                          <th className="text-left px-3 py-2">Category</th>
                          <th className="text-left px-3 py-2">Project</th>
                          <th className="text-right px-3 py-2">Amount</th>
                          <th className="text-right px-3 py-2">Reimb. cap</th>
                          <th className="text-right px-3 py-2">Reimbursed</th>
                          <th className="text-right px-3 py-2">Remaining</th>
                          <th className="text-left px-3 py-2">Reimb. status</th>
                        </tr>
                      ) : expenseBreakdown === 'category' ? (
                        <tr>
                          <th className="text-left px-3 py-2">Group</th>
                          <th className="text-left px-3 py-2">Category</th>
                          <th className="text-right px-3 py-2">Count</th>
                          <th className="text-right px-3 py-2">Total</th>
                          <th className="text-right px-3 py-2">Reimb. cap</th>
                          <th className="text-right px-3 py-2">Reimbursed</th>
                          <th className="text-right px-3 py-2">Remaining</th>
                        </tr>
                      ) : (
                        <tr>
                          <th className="text-left px-3 py-2">Group</th>
                          <th className="text-right px-3 py-2">Total</th>
                          <th className="text-right px-3 py-2">Reimb. cap</th>
                          <th className="text-right px-3 py-2">Reimbursed</th>
                          <th className="text-right px-3 py-2">Remaining</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {expenseBreakdown === 'rows' &&
                        ((expenseReport.rows || []).length === 0 ? (
                          <tr>
                            <td colSpan={11} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                              No approved expenses in this period for the selected filters.
                            </td>
                          </tr>
                        ) : (
                          expenseReport.rows.map((row: any) => {
                            const submitter =
                              [row.submittedByFirstName, row.submittedByLastName].filter(Boolean).join(' ') ||
                              row.submittedByUsername ||
                              `User #${row.submittedByUserId}`;
                            const reimbLabel =
                              row.reimbursementStatus === 'not_applicable'
                                ? 'Not applicable'
                                : row.reimbursementStatus === 'reimbursed'
                                  ? 'Fully reimbursed'
                                  : row.reimbursementStatus || '—';
                            return (
                              <tr key={row.id} className="border-t border-gray-100 dark:border-gray-700">
                                <td className="px-3 py-2 text-gray-900 dark:text-white whitespace-nowrap">{row.expenseDate}</td>
                                <td className="px-3 py-2 text-gray-900 dark:text-white">{row.title}</td>
                                <td className="px-3 py-2">
                                  <Link href={userHref(row.submittedByUserId)} className="text-blue-600 dark:text-blue-400 hover:underline">
                                    {submitter}
                                  </Link>
                                </td>
                                <td className="px-3 py-2 text-gray-900 dark:text-white">{row.groupName || '—'}</td>
                                <td className="px-3 py-2 text-gray-900 dark:text-white">{row.categoryName || '—'}</td>
                                <td className="px-3 py-2">
                                  {row.projectId ? (
                                    <Link href={projectHref(row.projectId)} className="text-blue-600 dark:text-blue-400 hover:underline">
                                      {row.projectName || `Project #${row.projectId}`}
                                    </Link>
                                  ) : (
                                    <span className="text-gray-500 dark:text-gray-400">Internal</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.amount)}</td>
                                <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.reimbursableCap)}</td>
                                <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.reimbursedAmount)}</td>
                                <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.remainingAmount)}</td>
                                <td className="px-3 py-2 text-gray-900 dark:text-white">{reimbLabel}</td>
                              </tr>
                            );
                          })
                        ))}
                      {expenseBreakdown === 'category' &&
                        ((expenseReport.byCategory || []).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                              No data for the selected filters.
                            </td>
                          </tr>
                        ) : (
                          expenseReport.byCategory.map((row: any) => (
                            <tr key={`${row.groupName}-${row.categoryName}`} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-2 text-gray-900 dark:text-white">{row.groupName}</td>
                              <td className="px-3 py-2 text-gray-900 dark:text-white">{row.categoryName}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{row.expenseCount}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.totalAmount)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.reimbursableCap)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.reimbursed)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.remaining)}</td>
                            </tr>
                          ))
                        ))}
                      {expenseBreakdown === 'group' &&
                        ((expenseReport.byGroup || []).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">
                              No data for the selected filters.
                            </td>
                          </tr>
                        ) : (
                          expenseReport.byGroup.map((row: any) => (
                            <tr key={row.groupName} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-3 py-2 text-gray-900 dark:text-white">{row.groupName}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.totalAmount)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.reimbursableCap)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.reimbursed)}</td>
                              <td className="px-3 py-2 text-right text-gray-900 dark:text-white">{formatMoney(row.remaining)}</td>
                            </tr>
                          ))
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'expenses' && !expenseReport && !loading && (
              <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
                {organizationId
                  ? 'No expense data loaded. Adjust filters and click Refresh, or wait for the report to load.'
                  : 'Select an organization to view expenses.'}
              </div>
            )}

            {activeTab === 'expenses' && !expenseReport && loading && (
              <div className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
                Loading expense report…
              </div>
            )}

            {activeTab === 'extract' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Export raw rows to CSV. Use organization and project filters in the toolbar to narrow results
                  client-side. Expense datasets include all dates unless you filter on the Expenses tab. CSV includes
                  every column; the preview shows up to 200 rows.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="w-full sm:w-auto sm:min-w-[240px] sm:max-w-sm">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Dataset
                    </label>
                    <select
                      value={extractDataset}
                      onChange={(e) => setExtractDataset(e.target.value)}
                      className="h-10 w-full px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
                    >
                      {extractDatasetOptions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void loadExtract()}
                      className="h-10 px-4 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                      {extractLoading ? 'Loading…' : 'Load data'}
                    </button>
                    <button
                      type="button"
                      onClick={exportExtractCsv}
                      disabled={!extractRecords.length}
                      className="h-10 px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 disabled:opacity-50 text-gray-900 dark:text-white"
                    >
                      Export CSV
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
                  {extractDatasetOptions.find((d) => d.id === extractDataset)?.description}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {extractRecords.length} row(s), {extractColumnKeys.length} column(s)
                  {extractRecords.length > 200 ? ' — preview limited to 200 rows' : ''}.
                  {extractLoadedCount != null &&
                    extractLoadedCount > extractRecords.length &&
                    ` ${extractLoadedCount} loaded; toolbar filters removed ${extractLoadedCount - extractRecords.length}.`}
                  {extractLoadedCount === 0 &&
                    ' No rows returned — check permissions or try another dataset.'}
                  {extractLoadedCount != null &&
                    extractLoadedCount > 0 &&
                    extractRecords.length === 0 &&
                    ' Widen or clear organization, project, and date filters above.'}
                </p>
                {extractRecords.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-auto max-h-[60vh]">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/40">
                        <tr>
                          {extractColumnKeys.map((k) => (
                            <th key={k} className="text-left px-2 py-2 whitespace-nowrap">
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {extractRecords.slice(0, 200).map((row, idx) => (
                          <tr key={idx} className="border-t border-gray-100 dark:border-gray-700">
                            {extractColumnKeys.map((k) => (
                              <td key={k} className="px-2 py-1 whitespace-nowrap max-w-[240px] truncate">
                                {renderExtractCell(row, k)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'explore' && canExplore && (
              <div className="w-full">
                <WebReportsExplorer embedded />
              </div>
            )}
          </div>
        </main>
        
      {taskModalState.show && (
        <>
          {taskModalState.isLoading && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 text-sm text-gray-700 dark:text-gray-200">
                Loading task…
              </div>
            </div>
          )}
          {!taskModalState.isLoading && taskModalState.error && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                <div className="text-sm text-red-600 dark:text-red-400 mb-4">{taskModalState.error}</div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeTaskDetails}
                    className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
          {!taskModalState.isLoading && !taskModalState.error && taskModalState.project && taskModalState.task && token && (
            <TaskDetailModal
              projectId={Number(taskModalState.project.Id)}
              organizationId={Number(taskModalState.project.OrganizationId)}
              task={taskModalState.task}
              project={taskModalState.project}
              tasks={taskModalState.tasks}
              onOpenTask={(targetTask) => {
                const fullTask =
                  taskModalState.tasks.find((entry) => Number(entry.Id) === Number(targetTask.Id)) ||
                  targetTask;
                setTaskModalState((prev) => ({ ...prev, task: fullTask }));
              }}
              onClose={closeTaskDetails}
              onSaved={async () => {
                if (!taskModalState.project || !taskModalState.task) return;
                await openTaskDetails(
                  Number(taskModalState.project.Id),
                  Number(taskModalState.task.Id)
                );
              }}
              token={token}
            />
          )}
        </>
      )}

        <ScrollToTopButton />
      </div>
    </CustomerUserGuard>
  );
}

export default function ReportingPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full text-gray-600 dark:text-gray-300 p-6">
          Loading reporting…
        </div>
      }
    >
      <ReportingHubInner />
    </Suspense>
  );
}
