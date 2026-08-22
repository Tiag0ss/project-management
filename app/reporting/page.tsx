'use client';

import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
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
import { downloadCsv, toCsv } from '@/lib/csv';
import { useFormatHours } from '@/lib/useFormatHours';
import { WebReportsExplorer } from '@/app/web-reports/page';
import { OrganizationCharts } from '@/components/reporting/OrganizationCharts';

const MANAGER_TABS = [
  'organization',
  'portfolio',
  'delivery',
  'capacity',
  'data-quality',
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
  const [extractLoading, setExtractLoading] = useState(false);

  const prev = useMemo(() => previousPeriod(dateFrom, dateTo), [dateFrom, dateTo]);

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
        const [orgRes, projRes] = await Promise.all([
          organizationsApi.getAll(token),
          projectsApi.getAll(token),
        ]);
        if (cancelled) return;
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
  ]);

  useEffect(() => {
    void loadTabData();
  }, [loadTabData]);

  useEffect(() => {
    if (activeTab === 'explore' && !canExplore) {
      setActiveTab(defaultTab);
    }
    if (
      ['organization', 'portfolio', 'delivery', 'capacity', 'data-quality'].includes(activeTab) &&
      !canManager &&
      activeTab !== 'capacity'
    ) {
      setActiveTab(defaultTab);
    }
    if (activeTab === 'capacity' && !canCapacity) {
      setActiveTab(defaultTab);
    }
  }, [activeTab, canExplore, canManager, canCapacity, defaultTab, setActiveTab]);

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
      if (organizationId) {
        records = records.filter(
          (r: any) => Number(r.OrganizationId || 0) === Number(organizationId)
        );
      }
      if (projectId) {
        records = records.filter((r: any) => Number(r.ProjectId || 0) === Number(projectId));
      }
      if (dateFrom || dateTo) {
        const dateKeys = ['WorkDate', 'CallDate', 'CreatedAt', 'DueDate', 'StartDate', 'AllocationDate'];
        records = records.filter((r: any) => {
          const raw = dateKeys.map((k) => r[k]).find(Boolean);
          if (!raw) return true;
          const d = String(raw).slice(0, 10);
          if (dateFrom && d < dateFrom) return false;
          if (dateTo && d > dateTo) return false;
          return true;
        });
      }
      setExtractRecords(records);
    } catch (err: any) {
      setError(err?.message || 'Extract failed');
      setExtractRecords([]);
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
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
          <Navbar />
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
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
          <Navbar />
          <main className="w-full p-6 text-gray-600 dark:text-gray-300">Loading reporting…</main>
        </div>
      </CustomerUserGuard>
    );
  }

  if (!access.canAccessHub && !permissions?.canViewReports && !user?.isAdmin) {
    return (
      <CustomerUserGuard>
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
          <Navbar />
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
    { id: 'extract', label: 'Extract', show: true },
    { id: 'explore', label: 'Explore (advanced)', show: canExplore },
  ];

  return (
    <CustomerUserGuard>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
        <Navbar />
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
              {activeTab !== 'explore' && activeTab !== 'data-quality' && activeTab !== 'portfolio' && (
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
                      <th className="text-right px-3 py-2">Budget</th>
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
                              {p.budget != null && Number(p.budget) > 0
                                ? `${Number(p.budgetSpent || 0).toFixed(0)} / ${Number(p.budget).toFixed(0)}${
                                    p.budgetType === 'monetary' ? '' : 'h'
                                  }`
                                : '—'}
                            </td>
                            <td className="px-3 py-2">{p.endDate ? String(p.endDate).slice(0, 10) : '—'}</td>
                          </tr>
                          {expanded && tasks.length === 0 && (
                            <tr className="bg-gray-50/80 dark:bg-gray-900/30">
                              <td />
                              <td colSpan={11} className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
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

            {activeTab === 'extract' && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-end">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Dataset
                    </label>
                    <select
                      value={extractDataset}
                      onChange={(e) => setExtractDataset(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                    >
                      {[
                        'projects',
                        'tasks',
                        'timeEntries',
                        'callRecords',
                        'timeAndCalls',
                        'customers',
                        'applications',
                        'tickets',
                        'allocationDates',
                      ].map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
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
                    className="h-10 px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 disabled:opacity-50"
                  >
                    Export CSV
                  </button>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {extractRecords.length} row(s) loaded (filters applied client-side where fields exist).
                </p>
                {extractRecords.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-auto max-h-[60vh]">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/40">
                        <tr>
                          {Object.keys(extractRecords[0])
                            .slice(0, 12)
                            .map((k) => (
                              <th key={k} className="text-left px-2 py-2 whitespace-nowrap">
                                {k}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {extractRecords.slice(0, 200).map((row, idx) => (
                          <tr key={idx} className="border-t border-gray-100 dark:border-gray-700">
                            {Object.keys(extractRecords[0])
                              .slice(0, 12)
                              .map((k) => (
                                <td key={k} className="px-2 py-1 whitespace-nowrap max-w-[200px] truncate">
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
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 p-6">
          Loading reporting…
        </div>
      }
    >
      <ReportingHubInner />
    </Suspense>
  );
}
