'use client';

import React, { useEffect, useRef, useState } from 'react';
import { tasksApi, Task, CreateTaskData, UpdateTaskData } from '@/lib/api/tasks';
import { Project } from '@/lib/api/projects';
import { StatusValue } from '@/lib/api/statusValues';
import { User } from '@/lib/api/users';
import { tagsApi } from '@/lib/api/tags';
import { getApiUrl } from '@/lib/api/config';
import { getAllGridPreferences, saveGridPreference } from '@/lib/api/gridPreferences';
import { isUnplannedLeafTask } from '@/lib/tasks/isUnplannedTask';
import { useAuth } from '@/contexts/AuthContext';
import { usePersistedFilters } from '@/hooks/usePersistedFilters';
import { SaveTemplateModal, ApplyTemplateModal } from '@/components/projects/tasks/TaskTemplateModals';
import {
  DEFAULT_PROJECT_TASK_FILTERS,
  mergeProjectTaskFilters,
} from '@/components/projects/tasks/projectTaskFilters';
import { TasksToolbar } from '@/components/projects/tasks/TasksToolbar';
import { TasksFilterPanel } from '@/components/projects/tasks/TasksFilterPanel';
import { TasksTable } from '@/components/projects/tasks/TasksTable';
import { TaskDragActionModal } from '@/components/projects/tasks/TaskDragActionModal';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export function TasksTab({
  tasks,
  project,
  jiraIntegration,
  taskStatuses,
  taskPriorities,
  taskTypes,
  organizationUsers,
  onCreateTask,
  onEditTask,
  onInlineSaveTask,
  onRefreshTasks,
  onDeleteTask,
  onImportClick,
  onImportFromJira,
  onImportFromJiraTicket,
  onImportFromOutlookQueue,
  hasOutlookQueueItems,
  onImportFromGitHub,
  onImportFromGitea,
  onCheckJiraTicketStatus,
  onCheckJiraBoardStatus,
  onError,
  internalTicketsEnabled: _internalTicketsEnabled,
  canCreate,
  canManage,
  canDelete,
  token,
}: {
  tasks: Task[];
  project: Project;
  jiraIntegration: any;
  taskStatuses: StatusValue[];
  taskPriorities: StatusValue[];
  taskTypes: StatusValue[];
  organizationUsers: User[];
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  onInlineSaveTask: (taskId: number, taskData: Partial<CreateTaskData>) => Promise<void>;
  onRefreshTasks: () => Promise<void>;
  onDeleteTask: (id: number) => void;
  onImportClick: () => void;
  onImportFromJira: () => void;
  onImportFromJiraTicket: () => void;
  onImportFromOutlookQueue: () => void;
  hasOutlookQueueItems: boolean;
  onImportFromGitHub: () => void;
  onImportFromGitea: () => void;
  onCheckJiraTicketStatus?: () => void;
  onCheckJiraBoardStatus?: () => void;
  onError?: (message: string) => void;
  internalTicketsEnabled: boolean;
  canCreate: boolean;
  canManage: boolean;
  canDelete: boolean;
  token: string;
}) {
  const { user } = useAuth();
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [showImportDropdown, setShowImportDropdown] = useState(false);
  const [showCheckStatusDropdown, setShowCheckStatusDropdown] = useState(false);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [showTemplateSaveModal, setShowTemplateSaveModal] = useState(false);
  const [showTemplateApplyModal, setShowTemplateApplyModal] = useState(false);
  const [taskFilters, setTaskFilters, resetTaskFilters] = usePersistedFilters(
    'project-tasks',
    DEFAULT_PROJECT_TASK_FILTERS,
    { userId: user?.id, scope: project.Id, merge: mergeProjectTaskFilters }
  );
  const {
    filterText,
    filterStatus,
    filterPriority,
    filterAssignee,
    filterTaskType,
    hideClosed,
    unplannedOnly,
    sortField,
    sortDirection,
    filterTagIds,
  } = taskFilters;
  const setFilterText = (value: string) => setTaskFilters({ filterText: value });
  const setFilterStatus = (value: number | undefined) => setTaskFilters({ filterStatus: value });
  const setFilterPriority = (value: number | undefined) => setTaskFilters({ filterPriority: value });
  const setFilterAssignee = (value: number | undefined) => setTaskFilters({ filterAssignee: value });
  const setFilterTaskType = (value: number | undefined) => setTaskFilters({ filterTaskType: value });
  const setHideClosed = (value: boolean) => setTaskFilters({ hideClosed: value });
  const setUnplannedOnly = (value: boolean) => setTaskFilters({ unplannedOnly: value });
  const setSortField = (value: string) => setTaskFilters({ sortField: value });
  const setSortDirection = (value: 'asc' | 'desc' | ((prev: 'asc' | 'desc') => 'asc' | 'desc')) =>
    setTaskFilters((prev) => ({
      ...prev,
      sortDirection: typeof value === 'function' ? value(prev.sortDirection) : value,
    }));
  const setFilterTagIds = (value: number[] | ((prev: number[]) => number[])) =>
    setTaskFilters((prev) => ({
      ...prev,
      filterTagIds: typeof value === 'function' ? value(prev.filterTagIds) : value,
    }));
  const [taskTagMap, setTaskTagMap] = useState<Map<number, Array<{ id: number; name: string; color: string }>>>(new Map());
  const [tagFilterOptions, setTagFilterOptions] = useState<Array<{ value: number; label: string; subtitle?: string }>>([]);
  const [editingRowTaskId, setEditingRowTaskId] = useState<number | null>(null);
  const [editingRowData, setEditingRowData] = useState<{
    taskName: string;
    assignedTo: number | null;
    taskType: number | null;
    status: number | null;
    priority: number | null;
    dueDate: string;
  }>({
    taskName: '',
    assignedTo: null,
    taskType: null,
    status: null,
    priority: null,
    dueDate: '',
  });
  const [isSavingInline, setIsSavingInline] = useState(false);
  const [creatingSubtaskParentId, setCreatingSubtaskParentId] = useState<number | null>(null);
  const [newSubtaskData, setNewSubtaskData] = useState<{
    taskName: string;
    assignedTo: number | null;
    taskType: number | null;
    status: number | null;
    priority: number | null;
    dueDate: string;
  }>({
    taskName: '',
    assignedTo: null,
    taskType: null,
    status: null,
    priority: null,
    dueDate: '',
  });
  const [isSavingSubtaskInline, setIsSavingSubtaskInline] = useState(false);
  const [newSubtaskInputResetKey, setNewSubtaskInputResetKey] = useState(0);
  const [creatingRootTaskInline, setCreatingRootTaskInline] = useState(false);
  const [newRootTaskData, setNewRootTaskData] = useState<{
    taskName: string;
    assignedTo: number | null;
    taskType: number | null;
    status: number | null;
    priority: number | null;
    dueDate: string;
  }>({
    taskName: '',
    assignedTo: null,
    taskType: null,
    status: null,
    priority: null,
    dueDate: '',
  });
  const [isSavingRootInline, setIsSavingRootInline] = useState(false);
  const [newRootTaskInputResetKey, setNewRootTaskInputResetKey] = useState(0);
  const tasksGridRef = useRef<HTMLDivElement>(null);
  const newRootTaskInputRef = useRef<HTMLInputElement>(null);
  const newSubtaskInputRef = useRef<HTMLInputElement>(null);
  const [showTaskColumnsPanel, setShowTaskColumnsPanel] = useState(false);
  const [taskColumnsPanelPosition, setTaskColumnsPanelPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [hiddenTaskColumns, setHiddenTaskColumns] = useState<string[]>([]);
  const [taskColumnOrder, setTaskColumnOrder] = useState<string[]>([]);
  const [taskColumnSizing, setTaskColumnSizing] = useState<Record<string, number>>({});
  const [taskColumnSizeMode, setTaskColumnSizeMode] = useState<Record<string, 'fixed' | 'grow'>>({});
  const [taskRowDensity, setTaskRowDensity] = useState<'compact' | 'comfortable'>('comfortable');
  const [taskColumnsReady, setTaskColumnsReady] = useState(false);
  const [taskDragColumnId, setTaskDragColumnId] = useState<string | null>(null);
  const [taskDragOverInfo, setTaskDragOverInfo] = useState<{ columnKey: string; side: 'left' | 'right' } | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [isApplyingBulkEdit, setIsApplyingBulkEdit] = useState(false);
  const [bulkEditError, setBulkEditError] = useState('');
  const [availableApplications, setAvailableApplications] = useState<Array<{ Id: number; Name: string }>>([]);
  const [bulkApplicationVersions, setBulkApplicationVersions] = useState<Array<{ Id: number; VersionNumber: string; VersionName: string | null; Status: string }>>([]);
  const [bulkEditData, setBulkEditData] = useState<{
    statusId: number | undefined;
    assignedToId: number | undefined;
    applicationId: number | undefined;
    releaseVersionId: number | undefined;
    parentTaskId: number | undefined;
  }>({
    statusId: undefined,
    assignedToId: undefined,
    applicationId: undefined,
    releaseVersionId: undefined,
    parentTaskId: undefined,
  });
  const [bulkTagIds, setBulkTagIds] = useState<number[]>([]);

  // Drag and drop states
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<number | null>(null);
  const [showDragDropActionModal, setShowDragDropActionModal] = useState(false);
  const [dragDropSourceTaskId, setDragDropSourceTaskId] = useState<number | null>(null);
  const [dragDropTargetTaskId, setDragDropTargetTaskId] = useState<number | null>(null);

  const additionalTaskColumnKeys = React.useMemo(() => {
    const excludedKeys = new Set<string>([
      'Id',
      'ProjectId',
      'ProjectName',
      'TaskName',
      'Description',
      'Status',
      'StatusName',
      'StatusColor',
      'StatusIsClosed',
      'StatusIsCancelled',
      'Priority',
      'PriorityName',
      'PriorityColor',
      'TaskType',
      'TaskTypeName',
      'TaskTypeColor',
      'AssignedTo',
      'AssigneeName',
      'Assignees',
      'DueDate',
      'ParentTaskId',
      'DisplayOrder',
    ]);

    const discoveredKeys = new Set<string>();

    for (const task of tasks) {
      const entry = task as unknown as Record<string, unknown>;
      for (const key of Object.keys(entry)) {
        if (excludedKeys.has(key)) continue;
        const value = entry[key];
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) continue;
        if (typeof value === 'object') continue;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            continue;
          }
        }
        discoveredKeys.add(key);
      }
    }

    return Array.from(discoveredKeys).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const formatAdditionalTaskColumnLabel = (rawKey: string) =>
    rawKey
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (value) => value.toUpperCase());

  const renderAdditionalTaskColumnValue = (task: Task, rawKey: string): string => {
    const record = task as unknown as Record<string, unknown>;
    const value = record[rawKey];
    if (value === null || value === undefined) return '-';

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

    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value !== 'string') return String(value);

    const trimmed = value.trim();
    if (!trimmed) return '-';

    const parsedDate = Date.parse(trimmed);
    if (Number.isFinite(parsedDate) && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return new Date(parsedDate).toLocaleDateString();
    }

    return trimmed;
  };

  const taskGridPreferenceKey = `project-tasks-local-columns-v1-${Number(project.Id)}`;
  const taskGridSessionKey = `task-grid-session-v1-${Number(project.Id)}`;

  const taskColumnOptions = React.useMemo(
    () => [
      { id: 'task-type', label: 'Task Type' },
      { id: 'task', label: 'Task' },
      { id: 'assigned-to', label: 'Assigned To' },
      { id: 'status', label: 'Status' },
      { id: 'priority', label: 'Priority' },
      { id: 'due-date', label: 'Due Date' },
      ...additionalTaskColumnKeys.map((columnKey) => ({ id: `extra-${columnKey}`, label: formatAdditionalTaskColumnLabel(columnKey) })),
    ],
    [additionalTaskColumnKeys]
  );

  const taskSelectableColumnIds = React.useMemo(
    () => taskColumnOptions.map((option) => option.id),
    [taskColumnOptions]
  );

  const taskDefaultHiddenColumns = React.useMemo(
    () => taskSelectableColumnIds.filter((columnId) => columnId.startsWith('extra-')),
    [taskSelectableColumnIds]
  );

  const isTaskColumnVisible = (columnId: string) => !hiddenTaskColumns.includes(columnId);

  const getTaskColumnCurrentWidth = (columnId: string) => {
    const grid = tasksGridRef.current;
    if (!grid) return 140;
    const table = grid.querySelector('table');
    if (!(table instanceof HTMLTableElement)) return 140;
    const headerCells = Array.from(table.querySelectorAll('thead th')) as HTMLTableCellElement[];
    const target = headerCells.find((cell) => cell.dataset.columnKey?.trim() === columnId);
    if (!target) return 140;
    const width = Math.round(target.getBoundingClientRect().width || 140);
    return Math.max(100, Math.min(1400, width));
  };

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let hasSessionCache = false;

    const loadTaskColumnsPreference = async () => {
      try {
        const cached = typeof window !== 'undefined' ? window.sessionStorage.getItem(taskGridSessionKey) : null;
        if (cached) {
          hasSessionCache = true;
          const parsed = JSON.parse(cached) as {
            columnOrder?: string[];
            hiddenColumns?: string[];
            columnSizing?: Record<string, number>;
            columnSizeMode?: Record<string, 'fixed' | 'grow'>;
            rowDensity?: 'compact' | 'comfortable';
          };
          const valid = new Set(taskSelectableColumnIds);

          const cachedOrder = Array.isArray(parsed.columnOrder)
            ? parsed.columnOrder.filter((columnId) => valid.has(columnId))
            : [];
          const missingCachedOrder = taskSelectableColumnIds.filter((columnId) => !cachedOrder.includes(columnId));
          const normalizedCachedOrder = cachedOrder.length > 0
            ? [...cachedOrder, ...missingCachedOrder]
            : taskSelectableColumnIds;
          if (!cancelled) {
            setTaskColumnOrder(normalizedCachedOrder);
          }

          const cachedHidden = Array.isArray(parsed.hiddenColumns)
            ? parsed.hiddenColumns.filter((columnId) => valid.has(columnId))
            : [];
          const cachedKnownColumns = new Set<string>([
            ...cachedOrder,
            ...cachedHidden,
          ]);
          const cachedDefaultHiddenColumns = taskDefaultHiddenColumns.filter((columnId) => !cachedKnownColumns.has(columnId));
          const normalizedCachedHidden = Array.isArray(parsed.hiddenColumns)
            ? Array.from(new Set([...cachedHidden, ...cachedDefaultHiddenColumns]))
            : taskDefaultHiddenColumns;
          const cachedSizing = parsed.columnSizing && typeof parsed.columnSizing === 'object'
            ? Object.entries(parsed.columnSizing).reduce<Record<string, number>>((accumulator, [columnId, width]) => {
                if (!valid.has(columnId)) return accumulator;
                const numericWidth = Number(width);
                if (!Number.isFinite(numericWidth)) return accumulator;
                accumulator[columnId] = Math.max(60, Math.min(1400, Math.round(numericWidth)));
                return accumulator;
              }, {})
            : {};
          const cachedSizeMode = taskSelectableColumnIds.reduce<Record<string, 'fixed' | 'grow'>>((accumulator, columnId) => {
            const mode = parsed.columnSizeMode && typeof parsed.columnSizeMode === 'object'
              ? parsed.columnSizeMode[columnId]
              : undefined;
            accumulator[columnId] = mode === 'fixed' ? 'fixed' : 'grow';
            return accumulator;
          }, {});
          if (!cancelled) {
            setHiddenTaskColumns(normalizedCachedHidden);
            setTaskColumnSizing(cachedSizing);
            setTaskColumnSizeMode(cachedSizeMode);
            setTaskRowDensity(parsed.rowDensity === 'compact' ? 'compact' : 'comfortable');
            setTaskColumnsReady(true);
          }
        }
      } catch {
        // ignore session cache parse errors
      }

      try {
        const preferences = await getAllGridPreferences(token);
        if (cancelled) return;
        if (hasSessionCache) return;

        const current = preferences.find((entry) => entry.gridKey === taskGridPreferenceKey);
        if (!current || !Array.isArray(current.hiddenColumns)) {
          setTaskColumnOrder(taskSelectableColumnIds);
          setHiddenTaskColumns(taskDefaultHiddenColumns);
          setTaskColumnSizing({});
          setTaskColumnSizeMode(Object.fromEntries(taskSelectableColumnIds.map((columnId) => [columnId, 'grow' as const])));
          setTaskRowDensity('comfortable');
          setTaskColumnsReady(true);
          return;
        }

        const valid = new Set(taskSelectableColumnIds);
        const savedOrder = Array.isArray(current.columnOrder)
          ? current.columnOrder.filter((columnId) => valid.has(columnId))
          : [];
        const missingOrder = taskSelectableColumnIds.filter((columnId) => !savedOrder.includes(columnId));
        const normalizedOrder = [...savedOrder, ...missingOrder];
        const savedHidden = current.hiddenColumns.filter((columnId) => valid.has(columnId));
        const savedSizing = current.columnSizing && typeof current.columnSizing === 'object'
          ? Object.entries(current.columnSizing).reduce<Record<string, number>>((accumulator, [columnId, width]) => {
              if (!valid.has(columnId)) return accumulator;
              const numericWidth = Number(width);
              if (!Number.isFinite(numericWidth)) return accumulator;
              accumulator[columnId] = Math.max(60, Math.min(1400, Math.round(numericWidth)));
              return accumulator;
            }, {})
          : {};
        const savedSizeMode = taskSelectableColumnIds.reduce<Record<string, 'fixed' | 'grow'>>((accumulator, columnId) => {
          const mode = current.columnSizeMode && typeof current.columnSizeMode === 'object'
            ? current.columnSizeMode[columnId]
            : undefined;
          accumulator[columnId] = mode === 'fixed' ? 'fixed' : 'grow';
          return accumulator;
        }, {});
        const savedSet = new Set(savedHidden);
        const newDefaults = taskDefaultHiddenColumns.filter((columnId) => !savedSet.has(columnId));
        setTaskColumnOrder(normalizedOrder);
        setHiddenTaskColumns(Array.from(new Set([...savedHidden, ...newDefaults])));
        setTaskColumnSizing(savedSizing);
        setTaskColumnSizeMode(savedSizeMode);
        setTaskRowDensity(current.rowDensity === 'compact' ? 'compact' : 'comfortable');
      } catch {
        if (!cancelled) {
          setTaskColumnOrder(taskSelectableColumnIds);
          setHiddenTaskColumns(taskDefaultHiddenColumns);
          setTaskColumnSizing({});
          setTaskColumnSizeMode(Object.fromEntries(taskSelectableColumnIds.map((columnId) => [columnId, 'grow' as const])));
          setTaskRowDensity('comfortable');
          setTaskColumnsReady(true);
        }
      } finally {
        if (!cancelled && !hasSessionCache) {
          setTaskColumnsReady(true);
        }
      }
    };

    loadTaskColumnsPreference();

    return () => {
      cancelled = true;
    };
  }, [token, taskGridPreferenceKey, taskGridSessionKey, taskSelectableColumnIds.join('|')]);

  useEffect(() => {
    if (!taskColumnsReady || !token) return;

    const valid = new Set(taskSelectableColumnIds);
    const sanitizedOrder = (taskColumnOrder.length > 0 ? taskColumnOrder : taskSelectableColumnIds).filter((columnId) => valid.has(columnId));
    const sanitizedHidden = hiddenTaskColumns.filter((columnId) => valid.has(columnId));
    const sanitizedSizing = Object.entries(taskColumnSizing).reduce<Record<string, number>>((accumulator, [columnId, width]) => {
      if (!valid.has(columnId)) return accumulator;
      const numericWidth = Number(width);
      if (!Number.isFinite(numericWidth)) return accumulator;
      accumulator[columnId] = Math.max(60, Math.min(1400, Math.round(numericWidth)));
      return accumulator;
    }, {});
    const sanitizedSizeMode = taskSelectableColumnIds.reduce<Record<string, 'fixed' | 'grow'>>((accumulator, columnId) => {
      accumulator[columnId] = taskColumnSizeMode[columnId] === 'fixed' ? 'fixed' : 'grow';
      return accumulator;
    }, {});

    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          taskGridSessionKey,
          JSON.stringify({
            columnOrder: sanitizedOrder,
            hiddenColumns: sanitizedHidden,
            columnSizing: sanitizedSizing,
            columnSizeMode: sanitizedSizeMode,
              rowDensity: taskRowDensity,
          })
        );
      }
    } catch {
      // ignore session storage failures
    }

    const timer = setTimeout(() => {
      void saveGridPreference(token, taskGridPreferenceKey, {
        columnOrder: sanitizedOrder,
        hiddenColumns: sanitizedHidden,
        columnSizing: sanitizedSizing,
        columnSizeMode: sanitizedSizeMode,
        sortField: null,
        sortDirection: null,
        rowDensity: taskRowDensity,
      }).catch(() => undefined);
    }, 250);

    return () => {
      clearTimeout(timer);
      void saveGridPreference(token, taskGridPreferenceKey, {
        columnOrder: sanitizedOrder,
        hiddenColumns: sanitizedHidden,
        columnSizing: sanitizedSizing,
        columnSizeMode: sanitizedSizeMode,
        sortField: null,
        sortDirection: null,
        rowDensity: taskRowDensity,
      }).catch(() => undefined);
    };
  }, [taskColumnsReady, token, taskGridPreferenceKey, taskGridSessionKey, hiddenTaskColumns, taskColumnOrder, taskColumnSizing, taskColumnSizeMode, taskRowDensity, taskSelectableColumnIds.join('|')]);

  const taskColumnDragProps = (columnKey: string) => {
    const indicator = taskDragOverInfo?.columnKey === columnKey ? taskDragOverInfo.side : null;
    return {
      draggable: true as const,
      style: {
        cursor: taskDragColumnId === columnKey ? 'grabbing' as const : 'grab' as const,
        boxShadow: indicator === 'left'
          ? 'inset 3px 0 0 0 #3b82f6'
          : indicator === 'right'
          ? 'inset -3px 0 0 0 #3b82f6'
          : undefined,
      },
      onDragStart: (e: React.DragEvent<HTMLTableCellElement>) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', columnKey);
        setTaskDragColumnId(columnKey);
      },
      onDragEnd: () => {
        setTaskDragColumnId(null);
        setTaskDragOverInfo(null);
      },
      onDragOver: (e: React.DragEvent<HTMLTableCellElement>) => {
        if (!taskDragColumnId || taskDragColumnId === columnKey) return;
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const side: 'left' | 'right' = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
        setTaskDragOverInfo((p) => (p?.columnKey === columnKey && p?.side === side ? p : { columnKey, side }));
      },
      onDragLeave: () => {
        setTaskDragOverInfo((p) => (p?.columnKey === columnKey ? null : p));
      },
      onDrop: (e: React.DragEvent<HTMLTableCellElement>) => {
        e.preventDefault();
        if (!taskDragColumnId || taskDragColumnId === columnKey) return;
        const side = taskDragOverInfo?.columnKey === columnKey ? taskDragOverInfo.side : 'right';
        setTaskColumnOrder((prev) => {
          const order = prev.length > 0 ? [...prev] : [...taskSelectableColumnIds];
          const fromIdx = order.indexOf(taskDragColumnId);
          if (fromIdx < 0) return order;
          order.splice(fromIdx, 1);
          const toIdx = order.indexOf(columnKey);
          if (toIdx < 0) return order;
          order.splice(side === 'left' ? toIdx : toIdx + 1, 0, taskDragColumnId);
          return order;
        });
        setTaskDragColumnId(null);
        setTaskDragOverInfo(null);
      },
    };
  };

  useEffect(() => {
    const grid = tasksGridRef.current;
    if (!grid) return;

    const table = grid.querySelector('table');
    if (!(table instanceof HTMLTableElement)) return;

    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return;

    const headerCells = Array.from(headerRow.children).filter((cell) => cell instanceof HTMLTableCellElement) as HTMLTableCellElement[];
    const columnIds = headerCells.map((cell, index) => cell.dataset.columnKey?.trim() || `column-${index + 1}`);
    const valid = new Set(columnIds);
    const orderedColumnIds = (taskColumnOrder.length > 0 ? taskColumnOrder : columnIds)
      .filter((columnId) => valid.has(columnId));
    const missing = columnIds.filter((columnId) => !orderedColumnIds.includes(columnId));
    const finalOrder = [...orderedColumnIds, ...missing];

    const selectColumnIndex = finalOrder.indexOf('select');
    if (selectColumnIndex > 0) {
      finalOrder.splice(selectColumnIndex, 1);
      finalOrder.unshift('select');
    }

    const actionsColumnIndex = finalOrder.indexOf('actions');
    if (actionsColumnIndex !== -1 && actionsColumnIndex !== finalOrder.length - 1) {
      finalOrder.splice(actionsColumnIndex, 1);
      finalOrder.push('actions');
    }

    const hiddenSet = new Set(hiddenTaskColumns);

    const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
    rows.forEach((row) => {
      const cells = Array.from(row.children) as HTMLElement[];
      if (cells.length !== columnIds.length) return;
      const byColumn = new Map<string, HTMLElement>();
      cells.forEach((cell, index) => {
        byColumn.set(columnIds[index], cell);
      });
      finalOrder.forEach((columnId) => {
        const cell = byColumn.get(columnId);
        if (cell) row.appendChild(cell);
      });
      const updatedCells = Array.from(row.children) as HTMLElement[];
      updatedCells.forEach((cell, index) => {
        const columnId = finalOrder[index];
        const isHidden = hiddenSet.has(columnId);
        cell.style.display = isHidden ? 'none' : '';

        const isActionsColumn = columnId === 'actions';
        if (!columnId || (!taskSelectableColumnIds.includes(columnId) && !isActionsColumn)) {
          cell.style.removeProperty('width');
          cell.style.removeProperty('min-width');
          cell.style.removeProperty('max-width');
          return;
        }

        const mode = isActionsColumn ? 'fixed' : (taskColumnSizeMode[columnId] === 'fixed' ? 'fixed' : 'grow');
        const width = Number.isFinite(taskColumnSizing[columnId])
          ? taskColumnSizing[columnId]
          : (isActionsColumn ? 120 : undefined);
        const fixedWidth = typeof width === 'number' ? width : null;
        if (mode === 'fixed' && fixedWidth !== null && Number.isFinite(fixedWidth)) {
          const finalWidth = `${Math.max(60, Math.min(1400, Math.round(fixedWidth)))}px`;
          cell.style.width = finalWidth;
          cell.style.minWidth = finalWidth;
          cell.style.maxWidth = finalWidth;
        } else {
          cell.style.removeProperty('width');
          cell.style.removeProperty('min-width');
          cell.style.removeProperty('max-width');
        }
      });
    });

    const reorderedHeaderCells = Array.from(headerRow.children).filter((cell) => cell instanceof HTMLTableCellElement) as HTMLTableCellElement[];
    reorderedHeaderCells.forEach((headerCell, index) => {
      const columnId = finalOrder[index];
      if (!columnId || !taskSelectableColumnIds.includes(columnId) || hiddenSet.has(columnId)) return;

      if (!headerCell.style.position) {
        headerCell.style.position = 'relative';
      }

      if (headerCell.dataset.taskResizeBound === 'true') return;
      headerCell.dataset.taskResizeBound = 'true';

      const handle = document.createElement('div');
      handle.className = 'task-grid-column-resize-handle';
      handle.style.position = 'absolute';
      handle.style.top = '0';
      handle.style.right = '0';
      handle.style.width = '9px';
      handle.style.height = '100%';
      handle.style.cursor = 'col-resize';
      handle.style.userSelect = 'none';
      handle.style.touchAction = 'none';
      handle.style.zIndex = '3';

      const line = document.createElement('div');
      line.style.position = 'absolute';
      line.style.top = '20%';
      line.style.right = '2px';
      line.style.width = '2px';
      line.style.height = '60%';
      line.style.borderRadius = '9999px';
      line.style.backgroundColor = 'rgba(156, 163, 175, 0.7)';
      handle.appendChild(line);

      handle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();

        const startX = event.clientX;
        const startWidth = Math.max(60, Math.round(headerCell.getBoundingClientRect().width));

        setTaskColumnSizeMode((previous) => ({
          ...previous,
          [columnId]: 'fixed',
        }));
        setTaskColumnSizing((previous) => ({
          ...previous,
          [columnId]: Number.isFinite(previous[columnId]) ? previous[columnId] : startWidth,
        }));

        const onMouseMove = (moveEvent: MouseEvent) => {
          const delta = moveEvent.clientX - startX;
          const nextWidth = Math.max(60, Math.min(1400, Math.round(startWidth + delta)));
          setTaskColumnSizing((previous) => ({
            ...previous,
            [columnId]: nextWidth,
          }));
        };

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      headerCell.appendChild(handle);
    });
  }, [
    hiddenTaskColumns,
    taskColumnOrder,
    taskColumnSizing,
    taskColumnSizeMode,
    taskSelectableColumnIds,
    tasks,
    taskColumnsReady,
    sortField,
    sortDirection,
    expandedTasks,
    editingRowTaskId,
    creatingSubtaskParentId,
    creatingRootTaskInline,
  ]);

  // Check which integrations are configured by source type
  const hasJiraBoardIntegration = jiraIntegration?.IsEnabled && jiraIntegration?.JiraProjectsUrl;
  const hasJiraTicketIntegration = jiraIntegration?.IsEnabled && jiraIntegration?.JiraUrl;
  const hasTaskStatusCheckOption =
    (hasJiraTicketIntegration && Boolean(onCheckJiraTicketStatus)) ||
    (hasJiraBoardIntegration && Boolean(onCheckJiraBoardStatus));
  const hasGitHubIntegration =
    Boolean(project.GitHubOwner && project.GitHubRepo) ||
    (project.Applications || []).some(
      (app: { RepositoryUrl?: string | null; GitHubIntegrationId?: number | null }) =>
        Boolean(app.RepositoryUrl) &&
        (Boolean(app.GitHubIntegrationId) || /github/i.test(String(app.RepositoryUrl)))
    );
  const hasGiteaIntegration =
    Boolean(project.GiteaOwner && project.GiteaRepo) ||
    (project.Applications || []).some(
      (app: { RepositoryUrl?: string | null; GiteaIntegrationId?: number | null }) =>
        Boolean(app.RepositoryUrl) &&
        (Boolean(app.GiteaIntegrationId) || /gitea/i.test(String(app.RepositoryUrl)))
    );

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

  // Separate parent tasks from subtasks
  const parentTasks = tasks.filter(task => !task.ParentTaskId);
  const getSubtasks = (parentId: number) => tasks.filter(task => task.ParentTaskId === parentId);

  const assigneeOptions = Array.from(
    new Map(
      [
        ...(organizationUsers || [])
          .filter((userOption) => {
            const normalizedActive = Number(userOption.IsActive as any);
            return Number.isNaN(normalizedActive) || normalizedActive !== 0;
          })
          .map((userOption) => ({ id: Number(userOption.Id), name: String(userOption.Username || '').trim() })),
        ...tasks
          .filter((task) => task.AssignedTo && task.AssigneeName)
          .map((task) => ({ id: Number(task.AssignedTo), name: String(task.AssigneeName || '').trim() })),
      ]
        .filter((entry) => entry.id > 0 && entry.name.length > 0)
        .map((entry) => [entry.id, entry])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const statusOptions = (taskStatuses || [])
    .map((statusOption) => ({ id: Number(statusOption.Id), name: String(statusOption.StatusName || '') }))
    .filter((statusOption) => !!statusOption.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  const priorityOptions = (taskPriorities || [])
    .map((priorityOption) => ({ id: Number(priorityOption.Id), name: String(priorityOption.PriorityName || priorityOption.StatusName || '') }))
    .filter((priorityOption) => !!priorityOption.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  const taskTypeOptions = (taskTypes || [])
    .map((taskTypeOption) => ({ id: Number(taskTypeOption.Id), name: String(taskTypeOption.TypeName || taskTypeOption.StatusName || '') }))
    .filter((taskTypeOption) => !!taskTypeOption.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!token || !project?.OrganizationId) return;

    const loadApplications = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/applications?organizationId=${project.OrganizationId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          setAvailableApplications([]);
          return;
        }

        const data = await response.json();
        setAvailableApplications(data.applications || []);
      } catch {
        setAvailableApplications([]);
      }
    };

    loadApplications();
  }, [token, project?.OrganizationId]);

  useEffect(() => {
    if (!bulkEditData.applicationId || !token) {
      setBulkApplicationVersions([]);
      return;
    }

    const loadVersions = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/applications/${bulkEditData.applicationId}/versions`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          setBulkApplicationVersions([]);
          return;
        }

        const data = await response.json();
        setBulkApplicationVersions(data.versions || []);
      } catch {
        setBulkApplicationVersions([]);
      }
    };

    loadVersions();
  }, [bulkEditData.applicationId, token]);

  useEffect(() => {
    const validTaskIds = new Set(tasks.map((task) => task.Id));
    setSelectedTaskIds((previous) => {
      const next = new Set(Array.from(previous).filter((taskId) => validTaskIds.has(taskId)));
      return next.size === previous.size ? previous : next;
    });
  }, [tasks]);

  const toggleTaskSelection = (taskId: number) => {
    setSelectedTaskIds((previous) => {
      const next = new Set(previous);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const resetBulkEditState = () => {
    setBulkEditError('');
    setBulkEditData({
      statusId: undefined,
      assignedToId: undefined,
      applicationId: undefined,
      releaseVersionId: undefined,
      parentTaskId: undefined,
    });
    setBulkTagIds([]);
    setBulkApplicationVersions([]);
  };

  const handleOpenBulkEditModal = () => {
    resetBulkEditState();
    setShowBulkEditModal(true);
  };

  const handleCloseBulkEditModal = () => {
    if (isApplyingBulkEdit) return;
    setShowBulkEditModal(false);
    resetBulkEditState();
  };

  const handleApplyBulkEdit = async () => {
    if (!token || selectedTaskIds.size === 0 || isApplyingBulkEdit) return;

    const payload: UpdateTaskData = {};
    if (bulkEditData.statusId !== undefined) payload.status = bulkEditData.statusId;
    if (bulkEditData.assignedToId !== undefined) payload.assignedTo = bulkEditData.assignedToId;
    if (bulkEditData.applicationId !== undefined) payload.applicationId = bulkEditData.applicationId;
    if (bulkEditData.releaseVersionId !== undefined) payload.releaseVersionId = bulkEditData.releaseVersionId;
    if (bulkEditData.parentTaskId !== undefined) payload.parentTaskId = bulkEditData.parentTaskId;
    const hasTagsUpdate = bulkTagIds.length > 0;

    if (Object.keys(payload).length === 0 && !hasTagsUpdate) {
      setBulkEditError('Select at least one field to update.');
      return;
    }

    setIsApplyingBulkEdit(true);
    setBulkEditError('');

    try {
      const ids = Array.from(selectedTaskIds);
      await Promise.all(
        ids.map(async (taskId) => {
          if (Object.keys(payload).length > 0) {
            await tasksApi.update(taskId, payload, token);
          }
          if (hasTagsUpdate) {
            await tagsApi.updateTaskTags(taskId, bulkTagIds, token);
          }
        })
      );
      await onRefreshTasks();

      if (project?.OrganizationId && project?.Id) {
        try {
          const projectTaskTagsRes = await fetch(`${getApiUrl()}/api/tags/project/${project.Id}/tasks`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (projectTaskTagsRes.ok) {
            const taskTagsData = await projectTaskTagsRes.json();
            const mapped = new Map<number, Array<{ id: number; name: string; color: string }>>();
            for (const relation of taskTagsData.taskTags || []) {
              const taskId = Number(relation.TaskId);
              const existing = mapped.get(taskId) || [];
              existing.push({
                id: Number(relation.TagId),
                name: String(relation.TagName || ''),
                color: String(relation.TagColor || '#6B7280'),
              });
              mapped.set(taskId, existing);
            }
            setTaskTagMap(mapped);
          }
        } catch {
          // ignore task tags refresh errors
        }
      }

      setSelectedTaskIds(new Set());
      setShowBulkEditModal(false);
      resetBulkEditState();
    } catch (error) {
      setBulkEditError(error instanceof Error ? error.message : 'Failed to apply bulk edit.');
    } finally {
      setIsApplyingBulkEdit(false);
    }
  };

  const onTaskDragStart = (e: React.DragEvent<HTMLTableRowElement>, taskId: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
    setDraggedTaskId(taskId);
    setDragDropSourceTaskId(taskId);
  };

  const onTaskDragOver = (e: React.DragEvent<HTMLTableRowElement>, taskId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTaskId(taskId);
  };

  const onTaskDragLeave = (e: React.DragEvent<HTMLTableRowElement>) => {
    e.preventDefault();
    setDragOverTaskId(null);
  };

  const onTaskDrop = (e: React.DragEvent<HTMLTableRowElement>, targetTaskId: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dragDropSourceTaskId === null || dragDropSourceTaskId === targetTaskId) {
      setDraggedTaskId(null);
      setDragOverTaskId(null);
      setDragDropSourceTaskId(null);
      return;
    }

    setDragDropTargetTaskId(targetTaskId);
    setShowDragDropActionModal(true);
    setDraggedTaskId(null);
    setDragOverTaskId(null);
  };

  const handleDragDropAction = async (action: 'child' | 'reorder') => {
    if (!token || dragDropSourceTaskId === null || dragDropTargetTaskId === null) return;

    try {
      if (action === 'child') {
        // Make source task a child of target task
        await tasksApi.update(dragDropSourceTaskId, { parentTaskId: dragDropTargetTaskId }, token);
      } else {
        // Reorder: move source task to position of target task
        // Get all parent tasks in current order
        const orderedParents = getDisplayOrderSortedTasks(parentTasks);
        
        // Find indices
        const sourceIndex = orderedParents.findIndex(t => t.Id === dragDropSourceTaskId);
        const targetIndex = orderedParents.findIndex(t => t.Id === dragDropTargetTaskId);
        
        if (sourceIndex !== -1 && targetIndex !== -1) {
          // Create new array with source moved to target position
          const reordered = [...orderedParents];
          const [movedTask] = reordered.splice(sourceIndex, 1);
          reordered.splice(targetIndex, 0, movedTask);
          
          // Update DisplayOrder sequentially for all affected tasks
          const tasksToUpdate = reordered.map((task, index) => ({
            id: task.Id,
            displayOrder: (index + 1) * 10, // 10, 20, 30, etc.
          }));
          
          // Apply all updates
          await Promise.all(
            tasksToUpdate.map(task =>
              tasksApi.update(task.id, { displayOrder: task.displayOrder }, token)
            )
          );
        }
      }

      onRefreshTasks();
    } catch (error) {
      console.error('Failed to apply drag-drop action:', error);
    } finally {
      setShowDragDropActionModal(false);
      setDragDropSourceTaskId(null);
      setDragDropTargetTaskId(null);
    }
  };

  useEffect(() => {
    if (!token || !project?.OrganizationId || !project?.Id) return;

    const loadTaskTagsData = async () => {
      try {
        const [usageRes, projectTaskTagsRes] = await Promise.all([
          fetch(`${getApiUrl()}/api/tags/organization/${project.OrganizationId}/usage`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }),
          fetch(`${getApiUrl()}/api/tags/project/${project.Id}/tasks`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          })
        ]);

        if (usageRes.ok) {
          const usageData = await usageRes.json();
          const options = (usageData.tags || []).map((tag: any) => ({
            value: Number(tag.Id),
            label: String(tag.Name || ''),
            subtitle: `${Number(tag.TaskCount || 0)} task${Number(tag.TaskCount || 0) !== 1 ? 's' : ''}`,
          }));
          setTagFilterOptions(options);
        } else {
          setTagFilterOptions([]);
        }

        if (projectTaskTagsRes.ok) {
          const taskTagsData = await projectTaskTagsRes.json();
          const mapped = new Map<number, Array<{ id: number; name: string; color: string }>>();
          for (const relation of taskTagsData.taskTags || []) {
            const taskId = Number(relation.TaskId);
            const existing = mapped.get(taskId) || [];
            existing.push({
              id: Number(relation.TagId),
              name: String(relation.TagName || ''),
              color: String(relation.TagColor || '#6B7280'),
            });
            mapped.set(taskId, existing);
          }
          setTaskTagMap(mapped);
        } else {
          setTaskTagMap(new Map());
        }
      } catch (err) {
        console.error('Failed to load task tags data:', err);
        setTagFilterOptions([]);
        setTaskTagMap(new Map());
      }
    };

    loadTaskTagsData();
  }, [token, project?.OrganizationId, project?.Id]);

  useEffect(() => {
    if (tagFilterOptions.length === 0) {
      setFilterTagIds(prev => (prev.length === 0 ? prev : []));
      return;
    }

    const validTagIds = new Set(tagFilterOptions.map(option => Number(option.value)));
    setFilterTagIds(prev => {
      const next = prev.filter(tagId => validTagIds.has(tagId));
      if (next.length === prev.length && next.every((tagId, index) => tagId === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [tagFilterOptions]);

  const isFilterActive = !!(
    filterText.trim() ||
    filterStatus ||
    filterPriority ||
    filterAssignee ||
    filterTaskType ||
    filterTagIds.length > 0 ||
    hideClosed ||
    unplannedOnly
  );

  const shouldAutoExpandForFilters = !!(
    filterText.trim() ||
    filterStatus ||
    filterPriority ||
    filterAssignee ||
    filterTaskType ||
    filterTagIds.length > 0 ||
    unplannedOnly
  );

  const taskMatchesFilters = (task: Task): boolean => {
    if (hideClosed && (Number(task.StatusIsClosed || 0) === 1 || Number(task.StatusIsCancelled || 0) === 1)) return false;
    if (unplannedOnly && !isUnplannedLeafTask(task, tasks)) return false;
    const taskStatusId = task.Status !== null && task.Status !== undefined ? Number(task.Status) : undefined;
    const taskPriorityId = task.Priority !== null && task.Priority !== undefined ? Number(task.Priority) : undefined;
    const taskAssigneeId = task.AssignedTo !== null && task.AssignedTo !== undefined ? Number(task.AssignedTo) : undefined;
    const taskTypeId = task.TaskType !== null && task.TaskType !== undefined ? Number(task.TaskType) : undefined;

    if (filterStatus !== undefined && taskStatusId !== filterStatus) return false;
    if (filterPriority !== undefined && taskPriorityId !== filterPriority) return false;
    if (filterAssignee !== undefined && taskAssigneeId !== filterAssignee) return false;
    if (filterTaskType !== undefined && taskTypeId !== filterTaskType) return false;
    if (filterTagIds.length > 0) {
      const taskTags = taskTagMap.get(task.Id) || [];
      const taskTagIds = taskTags.map(taskTag => taskTag.id);
      const matchesAllTags = filterTagIds.every(filterTagId => taskTagIds.includes(filterTagId));
      if (!matchesAllTags) return false;
    }
    if (filterText.trim()) {
      const search = filterText.toLowerCase();
      const descriptionText = (task.Description || '').replace(/<[^>]*>/g, ' ').toLowerCase();
      const taskTagsText = (taskTagMap.get(task.Id) || []).map(taskTag => taskTag.name.toLowerCase()).join(' ');
      const additionalColumnsText = additionalTaskColumnKeys
        .map((columnKey) => renderAdditionalTaskColumnValue(task, columnKey).toLowerCase())
        .filter((textValue) => textValue && textValue !== '-')
        .join(' ');
      const matches =
        (task.TaskName || '').toLowerCase().includes(search) ||
        (task.AssigneeName || '').toLowerCase().includes(search) ||
        (task.StatusName || '').toLowerCase().includes(search) ||
        (task.PriorityName || '').toLowerCase().includes(search) ||
        (task.TaskTypeName || '').toLowerCase().includes(search) ||
        descriptionText.includes(search) ||
        taskTagsText.includes(search) ||
        additionalColumnsText.includes(search);
      if (!matches) return false;
    }
    return true;
  };

  const comparePrimitiveValues = (valueA: unknown, valueB: unknown): number => {
    const textA = valueA === null || valueA === undefined ? '' : String(valueA).trim();
    const textB = valueB === null || valueB === undefined ? '' : String(valueB).trim();

    const numberA = Number(textA.replace(/[^0-9.-]/g, ''));
    const numberB = Number(textB.replace(/[^0-9.-]/g, ''));
    const isNumberA = Number.isFinite(numberA) && /\d/.test(textA);
    const isNumberB = Number.isFinite(numberB) && /\d/.test(textB);

    if (isNumberA && isNumberB) {
      return numberA - numberB;
    }

    const dateA = Date.parse(textA);
    const dateB = Date.parse(textB);
    const isDateA = Number.isFinite(dateA);
    const isDateB = Number.isFinite(dateB);

    if (isDateA && isDateB) {
      return dateA - dateB;
    }

    return textA.localeCompare(textB, undefined, { sensitivity: 'base', numeric: true });
  };

  const compareTasks = (a: Task, b: Task): number => {
    let comparison = 0;
    const finalSortField = sortField || 'displayOrder';
    
    switch (finalSortField) {
      case 'task':
        comparison = (a.TaskName || '').localeCompare(b.TaskName || '');
        break;
      case 'assignee':
        comparison = (a.AssigneeName || '').localeCompare(b.AssigneeName || '');
        break;
      case 'status':
        comparison = (a.StatusName || '').localeCompare(b.StatusName || '');
        break;
      case 'priority':
        comparison = (a.PriorityName || '').localeCompare(b.PriorityName || '');
        break;
      case 'TaskTypeName':
        comparison = (a.TaskTypeName || '').localeCompare(b.TaskTypeName || '');
        break;
      case 'dueDate': {
        const aTime = a.DueDate ? new Date(a.DueDate).getTime() : null;
        const bTime = b.DueDate ? new Date(b.DueDate).getTime() : null;
        if (aTime === null && bTime === null) comparison = 0;
        else if (aTime === null) comparison = 1;
        else if (bTime === null) comparison = -1;
        else comparison = aTime - bTime;
        break;
      }
      case 'displayOrder': {
        const aOrder = Number.isFinite(Number(a.DisplayOrder)) ? Number(a.DisplayOrder) : Number.MAX_SAFE_INTEGER;
        const bOrder = Number.isFinite(Number(b.DisplayOrder)) ? Number(b.DisplayOrder) : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) {
          comparison = aOrder - bOrder;
        } else {
          comparison = Number(a.Id) - Number(b.Id);
        }
        break;
      }
      default: {
        if (finalSortField.startsWith('extra:')) {
          const rawKey = finalSortField.slice('extra:'.length);
          const valueA = (a as unknown as Record<string, unknown>)[rawKey];
          const valueB = (b as unknown as Record<string, unknown>)[rawKey];
          comparison = comparePrimitiveValues(valueA, valueB);
        } else {
          comparison = 0;
        }
        break;
      }
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  };

  const getSortedTasks = (taskList: Task[]) => [...taskList].sort(compareTasks);

  const getDisplayOrderSortedTasks = (taskList: Task[]) => {
    return [...taskList].sort((a, b) => {
      const aOrder = Number.isFinite(Number(a.DisplayOrder)) ? Number(a.DisplayOrder) : Number.MAX_SAFE_INTEGER;
      const bOrder = Number.isFinite(Number(b.DisplayOrder)) ? Number(b.DisplayOrder) : Number.MAX_SAFE_INTEGER;

      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      return Number(a.Id) - Number(b.Id);
    });
  };

  const hasMatchingDescendant = (task: Task): boolean => {
    const subtasks = getSubtasks(task.Id);
    for (const subtask of subtasks) {
      if (taskMatchesFilters(subtask) || hasMatchingDescendant(subtask)) {
        return true;
      }
    }
    return false;
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getTaskAriaSort = (field: string): 'none' | 'ascending' | 'descending' => {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  const getTaskSortIndicator = (field: string) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const visibleParentTasks = getSortedTasks(
    parentTasks.filter(parent => {
      if (!isFilterActive) return true;
      return taskMatchesFilters(parent) || hasMatchingDescendant(parent);
    })
  );

  const collectVisibleTaskIds = (task: Task, ids: number[]) => {
    const subtasks = getDisplayOrderSortedTasks(getSubtasks(task.Id));
    const hasAnyMatchingDescendant = hasMatchingDescendant(task);

    if (isFilterActive && !taskMatchesFilters(task) && !hasAnyMatchingDescendant) {
      return;
    }

    ids.push(task.Id);

    const isExpanded = shouldAutoExpandForFilters ? true : expandedTasks.has(task.Id);
    if (isExpanded && subtasks.length > 0) {
      subtasks.forEach((subtask) => collectVisibleTaskIds(subtask, ids));
    }
  };

  const visibleTaskIds = React.useMemo(() => {
    const ids: number[] = [];
    visibleParentTasks.forEach((task) => collectVisibleTaskIds(task, ids));
    return ids;
  }, [visibleParentTasks, expandedTasks, shouldAutoExpandForFilters, isFilterActive, filterText, filterStatus, filterPriority, filterAssignee, filterTaskType, filterTagIds, hideClosed, unplannedOnly, sortField, sortDirection]);

  const allVisibleTasksSelected = visibleTaskIds.length > 0 && visibleTaskIds.every((taskId) => selectedTaskIds.has(taskId));

  const toggleSelectAllVisibleTasks = () => {
    setSelectedTaskIds((previous) => {
      const next = new Set(previous);
      if (allVisibleTasksSelected) {
        visibleTaskIds.forEach((taskId) => next.delete(taskId));
      } else {
        visibleTaskIds.forEach((taskId) => next.add(taskId));
      }
      return next;
    });
  };

  const bulkParentTaskOptions = tasks
    .filter((task) => !selectedTaskIds.has(task.Id))
    .map((task) => ({
      id: task.Id,
      label: task.TaskName,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const startInlineEdit = (task: Task) => {
    if (!canManage) return;

    const normalizedDueDate = task.DueDate
      ? String(task.DueDate).split('T')[0]
      : '';

    setEditingRowTaskId(task.Id);
    setEditingRowData({
      taskName: task.TaskName || '',
      assignedTo: task.AssignedTo ? Number(task.AssignedTo) : null,
      taskType: task.TaskType !== null && task.TaskType !== undefined ? Number(task.TaskType) : null,
      status: task.Status !== null && task.Status !== undefined ? Number(task.Status) : null,
      priority: task.Priority !== null && task.Priority !== undefined ? Number(task.Priority) : null,
      dueDate: normalizedDueDate,
    });
  };

  const cancelInlineEdit = () => {
    setEditingRowTaskId(null);
    setEditingRowData({
      taskName: '',
      assignedTo: null,
      taskType: null,
      status: null,
      priority: null,
      dueDate: '',
    });
    setIsSavingInline(false);
  };

  const startInlineSubtaskCreate = (parentTaskId: number) => {
    if (!canManage) return;

    const defaultTaskType = taskTypeOptions.length > 0 ? taskTypeOptions[0].id : null;
    const defaultStatusFromDb =
      (taskStatuses || []).find((statusOption) => Number(statusOption.IsDefault || 0) === 1) ||
      [...(taskStatuses || [])].sort((a, b) => Number(a.SortOrder || 0) - Number(b.SortOrder || 0) || Number(a.Id) - Number(b.Id))[0];
    const defaultPriorityFromDb =
      (taskPriorities || []).find((priorityOption) => Number(priorityOption.IsDefault || 0) === 1) ||
      [...(taskPriorities || [])].sort((a, b) => Number(a.SortOrder || 0) - Number(b.SortOrder || 0) || Number(a.Id) - Number(b.Id))[0];

    const defaultStatus = defaultStatusFromDb ? Number(defaultStatusFromDb.Id) : null;
    const defaultPriority = defaultPriorityFromDb ? Number(defaultPriorityFromDb.Id) : null;

    setEditingRowTaskId(null);
    setIsSavingInline(false);
    setCreatingRootTaskInline(false);
    setIsSavingRootInline(false);
    setCreatingSubtaskParentId(parentTaskId);
    setNewSubtaskData({
      taskName: '',
      assignedTo: null,
      taskType: defaultTaskType,
      status: defaultStatus,
      priority: defaultPriority,
      dueDate: '',
    });

    setExpandedTasks((prev) => {
      const next = new Set(prev);
      next.add(parentTaskId);
      return next;
    });
  };

  const cancelInlineSubtaskCreate = () => {
    setCreatingSubtaskParentId(null);
    setNewSubtaskData({
      taskName: '',
      assignedTo: null,
      taskType: null,
      status: null,
      priority: null,
      dueDate: '',
    });
    setIsSavingSubtaskInline(false);
  };

  const startInlineRootTaskCreate = () => {
    if (!canCreate) return;

    const defaultTaskType = taskTypeOptions.length > 0 ? taskTypeOptions[0].id : null;
    const defaultStatusFromDb =
      (taskStatuses || []).find((statusOption) => Number(statusOption.IsDefault || 0) === 1) ||
      [...(taskStatuses || [])].sort((a, b) => Number(a.SortOrder || 0) - Number(b.SortOrder || 0) || Number(a.Id) - Number(b.Id))[0];
    const defaultPriorityFromDb =
      (taskPriorities || []).find((priorityOption) => Number(priorityOption.IsDefault || 0) === 1) ||
      [...(taskPriorities || [])].sort((a, b) => Number(a.SortOrder || 0) - Number(b.SortOrder || 0) || Number(a.Id) - Number(b.Id))[0];

    const defaultStatus = defaultStatusFromDb ? Number(defaultStatusFromDb.Id) : null;
    const defaultPriority = defaultPriorityFromDb ? Number(defaultPriorityFromDb.Id) : null;

    setEditingRowTaskId(null);
    setIsSavingInline(false);
    setCreatingSubtaskParentId(null);
    setIsSavingSubtaskInline(false);
    setCreatingRootTaskInline(true);
    setNewRootTaskData({
      taskName: '',
      assignedTo: null,
      taskType: defaultTaskType,
      status: defaultStatus,
      priority: defaultPriority,
      dueDate: '',
    });
  };

  const cancelInlineRootTaskCreate = () => {
    setCreatingRootTaskInline(false);
    setNewRootTaskData({
      taskName: '',
      assignedTo: null,
      taskType: null,
      status: null,
      priority: null,
      dueDate: '',
    });
    setIsSavingRootInline(false);
  };

  const saveInlineRootTaskCreate = async (createNextOnSuccess: boolean = false) => {
    if (!canCreate || isSavingRootInline) return;

    const nextName = newRootTaskData.taskName.trim();
    if (!nextName) return;

    const fallbackStatusId =
      (taskStatuses || []).find((statusOption) => Number(statusOption.IsDefault || 0) === 1)?.Id ||
      [...(taskStatuses || [])].sort((a, b) => Number(a.SortOrder || 0) - Number(b.SortOrder || 0) || Number(a.Id) - Number(b.Id))[0]?.Id;
    const fallbackPriorityId =
      (taskPriorities || []).find((priorityOption) => Number(priorityOption.IsDefault || 0) === 1)?.Id ||
      [...(taskPriorities || [])].sort((a, b) => Number(a.SortOrder || 0) - Number(b.SortOrder || 0) || Number(a.Id) - Number(b.Id))[0]?.Id;

    const effectiveStatus = newRootTaskData.status ?? (fallbackStatusId !== undefined ? Number(fallbackStatusId) : null);
    const effectivePriority = newRootTaskData.priority ?? (fallbackPriorityId !== undefined ? Number(fallbackPriorityId) : null);

    if (!effectiveStatus || !effectivePriority) return;

    const nextDueDate = newRootTaskData.dueDate.trim();
    if (nextDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) return;

    setIsSavingRootInline(true);
    try {
      await tasksApi.create(
        {
          projectId: Number(project.Id),
          taskName: nextName,
          taskType: newRootTaskData.taskType,
          status: effectiveStatus,
          priority: effectivePriority,
          assignedTo: newRootTaskData.assignedTo || undefined,
          dueDate: nextDueDate || undefined,
        },
        token
      );

      await onRefreshTasks();
      if (createNextOnSuccess) {
        setNewRootTaskData((prev) => ({
          ...prev,
          taskName: '',
          dueDate: '',
        }));
        setNewRootTaskInputResetKey((prev) => prev + 1);
        setIsSavingRootInline(false);
      } else {
        cancelInlineRootTaskCreate();
      }
      onError?.('');
    } catch (error) {
      onError?.(getErrorMessage(error, 'Failed to create task'));
      setIsSavingRootInline(false);
    }
  };

  const saveInlineSubtaskCreate = async (createNextOnSuccess: boolean = false) => {
    if (!canManage || isSavingSubtaskInline || !creatingSubtaskParentId) return;

    const nextName = newSubtaskData.taskName.trim();
    if (!nextName) return;

    const fallbackStatusId =
      (taskStatuses || []).find((statusOption) => Number(statusOption.IsDefault || 0) === 1)?.Id ||
      [...(taskStatuses || [])].sort((a, b) => Number(a.SortOrder || 0) - Number(b.SortOrder || 0) || Number(a.Id) - Number(b.Id))[0]?.Id;
    const fallbackPriorityId =
      (taskPriorities || []).find((priorityOption) => Number(priorityOption.IsDefault || 0) === 1)?.Id ||
      [...(taskPriorities || [])].sort((a, b) => Number(a.SortOrder || 0) - Number(b.SortOrder || 0) || Number(a.Id) - Number(b.Id))[0]?.Id;

    const effectiveStatus = newSubtaskData.status ?? (fallbackStatusId !== undefined ? Number(fallbackStatusId) : null);
    const effectivePriority = newSubtaskData.priority ?? (fallbackPriorityId !== undefined ? Number(fallbackPriorityId) : null);

    if (!effectiveStatus || !effectivePriority) return;

    const nextDueDate = newSubtaskData.dueDate.trim();
    if (nextDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) return;

    setIsSavingSubtaskInline(true);
    try {
      await tasksApi.create(
        {
          projectId: Number(project.Id),
          taskName: nextName,
          parentTaskId: creatingSubtaskParentId,
          taskType: newSubtaskData.taskType,
          status: effectiveStatus,
          priority: effectivePriority,
          assignedTo: newSubtaskData.assignedTo || undefined,
          dueDate: nextDueDate || undefined,
        },
        token
      );

      await onRefreshTasks();
      if (createNextOnSuccess) {
        setNewSubtaskData((prev) => ({
          ...prev,
          taskName: '',
          dueDate: '',
        }));
        setNewSubtaskInputResetKey((prev) => prev + 1);
        setIsSavingSubtaskInline(false);
      } else {
        cancelInlineSubtaskCreate();
      }
      onError?.('');
    } catch (error) {
      onError?.(getErrorMessage(error, 'Failed to create subtask'));
      setIsSavingSubtaskInline(false);
    }
  };

  useEffect(() => {
    if (!editingRowTaskId && !creatingSubtaskParentId && !creatingRootTaskInline) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const gridElement = tasksGridRef.current;
      if (!gridElement) return;

      const target = event.target as Node;
      const activeRow = editingRowTaskId
        ? gridElement.querySelector(`[data-task-row-id="${editingRowTaskId}"]`)
        : creatingSubtaskParentId
          ? gridElement.querySelector(`[data-task-new-subtask-parent-id="${creatingSubtaskParentId}"]`)
          : creatingRootTaskInline
            ? gridElement.querySelector('[data-task-new-root-row="true"]')
            : null;

      if (activeRow && !activeRow.contains(target)) {
        if (editingRowTaskId) {
          cancelInlineEdit();
        }
        if (creatingSubtaskParentId) {
          cancelInlineSubtaskCreate();
        }
        if (creatingRootTaskInline) {
          cancelInlineRootTaskCreate();
        }
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [editingRowTaskId, creatingSubtaskParentId, creatingRootTaskInline]);

  useEffect(() => {
    if (!creatingRootTaskInline || isSavingRootInline) return;

    const frameId = window.requestAnimationFrame(() => {
      newRootTaskInputRef.current?.focus();
      newRootTaskInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [creatingRootTaskInline, newRootTaskInputResetKey, isSavingRootInline]);

  useEffect(() => {
    if (!creatingSubtaskParentId || isSavingSubtaskInline) return;

    const frameId = window.requestAnimationFrame(() => {
      newSubtaskInputRef.current?.focus();
      newSubtaskInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [creatingSubtaskParentId, newSubtaskInputResetKey, isSavingSubtaskInline]);

  const handleInlineEditorKeyDown = (event: React.KeyboardEvent, task: Task) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void saveInlineEdit(task);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelInlineEdit();
    }
  };

  const handleInlineSubtaskKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === 'NumpadEnter') {
      event.preventDefault();
      void saveInlineSubtaskCreate(true);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelInlineSubtaskCreate();
    }
  };

  const handleInlineRootTaskKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === 'NumpadEnter') {
      event.preventDefault();
      void saveInlineRootTaskCreate(true);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelInlineRootTaskCreate();
    }
  };

  const saveInlineEdit = async (task: Task) => {
    if (!canManage || isSavingInline) return;
    const nextName = editingRowData.taskName.trim();

    if (!nextName) return;

    const currentDueDate = task.DueDate ? String(task.DueDate).split('T')[0] : '';
    const nextDueDate = editingRowData.dueDate.trim();

    if (nextDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
      return;
    }

    const hasChanges =
      nextName !== (task.TaskName || '').trim() ||
      Number(task.AssignedTo || 0) !== Number(editingRowData.assignedTo || 0) ||
      Number(task.TaskType || 0) !== Number(editingRowData.taskType || 0) ||
      Number(task.Status || 0) !== Number(editingRowData.status || 0) ||
      Number(task.Priority || 0) !== Number(editingRowData.priority || 0) ||
      currentDueDate !== nextDueDate;

    if (!hasChanges) {
      cancelInlineEdit();
      return;
    }

    const updateData: Partial<CreateTaskData> = {
      taskName: nextName,
      assignedTo: editingRowData.assignedTo || undefined,
      taskType: editingRowData.taskType,
      status: editingRowData.status,
      priority: editingRowData.priority,
      dueDate: nextDueDate || undefined,
    };

    setIsSavingInline(true);
    try {
      await onInlineSaveTask(task.Id, updateData);
      cancelInlineEdit();
    } catch (error) {
      onError?.(getErrorMessage(error, 'Failed to save task'));
      setIsSavingInline(false);
    }
  };

  // Recursive function to render task and all its descendants

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <TasksToolbar
        canCreate={canCreate}
        showImportDropdown={showImportDropdown}
        setShowImportDropdown={setShowImportDropdown}
        showCheckStatusDropdown={showCheckStatusDropdown}
        setShowCheckStatusDropdown={setShowCheckStatusDropdown}
        showTemplateDropdown={showTemplateDropdown}
        setShowTemplateDropdown={setShowTemplateDropdown}
        setShowTemplateSaveModal={setShowTemplateSaveModal}
        setShowTemplateApplyModal={setShowTemplateApplyModal}
        hasJiraBoardIntegration={Boolean(hasJiraBoardIntegration)}
        hasJiraTicketIntegration={Boolean(hasJiraTicketIntegration)}
        hasTaskStatusCheckOption={Boolean(hasTaskStatusCheckOption)}
        hasGitHubIntegration={Boolean(hasGitHubIntegration)}
        hasGiteaIntegration={Boolean(hasGiteaIntegration)}
        hasOutlookQueueItems={hasOutlookQueueItems}
        onImportClick={onImportClick}
        onImportFromJira={onImportFromJira}
        onImportFromJiraTicket={onImportFromJiraTicket}
        onImportFromOutlookQueue={onImportFromOutlookQueue}
        onImportFromGitHub={onImportFromGitHub}
        onImportFromGitea={onImportFromGitea}
        onCheckJiraTicketStatus={onCheckJiraTicketStatus}
        onCheckJiraBoardStatus={onCheckJiraBoardStatus}
        onCreateTask={onCreateTask}
      />

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
              className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
            >
              Create Task
            </button>
          )}
        </div>
      ) : (
        <TasksTable
          filterPanel={
            <TasksFilterPanel
              filterText={filterText}
              setFilterText={setFilterText}
              filterTaskType={filterTaskType}
              setFilterTaskType={setFilterTaskType}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              filterPriority={filterPriority}
              setFilterPriority={setFilterPriority}
              filterAssignee={filterAssignee}
              setFilterAssignee={setFilterAssignee}
              filterTagIds={filterTagIds}
              setFilterTagIds={setFilterTagIds}
              hideClosed={hideClosed}
              setHideClosed={setHideClosed}
              unplannedOnly={unplannedOnly}
              setUnplannedOnly={setUnplannedOnly}
              isFilterActive={isFilterActive}
              resetTaskFilters={resetTaskFilters}
              taskTypeOptions={taskTypeOptions}
              statusOptions={statusOptions}
              priorityOptions={priorityOptions}
              assigneeOptions={assigneeOptions}
              tagFilterOptions={tagFilterOptions}
            />
          }
          projectId={Number(project.Id)}
          canManage={canManage}
          canCreate={canCreate}
          selectedTaskIds={selectedTaskIds}
          setSelectedTaskIds={setSelectedTaskIds}
          handleOpenBulkEditModal={handleOpenBulkEditModal}
          taskRowDensity={taskRowDensity}
          setTaskRowDensity={setTaskRowDensity}
          showTaskColumnsPanel={showTaskColumnsPanel}
          setShowTaskColumnsPanel={setShowTaskColumnsPanel}
          taskColumnsPanelPosition={taskColumnsPanelPosition}
          setTaskColumnsPanelPosition={setTaskColumnsPanelPosition}
          taskSelectableColumnIds={taskSelectableColumnIds}
          taskColumnSizeMode={taskColumnSizeMode}
          setTaskColumnSizeMode={setTaskColumnSizeMode}
          taskColumnOrder={taskColumnOrder}
          setTaskColumnOrder={setTaskColumnOrder}
          taskColumnOptions={taskColumnOptions}
          taskColumnSizing={taskColumnSizing}
          setTaskColumnSizing={setTaskColumnSizing}
          isTaskColumnVisible={isTaskColumnVisible}
          setHiddenTaskColumns={setHiddenTaskColumns}
          getTaskColumnCurrentWidth={getTaskColumnCurrentWidth}
          taskDefaultHiddenColumns={taskDefaultHiddenColumns}
          tasksGridRef={tasksGridRef}
          allVisibleTasksSelected={allVisibleTasksSelected}
          toggleSelectAllVisibleTasks={toggleSelectAllVisibleTasks}
          getTaskAriaSort={getTaskAriaSort}
          handleSort={handleSort}
          getTaskSortIndicator={getTaskSortIndicator}
          taskColumnDragProps={taskColumnDragProps}
          startInlineRootTaskCreate={startInlineRootTaskCreate}
          additionalTaskColumnKeys={additionalTaskColumnKeys}
          formatAdditionalTaskColumnLabel={formatAdditionalTaskColumnLabel}
          visibleParentTasks={visibleParentTasks}
          canDelete={canDelete}
          getSubtasks={getSubtasks}
          getDisplayOrderSortedTasks={getDisplayOrderSortedTasks}
          hasMatchingDescendant={hasMatchingDescendant}
          isFilterActive={isFilterActive}
          taskMatchesFilters={taskMatchesFilters}
          shouldAutoExpandForFilters={shouldAutoExpandForFilters}
          expandedTasks={expandedTasks}
          editingRowTaskId={editingRowTaskId}
          editingRowData={editingRowData}
          setEditingRowData={setEditingRowData}
          isSavingInline={isSavingInline}
          dragOverTaskId={dragOverTaskId}
          draggedTaskId={draggedTaskId}
          onTaskDragStart={onTaskDragStart}
          onTaskDragOver={onTaskDragOver}
          onTaskDragLeave={onTaskDragLeave}
          onTaskDrop={onTaskDrop}
          startInlineEdit={startInlineEdit}
          toggleTaskSelection={toggleTaskSelection}
          startInlineSubtaskCreate={startInlineSubtaskCreate}
          toggleExpand={toggleExpand}
          onEditTask={onEditTask}
          handleInlineEditorKeyDown={handleInlineEditorKeyDown}
          taskTagMap={taskTagMap}
          renderAdditionalTaskColumnValue={renderAdditionalTaskColumnValue}
          saveInlineEdit={saveInlineEdit}
          cancelInlineEdit={cancelInlineEdit}
          onDeleteTask={onDeleteTask}
          creatingSubtaskParentId={creatingSubtaskParentId}
          isSavingSubtaskInline={isSavingSubtaskInline}
          newSubtaskData={newSubtaskData}
          setNewSubtaskData={setNewSubtaskData}
          newSubtaskInputResetKey={newSubtaskInputResetKey}
          handleInlineSubtaskKeyDown={handleInlineSubtaskKeyDown}
          newSubtaskInputRef={newSubtaskInputRef}
          saveInlineSubtaskCreate={saveInlineSubtaskCreate}
          cancelInlineSubtaskCreate={cancelInlineSubtaskCreate}
          creatingRootTaskInline={creatingRootTaskInline}
          newRootTaskData={newRootTaskData}
          setNewRootTaskData={setNewRootTaskData}
          taskTypeOptions={taskTypeOptions}
          assigneeOptions={assigneeOptions}
          statusOptions={statusOptions}
          priorityOptions={priorityOptions}
          newRootTaskInputResetKey={newRootTaskInputResetKey}
          handleInlineRootTaskKeyDown={handleInlineRootTaskKeyDown}
          newRootTaskInputRef={newRootTaskInputRef}
          isSavingRootInline={isSavingRootInline}
          saveInlineRootTaskCreate={saveInlineRootTaskCreate}
          cancelInlineRootTaskCreate={cancelInlineRootTaskCreate}
          showBulkEditModal={showBulkEditModal}
          handleCloseBulkEditModal={handleCloseBulkEditModal}
          isApplyingBulkEdit={isApplyingBulkEdit}
          bulkEditError={bulkEditError}
          bulkEditData={bulkEditData}
          setBulkEditData={setBulkEditData}
          availableApplications={availableApplications}
          bulkApplicationVersions={bulkApplicationVersions}
          bulkParentTaskOptions={bulkParentTaskOptions}
          bulkTagIds={bulkTagIds}
          setBulkTagIds={setBulkTagIds}
          tagFilterOptions={tagFilterOptions}
          handleApplyBulkEdit={handleApplyBulkEdit}
        />
      )}

      <TaskDragActionModal
        open={Boolean(showDragDropActionModal && dragDropSourceTaskId && dragDropTargetTaskId)}
        onAction={handleDragDropAction}
        onCancel={() => {
          setShowDragDropActionModal(false);
          setDragDropSourceTaskId(null);
          setDragDropTargetTaskId(null);
        }}
      />

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
