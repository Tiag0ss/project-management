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
      <div className="w-full p-4 sm:p-6">
        <p className="text-sm text-[var(--pm-muted)]">Loading…</p>
      </div>
    );
  }

  if (!canManage) {
    return null;
  }

  const fieldClass =
    'w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]';

  return (
    <div className="w-full">
      <main className="w-full space-y-3 p-4 sm:p-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <p className="max-w-2xl text-xs text-[var(--pm-muted)]">
            Schedule informational dev support days for your team. Visible in planning and calendar; does not
            block allocation.
            {user?.isAdmin
              ? ' Admins can manage any active user.'
              : ' Team leaders can manage direct reports only.'}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">Year</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())}
                className="w-24 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]"
              />
            </div>
            <div className="min-w-[12rem] flex-1 sm:min-w-[14rem] sm:flex-none">
              <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">Team member</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className={fieldClass}
              >
                <option value="">All users</option>
                {members.map((member) => (
                  <option key={member.Id} value={member.Id}>
                    {getMemberLabel(member)} ({Number(member.DevSupportDays || 0)} day
                    {Number(member.DevSupportDays || 0) === 1 ? '' : 's'})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={openAddModal}
              disabled={members.length === 0}
              className="inline-flex h-9 items-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:bg-gray-400"
            >
              Add Dev Support
            </button>
          </div>
        </div>

        {message && (
          <div className="rounded border border-blue-300 bg-blue-100 px-3 py-2 text-sm text-blue-800 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
            {message}
          </div>
        )}

        {!isLoading && (
          <div className="grid grid-cols-2 gap-2 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2 sm:grid-cols-4 sm:gap-4">
            <div>
              <p className="text-[11px] text-[var(--pm-muted)]">Team members</p>
              <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">{stats.teamSize}</p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--pm-muted)]">Scheduled days</p>
              <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">{stats.totalDays}</p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--pm-muted)]">Users with days</p>
              <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">{stats.membersWithDays}</p>
            </div>
            <div>
              <p className="text-[11px] text-[var(--pm-muted)]">Filtered users</p>
              <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">{stats.uniqueUsers}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-sm text-[var(--pm-muted)]">Loading dev support…</div>
        ) : entries.length === 0 ? (
          <div className="rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-8 text-center text-sm text-[var(--pm-muted)]">
            No dev support days found for this filter.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)]">
            <div className="border-b border-[var(--pm-border)] px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
                Entries ({entries.length})
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--pm-border)]">
                <thead className="bg-[var(--pm-panel)]">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      User
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      Notes
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      Added by
                    </th>
                    <th scope="col" className="relative px-3 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--pm-border)]">
                  {entries.map((entry) => (
                    <tr key={entry.Id} className="hover:bg-[var(--pm-panel)]">
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-[var(--pm-text)]">
                        {getMemberLabel(entry)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm tabular-nums text-[var(--pm-text)]">
                        {String(entry.DevSupportDate).split('T')[0]}
                      </td>
                      <td className="px-3 py-2 text-sm text-[var(--pm-muted)]">{entry.Notes || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-[var(--pm-muted)]">
                        {entry.CreatedByName || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(entry)}
                          title="Delete"
                          aria-label="Delete"
                          className="rounded p-1.5 text-[var(--pm-muted)] transition-colors hover:text-red-600 dark:hover:text-red-400"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-[var(--pm-border)] bg-[var(--pm-surface)] shadow-xl">
            <div className="space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--pm-text)]">Add Dev Support</h3>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded p-1 text-[var(--pm-muted)] hover:text-[var(--pm-text)]"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">Team member</label>
                <select value={addMemberId} onChange={(e) => setAddMemberId(e.target.value)} className={fieldClass}>
                  {members.map((member) => (
                    <option key={member.Id} value={member.Id}>
                      {getMemberLabel(member)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">End date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>

              <div>
                <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={fieldClass}
                  placeholder="Optional notes"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="h-9 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 text-sm font-medium text-[var(--pm-text)] hover:bg-[var(--pm-surface-2)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfigure()}
                  disabled={isSaving || !addMemberId}
                  className="h-9 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-gray-400"
                >
                  {isSaving ? 'Saving…' : `Add ${getRequestDays(startDate, endDate)} day(s)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--pm-border)] bg-[var(--pm-surface)] p-4 shadow-xl sm:p-5">
            <h3 className="mb-1 text-sm font-semibold text-[var(--pm-text)]">Delete Dev Support Day</h3>
            <p className="mb-4 text-sm text-[var(--pm-muted)]">
              Delete dev support for <span className="font-medium text-[var(--pm-text)]">{getMemberLabel(deleteTarget)}</span> on{' '}
              <span className="font-medium text-[var(--pm-text)]">{String(deleteTarget.DevSupportDate).split('T')[0]}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-9 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 text-sm font-medium text-[var(--pm-text)] hover:bg-[var(--pm-surface-2)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="h-9 rounded-lg bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <ScrollToTopButton />
    </div>
  );
}
