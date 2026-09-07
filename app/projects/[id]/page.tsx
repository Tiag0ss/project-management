'use client';

import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';
import { getApiUrl } from '@/lib/api/config';
import { parseCsv } from '@/lib/csv';

import React, { useState, useEffect, useRef, use, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { projectsApi, Project } from '@/lib/api/projects';
import { tasksApi, Task, CreateTaskData } from '@/lib/api/tasks';
import { getCustomersByOrganization, Customer } from '@/lib/api/customers';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { usersApi, User } from '@/lib/api/users';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import PageTabs from '@/components/PageTabs';
import PageStickyChrome from '@/components/PageStickyChrome';
import PageStickyActions, { pageActionButtonClass } from '@/components/PageStickyActions';
import TaskDetailModal from '@/components/TaskDetailModal';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import { recordRecentNavAccess } from '@/lib/recentNavAccess';
import { readPinnedListIds } from '@/lib/pinnedListItems';
import { upsertPinnedNavProjectMeta } from '@/lib/pinnedNavProjectMeta';
import JiraStatusMappingPanel from '@/components/projects/JiraStatusMappingPanel';
import { useColorVision } from '@/hooks/useColorVision';
import { useUrlTab } from '@/hooks/useUrlTab';

import { OverviewTab } from '@/components/projects/OverviewTab';
import { TasksTab } from '@/components/projects/tasks/TasksTab';
import { KanbanTab } from '@/components/projects/KanbanTab';
import { GanttViewTab } from '@/components/projects/GanttViewTab';
import { ReportingTab } from '@/components/projects/reporting/ReportingTab';
import { SettingsTab } from '@/components/projects/SettingsTab';
import { ProjectMappingsTab } from '@/components/projects/ProjectMappingsTab';
import { UtilitiesTab } from '@/components/projects/UtilitiesTab';
import { AttachmentsTab } from '@/components/projects/AttachmentsTab';
import { HistoryTab } from '@/components/projects/HistoryTab';
import { DependencyGraphTab } from '@/components/projects/DependencyGraphTab';
import { BurndownTab } from '@/components/projects/BurndownTab';
import { SprintsTab } from '@/components/projects/sprints/SprintsTab';
import { MilestonesTab } from '@/components/projects/MilestonesTab';
import { EditProjectModal } from '@/components/projects/EditProjectModal';
import { SearchableSelect } from '@/components/projects/ProjectInlineFields';

const PROJECT_DETAIL_TABS = [
  'overview',
  'tasks',
  'kanban',
  'gantt',
  'reporting',
  'settings',
  'mappings',
  'utilities',
  'attachments',
  'history',
  'dependencies',
  'burndown',
  'sprints',
  'milestones',
] as const;
type ProjectDetailTab = (typeof PROJECT_DETAIL_TABS)[number];

export default function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <PageLoadingSkeleton />
      }
    >
      <ProjectDetailPageContent {...props} />
    </Suspense>
  );
}

function ProjectDetailPageContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { pillStyle } = useColorVision();
  const projectId = resolvedParams.id;
  const searchParams = useSearchParams();
  const deepLinkHandledRef = useRef(false);
  
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useUrlTab<ProjectDetailTab>(PROJECT_DETAIL_TABS, 'overview', {
    clearParamsOnChange: ['taskId', 'task'],
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [mappingsSaving, setMappingsSaving] = useState(false);
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
  const [csvUniqueTaskTypes, setCsvUniqueTaskTypes] = useState<string[]>([]);
  const [importTaskTypeMapping, setImportTaskTypeMapping] = useState<Record<string, string>>({});
  const [importAvailTaskTypes, setImportAvailTaskTypes] = useState<StatusValue[]>([]);
  const [importDefaultTaskType, setImportDefaultTaskType] = useState<string>('');
  const [showJiraImportModal, setShowJiraImportModal] = useState(false);
  const [jiraIssues, setJiraIssues] = useState<any[]>([]);
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [statusMapping, setStatusMapping] = useState<{[key: string]: string}>({});
  const [priorityMapping, setPriorityMapping] = useState<{[key: string]: string}>({});
  const [taskTypeMapping, setTaskTypeMapping] = useState<{[key: string]: string}>({});
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState('');
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [taskPriorities, setTaskPriorities] = useState<StatusValue[]>([]);
  const [taskTypes, setTaskTypes] = useState<StatusValue[]>([]);
  const [taskEditorUsers, setTaskEditorUsers] = useState<User[]>([]);
  const [jiraFilters, setJiraFilters] = useState({
    search: '',
    status: '',
    issueType: '',
    priority: '',
    assignee: '',
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
  const [gitHubImportApplicationId, setGitHubImportApplicationId] = useState<number>(0);
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
  const [giteaImportApplicationId, setGiteaImportApplicationId] = useState<number>(0);
  const [jiraIntegration, setJiraIntegration] = useState<any>(null);
  // Jira Tickets Import State (for ticket system, not project board)
  const [showJiraTicketsModal, setShowJiraTicketsModal] = useState(false);
  const [jiraTickets, setJiraTickets] = useState<any[]>([]);
  const [selectedJiraTickets, setSelectedJiraTickets] = useState<Set<string>>(new Set());
  const [jiraTicketsLoading, setJiraTicketsLoading] = useState(false);
  const [jiraTicketsImporting, setJiraTicketsImporting] = useState(false);
  const [jiraTicketsError, setJiraTicketsError] = useState('');
  const [jiraSearchQuery, setJiraSearchQuery] = useState('');
  const [hideIntegratedJiraTickets, setHideIntegratedJiraTickets] = useState(false);
  const [existingJiraIssueStatusByKey, setExistingJiraIssueStatusByKey] = useState<Record<string, { taskId: number; statusId: number | null; statusName: string | null }>>({});
  const [jiraTicketMappings, setJiraTicketMappings] = useState<Record<string, { customerId?: number; assigneeId?: number }>>({});
  const [jiraImportCustomers, setJiraImportCustomers] = useState<Customer[]>([]);
  const [jiraImportUsers, setJiraImportUsers] = useState<User[]>([]);
  const [jiraTicketStatusMapping, setJiraTicketStatusMapping] = useState<{ [key: string]: string }>({});
  const [jiraTicketPriorityMapping, setJiraTicketPriorityMapping] = useState<{ [key: string]: string }>({});
  const [jiraTicketTypeMapping, setJiraTicketTypeMapping] = useState<{ [key: string]: string }>({});
  const [jiraBoardAssigneeMapping, setJiraBoardAssigneeMapping] = useState<Record<string, number | ''>>({});
  const [isJiraStatusMappingOpen, setIsJiraStatusMappingOpen] = useState(false);
  const [isJiraTaskTypeMappingOpen, setIsJiraTaskTypeMappingOpen] = useState(false);
  const [isJiraPriorityMappingOpen, setIsJiraPriorityMappingOpen] = useState(false);
  const [isJiraAssigneeMappingOpen, setIsJiraAssigneeMappingOpen] = useState(false);
  const [isJiraTicketMappingOpen, setIsJiraTicketMappingOpen] = useState(false);
  // Outlook Email Queue Import State
  const [showOutlookQueueModal, setShowOutlookQueueModal] = useState(false);
  const [outlookQueueItems, setOutlookQueueItems] = useState<Array<{
    Id: number;
    Subject: string | null;
    BodyText: string | null;
    BodyHtml: string | null;
    FromEmail: string;
    ReceivedAt: string;
  }>>([]);
  const [selectedOutlookQueueIds, setSelectedOutlookQueueIds] = useState<Set<number>>(new Set());
  const [outlookQueueLoading, setOutlookQueueLoading] = useState(false);
  const [outlookQueueImporting, setOutlookQueueImporting] = useState(false);
  const [outlookQueueError, setOutlookQueueError] = useState('');
  const [outlookQueueMappings, setOutlookQueueMappings] = useState<Record<number, { assigneeId?: number }>>({});
  const [hasOutlookQueueItems, setHasOutlookQueueItems] = useState(false);
  // Check Jira Ticket Status modal state
  const [showJiraCheckStatusModal, setShowJiraCheckStatusModal] = useState(false);
  const [jiraCheckStatusLoading, setJiraCheckStatusLoading] = useState(false);
  const [jiraCheckStatusTickets, setJiraCheckStatusTickets] = useState<Array<{issueKey: string; jiraSummary: string; jiraStatus: string; taskId: number; taskName: string; taskStatusId: number | null; taskStatusName: string | null}>>([]);
  const [jiraCheckStatusError, setJiraCheckStatusError] = useState('');
  const [jiraCheckStatusMapping, setJiraCheckStatusMapping] = useState<Record<string, string>>({});
  const [jiraCheckStatusOverrides, setJiraCheckStatusOverrides] = useState<Record<string, string>>({});
  const [selectedCheckStatusKeys, setSelectedCheckStatusKeys] = useState<Set<string>>(new Set());
  const [isApplyingCheckStatus, setIsApplyingCheckStatus] = useState(false);
  const [checkStatusOnlyChanged, setCheckStatusOnlyChanged] = useState(true);
  const [jiraCheckStatusMode, setJiraCheckStatusMode] = useState<'ticket' | 'board'>('ticket');
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);
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

  useEffect(() => {
    if (!project?.Id || !project.ProjectName) return;
    recordRecentNavAccess(
      'projects',
      { id: project.Id, label: project.ProjectName, href: `/projects/${project.Id}` },
      user?.id
    );
    if (readPinnedListIds('projects', user?.id).includes(project.Id)) {
      upsertPinnedNavProjectMeta(
        { id: project.Id, label: project.ProjectName, href: `/projects/${project.Id}` },
        user?.id
      );
    }
  }, [project?.Id, project?.ProjectName, user?.id]);

  const parseMappingJson = (value: any): Record<string, string> => {
    if (!value || typeof value !== 'string') return {};
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string>;
      }
    } catch {
      // ignore invalid JSON persisted previously
    }
    return {};
  };

  const normalizeLookup = (value: unknown): string => {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  };

  const buildAutoTicketMappings = (
    issues: any[],
    customers: Customer[],
    users: User[]
  ): Record<string, { customerId?: number; assigneeId?: number }> => {
    const mappings: Record<string, { customerId?: number; assigneeId?: number }> = {};

    for (const issue of issues) {
      const combinedText = normalizeLookup([
        issue.key,
        issue.summary,
        typeof issue.description === 'string' ? issue.description : '',
        Array.isArray(issue.organizations) ? issue.organizations.join(' ') : '',
      ].join(' '));

      let matchedCustomerId: number | undefined;
      let matchedCustomerTokenLength = 0;

      for (const customer of customers) {
        const candidates = [customer.ExternalName, customer.Name]
          .map(normalizeLookup)
          .filter((text) => text.length >= 2);

        for (const candidate of candidates) {
          if (combinedText.includes(candidate) && candidate.length > matchedCustomerTokenLength) {
            matchedCustomerId = customer.Id;
            matchedCustomerTokenLength = candidate.length;
          }
        }
      }

      const assigneeDisplay = normalizeLookup(issue.assignee);
      const assigneeAccount = normalizeLookup(issue.assigneeAccountId);
      const assigneeEmail = normalizeLookup(issue.assigneeEmail);
      const assigneeKey = normalizeLookup(issue.assigneeKey);
      const assigneeName = normalizeLookup(issue.assigneeName);
      const developerDisplay = normalizeLookup(issue.developer);
      const developerAccount = normalizeLookup(issue.developerAccountId);
      const developerEmail = normalizeLookup(issue.developerEmail);
      const developerKey = normalizeLookup(issue.developerKey);
      const developerName = normalizeLookup(issue.developerName);

      const hasDeveloperIdentity = !!(developerAccount || developerEmail || developerDisplay || developerKey || developerName);
      const jiraUserCandidates = hasDeveloperIdentity
        ? [developerAccount, developerEmail, developerDisplay, developerKey, developerName]
        : [assigneeAccount, assigneeEmail, assigneeDisplay, assigneeKey, assigneeName];
      const preferredDisplay = hasDeveloperIdentity ? developerDisplay : assigneeDisplay;

      let matchedAssigneeId: number | undefined;

      if (jiraUserCandidates.some(Boolean)) {
        const jiraIdMatch = users.find((user) => {
          const jiraId = normalizeLookup(user.JiraId);
          if (!jiraId) return false;
          return jiraUserCandidates.includes(jiraId);
        });

        if (jiraIdMatch) {
          matchedAssigneeId = jiraIdMatch.Id;
        } else {
          const byNameOrUsername = users.find((user) => {
            const username = normalizeLookup(user.Username);
            const fullName = normalizeLookup(`${user.FirstName || ''} ${user.LastName || ''}`);
            return preferredDisplay && (preferredDisplay === fullName || preferredDisplay === username);
          });
          matchedAssigneeId = byNameOrUsername?.Id;
        }
      }

      mappings[issue.key] = {
        customerId: matchedCustomerId,
        assigneeId: matchedAssigneeId,
      };
    }

    return mappings;
  };

  const buildAutoJiraBoardAssigneeMapping = (
    issues: any[],
    users: User[]
  ): Record<string, number | ''> => {
    const mapping: Record<string, number | ''> = {};
    const assignees = Array.from(
      new Set(issues.map((issue) => String(issue.assignee || '').trim()).filter(Boolean))
    );

    assignees.forEach((assigneeDisplay) => {
      const normalizedDisplay = normalizeLookup(assigneeDisplay);
      const identityCandidates = new Set<string>(
        issues
          .filter((issue) => normalizeLookup(issue.assignee) === normalizedDisplay)
          .flatMap((issue) => [issue.assigneeAccountId, issue.assigneeEmail, issue.assigneeKey, issue.assigneeName, issue.assignee])
          .map((value) => normalizeLookup(value))
          .filter(Boolean)
      );

      let matchedUser: User | undefined;

      if (identityCandidates.size > 0) {
        matchedUser = users.find((candidate) => {
          const jiraId = normalizeLookup(candidate.JiraId);
          return jiraId ? identityCandidates.has(jiraId) : false;
        });
      }

      if (!matchedUser) {
        matchedUser = users.find((candidate) => {
          const username = normalizeLookup(candidate.Username);
          const fullName = normalizeLookup(`${candidate.FirstName || ''} ${candidate.LastName || ''}`);
          return normalizedDisplay === username || normalizedDisplay === fullName;
        });
      }

      mapping[assigneeDisplay] = matchedUser?.Id ?? '';
    });

    return mapping;
  };

  const closeConfirmModal = () => {
    setModalMessage(null);
  };

  useEffect(() => {
    const isKanbanWorkflowError = error.startsWith('Transition blocked by workflow policy');
    if (activeTab !== 'kanban' && isKanbanWorkflowError) {
      setError('');
    }
  }, [activeTab, error]);

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

  const refreshOutlookQueueAvailability = async () => {
    if (!token) {
      setHasOutlookQueueItems(false);
      return;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/email-task-queue?limit=1`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        setHasOutlookQueueItems(false);
        return;
      }

      const data = await response.json();
      setHasOutlookQueueItems(Array.isArray(data.items) && data.items.length > 0);
    } catch {
      setHasOutlookQueueItems(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user && token && featureFlagsLoaded) {
      loadProject();
      loadTasks();
      refreshOutlookQueueAvailability();
      if (internalTicketsEnabled) {
        loadTickets();
      } else {
        setTickets([]);
      }
    }
  }, [user, token, authLoading, projectId, router, featureFlagsLoaded, internalTicketsEnabled]);

  useEffect(() => {
    if (activeTab === 'tasks' && token) {
      refreshOutlookQueueAvailability();
    }
  }, [activeTab, token]);

  // Deep-link: /projects/:id?tab=tasks&taskId=:taskId (also accepts ?task= for older email links)
  useEffect(() => {
    if (deepLinkHandledRef.current || isLoading) return;
    const taskIdParam = searchParams.get('taskId') || searchParams.get('task');
    if (!taskIdParam) {
      if (searchParams.get('tab')) deepLinkHandledRef.current = true;
      return;
    }

    const taskId = Number(taskIdParam);
    if (!Number.isFinite(taskId) || taskId <= 0 || tasks.length === 0) return;

    const task = tasks.find((t) => t.Id === taskId);
    if (!task) {
      deepLinkHandledRef.current = true;
      return;
    }

    deepLinkHandledRef.current = true;
    setEditingTask(task);
    setShowTaskModal(true);
    setActiveTab('tasks');
  }, [isLoading, tasks, searchParams, setActiveTab]);

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
            } else {
              setJiraIntegration(null);
            }
          } else {
            setJiraIntegration(null);
          }
        } catch (err) {
          console.error('Failed to load Jira integration:', err);
          setJiraIntegration(null);
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

  const handleInlineTaskSave = async (taskId: number, taskData: Partial<CreateTaskData>) => {
    if (!token) return;

    const trimmedTaskName = (taskData.taskName || '').trim();
    if (!trimmedTaskName) {
      setError('Task name is required');
      return;
    }

    try {
      await tasksApi.update(taskId, { ...taskData, taskName: trimmedTaskName }, token);
      setError('');
      await loadTasks();
    } catch (err: any) {
      setError(err.message || 'Failed to save task');
      throw err;
    }
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
    setCsvUniqueTaskTypes([]);
    setImportStatusMapping({});
    setImportPriorityMapping({});
    setImportTaskTypeMapping({});
    setImportDefaultTaskType('');

    // Load available statuses, priorities and task types for the project's organization
    if (project?.OrganizationId && token) {
      try {
        const [statusRes, priorityRes, typeRes] = await Promise.all([
          statusValuesApi.getTaskStatuses(project.OrganizationId, token),
          statusValuesApi.getTaskPriorities(project.OrganizationId, token),
          statusValuesApi.getTaskTypes(project.OrganizationId, token),
        ]);
        setImportAvailStatuses(statusRes.statuses || []);
        setImportAvailPriorities(priorityRes.priorities || []);
        setImportAvailTaskTypes(typeRes.types || []);
      } catch (err) {
        console.error('Failed to load statuses/priorities/types for import:', err);
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
    setCsvUniqueTaskTypes([]);
    setImportStatusMapping({});
    setImportPriorityMapping({});
    setImportTaskTypeMapping({});
    setImportDefaultTaskType('');

    try {
      const text = await file.text();
      const allRows = parseCsv(text);

      if (allRows.length === 0) {
        setImportProgress('Error: File is empty or invalid');
        return;
      }

      setImportAllRows(allRows);
      setImportPreview(allRows.slice(0, 5));

      // Extract unique non-empty Status, Priority and TaskType values
      const statuses = Array.from(new Set(allRows.map(r => r.Status).filter(Boolean))) as string[];
      const priorities = Array.from(new Set(allRows.map(r => r.Priority).filter(Boolean))) as string[];
      const taskTypes = Array.from(new Set(allRows.map(r => r.TaskType).filter(Boolean))) as string[];
      setCsvUniqueStatuses(statuses);
      setCsvUniquePriorities(priorities);
      setCsvUniqueTaskTypes(taskTypes);

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

      const autoTypeMap: Record<string, string> = {};
      taskTypes.forEach(csvVal => {
        const match = importAvailTaskTypes.find(t =>
          (t.TypeName || t.StatusName).toLowerCase().trim() === csvVal.toLowerCase().trim()
        );
        autoTypeMap[csvVal] = match ? String(match.Id) : '';
      });
      setImportTaskTypeMapping(autoTypeMap);

      setImportProgress(`Ready to import ${allRows.length} tasks`);
    } catch (err) {
      setImportProgress('Error reading file');
      console.error(err);
    }
  };

  const parseCSV = (text: string) => {
    return parseCsv(text);
  };

  const handleImport = async () => {
    if (!importFile || !token) return;

    setImportProgress('Importing tasks...');

    try {
      const text = await importFile.text();
      const parsed = parseCSV(text);

      // Apply status/priority/type mappings and add ProjectId
      const tasksWithProject = (importAllRows.length > 0 ? importAllRows : parsed).map(task => {
        const mappedStatus = task.Status ? importStatusMapping[task.Status] : undefined;
        const mappedPriority = task.Priority ? importPriorityMapping[task.Priority] : undefined;
        const mappedTaskType = task.TaskType ? importTaskTypeMapping[task.TaskType] : undefined;
        return {
          ...task,
          ProjectId: projectId,
          Status: mappedStatus || '',
          Priority: mappedPriority || '',
          TaskType: mappedTaskType || importDefaultTaskType || '',
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

  // Jira Import Functions
  const loadExistingJiraIssues = async () => {
    if (!token || !projectId) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/tasks/project/${projectId}/integrated-issue-ids`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const existingIds = new Set<string>(
          Array.isArray(data.issueIds)
            ? data.issueIds
                .map((value: any) => String(value || '').trim())
                .filter((value: string) => value.length > 0)
            : []
        );
        setExistingIssueIds(existingIds);

        const detailsByKey: Record<string, { taskId: number; statusId: number | null; statusName: string | null }> = {};
        if (Array.isArray(data.issueDetails)) {
          for (const detail of data.issueDetails) {
            const issueKey = String(detail?.IssueKey || '').trim();
            if (!issueKey || detailsByKey[issueKey]) continue;
            detailsByKey[issueKey] = {
              taskId: Number(detail?.TaskId || 0),
              statusId: detail?.StatusId === null || detail?.StatusId === undefined ? null : Number(detail.StatusId),
              statusName: detail?.StatusName ? String(detail.StatusName) : null,
            };
          }
        }
        setExistingJiraIssueStatusByKey(detailsByKey);
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

      const savedStatusMapping = parseMappingJson(project.JiraTaskStatusMappingJson);
      const savedPriorityMapping = parseMappingJson(project.JiraTaskPriorityMappingJson);
      const savedTaskTypeMapping = parseMappingJson(project.JiraTaskTypeMappingJson);
      
      // Auto-create status mapping based on matching names
      if (taskStatuses.length > 0 && data.data) {
        const mapping: {[key: string]: string} = { ...savedStatusMapping };
        const jiraStatuses = new Set<string>();
        
        data.data.forEach((issue: any) => {
          if (issue.status) {
            jiraStatuses.add(issue.status);
          }
        });
        
        jiraStatuses.forEach(jiraStatus => {
          if (mapping[jiraStatus]) return;
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

      // Auto-create priority mapping based on matching names
      if (taskPriorities.length > 0 && data.data) {
        const mapping: { [key: string]: string } = { ...savedPriorityMapping };
        const jiraPriorities = new Set<string>();

        data.data.forEach((issue: any) => {
          if (issue.priority) {
            jiraPriorities.add(issue.priority);
          }
        });

        jiraPriorities.forEach((jiraPriority) => {
          if (mapping[jiraPriority]) return;
          const match = taskPriorities.find(
            tp => String(tp.PriorityName || tp.StatusName || '').toLowerCase() === jiraPriority.toLowerCase()
          );
          if (match) {
            mapping[jiraPriority] = String(match.PriorityName || match.StatusName || '');
          } else {
            const defaultPriority = taskPriorities.find(p => p.IsDefault);
            mapping[jiraPriority] = String(defaultPriority?.PriorityName || defaultPriority?.StatusName || taskPriorities[0]?.PriorityName || taskPriorities[0]?.StatusName || '');
          }
        });

        setPriorityMapping(mapping);
      }

      // Auto-create task type mapping based on Jira issue type names
      if (taskTypes.length > 0 && data.data) {
        const mapping: { [key: string]: string } = { ...savedTaskTypeMapping };
        const jiraIssueTypes = new Set<string>();

        data.data.forEach((issue: any) => {
          if (issue.issueType) {
            jiraIssueTypes.add(issue.issueType);
          }
        });

        jiraIssueTypes.forEach((jiraIssueType) => {
          if (mapping[jiraIssueType]) return;
          const match = taskTypes.find(
            tt => String(tt.TypeName || tt.StatusName || '').toLowerCase() === jiraIssueType.toLowerCase()
          );
          if (match) {
            mapping[jiraIssueType] = String(match.TypeName || match.StatusName || '');
          } else {
            const defaultType = taskTypes.find(t => t.IsDefault);
            mapping[jiraIssueType] = String(defaultType?.TypeName || defaultType?.StatusName || taskTypes[0]?.TypeName || taskTypes[0]?.StatusName || '');
          }
        });

        setTaskTypeMapping(mapping);
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

  const loadTaskTypes = async () => {
    if (!token || !project) return;

    try {
      const types = await statusValuesApi.getTaskTypes(project.OrganizationId, token);
      setTaskTypes(types.types || []);
    } catch (err: any) {
      console.error('Failed to load task types:', err);
    }
  };

  const loadTaskPriorities = async () => {
    if (!token || !project) return;

    try {
      const priorities = await statusValuesApi.getTaskPriorities(project.OrganizationId, token);
      setTaskPriorities(priorities.priorities || []);
    } catch (err: any) {
      console.error('Failed to load task priorities:', err);
    }
  };

  const loadJiraTickets = async (searchQuery = '', ignoreConfiguredJql = false) => {
    if (!token || !project) return;
    
    setJiraTicketsLoading(true);
    setJiraTicketsError('');
    
    try {
      const params = new URLSearchParams();
      const trimmedQuery = searchQuery.trim();

      if (trimmedQuery) {
        params.append('query', trimmedQuery);
      }

      const shouldIgnoreConfiguredJql = ignoreConfiguredJql;
      if (shouldIgnoreConfiguredJql) {
        params.append('ignoreConfiguredJql', 'true');
      }
      
      const response = await fetch(
        `${getApiUrl()}/api/jira-integrations/organization/${project.OrganizationId}/search?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch Jira tickets');
      }

      const data = await response.json();
      const fetchedIssues = data.issues || [];
      setJiraTickets(fetchedIssues);
      setJiraTicketMappings((prev) => {
        const autoMappings = buildAutoTicketMappings(fetchedIssues, jiraImportCustomers, jiraImportUsers);
        const merged: Record<string, { customerId?: number; assigneeId?: number }> = { ...autoMappings };

        for (const key of Object.keys(prev)) {
          if (!merged[key]) merged[key] = {};
          if (prev[key]?.customerId !== undefined) merged[key].customerId = prev[key].customerId;
          if (prev[key]?.assigneeId !== undefined) merged[key].assigneeId = prev[key].assigneeId;
        }

        return merged;
      });

      if (taskPriorities.length > 0) {
        const defaultPriority = taskPriorities.find(p => p.IsDefault);
        setJiraTicketPriorityMapping(prev => {
          const mapping = { ...prev };
          const jiraPriorities = new Set<string>(fetchedIssues.map((issue: any) => issue.priority).filter(Boolean));

          jiraPriorities.forEach((jiraPriority) => {
            if (mapping[jiraPriority]) return;
            const match = taskPriorities.find(
              p => String(p.PriorityName || p.StatusName || '').toLowerCase() === jiraPriority.toLowerCase()
            );
            mapping[jiraPriority] = String(
              match?.PriorityName ||
              match?.StatusName ||
              defaultPriority?.PriorityName ||
              defaultPriority?.StatusName ||
              taskPriorities[0]?.PriorityName ||
              taskPriorities[0]?.StatusName ||
              ''
            );
          });

          return mapping;
        });
      }

      if (taskTypes.length > 0) {
        const defaultType = taskTypes.find(t => t.IsDefault);
        setJiraTicketTypeMapping(prev => {
          const mapping = { ...prev };
          const jiraIssueTypes = new Set<string>(fetchedIssues.map((issue: any) => issue.issueType).filter(Boolean));

          jiraIssueTypes.forEach((jiraIssueType) => {
            if (mapping[jiraIssueType]) return;
            const match = taskTypes.find(
              t => String(t.TypeName || t.StatusName || '').toLowerCase() === jiraIssueType.toLowerCase()
            );
            mapping[jiraIssueType] = String(
              match?.TypeName ||
              match?.StatusName ||
              defaultType?.TypeName ||
              defaultType?.StatusName ||
              taskTypes[0]?.TypeName ||
              taskTypes[0]?.StatusName ||
              ''
            );
          });

          return mapping;
        });
      }
    } catch (err: any) {
      setJiraTicketsError(err.message || 'Failed to load Jira tickets');
    } finally {
      setJiraTicketsLoading(false);
    }
  };

  const shouldIgnoreConfiguredJqlForJiraTickets = (searchText: string) => {
    return searchText.trim().length > 0;
  };

  const resolveJiraTicketMappedStatus = (jiraStatus?: string): { id: number; name: string } | null => {
    if (!jiraStatus) return null;

    const mappedValue = jiraTicketStatusMapping[jiraStatus];
    if (mappedValue !== undefined && mappedValue !== null && String(mappedValue).trim() !== '') {
      const mappedId = Number(mappedValue);
      if (!Number.isNaN(mappedId)) {
        const byId = taskStatuses.find((status) => Number(status.Id) === mappedId);
        if (byId) {
          return { id: Number(byId.Id), name: String(byId.StatusName || byId.PriorityName || byId.TypeName || '') };
        }
      }

      const byName = taskStatuses.find((status) =>
        String(status.StatusName || '').trim().toLowerCase() === String(mappedValue).trim().toLowerCase()
      );
      if (byName) {
        return { id: Number(byName.Id), name: String(byName.StatusName || '') };
      }
    }

    const direct = taskStatuses.find((status) =>
      String(status.StatusName || '').trim().toLowerCase() === String(jiraStatus).trim().toLowerCase()
    );

    if (!direct) return null;
    return { id: Number(direct.Id), name: String(direct.StatusName || '') };
  };

  const getExistingJiraStatusUpdate = (issueKey: string, jiraStatus?: string) => {
    const existing = existingJiraIssueStatusByKey[issueKey];
    if (!existing) return { isExisting: false, hasStatusChange: false, mappedStatusName: null as string | null };

    const mappedStatus = resolveJiraTicketMappedStatus(jiraStatus);
    if (!mappedStatus) {
      return { isExisting: true, hasStatusChange: false, mappedStatusName: null as string | null };
    }

    const currentStatusId = existing.statusId === null || existing.statusId === undefined ? null : Number(existing.statusId);
    const hasStatusChange = currentStatusId !== mappedStatus.id;

    return {
      isExisting: true,
      hasStatusChange,
      mappedStatusName: mappedStatus.name || null,
    };
  };

  const handleImportJiraTickets = async () => {
    if (!token || !project) return;

    const selectedIssueKeys = Array.from(selectedJiraTickets);
    const actionableIssueKeys = selectedIssueKeys.filter((key) => {
      if (!existingIssueIds.has(key)) return true;
      const issue = jiraTickets.find((item) => item.key === key);
      if (!issue) return false;
      return getExistingJiraStatusUpdate(issue.key, issue.status).hasStatusChange;
    });

    if (actionableIssueKeys.length === 0) return;

    setJiraTicketsImporting(true);
    setJiraTicketsError('');

    try {
      const issuesToImport = jiraTickets.filter(issue => actionableIssueKeys.includes(issue.key));

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
            importSource: 'ticket',
            issues: issuesToImport,
            statusMapping: jiraTicketStatusMapping,
            priorityMapping: jiraTicketPriorityMapping,
            taskTypeMapping: jiraTicketTypeMapping,
            allowStatusUpdatesForExisting: true,
            ticketMappings: Object.fromEntries(
              actionableIssueKeys.map((key) => {
                const rawCustomerId = jiraTicketMappings[key]?.customerId;
                const isAutoCreate = rawCustomerId !== undefined && rawCustomerId !== null && Number(rawCustomerId) < 0;
                let autoCreateCustomerName: string | null = null;
                if (isAutoCreate) {
                  const orgIndex = -(Number(rawCustomerId)) - 1;
                  const ticket = jiraTickets.find((t) => t.key === key);
                  autoCreateCustomerName = Array.isArray(ticket?.organizations) ? (ticket.organizations[orgIndex] || null) : null;
                }
                return [
                  key,
                  {
                    customerId: isAutoCreate ? null : (rawCustomerId || null),
                    assigneeId: jiraTicketMappings[key]?.assigneeId || null,
                    autoCreateCustomerName,
                  },
                ];
              })
            ),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to import Jira tickets');
      }

      const result = await response.json();
      const imported = result.data?.imported || 0;
      const skipped = result.data?.skipped || 0;
      const updatedStatuses = result.data?.updatedStatuses || 0;

      let message = `Successfully imported ${imported} task(s) from Jira tickets.`;
      if (updatedStatuses > 0) {
        message += ` Updated status on ${updatedStatuses} existing task(s).`;
      }
      if (skipped > 0) {
        message += ` ${skipped} issue(s) were already integrated without status changes.`;
      }

      showAlert('Import Successful', message);
      await loadProject();
      setShowJiraTicketsModal(false);
      setSelectedJiraTickets(new Set());
      setJiraTicketStatusMapping({});
      setJiraTicketPriorityMapping({});
      setJiraTicketTypeMapping({});
      setJiraTicketMappings({});
      await loadTasks();
      await loadExistingJiraIssues();
    } catch (err: any) {
      setJiraTicketsError(err.message || 'Failed to import Jira tickets');
    } finally {
      setJiraTicketsImporting(false);
    }
  };

  const resolveCheckStatusMapped = (jiraStatus: string, mapping: Record<string, string>): { id: number; name: string } | null => {
    const val = mapping[jiraStatus];
    if (val) {
      const byName = taskStatuses.find(s => (s.StatusName || '').toLowerCase() === val.toLowerCase());
      if (byName) return { id: Number(byName.Id), name: String(byName.StatusName || '') };
    }
    const direct = taskStatuses.find(s => (s.StatusName || '').toLowerCase() === (jiraStatus || '').toLowerCase());
    return direct ? { id: Number(direct.Id), name: String(direct.StatusName || '') } : null;
  };

  const resolveCheckStatusTarget = (
    issueKey: string,
    jiraStatus: string,
    mapping: Record<string, string>,
    overrides: Record<string, string>
  ): { id: number; name: string } | null => {
    const overrideValue = String(overrides[issueKey] || '').trim();
    if (overrideValue) {
      const byName = taskStatuses.find(s => (s.StatusName || '').toLowerCase() === overrideValue.toLowerCase());
      if (byName) return { id: Number(byName.Id), name: String(byName.StatusName || '') };
    }
    return resolveCheckStatusMapped(jiraStatus, mapping);
  };

  const hasCheckStatusChange = (
    ticket: { issueKey: string; jiraStatus: string; taskStatusId: number | null; taskStatusName: string | null },
    mapping: Record<string, string>,
    overrides: Record<string, string>
  ) => {
    const target = resolveCheckStatusTarget(ticket.issueKey, ticket.jiraStatus, mapping, overrides);
    if (target) return target.id !== (ticket.taskStatusId === null ? null : Number(ticket.taskStatusId));
    return (ticket.jiraStatus || '').toLowerCase() !== (ticket.taskStatusName || '').toLowerCase();
  };

  const handleOpenCheckJiraStatus = async () => {
    if (!project || !token) return;
    setJiraCheckStatusMode('ticket');
    setShowJiraCheckStatusModal(true);
    setJiraCheckStatusLoading(true);
    setJiraCheckStatusError('');
    setJiraCheckStatusTickets([]);
    setSelectedCheckStatusKeys(new Set());
    setJiraCheckStatusOverrides({});
    const initialMapping = parseMappingJson(project.JiraTaskStatusMappingJson);
    setJiraCheckStatusMapping(initialMapping);
    try {
      const res = await fetch(
        `${getApiUrl()}/api/jira-integrations/organization/${project.OrganizationId}/check-ticket-statuses?projectId=${projectId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to load ticket statuses');
      }
      const data = await res.json();
      const tickets = data.tickets || [];
      setJiraCheckStatusTickets(tickets);
    } catch (err: any) {
      setJiraCheckStatusError(err.message || 'Failed to load ticket statuses');
    } finally {
      setJiraCheckStatusLoading(false);
    }
  };

  const handleOpenCheckJiraBoardStatus = async () => {
    if (!project || !token) return;
    setJiraCheckStatusMode('board');
    setShowJiraCheckStatusModal(true);
    setJiraCheckStatusLoading(true);
    setJiraCheckStatusError('');
    setJiraCheckStatusTickets([]);
    setSelectedCheckStatusKeys(new Set());
    setJiraCheckStatusOverrides({});
    const initialMapping = parseMappingJson(project.JiraTaskStatusMappingJson);
    setJiraCheckStatusMapping(initialMapping);
    try {
      const res = await fetch(
        `${getApiUrl()}/api/jira-integrations/project/${projectId}/check-board-statuses`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to load board statuses');
      }
      const data = await res.json();
      const tickets = data.tickets || [];
      setJiraCheckStatusTickets(tickets);
    } catch (err: any) {
      setJiraCheckStatusError(err.message || 'Failed to load board statuses');
    } finally {
      setJiraCheckStatusLoading(false);
    }
  };

  const handleApplyCheckJiraStatus = async () => {
    if (!project || !token || selectedCheckStatusKeys.size === 0) return;
    setIsApplyingCheckStatus(true);
    setJiraCheckStatusError('');
    try {
      const issuesToUpdate = jiraCheckStatusTickets
        .filter(t => selectedCheckStatusKeys.has(t.issueKey))
        .map(t => ({ key: t.issueKey, status: t.jiraStatus, summary: t.jiraSummary }));

      const selectedIssueStatusOverrides = Object.fromEntries(
        Array.from(selectedCheckStatusKeys)
          .map((issueKey) => [issueKey, jiraCheckStatusOverrides[issueKey]])
          .filter(([, value]) => String(value || '').trim() !== '')
      );

      const res = await fetch(`${getApiUrl()}/api/tasks/import-from-jira`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: parseInt(projectId),
          importSource: jiraCheckStatusMode === 'board' ? 'project' : 'ticket',
          issues: issuesToUpdate,
          statusMapping: jiraCheckStatusMapping,
          issueStatusOverrides: selectedIssueStatusOverrides,
          allowStatusUpdatesForExisting: true,
          ticketMappings: {},
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update statuses');
      }
      const result = await res.json();
      const updated = result.data?.updatedStatuses || 0;
      showAlert(
        jiraCheckStatusMode === 'board' ? 'Board Status Update' : 'Ticket Status Update',
        `Updated status on ${updated} task(s).`
      );
      setShowJiraCheckStatusModal(false);
      setSelectedCheckStatusKeys(new Set());
      setJiraCheckStatusTickets([]);
      await loadTasks();
    } catch (err: any) {
      setJiraCheckStatusError(err.message || 'Failed to update statuses');
    } finally {
      setIsApplyingCheckStatus(false);
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
            importSource: 'project',
            issues: issuesToImport,
            statusMapping: statusMapping,
            priorityMapping: priorityMapping,
            taskTypeMapping: taskTypeMapping,
            ticketMappings: Object.fromEntries(
              issuesToImport.map((issue: any) => {
                const selectedAssignee = jiraBoardAssigneeMapping[String(issue.assignee || '').trim()];
                return [issue.key, {
                  assigneeId: selectedAssignee ? Number(selectedAssignee) : null,
                }];
              })
            ),
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
      setStatusMapping({});
      setPriorityMapping({});
      setTaskTypeMapping({});
      setJiraBoardAssigneeMapping({});
      await loadProject();
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

  // Filter and sort Jira issues hierarchically (parents followed by their subtasks)
  const getSortedFilteredJiraIssues = () => {
    const statusFilter = normalizeLookup(jiraFilters.status);
    const issueTypeFilter = normalizeLookup(jiraFilters.issueType);
    const priorityFilter = normalizeLookup(jiraFilters.priority);
    const assigneeFilter = normalizeLookup(jiraFilters.assignee);

    const issueKeys = new Set(jiraIssues.map((issue) => String(issue.key || '')));
    const parentKeySet = new Set(
      jiraIssues
        .map((issue) => String(issue.parentKey || '').trim())
        .filter((parentKey) => parentKey.length > 0 && issueKeys.has(parentKey))
    );

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
      if (statusFilter && normalizeLookup(issue.status) !== statusFilter) {
        return false;
      }
      
      // Issue type filter
      if (issueTypeFilter && normalizeLookup(issue.issueType) !== issueTypeFilter) {
        return false;
      }
      
      // Priority filter
      if (priorityFilter && normalizeLookup(issue.priority) !== priorityFilter) {
        return false;
      }

      // Assignee filter
      if (assigneeFilter && normalizeLookup(issue.assignee) !== assigneeFilter) {
        return false;
      }
      
      return true;
    });

    // Apply hierarchy and import filters
    const finalFilteredIssues = basicFilteredIssues.filter(issue => {
      const issueKey = String(issue.key || '').trim();
      const parentKey = String(issue.parentKey || '').trim();
      const isSubtask = parentKey.length > 0;
      const isParent = parentKeySet.has(issueKey) || (issue.subtasks && issue.subtasks.length > 0);
      
      // Parent/subtask filters
      if (jiraFilters.showParentsOnly && !isParent) {
        return false;
      }
      
      if (jiraFilters.showSubtasksOnly && !isSubtask) {
        return false;
      }
      
      // Already imported filter - CORRECTED LOGIC
      const isAlreadyImported = existingIssueIds.has(issueKey);
      
      // If showAlreadyImported is false (default), hide already imported issues
      if (!showAlreadyImported && isAlreadyImported) {
        return false;
      }
      
      // If showAlreadyImported is true, show all issues (both imported and not imported)
      return true;
    });
    
    // Hierarchical ordering that guarantees all filtered issues are returned
    const result: any[] = [];
    const processedKeys = new Set<string>();
    const byKey = new Map<string, any>();
    const childrenByParent = new Map<string, any[]>();

    finalFilteredIssues.forEach((issue) => {
      const issueKey = String(issue.key || '').trim();
      if (!issueKey) return;
      byKey.set(issueKey, issue);
    });

    finalFilteredIssues.forEach((issue) => {
      const issueKey = String(issue.key || '').trim();
      const parentKey = String(issue.parentKey || '').trim();
      if (!issueKey || !parentKey || !byKey.has(parentKey)) return;

      if (!childrenByParent.has(parentKey)) {
        childrenByParent.set(parentKey, []);
      }
      childrenByParent.get(parentKey)!.push(issue);
    });

    const visitIssueTree = (issue: any) => {
      const issueKey = String(issue.key || '').trim();
      if (!issueKey || processedKeys.has(issueKey)) return;

      result.push(issue);
      processedKeys.add(issueKey);

      const children = childrenByParent.get(issueKey) || [];
      children.forEach(visitIssueTree);
    };

    // Start from roots (items without parent in the filtered set), preserving original order
    finalFilteredIssues.forEach((issue) => {
      const parentKey = String(issue.parentKey || '').trim();
      const isRoot = !parentKey || !byKey.has(parentKey);
      if (isRoot) {
        visitIssueTree(issue);
      }
    });

    // Safety fallback: append anything not yet included
    finalFilteredIssues.forEach((issue) => {
      visitIssueTree(issue);
    });

    return result;
  };
  
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

  const loadGitHubIssues = async (applicationIdOverride?: number) => {
    if (!token || !project) return;

    const applicationId = applicationIdOverride ?? gitHubImportApplicationId;
    const linkedApps = (project.Applications || []).filter(
      (app: { RepositoryUrl?: string | null; GitHubIntegrationId?: number | null }) =>
        Boolean(app.RepositoryUrl) &&
        (Boolean(app.GitHubIntegrationId) || /github/i.test(String(app.RepositoryUrl)))
    );
    const legacyConfigured = Boolean(project.GitHubOwner && project.GitHubRepo);

    if (!applicationId && linkedApps.length === 0 && !legacyConfigured) {
      setGitHubError(
        'Link an Application with a GitHub repository URL (and optional GitHub integration) to this project, then select it here.'
      );
      setGitHubLoading(false);
      return;
    }

    if (!applicationId && linkedApps.length > 0) {
      setGitHubError('Select an application to import GitHub issues from.');
      setGitHubLoading(false);
      return;
    }

    setGitHubLoading(true);
    setGitHubError('');

    try {
      const queryParams = new URLSearchParams();
      if (applicationId) {
        queryParams.append('applicationId', String(applicationId));
      } else if (legacyConfigured) {
        queryParams.append('owner', String(project.GitHubOwner));
        queryParams.append('repo', String(project.GitHubRepo));
      }
      if (gitHubFilters.search) {
        queryParams.append('query', gitHubFilters.search);
      }

      const response = await fetch(
        `${getApiUrl()}/api/github-integrations/organization/${project.OrganizationId}/search?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

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

  const loadGiteaIssues = async (applicationIdOverride?: number) => {
    if (!token || !project) return;

    const applicationId = applicationIdOverride ?? giteaImportApplicationId;
    const linkedApps = (project.Applications || []).filter(
      (app: { RepositoryUrl?: string | null; GiteaIntegrationId?: number | null }) =>
        Boolean(app.RepositoryUrl) &&
        (Boolean(app.GiteaIntegrationId) || /gitea/i.test(String(app.RepositoryUrl)))
    );
    const legacyConfigured = Boolean(project.GiteaOwner && project.GiteaRepo);

    if (!applicationId && linkedApps.length === 0 && !legacyConfigured) {
      setGiteaError(
        'Link an Application with a Gitea repository URL (and Gitea integration) to this project, then select it here.'
      );
      setGiteaLoading(false);
      return;
    }

    if (!applicationId && linkedApps.length > 0) {
      setGiteaError('Select an application to import Gitea issues from.');
      setGiteaLoading(false);
      return;
    }

    setGiteaLoading(true);
    setGiteaError('');

    try {
      const queryParams = new URLSearchParams();
      if (applicationId) {
        queryParams.append('applicationId', String(applicationId));
      } else if (legacyConfigured) {
        queryParams.append('owner', String(project.GiteaOwner));
        queryParams.append('repo', String(project.GiteaRepo));
      }
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

      const response = await fetch(
        `${getApiUrl()}/api/gitea-integrations/organization/${project.OrganizationId}/search?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

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
      const initializeJiraImport = async () => {
        await Promise.all([
          loadTaskStatuses(),
          loadTaskPriorities(),
          loadTaskTypes(),
          loadExistingJiraIssues(),
          usersApi.getByOrganization(project.OrganizationId, token!).then((res) => setJiraImportUsers(res.users || [])).catch(() => setJiraImportUsers([])),
        ]);
        await loadJiraIssues();
      };

      initializeJiraImport();
    } else if (!showJiraImportModal) {
      // Reset filters when modal closes
      setJiraFilters({
        search: '',
        status: '',
        issueType: '',
        priority: '',
        assignee: '',
        showParentsOnly: false,
        showSubtasksOnly: false
      });
      setShowAlreadyImported(false);
      setExistingIssueIds(new Set());
      setPriorityMapping({});
      setTaskTypeMapping({});
      setJiraBoardAssigneeMapping({});
    }
  }, [showJiraImportModal, project]);

  useEffect(() => {
    if (!showJiraImportModal || jiraIssues.length === 0 || jiraImportUsers.length === 0) return;

    setJiraBoardAssigneeMapping((prev) => {
      const autoMappings = buildAutoJiraBoardAssigneeMapping(jiraIssues, jiraImportUsers);
      return {
        ...autoMappings,
        ...prev,
      };
    });
  }, [showJiraImportModal, jiraIssues, jiraImportUsers]);

  // Load task statuses and GitHub issues when modal opens
  useEffect(() => {
    if (showGitHubImportModal && project) {
      const linkedApps = (project.Applications || []).filter(
        (app: { RepositoryUrl?: string | null; GitHubIntegrationId?: number | null }) =>
          Boolean(app.RepositoryUrl) &&
          (Boolean(app.GitHubIntegrationId) || /github/i.test(String(app.RepositoryUrl)))
      );
      const initialAppId =
        gitHubImportApplicationId ||
        (linkedApps.length === 1 ? linkedApps[0].Id : linkedApps[0]?.Id || 0);
      if (initialAppId && initialAppId !== gitHubImportApplicationId) {
        setGitHubImportApplicationId(initialAppId);
      }
      loadTaskStatuses();
      loadExistingGitHubIssues();
      void loadGitHubIssues(initialAppId || undefined);
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
      setGitHubImportApplicationId(0);
    }
  }, [showGitHubImportModal, project]);

  // Load Jira tickets for "Import from Jira Ticket" when modal opens
  useEffect(() => {
    if (showJiraTicketsModal && project) {
      setHideIntegratedJiraTickets(jiraIntegration?.HideIntegratedJiraTicketsByDefault === 1);
      setSelectedJiraTickets(new Set());
      setJiraTicketsError('');
      setJiraSearchQuery('');
      setJiraTicketMappings({});
      setJiraTicketStatusMapping(parseMappingJson(project.JiraTaskStatusMappingJson));
      setJiraTicketPriorityMapping(parseMappingJson(project.JiraTaskPriorityMappingJson));
      setJiraTicketTypeMapping(parseMappingJson(project.JiraTaskTypeMappingJson));

      const initializeJiraTicketImport = async () => {
        await Promise.all([
          usersApi.getByOrganization(project.OrganizationId, token!).then((res) => setJiraImportUsers(res.users || [])).catch(() => setJiraImportUsers([])),
          getCustomersByOrganization(token!, project.OrganizationId).then((data) => setJiraImportCustomers(data || [])).catch(() => setJiraImportCustomers([])),
          loadTaskStatuses(),
          loadTaskPriorities(),
          loadTaskTypes(),
          loadExistingJiraIssues(),
        ]);
        await loadJiraTickets('', shouldIgnoreConfiguredJqlForJiraTickets(''));
      };

      initializeJiraTicketImport();
    }
  }, [showJiraTicketsModal, project, jiraIntegration]);

  const loadOutlookQueueItems = async () => {
    if (!token) return;

    setOutlookQueueLoading(true);
    setOutlookQueueError('');

    try {
      const response = await fetch(`${getApiUrl()}/api/email-task-queue?limit=50`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to load Outlook queue');
      }

      const data = await response.json();
      const items = data.items || [];
      setOutlookQueueItems(items);
      setHasOutlookQueueItems(items.length > 0);
      setSelectedOutlookQueueIds(new Set());
      setOutlookQueueMappings({});
    } catch (err: any) {
      setOutlookQueueError(err.message || 'Failed to load Outlook queue');
      setOutlookQueueItems([]);
      setHasOutlookQueueItems(false);
    } finally {
      setOutlookQueueLoading(false);
    }
  };

  useEffect(() => {
    if (showOutlookQueueModal && project && token) {
      loadOutlookQueueItems();
    }
  }, [showOutlookQueueModal, project, token]);

  const handleDismissOutlookQueueItem = async (queueItemId: number) => {
    if (!token) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/email-task-queue/${queueItemId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to dismiss queue item');
      }

      setOutlookQueueItems((prev) => {
        const next = prev.filter((item) => item.Id !== queueItemId);
        setHasOutlookQueueItems(next.length > 0);
        return next;
      });
      setSelectedOutlookQueueIds((prev) => {
        const next = new Set(prev);
        next.delete(queueItemId);
        return next;
      });
    } catch (err: any) {
      setOutlookQueueError(err.message || 'Failed to dismiss queue item');
    }
  };

  const handleImportOutlookQueue = async () => {
    if (!token || !project) return;

    const selectedIds = Array.from(selectedOutlookQueueIds);
    if (selectedIds.length === 0) return;

    setOutlookQueueImporting(true);
    setOutlookQueueError('');

    try {
      const response = await fetch(`${getApiUrl()}/api/email-task-queue/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: parseInt(projectId),
          queueItemIds: selectedIds,
          defaults: {
            assignedTo: user?.id,
          },
          itemOverrides: Object.fromEntries(
            selectedIds.map((id) => [
              id,
              {
                assigneeId: outlookQueueMappings[id]?.assigneeId ?? user?.id ?? null,
              },
            ])
          ),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to import from Outlook queue');
      }

      const result = await response.json();
      const imported = result.data?.imported || 0;
      const skipped = result.data?.skipped || 0;

      let message = `Successfully imported ${imported} task(s) from Outlook queue.`;
      if (skipped > 0) {
        message += ` ${skipped} item(s) were skipped.`;
      }

      showAlert('Import Successful', message);
      setShowOutlookQueueModal(false);
      setSelectedOutlookQueueIds(new Set());
      setOutlookQueueMappings({});
      await loadTasks();
      await refreshOutlookQueueAvailability();
    } catch (err: any) {
      setOutlookQueueError(err.message || 'Failed to import from Outlook queue');
    } finally {
      setOutlookQueueImporting(false);
    }
  };

  useEffect(() => {
    if (!showJiraTicketsModal || jiraTickets.length === 0) return;

    setJiraTicketMappings((prev) => {
      const autoMappings = buildAutoTicketMappings(jiraTickets, jiraImportCustomers, jiraImportUsers);
      const merged: Record<string, { customerId?: number; assigneeId?: number }> = { ...autoMappings };
      for (const key of Object.keys(prev)) {
        if (!merged[key]) merged[key] = {};
        if (prev[key]?.customerId !== undefined) merged[key].customerId = prev[key].customerId;
        if (prev[key]?.assigneeId !== undefined) merged[key].assigneeId = prev[key].assigneeId;
      }
      return merged;
    });
  }, [showJiraTicketsModal, jiraTickets, jiraImportCustomers, jiraImportUsers]);

  const visibleJiraTickets = jiraTickets.filter(ticket => {
    if (!hideIntegratedJiraTickets) return true;
    if (!existingIssueIds.has(ticket.key)) return true;
    return getExistingJiraStatusUpdate(ticket.key, ticket.status).hasStatusChange;
  });

  const jiraTicketIssueTypes = Array.from(new Set(jiraTickets.map(t => t.issueType).filter(Boolean)));
  const jiraTicketPriorities = Array.from(new Set(jiraTickets.map(t => t.priority).filter(Boolean)));

  // Load task statuses and Gitea issues when modal opens
  useEffect(() => {
    if (showGiteaImportModal && project) {
      const linkedApps = (project.Applications || []).filter(
        (app: { RepositoryUrl?: string | null; GiteaIntegrationId?: number | null }) =>
          Boolean(app.RepositoryUrl) &&
          (Boolean(app.GiteaIntegrationId) || /gitea/i.test(String(app.RepositoryUrl)))
      );
      const initialAppId =
        giteaImportApplicationId ||
        (linkedApps.length === 1 ? linkedApps[0].Id : linkedApps[0]?.Id || 0);
      if (initialAppId && initialAppId !== giteaImportApplicationId) {
        setGiteaImportApplicationId(initialAppId);
      }
      loadTaskStatuses();
      loadExistingGiteaIssues();
      void loadGiteaIssues(initialAppId || undefined);
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
      setGiteaImportApplicationId(0);
    }
  }, [showGiteaImportModal, project]);

  useEffect(() => {
    if (activeTab !== 'tasks' || !project || !token) return;

    const loadTaskEditorMetadata = async () => {
      await Promise.all([
        loadTaskStatuses(),
        loadTaskPriorities(),
        loadTaskTypes(),
        usersApi
          .getByOrganization(project.OrganizationId, token)
          .then((res) => setTaskEditorUsers(res.users || []))
          .catch(() => setTaskEditorUsers([])),
      ]);
    };

    loadTaskEditorMetadata();
  }, [activeTab, project, token]);

  if (authLoading || isLoading) {
    return (
      <PageLoadingSkeleton />
    );
  }

  if (!user || !project) return null;

  const projectTabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'tasks' as const, label: 'Tasks' },
    { id: 'kanban' as const, label: 'Kanban Board' },
    { id: 'gantt' as const, label: 'Gantt Chart' },
    ...(permissions?.canViewReports ? [{ id: 'reporting' as const, label: 'Reporting' }] : []),
    { id: 'burndown' as const, label: 'Burndown' },
    { id: 'sprints' as const, label: 'Sprints' },
    { id: 'milestones' as const, label: 'Milestones' },
    { id: 'attachments' as const, label: 'Attachments' },
    { id: 'dependencies' as const, label: 'Dependencies' },
    { id: 'utilities' as const, label: 'Utilities' },
    ...(permissions?.canManageProjects ? [{ id: 'settings' as const, label: 'Settings' }] : []),
    ...(permissions?.canManageProjects && jiraIntegration?.IsEnabled && jiraIntegration?.JiraProjectsUrl
      ? [{ id: 'mappings' as const, label: 'Mappings' }]
      : []),
    { id: 'history' as const, label: 'History' },
  ];

  return (
    <CustomerUserGuard>
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {/* Outside the scroll region — never covered by tab content */}
      <PageStickyChrome>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-[var(--pm-text)]">{project.ProjectName}</h1>
              {!!project.IsGlobal && (
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  🌐 Global
                </span>
              )}
              {!!project.IsHobby && (
                <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  🎮 Hobby
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--pm-muted)]">
              {project.OrganizationName && <span>{project.OrganizationName}</span>}
              {project.OrganizationName && project.CustomerName && <span aria-hidden>•</span>}
              {project.CustomerName && <span>{project.CustomerName}</span>}
              {project.StatusName && (
                <span
                  className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                  style={pillStyle(project.StatusColor, { alpha: '22', borderAlpha: '44' })}
                >
                  {project.StatusName}
                </span>
              )}
            </div>
          </div>
          <Link
            href="/projects"
            className="shrink-0 text-sm text-[var(--pm-muted)] hover:text-[var(--pm-text)]"
          >
            ← Back to Projects
          </Link>
        </div>

        <PageTabs
          tabs={projectTabs}
          activeId={activeTab}
          onChange={(id) => {
            setActiveTab(id as ProjectDetailTab);
            if (id === 'attachments') loadProjectAttachments();
          }}
        />
      </PageStickyChrome>

      <div
        className={
          activeTab === 'tasks'
            ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-1.5'
            : 'min-h-0 min-w-0 flex-1 overflow-y-auto pt-3'
        }
      >
          {error && (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-400 bg-red-100 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError('')}
                className="text-lg leading-none text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-100"
                aria-label="Close error message"
                title="Close"
              >
                ×
              </button>
            </div>
          )}

          {activeTab === 'overview' && (
            <OverviewTab
              project={project}
              tasks={tasks}
              tickets={tickets}
              internalTicketsEnabled={internalTicketsEnabled}
              canViewBudgetInfo={permissions?.canViewBudgetInfo || false}
              token={token || ''}
              onViewTasks={() => setActiveTab('tasks')}
            />
          )}

          {activeTab === 'tasks' && (
            <div className="flex min-h-0 flex-1 flex-col">
            <TasksTab
              tasks={tasks}
              project={project}
              jiraIntegration={jiraIntegration}
              taskStatuses={taskStatuses}
              taskPriorities={taskPriorities}
              taskTypes={taskTypes}
              organizationUsers={taskEditorUsers}
              onCreateTask={handleCreateTask}
              onEditTask={handleEditTask}
              onInlineSaveTask={handleInlineTaskSave}
              onRefreshTasks={loadTasks}
              onDeleteTask={handleDeleteTask}
              onError={setError}
              onImportClick={handleImportClick}
              onImportFromJira={() => setShowJiraImportModal(true)}
              onImportFromJiraTicket={() => {
                setShowJiraTicketsModal(true);
              }}
              onImportFromOutlookQueue={() => setShowOutlookQueueModal(true)}
              hasOutlookQueueItems={hasOutlookQueueItems}
              onCheckJiraTicketStatus={handleOpenCheckJiraStatus}
              onCheckJiraBoardStatus={handleOpenCheckJiraBoardStatus}
              onImportFromGitHub={() => setShowGitHubImportModal(true)}
              onImportFromGitea={() => setShowGiteaImportModal(true)}
              internalTicketsEnabled={internalTicketsEnabled}
              canCreate={permissions?.canCreateTasks || false}
              canManage={permissions?.canManageTasks || false}
              canDelete={permissions?.canDeleteTasks || false}
              token={token!}
            />
            </div>
          )}

          {activeTab === 'kanban' && (
            <KanbanTab
              tasks={tasks}
              project={project}
              onTaskUpdated={loadTasks}
              onError={setError}
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
            <div data-grid-enhancer-ignore="true">
              <ReportingTab
                projectId={parseInt(projectId)}
                organizationId={project.OrganizationId}
                token={token!}
                onOpenTask={(task) => {
                  const fullTask = tasks.find((entry) => Number(entry.Id) === Number(task.Id)) || task;
                  setEditingTask(fullTask as Task);
                  setShowTaskModal(true);
                }}
              />
            </div>
          )}

          {activeTab === 'utilities' && (
            <UtilitiesTab projectId={parseInt(projectId)} token={token!} onTasksUpdated={loadTasks} />
          )}

          {activeTab === 'attachments' && (
            <AttachmentsTab
              attachments={projectAttachments}
              uploading={uploadingProjectFile}
              onUpload={handleProjectFileUpload}
              onPreview={handlePreviewProjectAttachment}
              onDownload={handleDownloadProjectAttachment}
              onDelete={handleDeleteProjectAttachment}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              project={project}
              token={token!}
              onSaved={handleProjectSaved}
              canViewBudgetInfo={permissions?.canViewBudgetInfo || false}
              hideInlineSave
              onSavingChange={setSettingsSaving}
            />
          )}

          {activeTab === 'mappings' && jiraIntegration?.IsEnabled && jiraIntegration?.JiraProjectsUrl && (
            <ProjectMappingsTab
              project={project}
              token={token!}
              onSaved={handleProjectSaved}
              hideInlineSave
              onSavingChange={setMappingsSaving}
            />
          )}

          {activeTab === 'history' && (
            <HistoryTab projectId={parseInt(projectId)} />
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
            <div data-grid-enhancer-ignore="true">
              <SprintsTab projectId={parseInt(projectId)} organizationId={project.OrganizationId} token={token!} />
            </div>
          )}

          {activeTab === 'milestones' && project && (
            <MilestonesTab
              projectId={parseInt(projectId)}
              organizationId={project.OrganizationId}
              token={token!}
              canManage={permissions?.canManageProjects || false}
            />
          )}
        </div>

      {(activeTab === 'settings' || activeTab === 'mappings') && (
        <PageStickyActions>
          {activeTab === 'settings' && (
            <button
              type="submit"
              form="project-settings-form"
              disabled={settingsSaving}
              className={pageActionButtonClass.primary}
            >
              {settingsSaving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
          {activeTab === 'mappings' && (
            <button
              type="submit"
              form="project-mappings-form"
              disabled={mappingsSaving}
              className={pageActionButtonClass.primary}
            >
              {mappingsSaving ? 'Saving…' : 'Save mappings'}
            </button>
          )}
        </PageStickyActions>
      )}

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
          onOpenTask={(targetTask) => {
            const fullTask = tasks.find((entry) => Number(entry.Id) === Number(targetTask.Id)) || targetTask;
            setEditingTask(fullTask as Task);
            setShowTaskModal(true);
          }}
          onClose={() => {
            setShowTaskModal(false);
            setEditingTask(null);
          }}
          onSaved={handleTaskSaved}
          token={token!}
          // ...existing code... (prop removed)
        />
      )}

      {/* Jira Import Modal */}
      {showJiraImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
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
                      <button
                        onClick={() => setIsJiraStatusMappingOpen(!isJiraStatusMappingOpen)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <h3 className="font-semibold text-blue-900 dark:text-blue-300">📊 Status Mapping</h3>
                        <span className="text-blue-700 dark:text-blue-400 text-sm">{isJiraStatusMappingOpen ? '▲ Collapse' : '▼ Expand'}</span>
                      </button>
                      {isJiraStatusMappingOpen && (
                        <>
                          <p className="text-sm text-blue-800 dark:text-blue-400 mt-3 mb-3">
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
                        </>
                      )}
                    </div>
                  )}

                  {/* Task Type Mapping Section */}
                  {jiraIssues.length > 0 && taskTypes.length > 0 && (
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
                      <button
                        onClick={() => setIsJiraTaskTypeMappingOpen(!isJiraTaskTypeMappingOpen)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <h3 className="font-semibold text-indigo-900 dark:text-indigo-300">🧩 Task Type Mapping</h3>
                        <span className="text-indigo-700 dark:text-indigo-400 text-sm">{isJiraTaskTypeMappingOpen ? '▲ Collapse' : '▼ Expand'}</span>
                      </button>
                      {isJiraTaskTypeMappingOpen && (
                        <>
                          <p className="text-sm text-indigo-800 dark:text-indigo-400 mt-3 mb-3">
                            Map Jira issue types to your project's task types:
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Array.from(new Set(jiraIssues.map(i => i.issueType).filter(Boolean))).map(jiraIssueType => (
                              <div key={jiraIssueType} className="bg-white dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  {jiraIssueType}
                                </label>
                                <select
                                  value={taskTypeMapping[jiraIssueType] || ''}
                                  onChange={(e) => setTaskTypeMapping({
                                    ...taskTypeMapping,
                                    [jiraIssueType]: e.target.value
                                  })}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                  {taskTypes.map(type => (
                                    <option key={type.Id} value={type.TypeName || type.StatusName || ''}>
                                      {type.TypeName || type.StatusName}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Priority Mapping Section */}
                  {jiraIssues.length > 0 && taskPriorities.length > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                      <button
                        onClick={() => setIsJiraPriorityMappingOpen(!isJiraPriorityMappingOpen)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <h3 className="font-semibold text-amber-900 dark:text-amber-300">⚡ Priority Mapping</h3>
                        <span className="text-amber-700 dark:text-amber-400 text-sm">{isJiraPriorityMappingOpen ? '▲ Collapse' : '▼ Expand'}</span>
                      </button>
                      {isJiraPriorityMappingOpen && (
                        <>
                          <p className="text-sm text-amber-800 dark:text-amber-400 mt-3 mb-3">
                            Map Jira priorities to your project's task priorities:
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Array.from(new Set(jiraIssues.map(i => i.priority).filter(Boolean))).map(jiraPriority => (
                              <div key={jiraPriority} className="bg-white dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  {jiraPriority}
                                </label>
                                <select
                                  value={priorityMapping[jiraPriority] || ''}
                                  onChange={(e) => setPriorityMapping({
                                    ...priorityMapping,
                                    [jiraPriority]: e.target.value
                                  })}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                  {taskPriorities.map(priority => (
                                    <option key={priority.Id} value={priority.PriorityName || priority.StatusName || ''}>
                                      {priority.PriorityName || priority.StatusName}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Assignee Mapping Section */}
                  {jiraIssues.length > 0 && jiraImportUsers.length > 0 && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                      <button
                        onClick={() => setIsJiraAssigneeMappingOpen(!isJiraAssigneeMappingOpen)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <h3 className="font-semibold text-emerald-900 dark:text-emerald-300">👤 Jira User Mapping</h3>
                        <span className="text-emerald-700 dark:text-emerald-400 text-sm">{isJiraAssigneeMappingOpen ? '▲ Collapse' : '▼ Expand'}</span>
                      </button>
                      {isJiraAssigneeMappingOpen && (
                        <>
                          <p className="text-sm text-emerald-800 dark:text-emerald-400 mt-3 mb-3">
                            Map Jira assignees to users in this organization:
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Array.from(new Set(jiraIssues.map(i => String(i.assignee || '').trim()).filter(Boolean))).map(jiraAssignee => (
                              <div key={jiraAssignee} className="bg-white dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700">
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  {jiraAssignee}
                                </label>
                                <select
                                  value={jiraBoardAssigneeMapping[jiraAssignee] || ''}
                                  onChange={(e) => {
                                    const value = e.target.value ? Number(e.target.value) : '';
                                    setJiraBoardAssigneeMapping((prev) => ({
                                      ...prev,
                                      [jiraAssignee]: value,
                                    }));
                                  }}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                  <option value="">Unassigned</option>
                                  {jiraImportUsers.map((userOption) => {
                                    const label = userOption.FirstName && userOption.LastName
                                      ? `${userOption.FirstName} ${userOption.LastName} (${userOption.Username})`
                                      : userOption.Username;
                                    return <option key={userOption.Id} value={userOption.Id}>{label}</option>;
                                  })}
                                </select>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
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

                      {/* Assignee filter */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Assignee</label>
                        <select
                          value={jiraFilters.assignee}
                          onChange={(e) => setJiraFilters({ ...jiraFilters, assignee: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="">All Assignees</option>
                          {Array.from(new Set(jiraIssues.map(i => String(i.assignee || '').trim()).filter(Boolean))).map(assignee => (
                            <option key={assignee} value={assignee}>{assignee}</option>
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
                        {(jiraFilters.search || jiraFilters.status || jiraFilters.issueType || jiraFilters.priority || jiraFilters.assignee || jiraFilters.showParentsOnly || jiraFilters.showSubtasksOnly || showAlreadyImported) && (
                          <button
                            onClick={() => {
                              setJiraFilters({
                                search: '',
                                status: '',
                                issueType: '',
                                priority: '',
                                assignee: '',
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
                                assignee: '',
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
                                  <span className="text-xs px-2 py-0.5 rounded" style={pillStyle(issue.statusColor || '#6b7280', { alpha: '20' })}>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
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
              {(() => {
                const githubApps = (project?.Applications || []).filter(
                  (app: { RepositoryUrl?: string | null; GitHubIntegrationId?: number | null }) =>
                    Boolean(app.RepositoryUrl) &&
                    (Boolean(app.GitHubIntegrationId) || /github/i.test(String(app.RepositoryUrl)))
                );
                if (githubApps.length === 0) return null;
                return (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Application
                    </label>
                    <select
                      value={gitHubImportApplicationId || ''}
                      onChange={(e) => {
                        const nextId = e.target.value ? Number(e.target.value) : 0;
                        setGitHubImportApplicationId(nextId);
                        if (nextId) void loadGitHubIssues(nextId);
                      }}
                      className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Select application...</option>
                      {githubApps.map((app: { Id: number; Name: string; RepositoryUrl?: string | null }) => (
                        <option key={app.Id} value={app.Id}>
                          {app.Name}
                          {app.RepositoryUrl ? ` — ${app.RepositoryUrl}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
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
              {(() => {
                const giteaApps = (project?.Applications || []).filter(
                  (app: { RepositoryUrl?: string | null; GiteaIntegrationId?: number | null }) =>
                    Boolean(app.RepositoryUrl) &&
                    (Boolean(app.GiteaIntegrationId) || /gitea/i.test(String(app.RepositoryUrl)))
                );
                if (giteaApps.length === 0) return null;
                return (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Application
                    </label>
                    <select
                      value={giteaImportApplicationId || ''}
                      onChange={(e) => {
                        const nextId = e.target.value ? Number(e.target.value) : 0;
                        setGiteaImportApplicationId(nextId);
                        if (nextId) void loadGiteaIssues(nextId);
                      }}
                      className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Select application...</option>
                      {giteaApps.map((app: { Id: number; Name: string; RepositoryUrl?: string | null }) => (
                        <option key={app.Id} value={app.Id}>
                          {app.Name}
                          {app.RepositoryUrl ? ` — ${app.RepositoryUrl}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

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

      <ConfirmAlertModal
        isOpen={!!modalMessage}
        type={modalMessage?.type || 'confirm'}
        title={modalMessage?.title || ''}
        message={modalMessage?.message || ''}
        onClose={closeConfirmModal}
        onConfirm={handleModalConfirm}
        confirmLabel="Delete"
        alertLabel="OK"
        confirmVariant="danger"
      />

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Import Tasks from CSV</h2>
              
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">📄 CSV Format</h3>
                <p className="text-sm text-blue-800 dark:text-blue-400 mb-2">
                  Your CSV should have the following columns (header required):
                </p>
                <code className="text-xs bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded block overflow-x-auto">
                  TaskName,Description,Status,Priority,AssignedToUsername,DueDate,EstimatedHours,ParentTaskName,PlannedStartDate,PlannedEndDate,DependsOnTaskName
                </code>
                <p className="text-xs text-blue-800 dark:text-blue-400 mt-2">
                  ProjectId is added automatically from the current project.
                </p>
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
                      <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Task Name</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Assigned To</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Type (CSV)</th>
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
                            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.TaskType || '-'}</td>
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

              {/* Task Type Mapping */}
              {importAvailTaskTypes.length > 0 && (
                <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">🏷️ Task Type</h3>
                  {csvUniqueTaskTypes.length > 0 ? (
                    <>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        Map each task type from your CSV to an existing type. Unmapped values will use the default below.
                      </p>
                      <div className="space-y-2 mb-3">
                        {csvUniqueTaskTypes.map(csvVal => (
                          <div key={csvVal} className="flex items-center gap-3">
                            <span className="w-40 text-sm font-medium text-gray-700 dark:text-gray-300 truncate" title={csvVal}>
                              <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs">{csvVal}</span>
                            </span>
                            <span className="text-gray-400">→</span>
                            <select
                              value={importTaskTypeMapping[csvVal] || ''}
                              onChange={e => setImportTaskTypeMapping(prev => ({ ...prev, [csvVal]: e.target.value }))}
                              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                              <option value="">— use default below —</option>
                              {importAvailTaskTypes.map(t => (
                                <option key={t.Id} value={String(t.Id)}>
                                  {t.TypeName || t.StatusName}
                                </option>
                              ))}
                            </select>
                            {importTaskTypeMapping[csvVal] ? (
                              <span className="text-green-500 text-sm">✓</span>
                            ) : (
                              <span className="text-gray-400 text-sm">○</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      No <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">TaskType</code> column found in CSV. You can set a default type to apply to all imported tasks.
                    </p>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {csvUniqueTaskTypes.length > 0 ? 'Default (for unmapped):' : 'Apply to all tasks:'}
                    </span>
                    <select
                      value={importDefaultTaskType}
                      onChange={e => setImportDefaultTaskType(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">— leave blank —</option>
                      {importAvailTaskTypes.map(t => (
                        <option key={t.Id} value={String(t.Id)}>
                          {t.TypeName || t.StatusName}
                        </option>
                      ))}
                    </select>
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

      {/* Jira Ticket Selection Modal */}
      {showJiraTicketsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="text-2xl">🎫</span>
                  Import from Jira Ticket
                </h2>
                <button
                  onClick={() => {
                    setShowJiraTicketsModal(false);
                    setSelectedJiraTickets(new Set());
                    setJiraTicketsError('');
                    setJiraSearchQuery('');
                    setJiraTicketStatusMapping({});
                    setJiraTicketMappings({});
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                <p className="text-sm text-purple-800 dark:text-purple-400">
                  Select one or more Jira tickets and import directly as tasks.
                </p>
              </div>

              {!jiraTicketsLoading && jiraTickets.length > 0 && (
                <>
                  <div className="mb-3">
                    <JiraStatusMappingPanel
                      jiraStatuses={Array.from(new Set(jiraTickets.map((ticket) => ticket.status).filter(Boolean)))}
                      taskStatuses={taskStatuses}
                      mapping={jiraTicketStatusMapping}
                      onChange={setJiraTicketStatusMapping}
                    />
                  </div>

                  <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                  <button
                    onClick={() => setIsJiraTicketMappingOpen(!isJiraTicketMappingOpen)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <h3 className="font-semibold text-indigo-900 dark:text-indigo-300">🧩 Mapping (Issue Type & Priority)</h3>
                    <span className="text-indigo-700 dark:text-indigo-400 text-sm">{isJiraTicketMappingOpen ? '▲ Collapse' : '▼ Expand'}</span>
                  </button>

                  {isJiraTicketMappingOpen && (
                    <div className="mt-4 space-y-4">
                      {jiraTicketIssueTypes.length > 0 && (
                        <div>
                          <p className="text-xs text-indigo-800 dark:text-indigo-400 mb-2">Issue Type → Task Type</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {jiraTicketIssueTypes.map((issueType) => (
                              <div key={issueType} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2">
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{issueType}</label>
                                <select
                                  value={jiraTicketTypeMapping[issueType] || ''}
                                  onChange={(e) => setJiraTicketTypeMapping(prev => ({ ...prev, [issueType]: e.target.value }))}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                  <option value="">Auto map</option>
                                  {taskTypes.map(type => (
                                    <option key={type.Id} value={type.TypeName || type.StatusName || ''}>
                                      {type.TypeName || type.StatusName}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {jiraTicketPriorities.length > 0 && (
                        <div>
                          <p className="text-xs text-indigo-800 dark:text-indigo-400 mb-2">Jira Priority → Task Priority</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {jiraTicketPriorities.map((priority) => (
                              <div key={priority} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2">
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{priority}</label>
                                <select
                                  value={jiraTicketPriorityMapping[priority] || ''}
                                  onChange={(e) => setJiraTicketPriorityMapping(prev => ({ ...prev, [priority]: e.target.value }))}
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                  <option value="">Auto map</option>
                                  {taskPriorities.map(taskPriority => (
                                    <option key={taskPriority.Id} value={taskPriority.PriorityName || taskPriority.StatusName || ''}>
                                      {taskPriority.PriorityName || taskPriority.StatusName}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                </>
              )}

              {/* Search */}
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search Jira tickets..."
                    value={jiraSearchQuery}
                    onChange={(e) => setJiraSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        loadJiraTickets(
                          jiraSearchQuery,
                          shouldIgnoreConfiguredJqlForJiraTickets(jiraSearchQuery)
                        );
                      }
                    }}
                    disabled={jiraTicketsLoading}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                  />
                  <button
                    onClick={() => loadJiraTickets(
                      jiraSearchQuery,
                      shouldIgnoreConfiguredJqlForJiraTickets(jiraSearchQuery)
                    )}
                    disabled={jiraTicketsLoading}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg transition-colors font-medium"
                  >
                    {jiraTicketsLoading ? 'Searching...' : 'Search'}
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideIntegratedJiraTickets}
                      onChange={(e) => {
                        setHideIntegratedJiraTickets(e.target.checked);
                        setSelectedJiraTickets(new Set());
                      }}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Hide already integrated tickets</span>
                  </label>
                  {!jiraTicketsLoading && visibleJiraTickets.length > 0 && (
                    <button
                      onClick={() => {
                        const newIssueKeys = visibleJiraTickets
                          .filter((ticket) => {
                            if (!existingIssueIds.has(ticket.key)) return true;
                            return getExistingJiraStatusUpdate(ticket.key, ticket.status).hasStatusChange;
                          })
                          .map(ticket => ticket.key);

                        if (newIssueKeys.every(key => selectedJiraTickets.has(key))) {
                          const updated = new Set(selectedJiraTickets);
                          newIssueKeys.forEach(key => updated.delete(key));
                          setSelectedJiraTickets(updated);
                        } else {
                          setSelectedJiraTickets(new Set(newIssueKeys));
                        }
                      }}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {visibleJiraTickets
                        .filter((ticket) => !existingIssueIds.has(ticket.key) || getExistingJiraStatusUpdate(ticket.key, ticket.status).hasStatusChange)
                        .every((ticket) => selectedJiraTickets.has(ticket.key))
                          ? 'Deselect All Actionable'
                          : 'Select All Actionable'}
                    </button>
                  )}
                  {existingIssueIds.size > 0 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {jiraTickets.filter(ticket => existingIssueIds.has(ticket.key)).length} already integrated in this project
                    </span>
                  )}
                </div>
              </div>

              {/* Loading State */}
              {jiraTicketsLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                </div>
              )}

              {/* Error State */}
              {jiraTicketsError && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
                  {jiraTicketsError}
                </div>
              )}

              {/* Tickets List */}
              {!jiraTicketsLoading && !jiraTicketsError && visibleJiraTickets.length > 0 && (
                <div className="space-y-2 mb-4 max-h-[400px] overflow-y-auto">
                  {visibleJiraTickets.map((ticket) => (
                    (() => {
                      const existingStatus = getExistingJiraStatusUpdate(ticket.key, ticket.status);
                      const isExisting = existingStatus.isExisting;
                      const canUpdateStatus = existingStatus.hasStatusChange;
                      const disableSelection = isExisting && !canUpdateStatus;
                      return (
                    <div
                      key={ticket.key}
                      className={`block p-4 border rounded-lg cursor-pointer transition-all ${
                        selectedJiraTickets.has(ticket.key)
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedJiraTickets.has(ticket.key)}
                          disabled={disableSelection}
                          onChange={() => {
                            if (disableSelection) return;
                            const updated = new Set(selectedJiraTickets);
                            if (updated.has(ticket.key)) {
                              updated.delete(ticket.key);
                            } else {
                              updated.add(ticket.key);
                            }
                            setSelectedJiraTickets(updated);
                          }}
                          className="mt-1 w-4 h-4 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-purple-600 dark:text-purple-400">
                              {ticket.key}
                            </span>
                            {isExisting && (
                              <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                                Already integrated
                              </span>
                            )}
                            {ticket.status && (
                              <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
                                {ticket.status}
                              </span>
                            )}
                            {ticket.priority && (
                              <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded">
                                {ticket.priority}
                              </span>
                            )}
                          </div>
                          <div className="text-gray-900 dark:text-white font-medium mb-1">
                            {ticket.summary}
                          </div>
                          {ticket.description && (
                            <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                              {typeof ticket.description === 'string' ? ticket.description : 'Description available in Jira'}
                            </div>
                          )}

                          {isExisting && canUpdateStatus && (
                            <div className="mt-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
                              Jira status: <span className="font-semibold">{ticket.status || '—'}</span> · Current task status: <span className="font-semibold">{existingJiraIssueStatusByKey[ticket.key]?.statusName || '—'}</span> · Will update to: <span className="font-semibold">{existingStatus.mappedStatusName || ticket.status || '—'}</span>
                            </div>
                          )}

                          {!isExisting && (
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Customer</label>
                                <div className="mb-1 text-[11px] text-gray-500 dark:text-gray-400">
                                  Jira Organizations: {Array.isArray(ticket.organizations) && ticket.organizations.length > 0 ? ticket.organizations.join(', ') : '—'}
                                </div>
                                <SearchableSelect
                                  value={jiraTicketMappings[ticket.key]?.customerId}
                                  onChange={(value) => {
                                    setJiraTicketMappings((prev) => ({
                                      ...prev,
                                      [ticket.key]: {
                                        ...prev[ticket.key],
                                        customerId: value,
                                      },
                                    }));
                                  }}
                                  options={[
                                    ...(Array.isArray(ticket.organizations) && ticket.organizations.length > 0
                                      ? ticket.organizations.map((orgName: string, idx: number) => ({
                                          id: -(idx + 1),
                                          label: `➕ Create: ${orgName}`,
                                        }))
                                      : []),
                                    ...jiraImportCustomers.map((customer) => ({
                                      id: customer.Id,
                                      label: customer.ExternalName?.trim() || customer.Name,
                                    })),
                                  ]}
                                  placeholder="Select customer..."
                                  emptyMessage="No customers available"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Assignee</label>
                                <div className="mb-1 text-[11px] text-gray-500 dark:text-gray-400">
                                  {ticket.developer || ticket.developerEmail
                                    ? `Jira Developer: ${ticket.developer || ticket.developerEmail}${ticket.developer && ticket.developerEmail ? ` (${ticket.developerEmail})` : ''}`
                                    : `Jira Assignee: ${ticket.assignee || ticket.assigneeEmail || 'Unassigned'}${ticket.assignee && ticket.assigneeEmail ? ` (${ticket.assigneeEmail})` : ''}`}
                                </div>
                                <SearchableSelect
                                  value={jiraTicketMappings[ticket.key]?.assigneeId}
                                  onChange={(value) => {
                                    setJiraTicketMappings((prev) => ({
                                      ...prev,
                                      [ticket.key]: {
                                        ...prev[ticket.key],
                                        assigneeId: value,
                                      },
                                    }));
                                  }}
                                  options={jiraImportUsers.map((u) => ({
                                    id: u.Id,
                                    label: `${u.Username}${u.FirstName && u.LastName ? ` (${u.FirstName} ${u.LastName})` : ''}`,
                                  }))}
                                  placeholder="Select assignee..."
                                  emptyMessage="No users available"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                      );
                    })()
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!jiraTicketsLoading && !jiraTicketsError && visibleJiraTickets.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No Jira tickets found. Try adjusting your search or filters.
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowJiraTicketsModal(false);
                    setSelectedJiraTickets(new Set());
                    setJiraTicketsError('');
                    setJiraSearchQuery('');
                    setJiraTicketStatusMapping({});
                    setJiraTicketMappings({});
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportJiraTickets}
                  disabled={jiraTicketsImporting || Array.from(selectedJiraTickets).filter((key) => {
                    if (!existingIssueIds.has(key)) return true;
                    const issue = jiraTickets.find((ticket) => ticket.key === key);
                    if (!issue) return false;
                    return getExistingJiraStatusUpdate(issue.key, issue.status).hasStatusChange;
                  }).length === 0}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {jiraTicketsImporting
                    ? 'Importing...'
                    : `Import / Update Selected (${Array.from(selectedJiraTickets).filter((key) => {
                        if (!existingIssueIds.has(key)) return true;
                        const issue = jiraTickets.find((ticket) => ticket.key === key);
                        if (!issue) return false;
                        return getExistingJiraStatusUpdate(issue.key, issue.status).hasStatusChange;
                      }).length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Outlook Email Queue Import Modal */}
      {showOutlookQueueModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="text-2xl">📧</span>
                  Import from Outlook Queue
                </h2>
                <button
                  onClick={() => {
                    setShowOutlookQueueModal(false);
                    setSelectedOutlookQueueIds(new Set());
                    setOutlookQueueError('');
                    setOutlookQueueMappings({});
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-400">
                  Select queued emails sent from your Outlook address to the queue configured in Cloudflare and import them as tasks in this project.
                </p>
              </div>

              {outlookQueueError && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                  {outlookQueueError}
                </div>
              )}

              {outlookQueueLoading && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading queue...</div>
              )}

              {!outlookQueueLoading && outlookQueueItems.length > 0 && (
                <div className="space-y-3">
                  {outlookQueueItems.map((item) => {
                    const isSelected = selectedOutlookQueueIds.has(item.Id);
                    const preview = (item.BodyText || item.BodyHtml || '')
                      .replace(/<[^>]+>/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim()
                      .slice(0, 180);

                    return (
                      <div
                        key={item.Id}
                        className={`border rounded-lg p-4 transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              setSelectedOutlookQueueIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(item.Id);
                                else next.delete(item.Id);
                                return next;
                              });
                            }}
                            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                  {item.Subject?.trim() || 'Email task'}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {item.FromEmail} · {new Date(item.ReceivedAt).toLocaleString()}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDismissOutlookQueueItem(item.Id)}
                                className="text-xs text-red-600 dark:text-red-400 hover:underline whitespace-nowrap"
                              >
                                Dismiss
                              </button>
                            </div>
                            {preview && (
                              <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{preview}{preview.length >= 180 ? '…' : ''}</p>
                            )}
                            {isSelected && (
                              <div className="mt-3">
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Assignee</label>
                                <SearchableSelect
                                  value={outlookQueueMappings[item.Id]?.assigneeId ?? user?.id}
                                  onChange={(value) => {
                                    setOutlookQueueMappings((prev) => ({
                                      ...prev,
                                      [item.Id]: {
                                        ...prev[item.Id],
                                        assigneeId: value,
                                      },
                                    }));
                                  }}
                                  options={taskEditorUsers.map((u) => ({
                                    id: u.Id,
                                    label: `${u.Username}${u.FirstName && u.LastName ? ` (${u.FirstName} ${u.LastName})` : ''}`,
                                  }))}
                                  placeholder="Select assignee..."
                                  emptyMessage="No users available"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!outlookQueueLoading && !outlookQueueError && outlookQueueItems.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No queued emails found. Send an email from your Outlook address to the configured queue address.
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowOutlookQueueModal(false);
                    setSelectedOutlookQueueIds(new Set());
                    setOutlookQueueError('');
                    setOutlookQueueMappings({});
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportOutlookQueue}
                  disabled={outlookQueueImporting || selectedOutlookQueueIds.size === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {outlookQueueImporting
                    ? 'Importing...'
                    : `Import Selected (${selectedOutlookQueueIds.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Check Jira Ticket Status Modal */}
      {showJiraCheckStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="text-2xl">🔍</span>
                  {jiraCheckStatusMode === 'board' ? 'Check Jira Board Status' : 'Check Jira Ticket Status'}
                </h2>
                <button
                  onClick={() => {
                    setShowJiraCheckStatusModal(false);
                    setJiraCheckStatusTickets([]);
                    setJiraCheckStatusError('');
                    setSelectedCheckStatusKeys(new Set());
                    setJiraCheckStatusOverrides({});
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {jiraCheckStatusError && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                  {jiraCheckStatusError}
                </div>
              )}

              {jiraCheckStatusLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-gray-500 dark:text-gray-400">
                    {jiraCheckStatusMode === 'board' ? 'Loading board statuses from Jira...' : 'Loading ticket statuses from Jira...'}
                  </div>
                </div>
              ) : jiraCheckStatusTickets.length === 0 && !jiraCheckStatusError ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  {jiraCheckStatusMode === 'board'
                    ? 'No board-linked Jira issues found for this project.'
                    : 'No integrated Jira tickets found for this project.'}
                </div>
              ) : (
                <>
                  {/* Status Mapping Panel */}
                  {jiraCheckStatusTickets.length > 0 && (
                    <div className="mb-4">
                      <JiraStatusMappingPanel
                        jiraStatuses={Array.from(new Set(jiraCheckStatusTickets.map(t => t.jiraStatus).filter(Boolean)))}
                        taskStatuses={taskStatuses}
                        mapping={jiraCheckStatusMapping}
                        onChange={setJiraCheckStatusMapping}
                        defaultExpanded
                      />
                    </div>
                  )}

                  {/* Filter toggle */}
                  <div className="mb-3 flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={checkStatusOnlyChanged}
                        onChange={(e) => setCheckStatusOnlyChanged(e.target.checked)}
                        className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                      />
                      Show only tickets with status changes
                    </label>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {jiraCheckStatusTickets.filter(t => hasCheckStatusChange(t, jiraCheckStatusMapping, jiraCheckStatusOverrides)).length} ticket(s) with changes
                    </span>
                  </div>

                  {/* Ticket list */}
                  <div className="space-y-2 mb-4">
                    {jiraCheckStatusTickets
                      .filter(t => {
                        if (!checkStatusOnlyChanged) return true;
                        return hasCheckStatusChange(t, jiraCheckStatusMapping, jiraCheckStatusOverrides);
                      })
                      .map(t => {
                        const mapped = resolveCheckStatusTarget(t.issueKey, t.jiraStatus, jiraCheckStatusMapping, jiraCheckStatusOverrides);
                        const hasChange = hasCheckStatusChange(t, jiraCheckStatusMapping, jiraCheckStatusOverrides);
                        const isSelected = selectedCheckStatusKeys.has(t.issueKey);
                        return (
                          <div
                            key={t.issueKey}
                            className={`flex items-start gap-3 p-3 rounded-lg border ${
                              hasChange
                                ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10'
                                : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!hasChange}
                              onChange={() => {
                                const updated = new Set(selectedCheckStatusKeys);
                                if (updated.has(t.issueKey)) updated.delete(t.issueKey);
                                else updated.add(t.issueKey);
                                setSelectedCheckStatusKeys(updated);
                              }}
                              className="mt-1 w-4 h-4 text-amber-600 focus:ring-amber-500 disabled:opacity-40"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-purple-600 dark:text-purple-400 text-sm">{t.issueKey}</span>
                                <span className="text-sm text-gray-900 dark:text-white truncate">{t.taskName}</span>
                              </div>
                              <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 truncate">{t.jiraSummary}</div>
                              <div className="mt-1.5 flex items-center gap-1.5 text-xs flex-wrap">
                                <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                  Jira: {t.jiraStatus || '—'}
                                </span>
                                <span className="text-gray-400">→</span>
                                <span className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                  Task: {t.taskStatusName || '—'}
                                </span>
                                {hasChange && mapped && (
                                  <>
                                    <span className="text-amber-500">→</span>
                                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                                      Will update to: {mapped.name}
                                    </span>
                                  </>
                                )}
                                {!hasChange && (
                                  <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">✓ In sync</span>
                                )}
                              </div>

                              <div className="mt-2 max-w-xs">
                                <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Target status (override)</label>
                                <select
                                  value={jiraCheckStatusOverrides[t.issueKey] || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setJiraCheckStatusOverrides((prev) => ({
                                      ...prev,
                                      [t.issueKey]: value,
                                    }));
                                  }}
                                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                  <option value="">Use mapping/default</option>
                                  {taskStatuses.map((statusValue) => (
                                    <option key={statusValue.Id} value={statusValue.StatusName || ''}>
                                      {statusValue.StatusName}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const allChangedKeys = new Set<string>(jiraCheckStatusTickets
                            .filter(t => hasCheckStatusChange(t, jiraCheckStatusMapping, jiraCheckStatusOverrides))
                            .map(t => t.issueKey));
                          setSelectedCheckStatusKeys(allChangedKeys);
                        }}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Select all
                      </button>
                      <span className="text-gray-400">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedCheckStatusKeys(new Set())}
                        className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
                      >
                        Deselect all
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setShowJiraCheckStatusModal(false);
                          setJiraCheckStatusTickets([]);
                          setSelectedCheckStatusKeys(new Set());
                          setJiraCheckStatusOverrides({});
                        }}
                        className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                      >
                        Close
                      </button>
                      <button
                        onClick={handleApplyCheckJiraStatus}
                        disabled={isApplyingCheckStatus || selectedCheckStatusKeys.size === 0}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                      >
                        {isApplyingCheckStatus ? 'Updating...' : `Update ${selectedCheckStatusKeys.size} ticket(s)`}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ScrollToTopButton />
    </div>
    </CustomerUserGuard>
  );
}

