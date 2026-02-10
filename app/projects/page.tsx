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

type ProjectSortField = 'name' | 'status' | 'tasks' | 'hours' | 'tickets' | 'startDate' | 'endDate';
type SortDirection = 'asc' | 'desc';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [filterText, setFilterText] = useState('');
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
          const aTasks = Number(a.TotalTasks) || 0;
          const bTasks = Number(b.TotalTasks) || 0;
          comparison = aTasks - bTasks;
          break;
        case 'hours':
          const aHours = Number(a.TotalWorkedHours) || 0;
          const bHours = Number(b.TotalWorkedHours) || 0;
          comparison = aHours - bHours;
          break;
        case 'tickets':
          const aTickets = Number(a.OpenTickets) || 0;
          const bTickets = Number(b.OpenTickets) || 0;
          comparison = aTickets - bTickets;
          break;
        case 'startDate':
          const aStart = a.StartDate ? new Date(a.StartDate).getTime() : 0;
          const bStart = b.StartDate ? new Date(b.StartDate).getTime() : 0;
          comparison = aStart - bStart;
          break;
        case 'endDate':
          const aEnd = a.EndDate ? new Date(a.EndDate).getTime() : 0;
          const bEnd = b.EndDate ? new Date(b.EndDate).getTime() : 0;
          comparison = aEnd - bEnd;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [projects, filterText, sortField, sortDirection]);

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

  return (
    <CustomerUserGuard>
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              My Projects
            </h2>
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
          ) : viewMode === 'grid' ? (
            /* Projects Grid */
            <>
              {/* Filter Input */}
              <div className="mb-4">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Filter projects..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="w-full md:w-80 pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  {filterText && (
                    <button
                      onClick={() => setFilterText('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {filterText && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    Showing {filteredAndSortedProjects.length} of {projects.length} projects
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAndSortedProjects.map((project) => (
                  <ProjectCard
                    key={project.Id}
                    project={project}
                    onEdit={handleEditProject}
                    onDelete={handleDeleteProject}
                    canEdit={permissions?.canManageProjects || false}
                    canDelete={permissions?.canDeleteProjects || false}
                  />
                ))}
              </div>
            </>
          ) : (
            /* Projects List */
            <>
              {/* Filter Input */}
              <div className="mb-4">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Filter projects..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="w-full md:w-80 pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  {filterText && (
                    <button
                      onClick={() => setFilterText('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {filterText && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                    Showing {filteredAndSortedProjects.length} of {projects.length} projects
                  </p>
                )}
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        onClick={() => handleSort('name')}
                      >
                        <div className="flex items-center gap-1">
                          Project
                          <SortIcon field="name" />
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        onClick={() => handleSort('status')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Status
                          <SortIcon field="status" />
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        onClick={() => handleSort('tasks')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Tasks
                          <SortIcon field="tasks" />
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        onClick={() => handleSort('hours')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Hours
                          <SortIcon field="hours" />
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        onClick={() => handleSort('tickets')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Open Tickets
                          <SortIcon field="tickets" />
                        </div>
                      </th>
                      <th 
                        className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                        onClick={() => handleSort('endDate')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Dates
                          <SortIcon field="endDate" />
                        </div>
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredAndSortedProjects.map((project) => {
                    const totalTasks = Number(project.TotalTasks) || 0;
                    const completedTasks = Number(project.CompletedTasks) || 0;
                    const unplannedTasks = Number(project.UnplannedTasks) || 0;
                    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                    const estimatedHours = Number(project.TotalEstimatedHours) || 0;
                    const workedHours = Number(project.TotalWorkedHours) || 0;
                    const hoursPercent = estimatedHours > 0 ? Math.min(100, Math.round((workedHours / estimatedHours) * 100)) : 0;
                    const isOverdue = project.EndDate && new Date(project.EndDate) < new Date() && !project.StatusIsClosed;
                    
                    return (
                      <tr 
                        key={project.Id} 
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                        onClick={() => router.push(`/projects/${project.Id}`)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-gray-900 dark:text-white">{project.ProjectName}</div>
                            {!!project.IsHobby && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                Hobby
                              </span>
                            )}
                            {isOverdue && (
                              <span className="text-red-600 dark:text-red-400" title="Overdue">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {project.OrganizationName}
                            {project.CustomerName && (
                              <span className="ml-2 text-blue-600 dark:text-blue-400">• {project.CustomerName}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                            style={project.StatusColor ? {
                              backgroundColor: project.StatusColor + '20',
                              color: project.StatusColor
                            } : undefined}
                          >
                            {project.StatusName || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-sm text-gray-900 dark:text-white">{completedTasks}/{totalTasks}</span>
                            {unplannedTasks > 0 && (
                              <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" title={`${unplannedTasks} unplanned task${unplannedTasks > 1 ? 's' : ''}`}>
                                {unplannedTasks} unplanned
                              </span>
                            )}
                            {totalTasks > 0 && (
                              <div className="w-16 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                                <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${progressPercent}%` }} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <span className={`text-sm ${hoursPercent > 100 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                              {workedHours.toFixed(1)}h / {estimatedHours.toFixed(1)}h
                            </span>
                            {estimatedHours > 0 && (
                              <div className="w-16 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${hoursPercent > 100 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, hoursPercent)}%` }} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center text-sm text-gray-900 dark:text-white">
                          {Number(project.OpenTickets) || 0}
                        </td>
                        <td className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                          {project.StartDate 
                            ? new Date(project.StartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : '-'
                          }
                          {' → '}
                          {project.EndDate 
                            ? new Date(project.EndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : '-'
                          }
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/projects/${project.Id}`); }}
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium"
                            >
                              Manage
                            </button>
                            {permissions?.canManageProjects && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditProject(project); }}
                                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 text-sm font-medium"
                              >
                                Edit
                              </button>
                            )}
                            {permissions?.canDeleteProjects && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.Id); }}
                                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                              >
                                Delete
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

// Project Card Component
function ProjectCard({ 
  project, 
  onEdit, 
  onDelete,
  canEdit,
  canDelete 
}: { 
  project: Project; 
  onEdit: (project: Project) => void; 
  onDelete: (id: number) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  
  const totalTasks = Number(project.TotalTasks) || 0;
  const completedTasks = Number(project.CompletedTasks) || 0;
  const unplannedTasks = Number(project.UnplannedTasks) || 0;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const estimatedHours = Number(project.TotalEstimatedHours) || 0;
  const workedHours = Number(project.TotalWorkedHours) || 0;
  const hoursPercent = estimatedHours > 0 ? Math.min(100, Math.round((workedHours / estimatedHours) * 100)) : 0;

  const isOverdue = project.EndDate && new Date(project.EndDate) < new Date() && !project.StatusIsClosed;

  return (
    <div 
      className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer group"
      onClick={() => router.push(`/projects/${project.Id}`)}
    >
      {/* Header with status bar */}
      <div className="h-1" style={{ backgroundColor: project.StatusColor || '#9ca3af' }} />
      
      <div className="p-5">
        {/* Title and Status */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 min-w-0 pr-3">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {project.ProjectName}
            </h3>
            {project.OrganizationName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {project.OrganizationName}
                {project.CustomerName && (
                  <span className="ml-2 text-blue-600 dark:text-blue-400">• {project.CustomerName}</span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {project.IsHobby && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                Hobby
              </span>
            )}
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
              style={project.StatusColor ? {
                backgroundColor: project.StatusColor + '20',
                color: project.StatusColor
              } : undefined}
            >
              {project.StatusName || 'Unknown'}
            </span>
          </div>
        </div>
        
        {/* Description */}
        {project.Description && (() => {
          const plainText = project.Description.replace(/<[^>]*>/g, '').trim();
          return plainText ? (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
              {plainText}
            </p>
          ) : null;
        })()}

        {/* Progress Section */}
        <div className="space-y-3 mb-4">
          {/* Tasks Progress */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-gray-600 dark:text-gray-400">Tasks</span>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-900 dark:text-white">
                  {completedTasks}/{totalTasks}
                </span>
                {unplannedTasks > 0 && (
                  <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" title={`${unplannedTasks} unplanned task${unplannedTasks > 1 ? 's' : ''}`}>
                    {unplannedTasks} unplanned
                  </span>
                )}
              </div>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div 
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Hours Progress */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-gray-600 dark:text-gray-400">Hours</span>
              <span className={`font-medium ${hoursPercent > 100 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                {workedHours.toFixed(1)}h / {estimatedHours.toFixed(1)}h
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div 
                className={`h-1.5 rounded-full transition-all duration-300 ${hoursPercent > 100 ? 'bg-red-500' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, hoursPercent)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Dates */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-4">
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>
              {project.StartDate 
                ? new Date(project.StartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'No start'
              }
              {' - '}
              {project.EndDate 
                ? new Date(project.EndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'No end'
              }
            </span>
          </div>
          {isOverdue && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Overdue
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/projects/${project.Id}`);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Open
          </button>
          {canEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(project);
              }}
              className="flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-lg transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {canDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project.Id);
              }}
              className="flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 px-3 py-2 rounded-lg transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
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
  const [formData, setFormData] = useState<CreateProjectData>({
    organizationId: project?.OrganizationId || 0,
    projectName: project?.ProjectName || '',
    description: project?.Description || '',
    status: project?.Status ?? null,
    startDate: project?.StartDate ? project.StartDate.split('T')[0] : '',
    endDate: project?.EndDate ? project.EndDate.split('T')[0] : '',
    isHobby: project?.IsHobby || false,
    customerId: project?.CustomerId || undefined,
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
    } else {
      setCustomers([]);
      setProjectStatuses([]);
    }
  }, [formData.organizationId]);

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
