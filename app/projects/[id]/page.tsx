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
import RichTextEditor from '@/components/RichTextEditor';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import { getTaskAttachment } from '@/lib/api/taskAttachments';

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;
  
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'kanban' | 'gantt' | 'reporting' | 'settings' | 'utilities' | 'attachments' | 'history' | 'dependencies' | 'burndown' | 'sprints'>('overview');
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
  const [importAllRows, setImportAllRows] = useState<any[]>([]);
  const [csvUniqueStatuses, setCsvUniqueStatuses] = useState<string[]>([]);
  const [csvUniquePriorities, setCsvUniquePriorities] = useState<string[]>([]);
  const [importStatusMapping, setImportStatusMapping] = useState<Record<string, string>>({});
  const [importPriorityMapping, setImportPriorityMapping] = useState<Record<string, string>>({});
  const [importAvailStatuses, setImportAvailStatuses] = useState<StatusValue[]>([]);
  const [importAvailPriorities, setImportAvailPriorities] = useState<StatusValue[]>([]);
  const [showJiraImportModal, setShowJiraImportModal] = useState(false);
  const [jiraIssues, setJiraIssues] = useState<any[]>([]);
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [statusMapping, setStatusMapping] = useState<{[key: string]: string}>({});
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState('');
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [jiraFilters, setJiraFilters] = useState({
    search: '',
    status: '',
    issueType: '',
    priority: '',
    showParentsOnly: false,
    showSubtasksOnly: false
  });
  const [existingIssueIds, setExistingIssueIds] = useState<Set<string>>(new Set());
  const [showAlreadyImported, setShowAlreadyImported] = useState(false);
  // GitHub Integration State
  const [showGitHubImportModal, setShowGitHubImportModal] = useState(false);
  const [gitHubIssues, setGitHubIssues] = useState<any[]>([]);
  const [selectedGitHubIssues, setSelectedGitHubIssues] = useState<Set<string>>(new Set());
  const [gitHubStatusMapping, setGitHubStatusMapping] = useState<{[key: string]: string}>({});
  const [gitHubLoading, setGitHubLoading] = useState(false);
  const [gitHubError, setGitHubError] = useState('');
  const [gitHubFilters, setGitHubFilters] = useState({
    search: '',
    state: '',
    label: '',
    assignee: ''
  });
  const [existingGitHubIssueIds, setExistingGitHubIssueIds] = useState<Set<string>>(new Set());
  const [showAlreadyImportedGitHub, setShowAlreadyImportedGitHub] = useState(false);
  // Gitea Integration State
  const [showGiteaImportModal, setShowGiteaImportModal] = useState(false);
  const [giteaIssues, setGiteaIssues] = useState<any[]>([]);
  const [selectedGiteaIssues, setSelectedGiteaIssues] = useState<Set<string>>(new Set());
  const [giteaStatusMapping, setGiteaStatusMapping] = useState<{[key: string]: string}>({});
  const [giteaLoading, setGiteaLoading] = useState(false);
  const [giteaError, setGiteaError] = useState('');
  const [giteaFilters, setGiteaFilters] = useState({
    search: '',
    state: '',
    label: '',
    type: ''
  });
  const [existingGiteaIssueIds, setExistingGiteaIssueIds] = useState<Set<string>>(new Set());
  const [showAlreadyImportedGitea, setShowAlreadyImportedGitea] = useState(false);
  const [jiraIntegration, setJiraIntegration] = useState<any>(null);
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
      
      // Load Jira integration for the organization
      if (response.project.OrganizationId) {
        try {
          const jiraResponse = await fetch(`${getApiUrl()}/api/jira-integrations/organization/${response.project.OrganizationId}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (jiraResponse.ok) {
            const jiraData = await jiraResponse.json();
            if (jiraData.integration?.IsEnabled) {
              setJiraIntegration(jiraData.integration);
            }
          }
        } catch (err) {
          console.error('Failed to load Jira integration:', err);
        }
      }
      
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
  const handleImportClick = async () => {
    setShowImportModal(true);
    setImportFile(null);
    setImportPreview([]);
    setImportAllRows([]);
    setImportResult(null);
    setImportProgress('');
    setCsvUniqueStatuses([]);
    setCsvUniquePriorities([]);
    setImportStatusMapping({});
    setImportPriorityMapping({});

    // Load available statuses and priorities for the project's organization
    if (project?.OrganizationId && token) {
      try {
        const [statusRes, priorityRes] = await Promise.all([
          statusValuesApi.getTaskStatuses(project.OrganizationId, token),
          statusValuesApi.getTaskPriorities(project.OrganizationId, token),
        ]);
        setImportAvailStatuses(statusRes.statuses || []);
        setImportAvailPriorities(priorityRes.priorities || []);
      } catch (err) {
        console.error('Failed to load statuses/priorities for import:', err);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportPreview([]);
    setImportAllRows([]);
    setImportProgress('Reading file...');
    setCsvUniqueStatuses([]);
    setCsvUniquePriorities([]);
    setImportStatusMapping({});
    setImportPriorityMapping({});

    try {
      const text = await file.text();
      const lines = text.split('\n').map(line => line.trim()).filter(line => line);

      if (lines.length < 2) {
        setImportProgress('Error: File is empty or invalid');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim());

      // Parse ALL rows
      const allRows = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj: any = {};
        headers.forEach((header, idx) => {
          obj[header] = values[idx]?.trim() || '';
        });
        return obj;
      });

      setImportAllRows(allRows);
      setImportPreview(allRows.slice(0, 5));

      // Extract unique non-empty Status and Priority values
      const statuses = Array.from(new Set(allRows.map(r => r.Status).filter(Boolean))) as string[];
      const priorities = Array.from(new Set(allRows.map(r => r.Priority).filter(Boolean))) as string[];
      setCsvUniqueStatuses(statuses);
      setCsvUniquePriorities(priorities);

      // Auto-map: find exact match (case-insensitive) for each unique value
      const autoStatusMap: Record<string, string> = {};
      statuses.forEach(csvVal => {
        const match = importAvailStatuses.find(s =>
          s.StatusName.toLowerCase().trim() === csvVal.toLowerCase().trim()
        );
        autoStatusMap[csvVal] = match ? String(match.Id) : '';
      });
      setImportStatusMapping(autoStatusMap);

      const autoPriorityMap: Record<string, string> = {};
      priorities.forEach(csvVal => {
        const match = importAvailPriorities.find(p =>
          (p.PriorityName || p.StatusName).toLowerCase().trim() === csvVal.toLowerCase().trim()
        );
        autoPriorityMap[csvVal] = match ? String(match.Id) : '';
      });
      setImportPriorityMapping(autoPriorityMap);

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
      const parsed = parseCSV(text);

      // Apply status/priority mappings and add ProjectId
      const tasksWithProject = (importAllRows.length > 0 ? importAllRows : parsed).map(task => {
        const mappedStatus = task.Status ? importStatusMapping[task.Status] : undefined;
        const mappedPriority = task.Priority ? importPriorityMapping[task.Priority] : undefined;
        return {
          ...task,
          ProjectId: projectId,
          Status: mappedStatus || '',
          Priority: mappedPriority || '',
        };
      });

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

  const handleDownloadProjectAttachment = async (attachmentId: number) => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/project-attachments/${attachmentId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to download attachment');
      }

      const result = await response.json();
      const attachment = result.data;

      // Create blob from base64
      const byteCharacters = atob(attachment.FileData || '');
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.FileType });

      // Download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.FileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      showAlert('Download Failed', err.message || 'Failed to download attachment');
    }
  };

  const handlePreviewProjectAttachment = async (attachmentId: number) => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/project-attachments/${attachmentId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to preview attachment');
      }

      const result = await response.json();
      const attachment = result.data;

      // Create blob from base64
      const byteCharacters = atob(attachment.FileData || '');
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.FileType });

      // Open in new tab
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');

      // Clean up URL after a delay
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      showAlert('Preview Failed', err.message || 'Failed to preview attachment');
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

  // Jira Import Functions
  const loadExistingJiraIssues = async () => {
    if (!token || !projectId) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/tasks/project/${projectId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const existingIds = new Set<string>(
          data.tasks
            .filter((task: any) => {
              const hasExternalTicketId = task.ExternalTicketId;
              const hasExternalIssueId = task.ExternalIssueId;
              return hasExternalTicketId || hasExternalIssueId;
            })
            .map((task: any) => String(task.ExternalTicketId || task.ExternalIssueId))
        );
        setExistingIssueIds(existingIds);
      }
    } catch (err) {
      console.error('Failed to load existing Jira issues:', err);
    }
  };

  const loadJiraIssues = async () => {
    if (!token || !project) return;
    
    setJiraLoading(true);
    setJiraError('');
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/jira-integrations/project/${projectId}/issues`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch Jira issues');
      }

      const data = await response.json();
      setJiraIssues(data.data || []);
      
      // Auto-create status mapping based on matching names
      if (taskStatuses.length > 0 && data.data) {
        const mapping: {[key: string]: string} = {};
        const jiraStatuses = new Set<string>();
        
        data.data.forEach((issue: any) => {
          if (issue.status) {
            jiraStatuses.add(issue.status);
          }
        });
        
        jiraStatuses.forEach(jiraStatus => {
          const match = taskStatuses.find(
            ts => ts.StatusName.toLowerCase() === jiraStatus.toLowerCase()
          );
          if (match) {
            mapping[jiraStatus] = match.StatusName;
          } else {
            // Default to first status if no match
            mapping[jiraStatus] = taskStatuses[0]?.StatusName || '';
          }
        });
        
        setStatusMapping(mapping);
      }
    } catch (err: any) {
      setJiraError(err.message || 'Failed to load Jira issues');
    } finally {
      setJiraLoading(false);
    }
  };

  const loadTaskStatuses = async () => {
    if (!token || !project) return;
    
    try {
      const statuses = await statusValuesApi.getTaskStatuses(project.OrganizationId, token);
      setTaskStatuses(statuses.statuses);
    } catch (err: any) {
      console.error('Failed to load task statuses:', err);
    }
  };

  const handleJiraImport = async () => {
    // Filter out already imported issues from selection
    const validIssues = Array.from(selectedIssues).filter(key => !existingIssueIds.has(key));
    
    if (!token || validIssues.length === 0) return;
    
    setJiraLoading(true);
    setJiraError('');
    
    try {
      const issuesToImport = jiraIssues.filter(issue => 
        validIssues.includes(issue.key)
      );
      
      const response = await fetch(
        `${getApiUrl()}/api/tasks/import-from-jira`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId: parseInt(projectId),
            issues: issuesToImport,
            statusMapping: statusMapping,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to import tasks');
      }

      const result = await response.json();
      const imported = result.data?.imported || result.createdTasks || 0;
      const skipped = result.data?.skipped || 0;
      const hierarchyLinked = result.data?.hierarchyLinked || 0;
      
      let message = `Successfully imported ${imported} task(s).`;
      if (skipped > 0) {
        message += ` ${skipped} issue(s) were already imported.`;
      }
      if (hierarchyLinked > 0) {
        message += ` ${hierarchyLinked} parent-child relationship(s) created.`;
      }
      
      showAlert('Import Successful', message);
      
      setShowJiraImportModal(false);
      setSelectedIssues(new Set());
      await loadTasks();
      await loadExistingJiraIssues(); // Reload the imported issues list
    } catch (err: any) {
      setJiraError(err.message || 'Failed to import tasks');
    } finally {
      setJiraLoading(false);
    }
  };

  const toggleIssueSelection = (issueKey: string) => {
    // Don't allow selection of already imported issues
    if (existingIssueIds.has(issueKey)) {
      return;
    }
    
    const newSelection = new Set(selectedIssues);
    if (newSelection.has(issueKey)) {
      newSelection.delete(issueKey);
    } else {
      newSelection.add(issueKey);
    }
    setSelectedIssues(newSelection);
  };

  const toggleAllIssues = () => {
    const availableIssues = jiraIssues.filter(issue => !existingIssueIds.has(issue.key));
    if (selectedIssues.size === availableIssues.length) {
      setSelectedIssues(new Set());
    } else {
      setSelectedIssues(new Set(availableIssues.map(issue => issue.key)));
    }
  };

  // Filter and sort Jira issues hierarchically (parents followed by their subtasks)
  const getSortedFilteredJiraIssues = () => {
    // First, apply basic filters to all issues
    const basicFilteredIssues = jiraIssues.filter(issue => {
      // Text search
      if (jiraFilters.search) {
        const searchLower = jiraFilters.search.toLowerCase();
        const matchesSearch = 
          issue.key.toLowerCase().includes(searchLower) ||
          issue.summary?.toLowerCase().includes(searchLower) ||
          issue.description?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      // Status filter
      if (jiraFilters.status && issue.status !== jiraFilters.status) {
        return false;
      }
      
      // Issue type filter
      if (jiraFilters.issueType && issue.issueType !== jiraFilters.issueType) {
        return false;
      }
      
      // Priority filter
      if (jiraFilters.priority && issue.priority !== jiraFilters.priority) {
        return false;
      }
      
      return true;
    });

    // Apply hierarchy and import filters
    const finalFilteredIssues = basicFilteredIssues.filter(issue => {
      const isParent = issue.subtasks && issue.subtasks.length > 0;
      const isSubtask = issue.parentKey !== null;
      
      // Parent/subtask filters
      if (jiraFilters.showParentsOnly && !isParent) {
        return false;
      }
      
      if (jiraFilters.showSubtasksOnly && !isSubtask) {
        return false;
      }
      
      // Already imported filter - CORRECTED LOGIC
      const isAlreadyImported = existingIssueIds.has(issue.key);
      
      // If showAlreadyImported is false (default), hide already imported issues
      if (!showAlreadyImported && isAlreadyImported) {
        return false;
      }
      
      // If showAlreadyImported is true, show all issues (both imported and not imported)
      return true;
    });
    
    // Now sort hierarchically: parents first, then their subtasks
    const result: any[] = [];
    const processedKeys = new Set<string>();
    
    // Process parent issues first (only those that passed all filters)
    const parentIssues = finalFilteredIssues.filter(issue => {
      const isParent = issue.subtasks && issue.subtasks.length > 0;
      const isSubtask = issue.parentKey !== null;
      return isParent && !isSubtask; // Parent but not subtask (root parents)
    });
    
    // Process standalone issues (neither parent nor subtask)
    const standaloneIssues = finalFilteredIssues.filter(issue => {
      const isParent = issue.subtasks && issue.subtasks.length > 0;
      const isSubtask = issue.parentKey !== null;
      return !isParent && !isSubtask;
    });
    
    // Process orphaned subtasks (subtasks whose parents are not in filtered list)
    const orphanedSubtasks = finalFilteredIssues.filter(issue => {
      const isSubtask = issue.parentKey !== null;
      if (!isSubtask) return false;
      // Check if parent exists in final filtered issues
      const parentExists = finalFilteredIssues.some(p => p.key === issue.parentKey);
      return !parentExists;
    });
    
    // Add parents followed by their subtasks (both from finalFilteredIssues)
    parentIssues.forEach(parent => {
      result.push(parent);
      processedKeys.add(parent.key);
      
      // Add subtasks of this parent (only those that passed all filters)
      const childSubtasks = finalFilteredIssues.filter(issue => issue.parentKey === parent.key);
      childSubtasks.forEach(subtask => {
        result.push(subtask);
        processedKeys.add(subtask.key);
      });
    });
    
    // Add standalone issues
    standaloneIssues.forEach(issue => {
      if (!processedKeys.has(issue.key)) {
        result.push(issue);
        processedKeys.add(issue.key);
      }
    });
    
    // Add orphaned subtasks
    orphanedSubtasks.forEach(issue => {
      if (!processedKeys.has(issue.key)) {
        result.push(issue);
        processedKeys.add(issue.key);
      }
    });
    
    return result;
  };
  
  // Keep for backward compatibility
  const getFilteredJiraIssues = getSortedFilteredJiraIssues;

  // ======= GITHUB INTEGRATION FUNCTIONS =======
  
  // GitHub Import Functions
  const loadExistingGitHubIssues = async () => {
    if (!token || !projectId) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/tasks/github-issues/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const issueIds = new Set<string>(
          data.issues
            .map((issue: any) => String(issue.GitHubIssueNumber || ''))
            .filter((id: string) => id !== '')
        );
        setExistingGitHubIssueIds(issueIds);
      }
    } catch (err) {
      console.error('Failed to load existing GitHub issues:', err);
    }
  };

  const loadGitHubIssues = async () => {
    if (!token || !project) return;
    
    // Check if project has GitHub repository configured
    if (!project.GitHubOwner || !project.GitHubRepo) {
      setGitHubError('Please configure GitHub repository in Project Settings first (Owner and Repository fields)');
      setGitHubLoading(false);
      return;
    }
    
    setGitHubLoading(true);
    setGitHubError('');
    
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('owner', project.GitHubOwner);
      queryParams.append('repo', project.GitHubRepo);
      if (gitHubFilters.search) {
        queryParams.append('query', gitHubFilters.search);
      }
      
      const response = await fetch(`${getApiUrl()}/api/github-integrations/organization/${project.OrganizationId}/search?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to load GitHub issues');
      }

      const data = await response.json();
      setGitHubIssues(data.issues || []);
      
      // Clear selections and mappings
      setSelectedGitHubIssues(new Set());
      setGitHubStatusMapping({});
    } catch (err: any) {
      setGitHubError(err.message || 'Failed to load GitHub issues');
    } finally {
      setGitHubLoading(false);
    }
  };

  const handleGitHubImport = async () => {
    // Filter out already imported issues from selection  
    const validIssues = Array.from(selectedGitHubIssues).filter(id => !existingGitHubIssueIds.has(id));
    
    if (!token || validIssues.length === 0) return;
    
    setGitHubLoading(true);
    setGitHubError('');
    
    try {
      const issuesToImport = gitHubIssues.filter(issue => validIssues.includes(issue.number?.toString()));
      
      const response = await fetch(`${getApiUrl()}/api/tasks/import-from-github`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: parseInt(projectId),
          issues: issuesToImport,
          statusMapping: gitHubStatusMapping,
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to import tasks');
      }

      const result = await response.json();
      const imported = result.data?.imported || result.createdTasks || 0;
      const skipped = result.data?.skipped || 0;
      
      let message = `Successfully imported ${imported} task(s) from GitHub.`;
      if (skipped > 0) {
        message += ` ${skipped} issue(s) were already imported.`;
      }
      
      showAlert('Import Successful', message);
      
      setShowGitHubImportModal(false);
      setSelectedGitHubIssues(new Set());
      setGitHubStatusMapping({});
      await loadTasks();
      await loadExistingGitHubIssues(); // Reload the imported issues list
    } catch (err: any) {
      setGitHubError(err.message || 'Failed to import from GitHub');
    } finally {
      setGitHubLoading(false);
    }
  };

  const toggleGitHubIssueSelection = (issueId: string) => {
    // Don't allow selection of already imported issues
    if (existingGitHubIssueIds.has(issueId)) {
      return;
    }
    
    const newSelection = new Set(selectedGitHubIssues);
    if (newSelection.has(issueId)) {
      newSelection.delete(issueId);
    } else {
      newSelection.add(issueId);
    }
    setSelectedGitHubIssues(newSelection);
  };

  const toggleAllGitHubIssues = () => {
    const availableIssues = gitHubIssues.filter(issue => !existingGitHubIssueIds.has(issue.number?.toString()));
    if (selectedGitHubIssues.size === availableIssues.length) {
      setSelectedGitHubIssues(new Set());
    } else {
      setSelectedGitHubIssues(new Set(availableIssues.map(issue => issue.number?.toString())));
    }
  };

  // Filter and sort GitHub issues
  const getFilteredGitHubIssues = () => {
    return gitHubIssues.filter(issue => {
      // Search filter
      if (gitHubFilters.search && !issue.title?.toLowerCase().includes(gitHubFilters.search.toLowerCase()) 
          && !issue.body?.toLowerCase().includes(gitHubFilters.search.toLowerCase())
          && !issue.number?.toString().includes(gitHubFilters.search)) {
        return false;
      }
      
      // State filter
      if (gitHubFilters.state && issue.state !== gitHubFilters.state) {
        return false;
      }
      
      // Label filter
      if (gitHubFilters.label && !issue.labels?.some((label: any) => label.name === gitHubFilters.label)) {
        return false;
      }
      
      // Assignee filter
      if (gitHubFilters.assignee && issue.assignee !== gitHubFilters.assignee) {
        return false;
      }
      
      // Already imported filter
      if (!showAlreadyImportedGitHub && existingGitHubIssueIds.has(issue.number?.toString())) {
        return false;
      }
      
      return true;
    });
  };

  // ======= GITEA INTEGRATION FUNCTIONS =======
  
  // Gitea Import Functions
  const loadExistingGiteaIssues = async () => {
    if (!token || !projectId) return;
    
    try {
      const response = await fetch(`${getApiUrl()}/api/tasks/gitea-issues/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const issueIds = new Set<string>(
          data.issues
            .map((issue: any) => String(issue.GiteaIssueNumber || ''))
            .filter((id: string) => id !== '')
        );
        setExistingGiteaIssueIds(issueIds);
      }
    } catch (err) {
      console.error('Failed to load existing Gitea issues:', err);
    }
  };

  const loadGiteaIssues = async () => {
    if (!token || !project) return;
    
    // Check if project has Gitea repository configured
    if (!project.GiteaOwner || !project.GiteaRepo) {
      setGiteaError('Please configure Gitea repository in Project Settings first (Owner and Repository fields)');
      setGiteaLoading(false);
      return;
    }
    
    setGiteaLoading(true);
    setGiteaError('');
    
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('owner', project.GiteaOwner);
      queryParams.append('repo', project.GiteaRepo);
      if (giteaFilters.search) {
        queryParams.append('query', giteaFilters.search);
      }
      if (giteaFilters.state) {
        queryParams.append('state', giteaFilters.state);
      }
      if (giteaFilters.label) {
        queryParams.append('labels', giteaFilters.label);
      }
      if (giteaFilters.type) {
        queryParams.append('type', giteaFilters.type);
      }
      
      const response = await fetch(`${getApiUrl()}/api/gitea-integrations/organization/${project.OrganizationId}/search?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to load Gitea issues');
      }

      const data = await response.json();
      setGiteaIssues(data.issues || []);
      
      // Initialize status mapping with auto-mapping
      const mapping: {[key: string]: string} = {};
      (data.issues || []).forEach((issue: any) => {
        const state = issue.state?.toLowerCase();
        let mappedStatus = '';
        
        if (state === 'closed') {
          // Try to find a "done" or "closed" status
          const doneStatus = taskStatuses.find(s => 
            s.StatusName.toLowerCase().includes('done') || 
            s.StatusName.toLowerCase().includes('closed') ||
            s.StatusName.toLowerCase().includes('complete')
          );
          mappedStatus = doneStatus?.StatusName || taskStatuses[taskStatuses.length - 1]?.StatusName || '';
        } else {
          // Map open to first status (typically "To Do" or "Open")
          mappedStatus = taskStatuses[0]?.StatusName || '';
        }
        
        mapping[issue.number] = mappedStatus;
      });
      setGiteaStatusMapping(mapping);
      
      // Clear selections
      setSelectedGiteaIssues(new Set());
    } catch (err: any) {
      setGiteaError(err.message || 'Failed to load Gitea issues');
    } finally {
      setGiteaLoading(false);
    }
  };

  const handleGiteaImport = async () => {
    // Filter out already imported issues from selection  
    const validIssues = Array.from(selectedGiteaIssues).filter(id => !existingGiteaIssueIds.has(id));
    
    if (!token || validIssues.length === 0) return;
    
    setGiteaLoading(true);
    setGiteaError('');
    
    try {
      const issuesToImport = giteaIssues.filter(issue => validIssues.includes(issue.number?.toString()));
      
      const response = await fetch(`${getApiUrl()}/api/tasks/import-from-gitea`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: parseInt(projectId),
          issues: issuesToImport,
          statusMapping: giteaStatusMapping,
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to import tasks');
      }

      const result = await response.json();
      const imported = result.data?.imported || result.createdTasks || 0;
      const skipped = result.data?.skipped || 0;
      
      let message = `Successfully imported ${imported} task(s) from Gitea.`;
      if (skipped > 0) {
        message += ` ${skipped} issue(s) were already imported.`;
      }
      
      showAlert('Import Successful', message);
      
      setShowGiteaImportModal(false);
      setSelectedGiteaIssues(new Set());
      setGiteaStatusMapping({});
      await loadTasks();
      await loadExistingGiteaIssues(); // Reload the imported issues list
    } catch (err: any) {
      setGiteaError(err.message || 'Failed to import from Gitea');
    } finally {
      setGiteaLoading(false);
    }
  };

  const toggleGiteaIssueSelection = (issueId: string) => {
    // Don't allow selection of already imported issues
    if (existingGiteaIssueIds.has(issueId)) {
      return;
    }
    
    const newSelection = new Set(selectedGiteaIssues);
    if (newSelection.has(issueId)) {
      newSelection.delete(issueId);
    } else {
      newSelection.add(issueId);
    }
    setSelectedGiteaIssues(newSelection);
  };

  const toggleAllGiteaIssues = () => {
    const availableIssues = giteaIssues.filter(issue => !existingGiteaIssueIds.has(issue.number?.toString()));
    if (selectedGiteaIssues.size === availableIssues.length) {
      setSelectedGiteaIssues(new Set());
    } else {
      setSelectedGiteaIssues(new Set(availableIssues.map(issue => issue.number?.toString())));
    }
  };

  // Filter and sort Gitea issues
  const getFilteredGiteaIssues = () => {
    return giteaIssues.filter(issue => {
      // Search filter
      if (giteaFilters.search && !issue.title?.toLowerCase().includes(giteaFilters.search.toLowerCase()) 
          && !issue.body?.toLowerCase().includes(giteaFilters.search.toLowerCase())
          && !issue.number?.toString().includes(giteaFilters.search)) {
        return false;
      }
      
      // State filter
      if (giteaFilters.state && issue.state !== giteaFilters.state) {
        return false;
      }
      
      // Label filter
      if (giteaFilters.label && !issue.labels?.some((label: any) => label.name === giteaFilters.label)) {
        return false;
      }
      
      // Type filter (issues vs pull requests)
      if (giteaFilters.type) {
        const isPullRequest = issue.pull_request !== undefined && issue.pull_request !== null;
        if (giteaFilters.type === 'issues' && isPullRequest) {
          return false;
        }
        if (giteaFilters.type === 'pulls' && !isPullRequest) {
          return false;
        }
      }
      
      // Already imported filter
      if (!showAlreadyImportedGitea && existingGiteaIssueIds.has(issue.number?.toString())) {
        return false;
      }
      
      return true;
    });
  };

  // Load task statuses and Jira issues when modal opens
  useEffect(() => {
    if (showJiraImportModal && project) {
      loadTaskStatuses();
      loadExistingJiraIssues();
      loadJiraIssues();
    } else if (!showJiraImportModal) {
      // Reset filters when modal closes
      setJiraFilters({
        search: '',
        status: '',
        issueType: '',
        priority: '',
        showParentsOnly: false,
        showSubtasksOnly: false
      });
      setShowAlreadyImported(false);
      setExistingIssueIds(new Set());
    }
  }, [showJiraImportModal, project]);

  // Load task statuses and GitHub issues when modal opens
  useEffect(() => {
    if (showGitHubImportModal && project) {
      loadTaskStatuses();
      loadExistingGitHubIssues();
      loadGitHubIssues();
    } else if (!showGitHubImportModal) {
      // Reset filters when modal closes
      setGitHubFilters({
        search: '',
        state: '',
        label: '',
        assignee: ''
      });
      setShowAlreadyImportedGitHub(false);
      setExistingGitHubIssueIds(new Set());
    }
  }, [showGitHubImportModal, project]);

  // Load task statuses and Gitea issues when modal opens
  useEffect(() => {
    if (showGiteaImportModal && project) {
      loadTaskStatuses();
      loadExistingGiteaIssues();
      loadGiteaIssues();
    } else if (!showGiteaImportModal) {
      // Reset filters when modal closes
      setGiteaFilters({
        search: '',
        state: '',
        label: '',
        type: ''
      });
      setShowAlreadyImportedGitea(false);
      setExistingGiteaIssueIds(new Set());
    }
  }, [showGiteaImportModal, project]);

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
              {permissions?.canViewReports && (
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
              )}
              <button
                onClick={() => setActiveTab('burndown')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'burndown'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                📉 Burndown
              </button>
              <button
                onClick={() => setActiveTab('sprints')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'sprints'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                🏃 Sprints
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
                onClick={() => setActiveTab('dependencies')}
                className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                  activeTab === 'dependencies'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                🔗 Dependencies
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
              {permissions?.canManageProjects && (
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
              )}
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
              project={project}
              jiraIntegration={jiraIntegration}
              onCreateTask={handleCreateTask}
              onEditTask={handleEditTask}
              onDeleteTask={handleDeleteTask}
              onImportClick={handleImportClick}
              onImportFromJira={() => setShowJiraImportModal(true)}
              onImportFromGitHub={() => setShowGitHubImportModal(true)}
              onImportFromGitea={() => setShowGiteaImportModal(true)}
              canCreate={permissions?.canCreateTasks || false}
              canManage={permissions?.canManageTasks || false}
              canDelete={permissions?.canDeleteTasks || false}
              token={token!}
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
                <div className="space-y-3">
                  {projectAttachments.map((attachment: any) => {
                    const canPreview = attachment.FileType.startsWith('image/') || attachment.FileType === 'application/pdf';
                    return (
                      <div key={attachment.Id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-3xl">{getFileIcon(attachment.FileType)}</span>
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 dark:text-white truncate" title={attachment.FileName}>
                              {attachment.FileName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {formatFileSize(attachment.FileSize)} • {attachment.FirstName && attachment.LastName ? `${attachment.FirstName} ${attachment.LastName}` : attachment.Username} • {new Date(attachment.CreatedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canPreview && (
                            <button
                              onClick={() => handlePreviewProjectAttachment(attachment.Id)}
                              className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                              title="Preview"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => handleDownloadProjectAttachment(attachment.Id)}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                            title="Download"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteProjectAttachment(attachment.Id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
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

          {activeTab === 'dependencies' && (
            <DependencyGraphTab
              tasks={tasks}
              onOpenTask={(task) => { setEditingTask(task); setShowTaskModal(true); }}
            />
          )}

          {activeTab === 'burndown' && (
            <BurndownTab projectId={parseInt(projectId)} token={token!} />
          )}

          {activeTab === 'sprints' && project && (
            <SprintsTab projectId={parseInt(projectId)} organizationId={project.OrganizationId} token={token!} />
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

      {/* Jira Import Modal */}
      {showJiraImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
                  </svg>
                  Import Tasks from Jira
                </h2>
                <button
                  onClick={() => setShowJiraImportModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {jiraError && (
                <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
                  {jiraError}
                </div>
              )}

              {jiraLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading Jira issues...</p>
                  </div>
                </div>
              ) : jiraIssues.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No Jira issues found</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Make sure your Jira integration is configured and the board/project has issues.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Status Mapping Section */}
                  {jiraIssues.length > 0 && taskStatuses.length > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-3">📊 Status Mapping</h3>
                      <p className="text-sm text-blue-800 dark:text-blue-400 mb-3">
                        Map Jira statuses to your project's task statuses:
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {Array.from(new Set(jiraIssues.map(i => i.status).filter(Boolean))).map(jiraStatus => (
                          <div key={jiraStatus} className="bg-white dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700">
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {jiraStatus}
                            </label>
                            <select
                              value={statusMapping[jiraStatus]}
                              onChange={(e) => setStatusMapping({
                                ...statusMapping,
                                [jiraStatus]: e.target.value
                              })}
                              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                              {taskStatuses.map(status => (
                                <option key={status.StatusName} value={status.StatusName}>
                                  {status.StatusName}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Filters Section */}
                  <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">🔍 Filters</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {/* Search */}
                      <div className="lg:col-span-3">
                        <input
                          type="text"
                          placeholder="Search by key, summary, or description..."
                          value={jiraFilters.search}
                          onChange={(e) => setJiraFilters({ ...jiraFilters, search: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      
                      {/* Status filter */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                        <select
                          value={jiraFilters.status}
                          onChange={(e) => setJiraFilters({ ...jiraFilters, status: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="">All Statuses</option>
                          {Array.from(new Set(jiraIssues.map(i => i.status).filter(Boolean))).map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Issue Type filter */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Issue Type</label>
                        <select
                          value={jiraFilters.issueType}
                          onChange={(e) => setJiraFilters({ ...jiraFilters, issueType: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="">All Types</option>
                          {Array.from(new Set(jiraIssues.map(i => i.issueType).filter(Boolean))).map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Priority filter */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                        <select
                          value={jiraFilters.priority}
                          onChange={(e) => setJiraFilters({ ...jiraFilters, priority: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="">All Priorities</option>
                          {Array.from(new Set(jiraIssues.map(i => i.priority).filter(Boolean))).map(priority => (
                            <option key={priority} value={priority}>{priority}</option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Hierarchy filters */}
                      <div className="lg:col-span-3 flex gap-4 flex-wrap">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={jiraFilters.showParentsOnly}
                            onChange={(e) => setJiraFilters({ 
                              ...jiraFilters, 
                              showParentsOnly: e.target.checked,
                              showSubtasksOnly: e.target.checked ? false : jiraFilters.showSubtasksOnly
                            })}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Show parents only</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={jiraFilters.showSubtasksOnly}
                            onChange={(e) => setJiraFilters({ 
                              ...jiraFilters, 
                              showSubtasksOnly: e.target.checked,
                              showParentsOnly: e.target.checked ? false : jiraFilters.showParentsOnly
                            })}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Show subtasks only</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showAlreadyImported}
                            onChange={(e) => setShowAlreadyImported(e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Show already imported</span>
                        </label>
                        {(jiraFilters.search || jiraFilters.status || jiraFilters.issueType || jiraFilters.priority || jiraFilters.showParentsOnly || jiraFilters.showSubtasksOnly || showAlreadyImported) && (
                          <button
                            onClick={() => {
                              setJiraFilters({
                                search: '',
                                status: '',
                                issueType: '',
                                priority: '',
                                showParentsOnly: false,
                                showSubtasksOnly: false
                              });
                              setShowAlreadyImported(false);
                            }}
                            className="ml-auto text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Clear all filters
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Issues List */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        Issues ({Array.from(selectedIssues).filter(key => !existingIssueIds.has(key)).length} new selected, {getSortedFilteredJiraIssues().length} shown of {jiraIssues.length} total)
                        {existingIssueIds.size > 0 && !showAlreadyImported && (
                          <span className="ml-2 text-sm text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">
                            {Array.from(jiraIssues.filter(issue => existingIssueIds.has(issue.key))).length} hidden (already imported)
                          </span>
                        )}
                        {existingIssueIds.size > 0 && showAlreadyImported && (
                          <span className="ml-2 text-sm text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded">
                            {getSortedFilteredJiraIssues().filter(issue => existingIssueIds.has(issue.key)).length} already imported
                          </span>
                        )}
                      </h3>
                      <button
                        onClick={() => {
                          const filtered = getSortedFilteredJiraIssues().filter(issue => !existingIssueIds.has(issue.key));
                          if (filtered.every(issue => selectedIssues.has(issue.key))) {
                            // Deselect all filtered (excluding already imported)
                            const newSelection = new Set(selectedIssues);
                            filtered.forEach(issue => newSelection.delete(issue.key));
                            setSelectedIssues(newSelection);
                          } else {
                            // Select all filtered (excluding already imported)
                            const newSelection = new Set(selectedIssues);
                            filtered.forEach(issue => newSelection.add(issue.key));
                            setSelectedIssues(newSelection);
                          }
                        }}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {getSortedFilteredJiraIssues().filter(issue => !existingIssueIds.has(issue.key)).every(issue => selectedIssues.has(issue.key)) ? 'Deselect All New' : 'Select All New'}
                      </button>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {getSortedFilteredJiraIssues().length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-gray-500 dark:text-gray-400">No issues match the current filters</p>
                          <button
                            onClick={() => {
                              setJiraFilters({
                                search: '',
                                status: '',
                                issueType: '',
                                priority: '',
                                showParentsOnly: false,
                                showSubtasksOnly: false
                              });
                              setShowAlreadyImported(true);
                            }}
                            className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Clear filters and show all
                          </button>
                        </div>
                      ) : getSortedFilteredJiraIssues().filter(issue => !existingIssueIds.has(issue.key)).length === 0 && !showAlreadyImported ? (
                        <div className="text-center py-8">
                          <div className="flex flex-col items-center">
                            <svg className="mx-auto h-12 w-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">All new issues already imported</h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                              All new issues matching your filters have already been imported as tasks.
                            </p>
                            <button
                              onClick={() => setShowAlreadyImported(true)}
                              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Show already imported issues
                            </button>
                          </div>
                        </div>
                      ) : (
                        getSortedFilteredJiraIssues().map(issue => {
                          const isParent = issue.subtasks && issue.subtasks.length > 0;
                          const isSubtask = issue.parentKey !== null;
                          const isAlreadyImported = existingIssueIds.has(issue.key);
                          
                          return (
                            <div
                              key={issue.key}
                              className={`border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                isSubtask ? 'ml-8' : ''
                              } ${isAlreadyImported ? 'opacity-60 bg-gray-50 dark:bg-gray-700/30' : ''}`}
                            >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedIssues.has(issue.key)}
                                onChange={() => toggleIssueSelection(issue.key)}
                                className="mt-1"
                                disabled={isAlreadyImported}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                                    {issue.key}
                                  </span>
                                  {isAlreadyImported && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                                      ✓ Already imported
                                    </span>
                                  )}
                                  <span className="text-xs px-2 py-0.5 rounded" style={{
                                    backgroundColor: issue.statusColor ? `${issue.statusColor}20` : '#e5e7eb',
                                    color: issue.statusColor || '#6b7280'
                                  }}>
                                    {issue.status}
                                  </span>
                                  {issue.priority && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
                                      {issue.priority}
                                    </span>
                                  )}
                                  {isParent && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                                      📁 {issue.subtasks.length} subtask{issue.subtasks.length !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                  {isSubtask && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                      ↳ Subtask of {issue.parentKey}
                                    </span>
                                  )}
                                  {isAlreadyImported && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                      ✓ Imported
                                    </span>
                                  )}
                                </div>
                                <p className={`font-medium text-sm mb-1 ${isAlreadyImported ? 'text-gray-600 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                                  {issue.summary}
                                </p>
                                {issue.description && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                    {issue.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedIssues.size > 0 ? (
                    <>
                      <span className="font-semibold">{Array.from(selectedIssues).filter(key => !existingIssueIds.has(key)).length}</span> new issue{Array.from(selectedIssues).filter(key => !existingIssueIds.has(key)).length !== 1 ? 's' : ''} will be imported as task{Array.from(selectedIssues).filter(key => !existingIssueIds.has(key)).length !== 1 ? 's' : ''}
                      {existingIssueIds.size > 0 && ` (${existingIssueIds.size} already imported in project)`}
                    </>
                  ) : (
                    `Select new issues to import (${existingIssueIds.size > 0 ? `${existingIssueIds.size} already imported issues are hidden by default` : 'no duplicates will be created'})`
                  )}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowJiraImportModal(false)}
                    className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleJiraImport}
                    disabled={jiraLoading || selectedIssues.size === 0 || Array.from(selectedIssues).every(key => existingIssueIds.has(key))}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {jiraLoading ? 'Importing...' : `Import ${Array.from(selectedIssues).filter(key => !existingIssueIds.has(key)).length} New Task${Array.from(selectedIssues).filter(key => !existingIssueIds.has(key)).length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GitHub Import Modal */}
      {showGitHubImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  Import Tasks from GitHub
                </h2>
                <button
                  onClick={() => setShowGitHubImportModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {gitHubError && (
                <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
                  {gitHubError}
                </div>
              )}

              {gitHubLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-800 mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading GitHub issues...</p>
                  </div>
                </div>
              ) : gitHubIssues.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No GitHub issues found</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Make sure your GitHub integration is configured and the repository has issues.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Status Mapping Section */}
                  {taskStatuses.length > 0 && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">📍 Status Mapping</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Map GitHub issue states to your project's task statuses:
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {['open', 'closed'].map((state) => (
                          <div key={state} className="flex items-center gap-2">
                            <span className="capitalize font-medium text-gray-700 dark:text-gray-300 min-w-20">
                              {state}:
                            </span>
                            <select
                              value={gitHubStatusMapping[state] || ''}
                              onChange={(e) => setGitHubStatusMapping(prev => ({
                                ...prev,
                                [state]: e.target.value
                              }))}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                              <option value="">Select status...</option>
                              {taskStatuses.map((status) => (
                                <option key={status.Id} value={status.Id}>
                                  {status.StatusName}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Filters Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Search
                      </label>
                      <input
                        type="text"
                        value={gitHubFilters.search}
                        onChange={(e) => setGitHubFilters(prev => ({ ...prev, search: e.target.value }))}
                        placeholder="Title, body, or number..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        State
                      </label>
                      <select
                        value={gitHubFilters.state}
                        onChange={(e) => setGitHubFilters(prev => ({ ...prev, state: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">All States</option>
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <button
                          onClick={() => loadGitHubIssues()}
                          className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg transition-colors flex items-center gap-2"
                          disabled={gitHubLoading}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Refresh
                        </button>
                      </div>
                    </div>

                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <input
                          type="checkbox"
                          checked={showAlreadyImportedGitHub}
                          onChange={(e) => setShowAlreadyImportedGitHub(e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Show already imported
                      </label>
                    </div>
                  </div>

                  {/* Issues List */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={getFilteredGitHubIssues().length > 0 && selectedGitHubIssues.size === getFilteredGitHubIssues().filter(issue => !existingGitHubIssueIds.has(issue.number?.toString())).length}
                            onChange={toggleAllGitHubIssues}
                            disabled={getFilteredGitHubIssues().filter(issue => !existingGitHubIssueIds.has(issue.number?.toString())).length === 0}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          Select All Available
                        </label>
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {getFilteredGitHubIssues().length} issue{getFilteredGitHubIssues().length !== 1 ? 's' : ''}
                        {existingGitHubIssueIds.size > 0 && ` (${existingGitHubIssueIds.size} already imported)`}
                      </span>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      {getFilteredGitHubIssues().map((issue: any) => {
                        const isAlreadyImported = existingGitHubIssueIds.has(issue.number?.toString());
                        const isSelected = selectedGitHubIssues.has(issue.number?.toString());
                        
                        return (
                          <div
                            key={issue.id}
                            className={`p-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${
                              isAlreadyImported 
                                ? 'bg-gray-100 dark:bg-gray-700/50 opacity-60' 
                                : isSelected 
                                  ? 'bg-blue-50 dark:bg-blue-900/20' 
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                            } transition-colors`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleGitHubIssueSelection(issue.number?.toString())}
                                disabled={isAlreadyImported}
                                className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                              />
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                                    #{issue.number} - {issue.title}
                                  </h4>
                                  {isAlreadyImported && (
                                    <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 rounded-full">
                                      Already Imported
                                    </span>
                                  )}
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    issue.state === 'open' 
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                      : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                  }`}>
                                    {issue.state}
                                  </span>
                                  {issue.labels?.length > 0 && (
                                    <div className="flex gap-1">
                                      {issue.labels.slice(0, 3).map((label: any) => (
                                        <span
                                          key={label.name}
                                          className="px-2 py-1 text-xs rounded-full text-white"
                                          style={{ backgroundColor: `#${label.color}` }}
                                        >
                                          {label.name}
                                        </span>
                                      ))}
                                      {issue.labels.length > 3 && (
                                        <span className="px-2 py-1 text-xs bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300 rounded-full">
                                          +{issue.labels.length - 3}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                
                                {issue.body && (
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                                    {issue.body.substring(0, 200)}...
                                  </p>
                                )}
                                
                                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                  <span>👤 {issue.authorName || issue.author}</span>
                                  {issue.assigneeName && <span>📋 Assigned: {issue.assigneeName}</span>}
                                  <span>📅 {new Date(issue.created_at).toLocaleDateString()}</span>
                                  <a
                                    href={issue.html_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                                  >
                                    View on GitHub ↗
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedGitHubIssues.size > 0 ? (
                    <>
                      <span className="font-semibold">{Array.from(selectedGitHubIssues).filter(id => !existingGitHubIssueIds.has(id)).length}</span> new issue{Array.from(selectedGitHubIssues).filter(id => !existingGitHubIssueIds.has(id)).length !== 1 ? 's' : ''} will be imported as task{Array.from(selectedGitHubIssues).filter(id => !existingGitHubIssueIds.has(id)).length !== 1 ? 's' : ''}
                      {existingGitHubIssueIds.size > 0 && ` (${existingGitHubIssueIds.size} already imported in project)`}
                    </>
                  ) : (
                    `Select new issues to import (${existingGitHubIssueIds.size > 0 ? `${existingGitHubIssueIds.size} already imported issues are hidden by default` : 'no duplicates will be created'})`
                  )}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowGitHubImportModal(false)}
                    className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGitHubImport}
                    disabled={gitHubLoading || selectedGitHubIssues.size === 0 || Array.from(selectedGitHubIssues).every(id => existingGitHubIssueIds.has(id))}
                    className="px-6 py-2 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {gitHubLoading ? 'Importing...' : `Import ${Array.from(selectedGitHubIssues).filter(id => !existingGitHubIssueIds.has(id)).length} New Task${Array.from(selectedGitHubIssues).filter(id => !existingGitHubIssueIds.has(id)).length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gitea Import Modal */}
      {showGiteaImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="text-3xl">🍵</span>
                  Import Tasks from Gitea
                </h2>
                <button
                  onClick={() => setShowGiteaImportModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {giteaError && (
                <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
                  {giteaError}
                </div>
              )}

              {giteaLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading Gitea issues...</p>
                  </div>
                </div>
              ) : giteaIssues.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No Gitea issues found</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Make sure your Gitea integration is configured and the repository has issues.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Status Mapping Section */}
                  {taskStatuses.length > 0 && (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">📍 Status Mapping</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Map Gitea issue states to your project's task statuses. Auto-mapped by default.
                      </p>
                      <div className="grid grid-cols-1 gap-3">
                        {giteaIssues.length > 0 && Array.from(new Set(giteaIssues.map(issue => issue.state))).map((state) => (
                          <div key={state} className="flex items-center gap-2">
                            <span className="capitalize font-medium text-gray-700 dark:text-gray-300 min-w-24">
                              {state}:
                            </span>
                            <select
                              value={giteaStatusMapping[state] || ''}
                              onChange={(e) => setGiteaStatusMapping(prev => ({
                                ...prev,
                                [state]: e.target.value
                              }))}
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                              <option value="">Select status...</option>
                              {taskStatuses.map((status) => (
                                <option key={status.Id} value={status.StatusName}>
                                  {status.StatusName}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Filters Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Search
                      </label>
                      <input
                        type="text"
                        value={giteaFilters.search}
                        onChange={(e) => setGiteaFilters(prev => ({ ...prev, search: e.target.value }))}
                        placeholder="Title, body, or number..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        State
                      </label>
                      <select
                        value={giteaFilters.state}
                        onChange={(e) => setGiteaFilters(prev => ({ ...prev, state: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">All States</option>
                        <option value="open">Open</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Type
                      </label>
                      <select
                        value={giteaFilters.type}
                        onChange={(e) => setGiteaFilters(prev => ({ ...prev, type: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Issues & PRs</option>
                        <option value="issues">Issues Only</option>
                        <option value="pulls">Pull Requests Only</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        onClick={() => loadGiteaIssues()}
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                        disabled={giteaLoading}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                      </button>
                    </div>
                  </div>

                  {/* Show Already Imported Checkbox */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="showAlreadyImportedGitea"
                      checked={showAlreadyImportedGitea}
                      onChange={(e) => setShowAlreadyImportedGitea(e.target.checked)}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <label htmlFor="showAlreadyImportedGitea" className="text-sm text-gray-600 dark:text-gray-400">
                      Show already imported issues
                    </label>
                  </div>

                  {/* Issues List */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={getFilteredGiteaIssues().length > 0 && selectedGiteaIssues.size === getFilteredGiteaIssues().filter(issue => !existingGiteaIssueIds.has(issue.number?.toString())).length}
                            onChange={toggleAllGiteaIssues}
                            disabled={getFilteredGiteaIssues().filter(issue => !existingGiteaIssueIds.has(issue.number?.toString())).length === 0}
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          Select All Available
                        </label>
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {getFilteredGiteaIssues().length} issue{getFilteredGiteaIssues().length !== 1 ? 's' : ''}
                        {existingGiteaIssueIds.size > 0 && ` (${existingGiteaIssueIds.size} already imported)`}
                      </span>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      {getFilteredGiteaIssues().map((issue: any) => {
                        const isAlreadyImported = existingGiteaIssueIds.has(issue.number?.toString());
                        const isSelected = selectedGiteaIssues.has(issue.number?.toString());
                        const isPullRequest = issue.pull_request !== undefined && issue.pull_request !== null;
                        
                        return (
                          <div
                            key={issue.id}
                            className={`p-4 border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${
                              isAlreadyImported 
                                ? 'bg-gray-100 dark:bg-gray-700/50 opacity-60' 
                                : isSelected 
                                  ? 'bg-green-50 dark:bg-green-900/20' 
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                            } transition-colors`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleGiteaIssueSelection(issue.number?.toString())}
                                disabled={isAlreadyImported}
                                className="mt-1 rounded border-gray-300 text-green-600 focus:ring-green-500 disabled:opacity-50"
                              />
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                                    #{issue.number} - {issue.title}
                                  </h4>
                                  {isAlreadyImported && (
                                    <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 rounded-full">
                                      Already Imported
                                    </span>
                                  )}
                                  {isPullRequest && (
                                    <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 rounded-full">
                                      Pull Request
                                    </span>
                                  )}
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    issue.state === 'open' 
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                  }`}>
                                    {issue.state}
                                  </span>
                                  {issue.labels?.length > 0 && (
                                    <div className="flex gap-1 flex-wrap">
                                      {issue.labels.slice(0, 3).map((label: any) => (
                                        <span
                                          key={label.name}
                                          className="px-2 py-1 text-xs rounded-full text-white"
                                          style={{ backgroundColor: `#${label.color}` }}
                                        >
                                          {label.name}
                                        </span>
                                      ))}
                                      {issue.labels.length > 3 && (
                                        <span className="px-2 py-1 text-xs bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300 rounded-full">
                                          +{issue.labels.length - 3}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                
                                {issue.body && (
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                                    {issue.body.substring(0, 200)}{issue.body.length > 200 ? '...' : ''}
                                  </p>
                                )}
                                
                                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                                  <span>👤 {issue.user?.login || issue.authorName || issue.author}</span>
                                  {issue.assignee && <span>📋 Assigned: {issue.assignee.login}</span>}
                                  <span>📅 {new Date(issue.created_at).toLocaleDateString()}</span>
                                  {issue.html_url && (
                                    <a
                                      href={issue.html_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      View on Gitea ↗
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedGiteaIssues.size > 0 ? (
                    <>
                      <span className="font-semibold">{Array.from(selectedGiteaIssues).filter(id => !existingGiteaIssueIds.has(id)).length}</span> new issue{Array.from(selectedGiteaIssues).filter(id => !existingGiteaIssueIds.has(id)).length !== 1 ? 's' : ''} will be imported as task{Array.from(selectedGiteaIssues).filter(id => !existingGiteaIssueIds.has(id)).length !== 1 ? 's' : ''}
                      {existingGiteaIssueIds.size > 0 && ` (${existingGiteaIssueIds.size} already imported in project)`}
                    </>
                  ) : (
                    `Select new issues to import (${existingGiteaIssueIds.size > 0 ? `${existingGiteaIssueIds.size} already imported issues are hidden by default` : 'no duplicates will be created'})`
                  )}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowGiteaImportModal(false)}
                    className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGiteaImport}
                    disabled={giteaLoading || selectedGiteaIssues.size === 0 || Array.from(selectedGiteaIssues).every(id => existingGiteaIssueIds.has(id))}
                    className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {giteaLoading ? 'Importing...' : `Import ${Array.from(selectedGiteaIssues).filter(id => !existingGiteaIssueIds.has(id)).length} New Task${Array.from(selectedGiteaIssues).filter(id => !existingGiteaIssueIds.has(id)).length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
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
              
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">📄 CSV Format</h3>
                <p className="text-sm text-blue-800 dark:text-blue-400 mb-2">
                  Your CSV should have the following columns (header required):
                </p>
                <code className="text-xs bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded block overflow-x-auto">
                  ProjectId,TaskName,Description,Status,Priority,AssignedToUsername,DueDate,EstimatedHours,ParentTaskName,PlannedStartDate,PlannedEndDate,DependsOnTaskName
                </code>
                <p className="text-sm text-blue-800 dark:text-blue-400 mt-2">
                  <a href="/templates/tasks_import_template.csv" download className="underline hover:text-blue-600 dark:hover:text-blue-200">Download template CSV</a>
                  {' | '}
                  <a href="/templates/README_TASKS_IMPORT.md" target="_blank" className="underline hover:text-blue-600 dark:hover:text-blue-200">Read documentation</a>
                </p>
              </div>

              {/* File Upload */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select CSV File</label>
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
                <div className="mb-5">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Preview (first 5 rows)</h3>
                  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Task Name</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Assigned To</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Status (CSV)</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Priority (CSV)</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Estimated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {importPreview.map((row, idx) => (
                          <tr key={idx} className="bg-white dark:bg-gray-800">
                            <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{row.TaskName}</td>
                            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.AssignedToUsername || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.Status || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.Priority || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.EstimatedHours || '-'}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status Mapping */}
              {csvUniqueStatuses.length > 0 && importAvailStatuses.length > 0 && (
                <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">🔀 Status Mapping</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Map each status value from your CSV to an existing project status. Unmapped values will be left blank.
                  </p>
                  <div className="space-y-2">
                    {csvUniqueStatuses.map(csvVal => (
                      <div key={csvVal} className="flex items-center gap-3">
                        <span className="w-40 text-sm font-medium text-gray-700 dark:text-gray-300 truncate" title={csvVal}>
                          <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs">{csvVal}</span>
                        </span>
                        <span className="text-gray-400">→</span>
                        <select
                          value={importStatusMapping[csvVal] || ''}
                          onChange={e => setImportStatusMapping(prev => ({ ...prev, [csvVal]: e.target.value }))}
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="">— skip / leave blank —</option>
                          {importAvailStatuses.map(s => (
                            <option key={s.Id} value={String(s.Id)}>
                              {s.StatusName}
                            </option>
                          ))}
                        </select>
                        {importStatusMapping[csvVal] ? (
                          <span className="text-green-500 text-sm">✓</span>
                        ) : (
                          <span className="text-gray-400 text-sm">○</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Priority Mapping */}
              {csvUniquePriorities.length > 0 && importAvailPriorities.length > 0 && (
                <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">🎯 Priority Mapping</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Map each priority value from your CSV to an existing project priority. Unmapped values will be left blank.
                  </p>
                  <div className="space-y-2">
                    {csvUniquePriorities.map(csvVal => (
                      <div key={csvVal} className="flex items-center gap-3">
                        <span className="w-40 text-sm font-medium text-gray-700 dark:text-gray-300 truncate" title={csvVal}>
                          <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs">{csvVal}</span>
                        </span>
                        <span className="text-gray-400">→</span>
                        <select
                          value={importPriorityMapping[csvVal] || ''}
                          onChange={e => setImportPriorityMapping(prev => ({ ...prev, [csvVal]: e.target.value }))}
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="">— skip / leave blank —</option>
                          {importAvailPriorities.map(p => (
                            <option key={p.Id} value={String(p.Id)}>
                              {p.PriorityName || p.StatusName}
                            </option>
                          ))}
                        </select>
                        {importPriorityMapping[csvVal] ? (
                          <span className="text-green-500 text-sm">✓</span>
                        ) : (
                          <span className="text-gray-400 text-sm">○</span>
                        )}
                      </div>
                    ))}
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
  const openTickets = tickets.filter(t => t.StatusIsClosed === 0).length;
  const resolvedTickets = tickets.filter(t => t.StatusIsClosed === 1).length;
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
            <div 
              className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: project.Description }}
            />
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

      {/* Budget Tracking */}
      {project.Budget !== null && project.Budget !== undefined && project.Budget > 0 && (() => {
        const budgetSpent = Number(project.BudgetSpent || 0);
        const budgetTotal = Number(project.Budget);
        const budgetRemaining = budgetTotal - budgetSpent;
        const budgetPct = Math.min(100, Math.round((budgetSpent / budgetTotal) * 100));
        const barColor = budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-500' : 'bg-green-500';
        const textColor = budgetPct >= 100 ? 'text-red-600 dark:text-red-400' : budgetPct >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400';
        return (
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">💰 Budget</h2>
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                <span>Spent: <span className={`font-semibold ${textColor}`}>${budgetSpent.toFixed(2)}</span></span>
                <span className="font-semibold">{budgetPct}%</span>
                <span>Total: <span className="font-semibold text-gray-900 dark:text-white">${budgetTotal.toFixed(2)}</span></span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div className={`${barColor} h-3 rounded-full transition-all`} style={{ width: `${budgetPct}%` }}></div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Budget</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">${budgetTotal.toFixed(2)}</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Spent</div>
                <div className={`text-lg font-bold ${textColor}`}>${budgetSpent.toFixed(2)}</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Remaining</div>
                <div className={`text-lg font-bold ${budgetRemaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>${budgetRemaining.toFixed(2)}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* RAG Health Score */}
      {(() => {
        const budgetSpent = Number(project.BudgetSpent || 0);
        const budgetTotal = Number(project.Budget) || 0;
        const budgetPct = budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 100) : 0;
        const totalTasks = tasks.length;
        const today2 = new Date(); today2.setHours(0, 0, 0, 0);
        const projectEndDate = project.EndDate ? new Date(project.EndDate) : null;

        let ragStatus: 'red' | 'amber' | 'green' = 'green';
        const ragReasons: string[] = [];

        // Closed/cancelled → always green
        if (!project.StatusIsClosed && !project.StatusIsCancelled) {
          // RED
          if (overdueTasks.length > 2) { ragStatus = 'red'; ragReasons.push(`${overdueTasks.length} overdue tasks`); }
          if (budgetTotal > 0 && budgetPct >= 100) { ragStatus = 'red'; ragReasons.push('Budget exceeded'); }
          if (projectEndDate && projectEndDate < today2) { ragStatus = 'red'; ragReasons.push('Past end date'); }

          if (ragStatus !== 'red') {
            // AMBER
            if (overdueTasks.length > 0) { ragStatus = 'amber'; ragReasons.push(`${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`); }
            if (budgetTotal > 0 && budgetPct >= 80) { ragStatus = 'amber'; ragReasons.push(`Budget at ${budgetPct}%`); }
            if (totalTasks > 0 && unassignedTasks.length > totalTasks * 0.3) { ragStatus = 'amber'; ragReasons.push(`${unassignedTasks.length} unassigned tasks`); }
            if (projectEndDate) {
              const daysLeft = Math.ceil((projectEndDate.getTime() - today2.getTime()) / 86400000);
              if (daysLeft > 0 && daysLeft <= 7) { ragStatus = 'amber'; ragReasons.push(`Due in ${daysLeft}d`); }
            }
          }
        }

        const ragConfig = {
          red:   { label: '🔴 Red',   bg: 'bg-red-50 dark:bg-red-900/20',     border: 'border-red-200 dark:border-red-800',     badge: 'bg-red-500',     text: 'text-red-700 dark:text-red-300',     desc: 'Immediate action required' },
          amber: { label: '🟡 Amber', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-500',   text: 'text-amber-700 dark:text-amber-300', desc: 'Needs attention' },
          green: { label: '🟢 Green', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', badge: 'bg-green-500',   text: 'text-green-700 dark:text-green-300', desc: 'On track' },
        };
        const cfg = ragConfig[ragStatus];

        return (
          <div className={`${cfg.bg} border ${cfg.border} p-5 rounded-lg`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-5 h-5 rounded-full ${cfg.badge} inline-block flex-shrink-0`}></span>
                <div>
                  <span className={`font-bold text-lg ${cfg.text}`}>{cfg.label} — {cfg.desc}</span>
                  {ragReasons.length > 0 && (
                    <p className={`text-sm mt-0.5 ${cfg.text} opacity-80`}>{ragReasons.join(' · ')}</p>
                  )}
                  {ragReasons.length === 0 && (
                    <p className={`text-sm mt-0.5 ${cfg.text} opacity-80`}>No issues detected</p>
                  )}
                </div>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Project Health</span>
            </div>
          </div>
        );
      })()}

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
  project,
  jiraIntegration,
  onCreateTask,
  onEditTask,
  onDeleteTask,
  onImportClick,
  onImportFromJira,
  onImportFromGitHub,
  onImportFromGitea,
  canCreate,
  canManage,
  canDelete,
  token,
}: {
  tasks: Task[];
  project: Project;
  jiraIntegration: any;
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: number) => void;
  onImportClick: () => void;
  onImportFromJira: () => void;
  onImportFromGitHub: () => void;
  onImportFromGitea: () => void;
  canCreate: boolean;
  canManage: boolean;
  canDelete: boolean;
  token: string;
}) {
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [showImportDropdown, setShowImportDropdown] = useState(false);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [showTemplateSaveModal, setShowTemplateSaveModal] = useState(false);
  const [showTemplateApplyModal, setShowTemplateApplyModal] = useState(false);

  // Check which integrations are configured
  const hasJiraIntegration = jiraIntegration?.IsEnabled && jiraIntegration?.JiraUrl;
  const hasGitHubIntegration = project.GitHubOwner && project.GitHubRepo;
  const hasGiteaIntegration = project.GiteaOwner && project.GiteaRepo;

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
              {task.Description && (() => {
                const plainText = task.Description.replace(/<[^>]*>/g, '').trim();
                return plainText ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {plainText.substring(0, level > 0 ? 60 : 100)}
                    {plainText.length > (level > 0 ? 60 : 100) ? '...' : ''}
                  </div>
                ) : null;
              })()}
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
              {/* Import Dropdown - always visible, CSV always available */}
              <div className="relative">
                <button
                  onClick={() => setShowImportDropdown(!showImportDropdown)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors font-medium flex items-center gap-2"
                >
                  <span className="text-xl">📥</span>
                  Import Tasks
                  <svg className={`w-4 h-4 transition-transform ${showImportDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showImportDropdown && (
                  <>
                    {/* Backdrop to close dropdown */}
                    <div className="fixed inset-0 z-10" onClick={() => setShowImportDropdown(false)}></div>
                    
                    {/* Dropdown menu */}
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20">
                      <div className="py-2">
                        {/* CSV Import - always available */}
                        <button
                          onClick={() => {
                            onImportClick();
                            setShowImportDropdown(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                        >
                          <span className="text-xl">📥</span>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">Import CSV</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Upload tasks from file</div>
                          </div>
                        </button>
                        
                        {/* Jira Import - only if configured */}
                        {hasJiraIntegration && (
                          <button
                            onClick={() => {
                              onImportFromJira();
                              setShowImportDropdown(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                          >
                            <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
                            </svg>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">Import from Jira</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Sync Jira issues</div>
                            </div>
                          </button>
                        )}
                        
                        {/* GitHub Import - only if configured */}
                        {hasGitHubIntegration && (
                          <button
                            onClick={() => {
                              onImportFromGitHub();
                              setShowImportDropdown(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                          >
                            <svg className="w-5 h-5 text-gray-800 dark:text-gray-200" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">Import from GitHub</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Sync GitHub issues</div>
                            </div>
                          </button>
                        )}
                        
                        {/* Gitea Import - only if configured */}
                        {hasGiteaIntegration && (
                          <button
                            onClick={() => {
                              onImportFromGitea();
                              setShowImportDropdown(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                          >
                            <span className="text-xl">🍵</span>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">Import from Gitea</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Sync Gitea issues</div>
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              <button
                onClick={onCreateTask}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors font-medium flex items-center gap-2"
              >
                <span className="text-xl">+</span>
                New Task
              </button>
              {/* Template Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-lg transition-colors font-medium flex items-center gap-2"
                >
                  <span className="text-xl">📋</span>
                  Templates
                  <svg className={`w-4 h-4 transition-transform ${showTemplateDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showTemplateDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowTemplateDropdown(false)}></div>
                    <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20">
                      <div className="py-2">
                        <button
                          onClick={() => { setShowTemplateApplyModal(true); setShowTemplateDropdown(false); }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                        >
                          <span className="text-lg">📥</span>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white text-sm">Apply Template</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Create tasks from a template</div>
                          </div>
                        </button>
                        <button
                          onClick={() => { setShowTemplateSaveModal(true); setShowTemplateDropdown(false); }}
                          className="w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-3"
                        >
                          <span className="text-lg">💾</span>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white text-sm">Save as Template</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Save these tasks as reusable template</div>
                          </div>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
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

      {/* ── Template Modals ── */}
      {showTemplateSaveModal && (
        <SaveTemplateModal
          projectId={parseInt(String(project.Id))}
          organizationId={project.OrganizationId}
          tasks={tasks}
          token={token}
          onClose={() => setShowTemplateSaveModal(false)}
        />
      )}
      {showTemplateApplyModal && (
        <ApplyTemplateModal
          projectId={parseInt(String(project.Id))}
          organizationId={project.OrganizationId}
          token={token}
          onClose={() => setShowTemplateApplyModal(false)}
          onApplied={() => { setShowTemplateApplyModal(false); window.location.reload(); }}
        />
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
  // Local copy of tasks for optimistic drag-and-drop ordering
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const draggedTaskId = useRef<number | null>(null);

  // Sync when parent refreshes tasks
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

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

  const getTasksByStatus = (statusId: number) => {
    return localTasks.filter(t => t.Status === statusId).sort((a, b) => a.DisplayOrder - b.DisplayOrder);
  };

  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    e.dataTransfer.setData('taskId', taskId.toString());
    e.dataTransfer.effectAllowed = 'move';
    draggedTaskId.current = taskId;
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

  // Drop onto a specific task card — reorder within column (or move + reorder cross-column)
  const handleDropOnTask = async (e: React.DragEvent, targetTask: Task) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverTask(null);

    const srcId = parseInt(e.dataTransfer.getData('taskId'));
    if (!srcId || srcId === targetTask.Id) return;

    const srcTask = localTasks.find(t => t.Id === srcId);
    if (!srcTask) return;

    const newStatus = targetTask.Status;

    // Build the new ordered list for the target column
    const columnTasks = localTasks
      .filter(t => t.Status === newStatus && t.Id !== srcId)
      .sort((a, b) => a.DisplayOrder - b.DisplayOrder);

    const targetIdx = columnTasks.findIndex(t => t.Id === targetTask.Id);
    columnTasks.splice(targetIdx, 0, { ...srcTask, Status: newStatus });

    // Assign clean gap-based display orders (10, 20, 30, …)
    const updates = columnTasks.map((t, i) => ({
      taskId: t.Id,
      displayOrder: (i + 1) * 10,
      status: newStatus ?? undefined,
    }));

    // Optimistic local update
    const prev = localTasks;
    setLocalTasks(current => {
      const others = current.filter(t => t.Status !== newStatus || (t.Status === srcTask.Status && newStatus !== srcTask.Status));
      const updated = columnTasks.map((t, i) => ({ ...t, Status: newStatus, DisplayOrder: (i + 1) * 10 }));
      return [...current.filter(t => t.Status !== newStatus && t.Id !== srcId), ...updated];
    });

    try {
      await tasksApi.reorderKanban(updates, token);
      // Only trigger full reload if status changed (so other views stay accurate)
      if (srcTask.Status !== newStatus) onTaskUpdated();
    } catch (err) {
      console.error('Failed to reorder tasks:', err);
      setLocalTasks(prev); // rollback
      onTaskUpdated();
    }
  };

  // Drop onto empty column area — move card to end of that column
  const handleDrop = async (e: React.DragEvent, newStatusId: number) => {
    e.preventDefault();
    setDraggedOverTask(null);

    const srcId = parseInt(e.dataTransfer.getData('taskId'));
    const srcTask = localTasks.find(t => t.Id === srcId);
    if (!srcTask || srcTask.Status === newStatusId) return;

    const colTasks = localTasks
      .filter(t => t.Status === newStatusId)
      .sort((a, b) => a.DisplayOrder - b.DisplayOrder);

    const newOrder = (colTasks.length + 1) * 10;

    // Optimistic local update
    const prev = localTasks;
    setLocalTasks(current =>
      current.map(t => t.Id === srcId ? { ...t, Status: newStatusId, DisplayOrder: newOrder } : t)
    );

    try {
      await tasksApi.reorderKanban([{ taskId: srcId, displayOrder: newOrder, status: newStatusId }], token);
      onTaskUpdated();
    } catch (err) {
      console.error('Failed to move task:', err);
      setLocalTasks(prev);
      onTaskUpdated();
    }
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
                    
                    {task.Description && (() => {
                      const plainText = task.Description.replace(/<[^>]*>/g, '').trim();
                      return plainText ? (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                          {plainText}
                        </p>
                      ) : null;
                    })()}

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

                    {/* Assignees */}
                    {(task.Assignees && task.Assignees.length > 0) ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {task.Assignees.map((a: any) => (
                          <span key={a.UserId} className="inline-flex items-center text-xs text-gray-600 dark:text-gray-400">
                            👤 {a.Username}
                          </span>
                        ))}
                      </div>
                    ) : task.AssigneeName ? (
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        👤 {task.AssigneeName}
                      </div>
                    ) : null}

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
  const [reportTab, setReportTab] = useState<'summary' | 'byUser' | 'allocations' | 'timeEntries' | 'schedules'>('summary');
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

  // Report schedule state
  const [schedules, setSchedules] = useState<any[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    frequency: 'weekly' as 'weekly' | 'monthly',
    dayOfWeek: 1,
    dayOfMonth: 1,
    recipients: '',
    includeTaskTable: true,
    includeTimeEntries: true,
    includeBudget: true,
    isEnabled: true,
  });
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [sendingNow, setSendingNow] = useState<number | null>(null);
  const [confirmDeleteSchedule, setConfirmDeleteSchedule] = useState<number | null>(null);

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
    } else if (reportTab === 'schedules') {
      loadSchedules();
    } else {
      loadTimeEntries();
    }
  }, [reportTab, projectId]);

  // ── Schedule helpers ─────────────────────────────────────────────────────────

  const loadSchedules = async () => {
    setSchedulesLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/project-report-schedules/project/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setSchedules(data.schedules || []);
    } catch {
      // silently fail
    } finally {
      setSchedulesLoading(false);
    }
  };

  const openNewSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm({ frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, recipients: '', includeTaskTable: true, includeTimeEntries: true, includeBudget: true, isEnabled: true });
    setScheduleError('');
    setShowScheduleModal(true);
  };

  const openEditSchedule = (s: any) => {
    setEditingSchedule(s);
    setScheduleForm({
      frequency: s.Frequency,
      dayOfWeek: s.DayOfWeek ?? 1,
      dayOfMonth: s.DayOfMonth ?? 1,
      recipients: s.Recipients || '',
      includeTaskTable: Boolean(s.IncludeTaskTable),
      includeTimeEntries: Boolean(s.IncludeTimeEntries),
      includeBudget: Boolean(s.IncludeBudget),
      isEnabled: Boolean(s.IsEnabled),
    });
    setScheduleError('');
    setShowScheduleModal(true);
  };

  const saveSchedule = async () => {
    if (!scheduleForm.recipients.trim()) {
      setScheduleError('At least one recipient email is required.');
      return;
    }
    setScheduleSaving(true);
    setScheduleError('');
    try {
      const body = {
        projectId,
        frequency: scheduleForm.frequency,
        dayOfWeek: scheduleForm.frequency === 'weekly' ? scheduleForm.dayOfWeek : null,
        dayOfMonth: scheduleForm.frequency === 'monthly' ? scheduleForm.dayOfMonth : null,
        recipients: scheduleForm.recipients,
        includeTaskTable: scheduleForm.includeTaskTable,
        includeTimeEntries: scheduleForm.includeTimeEntries,
        includeBudget: scheduleForm.includeBudget,
        isEnabled: scheduleForm.isEnabled,
      };
      const url = editingSchedule
        ? `${getApiUrl()}/api/project-report-schedules/${editingSchedule.Id}`
        : `${getApiUrl()}/api/project-report-schedules`;
      const res = await fetch(url, {
        method: editingSchedule ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save schedule');
      setShowScheduleModal(false);
      await loadSchedules();
    } catch (err: any) {
      setScheduleError(err.message);
    } finally {
      setScheduleSaving(false);
    }
  };

  const deleteSchedule = async (id: number) => {
    try {
      await fetch(`${getApiUrl()}/api/project-report-schedules/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadSchedules();
    } catch {
      // silently fail
    } finally {
      setConfirmDeleteSchedule(null);
    }
  };

  const sendNow = async (id: number) => {
    setSendingNow(id);
    try {
      const res = await fetch(`${getApiUrl()}/api/project-report-schedules/${id}/send-now`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      showAlert('Report Sent', data.message || 'Report sent successfully');
      await loadSchedules();
    } catch (err: any) {
      showAlert('Error', err.message || 'Failed to send report');
    } finally {
      setSendingNow(null);
    }
  };

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

  const handleDownloadAttachment = async (attachmentId: number) => {
    if (!token) return;
    
    try {
      const attachment = await getTaskAttachment(attachmentId, token);
      
      // Create blob from base64
      const byteCharacters = atob(attachment.FileData || '');
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.FileType });
      
      // Download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.FileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      showAlert('Download Failed', err.message || 'Failed to download attachment');
    }
  };

  const handlePreviewAttachment = async (attachmentId: number) => {
    if (!token) return;
    
    try {
      const attachment = await getTaskAttachment(attachmentId, token);
      
      // Create blob from base64
      const byteCharacters = atob(attachment.FileData || '');
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.FileType });
      
      // Open in new tab
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      
      // Clean up URL after a delay
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      showAlert('Preview Failed', err.message || 'Failed to preview attachment');
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
          <button
            onClick={() => setReportTab('schedules')}
            className={`pb-3 px-4 font-medium transition-colors border-b-2 ${
              reportTab === 'schedules'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            📅 Scheduled Reports
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
                  <div 
                    className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
                    dangerouslySetInnerHTML={{ __html: selectedTask.Description }}
                  />
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
                          <div
                            className="text-gray-700 dark:text-gray-300 mt-1 prose prose-sm dark:prose-invert max-w-none"
                            dangerouslySetInnerHTML={{ __html: comment.Comment }}
                          />
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
                    {taskAttachments.map((attachment: any) => {
                      const canPreview = attachment.FileType.startsWith('image/') || attachment.FileType === 'application/pdf';
                      return (
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
                        <div className="flex items-center gap-2">
                          {canPreview && (
                            <button
                              onClick={() => handlePreviewAttachment(attachment.Id)}
                              className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                              title="Preview"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => handleDownloadAttachment(attachment.Id)}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                            title="Download"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteAttachment(attachment.Id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                    })}
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

      {/* Scheduled Reports Tab */}
      {reportTab === 'schedules' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Scheduled Reports</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Automatically send PDF project reports via email on a weekly or monthly basis.
              </p>
            </div>
            <button
              onClick={openNewSchedule}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
            >
              + New Schedule
            </button>
          </div>

          {schedulesLoading ? (
            <div className="text-gray-500 dark:text-gray-400">Loading schedules…</div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="text-4xl mb-4">📅</div>
              <p className="text-gray-500 dark:text-gray-400">No scheduled reports yet.</p>
              <button onClick={openNewSchedule} className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                Create First Schedule
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {schedules.map(s => (
                <div key={s.Id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          s.Frequency === 'weekly'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                        }`}>
                          {s.Frequency === 'weekly' ? '📆 Weekly' : '🗓 Monthly'}
                        </span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          s.IsEnabled
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {s.IsEnabled ? '✅ Enabled' : '⏸ Disabled'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                        <strong>Sends:</strong>{' '}
                        {s.Frequency === 'weekly'
                          ? `Every ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][s.DayOfWeek ?? 1]}`
                          : `On the ${s.DayOfMonth ?? 1}${[,'st','nd','rd'][s.DayOfMonth] || 'th'} of each month`}
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                        <strong>Recipients:</strong> {s.Recipients || '—'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Includes:{' '}
                        {[s.IncludeTaskTable && 'Task table', s.IncludeTimeEntries && 'Time entries', s.IncludeBudget && 'Budget'].filter(Boolean).join(', ') || 'Nothing selected'}
                        {s.LastSentAt ? ` · Last sent: ${new Date(s.LastSentAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}` : ' · Never sent'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => sendNow(s.Id)}
                        disabled={sendingNow === s.Id}
                        className="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50"
                        title="Send report now (for testing)"
                      >
                        {sendingNow === s.Id ? '⏳ Sending…' : '▶ Send Now'}
                      </button>
                      <button
                        onClick={() => openEditSchedule(s)}
                        className="px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => setConfirmDeleteSchedule(s.Id)}
                        className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Schedule Create/Edit Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-bold mb-5 text-gray-900 dark:text-white">
                {editingSchedule ? 'Edit Report Schedule' : 'New Report Schedule'}
              </h3>

              {scheduleError && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
                  {scheduleError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Frequency</label>
                  <div className="flex gap-3">
                    {(['weekly', 'monthly'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setScheduleForm(prev => ({ ...prev, frequency: f }))}
                        className={`flex-1 py-2 rounded-lg border-2 font-medium transition-colors capitalize ${
                          scheduleForm.frequency === f
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                            : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {scheduleForm.frequency === 'weekly' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Day of week</label>
                    <select
                      value={scheduleForm.dayOfWeek}
                      onChange={e => setScheduleForm(prev => ({ ...prev, dayOfWeek: parseInt(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Day of month (1–28)</label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={scheduleForm.dayOfMonth}
                      onChange={e => setScheduleForm(prev => ({ ...prev, dayOfMonth: Math.max(1, Math.min(28, parseInt(e.target.value) || 1)) }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Recipients <span className="text-gray-400">(comma-separated emails)</span>
                  </label>
                  <input
                    type="text"
                    value={scheduleForm.recipients}
                    onChange={e => setScheduleForm(prev => ({ ...prev, recipients: e.target.value }))}
                    placeholder="manager@example.com, cto@example.com"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Include in PDF</label>
                  <div className="space-y-2">
                    {[
                      { key: 'includeTaskTable', label: 'Task table (status, estimated, worked hours)' },
                      { key: 'includeTimeEntries', label: 'Time entries (last 200 entries in period)' },
                      { key: 'includeBudget', label: 'Budget progress bar' },
                    ].map(opt => (
                      <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(scheduleForm as any)[opt.key]}
                          onChange={e => setScheduleForm(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleForm.isEnabled}
                    onChange={e => setScheduleForm(prev => ({ ...prev, isEnabled: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enabled</span>
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSchedule}
                  disabled={scheduleSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {scheduleSaving ? 'Saving…' : (editingSchedule ? 'Update Schedule' : 'Create Schedule')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Schedule Confirm Modal */}
      {confirmDeleteSchedule !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Delete Schedule</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">Are you sure you want to delete this report schedule? This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteSchedule(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteSchedule(confirmDeleteSchedule)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
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
    isVisibleToCustomer: !!project.IsVisibleToCustomer,
    jiraBoardId: project.JiraBoardId || '',
    gitHubOwner: project.GitHubOwner || '',
    gitHubRepo: project.GitHubRepo || '',
    giteaOwner: project.GiteaOwner || '',
    giteaRepo: project.GiteaRepo || '',
    budget: project.Budget !== null && project.Budget !== undefined ? String(project.Budget) : '',
    customerId: project.CustomerId || undefined,
    applicationIds: project.ApplicationIds || [] as number[],
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [customers, setCustomers] = useState<{ Id: number; Name: string }[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<StatusValue[]>([]);
  const [jiraIntegration, setJiraIntegration] = useState<any>(null);
  const [githubIntegration, setGithubIntegration] = useState<any>(null);
  const [giteaIntegration, setGiteaIntegration] = useState<any>(null);
  const [availableApplications, setAvailableApplications] = useState<{ Id: number; Name: string }[]>([]);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadOrganizations();
    loadCustomers();
    loadProjectStatuses();
    loadJiraIntegration();
    loadGitHubIntegration();
    loadGiteaIntegration();
    loadApplicationsList();
  }, []);

  const loadApplicationsList = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/applications?organizationId=${project.OrganizationId}`, {
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
      const adminOrgs = response.organizations.filter(
        org => org.Role === 'Owner' || org.Role === 'Admin'
      );
      setOrganizations(adminOrgs);
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
    }
  };

  const loadCustomers = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/customers?organizationId=${project.OrganizationId}`, {
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

  const loadProjectStatuses = async () => {
    try {
      const response = await statusValuesApi.getProjectStatuses(project.OrganizationId, token);
      setProjectStatuses(response.statuses);
    } catch (err: any) {
      console.error('Failed to load project statuses:', err);
    }
  };

  const loadJiraIntegration = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/jira-integrations/organization/${project.OrganizationId}`, {
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

  const loadGitHubIntegration = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/github-integrations/organization/${project.OrganizationId}`, {
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

  const loadGiteaIntegration = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/gitea-integrations/organization/${project.OrganizationId}`, {
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
        isVisibleToCustomer: formData.isVisibleToCustomer,
        jiraBoardId: formData.jiraBoardId || null,
        gitHubOwner: formData.gitHubOwner || null,
        gitHubRepo: formData.gitHubRepo || null,
        giteaOwner: formData.giteaOwner || null,
        giteaRepo: formData.giteaRepo || null,
        budget: formData.budget !== '' ? parseFloat(formData.budget) : null,
        customerId: formData.customerId || null,
        applicationIds: formData.applicationIds || [],
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
              Customer
            </label>
            <select
              value={formData.customerId || ''}
              onChange={(e) => setFormData({ ...formData, customerId: e.target.value ? parseInt(e.target.value) : undefined })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">No customer</option>
              {customers.map((c) => (
                <option key={c.Id} value={c.Id}>{c.Name}</option>
              ))}
            </select>
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
              Budget
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.budget}
                onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
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

          {formData.customerId && (
            <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <input
                type="checkbox"
                id="isVisibleToCustomer"
                checked={formData.isVisibleToCustomer}
                onChange={(e) => setFormData({ ...formData, isVisibleToCustomer: e.target.checked })}
                className="w-5 h-5 rounded border-green-300 text-green-600 focus:ring-green-500 dark:bg-gray-700 dark:border-green-600"
              />
              <div>
                <label htmlFor="isVisibleToCustomer" className="block text-sm font-medium text-green-700 dark:text-green-300 cursor-pointer">
                  👁 Visible to Customer
                </label>
                <p className="text-xs text-green-600 dark:text-green-400">
                  When enabled, the customer can see this project in their portal
                </p>
              </div>
            </div>
          )}

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
                value={formData.jiraBoardId}
                onChange={(e) => setFormData({ ...formData, jiraBoardId: e.target.value })}
                className="w-full px-4 py-2 border border-blue-300 dark:border-blue-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="e.g., 123 (from board URL)"
              />
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Associate this project with a Jira board. Find the Board ID in your Jira board URL: /boards/123
              </p>
              {formData.jiraBoardId && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, jiraBoardId: '' })}
                    className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                  >
                    Clear Board ID
                  </button>
                </div>
              )}
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
                    value={formData.gitHubOwner}
                    onChange={(e) => setFormData({ ...formData, gitHubOwner: e.target.value })}
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
                    value={formData.gitHubRepo}
                    onChange={(e) => setFormData({ ...formData, gitHubRepo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="repository-name"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                Required for GitHub issues import. Find in your repository URL: github.com/<strong>owner</strong>/<strong>repo</strong>
              </p>
              {(formData.gitHubOwner || formData.gitHubRepo) && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, gitHubOwner: '', gitHubRepo: '' })}
                    className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                  >
                    Clear Repository
                  </button>
                </div>
              )}
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
                    value={formData.giteaOwner}
                    onChange={(e) => setFormData({ ...formData, giteaOwner: e.target.value })}
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
                    value={formData.giteaRepo}
                    onChange={(e) => setFormData({ ...formData, giteaRepo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    placeholder="repository-name"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                Required for Gitea issues import. Format: <strong>owner/repo</strong>
              </p>
              {(formData.giteaOwner || formData.giteaRepo) && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, giteaOwner: '', giteaRepo: '' })}
                    className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                  >
                    Clear Repository
                  </button>
                </div>
              )}
            </div>
          )}

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
    jiraBoardId: project.JiraBoardId || undefined,
    gitHubOwner: project.GitHubOwner || undefined,
    gitHubRepo: project.GitHubRepo || undefined,
    giteaOwner: project.GiteaOwner || undefined,
    giteaRepo: project.GiteaRepo || undefined,
    budget: project.Budget ?? undefined,
    customerId: project.CustomerId || undefined,
    isHobby: project.IsHobby || false,
    isVisibleToCustomer: !!project.IsVisibleToCustomer,
    applicationIds: project.ApplicationIds || [],
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [customers, setCustomers] = useState<{ Id: number; Name: string }[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<StatusValue[]>([]);
  const [jiraIntegration, setJiraIntegration] = useState<any>(null);
  const [githubIntegration, setGithubIntegration] = useState<any>(null);
  const [giteaIntegration, setGiteaIntegration] = useState<any>(null);
  const [availableApplications, setAvailableApplications] = useState<{ Id: number; Name: string }[]>([]);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadOrganizations();
    loadCustomers();
    loadProjectStatuses();
    loadJiraIntegration();
    loadGitHubIntegration();
    loadGiteaIntegration();
    loadApplicationsList();
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

  const loadApplicationsList = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/applications?organizationId=${project.OrganizationId}`, {
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

  const loadCustomers = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/customers?organizationId=${project.OrganizationId}`, {
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

  const loadProjectStatuses = async () => {
    try {
      const response = await statusValuesApi.getProjectStatuses(project.OrganizationId, token);
      setProjectStatuses(response.statuses);
    } catch (err: any) {
      console.error('Failed to load project statuses:', err);
    }
  };

  const loadJiraIntegration = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/jira-integrations/organization/${project.OrganizationId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.integration && data.integration.IsEnabled && data.integration.JiraProjectsUrl) {
          setJiraIntegration(data.integration);
        } else {
          setJiraIntegration(null);
        }
      }
    } catch (err: any) {
      console.error('Failed to load Jira integration:', err);
      setJiraIntegration(null);
    }
  };

  const loadGitHubIntegration = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/github-integrations/organization/${project.OrganizationId}`, {
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

  const loadGiteaIntegration = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/gitea-integrations/organization/${project.OrganizationId}`, {
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
        jiraBoardId: formData.jiraBoardId || null,
        gitHubOwner: formData.gitHubOwner || null,
        gitHubRepo: formData.gitHubRepo || null,
        giteaOwner: formData.giteaOwner || null,
        giteaRepo: formData.giteaRepo || null,
        budget: formData.budget != null ? formData.budget : null,
        customerId: formData.customerId || null,
        isHobby: formData.isHobby || false,
        isVisibleToCustomer: formData.isVisibleToCustomer || false,
        applicationIds: formData.applicationIds || [],
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
              <SearchableSelect
                value={formData.organizationId}
                onChange={(value) => setFormData({ ...formData, organizationId: value || 0 })}
                options={organizations.map(org => ({
                  id: org.Id,
                  label: `${org.Name} (${org.Role})`
                }))}
                placeholder="Select Organization"
                emptyMessage="No organizations available"
              />
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
                Customer
              </label>
              <select
                value={formData.customerId || ''}
                onChange={(e) => setFormData({ ...formData, customerId: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">No customer</option>
                {customers.map((c) => (
                  <option key={c.Id} value={c.Id}>{c.Name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <input
                type="checkbox"
                id="editIsHobby"
                checked={formData.isHobby || false}
                onChange={(e) => setFormData({ ...formData, isHobby: e.target.checked })}
                className="w-5 h-5 rounded border-purple-300 text-purple-600 focus:ring-purple-500 dark:bg-gray-700 dark:border-purple-600"
              />
              <div>
                <label htmlFor="editIsHobby" className="block text-sm font-medium text-purple-700 dark:text-purple-300 cursor-pointer">
                  🎨 Hobby Project
                </label>
                <p className="text-xs text-purple-600 dark:text-purple-400">
                  Hobby projects are scheduled outside of regular work hours
                </p>
              </div>
            </div>

            {formData.customerId && (
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <input
                  type="checkbox"
                  id="editIsVisibleToCustomer"
                  checked={formData.isVisibleToCustomer || false}
                  onChange={(e) => setFormData({ ...formData, isVisibleToCustomer: e.target.checked })}
                  className="w-5 h-5 rounded border-green-300 text-green-600 focus:ring-green-500 dark:bg-gray-700 dark:border-green-600"
                />
                <div>
                  <label htmlFor="editIsVisibleToCustomer" className="block text-sm font-medium text-green-700 dark:text-green-300 cursor-pointer">
                    👁 Visible to Customer
                  </label>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    When enabled, the customer can see this project in their portal
                  </p>
                </div>
              </div>
            )}

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

// ─── Dependency Graph ────────────────────────────────────────────────────────

interface DGNode {
  task: Task;
  level: number;
  indexInLevel: number;
  x: number;
  y: number;
}

function DependencyGraphTab({ tasks, onOpenTask }: { tasks: Task[]; onOpenTask: (t: Task) => void }) {
  const BOX_W = 170;
  const BOX_H = 54;
  const COL_GAP = 100;
  const ROW_GAP = 28;

  // Build adjacency (id → task)
  const byId = new Map<number, Task>(tasks.map(t => [t.Id, t]));

  // Compute level for each task via longest-path BFS
  const levelMap = new Map<number, number>();
  const dependants = new Map<number, number[]>(); // depId → [taskId...]
  tasks.forEach(t => {
    if (t.DependsOnTaskId && byId.has(t.DependsOnTaskId)) {
      const arr = dependants.get(t.DependsOnTaskId) || [];
      arr.push(t.Id);
      dependants.set(t.DependsOnTaskId, arr);
    }
  });
  // Iterative level assignment
  let changed = true;
  tasks.forEach(t => levelMap.set(t.Id, 0));
  while (changed) {
    changed = false;
    tasks.forEach(t => {
      if (t.DependsOnTaskId && byId.has(t.DependsOnTaskId)) {
        const nl = (levelMap.get(t.DependsOnTaskId) ?? 0) + 1;
        if (nl > (levelMap.get(t.Id) ?? 0)) {
          levelMap.set(t.Id, nl);
          changed = true;
        }
      }
    });
  }

  // Only diagram tasks that have deps or are depended upon
  const linkedIds = new Set<number>();
  tasks.forEach(t => {
    if (t.DependsOnTaskId && byId.has(t.DependsOnTaskId)) {
      linkedIds.add(t.Id);
      linkedIds.add(t.DependsOnTaskId);
    }
  });
  const diagramTasks = tasks.filter(t => linkedIds.has(t.Id));

  // Group by level
  const levelGroups = new Map<number, Task[]>();
  diagramTasks.forEach(t => {
    const lv = levelMap.get(t.Id) ?? 0;
    const arr = levelGroups.get(lv) || [];
    arr.push(t);
    levelGroups.set(lv, arr);
  });

  // Sort levels
  const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);

  // Assign positions
  const nodes = new Map<number, DGNode>();
  let svgWidth = 20;
  sortedLevels.forEach((lv, colIdx) => {
    const col = levelGroups.get(lv)!;
    col.sort((a, b) => a.TaskName.localeCompare(b.TaskName));
    col.forEach((task, rowIdx) => {
      const x = 20 + colIdx * (BOX_W + COL_GAP);
      const y = 20 + rowIdx * (BOX_H + ROW_GAP);
      nodes.set(task.Id, { task, level: lv, indexInLevel: rowIdx, x, y });
    });
    const rightEdge = 20 + colIdx * (BOX_W + COL_GAP) + BOX_W + 20;
    if (rightEdge > svgWidth) svgWidth = rightEdge;
  });

  const maxRows = Math.max(...Array.from(levelGroups.values()).map(g => g.length), 1);
  const svgHeight = 20 + maxRows * (BOX_H + ROW_GAP) + 20;

  // Edge list
  const edges: { from: DGNode; to: DGNode }[] = [];
  diagramTasks.forEach(t => {
    if (t.DependsOnTaskId && nodes.has(t.DependsOnTaskId) && nodes.has(t.Id)) {
      edges.push({ from: nodes.get(t.DependsOnTaskId)!, to: nodes.get(t.Id)! });
    }
  });

  const statusColor = (s?: string | null) => {
    const sl = (s || '').toLowerCase();
    if (sl.includes('done') || sl.includes('complet')) return '#22c55e';
    if (sl.includes('progress') || sl.includes('doing')) return '#3b82f6';
    if (sl.includes('block') || sl.includes('cancel')) return '#ef4444';
    return '#94a3b8';
  };

  if (diagramTasks.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-10 text-center">
        <div className="text-5xl mb-4">🔗</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Task Dependencies</h2>
        <p className="text-gray-500 dark:text-gray-400">
          Set a <strong>Depends On</strong> value on any task to see the dependency graph here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">🔗 Dependency Graph</h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">{diagramTasks.length} linked tasks · click to open</span>
      </div>
      <div className="overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <svg width={svgWidth} height={svgHeight} style={{ minWidth: svgWidth, display: 'block' }}>
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map(({ from, to }, i) => {
            const x1 = from.x + BOX_W;
            const y1 = from.y + BOX_H / 2;
            const x2 = to.x;
            const y2 = to.y + BOX_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="#64748b"
                strokeWidth="1.5"
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          {/* Nodes */}
          {Array.from(nodes.values()).map(({ task, x, y }) => {
            const sc = statusColor(task.StatusName);
            const label = task.TaskName.length > 22 ? task.TaskName.slice(0, 21) + '…' : task.TaskName;
            return (
              <g key={task.Id} style={{ cursor: 'pointer' }} onClick={() => onOpenTask(task)}>
                <rect
                  x={x}
                  y={y}
                  width={BOX_W}
                  height={BOX_H}
                  rx={8}
                  fill="white"
                  stroke={sc}
                  strokeWidth={2}
                  filter="drop-shadow(0 1px 2px rgba(0,0,0,0.10))"
                />
                {/* Status stripe */}
                <rect x={x} y={y} width={6} height={BOX_H} rx={8} fill={sc} />
                <rect x={x} y={y + 6} width={6} height={BOX_H - 6} fill={sc} />
                <text
                  x={x + 14}
                  y={y + 21}
                  fontSize={12}
                  fontWeight="600"
                  fill="#1e293b"
                  fontFamily="system-ui, sans-serif"
                >
                  {label}
                </text>
                {task.StatusName && (
                  <text
                    x={x + 14}
                    y={y + 37}
                    fontSize={10}
                    fill={sc}
                    fontFamily="system-ui, sans-serif"
                  >
                    {task.StatusName.length > 24 ? task.StatusName.slice(0, 23) + '…' : task.StatusName}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> Completed/Done</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-blue-500" /> In Progress</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Blocked/Cancelled</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-slate-400" /> Other</span>
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
              <RichTextEditor
                content={formData.description || ''}
                onChange={(html) => setFormData({ ...formData, description: html })}
                placeholder="Enter task description..."
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
              <SearchableSelect
                value={formData.assignedTo}
                onChange={(value) => setFormData({ ...formData, assignedTo: value })}
                options={organizationUsers.map(user => ({
                  id: user.Id,
                  label: `${user.Username}${user.FirstName && user.LastName ? ` (${user.FirstName} ${user.LastName})` : ''}`
                }))}
                placeholder="Unassigned"
                emptyMessage="No users available"
              />
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

// ─── Burndown / Burnup Chart Tab ─────────────────────────────────────────────
function BurndownTab({ projectId, token }: { projectId: number; token: string }) {
  const [data, setData] = useState<{
    startDate: string;
    endDate: string;
    today: string;
    totalEstimatedHours: number;
    series: { date: string; worked: number; cumulative: number; remaining: number; ideal: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartMode, setChartMode] = useState<'burndown' | 'burnup'>('burndown');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${getApiUrl()}/api/projects/${projectId}/burndown`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load');
        const json = await res.json();
        setData(json.data);
      } catch {
        setError('Failed to load burndown data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId, token]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">Loading chart…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return null;

  const { series, totalEstimatedHours, endDate, today } = data;

  // Trim series to only include dates up to today for rendering
  const visibleSeries = series.filter(s => s.date <= today);
  const allSeries = series; // full to show ideal line to end date

  if (allSeries.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-10 text-center">
        <p className="text-4xl mb-3">📉</p>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">No data yet</h3>
        <p className="text-gray-500 dark:text-gray-400">Log time entries to see the burndown chart.</p>
      </div>
    );
  }

  // SVG chart dimensions
  const W = 800, H = 320, PAD = { top: 20, right: 30, bottom: 50, left: 60 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const n = allSeries.length;
  const maxY = Math.max(totalEstimatedHours, visibleSeries.reduce((m, s) => Math.max(m, s.cumulative), 0)) * 1.05;

  const xScale = (i: number) => (i / Math.max(n - 1, 1)) * chartW;
  const yScale = (v: number) => chartH - (v / (maxY || 1)) * chartH;

  // Build polyline points
  const idealPoints = allSeries.map((s, i) => `${xScale(i)},${yScale(s.ideal)}`).join(' ');
  const burndownPoints = visibleSeries.map((s, i) => `${xScale(i)},${yScale(s.remaining)}`).join(' ');
  const burnupPoints = visibleSeries.map((s, i) => `${xScale(i)},${yScale(s.cumulative)}`).join(' ');

  // X axis: pick ~6 evenly-spaced labels
  const tickStep = Math.max(1, Math.floor(n / 6));
  const xTicks = allSeries.filter((_, i) => i % tickStep === 0 || i === n - 1);

  // Y axis: 5 ticks
  const yTicks = Array.from({ length: 6 }, (_, i) => Math.round((maxY / 5) * i));

  const workedTotal = visibleSeries[visibleSeries.length - 1]?.cumulative || 0;
  const remainingTotal = Math.max(0, totalEstimatedHours - workedTotal);
  const completionPct = totalEstimatedHours > 0 ? Math.round((workedTotal / totalEstimatedHours) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">📉 Burndown / Burnup Chart</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {new Date(data.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' → '}
              {new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setChartMode('burndown')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                chartMode === 'burndown'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              📉 Burndown
            </button>
            <button
              onClick={() => setChartMode('burnup')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                chartMode === 'burnup'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              📈 Burnup
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Estimated', value: `${totalEstimatedHours.toFixed(0)}h`, color: 'text-gray-700 dark:text-gray-200' },
            { label: 'Worked', value: `${workedTotal.toFixed(1)}h`, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Remaining', value: `${remainingTotal.toFixed(1)}h`, color: remainingTotal > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400' },
            { label: 'Complete', value: `${completionPct}%`, color: completionPct >= 100 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400' },
          ].map(st => (
            <div key={st.label} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold ${st.color}`}>{st.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{st.label}</div>
            </div>
          ))}
        </div>

        {/* SVG Chart */}
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            style={{ maxHeight: 360 }}
          >
            <g transform={`translate(${PAD.left},${PAD.top})`}>
              {/* Grid lines + Y axis */}
              {yTicks.map((v, i) => (
                <g key={i}>
                  <line x1={0} y1={yScale(v)} x2={chartW} y2={yScale(v)} stroke="#e5e7eb" strokeDasharray="4,3" />
                  <text x={-8} y={yScale(v) + 4} textAnchor="end" fontSize={11} fill="#9ca3af">{v}h</text>
                </g>
              ))}

              {/* Today marker */}
              {(() => {
                const todayIdx = allSeries.findIndex(s => s.date >= today);
                if (todayIdx < 0) return null;
                const tx = xScale(todayIdx);
                return (
                  <g>
                    <line x1={tx} y1={0} x2={tx} y2={chartH} stroke="#3b82f6" strokeDasharray="4,3" strokeWidth={1.5} />
                    <text x={tx + 4} y={12} fontSize={10} fill="#3b82f6">Today</text>
                  </g>
                );
              })()}

              {/* Ideal line */}
              <polyline
                points={idealPoints}
                fill="none"
                stroke="#d1d5db"
                strokeWidth={2}
                strokeDasharray="6,4"
              />

              {/* Actual line */}
              <polyline
                points={chartMode === 'burndown' ? burndownPoints : burnupPoints}
                fill="none"
                stroke={chartMode === 'burndown' ? '#ef4444' : '#22c55e'}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />

              {/* Data dots on actual line */}
              {visibleSeries.map((s, i) => {
                const val = chartMode === 'burndown' ? s.remaining : s.cumulative;
                return (
                  <circle
                    key={s.date}
                    cx={xScale(i)}
                    cy={yScale(val)}
                    r={3}
                    fill={chartMode === 'burndown' ? '#ef4444' : '#22c55e'}
                  />
                );
              })}

              {/* X axis */}
              <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="#e5e7eb" />
              {xTicks.map((s) => {
                const idx = allSeries.indexOf(s);
                const x = xScale(idx);
                const label = new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                return (
                  <text key={s.date} x={x} y={chartH + 16} textAnchor="middle" fontSize={10} fill="#9ca3af">
                    {label}
                  </text>
                );
              })}

              {/* Y axis line */}
              <line x1={0} y1={0} x2={0} y2={chartH} stroke="#e5e7eb" />
            </g>
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <svg width="24" height="3"><line x1="0" y1="1.5" x2="24" y2="1.5" stroke="#d1d5db" strokeWidth="2" strokeDasharray="5,3"/></svg>
            <span className="text-gray-500 dark:text-gray-400">Ideal</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="3"><line x1="0" y1="1.5" x2="24" y2="1.5" stroke={chartMode === 'burndown' ? '#ef4444' : '#22c55e'} strokeWidth="2.5"/></svg>
            <span className="text-gray-500 dark:text-gray-400">{chartMode === 'burndown' ? 'Remaining hours' : 'Worked hours'}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="24" height="3"><line x1="0" y1="1.5" x2="24" y2="1.5" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,3"/></svg>
            <span className="text-gray-500 dark:text-gray-400">Today</span>
          </div>
        </div>
      </div>

      {/* Daily log table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Daily Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4 text-right">Hours logged</th>
                <th className="pb-2 pr-4 text-right">Cumulative</th>
                <th className="pb-2 text-right">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {visibleSeries.filter(s => s.worked > 0).map(s => (
                <tr key={s.date}>
                  <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                    {new Date(s.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}
                  </td>
                  <td className="py-2 pr-4 text-right font-medium text-gray-900 dark:text-white">{s.worked.toFixed(1)}h</td>
                  <td className="py-2 pr-4 text-right text-blue-600 dark:text-blue-400">{s.cumulative.toFixed(1)}h</td>
                  <td className="py-2 text-right text-amber-600 dark:text-amber-400">{s.remaining.toFixed(1)}h</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleSeries.filter(s => s.worked > 0).length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">No time entries logged yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SaveTemplateModal ──────────────────────────────────────────────────────
function SaveTemplateModal({
  projectId,
  organizationId,
  tasks,
  token,
  onClose,
}: {
  projectId: number;
  organizationId: number;
  tasks: Task[];
  token: string;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      // Build items array preserving parent-child relationships
      const taskIdToIndex: Record<number, number> = {};
      const items = tasks.map((t, i) => {
        taskIdToIndex[t.Id] = i;
        return {
          title: t.TaskName,
          description: t.Description || null,
          estimatedHours: t.EstimatedHours || null,
          priority: t.Priority || null,
          sortOrder: i,
          parentIndex: null as number | null,
          _originalId: t.Id,
          _parentTaskId: t.ParentTaskId ?? null,
        };
      });
      // Resolve parent indices
      items.forEach(item => {
        if (item._parentTaskId !== null) {
          item.parentIndex = taskIdToIndex[item._parentTaskId] ?? null;
        }
      });

      const res = await fetch(`${getApiUrl()}/api/task-templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, name: name.trim(), description: description.trim() || null, items }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to save template');
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          {success ? (
            <div className="text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Template Saved!</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                &ldquo;{name}&rdquo; has been saved as a template for this organization.
              </p>
              <button
                onClick={onClose}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">💾 Save as Template</h2>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl">×</button>
              </div>
              {error && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                  {error}
                </div>
              )}
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Save all {tasks.length} task{tasks.length !== 1 ? 's' : ''} as a reusable template for this organization.
              </p>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Template Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g., Standard Sprint, Bug Fix Workflow"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Optional description of when to use this template"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={onClose} className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white px-4 py-2 rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSaving || !name.trim()} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-4 py-2 rounded-lg transition-colors">
                    {isSaving ? 'Saving…' : 'Save Template'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ApplyTemplateModal ─────────────────────────────────────────────────────
function ApplyTemplateModal({
  projectId,
  organizationId,
  token,
  onClose,
  onApplied,
}: {
  projectId: number;
  organizationId: number;
  token: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/task-templates?organizationId=${organizationId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates || []);
        }
      } catch { /* ignore */ }
      finally { setIsLoading(false); }
    };
    load();
  }, [organizationId, token]);

  const handleSelect = async (id: number) => {
    setSelectedId(id);
    setPreviewLoading(true);
    setPreview([]);
    try {
      const res = await fetch(`${getApiUrl()}/api/task-templates/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPreview(data.items || []);
      }
    } catch { /* ignore */ }
    finally { setPreviewLoading(false); }
  };

  const handleApply = async () => {
    if (!selectedId) return;
    setIsApplying(true);
    setError('');
    try {
      const res = await fetch(`${getApiUrl()}/api/task-templates/${selectedId}/apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to apply template');
      }
      const data = await res.json();
      onApplied();
    } catch (err: any) {
      setError(err.message || 'Failed to apply template');
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-xl w-full max-h-[85vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">📥 Apply Task Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl">×</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading templates…</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">📋</div>
              <p className="text-gray-600 dark:text-gray-400">No templates saved for this organization yet.</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Use &ldquo;Save as Template&rdquo; to create one from existing tasks.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map(t => (
                <div
                  key={t.Id}
                  onClick={() => handleSelect(t.Id)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedId === t.Id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{t.Name}</h3>
                      {t.Description && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t.Description}</p>}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-4 shrink-0">{t.ItemCount} task{t.ItemCount !== 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    By {t.FirstName} {t.LastName} · {new Date(t.CreatedAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}

          {selectedId && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Preview tasks to be created:</h3>
              {previewLoading ? (
                <p className="text-sm text-gray-500">Loading preview…</p>
              ) : (
                <ul className="space-y-1 max-h-44 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded p-2">
                  {preview.map(item => (
                    <li key={item.Id} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <span>{item.ParentItemId ? '↳' : '•'}</span>
                      <span style={{ paddingLeft: item.ParentItemId ? 12 : 0 }}>{item.Title}</span>
                      {item.EstimatedHours && <span className="text-xs text-gray-400">({item.EstimatedHours}h)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button onClick={onClose} className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white px-4 py-2 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedId || isApplying}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {isApplying ? 'Creating tasks…' : 'Apply Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SprintsTab ──────────────────────────────────────────────────────────────

interface Sprint {
  Id: number;
  ProjectId: number;
  Name: string;
  Goal: string | null;
  StartDate: string | null;
  EndDate: string | null;
  Status: 'planned' | 'active' | 'completed' | 'cancelled';
  Velocity: number | null;
  TotalTasks: number;
  CompletedTasks: number;
  TotalEstimatedHours: number;
  CompletedHours: number;
}

interface BacklogTask {
  Id: number;
  ParentTaskId: number | null;
  TaskName: string;
  EstimatedHours: number | null;
  TotalAllocatedHours: number | null;
  PlannedStartDate: string | null;
  PlannedEndDate: string | null;
  DueDate: string | null;
  StatusName: string;
  StatusColor: string;
  PriorityName: string;
  PriorityColor: string;
  AssigneeName: string | null;
  FirstName: string | null;
  LastName: string | null;
}

function SprintsTab({ projectId, organizationId, token }: { projectId: number; organizationId: number; token: string }) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [backlog, setBacklog] = useState<BacklogTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [expandedSprints, setExpandedSprints] = useState<Set<number>>(new Set());
  const [sprintTasks, setSprintTasks] = useState<Record<number, BacklogTask[]>>({});
  const [selectedBacklogTasks, setSelectedBacklogTasks] = useState<Set<number>>(new Set());
  const [assigningToSprint, setAssigningToSprint] = useState<number | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [sprintTaskFilter, setSprintTaskFilter] = useState({ search: '', status: '', priority: '', assignee: '' });
  const [backlogFilter, setBacklogFilter] = useState({ search: '', status: '', priority: '', assignee: '' });
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set());

  // Sprint form
  const [sprintForm, setSprintForm] = useState({ name: '', goal: '', startDate: '', endDate: '', status: 'planned' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [sprintsRes, backlogRes] = await Promise.all([
        fetch(`${API_URL}/api/sprints/project/${projectId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/sprints/project/${projectId}/backlog`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (sprintsRes.ok) setSprints((await sprintsRes.json()).sprints || []);
      if (backlogRes.ok) setBacklog((await backlogRes.json()).tasks || []);
    } catch {
      setError('Failed to load sprint data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSprintTasks = async (sprintId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/sprints/${sprintId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSprintTasks(prev => ({ ...prev, [sprintId]: data.tasks || [] }));
      }
    } catch { /* ignore */ }
  };

  const toggleSprintExpanded = (sprintId: number) => {
    setExpandedSprints(prev => {
      const next = new Set(prev);
      if (next.has(sprintId)) {
        next.delete(sprintId);
      } else {
        next.add(sprintId);
        if (!sprintTasks[sprintId]) loadSprintTasks(sprintId);
      }
      return next;
    });
  };

  const openCreateSprint = () => {
    setEditingSprint(null);
    setSprintForm({ name: '', goal: '', startDate: '', endDate: '', status: 'planned' });
    setShowSprintModal(true);
  };

  const openEditSprint = (sprint: Sprint) => {
    setEditingSprint(sprint);
    setSprintForm({
      name: sprint.Name,
      goal: sprint.Goal || '',
      startDate: sprint.StartDate ? sprint.StartDate.split('T')[0] : '',
      endDate: sprint.EndDate ? sprint.EndDate.split('T')[0] : '',
      status: sprint.Status,
    });
    setShowSprintModal(true);
  };

  const saveSprint = async () => {
    if (!sprintForm.name.trim()) return;
    setIsSaving(true);
    try {
      const url = editingSprint ? `${API_URL}/api/sprints/${editingSprint.Id}` : `${API_URL}/api/sprints`;
      const method = editingSprint ? 'PUT' : 'POST';
      const body = editingSprint
        ? { ...sprintForm }
        : { projectId, ...sprintForm };
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'Failed to save sprint');
        return;
      }
      setShowSprintModal(false);
      await loadData();
    } catch {
      setError('Failed to save sprint');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSprint = (sprint: Sprint) => {
    setConfirmModal({
      message: `Delete sprint "${sprint.Name}"? Tasks will be moved to backlog.`,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch(`${API_URL}/api/sprints/${sprint.Id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        await loadData();
      },
    });
  };

  const assignTasksToSprint = async (sprintId: number) => {
    if (selectedBacklogTasks.size === 0) return;
    setAssigningToSprint(sprintId);
    try {
      await fetch(`${API_URL}/api/sprints/${sprintId}/tasks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds: Array.from(selectedBacklogTasks) }),
      });
      setSelectedBacklogTasks(new Set());
      if (expandedSprints.has(sprintId)) {
        await loadSprintTasks(sprintId);
      }
      await loadData();
    } catch {
      setError('Failed to assign tasks');
    } finally {
      setAssigningToSprint(null);
    }
  };

  const removeTaskFromSprint = async (sprintId: number, taskId: number) => {
    await fetch(`${API_URL}/api/sprints/${sprintId}/tasks/remove`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds: [taskId] }),
    });
    setSprintTasks(prev => ({ ...prev, [sprintId]: (prev[sprintId] || []).filter(t => t.Id !== taskId) }));
    await loadData();
  };

  const sprintStatusBadge = (status: Sprint['Status']) => {
    const styles: Record<Sprint['Status'], string> = {
      planned: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
      active: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
      completed: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
      cancelled: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${styles[status]}`}>
        {status}
      </span>
    );
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading sprints…</div>;

  // ─── Filter helpers ────────────────────────────────────────────────────────
  const fmtDate = (d: string | null | undefined) => (d ? String(d).split('T')[0] : null);
  const applyFilter = (tasks: BacklogTask[], f: typeof sprintTaskFilter) =>
    tasks.filter(t => {
      if (f.search && !t.TaskName.toLowerCase().includes(f.search.toLowerCase())) return false;
      if (f.status && t.StatusName !== f.status) return false;
      if (f.priority && t.PriorityName !== f.priority) return false;
      if (f.assignee) {
        const name = t.FirstName ? `${t.FirstName} ${t.LastName}`.trim() : t.AssigneeName || '';
        if (name !== f.assignee) return false;
      }
      return true;
    });
  const allSprintTasksList = Object.values(sprintTasks).flat();
  const sprintTaskStatuses = [...new Set(allSprintTasksList.map(t => t.StatusName).filter(Boolean))];
  const sprintTaskPriorities = [...new Set(allSprintTasksList.map(t => t.PriorityName).filter(Boolean))];
  const sprintTaskAssignees = [...new Set(allSprintTasksList.map(t => t.FirstName ? `${t.FirstName} ${t.LastName}`.trim() : t.AssigneeName || '').filter(Boolean))];
  const backlogStatuses = [...new Set(backlog.map(t => t.StatusName).filter(Boolean))];
  const backlogPriorities = [...new Set(backlog.map(t => t.PriorityName).filter(Boolean))];
  const backlogAssignees = [...new Set(backlog.map(t => t.FirstName ? `${t.FirstName} ${t.LastName}`.trim() : t.AssigneeName || '').filter(Boolean))];
  const filteredBacklog = applyFilter(backlog, backlogFilter);
  const hasSprintTaskFilter = !!(sprintTaskFilter.search || sprintTaskFilter.status || sprintTaskFilter.priority || sprintTaskFilter.assignee);
  const hasBacklogFilter = !!(backlogFilter.search || backlogFilter.status || backlogFilter.priority || backlogFilter.assignee);

  // ─── Hierarchy helpers ────────────────────────────────────────────────────
  const getDescendants = (taskId: number, tasks: BacklogTask[]): number[] => {
    const children = tasks.filter(t => t.ParentTaskId === taskId);
    return children.flatMap(c => [c.Id, ...getDescendants(c.Id, tasks)]);
  };
  const buildTaskRows = (tasks: BacklogTask[], filt: typeof sprintTaskFilter): { task: BacklogTask; depth: number; hasChildren: boolean }[] => {
    const isFiltered = !!(filt.search || filt.status || filt.priority || filt.assignee);
    if (isFiltered) return applyFilter(tasks, filt).map(t => ({ task: t, depth: 0, hasChildren: false }));
    const taskIds = new Set(tasks.map(t => t.Id));
    const childMap = new Map<number, BacklogTask[]>();
    for (const t of tasks) {
      if (t.ParentTaskId && taskIds.has(t.ParentTaskId)) {
        if (!childMap.has(t.ParentTaskId)) childMap.set(t.ParentTaskId, []);
        childMap.get(t.ParentTaskId)!.push(t);
      }
    }
    const rows: { task: BacklogTask; depth: number; hasChildren: boolean }[] = [];
    const visit = (t: BacklogTask, depth: number) => {
      const children = childMap.get(t.Id) || [];
      rows.push({ task: t, depth, hasChildren: children.length > 0 });
      if (children.length > 0 && expandedTaskIds.has(t.Id)) children.forEach(c => visit(c, depth + 1));
    };
    tasks.filter(t => !t.ParentTaskId || !taskIds.has(t.ParentTaskId)).forEach(r => visit(r, 0));
    return rows;
  };
  const toggleBacklogTask = (taskId: number) => {
    const descendants = getDescendants(taskId, backlog);
    setSelectedBacklogTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
        descendants.forEach(id => next.delete(id));
      } else {
        next.add(taskId);
        descendants.forEach(id => next.add(id));
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Sprints</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{sprints.length} sprint{sprints.length !== 1 ? 's' : ''} · {backlog.length} backlog item{backlog.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openCreateSprint}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          + New Sprint
        </button>
      </div>

      {/* Sprint Task Filters */}
      {sprints.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide shrink-0">Filter tasks:</span>
            <input
              type="text"
              placeholder="Search tasks…"
              value={sprintTaskFilter.search}
              onChange={e => setSprintTaskFilter(f => ({ ...f, search: e.target.value }))}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 w-48"
            />
            <select value={sprintTaskFilter.status} onChange={e => setSprintTaskFilter(f => ({ ...f, status: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="">All statuses</option>
              {sprintTaskStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={sprintTaskFilter.priority} onChange={e => setSprintTaskFilter(f => ({ ...f, priority: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="">All priorities</option>
              {sprintTaskPriorities.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={sprintTaskFilter.assignee} onChange={e => setSprintTaskFilter(f => ({ ...f, assignee: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="">All assignees</option>
              {sprintTaskAssignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {hasSprintTaskFilter && (
              <button onClick={() => setSprintTaskFilter({ search: '', status: '', priority: '', assignee: '' })} className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">✕ Clear</button>
            )}
          </div>
        </div>
      )}

      {/* Sprint Cards */}
      <div className="space-y-4">
        {sprints.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-lg font-medium">No sprints yet</p>
            <p className="text-sm mt-1">Create your first sprint to start organizing work into iterations.</p>
          </div>
        )}
        {sprints.map(sprint => {
          const progress = sprint.TotalTasks > 0 ? Math.round((sprint.CompletedTasks / sprint.TotalTasks) * 100) : 0;
          const isExpanded = expandedSprints.has(sprint.Id);
          const tasks = sprintTasks[sprint.Id] || [];
          return (
            <div key={sprint.Id} className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              {/* Sprint Header */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => toggleSprintExpanded(sprint.Id)}
                        className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-left"
                      >
                        {isExpanded ? '▾' : '▸'} {sprint.Name}
                      </button>
                      {sprintStatusBadge(sprint.Status)}
                      {selectedBacklogTasks.size > 0 && (
                        <button
                          onClick={() => assignTasksToSprint(sprint.Id)}
                          disabled={assigningToSprint === sprint.Id}
                          className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
                        >
                          {assigningToSprint === sprint.Id ? 'Moving…' : `Move ${selectedBacklogTasks.size} task${selectedBacklogTasks.size !== 1 ? 's' : ''} here`}
                        </button>
                      )}
                    </div>
                    {sprint.Goal && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic">"{sprint.Goal}"</p>}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                      {sprint.StartDate && <span>📅 {sprint.StartDate.split('T')[0]} → {sprint.EndDate ? sprint.EndDate.split('T')[0] : '?'}</span>}
                      <span>📋 {sprint.TotalTasks} tasks ({sprint.CompletedTasks} done)</span>
                      <span>⏱ {Number(sprint.TotalEstimatedHours || 0).toFixed(1)}h estimated</span>
                      {sprint.Velocity != null && <span>⚡ Velocity: {sprint.Velocity}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => openEditSprint(sprint)} className="text-xs px-2 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors">✏️ Edit</button>
                    <button onClick={() => deleteSprint(sprint)} className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors">🗑</button>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Sprint Tasks (expanded) */}
              {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  {tasks.length === 0 ? (
                    <p className="text-sm text-gray-400 px-4 py-3 italic">No tasks in this sprint.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium">Task</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden md:table-cell">Status</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden lg:table-cell">Priority</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden md:table-cell">Assignee</th>
                          <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden sm:table-cell">Est.</th>
                          <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden xl:table-cell">Alloc.</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden xl:table-cell">Planned</th>
                          <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden lg:table-cell">Due</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {(() => {
                          const rows = buildTaskRows(tasks, sprintTaskFilter);
                          if (rows.length === 0) return (
                            <tr><td colSpan={9} className="px-4 py-4 text-center text-sm text-gray-400 italic">No tasks match the current filters.</td></tr>
                          );
                          return rows.map(({ task, depth, hasChildren }) => (
                            <tr key={task.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              <td className="px-4 py-2 text-gray-900 dark:text-white">
                                <div className="flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
                                  {hasChildren ? (
                                    <button
                                      type="button"
                                      onClick={e => { e.stopPropagation(); setExpandedTaskIds(prev => { const s = new Set(prev); s.has(task.Id) ? s.delete(task.Id) : s.add(task.Id); return s; }); }}
                                      className="mr-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs w-4 shrink-0"
                                    >
                                      {expandedTaskIds.has(task.Id) ? '▾' : '▸'}
                                    </button>
                                  ) : <span className="inline-block w-4 mr-1 shrink-0" />}
                                  {task.TaskName}
                                </div>
                              </td>
                              <td className="px-4 py-2 hidden md:table-cell">
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${task.StatusColor}22`, color: task.StatusColor }}>{task.StatusName}</span>
                              </td>
                              <td className="px-4 py-2 hidden lg:table-cell">
                                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${task.PriorityColor}22`, color: task.PriorityColor }}>{task.PriorityName}</span>
                              </td>
                              <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                                {task.FirstName ? `${task.FirstName} ${task.LastName}` : task.AssigneeName || '—'}
                              </td>
                              <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                                {task.EstimatedHours != null ? `${Number(task.EstimatedHours).toFixed(1)}h` : '—'}
                              </td>
                              <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 hidden xl:table-cell">
                                {task.TotalAllocatedHours ? `${Number(task.TotalAllocatedHours).toFixed(1)}h` : '—'}
                              </td>
                              <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden xl:table-cell whitespace-nowrap">
                                {task.PlannedStartDate || task.PlannedEndDate
                                  ? `${fmtDate(task.PlannedStartDate) || '?'} → ${fmtDate(task.PlannedEndDate) || '?'}`
                                  : '—'}
                              </td>
                              <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden lg:table-cell whitespace-nowrap">
                                {fmtDate(task.DueDate) || '—'}
                              </td>
                              <td className="px-2 py-2">
                                <button
                                  onClick={() => removeTaskFromSprint(sprint.Id, task.Id)}
                                  title="Remove from sprint"
                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Backlog */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Backlog</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tasks not assigned to any sprint</p>
            </div>
            {selectedBacklogTasks.size > 0 && (
              <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">{selectedBacklogTasks.size} selected — click a sprint to assign</span>
            )}
          </div>
          {/* Backlog filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="Search backlog…"
              value={backlogFilter.search}
              onChange={e => setBacklogFilter(f => ({ ...f, search: e.target.value }))}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 w-44"
            />
            <select value={backlogFilter.status} onChange={e => setBacklogFilter(f => ({ ...f, status: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="">All statuses</option>
              {backlogStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={backlogFilter.priority} onChange={e => setBacklogFilter(f => ({ ...f, priority: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="">All priorities</option>
              {backlogPriorities.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={backlogFilter.assignee} onChange={e => setBacklogFilter(f => ({ ...f, assignee: e.target.value }))} className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="">All assignees</option>
              {backlogAssignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {hasBacklogFilter && (
              <button onClick={() => setBacklogFilter({ search: '', status: '', priority: '', assignee: '' })} className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">✕ Clear</button>
            )}
          </div>
        </div>
        {backlog.length === 0 ? (
          <p className="text-sm text-gray-400 px-4 py-8 text-center italic">All tasks are assigned to sprints.</p>
        ) : buildTaskRows(backlog, backlogFilter).length === 0 ? (
          <p className="text-sm text-gray-400 px-4 py-8 text-center italic">No backlog tasks match the current filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-4 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={buildTaskRows(backlog, backlogFilter).length > 0 && buildTaskRows(backlog, backlogFilter).every(({ task: t }) => selectedBacklogTasks.has(t.Id))}
                    onChange={e => setSelectedBacklogTasks(e.target.checked ? new Set(backlog.map(t => t.Id)) : new Set())}
                    className="rounded"
                  />
                </th>
                <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium">Task</th>
                <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden md:table-cell">Status</th>
                <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden lg:table-cell">Priority</th>
                <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden md:table-cell">Assignee</th>
                <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden sm:table-cell">Est.</th>
                <th className="text-right px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden xl:table-cell">Alloc.</th>
                <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden xl:table-cell">Planned</th>
                <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-400 font-medium hidden lg:table-cell">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {buildTaskRows(backlog, backlogFilter).map(({ task, depth, hasChildren }) => (
                <tr
                  key={task.Id}
                  className={`cursor-pointer transition-colors ${selectedBacklogTasks.has(task.Id) ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                  onClick={() => toggleBacklogTask(task.Id)}
                >
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={selectedBacklogTasks.has(task.Id)} onChange={() => {}} className="rounded" />
                  </td>
                  <td className="px-4 py-2 text-gray-900 dark:text-white">
                    <div className="flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setExpandedTaskIds(prev => { const s = new Set(prev); s.has(task.Id) ? s.delete(task.Id) : s.add(task.Id); return s; }); }}
                          className="mr-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs w-4 shrink-0"
                        >
                          {expandedTaskIds.has(task.Id) ? '▾' : '▸'}
                        </button>
                      ) : <span className="inline-block w-4 mr-1 shrink-0" />}
                      {task.TaskName}
                    </div>
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${task.StatusColor}22`, color: task.StatusColor }}>{task.StatusName}</span>
                  </td>
                  <td className="px-4 py-2 hidden lg:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${task.PriorityColor}22`, color: task.PriorityColor }}>{task.PriorityName}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                    {task.FirstName ? `${task.FirstName} ${task.LastName}` : task.AssigneeName || '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                    {task.EstimatedHours != null ? `${Number(task.EstimatedHours).toFixed(1)}h` : '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 hidden xl:table-cell">
                    {task.TotalAllocatedHours ? `${Number(task.TotalAllocatedHours).toFixed(1)}h` : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden xl:table-cell whitespace-nowrap">
                    {task.PlannedStartDate || task.PlannedEndDate
                      ? `${fmtDate(task.PlannedStartDate) || '?'} → ${fmtDate(task.PlannedEndDate) || '?'}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 hidden lg:table-cell whitespace-nowrap">
                    {fmtDate(task.DueDate) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sprint Create/Edit Modal */}
      {showSprintModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {editingSprint ? 'Edit Sprint' : 'New Sprint'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                  <input
                    type="text"
                    value={sprintForm.name}
                    onChange={e => setSprintForm({ ...sprintForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="Sprint 1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Goal</label>
                  <textarea
                    value={sprintForm.goal}
                    onChange={e => setSprintForm({ ...sprintForm, goal: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="What is the main goal of this sprint?"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={sprintForm.startDate}
                      onChange={e => setSprintForm({ ...sprintForm, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                    <input
                      type="date"
                      value={sprintForm.endDate}
                      onChange={e => setSprintForm({ ...sprintForm, endDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                  <select
                    value={sprintForm.status}
                    onChange={e => setSprintForm({ ...sprintForm, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="planned">Planned</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowSprintModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSprint}
                  disabled={isSaving || !sprintForm.name.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white rounded-lg transition-colors"
                >
                  {isSaving ? 'Saving…' : editingSprint ? 'Save Changes' : 'Create Sprint'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <p className="text-gray-900 dark:text-white mb-6">{confirmModal.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(null)} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors">Cancel</button>
              <button onClick={confirmModal.onConfirm} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}