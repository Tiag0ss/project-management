'use client';

import React, { useEffect, useState } from 'react';
import { Task } from '@/lib/api/tasks';
import { TaskTypeIconMark } from '@/lib/taskTypeIcons';

export function GanttViewTab({ tasks }: { tasks: Task[] }) {
  type ViewMode = 'Week' | 'Month' | 'Year';
  const [viewMode, setViewMode] = useState<ViewMode>('Month');
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  
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

  useEffect(() => {
    const parentIds = new Set<number>();
    for (const task of tasks) {
      if (tasks.some(child => child.ParentTaskId === task.Id)) {
        parentIds.add(task.Id);
      }
    }
    setExpandedTasks(parentIds);
  }, [tasks]);
  
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

  const toggleExpand = (taskId: number) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const compareTaskHierarchyOrder = (a: Task, b: Task) => {
    const aOrder = Number(a.DisplayOrder || 0);
    const bOrder = Number(b.DisplayOrder || 0);
    if (aOrder !== bOrder) return aOrder - bOrder;

    const aStart = a.PlannedStartDate ? new Date(a.PlannedStartDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bStart = b.PlannedStartDate ? new Date(b.PlannedStartDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (aStart !== bStart) return aStart - bStart;

    return (a.TaskName || '').localeCompare(b.TaskName || '');
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

  const getPlannedSubtasks = (parentId: number) =>
    tasksWithPlanning
      .filter(task => task.ParentTaskId === parentId)
      .sort(compareTaskHierarchyOrder);

  const hasVisibleDescendantInRange = (taskId: number): boolean => {
    const children = getPlannedSubtasks(taskId);
    for (const child of children) {
      if (getTaskPosition(child) !== null || hasVisibleDescendantInRange(child.Id)) {
        return true;
      }
    }
    return false;
  };
  
  // Filter to only show tasks that are visible in the current date range
  const visibleTasksWithPlanning = tasksWithPlanning.filter(t => {
    const position = getTaskPosition(t);
    return position !== null || hasVisibleDescendantInRange(t.Id);
  });

  const visiblePlannedTaskIds = new Set(visibleTasksWithPlanning.map(task => task.Id));
  const visibleRootTasks = visibleTasksWithPlanning
    .filter(task => !task.ParentTaskId || !visiblePlannedTaskIds.has(task.ParentTaskId))
    .sort(compareTaskHierarchyOrder);

  return (
    <div>
      <div className="mb-6 flex justify-end gap-4">
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
            {(() => {
              const renderGanttRow = (task: Task, level: number = 0): React.JSX.Element[] => {
                const subtasks = getPlannedSubtasks(task.Id).filter(subtask => visiblePlannedTaskIds.has(subtask.Id));
                const hasSubtasks = subtasks.length > 0;
                const isExpanded = expandedTasks.has(task.Id);
                const position = getTaskPosition(task);
                const indent = level * 20;
                const rows: React.JSX.Element[] = [];

                rows.push(
                  <div
                    key={task.Id}
                    className={`flex border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${level > 0 ? 'bg-gray-50/60 dark:bg-gray-700/30' : ''}`}
                  >
                    <div className="w-64 flex-shrink-0 px-4 py-4">
                      <div className="flex items-start gap-2" style={{ marginLeft: `${indent}px` }}>
                        {hasSubtasks ? (
                          <button
                            onClick={() => toggleExpand(task.Id)}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-transform mt-0.5"
                            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                            title={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                          >
                            ▶
                          </button>
                        ) : (
                          <span className="w-4" />
                        )}
                        {level > 0 && <span className="text-gray-400 mt-0.5">↳</span>}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <TaskTypeIconMark
                              name={task.TaskTypeName}
                              iconSvg={task.TaskTypeIconSvg}
                              color={task.TaskTypeColor}
                              className="w-3.5 h-3.5"
                            />
                            <div className={`text-sm truncate ${level > 0 ? 'text-gray-800 dark:text-gray-200' : 'font-medium text-gray-900 dark:text-white'}`}>
                              {task.TaskName}
                            </div>
                            {hasSubtasks && (
                              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">
                                {subtasks.length}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {task.AssigneeName || 'Unassigned'}
                          </div>
                        </div>
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

                if (hasSubtasks && isExpanded) {
                  for (const subtask of subtasks) {
                    rows.push(...renderGanttRow(subtask, level + 1));
                  }
                }

                return rows;
              };

              return visibleRootTasks.flatMap(rootTask => renderGanttRow(rootTask, 0));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
