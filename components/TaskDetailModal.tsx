'use client';

import { getApiUrl } from '@/lib/api/config';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import { Task, CreateTaskData, UpdateTaskData, tasksApi, TaskAssignee } from '@/lib/api/tasks';
import { Project, projectsApi } from '@/lib/api/projects';
import { Customer, getCustomersByOrganization } from '@/lib/api/customers';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { usersApi, User } from '@/lib/api/users';
import RichTextEditor from './RichTextEditor';
import SearchableSelectComponent from './SearchableSelect';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useToast } from '@/contexts/ToastContext';
import CustomFieldsFormSection from '@/components/custom-fields/CustomFieldsFormSection';
import { CustomFieldValues, extractCustomFieldValues } from '@/lib/customFields';
import { useFormatHours } from '@/lib/useFormatHours';

interface TaskDetailModalProps {
  projectId: number;
  organizationId: number;
  task: Task | null;
  project: Project;
  tasks: Task[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  token: string;
  // jiraIntegration prop removed; integration is fetched internally
  onOpenTask?: (task: Task) => void;
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

const clampColorChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const normalizeHexColor = (color: string | undefined): string => {
  const fallback = '#6B7280';
  if (!color) return fallback;
  const trimmed = color.trim();
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex.split('').map((char) => char + char).join('')}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex}`;
  }

  return fallback;
};

const hexToRgb = (color: string): { r: number; g: number; b: number } => {
  const normalized = normalizeHexColor(color);
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }): string => {
  const toHex = (value: number) => clampColorChannel(value).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const blendHexColors = (baseColor: string, mixColor: string, ratio: number): string => {
  const base = hexToRgb(baseColor);
  const mix = hexToRgb(mixColor);
  const mixRatio = Math.max(0, Math.min(1, ratio));
  const baseRatio = 1 - mixRatio;

  return rgbToHex({
    r: base.r * baseRatio + mix.r * mixRatio,
    g: base.g * baseRatio + mix.g * mixRatio,
    b: base.b * baseRatio + mix.b * mixRatio,
  });
};

const withAlpha = (color: string, alphaHex: string): string => `${normalizeHexColor(color)}${alphaHex}`;

interface TaskAllocation {
  Id: number;
  TaskId: number;
  TaskAllocationHeaderId?: number | null;
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
  autoSelectSingleOption = false,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  options: { id: number; label: string }[];
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  autoSelectSingleOption?: boolean;
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

  useEffect(() => {
    if (!autoSelectSingleOption) return;
    if (value !== undefined && value !== null) return;
    if (options.length !== 1) return;

    const onlyOption = options[0];
    if (!onlyOption || !Number.isFinite(Number(onlyOption.id))) return;

    onChange(onlyOption.id);
  }, [autoSelectSingleOption, value, options, onChange]);

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
  // jiraIntegration removed from props
  onOpenTask,
  showRemovePlanning = false,
  onRemovePlanning,
}: TaskDetailModalProps) {
  const decimalHoursToHMS = useFormatHours();
  const router = useRouter();
    const { showToast } = useToast();
  // Integration state
  const [jiraIntegration, setJiraIntegration] = useState<any>(null);

  // Fetch Jira integration when organizationId or token changes
  useEffect(() => {
    if (organizationId && token) {
      const fetchIntegration = async () => {
        try {
          const response = await fetch(`${getApiUrl()}/api/jira-integrations/organization/${organizationId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            if (data.integration?.IsEnabled) {
              setJiraIntegration(data.integration);
            } else {
              setJiraIntegration(null);
            }
          } else {
            setJiraIntegration(null);
          }
        } catch {
          setJiraIntegration(null);
        }
      };
      fetchIntegration();
    } else {
      setJiraIntegration(null);
    }
  }, [organizationId, token]);
  const { permissions } = usePermissions();
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'comments' | 'attachments' | 'hours' | 'checklist'>('details');
  
  // Form data for editing
  const [formData, setFormData] = useState<CreateTaskData>({
    projectId,
    taskName: task?.TaskName || '',
    description: task?.Description || '',
    status: task?.Status ?? null,
    priority: task?.Priority ?? null,
    taskType: task?.TaskType ?? null,
    assignedTo: task?.AssignedTo || undefined,
    dueDate: task?.DueDate ? task.DueDate.split('T')[0] : '',
    dueDateMandatory: task?.DueDateMandatory === 1,
    unscheduledWork: task?.UnscheduledWork === 1,
    estimatedHours: task?.EstimatedHours || undefined,
    storyPoints: task?.StoryPoints || undefined,
    parentTaskId: task?.ParentTaskId || undefined,
    plannedStartDate: task?.PlannedStartDate ? task.PlannedStartDate.split('T')[0] : '',
    plannedEndDate: task?.PlannedEndDate ? task.PlannedEndDate.split('T')[0] : '',
    dependsOnTaskId: task?.DependsOnTaskId || undefined,
    customerId: task?.CustomerId ?? null,
    jiraIssueKey: task?.JiraIssueKey || undefined,
    gitHubIssueNumber: task?.GitHubIssueNumber ?? null,
    giteaIssueNumber: task?.GiteaIssueNumber ?? null,
    applicationId: task?.ApplicationId ?? null,
    releaseVersionId: task?.ReleaseVersionId ?? null,
  });
  const [customFields, setCustomFields] = useState<CustomFieldValues>(() => extractCustomFieldValues(task));
  
  // Data states
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [taskPriorities, setTaskPriorities] = useState<StatusValue[]>([]);
  const [taskTypes, setTaskTypes] = useState<StatusValue[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
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
  const [childTasksFromProject, setChildTasksFromProject] = useState<Task[]>([]);
  
  // Application & Version state
  const [applications, setApplications] = useState<{ Id: number; Name: string }[]>([]);
  const [applicationVersions, setApplicationVersions] = useState<{ Id: number; VersionNumber: string; VersionName: string | null; Status: string }[]>([]);

  // UI states
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [allocationsPage, setAllocationsPage] = useState(1);
  const [timeEntriesPage, setTimeEntriesPage] = useState(1);
  const [hoursSubTab, setHoursSubTab] = useState<'planning' | 'allocations' | 'time'>('planning');
  const [expandedAllocationGroups, setExpandedAllocationGroups] = useState<Set<string>>(new Set());
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [modalMessage, setModalMessage] = useState<
    | { type: 'alert'; title: string; message: string }
    | { type: 'confirm'; title: string; message: string; onConfirm: () => void }
    | { type: 'delete-choice'; title: string; message: string; onDeleteOnly: () => void; onDeleteWithSubtasks: () => void }
    | null
  >(null);
  const [showTaskActionsMenu, setShowTaskActionsMenu] = useState(false);
  const [moveTaskModal, setMoveTaskModal] = useState<{ mode: 'existing' | 'create'; open: boolean }>({ mode: 'existing', open: false });
  const [moveTargetProjectId, setMoveTargetProjectId] = useState<number | undefined>(undefined);
  const [availableMoveProjects, setAvailableMoveProjects] = useState<Project[]>([]);
  const [isMovingTask, setIsMovingTask] = useState(false);
  const [newProjectNameForMove, setNewProjectNameForMove] = useState('');
  const [projectStatusesForMove, setProjectStatusesForMove] = useState<StatusValue[]>([]);
  const [loadingMoveMetadata, setLoadingMoveMetadata] = useState(false);
  const taskActionsMenuRef = useRef<HTMLDivElement>(null);

  // AI translate/summarize state
  const [isAiAvailable, setIsAiAvailable] = useState(false);
  const [aiResultText, setAiResultText] = useState('');
  const [aiResultType, setAiResultType] = useState<'translate' | 'summarize' | null>(null);
  const [aiTargetLanguage, setAiTargetLanguage] = useState('');
  const [showLangInput, setShowLangInput] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [addingAiComment, setAddingAiComment] = useState(false);

  const showAlert = (title: string, message: string) => {
    setModalMessage({ type: 'alert', title, message });
  };

  const setErrorWithToast = (message: string) => {
    setError(message);
    showToast({ type: 'error', title: 'Task Error', message });
  };

  // Calculate if this task has subtasks
  const subtasks = task?.Id ? tasks.filter(t => t.ParentTaskId === task.Id) : [];
  const isGlobalProject = !!project?.IsGlobal;
  const hasSubtasks = subtasks.length > 0;
  const hasAnyChildren = hasSubtasks || hasChildren;
  const taskEstimatedHours = parseFloat(String(task?.EstimatedHours ?? 0)) || 0;
  const canShowAddManualAllocation = taskEstimatedHours < 8;
  const childTasks = hasSubtasks ? subtasks : childTasksFromProject;
  const externalTicketId = task?.ExternalTicketId || null;
  const externalIssueId = task?.ExternalIssueId || null;
  const jiraIssueKeyValue = formData.jiraIssueKey ? String(formData.jiraIssueKey).trim() : '';
  const gitHubIssueNumberValue = formData.gitHubIssueNumber ?? null;
  const giteaIssueNumberValue = formData.giteaIssueNumber ?? null;
  const jiraTicketBaseUrl = task?.JiraUrl || jiraIntegration?.JiraUrl || null;
  const jiraBoardBaseUrl = jiraIntegration?.JiraProjectsUrl || jiraIntegration?.JiraUrl || task?.JiraUrl || null;
  const hasJiraTicketIntegrationConfigured = Boolean(jiraIntegration?.JiraUrl);
  const hasGitHubIntegrationConfigured = Boolean(project?.GitHubOwner && project?.GitHubRepo);
  const hasGiteaIntegrationConfigured = Boolean(project?.GiteaOwner && project?.GiteaRepo);
  const hasTicketJiraReference = Boolean(externalTicketId && jiraTicketBaseUrl);
  const hasJiraTicketImportReference = Boolean(jiraIssueKeyValue && jiraIntegration?.JiraUrl);
  const hasJiraBoardImportReference = Boolean(externalIssueId && jiraBoardBaseUrl);
  const hasGitHubIssueReference = Boolean(gitHubIssueNumberValue);
  const hasGiteaIssueReference = Boolean(giteaIssueNumberValue);
  const showGitHubIssueSection = hasGitHubIntegrationConfigured;
  const showGiteaIssueSection = hasGiteaIntegrationConfigured;
  const showAnySourceControlIssueSection = showGitHubIssueSection || showGiteaIssueSection;
  const githubIssueUrl = hasGitHubIssueReference && project?.GitHubOwner && project?.GitHubRepo
    ? `https://github.com/${project.GitHubOwner}/${project.GitHubRepo}/issues/${gitHubIssueNumberValue}`
    : null;
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
    loadTaskTypes();
    loadOrganizationUsers();
    if (isGlobalProject) {
      loadCustomers();
    }
    loadApplications();
    if (task?.Id) {
      loadTaskDetails();
      checkHasChildren();
    }
    // Load active timer
    if (token) {
      fetch(`${getApiUrl()}/api/timers/active`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setActiveTimer(data.timer); })
        .catch(() => {});
      // Check OpenAI availability for translate/summarize features
      fetch(`${getApiUrl()}/api/ai-assistant/availability`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setIsAiAvailable(Boolean(data.configured)); })
        .catch(() => {});
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [task?.Id, isGlobalProject, organizationId]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!taskActionsMenuRef.current) return;
      if (!taskActionsMenuRef.current.contains(event.target as Node)) {
        setShowTaskActionsMenu(false);
      }
    };

    if (showTaskActionsMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showTaskActionsMenu]);

  // Tick elapsed time when timer is for current task
  useEffect(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (activeTimer && task?.Id && activeTimer.TaskId === task.Id) {
      const toUtcMs = (s: string) => {
        if (!s) return Date.now();
        if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s).getTime();
        return new Date(s.replace(' ', 'T') + 'Z').getTime();
      };
      const update = () => setTimerSeconds(Math.max(0, Math.floor((Date.now() - toUtcMs(activeTimer.StartedAt)) / 1000)));
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
    if (!task?.Id) return;
    try {
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`${getApiUrl()}/api/timers/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.Id, clientTimezone }),
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
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`${getApiUrl()}/api/timers/${activeTimer.Id}/stop`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientTimezone }),
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
    if (!task?.Id && taskStatuses.length > 0 && taskPriorities.length > 0 && taskTypes.length > 0) {
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

        if (prev.taskType === null) {
          const defaultTaskType = taskTypes.find(t => t.IsDefault);
          if (defaultTaskType) {
            updates.taskType = defaultTaskType.Id;
          }
        }
        
        return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
      });
    }
  }, [task, taskStatuses, taskPriorities, taskTypes]);

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
    if (!task?.Id) {
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
    if (!task?.Id) {
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

  const loadTaskTypes = async () => {
    try {
      const response = await statusValuesApi.getTaskTypes(organizationId, token);
      setTaskTypes(response.types);
    } catch (err) {
      console.error('Failed to load task types:', err);
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

  const loadCustomers = async () => {
    try {
      const customerList = await getCustomersByOrganization(token, organizationId);
      setCustomers(customerList || []);
    } catch (err) {
      console.error('Failed to load customers:', err);
      setCustomers([]);
    }
  };

  const checkHasChildren = async () => {
    if (!task?.Id) {
      setHasChildren(false);
      setChildTasksFromProject([]);
      return;
    }
    
    try {
      const response = await fetch(`${getApiUrl()}/api/tasks/project/${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const allTasks = data.tasks || [];
        const children = allTasks.filter((t: any) => Number(t.ParentTaskId) === Number(task.Id));
        setChildTasksFromProject(children);
        setHasChildren(children.length > 0);
      }
    } catch (err) {
      console.error('Failed to check for children:', err);
      setHasChildren(false);
      setChildTasksFromProject([]);
    }
  };

  const loadTaskDetails = async () => {
    if (!task?.Id) return;
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
      showToast({ type: 'error', title: 'Task Error', message: 'Failed to load task details' });
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');

    if (!formData.taskType) {
      setErrorWithToast('Task type is required');
      return;
    }

    if (formData.dueDateMandatory && !formData.dueDate) {
      setErrorWithToast('Due date is required when due date is mandatory');
      return;
    }

    if (isGlobalProject && !formData.customerId) {
      setErrorWithToast('Customer is required for tasks in global projects');
      return;
    }

    setIsLoading(true);

    try {
      const normalizedJiraIssueKey = formData.jiraIssueKey === undefined
        ? undefined
        : (formData.jiraIssueKey === null || String(formData.jiraIssueKey).trim() === ''
          ? ''
          : String(formData.jiraIssueKey).trim());

      const normalizedGitHubIssueNumber = formData.gitHubIssueNumber === undefined
        ? undefined
        : (formData.gitHubIssueNumber === null || String(formData.gitHubIssueNumber).trim() === ''
          ? null
          : Number(formData.gitHubIssueNumber));

      const normalizedGiteaIssueNumber = formData.giteaIssueNumber === undefined
        ? undefined
        : (formData.giteaIssueNumber === null || String(formData.giteaIssueNumber).trim() === ''
          ? null
          : Number(formData.giteaIssueNumber));

      const normalizedAssignedTo = formData.assignedTo === undefined
        ? null
        : formData.assignedTo;

      const normalizedEstimatedHours = formData.estimatedHours === undefined
        ? null
        : formData.estimatedHours;

      const normalizedStoryPoints = formData.storyPoints === undefined
        ? null
        : formData.storyPoints;

      const normalizedParentTaskId = formData.parentTaskId === undefined
        ? null
        : formData.parentTaskId;

      const normalizedDependsOnTaskId = formData.dependsOnTaskId === undefined
        ? null
        : formData.dependsOnTaskId;

      if (task?.Id) {
        const payload: UpdateTaskData = {
          projectId: formData.projectId,
          taskName: formData.taskName,
          description: formData.description || '',
          status: formData.status ?? null,
          priority: formData.priority ?? null,
          taskType: formData.taskType ?? null,
          assignedTo: normalizedAssignedTo,
          dueDate: formData.dueDate || '',
          dueDateMandatory: !!formData.dueDateMandatory,
          unscheduledWork: !!formData.unscheduledWork,
          estimatedHours: normalizedEstimatedHours,
          storyPoints: normalizedStoryPoints,
          parentTaskId: normalizedParentTaskId,
          plannedStartDate: formData.plannedStartDate || '',
          plannedEndDate: formData.plannedEndDate || '',
          dependsOnTaskId: normalizedDependsOnTaskId,
          customerId: formData.customerId ?? null,
          jiraIssueKey: normalizedJiraIssueKey ?? '',
          gitHubIssueNumber: normalizedGitHubIssueNumber ?? null,
          giteaIssueNumber: normalizedGiteaIssueNumber ?? null,
          applicationId: formData.applicationId ?? null,
          releaseVersionId: formData.releaseVersionId ?? null,
          customFields,
        };
        await tasksApi.update(task.Id, payload, token);

        // Sync assignees: add newly added ones, remove removed ones
        const originalIds = new Set((task.Assignees || []).map((a) => a.UserId));
        const currentIds = new Set(taskAssignees.map((a) => a.UserId));
        const toAdd = taskAssignees.filter((a) => !originalIds.has(a.UserId));
        const toRemove = (task.Assignees || []).filter((a) => !currentIds.has(a.UserId));
        try {
          await Promise.all([
            ...toAdd.map((a) => tasksApi.addAssignee(task.Id, a.UserId, token)),
            ...toRemove.map((a) => tasksApi.removeAssignee(task.Id, a.UserId, token)),
          ]);
        } catch (assigneeSyncError) {
          console.error('Task saved, but assignee sync failed:', assigneeSyncError);
        }
      } else {
        const payload: CreateTaskData = {
          projectId: formData.projectId,
          taskName: formData.taskName,
          description: formData.description || '',
          status: formData.status ?? null,
          priority: formData.priority ?? null,
          taskType: formData.taskType ?? null,
          assignedTo: formData.assignedTo ?? undefined,
          dueDate: formData.dueDate || '',
          dueDateMandatory: !!formData.dueDateMandatory,
          unscheduledWork: !!formData.unscheduledWork,
          estimatedHours: formData.estimatedHours ?? undefined,
          storyPoints: formData.storyPoints ?? undefined,
          parentTaskId: formData.parentTaskId ?? undefined,
          plannedStartDate: formData.plannedStartDate || '',
          plannedEndDate: formData.plannedEndDate || '',
          dependsOnTaskId: formData.dependsOnTaskId ?? undefined,
          customerId: formData.customerId ?? null,
          jiraIssueKey: normalizedJiraIssueKey ?? '',
          gitHubIssueNumber: normalizedGitHubIssueNumber ?? null,
          giteaIssueNumber: normalizedGiteaIssueNumber ?? null,
          applicationId: formData.applicationId ?? null,
          releaseVersionId: formData.releaseVersionId ?? null,
          customFields,
        };
        const result = await tasksApi.create(payload, token);
        // Add assignees to the newly created task
        const newTaskId = result.taskId;
        try {
          await Promise.all(taskAssignees.map((a) => tasksApi.addAssignee(newTaskId, a.UserId, token)));
        } catch (assigneeSyncError) {
          console.error('Task created, but assignee sync failed:', assigneeSyncError);
        }
      }
      await Promise.resolve(onSaved());
      onClose();
    } catch (err: any) {
      setErrorWithToast(err.message || 'Failed to save task');
    } finally {
      setIsLoading(false);
    }
  };

  const executeDeleteTask = async (deleteSubtasks: boolean) => {
    if (!task?.Id) return;

    setIsDeleting(true);
    try {
      await tasksApi.delete(task.Id, token, { deleteSubtasks });
      setModalMessage(null);
      onSaved();
    } catch (err: any) {
      setModalMessage({
        type: 'alert',
        title: 'Delete Failed',
        message: err.message || 'Failed to delete task',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteFromModal = () => {
    if (!task?.Id) return;

    if (hasAnyChildren) {
      setModalMessage({
        type: 'delete-choice',
        title: 'Delete Task with Subtasks?',
        message: 'This task has subtasks. Do you want to delete only this task, or delete this task and all subtasks (including related allocations)?',
        onDeleteOnly: () => executeDeleteTask(false),
        onDeleteWithSubtasks: () => executeDeleteTask(true),
      });
      return;
    }

    setModalMessage({
      type: 'confirm',
      title: 'Delete Task',
      message: 'Are you sure you want to delete this task?',
      onConfirm: () => executeDeleteTask(false),
    });
  };

  const loadMoveTaskMetadata = async () => {
    setLoadingMoveMetadata(true);
    try {
      const [projectsResponse, projectStatusesResponse] = await Promise.all([
        projectsApi.getAll(token),
        statusValuesApi.getProjectStatuses(organizationId, token),
      ]);

      const organizationProjects = (projectsResponse.projects || []).filter(
        (entry) => Number(entry.OrganizationId) === Number(organizationId) && Number(entry.Id) !== Number(projectId)
      );

      setAvailableMoveProjects(organizationProjects);
      setProjectStatusesForMove(projectStatusesResponse.statuses || []);
    } catch (err: any) {
      setErrorWithToast(err.message || 'Failed to load move options');
    } finally {
      setLoadingMoveMetadata(false);
    }
  };

  const openMoveToExistingProjectModal = async () => {
    setShowTaskActionsMenu(false);
    setMoveTaskModal({ mode: 'existing', open: true });
    await loadMoveTaskMetadata();
  };

  const openCreateProjectAndMoveModal = async () => {
    setShowTaskActionsMenu(false);
    setMoveTaskModal({ mode: 'create', open: true });
    await loadMoveTaskMetadata();
  };

  const closeMoveTaskModal = () => {
    setMoveTaskModal({ mode: 'existing', open: false });
    setMoveTargetProjectId(undefined);
    setNewProjectNameForMove('');
  };

  const moveTaskSubtreeToProject = async (targetProjectId: number) => {
    if (!task?.Id) return;

    setIsMovingTask(true);
    setError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/tasks/${task.Id}/move-project`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetProjectId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to move task');
      }

      closeMoveTaskModal();
      showAlert('Task Moved', data.message || 'Task and subtasks moved successfully.');
      onSaved();
      onClose();
    } catch (err: any) {
      setErrorWithToast(err.message || 'Failed to move task');
    } finally {
      setIsMovingTask(false);
    }
  };

  const handleConfirmMoveToExistingProject = async () => {
    if (!moveTargetProjectId) {
      setErrorWithToast('Please select a target project');
      return;
    }

    await moveTaskSubtreeToProject(moveTargetProjectId);
  };

  const handleCreateProjectAndMove = async () => {
    const projectName = newProjectNameForMove.trim();
    if (!projectName) {
      setErrorWithToast('Project name is required');
      return;
    }

    const defaultStatus = projectStatusesForMove.find((status) => Number(status.IsDefault) === 1) || projectStatusesForMove[0];
    if (!defaultStatus?.Id) {
      setErrorWithToast('No project status is available for this organization');
      return;
    }

    setIsMovingTask(true);
    setError('');
    try {
      const createResult = await projectsApi.create(
        {
          organizationId,
          projectName,
          description: `Created from task "${task?.TaskName || ''}"`,
          status: defaultStatus.Id,
          isGlobal: false,
        },
        token
      );

      await moveTaskSubtreeToProject(createResult.projectId);
    } catch (err: any) {
      setErrorWithToast(err.message || 'Failed to create project and move task');
      setIsMovingTask(false);
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

  const handleAssigneesMultiSelectChange = (values: (string | number)[]) => {
    const selectedIds = Array.from(
      new Set(
        values
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      )
    );

    const selectedAssignees = selectedIds
      .map((userId) => {
        const existingAssignee = taskAssignees.find((assignee) => assignee.UserId === userId);
        if (existingAssignee) {
          return existingAssignee;
        }

        const user = organizationUsers.find((organizationUser) => organizationUser.Id === userId);
        if (!user) {
          return null;
        }

        return {
          UserId: user.Id,
          Username: user.Username,
          FirstName: user.FirstName,
          LastName: user.LastName,
        };
      })
      .filter((assignee): assignee is TaskAssignee => assignee !== null);

    setTaskAssignees(selectedAssignees);

    const principalAssigneeStillSelected = selectedIds.includes(Number(formData.assignedTo));
    setFormData((previous) => ({
      ...previous,
      assignedTo: principalAssigneeStillSelected
        ? previous.assignedTo
        : selectedAssignees[0]?.UserId,
    }));
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !task?.Id) return;

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

  const handleAiTextAction = async (action: 'translate' | 'summarize') => {
    const text = formData.description || '';
    if (!text || text === '<p></p>') {
      setAiError('No description text to process.');
      return;
    }
    setAiLoading(true);
    setAiError('');
    setAiResultText('');
    setAiResultType(null);
    try {
      const response = await fetch(`${getApiUrl()}/api/ai-assistant/text-action`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text, targetLanguage: aiTargetLanguage }),
      });
      const data = await response.json();
      if (data.success) {
        setAiResultText(data.result);
        setAiResultType(action);
      } else {
        setAiError(data.message || 'Failed to process request.');
      }
    } catch {
      setAiError('Failed to connect to AI service.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddAiResultAsComment = async () => {
    if (!aiResultText || !task?.Id) return;
    setAddingAiComment(true);
    try {
      await fetch(`${getApiUrl()}/api/task-comments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.Id, comment: aiResultText }),
      });
      setAiResultText('');
      setAiResultType(null);
      loadTaskDetails();
    } catch {
      // ignore
    } finally {
      setAddingAiComment(false);
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
    if (!file || !task?.Id) return;

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
    if (!task?.Id) return;
    
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
    if (!task?.Id) return;
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
    if (!task?.Id) return;
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
      'DueDateMandatory': 'Due Date Mandatory',
      'UnscheduledWork': 'Unscheduled Work',
      'PlannedStartDate': 'Planned Start',
      'PlannedEndDate': 'Planned End',
      'EstimatedHours': 'Estimated Hours',
      'StoryPoints': 'Story Points',
    };
    return labels[fieldName] || fieldName;
  };

  // Calculate totals for hours tab
  const totalAllocated = taskAllocations.reduce((sum, a) => sum + parseFloat(a.AllocatedHours as any), 0);
  const currentTaskWorked = timeEntries.reduce((sum, e) => sum + parseFloat(e.Hours as any), 0);
  const descendantTaskIds = task?.Id ? getDescendants(task.Id) : [];
  const descendantsWorked = descendantTaskIds.reduce((sum, descendantId) => {
    const descendantTask = tasks.find((taskItem) => taskItem.Id === descendantId);
    return sum + parseFloat(String(descendantTask?.WorkedHours || 0));
  }, 0);
  const totalWorked = currentTaskWorked + descendantsWorked;
  const estimatedForCompletion = parseFloat(String(task?.EstimatedHours || 0));
  const completionPercentage = estimatedForCompletion > 0
    ? Math.min(100, Math.round((totalWorked / estimatedForCompletion) * 100))
    : 0;
  const itemsPerPage = 10;

  const groupedTaskAllocations = React.useMemo(() => {
    type AllocationGroup = {
      dailySummaries: Array<{
        date: string;
        totalHours: number;
        startTime: string;
        endTime: string;
        slotCount: number;
        allocations: TaskAllocation[];
      }>;
      key: string;
      headerId: number | null;
      userId: number;
      userName: string;
      allocationMode?: string;
      splitOrder?: number;
      plannedHours?: number;
      startDate: string;
      endDate: string;
      totalHours: number;
      allocations: TaskAllocation[];
    };

    const groups = new Map<string, AllocationGroup>();

    for (const allocation of taskAllocations) {
      const headerId = allocation.TaskAllocationHeaderId !== null && allocation.TaskAllocationHeaderId !== undefined
        ? Number(allocation.TaskAllocationHeaderId)
        : null;
      const groupKey = headerId !== null ? `header-${headerId}` : `legacy-${allocation.Id}`;
      const allocationDate = String(allocation.AllocationDate).split('T')[0];
      const allocatedHours = Number(allocation.AllocatedHours || 0);

      const existing = groups.get(groupKey);
      if (existing) {
        existing.allocations.push(allocation);
        existing.totalHours += allocatedHours;
        if (allocationDate < existing.startDate) existing.startDate = allocationDate;
        if (allocationDate > existing.endDate) existing.endDate = allocationDate;
      } else {
        groups.set(groupKey, {
          dailySummaries: [],
          key: groupKey,
          headerId,
          userId: allocation.UserId,
          userName: allocation.Username || `User ${allocation.UserId}`,
          allocationMode: (allocation as any).AllocationMode,
          splitOrder: Number((allocation as any).SplitOrder || 0) || undefined,
          plannedHours: Number((allocation as any).PlannedHours || 0) || undefined,
          startDate: allocationDate,
          endDate: allocationDate,
          totalHours: allocatedHours,
          allocations: [allocation],
        });
      }
    }

    const sortedGroups = Array.from(groups.values())
      .map((group) => ({
        ...group,
        allocations: [...group.allocations].sort((a, b) => {
          const dateA = String(a.AllocationDate).split('T')[0];
          const dateB = String(b.AllocationDate).split('T')[0];
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          return String(a.StartTime || '00:00').localeCompare(String(b.StartTime || '00:00'));
        })
      }))
      .map((group) => {
        const dailyMap = new Map<string, {
          date: string;
          totalHours: number;
          startTime: string;
          endTime: string;
          slotCount: number;
          allocations: TaskAllocation[];
        }>();

        for (const allocation of group.allocations) {
          const date = String(allocation.AllocationDate).split('T')[0];
          const startTime = String(allocation.StartTime || '00:00');
          const endTime = String(allocation.EndTime || '00:00');
          const existing = dailyMap.get(date);

          if (existing) {
            existing.totalHours += Number(allocation.AllocatedHours || 0);
            existing.startTime = existing.startTime < startTime ? existing.startTime : startTime;
            existing.endTime = existing.endTime > endTime ? existing.endTime : endTime;
            existing.slotCount += 1;
            existing.allocations.push(allocation);
          } else {
            dailyMap.set(date, {
              date,
              totalHours: Number(allocation.AllocatedHours || 0),
              startTime,
              endTime,
              slotCount: 1,
              allocations: [allocation],
            });
          }
        }

        return {
          ...group,
          dailySummaries: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
        };
      })
      .sort((a, b) => {
        const orderA = a.splitOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.splitOrder ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
        return a.key.localeCompare(b.key);
      });

    return sortedGroups;
  }, [taskAllocations]);

  const allocationsTotalPages = Math.max(1, Math.ceil(groupedTaskAllocations.length / itemsPerPage));
  const timeEntriesTotalPages = Math.max(1, Math.ceil(timeEntries.length / itemsPerPage));

  const safeAllocationsPage = Math.min(allocationsPage, allocationsTotalPages);
  const safeTimeEntriesPage = Math.min(timeEntriesPage, timeEntriesTotalPages);

  const paginatedAllocationGroups = groupedTaskAllocations.slice(
    (safeAllocationsPage - 1) * itemsPerPage,
    safeAllocationsPage * itemsPerPage
  );

  const paginatedTimeEntries = timeEntries.slice(
    (safeTimeEntriesPage - 1) * itemsPerPage,
    safeTimeEntriesPage * itemsPerPage
  );

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

  useEffect(() => {
    setAllocationsPage(1);
    setTimeEntriesPage(1);
    setHoursSubTab('planning');
    setExpandedAllocationGroups(new Set());
  }, [task?.Id]);

  useEffect(() => {
    if (allocationsPage > allocationsTotalPages) {
      setAllocationsPage(allocationsTotalPages);
    }
  }, [allocationsPage, allocationsTotalPages]);

  useEffect(() => {
    if (timeEntriesPage > timeEntriesTotalPages) {
      setTimeEntriesPage(timeEntriesTotalPages);
    }
  }, [timeEntriesPage, timeEntriesTotalPages]);

  useEffect(() => {
    if (!task?.Id && (activeTab === 'checklist' || activeTab === 'attachments' || activeTab === 'comments' || activeTab === 'history')) {
      setActiveTab('details');
    }
  }, [task?.Id, activeTab]);

  const canSaveTask = !!(task?.Id ? permissions?.canManageTasks : permissions?.canCreateTasks);
  const canDeleteTask = !!(task?.Id && permissions?.canDeleteTasks);
  const headerIconButtonClass = 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl';
  const taskCustomerNameFromDirectory = (() => {
    const customerId = Number(task?.CustomerId || 0);
    if (!customerId) return null;
    const matchedCustomer = customers.find((customer) => Number(customer.Id) === customerId);
    if (!matchedCustomer) return null;
    const externalName = String(matchedCustomer.ExternalName || '').trim();
    return externalName || matchedCustomer.Name || null;
  })();
  const taskCustomerName = task?.CustomerName || taskCustomerNameFromDirectory || null;
  const projectCustomerName = task?.ProjectCustomerName || project?.CustomerName || null;
  const headerCustomerName = isGlobalProject
    ? taskCustomerName
    : (taskCustomerName || projectCustomerName);
  const visibleTabs = (task?.Id
    ? (['details', 'checklist', 'hours', 'comments', 'attachments', 'history'] as const)
    : (['details', 'hours'] as const)
  );

  const renderTaskTagBadge = (tag: Tag) => {
    const segments = tag.Name
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    const baseColor = normalizeHexColor(tag.Color);

    if (segments.length <= 1) {
      return (
        <span
          key={tag.Id}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border"
          style={{
            backgroundColor: withAlpha(baseColor, '20'),
            color: baseColor,
            borderColor: withAlpha(baseColor, '55'),
          }}
        >
          <span>{segments[0] || tag.Name}</span>
          <button
            onClick={() => handleRemoveTag(tag.Id)}
            className="ml-1 hover:opacity-70"
            title="Remove tag"
            type="button"
          >
            ×
          </button>
        </span>
      );
    }

    return (
      <span key={tag.Id} className="inline-flex items-center">
        <span className="inline-flex items-stretch overflow-hidden rounded-md border" style={{ borderColor: withAlpha(baseColor, '66') }}>
          {segments.map((segment, index) => {
            const segmentBackground = index === 0
              ? blendHexColors(baseColor, '#111827', 0.18)
              : index === segments.length - 1
                ? baseColor
                : blendHexColors(baseColor, '#ffffff', 0.12 * index);

            const segmentTextColor = index === 0
              ? blendHexColors(baseColor, '#ffffff', 0.72)
              : '#ffffff';

            return (
              <span
                key={`${tag.Id}-${segment}-${index}`}
                className="px-2.5 py-1 text-xs font-semibold leading-none"
                style={{
                  backgroundColor: segmentBackground,
                  color: segmentTextColor,
                  borderLeft: index === 0 ? 'none' : `1px solid ${withAlpha(baseColor, '88')}`,
                }}
              >
                {segment}
              </span>
            );
          })}
        </span>
        <button
          onClick={() => handleRemoveTag(tag.Id)}
          className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-gray-500 hover:bg-gray-100 hover:text-red-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
          title="Remove tag"
          type="button"
        >
          ×
        </button>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {task?.Id ? task.TaskName : 'Create New Task'}
              </h2>
              {task?.Id && project?.Id && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/projects/${project.Id}`)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 transition-colors"
                    title={`Open project ${project.ProjectName}`}
                  >
                    <span>📁</span>
                    <span>{project.ProjectName}</span>
                    <span aria-hidden="true">↗</span>
                  </button>

                  {headerCustomerName && (
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                      title={`Customer: ${headerCustomerName}`}
                    >
                      <span>🏢</span>
                      <span>{headerCustomerName}</span>
                    </span>
                  )}
                </div>
              )}
              {task?.Id && (
                <div className="flex items-center gap-2 mt-1.5">
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
              {task?.Id && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                  <div className="px-3 py-1.5 rounded bg-purple-50 dark:bg-purple-900/20">
                    <div className="text-[11px] text-gray-600 dark:text-gray-400">Estimated</div>
                    <div className="text-sm font-bold text-purple-600 dark:text-purple-400">{decimalHoursToHMS(parseFloat(task.EstimatedHours as any || 0))}</div>
                  </div>
                  <div className="px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-900/20">
                    <div className="text-[11px] text-gray-600 dark:text-gray-400">Allocated</div>
                    <div className="text-sm font-bold text-blue-600 dark:text-blue-400">{decimalHoursToHMS(totalAllocated)}</div>
                  </div>
                  <div className="px-3 py-1.5 rounded bg-green-50 dark:bg-green-900/20">
                    <div className="text-[11px] text-gray-600 dark:text-gray-400">Worked</div>
                    <div className="text-sm font-bold text-green-600 dark:text-green-400">{decimalHoursToHMS(totalWorked)}</div>
                  </div>
                  <div className="px-3 py-1.5 rounded bg-gray-50 dark:bg-gray-700/40">
                    <div className="text-[11px] text-gray-600 dark:text-gray-400">Completion</div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white">{completionPercentage}%</div>
                  </div>
                </div>
              )}
              {/* Tags */}
              {task?.Id && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {taskTags.map((tag) => renderTaskTagBadge(tag))}
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
            <div ref={taskActionsMenuRef} className="relative ml-4 flex items-center gap-2">
              {task?.Id && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowTaskActionsMenu((prev) => !prev)}
                    className={headerIconButtonClass}
                    title="Task actions"
                    aria-label="Task actions"
                  >
                    ⋯
                  </button>
                  {showTaskActionsMenu && (
                    <div className="absolute right-10 top-0 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 py-1">
                      <button
                        type="button"
                        onClick={openMoveToExistingProjectModal}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Move task to project
                      </button>
                      {isGlobalProject && (
                        <button
                          type="button"
                          onClick={openCreateProjectAndMoveModal}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          Create project and move task
                        </button>
                      )}
                      {canDeleteTask && (
                        <>
                          <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                          <button
                            type="button"
                            onClick={() => {
                              setShowTaskActionsMenu(false);
                              handleDeleteFromModal();
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            Delete task
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              <button
                onClick={onClose}
                className={headerIconButtonClass}
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className={`grid ${task?.Id ? 'grid-cols-6' : 'grid-cols-2'} gap-1 mt-3 border-b border-gray-200 dark:border-gray-700 -mb-4 pb-0`}>
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors min-w-0 truncate text-center ${
                  activeTab === tab
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-t border-l border-r border-gray-200 dark:border-gray-700'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                title={
                  tab === 'details' ? 'Details' :
                  tab === 'checklist' ? `Checklist (${checklists.length})` :
                  tab === 'hours' ? `Plan & Deps (${decimalHoursToHMS(totalWorked)})` :
                  tab === 'comments' ? `Comments (${taskComments.length})` :
                  tab === 'attachments' ? `Files (${taskAttachments.length})` :
                  `History (${taskHistory.length})`
                }
              >
                {tab === 'details' && '📝 Details'}
                {tab === 'checklist' && `✅ Checklist (${checklists.length})`}
                {tab === 'hours' && `📅 Plan & Deps (${decimalHoursToHMS(totalWorked)})`}
                {tab === 'comments' && `💬 Comments (${taskComments.length})`}
                {tab === 'attachments' && `📎 Files (${taskAttachments.length})`}
                {tab === 'history' && `📜 History (${taskHistory.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          {/* Details Tab (Edit Form) */}
          {activeTab === 'details' && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                Basic Information
              </h3>

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
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Description
                  </label>
                  {isAiAvailable && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowLangInput(v => !v); setAiError(''); }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                        title="Translate description"
                        disabled={aiLoading}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
                        Translate
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowLangInput(false); handleAiTextAction('summarize'); }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                        title="Summarize description"
                        disabled={aiLoading}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        Summarize
                      </button>
                    </div>
                  )}
                </div>
                {/* Language selector for Translate */}
                {showLangInput && isAiAvailable && (
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      value={aiTargetLanguage}
                      onChange={e => setAiTargetLanguage(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-sm border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="">Select language…</option>
                      <option value="English">English (EN)</option>
                      <option value="Portuguese (Portugal)">Portuguese (PT)</option>
                      <option value="Spanish">Spanish (ES)</option>
                      <option value="French">French (FR)</option>
                      <option value="Italian">Italian (IT)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => { if (aiTargetLanguage) { setShowLangInput(false); handleAiTextAction('translate'); } }}
                      disabled={!aiTargetLanguage || aiLoading}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      Translate
                    </button>
                  </div>
                )}
                <RichTextEditor
                  content={formData.description || ''}
                  onChange={(html) => setFormData({ ...formData, description: html })}
                  placeholder="Enter task description..."
                  className="min-h-[120px]"
                  contentScrollOnly={true}
                  contentMaxHeightClass="max-h-56"
                />
                {/* AI loading */}
                {aiLoading && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                    Processing…
                  </div>
                )}
                {/* AI error */}
                {aiError && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">{aiError}</p>
                )}
                {/* AI result box */}
                {aiResultText && aiResultType && (
                  <div className="mt-3 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">
                        {aiResultType === 'translate' ? `Translation (${aiTargetLanguage})` : 'Summary'}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setAiResultText(''); setAiResultType(null); setAiError(''); }}
                        className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200 transition-colors"
                        title="Dismiss"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{aiResultText}</p>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddAiResultAsComment}
                        disabled={addingAiComment}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {addingAiComment ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        )}
                        Add as comment
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Ticket Reference */}
              {(task?.TicketNumber || hasTicketJiraReference || hasJiraTicketImportReference || hasJiraBoardImportReference || (hasGitHubIssueReference && showGitHubIssueSection) || (hasGiteaIssueReference && showGiteaIssueSection)) && (
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2 pt-2">
                  Linked Tickets & Jira
                </h3>
              )}
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
                      {hasTicketJiraReference && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Jira Issue:</span>
                          <a
                            href={`${jiraTicketBaseUrl}/browse/${externalTicketId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                            title={`Open in Jira: ${externalTicketId}`}
                          >
                            🔗 {externalTicketId}
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
              {!task?.TicketNumber && hasTicketJiraReference && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
                    </svg>
                    <div className="flex-1">
                      <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Associated Jira Issue:</span>
                      <a
                        href={`${jiraTicketBaseUrl}/browse/${externalTicketId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                        title={`Open in Jira: ${externalTicketId}`}
                      >
                        🔗 {externalTicketId}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Jira Ticket Link (from Jira Ticket Import) */}
              {hasJiraTicketIntegrationConfigured && (jiraIssueKeyValue || jiraIntegration?.JiraUrl) && (
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
                    </svg>
                    <div className="flex-1">
                      <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Imported from Jira Ticket:</span>
                      {jiraIssueKeyValue && jiraIntegration?.JiraUrl && (
                        <a
                          href={`${jiraIntegration.JiraUrl}/browse/${jiraIssueKeyValue}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                          title={`Open in Jira: ${jiraIssueKeyValue}`}
                        >
                          🎫 {jiraIssueKeyValue}
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                      <div className="mt-2">
                        <input
                          type="text"
                          value={formData.jiraIssueKey || ''}
                          onChange={(e) => setFormData({ ...formData, jiraIssueKey: e.target.value || undefined })}
                          className="w-full max-w-xs px-3 py-1.5 text-sm border border-purple-300 dark:border-purple-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                          placeholder="Edit Jira issue ID"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Jira Board Link (from Jira Board/Project Import) */}
              {hasJiraBoardImportReference && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
                    </svg>
                    <div className="flex-1">
                      <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Imported from Jira Board:</span>
                      <a
                        href={`${jiraBoardBaseUrl}/browse/${externalIssueId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                        title={`Open in Jira: ${externalIssueId}`}
                      >
                        🧩 {externalIssueId}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {showAnySourceControlIssueSection && (
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {showGitHubIssueSection && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      GitHub Issue ID
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.gitHubIssueNumber ?? ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        gitHubIssueNumber: e.target.value ? parseInt(e.target.value, 10) : null,
                      })}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 456"
                    />
                    {githubIssueUrl && (
                      <a
                        href={githubIssueUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        title={`Open GitHub issue #${gitHubIssueNumberValue}`}
                      >
                        Open issue #{gitHubIssueNumberValue}
                      </a>
                    )}
                  </div>
                  )}

                  {showGiteaIssueSection && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Gitea Issue ID
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formData.giteaIssueNumber ?? ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        giteaIssueNumber: e.target.value ? parseInt(e.target.value, 10) : null,
                      })}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 789"
                    />
                  </div>
                  )}
                </div>
              </div>
              )}

              <h3 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1.5 pt-1">
                Task Setup
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Status
                  </label>
                  <SearchableSelect
                    value={typeof formData.status === 'number' ? formData.status : undefined}
                    onChange={(value) => setFormData({ ...formData, status: value ?? null })}
                    options={taskStatuses.length > 0
                      ? taskStatuses
                        .sort((a, b) => a.SortOrder - b.SortOrder)
                        .map((status) => ({ id: status.Id, label: status.StatusName }))
                      : []}
                    placeholder={taskStatuses.length > 0 ? 'Select a status' : 'No statuses available'}
                    emptyMessage={taskStatuses.length > 0 ? 'Select a status' : 'No statuses available'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Priority
                  </label>
                  <SearchableSelect
                    value={typeof formData.priority === 'number' ? formData.priority : undefined}
                    onChange={(value) => setFormData({ ...formData, priority: value ?? null })}
                    options={taskPriorities.length > 0
                      ? taskPriorities
                        .sort((a, b) => a.SortOrder - b.SortOrder)
                        .map((priority) => ({ id: priority.Id, label: priority.PriorityName || `Priority ${priority.Id}` }))
                      : []}
                    placeholder={taskPriorities.length > 0 ? 'Select a priority' : 'No priorities available'}
                    emptyMessage={taskPriorities.length > 0 ? 'Select a priority' : 'No priorities available'}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Task Type *
                </label>
                <SearchableSelect
                  value={typeof formData.taskType === 'number' ? formData.taskType : undefined}
                  onChange={(value) => setFormData({ ...formData, taskType: value ?? null })}
                  options={taskTypes.length > 0
                    ? taskTypes
                      .sort((a, b) => a.SortOrder - b.SortOrder)
                      .map((type) => ({ id: type.Id, label: type.TypeName || `Type ${type.Id}` }))
                    : []}
                  placeholder={taskTypes.length > 0 ? 'Select a task type' : 'No task types available'}
                  emptyMessage={taskTypes.length > 0 ? 'Select a task type' : 'No task types available'}
                />
              </div>

              <h3 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1.5 pt-1">
                Assignment
              </h3>
              <div>
                {isGlobalProject && (
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Customer *
                    </label>
                    <SearchableSelect
                      options={customers.map((customer) => ({
                        id: customer.Id,
                        label: customer.ExternalName?.trim() || customer.Name,
                      }))}
                      value={typeof formData.customerId === 'number' ? formData.customerId : undefined}
                      onChange={(val: number | undefined) => setFormData({ ...formData, customerId: val ?? null })}
                      placeholder="Select customer..."
                      emptyMessage="No customers found in this organization"
                      autoSelectSingleOption={!task?.Id}
                    />
                  </div>
                )}

                {/* Principal Assignee field (searchable) */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Principal Assignee
                  </label>
                  <SearchableSelect
                    options={organizationUsers.map((u) => ({
                      id: u.Id,
                      label: `${u.Username}${u.FirstName && u.LastName ? ` (${u.FirstName} ${u.LastName})` : ''}`
                    }))}
                    value={typeof formData.assignedTo === 'number' ? formData.assignedTo : undefined}
                    onChange={(val: number | undefined) => {
                      setFormData({ ...formData, assignedTo: val });
                      if (typeof val === 'number' && (!taskAssignees.length || taskAssignees[0].UserId !== val)) {
                        const mainUser = organizationUsers.find(u => u.Id === val);
                        if (mainUser) {
                          setTaskAssignees([{
                            UserId: mainUser.Id,
                            Username: mainUser.Username,
                            FirstName: mainUser.FirstName,
                            LastName: mainUser.LastName
                          }, ...taskAssignees.filter(a => a.UserId !== val)]);
                        }
                      }
                    }}
                    placeholder="Select principal assignee..."
                    autoSelectSingleOption={!task?.Id}
                  />
                </div>

                {/* Multi-assignee dropdown and chips (unchanged) */}
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
                {/* Searchable multi-assignee selector */}
                {permissions?.canAssignTasks && (
                  <SearchableMultiSelect
                    values={taskAssignees.map((assignee) => assignee.UserId)}
                    onChange={handleAssigneesMultiSelectChange}
                    options={organizationUsers.map((user) => ({
                      value: user.Id,
                      label: `${user.Username}${user.FirstName && user.LastName ? ` (${user.FirstName} ${user.LastName})` : ''}`,
                    }))}
                    placeholder="Select assignees..."
                    dropdownMode="portal"
                  />
                )}
              </div>

              <h3 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1.5 pt-1">
                Effort & Completion
              </h3>
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="mt-1.5 inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.dueDateMandatory)}
                      onChange={(e) => setFormData({ ...formData, dueDateMandatory: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                    />
                    Due date is mandatory for planning
                  </label>
                  <label className="mt-1.5 inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.unscheduledWork)}
                      onChange={(e) => setFormData({ ...formData, unscheduledWork: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                    />
                    Unscheduled work (show in Planner today)
                  </label>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Story Points
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.storyPoints || ''}
                    onChange={(e) => setFormData({ ...formData, storyPoints: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g., 3"
                  />
                </div>
              </div>

              {/* Application */}
              {(applications.length > 0 || (formData.applicationId && applicationVersions.length > 0)) && (
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1.5 pt-1">
                  Release Tracking
                </h3>
              )}
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

              <CustomFieldsFormSection
                tableName="Tasks"
                token={token}
                values={customFields}
                onChange={setCustomFields}
              />

            </form>
          )}

          {/* Checklist Tab */}
          {activeTab === 'checklist' && (
            !task?.Id ? (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-6 text-center">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-gray-700 dark:text-gray-300 font-medium">Checklist will be available after creating the task.</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create the task first, then add checklist items in this tab.</p>
              </div>
            ) : (
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
            )
          )}

          {/* Hours Tab */}
          {activeTab === 'hours' && (
            !task?.Id ? (
              <div className="space-y-6"> 

                <h3 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2 pt-2">
                  Plan & Dependencies
                </h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Parent Task (Optional)
                  </label>
                  <SearchableSelect
                    value={typeof formData.parentTaskId === 'number' ? formData.parentTaskId : undefined}
                    onChange={(value) => setFormData({ ...formData, parentTaskId: value })}
                    options={getAvailableParentTasks()}
                    placeholder="No Parent (Top-level task)"
                    emptyMessage="No tasks available"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Depends On (Optional)
                  </label>
                  <SearchableSelect
                    value={typeof formData.dependsOnTaskId === 'number' ? formData.dependsOnTaskId : undefined}
                    onChange={(value) => setFormData({ ...formData, dependsOnTaskId: value })}
                    options={getAvailableDependencyTasks()}
                    placeholder="No dependency"
                    emptyMessage="No tasks available"
                  />
                </div>
              </div>
            ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
                <button
                  type="button"
                  onClick={() => setHoursSubTab('planning')}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    hoursSubTab === 'planning'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Planning & Dependencies
                </button>
                <button
                  type="button"
                  onClick={() => setHoursSubTab('allocations')}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    hoursSubTab === 'allocations'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Planned Allocations
                </button>
                <button
                  type="button"
                  onClick={() => setHoursSubTab('time')}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    hoursSubTab === 'time'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Time Entries
                </button>
              </div>

              {hoursSubTab === 'planning' && (
                <>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2 pt-2">
                Plan & Dependencies
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Parent Task (Optional)
                </label>
                <SearchableSelect
                  value={typeof formData.parentTaskId === 'number' ? formData.parentTaskId : undefined}
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
                  value={typeof formData.dependsOnTaskId === 'number' ? formData.dependsOnTaskId : undefined}
                  onChange={(value) => setFormData({ ...formData, dependsOnTaskId: value })}
                  options={getAvailableDependencyTasks()}
                  placeholder="No dependency"
                  emptyMessage="No tasks available"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  This task cannot start until the selected task is completed
                </p>
              </div>

              <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Child Tasks</h4>
                  {hasAnyChildren ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
                      {childTasks.length > 0 ? childTasks.length : '1+'} child task{childTasks.length === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium">
                      No child tasks
                    </span>
                  )}
                </div>

                {childTasks.length > 0 ? (
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-600 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                    {childTasks.map((child) => (
                      <button
                        key={child.Id}
                        type="button"
                        onClick={() => onOpenTask?.(child)}
                        disabled={!onOpenTask}
                        className={`w-full px-3 py-2 flex items-center justify-between gap-3 text-left ${onOpenTask ? 'hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer' : 'cursor-default'}`}
                        title={onOpenTask ? 'Open task details' : undefined}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{child.TaskName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {child.EstimatedHours ? decimalHoursToHMS(Number(child.EstimatedHours)) : 'No estimate'}
                          </p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 shrink-0">
                          {child.StatusName || 'Unknown status'}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : hasAnyChildren ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    This task has child tasks, but the current context has no visible child-task list.
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    No child tasks are linked to this task.
                  </p>
                )}
              </div>

                </>
              )}

              {/* Allocations */}
              {hoursSubTab === 'allocations' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Planned Allocations</h3>
                  <div className="flex items-center gap-2">
                    {!hasChildren && canShowAddManualAllocation && (
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
                    {showRemovePlanning && taskAllocations.length > 0 && onRemovePlanning && (
                      <button
                        onClick={onRemovePlanning}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors flex items-center gap-1"
                        title="Remove all planned allocations for this task"
                      >
                        <span>🗑️</span>
                        <span>Remove Planning</span>
                      </button>
                    )}
                  </div>
                </div>
                {allocationPeriod && (
                  <div className="px-4 py-3 mb-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
                    <div className="flex items-center gap-4">
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

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Baseline:</span>
                      </div>
                      {task?.BaselineStartDate && task?.BaselineEndDate ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded font-medium">
                            {new Date(String(task.BaselineStartDate).includes('T') ? String(task.BaselineStartDate) : `${task.BaselineStartDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded font-medium">
                            {new Date(String(task.BaselineEndDate).includes('T') ? String(task.BaselineEndDate) : `${task.BaselineEndDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400 text-xs ml-1">
                            ({Math.round((new Date(task.BaselineEndDate).getTime() - new Date(task.BaselineStartDate).getTime()) / 86400000) + 1} days)
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-gray-500 italic">Not set</span>
                      )}
                    </div>
                  </div>
                )}
                {loadingData ? (
                  <p className="text-gray-500 dark:text-gray-400">Loading...</p>
                ) : taskAllocations.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">No allocations found.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                          <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase"></th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Header ID</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date Range</th>
                            <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Days</th>
                            <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Hours</th>
                            {!hasChildren && (
                              <th scope="col" className="relative px-5 py-3">
                                <span className="sr-only">Actions</span>
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {paginatedAllocationGroups.map((group) => {
                            const isExpanded = expandedAllocationGroups.has(group.key);
                            const rangeDays = Math.max(
                              1,
                              Math.round(
                                (new Date(`${group.endDate}T12:00:00`).getTime() - new Date(`${group.startDate}T12:00:00`).getTime()) / 86_400_000
                              ) + 1
                            );

                            return (
                              <React.Fragment key={group.key}>
                                <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors bg-gray-50/60 dark:bg-gray-800/60">
                                  <td className="px-3 py-3 text-sm">
                                    <button
                                      onClick={() => {
                                        setExpandedAllocationGroups((prev) => {
                                          const next = new Set(prev);
                                          if (next.has(group.key)) {
                                            next.delete(group.key);
                                          } else {
                                            next.add(group.key);
                                          }
                                          return next;
                                        });
                                      }}
                                      className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded"
                                      title={isExpanded ? 'Collapse days' : 'Expand days'}
                                      aria-label={isExpanded ? 'Collapse days' : 'Expand days'}
                                    >
                                      <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    </button>
                                  </td>
                                  <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                                    {group.headerId !== null ? `#${group.headerId}` : 'No header'}
                                  </td>
                                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                    {group.userName}
                                  </td>
                                  <td className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                    {new Date(`${group.startDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    {' → '}
                                    {new Date(`${group.endDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </td>
                                  <td className="px-5 py-3 text-sm text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                    {group.dailySummaries.length}
                                  </td>
                                  <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                    {decimalHoursToHMS(group.totalHours)}
                                  </td>
                                  {!hasChildren && (
                                    <td className="px-5 py-3 text-sm text-center text-gray-400 dark:text-gray-600 whitespace-nowrap">
                                      {group.allocationMode || '-'}
                                    </td>
                                  )}
                                </tr>

                                {isExpanded && group.dailySummaries.map((summary) => {
                                  const singleManualAllocation = summary.allocations.length === 1 && summary.allocations[0].IsManual === 1
                                    ? summary.allocations[0]
                                    : null;

                                  return (
                                  <tr key={`${group.key}-${summary.date}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                                    <td className="px-3 py-3"></td>
                                    <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                      {new Date(`${summary.date}T12:00:00`).toLocaleDateString()}
                                    </td>
                                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                      {group.userName}
                                    </td>
                                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                      {summary.startTime || '-'} → {summary.endTime || '-'}
                                      {summary.slotCount > 1 && (
                                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({summary.slotCount} blocks)</span>
                                      )}
                                    </td>
                                    <td className="px-5 py-3 text-sm text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                      {summary.slotCount}
                                    </td>
                                    <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                      {decimalHoursToHMS(summary.totalHours)}
                                    </td>
                                    {!hasChildren && (
                                      <td className="px-5 py-3 text-sm text-center whitespace-nowrap">
                                        {singleManualAllocation ? (
                                          <div className="flex items-center justify-center gap-1">
                                            <button
                                              onClick={() => setManualAllocationModal({
                                                show: true,
                                                allocationId: singleManualAllocation.Id || null,
                                                userId: singleManualAllocation.UserId,
                                                allocationDate: new Date(singleManualAllocation.AllocationDate).toISOString().split('T')[0],
                                                allocatedHours: String(singleManualAllocation.AllocatedHours),
                                                mode: 'edit'
                                              })}
                                              className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                                              title="Edit"
                                              aria-label="Edit"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
                                              </svg>
                                            </button>
                                            <button
                                              onClick={() => handleDeleteManualAllocation(singleManualAllocation.Id!)}
                                              className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                                              title="Delete"
                                              aria-label="Delete"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                              </svg>
                                            </button>
                                          </div>
                                        ) : summary.allocations.some((allocation) => allocation.IsManual === 1) ? (
                                          <span className="text-gray-400 dark:text-gray-600 text-xs">Grouped</span>
                                        ) : (
                                          <span className="text-gray-400 dark:text-gray-600 text-xs">Auto</span>
                                        )}
                                      </td>
                                    )}
                                  </tr>
                                )})}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Showing {(safeAllocationsPage - 1) * itemsPerPage + 1}-{Math.min(safeAllocationsPage * itemsPerPage, groupedTaskAllocations.length)} of {groupedTaskAllocations.length} header groups
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setAllocationsPage((p) => Math.max(1, p - 1))}
                          disabled={safeAllocationsPage === 1}
                          className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Previous
                        </button>
                        <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[5rem] text-center">
                          {safeAllocationsPage} / {allocationsTotalPages}
                        </span>
                        <button
                          onClick={() => setAllocationsPage((p) => Math.min(allocationsTotalPages, p + 1))}
                          disabled={safeAllocationsPage >= allocationsTotalPages}
                          className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              )}

              {/* Time Entries */}
              {hoursSubTab === 'time' && (
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Time Entries</h3>
                {loadingData ? (
                  <p className="text-gray-500 dark:text-gray-400">Loading...</p>
                ) : timeEntries.length === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400">No time entries found.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                          <tr>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                            <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Hours</th>
                            <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Description</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {paginatedTimeEntries.map((entry) => (
                            <tr key={entry.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                              <td className="px-5 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                                {new Date(entry.WorkDate).toLocaleDateString()}
                              </td>
                              <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
                                {entry.Username || `User ${entry.UserId}`}
                              </td>
                              <td className="px-5 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                {decimalHoursToHMS(parseFloat(entry.Hours as any))}
                              </td>
                              <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
                                {entry.Description || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Showing {(safeTimeEntriesPage - 1) * itemsPerPage + 1}-{Math.min(safeTimeEntriesPage * itemsPerPage, timeEntries.length)} of {timeEntries.length}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setTimeEntriesPage((p) => Math.max(1, p - 1))}
                          disabled={safeTimeEntriesPage === 1}
                          className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Previous
                        </button>
                        <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[5rem] text-center">
                          {safeTimeEntriesPage} / {timeEntriesTotalPages}
                        </span>
                        <button
                          onClick={() => setTimeEntriesPage((p) => Math.min(timeEntriesTotalPages, p + 1))}
                          disabled={safeTimeEntriesPage >= timeEntriesTotalPages}
                          className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              )}
            </div>
            )
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
          {activeTab === 'attachments' && (
            !task?.Id ? (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-6 text-center">
                <div className="text-3xl mb-2">📎</div>
                <p className="text-gray-700 dark:text-gray-300 font-medium">Files tab is ready.</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create the task first to upload attachments.</p>
              </div>
            ) : (
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
            )
          )}

          {/* History Tab */}
          {activeTab === 'history' && task && (
            <div className="space-y-4">
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

        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-gray-600 hover:bg-gray-700 text-white transition-colors"
            >
              Cancel
            </button>
            {canSaveTask && (
              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={isLoading}
                className="flex-1 h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white transition-colors"
              >
                {isLoading ? 'Saving...' : task?.Id ? 'Update Task' : 'Create Task'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Alocação Manual */}
      {manualAllocationModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
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
                  <SearchableSelect
                    value={typeof manualAllocationModal.userId === 'number' ? manualAllocationModal.userId : undefined}
                    onChange={(value) => setManualAllocationModal((prev) => ({
                      ...prev,
                      userId: value ?? null,
                    }))}
                    options={users.map((user) => ({
                      id: user.Id,
                      label: `${user.FirstName} ${user.LastName} (${user.Username})`,
                    }))}
                    placeholder="Select user..."
                    emptyMessage="No users available"
                  />
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
                  className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveManualAllocation}
                  className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  {manualAllocationModal.mode === 'add' ? 'Add' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {moveTaskModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                {moveTaskModal.mode === 'existing' ? 'Move Task to Project' : 'Create Project and Move Task'}
              </h3>

              {loadingMoveMetadata ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading options...</div>
              ) : moveTaskModal.mode === 'existing' ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    This will move the selected task and all its subtasks.
                  </p>
                  <SearchableSelect
                    value={moveTargetProjectId}
                    onChange={setMoveTargetProjectId}
                    options={availableMoveProjects.map((entry) => ({ id: entry.Id, label: entry.ProjectName }))}
                    placeholder="Select target project..."
                    emptyMessage="No projects available"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    A new project will be created in this organization, then the selected task and subtasks will be moved.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      New Project Name
                    </label>
                    <input
                      type="text"
                      value={newProjectNameForMove}
                      onChange={(e) => setNewProjectNameForMove(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Enter project name"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={closeMoveTaskModal}
                  disabled={isMovingTask}
                  className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={moveTaskModal.mode === 'existing' ? handleConfirmMoveToExistingProject : handleCreateProjectAndMove}
                  disabled={isMovingTask || loadingMoveMetadata}
                  className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white transition-colors"
                >
                  {isMovingTask ? 'Moving...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Alerta */}
      {modalMessage && modalMessage.type === 'alert' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
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
                  className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white transition-colors"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
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
                  className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-900 dark:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (modalMessage.onConfirm) {
                      modalMessage.onConfirm();
                    }
                  }}
                  disabled={isDeleting}
                  className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalMessage && modalMessage.type === 'delete-choice' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                {modalMessage.title}
              </h3>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                {modalMessage.message}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => setModalMessage(null)}
                  disabled={isDeleting}
                  className="w-full h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 disabled:opacity-70 text-gray-900 dark:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => modalMessage.onDeleteOnly()}
                  disabled={isDeleting}
                  className="w-full h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Only This Task'}
                </button>
                <button
                  onClick={() => modalMessage.onDeleteWithSubtasks()}
                  disabled={isDeleting}
                  className="w-full h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Task + Subtasks'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
