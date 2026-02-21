'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { projectsApi, Project, CreateProjectData } from '@/lib/api/projects';
import { organizationsApi, Organization } from '@/lib/api/organizations';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import Navbar from '@/components/Navbar';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import SearchableSelect from '@/components/SearchableSelect';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';

type ProjectSortField = 'name' | 'status' | 'tasks' | 'hours' | 'tickets' | 'startDate' | 'endDate' | 'budget' | 'rag' | 'progress';
type SortDirection = 'asc' | 'desc';
type RAGStatus = 'red' | 'amber' | 'green';

function computeRAG(project: Project): { status: RAGStatus; reasons: string[] } {
  // Closed or cancelled projects are always green — work is done
  if (project.StatusIsClosed || project.StatusIsCancelled) {
    return { status: 'green', reasons: [] };
  }

  const budgetTotal = Number(project.Budget) || 0;
  const budgetSpent = Number(project.BudgetSpent) || 0;
  const budgetPct = budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 100) : 0;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const endDate = project.EndDate ? new Date(project.EndDate) : null;
  const isOverdue = endDate !== null && endDate < today;

  const reasons: string[] = [];
  let status: RAGStatus = 'green';

  // --- RED conditions ---
  if (budgetPct >= 100) { status = 'red'; reasons.push(`Budget exceeded (${budgetPct}%)`); }
  if (isOverdue) { status = 'red'; reasons.push('Past end date'); }

  const overdueTasks = Number(project.OverdueTasks) || 0;
  const totalTasks = Number(project.TotalTasks) || 0;

  // --- RED conditions (match detail page logic) ---
  if (overdueTasks > 2) { status = 'red'; reasons.push(`${overdueTasks} overdue tasks`); }

  if (status !== 'red') {
    // --- AMBER conditions ---
    if (budgetPct >= 80) { status = 'amber'; reasons.push(`Budget at ${budgetPct}%`); }

    if (overdueTasks > 0) {
      status = 'amber';
      reasons.push(`${overdueTasks} overdue task${overdueTasks > 1 ? 's' : ''}`);
    }

    if (endDate) {
      const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
      if (daysLeft <= 7 && daysLeft > 0) {
        if (status !== 'amber') status = 'amber';
        reasons.push(`Due in ${daysLeft}d`);
      }
    }

    // Unassigned tasks > 30% of total
    const unassigned = Number(project.UnplannedTasks) || 0;
    if (totalTasks > 0 && unassigned > totalTasks * 0.3) {
      if (status !== 'amber') status = 'amber';
      reasons.push(`${unassigned} unassigned tasks`);
    }
  }

  return { status, reasons };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [filterText, setFilterText] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRAG, setFilterRAG] = useState<RAGStatus | ''>('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [sortField, setSortField] = useState<ProjectSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const { user, token, isLoading } = useAuth();
  const { permissions, isLoading: isLoadingPermissions } = usePermissions();
  const router = useRouter();
  const [modalMessage, setModalMessage] = useState<{
    type: 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

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
    if (!isLoading && !user) {
      router.push('/login');
      return;
    }
    if (user && token) {
      loadProjects();
    }
  }, [user, token, isLoading, router]);

  const loadProjects = async () => {
    if (!token) return;
    
    try {
      setIsLoadingProjects(true);
      const response = await projectsApi.getAll(token);
      setProjects(response.projects);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
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
        } catch (err: any) {
          setError(err.message || 'Failed to delete project');
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
  };

  // Filter and sort projects
  const ragMap = useMemo(() => {
    const map = new Map<number, { status: RAGStatus; reasons: string[] }>();
    projects.forEach(p => map.set(p.Id, computeRAG(p)));
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

    // Apply filter
    if (filterText.trim()) {
      const search = filterText.toLowerCase();
      result = result.filter(project =>
        project.ProjectName.toLowerCase().includes(search) ||
        (project.Description && project.Description.toLowerCase().includes(search)) ||
        (project.OrganizationName && project.OrganizationName.toLowerCase().includes(search)) ||
        (project.CustomerName && project.CustomerName.toLowerCase().includes(search)) ||
        (project.StatusName || '').toLowerCase().includes(search)
      );
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
          const bA = a.Budget ? (Number(a.BudgetSpent) || 0) / Number(a.Budget) : 0;
          const bB = b.Budget ? (Number(b.BudgetSpent) || 0) / Number(b.Budget) : 0;
          comparison = bA - bB;
          break;
        }
        case 'tickets':
          comparison = (Number(a.OpenTickets) || 0) - (Number(b.OpenTickets) || 0);
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
  }, [projects, filterText, filterOrg, filterStatus, filterRAG, hideCompleted, sortField, sortDirection, ragMap]);

  const handleSort = (field: ProjectSortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: ProjectSortField }) => {
    if (sortField !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDirection === 'asc' ? (
      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  if (!isLoadingPermissions && !permissions?.canViewProjects) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Navbar />
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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Header */}
          <div className="flex flex-wrap justify-between items-center gap-4 mb-5">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">My Projects</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''} across your organisations</p>
            </div>
            <div className="flex items-center gap-3">
              {/* View Toggle */}
              <div className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-gray-600 shadow' : 'hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                  title="Grid view"
                >
                  <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 shadow' : 'hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                  title="List view"
                >
                  <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              </div>
              {permissions?.canCreateProjects && (
                <button
                  onClick={handleCreateProject}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-medium flex items-center gap-2"
                >
                  <span className="text-xl">+</span>
                  New Project
                </button>
              )}
            </div>
          </div>

          {/* RAG Summary tiles */}
          {projects.length > 0 && (
            <div className="grid grid-cols-4 gap-3 mb-5">
              <button
                onClick={() => setFilterRAG('')}
                className={`rounded-xl px-4 py-3 text-center transition-all border-2 ${filterRAG === '' ? 'border-gray-400 dark:border-gray-500 shadow-md' : 'border-transparent'} bg-white dark:bg-gray-800 shadow-sm hover:shadow-md`}
              >
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{ragSummary.total}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Total</div>
              </button>
              <button
                onClick={() => setFilterRAG(filterRAG === 'red' ? '' : 'red')}
                className={`rounded-xl px-4 py-3 text-center transition-all border-2 ${filterRAG === 'red' ? 'border-red-500 shadow-md' : 'border-transparent'} bg-red-50 dark:bg-red-900/20 shadow-sm hover:shadow-md`}
              >
                <div className="text-2xl font-bold text-red-700 dark:text-red-300">{ragSummary.red}</div>
                <div className="text-xs text-red-500 mt-0.5">🔴 Red</div>
              </button>
              <button
                onClick={() => setFilterRAG(filterRAG === 'amber' ? '' : 'amber')}
                className={`rounded-xl px-4 py-3 text-center transition-all border-2 ${filterRAG === 'amber' ? 'border-amber-500 shadow-md' : 'border-transparent'} bg-amber-50 dark:bg-amber-900/20 shadow-sm hover:shadow-md`}
              >
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{ragSummary.amber}</div>
                <div className="text-xs text-amber-500 mt-0.5">🟡 Amber</div>
              </button>
              <button
                onClick={() => setFilterRAG(filterRAG === 'green' ? '' : 'green')}
                className={`rounded-xl px-4 py-3 text-center transition-all border-2 ${filterRAG === 'green' ? 'border-green-500 shadow-md' : 'border-transparent'} bg-green-50 dark:bg-green-900/20 shadow-sm hover:shadow-md`}
              >
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">{ragSummary.green}</div>
                <div className="text-xs text-green-500 mt-0.5">🟢 Green</div>
              </button>
            </div>
          )}

          {/* Error ProjectsMessage */}
          {error && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
              {error}
            </div>
          )}

          {/* Loading State */}
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-xl text-gray-600 dark:text-gray-400">Loading projects...</div>
            </div>
          ) : projects.length === 0 ? (
            /* Empty State */
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
              <div className="text-6xl mb-4">📋</div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                No projects yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Get started by creating your first project
              </p>
              {permissions?.canCreateProjects && (
                <button
                  onClick={handleCreateProject}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                >
                  Create Project
                </button>
              )}
            </div>
          ) : (
            /* Has projects — show filter bar + view */
            <>
              {/* Unified filter bar */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 mb-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* Search */}
                  <div className="relative lg:col-span-2">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search projects..."
                      value={filterText}
                      onChange={e => setFilterText(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {/* Org */}
                  <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option value="">All Organisations</option>
                    {orgs.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {/* Status */}
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option value="">All Statuses</option>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {/* Sort */}
                  <select value={`${sortField}-${sortDirection}`}
                    onChange={e => {
                      const [f, d] = e.target.value.split('-');
                      setSortField(f as ProjectSortField);
                      setSortDirection(d as SortDirection);
                    }}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    <option value="name-asc">Name A→Z</option>
                    <option value="name-desc">Name Z→A</option>
                    <option value="rag-asc">Health (worst first)</option>
                    <option value="progress-desc">Progress (most first)</option>
                    <option value="progress-asc">Progress (least first)</option>
                    <option value="budget-desc">Budget burn (highest)</option>
                    <option value="hours-desc">Hours worked (most)</option>
                    <option value="tickets-desc">Open tickets (most)</option>
                    <option value="endDate-asc">End date (soonest)</option>
                    <option value="endDate-desc">End date (latest)</option>
                  </select>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={hideCompleted} onChange={e => setHideCompleted(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                    Hide closed / cancelled
                  </label>
                  <span className="text-xs text-gray-400">
                    {filteredAndSortedProjects.length !== projects.length
                      ? `${filteredAndSortedProjects.length} of ${projects.length} projects`
                      : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
                  </span>
                </div>
              </div>

              {filteredAndSortedProjects.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">No projects match the selected filters.</div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredAndSortedProjects.map(project => (
                    <ProjectCard
                      key={project.Id}
                      project={project}
                      rag={ragMap.get(project.Id)!}
                      onEdit={handleEditProject}
                      onDelete={handleDeleteProject}
                      canEdit={permissions?.canManageProjects || false}
                      canDelete={permissions?.canDeleteProjects || false}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none" onClick={() => handleSort('name')}>
                          <div className="flex items-center gap-1">Project <SortIcon field="name" /></div>
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none" onClick={() => handleSort('rag')}>
                          <div className="flex items-center justify-center gap-1">Health <SortIcon field="rag" /></div>
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none" onClick={() => handleSort('status')}>
                          <div className="flex items-center justify-center gap-1">Status <SortIcon field="status" /></div>
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none" onClick={() => handleSort('progress')}>
                          <div className="flex items-center justify-center gap-1">Progress <SortIcon field="progress" /></div>
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none" onClick={() => handleSort('hours')}>
                          <div className="flex items-center justify-center gap-1">Hours <SortIcon field="hours" /></div>
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none" onClick={() => handleSort('budget')}>
                          <div className="flex items-center justify-center gap-1">Budget <SortIcon field="budget" /></div>
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none" onClick={() => handleSort('tickets')}>
                          <div className="flex items-center justify-center gap-1">Tickets <SortIcon field="tickets" /></div>
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none" onClick={() => handleSort('endDate')}>
                          <div className="flex items-center justify-center gap-1">Dates <SortIcon field="endDate" /></div>
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
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
                        const budgetPct = budgetTotal > 0 ? Math.min(100, Math.round((budgetSpent / budgetTotal) * 100)) : 0;
                        const rag = ragMap.get(project.Id) || { status: 'green' as RAGStatus, reasons: [] };
                        const ragDot = rag.status === 'red' ? '🔴' : rag.status === 'amber' ? '🟡' : '🟢';
                        const isOverdue = project.EndDate && new Date(project.EndDate) < new Date() && !project.StatusIsClosed;
                        return (
                          <tr key={project.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => router.push(`/projects/${project.Id}`)}>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="font-medium text-gray-900 dark:text-white">{project.ProjectName}</div>
                                {!!project.IsHobby && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">Hobby</span>}
                                {isOverdue && <span className="text-red-500 text-xs font-semibold">Overdue</span>}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {project.OrganizationName}{project.CustomerName && <span className="ml-2 text-blue-500">• {project.CustomerName}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span title={rag.reasons.join(', ') || 'On track'} className="text-lg leading-none cursor-default">{ragDot}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={project.StatusColor ? { backgroundColor: project.StatusColor + '20', color: project.StatusColor } : undefined}>
                                {project.StatusName || 'Unknown'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col items-center gap-1 min-w-[80px]">
                                <span className="text-xs text-gray-900 dark:text-white font-medium">{completedTasks}/{totalTasks} ({progressPercent}%)</span>
                                {totalTasks > 0 && <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${progressPercent}%` }} /></div>}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col items-center gap-1 min-w-[80px]">
                                <span className={`text-xs font-medium ${hoursPercent > 100 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{workedHours.toFixed(1)}h / {estimatedHours.toFixed(1)}h</span>
                                {estimatedHours > 0 && <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${hoursPercent > 100 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, hoursPercent)}%` }} /></div>}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {budgetTotal > 0 ? (
                                <div className="flex flex-col items-center gap-1 min-w-[80px]">
                                  <span className={`text-xs font-medium ${budgetPct >= 100 ? 'text-red-600 dark:text-red-400' : budgetPct >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>${budgetSpent.toFixed(0)} / ${budgetTotal.toFixed(0)} ({budgetPct}%)</span>
                                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${budgetPct}%` }} /></div>
                                </div>
                              ) : <span className="text-xs text-gray-400 text-center block">—</span>}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`text-sm font-medium ${(Number(project.OpenTickets) || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>{Number(project.OpenTickets) || 0}</span>
                            </td>
                            <td className="px-6 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                              {project.StartDate ? new Date(project.StartDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-'}
                              {' → '}
                              <span className={isOverdue ? 'text-red-500 font-medium' : ''}>{project.EndDate ? new Date(project.EndDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-'}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button onClick={e => { e.stopPropagation(); router.push(`/projects/${project.Id}`); }} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium">Open</button>
                                {permissions?.canManageProjects && <button onClick={e => { e.stopPropagation(); handleEditProject(project); }} className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 text-sm font-medium">Edit</button>}
                                {permissions?.canDeleteProjects && <button onClick={e => { e.stopPropagation(); handleDeleteProject(project.Id); }} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium">Delete</button>}
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
        <ProjectModal
          project={editingProject}
          onClose={handleModalClose}
          onSaved={handleProjectSaved}
          token={token!}
        />
      )}

      {/* Confirm Modal */}
      {modalMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-start mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    {modalMessage.title}
                  </h3>
                  <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                    {modalMessage.message}
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={closeConfirmModal}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleModalConfirm}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
  onEdit, 
  onDelete,
  canEdit,
  canDelete 
}: { 
  project: Project;
  rag: { status: RAGStatus; reasons: string[] };
  onEdit: (project: Project) => void; 
  onDelete: (id: number) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();

  const totalTasks      = Number(project.TotalTasks) || 0;
  const completedTasks  = Number(project.CompletedTasks) || 0;
  const unplannedTasks  = Number(project.UnplannedTasks) || 0;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const estimatedHours  = Number(project.TotalEstimatedHours) || 0;
  const workedHours     = Number(project.TotalWorkedHours) || 0;
  const budgetTotal     = Number(project.Budget) || 0;
  const budgetSpent     = Number(project.BudgetSpent) || 0;
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
                style={project.StatusColor ? { backgroundColor: project.StatusColor + '20', color: project.StatusColor } : undefined}>
                {project.StatusName}
              </span>
            )}
            {!!project.IsHobby && <span className="text-xs text-purple-500 font-medium">Hobby</span>}
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
        {budgetTotal > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-500 dark:text-gray-400">Budget</span>
              <span className="font-semibold text-gray-900 dark:text-white">
                ${budgetSpent.toFixed(0)} / ${budgetTotal.toFixed(0)}
                <span className="ml-1 text-gray-400">({budgetPct}%)</span>
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div className={`${budgetBarColor} h-2 rounded-full transition-all duration-300`} style={{ width: `${budgetPct}%` }} />
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100 dark:border-gray-700 text-center">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Hours</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-white">
              {workedHours.toFixed(0)}h{estimatedHours > 0 ? ` / ${estimatedHours.toFixed(0)}h` : ''}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Tickets</div>
            <div className={`text-sm font-semibold ${(project.OpenTickets || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
              {project.OpenTickets || 0}
            </div>
          </div>
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

// Project Modal Component
function ProjectModal({ 
  project, 
  onClose, 
  onSaved, 
  token 
}: { 
  project: Project | null; 
  onClose: () => void; 
  onSaved: () => void; 
  token: string;
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [customers, setCustomers] = useState<{ Id: number; Name: string }[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<StatusValue[]>([]);
  const [jiraIntegration, setJiraIntegration] = useState<{ JiraUrl: string; JiraProjectKey: string } | null>(null);
  const [githubIntegration, setGithubIntegration] = useState<any>(null);
  const [giteaIntegration, setGiteaIntegration] = useState<any>(null);
  const [availableApplications, setAvailableApplications] = useState<{ Id: number; Name: string }[]>([]);
  const [formData, setFormData] = useState<CreateProjectData>({
    organizationId: project?.OrganizationId || 0,
    projectName: project?.ProjectName || '',
    description: project?.Description || '',
    status: project?.Status ?? null,
    startDate: project?.StartDate ? project.StartDate.split('T')[0] : '',
    endDate: project?.EndDate ? project.EndDate.split('T')[0] : '',
    isHobby: project?.IsHobby || false,
    customerId: project?.CustomerId || undefined,
    jiraBoardId: project?.JiraBoardId || undefined,
    gitHubOwner: project?.GitHubOwner || undefined,
    gitHubRepo: project?.GitHubRepo || undefined,
    giteaOwner: project?.GiteaOwner || undefined,
    giteaRepo: project?.GiteaRepo || undefined,
    budget: project?.Budget ?? undefined,
    applicationIds: project?.ApplicationIds || [],
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  useEffect(() => {
    if (formData.organizationId && formData.organizationId > 0) {
      loadCustomers(formData.organizationId);
      loadProjectStatuses(formData.organizationId);
      loadJiraIntegration(formData.organizationId);
      loadGitHubIntegration(formData.organizationId);
      loadGiteaIntegration(formData.organizationId);
      loadApplicationsList(formData.organizationId);
    } else {
      setCustomers([]);
      setProjectStatuses([]);
      setJiraIntegration(null);
      setGithubIntegration(null);
      setGiteaIntegration(null);
      setAvailableApplications([]);
    }
  }, [formData.organizationId]);

  const loadApplicationsList = async (orgId: number) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/applications?organizationId=${orgId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableApplications(data.applications || []);
      }
    } catch {
      setAvailableApplications([]);
    }
  };

  const loadOrganizations = async () => {
    try {
      const response = await organizationsApi.getAll(token);
      setOrganizations(response.organizations);
      if (!project && response.organizations.length > 0) {
        setFormData(prev => ({ ...prev, organizationId: response.organizations[0].Id }));
      }
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
    }
  };

  const loadCustomers = async (orgId: number) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/customers?organizationId=${orgId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.data || []);
      }
    } catch (err: any) {
      console.error('Failed to load customers:', err);
    }
  };

  const loadProjectStatuses = async (orgId: number) => {
    try {
      const response = await statusValuesApi.getProjectStatuses(orgId, token);
      setProjectStatuses(response.statuses);
    } catch (err: any) {
      console.error('Failed to load project statuses:', err);
    }
  };

  const loadJiraIntegration = async (orgId: number) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/jira-integrations/organization/${orgId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.integration && data.integration.IsEnabled && data.integration.JiraProjectsUrl) {
          setJiraIntegration({
            JiraUrl: data.integration.JiraProjectsUrl,
            JiraProjectKey: '' // Not needed for boards
          });
        } else {
          setJiraIntegration(null);
        }
      }
    } catch (err: any) {
      console.error('Failed to load Jira integration:', err);
      setJiraIntegration(null);
    }
  };

  const loadGitHubIntegration = async (orgId: number) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/github-integrations/organization/${orgId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.integration && data.integration.IsEnabled && data.integration.GitHubUrl) {
          setGithubIntegration(data.integration);
        } else {
          setGithubIntegration(null);
        }
      }
    } catch (err: any) {
      console.error('Failed to load GitHub integration:', err);
      setGithubIntegration(null);
    }
  };

  const loadGiteaIntegration = async (orgId: number) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/gitea-integrations/organization/${orgId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.integration && data.integration.IsEnabled && data.integration.GiteaUrl) {
          setGiteaIntegration(data.integration);
        } else {
          setGiteaIntegration(null);
        }
      }
    } catch (err: any) {
      console.error('Failed to load Gitea integration:', err);
      setGiteaIntegration(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (project) {
        await projectsApi.update(project.Id, formData, token);
      } else {
        await projectsApi.create(formData, token);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save project');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {project ? 'Edit Project' : 'Create New Project'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Organization *
              </label>
              <SearchableSelect
                value={formData.organizationId.toString()}
                onChange={(value) => setFormData({ ...formData, organizationId: parseInt(value) || 0 })}
                options={organizations.map(org => ({ value: org.Id, label: org.Name }))}
                placeholder="Select Organization"
                emptyText="Select organization"
                disabled={!!project}
              />
              {!!project && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Organization cannot be changed after project creation
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Customer
              </label>
              <SearchableSelect
                value={formData.customerId?.toString() || ''}
                onChange={(value) => setFormData({ ...formData, customerId: value ? parseInt(value) : undefined })}
                options={customers.map(customer => ({ value: customer.Id, label: customer.Name }))}
                placeholder="Select Customer"
                emptyText="No customer"
                disabled={!formData.organizationId || formData.organizationId === 0}
              />
              {formData.organizationId > 0 && customers.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  No customers available for this organization
                </p>
              )}
            </div>

            {availableApplications.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Applications
                </label>
                <SearchableMultiSelect
                  values={formData.applicationIds || []}
                  onChange={(values) => setFormData({ ...formData, applicationIds: values as number[] })}
                  options={availableApplications.map(app => ({
                    value: app.Id,
                    label: app.Name
                  }))}
                  placeholder="Select applications..."
                />
              </div>
            )}

            {jiraIntegration && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
                  </svg>
                  <label className="block text-sm font-medium text-blue-700 dark:text-blue-300">
                    Jira Board ID
                  </label>
                </div>
                <input
                  type="text"
                  value={formData.jiraBoardId || ''}
                  onChange={(e) => setFormData({ ...formData, jiraBoardId: e.target.value || undefined })}
                  className="w-full px-4 py-2 border border-blue-300 dark:border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., 123 (from board URL)"
                />
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Associate this project with a Jira board. Find the Board ID in your Jira board URL: /boards/123
                </p>
              </div>
            )}

            {githubIntegration && (
              <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-300 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    GitHub Integration
                  </label>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Repository Owner/Organization
                    </label>
                    <input
                      type="text"
                      value={formData.gitHubOwner || ''}
                      onChange={(e) => setFormData({ ...formData, gitHubOwner: e.target.value || undefined })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="username or organization-name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Repository Name
                    </label>
                    <input
                      type="text"
                      value={formData.gitHubRepo || ''}
                      onChange={(e) => setFormData({ ...formData, gitHubRepo: e.target.value || undefined })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="repository-name"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  Required for GitHub issues import. Find in your repository URL: github.com/<strong>owner</strong>/<strong>repo</strong>
                </p>
              </div>
            )}

            {giteaIntegration && (
              <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-300 dark:border-green-700">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🍵</span>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Gitea Integration
                  </label>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Repository Owner/Organization
                    </label>
                    <input
                      type="text"
                      value={formData.giteaOwner || ''}
                      onChange={(e) => setFormData({ ...formData, giteaOwner: e.target.value || undefined })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="username or organization-name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Repository Name
                    </label>
                    <input
                      type="text"
                      value={formData.giteaRepo || ''}
                      onChange={(e) => setFormData({ ...formData, giteaRepo: e.target.value || undefined })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="repository-name"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  Required for Gitea issues import. Format: <strong>owner/repo</strong>
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Project Name *
              </label>
              <input
                type="text"
                value={formData.projectName}
                onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter project name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter project description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Budget
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.budget ?? ''}
                  onChange={(e) => setFormData({ ...formData, budget: e.target.value !== '' ? parseFloat(e.target.value) : undefined })}
                  className="w-full pl-7 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="0.00"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Optional project budget in currency units</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status
              </label>
              <select
                value={formData.status ?? ''}
                onChange={(e) => setFormData({ ...formData, status: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                disabled={!formData.organizationId || formData.organizationId === 0}
              >
                <option value="">Select Status</option>
                {projectStatuses.map(status => (
                  <option key={status.Id} value={status.Id}>
                    {status.StatusName}
                  </option>
                ))}
              </select>
              {formData.organizationId > 0 && projectStatuses.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  No project statuses available for this organization
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Hobby Project Toggle */}
            <div className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <input
                type="checkbox"
                id="isHobby"
                checked={formData.isHobby || false}
                onChange={(e) => setFormData({ ...formData, isHobby: e.target.checked })}
                className="w-5 h-5 rounded border-purple-300 text-purple-600 focus:ring-purple-500 dark:bg-gray-700 dark:border-purple-600"
              />
              <div>
                <label htmlFor="isHobby" className="block text-sm font-medium text-purple-700 dark:text-purple-300 cursor-pointer">
                  🎨 Hobby Project
                </label>
                <p className="text-xs text-purple-600 dark:text-purple-400">
                  Hobby projects are scheduled outside of regular work hours
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                {isLoading ? 'Saving...' : project ? 'Update Project' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
