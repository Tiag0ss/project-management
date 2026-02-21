'use client';

import { getApiUrl } from '@/lib/api/config';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';

interface Application {
  Id: number;
  Name: string;
  Description: string | null;
  RepositoryUrl: string | null;
  OrganizationId: number;
  OrganizationName: string;
  ProjectCount: number;
  CustomerCount: number;
  VersionCount: number;
  Customers: { Id: number; Name: string }[];
  CreatedAt: string;
}

interface Organization {
  Id: number;
  Name: string;
}

interface Customer {
  Id: number;
  Name: string;
}

export default function ApplicationsPage() {
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const router = useRouter();

  const [applications, setApplications] = useState<Application[]>([]);
  const [filteredApplications, setFilteredApplications] = useState<Application[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    Name: '',
    Description: '',
    RepositoryUrl: '',
    OrganizationId: 0,
    CustomerIds: [] as number[],
  });

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (token) loadData();
  }, [token]);

  useEffect(() => {
    if (!searchQuery) {
      setFilteredApplications(applications);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredApplications(
        applications.filter(
          (a) =>
            a.Name.toLowerCase().includes(q) ||
            a.Description?.toLowerCase().includes(q) ||
            a.OrganizationName?.toLowerCase().includes(q)
        )
      );
    }
  }, [applications, searchQuery]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [appsRes, orgsRes, customersRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/applications`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/organizations`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${getApiUrl()}/api/customers`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (appsRes.ok) {
        const data = await appsRes.json();
        setApplications(data.applications || []);
      }
      if (orgsRes.ok) {
        const data = await orgsRes.json();
        setOrganizations(data.organizations || []);
      }
      if (customersRes.ok) {
        const data = await customersRes.json();
        console.log('Customers loaded from API:', data.data);
        setCustomers(data.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingApp(null);
    setFormData({
      Name: '',
      Description: '',
      RepositoryUrl: '',
      OrganizationId: organizations.length === 1 ? organizations[0].Id : 0,
      CustomerIds: [],
    });
    setShowModal(true);
  };

  const openEditModal = (app: Application) => {
    setEditingApp(app);
    setFormData({
      Name: app.Name,
      Description: app.Description || '',
      RepositoryUrl: app.RepositoryUrl || '',
      OrganizationId: app.OrganizationId,
      CustomerIds: app.Customers?.map((c) => c.Id) || [],
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingApp(null);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);

    try {
      if (!formData.Name.trim()) throw new Error('Name is required');
      if (!formData.OrganizationId) throw new Error('Organization is required');

      const url = editingApp
        ? `${getApiUrl()}/api/applications/${editingApp.Id}`
        : `${getApiUrl()}/api/applications`;

      const method = editingApp ? 'PUT' : 'POST';

      const body = editingApp
        ? { Name: formData.Name, Description: formData.Description, RepositoryUrl: formData.RepositoryUrl, CustomerIds: formData.CustomerIds }
        : { Name: formData.Name, Description: formData.Description, RepositoryUrl: formData.RepositoryUrl, OrganizationId: formData.OrganizationId, CustomerIds: formData.CustomerIds };

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to save application');
      }

      closeModal();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save application');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (app: Application) => {
    setConfirmModal({
      title: 'Delete Application',
      message: `Are you sure you want to delete "${app.Name}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await fetch(`${getApiUrl()}/api/applications/${app.Id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          });
          setConfirmModal(null);
          loadData();
        } catch (err: any) {
          setError(err.message || 'Failed to delete application');
          setConfirmModal(null);
        }
      },
    });
  };

  if (authLoading || permissionsLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Applications</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage applications, versions, and patch notes
            </p>
          </div>
          {permissions?.canCreateApplications && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Application
          </button>
          )}
        </div>

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search applications..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
            <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
            {error}
          </div>
        )}

        {/* Applications Grid */}
        {filteredApplications.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-lg shadow">
            <div className="text-5xl mb-4">📦</div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No applications yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Get started by creating your first application.</p>
            {permissions?.canCreateApplications && (
              <button
                onClick={openCreateModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                New Application
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredApplications.map((app) => (
              <div
                key={app.Id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/applications/${app.Id}`)}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-2xl">📦</span>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                        {app.Name}
                      </h3>
                    </div>
                    {(permissions?.canManageApplications || permissions?.canDeleteApplications) && (
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        {permissions?.canManageApplications && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(app); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                        {permissions?.canDeleteApplications && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(app); }}
                            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {app.Description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
                      {app.Description}
                    </p>
                  )}

                  {app.RepositoryUrl && (
                    <a
                      href={app.RepositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mb-3"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Repository
                    </a>
                  )}

                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      {app.ProjectCount} project{app.ProjectCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      {app.VersionCount} version{app.VersionCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {app.CustomerCount} customer{app.CustomerCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="mt-2">
                    <span className="text-xs text-gray-400 dark:text-gray-500">{app.OrganizationName}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingApp ? 'Edit Application' : 'New Application'}
                </h2>
                <button onClick={closeModal} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.Name}
                    onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.Description}
                    onChange={(e) => setFormData({ ...formData, Description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Repository URL
                  </label>
                  <input
                    type="url"
                    value={formData.RepositoryUrl}
                    onChange={(e) => setFormData({ ...formData, RepositoryUrl: e.target.value })}
                    placeholder="https://github.com/org/repo"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {!editingApp && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Organization <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.OrganizationId}
                      onChange={(e) => setFormData({ ...formData, OrganizationId: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      required
                    >
                      <option value={0}>Select organization...</option>
                      {organizations.map((org) => (
                        <option key={org.Id} value={org.Id}>{org.Name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Associated Customers
                  </label>
                  <SearchableMultiSelect
                    values={formData.CustomerIds}
                    onChange={(values) => {
                      const numericValues = values.filter((v): v is number => typeof v === 'number');
                      setFormData({ ...formData, CustomerIds: numericValues });
                    }}
                    options={customers.map(c => ({
                      value: c.Id,
                      label: c.Name
                    }))}
                    placeholder="Select customers..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                  >
                    {isSaving ? 'Saving...' : editingApp ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{confirmModal.title}</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{confirmModal.message}</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmModal.onConfirm}
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
  );
}
