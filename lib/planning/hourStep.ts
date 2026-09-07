/** Half-hour planning step helpers (Gantt / allocation editors). */

export const PLANNING_HOUR_STEP = 0.5;

export function roundToPlanningStep(value: number | string | null | undefined): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  const scaled = Math.round(numericValue / PLANNING_HOUR_STEP + Number.EPSILON);
  return Number((scaled * PLANNING_HOUR_STEP).toFixed(2));
}

export function floorToPlanningStep(value: number | string | null | undefined): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  const scaled = Math.floor(numericValue / PLANNING_HOUR_STEP + 1e-9);
  return Number((scaled * PLANNING_HOUR_STEP).toFixed(2));
}

export function isPlanningStepValue(value: number | string | null | undefined): boolean {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return false;
  const scaled = numericValue / PLANNING_HOUR_STEP;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}
