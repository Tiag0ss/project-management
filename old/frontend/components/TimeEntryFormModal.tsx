'use client';

import { useEffect, useMemo, useState } from 'react';
import { getApiUrl } from '@/lib/api/config';
import SearchableSelect from '@/components/old/SearchableSelect';
import CustomFieldsFormSection from '@/components/old/custom-fields/CustomFieldsFormSection';
import { CustomFieldValues } from '@/lib/customFields';
import RichTextEditor from '@/components/old/RichTextEditor';
import { useToast } from '@/contexts/ToastContext';

interface Organization {
  Id: number;
  Name: string;
}

interface Project {
  Id: number;
  ProjectName: string;
}

interface Task {
  Id: number;
  TaskName: string;
}

export interface TimeEntryFormValues {
  organizationId: string;
  projectId: string;
  taskId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  hours: string;
  description: string;
  customFields: CustomFieldValues;
}

interface TimeEntryTaskOption {
  value: number | string;
  label: string;
}

interface TimeEntryFormModalProps {
  isOpen: boolean;
  title: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (values: TimeEntryFormValues) => Promise<void>;
  token?: string;
  initialData?: Partial<TimeEntryFormValues>;
  dateInfo?: {
    dateLabel: string;
    timeLabel?: string;
  };
  showDateField?: boolean;
  isSubmitting?: boolean;
  onBack?: () => void;
  taskOptions?: TimeEntryTaskOption[];
  useOrganizationProjectTaskFlow?: boolean;
}

const buildDefaultFormData = (): TimeEntryFormValues => ({
  organizationId: '',
  projectId: '',
  taskId: '',
  workDate: new Date().toISOString().split('T')[0],
  startTime: '09:00',
  endTime: '17:00',
  hours: '',
  description: '',
  customFields: {},
});

const mergeFormData = (initialData?: Partial<TimeEntryFormValues>): TimeEntryFormValues => ({
  ...buildDefaultFormData(),
  ...initialData,
});

const calculateHours = (startTime: string, endTime: string): number => {
  if (!startTime || !endTime) return 0;
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const startTotalMinutes = startHour * 60 + startMinute;
  const endTotalMinutes = endHour * 60 + endMinute;
  return Math.max(0, (endTotalMinutes - startTotalMinutes) / 60);
};

const calculateEndTimeFromHours = (startTime: string, hours: number): string => {
  if (!startTime) return '';
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const totalMinutes = startHour * 60 + startMinute + (hours * 60);
  const endHour = Math.floor(totalMinutes / 60) % 24;
  const endMinute = Math.floor(totalMinutes % 60);
  return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
};

export default function TimeEntryFormModal({
  isOpen,
  title,
  submitLabel,
  onClose,
  onSubmit,
  token,
  initialData,
  dateInfo,
  showDateField = true,
  isSubmitting = false,
  onBack,
  taskOptions = [],
  useOrganizationProjectTaskFlow = false,
}: TimeEntryFormModalProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<TimeEntryFormValues>(mergeFormData(initialData));
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');

  const setErrorWithToast = (message: string) => {
    setError(message);
    showToast({ type: 'error', title: 'Time Entry Error', message });
  };

  const shouldUseOrgProjectFlow = useOrganizationProjectTaskFlow && !!token;

  const resolvedTaskOptions = useMemo(() => {
    if (shouldUseOrgProjectFlow) {
      return tasks.map((task) => ({ value: String(task.Id), label: task.TaskName }));
    }
    return taskOptions.map((option) => ({
      value: String(option.value),
      label: option.label,
    }));
  }, [shouldUseOrgProjectFlow, tasks, taskOptions]);

  const loadOrganizations = async () => {
    if (!token) return;
    const response = await fetch(`${getApiUrl()}/api/organizations`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error('Failed to load organizations');
    }

    const data = await response.json();
    setOrganizations(data.organizations || []);
  };

  const loadProjectsForOrg = async (organizationId: string) => {
    if (!token) return;
    if (!organizationId) {
      setProjects([]);
      setTasks([]);
      return;
    }

    const response = await fetch(`${getApiUrl()}/api/projects?organizationId=${organizationId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error('Failed to load projects');
    }

    const data = await response.json();
    setProjects(data.projects || []);
  };

  const loadTasksForProject = async (projectId: string) => {
    if (!token) return;
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
    if (!isOpen) return;

    const nextFormData = mergeFormData(initialData);
    setFormData(nextFormData);
    setError('');
    setProjects([]);
    setTasks([]);

    if (!shouldUseOrgProjectFlow) {
      return;
    }

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
        console.error('Error preparing time entry form:', err);
        setErrorWithToast(err instanceof Error ? err.message : 'Failed to load form data');
      }
    })();
  }, [isOpen, shouldUseOrgProjectFlow, initialData]);

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
      setErrorWithToast(err instanceof Error ? err.message : 'Failed to load projects');
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
      setErrorWithToast(err instanceof Error ? err.message : 'Failed to load tasks');
    }
  };

  const handleSubmit = async () => {
    if (!formData.taskId) {
      setErrorWithToast('Task is required.');
      return;
    }

    if (!formData.workDate) {
      setErrorWithToast('Work date is required.');
      return;
    }

    let hours = formData.hours ? parseFloat(formData.hours) : 0;
    if (!hours && formData.startTime && formData.endTime) {
      hours = calculateHours(formData.startTime, formData.endTime);
    }

    if (hours <= 0) {
      setErrorWithToast('Hours must be greater than 0.');
      return;
    }

    setError('');

    try {
      await onSubmit({
        ...formData,
        hours: hours.toString(),
      });
    } catch (err) {
      console.error('Error saving time entry:', err);
      setErrorWithToast(err instanceof Error ? err.message : 'Failed to save time entry');
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
            {shouldUseOrgProjectFlow && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Organization <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    value={formData.organizationId}
                    onChange={handleOrganizationChange}
                    options={organizations.map((organization) => ({ value: String(organization.Id), label: organization.Name }))}
                    placeholder="Select Organization"
                    emptyText="Select Organization"
                    autoSelectSingleOption
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Project <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    value={formData.projectId}
                    onChange={handleProjectChange}
                    options={projects.map((project) => ({ value: String(project.Id), label: project.ProjectName }))}
                    placeholder="Select Project"
                    emptyText="Select Project"
                    disabled={!formData.organizationId}
                    autoSelectSingleOption
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Task <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                value={formData.taskId}
                onChange={(value) => setFormData((prev) => ({ ...prev, taskId: value }))}
                options={resolvedTaskOptions.map((taskOption) => ({
                  value: String(taskOption.value),
                  label: taskOption.label,
                }))}
                placeholder="Select Task"
                emptyText="Select Task"
                disabled={shouldUseOrgProjectFlow ? !formData.projectId : false}
                autoSelectSingleOption
              />
            </div>

            {showDateField && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Work Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.workDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, workDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => {
                    const nextStartTime = e.target.value;
                    const calculatedHours = calculateHours(nextStartTime, formData.endTime);
                    setFormData((prev) => ({
                      ...prev,
                      startTime: nextStartTime,
                      hours: calculatedHours > 0 ? calculatedHours.toFixed(2) : '',
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => {
                    const nextEndTime = e.target.value;
                    const calculatedHours = calculateHours(formData.startTime, nextEndTime);
                    setFormData((prev) => ({
                      ...prev,
                      endTime: nextEndTime,
                      hours: calculatedHours > 0 ? calculatedHours.toFixed(2) : '',
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Hours {formData.startTime && formData.endTime && `(calculated: ${calculateHours(formData.startTime, formData.endTime).toFixed(2)}h)`}
              </label>
              <input
                type="number"
                min="0"
                step="0.25"
                value={formData.hours}
                onChange={(e) => {
                  const nextHours = parseFloat(e.target.value) || 0;
                  const nextEndTime = nextHours > 0
                    ? calculateEndTimeFromHours(formData.startTime, nextHours)
                    : formData.endTime;
                  setFormData((prev) => ({
                    ...prev,
                    hours: e.target.value,
                    endTime: nextEndTime,
                  }));
                }}
                placeholder={formData.startTime && formData.endTime ? calculateHours(formData.startTime, formData.endTime).toFixed(2) : '0.00'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <RichTextEditor
                content={formData.description}
                onChange={(html) => setFormData((prev) => ({ ...prev, description: html }))}
                placeholder="What did you work on?"
              />
            </div>
          </div>
            <CustomFieldsFormSection
              tableName="TimeEntries"
              token={token}
              values={formData.customFields}
              onChange={(customFields) => setFormData((prev) => ({ ...prev, customFields }))}
            />

          <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
            >
              {isSubmitting ? 'Saving...' : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
