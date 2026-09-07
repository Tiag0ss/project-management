'use client';

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api/config';
import { downloadTablePdf } from '@/lib/api/pdfExport';
import { stripHtml } from '@/lib/stripHtml';
import { useFormatHours } from '@/lib/useFormatHours';
import { useColorVision } from '@/hooks/useColorVision';
import PageTabs from '@/components/PageTabs';
import { FlowMetricsPanel } from '@/components/projects/reporting/FlowMetricsPanel';
import { ReportingSummaryPanel } from '@/components/projects/reporting/ReportingSummaryPanel';
import { ReportingByUserPanel } from '@/components/projects/reporting/ReportingByUserPanel';
import { ReportingAllocationsPanel } from '@/components/projects/reporting/ReportingAllocationsPanel';
import { ReportingTimeEntriesPanel } from '@/components/projects/reporting/ReportingTimeEntriesPanel';
import { ReportingTaskDetailModal } from '@/components/projects/reporting/ReportingTaskDetailModal';
import { ReportingSchedulesPanel } from '@/components/projects/reporting/ReportingSchedulesPanel';

export function ReportingTab({
  projectId,
  organizationId,
  token,
  onOpenTask,
}: {
  projectId: number;
  organizationId: number;
  token: string;
  onOpenTask?: (task: any) => void;
}) {
  const decimalHoursToHMS = useFormatHours();
  const { pillStyle } = useColorVision();
  const [reportTab, setReportTab] = useState<
    'summary' | 'byUser' | 'allocations' | 'timeEntries' | 'flowMetrics' | 'schedules'
  >('summary');
  const [allocations, setAllocations] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [userStats, setUserStats] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [alertMessage, setAlertMessage] = useState<{ title: string; message: string } | null>(null);

  const showAlert = (title: string, message: string) => {
    setAlertMessage({ title, message });
  };

  const closeAlert = () => {
    setAlertMessage(null);
  };

  useEffect(() => {
    if (reportTab === 'summary') {
      loadTasksSummary();
    } else if (reportTab === 'byUser') {
      loadUserStats();
    } else if (reportTab === 'allocations') {
      loadAllocations();
    } else if (reportTab === 'timeEntries') {
      loadTimeEntries();
    } else if (reportTab === 'flowMetrics') {
      setIsLoading(false);
      setError('');
    } else if (reportTab === 'schedules') {
      setIsLoading(false);
      setError('');
    }
  }, [reportTab, projectId]);

  const loadAllocations = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/task-allocations/project/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load allocations');
      }

      const data = await response.json();
      setAllocations(data.allocations || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load allocations');
      setAllocations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTimeEntries = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/time-entries/project/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load time entries');
      }

      const data = await response.json();
      setTimeEntries(data.entries || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load time entries');
      setTimeEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserStats = async () => {
    setIsLoading(true);
    setError('');
    try {
      const allocResponse = await fetch(`${getApiUrl()}/api/task-allocations/project/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const allocData = allocResponse.ok ? await allocResponse.json() : { allocations: [] };

      const entriesResponse = await fetch(`${getApiUrl()}/api/time-entries/project/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const entriesData = entriesResponse.ok ? await entriesResponse.json() : { entries: [] };

      const tasksResponse = await fetch(`${getApiUrl()}/api/tasks/project/${projectId}/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const tasksData = tasksResponse.ok ? await tasksResponse.json() : { tasks: [] };

      const userMap = new Map<number, any>();

      (allocData.allocations || []).forEach((a: any) => {
        if (!a.UserId) return;
        if (!userMap.has(a.UserId)) {
          userMap.set(a.UserId, {
            UserId: a.UserId,
            Username: a.Username || 'Unknown',
            TotalAllocated: 0,
            TotalWorked: 0,
            TasksAssigned: new Set(),
            TasksWorked: new Set(),
            Allocations: [],
            TimeEntries: [],
          });
        }
        const user = userMap.get(a.UserId);
        user.TotalAllocated += parseFloat(a.AllocatedHours || 0);
        user.TasksAssigned.add(a.TaskId);
        user.Allocations.push(a);
      });

      (entriesData.entries || []).forEach((e: any) => {
        if (!e.UserId) return;
        if (!userMap.has(e.UserId)) {
          userMap.set(e.UserId, {
            UserId: e.UserId,
            Username: e.Username || 'Unknown',
            TotalAllocated: 0,
            TotalWorked: 0,
            TasksAssigned: new Set(),
            TasksWorked: new Set(),
            Allocations: [],
            TimeEntries: [],
          });
        }
        const user = userMap.get(e.UserId);
        user.TotalWorked += parseFloat(e.Hours || 0);
        user.TasksWorked.add(e.TaskId);
        user.TimeEntries.push(e);
      });

      const taskMap = new Map<number, any>((tasksData.tasks || []).map((t: any) => [t.Id, t]));
      const stats = Array.from(userMap.values()).map((user) => ({
        ...user,
        TasksAssigned: user.TasksAssigned.size,
        TasksWorked: user.TasksWorked.size,
        Allocations: user.Allocations.map((a: any) => ({
          ...a,
          TaskName: taskMap.get(a.TaskId)?.TaskName || 'Unknown Task',
        })),
        TimeEntries: user.TimeEntries.map((e: any) => ({
          ...e,
          TaskName: taskMap.get(e.TaskId)?.TaskName || 'Unknown Task',
        })),
      }));

      stats.sort((a, b) => b.TotalWorked - a.TotalWorked);
      setUserStats(stats);
    } catch (err: any) {
      setError(err.message || 'Failed to load user stats');
      setUserStats([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTasksSummary = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/tasks/project/${projectId}/summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load tasks summary');
      }

      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load tasks summary');
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShowTaskDetail = (task: any) => {
    if (onOpenTask) {
      onOpenTask(task);
      return;
    }
    setSelectedTask(task);
  };

  const totalAllocatedHours = allocations.reduce(
    (sum, a) => sum + parseFloat(a.AllocatedHours || 0),
    0
  );
  const totalWorkedHours = timeEntries.reduce((sum, e) => sum + parseFloat(e.Hours || 0), 0);

  const exportToCSV = (data: any[], filename: string, headers: string[]) => {
    const csvRows = [];

    csvRows.push(headers.join(','));

    data.forEach((row) => {
      const values = headers.map((header) => {
        const value = row[header] ?? '';
        const stringValue = String(value).replace(/"/g, '""');
        return stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')
          ? `"${stringValue}"`
          : stringValue;
      });
      csvRows.push(values.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportToPDF = async (data: any[], filename: string, headers: string[], title: string) => {
    if (!token) {
      setError('You must be logged in to export PDF');
      return;
    }

    const rows = data.map((row) => headers.map((header) => String(row[header] ?? '')));

    try {
      await downloadTablePdf(
        {
          title,
          filename,
          headers,
          rows,
        },
        token
      );
    } catch (err) {
      console.error('Error exporting PDF:', err);
      setError(err instanceof Error ? err.message : 'Failed to export PDF');
    }
  };

  const handleExportSummary = () => {
    const data = tasks.map((t) => ({
      TaskName: t.TaskName,
      Status: t.Status || '',
      Priority: t.Priority || '',
      AssignedTo: t.AssigneeName || 'Unassigned',
      EstimatedHours: parseFloat(t.EstimatedHours || 0).toFixed(2),
      AllocatedHours: parseFloat(t.TotalAllocated || 0).toFixed(2),
      WorkedHours: parseFloat(t.TotalWorked || 0).toFixed(2),
      Progress: `${Math.round((parseFloat(t.TotalWorked || 0) / parseFloat(t.EstimatedHours || 1)) * 100)}%`,
    }));
    exportToCSV(data, 'project_summary', [
      'TaskName',
      'Status',
      'Priority',
      'AssignedTo',
      'EstimatedHours',
      'AllocatedHours',
      'WorkedHours',
      'Progress',
    ]);
  };

  const handleExportSummaryPDF = async () => {
    const data = tasks.map((t) => ({
      TaskName: t.TaskName,
      Status: t.Status || '',
      Priority: t.Priority || '',
      AssignedTo: t.AssigneeName || 'Unassigned',
      EstimatedHours: parseFloat(t.EstimatedHours || 0).toFixed(2),
      AllocatedHours: parseFloat(t.TotalAllocated || 0).toFixed(2),
      WorkedHours: parseFloat(t.TotalWorked || 0).toFixed(2),
      Progress: `${Math.round((parseFloat(t.TotalWorked || 0) / parseFloat(t.EstimatedHours || 1)) * 100)}%`,
    }));
    await exportToPDF(
      data,
      'project_summary',
      [
        'TaskName',
        'Status',
        'Priority',
        'AssignedTo',
        'EstimatedHours',
        'AllocatedHours',
        'WorkedHours',
        'Progress',
      ],
      'Project Report - Summary'
    );
  };

  const handleExportAllocations = () => {
    const data = allocations.map((a) => ({
      Date: new Date(a.AllocationDate).toLocaleDateString(),
      Task: a.TaskName || '',
      User: a.Username || '',
      AllocationHeaderId: a.TaskAllocationHeaderId || '',
      SplitOrder: a.SplitOrder ?? '',
      AllocatedHours: parseFloat(a.AllocatedHours || 0).toFixed(2),
      StartTime: a.StartTime || '',
      EndTime: a.EndTime || '',
    }));
    exportToCSV(data, 'project_allocations', [
      'Date',
      'Task',
      'User',
      'AllocationHeaderId',
      'SplitOrder',
      'AllocatedHours',
      'StartTime',
      'EndTime',
    ]);
  };

  const handleExportAllocationsPDF = async () => {
    const data = allocations.map((a) => ({
      Date: new Date(a.AllocationDate).toLocaleDateString(),
      Task: a.TaskName || '',
      User: a.Username || '',
      AllocationHeaderId: a.TaskAllocationHeaderId || '',
      SplitOrder: a.SplitOrder ?? '',
      AllocatedHours: parseFloat(a.AllocatedHours || 0).toFixed(2),
      StartTime: a.StartTime || '',
      EndTime: a.EndTime || '',
    }));
    await exportToPDF(
      data,
      'project_allocations',
      ['Date', 'Task', 'User', 'AllocationHeaderId', 'SplitOrder', 'AllocatedHours', 'StartTime', 'EndTime'],
      'Project Report - Allocations'
    );
  };

  const handleExportTimeEntries = () => {
    const data = timeEntries.map((e) => ({
      Date: new Date(e.WorkDate).toLocaleDateString(),
      Task: e.TaskName || '',
      User: e.Username || '',
      Hours: parseFloat(e.Hours || 0).toFixed(2),
      StartTime: e.StartTime || '',
      EndTime: e.EndTime || '',
      Description: stripHtml(e.Description) || '',
    }));
    exportToCSV(data, 'project_time_entries', [
      'Date',
      'Task',
      'User',
      'Hours',
      'StartTime',
      'EndTime',
      'Description',
    ]);
  };

  const handleExportTimeEntriesPDF = async () => {
    const data = timeEntries.map((e) => ({
      Date: new Date(e.WorkDate).toLocaleDateString(),
      Task: e.TaskName || '',
      User: e.Username || '',
      Hours: parseFloat(e.Hours || 0).toFixed(2),
      StartTime: e.StartTime || '',
      EndTime: e.EndTime || '',
      Description: stripHtml(e.Description) || '',
    }));
    await exportToPDF(
      data,
      'project_time_entries',
      ['Date', 'Task', 'User', 'Hours', 'StartTime', 'EndTime', 'Description'],
      'Project Report - Time Entries'
    );
  };

  const handleExportByUser = () => {
    const data = userStats.map((u) => ({
      User: `${u.FirstName || ''} ${u.LastName || ''}`.trim() || u.Username,
      TotalAllocated: parseFloat(u.TotalAllocated || 0).toFixed(2),
      TotalWorked: parseFloat(u.TotalWorked || 0).toFixed(2),
      TasksCount: u.Tasks?.length || 0,
    }));
    exportToCSV(data, 'project_by_user', ['User', 'TotalAllocated', 'TotalWorked', 'TasksCount']);
  };

  const handleExportByUserPDF = async () => {
    const data = userStats.map((u) => ({
      User: `${u.FirstName || ''} ${u.LastName || ''}`.trim() || u.Username,
      TotalAllocated: parseFloat(u.TotalAllocated || 0).toFixed(2),
      TotalWorked: parseFloat(u.TotalWorked || 0).toFixed(2),
      TasksCount: u.Tasks?.length || 0,
    }));
    await exportToPDF(
      data,
      'project_by_user',
      ['User', 'TotalAllocated', 'TotalWorked', 'TasksCount'],
      'Project Report - By User'
    );
  };

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <PageTabs
            tabs={[
              { id: 'summary', label: 'Summary' },
              { id: 'byUser', label: 'By User' },
              { id: 'allocations', label: 'Allocated Hours' },
              { id: 'timeEntries', label: 'Time Entries' },
              { id: 'flowMetrics', label: 'Flow Metrics' },
              { id: 'schedules', label: 'Schedules' },
            ]}
            activeId={reportTab}
            onChange={(id) =>
              setReportTab(
                id as 'summary' | 'byUser' | 'allocations' | 'timeEntries' | 'flowMetrics' | 'schedules'
              )
            }
          />
        </div>
        {(reportTab === 'summary' ||
          reportTab === 'byUser' ||
          reportTab === 'allocations' ||
          reportTab === 'timeEntries') && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (reportTab === 'summary') handleExportSummary();
                else if (reportTab === 'allocations') handleExportAllocations();
                else if (reportTab === 'timeEntries') handleExportTimeEntries();
                else if (reportTab === 'byUser') handleExportByUser();
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-green-600 px-4 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              📥 Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                if (reportTab === 'summary') {
                  void handleExportSummaryPDF();
                } else if (reportTab === 'allocations') {
                  void handleExportAllocationsPDF();
                } else if (reportTab === 'timeEntries') {
                  void handleExportTimeEntriesPDF();
                } else if (reportTab === 'byUser') {
                  void handleExportByUserPDF();
                }
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700"
            >
              📄 Export PDF
            </button>
          </div>
        )}
      </div>

      {reportTab === 'summary' && (
        <ReportingSummaryPanel
          tasks={tasks}
          isLoading={isLoading}
          decimalHoursToHMS={decimalHoursToHMS}
          pillStyle={pillStyle}
          onShowTaskDetail={handleShowTaskDetail}
        />
      )}

      {reportTab === 'byUser' && (
        <ReportingByUserPanel
          userStats={userStats}
          isLoading={isLoading}
          decimalHoursToHMS={decimalHoursToHMS}
        />
      )}

      {reportTab === 'allocations' && (
        <ReportingAllocationsPanel
          allocations={allocations}
          isLoading={isLoading}
          totalAllocatedHours={totalAllocatedHours}
          decimalHoursToHMS={decimalHoursToHMS}
        />
      )}

      {reportTab === 'timeEntries' && (
        <ReportingTimeEntriesPanel
          timeEntries={timeEntries}
          isLoading={isLoading}
          totalWorkedHours={totalWorkedHours}
          decimalHoursToHMS={decimalHoursToHMS}
        />
      )}

      {selectedTask && (
        <ReportingTaskDetailModal
          selectedTask={selectedTask}
          organizationId={organizationId}
          token={token}
          decimalHoursToHMS={decimalHoursToHMS}
          pillStyle={pillStyle}
          onClose={() => setSelectedTask(null)}
          onAlert={showAlert}
        />
      )}

      {alertMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                {alertMessage.title}
              </h3>
              <p className="text-gray-700 dark:text-gray-300 mb-6">{alertMessage.message}</p>
              <div className="flex justify-end">
                <button
                  onClick={closeAlert}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reportTab === 'flowMetrics' && <FlowMetricsPanel projectId={projectId} token={token} />}

      {reportTab === 'schedules' && (
        <ReportingSchedulesPanel projectId={projectId} token={token} onAlert={showAlert} />
      )}
    </div>
  );
}
