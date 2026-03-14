'use client';

import { getApiUrl } from '@/lib/api/config';

import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RichTextEditor from './RichTextEditor';
import SearchableSelect from './SearchableSelect';
import NavDropdownMenu from './navbar/NavDropdownMenu';
import { statusValuesApi, StatusValue } from '@/lib/api/statusValues';
import { io, Socket } from 'socket.io-client';
import { ThemeMode, getStoredThemeMode, setThemeMode } from '@/lib/theme';

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

interface Task {
  Id: number;
  TaskName: string;
  ProjectId: number;
}

export default function Navbar() {
  const { user, token, logout, isCustomerUser } = useAuth();
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Menu dropdowns
  const [workMenuOpen, setWorkMenuOpen] = useState(false);
  const [managementMenuOpen, setManagementMenuOpen] = useState(false);
  const workMenuRef = useRef<HTMLDivElement>(null);
  const managementMenuRef = useRef<HTMLDivElement>(null);
  const workMenuCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
  const [companyName, setCompanyName] = useState('Project Management');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [navbarMenuLayout, setNavbarMenuLayout] = useState<'top' | 'left'>('top');
  const [navbarLeftMode, setNavbarLeftMode] = useState<'fixed' | 'floating'>('fixed');
  const [navbarLeftCollapsed, setNavbarLeftCollapsed] = useState(false);
  const [isLeftSidebarHovered, setIsLeftSidebarHovered] = useState(false);
  const [isFloatingSidebarOpen, setIsFloatingSidebarOpen] = useState(false);

  // Notifications state
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [canAccessApprovals, setCanAccessApprovals] = useState(false);
  const [canAccessVacationApprovals, setCanAccessVacationApprovals] = useState(false);

  // Active timer state
  const [navTimer, setNavTimer] = useState<{ Id: number; TaskId: number; TaskName: string; ProjectId: number; ProjectName: string; StartedAt: string } | null>(null);
  const [navTimerSeconds, setNavTimerSeconds] = useState(0);
  const navTimerTickRef = useRef<NodeJS.Timeout | null>(null);
  const navTimerPollRef = useRef<NodeJS.Timeout | null>(null);

  // Quick Actions dropdown state
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  
  // Modal type: 'task' | 'organization' | 'project' | 'timeEntry' | 'callRecord' | null
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Quick Task Add state
  const [showQuickTaskModal, setShowQuickTaskModal] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [taskPriorities, setTaskPriorities] = useState<PriorityValue[]>([]);
  const [taskTypes, setTaskTypes] = useState<StatusValue[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  
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

  // Project form
  const [projectForm, setProjectForm] = useState({
    organizationId: '',
    projectName: '',
    description: '',
    startDate: '',
    endDate: '',
    customerId: '',
    status: '',
  });

  // Customers state for quick project modal
  const [projectCustomers, setProjectCustomers] = useState<{ Id: number; Name: string }[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<StatusValue[]>([]);

  // Time Entry form
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeEntryForm, setTimeEntryForm] = useState({
    organizationId: '',
    projectId: '',
    taskId: '',
    workDate: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '17:00',
    hours: '',
    description: '',
  });

  // Call Record form
  const [callRecordForm, setCallRecordForm] = useState({
    organizationId: '',
    projectId: '',
    taskId: '',
    callDate: new Date().toISOString().split('T')[0],
    startTime: '',
    endTime: '',
    durationMinutes: 30,
    participants: '',
    callType: 'Teams',
    subject: '',
    notes: '',
  });

  useEffect(() => {
    setThemeModeState(getStoredThemeMode());
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
      if (managementMenuRef.current && !managementMenuRef.current.contains(event.target as Node)) {
        setManagementMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (workMenuCloseTimeoutRef.current) clearTimeout(workMenuCloseTimeoutRef.current);
      if (managementMenuCloseTimeoutRef.current) clearTimeout(managementMenuCloseTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const loadFeatureFlags = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/system-settings/public`);
        if (!res.ok) return;
        const data = await res.json();
        setInternalTicketsEnabled(data.internalTicketsEnabled !== false);
        setMemosEnabled(data.memosEnabled !== false);
        setCompanyName(data.companyName || 'Project Management');
        setCompanyLogoUrl(data.companyLogoUrl || '');
      } catch {
        setInternalTicketsEnabled(true);
        setMemosEnabled(true);
        setCompanyName('Project Management');
        setCompanyLogoUrl('');
      }
    };

    loadFeatureFlags();
  }, []);

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

    const shouldApplyFixedOffset =
      navbarMenuLayout === 'left' &&
      navbarLeftMode === 'fixed';

    if (shouldApplyFixedOffset) {
      document.body.classList.add(navbarLeftCollapsed ? 'nav-left-fixed-collapsed' : 'nav-left-fixed-expanded');
    }

    return () => {
      document.body.classList.remove('nav-left-fixed-expanded');
      document.body.classList.remove('nav-left-fixed-collapsed');
    };
  }, [navbarMenuLayout, navbarLeftMode, navbarLeftCollapsed]);

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

    const apiBase = getApiUrl() || 'http://localhost:3000';
    const socket: Socket = io(apiBase, {
      path: '/api/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

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
      const tick = () => setNavTimerSeconds(Math.floor((Date.now() - new Date(navTimer.StartedAt).getTime()) / 1000));
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
        return;
      }

      if (user.isAdmin) {
        setCanAccessApprovals(true);
        setCanAccessVacationApprovals(true);
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
    };

    loadApprovalScope();
  }, [token, user, isCustomerUser]);

  const navFormatElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  };

  const handleNavStopTimer = async () => {
    if (!navTimer) return;
    try {
      const res = await fetch(`${getApiUrl()}/api/timers/${navTimer.Id}/stop`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
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

  const handleSearchResultClick = (type: string, id: number, extra?: any) => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults(null);
    
    switch (type) {
      case 'task':
        window.location.href = `/projects/${extra.ProjectId}?task=${id}`;
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
      setError('Failed to load organizations');
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

    // Load organizations for modals that need them
    if (type === 'project' || type === 'timeEntry' || type === 'callRecord') {
      setIsLoadingData(true);
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
      } finally {
        setIsLoadingData(false);
      }
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
      }
    };

    document.addEventListener('keydown', handleQuickActionShortcuts);
    return () => document.removeEventListener('keydown', handleQuickActionShortcuts);
  }, [isCustomerUser, permissions, user?.isSupport]);

  // Load projects for a specific organization
  const loadProjectsForOrg = async (orgId: string) => {
    if (!orgId) {
      setProjects([]);
      return;
    }
    try {
      const res = await fetch(`${getApiUrl()}/api/projects?organizationId=${orgId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };

  // Load tasks for a specific project
  const loadTasksForProject = async (projectId: string) => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    try {
      const res = await fetch(`${getApiUrl()}/api/tasks/project/${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  };

  // Calculate hours from start/end time
  const calculateHours = (startTime: string, endTime: string): number => {
    if (!startTime || !endTime) return 0;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return Math.max(0, (endMinutes - startMinutes) / 60);
  };
  
  // Calculate end time from start time + hours
  const calculateEndTimeFromHours = (startTime: string, hours: number): string => {
    if (!startTime) return '';
    const [startH, startM] = startTime.split(':').map(Number);
    const totalMinutes = startH * 60 + startM + (hours * 60);
    const endHour = Math.floor(totalMinutes / 60) % 24;
    const endMin = Math.floor(totalMinutes % 60);
    return `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
  };
  
  // Calculate end time from start time + duration in minutes
  const calculateEndTimeFromMinutes = (startTime: string, minutes: number): string => {
    if (!startTime) return '';
    const [startH, startM] = startTime.split(':').map(Number);
    const totalMinutes = startH * 60 + startM + minutes;
    const endHour = Math.floor(totalMinutes / 60) % 24;
    const endMin = Math.floor(totalMinutes % 60);
    return `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
  };

  // Save Organization
  const handleSaveOrganization = async () => {
    if (!orgForm.name.trim()) {
      setError('Organization name is required');
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
      setError(err.message || 'Failed to create organization');
    } finally {
      setIsSaving(false);
    }
  };

  // Save Project
  const handleSaveProject = async () => {
    if (!projectForm.organizationId || !projectForm.projectName.trim()) {
      setError('Organization and Project name are required');
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(`${getApiUrl()}/api/projects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: parseInt(projectForm.organizationId),
          projectName: projectForm.projectName.trim(),
          description: projectForm.description || null,
          startDate: projectForm.startDate || null,
          endDate: projectForm.endDate || null,
          customerId: projectForm.customerId ? parseInt(projectForm.customerId) : null,
          status: projectForm.status ? parseInt(projectForm.status) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create project');
      }
      closeAllModals();
      if (window.location.pathname.includes('/projects')) {
        window.location.reload();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setIsSaving(false);
    }
  };

  // Save Time Entry
  const handleSaveTimeEntry = async () => {
    if (!timeEntryForm.taskId || !timeEntryForm.workDate) {
      setError('Task and Work Date are required');
      return;
    }
    
    let hours = timeEntryForm.hours ? parseFloat(timeEntryForm.hours) : 0;
    if (!hours && timeEntryForm.startTime && timeEntryForm.endTime) {
      hours = calculateHours(timeEntryForm.startTime, timeEntryForm.endTime);
    }
    if (hours <= 0) {
      setError('Hours must be greater than 0');
      return;
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
      setError(err.message || 'Failed to create time entry');
    } finally {
      setIsSaving(false);
    }
  };

  // Save Call Record
  const handleSaveCallRecord = async () => {
    if (!callRecordForm.callDate || !callRecordForm.startTime) {
      setError('Date and start time are required');
      return;
    }

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
      setError(err.message || 'Failed to create call record');
    } finally {
      setIsSaving(false);
    }
  };

  // Close all modals and reset forms
  const closeAllModals = () => {
    setActiveModal(null);
    setShowQuickTaskModal(false);
    setError('');
    setSelectedOrgId(null);
    setOrganizations([]);
    setProjects([]);
    setTasks([]);
    setTaskStatuses([]);
    setTaskPriorities([]);
    setTaskTypes([]);
    setOrgMembers([]);
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
    });
    setOrgForm({ name: '', description: '' });
    setProjectForm({ organizationId: '', projectName: '', description: '', startDate: '', endDate: '', customerId: '', status: '' });
    setProjectCustomers([]);
    setProjectStatuses([]);
    setTimeEntryForm({
      organizationId: '',
      projectId: '',
      taskId: '',
      workDate: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '17:00',
      hours: '',
      description: '',
    });
    setCallRecordForm({
      organizationId: '',
      projectId: '',
      taskId: '',
      callDate: new Date().toISOString().split('T')[0],
      startTime: '',
      endTime: '',
      durationMinutes: 30,
      participants: '',
      callType: 'Teams',
      subject: '',
      notes: '',
    });
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
      setError('Failed to load organization data');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleSaveTask = async () => {
    if (!taskForm.projectId || !taskForm.taskName.trim() || !taskForm.taskType) {
      setError('Project, Task Name, and Task Type are required');
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
      setError(err.message || 'Failed to create task');
    } finally {
      setIsSaving(false);
    }
  };

  const closeQuickTaskModal = () => {
    closeAllModals();
  };

  // Debug permissions
  useEffect(() => {
    if (!user) return;
    console.log('Navbar - User:', user);
    console.log('Navbar - Permissions:', permissions);
    console.log('Navbar - Permissions Loading:', permissionsLoading);
  }, [user, permissions, permissionsLoading]);

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
  const canShowAnyApprovalsOption = canShowApprovalsOption || canShowVacationApprovalsOption;

  const canShowDashboardLink = isCustomerUser || (!isCustomerUser && (permissionsLoading || permissions?.canViewDashboard));
  const canShowProjectsLink = !isCustomerUser && (permissionsLoading || permissions?.canViewProjects || permissions?.canManageProjects || permissions?.canCreateProjects);
  const canShowPlanningLink = !isCustomerUser && (permissionsLoading || permissions?.canViewPlanning);
  const canShowTicketsLink = internalTicketsEnabled && (user?.isSupport || isCustomerUser || permissions?.canManageTickets || permissions?.canCreateTickets);
  const canShowMemosLink = !isCustomerUser && memosEnabled;
  const canShowTimesheetLink = !isCustomerUser;
  const canShowCallRecordsLink = !isCustomerUser;
  const canShowReportsLink = !isCustomerUser && (permissionsLoading || permissions?.canViewReports || permissions?.canManageOrganizations || !!user?.isAdmin);
  const canShowDocsLink = true;

  const showOverviewSection = canShowDashboardLink;
  const showDeliverySection = canShowProjectsLink || canShowPlanningLink || canShowTimesheetLink;
  const showServiceSection = canShowTicketsLink || canShowMemosLink || canShowCallRecordsLink;
  const showManagementSection = canShowCustomersOption || canShowApplicationsOption || canShowOrganizationsOption || canShowAnyApprovalsOption;
  const showReportingSection = canShowReportsLink;

  const canShowManagementMenu =
    !isCustomerUser &&
    (canShowCustomersOption ||
      canShowApplicationsOption ||
      canShowOrganizationsOption ||
    canShowAnyApprovalsOption);

  const shouldUseLeftSidebar = navbarMenuLayout === 'left';
  const isFloatingMode = shouldUseLeftSidebar && navbarLeftMode === 'floating';
  const shouldRenderLeftSidebar = shouldUseLeftSidebar && (navbarLeftMode === 'fixed' || isFloatingSidebarOpen);
  const isFixedCollapsedRail = shouldUseLeftSidebar && navbarLeftMode === 'fixed' && navbarLeftCollapsed;
  const isHoverExpandedRail = isFixedCollapsedRail && isLeftSidebarHovered;
  const isSidebarEffectivelyCollapsed = !isFloatingMode && navbarLeftCollapsed && !isHoverExpandedRail;
  const sidebarItemClass = `flex items-center ${isSidebarEffectivelyCollapsed ? 'justify-center px-2' : 'gap-2 px-3'} py-2 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700`;

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

      {navbarMenuLayout === 'left' && navbarLeftMode === 'fixed' && (
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
          className={`${navbarLeftMode === 'floating'
            ? 'fixed left-4 top-20 bottom-4 z-[70] rounded-xl border border-gray-200 dark:border-gray-700'
            : 'fixed left-0 top-16 bottom-0 z-[70] border-r border-gray-200 dark:border-gray-700'} ${isSidebarEffectivelyCollapsed ? (isHoverExpandedRail ? 'w-72' : 'w-16') : 'w-72'} bg-white dark:bg-gray-800 shadow-xl transition-all duration-200`}
        >
          <div className="h-full flex flex-col">
            <div className={`flex items-center ${isSidebarEffectivelyCollapsed ? 'justify-center' : 'justify-between'} p-3 border-b border-gray-200 dark:border-gray-700`}>
              {isSidebarEffectivelyCollapsed ? (
                <span className="text-gray-700 dark:text-gray-300">☰</span>
              ) : (
                <span className="font-semibold text-gray-900 dark:text-white">Navigation</span>
              )}
            </div>

            <nav className="flex-1 overflow-y-auto p-2 space-y-1">
              {showOverviewSection && (
                <div>
                  {!isSidebarEffectivelyCollapsed && (
                    <p className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Overview</p>
                  )}
                  {canShowDashboardLink && (
                    <a href="/dashboard" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">📊</span>{!isSidebarEffectivelyCollapsed && <span>Dashboard</span>}
                    </a>
                  )}
                </div>
              )}

              {showDeliverySection && (
                <div className={`${showOverviewSection ? 'mt-2 pt-2 border-t border-gray-200 dark:border-gray-700' : ''}`}>
                  {!isSidebarEffectivelyCollapsed && (
                    <p className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Delivery</p>
                  )}
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
                  {canShowTimesheetLink && (
                    <a href="/timesheet" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">📝</span>{!isSidebarEffectivelyCollapsed && <span>Timesheet</span>}
                    </a>
                  )}
                </div>
              )}

              {showServiceSection && (
                <div className={`${showOverviewSection || showDeliverySection ? 'mt-2 pt-2 border-t border-gray-200 dark:border-gray-700' : ''}`}>
                  {!isSidebarEffectivelyCollapsed && (
                    <p className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Service</p>
                  )}
                  {canShowTicketsLink && (
                    <a href="/tickets" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">🎫</span>{!isSidebarEffectivelyCollapsed && <span>Tickets</span>}
                    </a>
                  )}
                  {canShowCallRecordsLink && (
                    <a href="/call-records" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">📞</span>{!isSidebarEffectivelyCollapsed && <span>Call Records</span>}
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
                <div className={`${showOverviewSection || showDeliverySection || showServiceSection ? 'mt-2 pt-2 border-t border-gray-200 dark:border-gray-700' : ''}`}>
                  {!isSidebarEffectivelyCollapsed && (
                    <p className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Management</p>
                  )}
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
                </div>
              )}

              {showReportingSection && (
                <div className={`${showOverviewSection || showDeliverySection || showServiceSection || showManagementSection ? 'mt-2 pt-2 border-t border-gray-200 dark:border-gray-700' : ''}`}>
                  {!isSidebarEffectivelyCollapsed && (
                    <p className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Reporting</p>
                  )}
                  {canShowReportsLink && (
                    <a href="/web-reports" className={sidebarItemClass} onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}>
                      <span className="w-5 text-center">📈</span>{!isSidebarEffectivelyCollapsed && <span>Reports</span>}
                    </a>
                  )}
                </div>
              )}
            </nav>

            <div className="p-2 border-t border-gray-200 dark:border-gray-700">
              {canShowDocsLink && shouldUseLeftSidebar && (
                <a
                  href="/docs"
                  className={`${sidebarItemClass} mb-2`}
                  onClick={() => isFloatingMode && setIsFloatingSidebarOpen(false)}
                >
                  <span className="w-5 text-center">📘</span>{!isSidebarEffectivelyCollapsed && <span>User Manual</span>}
                </a>
              )}
              {!isSidebarEffectivelyCollapsed && (
                <p className="text-xs text-gray-500 dark:text-gray-400 px-1">Mode: {navbarLeftMode === 'floating' ? 'Floating' : 'Fixed'}</p>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* outer nav stretches across entire header so background fills 100% */}
      <nav
        className={`sticky top-0 z-[80] w-full bg-white dark:bg-gray-800 shadow ${
          navbarMenuLayout === 'left' && navbarLeftMode === 'fixed'
            ? (navbarLeftCollapsed ? 'nav-top-compensate-left-collapsed' : 'nav-top-compensate-left-expanded')
            : ''
        }`}
      >
        {/* content not limited to max width so nav items span entire header */}
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              {shouldUseLeftSidebar && (
                <button
                  onClick={toggleLeftSidebar}
                  className="p-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title={isFloatingMode ? (isFloatingSidebarOpen ? 'Hide menu' : 'Show menu') : (navbarLeftCollapsed ? 'Show menu' : 'Hide menu')}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
              <div className="flex items-center gap-3">
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={companyName || 'Company logo'}
                    className="w-8 h-8 rounded object-contain bg-white"
                  />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                    {(companyName || 'PM').trim().charAt(0).toUpperCase() || 'P'}
                  </div>
                )}
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  {companyName || 'Project Management'}
                </h1>
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
                        href: canShowApprovalsOption ? '/approvals?tab=time' : '/approvals?tab=vacations',
                        visible: !!canShowAnyApprovalsOption,
                        onClick: () => setManagementMenuOpen(false),
                      },
                    ]}
                  />
                )}

                {/* Reports */}

                {!isCustomerUser && (permissionsLoading || permissions?.canViewReports || permissions?.canManageOrganizations || !!user?.isAdmin) && (                 
                //{!isCustomerUser && (
                  <a 
                    href="/web-reports" 
                    className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    📈 Reports
                  </a>
                )}
              </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {/* Global Search - Hidden for customer users */}
              {!isCustomerUser && (
              <div className="relative" ref={searchRef}>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={() => searchQuery.length >= 2 && setSearchOpen(true)}
                    placeholder="Search..."
                    className="w-48 lg:w-64 px-4 py-2 pl-10 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
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
                  className="flex items-center space-x-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="hidden sm:inline">Quick Actions</span>
                  <svg 
                    className={`w-4 h-4 transition-transform ${quickActionsOpen ? 'rotate-180' : ''}`}
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

              {/* Active Timer indicator */}
              {!isCustomerUser && navTimer && (
                <div className="flex items-center gap-1">
                  <a
                    href={`/projects/${navTimer.ProjectId}`}
                    className="flex items-center gap-1.5 text-xs font-mono bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2.5 py-1.5 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors animate-pulse"
                    title={`Timer running: ${navTimer.TaskName} — ${navTimer.ProjectName}`}
                  >
                    <span>⏱</span>
                    <span className="hidden sm:inline max-w-[120px] truncate">{navTimer.TaskName}</span>
                    <span className="font-bold">{navFormatElapsed(navTimerSeconds)}</span>
                  </a>
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
                </div>
              )}

              {/* Notifications Dropdown - Hidden for customer users */}
              {!isCustomerUser && (
              <div className="relative" ref={notificationsRef}>
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
                  <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-96 overflow-hidden">
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
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center space-x-2 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium"
                >
                  <span>{user.firstName || user.username}</span>
                  <svg 
                    className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
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
                      <a
                        href="/docs"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => setDropdownOpen(false)}
                      >
                        📘 User Manual
                      </a>
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
                    </>
                    )}

                    {!isCustomerUser && (
                    <>
                    <a
                      href="/dashboard?tab=calendar"
                      className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => setDropdownOpen(false)}
                    >
                      📅 Calendar
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

      {/* Quick Task Add Modal */}
      {showQuickTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Quick Task Add
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
                {/* Organization */}
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
                    onChange={(value) => setTaskForm(prev => ({ ...prev, projectId: value }))}
                    options={projects.map(project => ({ value: project.Id, label: project.ProjectName }))}
                    placeholder="Select Project"
                    emptyText="Select Project"
                    disabled={!selectedOrgId || isLoadingData}
                    autoSelectSingleOption
                  />
                </div>

                {/* Task Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Task Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={taskForm.taskName}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, taskName: e.target.value }))}
                    placeholder="Enter task name"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <RichTextEditor
                    content={taskForm.description}
                    onChange={(html) => setTaskForm(prev => ({ ...prev, description: html }))}
                    placeholder="Enter task description"
                  />
                </div>

                {/* Status, Priority and Task Type Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Status
                    </label>
                    <select
                      value={taskForm.status}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      disabled={!selectedOrgId}
                    >
                      <option value="">Select Status</option>
                      {taskStatuses.map(status => (
                        <option key={status.Id} value={status.Id}>{status.StatusName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Priority
                    </label>
                    <select
                      value={taskForm.priority}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, priority: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      disabled={!selectedOrgId}
                    >
                      <option value="">Select Priority</option>
                      {taskPriorities.map(priority => (
                        <option key={priority.Id} value={priority.Id}>{priority.PriorityName}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Task Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={taskForm.taskType}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, taskType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      disabled={!selectedOrgId}
                      required
                    >
                      <option value="">Select Task Type</option>
                      {taskTypes.map(type => (
                        <option key={type.Id} value={type.Id}>{type.TypeName || type.StatusName}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Assigned To */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Assigned To
                  </label>
                  <SearchableSelect
                    value={taskForm.assignedTo}
                    onChange={(value) => setTaskForm(prev => ({ ...prev, assignedTo: value }))}
                    options={orgMembers.map(member => ({
                      value: member.Id,
                      label: member.FirstName && member.LastName
                        ? `${member.FirstName} ${member.LastName}`
                        : member.Username,
                    }))}
                    placeholder="Select Assignee"
                    emptyText="Unassigned"
                    disabled={!selectedOrgId}
                    autoSelectSingleOption
                  />
                </div>

                {/* Due Date and Estimated Hours Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={taskForm.dueDate}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Estimated Hours
                    </label>
                    <input
                      type="number"
                      value={taskForm.estimatedHours}
                      onChange={(e) => setTaskForm(prev => ({ ...prev, estimatedHours: e.target.value }))}
                      placeholder="0"
                      min="0"
                      step="0.5"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Unscheduled Work</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Show this task in Planner as unscheduled work.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(taskForm.unscheduledWork)}
                    onChange={(e) => setTaskForm(prev => ({ ...prev, unscheduledWork: e.target.checked }))}
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={closeQuickTaskModal}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTask}
                  disabled={isSaving || !taskForm.projectId || !taskForm.taskName.trim() || !taskForm.taskType}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center space-x-2"
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Task</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  New Project
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
                    Organization <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    value={projectForm.organizationId}
                    onChange={async (value) => {
                      setProjectForm(prev => ({ ...prev, organizationId: value, customerId: '', status: '' }));
                      if (value) {
                        try {
                          const res = await fetch(`${getApiUrl()}/api/customers?organizationId=${value}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                          });
                          if (res.ok) {
                            const data = await res.json();
                            setProjectCustomers(data.data || []);
                          }
                          
                          const statusRes = await statusValuesApi.getProjectStatuses(parseInt(value), token!);
                          setProjectStatuses(statusRes.statuses);
                        } catch (err) {
                          console.error('Failed to load customers/statuses:', err);
                        }
                      } else {
                        setProjectCustomers([]);
                        setProjectStatuses([]);
                      }
                    }}
                    options={organizations.map(org => ({ value: org.Id, label: org.Name }))}
                    placeholder="Select Organization"
                    emptyText="Select Organization"
                    disabled={isLoadingData}
                    autoSelectSingleOption
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Customer
                  </label>
                  <SearchableSelect
                    value={projectForm.customerId}
                    onChange={(value) => setProjectForm(prev => ({ ...prev, customerId: value }))}
                    options={projectCustomers.map(customer => ({ value: customer.Id, label: customer.Name }))}
                    placeholder="Select Customer"
                    emptyText="No customer"
                    disabled={!projectForm.organizationId}
                    autoSelectSingleOption
                  />
                  {projectForm.organizationId && projectCustomers.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      No customers available for this organization
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Project Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={projectForm.projectName}
                    onChange={(e) => setProjectForm(prev => ({ ...prev, projectName: e.target.value }))}
                    placeholder="Enter project name"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <RichTextEditor
                    content={projectForm.description}
                    onChange={(html) => setProjectForm(prev => ({ ...prev, description: html }))}
                    placeholder="Enter description"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Status
                  </label>
                  <select
                    value={projectForm.status}
                    onChange={(e) => setProjectForm(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    disabled={!projectForm.organizationId}
                  >
                    <option value="">Select Status</option>
                    {projectStatuses.map(status => (
                      <option key={status.Id} value={status.Id}>
                        {status.StatusName}
                      </option>
                    ))}
                  </select>
                  {projectForm.organizationId && projectStatuses.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      No project statuses available for this organization
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={projectForm.startDate}
                      onChange={(e) => setProjectForm(prev => ({ ...prev, startDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={projectForm.endDate}
                      onChange={(e) => setProjectForm(prev => ({ ...prev, endDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
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
                  onClick={handleSaveProject}
                  disabled={isSaving || !projectForm.organizationId || !projectForm.projectName.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {isSaving ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Time Entry Modal */}
      {activeModal === 'timeEntry' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  New Time Entry
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
                    Organization <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    value={timeEntryForm.organizationId}
                    onChange={async (value) => {
                      setTimeEntryForm(prev => ({ ...prev, organizationId: value, projectId: '', taskId: '' }));
                      setTasks([]);
                      await loadProjectsForOrg(value);
                    }}
                    options={organizations.map(org => ({ value: org.Id, label: org.Name }))}
                    placeholder="Select Organization"
                    emptyText="Select Organization"
                    disabled={isLoadingData}
                    autoSelectSingleOption
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Project <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    value={timeEntryForm.projectId}
                    onChange={async (value) => {
                      setTimeEntryForm(prev => ({ ...prev, projectId: value, taskId: '' }));
                      await loadTasksForProject(value);
                    }}
                    options={projects.map(proj => ({ value: proj.Id, label: proj.ProjectName }))}
                    placeholder="Select Project"
                    emptyText="Select Project"
                    disabled={!timeEntryForm.organizationId}
                    autoSelectSingleOption
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Task <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    value={timeEntryForm.taskId}
                    onChange={(value) => setTimeEntryForm(prev => ({ ...prev, taskId: value }))}
                    options={tasks.map(task => ({ value: task.Id, label: task.TaskName }))}
                    placeholder="Select Task"
                    emptyText="Select Task"
                    disabled={!timeEntryForm.projectId}
                    autoSelectSingleOption
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Work Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={timeEntryForm.workDate}
                    onChange={(e) => setTimeEntryForm(prev => ({ ...prev, workDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={timeEntryForm.startTime}
                      onChange={(e) => {
                        const newStartTime = e.target.value;
                        // Recalculate hours based on new start time and current end time
                        const hours = calculateHours(newStartTime, timeEntryForm.endTime);
                        setTimeEntryForm(prev => ({ ...prev, startTime: newStartTime, hours: hours > 0 ? hours.toFixed(2) : '' }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={timeEntryForm.endTime}
                      onChange={(e) => {
                        const newEndTime = e.target.value;
                        // Recalculate hours based on start time and new end time
                        const hours = calculateHours(timeEntryForm.startTime, newEndTime);
                        setTimeEntryForm(prev => ({ ...prev, endTime: newEndTime, hours: hours > 0 ? hours.toFixed(2) : '' }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Hours {timeEntryForm.startTime && timeEntryForm.endTime && `(calculated: ${calculateHours(timeEntryForm.startTime, timeEntryForm.endTime).toFixed(2)}h)`}
                  </label>
                  <input
                    type="number"
                    value={timeEntryForm.hours}
                    onChange={(e) => {
                      const hours = parseFloat(e.target.value) || 0;
                      // Recalculate end time based on start time + hours
                      const newEndTime = hours > 0 ? calculateEndTimeFromHours(timeEntryForm.startTime, hours) : timeEntryForm.endTime;
                      setTimeEntryForm(prev => ({ ...prev, hours: e.target.value, endTime: newEndTime }));
                    }}
                    placeholder={timeEntryForm.startTime && timeEntryForm.endTime ? `${calculateHours(timeEntryForm.startTime, timeEntryForm.endTime).toFixed(2)}` : "0"}
                    min="0"
                    step="0.25"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <RichTextEditor
                    content={timeEntryForm.description}
                    onChange={(html) => setTimeEntryForm(prev => ({ ...prev, description: html }))}
                    placeholder="What did you work on?"
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
                  onClick={handleSaveTimeEntry}
                  disabled={isSaving || !timeEntryForm.taskId || !timeEntryForm.workDate}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {isSaving ? 'Creating...' : 'Create Time Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Call Record Modal */}
      {activeModal === 'callRecord' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  New Call Record
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
                    Organization (optional - to link to task)
                  </label>
                  <SearchableSelect
                    value={callRecordForm.organizationId}
                    onChange={async (value) => {
                      setCallRecordForm(prev => ({ ...prev, organizationId: value, projectId: '', taskId: '' }));
                      setTasks([]);
                      await loadProjectsForOrg(value);
                    }}
                    options={organizations.map(org => ({ value: org.Id, label: org.Name }))}
                    placeholder="No Organization"
                    emptyText="No Organization"
                    disabled={isLoadingData}
                  />
                </div>

                {callRecordForm.organizationId && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Project
                      </label>
                      <SearchableSelect
                        value={callRecordForm.projectId}
                        onChange={async (value) => {
                          setCallRecordForm(prev => ({ ...prev, projectId: value, taskId: '' }));
                          await loadTasksForProject(value);
                        }}
                        options={projects.map(proj => ({ value: proj.Id, label: proj.ProjectName }))}
                        placeholder="No Project"
                        emptyText="No Project"
                      />
                    </div>

                    {callRecordForm.projectId && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Task
                        </label>
                        <SearchableSelect
                          value={callRecordForm.taskId}
                          onChange={(value) => setCallRecordForm(prev => ({ ...prev, taskId: value }))}
                          options={tasks.map(task => ({ value: task.Id, label: task.TaskName }))}
                          placeholder="No Task"
                          emptyText="No Task"
                        />
                      </div>
                    )}
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Call Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={callRecordForm.callDate}
                    onChange={(e) => setCallRecordForm(prev => ({ ...prev, callDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Start Time *
                    </label>
                    <input
                      type="time"
                      value={callRecordForm.startTime}
                      onChange={(e) => {
                        const newStartTime = e.target.value;
                        const hours = calculateHours(newStartTime, callRecordForm.endTime);
                        const durationMin = Math.round(hours * 60);
                        setCallRecordForm(prev => ({ ...prev, startTime: newStartTime, durationMinutes: durationMin > 0 ? durationMin : 30 }));
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
                      value={callRecordForm.endTime}
                      onChange={(e) => {
                        const newEndTime = e.target.value;
                        const hours = calculateHours(callRecordForm.startTime, newEndTime);
                        const durationMin = Math.round(hours * 60);
                        setCallRecordForm(prev => ({ ...prev, endTime: newEndTime, durationMinutes: durationMin > 0 ? durationMin : 30 }));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Duration (min)
                    </label>
                    <input
                      type="number"
                      value={callRecordForm.durationMinutes}
                      onChange={(e) => {
                        const duration = parseInt(e.target.value) || 30;
                        const newEndTime = duration > 0 ? calculateEndTimeFromMinutes(callRecordForm.startTime, duration) : callRecordForm.endTime;
                        setCallRecordForm(prev => ({ ...prev, durationMinutes: duration, endTime: newEndTime }));
                      }}
                      min="1"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Participants
                    </label>
                    <input
                      type="text"
                      value={callRecordForm.participants}
                      onChange={(e) => setCallRecordForm(prev => ({ ...prev, participants: e.target.value }))}
                      placeholder="Names or emails (optional)"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Call Type
                  </label>
                  <select
                    value={callRecordForm.callType}
                    onChange={(e) => setCallRecordForm(prev => ({ ...prev, callType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Teams">Teams</option>
                    <option value="Phone">Phone</option>
                    <option value="Zoom">Zoom</option>
                    <option value="Meet">Google Meet</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={callRecordForm.subject}
                    onChange={(e) => setCallRecordForm(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Call subject"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notes
                  </label>
                  <RichTextEditor
                    content={callRecordForm.notes}
                    onChange={(html) => setCallRecordForm(prev => ({ ...prev, notes: html }))}
                    placeholder="Call notes..."
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
                  onClick={handleSaveCallRecord}
                  disabled={isSaving || !callRecordForm.callDate}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {isSaving ? 'Creating...' : 'Create Call Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
