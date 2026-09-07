'use client';

import React, { useEffect, useState } from 'react';
import { Project } from '@/lib/api/projects';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { getApiUrl } from '@/lib/api/config';
import { useToast } from '@/contexts/ToastContext';

export function ProjectMappingsTab({
  project,
  token,
  onSaved,
  hideInlineSave = false,
  onSavingChange,
}: {
  project: Project;
  token: string;
  onSaved: () => void;
  hideInlineSave?: boolean;
  onSavingChange?: (saving: boolean) => void;
}) {
  const { showToast } = useToast();
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [taskPriorities, setTaskPriorities] = useState<StatusValue[]>([]);
  const [taskTypes, setTaskTypes] = useState<StatusValue[]>([]);
  const [statusMappings, setStatusMappings] = useState<Array<{ source: string; target: string }>>([]);
  const [priorityMappings, setPriorityMappings] = useState<Array<{ source: string; target: string }>>([]);
  const [typeMappings, setTypeMappings] = useState<Array<{ source: string; target: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState('');
  const [_success, setSuccess] = useState(false);

  useEffect(() => {
    onSavingChange?.(isLoading);
    return () => onSavingChange?.(false);
  }, [isLoading, onSavingChange]);

  const parseProjectMapping = (value: unknown): Record<string, string> => {
    if (!value || typeof value !== 'string') {
      return {};
    }

    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string>;
      }
    } catch {
      return {};
    }

    return {};
  };

  const toRows = (mapping: Record<string, string>): Array<{ source: string; target: string }> => {
    return Object.entries(mapping).map(([source, target]) => ({ source, target: String(target || '') }));
  };

  const toMappingObject = (rows: Array<{ source: string; target: string }>): Record<string, string> => {
    const mapping: Record<string, string> = {};
    for (const row of rows) {
      const source = row.source.trim();
      const target = row.target.trim();
      if (!source || !target) {
        continue;
      }
      mapping[source] = target;
    }
    return mapping;
  };

  useEffect(() => {
    const loadOptions = async () => {
      setIsInitializing(true);
      try {
        const [statusesRes, prioritiesRes, taskTypesRes] = await Promise.all([
          statusValuesApi.getTaskStatuses(project.OrganizationId, token),
          statusValuesApi.getTaskPriorities(project.OrganizationId, token),
          statusValuesApi.getTaskTypes(project.OrganizationId, token),
        ]);

        setTaskStatuses(statusesRes.statuses || []);
        setTaskPriorities(prioritiesRes.priorities || []);
        setTaskTypes(taskTypesRes.types || []);

        setStatusMappings(toRows(parseProjectMapping(project.JiraTaskStatusMappingJson)));
        setPriorityMappings(toRows(parseProjectMapping(project.JiraTaskPriorityMappingJson)));
        setTypeMappings(toRows(parseProjectMapping(project.JiraTaskTypeMappingJson)));
      } catch (err: any) {
        setError(err?.message || 'Failed to load mapping options');
      } finally {
        setIsInitializing(false);
      }
    };

    loadOptions();
  }, [project.OrganizationId, project.JiraTaskStatusMappingJson, project.JiraTaskPriorityMappingJson, project.JiraTaskTypeMappingJson, token]);

  const updateRow = (
    setter: React.Dispatch<React.SetStateAction<Array<{ source: string; target: string }>>>,
    index: number,
    field: 'source' | 'target',
    value: string
  ) => {
    setter((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  };

  const removeRow = (
    setter: React.Dispatch<React.SetStateAction<Array<{ source: string; target: string }>>>,
    index: number
  ) => {
    setter((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const addRow = (setter: React.Dispatch<React.SetStateAction<Array<{ source: string; target: string }>>>) => {
    setter((prev) => [...prev, { source: '', target: '' }]);
  };

  const saveMappings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      const response = await fetch(`${getApiUrl()}/api/projects/${project.Id}/task-mappings`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationType: 'jira-board',
          statusMapping: toMappingObject(statusMappings),
          priorityMapping: toMappingObject(priorityMappings),
          taskTypeMapping: toMappingObject(typeMappings),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to save task mappings');
      }

      setSuccess(true);
      showToast({ type: 'success', title: 'Mappings Saved', message: 'Task mappings updated successfully.' });
      setTimeout(() => {
        onSaved();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Failed to save task mappings');
    } finally {
      setIsLoading(false);
    }
  };

  const renderMappingSection = (
    title: string,
    rows: Array<{ source: string; target: string }>,
    setter: React.Dispatch<React.SetStateAction<Array<{ source: string; target: string }>>>,
    options: string[],
    sourcePlaceholder: string
  ) => (
    <div className="p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-300 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</label>
        <button
          type="button"
          onClick={() => addRow(setter)}
          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Add mapping
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">No mappings configured.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={`${title}-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <input
                type="text"
                value={row.source}
                onChange={(e) => updateRow(setter, index, 'source', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                placeholder={sourcePlaceholder}
              />
              <select
                value={row.target}
                onChange={(e) => updateRow(setter, index, 'target', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value="">Select target value</option>
                {options.map((option) => (
                  <option key={`${title}-${option}`} value={option}>{option}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeRow(setter, index)}
                className="px-3 py-2 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const statusOptions = taskStatuses.map((status) => status.StatusName).filter(Boolean);
  const priorityOptions = taskPriorities.map((priority) => String(priority.PriorityName || priority.StatusName || '')).filter(Boolean);
  const typeOptions = taskTypes.map((typeOption) => String(typeOption.TypeName || typeOption.StatusName || '')).filter(Boolean);

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Status, Priority and Task Type</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          These mappings apply to Jira Board issue imports. Jira Ticket import uses its own mapping flow.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
            {error}
          </div>
        )}

        <form id="project-mappings-form" onSubmit={saveMappings} className="space-y-4">
          {isInitializing ? (
            <div className="text-gray-600 dark:text-gray-400">Loading mapping options...</div>
          ) : (
            <>
              {renderMappingSection('Status Mapping', statusMappings, setStatusMappings, statusOptions, 'External status (e.g. In Progress)')}
              {renderMappingSection('Priority Mapping', priorityMappings, setPriorityMappings, priorityOptions, 'External priority (e.g. Highest)')}
              {renderMappingSection('Task Type Mapping', typeMappings, setTypeMappings, typeOptions, 'External issue type (e.g. Story)')}

              {!hideInlineSave && (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                >
                  {isLoading ? 'Saving...' : 'Save mappings'}
                </button>
              )}
            </>
          )}
        </form>
      </div>
    </div>
  );
}
