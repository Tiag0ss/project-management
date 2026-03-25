'use client';

import { getApiUrl } from '@/lib/api/config';
import { useEffect, useMemo, useState } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import CustomFieldsFormSection from '@/components/custom-fields/CustomFieldsFormSection';
import { CustomFieldValues } from '@/lib/customFields';

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
  ProjectName?: string;
}

export interface CallRecordFormValues {
  callDate: string;
  startTime: string;
  durationMinutes: number;
  callType: string;
  participants: string;
  subject: string;
  notes: string;
  organizationId: string;
  projectId: string;
  taskId: string;
  customFields: CustomFieldValues;
}

interface CallRecordFormModalProps {
  isOpen: boolean;
  token: string;
  title: string;
  submitLabel: string;
  initialData?: Partial<CallRecordFormValues>;
  dateInfo?: {
    dateLabel: string;
    timeLabel?: string;
  };
  showDateField?: boolean;
  isSubmitting?: boolean;
  onBack?: () => void;
  onClose: () => void;
  onSubmit: (values: CallRecordFormValues) => Promise<void>;
}

const buildDefaultFormData = (): CallRecordFormValues => ({
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
  customFields: {},
});

const mergeFormData = (initialData?: Partial<CallRecordFormValues>): CallRecordFormValues => ({
  ...buildDefaultFormData(),
  ...initialData,
  durationMinutes: Number(initialData?.durationMinutes ?? 30) || 30,
});

const calculateEndTime = (startTime: string, durationMinutes: number): string => {
  const [hours, minutes] = String(startTime || '09:00').split(':').map(Number);
  const totalMinutes = ((hours || 0) * 60) + (minutes || 0) + Math.max(0, durationMinutes || 0);
  const normalizedMinutes = totalMinutes % (24 * 60);
  const endHours = Math.floor(normalizedMinutes / 60);
  const endMinutes = normalizedMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
};

const calculateDurationMinutes = (startTime: string, endTime: string): number => {
  const [startHours, startMinutes] = String(startTime || '09:00').split(':').map(Number);
  const [endHours, endMinutes] = String(endTime || '09:30').split(':').map(Number);
  const startTotal = ((startHours || 0) * 60) + (startMinutes || 0);
  const endTotal = ((endHours || 0) * 60) + (endMinutes || 0);
  const diff = endTotal - startTotal;
  return diff > 0 ? diff : 30;
};

export default function CallRecordFormModal({
  isOpen,
  token,
  title,
  submitLabel,
  initialData,
  dateInfo,
  showDateField = true,
  isSubmitting = false,
  onBack,
  onClose,
  onSubmit,
}: CallRecordFormModalProps) {
  const [formData, setFormData] = useState<CallRecordFormValues>(mergeFormData(initialData));
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');

  const endTime = useMemo(
    () => calculateEndTime(formData.startTime, formData.durationMinutes),
    [formData.startTime, formData.durationMinutes]
  );

  const loadOrganizations = async () => {
    const response = await fetch(`${getApiUrl()}/api/organizations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error('Failed to load organizations');
    }
    const data = await response.json();
    setOrganizations(data.organizations || []);
  };

  const loadProjectsForOrg = async (orgId: string) => {
    if (!orgId) {
      setProjects([]);
      setTasks([]);
      return;
    }

    const response = await fetch(`${getApiUrl()}/api/projects?organizationId=${orgId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error('Failed to load projects');
    }
    const data = await response.json();
    setProjects(data.projects || []);
  };

  const loadTasksForProject = async (projectId: string) => {
    if (!projectId) {
      setTasks([]);
      return;
    }

    const response = await fetch(`${getApiUrl()}/api/tasks/project/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error('Failed to load tasks');
    }
    const data = await response.json();
    setTasks(data.tasks || []);
  };

  useEffect(() => {
    if (!isOpen || !token) return;

    const nextFormData = mergeFormData(initialData);
    setFormData(nextFormData);
    setProjects([]);
    setTasks([]);
    setError('');

    void (async () => {
      try {
        await loadOrganizations();
        if (nextFormData.organizationId) {
          await loadProjectsForOrg(nextFormData.organizationId);
        }
        if (nextFormData.projectId) {
          await loadTasksForProject(nextFormData.projectId);
        }
      } catch (err) {
        console.error('Error preparing call record form:', err);
        setError(err instanceof Error ? err.message : 'Failed to load form data');
      }
    })();
  }, [isOpen, token, initialData]);

  if (!isOpen) {
    return null;
  }

  const handleOrganizationChange = async (value: string) => {
    setFormData((prev) => ({
      ...prev,
      organizationId: value,
      projectId: '',
      taskId: '',
    }));
    setProjects([]);
    setTasks([]);
    setError('');

    if (!value) {
      return;
    }

    try {
      await loadProjectsForOrg(value);
    } catch (err) {
      console.error('Error loading projects:', err);
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    }
  };

  const handleProjectChange = async (value: string) => {
    setFormData((prev) => ({
      ...prev,
      projectId: value,
      taskId: '',
    }));
    setTasks([]);
    setError('');

    if (!value) {
      return;
    }

    try {
      await loadTasksForProject(value);
    } catch (err) {
      console.error('Error loading tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    }
  };

  const handleSubmit = async () => {
    if (!formData.callDate || !formData.startTime) {
      setError('Date and time are required.');
      return;
    }

    setError('');
    try {
      await onSubmit(formData);
    } catch (err) {
      console.error('Error saving call record:', err);
      setError(err instanceof Error ? err.message : 'Failed to save call record');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4 gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              aria-label="Close"
              title="Close"
            >
              ✕
            </button>
          </div>

          {dateInfo && (
            <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">📆 {dateInfo.dateLabel}</p>
              {dateInfo.timeLabel && (
                <p className="text-sm text-gray-600 dark:text-gray-400">🕐 {dateInfo.timeLabel}</p>
              )}
            </div>
          )}

          {onBack && (
            <button
              onClick={onBack}
              className="text-sm text-blue-600 hover:text-blue-700 mb-4"
            >
              ← Back to options
            </button>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {showDateField && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={formData.callDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, callDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Time *
                </label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => {
                    const nextStartTime = e.target.value;
                    const nextDuration = calculateDurationMinutes(nextStartTime, endTime);
                    setFormData((prev) => ({
                      ...prev,
                      startTime: nextStartTime,
                      durationMinutes: nextDuration,
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Time *
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => {
                    const nextDuration = calculateDurationMinutes(formData.startTime, e.target.value);
                    setFormData((prev) => ({
                      ...prev,
                      durationMinutes: nextDuration,
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Duration (min)
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.durationMinutes}
                  onChange={(e) => {
                    const duration = Math.max(1, parseInt(e.target.value, 10) || 30);
                    setFormData((prev) => ({
                      ...prev,
                      durationMinutes: duration,
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Type
                </label>
                <select
                  value={formData.callType}
                  onChange={(e) => setFormData((prev) => ({ ...prev, callType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Teams">Teams</option>
                  <option value="Phone">Phone</option>
                  <option value="Zoom">Zoom</option>
                  <option value="Meet">Google Meet</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder="Meeting topic"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Organization
              </label>
              <SearchableSelect
                options={organizations.map((org) => ({ value: String(org.Id), label: org.Name }))}
                value={formData.organizationId}
                onChange={handleOrganizationChange}
                placeholder="Select organization (optional)"
                emptyText="-- None --"
                autoSelectSingleOption
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project
              </label>
              <SearchableSelect
                options={projects.map((project) => ({ value: String(project.Id), label: project.ProjectName }))}
                value={formData.projectId}
                onChange={handleProjectChange}
                placeholder="Select project (optional)"
                emptyText="-- None --"
                disabled={!formData.organizationId}
                autoSelectSingleOption
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Task
              </label>
              <SearchableSelect
                options={tasks.map((task) => ({
                  value: String(task.Id),
                  label: task.ProjectName ? `${task.ProjectName} - ${task.TaskName}` : task.TaskName,
                }))}
                value={formData.taskId}
                onChange={(value) => setFormData((prev) => ({ ...prev, taskId: value }))}
                placeholder="Select task (optional)"
                emptyText="-- None --"
                disabled={!formData.projectId}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Participants
              </label>
              <input
                type="text"
                value={formData.participants}
                onChange={(e) => setFormData((prev) => ({ ...prev, participants: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder="John, Mary, Bob"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                placeholder="Meeting notes..."
              />
            </div>

            <CustomFieldsFormSection
              tableName="CallRecords"
              token={token}
              values={formData.customFields}
              onChange={(customFields) => setFormData((prev) => ({ ...prev, customFields }))}
            />

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg transition-colors"
              >
                {isSubmitting ? 'Saving...' : submitLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
