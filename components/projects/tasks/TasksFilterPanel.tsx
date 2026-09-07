'use client';

import React, { type ReactNode } from 'react';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import { SearchableSelect } from '@/components/projects/ProjectInlineFields';

export function TasksFilterPanel({
  filterText,
  setFilterText,
  filterTaskType,
  setFilterTaskType,
  filterStatus,
  setFilterStatus,
  filterPriority,
  setFilterPriority,
  filterAssignee,
  setFilterAssignee,
  filterTagIds,
  setFilterTagIds,
  hideClosed,
  setHideClosed,
  unplannedOnly,
  setUnplannedOnly,
  isFilterActive,
  resetTaskFilters,
  taskTypeOptions,
  statusOptions,
  priorityOptions,
  assigneeOptions,
  tagFilterOptions,
  headerExtra,
}: {
  filterText: string;
  setFilterText: (value: string) => void;
  filterTaskType: number | undefined;
  setFilterTaskType: (value: number | undefined) => void;
  filterStatus: number | undefined;
  setFilterStatus: (value: number | undefined) => void;
  filterPriority: number | undefined;
  setFilterPriority: (value: number | undefined) => void;
  filterAssignee: number | undefined;
  setFilterAssignee: (value: number | undefined) => void;
  filterTagIds: number[];
  setFilterTagIds: (value: number[] | ((prev: number[]) => number[])) => void;
  hideClosed: boolean;
  setHideClosed: (value: boolean) => void;
  unplannedOnly: boolean;
  setUnplannedOnly: (value: boolean) => void;
  isFilterActive: boolean;
  resetTaskFilters: () => void;
  taskTypeOptions: Array<{ id: number; name: string }>;
  statusOptions: Array<{ id: number; name: string }>;
  priorityOptions: Array<{ id: number; name: string }>;
  assigneeOptions: Array<{ id: number; name: string }>;
  tagFilterOptions: Array<{ value: number; label: string; subtitle?: string }>;
  headerExtra?: ReactNode;
}) {
  return (
          <CollapsibleFilterPanel
            title="Task filters"
            activeCount={[
              filterText.trim() ? 1 : 0,
              filterTaskType != null ? 1 : 0,
              filterStatus != null ? 1 : 0,
              filterPriority != null ? 1 : 0,
              filterAssignee != null ? 1 : 0,
              filterTagIds.length > 0 ? 1 : 0,
              hideClosed ? 1 : 0,
              unplannedOnly ? 1 : 0,
            ].reduce((a, b) => a + b, 0)}
            onClear={resetTaskFilters}
            headerExtra={headerExtra}
            className="mb-0"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-2">
              <div className="lg:col-span-2">
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Search task, description, assignee..."
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <SearchableSelect
                  value={filterTaskType}
                  onChange={(value) => setFilterTaskType(value)}
                  options={taskTypeOptions.map((taskType) => ({ id: taskType.id, label: taskType.name }))}
                  placeholder="All task types"
                  className="w-full"
                />
              </div>
              <div>
                <SearchableSelect
                  value={filterStatus}
                  onChange={(value) => setFilterStatus(value)}
                  options={statusOptions.map((status) => ({ id: status.id, label: status.name }))}
                  placeholder="All statuses"
                  className="w-full"
                />
              </div>
              <div>
                <SearchableSelect
                  value={filterPriority}
                  onChange={(value) => setFilterPriority(value)}
                  options={priorityOptions.map((priority) => ({ id: priority.id, label: priority.name }))}
                  placeholder="All priorities"
                  className="w-full"
                />
              </div>
              <div>
                <SearchableSelect
                  value={filterAssignee}
                  onChange={(value) => setFilterAssignee(value)}
                  options={assigneeOptions.map((assignee) => ({ id: assignee.id, label: assignee.name }))}
                  placeholder="All assignees"
                  className="w-full"
                />
              </div>
              <div>
                <SearchableMultiSelect
                  values={filterTagIds}
                  onChange={(values) => setFilterTagIds(values.map(value => Number(value)))}
                  options={tagFilterOptions}
                  placeholder="All tags"
                />
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={hideClosed}
                    onChange={(e) => setHideClosed(e.target.checked)}
                    className="rounded"
                  />
                  Hide closed tasks
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={unplannedOnly}
                    onChange={(e) => setUnplannedOnly(e.target.checked)}
                    className="rounded"
                  />
                  Unplanned only
                </label>
              </div>
              {isFilterActive && (
                <button
                  type="button"
                  onClick={() => {
                    resetTaskFilters();
                  }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          </CollapsibleFilterPanel>

  );
}
