'use client';

import React, { useState } from 'react';
import { User } from '@/lib/api/users';
import { getApiUrl } from '@/lib/api/config';
import type {
  Sprint,
  RetrospectiveActionItem,
  RetrospectiveClosureBySprint,
} from '@/components/projects/sprints/types';

export function RetrospectiveActionsPanel({
  sprints,
  retrospectiveActions,
  retrospectiveClosure,
  retroUsers,
  token,
  onReload,
  onError,
}: {
  sprints: Sprint[];
  retrospectiveActions: RetrospectiveActionItem[];
  retrospectiveClosure: RetrospectiveClosureBySprint[];
  retroUsers: User[];
  token: string;
  onReload: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const API_URL = getApiUrl();
  const [isSavingRetro, setIsSavingRetro] = useState(false);
  const [retroForm, setRetroForm] = useState({
    sprintId: '',
    title: '',
    description: '',
    ownerUserId: '',
    dueDate: '',
  });

  const saveRetrospectiveAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retroForm.sprintId || !retroForm.title.trim()) {
      onError('Sprint and retrospective action title are required');
      return;
    }

    setIsSavingRetro(true);
    try {
      const response = await fetch(`${API_URL}/api/retrospective-actions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sprintId: Number(retroForm.sprintId),
          title: retroForm.title.trim(),
          description: retroForm.description.trim() || null,
          ownerUserId: retroForm.ownerUserId ? Number(retroForm.ownerUserId) : null,
          dueDate: retroForm.dueDate || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        onError(data.message || 'Failed to create retrospective action');
        return;
      }

      setRetroForm({ sprintId: '', title: '', description: '', ownerUserId: '', dueDate: '' });
      await onReload();
    } catch {
      onError('Failed to create retrospective action');
    } finally {
      setIsSavingRetro(false);
    }
  };

  const toggleRetrospectiveAction = async (action: RetrospectiveActionItem) => {
    try {
      await fetch(`${API_URL}/api/retrospective-actions/${action.Id}/close`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isClosed: Number(action.IsClosed) === 1 ? 0 : 1 }),
      });
      await onReload();
    } catch {
      onError('Failed to update retrospective action status');
    }
  };

  const deleteRetrospectiveAction = async (actionId: number) => {
    try {
      await fetch(`${API_URL}/api/retrospective-actions/${actionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await onReload();
    } catch {
      onError('Failed to delete retrospective action');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Retrospective Actions</h3>
        <form onSubmit={saveRetrospectiveAction} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Sprint</label>
            <select
              value={retroForm.sprintId}
              onChange={(e) => setRetroForm((prev) => ({ ...prev, sprintId: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            >
              <option value="">Select sprint</option>
              {sprints.map((sprint) => (
                <option key={sprint.Id} value={sprint.Id}>{sprint.Name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Action</label>
            <input
              type="text"
              value={retroForm.title}
              onChange={(e) => setRetroForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Define one improvement action"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Owner (optional)</label>
            <select
              value={retroForm.ownerUserId}
              onChange={(e) => setRetroForm((prev) => ({ ...prev, ownerUserId: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Unassigned</option>
              {retroUsers.map((userOption) => (
                <option key={userOption.Id} value={userOption.Id}>
                  {userOption.FirstName && userOption.LastName
                    ? `${userOption.FirstName} ${userOption.LastName}`
                    : userOption.Username}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Due date (optional)</label>
            <input
              type="date"
              value={retroForm.dueDate}
              onChange={(e) => setRetroForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Description (optional)</label>
            <textarea
              value={retroForm.description}
              onChange={(e) => setRetroForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Expected impact and context"
            />
          </div>
          <button
            type="submit"
            disabled={isSavingRetro}
            className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isSavingRetro ? 'Saving...' : 'Add Action'}
          </button>
        </form>
      </div>

      <div className="xl:col-span-2 space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Closure Rate by Sprint</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Sprint</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Closed</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Closure Rate</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {retrospectiveClosure.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      No retrospective data yet.
                    </td>
                  </tr>
                ) : (
                  retrospectiveClosure.map((item) => (
                    <tr key={item.sprintId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{item.sprintName}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700 dark:text-gray-300">{item.closedActions}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700 dark:text-gray-300">{item.totalActions}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-gray-900 dark:text-white">{item.closureRate}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Action Tracker</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Action</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Sprint</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Owner</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Due</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                  <th scope="col" className="relative px-4 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {retrospectiveActions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      No retrospective actions yet.
                    </td>
                  </tr>
                ) : (
                  retrospectiveActions.map((item) => (
                    <tr key={item.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                        <div className="font-medium">{item.Title}</div>
                        {item.Description && <div className="text-xs text-gray-500 dark:text-gray-400">{item.Description}</div>}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{item.SprintName || '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                        {item.OwnerFirstName && item.OwnerLastName ? `${item.OwnerFirstName} ${item.OwnerLastName}` : item.OwnerUsername || 'Unassigned'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{item.DueDate ? String(item.DueDate).split('T')[0] : '-'}</td>
                      <td className="px-4 py-2 text-sm">
                        {Number(item.IsClosed) === 1 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Closed</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">Open</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => toggleRetrospectiveAction(item)}
                            title={Number(item.IsClosed) === 1 ? 'Reopen action' : 'Close action'}
                            aria-label={Number(item.IsClosed) === 1 ? 'Reopen action' : 'Close action'}
                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRetrospectiveAction(item.Id)}
                            title="Delete action"
                            aria-label="Delete action"
                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
