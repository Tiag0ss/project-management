'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import ChangeHistory from '@/components/ChangeHistory';
import { getCustomer, updateCustomer, Customer } from '@/lib/api/customers';

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

type TabType = 'overview' | 'users' | 'settings' | 'attachments' | 'history';

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const customerId = parseInt(resolvedParams.id);
  
  const { user, token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customerUsers, setCustomerUsers] = useState<CustomerUser[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [projectManagers, setProjectManagers] = useState<ProjectManager[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  
  // Attachments state
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    Name: '',
    Email: '',
    Phone: '',
    Address: '',
    Website: '',
    ContactPerson: '',
    ContactEmail: '',
    ContactPhone: '',
    ProjectManagerId: '',
    Notes: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  
  // Add user modal
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [selectedUserRole, setSelectedUserRole] = useState('User');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  
  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (token && customerId) {
      loadData();
    }
  }, [token, customerId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load customer details
      const customerData = await getCustomer(token!, customerId);
      setCustomer(customerData);
      
      // Initialize settings form
      setSettingsForm({
        Name: customerData.Name || '',
        Email: customerData.Email || '',
        Phone: customerData.Phone || '',
        Address: customerData.Address || '',
        Website: (customerData as any).Website || '',
        ContactPerson: (customerData as any).ContactPerson || '',
        ContactEmail: (customerData as any).ContactEmail || '',
        ContactPhone: (customerData as any).ContactPhone || '',
        ProjectManagerId: (customerData as any).ProjectManagerId?.toString() || '',
        Notes: customerData.Notes || ''
      });
      
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
      
      // Load customer tickets
      await loadTickets();
      
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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    
    try {
      const res = await fetch(`${getApiUrl()}/api/customers/${customerId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          Name: settingsForm.Name,
          Email: settingsForm.Email || null,
          Phone: settingsForm.Phone || null,
          Address: settingsForm.Address || null,
          Website: settingsForm.Website || null,
          ContactPerson: settingsForm.ContactPerson || null,
          ContactEmail: settingsForm.ContactEmail || null,
          ContactPhone: settingsForm.ContactPhone || null,
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
        <Navbar />
        <div className="max-w-7xl mx-auto py-6 px-4">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Customer not found</h2>
            <button
              onClick={() => router.push('/customers')}
              className="mt-4 text-blue-600 dark:text-blue-400 hover:underline"
            >
              Back to Customers
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <CustomerUserGuard>
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />
      
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
            <button onClick={() => router.push('/customers')} className="hover:text-blue-600 dark:hover:text-blue-400">
              Customers
            </button>
            <span>/</span>
            <span className="text-gray-900 dark:text-white">{customer.Name}</span>
          </div>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{customer.Name}</h1>
              {projectManager && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Project Manager: {projectManager.FirstName} {projectManager.LastName}
                </p>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
            {error}
            <button onClick={() => setError('')} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="-mb-px flex space-x-8">
            {(['overview', 'users', 'settings'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
            <button
              onClick={() => {
                setActiveTab('attachments');
                loadAttachments();
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'attachments'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              📎 Attachments ({attachments.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              📜 History
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Projects</div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalProjects}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border-l-4 border-green-500">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Active Projects</div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{activeProjects}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border-l-4 border-blue-500">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Tasks Completed</div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{completedTasks}/{totalTasks}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border-l-4 border-indigo-500">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Tickets</div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalTickets}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {unresolvedTickets} pending
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border-l-4 border-orange-500">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Hours Worked</div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalWorkedHours.toFixed(0)}h</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  of {totalEstimatedHours.toFixed(0)}h estimated
                </div>
              </div>
            </div>

            {/* Progress Overview */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Overall Progress</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Tasks Completed</span>
                    <span className="font-medium text-gray-900 dark:text-white">{completedTasks}/{totalTasks} ({overallProgress}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div 
                      className="bg-blue-600 h-3 rounded-full transition-all"
                      style={{ width: `${overallProgress}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Hours Progress</span>
                    <span className="font-medium text-gray-900 dark:text-white">{totalWorkedHours.toFixed(0)}h / {totalEstimatedHours.toFixed(0)}h</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div 
                      className={`h-3 rounded-full transition-all ${totalWorkedHours > totalEstimatedHours ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, totalEstimatedHours > 0 ? (totalWorkedHours / totalEstimatedHours) * 100 : 0)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Contact Person</div>
                  <div className="text-gray-900 dark:text-white">{(customer as any).ContactPerson || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Email</div>
                  <div className="text-gray-900 dark:text-white">{(customer as any).ContactEmail || customer.Email || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Phone</div>
                  <div className="text-gray-900 dark:text-white">{(customer as any).ContactPhone || customer.Phone || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Website</div>
                  <div className="text-gray-900 dark:text-white">
                    {(customer as any).Website ? (
                      <a href={(customer as any).Website} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                        {(customer as any).Website}
                      </a>
                    ) : '-'}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-sm text-gray-500 dark:text-gray-400">Address</div>
                  <div className="text-gray-900 dark:text-white whitespace-pre-line">{customer.Address || '-'}</div>
                </div>
              </div>
            </div>

            {/* Projects List */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Projects</h3>
              {projects.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400">No projects associated with this customer.</p>
              ) : (
                <div className="space-y-3">
                  {projects.map((project) => {
                    const progress = project.TotalTasks > 0 ? Math.round((project.CompletedTasks / project.TotalTasks) * 100) : 0;
                    return (
                      <div
                        key={project.Id}
                        onClick={() => router.push(`/projects/${project.Id}`)}
                        className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">{project.ProjectName}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {project.CompletedTasks}/{project.TotalTasks} tasks • {Number(project.TotalWorkedHours || 0).toFixed(1)}h worked
                            </div>
                          </div>
                          <span className="px-2 py-1 text-xs rounded-full" style={{ backgroundColor: project.StatusColor ? `${project.StatusColor}20` : undefined, color: project.StatusColor || undefined }}>
                            {project.StatusName || 'Unknown'}
                          </span>
                        </div>
                        <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${progress}%` }} />
                        </div>
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
              <button
                onClick={() => setShowAddUserModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2"
              >
                <span>+</span>
                Add User
              </button>
            </div>
            
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Users associated with this customer will have limited access and can only view projects and tasks for this customer.
            </p>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {customerUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        No users associated with this customer.
                      </td>
                    </tr>
                  ) : (
                    customerUsers.map((cu) => (
                      <tr key={cu.UserId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
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
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleRemoveUser(cu.UserId)}
                            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium"
                          >
                            Remove
                          </button>
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

              {/* Contact Person */}
              <div>
                <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-4">Contact Person</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={settingsForm.ContactPerson}
                      onChange={(e) => setSettingsForm({ ...settingsForm, ContactPerson: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={settingsForm.ContactEmail}
                      onChange={(e) => setSettingsForm({ ...settingsForm, ContactEmail: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Phone
                    </label>
                    <input
                      type="text"
                      value={settingsForm.ContactPhone}
                      onChange={(e) => setSettingsForm({ ...settingsForm, ContactPhone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
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

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg transition-colors font-medium"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'attachments' && (
          <AttachmentsTab 
            customerId={customerId}
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
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
    </div>
    </CustomerUserGuard>
  );
}

// Attachments Tab Component  
function AttachmentsTab({
  customerId,
  token,
  attachments,
  uploadingFile,
  onFileUpload,
  onDeleteAttachment
}: {
  customerId: number;
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
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    title="Download"
                  >
                    ⬇️
                  </button>
                  <button
                    onClick={() => onDeleteAttachment(attachment.Id)}
                    className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    title="Delete"
                  >
                    🗑️
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
      
      {/* Change History */}
      <div className="mt-6">
        <ChangeHistory entityType="customer" entityId={customerId} />
      </div>
    </div>
  );
}
