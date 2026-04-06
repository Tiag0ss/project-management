'use client';

import { useEffect, useMemo, useState } from 'react';
import Navbar from '@/components/Navbar';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useToast } from '@/contexts/ToastContext';
import { getApiUrl } from '@/lib/api/config';
import { downloadTablePdf } from '@/lib/api/pdfExport';
import TimeEntryFormModal, { TimeEntryFormValues } from '@/components/TimeEntryFormModal';
import CallRecordFormModal, { CallRecordFormValues } from '@/components/CallRecordFormModal';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import { useFormatHours } from '@/lib/useFormatHours';

interface TimeEntry {
  Id: number;
  WorkDate: string;
  StartTime?: string;
  EndTime?: string;
  Hours: number;
  Description?: string;
  TaskName?: string;
  JiraIssueKey?: string;
  ProjectName?: string;
  CustomerName?: string;
  ProjectId?: number;
  OrganizationId?: number;
  CustomerId?: number;
  ApprovalStatus?: string;
  TaskId?: number;
}

interface CallRecord {
  Id: number;
  CallDate: string;
  StartTime?: string;
  EndTime?: string;
  DurationMinutes: number;
  CallType?: string;
  Subject?: string;
  Notes?: string;
  Participants?: string;
  CustomerName?: string;
  OrganizationName?: string;
  ProjectName?: string;
  TaskName?: string;
  JiraIssueKey?: string;
  OrganizationId?: number;
  ProjectId?: number;
  TaskId?: number;
}

interface ResumeByUserRow {
  UserId: number;
  Username: string;
  FirstName?: string;
  LastName?: string;
  EntryCount: number;
  TotalHours: number;
  TaskCount: number;
  ProjectCount: number;
  CustomerCount: number;
  TaskNames?: string;
  ProjectNames?: string;
  CustomerNames?: string;
  ApprovedCount: number;
  PendingCount: number;
  RejectedCount: number;
}

type ResumePeriod = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'allTime';
type WorkEntryType = 'timeEntry' | 'callRecord';

type CombinedWorkEntry = {
  key: string;
  type: WorkEntryType;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  projectName: string;
  taskName: string;
  jiraIssueKey?: string;
  organizationName: string;
  title: string;
  details: string;
  status: string;
  id?: number;
  taskId?: number;
};

const normalizeDateString = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  return String(value || '').split('T')[0];
};

const stripHtml = (value?: string): string => {
  if (!value) return '';
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const calculateEndTime = (startTime?: string, durationMinutes?: number): string => {
  if (!startTime) return '-';

  const normalizedStart = String(startTime).slice(0, 5);
  const [hoursRaw, minutesRaw] = normalizedStart.split(':');
  const startHours = Number(hoursRaw);
  const startMinutes = Number(minutesRaw);
  const duration = Number(durationMinutes || 0);

  if (!Number.isFinite(startHours) || !Number.isFinite(startMinutes)) return '-';
  if (!Number.isFinite(duration)) return '-';

  const totalStartMinutes = (startHours * 60) + startMinutes;
  const totalEndMinutes = (totalStartMinutes + Math.round(duration) + (24 * 60)) % (24 * 60);
  const endHours = Math.floor(totalEndMinutes / 60);
  const endMinutes = totalEndMinutes % 60;

  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
};

const getApiErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = await response.json();
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
  } catch {
    // Ignore JSON parse failures and return fallback message.
  }
  return fallback;
};

const toDateString = (date: Date): string => date.toISOString().split('T')[0];

const getResumePeriodRange = (period: ResumePeriod) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const weekdayIndexMondayBased = (today.getDay() + 6) % 7;
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - weekdayIndexMondayBased);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekStart.getDate() + 6);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(thisWeekStart.getDate() - 1);

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  if (period === 'allTime') return null;
  if (period === 'thisWeek') return { from: toDateString(thisWeekStart), to: toDateString(thisWeekEnd) };
  if (period === 'lastWeek') return { from: toDateString(lastWeekStart), to: toDateString(lastWeekEnd) };
  if (period === 'thisMonth') return { from: toDateString(thisMonthStart), to: toDateString(thisMonthEnd) };
  return { from: toDateString(lastMonthStart), to: toDateString(lastMonthEnd) };
};

const parseResumeList = (value?: string): string[] => {
  if (!value) return [];
  return value.split(' || ').map(v => v.trim()).filter(Boolean);
};


export default function WorkSummaryPage() {
  const decimalHoursToHMS = useFormatHours();
  const { user, token, isLoading } = useAuth();
  const { permissions } = usePermissions();
  const { showToast } = useToast();
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [resumeSummary, setResumeSummary] = useState<ResumeByUserRow[]>([]);
  
  // View mode
  const [viewMode, setViewMode] = useState<'summary' | 'entries'>('summary');
  
  // Resume period
  const [resumePeriod, setResumePeriod] = useState<ResumePeriod>('thisWeek');
  const [resumeLoading, setResumeLoading] = useState(false);
  
  // Entries filters
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    const localToday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const daysSinceMonday = (localToday.getDay() + 6) % 7;
    localToday.setDate(localToday.getDate() - daysSinceMonday - 7);
    return localToday.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [projectFilter, setProjectFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [groupByDays, setGroupByDays] = useState(false);
  const [entryTypeFilter, setEntryTypeFilter] = useState<'all' | WorkEntryType>('all');
  
  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [editingCallRecord, setEditingCallRecord] = useState<CallRecord | null>(null);
  const [editingType, setEditingType] = useState<'timeEntry' | 'callRecord' | null>(null);
  
  // Modal
  const [modalMessage, setModalMessage] = useState<{
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingEntry(null);
    setEditingCallRecord(null);
    setEditingType(null);
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalMessage({ type: 'confirm', title, message, onConfirm });
  };

  const resolveTimeEntryContextForEdit = async (entry: TimeEntry): Promise<TimeEntry> => {
    const taskId = Number(entry.TaskId || 0);
    if (!token || !taskId) {
      return entry;
    }

    let resolvedProjectId = Number(entry.ProjectId || 0);
    let resolvedOrganizationId = Number(entry.OrganizationId || entry.CustomerId || 0);

    try {
      if (!resolvedProjectId) {
        const tasksResponse = await fetch(`${getApiUrl()}/api/tasks/my-tasks`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (tasksResponse.ok) {
          const tasksData = await tasksResponse.json();
          const matchingTask = Array.isArray(tasksData.tasks)
            ? tasksData.tasks.find((task: any) => Number(task?.Id || 0) === taskId)
            : null;

          if (matchingTask?.ProjectId) {
            resolvedProjectId = Number(matchingTask.ProjectId);
          }
        }
      }

      if (!resolvedOrganizationId && resolvedProjectId) {
        const projectResponse = await fetch(`${getApiUrl()}/api/projects/${resolvedProjectId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (projectResponse.ok) {
          const projectData = await projectResponse.json();
          const organizationId = Number(projectData?.project?.OrganizationId || 0);
          if (organizationId) {
            resolvedOrganizationId = organizationId;
          }
        }
      }
    } catch (error) {
      console.error('Error resolving time entry context for edit:', error);
    }

    return {
      ...entry,
      ProjectId: resolvedProjectId || entry.ProjectId,
      OrganizationId: resolvedOrganizationId || entry.OrganizationId,
    };
  };

  const handleEditTimeEntry = async (entry: TimeEntry) => {
    const entryWithContext = await resolveTimeEntryContextForEdit(entry);
    setEditingEntry(entryWithContext);
    setEditingType('timeEntry');
    setShowEditModal(true);
  };

  const handleEditCallRecord = (entry: CombinedWorkEntry) => {
    const record = callRecords.find(r => r.Id === entry.id);
    if (!record) {
      showToast({ type: 'error', message: 'Call record not found' });
      return;
    }
    setEditingCallRecord(record);
    setEditingType('callRecord');
    setShowEditModal(true);
  };

  const handleDeleteTimeEntry = async (entryId: number) => {
    if (!token) return;
    showConfirm('Delete Entry', 'Are you sure you want to delete this time entry?', async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/time-entries/${entryId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          setTimeEntries(prev => prev.filter(e => e.Id !== entryId));
          showToast({ type: 'success', message: 'Time entry deleted' });
          setModalMessage(null);
        } else {
          showToast({ type: 'error', message: 'Failed to delete entry' });
        }
      } catch (err) {
        showToast({ type: 'error', message: 'Error deleting entry' });
      }
    });
  };

  const handleDeleteCallRecord = async (recordId: number) => {
    if (!token) return;
    showConfirm('Delete Call Record', 'Are you sure you want to delete this call record?', async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/call-records/${recordId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          setCallRecords(prev => prev.filter(r => r.Id !== recordId));
          showToast({ type: 'success', message: 'Call record deleted' });
          setModalMessage(null);
        } else {
          showToast({ type: 'error', message: 'Failed to delete call record' });
        }
      } catch (err) {
        showToast({ type: 'error', message: 'Error deleting call record' });
      }
    });
  };

  useEffect(() => {
    if (!user || !token) return;
    loadData();
  }, [user, token, dateFrom, dateTo]);

  useEffect(() => {
    if (!user || !token || viewMode !== 'summary') return;
    loadResumeSummary(resumePeriod);
  }, [user, token, resumePeriod, viewMode]);

  const loadData = async () => {
    try {
      setIsLoadingData(true);
      const [timeEntriesResponse, callRecordsResponse] = await Promise.all([
        fetch(`${getApiUrl()}/api/time-entries/my-entries?startDate=${dateFrom}&endDate=${dateTo}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/call-records?startDate=${dateFrom}&endDate=${dateTo}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }),
      ]);

      if (timeEntriesResponse.ok) {
        const data = await timeEntriesResponse.json();
        setTimeEntries(Array.isArray(data.entries) ? data.entries : []);
      }
      if (callRecordsResponse.ok) {
        const data = await callRecordsResponse.json();
        setCallRecords(Array.isArray(data.data) ? data.data : []);
      }
    } catch (err) {
      setError('Failed to load entries');
    } finally {
      setIsLoadingData(false);
    }
  };

  const loadResumeSummary = async (period: ResumePeriod) => {
    if (!token) return;
    setResumeLoading(true);
    try {
      const range = getResumePeriodRange(period);
      const params = new URLSearchParams();
      if (period === 'allTime' || !range) {
        params.set('period', 'allTime');
      } else {
        params.set('dateFrom', range.from);
        params.set('dateTo', range.to);
      }

      const response = await fetch(`${getApiUrl()}/api/time-entries/summary-by-user?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setResumeSummary(data.summary || []);
      }
    } catch (err) {
      console.error('Failed to load resume:', err);
      setResumeSummary([]);
    } finally {
      setResumeLoading(false);
    }
  };

  const selectedResumeRange = useMemo(() => getResumePeriodRange(resumePeriod), [resumePeriod]);

  const resumeTotals = useMemo(() => {
    const totalUsers = resumeSummary.length;
    const totalEntries = resumeSummary.reduce((sum, row) => sum + Number(row.EntryCount || 0), 0);
    const totalHours = resumeSummary.reduce((sum, row) => sum + Number(row.TotalHours || 0), 0);
    const approved = resumeSummary.reduce((sum, row) => sum + Number(row.ApprovedCount || 0), 0);
    const pending = resumeSummary.reduce((sum, row) => sum + Number(row.PendingCount || 0), 0);
    const rejected = resumeSummary.reduce((sum, row) => sum + Number(row.RejectedCount || 0), 0);
    const approvalRate = totalEntries > 0 ? (approved / totalEntries) * 100 : 0;
    const pendingRate = totalEntries > 0 ? (pending / totalEntries) * 100 : 0;
    const rejectedRate = totalEntries > 0 ? (rejected / totalEntries) * 100 : 0;
    const avgHoursPerEntry = totalEntries > 0 ? totalHours / totalEntries : 0;
    const avgHoursPerUser = totalUsers > 0 ? totalHours / totalUsers : 0;

    return { totalUsers, totalEntries, totalHours, approved, pending, rejected, approvalRate, pendingRate, rejectedRate, avgHoursPerEntry, avgHoursPerUser };
  }, [resumeSummary]);

  const resumeTopUsers = useMemo(() => [...resumeSummary].sort((a, b) => Number(b.TotalHours || 0) - Number(a.TotalHours || 0)).slice(0, 5), [resumeSummary]);
  const resumeAttentionUsers = useMemo(() => [...resumeSummary].filter(row => row.PendingCount > 0 || row.RejectedCount > 0).sort((a, b) => (b.PendingCount + b.RejectedCount) - (a.PendingCount + a.RejectedCount)), [resumeSummary]);

  const combinedEntries = useMemo<CombinedWorkEntry[]>(() => {
    const timeEntriesMapped: CombinedWorkEntry[] = timeEntries.map((entry) => ({
      key: `time-${entry.Id}`,
      type: 'timeEntry',
      date: normalizeDateString(entry.WorkDate),
      startTime: entry.StartTime || '-',
      endTime: entry.EndTime || '-',
      hours: Number(entry.Hours || 0),
      projectName: entry.ProjectName || '-',
      taskName: entry.TaskName || '-',
      jiraIssueKey: entry.JiraIssueKey || undefined,
      organizationName: entry.CustomerName || '-',
      title: entry.TaskName || 'Time Entry',
      details: entry.Description || '-',
      status: entry.ApprovalStatus || '-',
      id: entry.Id,
      taskId: entry.TaskId,
    }));

    const callRecordsMapped: CombinedWorkEntry[] = callRecords.map((record) => ({
      key: `call-${record.Id}`,
      type: 'callRecord',
      date: normalizeDateString(record.CallDate),
      startTime: record.StartTime ? record.StartTime.substring(0, 5) : '-',
      endTime: calculateEndTime(record.StartTime, record.DurationMinutes),
      hours: Number(record.DurationMinutes || 0) / 60,
      projectName: record.ProjectName || '-',
      taskName: record.TaskName || '-',
      jiraIssueKey: record.JiraIssueKey || undefined,
      organizationName: record.CustomerName || record.OrganizationName || '-',
      title: record.Subject || record.CallType || 'Call',
      details: record.Notes || record.Subject || '-',
      status: record.CallType || '-',
      id: record.Id,
      taskId: record.TaskId,
    }));

    let all = [...timeEntriesMapped, ...callRecordsMapped].sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      return dateCompare !== 0 ? dateCompare : b.startTime.localeCompare(a.startTime);
    });

    if (entryTypeFilter !== 'all') {
      all = all.filter(e => e.type === entryTypeFilter);
    }
    if (projectFilter) {
      all = all.filter(e => e.projectName === projectFilter);
    }
    if (taskFilter) {
      all = all.filter(e => e.taskName === taskFilter);
    }

    return all;
  }, [timeEntries, callRecords, entryTypeFilter, projectFilter, taskFilter]);

  const filteredEntriesByDay = useMemo(() => {
    if (!groupByDays) return [];

    type GroupKey = string;
    const grouped: { [key: GroupKey]: { date: string; entries: CombinedWorkEntry[]; totalHours: number } } = {};

    combinedEntries.forEach(entry => {
      const key = `${entry.date}|${entry.organizationName}|${entry.projectName}|${entry.taskName}`;
      if (!grouped[key]) {
        grouped[key] = {
          date: entry.date,
          entries: [],
          totalHours: 0,
        };
      }
      grouped[key].entries.push(entry);
      grouped[key].totalHours += entry.hours;
    });

    return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
  }, [combinedEntries, groupByDays]);

  const availableProjects = useMemo(() => Array.from(new Set(combinedEntries.map(e => e.projectName))).sort(), [combinedEntries]);
  const availableTasks = useMemo(() => {
    let tasks = combinedEntries;
    if (projectFilter) {
      tasks = tasks.filter(e => e.projectName === projectFilter);
    }
    return Array.from(new Set(tasks.map(e => e.taskName))).sort();
  }, [combinedEntries, projectFilter]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-xl">Loading...</div></div>;
  }

  return (
    <CustomerUserGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <main className="w-full mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow p-6 text-white mb-6">
              <h1 className="text-3xl font-bold">Work Summary</h1>
              <p className="text-blue-100 mt-1">Combined view of Time Entries and Call Records</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                {error}
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700 mb-4">
              <div className="border-b border-gray-200 dark:border-gray-700 px-6">
                <nav className="flex space-x-8">
                  <button onClick={() => setViewMode('summary')} className={`py-4 px-1 border-b-2 font-medium text-sm ${viewMode === 'summary' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                    📈 Summary
                  </button>
                  <button onClick={() => setViewMode('entries')} className={`py-4 px-1 border-b-2 font-medium text-sm ${viewMode === 'entries' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                    📋 Entries
                  </button>
                </nav>
              </div>

              {viewMode === 'summary' && (
                <div className="p-6 space-y-6">
                  <div className="flex flex-wrap items-center gap-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Period</h3>
                    {(['thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'allTime'] as ResumePeriod[]).map(period => (
                      <button key={period} onClick={() => setResumePeriod(period)} className={`px-3 py-1.5 text-sm rounded-lg ${resumePeriod === period ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}>
                        {period === 'thisWeek' ? 'This Week' : period === 'lastWeek' ? 'Last Week' : period === 'thisMonth' ? 'This Month' : period === 'lastMonth' ? 'Last Month' : 'All Time'}
                      </button>
                    ))}
                  </div>

                  {resumeLoading ? (
                    <div className="text-center py-10 text-gray-500">Carregando resumo...</div>
                  ) : resumeSummary.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">No entries found.</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800">
                          <p className="text-sm text-blue-700 dark:text-blue-300">Users</p>
                          <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{resumeTotals.totalUsers}</p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-100 dark:border-green-800">
                          <p className="text-sm text-green-700 dark:text-green-300">Entries</p>
                          <p className="text-2xl font-bold text-green-900 dark:text-green-100">{resumeTotals.totalEntries}</p>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-100 dark:border-purple-800">
                          <p className="text-sm text-purple-700 dark:text-purple-300">Total Hours</p>
                          <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{decimalHoursToHMS(resumeTotals.totalHours)}</p>
                        </div>
                        <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4 border border-cyan-100 dark:border-cyan-800">
                          <p className="text-sm text-cyan-700 dark:text-cyan-300">Avg / Entry</p>
                          <p className="text-2xl font-bold text-cyan-900 dark:text-cyan-100">{decimalHoursToHMS(resumeTotals.avgHoursPerEntry)}</p>
                        </div>
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-100 dark:border-indigo-800">
                          <p className="text-sm text-indigo-700 dark:text-indigo-300">Avg / User</p>
                          <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{decimalHoursToHMS(resumeTotals.avgHoursPerUser)}</p>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-100 dark:border-emerald-800">
                          <p className="text-sm text-emerald-700 dark:text-emerald-300">Approval Rate</p>
                          <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">{resumeTotals.approvalRate.toFixed(1)}%</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Approval Distribution</h4>
                          <div className="w-full h-3 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 mb-3 flex">
                            <div className="bg-green-500" style={{ width: `${resumeTotals.approvalRate}%` }} />
                            <div className="bg-yellow-500" style={{ width: `${resumeTotals.pendingRate}%` }} />
                            <div className="bg-red-500" style={{ width: `${resumeTotals.rejectedRate}%` }} />
                          </div>
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div className="text-green-700 dark:text-green-400">Approved: {resumeTotals.approved}</div>
                            <div className="text-yellow-700 dark:text-yellow-400">Pending: {resumeTotals.pending}</div>
                            <div className="text-red-700 dark:text-red-400">Rejected: {resumeTotals.rejected}</div>
                          </div>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Top Contributors</h4>
                          <div className="space-y-3">
                            {resumeTopUsers.map((row, idx) => {
                              const maxHours = resumeTopUsers[0]?.TotalHours || 1;
                              const width = maxHours > 0 ? (row.TotalHours / maxHours) * 100 : 0;
                              const displayName = row.FirstName && row.LastName ? `${row.FirstName} ${row.LastName}` : row.Username;
                              return (
                                <div key={row.UserId}>
                                  <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300 mb-1">
                                    <span>{idx + 1}. {displayName}</span>
                                    <span>{decimalHoursToHMS(Number(row.TotalHours || 0))}</span>
                                  </div>
                                  <div className="w-full h-2 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                    <div className="h-2 bg-blue-500 rounded" style={{ width: `${width}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {resumeAttentionUsers.length > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                          <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">⚠️ Needs Attention</h4>
                          <div className="space-y-1 text-sm">
                            {resumeAttentionUsers.slice(0, 5).map(row => {
                              const displayName = row.FirstName && row.LastName ? `${row.FirstName} ${row.LastName}` : row.Username;
                              return (
                                <div key={row.UserId} className="flex justify-between text-amber-800 dark:text-amber-300">
                                  <span>{displayName}</span>
                                  <span>{row.PendingCount} pending · {row.RejectedCount} rejected</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Entries</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Hours</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Approved</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Pending</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Rejected</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {resumeSummary.map(row => (
                              <tr key={row.UserId} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                  {row.FirstName && row.LastName ? `${row.FirstName} ${row.LastName}` : row.Username}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{row.EntryCount}</td>
                                <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600 dark:text-blue-400">{decimalHoursToHMS(Number(row.TotalHours || 0))}</td>
                                <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400">{row.ApprovedCount}</td>
                                <td className="px-4 py-3 text-sm text-right text-yellow-600 dark:text-yellow-400">{row.PendingCount}</td>
                                <td className="px-4 py-3 text-sm text-right text-red-600 dark:text-red-400">{row.RejectedCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {viewMode === 'entries' && (
                <div className="p-6 space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">All Entries</h2>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            const filtered = combinedEntries;
                            const header = ['Date', 'Type', 'Start', 'End', 'Hours', 'Project', 'Task', 'Organization', 'Title', 'Details'];
                            const rows = filtered.map(e => [
                              new Date(`${e.date}T12:00:00`).toLocaleDateString(),
                              e.type === 'timeEntry' ? 'Time' : 'Call',
                              e.startTime,
                              e.endTime,
                              e.hours.toFixed(2),
                              e.projectName,
                              e.taskName,
                              e.organizationName,
                              e.title,
                              stripHtml(e.details),
                            ].map(v => `"${String(v)}"`).join(','));
                            const csv = [header.join(','), ...rows].join('\n');
                            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `work-summary-${dateFrom}-${dateTo}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                          ⬇ Export CSV
                        </button>
                        <button
                          onClick={async () => {
                            const filtered = combinedEntries;
                            const rows = filtered.map(e => [
                              new Date(`${e.date}T12:00:00`).toLocaleDateString(),
                              e.type === 'timeEntry' ? 'Time' : 'Call',
                              e.startTime,
                              e.endTime,
                              e.hours.toFixed(2),
                              e.projectName,
                              e.taskName,
                              e.organizationName,
                              e.title,
                              stripHtml(e.details),
                            ]);
                            try {
                              await downloadTablePdf({
                                title: 'Work Summary',
                                filename: `work-summary-${dateFrom}-${dateTo}`,
                                headers: ['Date', 'Type', 'Start', 'End', 'Hours', 'Project', 'Task', 'Org', 'Title', 'Details'],
                                rows,
                              }, token!);
                            } catch (err) {
                              setError('Error exporting PDF');
                            }
                          }}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                          📄 Export PDF
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From</label>
                        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
                        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project</label>
                        <select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setTaskFilter(''); }} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                          <option value="">All Projects</option>
                          {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Task</label>
                        <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                          <option value="">All Tasks</option>
                          {availableTasks.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                        <select value={entryTypeFilter} onChange={(e) => setEntryTypeFilter(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                          <option value="all">All</option>
                          <option value="timeEntry">Time Entry</option>
                          <option value="callRecord">Call Record</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mb-4">
                      <label className="flex items-center cursor-pointer">
                        <input type="checkbox" checked={groupByDays} onChange={(e) => setGroupByDays(e.target.checked)} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
                        <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">Group by Days</span>
                      </label>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700" data-grid-enhancer-ignore="true">
                      {isLoadingData ? (
                        <div className="text-center py-8 text-gray-500">Loading...</div>
                      ) : groupByDays ? (
                        <div className="w-full" data-grid-enhancer-ignore="true">
                          <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
                            <colgroup>
                              <col style={{ width: '9%' }} />
                              <col style={{ width: '11%' }} />
                              <col style={{ width: '13%' }} />
                              <col style={{ width: '20%' }} />
                              <col style={{ width: '8%' }} />
                              <col style={{ width: '39%' }} />
                            </colgroup>
                            <thead className="bg-gray-50 dark:bg-gray-900">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Project</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Task</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Hours</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                              {filteredEntriesByDay.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                    No entries found for the selected filters.
                                  </td>
                                </tr>
                              ) : (
                                (() => {
                                  const dateGroups: Record<string, typeof filteredEntriesByDay> = {};
                                  filteredEntriesByDay.forEach((group) => {
                                    if (!dateGroups[group.date]) dateGroups[group.date] = [];
                                    dateGroups[group.date].push(group);
                                  });

                                  const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));

                                  return sortedDates.flatMap((date) => {
                                    const groups = dateGroups[date];
                                    const dayTotal = groups.reduce((sum, group) => sum + Number(group.totalHours || 0), 0);
                                    const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
                                      weekday: 'long',
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                    });

                                    return [
                                      <tr key={`header-${date}`} className="bg-gray-100 dark:bg-gray-700">
                                        <td colSpan={6} className="px-6 py-2">
                                          <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">📅 {dayLabel}</span>
                                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{decimalHoursToHMS(dayTotal)} total</span>
                                          </div>
                                        </td>
                                      </tr>,
                                      ...groups.map((group, idx) => (
                                        <tr key={`${date}-${idx}-${group.entries[0]?.projectName || 'project'}-${group.entries[0]?.taskName || 'task'}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(`${group.date}T12:00:00`).toLocaleDateString()}
                                          </td>
                                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white overflow-hidden text-ellipsis">{group.entries[0]?.organizationName || '-'}</td>
                                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white overflow-hidden text-ellipsis">{group.entries[0]?.projectName || '-'}</td>
                                          <td className="px-6 py-3 text-sm text-gray-900 dark:text-white whitespace-normal break-words">
                                            <div>{group.entries[0]?.taskName || '-'}</div>
                                            {group.entries[0]?.jiraIssueKey && (
                                              <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5">{group.entries[0]?.jiraIssueKey}</div>
                                            )}
                                          </td>
                                          <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">{decimalHoursToHMS(Number(group.totalHours || 0))}</td>
                                          <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-normal break-words">
                                            {group.entries.length > 0 ? (
                                              <div className="space-y-1">
                                                {group.entries
                                                  .map((entry) => stripHtml(entry.details))
                                                  .filter(Boolean)
                                                  .map((desc, descIdx) => (
                                                    <div key={descIdx} className="text-xs">• {desc}</div>
                                                  ))}
                                              </div>
                                            ) : (
                                              '-'
                                            )}
                                          </td>
                                        </tr>
                                      )),
                                    ];
                                  });
                                })()
                              )}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Start</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">End</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Hours</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Project</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Task</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Details</th>
                                {permissions?.canManageTimeEntries && <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>}
                              </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                              {combinedEntries.length === 0 ? (
                                <tr>
                                  <td colSpan={permissions?.canManageTimeEntries ? 9 : 8} className="px-6 py-8 text-center text-gray-500">No entries found.</td>
                                </tr>
                              ) : (
                                combinedEntries.map((entry) => (
                                  <tr key={entry.key} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{new Date(`${entry.date}T12:00:00`).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{entry.type === 'timeEntry' ? 'Time' : 'Call'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{entry.startTime}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{entry.endTime}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">{decimalHoursToHMS(entry.hours)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{entry.projectName}</td>
                                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                      <div>{entry.taskName}</div>
                                      {entry.jiraIssueKey && (
                                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5">{entry.jiraIssueKey}</div>
                                      )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{stripHtml(entry.details)}</td>
                                    {permissions?.canManageTimeEntries && (
                                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                        <div className="flex items-center justify-end gap-1">
                                          {entry.type === 'timeEntry' && (
                                            <button
                                              onClick={() => handleEditTimeEntry(timeEntries.find(e => e.Id === entry.id)!)}
                                              className="p-1.5 text-gray-400 rounded hover:text-blue-600 dark:hover:text-blue-400"
                                              title="Edit"
                                            >
                                              ✏️
                                            </button>
                                          )}
                                          {entry.type === 'callRecord' && (
                                            <button
                                              onClick={() => handleEditCallRecord(entry)}
                                              className="p-1.5 text-gray-400 rounded hover:text-blue-600 dark:hover:text-blue-400"
                                              title="Edit"
                                            >
                                              ✏️
                                            </button>
                                          )}
                                          {entry.type === 'timeEntry' && (
                                            <button
                                              onClick={() => handleDeleteTimeEntry(entry.id!)}
                                              className="p-1.5 text-gray-400 rounded hover:text-red-600 dark:hover:text-red-400"
                                              title="Delete"
                                            >
                                              🗑️
                                            </button>
                                          )}
                                          {entry.type === 'callRecord' && (
                                            <button
                                              onClick={() => handleDeleteCallRecord(entry.id!)}
                                              className="p-1.5 text-gray-400 rounded hover:text-red-600 dark:hover:text-red-400"
                                              title="Delete"
                                            >
                                              🗑️
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {showEditModal && editingType === 'timeEntry' && editingEntry && (
              <TimeEntryFormModal
                isOpen={showEditModal}
                title="Edit Time Entry"
                submitLabel="Save"
                onClose={closeEditModal}
                onSubmit={async (values) => {
                  if (!token || !editingEntry.Id) return;
                  try {
                    const response = await fetch(`${getApiUrl()}/api/time-entries/${editingEntry.Id}`, {
                      method: 'PUT',
                      headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(values),
                    });
                    if (response.ok) {
                      await loadData();
                      closeEditModal();
                      showToast({ type: 'success', message: 'Time entry updated' });
                    } else {
                      const message = await getApiErrorMessage(response, 'Failed to update time entry');
                      showToast({ type: 'error', message });
                    }
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Error updating time entry';
                    showToast({ type: 'error', message });
                  }
                }}
                token={token || undefined}
                initialData={{
                  workDate: normalizeDateString(editingEntry.WorkDate),
                  startTime: editingEntry.StartTime || '',
                  endTime: editingEntry.EndTime || '',
                  hours: String(editingEntry.Hours || ''),
                  description: editingEntry.Description || '',
                  taskId: String(editingEntry.TaskId || ''),
                  projectId: String(editingEntry.ProjectId || ''),
                  organizationId: String(editingEntry.OrganizationId || editingEntry.CustomerId || ''),
                  customFields: {},
                }}
                useOrganizationProjectTaskFlow={true}
              />
            )}

            {showEditModal && editingType === 'callRecord' && editingCallRecord && (
              <CallRecordFormModal
                isOpen={showEditModal}
                title="Edit Call Record"
                submitLabel="Save"
                token={token!}
                onClose={closeEditModal}
                onSubmit={async (values) => {
                  if (!token || !editingCallRecord.Id) return;
                  try {
                    const response = await fetch(`${getApiUrl()}/api/call-records/${editingCallRecord.Id}`, {
                      method: 'PUT',
                      headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify(values),
                    });
                    if (response.ok) {
                      await loadData();
                      closeEditModal();
                      showToast({ type: 'success', message: 'Call record updated' });
                    } else {
                      const message = await getApiErrorMessage(response, 'Failed to update call record');
                      showToast({ type: 'error', message });
                    }
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Error updating call record';
                    showToast({ type: 'error', message });
                  }
                }}
                initialData={{
                  callDate: normalizeDateString(editingCallRecord.CallDate),
                  startTime: editingCallRecord.StartTime || '',
                  durationMinutes: Number(editingCallRecord.DurationMinutes || 0),
                  subject: editingCallRecord.Subject || '',
                  callType: editingCallRecord.CallType || '',
                  notes: editingCallRecord.Notes || '',
                  participants: editingCallRecord.Participants || '',
                  organizationId: String(editingCallRecord.OrganizationId || ''),
                  projectId: String(editingCallRecord.ProjectId || ''),
                  taskId: String(editingCallRecord.TaskId || ''),
                  customFields: {},
                }}
              />
            )}

            {modalMessage && (
              <ConfirmAlertModal
                isOpen={!!modalMessage}
                title={modalMessage.title}
                message={modalMessage.message || undefined}
                type={modalMessage.type}
                onConfirm={() => {
                  modalMessage.onConfirm?.();
                  setModalMessage(null);
                }}
                onClose={() => setModalMessage(null)}
              />
            )}
          </div>
        </main>
      </div>
    </CustomerUserGuard>
  );
}
