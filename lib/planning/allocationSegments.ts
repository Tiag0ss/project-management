export type AllocationSegmentInput = {
  TaskId: number;
  UserId: number;
  TaskAllocationHeaderId?: number | null;
  AllocationDate: string;
  PlannedStartDate?: string | null;
  PlannedEndDate?: string | null;
};

export type AllocationSegment = {
  headerId: number | null;
  startDate: string;
  endDate: string;
};

/**
 * Build Gantt bar segments for one task+user pair.
 * One segment per TaskAllocationHeaderId (header-driven), not date-gap merge.
 */
export function getTaskUserAllocationSegments(
  allocations: AllocationSegmentInput[],
  taskId: number,
  userId: number,
  normalizeDateKey: (value: string | null | undefined) => string
): AllocationSegment[] {
  const taskUserAllocations = allocations
    .filter((allocation) => allocation.TaskId === taskId && allocation.UserId === userId)
    .map((allocation) => ({
      headerId: allocation.TaskAllocationHeaderId
        ? Number(allocation.TaskAllocationHeaderId)
        : null,
      dateKey: normalizeDateKey(allocation.AllocationDate),
      plannedStartDate: allocation.PlannedStartDate
        ? normalizeDateKey(allocation.PlannedStartDate)
        : null,
      plannedEndDate: allocation.PlannedEndDate
        ? normalizeDateKey(allocation.PlannedEndDate)
        : null,
    }))
    .filter((entry) => !!entry.dateKey);

  if (taskUserAllocations.length === 0) return [];

  const groupedByHeader = new Map<
    string,
    {
      headerId: number | null;
      dates: string[];
      plannedStartDate: string | null;
      plannedEndDate: string | null;
    }
  >();

  for (const entry of taskUserAllocations) {
    const groupKey =
      entry.headerId !== null ? `header-${entry.headerId}` : `legacy-${taskId}-${userId}`;
    const existing = groupedByHeader.get(groupKey);
    if (existing) {
      existing.dates.push(entry.dateKey);
    } else {
      groupedByHeader.set(groupKey, {
        headerId: entry.headerId,
        dates: [entry.dateKey],
        plannedStartDate: entry.plannedStartDate,
        plannedEndDate: entry.plannedEndDate,
      });
    }
  }

  return Array.from(groupedByHeader.values())
    .map((group) => {
      const sortedDates = Array.from(new Set(group.dates)).sort();
      return {
        headerId: group.headerId,
        startDate: group.plannedStartDate || sortedDates[0],
        endDate: group.plannedEndDate || sortedDates[sortedDates.length - 1],
      };
    })
    .sort((a, b) => {
      if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
      const headerA = a.headerId === null ? Number.MAX_SAFE_INTEGER : a.headerId;
      const headerB = b.headerId === null ? Number.MAX_SAFE_INTEGER : b.headerId;
      return headerA - headerB;
    });
}
