'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usersApi, User } from '@/lib/api/users';
import { tasksApi, Task } from '@/lib/api/tasks';
import Navbar from '@/components/Navbar';
import dynamic from 'next/dynamic';
import CalendarTabComponent from './CalendarTab';

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
  CreatedAt: string;
  StartTime?: string;
  EndTime?: string;
}

// CallRecord type for calendar
interface CallRecordForCalendar {
  Id: number;
  CallDate: string;
  StartTime: string;
  DurationMinutes: number;
  CallType: string;
  Participants: string;
  Subject: string;
}

// Define TaskAllocation type for calendar
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

// Define the CalendarTab props type
interface CalendarTabProps {
  tasks: TaskWithProject[];
  timeEntries: TimeEntry[];
  callRecords: CallRecordForCalendar[];
  taskAllocations: TaskAllocationForCalendar[];
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

// Use CalendarTab with dynamic import wrapper
const CalendarTab = dynamic(
  () => Promise.resolve(CalendarTabComponent),
  { ssr: false, loading: () => <div className="text-center py-8">Loading calendar...</div> }
);

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="text-gray-600 dark:text-gray-400">Loading dashboard...</div></div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { user, isLoading, token, isCustomerUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'overview' | 'calendar' | 'analytics'>(
    (tabParam as 'overview' | 'calendar' | 'analytics') || 'overview'
  );
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
  const [workStartTimes, setWorkStartTimes] = useState({
    monday: '09:00',
    tuesday: '09:00',
    wednesday: '09:00',
    thursday: '09:00',
    friday: '09:00',
    saturday: '09:00',
    sunday: '09:00',
  });
  const [lunchTime, setLunchTime] = useState('12:00');
  const [lunchDuration, setLunchDuration] = useState(60); // minutes
  const [hobbyStartTimes, setHobbyStartTimes] = useState({
    monday: '19:00',
    tuesday: '19:00',
    wednesday: '19:00',
    thursday: '19:00',
    friday: '19:00',
    saturday: '10:00',
    sunday: '10:00',
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
  const [modalMessage, setModalMessage] = useState<{
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);
  const [summaryStats, setSummaryStats] = useState({
    totalProjects: 0,
    totalTasks: 0,
    myTasks: 0,
    hoursThisWeek: 0,
    hoursThisMonth: 0,
    allocatedToday: 0,
    allocatedThisWeek: 0,
    estimatedHours: 0,
    workedHours: 0,
    overdueTasks: 0,
    // Normal projects
    normalEstimatedHours: 0,
    normalWorkedHours: 0,
    normalAllocatedThisWeek: 0,
    normalHoursThisWeek: 0,
    // Hobby projects
    hobbyEstimatedHours: 0,
    hobbyWorkedHours: 0,
    hobbyAllocatedThisWeek: 0,
    hobbyHoursThisWeek: 0,
    tasksToday: [] as any[],
    myTickets: 0,
    openTickets: 0,
    unresolvedTickets: 0,
  });
  const [pendingTasks, setPendingTasks] = useState<TaskWithProject[]>([]);
  const [globalStats, setGlobalStats] = useState<{
    organizations: { total: number };
    customers: { total: number };
    users: { total: number; admins: number; regular: number; customerUsers: number };
    projects: { total: number; active: number; completed: number };
    tasks: { total: number; completed: number; inProgress: number; overdue: number; unplanned: number };
    tickets: { total: number; open: number; inProgress: number; waitingResponse: number; resolved: number; closed: number; unresolvedCount: number };
    hours: { totalEstimated: number; totalWorked: number; thisWeek: number; thisMonth: number; totalEstimatedHobby: number; totalWorkedHobby: number; thisWeekHobby: number; thisMonthHobby: number };
    topProjects: { id: number; name: string; organization: string; hours: number }[];
    topUsers: { id: number; name: string; hours: number }[];
  } | null>(null);
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Customer portal state
  const [portalData, setPortalData] = useState<{
    customer: { Id: number; Name: string; Email: string | null; Phone: string | null; ContactPerson: string | null; ContactEmail: string | null; Website: string | null };
    stats: { total: number; open: number; closed: number; inProgress: number; urgent: number };
    tickets: { Id: number; Title: string; Category: string; CreatedAt: string; UpdatedAt: string; StatusName: string; StatusColor: string; IsClosed: number; PriorityName: string; PriorityColor: string; ProjectName: string | null; AssigneeName: string | null; AssigneeFirst: string | null; AssigneeLast: string | null }[];
    projects: { Id: number; ProjectName: string; Description: string | null; StatusLabel: string | null; StatusColor: string | null; OrganizationName: string; TotalTasks: number; CompletedTasks: number; StartDate: string | null; EndDate: string | null }[];
  } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');
  
  // Call Records state (for calendar display)
  const [callRecords, setCallRecords] = useState<CallRecordForCalendar[]>([]);

  // Task Allocations state (for calendar display with times)
  const [taskAllocations, setTaskAllocations] = useState<TaskAllocationForCalendar[]>([]);

  // Recurring Allocations state (for calendar display)
  const [recurringAllocations, setRecurringAllocations] = useState<any[]>([]);

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
    if (!isLoading && !user) {
      router.push('/login');
    } else if (user && token) {
      if (isCustomerUser) {
        loadPortalData();
      } else {
        loadUserProfile();
        loadSummaryStats();
        loadPendingTasks();
        loadGlobalStats();
        if (activeTab === 'calendar') {
          loadMyTasks();
          loadTimeEntries();
          loadCallRecords();
          loadTaskAllocations();
          loadRecurringAllocations();
        }
      }
    }
  }, [user, isLoading, router, token, activeTab]);

  // Update active tab when URL param changes
  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam as 'overview' | 'calendar' | 'analytics');
    }
  }, [tabParam]);

  // Helper function to normalize date for comparison
  const normalizeDateString = (dateValue: any): string => {
    if (dateValue instanceof Date) {
      return dateValue.toISOString().split('T')[0];
    }
    return String(dateValue).split('T')[0];
  };

  const loadPortalData = async () => {
    setPortalLoading(true);
    setPortalError('');
    try {
      const res = await fetch(`${getApiUrl()}/api/portal/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || 'Failed to load portal');
      }
      setPortalData(await res.json());
    } catch (err: any) {
      setPortalError(err.message || 'Failed to load portal data');
    } finally {
      setPortalLoading(false);
    }
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
      setWorkStartTimes({
        monday: response.user.WorkStartMonday || '09:00',
        tuesday: response.user.WorkStartTuesday || '09:00',
        wednesday: response.user.WorkStartWednesday || '09:00',
        thursday: response.user.WorkStartThursday || '09:00',
        friday: response.user.WorkStartFriday || '09:00',
        saturday: response.user.WorkStartSaturday || '09:00',
        sunday: response.user.WorkStartSunday || '09:00',
      });
      setLunchTime(response.user.LunchTime || '12:00');
      setLunchDuration(response.user.LunchDuration || 60);
      setHobbyStartTimes({
        monday: response.user.HobbyStartMonday || '19:00',
        tuesday: response.user.HobbyStartTuesday || '19:00',
        wednesday: response.user.HobbyStartWednesday || '19:00',
        thursday: response.user.HobbyStartThursday || '19:00',
        friday: response.user.HobbyStartFriday || '19:00',
        saturday: response.user.HobbyStartSaturday || '10:00',
        sunday: response.user.HobbyStartSunday || '10:00',
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

  const loadSummaryStats = async () => {
    try {
      // Load projects count
      const projectsResponse = await fetch(
        `${getApiUrl()}/api/projects`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      let totalProjects = 0;
      if (projectsResponse.ok) {
        const projectsData = await projectsResponse.json();
        totalProjects = projectsData.projects?.length || 0;
      }

      // Load my tasks
      const tasksResponse = await fetch(
        `${getApiUrl()}/api/tasks/my-tasks`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      let myTasksCount = 0;
      let totalTasks = 0;
      let estimatedHours = 0;
      let normalEstimatedHours = 0;
      let hobbyEstimatedHours = 0;
      let overdueTasks = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json();
        const tasks = tasksData.tasks || [];
        myTasksCount = tasks.length;
        totalTasks = myTasksCount;
        
        // Identify tasks with children (parent tasks)
        const taskIdsWithChildren = new Set(tasks.filter((t: any) => t.ParentTaskId).map((t: any) => t.ParentTaskId));
        // Get only leaf tasks (tasks without children)
        const leafTasks = tasks.filter((t: any) => !taskIdsWithChildren.has(t.Id));
        
        // Calculate estimated hours only from leaf tasks and overdue tasks
        leafTasks.forEach((task: any) => {
          const hours = Number(task.EstimatedHours || 0);
          estimatedHours += hours;
          
          // Separate by project type
          if (task.IsHobby) {
            hobbyEstimatedHours += hours;
          } else {
            normalEstimatedHours += hours;
          }
        });
        
        // Check overdue tasks (all tasks, not just leaf)
        tasks.forEach((task: any) => {
          if (task.DueDate && 
              !task.StatusIsClosed &&
              !task.StatusIsCancelled) {
            const endDate = new Date(task.DueDate);
            endDate.setHours(0, 0, 0, 0);
            if (endDate < today) {
              overdueTasks++;
            }
          }
        });
      }

      // Load time entries for this week and month
      const entriesResponse = await fetch(
        `${getApiUrl()}/api/time-entries/my-entries`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      let hoursThisWeek = 0;
      let hoursThisMonth = 0;
      let workedHours = 0;
      let normalWorkedHours = 0;
      let hobbyWorkedHours = 0;
      let normalHoursThisWeek = 0;
      let hobbyHoursThisWeek = 0;
      
      if (entriesResponse.ok) {
        const entriesData = await entriesResponse.json();
        const entries = entriesData.entries || [];
        
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
        startOfWeek.setHours(0, 0, 0, 0);
        
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        entries.forEach((entry: any) => {
          const entryDate = new Date(entry.WorkDate);
          const hours = parseFloat(entry.Hours || 0);
          const isHobby = entry.IsHobby || false;
          
          workedHours += hours;
          
          if (isHobby) {
            hobbyWorkedHours += hours;
          } else {
            normalWorkedHours += hours;
          }
          
          if (entryDate >= startOfWeek) {
            hoursThisWeek += hours;
            if (isHobby) {
              hobbyHoursThisWeek += hours;
            } else {
              normalHoursThisWeek += hours;
            }
          }
          
          if (entryDate >= startOfMonth) {
            hoursThisMonth += hours;
          }
        });
      }

      // Load task allocations for today and this week
      const allocationsResponse = await fetch(
        `${getApiUrl()}/api/task-allocations/my-allocations`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      let allocatedToday = 0;
      let allocatedThisWeek = 0;
      let normalAllocatedThisWeek = 0;
      let hobbyAllocatedThisWeek = 0;
      const tasksToday: any[] = [];
      
      if (allocationsResponse.ok) {
        const allocationsData = await allocationsResponse.json();
        const allocations = allocationsData.allocations || [];
        
        const todayStr = today.toISOString().split('T')[0];
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        
        allocations.forEach((alloc: any) => {
          const allocDate = new Date(alloc.AllocationDate);
          const allocDateStr = allocDate.toISOString().split('T')[0];
          const hours = parseFloat(alloc.AllocatedHours || 0);
          const isHobby = alloc.IsHobby || false;
          
          if (allocDateStr === todayStr) {
            allocatedToday += hours;
            tasksToday.push({
              taskName: alloc.TaskName,
              projectName: alloc.ProjectName,
              hours: hours,
              startTime: alloc.StartTime,
              endTime: alloc.EndTime,
            });
          }
          
          if (allocDate >= startOfWeek && allocDate <= endOfWeek) {
            allocatedThisWeek += hours;
            if (isHobby) {
              hobbyAllocatedThisWeek += hours;
            } else {
              normalAllocatedThisWeek += hours;
            }
          }
        });
      }

      setSummaryStats({
        totalProjects,
        totalTasks,
        myTasks: myTasksCount,
        hoursThisWeek,
        hoursThisMonth,
        allocatedToday,
        allocatedThisWeek,
        estimatedHours,
        workedHours,
        overdueTasks,
        tasksToday,
        myTickets: 0,
        openTickets: 0,
        unresolvedTickets: 0,
        normalEstimatedHours,
        normalWorkedHours,
        normalAllocatedThisWeek,
        normalHoursThisWeek,
        hobbyEstimatedHours,
        hobbyWorkedHours,
        hobbyAllocatedThisWeek,
        hobbyHoursThisWeek,
      });

      // Load my tickets statistics
      const ticketsResponse = await fetch(
        `${getApiUrl()}/api/tickets/my-tickets`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (ticketsResponse.ok) {
        const ticketsData = await ticketsResponse.json();
        const tickets = ticketsData.tickets || [];
        
        const openTickets = tickets.filter((t: any) => t.Status === 'Open').length;
        const activeTickets = tickets.filter((t: any) => 
          t.Status !== 'Resolved' && 
          t.Status !== 'Closed' && 
          t.Status !== 'Waiting Response'
        ).length;
        
        setSummaryStats(prev => ({
          ...prev,
          myTickets: tickets.length,
          openTickets,
          unresolvedTickets: activeTickets,
        }));
      }
    } catch (err) {
      console.error('Failed to load summary stats:', err);
    }
  };

  const loadGlobalStats = async () => {
    if (!user?.isAdmin) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/statistics/global`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setGlobalStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to load global stats:', err);
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
        setTimeEntries(data.entries);
      }
    } catch (err) {
      console.error('Failed to load time entries:', err);
    }
  };

  const loadMyTasks = async () => {
    try {
      // Get all tasks assigned to current user across all projects
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

  const loadPendingTasks = async () => {
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
        const tasks = data.tasks || [];
        // Filter for pending tasks (not closed or cancelled) and sort by planned start date
        const pending = tasks
          .filter((task: TaskWithProject) => 
            !task.StatusIsClosed && !task.StatusIsCancelled
          )
          .sort((a: TaskWithProject, b: TaskWithProject) => {
            const dateA = a.PlannedStartDate ? new Date(a.PlannedStartDate).getTime() : Infinity;
            const dateB = b.PlannedStartDate ? new Date(b.PlannedStartDate).getTime() : Infinity;
            return dateA - dateB;
          });
        setPendingTasks(pending);
      }
    } catch (err) {
      console.error('Failed to load pending tasks:', err);
    }
  };

  const loadCallRecords = async () => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/call-records`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setCallRecords(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load call records:', err);
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

  const loadRecurringAllocations = async () => {
    if (!user) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/recurring-allocations/occurrences/user/${user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setRecurringAllocations(data.occurrences || []);
      }
    } catch (err) {
      console.error('Failed to load recurring allocations:', err);
    }
  };
  
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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Customer User View */}
          {isCustomerUser ? (
            portalLoading ? (
              <div className="flex items-center justify-center py-24">
                <div className="text-gray-500 dark:text-gray-400">Loading…</div>
              </div>
            ) : portalError ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <p className="text-red-500 font-medium">{portalError}</p>
                <button onClick={loadPortalData} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Retry</button>
              </div>
            ) : portalData ? (
              <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">🏢 {portalData.customer.Name}</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                      {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                      {portalData.customer.ContactPerson && <span>👤 {portalData.customer.ContactPerson}</span>}
                      {portalData.customer.ContactEmail && <a href={`mailto:${portalData.customer.ContactEmail}`} className="hover:text-blue-600">{portalData.customer.ContactEmail}</a>}
                      {portalData.customer.Phone && <span>📞 {portalData.customer.Phone}</span>}
                      {portalData.customer.Website && <a href={portalData.customer.Website} target="_blank" rel="noreferrer" className="hover:text-blue-600">🔗 {portalData.customer.Website}</a>}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[
                    { label: 'Total Tickets', value: portalData.stats.total, color: 'text-gray-900 dark:text-white', bg: 'bg-white dark:bg-gray-800' },
                    { label: 'Open', value: portalData.stats.open, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
                    { label: 'In Progress', value: portalData.stats.inProgress, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/30' },
                    { label: 'Resolved', value: portalData.stats.closed, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30' },
                    { label: 'Urgent', value: portalData.stats.urgent, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700`}>
                      <div className={`text-2xl font-bold ${s.color}`}>{Number(s.value)}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Projects */}
                {portalData.projects.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">📁 Your Projects</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {portalData.projects.map(project => {
                        const pct = project.TotalTasks > 0 ? Math.round((Number(project.CompletedTasks) / Number(project.TotalTasks)) * 100) : 0;
                        return (
                          <div key={project.Id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium text-gray-900 dark:text-white leading-tight">{project.ProjectName}</div>
                              {project.StatusLabel && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: `${project.StatusColor || '#888'}22`, color: project.StatusColor || '#888' }}>
                                  {project.StatusLabel}
                                </span>
                              )}
                            </div>
                            {project.Description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{project.Description}</p>}
                            <div className="mt-3">
                              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                <span>{Number(project.CompletedTasks)} / {Number(project.TotalTasks)} tasks done</span>
                                <span>{pct}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className={`h-1.5 rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            {(project.StartDate || project.EndDate) && (
                              <div className="text-xs text-gray-400 mt-2">📅 {project.StartDate ? String(project.StartDate).split('T')[0] : '?'} — {project.EndDate ? String(project.EndDate).split('T')[0] : '?'}</div>
                            )}
                            <div className="text-xs text-gray-400 mt-1">{project.OrganizationName}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Tickets */}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">🎫 Your Tickets</h2>
                  {portalData.tickets.length === 0 ? (
                    <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
                      <p className="text-gray-500 dark:text-gray-400">No tickets yet.</p>
                    </div>
                  ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                          <tr>
                            <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">#</th>
                            <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Title</th>
                            <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium hidden md:table-cell">Category</th>
                            <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                            <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium hidden lg:table-cell">Priority</th>
                            <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-400 font-medium hidden md:table-cell">Project</th>
                            <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-400 font-medium hidden sm:table-cell">Updated</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {portalData.tickets.map(ticket => (
                            <tr key={ticket.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => router.push(`/tickets/${ticket.Id}`)}>
                              <td className="px-4 py-3 text-gray-400 dark:text-gray-500 font-mono text-xs">#{ticket.Id}</td>
                              <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-xs"><span className="line-clamp-1">{ticket.Title}</span></td>
                              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">{ticket.Category}</td>
                              <td className="px-4 py-3">
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${ticket.StatusColor || '#888'}22`, color: ticket.StatusColor || '#888' }}>{ticket.StatusName}</span>
                              </td>
                              <td className="px-4 py-3 hidden lg:table-cell">
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${ticket.PriorityColor || '#888'}22`, color: ticket.PriorityColor || '#888' }}>{ticket.PriorityName}</span>
                              </td>
                              <td className="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">{ticket.ProjectName || '—'}</td>
                              <td className="px-4 py-3 text-right text-xs text-gray-400 hidden sm:table-cell">{new Date(ticket.UpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : null
          ) : (
            <>
              {/* Dashboard Tabs - Regular Users Only */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
                <div className="border-b border-gray-200 dark:border-gray-700">
                  <nav className="flex space-x-8 px-6">
                    <button
                      onClick={() => {
                        setActiveTab('overview');
                        window.history.pushState({}, '', '/dashboard');
                      }}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'overview'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      🏠 Overview
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('calendar');
                        window.history.pushState({}, '', '/dashboard?tab=calendar');
                      }}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'calendar'
                          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                      }`}
                    >
                      📅 Calendar
                    </button>
                    {!!user?.isAdmin && (
                      <button
                        onClick={() => {
                          setActiveTab('analytics');
                          window.history.pushState({}, '', '/dashboard?tab=analytics');
                        }}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                          activeTab === 'analytics'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                        }`}
                      >
                        📊 Analytics
                      </button>
                    )}
                  </nav>
                </div>
              </div>

              {/* Overview Tab */}
              {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Welcome Header */}
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">
                      Welcome back, {user?.firstName || user?.username}!
                    </h2>
                    <p className="text-blue-100 mt-1">
                      {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                  {summaryStats.overdueTasks > 0 && (
                    <div className="bg-red-500 px-4 py-2 rounded-lg">
                      <span className="text-sm font-medium">⚠️ {summaryStats.overdueTasks} overdue task{summaryStats.overdueTasks > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Today's Schedule */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="text-2xl">📅</span> Today&apos;s Schedule
                </h3>
                {summaryStats.tasksToday.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400">No tasks scheduled for today</p>
                    <button
                      onClick={() => router.push('/planning')}
                      className="mt-3 text-blue-600 dark:text-blue-400 hover:underline text-sm"
                    >
                      Go to Planning →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {summaryStats.tasksToday.map((task, idx) => (
                      <div 
                        key={idx}
                        className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-lg">
                            <span className="font-medium">{task.startTime || '—'}</span>
                            <span className="text-xs">to</span>
                            <span className="font-medium">{task.endTime || '—'}</span>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-white">{task.taskName}</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{task.projectName}</p>
                          </div>
                        </div>
                        <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{Number(task.hours).toFixed(1)}h</span>
                      </div>
                    ))}
                    <div className="pt-3 border-t dark:border-gray-700 flex justify-between items-center">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Total allocated today</span>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">{summaryStats.allocatedToday.toFixed(1)}h</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Summary Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 border-l-4 border-blue-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Projects</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summaryStats.totalProjects}</p>
                    </div>
                    <div className="text-3xl text-blue-500 opacity-60">📁</div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 border-l-4 border-green-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">My Tasks</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summaryStats.myTasks}</p>
                      {summaryStats.overdueTasks > 0 && (
                        <p className="text-xs text-red-500 dark:text-red-400 mt-1">{summaryStats.overdueTasks} overdue</p>
                      )}
                    </div>
                    <div className="text-3xl text-green-500 opacity-60">✓</div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 border-l-4 border-indigo-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">My Tickets</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{Number(summaryStats.myTickets) || 0}</p>
                      {summaryStats.unresolvedTickets > 0 && (
                        <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">{Number(summaryStats.unresolvedTickets) || 0} active</p>
                      )}
                    </div>
                    <div className="text-3xl text-indigo-500 opacity-60">🎫</div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 border-l-4 border-purple-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Hours This Week</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summaryStats.hoursThisWeek.toFixed(1)}h</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Allocated: {summaryStats.allocatedThisWeek.toFixed(1)}h</p>
                    </div>
                    <div className="text-3xl text-purple-500 opacity-60">⏱️</div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 border-l-4 border-orange-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Hours This Month</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summaryStats.hoursThisMonth.toFixed(1)}h</p>
                    </div>
                    <div className="text-3xl text-orange-500 opacity-60">📊</div>
                  </div>
                </div>
              </div>

              {/* Progress Overview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Overall Progress */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">📈 Work Progress</h3>
                  <div className="space-y-4">
                    {/* Normal Projects */}
                    {summaryStats.normalEstimatedHours > 0 && (
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-600 dark:text-gray-400">💼 Work Projects</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {summaryStats.normalWorkedHours.toFixed(0)}h / {summaryStats.normalEstimatedHours.toFixed(0)}h
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                          <div 
                            className={`h-3 rounded-full transition-all ${
                              summaryStats.normalEstimatedHours > 0 && summaryStats.normalWorkedHours > summaryStats.normalEstimatedHours
                                ? 'bg-red-500'
                                : 'bg-green-500'
                            }`}
                            style={{ 
                              width: `${Math.min(100, summaryStats.normalEstimatedHours > 0 ? (summaryStats.normalWorkedHours / summaryStats.normalEstimatedHours) * 100 : 0)}%` 
                            }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {summaryStats.normalEstimatedHours > 0 
                            ? `${Math.round((summaryStats.normalWorkedHours / summaryStats.normalEstimatedHours) * 100)}% of estimated hours`
                            : 'No estimated hours set'}
                        </p>
                      </div>
                    )}
                    
                    {/* Hobby Projects */}
                    {summaryStats.hobbyEstimatedHours > 0 && (
                      <div className={summaryStats.normalEstimatedHours > 0 ? 'pt-4 border-t dark:border-gray-700' : ''}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-600 dark:text-gray-400">🎮 Hobby Projects</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {summaryStats.hobbyWorkedHours.toFixed(0)}h / {summaryStats.hobbyEstimatedHours.toFixed(0)}h
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                          <div 
                            className={`h-3 rounded-full transition-all ${
                              summaryStats.hobbyEstimatedHours > 0 && summaryStats.hobbyWorkedHours > summaryStats.hobbyEstimatedHours
                                ? 'bg-red-500'
                                : 'bg-purple-500'
                            }`}
                            style={{ 
                              width: `${Math.min(100, summaryStats.hobbyEstimatedHours > 0 ? (summaryStats.hobbyWorkedHours / summaryStats.hobbyEstimatedHours) * 100 : 0)}%` 
                            }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {summaryStats.hobbyEstimatedHours > 0 
                            ? `${Math.round((summaryStats.hobbyWorkedHours / summaryStats.hobbyEstimatedHours) * 100)}% of estimated hours`
                            : 'No estimated hours set'}
                        </p>
                      </div>
                    )}
                    
                    <div className="pt-4 border-t dark:border-gray-700">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Weekly Progress</h4>
                      
                      {/* Normal Weekly Progress */}
                      {summaryStats.normalAllocatedThisWeek > 0 && (
                        <div className="mb-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-600 dark:text-gray-400">💼 Work</span>
                            <span className="text-xs font-medium text-gray-900 dark:text-white">
                              {summaryStats.normalHoursThisWeek.toFixed(1)}h / {summaryStats.normalAllocatedThisWeek.toFixed(1)}h
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full transition-all"
                              style={{ 
                                width: `${Math.min(100, summaryStats.normalAllocatedThisWeek > 0 ? (summaryStats.normalHoursThisWeek / summaryStats.normalAllocatedThisWeek) * 100 : 0)}%` 
                              }}
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Hobby Weekly Progress */}
                      {summaryStats.hobbyAllocatedThisWeek > 0 && (
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-600 dark:text-gray-400">🎮 Hobby</span>
                            <span className="text-xs font-medium text-gray-900 dark:text-white">
                              {summaryStats.hobbyHoursThisWeek.toFixed(1)}h / {summaryStats.hobbyAllocatedThisWeek.toFixed(1)}h
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div 
                              className="bg-purple-500 h-2 rounded-full transition-all"
                              style={{ 
                                width: `${Math.min(100, summaryStats.hobbyAllocatedThisWeek > 0 ? (summaryStats.hobbyHoursThisWeek / summaryStats.hobbyAllocatedThisWeek) * 100 : 0)}%` 
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">⚡ Quick Actions</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => router.push('/timesheet')}
                      className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <span className="text-2xl">⏱️</span>
                      <span className="font-medium text-gray-900 dark:text-white">Log Time</span>
                    </button>
                    <button
                      onClick={() => router.push('/planning')}
                      className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-green-500 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                    >
                      <span className="text-2xl">📅</span>
                      <span className="font-medium text-gray-900 dark:text-white">Planning</span>
                    </button>
                    <button
                      onClick={() => router.push('/projects')}
                      className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                    >
                      <span className="text-2xl">📁</span>
                      <span className="font-medium text-gray-900 dark:text-white">Projects</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('calendar')}
                      className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-orange-500 dark:hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                    >
                      <span className="text-2xl">🗓️</span>
                      <span className="font-medium text-gray-900 dark:text-white">Calendar</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Pending Tasks */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <span className="text-2xl">📋</span> My Pending Tasks
                  </h3>
                  <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300">
                    {pendingTasks.length} task{pendingTasks.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {pendingTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400">🎉 No pending tasks! Great job!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingTasks.slice(0, 5).map(task => {
                      const isOverdue = task.DueDate && new Date(task.DueDate) < new Date();
                      return (
                        <div 
                          key={task.Id}
                          className={`border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                            isOverdue 
                              ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10' 
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                          onClick={() => router.push(`/projects/${task.ProjectId}`)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-gray-900 dark:text-white">
                                  {task.TaskName}
                                </h4>
                                {isOverdue && (
                                  <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full">
                                    Overdue
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {task.ProjectName}
                              </p>
                              <div className="flex items-center gap-3 mt-2 flex-wrap">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                                  style={task.PriorityColor ? {
                                    backgroundColor: task.PriorityColor + '20',
                                    color: task.PriorityColor
                                  } : undefined}
                                >
                                  {task.PriorityName || 'Normal'}
                                </span>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                                  style={task.StatusColor ? {
                                    backgroundColor: task.StatusColor + '20',
                                    color: task.StatusColor
                                  } : undefined}
                                >
                                  {task.StatusName || 'Unknown'}
                                </span>
                                {task.DueDate && (
                                  <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
                                    📅 Due: {new Date(task.DueDate).toLocaleDateString()}
                                  </span>
                                )}
                                {task.EstimatedHours && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    ⏱️ {task.EstimatedHours}h estimated
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-blue-600 dark:text-blue-400 text-xl">→</span>
                          </div>
                        </div>
                      );
                    })}
                    {pendingTasks.length > 5 && (
                      <div className="text-center pt-2">
                        <button
                          onClick={() => router.push('/projects')}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                        >
                          View all {pendingTasks.length} tasks →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Calendar Tab */}
          {activeTab === 'calendar' && (
            <CalendarTab
              tasks={myTasks}
              timeEntries={timeEntries}
              callRecords={callRecords}
              taskAllocations={taskAllocations}
              recurringAllocations={recurringAllocations}
              workStartTimes={workStartTimes}
              lunchTime={lunchTime}
              lunchDuration={lunchDuration}
              token={token || ''}
              onDataChanged={() => {
                loadTimeEntries();
                loadCallRecords();
                loadTaskAllocations();
                loadRecurringAllocations();
              }}
            />
          )}

              {/* Analytics Tab - Admin Only */}
              {activeTab === 'analytics' && user?.isAdmin && (
            <div className="space-y-6">
              {/* Analytics Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg shadow p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">📊 Analytics Dashboard</h2>
                    <p className="text-indigo-100 mt-1">Global statistics and KPIs across all organizations</p>
                  </div>
                  <button 
                    onClick={() => loadGlobalStats()}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
                  >
                    🔄 Refresh
                  </button>
                </div>
              </div>

              {!globalStats ? (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
                  <p className="text-gray-500 dark:text-gray-400">Loading analytics data...</p>
                </div>
              ) : (
                <>
                  {/* Main KPIs Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-indigo-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Organizations</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{globalStats.organizations.total}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-teal-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Customers</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{globalStats.customers.total}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-cyan-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Users</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{globalStats.users.total}</p>
                      <div className="flex gap-2 mt-1 text-xs">
                        <span className="text-purple-500">{globalStats.users.admins} admin</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-blue-500">{globalStats.users.regular} regular</span>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-blue-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Projects</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{globalStats.projects.total}</p>
                      <div className="flex gap-2 mt-1 text-xs">
                        <span className="text-green-500">{globalStats.projects.active} active</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-500">{globalStats.projects.completed} done</span>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-green-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tasks</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{globalStats.tasks.total}</p>
                      <div className="flex gap-2 mt-1 text-xs">
                        <span className="text-green-500">{globalStats.tasks.completed} done</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-blue-500">{globalStats.tasks.inProgress} active</span>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-indigo-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tickets</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{globalStats.tickets?.total || 0}</p>
                      <div className="flex gap-2 mt-1 text-xs">
                        <span className="text-green-500">{globalStats.tickets?.resolved || 0} resolved</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-indigo-500">{globalStats.tickets?.unresolvedCount || 0} unresolved</span>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-red-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Overdue</p>
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{globalStats.tasks.overdue}</p>
                      <p className="text-xs text-red-500 mt-1">tasks past due date</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-orange-500">
                      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Unplanned</p>
                      <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">{globalStats.tasks.unplanned}</p>
                      <p className="text-xs text-orange-500 mt-1">tasks not allocated</p>
                    </div>
                  </div>

                  {/* Tickets Overview */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">🎫 Tickets Overview</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Open</p>
                        <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">{globalStats.tickets?.open || 0}</p>
                      </div>
                      <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800">
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium uppercase tracking-wide">In Progress</p>
                        <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100 mt-1">{globalStats.tickets?.inProgress || 0}</p>
                      </div>
                      <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
                        <p className="text-xs text-orange-600 dark:text-orange-400 font-medium uppercase tracking-wide">Waiting Response</p>
                        <p className="text-2xl font-bold text-orange-900 dark:text-orange-100 mt-1">{globalStats.tickets?.waitingResponse || 0}</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                        <p className="text-xs text-green-600 dark:text-green-400 font-medium uppercase tracking-wide">Resolved</p>
                        <p className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">{globalStats.tickets?.resolved || 0}</p>
                      </div>
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/20 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-medium uppercase tracking-wide">Closed</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{globalStats.tickets?.closed || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* Hours Overview */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">⏱️ Hours Overview</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                        <p className="text-xs text-purple-600 dark:text-purple-400 font-medium uppercase tracking-wide">Total Estimated</p>
                        <div className="flex items-baseline gap-2 mt-2">
                          <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">{globalStats.hours.totalEstimated.toFixed(0)}h</p>
                          <p className="text-sm text-purple-700 dark:text-purple-300">+ {globalStats.hours.totalEstimatedHobby.toFixed(0)}h hobby</p>
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                        <p className="text-xs text-green-600 dark:text-green-400 font-medium uppercase tracking-wide">Total Worked</p>
                        <div className="flex items-baseline gap-2 mt-2">
                          <p className="text-3xl font-bold text-green-900 dark:text-green-100">{globalStats.hours.totalWorked.toFixed(0)}h</p>
                          <p className="text-sm text-green-700 dark:text-green-300">+ {globalStats.hours.totalWorkedHobby.toFixed(0)}h hobby</p>
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">This Week</p>
                        <div className="flex items-baseline gap-2 mt-2">
                          <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">{globalStats.hours.thisWeek.toFixed(1)}h</p>
                          <p className="text-sm text-blue-700 dark:text-blue-300">+ {globalStats.hours.thisWeekHobby.toFixed(1)}h hobby</p>
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                        <p className="text-xs text-orange-600 dark:text-orange-400 font-medium uppercase tracking-wide">This Month</p>
                        <div className="flex items-baseline gap-2 mt-2">
                          <p className="text-3xl font-bold text-orange-900 dark:text-orange-100">{globalStats.hours.thisMonth.toFixed(1)}h</p>
                          <p className="text-sm text-orange-700 dark:text-orange-300">+ {globalStats.hours.thisMonthHobby.toFixed(1)}h hobby</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="mt-6 pt-4 border-t dark:border-gray-700">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Global Progress</span>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {globalStats.hours.totalWorked.toFixed(0)}h / {globalStats.hours.totalEstimated.toFixed(0)}h
                            {globalStats.hours.totalEstimated > 0 && (
                              <span className="ml-2 text-gray-500">
                                ({Math.round((globalStats.hours.totalWorked / globalStats.hours.totalEstimated) * 100)}%)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Hobby: {globalStats.hours.totalWorkedHobby.toFixed(0)}h / {globalStats.hours.totalEstimatedHobby.toFixed(0)}h
                            {globalStats.hours.totalEstimatedHobby > 0 && (
                              <span className="ml-1">
                                ({Math.round((globalStats.hours.totalWorkedHobby / globalStats.hours.totalEstimatedHobby) * 100)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                        <div 
                          className={`h-4 rounded-full transition-all ${
                            globalStats.hours.totalEstimated > 0 && globalStats.hours.totalWorked > globalStats.hours.totalEstimated
                              ? 'bg-red-500'
                              : 'bg-gradient-to-r from-blue-500 to-purple-500'
                          }`}
                          style={{ 
                            width: `${Math.min(100, globalStats.hours.totalEstimated > 0 ? (globalStats.hours.totalWorked / globalStats.hours.totalEstimated) * 100 : 0)}%` 
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{globalStats.tasks.completed} of {globalStats.tasks.total} tasks completed</span>
                        <div className="text-right">
                          <div>
                            {globalStats.hours.totalEstimated > globalStats.hours.totalWorked 
                              ? `${(globalStats.hours.totalEstimated - globalStats.hours.totalWorked).toFixed(0)}h remaining`
                              : globalStats.hours.totalWorked > globalStats.hours.totalEstimated && globalStats.hours.totalEstimated > 0
                                ? `${(globalStats.hours.totalWorked - globalStats.hours.totalEstimated).toFixed(0)}h over estimate`
                                : ''}
                          </div>
                          <div className="text-gray-400">
                            {globalStats.hours.totalEstimatedHobby > globalStats.hours.totalWorkedHobby 
                              ? `${(globalStats.hours.totalEstimatedHobby - globalStats.hours.totalWorkedHobby).toFixed(0)}h hobby remaining`
                              : globalStats.hours.totalWorkedHobby > globalStats.hours.totalEstimatedHobby && globalStats.hours.totalEstimatedHobby > 0
                                ? `${(globalStats.hours.totalWorkedHobby - globalStats.hours.totalEstimatedHobby).toFixed(0)}h hobby over estimate`
                                : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Projects & Contributors */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Projects */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <span>🏆</span> Top Projects This Month
                      </h3>
                      {globalStats.topProjects.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No hours logged this month</p>
                      ) : (
                        <div className="space-y-4">
                          {globalStats.topProjects.map((project, idx) => (
                            <div key={project.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                  idx === 0 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                  idx === 1 ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
                                  idx === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                  'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                }`}>{idx + 1}</span>
                                <div>
                                  <p className="font-medium text-gray-900 dark:text-white">{project.name}</p>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">{project.organization}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{project.hours.toFixed(1)}h</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Top Contributors */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <span>👥</span> Top Contributors This Month
                      </h3>
                      {globalStats.topUsers.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No hours logged this month</p>
                      ) : (
                        <div className="space-y-4">
                          {globalStats.topUsers.map((u, idx) => (
                            <div key={u.id} className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                  idx === 0 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                  idx === 1 ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
                                  idx === 2 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                  'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                }`}>{idx + 1}</span>
                                <p className="font-medium text-gray-900 dark:text-white">{u.name}</p>
                              </div>
                              <div className="text-right">
                                <span className="text-lg font-bold text-green-600 dark:text-green-400">{u.hours.toFixed(1)}h</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Task Status Distribution */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">📋 Task Distribution</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">{globalStats.tasks.total}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Tasks</p>
                      </div>
                      <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400">{globalStats.tasks.completed}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Completed</p>
                        {globalStats.tasks.total > 0 && (
                          <p className="text-xs text-green-500 mt-1">
                            {Math.round((globalStats.tasks.completed / globalStats.tasks.total) * 100)}%
                          </p>
                        )}
                      </div>
                      <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{globalStats.tasks.inProgress}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">In Progress</p>
                        {globalStats.tasks.total > 0 && (
                          <p className="text-xs text-blue-500 mt-1">
                            {Math.round((globalStats.tasks.inProgress / globalStats.tasks.total) * 100)}%
                          </p>
                        )}
                      </div>
                      <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <p className="text-3xl font-bold text-red-600 dark:text-red-400">{globalStats.tasks.overdue}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Overdue</p>
                        {globalStats.tasks.total > 0 && (
                          <p className="text-xs text-red-500 mt-1">
                            {Math.round((globalStats.tasks.overdue / globalStats.tasks.total) * 100)}%
                          </p>
                        )}
                      </div>
                      <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                        <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{globalStats.tasks.unplanned}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Unplanned</p>
                        {globalStats.tasks.total > 0 && (
                          <p className="text-xs text-orange-500 mt-1">
                            {Math.round((globalStats.tasks.unplanned / globalStats.tasks.total) * 100)}%
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

            </>
          )}
        </div>

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
      </main>

    </div>
  );
}
