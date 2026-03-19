'use client';

import SearchableSelect from './SearchableSelect';

interface TimerStartTask {
  Id: number;
  TaskName: string;
  ProjectName?: string;
}

interface TimerStartModalProps {
  isOpen: boolean;
  error: string;
  isLoadingTasks: boolean;
  tasks: TimerStartTask[];
  selectedTaskId: number | null;
  startTime: string;
  isStarting: boolean;
  onClose: () => void;
  onTaskChange: (taskId: number | null) => void;
  onStartTimeChange: (time: string) => void;
  onStart: () => void;
}

export default function TimerStartModal({
  isOpen,
  error,
  isLoadingTasks,
  tasks,
  selectedTaskId,
  startTime,
  isStarting,
  onClose,
  onTaskChange,
  onStartTimeChange,
  onStart,
}: TimerStartModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Start Timer</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Task <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                value={selectedTaskId?.toString() || ''}
                onChange={(value) => onTaskChange(value ? parseInt(value, 10) : null)}
                options={tasks.map((task) => ({
                  value: task.Id,
                  label: `${task.TaskName}${task.ProjectName ? ` — ${task.ProjectName}` : ''}`,
                }))}
                placeholder={isLoadingTasks ? 'Loading tasks...' : 'Select Task'}
                emptyText={isLoadingTasks ? 'Loading tasks...' : 'No tasks available'}
                disabled={isLoadingTasks}
                autoSelectSingleOption
              />
              {!isLoadingTasks && tasks.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No tasks found in projects you can access.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(event) => onStartTimeChange(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onStart}
              disabled={isStarting || !selectedTaskId || !startTime}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
            >
              {isStarting ? 'Starting...' : 'Start Timer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
