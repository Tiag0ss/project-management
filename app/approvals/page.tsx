'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import Navbar from '@/components/Navbar';
import { getApiUrl } from '@/lib/api/config';
import { useRouter } from 'next/navigation';

interface PendingEntry {
  Id: number;
  TaskId: number;
  UserId: number;
  WorkDate: string;
  Hours: number;
  Description?: string;
  TaskName: string;
  ProjectId: number;
  ProjectName: string;
  Username: string;
  FirstName?: string;
  LastName?: string;
  StartTime?: string;
  EndTime?: string;
  ApprovalStatus: string;
  ApprovedBy?: number;
  ApprovedAt?: string;
  TeamLeaderUsername?: string;
}

interface Subordinate {
  Id: number;
  Username: string;
  FirstName?: string;
  LastName?: string;
}

const normalizeDateString = (dateValue: any): string => {
  if (dateValue instanceof Date) return dateValue.toISOString().split('T')[0];
  return String(dateValue).split('T')[0];
};

const getUserDisplayName = (entry: { FirstName?: string; LastName?: string; Username: string }) => {
  if (entry.FirstName && entry.LastName) return `${entry.FirstName} ${entry.LastName}`;
  if (entry.FirstName) return entry.FirstName;
  return entry.Username;
};

const getApprovalBadge = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'approved':
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">✓ Approved</span>;
    case 'rejected':
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">✗ Rejected</span>;
    default:
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">⏳ Pending</span>;
  }
};

export default function ApprovalsPage() {
  const { user, token } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();

  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [subordinates, setSubordinates] = useState<Subordinate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filterUserId, setFilterUserId] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [filterDateTo, setFilterDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState('pending');

  // Group by user toggle
  const [groupByUser, setGroupByUser] = useState(true);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const loadEntries = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterUserId) params.set('userId', filterUserId);
      if (filterProjectId) params.set('projectId', filterProjectId);
      if (filterDateFrom) params.set('dateFrom', filterDateFrom);
      if (filterDateTo) params.set('dateTo', filterDateTo);
      if (filterStatus) params.set('status', filterStatus);

      const response = await fetch(
        `${getApiUrl()}/api/time-entries/pending-approval/team?${params.toString()}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!response.ok) {
        if (response.status === 403) {
          setError('Access denied. You must be an admin or manager to view approvals.');
          setIsLoading(false);
          return;
        }
        throw new Error('Failed to load entries');
      }
      const data = await response.json();
      setEntries(data.entries || []);
      if (data.subordinates) setSubordinates(data.subordinates);
    } catch (err: any) {
      setError(err.message || 'Failed to load entries');
    } finally {
      setIsLoading(false);
    }
  }, [token, filterUserId, filterProjectId, filterDateFrom, filterDateTo, filterStatus]);

  useEffect(() => {
    if (user && token) {
      loadEntries();
    }
  }, [user, token, loadEntries]);

  const handleApproval = async (entryId: number, status: 'approved' | 'rejected') => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/time-entries/${entryId}/approval`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (response.ok) {
        if (filterStatus === 'pending') {
          setEntries(prev => prev.filter(e => e.Id !== entryId));
        } else {
          setEntries(prev => prev.map(e => e.Id === entryId ? { ...e, ApprovalStatus: status } : e));
        }
        setSelectedIds(prev => { const s = new Set(prev); s.delete(entryId); return s; });
      }
    } catch (err) {
      console.error('Failed to process approval:', err);
    }
  };

  const handleBatchApproval = async (status: 'approved' | 'rejected') => {
    if (!token || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map(id => handleApproval(id, status)));
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    const pendingEntries = entries.filter(e => e.ApprovalStatus === 'pending');
    if (selectedIds.size === pendingEntries.length && pendingEntries.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingEntries.map(e => e.Id)));
    }
  };

  // Unique projects from entries for filter
  const uniqueProjects = Array.from(
    new Map(entries.map(e => [e.ProjectId, { Id: e.ProjectId, Name: e.ProjectName }])).values()
  ).sort((a, b) => a.Name.localeCompare(b.Name));

  // Stats
  const pendingCount = entries.filter(e => e.ApprovalStatus === 'pending').length;
  const totalHours = entries.reduce((s, e) => s + parseFloat(String(e.Hours || 0)), 0);
  const approvedCount = entries.filter(e => e.ApprovalStatus === 'approved').length;

  // Grouped entries
  const groupedByUser = groupByUser
    ? entries.reduce((acc, e) => {
        const key = e.UserId.toString();
        if (!acc[key]) acc[key] = { user: e, entries: [] };
        acc[key].entries.push(e);
        return acc;
      }, {} as Record<string, { user: PendingEntry; entries: PendingEntry[] }>)
    : null;

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Time Entry Approvals</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Review and approve time entries submitted by your team members.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        {!error && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">⏳ Pending</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{pendingCount}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">entries awaiting approval</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-green-600 dark:text-green-400 font-medium">✓ Approved</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{approvedCount}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">entries in current view</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">⏱ Total Hours</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{totalHours.toFixed(1)}h</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">across {entries.length} entries</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Team Member</label>
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All members</option>
                {subordinates.map(s => (
                  <option key={s.Id} value={s.Id}>
                    {s.FirstName && s.LastName ? `${s.FirstName} ${s.LastName}` : s.Username}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Project</label>
              <select
                value={filterProjectId}
                onChange={(e) => setFilterProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All projects</option>
                {uniqueProjects.map(p => (
                  <option key={p.Id} value={p.Id}>{p.Name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">From</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">To</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={loadEntries}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Apply Filters
              </button>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groupByUser}
                  onChange={(e) => setGroupByUser(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                Group by user
              </label>
            </div>
            {selectedIds.size > 0 && filterStatus === 'pending' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">{selectedIds.size} selected</span>
                <button
                  onClick={() => handleBatchApproval('approved')}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  ✓ Approve All
                </button>
                <button
                  onClick={() => handleBatchApproval('rejected')}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  ✗ Reject All
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-gray-500 dark:text-gray-400">Loading entries…</div>
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 py-16 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              {filterStatus === 'pending' ? 'All caught up!' : 'No entries found'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filterStatus === 'pending'
                ? 'No pending time entries for your team in the selected period.'
                : 'No entries match the current filters.'}
            </p>
          </div>
        ) : groupByUser && groupedByUser ? (
          <div className="space-y-4">
            {Object.values(groupedByUser).map(({ user: entryUser, entries: userEntries }) => {
              const userHours = userEntries.reduce((s, e) => s + parseFloat(String(e.Hours || 0)), 0);
              const userPending = userEntries.filter(e => e.ApprovalStatus === 'pending');
              const allPendingSelected = userPending.length > 0 && userPending.every(e => selectedIds.has(e.Id));

              return (
                <div key={entryUser.UserId} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {/* User Header */}
                  <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-sm font-bold text-blue-700 dark:text-blue-300">
                        {(entryUser.FirstName?.[0] || entryUser.Username[0]).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">{getUserDisplayName(entryUser)}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">@{entryUser.Username} · {userEntries.length} entries · {userHours.toFixed(1)}h total</div>
                      </div>
                    </div>
                    {userPending.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">{userPending.length} pending</span>
                        <button
                          onClick={() => {
                            if (allPendingSelected) {
                              setSelectedIds(prev => { const s = new Set(prev); userPending.forEach(e => s.delete(e.Id)); return s; });
                            } else {
                              setSelectedIds(prev => { const s = new Set(prev); userPending.forEach(e => s.add(e.Id)); return s; });
                            }
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {allPendingSelected ? 'Deselect all' : 'Select all'}
                        </button>
                        <button
                          onClick={() => Promise.all(userPending.map(e => handleApproval(e.Id, 'approved')))}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          ✓ Approve All
                        </button>
                        <button
                          onClick={() => Promise.all(userPending.map(e => handleApproval(e.Id, 'rejected')))}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          ✗ Reject All
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Entries Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          {filterStatus === 'pending' && (
                            <th className="px-4 py-2 w-8">
                              <input
                                type="checkbox"
                                checked={allPendingSelected}
                                onChange={() => {
                                  if (allPendingSelected) {
                                    setSelectedIds(prev => { const s = new Set(prev); userPending.forEach(e => s.delete(e.Id)); return s; });
                                  } else {
                                    setSelectedIds(prev => { const s = new Set(prev); userPending.forEach(e => s.add(e.Id)); return s; });
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 rounded"
                              />
                            </th>
                          )}
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Project</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Task</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Hours</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Description</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                        {userEntries.map(entry => (
                          <tr key={entry.Id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedIds.has(entry.Id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                            {filterStatus === 'pending' && (
                              <td className="px-4 py-3">
                                {entry.ApprovalStatus === 'pending' && (
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(entry.Id)}
                                    onChange={() => toggleSelect(entry.Id)}
                                    className="w-4 h-4 text-blue-600 rounded"
                                  />
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {new Date(normalizeDateString(entry.WorkDate) + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.ProjectName}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.TaskName}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">
                              {parseFloat(String(entry.Hours)).toFixed(2)}h
                              {entry.StartTime && entry.EndTime && (
                                <div className="text-xs font-normal text-gray-500 dark:text-gray-400">{entry.StartTime}–{entry.EndTime}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                              {entry.Description || <span className="italic text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">{getApprovalBadge(entry.ApprovalStatus)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-center">
                              {entry.ApprovalStatus === 'pending' ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleApproval(entry.Id, 'approved')}
                                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition-colors"
                                  >
                                    ✓ Approve
                                  </button>
                                  <button
                                    onClick={() => handleApproval(entry.Id, 'rejected')}
                                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded transition-colors"
                                  >
                                    ✗ Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Flat table view */
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    {filterStatus === 'pending' && (
                      <th className="px-4 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === entries.filter(e => e.ApprovalStatus === 'pending').length && entries.filter(e => e.ApprovalStatus === 'pending').length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Project</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Task</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Hours</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {entries.map(entry => (
                    <tr key={entry.Id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedIds.has(entry.Id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                      {filterStatus === 'pending' && (
                        <td className="px-4 py-3">
                          {entry.ApprovalStatus === 'pending' && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(entry.Id)}
                              onChange={() => toggleSelect(entry.Id)}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {new Date(normalizeDateString(entry.WorkDate) + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        <div className="font-medium">{getUserDisplayName(entry)}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">@{entry.Username}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.ProjectName}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.TaskName}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">
                        {parseFloat(String(entry.Hours)).toFixed(2)}h
                        {entry.StartTime && entry.EndTime && (
                          <div className="text-xs font-normal text-gray-500 dark:text-gray-400">{entry.StartTime}–{entry.EndTime}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {entry.Description || <span className="italic text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{getApprovalBadge(entry.ApprovalStatus)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {entry.ApprovalStatus === 'pending' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleApproval(entry.Id, 'approved')}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition-colors"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => handleApproval(entry.Id, 'rejected')}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded transition-colors"
                            >
                              ✗ Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
