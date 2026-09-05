/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { usersApi, User } from '@/lib/api/users';
import { tasksApi, Task } from '@/lib/api/tasks';
import { downloadTablePdf } from '@/lib/api/pdfExport';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import SearchableSelect from '@/components/SearchableSelect';
import RichTextEditor from '@/components/RichTextEditor';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import ApprovalStatusBadge from '@/components/ApprovalStatusBadge';
import TimeEntryFormModal, { TimeEntryFormValues } from '@/components/TimeEntryFormModal';
import CustomFieldsFormSection from '@/components/custom-fields/CustomFieldsFormSection';
import { CustomFieldValues, extractCustomFieldValues } from '@/lib/customFields';
import { useFormatHours } from '@/lib/useFormatHours';

interface TaskWithProject extends Task {
  ProjectName?: string;
  IsHobby?: boolean;
  SubtaskCount?: number;
}

interface TimeEntry {
  Id: number;
  TaskId: number;
  UserId: number;
  WorkDate: string;
  Hours: number;
  Description: string;
  TaskName: string;
  ProjectName: string;
  CustomerName?: string;
  IsHobby?: boolean;
  CreatedAt: string;
  StartTime?: string;
  EndTime?: string;
  ApprovalStatus?: string;
  ApprovedBy?: number;
  ApprovedAt?: string;
  [key: string]: unknown;
}

interface TaskAllocationForCalendar {
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

type ResumePeriod = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'allTime';

interface ResumeByUserRow {
  UserId: number;
  Username: string;
  FirstName?: string;
  LastName?: string;
  EntryCount: number;
  TotalHours: number;
  TaskCount: number;
  ProjectCount: number;
  CustomerCount: number;
  TaskNames?: string;
  ProjectNames?: string;
  CustomerNames?: string;
  ApprovedCount: number;
  PendingCount: number;
  RejectedCount: number;
}

export default function TimesheetPage() {
  const decimalHoursToHMS = useFormatHours();
  const { user, isLoading, token } = useAuth();
  const { permissions } = usePermissions();
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [workHours, setWorkHours] = useState({
    monday: 8,
    tuesday: 8,
    wednesday: 8,
    thursday: 8,
    friday: 8,
    saturday: 0,
    sunday: 0,
  });
  const [hobbyHours, setHobbyHours] = useState({
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 4,
    sunday: 4,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [myTasks, setMyTasks] = useState<TaskWithProject[]>([]);
  const [taskAllocations, setTaskAllocations] = useState<TaskAllocationForCalendar[]>([]);
  const [newEntry, setNewEntry] = useState({
    taskId: '',
    workDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    hours: '',
    description: ''
  });
  const [editingEntry, setEditingEntry] = useState<number | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateTimeEntryModal, setShowCreateTimeEntryModal] = useState(false);
  const [editEntry, setEditEntry] = useState({
    taskId: '',
    workDate: '',
    startTime: '',
    endTime: '',
    hours: '',
    description: ''
  });
  const [editCustomFields, setEditCustomFields] = useState<CustomFieldValues>({});
  const [timesheetView, setTimesheetView] = useState<'daily' | 'weekly' | 'history' | 'resume'>('daily');
  const [resumePeriod, setResumePeriod] = useState<ResumePeriod>('thisWeek');
  const [resumeSummary, setResumeSummary] = useState<ResumeByUserRow[]>([]);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState<{[taskId: number]: {[day: string]: string}}>({});
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  // Track cells with multiple entries (blocked from editing)
  const [blockedCells, setBlockedCells] = useState<{[taskId: number]: {[date: string]: number}}>({}); // value = number of entries
  // Track cells with approved entries (locked from editing/deleting)
  const [approvedCells, setApprovedCells] = useState<{[taskId: number]: {[date: string]: boolean}}>({});
  const [autoApproveTimeEntries, setAutoApproveTimeEntries] = useState(false);
  const [multiEntryCellsWarning, setMultiEntryCellsWarning] = useState('');
  // History tab filters
  const [historyDateFrom, setHistoryDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [historyDateTo, setHistoryDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [historyProjectFilter, setHistoryProjectFilter] = useState('');
  const [historyTaskFilter, setHistoryTaskFilter] = useState('');
  const defaultHistoryDateFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  }, []);
  const defaultHistoryDateTo = useMemo(() => new Date().toISOString().split('T')[0], []);
  const historyFilterActiveCount = [
    historyDateFrom !== defaultHistoryDateFrom ? 1 : 0,
    historyDateTo !== defaultHistoryDateTo ? 1 : 0,
    historyProjectFilter ? 1 : 0,
    historyTaskFilter ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
  const [groupByDays, setGroupByDays] = useState(false);
  const [modalMessage, setModalMessage] = useState<{
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalMessage({ type: 'confirm', title, message, onConfirm });
  };

  const closeModal = () => {
    setModalMessage(null);
  };

  const handleModalConfirm = () => {
    if (modalMessage?.onConfirm) {
      modalMessage.onConfirm();
    }
    closeModal();
  };

  useEffect(() => {
    if (user && token) {
      loadPublicSettings();
      loadUserProfile();
      loadTimeEntries();
      loadMyTasks();
      loadTaskAllocations();
    }
  }, [user, token]);

  useEffect(() => {
    if (user && token && timesheetView === 'resume') {
      loadResumeSummary(resumePeriod);
    }
  }, [user, token, timesheetView, resumePeriod]);

  // Populate weeklyHours from existing timeEntries when switching to weekly view or changing week
  // Also detect cells with multiple entries per day/task
  useEffect(() => {
    if (timesheetView === 'weekly' && timeEntries.length > 0 && myTasks.length > 0) {
      const weekDates = getCurrentWeekDates();
      const newWeeklyHours: {[taskId: number]: {[day: string]: string}} = {};
      const newBlockedCells: {[taskId: number]: {[date: string]: number}} = {};
      const newApprovedCells: {[taskId: number]: {[date: string]: boolean}} = {};
      let hasMultipleEntries = false;
      
      // Populate with existing entries for current week
      myTasks.forEach(task => {
        weekDates.forEach(date => {
          // Find ALL entries for this task and date (not just first one)
          const entries = timeEntries.filter(e => {
            return e.TaskId === task.Id && normalizeDateString(e.WorkDate) === date;
          });
          
          if (entries.length > 1) {
            // Multiple entries - calculate total and block cell
            const totalHours = entries.reduce((sum, e) => sum + parseFloat(e.Hours as any), 0);
            if (!newWeeklyHours[task.Id]) newWeeklyHours[task.Id] = {};
            newWeeklyHours[task.Id][date] = totalHours.toFixed(2);
            if (!newBlockedCells[task.Id]) newBlockedCells[task.Id] = {};
            newBlockedCells[task.Id][date] = entries.length;
            hasMultipleEntries = true;
          } else if (
            entries.length === 1
            && entries[0].ApprovalStatus === 'approved'
            && !entries[0].IsHobby
            && !autoApproveTimeEntries
          ) {
            // Approved non-hobby entry - lock cell, do NOT add to weeklyHours so it won't be saved
            if (!newApprovedCells[task.Id]) newApprovedCells[task.Id] = {};
            newApprovedCells[task.Id][date] = true;
          } else if (entries.length === 1 && parseFloat(entries[0].Hours as any) > 0) {
            // Single entry - allow editing
            if (!newWeeklyHours[task.Id]) newWeeklyHours[task.Id] = {};
            newWeeklyHours[task.Id][date] = parseFloat(entries[0].Hours as any).toString();
          }
        });
      });
      
      setWeeklyHours(newWeeklyHours);
      setBlockedCells(newBlockedCells);
      setApprovedCells(newApprovedCells);
      
      if (hasMultipleEntries) {
        setMultiEntryCellsWarning('⚠️ Some cells have multiple time entries and are read-only. Use the Daily tab to edit individual entries.');
      } else {
        setMultiEntryCellsWarning('');
      }
    }
  }, [timesheetView, currentWeekOffset, timeEntries, myTasks, autoApproveTimeEntries]);

  // Helper function to normalize date for comparison
  const normalizeDateString = (dateValue: any): string => {
    if (dateValue instanceof Date) {
      return dateValue.toISOString().split('T')[0];
    }
    return String(dateValue).split('T')[0];
  };

  const stripHtml = (value?: string): string => {
    if (!value) return '';
    return value
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const toDateString = (date: Date): string => date.toISOString().split('T')[0];

  const getResumePeriodRange = (period: ResumePeriod) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const weekdayIndexMondayBased = (today.getDay() + 6) % 7;
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - weekdayIndexMondayBased);
    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekStart.getDate() + 6);

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(thisWeekStart.getDate() - 1);

    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    if (period === 'allTime') return null;
    if (period === 'thisWeek') return { from: toDateString(thisWeekStart), to: toDateString(thisWeekEnd) };
    if (period === 'lastWeek') return { from: toDateString(lastWeekStart), to: toDateString(lastWeekEnd) };
    if (period === 'thisMonth') return { from: toDateString(thisMonthStart), to: toDateString(thisMonthEnd) };
    return { from: toDateString(lastMonthStart), to: toDateString(lastMonthEnd) };
  };

  const loadResumeSummary = async (period: ResumePeriod) => {
    if (!token) return;
    setResumeLoading(true);
    try {
      const range = getResumePeriodRange(period);
      const params = new URLSearchParams();
      if (period === 'allTime' || !range) {
        params.set('period', 'allTime');
      } else {
        params.set('dateFrom', range.from);
        params.set('dateTo', range.to);
      }

      const response = await fetch(`${getApiUrl()}/api/time-entries/summary-by-user?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load resume summary');
      }

      const data = await response.json();
      const rows = (data.summary || []).map((row: any) => ({
        UserId: Number(row.UserId),
        Username: row.Username,
        FirstName: row.FirstName || undefined,
        LastName: row.LastName || undefined,
        EntryCount: Number(row.EntryCount || 0),
        TotalHours: Number(row.TotalHours || 0),
        TaskCount: Number(row.TaskCount || 0),
        ProjectCount: Number(row.ProjectCount || 0),
        CustomerCount: Number(row.CustomerCount || 0),
        TaskNames: row.TaskNames || undefined,
        ProjectNames: row.ProjectNames || undefined,
        CustomerNames: row.CustomerNames || undefined,
        ApprovedCount: Number(row.ApprovedCount || 0),
        PendingCount: Number(row.PendingCount || 0),
        RejectedCount: Number(row.RejectedCount || 0),
      }));
      setResumeSummary(rows);
    } catch (err) {
      console.error('Failed to load resume summary:', err);
      setResumeSummary([]);
    } finally {
      setResumeLoading(false);
    }
  };

  const selectedResumeRange = useMemo(() => getResumePeriodRange(resumePeriod), [resumePeriod]);

  const resumeTotals = useMemo(() => {
    const totalUsers = resumeSummary.length;
    const totalEntries = resumeSummary.reduce((sum, row) => sum + row.EntryCount, 0);
    const totalHours = resumeSummary.reduce((sum, row) => sum + row.TotalHours, 0);
    const approved = resumeSummary.reduce((sum, row) => sum + row.ApprovedCount, 0);
    const pending = resumeSummary.reduce((sum, row) => sum + row.PendingCount, 0);
    const rejected = resumeSummary.reduce((sum, row) => sum + row.RejectedCount, 0);
    const approvalRate = totalEntries > 0 ? (approved / totalEntries) * 100 : 0;
    const pendingRate = totalEntries > 0 ? (pending / totalEntries) * 100 : 0;
    const rejectedRate = totalEntries > 0 ? (rejected / totalEntries) * 100 : 0;
    const avgHoursPerEntry = totalEntries > 0 ? totalHours / totalEntries : 0;
    const avgHoursPerUser = totalUsers > 0 ? totalHours / totalUsers : 0;

    return {
      totalUsers,
      totalEntries,
      totalHours,
      approved,
      pending,
      rejected,
      approvalRate,
      pendingRate,
      rejectedRate,
      avgHoursPerEntry,
      avgHoursPerUser,
    };
  }, [resumeSummary]);

  const resumeTopUsers = useMemo(() => {
    return [...resumeSummary].sort((a, b) => b.TotalHours - a.TotalHours).slice(0, 5);
  }, [resumeSummary]);

  const resumeAttentionUsers = useMemo(() => {
    return [...resumeSummary]
      .filter(row => row.PendingCount > 0 || row.RejectedCount > 0)
      .sort((a, b) => (b.PendingCount + b.RejectedCount) - (a.PendingCount + a.RejectedCount));
  }, [resumeSummary]);

  const parseResumeList = (value?: string): string[] => {
    if (!value) return [];
    return value.split(' || ').map(v => v.trim()).filter(Boolean);
  };

  const loadUserProfile = async () => {
    try {
      const response = await usersApi.getProfile(token!);
      setUserProfile(response.user);
      setWorkHours({
        monday: response.user.WorkHoursMonday || 8,
        tuesday: response.user.WorkHoursTuesday || 8,
        wednesday: response.user.WorkHoursWednesday || 8,
        thursday: response.user.WorkHoursThursday || 8,
        friday: response.user.WorkHoursFriday || 8,
        saturday: response.user.WorkHoursSaturday || 0,
        sunday: response.user.WorkHoursSunday || 0,
      });
      setHobbyHours({
        monday: response.user.HobbyHoursMonday || 0,
        tuesday: response.user.HobbyHoursTuesday || 0,
        wednesday: response.user.HobbyHoursWednesday || 0,
        thursday: response.user.HobbyHoursThursday || 0,
        friday: response.user.HobbyHoursFriday || 0,
        saturday: response.user.HobbyHoursSaturday || 4,
        sunday: response.user.HobbyHoursSunday || 4,
      });
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  };

  const loadPublicSettings = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        setAutoApproveTimeEntries(false);
        return;
      }

      const data = await response.json();
      setAutoApproveTimeEntries(data.autoApproveTimeEntries === true);
    } catch (err) {
      console.error('Failed to load public system settings:', err);
      setAutoApproveTimeEntries(false);
    }
  };

  const loadTimeEntries = async () => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/time-entries/my-entries`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setTimeEntries(data.entries || []);
      }
    } catch (err) {
      console.error('Failed to load time entries:', err);
    }
  };

  const loadMyTasks = async () => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/tasks/my-tasks`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setMyTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  };

  const loadTaskAllocations = async () => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/task-allocations/my-allocations`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setTaskAllocations(data.allocations || []);
      }
    } catch (err) {
      console.error('Failed to load task allocations:', err);
    }
  };

  // Calculate hours from start/end time
  const calculateHoursFromTimes = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return Math.max(0, (endMinutes - startMinutes) / 60);
  };

  const handleCreateTimeEntry = async (entryValues?: TimeEntryFormValues) => {
    const entry = entryValues || newEntry;

    // Calculate hours from times if not manually set
    let hours = entry.hours ? parseFloat(entry.hours) : 0;
    if (!hours && entry.startTime && entry.endTime) {
      hours = calculateHoursFromTimes(entry.startTime, entry.endTime);
    }

    if (!entry.taskId || !entry.workDate || hours <= 0) {
      const validationMessage = 'Please fill all required fields (hours must be greater than 0)';
      setMessage(validationMessage);
      setTimeout(() => setMessage(''), 3000);
      if (entryValues) {
        throw new Error(validationMessage);
      }
      return;
    }

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
            taskId: parseInt(entry.taskId),
            workDate: entry.workDate,
            startTime: entry.startTime || null,
            endTime: entry.endTime || null,
            hours: hours,
            description: entry.description,
            customFields: entryValues?.customFields || {},
          })
        }
      );

      if (response.ok) {
        setMessage('Time entry created successfully!');
        setNewEntry({
          taskId: '',
          workDate: new Date().toISOString().split('T')[0],
          startTime: '09:00',
          endTime: '17:00',
          hours: '',
          description: ''
        });
        setShowCreateTimeEntryModal(false);
        loadTimeEntries();
        setTimeout(() => setMessage(''), 3000);
      } else {
        const data = await response.json();
        const errorMessage = data.message || 'Failed to create time entry';
        setMessage(errorMessage);
        if (entryValues) {
          throw new Error(errorMessage);
        }
      }
    } catch (err) {
      console.error('Failed to create time entry:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create time entry';
      setMessage(errorMessage);
      if (entryValues) {
        throw err instanceof Error ? err : new Error(errorMessage);
      }
    }
  };

  const handleEditTimeEntry = (entry: TimeEntry) => {
    setEditingEntry(entry.Id);
    setShowEditModal(true);
    setEditEntry({
      taskId: entry.TaskId.toString(),
      workDate: (entry.WorkDate as any) instanceof Date 
        ? (entry.WorkDate as any).toISOString().split('T')[0]
        : String(entry.WorkDate).split('T')[0],
      startTime: entry.StartTime || '',
      endTime: entry.EndTime || '',
      hours: entry.Hours.toString(),
      description: entry.Description || ''
    });
    setEditCustomFields(extractCustomFieldValues(entry));
  };

  const handleEditTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    const nextStartTime = field === 'startTime' ? value : editEntry.startTime;
    const nextEndTime = field === 'endTime' ? value : editEntry.endTime;

    let nextHours = editEntry.hours;
    if (nextStartTime && nextEndTime) {
      const calculatedHours = calculateHoursFromTimes(nextStartTime, nextEndTime);
      nextHours = calculatedHours.toString();
    }

    setEditEntry(prev => ({
      ...prev,
      [field]: value,
      hours: nextHours,
    }));
  };

  const handleUpdateTimeEntry = async () => {
    if (!editingEntry) return;

    let hours = editEntry.hours ? parseFloat(editEntry.hours) : 0;
    if (!hours && editEntry.startTime && editEntry.endTime) {
      hours = calculateHoursFromTimes(editEntry.startTime, editEntry.endTime);
    }

    if (!editEntry.workDate || hours <= 0) {
      setMessage('Please fill all required fields (hours must be greater than 0)');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    try {
      const response = await fetch(
        `${getApiUrl()}/api/time-entries/${editingEntry}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workDate: editEntry.workDate,
            hours: hours,
            description: editEntry.description,
            startTime: editEntry.startTime || null,
            endTime: editEntry.endTime || null,
            customFields: editCustomFields,
          }),
        }
      );

      if (response.ok) {
        setMessage('Time entry updated successfully!');
        setEditingEntry(null);
        setShowEditModal(false);
        setEditEntry({
          taskId: '',
          workDate: '',
          startTime: '',
          endTime: '',
          hours: '',
          description: ''
        });
        setEditCustomFields({});
        loadTimeEntries();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to update time entry');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error updating time entry:', error);
      setMessage('Error updating time entry');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    setShowEditModal(false);
    setEditEntry({
      taskId: '',
      workDate: '',
      startTime: '',
      endTime: '',
      hours: '',
      description: ''
    });
    setEditCustomFields({});
  };

  const handleDeleteTimeEntry = async (entryId: number) => {
    showConfirm(
      'Delete Time Entry',
      'Are you sure you want to delete this time entry?',
      async () => {
        try {
          const response = await fetch(
            `${getApiUrl()}/api/time-entries/${entryId}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            }
          );

          if (response.ok) {
            setMessage('Time entry deleted successfully!');
            loadTimeEntries();
            setTimeout(() => setMessage(''), 3000);
          }
        } catch (err) {
          console.error('Failed to delete time entry:', err);
          setMessage('Failed to delete time entry');
        }
      }
    );
  };

  const getCurrentWeekDates = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    
    // Apply week offset
    monday.setDate(monday.getDate() + (currentWeekOffset * 7));
    
    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      weekDates.push(date.toISOString().split('T')[0]);
    }
    return weekDates;
  };

  const getWeekLabel = () => {
    const weekDates = getCurrentWeekDates();
    const firstDate = new Date(weekDates[0]);
    const lastDate = new Date(weekDates[6]);
    
    const formatDate = (date: Date) => {
      return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    };
    
    if (currentWeekOffset === 0) {
      return `Current Week (${formatDate(firstDate)} - ${formatDate(lastDate)})`;
    } else if (currentWeekOffset === -1) {
      return `Last Week (${formatDate(firstDate)} - ${formatDate(lastDate)})`;
    } else if (currentWeekOffset === 1) {
      return `Next Week (${formatDate(firstDate)} - ${formatDate(lastDate)})`;
    } else {
      return `Week of ${formatDate(firstDate)} - ${formatDate(lastDate)}`;
    }
  };

  const handleWeeklyHourChange = (taskId: number, date: string, hours: string) => {
    // Update local state only
    setWeeklyHours(prev => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        [date]: hours
      }
    }));
  };

  const handleSaveWeeklyHours = async () => {
    setIsSaving(true);
    setMessage('');
    
    try {
      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      // Process all entries in weeklyHours state
      for (const [taskIdStr, dates] of Object.entries(weeklyHours)) {
        const taskId = parseInt(taskIdStr);
        
        for (const [date, hours] of Object.entries(dates)) {
          // Skip if cell is blocked (multiple entries exist) or approved
          if (blockedCells[taskId]?.[date] || (approvedCells[taskId]?.[date] && !autoApproveTimeEntries)) {
            skippedCount++;
            continue;
          }
          
          // Skip empty values
          if (!hours || hours.trim() === '') {
            continue;
          }

          const hoursNum = parseFloat(hours);
          
          // Find ALL entries for this task/date
          const existingEntries = timeEntries.filter(e => {
            return e.TaskId === taskId && normalizeDateString(e.WorkDate) === date;
          });
          
          // Safety check: if multiple entries exist, skip
          if (existingEntries.length > 1) {
            console.warn(`Skipping Task ${taskId} on ${date} - ${existingEntries.length} entries exist`);
            skippedCount++;
            continue;
          }
          
          const existingEntry = existingEntries[0];
          
          // If hours is 0, delete the entry if it exists
          if (hoursNum === 0) {
            if (existingEntry) {
              try {
                const response = await fetch(
                  `${getApiUrl()}/api/time-entries/${existingEntry.Id}`,
                  {
                    method: 'DELETE',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                    },
                  }
                );
                if (response.ok) {
                  successCount++;
                } else {
                  errorCount++;
                }
              } catch (err) {
                console.error('Failed to delete entry:', err);
                errorCount++;
              }
            }
            continue;
          }

          try {
            if (existingEntry) {
              // Update existing entry - preserve StartTime and EndTime
              const response = await fetch(
                `${getApiUrl()}/api/time-entries/${existingEntry.Id}`,
                {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    hours: hoursNum,
                    description: existingEntry.Description || myTasks.find(t => t.Id === taskId)?.TaskName || '',
                    startTime: existingEntry.StartTime,
                    endTime: existingEntry.EndTime
                  })
                }
              );

              if (response.ok) {
                successCount++;
              } else {
                errorCount++;
              }
            } else {
              // Create new entry
              const task = myTasks.find(t => t.Id === taskId);
              const response = await fetch(
                `${getApiUrl()}/api/time-entries`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    taskId,
                    workDate: date,
                    hours: hoursNum,
                    description: task?.TaskName || ''
                  })
                }
              );

              if (response.ok) {
                successCount++;
              } else {
                errorCount++;
              }
            }
          } catch (err) {
            console.error('Failed to save entry:', err);
            errorCount++;
          }
        }
      }

      // Reload time entries to get updated data
      await loadTimeEntries();

      if (skippedCount > 0) {
        setMessage(`Saved ${successCount} entries, ${skippedCount} cells with multiple entries were skipped (use Daily tab to edit)`);
      } else if (errorCount === 0) {
        setMessage(`Successfully saved ${successCount} time entries!`);
      } else {
        setMessage(`Saved ${successCount} entries with ${errorCount} errors`);
      }
      setTimeout(() => setMessage(''), 5000);
    } catch (err) {
      console.error('Failed to save weekly hours:', err);
      setMessage('Failed to save time entries');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Approval helpers ────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <CustomerUserGuard>
      <div className="w-full">

        <main className="w-full mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 sm:px-0 space-y-4">
            <div>
              <h1 className="text-xl font-semibold leading-tight text-gray-900 dark:text-white">Timesheet</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Track your hours and review your time entries.
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className="border-b border-gray-200 dark:border-gray-700 px-3 sm:px-6 overflow-x-auto">
                <nav className="flex space-x-4 sm:space-x-8 min-w-max">
                  <button
                    onClick={() => setTimesheetView('daily')}
                    className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                      timesheetView === 'daily'
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    📅 Daily Entry
                  </button>
                  <button
                    onClick={() => setTimesheetView('weekly')}
                    className={`py-3 sm:py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                      timesheetView === 'weekly'
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    🗓️ Weekly Grid
                  </button>
                </nav>
              </div>

                {/* Daily Entry View */}
                {timesheetView === 'daily' && (
                  <div className="p-3 sm:p-6 space-y-6">
                    {/* Time Entries List - Last 8 days */}
                    <div>
                      <div className="mb-4">
                        <div className="flex items-center justify-between gap-3">
                          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            My Time Entries
                          </h2>
                          {permissions?.canManageTimeEntries && (
                            <button
                              onClick={() => setShowCreateTimeEntryModal(true)}
                              className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                            >
                              + Add Entry
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Showing entries from the last 8 days
                        </p>
                      </div>

                      {message && (
                        <div className={`mb-4 px-4 py-3 rounded-lg ${
                          message.includes('success')
                            ? 'bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400'
                        }`}>
                          {message}
                        </div>
                      )}

                      {(() => {
                        const eightDaysAgo = new Date();
                        eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
                        const cutoffDate = eightDaysAgo.toISOString().split('T')[0];
                        const recentEntries = timeEntries.filter(entry => {
                          const entryDate = normalizeDateString(entry.WorkDate);
                          return entryDate >= cutoffDate;
                        });

                        return (
                          <>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                Date
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                Project
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                Task
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                Start
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                End
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                Hours
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                Description
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                Status
                              </th>
                              <th scope="col" className="relative px-6 py-3">
                                <span className="sr-only">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {recentEntries.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                  No time entries in the last 8 days. Add your first entry above!
                                </td>
                              </tr>
                            ) : (
                              recentEntries.map(entry => (
                                <tr key={entry.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                  <>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                      {new Date(normalizeDateString(entry.WorkDate) + 'T12:00:00').toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                      {entry.ProjectName}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                      {entry.TaskName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                      {entry.StartTime || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                      {entry.EndTime || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">
                                      {decimalHoursToHMS(parseFloat(entry.Hours as any))}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                      {stripHtml(entry.Description) || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                      <ApprovalStatusBadge status={entry.ApprovalStatus} variant="pill" />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                      {entry.ApprovalStatus === 'approved' && !entry.IsHobby && !autoApproveTimeEntries ? (
                                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">Locked</span>
                                      ) : permissions?.canManageTimeEntries ? (
                                        <div className="flex items-center justify-end gap-1">
                                          <button
                                            onClick={() => handleEditTimeEntry(entry)}
                                            title="Edit entry"
                                            aria-label="Edit entry"
                                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
                                            </svg>
                                          </button>
                                          <button
                                            onClick={() => handleDeleteTimeEntry(entry.Id)}
                                            title="Delete entry"
                                            aria-label="Delete entry"
                                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                          </button>
                                        </div>
                                      ) : null}
                                    </td>
                                  </>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {recentEntries.length > 0 && (
                        <div className="mt-4 px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 rounded-b-lg">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Total Hours (last 8 days):
                            </span>
                            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                              {decimalHoursToHMS(recentEntries.reduce((sum, entry) => sum + parseFloat(entry.Hours as any), 0))}
                            </span>
                          </div>
                        </div>
                      )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Weekly Grid View */}
                {timesheetView === 'weekly' && (
                  <div className="p-3 sm:p-6">
                    {/* Week Navigation */}
                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                          Weekly Timesheet
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {getWeekLabel()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCurrentWeekOffset(prev => prev - 1)}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          ← Previous Week
                        </button>
                        <button
                          onClick={() => setCurrentWeekOffset(0)}
                          disabled={currentWeekOffset === 0}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                        >
                          Current Week
                        </button>
                        <button
                          onClick={() => setCurrentWeekOffset(prev => prev + 1)}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                          Next Week →
                        </button>
                      </div>
                    </div>

                    {message && (
                      <div className={`mb-4 px-4 py-3 rounded-lg ${
                        message.includes('success') 
                          ? 'bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-400'
                          : 'bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400'
                      }`}>
                        {message}
                      </div>
                    )}

                    {multiEntryCellsWarning && (
                      <div className="mb-4 px-4 py-3 rounded-lg bg-orange-100 dark:bg-orange-900/30 border border-orange-400 text-orange-700 dark:text-orange-400">
                        {multiEntryCellsWarning}
                      </div>
                    )}

                    {(() => {
                      // Filter tasks that have allocations OR time entries in the current week
                      const weekDates = getCurrentWeekDates();
                      
                      // Find all tasks that have allocations or time entries
                      const tasksWithAllocationsOrEntries = myTasks.filter(task => {
                        // Check if task has allocations in this week
                        const hasAllocation = taskAllocations.some(allocation => {
                          if (allocation.TaskId !== task.Id) return false;
                          const allocationDate = (allocation.AllocationDate as any) instanceof Date
                            ? (allocation.AllocationDate as any).toISOString().split('T')[0]
                            : String(allocation.AllocationDate).split('T')[0];
                          return weekDates.includes(allocationDate);
                        });
                        
                        // Check if task has time entries in this week
                        const hasTimeEntry = timeEntries.some(entry => {
                          if (entry.TaskId !== task.Id) return false;
                          const entryDate = (entry.WorkDate as any) instanceof Date 
                            ? (entry.WorkDate as any).toISOString().split('T')[0] 
                            : String(entry.WorkDate).split('T')[0];
                          return weekDates.includes(entryDate);
                        });
                        
                        return hasAllocation || hasTimeEntry;
                      });
                      
                      // Now include subtasks of those tasks
                      const parentTaskIds = new Set(tasksWithAllocationsOrEntries.map(t => t.Id));
                      const tasksForWeek = myTasks.filter(task => {
                        // Include if task itself is in the week
                        if (parentTaskIds.has(task.Id)) return true;
                        
                        // Include if it's a subtask of a task in the week
                        if (task.ParentTaskId && parentTaskIds.has(task.ParentTaskId)) return true;
                        
                        return false;
                      });

                      if (tasksForWeek.length === 0) {
                        return (
                          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                            No tasks allocated or with time entries for this week.
                          </div>
                        );
                      }

                      return (
                        <>
                          <div className="overflow-x-auto mb-4" data-grid-enhancer-ignore="true">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider sticky left-0 bg-gray-50 dark:bg-gray-700 z-10">
                                    Task
                                  </th>
                                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
                                    const weekDates = getCurrentWeekDates();
                                    const date = new Date(weekDates[idx]);
                                    const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
                                    const dayKey = dayKeys[idx];
                                    const workCapacity = workHours[dayKey];
                                    const hobbyCapacity = hobbyHours[dayKey];
                                    
                                    return (
                                      <th key={day} className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        <div>{day}</div>
                                        <div className="text-xs font-normal text-gray-400 dark:text-gray-500">
                                          {date.getDate()}/{date.getMonth() + 1}
                                        </div>
                                        {(workCapacity > 0 || hobbyCapacity > 0) && (
                                          <div className="text-[10px] mt-1 space-y-0.5">
                                            {workCapacity > 0 && (
                                              <div className="text-blue-600 dark:text-blue-400">
                                                Work: {workCapacity}h
                                              </div>
                                            )}
                                            {hobbyCapacity > 0 && (
                                              <div className="text-purple-600 dark:text-purple-400">
                                                Hobby: {hobbyCapacity}h
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </th>
                                    );
                                  })}
                                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Total
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {/* Regular Work Tasks */}
                                {tasksForWeek.filter(task => !task.IsHobby).map(task => {
                                  const weekDates = getCurrentWeekDates();
                                  
                                  // Calculate total from both saved entries and local state
                                  const totalHours = weekDates.reduce((sum, date) => {
                                    const localValue = weeklyHours[task.Id]?.[date];
                                    if (localValue) {
                                      return sum + parseFloat(localValue);
                                    }
                                    // Find ALL entries for this task/date and sum them
                                    const entries = timeEntries.filter(e => {
                                      if (e.TaskId !== task.Id) return false;
                                      const entryDate = (e.WorkDate as any) instanceof Date 
                                        ? (e.WorkDate as any).toISOString().split('T')[0] 
                                        : String(e.WorkDate).split('T')[0];
                                      return entryDate === date;
                                    });
                                    const totalEntriesHours = entries.reduce((s, e) => s + parseFloat(e.Hours as any), 0);
                                    return sum + totalEntriesHours;
                                  }, 0);

                                  return (
                                    <tr key={task.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                      <td className="px-4 py-3 text-sm sticky left-0 bg-white dark:bg-gray-800 z-10">
                                        <div className="font-medium text-gray-900 dark:text-white">
                                          {task.TaskName}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                          {task.ProjectName}
                                        </div>
                                      </td>
                                      {weekDates.map((date, idx) => {
                                        const localValue = weeklyHours[task.Id]?.[date];
                                        // Find ALL entries for this task/date
                                        const entries = timeEntries.filter(e => {
                                          if (e.TaskId !== task.Id) return false;
                                          const entryDate = (e.WorkDate as any) instanceof Date 
                                            ? (e.WorkDate as any).toISOString().split('T')[0] 
                                            : String(e.WorkDate).split('T')[0];
                                          return entryDate === date;
                                        });
                                        
                                        const hasMultipleEntries = entries.length > 1;
                                        const isApproved = !!approvedCells[task.Id]?.[date];
                                        const isApprovedLocked = isApproved && !autoApproveTimeEntries;
                                        const savedHours = hasMultipleEntries 
                                          ? entries.reduce((sum, e) => sum + parseFloat(e.Hours as any), 0)
                                          : entries.length === 1 ? parseFloat(entries[0].Hours as any) : 0;
                                        const displayValue = localValue !== undefined ? localValue : (savedHours > 0 ? savedHours.toString() : '');
                                        const isBlocked = !!blockedCells[task.Id]?.[date]; // Convert to boolean
                                        
                                        return (
                                          <td 
                                            key={date} 
                                            className={`px-2 py-2 text-center ${
                                              hasMultipleEntries 
                                                ? 'bg-orange-100 dark:bg-orange-900/30' 
                                                : isApprovedLocked
                                                ? 'bg-green-50 dark:bg-green-900/20'
                                                : ''
                                            }`}
                                            title={hasMultipleEntries ? `${entries.length} entries exist for this day. Use Daily tab to edit.` : isApprovedLocked ? 'This entry has been approved and cannot be edited.' : ''}
                                          >
                                            {hasMultipleEntries ? (
                                              <div className="flex flex-col items-center">
                                                <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
                                                  {savedHours.toFixed(2)}
                                                </span>
                                                <span className="text-xs text-orange-600 dark:text-orange-500">
                                                  🔒 {entries.length} entries
                                                </span>
                                              </div>
                                            ) : isApprovedLocked ? (
                                              <div className="flex flex-col items-center">
                                                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                                  {savedHours.toFixed(2)}
                                                </span>
                                                <span className="text-xs text-green-600 dark:text-green-500">
                                                  ✓ Approved
                                                </span>
                                              </div>
                                            ) : (
                                              <input
                                                type="number"
                                                min="0"
                                                max="24"
                                                step="0.25"
                                                value={displayValue}
                                                onChange={(e) => handleWeeklyHourChange(task.Id, date, e.target.value)}
                                                disabled={isBlocked}
                                                className={`w-16 px-2 py-1 text-center text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 ${
                                                  isBlocked ? 'opacity-50 cursor-not-allowed' : ''
                                                }`}
                                                placeholder="0"
                                              />
                                            )}
                                          </td>
                                        );
                                      })}
                                      <td className="px-4 py-3 text-center text-sm font-bold text-blue-600 dark:text-blue-400">
                                        {decimalHoursToHMS(totalHours)}
                                      </td>
                                    </tr>
                                  );
                                })}
                                
                                {/* Hobby Projects Separator */}
                                {tasksForWeek.some(task => task.IsHobby) && (
                                  <tr className="bg-purple-50 dark:bg-purple-900/20">
                                    <td colSpan={9} className="px-4 py-2 text-center text-sm font-semibold text-purple-700 dark:text-purple-400">
                                      🎨 Hobby Projects
                                    </td>
                                  </tr>
                                )}
                                
                                {/* Hobby Tasks */}
                                {tasksForWeek.filter(task => task.IsHobby).map(task => {
                                  const weekDates = getCurrentWeekDates();
                                  
                                  const totalHours = weekDates.reduce((sum, date) => {
                                    const localValue = weeklyHours[task.Id]?.[date];
                                    if (localValue) {
                                      return sum + parseFloat(localValue);
                                    }
                                    // Find ALL entries for this task/date and sum them
                                    const entries = timeEntries.filter(e => {
                                      if (e.TaskId !== task.Id) return false;
                                      const entryDate = (e.WorkDate as any) instanceof Date 
                                        ? (e.WorkDate as any).toISOString().split('T')[0] 
                                        : String(e.WorkDate).split('T')[0];
                                      return entryDate === date;
                                    });
                                    const totalEntriesHours = entries.reduce((s, e) => s + parseFloat(e.Hours as any), 0);
                                    return sum + totalEntriesHours;
                                  }, 0);

                                  return (
                                    <tr key={task.Id} className="hover:bg-purple-50 dark:hover:bg-purple-900/10 bg-purple-50/50 dark:bg-purple-900/10">
                                      <td className="px-4 py-3 text-sm sticky left-0 bg-purple-50/90 dark:bg-purple-900/20 z-10">
                                        <div className="flex items-center gap-2">
                                          <span className="text-purple-600 dark:text-purple-400">🎨</span>
                                          <div>
                                            <div className="font-medium text-gray-900 dark:text-white">
                                              {task.TaskName}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                              {task.ProjectName}
                                            </div>
                                          </div>
                                        </div>
                                      </td>
                                      {weekDates.map((date, idx) => {
                                        const localValue = weeklyHours[task.Id]?.[date];
                                        // Find ALL entries for this task/date
                                        const entries = timeEntries.filter(e => {
                                          if (e.TaskId !== task.Id) return false;
                                          const entryDate = (e.WorkDate as any) instanceof Date 
                                            ? (e.WorkDate as any).toISOString().split('T')[0] 
                                            : String(e.WorkDate).split('T')[0];
                                          return entryDate === date;
                                        });
                                        
                                        const hasMultipleEntries = entries.length > 1;
                                        const isApproved = !!approvedCells[task.Id]?.[date];
                                        const isApprovedLocked = isApproved && !autoApproveTimeEntries;
                                        const savedHours = hasMultipleEntries 
                                          ? entries.reduce((sum, e) => sum + parseFloat(e.Hours as any), 0)
                                          : entries.length === 1 ? parseFloat(entries[0].Hours as any) : 0;
                                        const displayValue = localValue !== undefined ? localValue : (savedHours > 0 ? savedHours.toString() : '');
                                        const isBlocked = !!blockedCells[task.Id]?.[date]; // Convert to boolean
                                        
                                        return (
                                          <td 
                                            key={date} 
                                            className={`px-2 py-2 text-center ${
                                              hasMultipleEntries 
                                                ? 'bg-orange-100 dark:bg-orange-900/30' 
                                                : isApprovedLocked
                                                ? 'bg-green-50 dark:bg-green-900/20'
                                                : 'bg-purple-50/50 dark:bg-purple-900/10'
                                            }`}
                                            title={hasMultipleEntries ? `${entries.length} entries exist for this day. Use Daily tab to edit.` : isApprovedLocked ? 'This entry has been approved and cannot be edited.' : ''}
                                          >
                                            {hasMultipleEntries ? (
                                              <div className="flex flex-col items-center">
                                                <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
                                                  {savedHours.toFixed(2)}
                                                </span>
                                                <span className="text-xs text-orange-600 dark:text-orange-500">
                                                  🔒 {entries.length} entries
                                                </span>
                                              </div>
                                            ) : isApprovedLocked ? (
                                              <div className="flex flex-col items-center">
                                                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                                  {savedHours.toFixed(2)}
                                                </span>
                                                <span className="text-xs text-green-600 dark:text-green-500">
                                                  ✓ Approved
                                                </span>
                                              </div>
                                            ) : (
                                              <input
                                                type="number"
                                                min="0"
                                                max="24"
                                                step="0.25"
                                                value={displayValue}
                                                onChange={(e) => handleWeeklyHourChange(task.Id, date, e.target.value)}
                                                disabled={isBlocked}
                                                className={`w-16 px-2 py-1 text-center text-sm border border-purple-300 dark:border-purple-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 ${
                                                  isBlocked ? 'opacity-50 cursor-not-allowed' : ''
                                                }`}
                                                placeholder="0"
                                              />
                                            )}
                                          </td>
                                        );
                                      })}
                                      <td className="px-4 py-3 text-center text-sm font-bold text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10">
                                        {decimalHoursToHMS(totalHours)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                  <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white sticky left-0 bg-gray-50 dark:bg-gray-700 z-10">
                                    Daily Total
                                  </td>
                                  {getCurrentWeekDates().map(date => {
                                    const dayTotal = tasksForWeek.reduce((sum, task) => {
                                      const localValue = weeklyHours[task.Id]?.[date];
                                      if (localValue) {
                                        return sum + parseFloat(localValue);
                                      }
                                      // Find ALL entries for this task/date and sum them
                                      const entries = timeEntries.filter(e => {
                                        if (e.TaskId !== task.Id) return false;
                                        const entryDate = (e.WorkDate as any) instanceof Date 
                                          ? (e.WorkDate as any).toISOString().split('T')[0] 
                                          : String(e.WorkDate).split('T')[0];
                                        return entryDate === date;
                                      });
                                      const totalEntriesHours = entries.reduce((s, e) => s + parseFloat(e.Hours as any), 0);
                                      return sum + totalEntriesHours;
                                    }, 0);
                                    return (
                                      <td key={date} className="px-2 py-3 text-center text-sm font-bold text-blue-600 dark:text-blue-400">
                                        {dayTotal.toFixed(2)}
                                      </td>
                                    );
                                  })}
                                  <td className="px-4 py-3 text-center text-sm font-bold text-green-600 dark:text-green-400">
                                    {decimalHoursToHMS(tasksForWeek.reduce((total, task) => {
                                      return total + getCurrentWeekDates().reduce((sum, date) => {
                                        const localValue = weeklyHours[task.Id]?.[date];
                                        if (localValue) {
                                          return sum + parseFloat(localValue);
                                        }
                                        // Find ALL entries for this task/date and sum them
                                        const entries = timeEntries.filter(e => {
                                          if (e.TaskId !== task.Id) return false;
                                          const entryDate = (e.WorkDate as any) instanceof Date 
                                            ? (e.WorkDate as any).toISOString().split('T')[0] 
                                            : String(e.WorkDate).split('T')[0];
                                          return entryDate === date;
                                        });
                                        const totalEntriesHours = entries.reduce((s, e) => s + parseFloat(e.Hours as any), 0);
                                        return sum + totalEntriesHours;
                                      }, 0);
                                    }, 0))}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>

                          {/* Save Button */}
                          {permissions?.canManageTimeEntries && (
                          <div className="flex justify-end gap-3">
                            <button
                              onClick={() => {
                                setWeeklyHours({});
                                loadTimeEntries();
                              }}
                              disabled={isSaving || Object.keys(weeklyHours).length === 0}
                              className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Cancel Changes
                            </button>
                            <button
                              onClick={handleSaveWeeklyHours}
                              disabled={isSaving || Object.keys(weeklyHours).length === 0}
                              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors font-medium"
                            >
                              {isSaving ? 'Saving...' : 'Save All Changes'}
                            </button>
                          </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* All Entries (History) View */}
                {timesheetView === 'history' && (
                  <div className="p-6 space-y-6">
                    {/* Filters */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                          All Time Entries
                        </h2>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const filtered = timeEntries.filter(entry => {
                                const entryDate = normalizeDateString(entry.WorkDate);
                                if (historyDateFrom && entryDate < historyDateFrom) return false;
                                if (historyDateTo && entryDate > historyDateTo) return false;
                                if (historyProjectFilter && entry.ProjectName !== historyProjectFilter) return false;
                                if (historyTaskFilter && entry.TaskId !== parseInt(historyTaskFilter)) return false;
                                return true;
                              });
                              const header = ['Date', 'Customer', 'Project', 'Task', 'Start', 'End', 'Hours', 'Description', 'Status'];
                              const rows = filtered.map(e => [
                                normalizeDateString(e.WorkDate),
                                e.CustomerName || '',
                                e.ProjectName || '',
                                e.TaskName || '',
                                e.StartTime || '',
                                e.EndTime || '',
                                parseFloat(e.Hours as any).toFixed(2),
                                stripHtml(e.Description || '').replace(/"/g, '""'),
                                e.ApprovalStatus || ''
                              ].map(v => `"${v}"`).join(','));
                              const csv = [header.join(','), ...rows].join('\n');
                              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `time-entries-${historyDateFrom}-${historyDateTo}.csv`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                          >
                            ⬇ Export CSV
                          </button>
                          <button
                            onClick={async () => {
                              if (!token) return;

                              const filtered = timeEntries.filter(entry => {
                                const entryDate = normalizeDateString(entry.WorkDate);
                                if (historyDateFrom && entryDate < historyDateFrom) return false;
                                if (historyDateTo && entryDate > historyDateTo) return false;
                                if (historyProjectFilter && entry.ProjectName !== historyProjectFilter) return false;
                                if (historyTaskFilter && entry.TaskId !== parseInt(historyTaskFilter)) return false;
                                return true;
                              });

                              const header = ['Date', 'Customer', 'Project', 'Task', 'Start', 'End', 'Hours', 'Description', 'Status'];
                              const rows = filtered.map(e => [
                                normalizeDateString(e.WorkDate),
                                e.CustomerName || '',
                                e.ProjectName || '',
                                e.TaskName || '',
                                e.StartTime || '',
                                e.EndTime || '',
                                parseFloat(e.Hours as any).toFixed(2),
                                stripHtml(e.Description || ''),
                                e.ApprovalStatus || ''
                              ]);

                              try {
                                await downloadTablePdf({
                                  title: 'Time Entries',
                                  filename: `time-entries-${historyDateFrom}-${historyDateTo}`,
                                  headers: header,
                                  rows,
                                }, token);
                              } catch (error) {
                                console.error('Error exporting PDF:', error);
                                setMessage(error instanceof Error ? error.message : 'Failed to export PDF');
                              }
                            }}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                          >
                            📄 Export PDF
                          </button>
                        </div>
                      </div>
                      <CollapsibleFilterPanel
                        className="mb-2"
                        title="Entry filters"
                        activeCount={historyFilterActiveCount}
                        bodyClassName="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            From
                          </label>
                          <input
                            type="date"
                            value={historyDateFrom}
                            onChange={(e) => setHistoryDateFrom(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            To
                          </label>
                          <input
                            type="date"
                            value={historyDateTo}
                            onChange={(e) => setHistoryDateTo(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Project
                          </label>
                          <select
                            value={historyProjectFilter}
                            onChange={(e) => { setHistoryProjectFilter(e.target.value); setHistoryTaskFilter(''); }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="">All Projects</option>
                            {Array.from(new Set(timeEntries.map(e => e.ProjectName))).sort().map(projectName => (
                              <option key={projectName} value={projectName}>{projectName}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Task
                          </label>
                          <select
                            value={historyTaskFilter}
                            onChange={(e) => setHistoryTaskFilter(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="">All Tasks</option>
                            {Array.from(new Set(
                              timeEntries
                                .filter(e => !historyProjectFilter || e.ProjectName === historyProjectFilter)
                                .map(e => JSON.stringify({ id: e.TaskId, name: e.TaskName }))
                            )).map(json => {
                              const task = JSON.parse(json);
                              return (
                                <option key={task.id} value={task.id}>{task.name}</option>
                              );
                            })}
                          </select>
                        </div>
                        </div>
                      </CollapsibleFilterPanel>
                      <div className="flex items-center">
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={groupByDays}
                            onChange={(e) => setGroupByDays(e.target.checked)}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                          />
                          <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                            Group by Days
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Filtered Entries Table */}
                    {(() => {
                      const filteredEntries = timeEntries.filter(entry => {
                        const entryDate = normalizeDateString(entry.WorkDate);
                        if (historyDateFrom && entryDate < historyDateFrom) return false;
                        if (historyDateTo && entryDate > historyDateTo) return false;
                        if (historyProjectFilter && entry.ProjectName !== historyProjectFilter) return false;
                        if (historyTaskFilter && entry.TaskId !== parseInt(historyTaskFilter)) return false;
                        return true;
                      });

                      const totalFilteredHours = filteredEntries.reduce((sum, entry) => sum + parseFloat(entry.Hours as any), 0);

                      // Group by date for summary
                      const dateGroups: { [date: string]: number } = {};
                      filteredEntries.forEach(entry => {
                        const date = normalizeDateString(entry.WorkDate);
                        dateGroups[date] = (dateGroups[date] || 0) + parseFloat(entry.Hours as any);
                      });
                      const uniqueDays = Object.keys(dateGroups).length;

                      return (
                        <>
                          <div className="overflow-x-auto" data-grid-enhancer-ignore="true">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Date
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Customer
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Project
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Task
                                  </th>
                                  {!groupByDays && (
                                    <>
                                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Start
                                      </th>
                                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        End
                                      </th>
                                    </>
                                  )}
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Hours
                                  </th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Description
                                  </th>
                                  {!groupByDays && (
                                    <>
                                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Status
                                      </th>
                                      <th scope="col" className="relative px-6 py-3">
                                        <span className="sr-only">Actions</span>
                                      </th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredEntries.length === 0 ? (
                                  <tr>
                                    <td colSpan={groupByDays ? 6 : 10} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                      No time entries found for the selected filters.
                                    </td>
                                  </tr>
                                ) : groupByDays ? (
                                  (() => {
                                    // Group entries by date, then by customer, project, task
                                    type GroupKey = string; // "date|customerId|projectId|taskId"
                                    const grouped: { [key: GroupKey]: {
                                      date: string;
                                      customerName: string;
                                      projectName: string;
                                      taskName: string;
                                      totalHours: number;
                                      descriptions: string[];
                                    } } = {};

                                    filteredEntries.forEach(entry => {
                                      const date = normalizeDateString(entry.WorkDate);
                                      const key = `${date}|${entry.CustomerName || 'none'}|${entry.ProjectName}|${entry.TaskId}`;
                                      
                                      if (!grouped[key]) {
                                        grouped[key] = {
                                          date,
                                          customerName: entry.CustomerName || '-',
                                          projectName: entry.ProjectName,
                                          taskName: entry.TaskName,
                                          totalHours: 0,
                                          descriptions: []
                                        };
                                      }
                                      grouped[key].totalHours += parseFloat(entry.Hours as any);
                                      const cleanedDescription = stripHtml(entry.Description);
                                      if (cleanedDescription) {
                                        grouped[key].descriptions.push(cleanedDescription);
                                      }
                                    });

                                    // Sort by date descending, then by customer, project, task
                                    const sortedGroups = Object.entries(grouped).sort((a, b) => {
                                      const dateCompare = b[1].date.localeCompare(a[1].date);
                                      if (dateCompare !== 0) return dateCompare;
                                      const customerCompare = a[1].customerName.localeCompare(b[1].customerName);
                                      if (customerCompare !== 0) return customerCompare;
                                      const projectCompare = a[1].projectName.localeCompare(b[1].projectName);
                                      if (projectCompare !== 0) return projectCompare;
                                      return a[1].taskName.localeCompare(b[1].taskName);
                                    });

                                    // Group by date for daily totals
                                    const dateGroups: { [date: string]: typeof sortedGroups } = {};
                                    sortedGroups.forEach(([key, group]) => {
                                      if (!dateGroups[group.date]) {
                                        dateGroups[group.date] = [];
                                      }
                                      dateGroups[group.date].push([key, group]);
                                    });

                                    const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));

                                    return sortedDates.flatMap(date => {
                                      const groups = dateGroups[date];
                                      const dayTotal = groups.reduce((sum, [, g]) => sum + g.totalHours, 0);
                                      const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                                      
                                      return [
                                        // Day header row
                                        <tr key={`header-${date}`} className="bg-gray-100 dark:bg-gray-700">
                                          <td colSpan={6} className="px-6 py-2">
                                            <div className="flex items-center justify-between">
                                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                                📅 {dayLabel}
                                              </span>
                                              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                                {decimalHoursToHMS(dayTotal)} total
                                              </span>
                                            </div>
                                          </td>
                                        </tr>,
                                        // Grouped summary rows
                                        ...groups.map(([key, group]) => (
                                          <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                              {new Date(group.date + 'T12:00:00').toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                              {group.customerName}
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                              {group.projectName}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-gray-900 dark:text-white">
                                              {group.taskName}
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">
                                              {decimalHoursToHMS(group.totalHours)}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                                              {group.descriptions.length > 0 ? (
                                                <div className="space-y-1">
                                                  {group.descriptions.map((desc, idx) => (
                                                    <div key={idx} className="text-xs">
                                                      • {desc}
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : (
                                                '-'
                                              )}
                                            </td>
                                          </tr>
                                        ))
                                      ];
                                    });
                                  })()
                                ) : (
                                  filteredEntries.map(entry => (
                                    <tr key={entry.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        {new Date(normalizeDateString(entry.WorkDate) + 'T12:00:00').toLocaleDateString()}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        {entry.CustomerName || '-'}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        {entry.ProjectName}
                                      </td>
                                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                                        {entry.TaskName}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        {entry.StartTime || '-'}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        {entry.EndTime || '-'}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">
                                        {decimalHoursToHMS(parseFloat(entry.Hours as any))}
                                      </td>
                                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                        {stripHtml(entry.Description) || '-'}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <ApprovalStatusBadge status={entry.ApprovalStatus} variant="pill" />
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {entry.ApprovalStatus === 'approved' && !entry.IsHobby && !autoApproveTimeEntries ? (
                                          <span className="text-xs text-gray-400 dark:text-gray-500 italic">Locked</span>
                                        ) : permissions?.canManageTimeEntries ? (
                                          <div className="flex items-center justify-end gap-1">
                                            <button
                                              onClick={() => handleEditTimeEntry(entry)}
                                              title="Edit entry"
                                              aria-label="Edit entry"
                                              className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
                                              </svg>
                                            </button>
                                            <button
                                              onClick={() => handleDeleteTimeEntry(entry.Id)}
                                              title="Delete entry"
                                              aria-label="Delete entry"
                                              className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                              </svg>
                                            </button>
                                          </div>
                                        ) : null}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>

                          {filteredEntries.length > 0 && (
                            <div className="mt-4 px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 rounded-b-lg">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  Total Hours ({filteredEntries.length} entries across {uniqueDays} days):
                                </span>
                                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                  {decimalHoursToHMS(totalFilteredHours)}
                                </span>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

                {timesheetView === 'resume' && (
                  <div className="p-6 space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">📋 User Time Resume</h3>
                        <div className="flex flex-wrap items-center gap-2">
                          {([
                            { key: 'thisWeek', label: 'This Week' },
                            { key: 'lastWeek', label: 'Last Week' },
                            { key: 'thisMonth', label: 'This Month' },
                            { key: 'lastMonth', label: 'Last Month' },
                            { key: 'allTime', label: 'All Time' },
                          ] as { key: ResumePeriod; label: string }[]).map(period => (
                            <button
                              key={period.key}
                              onClick={() => setResumePeriod(period.key)}
                              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                resumePeriod === period.key
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                              }`}
                            >
                              {period.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {resumeLoading ? (
                        <div className="text-center py-10 text-gray-500 dark:text-gray-400">Loading resume…</div>
                      ) : resumeSummary.length === 0 ? (
                        <div className="text-center py-10 text-gray-500 dark:text-gray-400">No entries found for selected period.</div>
                      ) : (
                        <>
                          <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600">
                            <div className="text-sm text-gray-600 dark:text-gray-300">
                              {resumePeriod === 'allTime' || !selectedResumeRange ? (
                                <>Period: <span className="font-semibold text-gray-900 dark:text-white">All Time</span></>
                              ) : (
                                <>Period: <span className="font-semibold text-gray-900 dark:text-white">{selectedResumeRange.from}</span> to <span className="font-semibold text-gray-900 dark:text-white">{selectedResumeRange.to}</span></>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 mb-4">
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800">
                              <p className="text-sm text-blue-700 dark:text-blue-300">Users</p>
                              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{resumeTotals.totalUsers}</p>
                            </div>
                            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-100 dark:border-green-800">
                              <p className="text-sm text-green-700 dark:text-green-300">Total Entries</p>
                              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{resumeTotals.totalEntries}</p>
                            </div>
                            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-100 dark:border-purple-800">
                              <p className="text-sm text-purple-700 dark:text-purple-300">Total Hours</p>
                              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{decimalHoursToHMS(resumeTotals.totalHours)}</p>
                            </div>
                            <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4 border border-cyan-100 dark:border-cyan-800">
                              <p className="text-sm text-cyan-700 dark:text-cyan-300">Avg / Entry</p>
                              <p className="text-2xl font-bold text-cyan-900 dark:text-cyan-100">{decimalHoursToHMS(resumeTotals.avgHoursPerEntry)}</p>
                            </div>
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-100 dark:border-indigo-800">
                              <p className="text-sm text-indigo-700 dark:text-indigo-300">Avg / User</p>
                              <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{decimalHoursToHMS(resumeTotals.avgHoursPerUser)}</p>
                            </div>
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-100 dark:border-emerald-800">
                              <p className="text-sm text-emerald-700 dark:text-emerald-300">Approval Rate</p>
                              <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">{resumeTotals.approvalRate.toFixed(1)}%</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Approval Distribution</h4>
                              <div className="w-full h-3 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 mb-3 flex">
                                <div className="bg-green-500" style={{ width: `${resumeTotals.approvalRate}%` }} />
                                <div className="bg-yellow-500" style={{ width: `${resumeTotals.pendingRate}%` }} />
                                <div className="bg-red-500" style={{ width: `${resumeTotals.rejectedRate}%` }} />
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-xs">
                                <div className="text-green-700 dark:text-green-400">Approved: {resumeTotals.approved} ({resumeTotals.approvalRate.toFixed(1)}%)</div>
                                <div className="text-yellow-700 dark:text-yellow-400">Pending: {resumeTotals.pending} ({resumeTotals.pendingRate.toFixed(1)}%)</div>
                                <div className="text-red-700 dark:text-red-400">Rejected: {resumeTotals.rejected} ({resumeTotals.rejectedRate.toFixed(1)}%)</div>
                              </div>
                            </div>

                            <div className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Top Contributors by Hours</h4>
                              <div className="space-y-3">
                                {resumeTopUsers.map((row, idx) => {
                                  const maxHours = resumeTopUsers[0]?.TotalHours || 1;
                                  const width = maxHours > 0 ? (row.TotalHours / maxHours) * 100 : 0;
                                  const displayName = row.FirstName && row.LastName ? `${row.FirstName} ${row.LastName}` : row.Username;
                                  return (
                                    <div key={row.UserId}>
                                      <div className="flex justify-between text-xs text-gray-700 dark:text-gray-300 mb-1">
                                        <span>{idx + 1}. {displayName}</span>
                                        <span>{row.TotalHours.toFixed(2) !== '0.00' ? decimalHoursToHMS(row.TotalHours) : '00:00:00'}</span>
                                      </div>
                                      <div className="w-full h-2 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                        <div className="h-2 bg-blue-500 rounded" style={{ width: `${width}%` }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {resumeAttentionUsers.length > 0 && (
                            <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                              <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">Needs Attention</h4>
                              <div className="space-y-1 text-sm">
                                {resumeAttentionUsers.slice(0, 5).map(row => {
                                  const displayName = row.FirstName && row.LastName ? `${row.FirstName} ${row.LastName}` : row.Username;
                                  return (
                                    <div key={row.UserId} className="flex justify-between text-amber-800 dark:text-amber-300">
                                      <span>{displayName}</span>
                                      <span>{row.PendingCount} pending · {row.RejectedCount} rejected</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">User</th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Entries</th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Hours</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tasks</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Projects</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Customers</th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Approved</th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Pending</th>
                                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Rejected</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {resumeSummary.map(row => {
                                  const taskNames = parseResumeList(row.TaskNames);
                                  const projectNames = parseResumeList(row.ProjectNames);
                                  const customerNames = parseResumeList(row.CustomerNames);

                                  return (
                                    <tr key={row.UserId} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                        {row.FirstName && row.LastName ? `${row.FirstName} ${row.LastName}` : row.Username}
                                        <div className="text-xs text-gray-500 dark:text-gray-400">@{row.Username}</div>
                                      </td>
                                      <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{row.EntryCount}</td>
                                      <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600 dark:text-blue-400">{decimalHoursToHMS(row.TotalHours)}</td>
                                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white min-w-[220px]">
                                        <div className="font-semibold text-xs text-indigo-600 dark:text-indigo-400 mb-1">{row.TaskCount} task{row.TaskCount === 1 ? '' : 's'}</div>
                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                          {taskNames.length > 0 ? `${taskNames.slice(0, 2).join(', ')}${taskNames.length > 2 ? ` +${taskNames.length - 2} more` : ''}` : '—'}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white min-w-[220px]">
                                        <div className="font-semibold text-xs text-purple-600 dark:text-purple-400 mb-1">{row.ProjectCount} project{row.ProjectCount === 1 ? '' : 's'}</div>
                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                          {projectNames.length > 0 ? `${projectNames.slice(0, 2).join(', ')}${projectNames.length > 2 ? ` +${projectNames.length - 2} more` : ''}` : '—'}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white min-w-[220px]">
                                        <div className="font-semibold text-xs text-emerald-600 dark:text-emerald-400 mb-1">{row.CustomerCount} customer{row.CustomerCount === 1 ? '' : 's'}</div>
                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                          {customerNames.length > 0 ? `${customerNames.slice(0, 2).join(', ')}${customerNames.length > 2 ? ` +${customerNames.length - 2} more` : ''}` : '—'}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400">{row.ApprovedCount}</td>
                                      <td className="px-4 py-3 text-sm text-right text-yellow-600 dark:text-yellow-400">{row.PendingCount}</td>
                                      <td className="px-4 py-3 text-sm text-right text-red-600 dark:text-red-400">{row.RejectedCount}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
        </main>

        <TimeEntryFormModal
          isOpen={showCreateTimeEntryModal}
          title="Add Time Entry"
          submitLabel="Add Entry"
          onClose={() => setShowCreateTimeEntryModal(false)}
          onSubmit={handleCreateTimeEntry}
          token={token || undefined}
          useOrganizationProjectTaskFlow
        />

        {/* Edit Time Entry Modal */}
        {showEditModal && editingEntry && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Time Entry</h3>
                  <button onClick={handleCancelEdit} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl font-bold">
                    ×
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                    <input
                      type="date"
                      value={editEntry.workDate}
                      onChange={(e) => setEditEntry({ ...editEntry, workDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={editEntry.startTime}
                        onChange={(e) => handleEditTimeChange('startTime', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</label>
                      <input
                        type="time"
                        value={editEntry.endTime}
                        onChange={(e) => handleEditTimeChange('endTime', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hours</label>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={editEntry.hours}
                      onChange={(e) => setEditEntry({ ...editEntry, hours: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                    <RichTextEditor
                      content={editEntry.description}
                      onChange={(html) => setEditEntry({ ...editEntry, description: html })}
                      placeholder="What did you work on?"
                    />
                  </div>
                  <CustomFieldsFormSection
                    tableName="TimeEntries"
                    token={token || undefined}
                    values={editCustomFields}
                    onChange={setEditCustomFields}
                  />
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={handleCancelEdit}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateTimeEntry}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <ConfirmAlertModal
          isOpen={!!modalMessage}
          type={modalMessage?.type || 'confirm'}
          title={modalMessage?.title || ''}
          message={modalMessage?.message || ''}
          onClose={closeModal}
          onConfirm={handleModalConfirm}
          confirmLabel="Delete"
          confirmVariant="danger"
        />

        <ScrollToTopButton />
      </div>
    </CustomerUserGuard>
  );
}
