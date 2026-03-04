'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/contexts/PermissionsContext';
import Navbar from '@/components/Navbar';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import SearchableSelect from '@/components/SearchableSelect';
import { projectsApi, Project } from '@/lib/api/projects';
import { downloadCsv, parseBooleanLike, parseCsv, toCsv } from '@/lib/csv';
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

interface CustomerProjectStats {
  projectCount: number;
  totalTasks: number;
  completedTasks: number;
}

export default function CustomersPage() {
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions, isLoading: isLoadingPermissions } = usePermissions();
  const router = useRouter();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [supportUsers, setSupportUsers] = useState<{Id: number; FirstName: string; LastName: string; Username: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [customerProjectStats, setCustomerProjectStats] = useState<Record<number, CustomerProjectStats>>({});
  
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
    ExternalName: '',
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
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!token) {
      setFeatureFlagsLoaded(true);
      return;
    }

    const loadFeatureFlags = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/system-settings/public`);
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
    if (token && featureFlagsLoaded) {
      loadData();
    }
  }, [token, featureFlagsLoaded]);

  useEffect(() => {
    if (!internalTicketsEnabled && sortBy === 'tickets') {
      setSortBy('name');
      setSortOrder('asc');
    }
  }, [internalTicketsEnabled, sortBy]);

  const additionalCustomerColumnKeys = useMemo(() => {
    const excludedKeys = new Set<string>([
      'Id',
      'Name',
      'ExternalName',
      'Email',
      'Phone',
      'OpenTickets',
      'Organizations',
      'Contacts',
      'Address',
      'Notes',
    ]);

    const keys = new Set<string>();
    for (const customer of customers) {
      const record = customer as unknown as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (excludedKeys.has(key)) continue;
        const value = record[key];
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) continue;
        if (typeof value === 'object') continue;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            continue;
          }
        }
        keys.add(key);
      }
    }

    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const formatExtraColumnLabel = (rawKey: string) =>
    rawKey
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (value) => value.toUpperCase());

  const renderCustomerExtraColumnValue = (customer: Customer, rawKey: string): string => {
    const record = customer as unknown as Record<string, unknown>;
    const value = record[rawKey];
    if (value === undefined || value === null) return '-';

    const relationBase = rawKey.endsWith('Id')
      ? rawKey.slice(0, -2)
      : rawKey.toLowerCase().endsWith('_id')
        ? rawKey.slice(0, -3)
        : null;
    if (relationBase) {
      const relationKeys = [
        `${relationBase}Name`,
        `${relationBase}Title`,
        `${relationBase}Description`,
        `${relationBase}DisplayName`,
        `${relationBase}Label`,
        `${relationBase}Code`,
        `${relationBase}Number`,
        `${relationBase}_name`,
        `${relationBase}_title`,
        `${relationBase}_description`,
      ];
      const relationValue = relationKeys
        .map((key) => record[key])
        .find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim().length > 0);

      if (relationValue !== undefined && relationValue !== null) {
        const idText = String(value).trim();
        const descriptionText = String(relationValue).trim();
        if (descriptionText && descriptionText !== idText) {
          return `${idText} — ${descriptionText}`;
        }
      }
    }

    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-';
    const text = String(value).trim();
    if (!text) return '-';
    const parsedDate = Date.parse(text);
    if (Number.isFinite(parsedDate) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
      return new Date(parsedDate).toLocaleDateString();
    }
    return text;
  };

  // Filter and sort customers when data or filters change
  useEffect(() => {
    let filtered = [...customers];

    const rowMatchesSearch = (customer: Customer, search: string): boolean => {
      const record = customer as unknown as Record<string, unknown>;

      for (const [key, rawValue] of Object.entries(record)) {
        if (rawValue === null || rawValue === undefined) continue;
        if (Array.isArray(rawValue)) continue;
        if (typeof rawValue === 'object') continue;

        const valueText = String(rawValue).toLowerCase();
        if (valueText.includes(search)) return true;

        const relationBase = key.endsWith('Id')
          ? key.slice(0, -2)
          : key.toLowerCase().endsWith('_id')
            ? key.slice(0, -3)
            : null;

        if (relationBase) {
          const relationKeys = [
            `${relationBase}Name`,
            `${relationBase}Title`,
            `${relationBase}Description`,
            `${relationBase}DisplayName`,
            `${relationBase}Label`,
            `${relationBase}Code`,
            `${relationBase}Number`,
            `${relationBase}_name`,
            `${relationBase}_title`,
            `${relationBase}_description`,
          ];

          const relationMatch = relationKeys.some((relationKey) => {
            const relationValue = record[relationKey];
            return relationValue !== null && relationValue !== undefined && String(relationValue).toLowerCase().includes(search);
          });

          if (relationMatch) return true;
        }
      }

      return false;
    };
    
    // Apply search filter
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      filtered = filtered.filter((customer) => rowMatchesSearch(customer, search));
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
        result = internalTicketsEnabled ? (Number(a.OpenTickets) || 0) - (Number(b.OpenTickets) || 0) : 0;
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

      // Load projects for customer/project/task summary data
      try {
        const projectsResponse = await projectsApi.getAll(token!);
        const projects = projectsResponse.projects || [];

        const statsByCustomer: Record<number, CustomerProjectStats> = {};

        projects.forEach((project: Project) => {
          if (!project.CustomerId) return;

          if (!statsByCustomer[project.CustomerId]) {
            statsByCustomer[project.CustomerId] = {
              projectCount: 0,
              totalTasks: 0,
              completedTasks: 0,
            };
          }

          statsByCustomer[project.CustomerId].projectCount += 1;
          statsByCustomer[project.CustomerId].totalTasks += Number(project.TotalTasks) || 0;
          statsByCustomer[project.CustomerId].completedTasks += Number(project.CompletedTasks) || 0;
        });

        setCustomerProjectStats(statsByCustomer);
      } catch {
        setCustomerProjectStats({});
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const getCustomerStats = (customerId: number): CustomerProjectStats => {
    return customerProjectStats[customerId] || { projectCount: 0, totalTasks: 0, completedTasks: 0 };
  };

  const openCreateModal = () => {
    setEditingCustomer(null);
    setFormData({
      Name: '',
      ExternalName: '',
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
      ExternalName: customer.ExternalName || '',
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
          ExternalName: formData.ExternalName || undefined,
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
          ExternalName: formData.ExternalName || undefined,
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

  const handleExportCustomersCsv = () => {
    const headers = [
      'Name',
      'ExternalName',
      'Email',
      'Phone',
      'Address',
      'Notes',
      'OrganizationNames',
      'DefaultSupportUsername',
      'CreateDefaultProject',
      'DefaultProjectName'
    ];

    const rows = filteredCustomers.map((customer) => ({
      Name: customer.Name || '',
      ExternalName: customer.ExternalName || '',
      Email: customer.Email || '',
      Phone: customer.Phone || '',
      Address: customer.Address || '',
      Notes: customer.Notes || '',
      OrganizationNames: (customer.Organizations || [])
        .map((organization) => organization.OrganizationName || '')
        .filter(Boolean)
        .join('|'),
      DefaultSupportUsername: '',
      CreateDefaultProject: 'true',
      DefaultProjectName: ''
    }));

    downloadCsv('customers_export.csv', toCsv(rows, headers));
  };

  const handleCustomersCsvImport = async (file: File) => {
    if (!token) return;

    setIsImportingCsv(true);
    setError('');

    try {
      const text = await file.text();
      const rows = parseCsv(text);

      if (!rows.length) {
        throw new Error('CSV is empty or has no data rows');
      }

      let successCount = 0;
      const failures: string[] = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const rowNumber = index + 2;

        try {
          const name = (row.Name || '').trim();
          if (!name) {
            throw new Error('Name is required');
          }

          const organizationNames = (row.OrganizationNames || '')
            .split('|')
            .map((value) => value.trim())
            .filter(Boolean);

          if (!organizationNames.length) {
            throw new Error('OrganizationNames is required (use | for multiple values)');
          }

          const organizationIds = organizationNames.map((organizationName) => {
            const match = organizations.find((organization) => organization.Name.toLowerCase() === organizationName.toLowerCase());
            if (!match) {
              throw new Error(`Unknown organization: ${organizationName}`);
            }
            return match.Id;
          });

          const supportUsername = (row.DefaultSupportUsername || '').trim();
          const supportUser = supportUsername
            ? supportUsers.find((support) => {
                const fullName = `${support.FirstName || ''} ${support.LastName || ''}`.trim().toLowerCase();
                return support.Username.toLowerCase() === supportUsername.toLowerCase() || fullName === supportUsername.toLowerCase();
              })
            : null;

          if (supportUsername && !supportUser) {
            throw new Error(`Unknown support user: ${supportUsername}`);
          }

          const createData: CreateCustomerData = {
            Name: name,
            ExternalName: (row.ExternalName || '').trim() || undefined,
            Email: (row.Email || '').trim() || undefined,
            Phone: (row.Phone || '').trim() || undefined,
            Address: (row.Address || '').trim() || undefined,
            Notes: (row.Notes || '').trim() || undefined,
            OrganizationIds: organizationIds,
            DefaultSupportUserId: supportUser?.Id,
            CreateDefaultProject: row.CreateDefaultProject
              ? parseBooleanLike(row.CreateDefaultProject)
              : true,
            DefaultProjectName: (row.DefaultProjectName || '').trim() || undefined
          };

          await createCustomer(token, createData);
          successCount += 1;
        } catch (importError: any) {
          failures.push(`Row ${rowNumber}: ${importError.message || 'Failed to import customer'}`);
        }
      }

      await loadData();

      if (failures.length) {
        setError(`Imported ${successCount}/${rows.length} customers. ${failures.slice(0, 5).join(' | ')}${failures.length > 5 ? ' | ...' : ''}`);
      } else {
        setError('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to import customers CSV');
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleCustomersCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await handleCustomersCsvImport(file);
    event.target.value = '';
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <div className="w-full mx-auto px-4 py-8">
          <div className="flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-gray-600 dark:text-gray-400">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (!isLoadingPermissions && !permissions?.canViewCustomers) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h2>
            <p className="text-gray-600 dark:text-gray-400">You don&apos;t have permission to view customers.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <CustomerUserGuard>
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="w-full mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customers</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-gray-600 shadow' : 'hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                title="Grid view"
              >
                <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 shadow' : 'hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                title="List view"
              >
                <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>
            {permissions?.canCreateCustomers && (
              <button
                onClick={() => setShowImportModal(true)}
                disabled={isImportingCsv}
                className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
              >
                {isImportingCsv ? 'Importing...' : 'Import CSV'}
              </button>
            )}
            <button
              onClick={handleExportCustomersCsv}
              className="h-10 px-4 bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
            >
              Export CSV
            </button>
            {permissions?.canCreateCustomers && (
              <button
                onClick={openCreateModal}
                className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Customer
              </button>
            )}
          </div>
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
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCustomers.map((customer) => {
              const stats = getCustomerStats(customer.Id);
              const progress = stats.totalTasks > 0
                ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
                : 0;

              return (
                <div
                  key={customer.Id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => router.push(`/customers/${customer.Id}`)}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{customer.Name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{customer.ExternalName || '—'}</p>
                    </div>
                    {internalTicketsEnabled && (
                      <span className="px-2 py-1 rounded text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                        {customer.OpenTickets || 0} tickets
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Projects</p>
                      <p className="font-medium text-gray-900 dark:text-white">{stats.projectCount}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Task Progress</p>
                      <p className="font-medium text-gray-900 dark:text-white">{progress}%</p>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {stats.completedTasks}/{stats.totalTasks} tasks completed
                    </p>
                  </div>

                  {customer.Organizations && customer.Organizations.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {customer.Organizations.map((org) => (
                        <span
                          key={org.OrganizationId}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                        >
                          {org.OrganizationName}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 text-sm">
                    {permissions?.canManageCustomers && (
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/customers/${customer.Id}`); }}
                        title="Manage customer"
                        aria-label="Manage customer"
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                      >
                        ⚙️
                      </button>
                    )}
                    {permissions?.canManageCustomers && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openEditModal(customer); }}
                        title="Edit customer"
                        aria-label="Edit customer"
                        className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 font-medium"
                      >
                        ✏️
                      </button>
                    )}
                    {permissions?.canDeleteCustomers && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(customer); }}
                        title="Delete customer"
                        aria-label="Delete customer"
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center">Name</div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    External Name
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                    onClick={() => handleSort('email')}
                  >
                    <div className="flex items-center">Email</div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                    onClick={() => handleSort('phone')}
                  >
                    <div className="flex items-center">Phone</div>
                  </th>
                  {internalTicketsEnabled && (
                    <th 
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                      onClick={() => handleSort('tickets')}
                    >
                      <div className="flex items-center justify-center">Open Tickets</div>
                    </th>
                  )}
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Projects
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Task Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Organizations
                  </th>
                  {additionalCustomerColumnKeys.map((columnKey) => (
                    <th
                      key={`extra-customer-header-${columnKey}`}
                      data-column-key={`extra-${columnKey}`}
                      data-default-hidden="true"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      {formatExtraColumnLabel(columnKey)}
                    </th>
                  ))}
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredCustomers.map((customer) => (
                  (() => {
                    const stats = getCustomerStats(customer.Id);
                    const progress = stats.totalTasks > 0
                      ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
                      : 0;

                    return (
                  <tr 
                    key={customer.Id} 
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => router.push(`/customers/${customer.Id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900 dark:text-white">{customer.Name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-500 dark:text-gray-400">{customer.ExternalName || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-500 dark:text-gray-400">{customer.Email || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-500 dark:text-gray-400">{customer.Phone || '-'}</div>
                    </td>
                    {internalTicketsEnabled && (
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="text-gray-900 dark:text-white font-medium">{customer.OpenTickets || 0}</div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-gray-900 dark:text-white font-medium">{stats.projectCount}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="w-28 mx-auto">
                        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stats.completedTasks}/{stats.totalTasks}</div>
                      </div>
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
                    {additionalCustomerColumnKeys.map((columnKey) => (
                      <td key={`extra-customer-cell-${customer.Id}-${columnKey}`} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {renderCustomerExtraColumnValue(customer, columnKey)}
                      </td>
                    ))}
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-1">
                        {permissions?.canManageCustomers && (
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/customers/${customer.Id}`); }}
                          title="Manage customer"
                          aria-label="Manage customer"
                          className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317a1 1 0 011.35-.936l.7.312a1 1 0 00.812 0l.7-.312a1 1 0 011.35.936l.094.765a1 1 0 00.57.795l.676.339a1 1 0 01.445 1.342l-.33.705a1 1 0 000 .848l.33.705a1 1 0 01-.445 1.342l-.676.339a1 1 0 00-.57.795l-.094.765a1 1 0 01-1.35.936l-.7-.312a1 1 0 00-.812 0l-.7.312a1 1 0 01-1.35-.936l-.094-.765a1 1 0 00-.57-.795l-.676-.339a1 1 0 01-.445-1.342l.33-.705a1 1 0 000-.848l-.33-.705a1 1 0 01.445-1.342l.676-.339a1 1 0 00.57-.795l.094-.765z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
                          </svg>
                        </button>
                        )}
                        {permissions?.canManageCustomers && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(customer); }}
                          title="Edit customer"
                          aria-label="Edit customer"
                          className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
                          </svg>
                        </button>
                        )}
                        {permissions?.canDeleteCustomers && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(customer); }}
                          title="Delete customer"
                          aria-label="Delete customer"
                          className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                    );
                  })()
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
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
                      External Name
                    </label>
                    <input
                      type="text"
                      value={formData.ExternalName}
                      onChange={(e) => setFormData({ ...formData, ExternalName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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

                  {internalTicketsEnabled && (
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
                  )}

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

      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-xl w-full mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Import Customers from CSV</h2>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">📄 CSV Format</h3>
                <code className="text-xs bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded block overflow-x-auto">
                  Name,ExternalName,Email,Phone,Address,Notes,OrganizationNames,DefaultSupportUsername,CreateDefaultProject,DefaultProjectName
                </code>
                <p className="text-sm text-blue-800 dark:text-blue-400 mt-2">
                  <a href="/templates/customers_import_template.csv" download className="underline hover:text-blue-600 dark:hover:text-blue-200">Download template CSV</a>
                </p>
              </div>

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCustomersCsvFileChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Close
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
