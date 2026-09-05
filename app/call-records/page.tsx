/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation'
import { oldPath } from '@/lib/oldPath';
import { useAuth } from '@/contexts/AuthContext';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';
import CallRecordFormModal, { CallRecordFormValues } from '@/components/CallRecordFormModal';
import { extractCustomFieldValues } from '@/lib/customFields';

interface CallRecord {
  Id: number;
  CallDate: string;
  StartTime: string;
  DurationMinutes: number;
  CallType: string;
  Participants: string;
  Subject: string;
  Notes: string;
  ProjectId?: number;
  TaskId?: number;
  OrganizationId?: number;
  OrganizationName?: string;
  ProjectName?: string;
  TaskName?: string;
  [key: string]: unknown;
}

interface ImportCallRecordRow {
  callDate: string;
  startTime: string;
  durationMinutes: number;
  callType: string;
  participants: string;
  subject: string;
  notes: string;
}

type TeamsImportPeriod = '7d' | '30d' | 'custom';

export default function CallRecordsPage() {
  const { user, isLoading, token } = useAuth();
  const router = useRouter();
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSavingForm, setIsSavingForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CallRecord | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<ImportCallRecordRow[]>([]);
  const [importRecords, setImportRecords] = useState<ImportCallRecordRow[]>([]);
  const [importProgress, setImportProgress] = useState('');
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showTeamsImportModal, setShowTeamsImportModal] = useState(false);
  const [teamsImportPeriod, setTeamsImportPeriod] = useState<TeamsImportPeriod>('30d');
  const [teamsCustomStartDate, setTeamsCustomStartDate] = useState('');
  const [teamsCustomEndDate, setTeamsCustomEndDate] = useState('');
  const [teamsImportProgress, setTeamsImportProgress] = useState('');
  const [teamsImportResult, setTeamsImportResult] = useState<{ imported: number; skipped: number; failed: number } | null>(null);
  const [isImportingTeams, setIsImportingTeams] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(oldPath('/login'));
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (token) {
      loadCallRecords();
    }
  }, [token]);

  const loadCallRecords = async () => {
    try {
      setIsLoadingRecords(true);
      const response = await fetch(`${getApiUrl()}/api/call-records`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setCallRecords(data.data || []);
      }
    } catch (err) {
      console.error('Error loading call records:', err);
    } finally {
      setIsLoadingRecords(false);
    }
  };

  const handleSubmit = async (formData: CallRecordFormValues) => {
    setIsSavingForm(true);
    try {
      const url = editingRecord
        ? `${getApiUrl()}/api/call-records/${editingRecord.Id}`
        : `${getApiUrl()}/api/call-records`;

      const response = await fetch(url, {
        method: editingRecord ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          organizationId: formData.organizationId || null,
          projectId: formData.projectId || null,
          taskId: formData.taskId || null,
                  customFields: formData.customFields,
        }),
      });

      if (response.ok) {
        setMessage(editingRecord ? 'Call record updated!' : 'Call record created!');
        setTimeout(() => setMessage(''), 3000);
        resetForm();
        await loadCallRecords();
      } else {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save call record');
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error('Error saving call record');
    } finally {
      setIsSavingForm(false);
    }
  };

  const handleEdit = (record: CallRecord) => {
    setEditingRecord(record);
    setShowForm(true);
    setError('');
  };

  const handleDelete = (id: number) => {
    setConfirmModal({
      show: true,
      title: 'Delete Call Record',
      message: 'Are you sure you want to delete this call record? This action cannot be undone.',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const response = await fetch(`${getApiUrl()}/api/call-records/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });

          if (response.ok) {
            setMessage('Call record deleted');
            setTimeout(() => setMessage(''), 3000);
            loadCallRecords();
          }
        } catch (_err) {
          setError('Error deleting call record');
        }
      },
    });
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingRecord(null);
    setIsSavingForm(false);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportFileName('');
    setImportPreview([]);
    setImportRecords([]);
    setImportProgress('');
    setImportResult(null);
    setIsImporting(false);
  };

  const closeTeamsImportModal = () => {
    setShowTeamsImportModal(false);
    setTeamsImportPeriod('30d');
    setTeamsCustomStartDate('');
    setTeamsCustomEndDate('');
    setTeamsImportProgress('');
    setTeamsImportResult(null);
    setIsImportingTeams(false);
  };

  const handleImportTeamsRecentCalls = async () => {
    if (!token) return;

    if (teamsImportPeriod === 'custom') {
      if (!teamsCustomStartDate || !teamsCustomEndDate) {
        setError('Please select both start and end dates for custom period.');
        return;
      }
      if (teamsCustomEndDate < teamsCustomStartDate) {
        setError('End date must be after or equal to start date.');
        return;
      }
    }

    try {
      setIsImportingTeams(true);
      setTeamsImportResult(null);
      setError('');
      setTeamsImportProgress('Importing recent Teams calls...');

      const payload: Record<string, string> = {
        periodType: teamsImportPeriod,
      };

      if (teamsImportPeriod === 'custom') {
        payload.startDate = teamsCustomStartDate;
        payload.endDate = teamsCustomEndDate;
      }

      const response = await fetch(`${getApiUrl()}/api/call-records/import/teams-recent`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Failed to import Teams calls');
      }

      const imported = Number(data.imported || 0);
      const skipped = Number(data.skipped || 0);
      const failed = Number(data.failed || 0);

      setTeamsImportResult({ imported, skipped, failed });
      setTeamsImportProgress(`Done: imported ${imported}, skipped ${skipped}, failed ${failed}.`);
      setMessage(`Teams import finished: ${imported} imported, ${skipped} skipped, ${failed} failed.`);
      setTimeout(() => setMessage(''), 4000);
      await loadCallRecords();
    } catch (err: any) {
      setTeamsImportProgress('');
      setError(err?.message || 'Error importing Teams calls');
    } finally {
      setIsImportingTeams(false);
    }
  };

  const handleImportCSVFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportPreview([]);
    setImportRecords([]);
    setImportProgress('Reading CSV file...');
    setImportResult(null);
    setError('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setImportProgress('');
        setError('CSV file must have a header row and at least one data row');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const records: ImportCallRecordRow[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const record: Partial<ImportCallRecordRow> = {};

        headers.forEach((header, index) => {
          const value = values[index] || '';
          if (header.includes('date')) record.callDate = value;
          else if (header.includes('time') && !header.includes('duration')) record.startTime = value;
          else if (header.includes('duration')) record.durationMinutes = parseInt(value) || 30;
          else if (header.includes('type')) record.callType = value || 'Teams';
          else if (header.includes('participant')) record.participants = value;
          else if (header.includes('subject')) record.subject = value;
          else if (header.includes('note')) record.notes = value;
        });

        if (record.callDate) {
          records.push({
            callDate: record.callDate,
            startTime: record.startTime || '09:00',
            durationMinutes: record.durationMinutes || 30,
            callType: record.callType || 'Teams',
            participants: record.participants || '',
            subject: record.subject || '',
            notes: record.notes || '',
          });
        }
      }

      if (records.length === 0) {
        setImportProgress('');
        setError('No valid records found in CSV');
        return;
      }

      setImportRecords(records);
      setImportPreview(records.slice(0, 5));
      setImportProgress(`Loaded ${records.length} call record(s) from CSV.`);
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportCSV = async () => {
    if (!importRecords.length) {
      setError('Select a CSV file first.');
      return;
    }

    try {
      setIsImporting(true);
      setImportProgress(`Importing ${importRecords.length} call record(s)...`);
      const response = await fetch(`${getApiUrl()}/api/call-records/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ records: importRecords }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || 'Failed to import CSV');
      }

      const data = await response.json();
      setImportResult({ imported: Number(data.imported || importRecords.length || 0) });
      setImportProgress(`Success: imported ${Number(data.imported || importRecords.length || 0)} call record(s).`);
      setMessage(`Imported ${Number(data.imported || importRecords.length || 0)} call records`);
      setTimeout(() => setMessage(''), 3000);
      await loadCallRecords();
    } catch (err) {
      setImportProgress('');
      setError(err instanceof Error ? err.message : 'Error importing CSV');
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading || !user) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div className="w-full">
      <main className="w-full mx-auto px-4 py-4 sm:py-6 space-y-2 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold leading-tight text-gray-900 dark:text-white">
            Call Records
          </h1>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setError('');
                setShowTeamsImportModal(true);
              }}
              className="h-10 px-3 sm:px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
            >
              Import Teams Calls
            </button>
            <button
              onClick={() => {
                setError('');
                setShowImportModal(true);
              }}
              className="h-10 px-3 sm:px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
            >
              Import CSV
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="h-10 px-3 sm:px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
            >
              + Add Call
            </button>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div className="p-3 bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-400 rounded-lg">
            {message}
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg">
            {error}
            <button onClick={() => setError('')} className="ml-2 font-bold">×</button>
          </div>
        )}

        <CallRecordFormModal
          isOpen={showForm && !!token}
          token={token || ''}
          title={editingRecord ? '📞 Edit Call Record' : '📞 Add Call Record'}
          submitLabel={editingRecord ? 'Update Call' : 'Add Call'}
          isSubmitting={isSavingForm}
          initialData={editingRecord ? {
            callDate: editingRecord.CallDate ? editingRecord.CallDate.split('T')[0] : '',
            startTime: editingRecord.StartTime ? editingRecord.StartTime.substring(0, 5) : '09:00',
            durationMinutes: editingRecord.DurationMinutes || 30,
            callType: editingRecord.CallType || 'Teams',
            participants: editingRecord.Participants || '',
            subject: editingRecord.Subject || '',
            notes: editingRecord.Notes || '',
            organizationId: editingRecord.OrganizationId ? String(editingRecord.OrganizationId) : '',
            projectId: editingRecord.ProjectId ? String(editingRecord.ProjectId) : '',
            taskId: editingRecord.TaskId ? String(editingRecord.TaskId) : '',
            customFields: extractCustomFieldValues(editingRecord),
          } : undefined}
          onClose={resetForm}
          onSubmit={handleSubmit}
        />

        {showImportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4 gap-4">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Import Call Records from CSV</h2>
                  <button
                    onClick={closeImportModal}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    aria-label="Close"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">📄 CSV Format</h3>
                  <p className="text-sm text-blue-800 dark:text-blue-400 mb-2">
                    Your CSV should have the following columns (header required):
                  </p>
                  <code className="text-xs bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded block overflow-x-auto">
                    callDate,startTime,durationMinutes,callType,participants,subject,notes
                  </code>
                  <p className="text-xs text-blue-800 dark:text-blue-400 mt-2">
                    Example: 2026-02-03,14:30,45,Teams,"John, Mary",Project Meeting,Discussed requirements
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-400 mt-2">
                    <a href={oldPath("/templates/call_records_import_template.csv")} download className="underline hover:text-blue-600 dark:hover:text-blue-200">Download template CSV</a>
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select CSV File</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleImportCSVFileChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  {importFileName && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Selected file: {importFileName}</p>
                  )}
                </div>

                {importProgress && (
                  <div className={`mb-4 p-3 rounded-lg ${
                    importProgress.startsWith('Success')
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                      : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                  }`}>
                    {importProgress}
                  </div>
                )}

                {importPreview.length > 0 && (
                  <div className="mb-5">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Preview (first 5 rows)</h3>
                    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Date</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Start Time</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Duration</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Type</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Participants</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Subject</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {importPreview.map((row, idx) => (
                            <tr key={idx} className="bg-white dark:bg-gray-800">
                              <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{row.callDate}</td>
                              <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.startTime || '-'}</td>
                              <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.durationMinutes} min</td>
                              <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.callType || '-'}</td>
                              <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.participants || '-'}</td>
                              <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{row.subject || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {importResult && (
                  <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <h3 className="font-semibold text-green-900 dark:text-green-300">
                      ✅ Successfully imported {importResult.imported} call record(s)
                    </h3>
                  </div>
                )}

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={closeImportModal}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleImportCSV}
                    disabled={isImporting || importRecords.length === 0}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
                  >
                    {isImporting ? 'Importing...' : 'Import CSV'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showTeamsImportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 border border-gray-200 dark:border-gray-700">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4 gap-4">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Import Recent Teams Calls</h2>
                  <button
                    onClick={closeTeamsImportModal}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    aria-label="Close"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Period</label>
                    <select
                      value={teamsImportPeriod}
                      onChange={(e) => setTeamsImportPeriod(e.target.value as TeamsImportPeriod)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="7d">Last 7 days</option>
                      <option value="30d">Last 30 days</option>
                      <option value="custom">Custom range</option>
                    </select>
                  </div>

                  {teamsImportPeriod === 'custom' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start Date</label>
                        <input
                          type="date"
                          value={teamsCustomStartDate}
                          min={(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; })()}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setTeamsCustomStartDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">End Date</label>
                        <input
                          type="date"
                          value={teamsCustomEndDate}
                          min={teamsCustomStartDate || (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; })()}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setTeamsCustomEndDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg text-sm text-indigo-700 dark:text-indigo-300">
                    Microsoft Graph limits call record history to the last 30 days. Re-importing the same period is safe — existing calls are detected and skipped automatically.
                  </div>

                  {teamsImportProgress && (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 text-sm">
                      {teamsImportProgress}
                    </div>
                  )}

                  {teamsImportResult && (
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
                      Imported: {teamsImportResult.imported} • Skipped: {teamsImportResult.skipped} • Failed: {teamsImportResult.failed}
                    </div>
                  )}

                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={closeTeamsImportModal}
                      className="h-10 px-4 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={handleImportTeamsRecentCalls}
                      disabled={isImportingTeams}
                      className="h-10 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
                    >
                      {isImportingTeams ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Call Records Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-x-auto">
          {isLoadingRecords ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Loading call records...
            </div>
          ) : callRecords.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <div className="text-5xl mb-3">📞</div>
              <p className="text-lg">No call records yet.</p>
              <p className="text-sm">Add calls manually or import from CSV.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Time</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Duration</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Subject</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Organization</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Project</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Task</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Participants</th>
                    <th scope="col" className="relative px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {callRecords.map((record) => (
                    <tr key={record.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                        {new Date(record.CallDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                        {record.StartTime?.substring(0, 5)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                        {record.DurationMinutes} min
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-1 rounded ${
                          record.CallType === 'Teams' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                          record.CallType === 'Phone' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                          record.CallType === 'Zoom' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}>
                          {record.CallType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-white max-w-xs truncate">
                        {record.Subject || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {record.OrganizationName || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {record.ProjectName || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {record.TaskName || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {record.Participants || '-'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(record)}
                          className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                          title="Edit"
                          aria-label="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(record.Id)}
                          className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                          title="Delete"
                          aria-label="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Confirm Modal */}
      {confirmModal?.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{confirmModal.title}</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
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
