'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import ChangeHistory from '@/components/ChangeHistory';
import SearchableSelect from '@/components/SearchableSelect';

interface UserDetails {
  Id: number;
  Username: string;
  Email: string;
  UserType?: 'internal' | 'customer' | 'fictitious';
  FirstName: string | null;
  LastName: string | null;
  IsActive: number;
  IsAdmin: number;
  CustomerId: number | null;
  CustomerName: string | null;
  CreatedAt: string;
  UpdatedAt: string;
  WorkHoursMonday: number;
  WorkHoursTuesday: number;
  WorkHoursWednesday: number;
  WorkHoursThursday: number;
  WorkHoursFriday: number;
  WorkHoursSaturday: number;
  WorkHoursSunday: number;
}

interface Membership {
  Id: number;
  OrganizationId: number;
  OrganizationName: string;
  Role: string;
  PermissionGroupId: number | null;
  PermissionGroupName: string | null;
  JoinedAt: string;
}

interface Organization {
  Id: number;
  Name: string;
}

interface PermissionGroup {
  Id: number;
  GroupName: string;
}

interface KPIs {
  timeThisMonth: { hours: number; entries: number };
  timeAllTime: { hours: number; entries: number };
  tasks: { total: number; completed: number; inProgress: number; other: number };
  allocations: { totalHours: number; taskCount: number; dayCount: number };
  tickets: { total: number; open: number; resolved: number };
}

interface TimeEntry {
  Id: number;
  Hours: number;
  WorkDate: string;
  Description: string | null;
  TaskName: string;
  ProjectName: string;
}

const ROLES = ['Admin', 'Manager', 'Member', 'Viewer'];

export default function UserDetailPage() {
  const { user: currentUser, token, isLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const userId = params.id;

  const [user, setUser] = useState<UserDetails | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [recentActivity, setRecentActivity] = useState<TimeEntry[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<{ [orgId: number]: PermissionGroup[] }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'attachments' | 'history'>('overview');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  // Add membership modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ organizationId: '', role: 'Member', permissionGroupId: '' });
  const [adding, setAdding] = useState(false);

  // Edit membership modal
  const [editingMembership, setEditingMembership] = useState<Membership | null>(null);
  const [editForm, setEditForm] = useState({ role: '', permissionGroupId: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && (!currentUser || !currentUser.isAdmin)) {
      router.push('/dashboard');
    }
  }, [currentUser, isLoading, router]);

  useEffect(() => {
    if (token && userId) {
      loadUserDetails();
      loadOrganizations();
    }
  }, [token, userId]);

  const loadUserDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${getApiUrl()}/api/users/${userId}/details`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!res.ok) {
        if (res.status === 404) {
          setError('User not found');
        } else {
          throw new Error('Failed to load user');
        }
        return;
      }

      const data = await res.json();
      setUser(data.user);
      setMemberships(data.memberships || []);
      setKpis(data.kpis);
      setRecentActivity(data.recentActivity || []);
    } catch (err) {
      console.error('Failed to load user:', err);
      setError('Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  const loadAttachments = async () => {
    if (!token || !userId) return;
    
    setLoadingAttachments(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/users/${userId}/attachments`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setAttachments(data.attachments || []);
      }
    } catch (err: any) {
      console.error('Failed to load attachments:', err);
    } finally {
      setLoadingAttachments(false);
    }
  };

  const loadOrganizations = async () => {
    try {
      const res = await fetch(
        `${getApiUrl()}/api/organizations`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data.organizations || []);
      }
    } catch (err) {
      console.error('Failed to load organizations:', err);
    }
  };

  const loadPermissionGroups = async (orgId: number) => {
    if (permissionGroups[orgId]) return;
    
    try {
      const res = await fetch(
        `${getApiUrl()}/api/organizations/${orgId}/permission-groups`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setPermissionGroups(prev => ({ ...prev, [orgId]: data.permissionGroups || [] }));
      }
    } catch (err) {
      console.error('Failed to load permission groups:', err);
    }
  };

  const handleAddMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.organizationId) {
      setError('Please select an organization');
      return;
    }

    setAdding(true);
    setError('');

    try {
      const res = await fetch(
        `${getApiUrl()}/api/users/${userId}/memberships`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organizationId: parseInt(addForm.organizationId),
            role: addForm.role,
            permissionGroupId: addForm.permissionGroupId ? parseInt(addForm.permissionGroupId) : null,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to add membership');
      }

      setShowAddModal(false);
      setAddForm({ organizationId: '', role: 'Member', permissionGroupId: '' });
      await loadUserDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to add membership');
    } finally {
      setAdding(false);
    }
  };

  const handleEditMembership = (membership: Membership) => {
    setEditingMembership(membership);
    setEditForm({
      role: membership.Role,
      permissionGroupId: membership.PermissionGroupId?.toString() || '',
    });
    loadPermissionGroups(membership.OrganizationId);
  };

  const handleSaveMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMembership) return;

    setSaving(true);
    setError('');

    try {
      const res = await fetch(
        `${getApiUrl()}/api/users/${userId}/memberships/${editingMembership.Id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: editForm.role,
            permissionGroupId: editForm.permissionGroupId ? parseInt(editForm.permissionGroupId) : null,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update membership');
      }

      setEditingMembership(null);
      await loadUserDetails();
    } catch (err: any) {
      setError(err.message || 'Failed to update membership');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMembership = async (membershipId: number) => {
    try {
      const res = await fetch(
        `${getApiUrl()}/api/users/${userId}/memberships/${membershipId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (res.ok) {
        await loadUserDetails();
      }
    } catch (err) {
      console.error('Failed to remove membership:', err);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
    return '📎';
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Task': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'Ticket': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'Project': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case 'Customer': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'Organization': return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const handleDownloadAttachment = async (attachment: any) => {
    if (!token) return;
    
    try {
      let endpoint = '';
      switch (attachment.Type) {
        case 'Task':
          endpoint = `/api/task-attachments/${attachment.Id}`;
          break;
        case 'Ticket':
          endpoint = `/api/ticket-attachments/${attachment.Id}`;
          break;
        case 'Project':
          endpoint = `/api/project-attachments/${attachment.Id}`;
          break;
        case 'Customer':
          endpoint = `/api/customer-attachments/${attachment.Id}`;
          break;
        case 'Organization':
          endpoint = `/api/organization-attachments/${attachment.Id}`;
          break;
        default:
          return;
      }

      const response = await fetch(
        `${getApiUrl()}${endpoint}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const fileData = data.data;
        
        // Convert base64 to blob
        const byteCharacters = atob(fileData.FileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: fileData.FileType });
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileData.FileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('Failed to download attachment:', err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getDisplayName = () => {
    if (user?.FirstName && user?.LastName) {
      return `${user.FirstName} ${user.LastName}`;
    }
    return user?.Username || '';
  };

  const getWeeklyWorkHours = () => {
    if (!user) return 0;
    return (
      parseFloat(String(user.WorkHoursMonday || 0)) +
      parseFloat(String(user.WorkHoursTuesday || 0)) +
      parseFloat(String(user.WorkHoursWednesday || 0)) +
      parseFloat(String(user.WorkHoursThursday || 0)) +
      parseFloat(String(user.WorkHoursFriday || 0)) +
      parseFloat(String(user.WorkHoursSaturday || 0)) +
      parseFloat(String(user.WorkHoursSunday || 0))
    );
  };

  // Get organizations not yet assigned
  const availableOrganizations = organizations.filter(
    org => !memberships.some(m => m.OrganizationId === org.Id)
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!currentUser?.isAdmin) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Navbar />
        <div className="max-w-4xl mx-auto py-12 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <div className="text-4xl mb-4">😕</div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{error}</h2>
            <button
              onClick={() => router.push('/users')}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Back to Users
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/users')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Users
          </button>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-2xl font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">
              {user.FirstName?.[0] || user.Username[0].toUpperCase()}
              {user.LastName?.[0] || ''}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {getDisplayName()}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">@{user.Username}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {!!user.IsAdmin && (
                  <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 rounded-full">
                    Admin
                  </span>
                )}
                {user.UserType === 'fictitious' && (
                  <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded-full">
                    Fictitious User
                  </span>
                )}
                {user.CustomerId && (
                  <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 rounded-full">
                    Customer: {user.CustomerName}
                  </span>
                )}
                {!user.CustomerId && user.UserType !== 'fictitious' && (
                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                    Internal User
                  </span>
                )}
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  user.IsActive
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {user.IsActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* KPI Cards */}
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {kpis.timeThisMonth.hours.toFixed(1)}h
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Hours This Month</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">{kpis.timeThisMonth.entries} entries</div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {kpis.timeAllTime.hours.toFixed(0)}h
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total Hours</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">{kpis.timeAllTime.entries} entries</div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {kpis.tasks.total}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Tasks Assigned</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {kpis.tasks.completed} completed, {kpis.tasks.inProgress} in progress
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {kpis.allocations.totalHours.toFixed(0)}h
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Allocated Hours</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {kpis.allocations.taskCount} tasks, {kpis.allocations.dayCount} days
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                {kpis.tickets.total}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Tickets Created</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">
                {kpis.tickets.open} open, {kpis.tickets.resolved} resolved
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {getWeeklyWorkHours()}h
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Weekly Capacity</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">configured hours</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="-mb-px flex space-x-8" role="tablist">
            <button
              onClick={() => setActiveTab('overview')}
              role="tab"
              aria-selected={activeTab === 'overview'}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-all ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span>📊</span> Overview
              </span>
            </button>
            <button
              onClick={() => {
                setActiveTab('attachments');
                if (attachments.length === 0) {
                  loadAttachments();
                }
              }}
              role="tab"
              aria-selected={activeTab === 'attachments'}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-all ${
                activeTab === 'attachments'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span>📎</span> Attachments
                {attachments.length > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full">
                    {attachments.length}
                  </span>
                )}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              role="tab"
              aria-selected={activeTab === 'history'}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-all ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span>📜</span> History
              </span>
            </button>
          </nav>
        </div>

        {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - User Info & Memberships */}
          <div className="lg:col-span-2 space-y-6">
            {/* Organization Memberships */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>🏢</span> Organization Memberships
                  <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-blue-600 rounded-full">
                    {memberships.length}
                  </span>
                </h2>
                {availableOrganizations.length > 0 && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  >
                    <span>➕</span> Add Organization
                  </button>
                )}
              </div>

              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {memberships.length === 0 ? (
                  <div className="p-6 text-center">
                    <div className="text-4xl mb-2">🚀</div>
                    <p className="text-gray-500 dark:text-gray-400">
                      User is not a member of any organization yet
                    </p>
                  </div>
                ) : (
                  memberships.map((membership) => (
                    <div key={membership.Id} className="p-5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center justify-between group">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-lg font-bold text-blue-600 dark:text-blue-400">
                            {membership.OrganizationName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <button
                              onClick={() => {
                                // Navigate to organization details
                                router.push(`/organizations/${membership.OrganizationId}`);
                              }}
                              className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                              title="View organization"
                            >
                              {membership.OrganizationName}
                            </button>
                            <div className="flex gap-2 mt-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                Role: {membership.Role}
                              </span>
                              {membership.PermissionGroupName && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                  {membership.PermissionGroupName}
                                </span>
                              )}
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                📅 {formatDate(membership.JoinedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEditMembership(membership)}
                          title="Edit membership"
                          aria-label="Edit membership"
                          className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleRemoveMembership(membership.Id)}
                          title="Remove membership"
                          aria-label="Remove membership"
                          className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>⏱️</span> Recent Time Entries
                </h2>
              </div>

              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {recentActivity.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                    No recent time entries
                  </div>
                ) : (
                  recentActivity.map((entry) => (
                    <div 
                      key={entry.Id} 
                      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer group"
                      onClick={() => {
                        // Find task ID from entry - would need to be passed from backend or stored
                        // For now, just show the task/project names are clickable
                      }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Tasks detail would navigate to task page if we had taskId
                              // router.push(`/projects/${projectId}/tasks/${entry.taskId}`);
                            }}
                            className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 block text-left transition-colors"
                            title="View task details"
                          >
                            {entry.TaskName}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Would navigate to project page
                            }}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 block mt-0.5 text-left transition-colors"
                            title="View project details"
                          >
                            📁 {entry.ProjectName}
                          </button>
                          {entry.Description && (
                            <div className="text-sm text-gray-400 dark:text-gray-500 mt-2 truncate">
                              {entry.Description}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="inline-block px-3 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                            <div className="font-semibold text-blue-600 dark:text-blue-400">
                              {entry.Hours}h
                            </div>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                            {formatDate(entry.WorkDate)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Details */}
          <div className="space-y-6">
            {/* User Info */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                <span>👤</span> User Information
              </h3>
              <dl className="space-y-4">
                <div className="border-b border-gray-100 dark:border-gray-700 pb-4 last:border-b-0 last:pb-0">
                  <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Email</dt>
                  <dd className="text-sm text-gray-900 dark:text-white font-medium break-all hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    <a href={`mailto:${user.Email}`} title="Send email">
                      {user.Email}
                    </a>
                  </dd>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-4 last:border-b-0 last:pb-0">
                  <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Username</dt>
                  <dd className="text-sm text-gray-900 dark:text-white font-medium">@{user.Username}</dd>
                </div>
                {user.FirstName && (
                  <div className="border-b border-gray-100 dark:border-gray-700 pb-4 last:border-b-0 last:pb-0">
                    <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">First Name</dt>
                    <dd className="text-sm text-gray-900 dark:text-white font-medium">{user.FirstName}</dd>
                  </div>
                )}
                {user.LastName && (
                  <div className="border-b border-gray-100 dark:border-gray-700 pb-4 last:border-b-0 last:pb-0">
                    <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Last Name</dt>
                    <dd className="text-sm text-gray-900 dark:text-white font-medium">{user.LastName}</dd>
                  </div>
                )}
                <div className="border-b border-gray-100 dark:border-gray-700 pb-4 last:border-b-0 last:pb-0">
                  <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Created</dt>
                  <dd className="text-sm text-gray-900 dark:text-white font-medium">{formatDate(user.CreatedAt)}</dd>
                </div>
                <div className="border-b border-gray-100 dark:border-gray-700 pb-4 last:border-b-0 last:pb-0">
                  <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Last Updated</dt>
                  <dd className="text-sm text-gray-900 dark:text-white font-medium">{formatDate(user.UpdatedAt)}</dd>
                </div>
                {user.CustomerId && (
                  <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                    <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Associated Customer</dt>
                    <dd className="text-sm text-gray-900 dark:text-white font-medium">
                      <button
                        onClick={() => router.push(`/customers/${user.CustomerId}`)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                        title="View customer"
                      >
                        {user.CustomerName}
                      </button>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Work Hours */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-5 flex items-center gap-2">
                <span>📅</span> Work Schedule
              </h3>
              <div className="space-y-2.5">
                {[
                  ['Monday', user.WorkHoursMonday, '📍'],
                  ['Tuesday', user.WorkHoursTuesday, '📍'],
                  ['Wednesday', user.WorkHoursWednesday, '📍'],
                  ['Thursday', user.WorkHoursThursday, '📍'],
                  ['Friday', user.WorkHoursFriday, '📍'],
                  ['Saturday', user.WorkHoursSaturday, '🏳️'],
                  ['Sunday', user.WorkHoursSunday, '🏳️'],
                ].map(([day, hours, emoji]) => {
                  const hourValue = hours as number;
                  return (
                    <div key={day as string} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{emoji}</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{day}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              hourValue >= 8 ? 'bg-green-500' :
                              hourValue >= 4 ? 'bg-blue-500' :
                              hourValue > 0 ? 'bg-yellow-500' :
                              'bg-gray-300'
                            }`}
                            style={{ width: `${Math.min((hourValue / 8) * 100, 100)}%` }}
                          ></div>
                        </div>
                        <span className={`font-semibold text-sm w-8 text-right ${
                          hourValue > 0
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {hourValue || 0}h
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className="mt-4 pt-4 border-t-2 border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800/50">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">Weekly Total</span>
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{getWeeklyWorkHours()}h</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {activeTab === 'attachments' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span>📎</span> Uploaded Files
              </h2>
            </div>
            
            {loadingAttachments ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            ) : attachments.length === 0 ? (
              <div className="p-12 text-center">
                <div className="text-5xl mb-3">📁</div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">
                  No files uploaded yet
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                  Files will appear here once uploaded
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {attachments.map((attachment: any) => (
                  <div
                    key={`${attachment.Type}-${attachment.Id}`}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center gap-4 group"
                  >
                    <div className="text-3xl flex-shrink-0">{getFileIcon(attachment.FileType)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${getTypeColor(attachment.Type)}`}>
                          {attachment.Type}
                        </span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {attachment.EntityName}
                        </span>
                        {attachment.ProjectName && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            in {attachment.ProjectName}
                          </span>
                        )}
                      </div>
                      <div className="font-medium text-gray-900 dark:text-white truncate">
                        {attachment.FileName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formatFileSize(attachment.FileSize)} · {new Date(attachment.CreatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDownloadAttachment(attachment)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
                      title="Download file"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && user && currentUser?.isAdmin && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span>📜</span> Change History
              </h2>
            </div>
            <div className="p-6">
              <ChangeHistory entityType="user" entityId={user.Id} />
            </div>
          </div>
        )}
      </main>

      {/* Add Membership Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in-95">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>➕</span> Add to Organization
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 p-1 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleAddMembership} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Organization *
                </label>
                <SearchableSelect
                  value={addForm.organizationId}
                  onChange={(value) => {
                    setAddForm(prev => ({ ...prev, organizationId: value, permissionGroupId: '' }));
                    if (value) loadPermissionGroups(parseInt(value));
                  }}
                  options={availableOrganizations.map(org => ({ value: org.Id, label: org.Name }))}
                  placeholder="Select organization..."
                  emptyText="No organizations available"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role
                </label>
                <select
                  value={addForm.role}
                  onChange={(e) => setAddForm(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {ROLES.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              {addForm.organizationId && permissionGroups[parseInt(addForm.organizationId)]?.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Permission Group
                  </label>
                  <select
                    value={addForm.permissionGroupId}
                    onChange={(e) => setAddForm(prev => ({ ...prev, permissionGroupId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">None</option>
                    {permissionGroups[parseInt(addForm.organizationId)]?.map(pg => (
                      <option key={pg.Id} value={pg.Id}>{pg.GroupName}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
                >
                  {adding ? (
                    <>
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Adding...
                    </>
                  ) : (
                    <>
                      <span>➕</span> Add Membership
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Membership Modal */}
      {editingMembership && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in-95">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>✏️</span> Edit Membership
              </h2>
              <button
                onClick={() => setEditingMembership(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 p-1 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveMembership} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  {ROLES.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              {permissionGroups[editingMembership.OrganizationId]?.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Permission Group
                  </label>
                  <select
                    value={editForm.permissionGroupId}
                    onChange={(e) => setEditForm(prev => ({ ...prev, permissionGroupId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">None</option>
                    {permissionGroups[editingMembership.OrganizationId]?.map(pg => (
                      <option key={pg.Id} value={pg.Id}>{pg.GroupName}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingMembership(null)}
                  className="px-4 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <span>💾</span> Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
