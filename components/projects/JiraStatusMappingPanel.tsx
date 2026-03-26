'use client';

import React, { useState } from 'react';
import { StatusValue } from '@/lib/api/statusValues';

interface JiraStatusMappingPanelProps {
  jiraStatuses: string[];
  taskStatuses: StatusValue[];
  mapping: Record<string, string>;
  onChange: (mapping: Record<string, string>) => void;
  /** Title shown in the panel header. Defaults to "Jira Status → Task Status" */
  title?: string;
  /** Whether the panel should start expanded. Defaults to false. */
  defaultExpanded?: boolean;
}

export default function JiraStatusMappingPanel({
  jiraStatuses,
  taskStatuses,
  mapping,
  onChange,
  title = 'Jira Status → Task Status',
  defaultExpanded = false,
}: JiraStatusMappingPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  if (jiraStatuses.length === 0) return null;

  return (
    <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left"
      >
        <h3 className="font-semibold text-indigo-900 dark:text-indigo-300">🧩 {title}</h3>
        <span className="text-indigo-700 dark:text-indigo-400 text-sm">{isOpen ? '▲ Collapse' : '▼ Expand'}</span>
      </button>

      {isOpen && (
        <div className="mt-4">
          <p className="text-xs text-indigo-800 dark:text-indigo-400 mb-2">
            Map each Jira status to a local task status. Leave as <em>Auto map</em> to match by name.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {jiraStatuses.map((jiraStatus) => (
              <div
                key={jiraStatus}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2"
              >
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{jiraStatus}</label>
                <select
                  value={mapping[jiraStatus] || ''}
                  onChange={(e) => onChange({ ...mapping, [jiraStatus]: e.target.value })}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Auto map</option>
                  {taskStatuses.map((s) => (
                    <option key={s.Id} value={s.StatusName || ''}>
                      {s.StatusName}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
