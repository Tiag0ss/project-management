/** Calendar date in local timezone (avoids UTC day-shift on toISOString). */
export function formatDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function defaultReportingRange(days = 30): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return { from: formatDateInput(from), to: formatDateInput(to) };
}

/** Previous window of equal length ending the day before `from`. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { from: formatDateInput(prevStart), to: formatDateInput(prevEnd) };
}

export function formatDelta(delta: number, deltaPct: number | null, suffix = ''): string {
  const sign = delta > 0 ? '+' : '';
  const abs = `${sign}${Number(delta.toFixed(1))}${suffix}`;
  if (deltaPct === null) return `${abs} (n/a)`;
  return `${abs} (${sign}${deltaPct}%)`;
}
