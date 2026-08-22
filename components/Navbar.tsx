'use client';

import { getApiUrl } from '@/lib/api/config';

import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { tasksApi, Task as ApiTask } from '@/lib/api/tasks';
import { projectsApi, Project as ApiProject } from '@/lib/api/projects';
import RichTextEditor from './RichTextEditor';
import SearchableSelect from './SearchableSelect';
import CallRecordFormModal, { CallRecordFormValues } from './CallRecordFormModal';
import TimeEntryFormModal, { TimeEntryFormValues } from './TimeEntryFormModal';
import ProjectFormModal from './ProjectFormModal';
import CustomerFormModal, { CustomerFormValues } from './CustomerFormModal';
import TimerStartModal, { TimerMode, TimerStartCallFormValues } from './TimerStartModal';
import NavDropdownMenu from './navbar/NavDropdownMenu';
import TaskDetailModal from './TaskDetailModal';
import { useToast } from '@/contexts/ToastContext';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { createCustomer, CreateCustomerData } from '@/lib/api/customers';
import { io, Socket } from 'socket.io-client';
import { ThemeMode, getStoredThemeMode, setThemeMode } from '@/lib/theme';
import { ColorVisionMode, getStoredColorVisionMode } from '@/lib/colorVision';
import ColorVisionPicker from './navbar/ColorVisionPicker';
import { useIsMobile } from '@/hooks/useIsMobile';

interface Organization {
  Id: number;
  Name: string;
}

interface Project {
  Id: number;
  ProjectName: string;
  OrganizationId: number;
}

interface PriorityValue {
  Id: number;
  OrganizationId: number;
  PriorityName: string;
  ColorCode?: string;
  SortOrder: number;
  IsDefault: number;
}

interface OrgMember {
  Id: number;
  FirstName: string;
  LastName: string;
  Username: string;
}

interface TimerStartTaskOption {
  Id: number;
  TaskName: string;
  ProjectName?: string;
}

interface SupportUser {
  Id: number;
  FirstName: string;
  LastName: string;
  Username: string;
  IsSupport?: number;
}

const buildDefaultCustomerFormValues = (organizations: Organization[]): CustomerFormValues => ({
  Name: '',
  ExternalName: '',
  Email: '',
  Phone: '',
  Address: '',
  Notes: '',
  OrganizationIds: organizations.length === 1 ? [organizations[0].Id] : [],
  DefaultSupportUserId: null,
  CreateDefaultProject: false,
  DefaultProjectName: '',
  CustomFields: {},
});

export default function Navbar() {
  const { user, token, logout, isCustomerUser } = useAuth();
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [colorVisionMode, setColorVisionModeState] = useState<ColorVisionMode>('default');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Menu dropdowns
  const [workMenuOpen, setWorkMenuOpen] = useState(false);
  const [workLogsMenuOpen, setWorkLogsMenuOpen] = useState(false);
  const [managementMenuOpen, setManagementMenuOpen] = useState(false);
  const workMenuRef = useRef<HTMLDivElement>(null);
  const workLogsMenuRef = useRef<HTMLDivElement>(null);
  const managementMenuRef = useRef<HTMLDivElement>(null);
  const workMenuCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const workLogsMenuCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const managementMenuCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Global Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [memosEnabled, setMemosEnabled] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [companyName, setCompanyName] = useState('Project Management');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [navbarMenuLayout, setNavbarMenuLayout] = useState<'top' | 'left'>('top');
  const [navbarLeftMode, setNavbarLeftMode] = useState<'fixed' | 'floating'>('fixed');
  const [navbarLeftCollapsed, setNavbarLeftCollapsed] = useState(false);
  const [isLeftSidebarHovered, setIsLeftSidebarHovered] = useState(false);
  const [isFloatingSidebarOpen, setIsFloatingSidebarOpen] = useState(false);
  const [isTopMobileNavOpen, setIsTopMobileNavOpen] = useState(false);

  // Notifications state
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [canAccessApprovals, setCanAccessApprovals] = useState(false);
  const [canAccessVacationApprovals, setCanAccessVacationApprovals] = useState(false);
  const [canAccessOutOfOfficeApprovals, setCanAccessOutOfOfficeApprovals] = useState(false);
  const [canAccessDevSupportManagement, setCanAccessDevSupportManagement] = useState(false);

  // Active timer state
  const [navTimer, setNavTimer] = useState<{
    Id: number;
    TaskId?: number | null;
    TaskName?: string | null;
    ProjectId?: number | null;
    ProjectName?: string | null;
    TimerType?: string | null;
    CallType?: string | null;
    Subject?: string | null;
    Participants?: string | null;
    StartedAt: string;
  } | null>(null);
  const [navTimerSeconds, setNavTimerSeconds] = useState(0);
  const navTimerTickRef = useRef<NodeJS.Timeout | null>(null);
  const navTimerPollRef = useRef<NodeJS.Timeout | null>(null);
  const [showNavStartTimerModal, setShowNavStartTimerModal] = useState(false);
  const [timerStartMode, setTimerStartMode] = useState<TimerMode>('task');
  const [timerStartTasks, setTimerStartTasks] = useState<TimerStartTaskOption[]>([]);
  const [timerStartTaskId, setTimerStartTaskId] = useState<number | null>(null);
  const [timerStartTime, setTimerStartTime] = useState('');
  const [isLoadingTimerStartTasks, setIsLoadingTimerStartTasks] = useState(false);
  const [timerStartOrganizations, setTimerStartOrganizations] = useState<Organization[]>([]);
  const [timerStartProjects, setTimerStartProjects] = useState<Project[]>([]);
  const [timerStartCallTasks, setTimerStartCallTasks] = useState<TimerStartTaskOption[]>([]);
  const [isLoadingTimerStartProjects, setIsLoadingTimerStartProjects] = useState(false);
  const [isLoadingTimerStartCallTasks, setIsLoadingTimerStartCallTasks] = useState(false);
  const [timerStartCallForm, setTimerStartCallForm] = useState<TimerStartCallFormValues>({
    organizationId: '',
    projectId: '',
    taskId: '',
    callType: 'Teams',
    participants: '',
    subject: '',
    notes: '',
  });
  const [isStartingTimer, setIsStartingTimer] = useState(false);
  const [timerStartError, setTimerStartError] = useState('');
  const [navTaskModalState, setNavTaskModalState] = useState<{
    show: boolean;
    isLoading: boolean;
    project: any | null;
    task: any | null;
    tasks: any[];
    error: string;
  }>({
    show: false,
    isLoading: false,
    project: null,
    task: null,
    tasks: [],
    error: '',
  });

  // Quick Actions dropdown state
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [showDesktopDownloadModal, setShowDesktopDownloadModal] = useState(false);
  
  // Modal type: 'task' | 'organization' | 'project' | 'customer' | 'timeEntry' | 'callRecord' | null
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Quick Task Add state
  const [showQuickTaskModal, setShowQuickTaskModal] = useState(false);
  const [quickTaskCreateModalState, setQuickTaskCreateModalState] = useState<{
    show: boolean;
    isLoading: boolean;
    project: ApiProject | null;
    tasks: ApiTask[];
    error: string;
  }>({
    show: false,
    isLoading: false,
    project: null,
    tasks: [],
    error: '',
  });
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customerOrganizations, setCustomerOrganizations] = useState<Organization[]>([]);
  const [customerSupportUsers, setCustomerSupportUsers] = useState<SupportUser[]>([]);
  const [customerForm, setCustomerForm] = useState<CustomerFormValues>(buildDefaultCustomerFormValues([]));
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [taskPriorities, setTaskPriorities] = useState<PriorityValue[]>([]);
  const [taskTypes, setTaskTypes] = useState<StatusValue[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const setErrorWithToast = (message: string) => {
    setError(message);
    showToast({ type: 'error', title: 'Quick Action Error', message });
  };

  const setTimerStartErrorWithToast = (message: string) => {
    setTimerStartError(message);
    showToast({ type: 'error', title: 'Timer Error', message });
  };
  
  // Form state
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [taskForm, setTaskForm] = useState({
    projectId: '',
    taskName: '',
    description: '',
    status: '',
    priority: '',
    taskType: '',
    assignedTo: '',
    dueDate: '',
    estimatedHours: '',
    unscheduledWork: false,
  });

  // Organization form
  const [orgForm, setOrgForm] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    setThemeModeState(getStoredThemeMode());
    setColorVisionModeState(getStoredColorVisionMode());
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (quickActionsRef.current && !quickActionsRef.current.contains(event.target as Node)) {
        setQuickActionsOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
      if (workMenuRef.current && !workMenuRef.current.contains(event.target as Node)) {
        setWorkMenuOpen(false);
      }
      if (workLogsMenuRef.current && !workLogsMenuRef.current.contains(event.target as Node)) {
        setWorkLogsMenuOpen(false);
      }
      if (managementMenuRef.current && !managementMenuRef.current.contains(event.target as Node)) {
        setManagementMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (workMenuCloseTimeoutRef.current) clearTimeout(workMenuCloseTimeoutRef.current);
      if (workLogsMenuCloseTimeoutRef.current) clearTimeout(workLogsMenuCloseTimeoutRef.current);
      if (managementMenuCloseTimeoutRef.current) clearTimeout(managementMenuCloseTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const loadFeatureFlags = async () => {
      try {
        const publicRes = await fetch(`${getApiUrl()}/api/system-settings/public`);
        if (publicRes.ok) {
          const publicData = await publicRes.json();
          setCompanyName(publicData.companyName || 'Project Management');
          setCompanyLogoUrl(publicData.companyLogoUrl || '');
          setIsDemoMode(publicData.demoMode === true);
        } else {
          setCompanyName('Project Management');
          setCompanyLogoUrl('');
          setIsDemoMode(false);
        }

        if (!token) {
          setInternalTicketsEnabled(true);
          setMemosEnabled(true);
          return;
        }

        const flagsRes = await fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (flagsRes.ok) {
          const flagsData = await flagsRes.json();
          setInternalTicketsEnabled(flagsData.internalTicketsEnabled !== false);
          setMemosEnabled(flagsData.memosEnabled !== false);
        } else {
          setInternalTicketsEnabled(true);
          setMemosEnabled(true);
        }
      } catch {
        setInternalTicketsEnabled(true);
        setMemosEnabled(true);
        setCompanyName('Project Management');
        setCompanyLogoUrl('');
        setIsDemoMode(false);
      }
    };

    loadFeatureFlags();
  }, [token]);

  useEffect(() => {
    const loadNavbarPreferences = async () => {
      if (!token) return;
      try {
        const response = await fetch(`${getApiUrl()}/api/users/profile`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!response.ok) return;
        const data = await response.json();
        const profile = data?.user;
        if (!profile) return;
        setNavbarMenuLayout((profile.NavbarMenuLayout || 'top') === 'left' ? 'left' : 'top');
        setNavbarLeftMode((profile.NavbarLeftMode || 'fixed') === 'floating' ? 'floating' : 'fixed');
        setNavbarLeftCollapsed(!!profile.NavbarLeftCollapsed);
      } catch {
        setNavbarMenuLayout('top');
        setNavbarLeftMode('fixed');
        setNavbarLeftCollapsed(false);
      }
    };

    loadNavbarPreferences();
  }, [token]);

  useEffect(() => {
    document.body.classList.remove('nav-left-fixed-expanded');
    document.body.classList.remove('nav-left-fixed-collapsed');

    // On mobile, left sidebar is always treated as floating (no fixed content offset)
    const effectiveLeftMode =
      isMobile && navbarMenuLayout === 'left' ? 'floating' : navbarLeftMode;

    const shouldApplyFixedOffset =
      navbarMenuLayout === 'left' &&
      effectiveLeftMode === 'fixed';

    if (shouldApplyFixedOffset) {
      document.body.classList.add(navbarLeftCollapsed ? 'nav-left-fixed-collapsed' : 'nav-left-fixed-expanded');
    }

    return () => {
      document.body.classList.remove('nav-left-fixed-expanded');
      document.body.classList.remove('nav-left-fixed-collapsed');
    };
  }, [navbarMenuLayout, navbarLeftMode, navbarLeftCollapsed, isMobile]);

  useEffect(() => {
    if (isMobile) {
      setIsFloatingSidebarOpen(false);
    }
  }, [isMobile]);

  const saveNavbarPreference = async (updates: {
    navbarLeftCollapsed?: boolean;
  }) => {
    if (!token) return;
    try {
      await fetch(`${getApiUrl()}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
    } catch {
      // no-op
    }
  };

  // Load notification count on mount and periodically (fallback polling at 5 min)
  useEffect(() => {
    if (token) {
      loadNotificationCount();
      const interval = setInterval(loadNotificationCount, 300000); // Fallback: 5 minutes
      return () => clearInterval(interval);
    }
  }, [token]);

  // Real-time socket.io connection for instant notification push
  useEffect(() => {
    if (!token) return;

    const apiBase = getApiUrl();
    const socketOptions = {
      path: '/api/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    };
    const socket: Socket = apiBase ? io(apiBase, socketOptions) : io(socketOptions);

    socket.on('connect', () => {
      console.debug('[Socket] Connected for real-time notifications');
    });

    socket.on('notification', (notif: any) => {
      // Increment unread badge
      setUnreadCount(prev => prev + 1);
      // Prepend to the notifications list (if the dropdown is open)
      setNotifications(prev => [notif, ...prev].slice(0, 50));
    });

    socket.on('disconnect', () => {
      console.debug('[Socket] Disconnected from real-time notifications');
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  // Active timer: load + tick
  useEffect(() => {
    if (!token) return;
    const loadTimer = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/timers/active`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setNavTimer(data.timer || null);
        }
      } catch {}
    };
    loadTimer();
    navTimerPollRef.current = setInterval(loadTimer, 30000);
    // Also reload whenever a timer event fires from TaskDetailModal
    window.addEventListener('timer-changed', loadTimer);
    return () => {
      if (navTimerPollRef.current) clearInterval(navTimerPollRef.current);
      window.removeEventListener('timer-changed', loadTimer);
    };
  }, [token]);

  useEffect(() => {
    if (navTimerTickRef.current) clearInterval(navTimerTickRef.current);
    if (navTimer) {
      // StartedAt is stored as UTC in the DB but returned without timezone info (e.g. "2026-04-06 21:30:00").
      // Append 'Z' to force UTC parsing; otherwise the browser treats it as local time, causing a skewed elapsed time.
      const toUtcMs = (s: string) => {
        if (!s) return Date.now();
        if (/Z$|[+-]\d{2}:\d{2}$/.test(s)) return new Date(s).getTime();
        return new Date(s.replace(' ', 'T') + 'Z').getTime();
      };
      const tick = () => setNavTimerSeconds(Math.max(0, Math.floor((Date.now() - toUtcMs(navTimer.StartedAt)) / 1000)));
      tick();
      navTimerTickRef.current = setInterval(tick, 1000);
    } else {
      setNavTimerSeconds(0);
    }
    return () => { if (navTimerTickRef.current) clearInterval(navTimerTickRef.current); };
  }, [navTimer]);

  useEffect(() => {
    const loadApprovalScope = async () => {
      if (!token || !user || isCustomerUser) {
        setCanAccessApprovals(false);
        setCanAccessVacationApprovals(false);
        setCanAccessOutOfOfficeApprovals(false);
        setCanAccessDevSupportManagement(false);
        return;
      }

      if (user.isAdmin) {
        setCanAccessApprovals(true);
        setCanAccessVacationApprovals(true);
        setCanAccessOutOfOfficeApprovals(true);
        setCanAccessDevSupportManagement(true);
        return;
      }

      try {
        const res = await fetch(`${getApiUrl()}/api/time-entries/approval-scope`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          setCanAccessApprovals(false);
          return;
        }

        const data = await res.json();
        setCanAccessApprovals(!!data?.canApprove);
      } catch {
        setCanAccessApprovals(false);
      }

      try {
        const vacationRes = await fetch(`${getApiUrl()}/api/vacations/approval-scope`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!vacationRes.ok) {
          setCanAccessVacationApprovals(false);
          return;
        }
        const vacationData = await vacationRes.json();
        setCanAccessVacationApprovals(!!vacationData?.canApprove);
      } catch {
        setCanAccessVacationApprovals(false);
      }

      try {
        const outOfOfficeRes = await fetch(`${getApiUrl()}/api/out-of-office/approval-scope`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!outOfOfficeRes.ok) {
          setCanAccessOutOfOfficeApprovals(false);
          return;
        }
        const outOfOfficeData = await outOfOfficeRes.json();
        setCanAccessOutOfOfficeApprovals(!!outOfOfficeData?.canApprove);
      } catch {
        setCanAccessOutOfOfficeApprovals(false);
      }

      try {
        const devSupportRes = await fetch(`${getApiUrl()}/api/dev-support/manage-scope`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!devSupportRes.ok) {
          setCanAccessDevSupportManagement(false);
          return;
        }
        const devSupportData = await devSupportRes.json();
        setCanAccessDevSupportManagement(!!devSupportData?.canManage);
      } catch {
        setCanAccessDevSupportManagement(false);
      }
    };

    loadApprovalScope();
  }, [token, user, isCustomerUser]);

  const navFormatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  };

  const getCurrentTimeHHMM = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const closeNavStartTimerModal = () => {
    setShowNavStartTimerModal(false);
    setTimerStartTasks([]);
    setTimerStartTaskId(null);
    setTimerStartMode('task');
    setTimerStartTime('');
    setIsLoadingTimerStartTasks(false);
    setTimerStartOrganizations([]);
    setTimerStartProjects([]);
    setTimerStartCallTasks([]);
    setIsLoadingTimerStartProjects(false);
    setIsLoadingTimerStartCallTasks(false);
    setTimerStartCallForm({
      organizationId: '',
      projectId: '',
      taskId: '',
      callType: 'Teams',
      participants: '',
      subject: '',
      notes: '',
    });
    setTimerStartError('');
  };

  const loadTimerStartProjectsForOrg = async (organizationId: string) => {
    if (!token || !organizationId) {
      setTimerStartProjects([]);
      setTimerStartCallTasks([]);
      return;
    }

    setIsLoadingTimerStartProjects(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/projects?organizationId=${organizationId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to load projects');
      }

      const data = await response.json();
      setTimerStartProjects(Array.isArray(data.projects) ? data.projects : []);
    } finally {
      setIsLoadingTimerStartProjects(false);
    }
  };

  const loadTimerStartTasksForProject = async (projectId: string) => {
    if (!token || !projectId) {
      setTimerStartCallTasks([]);
      return;
    }

    setIsLoadingTimerStartCallTasks(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/tasks/project/${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to load tasks');
      }

      const data = await response.json();
      setTimerStartCallTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } finally {
      setIsLoadingTimerStartCallTasks(false);
    }
  };

  const openNavStartTimerModal = async () => {
    if (!token) return;

    setShowNavStartTimerModal(true);
    setTimerStartMode('task');
    setTimerStartError('');
    setIsStartingTimer(false);
    setIsLoadingTimerStartTasks(true);
    setTimerStartTime(getCurrentTimeHHMM());
    setTimerStartTaskId(null);
    setTimerStartProjects([]);
    setTimerStartCallTasks([]);
    setTimerStartCallForm({
      organizationId: '',
      projectId: '',
      taskId: '',
      callType: 'Teams',
      participants: '',
      subject: '',
      notes: '',
    });

    try {
      const [response, organizationsResponse] = await Promise.all([
        fetch(`${getApiUrl()}/api/timers/available-tasks`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${getApiUrl()}/api/organizations`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
      ]);

      if (!response.ok) {
        throw new Error('Failed to load tasks');
      }

      const data = await response.json();
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      setTimerStartTasks(tasks);

      if (organizationsResponse.ok) {
        const organizationsData = await organizationsResponse.json();
        setTimerStartOrganizations(Array.isArray(organizationsData.organizations) ? organizationsData.organizations : []);
      } else {
        setTimerStartOrganizations([]);
      }

      if (tasks.length === 1) {
        setTimerStartTaskId(Number(tasks[0].Id));
      }
    } catch (err: any) {
      setTimerStartErrorWithToast(err.message || 'Failed to load timer options');
    } finally {
      setIsLoadingTimerStartTasks(false);
    }
  };

  const handleNavStartTimer = async () => {
    if (!token) return;
    if (timerStartMode === 'task' && !timerStartTaskId) {
      setTimerStartErrorWithToast('Please select a task');
      return;
    }
    if (!timerStartTime) {
      setTimerStartErrorWithToast('Please select a start time');
      return;
    }

    const [hours, minutes] = timerStartTime.split(':').map((value) => parseInt(value, 10));
    const startedAt = new Date();
    startedAt.setHours(hours || 0, minutes || 0, 0, 0);

    if (startedAt.getTime() > Date.now()) {
      setTimerStartErrorWithToast('Start time cannot be in the future');
      return;
    }

    setIsStartingTimer(true);
    setTimerStartError('');
    const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      const response = await fetch(`${getApiUrl()}/api/timers/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timerType: timerStartMode,
          taskId: timerStartMode === 'task'
            ? timerStartTaskId
            : (timerStartCallForm.taskId ? parseInt(timerStartCallForm.taskId, 10) : null),
          organizationId: timerStartMode === 'callRecord' && timerStartCallForm.organizationId
            ? parseInt(timerStartCallForm.organizationId, 10)
            : null,
          projectId: timerStartMode === 'callRecord' && timerStartCallForm.projectId
            ? parseInt(timerStartCallForm.projectId, 10)
            : null,
          callType: timerStartMode === 'callRecord' ? timerStartCallForm.callType : null,
          participants: timerStartMode === 'callRecord' ? (timerStartCallForm.participants || null) : null,
          subject: timerStartMode === 'callRecord' ? (timerStartCallForm.subject || null) : null,
          description: timerStartMode === 'callRecord' ? (timerStartCallForm.notes || null) : null,
          startedAt: startedAt.toISOString(),
          clientTimezone,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to start timer');
      }

      setNavTimer(data.timer || null);
      closeNavStartTimerModal();
      window.dispatchEvent(new CustomEvent('timer-changed'));
    } catch (err: any) {
      setTimerStartErrorWithToast(err.message || 'Failed to start timer');
    } finally {
      setIsStartingTimer(false);
    }
  };

  const handleNavStopTimer = async () => {
    if (!navTimer) return;
    try {
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`${getApiUrl()}/api/timers/${navTimer.Id}/stop`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientTimezone }),
      });
      if (res.ok) {
        setNavTimer(null);
        window.dispatchEvent(new CustomEvent('timer-changed'));
      }
    } catch {}
  };

  const handleNavDiscardTimer = async () => {
    if (!navTimer) return;
    try {
      await fetch(`${getApiUrl()}/api/timers/${navTimer.Id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      setNavTimer(null);
      window.dispatchEvent(new CustomEvent('timer-changed'));
    } catch {}
  };

  const navTimerLabel = navTimer?.TimerType === 'callRecord'
    ? (navTimer.Subject || navTimer.Participants || `${navTimer.CallType || 'Call'} record`)
    : (navTimer?.TaskName || 'Running timer');

  const navTimerTitle = navTimer?.TimerType === 'callRecord'
    ? `Timer running: ${navTimer.Subject || navTimer.Participants || navTimer.CallType || 'Call record'}${navTimer.ProjectName ? ` — ${navTimer.ProjectName}` : ''}`
    : `Timer running: ${navTimer?.TaskName || ''}${navTimer?.ProjectName ? ` — ${navTimer.ProjectName}` : ''}`;

  const openNavTaskDetail = async (projectId: number, taskId: number) => {
    if (!token) return;

    setNavTaskModalState({
      show: true,
      isLoading: true,
      project: null,
      task: null,
      tasks: [],
      error: '',
    });

    try {
      const [projectRes, tasksRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/projects/${projectId}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
        fetch(`${getApiUrl()}/api/tasks/project/${projectId}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
      ]);

      if (!projectRes.ok) {
        throw new Error('Failed to load project for task detail');
      }

      const projectData = await projectRes.json();
      const project = projectData?.project || null;
      const tasksData = tasksRes.ok ? await tasksRes.json() : { tasks: [] };
      const projectTasks = Array.isArray(tasksData?.tasks) ? tasksData.tasks : [];
      const activeTask = projectTasks.find((taskItem: any) => Number(taskItem.Id) === Number(taskId)) || null;

      if (!project || !activeTask) {
        throw new Error('Task no longer exists in this project');
      }

      setNavTaskModalState({
        show: true,
        isLoading: false,
        project,
        task: activeTask,
        tasks: projectTasks,
        error: '',
      });
    } catch (error: any) {
      setNavTaskModalState({
        show: true,
        isLoading: false,
        project: null,
        task: null,
        tasks: [],
        error: error?.message || 'Failed to open task detail',
      });
    }
  };

  const handleOpenNavTimerTaskDetail = async () => {
    if (!navTimer) return;
    await openNavTaskDetail(Number(navTimer.ProjectId), Number(navTimer.TaskId));
  };

  const handleCloseNavTaskModal = () => {
    setNavTaskModalState({
      show: false,
      isLoading: false,
      project: null,
      task: null,
      tasks: [],
      error: '',
    });
  };

  const loadNotificationCount = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/notifications/count`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
    } catch (err) {
      console.error('Failed to load notification count:', err);
    }
  };

  const loadNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleNotificationsClick = () => {
    if (!notificationsOpen) {
      loadNotifications();
    }
    setNotificationsOpen(!notificationsOpen);
  };

  const markAsRead = async (id: number) => {
    try {
      await fetch(`${getApiUrl()}/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => n.Id === id ? { ...n, IsRead: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch(`${getApiUrl()}/api/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, IsRead: 1 })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  // Global Search
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    // Clear existing debounce
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    
    if (query.trim().length < 2) {
      setSearchResults(null);
      setSearchOpen(false);
      return;
    }
    
    // Debounce the search
    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setSearchOpen(true);
      setSearchPage(1);
      
      try {
        const res = await fetch(
          `${getApiUrl()}/api/search?q=${encodeURIComponent(query.trim())}&page=1`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results);
          setSearchHasMore(data.hasMore || false);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  const handleSearchResultClick = async (type: string, id: number, extra?: any) => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults(null);
    
    switch (type) {
      case 'task':
        if (!token) return;

        try {
          let projectId = Number(extra?.ProjectId || 0);

          if (!Number.isFinite(projectId) || projectId <= 0) {
            const response = await fetch(`${getApiUrl()}/api/tasks/${id}`, {
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            });

            if (response.ok) {
              const data = await response.json();
              projectId = Number(data?.task?.ProjectId || 0);
            }
          }

          if (Number.isFinite(projectId) && projectId > 0) {
            await openNavTaskDetail(projectId, id);
            return;
          }

          window.location.href = `/projects?task=${id}`;
        } catch {
          window.location.href = `/projects?task=${id}`;
        }
        break;
      case 'project':
        window.location.href = `/projects/${id}`;
        break;
      case 'organization':
        window.location.href = `/organizations/${id}`;
        break;
      case 'ticket':
        if (internalTicketsEnabled) {
          window.location.href = `/tickets/${id}`;
        }
        break;
      case 'user':
        // For now, just close the search - users don't have a dedicated page
        break;
    }
  };

  const isTypingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    const tagName = target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return true;
    if (target.isContentEditable) return true;
    if (target.closest('[contenteditable="true"]')) return true;
    if (target.closest('.ProseMirror')) return true;
    return false;
  };

  // Load organizations when modal opens
  const openQuickTaskModal = async () => {
    setActiveModal('task');
    setQuickActionsOpen(false);
    setShowQuickTaskModal(true);
    setError('');
    setIsLoadingData(true);
    setTaskForm(prev => ({
      ...prev,
      unscheduledWork: false,
    }));
    
    try {
      const res = await fetch(`${getApiUrl()}/api/organizations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
      }
    } catch (err) {
      console.error('Failed to load organizations:', err);
      setErrorWithToast('Failed to load organizations');
    } finally {
      setIsLoadingData(false);
    }
  };

  // Open other Quick Action modals
  const openQuickAction = async (type: string) => {
    setQuickActionsOpen(false);
    setError('');
    setActiveModal(type);
    
    if (type === 'task') {
      openQuickTaskModal();
      return;
    }

    if (type === 'customer') {
      if (!token) {
        setErrorWithToast('Authentication token is missing');
        return;
      }

      try {
        const [organizationsRes, usersRes] = await Promise.all([
          fetch(`${getApiUrl()}/api/organizations`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${getApiUrl()}/api/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        if (!organizationsRes.ok) {
          throw new Error('Failed to load organizations');
        }

        const orgData = await organizationsRes.json();
        const loadedOrganizations: Organization[] = orgData.organizations || [];
        setCustomerOrganizations(loadedOrganizations);

        if (usersRes.ok) {
          const usersData = await usersRes.json();
          const supportUsers: SupportUser[] = (usersData.users || []).filter((candidate: SupportUser) => candidate.IsSupport);
          setCustomerSupportUsers(supportUsers);
        } else {
          setCustomerSupportUsers([]);
        }

        setCustomerForm(buildDefaultCustomerFormValues(loadedOrganizations));
      } catch (err: any) {
        setErrorWithToast(err.message || 'Failed to load customer quick action data');
      }

      return;
    }

  };

  useEffect(() => {
    if (isCustomerUser) return;

    const handleQuickActionShortcuts = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (isTypingTarget(event.target)) return;

      const isShortcut = event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
      if (!isShortcut) return;

      const key = event.key.toLowerCase();

      if (key === 'q') {
        event.preventDefault();
        setQuickActionsOpen((prev) => !prev);
        return;
      }

      if (key === '1' && (permissions?.canManageProjects || permissions?.canCreateProjects)) {
        event.preventDefault();
        void openQuickAction('project');
        return;
      }

      if (key === '2' && (permissions?.canManageTasks || permissions?.canCreateTasks)) {
        event.preventDefault();
        void openQuickAction('task');
        return;
      }

      if (key === '3' && (permissions?.canManageTasks || permissions?.canCreateTasks || permissions?.canManageTimeEntries)) {
        event.preventDefault();
        void openQuickAction('timeEntry');
        return;
      }

      if (key === '4' && (user?.isSupport || permissions?.canManageTickets)) {
        event.preventDefault();
        void openQuickAction('callRecord');
        return;
      }

      if (key === '5' && permissions?.canCreateCustomers) {
        event.preventDefault();
        void openQuickAction('customer');
      }
    };

    document.addEventListener('keydown', handleQuickActionShortcuts);
    return () => document.removeEventListener('keydown', handleQuickActionShortcuts);
  }, [isCustomerUser, permissions, user?.isSupport]);

  // Save Organization
  const handleSaveOrganization = async () => {
    if (!orgForm.name.trim()) {
      setErrorWithToast('Organization name is required');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(`${getApiUrl()}/api/organizations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: orgForm.name.trim(),
          description: orgForm.description || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create organization');
      }
      closeAllModals();
      if (window.location.pathname.includes('/organizations')) {
        window.location.reload();
      }
    } catch (err: any) {
      setErrorWithToast(err.message || 'Failed to create organization');
    } finally {
      setIsSaving(false);
    }
  };

  // Save Customer
  const handleSaveCustomer = async (formValues: CustomerFormValues) => {
    if (!token) {
      setErrorWithToast('Authentication token is missing');
      return;
    }

    if (!formValues.Name.trim()) {
      setErrorWithToast('Customer name is required');
      return;
    }

    if (formValues.OrganizationIds.length === 0) {
      setErrorWithToast('At least one organization must be selected');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const createData: CreateCustomerData = {
        Name: formValues.Name,
        ExternalName: formValues.ExternalName || undefined,
        Email: formValues.Email || undefined,
        Phone: formValues.Phone || undefined,
        Address: formValues.Address || undefined,
        Notes: formValues.Notes || undefined,
        OrganizationIds: formValues.OrganizationIds,
        DefaultSupportUserId: formValues.DefaultSupportUserId || undefined,
        CreateDefaultProject: formValues.CreateDefaultProject,
        DefaultProjectName: formValues.CreateDefaultProject
          ? (formValues.DefaultProjectName || formValues.Name)
          : undefined,
        customFields: formValues.CustomFields,
      };

      await createCustomer(token, createData);
      closeAllModals();

      if (window.location.pathname.includes('/customers')) {
        window.location.reload();
      }
    } catch (err: any) {
      setErrorWithToast(err.message || 'Failed to create customer');
    } finally {
      setIsSaving(false);
    }
  };

  // Save Time Entry
  const handleSaveTimeEntry = async (timeEntryForm: TimeEntryFormValues) => {
    if (!timeEntryForm.taskId || !timeEntryForm.workDate) {
      setErrorWithToast('Task and Work Date are required');
      throw new Error('Task and Work Date are required');
    }
    
    let hours = timeEntryForm.hours ? parseFloat(timeEntryForm.hours) : 0;
    if (!hours && timeEntryForm.startTime && timeEntryForm.endTime) {
      const [startH, startM] = timeEntryForm.startTime.split(':').map(Number);
      const [endH, endM] = timeEntryForm.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      hours = Math.max(0, (endMinutes - startMinutes) / 60);
    }
    if (hours <= 0) {
      setErrorWithToast('Hours must be greater than 0');
      throw new Error('Hours must be greater than 0');
    }

    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(`${getApiUrl()}/api/time-entries`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: parseInt(timeEntryForm.taskId),
          workDate: timeEntryForm.workDate,
          startTime: timeEntryForm.startTime || null,
          endTime: timeEntryForm.endTime || null,
          hours: hours,
          description: timeEntryForm.description || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create time entry');
      }
      closeAllModals();
      if (window.location.pathname.includes('/dashboard')) {
        window.location.reload();
      }
    } catch (err: any) {
      const message = err.message || 'Failed to create time entry';
      setErrorWithToast(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Save Call Record
  const handleSaveCallRecord = async (callRecordForm: CallRecordFormValues) => {
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(`${getApiUrl()}/api/call-records`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: callRecordForm.organizationId ? parseInt(callRecordForm.organizationId) : null,
          taskId: callRecordForm.taskId ? parseInt(callRecordForm.taskId) : null,
          projectId: callRecordForm.projectId ? parseInt(callRecordForm.projectId) : null,
          callDate: callRecordForm.callDate,
          startTime: callRecordForm.startTime,
          durationMinutes: callRecordForm.durationMinutes,
          participants: callRecordForm.participants || null,
          callType: callRecordForm.callType,
          subject: callRecordForm.subject || null,
          notes: callRecordForm.notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create call record');
      }
      closeAllModals();
      if (window.location.pathname.includes('/call-records')) {
        window.location.reload();
      }
    } catch (err: any) {
      const message = err.message || 'Failed to create call record';
      setErrorWithToast(message);
      throw new Error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDesktopDownload = (platform: 'win' | 'linux') => {
    window.location.href = `${getApiUrl()}/api/downloads/desktop-app?platform=${platform}`;
    setShowDesktopDownloadModal(false);
    setDropdownOpen(false);
  };

  const openDesktopDownloadModal = () => {
    setShowDesktopDownloadModal(true);
    setDropdownOpen(false);
    if (isFloatingMode) {
      setIsFloatingSidebarOpen(false);
    }
  };

  // Close all modals and reset forms
  const closeAllModals = () => {
    setActiveModal(null);
    setShowDesktopDownloadModal(false);
    setShowQuickTaskModal(false);
    setQuickTaskCreateModalState({ show: false, isLoading: false, project: null, tasks: [], error: '' });
    setError('');
    setSelectedOrgId(null);
    setOrganizations([]);
    setProjects([]);
    setTaskStatuses([]);
    setTaskPriorities([]);
    setTaskTypes([]);
    setOrgMembers([]);
    setCustomerOrganizations([]);
    setCustomerSupportUsers([]);
    setCustomerForm(buildDefaultCustomerFormValues([]));
    setTaskForm({
      projectId: '',
      taskName: '',
      description: '',
      status: '',
      priority: '',
      taskType: '',
      assignedTo: '',
      dueDate: '',
      estimatedHours: '',
      unscheduledWork: false,
    });
    setOrgForm({ name: '', description: '' });
  };

  // Load projects and settings when organization changes
  const handleOrgChange = async (orgId: number) => {
    setSelectedOrgId(orgId);
    setTaskForm(prev => ({ ...prev, projectId: '', assignedTo: '', status: '', priority: '', taskType: '' }));
    setProjects([]);
    setTaskStatuses([]);
    setTaskPriorities([]);
    setTaskTypes([]);
    setOrgMembers([]);
    
    if (!orgId) return;
    
    setIsLoadingData(true);
    try {
      // Load projects, statuses, priorities, task types, and members in parallel
      const [projectsRes, statusesRes, prioritiesRes, taskTypesRes, membersRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/projects?organizationId=${orgId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${getApiUrl()}/api/status-values/task/${orgId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${getApiUrl()}/api/status-values/priority/${orgId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${getApiUrl()}/api/status-values/type/${orgId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${getApiUrl()}/api/organizations/${orgId}/users`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
      ]);

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setProjects(data.projects || []);
      }
      
      if (statusesRes.ok) {
        const data = await statusesRes.json();
        const statuses = data.statuses || [];
        setTaskStatuses(statuses);
        // Set default status
        const defaultStatus = statuses.find((s: StatusValue) => s.IsDefault);
        if (defaultStatus) {
          setTaskForm(prev => ({ ...prev, status: String(defaultStatus.Id) }));
        }
      }
      
      if (prioritiesRes.ok) {
        const data = await prioritiesRes.json();
        const priorities = data.priorities || [];
        setTaskPriorities(priorities);
        // Set default priority
        const defaultPriority = priorities.find((p: PriorityValue) => p.IsDefault);
        if (defaultPriority) {
          setTaskForm(prev => ({ ...prev, priority: String(defaultPriority.Id) }));
        }
      }

      if (taskTypesRes.ok) {
        const data = await taskTypesRes.json();
        const types = data.types || [];
        setTaskTypes(types);
        const defaultType = types.find((t: StatusValue) => t.IsDefault);
        if (defaultType) {
          setTaskForm(prev => ({ ...prev, taskType: String(defaultType.Id) }));
        }
      }
      
      if (membersRes.ok) {
        const data = await membersRes.json();
        setOrgMembers(data.users || []);
      }
    } catch (err) {
      console.error('Failed to load organization data:', err);
      setErrorWithToast('Failed to load organization data');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleSaveTask = async () => {
    if (!taskForm.projectId || !taskForm.taskName.trim() || !taskForm.taskType) {
      setErrorWithToast('Project, Task Name, and Task Type are required');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const res = await fetch(`${getApiUrl()}/api/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: parseInt(taskForm.projectId),
          taskName: taskForm.taskName.trim(),
          description: taskForm.description || null,
          status: taskForm.status ? parseInt(taskForm.status) : null,
          priority: taskForm.priority ? parseInt(taskForm.priority) : null,
          taskType: taskForm.taskType ? parseInt(taskForm.taskType) : null,
          assignedTo: taskForm.assignedTo ? parseInt(taskForm.assignedTo) : null,
          dueDate: taskForm.dueDate || null,
          unscheduledWork: taskForm.unscheduledWork,
          estimatedHours: taskForm.estimatedHours ? parseFloat(taskForm.estimatedHours) : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create task');
      }

      // Reset form and close modal
      setTaskForm({
        projectId: '',
        taskName: '',
        description: '',
        status: '',
        priority: '',
        taskType: '',
        assignedTo: '',
        dueDate: '',
        estimatedHours: '',
        unscheduledWork: false,
      });
      setSelectedOrgId(null);
      setShowQuickTaskModal(false);
      
      // Optionally refresh the page if on projects or planning
      if (window.location.pathname.includes('/projects') || window.location.pathname.includes('/planning')) {
        window.location.reload();
      }
    } catch (err: any) {
      setErrorWithToast(err.message || 'Failed to create task');
    } finally {
      setIsSaving(false);
    }
  };

  const closeQuickTaskModal = () => {
    closeAllModals();
  };

  const openQuickTaskCreateDetails = async (projectId: number) => {
    if (!token || !projectId) return;

    setQuickTaskCreateModalState({ show: true, isLoading: true, project: null, tasks: [], error: '' });
    setShowQuickTaskModal(false);
    setError('');

    try {
      const [projectResult, tasksResult] = await Promise.all([
        projectsApi.getById(projectId, token),
        tasksApi.getByProject(projectId, token),
      ]);

      setQuickTaskCreateModalState({
        show: true,
        isLoading: false,
        project: projectResult.project,
        tasks: tasksResult.tasks || [],
        error: '',
      });
    } catch (err: any) {
      setQuickTaskCreateModalState({
        show: true,
        isLoading: false,
        project: null,
        tasks: [],
        error: err?.message || 'Failed to load project details',
      });
    }
  };

  const handleCloseQuickTaskCreateDetails = () => {
    setQuickTaskCreateModalState({ show: false, isLoading: false, project: null, tasks: [], error: '' });
    closeAllModals();
  };

  const handleQuickTaskCreateSaved = async () => {
    setQuickTaskCreateModalState({ show: false, isLoading: false, project: null, tasks: [], error: '' });
    closeAllModals();
    if (
      window.location.pathname.includes('/projects') ||
      window.location.pathname.includes('/planning') ||
      window.location.pathname.includes('/dashboard')
    ) {
      window.location.reload();
    }
  };

  // Debug permissions
  useEffect(() => {
    if (!user) return;
    console.log('Navbar - User:', user);
    console.log('Navbar - Permissions:', permissions);
    console.log('Navbar - Permissions Loading:', permissionsLoading);
  }, [user, permissions, permissionsLoading]);

  useEffect(() => {
    setIsTopMobileNavOpen(false);
    setIsFloatingSidebarOpen(false);
  }, [pathname]);

  if (!user) return null;

  const canShowCustomersOption =
    permissionsLoading ||
    !!permissions?.canViewCustomers ||
    !!permissions?.canManageOrganizations;

  const canShowApplicationsOption =
    permissionsLoading ||
    !!permissions?.canViewApplications ||
    !!permissions?.canManageApplications ||
    !!permissions?.canCreateApplications ||
    !!permissions?.canDeleteApplications ||
    !!permissions?.canManageReleases;

  const canShowOrganizationsOption = !!permissions?.canManageOrganizations;
  const canShowApprovalsOption = canAccessApprovals;
  const canShowVacationApprovalsOption = canAccessVacationApprovals;
  const canShowOutOfOfficeApprovalsOption = canAccessOutOfOfficeApprovals;
  const canShowDevSupportManagementOption = canAccessDevSupportManagement;
  const canShowAnyApprovalsOption = canShowApprovalsOption || canShowVacationApprovalsOption || canShowOutOfOfficeApprovalsOption;

  const canShowDashboardLink = isCustomerUser || (!isCustomerUser && (permissionsLoading || permissions?.canViewDashboard));
  const canShowProjectsLink = !isCustomerUser && (permissionsLoading || permissions?.canViewProjects || permissions?.canManageProjects || permissions?.canCreateProjects);
  const canShowPlanningLink = !isCustomerUser && (permissionsLoading || permissions?.canViewPlanning);
  const canShowTicketsLink = internalTicketsEnabled && (user?.isSupport || isCustomerUser || permissions?.canManageTickets || permissions?.canCreateTickets);
  const canShowMemosLink = !isCustomerUser && memosEnabled;
  const canShowTimesheetLink = !isCustomerUser;
  const canShowCallRecordsLink = !isCustomerUser;
  const canShowWorkSummaryLink = !isCustomerUser;
  const canShowReportsLink = !isCustomerUser && (permissionsLoading || permissions?.canViewReports || permissions?.canManageOrganizations || !!user?.isAdmin);
  const canShowDocsLink = true;

  const showOverviewSection = canShowDashboardLink;
  const showDeliverySection = canShowProjectsLink || canShowPlanningLink;
  const showWorkLogsSection = canShowTimesheetLink || canShowCallRecordsLink || canShowWorkSummaryLink;
  const showServiceSection = canShowTicketsLink || canShowMemosLink;
  const showManagementSection = canShowCustomersOption || canShowApplicationsOption || canShowOrganizationsOption || canShowAnyApprovalsOption || canShowDevSupportManagementOption;
  const showReportingSection = canShowReportsLink;

  const canShowManagementMenu =
    !isCustomerUser &&
    (canShowCustomersOption ||
      canShowApplicationsOption ||
      canShowOrganizationsOption ||
    canShowAnyApprovalsOption ||
    canShowDevSupportManagementOption);

  const shouldUseLeftSidebar = navbarMenuLayout === 'left';
  // Mobile always uses floating overlay so content is not squeezed by a fixed rail
  const effectiveNavbarLeftMode: 'fixed' | 'floating' =
    isMobile && shouldUseLeftSidebar ? 'floating' : navbarLeftMode;
  const isFloatingMode = shouldUseLeftSidebar && effectiveNavbarLeftMode === 'floating';
  const shouldRenderLeftSidebar = shouldUseLeftSidebar && (effectiveNavbarLeftMode === 'fixed' || isFloatingSidebarOpen);
  const isFixedCollapsedRail = shouldUseLeftSidebar && effectiveNavbarLeftMode === 'fixed' && navbarLeftCollapsed;
  const isHoverExpandedRail = isFixedCollapsedRail && isLeftSidebarHovered;
  const isSidebarEffectivelyCollapsed = !isFloatingMode && navbarLeftCollapsed && !isHoverExpandedRail;
  const topMobileNavItemClass =
    'flex items-center gap-3 px-4 py-3 rounded-lg text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium';

  const closeTopMobileNav = () => setIsTopMobileNavOpen(false);
  const sidebarItemClass = `flex items-center gap-2 px-3 py-1.5 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 overflow-hidden whitespace-nowrap`;
  const sidebarSectionHeaderClass = 'px-3 h-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
  const renderSidebarSectionHeader = (title: string) => {
    if (isSidebarEffectivelyCollapsed) {
      return (
        <div className="px-3 h-5 flex items-center">
          <div className="h-px w-full bg-gray-200 dark:bg-gray-700" />
        </div>
      );
    }

    return (
      <div className={sidebarSectionHeaderClass}>
        <span>{title}</span>
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  };

  const NavTimerIndicator = ({ centered = false }: { centered?: boolean }) => {
    const timerButtonClass = centered
      ? 'flex items-center gap-1.5 text-xs font-mono bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2.5 py-1.5 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors max-w-[420px]'
      : 'flex items-center gap-1.5 text-xs font-mono bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2.5 py-1.5 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors';

    return (
      <div className="flex items-center gap-1">
        {navTimer ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (navTimer?.TimerType === 'callRecord') {
                  router.push('/call-records');
                  return;
                }
                handleOpenNavTimerTaskDetail();
              }}
              className={timerButtonClass}
              title={navTimerTitle}
            >
              <span>⏱</span>
              {centered ? (
                <span className="max-w-[220px] truncate">{navTimerLabel}</span>
              ) : (
                <span className="hidden sm:inline max-w-[120px] truncate">{navTimerLabel}</span>
              )}
              <span className="font-bold">{navFormatElapsed(navTimerSeconds)}</span>
            </button>
            <button
              onClick={handleNavStopTimer}
              title="Stop timer and save time entry"
              className="text-xs px-2 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors font-medium"
            >
              ⏹
            </button>
            <button
              onClick={handleNavDiscardTimer}
              title="Discard timer without saving"
              className="text-xs px-2 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-lg transition-colors"
            >
              ✕
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={openNavStartTimerModal}
            className="flex items-center gap-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 sm:px-2.5 py-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors animate-pulse ring-2 ring-red-300/70 dark:ring-red-900/70 shadow-[0_0_14px_rgba(239,68,68,0.45)] dark:shadow-[0_0_14px_rgba(248,113,113,0.35)] shrink-0"
            title="No timer running. Click to start timer"
          >
            <span>⏱</span>
            {centered ? (
              <span>No timer running — click to start</span>
            ) : (
              <span className="hidden sm:inline">No timer running — click to start</span>
            )}
          </button>
        )}
      </div>
    );
  };

  const toggleLeftSidebar = () => {
    if (isFloatingMode) {
      setIsFloatingSidebarOpen(prev => !prev);
      return;
    }

    const nextCollapsed = !navbarLeftCollapsed;
    setNavbarLeftCollapsed(nextCollapsed);
    saveNavbarPreference({ navbarLeftCollapsed: nextCollapsed });
  };

  const handleWorkMenuMouseEnter = () => {
    if (workMenuCloseTimeoutRef.current) {
      clearTimeout(workMenuCloseTimeoutRef.current);
      workMenuCloseTimeoutRef.current = null;
    }
    setWorkMenuOpen(true);
  };

  const handleWorkMenuMouseLeave = () => {
    if (workMenuCloseTimeoutRef.current) clearTimeout(workMenuCloseTimeoutRef.current);
    workMenuCloseTimeoutRef.current = setTimeout(() => {
      setWorkMenuOpen(false);
    }, 180);
  };

  const handleWorkLogsMenuMouseEnter = () => {
    if (workLogsMenuCloseTimeoutRef.current) {
      clearTimeout(workLogsMenuCloseTimeoutRef.current);
      workLogsMenuCloseTimeoutRef.current = null;
    }
    setWorkLogsMenuOpen(true);
  };

  const handleWorkLogsMenuMouseLeave = () => {
    if (workLogsMenuCloseTimeoutRef.current) clearTimeout(workLogsMenuCloseTimeoutRef.current);
    workLogsMenuCloseTimeoutRef.current = setTimeout(() => {
      setWorkLogsMenuOpen(false);
    }, 180);
  };

  const handleManagementMenuMouseEnter = () => {
    if (managementMenuCloseTimeoutRef.current) {
      clearTimeout(managementMenuCloseTimeoutRef.current);
      managementMenuCloseTimeoutRef.current = null;
    }
    setManagementMenuOpen(true);
  };

  const handleManagementMenuMouseLeave = () => {
    if (managementMenuCloseTimeoutRef.current) clearTimeout(managementMenuCloseTimeoutRef.current);
    managementMenuCloseTimeoutRef.current = setTimeout(() => {
      setManagementMenuOpen(false);
    }, 180);
  };

  return (
    <>
      {isFloatingMode && isFloatingSidebarOpen && (
        <div
          className="fixed inset-0 z-[65] bg-black/30"
          onClick={() => setIsFloatingSidebarOpen(false)}
        />
      )}

      {navbarMenuLayout === 'left' && effectiveNavbarLeftMode === 'fixed' && (
        <div
          className={`fixed top-0 left-0 z-[79] h-16 ${navbarLeftCollapsed ? 'w-16' : 'w-72'} bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700`}
        />
      )}

      {shouldRenderLeftSidebar && (
        <aside
          onMouseEnter={() => {
            if (isFixedCollapsedRail) setIsLeftSidebarHovered(true);
          }}
          onMouseLeave={() => {
            if (isFixedCollapsedRail) setIsLeftSidebarHovered(false);
          }}
          className={`${effectiveNavbarLeftMode === 'floating'
            ? 'fixed left-4 top-20 bottom-4 z-[70] rounded-xl border border-gray-200 dark:border-gray-700'
            : 'fixed left-0 top-16 bottom-0 z-[70] border-r border-gray-200 dark:border-gray-700'} ${isSidebarEffectivelyCollapsed ? (isHoverExpandedRail ? 'w-72' : 'w-16') : 'w-72'} bg-white dark:bg-gray-800 shadow-xl transition-all duration-200`}
        >
          <div className="h-full flex flex-col">
            <div className={`h-16 shrink-0 flex items-center ${isSidebarEffectivelyCollapsed ? 'justify-center' : 'justify-between'} px-3 border-b border-gray-200 dark:border-gray-700`}>
              {isSidebarEffectivelyCollapsed ? (
                <span className="text-gray-700 dark:text-gray-300">☰</span>
              ) : (
                <span className="font-semibold text-gray-900 dark:text-white">Navigation</span>
              )}
            </div>

            <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {showOverviewSection && (
                <div>
                  {canShowDashboardLink && (
                    <a href="/dashboard" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">📊</span>{!isSidebarEffectivelyCollapsed && <span>Dashboard</span>}
                    </a>
                  )}
                </div>
              )}

              {showDeliverySection && (
                <div className={`${showOverviewSection ? 'mt-1.5 pt-1.5' : ''}`}>
                  {renderSidebarSectionHeader('Delivery')}
                  {canShowProjectsLink && (
                    <a href="/projects" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">📁</span>{!isSidebarEffectivelyCollapsed && <span>Projects</span>}
                    </a>
                  )}
                  {canShowPlanningLink && (
                    <a href="/planning" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">📅</span>{!isSidebarEffectivelyCollapsed && <span>Planning</span>}
                    </a>
                  )}
                </div>
              )}

              {showWorkLogsSection && (
                <div className={`${showOverviewSection || showDeliverySection ? 'mt-1.5 pt-1.5' : ''}`}>
                  {renderSidebarSectionHeader('Work Logs')}
                  {canShowTimesheetLink && (
                    <a href="/timesheet" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">📝</span>{!isSidebarEffectivelyCollapsed && <span>Timesheet</span>}
                    </a>
                  )}
                  {canShowCallRecordsLink && (
                    <a href="/call-records" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">📞</span>{!isSidebarEffectivelyCollapsed && <span>Call Records</span>}
                    </a>
                  )}
                  {canShowWorkSummaryLink && (
                    <a href="/work-summary" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">📚</span>{!isSidebarEffectivelyCollapsed && <span>Work Summary</span>}
                    </a>
                  )}
                </div>
              )}

              {showServiceSection && (
                <div className={`${showOverviewSection || showDeliverySection || showWorkLogsSection ? 'mt-1.5 pt-1.5' : ''}`}>
                  {renderSidebarSectionHeader('Service')}
                  {canShowTicketsLink && (
                    <a href="/tickets" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">🎫</span>{!isSidebarEffectivelyCollapsed && <span>Tickets</span>}
                    </a>
                  )}
                  {canShowMemosLink && (
                    <a href="/memos" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">📝</span>{!isSidebarEffectivelyCollapsed && <span>Memos</span>}
                    </a>
                  )}
                </div>
              )}

              {showManagementSection && (
                <div className={`${showOverviewSection || showDeliverySection || showWorkLogsSection || showServiceSection ? 'mt-1.5 pt-1.5' : ''}`}>
                  {renderSidebarSectionHeader('Management')}
                  {canShowCustomersOption && (
                    <a href="/customers" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">🏢</span>{!isSidebarEffectivelyCollapsed && <span>Customers</span>}
                    </a>
                  )}
                  {canShowApplicationsOption && (
                    <a href="/applications" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">🧩</span>{!isSidebarEffectivelyCollapsed && <span>Applications</span>}
                    </a>
                  )}
                  {canShowOrganizationsOption && (
                    <a href="/organizations" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">🏬</span>{!isSidebarEffectivelyCollapsed && <span>Organizations</span>}
                    </a>
                  )}
                  {canShowAnyApprovalsOption && (
                    <a href="/approvals" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">✅</span>{!isSidebarEffectivelyCollapsed && <span>Approvals</span>}
                    </a>
                  )}
                  {canShowDevSupportManagementOption && (
                    <a href="/dev-support" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">🛠️</span>{!isSidebarEffectivelyCollapsed && <span>Dev Support</span>}
                    </a>
                  )}
                </div>
              )}

              {showReportingSection && (
                <div className={`${showOverviewSection || showDeliverySection || showWorkLogsSection || showServiceSection || showManagementSection ? 'mt-1.5 pt-1.5' : ''}`}>
                  {renderSidebarSectionHeader('Reporting')}
                  {canShowReportsLink && (
                    <a href="/reporting" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">📊</span>{!isSidebarEffectivelyCollapsed && <span>Reporting</span>}
                    </a>
                  )}
                </div>
              )}
            </nav>

            <div className="p-2 border-t border-gray-200 dark:border-gray-700">
              {canShowDocsLink && shouldUseLeftSidebar && (
                <>
                  <button
                    type="button"
                    className={sidebarItemClass}
                    onClick={openDesktopDownloadModal}
                  >
                    <span className="w-5 text-center">💻</span>{!isSidebarEffectivelyCollapsed && <span>Download Desktop App</span>}
                  </button>
                  <a
                    href="/docs"
                    className={`${sidebarItemClass} mb-2`}
                    onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}
                  >
                    <span className="w-5 text-center">📘</span>{!isSidebarEffectivelyCollapsed && <span>User Manual</span>}
                  </a>
                </>
              )}
              {!isSidebarEffectivelyCollapsed && (
                <p className="text-xs text-gray-500 dark:text-gray-400 px-1">Mode: {effectiveNavbarLeftMode === 'floating' ? 'Floating' : 'Fixed'}{isMobile && navbarLeftMode === 'fixed' ? ' (auto on mobile)' : ''}</p>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* outer nav stretches across entire header so background fills 100% */}
      <nav
        className={`sticky top-0 z-[80] w-full bg-white dark:bg-gray-800 shadow ${
          navbarMenuLayout === 'left' && effectiveNavbarLeftMode === 'fixed'
            ? (navbarLeftCollapsed ? 'nav-top-compensate-left-collapsed' : 'nav-top-compensate-left-expanded')
            : ''
        }`}
      >
        {/* content not limited to max width so nav items span entire header */}
        <div className="w-full px-2 sm:px-6 lg:px-8">
          <div className="relative flex justify-between items-center h-16 gap-2">
            <div className="flex items-center gap-2 sm:space-x-8 min-w-0 flex-1">
              {shouldUseLeftSidebar && (
                <button
                  onClick={toggleLeftSidebar}
                  className="p-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
                  title={isFloatingMode ? (isFloatingSidebarOpen ? 'Hide menu' : 'Show menu') : (navbarLeftCollapsed ? 'Show menu' : 'Hide menu')}
                  aria-label="Toggle navigation menu"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
              {!shouldUseLeftSidebar && (
                <button
                  type="button"
                  onClick={() => setIsTopMobileNavOpen((open) => !open)}
                  className="md:hidden p-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
                  title={isTopMobileNavOpen ? 'Hide menu' : 'Show menu'}
                  aria-label="Toggle navigation menu"
                  aria-expanded={isTopMobileNavOpen}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {isTopMobileNavOpen ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                  </svg>
                </button>
              )}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={companyName || 'Company logo'}
                    className="w-8 h-8 rounded object-contain bg-white shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {(companyName || 'PM').trim().charAt(0).toUpperCase() || 'P'}
                  </div>
                )}
                <h1
                  className={`text-base sm:text-xl font-bold text-gray-900 dark:text-white truncate ${
                    shouldUseLeftSidebar
                      ? 'hidden md:block max-w-[180px] lg:max-w-none'
                      : 'max-w-[100px] xs:max-w-[140px] sm:max-w-[220px] md:max-w-none'
                  }`}
                >
                  {companyName || 'Project Management'}
                </h1>
                {isDemoMode && (
                  <span
                    className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shrink-0"
                    title="Demo mode is enabled"
                  >
                    DEMO MODE
                  </span>
                )}
              </div>
              {!shouldUseLeftSidebar && (
              <div className="hidden md:flex space-x-4">
                {/* Dashboard */}
                {(isCustomerUser || (!isCustomerUser && (permissionsLoading || permissions?.canViewDashboard))) && (
                  <a 
                    href="/dashboard" 
                    className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    📊 Dashboard
                  </a>
                )}

                {/* Work Dropdown (Projects & Planning) */}
                {!isCustomerUser && (permissionsLoading || permissions?.canViewProjects || permissions?.canManageProjects || permissions?.canCreateProjects || permissions?.canViewPlanning) && (
                  <NavDropdownMenu
                    menuRef={workMenuRef}
                    isOpen={workMenuOpen}
                    title="🗂️ Work"
                    onToggle={() => setWorkMenuOpen(!workMenuOpen)}
                    onMouseEnter={handleWorkMenuMouseEnter}
                    onMouseLeave={handleWorkMenuMouseLeave}
                    items={[
                      {
                        label: '📁 Projects',
                        href: '/projects',
                        visible: !!(permissionsLoading || permissions?.canViewProjects || permissions?.canManageProjects || permissions?.canCreateProjects),
                        onClick: () => setWorkMenuOpen(false),
                      },
                      {
                        label: '📅 Planning',
                        href: '/planning',
                        visible: !!(permissionsLoading || permissions?.canViewPlanning),
                        onClick: () => setWorkMenuOpen(false),
                      },
                    ]}
                  />
                )}

                {/* Work Logs Dropdown */}
                {!isCustomerUser && (
                  <NavDropdownMenu
                    menuRef={workLogsMenuRef}
                    isOpen={workLogsMenuOpen}
                    title="⏱️ Work Logs"
                    onToggle={() => setWorkLogsMenuOpen(!workLogsMenuOpen)}
                    onMouseEnter={handleWorkLogsMenuMouseEnter}
                    onMouseLeave={handleWorkLogsMenuMouseLeave}
                    items={[
                      {
                        label: '📝 Timesheet',
                        href: '/timesheet',
                        visible: true,
                        onClick: () => setWorkLogsMenuOpen(false),
                      },
                      {
                        label: '📞 Call Records',
                        href: '/call-records',
                        visible: true,
                        onClick: () => setWorkLogsMenuOpen(false),
                      },
                      {
                        label: '📚 Work Summary',
                        href: '/work-summary',
                        visible: true,
                        onClick: () => setWorkLogsMenuOpen(false),
                      },
                    ]}
                  />
                )}

                {/* Tickets */}
                {internalTicketsEnabled && (user?.isSupport || isCustomerUser || permissions?.canManageTickets || permissions?.canCreateTickets) && (
                    <a 
                      href="/tickets" 
                      className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium"
                    >
                      🎫 Tickets
                    </a>
                )}

                {/* Memos */}
                {!isCustomerUser && memosEnabled && (
                  <a 
                    href="/memos" 
                    className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    📝 Memos
                  </a>
                )}

                {/* Management Dropdown (Customers & Organizations) */}
                {canShowManagementMenu && (
                  <NavDropdownMenu
                    menuRef={managementMenuRef}
                    isOpen={managementMenuOpen}
                    title="⚙️ Management"
                    onToggle={() => setManagementMenuOpen(!managementMenuOpen)}
                    onMouseEnter={handleManagementMenuMouseEnter}
                    onMouseLeave={handleManagementMenuMouseLeave}
                    items={[
                      {
                        label: '🏢 Customers',
                        href: '/customers',
                        visible: !!canShowCustomersOption,
                        onClick: () => setManagementMenuOpen(false),
                      },
                      {
                        label: '🧩 Applications',
                        href: '/applications',
                        visible: !!canShowApplicationsOption,
                        onClick: () => setManagementMenuOpen(false),
                      },
                      {
                        label: '🏬 Organizations',
                        href: '/organizations',
                        visible: !!canShowOrganizationsOption,
                        onClick: () => setManagementMenuOpen(false),
                      },
                      {
                        label: '✅ Approvals',
                        href: canShowApprovalsOption
                          ? '/approvals?tab=time'
                          : (canShowVacationApprovalsOption ? '/approvals?tab=vacations' : '/approvals?tab=out-of-office'),
                        visible: !!canShowAnyApprovalsOption,
                        onClick: () => setManagementMenuOpen(false),
                      },
                      {
                        label: '🛠️ Dev Support',
                        href: '/dev-support',
                        visible: !!canShowDevSupportManagementOption,
                        onClick: () => setManagementMenuOpen(false),
                      },
                    ]}
                  />
                )}

                {/* Reports */}

                {!isCustomerUser && (permissionsLoading || permissions?.canViewReports || permissions?.canManageOrganizations || !!user?.isAdmin) && (
                  <a
                    href="/reporting"
                    className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    📊 Reporting
                  </a>
                )}
              </div>
              )}
            </div>

            {!isCustomerUser && shouldUseLeftSidebar && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[81] hidden md:block">
                <NavTimerIndicator centered />
              </div>
            )}

            <div className="flex items-center gap-1.5 sm:gap-2 md:space-x-4 shrink-0">
              {/* Global Search - Hidden for customer users */}
              {!isCustomerUser && (
              <div className="relative hidden sm:block" ref={searchRef}>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => searchQuery.length >= 2 && setSearchOpen(true)}
                    placeholder="Search..."
                    className="w-40 md:w-48 lg:w-64 px-4 py-2 pl-10 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                  <svg 
                    className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {isSearching && (
                    <div className="absolute right-3 top-2.5">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
                
                {/* Search Results Dropdown */}
                {searchOpen && searchResults && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto z-50">
                    {searchResults.total === 0 ? (
                      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                        No results found for "{searchQuery}"
                      </div>
                    ) : (
                      <div className="p-2">
                        {/* Load More helper – appends next page results */}
                        {searchHasMore && (
                          <div className="border-b border-gray-200 dark:border-gray-700 pb-2 mb-2 flex justify-end">
                            <button
                              disabled={isSearching}
                              onClick={async () => {
                                const nextPage = searchPage + 1;
                                setIsSearching(true);
                                try {
                                  const res = await fetch(
                                    `${getApiUrl()}/api/search?q=${encodeURIComponent(searchQuery.trim())}&page=${nextPage}`,
                                    { headers: { 'Authorization': `Bearer ${token}` } }
                                  );
                                  if (res.ok) {
                                    const data = await res.json();
                                    setSearchResults((prev: any) => ({
                                      tasks: [...(prev?.tasks || []), ...(data.results?.tasks || [])],
                                      tickets: [...(prev?.tickets || []), ...(data.results?.tickets || [])],
                                      projects: [...(prev?.projects || []), ...(data.results?.projects || [])],
                                      organizations: [...(prev?.organizations || []), ...(data.results?.organizations || [])],
                                      users: [...(prev?.users || []), ...(data.results?.users || [])],
                                      total: (prev?.total || 0) + (data.results?.total || 0),
                                    }));
                                    setSearchPage(nextPage);
                                    setSearchHasMore(data.hasMore || false);
                                  }
                                } catch {}
                                finally { setIsSearching(false); }
                              }}
                              className="text-xs px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/60 disabled:opacity-50"
                            >
                              {isSearching ? 'Loading…' : 'Load More'}
                            </button>
                          </div>
                        )}
                        {/* Tasks */}
                        {searchResults.tasks && searchResults.tasks.length > 0 && (
                          <div className="mb-3">
                            <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                              Tasks ({searchResults.tasks.length})
                            </div>
                            {searchResults.tasks.map((task: any) => (
                              <button
                                key={`task-${task.Id}`}
                                onClick={() => handleSearchResultClick('task', task.Id, { ProjectId: task.ProjectId })}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3"
                              >
                                <span className="text-lg">📋</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 dark:text-white truncate">
                                    {task.TaskName}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {task.ProjectName} • {task.StatusName || 'Unknown'}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Tickets */}
                        {internalTicketsEnabled && searchResults.tickets && searchResults.tickets.length > 0 && (
                          <div className="mb-3">
                            <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                              Tickets ({searchResults.tickets.length})
                            </div>
                            {searchResults.tickets.map((ticket: any) => (
                              <button
                                key={`ticket-${ticket.Id}`}
                                onClick={() => handleSearchResultClick('ticket', ticket.Id)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3"
                              >
                                <span className="text-lg">🎫</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 dark:text-white truncate">
                                    {ticket.TicketNumber ? `${ticket.TicketNumber} • ` : ''}{ticket.Title}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {ticket.ProjectName || ticket.OrganizationName} • {ticket.StatusName || 'Unknown'}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        
                        {/* Projects */}
                        {searchResults.projects && searchResults.projects.length > 0 && (
                          <div className="mb-3">
                            <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                              Projects ({searchResults.projects.length})
                            </div>
                            {searchResults.projects.map((project: any) => (
                              <button
                                key={`project-${project.Id}`}
                                onClick={() => handleSearchResultClick('project', project.Id)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3"
                              >
                                <span className="text-lg">📁</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 dark:text-white truncate">
                                    {project.ProjectName}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {project.OrganizationName} • {project.StatusName || 'Unknown'}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        
                        {/* Organizations */}
                        {searchResults.organizations && searchResults.organizations.length > 0 && (
                          <div className="mb-3">
                            <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                              Organizations ({searchResults.organizations.length})
                            </div>
                            {searchResults.organizations.map((org: any) => (
                              <button
                                key={`org-${org.Id}`}
                                onClick={() => handleSearchResultClick('organization', org.Id)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-3"
                              >
                                <span className="text-lg">🏢</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 dark:text-white truncate">
                                    {org.Name}
                                  </div>
                                  {org.Description && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                      {org.Description}
                                    </div>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        
                        {/* Users */}
                        {searchResults.users && searchResults.users.length > 0 && (
                          <div>
                            <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                              Users ({searchResults.users.length})
                            </div>
                            {searchResults.users.map((user: any) => (
                              <div
                                key={`user-${user.Id}`}
                                className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-3"
                              >
                                <span className="text-lg">👤</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 dark:text-white truncate">
                                    {user.FirstName} {user.LastName}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    @{user.Username} • {user.Email}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Quick Actions Dropdown - Hidden for customer users */}
              {!isCustomerUser && (
              <div className="relative" ref={quickActionsRef}>
                <button
                  onClick={() => setQuickActionsOpen(!quickActionsOpen)}
                  title="Quick Actions (Ctrl+Q)"
                  className="flex items-center space-x-1 px-2 sm:px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="hidden sm:inline">Quick Actions</span>
                  <svg 
                    className={`hidden sm:block w-4 h-4 transition-transform ${quickActionsOpen ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {quickActionsOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    {/*permissions?.canManageOrganizations && (
                      <button
                        onClick={() => openQuickAction('organization')}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <span className="mr-3">🏢</span> New Organization
                      </button>
                    )*/}
                    {(permissions?.canManageProjects || permissions?.canCreateProjects) && (
                      <button
                        onClick={() => openQuickAction('project')}
                        title="Shortcut: Ctrl+1"
                        className="flex items-center w-full gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <span>📁</span>
                        <span>New Project</span>
                        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">Ctrl+1</span>
                      </button>
                    )}
                    {permissions?.canCreateCustomers && (
                      <button
                        onClick={() => openQuickAction('customer')}
                        title="Shortcut: Ctrl+5"
                        className="flex items-center w-full gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <span>🏢</span>
                        <span>Add Customer</span>
                        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">Ctrl+5</span>
                      </button>
                    )}
                    {(permissions?.canManageTasks || permissions?.canCreateTasks) && (
                      <button
                        onClick={() => openQuickAction('task')}
                        title="Shortcut: Ctrl+2"
                        className="flex items-center w-full gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <span>✅</span>
                        <span>New Task</span>
                        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">Ctrl+2</span>
                      </button>
                    )}
                    {(permissions?.canManageTasks || permissions?.canCreateTasks || permissions?.canManageTimeEntries) && (
                      <>
                        <hr className="my-1 border-gray-200 dark:border-gray-700" />
                        <button
                          onClick={() => openQuickAction('timeEntry')}
                          title="Shortcut: Ctrl+3"
                          className="flex items-center w-full gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <span>⏱️</span>
                          <span>New Time Entry</span>
                          <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">Ctrl+3</span>
                        </button>
                      </>
                    )}
                    {(user?.isSupport || permissions?.canManageTickets) && (
                      <button
                        onClick={() => openQuickAction('callRecord')}
                        title="Shortcut: Ctrl+4"
                        className="flex items-center w-full gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <span>📞</span>
                        <span>New Call Record</span>
                        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">Ctrl+4</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Timer indicator — inline on mobile for left layout; centered only on md+ */}
              {!isCustomerUser && (!shouldUseLeftSidebar || isMobile) && (
                <NavTimerIndicator />
              )}

              {/* Notifications Dropdown - Hidden for customer users */}
              {!isCustomerUser && (
              <div className="relative shrink-0" ref={notificationsRef}>
                <button
                  onClick={handleNotificationsClick}
                  className="relative p-2 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  title="Notifications"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-96 overflow-hidden">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                      <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>
                    <div className="overflow-y-auto max-h-72">
                      {loadingNotifications ? (
                        <div className="p-4 text-center text-gray-500 dark:text-gray-400">Loading...</div>
                      ) : notifications.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                          <span className="text-2xl">🔔</span>
                          <p className="mt-2">No notifications yet</p>
                        </div>
                      ) : (
                        notifications.map(notification => (
                          <div
                            key={notification.Id}
                            className={`p-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${
                              !notification.IsRead ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                            }`}
                            onClick={() => {
                              if (!notification.IsRead) {
                                markAsRead(notification.Id);
                              }
                              if (notification.RelatedTaskId && notification.RelatedProjectId) {
                                setNotificationsOpen(false);
                                openNavTaskDetail(Number(notification.RelatedProjectId), Number(notification.RelatedTaskId));
                                return;
                              }
                              if (notification.Link) {
                                window.location.href = notification.Link;
                              }
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-lg">
                                {notification.Type === 'task_assigned' ? '📋' :
                                 notification.Type === 'ticket_created' ? '🎫' :
                                 notification.Type === 'ticket_assigned' ? '🎯' :
                                 notification.Type === 'ticket_developer' ? '👨‍💻' :
                                 notification.Type === 'ticket_status' ? '✅' :
                                 notification.Type === 'ticket_comment' ? '💬' :
                                 notification.Type === 'comment' ? '💬' :
                                 notification.Type === 'deadline' ? '⏰' :
                                 notification.Type === 'mention' ? '@' : '🔔'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {notification.Title}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                  {notification.Message}
                                </p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                  {new Date(notification.CreatedAt).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              </div>
                              {!notification.IsRead && (
                                <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5"></span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    {notifications.length > 0 && (
                      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                        <Link
                          href="/notifications"
                          className="block text-center text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          onClick={() => setNotificationsOpen(false)}
                        >
                          View all notifications
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* User Menu */}
              <div className="relative shrink-0" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center space-x-1 sm:space-x-2 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-1.5 sm:px-3 py-2 rounded-md text-sm font-medium"
                  title={user.firstName || user.username}
                  aria-label="User menu"
                >
                  <span className="hidden sm:inline">{user.firstName || user.username}</span>
                  <span className="sm:hidden inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-semibold">
                    {(user.firstName || user.username || 'U').trim().charAt(0).toUpperCase()}
                  </span>
                  <svg 
                    className={`hidden sm:block w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    <a
                      href="/profile"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setDropdownOpen(false)}
                    >
                      👤 My Profile
                    </a>
                    {!shouldUseLeftSidebar && (
                      <>
                        <button
                          type="button"
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={openDesktopDownloadModal}
                        >
                          💻 Download Desktop App
                        </button>
                        <a
                          href="/docs"
                          className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => setDropdownOpen(false)}
                        >
                          📘 User Manual
                        </a>
                      </>
                    )}
                    {!isCustomerUser && !shouldUseLeftSidebar && (
                    <>
                    <a
                      href="/timesheet"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setDropdownOpen(false)}
                    >
                      📝 Timesheet
                    </a>
                    <a
                      href="/call-records"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setDropdownOpen(false)}
                    >
                      📞 Call Records
                    </a>
                    <a
                      href="/work-summary"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setDropdownOpen(false)}
                    >
                      📚 Work Summary
                    </a>
                    </>
                    )}

                    {!isCustomerUser && (
                    <>
                    <a
                      href="/dashboard"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setDropdownOpen(false)}
                    >
                      🏠 Overview
                    </a>
                    </>
                    )}
                    {(!!user.isAdmin || permissions?.canManageUsers) && (
                    <>
                    <hr className="my-1 border-gray-200 dark:border-gray-700" />
                    <a
                      href="/administration"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setDropdownOpen(false)}
                    >
                      ⚙️ Administration
                    </a>
                    </>
                    )}
                    <hr className="my-1 border-gray-200 dark:border-gray-700" />
                    <div className="px-4 py-2">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Theme
                      </p>
                      <div className="grid grid-cols-3 gap-1">
                        {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => {
                              setThemeMode(mode);
                              setThemeModeState(mode);
                            }}
                            aria-label={`Set theme to ${mode}`}
                            title={mode.charAt(0).toUpperCase() + mode.slice(1)}
                            className={`px-2 py-1 text-xs rounded capitalize border transition-colors ${themeMode === mode
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                          >
                            {mode === 'light' ? '☀️' : mode === 'dark' ? '🌙' : '💻'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <ColorVisionPicker
                      colorVisionMode={colorVisionMode}
                      onChange={setColorVisionModeState}
                    />
                    <hr className="my-1 border-gray-200 dark:border-gray-700" />
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        logout();
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      🚪 Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {!shouldUseLeftSidebar && isTopMobileNavOpen && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/30 md:hidden"
            onClick={closeTopMobileNav}
            aria-hidden="true"
          />
          <div className="md:hidden sticky top-16 z-[75] w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-lg max-h-[calc(100dvh-4rem)] overflow-y-auto">
            <nav className="px-3 py-3 space-y-1" aria-label="Mobile primary">
              {canShowDashboardLink && (
                <a href="/dashboard" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>📊</span><span>Dashboard</span>
                </a>
              )}
              {canShowProjectsLink && (
                <a href="/projects" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>📁</span><span>Projects</span>
                </a>
              )}
              {canShowPlanningLink && (
                <a href="/planning" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>📅</span><span>Planning</span>
                </a>
              )}
              {canShowTimesheetLink && (
                <a href="/timesheet" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>📝</span><span>Timesheet</span>
                </a>
              )}
              {canShowCallRecordsLink && (
                <a href="/call-records" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>📞</span><span>Call Records</span>
                </a>
              )}
              {canShowWorkSummaryLink && (
                <a href="/work-summary" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>📚</span><span>Work Summary</span>
                </a>
              )}
              {canShowTicketsLink && (
                <a href="/tickets" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>🎫</span><span>Tickets</span>
                </a>
              )}
              {canShowMemosLink && (
                <a href="/memos" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>📝</span><span>Memos</span>
                </a>
              )}
              {canShowCustomersOption && (
                <a href="/customers" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>🏢</span><span>Customers</span>
                </a>
              )}
              {canShowApplicationsOption && (
                <a href="/applications" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>🧩</span><span>Applications</span>
                </a>
              )}
              {canShowOrganizationsOption && (
                <a href="/organizations" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>🏬</span><span>Organizations</span>
                </a>
              )}
              {canShowAnyApprovalsOption && (
                <a
                  href={
                    canShowApprovalsOption
                      ? '/approvals?tab=time'
                      : (canShowVacationApprovalsOption ? '/approvals?tab=vacations' : '/approvals?tab=out-of-office')
                  }
                  className={topMobileNavItemClass}
                  onClick={closeTopMobileNav}
                >
                  <span>✅</span><span>Approvals</span>
                </a>
              )}
              {canShowDevSupportManagementOption && (
                <a href="/dev-support" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>🛠️</span><span>Dev Support</span>
                </a>
              )}
              {canShowReportsLink && (
                <a href="/reporting" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>📊</span><span>Reporting</span>
                </a>
              )}
              {canShowDocsLink && (
                <a href="/docs" className={topMobileNavItemClass} onClick={closeTopMobileNav}>
                  <span>📘</span><span>User Manual</span>
                </a>
              )}
            </nav>
          </div>
        </>
      )}

      {/* Quick Task Add Modal */}
      {navTaskModalState.show && (
        <>
          {navTaskModalState.isLoading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 text-gray-700 dark:text-gray-300">
                Loading task details...
              </div>
            </div>
          )}

          {!navTaskModalState.isLoading && navTaskModalState.error && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                <div className="text-sm text-red-600 dark:text-red-400 mb-4">{navTaskModalState.error}</div>
                <div className="flex justify-end">
                  <button
                    onClick={handleCloseNavTaskModal}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {!navTaskModalState.isLoading && !navTaskModalState.error && navTaskModalState.project && navTaskModalState.task && token && (
            <TaskDetailModal
              projectId={Number(navTaskModalState.project.Id)}
              organizationId={Number(navTaskModalState.project.OrganizationId)}
              task={navTaskModalState.task}
              project={navTaskModalState.project}
              tasks={navTaskModalState.tasks}
              onClose={handleCloseNavTaskModal}
              onSaved={async () => {
                await handleOpenNavTimerTaskDetail();
              }}
              token={token}
            />
          )}
        </>
      )}

      <TimerStartModal
        isOpen={showNavStartTimerModal}
        error={timerStartError}
        timerMode={timerStartMode}
        isLoadingTasks={isLoadingTimerStartTasks}
        isLoadingCallProjects={isLoadingTimerStartProjects}
        isLoadingCallTasks={isLoadingTimerStartCallTasks}
        tasks={timerStartTasks}
        organizations={timerStartOrganizations}
        projects={timerStartProjects}
        callTasks={timerStartCallTasks}
        selectedTaskId={timerStartTaskId}
        callForm={timerStartCallForm}
        startTime={timerStartTime}
        isStarting={isStartingTimer}
        onClose={closeNavStartTimerModal}
        onTimerModeChange={setTimerStartMode}
        onTaskChange={setTimerStartTaskId}
        onCallFormChange={(updates) => {
          if (Object.prototype.hasOwnProperty.call(updates, 'organizationId')) {
            const organizationId = updates.organizationId ?? '';
            setTimerStartCallForm((prev) => ({
              ...prev,
              ...updates,
              organizationId,
              projectId: '',
              taskId: '',
            }));
            setTimerStartProjects([]);
            setTimerStartCallTasks([]);
            if (organizationId) {
              void loadTimerStartProjectsForOrg(organizationId);
            }
            return;
          }

          if (Object.prototype.hasOwnProperty.call(updates, 'projectId')) {
            const projectId = updates.projectId ?? '';
            setTimerStartCallForm((prev) => ({
              ...prev,
              ...updates,
              projectId,
              taskId: '',
            }));
            setTimerStartCallTasks([]);
            if (projectId) {
              void loadTimerStartTasksForProject(projectId);
            }
            return;
          }

          setTimerStartCallForm((prev) => ({
            ...prev,
            ...updates,
          }));
        }}
        onStartTimeChange={setTimerStartTime}
        onStart={handleNavStartTimer}
      />

      {showQuickTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Select Project for New Task
                </h2>
                <button
                  onClick={closeQuickTaskModal}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Choose the organization and project first. The task details will open in the standard task modal.
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Organization <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    value={selectedOrgId?.toString() || ''}
                    onChange={(value) => handleOrgChange(parseInt(value) || 0)}
                    options={organizations.map(org => ({ value: org.Id, label: org.Name }))}
                    placeholder="Select Organization"
                    emptyText="Select Organization"
                    disabled={isLoadingData}
                    autoSelectSingleOption
                  />
                </div>

                {/* Project */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Project <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    value={taskForm.projectId}
                    onChange={(value) => {
                      setTaskForm(prev => ({ ...prev, projectId: value }));
                      const projectId = parseInt(value, 10);
                      if (projectId > 0) {
                        void openQuickTaskCreateDetails(projectId);
                      }
                    }}
                    options={projects.map(project => ({ value: project.Id, label: project.ProjectName }))}
                    placeholder="Select Project"
                    emptyText="Select Project"
                    disabled={!selectedOrgId || isLoadingData}
                    autoSelectSingleOption
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={closeQuickTaskModal}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {quickTaskCreateModalState.show && (
        <>
          {quickTaskCreateModalState.isLoading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 text-gray-700 dark:text-gray-300">
                Loading task details...
              </div>
            </div>
          )}

          {!quickTaskCreateModalState.isLoading && quickTaskCreateModalState.error && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                <div className="text-sm text-red-600 dark:text-red-400 mb-4">{quickTaskCreateModalState.error}</div>
                <div className="flex justify-end">
                  <button
                    onClick={handleCloseQuickTaskCreateDetails}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {!quickTaskCreateModalState.isLoading && !quickTaskCreateModalState.error && quickTaskCreateModalState.project && token && (
            <TaskDetailModal
              projectId={Number(quickTaskCreateModalState.project.Id)}
              organizationId={Number(quickTaskCreateModalState.project.OrganizationId)}
              task={null}
              project={quickTaskCreateModalState.project}
              tasks={quickTaskCreateModalState.tasks}
              onClose={handleCloseQuickTaskCreateDetails}
              onSaved={handleQuickTaskCreateSaved}
              token={token}
            />
          )}
        </>
      )}

      {/* Organization Modal */}
      {activeModal === 'organization' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  New Organization
                </h2>
                <button
                  onClick={closeAllModals}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Organization Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={orgForm.name}
                    onChange={(e) => setOrgForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter organization name"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <RichTextEditor
                    content={orgForm.description}
                    onChange={(html) => setOrgForm(prev => ({ ...prev, description: html }))}
                    placeholder="Enter description"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={closeAllModals}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveOrganization}
                  disabled={isSaving || !orgForm.name.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {isSaving ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project Modal */}
      {activeModal === 'project' && (
        <ProjectFormModal
          project={null}
          onClose={closeAllModals}
          onSaved={() => {
            closeAllModals();
            if (window.location.pathname.includes('/projects')) {
              window.location.reload();
            }
          }}
          token={token || ''}
          canViewBudgetInfo={Boolean(permissions?.canViewBudgetInfo)}
        />
      )}

      <CustomerFormModal
        isOpen={activeModal === 'customer'}
        mode="create"
        initialValues={customerForm}
        organizations={customerOrganizations}
        supportUsers={customerSupportUsers}
        internalTicketsEnabled={internalTicketsEnabled}
        isSaving={isSaving}
        error={error}
        onClose={closeAllModals}
        onSubmit={handleSaveCustomer}
        token={token || ''}
      />

      <TimeEntryFormModal
        isOpen={activeModal === 'timeEntry'}
        token={token || ''}
        title="New Time Entry"
        submitLabel="Create Time Entry"
        isSubmitting={isSaving}
        useOrganizationProjectTaskFlow
        onClose={closeAllModals}
        onSubmit={handleSaveTimeEntry}
      />

      <CallRecordFormModal
        isOpen={activeModal === 'callRecord'}
        token={token || ''}
        title="📞 New Call Record"
        submitLabel="Create Call Record"
        isSubmitting={isSaving}
        onClose={closeAllModals}
        onSubmit={handleSaveCallRecord}
      />

      {showDesktopDownloadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Download Desktop App</h3>
                <button
                  type="button"
                  onClick={() => setShowDesktopDownloadModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Choose your platform:
              </p>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleDesktopDownload('win')}
                  className="w-full flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                >
                  <span className="text-2xl">🪟</span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Windows</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Installer (.exe)</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleDesktopDownload('linux')}
                  className="w-full flex items-center gap-3 p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                >
                  <span className="text-2xl">🐧</span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Linux</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">AppImage (CachyOS, Ubuntu, etc.)</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
