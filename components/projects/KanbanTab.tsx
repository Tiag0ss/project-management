'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Task } from '@/lib/api/tasks';
import { Project } from '@/lib/api/projects';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { tasksApi } from '@/lib/api/tasks';
import { TaskTypeIconMark } from '@/lib/taskTypeIcons';
import {
  filterVisibleStatuses,
  getHiddenStatusIdsForOrg,
  getHiddenStatusesByOrgFromCookie,
  setHiddenStatusesByOrgCookie,
  withHiddenStatusToggled,
  type HiddenStatusesByOrg,
} from '@/lib/dashboardKanbanPrefs';
import { useColorVision } from '@/hooks/useColorVision';

export function KanbanTab({
  tasks,
  project,
  onTaskUpdated,
  onError,
  onCreateTask,
  onEditTask,
  token,
  canCreate,
  canManage,
}: {
  tasks: Task[];
  project: Project;
  onTaskUpdated: () => void;
  onError: (message: string) => void;
  onCreateTask: () => void;
  onEditTask: (task: Task) => void;
  token: string;
  canCreate: boolean;
  canManage: boolean;
}) {
  const { pillStyle, borderLeftStyle } = useColorVision();
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggedOverTask, setDraggedOverTask] = useState<number | null>(null);
  // Local copy of tasks for optimistic drag-and-drop ordering
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const draggedTaskId = useRef<number | null>(null);
  const [hiddenStatusesByOrg, setHiddenStatusesByOrg] = useState<HiddenStatusesByOrg>({});
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const statusPickerRef = useRef<HTMLDivElement | null>(null);

  // Sync when parent refreshes tasks
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    setHiddenStatusesByOrg(getHiddenStatusesByOrgFromCookie());
  }, []);

  useEffect(() => {
    if (!statusPickerOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (statusPickerRef.current && target && !statusPickerRef.current.contains(target)) {
        setStatusPickerOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [statusPickerOpen]);

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

  const toggleStatusVisibility = (statusId: number, visible: boolean) => {
    setHiddenStatusesByOrg((prev) => {
      const next = withHiddenStatusToggled(prev, project.OrganizationId, statusId, !visible);
      setHiddenStatusesByOrgCookie(next);
      return next;
    });
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
      const updated = columnTasks.map((t, i) => ({ ...t, Status: newStatus, DisplayOrder: (i + 1) * 10 }));
      return [...current.filter(t => t.Status !== newStatus && t.Id !== srcId), ...updated];
    });

    try {
      await tasksApi.reorderKanban(updates, token);
      onError('');
      // Only trigger full reload if status changed (so other views stay accurate)
      if (srcTask.Status !== newStatus) onTaskUpdated();
    } catch (err: any) {
      setLocalTasks(prev); // rollback
      onError(err?.message || 'Failed to reorder tasks');
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
      onError('');
      onTaskUpdated();
    } catch (err: any) {
      setLocalTasks(prev);
      onError(err?.message || 'Failed to move task');
    }
  };

  const getPriorityBorder = (task: Task) => {
    return borderLeftStyle(task.PriorityColor) ?? { borderLeft: '4px solid #d1d5db' };
  };

  if (isLoading) {
    return <div className="text-center py-12">Loading Kanban board...</div>;
  }

  const allStatuses =
    taskStatuses.length > 0
      ? [...taskStatuses].sort((a, b) => a.SortOrder - b.SortOrder)
      : ([{ Id: -1, StatusName: 'To Do', SortOrder: 0 }, { Id: -2, StatusName: 'In Progress', SortOrder: 1 }, { Id: -3, StatusName: 'Done', SortOrder: 2 }] as StatusValue[]);

  const hiddenIds = getHiddenStatusIdsForOrg(hiddenStatusesByOrg, project.OrganizationId);
  const statuses = filterVisibleStatuses(allStatuses, hiddenIds);
  const hiddenCount = allStatuses.length - statuses.length;
  const columnsPerRow = Math.min(Math.max(statuses.length, 1), 6);

  return (
    <div className="h-[calc(100vh-220px)] min-h-[560px] flex flex-col">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div ref={statusPickerRef} className="relative min-w-[160px]">
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Statuses
          </span>
          <button
            type="button"
            onClick={() => setStatusPickerOpen((open) => !open)}
            className="w-full min-w-[10rem] h-9 px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-left"
            aria-expanded={statusPickerOpen}
            aria-haspopup="dialog"
          >
            {hiddenCount === 0 ? 'All statuses' : `${statuses.length}/${allStatuses.length} visible`}
          </button>
          {statusPickerOpen && (
            <div
              role="dialog"
              aria-label="Kanban status visibility"
              className="absolute z-30 mt-1 w-72 max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg p-2"
            >
              <p className="px-1 pb-2 text-[11px] text-gray-500 dark:text-gray-400">
                Choose which status columns to show
              </p>
              {allStatuses.map((status) => {
                const visible = !hiddenIds.includes(Number(status.Id));
                return (
                  <label
                    key={`project-kanban-status-toggle-${status.Id}`}
                    className="flex items-center gap-2 px-1 py-1.5 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/60 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={(e) => toggleStatusVisibility(Number(status.Id), e.target.checked)}
                    />
                    <span
                      className="truncate"
                      style={status.ColorCode ? { color: status.ColorCode } : undefined}
                    >
                      {status.StatusName}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {canCreate && (
          <button
            onClick={onCreateTask}
            className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center gap-2"
          >
            <span className="text-base leading-none">+</span>
            New Task
          </button>
        )}
      </div>

      {statuses.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-8 text-sm text-gray-500 dark:text-gray-400">
          No status columns visible. Use Statuses to show at least one column.
        </div>
      ) : (
      <div className="w-full overflow-x-auto flex-1 min-h-0">
        <div
          className="grid gap-4 h-full"
          style={{ gridTemplateColumns: `repeat(${columnsPerRow}, minmax(260px, 1fr))` }}
        >
        {statuses.map((status) => (
          <div
            key={status.Id}
            className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 h-full min-h-0 flex flex-col overflow-hidden"
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

            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
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

                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-2 flex items-center gap-1.5 min-w-0">
                      <TaskTypeIconMark
                        name={task.TaskTypeName}
                        iconSvg={task.TaskTypeIconSvg}
                        color={task.TaskTypeColor}
                        className="w-3.5 h-3.5"
                      />
                      <span className="truncate">{task.TaskName}</span>
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
                        style={pillStyle(task.PriorityColor, { alpha: '20' })}
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
      )}
    </div>
  );
}
