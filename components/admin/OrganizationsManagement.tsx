'use client';


import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation'
import { oldPath } from '@/lib/oldPath';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useToast } from '@/contexts/ToastContext';
import { organizationsApi, Organization, CreateOrganizationData } from '@/lib/api/organizations';
import CustomFieldsFormSection from '@/components/custom-fields/CustomFieldsFormSection';
import { CustomFieldValues, extractCustomFieldValues } from '@/lib/customFields';
import { downloadCsv, parseCsv, toCsv } from '@/lib/csv';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import { useIsMobile } from '@/hooks/useIsMobile';
import EmptyState from '@/components/EmptyState';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';

type OrgSortField = 'name' | 'role' | 'members' | 'projects' | 'tickets' | 'tasks';
type SortDirection = 'asc' | 'desc';
type OrgProjectFilter = 'all' | 'with-projects' | 'without-projects';
type OrgTicketFilter = 'all' | 'with-open' | 'without-open';

export default function OrganizationsManagement() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'list';
    const stored = window.localStorage.getItem('organizations:viewMode');
    return stored === 'grid' || stored === 'list' ? stored : 'list';
  });
  const isMobile = useIsMobile();
  const effectiveViewMode: 'grid' | 'list' = isMobile ? 'grid' : viewMode;
  const [filterText, setFilterText] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<OrgProjectFilter>('all');
  const [ticketFilter, setTicketFilter] = useState<OrgTicketFilter>('all');
  const [sortField, setSortField] = useState<OrgSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  const [modalMessage, setModalMessage] = useState<{
    type: 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const { showToast } = useToast();

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalMessage({ type: 'confirm', title, message, onConfirm });
  };

  const closeConfirmModal = () => {
    setModalMessage(null);
  };

  const handleModalConfirm = () => {
    if (modalMessage?.onConfirm) {
      modalMessage.onConfirm();
    }
    closeConfirmModal();
  };

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
    if (!authLoading && !user) {
      router.push(oldPath('/login'));
      return;
    }
    if (user && token && featureFlagsLoaded) {
      loadOrganizations();
    }
  }, [user, token, authLoading, router, featureFlagsLoaded]);

  useEffect(() => {
    if (!internalTicketsEnabled && sortField === 'tickets') {
      setSortField('name');
      setSortDirection('asc');
    }
  }, [internalTicketsEnabled, sortField]);

  useEffect(() => {
    window.localStorage.setItem('organizations:viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (modalMessage) {
        closeConfirmModal();
        return;
      }

      if (showImportModal) {
        setShowImportModal(false);
        return;
      }

      if (editingOrganization) {
        setEditingOrganization(null);
        return;
      }

      if (showCreateModal) {
        setShowCreateModal(false);
      }
    };

    window.addEventListener('keydown', handleEscClose);
    return () => window.removeEventListener('keydown', handleEscClose);
  }, [editingOrganization, modalMessage, showCreateModal, showImportModal]);

  const loadOrganizations = async () => {
    if (!token) return;
    
    try {
      setIsLoading(true);
      const response = await organizationsApi.getAll(token);
      setOrganizations(response.organizations);
      setError('');
    } catch (err: any) {
      const message = err.message || 'Failed to load organizations';
      setError(message);
      showToast({ type: 'error', message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    
    showConfirm(
      'Delete Organization',
      'Are you sure you want to delete this organization? This action cannot be undone.',
      async () => {
        try {
          await organizationsApi.delete(id, token);
          await loadOrganizations();
          showToast({ type: 'success', message: 'Organization deleted successfully' });
        } catch (err: any) {
          const message = err.message || 'Failed to delete organization';
          setError(message);
          showToast({ type: 'error', message });
        }
      }
    );
  };

  const handleEdit = (org: Organization) => {
    setEditingOrganization(org);
  };

  const handleExportOrganizationsCsv = () => {
    const headers = ['Name', 'Abbreviation', 'Description'];
    const rows = filteredAndSortedOrgs.map((organization) => ({
      Name: organization.Name || '',
      Abbreviation: organization.Abbreviation || '',
      Description: organization.Description || ''
    }));

    downloadCsv('organizations_export.csv', toCsv(rows, headers));
  };

  const handleOrganizationsCsvImport = async (file: File) => {
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

          const createData: CreateOrganizationData = {
            name,
            abbreviation: (row.Abbreviation || '').trim() || undefined,
            description: (row.Description || '').trim() || undefined
          };

          await organizationsApi.create(createData, token);
          successCount += 1;
        } catch (importError: any) {
          failures.push(`Row ${rowNumber}: ${importError.message || 'Failed to import organization'}`);
        }
      }

      await loadOrganizations();

      if (failures.length) {
        const message = `Imported ${successCount}/${rows.length} organizations. ${failures.slice(0, 5).join(' | ')}${failures.length > 5 ? ' | ...' : ''}`;
        setError(message);
        showToast({ type: 'error', message });
      } else {
        setError('');
        showToast({ type: 'success', message: `Imported ${successCount} organizations successfully` });
      }
    } catch (err: any) {
      const message = err.message || 'Failed to import organizations CSV';
      setError(message);
      showToast({ type: 'error', message });
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleOrganizationsCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await handleOrganizationsCsvImport(file);
    event.target.value = '';
  };

  // Filter and sort organizations
  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    organizations.forEach((organization) => {
      if (organization.Role) {
        roles.add(organization.Role);
      }
    });
    return Array.from(roles).sort((a, b) => a.localeCompare(b));
  }, [organizations]);

  const hasActiveFilters =
    !!filterText.trim() || roleFilter !== 'all' || projectFilter !== 'all' || (internalTicketsEnabled && ticketFilter !== 'all');

  const filteredAndSortedOrgs = useMemo(() => {
    let result = [...organizations];

    const rowMatchesSearch = (org: Organization, search: string): boolean => {
      const record = org as unknown as Record<string, unknown>;

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
    
    // Apply filter
    if (filterText.trim()) {
      const search = filterText.toLowerCase();
      result = result.filter((org) => rowMatchesSearch(org, search));
    }

    if (roleFilter !== 'all') {
      result = result.filter((org) => String(org.Role || '').toLowerCase() === roleFilter.toLowerCase());
    }

    if (projectFilter === 'with-projects') {
      result = result.filter((org) => (Number(org.ProjectCount) || 0) > 0);
    } else if (projectFilter === 'without-projects') {
      result = result.filter((org) => (Number(org.ProjectCount) || 0) === 0);
    }

    if (internalTicketsEnabled) {
      if (ticketFilter === 'with-open') {
        result = result.filter((org) => (Number(org.OpenTickets) || 0) > 0);
      } else if (ticketFilter === 'without-open') {
        result = result.filter((org) => (Number(org.OpenTickets) || 0) === 0);
      }
    }
    
    // Apply sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.Name.localeCompare(b.Name);
          break;
        case 'role':
          const roleOrder: Record<string, number> = { 'Owner': 1, 'Admin': 2, 'Manager': 3, 'Member': 4 };
          comparison = (roleOrder[a.Role] || 5) - (roleOrder[b.Role] || 5);
          break;
        case 'members':
          comparison = (Number(a.MemberCount) || 0) - (Number(b.MemberCount) || 0);
          break;
        case 'projects':
          comparison = (Number(a.ProjectCount) || 0) - (Number(b.ProjectCount) || 0);
          break;
        case 'tickets':
          comparison = internalTicketsEnabled
            ? (Number(a.OpenTickets) || 0) - (Number(b.OpenTickets) || 0)
            : 0;
          break;
        case 'tasks':
          comparison = (Number(a.TotalTasks) || 0) - (Number(b.TotalTasks) || 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [organizations, filterText, roleFilter, projectFilter, ticketFilter, sortField, sortDirection, internalTicketsEnabled]);

  const organizationIndicators = useMemo(() => {
    const inView = filteredAndSortedOrgs.length;
    const withProjects = filteredAndSortedOrgs.filter((org) => (Number(org.ProjectCount) || 0) > 0).length;
    const totalMembers = filteredAndSortedOrgs.reduce((sum, org) => sum + (Number(org.MemberCount) || 0), 0);
    const openTickets = filteredAndSortedOrgs.reduce((sum, org) => sum + (Number(org.OpenTickets) || 0), 0);

    return {
      total: organizations.length,
      inView,
      withProjects,
      totalMembers,
      openTickets,
    };
  }, [organizations.length, filteredAndSortedOrgs]);

  const additionalOrganizationColumnKeys = useMemo(() => {
    const excludedKeys = new Set<string>([
      'Id',
      'Name',
      'Description',
      'Role',
      'MemberCount',
      'ProjectCount',
      'OpenTickets',
      'TotalTasks',
      'CompletedTasks',
      'CreatedAt',
      'UpdatedAt',
    ]);

    const keys = new Set<string>();
    for (const org of organizations) {
      const record = org as unknown as Record<string, unknown>;
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
  }, [organizations]);

  const formatExtraColumnLabel = (rawKey: string) =>
    rawKey
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (value) => value.toUpperCase());

  const renderOrganizationExtraColumnValue = (org: Organization, rawKey: string): string => {
    const record = org as unknown as Record<string, unknown>;
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

  const handleSort = (field: OrgSortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getAriaSort = (field: OrgSortField): 'none' | 'ascending' | 'descending' => {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  const orgFilterActiveCount = [
    filterText.trim() ? 1 : 0,
    roleFilter !== 'all' ? 1 : 0,
    projectFilter !== 'all' ? 1 : 0,
    internalTicketsEnabled && ticketFilter !== 'all' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const organizationFiltersPanel = (
    <CollapsibleFilterPanel
      className="mb-2"
      title="Organization filters"
      activeCount={orgFilterActiveCount}
      bodyClassName="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Search</label>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Filter organizations..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Role</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All roles</option>
            {availableRoles.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Projects</label>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value as OrgProjectFilter)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="with-projects">With projects</option>
            <option value="without-projects">Without projects</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Open Tickets</label>
          <select
            value={ticketFilter}
            onChange={(e) => setTicketFilter(e.target.value as OrgTicketFilter)}
            disabled={!internalTicketsEnabled}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="with-open">With open tickets</option>
            <option value="without-open">Without open tickets</option>
          </select>
        </div>
      </div>
      {hasActiveFilters && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {filteredAndSortedOrgs.length} of {organizations.length} organizations
          </p>
          <button
            onClick={() => {
              setFilterText('');
              setRoleFilter('all');
              setProjectFilter('all');
              setTicketFilter('all');
            }}
            className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Clear filters
          </button>
        </div>
      )}
    </CollapsibleFilterPanel>
  );

  if (authLoading || isLoading) {
    return (
      <div className="w-full">
        <div className="w-full mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="space-y-5 animate-pulse">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-24" />
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-14" />
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="w-full p-4 sm:p-6 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <h2 className="text-lg font-semibold leading-tight text-gray-900 dark:text-white">Organizations</h2>
            {organizations.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{organizationIndicators.total}</span> total
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">{organizationIndicators.inView}</span> in view
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-green-600 dark:text-green-400">{organizationIndicators.withProjects}</span> with projects
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {internalTicketsEnabled ? organizationIndicators.openTickets : organizationIndicators.totalMembers}
                  </span>{' '}
                  {internalTicketsEnabled ? 'open tickets' : 'members'}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden sm:flex items-center rounded-md border border-gray-300 bg-gray-100 p-0.5 dark:border-gray-600 dark:bg-gray-700">
              <button
                onClick={() => setViewMode('grid')}
                className={`rounded p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-white shadow dark:bg-gray-600' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                title="Grid view"
              >
                <svg className="h-4 w-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`rounded p-1.5 transition-colors ${viewMode === 'list' ? 'bg-white shadow dark:bg-gray-600' : 'hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                title="List view"
              >
                <svg className="h-4 w-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>
            {(user?.isAdmin || permissions?.canManageOrganizations) && (
              <button
                onClick={() => setShowImportModal(true)}
                disabled={isImportingCsv}
                className="h-10 px-3 sm:px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
              >
                {isImportingCsv ? 'Importing...' : 'Import CSV'}
              </button>
            )}
            <button
              onClick={handleExportOrganizationsCsv}
              className="h-10 px-3 sm:px-4 bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
            >
              Export CSV
            </button>
            {(user?.isAdmin || permissions?.canManageOrganizations) && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="h-10 px-3 sm:px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center gap-2"
              >
                <span className="text-base leading-none">+</span>
                New Organization
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>{error}</span>
            <button
              onClick={loadOrganizations}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {organizations.length === 0 ? (
          <EmptyState
            icon="🏢"
            title="No organizations yet"
            message="Create your first organization to get started"
            primaryAction={
              (user?.isAdmin || permissions?.canManageOrganizations)
                ? {
                    label: 'Create Organization',
                    onClick: () => setShowCreateModal(true),
                  }
                : undefined
            }
          />
        ) : filteredAndSortedOrgs.length === 0 ? (
          <EmptyState
            icon="🔎"
            title="No organizations match the current filter"
            message="Try a different search term or clear the filter input."
            primaryAction={{
              label: 'Clear filters',
              onClick: () => {
                setFilterText('');
                setRoleFilter('all');
                setProjectFilter('all');
                setTicketFilter('all');
              }
            }}
            secondaryAction={{ label: 'Reload', onClick: loadOrganizations }}
          />
        ) : effectiveViewMode === 'grid' ? (
          <>
            {organizationFiltersPanel}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAndSortedOrgs.map((org) => (
                <OrganizationCard
                  key={org.Id}
                  organization={org}
                  onDelete={handleDelete}
                  onView={(id) => router.push(`/organizations/${id}`)}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            {organizationFiltersPanel}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                  <tr>
                    <th 
                      aria-sort={getAriaSort('name')}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center">Organization</div>
                    </th>
                    <th 
                      aria-sort={getAriaSort('role')}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                      onClick={() => handleSort('role')}
                    >
                      <div className="flex items-center justify-center">Role</div>
                    </th>
                    <th 
                      aria-sort={getAriaSort('members')}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                      onClick={() => handleSort('members')}
                    >
                      <div className="flex items-center justify-center">Members</div>
                    </th>
                    <th 
                      aria-sort={getAriaSort('projects')}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                      onClick={() => handleSort('projects')}
                    >
                      <div className="flex items-center justify-center">Projects</div>
                    </th>
                    {internalTicketsEnabled && (
                      <th 
                        aria-sort={getAriaSort('tickets')}
                        className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                        onClick={() => handleSort('tickets')}
                      >
                        <div className="flex items-center justify-center">Open Tickets</div>
                      </th>
                    )}
                    <th 
                      aria-sort={getAriaSort('tasks')}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                      onClick={() => handleSort('tasks')}
                    >
                      <div className="flex items-center justify-center">Tasks</div>
                    </th>
                    {additionalOrganizationColumnKeys.map((columnKey) => (
                      <th
                        key={`extra-org-header-${columnKey}`}
                        data-column-key={`extra-${columnKey}`}
                        data-default-hidden="true"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                      >
                        {formatExtraColumnLabel(columnKey)}
                      </th>
                    ))}
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredAndSortedOrgs.map((org) => {
                  const memberCount = Number(org.MemberCount) || 0;
                  const projectCount = Number(org.ProjectCount) || 0;
                  const totalTasks = Number(org.TotalTasks) || 0;
                  const completedTasks = Number(org.CompletedTasks) || 0;
                  const taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                  const canEditOrganization =
                    !!user?.isAdmin ||
                    !!permissions?.canManageOrganizations ||
                    org.Role === 'Owner' ||
                    org.Role === 'Admin' ||
                    Number(org.CanManageSettings || 0) === 1;
                  const canDeleteOrganization = org.Role === 'Owner';
                  
                  const getRoleBadgeColor = (role: string) => {
                    switch (role) {
                      case 'Owner': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
                      case 'Admin': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                      case 'Manager': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
                      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
                    }
                  };
                  
                  return (
                    <tr 
                      key={org.Id} 
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      onClick={() => router.push(`/organizations/${org.Id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 dark:text-white">{org.Name}</div>
                        {org.Description && (() => {
                          const plainText = org.Description.replace(/<[^>]*>/g, '').trim();
                          return plainText ? (
                            <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-md">{plainText}</div>
                          ) : null;
                        })()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getRoleBadgeColor(org.Role)}`}>
                          {org.Role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-gray-900 dark:text-white">{memberCount}</td>
                      <td className="px-6 py-4 text-center text-sm text-gray-900 dark:text-white">{projectCount}</td>
                      {internalTicketsEnabled && (
                        <td className="px-6 py-4 text-center text-sm text-gray-900 dark:text-white">{Number(org.OpenTickets) || 0}</td>
                      )}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-sm text-gray-900 dark:text-white">{completedTasks}/{totalTasks}</span>
                          {totalTasks > 0 && (
                            <div className="w-16 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                              <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${taskProgress}%` }} />
                            </div>
                          )}
                        </div>
                      </td>
                      {additionalOrganizationColumnKeys.map((columnKey) => (
                        <td key={`extra-org-cell-${org.Id}-${columnKey}`} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {renderOrganizationExtraColumnValue(org, columnKey)}
                        </td>
                      ))}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/organizations/${org.Id}`); }}
                            title="Manage organization"
                            aria-label="Manage organization"
                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317a1 1 0 011.35-.936l.7.312a1 1 0 00.812 0l.7-.312a1 1 0 011.35.936l.094.765a1 1 0 00.57.795l.676.339a1 1 0 01.445 1.342l-.33.705a1 1 0 000 .848l.33.705a1 1 0 01-.445 1.342l-.676.339a1 1 0 00-.57.795l-.094.765a1 1 0 01-1.35.936l-.7-.312a1 1 0 00-.812 0l-.7.312a1 1 0 01-1.35-.936l-.094-.765a1 1 0 00-.57-.795l-.676-.339a1 1 0 01-.445-1.342l.33-.705a1 1 0 000-.848l-.33-.705a1 1 0 01.445-1.342l.676-.339a1 1 0 00.57-.795l.094-.765z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
                            </svg>
                          </button>
                          {canEditOrganization && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEdit(org); }}
                              title="Edit organization"
                              aria-label="Edit organization"
                              className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z" />
                              </svg>
                            </button>
                          )}
                          {canDeleteOrganization && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(org.Id); }}
                              title="Delete organization"
                              aria-label="Delete organization"
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
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

      {showCreateModal && (
        <CreateOrganizationModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadOrganizations();
            showToast({ type: 'success', message: 'Organization created successfully' });
          }}
          token={token!}
        />
      )}

      {editingOrganization && (
        <EditOrganizationModal
          organization={editingOrganization}
          onClose={() => setEditingOrganization(null)}
          onUpdated={() => {
            setEditingOrganization(null);
            loadOrganizations();
            showToast({ type: 'success', message: 'Organization updated successfully' });
          }}
          token={token!}
        />
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-xl w-full mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Import Organizations from CSV</h2>
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
                  Name,Abbreviation,Description
                </code>
                <p className="text-sm text-blue-800 dark:text-blue-400 mt-2">
                  <a href={oldPath("/templates/organizations_import_template.csv")} download className="underline hover:text-blue-600 dark:hover:text-blue-200">Download template CSV</a>
                </p>
              </div>

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleOrganizationsCsvFileChange}
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

      <ConfirmAlertModal
        isOpen={!!modalMessage}
        type="confirm"
        title={modalMessage?.title || ''}
        message={modalMessage?.message || ''}
        onClose={closeConfirmModal}
        onConfirm={handleModalConfirm}
        confirmLabel="Delete"
        confirmVariant="danger"
      />

      <ScrollToTopButton />
    </div>
  );
}

function OrganizationCard({ 
  organization, 
  onDelete, 
  onView 
}: { 
  organization: Organization; 
  onDelete: (id: number) => void;
  onView: (id: number) => void;
}) {
  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Owner': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case 'Admin': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'Manager': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getRoleBarColor = (role: string) => {
    switch (role) {
      case 'Owner': return 'bg-purple-500';
      case 'Admin': return 'bg-blue-500';
      case 'Manager': return 'bg-green-500';
      default: return 'bg-gray-400';
    }
  };

  const memberCount = Number(organization.MemberCount) || 0;
  const projectCount = Number(organization.ProjectCount) || 0;
  const totalTasks = Number(organization.TotalTasks) || 0;
  const completedTasks = Number(organization.CompletedTasks) || 0;
  const activeProjects = Number(organization.ActiveProjects) || 0;
  const taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div 
      className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer group"
      onClick={() => onView(organization.Id)}
    >
      {/* Role color bar */}
      <div className={`h-1 ${getRoleBarColor(organization.Role)}`} />
      
      <div className="p-5">
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 min-w-0 pr-3">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {organization.Name}
            </h3>
            {organization.CreatorName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Created by {organization.CreatorName}
              </p>
            )}
          </div>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getRoleBadgeColor(organization.Role)}`}>
            {organization.Role}
          </span>
        </div>
        
        {/* Description */}
        {organization.Description && (() => {
          const plainText = organization.Description.replace(/<[^>]*>/g, '').trim();
          return plainText ? (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
              {plainText}
            </p>
          ) : null;
        })()}

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center mb-1">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">{memberCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Members</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center mb-1">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">{projectCount}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Projects</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center mb-1">
              <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">{activeProjects}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Active</div>
          </div>
        </div>

        {/* Task Progress */}
        {totalTasks > 0 && (
          <div className="mb-4">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-gray-600 dark:text-gray-400">Tasks Completed</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {completedTasks}/{totalTasks} ({taskProgress}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div 
                className="bg-green-500 h-1.5 rounded-full transition-all duration-300" 
                style={{ width: `${taskProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView(organization.Id);
            }}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Manage
          </button>
          {organization.Role === 'Owner' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(organization.Id);
              }}
              className="flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 px-3 py-2 rounded-lg transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EditOrganizationModal({
  organization,
  onClose,
  onUpdated,
  token,
}: {
  organization: Organization;
  onClose: () => void;
  onUpdated: () => void;
  token: string;
}) {
  const [formData, setFormData] = useState({
    name: organization.Name,
    abbreviation: organization.Abbreviation || '',
    description: organization.Description || '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [customFields, setCustomFields] = useState<CustomFieldValues>(() => extractCustomFieldValues(organization));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await organizationsApi.update(organization.Id, { ...formData, customFields }, token);
      onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to update organization');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Organization</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Organization Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter organization name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Abbreviation
              </label>
              <input
                type="text"
                value={formData.abbreviation}
                onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                maxLength={10}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="e.g., ACME"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter organization description"
              />
            </div>

            <CustomFieldsFormSection
              tableName="Organizations"
              token={token}
              values={customFields}
              onChange={setCustomFields}
            />

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function CreateOrganizationModal({
  onClose,
  onCreated,
  token,
}: {
  onClose: () => void;
  onCreated: () => void;
  token: string;
}) {
  const [formData, setFormData] = useState<CreateOrganizationData>({
    name: '',
    abbreviation: '',
    description: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [customFields, setCustomFields] = useState<CustomFieldValues>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await organizationsApi.create({ ...formData, customFields }, token);
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create Organization</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Organization Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter organization name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Abbreviation
              </label>
              <input
                type="text"
                value={formData.abbreviation}
                onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                maxLength={10}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="e.g., ACME"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter organization description"
              />
            </div>

            <CustomFieldsFormSection
              tableName="Organizations"
              token={token}
              values={customFields}
              onChange={setCustomFields}
            />

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                {isLoading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
