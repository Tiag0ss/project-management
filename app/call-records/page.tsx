'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import SearchableSelect from '@/components/SearchableSelect';

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
}

interface Organization {
  Id: number;
  Name: string;
}

interface Project {
  Id: number;
  ProjectName: string;
  OrganizationId: number;
}

interface Task {
  Id: number;
  TaskName: string;
  ProjectId: number;
}

export default function CallRecordsPage() {
  const { user, isLoading, token } = useAuth();
  const router = useRouter();
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CallRecord | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [formData, setFormData] = useState({
    callDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    durationMinutes: 30,
    callType: 'Teams',
    participants: '',
    subject: '',
    notes: '',
    organizationId: '',
    projectId: '',
    taskId: '',
  });
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
      router.push('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (token) {
      loadCallRecords();
      loadOrganizations();
    }
  }, [token]);

  const loadOrganizations = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/organizations`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setOrganizations(data.organizations || []);
      }
    } catch (err) {
      console.error('Error loading organizations:', err);
    }
  };

  const loadProjectsForOrg = async (orgId: string) => {
    if (!orgId) {
      setProjects([]);
      setTasks([]);
      return;
    }
    try {
      const response = await fetch(`${getApiUrl()}/api/projects?organizationId=${orgId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
        setTasks([]);
      }
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  };

  const loadTasksForProject = async (projectId: string) => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    try {
      const response = await fetch(`${getApiUrl()}/api/tasks/project/${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Error loading tasks:', err);
    }
  };

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

  const handleSubmit = async () => {
    if (!formData.callDate || !formData.startTime) {
      setError('Date and Time are required');
      return;
    }

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
          projectId: formData.projectId || null,
          taskId: formData.taskId || null,
        }),
      });

      if (response.ok) {
        setMessage(editingRecord ? 'Call record updated!' : 'Call record created!');
        setTimeout(() => setMessage(''), 3000);
        resetForm();
        loadCallRecords();
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to save call record');
      }
    } catch (err) {
      setError('Error saving call record');
    }
  };

  const handleEdit = async (record: CallRecord) => {
    setEditingRecord(record);
    
    // Load cascade data if organization/project are set
    if (record.OrganizationId) {
      await loadProjectsForOrg(String(record.OrganizationId));
      if (record.ProjectId) {
        await loadTasksForProject(String(record.ProjectId));
      }
    }
    
    setFormData({
      callDate: record.CallDate ? record.CallDate.split('T')[0] : '',
      startTime: record.StartTime ? record.StartTime.substring(0, 5) : '09:00',
      durationMinutes: record.DurationMinutes || 30,
      callType: record.CallType || 'Teams',
      participants: record.Participants || '',
      subject: record.Subject || '',
      notes: record.Notes || '',
      organizationId: record.OrganizationId ? String(record.OrganizationId) : '',
      projectId: record.ProjectId ? String(record.ProjectId) : '',
      taskId: record.TaskId ? String(record.TaskId) : '',
    });
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
        } catch (err) {
          setError('Error deleting call record');
        }
      },
    });
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingRecord(null);
    setFormData({
      callDate: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      durationMinutes: 30,
      callType: 'Teams',
      participants: '',
      subject: '',
      notes: '',
      organizationId: '',
      projectId: '',
      taskId: '',
    });
    setProjects([]);
    setTasks([]);
    setError('');
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setError('CSV file must have a header row and at least one data row');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const records = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const record: any = {};

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
          records.push(record);
        }
      }

      if (records.length === 0) {
        setError('No valid records found in CSV');
        return;
      }

      try {
        const response = await fetch(`${getApiUrl()}/api/call-records/import`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ records }),
        });

        if (response.ok) {
          const data = await response.json();
          setMessage(`Imported ${data.imported} call records`);
          setTimeout(() => setMessage(''), 3000);
          loadCallRecords();
        } else {
          setError('Failed to import CSV');
        }
      } catch (err) {
        setError('Error importing CSV');
      }
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            📞 Call Records
          </h1>
          <div className="flex gap-2">
            <label className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg cursor-pointer transition-colors">
              📥 Import CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                className="hidden"
              />
            </label>
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              + Add Call
            </button>
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-400 rounded-lg">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg">
            {error}
            <button onClick={() => setError('')} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              {editingRecord ? 'Edit Call Record' : 'Add Call Record'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date *</label>
                <input
                  type="date"
                  value={formData.callDate}
                  onChange={(e) => setFormData({...formData, callDate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time *</label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duration (min)</label>
                <input
                  type="number"
                  value={formData.durationMinutes}
                  onChange={(e) => setFormData({...formData, durationMinutes: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                <select
                  value={formData.callType}
                  onChange={(e) => setFormData({...formData, callType: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Teams">Teams</option>
                  <option value="Phone">Phone</option>
                  <option value="Zoom">Zoom</option>
                  <option value="Meet">Google Meet</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Participants</label>
                <input
                  type="text"
                  value={formData.participants}
                  onChange={(e) => setFormData({...formData, participants: e.target.value})}
                  placeholder="John, Mary, Bob"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({...formData, subject: e.target.value})}
                  placeholder="Meeting topic"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Organization</label>
                <SearchableSelect
                  value={formData.organizationId}
                  onChange={(value) => {
                    setFormData({...formData, organizationId: value, projectId: '', taskId: ''});
                    loadProjectsForOrg(value);
                  }}
                  options={organizations.map(org => ({ value: org.Id, label: org.Name }))}
                  placeholder="Select Organization"
                  emptyText="-- None --"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project</label>
                <SearchableSelect
                  value={formData.projectId}
                  onChange={(value) => {
                    setFormData({...formData, projectId: value, taskId: ''});
                    loadTasksForProject(value);
                  }}
                  options={projects.map(project => ({ value: project.Id, label: project.ProjectName }))}
                  placeholder="Select Project"
                  emptyText="-- None --"
                  disabled={!formData.organizationId}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Task</label>
                <SearchableSelect
                  value={formData.taskId}
                  onChange={(value) => setFormData({...formData, taskId: value})}
                  options={tasks.map(task => ({ value: task.Id, label: task.TaskName }))}
                  placeholder="Select Task"
                  emptyText="-- None --"
                  disabled={!formData.projectId}
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                  placeholder="Additional notes..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={resetForm}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                {editingRecord ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* CSV Import Help */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
            📋 CSV Format for Import:
          </h4>
          <p className="text-sm text-blue-800 dark:text-blue-400 font-mono">
            callDate,startTime,durationMinutes,callType,participants,subject,notes
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-500 mt-1">
            Example: 2026-02-03,14:30,45,Teams,"John, Mary",Project Meeting,Discussed requirements
          </p>
        </div>

        {/* Call Records Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
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
                <thead className="bg-gray-50 dark:bg-gray-700">
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
                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Actions</th>
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
                        <button
                          onClick={() => handleEdit(record)}
                          className="text-blue-600 hover:text-blue-700 mr-3"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(record.Id)}
                          className="text-red-600 hover:text-red-700"
                          title="Delete"
                        >
                          🗑️
                        </button>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
    </div>
  );
}
