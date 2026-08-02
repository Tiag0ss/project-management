'use client';

import { getApiUrl } from '@/lib/api/config';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useToast } from '@/contexts/ToastContext';
import { tasksApi, Task } from '@/lib/api/tasks';
import { projectsApi, Project } from '@/lib/api/projects';
import { usersApi, User } from '@/lib/api/users';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { projectMilestonesApi, ProjectMilestone } from '@/lib/api/projectMilestones';
import Navbar from '@/components/Navbar';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import AllocationHeaderDetailModal from '@/components/AllocationHeaderDetailModal';
import TaskDetailModal from '@/components/TaskDetailModal';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import SearchableSelect from '@/components/SearchableSelect';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import { TaskTypeIconMark } from '@/lib/taskTypeIcons';
import { useColorVision } from '@/hooks/useColorVision';
import { loadOutlookCalendarEvents, type PlannerOutlookEvent } from './hooks/loadOutlookCalendarEvents';

// Week days constant - reused throughout the component
const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PLANNING_HOUR_STEP = 0.5;
const GANTT_NONE_SELECTED = -1;
const PLANNING_GANTT_VIEW_OPTIONS_KEY = 'planning:gantt:view-options';

const roundToPlanningStep = (value: number | string | null | undefined): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  const scaled = Math.round((numericValue / PLANNING_HOUR_STEP) + Number.EPSILON);
  return Number((scaled * PLANNING_HOUR_STEP).toFixed(2));
};

const floorToPlanningStep = (value: number | string | null | undefined): number => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  const scaled = Math.floor((numericValue / PLANNING_HOUR_STEP) + 1e-9);
  return Number((scaled * PLANNING_HOUR_STEP).toFixed(2));
};

const isPlanningStepValue = (value: number | string | null | undefined): boolean => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return false;
  const scaled = numericValue / PLANNING_HOUR_STEP;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
};

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
  RegionCode?: string | null;
  HolidayDate: string;
  HolidayName: string;
  Source: string;
  IsActive: number;
}

interface PlannerVacationDay {
  Id: number;
  UserId: number;
  VacationDate: string;
  DayPortion?: 'full' | 'half' | string;
  Status: string;
  Notes?: string;
}

interface PlannerOutOfOfficeDay {
  Id: number;
  UserId: number;
  OutOfOfficeDate: string;
  DayPortion?: 'full' | 'half' | string;
  Status: string;
  Notes?: string;
}

interface PlannerDevSupportDay {
  Id: number;
  UserId: number;
  DevSupportDate: string;
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
  const { mapColor } = useColorVision();
  const { permissions, isLoading: isLoadingPermissions } = usePermissions();
  const { showToast } = useToast();
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
  const [hoveredDropCell, setHoveredDropCell] = useState<{ userId: number; dateKey: string } | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [jiraIntegrationByOrg, setJiraIntegrationByOrg] = useState<Record<number, any>>({});
  const [taskAllocations, setTaskAllocations] = useState<any[]>([]);
  const [projectMilestones, setProjectMilestones] = useState<ProjectMilestone[]>([]);
  const [allAllocations, setAllAllocations] = useState<{Id?: number; TaskId: number; TaskAllocationHeaderId?: number | null; UserId: number; AllocationDate: string; AllocatedHours: number; IsHobby: number; IsManual?: number; StartTime?: string; EndTime?: string; PlannedStartDate?: string | null; PlannedEndDate?: string | null; HoursPerDay?: number | null}[]>([]);
  const [childAllocations, setChildAllocations] = useState<{ParentTaskId: number; ChildTaskId: number; TaskAllocationHeaderId?: number | null; AllocationDate: string; AllocatedHours: number; Level: number}[]>([]);
  const [taskTimeEntries, setTaskTimeEntries] = useState<any[]>([]);
  const [recurringAllocations, setRecurringAllocations] = useState<any[]>([]);
  const [outlookTimelineEvents, setOutlookTimelineEvents] = useState<PlannerOutlookEvent[]>([]);
  const [isLoadingOutlookCalendar, setIsLoadingOutlookCalendar] = useState(false);
  const [selectedOutlookEvent, setSelectedOutlookEvent] = useState<PlannerOutlookEvent | null>(null);
  const [showOutlookActionModal, setShowOutlookActionModal] = useState(false);
  const [isStartingOutlookTimer, setIsStartingOutlookTimer] = useState(false);
  const [holidayNamesByUserDate, setHolidayNamesByUserDate] = useState<Record<number, Record<string, string[]>>>({});
  const [devSupportLabelsByUserDate, setDevSupportLabelsByUserDate] = useState<Record<number, Record<string, string[]>>>({});
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [showDependencyLines, setShowDependencyLines] = useState(true);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);
  const [showGanttTotals, setShowGanttTotals] = useState(true);
  const [showTaskBarHours, setShowTaskBarHours] = useState(true);
  const [showTimeEntriesOverlay, setShowTimeEntriesOverlay] = useState(false);
  const [plannerTimeEntries, setPlannerTimeEntries] = useState<any[]>([]);
  const [isLoadingPlannerTimeEntries, setIsLoadingPlannerTimeEntries] = useState(false);
  const [showGanttViewOptions, setShowGanttViewOptions] = useState(false);
  const [snapshotModal, setSnapshotModal] = useState<{
    show: boolean;
    isLoading: boolean;
    isSaving: boolean;
    snapshots: any[];
    newName: string;
    newDescription: string;
    error: string;
  }>({
    show: false,
    isLoading: false,
    isSaving: false,
    snapshots: [],
    newName: '',
    newDescription: '',
    error: '',
  });
  const [showPlanningTools, setShowPlanningTools] = useState(false);
  const [toolbarSnapshots, setToolbarSnapshots] = useState<any[]>([]);
  const [isLoadingToolbarSnapshots, setIsLoadingToolbarSnapshots] = useState(false);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null);
  const [snapshotOverlayData, setSnapshotOverlayData] = useState<{ headers: any[]; allocations: any[] } | null>(null);
  const [isLoadingSnapshotOverlay, setIsLoadingSnapshotOverlay] = useState(false);
  const [selectedGanttUserIds, setSelectedGanttUserIds] = useState<number[]>([]);
  const [hasLoadedGanttViewPrefs, setHasLoadedGanttViewPrefs] = useState(false);
  const [ganttSearch, setGanttSearch] = useState('');
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'year' | 'custom'>('week');
  const [customStartDate, setCustomStartDate] = useState(() => formatDateForInput(viewStartDate));
  const [customEndDate, setCustomEndDate] = useState(() => {
    const endDate = new Date(viewStartDate);
    endDate.setDate(endDate.getDate() + 27);
    return formatDateForInput(endDate);
  });
  const [activeTab, setActiveTab] = useState<'gantt' | 'allocations'>('gantt');
  const [ganttGroupBy, setGanttGroupBy] = useState<'resource' | 'customer' | 'project' | 'time-entries'>('resource');
  const [maxVisibleLevel, setMaxVisibleLevel] = useState<number>(0);
  const [allocationFilters, setAllocationFilters] = useState({
    startDate: '',
    endDate: '',
    userId: '',
    projectId: '',
    taskName: ''
  });
  const [expandedAllocationRows, setExpandedAllocationRows] = useState<Set<number>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const ganttContainerRef = useRef<HTMLDivElement>(null);
  const ganttViewOptionsRef = useRef<HTMLDivElement>(null);
  const suppressTaskClickUntilRef = useRef(0);
  const draggedTaskRef = useRef<Task | null>(null);
  const draggedTaskSourceUserIdRef = useRef<number | null>(null);
  const draggedTaskSourceHeaderIdRef = useRef<number | null>(null);
  const draggedTaskSliceByHoursRef = useRef<boolean>(false);
  
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
  const [taskContextMenu, setTaskContextMenu] = useState<{
    show: boolean;
    x: number;
    y: number;
    openUpward: boolean;
    task: Task | null;
    userId: number | null;
    headerId: number | null;
  }>({
    show: false,
    x: 0,
    y: 0,
    openUpward: false,
    task: null,
    userId: null,
    headerId: null,
  });
  const [allocationHeaderModal, setAllocationHeaderModal] = useState<{
    show: boolean;
    headerId: number | null;
  }>({
    show: false,
    headerId: null,
  });

  // Extra time modal state
  const [extraTimeModal, setExtraTimeModal] = useState<{
    show: boolean;
    task: Task | null;
    userId: number | null;
    extraHours: string;
    hoursPerDay: string;
    isProcessing: boolean;
    error: string;
    leafTasks: Task[];
    selectedSubtaskIds: number[];
  }>({
    show: false,
    task: null,
    userId: null,
    extraHours: '',
    hoursPerDay: '8',
    isProcessing: false,
    error: '',
    leafTasks: [],
    selectedSubtaskIds: [],
  });
  const [forceDatesModal, setForceDatesModal] = useState<{
    show: boolean;
    task: Task | null;
    startDate: string;
    endDate: string;
    isSaving: boolean;
    error: string;
  }>({
    show: false,
    task: null,
    startDate: '',
    endDate: '',
    isSaving: false,
    error: '',
  });
  const [taskResizeState, setTaskResizeState] = useState<{
    task: Task | null;
    edge: 'start' | 'end' | null;
    startX: number;
    initialStartIndex: number;
    initialEndIndex: number;
    currentStartIndex: number;
    currentEndIndex: number;
    columnWidthPx: number;
    resizeUserId: number | null;
    resizeHeaderId: number | null;
    isSaving: boolean;
  }>({
    task: null,
    edge: null,
    startX: 0,
    initialStartIndex: 0,
    initialEndIndex: 0,
    currentStartIndex: 0,
    currentEndIndex: 0,
    columnWidthPx: 1,
    resizeUserId: null,
    resizeHeaderId: null,
    isSaving: false,
  });
  const [isShiftResizeMode, setIsShiftResizeMode] = useState(false);
  const [shiftResizeSuggestionModal, setShiftResizeSuggestionModal] = useState<{
    show: boolean;
    task: Task | null;
    headerId: number | null;
    userId: number | null;
    plannedStartDate: string;
    plannedEndDate: string;
    totalHours: number;
    suggestedHoursPerDay: number;
    hoursPerDayInput: string;
    headerMeta: {
      AllocationMode?: string;
      SplitOrder?: number | null;
    };
    isSubmitting: boolean;
    error: string;
  }>({
    show: false,
    task: null,
    headerId: null,
    userId: null,
    plannedStartDate: '',
    plannedEndDate: '',
    totalHours: 0,
    suggestedHoursPerDay: 0,
    hoursPerDayInput: '',
    headerMeta: {},
    isSubmitting: false,
    error: '',
  });

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
    sourceUserId?: number | null;
    sourceHeaderId?: number | null;
    sourceAllocationDates?: string[];
    suppressDependentReplan?: boolean;
  }>({
    show: false,
    task: null,
    userId: null,
    startDate: null,
    existingTasks: [],
    totalHoursToAllocate: 0,
    hoursAlreadyWorked: 0,
    maxDailyHours: 8,
    sourceUserId: null,
    sourceHeaderId: null,
    sourceAllocationDates: [],
    suppressDependentReplan: false,
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
    enableSplit?: boolean;
    splitMode?: 'parallel' | 'sequential';
    splitEntries?: Array<{
      userId: number;
      plannedHours: number;
      hoursPerDay: number;
      splitOrder: number;
      selectedLeafTaskIds?: number[];
    }>;
    sourceUserId?: number | null;
    sourceHeaderId?: number | null;
    sourceAllocationDates?: string[];
    suppressDependentReplan?: boolean;
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
    enableSplit: false,
    splitMode: 'parallel',
    splitEntries: [],
    sourceUserId: null,
    sourceHeaderId: null,
    sourceAllocationDates: [],
    suppressDependentReplan: false,
  });
  const [leafTaskRemainingHoursById, setLeafTaskRemainingHoursById] = useState<Record<number, number>>({});

  const [sliceTransferModal, setSliceTransferModal] = useState<{
    show: boolean;
    taskId: number | null;
    targetUserId: number | null;
    dropDate: string;
    sourceUserId: number | null;
    sourceHeaderId: number | null;
    sourceAllocationDates: string[];
    sourceTotalHours: number;
    totalHours: number;
    moveHours: number;
    availableChildTaskIds: number[];
    selectedChildTaskIds: number[];
    isProcessing: boolean;
  }>({
    show: false,
    taskId: null,
    targetUserId: null,
    dropDate: '',
    sourceUserId: null,
    sourceHeaderId: null,
    sourceAllocationDates: [],
    sourceTotalHours: 0,
    totalHours: 0,
    moveHours: 0,
    availableChildTaskIds: [],
    selectedChildTaskIds: [],
    isProcessing: false,
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
  const [milestoneEditor, setMilestoneEditor] = useState<{
    show: boolean;
    milestone: ProjectMilestone | null;
    projectName: string;
    customerName: string;
    name: string;
    description: string;
    dueDate: string;
    isCompleted: boolean;
    milestoneTypeId: number | '';
    milestoneTypes: StatusValue[];
    error: string;
    isSaving: boolean;
    isDeleting: boolean;
  }>({
    show: false,
    milestone: null,
    projectName: '',
    customerName: '',
    name: '',
    description: '',
    dueDate: '',
    isCompleted: false,
    milestoneTypeId: '',
    milestoneTypes: [],
    error: '',
    isSaving: false,
    isDeleting: false,
  });
  const [showOverdueDetails, setShowOverdueDetails] = useState(false);
  const [activeTimerTaskId, setActiveTimerTaskId] = useState<number | null>(null);
  const [otherActiveTimerTaskIds, setOtherActiveTimerTaskIds] = useState<Set<number>>(new Set());

  const showAlert = (title: string, message: string) => {
    const normalizedTitle = title.trim().toLowerCase();
    const normalizedMessage = message.trim().toLowerCase();
    const isSuccessAlert =
      normalizedTitle === 'success'
      || normalizedTitle === 'baseline set'
      || normalizedMessage.includes('successfully');

    if (isSuccessAlert) {
      showToast({ type: 'success', title, message });
      return;
    }

    setModalMessage({ type: 'alert', title, message });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalMessage({ type: 'confirm', title, message, onConfirm });
  };

  const closeModal = () => {
    setModalMessage(null);
  };

  const closeTaskContextMenu = () => {
    setTaskContextMenu({ show: false, x: 0, y: 0, openUpward: false, task: null, userId: null, headerId: null });
  };

  const openAllocationHeaderModal = (headerId: number) => {
    setAllocationHeaderModal({ show: true, headerId });
  };

  const closeAllocationHeaderModal = () => {
    setAllocationHeaderModal({ show: false, headerId: null });
  };

  const closeForceDatesModal = () => {
    setForceDatesModal({
      show: false,
      task: null,
      startDate: '',
      endDate: '',
      isSaving: false,
      error: '',
    });
  };

  const closeTaskResize = () => {
    setTaskResizeState({
      task: null,
      edge: null,
      startX: 0,
      initialStartIndex: 0,
      initialEndIndex: 0,
      currentStartIndex: 0,
      currentEndIndex: 0,
      columnWidthPx: 1,
      resizeUserId: null,
      resizeHeaderId: null,
      isSaving: false,
    });
  };

  const closeShiftResizeSuggestionModal = () => {
    setShiftResizeSuggestionModal({
      show: false,
      task: null,
      headerId: null,
      userId: null,
      plannedStartDate: '',
      plannedEndDate: '',
      totalHours: 0,
      suggestedHoursPerDay: 0,
      hoursPerDayInput: '',
      headerMeta: {},
      isSubmitting: false,
      error: '',
    });
  };

  const calculateSuggestedHoursPerDay = useCallback((totalHours: number, plannedStartDate: string, plannedEndDate: string): number => {
    if (!plannedStartDate || !plannedEndDate || !Number.isFinite(totalHours) || totalHours <= 0) {
      return 0;
    }

    const startDateObj = new Date(`${plannedStartDate}T12:00:00`);
    const endDateObj = new Date(`${plannedEndDate}T12:00:00`);
    const rangeDays = Math.max(1, Math.round((endDateObj.getTime() - startDateObj.getTime()) / 86_400_000) + 1);
    return roundToPlanningStep(totalHours / rangeDays);
  }, []);

  const activeTimerGlowIds = useMemo(() => {
    if (activeTimerTaskId === null) return new Set<number>();
    const glowIds = new Set<number>();
    glowIds.add(activeTimerTaskId);
    // Walk up the parent chain so parent task bars also glow
    const parentMap = new Map(tasks.map((t) => [t.Id, t.ParentTaskId ?? null]));
    let cursor: number | null = activeTimerTaskId;
    while (cursor !== null) {
      const parent: number | null = parentMap.get(cursor) ?? null;
      if (parent !== null) glowIds.add(parent);
      cursor = parent;
    }
    return glowIds;
  }, [activeTimerTaskId, tasks]);

  const otherActiveTimerGlowIds = useMemo(() => {
    if (otherActiveTimerTaskIds.size === 0) return new Set<number>();
    const parentMap = new Map(tasks.map((t) => [t.Id, t.ParentTaskId ?? null]));
    const glowIds = new Set<number>();
    for (const taskId of otherActiveTimerTaskIds) {
      glowIds.add(taskId);
      let cursor: number | null = taskId;
      while (cursor !== null) {
        const parent: number | null = parentMap.get(cursor) ?? null;
        if (parent !== null) glowIds.add(parent);
        cursor = parent;
      }
    }
    return glowIds;
  }, [otherActiveTimerTaskIds, tasks]);

  const allocationHoursByHeaderId = useMemo(() => {
    const totals = new Map<number, number>();
    for (const allocation of allAllocations) {
      const headerId = Number(allocation.TaskAllocationHeaderId || 0);
      if (!Number.isFinite(headerId) || headerId <= 0) {
        continue;
      }
      const hours = Number(allocation.AllocatedHours || 0);
      const previous = totals.get(headerId) || 0;
      totals.set(headerId, roundToPlanningStep(previous + hours));
    }
    return totals;
  }, [allAllocations]);

  const shouldSuppressTaskClick = () => Date.now() < suppressTaskClickUntilRef.current;
  const canUseGanttPlanningActions = () => !!permissions?.canPlanTasks && ganttGroupBy === 'resource';

  const closeMilestoneEditor = () => {
    setMilestoneEditor({
      show: false,
      milestone: null,
      projectName: '',
      customerName: '',
      name: '',
      description: '',
      dueDate: '',
      isCompleted: false,
      milestoneTypeId: '',
      milestoneTypes: [],
      error: '',
      isSaving: false,
      isDeleting: false,
    });
  };

  const getMilestoneTypeLabel = (type: StatusValue): string => {
    return String(type.StatusName || type.TypeName || `Type #${type.Id}`);
  };

  const openMilestoneEditor = async (milestone: ProjectMilestone) => {
    const project = projects.find((item) => Number(item.Id) === Number(milestone.ProjectId));
    let milestoneTypes: StatusValue[] = [];

    if (project && token) {
      try {
        const result = await statusValuesApi.getMilestoneTypes(project.OrganizationId, token);
        milestoneTypes = result.types || [];
      } catch (error) {
        console.error('Failed to load milestone types:', error);
      }
    }

    setMilestoneEditor({
      show: true,
      milestone,
      projectName: project?.ProjectName || 'Unknown Project',
      customerName: project?.CustomerName || '',
      name: milestone.Name || '',
      description: milestone.Description || '',
      dueDate: milestone.DueDate ? String(milestone.DueDate).split('T')[0] : '',
      isCompleted: Number(milestone.IsCompleted || 0) === 1,
      milestoneTypeId: milestone.MilestoneTypeId != null ? Number(milestone.MilestoneTypeId) : '',
      milestoneTypes,
      error: '',
      isSaving: false,
      isDeleting: false,
    });
  };

  const handleMilestoneSave = async () => {
    if (!milestoneEditor.milestone || !token) return;
    if (!milestoneEditor.name.trim()) {
      setMilestoneEditor((prev) => ({ ...prev, error: 'Milestone name is required.' }));
      return;
    }

    try {
      setMilestoneEditor((prev) => ({ ...prev, isSaving: true, error: '' }));
      await projectMilestonesApi.update(
        milestoneEditor.milestone.Id,
        {
          name: milestoneEditor.name.trim(),
          description: milestoneEditor.description.trim(),
          dueDate: milestoneEditor.dueDate || undefined,
          isCompleted: milestoneEditor.isCompleted,
          milestoneTypeId: milestoneEditor.milestoneTypeId === '' ? null : Number(milestoneEditor.milestoneTypeId),
        },
        token,
      );
      await loadAllProjectMilestones(projects);
      closeMilestoneEditor();
    } catch (error: any) {
      setMilestoneEditor((prev) => ({
        ...prev,
        isSaving: false,
        error: error?.message || 'Failed to save milestone.',
      }));
    }
  };

  const handleMilestoneDelete = async () => {
    if (!milestoneEditor.milestone || !token) return;

    try {
      setMilestoneEditor((prev) => ({ ...prev, isDeleting: true, error: '' }));
      await projectMilestonesApi.delete(milestoneEditor.milestone.Id, token);
      await loadAllProjectMilestones(projects);
      closeMilestoneEditor();
    } catch (error: any) {
      setMilestoneEditor((prev) => ({
        ...prev,
        isDeleting: false,
        error: error?.message || 'Failed to delete milestone.',
      }));
    }
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

  const getUserDevSupportLabels = (userId: number, dateStr: string): string[] => {
    return devSupportLabelsByUserDate[userId]?.[dateStr] || [];
  };

  const isHalfDayLeaveLabel = (label: unknown): boolean => {
    const normalized = String(label || '').trim();
    return /^half-day\s+(vacation|out\s*of\s*office)\b/i.test(normalized);
  };

  const isUserFullyUnavailable = (userId: number, dateStr: string): boolean => {
    const labels = getUserHolidayNames(userId, dateStr);
    if (labels.length === 0) return false;
    return labels.some((label) => !isHalfDayLeaveLabel(label));
  };

  const isUserHoliday = (userId: number, dateStr: string): boolean => {
    return isUserFullyUnavailable(userId, dateStr);
  };

  const splitUnavailableLabels = (labels: string[]) => {
    const vacationPattern = /^(?:half-day\s+)?vacation\b/i;
    const outOfOfficePattern = /^(?:half-day\s+)?out\s*of\s*office\b/i;
    const vacationLabels = labels.filter((label) => vacationPattern.test(String(label || '').trim()));
    const outOfOfficeLabels = labels.filter((label) => outOfOfficePattern.test(String(label || '').trim()));
    const holidayLabels = labels.filter((label) => !vacationPattern.test(String(label || '').trim()) && !outOfOfficePattern.test(String(label || '').trim()));
    return { vacationLabels, outOfOfficeLabels, holidayLabels };
  };

  const isBlockingUnavailableLabel = (labels: string[]): boolean => {
    if (labels.length === 0) return false;
    const { vacationLabels, outOfOfficeLabels, holidayLabels } = splitUnavailableLabels(labels);
    return vacationLabels.length > 0 || outOfOfficeLabels.length > 0 || holidayLabels.length > 0;
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

  useEffect(() => {
    if (!token) return;
    const fetchActiveTimer = async () => {
      try {
        const [ownRes, othersRes] = await Promise.all([
          fetch(`${getApiUrl()}/api/timers/active`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${getApiUrl()}/api/timers/active-all`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (ownRes.ok) {
          const data = await ownRes.json();
          setActiveTimerTaskId(data?.timer?.TaskId ?? null);
        } else {
          setActiveTimerTaskId(null);
        }
        if (othersRes.ok) {
          const data = await othersRes.json();
          setOtherActiveTimerTaskIds(new Set<number>((data?.taskIds || []).map(Number)));
        } else {
          setOtherActiveTimerTaskIds(new Set());
        }
      } catch {
        // silently ignore
      }
    };
    fetchActiveTimer();
    const interval = setInterval(fetchActiveTimer, 30000);
    window.addEventListener('timer-changed', fetchActiveTimer);
    return () => {
      clearInterval(interval);
      window.removeEventListener('timer-changed', fetchActiveTimer);
    };
  }, [token]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ganttViewOptionsRef.current && !ganttViewOptionsRef.current.contains(event.target as Node)) {
        setShowGanttViewOptions(false);
      }
    };

    if (showGanttViewOptions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showGanttViewOptions]);

  useEffect(() => {
    if (users.length === 0) {
      return;
    }

    setSelectedGanttUserIds((previousSelectedIds) => {
      if (previousSelectedIds.includes(GANTT_NONE_SELECTED)) {
        return previousSelectedIds;
      }

      if (previousSelectedIds.length === 0) {
        return previousSelectedIds;
      }

      const availableUserIds = new Set(
        users
          .map((planningUser) => Number(planningUser.Id))
          .filter((id) => Number.isInteger(id) && id > 0)
      );
      const nextSelectedIds = previousSelectedIds.filter((id) => availableUserIds.has(id));

      if (nextSelectedIds.length === previousSelectedIds.length) {
        return previousSelectedIds;
      }

      if (nextSelectedIds.length === 0) {
        return [];
      }

      return nextSelectedIds;
    });
  }, [users]);

  useEffect(() => {
    const closeMenu = () => {
      setTaskContextMenu((prev) => (prev.show ? { show: false, x: 0, y: 0, openUpward: false, task: null, userId: null, headerId: null } : prev));
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    if (taskContextMenu.show) {
      window.addEventListener('click', closeMenu);
      window.addEventListener('scroll', closeMenu, true);
      window.addEventListener('resize', closeMenu);
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [taskContextMenu.show]);

  useEffect(() => {
    if (canUseGanttPlanningActions()) return;

    closeTaskContextMenu();
    closeForceDatesModal();
    closeTaskResize();
  }, [ganttGroupBy, permissions?.canPlanTasks]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setIsShiftResizeMode(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setIsShiftResizeMode(false);
      }
    };

    const handleWindowBlur = () => {
      setIsShiftResizeMode(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLANNING_GANTT_VIEW_OPTIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          showDependencyLines?: boolean;
          showCriticalPath?: boolean;
          showBaseline?: boolean;
          showGanttTotals?: boolean;
          showTaskBarHours?: boolean;
          showTimeEntriesOverlay?: boolean;
          selectedGanttUserIds?: unknown;
        };

        if (typeof parsed.showDependencyLines === 'boolean') setShowDependencyLines(parsed.showDependencyLines);
        if (typeof parsed.showCriticalPath === 'boolean') setShowCriticalPath(parsed.showCriticalPath);
        if (typeof parsed.showBaseline === 'boolean') setShowBaseline(parsed.showBaseline);
        if (typeof parsed.showGanttTotals === 'boolean') setShowGanttTotals(parsed.showGanttTotals);
        if (typeof parsed.showTaskBarHours === 'boolean') setShowTaskBarHours(parsed.showTaskBarHours);
        if (typeof parsed.showTimeEntriesOverlay === 'boolean') setShowTimeEntriesOverlay(parsed.showTimeEntriesOverlay);

        if (Array.isArray(parsed.selectedGanttUserIds)) {
          const normalizedIds = parsed.selectedGanttUserIds.filter(
            (id: unknown): id is number =>
              typeof id === 'number' && Number.isInteger(id) && (id === GANTT_NONE_SELECTED || id > 0)
          );

          if (normalizedIds.includes(GANTT_NONE_SELECTED)) {
            setSelectedGanttUserIds([GANTT_NONE_SELECTED]);
          } else {
            setSelectedGanttUserIds(normalizedIds);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load Gantt view options from localStorage:', error);
    } finally {
      setHasLoadedGanttViewPrefs(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedGanttViewPrefs) return;

    try {
      localStorage.setItem(
        PLANNING_GANTT_VIEW_OPTIONS_KEY,
        JSON.stringify({
          showDependencyLines,
          showCriticalPath,
          showBaseline,
          showGanttTotals,
          showTaskBarHours,
          showTimeEntriesOverlay,
          selectedGanttUserIds,
        })
      );
    } catch (error) {
      console.warn('Failed to save Gantt view options to localStorage:', error);
    }
  }, [
    hasLoadedGanttViewPrefs,
    showDependencyLines,
    showCriticalPath,
    showBaseline,
    showGanttTotals,
    showTaskBarHours,
    showTimeEntriesOverlay,
    selectedGanttUserIds,
  ]);

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
        const projectsList = projectsRes.projects;

        const [, , loadedTasks] = await Promise.all([
          loadTaskStatusValues(projectsList),
          loadAllProjectMilestones(projectsList),
          loadAllProjectsTasks(projectsList),
          loadAllUsers(projectsList),
        ]);

        const dateRange = getVisibleDateRange();
        await Promise.all([
          loadRecurringAllocations(allUsersRef.current),
          loadAllAllocations(loadedTasks, dateRange?.startDate, dateRange?.endDate),
        ]);
        void loadOutlookTimelineEvents();
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
    
    await Promise.all(organizationIds.map(async (orgId) => {
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
    }));
    
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

    await Promise.all(organizationIds.map(async (orgId) => {
      try {
        const res = await statusValuesApi.getTaskStatuses(orgId, token!);
        statusMap[orgId] = res.statuses || [];
      } catch (err) {
        console.error(`Failed to load task statuses for org ${orgId}:`, err);
      }
    }));

    setTaskStatusValues(statusMap);
    taskStatusValuesRef.current = statusMap;
  };

  const loadAllProjectsTasks = async (projectsList: Project[]) => {
    const taskResults = await Promise.all(
      projectsList.map(async (project) => {
        try {
          const tasksRes = await tasksApi.getByProject(project.Id, token!);
          return tasksRes.tasks;
        } catch (err) {
          console.error(`Failed to load tasks for project ${project.Id}:`, err);
          return [] as Task[];
        }
      })
    );

    const allTasks = taskResults.flat();
    setTasks(allTasks);
    return allTasks;
  };

  const loadAllAllocations = async (tasksList?: Task[], startDate?: string, endDate?: string) => {
    try {
      const range = startDate && endDate
        ? { startDate, endDate }
        : getVisibleDateRange();
      const query = range
        ? `?startDate=${encodeURIComponent(range.startDate)}&endDate=${encodeURIComponent(range.endDate)}`
        : '';

      const response = await fetch(
        `${getApiUrl()}/api/task-allocations${query}`,
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

      const childAllocationBatches = await Promise.all(
        parentTasks.map(async (parentTask) => {
          const response = await fetch(
            `${getApiUrl()}/api/task-child-allocations/parent/${parentTask.Id}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (!response.ok) return [] as any[];
          const data = await response.json();
          return (data.allocations && data.allocations.length > 0) ? data.allocations : [];
        })
      );

      const allChildAllocs = childAllocationBatches.flat();
      setChildAllocations(allChildAllocs);
    } catch (err) {
      console.error('Failed to load child allocations:', err);
    }
  };

  const loadRecurringAllocations = async (usersList?: User[]) => {
    const planningUsers = usersList ?? (allUsersRef.current.length > 0 ? allUsersRef.current : users);
    if (!token || planningUsers.length === 0) return;
    
    try {
      const visibleDays = getDaysInView();
      if (visibleDays.length === 0) {
        setRecurringAllocations([]);
        return;
      }

      const startDate = getDateKeyFromDate(visibleDays[0]);
      const endDate = getDateKeyFromDate(visibleDays[visibleDays.length - 1]);
      
      const occurrenceBatches = await Promise.all(
        planningUsers.map(async (planningUser) => {
          const response = await fetch(
            `${getApiUrl()}/api/recurring-allocations/occurrences/user/${planningUser.Id}?startDate=${startDate}&endDate=${endDate}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (!response.ok) return [] as any[];
          const data = await response.json();
          return (data.occurrences && data.occurrences.length > 0) ? data.occurrences : [];
        })
      );

      setRecurringAllocations(occurrenceBatches.flat());
    } catch (err) {
      console.error('Failed to load recurring allocations:', err);
    }
  };

  const loadOutlookTimelineEvents = async () => {
    if (!token) {
      setOutlookTimelineEvents([]);
      setIsLoadingOutlookCalendar(false);
      return;
    }

    setIsLoadingOutlookCalendar(true);
    try {
      const visibleDays = getDaysInView();
      if (visibleDays.length === 0) {
        setOutlookTimelineEvents([]);
        return;
      }

      const startDate = getDateKeyFromDate(visibleDays[0]);
      const endDate = getDateKeyFromDate(visibleDays[visibleDays.length - 1]);
      const { events } = await loadOutlookCalendarEvents({ token, startDate, endDate });
      setOutlookTimelineEvents(events);
    } catch (err) {
      console.error('Failed to load Outlook timeline events:', err);
      setOutlookTimelineEvents([]);
    } finally {
      setIsLoadingOutlookCalendar(false);
    }
  };

  const loadPlannerHolidays = async () => {
    if (!token || users.length === 0) {
      setHolidayNamesByUserDate({});
      setDevSupportLabelsByUserDate({});
      return;
    }

    try {
      const days = getDaysInView();
      if (days.length === 0) {
        setHolidayNamesByUserDate({});
        setDevSupportLabelsByUserDate({});
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
        setDevSupportLabelsByUserDate({});
        return;
      }

      const userIds = users.map((u) => u.Id).filter((id): id is number => Number.isInteger(id) && id > 0);
      let approvedVacations: PlannerVacationDay[] = [];
      let approvedOutOfOffice: PlannerOutOfOfficeDay[] = [];
      let devSupportEntries: PlannerDevSupportDay[] = [];
      if (userIds.length > 0) {
        const vacationQuery = new URLSearchParams({
          startDate: startDateKey,
          endDate: endDateKey,
          userIds: userIds.join(','),
        });

        const [vacationResponse, outOfOfficeResponse, devSupportResponse] = await Promise.all([
          fetch(`${getApiUrl()}/api/vacations/calendar?${vacationQuery.toString()}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }),
          fetch(`${getApiUrl()}/api/out-of-office/calendar?${vacationQuery.toString()}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }),
          fetch(`${getApiUrl()}/api/dev-support/calendar?${vacationQuery.toString()}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }),
        ]);

        if (vacationResponse.ok) {
          const vacationData = await vacationResponse.json();
          approvedVacations = (vacationData.entries || []) as PlannerVacationDay[];
        }

        if (outOfOfficeResponse.ok) {
          const outOfOfficeData = await outOfOfficeResponse.json();
          approvedOutOfOffice = (outOfOfficeData.entries || []) as PlannerOutOfOfficeDay[];
        }

        if (devSupportResponse.ok) {
          const devSupportData = await devSupportResponse.json();
          devSupportEntries = (devSupportData.entries || []) as PlannerDevSupportDay[];
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
      const devSupportResult: Record<number, Record<string, string[]>> = {};

      users.forEach((planningUser) => {
        const countryCode = String(planningUser.CountryCode || 'PT').trim().toUpperCase();
        const holidayMapForUser: Record<string, string[]> = {};

        years.forEach((year) => {
          const holidays = byCountryYear.get(`${countryCode}-${year}`) || [];
          const userRegionCode = String(planningUser.RegionCode || '').trim();
          holidays
            .filter((holiday) => {
              if (Number(holiday.IsActive) !== 1) return false;
              // National holidays (no region) are always included
              const hRegion = String(holiday.RegionCode || '').trim();
              if (!hRegion) return true;
              // Regional holidays only match users with the same region
              return userRegionCode !== '' && hRegion === userRegionCode;
            })
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

            const portionPrefix = String(vacation.DayPortion || '').toLowerCase() === 'half'
              ? 'Half-day '
              : '';
            const label = vacation.Notes
              ? `${portionPrefix}Vacation: ${vacation.Notes}`
              : `${portionPrefix}Vacation`;

            if (!holidayMapForUser[dateKey].includes(label)) {
              holidayMapForUser[dateKey].push(label);
            }
          });

        approvedOutOfOffice
          .filter((entry) => Number(entry.UserId) === planningUser.Id)
          .forEach((entry) => {
            const dateKey = normalizeDateKey(entry.OutOfOfficeDate);
            if (dateKey < startDateKey || dateKey > endDateKey) {
              return;
            }
            if (!holidayMapForUser[dateKey]) {
              holidayMapForUser[dateKey] = [];
            }

            const portionPrefix = String(entry.DayPortion || '').toLowerCase() === 'half'
              ? 'Half-day '
              : '';
            const label = entry.Notes
              ? `${portionPrefix}Out Of Office: ${entry.Notes}`
              : `${portionPrefix}Out Of Office`;

            if (!holidayMapForUser[dateKey].includes(label)) {
              holidayMapForUser[dateKey].push(label);
            }
          });

        result[planningUser.Id] = holidayMapForUser;

        const devSupportMapForUser: Record<string, string[]> = {};
        devSupportEntries
          .filter((entry) => Number(entry.UserId) === planningUser.Id)
          .forEach((entry) => {
            const dateKey = normalizeDateKey(entry.DevSupportDate);
            if (dateKey < startDateKey || dateKey > endDateKey) {
              return;
            }
            if (!devSupportMapForUser[dateKey]) {
              devSupportMapForUser[dateKey] = [];
            }

            const label = entry.Notes
              ? `Dev Support: ${entry.Notes}`
              : 'Dev Support';

            if (!devSupportMapForUser[dateKey].includes(label)) {
              devSupportMapForUser[dateKey].push(label);
            }
          });

        devSupportResult[planningUser.Id] = devSupportMapForUser;
      });

      setHolidayNamesByUserDate(result);
      setDevSupportLabelsByUserDate(devSupportResult);
    } catch (err) {
      console.error('Failed to load planner holidays:', err);
      setHolidayNamesByUserDate({});
      setDevSupportLabelsByUserDate({});
    }
  };

  const handleTaskClick = async (task: Task) => {
    const fullTask = tasks.find((entry) => Number(entry.Id) === Number(task.Id)) || task;
    const canPlanTaskAllocations = !!permissions?.canPlanTasks;
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
      if (canPlanTaskAllocations) {
        // Fetch task allocations for planners
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

  const handleTaskUpdate = async (
    task: Task,
    updates: Partial<Task>,
    options?: { syncAllocationHeaderDates?: boolean }
  ) => {
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
        plannedEndDate: updates.PlannedEndDate !== undefined ? updates.PlannedEndDate : task.PlannedEndDate,
        syncAllocationHeaderDates: options?.syncAllocationHeaderDates === true,
      }, token!);
      
      // Reload tasks and allocations used by Gantt rendering
      if (projects.length > 0) {
        const refreshedTasks = await loadAllProjectsTasks(projects);
        await loadAllAllocations(refreshedTasks);
      }
    } catch (err) {
      console.error('Failed to update task:', err);
    }
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

  const getTaskRemainingHours = useCallback(async (task: Task): Promise<number> => {
    const estimatedHours = parseFloat(String(task.EstimatedHours || 0));
    if (estimatedHours <= 0) {
      return 0;
    }

    try {
      const timeEntriesRes = await fetch(
        `${getApiUrl()}/api/time-entries/task/${task.Id}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!timeEntriesRes.ok) {
        return estimatedHours;
      }

      const timeEntriesData = await timeEntriesRes.json();
      const workedHours = Array.isArray(timeEntriesData.entries)
        ? timeEntriesData.entries.reduce((sum: number, entry: any) => sum + parseFloat(String(entry.Hours || 0)), 0)
        : 0;

      return Math.max(0, estimatedHours - workedHours);
    } catch {
      return estimatedHours;
    }
  }, [token]);

  useEffect(() => {
    if (!hoursPerDayModal.show || !hoursPerDayModal.isParentTask || !Array.isArray(hoursPerDayModal.leafTasks)) {
      setLeafTaskRemainingHoursById({});
      return;
    }

    let isCancelled = false;
    const loadRemainingHours = async () => {
      const leafTasks = hoursPerDayModal.leafTasks || [];
      const results = await Promise.all(
        leafTasks.map(async (leafTask) => ({
          taskId: leafTask.Id,
          remainingHours: await getTaskRemainingHours(leafTask),
        }))
      );

      if (isCancelled) {
        return;
      }

      const nextMap: Record<number, number> = {};
      for (const result of results) {
        nextMap[result.taskId] = Number(result.remainingHours.toFixed(2));
      }
      setLeafTaskRemainingHoursById(nextMap);
    };

    loadRemainingHours();

    return () => {
      isCancelled = true;
    };
  }, [hoursPerDayModal.show, hoursPerDayModal.isParentTask, hoursPerDayModal.leafTasks, getTaskRemainingHours]);

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

  const getVisibleDateRange = (paddingDays = 60): { startDate: string; endDate: string } | null => {
    const visibleDays = getDaysInView();
    if (visibleDays.length === 0) return null;
    const rangeStart = new Date(visibleDays[0]);
    rangeStart.setDate(rangeStart.getDate() - paddingDays);
    const rangeEnd = new Date(visibleDays[visibleDays.length - 1]);
    rangeEnd.setDate(rangeEnd.getDate() + paddingDays);
    return {
      startDate: getDateKeyFromDate(rangeStart),
      endDate: getDateKeyFromDate(rangeEnd),
    };
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

  const isTaskAssignedToUser = (task: Task, userId: number): boolean => {
    const normalizedUserId = Number(userId);
    if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) return false;

    if (Number(task.AssignedTo || 0) === normalizedUserId) {
      return true;
    }

    if (Array.isArray(task.Assignees) && task.Assignees.some((assignee) => Number(assignee.UserId) === normalizedUserId)) {
      return true;
    }

    return false;
  };

  const hasAnyTaskAssignee = (task: Task): boolean => {
    if (Number(task.AssignedTo || 0) > 0) return true;
    return Array.isArray(task.Assignees) && task.Assignees.length > 0;
  };

  const isLeafTask = (taskId: number): boolean => {
    return !tasks.some((candidate) => candidate.ParentTaskId === taskId);
  };

  const isClosedUnscheduledWithAnchor = (task: Task): boolean => {
    return Number(task.UnscheduledWork || 0) === 1
      && Number(task.StatusIsClosed || 0) === 1
      && !!task.ClosedAt;
  };

  const isRenderableUnscheduledTask = (task: Task): boolean => {
    if (Number(task.UnscheduledWork || 0) !== 1) return false;
    if (isClosedUnscheduledWithAnchor(task)) return true;
    return !isTaskClosedOrCancelled(task);
  };

  const hasUnscheduledAssignedDescendant = (parentTaskId: number, userId?: number): boolean => {
    const directChildren = tasks.filter((candidate) => candidate.ParentTaskId === parentTaskId);
    if (directChildren.length === 0) return false;

    const stack = [...directChildren];
    while (stack.length > 0) {
      const candidate = stack.pop()!;
      const candidateIsLeaf = isLeafTask(candidate.Id);
      const isUnscheduled = Number(candidate.UnscheduledWork || 0) === 1;
      const matchesAssignee = userId === undefined
        ? hasAnyTaskAssignee(candidate)
        : isTaskAssignedToUser(candidate, userId);

      if (candidateIsLeaf && isUnscheduled && matchesAssignee && isRenderableUnscheduledTask(candidate)) {
        return true;
      }

      const nestedChildren = tasks.filter((nested) => nested.ParentTaskId === candidate.Id);
      if (nestedChildren.length > 0) {
        stack.push(...nestedChildren);
      }
    }

    return false;
  };

  const getTaskClosedAnchorDate = (task: Task): Date | null => {
    const rawDate = Number(task.StatusIsClosed || 0) === 1 ? task.ClosedAt : null;
    if (!rawDate) return null;

    const dateOnly = String(rawDate).split('T')[0];
    const parsedDate = new Date(`${dateOnly}T12:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  };

  const getRelevantUnscheduledTasks = (task: Task, userId?: number): Task[] => {
    const relevantTasks: Task[] = [];
    const stack: Task[] = [task];

    while (stack.length > 0) {
      const candidate = stack.pop()!;
      const candidateIsLeaf = isLeafTask(candidate.Id);
      const isUnscheduled = Number(candidate.UnscheduledWork || 0) === 1;
      const matchesAssignee = userId === undefined
        ? true
        : isTaskAssignedToUser(candidate, userId);

      if (candidateIsLeaf && isUnscheduled && matchesAssignee && isRenderableUnscheduledTask(candidate)) {
        relevantTasks.push(candidate);
      }

      const nestedChildren = tasks.filter((nested) => nested.ParentTaskId === candidate.Id);
      if (nestedChildren.length > 0) {
        stack.push(...nestedChildren);
      }
    }

    return relevantTasks;
  };

  const getUnscheduledAnchorDate = (task: Task, userId?: number): Date => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const relevantTasks = getRelevantUnscheduledTasks(task, userId);
    if (relevantTasks.length === 0) {
      return today;
    }

    if (relevantTasks.some((candidate) => !isTaskClosedOrCancelled(candidate))) {
      return today;
    }

    const closedDates = relevantTasks
      .map((candidate) => getTaskClosedAnchorDate(candidate))
      .filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime());

    return closedDates[0] ? new Date(closedDates[0]) : today;
  };

  const getUnscheduledDoneTransitionDates = (task: Task, userId?: number): string[] => {
    const relevantTasks = getRelevantUnscheduledTasks(task, userId);
    if (relevantTasks.length === 0) {
      return [];
    }

    const uniqueDates = new Set<string>();

    relevantTasks.forEach((candidate) => {
      const transitions = Array.isArray(candidate.DoneTransitionsByDay) ? candidate.DoneTransitionsByDay : [];
      transitions.forEach((transition) => {
        const rawDate = transition?.date;
        if (!rawDate) return;

        const normalizedDate = normalizeDateOnly(String(rawDate));
        if (normalizedDate) {
          uniqueDates.add(normalizedDate);
        }
      });
    });

    return Array.from(uniqueDates).sort((a, b) => a.localeCompare(b));
  };

  const getUnscheduledRenderDates = (task: Task, userId?: number): Array<{ date: string; source: 'done' | 'openToday'; startDate?: string | null }> => {
    const relevantTasks = getRelevantUnscheduledTasks(task, userId);
    if (relevantTasks.length === 0) {
      return [];
    }

    const renderDates = new Map<string, { date: string; source: 'done' | 'openToday'; startDate?: string | null }>();

    // Collect done transitions with their paired start dates
    relevantTasks.forEach((candidate) => {
      const transitions = Array.isArray(candidate.DoneTransitionsByDay) ? candidate.DoneTransitionsByDay : [];
      transitions.forEach((transition) => {
        const rawDate = transition?.date;
        if (!rawDate) return;
        const normalizedDate = normalizeDateOnly(String(rawDate));
        if (normalizedDate && !renderDates.has(`done|${normalizedDate}`)) {
          renderDates.set(`done|${normalizedDate}`, { date: normalizedDate, source: 'done', startDate: transition.startDate ?? null });
        }
      });
    });

    const hasOpenRelevantTask = relevantTasks.some((candidate) => !isTaskClosedOrCancelled(candidate));
    if (hasOpenRelevantTask) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayKey = getDateKeyFromDate(today);
      renderDates.set(`openToday|${todayKey}`, { date: todayKey, source: 'openToday' });
    }

    return Array.from(renderDates.values())
      .sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }
        return a.source === b.source ? 0 : a.source === 'done' ? -1 : 1;
      });
  };

  const getPrioritySortOrder = (task: Task): number | null => {
    const configuredOrder = Number(task.PrioritySortOrder);
    if (Number.isFinite(configuredOrder)) {
      return configuredOrder;
    }

    return null;
  };

  const isTaskUnscheduledForUser = (task: Task, userId?: number | null): boolean => {
    const selfUnscheduled = Number(task.UnscheduledWork || 0) === 1;

    if (userId === null || userId === undefined) {
      return selfUnscheduled || hasUnscheduledAssignedDescendant(task.Id);
    }

    if (selfUnscheduled && isTaskAssignedToUser(task, Number(userId))) {
      return true;
    }

    return hasUnscheduledAssignedDescendant(task.Id, Number(userId));
  };

  const compareTasksForPlanningOrder = (a: Task, b: Task, userId?: number | null): number => {
    const aIsHobby = isTaskHobby(a);
    const bIsHobby = isTaskHobby(b);
    if (aIsHobby !== bIsHobby) {
      return aIsHobby ? 1 : -1;
    }

    const aIsUnscheduled = isTaskUnscheduledForUser(a, userId);
    const bIsUnscheduled = isTaskUnscheduledForUser(b, userId);

    if (aIsUnscheduled && bIsUnscheduled) {
      const aPriorityOrder = getPrioritySortOrder(a);
      const bPriorityOrder = getPrioritySortOrder(b);
      const safePriorityA = aPriorityOrder ?? Number.NEGATIVE_INFINITY;
      const safePriorityB = bPriorityOrder ?? Number.NEGATIVE_INFINITY;
      const priorityDiff = safePriorityB - safePriorityA;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
    }

    const displayOrderDiff = Number(a.DisplayOrder || 0) - Number(b.DisplayOrder || 0);
    if (displayOrderDiff !== 0) {
      return displayOrderDiff;
    }

    return Number(a.Id || 0) - Number(b.Id || 0);
  };

  const getTaskPosition = (
    task: Task,
    columns: TimelineColumn[],
    options?: {
      minVisibleDuration?: number;
      preferRangeStartForUnplanned?: boolean;
      useFixedPixelColumns?: boolean;
      columnWidthPx?: number;
      unscheduledUserId?: number;
      forcePlannedDates?: boolean;
    }
  ) => {
    if (columns.length === 0) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const visibleRangeStart = new Date(columns[0].start);
    visibleRangeStart.setHours(0, 0, 0, 0);
    const visibleRangeEnd = new Date(columns[columns.length - 1].end);
    visibleRangeEnd.setHours(0, 0, 0, 0);

    let startDate: Date;
    let endDate: Date;
    const isAssignedUnscheduled = isLeafTask(task.Id)
      && Number(task.UnscheduledWork || 0) === 1
      && hasAnyTaskAssignee(task)
      && isRenderableUnscheduledTask(task);
    const hasUnscheduledDescendant = !task.ParentTaskId && hasUnscheduledAssignedDescendant(task.Id);
    const shouldForcePlannedDates = !!options?.forcePlannedDates;
    // Whether the task itself is unscheduled (vs. just having unscheduled children)
    const selfIsUnscheduled = Number(task.UnscheduledWork || 0) === 1;

    const parsePlannedDate = (dateStr: string) => {
      const dateOnly = String(dateStr).split('T')[0];
      return new Date(dateOnly + 'T12:00:00');
    };

    if (shouldForcePlannedDates && task.PlannedStartDate && task.PlannedEndDate) {
      startDate = parsePlannedDate(task.PlannedStartDate);
      endDate = parsePlannedDate(task.PlannedEndDate);
    } else if (!selfIsUnscheduled && task.PlannedStartDate && task.PlannedEndDate) {
      // Non-unscheduled task with concrete planned dates (e.g. set from allocation dates):
      // always use those dates directly, even if it has unscheduled children.
      // Without this check a parent with unscheduled children would enter the unscheduled
      // anchor path and disappear from the Gantt whenever today is outside the view window.
      startDate = parsePlannedDate(task.PlannedStartDate);
      endDate = parsePlannedDate(task.PlannedEndDate);
    } else if (isAssignedUnscheduled || hasUnscheduledDescendant) {
      const unscheduledRenderDates = getUnscheduledRenderDates(task, options?.unscheduledUserId);
      const visibleRenderDate = unscheduledRenderDates.find((entry) => {
        const parsed = new Date(`${entry.date}T12:00:00`);
        if (Number.isNaN(parsed.getTime())) return false;
        parsed.setHours(0, 0, 0, 0);
        return parsed >= visibleRangeStart && parsed <= visibleRangeEnd;
      });

      if (visibleRenderDate) {
        const visibleDate = new Date(`${visibleRenderDate.date}T12:00:00`);
        startDate = new Date(visibleDate);
        endDate = new Date(visibleDate);
        // For 'done' bars: stretch back to when this cycle started (in-progress date)
        if (visibleRenderDate.source === 'done' && visibleRenderDate.startDate) {
          const ipDate = new Date(`${String(visibleRenderDate.startDate).split('T')[0]}T12:00:00`);
          if (!Number.isNaN(ipDate.getTime()) && ipDate < visibleDate) {
            startDate = ipDate;
          }
        }
        // Open tasks (tracking today) should still span 3 days for readability
        if (visibleRenderDate.source === 'openToday') {
          endDate.setDate(endDate.getDate() + 2);
        }
      } else {
        const unscheduledAnchorDate = getUnscheduledAnchorDate(task, options?.unscheduledUserId);
        startDate = new Date(unscheduledAnchorDate);
        endDate = new Date(unscheduledAnchorDate);
        const unscheduledVisualDays = isClosedUnscheduledWithAnchor(task) ? 1 : 3;
        // For closed tasks: if we know when it went in-progress, stretch bar back to that date
        if (isClosedUnscheduledWithAnchor(task) && task.InProgressAt) {
          const ipDate = new Date(`${String(task.InProgressAt).split('T')[0]}T12:00:00`);
          if (!Number.isNaN(ipDate.getTime()) && ipDate < endDate) {
            startDate = ipDate;
          }
        } else {
          endDate.setDate(endDate.getDate() + (unscheduledVisualDays - 1));
        }
      }
    } else if (task.PlannedStartDate && task.PlannedEndDate) {
      startDate = parsePlannedDate(task.PlannedStartDate);
      endDate = parsePlannedDate(task.PlannedEndDate);
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

    const taskStatusId = Number(task.Status);
    if (!Number.isFinite(taskStatusId)) return undefined;

    return statuses.find((status) => Number(status.Id) === taskStatusId);
  };

  // Helper to check if a task should be excluded from planning (closed, cancelled, or hidden-by-status)
  const isTaskClosedOrCancelled = (task: Task): boolean => {
    const statusValue = getTaskStatusValue(task);
    const hiddenFromPlanning = Number(task.StatusHideFromPlanningAndStatistics || 0) === 1
      || (statusValue && Number(statusValue.HideFromPlanningAndStatistics || 0) === 1);

    return !!(
      task.StatusIsClosed ||
      task.StatusIsCancelled ||
      hiddenFromPlanning
    );
  };

  // Helper to get the status color for a task (bar fill color)
  const getTaskStatusColor = (task: Task): string | undefined => {
    if (!task.StatusColor) return undefined;
    return mapColor(task.StatusColor);
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

  const getTaskUserAllocationDates = (taskId: number, userId: number) => {
    const taskAllocs = allAllocations
      .filter((allocation) => allocation.TaskId === taskId && allocation.UserId === userId)
      .map((allocation) => normalizeDateKey(allocation.AllocationDate))
      .sort();

    if (taskAllocs.length === 0) {
      return null;
    }

    return {
      startDate: taskAllocs[0],
      endDate: taskAllocs[taskAllocs.length - 1],
    };
  };

  const getAllDescendantsRecursive = (parentId: number): Task[] => {
    const directChildren = tasks.filter((candidate) => candidate.ParentTaskId === parentId);
    let descendants: Task[] = [];

    for (const child of directChildren) {
      descendants.push(child);
      descendants = descendants.concat(getAllDescendantsRecursive(child.Id));
    }

    return descendants;
  };

  const getParentUserDescendantAllocationDates = (parentTaskId: number, userId: number) => {
    const descendants = getAllDescendantsRecursive(parentTaskId)
      .filter((descendant) => allAllocations.some((allocation) => allocation.UserId === userId && allocation.TaskId === descendant.Id) || !isTaskClosedOrCancelled(descendant));
    if (descendants.length === 0) {
      return null;
    }

    const descendantIds = new Set(descendants.map((descendant) => descendant.Id));
    const descendantAllocDates = allAllocations
      .filter((allocation) => allocation.UserId === userId && descendantIds.has(allocation.TaskId))
      .map((allocation) => normalizeDateKey(allocation.AllocationDate))
      .sort();

    if (descendantAllocDates.length === 0) {
      return null;
    }

    return {
      startDate: descendantAllocDates[0],
      endDate: descendantAllocDates[descendantAllocDates.length - 1],
    };
  };

  const getTaskUserAllocationSegments = (taskId: number, userId: number) => {
    const taskUserAllocations = allAllocations
      .filter((allocation) => allocation.TaskId === taskId && allocation.UserId === userId)
      .map((allocation) => ({
        headerId: allocation.TaskAllocationHeaderId ? Number(allocation.TaskAllocationHeaderId) : null,
        dateKey: normalizeDateKey(allocation.AllocationDate),
        plannedStartDate: allocation.PlannedStartDate ? normalizeDateKey(allocation.PlannedStartDate) : null,
        plannedEndDate: allocation.PlannedEndDate ? normalizeDateKey(allocation.PlannedEndDate) : null,
      }))
      .filter((entry) => !!entry.dateKey);

    if (taskUserAllocations.length === 0) {
      return [] as Array<{ headerId: number | null; startDate: string; endDate: string }>;
    }

    const groupedByHeader = new Map<string, { 
      headerId: number | null; 
      dates: string[];
      plannedStartDate: string | null;
      plannedEndDate: string | null;
    }>();

    for (const entry of taskUserAllocations) {
      const groupKey = entry.headerId !== null
        ? `header-${entry.headerId}`
        : `legacy-${taskId}-${userId}`;
      const existing = groupedByHeader.get(groupKey);
      if (existing) {
        existing.dates.push(entry.dateKey);
      } else {
        groupedByHeader.set(groupKey, { 
          headerId: entry.headerId, 
          dates: [entry.dateKey],
          plannedStartDate: entry.plannedStartDate,
          plannedEndDate: entry.plannedEndDate,
        });
      }
    }

    return Array.from(groupedByHeader.values())
      .map((group) => {
        const sortedDates = Array.from(new Set(group.dates)).sort();
        // Prefer header's PlannedStartDate/EndDate if available, else calculate from dates
        return {
          headerId: group.headerId,
          startDate: group.plannedStartDate || sortedDates[0],
          endDate: group.plannedEndDate || sortedDates[sortedDates.length - 1],
        };
      })
      .sort((a, b) => {
        if (a.startDate !== b.startDate) {
          return a.startDate.localeCompare(b.startDate);
        }
        const headerA = a.headerId === null ? Number.MAX_SAFE_INTEGER : a.headerId;
        const headerB = b.headerId === null ? Number.MAX_SAFE_INTEGER : b.headerId;
        return headerA - headerB;
      });
  };

  // Build bar segments from the currently selected snapshot overlay data (same grouping logic as getTaskUserAllocationSegments)
  const getSnapshotBarSegments = (taskId: number, userId: number): Array<{ headerId: number | null; startDate: string; endDate: string }> => {
    if (!snapshotOverlayData) return [];

    const headerMap = new Map<number, { plannedStartDate: string | null; plannedEndDate: string | null }>();
    for (const h of snapshotOverlayData.headers) {
      headerMap.set(Number(h.OriginalHeaderId), {
        plannedStartDate: h.PlannedStartDate ? normalizeDateKey(h.PlannedStartDate) : null,
        plannedEndDate: h.PlannedEndDate ? normalizeDateKey(h.PlannedEndDate) : null,
      });
    }

    const taskUserAllocations = snapshotOverlayData.allocations
      .filter((a) => a.TaskId === taskId && a.UserId === userId)
      .map((a) => ({
        headerId: a.OriginalHeaderId ? Number(a.OriginalHeaderId) : null,
        dateKey: normalizeDateKey(a.AllocationDate),
      }))
      .filter((entry) => !!entry.dateKey);

    if (taskUserAllocations.length === 0) return [];

    const groupedByHeader = new Map<string, { headerId: number | null; dates: string[] }>();
    for (const entry of taskUserAllocations) {
      const groupKey = entry.headerId !== null ? `header-${entry.headerId}` : `legacy-${taskId}-${userId}`;
      const existing = groupedByHeader.get(groupKey);
      if (existing) {
        existing.dates.push(entry.dateKey);
      } else {
        groupedByHeader.set(groupKey, { headerId: entry.headerId, dates: [entry.dateKey] });
      }
    }

    return Array.from(groupedByHeader.values())
      .map((group) => {
        const sortedDates = Array.from(new Set(group.dates)).sort();
        const headerInfo = group.headerId !== null ? headerMap.get(group.headerId) : null;
        return {
          headerId: group.headerId,
          startDate: headerInfo?.plannedStartDate || sortedDates[0],
          endDate: headerInfo?.plannedEndDate || sortedDates[sortedDates.length - 1],
        };
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  };

  // Calculate dependency lines for SVG overlay
  const getDependencyLines = useCallback(() => {
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

  // Update dependency lines when tasks/view/layout changes
  useEffect(() => {
    if (!showDependencyLines) {
      setDependencyLines([]);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let rafA = 0;
    let rafB = 0;

    const updateLines = () => {
      setDependencyLines(getDependencyLines());
    };

    const scheduleUpdate = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        rafA = requestAnimationFrame(() => {
          rafB = requestAnimationFrame(updateLines);
        });
      }, 0);
    };

    scheduleUpdate();

    const container = ganttContainerRef.current;
    let resizeObserver: ResizeObserver | null = null;

    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleUpdate();
      });
      resizeObserver.observe(container);
    }

    const handleWindowResize = () => scheduleUpdate();
    window.addEventListener('resize', handleWindowResize);
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (rafA) {
        cancelAnimationFrame(rafA);
      }
      if (rafB) {
        cancelAnimationFrame(rafB);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [
    showDependencyLines,
    getDependencyLines,
    tasks,
    allAllocations,
    childAllocations,
    recurringAllocations,
    outlookTimelineEvents,
    users,
    ganttGroupBy,
    selectedGanttUserIds,
    viewStartDate,
    viewMode,
    customStartDate,
    customEndDate,
  ]);

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
    if (token) {
      loadOutlookTimelineEvents();
    } else {
      setOutlookTimelineEvents([]);
    }
  }, [viewStartDate, viewMode, customStartDate, customEndDate, token]);

  useEffect(() => {
    if (users.length > 0 && token) {
      loadPlannerHolidays();
    } else {
      setHolidayNamesByUserDate({});
    }
  }, [viewStartDate, viewMode, customStartDate, customEndDate, users, token]);

  const loadPlannerTimeEntries = async () => {
    if (!token) { setPlannerTimeEntries([]); return; }
    const days = getDaysInView();
    if (days.length === 0) { setPlannerTimeEntries([]); return; }
    const startDateKey = getDateKeyFromDate(days[0]);
    const endDateKey = getDateKeyFromDate(days[days.length - 1]);
    setIsLoadingPlannerTimeEntries(true);
    try {
      const res = await fetch(
        `${getApiUrl()}/api/time-entries/planning-view?startDate=${startDateKey}&endDate=${endDateKey}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setPlannerTimeEntries(data.entries || []);
      }
    } catch {
      // silently ignore
    } finally {
      setIsLoadingPlannerTimeEntries(false);
    }
  };

  useEffect(() => {
    if ((ganttGroupBy === 'time-entries' || showTimeEntriesOverlay) && token) {
      loadPlannerTimeEntries();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ganttGroupBy, showTimeEntriesOverlay, viewStartDate, viewMode, customStartDate, customEndDate, token]);

  const getTasksForUser = (userId: number | null) => {
    let result: Task[];
    
    if (userId === null) {
      // Not planned - show only parent tasks without allocations, excluding closed/cancelled
      result = tasks.filter(t => {
        const descendantTasks = getAllDescendantsRecursive(t.Id);
        const descendantTaskIds = new Set(descendantTasks.map((descendant) => descendant.Id));
        const hasOwnAllocations = allAllocations.some((allocation) => allocation.TaskId === t.Id);
        const hasDescendantAllocations = allAllocations.some((allocation) => descendantTaskIds.has(allocation.TaskId));
        const hasAllocations = hasOwnAllocations || hasDescendantAllocations;
        const isAssignedUnscheduled = Number(t.UnscheduledWork || 0) === 1 && hasAnyTaskAssignee(t);
        const hasUnscheduledDescendants = hasUnscheduledAssignedDescendant(t.Id);
        const isParent = !t.ParentTaskId;
        // Also check if ALL children are closed/cancelled (for parent tasks with children)
        const children = tasks.filter(c => c.ParentTaskId === t.Id);
        const hasChildren = children.length > 0;
        const allChildrenClosed = hasChildren && children.every(c => isTaskClosedOrCancelled(c));
        return !hasAllocations && !isAssignedUnscheduled && !hasUnscheduledDescendants && isParent && !isTaskClosedOrCancelled(t) && !allChildrenClosed;
      });
    } else {
      // Planned for this user through allocations (source of truth), plus unscheduled assigned parents
      const parentTaskIdsFromAllocations = new Set<number>();
      const tasksById = new Map(tasks.map((task) => [task.Id, task]));

      allAllocations
        .filter((allocation) => allocation.UserId === userId)
        .forEach((allocation) => {
          const allocationTask = tasksById.get(allocation.TaskId);
          if (!allocationTask) {
            return;
          }

          let currentTask: Task | undefined = allocationTask;
          while (currentTask?.ParentTaskId) {
            currentTask = tasksById.get(currentTask.ParentTaskId);
          }
          if (currentTask && !currentTask.ParentTaskId) {
            parentTaskIdsFromAllocations.add(currentTask.Id);
          }
        });

      result = tasks.filter((task) => {
        if (task.ParentTaskId) return false;

        const plannedForUserByAllocations = parentTaskIdsFromAllocations.has(task.Id);
        const isRenderableClosedUnscheduled = isClosedUnscheduledWithAnchor(task);
        if (isTaskClosedOrCancelled(task) && !isRenderableClosedUnscheduled && !plannedForUserByAllocations) return false;

        const isUnscheduledAssigned = isRenderableUnscheduledTask(task)
          && hasAnyTaskAssignee(task)
          ;
        if (isUnscheduledAssigned) {
          return isTaskAssignedToUser(task, Number(userId));
        }
        if (hasUnscheduledAssignedDescendant(task.Id, Number(userId))) {
          return true;
        }
        if (plannedForUserByAllocations) return true;
        return false;
      });
    }
    
    return result.sort((a, b) => compareTasksForPlanningOrder(a, b, userId));
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
    draggedTaskRef.current = subtask;
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

  const handleTaskContextMenu = (e: React.MouseEvent, task: Task, userId?: number | null, headerId?: number | null) => {
    if (!canUseGanttPlanningActions()) return;
    e.preventDefault();
    e.stopPropagation();

    const viewportHalf = window.innerHeight / 2;
    const openUpward = e.clientY > viewportHalf;
    const menuWidth = 240;
    const viewportPadding = 12;
    const clampedX = Math.min(
      Math.max(e.clientX, viewportPadding),
      Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
    );
    const clampedY = Math.min(
      Math.max(e.clientY, viewportPadding),
      Math.max(viewportPadding, window.innerHeight - viewportPadding),
    );

    setTaskContextMenu({
      show: true,
      x: clampedX,
      y: clampedY,
      openUpward,
      task,
      userId: userId ?? null,
      headerId: headerId ?? null,
    });
  };

  const handleRecalculateTaskDatesFromAllocations = async (task: Task) => {
    if (!token || !canUseGanttPlanningActions()) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/task-allocations/task/${task.Id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load task allocations');
      }

      const data = await response.json();
      const allocations = Array.isArray(data.allocations) ? data.allocations : [];
      const allocationDates = allocations
        .map((allocation: any) => normalizeDateKey(allocation.AllocationDate))
        .filter(Boolean)
        .sort();

      let plannedStartDate = allocationDates[0] || null;
      let plannedEndDate = allocationDates.length > 0 ? allocationDates[allocationDates.length - 1] : null;

      if (!plannedStartDate || !plannedEndDate) {
        const childDates = getChildTaskDates(task.Id);
        if (childDates) {
          plannedStartDate = childDates.startDate;
          plannedEndDate = childDates.endDate;
        }
      }

      if (!plannedStartDate || !plannedEndDate) {
        showAlert('No Allocations', 'This task has no allocations to calculate dates from.');
        return;
      }

      if (!validateMandatoryDueDateForPlan(task, plannedEndDate)) {
        return;
      }

      await handleTaskUpdate(task, {
        PlannedStartDate: plannedStartDate,
        PlannedEndDate: plannedEndDate,
      });
      await loadAllAllocations();
      showAlert('Success', 'Task dates recalculated from allocations successfully.');
    } catch (error: any) {
      console.error('Failed to recalculate task dates:', error);
      showAlert('Error', error.message || 'Failed to recalculate task dates.');
    }
  };

  const handleSetTaskBaseline = async (task: Task) => {
    if (!token || !canUseGanttPlanningActions()) return;

    if (!task.PlannedStartDate || !task.PlannedEndDate) {
      showAlert('Cannot Set Baseline', 'This task must have planned start and end dates before setting a baseline.');
      return;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/tasks/${task.Id}/baseline`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to set task baseline');
      }

      if (projects.length > 0) {
        await loadAllProjectsTasks(projects);
      }
      setShowBaseline(true);
      showAlert('Baseline Set', `Baseline snapshot saved for task "${task.TaskName}".`);
    } catch (error: any) {
      console.error('Set task baseline error:', error);
      showAlert('Error', error?.message || 'Failed to set task baseline.');
    }
  };

  const loadSnapshots = async () => {
    if (!token) return;
    setSnapshotModal(prev => ({ ...prev, isLoading: true, error: '' }));
    try {
      const response = await fetch(`${getApiUrl()}/api/allocation-snapshots`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to load snapshots');
      setSnapshotModal(prev => ({ ...prev, snapshots: data.snapshots || [], isLoading: false }));
    } catch (err: any) {
      setSnapshotModal(prev => ({ ...prev, isLoading: false, error: err.message || 'Failed to load snapshots' }));
    }
  };

  const openSnapshotModal = async () => {
    setSnapshotModal(prev => ({ ...prev, show: true, newName: '', newDescription: '', error: '' }));
    await loadSnapshots();
  };

  const handleCreateSnapshot = async () => {
    if (!token) return;
    const name = snapshotModal.newName.trim();
    if (!name) {
      setSnapshotModal(prev => ({ ...prev, error: 'Snapshot name is required' }));
      return;
    }
    setSnapshotModal(prev => ({ ...prev, isSaving: true, error: '' }));
    try {
      const response = await fetch(`${getApiUrl()}/api/allocation-snapshots`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: snapshotModal.newDescription.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Failed to create snapshot');
      showToast({ type: 'success', message: `Snapshot "${name}" created successfully` });
      setSnapshotModal(prev => ({ ...prev, isSaving: false, newName: '', newDescription: '' }));
      await loadSnapshots();
      await loadToolbarSnapshots();
    } catch (err: any) {
      setSnapshotModal(prev => ({ ...prev, isSaving: false, error: err.message || 'Failed to create snapshot' }));
    }
  };

  const handleRestoreSnapshot = (snapshot: any) => {
    showConfirm(
      'Restore Snapshot',
      `Restore snapshot "${snapshot.Name}"?\n\nThis will REPLACE all current allocations with the data from this snapshot. This action cannot be undone.`,
      async () => {
        if (!token) return;
        try {
          const response = await fetch(`${getApiUrl()}/api/allocation-snapshots/${snapshot.Id}/restore`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.message || 'Failed to restore snapshot');
          setSnapshotModal(prev => ({ ...prev, show: false }));
          showToast({ type: 'success', message: data.message || 'Snapshot restored successfully' });
          await loadAllAllocations();
          if (projects.length > 0) await loadAllProjectsTasks(projects);
        } catch (err: any) {
          setSnapshotModal(prev => ({ ...prev, error: err.message || 'Failed to restore snapshot' }));
        }
      }
    );
  };

  const handleDeleteSnapshot = (snapshot: any) => {
    showConfirm(
      'Delete Snapshot',
      `Delete snapshot "${snapshot.Name}"? This action cannot be undone.`,
      async () => {
        if (!token) return;
        try {
          const response = await fetch(`${getApiUrl()}/api/allocation-snapshots/${snapshot.Id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.message || 'Failed to delete snapshot');
          showToast({ type: 'success', message: 'Snapshot deleted successfully' });
          if (selectedSnapshotId === Number(snapshot.Id)) handleClearSnapshotOverlay();
          await loadSnapshots();
          await loadToolbarSnapshots();
        } catch (err: any) {
          setSnapshotModal(prev => ({ ...prev, error: err.message || 'Failed to delete snapshot' }));
        }
      }
    );
  };

  const loadToolbarSnapshots = async () => {
    if (!token) return;
    setIsLoadingToolbarSnapshots(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/allocation-snapshots`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) setToolbarSnapshots(data.snapshots || []);
    } catch {}
    setIsLoadingToolbarSnapshots(false);
  };

  const loadSnapshotOverlay = async (snapshotId: number) => {
    if (!token) return;
    setIsLoadingSnapshotOverlay(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/allocation-snapshots/${snapshotId}/data`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setSnapshotOverlayData({ headers: data.headers || [], allocations: data.allocations || [] });
      }
    } catch {}
    setIsLoadingSnapshotOverlay(false);
  };

  const handleSelectSnapshot = async (snapshotId: number | null) => {
    setSelectedSnapshotId(snapshotId);
    setSnapshotOverlayData(null);
    if (snapshotId !== null) await loadSnapshotOverlay(snapshotId);
  };

  const handleClearSnapshotOverlay = () => {
    setSelectedSnapshotId(null);
    setSnapshotOverlayData(null);
  };

  const handleRestoreSelectedSnapshot = () => {
    const snapshot = toolbarSnapshots.find(s => Number(s.Id) === selectedSnapshotId);
    if (!snapshot) return;
    showConfirm(
      'Restore Snapshot',
      `Restore snapshot "${snapshot.Name}"?\n\nThis will REPLACE all current allocations with the data from this snapshot. This action cannot be undone.`,
      async () => {
        if (!token) return;
        try {
          const response = await fetch(`${getApiUrl()}/api/allocation-snapshots/${snapshot.Id}/restore`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.message || 'Failed to restore snapshot');
          handleClearSnapshotOverlay();
          showToast({ type: 'success', message: data.message || 'Snapshot restored successfully' });
          await loadAllAllocations();
          if (projects.length > 0) await loadAllProjectsTasks(projects);
        } catch (err: any) {
          showAlert('Error', err.message || 'Failed to restore snapshot');
        }
      }
    );
  };

  const togglePlanningTools = () => {
    if (!showPlanningTools) loadToolbarSnapshots();
    setShowPlanningTools(prev => !prev);
  };

  const closeExtraTimeModal = () => {
    setExtraTimeModal({ show: false, task: null, userId: null, extraHours: '', hoursPerDay: '8', isProcessing: false, error: '', leafTasks: [], selectedSubtaskIds: [] });
  };

  const openExtraTimeModal = (task: Task, userId: number | null, headerId?: number | null) => {
    if (!canUseGanttPlanningActions()) return;

    // Default hoursPerDay from user config
    const targetUser = userId ? users.find(u => u.Id === userId) : null;
    const project = projects.find(p => p.Id === task.ProjectId);
    const isHobby = project?.IsHobby || false;
    let defaultHpd = 8;
    if (targetUser) {
      const maxHpd = Math.max(...WEEK_DAYS.map(d => {
        const k = isHobby ? `HobbyHours${d}` as keyof User : `WorkHours${d}` as keyof User;
        return parseFloat((targetUser as any)[k]) || 0;
      }));
      if (maxHpd > 0) defaultHpd = maxHpd;
    }

    // Detect parent task and collect only the leaf tasks that belong to this specific allocation header
    const isParent = tasks.some(t => t.ParentTaskId === task.Id);
    let leafTasks: Task[] = [];
    if (isParent) {
      if (headerId) {
        // Dates that belong to this specific allocation header
        const headerDates = new Set(
          allAllocations
            .filter(a => a.TaskAllocationHeaderId === headerId)
            .map(a => normalizeDateKey(a.AllocationDate))
            .filter(Boolean)
        );
        // Child tasks that appear on those dates in TaskChildAllocations
        const childIdsInSlice = new Set(
          childAllocations
            .filter(ca => ca.ParentTaskId === task.Id)
            .filter(ca => Number(ca.TaskAllocationHeaderId || 0) === Number(headerId))
            .filter(ca => headerDates.has(normalizeDateKey(ca.AllocationDate)))
            .map(ca => ca.ChildTaskId)
        );
        if (childIdsInSlice.size > 0) {
          // Only show the leaf tasks that are part of this allocation header
          leafTasks = getAllLeafTasks(task.Id).filter(t => childIdsInSlice.has(t.Id));
        } else {
          // Fallback: no child allocation data yet for this header — show all leaf tasks
          leafTasks = getAllLeafTasks(task.Id);
        }
      } else {
        leafTasks = getAllLeafTasks(task.Id);
      }
    }
    const selectedSubtaskIds = leafTasks.map(t => t.Id);

    setExtraTimeModal({
      show: true,
      task,
      userId,
      extraHours: '',
      hoursPerDay: String(defaultHpd),
      isProcessing: false,
      error: '',
      leafTasks,
      selectedSubtaskIds,
    });
  };

  const handleExecuteAddExtraTime = async () => {
    const { task, userId, extraHours, hoursPerDay, leafTasks, selectedSubtaskIds } = extraTimeModal;
    if (!task || !token) return;

    const parsedExtra = roundToPlanningStep(parseFloat(extraHours));
    const parsedHpd = roundToPlanningStep(parseFloat(hoursPerDay));

    if (!parsedExtra || parsedExtra <= 0) {
      setExtraTimeModal(prev => ({ ...prev, error: 'Enter a valid number of extra hours (> 0).' }));
      return;
    }
    if (!parsedHpd || parsedHpd <= 0) {
      setExtraTimeModal(prev => ({ ...prev, error: 'Enter a valid max hours per day (> 0).' }));
      return;
    }
    if (!isPlanningStepValue(parsedExtra) || !isPlanningStepValue(parsedHpd)) {
      setExtraTimeModal(prev => ({ ...prev, error: 'Planning supports 30-minute steps only (0.5h).' }));
      return;
    }

    const isParentTask = leafTasks.length > 0;

    if (isParentTask && selectedSubtaskIds.length === 0) {
      setExtraTimeModal(prev => ({ ...prev, error: 'Select at least one subtask to distribute the extra time to.' }));
      return;
    }

    // Resolve userId
    const resolvedUserId = userId ?? (task.AssignedTo ? Number(task.AssignedTo) : null);
    if (!resolvedUserId) {
      setExtraTimeModal(prev => ({ ...prev, error: 'No user associated with this task allocation.' }));
      return;
    }

    const targetUser = users.find(u => u.Id === resolvedUserId);
    if (!targetUser) {
      setExtraTimeModal(prev => ({ ...prev, error: 'User not found.' }));
      return;
    }

    setExtraTimeModal(prev => ({ ...prev, isProcessing: true, error: '' }));

    // Helpers for time math (used in parent path)
    const parseTimeToMinutes = (time: string): number => {
      const [h, m] = String(time || '09:00').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const formatMinutesToTime = (minutes: number): string => {
      const safe = Math.max(0, Math.round(minutes));
      return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
    };

    try {
      // Find start date: day after last alloc for this task+user (or today)
      const taskUserAllocs = allAllocations
        .filter(a => a.TaskId === task.Id && a.UserId === resolvedUserId)
        .map(a => normalizeDateKey(a.AllocationDate))
        .filter(Boolean)
        .sort();
      let startDate: Date;
      if (taskUserAllocs.length > 0) {
        const lastDate = new Date(taskUserAllocs[taskUserAllocs.length - 1] + 'T12:00:00');
        lastDate.setDate(lastDate.getDate() + 1);
        startDate = lastDate;
      } else {
        const today = new Date();
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
      }

      // ── PARENT TASK PATH ────────────────────────────────────────────────────
      if (isParentTask) {
        const selectedLeafTasks = leafTasks
          .filter(t => selectedSubtaskIds.includes(t.Id))
          .sort((a, b) => {
            const oa = Number.isFinite(Number(a.DisplayOrder)) ? Number(a.DisplayOrder) : 0;
            const ob = Number.isFinite(Number(b.DisplayOrder)) ? Number(b.DisplayOrder) : 0;
            return oa !== ob ? oa - ob : a.Id - b.Id;
          });

        const parentSliceResult = await executeTaskAllocation(
          task,
          resolvedUserId,
          startDate,
          parsedExtra,
          targetUser,
          parsedHpd,
          { silent: true, skipReload: true, appendToExistingUserSlice: true }
        );

        if (!parentSliceResult || !Array.isArray(parentSliceResult.allocations) || parentSliceResult.allocations.length === 0) {
          setExtraTimeModal(prev => ({ ...prev, isProcessing: false, error: 'Failed to allocate parent extra time. Check user availability.' }));
          return;
        }

        // Distribute to selected leaf tasks proportionally by remaining hours
        const leafWithRemaining = await Promise.all(
          selectedLeafTasks.map(async lt => ({
            leafTask: lt,
            remainingHours: await getTaskRemainingHours(lt),
          }))
        );
        const positiveLeafs = leafWithRemaining.filter(lwr => lwr.remainingHours > 0);

  let leafQuotas: { leafTask: Task; quotaHours: number }[] = [];

        if (positiveLeafs.length > 0) {
          const totalLeafRemaining = positiveLeafs.reduce((s, lwr) => s + lwr.remainingHours, 0);
          const totalParentHours = parentSliceResult.allocations.reduce((s, a) => s + Number(a.hours || 0), 0);
          const toDistribute = Math.min(parsedExtra, totalParentHours);

          const quotas = positiveLeafs.map((lwr, idx) => {
            if (idx === positiveLeafs.length - 1) return { leafTask: lwr.leafTask, quotaHours: 0 };
            const proportional = totalLeafRemaining > 0 ? (toDistribute * lwr.remainingHours) / totalLeafRemaining : 0;
            return { leafTask: lwr.leafTask, quotaHours: Number(proportional.toFixed(2)) };
          });
          const allocatedBeforeLast = quotas.reduce((s, q) => s + q.quotaHours, 0);
          if (quotas.length > 0) {
            quotas[quotas.length - 1].quotaHours = Number(Math.max(0, toDistribute - allocatedBeforeLast).toFixed(2));
          }
          leafQuotas = quotas;

          const allocationSlots = parentSliceResult.allocations
            .map(a => ({
              date: a.date,
              remainingHours: Number(a.hours || 0),
              cursorMinutes: parseTimeToMinutes(a.startTime || '09:00'),
            }))
            .filter(s => s.remainingHours > 0.0001);

          let slotIndex = 0;
          const childPayload: Array<{
            ParentTaskId: number; ChildTaskId: number; AllocationDate: string;
            AllocatedHours: number; Level: number; StartTime: string; EndTime: string;
            TaskAllocationHeaderId?: number | null;
          }> = [];

          for (const quota of quotas) {
            let remaining = quota.quotaHours;
            while (remaining > 0.0001 && slotIndex < allocationSlots.length) {
              const slot = allocationSlots[slotIndex];
              const hrs = Math.min(remaining, slot.remainingHours);
              if (hrs <= 0.0001) { slotIndex++; continue; }
              const mins = Math.max(1, Math.round(hrs * 60));
              const allocated = Number((mins / 60).toFixed(2));
              const startMin = slot.cursorMinutes;
              const endMin = startMin + mins;
              childPayload.push({
                ParentTaskId: task.Id,
                ChildTaskId: quota.leafTask.Id,
                TaskAllocationHeaderId: parentSliceResult.headerId ?? null,
                AllocationDate: slot.date,
                AllocatedHours: allocated,
                Level: Math.max(1, getTaskDepthLevel(quota.leafTask, task.Id) + 1),
                StartTime: formatMinutesToTime(startMin),
                EndTime: formatMinutesToTime(endMin),
              });
              remaining = Math.max(0, remaining - allocated);
              slot.remainingHours = Math.max(0, slot.remainingHours - allocated);
              slot.cursorMinutes = endMin;
              if (slot.remainingHours <= 0.0001) slotIndex++;
            }
          }

          if (childPayload.length > 0) {
            const childSaveRes = await fetch(`${getApiUrl()}/api/task-child-allocations/batch`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ allocations: childPayload, replaceParent: false }),
            });
            if (!childSaveRes.ok) {
              setExtraTimeModal(prev => ({ ...prev, isProcessing: false, error: 'Extra time allocated to parent but failed to distribute to subtasks.' }));
              return;
            }
          }
        }

        if (projects.length > 0) { await loadAllProjectsTasks(projects); await loadAllAllocations(); }
        closeExtraTimeModal();

        const leafUpdates = leafQuotas.filter(q => q.quotaHours > 0);
        if (leafUpdates.length > 0) {
          let confirmMsg: string;
          if (leafUpdates.length === 1) {
            const lt = leafUpdates[0];
            const curEst = parseFloat(String(lt.leafTask.EstimatedHours || 0));
            const newEst = Number((curEst + lt.quotaHours).toFixed(2));
            confirmMsg = `Extra ${parsedExtra}h allocated and distributed to "${lt.leafTask.TaskName}".\n\nUpdate estimated hours from ${curEst}h to ${newEst}h?`;
          } else {
            const lines = leafUpdates.map(q => {
              const curEst = parseFloat(String(q.leafTask.EstimatedHours || 0));
              const newEst = Number((curEst + q.quotaHours).toFixed(2));
              return `\u2022 ${q.leafTask.TaskName}: ${curEst}h \u2192 ${newEst}h (+${q.quotaHours}h)`;
            }).join('\n');
            confirmMsg = `Extra ${parsedExtra}h distributed across ${leafUpdates.length} subtask(s):\n\n${lines}\n\nUpdate estimated hours for the above subtasks?`;
          }
          showConfirm(
            'Update Estimated Hours?',
            confirmMsg,
            async () => {
              try {
                await Promise.all(leafUpdates.map(async (q) => {
                  const curEst = parseFloat(String(q.leafTask.EstimatedHours || 0));
                  await tasksApi.update(q.leafTask.Id, {
                    taskName: q.leafTask.TaskName, description: q.leafTask.Description,
                    status: q.leafTask.Status, priority: q.leafTask.Priority,
                    assignedTo: q.leafTask.AssignedTo, dueDate: q.leafTask.DueDate,
                    dueDateMandatory: Number(q.leafTask.DueDateMandatory || 0) === 1,
                    estimatedHours: Number((curEst + q.quotaHours).toFixed(2)),
                    parentTaskId: q.leafTask.ParentTaskId,
                    plannedStartDate: q.leafTask.PlannedStartDate, plannedEndDate: q.leafTask.PlannedEndDate,
                  }, token!);
                }));
                if (projects.length > 0) await loadAllProjectsTasks(projects);
              } catch (err: any) { showAlert('Error', err?.message || 'Failed to update estimated hours.'); }
            }
          );
        }
        return;
      }

      // ── LEAF / STANDALONE TASK PATH ─────────────────────────────────────────
      const result = await executeTaskAllocation(
        task, resolvedUserId, startDate, parsedExtra, targetUser, parsedHpd,
        { appendToExistingUserSlice: true, skipReload: true }
      );

      if (!result) {
        setExtraTimeModal(prev => ({ ...prev, isProcessing: false, error: 'Failed to allocate extra time. Check user availability.' }));
        return;
      }

      if (projects.length > 0) { await loadAllProjectsTasks(projects); await loadAllAllocations(); }
      closeExtraTimeModal();

      const currentEstimated = parseFloat(String(task.EstimatedHours || 0));
      const newEstimated = currentEstimated + parsedExtra;
      showConfirm(
        'Update Estimated Hours?',
        `Extra time of ${parsedExtra}h was added successfully.\n\nDo you want to update the estimated hours for "${task.TaskName}" from ${currentEstimated}h to ${newEstimated}h?`,
        async () => {
          try {
            await tasksApi.update(task.Id, {
              taskName: task.TaskName, description: task.Description, status: task.Status, priority: task.Priority,
              assignedTo: task.AssignedTo, dueDate: task.DueDate, dueDateMandatory: Number(task.DueDateMandatory || 0) === 1,
              estimatedHours: newEstimated, parentTaskId: task.ParentTaskId,
              plannedStartDate: task.PlannedStartDate, plannedEndDate: task.PlannedEndDate,
            }, token!);
            if (projects.length > 0) await loadAllProjectsTasks(projects);
          } catch (err: any) { showAlert('Error', err?.message || 'Failed to update estimated hours.'); }
        }
      );
    } catch (err: any) {
      console.error('Add extra time error:', err);
      setExtraTimeModal(prev => ({ ...prev, isProcessing: false, error: err?.message || 'Failed to add extra time.' }));
    }
  };

  const openForceDatesModal = (task: Task) => {
    if (!canUseGanttPlanningActions()) return;
    setForceDatesModal({
      show: true,
      task,
      startDate: task.PlannedStartDate ? String(task.PlannedStartDate).split('T')[0] : '',
      endDate: task.PlannedEndDate ? String(task.PlannedEndDate).split('T')[0] : '',
      isSaving: false,
      error: '',
    });
  };

  const handleForceDatesSave = async () => {
    if (!canUseGanttPlanningActions()) {
      closeForceDatesModal();
      return;
    }

    const task = forceDatesModal.task;
    if (!task) return;

    if (!forceDatesModal.startDate || !forceDatesModal.endDate) {
      setForceDatesModal((prev) => ({ ...prev, error: 'Start date and end date are required.' }));
      return;
    }

    if (forceDatesModal.endDate < forceDatesModal.startDate) {
      setForceDatesModal((prev) => ({ ...prev, error: 'End date must be after or equal to start date.' }));
      return;
    }

    if (!validateMandatoryDueDateForPlan(task, forceDatesModal.endDate)) {
      return;
    }

    try {
      setForceDatesModal((prev) => ({ ...prev, isSaving: true, error: '' }));
      await handleTaskUpdate(task, {
        PlannedStartDate: forceDatesModal.startDate,
        PlannedEndDate: forceDatesModal.endDate,
      });
      await loadAllAllocations();
      setForceDatesModal({
        show: false,
        task: null,
        startDate: '',
        endDate: '',
        isSaving: false,
        error: '',
      });
      showAlert('Success', 'Task dates updated successfully.');
    } catch (error: any) {
      setForceDatesModal((prev) => ({
        ...prev,
        isSaving: false,
        error: error?.message || 'Failed to update task dates.',
      }));
    }
  };

  const getResizedTaskIndices = (
    clientX: number,
    resizeState: {
      edge: 'start' | 'end' | null;
      startX: number;
      initialStartIndex: number;
      initialEndIndex: number;
      columnWidthPx: number;
    }
  ) => {
    const totalColumns = Math.max(1, timelineColumns.length);
    const safeColumnWidth = Math.max(1, resizeState.columnWidthPx);
    const deltaColumns = Math.round((clientX - resizeState.startX) / safeColumnWidth);

    if (resizeState.edge === 'start') {
      const nextStartIndex = Math.max(0, Math.min(resizeState.initialEndIndex, resizeState.initialStartIndex + deltaColumns));
      return {
        startIndex: nextStartIndex,
        endIndex: resizeState.initialEndIndex,
      };
    }

    const nextEndIndex = Math.min(totalColumns - 1, Math.max(resizeState.initialStartIndex, resizeState.initialEndIndex + deltaColumns));
    return {
      startIndex: resizeState.initialStartIndex,
      endIndex: nextEndIndex,
    };
  };

  const handleTaskResizeStart = (
    e: React.MouseEvent<HTMLDivElement>,
    task: Task,
    edge: 'start' | 'end',
    startIndex: number,
    endIndex: number,
    resizeUserId?: number | null,
    resizeHeaderId?: number | null,
  ) => {
    if (!canUseGanttPlanningActions() || isGanttSearchActive) {
      return;
    }

    const timelineTrack = (e.currentTarget.parentElement?.parentElement as HTMLDivElement | null);
    const timelineRect = timelineTrack?.getBoundingClientRect();
    const fallbackWidth = useFixedPixelColumns ? dayColumnWidthPx : ganttContainerRef.current?.getBoundingClientRect().width || dayColumnWidthPx;
    const columnWidthPx = timelineRect && timelineColumns.length > 0
      ? timelineRect.width / timelineColumns.length
      : fallbackWidth / Math.max(1, timelineColumns.length);

    e.preventDefault();
    e.stopPropagation();
  suppressTaskClickUntilRef.current = Date.now() + 500;
    closeTaskContextMenu();

    setTaskResizeState({
      task,
      edge,
      startX: e.clientX,
      initialStartIndex: startIndex,
      initialEndIndex: endIndex,
      currentStartIndex: startIndex,
      currentEndIndex: endIndex,
      columnWidthPx,
      resizeUserId: resizeUserId ?? null,
      resizeHeaderId: resizeHeaderId ?? null,
      isSaving: false,
    });
  };

  const handleTaskResizeHandleMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    task: Task,
    edge: 'start' | 'end',
    startIndex: number,
    endIndex: number,
    resizeUserId?: number | null,
    resizeHeaderId?: number | null,
  ) => {
    // Keep normal drag-and-drop as default interaction.
    // Resize is opt-in to avoid conflicting with task re-planning drag.
    if (!e.shiftKey) {
      return;
    }

    handleTaskResizeStart(e, task, edge, startIndex, endIndex, resizeUserId, resizeHeaderId);
  };

  useEffect(() => {
    if (!taskResizeState.task || !taskResizeState.edge) return;

    const resizeSnapshot = {
      task: taskResizeState.task,
      edge: taskResizeState.edge,
      startX: taskResizeState.startX,
      initialStartIndex: taskResizeState.initialStartIndex,
      initialEndIndex: taskResizeState.initialEndIndex,
      columnWidthPx: taskResizeState.columnWidthPx,
      resizeUserId: taskResizeState.resizeUserId,
      resizeHeaderId: taskResizeState.resizeHeaderId,
    };

    const handleMouseMove = (event: MouseEvent) => {
      const nextIndices = getResizedTaskIndices(event.clientX, resizeSnapshot);
      setTaskResizeState((prev) => {
        if (!prev.task || prev.task.Id !== resizeSnapshot.task.Id || prev.edge !== resizeSnapshot.edge) {
          return prev;
        }

        if (prev.currentStartIndex === nextIndices.startIndex && prev.currentEndIndex === nextIndices.endIndex) {
          return prev;
        }

        return {
          ...prev,
          currentStartIndex: nextIndices.startIndex,
          currentEndIndex: nextIndices.endIndex,
        };
      });
    };

    const handleMouseUp = (event: MouseEvent) => {
      suppressTaskClickUntilRef.current = Date.now() + 500;
      const nextIndices = getResizedTaskIndices(event.clientX, resizeSnapshot);
      const didChange =
        nextIndices.startIndex !== resizeSnapshot.initialStartIndex ||
        nextIndices.endIndex !== resizeSnapshot.initialEndIndex;

      if (!didChange) {
        closeTaskResize();
        return;
      }

      const plannedStartDate = getDateKeyFromDate(timelineColumns[nextIndices.startIndex].start);
      const plannedEndDate = getDateKeyFromDate(timelineColumns[nextIndices.endIndex].end);

      if (!validateMandatoryDueDateForPlan(resizeSnapshot.task, plannedEndDate)) {
        closeTaskResize();
        return;
      }

      if (resizeSnapshot.resizeHeaderId && resizeSnapshot.resizeUserId) {
        const headerId = Number(resizeSnapshot.resizeHeaderId);
        const userId = Number(resizeSnapshot.resizeUserId);
        const sourceSliceAllocations = allAllocations.filter((allocation) =>
          Number(allocation.TaskAllocationHeaderId || 0) === headerId &&
          Number(allocation.UserId || 0) === userId
        );

        const totalHours = sourceSliceAllocations.reduce((sum, allocation) => sum + Number(allocation.AllocatedHours || 0), 0);
        if (!Number.isFinite(totalHours) || totalHours <= 0) {
          closeTaskResize();
          showAlert('Resize Planning', 'Could not determine total hours for this allocation slice.');
          return;
        }

        const suggestedHoursPerDay = calculateSuggestedHoursPerDay(totalHours, plannedStartDate, plannedEndDate);

        closeTaskResize();

        setShiftResizeSuggestionModal({
          show: true,
          task: resizeSnapshot.task,
          headerId,
          userId,
          plannedStartDate,
          plannedEndDate,
          totalHours: Number(totalHours.toFixed(2)),
          suggestedHoursPerDay,
          hoursPerDayInput: String(suggestedHoursPerDay),
          headerMeta: {},
          isSubmitting: false,
          error: '',
        });
        return;
      }

      setTaskResizeState((prev) => ({ ...prev, isSaving: true }));

      void (async () => {
        try {
          await handleTaskUpdate(resizeSnapshot.task, {
            PlannedStartDate: plannedStartDate,
            PlannedEndDate: plannedEndDate,
          }, { syncAllocationHeaderDates: true });
        } catch (error: any) {
          console.error('Failed to resize task dates:', error);
          showAlert('Error', error?.message || 'Failed to update task dates.');
        } finally {
          closeTaskResize();
        }
      })();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, { once: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    taskResizeState.task,
    taskResizeState.edge,
    taskResizeState.startX,
    taskResizeState.initialStartIndex,
    taskResizeState.initialEndIndex,
    taskResizeState.columnWidthPx,
    taskResizeState.resizeUserId,
    taskResizeState.resizeHeaderId,
    allAllocations,
    calculateSuggestedHoursPerDay,
  ]);

  const handleConfirmShiftResizeSuggestion = async () => {
    const {
      task,
      headerId,
      userId,
      plannedStartDate,
      totalHours,
      hoursPerDayInput,
      headerMeta,
    } = shiftResizeSuggestionModal;

    if (!task || !headerId || !userId) {
      return;
    }

    const parsedTotalHours = roundToPlanningStep(Number(totalHours || 0));
    const parsedHoursPerDay = roundToPlanningStep(Number(hoursPerDayInput || 0));
    if (!Number.isFinite(parsedTotalHours) || parsedTotalHours <= 0) {
      setShiftResizeSuggestionModal((prev) => ({
        ...prev,
        error: 'Total hours must be greater than 0 and use 30-minute steps.',
      }));
      return;
    }
    if (!Number.isFinite(parsedHoursPerDay) || parsedHoursPerDay <= 0) {
      setShiftResizeSuggestionModal((prev) => ({
        ...prev,
        error: 'Hours per day must be greater than 0 and use 30-minute steps.',
      }));
      return;
    }

    setShiftResizeSuggestionModal((prev) => ({
      ...prev,
      isSubmitting: true,
      error: '',
    }));

    try {
      await handleReplanAllocationHeader({
        headerId,
        taskId: task.Id,
        userId,
        startDate: plannedStartDate,
        totalHours: parsedTotalHours,
        hoursPerDay: parsedHoursPerDay,
        header: {
          AllocationMode: headerMeta.AllocationMode,
          SplitOrder: headerMeta.SplitOrder,
        },
      });

      closeShiftResizeSuggestionModal();
      showAlert('Resize Planning', 'Allocation slice replanned successfully with the selected hours/day.');
    } catch (error: any) {
      setShiftResizeSuggestionModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: error?.message || 'Failed to replan allocation slice.',
      }));
    }
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

  const handleDragStart = (e: React.DragEvent, task: Task, sourceUserId?: number | null, sourceHeaderId?: number | null) => {
    if (ganttGroupBy !== 'resource' || !permissions?.canPlanTasks || ganttSearch.trim().length > 0) {
      e.preventDefault();
      return;
    }

    if (Number(task.ParentTaskId || 0) > 0) {
      e.preventDefault();
      return;
    }

    draggedTaskRef.current = task;
    draggedTaskSourceUserIdRef.current = sourceUserId ?? null;
    draggedTaskSourceHeaderIdRef.current = sourceHeaderId ?? null;
    draggedTaskSliceByHoursRef.current = !!e.ctrlKey;
    e.dataTransfer.setData('text/plain', String(task.Id));
    if (sourceHeaderId) {
      e.dataTransfer.setData('application/x-allocation-header-id', String(sourceHeaderId));
    }
    e.dataTransfer.setData('application/x-slice-by-hours', e.ctrlKey ? '1' : '0');
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setHoveredDropCell(null);
    draggedTaskRef.current = null;
    draggedTaskSourceUserIdRef.current = null;
    draggedTaskSourceHeaderIdRef.current = null;
    draggedTaskSliceByHoursRef.current = false;
    setDraggedTask(null);
  };

  const deleteTaskUserAllocationDates = async (taskId: number, userId: number, allocationDates: string[]) => {
    const uniqueDates = Array.from(new Set(allocationDates.filter(Boolean)));
    for (const allocationDate of uniqueDates) {
      await fetch(`${getApiUrl()}/api/task-allocations/delete`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId, userId, allocationDate }),
      });
    }
  };

  const deleteTaskAllocationHeaderSlice = async (headerId: number) => {
    const response = await fetch(`${getApiUrl()}/api/task-allocations/header/${headerId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to delete allocation slice');
    }
  };

  const deleteChildAllocationHeaderSlice = async (headerId: number) => {
    const response = await fetch(`${getApiUrl()}/api/task-child-allocations/header/${headerId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to delete child allocation slice');
    }
  };

  const deleteParentChildAllocationDates = async (
    parentTaskId: number,
    allocationDates: string[],
    sourceHeaderId?: number | null,
    childTaskIds?: number[]
  ) => {
    const uniqueDates = Array.from(new Set((allocationDates || []).map((date) => normalizeDateKey(date)).filter(Boolean)));
    if (uniqueDates.length === 0) {
      return;
    }

    const response = await fetch(`${getApiUrl()}/api/task-child-allocations/parent/${parentTaskId}/dates`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dates: uniqueDates,
        sourceHeaderId: Number(sourceHeaderId || 0) || undefined,
        childTaskIds: Array.isArray(childTaskIds)
          ? Array.from(new Set(childTaskIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
          : undefined,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to delete child allocations for selected slice dates');
    }
  };

  const calculateSliceHoursFromSelectedSubtasks = (
    parentTaskId: number,
    selectedChildTaskIds: number[],
    sourceAllocationDates: string[],
    sourceTotalHours: number,
    availableChildTaskIdsCount: number,
    sourceHeaderId?: number | null
  ): number => {
    if (!Number.isFinite(sourceTotalHours) || sourceTotalHours <= 0) {
      return 0;
    }

    if (!Array.isArray(selectedChildTaskIds) || selectedChildTaskIds.length === 0) {
      return 0;
    }

    const selectedSet = new Set(selectedChildTaskIds.map((taskId) => Number(taskId)).filter((taskId) => Number.isFinite(taskId) && taskId > 0));
    const sourceDateSet = new Set((sourceAllocationDates || []).map((date) => normalizeDateKey(date)).filter(Boolean));

    const selectedHours = childAllocations
      .filter((allocation) => Number(allocation.ParentTaskId) === Number(parentTaskId))
      .filter((allocation) => !sourceHeaderId || Number(allocation.TaskAllocationHeaderId || 0) === Number(sourceHeaderId))
      .filter((allocation) => selectedSet.has(Number(allocation.ChildTaskId)))
      .filter((allocation) => sourceDateSet.size === 0 || sourceDateSet.has(normalizeDateKey(allocation.AllocationDate)))
      .reduce((sum, allocation) => sum + Number(allocation.AllocatedHours || 0), 0);

    if (selectedHours > 0) {
      return Number(Math.min(sourceTotalHours, selectedHours).toFixed(2));
    }

    if (availableChildTaskIdsCount > 0) {
      const ratio = Math.min(1, selectedSet.size / availableChildTaskIdsCount);
      return Number((sourceTotalHours * ratio).toFixed(2));
    }

    return Number(sourceTotalHours.toFixed(2));
  };

  const buildChildAllocationPayloadFromSourceSlice = (
    rootParentTaskId: number,
    sourceHeaderId: number,
    targetHeaderId: number | null | undefined,
    targetParentAllocations: Array<{ date: string; hours: number; startTime: string; endTime: string }>,
    sourceAllocationDates: string[]
  ) => {
    const sourceDateSet = new Set((sourceAllocationDates || []).map((date) => normalizeDateKey(date)).filter(Boolean));
    const scopedRows = childAllocations
      .filter((allocation) => Number(allocation.TaskAllocationHeaderId || 0) === Number(sourceHeaderId))
      .filter((allocation) => sourceDateSet.size === 0 || sourceDateSet.has(normalizeDateKey(allocation.AllocationDate)));

    const rowsByParentId = new Map<number, typeof scopedRows>();
    for (const row of scopedRows) {
      const parentId = Number(row.ParentTaskId);
      const existingRows = rowsByParentId.get(parentId) || [];
      existingRows.push(row);
      rowsByParentId.set(parentId, existingRows);
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

    const payload: Array<{
      ParentTaskId: number;
      ChildTaskId: number;
      TaskAllocationHeaderId?: number | null;
      AllocationDate: string;
      AllocatedHours: number;
      Level: number;
      StartTime: string;
      EndTime: string;
    }> = [];

    const distributeForParent = (
      parentTaskId: number,
      parentAllocations: Array<{ date: string; hours: number; startTime: string; endTime: string }>
    ) => {
      const sourceRowsForParent = rowsByParentId.get(parentTaskId) || [];
      if (sourceRowsForParent.length === 0 || parentAllocations.length === 0) {
        return;
      }

      const childSummaries = Array.from(
        sourceRowsForParent.reduce((acc, row) => {
          const childTaskId = Number(row.ChildTaskId);
          const existing = acc.get(childTaskId) || {
            childTaskId,
            hours: 0,
            level: Number(row.Level || 1),
          };
          existing.hours += Number(row.AllocatedHours || 0);
          acc.set(childTaskId, existing);
          return acc;
        }, new Map<number, { childTaskId: number; hours: number; level: number }>())
        .values()
      ).sort((a, b) => {
        const taskA = tasks.find((taskEntry) => Number(taskEntry.Id) === a.childTaskId);
        const taskB = tasks.find((taskEntry) => Number(taskEntry.Id) === b.childTaskId);
        const orderA = Number(taskA?.DisplayOrder || 0);
        const orderB = Number(taskB?.DisplayOrder || 0);
        return orderA !== orderB ? orderA - orderB : a.childTaskId - b.childTaskId;
      });

      const totalWeight = childSummaries.reduce((sum, childSummary) => sum + Number(childSummary.hours || 0), 0);
      const totalParentHours = parentAllocations.reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0);
      if (totalWeight <= 0 || totalParentHours <= 0) {
        return;
      }

      const quotas = childSummaries.map((childSummary, index) => {
        if (index === childSummaries.length - 1) {
          return { ...childSummary, quotaHours: 0 };
        }
        const proportionalHours = (totalParentHours * childSummary.hours) / totalWeight;
        return {
          ...childSummary,
          quotaHours: Number(proportionalHours.toFixed(2)),
        };
      });

      const allocatedBeforeLast = quotas.reduce((sum, quota) => sum + quota.quotaHours, 0);
      if (quotas.length > 0) {
        quotas[quotas.length - 1].quotaHours = Number(Math.max(0, totalParentHours - allocatedBeforeLast).toFixed(2));
      }

      const allocationSlots = parentAllocations
        .map((allocation) => ({
          date: allocation.date,
          remainingHours: Number(allocation.hours || 0),
          cursorMinutes: parseTimeToMinutes(allocation.startTime || '09:00'),
        }))
        .filter((slot) => slot.remainingHours > 0.0001);

      let slotIndex = 0;
      const childAllocationsByChild = new Map<number, Array<{ date: string; hours: number; startTime: string; endTime: string }>>();

      for (const quota of quotas) {
        let remainingQuota = quota.quotaHours;
        while (remainingQuota > 0.0001 && slotIndex < allocationSlots.length) {
          const slot = allocationSlots[slotIndex];
          const hoursToAllocate = Math.min(remainingQuota, slot.remainingHours);
          if (hoursToAllocate <= 0.0001) {
            slotIndex++;
            continue;
          }

          const allocationMinutes = Math.max(1, Math.round(hoursToAllocate * 60));
          const allocatedHours = Number((allocationMinutes / 60).toFixed(2));
          const startMinutes = slot.cursorMinutes;
          const endMinutes = startMinutes + allocationMinutes;
          const childAllocation = {
            date: slot.date,
            hours: allocatedHours,
            startTime: formatMinutesToTime(startMinutes),
            endTime: formatMinutesToTime(endMinutes),
          };

          payload.push({
            ParentTaskId: parentTaskId,
            ChildTaskId: quota.childTaskId,
            TaskAllocationHeaderId: targetHeaderId ?? null,
            AllocationDate: slot.date,
            AllocatedHours: allocatedHours,
            Level: quota.level,
            StartTime: childAllocation.startTime,
            EndTime: childAllocation.endTime,
          });

          const existingChildAllocations = childAllocationsByChild.get(quota.childTaskId) || [];
          existingChildAllocations.push(childAllocation);
          childAllocationsByChild.set(quota.childTaskId, existingChildAllocations);

          remainingQuota = Math.max(0, remainingQuota - allocatedHours);
          slot.remainingHours = Math.max(0, slot.remainingHours - allocatedHours);
          slot.cursorMinutes = endMinutes;

          if (slot.remainingHours <= 0.0001) {
            slotIndex++;
          }
        }
      }

      for (const [childTaskId, childTaskAllocations] of childAllocationsByChild.entries()) {
        if (rowsByParentId.has(childTaskId) && childTaskAllocations.length > 0) {
          distributeForParent(childTaskId, childTaskAllocations);
        }
      }
    };

    distributeForParent(rootParentTaskId, targetParentAllocations);
    return payload;
  };

  const handleConfirmSliceTransfer = async () => {
    const {
      taskId,
      targetUserId,
      dropDate,
      sourceUserId,
      sourceHeaderId,
      moveHours,
      availableChildTaskIds,
      selectedChildTaskIds,
    } = sliceTransferModal;

    const normalizedMoveHours = roundToPlanningStep(Number(moveHours || 0));
    if (!taskId || !targetUserId || !sourceUserId || !sourceHeaderId || !Number.isFinite(normalizedMoveHours) || normalizedMoveHours <= 0) {
      return;
    }

    if (availableChildTaskIds.length > 0 && selectedChildTaskIds.length === 0) {
      showAlert('Slice Transfer', 'Select at least one subtask to move.');
      return;
    }

    setSliceTransferModal((prev) => ({ ...prev, isProcessing: true }));

    try {
      const task = tasks.find((entry) => Number(entry.Id) === Number(taskId));
      const targetUser = users.find((entry) => Number(entry.Id) === Number(targetUserId));
      if (!task || !targetUser) {
        throw new Error('Task or target user not found');
      }

      const sourceAllocations = allAllocations
        .filter((allocation) =>
          Number(allocation.TaskId) === Number(taskId) &&
          Number(allocation.UserId) === Number(sourceUserId) &&
          Number(allocation.TaskAllocationHeaderId || 0) === Number(sourceHeaderId)
        )
        .map((allocation) => ({ ...allocation, dateKey: normalizeDateKey(allocation.AllocationDate) }));

      if (sourceAllocations.length === 0) {
        throw new Error('No allocations found in selected slice period');
      }

      const totalSliceHours = sourceAllocations.reduce(
        (sum, allocation) => sum + Number(allocation.AllocatedHours || 0),
        0
      );
      const totalHoursToMove = roundToPlanningStep(Math.min(normalizedMoveHours, totalSliceHours));

      if (totalHoursToMove <= 0) {
        throw new Error('Invalid hours to move');
      }

      const dropStartDate = new Date(`${dropDate}T12:00:00`);
      const isHobbyTask = !!projects.find((projectEntry) => projectEntry.Id === task.ProjectId)?.IsHobby;
      const maxDailyHours = Math.max(...WEEK_DAYS.map((dayName) => {
        const key = isHobbyTask
          ? `HobbyHours${dayName}` as keyof User
          : `WorkHours${dayName}` as keyof User;
        return parseFloat(targetUser[key] as any) || 0;
      }));

      if (maxDailyHours <= 0) {
        throw new Error('Target user has no configured daily hours for this task type');
      }

      const allocationResult = await executeTaskAllocation(
        task,
        targetUserId,
        dropStartDate,
        totalHoursToMove,
        targetUser,
        maxDailyHours,
        {
          skipReload: true,
          suppressDependentReplan: true,
          appendToExistingUserSlice: true, // Always true for slice operations - creates new header in parallel
          // Important: when moving within the same user, keep source header in availability
          // so existing same-day slice hours are still counted and we don't over-plan that day.
          excludeHeaderId: targetUserId !== sourceUserId ? sourceHeaderId : undefined,
        }
      );

      if (!allocationResult) {
        throw new Error('Failed to allocate selected slice to target user');
      }

      if (availableChildTaskIds.length > 0 && selectedChildTaskIds.length > 0) {
        const sourceDateSet = new Set(sourceAllocations.map((allocation) => allocation.dateKey));
        const selectedChildSet = new Set(selectedChildTaskIds.map((childTaskId) => Number(childTaskId)).filter((childTaskId) => Number.isFinite(childTaskId) && childTaskId > 0));

        const sourceChildRows = childAllocations
          .filter((allocation) => Number(allocation.ParentTaskId) === Number(taskId))
          .filter((allocation) => Number(allocation.TaskAllocationHeaderId || 0) === Number(sourceHeaderId))
          .filter((allocation) => selectedChildSet.has(Number(allocation.ChildTaskId)))
          .filter((allocation) => sourceDateSet.has(normalizeDateKey(allocation.AllocationDate)));

        const sourceChildHoursByTask = sourceChildRows.reduce((acc, allocation) => {
          const childTaskId = Number(allocation.ChildTaskId);
          acc[childTaskId] = (acc[childTaskId] || 0) + Number(allocation.AllocatedHours || 0);
          return acc;
        }, {} as Record<number, number>);

        const totalSelectedChildHours = Object.values(sourceChildHoursByTask).reduce((sum, hours) => sum + Number(hours || 0), 0);
        const totalParentMovedHours = allocationResult.allocations?.reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0) || 0;
        const childHoursToMove = Math.min(totalHoursToMove, totalSelectedChildHours, totalParentMovedHours);

        if (childHoursToMove > 0.0001 && Array.isArray(allocationResult.allocations) && allocationResult.allocations.length > 0) {
          const weightedChildren = Object.entries(sourceChildHoursByTask)
            .map(([childTaskId, hours]) => ({ childTaskId: Number(childTaskId), weight: Number(hours || 0) }))
            .filter((entry) => entry.weight > 0);

          if (weightedChildren.length > 0) {
            const totalWeight = weightedChildren.reduce((sum, entry) => sum + entry.weight, 0);
            const quotas = weightedChildren.map((entry, index) => {
              if (index === weightedChildren.length - 1) {
                return { childTaskId: entry.childTaskId, quotaHours: 0 };
              }
              const proportional = totalWeight > 0 ? (childHoursToMove * entry.weight) / totalWeight : 0;
              return { childTaskId: entry.childTaskId, quotaHours: Number(proportional.toFixed(2)) };
            });
            const allocatedBeforeLast = quotas.reduce((sum, quota) => sum + quota.quotaHours, 0);
            if (quotas.length > 0) {
              quotas[quotas.length - 1].quotaHours = Number(Math.max(0, childHoursToMove - allocatedBeforeLast).toFixed(2));
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

            const allocationSlots = allocationResult.allocations
              .map((allocation) => ({
                date: allocation.date,
                remainingHours: Number(allocation.hours || 0),
                cursorMinutes: parseTimeToMinutes(allocation.startTime || '09:00'),
              }))
              .filter((slot) => slot.remainingHours > 0.0001);

            let slotIndex = 0;
            const movedChildPayload: Array<{
              ParentTaskId: number;
              ChildTaskId: number;
              TaskAllocationHeaderId?: number | null;
              AllocationDate: string;
              AllocatedHours: number;
              Level: number;
              StartTime: string;
              EndTime: string;
            }> = [];

            for (const quota of quotas) {
              let remainingQuota = quota.quotaHours;
              while (remainingQuota > 0.0001 && slotIndex < allocationSlots.length) {
                const slot = allocationSlots[slotIndex];
                const hoursToAllocate = Math.min(remainingQuota, slot.remainingHours);
                if (hoursToAllocate <= 0.0001) {
                  slotIndex++;
                  continue;
                }

                const allocationMinutes = Math.max(1, Math.round(hoursToAllocate * 60));
                const allocatedHours = Number((allocationMinutes / 60).toFixed(2));
                const startMinutes = slot.cursorMinutes;
                const endMinutes = startMinutes + allocationMinutes;

                const sourceChildTask = tasks.find((taskEntry) => Number(taskEntry.Id) === Number(quota.childTaskId));
                movedChildPayload.push({
                  ParentTaskId: Number(taskId),
                  ChildTaskId: quota.childTaskId,
                  TaskAllocationHeaderId: allocationResult.headerId ?? null,
                  AllocationDate: slot.date,
                  AllocatedHours: allocatedHours,
                  Level: Math.max(1, getTaskDepthLevel(sourceChildTask || task, Number(taskId)) + 1),
                  StartTime: formatMinutesToTime(startMinutes),
                  EndTime: formatMinutesToTime(endMinutes),
                });

                remainingQuota = Math.max(0, remainingQuota - allocatedHours);
                slot.remainingHours = Math.max(0, slot.remainingHours - allocatedHours);
                slot.cursorMinutes = endMinutes;

                if (slot.remainingHours <= 0.0001) {
                  slotIndex++;
                }
              }
            }

            if (movedChildPayload.length > 0) {
              const childSaveRes = await fetch(`${getApiUrl()}/api/task-child-allocations/batch`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ allocations: movedChildPayload, replaceParent: false }),
              });

              if (!childSaveRes.ok) {
                throw new Error('Failed to replan moved subtasks for selected slice');
              }

              await deleteParentChildAllocationDates(Number(taskId), sourceAllocations.map((allocation) => allocation.dateKey), sourceHeaderId, selectedChildTaskIds);
            }
          }
        }
      }

      const deleteResponse = await fetch(`${getApiUrl()}/api/task-allocations/header/${sourceHeaderId}/hours`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hours: totalHoursToMove }),
      });

      if (!deleteResponse.ok) {
        throw new Error('Failed to remove selected slice from source allocation');
      }

      if (projects.length > 0) {
        await loadAllProjectsTasks(projects);
        await loadAllAllocations();
      }

      setSliceTransferModal({
        show: false,
        taskId: null,
        targetUserId: null,
        dropDate: '',
        sourceUserId: null,
        sourceHeaderId: null,
        sourceAllocationDates: [],
        sourceTotalHours: 0,
        totalHours: 0,
        moveHours: 0,
        availableChildTaskIds: [],
        selectedChildTaskIds: [],
        isProcessing: false,
      });
    } catch (error: any) {
      console.error('Failed to transfer allocation slice:', error);
      showAlert('Slice Transfer', error?.message || 'Failed to transfer selected slice');
      setSliceTransferModal((prev) => ({ ...prev, isProcessing: false }));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (ganttGroupBy !== 'resource' || !permissions?.canPlanTasks || ganttSearch.trim().length > 0) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.preventDefault();
    if (!draggedTask && draggedTaskRef.current) {
      setDraggedTask(draggedTaskRef.current);
    }
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnUser = async (e: React.DragEvent, userId: number | null) => {
    e.preventDefault();
    setHoveredDropCell(null);
    if (ganttGroupBy !== 'resource' || !permissions?.canPlanTasks || ganttSearch.trim().length > 0) return;

    const droppedTaskId = Number(e.dataTransfer.getData('text/plain') || 0);
    const activeDraggedTask = draggedTaskRef.current || draggedTask || tasks.find((t) => t.Id === droppedTaskId) || null;
    if (!activeDraggedTask) return;

    const splitUserCount = new Set(
      allAllocations
        .filter((allocation) => allocation.TaskId === activeDraggedTask.Id)
        .map((allocation) => allocation.UserId)
    ).size;
    if (splitUserCount > 1) {
      showAlert('Split Task', 'For split tasks, drop on a specific day to replan only that user slice.');
      draggedTaskRef.current = null;
      draggedTaskSourceUserIdRef.current = null;
      setDraggedTask(null);
      return;
    }

    // Check if user has access to the project
    if (userId) {
      const taskProject = projects.find(p => p.Id === activeDraggedTask.ProjectId);
      if (taskProject) {
        const userOrgs = userOrganizations[userId] || [];
        if (!userOrgs.includes(taskProject.OrganizationId)) {
          showAlert('No Access', 'This user does not have access to the project this task belongs to.');
          draggedTaskRef.current = null;
          draggedTaskSourceUserIdRef.current = null;
          setDraggedTask(null);
          return;
        }
      }
    }

    await handleTaskUpdate(activeDraggedTask, { AssignedTo: userId || undefined });
    draggedTaskRef.current = null;
    draggedTaskSourceUserIdRef.current = null;
    setDraggedTask(null);
  };

  const handleDropOnDay = async (e: React.DragEvent, day: Date, userId: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    setHoveredDropCell(null);
    if (ganttGroupBy !== 'resource' || !permissions?.canPlanTasks || ganttSearch.trim().length > 0 || !userId) return;

    const droppedTaskId = Number(e.dataTransfer.getData('text/plain') || 0);
    const activeDraggedTask = draggedTaskRef.current || draggedTask || tasks.find((t) => t.Id === droppedTaskId) || null;
    if (!activeDraggedTask) return;
    const sourceUserId = draggedTaskSourceUserIdRef.current;
    const sourceHeaderIdFromTransfer = Number(e.dataTransfer.getData('application/x-allocation-header-id') || 0) || null;
    const sourceHeaderId = draggedTaskSourceHeaderIdRef.current || sourceHeaderIdFromTransfer;
    const sliceByHours = (e.dataTransfer.getData('application/x-slice-by-hours') === '1') || draggedTaskSliceByHoursRef.current;
    const sourceSliceAllocations = sourceUserId
      ? allAllocations.filter((allocation) => {
          if (allocation.UserId !== sourceUserId) {
            return false;
          }

          if (sourceHeaderId) {
            return Number(allocation.TaskAllocationHeaderId || 0) === Number(sourceHeaderId);
          }

          return allocation.TaskId === activeDraggedTask.Id;
        })
      : [];
    const sourceSliceTaskIds = Array.from(new Set(sourceSliceAllocations.map((allocation) => Number(allocation.TaskId)).filter((taskId) => Number.isFinite(taskId) && taskId > 0)));
    const sourceSliceHours = sourceSliceAllocations.reduce((sum, allocation) => sum + Number(allocation.AllocatedHours || 0), 0);
    const sourceSliceDates = sourceSliceAllocations.map((allocation) => normalizeDateKey(allocation.AllocationDate));
    const isSliceDrag = sourceSliceAllocations.length > 0;

    if (isSliceDrag && sliceByHours) {
      if (!sourceHeaderId || !sourceUserId) {
        showAlert(
          'Slice Transfer',
          'This allocation cannot be partially moved because it has no allocation header. Replan normally or recreate this slice first.'
        );
        draggedTaskRef.current = null;
        draggedTaskSourceUserIdRef.current = null;
        draggedTaskSourceHeaderIdRef.current = null;
        draggedTaskSliceByHoursRef.current = false;
        setDraggedTask(null);
        return;
      }

      const totalSliceHours = sourceSliceAllocations.reduce((sum, allocation) => sum + Number(allocation.AllocatedHours || 0), 0);
      const sliceTaskId = sourceSliceTaskIds.length === 1 ? sourceSliceTaskIds[0] : activeDraggedTask.Id;
      const sourceSliceDateSet = new Set(sourceSliceDates);
      const availableChildTaskIds = Array.from(new Set(
        childAllocations
          .filter((childAllocation) => Number(childAllocation.ParentTaskId) === Number(sliceTaskId))
          .filter((childAllocation) => Number(childAllocation.TaskAllocationHeaderId || 0) === Number(sourceHeaderId))
          .filter((childAllocation) => sourceSliceDateSet.has(normalizeDateKey(childAllocation.AllocationDate)))
          .map((childAllocation) => Number(childAllocation.ChildTaskId))
          .filter((childTaskId) => Number.isFinite(childTaskId) && childTaskId > 0)
      ));
      const selectedSliceHours = availableChildTaskIds.length > 0
        ? calculateSliceHoursFromSelectedSubtasks(
            sliceTaskId,
            availableChildTaskIds,
            sourceSliceDates,
            totalSliceHours,
            availableChildTaskIds.length,
            sourceHeaderId
          )
        : totalSliceHours;
      const normalizedSelectedSliceHours = roundToPlanningStep(selectedSliceHours);
      setSliceTransferModal({
        show: true,
        taskId: sliceTaskId,
        targetUserId: userId,
        dropDate: getDateKeyFromDate(day),
        sourceUserId,
        sourceHeaderId,
        sourceAllocationDates: sourceSliceDates,
        sourceTotalHours: totalSliceHours,
        totalHours: normalizedSelectedSliceHours,
        moveHours: normalizedSelectedSliceHours,
        availableChildTaskIds,
        selectedChildTaskIds: availableChildTaskIds,
        isProcessing: false,
      });
      draggedTaskRef.current = null;
      draggedTaskSourceUserIdRef.current = null;
      draggedTaskSourceHeaderIdRef.current = null;
      draggedTaskSliceByHoursRef.current = false;
      setDraggedTask(null);
      return;
    }

    const droppedDateStr = getDateKeyFromDate(day);
    const droppedDateHolidayNames = getUserHolidayNames(userId, droppedDateStr);
    const droppedDateIsFullyUnavailable = droppedDateHolidayNames.some((label) => !isHalfDayLeaveLabel(label));
    if (droppedDateIsFullyUnavailable) {
      showAlert(
        'Unavailable Day',
        `Cannot plan on unavailable day for this user (${droppedDateStr}): ${droppedDateHolidayNames.join(', ')}`
      );
      draggedTaskRef.current = null;
      setDraggedTask(null);
      return;
    }

    // If dragged from subtasks modal, close it
    if (subtasksModal.show) {
      handleSubtaskDraggedToGantt();
    }

    // Check if user has access to the project
    const taskProject = projects.find(p => p.Id === activeDraggedTask.ProjectId);
    if (taskProject) {
      const userOrgs = userOrganizations[userId] || [];
      if (!userOrgs.includes(taskProject.OrganizationId)) {
        showAlert('No Access', 'This user does not have access to the project this task belongs to.');
        draggedTaskRef.current = null;
        draggedTaskSourceUserIdRef.current = null;
        setDraggedTask(null);
        return;
      }
    }

    // Check if this is a task with children (hierarchical task)
    const hasChildren = tasks.some(t => t.ParentTaskId === activeDraggedTask.Id);
    
    if (hasChildren) {
      // Get all leaf tasks (tasks without children) recursively
      const allLeafTasks = getAllLeafTasks(activeDraggedTask.Id);
      const sourceSliceDateSet = new Set(sourceSliceDates);
      const sliceLeafTaskIds = isSliceDrag && sourceSliceDateSet.size > 0
        ? new Set(
            childAllocations
              .filter((childAllocation) => Number(childAllocation.ParentTaskId) === Number(activeDraggedTask.Id))
              .filter((childAllocation) => !sourceHeaderId || Number(childAllocation.TaskAllocationHeaderId || 0) === Number(sourceHeaderId))
              .filter((childAllocation) => sourceSliceDateSet.has(normalizeDateKey(childAllocation.AllocationDate)))
              .map((childAllocation) => Number(childAllocation.ChildTaskId))
              .filter((childTaskId) => Number.isFinite(childTaskId) && childTaskId > 0)
          )
        : null;
      const leafTasks = sliceLeafTaskIds && sliceLeafTaskIds.size > 0
        ? allLeafTasks.filter((leafTask) => sliceLeafTaskIds.has(leafTask.Id))
        : allLeafTasks;
      
      if (leafTasks.length === 0) {
        showAlert('No Leaf Tasks', 'No leaf tasks found to plan.');
        draggedTaskRef.current = null;
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

      const calculatedRemainingHours = totalEstimatedHours - totalHoursWorked;
      const totalRemainingHours = isSliceDrag && sourceSliceHours > 0
        ? roundToPlanningStep(sourceSliceHours)
        : calculatedRemainingHours;
      const modalEstimatedHours = isSliceDrag && sourceSliceHours > 0
        ? roundToPlanningStep(sourceSliceHours)
        : totalEstimatedHours;

      console.log('Hierarchical planning:', {
        parentTask: activeDraggedTask.TaskName,
        leafTasksCount: leafTasks.length,
        totalEstimatedHours,
        totalHoursWorked,
        totalRemainingHours,
        isSliceDrag,
        sourceHeaderId,
        sourceSliceHours,
        sliceLeafTasksCount: sliceLeafTaskIds?.size || 0,
      });

      if (!isSliceDrag && totalRemainingHours < 0) {
        showAlert(
          'No Remaining Hours',
          `All leaf tasks have no remaining hours.\n\nTotal Estimated: ${totalEstimatedHours}h\nAlready worked: ${totalHoursWorked}h`
        );
        setDraggedTask(null);
        return;
      }

      // Now plan the PARENT task with the total hours
      // This will create allocations for the parent, giving us the date range
      await planTaskAsParent(
        activeDraggedTask,
        day,
        userId,
        totalRemainingHours,
        leafTasks,
        modalEstimatedHours,
        totalHoursWorked,
        sourceUserId,
        sourceHeaderId,
        sourceSliceDates
      );
      draggedTaskRef.current = null;
      setDraggedTask(null);
      return;
    }

    // Single task without children - check dependencies and plan normally
    if (activeDraggedTask.DependsOnTaskId) {
      const dependsOnTask = tasks.find(t => t.Id === activeDraggedTask.DependsOnTaskId);
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
        draggedTaskRef.current = null;
        draggedTaskSourceUserIdRef.current = null;
        setDraggedTask(null);
        return;
      }

      const estimatedHours = Number(activeDraggedTask.EstimatedHours || 8);
      let hoursAlreadyWorked = 0;
      let remainingHoursToWork = 0;

      if (isSliceDrag) {
        remainingHoursToWork = sourceSliceHours;
      } else {
        // Fetch time entries for this task to calculate hours already worked
        const timeEntriesRes = await fetch(
          `${getApiUrl()}/api/time-entries/task/${activeDraggedTask.Id}`,
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
            hoursAlreadyWorked = timeEntriesData.entries.reduce((sum: number, entry: any) => {
              return sum + parseFloat(entry.Hours || 0);
            }, 0);
          }
        }

        // Calculate remaining hours to plan
        remainingHoursToWork = estimatedHours - hoursAlreadyWorked;
      }

      // Check if there are remaining hours to plan
      if (remainingHoursToWork < 0) {
        showAlert(
          'No Remaining Hours',
          isSliceDrag
            ? 'This split slice has no allocated hours to replan.'
            : `This task has no remaining hours to plan.\n\nEstimated: ${estimatedHours}h\nAlready worked: ${hoursAlreadyWorked.toFixed(2)}h\n\nPlease update the estimated hours if more work is needed.`
        );
        setDraggedTask(null);
        return;
      }

      // Check if task belongs to a hobby project (must be checked BEFORE work hours validation)
      const taskProject = projects.find(p => p.Id === activeDraggedTask.ProjectId);
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
          task: activeDraggedTask,
          userId,
          startDate,
          existingTasks: existingTaskNames,
          totalHoursToAllocate: remainingHoursToWork,
          hoursAlreadyWorked,
          maxDailyHours,
          sourceUserId,
          sourceHeaderId,
          sourceAllocationDates: sourceSliceDates,
          suppressDependentReplan: isSliceDrag,
        });
        setDraggedTask(null);
        return;
      }

      console.log('Hours per day check:', { isHobbyTask, remainingHoursToWork, maxDailyHours, threshold: maxDailyHours * 0.5, shouldShowModal: remainingHoursToWork > maxDailyHours * 0.5, hoursAlreadyWorked });

      // Show modal to ask for hours per day if:
      // - There are hours already worked (user needs to confirm), OR
      // - Remaining hours are more than 50% of daily capacity
      if (hoursAlreadyWorked > 0 || remainingHoursToWork <= 0 || remainingHoursToWork > maxDailyHours * 0.5) {
        console.log('Showing hours per day modal');
        const taskEstimatedHours = parseFloat(String(activeDraggedTask.EstimatedHours || 0));
                // For slice drags, read the stored HoursPerDay from the source header so the user
                // sees the same daily cap that was originally configured for this slice.
                const storedHeaderHoursPerDay = isSliceDrag && sourceHeaderId
                  ? (allAllocations.find(a => Number(a.TaskAllocationHeaderId) === Number(sourceHeaderId))?.HoursPerDay ?? null)
                  : null;
                const effectiveHoursPerDay = (storedHeaderHoursPerDay && storedHeaderHoursPerDay > 0)
                  ? storedHeaderHoursPerDay
                  : maxDailyHours;
        const normalizedEffectiveHoursPerDay = floorToPlanningStep(effectiveHoursPerDay);
        const normalizedRemainingHoursToWork = roundToPlanningStep(remainingHoursToWork);
        setHoursPerDayModal({
          show: true,
          task: activeDraggedTask,
          userId,
          startDate,
          maxDailyHours,
          hoursPerDay: normalizedEffectiveHoursPerDay.toString(),
          totalHours: normalizedRemainingHoursToWork,
          hoursAlreadyWorked: hoursAlreadyWorked,
          totalEstimatedHours: taskEstimatedHours,
          enableSplit: false,
          splitMode: 'parallel',
          splitEntries: [{ userId, plannedHours: normalizedRemainingHoursToWork, hoursPerDay: normalizedEffectiveHoursPerDay, splitOrder: 1 }],
          sourceUserId,
          sourceHeaderId,
          sourceAllocationDates: sourceSliceDates,
          suppressDependentReplan: isSliceDrag,
        });
        setDraggedTask(null);
        return;
      }

      // Continue with allocation using full daily hours (small tasks with no worked hours)
      const allocationResult = await executeTaskAllocation(
        activeDraggedTask,
        userId,
        startDate,
        remainingHoursToWork,
        user,
        maxDailyHours,
        {
          skipReload: true,
          suppressDependentReplan: isSliceDrag,
          appendToExistingUserSlice: !!(isSliceDrag && sourceUserId), // Always true for slice ops to preserve existing allocations
                  excludeHeaderId: isSliceDrag && sourceHeaderId ? sourceHeaderId : undefined,
        }
      );
      if (allocationResult && isSliceDrag && sourceUserId && sourceSliceDates.length > 0) {
        if (sourceHeaderId) {
          await deleteTaskAllocationHeaderSlice(sourceHeaderId);
        } else {
          await deleteTaskUserAllocationDates(activeDraggedTask.Id, sourceUserId, sourceSliceDates);
        }
      }
      if (projects.length > 0) {
        await loadAllProjectsTasks(projects);
        await loadAllAllocations();
      }
      draggedTaskRef.current = null;
      draggedTaskSourceUserIdRef.current = null;
      draggedTaskSourceHeaderIdRef.current = null;
      draggedTaskSliceByHoursRef.current = false;
    } catch (err) {
      console.error('Failed to allocate task:', err);
      showAlert('Error', 'Failed to allocate task');
      draggedTaskRef.current = null;
      draggedTaskSourceUserIdRef.current = null;
      draggedTaskSourceHeaderIdRef.current = null;
      draggedTaskSliceByHoursRef.current = false;
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
    totalAlreadyWorked?: number,
    sourceUserId?: number | null,
    sourceHeaderId?: number | null,
    sourceAllocationDates: string[] = []
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
          leafTasks: leafTasks,
          sourceUserId: sourceUserId ?? null,
          sourceHeaderId: sourceHeaderId ?? null,
          sourceAllocationDates,
          suppressDependentReplan: !!sourceHeaderId,
        });
        return;
      }

      // For parent tasks, ALWAYS show the hoursPerDay modal so the user can configure
      // total hours, hours/day, and split planning — even when estimated hours are 0.
      const normalizedTotalHours = roundToPlanningStep(totalHours);
      const normalizedMaxDailyHours = floorToPlanningStep(maxDailyHours);
      const storedHeaderHoursPerDay = sourceHeaderId
        ? Number(allAllocations.find(a => Number(a.TaskAllocationHeaderId) === Number(sourceHeaderId))?.HoursPerDay ?? 0)
        : 0;
      const effectiveHoursPerDay = storedHeaderHoursPerDay > 0
        ? storedHeaderHoursPerDay
        : normalizedMaxDailyHours;
      const normalizedHoursPerDay = floorToPlanningStep(effectiveHoursPerDay);
      setHoursPerDayModal({
        show: true,
        task: parentTask,
        userId,
        startDate,
        maxDailyHours,
        hoursPerDay: normalizedHoursPerDay.toString(),
        totalHours: normalizedTotalHours,
        hoursAlreadyWorked: totalAlreadyWorked || 0,
        totalEstimatedHours: totalEstimatedHours || totalHours,
        isParentTask: true,
        leafTasks: leafTasks,
        enableSplit: false,
        splitMode: 'parallel',
        splitEntries: [{ userId, plannedHours: normalizedTotalHours, hoursPerDay: normalizedHoursPerDay, splitOrder: 1, selectedLeafTaskIds: leafTasks.map(t => t.Id) }],
        sourceUserId: sourceUserId ?? null,
        sourceHeaderId: sourceHeaderId ?? null,
        sourceAllocationDates,
        suppressDependentReplan: !!sourceHeaderId,
      });
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
            allocations: allocations,
            header: {
              allocationMode: 'parallel',
              splitOrder: 1,
              plannedHours: totalHours,
            }
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

      const responseData = await response.json();
      const parentHeaderId = Number(responseData?.headerId || 0) || null;

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
        isHobbyTask,
        parentHeaderId
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
    isHobbyTask: boolean,
    parentHeaderId?: number | null
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

    const getChildPlanningHours = (childTask: Task): number => {
      const childEstimatedHours = parseFloat(String(childTask.EstimatedHours || 0));
      const descendantLeafTasks = getAllLeafTasks(childTask.Id).filter((leafTask) => Number(leafTask.Id) !== Number(childTask.Id));
      const descendantLeafHours = descendantLeafTasks.reduce((sum, leafTask) => {
        return sum + parseFloat(String(leafTask.EstimatedHours || 0));
      }, 0);

      if (descendantLeafHours > 0) {
        return descendantLeafHours;
      }

      return childEstimatedHours;
    };

    // Calculate total parent hours and total children estimated hours
    const totalParentHours = parentAllocations.reduce((sum, alloc) => sum + parseFloat(alloc.hours), 0);
    const totalChildrenHours = directChildren.reduce((sum, child) => sum + getChildPlanningHours(child), 0);
    
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
      const childHours = getChildPlanningHours(child);
      
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
            TaskAllocationHeaderId: parentHeaderId ?? null,
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
        await distributeToDirectChildren(child.Id, childAllocs, level + 1, plannedUserId, isHobbyTask, parentHeaderId);
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

  // Handle conflict modal - push forward existing tasks
  const handleConflictPushForward = async () => {
    const { task, userId, startDate, totalHoursToAllocate, hoursAlreadyWorked, maxDailyHours, isParentTask, leafTasks } = conflictModal;
    if (!task || !userId || !startDate) return;

    if (conflictModal.suppressDependentReplan) {
      await handleConflictPlanAvailable();
      return;
    }

    const user = users.find(u => u.Id === userId);
    if (!user) return;

    setConflictModal(prev => ({ ...prev, show: false }));

    // Show hours per day modal for confirmation
    const taskEstimatedHours = isParentTask && leafTasks 
      ? leafTasks.reduce((sum, t) => sum + parseFloat(String(t.EstimatedHours || 0)), 0)
      : parseFloat(String(task.EstimatedHours || 0));
    
    const normalizedTotalHoursToAllocate = roundToPlanningStep(totalHoursToAllocate);
    const normalizedMaxDailyHours = floorToPlanningStep(maxDailyHours);
    const sourceHeaderIdForConflict = conflictModal.sourceHeaderId;
    const storedConflictHoursPerDay = sourceHeaderIdForConflict
      ? Number(allAllocations.find(a => Number(a.TaskAllocationHeaderId) === Number(sourceHeaderIdForConflict))?.HoursPerDay ?? 0)
      : 0;
    const effectiveConflictHoursPerDay = storedConflictHoursPerDay > 0
      ? storedConflictHoursPerDay
      : normalizedMaxDailyHours;
    const normalizedConflictHoursPerDay = floorToPlanningStep(effectiveConflictHoursPerDay);
    setHoursPerDayModal({
      show: true,
      task,
      userId,
      startDate,
      maxDailyHours,
      hoursPerDay: normalizedConflictHoursPerDay.toString(),
      totalHours: normalizedTotalHoursToAllocate,
      hoursAlreadyWorked,
      totalEstimatedHours: taskEstimatedHours,
      isParentTask,
      leafTasks,
      usePushForward: true, // Flag to indicate we should use push-forward
      enableSplit: false,
      splitMode: 'parallel',
      splitEntries: [{
        userId,
        plannedHours: normalizedTotalHoursToAllocate,
        hoursPerDay: normalizedConflictHoursPerDay,
        splitOrder: 1,
        selectedLeafTaskIds: isParentTask && Array.isArray(leafTasks) ? leafTasks.map(t => t.Id) : [],
      }],
      sourceUserId: conflictModal.sourceUserId,
      sourceHeaderId: conflictModal.sourceHeaderId,
      sourceAllocationDates: conflictModal.sourceAllocationDates,
      suppressDependentReplan: conflictModal.suppressDependentReplan,
    });
  };

  // Handle conflict modal - plan when available (use available slots)
  const handleConflictPlanAvailable = async () => {
    const { task, userId, startDate, totalHoursToAllocate, hoursAlreadyWorked, maxDailyHours, isParentTask, leafTasks } = conflictModal;
    if (!task || !userId || !startDate) return;

    const user = users.find(u => u.Id === userId);
    if (!user) return;

    setConflictModal(prev => ({ ...prev, show: false }));

    // Show hours per day modal:
    // – always for parent tasks (user must confirm hours, split, leaf assignments)
    // – always when totalHoursToAllocate is 0 (no estimated hours set — user must specify)
    // – when hours already worked or remaining hours exceed 50% of daily capacity
    if (isParentTask || totalHoursToAllocate <= 0 || hoursAlreadyWorked > 0 || totalHoursToAllocate > maxDailyHours * 0.5) {
            const sourceHeaderIdForConflict = conflictModal.sourceHeaderId;
            const storedConflictHoursPerDay = sourceHeaderIdForConflict
              ? (allAllocations.find(a => Number(a.TaskAllocationHeaderId) === Number(sourceHeaderIdForConflict))?.HoursPerDay ?? null)
              : null;
            const effectiveConflictHoursPerDay = (storedConflictHoursPerDay && storedConflictHoursPerDay > 0)
              ? storedConflictHoursPerDay
              : maxDailyHours;
      const normalizedConflictHoursPerDay = floorToPlanningStep(effectiveConflictHoursPerDay);
      const normalizedConflictTotalHours = roundToPlanningStep(totalHoursToAllocate);
      const taskEstimatedHours = isParentTask && leafTasks 
        ? leafTasks.reduce((sum, t) => sum + parseFloat(String(t.EstimatedHours || 0)), 0)
        : parseFloat(String(task.EstimatedHours || 0));
      setHoursPerDayModal({
        show: true,
        task,
        userId,
        startDate,
        maxDailyHours,
        hoursPerDay: normalizedConflictHoursPerDay.toString(),
        totalHours: normalizedConflictTotalHours,
        hoursAlreadyWorked,
        totalEstimatedHours: taskEstimatedHours,
        isParentTask,
        leafTasks,
        enableSplit: false,
        splitMode: 'parallel',
        splitEntries: [{
          userId,
          plannedHours: normalizedConflictTotalHours,
          hoursPerDay: normalizedConflictHoursPerDay,
          splitOrder: 1,
          selectedLeafTaskIds: isParentTask && Array.isArray(leafTasks) ? leafTasks.map(t => t.Id) : [],
        }],
        sourceUserId: conflictModal.sourceUserId,
        sourceHeaderId: conflictModal.sourceHeaderId,
        sourceAllocationDates: conflictModal.sourceAllocationDates,
        suppressDependentReplan: conflictModal.suppressDependentReplan,
      });
    } else {
      // Directly allocate using available hours
      if (isParentTask && leafTasks) {
        await executeParentTaskAllocation(task, userId, startDate, totalHoursToAllocate, user, maxDailyHours, leafTasks);
      } else {
        const allocationResult = await executeTaskAllocation(task, userId, startDate, totalHoursToAllocate, user, maxDailyHours, {
          skipReload: true,
          suppressDependentReplan: !!conflictModal.suppressDependentReplan,
          appendToExistingUserSlice: !!conflictModal.sourceUserId, // Always true for slice ops to preserve existing allocations
          excludeHeaderId: conflictModal.sourceHeaderId ?? undefined,
        });
        const sourceUserId = conflictModal.sourceUserId;
        const sourceHeaderId = conflictModal.sourceHeaderId;
        const sourceAllocationDates = conflictModal.sourceAllocationDates || [];
        if (allocationResult && sourceUserId && sourceAllocationDates.length > 0) {
          if (sourceHeaderId) {
            await deleteTaskAllocationHeaderSlice(sourceHeaderId);
          } else {
            await deleteTaskUserAllocationDates(task.Id, sourceUserId, sourceAllocationDates);
          }
        }
        if (projects.length > 0) {
          await loadAllProjectsTasks(projects);
          await loadAllAllocations();
        }
      }
    }
  };

  // Handle confirmation from hours per day modal
  const handleHoursPerDayConfirm = async () => {
    const { task, userId, startDate, totalHours, hoursPerDay, maxDailyHours, isParentTask, leafTasks, usePushForward, enableSplit, splitMode, splitEntries, sourceUserId, sourceHeaderId, sourceAllocationDates, suppressDependentReplan } = hoursPerDayModal;
    if (!task || !userId || !startDate) return;

    const user = users.find(u => u.Id === userId);
    if (!user) return;

    const normalizedTotalHours = roundToPlanningStep(Number(totalHours || 0));
    const normalizedHoursPerDayInput = roundToPlanningStep(Number(hoursPerDay || 0));
    const canUseSplitPlanning = !!enableSplit && !usePushForward && !sourceUserId && !sourceHeaderId && !suppressDependentReplan;

    if (canUseSplitPlanning) {

      const entries = Array.isArray(splitEntries)
        ? splitEntries
            .map((entry, index) => ({
              userId: Number(entry.userId),
              plannedHours: roundToPlanningStep(Number(entry.plannedHours || 0)),
              hoursPerDay: roundToPlanningStep(Number(entry.hoursPerDay || 0)),
              splitOrder: Number(entry.splitOrder || index + 1),
              selectedLeafTaskIds: Array.isArray(entry.selectedLeafTaskIds)
                ? entry.selectedLeafTaskIds.map((taskId) => Number(taskId)).filter((taskId) => Number.isFinite(taskId) && taskId > 0)
                : [],
            }))
            .filter((entry) => Number.isFinite(entry.userId) && entry.userId > 0 && entry.plannedHours > 0)
        : [];

      if (entries.length === 0) {
        showAlert('Split Planning', 'Add at least one user split with planned hours.');
        return;
      }

      if (isParentTask) {
        if (!Array.isArray(leafTasks) || leafTasks.length === 0) {
          showAlert('Split Planning', 'No subtasks found for this parent task.');
          return;
        }

        const validLeafIds = new Set(leafTasks.map((leafTask) => leafTask.Id));
        const selectedTaskOwner = new Map<number, number>();

        for (const entry of entries) {
          if (!entry.selectedLeafTaskIds || entry.selectedLeafTaskIds.length === 0) {
            showAlert('Split Planning', 'Select at least one subtask for each split user entry.');
            return;
          }

          for (const leafTaskId of entry.selectedLeafTaskIds) {
            if (!validLeafIds.has(leafTaskId)) {
              showAlert('Split Planning', `Invalid subtask selected (ID: ${leafTaskId}).`);
              return;
            }

            if (selectedTaskOwner.has(leafTaskId) && selectedTaskOwner.get(leafTaskId) !== entry.userId) {
              const leafTaskName = leafTasks.find((leafTask) => leafTask.Id === leafTaskId)?.TaskName || `Task #${leafTaskId}`;
              showAlert('Split Planning', `Subtask "${leafTaskName}" is assigned to multiple users. Assign each subtask to only one user.`);
              return;
            }

            selectedTaskOwner.set(leafTaskId, entry.userId);
          }
        }

        const unassignedLeafTasks = leafTasks.filter((leafTask) => !selectedTaskOwner.has(leafTask.Id));
        if (unassignedLeafTasks.length > 0) {
          showAlert(
            'Split Planning',
            `Assign all subtasks before planning. Unassigned: ${unassignedLeafTasks.map((leafTask) => leafTask.TaskName).join(', ')}`
          );
          return;
        }
      }

      setHoursPerDayModal(prev => ({ ...prev, show: false }));

      if (isParentTask && Array.isArray(leafTasks) && leafTasks.length > 0) {
        try {
          // Clean previous parent + child allocations before rebuilding split plan
          await fetch(`${getApiUrl()}/api/task-allocations/task/${task.Id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          await fetch(`${getApiUrl()}/api/task-child-allocations/parent/${task.Id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
        } catch (error) {
          console.error('Failed to clear previous parent split allocations:', error);
        }

        const mode = splitMode || 'parallel';
        let sequenceDate = new Date(startDate);

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

        for (const entry of entries.sort((a, b) => a.splitOrder - b.splitOrder)) {
          const targetUser = users.find((candidate) => Number(candidate.Id) === Number(entry.userId));
          if (!targetUser) {
            continue;
          }

          const taskIds = Array.isArray(entry.selectedLeafTaskIds) ? entry.selectedLeafTaskIds : [];
          const selectedLeafTasks = leafTasks
            .filter((leafTask) => taskIds.includes(leafTask.Id))
            .sort((a, b) => {
              const orderA = Number(a.DisplayOrder);
              const orderB = Number(b.DisplayOrder);
              const safeOrderA = Number.isFinite(orderA) ? orderA : 0;
              const safeOrderB = Number.isFinite(orderB) ? orderB : 0;
              if (safeOrderA !== safeOrderB) {
                return safeOrderA - safeOrderB;
              }
              return a.Id - b.Id;
            });

          const entryStartDate = mode === 'sequential' ? new Date(sequenceDate) : new Date(startDate);
          const parentSliceResult = await executeTaskAllocation(
            task,
            entry.userId,
            new Date(entryStartDate),
            roundToPlanningStep(entry.plannedHours),
            targetUser,
            entry.hoursPerDay > 0 ? roundToPlanningStep(entry.hoursPerDay) : floorToPlanningStep(maxDailyHours),
            {
              silent: true,
              skipReload: true,
              appendToExistingUserSlice: true,
              header: {
                allocationMode: mode,
                splitOrder: entry.splitOrder,
                plannedHours: entry.plannedHours,
                hoursPerDay: entry.hoursPerDay > 0 ? roundToPlanningStep(entry.hoursPerDay) : floorToPlanningStep(maxDailyHours),
              },
            }
          );

          if (!parentSliceResult || !Array.isArray(parentSliceResult.allocations) || parentSliceResult.allocations.length === 0) {
            showAlert('Error', `Failed to allocate parent slice for ${targetUser.FirstName || targetUser.Username || `User ${targetUser.Id}`}.`);
            return;
          }

          const leafWithRemainingHours = await Promise.all(
            selectedLeafTasks.map(async (selectedLeafTask) => ({
              leafTask: selectedLeafTask,
              remainingHours: await getTaskRemainingHours(selectedLeafTask),
            }))
          );

          const totalParentSliceHours = parentSliceResult.allocations.reduce((sum, allocation) => sum + Number(allocation.hours || 0), 0);
          const hoursToDistribute = Math.max(0, Math.min(entry.plannedHours, totalParentSliceHours));

          const weightedLeafTasks = (() => {
            const positiveByRemaining = leafWithRemainingHours
              .filter((entryLeaf) => entryLeaf.remainingHours > 0)
              .map((entryLeaf) => ({ leafTask: entryLeaf.leafTask, weight: entryLeaf.remainingHours }));
            if (positiveByRemaining.length > 0) {
              return positiveByRemaining;
            }

            const positiveByEstimated = leafWithRemainingHours
              .map((entryLeaf) => ({
                leafTask: entryLeaf.leafTask,
                weight: parseFloat(String(entryLeaf.leafTask.EstimatedHours || 0)),
              }))
              .filter((entryLeaf) => entryLeaf.weight > 0);
            if (positiveByEstimated.length > 0) {
              return positiveByEstimated;
            }

            return leafWithRemainingHours.map((entryLeaf) => ({
              leafTask: entryLeaf.leafTask,
              weight: 1,
            }));
          })();

          if (weightedLeafTasks.length > 0 && hoursToDistribute > 0.0001) {
            const totalWeight = weightedLeafTasks.reduce((sum, entryLeaf) => sum + entryLeaf.weight, 0);

            const quotas = weightedLeafTasks.map((entryLeaf, index) => {
              if (index === weightedLeafTasks.length - 1) {
                return {
                  leafTask: entryLeaf.leafTask,
                  quotaHours: 0,
                };
              }

              const proportionalHours = totalWeight > 0
                ? (hoursToDistribute * entryLeaf.weight) / totalWeight
                : 0;

              return {
                leafTask: entryLeaf.leafTask,
                quotaHours: Number(proportionalHours.toFixed(2)),
              };
            });

            const allocatedBeforeLast = quotas.reduce((sum, quota) => sum + quota.quotaHours, 0);
            if (quotas.length > 0) {
              const lastIndex = quotas.length - 1;
              quotas[lastIndex] = {
                ...quotas[lastIndex],
                quotaHours: Number(Math.max(0, hoursToDistribute - allocatedBeforeLast).toFixed(2)),
              };
            }

            const allocationSlots = parentSliceResult.allocations
              .map((allocation) => ({
                date: allocation.date,
                remainingHours: Number(allocation.hours || 0),
                cursorMinutes: parseTimeToMinutes(allocation.startTime || '09:00'),
              }))
              .filter((slot) => slot.remainingHours > 0.0001);

            let slotIndex = 0;
            const childAllocationsPayload: Array<{
              ParentTaskId: number;
              ChildTaskId: number;
              TaskAllocationHeaderId?: number | null;
              AllocationDate: string;
              AllocatedHours: number;
              Level: number;
              StartTime: string;
              EndTime: string;
            }> = [];

            for (const quota of quotas) {
              let remainingQuota = quota.quotaHours;
              while (remainingQuota > 0.0001 && slotIndex < allocationSlots.length) {
                const slot = allocationSlots[slotIndex];
                const hoursToAllocate = Math.min(remainingQuota, slot.remainingHours);
                if (hoursToAllocate <= 0.0001) {
                  slotIndex++;
                  continue;
                }

                const allocationMinutes = Math.max(1, Math.round(hoursToAllocate * 60));
                const allocatedHours = Number((allocationMinutes / 60).toFixed(2));
                const startMinutes = slot.cursorMinutes;
                const endMinutes = startMinutes + allocationMinutes;

                childAllocationsPayload.push({
                  ParentTaskId: task.Id,
                  ChildTaskId: quota.leafTask.Id,
                  TaskAllocationHeaderId: parentSliceResult.headerId ?? null,
                  AllocationDate: slot.date,
                  AllocatedHours: allocatedHours,
                  Level: Math.max(1, getTaskDepthLevel(quota.leafTask, task.Id) + 1),
                  StartTime: formatMinutesToTime(startMinutes),
                  EndTime: formatMinutesToTime(endMinutes),
                });

                remainingQuota = Math.max(0, remainingQuota - allocatedHours);
                slot.remainingHours = Math.max(0, slot.remainingHours - allocatedHours);
                slot.cursorMinutes = endMinutes;

                if (slot.remainingHours <= 0.0001) {
                  slotIndex++;
                }
              }
            }

            if (childAllocationsPayload.length > 0) {
              const childAllocationsSaveRes = await fetch(`${getApiUrl()}/api/task-child-allocations/batch`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ allocations: childAllocationsPayload, replaceParent: false }),
              });

              if (!childAllocationsSaveRes.ok) {
                showAlert('Error', `Failed to distribute selected subtasks for ${targetUser.FirstName || targetUser.Username || `User ${targetUser.Id}`}.`);
                return;
              }
            }
          }

          if (mode === 'sequential' && parentSliceResult.endDate) {
            const nextStartDate = new Date(`${parentSliceResult.endDate}T12:00:00`);
            nextStartDate.setDate(nextStartDate.getDate() + 1);
            sequenceDate = nextStartDate;
          }
        }

        if (projects.length > 0) {
          await loadAllProjectsTasks(projects);
          await loadAllAllocations();
        }

        showAlert('Success', 'Parent task subtasks planned across selected users successfully.');
        return;
      }

      try {
        await fetch(`${getApiUrl()}/api/task-allocations/task/${task.Id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        console.error('Failed to clear previous split allocations:', error);
      }

      let sequenceDate = new Date(startDate);
      for (const entry of entries.sort((a, b) => a.splitOrder - b.splitOrder)) {
        const targetUser = users.find((candidate) => Number(candidate.Id) === Number(entry.userId));
        if (!targetUser) {
          continue;
        }

        const result = await executeTaskAllocation(
          task,
          entry.userId,
          sequenceDate,
          roundToPlanningStep(entry.plannedHours),
          targetUser,
          entry.hoursPerDay > 0 ? roundToPlanningStep(entry.hoursPerDay) : floorToPlanningStep(maxDailyHours),
          {
            silent: true,
            skipReload: true,
            appendToExistingUserSlice: true,
            header: {
              allocationMode: splitMode || 'parallel',
              splitOrder: entry.splitOrder,
              plannedHours: entry.plannedHours,
              hoursPerDay: entry.hoursPerDay > 0 ? roundToPlanningStep(entry.hoursPerDay) : floorToPlanningStep(maxDailyHours),
            },
          }
        );

        if (!result) {
          showAlert('Error', `Failed to allocate split for ${targetUser.FirstName || targetUser.Username || `User ${targetUser.Id}`}.`);
          return;
        }

        if ((splitMode || 'parallel') === 'sequential' && result.endDate) {
          const nextStart = new Date(`${result.endDate}T12:00:00`);
          nextStart.setDate(nextStart.getDate() + 1);
          sequenceDate = nextStart;
        }
      }

      if (projects.length > 0) {
        await loadAllProjectsTasks(projects);
        await loadAllAllocations();
      }

      showAlert('Success', 'Task planned across multiple users successfully.');
      return;
    }

    // Use the parsed value, capped at the actual daily capacity (not a fixed 8h fallback)
    if (!canUseSplitPlanning && (!Number.isFinite(normalizedTotalHours) || normalizedTotalHours <= 0)) {
      showAlert('Planning Hours', 'Enter planned hours greater than 0.');
      return;
    }

    const cappedHoursPerDay = floorToPlanningStep(Math.min(
      normalizedHoursPerDayInput > 0 ? normalizedHoursPerDayInput : maxDailyHours,
      maxDailyHours
    ));
    const maxHoursPerDay = cappedHoursPerDay > 0 ? cappedHoursPerDay : PLANNING_HOUR_STEP;
    
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
              newTaskHours: normalizedTotalHours,
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
        const isParentSliceReplan = !!sourceHeaderId && !!sourceUserId && (sourceAllocationDates || []).length > 0;

        if (isParentSliceReplan) {
          const parentSliceResult = await executeTaskAllocation(task, userId, startDate, normalizedTotalHours, user, maxHoursPerDay, {
            skipReload: true,
            suppressDependentReplan: !!suppressDependentReplan,
            appendToExistingUserSlice: true,
            excludeHeaderId: sourceHeaderId,
            header: {
              hoursPerDay: maxHoursPerDay,
            },
          });

          if (!parentSliceResult || !Array.isArray(parentSliceResult.allocations) || parentSliceResult.allocations.length === 0) {
            showAlert('Error', 'Failed to replan selected parent slice.');
            return;
          }

          const childAllocationsPayload = buildChildAllocationPayloadFromSourceSlice(
            task.Id,
            Number(sourceHeaderId),
            parentSliceResult.headerId ?? null,
            parentSliceResult.allocations,
            sourceAllocationDates || []
          );

          if (childAllocationsPayload.length > 0) {
            const childAllocationsSaveRes = await fetch(`${getApiUrl()}/api/task-child-allocations/batch`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ allocations: childAllocationsPayload, replaceParent: false }),
            });

            if (!childAllocationsSaveRes.ok) {
              showAlert('Error', 'Failed to distribute subtasks for selected slice.');
              return;
            }
          }

          await deleteChildAllocationHeaderSlice(Number(sourceHeaderId));

          await deleteTaskAllocationHeaderSlice(sourceHeaderId!);

          if (projects.length > 0) {
            await loadAllProjectsTasks(projects);
            await loadAllAllocations();
          }
        } else {
          await executeParentTaskAllocation(task, userId, startDate, normalizedTotalHours, user, maxHoursPerDay, leafTasks);
        }
      } else {
        const allocationResult = await executeTaskAllocation(task, userId, startDate, normalizedTotalHours, user, maxHoursPerDay, {
          skipReload: true,
          suppressDependentReplan: !!suppressDependentReplan,
          appendToExistingUserSlice: !!sourceUserId, // Always true for slice ops to preserve existing allocations
          excludeHeaderId: sourceHeaderId ?? undefined,
          header: {
            hoursPerDay: maxHoursPerDay,
          },
        });
        if (allocationResult && sourceUserId && (sourceAllocationDates || []).length > 0) {
          if (sourceHeaderId) {
            await deleteTaskAllocationHeaderSlice(sourceHeaderId);
          } else {
            await deleteTaskUserAllocationDates(task.Id, sourceUserId, sourceAllocationDates || []);
          }
        }
        if (projects.length > 0) {
          await loadAllProjectsTasks(projects);
          await loadAllAllocations();
        }
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
    maxHoursPerDay: number,
    options?: {
      silent?: boolean;
      skipReload?: boolean;
      suppressDependentReplan?: boolean;
      appendToExistingUserSlice?: boolean;
      excludeHeaderId?: number | null;
      header?: {
        allocationMode?: 'parallel' | 'sequential';
        splitOrder?: number;
        plannedHours?: number;
        hoursPerDay?: number;
      };
    }
  ): Promise<{ startDate: string | null; endDate: string | null; headerId?: number | null; allocations?: { date: string; hours: number; startTime: string; endTime: string }[] } | null> => {
    try {
      const normalizedRemainingHoursToWork = roundToPlanningStep(remainingHoursToWork);
      const normalizedMaxHoursPerDay = floorToPlanningStep(maxHoursPerDay);
      if (!Number.isFinite(normalizedRemainingHoursToWork) || normalizedRemainingHoursToWork <= 0) {
        if (!options?.silent) {
          showAlert('Allocation Error', 'Planned hours must use 30-minute steps and be greater than 0.');
        }
        return null;
      }
      if (!Number.isFinite(normalizedMaxHoursPerDay) || normalizedMaxHoursPerDay <= 0) {
        if (!options?.silent) {
          showAlert('Allocation Error', 'Hours per day must use 30-minute steps and be greater than 0.');
        }
        return null;
      }

      // Show planning progress modal
      if (!options?.silent) {
        setPlanningProgress({
          show: true,
          taskName: task.TaskName,
          progress: 0,
          currentStep: 'Checking user availability...',
          totalHours: normalizedRemainingHoursToWork,
          allocatedHours: 0,
          daysProcessed: 0,
        });
      }

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
      const estimatedDays = Math.ceil(normalizedRemainingHoursToWork / effectiveAvgForTask);
      // Use 5x multiplier to account for existing allocations consuming availability
      const windowDaysForTask = Math.max(Math.ceil(estimatedDays * 5), 365); // At least 1 year
      const preliminaryEndDate = new Date(startDate);
      preliminaryEndDate.setDate(preliminaryEndDate.getDate() + Math.min(windowDaysForTask, 5475)); // Cap at 15 years
      
      const availabilityQuery = new URLSearchParams({
        startDate: startDate.toISOString().split('T')[0],
        endDate: preliminaryEndDate.toISOString().split('T')[0],
        isHobby: String(isHobby),
      });
      if (options?.excludeHeaderId) {
        // Slice drag: exclude only this specific header's allocations from availability calculation.
        // This correctly handles moving a slice to an earlier date where the source dates would
        // otherwise appear as "already booked" and block the new placement.
        availabilityQuery.set('excludeHeaderId', String(options.excludeHeaderId));
      } else if (!options?.appendToExistingUserSlice) {
        availabilityQuery.set('excludeTaskId', String(task.Id));
      }

      const availabilityRes = await fetch(
        `${getApiUrl()}/api/task-allocations/availability/${userId}?${availabilityQuery.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!availabilityRes.ok) {
        if (!options?.silent) {
          showAlert('Error', 'Failed to check user availability');
        }
        return null;
      }

      const availabilityData = await availabilityRes.json();
      const availability = availabilityData.availability;

      if (!options?.silent) {
        setPlanningProgress(prev => ({
          ...prev,
          progress: 20,
          currentStep: 'Calculating allocation schedule...',
        }));
      }

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
      
      // Pre-compute Outlook-blocked hours per date for this user (non-all-day events only)
      const outlookBlockedHoursByDate = new Map<string, number>();
      for (const evt of outlookTimelineEvents) {
        if (Number(evt.userId) !== userId || evt.isAllDay) continue;
        const evtDateStr = normalizeDateKey(evt.start);
        if (!evtDateStr) continue;
        const startMs = new Date(evt.start).getTime();
        const endMs = new Date(evt.end).getTime();
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
        const durationHours = (endMs - startMs) / 3600000;
        outlookBlockedHoursByDate.set(evtDateStr, (outlookBlockedHoursByDate.get(evtDateStr) || 0) + durationHours);
      }

      while (remainingHours > 0 && daysProcessed < maxDaysToProcess) {
        const dateStr = currentDate.toISOString().split('T')[0];

        if (isUserHoliday(userId, dateStr)) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        const dayAvailability = availability.find((a: any) => a.date === dateStr);
        // Reduce available hours by time blocked by Outlook calendar events
        if (dayAvailability) {
          const outlookBlocked = outlookBlockedHoursByDate.get(dateStr) || 0;
          dayAvailability.availableHours = Math.max(0, dayAvailability.availableHours - outlookBlocked);
        }
        
        if (dayAvailability && dayAvailability.availableHours > 0) {
          // Get start time for this day - use hobby or work start depending on task type
          const dayOfWeek = currentDate.getDay();
          const dayName = WEEK_DAYS[dayOfWeek];
          const startKey = isHobby ? `HobbyStart${dayName}` as keyof User : `WorkStart${dayName}` as keyof User;
          const defaultStartTime = (user[startKey] as string) || (isHobby ? '19:00' : '09:00');
          
          // If there are existing allocations, start from their end time.
          // Exception: when placing an independent new slice (excludeHeaderId is set), the
          // allocation header owns its own time window and should start from work-day start
          // so it uses full remaining capacity rather than appending after existing slices.
          let effectiveStartTime = defaultStartTime;
          if (dayAvailability.latestEndTime && !options?.excludeHeaderId) {
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
          const rawHoursToAllocate = Math.min(remainingHours, dayAvailability.availableHours, normalizedMaxHoursPerDay, dayMaxHours, remainingWindowHours);
          const hoursToAllocate = floorToPlanningStep(rawHoursToAllocate);
          
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
                hours: roundToPlanningStep(hoursBeforeLunch),
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
                hours: roundToPlanningStep(hoursAfterLunch),
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
                hours: roundToPlanningStep(hoursToAllocate),
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
              hours: roundToPlanningStep(hoursToAllocate),
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
        if (!options?.silent) {
          setPlanningProgress(prev => ({ ...prev, show: false }));
          showAlert('Allocation Error', `Task requires too many work days (${daysProcessed}) to allocate. Please review estimated hours or user availability.`);
        }
        return null;
      }

      if (allocations.length === 0) {
        if (!options?.silent) {
          setPlanningProgress(prev => ({ ...prev, show: false }));
          showAlert('Allocation Error', 'Unable to allocate task - no available hours found in the next year');
        }
        return null;
      }

      if (remainingHours > 0) {
        if (!options?.silent) {
          setPlanningProgress(prev => ({ ...prev, show: false }));
          showAlert('Partial Allocation', `Unable to fully allocate task - ${remainingHours.toFixed(2)}h remaining. User doesn't have enough availability in the next year.`);
        }
        return null;
      }

      const plannedEndDate = getLatestAllocationDate(allocations);
      if (!validateMandatoryDueDateForPlan(task, plannedEndDate)) {
        if (!options?.silent) {
          setPlanningProgress(prev => ({ ...prev, show: false }));
        }
        return null;
      }

      if (!options?.silent) {
        setPlanningProgress(prev => ({
          ...prev,
          progress: 80,
          currentStep: 'Saving allocations...',
        }));
      }

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
            allocations,
            suppressDependentReplan: !!options?.suppressDependentReplan,
            appendToExistingUserSlice: !!options?.appendToExistingUserSlice,
            header: {
              allocationMode: options?.header?.allocationMode || 'parallel',
              splitOrder: options?.header?.splitOrder,
              plannedHours: roundToPlanningStep(options?.header?.plannedHours ?? normalizedRemainingHoursToWork),
              hoursPerDay: roundToPlanningStep(options?.header?.hoursPerDay ?? normalizedMaxHoursPerDay),
            }
          })
        }
      );

      if (!saveRes.ok) {
        if (!options?.silent) {
          setPlanningProgress(prev => ({ ...prev, show: false }));
          showAlert('Error', 'Failed to save task allocation');
        }
        return null;
      }

      const saveData = await saveRes.json();

      const plannedStartDate = allocations.length > 0 ? allocations[0].date : null;

      if (!options?.silent) {
        setPlanningProgress(prev => ({
          ...prev,
          progress: 100,
          currentStep: 'Refreshing view...',
        }));
      }

      // Reload tasks and allocations to reflect changes
      if (!options?.skipReload && projects.length > 0) {
        await loadAllProjectsTasks(projects);
        await loadAllAllocations();
      }
      
      // Close modal after short delay to show completion
      if (!options?.silent) {
        setTimeout(() => {
          setPlanningProgress(prev => ({ ...prev, show: false }));
        }, 500);
      }

      return {
        startDate: plannedStartDate,
        endDate: plannedEndDate,
        headerId: Number(saveData?.headerId || 0) || null,
        allocations,
      };
    } catch (err) {
      console.error('Failed to allocate task:', err);
      if (!options?.silent) {
        setPlanningProgress(prev => ({ ...prev, show: false }));
        showAlert('Error', 'Failed to allocate task');
      }
      return null;
    }
  };

  const handleReplanAllocationHeader = async (params: {
    headerId: number;
    taskId: number;
    userId: number;
    startDate: string;
    totalHours: number;
    hoursPerDay: number;
    header: {
      AllocationMode?: string;
      SplitOrder?: number | null;
    };
  }) => {
    const { headerId, taskId, userId, startDate, totalHours, hoursPerDay, header } = params;

    const task = tasks.find((entry) => Number(entry.Id) === Number(taskId));
    if (!task) {
      throw new Error('Task not found');
    }

    const hasChildren = tasks.some((entry) => Number(entry.ParentTaskId) === Number(task.Id));
    if (hasChildren) {
      throw new Error('Replanning parent task slices from this modal is not supported yet. Use the planning actions for parent tasks.');
    }

    const planningUser = users.find((entry) => Number(entry.Id) === Number(userId));
    if (!planningUser) {
      throw new Error('User not found');
    }

    const maxHoursPerDay = Number(hoursPerDay || 0);
    if (!Number.isFinite(maxHoursPerDay) || maxHoursPerDay <= 0) {
      throw new Error('Hours per day must be greater than 0');
    }

    const startDateObj = new Date(`${startDate}T12:00:00`);
    if (Number.isNaN(startDateObj.getTime())) {
      throw new Error('Invalid start date');
    }

    const allocationResult = await executeTaskAllocation(
      task,
      userId,
      startDateObj,
      totalHours,
      planningUser,
      maxHoursPerDay,
      {
        skipReload: true,
        appendToExistingUserSlice: true,
        excludeHeaderId: headerId,
        header: {
          allocationMode: header.AllocationMode === 'sequential' ? 'sequential' : 'parallel',
          splitOrder: header.SplitOrder ?? undefined,
          plannedHours: totalHours,
          hoursPerDay: maxHoursPerDay,
        },
      }
    );

    if (!allocationResult) {
      throw new Error('Failed to replan allocation slice');
    }

    await deleteTaskAllocationHeaderSlice(headerId);

    if (projects.length > 0) {
      await loadAllProjectsTasks(projects);
    }
    await loadAllAllocations();
  };


  const getPriorityColor = (task: Task) => {
    if (task.PriorityColor) return '';
    return 'bg-gray-300';
  };

  // Priority border color (hex) for inline styles - uses PriorityColor from API
  const getPriorityBorderHex = (task: Task): string => {
    return mapColor(task.PriorityColor || '#d1d5db');
  };

  // Calculate daily totals for a specific user using actual allocations
  const getUserDailyTotals = (userId: number, days: Date[]) => {
    const totals: { [dateStr: string]: { work: number; hobby: number; recurring: number; outlook: number } } = {};
    
    days.forEach(day => {
      const dateStr = getDateKeyFromDate(day);
      totals[dateStr] = { work: 0, hobby: 0, recurring: 0, outlook: 0 };
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

    // Add Outlook calendar event blocked hours (non-all-day events only)
    const userOutlookEvts = outlookTimelineEvents.filter(ev => Number(ev.userId) === userId && !ev.isAllDay);
    userOutlookEvts.forEach(ev => {
      const startMs = new Date(ev.start).getTime();
      const endMs = new Date(ev.end).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;
      const durationHours = (endMs - startMs) / 3600000;
      // Use local date from the UTC-parsed Date object
      const evtDate = new Date(ev.start);
      const dateStr = getDateKeyFromDate(evtDate);
      if (totals[dateStr] !== undefined) {
        totals[dateStr].outlook += durationHours;
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

    const hours = roundToPlanningStep(parseFloat(manualAllocationModal.allocatedHours));
    if (isNaN(hours) || hours <= 0 || !isPlanningStepValue(hours)) {
      showAlert('Error', 'Hours must be greater than 0 and use 30-minute steps (0.5h).');
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

  // ── Slice suggested hours ─────────────────────────────────────────────────
  // MUST be declared before any early return to satisfy Rules of Hooks.
  const sliceSuggestedHours = useMemo(() => {
    const sourceHeaderId = hoursPerDayModal.sourceHeaderId;
    if (!sourceHeaderId) return null;

    const sourceDates = new Set((hoursPerDayModal.sourceAllocationDates || []).map((date) => String(date).split('T')[0]));
    const headerAllocations = allAllocations.filter((allocation) => Number(allocation.TaskAllocationHeaderId) === Number(sourceHeaderId));
    const relevantAllocations = sourceDates.size > 0
      ? headerAllocations.filter((allocation) => sourceDates.has(String(allocation.AllocationDate).split('T')[0]))
      : headerAllocations;

    const totalSliceHours = roundToPlanningStep(relevantAllocations.reduce((sum, allocation) => sum + Number(allocation.AllocatedHours || 0), 0));
    return totalSliceHours > 0 ? totalSliceHours : null;
  }, [hoursPerDayModal.sourceHeaderId, hoursPerDayModal.sourceAllocationDates, allAllocations]);
  const defaultSuggestedHours = roundToPlanningStep(Math.max(0, hoursPerDayModal.totalEstimatedHours - hoursPerDayModal.hoursAlreadyWorked));
  const suggestedPlanningHours = sliceSuggestedHours ?? defaultSuggestedHours;
  // ─────────────────────────────────────────────────────────────────────────

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
  const firstTimelineDateKey = timelineColumns.length > 0 ? getDateKeyFromDate(timelineColumns[0].start) : '';
  const lastTimelineDateKey = timelineColumns.length > 0 ? getDateKeyFromDate(timelineColumns[timelineColumns.length - 1].end) : '';
  const timelineMinWidth =
    useFixedPixelColumns
      ? fixedTimelineTotalWidthPx
      : viewMode === 'week'
      ? Math.max(1600, 192 + timelineDaysWidthPx)
      : 1200;
  const getBarStyleFromIndices = (startIndex: number, endIndex: number) => {
    const clampedStart = Math.max(0, Math.min(timelineColumns.length - 1, startIndex));
    const clampedEnd = Math.max(clampedStart, Math.min(timelineColumns.length - 1, endIndex));
    const duration = clampedEnd - clampedStart + 1;

    return {
      left: useFixedPixelColumns
        ? `${clampedStart * dayColumnWidthPx}px`
        : `${(clampedStart / Math.max(1, timelineColumns.length)) * 100}%`,
      width: useFixedPixelColumns
        ? `${duration * dayColumnWidthPx}px`
        : `${(duration / Math.max(1, timelineColumns.length)) * 100}%`,
    };
  };
  const getTimelineRangePosition = (startDateValue?: string | null, endDateValue?: string | null) => {
    if (!startDateValue || !endDateValue || timelineColumns.length === 0) return null;

    const parseDate = (value: string) => {
      const dateOnly = String(value).split('T')[0];
      const parsed = new Date(`${dateOnly}T12:00:00`);
      parsed.setHours(0, 0, 0, 0);
      return parsed;
    };

    const normalizedStart = parseDate(startDateValue);
    const normalizedEnd = parseDate(endDateValue);
    if (Number.isNaN(normalizedStart.getTime()) || Number.isNaN(normalizedEnd.getTime())) {
      return null;
    }

    const rangeStart = normalizedStart <= normalizedEnd ? normalizedStart : normalizedEnd;
    const rangeEnd = normalizedStart <= normalizedEnd ? normalizedEnd : normalizedStart;

    const overlapsColumn = (column: TimelineColumn) => {
      const columnStart = new Date(column.start);
      const columnEnd = new Date(column.end);
      columnStart.setHours(0, 0, 0, 0);
      columnEnd.setHours(0, 0, 0, 0);
      return rangeStart <= columnEnd && rangeEnd >= columnStart;
    };

    const startIndex = timelineColumns.findIndex(overlapsColumn);
    if (startIndex === -1) return null;

    let endIndex = startIndex;
    for (let index = startIndex; index < timelineColumns.length; index++) {
      if (overlapsColumn(timelineColumns[index])) {
        endIndex = index;
      }
    }

    return {
      startIndex,
      endIndex,
      ...getBarStyleFromIndices(startIndex, endIndex),
    };
  };
  const isGanttLoading = isLoadingData || loadingAllocations;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDateKey = getDateKeyFromDate(today);
  const todayIndex = timelineColumns.findIndex((column) => {
    const columnStart = new Date(column.start);
    const columnEnd = new Date(column.end);
    columnStart.setHours(0, 0, 0, 0);
    columnEnd.setHours(0, 0, 0, 0);
    return today >= columnStart && today <= columnEnd;
  });
  const normalizedGanttSearch = ganttSearch.trim().toLowerCase();
  const isGanttSearchActive = normalizedGanttSearch.length > 0;
  const isResourceGrouping = ganttGroupBy === 'resource';
  const availableGanttUsers = users.filter((planningUser) => Number(planningUser.Id) > 0);
  const allGanttUserIds = availableGanttUsers.map((planningUser) => Number(planningUser.Id));
  const normalizedSelectedGanttUserIds = selectedGanttUserIds.includes(GANTT_NONE_SELECTED)
    ? []
    : selectedGanttUserIds.length === 0
      ? allGanttUserIds
      : selectedGanttUserIds.filter((id) => allGanttUserIds.includes(id));
  const selectedGanttUserIdSet = new Set(normalizedSelectedGanttUserIds);
  const visibleGanttUsers = availableGanttUsers.filter((planningUser) => selectedGanttUserIdSet.has(Number(planningUser.Id)));
  const isGanttNoneSelected = selectedGanttUserIds.includes(GANTT_NONE_SELECTED);
  const isAllGanttUsersSelected =
    !isGanttNoneSelected
    && availableGanttUsers.length > 0
    && normalizedSelectedGanttUserIds.length === availableGanttUsers.length;

  const toggleGanttUserSelection = (targetUserId: number) => {
    setSelectedGanttUserIds((previousSelectedIds) => {
      const currentSelection = previousSelectedIds.includes(GANTT_NONE_SELECTED)
        ? []
        : previousSelectedIds.length === 0
          ? [...allGanttUserIds]
          : previousSelectedIds.filter((id) => allGanttUserIds.includes(id));

      const nextSelection = currentSelection.includes(targetUserId)
        ? currentSelection.filter((id) => id !== targetUserId)
        : [...currentSelection, targetUserId];

      if (nextSelection.length === 0) {
        return [GANTT_NONE_SELECTED];
      }

      if (nextSelection.length >= allGanttUserIds.length) {
        return [];
      }

      return nextSelection;
    });
  };

  const toggleGanttUserSelectAll = () => {
    if (isAllGanttUsersSelected) {
      setSelectedGanttUserIds([GANTT_NONE_SELECTED]);
      return;
    }
    setSelectedGanttUserIds([]);
  };

  const resetGanttUserSelectionToAll = () => {
    setSelectedGanttUserIds([]);
  };

  const closeOutlookActionModal = () => {
    setShowOutlookActionModal(false);
    setSelectedOutlookEvent(null);
  };

  const handleOpenOutlookEvent = () => {
    if (selectedOutlookEvent?.webLink) {
      window.open(selectedOutlookEvent.webLink, '_blank', 'noopener,noreferrer');
    }
    closeOutlookActionModal();
  };

  const handleStartOutlookCallTimer = async () => {
    if (!selectedOutlookEvent || !token) return;

    setIsStartingOutlookTimer(true);
    try {
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await fetch(`${getApiUrl()}/api/timers/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timerType: 'callRecord',
          callType: 'Teams',
          subject: selectedOutlookEvent.subject || null,
          clientTimezone,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to start call timer');
      }
      window.dispatchEvent(new CustomEvent('timer-changed'));
      showToast({ type: 'success', message: 'Call timer started' });
      closeOutlookActionModal();
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to start call timer',
      });
    } finally {
      setIsStartingOutlookTimer(false);
    }
  };

  const formatOutlookEventDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatOutlookEventTimeRange = (event: PlannerOutlookEvent) => {
    if (event.isAllDay) return 'All day';
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
    return `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

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
  const isProjectActive = (project: Project | undefined) => {
    if (!project) return false;
    return !(Number(project.StatusIsClosed || 0) === 1 || Number(project.StatusIsCancelled || 0) === 1);
  };
  const unassignedTasks = isResourceGrouping ? getTasksForUser(null) : [];
  const visibleUnassignedTasks = unassignedTasks.filter(matchesGanttSearch);
  const groupedGanttRows = (() => {
    if (isResourceGrouping) return [] as { id: string; label: string; subLabel: string; tasks: Task[] }[];

    const grouped = new Map<string, { id: string; label: string; subLabel: string; tasks: Task[] }>();
    const parentTasks = tasks.filter((t) => {
      if (t.ParentTaskId) return false;
      const hasPlannedDates = !!(t.PlannedStartDate && t.PlannedEndDate);
      const isRenderableClosedUnscheduled = isClosedUnscheduledWithAnchor(t);
      const unscheduledRenderDates = getUnscheduledRenderDates(t);
      if (isTaskClosedOrCancelled(t) && !isRenderableClosedUnscheduled && !hasPlannedDates) return false;
      const isAssignedUnscheduled = isRenderableUnscheduledTask(t) && hasAnyTaskAssignee(t);
      const hasUnscheduledDescendants = hasUnscheduledAssignedDescendant(t.Id);
      const hasClosedOrTransitionAnchors = unscheduledRenderDates.length > 0;
      if (!(hasPlannedDates || isAssignedUnscheduled || hasUnscheduledDescendants || hasClosedOrTransitionAnchors) || !matchesGanttSearch(t)) return false;

      const project = projects.find((projectItem) => projectItem.Id === t.ProjectId);
      if (!isProjectActive(project)) return false;

      return !!getTaskPosition(t, timelineColumns, {
        useFixedPixelColumns,
        columnWidthPx: dayColumnWidthPx,
      });
    });

    for (const task of parentTasks) {
      const project = projects.find((projectItem) => projectItem.Id === task.ProjectId);

      if (ganttGroupBy === 'project') {
        const projectName = project?.ProjectName || `Project #${task.ProjectId}`;
        const key = `project-${task.ProjectId}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            id: key,
            label: projectName,
            subLabel: project?.CustomerName ? `Customer: ${project.CustomerName}` : 'No customer',
            tasks: [],
          });
        }
        grouped.get(key)!.tasks.push(task);
      } else {
        const customerName = task.CustomerName || project?.CustomerName || 'No Customer';
        const key = `customer-${customerName.toLowerCase()}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            id: key,
            label: customerName,
            subLabel: 'Customer',
            tasks: [],
          });
        }
        grouped.get(key)!.tasks.push(task);
      }
    }

    return Array.from(grouped.values())
      .map((group) => ({ ...group, tasks: group.tasks.sort((a, b) => a.TaskName.localeCompare(b.TaskName)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })();
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
  const projectById = new Map(projects.map((project) => [Number(project.Id), project]));
  const isDateOutsideCurrentTimeline = (dateKey: string) => {
    if (!firstTimelineDateKey || !lastTimelineDateKey) return true;
    return dateKey < firstTimelineDateKey || dateKey > lastTimelineDateKey;
  };
  const focusTimelineDate = (dateKey: string) => {
    const parsedDate = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(parsedDate.getTime())) {
      return;
    }

    const nextViewStartDate = new Date(parsedDate);
    nextViewStartDate.setHours(0, 0, 0, 0);
    nextViewStartDate.setDate(nextViewStartDate.getDate() - 2);
    setViewStartDate(nextViewStartDate);

    if (viewMode === 'custom') {
      const visibleSpanDays = Math.max(1, days.length);
      const nextCustomStartDate = new Date(nextViewStartDate);
      nextCustomStartDate.setHours(12, 0, 0, 0);
      const nextCustomEndDate = new Date(nextCustomStartDate);
      nextCustomEndDate.setDate(nextCustomEndDate.getDate() + visibleSpanDays - 1);
      setCustomStartDate(formatDateForInput(nextCustomStartDate));
      setCustomEndDate(formatDateForInput(nextCustomEndDate));
    }
  };
  const overdueMilestones = projectMilestones
    .map((milestone) => {
      const dueDate = normalizeDateKey(milestone.DueDate);
      if (!dueDate) return null;

      const dueDateValue = new Date(`${dueDate}T00:00:00`);
      if (Number.isNaN(dueDateValue.getTime())) return null;

      const daysOverdue = Math.max(1, Math.round((today.getTime() - dueDateValue.getTime()) / 86400000));
      const project = projectById.get(Number(milestone.ProjectId));

      return {
        milestone,
        dueDate,
        dueDateValue,
        daysOverdue,
        projectName: project?.ProjectName || `Project #${milestone.ProjectId}`,
        projectCustomerName: project?.CustomerName || '',
        isOutsideCurrentTimeline: isDateOutsideCurrentTimeline(dueDate),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => {
      return !!entry
        && Number(entry.milestone.IsCompleted || 0) !== 1
        && entry.dueDate < todayDateKey;
    })
    .sort((a, b) => {
      const dateDiff = a.dueDateValue.getTime() - b.dueDateValue.getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.projectName.localeCompare(b.projectName) || a.milestone.Name.localeCompare(b.milestone.Name);
    });
  const overdueMilestonesPreview = overdueMilestones.slice(0, 5);
  const overdueMilestonesOutsideTimelineCount = overdueMilestones.filter((entry) => entry.isOutsideCurrentTimeline).length;

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

            {(isLoadingOutlookCalendar || overdueMilestones.length > 0) && (
              <div className="bg-amber-50/60 dark:bg-amber-900/10 border-b border-amber-200/50 dark:border-amber-800/30 px-4 py-2 space-y-2">
                {isLoadingOutlookCalendar && (
                  <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent dark:border-amber-400 dark:border-t-transparent" aria-hidden="true" />
                    <span>Still loading Outlook calendar…</span>
                  </div>
                )}

                {overdueMilestones.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowOverdueDetails(!showOverdueDetails)}
                      className="flex items-center gap-2 text-sm hover:opacity-75 transition-opacity"
                    >
                      <span className="text-amber-700 dark:text-amber-600">⚠️</span>
                      <span className="font-medium text-amber-800 dark:text-amber-300">
                        {overdueMilestones.length} overdue milestone{overdueMilestones.length === 1 ? '' : 's'}
                      </span>
                      <svg className={`w-4 h-4 text-amber-600 dark:text-amber-400 transition-transform ${showOverdueDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7-7-7 7" />
                      </svg>
                    </button>

                    {showOverdueDetails && (
                      <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                        {overdueMilestonesPreview.map((entry) => (
                          <div key={`overdue-milestone-${entry.milestone.Id}`} className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded bg-white/50 dark:bg-gray-800/30 hover:bg-white/80 dark:hover:bg-gray-800/50 transition-colors">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-gray-900 dark:text-white truncate">{entry.milestone.Name}</div>
                              <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                {entry.projectName} • {entry.daysOverdue}d overdue
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button 
                                type="button"
                                onClick={() => { setActiveTab('gantt'); focusTimelineDate(entry.dueDate); }}
                                className="px-2 py-0.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors"
                                title="Show in Gantt"
                              >
                                Show
                              </button>
                              <button
                                type="button"
                                onClick={() => void openMilestoneEditor(entry.milestone)}
                                className="px-2 py-0.5 text-xs bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded transition-colors"
                                title="Edit milestone"
                              >
                                ✎
                              </button>
                            </div>
                          </div>
                        ))}
                        {overdueMilestones.length > overdueMilestonesPreview.length && (
                          <div className="text-xs text-amber-700 dark:text-amber-400 py-1 px-2">
                            +{overdueMilestones.length - overdueMilestonesPreview.length} more
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

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
            {!isResourceGrouping && ganttGroupBy !== 'time-entries' && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-700 p-3">
                <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 text-sm">
                  <span>ℹ️</span>
                  <span className="font-medium">Customer/Project views are visualization-only. Planning drag-and-drop is available in Resource view.</span>
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
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Group By:
                </label>
                <select
                  value={ganttGroupBy}
                  onChange={(e) => setGanttGroupBy(e.target.value as 'resource' | 'customer' | 'project' | 'time-entries')}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  title="Choose how rows are grouped in Gantt"
                >
                  <option value="resource">Resource</option>
                  <option value="customer">Customer</option>
                  <option value="project">Project</option>
                  <option value="time-entries">Time Entries</option>
                </select>
              </div>

              <div className="flex items-center gap-2"> 
                <div className="relative" ref={ganttViewOptionsRef}>
                  <button
                    onClick={() => setShowGanttViewOptions((prev) => !prev)}
                    className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors inline-flex items-center gap-2"
                    title="Gantt view options"
                    aria-label="Gantt view options"
                  >
                    ⚙️ View Options
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showGanttViewOptions && (
                    <div className="absolute right-0 mt-1 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-[120] p-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showDependencyLines}
                          onChange={(e) => setShowDependencyLines(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                        />
                        Show dependencies
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showCriticalPath}
                          onChange={(e) => setShowCriticalPath(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                        />
                        Show critical path
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showBaseline}
                          onChange={(e) => setShowBaseline(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                        />
                        Show baseline
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showGanttTotals}
                          onChange={(e) => setShowGanttTotals(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                        />
                        Show daily totals
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showTaskBarHours}
                          onChange={(e) => setShowTaskBarHours(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                        />
                        Show task bar hours
                      </label>
                      {ganttGroupBy !== 'time-entries' && (
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showTimeEntriesOverlay}
                            onChange={(e) => setShowTimeEntriesOverlay(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-green-600 focus:ring-green-500 bg-white dark:bg-gray-700"
                          />
                          Show time entries
                        </label>
                      )}
                      {isResourceGrouping && (
                        <>
                          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Users to render</span>
                              <button
                                type="button"
                                onClick={resetGanttUserSelectionToAll}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                All users
                              </button>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer mb-1">
                              <input
                                type="checkbox"
                                checked={isAllGanttUsersSelected}
                                onChange={toggleGanttUserSelectAll}
                                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                              />
                              Select all users
                            </label>
                            <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
                              {availableGanttUsers.map((planningUser) => {
                                const userId = Number(planningUser.Id);
                                const isSelected = selectedGanttUserIdSet.has(userId);
                                const userLabel = planningUser.FirstName && planningUser.LastName
                                  ? `${planningUser.FirstName} ${planningUser.LastName}`
                                  : planningUser.Username;

                                return (
                                  <label
                                    key={planningUser.Id}
                                    className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleGanttUserSelection(userId)}
                                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                                    />
                                    <span className="truncate" title={userLabel}>{userLabel}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={togglePlanningTools}
                  className={`p-2 rounded transition-colors ${showPlanningTools ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                  title={showPlanningTools ? 'Collapse planning tools' : 'Expand planning tools'}
                  aria-label={showPlanningTools ? 'Collapse planning tools' : 'Expand planning tools'}
                >
                  <svg className={`w-5 h-5 transition-transform ${showPlanningTools ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Planning Tools expandable row */}
            {showPlanningTools && (
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 flex items-center gap-3 flex-wrap">
                {/* Existing action buttons */}
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
                              if (res.ok) successCount++; else failCount++;
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
                    className="h-8 px-3 rounded text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-purple-50 dark:hover:bg-purple-900/30 hover:border-purple-400 transition-colors"
                    title="Snapshot current planned dates as baseline for all visible projects"
                  >
                    📐 Set Baseline
                  </button>
                )}
                <button
                  onClick={openSnapshotModal}
                  className="h-8 px-3 rounded text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-400 transition-colors"
                  title="Manage allocation snapshots"
                >
                  📸 Manage Snapshots
                </button>

                <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

                {/* Snapshot overlay selector */}
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Overlay:</span>
                {isLoadingToolbarSnapshots ? (
                  <span className="text-xs text-gray-400 italic">Loading…</span>
                ) : (
                  <select
                    value={selectedSnapshotId ?? ''}
                    onChange={(e) => handleSelectSnapshot(e.target.value ? Number(e.target.value) : null)}
                    className="h-8 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 max-w-xs"
                  >
                    <option value="">— none —</option>
                    {toolbarSnapshots.map((s: any) => (
                      <option key={s.Id} value={s.Id}>
                        {s.Name} ({new Date(s.CreatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})
                      </option>
                    ))}
                  </select>
                )}
                {isLoadingSnapshotOverlay && (
                  <svg className="animate-spin w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {selectedSnapshotId !== null && snapshotOverlayData && !isLoadingSnapshotOverlay && (
                  <span className="text-xs text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded px-2 py-0.5">
                    Overlay active — amber ghost bars shown in Gantt
                  </span>
                )}
                {selectedSnapshotId !== null && (
                  <button
                    onClick={handleRestoreSelectedSnapshot}
                    className="h-8 px-3 rounded text-sm bg-amber-600 hover:bg-amber-700 text-white transition-colors inline-flex items-center gap-1.5"
                    title="Restore this snapshot, replacing all current allocations"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Restore
                  </button>
                )}
                {selectedSnapshotId !== null && (
                  <button
                    onClick={handleClearSnapshotOverlay}
                    className="h-8 w-8 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
                    title="Clear snapshot overlay"
                    aria-label="Clear overlay"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-auto">
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
                <div className="sticky top-0 z-[30]">
                  {/* Month header */}
                  {timelineColumns.length > 0 && (
                    <div className="flex border-b-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800">
                      <div className="w-48 min-w-48 max-w-48 flex-none sticky left-0 z-[40] bg-gray-100 dark:bg-gray-800 p-2 font-semibold text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700">
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
                    <div className="w-48 min-w-48 max-w-48 flex-none sticky left-0 z-[40] bg-gray-50 dark:bg-gray-700 p-3 font-semibold text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700">
                      {ganttGroupBy === 'resource' ? 'User' : ganttGroupBy === 'customer' ? 'Customer' : ganttGroupBy === 'time-entries' ? 'User' : 'Project'}
                    </div>
                    <div className="flex-1 flex" style={useFixedPixelColumns ? { minWidth: `${timelineDaysWidthPx}px` } : undefined}>
                      {timelineColumns.map((column, idx) => {
                        return (
                          <div
                            key={idx}
                            className={`${useFixedPixelColumns ? 'flex-shrink-0' : 'flex-1'} p-1 text-center text-[10px] border-r border-gray-200 dark:border-gray-700 ${
                              column.isWeekend
                                ? 'bg-gray-200 dark:bg-gray-600/70'
                                : ''
                            } ${useAnnualStyleDensity && column.isMonthStart ? 'bg-blue-50 dark:bg-blue-900/20' : ''} ${
                              idx === todayIndex ? 'border-l-2 border-l-red-400/70 dark:border-l-red-400/60' : ''
                            }`}
                            style={useFixedPixelColumns ? { overflow: 'hidden', width: `${dayColumnWidthPx}px` } : { overflow: 'hidden' }}
                          >
                            {column.header && (
                              <>
                                <div
                                  className={`font-semibold leading-tight truncate flex items-center justify-center mx-auto ${
                                    idx === todayIndex
                                      ? 'bg-red-500 text-white rounded-full min-w-[18px] w-auto px-1 h-[18px] text-[10px]'
                                      : 'text-gray-900 dark:text-white'
                                  }`}
                                  style={{ fontSize: useAnnualStyleDensity && idx !== todayIndex ? '9px' : undefined }}
                                >
                                  {idx === todayIndex ? column.start.getDate() : column.header}
                                </div>
                                {column.subheader && (
                                  <div
                                    className={`leading-tight truncate ${
                                      idx === todayIndex
                                        ? 'text-red-500 dark:text-red-400 font-semibold'
                                        : 'text-gray-600 dark:text-gray-400'
                                    }`}
                                    style={{ fontSize: useAnnualStyleDensity ? '9px' : undefined }}
                                  >
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
                            column.isWeekend ? 'bg-gray-100 dark:bg-gray-700/45' : ''
                          } ${
                            idx === todayIndex ? 'border-l-2 border-l-red-400/70 dark:border-l-red-400/60' : ''
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
                      const isOverdueMilestone = !isCompletedMilestone && dueDate < todayDateKey;
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
                          onClick={() => openMilestoneEditor(milestone)}
                          className={`absolute h-4 rounded text-white text-[10px] px-1.5 flex items-center cursor-pointer hover:opacity-100 ${
                            isOverdueMilestone ? 'ring-2 ring-red-400/80 dark:ring-red-300/80' : ''
                          }`}
                          style={{
                            left,
                            width,
                            top: `${milestoneRowPadding + sameDayOffset * milestoneLaneHeight}px`,
                            zIndex: 2,
                            backgroundColor: milestoneColor,
                            opacity: isCompletedMilestone ? 0.7 : 0.9,
                          }}
                          title={(() => {
                            const customerLabel = projects.find((p) => Number(p.Id) === Number(milestone.ProjectId))?.CustomerName;
                            const lines = ['Click to edit milestone', '', projectName];
                            if (customerLabel) lines.push(`Customer: ${customerLabel}`);
                            lines.push(milestone.Name, `Type: ${milestone.MilestoneTypeName || 'No type'}`, `Due: ${new Date(`${dueDate}T12:00:00`).toLocaleDateString()}`);
                            lines.push(isCompletedMilestone ? 'Status: Completed' : isOverdueMilestone ? `Status: Open (Overdue by ${Math.max(1, Math.round((today.getTime() - new Date(`${dueDate}T00:00:00`).getTime()) / 86400000))} days)` : 'Status: Open');
                            return lines.join('\n');
                          })()}
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
                {isResourceGrouping && visibleUnassignedTasks.length > 0 && (
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
                              column.isWeekend ? 'bg-gray-100 dark:bg-gray-700/45' : ''
                            } ${
                              idx === todayIndex ? 'border-l-2 border-l-red-400/70 dark:border-l-red-400/60' : ''
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
                        const plannedStartDate = normalizeDateOnly(parentTask.PlannedStartDate);
                        const plannedEndDate = normalizeDateOnly(parentTask.PlannedEndDate);
                        const canResizeTask = !!(
                          isResourceGrouping &&
                          permissions?.canPlanTasks &&
                          !isGanttSearchActive &&
                          plannedStartDate &&
                          plannedEndDate
                        );
                        const canResizeStart = !!(canResizeTask && plannedStartDate >= firstTimelineDateKey);
                        const canResizeEnd = !!(canResizeTask && plannedEndDate <= lastTimelineDateKey);
                        const isResizingTask =
                          taskResizeState.task?.Id === parentTask.Id &&
                          taskResizeState.resizeHeaderId === null;
                        const previewBarStyle = position && isResizingTask
                          ? getBarStyleFromIndices(taskResizeState.currentStartIndex, taskResizeState.currentEndIndex)
                          : null;
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
                        const parentIssueRef = parentTask.JiraIssueKey || parentTask.ExternalTicketId || parentTask.ExternalIssueId
                          || (parentTask.TicketNumber ? `#${parentTask.TicketNumber}` : null)
                          || (parentTask.GitHubIssueNumber ? `#${parentTask.GitHubIssueNumber}` : null)
                          || (parentTask.GiteaIssueNumber ? `#${parentTask.GiteaIssueNumber}` : null)
                          || null;
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
                            onDragStart={(e) => handleDragStart(e, parentTask, null)}
                            onDragEnd={handleDragEnd}
                            onContextMenu={(e) => handleTaskContextMenu(e, parentTask, null)}
                            onClick={(e) => {
                              if (shouldSuppressTaskClick()) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              if (hasSubtasks && !e.ctrlKey && !e.metaKey) {
                                openSubtasksModal(parentTask);
                                return;
                              }
                              void handleTaskClick(parentTask);
                            }}
                            className={`absolute h-6 rounded ${!statusColor ? getPriorityColor(parentTask) : ''} opacity-75 hover:opacity-100 ${permissions?.canPlanTasks && !isGanttSearchActive ? 'cursor-move' : 'cursor-pointer'} flex items-center text-white text-xs px-2 transition-all ${isResizingTask ? 'ring-2 ring-blue-400 ring-offset-1 shadow-lg' : ''} ${activeTimerGlowIds.has(parentTask.Id) ? 'timer-active-glow' : otherActiveTimerGlowIds.has(parentTask.Id) ? 'timer-active-glow-other' : ''}`}
                            style={{
                              left: previewBarStyle?.left || (position ? position.left : '0%'),
                              width: previewBarStyle?.width || (position ? position.width : `${(Math.min(5, Math.max(1, timelineColumns.length)) / Math.max(1, timelineColumns.length)) * 100}%`),
                              top: `${4 + row * 24}px`,
                              ...(statusColor ? { backgroundColor: statusColor } : {}),
                              borderLeft: `4px solid ${priorityBorderHex}`,
                              zIndex: isResizingTask ? 40 : undefined,
                            }}
                            title={parentTooltip}
                          >
                            {position && canResizeStart && isShiftResizeMode && (
                              <div
                                role="button"
                                aria-label={`Resize start date for ${parentTask.TaskName}`}
                                onMouseDown={(e) => handleTaskResizeHandleMouseDown(e, parentTask, 'start', position.startIndex, position.startIndex + position.duration - 1)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l bg-black/20 hover:bg-black/35"
                                title="Hold Shift and drag to resize start"
                              />
                            )}
                            <TaskTypeIconMark
                              name={parentTask.TaskTypeName}
                              iconSvg={parentTask.TaskTypeIconSvg}
                              color={parentTask.TaskTypeColor}
                              className="w-3 h-3 shrink-0 mr-1"
                            />
                            {taskIsHobbyProject && (
                              <span className="mr-1 bg-purple-700 text-white text-[9px] px-1 py-0.5 rounded font-semibold flex-shrink-0 pointer-events-none">HOBBY</span>
                            )}
                            {parentIssueRef && (
                              <span className="mr-1 bg-black/30 text-white text-[9px] px-1 py-0.5 rounded font-bold flex-shrink-0 pointer-events-none">{parentIssueRef}</span>
                            )}
                            <span className="truncate flex-1 pointer-events-none flex items-center gap-1 min-w-0">
                              {!hasEstimatedHours && <span className="mr-1">⚠️</span>}
                              {hasSubtasks && <span className="mr-1">📁</span>}
                              {hasDependency ? '🔗 ' : ''}
                              {parentTask.TaskName}
                            </span>
                            {hasSubtasks && (
                              <span className="ml-1 text-[10px] bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-1.5 py-0.5 rounded font-semibold pointer-events-none">
                                {subtaskCount}
                              </span>
                            )}
                            {position && canResizeEnd && isShiftResizeMode && (
                              <div
                                role="button"
                                aria-label={`Resize end date for ${parentTask.TaskName}`}
                                onMouseDown={(e) => handleTaskResizeHandleMouseDown(e, parentTask, 'end', position.startIndex, position.startIndex + position.duration - 1)}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-black/20 hover:bg-black/35"
                                title="Hold Shift and drag to resize end"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* User rows */}
                {isResourceGrouping && visibleGanttUsers.map(userRow => {
                  const tasksById = new Map(tasks.map((task) => [task.Id, task]));
                  const parentTaskIdsFromAllocations = new Set<number>();

                  allAllocations
                    .filter((allocation) => allocation.UserId === userRow.Id)
                    .forEach((allocation) => {
                      const allocationTask = tasksById.get(allocation.TaskId);
                      if (!allocationTask) {
                        return;
                      }

                      let currentTask: Task | undefined = allocationTask;
                      while (currentTask?.ParentTaskId) {
                        currentTask = tasksById.get(currentTask.ParentTaskId);
                      }
                      if (currentTask && !currentTask.ParentTaskId) {
                        parentTaskIdsFromAllocations.add(currentTask.Id);
                      }
                    });

                  const parentTasksWithDates = tasks.filter((task) => {
                    if (task.ParentTaskId) return false;

                    const plannedForUserByAllocations = parentTaskIdsFromAllocations.has(task.Id);
                    const isRenderableClosedUnscheduled = isClosedUnscheduledWithAnchor(task);
                    if (isTaskClosedOrCancelled(task) && !isRenderableClosedUnscheduled && !plannedForUserByAllocations) return false;

                    const isUnscheduledAssigned = isRenderableUnscheduledTask(task)
                      && hasAnyTaskAssignee(task)
                      ;
                    const unscheduledAssigned = isRenderableUnscheduledTask(task)
                      && isTaskAssignedToUser(task, Number(userRow.Id))
                      ;
                    if (isUnscheduledAssigned) {
                      return unscheduledAssigned && matchesGanttSearch(task);
                    }
                    if (hasUnscheduledAssignedDescendant(task.Id, Number(userRow.Id))) {
                      return matchesGanttSearch(task);
                    }
                    return plannedForUserByAllocations && matchesGanttSearch(task);
                  }).sort((a, b) => compareTasksForPlanningOrder(a, b, Number(userRow.Id)));
                  
                  // Build subtasks map with ALL descendants (multi-level)
                  const subtasksMap = new Map<number, Task[]>();
                  
                  parentTasksWithDates.forEach(parentTask => {
                    const parentUserSegments = getTaskUserAllocationSegments(parentTask.Id, userRow.Id);
                    const plannedLeafDescendants = getAllDescendantsRecursive(parentTask.Id)
                      .filter((descendant) => isLeafTask(descendant.Id))
                      .filter((descendant) => {
                        const hasUserAllocations = getTaskUserAllocationSegments(descendant.Id, userRow.Id).length > 0;
                        const hasMatchingChildAllocations = childAllocations.some((childAllocation) => {
                          if (Number(childAllocation.ParentTaskId) !== Number(parentTask.Id)) {
                            return false;
                          }
                          if (Number(childAllocation.ChildTaskId) !== Number(descendant.Id)) {
                            return false;
                          }

                          const allocationDate = normalizeDateKey(childAllocation.AllocationDate);
                          if (!allocationDate) {
                            return false;
                          }

                          return parentUserSegments.some((segment) => allocationDate >= segment.startDate && allocationDate <= segment.endDate);
                        });
                        const isUserUnscheduled = Number(descendant.UnscheduledWork || 0) === 1 && isTaskAssignedToUser(descendant, Number(userRow.Id));
                        const hasPlanning = hasUserAllocations || hasMatchingChildAllocations;

                        if (isTaskClosedOrCancelled(descendant) && !hasPlanning) {
                          return false;
                        }

                        return (hasPlanning || isUserUnscheduled) && matchesGanttSearch(descendant);
                      });

                    if (plannedLeafDescendants.length > 0) {
                      subtasksMap.set(parentTask.Id, plannedLeafDescendants);
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
                    const totals = { work: 0, hobby: 0, recurring: 0, outlook: 0 };
                    let workCapacity = 0;
                    let hobbyCapacity = 0;
                    let isOverAllocated = false;
                    const holidaySet = new Set<string>();
                    const devSupportSet = new Set<string>();

                    const cursor = new Date(column.start);
                    cursor.setHours(12, 0, 0, 0);
                    const end = new Date(column.end);
                    end.setHours(12, 0, 0, 0);

                    while (cursor <= end) {
                      const dateStr = getDateKeyFromDate(cursor);
                      const dayTotals = userDailyTotals[dateStr] || { work: 0, hobby: 0, recurring: 0, outlook: 0 };
                      totals.work += dayTotals.work;
                      totals.hobby += dayTotals.hobby;
                      totals.recurring += dayTotals.recurring;
                      totals.outlook += dayTotals.outlook || 0;

                      const dayCapacities = getDayCapacities(cursor);
                      workCapacity += dayCapacities.workCapacity;
                      hobbyCapacity += dayCapacities.hobbyCapacity;

                      const totalWorkUsed = dayTotals.work + dayTotals.recurring + (dayTotals.outlook || 0);
                      const dayOverAllocated =
                        (dayCapacities.workCapacity > 0 && totalWorkUsed > dayCapacities.workCapacity + 0.001) ||
                        (dayCapacities.hobbyCapacity > 0 && dayTotals.hobby > dayCapacities.hobbyCapacity + 0.001);
                      if (dayOverAllocated) {
                        isOverAllocated = true;
                      }

                      const holidayNames = getUserHolidayNames(userRow.Id, dateStr);
                      holidayNames.forEach((name) => holidaySet.add(name));

                      const devSupportLabels = getUserDevSupportLabels(userRow.Id, dateStr);
                      devSupportLabels.forEach((label) => devSupportSet.add(label));

                      cursor.setDate(cursor.getDate() + 1);
                    }

                    const holidayNames = Array.from(holidaySet);
                    const devSupportLabels = Array.from(devSupportSet);
                    return {
                      totals,
                      workCapacity,
                      hobbyCapacity,
                      isOverAllocated,
                      holidayNames,
                      devSupportLabels,
                      isHoliday: isBlockingUnavailableLabel(holidayNames),
                      isDevSupport: devSupportLabels.length > 0,
                      isWeekend: column.isWeekend,
                    };
                  };

                  const timelineColumnSummaries = timelineColumns.map(getTimelineColumnSummary);

                  // Separate parent tasks
                  const parentTasks = parentTasksWithDates;
                  
                  // Calculate maximum number of rows needed for this user's tasks
                  let maxRows = 1;
                  const taskRows: { task: Task; row: number; rowSpan: number; isSubtask: boolean; parentTask?: Task; subtaskIndex?: number; totalSubtasks?: number; level?: number }[] = [];
                  const taskRowSpanCache = new Map<number, number>();
                  const getTaskVisualRowSpan = (taskId: number): number => {
                    const cached = taskRowSpanCache.get(taskId);
                    if (cached) return cached;

                    const allocationSpan = Math.max(1, getTaskUserAllocationSegments(taskId, userRow.Id).length);
                    const currentTask = tasks.find((candidate) => Number(candidate.Id) === Number(taskId));

                    let unscheduledSpan = 0;
                    if (currentTask) {
                      const hasUnscheduledSelfForUser = Number(currentTask.UnscheduledWork || 0) === 1
                        && isTaskAssignedToUser(currentTask, Number(userRow.Id));
                      const hasUnscheduledChildForUser = hasUnscheduledAssignedDescendant(currentTask.Id, Number(userRow.Id));

                      if (hasUnscheduledSelfForUser || hasUnscheduledChildForUser) {
                        // Unscheduled render dates are spread horizontally across days, not stacked vertically.
                        unscheduledSpan = 1;
                      }
                    }

                    const span = Math.max(allocationSpan, unscheduledSpan, 1);
                    taskRowSpanCache.set(taskId, span);
                    return span;
                  };
                  
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
                    const parentRowSpan = getTaskVisualRowSpan(task.Id);
                    const allocationDates = getTaskUserAllocationDates(task.Id, userRow.Id) || getParentUserDescendantAllocationDates(task.Id, userRow.Id);
                    const hasAnyTaskAllocation = allAllocations.some((allocation) => allocation.TaskId === task.Id);
                    const hasUnscheduledSelfForUser = Number(task.UnscheduledWork || 0) === 1 && isTaskAssignedToUser(task, Number(userRow.Id));
                    const hasUnscheduledChildForUser = hasUnscheduledAssignedDescendant(task.Id, Number(userRow.Id));
                    const taskForPosition = allocationDates
                      ? { ...task, PlannedStartDate: allocationDates.startDate, PlannedEndDate: allocationDates.endDate }
                      : (hasUnscheduledSelfForUser || hasUnscheduledChildForUser)
                      ? task
                      : !hasAnyTaskAllocation && task.PlannedStartDate && task.PlannedEndDate
                      ? task
                      : null;

                    const position = taskForPosition
                      ? getTaskPosition(taskForPosition, timelineColumns, {
                          useFixedPixelColumns,
                          columnWidthPx: dayColumnWidthPx,
                          unscheduledUserId: Number(userRow.Id),
                        })
                      : null;

                    if (!position) {
                      console.log(`Parent task ${task.TaskName} has no position - skipping`);
                      return;
                    }

                    const taskStartIndex = position.startIndex;
                    const taskEndIndex = position.startIndex + position.duration - 1;

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
                      const otherAllocationDates = getTaskUserAllocationDates(otherTask.Id, userRow.Id) || getParentUserDescendantAllocationDates(otherTask.Id, userRow.Id);
                      const hasOtherTaskAllocation = allAllocations.some((allocation) => allocation.TaskId === otherTask.Id);
                      const otherHasUnscheduledSelfForUser = Number(otherTask.UnscheduledWork || 0) === 1 && isTaskAssignedToUser(otherTask, Number(userRow.Id));
                      const otherHasUnscheduledChildForUser = hasUnscheduledAssignedDescendant(otherTask.Id, Number(userRow.Id));
                      const otherTaskForPosition = otherAllocationDates
                        ? { ...otherTask, PlannedStartDate: otherAllocationDates.startDate, PlannedEndDate: otherAllocationDates.endDate }
                        : (otherHasUnscheduledSelfForUser || otherHasUnscheduledChildForUser)
                        ? otherTask
                        : !hasOtherTaskAllocation && otherTask.PlannedStartDate && otherTask.PlannedEndDate
                        ? otherTask
                        : null;
                      const otherPosition = otherTaskForPosition
                        ? getTaskPosition(otherTaskForPosition, timelineColumns, {
                            useFixedPixelColumns,
                            columnWidthPx: dayColumnWidthPx,
                            unscheduledUserId: Number(userRow.Id),
                          })
                        : null;
                      if (!otherPosition) continue;
                      const otherStartIndex = otherPosition.startIndex;
                      const otherEndIndex = otherPosition.startIndex + otherPosition.duration - 1;
                      const overlap = !(taskEndIndex < otherStartIndex || taskStartIndex > otherEndIndex);

                      if (overlap) {
                        const otherTaskRow = taskRows.find(tr => tr.task.Id === otherTask.Id);
                        if (otherTaskRow) {
                          // Count visible subtasks for the other task
                          const otherSubtasks = subtasksMap.get(otherTask.Id) || [];
                          const visibleSubtasks = otherSubtasks.filter(st => getTaskLevel(st.Id) <= maxVisibleLevel);
                          const extraRows = visibleSubtasks.reduce((sum, st) => sum + getTaskVisualRowSpan(st.Id), 0);
                          row = Math.max(row, otherTaskRow.row + (otherTaskRow.rowSpan || 1) + extraRows);
                        }
                      }
                    }

                    taskRows.push({ task, row, rowSpan: parentRowSpan, isSubtask: false });

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
                        const subtaskRowSpan = getTaskVisualRowSpan(subtask.Id);

                        // Only add subtask if within max visible level
                        if (level <= maxVisibleLevel) {
                          console.log(`  Adding subtask ${subtask.TaskName} at row ${row + parentRowSpan + subtaskOffset}, level ${level}`);
                          taskRows.push({
                            task: subtask,
                            row: row + parentRowSpan + subtaskOffset,
                            rowSpan: subtaskRowSpan,
                            isSubtask: true,
                            parentTask: task,
                            subtaskIndex: subIdx,
                            totalSubtasks: subtasks.length,
                            level: level
                          });
                          subtaskOffset += subtaskRowSpan;
                        } else {
                          console.log(`  Skipping subtask ${subtask.TaskName} at level ${level} (max: ${maxVisibleLevel})`);
                        }
                      });

                      maxRows = Math.max(maxRows, row + parentRowSpan + subtaskOffset);
                    } else {
                      maxRows = Math.max(maxRows, row + parentRowSpan);
                    }
                  });
                  
                  // Calculate row height based on max rows (parent tasks + subtasks)
                  // ROW_H doubles when snapshot overlay is active so ghost bars render in the bottom half of each row slot.
                  const ROW_H = snapshotOverlayData ? 48 : 24;
                  // Reserve a dedicated lane for recurring allocations so they don't overlap task bars.
                  const hasRecurringForUser = recurringAllocations.some((recurring) => recurring.UserId === userRow.Id);
                  const hasOutlookForUser = outlookTimelineEvents.some((outlookEvent) => Number(outlookEvent.userId) === Number(userRow.Id));
                  const recurringLaneHeight = hasRecurringForUser ? 18 : 0;
                  // Compute per-column lane indices for Outlook events so multiple events on the same day stack vertically.
                  const userOutlookEvents = outlookTimelineEvents.filter((ev) => Number(ev.userId) === Number(userRow.Id));
                  const outlookColLaneCounter = new Map<number, number>();
                  const outlookEventLanes = userOutlookEvents.map((ev) => {
                    const evDateStr = normalizeDateKey(ev.start);
                    const colIdx = timelineColumns.findIndex((col) => {
                      const s = getDateKeyFromDate(col.start);
                      const e = getDateKeyFromDate(col.end);
                      return evDateStr >= s && evDateStr <= e;
                    });
                    const laneIndex = outlookColLaneCounter.get(colIdx) || 0;
                    outlookColLaneCounter.set(colIdx, laneIndex + 1);
                    return { evId: ev.id, laneIndex };
                  });
                  const maxOutlookLanes = Math.max(1, ...Array.from(outlookColLaneCounter.values()));
                  const OUTLOOK_LANE_H = 20;
                  const outlookLaneHeight = hasOutlookForUser ? maxOutlookLanes * OUTLOOK_LANE_H + 4 : 0;
                  const recurringLaneTop = hasRecurringForUser ? Math.max(maxRows * ROW_H + 4, ROW_H) : 0;
                  const outlookLaneTop = hasOutlookForUser
                    ? Math.max(maxRows * ROW_H + 4 + recurringLaneHeight, ROW_H + recurringLaneHeight)
                    : 0;
                  const userTimeEntries = showTimeEntriesOverlay
                    ? plannerTimeEntries.filter((e: any) => Number(e.UserId) === Number(userRow.Id))
                    : [];
                  const userOverlayItems = userTimeEntries.map((entry: any) => {
                    const dateKey = String(entry.WorkDate).split('T')[0];
                    const colIdx = timelineColumns.findIndex((col) => getDateKeyFromDate(col.start) === dateKey);
                    const startTime = String(entry.StartTime || '00:00');
                    const [startHourRaw, startMinuteRaw] = startTime.split(':').map(Number);
                    const startMinuteOfDay = (Number.isFinite(startHourRaw) ? startHourRaw : 0) * 60
                      + (Number.isFinite(startMinuteRaw) ? startMinuteRaw : 0);
                    return {
                      entry,
                      dateKey,
                      colIdx,
                      startMinuteOfDay,
                    };
                  }).filter((item) => item.colIdx >= 0);
                  const sortedUserOverlayItems = [...userOverlayItems].sort((a, b) => (
                    a.colIdx - b.colIdx
                    || a.startMinuteOfDay - b.startMinuteOfDay
                    || String(a.entry.TaskName || a.entry.Subject || '').localeCompare(String(b.entry.TaskName || b.entry.Subject || ''))
                  ));
                  const userOverlayLaneCounter = new Map<number, number>();
                  const positionedUserOverlayItems = sortedUserOverlayItems.map((item) => {
                    const laneIndex = userOverlayLaneCounter.get(item.colIdx) || 0;
                    userOverlayLaneCounter.set(item.colIdx, laneIndex + 1);
                    return { ...item, laneIndex };
                  });
                  const maxUserOverlayLanes = positionedUserOverlayItems.reduce((max, item) => Math.max(max, item.laneIndex + 1), 0);
                  const timeEntriesLaneHeight = maxUserOverlayLanes > 0 ? (maxUserOverlayLanes * 18) + (Math.max(0, maxUserOverlayLanes - 1) * 2) + 4 : 0;
                  const timeEntriesLaneTop = userTimeEntries.length > 0
                    ? Math.max(maxRows * ROW_H + 4, ROW_H) + recurringLaneHeight + outlookLaneHeight
                    : 0;
                  const decimalHoursToHMSOverlay = (h: number) => {
                    const total = Math.round(Math.abs(h) * 3600);
                    const hh = Math.floor(total / 3600);
                    const mm = Math.floor((total % 3600) / 60);
                    const ss = total % 60;
                    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
                  };
                  const extraLanesHeight = recurringLaneHeight + outlookLaneHeight + timeEntriesLaneHeight;
                  const rowHeight = Math.max(maxRows * ROW_H + 8 + extraLanesHeight, 44 + extraLanesHeight);
                  
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
                            const isDevSupport = summary.isDevSupport;
                            const devSupportLabels = summary.devSupportLabels;
                            const dateKey = getDateKeyFromDate(column.start);
                            const showDayDropTarget = !!(
                              draggedTask &&
                              permissions?.canPlanTasks &&
                              hoveredDropCell?.userId === userRow.Id &&
                              hoveredDropCell?.dateKey === dateKey
                            );
                            return (
                              <div
                                key={idx}
                                className={`${useFixedPixelColumns ? 'flex-shrink-0' : 'flex-1'} border-r border-gray-200 dark:border-gray-700 relative ${
                                  isOverAllocated
                                    ? 'bg-red-50 dark:bg-red-900/20 cv-pattern-over-allocated'
                                    : isHoliday
                                    ? 'bg-amber-50 dark:bg-amber-900/20 cv-pattern-unavailable'
                                    : isDevSupport
                                    ? 'bg-indigo-100 dark:bg-indigo-900/40 ring-inset ring-1 ring-indigo-300/80 dark:ring-indigo-500/50 cv-pattern-dev-support'
                                    : summary.isWeekend
                                    ? 'bg-gray-100 dark:bg-gray-700/45'
                                    : ''
                                } ${idx === todayIndex ? 'border-l-2 border-l-red-400/70 dark:border-l-red-400/60' : ''}`}
                                style={useFixedPixelColumns ? { width: `${dayColumnWidthPx}px` } : undefined}
                                onDragEnter={(e) => {
                                  if (!draggedTask || !permissions?.canPlanTasks || ganttSearch.trim().length > 0) return;
                                  e.preventDefault();
                                  setHoveredDropCell({ userId: userRow.Id, dateKey });
                                }}
                                onDragLeave={() => {
                                  setHoveredDropCell((prev) => (
                                    prev?.userId === userRow.Id && prev?.dateKey === dateKey ? null : prev
                                  ));
                                }}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDropOnDay(e, column.start, userRow.Id)}
                                title={
                                  isHoliday
                                    ? `Unavailable: ${holidayNames.join(', ')}`
                                    : isDevSupport
                                    ? devSupportLabels.join(', ')
                                    : undefined
                                }
                              >
                                {showDayDropTarget && (
                                  <div className="absolute inset-1 rounded border-2 border-dashed border-blue-500 dark:border-blue-400 bg-blue-100/40 dark:bg-blue-900/30 pointer-events-none flex items-center justify-center">
                                    <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">Drop here</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {taskRows.map(({ task, row, isSubtask, parentTask, subtaskIndex, totalSubtasks, level }) => {
                          // For subtasks, try to use child allocations first, then fall back to own dates
                          let usesDerivedChildDates = false;
                          let displayedStartDate: string | null = null;
                          let displayedEndDate: string | null = null;
                          const isUnscheduledForUser = Number(task.UnscheduledWork || 0) === 1 && isTaskAssignedToUser(task, Number(userRow.Id));
                          const hasUnscheduledAssignedChildForUser = !isSubtask && hasUnscheduledAssignedDescendant(task.Id, Number(userRow.Id));
                          const userAllocationSegments = getTaskUserAllocationSegments(task.Id, userRow.Id);
                          const descendantDatesForParent = !isSubtask ? getParentUserDescendantAllocationDates(task.Id, userRow.Id) : null;
                          const hasAnyTaskAllocation = allAllocations.some((allocation) => allocation.TaskId === task.Id);
                          const hasLegacyTaskDates = !!(task.PlannedStartDate && task.PlannedEndDate);

                          const taskBarSegments: Array<{ headerId: number | null; startDate: string; endDate: string; source?: 'done' | 'openToday' | 'default' }> = [];

                          if (userAllocationSegments.length > 0) {
                            displayedStartDate = userAllocationSegments[0].startDate;
                            displayedEndDate = userAllocationSegments[userAllocationSegments.length - 1].endDate;
                            taskBarSegments.push(...userAllocationSegments);
                          } else if (isUnscheduledForUser || hasUnscheduledAssignedChildForUser) {
                            const unscheduledRenderDates = getUnscheduledRenderDates(task, Number(userRow.Id));

                            if (unscheduledRenderDates.length > 0) {
                              displayedStartDate = unscheduledRenderDates[0].startDate || unscheduledRenderDates[0].date;
                              displayedEndDate = unscheduledRenderDates[unscheduledRenderDates.length - 1].date;
                              unscheduledRenderDates.forEach((entry) => {
                                // 'done' bars: stretch back to when the cycle started (in-progress date)
                                const segmentStartDate = (entry.source === 'done' && entry.startDate && entry.startDate < entry.date)
                                  ? entry.startDate
                                  : entry.date;
                                // Update overall displayed start if this segment starts earlier
                                if (!displayedStartDate || segmentStartDate < displayedStartDate) {
                                  displayedStartDate = segmentStartDate;
                                }
                                // Open tasks tracking today get a 3-day visual span for readability
                                let segmentEndDate = entry.date;
                                if (entry.source === 'openToday') {
                                  const entryEndDate = new Date(`${entry.date}T12:00:00`);
                                  entryEndDate.setDate(entryEndDate.getDate() + 2);
                                  segmentEndDate = getDateKeyFromDate(entryEndDate);
                                  // Also extend the displayed end date
                                  if (!displayedEndDate || segmentEndDate > displayedEndDate) {
                                    displayedEndDate = segmentEndDate;
                                  }
                                }
                                taskBarSegments.push({ headerId: null, startDate: segmentStartDate, endDate: segmentEndDate, source: entry.source });
                              });
                            } else {
                              const anchorDate = getUnscheduledAnchorDate(task, Number(userRow.Id));
                              const endDate = new Date(anchorDate);
                              endDate.setDate(endDate.getDate() + 2);
                              displayedStartDate = getDateKeyFromDate(anchorDate);
                              displayedEndDate = getDateKeyFromDate(endDate);
                              taskBarSegments.push({ headerId: null, startDate: displayedStartDate, endDate: displayedEndDate });
                            }
                          } else if (!hasAnyTaskAllocation && hasLegacyTaskDates) {
                            displayedStartDate = normalizeDateOnly(task.PlannedStartDate);
                            displayedEndDate = normalizeDateOnly(task.PlannedEndDate);
                            if (displayedStartDate && displayedEndDate) {
                              taskBarSegments.push({ headerId: null, startDate: displayedStartDate, endDate: displayedEndDate });
                            }
                          } else if (!isSubtask && descendantDatesForParent) {
                            displayedStartDate = descendantDatesForParent.startDate;
                            displayedEndDate = descendantDatesForParent.endDate;
                            taskBarSegments.push({ headerId: null, startDate: descendantDatesForParent.startDate, endDate: descendantDatesForParent.endDate });
                          } else if (isSubtask && parentTask) {
                            // Try to get child task dates from allocations
                            const childDates = getChildTaskDates(task.Id);
                            
                            if (childDates) {
                              // Has child allocations - use them
                              usesDerivedChildDates = true;
                              displayedStartDate = childDates.startDate;
                              displayedEndDate = childDates.endDate;
                              taskBarSegments.push({ headerId: null, startDate: childDates.startDate, endDate: childDates.endDate });
                            } else if (task.PlannedStartDate && task.PlannedEndDate) {
                              // No child allocations but has own dates - use them
                              displayedStartDate = normalizeDateOnly(task.PlannedStartDate);
                              displayedEndDate = normalizeDateOnly(task.PlannedEndDate);
                              if (displayedStartDate && displayedEndDate) {
                                taskBarSegments.push({ headerId: null, startDate: displayedStartDate, endDate: displayedEndDate });
                              }
                            } else {
                              // No allocations and no dates - skip
                              return null;
                            }
                          } else {
                            return null;
                          }

                          const mergedTaskBarSegments = (() => {
                            const byKey = new Map<string, { headerId: number | null; startDate: string; endDate: string; source?: 'done' | 'openToday' | 'default' }>();

                            const sourceRank = (source?: 'done' | 'openToday' | 'default') => {
                              if (source === 'done') return 3;
                              if (source === 'openToday') return 2;
                              return 1;
                            };

                            taskBarSegments.forEach((segment) => {
                              const key = segment.source
                                ? `${segment.source}|${segment.startDate}|${segment.endDate}`
                                : `${segment.headerId ?? 'legacy'}|${segment.startDate}|${segment.endDate}`;
                              const existing = byKey.get(key);

                              if (!existing || sourceRank(segment.source) > sourceRank(existing.source)) {
                                byKey.set(key, segment);
                              }
                            });

                            return Array.from(byKey.values()).sort((a, b) => {
                              if (a.startDate !== b.startDate) {
                                return a.startDate.localeCompare(b.startDate);
                              }
                              if (a.endDate !== b.endDate) {
                                return a.endDate.localeCompare(b.endDate);
                              }
                              return Number(a.headerId ?? 0) - Number(b.headerId ?? 0);
                            });
                          })();

                          if (mergedTaskBarSegments.length === 0) {
                            return null;
                          }
                          
                          const taskIsHobbyProject = isTaskHobby(task);
                          const hasDependency = !!task.DependsOnTaskId;
                          const project = projects.find(p => p.Id === task.ProjectId);
                          const estimatedHours = task.EstimatedHours || 0;
                          const plannedHours = task.PlannedHours || 0;
                          const workedHours = task.WorkedHours || 0;
                          const remainingHours = Math.max(0, estimatedHours - workedHours);
                          const isOverPlanned = plannedHours > estimatedHours && estimatedHours > 0;
                          const isUnderPlanned = plannedHours < remainingHours && plannedHours > 0;
                          const planningCoverage = remainingHours > 0
                            ? `${((plannedHours / remainingHours) * 100).toFixed(0)}% of remaining`
                            : plannedHours > 0
                              ? 'Complete scope planned'
                              : 'No remaining hours';
                          const taskCustomerName = task.CustomerName || project?.CustomerName || null;
                          const taskJiraRef = task.ExternalTicketId || task.JiraIssueKey || null;
                          const taskIssueRef = task.JiraIssueKey || task.ExternalTicketId || task.ExternalIssueId
                            || (task.TicketNumber ? `#${task.TicketNumber}` : null)
                            || (task.GitHubIssueNumber ? `#${task.GitHubIssueNumber}` : null)
                            || (task.GiteaIssueNumber ? `#${task.GiteaIssueNumber}` : null)
                            || null;
                          const assigneeName = userRow.FirstName && userRow.LastName
                            ? `${userRow.FirstName} ${userRow.LastName}`
                            : userRow.Username;
                          const taskTooltipLines = [
                            `Project: ${project?.ProjectName || 'Unknown'}`,
                            `Task: ${task.TaskName}${isSubtask ? ` (Level ${level} Subtask)` : ''}`,
                            `Assignee: ${assigneeName}`,
                            `Status: ${task.StatusName || 'Unknown'}`,
                            `Priority: ${task.PriorityName || 'Unknown'}`,
                            `Dates: ${displayedStartDate || 'Not planned'} → ${displayedEndDate || 'Not planned'}`,
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
                          const canDragTaskSegment = !!(permissions?.canPlanTasks && !isGanttSearchActive && !isSubtask);
                          const canResizeTask = !!(
                            isResourceGrouping &&
                            permissions?.canPlanTasks &&
                            !isGanttSearchActive &&
                            displayedStartDate &&
                            displayedEndDate &&
                            !usesDerivedChildDates
                          );
                          const canResizeStart = !!(canResizeTask && displayedStartDate && displayedStartDate >= firstTimelineDateKey);
                          const canResizeEnd = !!(canResizeTask && displayedEndDate && displayedEndDate <= lastTimelineDateKey);
                          const isResizingTask = taskResizeState.task?.Id === task.Id;
                          const activeResizeHeaderId = taskResizeState.resizeHeaderId;
                          const previewBarStyle = isResizingTask
                            ? getBarStyleFromIndices(taskResizeState.currentStartIndex, taskResizeState.currentEndIndex)
                            : null;
                          
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
                          const driftDays = (baselinePosition && displayedStartDate)
                            ? (() => {
                                const curStart = new Date(displayedStartDate || task.BaselineStartDate!).getTime();
                                const basStart = new Date(task.BaselineStartDate!).getTime();
                                return Math.round((curStart - basStart) / 86_400_000);
                              })()
                            : 0;

                          const renderableTaskBarSegments = mergedTaskBarSegments
                            .map((segment) => {
                              const segmentTask = {
                                ...task,
                                PlannedStartDate: segment.startDate,
                                PlannedEndDate: segment.endDate,
                              };
                              const segmentPosition = getTaskPosition(segmentTask, timelineColumns, {
                                useFixedPixelColumns,
                                columnWidthPx: dayColumnWidthPx,
                                forcePlannedDates: true,
                              });

                              if (!segmentPosition) {
                                return null;
                              }

                              return { segment, segmentPosition };
                            })
                            .filter((entry): entry is { segment: typeof mergedTaskBarSegments[number]; segmentPosition: NonNullable<ReturnType<typeof getTaskPosition>> } => entry !== null);

                          const usesSingleVerticalLane = isUnscheduledForUser || hasUnscheduledAssignedChildForUser;

                          return (
                            <React.Fragment key={`bar-${task.Id}`}>
                              {/* Snapshot overlay ghost bars — render in the bottom half of each row slot (offset by 26px) */}
                              {snapshotOverlayData && getSnapshotBarSegments(task.Id, userRow.Id).map((seg, segIdx) => {
                                const snapTask = { ...task, PlannedStartDate: seg.startDate, PlannedEndDate: seg.endDate };
                                const snapPos = getTaskPosition(snapTask, timelineColumns, {
                                  useFixedPixelColumns,
                                  columnWidthPx: dayColumnWidthPx,
                                  forcePlannedDates: true,
                                });
                                if (!snapPos) return null;
                                const snapTop = 2 + (row + segIdx) * ROW_H + 26;
                                return (
                                  <div
                                    key={`snap-${task.Id}-u${userRow.Id}-${segIdx}-${seg.startDate}`}
                                    className="absolute h-5 rounded cursor-pointer flex items-center overflow-hidden"
                                    style={{
                                      left: snapPos.left,
                                      width: snapPos.width,
                                      top: `${snapTop}px`,
                                      backgroundColor: 'rgba(217, 119, 6, 0.20)',
                                      border: '1.5px dashed #b45309',
                                      boxSizing: 'border-box',
                                      zIndex: 10,
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleTaskClick(task);
                                    }}
                                    title={`Snapshot: ${task.TaskName}\n${seg.startDate} → ${seg.endDate}`}
                                  >
                                    <span className="truncate text-[10px] px-1.5 font-medium text-amber-800 dark:text-amber-300 pointer-events-none select-none">
                                      {task.TaskName}
                                      <span className="ml-1 opacity-70">{seg.startDate} → {seg.endDate}</span>
                                    </span>
                                  </div>
                                );
                              })}
                              {baselinePosition && (
                                <div
                                  className="absolute rounded-sm pointer-events-none"
                                  style={{
                                    left: baselinePosition.left,
                                    width: baselinePosition.width,
                                    top: `${4 + row * ROW_H + (isSubtask ? 10 : 12)}px`,
                                    height: '4px',
                                    backgroundColor: driftDays === 0 ? '#10b981' : driftDays > 0 ? '#f59e0b' : '#a855f7',
                                    opacity: 0.7,
                                    zIndex: 1,
                                  }}
                                  title={`Baseline: ${task.BaselineStartDate} → ${task.BaselineEndDate}${driftDays !== 0 ? `\nDrift: ${driftDays > 0 ? '+' : ''}${driftDays} days` : ''}`}
                                />
                              )}
                              {renderableTaskBarSegments.map(({ segment, segmentPosition }, segmentIndex) => {

                                const segmentCanResizeStart = !!(
                                  canResizeStart &&
                                  segment.startDate &&
                                  segment.startDate >= firstTimelineDateKey
                                );
                                const segmentCanResizeEnd = !!(
                                  canResizeEnd &&
                                  segment.endDate &&
                                  segment.endDate <= lastTimelineDateKey
                                );
                                const segmentTooltip = taskTooltip.replace(
                                  `Dates: ${displayedStartDate || 'Not planned'} → ${displayedEndDate || 'Not planned'}`,
                                  `Dates: ${segment.startDate} → ${segment.endDate}`
                                );
                                const segmentHeaderId = segment.headerId;
                                const sliceTotalHours = segmentHeaderId !== null
                                  ? (allocationHoursByHeaderId.get(Number(segmentHeaderId)) || 0)
                                  : 0;
                                const segmentWorkedHours = segmentHeaderId !== null ? 0 : Number(workedHours || 0);
                                const segmentPlannedHours = segmentHeaderId !== null ? sliceTotalHours : Number(plannedHours || 0);
                                const segmentEstimatedHours = segmentHeaderId !== null ? sliceTotalHours : Number(estimatedHours || 0);
                                const segmentHoursDisplay = `${segmentWorkedHours.toFixed(2)}/${segmentPlannedHours.toFixed(2)}/${segmentEstimatedHours.toFixed(2)}h`;
                                const isResizingThisSegment =
                                  isResizingTask &&
                                  (
                                    (activeResizeHeaderId !== null && segmentHeaderId !== null && Number(activeResizeHeaderId) === Number(segmentHeaderId)) ||
                                    (activeResizeHeaderId === null && segmentIndex === 0)
                                  );
                                const segmentPreviewStyle = isResizingThisSegment ? previewBarStyle : null;
                                const barDomId = segmentHeaderId !== null
                                  ? `allocation-header-${segmentHeaderId}`
                                  : undefined;
                                const isDoneTransitionSegment = segment.source === 'done';
                                const segmentStatusColor = isDoneTransitionSegment ? undefined : statusColor;
                                const segmentBaseColorClass = isDoneTransitionSegment
                                  ? 'bg-green-600 dark:bg-green-600'
                                  : (!segmentStatusColor ? getPriorityColor(task) : '');

                                return (
                                  <div
                                    key={`${task.Id}-${segmentHeaderId ?? `legacy-${segmentIndex}`}-${segment.startDate}-${segment.endDate}`}
                                    id={barDomId}
                                    data-task-id={segmentIndex === 0 ? task.Id : undefined}
                                    data-allocation-header-id={segmentHeaderId !== null ? String(segmentHeaderId) : undefined}
                                    draggable={canDragTaskSegment}
                                    onDragStart={(e) => handleDragStart(e, task, userRow.Id, segmentHeaderId)}
                                    onDragEnd={handleDragEnd}
                                    onContextMenu={(e) => handleTaskContextMenu(e, task, userRow.Id, segmentHeaderId)}
                                    onClick={(e) => {
                                      if (shouldSuppressTaskClick()) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        return;
                                      }
                                      if (segmentHeaderId !== null && permissions?.canPlanTasks) {
                                        openAllocationHeaderModal(segmentHeaderId);
                                        return;
                                      }
                                      void handleTaskClick(task);
                                    }}
                                    className={`absolute ${subtaskHeight} rounded ${segmentBaseColorClass} ${isSubtask ? 'opacity-60' : 'opacity-75'} hover:opacity-100 ${canDragTaskSegment ? 'cursor-move' : 'cursor-pointer'} flex items-center text-white ${subtaskTextSize} ${subtaskPadding} transition-all ${!isSubtask && isOverPlanned ? 'ring-2 ring-red-500 ring-offset-1' : ''} ${showCriticalPath && criticalPathIds.has(task.Id) ? 'ring-2 ring-red-400 ring-offset-1 brightness-110' : ''} ${isResizingThisSegment ? 'ring-2 ring-blue-400 ring-offset-1 shadow-lg' : ''} ${activeTimerGlowIds.has(task.Id) ? 'timer-active-glow' : otherActiveTimerGlowIds.has(task.Id) ? 'timer-active-glow-other' : ''}`}
                                    style={{
                                      left: segmentPreviewStyle?.left || segmentPosition.left,
                                      width: segmentPreviewStyle?.width || segmentPosition.width,
                                      top: `${2 + (row + (usesSingleVerticalLane ? 0 : segmentIndex)) * ROW_H}px`,
                                      height: '24px',
                                      ...(segmentStatusColor ? { backgroundColor: segmentStatusColor } : {}),
                                      borderLeft: `${isSubtask ? '3' : '4'}px solid ${priorityBorderHex}`,
                                      zIndex: isResizingThisSegment ? 40 : isSubtask ? 20 + segmentIndex : 21 + segmentIndex,
                                    }}
                                    title={segmentTooltip}
                                  >
                                    {segmentCanResizeStart && isShiftResizeMode && (
                                      <div
                                        role="button"
                                        aria-label={`Resize start date for ${task.TaskName}`}
                                        onMouseDown={(e) => handleTaskResizeHandleMouseDown(
                                          e,
                                          task,
                                          'start',
                                          segmentPosition.startIndex,
                                          segmentPosition.startIndex + segmentPosition.duration - 1,
                                          userRow.Id,
                                          segmentHeaderId
                                        )}
                                        onClick={(e) => e.stopPropagation()}
                                        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l bg-black/20 hover:bg-black/35"
                                        title="Hold Shift and drag to resize start"
                                      />
                                    )}
                                    <TaskTypeIconMark
                                      name={task.TaskTypeName}
                                      iconSvg={task.TaskTypeIconSvg}
                                      color={task.TaskTypeColor}
                                      className="w-3 h-3 shrink-0 mr-1"
                                    />
                                    {!isSubtask && isOverPlanned && <span className="mr-1">⚠️</span>}
                                    {!isSubtask && taskIsHobbyProject && (
                                      <span className="mr-1 bg-purple-700 text-white text-[9px] px-1 py-0.5 rounded font-semibold flex-shrink-0 pointer-events-none">HOBBY</span>
                                    )}
                                    {taskIssueRef && (
                                      <span className="mr-1 bg-black/30 text-white text-[9px] px-1 py-0.5 rounded font-bold flex-shrink-0 pointer-events-none">{taskIssueRef}</span>
                                    )}
                                    <span className="truncate flex-1 pointer-events-none flex items-center gap-1 min-w-0">
                                      {indentPrefix}
                                      {!isSubtask && hasDependency ? '🔗 ' : ''}
                                      {task.TaskName}
                                    </span>
                                    {!isSubtask && showTaskBarHours && (
                                      <span className={`ml-1 text-[10px] whitespace-nowrap pointer-events-none ${isOverPlanned ? 'bg-red-600 px-1 rounded font-bold' : 'opacity-80'}`}>{segmentHoursDisplay}</span>
                                    )}
                                    {segmentCanResizeEnd && isShiftResizeMode && (
                                      <div
                                        role="button"
                                        aria-label={`Resize end date for ${task.TaskName}`}
                                        onMouseDown={(e) => handleTaskResizeHandleMouseDown(
                                          e,
                                          task,
                                          'end',
                                          segmentPosition.startIndex,
                                          segmentPosition.startIndex + segmentPosition.duration - 1,
                                          userRow.Id,
                                          segmentHeaderId
                                        )}
                                        onClick={(e) => e.stopPropagation()}
                                        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-black/20 hover:bg-black/35"
                                        title="Hold Shift and drag to resize end"
                                      />
                                    )}
                                  </div>
                                );
                              })}
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

                        {userOutlookEvents
                          .map((outlookEvent, outlookIdx) => {
                            const outlookEventLane = outlookEventLanes[outlookIdx]?.laneIndex || 0;
                            const startDateStr = normalizeDateKey(outlookEvent.start);
                            const endDateStr = normalizeDateKey(outlookEvent.end);
                            if (!startDateStr || !endDateStr) return null;

                            const eventStart = startDateStr <= endDateStr ? startDateStr : endDateStr;
                            const eventEnd = startDateStr <= endDateStr ? endDateStr : startDateStr;

                            const startIndex = timelineColumns.findIndex((column) => {
                              const startKey = getDateKeyFromDate(column.start);
                              const endKey = getDateKeyFromDate(column.end);
                              return eventStart <= endKey && eventEnd >= startKey;
                            });

                            if (startIndex === -1) return null;

                            let endIndex = startIndex;
                            for (let i = startIndex; i < timelineColumns.length; i++) {
                              const startKey = getDateKeyFromDate(timelineColumns[i].start);
                              const endKey = getDateKeyFromDate(timelineColumns[i].end);
                              if (eventStart <= endKey && eventEnd >= startKey) {
                                endIndex = i;
                              }
                            }

                            const duration = Math.max(1, endIndex - startIndex + 1);
                            const left = useFixedPixelColumns
                              ? `${startIndex * dayColumnWidthPx}px`
                              : `${(startIndex / timelineColumns.length) * 100}%`;
                            const width = useFixedPixelColumns
                              ? `${duration * dayColumnWidthPx}px`
                              : `${(duration / timelineColumns.length) * 100}%`;

                            const ownerLabel = outlookEvent.userName || outlookEvent.userEmail || userRow.Username;
                            const isSelf = Number(outlookEvent.userId) === Number(user?.id);
                            const displaySubject = isSelf ? outlookEvent.subject : 'Busy';

                            // Compute local time range and duration for tooltip
                            const evtStartDate = new Date(outlookEvent.start);
                            const evtEndDate = new Date(outlookEvent.end);
                            const durationMs = evtEndDate.getTime() - evtStartDate.getTime();
                            const durationTotalMins = Math.round(durationMs / 60000);
                            const durationHrs = Math.floor(durationTotalMins / 60);
                            const durationMins = durationTotalMins % 60;
                            const durationStr = durationHrs > 0
                              ? (durationMins > 0 ? `${durationHrs}h ${durationMins}min` : `${durationHrs}h`)
                              : `${durationMins}min`;
                            const timeRangeStr = outlookEvent.isAllDay
                              ? `All day${Number.isFinite(durationMs) && durationMs > 0 ? ` (${durationStr})` : ''}`
                              : Number.isFinite(durationMs) && durationMs > 0
                                ? `${evtStartDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → ${evtEndDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${durationStr})`
                                : `${eventStart} → ${eventEnd}`;

                            return (
                              <div
                                key={`outlook-${outlookEvent.id}-${outlookIdx}`}
                                onClick={() => {
                                  if (isSelf) {
                                    setSelectedOutlookEvent(outlookEvent);
                                    setShowOutlookActionModal(true);
                                  }
                                }}
                                className={`absolute h-6 rounded bg-sky-500 dark:bg-sky-600 opacity-45 hover:opacity-75 flex items-center text-white text-[10px] px-1 border-l-3 border-sky-700 dark:border-sky-800 ${isSelf ? 'cursor-pointer' : 'cursor-default'}`}
                                style={{
                                  left,
                                  width,
                                  top: `${outlookLaneTop + outlookEventLane * OUTLOOK_LANE_H}px`,
                                  borderLeftWidth: '3px',
                                  zIndex: 29,
                                }}
                                title={isSelf ? `📅 ${outlookEvent.subject}\n${ownerLabel}\n${timeRangeStr}\nClick to open or start timer` : `📅 Busy\n${timeRangeStr}`}
                              >
                                <span className="truncate">📅 {displaySubject}</span>
                              </div>
                            );
                          })}

                        {positionedUserOverlayItems.map((item, entryIdx: number) => {
                          const { entry, dateKey, colIdx, laneIndex } = item;
                          const isCall = entry.RecordType === 'CallRecord';
                          const hours = parseFloat(entry.Hours || 0);
                          const label = isCall ? (entry.Subject || entry.CallType || 'Call') : (entry.TaskName || '');
                          const hoursLabel = isCall ? decimalHoursToHMSOverlay(entry.DurationMinutes / 60) : decimalHoursToHMSOverlay(hours);
                          const barColor = isCall
                            ? 'bg-amber-400 dark:bg-amber-500 border-amber-500'
                            : 'bg-green-500 dark:bg-green-600 border-green-600';
                          const top = timeEntriesLaneTop + 2 + (laneIndex * 20);
                          return (
                            <div
                              key={`te-lane-${entryIdx}`}
                              className={`absolute rounded border text-white text-[9px] truncate px-0.5 flex items-center ${barColor}`}
                              style={
                                useFixedPixelColumns
                                  ? { left: `${colIdx * dayColumnWidthPx + 1}px`, width: `${dayColumnWidthPx - 3}px`, top: `${top}px`, height: '18px' }
                                  : { left: `${(colIdx / Math.max(1, timelineColumns.length)) * 100}%`, width: `${(1 / Math.max(1, timelineColumns.length)) * 100}%`, top: `${top}px`, height: '18px' }
                              }
                              title={`${isCall ? '📞' : '⏱'} ${label}\n${dateKey} • ${hoursLabel}${entry.ProjectName ? '\n' + entry.ProjectName : ''}${entry.Description ? '\n' + entry.Description : ''}`}
                            >
                              {isCall ? '📞' : '⏱'} {label || hoursLabel}
                            </div>
                          );
                        })}
                        {draggedTask && permissions?.canPlanTasks && ganttSearch.trim().length === 0 && (
                          <div className="absolute inset-0 z-[60] flex" style={useFixedPixelColumns ? { minWidth: `${timelineDaysWidthPx}px` } : undefined}>
                            {timelineColumns.map((column, idx) => {
                              const dateKey = getDateKeyFromDate(column.start);
                              const showDayDropTarget = hoveredDropCell?.userId === userRow.Id && hoveredDropCell?.dateKey === dateKey;

                              return (
                                <div
                                  key={`drop-overlay-${idx}`}
                                  className={`${useFixedPixelColumns ? 'flex-shrink-0' : 'flex-1'} relative`}
                                  style={useFixedPixelColumns ? { width: `${dayColumnWidthPx}px` } : undefined}
                                  onDragEnter={(e) => {
                                    e.preventDefault();
                                    setHoveredDropCell({ userId: userRow.Id, dateKey });
                                  }}
                                  onDragOver={handleDragOver}
                                  onDrop={(e) => handleDropOnDay(e, column.start, userRow.Id)}
                                >
                                  {showDayDropTarget && (
                                    <div className="absolute inset-1 rounded border-2 border-dashed border-blue-500 dark:border-blue-400 bg-blue-100/50 dark:bg-blue-900/30 pointer-events-none flex items-center justify-center">
                                      <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">Drop here</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* User Daily Totals Row */}
                    {showGanttTotals && (
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
                          const hasOutlook = (totals.outlook || 0) > 0;
                          const isOverAllocated = summary.isOverAllocated;
                          const holidayNames = summary.holidayNames;
                          const isHoliday = summary.isHoliday;
                          const isDevSupport = summary.isDevSupport;
                          const devSupportLabels = summary.devSupportLabels;
                          const { vacationLabels, outOfOfficeLabels, holidayLabels } = splitUnavailableLabels(holidayNames);
                          
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
                                  : isDevSupport
                                  ? 'bg-indigo-100/90 dark:bg-indigo-900/45 ring-inset ring-1 ring-indigo-300/70 dark:ring-indigo-500/45'
                                  : summary.isWeekend
                                  ? 'bg-gray-200 dark:bg-gray-600/65'
                                  : ''
                              } ${idx === todayIndex ? 'border-l-2 border-l-red-400/70 dark:border-l-red-400/60' : ''}`}
                              title={
                                isOverAllocated
                                  ? 'Over allocated day: planned hours exceed configured capacity'
                                  : isHoliday
                                  ? `Unavailable: ${holidayNames.join(', ')}`
                                  : isDevSupport
                                  ? devSupportLabels.join(', ')
                                  : undefined
                              }
                              style={useFixedPixelColumns ? { overflow: 'hidden', width: `${dayColumnWidthPx}px` } : { overflow: 'hidden' }}
                            >
                              {vacationLabels.length > 0 && (
                                <div className="text-cyan-700 dark:text-cyan-300 font-medium truncate">🏖️</div>
                              )}
                              {outOfOfficeLabels.length > 0 && (
                                <div className="text-rose-700 dark:text-rose-300 font-medium truncate">🚫</div>
                              )}
                              {devSupportLabels.length > 0 && (
                                <div className="text-indigo-600 dark:text-indigo-300 font-medium truncate">🛠️</div>
                              )}
                              {holidayLabels.length > 0 && (
                                <div className="text-amber-700 dark:text-amber-300 font-medium truncate">🎉</div>
                              )}
                              {hasOutlook && (
                                <div className="text-sky-600 dark:text-sky-400 font-medium truncate" style={{ fontSize: useAnnualStyleDensity ? '9px' : undefined }}>
                                  {useAnnualStyleDensity ? `📅${(totals.outlook || 0).toFixed(0)}` : `📅 ${(totals.outlook || 0).toFixed(1)}h`}
                                </div>
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
                    )}
                  </React.Fragment>
                );
              })}

              {!isResourceGrouping && ganttGroupBy !== 'time-entries' && groupedGanttRows.map((groupRow) => {
                const parentTasks = groupRow.tasks;
                const taskRows: { task: Task; row: number }[] = [];
                let maxRows = 1;

                const groupedSprints = new Map<string, {
                  id: string;
                  name: string;
                  projectName: string;
                  startDate: string;
                  endDate: string;
                }>();

                parentTasks.forEach((task) => {
                  const sprintId = Number(task.SprintId);
                  if (!Number.isFinite(sprintId) || sprintId <= 0) return;
                  if (!task.SprintStartDate || !task.SprintEndDate) return;

                  const sprintKey = `${task.ProjectId}-${sprintId}`;
                  if (!groupedSprints.has(sprintKey)) {
                    groupedSprints.set(sprintKey, {
                      id: sprintKey,
                      name: String(task.SprintName || `Sprint ${sprintId}`),
                      projectName: projects.find((projectItem) => projectItem.Id === task.ProjectId)?.ProjectName || `Project #${task.ProjectId}`,
                      startDate: String(task.SprintStartDate),
                      endDate: String(task.SprintEndDate),
                    });
                  }
                });

                const sprintItems = Array.from(groupedSprints.values())
                  .map((sprint) => {
                    const position = getTimelineRangePosition(sprint.startDate, sprint.endDate);
                    return position ? { ...sprint, position } : null;
                  })
                  .filter((item): item is NonNullable<typeof item> => item !== null)
                  .sort((a, b) => a.position.startIndex - b.position.startIndex || a.position.endIndex - b.position.endIndex);

                const sprintRows: Array<(typeof sprintItems)[number] & { row: number }> = [];
                let sprintLaneCount = 0;

                sprintItems.forEach((sprintItem, sprintIndex) => {
                  let sprintRow = 0;

                  for (let index = 0; index < sprintIndex; index++) {
                    const otherSprint = sprintItems[index];
                    const overlaps = !(sprintItem.position.endIndex < otherSprint.position.startIndex || sprintItem.position.startIndex > otherSprint.position.endIndex);
                    if (!overlaps) continue;

                    const otherSprintRow = sprintRows.find((entry) => entry.id === otherSprint.id);
                    if (otherSprintRow) {
                      sprintRow = Math.max(sprintRow, otherSprintRow.row + 1);
                    }
                  }

                  sprintRows.push({ ...sprintItem, row: sprintRow });
                  sprintLaneCount = Math.max(sprintLaneCount, sprintRow + 1);
                });

                const sprintLaneHeight = sprintLaneCount > 0 ? sprintLaneCount * 16 + 4 : 0;

                parentTasks.forEach((task, taskIdx) => {
                  const position = getTaskPosition(task, timelineColumns, {
                    useFixedPixelColumns,
                    columnWidthPx: dayColumnWidthPx,
                  });
                  if (!position) return;

                  const taskStartIndex = position.startIndex;
                  const taskEndIndex = position.startIndex + position.duration - 1;
                  let row = 0;

                  for (let i = 0; i < taskIdx; i++) {
                    const otherTask = parentTasks[i];
                    const otherPosition = getTaskPosition(otherTask, timelineColumns, {
                      useFixedPixelColumns,
                      columnWidthPx: dayColumnWidthPx,
                    });
                    if (!otherPosition) continue;

                    const otherStartIndex = otherPosition.startIndex;
                    const otherEndIndex = otherPosition.startIndex + otherPosition.duration - 1;
                    const overlap = !(taskEndIndex < otherStartIndex || taskStartIndex > otherEndIndex);

                    if (overlap) {
                      const otherTaskRow = taskRows.find((taskRow) => taskRow.task.Id === otherTask.Id);
                      if (otherTaskRow) {
                        row = Math.max(row, otherTaskRow.row + 1);
                      }
                    }
                  }

                  taskRows.push({ task, row });
                  maxRows = Math.max(maxRows, row + 1);
                });

                // Time entries overlay: match by project or customer
                const groupedEntries = (() => {
                  if (!showTimeEntriesOverlay) return [];
                  if (ganttGroupBy === 'project') {
                    const projectId = Number(groupRow.id.replace('project-', ''));
                    return plannerTimeEntries.filter((e: any) => Number(e.ProjectId) === projectId);
                  }
                  // customer
                  const customerKey = groupRow.id.replace('customer-', '');
                  return plannerTimeEntries.filter((e: any) =>
                    (e.CustomerName || '').toLowerCase() === customerKey
                  );
                })();

                const decimalHoursToHMS = (h: number) => {
                  const total = Math.round(Math.abs(h) * 3600);
                  const hh = Math.floor(total / 3600);
                  const mm = Math.floor((total % 3600) / 60);
                  const ss = total % 60;
                  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
                };

                const groupedOverlayItems = groupedEntries.map((entry: any) => {
                  const dateKey = String(entry.WorkDate).split('T')[0];
                  const colIdx = timelineColumns.findIndex((col) => getDateKeyFromDate(col.start) === dateKey);
                  const startTime = String(entry.StartTime || '00:00');
                  const [startHourRaw, startMinuteRaw] = startTime.split(':').map(Number);
                  const startMinuteOfDay = (Number.isFinite(startHourRaw) ? startHourRaw : 0) * 60
                    + (Number.isFinite(startMinuteRaw) ? startMinuteRaw : 0);
                  return {
                    entry,
                    dateKey,
                    colIdx,
                    startMinuteOfDay,
                  };
                }).filter((item) => item.colIdx >= 0);
                const sortedGroupedOverlayItems = [...groupedOverlayItems].sort((a, b) => (
                  a.colIdx - b.colIdx
                  || a.startMinuteOfDay - b.startMinuteOfDay
                  || String(a.entry.TaskName || a.entry.Subject || '').localeCompare(String(b.entry.TaskName || b.entry.Subject || ''))
                ));
                const groupedOverlayLaneCounter = new Map<number, number>();
                const positionedGroupedOverlayItems = sortedGroupedOverlayItems.map((item) => {
                  const laneIndex = groupedOverlayLaneCounter.get(item.colIdx) || 0;
                  groupedOverlayLaneCounter.set(item.colIdx, laneIndex + 1);
                  return { ...item, laneIndex };
                });
                const maxGroupedOverlayLanes = positionedGroupedOverlayItems.reduce((max, item) => Math.max(max, item.laneIndex + 1), 0);

                const timeEntriesGroupLaneHeight = maxGroupedOverlayLanes > 0 ? (maxGroupedOverlayLanes * 18) + (Math.max(0, maxGroupedOverlayLanes - 1) * 2) + 4 : 0;
                const timeEntriesGroupLaneTop = sprintLaneHeight + maxRows * 24 + 8;
                const rowHeight = Math.max(sprintLaneHeight + maxRows * 24 + 8, 44) + timeEntriesGroupLaneHeight;

                return (
                  <React.Fragment key={groupRow.id}>
                  <div
                    className="flex border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    style={{ minHeight: `${rowHeight}px` }}
                  >
                    <div className="w-48 min-w-48 max-w-48 flex-none sticky left-0 z-[50] bg-white dark:bg-gray-800 p-1 border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {ganttGroupBy === 'customer' ? '🏢 ' : '📁 '}{groupRow.label}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{groupRow.subLabel}</div>
                      <div className="text-xs text-blue-600 dark:text-blue-400">
                        {parentTasks.length} task{parentTasks.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="flex-1 relative" style={useFixedPixelColumns ? { minHeight: `${rowHeight}px`, minWidth: `${timelineDaysWidthPx}px` } : { minHeight: `${rowHeight}px` }}>
                      <div className="flex h-full" style={useFixedPixelColumns ? { minWidth: `${timelineDaysWidthPx}px` } : undefined}>
                        {timelineColumns.map((column, idx) => (
                          <div
                            key={idx}
                            className={`${useFixedPixelColumns ? 'flex-shrink-0' : 'flex-1'} border-r border-gray-200 dark:border-gray-700 ${
                              column.isWeekend ? 'bg-gray-100 dark:bg-gray-700/45' : ''
                            } ${idx === todayIndex ? 'border-l-2 border-l-red-400/70 dark:border-l-red-400/60' : ''}`}
                            style={useFixedPixelColumns ? { width: `${dayColumnWidthPx}px` } : undefined}
                          />
                        ))}
                      </div>

                      {taskRows.map(({ task, row }) => {
                        const position = getTaskPosition(task, timelineColumns, {
                          useFixedPixelColumns,
                          columnWidthPx: dayColumnWidthPx,
                        });
                        if (!position) return null;

                        const project = projects.find((projectItem) => projectItem.Id === task.ProjectId);
                        const taskIsHobbyProject = isTaskHobby(task);
                        const statusColor = getTaskStatusColor(task);
                        const priorityBorderHex = getPriorityBorderHex(task);
                        const estimatedHours = task.EstimatedHours || 0;
                        const plannedHours = task.PlannedHours || 0;
                        const workedHours = task.WorkedHours || 0;
                        const hoursDisplay = `${workedHours}/${plannedHours}/${estimatedHours}h`;
                        const groupedIssueRef = task.JiraIssueKey || task.ExternalTicketId || task.ExternalIssueId
                          || (task.TicketNumber ? `#${task.TicketNumber}` : null)
                          || (task.GitHubIssueNumber ? `#${task.GitHubIssueNumber}` : null)
                          || (task.GiteaIssueNumber ? `#${task.GiteaIssueNumber}` : null)
                          || null;
                        const sprintLabel = typeof task.SprintName === 'string' && task.SprintName.trim().length > 0
                          ? task.SprintName.trim()
                          : null;

                        return (
                          <div
                            key={`grouped-task-${groupRow.id}-${task.Id}`}
                            data-task-id={task.Id}
                            onContextMenu={(e) => handleTaskContextMenu(e, task)}
                            onClick={(e) => {
                              if (shouldSuppressTaskClick()) {
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              void handleTaskClick(task);
                            }}
                            className={`absolute h-6 rounded ${!statusColor ? getPriorityColor(task) : ''} opacity-80 hover:opacity-100 cursor-pointer flex items-center text-white text-xs px-2 transition-all`}
                            style={{
                              left: position.left,
                              width: position.width,
                              top: `${sprintLaneHeight + 2 + row * 24}px`,
                              ...(statusColor ? { backgroundColor: statusColor } : {}),
                              borderLeft: `4px solid ${priorityBorderHex}`,
                              zIndex: 21,
                            }}
                            title={`Project: ${project?.ProjectName || 'Unknown'}\nTask: ${task.TaskName}\nStatus: ${task.StatusName || 'Unknown'}\nPriority: ${task.PriorityName || 'Unknown'}\nDates: ${task.PlannedStartDate || 'Not planned'} → ${task.PlannedEndDate || 'Not planned'}`}
                          >
                            <TaskTypeIconMark
                              name={task.TaskTypeName}
                              iconSvg={task.TaskTypeIconSvg}
                              color={task.TaskTypeColor}
                              className="w-3 h-3 shrink-0 mr-1"
                            />
                            {taskIsHobbyProject && (
                              <span className="mr-1 bg-purple-700 text-white text-[9px] px-1 py-0.5 rounded font-semibold flex-shrink-0 pointer-events-none">HOBBY</span>
                            )}
                            {groupedIssueRef && (
                              <span className="mr-1 bg-black/30 text-white text-[9px] px-1 py-0.5 rounded font-bold flex-shrink-0 pointer-events-none">{groupedIssueRef}</span>
                            )}
                            <span className="truncate flex-1 pointer-events-none flex items-center gap-1 min-w-0">
                              {task.TaskName}
                            </span>
                            {showTaskBarHours && (
                              <span className="ml-1 text-[10px] whitespace-nowrap opacity-80 pointer-events-none">{hoursDisplay}</span>
                            )}
                          </div>
                        );
                      })}

                      {sprintRows.map((sprintRow) => (
                        <div
                          key={`group-sprint-${groupRow.id}-${sprintRow.id}`}
                          className="absolute h-4 rounded bg-indigo-100/90 dark:bg-indigo-900/40 border border-indigo-300/80 dark:border-indigo-500/60 text-indigo-800 dark:text-indigo-200 text-[10px] px-1 flex items-center"
                          style={{
                            left: sprintRow.position.left,
                            width: sprintRow.position.width,
                            top: `${1 + sprintRow.row * 16}px`,
                            zIndex: 15,
                          }}
                          title={`Sprint: ${sprintRow.name}\nProject: ${sprintRow.projectName}\nDates: ${String(sprintRow.startDate).split('T')[0]} → ${String(sprintRow.endDate).split('T')[0]}`}
                        >
                          <span className="truncate pointer-events-none">🏁 {sprintRow.name}</span>
                        </div>
                      ))}
                      {positionedGroupedOverlayItems.map((item, entryIdx: number) => {
                        const { entry, dateKey, colIdx, laneIndex } = item;
                        const isCall = entry.RecordType === 'CallRecord';
                        const hours = parseFloat(entry.Hours || 0);
                        const label = isCall ? (entry.Subject || entry.CallType || 'Call') : (entry.TaskName || '');
                        const hoursLabel = isCall ? decimalHoursToHMS(entry.DurationMinutes / 60) : decimalHoursToHMS(hours);
                        const barColor = isCall
                          ? 'bg-amber-400 dark:bg-amber-500 border-amber-500'
                          : 'bg-green-500 dark:bg-green-600 border-green-600';
                        const userName = entry.FirstName && entry.LastName ? `${entry.FirstName} ${entry.LastName}` : entry.Username || '';
                        const top = timeEntriesGroupLaneTop + 2 + (laneIndex * 20);
                        return (
                          <div
                            key={`grouped-te-${entryIdx}`}
                            className={`absolute rounded border text-white text-[9px] truncate px-0.5 flex items-center ${barColor}`}
                            style={
                              useFixedPixelColumns
                                ? { left: `${colIdx * dayColumnWidthPx + 1}px`, width: `${dayColumnWidthPx - 3}px`, top: `${top}px`, height: '18px' }
                                : { left: `${(colIdx / Math.max(1, timelineColumns.length)) * 100}%`, width: `${(1 / Math.max(1, timelineColumns.length)) * 100}%`, top: `${top}px`, height: '18px' }
                            }
                            title={`${isCall ? '📞' : '⏱'} ${label}\n${userName}${userName ? ' • ' : ''}${dateKey} • ${hoursLabel}${entry.ProjectName ? '\n' + entry.ProjectName : ''}${entry.Description ? '\n' + entry.Description : ''}`}
                          >
                            {isCall ? '📞' : '⏱'} {label || hoursLabel}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  </React.Fragment>
                );
              })}

              {/* Time Entries view */}
              {ganttGroupBy === 'time-entries' && (() => {
                if (isLoadingPlannerTimeEntries) {
                  return (
                    <div className="flex items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400">
                      Loading time entries…
                    </div>
                  );
                }

                // Group entries by user
                const userMap = new Map<number, { userId: number; name: string; entries: any[] }>();
                plannerTimeEntries.forEach((entry: any) => {
                  const uid = Number(entry.UserId);
                  if (!userMap.has(uid)) {
                    const name = entry.FirstName && entry.LastName
                      ? `${entry.FirstName} ${entry.LastName}`
                      : entry.Username || `User #${uid}`;
                    userMap.set(uid, { userId: uid, name, entries: [] });
                  }
                  userMap.get(uid)!.entries.push(entry);
                });

                // Sort by user name
                const userRows = Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name));

                if (userRows.length === 0) {
                  return (
                    <div className="flex items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400">
                      No time entries or call records in this period.
                    </div>
                  );
                }

                return userRows.map((userRow) => {
                  // One bar per entry; compute column indices
                  const barItems = userRow.entries.map((entry: any) => {
                    const dateKey = String(entry.WorkDate).split('T')[0];
                    const colIdx = timelineColumns.findIndex((col) => {
                      const colDate = getDateKeyFromDate(col.start);
                      return colDate === dateKey;
                    });
                    if (colIdx < 0) return null;
                    const isCall = entry.RecordType === 'CallRecord';
                    const hours = parseFloat(entry.Hours || 0);
                    const startTime = String(entry.StartTime || '00:00');
                    const [startHourRaw, startMinuteRaw] = startTime.split(':').map(Number);
                    const startMinuteOfDay = (Number.isFinite(startHourRaw) ? startHourRaw : 0) * 60
                      + (Number.isFinite(startMinuteRaw) ? startMinuteRaw : 0);
                    const label = isCall
                      ? (entry.Subject || entry.CallType || 'Call')
                      : (entry.TaskName || '');
                    return { entry, colIdx, isCall, hours, label, dateKey, startMinuteOfDay };
                  }).filter(Boolean) as { entry: any; colIdx: number; isCall: boolean; hours: number; label: string; dateKey: string; startMinuteOfDay: number }[];

                  const sortedBarItems = [...barItems].sort((a, b) => (
                    a.colIdx - b.colIdx
                    || a.startMinuteOfDay - b.startMinuteOfDay
                    || String(a.label).localeCompare(String(b.label))
                  ));

                  const columnLaneCounter = new Map<number, number>();
                  const positionedBarItems = sortedBarItems.map((item) => {
                    const laneIndex = columnLaneCounter.get(item.colIdx) || 0;
                    columnLaneCounter.set(item.colIdx, laneIndex + 1);
                    return { ...item, laneIndex };
                  });

                  const maxLaneCount = positionedBarItems.reduce((max, item) => Math.max(max, item.laneIndex + 1), 1);
                  const barHeightPx = 24;
                  const laneGapPx = 2;
                  const laneTopPaddingPx = 2;
                  const laneBottomPaddingPx = 2;
                  const rowMinHeight = Math.max(44, laneTopPaddingPx + laneBottomPaddingPx + (maxLaneCount * barHeightPx) + (Math.max(0, maxLaneCount - 1) * laneGapPx));

                  const decimalHoursToHMS = (h: number) => {
                    const total = Math.round(Math.abs(h) * 3600);
                    const hh = Math.floor(total / 3600);
                    const mm = Math.floor((total % 3600) / 60);
                    const ss = total % 60;
                    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
                  };

                  return (
                    <div
                      key={`te-user-${userRow.userId}`}
                      className="flex border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      style={{ minHeight: `${rowMinHeight}px` }}
                    >
                      {/* User label */}
                      <div className="w-48 min-w-48 max-w-48 flex-none sticky left-0 z-[50] bg-white dark:bg-gray-800 p-2 border-r border-gray-200 dark:border-gray-700 flex flex-col justify-center">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">👤 {userRow.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {userRow.entries.length} entr{userRow.entries.length !== 1 ? 'ies' : 'y'}
                        </div>
                      </div>
                      {/* Timeline */}
                      <div className="flex-1 relative" style={useFixedPixelColumns ? { minHeight: `${rowMinHeight}px`, minWidth: `${timelineDaysWidthPx}px` } : { minHeight: `${rowMinHeight}px` }}>
                        <div className="flex h-full" style={useFixedPixelColumns ? { minWidth: `${timelineDaysWidthPx}px` } : undefined}>
                          {timelineColumns.map((column, idx) => (
                            <div
                              key={idx}
                              className={`${useFixedPixelColumns ? 'flex-shrink-0' : 'flex-1'} border-r border-gray-200 dark:border-gray-700 ${
                                column.isWeekend ? 'bg-gray-100 dark:bg-gray-700/45' : ''
                              } ${idx === todayIndex ? 'border-l-2 border-l-red-400/70 dark:border-l-red-400/60' : ''}`}
                              style={useFixedPixelColumns ? { width: `${dayColumnWidthPx}px` } : undefined}
                            />
                          ))}
                        </div>
                        {/* Entry bars */}
                        {positionedBarItems.map((item, barIdx) => {
                          const left = useFixedPixelColumns
                            ? item.colIdx * dayColumnWidthPx
                            : `${(item.colIdx / Math.max(1, timelineColumns.length)) * 100}%`;
                          const width = useFixedPixelColumns
                            ? dayColumnWidthPx - 2
                            : `${(1 / Math.max(1, timelineColumns.length)) * 100}%`;
                          const barColor = item.isCall
                            ? 'bg-amber-400 dark:bg-amber-500 border-amber-500 dark:border-amber-400'
                            : 'bg-green-500 dark:bg-green-600 border-green-600 dark:border-green-500';
                          const top = laneTopPaddingPx + (item.laneIndex * (barHeightPx + laneGapPx));
                          const hoursLabel = item.isCall
                            ? decimalHoursToHMS(item.entry.DurationMinutes / 60)
                            : decimalHoursToHMS(item.hours);
                          return (
                            <div
                              key={barIdx}
                              className={`absolute rounded border text-white text-[10px] truncate px-1 flex items-center cursor-pointer ${barColor}`}
                              style={
                                useFixedPixelColumns
                                  ? { left: `${left}px`, width: `${width}px`, top: `${top}px`, height: `${barHeightPx}px` }
                                  : { left: left as string, width: width as string, top: `${top}px`, height: `${barHeightPx}px` }
                              }
                              title={`${item.isCall ? '📞 ' : '⏱ '}${item.label}\n${item.dateKey} • ${hoursLabel}${item.entry.ProjectName ? '\n' + item.entry.ProjectName : ''}${item.entry.Description ? '\n' + item.entry.Description : ''}`}
                            >
                              {item.label ? `${item.isCall ? '📞' : '⏱'} ${item.label}` : hoursLabel}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
              </div>
              </div>
            </div>
          </div>
        )}

        {taskContextMenu.show && taskContextMenu.task && canUseGanttPlanningActions() && (
          <div
            className="fixed z-[140] min-w-[240px] max-h-[70vh] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-y-auto"
            style={{
              left: taskContextMenu.x,
              top: taskContextMenu.y,
              transform: taskContextMenu.openUpward ? 'translateY(calc(-100% - 8px))' : 'translateY(8px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                const task = taskContextMenu.task;
                closeTaskContextMenu();
                if (task) {
                  void handleDeleteTaskAllocations(task.Id);
                }
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Remove allocations
            </button>
            <button
              onClick={() => {
                const task = taskContextMenu.task;
                closeTaskContextMenu();
                if (task) {
                  void handleRecalculateTaskDatesFromAllocations(task);
                }
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
            >
              Recalculate start/end from allocations
            </button>
            <button
              onClick={() => {
                const task = taskContextMenu.task;
                closeTaskContextMenu();
                if (task) {
                  openForceDatesModal(task);
                }
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
            >
              Force new start/end dates
            </button>
            <button
              onClick={() => {
                const task = taskContextMenu.task;
                closeTaskContextMenu();
                if (task) {
                  void handleSetTaskBaseline(task);
                }
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
            >
              Set baseline for this task
            </button>
            <button
              onClick={() => {
                const task = taskContextMenu.task;
                const userId = taskContextMenu.userId;
                const headerId = taskContextMenu.headerId;
                closeTaskContextMenu();
                if (task) {
                  openExtraTimeModal(task, userId, headerId);
                }
              }}
              className="w-full px-4 py-3 text-left text-sm text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 border-t border-gray-200 dark:border-gray-700"
            >
              Add extra time
            </button>
          </div>
        )}

        <AllocationHeaderDetailModal
          isOpen={allocationHeaderModal.show}
          headerId={allocationHeaderModal.headerId}
          token={token}
          canEdit={!!permissions?.canPlanTasks}
          onClose={closeAllocationHeaderModal}
          onDeleteAllAllocations={async ({ taskId }) => {
            const response = await fetch(`${getApiUrl()}/api/task-allocations/task/${taskId}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData?.message || 'Failed to delete task allocations');
            }

            if (projects.length > 0) {
              await loadAllProjectsTasks(projects);
            }
            await loadAllAllocations();
            showAlert('Success', 'All allocations for this task were deleted successfully.');
          }}
          onOpenTaskDetails={async (taskId) => {
            const task = tasks.find((entry) => Number(entry.Id) === Number(taskId));
            if (!task) {
              return;
            }

            closeAllocationHeaderModal();
            await handleTaskClick(task);
          }}
          onSaveReplan={handleReplanAllocationHeader}
        />

        {shiftResizeSuggestionModal.show && shiftResizeSuggestionModal.task && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[130] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Shift resize suggestion</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{shiftResizeSuggestionModal.task.TaskName}</p>
              </div>

              <div className="p-4 space-y-4">
                {shiftResizeSuggestionModal.error && (
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg text-sm">
                    {shiftResizeSuggestionModal.error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Start date</label>
                    <input
                      type="date"
                      value={shiftResizeSuggestionModal.plannedStartDate}
                      onChange={(e) => setShiftResizeSuggestionModal((prev) => {
                        const nextStartDate = e.target.value;
                        const nextSuggested = calculateSuggestedHoursPerDay(prev.totalHours, nextStartDate, prev.plannedEndDate);
                        return {
                          ...prev,
                          plannedStartDate: nextStartDate,
                          suggestedHoursPerDay: nextSuggested,
                          hoursPerDayInput: String(nextSuggested),
                          error: '',
                        };
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={shiftResizeSuggestionModal.isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">End date</label>
                    <input
                      type="date"
                      value={shiftResizeSuggestionModal.plannedEndDate}
                      onChange={(e) => setShiftResizeSuggestionModal((prev) => {
                        const nextEndDate = e.target.value;
                        const nextSuggested = calculateSuggestedHoursPerDay(prev.totalHours, prev.plannedStartDate, nextEndDate);
                        return {
                          ...prev,
                          plannedEndDate: nextEndDate,
                          suggestedHoursPerDay: nextSuggested,
                          hoursPerDayInput: String(nextSuggested),
                          error: '',
                        };
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={shiftResizeSuggestionModal.isSubmitting}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Total hours</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={shiftResizeSuggestionModal.totalHours}
                      onChange={(e) => setShiftResizeSuggestionModal((prev) => {
                        const nextTotalHours = roundToPlanningStep(Number(e.target.value || 0));
                        const nextSuggested = calculateSuggestedHoursPerDay(nextTotalHours, prev.plannedStartDate, prev.plannedEndDate);
                        return {
                          ...prev,
                          totalHours: nextTotalHours,
                          suggestedHoursPerDay: nextSuggested,
                          hoursPerDayInput: String(nextSuggested),
                          error: '',
                        };
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={shiftResizeSuggestionModal.isSubmitting}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Hours/day (suggested)</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={shiftResizeSuggestionModal.hoursPerDayInput}
                      onChange={(e) => setShiftResizeSuggestionModal((prev) => ({
                        ...prev,
                        hoursPerDayInput: String(roundToPlanningStep(Number(e.target.value || 0))),
                        error: '',
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      disabled={shiftResizeSuggestionModal.isSubmitting}
                    />
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      Suggested: {shiftResizeSuggestionModal.suggestedHoursPerDay} h/day
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeShiftResizeSuggestionModal}
                  className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  disabled={shiftResizeSuggestionModal.isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { void handleConfirmShiftResizeSuggestion(); }}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  disabled={shiftResizeSuggestionModal.isSubmitting}
                >
                  {shiftResizeSuggestionModal.isSubmitting ? 'Replanning...' : 'Apply suggestion'}
                </button>
              </div>
            </div>
          </div>
        )}

        {extraTimeModal.show && extraTimeModal.task && canUseGanttPlanningActions() && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[130] p-4">
            <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full ${extraTimeModal.leafTasks.length > 0 ? 'max-w-md' : 'max-w-sm'} border border-gray-200 dark:border-gray-700 overflow-hidden`}>
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Add extra time</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{extraTimeModal.task.TaskName}</p>
                {extraTimeModal.userId && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    {users.find(u => u.Id === extraTimeModal.userId)?.FirstName || ''} {users.find(u => u.Id === extraTimeModal.userId)?.LastName || ''}
                  </p>
                )}
              </div>
              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                {extraTimeModal.error && (
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg text-sm">
                    {extraTimeModal.error}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Extra hours to add
                    </label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={extraTimeModal.extraHours}
                      onChange={(e) => setExtraTimeModal(prev => ({ ...prev, extraHours: e.target.value, error: '' }))}
                      placeholder="e.g. 4"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      disabled={extraTimeModal.isProcessing}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Max hours per day
                    </label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={extraTimeModal.hoursPerDay}
                      onChange={(e) => setExtraTimeModal(prev => ({ ...prev, hoursPerDay: e.target.value, error: '' }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      disabled={extraTimeModal.isProcessing}
                    />
                  </div>
                </div>

                {/* Subtask picker — shown only for parent tasks */}
                {extraTimeModal.leafTasks.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Distribute extra time to subtasks
                      </label>
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setExtraTimeModal(prev => ({ ...prev, selectedSubtaskIds: prev.leafTasks.map(t => t.Id) }))}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          disabled={extraTimeModal.isProcessing}
                        >
                          All
                        </button>
                        <span className="text-gray-400">|</span>
                        <button
                          type="button"
                          onClick={() => setExtraTimeModal(prev => ({ ...prev, selectedSubtaskIds: [] }))}
                          className="text-gray-500 dark:text-gray-400 hover:underline"
                          disabled={extraTimeModal.isProcessing}
                        >
                          None
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg p-2">
                      {extraTimeModal.leafTasks.map(lt => {
                        const isChecked = extraTimeModal.selectedSubtaskIds.includes(lt.Id);
                        return (
                          <label
                            key={lt.Id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setExtraTimeModal(prev => ({
                                  ...prev,
                                  selectedSubtaskIds: isChecked
                                    ? prev.selectedSubtaskIds.filter(id => id !== lt.Id)
                                    : [...prev.selectedSubtaskIds, lt.Id],
                                  error: '',
                                }));
                              }}
                              disabled={extraTimeModal.isProcessing}
                              className="rounded border-gray-300 dark:border-gray-600 text-green-600 focus:ring-green-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{lt.TaskName}</span>
                            <span className="text-xs text-gray-400 whitespace-nowrap">{Number(lt.EstimatedHours || 0)}h</span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Extra hours are distributed proportionally based on each subtask's remaining hours.
                    </p>
                  </div>
                )}

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Extra time will be scheduled starting from the day after the last existing allocation for this task, following normal availability rules.
                </p>
              </div>
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <button
                  onClick={closeExtraTimeModal}
                  disabled={extraTimeModal.isProcessing}
                  className="h-9 px-4 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteAddExtraTime}
                  disabled={extraTimeModal.isProcessing || !extraTimeModal.extraHours || (extraTimeModal.leafTasks.length > 0 && extraTimeModal.selectedSubtaskIds.length === 0)}
                  className="h-9 px-4 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {extraTimeModal.isProcessing ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Scheduling...
                    </>
                  ) : 'Add extra time'}
                </button>
              </div>
            </div>
          </div>
        )}

        {forceDatesModal.show && forceDatesModal.task && canUseGanttPlanningActions() && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[130] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Force Task Dates</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{forceDatesModal.task.TaskName}</p>
              </div>
              <div className="p-4 space-y-4">
                {forceDatesModal.error && (
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg text-sm">
                    {forceDatesModal.error}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start date</label>
                    <input
                      type="date"
                      value={forceDatesModal.startDate}
                      onChange={(e) => setForceDatesModal((prev) => ({ ...prev, startDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">End date</label>
                    <input
                      type="date"
                      value={forceDatesModal.endDate}
                      onChange={(e) => setForceDatesModal((prev) => ({ ...prev, endDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 flex justify-end gap-2">
                <button
                  onClick={closeForceDatesModal}
                  className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleForceDatesSave()}
                  disabled={forceDatesModal.isSaving}
                  className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white"
                >
                  {forceDatesModal.isSaving ? 'Saving...' : 'Save dates'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Task Detail Modal */}
        {milestoneEditor.show && milestoneEditor.milestone && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Milestone</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{milestoneEditor.projectName}{milestoneEditor.customerName ? <span className="ml-2 text-gray-400 dark:text-gray-500">— {milestoneEditor.customerName}</span> : null}</p>
                </div>
                <button
                  onClick={closeMilestoneEditor}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl"
                  aria-label="Close milestone editor"
                >
                  ✕
                </button>
              </div>

              <div className="p-4 space-y-4">
                {milestoneEditor.error && (
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg text-sm">
                    {milestoneEditor.error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
                  <input
                    type="text"
                    value={milestoneEditor.name}
                    onChange={(e) => setMilestoneEditor((prev) => ({ ...prev, name: e.target.value }))}
                    disabled={!permissions?.canManageProjects}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Due Date</label>
                    <input
                      type="date"
                      value={milestoneEditor.dueDate}
                      onChange={(e) => setMilestoneEditor((prev) => ({ ...prev, dueDate: e.target.value }))}
                      disabled={!permissions?.canManageProjects}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Type</label>
                    <select
                      value={milestoneEditor.milestoneTypeId}
                      onChange={(e) => setMilestoneEditor((prev) => ({ ...prev, milestoneTypeId: e.target.value ? Number(e.target.value) : '' }))}
                      disabled={!permissions?.canManageProjects}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                    >
                      <option value="">No type</option>
                      {milestoneEditor.milestoneTypes.map((type) => (
                        <option key={type.Id} value={type.Id}>
                          {getMilestoneTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
                  <textarea
                    value={milestoneEditor.description}
                    onChange={(e) => setMilestoneEditor((prev) => ({ ...prev, description: e.target.value }))}
                    disabled={!permissions?.canManageProjects}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={milestoneEditor.isCompleted}
                    onChange={(e) => setMilestoneEditor((prev) => ({ ...prev, isCompleted: e.target.checked }))}
                    disabled={!permissions?.canManageProjects}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-700"
                  />
                  Mark milestone as completed
                </label>
              </div>

              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
                <div>
                  {permissions?.canManageProjects && (
                    <button
                      onClick={handleMilestoneDelete}
                      disabled={milestoneEditor.isDeleting || milestoneEditor.isSaving}
                      className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white"
                    >
                      {milestoneEditor.isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={closeMilestoneEditor}
                    className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    {permissions?.canManageProjects ? 'Cancel' : 'Close'}
                  </button>
                  {permissions?.canManageProjects && (
                    <button
                      onClick={handleMilestoneSave}
                      disabled={milestoneEditor.isSaving || milestoneEditor.isDeleting}
                      className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white"
                    >
                      {milestoneEditor.isSaving ? 'Saving...' : 'Save'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

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
              // jiraIntegration prop removed; now handled internally in modal
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
              <div className="p-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start">
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
              </div>

              <div className="flex-1 overflow-y-auto p-6">
              
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
 
                    <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setHoursPerDayModal((prev) => ({
                            ...prev,
                            enableSplit: false,
                          }));
                        }}
                        className={`h-10 px-4 text-sm font-medium transition-colors ${!(hoursPerDayModal.enableSplit && !(hoursPerDayModal.sourceUserId || hoursPerDayModal.sourceHeaderId || hoursPerDayModal.suppressDependentReplan))
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                      >
                        Normal planning
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHoursPerDayModal((prev) => {
                            const baseUserId = prev.userId || 0;
                            const baseHoursPerDay = parseFloat(prev.hoursPerDay) || prev.maxDailyHours || 8;
                            const existingEntries = Array.isArray(prev.splitEntries) ? prev.splitEntries : [];
                            const leafTaskIds = Array.isArray(prev.leafTasks) ? prev.leafTasks.map((leafTask) => leafTask.Id) : [];
                            const leafTasksById = new Map((prev.leafTasks || []).map((leafTask) => [leafTask.Id, leafTask]));
                            const autoPlannedHours = prev.isParentTask
                              ? Number(leafTaskIds.reduce((sum, leafTaskId) => {
                                  const fallbackEstimated = parseFloat(String(leafTasksById.get(leafTaskId)?.EstimatedHours || 0));
                                  return sum + (leafTaskRemainingHoursById[leafTaskId] ?? fallbackEstimated);
                                }, 0).toFixed(2))
                              : prev.totalHours;
                            const nextEntries = existingEntries.length > 0
                              ? existingEntries
                              : [{
                                  userId: baseUserId,
                                  plannedHours: autoPlannedHours,
                                  hoursPerDay: baseHoursPerDay,
                                  splitOrder: 1,
                                  selectedLeafTaskIds: prev.isParentTask ? leafTaskIds : [],
                                }];

                            return {
                              ...prev,
                              enableSplit: true,
                              splitMode: prev.splitMode || 'parallel',
                              splitEntries: nextEntries,
                            };
                          });
                        }}
                        disabled={!!(hoursPerDayModal.sourceUserId || hoursPerDayModal.sourceHeaderId || hoursPerDayModal.suppressDependentReplan)}
                        className={`h-10 px-4 text-sm font-medium transition-colors ${(hoursPerDayModal.enableSplit && !(hoursPerDayModal.sourceUserId || hoursPerDayModal.sourceHeaderId || hoursPerDayModal.suppressDependentReplan))
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        Split planning
                      </button>
                    </div>

                    {!!(hoursPerDayModal.sourceUserId || hoursPerDayModal.sourceHeaderId || hoursPerDayModal.suppressDependentReplan) && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Split planning is disabled when replanning or moving an existing allocation slice.
                      </p>
                    )}

                    {hoursPerDayModal.isParentTask && hoursPerDayModal.enableSplit && !(hoursPerDayModal.sourceUserId || hoursPerDayModal.sourceHeaderId || hoursPerDayModal.suppressDependentReplan) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        For parent tasks, select which subtasks each user will own.
                      </p>
                    )}

                    {hoursPerDayModal.enableSplit && !(hoursPerDayModal.sourceUserId || hoursPerDayModal.sourceHeaderId || hoursPerDayModal.suppressDependentReplan) && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Allocation Mode</label>
                          <select
                            value={hoursPerDayModal.splitMode || 'parallel'}
                            onChange={(e) => setHoursPerDayModal((prev) => ({ ...prev, splitMode: e.target.value === 'sequential' ? 'sequential' : 'parallel' }))}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="parallel">Parallel</option>
                            <option value="sequential">Sequential</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          {(hoursPerDayModal.splitEntries || []).map((entry, index) => (
                            <div key={index} className="space-y-3 p-3 border border-gray-200 dark:border-gray-700 rounded">
                              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_40px] gap-3 items-start">
                              <div className="min-w-0">
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">User</label>
                                <SearchableSelect
                                  value={entry.userId || ''}
                                  onChange={(value) => {
                                    const parsedValue = parseInt(String(value || ''), 10) || 0;
                                    setHoursPerDayModal((prev) => ({
                                      ...prev,
                                      splitEntries: (prev.splitEntries || []).map((row, rowIndex) => rowIndex === index ? { ...row, userId: parsedValue } : row)
                                    }));
                                  }}
                                  dropdownMode="portal"
                                  options={users.map((planningUser) => ({
                                    value: planningUser.Id,
                                    label: planningUser.FirstName && planningUser.LastName
                                      ? `${planningUser.FirstName} ${planningUser.LastName} (${planningUser.Username})`
                                      : planningUser.FirstName || planningUser.Username,
                                  }))}
                                  placeholder="User"
                                  emptyText="Select user"
                                />
                              </div>
                              <div className="min-w-0">
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Hours</label>
                                <input
                                  type="number"
                                  min="0.5"
                                  step="0.5"
                                  value={entry.plannedHours}
                                  onChange={(e) => {
                                    const value = roundToPlanningStep(parseFloat(e.target.value) || 0);
                                    setHoursPerDayModal((prev) => ({
                                      ...prev,
                                      splitEntries: (prev.splitEntries || []).map((row, rowIndex) => rowIndex === index ? { ...row, plannedHours: value } : row)
                                    }));
                                  }}
                                  className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                                <p className={`mt-1 text-[11px] min-h-[16px] ${hoursPerDayModal.isParentTask ? 'text-gray-500 dark:text-gray-400' : 'invisible'}`}>
                                  Auto from subtasks (editable)
                                </p>
                              </div>
                              <div className="min-w-0">
                                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">h/day</label>
                                <input
                                  type="number"
                                  min="0.5"
                                  step="0.5"
                                  value={entry.hoursPerDay}
                                  onChange={(e) => {
                                    const value = roundToPlanningStep(parseFloat(e.target.value) || 0);
                                    setHoursPerDayModal((prev) => ({
                                      ...prev,
                                      splitEntries: (prev.splitEntries || []).map((row, rowIndex) => rowIndex === index ? { ...row, hoursPerDay: value } : row)
                                    }));
                                  }}
                                  className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                              </div>
                              <div className="flex md:items-end justify-end h-full md:pb-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHoursPerDayModal((prev) => ({
                                      ...prev,
                                      splitEntries: (prev.splitEntries || []).filter((_, rowIndex) => rowIndex !== index).map((row, idx) => ({ ...row, splitOrder: idx + 1 }))
                                    }));
                                  }}
                                  className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                  title="Remove split"
                                  aria-label="Remove split"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                              </div>

                              {hoursPerDayModal.isParentTask && (
                                <div>
                                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Subtasks</label>
                                  <SearchableMultiSelect
                                    values={Array.isArray(entry.selectedLeafTaskIds) ? entry.selectedLeafTaskIds : []}
                                    onChange={(values) => {
                                      const parsedValues = values
                                        .map((value) => Number(value))
                                        .filter((value) => Number.isFinite(value) && value > 0);
                                      setHoursPerDayModal((prev) => ({
                                        ...prev,
                                        splitEntries: (prev.splitEntries || []).map((row, rowIndex) => {
                                          if (rowIndex !== index) {
                                            return row;
                                          }

                                          const leafTasksById = new Map((prev.leafTasks || []).map((leafTask) => [leafTask.Id, leafTask]));
                                          const suggestedHours = Number(parsedValues.reduce((sum, leafTaskId) => {
                                            const fallbackEstimated = parseFloat(String(leafTasksById.get(leafTaskId)?.EstimatedHours || 0));
                                            return sum + (leafTaskRemainingHoursById[leafTaskId] ?? fallbackEstimated);
                                          }, 0).toFixed(2));

                                          return {
                                            ...row,
                                            selectedLeafTaskIds: parsedValues,
                                            plannedHours: suggestedHours,
                                          };
                                        })
                                      }));
                                    }}
                                    options={(hoursPerDayModal.leafTasks || [])
                                      .filter((leafTask) => {
                                        // Exclude tasks already selected by other user rows
                                        const selectedInOthers = new Set(
                                          (hoursPerDayModal.splitEntries || [])
                                            .flatMap((row, rowIndex) => rowIndex !== index ? (row.selectedLeafTaskIds || []) : [])
                                        );
                                        return !selectedInOthers.has(leafTask.Id);
                                      })
                                      .map((leafTask) => ({
                                        value: leafTask.Id,
                                        label: leafTask.TaskName,
                                        subtitle: `${(leafTaskRemainingHoursById[leafTask.Id] ?? parseFloat(String(leafTask.EstimatedHours || 0))).toFixed(1)}h remaining`
                                      }))}
                                    placeholder="Select subtasks"
                                    dropdownMode="portal"
                                  />

                                  <div className="mt-2">
                                    {Array.isArray(entry.selectedLeafTaskIds) && entry.selectedLeafTaskIds.length > 0 ? (
                                      <div className="flex flex-wrap gap-1.5">
                                        {entry.selectedLeafTaskIds
                                          .map((taskId) => (hoursPerDayModal.leafTasks || []).find((leafTask) => leafTask.Id === taskId))
                                          .filter((leafTask): leafTask is Task => Boolean(leafTask))
                                          .map((leafTask) => {
                                            const remainingHours = leafTaskRemainingHoursById[leafTask.Id] ?? parseFloat(String(leafTask.EstimatedHours || 0));
                                            return (
                                              <span
                                                key={leafTask.Id}
                                                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                                                title={`${leafTask.TaskName} (${remainingHours.toFixed(1)}h remaining)`}
                                              >
                                                <span className="font-medium">{leafTask.TaskName}</span>
                                                <span className="opacity-80">({remainingHours.toFixed(1)}h)</span>
                                              </span>
                                            );
                                          })}
                                      </div>
                                    ) : (
                                      <p className="text-[11px] text-gray-500 dark:text-gray-400">No subtasks selected.</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              setHoursPerDayModal((prev) => ({
                                ...prev,
                                splitEntries: [
                                  ...(prev.splitEntries || []),
                                  {
                                    userId: 0,
                                    plannedHours: 0,
                                    hoursPerDay: roundToPlanningStep(parseFloat(prev.hoursPerDay) || prev.maxDailyHours || 8),
                                    splitOrder: (prev.splitEntries?.length || 0) + 1,
                                    selectedLeafTaskIds: prev.isParentTask ? [] : undefined,
                                  }
                                ]
                              }));
                            }}
                            className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                          >
                            Add User Split
                          </button>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Total split hours: {(hoursPerDayModal.splitEntries || []).reduce((sum, row) => sum + (Number(row.plannedHours) || 0), 0).toFixed(2)}h
                          </span>
                        </div>
                      </>
                    )}
                 
              </div>

              {!(hoursPerDayModal.enableSplit && !(hoursPerDayModal.sourceUserId || hoursPerDayModal.sourceHeaderId || hoursPerDayModal.suppressDependentReplan)) && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      How many hours to plan?
                    </label>
                    <input
                      type="number"
                      min="0.5"
                      max={hoursPerDayModal.totalEstimatedHours > 0 ? hoursPerDayModal.totalEstimatedHours : undefined}
                      step="0.5"
                      value={hoursPerDayModal.totalHours}
                      onChange={(e) => setHoursPerDayModal(prev => ({ ...prev, totalHours: roundToPlanningStep(parseFloat(e.target.value) || 0) }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-semibold"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Suggested: {suggestedPlanningHours.toFixed(1)}h {sliceSuggestedHours !== null ? '(current slice)' : '(estimated - worked)'}
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
                      onChange={(e) => setHoursPerDayModal(prev => ({ ...prev, hoursPerDay: String(roundToPlanningStep(parseFloat(e.target.value) || 0)) }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Your daily work capacity: {hoursPerDayModal.maxDailyHours} hours
                    </p>
                  </div>
                </>
              )}
              </div>

              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3 bg-white dark:bg-gray-800">
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

        {sliceTransferModal.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Move Allocation Slice</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  You used Ctrl+drag. Select how many hours to move from this allocation.
                </p>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Hours to move</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    max={sliceTransferModal.totalHours}
                    value={sliceTransferModal.moveHours}
                      onChange={(e) => setSliceTransferModal((prev) => ({ ...prev, moveHours: roundToPlanningStep(parseFloat(e.target.value) || 0) }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Total available in slice: {sliceTransferModal.totalHours.toFixed(2)}h
                </p>

                {sliceTransferModal.availableChildTaskIds.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Subtasks to move</label>
                    <SearchableMultiSelect
                      values={sliceTransferModal.selectedChildTaskIds}
                      onChange={(values) => {
                        const parsed = values
                          .map((value) => Number(value))
                          .filter((value) => Number.isFinite(value) && value > 0);
                        setSliceTransferModal((prev) => ({
                          ...prev,
                          selectedChildTaskIds: parsed,
                          totalHours: prev.taskId
                            ? roundToPlanningStep(calculateSliceHoursFromSelectedSubtasks(
                                prev.taskId,
                                parsed,
                                prev.sourceAllocationDates,
                                prev.sourceTotalHours,
                                prev.availableChildTaskIds.length,
                                prev.sourceHeaderId
                              ))
                            : 0,
                          moveHours: prev.taskId
                            ? roundToPlanningStep(calculateSliceHoursFromSelectedSubtasks(
                                prev.taskId,
                                parsed,
                                prev.sourceAllocationDates,
                                prev.sourceTotalHours,
                                prev.availableChildTaskIds.length,
                                prev.sourceHeaderId
                              ))
                            : 0,
                        }));
                      }}
                      options={sliceTransferModal.availableChildTaskIds
                        .map((taskId) => tasks.find((taskEntry) => Number(taskEntry.Id) === Number(taskId)))
                        .filter((taskEntry): taskEntry is Task => Boolean(taskEntry))
                        .map((taskEntry) => ({
                          value: taskEntry.Id,
                          label: taskEntry.TaskName,
                          subtitle: `${parseFloat(String(taskEntry.EstimatedHours || 0)).toFixed(1)}h`,
                        }))}
                      placeholder="Select subtasks"
                      dropdownMode="portal"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Select only the subtasks that should move with this slice.
                    </p>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                <button
                  onClick={() => setSliceTransferModal({
                    show: false,
                    taskId: null,
                    targetUserId: null,
                    dropDate: '',
                    sourceUserId: null,
                    sourceHeaderId: null,
                    sourceAllocationDates: [],
                    sourceTotalHours: 0,
                    totalHours: 0,
                    moveHours: 0,
                    availableChildTaskIds: [],
                    selectedChildTaskIds: [],
                    isProcessing: false,
                  })}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                  disabled={sliceTransferModal.isProcessing}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSliceTransfer}
                  disabled={
                    sliceTransferModal.isProcessing ||
                    !Number.isFinite(sliceTransferModal.moveHours) ||
                    sliceTransferModal.moveHours <= 0 ||
                    sliceTransferModal.moveHours > sliceTransferModal.totalHours ||
                    (sliceTransferModal.availableChildTaskIds.length > 0 && sliceTransferModal.selectedChildTaskIds.length === 0)
                  }
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg"
                >
                  {sliceTransferModal.isProcessing ? 'Moving...' : 'Move Slice'}
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

        <ConfirmAlertModal
          isOpen={!!modalMessage}
          type={modalMessage?.type || 'confirm'}
          title={modalMessage?.title || ''}
          message={modalMessage?.message || ''}
          onClose={closeModal}
          onConfirm={handleModalConfirm}
          confirmLabel="Confirm"
          alertLabel="OK"
          confirmVariant="primary"
          preserveLineBreaks
        />

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
                      onChange={(e) => setManualAllocationModal(prev => ({ ...prev, allocatedHours: String(roundToPlanningStep(parseFloat(e.target.value) || 0)) }))}
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

        {/* Allocation Snapshots Modal */}
        {snapshotModal.show && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[130] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Allocation Snapshots</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Save and restore the complete state of all resource allocations</p>
                </div>
                <button
                  onClick={() => setSnapshotModal(prev => ({ ...prev, show: false }))}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition-colors"
                  aria-label="Close snapshots modal"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Create new snapshot */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-3">Take New Snapshot</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={snapshotModal.newName}
                        onChange={(e) => setSnapshotModal(prev => ({ ...prev, newName: e.target.value, error: '' }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSnapshot(); }}
                        placeholder="e.g. Before Sprint 5 replanning"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                        disabled={snapshotModal.isSaving}
                        maxLength={255}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
                      <input
                        type="text"
                        value={snapshotModal.newDescription}
                        onChange={(e) => setSnapshotModal(prev => ({ ...prev, newDescription: e.target.value }))}
                        placeholder="Optional notes about this snapshot"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                        disabled={snapshotModal.isSaving}
                        maxLength={500}
                      />
                    </div>
                    {snapshotModal.error && (
                      <p className="text-sm text-red-600 dark:text-red-400">{snapshotModal.error}</p>
                    )}
                    <button
                      onClick={handleCreateSnapshot}
                      disabled={snapshotModal.isSaving || !snapshotModal.newName.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
                    >
                      {snapshotModal.isSaving ? (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Saving…
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Take Snapshot
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Existing snapshots list */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Saved Snapshots</h3>
                  {snapshotModal.isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <svg className="animate-spin w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                  ) : snapshotModal.snapshots.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                      No snapshots yet. Take the first one above.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {snapshotModal.snapshots.map((snapshot: any) => {
                        const createdBy = snapshot.FirstName && snapshot.LastName
                          ? `${snapshot.FirstName} ${snapshot.LastName}`
                          : snapshot.Username || 'Unknown';
                        const createdAt = new Date(snapshot.CreatedAt).toLocaleString('en-GB', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        });
                        return (
                          <div
                            key={snapshot.Id}
                            className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{snapshot.Name}</p>
                                {snapshot.Description && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{snapshot.Description}</p>
                                )}
                                <div className="flex flex-wrap gap-3 mt-2">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{createdAt} · {createdBy}</span>
                                </div>
                                <div className="flex gap-3 mt-1.5">
                                  <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-600 rounded px-1.5 py-0.5">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    {snapshot.TotalHeaders} slices
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-600 rounded px-1.5 py-0.5">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    {snapshot.TotalAllocations} days
                                  </span>
                                  {snapshot.TotalChildAllocations > 0 && (
                                    <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-600 rounded px-1.5 py-0.5">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                                      {snapshot.TotalChildAllocations} child
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleRestoreSnapshot(snapshot)}
                                  className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 rounded transition-colors"
                                  title="Restore this snapshot"
                                  aria-label="Restore snapshot"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteSnapshot(snapshot)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                                  title="Delete this snapshot"
                                  aria-label="Delete snapshot"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {showOutlookActionModal && selectedOutlookEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">📅 Outlook Event</h3>
                <button
                  onClick={closeOutlookActionModal}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {selectedOutlookEvent.subject}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  📆 {formatOutlookEventDate(selectedOutlookEvent.start)}
                </p>
                {!selectedOutlookEvent.isAllDay && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    🕐 {formatOutlookEventTimeRange(selectedOutlookEvent)}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  What would you like to do?
                </p>
                {selectedOutlookEvent.webLink && (
                  <button
                    onClick={handleOpenOutlookEvent}
                    className="w-full flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-2xl">🌐</span>
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white">Open in Outlook</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">View the meeting in Office / Outlook</p>
                    </div>
                  </button>
                )}
                <button
                  onClick={() => void handleStartOutlookCallTimer()}
                  disabled={isStartingOutlookTimer}
                  className="w-full flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
                >
                  <span className="text-2xl">📞</span>
                  <div className="text-left">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {isStartingOutlookTimer ? 'Starting...' : 'Start Call Timer'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Start a call record timer with the meeting subject
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ScrollToTopButton scrollContainerRef={scrollContainerRef} />
    </div>
    </CustomerUserGuard>
  );
}

