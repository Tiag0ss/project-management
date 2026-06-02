'use client';

import { getApiUrl } from '@/lib/api/config';
import { RecurringAllocationOccurrence } from '@/lib/api/recurringAllocations';
import { tasksApi, Task as ApiTask } from '@/lib/api/tasks';
import { projectsApi, Project as ApiProject } from '@/lib/api/projects';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, endOfWeek, startOfMonth, endOfMonth, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import CallRecordFormModal, { CallRecordFormValues } from '@/components/CallRecordFormModal';
import TimeEntryFormModal, { TimeEntryFormValues } from '@/components/TimeEntryFormModal';
import RichTextEditor from '@/components/RichTextEditor';
import TaskDetailModal from '@/components/TaskDetailModal';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const mondayEnUS = {
  ...enUS,
  options: {
    ...enUS.options,
    weekStartsOn: 1,
  },
};

const locales = {
  'en-US': mondayEnUS,
};

const startOfWeekMonday = (date: Date) => startOfWeek(date, { weekStartsOn: 1 });

const parseDateOnlyToLocalNoon = (value: string | Date): Date | null => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
  }

  const raw = String(value || '');
  const datePart = raw.split('T')[0];
  const [yearStr, monthStr, dayStr] = datePart.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0);
};

const getLocalDateKey = (value: string | Date): string | null => {
  const parsed = parseDateOnlyToLocalNoon(value);
  return parsed ? parsed.toDateString() : null;
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: startOfWeekMonday,
  getDay,
  locales,
});

interface Task {
  Id: number;
  TaskName: string;
  PlannedStartDate?: string;
  EstimatedHours?: number | string;
  ProjectId: number;
  ProjectName?: string;
  Priority: number | null;
  Status: number | null;
  StatusName?: string;
  StatusColor?: string;
  StatusIsClosed?: number;
  StatusIsCancelled?: number;
  PriorityName?: string;
  PriorityColor?: string;
}

interface TimeEntry {
  Id: number;
  TaskId: number;
  WorkDate: string;
  Hours: number | string;
  TaskName: string;
  StartTime?: string;
  EndTime?: string;
  Description?: string;
}

interface CallRecord {
  Id: number;
  CallDate: string;
  StartTime: string;
  DurationMinutes: number;
  CallType: string;
  Participants: string;
  Subject: string;
  Notes?: string;
  OrganizationId?: number;
  ProjectId?: number;
  TaskId?: number;
}

interface TaskAllocation {
  Id: number;
  TaskId: number;
  TaskName: string;
  ProjectId: number;
  ProjectName: string;
  AllocationDate: string;
  AllocatedHours: number;
  StartTime: string;
  EndTime: string;
}

interface HolidayItem {
  Id: number;
  Year: number;
  CountryCode: string;
  HolidayDate: string;
  HolidayName: string;
  Source: string;
  IsActive: number;
}

interface VacationCalendarItem {
  Id: number;
  VacationDate: string;
  DayPortion?: 'full' | 'half' | string;
  Status: string;
  Notes?: string;
}

interface OutOfOfficeCalendarItem {
  Id: number;
  OutOfOfficeDate: string;
  DayPortion?: 'full' | 'half' | string;
  Status: string;
  Notes?: string;
}

type LeaveDayPortion = 'full' | 'half';

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource: {
    type: 'task' | 'timeEntry' | 'call' | 'lunch' | 'recurring' | 'holiday' | 'vacation' | 'outOfOffice' | 'outlook';
    projectId?: number;
    taskId?: number;
    entryId?: number;
    callId?: number;
    hours?: number | string;
    callType?: string;
    description?: string;
    workDate?: string;
    recurringAllocationId?: number;
    holidayId?: number;
    vacationId?: number;
    vacationStatus?: string;
    outOfOfficeId?: number;
    outOfOfficeStatus?: string;
    source?: string;
    webLink?: string;
    userName?: string;
    userEmail?: string;
  };
}

interface OutlookCalendarEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  isAllDay?: boolean;
  webLink?: string | null;
  userName?: string;
  userEmail?: string;
}

interface CalendarTabProps {
  tasks: Task[];
  timeEntries: TimeEntry[];
  callRecords: CallRecord[];
  taskAllocations: TaskAllocation[];
  recurringAllocations: RecurringAllocationOccurrence[];
  workStartTimes: {
    monday: string;
    tuesday: string;
    wednesday: string;
    thursday: string;
    friday: string;
    saturday: string;
    sunday: string;
  };
  lunchTime: string;
  lunchDuration: number;
  token: string;
  onDataChanged: () => void;
}

interface SlotInfo {
  start: Date;
  end: Date;
}

export default function CalendarTab({ tasks, timeEntries, callRecords, taskAllocations, recurringAllocations, workStartTimes, lunchTime, lunchDuration, token, onDataChanged }: CalendarTabProps) {
  const [currentView, setCurrentView] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [vacations, setVacations] = useState<VacationCalendarItem[]>([]);
  const [outOfOfficeEntries, setOutOfOfficeEntries] = useState<OutOfOfficeCalendarItem[]>([]);
  const [outlookEvents, setOutlookEvents] = useState<OutlookCalendarEvent[]>([]);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  const [detailsTask, setDetailsTask] = useState<ApiTask | null>(null);
  const [detailsProject, setDetailsProject] = useState<ApiProject | null>(null);
  const [detailsProjectTasks, setDetailsProjectTasks] = useState<ApiTask[]>([]);
  
  // Slot selection modal state
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotInfo | null>(null);
  const [slotAction, setSlotAction] = useState<'choice' | 'timeEntry' | 'call' | 'vacation' | 'outOfOffice'>('choice');
  const [vacationStartDate, setVacationStartDate] = useState<string>('');
  const [vacationEndDate, setVacationEndDate] = useState<string>('');
  const [vacationNotes, setVacationNotes] = useState('');
  const [leaveDayPortion, setLeaveDayPortion] = useState<LeaveDayPortion>('full');
  const [isSaving, setIsSaving] = useState(false);

  const CALENDAR_HIDDEN_TYPES_KEY = 'dashboard_calendar_hidden_types';
  type CalendarEventType = CalendarEvent['resource']['type'];
  const [hiddenTypes, setHiddenTypes] = useState<Set<CalendarEventType>>(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(CALENDAR_HIDDEN_TYPES_KEY) : null;
      return stored ? new Set<CalendarEventType>(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const toggleHiddenType = (type: CalendarEventType) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      try { localStorage.setItem(CALENDAR_HIDDEN_TYPES_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const CALENDAR_NO_OVERLAP_KEY = 'dashboard_calendar_no_overlap';
  const [noOverlap, setNoOverlap] = useState<boolean>(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem(CALENDAR_NO_OVERLAP_KEY) : null;
      return stored ? JSON.parse(stored) : false;
    } catch { return false; } 
  });
  const toggleNoOverlap = () => {
    setNoOverlap((prev) => {
      const next = !prev;
      try { localStorage.setItem(CALENDAR_NO_OVERLAP_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    if (!token) {
      setHolidays([]);
      return;
    }

    const loadHolidays = async () => {
      try {
        const visibleStart = currentView === 'month'
          ? startOfMonth(currentDate)
          : startOfWeek(currentDate, { weekStartsOn: 1 });
        const visibleEnd = currentView === 'month'
          ? endOfMonth(currentDate)
          : endOfWeek(currentDate, { weekStartsOn: 1 });

        const years = Array.from(new Set([visibleStart.getFullYear(), visibleEnd.getFullYear()]));

        const responses = await Promise.all(
          years.map((year) =>
            fetch(`${getApiUrl()}/api/holidays/my?year=${year}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          )
        );

        const holidayLists = await Promise.all(
          responses.map(async (response) => {
            if (!response.ok) {
              return [] as HolidayItem[];
            }
            const data = await response.json();
            return (data.holidays || []) as HolidayItem[];
          })
        );

        const merged = holidayLists.flat();
        const uniqueById = new Map<number, HolidayItem>();
        merged.forEach((holiday) => uniqueById.set(holiday.Id, holiday));
        setHolidays(Array.from(uniqueById.values()));
      } catch (error) {
        console.error('Error loading holidays for calendar:', error);
        setHolidays([]);
      }
    };

    loadHolidays();
  }, [token, currentDate, currentView]);

  useEffect(() => {
    if (!token) {
      setOutlookEvents([]);
      return;
    }

    const loadOutlookEvents = async () => {
      try {
        const visibleStart = currentView === 'month'
          ? startOfMonth(currentDate)
          : startOfWeek(currentDate, { weekStartsOn: 1 });
        const visibleEnd = currentView === 'month'
          ? endOfMonth(currentDate)
          : endOfWeek(currentDate, { weekStartsOn: 1 });

        const startDate = format(visibleStart, 'yyyy-MM-dd');
        const endDate = format(visibleEnd, 'yyyy-MM-dd');

        const response = await fetch(
          `${getApiUrl()}/api/outlook-calendar/events?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!response.ok) {
          setOutlookEvents([]);
          return;
        }

        const data = await response.json();
        if (data?.success && data?.enabled && Array.isArray(data.events)) {
          setOutlookEvents(data.events as OutlookCalendarEvent[]);
        } else {
          setOutlookEvents([]);
        }
      } catch (error) {
        console.error('Error loading Outlook calendar events:', error);
        setOutlookEvents([]);
      }
    };

    loadOutlookEvents();
  }, [token, currentDate, currentView]);

  useEffect(() => {
    if (!token) {
      setVacations([]);
      return;
    }

    const loadVacations = async () => {
      try {
        const visibleStart = currentView === 'month'
          ? startOfMonth(currentDate)
          : startOfWeek(currentDate, { weekStartsOn: 1 });
        const visibleEnd = currentView === 'month'
          ? endOfMonth(currentDate)
          : endOfWeek(currentDate, { weekStartsOn: 1 });

        const years = Array.from(new Set([visibleStart.getFullYear(), visibleEnd.getFullYear()]));

        const responses = await Promise.all(
          years.map((year) =>
            fetch(`${getApiUrl()}/api/vacations/my?year=${year}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          )
        );

        const vacationLists = await Promise.all(
          responses.map(async (response) => {
            if (!response.ok) {
              return [] as VacationCalendarItem[];
            }
            const data = await response.json();
            return (data.entries || []) as VacationCalendarItem[];
          })
        );

        const merged = vacationLists.flat();
        const uniqueById = new Map<number, VacationCalendarItem>();
        merged.forEach((vacation) => uniqueById.set(vacation.Id, vacation));
        setVacations(Array.from(uniqueById.values()));
      } catch (error) {
        console.error('Error loading vacations for calendar:', error);
        setVacations([]);
      }
    };

    loadVacations();
  }, [token, currentDate, currentView]);

  useEffect(() => {
    if (!token) {
      setOutOfOfficeEntries([]);
      return;
    }

    const loadOutOfOfficeEntries = async () => {
      try {
        const visibleStart = currentView === 'month'
          ? startOfMonth(currentDate)
          : startOfWeek(currentDate, { weekStartsOn: 1 });
        const visibleEnd = currentView === 'month'
          ? endOfMonth(currentDate)
          : endOfWeek(currentDate, { weekStartsOn: 1 });

        const years = Array.from(new Set([visibleStart.getFullYear(), visibleEnd.getFullYear()]));

        const responses = await Promise.all(
          years.map((year) =>
            fetch(`${getApiUrl()}/api/out-of-office/my?year=${year}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
          )
        );

        const outOfOfficeLists = await Promise.all(
          responses.map(async (response) => {
            if (!response.ok) {
              return [] as OutOfOfficeCalendarItem[];
            }
            const data = await response.json();
            return (data.entries || []) as OutOfOfficeCalendarItem[];
          })
        );

        const merged = outOfOfficeLists.flat();
        const uniqueById = new Map<number, OutOfOfficeCalendarItem>();
        merged.forEach((entry) => uniqueById.set(entry.Id, entry));
        setOutOfOfficeEntries(Array.from(uniqueById.values()));
      } catch (error) {
        console.error('Error loading out-of-office for calendar:', error);
        setOutOfOfficeEntries([]);
      }
    };

    loadOutOfOfficeEntries();
  }, [token, currentDate, currentView]);
  
  // Helper functions for time calculations
  const calculateHoursDifference = (startTime: string, endTime: string): number => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startTotalMin = startHour * 60 + startMin;
    const endTotalMin = endHour * 60 + endMin;
    const diffMin = endTotalMin - startTotalMin;
    return Math.max(0, diffMin / 60);
  };
  
  const calculateEndTime = (startTime: string, hours: number): string => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const totalMinutes = startHour * 60 + startMin + (hours * 60);
    const endHour = Math.floor(totalMinutes / 60) % 24;
    const endMin = Math.floor(totalMinutes % 60);
    return `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
  };
  
  // Edit time entry modal state
  const [showEditEntryModal, setShowEditEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<{
    id: number;
    taskId: number;
    taskName: string;
    workDate: string;
    hours: string;
    startTime: string;
    endTime: string;
    description: string;
  } | null>(null);
  const [showEditCallModal, setShowEditCallModal] = useState(false);
  const [editingCallRecord, setEditingCallRecord] = useState<CallRecord | null>(null);

  // Convert tasks and time entries to calendar events (non-overlapping)
  const events = useMemo(() => {
    const calendarEvents: CalendarEvent[] = [];
    
    // Parse lunch time
    const [lunchHour, lunchMin] = lunchTime.split(':').map(Number);
    
    // Group task allocations by date (these have specific start/end times)
    const allocationsByDate: { [date: string]: TaskAllocation[] } = {};
    taskAllocations.forEach(allocation => {
      if (allocation.AllocationDate) {
        const dateKey = getLocalDateKey(allocation.AllocationDate);
        if (!dateKey) return;
        if (!allocationsByDate[dateKey]) {
          allocationsByDate[dateKey] = [];
        }
        allocationsByDate[dateKey].push(allocation);
      }
    });

    // Group entries by date
    const entriesByDate: { [date: string]: TimeEntry[] } = {};
    timeEntries.forEach(entry => {
      if (entry.WorkDate) {
        const dateKey = getLocalDateKey(entry.WorkDate);
        if (!dateKey) return;
        if (!entriesByDate[dateKey]) {
          entriesByDate[dateKey] = [];
        }
        entriesByDate[dateKey].push(entry);
      }
    });

    // Group call records by date
    const callsByDate: { [date: string]: CallRecord[] } = {};
    callRecords.forEach(call => {
      if (call.CallDate) {
        const dateKey = getLocalDateKey(call.CallDate);
        if (!dateKey) return;
        if (!callsByDate[dateKey]) {
          callsByDate[dateKey] = [];
        }
        callsByDate[dateKey].push(call);
      }
    });

    // Group recurring allocations by date
    const recurringByDate: { [date: string]: RecurringAllocationOccurrence[] } = {};
    recurringAllocations.forEach(recurring => {
      if (recurring.OccurrenceDate) {
        const dateKey = getLocalDateKey(recurring.OccurrenceDate);
        if (!dateKey) return;
        if (!recurringByDate[dateKey]) {
          recurringByDate[dateKey] = [];
        }
        recurringByDate[dateKey].push(recurring);
      }
    });

    // Get all dates that need to be processed (including current week for lunch)
    const today = new Date();
    const startOfCurrentWeek = new Date(today);
    const weekdayIndexMondayBased = (today.getDay() + 6) % 7;
    startOfCurrentWeek.setDate(today.getDate() - weekdayIndexMondayBased);
    
    // Generate dates for current week and next 4 weeks
    const datesToProcess = new Set<string>();
    for (let i = 0; i < 35; i++) {
      const d = new Date(startOfCurrentWeek);
      d.setDate(startOfCurrentWeek.getDate() + i);
      datesToProcess.add(d.toDateString());
    }
    
    // Add all dates from events
    Object.keys(allocationsByDate).forEach(d => datesToProcess.add(d));
    Object.keys(entriesByDate).forEach(d => datesToProcess.add(d));
    Object.keys(callsByDate).forEach(d => datesToProcess.add(d));
    Object.keys(recurringByDate).forEach(d => datesToProcess.add(d));
    
    datesToProcess.forEach(dateKey => {
      const dayAllocations = allocationsByDate[dateKey] || [];
      const dayEntries = entriesByDate[dateKey] || [];
      const dayCalls = callsByDate[dateKey] || [];
      const dayRecurring = recurringByDate[dateKey] || [];
      
      // Get work start time for this day
      const date = new Date(dateKey);
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[date.getDay()] as keyof typeof workStartTimes;

      // Add lunch block for workdays (if lunch duration > 0)
      if (lunchDuration > 0) {
        const lunchStart = new Date(date);
        lunchStart.setHours(lunchHour, lunchMin, 0);
        
        const lunchEnd = new Date(lunchStart);
        lunchEnd.setMinutes(lunchStart.getMinutes() + lunchDuration);
        
        calendarEvents.push({
          id: `lunch-${dateKey}`,
          title: `🍽️ Lunch Break`,
          start: lunchStart,
          end: lunchEnd,
          resource: {
            type: 'lunch',
          },
        });
      }

      // Add calls at their scheduled time
      dayCalls.forEach(call => {
        const [callHour, callMin] = (call.StartTime || '09:00').split(':').map(Number);
        const start = new Date(date);
        start.setHours(callHour, callMin, 0);
        
        const durationMinutes = call.DurationMinutes || 30;
        const end = new Date(start);
        end.setMinutes(start.getMinutes() + durationMinutes);
        
        const callIcon = call.CallType === 'Teams' ? '💬' : call.CallType === 'Phone' ? '📞' : '🎥';
        
        calendarEvents.push({
          id: `call-${call.Id}`,
          title: `${callIcon} ${call.Subject || call.CallType + ' Call'} (${durationMinutes}min)`,
          start,
          end,
          resource: {
            type: 'call',
            callId: call.Id,
            callType: call.CallType,
          },
        });
      });
      
      // Add task allocations with their specific start and end times
      dayAllocations.forEach((allocation, allocationIndex) => {
        if (allocation.StartTime && allocation.EndTime) {
          const [startHour, startMin] = allocation.StartTime.split(':').map(Number);
          const [endHour, endMin] = allocation.EndTime.split(':').map(Number);
          
          const start = new Date(date);
          start.setHours(startHour, startMin, 0);
          
          const end = new Date(date);
          end.setHours(endHour, endMin, 0);

          const allocationDatePart = typeof allocation.AllocationDate === 'string'
            ? allocation.AllocationDate.split('T')[0]
            : new Date(allocation.AllocationDate).toISOString().split('T')[0];
          const allocationIdPart = String(allocation.Id ?? `${allocation.TaskId}-${allocationDatePart}`);
          
          calendarEvents.push({
            id: `allocation-${allocationIdPart}-${allocationDatePart}-${allocation.StartTime}-${allocation.EndTime}-${allocationIndex}`,
            title: `📋 ${allocation.TaskName} (${allocation.AllocatedHours}h)`,
            start,
            end,
            resource: {
              type: 'task',
              projectId: allocation.ProjectId,
              taskId: allocation.TaskId,
            },
          });
        }
      });

      // Add recurring allocations with their specific start and end times
      dayRecurring.forEach(recurring => {
        if (recurring.StartTime && recurring.EndTime) {
          const [startHour, startMin] = recurring.StartTime.split(':').map(Number);
          const [endHour, endMin] = recurring.EndTime.split(':').map(Number);
          
          const start = new Date(date);
          start.setHours(startHour, startMin, 0);
          
          const end = new Date(date);
          end.setHours(endHour, endMin, 0);
          
          calendarEvents.push({
            id: `recurring-${recurring.Id}`,
            title: `🔄 ${recurring.Title} (${recurring.AllocatedHours}h)`,
            start,
            end,
            resource: {
              type: 'recurring',
              recurringAllocationId: recurring.RecurringAllocationId,
            },
          });
        }
      });
      
      // Track time for time entries (position them after any existing allocations end or at work start)
      const startTime = workStartTimes[dayName] || '09:00';
      const [workStartHour, workStartMinute] = startTime.split(':').map(Number);
      
      // Find latest end time from allocations
      let currentHour = workStartHour;
      let currentMinute = workStartMinute;
      
      dayAllocations.forEach(allocation => {
        if (allocation.EndTime) {
          const [endHour, endMin] = allocation.EndTime.split(':').map(Number);
          const endMinutes = endHour * 60 + endMin;
          const currentMinutes = currentHour * 60 + currentMinute;
          if (endMinutes > currentMinutes) {
            currentHour = endHour;
            currentMinute = endMin;
          }
        }
      });
      
      // Add time entries (use StartTime/EndTime if available, otherwise sequential)
      dayEntries.forEach(entry => {
        let start: Date;
        let end: Date;
        
        if (entry.StartTime && entry.EndTime) {
          // Use specific start/end times
          const [startHour, startMin] = entry.StartTime.split(':').map(Number);
          const [endHour, endMin] = entry.EndTime.split(':').map(Number);
          
          start = new Date(date);
          start.setHours(startHour, startMin, 0);
          
          end = new Date(date);
          end.setHours(endHour, endMin, 0);
        } else {
          // Position sequentially
          start = new Date(date);
          start.setHours(currentHour, currentMinute, 0);
          
          const durationHours = parseFloat(entry.Hours as any) || 1;
          end = new Date(start);
          end.setMinutes(start.getMinutes() + durationHours * 60);
          
          // Update current time for next event
          currentHour = end.getHours();
          currentMinute = end.getMinutes();
        }
        
        calendarEvents.push({
          id: `entry-${entry.Id}`,
          title: `⏱️ ${parseFloat(entry.Hours as any).toFixed(1)}h - ${entry.TaskName}`,
          start,
          end,
          resource: {
            type: 'timeEntry',
            entryId: entry.Id,
            taskId: entry.TaskId,
            hours: entry.Hours,
            description: entry.Description || '',
            workDate: typeof entry.WorkDate === 'string' ? entry.WorkDate.split('T')[0] : new Date(entry.WorkDate).toISOString().split('T')[0],
          },
        });
      });
    });

    holidays.forEach((holiday) => {
      const datePart = String(holiday.HolidayDate).split('T')[0];
      const [year, month, day] = datePart.split('-').map(Number);

      if (!year || !month || !day) {
        return;
      }

      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day + 1, 0, 0, 0);

      calendarEvents.push({
        id: `holiday-${holiday.Id}`,
        title: `🎉 ${holiday.HolidayName}`,
        start,
        end,
        allDay: true,
        resource: {
          type: 'holiday',
          holidayId: holiday.Id,
          source: holiday.Source,
        },
      });
    });

    vacations.forEach((vacation) => {
      const datePart = String(vacation.VacationDate).split('T')[0];
      const [year, month, day] = datePart.split('-').map(Number);

      if (!year || !month || !day) {
        return;
      }

      const status = String(vacation.Status || '').toLowerCase();
      if (status !== 'approved' && status !== 'pending') {
        return;
      }

      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day + 1, 0, 0, 0);

      const dayPortion = normalizeLeaveDayPortion(vacation.DayPortion);
      const dayPortionLabel = dayPortion === 'half' ? ' (Half Day)' : '';

      calendarEvents.push({
        id: `vacation-${vacation.Id}`,
        title: `🏖️ Vacation${dayPortionLabel}${status === 'pending' ? ' (Pending)' : ''}`,
        start,
        end,
        allDay: true,
        resource: {
          type: 'vacation',
          vacationId: vacation.Id,
          vacationStatus: status,
          description: `${dayPortion === 'half' ? 'Half day' : 'Full day'}${vacation.Notes ? ` - ${vacation.Notes}` : ''}`,
        },
      });
    });

    outOfOfficeEntries.forEach((outOfOffice) => {
      const datePart = String(outOfOffice.OutOfOfficeDate).split('T')[0];
      const [year, month, day] = datePart.split('-').map(Number);

      if (!year || !month || !day) {
        return;
      }

      const status = String(outOfOffice.Status || '').toLowerCase();
      if (status !== 'approved' && status !== 'pending') {
        return;
      }

      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day + 1, 0, 0, 0);

      const dayPortion = normalizeLeaveDayPortion(outOfOffice.DayPortion);
      const dayPortionLabel = dayPortion === 'half' ? ' (Half Day)' : '';

      calendarEvents.push({
        id: `out-of-office-${outOfOffice.Id}`,
        title: `🚫 Out Of Office${dayPortionLabel}${status === 'pending' ? ' (Pending)' : ''}`,
        start,
        end,
        allDay: true,
        resource: {
          type: 'outOfOffice',
          outOfOfficeId: outOfOffice.Id,
          outOfOfficeStatus: status,
          description: `${dayPortion === 'half' ? 'Half day' : 'Full day'}${outOfOffice.Notes ? ` - ${outOfOffice.Notes}` : ''}`,
        },
      });
    });

    outlookEvents.forEach((outlookEvent, index) => {
      const startDate = new Date(outlookEvent.start);
      const endDate = new Date(outlookEvent.end);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return;
      }

      const ownerSuffix = outlookEvent.userName ? ` • ${outlookEvent.userName}` : '';
      calendarEvents.push({
        id: `outlook-${outlookEvent.id || index}`,
        title: `📅 ${outlookEvent.subject}${ownerSuffix}`,
        start: startDate,
        end: endDate,
        allDay: !!outlookEvent.isAllDay,
        resource: {
          type: 'outlook',
          webLink: outlookEvent.webLink || undefined,
          userName: outlookEvent.userName,
          userEmail: outlookEvent.userEmail,
        },
      });
    });

    const seenEventIds = new Map<string, number>();
    return calendarEvents.map((event) => {
      const baseId = String(event.id);
      const count = seenEventIds.get(baseId) || 0;
      seenEventIds.set(baseId, count + 1);

      if (count === 0) {
        return event;
      }

      return {
        ...event,
        id: `${baseId}__${count}`,
      };
    });
  }, [taskAllocations, timeEntries, callRecords, recurringAllocations, holidays, vacations, outOfOfficeEntries, outlookEvents, workStartTimes, lunchTime, lunchDuration]);

  const calendarScrollToTime = useMemo(() => {
    const dayNames: Array<keyof typeof workStartTimes> = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];

    const dayName = dayNames[currentDate.getDay()] || 'monday';
    const startTime = workStartTimes[dayName] || '09:00';
    const [hourRaw, minuteRaw] = String(startTime).split(':');
    const startHour = Number(hourRaw);
    const startMinute = Number(minuteRaw);

    const totalStartMinutes = (Number.isFinite(startHour) ? startHour : 9) * 60 + (Number.isFinite(startMinute) ? startMinute : 0);
    const targetMinutes = Math.max(0, totalStartMinutes - 60);

    const scrollDate = new Date(currentDate);
    scrollDate.setHours(Math.floor(targetMinutes / 60), targetMinutes % 60, 0, 0);
    return scrollDate;
  }, [currentDate, workStartTimes]);

  const openTaskDetails = useCallback(async (projectId: number, taskId: number) => {
    try {
      const [projectResponse, tasksResponse] = await Promise.all([
        projectsApi.getById(projectId, token),
        tasksApi.getByProject(projectId, token),
      ]);

      const project = projectResponse.project;
      const projectTasks = tasksResponse.tasks || [];
      const selectedTask = projectTasks.find((task) => Number(task.Id) === Number(taskId));

      if (!project || !selectedTask) {
        return;
      }

      setDetailsProject(project);
      setDetailsProjectTasks(projectTasks);
      setDetailsTask(selectedTask);
      setShowTaskDetailsModal(true);
    } catch (error) {
      console.error('Failed to open task details modal:', error);
    }
  }, [token]);

  const handleSelectEvent = useCallback(async (event: CalendarEvent) => {
    if (event.resource.type === 'holiday' || event.resource.type === 'vacation' || event.resource.type === 'outOfOffice') {
      return;
    }

    if (event.resource.type === 'outlook') {
      if (event.resource.webLink) {
        window.open(event.resource.webLink, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    if (event.resource.type === 'task' && event.resource.projectId && event.resource.taskId) {
      await openTaskDetails(Number(event.resource.projectId), Number(event.resource.taskId));
    } else if (event.resource.type === 'call' && event.resource.callId) {
      const call = callRecords.find((record) => Number(record.Id) === Number(event.resource.callId));
      if (call) {
        setEditingCallRecord(call);
        setShowEditCallModal(true);
      }
    } else if (event.resource.type === 'timeEntry' && event.resource.entryId) {
      // Open edit modal for time entry
      const entry = timeEntries.find(e => e.Id === event.resource.entryId);
      if (entry) {
        setEditingEntry({
          id: entry.Id,
          taskId: entry.TaskId,
          taskName: entry.TaskName,
          workDate: typeof entry.WorkDate === 'string' ? entry.WorkDate.split('T')[0] : new Date(entry.WorkDate).toISOString().split('T')[0],
          hours: String(parseFloat(entry.Hours as any)),
          startTime: entry.StartTime || format(event.start, 'HH:mm'),
          endTime: entry.EndTime || format(event.end, 'HH:mm'),
          description: entry.Description || '',
        });
        setShowEditEntryModal(true);
      }
    }
  }, [openTaskDetails, timeEntries, callRecords]);

  const handleNavigate = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  // Custom event styling
  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const isTask = event.resource.type === 'task';
    const isCall = event.resource.type === 'call';
    const isLunch = event.resource.type === 'lunch';
    const isRecurring = event.resource.type === 'recurring';
    const isHoliday = event.resource.type === 'holiday';
    const isVacation = event.resource.type === 'vacation';
    const isOutOfOffice = event.resource.type === 'outOfOffice';
    const isOutlook = event.resource.type === 'outlook';
    
    let bgColor = '#10b981'; // green for time entries
    let borderColor = '#059669';
    
    if (isTask) {
      bgColor = '#3b82f6'; // blue for tasks
      borderColor = '#2563eb';
    } else if (isCall) {
      bgColor = '#8b5cf6'; // purple for calls
      borderColor = '#7c3aed';
    } else if (isLunch) {
      bgColor = '#f59e0b'; // amber/orange for lunch
      borderColor = '#d97706';
    } else if (isRecurring) {
      bgColor = '#ec4899'; // pink for recurring tasks
      borderColor = '#db2777';
    } else if (isHoliday) {
      bgColor = '#ef4444'; // red for holidays
      borderColor = '#dc2626';
    } else if (isVacation) {
      bgColor = '#06b6d4'; // cyan for vacations
      borderColor = '#0891b2';
    } else if (isOutOfOffice) {
      bgColor = '#f43f5e'; // rose for out of office
      borderColor = '#e11d48';
    } else if (isOutlook) {
      bgColor = '#0ea5e9'; // sky-blue for outlook events
      borderColor = '#0284c7';
    }
    
    return {
      style: {
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: '4px',
        color: 'white',
        display: 'block',
        fontSize: '12px',
        fontWeight: 500,
        opacity: isLunch ? 0.7 : 1, // slightly transparent for lunch
      },
    };
  }, []);

  function normalizeLeaveDayPortion(value: unknown): LeaveDayPortion {
    return String(value || '').toLowerCase() === 'half' ? 'half' : 'full';
  }

  const goToToday = () => setCurrentDate(new Date());
  const goBack = () => {
    const newDate = new Date(currentDate);
    if (currentView === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setCurrentDate(newDate);
  };
  const goNext = () => {
    const newDate = new Date(currentDate);
    if (currentView === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  // Handle slot selection
  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    setSelectedSlot(slotInfo);
    setSlotAction('choice');

    const slotStartDate = format(slotInfo.start, 'yyyy-MM-dd');
    const slotEndDate = new Date(slotInfo.end);
    if (slotEndDate.getHours() === 0 && slotEndDate.getMinutes() === 0 && slotEndDate.getSeconds() === 0) {
      slotEndDate.setDate(slotEndDate.getDate() - 1);
    }
    if (slotEndDate < slotInfo.start) {
      slotEndDate.setTime(slotInfo.start.getTime());
    }
    const slotEndDateString = format(slotEndDate, 'yyyy-MM-dd');
    setVacationStartDate(slotStartDate);
    setVacationEndDate(slotEndDateString);
    setVacationNotes('');
    setLeaveDayPortion('full');

    setShowSlotModal(true);
  }, []);

  const closeSlotModal = () => {
    setShowSlotModal(false);
    setSelectedSlot(null);
    setSlotAction('choice');
    setVacationNotes('');
    setLeaveDayPortion('full');
  };

  const closeEditEntryModal = () => {
    setShowEditEntryModal(false);
    setEditingEntry(null);
  };

  const closeEditCallModal = () => {
    setShowEditCallModal(false);
    setEditingCallRecord(null);
  };

  const handleCreateTimeEntry = async (entryData: TimeEntryFormValues) => {
    if (!entryData.taskId || !selectedSlot) {
      throw new Error('Task is required');
    }
    
    setIsSaving(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/time-entries`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            taskId: parseInt(entryData.taskId),
            workDate: entryData.workDate || format(selectedSlot.start, 'yyyy-MM-dd'),
            hours: parseFloat(entryData.hours),
            description: entryData.description,
            startTime: entryData.startTime,
            endTime: entryData.endTime,
          }),
        }
      );

      if (response.ok) {
        closeSlotModal();
        onDataChanged();
      } else {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create time entry');
      }
    } catch (err) {
      console.error('Failed to create time entry:', err);
      throw err instanceof Error ? err : new Error('Failed to create time entry');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateTimeEntry = async () => {
    if (!editingEntry) return;
    
    setIsSaving(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/time-entries/${editingEntry.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workDate: editingEntry.workDate,
            hours: parseFloat(editingEntry.hours),
            description: editingEntry.description,
            startTime: editingEntry.startTime,
            endTime: editingEntry.endTime,
          }),
        }
      );

      if (response.ok) {
        closeEditEntryModal();
        onDataChanged();
      }
    } catch (err) {
      console.error('Failed to update time entry:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTimeEntry = async () => {
    if (!editingEntry) return;
    
    setIsSaving(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/time-entries/${editingEntry.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        closeEditEntryModal();
        onDataChanged();
      }
    } catch (err) {
      console.error('Failed to delete time entry:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCallRecord = async (callData: CallRecordFormValues) => {
    if (!selectedSlot) return;
    
    setIsSaving(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/call-records`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            callDate: callData.callDate,
            startTime: callData.startTime,
            durationMinutes: callData.durationMinutes,
            callType: callData.callType,
            participants: callData.participants,
            subject: callData.subject,
            notes: callData.notes,
            organizationId: callData.organizationId || null,
            projectId: callData.projectId || null,
            taskId: callData.taskId || null,
          }),
        }
      );

      if (response.ok) {
        closeSlotModal();
        onDataChanged();
      } else {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || 'Failed to create call record');
      }
    } catch (err) {
      console.error('Failed to create call record:', err);
      throw err instanceof Error ? err : new Error('Failed to create call record');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCallRecord = async (callData: CallRecordFormValues) => {
    if (!editingCallRecord) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/call-records/${editingCallRecord.Id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            callDate: callData.callDate,
            startTime: callData.startTime,
            durationMinutes: callData.durationMinutes,
            callType: callData.callType,
            participants: callData.participants,
            subject: callData.subject,
            notes: callData.notes,
            organizationId: callData.organizationId || null,
            projectId: callData.projectId || null,
            taskId: callData.taskId || null,
            customFields: callData.customFields || {},
          }),
        }
      );

      if (response.ok) {
        closeEditCallModal();
        onDataChanged();
      } else {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || 'Failed to update call record');
      }
    } catch (err) {
      console.error('Failed to update call record:', err);
      throw err instanceof Error ? err : new Error('Failed to update call record');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateVacationRequest = async () => {
    if (!selectedSlot || !vacationStartDate || !vacationEndDate) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/vacations/my/request`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: vacationStartDate,
            endDate: vacationEndDate,
            notes: vacationNotes,
            dayPortion: leaveDayPortion,
          }),
        }
      );

      if (response.ok) {
        closeSlotModal();
        onDataChanged();
      }
    } catch (err) {
      console.error('Failed to create vacation request:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateOutOfOfficeRequest = async () => {
    if (!selectedSlot || !vacationStartDate || !vacationEndDate) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/out-of-office/my/request`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: vacationStartDate,
            endDate: vacationEndDate,
            notes: vacationNotes,
            dayPortion: leaveDayPortion,
          }),
        }
      );

      if (response.ok) {
        closeSlotModal();
        onDataChanged();
      }
    } catch (err) {
      console.error('Failed to create out-of-office request:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">📅 Calendar</h2>
          <div className="flex items-center gap-3">
            {/* Navigation */}
            <button
              onClick={goBack}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              ◀
            </button>
            <button
              onClick={goToToday}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Today
            </button>
            <button
              onClick={goNext}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              ▶
            </button>
            
            {/* View Toggle */}
            <div className="flex gap-1 ml-4">
              <button
                onClick={() => setCurrentView('week')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  currentView === 'week'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setCurrentView('month')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  currentView === 'month'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                Month
              </button>
            </div>
          </div>
        </div>

        {/* Date Display */}
        <div className="text-center mb-4">
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            {currentView === 'month'
              ? format(currentDate, 'MMMM yyyy')
              : `Week of ${format(startOfWeek(currentDate), 'MMM d, yyyy')}`
            }
          </span>
        </div>

        {/* React Big Calendar - No toolbar */}
        <style jsx global>{`
          .rbc-toolbar {
            display: none !important;
          }
          .dark .rbc-calendar {
            background-color: #1f2937;
            color: #f3f4f6;
          }
          .dark .rbc-header {
            background-color: #374151;
            color: #f3f4f6;
            border-color: #4b5563;
          }
          .dark .rbc-time-header-content,
          .dark .rbc-time-content,
          .dark .rbc-time-view,
          .dark .rbc-month-view {
            border-color: #4b5563;
          }
          .dark .rbc-day-bg,
          .dark .rbc-month-row {
            background-color: #1f2937;
          }
          .dark .rbc-off-range-bg {
            background-color: #111827;
          }
          .dark .rbc-today {
            background-color: rgba(59, 130, 246, 0.25) !important;
          }
          .dark .rbc-header.rbc-today {
            background-color: #3b82f6 !important;
            color: white !important;
          }
          .rbc-today {
            background-color: rgba(59, 130, 246, 0.15);
          }
          .rbc-header.rbc-today {
            background-color: #3b82f6;
            color: white;
          }
          .dark .rbc-time-slot {
            border-color: #374151;
          }
          .dark .rbc-timeslot-group {
            border-color: #374151;
          }
          .dark .rbc-time-gutter .rbc-timeslot-group {
            border-color: #374151;
          }
          .dark .rbc-label {
            color: #9ca3af;
          }
          .dark .rbc-current-time-indicator {
            background-color: #ef4444;
          }
          .dark .rbc-date-cell {
            color: #f3f4f6;
          }
          .dark .rbc-date-cell.rbc-off-range {
            color: #6b7280;
          }
          .dark .rbc-event {
            border: none;
          }
          .dark .rbc-day-slot .rbc-time-slot {
            border-color: #374151;
          }
          .rbc-event-content {
            font-size: 11px;
          }
        `}</style>
        
        <div style={{ height: '650px' }} className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <Calendar
            localizer={localizer}
            events={events.filter((e) => !hiddenTypes.has(e.resource.type))}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            view={currentView}
            onView={() => {}}
            date={currentDate}
            onNavigate={handleNavigate}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            views={[Views.WEEK, Views.MONTH]}
            min={new Date(2024, 0, 1, 0, 0, 0)}
            max={new Date(2024, 0, 1, 23, 59, 59)}
            scrollToTime={calendarScrollToTime}
            popup
            selectable
            toolbar={false}
            onSelectSlot={handleSelectSlot}
            dayLayoutAlgorithm={noOverlap ? 'no-overlap' : 'overlap'}
          />
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2 items-center text-sm">
          {([
            { type: 'task' as const,      color: 'bg-blue-500',   label: 'Tasks' },
            { type: 'timeEntry' as const, color: 'bg-green-500',  label: 'Time Entries' },
            { type: 'call' as const,      color: 'bg-purple-500', label: 'Calls' },
            { type: 'lunch' as const,     color: 'bg-amber-400',  label: 'Lunch Break' },
            { type: 'holiday' as const,   color: 'bg-red-500',    label: 'Holidays' },
            { type: 'vacation' as const,  color: 'bg-cyan-500',   label: 'Vacations' },
            { type: 'outOfOffice' as const, color: 'bg-rose-500', label: 'Out Of Office' },
          ] as { type: CalendarEventType; color: string; label: string }[]).map(({ type, color, label }) => {
            const hidden = hiddenTypes.has(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleHiddenType(type)}
                className={`flex items-center gap-2 px-2 py-1 rounded transition-opacity select-none ${
                  hidden ? 'opacity-40' : 'opacity-100'
                } hover:opacity-80`}
                title={hidden ? `Show ${label}` : `Hide ${label}`}
              >
                <div className={`w-4 h-4 rounded ${color} ${hidden ? 'opacity-40' : ''}`}></div>
                <span className={`text-gray-700 dark:text-gray-300 ${hidden ? 'line-through' : ''}`}>{label}</span>
              </button>
            );
          })}

          {/* Overlap toggle */}
          <label className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:opacity-80 select-none border-l border-gray-200 dark:border-gray-600 ml-1 pl-3" title={noOverlap ? 'Disable separate columns' : 'Show overlapping events in separate columns'}>
            <input
              type="checkbox"
              checked={noOverlap}
              onChange={toggleNoOverlap}
              className="w-4 h-4 accent-blue-500 cursor-pointer"
            />
            <span className="text-gray-700 dark:text-gray-300">Separate overlapping events</span>
          </label>
        </div>
      </div>

      {/* Slot Selection Modal */}
      {showSlotModal && selectedSlot && slotAction !== 'call' && slotAction !== 'timeEntry' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {slotAction === 'choice' && '📅 Add Entry'}
                  {slotAction === 'vacation' && '🏖️ Add Vacation'}
                  {slotAction === 'outOfOffice' && '🚫 Add Out Of Office'}
                </h3>
                <button
                  onClick={closeSlotModal}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              {/* Date/Time Info */}
              <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  📆 {format(selectedSlot.start, 'EEEE, MMMM d, yyyy')}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  🕐 {format(selectedSlot.start, 'HH:mm')} - {format(selectedSlot.end, 'HH:mm')}
                </p>
              </div>

              {/* Choice View */}
              {slotAction === 'choice' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    What would you like to add?
                  </p>
                  <button
                    onClick={() => setSlotAction('timeEntry')}
                    className="w-full flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-2xl">⏱️</span>
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white">Time Entry</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Log hours worked on a task</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setSlotAction('call')}
                    className="w-full flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-2xl">📞</span>
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white">Call Record</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Record a meeting or call</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setSlotAction('vacation')}
                    className="w-full flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-2xl">🏖️</span>
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white">Vacation</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Request vacation for selected range</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setSlotAction('outOfOffice')}
                    className="w-full flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-2xl">🚫</span>
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white">Out Of Office</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Request out of office for selected range</p>
                    </div>
                  </button>
                </div>
              )}

              {slotAction === 'vacation' && (
                <div className="space-y-4">
                  <button
                    onClick={() => setSlotAction('choice')}
                    className="text-sm text-blue-600 hover:text-blue-700 mb-2"
                  >
                    ← Back to options
                  </button>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Start Date *
                      </label>
                      <input
                        type="date"
                        value={vacationStartDate}
                        onChange={(e) => setVacationStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        End Date *
                      </label>
                      <input
                        type="date"
                        value={vacationEndDate}
                        onChange={(e) => setVacationEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Day Portion
                    </label>
                    <select
                      value={leaveDayPortion}
                      onChange={(e) => setLeaveDayPortion(e.target.value as LeaveDayPortion)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="full">Full Day (default)</option>
                      <option value="half">Half Day</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={vacationNotes}
                      onChange={(e) => setVacationNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional notes"
                    />
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Non-working days in the selected range are skipped automatically.
                  </p>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={closeSlotModal}
                      className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateVacationRequest}
                      disabled={isSaving || !vacationStartDate || !vacationEndDate}
                      className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-lg transition-colors"
                    >
                      {isSaving ? 'Saving...' : 'Request Vacation'}
                    </button>
                  </div>
                </div>
              )}

              {slotAction === 'outOfOffice' && (
                <div className="space-y-4">
                  <button
                    onClick={() => setSlotAction('choice')}
                    className="text-sm text-blue-600 hover:text-blue-700 mb-2"
                  >
                    ← Back to options
                  </button>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Start Date *
                      </label>
                      <input
                        type="date"
                        value={vacationStartDate}
                        onChange={(e) => setVacationStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        End Date *
                      </label>
                      <input
                        type="date"
                        value={vacationEndDate}
                        onChange={(e) => setVacationEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Day Portion
                    </label>
                    <select
                      value={leaveDayPortion}
                      onChange={(e) => setLeaveDayPortion(e.target.value as LeaveDayPortion)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="full">Full Day (default)</option>
                      <option value="half">Half Day</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={vacationNotes}
                      onChange={(e) => setVacationNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional notes"
                    />
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Non-working days in the selected range are skipped automatically.
                  </p>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={closeSlotModal}
                      className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateOutOfOfficeRequest}
                      disabled={isSaving || !vacationStartDate || !vacationEndDate}
                      className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white rounded-lg transition-colors"
                    >
                      {isSaving ? 'Saving...' : 'Request Out Of Office'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <TimeEntryFormModal
        isOpen={showSlotModal && !!selectedSlot && slotAction === 'timeEntry'}
        title="⏱️ Add Time Entry"
        submitLabel="Add Entry"
        isSubmitting={isSaving}
        initialData={selectedSlot ? {
          workDate: format(selectedSlot.start, 'yyyy-MM-dd'),
          startTime: format(selectedSlot.start, 'HH:mm'),
          endTime: format(selectedSlot.end, 'HH:mm'),
          hours: ((selectedSlot.end.getTime() - selectedSlot.start.getTime()) / (1000 * 60 * 60)).toFixed(2),
          description: '',
          taskId: '',
        } : undefined}
        dateInfo={selectedSlot ? {
          dateLabel: format(selectedSlot.start, 'EEEE, MMMM d, yyyy'),
          timeLabel: `${format(selectedSlot.start, 'HH:mm')} - ${format(selectedSlot.end, 'HH:mm')}`,
        } : undefined}
        showDateField={false}
        onBack={() => setSlotAction('choice')}
        onClose={closeSlotModal}
        onSubmit={handleCreateTimeEntry}
        taskOptions={tasks.map((task) => ({
          value: task.Id,
          label: task.ProjectName ? `${task.ProjectName} - ${task.TaskName}` : task.TaskName,
        }))}
      />

      <CallRecordFormModal
        isOpen={showSlotModal && !!selectedSlot && slotAction === 'call'}
        token={token}
        title="📞 Add Call Record"
        submitLabel="Add Call"
        isSubmitting={isSaving}
        initialData={selectedSlot ? {
          callDate: format(selectedSlot.start, 'yyyy-MM-dd'),
          startTime: format(selectedSlot.start, 'HH:mm'),
          durationMinutes: Math.max(1, Math.round((selectedSlot.end.getTime() - selectedSlot.start.getTime()) / 60000)),
          callType: 'Teams',
          participants: '',
          subject: '',
          notes: '',
          organizationId: '',
          projectId: '',
          taskId: '',
        } : undefined}
        dateInfo={selectedSlot ? {
          dateLabel: format(selectedSlot.start, 'EEEE, MMMM d, yyyy'),
          timeLabel: `${format(selectedSlot.start, 'HH:mm')} - ${format(selectedSlot.end, 'HH:mm')}`,
        } : undefined}
        showDateField={false}
        onBack={() => setSlotAction('choice')}
        onClose={closeSlotModal}
        onSubmit={handleCreateCallRecord}
      />

      <CallRecordFormModal
        isOpen={showEditCallModal && !!editingCallRecord}
        token={token}
        title="📞 Edit Call Record"
        submitLabel="Save"
        isSubmitting={isSaving}
        initialData={editingCallRecord ? {
          callDate: editingCallRecord.CallDate ? String(editingCallRecord.CallDate).split('T')[0] : format(new Date(), 'yyyy-MM-dd'),
          startTime: editingCallRecord.StartTime ? String(editingCallRecord.StartTime).slice(0, 5) : '09:00',
          durationMinutes: Number(editingCallRecord.DurationMinutes || 30),
          callType: editingCallRecord.CallType || 'Teams',
          participants: editingCallRecord.Participants || '',
          subject: editingCallRecord.Subject || '',
          notes: editingCallRecord.Notes || '',
          organizationId: editingCallRecord.OrganizationId ? String(editingCallRecord.OrganizationId) : '',
          projectId: editingCallRecord.ProjectId ? String(editingCallRecord.ProjectId) : '',
          taskId: editingCallRecord.TaskId ? String(editingCallRecord.TaskId) : '',
          customFields: {},
        } : undefined}
        showDateField={true}
        onClose={closeEditCallModal}
        onSubmit={handleUpdateCallRecord}
      />

      {/* Edit Time Entry Modal */}
      {showEditEntryModal && editingEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  ⏱️ Edit Time Entry
                </h3>
                <button
                  onClick={closeEditEntryModal}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              {/* Task Info */}
              <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  📋 {editingEntry.taskName}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  📆 {new Date(editingEntry.workDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Hours *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={editingEntry.hours}
                    onChange={(e) => {
                      const hours = parseFloat(e.target.value) || 0.5;
                      const newEndTime = calculateEndTime(editingEntry.startTime, hours);
                      setEditingEntry({...editingEntry, hours: e.target.value, endTime: newEndTime});
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Start Time *
                    </label>
                    <input
                      type="time"
                      value={editingEntry.startTime}
                      onChange={(e) => {
                        const hours = calculateHoursDifference(e.target.value, editingEntry.endTime);
                        setEditingEntry({...editingEntry, startTime: e.target.value, hours: hours.toFixed(2)});
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      End Time *
                    </label>
                    <input
                      type="time"
                      value={editingEntry.endTime}
                      onChange={(e) => {
                        const hours = calculateHoursDifference(editingEntry.startTime, e.target.value);
                        setEditingEntry({...editingEntry, endTime: e.target.value, hours: hours.toFixed(2)});
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <RichTextEditor
                    content={editingEntry.description}
                    onChange={(html) => setEditingEntry({ ...editingEntry, description: html })}
                    placeholder="What did you work on?"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleDeleteTimeEntry}
                    disabled={isSaving}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg transition-colors"
                  >
                    🗑️ Delete
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={closeEditEntryModal}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateTimeEntry}
                    disabled={isSaving}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTaskDetailsModal && detailsTask && detailsProject && (
        <TaskDetailModal
          projectId={detailsProject.Id}
          organizationId={detailsProject.OrganizationId}
          task={detailsTask}
          project={detailsProject}
          tasks={detailsProjectTasks}
          onOpenTask={(targetTask) => {
            if (Number(targetTask.ProjectId) !== Number(detailsProject.Id)) {
              openTaskDetails(Number(targetTask.ProjectId), Number(targetTask.Id));
              return;
            }

            const fullTask = detailsProjectTasks.find((task) => Number(task.Id) === Number(targetTask.Id)) || targetTask;
            setDetailsTask(fullTask as ApiTask);
            setShowTaskDetailsModal(true);
          }}
          onClose={() => {
            setShowTaskDetailsModal(false);
            setDetailsTask(null);
          }}
          onSaved={async () => {
            onDataChanged();
            if (detailsProject?.Id && detailsTask?.Id) {
              await openTaskDetails(Number(detailsProject.Id), Number(detailsTask.Id));
            }
          }}
          token={token}
        />
      )}
    </div>
  );
}
