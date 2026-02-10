'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import Navbar from '@/components/Navbar';
import TicketHistory from '@/components/TicketHistory';
import AttachmentUploader, { AttachmentList } from '@/components/AttachmentManager';
import { getTicketAttachments, getTicketAttachment, uploadTicketAttachment, deleteTicketAttachment, TicketAttachment } from '@/lib/api/tickets';
import { tasksApi, CreateTaskData, Task } from '@/lib/api/tasks';
import RichTextEditor from '@/components/RichTextEditor';
import SearchableSelect from '@/components/SearchableSelect';

interface Ticket {
  Id: number;
  OrganizationId: number;
  CustomerId: number | null;
  ProjectId: number | null;
  CreatedByUserId: number;
  AssignedToUserId: number | null;
  DeveloperUserId: number | null;
  ScheduledDate: string | null;
  TicketNumber: string;
  Title: string;
  Description: string | null;
  Status: string;
  Priority: string;
  Category: string;
  CreatedAt: string;
  UpdatedAt: string;
  ResolvedAt: string | null;
  ClosedAt: string | null;
  OrganizationName: string;
  CustomerName: string | null;
  ProjectName: string | null;
  CreatorFirstName: string | null;
  CreatorLastName: string | null;
  CreatorUsername: string;
  CreatorEmail: string;
  AssigneeFirstName: string | null;
  AssigneeLastName: string | null;
  AssigneeUsername: string | null;
  DeveloperFirstName: string | null;
  DeveloperLastName: string | null;
  DeveloperUsername: string | null;
}

interface Comment {
  Id: number;
  TicketId: number;
  UserId: number;
  Comment: string;
  IsInternal: number;
  CreatedAt: string;
  FirstName: string | null;
  LastName: string | null;
  Username: string;
  Email: string;
}

interface OrgMember {
  Id: number;
  FirstName: string | null;
  LastName: string | null;
  Username: string;
}

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const CATEGORIES = ['Support', 'Bug', 'Feature Request', 'Question', 'Other'];
const STATUSES = ['Open', 'In Progress', 'With Developer', 'Scheduled', 'Waiting Response', 'Resolved', 'Closed'];

export default function TicketDetailPage() {
  const { user, token, isLoading, isCustomerUser } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id;

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [organizations, setOrganizations] = useState<{Id: number, Name: string}[]>([]);
  const [customers, setCustomers] = useState<{Id: number, Name: string}[]>([]);
  const [projects, setProjects] = useState<{Id: number, ProjectName: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    status: '',
    priority: '',
    category: '',
    assignedToUserId: '',
    developerUserId: '',
    scheduledDate: '',
    organizationId: '',
    customerId: '',
    projectId: '',
  });
  const [saving, setSaving] = useState(false);

  // Comment state
  const [newComment, setNewComment] = useState('');
  const [isInternalComment, setIsInternalComment] = useState(false);
  const [addingComment, setAddingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<File[]>([]);

  // Tab state
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'history' | 'attachments' | 'tasks'>('details');

  // Attachments state
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  // Create task state
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState<CreateTaskData>({
    projectId: 0,
    taskName: '',
    description: '',
    status: null,
    priority: null,
    estimatedHours: 0,
  });
  const [creatingTask, setCreatingTask] = useState(false);

  // Associated tasks state
  const [associatedTasks, setAssociatedTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [commentAttachmentsMap, setCommentAttachmentsMap] = useState<Record<number, TicketAttachment[]>>({});

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (token && ticketId) {
      loadTicket();
    }
  }, [token, ticketId]);

  // Load comment attachments whenever comments change
  useEffect(() => {
    const loadAllCommentAttachments = async () => {
      if (!token || comments.length === 0) return;
      
      const attachmentsMap: Record<number, TicketAttachment[]> = {};
      
      await Promise.all(
        comments.map(async (comment: any) => {
          try {
            const attRes = await fetch(
              `${getApiUrl()}/api/ticket-attachments/comment/${comment.Id}`,
              { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (attRes.ok) {
              const attData = await attRes.json();
              attachmentsMap[comment.Id] = attData.data || [];
            }
          } catch (err) {
            console.error(`Failed to load attachments for comment ${comment.Id}:`, err);
          }
        })
      );
      
      setCommentAttachmentsMap(attachmentsMap);
    };
    
    loadAllCommentAttachments();
  }, [comments, token]);

  const loadCustomersAndProjects = async (orgId: number | string) => {
    if (!token) return;

    try {
      // Load customers for this organization
      const customersRes = await fetch(
        `${getApiUrl()}/api/customers?organizationId=${orgId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (customersRes.ok) {
        const customersData = await customersRes.json();
        setCustomers(customersData.data || []);
      }

      // Load projects for this organization
      const projectsRes = await fetch(
        `${getApiUrl()}/api/projects?organizationId=${orgId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData.projects || []);
      }
    } catch (err) {
      console.error('Failed to load customers and projects:', err);
    }
  };

  const handleOrganizationChange = async (newOrgId: string) => {
    setEditForm(prev => ({ 
      ...prev, 
      organizationId: newOrgId,
      customerId: '', // Reset customer when org changes
      projectId: ''   // Reset project when org changes
    }));

    if (newOrgId) {
      await loadCustomersAndProjects(newOrgId);
    } else {
      setCustomers([]);
      setProjects([]);
    }
  };

  const loadTicket = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${getApiUrl()}/api/tickets/${ticketId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!res.ok) {
        if (res.status === 404) {
          setError('Ticket not found');
        } else if (res.status === 403) {
          setError('Access denied');
        } else {
          throw new Error('Failed to load ticket');
        }
        return;
      }

      const data = await res.json();
      setTicket(data.ticket);
      setComments(data.comments || []);
      
      // Format scheduled date for input
      const scheduledDateStr = data.ticket.ScheduledDate 
        ? (data.ticket.ScheduledDate instanceof Date 
            ? data.ticket.ScheduledDate.toISOString().split('T')[0]
            : String(data.ticket.ScheduledDate).split('T')[0])
        : '';
      
      setEditForm({
        title: data.ticket.Title,
        description: data.ticket.Description || '',
        status: data.ticket.Status,
        priority: data.ticket.Priority,
        category: data.ticket.Category,
        assignedToUserId: data.ticket.AssignedToUserId?.toString() || '',
        developerUserId: data.ticket.DeveloperUserId?.toString() || '',
        scheduledDate: scheduledDateStr,
        organizationId: data.ticket.OrganizationId?.toString() || '',
        customerId: data.ticket.CustomerId?.toString() || '',
        projectId: data.ticket.ProjectId?.toString() || '',
      });

      // Load org members for assignment (if not customer user)
      if (!isCustomerUser && data.ticket.OrganizationId) {
        const membersRes = await fetch(
          `${getApiUrl()}/api/organizations/${data.ticket.OrganizationId}/users`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (membersRes.ok) {
          const membersData = await membersRes.json();
          setOrgMembers(membersData.users || []);
        }
      }

      // Load organizations and customers for managers/admins
      if (user?.isManager || user?.isAdmin) {
        const orgsRes = await fetch(
          `${getApiUrl()}/api/organizations`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (orgsRes.ok) {
          const orgsData = await orgsRes.json();
          setOrganizations(orgsData.organizations || []);
        }

        // Load customers and projects filtered by organization
        if (data.ticket.OrganizationId) {
          await loadCustomersAndProjects(data.ticket.OrganizationId);
        }
      }
    } catch (err) {
      console.error('Failed to load ticket:', err);
      setError('Failed to load ticket');
    } finally {
      setLoading(false);
    }
  };

  const loadAttachments = async () => {
    if (!token || !ticketId) return;
    
    try {
      setLoadingAttachments(true);
      const data = await getTicketAttachments(parseInt(Array.isArray(ticketId) ? ticketId[0] : ticketId), token);
      setAttachments(data);
    } catch (err: any) {
      console.error('Failed to load attachments:', err);
    } finally {
      setLoadingAttachments(false);
    }
  };

  const loadAssociatedTasks = async () => {
    if (!token || !ticketId || isCustomerUser) return;
    
    try {
      setLoadingTasks(true);
      const data = await tasksApi.getByTicket(parseInt(Array.isArray(ticketId) ? ticketId[0] : ticketId), token);
      setAssociatedTasks(data.tasks || []);
    } catch (err: any) {
      console.error('Failed to load associated tasks:', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleOpenCreateTaskModal = () => {
    if (!ticket || !ticket.ProjectId) {
      setError('This ticket must be associated with a project to create a task');
      return;
    }

    // Pre-fill task form with ticket data
    setTaskForm({
      projectId: ticket.ProjectId,
      taskName: ticket.Title,
      description: ticket.Description || '',
      status: null,
      priority: null,
      assignedTo: ticket.AssignedToUserId || undefined,
      estimatedHours: 0,
      ticketId: ticket.Id,
    });
    setShowCreateTaskModal(true);
  };

  const handleCreateTask = async () => {
    if (!token || !taskForm.taskName.trim()) {
      setError('Task name is required');
      return;
    }

    setCreatingTask(true);
    setError('');

    try {
      const result = await tasksApi.create(taskForm, token);
      setShowCreateTaskModal(false);
      // Reload associated tasks
      await loadAssociatedTasks();
      // Show success message and redirect to project
      router.push(`/projects/${taskForm.projectId}?taskId=${result.taskId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  };

  const handleUploadAttachment = async (fileName: string, fileType: string, fileSize: number, fileData: string) => {
    if (!token || !ticketId) return;
    
    try {
      await uploadTicketAttachment(parseInt(Array.isArray(ticketId) ? ticketId[0] : ticketId), fileName, fileType, fileSize, fileData, token);
      await loadAttachments();
    } catch (err: any) {
      throw new Error(err.message || 'Failed to upload attachment');
    }
  };

  const handleDownloadAttachment = async (attachmentId: number) => {
    if (!token) return;
    
    try {
      const attachment = await getTicketAttachment(attachmentId, token);
      
      // Create blob from base64
      const byteCharacters = atob(attachment.FileData || '');
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.FileType });
      
      // Download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.FileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err.message || 'Failed to download attachment');
    }
  };

  const handlePreviewAttachment = async (attachmentId: number) => {
    if (!token) return;
    
    try {
      const attachment = await getTicketAttachment(attachmentId, token);
      
      // Create blob from base64
      const byteCharacters = atob(attachment.FileData || '');
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.FileType });
      
      // Open in new tab
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      
      // Clean up URL after a delay
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      alert(err.message || 'Failed to preview attachment');
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!token) return;
    
    if (!confirm('Are you sure you want to delete this attachment?')) return;
    
    try {
      await deleteTicketAttachment(attachmentId, token);
      await loadAttachments();
    } catch (err: any) {
      alert(err.message || 'Failed to delete attachment');
    }
  };

  const handleSave = async () => {
    if (!editForm.title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch(
        `${getApiUrl()}/api/tickets/${ticketId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: editForm.title.trim(),
            description: editForm.description || null,
            status: editForm.status,
            priority: editForm.priority,
            category: editForm.category,
            assignedToUserId: editForm.assignedToUserId ? parseInt(editForm.assignedToUserId) : null,
            developerUserId: editForm.developerUserId ? parseInt(editForm.developerUserId) : null,
            scheduledDate: editForm.scheduledDate || null,
            organizationId: editForm.organizationId ? parseInt(editForm.organizationId) : null,
            customerId: editForm.customerId ? parseInt(editForm.customerId) : null,
            projectId: editForm.projectId ? parseInt(editForm.projectId) : null,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update ticket');
      }

      setIsEditing(false);
      await loadTicket();
    } catch (err: any) {
      setError(err.message || 'Failed to update ticket');
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setAddingComment(true);
    setError('');

    try {
      const res = await fetch(
        `${getApiUrl()}/api/tickets/${ticketId}/comments`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            comment: newComment.trim(),
            isInternal: isInternalComment,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to add comment');
      }

      const data = await res.json();
      const commentId = data.commentId;
      
      // Upload comment attachments if any
      if (commentAttachments.length > 0 && commentId) {
        for (const file of commentAttachments) {
          try {
            const reader = new FileReader();
            await new Promise((resolve, reject) => {
              reader.onloadend = async () => {
                try {
                  const base64Data = (reader.result as string).split(',')[1];
                  await fetch(
                    `${getApiUrl()}/api/ticket-attachments/comment/${commentId}`,
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
                        fileData: base64Data,
                      }),
                    }
                  );
                  resolve(null);
                } catch (err) {
                  reject(err);
                }
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          } catch (err) {
            console.error('Failed to upload comment attachment:', err);
          }
        }
      }

      setNewComment('');
      setIsInternalComment(false);
      setCommentAttachments([]);
      await loadTicket();
    } catch (err: any) {
      setError(err.message || 'Failed to add comment');
    } finally {
      setAddingComment(false);
    }
  };

  const quickStatusChange = async (newStatus: string) => {
    try {
      const res = await fetch(
        `${getApiUrl()}/api/tickets/${ticketId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (res.ok) {
        await loadTicket();
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-700';
      case 'High': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300 dark:border-orange-700';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700';
      case 'Low': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-300 dark:border-green-700';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'In Progress': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case 'With Developer': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
      case 'Scheduled': return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
      case 'Waiting Response': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'Resolved': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'Closed': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Bug': return '🐛';
      case 'Feature Request': return '✨';
      case 'Support': return '🎧';
      case 'Question': return '❓';
      default: return '📋';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDisplayName = (firstName: string | null, lastName: string | null, username: string) => {
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    return username;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

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

  if (error && !ticket) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <Navbar />
        <div className="max-w-4xl mx-auto py-12 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
            <div className="text-4xl mb-4">😕</div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{error}</h2>
            <button
              onClick={() => router.push('/tickets')}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Back to Tickets
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />

      <main className="max-w-6xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/tickets')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Tickets
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{getCategoryIcon(ticket.Category)}</span>
                <span className="font-mono text-sm text-gray-500 dark:text-gray-400">{ticket.TicketNumber}</span>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(ticket.Status)}`}>
                  {ticket.Status}
                </span>
                <span className={`px-3 py-1 text-sm font-medium rounded-full border ${getPriorityColor(ticket.Priority)}`}>
                  {ticket.Priority}
                </span>
              </div>
              
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full text-2xl font-bold px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {ticket.Title}
                </h1>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </>
              ) : (
                <>
                  {permissions?.canCreateTaskFromTicket && ticket.ProjectId && (
                    <button
                      onClick={handleOpenCreateTaskModal}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create Task
                    </button>
                  )}
                  {permissions?.canManageTickets && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      Edit
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'details'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('comments')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'comments'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Comments ({comments.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              History
            </button>
            <button
              onClick={() => {
                setActiveTab('attachments');
                if (attachments.length === 0) {
                  loadAttachments();
                }
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'attachments'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Attachments ({attachments.length})
            </button>
            {!isCustomerUser && (user?.isManager || !!user?.isAdmin) && (
              <button
                onClick={() => {
                  setActiveTab('tasks');
                  if (associatedTasks.length === 0) {
                    loadAssociatedTasks();
                  }
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'tasks'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                Tasks ({associatedTasks.length})
              </button>
            )}
          </nav>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Details Tab */}
            {activeTab === 'details' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Description</h2>
              {isEditing ? (
                <RichTextEditor
                  content={editForm.description}
                  onChange={(html) => setEditForm(prev => ({ ...prev, description: html }))}
                  placeholder="Add a description..."
                />
              ) : (
                <div className="prose dark:prose-invert max-w-none">
                  {ticket.Description ? (
                    <div dangerouslySetInnerHTML={{ __html: ticket.Description }} />
                  ) : (
                    <p className="text-gray-400 dark:text-gray-500 italic">No description provided</p>
                  )}
                </div>
              )}
              </div>
            )}

            {/* Comments Tab */}
            {activeTab === 'comments' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">

              {/* Comments List */}
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {comments.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                    No comments yet. Be the first to comment!
                  </div>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.Id} className={`p-6 ${comment.IsInternal ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}>
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-sm font-medium text-blue-600 dark:text-blue-400 flex-shrink-0">
                          {comment.FirstName?.[0] || comment.Username[0].toUpperCase()}
                          {comment.LastName?.[0] || ''}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {getDisplayName(comment.FirstName, comment.LastName, comment.Username)}
                            </span>
                            {comment.IsInternal === 1 && (
                              <span className="px-2 py-0.5 text-xs bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded">
                                Internal Note
                              </span>
                            )}
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {formatDate(comment.CreatedAt)}
                            </span>
                          </div>
                          <div
                            className="text-gray-700 dark:text-gray-300 prose prose-sm dark:prose-invert max-w-none"
                            dangerouslySetInnerHTML={{ __html: comment.Comment }}
                          />
                          
                          {/* Comment Attachments */}
                          {commentAttachmentsMap[comment.Id]?.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {commentAttachmentsMap[comment.Id].map((att: TicketAttachment) => {
                                const canPreview = att.FileType.startsWith('image/') || att.FileType === 'application/pdf';
                                return (
                                  <div
                                    key={att.Id}
                                    className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm"
                                  >
                                    <span>📎 {att.FileName}</span>
                                    <div className="flex items-center gap-1">
                                      {canPreview && (
                                        <button
                                          onClick={() => handlePreviewAttachment(att.Id)}
                                          className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 transition-colors"
                                          title="Preview"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                          </svg>
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleDownloadAttachment(att.Id)}
                                        className="p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                                        title="Download"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment Form */}
              <form onSubmit={handleAddComment} className="p-6 border-t border-gray-200 dark:border-gray-700">
                <RichTextEditor
                  content={newComment}
                  onChange={setNewComment}
                  placeholder="Write a comment..."
                />
                
                {/* Comment Attachments */}
                <div className="mb-3">
                  <label className="inline-flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer text-sm">
                    📎 Attach Files
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          setCommentAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                        }
                      }}
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    />
                  </label>
                  {commentAttachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {commentAttachments.map((file, idx) => (
                        <div key={idx} className="inline-flex items-center gap-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded text-sm">
                          <span>📎 {file.name}</span>
                          <button
                            type="button"
                            onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))}
                            className="text-red-500 hover:text-red-700"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between">
                  {!isCustomerUser && (
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={isInternalComment}
                        onChange={(e) => setIsInternalComment(e.target.checked)}
                        className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-500"
                      />
                      Internal note (not visible to customer)
                    </label>
                  )}
                  <button
                    type="submit"
                    disabled={addingComment || !newComment.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                  >
                    {addingComment ? 'Adding...' : 'Add Comment'}
                  </button>
                </div>
              </form>
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <TicketHistory ticketId={parseInt(Array.isArray(ticketId) ? ticketId[0] : ticketId || '0')} token={token || ''} />
              </div>
            )}

            {/* Tasks Tab */}
            {activeTab === 'tasks' && !isCustomerUser && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Associated Tasks</h2>
                {loadingTasks ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                  </div>
                ) : associatedTasks.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      No tasks created from this ticket yet
                    </p>
                    {permissions?.canCreateTaskFromTicket && ticket.ProjectId && (
                      <button
                        onClick={handleOpenCreateTaskModal}
                        className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                      >
                        Create First Task
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {associatedTasks.map((task) => (
                      <div
                        key={task.Id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/projects/${task.ProjectId}?taskId=${task.Id}`)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-medium text-gray-900 dark:text-white">{task.TaskName}</h3>
                          <span className="px-2 py-1 text-xs font-medium rounded" style={{ backgroundColor: task.StatusColor ? `${task.StatusColor}20` : undefined, color: task.StatusColor || undefined }}>
                            {task.StatusName || 'Unknown'}
                          </span>
                        </div>
                        
                        {task.Description && (() => {
                          const plainText = task.Description.replace(/<[^>]*>/g, '').trim();
                          return plainText ? (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{plainText}</p>
                          ) : null;
                        })()}
                        
                        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                          <span className="px-2 py-0.5 rounded" style={{ backgroundColor: task.PriorityColor ? `${task.PriorityColor}20` : undefined, color: task.PriorityColor || undefined }}>
                            {task.PriorityName || 'Unknown'}
                          </span>
                          
                          {task.AssigneeName && (
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              {task.AssigneeName}
                            </span>
                          )}
                          
                          {task.EstimatedHours && (
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {task.EstimatedHours}h
                              {task.WorkedHours ? ` / ${task.WorkedHours}h worked` : ''}
                            </span>
                          )}
                          
                          <span className="ml-auto text-gray-400">
                            {task.ProjectName}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Attachments Tab */}
            {activeTab === 'attachments' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Upload Attachment</h3>
                  <AttachmentUploader onUpload={handleUploadAttachment} />
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Attachments ({attachments.length})
                  </h3>
                  {loadingAttachments ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                  ) : (
                    <AttachmentList
                      attachments={attachments}
                      currentUserId={user.id}
                      isAdmin={user.isAdmin || false}
                      onDownload={handleDownloadAttachment}
                      onPreview={handlePreviewAttachment}
                      onDelete={handleDeleteAttachment}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions (for non-customer users) */}
            {!isCustomerUser && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                  Quick Actions
                </h3>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.filter(s => s !== ticket.Status).map(status => (
                    <button
                      key={status}
                      onClick={() => quickStatusChange(status)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors hover:opacity-80 ${getStatusColor(status)}`}
                    >
                      → {status}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Details */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                Details
              </h3>
              <dl className="space-y-4">
                {/* Status */}
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Status</dt>
                  {isEditing && !isCustomerUser ? (
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <dd className={`mt-1 inline-block px-2 py-1 text-sm rounded-full ${getStatusColor(ticket.Status)}`}>
                      {ticket.Status}
                    </dd>
                  )}
                </div>

                {/* Priority */}
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Priority</dt>
                  {isEditing && !isCustomerUser ? (
                    <select
                      value={editForm.priority}
                      onChange={(e) => setEditForm(prev => ({ ...prev, priority: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <dd className={`mt-1 inline-block px-2 py-1 text-sm rounded-full border ${getPriorityColor(ticket.Priority)}`}>
                      {ticket.Priority}
                    </dd>
                  )}
                </div>

                {/* Category */}
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Category</dt>
                  {isEditing && !isCustomerUser ? (
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                      {getCategoryIcon(ticket.Category)} {ticket.Category}
                    </dd>
                  )}
                </div>

                {/* Organization (Manager/Admin only) */}
                {(user?.isManager || user?.isAdmin) && (
                  <div>
                    <dt className="text-sm text-gray-500 dark:text-gray-400">Organization</dt>
                    {isEditing ? (
                      <SearchableSelect
                        value={editForm.organizationId}
                        onChange={handleOrganizationChange}
                        options={organizations.map(org => ({ value: org.Id, label: org.Name }))}
                        placeholder="Select Organization"
                        emptyText="Select Organization"
                        className="mt-1"
                      />
                    ) : (
                      <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                        {ticket.OrganizationName || 'N/A'}
                      </dd>
                    )}
                  </div>
                )}

                {/* Customer (Manager/Admin only) */}
                {(user?.isManager || user?.isAdmin) && (
                  <div>
                    <dt className="text-sm text-gray-500 dark:text-gray-400">Customer</dt>
                    {isEditing ? (
                      <SearchableSelect
                        value={editForm.customerId}
                        onChange={(value) => setEditForm(prev => ({ ...prev, customerId: value }))}
                        options={customers.map(customer => ({ value: customer.Id, label: customer.Name }))}
                        placeholder="Select Customer"
                        emptyText="No Customer"
                        className="mt-1"
                      />
                    ) : (
                      <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                        {ticket.CustomerName || 'N/A'}
                      </dd>
                    )}
                  </div>
                )}

                {/* Project (Manager/Admin only) */}
                {(user?.isManager || user?.isAdmin) && (
                  <div>
                    <dt className="text-sm text-gray-500 dark:text-gray-400">Project</dt>
                    {isEditing ? (
                      <SearchableSelect
                        value={editForm.projectId}
                        onChange={(value) => setEditForm(prev => ({ ...prev, projectId: value }))}
                        options={projects.map(project => ({ value: project.Id, label: project.ProjectName }))}
                        placeholder="Select Project"
                        emptyText="No Project"
                        className="mt-1"
                      />
                    ) : (
                      <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                        {ticket.ProjectName || 'N/A'}
                      </dd>
                    )}
                  </div>
                )}

                {/* Assignee */}
                {!isCustomerUser && (
                  <div>
                    <dt className="text-sm text-gray-500 dark:text-gray-400">Assignee</dt>
                    {isEditing ? (
                      <SearchableSelect
                        value={editForm.assignedToUserId}
                        onChange={(value) => setEditForm(prev => ({ ...prev, assignedToUserId: value }))}
                        options={orgMembers.map(member => ({
                          value: member.Id,
                          label: getDisplayName(member.FirstName, member.LastName, member.Username)
                        }))}
                        placeholder="Select Assignee"
                        emptyText="Unassigned"
                        className="mt-1"
                      />
                    ) : (
                      <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                        {ticket.AssigneeFirstName ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-xs font-medium text-blue-600 dark:text-blue-400">
                              {ticket.AssigneeFirstName[0]}{ticket.AssigneeLastName?.[0] || ''}
                            </div>
                            {getDisplayName(ticket.AssigneeFirstName, ticket.AssigneeLastName, ticket.AssigneeUsername || '')}
                          </div>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">Unassigned</span>
                        )}
                      </dd>
                    )}
                  </div>
                )}

                {/* Developer */}
                {!isCustomerUser && (
                  <div>
                    <dt className="text-sm text-gray-500 dark:text-gray-400">Developer</dt>
                    {isEditing ? (
                      <SearchableSelect
                        value={editForm.developerUserId}
                        onChange={(value) => setEditForm(prev => ({ ...prev, developerUserId: value }))}
                        options={orgMembers.map(member => ({
                          value: member.Id,
                          label: getDisplayName(member.FirstName, member.LastName, member.Username)
                        }))}
                        placeholder="Select Developer"
                        emptyText="No developer assigned"
                        className="mt-1"
                      />
                    ) : (
                      <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                        {ticket.DeveloperFirstName ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center text-xs font-medium text-purple-600 dark:text-purple-400">
                              {ticket.DeveloperFirstName[0]}{ticket.DeveloperLastName?.[0] || ''}
                            </div>
                            {getDisplayName(ticket.DeveloperFirstName, ticket.DeveloperLastName, ticket.DeveloperUsername || '')}
                          </div>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">No developer</span>
                        )}
                      </dd>
                    )}
                  </div>
                )}

                {/* Scheduled Date */}
                {!isCustomerUser && (
                  <div>
                    <dt className="text-sm text-gray-500 dark:text-gray-400">Scheduled Date</dt>
                    {isEditing ? (
                      <input
                        type="date"
                        value={editForm.scheduledDate}
                        onChange={(e) => setEditForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    ) : (
                      <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                        {ticket.ScheduledDate ? (
                          <span className="inline-flex items-center gap-1">
                            <span>📅</span>
                            {new Date(ticket.ScheduledDate).toLocaleDateString('en-US', { 
                              weekday: 'short', 
                              month: 'short', 
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">Not scheduled</span>
                        )}
                      </dd>
                    )}
                  </div>
                )}

                <hr className="border-gray-200 dark:border-gray-700" />

                {/* Created By */}
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Created By</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {getDisplayName(ticket.CreatorFirstName, ticket.CreatorLastName, ticket.CreatorUsername)}
                  </dd>
                </div>

                {/* Created At */}
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {formatDate(ticket.CreatedAt)}
                  </dd>
                </div>

                {/* Updated At */}
                <div>
                  <dt className="text-sm text-gray-500 dark:text-gray-400">Last Updated</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {formatDate(ticket.UpdatedAt)}
                  </dd>
                </div>

                {/* Resolved At */}
                {ticket.ResolvedAt && (
                  <div>
                    <dt className="text-sm text-gray-500 dark:text-gray-400">Resolved</dt>
                    <dd className="mt-1 text-sm text-green-600 dark:text-green-400">
                      ✓ {formatDate(ticket.ResolvedAt)}
                    </dd>
                  </div>
                )}

                {/* Closed At */}
                {ticket.ClosedAt && (
                  <div>
                    <dt className="text-sm text-gray-500 dark:text-gray-400">Closed</dt>
                    <dd className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(ticket.ClosedAt)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      </main>

      {/* Create Task Modal */}
      {showCreateTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create Task from Ticket</h2>
                <button
                  onClick={() => setShowCreateTaskModal(false)}
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

              <div className="space-y-4">
                {/* Task Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Task Name *
                  </label>
                  <input
                    type="text"
                    value={taskForm.taskName}
                    onChange={(e) => setTaskForm({ ...taskForm, taskName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Enter task name"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={taskForm.description}
                    onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Enter task description"
                  />
                </div>

                {/* Priority and Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Priority
                    </label>
                    <select
                      value={taskForm.priority ?? ''}
                      onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value ? parseInt(e.target.value) : null })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Select Priority</option>
                      <option value="1">Low</option>
                      <option value="2">Medium</option>
                      <option value="3">High</option>
                      <option value="4">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Status
                    </label>
                    <select
                      value={taskForm.status ?? ''}
                      onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value ? parseInt(e.target.value) : null })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Select Status</option>
                      <option value="1">To Do</option>
                      <option value="2">In Progress</option>
                      <option value="3">Done</option>
                    </select>
                  </div>
                </div>

                {/* Estimated Hours */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Estimated Hours
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={taskForm.estimatedHours}
                    onChange={(e) => setTaskForm({ ...taskForm, estimatedHours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="0"
                  />
                </div>

                {/* Assigned To */}
                {orgMembers.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Assigned To
                    </label>
                    <SearchableSelect
                      value={taskForm.assignedTo || ''}
                      onChange={(value) => setTaskForm({ ...taskForm, assignedTo: value ? parseInt(value) : undefined })}
                      options={orgMembers.map((member) => ({
                        value: member.Id,
                        label: member.FirstName && member.LastName
                          ? `${member.FirstName} ${member.LastName} (${member.Username})`
                          : member.Username
                      }))}
                      placeholder="Select Assignee"
                      emptyText="Unassigned"
                    />
                  </div>
                )}

                {/* Info Message */}
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    <strong>Note:</strong> This task will be created in the project: <strong>{ticket?.ProjectName}</strong>
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateTaskModal(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateTask}
                  disabled={creatingTask || !taskForm.taskName.trim()}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-6 py-3 rounded-lg transition-colors font-medium"
                >
                  {creatingTask ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
