'use client';

import { useAuth } from '@/contexts/AuthContext';
import { formatHoursValue } from './formatHours';

export function useFormatHours(): (hours: number) => string {
  const { user } = useAuth();
  const format = user?.hoursDisplayFormat;
  return (hours: number) => formatHoursValue(hours, format);
}
