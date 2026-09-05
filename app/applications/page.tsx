/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
'use client';

import { getApiUrl } from '@/lib/api/config';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useToast } from '@/contexts/ToastContext';
import { useRouter } from 'next/navigation'
import { oldPath } from '@/lib/oldPath';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import EmptyState from '@/components/EmptyState';
import { downloadCsv, parseBooleanLike, parseCsv, toCsv } from '@/lib/csv';
import { useIsMobile } from '@/hooks/useIsMobile';

interface Application {
  Id: number;
  Name: string;
  Description: string | null;
  RepositoryUrl: string | null;
  ImagePath?: string | null;
  IsCustomerSpecific: number | boolean;
  OrganizationId: number;
  OrganizationName: string;
  ProjectCount: number;
  CustomerCount: number;
  VersionCount: number;
  Customers: { Id: number; Name: string }[];
  CreatedAt: string;
  GitHubIntegrationId?: number | null;
  GiteaIntegrationId?: number | null;
  BitbucketIntegrationId?: number | null;
}

interface VcsIntegrationOption {
  Id: number;
  Name: string;
  IsEnabled: number;
}

type VcsProviderKind = 'github' | 'gitea' | 'bitbucket';

function detectAppVcsProvider(repoUrl: string): VcsProviderKind | null {
  if (!repoUrl.trim()) return null;
  const lower = repoUrl.toLowerCase();
  if (lower.includes('github.com') || lower.includes('github.')) return 'github';
  if (lower.includes('bitbucket.org') || lower.includes('bitbucket.')) return 'bitbucket';
  if (lower.includes('gitea.') || lower.includes('/gitea')) return 'gitea';
  return null;
}

function emptyVcsFks() {
  return { GitHubIntegrationId: 0, GiteaIntegrationId: 0, BitbucketIntegrationId: 0 };
}

interface Organization {
  Id: number;
  Name: string;
}

interface Customer {
  Id: number;
  Name: string;
}

type ApplicationSortField = 'name' | 'organization' | 'projects' | 'versions' | 'customers';
type SortDirection = 'asc' | 'desc';

export default function ApplicationsPage() {
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const router = useRouter();

  const [applications, setApplications] = useState<Application[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // View and filters
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    if (typeof window === 'undefined') return 'list';
    const stored = window.localStorage.getItem('applications:viewMode');
    return stored === 'grid' || stored === 'list' ? stored : 'list';
  });
  const effectiveViewMode: 'list' | 'grid' = isMobile ? 'grid' : viewMode;
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [filterVersions, setFilterVersions] = useState<'all' | 'with' | 'without'>('all');
  const [sortField, setSortField] = useState<ApplicationSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    Name: '',
    Description: '',
    RepositoryUrl: '',
    IsCustomerSpecific: false,
    OrganizationId: 0,
    CustomerIds: [] as number[],
    GitHubIntegrationId: 0,
    GiteaIntegrationId: 0,
    BitbucketIntegrationId: 0,
  });
  const [githubIntegrations, setGithubIntegrations] = useState<VcsIntegrationOption[]>([]);
  const [giteaIntegrations, setGiteaIntegrations] = useState<VcsIntegrationOption[]>([]);
  const [bitbucketIntegrations, setBitbucketIntegrations] = useState<VcsIntegrationOption[]>([]);

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const { showToast } = useToast();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push(oldPath('/login'));
  }, [user, authLoading, router]);

  useEffect(() => {
    if (token) loadData();
  }, [token]);

  useEffect(() => {
    if (!token || !showModal || !formData.OrganizationId) {
      setGithubIntegrations([]);
      setGiteaIntegrations([]);
      setBitbucketIntegrations([]);
      return;
    }

    let cancelled = false;
    const orgId = formData.OrganizationId;
    const headers = { Authorization: `Bearer ${token}` };

    (async () => {
      try {
        const [ghRes, gtRes, bbRes] = await Promise.all([
          fetch(`${getApiUrl()}/api/github-integrations/organization/${orgId}`, { headers }),
          fetch(`${getApiUrl()}/api/gitea-integrations/organization/${orgId}`, { headers }),
          fetch(`${getApiUrl()}/api/bitbucket-integrations/organization/${orgId}`, { headers }),
        ]);
        const [ghData, gtData, bbData] = await Promise.all([ghRes.json(), gtRes.json(), bbRes.json()]);
        if (cancelled) return;
        setGithubIntegrations(
          ((ghData.integrations || []) as VcsIntegrationOption[]).filter((i) => Number(i.IsEnabled) === 1)
        );
        setGiteaIntegrations(
          ((gtData.integrations || []) as VcsIntegrationOption[]).filter((i) => Number(i.IsEnabled) === 1)
        );
        setBitbucketIntegrations(
          ((bbData.integrations || []) as VcsIntegrationOption[]).filter((i) => Number(i.IsEnabled) === 1)
        );
      } catch {
        if (!cancelled) {
          setGithubIntegrations([]);
          setGiteaIntegrations([]);
          setBitbucketIntegrations([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, showModal, formData.OrganizationId]);

  useEffect(() => {
    window.localStorage.setItem('applications:viewMode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (confirmModal) {
        setConfirmModal(null);
        return;
      }

      if (showImportModal) {
        setShowImportModal(false);
        return;
      }

      if (showModal) {
        closeModal();
      }
    };

    window.addEventListener('keydown', handleEscClose);
    return () => window.removeEventListener('keydown', handleEscClose);
  }, [confirmModal, showImportModal, showModal]);

  // Get unique organizations
  const orgNames = Array.from(new Set(applications.map(a => a.OrganizationName).filter(Boolean))).sort();

  // Filtered and sorted applications
  const filteredAndSortedApplications = (() => {
    let result = [...applications];

    const rowMatchesSearch = (app: Application, search: string): boolean => {
      const record = app as unknown as Record<string, unknown>;

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

    // Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((app) => rowMatchesSearch(app, q));
    }

    // Organization filter
    if (filterOrg) {
      result = result.filter(app => app.OrganizationName === filterOrg);
    }

    // Versions filter
    if (filterVersions === 'with') {
      result = result.filter(app => app.VersionCount > 0);
    } else if (filterVersions === 'without') {
      result = result.filter(app => app.VersionCount === 0);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.Name.localeCompare(b.Name);
          break;
        case 'organization':
          comparison = (a.OrganizationName || '').localeCompare(b.OrganizationName || '');
          break;
        case 'projects':
          comparison = a.ProjectCount - b.ProjectCount;
          break;
        case 'versions':
          comparison = a.VersionCount - b.VersionCount;
          break;
        case 'customers':
          comparison = a.CustomerCount - b.CustomerCount;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  })();

  const additionalApplicationColumnKeys = useMemo(() => {
    const excludedKeys = new Set<string>([
      'Id',
      'Name',
      'Description',
      'RepositoryUrl',
      'OrganizationName',
      'ProjectCount',
      'VersionCount',
      'CustomerCount',
      'Customers',
      'CreatedAt',
    ]);

    const keys = new Set<string>();
    for (const app of applications) {
      const record = app as unknown as Record<string, unknown>;
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
  }, [applications]);

  const formatExtraColumnLabel = (rawKey: string) =>
    rawKey
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (value) => value.toUpperCase());

  const renderApplicationExtraColumnValue = (app: Application, rawKey: string): string => {
    const record = app as unknown as Record<string, unknown>;
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

  const handleSort = (field: ApplicationSortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getAriaSort = (field: ApplicationSortField): 'none' | 'ascending' | 'descending' => {
    if (sortField !== field) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

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
      const message = err.message || 'Failed to load data';
      setError(message);
      showToast({ type: 'error', message });
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
      IsCustomerSpecific: false,
      OrganizationId: organizations.length === 1 ? organizations[0].Id : 0,
      CustomerIds: [],
      GitHubIntegrationId: 0,
      GiteaIntegrationId: 0,
      BitbucketIntegrationId: 0,
    });
    setImageFile(null);
    setImagePreview(null);
    setRemoveExistingImage(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
    setShowModal(true);
  };

  const openEditModal = (app: Application) => {
    setEditingApp(app);
    const exclusive = (() => {
      if (app.GitHubIntegrationId) {
        return { GitHubIntegrationId: app.GitHubIntegrationId, GiteaIntegrationId: 0, BitbucketIntegrationId: 0 };
      }
      if (app.GiteaIntegrationId) {
        return { GitHubIntegrationId: 0, GiteaIntegrationId: app.GiteaIntegrationId, BitbucketIntegrationId: 0 };
      }
      if (app.BitbucketIntegrationId) {
        return { GitHubIntegrationId: 0, GiteaIntegrationId: 0, BitbucketIntegrationId: app.BitbucketIntegrationId };
      }
      return emptyVcsFks();
    })();
    setFormData({
      Name: app.Name,
      Description: app.Description || '',
      RepositoryUrl: app.RepositoryUrl || '',
      IsCustomerSpecific: !!app.IsCustomerSpecific,
      OrganizationId: app.OrganizationId,
      CustomerIds: app.Customers?.map((c) => c.Id) || [],
      ...exclusive,
    });
    setImageFile(null);
    setImagePreview(app.ImagePath || null);
    setRemoveExistingImage(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingApp(null);
    setError('');
    setImageFile(null);
    setImagePreview(null);
    setRemoveExistingImage(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });

  const uploadApplicationImage = async (applicationId: number, file: File) => {
    const fileData = await readFileAsDataUrl(file);
    const res = await fetch(`${getApiUrl()}/api/applications/${applicationId}/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileData,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to upload application image');
    }
  };

  const deleteApplicationImage = async (applicationId: number) => {
    const res = await fetch(`${getApiUrl()}/api/applications/${applicationId}/image`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to remove application image');
    }
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

      const vcsFields = (() => {
        if (formData.GitHubIntegrationId) {
          return {
            GitHubIntegrationId: formData.GitHubIntegrationId,
            GiteaIntegrationId: null,
            BitbucketIntegrationId: null,
          };
        }
        if (formData.GiteaIntegrationId) {
          return {
            GitHubIntegrationId: null,
            GiteaIntegrationId: formData.GiteaIntegrationId,
            BitbucketIntegrationId: null,
          };
        }
        if (formData.BitbucketIntegrationId) {
          return {
            GitHubIntegrationId: null,
            GiteaIntegrationId: null,
            BitbucketIntegrationId: formData.BitbucketIntegrationId,
          };
        }
        return {
          GitHubIntegrationId: null,
          GiteaIntegrationId: null,
          BitbucketIntegrationId: null,
        };
      })();

      const body = editingApp
        ? {
            Name: formData.Name,
            Description: formData.Description,
            RepositoryUrl: formData.RepositoryUrl,
            IsCustomerSpecific: formData.IsCustomerSpecific,
            CustomerIds: formData.CustomerIds,
            ...vcsFields,
          }
        : {
            Name: formData.Name,
            Description: formData.Description,
            RepositoryUrl: formData.RepositoryUrl,
            IsCustomerSpecific: formData.IsCustomerSpecific,
            OrganizationId: formData.OrganizationId,
            CustomerIds: formData.CustomerIds,
            ...vcsFields,
          };

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to save application');
      }

      const applicationId = editingApp?.Id ?? Number(data.id);
      if (!applicationId) {
        throw new Error('Application saved but id was missing');
      }

      if (imageFile) {
        await uploadApplicationImage(applicationId, imageFile);
      } else if (editingApp && removeExistingImage && editingApp.ImagePath) {
        await deleteApplicationImage(applicationId);
      }

      closeModal();
      loadData();
      showToast({ type: 'success', message: editingApp ? 'Application updated successfully' : 'Application created successfully' });
    } catch (err: any) {
      const message = err.message || 'Failed to save application';
      setError(message);
      showToast({ type: 'error', message });
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
          showToast({ type: 'success', message: 'Application deleted successfully' });
        } catch (err: any) {
          const message = err.message || 'Failed to delete application';
          setError(message);
          showToast({ type: 'error', message });
          setConfirmModal(null);
        }
      },
    });
  };

  const handleExportApplicationsCsv = () => {
    const headers = [
      'Name',
      'Description',
      'RepositoryUrl',
      'OrganizationName',
      'IsCustomerSpecific',
      'CustomerNames'
    ];

    const rows = filteredAndSortedApplications.map((application) => ({
      Name: application.Name || '',
      Description: application.Description || '',
      RepositoryUrl: application.RepositoryUrl || '',
      OrganizationName: application.OrganizationName || '',
      IsCustomerSpecific: application.IsCustomerSpecific ? 'true' : 'false',
      CustomerNames: (application.Customers || []).map((customer) => customer.Name).join('|')
    }));

    downloadCsv('applications_export.csv', toCsv(rows, headers));
  };

  const handleApplicationsCsvImport = async (file: File) => {
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
          const organizationName = (row.OrganizationName || '').trim();

          if (!name) {
            throw new Error('Name is required');
          }

          if (!organizationName) {
            throw new Error('OrganizationName is required');
          }

          const organization = organizations.find((org) => org.Name.toLowerCase() === organizationName.toLowerCase());
          if (!organization) {
            throw new Error(`Unknown organization: ${organizationName}`);
          }

          const customerNames = (row.CustomerNames || '')
            .split('|')
            .map((value) => value.trim())
            .filter(Boolean);

          const customerIds = customerNames.map((customerName) => {
            const customer = customers.find((entry) => entry.Name.toLowerCase() === customerName.toLowerCase());
            if (!customer) {
              throw new Error(`Unknown customer: ${customerName}`);
            }
            return customer.Id;
          });

          const payload = {
            Name: name,
            Description: (row.Description || '').trim() || null,
            RepositoryUrl: (row.RepositoryUrl || '').trim() || null,
            OrganizationId: organization.Id,
            IsCustomerSpecific: row.IsCustomerSpecific
              ? parseBooleanLike(row.IsCustomerSpecific)
              : customerIds.length > 0,
            CustomerIds: customerIds,
          };

          const response = await fetch(`${getApiUrl()}/api/applications`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Failed to create application');
          }

          successCount += 1;
        } catch (importError: any) {
          failures.push(`Row ${rowNumber}: ${importError.message || 'Failed to import application'}`);
        }
      }

      await loadData();

      if (failures.length) {
        const message = `Imported ${successCount}/${rows.length} applications. ${failures.slice(0, 5).join(' | ')}${failures.length > 5 ? ' | ...' : ''}`;
        setError(message);
        showToast({ type: 'error', message });
      } else {
        setError('');
        showToast({ type: 'success', message: `Imported ${successCount} applications successfully` });
      }
    } catch (err: any) {
      const message = err.message || 'Failed to import applications CSV';
      setError(message);
      showToast({ type: 'error', message });
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleApplicationsCsvFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await handleApplicationsCsvImport(file);
    event.target.value = '';
  };

  if (authLoading || permissionsLoading || isLoading) {
    return (
      <div className="w-full">
        <div className="w-full mx-auto px-4 py-8">
          <div className="space-y-5 animate-pulse">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-20" />
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-14" />
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="w-full">
      <div className="w-full mx-auto px-4 py-4 sm:py-6 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight text-gray-900 dark:text-white">Applications</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {applications.length} application{applications.length !== 1 ? 's' : ''} across your organisations
            </p>
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
            {permissions?.canCreateApplications && (
              <button
                onClick={() => setShowImportModal(true)}
                disabled={isImportingCsv}
                className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
              >
                {isImportingCsv ? 'Importing...' : 'Import CSV'}
              </button>
            )}
            <button
              onClick={handleExportApplicationsCsv}
              className="h-10 px-4 bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center"
            >
              Export CSV
            </button>
            {permissions?.canCreateApplications && (
              <button
                onClick={openCreateModal}
                className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium inline-flex items-center gap-2"
              >
                <span className="text-base leading-none">+</span>
                New Application
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        {applications.length > 0 && (
          <CollapsibleFilterPanel
            className="mb-2"
            title="Application filters"
            activeCount={[
              searchQuery.trim() ? 1 : 0,
              filterOrg ? 1 : 0,
              filterVersions !== 'all' ? 1 : 0,
            ].reduce((a, b) => a + b, 0)}
            bodyClassName="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700"
            headerExtra={
              <span className="text-xs text-gray-400">
                {filteredAndSortedApplications.length !== applications.length
                  ? `${filteredAndSortedApplications.length} of ${applications.length} applications`
                  : `${applications.length} application${applications.length !== 1 ? 's' : ''}`}
              </span>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {/* Search - 2 columns on large screens */}
              <div className="relative lg:col-span-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search applications..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {/* Organization */}
              <select
                value={filterOrg}
                onChange={e => setFilterOrg(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">All Organisations</option>
                {orgNames.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {/* Versions */}
              <select
                value={filterVersions}
                onChange={e => setFilterVersions(e.target.value as 'all' | 'with' | 'without')}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">All Applications</option>
                <option value="with">With Versions</option>
                <option value="without">Without Versions</option>
              </select>
              {/* Sort */}
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={e => {
                  const [f, d] = e.target.value.split('-');
                  setSortField(f as ApplicationSortField);
                  setSortDirection(d as SortDirection);
                }}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="name-asc">Name A→Z</option>
                <option value="name-desc">Name Z→A</option>
                <option value="organization-asc">Organisation A→Z</option>
                <option value="organization-desc">Organisation Z→A</option>
                <option value="projects-desc">Projects (most)</option>
                <option value="projects-asc">Projects (least)</option>
                <option value="versions-desc">Versions (most)</option>
                <option value="versions-asc">Versions (least)</option>
                <option value="customers-desc">Customers (most)</option>
                <option value="customers-asc">Customers (least)</option>
              </select>
            </div>
          </CollapsibleFilterPanel>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>{error}</span>
            <button
              onClick={loadData}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Applications View */}
        {filteredAndSortedApplications.length === 0 && applications.length === 0 ? (
          <EmptyState
            icon="📦"
            title="No applications yet"
            message="Get started by creating your first application"
            primaryAction={
              permissions?.canCreateApplications
                ? {
                    label: 'Create Application',
                    onClick: openCreateModal,
                  }
                : undefined
            }
          />
        ) : filteredAndSortedApplications.length === 0 ? (
          <EmptyState
            icon="🔎"
            title="No applications match the selected filters"
            message="Try adjusting search, organization, or versions filter."
            primaryAction={{
              label: 'Clear filters',
              onClick: () => {
                setSearchQuery('');
                setFilterOrg('');
                setFilterVersions('all');
              },
            }}
            secondaryAction={{ label: 'Reload', onClick: loadData }}
          />
        ) : effectiveViewMode === 'list' ? (
          /* List View */
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                <tr>
                  <th aria-sort={getAriaSort('name')} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none" onClick={() => handleSort('name')}>
                    <div className="flex items-center">Application</div>
                  </th>
                  <th aria-sort={getAriaSort('organization')} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none" onClick={() => handleSort('organization')}>
                    <div className="flex items-center">Organization</div>
                  </th>
                  <th aria-sort={getAriaSort('projects')} scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none" onClick={() => handleSort('projects')}>
                    <div className="flex items-center justify-center">Projects</div>
                  </th>
                  <th aria-sort={getAriaSort('versions')} scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none" onClick={() => handleSort('versions')}>
                    <div className="flex items-center justify-center">Versions</div>
                  </th>
                  <th aria-sort={getAriaSort('customers')} scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none" onClick={() => handleSort('customers')}>
                    <div className="flex items-center justify-center">Customers</div>
                  </th>
                  {additionalApplicationColumnKeys.map((columnKey) => (
                    <th
                      key={`extra-application-header-${columnKey}`}
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
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredAndSortedApplications.map((app) => (
                  <tr
                    key={app.Id}
                    onClick={() => router.push(`/applications/${app.Id}`)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {app.ImagePath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={app.ImagePath} alt="" className="h-9 w-9 rounded object-cover border border-gray-200 dark:border-gray-600 shrink-0" />
                        ) : (
                          <span className="text-2xl shrink-0">📦</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {app.Name}
                          </div>
                          {app.Description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {app.Description}
                            </div>
                          )}
                          {app.RepositoryUrl && (
                            <a
                              href={app.RepositoryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              Repository
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {app.OrganizationName}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1 text-sm text-gray-900 dark:text-white">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        {app.ProjectCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1 text-sm text-gray-900 dark:text-white">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        {app.VersionCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-1 text-sm text-gray-900 dark:text-white">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {app.CustomerCount}
                      </span>
                    </td>
                    {additionalApplicationColumnKeys.map((columnKey) => (
                      <td key={`extra-application-cell-${app.Id}-${columnKey}`} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {renderApplicationExtraColumnValue(app, columnKey)}
                      </td>
                    ))}
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {(permissions?.canManageApplications || permissions?.canDeleteApplications) && (
                        <div className="flex items-center justify-end gap-1">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredAndSortedApplications.map((app) => (
              <div
                key={app.Id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/applications/${app.Id}`)}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {app.ImagePath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={app.ImagePath} alt="" className="h-8 w-8 rounded object-cover border border-gray-200 dark:border-gray-600 shrink-0" />
                      ) : (
                        <span className="text-2xl shrink-0">📦</span>
                      )}
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

      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-xl w-full mx-4">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Import Applications from CSV</h2>
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
                  Name,Description,RepositoryUrl,OrganizationName,IsCustomerSpecific,CustomerNames
                </code>
                <p className="text-sm text-blue-800 dark:text-blue-400 mt-2">
                  <a href={oldPath("/templates/applications_import_template.csv")} download className="underline hover:text-blue-600 dark:hover:text-blue-200">Download template CSV</a>
                </p>
              </div>

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleApplicationsCsvFileChange}
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

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
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
                    onChange={(e) => {
                      const RepositoryUrl = e.target.value;
                      const provider = detectAppVcsProvider(RepositoryUrl);
                      const cleared = emptyVcsFks();
                      // Keep current integration only if it still matches the detected provider
                      if (provider === 'github' && formData.GitHubIntegrationId) {
                        cleared.GitHubIntegrationId = formData.GitHubIntegrationId;
                      } else if (provider === 'gitea' && formData.GiteaIntegrationId) {
                        cleared.GiteaIntegrationId = formData.GiteaIntegrationId;
                      } else if (provider === 'bitbucket' && formData.BitbucketIntegrationId) {
                        cleared.BitbucketIntegrationId = formData.BitbucketIntegrationId;
                      } else if (!provider) {
                        // Unknown host (e.g. self-hosted): keep whichever single FK is set
                        if (formData.GitHubIntegrationId) cleared.GitHubIntegrationId = formData.GitHubIntegrationId;
                        else if (formData.GiteaIntegrationId) cleared.GiteaIntegrationId = formData.GiteaIntegrationId;
                        else if (formData.BitbucketIntegrationId) {
                          cleared.BitbucketIntegrationId = formData.BitbucketIntegrationId;
                        }
                      }
                      setFormData({ ...formData, RepositoryUrl, ...cleared });
                    }}
                    placeholder="https://github.com/org/repo"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {formData.OrganizationId > 0 && (() => {
                  const provider = detectAppVcsProvider(formData.RepositoryUrl);
                  const options: { value: string; label: string }[] = [];
                  if (!provider || provider === 'github') {
                    for (const row of githubIntegrations) {
                      options.push({
                        value: `github:${row.Id}`,
                        label: provider ? row.Name : `GitHub — ${row.Name}`,
                      });
                    }
                  }
                  if (!provider || provider === 'gitea') {
                    for (const row of giteaIntegrations) {
                      options.push({
                        value: `gitea:${row.Id}`,
                        label: provider ? row.Name : `Gitea — ${row.Name}`,
                      });
                    }
                  }
                  if (!provider || provider === 'bitbucket') {
                    for (const row of bitbucketIntegrations) {
                      options.push({
                        value: `bitbucket:${row.Id}`,
                        label: provider ? row.Name : `Bitbucket — ${row.Name}`,
                      });
                    }
                  }

                  const selectedValue = formData.GitHubIntegrationId
                    ? `github:${formData.GitHubIntegrationId}`
                    : formData.GiteaIntegrationId
                      ? `gitea:${formData.GiteaIntegrationId}`
                      : formData.BitbucketIntegrationId
                        ? `bitbucket:${formData.BitbucketIntegrationId}`
                        : '';

                  const providerLabel =
                    provider === 'github'
                      ? 'GitHub'
                      : provider === 'gitea'
                        ? 'Gitea'
                        : provider === 'bitbucket'
                          ? 'Bitbucket'
                          : 'VCS';

                  return (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {providerLabel} integration
                      </label>
                      <select
                        value={selectedValue}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const next = { ...formData, ...emptyVcsFks() };
                          if (raw) {
                            const [kind, idStr] = raw.split(':');
                            const id = Number(idStr);
                            if (kind === 'github') next.GitHubIntegrationId = id;
                            else if (kind === 'gitea') next.GiteaIntegrationId = id;
                            else if (kind === 'bitbucket') next.BitbucketIntegrationId = id;
                          }
                          setFormData(next);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      >
                        <option value="">None</option>
                        {options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        One repository URL uses one org credential instance
                        {provider
                          ? ` (${providerLabel}).`
                          : '. For self-hosted URLs, pick the matching provider instance.'}
                      </p>
                    </div>
                  );
                })()}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Application image
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Upload only (PNG, JPEG, WebP, or SVG). External image URLs are not supported.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imagePreview}
                        alt="Application preview"
                        className="h-14 w-14 rounded-lg object-cover border border-gray-200 dark:border-gray-600 bg-white"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-2xl bg-gray-50 dark:bg-gray-700/40">
                        📦
                      </div>
                    )}
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setImageFile(file);
                        setRemoveExistingImage(false);
                        if (file) {
                          void readFileAsDataUrl(file).then(setImagePreview).catch(() => setImagePreview(null));
                        } else {
                          setImagePreview(editingApp?.ImagePath || null);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="h-9 px-3 text-sm rounded-lg bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      {imagePreview ? 'Change image' : 'Upload image'}
                    </button>
                    {imagePreview && (
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                          setRemoveExistingImage(!!editingApp?.ImagePath);
                          if (imageInputRef.current) imageInputRef.current.value = '';
                        }}
                        className="h-9 px-3 text-sm rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.IsCustomerSpecific}
                      onChange={(e) => setFormData({ ...formData, IsCustomerSpecific: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span>Customer-specific product version</span>
                  </label>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
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

      <ScrollToTopButton />
    </div>
  );
}
