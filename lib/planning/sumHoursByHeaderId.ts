import { roundToPlanningStep } from '@/lib/planning/hourStep';

export type AllocationHoursRow = {
  TaskAllocationHeaderId?: number | null;
  AllocatedHours?: number | string | null;
};

/** Sum AllocatedHours keyed by TaskAllocationHeaderId (skips null/0 headers). */
export function sumAllocationHoursByHeaderId(
  allocations: AllocationHoursRow[]
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const allocation of allocations) {
    const headerId = Number(allocation.TaskAllocationHeaderId || 0);
    if (!Number.isFinite(headerId) || headerId <= 0) continue;
    const hours = Number(allocation.AllocatedHours || 0);
    const previous = totals.get(headerId) || 0;
    totals.set(headerId, roundToPlanningStep(previous + hours));
  }
  return totals;
}
