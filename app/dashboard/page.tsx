'use client';

import { getApiUrl } from '@/lib/api/config';
import { formatTicketCreatorLabel, formatTicketRef } from '@/lib/customerPortal';

import { useState, useEffect, useMemo, Suspense, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useToast } from '@/contexts/ToastContext';
import { usersApi, User } from '@/lib/api/users';
import { tasksApi, Task } from '@/lib/api/tasks';
import { projectsApi, Project } from '@/lib/api/projects';
import { organizationsApi } from '@/lib/api/organizations';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import {
  DashboardKpiDetailItem,
  DashboardKpiDetailResult,
  DashboardKpiMetadata,
  DashboardKpiMetricValue,
  DashboardKpiType,
  DashboardKpiWidget,
  getDashboardKpis,
  getDashboardKpiValues,
  saveDashboardKpis,
} from '@/lib/api/dashboardKpis';
import PageTabs from '@/components/PageTabs';
import PageStickyChrome from '@/components/PageStickyChrome';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import EmptyState from '@/components/EmptyState';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import TaskDetailModal from '@/components/TaskDetailModal';
import { TaskAnalyticsCharts } from '@/components/reporting/TaskAnalyticsCharts';
import type { TaskAnalyticsData } from '@/lib/reporting/taskAnalytics';
import SegmentedTagBadge from '@/components/tags/SegmentedTagBadge';
import InstallAppPrompt from '@/components/InstallAppPrompt';
import { useColorVision } from '@/hooks/useColorVision';
import SearchableSelect from '@/components/SearchableSelect';
import {
  filterVisibleStatuses,
  getHiddenStatusIdsForOrg,
  getHiddenStatusesByOrgFromCookie,
  getKanbanOrgFilterFromCookie,
  setHiddenStatusesByOrgCookie,
  setKanbanOrgFilterCookie,
  withHiddenStatusToggled,
  type HiddenStatusesByOrg,
  type KanbanOrgFilter,
} from '@/lib/dashboardKanbanPrefs';
import dynamic from 'next/dynamic';
import CalendarTabComponent from './CalendarTab';
import { useFormatHours } from '@/lib/useFormatHours';
import { TaskTypeIconMark } from '@/lib/taskTypeIcons';
import { NAV_ICONS } from '@/lib/navIcons';
import {
  AlertTriangle,
  Ban,
  Calculator,
  Check,
  CheckCircle2,
  CircleDot,
  Clock,
  Flag,
  FolderKanban,
  ListTodo,
  ListTree,
  MapPin,
  Pencil,
  Pin,
  RefreshCw,
  Repeat2,
  Rocket,
  Search,
  Tag,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface TaskWithProject extends Task {
  ProjectName?: string;
  ProjectCustomerName?: string | null;
  IsHobby?: boolean;
  SubtaskCount?: number;
  StatusHideFromPlanningAndStatistics?: number | boolean;
  OrganizationId?: number;
  OrganizationName?: string;
}

type KanbanSprintFilter = 'all' | 'backlog' | number;

interface KanbanSprintOption {
  Id: number;
  Name: string;
  Status?: string;
}

function AssignedKanbanTab({
  tasks,
  userId,
  canManage,
  isLoading,
  token,
  onOpenTask,
  onTasksRefresh,
  onError,
}: {
  tasks: TaskWithProject[];
  userId: number;
  canManage: boolean;
  isLoading: boolean;
  token: string;
  onOpenTask: (task: Pick<Task, 'Id' | 'ProjectId'>) => void;
  onTasksRefresh: () => Promise<TaskWithProject[]>;
  onError: (message: string) => void;
}) {
  const { mapColor, pillStyle, borderLeftStyle } = useColorVision();
  const [draggedOverTask, setDraggedOverTask] = useState<number | null>(null);
  const [localTasks, setLocalTasks] = useState<TaskWithProject[]>([]);
  const [statusCatalogByOrganization, setStatusCatalogByOrganization] = useState<Record<number, StatusValue[]>>({});
  const [organizationNamesById, setOrganizationNamesById] = useState<Record<number, string>>({});
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [isDraggingTask, setIsDraggingTask] = useState(false);
  const [selectedOrganizationFilter, setSelectedOrganizationFilter] = useState<KanbanOrgFilter>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedSprintFilter, setSelectedSprintFilter] = useState<KanbanSprintFilter>('all');
  const [sprints, setSprints] = useState<KanbanSprintOption[]>([]);
  const [loadingSprints, setLoadingSprints] = useState(false);
  const [hiddenStatusesByOrg, setHiddenStatusesByOrg] = useState<HiddenStatusesByOrg>({});
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [statusConfigOrgId, setStatusConfigOrgId] = useState<number | null>(null);
  const prefsHydratedRef = useRef(false);

  const getTaskOrganizationId = (task: TaskWithProject): number => {
    const organizationId = Number((task as any).OrganizationId || 0);
    if (Number.isFinite(organizationId) && organizationId > 0) {
      return organizationId;
    }
    return 0;
  };

  const getTaskOrganizationName = (task: TaskWithProject): string => {
    const organizationName = String((task as any).OrganizationName || '').trim();
    if (organizationName.length > 0) {
      return organizationName;
    }

    const organizationId = getTaskOrganizationId(task);
    const mappedName = organizationId > 0 ? String(organizationNamesById[organizationId] || '').trim() : '';
    if (mappedName.length > 0) {
      return mappedName;
    }

    return 'Unknown Organization';
  };

  const assignedTasks = useMemo(() => {
    return tasks.filter((task) => {
      const isPrimaryAssignee = Number(task.AssignedTo || 0) === userId;
      const hasAssigneeMatch = Array.isArray(task.Assignees)
        ? task.Assignees.some((assignee) => Number(assignee.UserId) === userId)
        : false;
      return isPrimaryAssignee || hasAssigneeMatch;
    });
  }, [tasks, userId]);

  useEffect(() => {
    setLocalTasks(assignedTasks);
  }, [assignedTasks]);

  useEffect(() => {
    let cancelled = false;

    const loadStatusCatalog = async () => {
      const organizationIds = Array.from(
        new Set(
          assignedTasks
            .map((task) => Number((task as any).OrganizationId || 0))
            .filter((organizationId) => Number.isFinite(organizationId) && organizationId > 0)
        )
      );

      if (organizationIds.length === 0) {
        setStatusCatalogByOrganization({});
        return;
      }

      setLoadingStatuses(true);
      try {
        const statusResponses = await Promise.all(
          organizationIds.map(async (organizationId) => {
            try {
              const result = await statusValuesApi.getTaskStatuses(organizationId, token);
              return result.statuses || [];
            } catch {
              return [];
            }
          })
        );

        if (cancelled) return;

        const catalogByOrganization: Record<number, StatusValue[]> = {};
        organizationIds.forEach((organizationId, index) => {
          const statuses = statusResponses[index] || [];
          catalogByOrganization[organizationId] = [...statuses].sort((a, b) => {
            if (Number(a.SortOrder || 0) !== Number(b.SortOrder || 0)) {
              return Number(a.SortOrder || 0) - Number(b.SortOrder || 0);
            }
            if (Number(a.Id) !== Number(b.Id)) {
              return Number(a.Id) - Number(b.Id);
            }
            return String(a.StatusName || '').localeCompare(String(b.StatusName || ''));
          });
        });

        setStatusCatalogByOrganization(catalogByOrganization);
      } finally {
        if (!cancelled) {
          setLoadingStatuses(false);
        }
      }
    };

    loadStatusCatalog();

    return () => {
      cancelled = true;
    };
  }, [assignedTasks, token]);

  useEffect(() => {
    let cancelled = false;

    const loadOrganizationNames = async () => {
      const organizationIds = Array.from(
        new Set(
          assignedTasks
            .map((task) => Number((task as any).OrganizationId || 0))
            .filter((organizationId) => Number.isFinite(organizationId) && organizationId > 0)
        )
      );

      if (organizationIds.length === 0) {
        setOrganizationNamesById({});
        return;
      }

      try {
        const response = await organizationsApi.getAll(token);
        if (cancelled) return;

        const mapped: Record<number, string> = {};
        (response.organizations || []).forEach((organization) => {
          const organizationId = Number(organization.Id || 0);
          const organizationName = String(organization.Name || '').trim();
          if (organizationId > 0 && organizationName.length > 0) {
            mapped[organizationId] = organizationName;
          }
        });

        setOrganizationNamesById(mapped);
      } catch {
        if (!cancelled) {
          setOrganizationNamesById({});
        }
      }
    };

    loadOrganizationNames();

    return () => {
      cancelled = true;
    };
  }, [assignedTasks, token]);

  const inferredStatusesByOrganization = useMemo(() => {
    const byOrganization = new Map<number, Map<number, { Id: number; StatusName: string; ColorCode?: string; SortOrder: number }>>();

    assignedTasks.forEach((task) => {
      const organizationId = getTaskOrganizationId(task);
      const statusId = Number(task.Status || 0);
      if (!Number.isFinite(statusId) || statusId <= 0) {
        return;
      }

      if (!byOrganization.has(organizationId)) {
        byOrganization.set(organizationId, new Map());
      }

      const statusMap = byOrganization.get(organizationId)!;
      if (statusMap.has(statusId)) {
        return;
      }

      statusMap.set(statusId, {
        Id: statusId,
        StatusName: task.StatusName || `Status ${statusId}`,
        ColorCode: task.StatusColor,
        SortOrder: Number(task.StatusSortOrder || 0),
      });
    });

    const result: Record<number, { Id: number; StatusName: string; ColorCode?: string; SortOrder: number }[]> = {};

    Array.from(byOrganization.entries()).forEach(([organizationId, statusMap]) => {
      result[organizationId] = Array.from(statusMap.values()).sort((a, b) => {
        if (a.SortOrder !== b.SortOrder) return a.SortOrder - b.SortOrder;
        if (a.Id !== b.Id) return a.Id - b.Id;
        return String(a.StatusName).localeCompare(String(b.StatusName));
      });
    });

    return result;
  }, [assignedTasks]);

  useEffect(() => {
    if (prefsHydratedRef.current) return;
    prefsHydratedRef.current = true;
    setSelectedOrganizationFilter(getKanbanOrgFilterFromCookie());
    setHiddenStatusesByOrg(getHiddenStatusesByOrgFromCookie());
  }, []);

  const groupedTasksByOrganization = useMemo(() => {
    const grouped = new Map<number, { organizationId: number; organizationName: string; tasks: TaskWithProject[] }>();

    localTasks.forEach((task) => {
      const organizationId = getTaskOrganizationId(task);
      if (!grouped.has(organizationId)) {
        grouped.set(organizationId, {
          organizationId,
          organizationName: getTaskOrganizationName(task),
          tasks: [],
        });
      }

      grouped.get(organizationId)!.tasks.push(task);
    });

    return Array.from(grouped.values()).sort((a, b) => {
      if (a.organizationName !== b.organizationName) {
        return a.organizationName.localeCompare(b.organizationName);
      }
      return a.organizationId - b.organizationId;
    });
  }, [localTasks, organizationNamesById]);

  useEffect(() => {
    if (selectedOrganizationFilter === 'all') return;
    const stillExists = groupedTasksByOrganization.some(
      (group) => group.organizationId === selectedOrganizationFilter
    );
    if (!stillExists) {
      setSelectedOrganizationFilter('all');
      setKanbanOrgFilterCookie('all');
    }
  }, [groupedTasksByOrganization, selectedOrganizationFilter]);

  useEffect(() => {
    setSelectedProjectId(null);
    setSelectedSprintFilter('all');
    setSprints([]);
    setStatusPickerOpen(false);
  }, [selectedOrganizationFilter]);

  useEffect(() => {
    if (!selectedProjectId || !token) {
      setSprints([]);
      setSelectedSprintFilter('all');
      return;
    }

    setSelectedSprintFilter('all');
    let cancelled = false;

    const loadSprints = async () => {
      setLoadingSprints(true);
      try {
        const response = await fetch(`${getApiUrl()}/api/sprints/project/${selectedProjectId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
        const data = await response.json();
        if (cancelled) return;
        setSprints(Array.isArray(data.sprints) ? data.sprints : []);
      } catch {
        if (!cancelled) setSprints([]);
      } finally {
        if (!cancelled) setLoadingSprints(false);
      }
    };

    void loadSprints();

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, token]);

  const visibleOrganizationGroups = useMemo(() => {
    if (selectedOrganizationFilter === 'all') return groupedTasksByOrganization;
    return groupedTasksByOrganization.filter(
      (group) => group.organizationId === selectedOrganizationFilter
    );
  }, [groupedTasksByOrganization, selectedOrganizationFilter]);

  const statusPickerOrganizationId = useMemo(() => {
    if (selectedOrganizationFilter !== 'all') return selectedOrganizationFilter;
    if (
      statusConfigOrgId &&
      visibleOrganizationGroups.some((group) => group.organizationId === statusConfigOrgId)
    ) {
      return statusConfigOrgId;
    }
    return visibleOrganizationGroups[0]?.organizationId ?? null;
  }, [selectedOrganizationFilter, statusConfigOrgId, visibleOrganizationGroups]);

  const projectsInFilterScope = useMemo(() => {
    const byProject = new Map<number, string>();
    localTasks.forEach((task) => {
      const organizationId = getTaskOrganizationId(task);
      if (
        selectedOrganizationFilter !== 'all' &&
        organizationId !== selectedOrganizationFilter
      ) {
        return;
      }
      const projectId = Number(task.ProjectId || 0);
      if (!Number.isFinite(projectId) || projectId <= 0) return;
      byProject.set(projectId, task.ProjectName || `Project #${projectId}`);
    });

    return Array.from(byProject.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [localTasks, selectedOrganizationFilter]);

  const taskMatchesKanbanFilters = (task: TaskWithProject, organizationId: number) => {
    if (getTaskOrganizationId(task) !== organizationId) return false;
    if (
      selectedOrganizationFilter !== 'all' &&
      organizationId !== selectedOrganizationFilter
    ) {
      return false;
    }
    if (selectedProjectId && Number(task.ProjectId) !== selectedProjectId) return false;
    if (selectedSprintFilter === 'all') return true;
    const sprintId = task.SprintId == null ? null : Number(task.SprintId);
    if (selectedSprintFilter === 'backlog') return sprintId == null || sprintId <= 0;
    return sprintId === selectedSprintFilter;
  };

  const filteredTaskCountForOrg = (organizationId: number) =>
    localTasks.filter((task) => taskMatchesKanbanFilters(task, organizationId)).length;

  const filteredAssignedCount = useMemo(
    () =>
      localTasks.filter((task) =>
        visibleOrganizationGroups.some((group) =>
          taskMatchesKanbanFilters(task, group.organizationId)
        )
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helpers close over filter state
    [
      localTasks,
      visibleOrganizationGroups,
      selectedOrganizationFilter,
      selectedProjectId,
      selectedSprintFilter,
    ]
  );

  const getStatusesForOrganization = (organizationId: number) => {
    const catalog = statusCatalogByOrganization[organizationId];
    if (catalog && catalog.length > 0) {
      return catalog.map((status) => ({
        Id: Number(status.Id),
        StatusName: status.StatusName,
        ColorCode: status.ColorCode,
        SortOrder: Number(status.SortOrder || 0),
      }));
    }

    return inferredStatusesByOrganization[organizationId] || [];
  };

  const getVisibleStatusesForOrganization = (organizationId: number) => {
    const statuses = getStatusesForOrganization(organizationId);
    return filterVisibleStatuses(
      statuses,
      getHiddenStatusIdsForOrg(hiddenStatusesByOrg, organizationId)
    );
  };

  const updateOrganizationFilter = (next: KanbanOrgFilter) => {
    setSelectedOrganizationFilter(next);
    setKanbanOrgFilterCookie(next);
  };

  const toggleStatusVisibility = (organizationId: number, statusId: number, visible: boolean) => {
    setHiddenStatusesByOrg((prev) => {
      const next = withHiddenStatusToggled(prev, organizationId, statusId, !visible);
      setHiddenStatusesByOrgCookie(next);
      return next;
    });
  };

  const getTasksByStatus = (organizationId: number, statusId: number) => {
    return localTasks
      .filter(
        (task) =>
          taskMatchesKanbanFilters(task, organizationId) && Number(task.Status) === statusId
      )
      .sort((a, b) => Number(a.DisplayOrder || 0) - Number(b.DisplayOrder || 0));
  };

  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    if (!canManage) return;
    e.dataTransfer.setData('taskId', taskId.toString());
    e.dataTransfer.effectAllowed = 'move';
    setIsDraggingTask(true);
  };

  const handleDragEnd = () => {
    setIsDraggingTask(false);
    setDraggedOverTask(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canManage) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragOverTask = (e: React.DragEvent, taskId: number) => {
    if (!canManage) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverTask(taskId);
  };

  const handleDragLeave = () => {
    setDraggedOverTask(null);
  };

  const handleDropOnTask = async (e: React.DragEvent, targetTask: TaskWithProject) => {
    if (!canManage) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggedOverTask(null);

    const sourceTaskId = parseInt(e.dataTransfer.getData('taskId'));
    if (!sourceTaskId || sourceTaskId === targetTask.Id) return;

    const sourceTask = localTasks.find((task) => task.Id === sourceTaskId);
    if (!sourceTask) return;

    const sourceOrganizationId = getTaskOrganizationId(sourceTask);
    const targetOrganizationId = getTaskOrganizationId(targetTask);
    if (sourceOrganizationId !== targetOrganizationId) {
      return;
    }

    const newStatusId = Number(targetTask.Status || 0);
    if (!newStatusId) return;

    const columnTasks = localTasks
      .filter((task) => getTaskOrganizationId(task) === targetOrganizationId && Number(task.Status) === newStatusId && task.Id !== sourceTaskId)
      .sort((a, b) => Number(a.DisplayOrder || 0) - Number(b.DisplayOrder || 0));

    const targetIndex = columnTasks.findIndex((task) => task.Id === targetTask.Id);
    columnTasks.splice(targetIndex, 0, { ...sourceTask, Status: newStatusId });

    const updates = columnTasks.map((task, index) => ({
      taskId: task.Id,
      displayOrder: (index + 1) * 10,
      status: newStatusId,
    }));

    const previousTasks = localTasks;
    setLocalTasks((currentTasks) => {
      const otherTasks = currentTasks.filter((task) => task.Id !== sourceTaskId && Number(task.Status) !== newStatusId);
      const updatedColumn = columnTasks.map((task, index) => ({
        ...task,
        Status: newStatusId,
        DisplayOrder: (index + 1) * 10,
      }));
      return [...otherTasks, ...updatedColumn];
    });

    try {
      await tasksApi.reorderKanban(updates, token);
      await onTasksRefresh();
    } catch (err: any) {
      setLocalTasks(previousTasks);
      onError(err?.message || 'Failed to reorder tasks');
    }
  };

  const handleDropOnColumn = async (e: React.DragEvent, organizationId: number, newStatusId: number) => {
    if (!canManage) return;
    e.preventDefault();
    setDraggedOverTask(null);

    const sourceTaskId = parseInt(e.dataTransfer.getData('taskId'));
    const sourceTask = localTasks.find((task) => task.Id === sourceTaskId);
    if (!sourceTask) return;

    const sourceOrganizationId = getTaskOrganizationId(sourceTask);
    if (sourceOrganizationId !== organizationId) return;

    if (!sourceTask || Number(sourceTask.Status) === newStatusId) return;

    const targetColumnTasks = localTasks
      .filter((task) => getTaskOrganizationId(task) === organizationId && Number(task.Status) === newStatusId)
      .sort((a, b) => Number(a.DisplayOrder || 0) - Number(b.DisplayOrder || 0));

    const newDisplayOrder = (targetColumnTasks.length + 1) * 10;

    const previousTasks = localTasks;
    setLocalTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.Id === sourceTaskId
          ? { ...task, Status: newStatusId, DisplayOrder: newDisplayOrder }
          : task
      )
    );

    try {
      await tasksApi.reorderKanban([{ taskId: sourceTaskId, displayOrder: newDisplayOrder, status: newStatusId }], token);
      await onTasksRefresh();
    } catch (err: any) {
      setLocalTasks(previousTasks);
      onError(err?.message || 'Failed to move task');
    }
  };

  const getPriorityBorder = (task: TaskWithProject) => {
    return borderLeftStyle(task.PriorityColor) ?? { borderLeft: '4px solid #d1d5db' };
  };

  if (isLoading || loadingStatuses) {
    return <div className="text-center py-12 text-gray-600 dark:text-gray-400">Loading Kanban board...</div>;
  }

  if (assignedTasks.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
        <EmptyState
          title="No assigned tasks"
          message="You have no tasks assigned right now."
          icon={<ListTodo size={40} strokeWidth={1.5} className="text-[var(--pm-muted)] opacity-70" aria-hidden />}
        />
      </div>
    );
  }

  return (
    <div
      className={`h-[calc(100vh-200px)] min-h-[320px] md:min-h-[480px] flex flex-col gap-2 ${isDraggingTask ? 'select-none' : ''}`}
      onDragEnterCapture={(e) => {
        if (!canManage) return;
        e.preventDefault();
      }}
      onDragOverCapture={(e) => {
        if (!canManage) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDropCapture={(e) => {
        if (!canManage) return;
        e.preventDefault();
      }}
      onDragOver={(e) => {
        if (!canManage) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        if (!canManage) return;
        e.preventDefault();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1 sm:flex-none sm:min-w-[200px]">
          <label
            htmlFor="kanban-org-filter"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            Organization
          </label>
          <select
            id="kanban-org-filter"
            value={selectedOrganizationFilter === 'all' ? 'all' : String(selectedOrganizationFilter)}
            onChange={(e) => {
              const value = e.target.value;
              updateOrganizationFilter(value === 'all' ? 'all' : Number(value));
            }}
            className="w-full h-9 px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="all">All organizations</option>
            {groupedTasksByOrganization.map((group) => (
              <option key={`kanban-org-${group.organizationId}`} value={group.organizationId}>
                {group.organizationName} ({group.tasks.length})
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[180px] flex-1 sm:flex-none sm:min-w-[200px]">
          <label
            htmlFor="kanban-project-filter"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            Project
          </label>
          <select
            id="kanban-project-filter"
            value={selectedProjectId ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedProjectId(value ? Number(value) : null);
            }}
            className="w-full h-9 px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All projects</option>
            {projectsInFilterScope.map((project) => (
              <option key={`kanban-project-${project.id}`} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[180px] flex-1 sm:flex-none sm:min-w-[200px]">
          <label
            htmlFor="kanban-sprint-filter"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
          >
            Sprint
          </label>
          <select
            id="kanban-sprint-filter"
            value={
              selectedSprintFilter === 'all'
                ? 'all'
                : selectedSprintFilter === 'backlog'
                  ? 'backlog'
                  : String(selectedSprintFilter)
            }
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'all') setSelectedSprintFilter('all');
              else if (value === 'backlog') setSelectedSprintFilter('backlog');
              else setSelectedSprintFilter(Number(value));
            }}
            disabled={!selectedProjectId || loadingSprints}
            className="w-full h-9 px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-60"
          >
            <option value="all">All sprints</option>
            <option value="backlog">Backlog (no sprint)</option>
            {sprints.map((sprint) => (
              <option key={`kanban-sprint-${sprint.Id}`} value={sprint.Id}>
                {sprint.Name}
                {sprint.Status === 'active' ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="relative min-w-[160px]">
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Statuses
          </span>
          <button
            type="button"
            onClick={() => setStatusPickerOpen((open) => !open)}
            disabled={!statusPickerOrganizationId}
            className="w-full h-9 px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-60 text-left"
          >
            {statusPickerOrganizationId
              ? (() => {
                  const all = getStatusesForOrganization(statusPickerOrganizationId);
                  const hidden = getHiddenStatusIdsForOrg(
                    hiddenStatusesByOrg,
                    statusPickerOrganizationId
                  ).length;
                  if (hidden === 0) return 'All statuses';
                  return `${all.length - hidden}/${all.length} visible`;
                })()
              : 'Statuses'}
          </button>
          {statusPickerOpen && statusPickerOrganizationId && (
            <div className="absolute z-30 mt-1 w-72 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg p-2">
              {selectedOrganizationFilter === 'all' && groupedTasksByOrganization.length > 1 && (
                <div className="mb-2">
                  <label
                    htmlFor="kanban-status-org"
                    className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1"
                  >
                    Organization statuses
                  </label>
                  <select
                    id="kanban-status-org"
                    value={statusPickerOrganizationId}
                    onChange={(e) => setStatusConfigOrgId(Number(e.target.value))}
                    className="w-full h-8 px-2 rounded-md text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  >
                    {groupedTasksByOrganization.map((group) => (
                      <option key={`status-org-${group.organizationId}`} value={group.organizationId}>
                        {group.organizationName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="px-1 pb-2 text-[11px] text-gray-500 dark:text-gray-400">
                Choose which status columns to show
              </p>
              {getStatusesForOrganization(statusPickerOrganizationId).map((status) => {
                const hiddenIds = getHiddenStatusIdsForOrg(
                  hiddenStatusesByOrg,
                  statusPickerOrganizationId
                );
                const visible = !hiddenIds.includes(status.Id);
                return (
                  <label
                    key={`kanban-status-toggle-${status.Id}`}
                    className="flex items-center gap-2 px-1 py-1.5 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/60 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={(e) =>
                        toggleStatusVisibility(
                          statusPickerOrganizationId,
                          status.Id,
                          e.target.checked
                        )
                      }
                    />
                    <span
                      className="truncate"
                      style={status.ColorCode ? { color: mapColor(status.ColorCode) } : undefined}
                    >
                      {status.StatusName}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center pb-0.5">
          <span className="px-2.5 py-1 rounded-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
            {filteredAssignedCount} task{filteredAssignedCount === 1 ? '' : 's'}
            {(selectedProjectId || selectedSprintFilter !== 'all') && (
              <span className="opacity-70"> · filtered</span>
            )}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {visibleOrganizationGroups.map((activeGroup) => {
          const statuses = getVisibleStatusesForOrganization(activeGroup.organizationId);
          const allStatuses = getStatusesForOrganization(activeGroup.organizationId);
          const columnsPerRow = Math.min(Math.max(statuses.length, 1), 6);
          const hiddenCount =
            allStatuses.length - getVisibleStatusesForOrganization(activeGroup.organizationId).length;

          return (
            <section
              key={`kanban-org-board-${activeGroup.organizationId}`}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 overflow-hidden"
            >
              <div className="flex items-center justify-between gap-2 mb-2 min-h-7">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {activeGroup.organizationName}
                </h2>
                <div className="flex items-center gap-2 shrink-0">
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                      onClick={() => {
                        updateOrganizationFilter(activeGroup.organizationId);
                        setStatusPickerOpen(true);
                      }}
                    >
                      {hiddenCount} status{hiddenCount === 1 ? '' : 'es'} hidden
                    </button>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium">
                    {filteredTaskCountForOrg(activeGroup.organizationId)}
                  </span>
                </div>
              </div>

              {statuses.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                  All statuses are hidden for this organization.
                </p>
              ) : (
                <div className="w-full overflow-x-auto">
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${columnsPerRow}, minmax(220px, 1fr))` }}
                    onDragEnter={(e) => {
                      if (!canManage) return;
                      e.preventDefault();
                    }}
                    onDragOver={(e) => {
                      if (!canManage) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                  >
                    {statuses.map((status) => (
                      <div
                        key={`${activeGroup.organizationId}-${status.Id}`}
                        className="bg-gray-50 dark:bg-gray-900/40 rounded-lg p-2 h-[calc(100vh-340px)] min-h-[280px] flex flex-col overflow-hidden"
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropOnColumn(e, activeGroup.organizationId, status.Id)}
                      >
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <h3
                            className="font-semibold text-sm text-gray-900 dark:text-white truncate"
                            style={status.ColorCode ? { color: mapColor(status.ColorCode) } : undefined}
                          >
                            {status.StatusName}
                          </h3>
                          <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-[11px] font-semibold px-1.5 py-0.5 rounded-full shrink-0">
                            {getTasksByStatus(activeGroup.organizationId, status.Id).length}
                          </span>
                        </div>

                        <div className="space-y-2 flex-1 overflow-y-auto pr-0.5">
                          {getTasksByStatus(activeGroup.organizationId, status.Id).map((task) => {
                            const isDraggedOver = draggedOverTask === task.Id;

                            return (
                              <div
                                key={task.Id}
                                draggable={canManage}
                                onDragStart={(e) => handleDragStart(e, task.Id)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleDragOverTask(e, task.Id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDropOnTask(e, task)}
                                onClick={() => onOpenTask({ Id: task.Id, ProjectId: task.ProjectId })}
                                className={`bg-white dark:bg-gray-700 rounded-lg p-2.5 shadow-sm cursor-pointer hover:shadow-md transition-all ${
                                  isDraggedOver ? 'border-2 border-blue-500 border-dashed' : ''
                                }`}
                                style={getPriorityBorder(task)}
                              >
                                <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-1.5 flex items-center gap-1.5 min-w-0">
                                  <TaskTypeIconMark
                                    name={task.TaskTypeName}
                                    iconSvg={task.TaskTypeIconSvg}
                                    color={task.TaskTypeColor}
                                    className="w-3.5 h-3.5"
                                  />
                                  <span className="truncate">{task.TaskName}</span>
                                </h4>

                                {task.Description && (() => {
                                  const plainText = String(task.Description).replace(/<[^>]*>/g, '').trim();
                                  return plainText ? (
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5 line-clamp-2">{plainText}</p>
                                  ) : null;
                                })()}

                                <div className="flex items-center flex-wrap gap-1.5 text-xs mb-1.5">
                                  <span
                                    className="px-1.5 py-0.5 rounded"
                                    style={pillStyle(task.PriorityColor, { alpha: '20' })}
                                  >
                                    {task.PriorityName || 'No Priority'}
                                  </span>

                                  {task.EstimatedHours && (
                                    <span className="text-gray-500 dark:text-gray-400">⏱️ {task.EstimatedHours}h</span>
                                  )}

                                  {task.DueDate && (
                                    <span className="text-gray-500 dark:text-gray-400">
                                      📅 {new Date(task.DueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                </div>

                                <div className="text-xs text-gray-600 dark:text-gray-400 truncate">📁 {task.ProjectName || 'Project'}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

interface TimeEntry {
  Id: number;
  TaskId: number;
  UserId: number;
  WorkDate: string;
  Hours: number;
  Description: string;
  TaskName: string;
  ProjectName: string;
  CreatedAt: string;
  StartTime?: string;
  EndTime?: string;
}

// CallRecord type for calendar
interface CallRecordForCalendar {
  Id: number;
  CallDate: string;
  StartTime: string;
  DurationMinutes: number;
  CallType: string;
  Participants: string;
  Subject: string;
}

// Define TaskAllocation type for calendar
interface TaskAllocationForCalendar {
  Id: number;
  TaskId: number;
  TaskName: string;
  ProjectId: number;
  ProjectName: string;
  AllocationDate: string;
  AllocatedHours: number;
  StartTime: string;
  EndTime: string;
}

type DashboardTab = 'overview' | 'calendar' | 'kanban' | 'analytics';
type AnalyticsPeriod = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'allTime';
type TaskSortOption = 'dueDate' | 'priority' | 'project';
type PendingWorkFilter = 'all' | 'scheduled' | 'unscheduled';

type KpiTemplate = {
  type: DashboardKpiType;
  label: string;
  defaultTitle: string;
  icon: LucideIcon;
  borderClass: string;
  requiresOrganization?: boolean;
  requiresStatus?: boolean;
  requiresPriority?: boolean;
  requiresTag?: boolean;
  supportsOptionalTaskFilters?: boolean;
  requiresReport?: boolean;
};
const REPORT_DATASOURCE_COLUMNS: Record<string, { key: string; label: string }[]> = {
  'time-entries': [
    { key: 'Hours', label: 'Hours' },
    { key: 'WorkDate', label: 'Work Date' },
    { key: 'TaskName', label: 'Task Name' },
    { key: 'ProjectName', label: 'Project Name' },
    { key: 'Description', label: 'Description' },
    { key: 'StartTime', label: 'Start Time' },
    { key: 'EndTime', label: 'End Time' },
  ],
  'time-entries-and-calls': [
    { key: 'Hours', label: 'Hours' },
    { key: 'WorkDate', label: 'Work Date' },
    { key: 'TaskName', label: 'Task Name' },
    { key: 'ProjectName', label: 'Project Name' },
  ],
  'tasks': [
    { key: 'EstimatedHours', label: 'Estimated Hours' },
    { key: 'SubtaskCount', label: 'Subtask Count' },
    { key: 'TaskName', label: 'Task Name' },
    { key: 'ProjectName', label: 'Project Name' },
    { key: 'StatusName', label: 'Status' },
    { key: 'PriorityName', label: 'Priority' },
    { key: 'AssigneeName', label: 'Assigned To' },
  ],
  'projects': [
    { key: 'ProjectName', label: 'Project Name' },
    { key: 'StatusName', label: 'Status' },
    { key: 'OrganizationName', label: 'Organization' },
    { key: 'CustomerName', label: 'Customer' },
  ],
  'task-allocations': [
    { key: 'AllocatedHours', label: 'Allocated Hours' },
    { key: 'AllocationDate', label: 'Allocation Date' },
    { key: 'TaskName', label: 'Task Name' },
    { key: 'ProjectName', label: 'Project Name' },
  ],
  'tickets': [
    { key: 'Title', label: 'Title' },
    { key: 'StatusName', label: 'Status' },
    { key: 'PriorityName', label: 'Priority' },
    { key: 'TypeName', label: 'Category' },
    { key: 'ProjectName', label: 'Project' },
    { key: 'AssigneeName', label: 'Assigned To' },
  ],
  'dynamic': [],
};

const KPI_TEMPLATES: KpiTemplate[] = [
  { type: 'totalProjects', label: 'Projects', defaultTitle: 'Projects', icon: NAV_ICONS['/projects'], borderClass: 'border-blue-500' },
  { type: 'myTasks', label: 'My Tasks', defaultTitle: 'My Tasks', icon: ListTodo, borderClass: 'border-green-500' },
  { type: 'myPendingTasks', label: 'My Pending Tasks', defaultTitle: 'My Pending Tasks', icon: Clock, borderClass: 'border-amber-500' },
  { type: 'myCompletedTasks', label: 'My Completed Tasks', defaultTitle: 'My Completed Tasks', icon: CheckCircle2, borderClass: 'border-emerald-500' },
  { type: 'myTickets', label: 'My Tickets', defaultTitle: 'My Tickets', icon: NAV_ICONS['/tickets'], borderClass: 'border-indigo-500' },
  { type: 'hoursThisWeek', label: 'Hours This Week', defaultTitle: 'Hours This Week', icon: NAV_ICONS['/timesheet'], borderClass: 'border-purple-500' },
  { type: 'hoursThisMonth', label: 'Hours This Month', defaultTitle: 'Hours This Month', icon: NAV_ICONS['/reporting'], borderClass: 'border-orange-500' },
  { type: 'customersTotal', label: 'Customers', defaultTitle: 'Customers', icon: NAV_ICONS['/customers'], borderClass: 'border-teal-500' },
  { type: 'organizationProjects', label: 'Organization Projects', defaultTitle: 'Organization Projects', icon: FolderKanban, borderClass: 'border-sky-500', requiresOrganization: true },
  { type: 'organizationTasks', label: 'Organization Tasks', defaultTitle: 'Organization Tasks', icon: ListTree, borderClass: 'border-cyan-500', requiresOrganization: true },
  { type: 'organizationPendingTasks', label: 'Organization Pending Tasks', defaultTitle: 'Organization Pending Tasks', icon: Pin, borderClass: 'border-yellow-500', requiresOrganization: true },
  { type: 'organizationCompletedTasks', label: 'Organization Completed Tasks', defaultTitle: 'Organization Completed Tasks', icon: Target, borderClass: 'border-lime-500', requiresOrganization: true },
  { type: 'tasksByStatus', label: 'Tasks by Status', defaultTitle: 'Tasks by Status', icon: CircleDot, borderClass: 'border-pink-500', requiresOrganization: true, requiresStatus: true },
  { type: 'tasksByPriority', label: 'Tasks by Priority', defaultTitle: 'Tasks by Priority', icon: Flag, borderClass: 'border-rose-500', requiresOrganization: true, requiresPriority: true },
  { type: 'tasksByTag', label: 'Tasks by Tag', defaultTitle: 'Tasks by Tag', icon: Tag, borderClass: 'border-fuchsia-500', requiresOrganization: true, requiresTag: true },
  { type: 'tasksFiltered', label: 'Filtered Tasks', defaultTitle: 'Filtered Tasks', icon: Search, borderClass: 'border-violet-500', requiresOrganization: true, supportsOptionalTaskFilters: true },
  { type: 'overdueTasksFiltered', label: 'Overdue Tasks', defaultTitle: 'Overdue Tasks', icon: Clock, borderClass: 'border-red-500', requiresOrganization: true, supportsOptionalTaskFilters: true },
  { type: 'blockedTasksFiltered', label: 'Blocked Tasks', defaultTitle: 'Blocked Tasks', icon: Ban, borderClass: 'border-amber-600', requiresOrganization: true, supportsOptionalTaskFilters: true },
  { type: 'unestimatedTasksFiltered', label: 'Unestimated Tasks', defaultTitle: 'Unestimated Tasks', icon: Calculator, borderClass: 'border-slate-500', requiresOrganization: true, supportsOptionalTaskFilters: true },
  { type: 'reopenedTasksFiltered', label: 'Reopened Tasks', defaultTitle: 'Reopened Tasks', icon: Repeat2, borderClass: 'border-orange-500', requiresOrganization: true, supportsOptionalTaskFilters: true },
  { type: 'throughputThisWeek', label: 'Throughput This Week', defaultTitle: 'Throughput This Week', icon: TrendingUp, borderClass: 'border-emerald-600', requiresOrganization: true, supportsOptionalTaskFilters: true },
  { type: 'throughputThisMonth', label: 'Throughput This Month', defaultTitle: 'Throughput This Month', icon: TrendingDown, borderClass: 'border-cyan-600', requiresOrganization: true, supportsOptionalTaskFilters: true },
  { type: 'cycleTimeMedianDays', label: 'Cycle Time Median', defaultTitle: 'Cycle Time Median', icon: MapPin, borderClass: 'border-blue-600', requiresOrganization: true, supportsOptionalTaskFilters: true },
  { type: 'leadTimeMedianDays', label: 'Lead Time Median', defaultTitle: 'Lead Time Median', icon: Rocket, borderClass: 'border-indigo-600', requiresOrganization: true, supportsOptionalTaskFilters: true },
  { type: 'ticketsSlaRisk', label: 'Tickets SLA Risk', defaultTitle: 'Tickets SLA Risk', icon: AlertTriangle, borderClass: 'border-rose-600', requiresOrganization: true },
  { type: 'reportKpi', label: 'Advanced Report KPI', defaultTitle: 'Report KPI', icon: NAV_ICONS['/reporting'], borderClass: 'border-purple-600', requiresReport: true },
];

const getDefaultKpiWidgets = (internalTicketsEnabled: boolean): DashboardKpiWidget[] => {
  const defaults: DashboardKpiWidget[] = [
    { id: 'projects', type: 'totalProjects', title: 'Projects' },
    { id: 'my-tasks', type: 'myTasks', title: 'My Tasks' },
    { id: 'hours-week', type: 'hoursThisWeek', title: 'Hours This Week' },
    { id: 'hours-month', type: 'hoursThisMonth', title: 'Hours This Month' },
  ];

  if (internalTicketsEnabled) {
    defaults.splice(2, 0, { id: 'my-tickets', type: 'myTickets', title: 'My Tickets' });
  }

  return defaults;
};

const buildWidgetId = (type: DashboardKpiType): string => `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Use CalendarTab with dynamic import wrapper
const CalendarTab = dynamic(
  () => Promise.resolve(CalendarTabComponent),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4 animate-pulse py-6">
        <div className="h-8 bg-white dark:bg-gray-800 rounded-lg" />
        <div className="h-64 bg-white dark:bg-gray-800 rounded-lg" />
      </div>
    ),
  }
);

export default function DashboardPage() {
  return (
    <Suspense fallback={
        <div className="w-full space-y-5 animate-pulse py-6">
          <div className="h-24 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)]" />
          <div className="h-14 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)]" />
          <div className="h-96 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)]" />
        </div>
      }>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const taskDeepLinkHandledRef = useRef<string | null>(null);
  const decimalHoursToHMS = useFormatHours();
  const { pillStyle } = useColorVision();
  const { user, isLoading, token, isCustomerUser } = useAuth();
  const { permissions, isLoading: _isLoadingPermissions } = usePermissions();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const taskDeepLinkParam = searchParams.get('taskId') || searchParams.get('task');
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => {
    if (tabParam === 'calendar' || tabParam === 'kanban' || tabParam === 'analytics') return tabParam;
    return 'overview';
  });
  const [showCalendarInOverview, setShowCalendarInOverview] = useState(true);

  // ...existing state declarations...

  // ...existing state declarations...
  // (keep only one set of these state declarations)

  // --- Integration state for TaskDetailModal ---
  // (removed duplicate detailsJiraIntegration declaration)

  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('thisMonth');
  const [_userProfile, setUserProfile] = useState<User | null>(null);
  const [_workHours, setWorkHours] = useState({
    monday: 8,
    tuesday: 8,
    wednesday: 8,
    thursday: 8,
    friday: 8,
    saturday: 0,
    sunday: 0,
  });
  const [workStartTimes, setWorkStartTimes] = useState({
    monday: '09:00',
    tuesday: '09:00',
    wednesday: '09:00',
    thursday: '09:00',
    friday: '09:00',
    saturday: '09:00',
    sunday: '09:00',
  });
  const [lunchTime, setLunchTime] = useState('12:00');
  const [lunchDuration, setLunchDuration] = useState(60); // minutes
  const [_hobbyStartTimes, setHobbyStartTimes] = useState({
    monday: '19:00',
    tuesday: '19:00',
    wednesday: '19:00',
    thursday: '19:00',
    friday: '19:00',
    saturday: '10:00',
    sunday: '10:00',
  });
  const [_hobbyHours, setHobbyHours] = useState({
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 4,
    sunday: 4,
  });
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [myTasks, setMyTasks] = useState<TaskWithProject[]>([]);
  const [modalMessage, setModalMessage] = useState<{
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);
  const [summaryStats, setSummaryStats] = useState({
    totalProjects: 0,
    totalTasks: 0,
    myTasks: 0,
    hoursThisWeek: 0,
    hoursThisMonth: 0,
    allocatedToday: 0,
    allocatedThisWeek: 0,
    estimatedHours: 0,
    workedHours: 0,
    overdueTasks: 0,
    // Normal projects
    normalEstimatedHours: 0,
    normalWorkedHours: 0,
    normalAllocatedThisWeek: 0,
    normalHoursThisWeek: 0,
    // Hobby projects
    hobbyEstimatedHours: 0,
    hobbyWorkedHours: 0,
    hobbyAllocatedThisWeek: 0,
    hobbyHoursThisWeek: 0,
    tasksToday: [] as any[],
    myTickets: 0,
    openTickets: 0,
    unresolvedTickets: 0,
  });
  const [pendingTasks, setPendingTasks] = useState<TaskWithProject[]>([]);
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [showAllPendingTasks, setShowAllPendingTasks] = useState(false);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  const [detailsTask, setDetailsTask] = useState<Task | null>(null);
  const [detailsProject, setDetailsProject] = useState<Project | null>(null);
  // --- Integration state for TaskDetailModal ---
  const [_detailsJiraIntegration, setDetailsJiraIntegration] = useState<any>(null);

  useEffect(() => {
    if (showTaskDetailsModal && detailsProject) {
      const loadJiraIntegration = async () => {
        try {
          const response = await fetch(`${getApiUrl()}/api/jira-integrations/organization/${detailsProject.OrganizationId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            if (data.integration?.IsEnabled) {
              setDetailsJiraIntegration(data.integration);
            } else {
              setDetailsJiraIntegration(null);
            }
          } else {
            setDetailsJiraIntegration(null);
          }
        } catch (_err) {
          setDetailsJiraIntegration(null);
        }
      };
      loadJiraIntegration();
    } else {
      setDetailsJiraIntegration(null);
    }
  }, [showTaskDetailsModal, detailsProject, token]);
  const [detailsProjectTasks, setDetailsProjectTasks] = useState<Task[]>([]);
  const [pendingWorkFilter, setPendingWorkFilter] = useState<PendingWorkFilter>('all');
  const [pendingSortBy, setPendingSortBy] = useState<TaskSortOption>('priority');
  const [globalStats, setGlobalStats] = useState<{
    organizations: { total: number };
    customers: { total: number };
    users: { total: number; admins: number; regular: number; customerUsers: number };
    projects: { total: number; active: number; completed: number };
    tasks: { total: number; completed: number; inProgress: number; overdue: number; unplanned: number };
    tickets: { total: number; open: number; inProgress: number; waitingResponse: number; resolved: number; closed: number; unresolvedCount: number };
    hours: { totalEstimated: number; totalWorked: number; thisWeek: number; thisMonth: number; totalEstimatedHobby: number; totalWorkedHobby: number; thisWeekHobby: number; thisMonthHobby: number };
    topProjects: { id: number; name: string; organization: string; hours: number }[];
    topUsers: { id: number; name: string; hours: number }[];
    taskAnalytics?: TaskAnalyticsData;
  } | null>(null);
  // Customer portal state
  const [portalData, setPortalData] = useState<{
    customer: { Id: number; Name: string; Email: string | null; Phone: string | null; ContactPerson: string | null; ContactEmail: string | null; Website: string | null };
    stats: { total: number; open: number; closed: number; inProgress: number; waiting: number; urgent: number };
    attentionTickets: {
      Id: number;
      TicketNumber?: string | null;
      Title: string;
      Category: string;
      CreatedAt: string;
      UpdatedAt: string;
      StatusName: string;
      StatusType?: string | null;
      StatusColor: string;
      IsClosed: number;
      PriorityName: string;
      PriorityColor: string;
      ProjectName: string | null;
      AssigneeName: string | null;
      AssigneeFirst: string | null;
      AssigneeLast: string | null;
      CreatorUsername?: string | null;
      CreatorFirst?: string | null;
      CreatorLast?: string | null;
      CreatorName?: string | null;
    }[];
    recentActivity: {
      Id: number;
      TicketNumber?: string | null;
      Title: string;
      Category: string;
      CreatedAt: string;
      UpdatedAt: string;
      StatusName: string;
      StatusType?: string | null;
      StatusColor: string;
      IsClosed: number;
      PriorityName: string;
      PriorityColor: string;
      ProjectName: string | null;
      CreatorUsername?: string | null;
      CreatorFirst?: string | null;
      CreatorLast?: string | null;
      CreatorName?: string | null;
    }[];
    projects: { Id: number; ProjectName: string; Description: string | null; StatusLabel: string | null; StatusColor: string | null; OrganizationName: string; TotalTasks: number; CompletedTasks: number; StartDate: string | null; EndDate: string | null }[];
  } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');
  
  // Call Records state (for calendar display)
  const [callRecords, setCallRecords] = useState<CallRecordForCalendar[]>([]);

  // Task Allocations state (for calendar display with times)
  const [taskAllocations, setTaskAllocations] = useState<TaskAllocationForCalendar[]>([]);

  // Recurring Allocations state (for calendar display)
  const [recurringAllocations, setRecurringAllocations] = useState<any[]>([]);
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [kanbanLoading, setKanbanLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState({
    timeEntries: 0,
    vacations: 0,
    expenses: 0,
    canApproveTime: false,
    canApproveVacations: false,
    canApproveExpenses: false,
  });
  const [kpiWidgets, setKpiWidgets] = useState<DashboardKpiWidget[]>([]);
  const [kpiValues, setKpiValues] = useState<Record<string, DashboardKpiMetricValue>>({});
  const [kpiDetailsByWidget, setKpiDetailsByWidget] = useState<Record<string, DashboardKpiDetailResult>>({});
  const [kpiMetadata, setKpiMetadata] = useState<DashboardKpiMetadata>({
    organizations: [],
    statusesByOrganization: {},
    prioritiesByOrganization: {},
    tagsByOrganization: {},
  });
  const [kpiDetailModal, setKpiDetailModal] = useState<{
    show: boolean;
    widgetId: string | null;
    widget: DashboardKpiWidget | null;
    items: DashboardKpiDetailItem[];
    isLoading: boolean;
    type: 'tasks' | 'projects' | 'customers' | 'tickets' | 'timeEntries' | 'reportRows' | 'unknown';
  }>({
    show: false,
    widgetId: null,
    widget: null,
    items: [],
    isLoading: false,
    type: 'tasks',
  });
  const [kpiSectionLoading, setKpiSectionLoading] = useState(false);
  const [kpiEditMode, setKpiEditMode] = useState(false);
  const [kpiSaving, setKpiSaving] = useState(false);
  const [kpiConfigLoaded, setKpiConfigLoaded] = useState(false);
  const [kpiAddType, setKpiAddType] = useState<DashboardKpiType | ''>('');
  const [kpiAvailableReports, setKpiAvailableReports] = useState<{ Id: number; ReportName: string; DataSource: string }[]>([]);
  const [draggingWidgetId, setDraggingWidgetId] = useState<string | null>(null);

  const showPendingApprovalAlert =
    (pendingApprovals.canApproveTime && pendingApprovals.timeEntries > 0) ||
    (pendingApprovals.canApproveVacations && pendingApprovals.vacations > 0) ||
    (pendingApprovals.canApproveExpenses && pendingApprovals.expenses > 0);

  const selectableKpiTemplates = useMemo(() => {
    const templates = internalTicketsEnabled
      ? KPI_TEMPLATES
      : KPI_TEMPLATES.filter((template) => template.type !== 'myTickets');

    const existingTypes = new Set(kpiWidgets.map((widget) => widget.type));
    return templates.filter((template) => template.type === 'reportKpi' || !existingTypes.has(template.type));
  }, [internalTicketsEnabled, kpiWidgets]);

  const loadKpiAvailableReports = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${getApiUrl()}/api/saved-reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const allReports = (data.reports || []).filter((r: any) => Number(r.Id) !== 0);
        setKpiAvailableReports(allReports.map((r: any) => ({ Id: Number(r.Id), ReportName: String(r.ReportName || `${r.DataSource} Report`), DataSource: String(r.DataSource || '') })));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (kpiEditMode) {
      void loadKpiAvailableReports();
    }
   
  }, [kpiEditMode]);

  const closeModal = () => {
    setModalMessage(null);
  };

  const openKpiDetailModal = async (widget: DashboardKpiWidget) => {
    setKpiDetailModal((prev) => ({ ...prev, show: true, widgetId: widget.id, widget, isLoading: true, items: [] }));

    const cachedDetails = kpiDetailsByWidget[widget.id];
    if (cachedDetails) {
      setKpiDetailModal((prev) => ({
        ...prev,
        items: cachedDetails.items || [],
        type: cachedDetails.type || 'unknown',
        isLoading: false,
      }));
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard-kpis/${widget.id}/details`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ widget }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setKpiDetailsByWidget((prev) => ({
          ...prev,
          [widget.id]: {
            type: data.type || 'unknown',
            items: data.items || [],
          },
        }));
        setKpiDetailModal((prev) => ({
          ...prev,
          items: data.items || [],
          type: data.type || 'unknown',
          isLoading: false,
        }));
      } else {
        setKpiDetailModal((prev) => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('Failed to load KPI details:', error);
      setKpiDetailModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const closeKpiDetailModal = () => {
    setKpiDetailModal((prev) => ({ ...prev, show: false }));
  };

  const handleModalConfirm = () => {
    if (modalMessage?.onConfirm) {
      modalMessage.onConfirm();
    }
    closeModal();
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

  const loadPendingTasksFromTasks = useCallback((tasks: TaskWithProject[]) => {
    const pending = tasks
      .filter((task: TaskWithProject) =>
        !task.StatusIsClosed &&
        !task.StatusIsCancelled &&
        !task.StatusHideFromPlanningAndStatistics
      )
      .sort((a: TaskWithProject, b: TaskWithProject) => {
        const dueA = a.DueDate ? new Date(a.DueDate) : null;
        const dueB = b.DueDate ? new Date(b.DueDate) : null;
        const overdueA = isTaskOverdue(a.DueDate ? String(a.DueDate) : null);
        const overdueB = isTaskOverdue(b.DueDate ? String(b.DueDate) : null);

        if (overdueA !== overdueB) {
          return overdueA ? -1 : 1;
        }

        if (overdueA && overdueB) {
          const dueATime = dueA ? dueA.getTime() : Infinity;
          const dueBTime = dueB ? dueB.getTime() : Infinity;
          if (dueATime !== dueBTime) {
            return dueATime - dueBTime;
          }
        }

        const plannedA = a.PlannedStartDate ? new Date(a.PlannedStartDate).getTime() : Infinity;
        const plannedB = b.PlannedStartDate ? new Date(b.PlannedStartDate).getTime() : Infinity;
        if (plannedA !== plannedB) {
          return plannedA - plannedB;
        }

        const dueATime = dueA ? dueA.getTime() : Infinity;
        const dueBTime = dueB ? dueB.getTime() : Infinity;
        return dueATime - dueBTime;
      });

    setPendingTasks(pending);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(('/login'));
    }
  }, [isLoading, user, router]);

  // Update active tab when URL param changes
  useEffect(() => {
    if (tabParam) {
      if (tabParam === 'calendar' || tabParam === 'kanban' || tabParam === 'analytics') {
        setActiveTab(tabParam);
      } else {
        setActiveTab('overview');
      }
    }
  }, [tabParam]);

  useEffect(() => {
    if (!showCalendarInOverview) return;
    if (activeTab !== 'calendar') return;

    setActiveTab('overview');
    window.history.pushState({}, '', '/dashboard');
  }, [showCalendarInOverview, activeTab]);

  const isTaskOverdue = (dueDate?: string | null): boolean => {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
  };

  useEffect(() => {
    const handleBeforePrint = () => setIsPrintMode(true);
    const handleAfterPrint = () => setIsPrintMode(false);

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  useEffect(() => {
    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && modalMessage) {
        closeModal();
      }
    };

    window.addEventListener('keydown', handleEscClose);
    return () => window.removeEventListener('keydown', handleEscClose);
  }, [modalMessage]);

  const toDateString = (date: Date): string => date.toISOString().split('T')[0];

  const getPeriodLabel = (period: AnalyticsPeriod): string => {
    if (period === 'thisWeek') return 'This Week';
    if (period === 'lastWeek') return 'Last Week';
    if (period === 'thisMonth') return 'This Month';
    if (period === 'allTime') return 'All Time';
    return 'Last Month';
  };

  const getPeriodRange = (period: AnalyticsPeriod) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const weekdayIndexMondayBased = (today.getDay() + 6) % 7;
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - weekdayIndexMondayBased);
    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekStart.getDate() + 6);

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(thisWeekStart.getDate() - 1);

    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    if (period === 'allTime') return null;
    if (period === 'thisWeek') return { from: toDateString(thisWeekStart), to: toDateString(thisWeekEnd) };
    if (period === 'lastWeek') return { from: toDateString(lastWeekStart), to: toDateString(lastWeekEnd) };
    if (period === 'thisMonth') return { from: toDateString(thisMonthStart), to: toDateString(thisMonthEnd) };
    return { from: toDateString(lastMonthStart), to: toDateString(lastMonthEnd) };
  };

  const selectedAnalyticsRange = useMemo(() => {
    if (analyticsPeriod === 'allTime') return null;
    return getPeriodRange(analyticsPeriod);
  }, [analyticsPeriod]);

  const unscheduledPendingTasks = useMemo(() => {
    return pendingTasks.filter((task) => Number(task.UnscheduledWork || 0) === 1);
  }, [pendingTasks]);

  const getPriorityRank = useCallback((task: TaskWithProject) => {
    const configuredSortOrder = Number(task.PrioritySortOrder);
    if (Number.isFinite(configuredSortOrder)) {
      return configuredSortOrder;
    }

    return Number.NEGATIVE_INFINITY;
  }, []);

  const sortTasks = useCallback((tasks: TaskWithProject[], sortBy: TaskSortOption) => {
    const sorted = [...tasks];

    sorted.sort((a, b) => {
      if (sortBy === 'project') {
        const projectCompare = String(a.ProjectName || '').localeCompare(String(b.ProjectName || ''));
        if (projectCompare !== 0) return projectCompare;
      }

      if (sortBy === 'priority') {
        const rankA = getPriorityRank(a);
        const rankB = getPriorityRank(b);
        if (rankA !== rankB) return rankB - rankA;
      }

      const dueA = a.DueDate ? new Date(a.DueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.DueDate ? new Date(b.DueDate).getTime() : Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;

      return String(a.TaskName || '').localeCompare(String(b.TaskName || ''));
    });

    return sorted;
  }, [getPriorityRank]);

  const filteredPendingTasks = useMemo(() => {
    return pendingTasks.filter((task) => {
      const isUnscheduled = Number(task.UnscheduledWork || 0) === 1;

      if (pendingWorkFilter === 'unscheduled') {
        return isUnscheduled;
      }

      if (pendingWorkFilter === 'scheduled') {
        return !isUnscheduled;
      }

      return true;
    });
  }, [pendingTasks, pendingWorkFilter]);

  const sortedPendingTasks = useMemo(() => {
    return sortTasks(filteredPendingTasks, pendingSortBy);
  }, [filteredPendingTasks, pendingSortBy, sortTasks]);

  const openTaskDetails = useCallback(async (taskRef: Pick<Task, 'Id' | 'ProjectId'>) => {
    if (!token) return;

    try {
      const [projectResponse, tasksResponse] = await Promise.all([
        projectsApi.getById(Number(taskRef.ProjectId), token),
        tasksApi.getByProject(Number(taskRef.ProjectId), token),
      ]);

      const project = projectResponse.project;
      const projectTasks = tasksResponse.tasks || [];
      const selectedTask = projectTasks.find((task) => Number(task.Id) === Number(taskRef.Id));

      if (!project || !selectedTask) {
        showToast({ type: 'error', message: 'Task details could not be loaded.' });
        return;
      }

      setDetailsProject(project);
      setDetailsProjectTasks(projectTasks);
      setDetailsTask(selectedTask);
      setShowTaskDetailsModal(true);
    } catch (error) {
      console.error('Failed to open task details modal:', error);
      showToast({ type: 'error', message: 'Failed to open task details.' });
    }
  }, [token, showToast]);

  // Deep-link: /dashboard?task=<id> (also accepts ?taskId=) — resolve ProjectId then open TaskDetailModal
  useEffect(() => {
    if (isLoading || !user || !token || isCustomerUser) return;
    if (!taskDeepLinkParam) {
      taskDeepLinkHandledRef.current = null;
      return;
    }

    const taskId = Number(taskDeepLinkParam);
    if (!Number.isFinite(taskId) || taskId <= 0) {
      showToast({ type: 'error', message: 'Invalid task id in link.' });
      const params = new URLSearchParams(searchParams.toString());
      params.delete('task');
      params.delete('taskId');
      const qs = params.toString();
      router.replace(qs ? `/dashboard?${qs}` : '/dashboard');
      return;
    }

    const handledKey = String(taskId);
    if (taskDeepLinkHandledRef.current === handledKey) return;
    taskDeepLinkHandledRef.current = handledKey;

    let cancelled = false;

    const clearTaskQuery = () => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('task');
      params.delete('taskId');
      const qs = params.toString();
      router.replace(qs ? `/dashboard?${qs}` : '/dashboard');
    };

    void (async () => {
      try {
        const res = await tasksApi.getById(taskId, token);
        if (cancelled) return;
        const projectId = Number(res.task?.ProjectId);
        if (!Number.isFinite(projectId) || projectId <= 0) {
          showToast({ type: 'error', message: 'Task project could not be resolved.' });
          clearTaskQuery();
          return;
        }
        await openTaskDetails({ Id: taskId, ProjectId: projectId });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to open task details.';
        showToast({ type: 'error', message });
      } finally {
        if (!cancelled) clearTaskQuery();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isLoading,
    user,
    token,
    isCustomerUser,
    taskDeepLinkParam,
    openTaskDetails,
    router,
    searchParams,
    showToast,
  ]);

  const handleKpiDetailItemOpen = useCallback((item: DashboardKpiDetailItem) => {
    if (kpiDetailModal.type === 'tasks') {
      if (!item.taskId || !item.projectId) {
        showToast({ type: 'error', message: 'Task details are not available for this item.' });
        return;
      }
      closeKpiDetailModal();
      openTaskDetails({ Id: Number(item.taskId), ProjectId: Number(item.projectId) });
      return;
    }

    if (kpiDetailModal.type === 'timeEntries') {
      if (!item.taskId || !item.projectId) {
        showToast({ type: 'error', message: 'This time entry is not linked to a task.' });
        return;
      }
      closeKpiDetailModal();
      openTaskDetails({ Id: Number(item.taskId), ProjectId: Number(item.projectId) });
      return;
    }

    if (kpiDetailModal.type === 'projects') {
      closeKpiDetailModal();
      router.push(`/projects/${item.id}`);
      return;
    }

    if (kpiDetailModal.type === 'customers') {
      closeKpiDetailModal();
      router.push(`/customers/${item.id}`);
      return;
    }

    if (kpiDetailModal.type === 'tickets') {
      closeKpiDetailModal();
      router.push(`/tickets/${item.id}`);
    }
  }, [kpiDetailModal.type, openTaskDetails, router, showToast]);

  const getKpiDetailItemActionLabel = useCallback(() => {
    if (kpiDetailModal.type === 'tasks' || kpiDetailModal.type === 'timeEntries') {
      return 'Open task details';
    }
    if (kpiDetailModal.type === 'projects') {
      return 'Open project';
    }
    if (kpiDetailModal.type === 'customers') {
      return 'Open customer';
    }
    if (kpiDetailModal.type === 'tickets') {
      return 'Open ticket';
    }
    return null;
  }, [kpiDetailModal.type]);

  const getKpiDetailTypeLabel = useCallback(() => {
    if (kpiDetailModal.type === 'tasks') return 'Tasks';
    if (kpiDetailModal.type === 'projects') return 'Projects';
    if (kpiDetailModal.type === 'customers') return 'Customers';
    if (kpiDetailModal.type === 'tickets') return 'Tickets';
    if (kpiDetailModal.type === 'timeEntries') return 'Time Entries';
    if (kpiDetailModal.type === 'reportRows') return 'Rows';
    return 'Items';
  }, [kpiDetailModal.type]);

  const loadPortalData = async () => {
    setPortalLoading(true);
    setPortalError('');
    try {
      const res = await fetch(`${getApiUrl()}/api/portal/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || 'Failed to load portal');
      }
      setPortalData(await res.json());
    } catch (err: any) {
      const message = err.message || 'Failed to load portal data';
      setPortalError(message);
      showToast({ type: 'error', message });
    } finally {
      setPortalLoading(false);
    }
  };

  const loadUserProfile = async () => {
    try {
      const response = await usersApi.getProfile(token!);
      setUserProfile(response.user);
      setWorkHours({
        monday: response.user.WorkHoursMonday || 8,
        tuesday: response.user.WorkHoursTuesday || 8,
        wednesday: response.user.WorkHoursWednesday || 8,
        thursday: response.user.WorkHoursThursday || 8,
        friday: response.user.WorkHoursFriday || 8,
        saturday: response.user.WorkHoursSaturday || 0,
        sunday: response.user.WorkHoursSunday || 0,
      });
      setWorkStartTimes({
        monday: response.user.WorkStartMonday || '09:00',
        tuesday: response.user.WorkStartTuesday || '09:00',
        wednesday: response.user.WorkStartWednesday || '09:00',
        thursday: response.user.WorkStartThursday || '09:00',
        friday: response.user.WorkStartFriday || '09:00',
        saturday: response.user.WorkStartSaturday || '09:00',
        sunday: response.user.WorkStartSunday || '09:00',
      });
      setLunchTime(response.user.LunchTime || '12:00');
      setLunchDuration(response.user.LunchDuration || 60);
      setHobbyStartTimes({
        monday: response.user.HobbyStartMonday || '19:00',
        tuesday: response.user.HobbyStartTuesday || '19:00',
        wednesday: response.user.HobbyStartWednesday || '19:00',
        thursday: response.user.HobbyStartThursday || '19:00',
        friday: response.user.HobbyStartFriday || '19:00',
        saturday: response.user.HobbyStartSaturday || '10:00',
        sunday: response.user.HobbyStartSunday || '10:00',
      });
      setHobbyHours({
        monday: response.user.HobbyHoursMonday || 0,
        tuesday: response.user.HobbyHoursTuesday || 0,
        wednesday: response.user.HobbyHoursWednesday || 0,
        thursday: response.user.HobbyHoursThursday || 0,
        friday: response.user.HobbyHoursFriday || 0,
        saturday: response.user.HobbyHoursSaturday || 4,
        sunday: response.user.HobbyHoursSunday || 4,
      });
      setShowCalendarInOverview(Number(response.user.DashboardCalendarInOverview ?? 1) === 1);
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  };

  const loadSummaryStats = async () => {
    setOverviewLoading(true);
    try {
      // Load projects count
      const projectsResponse = await fetch(
        `${getApiUrl()}/api/projects`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      let totalProjects = 0;
      if (projectsResponse.ok) {
        const projectsData = await projectsResponse.json();
        totalProjects = projectsData.projects?.length || 0;
      }

      const [tasks, entries, allocations] = await Promise.all([
        loadMyTasks(),
        loadTimeEntries(),
        loadTaskAllocations()
      ]);

      loadPendingTasksFromTasks(tasks);
      
      let myTasksCount = 0;
      let totalTasks = 0;
      let estimatedHours = 0;
      let normalEstimatedHours = 0;
      let hobbyEstimatedHours = 0;
      let overdueTasks = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const visibleTasks = tasks.filter((t: TaskWithProject) => !t.StatusHideFromPlanningAndStatistics);
      myTasksCount = visibleTasks.length;
      totalTasks = myTasksCount;

      // Identify tasks with children (parent tasks)
      const taskIdsWithChildren = new Set(visibleTasks.filter((t: any) => t.ParentTaskId).map((t: any) => t.ParentTaskId));
      // Get only leaf tasks (tasks without children)
      const leafTasks = visibleTasks.filter((t: any) => !taskIdsWithChildren.has(t.Id));

      // Calculate estimated hours only from leaf tasks and overdue tasks
      leafTasks.forEach((task: any) => {
        const hours = Number(task.EstimatedHours || 0);
        estimatedHours += hours;

        // Separate by project type
        if (task.IsHobby) {
          hobbyEstimatedHours += hours;
        } else {
          normalEstimatedHours += hours;
        }
      });

      // Check overdue tasks (all tasks, not just leaf)
      visibleTasks.forEach((task: any) => {
        if (task.DueDate &&
            !task.StatusIsClosed &&
            !task.StatusIsCancelled) {
          const endDate = new Date(task.DueDate);
          endDate.setHours(0, 0, 0, 0);
          if (endDate < today) {
            overdueTasks++;
          }
        }
      });
      
      let hoursThisWeek = 0;
      let hoursThisMonth = 0;
      let workedHours = 0;
      let normalWorkedHours = 0;
      let hobbyWorkedHours = 0;
      let normalHoursThisWeek = 0;
      let hobbyHoursThisWeek = 0;
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      entries.forEach((entry: any) => {
        const entryDate = new Date(entry.WorkDate);
        const hours = parseFloat(entry.Hours || 0);
        const isHobby = entry.IsHobby || false;

        workedHours += hours;

        if (isHobby) {
          hobbyWorkedHours += hours;
        } else {
          normalWorkedHours += hours;
        }

        if (entryDate >= startOfWeek) {
          hoursThisWeek += hours;
          if (isHobby) {
            hobbyHoursThisWeek += hours;
          } else {
            normalHoursThisWeek += hours;
          }
        }

        if (entryDate >= startOfMonth) {
          hoursThisMonth += hours;
        }
      });
      
      let allocatedToday = 0;
      let allocatedThisWeek = 0;
      let normalAllocatedThisWeek = 0;
      let hobbyAllocatedThisWeek = 0;
      const tasksToday: any[] = [];
      const todayStr = today.toISOString().split('T')[0];
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(weekStart);
      endOfWeek.setDate(endOfWeek.getDate() + 6);

      allocations.forEach((alloc: any) => {
        const allocDate = new Date(alloc.AllocationDate);
        const allocDateStr = allocDate.toISOString().split('T')[0];
        const hours = parseFloat(alloc.AllocatedHours || 0);
        const isHobby = alloc.IsHobby || false;

        if (allocDateStr === todayStr) {
          allocatedToday += hours;
          tasksToday.push({
            taskName: alloc.TaskName,
            projectName: alloc.ProjectName,
            isHobby,
            hours: hours,
            startTime: alloc.StartTime,
            endTime: alloc.EndTime,
          });
        }

        if (allocDate >= weekStart && allocDate <= endOfWeek) {
          allocatedThisWeek += hours;
          if (isHobby) {
            hobbyAllocatedThisWeek += hours;
          } else {
            normalAllocatedThisWeek += hours;
          }
        }
      });

      setSummaryStats({
        totalProjects,
        totalTasks,
        myTasks: myTasksCount,
        hoursThisWeek,
        hoursThisMonth,
        allocatedToday,
        allocatedThisWeek,
        estimatedHours,
        workedHours,
        overdueTasks,
        tasksToday,
        myTickets: 0,
        openTickets: 0,
        unresolvedTickets: 0,
        normalEstimatedHours,
        normalWorkedHours,
        normalAllocatedThisWeek,
        normalHoursThisWeek,
        hobbyEstimatedHours,
        hobbyWorkedHours,
        hobbyAllocatedThisWeek,
        hobbyHoursThisWeek,
      });

      if (internalTicketsEnabled) {
        const ticketsResponse = await fetch(
          `${getApiUrl()}/api/tickets/my-tickets`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (ticketsResponse.ok) {
          const ticketsData = await ticketsResponse.json();
          const tickets = ticketsData.tickets || [];
          
          const openTickets = tickets.filter((t: any) => t.Status === 'Open').length;
          const activeTickets = tickets.filter((t: any) => 
            t.Status !== 'Resolved' && 
            t.Status !== 'Closed' && 
            t.Status !== 'Waiting Response'
          ).length;
          
          setSummaryStats(prev => ({
            ...prev,
            myTickets: tickets.length,
            openTickets,
            unresolvedTickets: activeTickets,
          }));
        }
      }
    } catch (err) {
      console.error('Failed to load summary stats:', err);
    } finally {
      setOverviewLoading(false);
    }
  };

  const getKpiTemplate = (type: DashboardKpiType) => KPI_TEMPLATES.find((template) => template.type === type);

  const getWidgetDisplayTitle = (widget: DashboardKpiWidget) => {
    if (widget.title && widget.title.trim().length > 0) {
      return widget.title.trim();
    }

    const template = getKpiTemplate(widget.type);
    if (!template) {
      return 'KPI';
    }

    const statusLabel = widget.organizationId && widget.statusValueId
      ? (kpiMetadata.statusesByOrganization[String(widget.organizationId)] || []).find((item) => Number(item.Id) === Number(widget.statusValueId))?.StatusName
      : null;
    const priorityLabel = widget.organizationId && widget.priorityValueId
      ? (kpiMetadata.prioritiesByOrganization[String(widget.organizationId)] || []).find((item) => Number(item.Id) === Number(widget.priorityValueId))?.PriorityName
      : null;
    const tagLabel = widget.organizationId && widget.tagId
      ? (kpiMetadata.tagsByOrganization[String(widget.organizationId)] || []).find((item) => Number(item.Id) === Number(widget.tagId))?.Name
      : null;

    if (widget.type === 'tasksByStatus' && statusLabel) {
      return `${statusLabel} Tasks`;
    }

    if (widget.type === 'tasksByPriority' && priorityLabel) {
      return `${priorityLabel} Tasks`;
    }

    if (widget.type === 'tasksByTag' && tagLabel) {
      return `${tagLabel} Tasks`;
    }

    if (
      (widget.type === 'organizationProjects' ||
        widget.type === 'organizationTasks' ||
        widget.type === 'organizationPendingTasks' ||
        widget.type === 'organizationCompletedTasks' ||
        widget.type === 'tasksFiltered' ||
        widget.type === 'overdueTasksFiltered' ||
        widget.type === 'blockedTasksFiltered' ||
        widget.type === 'unestimatedTasksFiltered' ||
        widget.type === 'reopenedTasksFiltered' ||
        widget.type === 'throughputThisWeek' ||
        widget.type === 'throughputThisMonth' ||
        widget.type === 'cycleTimeMedianDays' ||
        widget.type === 'leadTimeMedianDays' ||
        widget.type === 'ticketsSlaRisk') &&
      widget.organizationId
    ) {
      const org = kpiMetadata.organizations.find((item) => Number(item.Id) === Number(widget.organizationId));
      if (org) {
        const filters = [statusLabel, priorityLabel, tagLabel].filter(Boolean);
        if (filters.length > 0) {
          return `${org.Name} - ${template.defaultTitle} (${filters.join(' • ')})`;
        }
        return `${org.Name} - ${template.defaultTitle}`;
      }
    }

    return template.defaultTitle;
  };

  const loadKpiValues = useCallback(async (widgets: DashboardKpiWidget[]) => {
    if (!token) {
      return;
    }

    try {
      const response = await getDashboardKpiValues(token, widgets);
      setKpiDetailsByWidget(response.detailsByWidget || {});

      const derivedValues: Record<string, DashboardKpiMetricValue> = {};

      widgets.forEach((widget) => {
        const details = response.detailsByWidget?.[widget.id];
        const fallback = response.values?.[widget.id] || { value: 0 };

        if (!details) {
          derivedValues[widget.id] = fallback;
          return;
        }

        if (widget.type === 'hoursThisWeek' || widget.type === 'hoursThisMonth') {
          const totalHours = details.items.reduce((sum, item) => sum + Number(item.hours || 0), 0);
          derivedValues[widget.id] = {
            value: totalHours,
            suffix: 'h',
            subtitle: widget.type === 'hoursThisWeek' ? fallback.subtitle : undefined,
          };
          return;
        }

        if (widget.type === 'myTickets') {
          const activeCount = details.items.filter((item) => !item.isClosed).length;
          derivedValues[widget.id] = {
            value: details.items.length,
            subtitle: activeCount > 0 ? `${activeCount} active` : undefined,
          };
          return;
        }

        derivedValues[widget.id] = fallback;
      });

      setKpiValues(derivedValues);
    } catch (error) {
      console.error('Failed to load KPI values:', error);
      showToast({ type: 'error', message: 'Failed to load KPI values' });
    }
  }, [token, showToast]);

  const loadKpiConfig = useCallback(async () => {
    if (!token || isCustomerUser) {
      return;
    }

    setKpiSectionLoading(true);
    try {
      const response = await getDashboardKpis(token);
      setKpiMetadata(response.metadata);

      let widgets = response.hasCustomConfig
        ? response.widgets
        : getDefaultKpiWidgets(internalTicketsEnabled);

      if (!internalTicketsEnabled) {
        widgets = widgets.filter((widget) => widget.type !== 'myTickets');
      }

      setKpiWidgets(widgets);
      await loadKpiValues(widgets);
      void loadKpiAvailableReports();
      setKpiConfigLoaded(true);
    } catch (error) {
      console.error('Failed to load KPI config:', error);
      showToast({ type: 'error', message: 'Failed to load dashboard KPI configuration' });
      setKpiConfigLoaded(true);
    } finally {
      setKpiSectionLoading(false);
    }
  }, [token, isCustomerUser, internalTicketsEnabled, loadKpiValues, showToast]);

  const handleAddWidget = () => {
    if (!kpiAddType) {
      return;
    }

    const template = getKpiTemplate(kpiAddType);
    if (!template) {
      return;
    }

    const firstOrganizationId = kpiMetadata.organizations[0]?.Id;
    const statuses = firstOrganizationId ? (kpiMetadata.statusesByOrganization[String(firstOrganizationId)] || []) : [];
    const priorities = firstOrganizationId ? (kpiMetadata.prioritiesByOrganization[String(firstOrganizationId)] || []) : [];
    const tags = firstOrganizationId ? (kpiMetadata.tagsByOrganization[String(firstOrganizationId)] || []) : [];

    const newWidget: DashboardKpiWidget = {
      id: buildWidgetId(kpiAddType),
      type: kpiAddType,
      title: template.defaultTitle,
      organizationId: template.requiresOrganization ? (firstOrganizationId || null) : null,
      statusValueId: template.requiresStatus ? (statuses[0]?.Id || null) : null,
      priorityValueId: template.requiresPriority ? (priorities[0]?.Id || null) : null,
      tagId: template.requiresTag ? (tags[0]?.Id || null) : null,
      reportId: null,
      reportAggFunc: null,
      reportAggField: null,
    };

    setKpiWidgets((prev) => [...prev, newWidget]);
    setKpiAddType('');
  };

  const handleRemoveWidget = (widgetId: string) => {
    setKpiWidgets((prev) => prev.filter((widget) => widget.id !== widgetId));
  };

  const handleWidgetFieldChange = (widgetId: string, updates: Partial<DashboardKpiWidget>) => {
    setKpiWidgets((prev) => prev.map((widget) => (widget.id === widgetId ? { ...widget, ...updates } : widget)));
  };

  const handleKpiDragStart = (widgetId: string) => {
    setDraggingWidgetId(widgetId);
  };

  const handleKpiDrop = (targetWidgetId: string) => {
    if (!draggingWidgetId || draggingWidgetId === targetWidgetId) {
      setDraggingWidgetId(null);
      return;
    }

    setKpiWidgets((prev) => {
      const sourceIndex = prev.findIndex((widget) => widget.id === draggingWidgetId);
      const targetIndex = prev.findIndex((widget) => widget.id === targetWidgetId);
      if (sourceIndex === -1 || targetIndex === -1) {
        return prev;
      }

      const reordered = [...prev];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      return reordered;
    });

    setDraggingWidgetId(null);
  };

  const handleCancelKpiEdit = async () => {
    setKpiEditMode(false);
    await loadKpiConfig();
  };

  const handleSaveKpis = async () => {
    if (!token) {
      return;
    }

    setKpiSaving(true);
    try {
      const savedWidgets = await saveDashboardKpis(token, kpiWidgets);
      setKpiWidgets(savedWidgets);
      await loadKpiValues(savedWidgets);
      setKpiEditMode(false);
      showToast({ type: 'success', message: 'Dashboard KPIs updated' });
    } catch (error) {
      console.error('Failed to save dashboard KPIs:', error);
      showToast({ type: 'error', message: 'Failed to save dashboard KPIs' });
    } finally {
      setKpiSaving(false);
    }
  };

  const loadGlobalStats = async (period: AnalyticsPeriod = 'thisMonth') => {
    if (!user?.isAdmin) return;
    
    try {
      setAnalyticsLoading(true);
      const params = new URLSearchParams();
      const range = getPeriodRange(period);
      if (!range) {
        params.set('period', 'allTime');
      } else {
        params.set('dateFrom', range.from);
        params.set('dateTo', range.to);
      }
      const response = await fetch(
        `${getApiUrl()}/api/statistics/global?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setGlobalStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to load global stats:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadPendingApprovals = async () => {
    if (!token || !user || isCustomerUser) {
      setPendingApprovals({
        timeEntries: 0,
        vacations: 0,
        expenses: 0,
        canApproveTime: false,
        canApproveVacations: false,
        canApproveExpenses: false,
      });
      return;
    }

    try {
      const [timeScopeRes, vacationScopeRes, flagsRes, expenseScopeRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/time-entries/approval-scope`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/vacations/approval-scope`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/expenses/approval-scope`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      const canApproveTime = timeScopeRes.ok ? !!(await timeScopeRes.json())?.canApprove : false;
      const canApproveVacations = vacationScopeRes.ok ? !!(await vacationScopeRes.json())?.canApprove : false;
      const flags = flagsRes.ok ? await flagsRes.json() : {};
      const expensesModuleEnabled = flags.expensesEnabled === true;
      const expenseScope = expenseScopeRes.ok ? await expenseScopeRes.json() : {};
      const canApproveExpenses = expensesModuleEnabled && (!!expenseScope?.canApprove || !!user.isAdmin);
      const effectiveCanApproveTime = canApproveTime || !!user.isAdmin;
      const effectiveCanApproveVacations = canApproveVacations || !!user.isAdmin;

      const [timeCount, vacationCount, expenseCount] = await Promise.all([
        effectiveCanApproveTime
          ? fetch(`${getApiUrl()}/api/time-entries/pending-approval/team?status=pending`, {
              headers: { 'Authorization': `Bearer ${token}` },
            })
              .then(async (response) => {
                if (!response.ok) return 0;
                const data = await response.json();
                return Array.isArray(data.entries) ? data.entries.length : 0;
              })
              .catch(() => 0)
          : Promise.resolve(0),
        effectiveCanApproveVacations
          ? fetch(`${getApiUrl()}/api/vacations/pending`, {
              headers: { 'Authorization': `Bearer ${token}` },
            })
              .then(async (response) => {
                if (!response.ok) return 0;
                const data = await response.json();
                return Array.isArray(data.requests) ? data.requests.length : 0;
              })
              .catch(() => 0)
          : Promise.resolve(0),
        canApproveExpenses
          ? fetch(`${getApiUrl()}/api/expenses?approvalStatus=pending`, {
              headers: { 'Authorization': `Bearer ${token}` },
            })
              .then(async (response) => {
                if (!response.ok) return 0;
                const data = await response.json();
                return Array.isArray(data.data) ? data.data.length : 0;
              })
              .catch(() => 0)
          : Promise.resolve(0),
      ]);

      setPendingApprovals({
        timeEntries: timeCount,
        vacations: vacationCount,
        expenses: expenseCount,
        canApproveTime: effectiveCanApproveTime,
        canApproveVacations: effectiveCanApproveVacations,
        canApproveExpenses,
      });
    } catch (err) {
      console.error('Failed to load pending approvals:', err);
      setPendingApprovals({
        timeEntries: 0,
        vacations: 0,
        expenses: 0,
        canApproveTime: false,
        canApproveVacations: false,
        canApproveExpenses: false,
      });
    }
  };

  const loadTimeEntries = async (): Promise<TimeEntry[]> => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/time-entries/my-entries`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const entries = data.entries || [];
        setTimeEntries(entries);
        return entries;
      }
    } catch (err) {
      console.error('Failed to load time entries:', err);
    }
    return [];
  };

  const loadMyTasks = async (): Promise<TaskWithProject[]> => {
    try {
      // Get all tasks assigned to current user across all projects
      const response = await fetch(
        `${getApiUrl()}/api/tasks/my-tasks`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const tasks = data.tasks || [];
        setMyTasks(tasks);
        return tasks;
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
    return [];
  };

  const loadCallRecords = async () => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/call-records`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setCallRecords(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load call records:', err);
    }
  };

  const loadTaskAllocations = async (): Promise<TaskAllocationForCalendar[]> => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/task-allocations/my-allocations`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        const allocations = data.allocations || [];
        setTaskAllocations(allocations);
        return allocations;
      }
    } catch (err) {
      console.error('Failed to load task allocations:', err);
    }
    return [];
  };

  const loadRecurringAllocations = async () => {
    if (!user) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/recurring-allocations/occurrences/user/${user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setRecurringAllocations(data.occurrences || []);
      }
    } catch (err) {
      console.error('Failed to load recurring allocations:', err);
    }
  };

  const loadCalendarData = async () => {
    setCalendarLoading(true);
    try {
      await Promise.all([
        loadMyTasks(),
        loadTimeEntries(),
        loadCallRecords(),
        loadTaskAllocations(),
        loadRecurringAllocations(),
      ]);
    } finally {
      setCalendarLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !token || !featureFlagsLoaded || !isCustomerUser) return;
    void loadPortalData();
  }, [user, token, featureFlagsLoaded, isCustomerUser]);

  useEffect(() => {
    if (!user || !token || !featureFlagsLoaded || isCustomerUser) return;

    loadUserProfile();
    loadSummaryStats();
    loadPendingApprovals();
    loadKpiConfig();
  }, [user, token, featureFlagsLoaded, isCustomerUser, internalTicketsEnabled, loadKpiConfig]);

  useEffect(() => {
    if (!token || isCustomerUser || !kpiConfigLoaded || kpiEditMode) {
      return;
    }

    loadKpiValues(kpiWidgets);
  }, [token, isCustomerUser, kpiConfigLoaded, kpiEditMode, kpiWidgets, loadKpiValues]);

  useEffect(() => {
    if (!user || !token || !featureFlagsLoaded || isCustomerUser || !user.isAdmin) return;
    if (activeTab !== 'analytics') return;

    loadGlobalStats(analyticsPeriod);
  }, [user, token, featureFlagsLoaded, isCustomerUser, activeTab, analyticsPeriod]);

  useEffect(() => {
    if (!user || !token || !featureFlagsLoaded || isCustomerUser) return;
    const shouldLoadCalendar = activeTab === 'calendar' || (showCalendarInOverview && activeTab === 'overview');
    if (!shouldLoadCalendar) return;

    loadCalendarData();
  }, [user, token, featureFlagsLoaded, isCustomerUser, activeTab, showCalendarInOverview]);

  useEffect(() => {
    if (!user || !token || !featureFlagsLoaded || isCustomerUser) return;
    if (activeTab !== 'kanban') return;

    const loadKanbanTasks = async () => {
      setKanbanLoading(true);
      try {
        await loadMyTasks();
      } finally {
        setKanbanLoading(false);
      }
    };

    loadKanbanTasks();
  }, [user, token, featureFlagsLoaded, isCustomerUser, activeTab]);
  
  if (isLoading) {
    return (
      <div className="w-full py-6">
        <div className="rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] p-8 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--pm-accent)]" />
          <p className="mt-4 text-[var(--pm-muted)]">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {isCustomerUser ? (
        <main className="min-h-0 flex-1 overflow-y-auto max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 w-full">
          <div className="px-4 py-6 sm:px-0 space-y-4">
            <InstallAppPrompt />
            {portalLoading ? (
              <div className="space-y-5 animate-pulse">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-24" />
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-40" />
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-72" />
              </div>
            ) : portalError ? (
              <EmptyState
                icon={<AlertTriangle size={40} strokeWidth={1.5} className="text-[var(--pm-muted)] opacity-70" aria-hidden />}
                title="Unable to load portal data"
                message={portalError}
                primaryAction={{ label: 'Retry', onClick: loadPortalData }}
              />
            ) : portalData ? (
              <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{portalData.customer.Name}</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                      {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                      {portalData.customer.ContactPerson && <span>{portalData.customer.ContactPerson}</span>}
                      {portalData.customer.ContactEmail && (
                        <a href={`mailto:${portalData.customer.ContactEmail}`} className="hover:text-blue-600">
                          {portalData.customer.ContactEmail}
                        </a>
                      )}
                      {portalData.customer.Phone && <span>{portalData.customer.Phone}</span>}
                      {portalData.customer.Website && (
                        <a href={portalData.customer.Website} target="_blank" rel="noreferrer" className="hover:text-blue-600">
                          Website
                        </a>
                      )}
                    </div>
                  </div>
                  {internalTicketsEnabled && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => router.push('/tickets')}
                        className="h-10 px-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        All tickets
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push('/tickets?new=1')}
                        className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        New Ticket
                      </button>
                    </div>
                  )}
                </div>

                {internalTicketsEnabled && (
                  <>
                    {Number(portalData.stats.waiting) > 0 ? (
                      <div className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                          <div>
                            <h2 className="text-lg font-semibold text-amber-950 dark:text-amber-100">
                              Needs your attention
                            </h2>
                            <p className="text-sm text-amber-800/90 dark:text-amber-200/80 mt-1">
                              {Number(portalData.stats.waiting)} ticket{Number(portalData.stats.waiting) === 1 ? '' : 's'} waiting for a customer response.
                              Reply or update these so support can continue.
                            </p>
                          </div>
                        </div>
                        <ul className="space-y-2">
                          {(portalData.attentionTickets || []).map((ticket) => (
                            <li key={ticket.Id}>
                              <button
                                type="button"
                                onClick={() => router.push(`/tickets/${ticket.Id}`)}
                                className="w-full text-left rounded-md border border-amber-200/80 dark:border-amber-800/50 bg-white/80 dark:bg-gray-900/50 px-3 py-3 hover:bg-white dark:hover:bg-gray-900 transition-colors"
                              >
                                <div className="flex flex-wrap items-center gap-2 justify-between">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono text-xs text-gray-500">{formatTicketRef(ticket)}</span>
                                      <span className="font-medium text-gray-900 dark:text-white line-clamp-1">{ticket.Title}</span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                      <span
                                        className="px-2 py-0.5 rounded-full font-medium"
                                        style={pillStyle(ticket.StatusColor || '#f59e0b', { alpha: '22' })}
                                      >
                                        {ticket.StatusName}
                                      </span>
                                      {ticket.PriorityName && (
                                        <span
                                          className="px-2 py-0.5 rounded-full font-medium"
                                          style={pillStyle(ticket.PriorityColor || '#888888', { alpha: '22' })}
                                        >
                                          {ticket.PriorityName}
                                        </span>
                                      )}
                                      <span>Opened by {formatTicketCreatorLabel(ticket)}</span>
                                    </div>
                                  </div>
                                  <span className="text-xs text-gray-400 shrink-0">
                                    Updated{' '}
                                    {new Date(ticket.UpdatedAt).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })}
                                  </span>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
                        No tickets are waiting for your response right now.
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {[
                        { label: 'Total', value: portalData.stats.total, color: 'text-gray-900 dark:text-white', bg: 'bg-white dark:bg-gray-800', href: '/tickets' },
                        { label: 'Open', value: portalData.stats.open, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', href: '/tickets' },
                        { label: 'In Progress', value: portalData.stats.inProgress, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/30', href: '/tickets' },
                        {
                          label: 'Needs you',
                          value: portalData.stats.waiting,
                          color: 'text-amber-700 dark:text-amber-300',
                          bg: 'bg-amber-50 dark:bg-amber-900/30',
                          href: '/tickets',
                        },
                        { label: 'Resolved', value: portalData.stats.closed, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30', href: '/tickets' },
                        { label: 'Urgent', value: portalData.stats.urgent, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30', href: '/tickets' },
                      ].map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => router.push(s.href)}
                          className={`${s.bg} rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-left hover:ring-2 hover:ring-blue-500/30 transition`}
                        >
                          <div className={`text-2xl font-bold ${s.color}`}>{Number(s.value)}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</div>
                        </button>
                      ))}
                    </div>

                    {(portalData.recentActivity || []).length > 0 && (
                      <div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent updates</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Latest ticket activity (excluding items that already need your reply). Full list is on Tickets.
                            </p>
                          </div>
                          <a
                            href="/tickets"
                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                          >
                            View all
                          </a>
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                          {portalData.recentActivity.map((ticket) => (
                            <button
                              key={ticket.Id}
                              type="button"
                              onClick={() => router.push(`/tickets/${ticket.Id}`)}
                              className="w-full flex flex-wrap items-center gap-2 justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                            >
                              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-gray-400">{formatTicketRef(ticket)}</span>
                                <span className="font-medium text-gray-900 dark:text-white line-clamp-1">{ticket.Title}</span>
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                                  style={pillStyle(ticket.StatusColor || '#888888', { alpha: '22' })}
                                >
                                  {ticket.StatusName}
                                </span>
                              </div>
                              <span className="text-xs text-gray-400 shrink-0">
                                {new Date(ticket.UpdatedAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {Number(portalData.stats.total) === 0 && (
                      <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                        <p className="text-gray-500 dark:text-gray-400 mb-4">No tickets yet for your account.</p>
                        <button
                          type="button"
                          onClick={() => router.push('/tickets?new=1')}
                          className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
                        >
                          New Ticket
                        </button>
                      </div>
                    )}
                  </>
                )}

                {portalData.projects.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Your projects</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {portalData.projects.map((project) => {
                        const pct =
                          project.TotalTasks > 0
                            ? Math.round((Number(project.CompletedTasks) / Number(project.TotalTasks)) * 100)
                            : 0;
                        return (
                          <div
                            key={project.Id}
                            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium text-gray-900 dark:text-white leading-tight">
                                {project.ProjectName}
                              </div>
                              {project.StatusLabel && (
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                                  style={pillStyle(project.StatusColor || '#888888', { alpha: '22' })}
                                >
                                  {project.StatusLabel}
                                </span>
                              )}
                            </div>
                            {project.Description && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                {project.Description}
                              </p>
                            )}
                            <div className="mt-3">
                              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                <span>
                                  {Number(project.CompletedTasks)} / {Number(project.TotalTasks)} tasks done
                                </span>
                                <span>{pct}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                            {(project.StartDate || project.EndDate) && (
                              <div className="text-xs text-gray-400 mt-2">
                                {project.StartDate ? String(project.StartDate).split('T')[0] : '?'} —{' '}
                                {project.EndDate ? String(project.EndDate).split('T')[0] : '?'}
                              </div>
                            )}
                            <div className="text-xs text-gray-400 mt-1">{project.OrganizationName}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </main>
      ) : (
        /* Regular user view — chrome outside scroll (same as project detail) */
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <PageStickyChrome>
            {kpiEditMode && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <select
                  value={kpiAddType}
                  onChange={(e) => setKpiAddType(e.target.value as DashboardKpiType | '')}
                  className="h-8 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-2 text-sm text-[var(--pm-text)]"
                >
                  <option value="">Select KPI</option>
                  {selectableKpiTemplates.map((template) => (
                    <option key={template.type} value={template.type}>{template.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddWidget}
                  className="h-8 rounded-md bg-[var(--pm-accent)] px-3 text-sm font-semibold text-[var(--pm-accent-fg)] disabled:opacity-50"
                  disabled={!kpiAddType}
                >
                  Add KPI
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="shrink-0 sm:max-w-[14rem]">
                <h1 className="text-xl font-semibold leading-tight text-[var(--pm-text)]">Dashboard</h1>
                <p className="text-xs leading-snug text-[var(--pm-muted)] sm:text-sm">
                  {new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {showPendingApprovalAlert && (
                    <div className="rounded-md border border-[var(--pm-warn)]/40 bg-[var(--pm-warn)]/15 px-2 py-1.5 text-[var(--pm-text)]">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pm-warn)]">
                        Approval Required
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {pendingApprovals.timeEntries > 0 && pendingApprovals.canApproveTime && (
                          <button
                            type="button"
                            onClick={() => router.push('/approvals?tab=time')}
                            className="rounded bg-[var(--pm-surface-2)] px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-[var(--pm-accent)] hover:text-[var(--pm-bg)]"
                            title="Open time entries approval"
                          >
                            {pendingApprovals.timeEntries} time entr
                            {pendingApprovals.timeEntries === 1 ? 'y' : 'ies'}
                          </button>
                        )}
                        {pendingApprovals.vacations > 0 && pendingApprovals.canApproveVacations && (
                          <button
                            type="button"
                            onClick={() => router.push('/approvals?tab=vacations')}
                            className="rounded bg-[var(--pm-surface-2)] px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-[var(--pm-accent)] hover:text-[var(--pm-bg)]"
                            title="Open vacations approval"
                          >
                            {pendingApprovals.vacations} vacation
                            {pendingApprovals.vacations === 1 ? '' : 's'}
                          </button>
                        )}
                        {pendingApprovals.expenses > 0 && pendingApprovals.canApproveExpenses && (
                          <button
                            type="button"
                            onClick={() => router.push('/approvals?tab=expenses')}
                            className="rounded bg-[var(--pm-surface-2)] px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-[var(--pm-accent)] hover:text-[var(--pm-bg)]"
                            title="Open expenses approval"
                          >
                            {pendingApprovals.expenses} expense
                            {pendingApprovals.expenses === 1 ? '' : 's'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {summaryStats.overdueTasks > 0 && (
                    <div className="rounded-md border border-[var(--pm-danger)]/40 bg-[var(--pm-danger)]/15 px-2 py-1 text-xs font-medium text-[var(--pm-danger)]">
                      {summaryStats.overdueTasks} overdue task
                      {summaryStats.overdueTasks > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                {kpiSectionLoading ? (
                  <div className="flex items-stretch gap-2">
                    {Array.from({ length: internalTicketsEnabled ? 5 : 4 }).map((_, idx) => (
                      <div key={`kpi-card-skeleton-${idx}`} className="h-14 min-w-0 flex-1 animate-pulse rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)]" />
                    ))}
                    <div className="h-14 w-9 shrink-0 animate-pulse rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)]" />
                  </div>
                ) : (
                  <div className="flex items-stretch gap-2 overflow-x-auto">
                    {kpiWidgets.length === 0 ? (
                      <div className="flex min-h-14 min-w-0 flex-1 items-center justify-center rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 text-center text-sm text-[var(--pm-muted)]">
                        No KPI cards configured.
                      </div>
                    ) : (
                      <>
                        {kpiWidgets.map((widget) => {
                      const template = getKpiTemplate(widget.type);
                      const KpiIcon = template?.icon;
                      const valueData = kpiValues[widget.id] || { value: 0 };
                      const numericValue = Number(valueData.value || 0);
                      const formattedValue = valueData.suffix === 'h' ? decimalHoursToHMS(numericValue) : numericValue.toLocaleString();
                      const statusOptions = widget.organizationId ? (kpiMetadata.statusesByOrganization[String(widget.organizationId)] || []) : [];
                      const priorityOptions = widget.organizationId ? (kpiMetadata.prioritiesByOrganization[String(widget.organizationId)] || []) : [];
                      const tagOptions = widget.organizationId ? (kpiMetadata.tagsByOrganization[String(widget.organizationId)] || []) : [];

                      return (
                        <div
                          key={widget.id}
                          draggable={kpiEditMode}
                          onDragStart={() => handleKpiDragStart(widget.id)}
                          onDragOver={(e) => {
                            if (kpiEditMode) e.preventDefault();
                          }}
                          onDrop={() => handleKpiDrop(widget.id)}
                          onClick={() => !kpiEditMode && openKpiDetailModal(widget)}
                          className={`min-w-[7.5rem] flex-1 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] px-2.5 py-1.5 border-l-4 kpi-widget-border ${template?.borderClass || 'border-gray-400'} ${kpiEditMode ? 'cursor-move' : 'cursor-pointer hover:bg-[var(--pm-surface-2)] transition-colors'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[11px] leading-tight text-[var(--pm-muted)]">{getWidgetDisplayTitle(widget)}</p>
                              <p className="mt-0.5 text-lg font-bold leading-none text-[var(--pm-text)]">{formattedValue}{valueData.suffix || ''}</p>
                              {valueData.subtitle && (
                                <p className="mt-0.5 truncate text-[10px] text-gray-500 dark:text-gray-400">{valueData.subtitle}</p>
                              )}
                            </div>
                            <div className="shrink-0 text-[var(--pm-muted)] opacity-70">
                              {KpiIcon ? (
                                <KpiIcon size={18} strokeWidth={1.75} aria-hidden />
                              ) : (
                                <Pin size={18} strokeWidth={1.75} aria-hidden />
                              )}
                            </div>
                          </div>

                          {kpiEditMode && (
                            <div className="mt-4 space-y-2">
                              <div className="grid grid-cols-1 gap-2">
                                <input
                                  type="text"
                                  value={widget.title || ''}
                                  onChange={(e) => handleWidgetFieldChange(widget.id, { title: e.target.value })}
                                  onBlur={(e) => {
                                    if (!e.target.value.trim() && widget.type === 'reportKpi' && widget.reportId) {
                                      const reportName = kpiAvailableReports.find((r) => r.Id === widget.reportId)?.ReportName;
                                      if (reportName) handleWidgetFieldChange(widget.id, { title: reportName });
                                    }
                                  }}
                                  placeholder="Card title"
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />

                                {template?.requiresReport && (() => {
                                  const selectedReport = kpiAvailableReports.find((r) => r.Id === widget.reportId);
                                  const columns = selectedReport ? (REPORT_DATASOURCE_COLUMNS[selectedReport.DataSource] || []) : [];
                                  const needsField = widget.reportAggFunc && widget.reportAggFunc !== '';
                                  return (
                                    <>
                                      <SearchableSelect
                                        value={widget.reportId ?? ''}
                                        onChange={(v) => {
                                          const newReportId = v ? Number(v) : null;
                                          const reportName = kpiAvailableReports.find((r) => r.Id === newReportId)?.ReportName;
                                          handleWidgetFieldChange(widget.id, {
                                            reportId: newReportId,
                                            reportAggFunc: null,
                                            reportAggField: null,
                                            ...(reportName ? { title: reportName } : {}),
                                          });
                                        }}
                                        options={kpiAvailableReports.map((r) => ({ value: r.Id, label: r.ReportName }))}
                                        placeholder="Select report"
                                        emptyText="No report"
                                        dropdownMode="portal"
                                      />
                                      {!widget.reportId && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400">⚠ Select a report to activate this KPI</p>
                                      )}
                                      {widget.reportId && (
                                        <select
                                          value={widget.reportAggFunc || ''}
                                          onChange={(e) => handleWidgetFieldChange(widget.id, { reportAggFunc: e.target.value || null, reportAggField: null })}
                                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                          <option value="">Count rows (default)</option>
                                          <option value="sum">Sum of column…</option>
                                          <option value="avg">Average of column…</option>
                                          <option value="distinctCount">Distinct count of column…</option>
                                        </select>
                                      )}
                                      {widget.reportId && needsField && columns.length > 0 && (
                                        <select
                                          value={widget.reportAggField || ''}
                                          onChange={(e) => handleWidgetFieldChange(widget.id, { reportAggField: e.target.value || null })}
                                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                          <option value="">Select column…</option>
                                          {columns.map((col) => (
                                            <option key={col.key} value={col.key}>{col.label}</option>
                                          ))}
                                        </select>
                                      )}
                                      {widget.reportId && needsField && columns.length === 0 && (
                                        <input
                                          type="text"
                                          value={widget.reportAggField || ''}
                                          onChange={(e) => handleWidgetFieldChange(widget.id, { reportAggField: e.target.value || null })}
                                          placeholder="Column name"
                                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                      )}
                                    </>
                                  );
                                })()}

                                {template?.requiresOrganization && (
                                  <select
                                    value={widget.organizationId || ''}
                                    onChange={(e) => {
                                      const nextOrgId = e.target.value ? Number(e.target.value) : null;
                                      const nextStatuses = nextOrgId ? (kpiMetadata.statusesByOrganization[String(nextOrgId)] || []) : [];
                                      const nextPriorities = nextOrgId ? (kpiMetadata.prioritiesByOrganization[String(nextOrgId)] || []) : [];
                                      const nextTags = nextOrgId ? (kpiMetadata.tagsByOrganization[String(nextOrgId)] || []) : [];
                                      handleWidgetFieldChange(widget.id, {
                                        organizationId: nextOrgId,
                                        statusValueId: template.requiresStatus ? (nextStatuses[0]?.Id || null) : null,
                                        priorityValueId: template.requiresPriority ? (nextPriorities[0]?.Id || null) : null,
                                        tagId: template.requiresTag ? (nextTags[0]?.Id || null) : null,
                                      });
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                  >
                                    <option value="">Select organization</option>
                                    {kpiMetadata.organizations.map((org) => (
                                      <option key={org.Id} value={org.Id}>{org.Name}</option>
                                    ))}
                                  </select>
                                )}

                                {(template?.requiresStatus || template?.supportsOptionalTaskFilters) && (
                                  <select
                                    value={widget.statusValueId || ''}
                                    onChange={(e) => handleWidgetFieldChange(widget.id, { statusValueId: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                  >
                                    <option value="">{template?.requiresStatus ? 'Select status' : 'Any status'}</option>
                                    {statusOptions.map((status) => (
                                      <option key={status.Id} value={status.Id}>{status.StatusName}</option>
                                    ))}
                                  </select>
                                )}

                                {(template?.requiresPriority || template?.supportsOptionalTaskFilters) && (
                                  <select
                                    value={widget.priorityValueId || ''}
                                    onChange={(e) => handleWidgetFieldChange(widget.id, { priorityValueId: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                  >
                                    <option value="">{template?.requiresPriority ? 'Select priority' : 'Any priority'}</option>
                                    {priorityOptions.map((priority) => (
                                      <option key={priority.Id} value={priority.Id}>{priority.PriorityName}</option>
                                    ))}
                                  </select>
                                )}

                                {(template?.requiresTag || template?.supportsOptionalTaskFilters) && (
                                  <select
                                    value={widget.tagId || ''}
                                    onChange={(e) => handleWidgetFieldChange(widget.id, { tagId: e.target.value ? Number(e.target.value) : null })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                  >
                                    <option value="">{template?.requiresTag ? 'Select tag' : 'Any tag'}</option>
                                    {tagOptions.map((tag) => (
                                      <option key={tag.Id} value={tag.Id}>{tag.Name}</option>
                                    ))}
                                  </select>
                                )}
                              </div>

                              <div className="flex justify-end">
                                <button
                                  onClick={() => handleRemoveWidget(widget.id)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {kpiEditMode ? (
                  <div className="flex w-9 shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      onClick={handleSaveKpis}
                      disabled={kpiSaving}
                      title={kpiSaving ? 'Saving…' : 'Save KPIs'}
                      aria-label={kpiSaving ? 'Saving KPIs' : 'Save KPIs'}
                      className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-[var(--pm-accent)]/50 bg-[var(--pm-accent)]/15 text-[var(--pm-accent-soft)] hover:bg-[var(--pm-accent)]/25 disabled:opacity-50"
                    >
                      <Check size={16} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelKpiEdit}
                      title="Cancel"
                      aria-label="Cancel KPI edit"
                      className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] text-[var(--pm-muted)] hover:bg-[var(--pm-surface-2)] hover:text-[var(--pm-text)]"
                    >
                      <X size={16} strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setKpiEditMode(true)}
                    title="Edit KPIs"
                    aria-label="Edit KPIs"
                    className="inline-flex w-9 shrink-0 items-center justify-center self-stretch rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] text-[var(--pm-muted)] hover:bg-[var(--pm-surface-2)] hover:text-[var(--pm-accent-soft)]"
                  >
                    <Pencil size={16} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            )}
              </div>
            </div>

          <PageTabs
            tabs={[
              { id: 'overview', label: 'Overview' },
              ...(!showCalendarInOverview ? [{ id: 'calendar', label: 'Calendar' }] : []),
              { id: 'kanban', label: 'Kanban' },
              ...(user?.isAdmin ? [{ id: 'analytics', label: 'Analytics' }] : []),
            ]}
            activeId={activeTab}
            onChange={(id) => {
              const next = id as typeof activeTab;
              setActiveTab(next);
              window.history.pushState(
                {},
                '',
                next === 'overview' ? '/dashboard' : `/dashboard?tab=${next}`
              );
            }}
          />
          </PageStickyChrome>

          <main ref={scrollContainerRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto pt-3">
            <InstallAppPrompt className="mb-4" />
            {/* Overview Tab */}
            {activeTab === 'overview' && (
            overviewLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] h-20" />
                <div className="rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] h-[520px]" />
              </div>
            ) : (
            <div className="space-y-6">

              {showCalendarInOverview ? (
                calendarLoading ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-20" />
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-[520px]" />
                  </div>
                ) : (
                  <CalendarTab
                    tasks={myTasks}
                    timeEntries={timeEntries}
                    callRecords={callRecords}
                    taskAllocations={taskAllocations}
                    recurringAllocations={recurringAllocations}
                    workStartTimes={workStartTimes}
                    lunchTime={lunchTime}
                    lunchDuration={lunchDuration}
                    token={token || ''}
                    onDataChanged={() => {
                      loadTimeEntries();
                      loadCallRecords();
                      loadTaskAllocations();
                      loadRecurringAllocations();
                      loadSummaryStats();
                    }}
                  />
                )
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                    <span className="text-2xl">📅</span> Today&apos;s Schedule
                  </h3>
                  {summaryStats.tasksToday.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500 dark:text-gray-400">No tasks scheduled for today</p>
                      <button
                        onClick={() => router.push(('/planning'))}
                        className="mt-3 text-blue-600 dark:text-blue-400 hover:underline text-sm"
                      >
                        Go to Planning →
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {summaryStats.tasksToday.map((task, idx) => (
                        <div 
                          key={idx}
                          className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col items-center text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-lg">
                              <span className="font-medium">{task.startTime || '—'}</span>
                              <span className="text-xs">to</span>
                              <span className="font-medium">{task.endTime || '—'}</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-gray-900 dark:text-white">{task.taskName}</h4>
                                {task.isHobby && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                    Hobby
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500 dark:text-gray-400">{task.projectName}</p>
                            </div>
                          </div>
                          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{decimalHoursToHMS(Number(task.hours))}</span>
                        </div>
                      ))}
                      <div className="pt-3 border-t dark:border-gray-700 flex justify-between items-center">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Total allocated today</span>
                        <span className="text-lg font-bold text-gray-900 dark:text-white">{decimalHoursToHMS(summaryStats.allocatedToday)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4">
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span className="text-lg">📋</span> My Pending Tasks
                    </h3>
                    <p className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      One list for all open tasks, filtered by planning type.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs font-medium text-gray-600 dark:text-gray-300">
                      {sortedPendingTasks.length} visible
                    </span>
                    <select
                      value={pendingSortBy}
                      onChange={(event) => setPendingSortBy(event.target.value as TaskSortOption)}
                      className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="dueDate">Sort: Due date</option>
                      <option value="priority">Sort: Priority</option>
                      <option value="project">Sort: Project</option>
                    </select>
                  </div>
                </div>

                <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-thin">
                  {[
                    { key: 'all' as const, label: 'All', count: pendingTasks.length },
                    { key: 'scheduled' as const, label: 'Scheduled', count: pendingTasks.length - unscheduledPendingTasks.length },
                    { key: 'unscheduled' as const, label: 'Unscheduled', count: unscheduledPendingTasks.length },
                  ].map((option) => {
                    const isActive = pendingWorkFilter === option.key;

                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                          setPendingWorkFilter(option.key);
                          setShowAllPendingTasks(false);
                        }}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                          isActive
                            ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span>{option.label}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                          isActive
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {option.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {sortedPendingTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400">
                      {pendingWorkFilter === 'unscheduled'
                        ? 'No unscheduled pending tasks.'
                        : pendingWorkFilter === 'scheduled'
                          ? 'No scheduled pending tasks.'
                          : '🎉 No pending tasks! Great job!'}
                    </p>
                  </div>
                ) : (
                  <>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {sortedPendingTasks.slice(0, (isPrintMode || showAllPendingTasks) ? sortedPendingTasks.length : 5).map((task) => {
                      const isOverdue = isTaskOverdue(task.DueDate ? String(task.DueDate) : null);
                      const isUnscheduled = Number(task.UnscheduledWork || 0) === 1;

                      return (
                        <div
                          key={task.Id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openTaskDetails(task)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openTaskDetails(task);
                            }
                          }}
                          className={`px-2.5 py-1.5 sm:px-3 sm:py-2 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 ${
                            isOverdue ? 'bg-red-50/80 dark:bg-red-900/10' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <h4 className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                              {task.TaskName}
                            </h4>
                            <div className="hidden sm:flex shrink-0 items-center gap-2.5">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openTaskDetails(task);
                                }}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                              >
                                Task Details
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  router.push(`/projects/${task.ProjectId}`);
                                }}
                                className="text-xs text-gray-600 dark:text-gray-300 hover:underline whitespace-nowrap"
                              >
                                Go to Project →
                              </button>
                            </div>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
                            {!!task.IsHobby && (
                              <span className="rounded px-1.5 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                Hobby
                              </span>
                            )}
                            <span className={`rounded px-1.5 py-0.5 font-medium ${
                              isUnscheduled
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                            }`}>
                              {isUnscheduled ? 'Unscheduled' : 'Scheduled'}
                            </span>
                            {isOverdue && (
                              <span className="rounded px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-medium">
                                Overdue
                              </span>
                            )}
                            <span className="min-w-0 truncate text-gray-600 dark:text-gray-300">
                              {task.ProjectName || 'No project'}
                              {(task.CustomerName || task.ProjectCustomerName) && (
                                <span className="text-blue-500">
                                  {' '}• {task.CustomerName || task.ProjectCustomerName}
                                </span>
                              )}
                            </span>
                            {!!task.TaskTags?.length && task.TaskTags.map((tag) => (
                              <SegmentedTagBadge
                                key={`${task.Id}-${tag.Id}`}
                                name={tag.Name}
                                color={tag.Color}
                                size="xs"
                              />
                            ))}
                            <span
                              className="inline-flex items-center rounded px-1.5 py-0.5 font-medium"
                              style={pillStyle(task.PriorityColor, { alpha: '20' })}
                            >
                              {task.PriorityName || 'Normal'}
                            </span>
                            <span
                              className="inline-flex items-center rounded px-1.5 py-0.5 font-medium"
                              style={pillStyle(task.StatusColor, { alpha: '20' })}
                            >
                              {task.StatusName || 'Unknown'}
                            </span>
                            {task.DueDate && (
                              <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                                📅 {new Date(task.DueDate).toLocaleDateString()}
                              </span>
                            )}
                            {typeof task.EstimatedHours === 'number' && (
                              <span className="hidden sm:inline">⏱️ {task.EstimatedHours}h estimated</span>
                            )}
                            {typeof task.PlannedHours === 'number' && task.PlannedHours > 0 && (
                              <span className="hidden sm:inline">🗓️ {task.PlannedHours}h planned</span>
                            )}
                            {typeof task.WorkedHours === 'number' && task.WorkedHours > 0 && (
                              <span className="hidden sm:inline">✅ {task.WorkedHours}h worked</span>
                            )}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                router.push(`/projects/${task.ProjectId}`);
                              }}
                              className="sm:hidden text-gray-600 dark:text-gray-300"
                            >
                              Project →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {!isPrintMode && sortedPendingTasks.length > 5 && (
                    <div className="text-center pt-2">
                      <button
                        onClick={() => setShowAllPendingTasks((previous) => !previous)}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                      >
                        {showAllPendingTasks
                          ? 'Show less tasks'
                          : `View all ${sortedPendingTasks.length} tasks →`}
                      </button>
                    </div>
                  )}
                  </>
                )}
              </div>

              {/* Work Progress — full width (Quick Actions removed) */}
              <div className="rounded-lg border border-gray-200 bg-white p-3 shadow dark:border-gray-700 dark:bg-gray-800 sm:p-4">
                <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">📈 Work Progress</h3>

                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    { label: 'Allocated today', value: decimalHoursToHMS(summaryStats.allocatedToday) },
                    { label: 'Worked this week', value: decimalHoursToHMS(summaryStats.hoursThisWeek) },
                    { label: 'Worked this month', value: decimalHoursToHMS(summaryStats.hoursThisMonth) },
                    {
                      label: 'Remaining (work)',
                      value: decimalHoursToHMS(
                        Math.max(0, summaryStats.normalEstimatedHours - summaryStats.normalWorkedHours)
                      ),
                    },
                    { label: 'My pending', value: String(pendingTasks.length) },
                    {
                      label: 'Overdue',
                      value: String(summaryStats.overdueTasks),
                      warn: summaryStats.overdueTasks > 0,
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className={`rounded-md border px-2.5 py-2 ${
                        stat.warn
                          ? 'border-red-300/60 bg-red-50 dark:border-red-700/50 dark:bg-red-900/15'
                          : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40'
                      }`}
                    >
                      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {stat.label}
                      </p>
                      <p
                        className={`mt-0.5 text-sm font-semibold tabular-nums ${
                          stat.warn ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Overall vs estimate
                    </h4>

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">💼 Work Projects</span>
                        <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                          {decimalHoursToHMS(summaryStats.normalWorkedHours)} /{' '}
                          {decimalHoursToHMS(summaryStats.normalEstimatedHours)}
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          className={`h-2.5 rounded-full transition-all ${
                            summaryStats.normalEstimatedHours > 0 &&
                            summaryStats.normalWorkedHours > summaryStats.normalEstimatedHours
                              ? 'bg-red-500'
                              : 'bg-green-500'
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              summaryStats.normalEstimatedHours > 0
                                ? (summaryStats.normalWorkedHours / summaryStats.normalEstimatedHours) * 100
                                : 0
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {summaryStats.normalEstimatedHours > 0
                          ? `${Math.round(
                              (summaryStats.normalWorkedHours / summaryStats.normalEstimatedHours) * 100
                            )}% of estimated hours`
                          : 'No estimated hours set'}
                        {summaryStats.normalWorkedHours > summaryStats.normalEstimatedHours &&
                          summaryStats.normalEstimatedHours > 0 && (
                            <span className="text-red-500">
                              {' '}
                              · {decimalHoursToHMS(
                                summaryStats.normalWorkedHours - summaryStats.normalEstimatedHours
                              )}{' '}
                              over
                            </span>
                          )}
                      </p>
                    </div>

                    {(summaryStats.hobbyEstimatedHours > 0 || summaryStats.hobbyWorkedHours > 0) && (
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-600 dark:text-gray-400">🎮 Hobby Projects</span>
                          <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                            {decimalHoursToHMS(summaryStats.hobbyWorkedHours)} /{' '}
                            {decimalHoursToHMS(summaryStats.hobbyEstimatedHours)}
                          </span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className={`h-2.5 rounded-full transition-all ${
                              summaryStats.hobbyEstimatedHours > 0 &&
                              summaryStats.hobbyWorkedHours > summaryStats.hobbyEstimatedHours
                                ? 'bg-red-500'
                                : 'bg-purple-500'
                            }`}
                            style={{
                              width: `${Math.min(
                                100,
                                summaryStats.hobbyEstimatedHours > 0
                                  ? (summaryStats.hobbyWorkedHours / summaryStats.hobbyEstimatedHours) * 100
                                  : 0
                              )}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {summaryStats.hobbyEstimatedHours > 0
                            ? `${Math.round(
                                (summaryStats.hobbyWorkedHours / summaryStats.hobbyEstimatedHours) * 100
                              )}% of estimated hours`
                            : 'No estimated hours set'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      This week vs allocated
                    </h4>

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-600 dark:text-gray-400">💼 Work</span>
                        <span className="text-xs font-medium tabular-nums text-gray-900 dark:text-white">
                          {decimalHoursToHMS(summaryStats.normalHoursThisWeek)} /{' '}
                          {decimalHoursToHMS(summaryStats.normalAllocatedThisWeek)}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          className="h-2 rounded-full bg-blue-500 transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              summaryStats.normalAllocatedThisWeek > 0
                                ? (summaryStats.normalHoursThisWeek / summaryStats.normalAllocatedThisWeek) * 100
                                : 0
                            )}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {summaryStats.normalAllocatedThisWeek > 0
                          ? `${Math.round(
                              (summaryStats.normalHoursThisWeek / summaryStats.normalAllocatedThisWeek) * 100
                            )}% of planned allocation`
                          : 'No work allocation this week'}
                      </p>
                    </div>

                    {(summaryStats.hobbyAllocatedThisWeek > 0 || summaryStats.hobbyHoursThisWeek > 0) && (
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-600 dark:text-gray-400">🎮 Hobby</span>
                          <span className="text-xs font-medium tabular-nums text-gray-900 dark:text-white">
                            {decimalHoursToHMS(summaryStats.hobbyHoursThisWeek)} /{' '}
                            {decimalHoursToHMS(summaryStats.hobbyAllocatedThisWeek)}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className="h-2 rounded-full bg-purple-500 transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                summaryStats.hobbyAllocatedThisWeek > 0
                                  ? (summaryStats.hobbyHoursThisWeek / summaryStats.hobbyAllocatedThisWeek) * 100
                                  : 0
                              )}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {summaryStats.hobbyAllocatedThisWeek > 0
                            ? `${Math.round(
                                (summaryStats.hobbyHoursThisWeek / summaryStats.hobbyAllocatedThisWeek) * 100
                              )}% of planned allocation`
                            : 'No hobby allocation this week'}
                        </p>
                      </div>
                    )}

                    <div className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
                      <div className="flex justify-between gap-2">
                        <span>Allocated this week (all)</span>
                        <span className="font-medium tabular-nums text-gray-900 dark:text-white">
                          {decimalHoursToHMS(summaryStats.allocatedThisWeek)}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between gap-2">
                        <span>Unscheduled pending</span>
                        <span className="font-medium tabular-nums text-gray-900 dark:text-white">
                          {unscheduledPendingTasks.length}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-between gap-2">
                        <span>My tasks (open)</span>
                        <span className="font-medium tabular-nums text-gray-900 dark:text-white">
                          {summaryStats.myTasks}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )
          )}

          {/* Calendar Tab */}
          {!showCalendarInOverview && activeTab === 'calendar' && (
            calendarLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-20" />
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-[520px]" />
              </div>
            ) : (
              <CalendarTab
                tasks={myTasks}
                timeEntries={timeEntries}
                callRecords={callRecords}
                taskAllocations={taskAllocations}
                recurringAllocations={recurringAllocations}
                workStartTimes={workStartTimes}
                lunchTime={lunchTime}
                lunchDuration={lunchDuration}
                token={token || ''}
                onDataChanged={() => {
                  loadTimeEntries();
                  loadCallRecords();
                  loadTaskAllocations();
                  loadRecurringAllocations();
                  loadSummaryStats();
                }}
              />
            )
          )}

          {activeTab === 'kanban' && (
            <AssignedKanbanTab
              tasks={myTasks}
              userId={Number(user?.id || 0)}
              canManage={Boolean(permissions?.canManageTasks || permissions?.canAssignTasks || user?.isAdmin)}
              isLoading={kanbanLoading}
              token={token || ''}
              onOpenTask={openTaskDetails}
              onTasksRefresh={loadMyTasks}
              onError={(message) => showToast({ type: 'error', message })}
            />
          )}

              {/* Analytics Tab - Admin Only */}
              {activeTab === 'analytics' && user?.isAdmin && (
            <div className="space-y-4">
              {/* Compact filter bar — Synapse chrome (no purple banner) */}
              <div className="flex flex-col gap-2 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-[var(--pm-text)]">Analytics</h2>
                  <p className="truncate text-xs text-[var(--pm-muted)]">
                    {selectedAnalyticsRange
                      ? `${selectedAnalyticsRange.from} → ${selectedAnalyticsRange.to}`
                      : 'All time'}
                    <span className="text-[var(--pm-muted)]/80"> · global KPIs</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    { key: 'thisWeek', label: 'This Week' },
                    { key: 'lastWeek', label: 'Last Week' },
                    { key: 'thisMonth', label: 'This Month' },
                    { key: 'lastMonth', label: 'Last Month' },
                    { key: 'allTime', label: 'All Time' },
                  ] as { key: AnalyticsPeriod; label: string }[]).map((period) => (
                    <button
                      key={period.key}
                      type="button"
                      onClick={() => setAnalyticsPeriod(period.key)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                        analyticsPeriod === period.key
                          ? 'border-[var(--pm-accent)] bg-[var(--pm-accent)]/15 text-[var(--pm-accent-soft)]'
                          : 'border-[var(--pm-border)] bg-[var(--pm-surface)] text-[var(--pm-muted)] hover:bg-[var(--pm-surface-2)] hover:text-[var(--pm-text)]'
                      }`}
                    >
                      {period.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => loadGlobalStats(analyticsPeriod)}
                    title="Refresh"
                    aria-label="Refresh analytics"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] text-[var(--pm-muted)] hover:bg-[var(--pm-surface-2)] hover:text-[var(--pm-text)]"
                  >
                    <RefreshCw size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>

              {analyticsLoading ? (
                <div className="space-y-4 animate-pulse">
                  <div className={`grid grid-cols-2 md:grid-cols-4 ${internalTicketsEnabled ? 'lg:grid-cols-8' : 'lg:grid-cols-7'} gap-4`}>
                    {Array.from({ length: internalTicketsEnabled ? 8 : 7 }).map((_, idx) => (
                      <div key={`analytics-kpi-skeleton-${idx}`} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 h-24" />
                    ))}
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-72" />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-72" />
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-72" />
                  </div>
                </div>
              ) : !globalStats ? (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
                  <p className="text-gray-500 dark:text-gray-400">Loading analytics data...</p>
                </div>
              ) : (
                <>
                  {/* Main KPIs Grid */}
                  <div className={`grid grid-cols-2 md:grid-cols-4 ${internalTicketsEnabled ? 'lg:grid-cols-8' : 'lg:grid-cols-7'} gap-4`}>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-indigo-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Organizations</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{globalStats.organizations.total}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-teal-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Customers</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{globalStats.customers.total}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-cyan-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Users</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{globalStats.users.total}</p>
                      <div className="flex gap-2 mt-1 text-xs">
                        <span className="text-purple-500">{globalStats.users.admins} admin</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-blue-500">{globalStats.users.regular} regular</span>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-blue-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Projects</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{globalStats.projects.total}</p>
                      <div className="flex gap-2 mt-1 text-xs">
                        <span className="text-green-500">{globalStats.projects.active} active</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-500">{globalStats.projects.completed} done</span>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-green-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tasks</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{globalStats.tasks.total}</p>
                      <div className="flex gap-2 mt-1 text-xs">
                        <span className="text-green-500">{globalStats.tasks.completed} done</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-blue-500">{globalStats.tasks.inProgress} active</span>
                      </div>
                    </div>
                    {internalTicketsEnabled && (
                      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-indigo-500">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tickets</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{globalStats.tickets?.total || 0}</p>
                        <div className="flex gap-2 mt-1 text-xs">
                          <span className="text-green-500">{globalStats.tickets?.resolved || 0} resolved</span>
                          <span className="text-gray-400">•</span>
                          <span className="text-indigo-500">{globalStats.tickets?.unresolvedCount || 0} unresolved</span>
                        </div>
                      </div>
                    )}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-red-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Overdue</p>
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{globalStats.tasks.overdue}</p>
                      <p className="text-xs text-red-500 mt-1">tasks past due date</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-orange-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Unplanned</p>
                      <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">{globalStats.tasks.unplanned}</p>
                      <p className="text-xs text-orange-500 mt-1">tasks not allocated</p>
                    </div>
                  </div>

                  {globalStats.taskAnalytics && (
                    <TaskAnalyticsCharts data={globalStats.taskAnalytics} />
                  )}

                  {internalTicketsEnabled && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">🎫 Tickets Overview</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Open</p>
                          <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">{globalStats.tickets?.open || 0}</p>
                        </div>
                        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800">
                          <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium uppercase tracking-wide">In Progress</p>
                          <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100 mt-1">{globalStats.tickets?.inProgress || 0}</p>
                        </div>
                        <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
                          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium uppercase tracking-wide">Waiting Response</p>
                          <p className="text-2xl font-bold text-orange-900 dark:text-orange-100 mt-1">{globalStats.tickets?.waitingResponse || 0}</p>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                          <p className="text-xs text-green-600 dark:text-green-400 font-medium uppercase tracking-wide">Resolved</p>
                          <p className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">{globalStats.tickets?.resolved || 0}</p>
                        </div>
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/20 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                          <p className="text-xs text-gray-600 dark:text-gray-400 font-medium uppercase tracking-wide">Closed</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{globalStats.tickets?.closed || 0}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Hours Overview */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">⏱️ Hours Overview</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                        <p className="text-xs text-purple-600 dark:text-purple-400 font-medium uppercase tracking-wide">Total Estimated</p>
                        <div className="flex items-baseline gap-2 mt-2">
                          <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">{decimalHoursToHMS(globalStats.hours.totalEstimated)}</p>
                          <p className="text-sm text-purple-700 dark:text-purple-300">+ {decimalHoursToHMS(globalStats.hours.totalEstimatedHobby)} hobby</p>
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                        <p className="text-xs text-green-600 dark:text-green-400 font-medium uppercase tracking-wide">Total Worked</p>
                        <div className="flex items-baseline gap-2 mt-2">
                          <p className="text-3xl font-bold text-green-900 dark:text-green-100">{decimalHoursToHMS(globalStats.hours.totalWorked)}</p>
                          <p className="text-sm text-green-700 dark:text-green-300">+ {decimalHoursToHMS(globalStats.hours.totalWorkedHobby)} hobby</p>
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">This Week</p>
                        <div className="flex items-baseline gap-2 mt-2">
                          <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">{decimalHoursToHMS(globalStats.hours.thisWeek)}</p>
                          <p className="text-sm text-blue-700 dark:text-blue-300">+ {decimalHoursToHMS(globalStats.hours.thisWeekHobby)} hobby</p>
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                        <p className="text-xs text-orange-600 dark:text-orange-400 font-medium uppercase tracking-wide">{getPeriodLabel(analyticsPeriod)}</p>
                        <div className="flex items-baseline gap-2 mt-2">
                          <p className="text-3xl font-bold text-orange-900 dark:text-orange-100">{decimalHoursToHMS(globalStats.hours.thisMonth)}</p>
                          <p className="text-sm text-orange-700 dark:text-orange-300">+ {decimalHoursToHMS(globalStats.hours.thisMonthHobby)} hobby</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="mt-6 pt-4 border-t dark:border-gray-700">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Global Progress</span>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {decimalHoursToHMS(globalStats.hours.totalWorked)} / {decimalHoursToHMS(globalStats.hours.totalEstimated)}
                            {globalStats.hours.totalEstimated > 0 && (
                              <span className="ml-2 text-gray-500">
                                ({Math.round((globalStats.hours.totalWorked / globalStats.hours.totalEstimated) * 100)}%)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Hobby: {decimalHoursToHMS(globalStats.hours.totalWorkedHobby)} / {decimalHoursToHMS(globalStats.hours.totalEstimatedHobby)}
                            {globalStats.hours.totalEstimatedHobby > 0 && (
                              <span className="ml-1">
                                ({Math.round((globalStats.hours.totalWorkedHobby / globalStats.hours.totalEstimatedHobby) * 100)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                        <div 
                          className={`h-4 rounded-full transition-all ${
                            globalStats.hours.totalEstimated > 0 && globalStats.hours.totalWorked > globalStats.hours.totalEstimated
                              ? 'bg-red-500'
                              : 'bg-gradient-to-r from-blue-500 to-purple-500'
                          }`}
                          style={{ 
                            width: `${Math.min(100, globalStats.hours.totalEstimated > 0 ? (globalStats.hours.totalWorked / globalStats.hours.totalEstimated) * 100 : 0)}%` 
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{globalStats.tasks.completed} of {globalStats.tasks.total} tasks completed</span>
                        <div className="text-right">
                          <div>
                            {globalStats.hours.totalEstimated > globalStats.hours.totalWorked 
                              ? `${decimalHoursToHMS(globalStats.hours.totalEstimated - globalStats.hours.totalWorked)} remaining`
                              : globalStats.hours.totalWorked > globalStats.hours.totalEstimated && globalStats.hours.totalEstimated > 0
                                ? `${decimalHoursToHMS(globalStats.hours.totalWorked - globalStats.hours.totalEstimated)} over estimate`
                                : ''}
                          </div>
                          <div className="text-gray-400">
                            {globalStats.hours.totalEstimatedHobby > globalStats.hours.totalWorkedHobby 
                              ? `${decimalHoursToHMS(globalStats.hours.totalEstimatedHobby - globalStats.hours.totalWorkedHobby)} hobby remaining`
                              : globalStats.hours.totalWorkedHobby > globalStats.hours.totalEstimatedHobby && globalStats.hours.totalEstimatedHobby > 0
                                ? `${decimalHoursToHMS(globalStats.hours.totalWorkedHobby - globalStats.hours.totalEstimatedHobby)} hobby over estimate`
                                : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Projects & Contributors */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Projects */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <span>🏆</span> Top Projects {getPeriodLabel(analyticsPeriod)}
                      </h3>
                      {globalStats.topProjects.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No hours logged in selected period</p>
                      ) : (
                        <div className="space-y-4">
                          {globalStats.topProjects.map((project, idx) => (
                            <div key={project.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                  idx === 0 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                  idx === 1 ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
                                  idx === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                  'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                }`}>{idx + 1}</span>
                                <div>
                                  <p className="font-medium text-gray-900 dark:text-white">{project.name}</p>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">{project.organization}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{decimalHoursToHMS(project.hours)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Top Contributors */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <span>👥</span> Top Contributors {getPeriodLabel(analyticsPeriod)}
                      </h3>
                      {globalStats.topUsers.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No hours logged in selected period</p>
                      ) : (
                        <div className="space-y-4">
                          {globalStats.topUsers.map((u, idx) => (
                            <div key={u.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                  idx === 0 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                  idx === 1 ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
                                  idx === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                  'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                }`}>{idx + 1}</span>
                                <p className="font-medium text-gray-900 dark:text-white">{u.name}</p>
                              </div>
                              <div className="text-right">
                                <span className="text-lg font-bold text-green-600 dark:text-green-400">{decimalHoursToHMS(u.hours)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Task Status Distribution */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">📋 Task Distribution</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">{globalStats.tasks.total}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Tasks</p>
                      </div>
                      <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400">{globalStats.tasks.completed}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Completed</p>
                        {globalStats.tasks.total > 0 && (
                          <p className="text-xs text-green-500 mt-1">
                            {Math.round((globalStats.tasks.completed / globalStats.tasks.total) * 100)}%
                          </p>
                        )}
                      </div>
                      <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{globalStats.tasks.inProgress}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">In Progress</p>
                        {globalStats.tasks.total > 0 && (
                          <p className="text-xs text-blue-500 mt-1">
                            {Math.round((globalStats.tasks.inProgress / globalStats.tasks.total) * 100)}%
                          </p>
                        )}
                      </div>
                      <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <p className="text-3xl font-bold text-red-600 dark:text-red-400">{globalStats.tasks.overdue}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Overdue</p>
                        {globalStats.tasks.total > 0 && (
                          <p className="text-xs text-red-500 mt-1">
                            {Math.round((globalStats.tasks.overdue / globalStats.tasks.total) * 100)}%
                          </p>
                        )}
                      </div>
                      <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                        <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{globalStats.tasks.unplanned}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Unplanned</p>
                        {globalStats.tasks.total > 0 && (
                          <p className="text-xs text-orange-500 mt-1">
                            {Math.round((globalStats.tasks.unplanned / globalStats.tasks.total) * 100)}%
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Executive Summary Cards */}
                  <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900/30 dark:to-slate-800/30 rounded-lg shadow p-6 border border-slate-200 dark:border-slate-700">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400 mb-4">Executive Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest font-medium mb-2">Active Projects</p>
                        <p className="text-3xl font-bold text-slate-900 dark:text-white">{globalStats.projects.active}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">of {globalStats.projects.total} total</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest font-medium mb-2">Active Users</p>
                        <p className="text-3xl font-bold text-slate-900 dark:text-white">{globalStats.users.total}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{Math.round((globalStats.users.total - globalStats.users.admins) / Math.max(globalStats.users.total, 1) * 100)}% team members</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest font-medium mb-2">Completion</p>
                        <p className="text-3xl font-bold text-slate-900 dark:text-white">
                          {globalStats.tasks.total > 0 ? Math.round((globalStats.tasks.completed / globalStats.tasks.total) * 100) : 0}%
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{globalStats.tasks.completed}/{globalStats.tasks.total} tasks</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest font-medium mb-2">Estimated Capacity</p>
                        <p className="text-3xl font-bold text-slate-900 dark:text-white">{decimalHoursToHMS(globalStats.hours.totalEstimated)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{decimalHoursToHMS(globalStats.hours.totalWorked)} completed</p>
                      </div>
                    </div>
                  </div>

                  {/* Performance Metrics */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Execution Performance */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-4">Execution Performance</h3>
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-baseline justify-between mb-2">
                            <span className="text-sm text-gray-700 dark:text-gray-300">Task Completion Rate</span>
                            <span className="text-lg font-bold text-gray-900 dark:text-white">
                              {globalStats.tasks.total > 0 ? Math.round((globalStats.tasks.completed / globalStats.tasks.total) * 100) : 0}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                            <div
                              className="h-3 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                              style={{
                                width: `${Math.min(100, globalStats.tasks.total > 0 ? (globalStats.tasks.completed / globalStats.tasks.total) * 100 : 0)}%`,
                              }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-baseline justify-between mb-2">
                            <span className="text-sm text-gray-700 dark:text-gray-300">Effort Velocity</span>
                            <span className="text-lg font-bold text-gray-900 dark:text-white">
                              {(globalStats.hours.totalWorked / Math.max(globalStats.hours.totalEstimated, 1) * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                            <div
                              className={`h-3 rounded-full bg-gradient-to-r ${
                                globalStats.hours.totalWorked > globalStats.hours.totalEstimated
                                  ? 'from-orange-500 to-red-500'
                                  : 'from-blue-500 to-indigo-500'
                              }`}
                              style={{
                                width: `${Math.min(100, (globalStats.hours.totalWorked / Math.max(globalStats.hours.totalEstimated, 1)) * 100)}%`,
                              }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {globalStats.hours.totalWorked > globalStats.hours.totalEstimated
                              ? `${decimalHoursToHMS(globalStats.hours.totalWorked - globalStats.hours.totalEstimated)} over estimate`
                              : `${decimalHoursToHMS(globalStats.hours.totalEstimated - globalStats.hours.totalWorked)} under estimate`}
                          </p>
                        </div>

                        <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-400">Tasks In Progress</span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                              {globalStats.tasks.inProgress}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-400">Completed This Period</span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300">
                              {globalStats.tasks.completed}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Risk & Capacity Assessment */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-4">Risk & Capacity</h3>
                      <div className="space-y-4">
                        {globalStats.tasks.overdue > 0 && (
                          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="text-2xl">⚠️</div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-red-900 dark:text-red-300">Overdue Risk</p>
                                <p className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">{globalStats.tasks.overdue}</p>
                                <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                                  {((globalStats.tasks.overdue / Math.max(globalStats.tasks.total, 1)) * 100).toFixed(0)}% of active tasks
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {globalStats.tasks.unplanned > 0 && (
                          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="text-2xl">📋</div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">Allocation Gap</p>
                                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">{globalStats.tasks.unplanned}</p>
                                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                  {((globalStats.tasks.unplanned / Math.max(globalStats.tasks.total, 1)) * 100).toFixed(0)}% need planning
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {globalStats.tasks.overdue === 0 && globalStats.tasks.unplanned === 0 && (
                          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="text-2xl">✅</div>
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">Status: Healthy</p>
                                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                                  No overdue tasks or allocation gaps detected
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-3">Team Capacity</p>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600 dark:text-gray-400">Weekly Avg</span>
                              <span className="font-semibold text-gray-900 dark:text-white">{decimalHoursToHMS(globalStats.hours.thisWeek / 7)}/day</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600 dark:text-gray-400">{getPeriodLabel(analyticsPeriod)} Total</span>
                              <span className="font-semibold text-gray-900 dark:text-white">{decimalHoursToHMS(globalStats.hours.thisMonth)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resource Distribution & Utilization */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-4">Project & Resource Focus</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Top Projects Contribution */}
                      <div>
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-4">Hours by Project</p>
                        {globalStats.topProjects.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No hours logged in period</p>
                        ) : (
                          <div className="space-y-3">
                            {globalStats.topProjects.map((project, idx) => (
                              <div key={project.id}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                      idx === 0 ? 'bg-yellow-500' :
                                      idx === 1 ? 'bg-gray-400' :
                                      idx === 2 ? 'bg-orange-500' :
                                      'bg-gray-400/50'
                                    }`}>{idx + 1}</span>
                                    <div className="min-w-0">
                                      <p className="font-medium text-gray-900 dark:text-white truncate text-sm">{project.name}</p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">{project.organization}</p>
                                    </div>
                                  </div>
                                  <span className="font-bold text-gray-900 dark:text-white text-sm whitespace-nowrap ml-2">{decimalHoursToHMS(project.hours)}</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                  <div
                                    className="h-2 rounded-full bg-gradient-to-r from-slate-600 to-slate-400"
                                    style={{
                                      width: `${Math.max(5, (project.hours / Math.max(...globalStats.topProjects.map(p => p.hours), 1)) * 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Top Contributors Distribution */}
                      <div>
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-4">Team Effort</p>
                        {globalStats.topUsers.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No hours logged</p>
                        ) : (
                          <div className="space-y-3">
                            {globalStats.topUsers.map((user, idx) => (
                              <div key={user.id}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                      idx === 0 ? 'bg-yellow-500' :
                                      idx === 1 ? 'bg-gray-400' :
                                      idx === 2 ? 'bg-orange-500' :
                                      'bg-gray-400/50'
                                    }`}>{idx + 1}</span>
                                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{user.name}</p>
                                  </div>
                                  <span className="font-bold text-gray-900 dark:text-white text-sm whitespace-nowrap ml-2">{decimalHoursToHMS(user.hours)}</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                  <div
                                    className="h-2 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400"
                                    style={{
                                      width: `${Math.max(5, (user.hours / Math.max(...globalStats.topUsers.map(u => u.hours), 1)) * 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Period Summary */}
                  <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/10 dark:to-blue-900/10 rounded-lg shadow p-6 border border-indigo-200 dark:border-indigo-800">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-900 dark:text-indigo-300 mb-4">Period Summary {getPeriodLabel(analyticsPeriod)}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                        <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Tasks Completed</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{globalStats.tasks.completed}</p>
                      </div>
                      <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                        <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Hours Worked</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{decimalHoursToHMS(globalStats.hours.thisMonth)}</p>
                      </div>
                      <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                        <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Active Projects</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{globalStats.projects.active}</p>
                      </div>
                      <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                        <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Team Members</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{globalStats.users.total}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          </main>
        </div>
      )}

      <ConfirmAlertModal
        isOpen={!!modalMessage}
        type={modalMessage?.type || 'confirm'}
        title={modalMessage?.title || ''}
        message={modalMessage?.message || ''}
        onClose={closeModal}
        onConfirm={handleModalConfirm}
        confirmLabel="Delete"
        confirmVariant="danger"
      />

      {showTaskDetailsModal && detailsTask && detailsProject && (
        <TaskDetailModal
          projectId={detailsProject.Id}
          organizationId={detailsProject.OrganizationId}
          task={detailsTask}
          project={detailsProject}
          tasks={detailsProjectTasks}
          onOpenTask={(targetTask) => {
            openTaskDetails(targetTask);
          }}
          onClose={() => {
            setShowTaskDetailsModal(false);
            setDetailsTask(null);
          }}
          onSaved={async () => {
            await loadSummaryStats();
            if (detailsTask) {
              await openTaskDetails(detailsTask);
            }
          }}
          token={token || ''}
          // jiraIntegration prop removed; now handled internally in modal
        />
      )}

      {kpiDetailModal.show && kpiDetailModal.widget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  Details - {getWidgetDisplayTitle(kpiDetailModal.widget)}
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {getKpiDetailTypeLabel()} • {kpiDetailModal.items.length} item{kpiDetailModal.items.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeKpiDetailModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {kpiDetailModal.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : kpiDetailModal.items.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  No items found for this KPI.
                </div>
              ) : kpiDetailModal.type === 'reportRows' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                      <tr>
                        {Object.keys(kpiDetailModal.items[0].rawRow ?? {}).map((col) => (
                          <th key={col} className="px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap border-b border-gray-200 dark:border-gray-700">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {kpiDetailModal.items.map((item, rowIdx) => (
                        <tr key={rowIdx} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          {Object.values(item.rawRow ?? {}).map((val, colIdx) => (
                            <td key={colIdx} className="px-3 py-2 text-gray-900 dark:text-white whitespace-nowrap">
                              {String(val ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {kpiDetailModal.items.map((item) => {
                    const actionLabel = getKpiDetailItemActionLabel();
                    const isClickable = !!actionLabel;

                    return (
                      <button
                        key={`${kpiDetailModal.type}-${item.id}-${item.taskId || 0}-${item.projectId || 0}`}
                        type="button"
                        onClick={() => {
                          if (isClickable) {
                            handleKpiDetailItemOpen(item);
                          }
                        }}
                        className={`w-full text-left p-3 bg-gray-50 dark:bg-gray-700/50 rounded transition-colors border border-transparent ${
                          isClickable
                            ? 'hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-200 dark:hover:border-gray-600 cursor-pointer'
                            : 'cursor-default'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 dark:text-white text-sm truncate">{item.name}</div>
                            {(item.project || item.customer) && (
                              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                                {item.project ? <span>{item.project}</span> : null}
                                {item.project && item.customer ? <span> • </span> : null}
                                {item.customer ? <span>{item.customer}</span> : null}
                              </div>
                            )}
                            {item.status && (
                              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                Status: {item.status}
                              </div>
                            )}
                            {kpiDetailModal.type === 'tasks' && Array.isArray(item.tags) && item.tags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {item.tags.map((tag) => (
                                  <SegmentedTagBadge
                                    key={`${item.id}-${tag.name}`}
                                    name={tag.name}
                                    color={tag.color}
                                    size="xs"
                                  />
                                ))}
                              </div>
                            )}
                            {(item.date || typeof item.hours === 'number') && (
                              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                {item.date ? <span>{item.date}</span> : null}
                                {item.date && typeof item.hours === 'number' ? <span> • </span> : null}
                                {typeof item.hours === 'number' ? <span>{item.hours.toFixed(2)}h</span> : null}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {kpiDetailModal.type === 'tickets' && item.status && (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${item.isClosed ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                {item.status}
                              </span>
                            )}
                            {kpiDetailModal.type === 'tasks' && item.status && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                {item.status}
                              </span>
                            )}
                            {actionLabel && (
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                {actionLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 p-6 flex justify-end">
              <button
                type="button"
                onClick={closeKpiDetailModal}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ScrollToTopButton scrollContainerRef={isCustomerUser ? undefined : scrollContainerRef} />
    </div>
  );
}
