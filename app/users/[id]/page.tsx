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
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');

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
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Users
          </button>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-2xl font-bold text-blue-600 dark:text-blue-400">
                {user.FirstName?.[0] || user.Username[0].toUpperCase()}
                {user.LastName?.[0] || ''}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {getDisplayName()}
                </h1>
                <p className="text-gray-500 dark:text-gray-400">@{user.Username}</p>
                <div className="flex gap-2 mt-1">
                  {!!user.IsAdmin && (
                    <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 rounded-full">
                      Admin
                    </span>
                  )}
                  {user.CustomerId && (
                    <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 rounded-full">
                      Customer: {user.CustomerName}
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
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg">
            {error}
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
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              📊 Overview
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

        {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - User Info & Memberships */}
          <div className="lg:col-span-2 space-y-6">
            {/* Organization Memberships */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Organization Memberships ({memberships.length})
                </h2>
                {availableOrganizations.length > 0 && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg"
                  >
                    + Add to Organization
                  </button>
                )}
              </div>

              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {memberships.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                    User is not a member of any organization
                  </div>
                ) : (
                  memberships.map((membership) => (
                    <div key={membership.Id} className="p-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {membership.OrganizationName}
                        </div>
                        <div className="flex gap-2 mt-1">
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                            {membership.Role}
                          </span>
                          {membership.PermissionGroupName && (
                            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded-full">
                              {membership.PermissionGroupName}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Joined {formatDate(membership.JoinedAt)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditMembership(membership)}
                          className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRemoveMembership(membership.Id)}
                          className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 dark:text-red-400"
                        >
                          Remove
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
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Recent Time Entries
                </h2>
              </div>

              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {recentActivity.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                    No recent time entries
                  </div>
                ) : (
                  recentActivity.map((entry) => (
                    <div key={entry.Id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {entry.TaskName}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {entry.ProjectName}
                          </div>
                          {entry.Description && (
                            <div className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                              {entry.Description}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {entry.Hours}h
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
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
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                User Information
              </h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Email</dt>
                  <dd className="text-sm text-gray-900 dark:text-white">{user.Email}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Username</dt>
                  <dd className="text-sm text-gray-900 dark:text-white">@{user.Username}</dd>
                </div>
                {user.FirstName && (
                  <div>
                    <dt className="text-sm text-gray-500 dark:text-gray-400">First Name</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">{user.FirstName}</dd>
                  </div>
                )}
                {user.LastName && (
                  <div>
                    <dt className="text-sm text-gray-500 dark:text-gray-400">Last Name</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">{user.LastName}</dd>
                  </div>
                )}
                <hr className="border-gray-200 dark:border-gray-700" />
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt>
                  <dd className="text-sm text-gray-900 dark:text-white">{formatDate(user.CreatedAt)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Last Updated</dt>
                  <dd className="text-sm text-gray-900 dark:text-white">{formatDate(user.UpdatedAt)}</dd>
                </div>
              </dl>
            </div>

            {/* Work Hours */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                Work Schedule
              </h3>
              <div className="space-y-2">
                {[
                  ['Monday', user.WorkHoursMonday],
                  ['Tuesday', user.WorkHoursTuesday],
                  ['Wednesday', user.WorkHoursWednesday],
                  ['Thursday', user.WorkHoursThursday],
                  ['Friday', user.WorkHoursFriday],
                  ['Saturday', user.WorkHoursSaturday],
                  ['Sunday', user.WorkHoursSunday],
                ].map(([day, hours]) => (
                  <div key={day as string} className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{day}</span>
                    <span className={`font-medium ${
                      (hours as number) > 0
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {hours || 0}h
                    </span>
                  </div>
                ))}
                <hr className="border-gray-200 dark:border-gray-700 my-2" />
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-700 dark:text-gray-300">Total</span>
                  <span className="text-blue-600 dark:text-blue-400">{getWeeklyWorkHours()}h/week</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {activeTab === 'history' && user && currentUser?.isAdmin && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">📜 Change History</h2>
            <ChangeHistory entityType="user" entityId={user.Id} />
          </div>
        )}
      </main>

      {/* Add Membership Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Add to Organization
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg"
                >
                  {adding ? 'Adding...' : 'Add Membership'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Membership Modal */}
      {editingMembership && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Edit Membership - {editingMembership.OrganizationName}
              </h2>
              <button
                onClick={() => setEditingMembership(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
