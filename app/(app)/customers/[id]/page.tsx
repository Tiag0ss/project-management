'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, use, Suspense } from 'react';
import { useRouter } from 'next/navigation'
import { oldPath } from '@/lib/oldPath';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import PageTabs from '@/components/PageTabs';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import ChangeHistory from '@/components/ChangeHistory';
import TaskDetailModal from '@/components/TaskDetailModal';
import { getCustomer, updateCustomer, Customer } from '@/lib/api/customers';
import { projectsApi, Project as ApiProject } from '@/lib/api/projects';
import { tasksApi, Task as ApiTask } from '@/lib/api/tasks';
import { useFormatHours } from '@/lib/useFormatHours';
import { useColorVision } from '@/hooks/useColorVision';
import { useUrlTab } from '@/hooks/useUrlTab';

type TabType = 'overview' | 'users' | 'settings' | 'attachments' | 'history';
const CUSTOMER_DETAIL_TABS = ['overview', 'users', 'settings', 'attachments', 'history'] as const;

interface Project {
  Id: number;
  ProjectName: string;
  Status: number | null;
  StatusName?: string;
  StatusColor?: string;
  StatusIsClosed?: number;
  StatusIsCancelled?: number;
  TotalTasks: number;
  CompletedTasks: number;
  TotalEstimatedHours: number;
  TotalWorkedHours: number;
}

interface CustomerUser {
  UserId: number;
  Username: string;
  Email: string;
  FirstName: string;
  LastName: string;
  Role: string;
  CreatedAt: string;
}

interface User {
  Id: number;
  Username: string;
  Email: string;
  FirstName: string;
  LastName: string;
}

interface ProjectManager {
  Id: number;
  Username: string;
  FirstName: string;
  LastName: string;
}

interface CustomerContact {
  Id?: number;
  Name: string;
  Email: string;
  Phone: string;
  IsDefault: number;
}

interface TaskByStatus {
  StatusName: string;
  StatusColor: string;
  IsClosed: number;
  TaskCount: number;
}

interface TaskByPriority {
  PriorityName: string;
  PriorityColor: string;
  TaskCount: number;
}

interface RecentTimeEntry {
  Id: number;
  WorkDate: string;
  Hours: number;
  Description: string | null;
  UserId: number;
  FirstName: string;
  LastName: string;
  Username: string;
  TaskId: number;
  TaskName: string;
  ProjectId: number;
  ProjectName: string;
}

interface TeamMember {
  UserId: number;
  FirstName: string;
  LastName: string;
  Username: string;
  TaskCount: number;
  WorkedHours: number;
}

interface PendingTask {
  Id: number;
  TaskName: string;
  PlannedEndDate: string | null;
  ProjectId: number;
  ProjectName: string;
  AssignedFirstName: string | null;
  AssignedLastName: string | null;
  AssignedUsername: string | null;
  StatusName: string;
  StatusColor: string;
}

interface OverdueTask {
  Id: number;
  TaskName: string;
  PlannedEndDate: string;
  ProjectId: number;
  ProjectName: string;
  AssignedFirstName: string | null;
  AssignedLastName: string | null;
  AssignedUsername: string | null;
  StatusName: string;
  StatusColor: string;
}

interface UpcomingTask {
  Id: number;
  TaskName: string;
  PlannedEndDate: string;
  ProjectId: number;
  ProjectName: string;
  AssignedFirstName: string | null;
  AssignedLastName: string | null;
  AssignedUsername: string | null;
  StatusName: string;
  StatusColor: string;
}

interface CustomerOverviewData {
  tasksByStatus: TaskByStatus[];
  tasksByPriority: TaskByPriority[];
  recentTimeEntries: RecentTimeEntry[];
  teamMembers: TeamMember[];
  pendingTasks: PendingTask[];
  overdueTasks: OverdueTask[];
  upcomingTasks: UpcomingTask[];
}

export default function CustomerDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-gray-700 dark:text-gray-200">Loading…</div>
        </div>
      }
    >
      <CustomerDetailPageContent {...props} />
    </Suspense>
  );
}

function CustomerDetailPageContent({ params }: { params: Promise<{ id: string }> }) {
  const decimalHoursToHMS = useFormatHours();
  const { mapColor, pillStyle, backgroundStyle } = useColorVision();
  const resolvedParams = use(params);
  const customerId = parseInt(resolvedParams.id);
  
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customerUsers, setCustomerUsers] = useState<CustomerUser[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [projectManagers, setProjectManagers] = useState<ProjectManager[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [overviewData, setOverviewData] = useState<CustomerOverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [taskModalState, setTaskModalState] = useState<{
    show: boolean;
    isLoading: boolean;
    project: ApiProject | null;
    task: ApiTask | null;
    tasks: ApiTask[];
    error: string;
  }>({
    show: false,
    isLoading: false,
    project: null,
    task: null,
    tasks: [],
    error: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useUrlTab<TabType>(CUSTOMER_DETAIL_TABS, 'overview');
  
  // Attachments state
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    Name: '',
    ExternalName: '',
    Email: '',
    Phone: '',
    Address: '',
    Website: '',
    ProjectManagerId: '',
    Notes: ''
  });
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Add user modal
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [selectedUserRole, setSelectedUserRole] = useState('User');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [customerUsersSortField, setCustomerUsersSortField] = useState<'user' | 'email' | 'role'>('user');
  const [customerUsersSortDirection, setCustomerUsersSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(oldPath('/login'));
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!token) {
      setFeatureFlagsLoaded(true);
      return;
    }

    const loadFeatureFlags = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setInternalTicketsEnabled(data.internalTicketsEnabled !== false);
        } else {
          setInternalTicketsEnabled(true);
        }
      } catch {
        setInternalTicketsEnabled(true);
      } finally {
        setFeatureFlagsLoaded(true);
      }
    };

    loadFeatureFlags();
  }, [token]);

  useEffect(() => {
    if (token && customerId && featureFlagsLoaded) {
      loadData();
    }
  }, [token, customerId, featureFlagsLoaded]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load customer details
      const customerData = await getCustomer(token!, customerId);
      setCustomer(customerData);
      
      // Initialize settings form
      setSettingsForm({
        Name: customerData.Name || '',
        ExternalName: (customerData as any).ExternalName || '',
        Email: customerData.Email || '',
        Phone: customerData.Phone || '',
        Address: customerData.Address || '',
        Website: (customerData as any).Website || '',
        ProjectManagerId: (customerData as any).ProjectManagerId?.toString() || '',
        Notes: customerData.Notes || ''
      });

      const apiContacts = Array.isArray((customerData as any).Contacts)
        ? (customerData as any).Contacts
        : [];
      if (apiContacts.length > 0) {
        setCustomerContacts(
          apiContacts.map((contact: any) => ({
            Id: contact.Id,
            Name: contact.Name || '',
            Email: contact.Email || '',
            Phone: contact.Phone || '',
            IsDefault: contact.IsDefault === 1 ? 1 : 0,
          }))
        );
      } else if ((customerData as any).ContactPerson || (customerData as any).ContactEmail || (customerData as any).ContactPhone) {
        setCustomerContacts([
          {
            Name: (customerData as any).ContactPerson || '',
            Email: (customerData as any).ContactEmail || '',
            Phone: (customerData as any).ContactPhone || '',
            IsDefault: 1,
          },
        ]);
      } else {
        setCustomerContacts([]);
      }
      
      // Load customer projects
      const projectsRes = await fetch(`${getApiUrl()}/api/customers/${customerId}/projects`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData.data || []);
      }
      
      // Load customer users
      await loadCustomerUsers();
      
      // Load available users for adding
      await loadAvailableUsers();
      
      // Load project managers
      await loadProjectManagers();
      
      if (internalTicketsEnabled) {
        await loadTickets();
      } else {
        setTickets([]);
      }

      await loadOverviewData();

    } catch (err: any) {
      setError(err.message || 'Failed to load customer');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCustomerUsers = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/customers/${customerId}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomerUsers(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load customer users:', err);
    }
  };

  const loadAvailableUsers = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableUsers(data.users || []);
      }
    } catch (err) {
      console.error('Failed to load available users:', err);
    }
  };

  const loadProjectManagers = async () => {
    try {
      // Get users from organizations this customer belongs to
      const res = await fetch(`${getApiUrl()}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjectManagers(data.users || []);
      }
    } catch (err) {
      console.error('Failed to load project managers:', err);
    }
  };

  const loadTickets = async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/tickets?customerId=${customerId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to load tickets:', err);
    }
  };

  const loadOverviewData = async () => {
    setOverviewLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/customers/${customerId}/overview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOverviewData(data.data || null);
      }
    } catch (err) {
      console.error('Failed to load customer overview:', err);
    } finally {
      setOverviewLoading(false);
    }
  };

  const openTaskDetails = async (projectId: number, taskId: number) => {
    if (!token) return;

    setTaskModalState({
      show: true,
      isLoading: true,
      project: null,
      task: null,
      tasks: [],
      error: '',
    });

    try {
      const [projectRes, tasksRes] = await Promise.all([
        projectsApi.getById(projectId, token),
        tasksApi.getByProject(projectId, token),
      ]);

      const project = projectRes?.project || null;
      const projectTasks = Array.isArray(tasksRes?.tasks) ? tasksRes.tasks : [];
      const activeTask = projectTasks.find((entry) => Number(entry.Id) === Number(taskId)) || null;

      if (!project || !activeTask) {
        throw new Error('Task no longer exists in this project');
      }

      setTaskModalState({
        show: true,
        isLoading: false,
        project,
        task: activeTask,
        tasks: projectTasks,
        error: '',
      });
    } catch (err: any) {
      setTaskModalState({
        show: true,
        isLoading: false,
        project: null,
        task: null,
        tasks: [],
        error: err?.message || 'Failed to open task detail',
      });
    }
  };

  const closeTaskDetails = () => {
    setTaskModalState({
      show: false,
      isLoading: false,
      project: null,
      task: null,
      tasks: [],
      error: '',
    });
  };

  const loadAttachments = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/customer-attachments/customer/${customerId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setAttachments(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load attachments:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File size must be less than 10MB');
      return;
    }
    
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip', 'application/x-zip-compressed',
      'text/plain'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      setError('File type not allowed');
      return;
    }
    
    setUploadingFile(true);
    setError('');
    
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        const base64Content = base64Data.split(',')[1];
        
        const response = await fetch(
          `${getApiUrl()}/api/customer-attachments/customer/${customerId}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              fileData: base64Content,
            }),
          }
        );
        
        if (response.ok) {
          await loadAttachments();
          e.target.value = '';
        } else {
          const data = await response.json();
          setError(data.message || 'Failed to upload file');
        }
      };
      
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteAttachment = (attachmentId: number) => {
    if (!confirmModal) {
      setConfirmModal({
        show: true,
        title: 'Delete Attachment',
        message: 'Are you sure you want to delete this attachment?',
        onConfirm: async () => {
          try {
            const response = await fetch(
              `${getApiUrl()}/api/customer-attachments/${attachmentId}`,
              {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                },
              }
            );
            
            if (response.ok) {
              await loadAttachments();
            } else {
              const data = await response.json();
              setError(data.message || 'Failed to delete attachment');
            }
          } catch (err: any) {
            setError(err.message || 'An error occurred');
          } finally {
            setConfirmModal(null);
          }
        }
      });
    }
  };

  const handleAddUser = async () => {
    if (!selectedUserId) return;
    
    try {
      const res = await fetch(`${getApiUrl()}/api/customers/${customerId}/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: selectedUserId,
          role: selectedUserRole
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to add user');
      }
      
      await loadCustomerUsers();
      setShowAddUserModal(false);
      setSelectedUserId(0);
      setSelectedUserRole('User');
      setUserSearchQuery('');
      setUserDropdownOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to add user');
    }
  };

  const handleRemoveUser = async (userId: number) => {
    setConfirmModal({
      show: true,
      title: 'Remove User',
      message: 'Are you sure you want to remove this user from the customer?',
      onConfirm: async () => {
        try {
          const res = await fetch(`${getApiUrl()}/api/customers/${customerId}/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (!res.ok) {
            throw new Error('Failed to remove user');
          }
          
          await loadCustomerUsers();
          setConfirmModal(null);
        } catch (err: any) {
          setError(err.message || 'Failed to remove user');
          setConfirmModal(null);
        }
      }
    });
  };

  const addContact = () => {
    setCustomerContacts((prev) => {
      const next = [
        ...prev,
        {
          Name: '',
          Email: '',
          Phone: '',
          IsDefault: prev.length === 0 ? 1 : 0,
        },
      ];
      return next;
    });
  };

  const updateContact = (index: number, field: 'Name' | 'Email' | 'Phone', value: string) => {
    setCustomerContacts((prev) => prev.map((contact, contactIndex) => (
      contactIndex === index
        ? { ...contact, [field]: value }
        : contact
    )));
  };

  const setDefaultContact = (index: number) => {
    setCustomerContacts((prev) => prev.map((contact, contactIndex) => ({
      ...contact,
      IsDefault: contactIndex === index ? 1 : 0,
    })));
  };

  const removeContact = (index: number) => {
    setCustomerContacts((prev) => {
      const target = prev[index];
      const filtered = prev.filter((_, contactIndex) => contactIndex !== index);
      if (filtered.length === 0) return [];
      if (target?.IsDefault === 1 && !filtered.some((contact) => contact.IsDefault === 1)) {
        filtered[0] = { ...filtered[0], IsDefault: 1 };
      }
      return filtered;
    });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    
    try {
      const preparedContacts = customerContacts
        .map((contact) => ({
          Id: contact.Id,
          Name: contact.Name.trim(),
          Email: contact.Email.trim() || null,
          Phone: contact.Phone.trim() || null,
          IsDefault: contact.IsDefault === 1 ? 1 : 0,
        }))
        .filter((contact) => contact.Name || contact.Email || contact.Phone);

      for (const contact of preparedContacts) {
        if (!contact.Name) {
          throw new Error('Each contact must have a name');
        }
      }

      if (preparedContacts.length > 1 && preparedContacts.filter((contact) => contact.IsDefault === 1).length !== 1) {
        throw new Error('Select exactly one default contact');
      }

      if (preparedContacts.length === 1) {
        preparedContacts[0].IsDefault = 1;
      }

      const res = await fetch(`${getApiUrl()}/api/customers/${customerId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          Name: settingsForm.Name,
          ExternalName: settingsForm.ExternalName || null,
          Email: settingsForm.Email || null,
          Phone: settingsForm.Phone || null,
          Address: settingsForm.Address || null,
          Website: settingsForm.Website || null,
          Contacts: preparedContacts,
          ProjectManagerId: settingsForm.ProjectManagerId ? parseInt(settingsForm.ProjectManagerId) : null,
          Notes: settingsForm.Notes || null
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update customer');
      }
      
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate statistics
  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => !p.StatusIsClosed && !p.StatusIsCancelled).length;
  const completedProjects = projects.filter(p => p.StatusIsClosed === 1).length;
  const totalTasks = projects.reduce((sum, p) => sum + (Number(p.TotalTasks) || 0), 0);
  const completedTasks = projects.reduce((sum, p) => sum + (Number(p.CompletedTasks) || 0), 0);
  const totalEstimatedHours = projects.reduce((sum, p) => sum + (Number(p.TotalEstimatedHours) || 0), 0);
  const totalWorkedHours = projects.reduce((sum, p) => sum + (Number(p.TotalWorkedHours) || 0), 0);
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Calculate ticket statistics
  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => t.Status === 'Open').length;
  const resolvedTickets = tickets.filter(t => t.Status === 'Resolved' || t.Status === 'Closed').length;
  const unresolvedTickets = totalTickets - resolvedTickets;

  // Get project manager name
  const projectManager = projectManagers.find(pm => pm.Id === parseInt(settingsForm.ProjectManagerId));
  const defaultContact = customerContacts.find((contact) => contact.IsDefault === 1) || customerContacts[0] || null;

  const handleCustomerUsersSort = (field: 'user' | 'email' | 'role') => {
    if (customerUsersSortField === field) {
      setCustomerUsersSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setCustomerUsersSortField(field);
      setCustomerUsersSortDirection('asc');
    }
  };

  const sortedCustomerUsers = [...customerUsers].sort((a, b) => {
    let comparison = 0;

    switch (customerUsersSortField) {
      case 'email':
        comparison = (a.Email || '').localeCompare(b.Email || '');
        break;
      case 'role':
        comparison = (a.Role || '').localeCompare(b.Role || '');
        break;
      case 'user':
      default: {
        const aName = `${a.FirstName || ''} ${a.LastName || ''}`.trim() || a.Username || '';
        const bName = `${b.FirstName || ''} ${b.LastName || ''}`.trim() || b.Username || '';
        comparison = aName.localeCompare(bName);
        break;
      }
    }

    return customerUsersSortDirection === 'asc' ? comparison : -comparison;
  });

  const CustomerUsersSortIcon = ({ field }: { field: 'user' | 'email' | 'role' }) => {
    if (customerUsersSortField !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }

    return customerUsersSortDirection === 'asc' ? (
      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Customer not found</h2>
            <button
              onClick={() => router.push(oldPath('/customers'))}
              className="mt-4 text-blue-600 dark:text-blue-400 hover:underline"
            >
              Back to Customers
            </button>
          </div>
        </div>
      </div>
    );
  }

  const customerTabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'users' as const, label: 'Users' },
    { id: 'settings' as const, label: 'Settings' },
    { id: 'attachments' as const, label: 'Attachments' },
    { id: 'history' as const, label: 'History' },
  ];

  return (
    <CustomerUserGuard>
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-[var(--pm-text)] truncate">{customer.Name}</h1>
          {projectManager && (
            <p className="mt-1 text-sm text-[var(--pm-muted)]">
              PM: {projectManager.FirstName} {projectManager.LastName}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => router.push(oldPath('/customers'))}
          className="text-sm text-[var(--pm-muted)] hover:text-[var(--pm-text)]"
        >
          ← Back to Customers
        </button>
      </div>

      <PageTabs
        tabs={customerTabs}
        activeId={activeTab}
        onChange={(id) => {
          setActiveTab(id as TabType);
          if (id === 'attachments') loadAttachments();
        }}
      />

      <main className="min-w-0">
          {error && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
              {error}
              <button onClick={() => setError('')} className="ml-2 font-bold">×</button>
            </div>
          )}

          {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Contact Information */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wider">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Contact Person</div>
                  <div className="text-sm text-gray-900 dark:text-white">{defaultContact?.Name || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Email</div>
                  <div className="text-sm text-gray-900 dark:text-white">{defaultContact?.Email || customer.Email || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Phone</div>
                  <div className="text-sm text-gray-900 dark:text-white">{defaultContact?.Phone || customer.Phone || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Total Contacts</div>
                  <div className="text-sm text-gray-900 dark:text-white">{customerContacts.length}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Website</div>
                  <div className="text-sm text-gray-900 dark:text-white">
                    {(customer as any).Website ? (
                      <a href={(customer as any).Website} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                        {(customer as any).Website}
                      </a>
                    ) : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Address</div>
                  <div className="text-sm text-gray-900 dark:text-white whitespace-pre-line">{customer.Address || '-'}</div>
                </div>
              </div>
              {customer.Notes && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">Notes</div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{customer.Notes}</p>
                </div>
              )}
            </div>

            {/* KPI Stat Cards */}
            <div className={`grid grid-cols-2 ${internalTicketsEnabled ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4`}>
              <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-gray-300 dark:border-gray-600">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Projects</div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalProjects}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{completedProjects} completed</div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-green-500">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Active Projects</div>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">{activeProjects}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">of {totalProjects} total</div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-blue-500">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Tasks Complete</div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{overallProgress}%</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{completedTasks} / {totalTasks} tasks</div>
              </div>
              {internalTicketsEnabled && (
                <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-indigo-500">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Tickets</div>
                  <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{totalTickets}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{unresolvedTickets} unresolved</div>
                </div>
              )}
              <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-orange-500">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Hours Worked</div>
                <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{decimalHoursToHMS(totalWorkedHours)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">est. {decimalHoursToHMS(totalEstimatedHours)}</div>
              </div>
            </div>

            {/* Progress bars */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wider">Overall Progress</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Task completion</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{completedTasks}/{totalTasks} ({overallProgress}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div className="bg-blue-600 h-2.5 rounded-full transition-all" style={{ width: `${overallProgress}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Hours progress</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{decimalHoursToHMS(totalWorkedHours)} / {decimalHoursToHMS(totalEstimatedHours)}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${totalWorkedHours > totalEstimatedHours ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, totalEstimatedHours > 0 ? (totalWorkedHours / totalEstimatedHours) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Tasks by Status & Priority */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Tasks by Status */}
              <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wider">Tasks by Status</h3>
                {overviewLoading ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <div key={i} className="h-7 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}
                  </div>
                ) : !overviewData || overviewData.tasksByStatus.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No task data.</p>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const total = overviewData.tasksByStatus.reduce((s, r) => s + Number(r.TaskCount), 0);
                      return overviewData.tasksByStatus.map((row) => {
                        const pct = total > 0 ? Math.round((Number(row.TaskCount) / total) * 100) : 0;
                        return (
                          <div key={row.StatusName}>
                            <div className="flex justify-between items-center text-sm mb-1">
                              <div className="flex items-center gap-2">
                                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: mapColor(row.StatusColor || '#6B7280') }} />
                                <span className="text-gray-700 dark:text-gray-300">{row.StatusName}</span>
                              </div>
                              <span className="font-medium text-gray-900 dark:text-white">{Number(row.TaskCount)} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: mapColor(row.StatusColor || '#6B7280') }} />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              {/* Tasks by Priority */}
              <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wider">Tasks by Priority</h3>
                {overviewLoading ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <div key={i} className="h-7 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}
                  </div>
                ) : !overviewData || overviewData.tasksByPriority.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No priority data.</p>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const total = overviewData.tasksByPriority.reduce((s, r) => s + Number(r.TaskCount), 0);
                      return overviewData.tasksByPriority.map((row) => {
                        const pct = total > 0 ? Math.round((Number(row.TaskCount) / total) * 100) : 0;
                        return (
                          <div key={row.PriorityName}>
                            <div className="flex justify-between items-center text-sm mb-1">
                              <div className="flex items-center gap-2">
                                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: mapColor(row.PriorityColor || '#6B7280') }} />
                                <span className="text-gray-700 dark:text-gray-300">{row.PriorityName}</span>
                              </div>
                              <span className="font-medium text-gray-900 dark:text-white">{Number(row.TaskCount)} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: mapColor(row.PriorityColor || '#6B7280') }} />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Pending Tasks */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Pending Tasks</h3>
                {!overviewLoading && overviewData && overviewData.pendingTasks.length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                    {overviewData.pendingTasks.length}
                  </span>
                )}
              </div>
              {overviewLoading ? (
                <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}</div>
              ) : !overviewData || overviewData.pendingTasks.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No pending tasks.</p>
              ) : (
                <div className="space-y-2">
                  {overviewData.pendingTasks.map((task) => {
                    const assignedName = task.AssignedFirstName
                      ? `${task.AssignedFirstName} ${task.AssignedLastName || ''}`.trim()
                      : task.AssignedUsername;

                    return (
                      <div
                        key={task.Id}
                        onClick={() => openTaskDetails(task.ProjectId, task.Id)}
                        className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.TaskName}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{task.ProjectName}</div>
                          </div>
                          <span
                            className="px-2 py-0.5 text-xs rounded-full whitespace-nowrap flex-shrink-0"
                            style={pillStyle(task.StatusColor || '#374151', { alpha: '20' })}
                          >
                            {task.StatusName}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>
                            Due: {task.PlannedEndDate ? String(task.PlannedEndDate).split('T')[0] : 'No date'}
                          </span>
                          <span>
                            Assignee: {assignedName || 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Overdue & Upcoming */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Overdue Tasks */}
              <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Overdue Tasks</h3>
                  {!overviewLoading && overviewData && overviewData.overdueTasks.length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full">{overviewData.overdueTasks.length}</span>
                  )}
                </div>
                {overviewLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}</div>
                ) : !overviewData || overviewData.overdueTasks.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    No overdue tasks!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {overviewData.overdueTasks.map((task) => {
                      const daysOverdue = Math.floor((Date.now() - new Date(task.PlannedEndDate).getTime()) / 86400000);
                      return (
                        <div
                          key={task.Id}
                          onClick={() => openTaskDetails(task.ProjectId, task.Id)}
                          className="p-3 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.TaskName}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{task.ProjectName}</div>
                            </div>
                            <span className="text-xs font-semibold text-red-600 dark:text-red-400 whitespace-nowrap flex-shrink-0">{daysOverdue}d overdue</span>
                          </div>
                          {(task.AssignedFirstName || task.AssignedUsername) && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              👤 {task.AssignedFirstName ? `${task.AssignedFirstName} ${task.AssignedLastName || ''}`.trim() : task.AssignedUsername}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Upcoming Deadlines */}
              <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Upcoming (14 days)</h3>
                  {!overviewLoading && overviewData && overviewData.upcomingTasks.length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full">{overviewData.upcomingTasks.length}</span>
                  )}
                </div>
                {overviewLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}</div>
                ) : !overviewData || overviewData.upcomingTasks.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No deadlines in the next 14 days.</p>
                ) : (
                  <div className="space-y-2">
                    {overviewData.upcomingTasks.map((task) => {
                      const daysUntil = Math.ceil((new Date(task.PlannedEndDate).getTime() - Date.now()) / 86400000);
                      return (
                        <div
                          key={task.Id}
                          onClick={() => openTaskDetails(task.ProjectId, task.Id)}
                          className="p-3 border border-yellow-200 dark:border-yellow-900/50 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/20 transition-colors"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.TaskName}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{task.ProjectName}</div>
                            </div>
                            <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 whitespace-nowrap flex-shrink-0">
                              {daysUntil === 0 ? 'today' : `${daysUntil}d left`}
                            </span>
                          </div>
                          {(task.AssignedFirstName || task.AssignedUsername) && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              👤 {task.AssignedFirstName ? `${task.AssignedFirstName} ${task.AssignedLastName || ''}`.trim() : task.AssignedUsername}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Team Members */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wider">Team — Active Contributors</h3>
              {overviewLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}
                </div>
              ) : !overviewData || overviewData.teamMembers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No time entries recorded yet.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {overviewData.teamMembers.map((member) => {
                    const initials = [member.FirstName, member.LastName].filter(Boolean).map(n => n[0].toUpperCase()).join('') || member.Username[0].toUpperCase();
                    const fullName = [member.FirstName, member.LastName].filter(Boolean).join(' ') || member.Username;
                    return (
                      <div key={member.UserId} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col items-center text-center gap-1">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-sm">
                          {initials}
                        </div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white leading-tight">{fullName}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{decimalHoursToHMS(Number(member.WorkedHours))} · {member.TaskCount} task{Number(member.TaskCount) !== 1 ? 's' : ''}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recent Time Entries */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wider">Recent Activity</h3>
              {overviewLoading ? (
                <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}</div>
              ) : !overviewData || overviewData.recentTimeEntries.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No time entries recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        <th className="text-left pb-2 pr-4">Date</th>
                        <th className="text-left pb-2 pr-4">User</th>
                        <th className="text-left pb-2 pr-4">Task</th>
                        <th className="text-left pb-2 pr-4">Project</th>
                        <th className="text-right pb-2">Hours</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {overviewData.recentTimeEntries.map((entry) => {
                        const dateStr = String(entry.WorkDate).split('T')[0];
                        const personName = [entry.FirstName, entry.LastName].filter(Boolean).join(' ') || entry.Username;
                        return (
                          <tr key={entry.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                            <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 whitespace-nowrap">{dateStr}</td>
                            <td className="py-2 pr-4 text-gray-900 dark:text-white whitespace-nowrap">{personName}</td>
                            <td className="py-2 pr-4">
                              <div
                                className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline max-w-[180px] truncate"
                                onClick={() => openTaskDetails(entry.ProjectId, entry.TaskId)}
                                title={entry.TaskName}
                              >
                                {entry.TaskName}
                              </div>
                              {entry.Description && (
                                <div className="text-xs text-gray-400 truncate max-w-[180px]" title={entry.Description}>{entry.Description}</div>
                              )}
                            </td>
                            <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 max-w-[140px] truncate" title={entry.ProjectName}>{entry.ProjectName}</td>
                            <td className="py-2 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">{decimalHoursToHMS(Number(entry.Hours))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Projects */}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wider">Projects</h3>
              {projects.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No projects associated with this customer.</p>
              ) : (
                <div className="space-y-3">
                  {projects.map((project) => {
                    const progress = project.TotalTasks > 0 ? Math.round((Number(project.CompletedTasks) / Number(project.TotalTasks)) * 100) : 0;
                    return (
                      <div
                        key={project.Id}
                        onClick={() => router.push(`/projects/${project.Id}`)}
                        className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      >
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 dark:text-white truncate">{project.ProjectName}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {project.CompletedTasks}/{project.TotalTasks} tasks · {decimalHoursToHMS(Number(project.TotalWorkedHours || 0))} / {decimalHoursToHMS(Number(project.TotalEstimatedHours || 0))}
                            </div>
                          </div>
                          <span className="px-2 py-1 text-xs rounded-full whitespace-nowrap flex-shrink-0" style={pillStyle(project.StatusColor || '#374151', { alpha: '20' })}>
                            {project.StatusName || 'Unknown'}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${project.StatusIsClosed ? 'bg-green-500' : 'bg-blue-600'}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="text-right text-xs text-gray-400 mt-0.5">{progress}%</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Customer Users</h3>
              {permissions?.canManageCustomers && (
              <button
                onClick={() => setShowAddUserModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2"
              >
                <span>+</span>
                Add User
              </button>
              )}
            </div>
            
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Users associated with this customer will have limited access and can only view projects and tasks for this customer.
            </p>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                      onClick={() => handleCustomerUsersSort('user')}
                    >
                      <div className="flex items-center gap-1">
                        User
                        <CustomerUsersSortIcon field="user" />
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                      onClick={() => handleCustomerUsersSort('email')}
                    >
                      <div className="flex items-center gap-1">
                        Email
                        <CustomerUsersSortIcon field="email" />
                      </div>
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                      onClick={() => handleCustomerUsersSort('role')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Role
                        <CustomerUsersSortIcon field="role" />
                      </div>
                    </th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {customerUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        No users associated with this customer.
                      </td>
                    </tr>
                  ) : (
                    sortedCustomerUsers.map((cu) => (
                      <tr key={cu.UserId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {cu.FirstName} {cu.LastName}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">@{cu.Username}</div>
                        </td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{cu.Email}</td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                            {cu.Role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          {permissions?.canManageCustomers && (
                          <button
                            onClick={() => handleRemoveUser(cu.UserId)}
                            title="Remove user"
                            aria-label="Remove user"
                            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
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
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Customer Settings</h3>
            
            <form onSubmit={handleSaveSettings} className="space-y-6">
              {/* Basic Information */}
              <div>
                <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-4">Basic Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Customer Name *
                    </label>
                    <input
                      type="text"
                      value={settingsForm.Name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, Name: e.target.value })}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      External Name
                    </label>
                    <input
                      type="text"
                      value={settingsForm.ExternalName}
                      onChange={(e) => setSettingsForm({ ...settingsForm, ExternalName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Project Manager
                    </label>
                    <select
                      value={settingsForm.ProjectManagerId}
                      onChange={(e) => setSettingsForm({ ...settingsForm, ProjectManagerId: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Select a project manager</option>
                      {projectManagers.map((pm) => (
                        <option key={pm.Id} value={pm.Id}>
                          {pm.FirstName} {pm.LastName} (@{pm.Username})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={settingsForm.Email}
                      onChange={(e) => setSettingsForm({ ...settingsForm, Email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Phone
                    </label>
                    <input
                      type="text"
                      value={settingsForm.Phone}
                      onChange={(e) => setSettingsForm({ ...settingsForm, Phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Website
                    </label>
                    <input
                      type="url"
                      value={settingsForm.Website}
                      onChange={(e) => setSettingsForm({ ...settingsForm, Website: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Address
                    </label>
                    <textarea
                      value={settingsForm.Address}
                      onChange={(e) => setSettingsForm({ ...settingsForm, Address: e.target.value })}
                      rows={2}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Contacts */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-md font-semibold text-gray-900 dark:text-white">Contacts</h4>
                  <button
                    type="button"
                    onClick={addContact}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                  >
                    + Add Contact
                  </button>
                </div>

                {customerContacts.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400 p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                    No contacts added yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {customerContacts.map((contact, index) => (
                      <div key={`${contact.Id || 'new'}-${index}`} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                          <div className="md:col-span-3">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
                            <input
                              type="text"
                              value={contact.Name}
                              onChange={(e) => updateContact(index, 'Name', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
                            <input
                              type="email"
                              value={contact.Email}
                              onChange={(e) => updateContact(index, 'Email', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
                            <input
                              type="text"
                              value={contact.Phone}
                              onChange={(e) => updateContact(index, 'Phone', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                          <div className="md:col-span-2 flex items-center gap-2">
                            <input
                              id={`default-contact-${index}`}
                              type="radio"
                              name="default-contact"
                              checked={contact.IsDefault === 1}
                              onChange={() => setDefaultContact(index)}
                              className="w-4 h-4 text-blue-600"
                            />
                            <label htmlFor={`default-contact-${index}`} className="text-sm text-gray-700 dark:text-gray-300">
                              Default
                            </label>
                          </div>
                          <div className="md:col-span-1">
                            <button
                              type="button"
                              onClick={() => removeContact(index)}
                              className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={settingsForm.Notes}
                  onChange={(e) => setSettingsForm({ ...settingsForm, Notes: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {permissions?.canManageCustomers && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg transition-colors font-medium"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
              )}
            </form>
          </div>
        )}

        {activeTab === 'attachments' && (
          <AttachmentsTab 
            token={token!}
            attachments={attachments}
            uploadingFile={uploadingFile}
            onFileUpload={handleFileUpload}
            onDeleteAttachment={handleDeleteAttachment}
          />
        )}

        {activeTab === 'history' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">📜 Change History</h2>
            <ChangeHistory entityType="customer" entityId={customerId} />
          </div>
        )}
      </main>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add User to Customer</h2>
                <button
                  onClick={() => {
                    setShowAddUserModal(false);
                    setUserSearchQuery('');
                    setUserDropdownOpen(false);
                    setSelectedUserId(0);
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Select User
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={userSearchQuery}
                      onChange={(e) => {
                        setUserSearchQuery(e.target.value);
                        setUserDropdownOpen(true);
                        if (!e.target.value) setSelectedUserId(0);
                      }}
                      onFocus={() => setUserDropdownOpen(true)}
                      placeholder="Search users..."
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    {selectedUserId > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserId(0);
                          setUserSearchQuery('');
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      >
                        ×
                      </button>
                    )}
                    {userDropdownOpen && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {availableUsers
                          .filter(u => !customerUsers.find(cu => cu.UserId === u.Id))
                          .filter(u => {
                            const searchLower = userSearchQuery.toLowerCase();
                            return (
                              u.Username.toLowerCase().includes(searchLower) ||
                              (u.FirstName && u.FirstName.toLowerCase().includes(searchLower)) ||
                              (u.LastName && u.LastName.toLowerCase().includes(searchLower)) ||
                              `${u.FirstName} ${u.LastName}`.toLowerCase().includes(searchLower)
                            );
                          })
                          .map((u) => (
                            <div
                              key={u.Id}
                              onClick={() => {
                                setSelectedUserId(u.Id);
                                setUserSearchQuery(`${u.FirstName || ''} ${u.LastName || ''} (@${u.Username})`.trim());
                                setUserDropdownOpen(false);
                              }}
                              className={`px-4 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 ${
                                selectedUserId === u.Id ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                              }`}
                            >
                              <div className="font-medium text-gray-900 dark:text-white">
                                {u.FirstName} {u.LastName}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">@{u.Username}</div>
                            </div>
                          ))}
                        {availableUsers
                          .filter(u => !customerUsers.find(cu => cu.UserId === u.Id))
                          .filter(u => {
                            const searchLower = userSearchQuery.toLowerCase();
                            return (
                              u.Username.toLowerCase().includes(searchLower) ||
                              (u.FirstName && u.FirstName.toLowerCase().includes(searchLower)) ||
                              (u.LastName && u.LastName.toLowerCase().includes(searchLower)) ||
                              `${u.FirstName} ${u.LastName}`.toLowerCase().includes(searchLower)
                            );
                          }).length === 0 && (
                          <div className="px-4 py-2 text-gray-500 dark:text-gray-400 text-center">
                            No users found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Role
                  </label>
                  <select
                    value={selectedUserRole}
                    onChange={(e) => setSelectedUserRole(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="User">User</option>
                    <option value="Manager">Manager</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddUserModal(false);
                    setUserSearchQuery('');
                    setUserDropdownOpen(false);
                    setSelectedUserId(0);
                  }}
                  className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddUser}
                  disabled={!selectedUserId}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg transition-colors font-medium"
                >
                  Add User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {confirmModal.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {confirmModal.message}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {taskModalState.show && (
        <>
          {taskModalState.isLoading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 text-gray-700 dark:text-gray-300">
                Loading task details...
              </div>
            </div>
          )}

          {!taskModalState.isLoading && taskModalState.error && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[120]">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                <div className="text-sm text-red-600 dark:text-red-400 mb-4">{taskModalState.error}</div>
                <div className="flex justify-end">
                  <button
                    onClick={closeTaskDetails}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {!taskModalState.isLoading && !taskModalState.error && taskModalState.project && taskModalState.task && token && (
            <TaskDetailModal
              projectId={Number(taskModalState.project.Id)}
              organizationId={Number(taskModalState.project.OrganizationId)}
              task={taskModalState.task}
              project={taskModalState.project}
              tasks={taskModalState.tasks}
              onOpenTask={(targetTask: ApiTask) => {
                const fullTask = taskModalState.tasks.find((entry) => Number(entry.Id) === Number(targetTask.Id)) || targetTask;
                setTaskModalState((prev) => ({
                  ...prev,
                  task: fullTask,
                }));
              }}
              onClose={closeTaskDetails}
              onSaved={async () => {
                if (!taskModalState.project || !taskModalState.task) return;
                await openTaskDetails(Number(taskModalState.project.Id), Number(taskModalState.task.Id));
                await loadData();
              }}
              token={token}
            />
          )}
        </>
      )}

      <ScrollToTopButton />
    </div>
    </CustomerUserGuard>
  );
}

// Attachments Tab Component  
function AttachmentsTab({
  token,
  attachments,
  uploadingFile,
  onFileUpload,
  onDeleteAttachment
}: {
  token: string;
  attachments: any[];
  uploadingFile: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteAttachment: (id: number) => void;
}) {
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType === 'application/pdf') return '📄';
    if (fileType.includes('word')) return '📝';
    if (fileType.includes('excel') || fileType.includes('spreadsheet')) return '📊';
    if (fileType.includes('zip')) return '🗜️';
    if (fileType === 'text/plain') return '📃';
    return '📎';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const handleDownloadAttachment = async (attachmentId: number, fileName: string) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/customer-attachments/${attachmentId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const fileData = data.data;
        
        const byteCharacters = atob(fileData.FileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: fileData.FileType });
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to download attachment:', err);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Customer Attachments</h2>
        <div>
          <input
            type="file"
            id="customer-file-upload"
            className="hidden"
            onChange={onFileUpload}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
          />
          <label
            htmlFor="customer-file-upload"
            className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors ${
              uploadingFile ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {uploadingFile ? '📤 Uploading...' : '📤 Upload File'}
          </label>
        </div>
      </div>

      {attachments.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          No attachments yet. Upload files to get started.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {attachments.map((attachment) => (
            <div
              key={attachment.Id}
              className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-3xl">{getFileIcon(attachment.FileType)}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownloadAttachment(attachment.Id, attachment.FileName)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors"
                    title="Download"
                    aria-label="Download"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDeleteAttachment(attachment.Id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                    title="Delete"
                    aria-label="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="font-medium text-gray-900 dark:text-white truncate mb-1">
                {attachment.FileName}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {formatFileSize(attachment.FileSize)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(attachment.CreatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
      
    </div>
  );
}
