'use client';

import React, { useState } from 'react';
import {
  calculateRecursiveWorked,
  getParentTasks,
  getSubtasks,
  sumLeafEstimatedHours,
  sumLeafWorkedHours,
  sumParentAllocatedHours,
} from '@/components/projects/reporting/reportingHours';

type HoursFmt = (hours: number) => string;
type PillStyle = (
  color: string | null | undefined,
  opts?: { alpha?: string; borderAlpha?: string }
) => React.CSSProperties | undefined;

export function ReportingSummaryPanel({
  tasks,
  isLoading,
  decimalHoursToHMS,
  pillStyle,
  onShowTaskDetail,
}: {
  tasks: any[];
  isLoading: boolean;
  decimalHoursToHMS: HoursFmt;
  pillStyle: PillStyle;
  onShowTaskDetail: (task: any) => void;
}) {
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());

  const toggleExpand = (taskId: number) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const parentTasks = getParentTasks(tasks);
  const totalEstimatedHours = sumLeafEstimatedHours(tasks);
  const totalTaskAllocatedHours = sumParentAllocatedHours(tasks);
  const totalTaskWorkedHours = sumLeafWorkedHours(tasks);
  const totalToAllocateHours = totalEstimatedHours - totalTaskAllocatedHours;

  const renderReportTaskRow = (task: any, level: number = 0): React.JSX.Element[] => {
    const allocated = parseFloat(task.TotalAllocated || 0);
    const worked = calculateRecursiveWorked(tasks, task.Id);
    const toAllocate = parseFloat(task.EstimatedHours || 0) - allocated;
    const subtasks = getSubtasks(tasks, task.Id);
    const taskHasSubtasks = subtasks.length > 0;
    const isExpanded = expandedTasks.has(task.Id);
    const indentPixels = level * 24;

    const rows: React.JSX.Element[] = [];

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
          <span
            className="px-2 py-1 text-xs font-semibold rounded-full"
            style={pillStyle(task.StatusColor, { alpha: '20' })}
          >
            {task.StatusName || 'Unknown'}
          </span>
        </td>
        <td className={`px-4 py-3 text-sm text-right ${level === 0 ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>
          {decimalHoursToHMS(parseFloat(task.EstimatedHours || 0))}
        </td>
        <td className={`px-4 py-3 text-sm text-right ${level === 0 ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-blue-500 dark:text-blue-400'}`}>
          {decimalHoursToHMS(allocated)}
        </td>
        <td className={`px-4 py-3 text-sm text-right ${level === 0 ? 'text-orange-600 dark:text-orange-400 font-medium' : 'text-orange-500 dark:text-orange-400'}`}>
          {decimalHoursToHMS(toAllocate)}
        </td>
        <td className={`px-4 py-3 text-sm text-right ${level === 0 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-green-500 dark:text-green-400'}`}>
          {decimalHoursToHMS(worked)}
        </td>
        <td className="px-4 py-3 text-center">
          <button
            onClick={() => onShowTaskDetail(task)}
            className={`${level === 0 ? 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-sm' : 'text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-xs'}`}
          >
            Details
          </button>
        </td>
      </tr>
    );

    if (isExpanded && taskHasSubtasks) {
      subtasks.forEach((subtask) => {
        rows.push(...renderReportTaskRow(subtask, level + 1));
      });
    }

    return rows;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Total Estimated Hours</div>
          <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
            {decimalHoursToHMS(totalEstimatedHours)}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Total Allocated Hours</div>
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            {decimalHoursToHMS(totalTaskAllocatedHours)}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">To Allocate</div>
          <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
            {decimalHoursToHMS(totalToAllocateHours)}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Total Worked Hours</div>
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">
            {decimalHoursToHMS(totalTaskWorkedHours)}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Tasks Summary</h2>

          {isLoading ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">No tasks found</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
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
                    <th scope="col" className="relative px-4 py-3">
                      <span className="sr-only">Actions</span>
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
                      {decimalHoursToHMS(totalEstimatedHours)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-right text-blue-600 dark:text-blue-400">
                      {decimalHoursToHMS(totalTaskAllocatedHours)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-right text-orange-600 dark:text-orange-400">
                      {decimalHoursToHMS(totalToAllocateHours)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-right text-green-600 dark:text-green-400">
                      {decimalHoursToHMS(totalTaskWorkedHours)}
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
  );
}
