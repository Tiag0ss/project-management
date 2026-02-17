'use client';

import { getApiUrl } from '@/lib/api/config';
import { RecurringAllocationOccurrence } from '@/lib/api/recurringAllocations';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import SearchableSelect from '@/components/SearchableSelect';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface Organization {
  Id: number;
  Name: string;
}

interface Project {
  Id: number;
  ProjectName: string;
  OrganizationId: number;
}

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

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    type: 'task' | 'timeEntry' | 'call' | 'lunch' | 'recurring';
    projectId?: number;
    taskId?: number;
    entryId?: number;
    hours?: number | string;
    callType?: string;
    description?: string;
    workDate?: string;
    recurringAllocationId?: number;
  };
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
  const router = useRouter();
  const [currentView, setCurrentView] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Slot selection modal state
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotInfo | null>(null);
  const [slotAction, setSlotAction] = useState<'choice' | 'timeEntry' | 'call'>('choice');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [entryHours, setEntryHours] = useState<string>('1');
  const [entryDescription, setEntryDescription] = useState('');
  const [entryStartTime, setEntryStartTime] = useState<string>('09:00');
  const [entryEndTime, setEntryEndTime] = useState<string>('10:00');
  const [callData, setCallData] = useState({
    startTime: '09:00',
    endTime: '09:30',
    durationMinutes: 30,
    callType: 'Teams',
    participants: '',
    subject: '',
    notes: '',
    organizationId: '',
    projectId: '',
    taskId: '',
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Load organizations on mount
  useEffect(() => {
    const loadOrganizations = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/organizations`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setOrganizations(data.organizations || []);
        }
      } catch (err) {
        console.error('Error loading organizations:', err);
      }
    };
    loadOrganizations();
  }, [token]);

  // Load projects for selected organization
  const loadProjectsForOrg = async (orgId: string) => {
    if (!orgId) {
      setProjects([]);
      setAvailableTasks([]);
      return;
    }
    try {
      const response = await fetch(
        `${getApiUrl()}/api/projects?organizationId=${orgId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  };

  // Load tasks for selected project
  const loadTasksForProject = async (projectId: string) => {
    if (!projectId) {
      setAvailableTasks([]);
      return;
    }
    try {
      const response = await fetch(
        `${getApiUrl()}/api/tasks/project/${projectId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setAvailableTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Error loading tasks:', err);
    }
  };

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

  // Convert tasks and time entries to calendar events (non-overlapping)
  const events = useMemo(() => {
    const calendarEvents: CalendarEvent[] = [];
    
    // Parse lunch time
    const [lunchHour, lunchMin] = lunchTime.split(':').map(Number);
    
    // Group task allocations by date (these have specific start/end times)
    const allocationsByDate: { [date: string]: TaskAllocation[] } = {};
    taskAllocations.forEach(allocation => {
      if (allocation.AllocationDate) {
        const dateKey = new Date(allocation.AllocationDate).toDateString();
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
        const dateKey = new Date(entry.WorkDate).toDateString();
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
        const dateKey = new Date(call.CallDate).toDateString();
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
        // Use T12:00:00 to avoid timezone issues
        const dateStr = typeof recurring.OccurrenceDate === 'string' 
          ? recurring.OccurrenceDate.split('T')[0]
          : new Date(recurring.OccurrenceDate).toISOString().split('T')[0];
        const dateKey = new Date(dateStr + 'T12:00:00').toDateString();
        if (!recurringByDate[dateKey]) {
          recurringByDate[dateKey] = [];
        }
        recurringByDate[dateKey].push(recurring);
      }
    });

    // Get all dates that need to be processed (including current week for lunch)
    const today = new Date();
    const startOfCurrentWeek = new Date(today);
    startOfCurrentWeek.setDate(today.getDate() - today.getDay());
    
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
            callType: call.CallType,
          },
        });
      });
      
      // Add task allocations with their specific start and end times
      dayAllocations.forEach(allocation => {
        if (allocation.StartTime && allocation.EndTime) {
          const [startHour, startMin] = allocation.StartTime.split(':').map(Number);
          const [endHour, endMin] = allocation.EndTime.split(':').map(Number);
          
          const start = new Date(date);
          start.setHours(startHour, startMin, 0);
          
          const end = new Date(date);
          end.setHours(endHour, endMin, 0);
          
          calendarEvents.push({
            id: `allocation-${allocation.Id}`,
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

    return calendarEvents;
  }, [taskAllocations, timeEntries, callRecords, recurringAllocations, workStartTimes, lunchTime, lunchDuration]);

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    if (event.resource.type === 'task' && event.resource.projectId) {
      router.push(`/projects/${event.resource.projectId}`);
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
  }, [router, timeEntries]);

  const handleNavigate = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  // Custom event styling
  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const isTask = event.resource.type === 'task';
    const isCall = event.resource.type === 'call';
    const isLunch = event.resource.type === 'lunch';
    const isRecurring = event.resource.type === 'recurring';
    
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
    }
    
    return {
      style: {
        backgroundColor: bgColor,
        borderColor: borderColor,
        borderRadius: '4px',
        color: 'white',
        border: 'none',
        display: 'block',
        fontSize: '12px',
        fontWeight: 500,
        opacity: isLunch ? 0.7 : 1, // slightly transparent for lunch
      },
    };
  }, []);

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
    setSelectedTaskId('');
    
    // Use actual slot times for both time entry and call record
    const startTimeStr = format(slotInfo.start, 'HH:mm');
    const endTimeStr = format(slotInfo.end, 'HH:mm');
    
    // Calculate hours from slot duration
    const slotDurationMs = slotInfo.end.getTime() - slotInfo.start.getTime();
    const slotHours = slotDurationMs / (1000 * 60 * 60);
    const slotMinutes = Math.round(slotDurationMs / (1000 * 60));
    
    // Set time entry with slot times
    setEntryStartTime(startTimeStr);
    setEntryEndTime(endTimeStr);
    setEntryHours(slotHours.toString());
    setEntryDescription('');
    
    // Set call data with slot times
    setCallData({
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationMinutes: slotMinutes,
      callType: 'Teams',
      participants: '',
      subject: '',
      notes: '',
      organizationId: '',
      projectId: '',
      taskId: '',
    });
    
    setShowSlotModal(true);
  }, []);

  const closeSlotModal = () => {
    setShowSlotModal(false);
    setSelectedSlot(null);
    setSlotAction('choice');
  };

  const closeEditEntryModal = () => {
    setShowEditEntryModal(false);
    setEditingEntry(null);
  };

  const handleCreateTimeEntry = async () => {
    if (!selectedTaskId || !selectedSlot) return;
    
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
            taskId: parseInt(selectedTaskId),
            workDate: format(selectedSlot.start, 'yyyy-MM-dd'),
            hours: parseFloat(entryHours),
            description: entryDescription,
            startTime: entryStartTime,
            endTime: entryEndTime,
          }),
        }
      );

      if (response.ok) {
        closeSlotModal();
        onDataChanged();
      }
    } catch (err) {
      console.error('Failed to create time entry:', err);
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

  const handleCreateCallRecord = async () => {
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
            callDate: format(selectedSlot.start, 'yyyy-MM-dd'),
            startTime: callData.startTime,
            durationMinutes: callData.durationMinutes,
            callType: callData.callType,
            participants: callData.participants,
            subject: callData.subject,
            notes: callData.notes,
            projectId: callData.projectId || null,
            taskId: callData.taskId || null,
          }),
        }
      );

      if (response.ok) {
        closeSlotModal();
        onDataChanged();
      }
    } catch (err) {
      console.error('Failed to create call record:', err);
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
            events={events}
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
            popup
            selectable
            toolbar={false}
            onSelectSlot={handleSelectSlot}
          />
        </div>

        {/* Legend */}
        <div className="mt-4 flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span className="text-gray-700 dark:text-gray-300">Tasks</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-gray-700 dark:text-gray-300">Time Entries</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-purple-500 rounded"></div>
            <span className="text-gray-700 dark:text-gray-300">Calls</span>
          </div>
        </div>
      </div>

      {/* Slot Selection Modal */}
      {showSlotModal && selectedSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {slotAction === 'choice' && '📅 Add Entry'}
                  {slotAction === 'timeEntry' && '⏱️ Add Time Entry'}
                  {slotAction === 'call' && '📞 Add Call Record'}
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
                </div>
              )}

              {/* Time Entry Form */}
              {slotAction === 'timeEntry' && (
                <div className="space-y-4">
                  <button
                    onClick={() => setSlotAction('choice')}
                    className="text-sm text-blue-600 hover:text-blue-700 mb-2"
                  >
                    ← Back to options
                  </button>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Task *
                    </label>
                    <SearchableSelect
                      value={selectedTaskId}
                      onChange={(value) => setSelectedTaskId(value)}
                      options={tasks.map(task => ({
                        value: task.Id,
                        label: task.ProjectName ? `${task.ProjectName} - ${task.TaskName}` : task.TaskName
                      }))}
                      placeholder="Select a task..."
                      emptyText="Select a task..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Hours *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={entryHours}
                      onChange={(e) => {
                        const hours = parseFloat(e.target.value) || 0.5;
                        setEntryHours(e.target.value);
                        // Recalculate end time based on start time + hours
                        const newEndTime = calculateEndTime(entryStartTime, hours);
                        setEntryEndTime(newEndTime);
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
                        value={entryStartTime}
                        onChange={(e) => {
                          setEntryStartTime(e.target.value);
                          // Recalculate hours based on new start time and current end time
                          const hours = calculateHoursDifference(e.target.value, entryEndTime);
                          setEntryHours(hours.toFixed(2));
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
                        value={entryEndTime}
                        onChange={(e) => {
                          setEntryEndTime(e.target.value);
                          // Recalculate hours based on start time and new end time
                          const hours = calculateHoursDifference(entryStartTime, e.target.value);
                          setEntryHours(hours.toFixed(2));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description
                    </label>
                    <textarea
                      value={entryDescription}
                      onChange={(e) => setEntryDescription(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="What did you work on?"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={closeSlotModal}
                      className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateTimeEntry}
                      disabled={!selectedTaskId || isSaving}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
                    >
                      {isSaving ? 'Saving...' : 'Add Entry'}
                    </button>
                  </div>
                </div>
              )}

              {/* Call Record Form */}
              {slotAction === 'call' && (
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
                        Start Time *
                      </label>
                      <input
                        type="time"
                        value={callData.startTime}
                        onChange={(e) => {
                          const newStartTime = e.target.value;
                          // Recalculate duration based on new start time and current end time
                          const hours = calculateHoursDifference(newStartTime, callData.endTime);
                          const durationMin = Math.round(hours * 60);
                          setCallData({...callData, startTime: newStartTime, durationMinutes: durationMin > 0 ? durationMin : 30});
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
                        value={callData.endTime}
                        onChange={(e) => {
                          const newEndTime = e.target.value;
                          // Recalculate duration based on start time and new end time
                          const hours = calculateHoursDifference(callData.startTime, newEndTime);
                          const durationMin = Math.round(hours * 60);
                          setCallData({...callData, endTime: newEndTime, durationMinutes: durationMin > 0 ? durationMin : 30});
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Duration (min)
                      </label>
                      <input
                        type="number"
                        value={callData.durationMinutes}
                        onChange={(e) => {
                          const duration = parseInt(e.target.value) || 30;
                          // Recalculate end time based on start time + duration
                          const newEndTime = calculateEndTime(callData.startTime, duration / 60);
                          setCallData({...callData, durationMinutes: duration, endTime: newEndTime});
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Type
                      </label>
                      <select
                        value={callData.callType}
                        onChange={(e) => setCallData({...callData, callType: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Teams">Teams</option>
                        <option value="Phone">Phone</option>
                        <option value="Zoom">Zoom</option>
                        <option value="Meet">Google Meet</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={callData.subject}
                      onChange={(e) => setCallData({...callData, subject: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="Meeting topic"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Organization
                    </label>
                    <SearchableSelect
                      options={organizations.map(org => ({ value: String(org.Id), label: org.Name }))}
                      value={callData.organizationId}
                      onChange={(value) => {
                        setCallData({...callData, organizationId: value, projectId: '', taskId: ''});
                        setProjects([]);
                        setAvailableTasks([]);
                        if (value) loadProjectsForOrg(value);
                      }}
                      placeholder="Select organization (optional)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Project
                    </label>
                    <SearchableSelect
                      options={projects.map(proj => ({ value: String(proj.Id), label: proj.ProjectName }))}
                      value={callData.projectId}
                      onChange={(value) => {
                        setCallData({...callData, projectId: value, taskId: ''});
                        setAvailableTasks([]);
                        if (value) loadTasksForProject(value);
                      }}
                      placeholder="Select project (optional)"
                      disabled={!callData.organizationId}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Task
                    </label>
                    <SearchableSelect
                      options={availableTasks.map(task => ({ value: String(task.Id), label: task.ProjectName ? `${task.ProjectName} - ${task.TaskName}` : task.TaskName }))}
                      value={callData.taskId}
                      onChange={(value) => setCallData({...callData, taskId: value})}
                      placeholder="Select task (optional)"
                      disabled={!callData.projectId}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Participants
                    </label>
                    <input
                      type="text"
                      value={callData.participants}
                      onChange={(e) => setCallData({...callData, participants: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="John, Mary, Bob"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={callData.notes}
                      onChange={(e) => setCallData({...callData, notes: e.target.value})}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="Meeting notes..."
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={closeSlotModal}
                      className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateCallRecord}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg transition-colors"
                    >
                      {isSaving ? 'Saving...' : 'Add Call'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Time Entry Modal */}
      {showEditEntryModal && editingEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
                  <textarea
                    value={editingEntry.description}
                    onChange={(e) => setEditingEntry({...editingEntry, description: e.target.value})}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
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
    </div>
  );
}
