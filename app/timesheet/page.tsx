'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { usersApi, User } from '@/lib/api/users';
import { tasksApi, Task } from '@/lib/api/tasks';
import Navbar from '@/components/Navbar';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import SearchableSelect from '@/components/SearchableSelect';

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

export default function TimesheetPage() {
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
  const [editEntry, setEditEntry] = useState({
    taskId: '',
    workDate: '',
    startTime: '',
    endTime: '',
    hours: '',
    description: ''
  });
  const [timesheetView, setTimesheetView] = useState<'daily' | 'weekly' | 'history'>('daily');
  const [weeklyHours, setWeeklyHours] = useState<{[taskId: number]: {[day: string]: string}}>({});
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0);
  // Track cells with multiple entries (blocked from editing)
  const [blockedCells, setBlockedCells] = useState<{[taskId: number]: {[date: string]: number}}>({}); // value = number of entries
  // Track cells with approved entries (locked from editing/deleting)
  const [approvedCells, setApprovedCells] = useState<{[taskId: number]: {[date: string]: boolean}}>({});
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
      loadUserProfile();
      loadTimeEntries();
      loadMyTasks();
      loadTaskAllocations();
    }
  }, [user, token]);

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
          } else if (entries.length === 1 && entries[0].ApprovalStatus === 'approved' && !entries[0].IsHobby) {
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
  }, [timesheetView, currentWeekOffset, timeEntries, myTasks]);

  // Helper function to normalize date for comparison
  const normalizeDateString = (dateValue: any): string => {
    if (dateValue instanceof Date) {
      return dateValue.toISOString().split('T')[0];
    }
    return String(dateValue).split('T')[0];
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

  const handleCreateTimeEntry = async () => {
    // Calculate hours from times if not manually set
    let hours = newEntry.hours ? parseFloat(newEntry.hours) : 0;
    if (!hours && newEntry.startTime && newEntry.endTime) {
      hours = calculateHoursFromTimes(newEntry.startTime, newEntry.endTime);
    }

    if (!newEntry.taskId || !newEntry.workDate || hours <= 0) {
      setMessage('Please fill all required fields (hours must be greater than 0)');
      setTimeout(() => setMessage(''), 3000);
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
            taskId: parseInt(newEntry.taskId),
            workDate: newEntry.workDate,
            startTime: newEntry.startTime || null,
            endTime: newEntry.endTime || null,
            hours: hours,
            description: newEntry.description
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
        loadTimeEntries();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to create time entry');
      }
    } catch (err) {
      console.error('Failed to create time entry:', err);
      setMessage('Failed to create time entry');
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
          if (blockedCells[taskId]?.[date] || approvedCells[taskId]?.[date]) {
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

  const getApprovalBadge = (status?: string) => {
    if (status === 'approved') return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
        ✓ Approved
      </span>
    );
    if (status === 'rejected') return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        ✗ Rejected
      </span>
    );
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">
        ⏳ Pending
      </span>
    );
  };

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
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Navbar />

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            {/* Page Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow p-6 text-white mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold">⏱️ My Timesheet</h1>
                  <p className="text-blue-100 mt-1">Track and manage your time entries</p>
                </div>
                <div className="text-5xl opacity-80">📝</div>
              </div>
            </div>

            {/* Timesheet Content */}
            <div className="space-y-6">
              {/* Timesheet Sub-Tabs */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="border-b border-gray-200 dark:border-gray-700">
                  <nav className="flex space-x-8 px-6">
                    <button
                      onClick={() => setTimesheetView('daily')}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        timesheetView === 'daily'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      📝 Daily Entry
                    </button>
                    <button
                      onClick={() => setTimesheetView('weekly')}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        timesheetView === 'weekly'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      📅 Weekly Grid
                    </button>
                    <button
                      onClick={() => setTimesheetView('history')}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        timesheetView === 'history'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      📊 All Entries
                    </button>
                  </nav>
                </div>

                {/* Daily Entry View */}
                {timesheetView === 'daily' && (
                  <div className="p-6 space-y-6">
                    {/* Add New Time Entry */}
                    {permissions?.canManageTimeEntries && (
                    <div>
                      <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
                        Add Time Entry
                      </h2>
                      
                      {message && (
                        <div className={`mb-4 px-4 py-3 rounded-lg ${
                          message.includes('success') 
                            ? 'bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400'
                        }`}>
                          {message}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Task *
                          </label>
                          <SearchableSelect
                            value={newEntry.taskId}
                            onChange={(value) => setNewEntry({ ...newEntry, taskId: value })}
                            options={myTasks.map(task => ({
                              value: task.Id,
                              label: `${task.ProjectName} - ${task.TaskName} (${task.StatusName || 'Unknown'})`
                            }))}
                            placeholder="Select a task"
                            emptyText="No tasks assigned to you"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Date *
                          </label>
                          <input
                            type="date"
                            value={newEntry.workDate}
                            onChange={(e) => setNewEntry({ ...newEntry, workDate: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={newEntry.startTime}
                            onChange={(e) => setNewEntry({ ...newEntry, startTime: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            End Time
                          </label>
                          <input
                            type="time"
                            value={newEntry.endTime}
                            onChange={(e) => setNewEntry({ ...newEntry, endTime: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Hours {newEntry.startTime && newEntry.endTime && !newEntry.hours && `(calculated: ${calculateHoursFromTimes(newEntry.startTime, newEntry.endTime).toFixed(2)}h)`}
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="24"
                            step="0.25"
                            value={newEntry.hours}
                            onChange={(e) => setNewEntry({ ...newEntry, hours: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder={newEntry.startTime && newEntry.endTime ? calculateHoursFromTimes(newEntry.startTime, newEntry.endTime).toFixed(2) : "0.00"}
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Description
                          </label>
                          <textarea
                            value={newEntry.description}
                            onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="What did you work on?"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleCreateTimeEntry}
                        className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors font-medium"
                      >
                        Add Entry
                      </button>
                    </div>
                    )}

                    {/* Time Entries List - Last 8 days */}
                    <div>
                      <div className="mb-4">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                          My Time Entries
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Showing entries from the last 8 days
                        </p>
                      </div>

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
                          <thead className="bg-gray-50 dark:bg-gray-700">
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
                              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                Actions
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
                                      {new Date(entry.WorkDate).toLocaleDateString()}
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
                                      {parseFloat(entry.Hours as any).toFixed(2)}h
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                      {entry.Description || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                      {getApprovalBadge(entry.ApprovalStatus)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                      {entry.ApprovalStatus === 'approved' && !entry.IsHobby ? (
                                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">Locked</span>
                                      ) : permissions?.canManageTimeEntries ? (
                                        <>
                                          <button
                                            onClick={() => handleEditTimeEntry(entry)}
                                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3"
                                          >
                                            Edit
                                          </button>
                                          <button
                                            onClick={() => handleDeleteTimeEntry(entry.Id)}
                                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                          >
                                            Delete
                                          </button>
                                        </>
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
                              {recentEntries.reduce((sum, entry) => sum + parseFloat(entry.Hours as any), 0).toFixed(2)}h
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
                  <div className="p-6">
                    {/* Week Navigation */}
                    <div className="mb-6 flex items-center justify-between">
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
                          <div className="overflow-x-auto mb-4">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
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
                                                : isApproved
                                                ? 'bg-green-50 dark:bg-green-900/20'
                                                : ''
                                            }`}
                                            title={hasMultipleEntries ? `${entries.length} entries exist for this day. Use Daily tab to edit.` : isApproved ? 'This entry has been approved and cannot be edited.' : ''}
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
                                            ) : isApproved ? (
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
                                        {totalHours.toFixed(2)}h
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
                                                : isApproved
                                                ? 'bg-green-50 dark:bg-green-900/20'
                                                : 'bg-purple-50/50 dark:bg-purple-900/10'
                                            }`}
                                            title={hasMultipleEntries ? `${entries.length} entries exist for this day. Use Daily tab to edit.` : isApproved ? 'This entry has been approved and cannot be edited.' : ''}
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
                                            ) : isApproved ? (
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
                                        {totalHours.toFixed(2)}h
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
                                    {tasksForWeek.reduce((total, task) => {
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
                                    }, 0).toFixed(2)}h
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
                              (e.Description || '').replace(/"/g, '""'),
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
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
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
                          {/* Summary Cards */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                              <div className="text-sm text-blue-600 dark:text-blue-400">Total Hours</div>
                              <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{totalFilteredHours.toFixed(2)}h</div>
                            </div>
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                              <div className="text-sm text-green-600 dark:text-green-400">Total Entries</div>
                              <div className="text-2xl font-bold text-green-700 dark:text-green-300">{filteredEntries.length}</div>
                            </div>
                            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                              <div className="text-sm text-purple-600 dark:text-purple-400">Days Worked</div>
                              <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{uniqueDays}</div>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-50 dark:bg-gray-700">
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
                                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredEntries.length === 0 ? (
                                  <tr>
                                    <td colSpan={10} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                      No time entries found for the selected filters.
                                    </td>
                                  </tr>
                                ) : groupByDays ? (
                                  (() => {
                                    // Group entries by date, preserving individual entries
                                    const groupedByDate: { [date: string]: { entries: TimeEntry[], totalHours: number } } = {};
                                    filteredEntries.forEach(entry => {
                                      const date = normalizeDateString(entry.WorkDate);
                                      if (!groupedByDate[date]) {
                                        groupedByDate[date] = { entries: [], totalHours: 0 };
                                      }
                                      groupedByDate[date].entries.push(entry);
                                      groupedByDate[date].totalHours += parseFloat(entry.Hours as any);
                                    });

                                    // Sort dates descending
                                    const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

                                    return sortedDates.flatMap(date => {
                                      const group = groupedByDate[date];
                                      const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                                      return [
                                        // Day header row
                                        <tr key={`header-${date}`} className="bg-gray-100 dark:bg-gray-700">
                                          <td colSpan={10} className="px-6 py-2">
                                            <div className="flex items-center justify-between">
                                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                                📅 {dayLabel}
                                              </span>
                                              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                                {group.totalHours.toFixed(2)}h total
                                              </span>
                                            </div>
                                          </td>
                                        </tr>,
                                        // Individual entry rows for that day
                                        ...group.entries.map(entry => (
                                          <tr key={entry.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                              {new Date(normalizeDateString(entry.WorkDate) + 'T12:00:00').toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                              {entry.CustomerName || '-'}
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                              {entry.ProjectName}
                                            </td>
                                            <td className="px-6 py-3 text-sm text-gray-900 dark:text-white">
                                              {entry.TaskName}
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                              {entry.StartTime || '-'}
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                              {entry.EndTime || '-'}
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">
                                              {parseFloat(entry.Hours as any).toFixed(2)}h
                                            </td>
                                            <td className="px-6 py-3 text-sm text-gray-600 dark:text-gray-400">
                                              {entry.Description || '-'}
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap text-sm">
                                              {getApprovalBadge(entry.ApprovalStatus)}
                                            </td>
                                            <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
                                              {entry.ApprovalStatus === 'approved' && !entry.IsHobby ? (
                                                <span className="text-xs text-gray-400 dark:text-gray-500 italic">Locked</span>
                                              ) : permissions?.canManageTimeEntries ? (
                                                <>
                                                  <button
                                                    onClick={() => handleEditTimeEntry(entry)}
                                                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3"
                                                  >
                                                    Edit
                                                  </button>
                                                  <button
                                                    onClick={() => handleDeleteTimeEntry(entry.Id)}
                                                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                                  >
                                                    Delete
                                                  </button>
                                                </>
                                              ) : null}
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
                                        {parseFloat(entry.Hours as any).toFixed(2)}h
                                      </td>
                                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                        {entry.Description || '-'}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {getApprovalBadge(entry.ApprovalStatus)}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {entry.ApprovalStatus === 'approved' && !entry.IsHobby ? (
                                          <span className="text-xs text-gray-400 dark:text-gray-500 italic">Locked</span>
                                        ) : permissions?.canManageTimeEntries ? (
                                          <>
                                            <button
                                              onClick={() => handleEditTimeEntry(entry)}
                                              className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3"
                                            >
                                              Edit
                                            </button>
                                            <button
                                              onClick={() => handleDeleteTimeEntry(entry.Id)}
                                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                            >
                                              Delete
                                            </button>
                                          </>
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
                                  {totalFilteredHours.toFixed(2)}h
                                </span>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Edit Time Entry Modal */}
        {showEditModal && editingEntry && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time</label>
                      <input
                        type="time"
                        value={editEntry.startTime}
                        onChange={(e) => setEditEntry({ ...editEntry, startTime: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</label>
                      <input
                        type="time"
                        value={editEntry.endTime}
                        onChange={(e) => setEditEntry({ ...editEntry, endTime: e.target.value })}
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
                    <input
                      type="text"
                      value={editEntry.description}
                      onChange={(e) => setEditEntry({ ...editEntry, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
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

        {/* Confirm Modal */}
        {modalMessage && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-start mb-4">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      {modalMessage.title}
                    </h3>
                    <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                      {modalMessage.message}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleModalConfirm}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </CustomerUserGuard>
  );
}
