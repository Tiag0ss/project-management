/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation'
import { oldPath } from '@/lib/oldPath';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api/config';

interface DevSupportTeamMember {
  Id: number;
  Username: string;
  FirstName?: string;
  LastName?: string;
  DevSupportDays?: number;
}

interface DevSupportEntry {
  Id: number;
  UserId: number;
  DevSupportDate: string;
  Notes?: string;
  Username?: string;
  FirstName?: string;
  LastName?: string;
  CreatedByName?: string;
}

const getMemberLabel = (entry: { Username?: string; FirstName?: string; LastName?: string }) => {
  const fullName = `${entry.FirstName || ''} ${entry.LastName || ''}`.trim();
  return fullName || entry.Username || 'User';
};

const getRequestDays = (startDate: string, endDate: string) => {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
};

export default function DevSupportManagementPage() {
  const { user, token, isLoading: authLoading, isCustomerUser } = useAuth();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [message, setMessage] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [members, setMembers] = useState<DevSupportTeamMember[]>([]);
  const [entries, setEntries] = useState<DevSupportEntry[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMemberId, setAddMemberId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DevSupportEntry | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setMessage('');

    try {
      const scopeResponse = await fetch(`${getApiUrl()}/api/dev-support/manage-scope`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!scopeResponse.ok) {
        setCanManage(false);
        return;
      }

      const scopeData = await scopeResponse.json();
      if (!scopeData.canManage) {
        setCanManage(false);
        router.replace('/dashboard');
        return;
      }

      setCanManage(true);

      const [membersResponse, entriesResponse] = await Promise.all([
        fetch(`${getApiUrl()}/api/dev-support/team-members?year=${year}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(
          `${getApiUrl()}/api/dev-support/entries?year=${year}${selectedMemberId ? `&userId=${selectedMemberId}` : ''}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
      ]);

      if (!membersResponse.ok || !entriesResponse.ok) {
        throw new Error('Failed to load dev support data');
      }

      const membersData = await membersResponse.json();
      const entriesData = await entriesResponse.json();
      setMembers((membersData.members || []) as DevSupportTeamMember[]);
      setEntries((entriesData.entries || []) as DevSupportEntry[]);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed to load dev support data');
    } finally {
      setIsLoading(false);
    }
  }, [token, year, selectedMemberId, router]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(oldPath('/login'));
      return;
    }

    if (user && token && !isCustomerUser) {
      void loadData();
    } else if (!authLoading) {
      setIsLoading(false);
      if (!isCustomerUser) {
        router.replace('/dashboard');
      }
    }
  }, [authLoading, user, token, isCustomerUser, router, loadData]);

  const stats = useMemo(() => {
    const uniqueUsers = new Set(entries.map((entry) => entry.UserId)).size;
    const totalDays = entries.length;
    const membersWithDays = members.filter((member) => Number(member.DevSupportDays || 0) > 0).length;
    return { uniqueUsers, totalDays, membersWithDays, teamSize: members.length };
  }, [entries, members]);

  const openAddModal = () => {
    setAddMemberId(selectedMemberId || (members[0] ? String(members[0].Id) : ''));
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setShowAddModal(true);
  };

  const handleConfigure = async () => {
    if (!token || !addMemberId) return;

    if (getRequestDays(startDate, endDate) <= 0) {
      setMessage('Invalid dev support date range');
      return;
    }

    setIsSaving(true);
    setMessage('');

    try {
      const response = await fetch(`${getApiUrl()}/api/dev-support/team-members/${addMemberId}/configure`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ startDate, endDate, notes }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to save dev support days');
      }

      setMessage(data.message || 'Dev support days saved');
      setShowAddModal(false);
      await loadData();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed to save dev support days');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !deleteTarget) return;

    const entryId = deleteTarget.Id;
    setDeleteTarget(null);

    try {
      const response = await fetch(`${getApiUrl()}/api/dev-support/${entryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete dev support day');
      }

      setMessage('Dev support day deleted');
      await loadData();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete dev support day');
    }
  };

  if (!user || (!canManage && isLoading)) {
    return (
      <div className="w-full">
        <main className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </main>
      </div>
    );
  }

  if (!canManage) {
    return null;
  }

  return (
    <div className="w-full">
      <main className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dev Support</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Schedule informational dev support days for your team. Visible in planning and calendar; does not block allocation.
          </p>
        </div>

        {message && (
          <div className="mb-6 p-4 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 rounded-lg">
            {message}
          </div>
        )}

        {!isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">Team members</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.teamSize}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">in scope</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">Scheduled days</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.totalDays}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">in current view</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">Users with days</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.membersWithDays}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">in {year}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">Filtered users</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.uniqueUsers}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">shown in table</div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Year</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Team member</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All users</option>
                {members.map((member) => (
                  <option key={member.Id} value={member.Id}>
                    {getMemberLabel(member)} ({Number(member.DevSupportDays || 0)} day{Number(member.DevSupportDays || 0) === 1 ? '' : 's'})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => void loadData()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Apply filters
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {user?.isAdmin ? 'Admins can manage any active user.' : 'Team leaders can manage direct reports only.'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Team Dev Support Days</h2>
          <button
            onClick={openAddModal}
            disabled={members.length === 0}
            className="h-9 px-4 inline-flex items-center rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white transition-colors"
          >
            Add Dev Support
          </button>
        </div>

        {isLoading ? (
          <div className="text-gray-600 dark:text-gray-300">Loading dev support…</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            No dev support days found for this filter.
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Notes</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Added by</th>
                    <th scope="col" className="relative px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {entries.map((entry) => (
                    <tr key={entry.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                        {getMemberLabel(entry)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                        {String(entry.DevSupportDate).split('T')[0]}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {entry.Notes || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {entry.CreatedByName || '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setDeleteTarget(entry)}
                          className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Dev Support</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Team member</label>
                <select
                  value={addMemberId}
                  onChange={(e) => setAddMemberId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {members.map((member) => (
                    <option key={member.Id} value={member.Id}>
                      {getMemberLabel(member)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Optional notes"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleConfigure()}
                  disabled={isSaving || !addMemberId}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-lg"
                >
                  {isSaving ? 'Saving...' : `Add ${getRequestDays(startDate, endDate)} day(s)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete Dev Support Day</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
                Delete dev support for <span className="font-medium">{getMemberLabel(deleteTarget)}</span> on{' '}
                <span className="font-medium">{String(deleteTarget.DevSupportDate).split('T')[0]}</span>?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleDelete()}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ScrollToTopButton />
    </div>
  );
}
