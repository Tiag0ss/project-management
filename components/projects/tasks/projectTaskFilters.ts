import { optionalNumberArray, optionalPositiveNumber } from '@/lib/persistedFilters';

export type ProjectTaskListFilters = {
  filterText: string;
  filterStatus?: number;
  filterPriority?: number;
  filterAssignee?: number;
  filterTaskType?: number;
  hideClosed: boolean;
  unplannedOnly: boolean;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  filterTagIds: number[];
};

export const DEFAULT_PROJECT_TASK_FILTERS: ProjectTaskListFilters = {
  filterText: '',
  filterStatus: undefined,
  filterPriority: undefined,
  filterAssignee: undefined,
  filterTaskType: undefined,
  hideClosed: false,
  unplannedOnly: false,
  sortField: 'displayOrder',
  sortDirection: 'asc',
  filterTagIds: [],
};

export function mergeProjectTaskFilters(
  stored: Record<string, unknown>,
  defaults: ProjectTaskListFilters
): ProjectTaskListFilters {
  const sortDirection = stored.sortDirection === 'desc' ? 'desc' : stored.sortDirection === 'asc' ? 'asc' : defaults.sortDirection;
  return {
    filterText: typeof stored.filterText === 'string' ? stored.filterText : defaults.filterText,
    filterStatus: optionalPositiveNumber(stored.filterStatus),
    filterPriority: optionalPositiveNumber(stored.filterPriority),
    filterAssignee: optionalPositiveNumber(stored.filterAssignee),
    filterTaskType: optionalPositiveNumber(stored.filterTaskType),
    hideClosed: typeof stored.hideClosed === 'boolean' ? stored.hideClosed : defaults.hideClosed,
    unplannedOnly: typeof stored.unplannedOnly === 'boolean' ? stored.unplannedOnly : defaults.unplannedOnly,
    sortField: typeof stored.sortField === 'string' && stored.sortField ? stored.sortField : defaults.sortField,
    sortDirection,
    filterTagIds: optionalNumberArray(stored.filterTagIds),
  };
}
