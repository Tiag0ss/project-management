'use client';

import React from 'react';
import { Task } from '@/lib/api/tasks';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import {
  InlineTextField,
  InlineDateField,
  SearchableSelect,
} from '@/components/projects/ProjectInlineFields';
import { TaskTypeBadge } from '@/lib/taskTypeIcons';
import SegmentedTagBadge from '@/components/tags/SegmentedTagBadge';
import { useColorVision } from '@/hooks/useColorVision';

export function TasksTable({
  filterPanel,
  projectId,
  canManage,
  canCreate,
  selectedTaskIds,
  setSelectedTaskIds,
  handleOpenBulkEditModal,
  taskRowDensity,
  setTaskRowDensity,
  showTaskColumnsPanel,
  setShowTaskColumnsPanel,
  taskColumnsPanelPosition,
  setTaskColumnsPanelPosition,
  taskSelectableColumnIds,
  taskColumnSizeMode,
  setTaskColumnSizeMode,
  taskColumnOrder,
  setTaskColumnOrder,
  taskColumnOptions,
  taskColumnSizing,
  setTaskColumnSizing,
  isTaskColumnVisible,
  setHiddenTaskColumns,
  getTaskColumnCurrentWidth,
  taskDefaultHiddenColumns,
  tasksGridRef,
  allVisibleTasksSelected,
  toggleSelectAllVisibleTasks,
  getTaskAriaSort,
  handleSort,
  getTaskSortIndicator,
  taskColumnDragProps,
  startInlineRootTaskCreate,
  additionalTaskColumnKeys,
  formatAdditionalTaskColumnLabel,
  visibleParentTasks,
  canDelete,
  getSubtasks,
  getDisplayOrderSortedTasks,
  hasMatchingDescendant,
  isFilterActive,
  taskMatchesFilters,
  shouldAutoExpandForFilters,
  expandedTasks,
  editingRowTaskId,
  editingRowData,
  setEditingRowData,
  isSavingInline,
  dragOverTaskId,
  draggedTaskId,
  onTaskDragStart,
  onTaskDragOver,
  onTaskDragLeave,
  onTaskDrop,
  startInlineEdit,
  toggleTaskSelection,
  startInlineSubtaskCreate,
  toggleExpand,
  onEditTask,
  handleInlineEditorKeyDown,
  taskTagMap,
  renderAdditionalTaskColumnValue,
  saveInlineEdit,
  cancelInlineEdit,
  onDeleteTask,
  creatingSubtaskParentId,
  isSavingSubtaskInline,
  newSubtaskData,
  setNewSubtaskData,
  newSubtaskInputResetKey,
  handleInlineSubtaskKeyDown,
  newSubtaskInputRef,
  saveInlineSubtaskCreate,
  cancelInlineSubtaskCreate,
  creatingRootTaskInline,
  newRootTaskData,
  setNewRootTaskData,
  taskTypeOptions,
  assigneeOptions,
  statusOptions,
  priorityOptions,
  newRootTaskInputResetKey,
  handleInlineRootTaskKeyDown,
  newRootTaskInputRef,
  isSavingRootInline,
  saveInlineRootTaskCreate,
  cancelInlineRootTaskCreate,
  showBulkEditModal,
  handleCloseBulkEditModal,
  isApplyingBulkEdit,
  bulkEditError,
  bulkEditData,
  setBulkEditData,
  availableApplications,
  bulkApplicationVersions,
  bulkParentTaskOptions,
  bulkTagIds,
  setBulkTagIds,
  tagFilterOptions,
  handleApplyBulkEdit,
}: {
  filterPanel: React.ReactNode;
  projectId: number;
  canManage: boolean;
  canCreate: boolean;
  selectedTaskIds: Set<number>;
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  handleOpenBulkEditModal: () => void;
  taskRowDensity: 'compact' | 'comfortable';
  setTaskRowDensity: React.Dispatch<React.SetStateAction<'compact' | 'comfortable'>>;
  showTaskColumnsPanel: boolean;
  setShowTaskColumnsPanel: React.Dispatch<React.SetStateAction<boolean>>;
  taskColumnsPanelPosition: { top: number; left: number };
  setTaskColumnsPanelPosition: React.Dispatch<React.SetStateAction<{ top: number; left: number }>>;
  taskSelectableColumnIds: string[];
  taskColumnSizeMode: Record<string, 'fixed' | 'grow'>;
  setTaskColumnSizeMode: React.Dispatch<React.SetStateAction<Record<string, 'fixed' | 'grow'>>>;
  taskColumnOrder: string[];
  setTaskColumnOrder: React.Dispatch<React.SetStateAction<string[]>>;
  taskColumnOptions: Array<{ id: string; label: string }>;
  taskColumnSizing: Record<string, number>;
  setTaskColumnSizing: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  isTaskColumnVisible: (columnId: string) => boolean;
  setHiddenTaskColumns: React.Dispatch<React.SetStateAction<string[]>>;
  getTaskColumnCurrentWidth: (columnId: string) => number;
  taskDefaultHiddenColumns: string[];
  tasksGridRef: React.RefObject<HTMLDivElement | null>;
  allVisibleTasksSelected: boolean;
  toggleSelectAllVisibleTasks: () => void;
  getTaskAriaSort: (field: string) => 'none' | 'ascending' | 'descending';
  handleSort: (field: string) => void;
  getTaskSortIndicator: (field: string) => string | null;
  taskColumnDragProps: (columnKey: string) => Record<string, unknown>;
  startInlineRootTaskCreate: () => void;
  additionalTaskColumnKeys: string[];
  formatAdditionalTaskColumnLabel: (rawKey: string) => string;
  visibleParentTasks: Task[];
  canDelete: boolean;
  getSubtasks: (parentId: number) => Task[];
  getDisplayOrderSortedTasks: (taskList: Task[]) => Task[];
  hasMatchingDescendant: (task: Task) => boolean;
  isFilterActive: boolean;
  taskMatchesFilters: (task: Task) => boolean;
  shouldAutoExpandForFilters: boolean;
  expandedTasks: Set<number>;
  editingRowTaskId: number | null;
  editingRowData: {
    taskName: string;
    assignedTo: number | null;
    taskType: number | null;
    status: number | null;
    priority: number | null;
    dueDate: string;
  };
  setEditingRowData: React.Dispatch<React.SetStateAction<{
    taskName: string;
    assignedTo: number | null;
    taskType: number | null;
    status: number | null;
    priority: number | null;
    dueDate: string;
  }>>;
  isSavingInline: boolean;
  dragOverTaskId: number | null;
  draggedTaskId: number | null;
  onTaskDragStart: (e: React.DragEvent<HTMLTableRowElement>, taskId: number) => void;
  onTaskDragOver: (e: React.DragEvent<HTMLTableRowElement>, taskId: number) => void;
  onTaskDragLeave: (e: React.DragEvent<HTMLTableRowElement>) => void;
  onTaskDrop: (e: React.DragEvent<HTMLTableRowElement>, targetTaskId: number) => void;
  startInlineEdit: (task: Task) => void;
  toggleTaskSelection: (taskId: number) => void;
  startInlineSubtaskCreate: (parentTaskId: number) => void;
  toggleExpand: (taskId: number) => void;
  onEditTask: (task: Task) => void;
  handleInlineEditorKeyDown: (event: React.KeyboardEvent, task: Task) => void;
  taskTagMap: Map<number, Array<{ id: number; name: string; color: string }>>;
  renderAdditionalTaskColumnValue: (task: Task, rawKey: string) => string;
  saveInlineEdit: (task: Task) => void | Promise<void>;
  cancelInlineEdit: () => void;
  onDeleteTask: (id: number) => void;
  creatingSubtaskParentId: number | null;
  isSavingSubtaskInline: boolean;
  newSubtaskData: {
    taskName: string;
    assignedTo: number | null;
    taskType: number | null;
    status: number | null;
    priority: number | null;
    dueDate: string;
  };
  setNewSubtaskData: React.Dispatch<React.SetStateAction<{
    taskName: string;
    assignedTo: number | null;
    taskType: number | null;
    status: number | null;
    priority: number | null;
    dueDate: string;
  }>>;
  newSubtaskInputResetKey: number;
  handleInlineSubtaskKeyDown: (event: React.KeyboardEvent) => void;
  newSubtaskInputRef: React.RefObject<HTMLInputElement | null>;
  saveInlineSubtaskCreate: (keepCreating?: boolean) => void | Promise<void>;
  cancelInlineSubtaskCreate: () => void;
  creatingRootTaskInline: boolean;
  newRootTaskData: {
    taskName: string;
    assignedTo: number | null;
    taskType: number | null;
    status: number | null;
    priority: number | null;
    dueDate: string;
  };
  setNewRootTaskData: React.Dispatch<React.SetStateAction<{
    taskName: string;
    assignedTo: number | null;
    taskType: number | null;
    status: number | null;
    priority: number | null;
    dueDate: string;
  }>>;
  taskTypeOptions: Array<{ id: number; name: string }>;
  assigneeOptions: Array<{ id: number; name: string }>;
  statusOptions: Array<{ id: number; name: string }>;
  priorityOptions: Array<{ id: number; name: string }>;
  newRootTaskInputResetKey: number;
  handleInlineRootTaskKeyDown: (event: React.KeyboardEvent) => void;
  newRootTaskInputRef: React.RefObject<HTMLInputElement | null>;
  isSavingRootInline: boolean;
  saveInlineRootTaskCreate: (keepCreating?: boolean) => void | Promise<void>;
  cancelInlineRootTaskCreate: () => void;
  showBulkEditModal: boolean;
  handleCloseBulkEditModal: () => void;
  isApplyingBulkEdit: boolean;
  bulkEditError: string;
  bulkEditData: {
    statusId: number | undefined;
    assignedToId: number | undefined;
    applicationId: number | undefined;
    releaseVersionId: number | undefined;
    parentTaskId: number | undefined;
  };
  setBulkEditData: React.Dispatch<React.SetStateAction<{
    statusId: number | undefined;
    assignedToId: number | undefined;
    applicationId: number | undefined;
    releaseVersionId: number | undefined;
    parentTaskId: number | undefined;
  }>>;
  availableApplications: Array<{ Id: number; Name: string }>;
  bulkApplicationVersions: Array<{ Id: number; VersionNumber: string; VersionName: string | null; Status: string }>;
  bulkParentTaskOptions: Array<{ id: number; label: string }>;
  bulkTagIds: number[];
  setBulkTagIds: React.Dispatch<React.SetStateAction<number[]>>;
  tagFilterOptions: Array<{ value: number; label: string; subtitle?: string }>;
  handleApplyBulkEdit: () => void | Promise<void>;
}) {
  const { pillStyle } = useColorVision();
  const getStatusStyle = (task: Task) => pillStyle(task.StatusColor, { alpha: '20' }) ?? {};
  const getPriorityStyle = (task: Task) => pillStyle(task.PriorityColor, { alpha: '20' }) ?? {};

  const renderTaskRow = (task: Task, level: number = 0): React.JSX.Element[] => {
    const subtasks = getDisplayOrderSortedTasks(getSubtasks(task.Id));
    const hasAnyMatchingDescendant = hasMatchingDescendant(task);

    if (isFilterActive && !taskMatchesFilters(task) && !hasAnyMatchingDescendant) {
      return [];
    }

    const isExpanded = shouldAutoExpandForFilters ? true : expandedTasks.has(task.Id);
    const hasSubtasks = subtasks.length > 0;
    const isEditingRow = editingRowTaskId === task.Id;
    const isRowSaveDisabled = isSavingInline || !editingRowData.taskName.trim();
    const indentPixels = level * 24; // 24px per level
    const plainDescription = task.Description
      ? task.Description.replace(/<[^>]*>/g, '').trim()
      : '';
    const taskTooltip = [
      task.TaskName,
      plainDescription ? `Description: ${plainDescription}` : '',
      task.CreatorName && level === 0 ? `Created by: ${task.CreatorName}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const rows: React.JSX.Element[] = [];

    // Render current task
    rows.push(
      <tr 
        key={task.Id} 
        data-task-row-id={task.Id}
        draggable={true}
        onDragStart={(e) => onTaskDragStart(e, task.Id)}
        onDragOver={(e) => onTaskDragOver(e, task.Id)}
        onDragLeave={onTaskDragLeave}
        onDrop={(e) => onTaskDrop(e, task.Id)}
        className={`group ${level > 0 ? 'bg-gray-50 dark:bg-gray-700/30' : ''} hover:bg-gray-100 dark:hover:bg-gray-700/50 ${
          dragOverTaskId === task.Id ? 'bg-blue-100 dark:bg-blue-900/30 border-t-2 border-blue-500' : ''
        } ${draggedTaskId === task.Id ? 'opacity-50' : ''}`}
        onDoubleClick={() => startInlineEdit(task)}
      >
        <td className="w-8 min-w-[2rem] max-w-[2rem] px-1 py-2 text-center" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-center gap-1">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity" title="Drag to reorder or change parent">
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 3h2v2H9V3zm0 4h2v2H9V7zm0 4h2v2H9v-2zm4-8h2v2h-2V3zm0 4h2v2h-2V7zm0 4h2v2h-2v-2z" />
              </svg>
            </div>
            <input
              type="checkbox"
              checked={selectedTaskIds.has(task.Id)}
              onChange={() => toggleTaskSelection(task.Id)}
              className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              aria-label={`Select task ${task.TaskName}`}
            />
          </div>
        </td>
        <td className="px-2 py-2">
          {isEditingRow ? (
            <SearchableSelect
              value={editingRowData.taskType ?? undefined}
              onChange={(value) => {
                setEditingRowData((prev) => ({
                  ...prev,
                  taskType: value ?? null,
                }));
              }}
              options={taskTypeOptions.map((taskType) => ({ id: taskType.id, label: taskType.name }))}
              placeholder="Task Type"
              className="w-full"
            />
          ) : task.TaskTypeName ? (
            <div className="flex w-full items-center justify-between gap-2">
              <TaskTypeBadge
                name={task.TaskTypeName}
                color={task.TaskTypeColor}
                iconSvg={task.TaskTypeIconSvg}
              />
              {canCreate && canManage && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    startInlineSubtaskCreate(task.Id);
                  }}
                  title="Add subtask"
                  className="ml-auto opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-semibold transition-opacity"
                >
                  +
                </button>
              )}
            </div>
          ) : <span className="text-xs text-gray-400">-</span>}
        </td>
        <td
          className={`px-2 py-2 ${isEditingRow ? '' : 'cursor-pointer'}`}
          onClick={() => {
            if (isEditingRow) return;
            onEditTask(task);
          }}
        >
          <div className="flex items-center gap-1.5" style={{ marginLeft: `${indentPixels}px` }}>
            {hasSubtasks ? (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  toggleExpand(task.Id);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-transform flex-shrink-0"
                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >
                ▶
              </button>
            ) : (
              <span className="w-4"></span>
            )}
            {level > 0 && <span className="text-gray-400 flex-shrink-0">↳</span>}
            <div title={taskTooltip || undefined} className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {isEditingRow ? (
                  <InlineTextField
                    value={editingRowData.taskName}
                    onChange={(e) => setEditingRowData((prev) => ({ ...prev, taskName: e.target.value }))}
                    onKeyDown={(e) => handleInlineEditorKeyDown(e, task)}
                    autoFocus
                    className="w-full"
                  />
                ) : (
                  <span className={`text-sm ${level > 0 ? 'text-gray-700 dark:text-gray-300' : 'font-medium text-gray-900 dark:text-white'}`}>
                    {task.TaskName}
                  </span>
                )}
                {!isEditingRow && hasSubtasks && (
                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded-full flex-shrink-0">
                    {subtasks.length}
                  </span>
                )}
                {!isEditingRow && task.EstimatedHours && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                    ⏱️ {task.EstimatedHours}h
                  </span>
                )}
              </div>
              {!isEditingRow && (taskTagMap.get(task.Id) || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(taskTagMap.get(task.Id) || []).map(tag => (
                    <SegmentedTagBadge
                      key={`${task.Id}-${tag.id}`}
                      name={tag.name}
                      color={tag.color}
                      size="xs"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          {isEditingRow ? (
            <SearchableSelect
              value={editingRowData.assignedTo ?? undefined}
              onChange={(value) => {
                setEditingRowData((prev) => ({
                  ...prev,
                  assignedTo: value ?? null,
                }));
              }}
              options={assigneeOptions.map((assignee) => ({ id: assignee.id, label: assignee.name }))}
              placeholder="Unassigned"
              className="w-full"
            />
          ) : task.AssigneeName ? (
            <div className="flex items-center gap-1">
              <span>👤</span>
              <span>{task.AssigneeName}</span>
            </div>
          ) : (
            <span className="text-gray-400 dark:text-gray-500 italic">Unassigned</span>
          )}
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          {isEditingRow ? (
            <SearchableSelect
              value={editingRowData.status ?? undefined}
              onChange={(value) => {
                setEditingRowData((prev) => ({
                  ...prev,
                  status: value ?? null,
                }));
              }}
              options={statusOptions.map((status) => ({ id: status.id, label: status.name }))}
              placeholder="Status"
              className="w-full"
            />
          ) : (
            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" style={getStatusStyle(task)}>
              {task.StatusName || 'Unknown'}
            </span>
          )}
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          {isEditingRow ? (
            <SearchableSelect
              value={editingRowData.priority ?? undefined}
              onChange={(value) => {
                setEditingRowData((prev) => ({
                  ...prev,
                  priority: value ?? null,
                }));
              }}
              options={priorityOptions.map((priority) => ({ id: priority.id, label: priority.name }))}
              placeholder="Priority"
              className="w-full"
            />
          ) : (
            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" style={getPriorityStyle(task)}>
              {task.PriorityName || 'No Priority'}
            </span>
          )}
        </td>
        <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
          {isEditingRow ? (
            <InlineDateField
              value={editingRowData.dueDate}
              onChange={(e) => setEditingRowData((prev) => ({ ...prev, dueDate: e.target.value }))}
              onKeyDown={(e) => handleInlineEditorKeyDown(e, task)}
              className="w-full"
            />
          ) : (
            task.DueDate ? new Date(task.DueDate).toLocaleDateString() : '-'
          )}
        </td>
        {additionalTaskColumnKeys.map((columnKey) => (
          <td key={`task-${task.Id}-extra-${columnKey}`} className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
            {renderAdditionalTaskColumnValue(task, columnKey)}
          </td>
        ))}
        <td className="px-2 py-2 whitespace-nowrap text-right text-sm font-medium">
          {canManage && isEditingRow ? (
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => void saveInlineEdit(task)}
                disabled={isRowSaveDisabled}
                title={isSavingInline ? 'Saving task' : 'Save task'}
                aria-label={isSavingInline ? 'Saving task' : 'Save task'}
                className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50"
              >
                {isSavingInline ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <button
                onClick={cancelInlineEdit}
                title="Cancel edit"
                aria-label="Cancel edit"
                className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : canManage ? (
            <button
              onClick={() => onEditTask(task)}
              title="Edit task"
              aria-label="Edit task"
              className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
              </svg>
            </button>
          ) : null}
          {canDelete && !isEditingRow && (
            <button
              onClick={() => onDeleteTask(task.Id)}
              title="Delete task"
              aria-label="Delete task"
              className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
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

    if (creatingSubtaskParentId === task.Id) {
      const isSubtaskSaveDisabled =
        isSavingSubtaskInline ||
        !newSubtaskData.taskName.trim() ||
        !newSubtaskData.status ||
        !newSubtaskData.priority;

      rows.push(
        <tr
          key={`new-subtask-${task.Id}`}
          data-task-new-subtask-parent-id={task.Id}
          className="bg-blue-50/60 dark:bg-blue-900/10"
        >
          <td className="w-8 min-w-[2rem] max-w-[2rem] px-1 py-2"></td>
          <td className="px-2 py-2">
            <SearchableSelect
              value={newSubtaskData.taskType ?? undefined}
              onChange={(value) => {
                setNewSubtaskData((prev) => ({
                  ...prev,
                  taskType: value ?? null,
                }));
              }}
              options={taskTypeOptions.map((taskType) => ({ id: taskType.id, label: taskType.name }))}
              placeholder="Task Type"
              className="w-full"
            />
          </td>
          <td className="px-2 py-2">
            <div className="flex items-center gap-1.5" style={{ marginLeft: `${(level + 1) * 24}px` }}>
              <span className="w-4"></span>
              <span className="text-gray-400 flex-shrink-0">↳</span>
              <InlineTextField
                key={`new-subtask-input-${task.Id}-${newSubtaskInputResetKey}`}
                value={newSubtaskData.taskName}
                onChange={(e) => setNewSubtaskData((prev) => ({ ...prev, taskName: e.target.value }))}
                onKeyDown={handleInlineSubtaskKeyDown}
                inputRef={newSubtaskInputRef}
                autoFocus
                className="w-full"
                placeholder="New subtask name"
              />
            </div>
          </td>
          <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
            <SearchableSelect
              value={newSubtaskData.assignedTo ?? undefined}
              onChange={(value) => {
                setNewSubtaskData((prev) => ({
                  ...prev,
                  assignedTo: value ?? null,
                }));
              }}
              options={assigneeOptions.map((assignee) => ({ id: assignee.id, label: assignee.name }))}
              placeholder="Unassigned"
              className="w-full"
            />
          </td>
          <td className="px-2 py-2 whitespace-nowrap">
            <SearchableSelect
              value={newSubtaskData.status ?? undefined}
              onChange={(value) => {
                setNewSubtaskData((prev) => ({
                  ...prev,
                  status: value ?? null,
                }));
              }}
              options={statusOptions.map((status) => ({ id: status.id, label: status.name }))}
              placeholder="Status"
              className="w-full"
            />
          </td>
          <td className="px-2 py-2 whitespace-nowrap">
            <SearchableSelect
              value={newSubtaskData.priority ?? undefined}
              onChange={(value) => {
                setNewSubtaskData((prev) => ({
                  ...prev,
                  priority: value ?? null,
                }));
              }}
              options={priorityOptions.map((priority) => ({ id: priority.id, label: priority.name }))}
              placeholder="Priority"
              className="w-full"
            />
          </td>
          <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
            <InlineDateField
              value={newSubtaskData.dueDate}
              onChange={(e) => setNewSubtaskData((prev) => ({ ...prev, dueDate: e.target.value }))}
              onKeyDown={handleInlineSubtaskKeyDown}
              className="w-full"
            />
          </td>
          {additionalTaskColumnKeys.map((columnKey) => (
            <td key={`new-subtask-extra-${task.Id}-${columnKey}`} className="px-2 py-2 whitespace-nowrap text-sm text-gray-400 dark:text-gray-500">
              -
            </td>
          ))}
          <td className="px-2 py-2 whitespace-nowrap text-right text-sm font-medium">
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => void saveInlineSubtaskCreate(false)}
                disabled={isSubtaskSaveDisabled}
                title={isSavingSubtaskInline ? 'Saving subtask' : 'Save subtask'}
                aria-label={isSavingSubtaskInline ? 'Saving subtask' : 'Save subtask'}
                className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50"
              >
                {isSavingSubtaskInline ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={cancelInlineSubtaskCreate}
                title="Cancel subtask"
                aria-label="Cancel subtask"
                className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </td>
        </tr>
      );
    }

    return rows;
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="shrink-0 space-y-3">
          {filterPanel}
          {selectedTaskIds.size > 0 && canManage && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm text-blue-800 dark:text-blue-200">
                {selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTaskIds(new Set())}
                  className="h-9 px-3 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  onClick={handleOpenBulkEditModal}
                  className="h-9 px-3 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Bulk Edit
                </button>
              </div>
            </div>
          )}

          {/* Grid enhancer controls */}
          <div className="mb-2 flex justify-end relative p-2 pb-0">
            <div className="flex items-center gap-2">
              <div className="h-9 flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setTaskRowDensity('comfortable')}
                  className={`h-7 px-3 text-sm rounded-md transition-colors ${taskRowDensity === 'comfortable' ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                >
                  Comfy
                </button>
                <button
                  type="button"
                  onClick={() => setTaskRowDensity('compact')}
                  className={`h-7 px-3 text-sm rounded-md transition-colors ${taskRowDensity === 'compact' ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                >
                  Compact
                </button>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  const buttonRect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  const panelWidth = 448;
                  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
                  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                  const top = Math.min(viewportHeight - 20, buttonRect.bottom + 8);
                  const left = Math.max(8, Math.min(viewportWidth - panelWidth - 8, buttonRect.right - panelWidth));
                  setTaskColumnsPanelPosition({ top, left });
                  setShowTaskColumnsPanel((previous) => !previous);
                }}
                className="h-9 px-3 rounded-lg text-sm font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 transition-colors"
              >
                Columns
              </button>
            </div>
            {showTaskColumnsPanel && (
              <>
                <div className="fixed inset-0 z-[2147483646]" onClick={() => setShowTaskColumnsPanel(false)}></div>
                <div
                  className="fixed z-[2147483647] w-[28rem] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3"
                  style={{ top: `${taskColumnsPanelPosition.top}px`, left: `${taskColumnsPanelPosition.left}px` }}
                >
                  <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Table Columns</div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                    {taskSelectableColumnIds.filter((columnId) => taskColumnSizeMode[columnId] === 'fixed').length > 0
                      ? `${taskSelectableColumnIds.filter((columnId) => taskColumnSizeMode[columnId] === 'fixed').length} fixed column${taskSelectableColumnIds.filter((columnId) => taskColumnSizeMode[columnId] === 'fixed').length > 1 ? 's' : ''}`
                      : 'No fixed columns'}
                  </div>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {(taskColumnOrder.length > 0 ? taskColumnOrder : taskSelectableColumnIds).map((columnId, index) => {
                      const option = taskColumnOptions.find((entry) => entry.id === columnId);
                      if (!option) return null;
                      const mode = taskColumnSizeMode[option.id] === 'fixed' ? 'fixed' : 'grow';
                      const widthValue = Number.isFinite(taskColumnSizing[option.id])
                        ? taskColumnSizing[option.id]
                        : getTaskColumnCurrentWidth(option.id);
                      return (
                        <div key={`task-column-${option.id}`} className="flex items-center gap-2 flex-wrap">
                          <input
                            type="checkbox"
                            checked={isTaskColumnVisible(option.id)}
                            onChange={() => {
                              setHiddenTaskColumns((previous) =>
                                previous.includes(option.id)
                                  ? previous.filter((columnKey) => columnKey !== option.id)
                                  : [...previous, option.id]
                              );
                            }}
                            className="h-4 w-4"
                          />
                          <div className="flex-1 text-sm text-gray-800 dark:text-gray-200">{option.label}</div>
                            <button
                              type="button"
                              onClick={() => {
                                if (index === 0) return;
                                setTaskColumnOrder((previous) => {
                                  const currentOrder = [...(previous.length > 0 ? previous : taskSelectableColumnIds)];
                                  [currentOrder[index - 1], currentOrder[index]] = [currentOrder[index], currentOrder[index - 1]];
                                  return currentOrder;
                                });
                              }}
                              disabled={index === 0}
                              className="px-2 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (index === (taskColumnOrder.length > 0 ? taskColumnOrder.length : taskSelectableColumnIds.length) - 1) return;
                                setTaskColumnOrder((previous) => {
                                  const currentOrder = [...(previous.length > 0 ? previous : taskSelectableColumnIds)];
                                  [currentOrder[index + 1], currentOrder[index]] = [currentOrder[index], currentOrder[index + 1]];
                                  return currentOrder;
                                });
                              }}
                              disabled={index === (taskColumnOrder.length > 0 ? taskColumnOrder.length : taskSelectableColumnIds.length) - 1}
                              className="px-2 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50"
                            >
                              ↓
                            </button>
                            <select
                              value={mode}
                              onChange={(event) => {
                                const nextMode = event.target.value === 'fixed' ? 'fixed' : 'grow';
                                setTaskColumnSizeMode((previous) => ({
                                  ...previous,
                                  [option.id]: nextMode,
                                }));
                                if (nextMode === 'fixed') {
                                  setTaskColumnSizing((previous) => ({
                                    ...previous,
                                    [option.id]: Number.isFinite(previous[option.id]) ? previous[option.id] : getTaskColumnCurrentWidth(option.id),
                                  }));
                                }
                              }}
                              className="px-2 py-1 rounded text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100"
                            >
                              <option value="grow">Grow</option>
                              <option value="fixed">Fixed</option>
                            </select>
                            <input
                              type="number"
                              min={60}
                              max={1400}
                              step={1}
                              value={String(widthValue)}
                              onChange={(event) => {
                                const nextWidth = Math.max(60, Math.min(1400, Math.round(Number(event.target.value) || 140)));
                                setTaskColumnSizeMode((previous) => ({
                                  ...previous,
                                  [option.id]: 'fixed',
                                }));
                                setTaskColumnSizing((previous) => ({
                                  ...previous,
                                  [option.id]: nextWidth,
                                }));
                              }}
                              disabled={mode !== 'fixed'}
                              className="w-20 px-2 py-1 rounded text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTaskColumnOrder(taskSelectableColumnIds);
                        setHiddenTaskColumns(taskDefaultHiddenColumns);
                        setTaskColumnSizing({});
                        setTaskColumnSizeMode(Object.fromEntries(taskSelectableColumnIds.map((columnId) => [columnId, 'grow' as const])));
                        setTaskRowDensity('comfortable');
                      }}
                      className="mt-3 h-9 px-3 rounded-lg text-sm font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </>
              )}
          </div>

        </div>

          <div
            className="min-h-0 w-full flex-1 overflow-auto rounded-lg border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800"
            ref={tasksGridRef}
            data-grid-enhancer-ignore="true"
          >
          <table data-grid-disable-sort="true" data-grid-disable-reorder="true" data-grid-key={`project-tasks-${Number(projectId)}-v2`} className={`w-full min-w-max divide-y divide-gray-200 dark:divide-gray-700 ${taskRowDensity === 'compact' ? 'grid-density-compact' : ''}`}>
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-[0_1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
              <tr>
                <th data-column-key="select" scope="col" className="w-8 min-w-[2rem] max-w-[2rem] px-1 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleTasksSelected}
                    onChange={toggleSelectAllVisibleTasks}
                    className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                    aria-label="Select all visible tasks"
                  />
                </th>
                <th
                  data-column-key="task-type"
                  data-grid-sort-ignore="true"
                  aria-sort={getTaskAriaSort('TaskTypeName')}
                  onClick={() => handleSort('TaskTypeName')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                  {...taskColumnDragProps('task-type')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1">Task Type {getTaskSortIndicator('TaskTypeName') && <span className="text-gray-400 dark:text-gray-500">{getTaskSortIndicator('TaskTypeName')}</span>}</span>
                    {canCreate && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          startInlineRootTaskCreate();
                        }}
                        title="Add level 0 task"
                        aria-label="Add level 0 task"
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-semibold"
                      >
                        +
                      </button>
                    )}
                  </div>
                </th>
                <th
                  data-column-key="task"
                  data-grid-sort-ignore="true"
                  aria-sort={getTaskAriaSort('task')}
                  onClick={() => handleSort('task')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                  {...taskColumnDragProps('task')}
                >
                  <div className="flex items-center gap-1">Task {getTaskSortIndicator('task') && <span className="text-gray-400 dark:text-gray-500">{getTaskSortIndicator('task')}</span>}</div>
                </th>
                <th
                  data-column-key="assigned-to"
                  data-grid-sort-ignore="true"
                  aria-sort={getTaskAriaSort('assignee')}
                  onClick={() => handleSort('assignee')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                  {...taskColumnDragProps('assigned-to')}
                >
                  <div className="flex items-center gap-1">Assigned To {getTaskSortIndicator('assignee') && <span className="text-gray-400 dark:text-gray-500">{getTaskSortIndicator('assignee')}</span>}</div>
                </th>
                <th
                  data-column-key="status"
                  data-grid-sort-ignore="true"
                  aria-sort={getTaskAriaSort('status')}
                  onClick={() => handleSort('status')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                  {...taskColumnDragProps('status')}
                >
                  <div className="flex items-center gap-1">Status {getTaskSortIndicator('status') && <span className="text-gray-400 dark:text-gray-500">{getTaskSortIndicator('status')}</span>}</div>
                </th>
                <th
                  data-column-key="priority"
                  data-grid-sort-ignore="true"
                  aria-sort={getTaskAriaSort('priority')}
                  onClick={() => handleSort('priority')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                  {...taskColumnDragProps('priority')}
                >
                  <div className="flex items-center gap-1">Priority {getTaskSortIndicator('priority') && <span className="text-gray-400 dark:text-gray-500">{getTaskSortIndicator('priority')}</span>}</div>
                </th>
                <th
                  data-column-key="due-date"
                  data-grid-sort-ignore="true"
                  aria-sort={getTaskAriaSort('dueDate')}
                  onClick={() => handleSort('dueDate')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                  {...taskColumnDragProps('due-date')}
                >
                  <div className="flex items-center gap-1">Due Date {getTaskSortIndicator('dueDate') && <span className="text-gray-400 dark:text-gray-500">{getTaskSortIndicator('dueDate')}</span>}</div>
                </th>
                {additionalTaskColumnKeys.map((columnKey) => (
                  <th
                    key={`extra-header-${columnKey}`}
                    data-column-key={`extra-${columnKey}`}
                    data-default-hidden="true"
                    aria-sort={getTaskAriaSort(`extra:${columnKey}`)}
                    onClick={() => handleSort(`extra:${columnKey}`)}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                    {...taskColumnDragProps(`extra-${columnKey}`)}
                  >
                    <div className="inline-flex items-center gap-1">
                      {formatAdditionalTaskColumnLabel(columnKey)}
                      {getTaskSortIndicator(`extra:${columnKey}`) && <span className="text-gray-400 dark:text-gray-500">{getTaskSortIndicator(`extra:${columnKey}`)}</span>}
                    </div>
                  </th>
                ))}
                <th data-column-key="actions" scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {visibleParentTasks.length > 0 ? (
                <>
                  {visibleParentTasks.map((task) => renderTaskRow(task))}
                  {creatingRootTaskInline && (
                    <tr data-task-new-root-row="true" className="bg-blue-50/60 dark:bg-blue-900/10">
                      <td className="w-8 min-w-[2rem] max-w-[2rem] px-1 py-2"></td>
                      <td className="px-2 py-2">
                        <SearchableSelect
                          value={newRootTaskData.taskType ?? undefined}
                          onChange={(value) => {
                            setNewRootTaskData((prev) => ({
                              ...prev,
                              taskType: value ?? null,
                            }));
                          }}
                          options={taskTypeOptions.map((taskType) => ({ id: taskType.id, label: taskType.name }))}
                          placeholder="Task Type"
                          className="w-full"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <InlineTextField
                          key={`new-root-task-input-${newRootTaskInputResetKey}`}
                          value={newRootTaskData.taskName}
                          onChange={(e) => setNewRootTaskData((prev) => ({ ...prev, taskName: e.target.value }))}
                          onKeyDown={handleInlineRootTaskKeyDown}
                          inputRef={newRootTaskInputRef}
                          autoFocus
                          className="w-full"
                          placeholder="New task name"
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        <SearchableSelect
                          value={newRootTaskData.assignedTo ?? undefined}
                          onChange={(value) => {
                            setNewRootTaskData((prev) => ({
                              ...prev,
                              assignedTo: value ?? null,
                            }));
                          }}
                          options={assigneeOptions.map((assignee) => ({ id: assignee.id, label: assignee.name }))}
                          placeholder="Unassigned"
                          className="w-full"
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <SearchableSelect
                          value={newRootTaskData.status ?? undefined}
                          onChange={(value) => {
                            setNewRootTaskData((prev) => ({
                              ...prev,
                              status: value ?? null,
                            }));
                          }}
                          options={statusOptions.map((status) => ({ id: status.id, label: status.name }))}
                          placeholder="Status"
                          className="w-full"
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <SearchableSelect
                          value={newRootTaskData.priority ?? undefined}
                          onChange={(value) => {
                            setNewRootTaskData((prev) => ({
                              ...prev,
                              priority: value ?? null,
                            }));
                          }}
                          options={priorityOptions.map((priority) => ({ id: priority.id, label: priority.name }))}
                          placeholder="Priority"
                          className="w-full"
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        <InlineDateField
                          value={newRootTaskData.dueDate}
                          onChange={(e) => setNewRootTaskData((prev) => ({ ...prev, dueDate: e.target.value }))}
                          onKeyDown={handleInlineRootTaskKeyDown}
                          className="w-full"
                        />
                      </td>
                      {additionalTaskColumnKeys.map((columnKey) => (
                        <td key={`new-root-extra-${columnKey}`} className="px-2 py-2 whitespace-nowrap text-sm text-gray-400 dark:text-gray-500">
                          -
                        </td>
                      ))}
                      <td className="px-2 py-2 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void saveInlineRootTaskCreate(false)}
                            disabled={isSavingRootInline || !newRootTaskData.taskName.trim() || !newRootTaskData.status || !newRootTaskData.priority}
                            title={isSavingRootInline ? 'Saving task' : 'Save task'}
                            aria-label={isSavingRootInline ? 'Saving task' : 'Save task'}
                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50"
                          >
                            {isSavingRootInline ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={cancelInlineRootTaskCreate}
                            title="Cancel task"
                            aria-label="Cancel task"
                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ) : (
                <tr>
                  <td colSpan={8 + additionalTaskColumnKeys.length} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No tasks match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

      </div>

      {showBulkEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Bulk Edit Tasks</h3>
                <button
                  type="button"
                  onClick={handleCloseBulkEditModal}
                  disabled={isApplyingBulkEdit}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Updates will be applied to {selectedTaskIds.size} selected task{selectedTaskIds.size !== 1 ? 's' : ''}. Leave fields as "Do not change" to keep current values.
              </p>

              {bulkEditError && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg text-sm">
                  {bulkEditError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                  <SearchableSelect
                    value={bulkEditData.statusId}
                    onChange={(value) => setBulkEditData((prev) => ({ ...prev, statusId: value }))}
                    options={statusOptions.map((status) => ({ id: status.id, label: status.name }))}
                    placeholder="Do not change"
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Assignee</label>
                  <SearchableSelect
                    value={bulkEditData.assignedToId}
                    onChange={(value) => setBulkEditData((prev) => ({ ...prev, assignedToId: value }))}
                    options={assigneeOptions.map((assignee) => ({ id: assignee.id, label: assignee.name }))}
                    placeholder="Do not change"
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Application</label>
                  <SearchableSelect
                    value={bulkEditData.applicationId}
                    onChange={(value) => setBulkEditData((prev) => ({
                      ...prev,
                      applicationId: value,
                      releaseVersionId: undefined,
                    }))}
                    options={availableApplications.map((application) => ({ id: application.Id, label: application.Name }))}
                    placeholder="Do not change"
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Version</label>
                  <SearchableSelect
                    value={bulkEditData.releaseVersionId}
                    onChange={(value) => setBulkEditData((prev) => ({ ...prev, releaseVersionId: value }))}
                    options={bulkApplicationVersions.map((version) => ({
                      id: version.Id,
                      label: `${version.VersionNumber}${version.VersionName ? ` - ${version.VersionName}` : ''} (${version.Status})`,
                    }))}
                    placeholder={bulkEditData.applicationId ? 'Do not change' : 'Select application first'}
                    className="w-full"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Parent Task</label>
                  <SearchableSelect
                    value={bulkEditData.parentTaskId}
                    onChange={(value) => setBulkEditData((prev) => ({ ...prev, parentTaskId: value }))}
                    options={bulkParentTaskOptions}
                    placeholder="Do not change"
                    className="w-full"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tags</label>
                  <SearchableMultiSelect
                    values={bulkTagIds}
                    onChange={(values) => setBulkTagIds(values.map((value) => Number(value)).filter((value) => Number.isFinite(value)))}
                    options={tagFilterOptions}
                    placeholder="Do not change"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    If you select tags here, selected tasks will have their tags replaced by this set.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleCloseBulkEditModal}
                  disabled={isApplyingBulkEdit}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyBulkEdit}
                  disabled={isApplyingBulkEdit}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {isApplyingBulkEdit ? 'Updating...' : 'Update Selected Tasks'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
