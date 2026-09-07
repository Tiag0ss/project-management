import {
  calculateRecursiveWorked,
  getLeafTasks,
  getParentTasks,
  getSubtasks,
  sumLeafEstimatedHours,
  sumLeafWorkedHours,
  sumParentAllocatedHours,
} from '@/components/projects/reporting/reportingHours';

const tasks = [
  { Id: 1, ParentTaskId: null, EstimatedHours: 10, TotalAllocated: 8, TotalWorked: 0 },
  { Id: 2, ParentTaskId: 1, EstimatedHours: 4, TotalAllocated: 4, TotalWorked: 2 },
  { Id: 3, ParentTaskId: 1, EstimatedHours: 6, TotalAllocated: 4, TotalWorked: 3 },
  { Id: 4, ParentTaskId: null, EstimatedHours: 5, TotalAllocated: 5, TotalWorked: 1 },
];

describe('reportingHours', () => {
  it('getSubtasks returns children of a parent', () => {
    expect(getSubtasks(tasks, 1).map((t) => t.Id)).toEqual([2, 3]);
    expect(getSubtasks(tasks, 4)).toEqual([]);
  });

  it('getParentTasks returns top-level tasks', () => {
    expect(getParentTasks(tasks).map((t) => t.Id)).toEqual([1, 4]);
  });

  it('getLeafTasks excludes parents that have children', () => {
    expect(getLeafTasks(tasks).map((t) => t.Id)).toEqual([2, 3, 4]);
  });

  it('calculateRecursiveWorked sums leaf descendants for parents', () => {
    expect(calculateRecursiveWorked(tasks, 1)).toBe(5);
    expect(calculateRecursiveWorked(tasks, 2)).toBe(2);
    expect(calculateRecursiveWorked(tasks, 4)).toBe(1);
  });

  it('sums leaf estimated/worked and parent allocated without double-count', () => {
    expect(sumLeafEstimatedHours(tasks)).toBe(15);
    expect(sumLeafWorkedHours(tasks)).toBe(6);
    expect(sumParentAllocatedHours(tasks)).toBe(13);
  });
});
