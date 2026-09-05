export type BurndownPoint = {
  date: string;
  worked: number;
  cumulative: number;
  remaining: number;
  ideal: number;
};

/** Normalize DB/ISO values to YYYY-MM-DD without local timezone shifts. */
export function toDateOnlyString(value: string | Date): string {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date value: ${String(value)}`);
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseUtcDateOnly(dateStr: string): Date {
  const [y, m, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function formatUtcDateOnly(d: Date): string {
  return toDateOnlyString(d);
}

/**
 * Build daily burndown/burnup points from start through maxDate (inclusive).
 * Uses UTC calendar days so DST transitions never duplicate or skip keys.
 */
export function buildBurndownSeries(params: {
  startDate: string;
  endDate: string;
  maxDate: string;
  totalEstimatedHours: number;
  dailyMap: Record<string, number>;
}): BurndownPoint[] {
  const { startDate, endDate, maxDate, totalEstimatedHours, dailyMap } = params;
  const start = parseUtcDateOnly(startDate);
  const end = parseUtcDateOnly(maxDate);
  const projectEnd = parseUtcDateOnly(endDate);
  const totalDays = Math.max(1, Math.round((projectEnd.getTime() - start.getTime()) / 86400000));

  const series: BurndownPoint[] = [];
  let cumulative = 0;

  for (let d = new Date(start.getTime()); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = formatUtcDateOnly(d);
    const worked = dailyMap[dateStr] || 0;
    cumulative += worked;
    const daysFromStart = Math.round((d.getTime() - start.getTime()) / 86400000);
    const idealProgress =
      totalEstimatedHours > 0
        ? Math.max(0, totalEstimatedHours - totalEstimatedHours * (daysFromStart / totalDays))
        : 0;

    series.push({
      date: dateStr,
      worked,
      cumulative,
      remaining: Math.max(0, totalEstimatedHours - cumulative),
      ideal: Math.round(idealProgress * 100) / 100,
    });
  }

  return series;
}
