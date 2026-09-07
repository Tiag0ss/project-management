import { sumAllocationHoursByHeaderId } from '../../lib/planning/sumHoursByHeaderId';
import { getAllLeafTasks, isLeafTask } from '../../lib/planning/leafTasks';
import { getTaskUserAllocationSegments } from '../../lib/planning/allocationSegments';

describe('sumAllocationHoursByHeaderId', () => {
  it('sums hours per header and skips invalid headers', () => {
    const map = sumAllocationHoursByHeaderId([
      { TaskAllocationHeaderId: 10, AllocatedHours: 1 },
      { TaskAllocationHeaderId: 10, AllocatedHours: 0.5 },
      { TaskAllocationHeaderId: null, AllocatedHours: 9 },
      { TaskAllocationHeaderId: 0, AllocatedHours: 9 },
      { TaskAllocationHeaderId: 11, AllocatedHours: 2 },
    ]);
    expect(map.get(10)).toBe(1.5);
    expect(map.get(11)).toBe(2);
    expect(map.has(0)).toBe(false);
  });
});

describe('leafTasks', () => {
  const tasks = [
    { Id: 1, ParentTaskId: null },
    { Id: 2, ParentTaskId: 1 },
    { Id: 3, ParentTaskId: 1 },
    { Id: 4, ParentTaskId: 2 },
  ];

  it('detects leaves and walks the tree', () => {
    expect(isLeafTask(tasks, 1)).toBe(false);
    expect(isLeafTask(tasks, 4)).toBe(true);
    expect(getAllLeafTasks(tasks, 1).map((t) => t.Id).sort()).toEqual([3, 4]);
    expect(getAllLeafTasks(tasks, 4).map((t) => t.Id)).toEqual([4]);
  });
});

describe('getTaskUserAllocationSegments', () => {
  const normalize = (v: string | null | undefined) => String(v || '').slice(0, 10);

  it('builds one segment per header and prefers planned dates', () => {
    const segments = getTaskUserAllocationSegments(
      [
        {
          TaskId: 1,
          UserId: 7,
          TaskAllocationHeaderId: 100,
          AllocationDate: '2026-01-02',
          PlannedStartDate: '2026-01-01',
          PlannedEndDate: '2026-01-10',
        },
        {
          TaskId: 1,
          UserId: 7,
          TaskAllocationHeaderId: 100,
          AllocationDate: '2026-01-03',
          PlannedStartDate: '2026-01-01',
          PlannedEndDate: '2026-01-10',
        },
        {
          TaskId: 1,
          UserId: 7,
          TaskAllocationHeaderId: 200,
          AllocationDate: '2026-02-01',
          PlannedStartDate: null,
          PlannedEndDate: null,
        },
      ],
      1,
      7,
      normalize
    );
    expect(segments).toEqual([
      { headerId: 100, startDate: '2026-01-01', endDate: '2026-01-10' },
      { headerId: 200, startDate: '2026-02-01', endDate: '2026-02-01' },
    ]);
  });

  it('groups legacy null headers together', () => {
    const segments = getTaskUserAllocationSegments(
      [
        {
          TaskId: 1,
          UserId: 7,
          TaskAllocationHeaderId: null,
          AllocationDate: '2026-03-01',
        },
        {
          TaskId: 1,
          UserId: 7,
          TaskAllocationHeaderId: null,
          AllocationDate: '2026-03-05',
        },
      ],
      1,
      7,
      normalize
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      headerId: null,
      startDate: '2026-03-01',
      endDate: '2026-03-05',
    });
  });
});
