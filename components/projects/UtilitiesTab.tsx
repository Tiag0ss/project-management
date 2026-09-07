'use client';

import { useState } from 'react';
import { getApiUrl } from '@/lib/api/config';

export function UtilitiesTab({ projectId, token, onTasksUpdated }: { projectId: number; token: string; onTasksUpdated: () => void }) {
  const [results, setResults] = useState<{ action: string; message: string; details: any[] } | null>(null);
  const [isRunning, setIsRunning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; action: () => void } | null>(null);

  const runUtility = async (endpoint: string, actionName: string, needsConfirm = false) => {
    if (needsConfirm && !confirmAction) {
      setConfirmAction({
        title: `Confirm: ${actionName}`,
        message: `Are you sure you want to run "${actionName}"? This action will modify task data and cannot be undone.`,
        action: () => {
          setConfirmAction(null);
          runUtility(endpoint, actionName, false);
        },
      });
      return;
    }

    try {
      setError('');
      setResults(null);
      setIsRunning(actionName);

      const response = await fetch(`${getApiUrl()}/api/tasks/utilities/${endpoint}/${projectId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to run utility');
      }

      setResults({
        action: actionName,
        message: data.message,
        details: data.updates || [],
      });

      onTasksUpdated();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsRunning(null);
    }
  };

  const utilities = [
    {
      id: 'recalculate-hours',
      icon: '🔢',
      name: 'Recalculate Parent Hours',
      description: 'Updates the estimated hours of all parent tasks based on the sum of their children. Processes multi-level hierarchies from bottom to top.',
      endpoint: 'recalculate-hours',
      confirmNeeded: false,
    },
    {
      id: 'reassign-from-planning',
      icon: '👤',
      name: 'Reassign from Planning',
      description: 'Updates the AssignedTo field of tasks to match the user they are planned/allocated to in the Gantt chart.',
      endpoint: 'reassign-from-planning',
      confirmNeeded: false,
    },
    {
      id: 'update-due-dates',
      icon: '📅',
      name: 'Update Due Dates from Planning',
      description: 'Sets the DueDate of each task to its PlannedEndDate, keeping due dates in sync with the planning schedule.',
      endpoint: 'update-due-dates',
      confirmNeeded: false,
    },
    {
      id: 'sync-parent-status',
      icon: '🔄',
      name: 'Sync Parent Status from Children',
      description: 'Updates parent task status based on children: "Done" if all children are done, "In Progress" if any child is in progress, or "To Do" if all are pending.',
      endpoint: 'sync-parent-status',
      confirmNeeded: false,
    },
    {
      id: 'clear-planning',
      icon: '🗑️',
      name: 'Clear All Planning',
      description: 'Removes all task allocations, child allocations, planned dates, and assignments. Use this to start planning from scratch.',
      endpoint: 'clear-planning',
      confirmNeeded: true,
    },
  ];

  return (
    <div>
      <p className="text-gray-600 dark:text-gray-400 mb-6">Bulk operations to keep your project data consistent and up to date.</p>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {utilities.map((util) => (
          <div
            key={util.id}
            className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl">{util.icon}</span>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{util.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{util.description}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => runUtility(util.endpoint, util.name, util.confirmNeeded)}
                disabled={isRunning !== null}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  util.confirmNeeded
                    ? 'bg-red-600 hover:bg-red-700 text-white disabled:opacity-50'
                    : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'
                }`}
              >
                {isRunning === util.name ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Running...
                  </span>
                ) : (
                  'Run'
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Results Panel */}
      {results && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-green-500 text-xl">✅</span>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{results.action}</h3>
          </div>
          <p className="text-gray-700 dark:text-gray-300 mb-4">{results.message}</p>

          {results.details.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Task</th>
                    {results.details[0]?.oldHours !== undefined && (
                      <>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Old Hours</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">New Hours</th>
                      </>
                    )}
                    {results.details[0]?.oldUser !== undefined && (
                      <>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Previous</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">New Assignment</th>
                      </>
                    )}
                    {results.details[0]?.oldDueDate !== undefined && (
                      <>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Old Due Date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">New Due Date</th>
                      </>
                    )}
                    {results.details[0]?.oldStatus !== undefined && (
                      <>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Old Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">New Status</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {results.details.map((item: any, idx: number) => (
                    <tr key={idx} className="bg-white dark:bg-gray-800">
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{item.taskName}</td>
                      {item.oldHours !== undefined && (
                        <>
                          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{item.oldHours}h</td>
                          <td className="px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400">{item.newHours}h</td>
                        </>
                      )}
                      {item.oldUser !== undefined && (
                        <>
                          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{item.oldUser}</td>
                          <td className="px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400">{item.newUser}</td>
                        </>
                      )}
                      {item.oldDueDate !== undefined && (
                        <>
                          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{item.oldDueDate || 'None'}</td>
                          <td className="px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400">{item.newDueDate}</td>
                        </>
                      )}
                      {item.oldStatus !== undefined && (
                        <>
                          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{item.oldStatus}</td>
                          <td className="px-4 py-2 text-sm font-medium text-green-600 dark:text-green-400">{item.newStatus}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {results.details.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 italic">No changes were needed — everything is already up to date.</p>
          )}
        </div>
      )}

      {/* Confirm Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-start mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">{confirmAction.title}</h3>
                  <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">{confirmAction.message}</div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAction.action}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
