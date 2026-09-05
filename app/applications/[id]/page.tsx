'use client';

import { getApiUrl } from '@/lib/api/config';
import { useState, useEffect, use, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useRouter } from 'next/navigation'
import { oldPath } from '@/lib/oldPath';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import RichTextEditor from '@/components/RichTextEditor';
import SearchableSelect from '@/components/SearchableSelect';
import SearchableMultiSelect from '@/components/SearchableMultiSelect';
import TaskDetailModal from '@/components/TaskDetailModal';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import CommitMessage from '@/components/CommitMessage';
import { Task, tasksApi } from '@/lib/api/tasks';
import { Project, projectsApi } from '@/lib/api/projects';
import { useColorVision } from '@/hooks/useColorVision';
import { useUrlTab } from '@/hooks/useUrlTab';
import { recordRecentNavAccess } from '@/lib/recentNavAccess';

type Tab = 'overview' | 'versions' | 'commits';
const APPLICATION_DETAIL_TABS = ['overview', 'versions', 'commits'] as const;

interface RemoteCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

const VERSION_STATUSES = ['Planning', 'In Development', 'Testing', 'Released', 'Archived'];

const STATUS_COLORS: Record<string, string> = {
  Planning:       'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'In Development': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Testing:        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Released:       'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Archived:       'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

interface Application {
  Id: number;
  Name: string;
  Description: string | null;
  RepositoryUrl: string | null;
  ImagePath?: string | null;
  IsCustomerSpecific: number | boolean;
  OrganizationId: number;
  OrganizationName: string;
  Customers: { Id: number; Name: string; Email?: string }[];
  Projects: { Id: number; ProjectName: string; StatusName?: string; StatusColor?: string }[];
  Versions: AppVersion[];
}

interface AppVersion {
  Id: number;
  ApplicationId: number;
  VersionNumber: string;
  VersionName: string | null;
  IsCustomerSpecific: number | boolean;
  CustomerId?: number | null;
  CustomerName?: string | null;
  Status: string;
  ReleaseDate: string | null;
  PatchNotes: string | null;
  TaskCount: number;
  CreatedAt: string;
  FirstName?: string;
  LastName?: string;
}

interface VersionTask {
  Id: number;
  ProjectId: number;
  TaskName: string;
  Description: string | null;
  StatusName: string | null;
  StatusColor: string | null;
  PriorityName: string | null;
  PriorityColor: string | null;
  ProjectName: string | null;
  AssigneeFN: string | null;
  AssigneeLN: string | null;
}

interface AvailableTask {
  Id: number;
  TaskName: string;
  ProjectName: string;
  StatusName: string | null;
}

interface Customer {
  Id: number;
  Name: string;
  Email?: string;
}

export default function ApplicationDetailPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-gray-700 dark:text-gray-200">Loading…</div>
        </div>
      }
    >
      <ApplicationDetailPageContent {...props} />
    </Suspense>
  );
}

function ApplicationDetailPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { pillStyle } = useColorVision();
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const router = useRouter();

  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useUrlTab<Tab>(APPLICATION_DETAIL_TABS, 'overview');

  const [commits, setCommits] = useState<RemoteCommit[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsError, setCommitsError] = useState('');
  const [commitsProvider, setCommitsProvider] = useState<string | null>(null);
  const [commitsHasMore, setCommitsHasMore] = useState(false);
  const [commitsPage, setCommitsPage] = useState(1);
  const [commitsLoaded, setCommitsLoaded] = useState(false);

  // Version modal state
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [editingVersion, setEditingVersion] = useState<AppVersion | null>(null);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [isOpenAIAvailable, setIsOpenAIAvailable] = useState(false);
  const [isImprovingPatchNotes, setIsImprovingPatchNotes] = useState(false);
  const [versionForm, setVersionForm] = useState({
    VersionNumber: '',
    VersionName: '',
    IsCustomerSpecific: false,
    CustomerId: null as number | null,
    Status: 'Planning',
    ReleaseDate: '',
    PatchNotes: '',
    TaskIds: [] as number[],
  });

  // Version detail panel
  const [selectedVersion, setSelectedVersion] = useState<AppVersion | null>(null);
  const [versionTasks, setVersionTasks] = useState<VersionTask[]>([]);
  const [availableTasks, setAvailableTasks] = useState<AvailableTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [showPatchNotes, setShowPatchNotes] = useState(false);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [selectedTaskForModal, setSelectedTaskForModal] = useState<Task | null>(null);
  const [taskModalProject, setTaskModalProject] = useState<Project | null>(null);
  const [taskModalTasks, setTaskModalTasks] = useState<Task[]>([]);

  // Date range print modal
  const [showDateRangePrintModal, setShowDateRangePrintModal] = useState(false);
  const [printDateRange, setPrintDateRange] = useState({
    startDate: new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  // Customer management modal
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [allCustomers, setAllCustomers] = useState<{ Id: number; Name: string; Email?: string }[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);
  const [isSavingCustomers, setIsSavingCustomers] = useState(false);

  // Confirm / alert modal
  const [dialog, setDialog] = useState<{
    type: 'confirm' | 'alert';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  const showAlert = (title: string, message: string) => {
    setDialog({ type: 'alert', title, message });
  };

  // Task search
  const [taskSearch, setTaskSearch] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push(oldPath('/login'));
  }, [user, authLoading, router]);

  useEffect(() => {
    if (token && id) {
      loadApplication();
    }
  }, [token, id]);

  useEffect(() => {
    if (activeTab === 'commits' && token && id && !commitsLoaded && !commitsLoading) {
      void loadCommits(1, false);
    }
  }, [activeTab, token, id, commitsLoaded, commitsLoading]);

  useEffect(() => {
    if (!application?.Id || !application.Name) return;
    recordRecentNavAccess(
      'applications',
      { id: application.Id, label: application.Name, href: `/applications/${application.Id}` },
      user?.id
    );
  }, [application?.Id, application?.Name, user?.id]);

  const loadApplication = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/applications/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Application not found');
      const data = await res.json();
      setApplication(data.application);
      await loadAllCustomers(data.application?.OrganizationId);
    } catch (err: any) {
      setError(err.message || 'Failed to load application');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCommits = async (page = 1, append = false) => {
    if (!token || !id) return;
    setCommitsLoading(true);
    setCommitsError('');
    try {
      const res = await fetch(
        `${getApiUrl()}/api/applications/${id}/commits?page=${page}&per_page=30`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to load commits');
      }
      const next = (data.data?.commits || []) as RemoteCommit[];
      setCommits((prev) => (append ? [...prev, ...next] : next));
      setCommitsProvider(data.data?.provider || null);
      setCommitsHasMore(Boolean(data.data?.hasMore));
      setCommitsPage(page);
      setCommitsLoaded(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load commits';
      setCommitsError(message);
      if (!append) {
        setCommits([]);
      }
      setCommitsLoaded(true);
    } finally {
      setCommitsLoading(false);
    }
  };

  const loadAllCustomers = async (organizationId?: number) => {
    try {
      const query = organizationId ? `?organizationId=${organizationId}` : '';
      const res = await fetch(`${getApiUrl()}/api/customers${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAllCustomers(data.data || data.customers || []);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const openCustomerModal = () => {
    const currentCustomers = application?.Customers?.map(c => c.Id) || [];
    setSelectedCustomerIds(currentCustomers);
    setShowCustomerModal(true);
  };

  const handleSaveCustomers = async () => {
    setIsSavingCustomers(true);
    setError('');
    try {
      const res = await fetch(`${getApiUrl()}/api/applications/${id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Name: application?.Name,
          Description: application?.Description,
          RepositoryUrl: application?.RepositoryUrl,
          IsCustomerSpecific: !!application?.IsCustomerSpecific,
          CustomerIds: selectedCustomerIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update customers');
      }

      setShowCustomerModal(false);
      await loadApplication();
    } catch (err: any) {
      setError(err.message || 'Failed to update customers');
    } finally {
      setIsSavingCustomers(false);
    }
  };

  const loadVersionDetail = async (version: AppVersion) => {
    setSelectedVersion(version);
    setShowPatchNotes(false);
    setIsLoadingTasks(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/applications/${id}/versions/${version.Id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVersionTasks(data.version.Tasks || []);
      }
    } finally {
      setIsLoadingTasks(false);
    }
  };

  const loadAvailableTasks = async (excludeVersionId?: number) => {
    try {
      // Load tasks from projects associated with this application
      // Exclude tasks already in other versions (but allow tasks from the current version if editing)
      const excludeParam = excludeVersionId ? `?excludeVersion=${excludeVersionId}` : '';
      const res = await fetch(`${getApiUrl()}/api/applications/${id}/tasks${excludeParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableTasks(data.tasks || []);
      } else {
        setAvailableTasks([]);
      }
    } catch {
      setAvailableTasks([]);
    }
  };

  const loadOpenAiAvailability = async () => {
    if (!token) {
      setIsOpenAIAvailable(false);
      return;
    }
    try {
      const res = await fetch(`${getApiUrl()}/api/applications/ai/availability`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setIsOpenAIAvailable(false);
        return;
      }
      const data = await res.json();
      setIsOpenAIAvailable(Boolean(data?.configured));
    } catch {
      setIsOpenAIAvailable(false);
    }
  };

  const openCreateVersionModal = () => {
    setEditingVersion(null);
    setVersionForm({ VersionNumber: '', VersionName: '', IsCustomerSpecific: false, CustomerId: null, Status: 'Planning', ReleaseDate: '', PatchNotes: '', TaskIds: [] });
    void loadAllCustomers(application?.OrganizationId);
    loadAvailableTasks();
    void loadOpenAiAvailability();
    setTaskSearch('');
    setShowVersionModal(true);
  };

  const openEditVersionModal = (v: AppVersion) => {
    setEditingVersion(v);
    void loadAllCustomers(application?.OrganizationId);
    // Pre-load current tasks
    const currentTaskIds = versionTasks.map(t => t.Id);
    setVersionForm({
      VersionNumber: v.VersionNumber,
      VersionName: v.VersionName || '',
      IsCustomerSpecific: !!v.IsCustomerSpecific,
      CustomerId: v.CustomerId ?? null,
      Status: v.Status,
      ReleaseDate: v.ReleaseDate ? v.ReleaseDate.split('T')[0] : '',
      PatchNotes: v.PatchNotes || '',
      TaskIds: currentTaskIds,
    });
    loadAvailableTasks(v.Id); // Pass version ID to exclude tasks from other versions
    void loadOpenAiAvailability();
    setTaskSearch('');
    setShowVersionModal(true);
  };

  const closeVersionModal = () => {
    setShowVersionModal(false);
    setEditingVersion(null);
    setError('');
  };

  const handleSaveVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSavingVersion(true);
    try {
      if (!versionForm.VersionNumber.trim()) throw new Error('Version number is required');
      if (versionForm.IsCustomerSpecific && !versionForm.CustomerId) {
        throw new Error('Customer is required when version is customer-specific');
      }

      const url = editingVersion
        ? `${getApiUrl()}/api/applications/${id}/versions/${editingVersion.Id}`
        : `${getApiUrl()}/api/applications/${id}/versions`;

      const method = editingVersion ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          VersionNumber: versionForm.VersionNumber,
          VersionName: versionForm.VersionName || null,
          IsCustomerSpecific: versionForm.IsCustomerSpecific,
          CustomerId: versionForm.IsCustomerSpecific ? versionForm.CustomerId : null,
          Status: versionForm.Status,
          ReleaseDate: versionForm.ReleaseDate || null,
          PatchNotes: versionForm.PatchNotes || null,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message || 'Failed to save version');
      }

      const data = await res.json();
      const versionId = editingVersion ? editingVersion.Id : data.id;

      // Sync tasks
      await fetch(`${getApiUrl()}/api/applications/${id}/versions/${versionId}/tasks`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ TaskIds: versionForm.TaskIds }),
      });

      closeVersionModal();
      await loadApplication();
      // Refresh selected version if it's the one we just edited
      if (editingVersion && selectedVersion?.Id === editingVersion.Id) {
        const updated = { ...editingVersion, ...versionForm, Id: editingVersion.Id };
        setSelectedVersion(updated as AppVersion);
        loadVersionDetail(updated as AppVersion);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save version');
    } finally {
      setIsSavingVersion(false);
    }
  };

  const handleDeleteVersion = (v: AppVersion) => {
    setDialog({
      type: 'confirm',
      title: 'Delete Version',
      message: `Are you sure you want to delete version "${v.VersionNumber}"? This cannot be undone.`,
      onConfirm: () => void (async () => {
        await fetch(`${getApiUrl()}/api/applications/${id}/versions/${v.Id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (selectedVersion?.Id === v.Id) setSelectedVersion(null);
        loadApplication();
      })(),
    });
  };

  const buildPatchNotes = (taskIds: number[], tasks: AvailableTask[]): string => {
    const selected = tasks.filter((t) => taskIds.includes(t.Id));
    if (selected.length === 0) return '';

    // Group by project
    const byProject: Record<string, string[]> = {};
    for (const t of selected) {
      const proj = t.ProjectName || 'General';
      if (!byProject[proj]) byProject[proj] = [];
      byProject[proj].push(t.TaskName);
    }

    const projects = Object.keys(byProject);
    let html = '';
    if (projects.length === 1) {
      // Single project — flat list
      html = '<ul>' + selected.map((t) => `<li>${t.TaskName}</li>`).join('') + '</ul>';
    } else {
      // Multiple projects — grouped
      html = projects
        .map(
          (proj) =>
            `<p><strong>${proj}</strong></p><ul>${byProject[proj].map((n) => `<li>${n}</li>`).join('')}</ul>`
        )
        .join('');
    }
    return html;
  };

  const handleDownloadVersionPDF = (version: AppVersion) => {
    const url = `${getApiUrl()}/api/applications/${id}/versions/${version.Id}/pdf`;
    const filename = `${application!.Name.replace(/[^a-z0-9]/gi, '_')}-v${version.VersionNumber}-release-notes.pdf`;
    
    // Fetch with authorization and trigger download
    fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
      .then(response => {
        if (!response.ok) throw new Error('Failed to download PDF');
        return response.blob();
      })
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      })
      .catch(error => {
        console.error('Error downloading PDF:', error);
        showAlert('Download failed', 'Failed to download PDF. Please try again.');
      });
  };

  const handleDownloadDateRangePDF = () => {
    if (!application) return;

    const start = new Date(printDateRange.startDate);
    const end = new Date(printDateRange.endDate);

    const versionsInRange = application.Versions.filter(v => {
      if (!v.ReleaseDate) return false;
      const releaseDate = new Date(v.ReleaseDate);
      return releaseDate >= start && releaseDate <= end && v.Status === 'Released';
    });

    if (versionsInRange.length === 0) {
      showAlert('No versions', 'No released versions found in the selected date range.');
      return;
    }

    const url = `${getApiUrl()}/api/applications/${id}/pdf?startDate=${printDateRange.startDate}&endDate=${printDateRange.endDate}`;
    const filename = `${application.Name.replace(/[^a-z0-9]/gi, '_')}-release-notes-${printDateRange.startDate}-to-${printDateRange.endDate}.pdf`;
    
    fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
      .then(response => {
        if (!response.ok) throw new Error('Failed to download PDF');
        return response.blob();
      })
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        setShowDateRangePrintModal(false);
      })
      .catch(error => {
        console.error('Error downloading PDF:', error);
        showAlert('Download failed', 'Failed to download PDF. Please try again.');
      });
  };

  const handleOpenTaskDetail = async (versionTask: VersionTask) => {
    if (!token || !versionTask?.ProjectId) return;

    try {
      const [projectRes, tasksRes] = await Promise.all([
        projectsApi.getById(Number(versionTask.ProjectId), token),
        tasksApi.getByProject(Number(versionTask.ProjectId), token),
      ]);

      const fullTask = (tasksRes.tasks || []).find((task) => Number(task.Id) === Number(versionTask.Id));
      if (!fullTask) {
        setError('Task not found in project context.');
        return;
      }

      setTaskModalProject(projectRes.project);
      setTaskModalTasks(tasksRes.tasks || []);
      setSelectedTaskForModal(fullTask);
      setShowTaskDetailModal(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to open task details.');
    }
  };

  const handleOpenTaskById = async (taskId: number) => {
    if (!token || !Number.isFinite(taskId) || taskId <= 0) return;

    try {
      const { task: summary } = await tasksApi.getById(taskId, token);
      const projectId = Number(summary.ProjectId);
      if (!Number.isFinite(projectId) || projectId <= 0) {
        setError('Task project could not be resolved.');
        return;
      }

      const [projectRes, tasksRes] = await Promise.all([
        projectsApi.getById(projectId, token),
        tasksApi.getByProject(projectId, token),
      ]);

      const fullTask = (tasksRes.tasks || []).find((task) => Number(task.Id) === Number(taskId));
      if (!fullTask) {
        setError('Task not found in project context.');
        return;
      }

      setTaskModalProject(projectRes.project);
      setTaskModalTasks(tasksRes.tasks || []);
      setSelectedTaskForModal(fullTask);
      setShowTaskDetailModal(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to open task details.');
    }
  };

  const toggleVersionTask = (taskId: number) => {
    setVersionForm((prev) => {
      const newTaskIds = prev.TaskIds.includes(taskId)
        ? prev.TaskIds.filter((id) => id !== taskId)
        : [...prev.TaskIds, taskId];
      return {
        ...prev,
        TaskIds: newTaskIds,
      };
    });
  };

  const handleGeneratePatchNotes = () => {
    const generated = buildPatchNotes(versionForm.TaskIds, availableTasks);
    setVersionForm((prev) => ({
      ...prev,
      PatchNotes: generated,
    }));
  };

  const handleImprovePatchNotesWithAI = async () => {
    if (!token || !isOpenAIAvailable || isImprovingPatchNotes) return;

    setIsImprovingPatchNotes(true);
    setError('');
    try {
      const res = await fetch(`${getApiUrl()}/api/applications/${id}/versions/improve-patch-notes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patchNotes: versionForm.PatchNotes || '',
          taskIds: versionForm.TaskIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to improve patch notes with AI');
      }

      const data = await res.json();
      const improvedPatchNotes = String(data?.patchNotes || '').trim();
      if (!improvedPatchNotes) {
        throw new Error('AI returned empty patch notes');
      }

      setVersionForm((prev) => ({
        ...prev,
        PatchNotes: improvedPatchNotes,
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to improve patch notes with AI');
    } finally {
      setIsImprovingPatchNotes(false);
    }
  };

  const filteredAvailableTasks = availableTasks.filter((t) =>
    !taskSearch || t.TaskName.toLowerCase().includes(taskSearch.toLowerCase()) || t.ProjectName?.toLowerCase().includes(taskSearch.toLowerCase())
  );

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user || !application) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-600 dark:text-gray-400">
          {error || 'Application not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="w-full mx-auto px-4 py-8">

        {/* Back + Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push(oldPath('/applications'))}
            className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 mb-3 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Applications
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {application.ImagePath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={application.ImagePath}
                  alt=""
                  className="h-14 w-14 rounded-xl object-cover border border-gray-200 dark:border-gray-600 shrink-0 bg-white"
                />
              ) : (
                <span className="text-4xl shrink-0">📦</span>
              )}
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{application.Name}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">{application.OrganizationName}</p>
              </div>
            </div>
            {application.RepositoryUrl && (
              <a
                href={application.RepositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Repository
              </a>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="-mb-px flex space-x-6">
            {(['overview', 'versions', 'commits'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-1 border-b-2 text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {tab === 'versions'
                  ? `Versions (${application.Versions?.length ?? 0})`
                  : tab === 'commits'
                    ? 'Commits'
                    : 'Overview'}
              </button>
            ))}
          </nav>
        </div>

        {/* ── OVERVIEW TAB ──────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: description + projects */}
            <div className="lg:col-span-2 space-y-6">
              {application.Description && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Description
                  </h2>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{application.Description}</p>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                  Associated Projects ({application.Projects?.length ?? 0})
                </h2>
                {(application.Projects?.length ?? 0) === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No projects associated yet.</p>
                ) : (
                  <div className="space-y-2">
                    {application.Projects.map((p) => (
                      <div
                        key={p.Id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                        onClick={() => router.push(`/projects/${p.Id}`)}
                      >
                        <span className="font-medium text-gray-900 dark:text-white">{p.ProjectName}</span>
                        {p.StatusName && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={pillStyle(p.StatusColor, { alpha: '33' })}
                          >
                            {p.StatusName}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: customers + quick stats */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Customers ({application.Customers?.length ?? 0})
                  </h2>
                  {permissions?.canManageApplications && (
                    <button
                      onClick={openCustomerModal}
                      className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                      title="Manage associated customers"
                      aria-label="Manage associated customers"
                    >
                      ⚙️
                    </button>
                  )}
                </div>
                {(application.Customers?.length ?? 0) === 0 ? (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">No customers linked.</p>
                ) : (
                  <div className="space-y-2">
                    {application.Customers.map((c) => (
                      <div
                        key={c.Id}
                        className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                        onClick={() => router.push(`/customers/${c.Id}`)}
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold text-sm shrink-0">
                          {c.Name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{c.Name}</p>
                          {c.Email && <p className="text-xs text-gray-500 dark:text-gray-400">{c.Email}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                  Quick Stats
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Total Versions</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{application.Versions?.length ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Released</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {application.Versions?.filter(v => v.Status === 'Released').length ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">In Development</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {application.Versions?.filter(v => v.Status === 'In Development').length ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Projects</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{application.Projects?.length ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── VERSIONS TAB ──────────────────────────────────────────────── */}
        {activeTab === 'versions' && (
          <div className="flex flex-col md:flex-row gap-4 md:gap-6">
            {/* Version list */}
            <div className="w-full md:w-72 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-900 dark:text-white">Versions</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDateRangePrintModal(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
                    title="Download release notes by date range as PDF"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                    </svg>
                    📥 PDF
                  </button>
                  {permissions?.canManageReleases && (
                    <button
                      onClick={openCreateVersionModal}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      New
                    </button>
                  )}
                </div>
              </div>

              {(application.Versions?.length ?? 0) === 0 ? (
                <div className="text-center py-8 bg-white dark:bg-gray-800 rounded-lg shadow text-sm text-gray-500 dark:text-gray-400">
                  No versions yet
                </div>
              ) : (
                <div className="space-y-2">
                  {application.Versions.map((v) => (
                    <div
                      key={v.Id}
                      onClick={() => loadVersionDetail(v)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedVersion?.Id === v.Id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm">{v.VersionNumber}</p>
                          {v.VersionName && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{v.VersionName}</p>
                          )}
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COLORS[v.Status] ?? STATUS_COLORS.Planning}`}>
                          {v.Status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {v.TaskCount} task{v.TaskCount !== 1 ? 's' : ''}
                        {v.ReleaseDate && ` · ${new Date(v.ReleaseDate).toLocaleDateString()}`}
                      </p>
                      {Boolean(v.IsCustomerSpecific) && (
                        <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                          Customer-specific{v.CustomerName ? ` · ${v.CustomerName}` : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Version detail panel */}
            <div className="flex-1">
              {!selectedVersion ? (
                <div className="flex items-center justify-center h-64 bg-white dark:bg-gray-800 rounded-lg shadow text-gray-500 dark:text-gray-400">
                  Select a version to view details
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                  {/* Version header */}
                  <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            {selectedVersion.VersionNumber}
                          </h2>
                          <span className={`text-sm px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selectedVersion.Status] ?? STATUS_COLORS.Planning}`}>
                            {selectedVersion.Status}
                          </span>
                        </div>
                        {selectedVersion.VersionName && (
                          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{selectedVersion.VersionName}</p>
                        )}
                        {Boolean(selectedVersion.IsCustomerSpecific) && (
                          <p className="text-sm text-violet-600 dark:text-violet-400 mt-1">
                            Customer-specific{selectedVersion.CustomerName ? ` · ${selectedVersion.CustomerName}` : ''}
                          </p>
                        )}
                        {selectedVersion.ReleaseDate && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Released: {new Date(selectedVersion.ReleaseDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedVersion.Status === 'Released' && (
                          <>
                            <button
                              onClick={() => handleDownloadVersionPDF(selectedVersion)}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-500 text-blue-600 dark:text-blue-400 rounded-lg text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                              title="Download this version's notes as PDF"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                              </svg>
                              📥 Download PDF
                            </button>
                            <button
                              onClick={() => setShowPatchNotes(!showPatchNotes)}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-green-500 text-green-600 dark:text-green-400 rounded-lg text-sm hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                            >
                              📋 Patch Notes
                            </button>
                          </>
                        )}
                        {permissions?.canManageReleases && (
                          <>
                            <button
                              onClick={() => {
                                openEditVersionModal(selectedVersion);
                              }}
                              title="Edit version"
                              aria-label="Edit version"
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteVersion(selectedVersion)}
                              title="Delete version"
                              aria-label="Delete version"
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Patch notes panel */}
                    {showPatchNotes && selectedVersion.PatchNotes && (
                      <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
                        <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">📋 Patch Notes</h3>
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300"
                          dangerouslySetInnerHTML={{ __html: selectedVersion.PatchNotes }}
                        />
                      </div>
                    )}
                    {showPatchNotes && !selectedVersion.PatchNotes && (
                      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-500 dark:text-gray-400">
                        No patch notes written for this version yet.
                      </div>
                    )}
                  </div>

                  {/* Tasks */}
                  <div className="p-6">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                      Tasks in this version ({versionTasks.length})
                    </h3>
                    {isLoadingTasks ? (
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm py-4">
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        Loading tasks...
                      </div>
                    ) : versionTasks.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No tasks assigned to this version yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {versionTasks.map((task) => (
                          <button
                            key={task.Id}
                            type="button"
                            onClick={() => void handleOpenTaskDetail(task)}
                            className="w-full text-left flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-gray-900 dark:text-white text-sm">{task.TaskName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {task.ProjectName && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{task.ProjectName}</span>
                                )}
                                {task.AssigneeFN && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    · {task.AssigneeFN} {task.AssigneeLN}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-3 shrink-0">
                              {task.StatusName && (
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={pillStyle(task.StatusColor || '#374151', { alpha: '33' })}
                                >
                                  {task.StatusName}
                                </span>
                              )}
                              {task.PriorityName && (
                                <span
                                  className="text-xs px-2 py-0.5 rounded-full"
                                  style={pillStyle(task.PriorityColor || '#374151', { alpha: '33' })}
                                >
                                  {task.PriorityName}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── COMMITS TAB ───────────────────────────────────────────────── */}
        {activeTab === 'commits' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">Commit history</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Recent commits from the application repository
                  {commitsProvider ? ` (${commitsProvider})` : ''}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCommitsLoaded(false);
                  void loadCommits(1, false);
                }}
                disabled={commitsLoading || !application.RepositoryUrl}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors"
              >
                {commitsLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {!application.RepositoryUrl ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No repository URL configured for this application.
              </p>
            ) : commitsLoading && commits.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">Loading commits…</p>
            ) : commitsError ? (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                {commitsError}
              </div>
            ) : commits.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">No commits found.</p>
            ) : (
              <div className="space-y-2">
                {commits.map((c) => {
                  const shortSha = (c.sha || '').slice(0, 7);
                  return (
                    <div
                      key={c.sha || `${c.date}-${c.message}`}
                      className="flex flex-col sm:flex-row sm:items-start gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <code className="text-xs font-mono text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">{shortSha || '—'}</code>
                          <CommitMessage
                            message={c.message || ''}
                            token={token || undefined}
                            onTaskClick={(taskId) => {
                              void handleOpenTaskById(taskId);
                            }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {c.author || 'Unknown author'}
                          {c.date ? ` · ${new Date(c.date).toLocaleString()}` : ''}
                        </div>
                      </div>
                      {c.url && (
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                        >
                          Open
                        </a>
                      )}
                    </div>
                  );
                })}
                {commitsHasMore && (
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      disabled={commitsLoading}
                      onClick={() => void loadCommits(commitsPage + 1, true)}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      {commitsLoading ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Version Modal ─────────────────────────────────────────────────── */}
      {showVersionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[92vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingVersion ? `Edit Version ${editingVersion.VersionNumber}` : 'New Version'}
                </h2>
                <button onClick={closeVersionModal} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
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

              <form onSubmit={handleSaveVersion} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Version Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={versionForm.VersionNumber}
                      onChange={(e) => setVersionForm({ ...versionForm, VersionNumber: e.target.value })}
                      placeholder="e.g. 1.0.0"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Version Name
                    </label>
                    <input
                      type="text"
                      value={versionForm.VersionName}
                      onChange={(e) => setVersionForm({ ...versionForm, VersionName: e.target.value })}
                      placeholder="e.g. Summer Release"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Status
                    </label>
                    <select
                      value={versionForm.Status}
                      onChange={(e) => setVersionForm({ ...versionForm, Status: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      {VERSION_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Release Date
                    </label>
                    <input
                      type="date"
                      value={versionForm.ReleaseDate}
                      onChange={(e) => setVersionForm({ ...versionForm, ReleaseDate: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={versionForm.IsCustomerSpecific}
                      onChange={(e) =>
                        setVersionForm({
                          ...versionForm,
                          IsCustomerSpecific: e.target.checked,
                          CustomerId: e.target.checked ? versionForm.CustomerId : null,
                        })
                      }
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span>Customer-specific version</span>
                  </label>
                </div>

                {versionForm.IsCustomerSpecific && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Customer <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      value={versionForm.CustomerId ?? ''}
                      onChange={(value) =>
                        setVersionForm({
                          ...versionForm,
                          CustomerId: value ? Number(value) : null,
                        })
                      }
                      options={allCustomers.map((customer) => ({
                        value: customer.Id,
                        label: customer.Name,
                      }))}
                      placeholder="Customer"
                      emptyText="Select customer..."
                    />
                  </div>
                )}

                {/* Tasks selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tasks in this version ({versionForm.TaskIds.length} selected)
                  </label>
                  <div className="relative mb-2">
                    <input
                      type="text"
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                      placeholder="Search tasks..."
                      className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg p-2 space-y-1">
                    {filteredAvailableTasks.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 py-2 text-center">No tasks found</p>
                    ) : (
                      filteredAvailableTasks.map((task) => (
                        <label key={task.Id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={versionForm.TaskIds.includes(task.Id)}
                            onChange={() => toggleVersionTask(task.Id)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="text-sm text-gray-900 dark:text-white block truncate">{task.TaskName}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{task.ProjectName}</span>
                          </div>
                          {task.StatusName && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto shrink-0">{task.StatusName}</span>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Patch Notes */}
                <div>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Patch Notes
                      {versionForm.Status !== 'Released' && (
                        <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                          (visible after release)
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGeneratePatchNotes}
                        disabled={versionForm.TaskIds.length === 0}
                        className="h-9 px-3 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white transition-colors"
                        title="Generate patch notes from selected tasks"
                      >
                        Generate from Tasks
                      </button>
                      {isOpenAIAvailable && (
                        <button
                          type="button"
                          onClick={handleImprovePatchNotesWithAI}
                          disabled={isImprovingPatchNotes || (!versionForm.PatchNotes && versionForm.TaskIds.length === 0)}
                          className="h-9 px-3 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white transition-colors"
                          title="Improve patch notes with AI while preserving bullet points"
                        >
                          {isImprovingPatchNotes ? 'Improving...' : 'Improve with AI'}
                        </button>
                      )}
                    </div>
                  </div>
                  <RichTextEditor
                    content={versionForm.PatchNotes}
                    onChange={(val) => setVersionForm({ ...versionForm, PatchNotes: val })}
                    placeholder="Describe what changed in this version..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeVersionModal}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingVersion}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                  >
                    {isSavingVersion ? 'Saving...' : editingVersion ? 'Update Version' : 'Create Version'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showTaskDetailModal && selectedTaskForModal && taskModalProject && (
        <TaskDetailModal
          projectId={taskModalProject.Id}
          organizationId={taskModalProject.OrganizationId}
          task={selectedTaskForModal}
          project={taskModalProject}
          tasks={taskModalTasks}
          onOpenTask={(targetTask) => {
            void handleOpenTaskById(Number(targetTask.Id));
          }}
          onClose={() => {
            setShowTaskDetailModal(false);
            setSelectedTaskForModal(null);
          }}
          onSaved={async () => {
            await loadApplication();
            if (selectedVersion) {
              await loadVersionDetail(selectedVersion);
            }
            setShowTaskDetailModal(false);
            setSelectedTaskForModal(null);
          }}
          token={token || ''}
        />
      )}

      {/* Date Range Print Modal */}
      {showDateRangePrintModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Download Release Notes PDF</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Select a date range to download a PDF with release notes from all released versions within that period.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={printDateRange.startDate}
                    onChange={(e) => setPrintDateRange({ ...printDateRange, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={printDateRange.endDate}
                    onChange={(e) => setPrintDateRange({ ...printDateRange, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowDateRangePrintModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDownloadDateRangePDF}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  📥 Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Management Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Manage Customers
                </h2>
                <button
                  onClick={() => setShowCustomerModal(false)}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Associated Customers
                </label>
                <SearchableMultiSelect
                  values={selectedCustomerIds}
                  onChange={(values) => {
                    const numericValues = values.filter((v): v is number => typeof v === 'number');
                    setSelectedCustomerIds(numericValues);
                  }}
                  options={allCustomers.map(c => ({
                    value: c.Id,
                    label: c.Name,
                    subtitle: c.Email
                  }))}
                  placeholder="Select customers..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCustomers}
                  disabled={isSavingCustomers}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {isSavingCustomers ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmAlertModal
        isOpen={!!dialog}
        type={dialog?.type || 'alert'}
        title={dialog?.title || ''}
        message={dialog?.message || ''}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          dialog?.onConfirm?.();
          setDialog(null);
        }}
        confirmLabel="Delete"
        confirmVariant="danger"
      />

      <ScrollToTopButton />
    </div>
  );
}
