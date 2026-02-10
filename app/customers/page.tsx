'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/contexts/PermissionsContext';
import Navbar from '@/components/Navbar';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import SearchableSelect from '@/components/SearchableSelect';
import { 
  getCustomers, 
  createCustomer, 
  updateCustomer, 
  deleteCustomer,
  Customer,
  CreateCustomerData,
  UpdateCustomerData
} from '@/lib/api/customers';

type CustomerSortField = 'name' | 'email' | 'phone' | 'tickets';
type SortDirection = 'asc' | 'desc';

interface Organization {
  Id: number;
  Name: string;
}

export default function CustomersPage() {
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [supportUsers, setSupportUsers] = useState<{Id: number; FirstName: string; LastName: string; Username: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Search and sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<CustomerSortField>('name');
  const [sortOrder, setSortOrder] = useState<SortDirection>('asc');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    Name: '',
    Email: '',
    Phone: '',
    Address: '',
    Notes: '',
    OrganizationIds: [] as number[],
    DefaultSupportUserId: null as number | null,
    CreateDefaultProject: true,
    DefaultProjectName: ''
  });

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
    if (token) {
      loadData();
    }
  }, [token]);

  // Filter and sort customers when data or filters change
  useEffect(() => {
    let filtered = [...customers];
    
    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(customer =>
        customer.Name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.Email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.Phone?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let result = 0;
      
      if (sortBy === 'name') {
        result = a.Name.localeCompare(b.Name);
      } else if (sortBy === 'email') {
        result = (a.Email || '').localeCompare(b.Email || '');
      } else if (sortBy === 'phone') {
        result = (a.Phone || '').localeCompare(b.Phone || '');
      } else if (sortBy === 'tickets') {
        result = (Number(a.OpenTickets) || 0) - (Number(b.OpenTickets) || 0);
      }
      
      return sortOrder === 'asc' ? result : -result;
    });
    
    setFilteredCustomers(filtered);
  }, [customers, searchQuery, sortBy, sortOrder]);

  const handleSort = (field: CustomerSortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ field }: { field: CustomerSortField }) => {
    if (sortBy !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortOrder === 'asc' ? (
      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load customers
      const customersData = await getCustomers(token!);
      setCustomers(customersData);

      // Load organizations for the dropdown
      const response = await fetch(`${getApiUrl()}/api/organizations`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setOrganizations(data.organizations || []);
      }

      // Load support users
      const usersResponse = await fetch(`${getApiUrl()}/api/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        const supportUsersList = usersData.users.filter((u: any) => u.IsSupport);
        setSupportUsers(supportUsersList);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingCustomer(null);
    setFormData({
      Name: '',
      Email: '',
      Phone: '',
      Address: '',
      Notes: '',
      OrganizationIds: organizations.length === 1 ? [organizations[0].Id] : [],
      DefaultSupportUserId: null,
      CreateDefaultProject: true,
      DefaultProjectName: ''
    });
    setShowModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      Name: customer.Name,
      Email: customer.Email || '',
      Phone: customer.Phone || '',
      Address: customer.Address || '',
      Notes: customer.Notes || '',
      OrganizationIds: customer.Organizations?.map(o => o.OrganizationId) || [],
      DefaultSupportUserId: (customer as any).DefaultSupportUserId || null,
      CreateDefaultProject: false,
      DefaultProjectName: ''
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingCustomer(null);
    setError('');
  };

  const handleOrganizationToggle = (orgId: number) => {
    setFormData(prev => ({
      ...prev,
      OrganizationIds: prev.OrganizationIds.includes(orgId)
        ? prev.OrganizationIds.filter(id => id !== orgId)
        : [...prev.OrganizationIds, orgId]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);

    try {
      if (!formData.Name.trim()) {
        throw new Error('Customer name is required');
      }

      if (formData.OrganizationIds.length === 0) {
        throw new Error('At least one organization must be selected');
      }

      if (editingCustomer) {
        // Update
        const updateData: UpdateCustomerData = {
          Name: formData.Name,
          Email: formData.Email || undefined,
          Phone: formData.Phone || undefined,
          Address: formData.Address || undefined,
          Notes: formData.Notes || undefined,
          OrganizationIds: formData.OrganizationIds,
          DefaultSupportUserId: formData.DefaultSupportUserId || undefined
        };
        await updateCustomer(token!, editingCustomer.Id, updateData);
      } else {
        // Create
        const createData: CreateCustomerData = {
          Name: formData.Name,
          Email: formData.Email || undefined,
          Phone: formData.Phone || undefined,
          Address: formData.Address || undefined,
          Notes: formData.Notes || undefined,
          OrganizationIds: formData.OrganizationIds,
          DefaultSupportUserId: formData.DefaultSupportUserId || undefined,
          CreateDefaultProject: formData.CreateDefaultProject,
          DefaultProjectName: formData.CreateDefaultProject ? (formData.DefaultProjectName || formData.Name) : undefined
        };
        await createCustomer(token!, createData);
      }

      closeModal();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to save customer');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (customer: Customer) => {
    setConfirmModal({
      show: true,
      title: 'Delete Customer',
      message: `Are you sure you want to delete "${customer.Name}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await deleteCustomer(token!, customer.Id);
          setConfirmModal(null);
          loadData();
        } catch (err: any) {
          setError(err.message || 'Failed to delete customer');
          setConfirmModal(null);
        }
      }
    });
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-gray-600 dark:text-gray-400">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <CustomerUserGuard>
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customers</h1>
          {permissions?.canCreateCustomers && (
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Customer
          </button>
          )}
        </div>

        {/* Search and Sort */}
        <div className="mb-4 flex gap-4 items-center">
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
              <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
            {error}
          </div>
        )}

        {customers.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No customers yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Get started by adding your first customer.</p>
            {permissions?.canCreateCustomers && (
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Add Customer
            </button>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Name
                      <SortIcon field="name" />
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                    onClick={() => handleSort('email')}
                  >
                    <div className="flex items-center gap-1">
                      Email
                      <SortIcon field="email" />
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                    onClick={() => handleSort('phone')}
                  >
                    <div className="flex items-center gap-1">
                      Phone
                      <SortIcon field="phone" />
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 select-none"
                    onClick={() => handleSort('tickets')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Open Tickets
                      <SortIcon field="tickets" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Organizations
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredCustomers.map((customer) => (
                  <tr 
                    key={customer.Id} 
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => router.push(`/customers/${customer.Id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900 dark:text-white">{customer.Name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-500 dark:text-gray-400">{customer.Email || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-500 dark:text-gray-400">{customer.Phone || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-gray-900 dark:text-white font-medium">{customer.OpenTickets || 0}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {customer.Organizations?.map((org) => (
                          <span
                            key={org.OrganizationId}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                          >
                            {org.OrganizationName}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        {permissions?.canManageCustomers && (
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/customers/${customer.Id}`); }}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                        >
                          Manage
                        </button>
                        )}
                        {permissions?.canManageCustomers && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(customer); }}
                          className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 font-medium"
                        >
                          Edit
                        </button>
                        )}
                        {permissions?.canDeleteCustomers && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(customer); }}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
                        >
                          Delete
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingCustomer ? 'Edit Customer' : 'Add Customer'}
                </h2>
                <button
                  onClick={closeModal}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
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

              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
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
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.Email}
                      onChange={(e) => setFormData({ ...formData, Email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={formData.Phone}
                      onChange={(e) => setFormData({ ...formData, Phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Address
                    </label>
                    <textarea
                      value={formData.Address}
                      onChange={(e) => setFormData({ ...formData, Address: e.target.value })}
                      rows={2}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Default Support User
                    </label>
                    <SearchableSelect
                      value={formData.DefaultSupportUserId?.toString() || ''}
                      onChange={(value) => setFormData({ ...formData, DefaultSupportUserId: value ? parseInt(value) : null })}
                      options={supportUsers.map(user => ({
                        value: user.Id,
                        label: user.FirstName && user.LastName ? `${user.FirstName} ${user.LastName}` : user.Username
                      }))}
                      placeholder="Select Support User"
                      emptyText="No default support user"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      This user will be automatically assigned to tickets created by this customer
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={formData.Notes}
                      onChange={(e) => setFormData({ ...formData, Notes: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  {!editingCustomer && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.CreateDefaultProject}
                          onChange={(e) => setFormData({ ...formData, CreateDefaultProject: e.target.checked })}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Create default project
                        </span>
                      </label>
                      {formData.CreateDefaultProject && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Project Name
                          </label>
                          <input
                            type="text"
                            value={formData.DefaultProjectName}
                            onChange={(e) => setFormData({ ...formData, DefaultProjectName: e.target.value })}
                            placeholder={formData.Name || 'Same as customer name'}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Leave empty to use customer name
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Organizations <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-3">
                      {organizations.map((org) => (
                        <label
                          key={org.Id}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formData.OrganizationIds.includes(org.Id)}
                            onChange={() => handleOrganizationToggle(org.Id)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-gray-700 dark:text-gray-300">{org.Name}</span>
                        </label>
                      ))}
                    </div>
                    {formData.OrganizationIds.length === 0 && (
                      <p className="text-sm text-red-500 mt-1">Select at least one organization</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || formData.OrganizationIds.length === 0}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                  >
                    {isSaving ? 'Saving...' : editingCustomer ? 'Update' : 'Create'}
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
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                {confirmModal.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {confirmModal.message}
              </p>
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
    </CustomerUserGuard>
  );
}
