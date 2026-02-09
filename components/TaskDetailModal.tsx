'use client';

import { getApiUrl } from '@/lib/api/config';

import React, { useState, useEffect } from 'react';
import { Task, CreateTaskData, tasksApi } from '@/lib/api/tasks';
import { Project } from '@/lib/api/projects';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { usersApi, User } from '@/lib/api/users';

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
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'comments' | 'attachments' | 'hours'>('details');
  
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
  });
  
  // Data states
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [taskPriorities, setTaskPriorities] = useState<StatusValue[]>([]);
  const [organizationUsers, setOrganizationUsers] = useState<User[]>([]);
  const [taskHistory, setTaskHistory] = useState<TaskHistory[]>([]);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>([]);
  const [taskTags, setTaskTags] = useState<Tag[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [taskAllocations, setTaskAllocations] = useState<TaskAllocation[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  
  // UI states
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [modalMessage, setModalMessage] = useState<{ type: 'alert'; title: string; message: string } | null>(null);

  const showAlert = (title: string, message: string) => {
    setModalMessage({ type: 'alert', title, message });
  };

  // Calculate if this task has subtasks
  const subtasks = task ? tasks.filter(t => t.ParentTaskId === task.Id) : [];
  const hasSubtasks = subtasks.length > 0;
  const subtasksTotal = hasSubtasks 
    ? subtasks.reduce((sum, st) => sum + (parseFloat(st.EstimatedHours as any) || 0), 0) 
    : 0;

  useEffect(() => {
    loadTaskStatuses();
    loadTaskPriorities();
    loadOrganizationUsers();
    if (task) {
      loadTaskDetails();
    }
  }, [task?.Id]);

  useEffect(() => {
    if (hasSubtasks && task) {
      setFormData(prev => ({ ...prev, estimatedHours: subtasksTotal }));
    }
  }, [hasSubtasks, subtasksTotal, task]);

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

  const loadOrganizationUsers = async () => {
    try {
      const response = await usersApi.getByOrganization(organizationId, token);
      setOrganizationUsers(response.users);
    } catch (err) {
      console.error('Failed to load organization users:', err);
    }
  };

  const loadTaskDetails = async () => {
    if (!task) return;
    setLoadingData(true);
    
    try {
      // Load all task-related data in parallel
      const [historyRes, commentsRes, attachmentsRes, tagsRes, allocationsRes, timeEntriesRes] = await Promise.all([
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
              {(['details', 'hours', 'comments', 'attachments', 'history'] as const).map((tab) => (
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
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter task description"
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
                      taskStatuses.sort((a, b) => a.SortOrder - b.SortOrder).map((status) => (
                        <option key={status.Id} value={status.Id}>
                          {status.StatusName}
                        </option>
                      ))
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
                      taskPriorities.sort((a, b) => a.SortOrder - b.SortOrder).map((priority) => (
                        <option key={priority.Id} value={priority.Id}>
                          {priority.PriorityName}
                        </option>
                      ))
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

              {/* Planning Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Planned Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.plannedStartDate || ''}
                    onChange={(e) => setFormData({ ...formData, plannedStartDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Planned End Date
                  </label>
                  <input
                    type="date"
                    value={formData.plannedEndDate || ''}
                    onChange={(e) => setFormData({ ...formData, plannedEndDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Parent Task (Optional)
                </label>
                <select
                  value={formData.parentTaskId || ''}
                  onChange={(e) => setFormData({ ...formData, parentTaskId: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">No Parent (Top-level task)</option>
                  {tasks
                    .filter(t => t.Id !== task?.Id && !t.ParentTaskId)
                    .map(t => (
                      <option key={t.Id} value={t.Id}>
                        {t.TaskName}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Depends On (Optional)
                </label>
                <select
                  value={formData.dependsOnTaskId || ''}
                  onChange={(e) => setFormData({ ...formData, dependsOnTaskId: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">No Dependency</option>
                  {tasks
                    .filter(t => t.Id !== task?.Id)
                    .map(t => (
                      <option key={t.Id} value={t.Id}>
                        {t.TaskName}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  This task can only be planned after the selected task is completed.
                </p>
              </div>

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
                >
                  {isLoading ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
                </button>
              </div>
            </form>
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
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Planned Allocations</h3>
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
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Start</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">End</th>
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
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {entry.StartTime || '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {entry.EndTime || '-'}
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
              <form onSubmit={handleAddComment} className="flex gap-3">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                          <button
                            onClick={() => handleDeleteComment(comment.Id)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete comment"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{comment.Comment}</p>
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
                  {taskAttachments.map((attachment) => (
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
                        <button
                          onClick={() => handleDownloadAttachment(attachment.Id)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          title="Download"
                        >
                          ⬇️
                        </button>
                        <button
                          onClick={() => handleDeleteAttachment(attachment.Id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
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
    </div>
  );
}
