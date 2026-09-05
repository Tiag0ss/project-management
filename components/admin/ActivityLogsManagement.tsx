'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';

interface ActivityLog {
  Id: number;
  UserId: number | null;
  Username: string | null;
  Action: string;
  EntityType: string | null;
  EntityId: number | null;
  EntityName: string | null;
  Details: string | null;
  IpAddress: string | null;
  UserAgent: string | null;
  CreatedAt: string;
}

interface ActivityStats {
  totalLogs: number;
  todayLogs: number;
  weekLogs: number;
  topActions: { Action: string; count: number }[];
  topUsers: { Username: string; count: number }[];
  recentActivity: ActivityLog[];
}

const EMPTY_FILTERS = {
  action: '',
  entityType: '',
  username: '',
  startDate: '',
  endDate: '',
};

const fieldClass =
  'w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none focus:border-[var(--pm-accent)]';

export default function ActivityLogsManagement() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [modal, setModal] = useState<{
    type: 'confirm' | 'alert';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);
  const [total, setTotal] = useState(0);

  const API_URL = getApiUrl();

  useEffect(() => {
    loadStats();
    loadLogs();
  }, [token, page, filters]);

  const loadStats = async () => {
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/activity-logs/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStats(data.data);
      }
    } catch {
      // Stats are optional; table load surfaces errors.
    }
  };

  const loadLogs = async () => {
    if (!token) return;

    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(filters.action && { action: filters.action }),
        ...(filters.entityType && { entityType: filters.entityType }),
        ...(filters.username && { username: filters.username }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
      });

      const res = await fetch(`${API_URL}/api/activity-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(data.data.logs);
        setTotal(data.data.pagination.total);
        setTotalPages(data.data.pagination.pages);
      } else {
        setError('Failed to load activity logs');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load activity logs');
    } finally {
      setIsLoading(false);
    }
  };

  const updateFilter = <K extends keyof typeof EMPTY_FILTERS>(key: K, value: (typeof EMPTY_FILTERS)[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const handleCleanup = () => {
    setModal({
      type: 'confirm',
      title: 'Delete old logs',
      message: 'Delete logs older than 90 days? This cannot be undone.',
      onConfirm: () => void runCleanup(),
    });
  };

  const runCleanup = async () => {
    try {
      const res = await fetch(`${API_URL}/api/activity-logs/cleanup`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ days: 90 }),
      });

      if (res.ok) {
        const data = await res.json();
        setModal({ type: 'alert', title: 'Cleanup complete', message: data.message || 'Old logs deleted.' });
        loadLogs();
        loadStats();
      } else {
        setModal({ type: 'alert', title: 'Error', message: 'Failed to cleanup logs' });
      }
    } catch (err: unknown) {
      setModal({
        type: 'alert',
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to cleanup logs',
      });
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes('CREATE')) return 'text-green-600 dark:text-green-400';
    if (action.includes('UPDATE') || action.includes('EDIT')) return 'text-blue-600 dark:text-blue-400';
    if (action.includes('DELETE')) return 'text-red-600 dark:text-red-400';
    if (action.includes('LOGIN')) return 'text-purple-600 dark:text-purple-400';
    return 'text-[var(--pm-muted)]';
  };

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-xs text-[var(--pm-muted)]">Monitor system activity and user actions.</p>
        <button
          type="button"
          onClick={handleCleanup}
          className="h-9 shrink-0 rounded-lg border border-red-500/40 bg-red-600/10 px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-600 hover:text-white dark:text-red-400"
        >
          Cleanup 90+ days
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-2 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-2 sm:gap-4">
          <div>
            <p className="text-[11px] text-[var(--pm-muted)]">Total</p>
            <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">
              {stats.totalLogs.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--pm-muted)]">Today</p>
            <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">
              {stats.todayLogs.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-[var(--pm-muted)]">Last 7 days</p>
            <p className="text-sm font-semibold tabular-nums text-[var(--pm-text)]">
              {stats.weekLogs.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">Filters</h3>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-7 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-2.5 text-xs font-medium text-[var(--pm-muted)] transition-colors hover:bg-[var(--pm-surface-2)] hover:text-[var(--pm-text)]"
            >
              Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">Action</label>
            <input
              type="text"
              value={filters.action}
              onChange={(e) => updateFilter('action', e.target.value)}
              placeholder="e.g. CREATE, UPDATE"
              className={fieldClass}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">Entity type</label>
            <select
              value={filters.entityType}
              onChange={(e) => updateFilter('entityType', e.target.value)}
              className={fieldClass}
            >
              <option value="">All types</option>
              <option value="User">User</option>
              <option value="Project">Project</option>
              <option value="Task">Task</option>
              <option value="Ticket">Ticket</option>
              <option value="Organization">Organization</option>
              <option value="Customer">Customer</option>
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">Username</label>
            <input
              type="text"
              value={filters.username}
              onChange={(e) => updateFilter('username', e.target.value)}
              placeholder="Username"
              className={fieldClass}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">Start date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => updateFilter('startDate', e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-[var(--pm-muted)]">End date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => updateFilter('endDate', e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--pm-border)] px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--pm-muted)]">
            Entries ({total.toLocaleString()})
          </span>
          {totalPages > 1 && (
            <span className="text-[11px] text-[var(--pm-muted)]">
              Page {page} of {totalPages}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="px-3 py-8 text-center text-sm text-[var(--pm-muted)]">Loading logs…</div>
        ) : logs.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-[var(--pm-muted)]">No activity logs found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--pm-border)]">
                <thead className="bg-[var(--pm-panel)]">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      Timestamp
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      User
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      Action
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      Entity
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      Details
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--pm-muted)]">
                      IP
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--pm-border)]">
                  {logs.map((log) => (
                    <tr key={log.Id} className="hover:bg-[var(--pm-panel)]">
                      <td className="whitespace-nowrap px-3 py-2 text-sm tabular-nums text-[var(--pm-text)]">
                        {formatDate(log.CreatedAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-[var(--pm-text)]">
                        {log.Username || <span className="italic text-[var(--pm-muted)]">System</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm">
                        <span className={`font-medium ${getActionColor(log.Action)}`}>{log.Action}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-[var(--pm-text)]">
                        {log.EntityType ? (
                          <div>
                            <div className="font-medium">{log.EntityType}</div>
                            {log.EntityName && (
                              <div className="text-[11px] text-[var(--pm-muted)]">{log.EntityName}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--pm-muted)]">—</span>
                        )}
                      </td>
                      <td className="max-w-md truncate px-3 py-2 text-sm text-[var(--pm-text)]" title={log.Details || undefined}>
                        {log.Details || <span className="text-[var(--pm-muted)]">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm text-[var(--pm-muted)]">
                        {log.IpAddress || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 border-t border-[var(--pm-border)] px-3 py-2">
                <div className="text-xs text-[var(--pm-muted)]">
                  {total.toLocaleString()} total
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="h-8 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 text-xs font-medium text-[var(--pm-text)] transition-colors hover:bg-[var(--pm-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="h-8 rounded-md border border-[var(--pm-border)] bg-[var(--pm-panel)] px-3 text-xs font-medium text-[var(--pm-text)] transition-colors hover:bg-[var(--pm-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmAlertModal
        isOpen={!!modal}
        type={modal?.type || 'alert'}
        title={modal?.title || ''}
        message={modal?.message || ''}
        onClose={() => setModal(null)}
        onConfirm={() => {
          modal?.onConfirm?.();
          setModal(null);
        }}
        confirmLabel="Delete"
        confirmVariant="danger"
      />
    </div>
  );
}
