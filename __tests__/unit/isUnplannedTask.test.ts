import { isUnplannedLeafTask } from '@/lib/tasks/isUnplannedTask';

describe('isUnplannedLeafTask', () => {
  const tasks = [
    { Id: 1, ParentTaskId: null },
    { Id: 2, ParentTaskId: 1 },
    { Id: 3, ParentTaskId: null },
    { Id: 4, ParentTaskId: null },
  ];

  it('returns true for open leaf without planned dates', () => {
    expect(
      isUnplannedLeafTask(
        { Id: 2, ParentTaskId: 1, PlannedStartDate: null, PlannedEndDate: null },
        tasks
      )
    ).toBe(true);
  });

  it('returns false when both planned dates are set', () => {
    expect(
      isUnplannedLeafTask(
        {
          Id: 2,
          ParentTaskId: 1,
          PlannedStartDate: '2026-01-01',
          PlannedEndDate: '2026-01-05',
        },
        tasks
      )
    ).toBe(false);
  });

  it('returns false for parent tasks', () => {
    expect(
      isUnplannedLeafTask(
        { Id: 1, ParentTaskId: null, PlannedStartDate: null, PlannedEndDate: null },
        tasks
      )
    ).toBe(false);
  });

  it('returns false for closed tasks by default', () => {
    expect(
      isUnplannedLeafTask(
        {
          Id: 3,
          ParentTaskId: null,
          PlannedStartDate: null,
          PlannedEndDate: null,
          StatusIsClosed: 1,
        },
        tasks
      )
    ).toBe(false);
  });

  it('can include closed when excludeClosed is false', () => {
    expect(
      isUnplannedLeafTask(
        {
          Id: 3,
          ParentTaskId: null,
          PlannedStartDate: null,
          PlannedEndDate: null,
          StatusIsClosed: 1,
        },
        tasks,
        { excludeClosed: false }
      )
    ).toBe(true);
  });

  it('returns false for Unscheduled Work tasks', () => {
    expect(
      isUnplannedLeafTask(
        {
          Id: 4,
          ParentTaskId: null,
          PlannedStartDate: null,
          PlannedEndDate: null,
          UnscheduledWork: 1,
        },
        tasks
      )
    ).toBe(false);
  });
});
