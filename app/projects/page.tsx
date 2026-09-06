/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation'
import { oldPath } from '@/lib/oldPath';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useToast } from '@/contexts/ToastContext';
import { projectsApi, Project, CreateProjectData } from '@/lib/api/projects';
import { organizationsApi } from '@/lib/api/organizations';
import { getCustomers, Customer } from '@/lib/api/customers';
import { downloadCsv, parseBooleanLike, parseCsv, parseNumberLike, toCsv } from '@/lib/csv';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import EmptyState from '@/components/EmptyState';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import ProjectFormModal from '@/components/ProjectFormModal';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import { NavModuleIcon } from '@/lib/navIcons';
import { Search } from 'lucide-react';
import { useFormatHours } from '@/lib/useFormatHours';
import { useColorVision } from '@/hooks/useColorVision';
import { useIsMobile } from '@/hooks/useIsMobile';

type ProjectSortField = 'name' | 'status' | 'tasks' | 'hours' | 'tickets' | 'startDate' | 'endDate' | 'budget' | 'rag' | 'progress';
type SortDirection = 'asc' | 'desc';
type RAGStatus = 'red' | 'amber' | 'green';

export default function ProjectsPage() {
  const decimalHoursToHMS = useFormatHours();
  const { pillStyle } = useColorVision();
  const { showToast } = useToast();
  const isMobile = useIsMobile();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'list';
    const stored = window.localStorage.getItem('projects:viewMode');
    return stored === 'grid' || stored === 'list' ? stored : 'list';
  });
  const effectiveViewMode: 'grid' | 'list' = isMobile ? 'grid' : viewMode;
  const [filterText, setFilterText] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRAG, setFilterRAG] = useState<RAGStatus | ''>('');
  const [hideCompleted, setHideCompleted] = useState(true);
  const [sortField, setSortField] = useState<ProjectSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const { user, token, isLoading } = useAuth();
  const { permissions, isLoading: isLoadingPermissions } = usePermissions();
  const canViewBudgetInfo = permissions?.canViewBudgetInfo || false;
  const router = useRouter();
  const [modalMessage, setModalMessage] = useState<{
    type: 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalMessage({ type: 'confirm', title, message, onConfirm });
  };

  const closeConfirmModal = () => {
    setModalMessage(null);
  };

  const handleModalConfirm = () => {
    if (modalMessage?.onConfirm) {
      modalMessage.onConfirm();
    }
    closeConfirmModal();
  };

  useEffect(() => {
    if (!token) {
      setFeatureFlagsLoaded(true);
      return;
    }

    const loadFeatureFlags = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
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

    loadFeatureFlags();
  }, [token]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(oldPath('/login'));
      return;
    }
    if (user && token && featureFlagsLoaded) {
      loadProjects();
    }
  }, [user, token, isLoading, router, featureFlagsLoaded]);

  useEffect(() => {
    if (!internalTicketsEnabled && sortField === 'tickets') {
      setSortField('name');
      setSortDirection('asc');
    }
  }, [internalTicketsEnabled, sortField]);

  useEffect(() => {
    if (!canViewBudgetInfo && sortField === 'budget') {
      setSortField('name');
      setSortDirection('asc');
    }
  }, [canViewBudgetInfo, sortField]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowImportModal(false);
      setShowCreateModal(false);
      setModalMessage(null);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('projects:viewMode', viewMode);
  }, [viewMode]);

  const loadProjects = async () => {
    if (!token) return;
    
    try {
      setIsLoadingProjects(true);
      const response = await projectsApi.getAll(token);
      setProjects(response.projects);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
      showToast({ type: 'error', title: 'Failed to load projects', message: err.message || 'Please retry.' });
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleCreateProject = () => {
    setEditingProject(null);
    setShowCreateModal(true);
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setShowCreateModal(true);
  };

  const handleDeleteProject = async (id: number) => {
    if (!token) return;
    
    showConfirm(
      'Delete Project',
      'Are you sure you want to delete this project?',
      async () => {
        try {
          await projectsApi.delete(id, token);
          await loadProjects();
          showToast({ type: 'success', title: 'Project deleted', message: 'The project was deleted successfully.' });
        } catch (err: any) {
          setError(err.message || 'Failed to delete project');
          showToast({ type: 'error', title: 'Delete failed', message: err.message || 'Please retry.' });
        }
      }
    );
  };

  const handleModalClose = () => {
    setShowCreateModal(false);
    setEditingProject(null);
  };

  const handleProjectSaved = () => {
    handleModalClose();
    loadProjects();
    showToast({ type: 'success', title: 'Project saved', message: 'Changes were saved successfully.' });
  };

  const handleExportProjectsCsv = () => {
    const headers = [
      'ProjectName',
      'Description',
      'OrganizationName',
      'CustomerName',
      'StartDate',
      'EndDate',
      'IsHobby',
      'IsGlobal',
      'IsVisibleToCustomer',
      'Budget',
      'BudgetType'
    ];

    const rows = filteredAndSortedProjects.map((project) => ({
      ProjectName: project.ProjectName || '',
      Description: project.Description || '',
      OrganizationName: project.OrganizationName || '',
      CustomerName: project.CustomerName || '',
      StartDate: project.StartDate ? project.StartDate.split('T')[0] : '',
      EndDate: project.EndDate ? project.EndDate.split('T')[0] : '',
      IsHobby: project.IsHobby ? 'true' : 'false',
      IsGlobal: project.IsGlobal ? 'true' : 'false',
      IsVisibleToCustomer: project.IsVisibleToCustomer ? 'true' : 'false',
      Budget: project.Budget != null ? String(project.Budget) : '',
      BudgetType: project.BudgetType || 'monetary'
    }));

    downloadCsv('projects_export.csv', toCsv(rows, headers));
  };

  const handleProjectsCsvImport = async (file: File) => {
    if (!token) return;

    setIsImportingCsv(true);
    setError('');

    try {
      const [organizationsResponse, allCustomers] = await Promise.all([
        organizationsApi.getAll(token),
        getCustomers(token)
      ]);

      const availableOrganizations = organizationsResponse.organizations || [];

      const text = await file.text();
      const rows = parseCsv(text);

      if (!rows.length) {
        throw new Error('CSV is empty or has no data rows');
      }

      let successCount = 0;
      const failures: string[] = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const rowNumber = index + 2;

        try {
          const projectName = (row.ProjectName || '').trim();
          const organizationName = (row.OrganizationName || '').trim();

          if (!projectName) {
            throw new Error('ProjectName is required');
          }

          if (!organizationName) {
            throw new Error('OrganizationName is required');
          }

          const organization = availableOrganizations.find((entry) => entry.Name.toLowerCase() === organizationName.toLowerCase());
          if (!organization) {
            throw new Error(`Unknown organization: ${organizationName}`);
          }

          const customerName = (row.CustomerName || '').trim();
          let customerId: number | undefined;
          if (customerName) {
            const customer = allCustomers.find((entry: Customer) => {
              const inOrganization = (entry.Organizations || []).some((item) => item.OrganizationId === organization.Id);
              return inOrganization && entry.Name.toLowerCase() === customerName.toLowerCase();
            });

            if (!customer) {
              throw new Error(`Unknown customer in organization ${organizationName}: ${customerName}`);
            }

            customerId = customer.Id;
          }

          const parsedBudget = parseNumberLike(row.Budget || '');

          const payload: CreateProjectData = {
            organizationId: organization.Id,
            projectName,
            description: (row.Description || '').trim() || undefined,
            startDate: (row.StartDate || '').trim() || undefined,
            endDate: (row.EndDate || '').trim() || undefined,
            isHobby: parseBooleanLike(row.IsHobby || ''),
            isGlobal: parseBooleanLike(row.IsGlobal || ''),
            isVisibleToCustomer: parseBooleanLike(row.IsVisibleToCustomer || ''),
            customerId,
            budget: parsedBudget,
            budgetType: (row.BudgetType || '').trim().toLowerCase() === 'hours' ? 'hours' : 'monetary',
          };

          await projectsApi.create(payload, token);
          successCount += 1;
        } catch (importError: any) {
          failures.push(`Row ${rowNumber}: ${importError.message || 'Failed to import project'}`);
        }
      }

      await loadProjects();

      if (failures.length) {
        setError(`Imported ${successCount}/${rows.length} projects. ${failures.slice(0, 5).join(' | ')}${failures.length > 5 ? ' | ...' : ''}`);
      } else {
        setError('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to import projects CSV');
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleProjectsCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await handleProjectsCsvImport(file);
    event.target.value = '';
  };

  // Filter and sort projects
  const ragMap = useMemo(() => {
    const map = new Map<number, { status: RAGStatus; reasons: string[] }>();
    projects.forEach((p) => map.set(p.Id, {
      status: p.HealthStatus || 'green',
      reasons: Array.isArray(p.HealthReasons) ? p.HealthReasons : [],
    }));
    return map;
  }, [projects]);

  const orgs = useMemo(() => Array.from(new Set(projects.map(p => p.OrganizationName || '').filter(Boolean))).sort(), [projects]);
  const statuses = useMemo(() => Array.from(new Set(projects.map(p => p.StatusName || '').filter(Boolean))).sort(), [projects]);

  const ragSummary = useMemo(() => {
    const vals = Array.from(ragMap.values());
    return {
      red: vals.filter(r => r.status === 'red').length,
      amber: vals.filter(r => r.status === 'amber').length,
      green: vals.filter(r => r.status === 'green').length,
      total: projects.length,
    };
  }, [ragMap, projects.length]);

  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects];

    const rowMatchesSearch = (project: Project, search: string): boolean => {
      const record = project as unknown as Record<string, unknown>;

      for (const [key, rawValue] of Object.entries(record)) {
        if (rawValue === null || rawValue === undefined) continue;
        if (Array.isArray(rawValue)) continue;
        if (typeof rawValue === 'object') continue;

        const valueText = String(rawValue).toLowerCase();
        if (valueText.includes(search)) return true;

        const relationBase = key.endsWith('Id')
          ? key.slice(0, -2)
          : key.toLowerCase().endsWith('_id')
            ? key.slice(0, -3)
            : null;

        if (relationBase) {
          const relationKeys = [
            `${relationBase}Name`,
            `${relationBase}Title`,
            `${relationBase}Description`,
            `${relationBase}DisplayName`,
            `${relationBase}Label`,
            `${relationBase}Code`,
            `${relationBase}Number`,
            `${relationBase}_name`,
            `${relationBase}_title`,
            `${relationBase}_description`,
          ];

          const relationMatch = relationKeys.some((relationKey) => {
            const relationValue = record[relationKey];
            return relationValue !== null && relationValue !== undefined && String(relationValue).toLowerCase().includes(search);
          });

          if (relationMatch) return true;
        }
      }

      return false;
    };

    // Apply filter
    if (filterText.trim()) {
      const search = filterText.toLowerCase();
      result = result.filter((project) => rowMatchesSearch(project, search));
    }
    if (filterOrg) result = result.filter(p => p.OrganizationName === filterOrg);
    if (filterStatus) result = result.filter(p => p.StatusName === filterStatus);
    if (filterRAG) result = result.filter(p => ragMap.get(p.Id)?.status === filterRAG);
    if (hideCompleted) result = result.filter(p => !p.StatusIsClosed && !p.StatusIsCancelled);

    // Apply sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.ProjectName.localeCompare(b.ProjectName);
          break;
        case 'status':
          comparison = (a.StatusName || '').localeCompare(b.StatusName || '');
          break;
        case 'tasks':
          comparison = (Number(a.TotalTasks) || 0) - (Number(b.TotalTasks) || 0);
          break;
        case 'progress': {
          const pA = a.TotalTasks ? (Number(a.CompletedTasks) || 0) / Number(a.TotalTasks) : 0;
          const pB = b.TotalTasks ? (Number(b.CompletedTasks) || 0) / Number(b.TotalTasks) : 0;
          comparison = pA - pB;
          break;
        }
        case 'hours':
          comparison = (Number(a.TotalWorkedHours) || 0) - (Number(b.TotalWorkedHours) || 0);
          break;
        case 'budget': {
          if (!canViewBudgetInfo) {
            comparison = 0;
            break;
          }
          const bA = a.Budget ? (Number(a.BudgetSpent) || 0) / Number(a.Budget) : 0;
          const bB = b.Budget ? (Number(b.BudgetSpent) || 0) / Number(b.Budget) : 0;
          comparison = bA - bB;
          break;
        }
        case 'tickets':
          comparison = internalTicketsEnabled
            ? (Number(a.OpenTickets) || 0) - (Number(b.OpenTickets) || 0)
            : 0;
          break;
        case 'startDate':
          comparison = (a.StartDate ? new Date(a.StartDate).getTime() : 0) - (b.StartDate ? new Date(b.StartDate).getTime() : 0);
          break;
        case 'endDate':
          comparison = (a.EndDate ? new Date(a.EndDate).getTime() : 0) - (b.EndDate ? new Date(b.EndDate).getTime() : 0);
          break;
        case 'rag': {
          const order: Record<RAGStatus, number> = { red: 0, amber: 1, green: 2 };
          comparison = order[ragMap.get(a.Id)?.status || 'green'] - order[ragMap.get(b.Id)?.status || 'green'];
          break;
        }
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [projects, filterText, filterOrg, filterStatus, filterRAG, hideCompleted, sortField, sortDirection, ragMap, canViewBudgetInfo]);

  const additionalProjectColumnKeys = useMemo(() => {
    const excludedKeys = new Set<string>([
      'Id',
      'ProjectName',
      'OrganizationName',
      'StatusName',
      'StatusColor',
      'StatusIsClosed',
      'StatusIsCancelled',
      'TotalTasks',
      'CompletedTasks',
      'TotalEstimatedHours',
      'TotalWorkedHours',
      'Budget',
      'BudgetSpent',
      'BudgetType',
      'OpenTickets',
      'StartDate',
      'EndDate',
      'IsGlobal',
      'IsHobby',
      'CustomerName',
      'ApplicationNames',
      'OrganizationId',
      'Status',
      'CreatedBy',
      'CreatedAt',
      'UpdatedAt',
      'Description',
      'HealthStatus',
      'HealthReasons',
      'HealthOverdueTasks',
      'HealthTotalTasks',
      'HealthUnassignedTasks',
      'HealthAmberTasks',
      'HealthRedTasks',
    ]);

    const keys = new Set<string>();
    for (const project of projects) {
      const record = project as unknown as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (excludedKeys.has(key)) continue;
        const value = record[key];
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) continue;
        if (typeof value === 'object') continue;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            continue;
          }
        }
        keys.add(key);
      }
    }

    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const formatExtraColumnLabel = (rawKey: string) =>
    rawKey
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (value) => value.toUpperCase());

  const renderProjectExtraColumnValue = (project: Project, rawKey: string): string => {
    const record = project as unknown as Record<string, unknown>;
    const value = record[rawKey];
    if (value === undefined || value === null) return '-';

    const relationBase = rawKey.endsWith('Id')
      ? rawKey.slice(0, -2)
      : rawKey.toLowerCase().endsWith('_id')
        ? rawKey.slice(0, -3)
        : null;
    if (relationBase) {
      const relationKeys = [
        `${relationBase}Name`,
        `${relationBase}Title`,
        `${relationBase}Description`,
        `${relationBase}DisplayName`,
        `${relationBase}Label`,
        `${relationBase}Code`,
        `${relationBase}Number`,
        `${relationBase}_name`,
        `${relationBase}_title`,
        `${relationBase}_description`,
      ];
      const relationValue = relationKeys
        .map((key) => record[key])
        .find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim().length > 0);

      if (relationValue !== undefined && relationValue !== null) {
        const idText = String(value).trim();
        const descriptionText = String(relationValue).trim();
        if (descriptionText && descriptionText !== idText) {
          return `${idText} — ${descriptionText}`;
        }
      }
    }

    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-';
    const text = String(value).trim();
    if (!text) return '-';
    const parsedDate = Date.parse(text);
    if (Number.isFinite(parsedDate) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
      return new Date(parsedDate).toLocaleDateString();
    }
    return text;
  };

  const handleSort = (field: ProjectSortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getAriaSort = (field: ProjectSortField): 'none' | 'ascending' | 'descending' => {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  if (isLoading) {
    return (
      <div className="w-full">
        <div className="w-full mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="space-y-5 animate-pulse">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-24" />
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow h-24" />
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-96" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (!isLoadingPermissions && !permissions?.canViewProjects) {
    return (
      <div className="w-full">
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h2>
            <p className="text-gray-600 dark:text-gray-400">You don&apos;t have permission to view projects.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <CustomerUserGuard>
    <div className="w-full">
      <main className="w-full">
        <div className="space-y-2">
          {/* Header + actions — health chips live in the filter bar */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold leading-tight text-gray-900 dark:text-white">My Projects</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {projects.length} project{projects.length !== 1 ? 's' : ''} across your organisations
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="hidden sm:flex items-center rounded-md border border-gray-300 bg-gray-100 p-0.5 dark:border-gray-600 dark:bg-gray-700">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`rounded p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-white shadow dark:bg-gray-600' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  title="Grid view"
                >
                  <svg className="h-4 w-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`rounded p-1.5 transition-colors ${viewMode === 'list' ? 'bg-white shadow dark:bg-gray-600' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  title="List view"
                >
                  <svg className="h-4 w-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              </div>
              {permissions?.canCreateProjects && (
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  disabled={isImportingCsv}
                  className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
                >
                  {isImportingCsv ? 'Importing...' : 'Import CSV'}
                </button>
              )}
              <button
                type="button"
                onClick={handleExportProjectsCsv}
                className="h-10 px-4 bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
              >
                Export CSV
              </button>
              {permissions?.canCreateProjects && (
                <button
                  type="button"
                  onClick={handleCreateProject}
                  className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center gap-2"
                >
                  <span className="text-base leading-none">+</span>
                  New Project
                </button>
              )}
            </div>
          </div>

          {/* Error ProjectsMessage */}
          {error && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-red-400 bg-red-100 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
              <span>{error}</span>
              <button
                type="button"
                onClick={loadProjects}
                className="h-9 px-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading State */}
          {isLoadingProjects ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-20 rounded-lg bg-white shadow dark:bg-gray-800" />
              <div className="h-96 rounded-lg bg-white shadow dark:bg-gray-800" />
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<NavModuleIcon href="/projects" size={40} className="text-[var(--pm-muted)] opacity-70" />}
              title="No projects yet"
              message="Get started by creating your first project or reload if you expected data."
              primaryAction={permissions?.canCreateProjects ? { label: 'Create Project', onClick: handleCreateProject } : undefined}
              secondaryAction={{ label: 'Reload', onClick: loadProjects }}
            />
          ) : (
            /* Has projects — show filter bar + view */
            <>
              <CollapsibleFilterPanel
                className="mb-2"
                title="Project filters"
                activeCount={[
                  filterText.trim() ? 1 : 0,
                  filterOrg ? 1 : 0,
                  filterStatus ? 1 : 0,
                  filterRAG ? 1 : 0,
                  hideCompleted ? 1 : 0,
                ].reduce((a, b) => a + b, 0)}
                headerMiddle={
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFilterRAG('')}
                      className={`rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors ${
                        filterRAG === ''
                          ? 'border-[var(--pm-accent)] bg-[var(--pm-accent)]/15 text-[var(--pm-accent-soft)]'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {ragSummary.total} total
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterRAG(filterRAG === 'red' ? '' : 'red')}
                      className={`rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors ${
                        filterRAG === 'red'
                          ? 'border-red-500 bg-red-500/15 text-red-600 dark:text-red-300'
                          : 'border-gray-300 bg-white text-red-700 hover:bg-red-50 dark:border-gray-600 dark:bg-gray-800 dark:text-red-300'
                      }`}
                    >
                      ● {ragSummary.red} red
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterRAG(filterRAG === 'amber' ? '' : 'amber')}
                      className={`rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors ${
                        filterRAG === 'amber'
                          ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'border-gray-300 bg-white text-amber-700 hover:bg-amber-50 dark:border-gray-600 dark:bg-gray-800 dark:text-amber-300'
                      }`}
                    >
                      ● {ragSummary.amber} amber
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterRAG(filterRAG === 'green' ? '' : 'green')}
                      className={`rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors ${
                        filterRAG === 'green'
                          ? 'border-green-500 bg-green-500/15 text-green-700 dark:text-green-300'
                          : 'border-gray-300 bg-white text-green-700 hover:bg-green-50 dark:border-gray-600 dark:bg-gray-800 dark:text-green-300'
                      }`}
                    >
                      ● {ragSummary.green} green
                    </button>
                  </div>
                }
                headerExtra={
                  <span className="text-xs text-gray-400">
                    {filteredAndSortedProjects.length !== projects.length
                      ? `${filteredAndSortedProjects.length} of ${projects.length}`
                      : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
                  </span>
                }
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="relative lg:col-span-2">
                    <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={filterText}
                      onChange={e => setFilterText(e.target.value)}
                      className="w-full pl-9 pr-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option value="">All Organisations</option>
                    {orgs.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option value="">All Statuses</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={`${sortField}-${sortDirection}`}
                    onChange={e => {
                      const [f, d] = e.target.value.split('-');
                      setSortField(f as ProjectSortField);
                      setSortDirection(d as SortDirection);
                    }}
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option value="name-asc">Name A→Z</option>
                    <option value="name-desc">Name Z→A</option>
                    <option value="rag-asc">Health (worst first)</option>
                    <option value="progress-desc">Progress (most first)</option>
                    <option value="progress-asc">Progress (least first)</option>
                    {canViewBudgetInfo && <option value="budget-desc">Budget burn (highest)</option>}
                    <option value="hours-desc">Hours worked (most)</option>
                    {internalTicketsEnabled && <option value="tickets-desc">Open tickets (most)</option>}
                    <option value="endDate-asc">End date (soonest)</option>
                    <option value="endDate-desc">End date (latest)</option>
                  </select>
                </div>
                <div className="mt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={hideCompleted} onChange={e => setHideCompleted(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                    Hide closed / cancelled
                  </label>
                </div>
              </CollapsibleFilterPanel>

              {filteredAndSortedProjects.length === 0 ? (
                  <EmptyState
                    icon={<Search size={40} strokeWidth={1.5} className="text-[var(--pm-muted)] opacity-70" aria-hidden />}
                    title="No projects match the selected filters"
                    message="Try adjusting search, organization, status, or hidden-completed settings."
                    primaryAction={{
                      label: 'Clear filters',
                      onClick: () => {
                        setFilterText('');
                        setFilterOrg('');
                        setFilterStatus('');
                        setFilterRAG('');
                        setHideCompleted(false);
                      }
                    }}
                    secondaryAction={{ label: 'Reload', onClick: loadProjects }}
                  />
              ) : effectiveViewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredAndSortedProjects.map(project => (
                    <ProjectCard
                      key={project.Id}
                      project={project}
                      rag={ragMap.get(project.Id)!}
                      internalTicketsEnabled={internalTicketsEnabled}
                      canViewBudgetInfo={canViewBudgetInfo}
                      onEdit={handleEditProject}
                      onDelete={handleDeleteProject}
                      canEdit={permissions?.canManageProjects || false}
                      canDelete={permissions?.canDeleteProjects || false}
                    />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto overflow-hidden rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" data-grid-key="projects-list">
                    <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th data-column-key="project" aria-sort={getAriaSort('name')} className="cursor-pointer select-none px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" onClick={() => handleSort('name')}>
                          <div className="flex items-center">Project</div>
                        </th>
                        <th data-column-key="health" aria-sort={getAriaSort('rag')} className="cursor-pointer select-none px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" onClick={() => handleSort('rag')}>
                          <div className="flex items-center justify-center">Health</div>
                        </th>
                        <th data-column-key="status" aria-sort={getAriaSort('status')} className="cursor-pointer select-none px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" onClick={() => handleSort('status')}>
                          <div className="flex items-center justify-center">Status</div>
                        </th>
                        <th data-column-key="progress" aria-sort={getAriaSort('progress')} className="cursor-pointer select-none px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" onClick={() => handleSort('progress')}>
                          <div className="flex items-center justify-center">Progress</div>
                        </th>
                        <th data-column-key="hours" aria-sort={getAriaSort('hours')} className="cursor-pointer select-none px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" onClick={() => handleSort('hours')}>
                          <div className="flex items-center justify-center">Hours</div>
                        </th>
                        {canViewBudgetInfo && (
                          <th data-column-key="budget" aria-sort={getAriaSort('budget')} className="cursor-pointer select-none px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" onClick={() => handleSort('budget')}>
                            <div className="flex items-center justify-center">Budget</div>
                          </th>
                        )}
                        {internalTicketsEnabled && (
                          <th data-column-key="tickets" aria-sort={getAriaSort('tickets')} className="cursor-pointer select-none px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" onClick={() => handleSort('tickets')}>
                            <div className="flex items-center justify-center">Tickets</div>
                          </th>
                        )}
                        <th data-column-key="dates" aria-sort={getAriaSort('endDate')} className="cursor-pointer select-none px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" onClick={() => handleSort('endDate')}>
                          <div className="flex items-center justify-center">Dates</div>
                        </th>
                        {additionalProjectColumnKeys.map((columnKey) => (
                          <th
                            key={`extra-project-header-${columnKey}`}
                            data-column-key={`extra-${columnKey}`}
                            data-default-hidden="true"
                            className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
                          >
                            {formatExtraColumnLabel(columnKey)}
                          </th>
                        ))}
                        <th data-column-key="actions" scope="col" className="relative px-3 py-2">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredAndSortedProjects.map(project => {
                        const totalTasks = Number(project.TotalTasks) || 0;
                        const completedTasks = Number(project.CompletedTasks) || 0;
                        const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                        const estimatedHours = Number(project.TotalEstimatedHours) || 0;
                        const workedHours = Number(project.TotalWorkedHours) || 0;
                        const hoursPercent = estimatedHours > 0 ? Math.min(100, Math.round((workedHours / estimatedHours) * 100)) : 0;
                        const budgetTotal = Number(project.Budget) || 0;
                        const budgetSpent = Number(project.BudgetSpent) || 0;
                        const budgetType = project.BudgetType === 'hours' ? 'hours' : 'monetary';
                        const budgetLabel = budgetType === 'hours' ? 'h' : '$';
                        const budgetPct = budgetTotal > 0 ? Math.min(100, Math.round((budgetSpent / budgetTotal) * 100)) : 0;
                        const rag = ragMap.get(project.Id) || { status: 'green' as RAGStatus, reasons: [] };
                        const ragDot = rag.status === 'red' ? '🔴' : rag.status === 'amber' ? '🟡' : '🟢';
                        const isOverdue = project.EndDate && new Date(project.EndDate) < new Date() && !project.StatusIsClosed;
                        return (
                          <tr key={project.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => router.push(`/projects/${project.Id}`)}>
                            <td className="px-3 py-2 text-sm">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">{project.ProjectName}</div>
                                {!!project.IsGlobal && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Global Project</span>}
                                {!!project.IsHobby && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Hobby</span>}
                                {!!isOverdue && <span className="text-red-500 text-xs font-semibold">Overdue</span>}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {project.OrganizationName}{project.CustomerName && <span className="ml-2 text-blue-500">• {project.CustomerName}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span title={rag.reasons.join(', ') || 'On track'} className="text-lg leading-none cursor-default">{ragDot}</span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={pillStyle(project.StatusColor, { alpha: '20' })}>
                                {project.StatusName || 'Unknown'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col items-center gap-1 min-w-[80px]">
                                <span className="text-xs text-gray-900 dark:text-white font-medium">{completedTasks}/{totalTasks} ({progressPercent}%)</span>
                                {totalTasks > 0 && <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${progressPercent}%` }} /></div>}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col items-center gap-1 min-w-[80px]">
                                <span className={`text-xs font-medium ${hoursPercent > 100 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{decimalHoursToHMS(workedHours)} / {decimalHoursToHMS(estimatedHours)}</span>
                                {estimatedHours > 0 && <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${hoursPercent > 100 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, hoursPercent)}%` }} /></div>}
                              </div>
                            </td>
                            {canViewBudgetInfo && (
                              <td className="px-3 py-2">
                                {budgetTotal > 0 ? (
                                  <div className="flex flex-col items-center gap-1 min-w-[80px]">
                                    <span className={`text-xs font-medium ${budgetPct >= 100 ? 'text-red-600 dark:text-red-400' : budgetPct >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                                      {budgetType === 'hours'
                                        ? `${budgetSpent.toFixed(1)}${budgetLabel} / ${budgetTotal.toFixed(1)}${budgetLabel} (${budgetPct}%)`
                                        : `${budgetLabel}${budgetSpent.toFixed(0)} / ${budgetLabel}${budgetTotal.toFixed(0)} (${budgetPct}%)`}
                                    </span>
                                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${budgetPct}%` }} /></div>
                                  </div>
                                ) : <span className="text-xs text-gray-400 text-center block">—</span>}
                              </td>
                            )}
                            {internalTicketsEnabled && (
                              <td className="px-3 py-2 text-center">
                                <span className={`text-sm font-medium ${(Number(project.OpenTickets) || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>{Number(project.OpenTickets) || 0}</span>
                              </td>
                            )}
                            <td className="px-3 py-2 text-center text-xs text-gray-500 dark:text-gray-400">
                              {project.StartDate ? new Date(project.StartDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-'}
                              {' → '}
                              <span className={isOverdue ? 'text-red-500 font-medium' : ''}>{project.EndDate ? new Date(project.EndDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-'}</span>
                            </td>
                            {additionalProjectColumnKeys.map((columnKey) => (
                              <td key={`extra-project-cell-${project.Id}-${columnKey}`} className="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                {renderProjectExtraColumnValue(project, columnKey)}
                              </td>
                            ))}
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={e => { e.stopPropagation(); router.push(`/projects/${project.Id}`); }}
                                  title="Open project"
                                  aria-label="Open project"
                                  className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12z" />
                                  </svg>
                                </button>
                                {permissions?.canManageProjects && (
                                  <button
                                    onClick={e => { e.stopPropagation(); handleEditProject(project); }}
                                    title="Edit project"
                                    aria-label="Edit project"
                                    className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
                                    </svg>
                                  </button>
                                )}
                                {permissions?.canDeleteProjects && (
                                  <button
                                    onClick={e => { e.stopPropagation(); handleDeleteProject(project.Id); }}
                                    title="Delete project"
                                    aria-label="Delete project"
                                    className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <ProjectFormModal
          project={editingProject}
          onClose={handleModalClose}
          onSaved={handleProjectSaved}
          token={token!}
          canViewBudgetInfo={canViewBudgetInfo}
        />
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-xl w-full mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Import Projects from CSV</h2>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">📄 CSV Format</h3>
                <code className="text-xs bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded block overflow-x-auto">
                  ProjectName,Description,OrganizationName,CustomerName,StartDate,EndDate,IsHobby,IsGlobal,IsVisibleToCustomer,Budget,BudgetType
                </code>
                <p className="text-sm text-blue-800 dark:text-blue-400 mt-2">
                  <a href={oldPath("/templates/projects_import_template.csv")} download className="underline hover:text-blue-600 dark:hover:text-blue-200">Download template CSV</a>
                </p>
              </div>

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleProjectsCsvFileChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmAlertModal
        isOpen={!!modalMessage}
        type="confirm"
        title={modalMessage?.title || ''}
        message={modalMessage?.message || ''}
        onClose={closeConfirmModal}
        onConfirm={handleModalConfirm}
        confirmLabel="Delete"
        confirmVariant="danger"
      />
      <ScrollToTopButton />
    </div>
    </CustomerUserGuard>
  );
}

// RAG border colours
const RAG_BORDER: Record<RAGStatus, string> = {
  red:   'border-l-4 border-red-500',
  amber: 'border-l-4 border-amber-500',
  green: 'border-l-4 border-green-500',
};

// Project Card Component
function ProjectCard({ 
  project,
  rag,
  internalTicketsEnabled,
  canViewBudgetInfo,
  onEdit, 
  onDelete,
  canEdit,
  canDelete 
}: { 
  project: Project;
  rag: { status: RAGStatus; reasons: string[] };
  internalTicketsEnabled: boolean;
  canViewBudgetInfo: boolean;
  onEdit: (project: Project) => void; 
  onDelete: (id: number) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const decimalHoursToHMS = useFormatHours();
  const { pillStyle } = useColorVision();
  const router = useRouter();

  const totalTasks      = Number(project.TotalTasks) || 0;
  const completedTasks  = Number(project.CompletedTasks) || 0;
  const unplannedTasks  = Number(project.UnplannedTasks) || 0;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const estimatedHours  = Number(project.TotalEstimatedHours) || 0;
  const workedHours     = Number(project.TotalWorkedHours) || 0;
  const budgetTotal     = Number(project.Budget) || 0;
  const budgetSpent     = Number(project.BudgetSpent) || 0;
  const budgetType      = project.BudgetType === 'hours' ? 'hours' : 'monetary';
  const budgetLabel     = budgetType === 'hours' ? 'h' : '$';
  const budgetPct       = budgetTotal > 0 ? Math.min(100, Math.round((budgetSpent / budgetTotal) * 100)) : 0;
  const budgetBarColor  = budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-500' : 'bg-green-500';
  const isOverdue       = project.EndDate && new Date(project.EndDate) < new Date() && !project.StatusIsClosed;
  const ragDot          = rag.status === 'red' ? '🔴' : rag.status === 'amber' ? '🟡' : '🟢';

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer group ${RAG_BORDER[rag.status]}`}
      onClick={() => router.push(`/projects/${project.Id}`)}
    >
      <div className="p-5">
        {/* Title row */}
        <div className="flex justify-between items-start gap-2 mb-1">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {project.ProjectName}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {project.OrganizationName}
              {project.CustomerName && <span className="ml-2 text-blue-500">• {project.CustomerName}</span>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span title={rag.reasons.join(', ') || 'On track'} className="text-lg leading-none">{ragDot}</span>
            {project.StatusName && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={pillStyle(project.StatusColor, { alpha: '20' })}>
                {project.StatusName}
              </span>
            )}
            <div className="flex items-center gap-2">
              {!!project.IsGlobal && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Global Project</span>}
              {!!project.IsHobby && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Hobby</span>}
            </div>
          </div>
        </div>

        {/* RAG reasons hint */}
        {rag.reasons.length > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{rag.reasons.join(' · ')}</p>
        )}

        {/* Task progress */}
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-500 dark:text-gray-400">Progress</span>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-900 dark:text-white">{progressPercent}%</span>
              {unplannedTasks > 0 && (
                <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                  title={`${unplannedTasks} unplanned task${unplannedTasks > 1 ? 's' : ''}`}>
                  {unplannedTasks} unplanned
                </span>
              )}
            </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div className="h-2 rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{completedTasks} / {totalTasks} tasks</p>
        </div>

        {/* Budget bar (only when budget is set) */}
        {canViewBudgetInfo && budgetTotal > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500 dark:text-gray-400">Budget {budgetType === 'hours' ? '(hours)' : '(monetary)'}</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                {budgetType === 'hours'
                  ? `${decimalHoursToHMS(budgetSpent)} / ${decimalHoursToHMS(budgetTotal)}`
                  : `${budgetLabel}${budgetSpent.toFixed(0)} / ${budgetLabel}${budgetTotal.toFixed(0)}`}
                <span className="ml-1 text-gray-400">({budgetPct}%)</span>
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div className={`${budgetBarColor} h-2 rounded-full transition-all duration-300`} style={{ width: `${budgetPct}%` }} />
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className={`grid ${internalTicketsEnabled ? 'grid-cols-3' : 'grid-cols-2'} gap-2 pt-3 border-t border-gray-100 dark:border-gray-700 text-center`}>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Hours</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              {workedHours.toFixed(0) !== '0' || estimatedHours > 0 ? decimalHoursToHMS(workedHours) : '0:00:00'}{estimatedHours > 0 ? ` / ${decimalHoursToHMS(estimatedHours)}` : ''}
            </div>
          </div>
          {internalTicketsEnabled && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Tickets</div>
              <div className={`text-sm font-semibold ${(project.OpenTickets || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                {project.OpenTickets || 0}
              </div>
            </div>
          )}
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">End</div>
            <div className={`text-sm font-semibold ${isOverdue ? 'text-red-500 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
              {project.EndDate
                ? new Date(project.EndDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                : '—'}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-700 mt-3">
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/projects/${project.Id}`); }}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Open
          </button>
          {canEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(project); }}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-lg text-sm transition-colors"
              title="Edit"
            >
              ✏️
            </button>
          )}
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(project.Id); }}
              className="bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 px-3 py-2 rounded-lg text-sm transition-colors"
              title="Delete"
            >
              🗑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

