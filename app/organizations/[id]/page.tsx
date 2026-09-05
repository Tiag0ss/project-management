'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, use, useMemo, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation'
import { oldPath } from '@/lib/oldPath';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useToast } from '@/contexts/ToastContext';
import { organizationsApi, Organization, OrganizationMember, AddMemberData } from '@/lib/api/organizations';
import { permissionGroupsApi, PermissionGroup, CreatePermissionGroupData } from '@/lib/api/permissionGroups';
import { statusValuesApi, StatusValue, CreateStatusValueData } from '@/lib/api/statusValues';
import { workflowTransitionPoliciesApi, WorkflowTransitionPolicy, UpsertWorkflowTransitionPolicyData } from '@/lib/api/workflowTransitionPolicies';
import { projectsApi, Project } from '@/lib/api/projects';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import PageTabs from '@/components/PageTabs';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import ChangeHistory from '@/components/ChangeHistory';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import SearchableSelect from '@/components/SearchableSelect';
import { useFormatHours } from '@/lib/useFormatHours';
import PasswordInput, { clearPasswordInput, readPasswordInput } from '@/components/PasswordInput';
import { TaskTypeIcon, TaskTypeIconPicker, resolveTaskTypeIcon } from '@/lib/taskTypeIcons';
import TaskFormVisibilitySettingsPanel from '@/components/admin/TaskFormVisibilitySettingsPanel';
import ExpenseTaxonomyManager from '@/components/ExpenseTaxonomyManager';
import { useUrlTab } from '@/hooks/useUrlTab';

const ORGANIZATION_DETAIL_TABS = [
  'overview',
  'members',
  'projects',
  'permissions',
  'statuses',
  'expense-categories',
  'tags',
  'integrations',
  'sla',
  'workflow-policies',
  'task-form',
  'attachments',
  'history',
] as const;
type OrganizationDetailTab = (typeof ORGANIZATION_DETAIL_TABS)[number];

export default function OrganizationDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-gray-700 dark:text-gray-200">Loading…</div>
        </div>
      }
    >
      <OrganizationDetailPageContent {...props} />
    </Suspense>
  );
}

function OrganizationDetailPageContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const orgId = parseInt(resolvedParams.id);
  
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [activeTab, setActiveTab] = useUrlTab<OrganizationDetailTab>(ORGANIZATION_DETAIL_TABS, 'overview');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  
  // Edit organization state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);
  
  // Attachments state
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  const [modalMessage, setModalMessage] = useState<{
    type: 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
    confirmLabel?: string;
    confirmVariant?: 'primary' | 'danger';
  } | null>(null);

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmVariant?: 'primary' | 'danger';
    }
  ) => {
    setModalMessage({ type: 'confirm', title, message, onConfirm, ...options });
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
      loadOrganization();
    }
  }, [user, token, authLoading, orgId, router, featureFlagsLoaded]);

  const loadOrganization = async () => {
    if (!token) return;
    
    try {
      setIsLoading(true);
      const response = await organizationsApi.getById(orgId, token);
      setOrganization(response.organization);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load organization');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setIsSaving(true);
    setError('');

    try {
      const response = await fetch(
        `${getApiUrl()}/api/organizations/${orgId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: editForm.name,
            description: editForm.description,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to update organization');
      }

      await loadOrganization();
      setShowEditModal(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update organization');
    } finally {
      setIsSaving(false);
    }
  };

  const loadAttachments = async () => {
    if (!token) return;
    
    try {
      const response = await fetch(
        `${getApiUrl()}/api/organization-attachments/organization/${orgId}`,
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
    
    const maxSize = 10 * 1024 * 1024; // 10MB
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
      setError('File type not allowed. Allowed: images, PDF, Word, Excel, ZIP, TXT');
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
          `${getApiUrl()}/api/organization-attachments/organization/${orgId}`,
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

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!token) return;
    
    showConfirm(
      'Delete Attachment',
      'Are you sure you want to delete this attachment?',
      async () => {
        try {
          const response = await fetch(
            `${getApiUrl()}/api/organization-attachments/${attachmentId}`,
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
        }
      }
    );
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!user || !organization) return null;

  const canManageSettings =
    !!user?.isAdmin ||
    !!permissions?.canManageOrganizations ||
    organization.Role === 'Owner' ||
    organization.Role === 'Admin' ||
    Number(organization.CanManageSettings || 0) === 1;

  const organizationTabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'members' as const, label: 'Members' },
    { id: 'projects' as const, label: 'Projects' },
    { id: 'permissions' as const, label: 'Permission Groups' },
    { id: 'statuses' as const, label: 'Status & Priorities' },
    { id: 'expense-categories' as const, label: 'Expense Categories' },
    { id: 'tags' as const, label: 'Tags' },
    ...(canManageSettings
      ? [
          { id: 'integrations' as const, label: 'Integrations' },
          { id: 'sla' as const, label: 'SLA Rules' },
          { id: 'workflow-policies' as const, label: 'Workflow Transition Policies (DoR/DoD)' },
          { id: 'task-form' as const, label: 'Task Form' },
        ]
      : []),
    { id: 'attachments' as const, label: 'Attachments' },
    { id: 'history' as const, label: 'History' },
  ];

  return (
    <CustomerUserGuard>
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-[var(--pm-text)] truncate">{organization.Name}</h1>
          {canManageSettings && (
            <button
              type="button"
              onClick={() => {
                setEditForm({ name: organization.Name, description: organization.Description || '' });
                setShowEditModal(true);
              }}
              className="mt-1 text-sm text-[var(--pm-accent)] hover:underline"
            >
              Edit
            </button>
          )}
        </div>
        <a
          href={oldPath('/organizations')}
          className="text-sm text-[var(--pm-muted)] hover:text-[var(--pm-text)]"
        >
          ← Back to Organizations
        </a>
      </div>

      <PageTabs
        tabs={organizationTabs}
        activeId={activeTab}
        onChange={(id) => {
          setActiveTab(id as OrganizationDetailTab);
          if (id === 'attachments') loadAttachments();
        }}
      />

      <main className="min-w-0">
          {error && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
              {error}
            </div>
          )}

          <div>
            {activeTab === 'overview' && <OverviewTab organization={organization} orgId={orgId} token={token!} internalTicketsEnabled={internalTicketsEnabled} />}
            {activeTab === 'members' && <MembersTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />}
            {activeTab === 'projects' && <ProjectsTab orgId={orgId} canManage={canManageSettings} token={token!} />}
            {activeTab === 'permissions' && <PermissionsTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />}
            {activeTab === 'statuses' && (
              <StatusesTab
                orgId={orgId}
                canManage={canManageSettings}
                token={token!}
                showConfirm={showConfirm}
                internalTicketsEnabled={internalTicketsEnabled}
              />
            )}
            {activeTab === 'expense-categories' && token && (
              <ExpenseTaxonomyManager
                orgId={orgId}
                token={token}
                canManage={canManageSettings || !!permissions?.canManageExpenses || !!user?.isAdmin}
              />
            )}
            {activeTab === 'tags' && <TagsTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />}
            {activeTab === 'integrations' && <IntegrationsTab orgId={orgId} token={token!} />}
            {activeTab === 'sla' && <SlaTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />}
            {activeTab === 'workflow-policies' && (
              <WorkflowPoliciesTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />
            )}
            {activeTab === 'task-form' && token && (
              <TaskFormVisibilitySettingsPanel
                mode="organization"
                organizationId={orgId}
                token={token}
                canManage={canManageSettings}
                onRequestSyncConfirm={(onConfirm) => {
                  showConfirm(
                    'Sync from global',
                    'This will overwrite this organization\'s task form visibility with the global template. Continue?',
                    onConfirm,
                    { confirmLabel: 'Sync', confirmVariant: 'primary' }
                  );
                }}
              />
            )}
            {activeTab === 'attachments' && (
              <AttachmentsTab 
                orgId={orgId} 
                token={token!} 
                attachments={attachments}
                uploadingFile={uploadingFile}
                onFileUpload={handleFileUpload}
                onDeleteAttachment={handleDeleteAttachment}
              />
            )}
            {activeTab === 'history' && (
              <div>
                <ChangeHistory entityType="organization" entityId={orgId} />
              </div>
            )}
          </div>
        </main>

      {/* Edit Organization Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Edit Organization
              </h2>
            </div>
            <form onSubmit={handleSaveOrganization} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ScrollToTopButton />

      <ConfirmAlertModal
        isOpen={!!modalMessage}
        type="confirm"
        title={modalMessage?.title || ''}
        message={modalMessage?.message || ''}
        onClose={closeConfirmModal}
        onConfirm={handleModalConfirm}
        confirmLabel={modalMessage?.confirmLabel}
        confirmVariant={modalMessage?.confirmVariant}
      />
    </div>
    </CustomerUserGuard>
  );
}

function OverviewTab({ organization, orgId, token, internalTicketsEnabled }: { organization: Organization; orgId: number; token: string; internalTicketsEnabled: boolean }) {
  const decimalHoursToHMS = useFormatHours();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadProjects();
    if (internalTicketsEnabled) {
      void loadTickets();
    } else {
      setTickets([]);
    }
  }, [orgId, internalTicketsEnabled]);

  const loadProjects = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/projects?organizationId=${orgId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to load projects');
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTickets = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/tickets?organizationId=${orgId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to load tickets:', err);
    }
  };

  const normalizeDate = (value?: string | null) => {
    if (!value) return null;
    return String(value).split('T')[0];
  };

  const today = new Date();
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().split('T')[0];
  const upcomingLimit = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  upcomingLimit.setDate(upcomingLimit.getDate() + 14);
  const upcomingLimitKey = upcomingLimit.toISOString().split('T')[0];

  const totalProjects = projects.length;
  const activeProjects = projects.filter((project) => Number(project.StatusIsClosed || 0) !== 1 && Number(project.StatusIsCancelled || 0) !== 1).length;
  const completedProjects = projects.filter((project) => Number(project.StatusIsClosed || 0) === 1).length;
  const cancelledProjects = projects.filter((project) => Number(project.StatusIsCancelled || 0) === 1).length;
  const onHoldProjects = projects.filter((project) => String(project.StatusName || '').toLowerCase() === 'on hold').length;
  const hobbyProjects = projects.filter((project) => Number(project.IsHobby || 0) === 1).length;
  const workProjects = totalProjects - hobbyProjects;
  const customerVisibleProjects = projects.filter((project) => Number(project.IsVisibleToCustomer || 0) === 1).length;
  const globalProjects = projects.filter((project) => Number(project.IsGlobal || 0) === 1).length;

  const totalEstimated = projects.reduce((sum, project) => sum + Number(project.TotalEstimatedHours || 0), 0);
  const totalWorked = projects.reduce((sum, project) => sum + Number(project.TotalWorkedHours || 0), 0);
  const totalTasks = projects.reduce((sum, project) => sum + Number(project.TotalTasks || 0), 0);
  const completedTasks = projects.reduce((sum, project) => sum + Number(project.CompletedTasks || 0), 0);
  const overdueTasks = projects.reduce((sum, project) => sum + Number(project.OverdueTasks || 0), 0);
  const unplannedTasks = projects.reduce((sum, project) => sum + Number(project.UnplannedTasks || 0), 0);
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const hoursProgress = totalEstimated > 0 ? Math.round((totalWorked / totalEstimated) * 100) : 0;

  const totalTickets = tickets.length;
  const openTickets = tickets.filter((ticket) => String(ticket.Status || '').toLowerCase() === 'open').length;
  const inProgressTickets = tickets.filter((ticket) => String(ticket.Status || '').toLowerCase().includes('progress')).length;
  const waitingTickets = tickets.filter((ticket) => String(ticket.Status || '').toLowerCase().includes('waiting')).length;
  const resolvedTickets = tickets.filter((ticket) => Number(ticket.StatusIsClosed || 0) === 1).length;
  const unresolvedTickets = totalTickets - resolvedTickets;
  const urgentTickets = tickets.filter((ticket) => ['urgent', 'high'].includes(String(ticket.Priority || '').toLowerCase())).length;

  const overdueProjects = useMemo(() => {
    return projects
      .filter((project) => {
        const endDate = normalizeDate(project.EndDate);
        return !!endDate
          && Number(project.StatusIsClosed || 0) !== 1
          && Number(project.StatusIsCancelled || 0) !== 1
          && endDate < todayKey;
      })
      .sort((a, b) => String(a.EndDate || '').localeCompare(String(b.EndDate || '')));
  }, [projects, todayKey]);

  const upcomingProjects = useMemo(() => {
    return projects
      .filter((project) => {
        const endDate = normalizeDate(project.EndDate);
        return !!endDate
          && Number(project.StatusIsClosed || 0) !== 1
          && Number(project.StatusIsCancelled || 0) !== 1
          && endDate >= todayKey
          && endDate <= upcomingLimitKey;
      })
      .sort((a, b) => String(a.EndDate || '').localeCompare(String(b.EndDate || '')));
  }, [projects, todayKey, upcomingLimitKey]);

  const recentProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => new Date(String(b.UpdatedAt || b.CreatedAt || 0)).getTime() - new Date(String(a.UpdatedAt || a.CreatedAt || 0)).getTime())
      .slice(0, 6);
  }, [projects]);

  const customerSummaries = useMemo(() => {
    const map = new Map<string, { name: string; projectCount: number; workedHours: number; estimatedHours: number }>();

    projects.forEach((project) => {
      const customerName = String(project.CustomerName || '').trim();
      if (!customerName) return;

      const existing = map.get(customerName) || {
        name: customerName,
        projectCount: 0,
        workedHours: 0,
        estimatedHours: 0,
      };

      existing.projectCount += 1;
      existing.workedHours += Number(project.TotalWorkedHours || 0);
      existing.estimatedHours += Number(project.TotalEstimatedHours || 0);
      map.set(customerName, existing);
    });

    return Array.from(map.values())
      .sort((a, b) => b.projectCount - a.projectCount || b.workedHours - a.workedHours)
      .slice(0, 5);
  }, [projects]);

  const projectStatusCards = [
    { label: 'Active', value: activeProjects, tone: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' },
    { label: 'Completed', value: completedProjects, tone: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' },
    { label: 'On Hold', value: onHoldProjects, tone: 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20' },
    { label: 'Cancelled', value: cancelledProjects, tone: 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/60' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Portfolio health, delivery progress, and operational signals for {organization.Name}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                Role: {organization.Role}
              </span>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {organization.MemberCount || 0} members
              </span>
              <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                {workProjects} work / {hobbyProjects} hobby projects
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-500 dark:text-gray-400">Created by</div>
                <div className="font-medium text-gray-900 dark:text-white">{organization.CreatorName || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-gray-500 dark:text-gray-400">Created on</div>
                <div className="font-medium text-gray-900 dark:text-white">{new Date(organization.CreatedAt).toLocaleDateString()}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 min-w-full lg:min-w-[320px] lg:max-w-[360px]">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Customer Visible</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{customerVisibleProjects}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">projects visible in portal</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Global</div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{globalProjects}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">shared projects</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Overdue Tasks</div>
              <div className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{overdueTasks}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">across all projects</div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Unplanned Tasks</div>
              <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{unplannedTasks}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">need planning</div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={`org-overview-skeleton-${index}`} className="h-32 bg-white dark:bg-gray-800 rounded-lg shadow animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className={`grid grid-cols-1 md:grid-cols-2 ${internalTicketsEnabled ? 'xl:grid-cols-5' : 'xl:grid-cols-4'} gap-4`}>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-blue-500">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Projects</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalProjects}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{activeProjects} active · {completedProjects} completed</div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-purple-500">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Tasks</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalTasks}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{completedTasks} completed · {overallProgress}% progress</div>
            </div>
            {internalTicketsEnabled && (
              <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-indigo-500">
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Tickets</div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalTickets}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{unresolvedTickets} open · {urgentTickets} urgent/high</div>
              </div>
            )}
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-orange-500">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Estimated Hours</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{decimalHoursToHMS(totalEstimated)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">planned across project totals</div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow border-l-4 border-green-500">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Hours Worked</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{decimalHoursToHMS(totalWorked)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hoursProgress}% of estimated effort</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Delivery Progress</h3>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Tasks completed</span>
                    <span className="font-medium text-gray-900 dark:text-white">{completedTasks}/{totalTasks} ({overallProgress}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div className="bg-blue-600 h-3 rounded-full transition-all" style={{ width: `${overallProgress}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Hours progress</span>
                    <span className="font-medium text-gray-900 dark:text-white">{decimalHoursToHMS(totalWorked)} / {decimalHoursToHMS(totalEstimated)}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div className={`h-3 rounded-full transition-all ${totalWorked > totalEstimated ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, totalEstimated > 0 ? (totalWorked / totalEstimated) * 100 : 0)}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  {projectStatusCards.map((card) => (
                    <div key={card.label} className={`rounded-lg p-4 text-center ${card.tone}`}>
                      <div className="text-2xl font-bold">{card.value}</div>
                      <div className="text-sm">{card.label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Portfolio Mix</div>
                    <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">{workProjects} work projects</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">{hobbyProjects} hobby projects</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Task Risks</div>
                    <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">{overdueTasks} overdue tasks</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">{unplannedTasks} unplanned tasks</div>
                  </div>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Support Load</div>
                    <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">{openTickets} open tickets</div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">{waitingTickets} waiting · {inProgressTickets} in progress</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Attention Areas</h3>
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-red-600 dark:text-red-400">Overdue Projects</h4>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{overdueProjects.length}</span>
                  </div>
                  {overdueProjects.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No overdue projects.</p>
                  ) : (
                    <div className="space-y-2">
                      {overdueProjects.slice(0, 4).map((project) => {
                        const endDate = normalizeDate(project.EndDate);
                        const daysOverdue = endDate ? Math.max(1, Math.floor((new Date(todayKey).getTime() - new Date(endDate).getTime()) / 86400000)) : 0;
                        return (
                          <div key={project.Id} className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 p-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{project.ProjectName}</div>
                            <div className="text-xs text-red-600 dark:text-red-400 mt-1">{daysOverdue} day{daysOverdue !== 1 ? 's' : ''} overdue</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-amber-600 dark:text-amber-400">Upcoming Deadlines</h4>
                    <span className="text-xs text-gray-500 dark:text-gray-400">next 14 days</span>
                  </div>
                  {upcomingProjects.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No upcoming deadlines.</p>
                  ) : (
                    <div className="space-y-2">
                      {upcomingProjects.slice(0, 4).map((project) => {
                        const endDate = normalizeDate(project.EndDate);
                        const daysLeft = endDate ? Math.max(0, Math.ceil((new Date(endDate).getTime() - new Date(todayKey).getTime()) / 86400000)) : 0;
                        return (
                          <div key={project.Id} className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 p-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{project.ProjectName}</div>
                            <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">{daysLeft === 0 ? 'Due today' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Project Activity</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Most recently updated projects in this organization.</p>
              </div>
              {recentProjects.length === 0 ? (
                <div className="p-6 text-sm text-gray-500 dark:text-gray-400">No projects found.</div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {recentProjects.map((project) => {
                    const progress = Number(project.TotalTasks || 0) > 0 ? Math.round((Number(project.CompletedTasks || 0) / Number(project.TotalTasks || 1)) * 100) : 0;

                    return (
                      <div key={project.Id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-medium text-gray-900 dark:text-white truncate">{project.ProjectName}</div>
                              {project.StatusName && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={project.StatusColor ? { backgroundColor: `${project.StatusColor}20`, color: project.StatusColor } : undefined}>
                                  {project.StatusName}
                                </span>
                              )}
                              {Number(project.IsHobby || 0) === 1 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                  Hobby
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                              <span>{project.CustomerName || 'Internal / no customer'}</span>
                              <span>{Number(project.TotalTasks || 0)} tasks</span>
                              <span>{Number(project.TotalWorkedHours || 0).toFixed(1) !== '0.0' ? decimalHoursToHMS(Number(project.TotalWorkedHours || 0)) : '00:00:00'} worked</span>
                              <span>Updated {new Date(project.UpdatedAt).toLocaleDateString()}</span>
                            </div>
                            <div className="mt-3">
                              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                                <span>Task progress</span>
                                <span>{progress}%</span>
                              </div>
                              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${progress}%` }} />
                              </div>
                            </div>
                          </div>
                          <a href={`/projects/${project.Id}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
                            Open project
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Customers</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4">Customers with the most active portfolio footprint.</p>
              {customerSummaries.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No customer-linked projects yet.</p>
              ) : (
                <div className="space-y-3">
                  {customerSummaries.map((customer) => (
                    <div key={customer.name} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                      <div className="font-medium text-gray-900 dark:text-white">{customer.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{customer.projectCount} project{customer.projectCount !== 1 ? 's' : ''}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">{decimalHoursToHMS(customer.workedHours)} worked / {decimalHoursToHMS(customer.estimatedHours)} estimated</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {internalTicketsEnabled && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Ticket Snapshot</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Current support load inside this organization.</p>
                </div>
                <a href={`/tickets?organizationId=${orgId}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
                  View tickets
                </a>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-700/60 p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalTickets}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
                </div>
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{openTickets}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Open</div>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-4 text-center">
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{waitingTickets}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Waiting</div>
                </div>
                <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{inProgressTickets}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">In Progress</div>
                </div>
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4 text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{resolvedTickets}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Resolved</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MembersTab({ 
  orgId, 
  canManage, 
  token,
  showConfirm 
}: { 
  orgId: number; 
  canManage: boolean; 
  token: string;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmVariant?: 'primary' | 'danger';
    }
  ) => void;
}) {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);

  useEffect(() => {
    void loadMembers();
    void loadGroups();
  }, [orgId]);

  const loadMembers = async () => {
    try {
      setIsLoading(true);
      const response = await organizationsApi.getMembers(orgId, token);
      setMembers(response.members || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load members');
    } finally {
      setIsLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const response = await permissionGroupsApi.getByOrganization(orgId, token);
      setGroups(response.groups || []);
    } catch (err: any) {
      console.error('Failed to load groups:', err);
    }
  };

  const handleRemove = async (memberId: number) => {
    showConfirm('Remove Member', 'Are you sure you want to remove this member?', async () => {
      try {
        await organizationsApi.removeMember(orgId, memberId, token);
        await loadMembers();
      } catch (err: any) {
        setError(err.message || 'Failed to remove member');
      }
    });
  };

  if (isLoading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading members...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Organization Members</h3>
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Add Member
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Email</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Role</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Permission Group</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Joined</th>
                {canManage && (
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {members.map((member) => (
                <tr key={member.Id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{member.Username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{member.Email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{member.Role}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{member.GroupName || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(member.JoinedAt).toLocaleDateString()}</td>
                  {canManage && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {member.Role !== 'Owner' ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingMember(member)}
                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                            title="Edit member"
                            aria-label="Edit member"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleRemove(member.Id)}
                            className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400"
                            title="Remove member"
                            aria-label="Remove member"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-7 0h8" />
                            </svg>
                          </button>
                        </div>
                      ) : null}
                    </td>
                  )}
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <AddMemberModal
          orgId={orgId}
          groups={groups}
          token={token}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            void loadMembers();
          }}
        />
      )}

      {editingMember && (
        <EditMemberModal
          orgId={orgId}
          member={editingMember}
          groups={groups}
          token={token}
          onClose={() => setEditingMember(null)}
          onUpdated={() => {
            setEditingMember(null);
            void loadMembers();
          }}
        />
      )}
    </div>
  );
}

function AddMemberModal({ orgId, groups, onClose, onAdded, token }: {
  orgId: number;
  groups: PermissionGroup[];
  onClose: () => void;
  onAdded: () => void;
  token: string;
}) {
  const [availableUsers, setAvailableUsers] = useState<Array<{ Id: number; Username: string; Email: string; FirstName?: string; LastName?: string }>>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [formData, setFormData] = useState<{ userId?: number; role: string; permissionGroupId?: number }>({
    role: 'Member',
    permissionGroupId: undefined,
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadAvailableUsers = async () => {
      try {
        setLoadingUsers(true);
        const response = await organizationsApi.getAvailableUsers(orgId, token);
        const users = response.users || [];
        setAvailableUsers(users);
        if (users.length === 1) {
          setFormData((prev) => ({ ...prev, userId: users[0].Id }));
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load available users');
      } finally {
        setLoadingUsers(false);
      }
    };

    void loadAvailableUsers();
  }, [orgId, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.userId) {
      setError('Please select a user');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await organizationsApi.addMember(orgId, formData, token);
      onAdded();
    } catch (err: any) {
      setError(err.message || 'Failed to add member');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 overflow-y-auto max-h-[90vh]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Add Member</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl">×</button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">User *</label>
              <SearchableSelect
                value={formData.userId || ''}
                onChange={(value) => setFormData({ ...formData, userId: value ? parseInt(String(value), 10) : undefined })}
                options={availableUsers.map((userItem) => ({ value: userItem.Id, label: `${userItem.Username} (${userItem.Email})` }))}
                placeholder="User"
                emptyText={loadingUsers ? 'Loading users...' : (availableUsers.length === 0 ? 'No available users' : 'Select user')}
                disabled={loadingUsers || availableUsers.length === 0}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="Member">Member</option>
                <option value="Admin">Admin</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Permission Group (Optional)</label>
              <select
                value={formData.permissionGroupId || ''}
                onChange={(e) => setFormData({ ...formData, permissionGroupId: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">None</option>
                {groups.map((group) => (
                  <option key={group.Id} value={group.Id}>{group.GroupName}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 mt-6">
              <button type="button" onClick={onClose} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium">Cancel</button>
              <button type="submit" disabled={isLoading} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium">
                {isLoading ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function EditMemberModal({ orgId, member, groups, onClose, onUpdated, token }: {
  orgId: number;
  member: OrganizationMember;
  groups: PermissionGroup[];
  onClose: () => void;
  onUpdated: () => void;
  token: string;
}) {
  const [formData, setFormData] = useState({
    role: member.Role,
    permissionGroupId: member.PermissionGroupId || undefined,
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await organizationsApi.updateMember(orgId, member.Id, formData, token);
      onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to update member');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Member</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl">×</button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <div className="mb-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">User</div>
            <div className="text-lg font-medium text-gray-900 dark:text-white">{member.Username}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{member.Email}</div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Role</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="Member">Member</option>
                <option value="Admin">Admin</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Permission Group (Optional)</label>
              <select
                value={formData.permissionGroupId || ''}
                onChange={(e) => setFormData({ ...formData, permissionGroupId: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">None</option>
                {groups.map((group) => (
                  <option key={group.Id} value={group.Id}>{group.GroupName}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 mt-6">
              <button type="button" onClick={onClose} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium">Cancel</button>
              <button type="submit" disabled={isLoading} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium">
                {isLoading ? 'Updating...' : 'Update Member'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function PermissionsTab({ 
  orgId, 
  canManage, 
  token,
  showConfirm 
}: { 
  orgId: number; 
  canManage: boolean; 
  token: string;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmVariant?: 'primary' | 'danger';
    }
  ) => void;
}) {
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<PermissionGroup | null>(null);

  useEffect(() => {
    loadGroups();
  }, [orgId]);

  const loadGroups = async () => {
    try {
      setIsLoading(true);
      const response = await permissionGroupsApi.getByOrganization(orgId, token);
      setGroups(response.groups);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load permission groups');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    showConfirm(
      'Delete Permission Group',
      'Are you sure you want to delete this permission group?',
      async () => {
        try {
          await permissionGroupsApi.delete(id, token);
          await loadGroups();
        } catch (err: any) {
          setError(err.message || 'Failed to delete permission group');
        }
      }
    );
  };

  const handleSync = async (group: PermissionGroup) => {
    showConfirm(
      'Sync from Global Defaults',
      `Reset "${group.GroupName}" permissions to match the current global "${group.LinkedRole}" role defaults? Any org-specific customizations will be overwritten.`,
      async () => {
        try {
          await permissionGroupsApi.syncFromGlobal(group.Id, token);
          await loadGroups();
        } catch (err: any) {
          setError(err.message || 'Failed to sync permission group');
        }
      },
      {
        confirmLabel: 'Sync',
        confirmVariant: 'primary',
      }
    );
  };

  if (isLoading) return <div>Loading permission groups...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Permission Groups</h3>
        {canManage && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Create Group
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((group) => (
          <div key={group.Id} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">{group.GroupName}</h4>
                {group.IsSystemGroup && group.LinkedRole && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-medium mt-1">
                    🔗 Global role: {group.LinkedRole}
                  </span>
                )}
                {group.Description && (() => {
                  const plainText = group.Description.replace(/<[^>]*>/g, '').trim();
                  return plainText ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400">{plainText}</p>
                  ) : null;
                })()}
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">{group.MemberCount || 0} members</span>
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className={group.CanManageProjects ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanManageProjects ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Manage Projects</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanCreateProjects ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanCreateProjects ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Create Projects</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanDeleteProjects ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanDeleteProjects ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Delete Projects</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanManageTasks ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanManageTasks ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Manage Tasks</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanCreateTasks ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanCreateTasks ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Create Tasks</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanDeleteTasks ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanDeleteTasks ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Delete Tasks</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanAssignTasks ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanAssignTasks ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Assign Tasks</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanPlanTasks ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanPlanTasks ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Plan Tasks</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanManageTimeEntries ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanManageTimeEntries ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Manage Time Entries</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanViewReports ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanViewReports ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">View Reports</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanViewBudgetInfo ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanViewBudgetInfo ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">View Budget Info</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanManageTickets ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanManageTickets ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Manage Tickets</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanCreateTickets ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanCreateTickets ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Create Tickets</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanDeleteTickets ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanDeleteTickets ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Delete Tickets</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanAssignTickets ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanAssignTickets ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Assign Tickets</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanCreateTaskFromTicket ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanCreateTaskFromTicket ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Create Task from Ticket</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanManageMembers ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanManageMembers ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Manage Members</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanManageSettings ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanManageSettings ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Manage Settings</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanManageApplications ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanManageApplications ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Manage Applications</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanCreateApplications ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanCreateApplications ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Create Applications</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanDeleteApplications ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanDeleteApplications ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Delete Applications</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanManageReleases ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanManageReleases ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Manage Releases</span>
              </div>
            </div>

            {canManage && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setEditingGroup(group)}
                  title="Edit permission group"
                  aria-label="Edit permission group"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm"
                >
                  ✏️
                </button>
                {group.IsSystemGroup ? (
                  <button
                    onClick={() => handleSync(group)}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-sm"
                    title={`Reset to global ${group.LinkedRole} defaults`}
                  >
                    🔄 Sync
                  </button>
                ) : (
                  <button
                    onClick={() => handleDelete(group.Id)}
                    title="Delete permission group"
                    aria-label="Delete permission group"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm"
                  >
                    🗑️
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showCreateModal && (
        <PermissionGroupModal
          orgId={orgId}
          onClose={() => setShowCreateModal(false)}
          onSaved={() => {
            setShowCreateModal(false);
            loadGroups();
          }}
          token={token}
        />
      )}

      {editingGroup && (
        <PermissionGroupModal
          orgId={orgId}
          group={editingGroup}
          onClose={() => setEditingGroup(null)}
          onSaved={() => {
            setEditingGroup(null);
            loadGroups();
          }}
          token={token}
        />
      )}
    </div>
  );
}

function PermissionGroupModal({ orgId, group, onClose, onSaved, token }: {
  orgId: number;
  group?: PermissionGroup;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const [formData, setFormData] = useState<CreatePermissionGroupData>({
    organizationId: orgId,
    groupName: group?.GroupName || '',
    description: group?.Description || '',
    canManageProjects: !!group?.CanManageProjects,
    canCreateProjects: !!group?.CanCreateProjects,
    canDeleteProjects: !!group?.CanDeleteProjects,
    canManageTasks: !!group?.CanManageTasks,
    canCreateTasks: !!group?.CanCreateTasks,
    canDeleteTasks: !!group?.CanDeleteTasks,
    canAssignTasks: !!group?.CanAssignTasks,
    canPlanTasks: !!group?.CanPlanTasks,
    canManageTimeEntries: !!group?.CanManageTimeEntries,
    canViewReports: !!group?.CanViewReports,
    canViewBudgetInfo: !!group?.CanViewBudgetInfo,
    canManageTickets: !!group?.CanManageTickets,
    canCreateTickets: !!group?.CanCreateTickets,
    canDeleteTickets: !!group?.CanDeleteTickets,
    canAssignTickets: !!group?.CanAssignTickets,
    canCreateTaskFromTicket: !!group?.CanCreateTaskFromTicket,
    canViewOthersPlanning: !!group?.CanViewOthersPlanning,
    canViewApplications: !!group?.CanViewApplications,
    canManageMembers: !!group?.CanManageMembers,
    canManageSettings: !!group?.CanManageSettings,
    canManageApplications: !!group?.CanManageApplications,
    canCreateApplications: !!group?.CanCreateApplications,
    canDeleteApplications: !!group?.CanDeleteApplications,
    canManageReleases: !!group?.CanManageReleases,
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (group) {
        await permissionGroupsApi.update(group.Id, formData, token);
      } else {
        await permissionGroupsApi.create(formData, token);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save permission group');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {group ? 'Edit' : 'Create'} Permission Group
              </h2>
              {group?.IsSystemGroup && group?.LinkedRole && (
                <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                  🔗 Linked to global <strong>{group.LinkedRole}</strong> role — editing overrides org defaults
                </p>
              )}
            </div>
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
                Group Name *
              </label>
              <input
                type="text"
                value={formData.groupName}
                onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                required
                readOnly={!!group?.IsSystemGroup}
                className={`w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${group?.IsSystemGroup ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Permissions
              </label>
              <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                {[
                  { key: 'canManageProjects', label: 'Manage Projects' },
                  { key: 'canCreateProjects', label: 'Create Projects' },
                  { key: 'canDeleteProjects', label: 'Delete Projects' },
                  { key: 'canManageTasks', label: 'Manage Tasks' },
                  { key: 'canCreateTasks', label: 'Create Tasks' },
                  { key: 'canDeleteTasks', label: 'Delete Tasks' },
                  { key: 'canAssignTasks', label: 'Assign Tasks' },
                  { key: 'canPlanTasks', label: 'Plan Tasks' },
                  { key: 'canManageTimeEntries', label: 'Manage Time Entries' },
                  { key: 'canViewReports', label: 'View Reports' },
                  { key: 'canViewBudgetInfo', label: 'View Budget Info' },
                  { key: 'canManageTickets', label: 'Manage Tickets' },
                  { key: 'canCreateTickets', label: 'Create Tickets' },
                  { key: 'canDeleteTickets', label: 'Delete Tickets' },
                  { key: 'canAssignTickets', label: 'Assign Tickets' },
                  { key: 'canCreateTaskFromTicket', label: 'Create Task from Ticket' },
                  { key: 'canViewOthersPlanning', label: 'View Others Planning' },
                  { key: 'canViewApplications', label: 'View Applications' },
                  { key: 'canManageMembers', label: 'Manage Members' },
                  { key: 'canManageSettings', label: 'Manage Settings' },
                  { key: 'canManageApplications', label: 'Manage Applications' },
                  { key: 'canCreateApplications', label: 'Create Applications' },
                  { key: 'canDeleteApplications', label: 'Delete Applications' },
                  { key: 'canManageReleases', label: 'Manage Releases' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData[key as keyof typeof formData] as boolean}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>

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
                {isLoading ? 'Saving...' : group ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const MILESTONE_TYPE_ICON_OPTIONS = [
  { value: 'flag', label: 'Flag' },
  { value: 'target', label: 'Target' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'star', label: 'Star' },
  { value: 'trophy', label: 'Trophy' },
  { value: 'check-circle', label: 'Check Circle' },
  { value: 'milestone', label: 'Milestone' },
];

function renderMilestoneTypeIcon(iconSvg: string | undefined, className: string = 'w-4 h-4') {
  switch (iconSvg) {
    case 'target':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth="2" /><circle cx="12" cy="12" r="5" strokeWidth="2" /><circle cx="12" cy="12" r="1.5" strokeWidth="2" /></svg>;
    case 'rocket':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3l7 7-4 4-7-7 4-4zm-5 5l7 7-8 5 1-6-6 1 6-7z" /></svg>;
    case 'calendar':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" strokeWidth="2" /><path strokeLinecap="round" strokeWidth={2} d="M16 3v4M8 3v4M3 10h18" /></svg>;
    case 'star':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l2.8 5.7L21 9.6l-4.5 4.4 1.1 6.3L12 17.3 6.4 20.3 7.5 14 3 9.6l6.2-.9L12 3z" /></svg>;
    case 'trophy':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4h8v3a4 4 0 01-8 0V4zm-3 1h3v1a5 5 0 01-3 4V5zm14 0h-3v1a5 5 0 003 4V5zM12 14v4m-3 3h6" /></svg>;
    case 'check-circle':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth="2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12l2.5 2.5L16 9" /></svg>;
    case 'milestone':
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 20V4m0 0l10 3-10 3m0-6v16" /></svg>;
    case 'flag':
    default:
      return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 20V4m0 0c4 0 4 2 8 2s4-2 8-2v8c-4 0-4 2-8 2s-4-2-8-2" /></svg>;
  }
}

function StatusesTab({ 
  orgId, 
  canManage, 
  token,
  showConfirm,
  internalTicketsEnabled,
}: { 
  orgId: number; 
  canManage: boolean; 
  token: string;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmVariant?: 'primary' | 'danger';
    }
  ) => void;
  internalTicketsEnabled: boolean;
}) {
  const [projectStatuses, setProjectStatuses] = useState<StatusValue[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [taskPriorities, setTaskPriorities] = useState<StatusValue[]>([]);
  const [taskTypes, setTaskTypes] = useState<StatusValue[]>([]);
  const [milestoneTypes, setMilestoneTypes] = useState<StatusValue[]>([]);
  const [ticketStatuses, setTicketStatuses] = useState<any[]>([]);
  const [ticketPriorities, setTicketPriorities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeType, setActiveType] = useState<'project' | 'task' | 'priority' | 'type' | 'milestone-type' | 'ticket' | 'ticket-priority'>('project');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState<StatusValue | null>(null);

  useEffect(() => {
    loadStatuses();
  }, [orgId]);

  useEffect(() => {
    if (!internalTicketsEnabled && (activeType === 'ticket' || activeType === 'ticket-priority')) {
      setActiveType('project');
    }
  }, [internalTicketsEnabled, activeType]);

  const loadStatuses = async () => {
    try {
      setIsLoading(true);
      const [projectRes, taskRes, priorityRes, typeRes, milestoneTypeRes] = await Promise.all([
        statusValuesApi.getProjectStatuses(orgId, token),
        statusValuesApi.getTaskStatuses(orgId, token),
        statusValuesApi.getTaskPriorities(orgId, token),
        statusValuesApi.getTaskTypes(orgId, token),
        statusValuesApi.getMilestoneTypes(orgId, token),
      ]);

      let ticketRes: any = { statuses: [] };
      let ticketPriRes: any = { priorities: [] };

      if (internalTicketsEnabled) {
        [ticketRes, ticketPriRes] = await Promise.all([
          fetch(`${getApiUrl()}/api/status-values/ticket/${orgId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
          fetch(`${getApiUrl()}/api/status-values/ticket-priority/${orgId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        ]);
      }

      setProjectStatuses(projectRes.statuses);
      setTaskStatuses(taskRes.statuses);
      setTaskPriorities(priorityRes.priorities);
      setTaskTypes(typeRes.types);
      setMilestoneTypes(milestoneTypeRes.types);
      setTicketStatuses(ticketRes.statuses || []);
      setTicketPriorities(ticketPriRes.priorities || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load status values');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number, type: 'project' | 'task' | 'priority' | 'type' | 'milestone-type' | 'ticket' | 'ticket-priority') => {
    const itemType = (type === 'priority' || type === 'ticket-priority')
      ? 'priority'
      : (type === 'type' || type === 'milestone-type')
        ? 'type value'
        : 'status value';
    showConfirm(
      `Delete ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`,
      `Are you sure you want to delete this ${itemType}?`,
      async () => {
        try {
          if (type === 'project') {
            await statusValuesApi.deleteProjectStatus(id, token);
          } else if (type === 'task') {
            await statusValuesApi.deleteTaskStatus(id, token);
          } else if (type === 'priority') {
            await statusValuesApi.deleteTaskPriority(id, token);
          } else if (type === 'type') {
            await statusValuesApi.deleteTaskType(id, token);
          } else if (type === 'milestone-type') {
            await statusValuesApi.deleteMilestoneType(id, token);
          } else {
            const endpoint = type === 'ticket' ? 'ticket' : 'ticket-priority';
            await fetch(`${getApiUrl()}/api/status-values/${endpoint}/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
          }
          await loadStatuses();
        } catch (err: any) {
          setError(err.message || 'Failed to delete ' + itemType);
        }
      }
    );
  };

  if (isLoading) return <div>Loading status values...</div>;

  const currentStatuses = activeType === 'project' ? projectStatuses
    : activeType === 'task' ? taskStatuses
    : activeType === 'priority' ? taskPriorities
    : activeType === 'type' ? taskTypes
    : activeType === 'milestone-type' ? milestoneTypes
    : activeType === 'ticket' ? ticketStatuses
    : ticketPriorities;
  const buttonLabel = (activeType === 'priority' || activeType === 'ticket-priority') ? 'Add Priority' : (activeType === 'type' || activeType === 'milestone-type') ? 'Add Type' : 'Add Status';

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveType('project')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeType === 'project'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Project Statuses
          </button>
          <button
            onClick={() => setActiveType('task')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeType === 'task'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Task Statuses
          </button>
          <button
            onClick={() => setActiveType('priority')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeType === 'priority'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Task Priorities
          </button>
          <button
            onClick={() => setActiveType('type')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeType === 'type'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Task Types
          </button>
          <button
            onClick={() => setActiveType('milestone-type')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeType === 'milestone-type'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Milestone Types
          </button>
          {internalTicketsEnabled && (
            <>
              <button
                onClick={() => setActiveType('ticket')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeType === 'ticket'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Ticket Statuses
              </button>
              <button
                onClick={() => setActiveType('ticket-priority')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeType === 'ticket-priority'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Ticket Priorities
              </button>
            </>
          )}
        </div>
        {canManage && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {buttonLabel}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {currentStatuses.map((status) => (
          <div key={status.Id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <div className="flex items-center gap-4">
              {(status.ColorCode || status.Color) && (
                <div
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: status.ColorCode || status.Color }}
                />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white inline-flex items-center gap-1.5">
                    {activeType === 'milestone-type' && (
                      <span className="inline-flex items-center text-gray-600 dark:text-gray-300">
                        {renderMilestoneTypeIcon(status.IconSvg || 'flag', 'w-4 h-4')}
                      </span>
                    )}
                    {activeType === 'type' && (
                      <span
                        className="inline-flex items-center"
                        style={status.ColorCode ? { color: status.ColorCode } : undefined}
                      >
                        <TaskTypeIcon
                          iconSvg={resolveTaskTypeIcon(status.IconSvg, status.TypeName)}
                          className="w-4 h-4"
                        />
                      </span>
                    )}
                    {(activeType === 'priority' || activeType === 'ticket-priority')
                      ? status.PriorityName
                      : (activeType === 'type' || activeType === 'milestone-type')
                        ? status.TypeName
                        : status.StatusName}
                  </span>
                  {status.IsDefault ? <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full">Default</span> : ''}
                  {status.IsClosed ? <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 rounded-full">Closed</span> : ''}
                  {status.IsCancelled ? <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 rounded-full">Cancelled</span> : ''}
                  {status.HideFromPlanningAndStatistics ? <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-full">Hidden in Planning/Stats</span> : ''}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Order: {status.SortOrder}
                </div>
              </div>
            </div>

            {canManage && (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingStatus(status)}
                  title="Edit value"
                  aria-label="Edit value"
                  className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 px-3 py-1"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDelete(status.Id, activeType)}
                  title="Delete value"
                  aria-label="Delete value"
                  className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 px-3 py-1"
                >
                  🗑️
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showCreateModal && (
        <StatusValueModal
          orgId={orgId}
          type={activeType}
          onClose={() => setShowCreateModal(false)}
          onSaved={() => {
            setShowCreateModal(false);
            loadStatuses();
          }}
          token={token}
        />
      )}

      {editingStatus && (
        <StatusValueModal
          orgId={orgId}
          type={activeType}
          status={editingStatus}
          onClose={() => setEditingStatus(null)}
          onSaved={() => {
            setEditingStatus(null);
            loadStatuses();
          }}
          token={token}
        />
      )}
    </div>
  );
}

function WorkflowPoliciesTab({
  orgId,
  canManage,
  token,
  showConfirm,
}: {
  orgId: number;
  canManage: boolean;
  token: string;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmVariant?: 'primary' | 'danger';
    }
  ) => void;
}) {
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [workflowPolicies, setWorkflowPolicies] = useState<WorkflowTransitionPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<WorkflowTransitionPolicy | null>(null);

  useEffect(() => {
    void loadWorkflowPolicies();
  }, [orgId]);

  const loadWorkflowPolicies = async () => {
    try {
      setIsLoading(true);
      const [taskRes, workflowPolicyRes] = await Promise.all([
        statusValuesApi.getTaskStatuses(orgId, token),
        workflowTransitionPoliciesApi.getByOrganization(orgId, token),
      ]);

      setTaskStatuses(taskRes.statuses || []);
      setWorkflowPolicies(workflowPolicyRes.policies || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load workflow transition policies');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePolicy = async (policyId: number) => {
    showConfirm(
      'Delete Workflow Policy',
      'Are you sure you want to delete this workflow transition policy?',
      async () => {
        try {
          await workflowTransitionPoliciesApi.delete(policyId, token);
          await loadWorkflowPolicies();
        } catch (err: any) {
          setError(err.message || 'Failed to delete workflow transition policy');
        }
      }
    );
  };

  if (isLoading) {
    return <div>Loading workflow transition policies...</div>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Validate required fields when moving tasks between statuses.</p>
        {canManage && (
          <button
            onClick={() => setShowPolicyModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Add Policy
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {workflowPolicies.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            No workflow transition policies configured yet.
          </div>
        ) : workflowPolicies.map((policy) => {
          const requiredFields = [
            policy.RequireDescription ? 'Description' : null,
            policy.RequireAssignee ? 'Assignee' : null,
            policy.RequireDueDate ? 'Due Date' : null,
            policy.RequireEstimatedHours ? 'Estimated Hours' : null,
            policy.RequireStoryPoints ? 'Story Points' : null,
            policy.RequirePlannedDates ? 'Planned Dates' : null,
          ].filter(Boolean);

          return (
            <div key={policy.Id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 dark:text-white">{policy.PolicyName}</span>
                  <span className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full">{policy.RuleType || 'Custom'}</span>
                  {!policy.IsActive && (
                    <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full">Inactive</span>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {policy.FromStatusName || `#${policy.FromStatusId}`} → {policy.ToStatusName || `#${policy.ToStatusId}`}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Required: {requiredFields.length > 0 ? requiredFields.join(', ') : 'None'}
                </div>
              </div>

              {canManage && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingPolicy(policy)}
                    title="Edit policy"
                    aria-label="Edit policy"
                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 px-3 py-1"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeletePolicy(policy.Id)}
                    title="Delete policy"
                    aria-label="Delete policy"
                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 px-3 py-1"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showPolicyModal && (
        <WorkflowPolicyModal
          orgId={orgId}
          taskStatuses={taskStatuses}
          onClose={() => setShowPolicyModal(false)}
          onSaved={() => {
            setShowPolicyModal(false);
            void loadWorkflowPolicies();
          }}
          token={token}
        />
      )}

      {editingPolicy && (
        <WorkflowPolicyModal
          orgId={orgId}
          taskStatuses={taskStatuses}
          policy={editingPolicy}
          onClose={() => setEditingPolicy(null)}
          onSaved={() => {
            setEditingPolicy(null);
            void loadWorkflowPolicies();
          }}
          token={token}
        />
      )}
    </div>
  );
}

function WorkflowPolicyModal({
  orgId,
  taskStatuses,
  policy,
  onClose,
  onSaved,
  token,
}: {
  orgId: number;
  taskStatuses: StatusValue[];
  policy?: WorkflowTransitionPolicy;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const [formData, setFormData] = useState<UpsertWorkflowTransitionPolicyData>({
    organizationId: orgId,
    fromStatusId: policy?.FromStatusId || 0,
    toStatusId: policy?.ToStatusId || 0,
    policyName: policy?.PolicyName || '',
    ruleType: policy?.RuleType || 'Custom',
    requireDescription: !!policy?.RequireDescription,
    requireAssignee: !!policy?.RequireAssignee,
    requireDueDate: !!policy?.RequireDueDate,
    requireEstimatedHours: !!policy?.RequireEstimatedHours,
    requireStoryPoints: !!policy?.RequireStoryPoints,
    requirePlannedDates: !!policy?.RequirePlannedDates,
    isActive: policy ? !!policy.IsActive : true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.fromStatusId || !formData.toStatusId) {
      setError('From status and to status are required');
      return;
    }

    setIsLoading(true);
    try {
      if (policy) {
        await workflowTransitionPoliciesApi.update(policy.Id, formData, token);
      } else {
        await workflowTransitionPoliciesApi.create(formData, token);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save workflow policy');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {policy ? 'Edit Workflow Policy' : 'Create Workflow Policy'}
            </h2>
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Policy Name</label>
              <input
                type="text"
                value={formData.policyName || ''}
                onChange={(e) => setFormData({ ...formData, policyName: e.target.value })}
                placeholder="e.g., DoD before Done"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Rule Type</label>
              <select
                value={formData.ruleType || 'Custom'}
                onChange={(e) => setFormData({ ...formData, ruleType: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="DoR">DoR</option>
                <option value="DoD">DoD</option>
                <option value="Custom">Custom</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">From Status *</label>
                <select
                  value={formData.fromStatusId || ''}
                  onChange={(e) => setFormData({ ...formData, fromStatusId: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Select status</option>
                  {taskStatuses.map((status) => (
                    <option key={status.Id} value={status.Id}>{status.StatusName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">To Status *</label>
                <select
                  value={formData.toStatusId || ''}
                  onChange={(e) => setFormData({ ...formData, toStatusId: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Select status</option>
                  {taskStatuses.map((status) => (
                    <option key={status.Id} value={status.Id}>{status.StatusName}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Required fields for this transition</p>

              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!formData.requireDescription}
                  onChange={(e) => setFormData({ ...formData, requireDescription: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                Description
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!formData.requireAssignee}
                  onChange={(e) => setFormData({ ...formData, requireAssignee: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                Assignee
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!formData.requireDueDate}
                  onChange={(e) => setFormData({ ...formData, requireDueDate: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                Due Date
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!formData.requireEstimatedHours}
                  onChange={(e) => setFormData({ ...formData, requireEstimatedHours: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                Estimated Hours
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!formData.requireStoryPoints}
                  onChange={(e) => setFormData({ ...formData, requireStoryPoints: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                Story Points
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!formData.requirePlannedDates}
                  onChange={(e) => setFormData({ ...formData, requirePlannedDates: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                Planned Start and End Dates
              </label>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={!!formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              Policy is active
            </label>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
              >
                {isLoading ? 'Saving...' : policy ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatusValueModal({ orgId, type, status, onClose, onSaved, token }: {
  orgId: number;
  type: 'project' | 'task' | 'priority' | 'type' | 'milestone-type' | 'ticket' | 'ticket-priority';
  status?: any;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const isPriority = type === 'priority' || type === 'ticket-priority';
  const isTaskType = type === 'type' || type === 'milestone-type';
  const isMilestoneType = type === 'milestone-type';
  const isTaskTypeOnly = type === 'type';
  const isTicketStatus = type === 'ticket';
  const STATUS_TYPE_OPTIONS = [
    { value: 'open',        label: 'Open — new tickets awaiting action' },
    { value: 'in_progress', label: 'In Progress — actively being worked' },
    { value: 'waiting',     label: 'Waiting — awaiting customer response' },
    { value: 'resolved',    label: 'Resolved — work done, pending confirmation' },
    { value: 'closed',      label: 'Closed — fully closed' },
    { value: 'other',       label: 'Other' },
  ];
  const [formData, setFormData] = useState<CreateStatusValueData & { statusType: string }>({
    organizationId: orgId,
    statusName: isPriority ? (status?.PriorityName || '') : isTaskType ? (status?.TypeName || '') : (status?.StatusName || ''),
    colorCode: status?.ColorCode || status?.Color || '#3b82f6',
    iconSvg: isMilestoneType
      ? (status?.IconSvg || 'flag')
      : isTaskTypeOnly
        ? resolveTaskTypeIcon(status?.IconSvg, status?.TypeName)
        : undefined,
    sortOrder: status?.SortOrder || 0,
    isDefault: !!status?.IsDefault,
    isClosed: !!status?.IsClosed,
    isCancelled: !!status?.IsCancelled,
    isInProgress: !!status?.IsInProgress,
    hideFromPlanningAndStatistics: !!status?.HideFromPlanningAndStatistics,
    statusType: status?.StatusType || 'other',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const ticketPayload = {
        organizationId: orgId,
        statusName: formData.statusName,
        priorityName: formData.statusName,
        color: formData.colorCode,
        sortOrder: formData.sortOrder,
        isDefault: formData.isDefault,
        isClosed: formData.isClosed,
        statusType: formData.statusType,
      };
      if (status) {
        if (type === 'project') {
          await statusValuesApi.updateProjectStatus(status.Id, formData, token);
        } else if (type === 'task') {
          await statusValuesApi.updateTaskStatus(status.Id, formData, token);
        } else if (type === 'priority') {
          await statusValuesApi.updateTaskPriority(status.Id, formData, token);
        } else if (type === 'type') {
          await statusValuesApi.updateTaskType(status.Id, { ...formData, typeName: formData.statusName }, token);
        } else if (type === 'milestone-type') {
          await statusValuesApi.updateMilestoneType(status.Id, { ...formData, typeName: formData.statusName }, token);
        } else {
          const endpoint = type === 'ticket' ? 'ticket' : 'ticket-priority';
          const res = await fetch(`${getApiUrl()}/api/status-values/${endpoint}/${status.Id}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(ticketPayload),
          });
          if (!res.ok) throw new Error('Failed to update');
        }
      } else {
        if (type === 'project') {
          await statusValuesApi.createProjectStatus(formData, token);
        } else if (type === 'task') {
          await statusValuesApi.createTaskStatus(formData, token);
        } else if (type === 'priority') {
          await statusValuesApi.createTaskPriority(formData, token);
        } else if (type === 'type') {
          await statusValuesApi.createTaskType({ ...formData, typeName: formData.statusName }, token);
        } else if (type === 'milestone-type') {
          await statusValuesApi.createMilestoneType({ ...formData, typeName: formData.statusName }, token);
        } else {
          const endpoint = type === 'ticket' ? 'ticket' : 'ticket-priority';
          const res = await fetch(`${getApiUrl()}/api/status-values/${endpoint}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(ticketPayload),
          });
          if (!res.ok) throw new Error('Failed to create');
        }
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save ' + (isPriority ? 'priority' : isTaskType ? 'type value' : 'status value'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-h-[90vh] overflow-y-auto ${isTaskTypeOnly ? 'max-w-xl' : 'max-w-md'}`}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {status ? 'Edit' : 'Create'} {type === 'ticket-priority' ? 'Ticket Priority' : type === 'ticket' ? 'Ticket Status' : type === 'priority' ? 'Task Priority' : type === 'type' ? 'Task Type' : type === 'milestone-type' ? 'Milestone Type' : type === 'project' ? 'Project Status' : 'Task Status'}
            </h2>
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
                {isPriority ? 'Priority' : isTaskType ? 'Type' : 'Status'} Name *
              </label>
              <input
                type="text"
                value={formData.statusName}
                onChange={(e) => setFormData({ ...formData, statusName: e.target.value })}
                required
                placeholder={isPriority ? 'e.g., Critical, High, Medium, Low' : isTaskType ? 'e.g., Feature, Bug, Improvement, Chore' : ''}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Color
              </label>
              <input
                type="color"
                value={formData.colorCode}
                onChange={(e) => setFormData({ ...formData, colorCode: e.target.value })}
                className="w-full h-10 px-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700"
              />
            </div>

            {isTaskTypeOnly && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Icon
                </label>
                <TaskTypeIconPicker
                  value={formData.iconSvg || ''}
                  color={formData.colorCode}
                  onChange={(iconId) => setFormData({ ...formData, iconSvg: iconId })}
                />
              </div>
            )}

            {isMilestoneType && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  SVG Icon
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {MILESTONE_TYPE_ICON_OPTIONS.map((iconOption) => {
                    const selected = (formData.iconSvg || 'flag') === iconOption.value;
                    return (
                      <button
                        key={iconOption.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, iconSvg: iconOption.value })}
                        className={`h-10 rounded-lg border inline-flex items-center justify-center transition-colors ${
                          selected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                        style={formData.colorCode ? { color: formData.colorCode } : undefined}
                        title={iconOption.label}
                        aria-label={iconOption.label}
                      >
                        {renderMilestoneTypeIcon(iconOption.value, 'w-5 h-5')}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Sort Order
              </label>
              <input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Set as default {isPriority ? 'priority' : isTaskType ? 'type' : 'status'}</span>
            </label>

            {!isPriority && !isTaskType && (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isClosed}
                    onChange={(e) => setFormData({ ...formData, isClosed: e.target.checked })}
                    className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Mark as closed status</span>
                </label>

                {type !== 'ticket' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isCancelled}
                      onChange={(e) => setFormData({ ...formData, isCancelled: e.target.checked })}
                      className="w-4 h-4 text-red-600 rounded focus:ring-2 focus:ring-red-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Mark as cancelled status</span>
                  </label>
                )}

                {type === 'task' && (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!formData.isInProgress}
                      onChange={(e) => setFormData({ ...formData, isInProgress: e.target.checked })}
                      className="w-4 h-4 mt-0.5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      <span className="font-medium">In Progress status</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Used by the IDE Kanban “Send to AI” action when no explicit status Id is set in editor settings.
                      </span>
                    </span>
                  </label>
                )}

                {type === 'task' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!formData.hideFromPlanningAndStatistics}
                      onChange={(e) => setFormData({ ...formData, hideFromPlanningAndStatistics: e.target.checked })}
                      className="w-4 h-4 text-slate-600 rounded focus:ring-2 focus:ring-slate-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Hide from planning and statistics</span>
                  </label>
                )}

                {isTicketStatus && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Status Type <span className="text-xs text-gray-500">(used for statistics & automation)</span>
                    </label>
                    <select
                      value={formData.statusType}
                      onChange={(e) => setFormData({ ...formData, statusType: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      {STATUS_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

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
                {isLoading ? 'Saving...' : status ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Projects Tab Component
function ProjectsTab({ orgId, canManage, token }: { orgId: number; canManage: boolean; token: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [transferringProject, setTransferringProject] = useState<Project | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<number>(0);
  const router = useRouter();

  useEffect(() => {
    loadProjects();
    if (canManage) {
      loadOrganizations();
    }
  }, [orgId]);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      const response = await projectsApi.getAll(token);
      // Filter to only projects in this organization
      const orgProjects = response.projects.filter(p => p.OrganizationId === orgId);
      setProjects(orgProjects);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrganizations = async () => {
    try {
      const response = await organizationsApi.getAll(token);
      // Filter to only organizations where user has admin/owner role, excluding current org
      const adminOrgs = response.organizations.filter(
        org => (org.Role === 'Owner' || org.Role === 'Admin') && org.Id !== orgId
      );
      setOrganizations(adminOrgs);
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
    }
  };

  const handleTransfer = async () => {
    if (!transferringProject || !selectedOrgId) return;

    try {
      await projectsApi.transfer(transferringProject.Id, selectedOrgId, token);
      setTransferringProject(null);
      setSelectedOrgId(0);
      await loadProjects();
    } catch (err: any) {
      setError(err.message || 'Failed to transfer project');
    }
  };

  if (isLoading) {
    return <div className="text-center py-4">Loading projects...</div>;
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div className="text-gray-500 dark:text-gray-400">No projects in this organization</div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Project Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Created By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Created At
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {projects.map((project) => (
                <tr key={project.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {project.ProjectName}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full" style={{ backgroundColor: project.StatusColor ? `${project.StatusColor}20` : undefined, color: project.StatusColor || undefined }}>
                      {project.StatusName || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {project.CreatorName || `User ${project.CreatedBy}`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(project.CreatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => router.push(`/projects/${project.Id}`)}
                      title="View project"
                      aria-label="View project"
                      className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5s8.268 2.943 9.542 7c-1.274 4.057-5.065 7-9.542 7S3.732 16.057 2.458 12z" />
                      </svg>
                    </button>
                    {canManage && organizations.length > 0 && (
                      <button
                        onClick={() => setTransferringProject(project)}
                        title="Transfer project"
                        aria-label="Transfer project"
                        className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h11m0 0l-3-3m3 3l-3 3M16 17H5m0 0l3-3m-3 3l3 3" />
                        </svg>
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

      {/* Transfer Project Modal */}
      {transferringProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Transfer Project
            </h3>
            
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Transfer "{transferringProject.ProjectName}" to another organization
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Destination Organization
              </label>
              <select
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="0">Select Organization</option>
                {organizations.map((org) => (
                  <option key={org.Id} value={org.Id}>
                    {org.Name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 mb-6">
              <p className="text-sm text-yellow-800 dark:text-yellow-400">
                ⚠️ This will change project access permissions. Only members of the destination organization will be able to access this project.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setTransferringProject(null);
                  setSelectedOrgId(0);
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleTransfer}
                disabled={!selectedOrgId}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Transfer Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tags Tab Component
interface Tag {
  Id: number;
  Name: string;
  Color: string;
  Description?: string;
  CreatedAt: string;
}

const clampTagColorChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const normalizeTagHexColor = (color: string | undefined): string => {
  const fallback = '#6B7280';
  if (!color) return fallback;
  const trimmed = color.trim();
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex.split('').map((char) => char + char).join('')}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex}`;
  }

  return fallback;
};

const tagHexToRgb = (color: string): { r: number; g: number; b: number } => {
  const normalized = normalizeTagHexColor(color);
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
};

const tagRgbToHex = ({ r, g, b }: { r: number; g: number; b: number }): string => {
  const toHex = (value: number) => clampTagColorChannel(value).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const blendTagHexColors = (baseColor: string, mixColor: string, ratio: number): string => {
  const base = tagHexToRgb(baseColor);
  const mix = tagHexToRgb(mixColor);
  const mixRatio = Math.max(0, Math.min(1, ratio));
  const baseRatio = 1 - mixRatio;

  return tagRgbToHex({
    r: base.r * baseRatio + mix.r * mixRatio,
    g: base.g * baseRatio + mix.g * mixRatio,
    b: base.b * baseRatio + mix.b * mixRatio,
  });
};

const withTagAlpha = (color: string, alphaHex: string): string => `${normalizeTagHexColor(color)}${alphaHex}`;

function TagsTab({
  orgId,
  canManage,
  token,
  showConfirm
}: {
  orgId: number;
  canManage: boolean;
  token: string;
  showConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: {
      confirmLabel?: string;
      confirmVariant?: 'primary' | 'danger';
    }
  ) => void;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    color: '#6B7280',
    description: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isImportingDefaults, setIsImportingDefaults] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTags();
  }, [orgId]);

  const loadTags = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${getApiUrl()}/api/tags/organization/${orgId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setTags(data.tags || []);
      }
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingTag(null);
    setFormData({ name: '', color: '#6B7280', description: '' });
    setError('');
    setShowModal(true);
  };

  const openEditModal = (tag: Tag) => {
    setEditingTag(tag);
    setFormData({
      name: tag.Name,
      color: tag.Color,
      description: tag.Description || ''
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Tag name is required');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const url = editingTag
        ? `${getApiUrl()}/api/tags/${editingTag.Id}`
        : `${getApiUrl()}/api/tags`;

      const response = await fetch(url, {
        method: editingTag ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: orgId,
          name: formData.name.trim(),
          color: formData.color,
          description: formData.description.trim() || null
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to save tag');
      }

      setShowModal(false);
      loadTags();
    } catch (err: any) {
      setError(err.message || 'Failed to save tag');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (tag: Tag) => {
    showConfirm(
      'Delete Tag',
      `Are you sure you want to delete the tag "${tag.Name}"? This will remove it from all tasks.`,
      async () => {
        try {
          const response = await fetch(
            `${getApiUrl()}/api/tags/${tag.Id}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            }
          );

          if (response.ok) {
            loadTags();
          }
        } catch (err) {
          console.error('Failed to delete tag:', err);
        }
      }
    );
  };

  const handleImportDefaults = async () => {
    showConfirm(
      'Import Default Tags',
      'Import the default slash-based tag presets into this organization? Existing tags with the same name will be skipped.',
      async () => {
        setIsImportingDefaults(true);
        setError('');

        try {
          const response = await fetch(
            `${getApiUrl()}/api/tags/organization/${orgId}/import-defaults`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.message || 'Failed to import default tags');
          }

          await loadTags();
        } catch (err: any) {
          setError(err.message || 'Failed to import default tags');
        } finally {
          setIsImportingDefaults(false);
        }
      },
      {
        confirmLabel: 'Import',
        confirmVariant: 'primary',
      }
    );
  };

  const colorPresets = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
    '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
    '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
    '#EC4899', '#F43F5E', '#6B7280', '#374151', '#1F2937'
  ];

  const renderSegmentedTagPreview = (tag: { Id: number; Name: string; Color: string }) => {
    const segments = tag.Name
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    const baseColor = normalizeTagHexColor(tag.Color);

    if (segments.length <= 1) {
      return (
        <span
          className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-md border"
          style={{
            backgroundColor: withTagAlpha(baseColor, '20'),
            color: baseColor,
            borderColor: withTagAlpha(baseColor, '55'),
          }}
        >
          {segments[0] || tag.Name}
        </span>
      );
    }

    return (
      <span className="inline-flex items-stretch overflow-hidden rounded-md border" style={{ borderColor: withTagAlpha(baseColor, '66') }}>
        {segments.map((segment, index) => {
          const segmentBackground = index === 0
            ? blendTagHexColors(baseColor, '#111827', 0.18)
            : index === segments.length - 1
              ? baseColor
              : blendTagHexColors(baseColor, '#ffffff', 0.12 * index);

          const segmentTextColor = index === 0
            ? blendTagHexColors(baseColor, '#ffffff', 0.72)
            : '#ffffff';

          return (
            <span
              key={`${tag.Id}-${segment}-${index}`}
              className="px-2.5 py-1 text-xs font-semibold leading-none"
              style={{
                backgroundColor: segmentBackground,
                color: segmentTextColor,
                borderLeft: index === 0 ? 'none' : `1px solid ${withTagAlpha(baseColor, '88')}`,
              }}
            >
              {segment}
            </span>
          );
        })}
      </span>
    );
  };

  if (isLoading) {
    return <div className="text-gray-500 dark:text-gray-400">Loading tags...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Tags</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage tags for organizing and categorizing tasks
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleImportDefaults}
              disabled={isImportingDefaults}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-500 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m14.836 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.356-2m15.356 2H15" />
              </svg>
              {isImportingDefaults ? 'Importing...' : 'Import Default Tags'}
            </button>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Tag
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {tags.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <div className="text-4xl mb-4">🏷️</div>
          <p>No tags created yet.</p>
          {canManage && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                onClick={handleImportDefaults}
                disabled={isImportingDefaults}
                className="text-gray-900 dark:text-gray-100 hover:underline disabled:opacity-60"
              >
                {isImportingDefaults ? 'Importing defaults...' : 'Import default tags'}
              </button>
              <button
                onClick={openCreateModal}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Create your first tag
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map((tag) => (
            <div
              key={tag.Id}
              className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div>
                  <div className="mb-2">{renderSegmentedTagPreview(tag)}</div>
                  {tag.Description && (() => {
                    const plainText = tag.Description.replace(/<[^>]*>/g, '').trim();
                    return plainText ? (
                      <div className="text-xs text-gray-300 dark:text-gray-400">{plainText}</div>
                    ) : null;
                  })()}
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(tag)}
                    className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                    title="Edit tag"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(tag)}
                    className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                    title="Delete tag"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Tag Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                {editingTag ? 'Edit Tag' : 'Create Tag'}
              </h3>

              {error && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tag Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="e.g., Kind/Bug, Reviewed/Confirmed, Status/Blocked"
                    maxLength={50}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Use <span className="font-semibold">/</span> to create segmented labels visually, for example <span className="font-semibold">Kind/Bug</span>.
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Color
                  </label>
                  <div className="flex items-center gap-3 mb-2">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-10 h-10 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      placeholder="#6B7280"
                    />
                    <span
                      className="px-3 py-1 rounded-full text-sm font-medium"
                      style={{ backgroundColor: formData.color + '20', color: formData.color, border: `1px solid ${formData.color}` }}
                    >
                      Preview
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {colorPresets.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${formData.color === color ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Brief description of when to use this tag"
                    maxLength={255}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                  >
                    {isSaving ? 'Saving...' : (editingTag ? 'Save Changes' : 'Create Tag')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// GitHub Integration Card Component
function GitHubIntegrationCard({
  integration,
  token,
  orgId,
  onUpdate,
  setError,
  setSuccess
}: {
  integration: any;
  token: string;
  orgId: number;
  onUpdate: () => void;
  setError: (error: string) => void;
  setSuccess: (success: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const gitHubTokenRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    isEnabled: true,
    gitHubUrl: '',
  });

  useEffect(() => {
    if (integration) {
      setFormData({
        isEnabled: integration.IsEnabled === 1,
        gitHubUrl: integration.GitHubUrl || '',
      });
      clearPasswordInput(gitHubTokenRef);
    }
  }, [integration]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        `${getApiUrl()}/api/github-integrations/organization/${orgId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            isEnabled: formData.isEnabled,
            gitHubUrl: formData.gitHubUrl,
            gitHubToken: readPasswordInput(gitHubTokenRef),
          })
        }
      );

      const data = await response.json();

      if (response.ok) {
        clearPasswordInput(gitHubTokenRef);
        setSuccess('GitHub integration saved successfully');
        setShowForm(false);
        onUpdate();
      } else {
        setError(data.message || 'Failed to save GitHub integration');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save GitHub integration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/github-integrations/organization/${orgId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        setSuccess('GitHub integration removed successfully');
        onUpdate();
      } else {
        setError('Failed to delete GitHub integration');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete GitHub integration');
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="text-5xl">🐙</div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">GitHub Integration</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Import GitHub issues as tasks
              </p>
            </div>
          </div>
          {integration && (
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              integration.IsEnabled 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
            }`}>
              {integration.IsEnabled ? '✓ Active' : 'Inactive'}
            </div>
          )}
        </div>

        {!integration && !showForm ? (
          <div className="text-center py-8">
            <div className="text-gray-400 dark:text-gray-500 text-6xl mb-4">🐙</div>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              GitHub integration is not configured for this organization.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors"
            >
              🔗 Configure GitHub
            </button>
          </div>
        ) : integration && !showForm ? (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">GitHub URL:</span>{' '}
                  <span className="font-medium text-gray-900 dark:text-white">{integration.GitHubUrl}</span>
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400">
              Last Updated: <span className="text-gray-900 dark:text-white">{new Date(integration.UpdatedAt).toLocaleDateString()}</span>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-400">
                ℹ️ Repository configuration is set per project in Project Settings
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors"
              >
                ✏️ Edit Configuration
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                🗑️ Remove Integration
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                GitHub URL {!integration && <span className="text-red-500">*</span>}
              </label>
              <input
                type="url"
                value={formData.gitHubUrl}
                onChange={(e) => setFormData({ ...formData, gitHubUrl: e.target.value })}
                placeholder="https://api.github.com"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500"
                required={!integration}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Use https://api.github.com for GitHub.com or your GitHub Enterprise API URL
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Personal Access Token {!integration && <span className="text-red-500">*</span>}
              </label>
              <PasswordInput
                ref={gitHubTokenRef}
                name="gitHubToken"
                placeholder={integration ? "Leave empty to keep current token" : "ghp_xxxxxxxxxxxxxxxxxxxx"}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500"
                required={!integration}
                autoComplete="new-password"
                preventAutofill
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Token with 'repo' access to read issues and repositories
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-400">
                ℹ️ Repository owner and name will be configured per project in Project Settings
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="githubEnabled"
                checked={formData.isEnabled}
                onChange={(e) => setFormData({ ...formData, isEnabled: e.target.checked })}
                className="w-4 h-4 text-gray-600 bg-gray-100 border-gray-300 rounded focus:ring-gray-500"
              />
              <label htmlFor="githubEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable GitHub integration
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white rounded-lg transition-colors"
              >
                {isSaving ? 'Saving...' : '💾 Save Integration'}
              </button>
              {integration && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormData({
                      isEnabled: integration.IsEnabled === 1,
                      gitHubUrl: integration.GitHubUrl || '',
                    });
                    clearPasswordInput(gitHubTokenRef);
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
    {showDeleteConfirm && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
          <div className="p-6">
            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">Remove GitHub Integration</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to remove the GitHub integration?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// Gitea Integration Card Component
function GiteaIntegrationCard({
  integration,
  token,
  orgId,
  onUpdate,
  setError,
  setSuccess
}: {
  integration: any;
  token: string;
  orgId: number;
  onUpdate: () => void;
  setError: (error: string) => void;
  setSuccess: (success: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const giteaTokenRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    isEnabled: true,
    giteaUrl: '',
  });

  useEffect(() => {
    if (integration) {
      setFormData({
        isEnabled: integration.IsEnabled === 1,
        giteaUrl: integration.GiteaUrl || '',
      });
      clearPasswordInput(giteaTokenRef);
    }
  }, [integration]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        `${getApiUrl()}/api/gitea-integrations/organization/${orgId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            isEnabled: formData.isEnabled,
            giteaUrl: formData.giteaUrl,
            giteaToken: readPasswordInput(giteaTokenRef),
          })
        }
      );

      const data = await response.json();

      if (response.ok) {
        clearPasswordInput(giteaTokenRef);
        setSuccess('Gitea integration saved successfully');
        setShowForm(false);
        onUpdate();
      } else {
        setError(data.message || 'Failed to save Gitea integration');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save Gitea integration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/gitea-integrations/organization/${orgId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        setSuccess('Gitea integration removed successfully');
        onUpdate();
      } else {
        setError('Failed to delete Gitea integration');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete Gitea integration');
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="text-5xl">🍵</div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Gitea Integration</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Import Gitea issues as tasks
              </p>
            </div>
          </div>
          {integration && (
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              integration.IsEnabled 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
            }`}>
              {integration.IsEnabled ? '✓ Active' : 'Inactive'}
            </div>
          )}
        </div>

        {!integration && !showForm ? (
          <div className="text-center py-8">
            <div className="text-gray-400 dark:text-gray-500 text-6xl mb-4">🍵</div>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Gitea integration is not configured for this organization.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              🔗 Configure Gitea
            </button>
          </div>
        ) : integration && !showForm ? (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Gitea URL:</span>{' '}
                  <span className="font-medium text-gray-900 dark:text-white">{integration.GiteaUrl}</span>
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400">
              Last Updated: <span className="text-gray-900 dark:text-white">{new Date(integration.UpdatedAt).toLocaleDateString()}</span>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-400">
                ℹ️ Repository configuration is set per project in Project Settings
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                ✏️ Edit Configuration
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                🗑️ Remove Integration
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Gitea URL {!integration && <span className="text-red-500">*</span>}
              </label>
              <input
                type="url"
                value={formData.giteaUrl}
                onChange={(e) => setFormData({ ...formData, giteaUrl: e.target.value })}
                placeholder="https://gitea.example.com"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
                required={!integration}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Your Gitea instance URL (e.g., https://gitea.example.com)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Access Token {!integration && <span className="text-red-500">*</span>}
              </label>
              <PasswordInput
                ref={giteaTokenRef}
                name="giteaToken"
                placeholder={integration ? "Leave empty to keep current token" : "Your Gitea access token"}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
                required={!integration}
                autoComplete="new-password"
                preventAutofill
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Token with read access to repositories and issues (Settings → Applications → Generate New Token)
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-400">
                ℹ️ Repository owner and name will be configured per project in Project Settings
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="giteaEnabled"
                checked={formData.isEnabled}
                onChange={(e) => setFormData({ ...formData, isEnabled: e.target.checked })}
                className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500"
              />
              <label htmlFor="giteaEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable Gitea integration
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
              >
                {isSaving ? 'Saving...' : '💾 Save Integration'}
              </button>
              {integration && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormData({
                      isEnabled: integration.IsEnabled === 1,
                      giteaUrl: integration.GiteaUrl || '',
                    });
                    clearPasswordInput(giteaTokenRef);
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
    {showDeleteConfirm && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
          <div className="p-6">
            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">Remove Gitea Integration</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to remove the Gitea integration?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// Bitbucket Integration Card Component
function BitbucketIntegrationCard({
  integration,
  token,
  orgId,
  onUpdate,
  setError,
  setSuccess
}: {
  integration: any;
  token: string;
  orgId: number;
  onUpdate: () => void;
  setError: (error: string) => void;
  setSuccess: (success: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const bitbucketTokenRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    isEnabled: true,
    bitbucketUrl: '',
    bitbucketUsername: '',
  });

  useEffect(() => {
    if (integration) {
      setFormData({
        isEnabled: integration.IsEnabled === 1,
        bitbucketUrl: integration.BitbucketUrl || '',
        bitbucketUsername: integration.BitbucketUsername || '',
      });
      clearPasswordInput(bitbucketTokenRef);
    }
  }, [integration]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        `${getApiUrl()}/api/bitbucket-integrations/organization/${orgId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            isEnabled: formData.isEnabled,
            bitbucketUrl: formData.bitbucketUrl,
            bitbucketUsername: formData.bitbucketUsername || null,
            bitbucketToken: readPasswordInput(bitbucketTokenRef),
          })
        }
      );

      const data = await response.json();

      if (response.ok) {
        clearPasswordInput(bitbucketTokenRef);
        setSuccess('Bitbucket integration saved successfully');
        setShowForm(false);
        onUpdate();
      } else {
        setError(data.message || 'Failed to save Bitbucket integration');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save Bitbucket integration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/bitbucket-integrations/organization/${orgId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        setSuccess('Bitbucket integration removed successfully');
        onUpdate();
      } else {
        setError('Failed to delete Bitbucket integration');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete Bitbucket integration');
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="text-5xl">🪣</div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Bitbucket Integration</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Read commit history from Bitbucket Cloud or Server (API tokens)
              </p>
            </div>
          </div>
          {integration && (
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              integration.IsEnabled
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
            }`}>
              {integration.IsEnabled ? '✓ Active' : 'Inactive'}
            </div>
          )}
        </div>

        {!integration && !showForm ? (
          <div className="text-center py-8">
            <div className="text-gray-400 dark:text-gray-500 text-6xl mb-4">🪣</div>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Bitbucket integration is not configured for this organization.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Configure Bitbucket
            </button>
          </div>
        ) : integration && !showForm ? (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-900/20 rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Bitbucket URL:</span>{' '}
                  <span className="font-medium text-gray-900 dark:text-white">{integration.BitbucketUrl}</span>
                </div>
                {integration.BitbucketUsername && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Atlassian email:</span>{' '}
                    <span className="font-medium text-gray-900 dark:text-white">{integration.BitbucketUsername}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400">
              Last Updated: <span className="text-gray-900 dark:text-white">{new Date(integration.UpdatedAt).toLocaleDateString()}</span>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-400">
                Repository URL is set on each Application. For Cloud, use an Atlassian API token (app passwords are discontinued).
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Edit Configuration
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Remove Integration
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Bitbucket URL {!integration && <span className="text-red-500">*</span>}
              </label>
              <input
                type="url"
                value={formData.bitbucketUrl}
                onChange={(e) => setFormData({ ...formData, bitbucketUrl: e.target.value })}
                placeholder="https://bitbucket.org"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                required={!integration}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Use https://bitbucket.org for Cloud, or your Bitbucket Server / Data Center base URL
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Atlassian account email (Cloud) {!integration && <span className="text-red-500">*</span>}
              </label>
              <input
                type="email"
                value={formData.bitbucketUsername}
                onChange={(e) => setFormData({ ...formData, bitbucketUsername: e.target.value })}
                placeholder="you@company.com"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Required for Bitbucket Cloud API tokens. Use your Atlassian email — not your Bitbucket username.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API token {!integration && <span className="text-red-500">*</span>}
              </label>
              <PasswordInput
                ref={bitbucketTokenRef}
                name="bitbucketToken"
                placeholder={integration ? 'Leave empty to keep current token' : 'Atlassian API token for Bitbucket'}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                required={!integration}
                autoComplete="new-password"
                preventAutofill
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Create at Atlassian account → Security → API tokens (select Bitbucket, scopes include repository read).
                App passwords are discontinued and will return 401.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="bitbucketEnabled"
                checked={formData.isEnabled}
                onChange={(e) => setFormData({ ...formData, isEnabled: e.target.checked })}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="bitbucketEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable Bitbucket integration
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Integration'}
              </button>
              {integration && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormData({
                      isEnabled: integration.IsEnabled === 1,
                      bitbucketUrl: integration.BitbucketUrl || '',
                      bitbucketUsername: integration.BitbucketUsername || '',
                    });
                    clearPasswordInput(bitbucketTokenRef);
                  }}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
    {showDeleteConfirm && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
          <div className="p-6">
            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">Remove Bitbucket Integration</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to remove the Bitbucket integration?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// Integrations Tab Component
function IntegrationsTab({ orgId, token }: { orgId: number; token: string }) {
  const { showToast } = useToast();
  const [integration, setIntegration] = useState<any>(null);
  const [githubIntegration, setGithubIntegration] = useState<any>(null);
  const [giteaIntegration, setGiteaIntegration] = useState<any>(null);
  const [bitbucketIntegration, setBitbucketIntegration] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const jiraApiTokenRef = useRef<HTMLInputElement>(null);
  const jiraProjectsApiTokenRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    isEnabled: true,
    jiraUrl: '',
    jiraEmail: '',
    jiraProjectKey: '',
    jiraTicketsJqlFilter: '',
    hideIntegratedJiraTicketsByDefault: false,
    jiraProjectsUrl: '',
    jiraProjectsEmail: '',
  });

  const setSuccessWithToast = (message: string, title = 'Success') => {
    setSuccess(message);
    showToast({ type: 'success', title, message });
  };

  useEffect(() => {
    loadIntegration();
  }, [orgId]);

  const loadIntegration = async () => {
    setIsLoading(true);
    setError('');
    try {
      // Load Jira integration
      const jiraResponse = await fetch(
        `${getApiUrl()}/api/jira-integrations/organization/${orgId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (jiraResponse.ok) {
        const data = await jiraResponse.json();
        if (data.integration) {
          setIntegration(data.integration);
          setFormData({
            isEnabled: data.integration.IsEnabled === 1,
            jiraUrl: data.integration.JiraUrl || '',
            jiraEmail: data.integration.JiraEmail || '',
            jiraProjectKey: data.integration.JiraProjectKey || '',
            jiraTicketsJqlFilter: data.integration.JiraTicketsJqlFilter || '',
            hideIntegratedJiraTicketsByDefault: data.integration.HideIntegratedJiraTicketsByDefault === 1,
            jiraProjectsUrl: data.integration.JiraProjectsUrl || '',
            jiraProjectsEmail: data.integration.JiraProjectsEmail || '',
          });
          clearPasswordInput(jiraApiTokenRef);
          clearPasswordInput(jiraProjectsApiTokenRef);
        }
      }

      // Load GitHub integration
      const githubResponse = await fetch(
        `${getApiUrl()}/api/github-integrations/organization/${orgId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (githubResponse.ok) {
        const githubData = await githubResponse.json();
        if (githubData.integration) {
          setGithubIntegration(githubData.integration);
        }
      }

      // Load Gitea integration
      const giteaResponse = await fetch(
        `${getApiUrl()}/api/gitea-integrations/organization/${orgId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (giteaResponse.ok) {
        const giteaData = await giteaResponse.json();
        if (giteaData.integration) {
          setGiteaIntegration(giteaData.integration);
        }
      }

      const bitbucketResponse = await fetch(
        `${getApiUrl()}/api/bitbucket-integrations/organization/${orgId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (bitbucketResponse.ok) {
        const bitbucketData = await bitbucketResponse.json();
        setBitbucketIntegration(bitbucketData.integration || null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load integrations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    const jiraApiToken = readPasswordInput(jiraApiTokenRef);
    if (!formData.jiraUrl || !formData.jiraEmail || !jiraApiToken) {
      setError('Please fill in Jira for Tickets fields to test connection');
      return;
    }

    setIsTesting(true);
    setError('');
    setSuccess('');

    try {
      const results: string[] = [];
      const errors: string[] = [];

      // Test Jira for Tickets
      try {
        const response = await fetch(
          `${getApiUrl()}/api/jira-integrations/organization/${orgId}/test`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jiraUrl: formData.jiraUrl,
              jiraEmail: formData.jiraEmail,
              jiraApiToken,
            })
          }
        );

        const data = await response.json();

        if (response.ok) {
          results.push(`✅ Jira Tickets: Connected as ${data.jiraUser}`);
        } else {
          errors.push(`❌ Jira Tickets: ${data.message || 'Connection failed'}`);
        }
      } catch (err: any) {
        errors.push(`❌ Jira Tickets: ${err.message || 'Connection failed'}`);
      }

      // Test Jira for Projects if configured
      const jiraProjectsApiToken = readPasswordInput(jiraProjectsApiTokenRef);
      if (formData.jiraProjectsUrl && formData.jiraProjectsEmail && jiraProjectsApiToken) {
        try {
          const response = await fetch(
            `${getApiUrl()}/api/jira-integrations/organization/${orgId}/test`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jiraUrl: formData.jiraProjectsUrl,
                jiraEmail: formData.jiraProjectsEmail,
                jiraApiToken: jiraProjectsApiToken,
              })
            }
          );

          const data = await response.json();

          if (response.ok) {
            results.push(`✅ Jira Projects: Connected as ${data.jiraUser}`);
          } else {
            errors.push(`❌ Jira Projects: ${data.message || 'Connection failed'}`);
          }
        } catch (err: any) {
          errors.push(`❌ Jira Projects: ${err.message || 'Connection failed'}`);
        }
      }

      // Show combined results
      if (errors.length > 0) {
        setError(errors.join('\n'));
        if (results.length > 0) {
          setSuccessWithToast(results.join('\n'), 'Connection Test');
        }
      } else if (results.length > 0) {
        setSuccessWithToast(results.join('\n'), 'Connection Test');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to test connection');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.jiraUrl || !formData.jiraEmail) {
      setError('Please fill in all required fields');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(
        `${getApiUrl()}/api/jira-integrations/organization/${orgId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...formData,
            jiraApiToken: readPasswordInput(jiraApiTokenRef),
            jiraProjectsApiToken: readPasswordInput(jiraProjectsApiTokenRef),
          })
        }
      );

      const data = await response.json();

      if (response.ok) {
        clearPasswordInput(jiraApiTokenRef);
        clearPasswordInput(jiraProjectsApiTokenRef);
        setSuccessWithToast('Jira integration saved successfully', 'Integration Saved');
        setShowForm(false);
        loadIntegration();
      } else {
        setError(data.message || 'Failed to save integration');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save integration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/jira-integrations/organization/${orgId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        setSuccessWithToast('Integration removed successfully', 'Integration Removed');
        setIntegration(null);
        setFormData({
          isEnabled: true,
          jiraUrl: '',
          jiraEmail: '',
          jiraProjectKey: '',
          jiraTicketsJqlFilter: '',
          hideIntegratedJiraTicketsByDefault: false,
          jiraProjectsUrl: '',
          jiraProjectsEmail: '',
        });
        clearPasswordInput(jiraApiTokenRef);
        clearPasswordInput(jiraProjectsApiTokenRef);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete integration');
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Connect external services to enhance your organization's workflow
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg whitespace-pre-line">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Jira Integration Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="text-5xl">🔷</div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Jira Integration</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connect your Jira instance to link external tickets
                </p>
              </div>
            </div>
            {integration && (
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                integration.IsEnabled 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'
              }`}>
                {integration.IsEnabled ? '✓ Active' : 'Inactive'}
              </div>
            )}
          </div>

          {integration && !showForm ? (
            <div className="space-y-4">
              {/* Jira for Tickets */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">🔷 Jira for Tickets</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Jira URL</div>
                    <div className="font-medium text-gray-900 dark:text-white">{integration.JiraUrl}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Email</div>
                    <div className="font-medium text-gray-900 dark:text-white">{integration.JiraEmail}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Project Key</div>
                    <div className="font-medium text-gray-900 dark:text-white">{integration.JiraProjectKey || 'Not specified'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Base JQL Filter</div>
                    <div className="font-medium text-gray-900 dark:text-white break-words">{integration.JiraTicketsJqlFilter || 'Not specified'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Hide integrated tickets by default</div>
                    <div className="font-medium text-gray-900 dark:text-white">{integration.HideIntegratedJiraTicketsByDefault ? 'Yes' : 'No'}</div>
                  </div>
                </div>
              </div>

              {/* Jira for Projects */}
              {integration.JiraProjectsUrl && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-3">🟢 Jira for Projects / Kanban</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Jira Projects URL</div>
                      <div className="font-medium text-gray-900 dark:text-white">{integration.JiraProjectsUrl}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Email</div>
                      <div className="font-medium text-gray-900 dark:text-white">{integration.JiraProjectsEmail || 'Not specified'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Last Updated */}
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Last Updated: <span className="text-gray-900 dark:text-white">{new Date(integration.UpdatedAt).toLocaleDateString()}</span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowForm(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  ✏️ Edit Configuration
                </button>
                <button
                      onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  🗑️ Remove Integration
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              {/* Jira for Tickets Section */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
                  </svg>
                  Jira for Tickets
                </h3>
                <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Jira URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={formData.jiraUrl}
                    onChange={(e) => setFormData({ ...formData, jiraUrl: e.target.value })}
                    placeholder="https://your-domain.atlassian.net"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.jiraEmail}
                    onChange={(e) => setFormData({ ...formData, jiraEmail: e.target.value })}
                    placeholder="your-email@company.com"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    API Token {!integration && <span className="text-red-500">*</span>}
                  </label>
                  <PasswordInput
                    ref={jiraApiTokenRef}
                    name="jiraApiToken"
                    placeholder={integration ? 'Leave empty to keep current token' : 'Your Jira API Token'}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    required={!integration}
                    autoComplete="new-password"
                    preventAutofill
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Create an API token at: <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Atlassian Account</a>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Project Key (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.jiraProjectKey}
                    onChange={(e) => setFormData({ ...formData, jiraProjectKey: e.target.value })}
                    placeholder="PROJ"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Limit search to specific project
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Jira Tickets Base JQL (optional)
                  </label>
                  <textarea
                    value={formData.jiraTicketsJqlFilter}
                    onChange={(e) => setFormData({ ...formData, jiraTicketsJqlFilter: e.target.value })}
                    placeholder='e.g. status NOT IN (Done, Cancelled) AND labels = "support"'
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Applied automatically when importing from Jira tickets in projects.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="hideIntegratedJiraTicketsByDefault"
                    checked={formData.hideIntegratedJiraTicketsByDefault}
                    onChange={(e) => setFormData({ ...formData, hideIntegratedJiraTicketsByDefault: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="hideIntegratedJiraTicketsByDefault" className="text-sm text-gray-700 dark:text-gray-300">
                    Hide already integrated Jira tickets by default in "Import from Jira Ticket"
                  </label>
                </div>
              </div>
            </div>

            {/* Jira for Projects Section */}
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.34V2.84A.84.84 0 0021.16 2zM2 11.53c2.4 0 4.35 1.97 4.35 4.35v1.78h1.7c2.4 0 4.34 1.94 4.34 4.34H2.84A.84.84 0 012 21.16z" />
                </svg>
                Jira for Projects / Kanban Boards
              </h3>
              <p className="text-sm text-green-700 dark:text-green-300 mb-4">
                Configure a separate Jira instance for managing project boards and kanban views (optional)
              </p>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Jira Projects URL
                  </label>
                  <input
                    type="url"
                    value={formData.jiraProjectsUrl}
                    onChange={(e) => setFormData({ ...formData, jiraProjectsUrl: e.target.value })}
                    placeholder="https://your-projects-domain.atlassian.net"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.jiraProjectsEmail}
                    onChange={(e) => setFormData({ ...formData, jiraProjectsEmail: e.target.value })}
                    placeholder="your-email@company.com"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    API Token
                  </label>
                  <PasswordInput
                    ref={jiraProjectsApiTokenRef}
                    name="jiraProjectsApiToken"
                    placeholder="Your Jira API Token for Projects instance"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
                    autoComplete="new-password"
                    preventAutofill
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    API token for the Projects Jira instance
                  </p>
                </div>
              </div>
            </div>

            {/* Enable Integration Toggle */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isEnabled"
                    checked={formData.isEnabled}
                    onChange={(e) => setFormData({ ...formData, isEnabled: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isEnabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable integration
                  </label>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg transition-colors"
                >
                  {isTesting ? 'Testing...' : '🔍 Test Connection'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {isSaving ? 'Saving...' : '💾 Save Integration'}
                </button>
                {integration && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setFormData({
                        isEnabled: integration.IsEnabled === 1,
                        jiraUrl: integration.JiraUrl || '',
                        jiraEmail: integration.JiraEmail || '',
                        jiraProjectKey: integration.JiraProjectKey || '',
                        jiraTicketsJqlFilter: integration.JiraTicketsJqlFilter || '',
                        hideIntegratedJiraTicketsByDefault: integration.HideIntegratedJiraTicketsByDefault === 1,
                        jiraProjectsUrl: integration.JiraProjectsUrl || '',
                        jiraProjectsEmail: integration.JiraProjectsEmail || '',
                      });
                      clearPasswordInput(jiraApiTokenRef);
                      clearPasswordInput(jiraProjectsApiTokenRef);
                    }}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )} 
        </div>
      </div>

      {/* GitHub Integration Card */}
      <GitHubIntegrationCard 
        integration={githubIntegration}
        token={token}
        orgId={orgId}
        onUpdate={loadIntegration}
        setError={setError}
          setSuccess={setSuccessWithToast}
      />

      {/* Gitea Integration Card */}
      <GiteaIntegrationCard 
        integration={giteaIntegration}
        token={token}
        orgId={orgId}
        onUpdate={loadIntegration}
        setError={setError}
          setSuccess={setSuccessWithToast}
      />

      {/* Bitbucket Integration Card */}
      <BitbucketIntegrationCard
        integration={bitbucketIntegration}
        token={token}
        orgId={orgId}
        onUpdate={loadIntegration}
        setError={setError}
        setSuccess={setSuccessWithToast}
      />
    </div>
    {showDeleteConfirm && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
          <div className="p-6">
            <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">Remove Jira Integration</h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to remove this integration?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

// Attachments Tab Component
function AttachmentsTab({ 
  orgId, 
  token, 
  attachments,
  uploadingFile,
  onFileUpload,
  onDeleteAttachment
}: { 
  orgId: number; 
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
        `${getApiUrl()}/api/organization-attachments/${attachmentId}`,
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

  const handlePreviewAttachment = async (attachmentId: number) => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/organization-attachments/${attachmentId}`,
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
        
        // Open in new tab
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        
        // Clean up URL after a delay
        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      console.error('Failed to preview attachment:', err);
    }
  };

  const canPreview = (fileType: string): boolean => {
    return fileType.startsWith('image/') || fileType === 'application/pdf';
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-end">
        <div>
          <input
            type="file"
            id="org-file-upload"
            className="hidden"
            onChange={onFileUpload}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
          />
          <label
            htmlFor="org-file-upload"
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
                  {canPreview(attachment.FileType) && (
                    <button
                      onClick={() => handlePreviewAttachment(attachment.Id)}
                      className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                      title="Preview"
                    >
                      👁️
                    </button>
                  )}
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
    </div>
  );
}

// ─── SlaTab ──────────────────────────────────────────────────────────────────

interface SlaRule {
  Id: number;
  OrganizationId: number;
  Name: string;
  PriorityId: number | null;
  PriorityName: string | null;
  PriorityColor: string | null;
  FirstResponseHours: number | null;
  ResolutionHours: number | null;
  AutoTransitionHours: number | null;
  AutoTransitionStatusId: number | null;
  AutoTransitionStatusName?: string | null;
  AutoTransitionStatusColor?: string | null;
  IsActive: number;
}

interface TicketPriority {
  Id: number;
  PriorityName: string;
  Color: string;
}

interface TicketStatus {
  Id: number;
  StatusName: string;
  Color?: string;
}

function SlaTab({
  orgId,
  canManage,
  token,
  showConfirm,
}: {
  orgId: number;
  canManage: boolean;
  token: string;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
  const [rules, setRules] = useState<SlaRule[]>([]);
  const [priorities, setPriorities] = useState<TicketPriority[]>([]);
  const [statuses, setStatuses] = useState<TicketStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<SlaRule | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    priorityId: '',
    firstResponseHours: '',
    resolutionHours: '',
    autoTransitionHours: '',
    autoTransitionStatusId: '',
    isActive: true,
  });

  useEffect(() => {
    loadData();
  }, [orgId]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [rulesRes, priRes, statusRes] = await Promise.all([
        fetch(`${API_URL}/api/sla-rules/organization/${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/status-values/ticket-priority/${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/status-values/ticket/${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (rulesRes.ok) setRules((await rulesRes.json()).rules || []);
      if (priRes.ok) {
        const d = await priRes.json();
        setPriorities(d.priorities || d.ticketPriorities || []);
      }
      if (statusRes.ok) {
        const d = await statusRes.json();
        setStatuses(d.statuses || []);
      }
    } catch {
      setError('Failed to load SLA configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setEditingRule(null);
    setForm({
      name: '',
      priorityId: '',
      firstResponseHours: '',
      resolutionHours: '',
      autoTransitionHours: '',
      autoTransitionStatusId: '',
      isActive: true,
    });
    setShowModal(true);
  };

  const openEdit = (rule: SlaRule) => {
    setEditingRule(rule);
    setForm({
      name: rule.Name,
      priorityId: rule.PriorityId != null ? String(rule.PriorityId) : '',
      firstResponseHours: rule.FirstResponseHours != null ? String(rule.FirstResponseHours) : '',
      resolutionHours: rule.ResolutionHours != null ? String(rule.ResolutionHours) : '',
      autoTransitionHours: rule.AutoTransitionHours != null ? String(rule.AutoTransitionHours) : '',
      autoTransitionStatusId: rule.AutoTransitionStatusId != null ? String(rule.AutoTransitionStatusId) : '',
      isActive: rule.IsActive === 1,
    });
    setShowModal(true);
  };

  const saveRule = async () => {
    if (!form.name.trim()) return;
    setIsSaving(true);
    try {
      const body = {
        organizationId: orgId,
        name: form.name.trim(),
        priorityId: form.priorityId ? parseInt(form.priorityId) : null,
        firstResponseHours: form.firstResponseHours ? parseFloat(form.firstResponseHours) : null,
        resolutionHours: form.resolutionHours ? parseFloat(form.resolutionHours) : null,
        autoTransitionHours: form.autoTransitionHours ? parseFloat(form.autoTransitionHours) : null,
        autoTransitionStatusId: form.autoTransitionStatusId ? parseInt(form.autoTransitionStatusId) : null,
        isActive: form.isActive,
      };
      const url = editingRule ? `${API_URL}/api/sla-rules/${editingRule.Id}` : `${API_URL}/api/sla-rules`;
      const method = editingRule ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.message || 'Failed to save');
        return;
      }
      setShowModal(false);
      await loadData();
    } catch {
      setError('Failed to save SLA rule');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRule = (rule: SlaRule) => {
    showConfirm(
      'Delete SLA Rule',
      `Delete "${rule.Name}"? This cannot be undone.`,
      async () => {
        await fetch(`${API_URL}/api/sla-rules/${rule.Id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        await loadData();
      }
    );
  };

  const toggleActive = async (rule: SlaRule) => {
    await fetch(`${API_URL}/api/sla-rules/${rule.Id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: rule.Name,
        priorityId: rule.PriorityId,
        firstResponseHours: rule.FirstResponseHours,
        resolutionHours: rule.ResolutionHours,
        autoTransitionHours: rule.AutoTransitionHours,
        autoTransitionStatusId: rule.AutoTransitionStatusId,
        isActive: !rule.IsActive,
      }),
    });
    await loadData();
  };

  const formatHours = (h: number | null) => {
    if (h == null) return '—';
    if (h < 1) return `${Math.round(h * 60)}m`;
    if (h === 1) return '1h';
    if (Number.isInteger(h)) return `${h}h`;
    const whole = Math.floor(h);
    const mins = Math.round((h - whole) * 60);
    return `${whole}h ${mins}m`;
  };

  if (isLoading) return <div className="py-12 text-center text-gray-500">Loading SLA rules…</div>;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Define response and resolution time targets for tickets. Breached SLAs are shown in the ticket list.
        </p>
        {canManage && (
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + New Rule
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {rules.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">No SLA rules configured</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Create a rule to start tracking response and resolution times for tickets.
          </p>
          {canManage && (
            <button
              onClick={openCreate}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
            >
              Create first rule
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 pr-4 text-gray-600 dark:text-gray-400 font-medium">Rule Name</th>
                <th className="text-left py-3 pr-4 text-gray-600 dark:text-gray-400 font-medium">Applies to Priority</th>
                <th className="text-left py-3 pr-4 text-gray-600 dark:text-gray-400 font-medium">First Response</th>
                <th className="text-left py-3 pr-4 text-gray-600 dark:text-gray-400 font-medium">Resolution</th>
                <th className="text-left py-3 pr-4 text-gray-600 dark:text-gray-400 font-medium">Auto Status Change</th>
                <th className="text-left py-3 pr-4 text-gray-600 dark:text-gray-400 font-medium">Status</th>
                {canManage && (
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {rules.map(rule => (
                <tr key={rule.Id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${!rule.IsActive ? 'opacity-50' : ''}`}>
                  <td className="py-3 pr-4 font-medium text-gray-900 dark:text-white">{rule.Name}</td>
                  <td className="py-3 pr-4">
                    {rule.PriorityId != null && rule.PriorityName ? (
                      <span
                        className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: rule.PriorityColor ? `${rule.PriorityColor}22` : undefined,
                          color: rule.PriorityColor || undefined,
                        }}
                      >
                        {rule.PriorityName}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 text-xs italic">All priorities</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                    {formatHours(rule.FirstResponseHours)}
                  </td>
                  <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                    {formatHours(rule.ResolutionHours)}
                  </td>
                  <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                    {rule.AutoTransitionHours != null && rule.AutoTransitionStatusId != null ? (
                      <span>
                        {formatHours(rule.AutoTransitionHours)} →{' '}
                        <span
                          className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: rule.AutoTransitionStatusColor ? `${rule.AutoTransitionStatusColor}22` : undefined,
                            color: rule.AutoTransitionStatusColor || undefined,
                          }}
                        >
                          {rule.AutoTransitionStatusName || `Status ${rule.AutoTransitionStatusId}`}
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {canManage ? (
                      <button
                        onClick={() => toggleActive(rule)}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                          rule.IsActive
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200'
                        }`}
                        title="Click to toggle"
                      >
                        {rule.IsActive ? '✅ Active' : '⏸ Inactive'}
                      </button>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${rule.IsActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {rule.IsActive ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  {canManage && (
                    <td className="py-3 text-right">
                      <button
                        onClick={() => openEdit(rule)}
                        title="Edit SLA rule"
                        aria-label="Edit SLA rule"
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 mr-3"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => deleteRule(rule)}
                        title="Delete SLA rule"
                        aria-label="Delete SLA rule"
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                      >
                        🗑️
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info box */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
        <p className="font-medium mb-1">How SLA badges work</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700 dark:text-blue-400">
          <li>🟢 <strong>Green</strong> — ticket is within SLA time limits</li>
          <li>🟡 <strong>Yellow</strong> — &gt; 75% of the allowed time has elapsed</li>
          <li>🔴 <strong>Red</strong> — SLA has been breached (time limit exceeded)</li>
          <li>Rules with no priority set act as a catch-all for all ticket priorities</li>
          <li>If a priority-specific rule exists, it takes precedence over the catch-all</li>
        </ul>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingRule ? 'Edit SLA Rule' : 'New SLA Rule'}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Rule Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="e.g. Urgent tickets, Standard SLA"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Applies to Priority
                </label>
                <select
                  value={form.priorityId}
                  onChange={e => setForm({ ...form, priorityId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">All priorities (catch-all)</option>
                  {priorities.map(p => (
                    <option key={p.Id} value={p.Id}>{p.PriorityName}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Leave empty to apply to all priorities not covered by another rule.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    First Response (hours)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.firstResponseHours}
                    onChange={e => setForm({ ...form, firstResponseHours: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="e.g. 4"
                  />
                  <p className="text-xs text-gray-400 mt-1">Max hours until first staff reply</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Resolution (hours)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.resolutionHours}
                    onChange={e => setForm({ ...form, resolutionHours: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="e.g. 24"
                  />
                  <p className="text-xs text-gray-400 mt-1">Max hours until ticket is resolved</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Auto Status Change After (hours)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={form.autoTransitionHours}
                    onChange={e => setForm({ ...form, autoTransitionHours: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="e.g. 8"
                  />
                  <p className="text-xs text-gray-400 mt-1">Optional. Leave empty to disable auto transition.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Change Status To
                  </label>
                  <select
                    value={form.autoTransitionStatusId}
                    onChange={e => setForm({ ...form, autoTransitionStatusId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Disabled</option>
                    {statuses.map(s => (
                      <option key={s.Id} value={s.Id}>{s.StatusName}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Pick a target status used when the time limit is reached.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="sla-active"
                  checked={form.isActive}
                  onChange={e => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="sla-active" className="text-sm text-gray-700 dark:text-gray-300">
                  Active (rule is enforced)
                </label>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={() => { setShowModal(false); setError(''); }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveRule}
                disabled={isSaving || !form.name.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white rounded-lg transition-colors text-sm"
              >
                {isSaving ? 'Saving…' : editingRule ? 'Save Changes' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmModal({ message, onClose, onConfirm }: { message: { title: string; message: string }; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            {message.title}
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            {message.message}
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
