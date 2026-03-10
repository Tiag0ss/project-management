'use client';

import { getApiUrl } from '@/lib/api/config';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { tasksApi, Task } from '@/lib/api/tasks';
import { projectsApi, Project } from '@/lib/api/projects';
import { usersApi, User } from '@/lib/api/users';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { projectMilestonesApi, ProjectMilestone } from '@/lib/api/projectMilestones';
import Navbar from '@/components/Navbar';
import TaskDetailModal from '@/components/TaskDetailModal';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import SearchableSelect from '@/components/SearchableSelect';

// Week days constant - reused throughout the component
const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface PlannerHoliday {
  Id: number;
  Year: number;
  CountryCode: string;
  HolidayDate: string;
  HolidayName: string;
  Source: string;
  IsActive: number;
}

interface PlannerVacationDay {
  Id: number;
  UserId: number;
  VacationDate: string;
  Status: string;
  Notes?: string;
}

interface TimelineColumn {
  start: Date;
  end: Date;
  header: string;
  subheader: string;
  isWeekend: boolean;
  isMonthStart: boolean;
}

const renderMilestoneTypeSvg = (iconSvg: string | null | undefined, className: string = 'w-3 h-3') => {
  switch (iconSvg) {
    case 'target':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth="2" /><circle cx="12" cy="12" r="5" strokeWidth="2" /><circle cx="12" cy="12" r="1.5" strokeWidth="2" /></svg>;
    case 'rocket':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3l7 7-4 4-7-7 4-4zm-5 5l7 7-8 5 1-6-6 1 6-7z" /></svg>;
    case 'calendar':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" strokeWidth="2" /><path strokeLinecap="round" strokeWidth={2} d="M16 3v4M8 3v4M3 10h18" /></svg>;
    case 'star':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l2.8 5.7L21 9.6l-4.5 4.4 1.1 6.3L12 17.3 6.4 20.3 7.5 14 3 9.6l6.2-.9L12 3z" /></svg>;
    case 'trophy':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4h8v3a4 4 0 01-8 0V4zm-3 1h3v1a5 5 0 01-3 4V5zm14 0h-3v1a5 5 0 003 4V5zM12 14v4m-3 3h6" /></svg>;
    case 'check-circle':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth="2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12l2.5 2.5L16 9" /></svg>;
    case 'milestone':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 20V4m0 0l10 3-10 3m0-6v16" /></svg>;
    case 'flag':
    default:
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 20V4m0 0c4 0 4 2 8 2s4-2 8-2v8c-4 0-4 2-8 2s-4-2-8-2" /></svg>;
  }
};

export default function PlanningPage() {
  const { user, isLoading, token } = useAuth();
  const { permissions, isLoading: isLoadingPermissions } = usePermissions();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userOrganizations, setUserOrganizations] = useState<{ [userId: number]: number[] }>({});
  const [taskStatusValues, setTaskStatusValues] = useState<{ [orgId: number]: StatusValue[] }>({});
  const taskStatusValuesRef = useRef<{ [orgId: number]: StatusValue[] }>({});
  const allUsersRef = useRef<User[]>([]); // Full unfiltered user list
  const projectsRef = useRef<Project[]>([]);
  const [viewStartDate, setViewStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() -2);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [jiraIntegrationByOrg, setJiraIntegrationByOrg] = useState<Record<number, any>>({});
  const [taskAllocations, setTaskAllocations] = useState<any[]>([]);
  const [projectMilestones, setProjectMilestones] = useState<ProjectMilestone[]>([]);
  const [allAllocations, setAllAllocations] = useState<{Id?: number; TaskId: number; UserId: number; AllocationDate: string; AllocatedHours: number; IsHobby: number; IsManual?: number; StartTime?: string; EndTime?: string}[]>([]);
  const [childAllocations, setChildAllocations] = useState<{ParentTaskId: number; ChildTaskId: number; AllocationDate: string; AllocatedHours: number; Level: number}[]>([]);
  const [taskTimeEntries, setTaskTimeEntries] = useState<any[]>([]);
  const [recurringAllocations, setRecurringAllocations] = useState<any[]>([]);
  const [holidayNamesByUserDate, setHolidayNamesByUserDate] = useState<Record<number, Record<string, string[]>>>({});
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [showDependencyLines, setShowDependencyLines] = useState(true);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);
  const [ganttSearch, setGanttSearch] = useState('');
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'year' | 'custom'>('week');
  const [customStartDate, setCustomStartDate] = useState(() => formatDateForInput(viewStartDate));
  const [customEndDate, setCustomEndDate] = useState(() => {
    const endDate = new Date(viewStartDate);
    endDate.setDate(endDate.getDate() + 27);
    return formatDateForInput(endDate);
  });
  const [activeTab, setActiveTab] = useState<'gantt' | 'allocations'>('gantt');
  const [maxVisibleLevel, setMaxVisibleLevel] = useState<number>(0);
  const [allocationFilters, setAllocationFilters] = useState({
    startDate: '',
    endDate: '',
    userId: '',
    projectId: '',
    taskName: ''
  });
  const [expandedAllocationRows, setExpandedAllocationRows] = useState<Set<number>>(new Set());
  const ganttContainerRef = useRef<HTMLDivElement>(null);
  
  // Manual allocation modal state
  const [manualAllocationModal, setManualAllocationModal] = useState<{
    show: boolean;
    allocationId?: number;
    taskId?: number;
    userId?: number;
    allocationDate: string;
    allocatedHours: string;
    startTime: string;
    endTime: string;
    mode: 'add' | 'edit';
  }>({
    show: false,
    allocationDate: '',
    allocatedHours: '',
    startTime: '09:00',
    endTime: '17:00',
    mode: 'add'
  });
  
  // Planning progress modal state
  const [planningProgress, setPlanningProgress] = useState<{
    show: boolean;
    taskName: string;
    progress: number;
    currentStep: string;
    totalHours: number;
    allocatedHours: number;
    daysProcessed: number;
  }>({
    show: false,
    taskName: '',
    progress: 0,
    currentStep: '',
    totalHours: 0,
    allocatedHours: 0,
    daysProcessed: 0,
  });
  
  const [modalMessage, setModalMessage] = useState<{
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  // Conflict resolution modal state
  const [conflictModal, setConflictModal] = useState<{
    show: boolean;
    task: Task | null;
    userId: number | null;
    startDate: Date | null;
    existingTasks: string[];
    totalHoursToAllocate: number;
    hoursAlreadyWorked: number;
    maxDailyHours: number;
    isParentTask?: boolean;
    leafTasks?: Task[];
  }>({
    show: false,
    task: null,
    userId: null,
    startDate: null,
    existingTasks: [],
    totalHoursToAllocate: 0,
    hoursAlreadyWorked: 0,
    maxDailyHours: 8,
  });

  // Hours per day modal state
  const [hoursPerDayModal, setHoursPerDayModal] = useState<{
    show: boolean;
    task: Task | null;
    userId: number | null;
    startDate: Date | null;
    maxDailyHours: number;
    hoursPerDay: string;
    totalHours: number;
    hoursAlreadyWorked: number;
    totalEstimatedHours: number;
    isParentTask?: boolean;
    leafTasks?: Task[];
    usePushForward?: boolean;
  }>({
    show: false,
    task: null,
    userId: null,
    startDate: null,
    maxDailyHours: 8,
    hoursPerDay: '8',
    totalHours: 0,
    hoursAlreadyWorked: 0,
    totalEstimatedHours: 0,
  });

  // Subtasks modal state
  const [subtasksModal, setSubtasksModal] = useState<{
    show: boolean;
    parentTask: Task | null;
    subtasks: Task[];
    draggedSubtask: Task | null;
  }>({
    show: false,
    parentTask: null,
    subtasks: [],
    draggedSubtask: null,
  });

  // Recurring allocation detail modal state
  const [recurringDetailModal, setRecurringDetailModal] = useState<{
    show: boolean;
    recurring: any | null;
  }>({
    show: false,
    recurring: null,
  });

  const showAlert = (title: string, message: string) => {
    setModalMessage({ type: 'alert', title, message });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalMessage({ type: 'confirm', title, message, onConfirm });
  };

  const closeModal = () => {
    setModalMessage(null);
  };

  const normalizeDateOnly = (dateValue?: string | null): string | null => {
    if (!dateValue) return null;
    const asString = String(dateValue);
    if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) return asString;
    const datePart = asString.split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
  };

  const getDateKeyFromDate = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const normalizeDateKey = (value: unknown): string => {
    if (value instanceof Date) {
      return getDateKeyFromDate(value);
    }

    const raw = String(value || '').trim();
    if (!raw) return '';

    const dateOnlyMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateOnlyMatch) {
      return dateOnlyMatch[1];
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return getDateKeyFromDate(parsed);
    }

    const datePart = raw.split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : raw;
  };

  const getUserHolidayNames = (userId: number, dateStr: string): string[] => {
    return holidayNamesByUserDate[userId]?.[dateStr] || [];
  };

  const isUserHoliday = (userId: number, dateStr: string): boolean => {
    return getUserHolidayNames(userId, dateStr).length > 0;
  };

  const splitUnavailableLabels = (labels: string[]) => {
    const vacationLabels = labels.filter((label) => /^vacation\b/i.test(String(label || '').trim()));
    const holidayLabels = labels.filter((label) => !/^vacation\b/i.test(String(label || '').trim()));
    return { vacationLabels, holidayLabels };
  };

  const getLatestAllocationDate = (allocations: { date: string }[]): string | null => {
    if (!allocations || allocations.length === 0) return null;
    return allocations.reduce((latest, current) => current.date > latest ? current.date : latest, allocations[0].date);
  };

  const validateMandatoryDueDateForPlan = (task: Task, plannedEndDate: string | null): boolean => {
    const isMandatory = Number(task.DueDateMandatory || 0) === 1;
    if (!isMandatory) return true;

    const dueDate = normalizeDateOnly(task.DueDate);
    if (!dueDate) {
      showAlert('Planning Blocked', `Task "${task.TaskName}" has mandatory due date enabled but no due date set.`);
      return false;
    }

    if (!plannedEndDate) {
      showAlert('Planning Blocked', `Unable to determine planned end date for task "${task.TaskName}".`);
      return false;
    }

    if (plannedEndDate > dueDate) {
      showAlert(
        'Planning Blocked',
        `Task "${task.TaskName}" has a mandatory due date (${new Date(dueDate + 'T12:00:00').toLocaleDateString()}) but the plan ends on ${new Date(plannedEndDate + 'T12:00:00').toLocaleDateString()}.\n\nPlease choose an earlier start date, increase daily hours, or reduce total hours.`
      );
      return false;
    }

    return true;
  };

  const handleModalConfirm = () => {
    if (modalMessage?.onConfirm) {
      modalMessage.onConfirm();
    }
    closeModal();
  };

  const handleRemovePlanning = () => {
    if (!selectedTask) return;
    
    showConfirm(
      'Remove Planning',
      `Are you sure you want to remove all planning allocations for task "${selectedTask.TaskName}"? This action cannot be undone.`,
      async () => {
        try {
          const response = await fetch(
            `${getApiUrl()}/api/task-allocations/task/${selectedTask.Id}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (!response.ok) {
            throw new Error('Failed to delete allocations');
          }

          // Close the modal
          setSelectedTask(null);
          setTaskAllocations([]);
          
          // Reload tasks and allocations to update the Gantt chart
          if (projects.length > 0) {
            await loadAllProjectsTasks(projects);
            await loadAllAllocations();
          }

          showAlert('Success', 'Planning allocations removed successfully');
        } catch (err: any) {
          showAlert('Error', err.message || 'Failed to remove planning allocations');
        }
      }
    );
  };

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    } else if (user && token) {
      loadData();
    }
  }, [user, isLoading, router, token]);

  // Re-apply canViewOthersPlanning filter after permissions are resolved
  useEffect(() => {
    if (!isLoadingPermissions && allUsersRef.current.length > 0 && user) {
      const filtered = permissions?.canViewOthersPlanning
        ? allUsersRef.current
        : allUsersRef.current.filter(u => u.Id === user.id);
      setUsers(filtered);
    }
  }, [isLoadingPermissions, permissions?.canViewOthersPlanning]);

  const loadData = async () => {
    setIsLoadingData(true);
    try {
      const projectsRes = await projectsApi.getAll(token!);
      setProjects(projectsRes.projects);
      projectsRef.current = projectsRes.projects;
      
      if (projectsRes.projects.length > 0) {
        // Load task status values FIRST so filtering works when tasks render
        await loadTaskStatusValues(projectsRes.projects);

        await loadAllProjectMilestones(projectsRes.projects);

        // Load all tasks from all projects
        const loadedTasks = await loadAllProjectsTasks(projectsRes.projects);
        
        // Load users from all organizations
        await loadAllUsers(projectsRes.projects);
        
        // Load recurring allocations (after users are loaded)
        await loadRecurringAllocations();
        
        // Load all allocations for the visible period
        await loadAllAllocations(loadedTasks);
      }
      if (projectsRes.projects.length === 0) {
        setProjectMilestones([]);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const loadAllProjectMilestones = async (projectsList: Project[]) => {
    if (!token) {
      setProjectMilestones([]);
      return;
    }

    try {
      const milestoneResponses = await Promise.all(
        projectsList.map(async (project) => {
          try {
            const result = await projectMilestonesApi.getByProject(project.Id, token);
            return result.milestones || [];
          } catch {
            return [] as ProjectMilestone[];
          }
        })
      );

      setProjectMilestones(milestoneResponses.flat());
    } catch {
      setProjectMilestones([]);
    }
  };

  const loadAllUsers = async (projectsList: Project[]) => {
    const organizationIds = [...new Set(projectsList.map(p => p.OrganizationId).filter(Boolean))];
    const allUsers: User[] = [];
    const userOrgsMap: { [userId: number]: number[] } = {};
    
    for (const orgId of organizationIds) {
      try {
        const usersRes = await usersApi.getByOrganization(orgId, token!);
        usersRes.users.forEach(u => {
          if (!allUsers.find(existing => existing.Id === u.Id)) {
            allUsers.push(u);
          }
          // Track which organizations this user belongs to
          if (!userOrgsMap[u.Id]) {
            userOrgsMap[u.Id] = [];
          }
          if (!userOrgsMap[u.Id].includes(orgId)) {
            userOrgsMap[u.Id].push(orgId);
          }
        });
      } catch (err) {
        console.error(`Failed to load users for org ${orgId}:`, err);
      }
    }
    
    // Apply canViewOthersPlanning filter
    allUsersRef.current = allUsers;
    const filteredUsers = (!isLoadingPermissions && permissions && !permissions.canViewOthersPlanning && user)
      ? allUsers.filter(u => u.Id === user.id)
      : allUsers;
    setUsers(filteredUsers);
    setUserOrganizations(userOrgsMap);
  };

  const loadTaskStatusValues = async (projectsList: Project[]) => {
    const organizationIds = [...new Set(projectsList.map(p => p.OrganizationId).filter(Boolean))];
    const statusMap: { [orgId: number]: StatusValue[] } = {};

    for (const orgId of organizationIds) {
      try {
        const res = await statusValuesApi.getTaskStatuses(orgId, token!);
        statusMap[orgId] = res.statuses || [];
      } catch (err) {
        console.error(`Failed to load task statuses for org ${orgId}:`, err);
      }
    }

    setTaskStatusValues(statusMap);
    taskStatusValuesRef.current = statusMap;
  };

  const loadAllProjectsTasks = async (projectsList: Project[]) => {
    const allTasks: Task[] = [];
    
    for (const project of projectsList) {
      try {
        const tasksRes = await tasksApi.getByProject(project.Id, token!);
        allTasks.push(...tasksRes.tasks);
      } catch (err) {
        console.error(`Failed to load tasks for project ${project.Id}:`, err);
      }
    }
    
    setTasks(allTasks);
    return allTasks;
  };

  const loadAllAllocations = async (tasksList?: Task[]) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/task-allocations`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setAllAllocations(data.allocations || []);
      }

      // Load all child allocations for hierarchical tasks
      await loadAllChildAllocations(tasksList);
    } catch (err) {
      console.error('Failed to load all allocations:', err);
    }
  };

  const loadAllChildAllocations = async (tasksList?: Task[]) => {
    try {
      // Use provided tasks list or fall back to state
      const tasksToUse = tasksList || tasks;
      
      // Get all parent tasks (tasks with children)
      const parentTasks = tasksToUse.filter(t => tasksToUse.some(child => child.ParentTaskId === t.Id));
      
      if (parentTasks.length === 0) {
        setChildAllocations([]);
        return;
      }

      // Fetch child allocations for each parent
      const allChildAllocs: any[] = [];
      
      for (const parentTask of parentTasks) {
        const response = await fetch(
          `${getApiUrl()}/api/task-child-allocations/parent/${parentTask.Id}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.allocations && data.allocations.length > 0) {
            allChildAllocs.push(...data.allocations);
          }
        }
      }

      setChildAllocations(allChildAllocs);
      console.log(`Loaded ${allChildAllocs.length} child allocations for ${parentTasks.length} parent tasks`);
    } catch (err) {
      console.error('Failed to load child allocations:', err);
    }
  };

  const loadRecurringAllocations = async () => {
    if (!token || users.length === 0) return;
    
    try {
      const visibleDays = getDaysInView();
      if (visibleDays.length === 0) {
        setRecurringAllocations([]);
        return;
      }

      const startDate = getDateKeyFromDate(visibleDays[0]);
      const endDate = getDateKeyFromDate(visibleDays[visibleDays.length - 1]);
      
      // Fetch recurring allocation occurrences for all visible users
      const allRecurringOccurrences: any[] = [];
      
      for (const user of users) {
        const response = await fetch(
          `${getApiUrl()}/api/recurring-allocations/occurrences/user/${user.Id}?startDate=${startDate}&endDate=${endDate}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.occurrences && data.occurrences.length > 0) {
            allRecurringOccurrences.push(...data.occurrences);
          }
        }
      }
      
      setRecurringAllocations(allRecurringOccurrences);
      console.log(`Loaded ${allRecurringOccurrences.length} recurring allocation occurrences for ${users.length} users in date range ${startDate} to ${endDate}`);
    } catch (err) {
      console.error('Failed to load recurring allocations:', err);
    }
  };

  const loadPlannerHolidays = async () => {
    if (!token || users.length === 0) {
      setHolidayNamesByUserDate({});
      return;
    }

    try {
      const days = getDaysInView();
      if (days.length === 0) {
        setHolidayNamesByUserDate({});
        return;
      }

      const startDateKey = getDateKeyFromDate(days[0]);
      const endDateKey = getDateKeyFromDate(days[days.length - 1]);

      const years: number[] = [];
      for (let year = days[0].getFullYear(); year <= days[days.length - 1].getFullYear(); year++) {
        years.push(year);
      }

      const countryCodes = Array.from(
        new Set(
          users
            .map((u) => String(u.CountryCode || 'PT').trim().toUpperCase())
            .filter((code) => /^[A-Z]{2}$/.test(code))
        )
      );

      if (countryCodes.length === 0 || years.length === 0) {
        setHolidayNamesByUserDate({});
        return;
      }

      const userIds = users.map((u) => u.Id).filter((id): id is number => Number.isInteger(id) && id > 0);
      let approvedVacations: PlannerVacationDay[] = [];
      if (userIds.length > 0) {
        const vacationQuery = new URLSearchParams({
          startDate: startDateKey,
          endDate: endDateKey,
          userIds: userIds.join(','),
        });

        const vacationResponse = await fetch(`${getApiUrl()}/api/vacations/calendar?${vacationQuery.toString()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (vacationResponse.ok) {
          const vacationData = await vacationResponse.json();
          approvedVacations = (vacationData.entries || []) as PlannerVacationDay[];
        }
      }

      const countryYearResults = await Promise.all(
        countryCodes.flatMap((countryCode) =>
          years.map(async (year) => {
            const response = await fetch(`${getApiUrl()}/api/holidays?year=${year}&countryCode=${countryCode}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              return { countryCode, year, holidays: [] as PlannerHoliday[] };
            }

            const data = await response.json();
            return {
              countryCode,
              year,
              holidays: (data.holidays || []) as PlannerHoliday[]
            };
          })
        )
      );

      const byCountryYear = new Map<string, PlannerHoliday[]>();
      for (const entry of countryYearResults) {
        byCountryYear.set(`${entry.countryCode}-${entry.year}`, entry.holidays);
      }

      const result: Record<number, Record<string, string[]>> = {};

      users.forEach((planningUser) => {
        const countryCode = String(planningUser.CountryCode || 'PT').trim().toUpperCase();
        const holidayMapForUser: Record<string, string[]> = {};

        years.forEach((year) => {
          const holidays = byCountryYear.get(`${countryCode}-${year}`) || [];
          holidays
            .filter((holiday) => Number(holiday.IsActive) === 1)
            .forEach((holiday) => {
              const dateKey = normalizeDateKey(holiday.HolidayDate);
              if (dateKey < startDateKey || dateKey > endDateKey) {
                return;
              }
              if (!holidayMapForUser[dateKey]) {
                holidayMapForUser[dateKey] = [];
              }
              holidayMapForUser[dateKey].push(holiday.HolidayName);
            });
        });

        approvedVacations
          .filter((vacation) => Number(vacation.UserId) === planningUser.Id)
          .forEach((vacation) => {
            const dateKey = normalizeDateKey(vacation.VacationDate);
            if (dateKey < startDateKey || dateKey > endDateKey) {
              return;
            }
            if (!holidayMapForUser[dateKey]) {
              holidayMapForUser[dateKey] = [];
            }

            const label = vacation.Notes
              ? `Vacation: ${vacation.Notes}`
              : 'Vacation';

            if (!holidayMapForUser[dateKey].includes(label)) {
              holidayMapForUser[dateKey].push(label);
            }
          });

        result[planningUser.Id] = holidayMapForUser;
      });

      setHolidayNamesByUserDate(result);
    } catch (err) {
      console.error('Failed to load planner holidays:', err);
      setHolidayNamesByUserDate({});
    }
  };

  const handleTaskClick = async (task: Task) => {
    const fullTask = tasks.find((entry) => Number(entry.Id) === Number(task.Id)) || task;
    setSelectedTask(fullTask);
    setLoadingAllocations(true);

    const selectedProject = projects.find((projectEntry) => Number(projectEntry.Id) === Number(fullTask.ProjectId));
    const organizationId = selectedProject?.OrganizationId;

    if (organizationId && !jiraIntegrationByOrg[organizationId]) {
      try {
        const jiraResponse = await fetch(`${getApiUrl()}/api/jira-integrations/organization/${organizationId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (jiraResponse.ok) {
          const jiraData = await jiraResponse.json();
          const integration = jiraData.integration;
          setJiraIntegrationByOrg((prev) => ({
            ...prev,
            [organizationId]: integration?.IsEnabled ? integration : null,
          }));
        }
      } catch {
        setJiraIntegrationByOrg((prev) => ({
          ...prev,
          [organizationId]: null,
        }));
      }
    }
    
    try {
      // Fetch task allocations
      const allocationsResponse = await fetch(
        `${getApiUrl()}/api/task-allocations/task/${fullTask.Id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (allocationsResponse.ok) {
        const data = await allocationsResponse.json();
        setTaskAllocations(data.allocations || []);
      } else {
        setTaskAllocations([]);
      }

      // Fetch time entries
      const timeEntriesResponse = await fetch(
        `${getApiUrl()}/api/time-entries/task/${fullTask.Id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (timeEntriesResponse.ok) {
        const data = await timeEntriesResponse.json();
        setTaskTimeEntries(data.entries || []);
      } else {
        setTaskTimeEntries([]);
      }
    } catch (err) {
      console.error('Failed to load task details:', err);
      setTaskAllocations([]);
      setTaskTimeEntries([]);
    } finally {
      setLoadingAllocations(false);
    }
  };

  const handleTaskUpdate = async (task: Task, updates: Partial<Task>) => {
    try {
      await tasksApi.update(task.Id, {
        taskName: updates.TaskName || task.TaskName,
        description: task.Description,
        status: task.Status,
        priority: task.Priority,
        assignedTo: updates.AssignedTo !== undefined ? updates.AssignedTo : task.AssignedTo,
        dueDate: task.DueDate,
        dueDateMandatory: Number(task.DueDateMandatory || 0) === 1,
        estimatedHours: task.EstimatedHours,
        parentTaskId: task.ParentTaskId,
        plannedStartDate: updates.PlannedStartDate !== undefined ? updates.PlannedStartDate : task.PlannedStartDate,
        plannedEndDate: updates.PlannedEndDate !== undefined ? updates.PlannedEndDate : task.PlannedEndDate
      }, token!);
      
      // Reload all tasks
      if (projects.length > 0) {
        await loadAllProjectsTasks(projects);
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const persistPlannedTaskAssignment = async (
    task: Task,
    assignedUserId: number,
    plannedStartDate: string | null,
    plannedEndDate: string | null
  ) => {
    await tasksApi.update(task.Id, {
      taskName: task.TaskName,
      description: task.Description,
      status: task.Status,
      priority: task.Priority,
      assignedTo: assignedUserId,
      dueDate: task.DueDate,
      dueDateMandatory: Number(task.DueDateMandatory || 0) === 1,
      estimatedHours: task.EstimatedHours,
      parentTaskId: task.ParentTaskId,
      plannedStartDate: plannedStartDate || undefined,
      plannedEndDate: plannedEndDate || undefined
    }, token!);
  };

  // Get all leaf tasks (tasks without children) recursively
  const getAllLeafTasks = (parentTaskId: number): Task[] => {
    const children = tasks.filter(t => t.ParentTaskId === parentTaskId);
    if (children.length === 0) {
      // This is a leaf task
      const task = tasks.find(t => t.Id === parentTaskId);
      return task ? [task] : [];
    }
    
    // Has children - get leaf tasks from all children
    let leafTasks: Task[] = [];
    for (const child of children) {
      leafTasks = leafTasks.concat(getAllLeafTasks(child.Id));
    }
    return leafTasks;
  };

  const getDaysInView = () => {
    const days = [];
    let daysToShow = 30; // default for week view
    let rangeStart = new Date(viewStartDate);
    
    if (viewMode === 'day') {
      daysToShow = 7; // Show 7 days for day view
    } else if (viewMode === 'month') {
      daysToShow = 90; // Show ~3 months for month view
    } else if (viewMode === 'year') {
      daysToShow = 365; // Show 1 year for year view
    } else if (viewMode === 'custom') {
      const parsedStart = new Date(`${customStartDate}T12:00:00`);
      const parsedEnd = new Date(`${customEndDate}T12:00:00`);

      if (!Number.isNaN(parsedStart.getTime()) && !Number.isNaN(parsedEnd.getTime())) {
        if (parsedEnd < parsedStart) {
          rangeStart = parsedStart;
          daysToShow = 1;
        } else {
          const cursor = new Date(parsedStart);
          cursor.setHours(12, 0, 0, 0);
          const end = new Date(parsedEnd);
          end.setHours(12, 0, 0, 0);

          while (cursor <= end) {
            days.push(new Date(cursor));
            cursor.setDate(cursor.getDate() + 1);
          }

          return days;
        }
      }
    }
    
    for (let i = 0; i < daysToShow; i++) {
      const date = new Date(rangeStart);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const getCustomIntervalType = (totalDays: number): 'day' | 'week' | 'month' => {
    if (totalDays <= 35) return 'day';
    if (totalDays <= 180) return 'week';
    return 'month';
  };

  const getTimelineColumns = (days: Date[]): TimelineColumn[] => {
    if (days.length === 0) return [];

    const buildDayColumn = (date: Date): TimelineColumn => {
      let header = '';
      let subheader = '';

      if (viewMode === 'day' || viewMode === 'week') {
        header = date.toLocaleDateString('en-US', { weekday: 'short' });
        subheader = `${date.getDate()}/${date.getMonth() + 1}`;
      } else if (viewMode === 'month') {
        header = `${date.getDate()}`;
        subheader = `${date.getMonth() + 1}`;
      } else if (viewMode === 'year') {
        header = `${date.getDate()}`;
        subheader = `${date.getMonth() + 1}`;
      } else {
        const customInterval = getCustomIntervalType(days.length);
        if (customInterval === 'day') {
          header = date.toLocaleDateString('en-US', { weekday: 'short' });
          subheader = `${date.getDate()}/${date.getMonth() + 1}`;
        } else if (customInterval === 'week') {
          header = `${date.getDate()}`;
          subheader = date.toLocaleDateString('en-US', { month: 'short' });
        } else {
          header = `${date.getDate()}`;
          subheader = `${date.getMonth() + 1}`;
        }
      }

      return {
        start: new Date(date),
        end: new Date(date),
        header,
        subheader,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        isMonthStart: date.getDate() === 1,
      };
    };

    if (viewMode !== 'custom') {
      return days.map(buildDayColumn);
    }

    return days.map(buildDayColumn);
  };

  const goToToday = () => {
    const today = new Date();
    today.setDate(today.getDate() - 2);
    today.setHours(0, 0, 0, 0);
    setViewStartDate(today);
    if (viewMode === 'custom') {
      const start = new Date(today);
      const end = new Date(today);
      end.setDate(end.getDate() + 27);
      setCustomStartDate(formatDateForInput(start));
      setCustomEndDate(formatDateForInput(end));
    }
  };

  const getNavigationStepDays = () => {
    if (viewMode === 'day' || viewMode === 'week') return 7;
    if (viewMode === 'month') return 30;
    if (viewMode === 'year') return 365;
    return Math.max(1, getDaysInView().length);
  };

  const getTaskPosition = (
    task: Task,
    columns: TimelineColumn[],
    options?: {
      minVisibleDuration?: number;
      preferRangeStartForUnplanned?: boolean;
      useFixedPixelColumns?: boolean;
      columnWidthPx?: number;
    }
  ) => {
    if (columns.length === 0) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate: Date;
    let endDate: Date;

    if (task.PlannedStartDate && task.PlannedEndDate) {
      // Parse planned dates - handle both 'YYYY-MM-DD' and ISO timestamp formats
      const parseDate = (dateStr: string) => {
        const dateOnly = String(dateStr).split('T')[0];
        return new Date(dateOnly + 'T12:00:00');
      };
      
      startDate = parseDate(task.PlannedStartDate);
      endDate = parseDate(task.PlannedEndDate);
    } else {
      // Use range start for unplanned tasks when requested (keeps Not Planned readable in any view window)
      startDate = options?.preferRangeStartForUnplanned ? new Date(columns[0].start) : new Date(today);
      const estimatedDays = Math.max(1, Math.ceil((task.EstimatedHours || 8) / 8));
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + estimatedDays - 1);
    }

    // Normalize dates for comparison (remove time component)
    const normalizeDate = (d: Date) => {
      const normalized = new Date(d);
      normalized.setHours(0, 0, 0, 0);
      return normalized;
    };

    const normalizedStart = normalizeDate(startDate);
    const normalizedEnd = normalizeDate(endDate);
    const firstDay = normalizeDate(columns[0].start);
    const lastDay = normalizeDate(columns[columns.length - 1].end);

    // Check if task is within visible range
    if (normalizedEnd < firstDay || normalizedStart > lastDay) {
      return null;
    }

    const overlapsColumn = (column: TimelineColumn) => {
      const columnStart = normalizeDate(column.start);
      const columnEnd = normalizeDate(column.end);
      return normalizedStart <= columnEnd && normalizedEnd >= columnStart;
    };

    const startIndex = columns.findIndex(overlapsColumn);
    if (startIndex === -1) return null;

    let endIndex = startIndex;
    for (let i = startIndex; i < columns.length; i++) {
      if (overlapsColumn(columns[i])) {
        endIndex = i;
      }
    }

    const visibleDuration = Math.max(1, endIndex - startIndex + 1);
    const minVisibleDuration = Math.max(1, options?.minVisibleDuration || 1);
    const maxDurationAtPosition = Math.max(1, columns.length - startIndex);
    const adjustedDuration = Math.min(maxDurationAtPosition, Math.max(visibleDuration, minVisibleDuration));

    const useFixedPixelColumns = !!options?.useFixedPixelColumns;
    const columnWidthPx = Math.max(1, options?.columnWidthPx || 1);

    return {
      left: useFixedPixelColumns
        ? `${startIndex * columnWidthPx}px`
        : `${(startIndex / columns.length) * 100}%`,
      width: useFixedPixelColumns
        ? `${adjustedDuration * columnWidthPx}px`
        : `${(adjustedDuration / columns.length) * 100}%`,
      startIndex,
      duration: adjustedDuration
    };
  };

  // Helper to check if a task is hobby
  const isTaskHobby = (task: Task): boolean => {
    const project = projects.find(p => p.Id === task.ProjectId);
    return project?.IsHobby || false;
  };

  // Helper to get the status value for a task from its organization's task statuses
  const getTaskStatusValue = (task: Task): StatusValue | undefined => {
    // Use refs for immediate access (avoids stale state from async loading)
    const projectsList = projectsRef.current.length > 0 ? projectsRef.current : projects;
    const statusMap = Object.keys(taskStatusValuesRef.current).length > 0 ? taskStatusValuesRef.current : taskStatusValues;
    const project = projectsList.find(p => p.Id === task.ProjectId);
    if (!project) return undefined;
    const statuses = statusMap[project.OrganizationId];
    if (!statuses || statuses.length === 0) return undefined;
    return statuses.find(s => s.Id === task.Status);
  };

  // Helper to check if a task should be excluded from planning (closed, cancelled, or hidden-by-status)
  const isTaskClosedOrCancelled = (task: Task): boolean => {
    const statusValue = getTaskStatusValue(task);
    return !!(
      task.StatusIsClosed ||
      task.StatusIsCancelled ||
      (statusValue && Number(statusValue.HideFromPlanningAndStatistics || 0) === 1)
    );
  };

  // Helper to get the status color for a task (bar fill color)
  const getTaskStatusColor = (task: Task): string | undefined => {
    return task.StatusColor || undefined;
  };

  // Get planned dates for a child task from child allocations
  const getChildTaskDates = (childTaskId: number) => {
    const childAllocs = childAllocations.filter(ca => ca.ChildTaskId === childTaskId);
    
    if (childAllocs.length === 0) {
      return null;
    }

    const dates = childAllocs.map(ca => ca.AllocationDate).sort();
    return {
      startDate: dates[0],
      endDate: dates[dates.length - 1]
    };
  };

  // Calculate dependency lines for SVG overlay
  const getDependencyLines = useCallback((days: Date[]) => {
    const lines: { 
      fromTaskId: number; 
      toTaskId: number; 
      x1: number; 
      y1: number; 
      x2: number; 
      y2: number;
      fromTaskName: string;
      toTaskName: string;
    }[] = [];
    
    if (!showDependencyLines || !ganttContainerRef.current) return lines;
    
    const container = ganttContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    
    // Find all tasks with dependencies
    const tasksWithDeps = tasks.filter(t => t.DependsOnTaskId && t.PlannedStartDate && t.PlannedEndDate);
    
    for (const task of tasksWithDeps) {
      const parentTask = tasks.find(t => t.Id === task.DependsOnTaskId);
      if (!parentTask || !parentTask.PlannedEndDate) continue;
      
      // Find task elements by data attribute
      const taskElement = container.querySelector(`[data-task-id="${task.Id}"]`) as HTMLElement;
      const parentElement = container.querySelector(`[data-task-id="${parentTask.Id}"]`) as HTMLElement;
      
      if (!taskElement || !parentElement) continue;
      
      const taskRect = taskElement.getBoundingClientRect();
      const parentRect = parentElement.getBoundingClientRect();
      
      // Calculate positions relative to container
      const x1 = parentRect.right - containerRect.left; // End of parent task
      const y1 = parentRect.top - containerRect.top + parentRect.height / 2; // Middle of parent
      const x2 = taskRect.left - containerRect.left; // Start of dependent task
      const y2 = taskRect.top - containerRect.top + taskRect.height / 2; // Middle of dependent
      
      lines.push({
        fromTaskId: parentTask.Id,
        toTaskId: task.Id,
        x1,
        y1,
        x2,
        y2,
        fromTaskName: parentTask.TaskName,
        toTaskName: task.TaskName
      });
    }
    
    return lines;
  }, [tasks, showDependencyLines]);

  // State to store calculated dependency lines
  const [dependencyLines, setDependencyLines] = useState<ReturnType<typeof getDependencyLines>>([]);

  // Update dependency lines when tasks or view changes
  useEffect(() => {
    const updateLines = () => {
      const days = getDaysInView();
      setDependencyLines(getDependencyLines(days));
    };
    
    // Delay to ensure DOM is updated
    const timer = setTimeout(updateLines, 100);
    return () => clearTimeout(timer);
  }, [tasks, viewStartDate, viewMode, customStartDate, customEndDate, showDependencyLines, getDependencyLines]);

  // Critical path computation using CPM (Critical Path Method)
  const criticalPathIds = React.useMemo((): Set<number> => {
    if (!showCriticalPath || !tasks.length) return new Set();
    const DAY_MS = 86400000;
    const timedTasks = tasks.filter(t => t.PlannedStartDate && t.PlannedEndDate);
    if (timedTasks.length === 0) return new Set();
    const taskMap = new Map(timedTasks.map(t => [t.Id, t]));
    const durMs = (t: any): number =>
      Math.max(DAY_MS, new Date(t.PlannedEndDate!).getTime() - new Date(t.PlannedStartDate!).getTime());
    // Build successor map
    const successors = new Map<number, number[]>();
    for (const t of timedTasks) {
      if (t.DependsOnTaskId && taskMap.has(t.DependsOnTaskId)) {
        const arr = successors.get(t.DependsOnTaskId) || [];
        arr.push(t.Id);
        successors.set(t.DependsOnTaskId, arr);
      }
    }
    // Topological sort by start date
    const sorted = [...timedTasks].sort((a, b) =>
      new Date(a.PlannedStartDate!).getTime() - new Date(b.PlannedStartDate!).getTime()
    );
    // Forward pass — earliest finish
    const ef = new Map<number, number>();
    for (const t of sorted) {
      const ownStart = new Date(t.PlannedStartDate!).getTime();
      const predEf = t.DependsOnTaskId ? ef.get(t.DependsOnTaskId) : undefined;
      const es = predEf !== undefined ? Math.max(ownStart, predEf) : ownStart;
      ef.set(t.Id, es + durMs(t));
    }
    const maxEf = Math.max(...ef.values());
    // Backward pass — latest finish
    const lf = new Map<number, number>();
    for (const t of [...sorted].reverse()) {
      const succs = successors.get(t.Id) || [];
      if (succs.length === 0) {
        lf.set(t.Id, maxEf);
      } else {
        const minSuccLs = Math.min(...succs.map(sid => (lf.get(sid) ?? maxEf) - durMs(taskMap.get(sid)!)));
        lf.set(t.Id, minSuccLs + durMs(t));
      }
    }
    // Critical: float < 0.5 day
    const critical = new Set<number>();
    for (const t of timedTasks) {
      const float = (lf.get(t.Id) ?? 0) - (ef.get(t.Id) ?? 0);
      if (float < DAY_MS * 0.5) critical.add(t.Id);
    }
    return critical;
  }, [tasks, showCriticalPath]);

  // Reload recurring allocations when view changes
  useEffect(() => {
    if (users.length > 0 && token) {
      loadRecurringAllocations();
    }
  }, [viewStartDate, viewMode, customStartDate, customEndDate, users.length]);

  useEffect(() => {
    if (users.length > 0 && token) {
      loadPlannerHolidays();
    } else {
      setHolidayNamesByUserDate({});
    }
  }, [viewStartDate, viewMode, customStartDate, customEndDate, users, token]);

  const getTasksForUser = (userId: number | null) => {
    let result: Task[];
    
    if (userId === null) {
      // Not planned - show only parent tasks without allocations, excluding closed/cancelled
      result = tasks.filter(t => {
        const hasAllocations = allAllocations.some(a => a.TaskId === t.Id);
        const isParent = !t.ParentTaskId;
        // Also check if ALL children are closed/cancelled (for parent tasks with children)
        const children = tasks.filter(c => c.ParentTaskId === t.Id);
        const hasChildren = children.length > 0;
        const allChildrenClosed = hasChildren && children.every(c => isTaskClosedOrCancelled(c));
        return !hasAllocations && isParent && !isTaskClosedOrCancelled(t) && !allChildrenClosed;
      });
    } else {
      // Assigned to this user AND has planning dates
      result = tasks.filter(t => 
        !t.ParentTaskId && 
        t.AssignedTo === userId &&
        t.PlannedStartDate &&
        t.PlannedEndDate
      );
    }
    
    // Sort: work tasks first, then hobby tasks
    return result.sort((a, b) => {
      const aIsHobby = isTaskHobby(a);
      const bIsHobby = isTaskHobby(b);
      if (aIsHobby === bIsHobby) return 0;
      return aIsHobby ? 1 : -1;
    });
  };

  const openSubtasksModal = (parentTask: Task) => {
    // Build hierarchical subtask tree
    const getAllSubtasksRecursively = (taskId: number): Task[] => {
      const directChildren = tasks.filter(t => t.ParentTaskId === taskId);
      let result: Task[] = [];
      
      for (const child of directChildren) {
        result.push(child);
        // Get children's children recursively
        const grandChildren = getAllSubtasksRecursively(child.Id);
        result = result.concat(grandChildren);
      }
      
      return result;
    };
    
    const allSubtasks = getAllSubtasksRecursively(parentTask.Id);
    
    // Filter to show only leaf tasks (tasks without children)
    const leafSubtasks = allSubtasks.filter(subtask => {
      return !tasks.some(t => t.ParentTaskId === subtask.Id);
    });
    
    // Sort by DueDate, then by DisplayOrder
    const sortedSubtasks = leafSubtasks.sort((a, b) => {
      if (a.DueDate && b.DueDate) {
        const dateCompare = new Date(a.DueDate).getTime() - new Date(b.DueDate).getTime();
        if (dateCompare !== 0) return dateCompare;
      }
      return (a.DisplayOrder || 0) - (b.DisplayOrder || 0);
    });
    
    setSubtasksModal({
      show: true,
      parentTask,
      subtasks: sortedSubtasks,
      draggedSubtask: null,
    });
  };

  const closeSubtasksModal = () => {
    setSubtasksModal({
      show: false,
      parentTask: null,
      subtasks: [],
      draggedSubtask: null,
    });
  };

  const handleSubtaskDragStart = (subtask: Task) => {
    // Set both modal state and main drag state
    setSubtasksModal(prev => ({ ...prev, draggedSubtask: subtask }));
    setDraggedTask(subtask); // Allow dragging to gantt
  };

  const handleSubtaskDragOver = (e: React.DragEvent, targetSubtask: Task) => {
    e.preventDefault();
    if (!subtasksModal.draggedSubtask || subtasksModal.draggedSubtask.Id === targetSubtask.Id) return;

    const subtasks = [...subtasksModal.subtasks];
    const draggedIndex = subtasks.findIndex(t => t.Id === subtasksModal.draggedSubtask!.Id);
    const targetIndex = subtasks.findIndex(t => t.Id === targetSubtask.Id);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder
    const [removed] = subtasks.splice(draggedIndex, 1);
    subtasks.splice(targetIndex, 0, removed);

    setSubtasksModal(prev => ({ ...prev, subtasks }));
  };

  const handleSubtaskDragEnd = async () => {
    if (!token || !subtasksModal.draggedSubtask) {
      setSubtasksModal(prev => ({ ...prev, draggedSubtask: null }));
      return;
    }

    try {
      // Update DisplayOrder for all subtasks
      const updates = subtasksModal.subtasks.map((task, index) => ({
        taskId: task.Id,
        displayOrder: index + 1,
      }));

      // Save new order to backend
      const response = await fetch(`${getApiUrl()}/api/tasks/reorder-subtasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        throw new Error('Failed to save subtask order');
      }

      // Reload tasks
      if (projects.length > 0) {
        await loadAllProjectsTasks(projects);
      }
    } catch (error) {
      console.error('Error reordering subtasks:', error);
      showAlert('Error', 'Failed to save subtask order');
    }

    setSubtasksModal(prev => ({ ...prev, draggedSubtask: null }));
  };

  const handleSubtaskDraggedToGantt = () => {
    // Close modal when subtask is dragged to gantt
    closeSubtasksModal();
  };

  // Calculate task depth level relative to a parent
  const getTaskDepthLevel = (task: Task, rootParentId: number): number => {
    let level = 0;
    let currentTask = task;
    
    while (currentTask.ParentTaskId && currentTask.ParentTaskId !== rootParentId) {
      level++;
      const parent = tasks.find(t => t.Id === currentTask.ParentTaskId);
      if (!parent) break;
      currentTask = parent;
    }
    
    return level;
  };

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    if (!permissions?.canPlanTasks || ganttSearch.trim().length > 0) {
      e.preventDefault();
      return;
    }
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!permissions?.canPlanTasks || ganttSearch.trim().length > 0) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnUser = async (e: React.DragEvent, userId: number | null) => {
    e.preventDefault();
    if (!draggedTask || !permissions?.canPlanTasks || ganttSearch.trim().length > 0) return;

    // Check if user has access to the project
    if (userId) {
      const taskProject = projects.find(p => p.Id === draggedTask.ProjectId);
      if (taskProject) {
        const userOrgs = userOrganizations[userId] || [];
        if (!userOrgs.includes(taskProject.OrganizationId)) {
          showAlert('No Access', 'This user does not have access to the project this task belongs to.');
          setDraggedTask(null);
          return;
        }
      }
    }

    await handleTaskUpdate(draggedTask, { AssignedTo: userId || undefined });
    setDraggedTask(null);
  };

  const handleDropOnDay = async (e: React.DragEvent, day: Date, userId: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedTask || !permissions?.canPlanTasks || ganttSearch.trim().length > 0 || !userId) return;

    const droppedDateStr = getDateKeyFromDate(day);
    const droppedDateHolidayNames = getUserHolidayNames(userId, droppedDateStr);
    if (droppedDateHolidayNames.length > 0) {
      showAlert(
        'Unavailable Day',
        `Cannot plan on unavailable day for this user (${droppedDateStr}): ${droppedDateHolidayNames.join(', ')}`
      );
      setDraggedTask(null);
      return;
    }

    // If dragged from subtasks modal, close it
    if (subtasksModal.show) {
      handleSubtaskDraggedToGantt();
    }

    // Check if user has access to the project
    const taskProject = projects.find(p => p.Id === draggedTask.ProjectId);
    if (taskProject) {
      const userOrgs = userOrganizations[userId] || [];
      if (!userOrgs.includes(taskProject.OrganizationId)) {
        showAlert('No Access', 'This user does not have access to the project this task belongs to.');
        setDraggedTask(null);
        return;
      }
    }

    // Check if this is a task with children (hierarchical task)
    const hasChildren = tasks.some(t => t.ParentTaskId === draggedTask.Id);
    
    if (hasChildren) {
      // Get all leaf tasks (tasks without children) recursively
      const leafTasks = getAllLeafTasks(draggedTask.Id);
      
      if (leafTasks.length === 0) {
        showAlert('No Leaf Tasks', 'No leaf tasks found to plan.');
        setDraggedTask(null);
        return;
      }

      // Calculate total hours from all leaf tasks
      let totalEstimatedHours = 0;
      let totalHoursWorked = 0;

      // Fetch time entries for all leaf tasks
      for (const leafTask of leafTasks) {
        const estimatedHours = parseFloat(String(leafTask.EstimatedHours || 0));
        totalEstimatedHours += estimatedHours;

        try {
          const timeEntriesRes = await fetch(
            `${getApiUrl()}/api/time-entries/task/${leafTask.Id}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (timeEntriesRes.ok) {
            const timeEntriesData = await timeEntriesRes.json();
            if (timeEntriesData.entries && timeEntriesData.entries.length > 0) {
              const hoursWorked = timeEntriesData.entries.reduce((sum: number, entry: any) => {
                return sum + parseFloat(entry.Hours || 0);
              }, 0);
              totalHoursWorked += hoursWorked;
            }
          }
        } catch (err) {
          console.error('Failed to fetch time entries for task:', leafTask.Id, err);
        }
      }

      const totalRemainingHours = totalEstimatedHours - totalHoursWorked;

      console.log('Hierarchical planning:', {
        parentTask: draggedTask.TaskName,
        leafTasksCount: leafTasks.length,
        totalEstimatedHours,
        totalHoursWorked,
        totalRemainingHours
      });

      if (totalRemainingHours <= 0) {
        showAlert(
          'No Remaining Hours',
          `All leaf tasks have no remaining hours.\n\nTotal Estimated: ${totalEstimatedHours}h\nAlready worked: ${totalHoursWorked}h`
        );
        setDraggedTask(null);
        return;
      }

      // Now plan the PARENT task with the total hours
      // This will create allocations for the parent, giving us the date range
      await planTaskAsParent(draggedTask, day, userId, totalRemainingHours, leafTasks, totalEstimatedHours, totalHoursWorked);
      setDraggedTask(null);
      return;
    }

    // Single task without children - check dependencies and plan normally
    if (draggedTask.DependsOnTaskId) {
      const dependsOnTask = tasks.find(t => t.Id === draggedTask.DependsOnTaskId);
      if (dependsOnTask) {
        // Check if the dependency task has a planned end date
        if (dependsOnTask.PlannedEndDate) {
          const dependencyEndDate = new Date(dependsOnTask.PlannedEndDate);
          dependencyEndDate.setHours(12, 0, 0, 0);
          const planningDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0);
          
          // Task can start on the same day the dependency ends
          if (planningDate < dependencyEndDate) {
            const minStartDate = new Date(dependencyEndDate);
            showAlert(
              'Dependency Constraint',
              `This task depends on "${dependsOnTask.TaskName}" which ends on ${dependencyEndDate.toLocaleDateString()}.\n\nPlease plan this task for ${minStartDate.toLocaleDateString()} or later.`
            );
            setDraggedTask(null);
            return;
          }
        } else {
          // Dependency task has no planned end date - it must be planned first
          showAlert(
            'Dependency Not Planned',
            `This task depends on "${dependsOnTask.TaskName}" which is not yet planned.\n\nPlease plan the dependency task first.`
          );
          setDraggedTask(null);
          return;
        }
      }
    }

    try {
      // Create date at noon to avoid timezone issues
      const startDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0);
      
      // Get user's work hours configuration
      const user = users.find(u => u.Id === userId);
      if (!user) {
        showAlert('Error', 'User not found');
        setDraggedTask(null);
        return;
      }

      const estimatedHours = draggedTask.EstimatedHours || 8;
      
      // Fetch time entries for this task to calculate hours already worked
      const timeEntriesRes = await fetch(
        `${getApiUrl()}/api/time-entries/task/${draggedTask.Id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      let hoursAlreadyWorked = 0;
      if (timeEntriesRes.ok) {
        const timeEntriesData = await timeEntriesRes.json();
        if (timeEntriesData.entries && timeEntriesData.entries.length > 0) {
          hoursAlreadyWorked = timeEntriesData.entries.reduce((sum: number, entry: any) => {
            return sum + parseFloat(entry.Hours || 0);
          }, 0);
        }
      }

      // Calculate remaining hours to plan
      const remainingHoursToWork = estimatedHours - hoursAlreadyWorked;

      // Check if there are remaining hours to plan
      if (remainingHoursToWork <= 0) {
        showAlert(
          'No Remaining Hours',
          `This task has no remaining hours to plan.\n\nEstimated: ${estimatedHours}h\nAlready worked: ${hoursAlreadyWorked.toFixed(2)}h\n\nPlease update the estimated hours if more work is needed.`
        );
        setDraggedTask(null);
        return;
      }
      
      // Check if task belongs to a hobby project (must be checked BEFORE work hours validation)
      const taskProject = projects.find(p => p.Id === draggedTask.ProjectId);
      const isHobbyTask = taskProject?.IsHobby || false;

      // Check if user has any working/hobby hours configured (depending on task type)
      const hasAnyHours = WEEK_DAYS.some(day => {
        const hoursKey = isHobbyTask
          ? `HobbyHours${day}` as keyof User
          : `WorkHours${day}` as keyof User;
        const hours = parseFloat(user[hoursKey] as any) || 0;
        return hours > 0;
      });

      if (!hasAnyHours) {
        const hoursType = isHobbyTask ? 'Hobby' : 'Work';
        showAlert(`No ${hoursType} Hours`, `User has no ${hoursType.toLowerCase()} hours configured. Please configure ${hoursType.toLowerCase()} hours in settings.`);
        setDraggedTask(null);
        return;
      }

      // Get hours for the dropped day (work or hobby depending on task type)
      const dayOfWeekForDrop = startDate.getDay();
      const dayNameForDrop = WEEK_DAYS[dayOfWeekForDrop];
      const hoursKeyForDrop = isHobbyTask 
        ? `HobbyHours${dayNameForDrop}` as keyof User 
        : `WorkHours${dayNameForDrop}` as keyof User;
      const dropDayHours = parseFloat(user[hoursKeyForDrop] as any) || 0;

      // Calculate the maximum daily capacity across ALL configured days for this project type
      const maxDailyHours = Math.max(...WEEK_DAYS.map(day => {
        const key = isHobbyTask ? `HobbyHours${day}` as keyof User : `WorkHours${day}` as keyof User;
        return parseFloat(user[key] as any) || 0;
      }));

      // Check if the dropped day is a work/hobby day
      if (dropDayHours <= 0) {
        const dayType = isHobbyTask ? 'hobby' : 'work';
        showAlert(
          `Not a ${isHobbyTask ? 'Hobby' : 'Work'} Day`,
          `${dayNameForDrop} is not configured as a ${dayType} day for this user.\n\nPlease drop the task on a day the user has ${dayType} hours, or configure ${dayType} hours in settings.`
        );
        setDraggedTask(null);
        return;
      }

      // Check if there are existing allocations on the drop day for the same type (hobby/work)
      const dateStr = startDate.toISOString().split('T')[0];
      const existingAllocationsRes = await fetch(
        `${getApiUrl()}/api/task-allocations/user/${userId}/date/${dateStr}?isHobby=${isHobbyTask}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      let existingTaskNames: string[] = [];
      let hasExistingAllocations = false;
      let hasRecurringOnDay = false;
      
      if (existingAllocationsRes.ok) {
        const existingData = await existingAllocationsRes.json();
        if (existingData.allocations && existingData.allocations.length > 0) {
          // Filter out recurring allocations - they can't be pushed forward
          const taskAllocations = existingData.allocations.filter((a: any) => !a.IsRecurring);
          const recurringAllocations = existingData.allocations.filter((a: any) => a.IsRecurring);
          
          if (taskAllocations.length > 0) {
            hasExistingAllocations = true;
            existingTaskNames = taskAllocations.map((a: any) => a.TaskName || `Task #${a.TaskId}`);
          }
          
          if (recurringAllocations.length > 0) {
            hasRecurringOnDay = true;
          }
        }
      }

      // If there are existing task allocations (not recurring), show the conflict modal
      if (hasExistingAllocations) {
        setConflictModal({
          show: true,
          task: draggedTask,
          userId,
          startDate,
          existingTasks: existingTaskNames,
          totalHoursToAllocate: remainingHoursToWork,
          hoursAlreadyWorked,
          maxDailyHours,
        });
        setDraggedTask(null);
        return;
      }

      console.log('Hours per day check:', { isHobbyTask, remainingHoursToWork, maxDailyHours, threshold: maxDailyHours * 0.5, shouldShowModal: remainingHoursToWork > maxDailyHours * 0.5, hoursAlreadyWorked });

      // Show modal to ask for hours per day if:
      // - There are hours already worked (user needs to confirm), OR
      // - Remaining hours are more than 50% of daily capacity
      if (hoursAlreadyWorked > 0 || remainingHoursToWork > maxDailyHours * 0.5) {
        console.log('Showing hours per day modal');
        const taskEstimatedHours = parseFloat(String(draggedTask.EstimatedHours || 0));
        setHoursPerDayModal({
          show: true,
          task: draggedTask,
          userId,
          startDate,
          maxDailyHours,
          hoursPerDay: maxDailyHours.toString(),
          totalHours: remainingHoursToWork,
          hoursAlreadyWorked: hoursAlreadyWorked,
          totalEstimatedHours: taskEstimatedHours,
        });
        setDraggedTask(null);
        return;
      }

      // Continue with allocation using full daily hours (small tasks with no worked hours)
      await executeTaskAllocation(draggedTask, userId, startDate, remainingHoursToWork, user, maxDailyHours);
    } catch (err) {
      console.error('Failed to allocate task:', err);
      showAlert('Error', 'Failed to allocate task');
      setDraggedTask(null);
    }
  };

  // Plan a parent task with children - allocate parent first, then distribute to children
  const planTaskAsParent = async (
    parentTask: Task,
    day: Date,
    userId: number,
    totalHours: number,
    leafTasks: Task[],
    totalEstimatedHours?: number,
    totalAlreadyWorked?: number
  ) => {
    try {
      const startDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0);
      const user = users.find(u => u.Id === userId);
      if (!user) {
        showAlert('Error', 'User not found');
        return;
      }

      const taskProject = projects.find(p => p.Id === parentTask.ProjectId);
      const isHobbyTask = taskProject?.IsHobby || false;

      // Get hours for the dropped day and max across all days
      const dayOfWeek = startDate.getDay();
      const dayName = WEEK_DAYS[dayOfWeek];
      const hoursKey = isHobbyTask 
        ? `HobbyHours${dayName}` as keyof User 
        : `WorkHours${dayName}` as keyof User;
      const dropDayHours = parseFloat(user[hoursKey] as any) || 0;

      // Calculate the maximum daily capacity across ALL configured days for this project type
      const maxDailyHours = Math.max(...WEEK_DAYS.map(d => {
        const k = isHobbyTask ? `HobbyHours${d}` as keyof User : `WorkHours${d}` as keyof User;
        return parseFloat(user[k] as any) || 0;
      }));

      if (dropDayHours <= 0) {
        showAlert(
          `Not a ${isHobbyTask ? 'Hobby' : 'Work'} Day`,
          `${dayName} is not configured as a ${isHobbyTask ? 'hobby' : 'work'} day for this user.`
        );
        return;
      }

      // Check for existing allocations on drop day
      const dateStr = startDate.toISOString().split('T')[0];
      const existingAllocationsRes = await fetch(
        `${getApiUrl()}/api/task-allocations/user/${userId}/date/${dateStr}?isHobby=${isHobbyTask}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      let existingTaskNames: string[] = [];
      let hasExistingAllocations = false;
      
      if (existingAllocationsRes.ok) {
        const existingData = await existingAllocationsRes.json();
        if (existingData.allocations && existingData.allocations.length > 0) {
          // Filter out recurring allocations - they can't be pushed forward
          const taskAllocations = existingData.allocations.filter((a: any) => !a.IsRecurring);
          
          if (taskAllocations.length > 0) {
            hasExistingAllocations = true;
            existingTaskNames = taskAllocations.map((a: any) => a.TaskName || `Task #${a.TaskId}`);
          }
        }
      }

      // If there are existing task allocations (not recurring), show the conflict modal
      if (hasExistingAllocations) {
        setConflictModal({
          show: true,
          task: parentTask,
          userId,
          startDate,
          existingTasks: existingTaskNames,
          totalHoursToAllocate: totalHours,
          hoursAlreadyWorked: totalAlreadyWorked || 0,
          maxDailyHours,
          isParentTask: true,
          leafTasks: leafTasks
        });
        return;
      }

      // Show modal to ask for hours per day if task requires more than 50% of daily capacity
      if (totalHours > maxDailyHours * 0.5) {
        setHoursPerDayModal({
          show: true,
          task: parentTask,
          userId,
          startDate,
          maxDailyHours,
          hoursPerDay: maxDailyHours.toString(),
          totalHours: totalHours,
          hoursAlreadyWorked: totalAlreadyWorked || 0,
          totalEstimatedHours: totalEstimatedHours || totalHours,
          isParentTask: true,
          leafTasks: leafTasks
        });
        return;
      }

      // Continue with full daily hours allocation
      await executeParentTaskAllocation(parentTask, userId, startDate, totalHours, user, maxDailyHours, leafTasks);
    } catch (err) {
      console.error('Failed to plan parent task:', err);
      showAlert('Error', 'Failed to plan parent task');
    }
  };

  // Execute parent task allocation with availability checking
  const executeParentTaskAllocation = async (
    parentTask: Task,
    userId: number,
    startDate: Date,
    totalHours: number,
    user: User,
    hoursPerDay: number,
    leafTasks: Task[]
  ) => {
    try {
      // Delete existing allocations for this parent task and its children before creating new ones
      try {
        const deleteRes = await fetch(
          `${getApiUrl()}/api/task-allocations/task/${parentTask.Id}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (!deleteRes.ok) {
          console.warn('Failed to delete existing allocations for parent task, continuing anyway');
        }
        
        // Also delete allocations for all leaf tasks
        for (const leafTask of leafTasks) {
          const leafDeleteRes = await fetch(
            `${getApiUrl()}/api/task-allocations/task/${leafTask.Id}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          if (!leafDeleteRes.ok) {
            console.warn(`Failed to delete existing allocations for leaf task ${leafTask.Id}, continuing anyway`);
          }
        }
      } catch (err) {
        console.error('Error deleting existing allocations:', err);
      }

      const taskProject = projects.find(p => p.Id === parentTask.ProjectId);
      const isHobbyTask = taskProject?.IsHobby || false;

      // Show planning progress modal
      setPlanningProgress({
        show: true,
        taskName: parentTask.TaskName,
        progress: 0,
        currentStep: 'Checking user availability...',
        totalHours: totalHours,
        allocatedHours: 0,
        daysProcessed: 0,
      });

      console.log(`Planning parent task "${parentTask.TaskName}" with ${totalHours}h from ${leafTasks.length} leaf tasks`);

      // Step 1: Fetch availability in a single call (includes both direct and child allocations)
      // Calculate window based on actual user daily hours for this task type
      // Use a very generous window to ensure we never run out of availability data
      const weeklyHours = WEEK_DAYS.reduce((sum, day) => {
        const key = isHobbyTask ? `HobbyHours${day}` as keyof User : `WorkHours${day}` as keyof User;
        return sum + (parseFloat(user[key] as any) || 0);
      }, 0);
      const avgDailyHours = weeklyHours / 7;
      const effectiveAvg = Math.max(avgDailyHours, 0.5); // minimum 0.5h/day to avoid huge windows
      const estimatedDays = Math.ceil(totalHours / effectiveAvg);
      // Use 5x multiplier to account for existing allocations consuming availability
      // This is especially important when user already has planning years ahead
      const windowDays = Math.max(Math.ceil(estimatedDays * 5), 365); // At least 1 year
      const preliminaryEndDate = new Date(startDate);
      preliminaryEndDate.setDate(preliminaryEndDate.getDate() + Math.min(windowDays, 5475)); // Cap at 15 years

      console.log('Availability window calculation:', { 
        isHobbyTask, weeklyHours, avgDailyHours, effectiveAvg, 
        estimatedDays, windowDays, totalHours,
        startDate: startDate.toISOString().split('T')[0],
        endDate: preliminaryEndDate.toISOString().split('T')[0]
      });
      
      const availabilityRes = await fetch(
        `${getApiUrl()}/api/task-allocations/availability/${userId}?startDate=${startDate.toISOString().split('T')[0]}&endDate=${preliminaryEndDate.toISOString().split('T')[0]}&excludeTaskId=${parentTask.Id}&isHobby=${isHobbyTask}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!availabilityRes.ok) {
        setPlanningProgress(prev => ({ ...prev, show: false }));
        showAlert('Error', 'Failed to check user availability');
        return;
      }

      const availabilityData = await availabilityRes.json();
      const availability = availabilityData.availability;

      console.log('Availability data received:', {
        totalDays: availability.length,
        daysWithAvailability: availability.filter((a: any) => (parseFloat(String(a.availableHours)) || 0) > 0).length,
        totalAvailableHours: availability.reduce((sum: number, a: any) => sum + (parseFloat(String(a.availableHours)) || 0), 0),
        totalMaxHours: availability.reduce((sum: number, a: any) => sum + (parseFloat(String(a.maxHours)) || 0), 0),
        totalAllocatedHours: availability.reduce((sum: number, a: any) => sum + (parseFloat(String(a.allocatedHours)) || 0), 0),
        hoursNeeded: totalHours,
        userIdRequested: userId,
        parentTaskId: parentTask.Id,
        windowDays,
        searchPeriod: `${startDate.toISOString().split('T')[0]} to ${preliminaryEndDate.toISOString().split('T')[0]}`,
        sampleFirstFiveDays: availability.slice(0, 5).map((a: any) => ({
          date: a.date,
          maxHours: a.maxHours,
          allocatedHours: a.allocatedHours,
          availableHours: a.availableHours,
          latestEndTime: a.latestEndTime
        }))
      });

      setPlanningProgress(prev => ({
        ...prev,
        progress: 15,
        currentStep: 'Calculating allocation schedule...',
      }));

      // Step 2: Calculate allocations locally using availability data
      // Safety: if hoursPerDay is 0/NaN (edge case), derive from user's actual schedule
      let effectiveHoursPerDay = hoursPerDay;
      if (!effectiveHoursPerDay || isNaN(effectiveHoursPerDay) || effectiveHoursPerDay <= 0) {
        effectiveHoursPerDay = Math.max(...WEEK_DAYS.map(d => {
          const k = isHobbyTask ? `HobbyHours${d}` as keyof User : `WorkHours${d}` as keyof User;
          return parseFloat(user[k] as any) || 0;
        }));
        if (effectiveHoursPerDay <= 0) effectiveHoursPerDay = 8; // absolute fallback
        console.warn(`hoursPerDay was ${hoursPerDay} — derived ${effectiveHoursPerDay}h from user schedule`);
      }

      const allocations: any[] = [];
      let remainingHours = totalHours;
      const lunchTimeValue = (typeof user.LunchTime === 'string' && user.LunchTime.includes(':'))
        ? user.LunchTime
        : '12:00';
      const lunchDurationMinutes = isHobbyTask
        ? 0
        : ((typeof user.LunchDuration === 'number' && user.LunchDuration >= 0) ? user.LunchDuration : 60);
      const [lunchHour, lunchMin] = lunchTimeValue.split(':').map(Number);
      const lunchStartMinutes = (lunchHour * 60) + lunchMin;
      const lunchEndMinutes = lunchStartMinutes + lunchDurationMinutes;

      for (const dayAvailability of availability) {
        if (remainingHours <= 0) break;

        if (isUserHoliday(userId, String(dayAvailability.date))) {
          continue;
        }

        // Trust the backend's availableHours — it already accounts for capacity and the time window.
        const dayAvail = parseFloat(String(dayAvailability.availableHours)) || 0;
        if (dayAvail <= 0) continue;

        // Get effective start time for time-slot tracking
        let effectiveStartTime = (dayAvailability.latestEndTime || dayAvailability.workStartTime || '09:00') as string;

        // hoursToAllocate = min of: remaining total, day's available hours, user's daily cap
        const hoursToAllocate = Math.min(remainingHours, dayAvail, effectiveHoursPerDay);
        if (hoursToAllocate <= 0) continue;

        let [startHour, startMin] = effectiveStartTime.split(':').map(Number);
        let startMinutes = (startHour * 60) + startMin;

        if (lunchDurationMinutes > 0 && startMinutes >= lunchStartMinutes && startMinutes < lunchEndMinutes) {
          startMinutes = lunchEndMinutes;
          effectiveStartTime = `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`;
        }

        const endWithoutLunch = startMinutes + (hoursToAllocate * 60);

        if (lunchDurationMinutes > 0 && startMinutes < lunchStartMinutes && endWithoutLunch > lunchStartMinutes) {
          const hoursBeforeLunch = Math.max(0, (lunchStartMinutes - startMinutes) / 60);

          if (hoursBeforeLunch > 0 && hoursBeforeLunch < hoursToAllocate) {
            const endBeforeLunchTime = `${String(Math.floor(lunchStartMinutes / 60)).padStart(2, '0')}:${String(lunchStartMinutes % 60).padStart(2, '0')}`;
            allocations.push({
              date: dayAvailability.date,
              hours: Number(hoursBeforeLunch.toFixed(2)),
              startTime: effectiveStartTime,
              endTime: endBeforeLunchTime
            });

            const hoursAfterLunch = hoursToAllocate - hoursBeforeLunch;
            const startAfterLunchTime = `${String(Math.floor(lunchEndMinutes / 60)).padStart(2, '0')}:${String(lunchEndMinutes % 60).padStart(2, '0')}`;
            const endAfterLunchMinutes = lunchEndMinutes + (hoursAfterLunch * 60);
            const endAfterLunchTime = `${String(Math.floor(endAfterLunchMinutes / 60)).padStart(2, '0')}:${String(Math.round(endAfterLunchMinutes % 60)).padStart(2, '0')}`;
            allocations.push({
              date: dayAvailability.date,
              hours: Number(hoursAfterLunch.toFixed(2)),
              startTime: startAfterLunchTime,
              endTime: endAfterLunchTime
            });
          } else {
            const adjustedEndMinutes = endWithoutLunch + lunchDurationMinutes;
            const adjustedEndTime = `${String(Math.floor(adjustedEndMinutes / 60)).padStart(2, '0')}:${String(Math.round(adjustedEndMinutes % 60)).padStart(2, '0')}`;
            allocations.push({
              date: dayAvailability.date,
              hours: Number(hoursToAllocate.toFixed(2)),
              startTime: effectiveStartTime,
              endTime: adjustedEndTime
            });
          }
        } else {
          const endTime = `${String(Math.floor(endWithoutLunch / 60)).padStart(2, '0')}:${String(Math.round(endWithoutLunch % 60)).padStart(2, '0')}`;
          allocations.push({
            date: dayAvailability.date,
            hours: Number(hoursToAllocate.toFixed(2)),
            startTime: effectiveStartTime,
            endTime: endTime
          });
        }

        remainingHours -= hoursToAllocate;
      }

      if (remainingHours > 0) {
        const totalAvailH = availability.reduce((sum: number, a: any) => sum + (parseFloat(String(a.availableHours)) || 0), 0);
        const availDayCount = availability.filter((a: any) => (parseFloat(String(a.availableHours)) || 0) > 0).length;
        
        // Find the last date checked
        const lastDateChecked = availability[availability.length - 1]?.date || preliminaryEndDate.toISOString().split('T')[0];
        
        console.error('Partial allocation failed:', {
          totalHours,
          remainingHours,
          allocationsCreated: allocations.length,
          availabilityDays: availability.length,
          availableDaysWithHours: availDayCount,
          totalAvailableHours: totalAvailH,
          effectiveHoursPerDay,
          hoursPerDay,
          leafTasksCount: leafTasks.length,
          windowDays,
          searchPeriod: `${startDate.toISOString().split('T')[0]} to ${lastDateChecked}`,
          yearsDiff: Math.ceil(windowDays / 365),
        });
        setPlanningProgress(prev => ({ ...prev, show: false }));
        
        const yearsDiff = Math.ceil(windowDays / 365);
        showAlert('Partial Allocation', 
          `Unable to fully allocate task - ${remainingHours.toFixed(2)}h remaining.\n\n` +
          `Searched: ${windowDays} days (~${yearsDiff} years)\n` +
          `From: ${startDate.toISOString().split('T')[0]}\n` +
          `To: ${lastDateChecked}\n\n` +
          `Available: ${totalAvailH.toFixed(2)}h across ${availDayCount} days\n` +
          `Per day cap: ${effectiveHoursPerDay}h\n\n` +
          `The user may have other tasks scheduled consuming time.\n` +
          `Consider increasing daily capacity or rescheduling tasks.`
        );
        return;
      }

      const parentPlannedEndDate = getLatestAllocationDate(allocations);
      if (!validateMandatoryDueDateForPlan(parentTask, parentPlannedEndDate)) {
        setPlanningProgress(prev => ({ ...prev, show: false }));
        return;
      }

      console.log(`Created ${allocations.length} allocation days for parent task`);

      setPlanningProgress(prev => ({
        ...prev,
        progress: 30,
        currentStep: 'Saving parent task allocations...',
        allocatedHours: totalHours - remainingHours,
        daysProcessed: allocations.length,
      }));

      // Step 2: Save parent allocations
      const response = await fetch(
        `${getApiUrl()}/api/task-allocations`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            taskId: parentTask.Id,
            userId: userId,
            allocations: allocations
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to allocate parent task:', error);
        setPlanningProgress(prev => ({ ...prev, show: false }));
        showAlert('Error', 'Failed to allocate parent task');
        return;
      }

      const parentPlannedStartDate = allocations.length > 0 ? allocations[0].date : null;
      await persistPlannedTaskAssignment(parentTask, userId, parentPlannedStartDate, parentPlannedEndDate);

      setPlanningProgress(prev => ({
        ...prev,
        progress: 50,
        currentStep: 'Reloading tasks...',
      }));

      console.log('Parent task allocated successfully, reloading tasks...');

      // Step 3: Reload all tasks to get the parent task with PlannedStartDate/PlannedEndDate
      await loadAllProjectsTasks(projects);
      
      // Wait a bit for state to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setPlanningProgress(prev => ({
        ...prev,
        progress: 60,
        currentStep: 'Distributing to child tasks...',
      }));

      // Step 4: Distribute allocations to ALL children (not just leaf tasks) recursively
      await distributeToDirectChildren(
        parentTask.Id,
        allocations,
        1, // level 1 (direct children of parent)
        userId,
        isHobbyTask
      );

      setPlanningProgress(prev => ({
        ...prev,
        progress: 90,
        currentStep: 'Refreshing view...',
      }));

      // Step 5: Final reload to show everything updated
      await loadAllProjectsTasks(projects);
      await loadAllAllocations();

      setPlanningProgress(prev => ({
        ...prev,
        progress: 100,
        currentStep: 'Complete!',
      }));

      // Close modal after short delay to show completion
      setTimeout(() => {
        setPlanningProgress(prev => ({ ...prev, show: false }));
      }, 500);

      console.log('Hierarchical planning completed successfully');

    } catch (err) {
      console.error('Failed to plan parent task:', err);
      setPlanningProgress(prev => ({ ...prev, show: false }));
      showAlert('Error', 'Failed to plan parent task');
    }
  };

  // Distribute allocations to direct children recursively
  const distributeToDirectChildren = async (
    parentTaskId: number,
    parentAllocations: any[], // array of {date, hours, startTime, endTime}
    level: number,
    plannedUserId: number,
    isHobbyTask: boolean
  ) => {
    const getTaskOrder = (task: Task): number => {
      const order = Number(task.DisplayOrder);
      return Number.isFinite(order) ? order : 0;
    };

    // Get DIRECT children of this parent (not all descendants)
    const directChildren = tasks
      .filter(t => t.ParentTaskId === parentTaskId)
      .sort((a, b) => {
        const orderDiff = getTaskOrder(a) - getTaskOrder(b);
        if (orderDiff !== 0) return orderDiff;
        return a.Id - b.Id;
      });
    
    if (directChildren.length === 0) {
      console.log(`Parent task ${parentTaskId} has no children`);
      return;
    }

    console.log(`Distributing to ${directChildren.length} direct children of parent ${parentTaskId} at level ${level}`);

    // Calculate total parent hours and total children estimated hours
    const totalParentHours = parentAllocations.reduce((sum, alloc) => sum + parseFloat(alloc.hours), 0);
    const totalChildrenHours = directChildren.reduce((sum, child) => sum + parseFloat(String(child.EstimatedHours || 0)), 0);
    
    console.log(`Parent has ${totalParentHours.toFixed(2)}h allocated, children need ${totalChildrenHours.toFixed(2)}h total`);
    
    if (totalChildrenHours > totalParentHours) {
      console.warn(`WARNING: Children need more hours (${totalChildrenHours.toFixed(2)}h) than parent has (${totalParentHours.toFixed(2)}h). Some tasks may not be fully allocated.`);
    }

    const parseTimeToMinutes = (time: string): number => {
      const [hours, minutes] = String(time || '09:00').split(':').map(Number);
      return (hours || 0) * 60 + (minutes || 0);
    };

    const formatMinutesToTime = (minutes: number): string => {
      const safeMinutes = Math.max(0, Math.round(minutes));
      const hours = Math.floor(safeMinutes / 60);
      const mins = safeMinutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    };

    const plannedUser = users.find(u => u.Id === plannedUserId);
    const lunchTime = (!isHobbyTask && plannedUser?.LunchTime && String(plannedUser.LunchTime).includes(':'))
      ? String(plannedUser.LunchTime)
      : '12:00';
    const lunchDuration = !isHobbyTask
      ? Math.max(0, Number(plannedUser?.LunchDuration ?? 60))
      : 0;
    const [lunchHour, lunchMinute] = lunchTime.split(':').map(Number);
    const lunchStartMinutes = lunchHour * 60 + lunchMinute;
    const lunchEndMinutes = lunchStartMinutes + lunchDuration;

    const splitSlotByLunch = (slot: { date: string; startTime: string; hours: number }) => {
      const segments: { date: string; startMinutes: number; endMinutes: number; remainingHours: number; cursorMinutes: number }[] = [];
      let remainingMinutes = Math.round((parseFloat(String(slot.hours)) || 0) * 60);
      let currentMinutes = parseTimeToMinutes(slot.startTime || '09:00');

      if (remainingMinutes <= 0) return segments;

      if (lunchDuration > 0 && currentMinutes >= lunchStartMinutes && currentMinutes < lunchEndMinutes) {
        currentMinutes = lunchEndMinutes;
      }

      while (remainingMinutes > 0) {
        if (lunchDuration > 0 && currentMinutes < lunchStartMinutes) {
          const minutesUntilLunch = lunchStartMinutes - currentMinutes;
          const chunkMinutes = Math.min(remainingMinutes, minutesUntilLunch);
          if (chunkMinutes > 0) {
            segments.push({
              date: slot.date,
              startMinutes: currentMinutes,
              endMinutes: currentMinutes + chunkMinutes,
              remainingHours: chunkMinutes / 60,
              cursorMinutes: currentMinutes,
            });
            currentMinutes += chunkMinutes;
            remainingMinutes -= chunkMinutes;
          }

          if (remainingMinutes > 0 && currentMinutes >= lunchStartMinutes && currentMinutes < lunchEndMinutes) {
            currentMinutes = lunchEndMinutes;
          }
          continue;
        }

        if (lunchDuration > 0 && currentMinutes >= lunchStartMinutes && currentMinutes < lunchEndMinutes) {
          currentMinutes = lunchEndMinutes;
          continue;
        }

        segments.push({
          date: slot.date,
          startMinutes: currentMinutes,
          endMinutes: currentMinutes + remainingMinutes,
          remainingHours: remainingMinutes / 60,
          cursorMinutes: currentMinutes,
        });
        remainingMinutes = 0;
      }

      return segments;
    };

    const parentTimeSlots = parentAllocations
      .flatMap((alloc: any) => splitSlotByLunch({
        date: alloc.date,
        startTime: alloc.startTime || '09:00',
        hours: parseFloat(String(alloc.hours || 0)),
      }))
      .filter(slot => slot.remainingHours > 0.0001)
      .sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.startMinutes - b.startMinutes;
      });

    if (parentTimeSlots.length === 0) {
      console.warn(`No parent time slots available for parent ${parentTaskId}`);
      return;
    }

    // Create child allocations SEQUENTIALLY
    const childAllocations: any[] = [];
    let currentSlotIndex = 0;
    
    for (const child of directChildren) {
      const childHours = parseFloat(String(child.EstimatedHours || 0));
      
      if (childHours <= 0) {
        console.log(`Skipping child ${child.TaskName} - no estimated hours`);
        continue;
      }
      
      let remainingChildHours = childHours;
      const childAllocs: any[] = [];
      
      console.log(`Allocating ${childHours}h for child "${child.TaskName}" at level ${level}`);
      
      // Allocate sequentially across parent time slots
      while (remainingChildHours > 0.0001 && currentSlotIndex < parentTimeSlots.length) {
        const slot = parentTimeSlots[currentSlotIndex];
        const availableHoursInSlot = slot.remainingHours;
        const hoursToAllocate = Math.min(remainingChildHours, availableHoursInSlot);
        
        if (hoursToAllocate > 0.0001) {
          const minutesToAllocate = Math.round(hoursToAllocate * 60);
          const childStartMinutes = slot.cursorMinutes;
          const childEndMinutes = childStartMinutes + minutesToAllocate;
          const childStartTime = formatMinutesToTime(childStartMinutes);
          const childEndTime = formatMinutesToTime(childEndMinutes);
          const roundedHours = Number((minutesToAllocate / 60).toFixed(2));
          
          const allocation = {
            ParentTaskId: parentTaskId,
            ChildTaskId: child.Id,
            AllocationDate: slot.date,
            AllocatedHours: roundedHours,
            Level: level,
            StartTime: childStartTime,
            EndTime: childEndTime
          };
          
          childAllocations.push(allocation);
          childAllocs.push({ 
            date: slot.date,
            hours: roundedHours,
            startTime: childStartTime,
            endTime: childEndTime
          });
          
          remainingChildHours -= roundedHours;
          
          // Update slot for next child
          slot.remainingHours = Math.max(0, slot.remainingHours - roundedHours);
          slot.cursorMinutes = childEndMinutes;
          
          // If we used all hours in this slot, move to next slot
          if (slot.remainingHours <= 0.0001) {
            currentSlotIndex++;
          }
        } else {
          currentSlotIndex++;
        }
      }
      
      console.log(`Child "${child.TaskName}" allocated ${childAllocs.length} days`);
      
      // Check if child didn't get all its hours allocated
      if (remainingChildHours > 0.01) {
        console.warn(`WARNING: Child "${child.TaskName}" still needs ${remainingChildHours.toFixed(2)}h but parent has no more time available`);
      }
      
      // If this child also has children, distribute recursively
      const hasChildren = tasks.some(t => t.ParentTaskId === child.Id);
      if (hasChildren && childAllocs.length > 0) {
        console.log(`Child "${child.TaskName}" has children, distributing recursively...`);
        await distributeToDirectChildren(child.Id, childAllocs, level + 1, plannedUserId, isHobbyTask);
      }
    }

    // Save child allocations to database
    if (childAllocations.length > 0) {
      const saveRes = await fetch(
        `${getApiUrl()}/api/task-child-allocations/batch`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ allocations: childAllocations }),
        }
      );

      if (!saveRes.ok) {
        console.error('Failed to save child allocations for parent', parentTaskId);
      } else {
        console.log(`Saved ${childAllocations.length} child allocations for parent ${parentTaskId}`);
      }
    }
  };

  // Old function - keeping for reference but not used anymore
  const distributeParentAllocationsToChildren_OLD = async (
    parentTaskId: number,
    parentAllocations: any[], // array of {date, hours, startTime, endTime}
    leafTasks: Task[],
    level: number
  ) => {
    // Group allocations by date
    const allocationsByDate = parentAllocations.reduce((acc: any, alloc: any) => {
      const date = alloc.date;
      if (!acc[date]) acc[date] = 0;
      acc[date] += parseFloat(alloc.hours);
      return acc;
    }, {});

    const dates = Object.keys(allocationsByDate).sort();
    
    console.log(`Distributing ${dates.length} days across ${leafTasks.length} leaf tasks sequentially`);

    // Create child allocations for each leaf task SEQUENTIALLY (not proportionally)
    // Each task uses days in order until its hours are complete, then next task starts
    const childAllocations: any[] = [];
    
    let currentDateIndex = 0;
    
    for (const leafTask of leafTasks) {
      const taskHours = parseFloat(String(leafTask.EstimatedHours || 0));
      
      if (taskHours <= 0) {
        console.log(`Skipping leaf task ${leafTask.TaskName} - no estimated hours`);
        continue;
      }
      
      let remainingTaskHours = taskHours;
      console.log(`Allocating ${taskHours}h for task "${leafTask.TaskName}"`);
      
      // Allocate days sequentially until this task's hours are complete
      while (remainingTaskHours > 0 && currentDateIndex < dates.length) {
        const date = dates[currentDateIndex];
        const availableHoursThisDay = allocationsByDate[date];
        const hoursToAllocate = Math.min(remainingTaskHours, availableHoursThisDay);
        
        if (hoursToAllocate > 0) {
          childAllocations.push({
            ParentTaskId: parentTaskId,
            ChildTaskId: leafTask.Id,
            AllocationDate: date,
            AllocatedHours: Number(hoursToAllocate.toFixed(2)),
            Level: level
          });
          
          remainingTaskHours -= hoursToAllocate;
          
          // If we used all hours for this day, move to next day
          if (hoursToAllocate >= availableHoursThisDay) {
            currentDateIndex++;
          } else {
            // Partial day used - update remaining hours for this day
            allocationsByDate[date] -= hoursToAllocate;
          }
        } else {
          currentDateIndex++;
        }
      }
      
      console.log(`Task "${leafTask.TaskName}" allocated with ${taskHours - remainingTaskHours}h`);
    }

    // Save child allocations to database
    if (childAllocations.length > 0) {
      const saveRes = await fetch(
        `${getApiUrl()}/api/task-child-allocations/batch`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ allocations: childAllocations }),
        }
      );

      if (!saveRes.ok) {
        console.error('Failed to save child allocations');
      } else {
        console.log(`Saved ${childAllocations.length} child allocations`);
      }
    }
  };

  // Handle conflict modal - push forward existing tasks
  const handleConflictPushForward = async () => {
    const { task, userId, startDate, totalHoursToAllocate, hoursAlreadyWorked, maxDailyHours, isParentTask, leafTasks } = conflictModal;
    if (!task || !userId || !startDate) return;

    const user = users.find(u => u.Id === userId);
    if (!user) return;

    setConflictModal(prev => ({ ...prev, show: false }));

    // Show hours per day modal for confirmation
    const taskEstimatedHours = isParentTask && leafTasks 
      ? leafTasks.reduce((sum, t) => sum + parseFloat(String(t.EstimatedHours || 0)), 0)
      : parseFloat(String(task.EstimatedHours || 0));
    
    setHoursPerDayModal({
      show: true,
      task,
      userId,
      startDate,
      maxDailyHours,
      hoursPerDay: maxDailyHours.toString(),
      totalHours: totalHoursToAllocate,
      hoursAlreadyWorked,
      totalEstimatedHours: taskEstimatedHours,
      isParentTask,
      leafTasks,
      usePushForward: true // Flag to indicate we should use push-forward
    });
  };

  // Handle conflict modal - plan when available (use available slots)
  const handleConflictPlanAvailable = async () => {
    const { task, userId, startDate, totalHoursToAllocate, hoursAlreadyWorked, maxDailyHours, isParentTask, leafTasks } = conflictModal;
    if (!task || !userId || !startDate) return;

    const user = users.find(u => u.Id === userId);
    if (!user) return;

    setConflictModal(prev => ({ ...prev, show: false }));

    // Show hours per day modal if needed
    if (hoursAlreadyWorked > 0 || totalHoursToAllocate > maxDailyHours * 0.5) {
      const taskEstimatedHours = isParentTask && leafTasks 
        ? leafTasks.reduce((sum, t) => sum + parseFloat(String(t.EstimatedHours || 0)), 0)
        : parseFloat(String(task.EstimatedHours || 0));
      setHoursPerDayModal({
        show: true,
        task,
        userId,
        startDate,
        maxDailyHours,
        hoursPerDay: maxDailyHours.toString(),
        totalHours: totalHoursToAllocate,
        hoursAlreadyWorked,
        totalEstimatedHours: taskEstimatedHours,
        isParentTask,
        leafTasks
      });
    } else {
      // Directly allocate using available hours
      if (isParentTask && leafTasks) {
        await executeParentTaskAllocation(task, userId, startDate, totalHoursToAllocate, user, maxDailyHours, leafTasks);
      } else {
        await executeTaskAllocation(task, userId, startDate, totalHoursToAllocate, user, maxDailyHours);
      }
    }
  };

  // Handle confirmation from hours per day modal
  const handleHoursPerDayConfirm = async () => {
    const { task, userId, startDate, totalHours, hoursPerDay, maxDailyHours, isParentTask, leafTasks, usePushForward } = hoursPerDayModal;
    if (!task || !userId || !startDate) return;

    const user = users.find(u => u.Id === userId);
    if (!user) return;

    // Use the parsed value, capped at the actual daily capacity (not a fixed 8h fallback)
    const parsedHours = parseFloat(hoursPerDay);
    const maxHoursPerDay = (isNaN(parsedHours) || parsedHours <= 0) ? maxDailyHours : Math.min(parsedHours, maxDailyHours);
    
    setHoursPerDayModal(prev => ({ ...prev, show: false }));
    
    // If usePushForward flag is set, use push-forward endpoint
    if (usePushForward) {
      try {
        const dateStr = startDate.toISOString().split('T')[0];

        // Push forward: backend will allocate the new task FIRST, then replan existing tasks
        const pushRes = await fetch(
          `${getApiUrl()}/api/task-allocations/push-forward`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId,
              fromDate: dateStr,
              newTaskId: task.Id,
              newTaskHours: totalHours,
            }),
          }
        );

        if (!pushRes.ok) {
          showAlert('Error', 'Failed to push forward existing tasks');
          return;
        }
        
        // Reload tasks and allocations to refresh the Gantt chart
        if (projects.length > 0) {
          await loadAllProjectsTasks(projects);
          await loadAllAllocations();
        }
      } catch (err) {
        console.error('Failed to push forward:', err);
        showAlert('Error', 'Failed to push forward allocations');
      }
    } else {
      // Normal allocation (plan when available)
      if (isParentTask && leafTasks) {
        await executeParentTaskAllocation(task, userId, startDate, totalHours, user, maxHoursPerDay, leafTasks);
      } else {
        await executeTaskAllocation(task, userId, startDate, totalHours, user, maxHoursPerDay);
      }
    }
  };

  // Execute the actual task allocation
  const executeTaskAllocation = async (
    task: Task,
    userId: number,
    startDate: Date,
    remainingHoursToWork: number,
    user: User,
    maxHoursPerDay: number
  ) => {
    try {
      // Delete existing allocations for this task before creating new ones
      try {
        const deleteRes = await fetch(
          `${getApiUrl()}/api/task-allocations/task/${task.Id}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (!deleteRes.ok) {
          console.warn('Failed to delete existing allocations, continuing anyway');
        }
      } catch (err) {
        console.error('Error deleting existing allocations:', err);
      }

      // Show planning progress modal
      setPlanningProgress({
        show: true,
        taskName: task.TaskName,
        progress: 0,
        currentStep: 'Checking user availability...',
        totalHours: remainingHoursToWork,
        allocatedHours: 0,
        daysProcessed: 0,
      });

      // Check if task belongs to a hobby project
      const project = projects.find(p => p.Id === task.ProjectId);
      const isHobby = project?.IsHobby || false;

      // Get user availability to calculate realistic allocation
      // Calculate window based on actual user daily hours for this task type
      const weeklyHoursForTask = WEEK_DAYS.reduce((sum, day) => {
        const key = isHobby ? `HobbyHours${day}` as keyof User : `WorkHours${day}` as keyof User;
        return sum + (parseFloat(user[key] as any) || 0);
      }, 0);
      const avgDailyHoursForTask = weeklyHoursForTask / 7;
      const effectiveAvgForTask = Math.max(avgDailyHoursForTask, 0.5); // minimum 0.5h/day to avoid huge windows
      const estimatedDays = Math.ceil(remainingHoursToWork / effectiveAvgForTask);
      // Use 5x multiplier to account for existing allocations consuming availability
      const windowDaysForTask = Math.max(Math.ceil(estimatedDays * 5), 365); // At least 1 year
      const preliminaryEndDate = new Date(startDate);
      preliminaryEndDate.setDate(preliminaryEndDate.getDate() + Math.min(windowDaysForTask, 5475)); // Cap at 15 years
      
      const availabilityRes = await fetch(
        `${getApiUrl()}/api/task-allocations/availability/${userId}?startDate=${startDate.toISOString().split('T')[0]}&endDate=${preliminaryEndDate.toISOString().split('T')[0]}&excludeTaskId=${task.Id}&isHobby=${isHobby}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!availabilityRes.ok) {
        showAlert('Error', 'Failed to check user availability');
        return;
      }

      const availabilityData = await availabilityRes.json();
      const availability = availabilityData.availability;

      setPlanningProgress(prev => ({
        ...prev,
        progress: 20,
        currentStep: 'Calculating allocation schedule...',
      }));

      // Calculate allocation across days using actual availability and REMAINING hours only
      const allocations: { date: string; hours: number; startTime: string; endTime: string }[] = [];
      let remainingHours = remainingHoursToWork; // Use remaining hours instead of total estimated hours
      const currentDate = new Date(startDate);
      let daysProcessed = 0;
      const maxDaysToProcess = 1825; // 5 years to support long-term projects
      
      // Get user's lunch settings with validation (only applies to non-hobby tasks)
      const userLunchTimeRaw = user.LunchTime;
      const userLunchTime = (typeof userLunchTimeRaw === 'string' && userLunchTimeRaw.includes(':')) 
        ? userLunchTimeRaw 
        : '12:00';
      const userLunchDuration = isHobby ? 0 : ((typeof user.LunchDuration === 'number' && user.LunchDuration >= 0) 
        ? user.LunchDuration 
        : 60);
      const [lunchHour, lunchMin] = userLunchTime.split(':').map(Number);
      const lunchStartMinutes = lunchHour * 60 + lunchMin;
      const lunchEndMinutes = lunchStartMinutes + userLunchDuration;

      console.log('Planning with settings:', { isHobby, maxHoursPerDay, userLunchTime, userLunchDuration, lunchStartMinutes, lunchEndMinutes, userId: user.Id, totalHoursToAllocate: remainingHoursToWork });
      
      while (remainingHours > 0 && daysProcessed < maxDaysToProcess) {
        const dateStr = currentDate.toISOString().split('T')[0];

        if (isUserHoliday(userId, dateStr)) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        const dayAvailability = availability.find((a: any) => a.date === dateStr);
        
        if (dayAvailability && dayAvailability.availableHours > 0) {
          // Get start time for this day - use hobby or work start depending on task type
          const dayOfWeek = currentDate.getDay();
          const dayName = WEEK_DAYS[dayOfWeek];
          const startKey = isHobby ? `HobbyStart${dayName}` as keyof User : `WorkStart${dayName}` as keyof User;
          const defaultStartTime = (user[startKey] as string) || (isHobby ? '19:00' : '09:00');
          
          // If there are existing allocations, start from their end time
          let effectiveStartTime = defaultStartTime;
          if (dayAvailability.latestEndTime) {
            effectiveStartTime = dayAvailability.latestEndTime;
          }
          
          // Calculate the window end time (slot start + max hours for this day)
          const [slotStartH, slotStartM] = defaultStartTime.split(':').map(Number);
          const slotEndMinutes = (slotStartH * 60 + slotStartM) + dayAvailability.maxHours * 60;
          
          // Calculate how much time remains in the window from the effective start
          const [effStartH, effStartM] = effectiveStartTime.split(':').map(Number);
          const effStartMinutes = effStartH * 60 + effStartM;
          const remainingWindowHours = Math.max(0, (slotEndMinutes - effStartMinutes) / 60);
          
          // Skip this day if effective start is past the window end
          if (remainingWindowHours <= 0) {
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
          }
          
          // Limit hours to: remaining hours, available hours, max hours per day (from modal), day's type capacity, and remaining window
          const dayMaxHours = dayAvailability.maxHours || 0;
          const hoursToAllocate = Math.min(remainingHours, dayAvailability.availableHours, maxHoursPerDay, dayMaxHours, remainingWindowHours);
          
          console.log(`Day ${dateStr}: available=${dayAvailability.availableHours}, maxPerDay=${maxHoursPerDay}, dayMax=${dayMaxHours}, window=${remainingWindowHours.toFixed(2)}, allocating=${hoursToAllocate}`);
          
          if (hoursToAllocate <= 0) {
            currentDate.setDate(currentDate.getDate() + 1);
            continue;
          }
          
          // Calculate times considering lunch break (only for non-hobby)
          const [startHour, startMin] = effectiveStartTime.split(':').map(Number);
          let workStartMinutes = startHour * 60 + startMin;
          
          // If start time is during lunch, push to after lunch
          if (userLunchDuration > 0 && workStartMinutes >= lunchStartMinutes && workStartMinutes < lunchEndMinutes) {
            workStartMinutes = lunchEndMinutes;
            const adjustedHour = Math.floor(workStartMinutes / 60);
            const adjustedMin = workStartMinutes % 60;
            effectiveStartTime = `${String(adjustedHour).padStart(2, '0')}:${String(adjustedMin).padStart(2, '0')}`;
          }
          
          // Check if work spans across lunch
          const workEndMinutesWithoutLunch = workStartMinutes + hoursToAllocate * 60;
          
          if (userLunchDuration > 0 && workStartMinutes < lunchStartMinutes && workEndMinutesWithoutLunch > lunchStartMinutes) {
            // Work spans across lunch - need to split
            
            // Hours before lunch
            const hoursBeforeLunch = Math.max(0, (lunchStartMinutes - workStartMinutes) / 60);
            
            if (hoursBeforeLunch > 0 && hoursBeforeLunch < hoursToAllocate) {
              // Part before lunch
              const endBeforeLunchHour = Math.floor(lunchStartMinutes / 60);
              const endBeforeLunchMin = lunchStartMinutes % 60;
              const endBeforeLunchTime = `${String(endBeforeLunchHour).padStart(2, '0')}:${String(endBeforeLunchMin).padStart(2, '0')}`;
              
              allocations.push({
                date: dateStr,
                hours: hoursBeforeLunch,
                startTime: effectiveStartTime,
                endTime: endBeforeLunchTime
              });
              
              // Part after lunch
              const hoursAfterLunch = hoursToAllocate - hoursBeforeLunch;
              const startAfterLunchHour = Math.floor(lunchEndMinutes / 60);
              const startAfterLunchMin = lunchEndMinutes % 60;
              const startAfterLunchTime = `${String(startAfterLunchHour).padStart(2, '0')}:${String(startAfterLunchMin).padStart(2, '0')}`;
              
              const endAfterLunchMinutes = lunchEndMinutes + hoursAfterLunch * 60;
              const endAfterLunchHour = Math.floor(endAfterLunchMinutes / 60);
              const endAfterLunchMin = Math.round(endAfterLunchMinutes % 60);
              const endAfterLunchTime = `${String(endAfterLunchHour).padStart(2, '0')}:${String(endAfterLunchMin).padStart(2, '0')}`;
              
              allocations.push({
                date: dateStr,
                hours: hoursAfterLunch,
                startTime: startAfterLunchTime,
                endTime: endAfterLunchTime
              });
            } else {
              // Edge case - simple calculation with lunch offset
              const adjustedEndMinutes = workEndMinutesWithoutLunch + userLunchDuration;
              const endHour = Math.floor(adjustedEndMinutes / 60);
              const endMin = Math.round(adjustedEndMinutes % 60);
              const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
              
              allocations.push({
                date: dateStr,
                hours: hoursToAllocate,
                startTime: effectiveStartTime,
                endTime: endTime
              });
            }
          } else {
            // Work doesn't span lunch - simple calculation
            const totalMinutes = workStartMinutes + hoursToAllocate * 60;
            const endHour = Math.floor(totalMinutes / 60);
            const endMin = Math.round(totalMinutes % 60);
            const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
            
            allocations.push({
              date: dateStr,
              hours: hoursToAllocate,
              startTime: effectiveStartTime,
              endTime: endTime
            });
          }
          
          remainingHours -= hoursToAllocate;
          daysProcessed++;
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (daysProcessed >= maxDaysToProcess) {
        setPlanningProgress(prev => ({ ...prev, show: false }));
        showAlert('Allocation Error', `Task requires too many work days (${daysProcessed}) to allocate. Please review estimated hours or user availability.`);
        return;
      }

      if (allocations.length === 0) {
        setPlanningProgress(prev => ({ ...prev, show: false }));
        showAlert('Allocation Error', 'Unable to allocate task - no available hours found in the next year');
        return;
      }

      if (remainingHours > 0) {
        setPlanningProgress(prev => ({ ...prev, show: false }));
        showAlert('Partial Allocation', `Unable to fully allocate task - ${remainingHours.toFixed(2)}h remaining. User doesn't have enough availability in the next year.`);
        return;
      }

      const plannedEndDate = getLatestAllocationDate(allocations);
      if (!validateMandatoryDueDateForPlan(task, plannedEndDate)) {
        setPlanningProgress(prev => ({ ...prev, show: false }));
        return;
      }

      setPlanningProgress(prev => ({
        ...prev,
        progress: 80,
        currentStep: 'Saving allocations...',
      }));

      // Save allocations
      const saveRes = await fetch(
        `${getApiUrl()}/api/task-allocations`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            taskId: task.Id,
            userId,
            allocations
          })
        }
      );

      if (!saveRes.ok) {
        setPlanningProgress(prev => ({ ...prev, show: false }));
        showAlert('Error', 'Failed to save task allocation');
        return;
      }

      const plannedStartDate = allocations.length > 0 ? allocations[0].date : null;
      await persistPlannedTaskAssignment(task, userId, plannedStartDate, plannedEndDate);

      setPlanningProgress(prev => ({
        ...prev,
        progress: 100,
        currentStep: 'Refreshing view...',
      }));

      // Reload tasks and allocations to reflect changes
      if (projects.length > 0) {
        await loadAllProjectsTasks(projects);
        await loadAllAllocations();
      }
      
      // Close modal after short delay to show completion
      setTimeout(() => {
        setPlanningProgress(prev => ({ ...prev, show: false }));
      }, 500);
    } catch (err) {
      console.error('Failed to allocate task:', err);
      setPlanningProgress(prev => ({ ...prev, show: false }));
      showAlert('Error', 'Failed to allocate task');
    }
  };


  const getPriorityColor = (task: Task) => {
    if (task.PriorityColor) return '';
    return 'bg-gray-300';
  };

  // Priority border color (hex) for inline styles - uses PriorityColor from API
  const getPriorityBorderHex = (task: Task): string => {
    return task.PriorityColor || '#d1d5db';
  };

  // Calculate daily totals for a specific user using actual allocations
  const getUserDailyTotals = (userId: number, days: Date[]) => {
    const totals: { [dateStr: string]: { work: number; hobby: number; recurring: number } } = {};
    
    days.forEach(day => {
      const dateStr = getDateKeyFromDate(day);
      totals[dateStr] = { work: 0, hobby: 0, recurring: 0 };
    });
    
    // Use actual allocations for this user
    const userAllocations = allAllocations.filter(a => a.UserId === userId);
    
    userAllocations.forEach(allocation => {
      // Normalize date string
      const allocDate = normalizeDateKey(allocation.AllocationDate);
      
      if (totals[allocDate] !== undefined) {
        const hours = Number(allocation.AllocatedHours) || 0;
        if (allocation.IsHobby) {
          totals[allocDate].hobby += hours;
        } else {
          totals[allocDate].work += hours;
        }
      }
    });
    
    // Add recurring allocations
    const userRecurring = recurringAllocations.filter(a => a.UserId === userId);
    userRecurring.forEach(recurring => {
      const dateStr = normalizeDateKey(recurring.OccurrenceDate);
      
      if (totals[dateStr] !== undefined) {
        const hours = Number(recurring.AllocatedHours) || 0;
        totals[dateStr].recurring += hours;
      }
    });
    
    return totals;
  };

  const handleDeleteTaskAllocations = async (taskId: number) => {
    if (!token) return;

    showConfirm(
      'Delete All Allocations',
      'Are you sure you want to delete ALL allocations for this task? This action cannot be undone.',
      async () => {
        try {
          // Delete task allocations
          const response = await fetch(`${getApiUrl()}/api/task-allocations/task/${taskId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to delete allocations');
          }

          // Also delete child allocations for this parent task
          await fetch(`${getApiUrl()}/api/task-child-allocations/parent/${taskId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          // Reload data
          if (projects.length > 0) {
            await loadAllProjectsTasks(projects);
          }
          await loadAllAllocations();
          
          showAlert('Success', 'All allocations deleted successfully');
        } catch (error: any) {
          console.error('Error deleting allocations:', error);
          showAlert('Error', error.message || 'Failed to delete allocations');
        }
      }
    );
  };

  const handleDeleteAllocation = async (taskId: number, userId: number, allocationDate: string) => {
    if (!token) return;

    try {
      const response = await fetch(
        `${getApiUrl()}/api/task-allocations/delete`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ taskId, userId, allocationDate }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete allocation');
      }

      // Reload tasks and allocations
      if (projects.length > 0) {
        await loadAllProjectsTasks(projects);
      }
      await loadAllAllocations();
      
      showAlert('Success', 'Allocation removed successfully');
    } catch (err) {
      console.error('Failed to delete allocation:', err);
      showAlert('Error', 'Failed to remove allocation');
    }
  };

  const normalizeDateString = (dateValue: any): string => {
    if (dateValue instanceof Date) {
      return dateValue.toISOString().split('T')[0];
    }
    return String(dateValue).split('T')[0];
  };

  const openAddManualAllocationModal = (taskId: number, userId: number) => {
    setManualAllocationModal({
      show: true,
      taskId,
      userId,
      allocationDate: '',
      allocatedHours: '',
      startTime: '09:00',
      endTime: '17:00',
      mode: 'add'
    });
  };

  const openEditManualAllocationModal = (allocation: any) => {
    setManualAllocationModal({
      show: true,
      allocationId: allocation.Id,
      taskId: allocation.TaskId,
      userId: allocation.UserId,
      allocationDate: normalizeDateString(allocation.AllocationDate),
      allocatedHours: String(allocation.AllocatedHours),
      startTime: allocation.StartTime || '09:00',
      endTime: allocation.EndTime || '17:00',
      mode: 'edit'
    });
  };

  const handleSaveManualAllocation = async () => {
    if (!manualAllocationModal.taskId || !manualAllocationModal.userId) {
      showAlert('Error', 'Task and User are required');
      return;
    }

    if (!manualAllocationModal.allocationDate || !manualAllocationModal.allocatedHours) {
      showAlert('Error', 'Date and Hours are required');
      return;
    }

    const hours = parseFloat(manualAllocationModal.allocatedHours);
    if (isNaN(hours) || hours <= 0) {
      showAlert('Error', 'Hours must be greater than 0');
      return;
    }

    if (manualAllocationModal.mode === 'add' && isUserHoliday(manualAllocationModal.userId, manualAllocationModal.allocationDate)) {
      const holidayNames = getUserHolidayNames(manualAllocationModal.userId, manualAllocationModal.allocationDate);
      showAlert(
        'Unavailable Day',
        `Cannot create manual allocation on unavailable day (${manualAllocationModal.allocationDate}): ${holidayNames.join(', ')}`
      );
      return;
    }

    try {
      if (manualAllocationModal.mode === 'add') {
        const response = await fetch(`${getApiUrl()}/api/task-allocations/manual`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            taskId: manualAllocationModal.taskId,
            userId: manualAllocationModal.userId,
            allocationDate: manualAllocationModal.allocationDate,
            allocatedHours: hours,
            startTime: manualAllocationModal.startTime,
            endTime: manualAllocationModal.endTime
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to create manual allocation');
        }

        showAlert('Success', 'Manual allocation created successfully');
      } else {
        const response = await fetch(`${getApiUrl()}/api/task-allocations/manual/${manualAllocationModal.allocationId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            allocatedHours: hours,
            startTime: manualAllocationModal.startTime,
            endTime: manualAllocationModal.endTime
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to update manual allocation');
        }

        showAlert('Success', 'Manual allocation updated successfully');
      }

      setManualAllocationModal({
        show: false,
        allocationDate: '',
        allocatedHours: '',
        startTime: '09:00',
        endTime: '17:00',
        mode: 'add'
      });

      // Reload allocations
      await loadAllAllocations();
    } catch (err: any) {
      console.error('Failed to save manual allocation:', err);
      showAlert('Error', err.message || 'Failed to save manual allocation');
    }
  };

  const handleDeleteManualAllocation = async (allocationId: number) => {
    showConfirm(
      'Confirm Delete',
      'Are you sure you want to delete this manual allocation?',
      async () => {
        try {
          const response = await fetch(`${getApiUrl()}/api/task-allocations/manual/${allocationId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to delete manual allocation');
          }

          showAlert('Success', 'Manual allocation deleted successfully');
          
          // Reload allocations
          await loadAllAllocations();
        } catch (err: any) {
          console.error('Failed to delete manual allocation:', err);
          showAlert('Error', err.message || 'Failed to delete manual allocation');
        }
      }
    );
  };

  const getFilteredAllocations = () => {
    let filtered = allAllocations;

    if (allocationFilters.startDate) {
      filtered = filtered.filter(a => {
        const dateStr = normalizeDateString(a.AllocationDate);
        return dateStr >= allocationFilters.startDate;
      });
    }

    if (allocationFilters.endDate) {
      filtered = filtered.filter(a => {
        const dateStr = normalizeDateString(a.AllocationDate);
        return dateStr <= allocationFilters.endDate;
      });
    }

    if (allocationFilters.userId) {
      filtered = filtered.filter(a => a.UserId === parseInt(allocationFilters.userId));
    }

    if (allocationFilters.projectId) {
      filtered = filtered.filter(a => {
        const task = tasks.find(t => t.Id === a.TaskId);
        return task && task.ProjectId === parseInt(allocationFilters.projectId);
      });
    }

    if (allocationFilters.taskName) {
      filtered = filtered.filter(a => {
        const task = tasks.find(t => t.Id === a.TaskId);
        return task && task.TaskName.toLowerCase().includes(allocationFilters.taskName.toLowerCase());
      });
    }

    // Group by task
    const groupedByTask = filtered.reduce((acc, a) => {
      if (!acc[a.TaskId]) {
        const task = tasks.find(t => t.Id === a.TaskId);
        const project = projects.find(p => p.Id === task?.ProjectId);
        acc[a.TaskId] = {
          TaskId: a.TaskId,
          TaskName: task?.TaskName || 'Unknown Task',
          ProjectName: project?.ProjectName || 'Unknown Project',
          ProjectId: task?.ProjectId,
          totalHours: 0,
          users: new Set<number>(),
          userNames: [] as string[],
          allocations: [],
          startDate: null as string | null,
          endDate: null as string | null,
        };
      }
      
      acc[a.TaskId].totalHours += Number(a.AllocatedHours);
      acc[a.TaskId].users.add(a.UserId);
      acc[a.TaskId].allocations.push(a);
      
      const dateStr = normalizeDateString(a.AllocationDate);
      if (!acc[a.TaskId].startDate || dateStr < acc[a.TaskId].startDate) {
        acc[a.TaskId].startDate = dateStr;
      }
      if (!acc[a.TaskId].endDate || dateStr > acc[a.TaskId].endDate) {
        acc[a.TaskId].endDate = dateStr;
      }
      
      return acc;
    }, {} as Record<number, any>);

    // Convert to array and add user names
    return Object.values(groupedByTask).map((group: any) => {
      group.userNames = Array.from(group.users).map(userId => {
        const user = users.find(u => u.Id === userId);
        return user?.Username || 'Unknown';
      });
      return group;
    }).sort((a: any, b: any) => (b.startDate || '').localeCompare(a.startDate || ''));
  };

  if (!user) return null;

  if (!isLoadingPermissions && !permissions?.canViewPlanning) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Navbar />
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h2>
            <p className="text-gray-600 dark:text-gray-400">You don&apos;t have permission to view the planning page.</p>
          </div>
        </main>
      </div>
    );
  }

  const days = getDaysInView();
  const timelineColumns = getTimelineColumns(days);
  const customIntervalType = viewMode === 'custom' ? getCustomIntervalType(days.length) : null;
  const useAnnualStyleDensity = viewMode === 'month' || viewMode === 'year' || (viewMode === 'custom' && customIntervalType === 'month');
  const useFixedPixelColumns = viewMode === 'month' || viewMode === 'year' || viewMode === 'custom';
  const dayColumnWidthPx =
    viewMode === 'custom'
      ? customIntervalType === 'month'
        ? 20
        : customIntervalType === 'week'
        ? 24
        : 32
      : viewMode === 'day' || viewMode === 'week'
      ? 32
      : 20;
  const fixedTimelineTotalWidthPx = 192 + timelineColumns.length * dayColumnWidthPx;
  const timelineDaysWidthPx = timelineColumns.length * dayColumnWidthPx;
  const timelineMinWidth =
    useFixedPixelColumns
      ? fixedTimelineTotalWidthPx
      : viewMode === 'week'
      ? Math.max(1600, 192 + timelineDaysWidthPx)
      : 1200;
  const isGanttLoading = isLoadingData || loadingAllocations;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIndex = timelineColumns.findIndex((column) => {
    const columnStart = new Date(column.start);
    const columnEnd = new Date(column.end);
    columnStart.setHours(0, 0, 0, 0);
    columnEnd.setHours(0, 0, 0, 0);
    return today >= columnStart && today <= columnEnd;
  });
  const normalizedGanttSearch = ganttSearch.trim().toLowerCase();
  const isGanttSearchActive = normalizedGanttSearch.length > 0;
  const matchesGanttSearch = (task: Task) => {
    if (!isGanttSearchActive) return true;
    const projectName = projects.find((p) => p.Id === task.ProjectId)?.ProjectName || '';
    const searchable = [
      task.TaskName,
      projectName,
      task.CustomerName || '',
      task.TicketNumber || '',
      task.ExternalTicketId || '',
      task.JiraIssueKey || '',
    ]
      .join(' ')
      .toLowerCase();
    return searchable.includes(normalizedGanttSearch);
  };
  const unassignedTasks = getTasksForUser(null);
  const visibleUnassignedTasks = unassignedTasks.filter(matchesGanttSearch);
  const visibleMilestones = projectMilestones.filter((milestone) => {
    const dueDate = normalizeDateKey(milestone.DueDate);
    if (!dueDate) return false;

    return timelineColumns.some((column) => {
      const startKey = getDateKeyFromDate(column.start);
      const endKey = getDateKeyFromDate(column.end);
      return dueDate >= startKey && dueDate <= endKey;
    });
  });
  const milestoneCountByDate = visibleMilestones.reduce<Record<string, number>>((acc, milestone) => {
    const dueDate = normalizeDateKey(milestone.DueDate);
    if (!dueDate) return acc;
    acc[dueDate] = (acc[dueDate] || 0) + 1;
    return acc;
  }, {});
  const milestoneLaneCount = Object.values(milestoneCountByDate).reduce((max, count) => Math.max(max, count), 0);
  const milestoneLaneHeight = 16;
  const milestoneRowPadding = 2;
  const milestoneRowHeight = visibleMilestones.length === 0
    ? 24
    : Math.max(24, milestoneRowPadding * 2 + milestoneLaneCount * milestoneLaneHeight);

  return (
    <CustomerUserGuard>
    <div className="h-screen bg-gray-100 dark:bg-gray-900 flex flex-col overflow-hidden">
      <Navbar />

      <main className="w-full pt-0 pb-0 flex-1 min-h-0 flex flex-col">

        {isGanttLoading ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Loading planning data...
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Rendering timeline for {viewMode} view
            </p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No tasks to plan
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Select a project and add tasks to start planning
            </p>
          </div>
        ) : (
          <>
            {/* Tab Navigation */}
            <div className="w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-4 px-4">
                <div className="flex gap-4">
                  <button
                    onClick={() => setActiveTab('gantt')}
                    className={`pb-3 pt-4 px-4 font-medium transition-colors border-b-2 ${
                      activeTab === 'gantt'
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    📊 Gantt Chart
                  </button>
                  <button
                    onClick={() => setActiveTab('allocations')}
                    className={`pb-3 pt-4 px-4 font-medium transition-colors border-b-2 ${
                      activeTab === 'allocations'
                        ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    📋 All Allocations ({allAllocations.length})
                  </button>
                </div>

                {activeTab === 'gantt' && (
                  <div className="ml-auto flex items-center gap-2 py-2">
                    <input
                      type="text"
                      value={ganttSearch}
                      onChange={(e) => setGanttSearch(e.target.value)}
                      placeholder="Search tasks in Gantt..."
                      className="w-72 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                    {isGanttSearchActive && (
                      <button
                        onClick={() => setGanttSearch('')}
                        className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {activeTab === 'gantt' && (
          <div className="w-full bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700 flex-1 min-h-0 flex flex-col">
            {/* Permission Notice */}
            {!permissions?.canPlanTasks && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b-2 border-yellow-400 dark:border-yellow-600 p-4">
                <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                  <span className="text-xl">🔒</span>
                  <span className="font-medium">Read-only view - You don't have permission to plan tasks</span>
                </div>
              </div>
            )}
            {isGanttSearchActive && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border-b-2 border-orange-400 dark:border-orange-600 p-4">
                <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
                  <span className="text-xl">🔎</span>
                  <span className="font-medium">Search filter active — planning is locked while filtering.</span>
                </div>
              </div>
            )}

            {/* Date Navigation */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const newDate = new Date(viewStartDate);
                    const daysToMove = getNavigationStepDays();
                    newDate.setDate(newDate.getDate() - daysToMove);
                    setViewStartDate(newDate);
                    if (viewMode === 'custom') {
                      const newCustomStart = new Date(`${customStartDate}T12:00:00`);
                      const newCustomEnd = new Date(`${customEndDate}T12:00:00`);
                      if (!Number.isNaN(newCustomStart.getTime()) && !Number.isNaN(newCustomEnd.getTime())) {
                        newCustomStart.setDate(newCustomStart.getDate() - daysToMove);
                        newCustomEnd.setDate(newCustomEnd.getDate() - daysToMove);
                        setCustomStartDate(formatDateForInput(newCustomStart));
                        setCustomEndDate(formatDateForInput(newCustomEnd));
                      }
                    }
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  ← Previous
                </button>
                <button
                  onClick={goToToday}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
                  title="Go to today"
                >
                  📅 Today
                </button>
                <button
                  onClick={() => {
                    const newDate = new Date(viewStartDate);
                    const daysToMove = getNavigationStepDays();
                    newDate.setDate(newDate.getDate() + daysToMove);
                    setViewStartDate(newDate);
                    if (viewMode === 'custom') {
                      const newCustomStart = new Date(`${customStartDate}T12:00:00`);
                      const newCustomEnd = new Date(`${customEndDate}T12:00:00`);
                      if (!Number.isNaN(newCustomStart.getTime()) && !Number.isNaN(newCustomEnd.getTime())) {
                        newCustomStart.setDate(newCustomStart.getDate() + daysToMove);
                        newCustomEnd.setDate(newCustomEnd.getDate() + daysToMove);
                        setCustomStartDate(formatDateForInput(newCustomStart));
                        setCustomEndDate(formatDateForInput(newCustomEnd));
                      }
                    }
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Next →
                </button>
              </div>
              
              {viewMode === 'custom' ? (
                <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">From:</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomStartDate(value);
                      if (customEndDate < value) {
                        setCustomEndDate(value);
                      }
                      const parsedStart = new Date(`${value}T12:00:00`);
                      if (!Number.isNaN(parsedStart.getTime())) {
                        parsedStart.setHours(0, 0, 0, 0);
                        setViewStartDate(parsedStart);
                      }
                    }}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">To:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    min={customStartDate}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value < customStartDate) {
                        setCustomEndDate(customStartDate);
                        return;
                      }
                      setCustomEndDate(value);
                    }}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ) : (
                <span className="text-gray-900 dark:text-white font-medium">
                  {viewStartDate.toLocaleDateString()} - {days[days.length - 1].toLocaleDateString()}
                </span>
              )}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Subtask Levels:
                </label>
                <select
                  value={maxVisibleLevel}
                  onChange={(e) => setMaxVisibleLevel(parseInt(e.target.value))}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  title="Maximum subtask level to show in Gantt"
                >
                  <option value={0}>None</option>
                  <option value={1}>Level 1 only</option>
                  <option value={2}>Up to Level 2</option>
                  <option value={3}>Up to Level 3</option>
                  <option value={4}>Up to Level 4</option>
                  <option value={99}>Show All</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  View Mode:
                </label>
                <select
                  value={viewMode}
                  onChange={(e) => {
                    const nextViewMode = e.target.value as 'day' | 'week' | 'month' | 'year' | 'custom';
                    setViewMode(nextViewMode);
                    if (nextViewMode === 'custom') {
                      const parsedStart = new Date(`${customStartDate}T12:00:00`);
                      if (!Number.isNaN(parsedStart.getTime())) {
                        parsedStart.setHours(0, 0, 0, 0);
                        setViewStartDate(parsedStart);
                      }
                    }
                  }}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="flex items-center gap-2"> 
                <button
                  onClick={() => setShowDependencyLines(!showDependencyLines)}
                  className={`px-4 py-2 rounded transition-colors ${
                    showDependencyLines 
                      ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                  title="Toggle dependency lines"
                >
                  🔗 Dependencies
                </button>
                <button
                  onClick={() => setShowCriticalPath(!showCriticalPath)}
                  className={`px-4 py-2 rounded transition-colors ${
                    showCriticalPath
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                  title="Highlight critical path"
                >
                  🔴 Critical Path
                </button>
                <button
                  onClick={() => setShowBaseline(!showBaseline)}
                  className={`px-4 py-2 rounded transition-colors ${
                    showBaseline
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                  title="Toggle baseline comparison bars"
                >
                  📏 Baseline
                </button>
                {permissions?.canPlanTasks && projects.length > 0 && (
                  <button
                    onClick={() => {
                      showConfirm(
                        'Set Baseline',
                        `Snapshot all current planned dates for ALL visible projects as baseline? This will overwrite any existing baseline for each project.`,
                        async () => {
                          try {
                            let successCount = 0;
                            let failCount = 0;
                            for (const project of projects) {
                              const res = await fetch(`${getApiUrl()}/api/tasks/project/${project.Id}/baseline`, {
                                method: 'PUT',
                                headers: { Authorization: `Bearer ${token!}` },
                              });
                              const d = await res.json();
                              if (res.ok) {
                                successCount++;
                              } else {
                                failCount++;
                              }
                            }
                            showAlert('Baseline Set', `Baseline snapshot completed. Success: ${successCount}, Failed: ${failCount}`);
                            await loadData();
                            setShowBaseline(true);
                          } catch (err: any) {
                            showAlert('Error', `Failed to set baseline: ${err.message}`);
                          }
                        }
                      );
                    }}
                    className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-purple-100 dark:hover:bg-purple-900 transition-colors"
                    title="Snapshot current planned dates as baseline for all visible projects"
                  >
                    📐 Set Baseline
                  </button>
                )}
              </div>
            </div>

            {/* Gantt Chart */}
            <div className="flex-1 min-h-0 overflow-auto">
              <div
                className="relative"
                ref={ganttContainerRef}
                style={
                  useFixedPixelColumns
                    ? { width: `${timelineMinWidth}px`, minWidth: `${timelineMinWidth}px` }
                    : { minWidth: `${timelineMinWidth}px` }
                }
              >
                {/* SVG overlay for dependency lines */}
                {showDependencyLines && dependencyLines.length > 0 && (
                  <svg 
                    className="absolute inset-0 pointer-events-none z-10" 
                    style={{ width: '100%', height: '100%', overflow: 'visible' }}
                  >
                    <defs>
                      <marker
                        id="arrowhead"
                        markerWidth="10"
                        markerHeight="7"
                        refX="9"
                        refY="3.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 10 3.5, 0 7" fill="#f97316" />
                      </marker>
                    </defs>
                    {dependencyLines.map((line, idx) => {
                      // Draw a curved path from end of parent to start of dependent
                      const midX = (line.x1 + line.x2) / 2;
                      const controlOffset = Math.min(50, Math.abs(line.y2 - line.y1) / 2 + 20);
                      
                      return (
                        <g key={idx}>
                          <path
                            d={`M ${line.x1} ${line.y1} 
                                C ${line.x1 + controlOffset} ${line.y1}, 
                                  ${line.x2 - controlOffset} ${line.y2}, 
                                  ${line.x2} ${line.y2}`}
                            stroke="#f97316"
                            strokeWidth="2"
                            fill="none"
                            markerEnd="url(#arrowhead)"
                            opacity="0.7"
                          />
                        </g>
                      );
                    })}
                  </svg>
                )}
                {/* Month header */}
                {timelineColumns.length > 0 && (
                  <div className="flex border-b-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800">
                    <div className="w-48 min-w-48 max-w-48 flex-none sticky left-0 z-[70] bg-gray-100 dark:bg-gray-800 p-2 font-semibold text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700">
                      Month
                    </div>
                    <div className="flex-1 flex" style={useFixedPixelColumns ? { minWidth: `${timelineDaysWidthPx}px` } : undefined}>
                      {(() => {
                        const monthGroups: { month: string; year: string; count: number }[] = [];
                        let currentMonth = -1;
                        let currentYear = -1;
                        
                        days.forEach(day => {
                          const month = day.getMonth();
                          const year = day.getFullYear();
                          if (month !== currentMonth || year !== currentYear) {
                            currentMonth = month;
                            currentYear = year;
                            monthGroups.push({
                              month: day.toLocaleDateString('en-US', { month: 'long' }),
                              year: year.toString(),
                              count: 1
                            });
                          } else {
                            monthGroups[monthGroups.length - 1].count++;
                          }
                        });
                        
                        return monthGroups.map((group, idx) => (
                          <div
                            key={idx}
                            className="border-r border-gray-300 dark:border-gray-600 p-2 text-center font-semibold text-gray-900 dark:text-white text-sm truncate"
                            style={
                              useFixedPixelColumns
                                ? { width: `${group.count * dayColumnWidthPx}px` }
                                : { width: `${(group.count / Math.max(1, timelineColumns.length)) * 100}%` }
                            }
                          >
                            {group.month} {group.year}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
                {/* Header with dates */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
                  <div className="w-48 min-w-48 max-w-48 flex-none sticky left-0 z-[70] bg-gray-50 dark:bg-gray-700 p-3 font-semibold text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700">
                    User
                  </div>
                  <div className="flex-1 flex" style={useFixedPixelColumns ? { minWidth: `${timelineDaysWidthPx}px` } : undefined}>
                    {timelineColumns.map((column, idx) => {
                      return (
                        <div
                          key={idx}
                          className={`${useFixedPixelColumns ? 'flex-shrink-0' : 'flex-1'} p-1 text-center text-[10px] border-r border-gray-200 dark:border-gray-700 ${
                            column.isWeekend
                              ? 'bg-gray-100 dark:bg-gray-600'
                              : ''
                          } ${useAnnualStyleDensity && column.isMonthStart ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                          style={useFixedPixelColumns ? { overflow: 'hidden', width: `${dayColumnWidthPx}px` } : { overflow: 'hidden' }}
                        >
                          {idx === todayIndex && (
                            <div className="text-[9px] font-semibold text-blue-700 dark:text-blue-300 leading-tight mb-0.5 truncate">
                              Today
                            </div>
                          )}
                          {column.header && (
                            <>
                              <div className="font-semibold text-gray-900 dark:text-white leading-tight truncate" style={{ fontSize: useAnnualStyleDensity ? '9px' : undefined }}>
                                {column.header}
                              </div>
                              {column.subheader && (
                                <div className="text-gray-600 dark:text-gray-400 leading-tight truncate" style={{ fontSize: useAnnualStyleDensity ? '9px' : undefined }}>
                                  {column.subheader}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Milestones row */}
                <div className="flex border-b border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-900/15">
                  <div className="w-48 min-w-48 max-w-48 flex-none sticky left-0 z-[60] bg-emerald-50/60 dark:bg-emerald-900/15 p-3 border-r border-gray-200 dark:border-gray-700">
                    <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      🏁 Milestones
                    </div>
                  </div>
                  <div className="flex-1 relative" style={useFixedPixelColumns ? { minHeight: `${milestoneRowHeight}px`, minWidth: `${timelineDaysWidthPx}px` } : { minHeight: `${milestoneRowHeight}px` }}>
                    <div className="flex h-full" style={useFixedPixelColumns ? { minWidth: `${timelineDaysWidthPx}px` } : undefined}>
                      {timelineColumns.map((column, idx) => (
                        <div
                          key={`milestone-col-${idx}`}
                          className={`${useFixedPixelColumns ? 'flex-shrink-0' : 'flex-1'} border-r border-gray-200 dark:border-gray-700 ${
                            idx === todayIndex ? 'bg-blue-100/70 dark:bg-blue-800/25 ring-1 ring-inset ring-blue-300/90 dark:ring-blue-400/80' : ''
                          }`}
                          style={useFixedPixelColumns ? { width: `${dayColumnWidthPx}px` } : undefined}
                        />
                      ))}
                    </div>
                    {visibleMilestones.map((milestone, milestoneIndex) => {
                      const dueDate = normalizeDateKey(milestone.DueDate);
                      if (!dueDate) return null;

                      const dayIndex = timelineColumns.findIndex((column) => {
                        const startKey = getDateKeyFromDate(column.start);
                        const endKey = getDateKeyFromDate(column.end);
                        return dueDate >= startKey && dueDate <= endKey;
                      });

                      if (dayIndex === -1) return null;

                      const projectName = projects.find((project) => Number(project.Id) === Number(milestone.ProjectId))?.ProjectName || 'Project';
                      const milestoneColor = milestone.MilestoneTypeColor || '#059669';
                      const isCompletedMilestone = Number(milestone.IsCompleted || 0) === 1;
                      const sameDayOffset = visibleMilestones
                        .slice(0, milestoneIndex)
                        .filter((entry) => normalizeDateKey(entry.DueDate) === dueDate).length;

                      const left = useFixedPixelColumns
                        ? `${dayIndex * dayColumnWidthPx}px`
                        : `${(dayIndex / Math.max(1, timelineColumns.length)) * 100}%`;
                      const width = useFixedPixelColumns
                        ? `${dayColumnWidthPx}px`
                        : `${100 / Math.max(1, timelineColumns.length)}%`;

                      return (
                        <div
                          key={`milestone-${milestone.Id}`}
                          className="absolute h-4 rounded text-white text-[10px] px-1.5 flex items-center cursor-default"
                          style={{
                            left,
                            width,
                            top: `${milestoneRowPadding + sameDayOffset * milestoneLaneHeight}px`,
                            zIndex: 2,
                            backgroundColor: milestoneColor,
                            opacity: isCompletedMilestone ? 0.7 : 0.9,
                          }}
                          title={`${projectName}\n${milestone.Name}\nType: ${milestone.MilestoneTypeName || 'No type'}\nDue: ${new Date(`${dueDate}T12:00:00`).toLocaleDateString()}${isCompletedMilestone ? '\nStatus: Completed' : '\nStatus: Open'}`}
                        >
                          <span className="truncate inline-flex items-center gap-1">
                            <span className="inline-flex items-center">{renderMilestoneTypeSvg(milestone.MilestoneTypeIconSvg, 'w-3 h-3')}</span>
                            <span>{isCompletedMilestone ? '✓ ' : ''}{milestone.Name}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col">
                {/* Unassigned tasks row */}
                {visibleUnassignedTasks.length > 0 && (
                  <div
                    className="order-last flex border-b-2 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnUser(e, null)}
                  >
                    <div className="w-48 min-w-48 max-w-48 flex-none sticky left-0 z-[60] bg-red-50 dark:bg-red-900/20 p-3 border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm font-medium text-red-700 dark:text-red-400">
                        ⚠️ Not Planned ({visibleUnassignedTasks.length})
                      </div>
                      <div className="text-xs text-red-600 dark:text-red-500">
                        Click to plan subtasks
                      </div>
                    </div>
                    <div className="flex-1 relative" style={useFixedPixelColumns ? { minHeight: `${Math.max(40, visibleUnassignedTasks.length * 24 + 8)}px`, minWidth: `${timelineDaysWidthPx}px` } : { minHeight: `${Math.max(40, visibleUnassignedTasks.length * 24 + 8)}px` }}>
                      <div className="flex h-full" style={useFixedPixelColumns ? { minWidth: `${timelineDaysWidthPx}px` } : undefined}>
                        {timelineColumns.map((column, idx) => (
                          <div
                            key={idx}
                            className={`${useFixedPixelColumns ? 'flex-shrink-0' : 'flex-1'} border-r border-gray-200 dark:border-gray-700 relative ${
                              idx === todayIndex ? 'bg-blue-100/85 dark:bg-blue-800/30 ring-1 ring-inset ring-blue-300/90 dark:ring-blue-400/80' : ''
                            }`}
                            style={useFixedPixelColumns ? { width: `${dayColumnWidthPx}px` } : undefined}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDropOnDay(e, column.start, null)}
                          />
                        ))}
                      </div>
                      {visibleUnassignedTasks.map((parentTask, taskIdx) => {
                        const position = getTaskPosition(parentTask, timelineColumns, {
                          minVisibleDuration: 5,
                          preferRangeStartForUnplanned: true,
                          useFixedPixelColumns,
                          columnWidthPx: dayColumnWidthPx,
                        });
                        const row = taskIdx;
                        const taskIsHobbyProject = isTaskHobby(parentTask);
                        const hasEstimatedHours = Number(parentTask.EstimatedHours || 0) > 0;
                        const hasDependency = !!parentTask.DependsOnTaskId;
                        const project = projects.find(p => p.Id === parentTask.ProjectId);
                        const hasSubtasks = tasks.some(t => t.ParentTaskId === parentTask.Id);
                        const subtaskCount = tasks.filter(t => t.ParentTaskId === parentTask.Id).length;
                        const statusColor = getTaskStatusColor(parentTask);
                        const priorityBorderHex = getPriorityBorderHex(parentTask);
                        const parentCustomerName = parentTask.CustomerName || project?.CustomerName || null;
                        const parentJiraRef = parentTask.ExternalTicketId || parentTask.JiraIssueKey || null;
                        const parentTooltipLines = [
                          `Project: ${project?.ProjectName || 'Unknown'}`,
                          `Task: ${parentTask.TaskName}`,
                          `Status: ${parentTask.StatusName || 'Unknown'}`,
                          `Priority: ${parentTask.PriorityName || 'Unknown'}`,
                          `Estimated: ${Number(parentTask.EstimatedHours || 0).toFixed(1)}h`,
                          `Planned Dates: ${parentTask.PlannedStartDate || 'Not planned'} → ${parentTask.PlannedEndDate || 'Not planned'}`,
                        ];

                        if (!hasEstimatedHours) {
                          parentTooltipLines.unshift('⚠️ No estimated hours defined');
                        }

                        if (hasSubtasks) {
                          parentTooltipLines.push(`Subtasks: ${subtaskCount} (click to manage subtasks)`);
                        }
                        if (parentCustomerName) {
                          parentTooltipLines.push(`Customer: ${parentCustomerName}`);
                        }
                        if (parentTask.TicketNumber) {
                          parentTooltipLines.push(`Ticket: ${parentTask.TicketNumber}${parentTask.TicketTitle ? ` - ${parentTask.TicketTitle}` : ''}`);
                        }
                        if (parentJiraRef) {
                          parentTooltipLines.push(`Jira: ${parentJiraRef}`);
                        }
                        if (taskIsHobbyProject) {
                          parentTooltipLines.push('Type: Hobby Project');
                        }
                        if (hasDependency) {
                          parentTooltipLines.push(`Depends on: ${parentTask.DependsOnTaskName}`);
                        }
                        const parentTooltip = parentTooltipLines.join('\n');
                        
                        return (
                          <div
                            key={parentTask.Id}
                            data-task-id={parentTask.Id}
                            draggable={permissions?.canPlanTasks && !isGanttSearchActive}
                            onDragStart={(e) => handleDragStart(e, parentTask)}
                            onClick={(e) => {
                              if (hasSubtasks && !e.ctrlKey && !e.metaKey) {
                                openSubtasksModal(parentTask);
                                return;
                              }
                              void handleTaskClick(parentTask);
                            }}
                            className={`absolute h-6 rounded ${!statusColor ? getPriorityColor(parentTask) : ''} opacity-75 hover:opacity-100 ${permissions?.canPlanTasks && !isGanttSearchActive ? 'cursor-move' : 'cursor-pointer'} flex items-center text-white text-xs px-2 transition-all`}
                            style={{
                              left: position ? position.left : '0%',
                              width: position ? position.width : `${(Math.min(5, Math.max(1, timelineColumns.length)) / Math.max(1, timelineColumns.length)) * 100}%`,
                              top: `${4 + row * 24}px`,
                              ...(statusColor ? { backgroundColor: statusColor } : {}),
                              borderLeft: `4px solid ${priorityBorderHex}`,
                            }}
                            title={parentTooltip}
                          >
                            {taskIsHobbyProject && (
                              <span className="mr-1 bg-purple-700 text-white text-[9px] px-1 py-0.5 rounded font-semibold flex-shrink-0">HOBBY</span>
                            )}
                            <span className="truncate flex-1">
                              {!hasEstimatedHours && <span className="mr-1">⚠️</span>}
                              {hasSubtasks && <span className="mr-1">📁</span>}
                              {hasDependency ? '🔗 ' : ''}
                              {parentTask.TaskName}
                            </span>
                            {hasSubtasks && (
                              <span className="ml-1 text-[10px] bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-1.5 py-0.5 rounded font-semibold">
                                {subtaskCount}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* User rows */}
                {users.map(userRow => {
                  // Get ALL tasks for this user (parent tasks with dates)
                  const parentTasksWithDates = tasks.filter(t => 
                    t.AssignedTo === userRow.Id &&
                    !t.ParentTaskId &&
                    t.PlannedStartDate &&
                    t.PlannedEndDate &&
                    matchesGanttSearch(t)
                  );
                  
                  // Build complete subtask tree recursively for visualization
                  const getAllDescendantsRecursive = (parentId: number): Task[] => {
                    const directChildren = tasks.filter(t => t.ParentTaskId === parentId);
                    let allDescendants: Task[] = [];
                    
                    for (const child of directChildren) {
                      allDescendants.push(child);
                      // Recursively get grandchildren
                      const grandchildren = getAllDescendantsRecursive(child.Id);
                      allDescendants = allDescendants.concat(grandchildren);
                    }
                    
                    return allDescendants;
                  };
                  
                  // Build subtasks map with ALL descendants (multi-level)
                  const subtasksMap = new Map<number, Task[]>();
                  
                  parentTasksWithDates.forEach(parentTask => {
                    const allDescendants = getAllDescendantsRecursive(parentTask.Id).filter(matchesGanttSearch);
                    if (allDescendants.length > 0) {
                      subtasksMap.set(parentTask.Id, allDescendants);
                    }
                  });
                  
                  const allUserTasks = [...parentTasksWithDates];
                  subtasksMap.forEach(descendants => {
                    allUserTasks.push(...descendants);
                  });
                  
                  const userDailyTotals = getUserDailyTotals(userRow.Id, days);

                  const getDayCapacities = (day: Date) => {
                    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    const dayName = dayNames[day.getDay()];
                    const workHoursKey = `WorkHours${dayName}` as keyof User;
                    const hobbyHoursKey = `HobbyHours${dayName}` as keyof User;
                    const workCapacity = parseFloat(userRow[workHoursKey] as any) || 0;
                    const hobbyCapacity = parseFloat(userRow[hobbyHoursKey] as any) || 0;
                    return { workCapacity, hobbyCapacity };
                  };

                  const getTimelineColumnSummary = (column: TimelineColumn) => {
                    const totals = { work: 0, hobby: 0, recurring: 0 };
                    let workCapacity = 0;
                    let hobbyCapacity = 0;
                    let isOverAllocated = false;
                    const holidaySet = new Set<string>();

                    const cursor = new Date(column.start);
                    cursor.setHours(12, 0, 0, 0);
                    const end = new Date(column.end);
                    end.setHours(12, 0, 0, 0);

                    while (cursor <= end) {
                      const dateStr = getDateKeyFromDate(cursor);
                      const dayTotals = userDailyTotals[dateStr] || { work: 0, hobby: 0, recurring: 0 };
                      totals.work += dayTotals.work;
                      totals.hobby += dayTotals.hobby;
                      totals.recurring += dayTotals.recurring;

                      const dayCapacities = getDayCapacities(cursor);
                      workCapacity += dayCapacities.workCapacity;
                      hobbyCapacity += dayCapacities.hobbyCapacity;

                      const totalWorkUsed = dayTotals.work + dayTotals.recurring;
                      const dayOverAllocated =
                        (dayCapacities.workCapacity > 0 && totalWorkUsed > dayCapacities.workCapacity + 0.001) ||
                        (dayCapacities.hobbyCapacity > 0 && dayTotals.hobby > dayCapacities.hobbyCapacity + 0.001);
                      if (dayOverAllocated) {
                        isOverAllocated = true;
                      }

                      const holidayNames = getUserHolidayNames(userRow.Id, dateStr);
                      holidayNames.forEach((name) => holidaySet.add(name));

                      cursor.setDate(cursor.getDate() + 1);
                    }

                    const holidayNames = Array.from(holidaySet);
                    return {
                      totals,
                      workCapacity,
                      hobbyCapacity,
                      isOverAllocated,
                      holidayNames,
                      isHoliday: holidayNames.length > 0,
                      isWeekend: column.isWeekend,
                    };
                  };

                  const timelineColumnSummaries = timelineColumns.map(getTimelineColumnSummary);

                  // Separate parent tasks
                  const parentTasks = parentTasksWithDates;
                  
                  // Calculate maximum number of rows needed for this user's tasks
                  let maxRows = 1;
                  const taskRows: { task: Task; row: number; isSubtask: boolean; parentTask?: Task; subtaskIndex?: number; totalSubtasks?: number; level?: number }[] = [];
                  
                  // DEBUG: Log subtasks
                  console.log(`User ${userRow.Username}:`, {
                    totalTasks: allUserTasks.length,
                    parentTasks: parentTasks.length,
                    subtasksMapSize: subtasksMap.size,
                    subtasksMap: Array.from(subtasksMap.entries()).map(([parentId, subs]) => ({
                      parentId,
                      subtasks: subs.map(s => ({ id: s.Id, name: s.TaskName }))
                    }))
                  });
                  
                  parentTasks.forEach((task, taskIdx) => {
                    const position = getTaskPosition(task, timelineColumns, {
                      useFixedPixelColumns,
                      columnWidthPx: dayColumnWidthPx,
                    });
                    if (!position) {
                      console.log(`Parent task ${task.TaskName} has no position - skipping`);
                      return;
                    }
                    
                    let row = 0;
                    
                    // Helper function to calculate task level
                    const getTaskLevel = (taskId: number): number => {
                      const t = tasks.find(x => x.Id === taskId);
                      if (!t || !t.ParentTaskId) return 0;
                      return 1 + getTaskLevel(t.ParentTaskId);
                    };
                    
                    // Check previous tasks to find overlaps
                    for (let i = 0; i < taskIdx; i++) {
                      const otherTask = parentTasks[i];
                      const otherPosition = getTaskPosition(otherTask, timelineColumns, {
                        useFixedPixelColumns,
                        columnWidthPx: dayColumnWidthPx,
                      });
                      if (!otherPosition) continue;
                      
                      const taskStart = task.PlannedStartDate || '';
                      const taskEnd = task.PlannedEndDate || '';
                      const otherStart = otherTask.PlannedStartDate || '';
                      const otherEnd = otherTask.PlannedEndDate || '';
                      
                      if (taskStart && taskEnd && otherStart && otherEnd) {
                        const overlap = !(taskEnd < otherStart || taskStart > otherEnd);
                        if (overlap) {
                          const otherTaskRow = taskRows.find(tr => tr.task.Id === otherTask.Id);
                          if (otherTaskRow) {
                            // Count visible subtasks for the other task
                            const otherSubtasks = subtasksMap.get(otherTask.Id) || [];
                            const visibleSubtasks = otherSubtasks.filter(st => getTaskLevel(st.Id) <= maxVisibleLevel);
                            const extraRows = visibleSubtasks.length;
                            row = Math.max(row, otherTaskRow.row + 1 + extraRows);
                          }
                        }
                      }
                    }
                    
                    taskRows.push({ task, row, isSubtask: false });
                    
                    // Add ALL subtasks (multi-level) each in its own row below the parent
                    const subtasks = subtasksMap.get(task.Id) || [];
                    console.log(`Parent task ${task.TaskName} (ID: ${task.Id}):`, {
                      hasSubtasks: subtasks.length > 0,
                      subtaskCount: subtasks.length,
                      subtasks: subtasks.map(s => ({ id: s.Id, name: s.TaskName, parentId: s.ParentTaskId }))
                    });
                    
                    if (subtasks.length > 0) {
                      let subtaskOffset = 0;
                      subtasks.forEach((subtask, subIdx) => {
                        const level = getTaskLevel(subtask.Id);
                        
                        // Only add subtask if within max visible level
                        if (level <= maxVisibleLevel) {
                          console.log(`  Adding subtask ${subtask.TaskName} at row ${row + 1 + subtaskOffset}, level ${level}`);
                          taskRows.push({ 
                            task: subtask, 
                            row: row + 1 + subtaskOffset,
                            isSubtask: true,
                            parentTask: task,
                            subtaskIndex: subIdx,
                            totalSubtasks: subtasks.length,
                            level: level
                          });
                          subtaskOffset++;
                        } else {
                          console.log(`  Skipping subtask ${subtask.TaskName} at level ${level} (max: ${maxVisibleLevel})`);
                        }
                      });
                      
                      maxRows = Math.max(maxRows, row + 1 + subtaskOffset);
                    } else {
                      maxRows = Math.max(maxRows, row + 1);
                    }
                  });
                  
                  // Calculate row height based on max rows (parent tasks + subtasks)
                  // Reserve a dedicated lane for recurring allocations so they don't overlap task bars.
                  const hasRecurringForUser = recurringAllocations.some((recurring) => recurring.UserId === userRow.Id);
                  const recurringLaneHeight = hasRecurringForUser ? 18 : 0;
                  const recurringLaneTop = hasRecurringForUser ? Math.max(maxRows * 24 + 4, 24) : 0;
                  const rowHeight = Math.max(maxRows * 24 + 8 + recurringLaneHeight, 44 + recurringLaneHeight);
                  
                  return (
                    <React.Fragment key={userRow.Id}>
                    <div
                      className="flex border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropOnUser(e, userRow.Id)}
                      style={{ minHeight: `${rowHeight}px` }}
                    >
                      <div className="w-48 min-w-48 max-w-48 flex-none sticky left-0 z-[50] bg-white dark:bg-gray-800 p-1 border-r border-gray-200 dark:border-gray-700">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          👤 {userRow.Username}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {userRow.FirstName} {userRow.LastName}
                        </div>
                        <div className="text-xs text-blue-600 dark:text-blue-400">
                          {allUserTasks.length} task{allUserTasks.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="flex-1 relative" style={useFixedPixelColumns ? { minHeight: `${rowHeight}px`, minWidth: `${timelineDaysWidthPx}px` } : { minHeight: `${rowHeight}px` }}>
                        <div className="flex h-full" style={useFixedPixelColumns ? { minWidth: `${timelineDaysWidthPx}px` } : undefined}>
                          {timelineColumns.map((column, idx) => {
                            const summary = timelineColumnSummaries[idx];
                            const isOverAllocated = summary.isOverAllocated;
                            const holidayNames = summary.holidayNames;
                            const isHoliday = summary.isHoliday;
                            return (
                              <div
                                key={idx}
                                className={`${useFixedPixelColumns ? 'flex-shrink-0' : 'flex-1'} border-r border-gray-200 dark:border-gray-700 relative ${
                                  isOverAllocated
                                    ? 'bg-red-50 dark:bg-red-900/20'
                                    : isHoliday
                                    ? 'bg-amber-50 dark:bg-amber-900/20'
                                    : ''
                                } ${idx === todayIndex ? 'bg-blue-100/60 dark:bg-blue-800/20 ring-1 ring-inset ring-blue-300/90 dark:ring-blue-400/80' : ''}`}
                                style={useFixedPixelColumns ? { width: `${dayColumnWidthPx}px` } : undefined}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDropOnDay(e, column.start, userRow.Id)}
                                title={isHoliday ? `Unavailable: ${holidayNames.join(', ')}` : undefined}
                              />
                            );
                          })}
                        </div>
                        {taskRows.map(({ task, row, isSubtask, parentTask, subtaskIndex, totalSubtasks, level }) => {
                          // For subtasks, try to use child allocations first, then fall back to own dates
                          let position, subtaskLeft, subtaskWidth;
                          
                          if (isSubtask && parentTask) {
                            // Try to get child task dates from allocations
                            const childDates = getChildTaskDates(task.Id);
                            
                            if (childDates) {
                              // Has child allocations - use them
                              const tempTask = {
                                ...task,
                                PlannedStartDate: childDates.startDate,
                                PlannedEndDate: childDates.endDate
                              };
                              
                              position = getTaskPosition(tempTask, timelineColumns, {
                                useFixedPixelColumns,
                                columnWidthPx: dayColumnWidthPx,
                              });
                            } else if (task.PlannedStartDate && task.PlannedEndDate) {
                              // No child allocations but has own dates - use them
                              position = getTaskPosition(task, timelineColumns, {
                                useFixedPixelColumns,
                                columnWidthPx: dayColumnWidthPx,
                              });
                            } else {
                              // No allocations and no dates - skip
                              return null;
                            }
                            
                            if (!position) return null;
                            subtaskLeft = position.left;
                            subtaskWidth = position.width;
                          } else {
                            position = getTaskPosition(task, timelineColumns, {
                              useFixedPixelColumns,
                              columnWidthPx: dayColumnWidthPx,
                            });
                            if (!position) return null;
                            subtaskLeft = position.left;
                            subtaskWidth = position.width;
                          }
                          
                          const taskIsHobbyProject = isTaskHobby(task);
                          const hasDependency = !!task.DependsOnTaskId;
                          const project = projects.find(p => p.Id === task.ProjectId);
                          const estimatedHours = task.EstimatedHours || 0;
                          const plannedHours = task.PlannedHours || 0;
                          const workedHours = task.WorkedHours || 0;
                          const remainingHours = Math.max(0, estimatedHours - workedHours);
                          const isOverPlanned = plannedHours > remainingHours && remainingHours > 0;
                          const isUnderPlanned = plannedHours < remainingHours && plannedHours > 0;
                          const planningCoverage = remainingHours > 0
                            ? `${((plannedHours / remainingHours) * 100).toFixed(0)}% of remaining`
                            : plannedHours > 0
                              ? 'Complete scope planned'
                              : 'No remaining hours';
                          const taskCustomerName = task.CustomerName || project?.CustomerName || null;
                          const taskJiraRef = task.ExternalTicketId || task.JiraIssueKey || null;
                          const assigneeName = userRow.FirstName && userRow.LastName
                            ? `${userRow.FirstName} ${userRow.LastName}`
                            : userRow.Username;
                          const taskTooltipLines = [
                            `Project: ${project?.ProjectName || 'Unknown'}`,
                            `Task: ${task.TaskName}${isSubtask ? ` (Level ${level} Subtask)` : ''}`,
                            `Assignee: ${assigneeName}`,
                            `Status: ${task.StatusName || 'Unknown'}`,
                            `Priority: ${task.PriorityName || 'Unknown'}`,
                            `Dates: ${task.PlannedStartDate || 'Not planned'} → ${task.PlannedEndDate || 'Not planned'}`,
                            `Hours: Est ${estimatedHours}h | Planned ${plannedHours}h | Worked ${workedHours}h | Remaining ${remainingHours}h`,
                            `Coverage: ${planningCoverage}`,
                          ];
                          if (taskCustomerName) {
                            taskTooltipLines.push(`Customer: ${taskCustomerName}`);
                          }
                          if (task.TicketNumber) {
                            taskTooltipLines.push(`Ticket: ${task.TicketNumber}${task.TicketTitle ? ` - ${task.TicketTitle}` : ''}`);
                          }
                          if (taskJiraRef) {
                            taskTooltipLines.push(`Jira: ${taskJiraRef}`);
                          }
                          if (taskIsHobbyProject) {
                            taskTooltipLines.push('Type: Hobby Project');
                          }
                          if (hasDependency) {
                            taskTooltipLines.push(`Depends on: ${task.DependsOnTaskName}`);
                          }
                          if (isOverPlanned) {
                            taskTooltipLines.push(`⚠ OVER-PLANNED: ${(plannedHours - remainingHours).toFixed(1)}h more than needed`);
                          }
                          if (isUnderPlanned) {
                            taskTooltipLines.push(`⚠ UNDER-PLANNED: ${(remainingHours - plannedHours).toFixed(1)}h still to plan`);
                          }
                          const taskTooltip = taskTooltipLines.join('\n');
                          const statusColor = getTaskStatusColor(task);
                          const priorityBorderHex = getPriorityBorderHex(task);
                          
                          // Format hours display (only for parent tasks)
                          const hoursDisplay = `${workedHours}/${plannedHours}/${estimatedHours}h`;
                          
                          // Subtask styling based on level
                          const subtaskHeight = isSubtask ? 'h-6' : 'h-6';
                          const subtaskTextSize = isSubtask ? 'text-[10px]' : 'text-xs';
                          const subtaskPadding = isSubtask ? 'px-1' : 'px-2';
                          const indentPrefix = isSubtask && level ? '└' + '─'.repeat(level) + ' ' : '';
                          
                          // Compute baseline bar position if applicable
                          const baselinePosition = showBaseline && task.BaselineStartDate && task.BaselineEndDate
                            ? getTaskPosition(
                                { ...task, PlannedStartDate: task.BaselineStartDate, PlannedEndDate: task.BaselineEndDate },
                                timelineColumns,
                                {
                                  useFixedPixelColumns,
                                  columnWidthPx: dayColumnWidthPx,
                                }
                              )
                            : null;
                          const driftDays = (baselinePosition && subtaskLeft && subtaskWidth)
                            ? (() => {
                                const curStart = new Date(task.PlannedStartDate || task.BaselineStartDate!).getTime();
                                const basStart = new Date(task.BaselineStartDate!).getTime();
                                return Math.round((curStart - basStart) / 86_400_000);
                              })()
                            : 0;

                          return (
                            <React.Fragment key={`bar-${task.Id}`}>
                            {baselinePosition && (
                              <div
                                className="absolute rounded-sm pointer-events-none"
                                style={{
                                  left: baselinePosition.left,
                                  width: baselinePosition.width,
                                  top: `${4 + row * 24 + (isSubtask ? 10 : 12)}px`,
                                  height: '4px',
                                  backgroundColor: driftDays === 0 ? '#10b981' : driftDays > 0 ? '#f59e0b' : '#a855f7',
                                  opacity: 0.7,
                                  zIndex: 1,
                                }}
                                title={`Baseline: ${task.BaselineStartDate} → ${task.BaselineEndDate}${driftDays !== 0 ? `\nDrift: ${driftDays > 0 ? '+' : ''}${driftDays} days` : ''}`}
                              />
                            )}
                            <div
                              key={task.Id}
                              data-task-id={task.Id}
                              draggable={permissions?.canPlanTasks && !isGanttSearchActive}
                              onDragStart={(e) => handleDragStart(e, task)}
                              onClick={() => handleTaskClick(task)}
                              className={`absolute ${subtaskHeight} rounded ${!statusColor ? getPriorityColor(task) : ''} ${isSubtask ? 'opacity-60' : 'opacity-75'} hover:opacity-100 ${permissions?.canPlanTasks && !isGanttSearchActive ? 'cursor-move' : 'cursor-pointer'} flex items-center text-white ${subtaskTextSize} ${subtaskPadding} transition-all ${!isSubtask && isOverPlanned ? 'ring-2 ring-red-500 ring-offset-1' : ''} ${showCriticalPath && criticalPathIds.has(task.Id) ? 'ring-2 ring-red-400 ring-offset-1 brightness-110' : ''}`}
                              style={{
                                left: subtaskLeft,
                                width: subtaskWidth,
                                top: `${2 + row * 24}px`,
                                ...(statusColor ? { backgroundColor: statusColor } : {}),
                                borderLeft: `${isSubtask ? '3' : '4'}px solid ${priorityBorderHex}`,
                                zIndex: isSubtask ? 20 : 21,
                              }}
                              title={taskTooltip}
                            >
                              {!isSubtask && isOverPlanned && <span className="mr-1">⚠️</span>}
                              {!isSubtask && taskIsHobbyProject && (
                                <span className="mr-1 bg-purple-700 text-white text-[9px] px-1 py-0.5 rounded font-semibold flex-shrink-0">HOBBY</span>
                              )}
                              <span className="truncate flex-1">
                                {indentPrefix}
                                {!isSubtask && hasDependency ? '🔗 ' : ''}
                                {task.TaskName}
                              </span>
                              {!isSubtask && (
                                <span className={`ml-1 text-[10px] whitespace-nowrap ${isOverPlanned ? 'bg-red-600 px-1 rounded font-bold' : 'opacity-80'}`}>{hoursDisplay}</span>
                              )}
                            </div>
                            </React.Fragment>
                          );
                        })}
                        {/* Recurring Allocations */}
                        {recurringAllocations
                          .filter(recurring => recurring.UserId === userRow.Id)
                          .map(recurring => {
                            // Normalize the occurrence date for comparison
                            const occurrenceDateStr = normalizeDateKey(recurring.OccurrenceDate);
                            
                            const dayIndex = timelineColumns.findIndex((column) => {
                              const startKey = getDateKeyFromDate(column.start);
                              const endKey = getDateKeyFromDate(column.end);
                              return occurrenceDateStr >= startKey && occurrenceDateStr <= endKey;
                            });
                            
                            if (dayIndex === -1) return null;
                            
                            const left = useFixedPixelColumns
                              ? `${dayIndex * dayColumnWidthPx}px`
                              : `${(dayIndex / timelineColumns.length) * 100}%`;
                            const width = useFixedPixelColumns
                              ? `${dayColumnWidthPx}px`
                              : `${100 / timelineColumns.length}%`;
                            
                            return (
                              <div
                                key={`recurring-${recurring.Id}-${occurrenceDateStr}`}
                                onClick={() => setRecurringDetailModal({ show: true, recurring })}
                                className="absolute h-6 rounded bg-pink-500 dark:bg-pink-600 opacity-45 hover:opacity-70 cursor-pointer flex items-center text-white text-[10px] px-1 border-l-3 border-pink-700 dark:border-pink-800"
                                style={{
                                  left: left,
                                  width: width,
                                  top: `${recurringLaneTop}px`,
                                  borderLeftWidth: '3px',
                                  zIndex: 30,
                                }}
                                title={`🔄 ${recurring.Title}\n${recurring.StartTime} - ${recurring.EndTime} (${recurring.AllocatedHours}h)\n${recurring.Description || ''}\nClick for details`}
                              >
                                <span className="truncate">
                                  🔄 {recurring.Title} ({recurring.AllocatedHours}h)
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                    {/* User Daily Totals Row */}
                    <div className="flex border-b border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-750">
                      <div className="w-48 min-w-48 max-w-48 flex-none sticky left-0 z-[50] bg-gray-50 dark:bg-gray-750 px-3 py-0.5 border-r border-gray-200 dark:border-gray-700">
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 italic">
                          {useAnnualStyleDensity ? '└ Totals (monthly)' : '└ Totals'}
                        </div>
                      </div>
                      <div className="flex-1 flex" style={useFixedPixelColumns ? { minWidth: `${timelineDaysWidthPx}px` } : undefined}>
                        {timelineColumns.map((column, idx) => {
                          const summary = timelineColumnSummaries[idx];
                          const totals = summary.totals;
                          const hasWork = totals.work > 0;
                          const hasHobby = totals.hobby > 0;
                          const hasRecurring = totals.recurring > 0;
                          const isOverAllocated = summary.isOverAllocated;
                          const holidayNames = summary.holidayNames;
                          const isHoliday = summary.isHoliday;
                          const { vacationLabels, holidayLabels } = splitUnavailableLabels(holidayNames);
                          
                          const workCapacity = summary.workCapacity;
                          const hobbyCapacity = summary.hobbyCapacity;
                          
                          return (
                            <div
                              key={idx}
                              className={`${useFixedPixelColumns ? 'flex-shrink-0' : 'flex-1'} py-0.5 text-center text-[10px] border-r border-gray-200 dark:border-gray-700 ${
                                isOverAllocated
                                  ? 'bg-red-100/70 dark:bg-red-900/35'
                                  : isHoliday
                                  ? 'bg-amber-100/70 dark:bg-amber-900/35'
                                    : summary.isWeekend
                                  ? 'bg-gray-100 dark:bg-gray-700'
                                  : ''
                              } ${idx === todayIndex ? 'bg-blue-100/70 dark:bg-blue-800/25 ring-1 ring-inset ring-blue-300/90 dark:ring-blue-400/80' : ''}`}
                              title={isOverAllocated ? 'Over allocated day: planned hours exceed configured capacity' : isHoliday ? `Unavailable: ${holidayNames.join(', ')}` : undefined}
                              style={useFixedPixelColumns ? { overflow: 'hidden', width: `${dayColumnWidthPx}px` } : { overflow: 'hidden' }}
                            >
                              {vacationLabels.length > 0 && (
                                <div className="text-cyan-700 dark:text-cyan-300 font-medium truncate">🏖️</div>
                              )}
                              {holidayLabels.length > 0 && (
                                <div className="text-amber-700 dark:text-amber-300 font-medium truncate">🎉</div>
                              )}
                              {hasRecurring && (
                                <div className="text-pink-600 dark:text-pink-400 font-medium truncate" style={{ fontSize: useAnnualStyleDensity ? '9px' : undefined }}>
                                  {useAnnualStyleDensity ? `🔄${totals.recurring.toFixed(0)}` : `🔄 ${totals.recurring.toFixed(1)}h`}
                                </div>
                              )}
                              {hasWork && (
                                <div className="text-blue-600 dark:text-blue-400 font-medium truncate" style={{ fontSize: useAnnualStyleDensity ? '9px' : undefined }}>
                                  {useAnnualStyleDensity
                                    ? `${totals.work.toFixed(0)}/${workCapacity.toFixed(0)}`
                                    : `${totals.work.toFixed(1)}h`}
                                  {!useAnnualStyleDensity && workCapacity > 0 && (
                                    <span className="text-gray-400 dark:text-gray-500"> /{workCapacity}h</span>
                                  )}
                                </div>
                              )}
                              {!hasWork && workCapacity > 0 && (
                                <div className="text-gray-400 dark:text-gray-500 truncate" style={{ fontSize: useAnnualStyleDensity ? '9px' : undefined }}>
                                  {useAnnualStyleDensity ? `0/${workCapacity.toFixed(0)}` : `0/${workCapacity}h`}
                                </div>
                              )}
                              {hasHobby && (
                                <div className="text-purple-600 dark:text-purple-400 font-medium truncate" style={{ fontSize: useAnnualStyleDensity ? '9px' : undefined }}>
                                  {useAnnualStyleDensity
                                    ? `${totals.hobby.toFixed(0)}/${hobbyCapacity.toFixed(0)}`
                                    : `${totals.hobby.toFixed(1)}h`}
                                  {!useAnnualStyleDensity && hobbyCapacity > 0 && (
                                    <span className="text-gray-400 dark:text-gray-500"> /{hobbyCapacity}h</span>
                                  )}
                                </div>
                              )}
                              {!hasHobby && hobbyCapacity > 0 && (
                                <div className="text-gray-400 dark:text-gray-500 truncate" style={{ fontSize: useAnnualStyleDensity ? '9px' : undefined }}>
                                  {useAnnualStyleDensity ? `0/${hobbyCapacity.toFixed(0)}` : `0/${hobbyCapacity}h`}
                                </div>
                              )}
                              {!hasWork && !hasHobby && !hasRecurring && workCapacity === 0 && hobbyCapacity === 0 && (
                                <span className="text-gray-300 dark:text-gray-600">-</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              </div>
              </div>
            </div>
          </div>
        )}

        {/* Task Detail Modal */}
        {selectedTask && (() => {
          const selectedProject = projects.find(p => p.Id === selectedTask.ProjectId);
          if (!selectedProject) return null;
          return (
            <TaskDetailModal
              projectId={selectedTask.ProjectId}
              organizationId={selectedProject.OrganizationId}
              task={selectedTask}
              project={selectedProject}
              tasks={tasks.filter(t => t.ProjectId === selectedTask.ProjectId)}
              onOpenTask={(targetTask) => {
                const projectTasks = tasks.filter(t => t.ProjectId === selectedTask.ProjectId);
                const fullTask = projectTasks.find((entry) => Number(entry.Id) === Number(targetTask.Id)) || targetTask;
                void handleTaskClick(fullTask);
              }}
              onClose={() => setSelectedTask(null)}
              onSaved={() => {
                setSelectedTask(null);
                loadAllProjectsTasks(projects);
                loadAllAllocations();
              }}
              token={token!}
              jiraIntegration={jiraIntegrationByOrg[selectedProject.OrganizationId]}
              showRemovePlanning={permissions?.canPlanTasks}
              onRemovePlanning={handleRemovePlanning}
            />
          );
        })()}

        {/* Recurring Allocation Detail Modal */}
        {recurringDetailModal.show && recurringDetailModal.recurring && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  🔄 Recurring Task Details
                </h3>
                <button
                  onClick={() => setRecurringDetailModal({ show: false, recurring: null })}
                  className="text-gray-400 hover:text-gray-500 text-xl"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Title</label>
                  <div className="text-gray-900 dark:text-white font-medium">
                    {recurringDetailModal.recurring.Title}
                  </div>
                </div>
                
                {recurringDetailModal.recurring.Description && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Description</label>
                    <div className="text-gray-700 dark:text-gray-300 text-sm">
                      {recurringDetailModal.recurring.Description}
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Date</label>
                    <div className="text-gray-900 dark:text-white">
                      {(() => {
                        const dateVal = recurringDetailModal.recurring.OccurrenceDate;
                        if (dateVal instanceof Date) {
                          return dateVal.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                        }
                        // Handle string date - extract just the date part
                        const dateStr = String(dateVal).split('T')[0];
                        const parsedDate = new Date(dateStr + 'T12:00:00');
                        if (isNaN(parsedDate.getTime())) {
                          return dateStr || 'Unknown';
                        }
                        return parsedDate.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                      })()}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Hours</label>
                    <div className="text-gray-900 dark:text-white">
                      {recurringDetailModal.recurring.AllocatedHours}h
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Start Time</label>
                    <div className="text-gray-900 dark:text-white">
                      {recurringDetailModal.recurring.StartTime}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">End Time</label>
                    <div className="text-gray-900 dark:text-white">
                      {recurringDetailModal.recurring.EndTime}
                    </div>
                  </div>
                </div>
                
                <div className="bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-700 rounded-lg p-3">
                  <p className="text-sm text-pink-700 dark:text-pink-300">
                    <strong>Note:</strong> This is a recurring task occurrence. To edit recurring task settings, go to <strong>Profile → Recurring Tasks</strong>.
                  </p>
                </div>
              </div>
              <div className="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setRecurringDetailModal({ show: false, recurring: null })}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        </>
        )}

        {/* Allocations Tab */}
        {activeTab === 'allocations' && (
          <div className="w-full bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700" data-grid-enhancer-ignore="true">
            {/* Filters */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Filters</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={allocationFilters.startDate}
                    onChange={(e) => setAllocationFilters(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={allocationFilters.endDate}
                    onChange={(e) => setAllocationFilters(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    User
                  </label>
                  <select
                    value={allocationFilters.userId}
                    onChange={(e) => setAllocationFilters(prev => ({ ...prev, userId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Users</option>
                    {users.map(u => (
                      <option key={u.Id} value={u.Id}>{u.Username}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Project
                  </label>
                  <select
                    value={allocationFilters.projectId}
                    onChange={(e) => setAllocationFilters(prev => ({ ...prev, projectId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Projects</option>
                    {projects.map(p => (
                      <option key={p.Id} value={p.Id}>{p.ProjectName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Task Name
                  </label>
                  <input
                    type="text"
                    placeholder="Search task..."
                    value={allocationFilters.taskName}
                    onChange={(e) => setAllocationFilters(prev => ({ ...prev, taskName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end items-center">
                <button
                  onClick={() => setAllocationFilters({ startDate: '', endDate: '', userId: '', projectId: '', taskName: '' })}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Allocations Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Task
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Assigned Users
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Date Range
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Total Hours
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Allocations
                    </th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {getFilteredAllocations().length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        No allocations found
                      </td>
                    </tr>
                  ) : (
                    getFilteredAllocations().map((group: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                          {group.TaskName}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                          {group.ProjectName}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                          <div className="flex flex-wrap gap-1">
                            {group.userNames.map((userName: string, i: number) => (
                              <span key={i} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                👤 {userName}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                          {group.startDate && group.endDate && (
                            <>
                              {new Date(group.startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {' → '}
                              {new Date(group.endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-600 dark:text-blue-400">
                          {group.totalHours.toFixed(2)}h
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-700 dark:text-gray-300">
                          {group.allocations.length}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {permissions?.canPlanTasks && (
                            <button
                              onClick={() => handleDeleteTaskAllocations(group.TaskId)}
                              title="Delete all allocations"
                              aria-label="Delete all allocations"
                              className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Total Tasks: {getFilteredAllocations().length}
                </span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Total Hours: {getFilteredAllocations().reduce((sum, g: any) => sum + g.totalHours, 0).toFixed(2)}h
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Conflict Resolution Modal */}
        {conflictModal.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
              <div className="flex items-start mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Day Already Has Tasks
                  </h3>
                </div>
              </div>
              
              <div className="text-sm text-gray-700 dark:text-gray-300 mb-4 space-y-3">
                <p>
                  This day already has the following tasks allocated:
                </p>
                <ul className="list-disc list-inside pl-2 space-y-1 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                  {conflictModal.existingTasks.map((taskName, idx) => (
                    <li key={idx} className="text-gray-600 dark:text-gray-400">{taskName}</li>
                  ))}
                </ul>
                <p>
                  You want to add: <strong>{conflictModal.task?.TaskName}</strong> ({conflictModal.totalHoursToAllocate.toFixed(1)}h)
                </p>
                <p className="text-gray-500 dark:text-gray-400">
                  What would you like to do?
                </p>
              </div>

              <div className="space-y-3 mb-4">
                <button
                  onClick={handleConflictPushForward}
                  className="w-full p-4 text-left border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                >
                  <div className="font-medium text-blue-700 dark:text-blue-300">⏩ Push Existing Tasks Forward</div>
                  <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                    Move all existing tasks on this day and onwards to make room for the new task
                  </div>
                </button>
                
                <button
                  onClick={handleConflictPlanAvailable}
                  className="w-full p-4 text-left border-2 border-green-500 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                >
                  <div className="font-medium text-green-700 dark:text-green-300">📅 Plan When Available</div>
                  <div className="text-sm text-green-600 dark:text-green-400 mt-1">
                    Use available time slots around existing tasks (may span multiple days)
                  </div>
                </button>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setConflictModal(prev => ({ ...prev, show: false }))}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hours Per Day Modal */}
        {hoursPerDayModal.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <div className="flex items-start mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Plan Task: {hoursPerDayModal.task?.TaskName}
                  </h3>
                </div>
              </div>
              
              <div className="text-sm text-gray-700 dark:text-gray-300 mb-4 space-y-3">
                {/* Task Info */}
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
                  {hoursPerDayModal.isParentTask && hoursPerDayModal.leafTasks && (
                    <p className="text-blue-800 dark:text-blue-300">
                      <strong>{hoursPerDayModal.leafTasks.length}</strong> leaf task(s) with{' '}
                      <strong>{hoursPerDayModal.totalEstimatedHours.toFixed(1)}h</strong> total estimated
                    </p>
                  )}
                  {!hoursPerDayModal.isParentTask && (
                    <p className="text-blue-800 dark:text-blue-300">
                      Total estimated: <strong>{hoursPerDayModal.totalEstimatedHours.toFixed(1)}h</strong>
                    </p>
                  )}
                  {hoursPerDayModal.hoursAlreadyWorked > 0 && (
                    <p className="text-blue-800 dark:text-blue-300">
                      Already worked: <strong>{hoursPerDayModal.hoursAlreadyWorked.toFixed(1)}h</strong>
                    </p>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  How many hours to plan?
                </label>
                <input
                  type="number"
                  min="0.5"
                  max={hoursPerDayModal.totalEstimatedHours}
                  step="0.5"
                  value={hoursPerDayModal.totalHours}
                  onChange={(e) => setHoursPerDayModal(prev => ({ ...prev, totalHours: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-semibold"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Suggested: {(hoursPerDayModal.totalEstimatedHours - hoursPerDayModal.hoursAlreadyWorked).toFixed(1)}h (estimated - worked)
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Hours per day
                </label>
                <input
                  type="number"
                  min="0.5"
                  max={hoursPerDayModal.maxDailyHours}
                  step="0.5"
                  value={hoursPerDayModal.hoursPerDay}
                  onChange={(e) => setHoursPerDayModal(prev => ({ ...prev, hoursPerDay: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Your daily work capacity: {hoursPerDayModal.maxDailyHours} hours
                </p>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setHoursPerDayModal(prev => ({ ...prev, show: false }))}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleHoursPerDayConfirm}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Plan Task
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Planning Progress Modal */}
        {planningProgress.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Planning Task: {planningProgress.taskName}
              </h3>
              
              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{planningProgress.currentStep}</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{planningProgress.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div 
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${planningProgress.progress}%` }}
                  />
                </div>
              </div>
              
              {/* Details */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Total Hours:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{planningProgress.totalHours.toFixed(1)}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Allocated:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{planningProgress.allocatedHours.toFixed(1)}h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Days Processed:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{planningProgress.daysProcessed}</span>
                </div>
              </div>
              
              {/* Loading Spinner */}
              <div className="flex justify-center mt-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            </div>
          </div>
        )}

        {/* Alert/Confirm Modal */}
        {modalMessage && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-start mb-4">
                  <div className="flex-shrink-0">
                    {modalMessage.type === 'alert' ? (
                      <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    )}
                  </div>
                  <div className="ml-3 flex-1">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      {modalMessage.title}
                    </h3>
                    <div className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
                      {modalMessage.message}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  {modalMessage.type === 'confirm' && (
                    <button
                      onClick={closeModal}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={modalMessage.type === 'confirm' ? handleModalConfirm : closeModal}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      modalMessage.type === 'confirm'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {modalMessage.type === 'confirm' ? 'Confirm' : 'OK'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Subtasks Planning Modal */}
        {subtasksModal.show && subtasksModal.parentTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Plan Subtasks for: {subtasksModal.parentTask.TaskName}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Drag subtasks to reorder by priority. Plan each subtask individually by dragging to the gantt chart.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {subtasksModal.subtasks.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    No subtasks found for this task.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {subtasksModal.subtasks.map((subtask, index) => {
                      const level = getTaskDepthLevel(subtask, subtasksModal.parentTask!.Id);
                      const indentPx = level * 24;
                      
                      return (
                        <div
                          key={subtask.Id}
                          draggable
                          onDragStart={() => handleSubtaskDragStart(subtask)}
                          onDragOver={(e) => handleSubtaskDragOver(e, subtask)}
                          onDragEnd={handleSubtaskDragEnd}
                          className={`p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border-2 border-gray-200 dark:border-gray-600 cursor-move hover:border-blue-400 transition-all ${
                            subtasksModal.draggedSubtask?.Id === subtask.Id ? 'opacity-50' : ''
                          }`}
                          style={{ marginLeft: `${indentPx}px` }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg font-bold text-gray-400 dark:text-gray-500">#{index + 1}</span>
                                {level > 0 && (
                                  <span className="text-gray-400 dark:text-gray-500">
                                    {'└' + '─'.repeat(level)}
                                  </span>
                                )}
                                <h3 className={`text-lg ${level === 0 ? 'font-bold' : 'font-semibold'} text-gray-900 dark:text-white`}>
                                  {subtask.TaskName}
                                </h3>
                              </div>
                              
                              {subtask.Description && (() => {
                                const plainText = subtask.Description.replace(/<[^>]*>/g, '').trim();
                                return plainText ? (
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    {plainText}
                                  </p>
                                ) : null;
                              })()}

                              <div className="flex flex-wrap gap-4 text-sm">
                                {subtask.EstimatedHours && (
                                  <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                    <span>⏱️</span>
                                    <span>{subtask.EstimatedHours}h</span>
                                  </div>
                                )}
                                
                                {subtask.DueDate && (
                                  <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                                    <span>📅</span>
                                    <span>{new Date(subtask.DueDate).toLocaleDateString()}</span>
                                  </div>
                                )}

                                {subtask.PlannedStartDate && subtask.PlannedEndDate && (
                                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                    <span>✅</span>
                                    <span>Planned</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="ml-4 text-gray-400 dark:text-gray-500 cursor-move">
                              ⋮⋮
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Total subtasks: {subtasksModal.subtasks.length}
                  </div>
                  <button
                    onClick={closeSubtasksModal}
                    className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manual Allocation Modal */}
        {manualAllocationModal.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {manualAllocationModal.mode === 'add' ? 'Add Manual Allocation' : 'Edit Manual Allocation'}
                </h3>

                <div className="space-y-4">
                  {manualAllocationModal.mode === 'add' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Task
                        </label>
                        <SearchableSelect
                          value={manualAllocationModal.taskId ? manualAllocationModal.taskId.toString() : ''}
                          onChange={(value) => setManualAllocationModal(prev => ({ ...prev, taskId: value ? parseInt(value) : undefined }))}
                          options={tasks.map(t => {
                            const project = projects.find(p => p.Id === t.ProjectId);
                            return {
                              value: t.Id,
                              label: `${project?.ProjectName} - ${t.TaskName}`
                            };
                          })}
                          placeholder="Select Task"
                          emptyText="Select Task"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          User
                        </label>
                        <select
                          value={manualAllocationModal.userId || ''}
                          onChange={(e) => setManualAllocationModal(prev => ({ ...prev, userId: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select User</option>
                          {users.map(u => (
                            <option key={u.Id} value={u.Id}>{u.Username}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Date
                    </label>
                    <input
                      type="date"
                      value={manualAllocationModal.allocationDate}
                      onChange={(e) => setManualAllocationModal(prev => ({ ...prev, allocationDate: e.target.value }))}
                      disabled={manualAllocationModal.mode === 'edit'}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Hours
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="24"
                      value={manualAllocationModal.allocatedHours}
                      onChange={(e) => setManualAllocationModal(prev => ({ ...prev, allocatedHours: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., 4.5"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Start Time
                      </label>
                      <input
                        type="time"
                        value={manualAllocationModal.startTime}
                        onChange={(e) => setManualAllocationModal(prev => ({ ...prev, startTime: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        End Time
                      </label>
                      <input
                        type="time"
                        value={manualAllocationModal.endTime}
                        onChange={(e) => setManualAllocationModal(prev => ({ ...prev, endTime: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setManualAllocationModal({ show: false, allocationDate: '', allocatedHours: '', startTime: '09:00', endTime: '17:00', mode: 'add' })}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveManualAllocation}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    {manualAllocationModal.mode === 'add' ? 'Add Allocation' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
    </CustomerUserGuard>
  );
}

