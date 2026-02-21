'use client';

import { getApiUrl } from '@/lib/api/config';

import React, { useState, useEffect, useRef } from 'react';
import { Task, CreateTaskData, tasksApi, TaskAssignee } from '@/lib/api/tasks';
import { Project } from '@/lib/api/projects';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { usersApi, User } from '@/lib/api/users';
import RichTextEditor from './RichTextEditor';
import SearchableSelectComponent from './SearchableSelect';
import { usePermissions } from '@/contexts/PermissionsContext';

interface TaskDetailModalProps {
  projectId: number;
  organizationId: number;
  task: Task | null;
  project: Project;
  tasks: Task[];
  onClose: () => void;
  onSaved: () => void;
  token: string;
  // Optional planning features
  showRemovePlanning?: boolean;
  onRemovePlanning?: () => void;
}

interface TaskHistory {
  Id: number;
  TaskId: number;
  UserId: number;
  Action: string;
  FieldName: string | null;
  OldValue: string | null;
  NewValue: string | null;
  CreatedAt: string;
  Username?: string;
}

interface TaskComment {
  Id: number;
  TaskId: number;
  UserId: number;
  Comment: string;
  CreatedAt: string;
  UpdatedAt: string;
  Username?: string;
}

interface TaskAttachment {
  Id: number;
  TaskId: number;
  FileName: string;
  FilePath: string;
  FileSize: number;
  MimeType: string;
  UploadedAt: string;
  UploadedBy: number;
  Username?: string;
}

interface Tag {
  Id: number;
  Name: string;
  Color: string;
  Description?: string;
}

interface TaskAllocation {
  Id: number;
  TaskId: number;
  UserId: number;
  AllocationDate: string;
  AllocatedHours: number;
  StartTime?: string;
  EndTime?: string;
  IsManual?: number;
  Username?: string;
}

interface TimeEntry {
  Id: number;
  TaskId: number;
  UserId: number;
  WorkDate: string;
  Hours: number;
  Description?: string;
  Username?: string;
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

export default function TaskDetailModal({
  projectId,
  organizationId,
  task,
  project,
  tasks,
  onClose,
  onSaved,
  token,
  showRemovePlanning = false,
  onRemovePlanning,
}: TaskDetailModalProps) {
  const { permissions } = usePermissions();
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'comments' | 'attachments' | 'hours' | 'checklist'>('details');
  
  // Form data for editing
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
    plannedStartDate: task?.PlannedStartDate ? task.PlannedStartDate.split('T')[0] : '',
    plannedEndDate: task?.PlannedEndDate ? task.PlannedEndDate.split('T')[0] : '',
    dependsOnTaskId: task?.DependsOnTaskId || undefined,
    applicationId: task?.ApplicationId ?? null,
    releaseVersionId: task?.ReleaseVersionId ?? null,
  });
  
  // Data states
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [taskPriorities, setTaskPriorities] = useState<StatusValue[]>([]);
  const [organizationUsers, setOrganizationUsers] = useState<User[]>([]);
  const [taskAssignees, setTaskAssignees] = useState<TaskAssignee[]>(task?.Assignees || []);
  const [taskHistory, setTaskHistory] = useState<TaskHistory[]>([]);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>([]);
  const [taskTags, setTaskTags] = useState<Tag[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [taskAllocations, setTaskAllocations] = useState<TaskAllocation[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  
  // Checklist state
  const [checklists, setChecklists] = useState<{ Id: number; TaskId: number; Text: string; IsChecked: number; DisplayOrder: number }[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [addingChecklist, setAddingChecklist] = useState(false);
  
  // Manual allocation modal state
  const [manualAllocationModal, setManualAllocationModal] = useState<{
    show: boolean;
    allocationId: number | null;
    userId: number | null;
    allocationDate: string;
    allocatedHours: string;
    mode: 'add' | 'edit';
  }>({ show: false, allocationId: null, userId: null, allocationDate: '', allocatedHours: '', mode: 'add' });
  const [users, setUsers] = useState<User[]>([]);
  const [hasChildren, setHasChildren] = useState(false);
  
  // Application & Version state
  const [applications, setApplications] = useState<{ Id: number; Name: string }[]>([]);
  const [applicationVersions, setApplicationVersions] = useState<{ Id: number; VersionNumber: string; VersionName: string | null; Status: string }[]>([]);

  // UI states
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [modalMessage, setModalMessage] = useState<
    | { type: 'alert'; title: string; message: string }
    | { type: 'confirm'; title: string; message: string; onConfirm: () => void }
    | null
  >(null);

  const showAlert = (title: string, message: string) => {
    setModalMessage({ type: 'alert', title, message });
  };

  // Calculate if this task has subtasks
  const subtasks = task ? tasks.filter(t => t.ParentTaskId === task.Id) : [];
  const hasSubtasks = subtasks.length > 0;
  const subtasksTotal = hasSubtasks 
    ? subtasks.reduce((sum, st) => sum + (parseFloat(st.EstimatedHours as any) || 0), 0) 
    : 0;

  // Timer state
  const [activeTimer, setActiveTimer] = useState<{ Id: number; TaskId: number; TaskName: string; ProjectId: number; StartedAt: string } | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadTaskStatuses();
    loadTaskPriorities();
    loadOrganizationUsers();
    loadApplications();
    if (task) {
      loadTaskDetails();
      checkHasChildren();
    }
    // Load active timer
    if (token) {
      fetch(`${getApiUrl()}/api/timers/active`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setActiveTimer(data.timer); })
        .catch(() => {});
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [task?.Id]);

  // Tick elapsed time when timer is for current task
  useEffect(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (activeTimer && task && activeTimer.TaskId === task.Id) {
      const update = () => setTimerSeconds(Math.floor((Date.now() - new Date(activeTimer.StartedAt).getTime()) / 1000));
      update();
      timerIntervalRef.current = setInterval(update, 1000);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [activeTimer, task?.Id]);

  const formatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  };

  const handleStartTimer = async () => {
    if (!task) return;
    try {
      const res = await fetch(`${getApiUrl()}/api/timers/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.Id }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveTimer(data.timer);
        window.dispatchEvent(new CustomEvent('timer-changed'));
      }
    } catch {}
  };

  const handleStopTimer = async () => {
    if (!activeTimer) return;
    try {
      const res = await fetch(`${getApiUrl()}/api/timers/${activeTimer.Id}/stop`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setActiveTimer(null);
        setTimerSeconds(0);
        window.dispatchEvent(new CustomEvent('timer-changed'));
        await loadTaskDetails(); // refresh time entries
      }
    } catch {}
  };

  const handleDiscardTimer = async () => {
    if (!activeTimer) return;
    try {
      await fetch(`${getApiUrl()}/api/timers/${activeTimer.Id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      setActiveTimer(null);
      setTimerSeconds(0);
      window.dispatchEvent(new CustomEvent('timer-changed'));
    } catch {}
  };

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

  useEffect(() => {
    if (hasSubtasks && task) {
      setFormData(prev => ({ ...prev, estimatedHours: subtasksTotal }));
    }
  }, [hasSubtasks, subtasksTotal, task]);

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

  // Get available tasks for Depends On dropdown (exclude self)
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

  const loadTaskStatuses = async () => {
    try {
      const response = await statusValuesApi.getTaskStatuses(organizationId, token);
      setTaskStatuses(response.statuses);
    } catch (err) {
      console.error('Failed to load task statuses:', err);
    }
  };

  const loadTaskPriorities = async () => {
    try {
      const response = await statusValuesApi.getTaskPriorities(organizationId, token);
      setTaskPriorities(response.priorities);
    } catch (err) {
      console.error('Failed to load task priorities:', err);
    }
  };

  const loadApplications = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/applications?organizationId=${organizationId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
        // Pre-load versions if task already has an application
        const existingAppId = task?.ApplicationId;
        if (existingAppId) {
          loadApplicationVersions(existingAppId);
        }
      }
    } catch {
      // silently skip
    }
  };

  const loadApplicationVersions = async (appId: number) => {
    try {
      const res = await fetch(`${getApiUrl()}/api/applications/${appId}/versions`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setApplicationVersions(data.versions || []);
      }
    } catch {
      setApplicationVersions([]);
    }
  };

  const loadOrganizationUsers = async () => {
    try {
      const response = await usersApi.getByOrganization(organizationId, token);
      setOrganizationUsers(response.users);
      setUsers(response.users); // Also populate users state for manual allocation modal
    } catch (err) {
      console.error('Failed to load organization users:', err);
    }
  };

  const checkHasChildren = async () => {
    if (!task) {
      setHasChildren(false);
      return;
    }
    
    try {
      const response = await fetch(`${getApiUrl()}/api/tasks/project/${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const allTasks = data.tasks || [];
        // Check if any task has this task as parent
        const hasChild = allTasks.some((t: any) => t.ParentTaskId === task.Id);
        setHasChildren(hasChild);
      }
    } catch (err) {
      console.error('Failed to check for children:', err);
      setHasChildren(false);
    }
  };

  const loadTaskDetails = async () => {
    if (!task) return;
    setLoadingData(true);
    
    try {
      // Load all task-related data in parallel
      const [historyRes, commentsRes, attachmentsRes, tagsRes, allocationsRes, timeEntriesRes, ...responses] = await Promise.all([
        fetch(`${getApiUrl()}/api/task-history/task/${task.Id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${getApiUrl()}/api/task-comments/task/${task.Id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${getApiUrl()}/api/task-attachments/task/${task.Id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${getApiUrl()}/api/tags/task/${task.Id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${getApiUrl()}/api/task-allocations/task/${task.Id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${getApiUrl()}/api/time-entries/task/${task.Id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${getApiUrl()}/api/task-checklists/task/${task.Id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
      ]);

      if (historyRes.ok) {
        const data = await historyRes.json();
        setTaskHistory(data.history || []);
      }
      if (commentsRes.ok) {
        const data = await commentsRes.json();
        setTaskComments(data.comments || []);
      }
      if (attachmentsRes.ok) {
        const data = await attachmentsRes.json();
        setTaskAttachments(data.data || []);
      }
      if (tagsRes.ok) {
        const data = await tagsRes.json();
        setTaskTags(data.tags || []);
      }
      if (allocationsRes.ok) {
        const data = await allocationsRes.json();
        setTaskAllocations(data.allocations || []);
      }
      if (timeEntriesRes.ok) {
        const data = await timeEntriesRes.json();
        setTimeEntries(data.entries || []);
      }
      const checklistRes = responses[0];
      if (checklistRes && checklistRes.ok) {
        const data = await checklistRes.json();
        setChecklists(data.items || []);
      }

      // Load available tags
      const availableTagsRes = await fetch(
        `${getApiUrl()}/api/tags/organization/${organizationId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (availableTagsRes.ok) {
        const data = await availableTagsRes.json();
        setAvailableTags(data.tags || []);
      }
    } catch (err) {
      console.error('Failed to load task details:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (task) {
        await tasksApi.update(task.Id, formData, token);

        // Sync assignees: add newly added ones, remove removed ones
        const originalIds = new Set((task.Assignees || []).map((a) => a.UserId));
        const currentIds = new Set(taskAssignees.map((a) => a.UserId));
        const toAdd = taskAssignees.filter((a) => !originalIds.has(a.UserId));
        const toRemove = (task.Assignees || []).filter((a) => !currentIds.has(a.UserId));
        await Promise.all([
          ...toAdd.map((a) => tasksApi.addAssignee(task.Id, a.UserId, token)),
          ...toRemove.map((a) => tasksApi.removeAssignee(task.Id, a.UserId, token)),
        ]);
      } else {
        const result = await tasksApi.create(formData, token);
        // Add assignees to the newly created task
        const newTaskId = result.taskId;
        await Promise.all(taskAssignees.map((a) => tasksApi.addAssignee(newTaskId, a.UserId, token)));
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save task');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddAssignee = (userId: number) => {
    const user = organizationUsers.find((u) => u.Id === userId);
    if (!user) return;
    if (taskAssignees.some((a) => a.UserId === userId)) return;
    setTaskAssignees([...taskAssignees, { UserId: user.Id, Username: user.Username, FirstName: user.FirstName, LastName: user.LastName }]);
    // Keep legacy single assignedTo in sync with the first assignee
    if (taskAssignees.length === 0) {
      setFormData({ ...formData, assignedTo: userId });
    }
  };

  const handleRemoveAssignee = (userId: number) => {
    const updated = taskAssignees.filter((a) => a.UserId !== userId);
    setTaskAssignees(updated);
    // Keep legacy single assignedTo in sync
    setFormData({ ...formData, assignedTo: updated.length > 0 ? updated[0].UserId : undefined });
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !task) return;

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
          body: JSON.stringify({ taskId: task.Id, comment: newComment.trim() }),
        }
      );

      if (response.ok) {
        setNewComment('');
        loadTaskDetails();
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
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (response.ok) {
        loadTaskDetails();
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !task) return;

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
            `${getApiUrl()}/api/task-attachments/task/${task.Id}`,
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
            loadTaskDetails();
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

  const handlePreviewAttachment = async (attachmentId: number) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/task-attachments/${attachmentId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
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
    } catch (err) {
      console.error('Failed to preview attachment:', err);
      showAlert('Preview Error', 'Failed to preview attachment');
    }
  };

  const handleDownloadAttachment = async (attachmentId: number) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/task-attachments/${attachmentId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
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
    } catch (err) {
      console.error('Failed to download attachment:', err);
      showAlert('Download Error', 'Failed to download attachment');
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/task-attachments/${attachmentId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (response.ok) {
        loadTaskDetails();
      }
    } catch (err) {
      console.error('Failed to delete attachment:', err);
    }
  };

  const handleSaveManualAllocation = async () => {
    if (!task) return;
    
    const { allocationId, userId, allocationDate, allocatedHours, mode } = manualAllocationModal;
    
    if (!userId || !allocationDate || !allocatedHours) {
      setModalMessage({
        type: 'alert',
        title: 'Validation Error',
        message: 'Please fill in all required fields (User, Date, Hours).'
      });
      return;
    }

    try {
      const method = mode === 'edit' ? 'PUT' : 'POST';
      const url = mode === 'edit' 
        ? `${getApiUrl()}/api/task-allocations/manual/${allocationId}`
        : `${getApiUrl()}/api/task-allocations/manual`;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          taskId: task.Id,
          userId,
          allocationDate,
          allocatedHours: parseFloat(allocatedHours)
        })
      });

      if (response.ok) {
        setManualAllocationModal({
          show: false,
          allocationId: null,
          userId: null,
          allocationDate: '',
          allocatedHours: '',
          mode: 'add'
        });
        loadTaskDetails(); // Reload allocations
        onSaved(); // Refresh tasks in parent component (updates Gantt)
      } else {
        const error = await response.json();
        setModalMessage({
          type: 'alert',
          title: 'Error',
          message: error.message || 'Failed to save allocation'
        });
      }
    } catch (err) {
      console.error('Failed to save manual allocation:', err);
      setModalMessage({
        type: 'alert',
        title: 'Error',
        message: 'An error occurred while saving the allocation'
      });
    }
  };

  const handleDeleteManualAllocation = async (allocationId: number) => {
    setModalMessage({
      type: 'confirm',
      title: 'Confirm Delete',
      message: 'Are you sure you want to delete this manual allocation?',
      onConfirm: async () => {
        try {
          const response = await fetch(
            `${getApiUrl()}/api/task-allocations/manual/${allocationId}`,
            {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            }
          );

          if (response.ok) {
            loadTaskDetails(); // Reload allocations
            onSaved(); // Refresh tasks in parent component (updates Gantt)
            setModalMessage(null);
          } else {
            const error = await response.json();
            setModalMessage({
              type: 'alert',
              title: 'Error',
              message: error.message || 'Failed to delete allocation'
            });
          }
        } catch (err) {
          console.error('Failed to delete manual allocation:', err);
          setModalMessage({
            type: 'alert',
            title: 'Error',
            message: 'An error occurred while deleting the allocation'
          });
        }
      }
    });
  };

  const handleAddTag = async (tagId: number) => {
    if (!task) return;
    try {
      await fetch(
        `${getApiUrl()}/api/tags/task/${task.Id}/tag/${tagId}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      loadTaskDetails();
      setShowTagSelector(false);
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    if (!task) return;
    try {
      await fetch(
        `${getApiUrl()}/api/tags/task/${task.Id}/tag/${tagId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      loadTaskDetails();
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFieldLabel = (fieldName: string): string => {
    const labels: Record<string, string> = {
      'TaskName': 'Task Name',
      'Description': 'Description',
      'Status': 'Status',
      'Priority': 'Priority',
      'AssignedTo': 'Assignee',
      'DueDate': 'Due Date',
      'PlannedStartDate': 'Planned Start',
      'PlannedEndDate': 'Planned End',
      'EstimatedHours': 'Estimated Hours',
    };
    return labels[fieldName] || fieldName;
  };

  // Calculate totals for hours tab
  const totalAllocated = taskAllocations.reduce((sum, a) => sum + parseFloat(a.AllocatedHours as any), 0);
  const totalWorked = timeEntries.reduce((sum, e) => sum + parseFloat(e.Hours as any), 0);

  // Calculate allocation period (min/max dates)
  const allocationPeriod = taskAllocations.length > 0 ? {
    start: taskAllocations.reduce((min, a) => {
      const d = a.AllocationDate.split('T')[0];
      return d < min ? d : min;
    }, taskAllocations[0].AllocationDate.split('T')[0]),
    end: taskAllocations.reduce((max, a) => {
      const d = a.AllocationDate.split('T')[0];
      return d > max ? d : max;
    }, taskAllocations[0].AllocationDate.split('T')[0]),
  } : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {task ? task.TaskName : 'Create New Task'}
              </h2>
              {task && (
                <div className="flex items-center gap-3 mt-2">
                  <span className="px-2 py-1 text-xs font-semibold rounded-full" style={{ backgroundColor: task.StatusColor ? `${task.StatusColor}20` : undefined, color: task.StatusColor || undefined }}>
                    {task.StatusName || 'Unknown'}
                  </span>
                  {task.PriorityName && (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full" style={{ backgroundColor: task.PriorityColor ? `${task.PriorityColor}20` : undefined, color: task.PriorityColor || undefined }}>
                      {task.PriorityName}
                    </span>
                  )}
                  {/* Timer widget */}
                  <div className="flex items-center gap-1 ml-auto">
                    {activeTimer && activeTimer.TaskId === task.Id ? (
                      <>
                        <span className="text-xs font-mono bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded animate-pulse">
                          ⏱ {formatElapsed(timerSeconds)}
                        </span>
                        <button
                          onClick={handleStopTimer}
                          title="Stop timer and save time entry"
                          className="text-xs px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                        >
                          ⏹ Stop
                        </button>
                        <button
                          onClick={handleDiscardTimer}
                          title="Discard timer without saving"
                          className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                        >
                          ✕
                        </button>
                      </>
                    ) : activeTimer ? (
                      <>
                        <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
                          ⏱ Running: {activeTimer.TaskName}
                        </span>
                        <button
                          onClick={handleStartTimer}
                          title="Save current timer and switch to this task"
                          className="text-xs px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                        >
                          ↩ Switch &amp; Save
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleStartTimer}
                        title="Start timer for this task"
                        className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded transition-colors"
                      >
                        ▶ Start Timer
                      </button>
                    )}
                  </div>
                </div>
              )}
              {/* Tags */}
              {task && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {taskTags.map((tag) => (
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
                      onClick={() => setShowTagSelector(!showTagSelector)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      + Add Tag
                    </button>
                    {showTagSelector && (
                      <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 z-10">
                        <div className="p-2 max-h-48 overflow-y-auto">
                          {availableTags.filter(t => !taskTags.find((tt) => tt.Id === t.Id)).length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">No more tags available</p>
                          ) : (
                            availableTags
                              .filter(t => !taskTags.find((tt) => tt.Id === t.Id))
                              .map((tag) => (
                                <button
                                  key={tag.Id}
                                  onClick={() => handleAddTag(tag.Id)}
                                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                >
                                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.Color }} />
                                  {tag.Name}
                                </button>
                              ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl ml-4"
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          {task && (
            <div className="flex gap-1 mt-4 border-b border-gray-200 dark:border-gray-700 -mb-6 pb-0">
              {(['details', 'checklist', 'hours', 'comments', 'attachments', 'history'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    activeTab === tab
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-t border-l border-r border-gray-200 dark:border-gray-700'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {tab === 'details' && '📝 Details'}
                  {tab === 'checklist' && `✅ Checklist (${checklists.length})`}
                  {tab === 'hours' && `⏱️ Hours (${totalWorked.toFixed(1)}h)`}
                  {tab === 'comments' && `💬 Comments (${taskComments.length})`}
                  {tab === 'attachments' && `📎 Files (${taskAttachments.length})`}
                  {tab === 'history' && `📜 History (${taskHistory.length})`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          {/* Details Tab (Edit Form) */}
          {(activeTab === 'details' || !task) && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {task?.CreatorName && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">Created by:</span> {task.CreatorName}
                    <span className="text-gray-500 dark:text-gray-400 ml-2">
                      on {new Date(task.CreatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              )}

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

              {/* Ticket Reference */}
              {task?.TicketNumber && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <div className="flex-1">
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Created from Ticket:</span>
                      <a
                        href={`/tickets/${task.TicketIdRef}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {task.TicketNumber} - {task.TicketTitle}
                      </a>
                      
                      {/* Jira Integration Link */}
                      {task.ExternalTicketId && task.JiraUrl && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Jira Issue:</span>
                          <a
                            href={`${task.JiraUrl}/browse/${task.ExternalTicketId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                            title={`Open in Jira: ${task.ExternalTicketId}`}
                          >
                            🔗 {task.ExternalTicketId}
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Jira Integration Link (Independent) */}
              {!task?.TicketNumber && task?.ExternalTicketId && task?.JiraUrl && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
                    </svg>
                    <div className="flex-1">
                      <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Associated Jira Issue:</span>
                      <a
                        href={`${task.JiraUrl}/browse/${task.ExternalTicketId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                        title={`Open in Jira: ${task.ExternalTicketId}`}
                      >
                        🔗 {task.ExternalTicketId}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              )}

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
                  Assignees
                </label>
                {/* Assigned users chips */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {taskAssignees.map((a) => (
                    <span
                      key={a.UserId}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded-full text-sm"
                    >
                      👤 {a.Username}{a.FirstName && a.LastName ? ` (${a.FirstName} ${a.LastName})` : ''}
                      {permissions?.canAssignTasks && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAssignee(a.UserId)}
                          className="ml-1 text-blue-600 dark:text-blue-400 hover:text-red-500 dark:hover:text-red-400 font-bold leading-none"
                          title="Remove assignee"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {taskAssignees.length === 0 && (
                    <span className="text-sm text-gray-400 dark:text-gray-500 italic">No assignees</span>
                  )}
                </div>
                {/* Add assignee dropdown */}
                {permissions?.canAssignTasks && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleAddAssignee(parseInt(e.target.value));
                  }}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">+ Add assignee…</option>
                  {organizationUsers
                    .filter((u) => !taskAssignees.some((a) => a.UserId === u.Id))
                    .map((user) => (
                      <option key={user.Id} value={user.Id}>
                        {user.Username}{user.FirstName && user.LastName ? ` (${user.FirstName} ${user.LastName})` : ''}
                      </option>
                    ))}
                </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                      <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(Auto-calculated)</span>
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
                      hasSubtasks ? 'bg-gray-100 dark:bg-gray-700 cursor-not-allowed opacity-75' : 'bg-white dark:bg-gray-700'
                    }`}
                    placeholder="e.g., 4.5"
                  />
                </div>
              </div>

              {/* Completion Percentage (computed from time entries vs estimated hours) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Completion
                  <span className="ml-2 text-blue-600 dark:text-blue-400 font-semibold">{task?.CompletionPercentage ?? 0}%</span>
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 font-normal">(auto-calculated from time entries)</span>
                </label>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ 
                      width: `${task?.CompletionPercentage ?? 0}%`,
                      backgroundColor: (task?.CompletionPercentage ?? 0) >= 100 ? '#22c55e' : (task?.CompletionPercentage ?? 0) >= 50 ? '#3b82f6' : '#f59e0b'
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Planning Dates (read-only - managed via resource planning) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Planned Start Date
                  </label>
                  <div className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm">
                    {formData.plannedStartDate ? new Date(formData.plannedStartDate + 'T12:00:00').toLocaleDateString('en-GB') : <span className="text-gray-400 dark:text-gray-500 italic">Not set</span>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Planned End Date
                  </label>
                  <div className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm">
                    {formData.plannedEndDate ? new Date(formData.plannedEndDate + 'T12:00:00').toLocaleDateString('en-GB') : <span className="text-gray-400 dark:text-gray-500 italic">Not set</span>}
                  </div>
                </div>
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

              {/* Application */}
              {applications.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Application (Optional)
                  </label>
                  <SearchableSelectComponent
                    value={formData.applicationId?.toString() ?? ''}
                    onChange={(val) => {
                      const appId = val ? parseInt(val) : null;
                      setFormData({ ...formData, applicationId: appId, releaseVersionId: null });
                      if (appId) loadApplicationVersions(appId);
                      else setApplicationVersions([]);
                    }}
                    options={applications.map(a => ({ value: a.Id, label: a.Name }))}
                    placeholder="Select application..."
                    emptyText="No application"
                  />
                </div>
              )}

              {/* Release Version — only when an application is selected */}
              {formData.applicationId && applicationVersions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Release Version (Optional)
                  </label>
                  <SearchableSelectComponent
                    value={formData.releaseVersionId?.toString() ?? ''}
                    onChange={(val) => setFormData({ ...formData, releaseVersionId: val ? parseInt(val) : null })}
                    options={applicationVersions.map(v => ({
                      value: v.Id,
                      label: `${v.VersionNumber}${v.VersionName ? ` – ${v.VersionName}` : ''} (${v.Status})`
                    }))}
                    placeholder="Select version..."
                    emptyText="Not yet released"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    The version in which this task was or will be released
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
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
                  style={{ display: (task ? permissions?.canManageTasks : permissions?.canCreateTasks) ? undefined : 'none' }}
                >
                  {isLoading ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
                </button>
              </div>
            </form>
          )}

          {/* Checklist Tab */}
          {activeTab === 'checklist' && task && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Checklist
                  {checklists.length > 0 && (
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                      {checklists.filter(c => c.IsChecked).length}/{checklists.length} done
                    </span>
                  )}
                </h3>
              </div>

              {/* Progress bar */}
              {checklists.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${Math.round((checklists.filter(c => c.IsChecked).length / checklists.length) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem] text-right">
                      {Math.round((checklists.filter(c => c.IsChecked).length / checklists.length) * 100)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Checklist items */}
              <div className="space-y-2">
                {checklists.map((item) => (
                  <div key={item.Id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg group">
                    <input
                      type="checkbox"
                      checked={!!item.IsChecked}
                      onChange={async () => {
                        try {
                          const res = await fetch(`${getApiUrl()}/api/task-checklists/${item.Id}`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ isChecked: item.IsChecked ? 0 : 1 }),
                          });
                          if (res.ok) {
                            setChecklists(prev => prev.map(c => c.Id === item.Id ? { ...c, IsChecked: item.IsChecked ? 0 : 1 } : c));
                          }
                        } catch (err) { console.error('Failed to toggle checklist item:', err); }
                      }}
                      className="w-4 h-4 rounded accent-blue-600 cursor-pointer flex-shrink-0"
                    />
                    <span className={`flex-1 text-sm ${item.IsChecked ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                      {item.Text}
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`${getApiUrl()}/api/task-checklists/${item.Id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` },
                          });
                          if (res.ok) {
                            setChecklists(prev => prev.filter(c => c.Id !== item.Id));
                          }
                        } catch (err) { console.error('Failed to delete checklist item:', err); }
                      }}
                      className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 text-sm transition-opacity ml-2"
                      title="Delete item"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Add new item */}
              <div className="flex gap-2 mt-4">
                <input
                  type="text"
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && newChecklistText.trim()) {
                      e.preventDefault();
                      setAddingChecklist(true);
                      try {
                        const res = await fetch(`${getApiUrl()}/api/task-checklists`, {
                          method: 'POST',
                          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ taskId: task.Id, text: newChecklistText.trim() }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setChecklists(prev => [...prev, data.item]);
                          setNewChecklistText('');
                        }
                      } catch (err) { console.error('Failed to add checklist item:', err); }
                      finally { setAddingChecklist(false); }
                    }
                  }}
                  placeholder="Add checklist item (press Enter)"
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <button
                  disabled={!newChecklistText.trim() || addingChecklist}
                  onClick={async () => {
                    if (!newChecklistText.trim()) return;
                    setAddingChecklist(true);
                    try {
                      const res = await fetch(`${getApiUrl()}/api/task-checklists`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ taskId: task.Id, text: newChecklistText.trim() }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setChecklists(prev => [...prev, data.item]);
                        setNewChecklistText('');
                      }
                    } catch (err) { console.error('Failed to add checklist item:', err); }
                    finally { setAddingChecklist(false); }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {addingChecklist ? '...' : 'Add'}
                </button>
              </div>

              {checklists.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <div className="text-4xl mb-2">✅</div>
                  <p>No checklist items yet.</p>
                  <p className="text-sm mt-1">Add items above to track sub-steps.</p>
                </div>
              )}
            </div>
          )}

          {/* Hours Tab */}
          {activeTab === 'hours' && task && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Estimated</div>
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {parseFloat(task.EstimatedHours as any || 0).toFixed(1)}h
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Allocated</div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {totalAllocated.toFixed(1)}h
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Worked</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {totalWorked.toFixed(1)}h
                  </div>
                </div>
              </div>

              {/* Allocation Period */}
              {allocationPeriod && (
                <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Allocation Period:</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded font-medium">
                      {new Date(allocationPeriod.start + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded font-medium">
                      {new Date(allocationPeriod.end + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 text-xs ml-1">
                      ({Math.round((new Date(allocationPeriod.end).getTime() - new Date(allocationPeriod.start).getTime()) / 86400000) + 1} days)
                    </span>
                  </div>
                </div>
              )}

              {/* Allocations */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Planned Allocations</h3>
                  {!hasChildren && (
                    <button
                      onClick={() => setManualAllocationModal({ 
                        show: true, 
                        allocationId: null, 
                        userId: null, 
                        allocationDate: '', 
                        allocatedHours: '', 
                        mode: 'add' 
                      })}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors flex items-center gap-1"
                    >
                      <span>+</span>
                      <span>Add Manual Allocation</span>
                    </button>
                  )}
                </div>
                {loadingData ? (
                  <p className="text-gray-500 dark:text-gray-400">Loading...</p>
                ) : taskAllocations.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">No allocations found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Start</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">End</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Hours</th>
                          {!hasChildren && <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {taskAllocations.map((allocation) => (
                          <tr key={allocation.Id}>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                              {new Date(allocation.AllocationDate).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {allocation.Username || `User ${allocation.UserId}`}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {allocation.StartTime || '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {allocation.EndTime || '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-right font-medium text-gray-900 dark:text-white">
                              {parseFloat(allocation.AllocatedHours as any).toFixed(1)}h
                            </td>
                            {!hasChildren && (
                              <td className="px-4 py-2 text-sm text-center">
                                {allocation.IsManual === 1 ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => setManualAllocationModal({
                                        show: true,
                                        allocationId: allocation.Id || null,
                                        userId: allocation.UserId,
                                        allocationDate: new Date(allocation.AllocationDate).toISOString().split('T')[0],
                                        allocatedHours: String(allocation.AllocatedHours),
                                        mode: 'edit'
                                      })}
                                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                      title="Edit"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      onClick={() => handleDeleteManualAllocation(allocation.Id!)}
                                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                                      title="Delete"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-600 text-xs">Auto</span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Time Entries */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Time Entries</h3>
                {loadingData ? (
                  <p className="text-gray-500 dark:text-gray-400">Loading...</p>
                ) : timeEntries.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">No time entries found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Hours</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Description</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {timeEntries.map((entry) => (
                          <tr key={entry.Id}>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                              {new Date(entry.WorkDate).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {entry.Username || `User ${entry.UserId}`}
                            </td>
                            <td className="px-4 py-2 text-sm text-right font-medium text-gray-900 dark:text-white">
                              {parseFloat(entry.Hours as any).toFixed(1)}h
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {entry.Description || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Remove Planning Button */}
              {showRemovePlanning && taskAllocations.length > 0 && onRemovePlanning && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={onRemovePlanning}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    🗑️ Remove Planning
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    This will remove all planned allocations for this task.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Comments Tab */}
          {activeTab === 'comments' && task && (
            <div className="space-y-4">
              {/* Add Comment Form */}
              <form onSubmit={handleAddComment} className="space-y-3">
                <RichTextEditor
                  content={newComment}
                  onChange={setNewComment}
                  placeholder="Write a comment..."
                />
                <button
                  type="submit"
                  disabled={submittingComment || !newComment.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {submittingComment ? 'Posting...' : 'Post'}
                </button>
              </form>

              {/* Comments List */}
              {loadingData ? (
                <p className="text-gray-500 dark:text-gray-400">Loading comments...</p>
              ) : taskComments.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">No comments yet. Be the first to comment!</p>
              ) : (
                <div className="space-y-4">
                  {taskComments.map((comment) => (
                    <div key={comment.Id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {comment.Username || `User ${comment.UserId}`}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(comment.CreatedAt).toLocaleString()}
                          </span>
                          {permissions?.canManageTasks && (
                          <button
                            onClick={() => handleDeleteComment(comment.Id)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete comment"
                          >
                            🗑️
                          </button>
                          )}
                        </div>
                      </div>
                      <div
                        className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: comment.Comment }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Attachments Tab */}
          {activeTab === 'attachments' && task && (
            <div className="space-y-4">
              {/* Upload Button */}
              <div className="flex items-center gap-4">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={uploadingFile}
                  />
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                    {uploadingFile ? 'Uploading...' : '📎 Upload File'}
                  </span>
                </label>
              </div>

              {/* Attachments List */}
              {loadingData ? (
                <p className="text-gray-500 dark:text-gray-400">Loading attachments...</p>
              ) : taskAttachments.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">No attachments yet.</p>
              ) : (
                <div className="space-y-3">
                  {taskAttachments.map((attachment) => {
                    const canPreview = attachment.MimeType?.startsWith('image/') || attachment.MimeType === 'application/pdf';
                    return (
                      <div key={attachment.Id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">📄</span>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">{attachment.FileName}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(attachment.FileSize)} • Uploaded by {attachment.Username || `User ${attachment.UploadedBy}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canPreview && (
                            <button
                              onClick={() => handlePreviewAttachment(attachment.Id)}
                              className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 transition-colors"
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
                            className="p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                            title="Download"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </button>
                          {permissions?.canManageTasks && (
                          <button
                            onClick={() => handleDeleteAttachment(attachment.Id)}
                            className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && task && (
            <div className="space-y-4">
              {loadingData ? (
                <p className="text-gray-500 dark:text-gray-400">Loading history...</p>
              ) : taskHistory.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">No history available.</p>
              ) : (
                <div className="space-y-3">
                  {taskHistory.map((entry) => (
                    <div key={entry.Id} className="flex gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm ${
                          entry.Action === 'created' ? 'bg-green-500' :
                          entry.Action === 'updated' ? 'bg-blue-500' :
                          entry.Action === 'deleted' ? 'bg-red-500' : 'bg-gray-500'
                        }`}>
                          {entry.Action === 'created' ? '✚' :
                           entry.Action === 'updated' ? '✎' :
                           entry.Action === 'deleted' ? '✕' : '?'}
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {entry.Username || `User ${entry.UserId}`}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(entry.CreatedAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                          {entry.Action === 'created' && 'Created this task'}
                          {entry.Action === 'updated' && entry.FieldName && (
                            <>
                              Changed <span className="font-medium">{getFieldLabel(entry.FieldName)}</span>
                              {entry.OldValue && entry.NewValue && (
                                <>
                                  {' '}from <span className="text-red-600 dark:text-red-400 line-through">{entry.OldValue}</span>
                                  {' '}to <span className="text-green-600 dark:text-green-400">{entry.NewValue}</span>
                                </>
                              )}
                              {!entry.OldValue && entry.NewValue && (
                                <>
                                  {' '}to <span className="text-green-600 dark:text-green-400">{entry.NewValue}</span>
                                </>
                              )}
                              {entry.OldValue && !entry.NewValue && (
                                <>
                                  {' '}(removed <span className="text-red-600 dark:text-red-400">{entry.OldValue}</span>)
                                </>
                              )}
                            </>
                          )}
                          {entry.Action === 'deleted' && 'Deleted this task'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Alocação Manual */}
      {manualAllocationModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                {manualAllocationModal.mode === 'add' ? 'Add Manual Allocation' : 'Edit Manual Allocation'}
              </h3>
              
              <div className="space-y-4">
                {/* User */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    User *
                  </label>
                  <select
                    value={manualAllocationModal.userId || ''}
                    onChange={(e) => setManualAllocationModal(prev => ({ ...prev, userId: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Select user...</option>
                    {users.map(user => (
                      <option key={user.Id} value={user.Id}>
                        {user.FirstName} {user.LastName} ({user.Username})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={manualAllocationModal.allocationDate}
                    onChange={(e) => setManualAllocationModal(prev => ({ ...prev, allocationDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Hours */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Hours *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="24"
                    value={manualAllocationModal.allocatedHours}
                    onChange={(e) => setManualAllocationModal(prev => ({ ...prev, allocatedHours: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Start/end times will be calculated automatically. If this crosses lunch time, it will be split into 2 allocations.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setManualAllocationModal({
                    show: false,
                    allocationId: null,
                    userId: null,
                    allocationDate: '',
                    allocatedHours: '',
                    mode: 'add'
                  })}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveManualAllocation}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  {manualAllocationModal.mode === 'add' ? 'Add' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Alerta */}
      {modalMessage && modalMessage.type === 'alert' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                {modalMessage.title}
              </h3>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                {modalMessage.message}
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => setModalMessage(null)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação */}
      {modalMessage && modalMessage.type === 'confirm' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                {modalMessage.title}
              </h3>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                {modalMessage.message}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setModalMessage(null)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (modalMessage.onConfirm) {
                      modalMessage.onConfirm();
                    }
                  }}
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
  );
}
