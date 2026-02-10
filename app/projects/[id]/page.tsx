'use client';

import { getApiUrl } from '@/lib/api/config';

import React, { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { projectsApi, Project, CreateProjectData } from '@/lib/api/projects';
import { tasksApi, Task, CreateTaskData } from '@/lib/api/tasks';
import { organizationsApi, Organization } from '@/lib/api/organizations';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { usersApi, User } from '@/lib/api/users';
import Navbar from '@/components/Navbar';
import TaskDetailModal from '@/components/TaskDetailModal';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import ChangeHistory from '@/components/ChangeHistory';

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'kanban' | 'gantt' | 'reporting' | 'settings' | 'utilities' | 'attachments' | 'history'>('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [projectAttachments, setProjectAttachments] = useState<any[]>([]);
  const [uploadingProjectFile, setUploadingProjectFile] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importProgress, setImportProgress] = useState<string>('');
  const [importResult, setImportResult] = useState<{created: number; errors: Array<{row: number; error: string}>} | null>(null);
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  const [modalMessage, setModalMessage] = useState<{
    type: 'confirm' | 'alert';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalMessage({ type: 'confirm', title, message, onConfirm });
  };

  const showAlert = (title: string, message: string) => {
    setModalMessage({ type: 'alert', title, message });
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
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user && token) {
      loadProject();
      loadTasks();
      loadTickets();
    }
  }, [user, token, authLoading, projectId, router]);

  const loadProject = async () => {
    if (!token) return;
    
    try {
      setIsLoading(true);
      const response = await projectsApi.getById(parseInt(projectId), token);
      setProject(response.project);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load project');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTasks = async () => {
    if (!token) return;
    
    try {
      const response = await tasksApi.getByProject(parseInt(projectId), token);
      setTasks(response.tasks);
    } catch (err: any) {
      console.error('Failed to load tasks:', err);
    }
  };

  const loadTickets = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/tickets?projectId=${projectId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setTickets(data.tickets || []);
      }
    } catch (err: any) {
      console.error('Failed to load tickets:', err);
    }
  };

  const handleCreateTask = () => {
    setEditingTask(null);
    setShowTaskModal(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setShowTaskModal(true);
  };

  const handleDeleteTask = async (id: number) => {
    if (!token) return;
    
    showConfirm(
      'Delete Task',
      'Are you sure you want to delete this task?',
      async () => {
        try {
          await tasksApi.delete(id, token);
          await loadTasks();
        } catch (err: any) {
          setError(err.message || 'Failed to delete task');
        }
      }
    );
  };

  const handleTaskSaved = () => {
    setShowTaskModal(false);
    setEditingTask(null);
    loadTasks();
  };

  const handleProjectSaved = () => {
    setShowEditModal(false);
    loadProject();
  };

  // CSV Import Functions
  const handleImportClick = () => {
    setShowImportModal(true);
    setImportFile(null);
    setImportPreview([]);
    setImportResult(null);
    setImportProgress('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportPreview([]);
    setImportProgress('Reading file...');

    try {
      const text = await file.text();
      const lines = text.split('\n').map(line => line.trim()).filter(line => line);
      
      if (lines.length < 2) {
        setImportProgress('Error: File is empty or invalid');
        return;
      }

      const headers = lines[0].split(',');
      const rows = lines.slice(1, Math.min(6, lines.length)); // Preview first 5 rows
      
      const preview = rows.map(row => {
        const values = row.split(',');
        const obj: any = {};
        headers.forEach((header, idx) => {
          obj[header.trim()] = values[idx]?.trim() || '';
        });
        return obj;
      });

      setImportPreview(preview);
      setImportProgress(`Ready to import ${lines.length - 1} tasks`);
    } catch (err) {
      setImportProgress('Error reading file');
      console.error(err);
    }
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const obj: any = {};
      headers.forEach((header, idx) => {
        obj[header] = values[idx]?.trim() || '';
      });
      return obj;
    });
  };

  const handleImport = async () => {
    if (!importFile || !token) return;

    setImportProgress('Importing tasks...');

    try {
      const text = await importFile.text();
      const tasks = parseCSV(text);

      // Add ProjectId to each task
      const tasksWithProject = tasks.map(task => ({
        ...task,
        ProjectId: projectId
      }));

      const response = await fetch(
        `${getApiUrl()}/api/task-import/import`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tasks: tasksWithProject })
        }
      );

      const result = await response.json();

      if (response.ok) {
        setImportResult({
          created: result.created || 0,
          errors: result.errors || []
        });
        setImportProgress(`Successfully imported ${result.created} tasks`);
        
        // Reload tasks
        await loadTasks();
      } else {
        setImportProgress(`Error: ${result.message || 'Import failed'}`);
      }
    } catch (err: any) {
      setImportProgress(`Error: ${err.message || 'Import failed'}`);
      console.error(err);
    }
  };

  const loadProjectAttachments = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/project-attachments/project/${projectId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setProjectAttachments(data.data || []);
      }
    } catch (err: any) {
      console.error('Failed to load project attachments:', err);
    }
  };

  const handleProjectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip', 'application/x-zip-compressed',
      'text/plain',
    ];

    if (!allowedTypes.includes(file.type)) {
      setError('File type not allowed. Allowed: images, PDF, Word, Excel, ZIP, TXT');
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit');
      e.target.value = '';
      return;
    }
    
    setUploadingProjectFile(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = event.target?.result as string;
          const base64Data = base64.split(',')[1];

          const response = await fetch(
            `${getApiUrl()}/api/project-attachments/project/${projectId}`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                fileData: base64Data,
              }),
            }
          );

          if (response.ok) {
            loadProjectAttachments();
          } else {
            const error = await response.json();
            setError(error.message || 'Failed to upload file');
          }
        } catch (err) {
          console.error('Failed to upload file:', err);
          setError('Failed to upload file');
        } finally {
          setUploadingProjectFile(false);
          e.target.value = '';
        }
      };

      reader.onerror = () => {
        setError('Failed to read file');
        setUploadingProjectFile(false);
        e.target.value = '';
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to upload file:', err);
      setError('Failed to upload file');
      setUploadingProjectFile(false);
      e.target.value = '';
    }
  };

  const handleDeleteProjectAttachment = async (attachmentId: number) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/project-attachments/${attachmentId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        setProjectAttachments(prev => prev.filter(a => a.Id !== attachmentId));
      }
    } catch (err) {
      console.error('Failed to delete attachment:', err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
    return '📎';
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!user || !project) return null;

  return (
    <CustomerUserGuard>
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white dark:bg-gray-800 shadow-lg min-h-screen">
          <div className="p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Project Menu
            </h2>
            <nav className="space-y-2">
              <button
                onClick={() => setActiveTab('overview')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'overview'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                📊 Overview
              </button>
              <button
                onClick={() => setActiveTab('tasks')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'tasks'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                ✅ Tasks
              </button>
              <button
                onClick={() => setActiveTab('kanban')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'kanban'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                📋 Kanban Board
              </button>
              <button
                onClick={() => setActiveTab('gantt')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'gantt'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                📅 Gantt Chart
              </button>
              <button
                onClick={() => setActiveTab('reporting')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'reporting'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                📊 Reporting
              </button>
              <button
                onClick={() => setActiveTab('utilities')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'utilities'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                🔧 Utilities
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'settings'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                ⚙️ Settings
              </button>
              <button
                onClick={() => {
                  setActiveTab('attachments');
                  loadProjectAttachments();
                }}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'attachments'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                📎 Attachments
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'history'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                📜 History
              </button>
            </nav>

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <a
                href="/projects"
                className="block text-center px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                ← Back to Projects
              </a>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
              {error}
            </div>
          )}

          {activeTab === 'overview' && (
            <OverviewTab project={project} tasks={tasks} tickets={tickets} />
          )}

          {activeTab === 'tasks' && (
            <TasksTab
              tasks={tasks}
              onCreateTask={handleCreateTask}
              onEditTask={handleEditTask}
              onDeleteTask={handleDeleteTask}
              onImportClick={handleImportClick}
              canCreate={permissions?.canCreateTasks || false}
              canManage={permissions?.canManageTasks || false}
              canDelete={permissions?.canDeleteTasks || false}
            />
          )}

          {activeTab === 'kanban' && (
            <KanbanTab
              tasks={tasks}
              project={project}
              onTaskUpdated={loadTasks}
              onCreateTask={handleCreateTask}
              onEditTask={handleEditTask}
              token={token!}
              canCreate={permissions?.canCreateTasks || false}
              canManage={permissions?.canManageTasks || false}
            />
          )}

          {activeTab === 'gantt' && (
            <GanttViewTab tasks={tasks} />
          )}

          {activeTab === 'reporting' && (
            <ReportingTab projectId={parseInt(projectId)} organizationId={project.OrganizationId} token={token!} />
          )}

          {activeTab === 'utilities' && (
            <UtilitiesTab projectId={parseInt(projectId)} token={token!} onTasksUpdated={loadTasks} />
          )}

          {activeTab === 'attachments' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Project Attachments</h2>
              
              {/* Upload Section */}
              <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors">
                  {uploadingProjectFile ? (
                    <>⏳ Uploading...</>
                  ) : (
                    <>📤 Upload File</>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleProjectFileUpload}
                    disabled={uploadingProjectFile}
                  />
                </label>
                <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
                  Max 10MB. Allowed: images, PDF, Word, Excel, ZIP, TXT
                </span>
              </div>

              {/* Attachments List */}
              {projectAttachments.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">No attachments yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projectAttachments.map((attachment: any) => (
                    <div key={attachment.Id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-3xl">{getFileIcon(attachment.FileType)}</span>
                        <button
                          onClick={() => handleDeleteProjectAttachment(attachment.Id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete attachment"
                        >
                          🗑️
                        </button>
                      </div>
                      <div className="font-medium text-gray-900 dark:text-white truncate" title={attachment.FileName}>
                        {attachment.FileName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatFileSize(attachment.FileSize)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {attachment.FirstName && attachment.LastName ? `${attachment.FirstName} ${attachment.LastName}` : attachment.Username}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(attachment.CreatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <SettingsTab project={project} token={token!} onSaved={handleProjectSaved} />
          )}

          {activeTab === 'history' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">📜 Change History</h2>
              <ChangeHistory entityType="project" entityId={parseInt(projectId)} />
            </div>
          )}
        </main>
      </div>

      {/* Edit Project Modal */}
      {showEditModal && project && (
        <EditProjectModal
          project={project}
          onClose={() => setShowEditModal(false)}
          onSaved={handleProjectSaved}
          token={token!}
        />
      )}

      {/* Task Detail Modal */}
      {showTaskModal && (
        <TaskDetailModal
          projectId={parseInt(projectId)}
          organizationId={project.OrganizationId}
          task={editingTask}
          project={project}
          tasks={tasks}
          onClose={() => {
            setShowTaskModal(false);
            setEditingTask(null);
          }}
          onSaved={handleTaskSaved}
          token={token!}
        />
      )}

      {/* Confirm Modal */}
      {modalMessage && modalMessage.type === 'confirm' && (
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

      {/* Alert Modal */}
      {modalMessage && modalMessage.type === 'alert' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-start mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Import Tasks from CSV</h2>
              
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">📄 CSV Format</h3>
                <p className="text-sm text-blue-800 dark:text-blue-400 mb-2">
                  Your CSV should have the following columns (header required):
                </p>
                <code className="text-xs bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded block overflow-x-auto">
                  ProjectId,TaskName,Description,Status,Priority,AssignedToUsername,DueDate,EstimatedHours,ParentTaskName,PlannedStartDate,PlannedEndDate,DependsOnTaskName
                </code>
                <p className="text-sm text-blue-800 dark:text-blue-400 mt-2">
                  <a 
                    href="/templates/tasks_import_template.csv" 
                    download
                    className="underline hover:text-blue-600 dark:hover:text-blue-200"
                  >
                    Download template CSV
                  </a>
                  {' | '}
                  <a 
                    href="/templates/README_TASKS_IMPORT.md" 
                    target="_blank"
                    className="underline hover:text-blue-600 dark:hover:text-blue-200"
                  >
                    Read documentation
                  </a>
                </p>
              </div>

              {/* File Upload */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select CSV File
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Progress Message */}
              {importProgress && (
                <div className={`mb-4 p-3 rounded-lg ${
                  importProgress.startsWith('Error') 
                    ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                    : importProgress.startsWith('Success')
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                    : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                }`}>
                  {importProgress}
                </div>
              )}

              {/* Preview */}
              {importPreview.length > 0 && (
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Preview (first 5 rows)</h3>
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Task Name</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Assigned To</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Status</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Priority</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Estimated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {importPreview.map((row, idx) => (
                          <tr key={idx} className="bg-white dark:bg-gray-800">
                            <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{row.TaskName}</td>
                            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.AssignedToUsername || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.Status || 'To Do'}</td>
                            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.Priority || 'Medium'}</td>
                            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.EstimatedHours || '-'}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Import Result */}
              {importResult && (
                <div className="mb-4">
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg mb-3">
                    <h3 className="font-semibold text-green-900 dark:text-green-300">
                      ✅ Successfully imported {importResult.created} tasks
                    </h3>
                  </div>
                  
                  {importResult.errors.length > 0 && (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <h3 className="font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
                        ⚠️ {importResult.errors.length} errors occurred
                      </h3>
                      <div className="max-h-40 overflow-y-auto">
                        {importResult.errors.map((err, idx) => (
                          <div key={idx} className="text-sm text-yellow-800 dark:text-yellow-400">
                            Row {err.row}: {err.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  {importResult ? 'Close' : 'Cancel'}
                </button>
                {!importResult && importFile && (
                  <button
                    onClick={handleImport}
                    disabled={importProgress.startsWith('Importing')}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                  >
                    {importProgress.startsWith('Importing') ? 'Importing...' : 'Import Tasks'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </CustomerUserGuard>
  );
}

// Overview Tab Component
function OverviewTab({ project, tasks, tickets }: { project: Project; tasks: Task[]; tickets: any[] }) {
  // Calculate task statistics (all tasks including subtasks)
  const parentTasks = tasks.filter(t => !t.ParentTaskId);
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => 
    t.StatusIsClosed === 1
  ).length;
  const inProgressTasks = tasks.filter(t => 
    t.StatusIsClosed !== 1 && t.StatusIsCancelled !== 1 && t.Status !== null && t.StatusName?.toLowerCase() !== 'to do'
  ).length;
  const todoTasks = totalTasks - completedTasks - inProgressTasks;
  
  // Calculate hours (only leaf tasks - tasks without children)
  const taskIdsWithChildren = new Set(tasks.filter(t => t.ParentTaskId).map(t => t.ParentTaskId));
  const leafTasks = tasks.filter(t => !taskIdsWithChildren.has(t.Id));
  const totalEstimatedHours = leafTasks.reduce((sum, t) => sum + (parseFloat(String(t.EstimatedHours || 0))), 0);
  
  // Progress percentage
  const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  // Ticket statistics
  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => t.Status === 'Open').length;
  const resolvedTickets = tickets.filter(t => t.Status === 'Resolved' || t.Status === 'Closed').length;
  const unresolvedTickets = totalTickets - resolvedTickets;
  
  // Priority breakdown (all tasks including subtasks)
  const highPriorityTasks = tasks.filter(t => t.PriorityName?.toLowerCase() === 'high' || t.PriorityName?.toLowerCase() === 'critical').length;
  const mediumPriorityTasks = tasks.filter(t => t.PriorityName?.toLowerCase() === 'medium').length;
  const lowPriorityTasks = tasks.filter(t => t.PriorityName?.toLowerCase() === 'low').length;
  
  // Overdue tasks (all tasks with due date in the past and not completed)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueTasks = tasks.filter(t => {
    if (!t.DueDate) return false;
    if (t.StatusIsClosed === 1 || t.StatusIsCancelled === 1) return false;
    const dueDate = new Date(t.DueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  });
  
  // Upcoming tasks (due in next 7 days)
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const upcomingTasks = tasks.filter(t => {
    if (!t.DueDate) return false;
    if (t.StatusIsClosed === 1 || t.StatusIsCancelled === 1) return false;
    const dueDate = new Date(t.DueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate >= today && dueDate <= nextWeek;
  });
  
  // Unassigned tasks (all tasks)
  const unassignedTasks = tasks.filter(t => !t.AssignedTo);
  
  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {project.ProjectName}
              </h1>
              {project.IsHobby && (
                <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-sm font-medium">
                  🎮 Hobby
                </span>
              )}
            </div>
            {project.OrganizationName && (
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                📁 {project.OrganizationName}
                {project.CustomerName && (
                  <span className="ml-3 text-blue-600 dark:text-blue-400">👤 {project.CustomerName}</span>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="px-4 py-2 rounded-lg font-medium"
              style={project.StatusColor ? {
                backgroundColor: project.StatusColor + '20',
                color: project.StatusColor
              } : undefined}
            >
              {project.StatusName || 'Unknown'}
            </span>
          </div>
        </div>
        
        {project.Description && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {project.Description}
            </p>
          </div>
        )}
      </div>

      {/* Progress Overview */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">📊 Progress</h2>
        
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600 dark:text-gray-400">Overall Completion</span>
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{progressPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
            <div 
              className={`h-4 rounded-full transition-all ${
                progressPercentage === 100 
                  ? 'bg-green-500' 
                  : progressPercentage >= 50 
                  ? 'bg-blue-500' 
                  : 'bg-yellow-500'
              }`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
        
        <div className="grid grid-cols-4 gap-4 text-center">
          <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalTasks}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">{todoTasks}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">To Do</div>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{inProgressTasks}</div>
            <div className="text-xs text-blue-600 dark:text-blue-400">In Progress</div>
          </div>
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{completedTasks}</div>
            <div className="text-xs text-green-600 dark:text-green-400">Completed</div>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Dates */}
        {project.StartDate && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">📅 Start Date</div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">
              {new Date(project.StartDate).toLocaleDateString()}
            </div>
          </div>
        )}
        
        {project.EndDate && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">🏁 End Date</div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">
              {new Date(project.EndDate).toLocaleDateString()}
            </div>
          </div>
        )}
        
        {/* Hours */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">⏱️ Estimated Hours</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {totalEstimatedHours}h
          </div>
        </div>
        
        {/* Tickets */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border-l-4 border-indigo-500">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">🎫 Tickets</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {totalTickets}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {unresolvedTickets} pending
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">👥 Team Members</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white">
            {new Set(tasks.filter(t => t.AssignedTo).map(t => t.AssignedTo)).size}
          </div>
        </div>
      </div>

      {/* Priority & Alerts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Priority Breakdown */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">🎯 Priority Breakdown</h2>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                <span className="text-gray-700 dark:text-gray-300">High Priority</span>
              </div>
              <span className="font-bold text-gray-900 dark:text-white">{highPriorityTasks}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                <span className="text-gray-700 dark:text-gray-300">Medium Priority</span>
              </div>
              <span className="font-bold text-gray-900 dark:text-white">{mediumPriorityTasks}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                <span className="text-gray-700 dark:text-gray-300">Low Priority</span>
              </div>
              <span className="font-bold text-gray-900 dark:text-white">{lowPriorityTasks}</span>
            </div>
          </div>
        </div>

        {/* Alerts & Attention */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">⚠️ Requires Attention</h2>
          
          <div className="space-y-3">
            {overdueTasks.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-red-500">🚨</span>
                  <span className="text-red-700 dark:text-red-400">Overdue Tasks</span>
                </div>
                <span className="font-bold text-red-700 dark:text-red-400">{overdueTasks.length}</span>
              </div>
            )}
            
            {upcomingTasks.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-500">📆</span>
                  <span className="text-yellow-700 dark:text-yellow-400">Due This Week</span>
                </div>
                <span className="font-bold text-yellow-700 dark:text-yellow-400">{upcomingTasks.length}</span>
              </div>
            )}
            
            {unassignedTasks.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">👤</span>
                  <span className="text-gray-700 dark:text-gray-300">Unassigned Tasks</span>
                </div>
                <span className="font-bold text-gray-700 dark:text-gray-300">{unassignedTasks.length}</span>
              </div>
            )}
            
            {overdueTasks.length === 0 && upcomingTasks.length === 0 && unassignedTasks.length === 0 && (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                ✨ All good! No items require immediate attention.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Overdue Tasks List */}
        {overdueTasks.length > 0 && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border-l-4 border-red-500">
            <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">🚨 Overdue Tasks</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {overdueTasks.slice(0, 10).map(task => {
                const daysOverdue = Math.floor((today.getTime() - new Date(task.DueDate!).getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={task.Id} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">{task.TaskName}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-red-600 dark:text-red-400">
                          {daysOverdue} {daysOverdue === 1 ? 'day' : 'days'} overdue
                        </span>
                        {task.AssigneeName && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            👤 {task.AssigneeName}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="px-2 py-1 text-xs rounded font-medium ml-2"
                      style={task.PriorityColor ? {
                        backgroundColor: task.PriorityColor + '20',
                        color: task.PriorityColor
                      } : undefined}
                    >
                      {task.PriorityName || 'No Priority'}
                    </span>
                  </div>
                );
              })}
              {overdueTasks.length > 10 && (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center pt-2">
                  +{overdueTasks.length - 10} more overdue tasks
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upcoming Tasks */}
        {upcomingTasks.length > 0 && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border-l-4 border-yellow-500">
            <h2 className="text-xl font-bold text-yellow-600 dark:text-yellow-400 mb-4">📆 Due This Week</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {upcomingTasks.slice(0, 10).map(task => {
                const dueDate = new Date(task.DueDate!);
                const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={task.Id} className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/20 transition-colors">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">{task.TaskName}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-yellow-600 dark:text-yellow-400">
                          Due in {daysUntil} {daysUntil === 1 ? 'day' : 'days'}
                        </span>
                        {task.AssigneeName && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            👤 {task.AssigneeName}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="px-2 py-1 text-xs rounded font-medium ml-2"
                      style={task.StatusColor ? {
                        backgroundColor: task.StatusColor + '20',
                        color: task.StatusColor
                      } : undefined}
                    >
                      {task.StatusName || 'Unknown'}
                    </span>
                  </div>
                );
              })}
              {upcomingTasks.length > 10 && (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center pt-2">
                  +{upcomingTasks.length - 10} more upcoming tasks
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Team Members */}
      {(() => {
        const assignedTasks = parentTasks.filter(t => t.AssignedTo);
        const teamMembers = Array.from(new Set(assignedTasks.map(t => t.AssignedTo)))
          .map(userId => {
            const memberTasks = assignedTasks.filter(t => t.AssignedTo === userId);
            const firstTask = memberTasks[0];
            const completed = memberTasks.filter(t => 
              t.StatusIsClosed === 1
            ).length;
            const totalHours = memberTasks.reduce((sum, t) => sum + (parseFloat(String(t.EstimatedHours || 0))), 0);
            
            return {
              userId,
              name: firstTask.AssigneeName || 'Unknown',
              taskCount: memberTasks.length,
              completed,
              inProgress: memberTasks.filter(t => 
                t.StatusIsClosed !== 1 && t.StatusIsCancelled !== 1 && t.Status !== null && t.StatusName?.toLowerCase() !== 'to do'
              ).length,
              totalHours: Number(totalHours) || 0
            };
          })
          .sort((a, b) => b.taskCount - a.taskCount);

        return teamMembers.length > 0 && (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">👥 Team Members</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teamMembers.map(member => {
                const completionRate = member.taskCount > 0 
                  ? Math.round((member.completed / member.taskCount) * 100) 
                  : 0;
                
                return (
                  <div key={member.userId} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">{member.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{member.totalHours.toFixed(1)}h assigned</div>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="text-gray-600 dark:text-gray-400">Tasks</span>
                      <span className="font-medium text-gray-900 dark:text-white">{member.completed}/{member.taskCount}</span>
                    </div>
                    
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mb-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                    
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{member.inProgress} in progress</span>
                      <span>{completionRate}% done</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Unassigned Tasks Alert */}
      {unassignedTasks.length > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <h3 className="font-semibold text-orange-800 dark:text-orange-400 mb-1">
                {unassignedTasks.length} Unassigned Tasks
              </h3>
              <p className="text-sm text-orange-700 dark:text-orange-400">
                These tasks need to be assigned to team members: {unassignedTasks.slice(0, 3).map(t => t.TaskName).join(', ')}
                {unassignedTasks.length > 3 && ` and ${unassignedTasks.length - 3} more`}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tasks Tab Component
function TasksTab({
  tasks,
  onCreateTask,
  onEditTask,
  onDeleteTask,
  onImportClick,
  canCreate,
  canManage,
  canDelete,
}: {
  tasks: Task[];
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: number) => void;
  onImportClick: () => void;
  canCreate: boolean;
  canManage: boolean;
  canDelete: boolean;
}) {
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  const toggleExpand = (taskId: number) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const getStatusStyle = (task: Task) => {
    if (task.StatusColor) {
      return {
        backgroundColor: task.StatusColor + '20',
        color: task.StatusColor
      };
    }
    return {};
  };

  const getPriorityStyle = (task: Task) => {
    if (task.PriorityColor) {
      return {
        backgroundColor: task.PriorityColor + '20',
        color: task.PriorityColor
      };
    }
    return {};
  };

  // Separate parent tasks from subtasks
  const parentTasks = tasks.filter(task => !task.ParentTaskId);
  const getSubtasks = (parentId: number) => tasks.filter(task => task.ParentTaskId === parentId);

  // Recursive function to render task and all its descendants
  const renderTaskRow = (task: Task, level: number = 0): React.JSX.Element[] => {
    const subtasks = getSubtasks(task.Id);
    const isExpanded = expandedTasks.has(task.Id);
    const hasSubtasks = subtasks.length > 0;
    const indentPixels = level * 24; // 24px per level

    const rows: React.JSX.Element[] = [];

    // Render current task
    rows.push(
      <tr 
        key={task.Id} 
        className={`${level > 0 ? 'bg-gray-50 dark:bg-gray-700/30' : ''} hover:bg-gray-100 dark:hover:bg-gray-700/50`}
      >
        <td className="px-6 py-4">
          <div className="flex items-center gap-2" style={{ marginLeft: `${indentPixels}px` }}>
            {hasSubtasks ? (
              <button
                onClick={() => toggleExpand(task.Id)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-transform flex-shrink-0"
                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                ▶
              </button>
            ) : (
              <span className="w-4"></span>
            )}
            {level > 0 && <span className="text-gray-400 flex-shrink-0">↳</span>}
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-sm ${level > 0 ? 'text-gray-700 dark:text-gray-300' : 'font-medium text-gray-900 dark:text-white'}`}>
                  {task.TaskName}
                </span>
                {hasSubtasks && (
                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded-full flex-shrink-0">
                    {subtasks.length}
                  </span>
                )}
                {task.EstimatedHours && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                    ⏱️ {task.EstimatedHours}h
                  </span>
                )}
              </div>
              {task.Description && (
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {task.Description.substring(0, level > 0 ? 60 : 100)}
                  {task.Description.length > (level > 0 ? 60 : 100) ? '...' : ''}
                </div>
              )}
              {task.CreatorName && level === 0 && (
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Created by: {task.CreatorName}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          {task.AssigneeName ? (
            <div className="flex items-center gap-1">
              <span>👤</span>
              <span>{task.AssigneeName}</span>
            </div>
          ) : (
            <span className="text-gray-400 dark:text-gray-500 italic">Unassigned</span>
          )}
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" style={getStatusStyle(task)}>
            {task.StatusName || 'Unknown'}
          </span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" style={getPriorityStyle(task)}>
            {task.PriorityName || 'No Priority'}
          </span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          {task.DueDate ? new Date(task.DueDate).toLocaleDateString() : '-'}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          {canManage && (
            <button
              onClick={() => onEditTask(task)}
              className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4"
            >
              Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => onDeleteTask(task.Id)}
              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
            >
              Delete
            </button>
          )}
        </td>
      </tr>
    );

    // Recursively render subtasks if expanded
    if (isExpanded && hasSubtasks) {
      subtasks.forEach(subtask => {
        rows.push(...renderTaskRow(subtask, level + 1));
      });
    }

    return rows;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Tasks</h1>
        <div className="flex gap-3">
          {canCreate && (
            <>
              <button
                onClick={onImportClick}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors font-medium flex items-center gap-2"
              >
                <span className="text-xl">📥</span>
                Import CSV
              </button>
              <button
                onClick={onCreateTask}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-medium flex items-center gap-2"
              >
                <span className="text-xl">+</span>
                New Task
              </button>
            </>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No tasks yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Get started by creating your first task
          </p>
          {canCreate && (
            <button
              onClick={onCreateTask}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
            >
              Create Task
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Task
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Assigned To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {parentTasks.map((task) => renderTaskRow(task))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Utilities Tab Component
function UtilitiesTab({ projectId, token, onTasksUpdated }: { projectId: number; token: string; onTasksUpdated: () => void }) {
  const [results, setResults] = useState<{ action: string; message: string; details: any[] } | null>(null);
  const [isRunning, setIsRunning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; action: () => void } | null>(null);

  const runUtility = async (endpoint: string, actionName: string, needsConfirm = false) => {
    if (needsConfirm && !confirmAction) {
      setConfirmAction({
        title: `Confirm: ${actionName}`,
        message: `Are you sure you want to run "${actionName}"? This action will modify task data and cannot be undone.`,
        action: () => {
          setConfirmAction(null);
          runUtility(endpoint, actionName, false);
        },
      });
      return;
    }

    setIsRunning(actionName);
    setError('');
    setResults(null);

    try {
      const response = await fetch(
        `${getApiUrl()}/api/tasks/utilities/${endpoint}/${projectId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Operation failed');
      }

      setResults({
        action: actionName,
        message: data.message,
        details: data.updates || [],
      });

      onTasksUpdated();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsRunning(null);
    }
  };

  const utilities = [
    {
      id: 'recalculate-hours',
      icon: '🔢',
      name: 'Recalculate Parent Hours',
      description: 'Updates the estimated hours of all parent tasks based on the sum of their children. Processes multi-level hierarchies from bottom to top.',
      endpoint: 'recalculate-hours',
      confirmNeeded: false,
    },
    {
      id: 'reassign-from-planning',
      icon: '👤',
      name: 'Reassign from Planning',
      description: 'Updates the AssignedTo field of tasks to match the user they are planned/allocated to in the Gantt chart.',
      endpoint: 'reassign-from-planning',
      confirmNeeded: false,
    },
    {
      id: 'update-due-dates',
      icon: '📅',
      name: 'Update Due Dates from Planning',
      description: 'Sets the DueDate of each task to its PlannedEndDate, keeping due dates in sync with the planning schedule.',
      endpoint: 'update-due-dates',
      confirmNeeded: false,
    },
    {
      id: 'sync-parent-status',
      icon: '🔄',
      name: 'Sync Parent Status from Children',
      description: 'Updates parent task status based on children: "Done" if all children are done, "In Progress" if any child is in progress, or "To Do" if all are pending.',
      endpoint: 'sync-parent-status',
      confirmNeeded: false,
    },
    {
      id: 'clear-planning',
      icon: '🗑️',
      name: 'Clear All Planning',
      description: 'Removes all task allocations, child allocations, planned dates, and assignments. Use this to start planning from scratch.',
      endpoint: 'clear-planning',
      confirmNeeded: true,
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">🔧 Utilities</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">Bulk operations to keep your project data consistent and up to date.</p>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {utilities.map((util) => (
          <div
            key={util.id}
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl">{util.icon}</span>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{util.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{util.description}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => runUtility(util.endpoint, util.name, util.confirmNeeded)}
                disabled={isRunning !== null}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  util.confirmNeeded
                    ? 'bg-red-600 hover:bg-red-700 text-white disabled:opacity-50'
                    : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'
                }`}
              >
                {isRunning === util.name ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Running...
                  </span>
                ) : (
                  'Run'
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Results Panel */}
      {results && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-green-500 text-xl">✅</span>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{results.action}</h3>
          </div>
          <p className="text-gray-700 dark:text-gray-300 mb-4">{results.message}</p>

          {results.details.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Task</th>
                    {results.details[0]?.oldHours !== undefined && (
                      <>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Old Hours</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">New Hours</th>
                      </>
                    )}
                    {results.details[0]?.oldUser !== undefined && (
                      <>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Previous</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">New Assignment</th>
                      </>
                    )}
                    {results.details[0]?.oldDueDate !== undefined && (
                      <>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Old Due Date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">New Due Date</th>
                      </>
                    )}
                    {results.details[0]?.oldStatus !== undefined && (
                      <>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Old Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">New Status</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {results.details.map((item: any, idx: number) => (
                    <tr key={idx} className="bg-white dark:bg-gray-800">
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{item.taskName}</td>
                      {item.oldHours !== undefined && (
                        <>
                          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{item.oldHours}h</td>
                          <td className="px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400">{item.newHours}h</td>
                        </>
                      )}
                      {item.oldUser !== undefined && (
                        <>
                          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{item.oldUser}</td>
                          <td className="px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400">{item.newUser}</td>
                        </>
                      )}
                      {item.oldDueDate !== undefined && (
                        <>
                          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{item.oldDueDate || 'None'}</td>
                          <td className="px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400">{item.newDueDate}</td>
                        </>
                      )}
                      {item.oldStatus !== undefined && (
                        <>
                          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{item.oldStatus}</td>
                          <td className="px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400">{item.newStatus}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {results.details.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 italic">No changes were needed — everything is already up to date.</p>
          )}
        </div>
      )}

      {/* Confirm Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-start mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">{confirmAction.title}</h3>
                  <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">{confirmAction.message}</div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAction.action}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Gantt View Tab Component (Read-only)
function GanttViewTab({ tasks }: { tasks: Task[] }) {
  type ViewMode = 'Week' | 'Month' | 'Year';
  const [viewMode, setViewMode] = useState<ViewMode>('Month');
  
  // Calculate initial start date (7 days ago)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [days, setDays] = useState<Date[]>([]);
  
  // Generate days based on view mode and startDate
  useEffect(() => {
    const newDays = [];
    let daysToGenerate = 90; // default for Month view
    
    if (viewMode === 'Week') {
      daysToGenerate = 28; // 4 weeks
    } else if (viewMode === 'Year') {
      daysToGenerate = 365; // 1 year
    }
    
    for (let i = 0; i < daysToGenerate; i++) {
      const day = new Date(startDate);
      day.setDate(day.getDate() + i);
      newDays.push(day);
    }
    setDays(newDays);
  }, [startDate, viewMode]);

  const getTaskPosition = (task: Task) => {
    if (!task.PlannedStartDate || !task.PlannedEndDate || days.length === 0) return null;

    const taskStart = new Date(task.PlannedStartDate);
    const taskEnd = new Date(task.PlannedEndDate);

    // Normalize dates
    const normalizeDate = (d: Date) => {
      const normalized = new Date(d);
      normalized.setHours(0, 0, 0, 0);
      return normalized;
    };

    const normalizedStart = normalizeDate(taskStart);
    const normalizedEnd = normalizeDate(taskEnd);
    const firstDay = normalizeDate(days[0]);
    const lastDay = normalizeDate(days[days.length - 1]);

    // Check if task is within visible range
    if (normalizedEnd < firstDay || normalizedStart > lastDay) return null;

    // Find start position
    let startIndex = 0;
    let foundStart = false;
    for (let i = 0; i < days.length; i++) {
      const dayNorm = normalizeDate(days[i]);
      if (dayNorm.getTime() === normalizedStart.getTime()) {
        startIndex = i;
        foundStart = true;
        break;
      } else if (dayNorm.getTime() > normalizedStart.getTime()) {
        // Task starts before this day but after previous day (or before visible range)
        startIndex = Math.max(0, i - 1);
        foundStart = true;
        break;
      }
    }
    // If task starts after the last visible day
    if (!foundStart && normalizedStart > normalizeDate(days[days.length - 1])) {
      return null;
    }

    // Find end position
    let endIndex = days.length - 1;
    for (let i = 0; i < days.length; i++) {
      const dayNorm = normalizeDate(days[i]);
      if (dayNorm.getTime() === normalizedEnd.getTime()) {
        endIndex = i;
        break;
      } else if (dayNorm.getTime() > normalizedEnd.getTime()) {
        endIndex = Math.max(startIndex, i - 1);
        break;
      }
    }

    const visibleDuration = Math.max(1, endIndex - startIndex + 1);

    return {
      left: `${(startIndex / days.length) * 100}%`,
      width: `${(visibleDuration / days.length) * 100}%`,
      startIndex,
      duration: visibleDuration
    };
  };

  const handlePrevious = () => {
    const newStart = new Date(startDate);
    if (viewMode === 'Week') {
      newStart.setDate(newStart.getDate() - 28);
    } else if (viewMode === 'Month') {
      newStart.setDate(newStart.getDate() - 90);
    } else { // Year
      newStart.setDate(newStart.getDate() - 365);
    }
    setStartDate(newStart); 
  };

  const handleNext = () => {
    const newStart = new Date(startDate);
    if (viewMode === 'Week') {
      newStart.setDate(newStart.getDate() + 28);
    } else if (viewMode === 'Month') {
      newStart.setDate(newStart.getDate() + 90);
    } else { // Year
      newStart.setDate(newStart.getDate() + 365);
    }
    setStartDate(newStart); 
  };

  const handleToday = () => {
    const now = new Date();
    now.setDate(now.getDate() - 7);
    setStartDate(now); 
  };

  // Filter tasks: 
  // - Has TaskAllocations: PlannedStartDate and PlannedEndDate set
  // - Has children: Check if children have allocations (leaf tasks)
  const tasksWithPlanning = tasks.filter(t => {
    // If has direct allocations, it's planned
    if (t.PlannedStartDate && t.PlannedEndDate) return true;
    
    // If has children, check if any leaf descendant has allocations
    const hasChildren = tasks.some(child => child.ParentTaskId === t.Id);
    if (hasChildren) {
      // For parent tasks, consider them "planned" if they have child allocations
      // This will be handled by checking if leaf descendants are planned
      const getAllLeafDescendants = (taskId: number): Task[] => {
        const directChildren = tasks.filter(child => child.ParentTaskId === taskId);
        if (directChildren.length === 0) {
          // This is a leaf task
          const task = tasks.find(t => t.Id === taskId);
          return task ? [task] : [];
        }
        // Has children, recurse
        return directChildren.flatMap(child => getAllLeafDescendants(child.Id));
      };
      
      const leafDescendants = getAllLeafDescendants(t.Id);
      // Parent is "planned" if any leaf descendant is planned
      return leafDescendants.some(leaf => leaf.PlannedStartDate && leaf.PlannedEndDate);
    }
    
    return false;
  });
  
  // Filter to only show tasks that are visible in the current date range
  const visibleTasksWithPlanning = tasksWithPlanning.filter(t => {
    const position = getTaskPosition(t);
    return position !== null; // Only include tasks that have a visible position
  });
  
  const tasksWithoutPlanning = tasks.filter(t => {
    // Exclude if already in planned list
    if (tasksWithPlanning.includes(t)) return false;
    
    // Don't show parent tasks in unplanned if they have children
    // (their planning status is determined by their children)
    const hasChildren = tasks.some(child => child.ParentTaskId === t.Id);
    if (hasChildren) return false;
    
    return true;
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gantt Chart</h1>
        <div className="flex gap-4">
          {/* View Mode Selector */}
          <div className="flex gap-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('Week')}
              className={`px-4 py-2 rounded-md transition-colors font-medium ${
                viewMode === 'Week'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode('Month')}
              className={`px-4 py-2 rounded-md transition-colors font-medium ${
                viewMode === 'Month'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('Year')}
              className={`px-4 py-2 rounded-md transition-colors font-medium ${
                viewMode === 'Year'
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              Year
            </button>
          </div>
          
          {/* Navigation */}
          <div className="flex gap-2">
            <button
              onClick={handlePrevious}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              ← Previous
            </button>
            <button
              onClick={handleToday}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {visibleTasksWithPlanning.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <div className="text-6xl mb-4">📅</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No Planned Tasks in This Period
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Tasks need to be planned in the Planning section to appear in the Gantt chart
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
          {/* Timeline Header */}
          <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <div className="flex">
              <div className="w-64 flex-shrink-0 px-4 py-3 font-bold text-gray-700 dark:text-gray-300">
                Task Name
              </div>
              <div className="flex-1 flex min-w-[800px]">
                {viewMode === 'Week' && days.filter((_, i) => i % 7 === 0).map((day, idx) => (
                  <div key={idx} className="flex-1 px-2 py-3 text-center border-l border-gray-200 dark:border-gray-600">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Week {Math.floor((day.getTime() - new Date(day.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
                {viewMode === 'Month' && days.filter((_, i) => i % 7 === 0).map((day, idx) => (
                  <div key={idx} className="flex-1 px-2 py-3 text-center border-l border-gray-200 dark:border-gray-600">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
                {viewMode === 'Year' && days.filter((_, i) => i % 30 === 0).map((day, idx) => (
                  <div key={idx} className="flex-1 px-2 py-3 text-center border-l border-gray-200 dark:border-gray-600">
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {day.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tasks Timeline */}
          <div>
            {visibleTasksWithPlanning.map((task) => {
              const position = getTaskPosition(task);
              
              return (
                <div
                  key={task.Id}
                  className="flex border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="w-64 flex-shrink-0 px-4 py-4">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {task.TaskName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {task.AssigneeName || 'Unassigned'}
                    </div>
                  </div>
                  <div className="flex-1 relative py-4 min-w-[800px]">
                    {position && (
                      <div
                        className="absolute top-2 h-8 bg-blue-500 rounded flex items-center justify-center text-white text-xs font-medium px-2"
                        style={{
                          left: position.left,
                          width: position.width
                        }}
                        title={`${task.TaskName}: ${new Date(task.PlannedStartDate!).toLocaleDateString()} - ${new Date(task.PlannedEndDate!).toLocaleDateString()}`}
                      >
                        {position.duration > 3 && task.EstimatedHours ? `${task.EstimatedHours}h` : ''}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Unplanned Tasks */}
      {tasksWithoutPlanning.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Unplanned Tasks</h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="space-y-2">
              {tasksWithoutPlanning.map((task) => (
                <div
                  key={task.Id}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {task.TaskName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {task.AssigneeName || 'Unassigned'} • {task.EstimatedHours ? `${task.EstimatedHours}h` : 'No estimate'}
                    </div>
                  </div>
                  <span className="px-2 py-1 text-xs font-semibold rounded-full"
                    style={task.StatusColor ? {
                      backgroundColor: task.StatusColor + '20',
                      color: task.StatusColor
                    } : undefined}
                  >
                    {task.StatusName || 'Unknown'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Kanban Board Tab Component
function KanbanTab({
  tasks,
  project,
  onTaskUpdated,
  onCreateTask,
  onEditTask,
  token,
  canCreate,
  canManage,
}: {
  tasks: Task[];
  project: Project;
  onTaskUpdated: () => void;
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  token: string;
  canCreate: boolean;
  canManage: boolean;
}) {
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggedOverTask, setDraggedOverTask] = useState<number | null>(null);

  useEffect(() => {
    loadTaskStatuses();
  }, [project.OrganizationId]);

  const loadTaskStatuses = async () => {
    try {
      const res = await statusValuesApi.getTaskStatuses(project.OrganizationId, token);
      setTaskStatuses(res.statuses);
    } catch (err) {
      console.error('Failed to load task statuses:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    e.dataTransfer.setData('taskId', taskId.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragOverTask = (e: React.DragEvent, taskId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverTask(taskId);
  };

  const handleDragLeave = () => {
    setDraggedOverTask(null);
  };

  const handleDropOnTask = async (e: React.DragEvent, targetTask: Task) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverTask(null);

    const draggedTaskId = parseInt(e.dataTransfer.getData('taskId'));
    const draggedTask = tasks.find(t => t.Id === draggedTaskId);
    
    if (!draggedTask || draggedTask.Id === targetTask.Id) return;
    if (targetTask.Status === null) return;

    // Reorder tasks
    const statusTasks = getTasksByStatus(targetTask.Status);
    const targetIndex = statusTasks.findIndex(t => t.Id === targetTask.Id);

    try {
      // Update dragged task status and order
      await tasksApi.update(draggedTaskId, {
        taskName: draggedTask.TaskName,
        description: draggedTask.Description,
        status: targetTask.Status,
        priority: draggedTask.Priority,
        assignedTo: draggedTask.AssignedTo,
        dueDate: draggedTask.DueDate,
        estimatedHours: draggedTask.EstimatedHours,
        parentTaskId: draggedTask.ParentTaskId,
        displayOrder: targetTask.DisplayOrder,
        plannedStartDate: draggedTask.PlannedStartDate,
        plannedEndDate: draggedTask.PlannedEndDate
      }, token);

      // Update orders for affected tasks
      for (let i = targetIndex; i < statusTasks.length; i++) {
        const task = statusTasks[i];
        if (task.Id !== draggedTaskId) {
          await tasksApi.updateOrder(task.Id, task.DisplayOrder + 1, token);
        }
      }

      onTaskUpdated();
    } catch (err) {
      console.error('Failed to reorder tasks:', err);
    }
  };

  const handleDrop = async (e: React.DragEvent, newStatusId: number) => {
    e.preventDefault();
    setDraggedOverTask(null);

    const taskId = parseInt(e.dataTransfer.getData('taskId'));
    const task = tasks.find(t => t.Id === taskId);
    
    if (!task) return;

    // Get max order in target status
    const statusTasks = getTasksByStatus(newStatusId);
    const maxOrder = statusTasks.length > 0 
      ? Math.max(...statusTasks.map(t => t.DisplayOrder))
      : 0;

    try {
      await tasksApi.update(taskId, {
        taskName: task.TaskName,
        description: task.Description,
        status: newStatusId,
        priority: task.Priority,
        assignedTo: task.AssignedTo,
        dueDate: task.DueDate,
        estimatedHours: task.EstimatedHours,
        parentTaskId: task.ParentTaskId,
        displayOrder: maxOrder + 1,
        plannedStartDate: task.PlannedStartDate,
        plannedEndDate: task.PlannedEndDate
      }, token);
      onTaskUpdated();
    } catch (err) {
      console.error('Failed to update task status:', err);
    }
  };

  const getTasksByStatus = (statusId: number) => {
    return tasks.filter(task => task.Status === statusId).sort((a, b) => a.DisplayOrder - b.DisplayOrder);
  };

  const getPriorityBorder = (task: Task) => {
    if (task.PriorityColor) {
      return { borderLeft: `4px solid ${task.PriorityColor}` };
    }
    return { borderLeft: '4px solid #d1d5db' };
  };

  if (isLoading) {
    return <div className="text-center py-12">Loading Kanban board...</div>;
  }

  const statuses = taskStatuses.length > 0 
    ? taskStatuses.sort((a, b) => a.SortOrder - b.SortOrder)
    : [{ Id: -1, StatusName: 'To Do', SortOrder: 0 }, { Id: -2, StatusName: 'In Progress', SortOrder: 1 }, { Id: -3, StatusName: 'Done', SortOrder: 2 }] as StatusValue[];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Kanban Board</h1>
        {canCreate && (
          <button
            onClick={onCreateTask}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-medium flex items-center gap-2"
          >
            <span className="text-xl">+</span>
            New Task
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {statuses.map((status) => (
          <div
            key={status.Id}
            className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 min-h-[500px]"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, status.Id)}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 dark:text-white"
                style={status.ColorCode ? { color: status.ColorCode } : undefined}
              >
                {status.StatusName}
              </h3>
              <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold px-2 py-1 rounded-full">
                {getTasksByStatus(status.Id).length}
              </span>
            </div>

            <div className="space-y-3">
              {getTasksByStatus(status.Id).map((task) => {
                const subtasks = tasks.filter(t => t.ParentTaskId === task.Id);
                const completedSubtasks = subtasks.filter(t => t.StatusIsClosed === 1).length;
                const parentTask = task.ParentTaskId ? tasks.find(t => t.Id === task.ParentTaskId) : null;
                const isDraggedOver = draggedOverTask === task.Id;
                
                return (
                  <div
                    key={task.Id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.Id)}
                    onDragOver={(e) => handleDragOverTask(e, task.Id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDropOnTask(e, task)}
                    onClick={canManage ? () => onEditTask(task) : undefined}
                    className={`bg-white dark:bg-gray-700 rounded-lg p-3 shadow-sm ${canManage ? 'cursor-pointer hover:shadow-md' : 'cursor-default'} transition-all ${
                      isDraggedOver ? 'border-2 border-blue-500 border-dashed' : ''
                    }`}
                    style={getPriorityBorder(task)}
                  >
                    {/* Parent Task Reference */}
                    {parentTask && (
                      <div className="mb-2 pb-2 border-b border-gray-200 dark:border-gray-600">
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>↳</span>
                          <span className="font-medium">Subtask of:</span>
                          <span className="text-blue-600 dark:text-blue-400 truncate">{parentTask.TaskName}</span>
                        </div>
                      </div>
                    )}

                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-2">
                      {task.TaskName}
                    </h4>
                    
                    {task.Description && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                        {task.Description}
                      </p>
                    )}

                    <div className="flex items-center flex-wrap gap-2 text-xs mb-2">
                      <span className="px-2 py-1 rounded"
                        style={task.PriorityColor ? {
                          backgroundColor: task.PriorityColor + '20',
                          color: task.PriorityColor
                        } : undefined}
                      >
                        {task.PriorityName || 'No Priority'}
                      </span>
                      
                      {task.EstimatedHours && (
                        <span className="text-gray-500 dark:text-gray-400">
                          ⏱️ {task.EstimatedHours}h
                        </span>
                      )}
                      
                      {task.DueDate && (
                        <span className="text-gray-500 dark:text-gray-400">
                          📅 {new Date(task.DueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {/* Show subtask progress only for parent tasks */}
                    {!task.ParentTaskId && subtasks.length > 0 && (
                      <div className="mt-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-green-500 transition-all"
                              style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {completedSubtasks}/{subtasks.length}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          📌 {subtasks.length} subtask{subtasks.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    )}

                    {task.AssigneeName && (
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        👤 {task.AssigneeName}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Reporting Tab Component
function ReportingTab({ projectId, organizationId, token }: { projectId: number; organizationId: number; token: string }) {
  const [reportTab, setReportTab] = useState<'summary' | 'byUser' | 'allocations' | 'timeEntries'>('summary');
  const [allocations, setAllocations] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [userStats, setUserStats] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [taskAllocations, setTaskAllocations] = useState<any[]>([]);
  const [taskTimeEntries, setTaskTimeEntries] = useState<any[]>([]);
  const [taskComments, setTaskComments] = useState<any[]>([]);
  const [taskAttachments, setTaskAttachments] = useState<any[]>([]);
  const [taskHistory, setTaskHistory] = useState<any[]>([]);
  const [taskTags, setTaskTags] = useState<any[]>([]);
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [loadingTaskDetails, setLoadingTaskDetails] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [expandedUsers, setExpandedUsers] = useState<Set<number>>(new Set());
  const [taskDetailTab, setTaskDetailTab] = useState<'info' | 'history'>('info');
  const [alertMessage, setAlertMessage] = useState<{ title: string; message: string } | null>(null);

  const showAlert = (title: string, message: string) => {
    setAlertMessage({ title, message });
  };

  const closeAlert = () => {
    setAlertMessage(null);
  };

  const toggleExpand = (taskId: number) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const toggleUserExpand = (userId: number) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const getSubtasks = (parentId: number) => tasks.filter(t => t.ParentTaskId === parentId);
  const hasSubtasks = (taskId: number) => tasks.some(t => t.ParentTaskId === taskId);
  const parentTasks = tasks.filter(t => !t.ParentTaskId);

  // Calculate recursive total worked hours for a task (sum of all leaf descendants)
  const calculateRecursiveWorked = (taskId: number): number => {
    const subtasks = getSubtasks(taskId);
    
    if (subtasks.length === 0) {
      // Leaf task - return its own worked hours
      const task = tasks.find(t => t.Id === taskId);
      return parseFloat(task?.TotalWorked || 0);
    }
    
    // Parent task - sum all children recursively
    return subtasks.reduce((sum, subtask) => sum + calculateRecursiveWorked(subtask.Id), 0);
  };

  // Recursive function to render task and all its descendants in reporting
  const renderReportTaskRow = (task: any, level: number = 0): React.JSX.Element[] => {
    const allocated = parseFloat(task.TotalAllocated || 0);
    const worked = calculateRecursiveWorked(task.Id);
    const toAllocate = parseFloat(task.EstimatedHours || 0) - allocated;
    const subtasks = getSubtasks(task.Id);
    const taskHasSubtasks = subtasks.length > 0;
    const isExpanded = expandedTasks.has(task.Id);
    const indentPixels = level * 24;

    const rows: React.JSX.Element[] = [];

    // Render current task
    rows.push(
      <tr key={task.Id} className={`${level > 0 ? 'bg-gray-50 dark:bg-gray-700/50' : ''} hover:bg-gray-100 dark:hover:bg-gray-700`}>
        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
          <div className="flex items-center gap-2" style={{ marginLeft: `${indentPixels}px` }}>
            {taskHasSubtasks ? (
              <button
                onClick={() => toggleExpand(task.Id)}
                className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex-shrink-0"
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            ) : (
              <span className="w-5 flex-shrink-0" />
            )}
            {level > 0 && <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">└</span>}
            <span className={level === 0 ? 'font-medium' : ''}>{task.TaskName}</span>
            {taskHasSubtasks && (
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                ({subtasks.length})
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <span className="px-2 py-1 text-xs font-semibold rounded-full"
            style={task.StatusColor ? {
              backgroundColor: task.StatusColor + '20',
              color: task.StatusColor
            } : undefined}
          >
            {task.StatusName || 'Unknown'}
          </span>
        </td>
        <td className={`px-4 py-3 text-sm text-right ${level === 0 ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
          {parseFloat(task.EstimatedHours || 0).toFixed(2)}h
        </td>
        <td className={`px-4 py-3 text-sm text-right ${level === 0 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-blue-500 dark:text-blue-400'}`}>
          {allocated.toFixed(2)}h
        </td>
        <td className={`px-4 py-3 text-sm text-right ${level === 0 ? 'text-orange-600 dark:text-orange-400 font-medium' : 'text-orange-500 dark:text-orange-400'}`}>
          {toAllocate.toFixed(2)}h
        </td>
        <td className={`px-4 py-3 text-sm text-right ${level === 0 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-green-500 dark:text-green-400'}`}>
          {worked.toFixed(2)}h
        </td>
        <td className="px-4 py-3 text-center">
          <button
            onClick={() => handleShowTaskDetail(task)}
            className={`${level === 0 ? 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-sm' : 'text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-xs'}`}
          >
            Details
          </button>
        </td>
      </tr>
    );

    // Recursively render subtasks if expanded
    if (isExpanded && taskHasSubtasks) {
      subtasks.forEach(subtask => {
        rows.push(...renderReportTaskRow(subtask, level + 1));
      });
    }

    return rows;
  };

  useEffect(() => {
    if (reportTab === 'summary') {
      loadTasksSummary();
    } else if (reportTab === 'byUser') {
      loadUserStats();
    } else if (reportTab === 'allocations') {
      loadAllocations();
    } else {
      loadTimeEntries();
    }
  }, [reportTab, projectId]);

  const loadAllocations = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(
        `${getApiUrl()}/api/task-allocations/project/${projectId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load allocations');
      }

      const data = await response.json();
      setAllocations(data.allocations || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load allocations');
      setAllocations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTimeEntries = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(
        `${getApiUrl()}/api/time-entries/project/${projectId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load time entries');
      }

      const data = await response.json();
      setTimeEntries(data.entries || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load time entries');
      setTimeEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserStats = async () => {
    setIsLoading(true);
    setError('');
    try {
      // Load allocations
      const allocResponse = await fetch(
        `${getApiUrl()}/api/task-allocations/project/${projectId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const allocData = allocResponse.ok ? await allocResponse.json() : { allocations: [] };

      // Load time entries
      const entriesResponse = await fetch(
        `${getApiUrl()}/api/time-entries/project/${projectId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const entriesData = entriesResponse.ok ? await entriesResponse.json() : { entries: [] };

      // Load tasks
      const tasksResponse = await fetch(
        `${getApiUrl()}/api/tasks/project/${projectId}/summary`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const tasksData = tasksResponse.ok ? await tasksResponse.json() : { tasks: [] };

      // Group by user
      const userMap = new Map<number, any>();
      
      // Process allocations
      (allocData.allocations || []).forEach((a: any) => {
        if (!a.UserId) return;
        if (!userMap.has(a.UserId)) {
          userMap.set(a.UserId, {
            UserId: a.UserId,
            Username: a.Username || 'Unknown',
            TotalAllocated: 0,
            TotalWorked: 0,
            TasksAssigned: new Set(),
            TasksWorked: new Set(),
            Allocations: [],
            TimeEntries: []
          });
        }
        const user = userMap.get(a.UserId);
        user.TotalAllocated += parseFloat(a.AllocatedHours || 0);
        user.TasksAssigned.add(a.TaskId);
        user.Allocations.push(a);
      });

      // Process time entries
      (entriesData.entries || []).forEach((e: any) => {
        if (!e.UserId) return;
        if (!userMap.has(e.UserId)) {
          userMap.set(e.UserId, {
            UserId: e.UserId,
            Username: e.Username || 'Unknown',
            TotalAllocated: 0,
            TotalWorked: 0,
            TasksAssigned: new Set(),
            TasksWorked: new Set(),
            Allocations: [],
            TimeEntries: []
          });
        }
        const user = userMap.get(e.UserId);
        user.TotalWorked += parseFloat(e.Hours || 0);
        user.TasksWorked.add(e.TaskId);
        user.TimeEntries.push(e);
      });

      // Convert to array and add task names
      const taskMap = new Map<number, any>((tasksData.tasks || []).map((t: any) => [t.Id, t]));
      const stats = Array.from(userMap.values()).map(user => ({
        ...user,
        TasksAssigned: user.TasksAssigned.size,
        TasksWorked: user.TasksWorked.size,
        Allocations: user.Allocations.map((a: any) => ({
          ...a,
          TaskName: taskMap.get(a.TaskId)?.TaskName || 'Unknown Task'
        })),
        TimeEntries: user.TimeEntries.map((e: any) => ({
          ...e,
          TaskName: taskMap.get(e.TaskId)?.TaskName || 'Unknown Task'
        }))
      }));

      // Sort by total worked hours descending
      stats.sort((a, b) => b.TotalWorked - a.TotalWorked);
      setUserStats(stats);
    } catch (err: any) {
      setError(err.message || 'Failed to load user stats');
      setUserStats([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTasksSummary = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(
        `${getApiUrl()}/api/tasks/project/${projectId}/summary`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load tasks summary');
      }

      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load tasks summary');
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowTaskDetail = async (task: any) => {
    setSelectedTask(task);
    setLoadingTaskDetails(true);
    
    try {
      // Fetch task allocations
      const allocationsResponse = await fetch(
        `${getApiUrl()}/api/task-allocations/task/${task.Id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (allocationsResponse.ok) {
        const data = await allocationsResponse.json();
        setTaskAllocations(data.allocations || []);
      } else {
        setTaskAllocations([]);
      }

      // Fetch time entries
      const timeEntriesResponse = await fetch(
        `${getApiUrl()}/api/time-entries/task/${task.Id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (timeEntriesResponse.ok) {
        const data = await timeEntriesResponse.json();
        setTaskTimeEntries(data.entries || []);
      } else {
        setTaskTimeEntries([]);
      }

      // Fetch comments
      const commentsResponse = await fetch(
        `${getApiUrl()}/api/task-comments/task/${task.Id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (commentsResponse.ok) {
        const data = await commentsResponse.json();
        setTaskComments(data.comments || []);
      } else {
        setTaskComments([]);
      }

      // Fetch attachments
      const attachmentsResponse = await fetch(
        `${getApiUrl()}/api/task-attachments/task/${task.Id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (attachmentsResponse.ok) {
        const data = await attachmentsResponse.json();
        setTaskAttachments(data.data || []);
      } else {
        setTaskAttachments([]);
      }

      // Fetch history
      const historyResponse = await fetch(
        `${getApiUrl()}/api/task-history/task/${task.Id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (historyResponse.ok) {
        const data = await historyResponse.json();
        setTaskHistory(data.history || []);
      } else {
        setTaskHistory([]);
      }

      // Fetch task tags
      const tagsResponse = await fetch(
        `${getApiUrl()}/api/tags/task/${task.Id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (tagsResponse.ok) {
        const data = await tagsResponse.json();
        setTaskTags(data.tags || []);
      } else {
        setTaskTags([]);
      }
    } catch (err) {
      console.error('Failed to load task details:', err);
      setTaskAllocations([]);
      setTaskTimeEntries([]);
      setTaskComments([]);
      setTaskAttachments([]);
      setTaskHistory([]);
      setTaskTags([]);
    } finally {
      setLoadingTaskDetails(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !selectedTask) return;
    
    setSubmittingComment(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/task-comments`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            taskId: selectedTask.Id,
            comment: newComment.trim()
          })
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setTaskComments(prev => [data.comment, ...prev]);
        setNewComment('');
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/task-comments/${commentId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        setTaskComments(prev => prev.filter(c => c.Id !== commentId));
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/task-attachments/${attachmentId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        setTaskAttachments(prev => prev.filter(a => a.Id !== attachmentId));
      }
    } catch (err) {
      console.error('Failed to delete attachment:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTask) return;

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip', 'application/x-zip-compressed',
      'text/plain',
    ];

    if (!allowedTypes.includes(file.type)) {
      showAlert('Invalid File Type', 'File type not allowed. Allowed: images, PDF, Word, Excel, ZIP, TXT');
      e.target.value = '';
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      showAlert('File Too Large', 'File size exceeds 10MB limit');
      e.target.value = '';
      return;
    }
    
    setUploadingFile(true);
    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const base64 = event.target?.result as string;
          const base64Data = base64.split(',')[1];

          const response = await fetch(
            `${getApiUrl()}/api/task-attachments/task/${selectedTask.Id}`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                fileData: base64Data,
              }),
            }
          );

          if (response.ok) {
            // Reload attachments
            const attachmentsResponse = await fetch(
              `${getApiUrl()}/api/task-attachments/task/${selectedTask.Id}`,
              {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            
            if (attachmentsResponse.ok) {
              const data = await attachmentsResponse.json();
              setTaskAttachments(data.data || []);
            }
          } else {
            const error = await response.json();
            showAlert('Upload Error', error.message || 'Failed to upload file');
          }
        } catch (err) {
          console.error('Failed to upload file:', err);
          showAlert('Upload Error', 'Failed to upload file');
        } finally {
          setUploadingFile(false);
          e.target.value = '';
        }
      };

      reader.onerror = () => {
        showAlert('File Error', 'Failed to read file');
        setUploadingFile(false);
        e.target.value = '';
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to upload file:', err);
      showAlert('Upload Error', 'Failed to upload file');
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const loadAvailableTags = async (organizationId: number) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/tags/organization/${organizationId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setAvailableTags(data.tags || []);
      }
    } catch (err) {
      console.error('Failed to load available tags:', err);
    }
  };

  const handleAddTag = async (tagId: number) => {
    if (!selectedTask) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/tags/task/${selectedTask.Id}/tag/${tagId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const tag = availableTags.find(t => t.Id === tagId);
        if (tag && !taskTags.find(t => t.Id === tagId)) {
          setTaskTags(prev => [...prev, tag]);
        }
        setShowTagSelector(false);
      }
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    if (!selectedTask) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/tags/task/${selectedTask.Id}/tag/${tagId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        setTaskTags(prev => prev.filter(t => t.Id !== tagId));
      }
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
    return '📎';
  };

  // Calculate hours (only leaf tasks - tasks without children) to avoid double counting
  // Leaf tasks are the actual work items
  const taskIdsWithChildren = new Set(tasks.filter(t => t.ParentTaskId).map(t => t.ParentTaskId));
  const leafTasks = tasks.filter(t => !taskIdsWithChildren.has(t.Id));

  const totalAllocatedHours = allocations.reduce((sum, a) => sum + parseFloat(a.AllocatedHours || 0), 0);
  const totalWorkedHours = timeEntries.reduce((sum, e) => sum + parseFloat(e.Hours || 0), 0);
  const totalEstimatedHours = leafTasks.reduce((sum, t) => sum + parseFloat(t.EstimatedHours || 0), 0);
  const totalTaskAllocatedHours = parentTasks.reduce((sum, t) => sum + parseFloat(t.TotalAllocated || 0), 0);
  const totalTaskWorkedHours = leafTasks.reduce((sum, t) => sum + parseFloat(t.TotalWorked || 0), 0);
  // To allocate = Estimated - Allocated
  const totalToAllocateHours = totalEstimatedHours - totalTaskAllocatedHours;

  // Export functions
  const exportToCSV = (data: any[], filename: string, headers: string[]) => {
    const csvRows = [];
    
    // Add headers
    csvRows.push(headers.join(','));
    
    // Add data rows
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header] ?? '';
        // Escape quotes and wrap in quotes if contains comma
        const stringValue = String(value).replace(/"/g, '""');
        return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') 
          ? `"${stringValue}"` 
          : stringValue;
      });
      csvRows.push(values.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleExportSummary = () => {
    const data = tasks.map(t => ({
      TaskName: t.TaskName,
      Status: t.Status || '',
      Priority: t.Priority || '',
      AssignedTo: t.AssigneeName || 'Unassigned',
      EstimatedHours: parseFloat(t.EstimatedHours || 0).toFixed(2),
      AllocatedHours: parseFloat(t.TotalAllocated || 0).toFixed(2),
      WorkedHours: parseFloat(t.TotalWorked || 0).toFixed(2),
      Progress: `${Math.round((parseFloat(t.TotalWorked || 0) / parseFloat(t.EstimatedHours || 1)) * 100)}%`
    }));
    exportToCSV(data, 'project_summary', ['TaskName', 'Status', 'Priority', 'AssignedTo', 'EstimatedHours', 'AllocatedHours', 'WorkedHours', 'Progress']);
  };

  const handleExportAllocations = () => {
    const data = allocations.map(a => ({
      Date: new Date(a.AllocationDate).toLocaleDateString(),
      Task: a.TaskName || '',
      User: a.Username || '',
      AllocatedHours: parseFloat(a.AllocatedHours || 0).toFixed(2),
      StartTime: a.StartTime || '',
      EndTime: a.EndTime || ''
    }));
    exportToCSV(data, 'project_allocations', ['Date', 'Task', 'User', 'AllocatedHours', 'StartTime', 'EndTime']);
  };

  const handleExportTimeEntries = () => {
    const data = timeEntries.map(e => ({
      Date: new Date(e.WorkDate).toLocaleDateString(),
      Task: e.TaskName || '',
      User: e.Username || '',
      Hours: parseFloat(e.Hours || 0).toFixed(2),
      StartTime: e.StartTime || '',
      EndTime: e.EndTime || '',
      Description: e.Description || ''
    }));
    exportToCSV(data, 'project_time_entries', ['Date', 'Task', 'User', 'Hours', 'StartTime', 'EndTime', 'Description']);
  };

  const handleExportByUser = () => {
    const data = userStats.map(u => ({
      User: `${u.FirstName || ''} ${u.LastName || ''}`.trim() || u.Username,
      TotalAllocated: parseFloat(u.TotalAllocated || 0).toFixed(2),
      TotalWorked: parseFloat(u.TotalWorked || 0).toFixed(2),
      TasksCount: u.Tasks?.length || 0
    }));
    exportToCSV(data, 'project_by_user', ['User', 'TotalAllocated', 'TotalWorked', 'TasksCount']);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Reporting</h1>
        <button
          onClick={() => {
            if (reportTab === 'summary') handleExportSummary();
            else if (reportTab === 'allocations') handleExportAllocations();
            else if (reportTab === 'timeEntries') handleExportTimeEntries();
            else if (reportTab === 'byUser') handleExportByUser();
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          📥 Export CSV
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-4">
          <button
            onClick={() => setReportTab('summary')}
            className={`pb-3 px-4 font-medium transition-colors border-b-2 ${
              reportTab === 'summary'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setReportTab('byUser')}
            className={`pb-3 px-4 font-medium transition-colors border-b-2 ${
              reportTab === 'byUser'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            By User
          </button>
          <button
            onClick={() => setReportTab('allocations')}
            className={`pb-3 px-4 font-medium transition-colors border-b-2 ${
              reportTab === 'allocations'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Allocated Hours
          </button>
          <button
            onClick={() => setReportTab('timeEntries')}
            className={`pb-3 px-4 font-medium transition-colors border-b-2 ${
              reportTab === 'timeEntries'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Time Entries
          </button>
        </div>
      </div>

      {/* Summary Tab */}
      {reportTab === 'summary' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Total Estimated Hours</div>
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {totalEstimatedHours.toFixed(2)}h
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Total Allocated Hours</div>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {totalTaskAllocatedHours.toFixed(2)}h
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">To Allocate</div>
              <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                {totalToAllocateHours.toFixed(2)}h
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Total Worked Hours</div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                {totalTaskWorkedHours.toFixed(2)}h
              </div>
            </div>
          </div>

          {/* Tasks Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Tasks Summary</h2>

              {isLoading ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading tasks...</div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">No tasks found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Task Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Estimated
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Allocated
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          To Allocate
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Worked
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {parentTasks.map((task: any) => renderReportTaskRow(task, 0))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100 text-right">
                          Total:
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-right text-gray-900 dark:text-gray-100">
                          {totalEstimatedHours.toFixed(2)}h
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-right text-blue-600 dark:text-blue-400">
                          {totalTaskAllocatedHours.toFixed(2)}h
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-right text-orange-600 dark:text-orange-400">
                          {totalToAllocateHours.toFixed(2)}h
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-right text-green-600 dark:text-green-400">
                          {totalTaskWorkedHours.toFixed(2)}h
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* By User Tab */}
      {reportTab === 'byUser' && (
        <div className="space-y-6">
          {/* User Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
                Loading user statistics...
              </div>
            ) : userStats.length === 0 ? (
              <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
                No user data available for this project.
              </div>
            ) : (
              userStats.map((user) => {
                const efficiency = user.TotalAllocated > 0 
                  ? Math.round((user.TotalWorked / user.TotalAllocated) * 100) 
                  : 0;
                
                return (
                  <div key={user.UserId} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                    {/* User Header */}
                    <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                            {user.Username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">{user.Username}</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {user.TasksWorked} task{user.TasksWorked !== 1 ? 's' : ''} worked
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleUserExpand(user.UserId)}
                          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                          <svg className={`w-5 h-5 transition-transform ${expandedUsers.has(user.UserId) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Stats */}
                    <div className="p-4">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                            {user.TotalAllocated.toFixed(1)}h
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Allocated</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {user.TotalWorked.toFixed(1)}h
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Worked</div>
                        </div>
                      </div>
                      
                      {/* Progress bar */}
                      {user.TotalAllocated > 0 && (
                        <div>
                          <div className="flex justify-between items-center text-xs mb-1">
                            <span className="text-gray-500 dark:text-gray-400">Progress</span>
                            <span className={`font-medium ${efficiency > 100 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                              {efficiency}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all ${
                                efficiency > 100 ? 'bg-red-500' : efficiency > 80 ? 'bg-green-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${Math.min(100, efficiency)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Expanded Details */}
                    {expandedUsers.has(user.UserId) && (
                      <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/50">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Recent Time Entries</h4>
                        {user.TimeEntries.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">No time entries recorded.</p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {user.TimeEntries.slice(0, 10).map((entry: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center text-sm">
                                <div className="flex-1 min-w-0">
                                  <div className="truncate text-gray-900 dark:text-white">{entry.TaskName}</div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {new Date(entry.WorkDate).toLocaleDateString()}
                                  </div>
                                </div>
                                <div className="font-medium text-green-600 dark:text-green-400 ml-2">
                                  {parseFloat(entry.Hours).toFixed(1)}h
                                </div>
                              </div>
                            ))}
                            {user.TimeEntries.length > 10 && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2">
                                +{user.TimeEntries.length - 10} more entries
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Summary Table */}
          {!isLoading && userStats.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">User Summary</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Allocated</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Worked</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Difference</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Efficiency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {userStats.map((user) => {
                      const diff = user.TotalWorked - user.TotalAllocated;
                      const efficiency = user.TotalAllocated > 0 
                        ? Math.round((user.TotalWorked / user.TotalAllocated) * 100) 
                        : 0;
                      
                      return (
                        <tr key={user.UserId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                            {user.Username}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-blue-600 dark:text-blue-400">
                            {user.TotalAllocated.toFixed(2)}h
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400">
                            {user.TotalWorked.toFixed(2)}h
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-medium ${
                            diff > 0 ? 'text-red-600 dark:text-red-400' : diff < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'
                          }`}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(2)}h
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-medium ${
                            efficiency > 100 ? 'text-red-600 dark:text-red-400' : efficiency > 80 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'
                          }`}>
                            {efficiency}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white">Total</td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-blue-600 dark:text-blue-400">
                        {userStats.reduce((sum, u) => sum + u.TotalAllocated, 0).toFixed(2)}h
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-green-600 dark:text-green-400">
                        {userStats.reduce((sum, u) => sum + u.TotalWorked, 0).toFixed(2)}h
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-gray-600 dark:text-gray-400">
                        {(userStats.reduce((sum, u) => sum + u.TotalWorked, 0) - userStats.reduce((sum, u) => sum + u.TotalAllocated, 0)).toFixed(2)}h
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-gray-600 dark:text-gray-400">
                        {userStats.reduce((sum, u) => sum + u.TotalAllocated, 0) > 0 
                          ? Math.round((userStats.reduce((sum, u) => sum + u.TotalWorked, 0) / userStats.reduce((sum, u) => sum + u.TotalAllocated, 0)) * 100)
                          : 0}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Allocations Tab */}
      {reportTab === 'allocations' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Planned Allocations</h2>
              <div className="text-right">
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Allocated</div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {totalAllocatedHours.toFixed(2)}h
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading allocations...</div>
            ) : allocations.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">No allocations found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Task
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Time
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Hours
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {allocations.map((allocation: any, idx: number) => {
                      const date = new Date(allocation.AllocationDate);
                      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      
                      return (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {allocation.TaskName}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {allocation.Username || 'Unknown'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {dayName}, {dateStr}
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                            {allocation.StartTime || '-'} - {allocation.EndTime || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 font-medium">
                            {parseFloat(allocation.AllocatedHours).toFixed(2)}h
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100 text-right">
                        Total:
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-right text-gray-900 dark:text-gray-100">
                        {totalAllocatedHours.toFixed(2)}h
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Time Entries Tab */}
      {reportTab === 'timeEntries' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Recorded Time Entries</h2>
              <div className="text-right">
                <div className="text-sm text-gray-500 dark:text-gray-400">Total Worked</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {totalWorkedHours.toFixed(2)}h
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading time entries...</div>
            ) : timeEntries.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">No time entries found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Task
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Hours
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {timeEntries.map((entry: any, idx: number) => {
                      const date = new Date(entry.WorkDate);
                      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      
                      return (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {entry.TaskName}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {entry.Username || 'Unknown'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {dayName}, {dateStr}
                          </td>
                          <td className="px-4 py-3 text-sm text-center text-gray-700 dark:text-gray-300">
                            {entry.StartTime || '-'} - {entry.EndTime || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                            {entry.Description || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 font-medium">
                            {parseFloat(entry.Hours).toFixed(2)}h
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100 text-right">
                        Total:
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-right text-gray-900 dark:text-gray-100">
                        {totalWorkedHours.toFixed(2)}h
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedTask.TaskName}</h2>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full"
                      style={selectedTask.StatusColor ? {
                        backgroundColor: selectedTask.StatusColor + '20',
                        color: selectedTask.StatusColor
                      } : undefined}
                    >
                      {selectedTask.StatusName || 'Unknown'}
                    </span>
                    {selectedTask.PriorityName && (
                      <span className="px-2 py-1 text-xs font-semibold rounded-full"
                        style={selectedTask.PriorityColor ? {
                          backgroundColor: selectedTask.PriorityColor + '20',
                          color: selectedTask.PriorityColor
                        } : undefined}
                      >
                        {selectedTask.PriorityName}
                      </span>
                    )}
                  </div>
                  {/* Tags */}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {taskTags.map((tag: any) => (
                      <span
                        key={tag.Id}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full"
                        style={{ backgroundColor: tag.Color + '20', color: tag.Color, border: `1px solid ${tag.Color}` }}
                      >
                        🏷️ {tag.Name}
                        <button
                          onClick={() => handleRemoveTag(tag.Id)}
                          className="ml-1 hover:opacity-70"
                          title="Remove tag"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <div className="relative">
                      <button
                        onClick={() => {
                          if (!showTagSelector) {
                            loadAvailableTags(organizationId);
                          }
                          setShowTagSelector(!showTagSelector);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        + Add Tag
                      </button>
                      {showTagSelector && (
                        <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 z-10">
                          <div className="p-2 max-h-48 overflow-y-auto">
                            {availableTags.filter(t => !taskTags.find((tt: any) => tt.Id === t.Id)).length === 0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">No more tags available</p>
                            ) : (
                              availableTags
                                .filter(t => !taskTags.find((tt: any) => tt.Id === t.Id))
                                .map((tag: any) => (
                                  <button
                                    key={tag.Id}
                                    onClick={() => handleAddTag(tag.Id)}
                                    className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                  >
                                    <span
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: tag.Color }}
                                    />
                                    {tag.Name}
                                  </button>
                                ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
                >
                  ×
                </button>
              </div>

              {/* Task Info */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Estimated Hours</div>
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {parseFloat(selectedTask.EstimatedHours || 0).toFixed(2)}h
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Allocated Hours</div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {parseFloat(selectedTask.TotalAllocated || 0).toFixed(2)}h
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Worked Hours</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {parseFloat(selectedTask.TotalWorked || 0).toFixed(2)}h
                  </div>
                </div>
              </div>

              {/* Description */}
              {selectedTask.Description && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Description</h3>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selectedTask.Description}</p>
                </div>
              )}

              {/* Allocations */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Planned Allocations</h3>
                {loadingTaskDetails ? (
                  <p className="text-gray-500 dark:text-gray-400">Loading allocations...</p>
                ) : taskAllocations.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">No allocations found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                            Date
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                            User
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                            Time
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                            Hours
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {taskAllocations.map((allocation: any, idx: number) => {
                          const date = new Date(allocation.AllocationDate);
                          const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                          
                          return (
                            <tr key={idx}>
                              <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                {dayName}, {dateStr}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                                {allocation.Username || 'Unknown'}
                              </td>
                              <td className="px-4 py-2 text-sm text-center text-gray-700 dark:text-gray-300">
                                {allocation.StartTime || '-'} - {allocation.EndTime || '-'}
                              </td>
                              <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100 font-medium">
                                {parseFloat(allocation.AllocatedHours).toFixed(2)}h
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Time Entries */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Time Entries</h3>
                {loadingTaskDetails ? (
                  <p className="text-gray-500 dark:text-gray-400">Loading time entries...</p>
                ) : taskTimeEntries.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">No time entries recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                            Date
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                            User
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                            Time
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                            Description
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                            Hours
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {taskTimeEntries.map((entry: any, idx: number) => {
                          const date = new Date(entry.WorkDate);
                          const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                          
                          return (
                            <tr key={idx}>
                              <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                {dayName}, {dateStr}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                                {entry.Username || 'Unknown'}
                              </td>
                              <td className="px-4 py-2 text-sm text-center text-gray-700 dark:text-gray-300">
                                {entry.StartTime || '-'} - {entry.EndTime || '-'}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                                {entry.Description || '-'}
                              </td>
                              <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100 font-medium">
                                {parseFloat(entry.Hours).toFixed(2)}h
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Comments Section */}
              <div className="mt-6 border-t dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                  💬 Comments
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                    ({taskComments.length})
                  </span>
                </h3>
                
                {/* Add Comment Form */}
                <div className="mb-4 flex gap-3">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddComment();
                      }
                    }}
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={submittingComment || !newComment.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submittingComment ? '...' : 'Send'}
                  </button>
                </div>

                {/* Comments List */}
                {loadingTaskDetails ? (
                  <p className="text-gray-500 dark:text-gray-400">Loading comments...</p>
                ) : taskComments.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">No comments yet. Be the first to comment!</p>
                ) : (
                  <div className="space-y-4 max-h-60 overflow-y-auto">
                    {taskComments.map((comment: any) => (
                      <div key={comment.Id} className="flex gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                          {(comment.FirstName?.[0] || comment.Username?.[0] || '?').toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {comment.FirstName && comment.LastName 
                                  ? `${comment.FirstName} ${comment.LastName}` 
                                  : comment.Username}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(comment.CreatedAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteComment(comment.Id)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                              title="Delete comment"
                            >
                              🗑️
                            </button>
                          </div>
                          <p className="text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{comment.Comment}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Attachments Section */}
              <div className="mt-6 border-t dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                  📎 Attachments
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                    ({taskAttachments.length})
                  </span>
                </h3>
                
                {/* Upload Button */}
                <div className="mb-4">
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors">
                    {uploadingFile ? (
                      <>⏳ Uploading...</>
                    ) : (
                      <>📤 Upload File</>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploadingFile}
                    />
                  </label>
                  <span className="ml-3 text-xs text-gray-500 dark:text-gray-400">
                    Max 10MB. Allowed: images, PDF, Word, Excel, text, CSV, ZIP
                  </span>
                </div>

                {/* Attachments List */}
                {loadingTaskDetails ? (
                  <p className="text-gray-500 dark:text-gray-400">Loading attachments...</p>
                ) : taskAttachments.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">No attachments yet.</p>
                ) : (
                  <div className="space-y-2">
                    {taskAttachments.map((attachment: any) => (
                      <div key={attachment.Id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-2xl">{getFileIcon(attachment.FileType)}</span>
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 dark:text-white">
                              {attachment.FileName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(attachment.FileSize)} • {attachment.FirstName && attachment.LastName ? `${attachment.FirstName} ${attachment.LastName}` : attachment.Username} • {new Date(attachment.CreatedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteAttachment(attachment.Id)}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                          title="Delete attachment"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* History Section */}
              <div className="mt-6 border-t dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                  📜 History
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                    ({taskHistory.length})
                  </span>
                </h3>
                
                {loadingTaskDetails ? (
                  <p className="text-gray-500 dark:text-gray-400">Loading history...</p>
                ) : taskHistory.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">No history recorded yet.</p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {taskHistory.map((entry: any) => {
                      const date = new Date(entry.CreatedAt);
                      const timeStr = date.toLocaleString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                      
                      // Format the action message
                      let actionText = '';
                      let actionIcon = '📝';
                      
                      switch (entry.Action) {
                        case 'created':
                          actionText = 'created the task';
                          actionIcon = '🆕';
                          break;
                        case 'updated':
                          if (entry.FieldName) {
                            actionText = `changed ${entry.FieldName}`;
                            if (entry.OldValue && entry.NewValue) {
                              actionText += ` from "${entry.OldValue}" to "${entry.NewValue}"`;
                            } else if (entry.NewValue) {
                              actionText += ` to "${entry.NewValue}"`;
                            }
                          } else {
                            actionText = 'updated the task';
                          }
                          actionIcon = '✏️';
                          break;
                        case 'status_changed':
                          actionText = `changed status from "${entry.OldValue || 'None'}" to "${entry.NewValue}"`;
                          actionIcon = '🔄';
                          break;
                        case 'assigned':
                          actionText = entry.NewValue ? `assigned to ${entry.NewValue}` : 'removed assignment';
                          actionIcon = '👤';
                          break;
                        case 'comment_added':
                          actionText = 'added a comment';
                          actionIcon = '💬';
                          break;
                        case 'attachment_added':
                          actionText = `added attachment "${entry.NewValue || 'file'}"`;
                          actionIcon = '📎';
                          break;
                        case 'attachment_removed':
                          actionText = `removed attachment "${entry.OldValue || 'file'}"`;
                          actionIcon = '🗑️';
                          break;
                        default:
                          actionText = entry.Action;
                      }
                      
                      return (
                        <div key={entry.Id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <span className="text-xl">{actionIcon}</span>
                          <div className="flex-1">
                            <p className="text-sm text-gray-900 dark:text-gray-100">
                              <span className="font-medium">{entry.FirstName || entry.Username || 'Unknown'}</span>
                              {' '}{actionText}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {timeStr}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Close Button */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedTask(null)}
                  className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      {alertMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                {alertMessage.title}
              </h3>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                {alertMessage.message}
              </p>
              <div className="flex justify-end">
                <button
                  onClick={closeAlert}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Settings Tab Component
function SettingsTab({ project, token, onSaved }: { project: Project; token: string; onSaved: () => void }) {
  const [formData, setFormData] = useState({
    organizationId: project.OrganizationId,
    projectName: project.ProjectName,
    description: project.Description || '',
    status: project.Status,
    startDate: project.StartDate ? project.StartDate.split('T')[0] : '',
    endDate: project.EndDate ? project.EndDate.split('T')[0] : '',
    isHobby: project.IsHobby || false,
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<StatusValue[]>([]);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadOrganizations();
    loadProjectStatuses();
  }, []);

  const loadOrganizations = async () => {
    try {
      const response = await organizationsApi.getAll(token);
      const adminOrgs = response.organizations.filter(
        org => org.Role === 'Owner' || org.Role === 'Admin'
      );
      setOrganizations(adminOrgs);
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
    }
  };

  const loadProjectStatuses = async () => {
    try {
      const response = await statusValuesApi.getProjectStatuses(project.OrganizationId, token);
      setProjectStatuses(response.statuses);
    } catch (err: any) {
      console.error('Failed to load project statuses:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Check if organization changed
    if (formData.organizationId !== project.OrganizationId) {
      setShowTransferConfirm(true);
      return;
    }

    await saveProject();
  };

  const saveProject = async () => {
    setIsLoading(true);
    try {
      // If organization changed, use transfer endpoint
      if (formData.organizationId !== project.OrganizationId) {
        await projectsApi.transfer(project.Id, formData.organizationId, token);
      }

      const updateData = {
        projectName: formData.projectName,
        description: formData.description,
        status: formData.status,
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        isHobby: formData.isHobby,
      };
      await projectsApi.update(project.Id, updateData, token);
      setSuccess(true);
      setTimeout(() => {
        onSaved();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to update project');
    } finally {
      setIsLoading(false);
      setShowTransferConfirm(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Project Settings</h1>
      
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">General Settings</h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-800 text-green-700 dark:text-green-400 rounded">
            Project updated successfully!
          </div>
        )}

        {showTransferConfirm && (
          <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-800 rounded">
            <h3 className="font-bold text-yellow-800 dark:text-yellow-400 mb-2">
              Confirm Organization Transfer
            </h3>
            <p className="text-yellow-700 dark:text-yellow-400 text-sm mb-4">
              You are about to transfer this project to a different organization. This action will affect access permissions.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowTransferConfirm(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveProject}
                disabled={isLoading}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white rounded-lg text-sm"
              >
                {isLoading ? 'Transferring...' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Organization *
            </label>
            <select
              value={formData.organizationId}
              onChange={(e) => setFormData({ ...formData, organizationId: parseInt(e.target.value) })}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {organizations.map((org) => (
                <option key={org.Id} value={org.Id}>
                  {org.Name} ({org.Role})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Only organizations where you have Admin or Owner role are shown
            </p>
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status
            </label>
            <select
              value={formData.status || ''}
              onChange={(e) => setFormData({ ...formData, status: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {projectStatuses.length > 0 ? (
                projectStatuses.sort((a, b) => a.SortOrder - b.SortOrder).map((status) => (
                  <option key={status.Id} value={status.Id}>
                    {status.StatusName}
                  </option>
                ))
              ) : (
                <option value="">No statuses available</option>
              )}
            </select>
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

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isHobby"
              checked={formData.isHobby}
              onChange={(e) => setFormData({ ...formData, isHobby: e.target.checked })}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
            />
            <label htmlFor="isHobby" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">Hobby Project</span>
              <span className="text-gray-500 dark:text-gray-400 ml-2">
                (Uses hobby time slots instead of work hours)
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium mt-4"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Edit Project Modal
function EditProjectModal({
  project,
  onClose,
  onSaved,
  token,
}: {
  project: Project;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const [formData, setFormData] = useState<CreateProjectData>({
    organizationId: project.OrganizationId,
    projectName: project.ProjectName,
    description: project.Description || '',
    status: project.Status,
    startDate: project.StartDate ? project.StartDate.split('T')[0] : '',
    endDate: project.EndDate ? project.EndDate.split('T')[0] : '',
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<StatusValue[]>([]);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadOrganizations();
    loadProjectStatuses();
    // Clear any previous errors when modal opens
    setError('');
  }, []);

  const loadOrganizations = async () => {
    try {
      const response = await organizationsApi.getAll(token);
      // Filter to only organizations where user has admin/owner role
      const adminOrgs = response.organizations.filter(
        org => org.Role === 'Owner' || org.Role === 'Admin'
      );
      setOrganizations(adminOrgs);
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
      setError(err.message || 'Failed to load organizations');
    }
  };

  const loadProjectStatuses = async () => {
    try {
      const response = await statusValuesApi.getProjectStatuses(project.OrganizationId, token);
      setProjectStatuses(response.statuses);
    } catch (err: any) {
      console.error('Failed to load project statuses:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Check if organization changed
    if (formData.organizationId !== project.OrganizationId) {
      setShowTransferConfirm(true);
      return;
    }

    await saveProject();
  };

  const saveProject = async () => {
    setIsLoading(true);
    try {
      // If organization changed, use transfer endpoint
      if (formData.organizationId !== project.OrganizationId) {
        console.log('Transferring project to org:', formData.organizationId);
        await projectsApi.transfer(project.Id, formData.organizationId, token);
      }
      
      // Always exclude organizationId from update call - build new object explicitly
      // Convert empty strings to null for date fields (MySQL requires null, not undefined)
      const updateData = {
        projectName: formData.projectName,
        description: formData.description,
        status: formData.status,
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
      };
      console.log('Updating project with data:', updateData);
      await projectsApi.update(project.Id, updateData, token);
      onSaved();
    } catch (err: any) {
      console.error('Save project error:', err);
      setError(err.message || 'Failed to update project');
    } finally {
      setIsLoading(false);
      setShowTransferConfirm(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Project</h2>
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

          {showTransferConfirm && (
            <div className="mb-4 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-800 rounded">
              <h3 className="font-bold text-yellow-800 dark:text-yellow-400 mb-2">
                Confirm Organization Transfer
              </h3>
              <p className="text-yellow-700 dark:text-yellow-400 text-sm mb-4">
                You are about to transfer this project to a different organization. This action will affect access permissions and project visibility.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowTransferConfirm(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveProject}
                  disabled={isLoading}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white rounded-lg text-sm"
                >
                  {isLoading ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Organization *
              </label>
              <select
                value={formData.organizationId}
                onChange={(e) => setFormData({ ...formData, organizationId: parseInt(e.target.value) })}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Select Organization</option>
                {organizations.map((org) => (
                  <option key={org.Id} value={org.Id}>
                    {org.Name} ({org.Role})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Only organizations where you have Admin or Owner role are shown
              </p>
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
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status
              </label>
              <select
                value={formData.status || ''}
                onChange={(e) => setFormData({ ...formData, status: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {projectStatuses.length > 0 ? (
                  projectStatuses.sort((a, b) => a.SortOrder - b.SortOrder).map((status) => (
                    <option key={status.Id} value={status.Id}>
                      {status.StatusName}
                    </option>
                  ))
                ) : (
                  <option value="">No statuses available</option>
                )}
              </select>
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
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Searchable Select Component for large dropdowns
function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  emptyMessage = 'No options available',
  className = '',
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  options: { id: number; label: string }[];
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedOption = options.find(opt => opt.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <div
        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer flex items-center justify-between"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={!selectedOption ? 'text-gray-400 dark:text-gray-500' : ''}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-72 overflow-hidden">
          <div className="p-2 border-b border-gray-200 dark:border-gray-600">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-56">
            <div
              className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer text-gray-900 dark:text-white"
              onClick={() => {
                onChange(undefined);
                setIsOpen(false);
                setSearchTerm('');
              }}
            >
              {placeholder}
            </div>
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div
                  key={opt.id}
                  className={`px-4 py-2 cursor-pointer text-gray-900 dark:text-white ${
                    opt.id === value
                      ? 'bg-blue-100 dark:bg-blue-900'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                  onClick={() => {
                    onChange(opt.id);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                >
                  {opt.label}
                </div>
              ))
            ) : (
              <div className="px-4 py-2 text-gray-500 dark:text-gray-400 text-sm">
                {emptyMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Task Modal Component
function TaskModal({
  projectId,
  task,
  project,
  tasks,
  onClose,
  onSaved,
  token,
}: {
  projectId: number;
  task: Task | null;
  project: Project;
  tasks: Task[];
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const [formData, setFormData] = useState<CreateTaskData>({
    projectId,
    taskName: task?.TaskName || '',
    description: task?.Description || '',
    status: task?.Status ?? null,
    priority: task?.Priority ?? null,
    assignedTo: task?.AssignedTo || undefined,
    dueDate: task?.DueDate ? task.DueDate.split('T')[0] : '',
    estimatedHours: task?.EstimatedHours || undefined,
    parentTaskId: task?.ParentTaskId || undefined,
    dependsOnTaskId: task?.DependsOnTaskId || undefined,
  });
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [taskPriorities, setTaskPriorities] = useState<StatusValue[]>([]);
  const [organizationUsers, setOrganizationUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Calculate if this task has subtasks and their total hours
  const subtasks = task ? tasks.filter(t => t.ParentTaskId === task.Id) : [];
  const hasSubtasks = subtasks.length > 0;
  const subtasksTotal = hasSubtasks 
    ? subtasks.reduce((sum, st) => sum + (parseFloat(st.EstimatedHours as any) || 0), 0) 
    : 0;

  // Update estimated hours when subtasks change
  useEffect(() => {
    if (hasSubtasks && task) {
      setFormData(prev => ({ ...prev, estimatedHours: subtasksTotal }));
    }
  }, [hasSubtasks, subtasksTotal, task]);

  useEffect(() => {
    loadTaskStatuses();
    loadTaskPriorities();
    loadOrganizationUsers();
  }, []);

  // Set default values when creating a new task
  useEffect(() => {
    if (!task && taskStatuses.length > 0 && taskPriorities.length > 0) {
      setFormData(prev => {
        const updates: Partial<CreateTaskData> = {};
        
        // Set default status if not already set
        if (prev.status === null) {
          const defaultStatus = taskStatuses.find(s => s.IsDefault);
          if (defaultStatus) {
            updates.status = defaultStatus.Id;
          }
        }
        
        // Set default priority if not already set
        if (prev.priority === null) {
          const defaultPriority = taskPriorities.find(p => p.IsDefault);
          if (defaultPriority) {
            updates.priority = defaultPriority.Id;
          }
        }
        
        return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
      });
    }
  }, [task, taskStatuses, taskPriorities]);

  const loadTaskStatuses = async () => {
    try {
      const response = await statusValuesApi.getTaskStatuses(project.OrganizationId, token);
      setTaskStatuses(response.statuses);
    } catch (err: any) {
      console.error('Failed to load task statuses:', err);
    }
  };

  const loadTaskPriorities = async () => {
    try {
      const response = await statusValuesApi.getTaskPriorities(project.OrganizationId, token);
      setTaskPriorities(response.priorities);
    } catch (err: any) {
      console.error('Failed to load task priorities:', err);
    }
  };

  const loadOrganizationUsers = async () => {
    try {
      const response = await usersApi.getByOrganization(project.OrganizationId, token);
      setOrganizationUsers(response.users);
    } catch (err: any) {
      console.error('Failed to load organization users:', err);
    }
  };

  // Get all descendants of a task (recursively) to prevent circular references
  const getDescendants = (taskId: number): number[] => {
    const descendants: number[] = [];
    const directChildren = tasks.filter(t => t.ParentTaskId === taskId);
    
    for (const child of directChildren) {
      descendants.push(child.Id);
      descendants.push(...getDescendants(child.Id));
    }
    
    return descendants;
  };

  // Get available tasks for Parent Task dropdown (exclude self and descendants)
  const getAvailableParentTasks = (): { id: number; label: string }[] => {
    if (!task) {
      // Creating new task - all tasks are available
      return tasks.map(t => ({
        id: t.Id,
        label: t.TaskName,
      }));
    }
    
    // Editing existing task - exclude self and descendants
    const descendants = getDescendants(task.Id);
    const excludeIds = [task.Id, ...descendants];
    
    return tasks
      .filter(t => !excludeIds.includes(t.Id))
      .map(t => ({
        id: t.Id,
        label: t.TaskName,
      }));
  };

  // Get available tasks for Depends On dropdown (exclude self and descendants)
  const getAvailableDependencyTasks = (): { id: number; label: string }[] => {
    if (!task) {
      // Creating new task - all tasks are available
      return tasks.map(t => ({
        id: t.Id,
        label: t.TaskName,
      }));
    }
    
    // Editing existing task - exclude self
    return tasks
      .filter(t => t.Id !== task.Id)
      .map(t => ({
        id: t.Id,
        label: t.TaskName,
      }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (task) {
        await tasksApi.update(task.Id, formData, token);
      } else {
        await tasksApi.create(formData, token);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save task');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {task ? 'Edit Task' : 'Create New Task'}
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

          {task && task.CreatorName && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium">Created by:</span> {task.CreatorName}
                <span className="text-gray-500 dark:text-gray-400 ml-2">
                  on {new Date(task.CreatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Task Name *
              </label>
              <input
                type="text"
                value={formData.taskName}
                onChange={(e) => setFormData({ ...formData, taskName: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter task name"
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
                placeholder="Enter task description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status
                </label>
                <select
                  value={formData.status ?? ''}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {taskStatuses.length > 0 ? (
                    <>
                      <option value="">Select a status</option>
                      {taskStatuses.sort((a, b) => a.SortOrder - b.SortOrder).map((status) => (
                        <option key={status.Id} value={status.Id}>
                          {status.StatusName}
                        </option>
                      ))}
                    </>
                  ) : (
                    <option value="">No statuses available</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Priority
                </label>
                <select
                  value={formData.priority ?? ''}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {taskPriorities.length > 0 ? (
                    <>
                      <option value="">Select a priority</option>
                      {taskPriorities.sort((a, b) => a.SortOrder - b.SortOrder).map((priority) => (
                        <option key={priority.Id} value={priority.Id}>
                          {priority.PriorityName}
                        </option>
                      ))}
                    </>
                  ) : (
                    <option value="">No priorities available</option>
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Assigned To
              </label>
              <select
                value={formData.assignedTo || ''}
                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">Unassigned</option>
                {organizationUsers.map(user => (
                  <option key={user.Id} value={user.Id}>
                    {user.Username} {user.FirstName && user.LastName ? `(${user.FirstName} ${user.LastName})` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Select a user to assign this task
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Due Date
              </label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Estimated Hours
                {hasSubtasks && (
                  <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(Auto-calculated from subtasks)</span>
                )}
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={formData.estimatedHours || ''}
                onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value ? parseFloat(e.target.value) : undefined })}
                disabled={hasSubtasks}
                className={`w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white ${
                  hasSubtasks 
                    ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-75' 
                    : 'bg-white dark:bg-gray-700'
                }`}
                placeholder="e.g., 4.5"
              />
              {hasSubtasks && (
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                  This task has {subtasks.length} subtask{subtasks.length !== 1 ? 's' : ''} totaling {subtasksTotal.toFixed(2)} hours
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Parent Task (Optional)
              </label>
              <SearchableSelect
                value={formData.parentTaskId}
                onChange={(value) => setFormData({ ...formData, parentTaskId: value })}
                options={getAvailableParentTasks()}
                placeholder="No Parent (Top-level task)"
                emptyMessage="No tasks available"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Select a parent task to create a subtask (supports multi-level hierarchy)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Depends On (Optional)
              </label>
              <SearchableSelect
                value={formData.dependsOnTaskId}
                onChange={(value) => setFormData({ ...formData, dependsOnTaskId: value })}
                options={getAvailableDependencyTasks()}
                placeholder="No dependency"
                emptyMessage="No tasks available"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                This task cannot start until the selected task is completed
              </p>
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
                {isLoading ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
