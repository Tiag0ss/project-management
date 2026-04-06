export const decimalHoursToHMS = (hours: number): string => {
  const totalSeconds = Math.round(Math.abs(hours) * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const sign = hours < 0 ? '-' : '';
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const formatHoursValue = (hours: number, format?: string): string => {
  if (format === 'decimal') {
    const sign = hours < 0 ? '-' : '';
    return `${sign}${Math.abs(hours).toFixed(2)}h`;
  }
  return decimalHoursToHMS(hours);
};
