'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { organizationsApi, Organization, OrganizationMember, AddMemberData } from '@/lib/api/organizations';
import { permissionGroupsApi, PermissionGroup, CreatePermissionGroupData } from '@/lib/api/permissionGroups';
import { statusValuesApi, StatusValue, CreateStatusValueData } from '@/lib/api/statusValues';
import { projectsApi, Project } from '@/lib/api/projects';
import Navbar from '@/components/Navbar';
import CustomerUserGuard from '@/components/CustomerUserGuard';
import ChangeHistory from '@/components/ChangeHistory';

export default function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const orgId = parseInt(resolvedParams.id);
  
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'projects' | 'permissions' | 'statuses' | 'tags' | 'attachments' | 'integrations' | 'history'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  
  // Edit organization state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [isSaving, setIsSaving] = useState(false);
  
  // Attachments state
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  
  const [modalMessage, setModalMessage] = useState<{
    type: 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

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
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user && token) {
      loadOrganization();
    }
  }, [user, token, authLoading, orgId, router]);

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

  const canManageSettings = organization.Role === 'Owner' || organization.Role === 'Admin';
  
  console.log('Organization Role:', organization.Role, 'canManageSettings:', canManageSettings);

  return (
    <CustomerUserGuard>
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />

      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <a href="/organizations" className="text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block">
            ← Back to Organizations
          </a>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{organization.Name}</h1>
              {organization.Description && (
                <div 
                  className="text-gray-600 dark:text-gray-400 mt-2 prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: organization.Description }}
                />
              )}
            </div>
            {canManageSettings && (
              <button
                onClick={() => {
                  setEditForm({ name: organization.Name, description: organization.Description || '' });
                  setShowEditModal(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                ✏️ Edit
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('members')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'members'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Members
              </button>
              <button
                onClick={() => setActiveTab('projects')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'projects'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Projects
              </button>
              <button
                onClick={() => setActiveTab('permissions')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'permissions'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Permission Groups
              </button>
              <button
                onClick={() => setActiveTab('statuses')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'statuses'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Status & Priorities
              </button>
              <button
                onClick={() => setActiveTab('tags')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'tags'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Tags
              </button>
              <button
                onClick={() => {
                  setActiveTab('attachments');
                  loadAttachments();
                }}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'attachments'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                📎 Attachments ({attachments.length})
              </button>
              {canManageSettings && (
                <button
                  onClick={() => setActiveTab('integrations')}
                  className={`px-6 py-4 text-sm font-medium border-b-2 ${
                    activeTab === 'integrations'
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  🔌 Integrations
                </button>
              )}
              <button
                onClick={() => setActiveTab('history')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'history'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                📜 History
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && <OverviewTab organization={organization} orgId={orgId} token={token!} />}
            {activeTab === 'members' && <MembersTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />}
            {activeTab === 'projects' && <ProjectsTab orgId={orgId} canManage={canManageSettings} token={token!} />}
            {activeTab === 'permissions' && <PermissionsTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />}
            {activeTab === 'statuses' && <StatusesTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />}
            {activeTab === 'tags' && <TagsTab orgId={orgId} canManage={canManageSettings} token={token!} showConfirm={showConfirm} />}
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
            {activeTab === 'integrations' && <IntegrationsTab orgId={orgId} token={token!} />}
            {activeTab === 'history' && (
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">📜 Change History</h2>
                <ChangeHistory entityType="organization" entityId={orgId} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Organization Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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

      {/* Confirm Modal */}
      {modalMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-start mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    {modalMessage.title}
                  </h3>
                  <div className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                    {modalMessage.message}
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={closeConfirmModal}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleModalConfirm}
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

function OverviewTab({ organization, orgId, token }: { organization: Organization; orgId: number; token: string }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProjects();
    loadTickets();
  }, [orgId]);

  const loadProjects = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(
        `${getApiUrl()}/api/projects?organizationId=${orgId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load projects');
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTickets = async () => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/tickets?organizationId=${orgId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to load tickets:', err);
    }
  };

  // Calculate totals
  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => !p.StatusIsClosed && !p.StatusIsCancelled).length;
  const completedProjects = projects.filter(p => p.StatusIsClosed === 1).length;
  const totalEstimated = projects.reduce((sum, p) => sum + Number(p.TotalEstimatedHours || 0), 0);
  const totalWorked = projects.reduce((sum, p) => sum + Number(p.TotalWorkedHours || 0), 0);
  const totalTasks = projects.reduce((sum, p) => sum + Number(p.TotalTasks || 0), 0);
  const completedTasks = projects.reduce((sum, p) => sum + Number(p.CompletedTasks || 0), 0);
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Calculate ticket stats
  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => t.Status === 'Open').length;
  const resolvedTickets = tickets.filter(t => t.Status === 'Resolved' || t.Status === 'Closed').length;
  const unresolvedTickets = totalTickets - resolvedTickets;

  return (
    <div className="space-y-6">
      {/* Organization Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Your Role</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{organization.Role}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Members</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{organization.MemberCount || 0}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Created By</div>
          <div className="text-lg font-medium text-gray-900 dark:text-white">{organization.CreatorName || 'Unknown'}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{new Date(organization.CreatedAt).toLocaleDateString()}</div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading statistics...</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border-l-4 border-blue-500">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Projects</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalProjects}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {activeProjects} active, {completedProjects} completed
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border-l-4 border-purple-500">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Tasks</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalTasks}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {completedTasks} completed ({overallProgress}%)
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border-l-4 border-indigo-500">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Tickets</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalTickets}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {resolvedTickets} resolved, {unresolvedTickets} pending
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border-l-4 border-orange-500">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Estimated Hours</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalEstimated.toFixed(0)}h</div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow border-l-4 border-green-500">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Hours Worked</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">{totalWorked.toFixed(0)}h</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {totalEstimated > 0 ? Math.round((totalWorked / totalEstimated) * 100) : 0}% of estimated
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
                  <span className="font-medium text-gray-900 dark:text-white">{completedTasks}/{totalTasks}</span>
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
                  <span className="font-medium text-gray-900 dark:text-white">{totalWorked.toFixed(0)}h / {totalEstimated.toFixed(0)}h</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div 
                    className={`h-3 rounded-full transition-all ${
                      totalWorked > totalEstimated ? 'bg-red-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, totalEstimated > 0 ? (totalWorked / totalEstimated) * 100 : 0)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Project Status Breakdown */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Project Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{activeProjects}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Active</div>
              </div>
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{completedProjects}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Completed</div>
              </div>
              <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {projects.filter(p => p.StatusName?.toLowerCase() === 'on hold').length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">On Hold</div>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {projects.filter(p => p.StatusIsCancelled === 1).length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Other</div>
              </div>
            </div>
          </div>
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
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}) {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);

  useEffect(() => {
    loadMembers();
    loadGroups();
  }, [orgId]);

  const loadMembers = async () => {
    try {
      setIsLoading(true);
      const response = await organizationsApi.getMembers(orgId, token);
      setMembers(response.members);
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
      setGroups(response.groups);
    } catch (err: any) {
      console.error('Failed to load groups:', err);
    }
  };

  const handleRemove = async (memberId: number) => {
    showConfirm(
      'Remove Member',
      'Are you sure you want to remove this member?',
      async () => {
        try {
          await organizationsApi.removeMember(orgId, memberId, token);
          await loadMembers();
        } catch (err: any) {
          setError(err.message || 'Failed to remove member');
        }
      }
    );
  };

  if (isLoading) return <div>Loading members...</div>;

  console.log('MembersTab - canManage:', canManage, 'members:', members);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Organization Members</h3>
        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
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

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Permission Group</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Joined</th>
              {canManage && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {members.map((member) => (
              <tr key={member.Id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                  {member.Username}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {member.Email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {member.Role}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {member.GroupName || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {new Date(member.JoinedAt).toLocaleDateString()}
                </td>
                {canManage && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {member.Role !== 'Owner' && (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setEditingMember(member)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRemove(member.Id)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <AddMemberModal
          orgId={orgId}
          groups={groups}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            loadMembers();
          }}
          token={token}
        />
      )}

      {editingMember && (
        <EditMemberModal
          orgId={orgId}
          member={editingMember}
          groups={groups}
          onClose={() => setEditingMember(null)}
          onUpdated={() => {
            setEditingMember(null);
            loadMembers();
          }}
          token={token}
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
  const [formData, setFormData] = useState<AddMemberData>({
    userEmail: '',
    role: 'Member',
    permissionGroupId: undefined,
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Add Member</h2>
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
                User Email *
              </label>
              <input
                type="email"
                value={formData.userEmail}
                onChange={(e) => setFormData({ ...formData, userEmail: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="user@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Role
              </label>
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Permission Group (Optional)
              </label>
              <select
                value={formData.permissionGroupId || ''}
                onChange={(e) => setFormData({ ...formData, permissionGroupId: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">None</option>
                {groups.map((group) => (
                  <option key={group.Id} value={group.Id}>{group.GroupName}</option>
                ))}
              </select>
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Member</h2>
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

          <div className="mb-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">User</div>
            <div className="text-lg font-medium text-gray-900 dark:text-white">{member.Username}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{member.Email}</div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Role
              </label>
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Permission Group (Optional)
              </label>
              <select
                value={formData.permissionGroupId || ''}
                onChange={(e) => setFormData({ ...formData, permissionGroupId: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">None</option>
                {groups.map((group) => (
                  <option key={group.Id} value={group.Id}>{group.GroupName}</option>
                ))}
              </select>
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
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
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
                <span className={group.CanManageTasks ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanManageTasks ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Manage Tasks</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={group.CanPlanTasks ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                  {group.CanPlanTasks ? '✓' : '✗'}
                </span>
                <span className="text-gray-700 dark:text-gray-300">Plan Tasks</span>
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
            </div>

            {canManage && (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setEditingGroup(group)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(group.Id)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm"
                >
                  Delete
                </button>
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
    canManageTasks: !!group?.CanManageTasks,
    canPlanTasks: !!group?.CanPlanTasks,
    canManageMembers: !!group?.CanManageMembers,
    canManageSettings: !!group?.CanManageSettings,
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {group ? 'Edit' : 'Create'} Permission Group
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
                Group Name *
              </label>
              <input
                type="text"
                value={formData.groupName}
                onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
              {[
                { key: 'canManageProjects', label: 'Manage Projects' },
                { key: 'canManageTasks', label: 'Manage Tasks' },
                { key: 'canPlanTasks', label: 'Plan Tasks' },
                { key: 'canManageMembers', label: 'Manage Members' },
                { key: 'canManageSettings', label: 'Manage Settings' },
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

function StatusesTab({ 
  orgId, 
  canManage, 
  token,
  showConfirm 
}: { 
  orgId: number; 
  canManage: boolean; 
  token: string;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}) {
  const [projectStatuses, setProjectStatuses] = useState<StatusValue[]>([]);
  const [taskStatuses, setTaskStatuses] = useState<StatusValue[]>([]);
  const [taskPriorities, setTaskPriorities] = useState<StatusValue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeType, setActiveType] = useState<'project' | 'task' | 'priority'>('project');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStatus, setEditingStatus] = useState<StatusValue | null>(null);

  useEffect(() => {
    loadStatuses();
  }, [orgId]);

  const loadStatuses = async () => {
    try {
      setIsLoading(true);
      const [projectRes, taskRes, priorityRes] = await Promise.all([
        statusValuesApi.getProjectStatuses(orgId, token),
        statusValuesApi.getTaskStatuses(orgId, token),
        statusValuesApi.getTaskPriorities(orgId, token),
      ]);
      setProjectStatuses(projectRes.statuses);
      setTaskStatuses(taskRes.statuses);
      setTaskPriorities(priorityRes.priorities);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load status values');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number, type: 'project' | 'task' | 'priority') => {
    const itemType = type === 'priority' ? 'priority' : 'status value';
    showConfirm(
      `Delete ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`,
      `Are you sure you want to delete this ${itemType}?`,
      async () => {
        try {
          if (type === 'project') {
            await statusValuesApi.deleteProjectStatus(id, token);
          } else if (type === 'task') {
            await statusValuesApi.deleteTaskStatus(id, token);
          } else {
            await statusValuesApi.deleteTaskPriority(id, token);
          }
          await loadStatuses();
        } catch (err: any) {
          setError(err.message || 'Failed to delete ' + itemType);
        }
      }
    );
  };

  if (isLoading) return <div>Loading status values...</div>;

  const currentStatuses = activeType === 'project' ? projectStatuses : activeType === 'task' ? taskStatuses : taskPriorities;
  const buttonLabel = activeType === 'priority' ? 'Add Priority' : 'Add Status';

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
              {status.ColorCode && (
                <div
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: status.ColorCode }}
                />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {activeType === 'priority' ? status.PriorityName : status.StatusName}
                  </span>
                  {status.IsDefault ? <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full">Default</span> : ''}
                  {status.IsClosed ? <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 rounded-full">Closed</span> : ''}
                  {status.IsCancelled ? <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 rounded-full">Cancelled</span> : ''}
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
                  className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 px-3 py-1"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(status.Id, activeType)}
                  className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 px-3 py-1"
                >
                  Delete
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

function StatusValueModal({ orgId, type, status, onClose, onSaved, token }: {
  orgId: number;
  type: 'project' | 'task' | 'priority';
  status?: StatusValue;
  onClose: () => void;
  onSaved: () => void;
  token: string;
}) {
  const [formData, setFormData] = useState<CreateStatusValueData>({
    organizationId: orgId,
    statusName: type === 'priority' ? (status?.PriorityName || '') : (status?.StatusName || ''),
    colorCode: status?.ColorCode || '#3b82f6',
    sortOrder: status?.SortOrder || 0,
    isDefault: !!status?.IsDefault,
    isClosed: !!status?.IsClosed,
    isCancelled: !!status?.IsCancelled,
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (status) {
        if (type === 'project') {
          await statusValuesApi.updateProjectStatus(status.Id, formData, token);
        } else if (type === 'task') {
          await statusValuesApi.updateTaskStatus(status.Id, formData, token);
        } else {
          await statusValuesApi.updateTaskPriority(status.Id, formData, token);
        }
      } else {
        if (type === 'project') {
          await statusValuesApi.createProjectStatus(formData, token);
        } else if (type === 'task') {
          await statusValuesApi.createTaskStatus(formData, token);
        } else {
          await statusValuesApi.createTaskPriority(formData, token);
        }
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save ' + (type === 'priority' ? 'priority' : 'status value'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {status ? 'Edit' : 'Create'} {type === 'priority' ? 'Priority' : type === 'project' ? 'Project Status' : 'Task Status'}
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
                {type === 'priority' ? 'Priority' : 'Status'} Name *
              </label>
              <input
                type="text"
                value={formData.statusName}
                onChange={(e) => setFormData({ ...formData, statusName: e.target.value })}
                required
                placeholder={type === 'priority' ? 'e.g., Critical, High, Medium, Low' : ''}
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
              <span className="text-sm text-gray-700 dark:text-gray-300">Set as default status</span>
            </label>

            {type !== 'priority' && (
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

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isCancelled}
                    onChange={(e) => setFormData({ ...formData, isCancelled: e.target.checked })}
                    className="w-4 h-4 text-red-600 rounded focus:ring-2 focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Mark as cancelled status</span>
                </label>
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
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Organization Projects</h2>
      </div>

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
            <thead className="bg-gray-50 dark:bg-gray-700">
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => router.push(`/projects/${project.Id}`)}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      View
                    </button>
                    {canManage && organizations.length > 0 && (
                      <button
                        onClick={() => setTransferringProject(project)}
                        className="text-orange-600 dark:text-orange-400 hover:underline"
                      >
                        Transfer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Transfer Project Modal */}
      {transferringProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
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

function TagsTab({
  orgId,
  canManage,
  token,
  showConfirm
}: {
  orgId: number;
  canManage: boolean;
  token: string;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
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

  const colorPresets = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
    '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
    '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
    '#EC4899', '#F43F5E', '#6B7280', '#374151', '#1F2937'
  ];

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
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Tag
          </button>
        )}
      </div>

      {tags.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <div className="text-4xl mb-4">🏷️</div>
          <p>No tags created yet.</p>
          {canManage && (
            <button
              onClick={openCreateModal}
              className="mt-4 text-blue-600 dark:text-blue-400 hover:underline"
            >
              Create your first tag
            </button>
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
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: tag.Color + '30', border: `2px solid ${tag.Color}` }}
                >
                  <span style={{ color: tag.Color }}>🏷️</span>
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{tag.Name}</div>
                  {tag.Description && (() => {
                    const plainText = tag.Description.replace(/<[^>]*>/g, '').trim();
                    return plainText ? (
                      <div className="text-xs text-gray-500 dark:text-gray-400">{plainText}</div>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
                    placeholder="e.g., Bug, Feature, Urgent"
                    maxLength={50}
                  />
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
  const [formData, setFormData] = useState({
    isEnabled: true,
    gitHubUrl: '',
    gitHubToken: ''
  });

  useEffect(() => {
    if (integration) {
      setFormData({
        isEnabled: integration.IsEnabled === 1,
        gitHubUrl: integration.GitHubUrl || '',
        gitHubToken: ''
      });
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
          body: JSON.stringify(formData)
        }
      );

      const data = await response.json();

      if (response.ok) {
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
    if (!confirm('Are you sure you want to remove the GitHub integration?')) return;

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
    }
  };

  return (
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
                onClick={handleDelete}
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
              <input
                type="password"
                value={formData.gitHubToken}
                onChange={(e) => setFormData({ ...formData, gitHubToken: e.target.value })}
                placeholder={integration ? "Leave empty to keep current token" : "ghp_xxxxxxxxxxxxxxxxxxxx"}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gray-500"
                required={!integration}
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
                      gitHubToken: ''
                    });
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
  );
}

// Integrations Tab Component
function IntegrationsTab({ orgId, token }: { orgId: number; token: string }) {
  const [integration, setIntegration] = useState<any>(null);
  const [githubIntegration, setGithubIntegration] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    isEnabled: true,
    jiraUrl: '',
    jiraEmail: '',
    jiraApiToken: '',
    jiraProjectKey: '',
    jiraProjectsUrl: '',
    jiraProjectsEmail: '',
    jiraProjectsApiToken: ''
  });

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
            jiraApiToken: '',
            jiraProjectKey: data.integration.JiraProjectKey || '',
            jiraProjectsUrl: data.integration.JiraProjectsUrl || '',
            jiraProjectsEmail: data.integration.JiraProjectsEmail || '',
            jiraProjectsApiToken: ''
          });
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
    } catch (err: any) {
      setError(err.message || 'Failed to load integrations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.jiraUrl || !formData.jiraEmail || !formData.jiraApiToken) {
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
              jiraApiToken: formData.jiraApiToken
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
      if (formData.jiraProjectsUrl && formData.jiraProjectsEmail && formData.jiraProjectsApiToken) {
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
                jiraApiToken: formData.jiraProjectsApiToken
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
          setSuccess(results.join('\n'));
        }
      } else if (results.length > 0) {
        setSuccess(results.join('\n'));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to test connection');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.jiraUrl || !formData.jiraEmail || !formData.jiraApiToken) {
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
          body: JSON.stringify(formData)
        }
      );

      const data = await response.json();

      if (response.ok) {
        setSuccess('Jira integration saved successfully');
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
    if (!confirm('Are you sure you want to remove this integration?')) return;

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
        setSuccess('Integration removed successfully');
        setIntegration(null);
        setFormData({
          isEnabled: true,
          jiraUrl: '',
          jiraEmail: '',
          jiraApiToken: '',
          jiraProjectKey: '',
          jiraProjectsUrl: '',
          jiraProjectsEmail: '',
          jiraProjectsApiToken: ''
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete integration');
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">🔌 Integrations</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Connect external services to enhance your organization's workflow
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg whitespace-pre-line">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-400 rounded-lg whitespace-pre-line">
          {success}
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
                  onClick={handleDelete}
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
                    API Token <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={formData.jiraApiToken}
                    onChange={(e) => setFormData({ ...formData, jiraApiToken: e.target.value })}
                    placeholder="Your Jira API Token"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    required
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
                  <input
                    type="password"
                    value={formData.jiraProjectsApiToken}
                    onChange={(e) => setFormData({ ...formData, jiraProjectsApiToken: e.target.value })}
                    placeholder="Your Jira API Token for Projects instance"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500"
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
                        jiraApiToken: '',
                        jiraProjectKey: integration.JiraProjectKey || '',
                        jiraProjectsUrl: integration.JiraProjectsUrl || '',
                        jiraProjectsEmail: integration.JiraProjectsEmail || '',
                        jiraProjectsApiToken: ''
                      });
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
        setSuccess={setSuccess}
      />
    </div>
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
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Organization Attachments</h2>
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

function ConfirmModal({ message, onClose, onConfirm }: { message: { title: string; message: string }; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
