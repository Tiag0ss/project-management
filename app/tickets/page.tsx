'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import Navbar from '@/components/Navbar';
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
  ExternalTicketId: string | null;
  OrganizationName: string;
  CustomerName: string | null;
  ProjectName: string | null;
  CreatorFirstName: string | null;
  CreatorLastName: string | null;
  CreatorUsername: string;
  AssigneeFirstName: string | null;
  AssigneeLastName: string | null;
  AssigneeUsername: string | null;
  DeveloperFirstName: string | null;
  DeveloperLastName: string | null;
  DeveloperUsername: string | null;
  CommentCount: number;
}

interface Organization {
  Id: number;
  Name: string;
}

interface Project {
  Id: number;
  ProjectName: string;
}

interface Customer {
  Id: number;
  Name: string;
}

interface UserOption {
  Id: number;
  Username: string;
  FirstName: string | null;
  LastName: string | null;
}

interface Stats {
  total: number;
  open: number;
  inProgress: number;
  waiting: number;
  resolved: number;
  closed: number;
  urgent: number;
  high: number;
}

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const CATEGORIES = ['Support', 'Bug', 'Feature Request', 'Question', 'Other'];
const STATUSES = ['Open', 'In Progress', 'With Developer', 'Scheduled', 'Waiting Response', 'Resolved', 'Closed'];

export default function TicketsPage() {
  const { user, token, isLoading, isCustomerUser } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [filterOrg, setFilterOrg] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterDeveloper, setFilterDeveloper] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterCreatedFrom, setFilterCreatedFrom] = useState('');
  const [filterCreatedTo, setFilterCreatedTo] = useState('');
  const [filterScheduledFrom, setFilterScheduledFrom] = useState('');
  const [filterScheduledTo, setFilterScheduledTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMyTicketsOnly, setShowMyTicketsOnly] = useState(true);
  const [showClosed, setShowClosed] = useState(false);
  
  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    organizationId: '',
    customerId: '',
    projectId: '',
    title: '',
    description: '',
    priority: 'Medium',
    category: 'Support',
    externalTicketId: '',
  });
  const [creating, setCreating] = useState(false);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [jiraIntegration, setJiraIntegration] = useState<any>(null);
  const [jiraIssues, setJiraIssues] = useState<any[]>([]);
  const [searchingJira, setSearchingJira] = useState(false);
  const [jiraSearchQuery, setJiraSearchQuery] = useState('');
  const [jiraIntegrations, setJiraIntegrations] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token, filterOrg, filterStatus, filterPriority, filterCategory, filterAssignee, filterDeveloper, filterCustomer, filterCreatedFrom, filterCreatedTo, filterScheduledFrom, filterScheduledTo, searchQuery, showClosed]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load tickets
      const params = new URLSearchParams();
      if (filterOrg) params.append('organizationId', filterOrg);
      if (filterStatus) params.append('status', filterStatus);
      if (filterPriority) params.append('priority', filterPriority);
      if (filterCategory) params.append('category', filterCategory);
      if (filterAssignee) params.append('assignedTo', filterAssignee);
      if (filterDeveloper) params.append('developer', filterDeveloper);
      if (filterCustomer) params.append('customer', filterCustomer);
      if (filterCreatedFrom) params.append('createdFrom', filterCreatedFrom);
      if (filterCreatedTo) params.append('createdTo', filterCreatedTo);
      if (filterScheduledFrom) params.append('scheduledFrom', filterScheduledFrom);
      if (filterScheduledTo) params.append('scheduledTo', filterScheduledTo);
      if (searchQuery) params.append('search', searchQuery);
      if (!showClosed) params.append('excludeClosed', 'true');
      
      const ticketsRes = await fetch(
        `${getApiUrl()}/api/tickets?${params}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (ticketsRes.ok) {
        const data = await ticketsRes.json();
        setTickets(data.tickets || []);
        
        // Load Jira integrations for organizations with tickets
        const uniqueOrgIds = [...new Set((data.tickets || []).map((t: Ticket) => t.OrganizationId))] as number[];
        const integrationMap = new Map<number, string>();
        
        for (const orgId of uniqueOrgIds) {
          try {
            const jiraRes = await fetch(
              `${getApiUrl()}/api/jira-integrations/organization/${orgId}`,
              { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (jiraRes.ok) {
              const jiraData = await jiraRes.json();
              if (jiraData.integration && jiraData.integration.IsEnabled) {
                integrationMap.set(orgId, jiraData.integration.JiraUrl);
              }
            }
          } catch (err) {
            console.error(`Failed to load Jira integration for org ${orgId}:`, err);
          }
        }
        
        setJiraIntegrations(integrationMap);
      }

      // Load stats
      const statsRes = await fetch(
        `${getApiUrl()}/api/tickets/stats/summary${filterOrg ? `?organizationId=${filterOrg}` : ''}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }

      // Load organizations (for filters and create modal) - all users need this
      const orgsRes = await fetch(
        `${getApiUrl()}/api/organizations`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (orgsRes.ok) {
        const data = await orgsRes.json();
        setOrganizations(data.organizations || []);
        
        // Auto-select first org if only one available
        if ((data.organizations || []).length === 1 && !createForm.organizationId) {
          setCreateForm(prev => ({ ...prev, organizationId: data.organizations[0].Id.toString() }));
        }
      }

      // Load users for assignee/developer filters
      if (!isCustomerUser) {
        const usersRes = await fetch(
          `${getApiUrl()}/api/users`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (usersRes.ok) {
          const data = await usersRes.json();
          setUsers(data.users || []);
        }
      }

      // Load customers for customer filter
      if (!isCustomerUser) {
        const customersRes = await fetch(
          `${getApiUrl()}/api/customers`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (customersRes.ok) {
          const data = await customersRes.json();
          console.log('Customers data received:', data);
          setCustomers(data.data || []);
        } else {
          console.error('Failed to load customers, status:', customersRes.status);
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async (orgId: string) => {
    if (!orgId) {
      setProjects([]);
      return;
    }
    try {
      const res = await fetch(
        `${getApiUrl()}/api/projects?organizationId=${orgId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };

  const loadJiraIntegration = async (orgId: string) => {
    if (!orgId) {
      setJiraIntegration(null);
      return;
    }
    try {
      const res = await fetch(
        `${getApiUrl()}/api/jira-integrations/organization/${orgId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.integration && data.integration.IsEnabled) {
          setJiraIntegration(data.integration);
        } else {
          setJiraIntegration(null);
        }
      }
    } catch (err) {
      console.error('Failed to load Jira integration:', err);
      setJiraIntegration(null);
    }
  };

  const searchJiraIssues = async (query: string) => {
    if (!createForm.organizationId || !jiraIntegration) return;
    
    setSearchingJira(true);
    try {
      const res = await fetch(
        `${getApiUrl()}/api/jira-integrations/organization/${createForm.organizationId}/search?query=${encodeURIComponent(query)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setJiraIssues(data.issues || []);
      }
    } catch (err) {
      console.error('Failed to search Jira issues:', err);
    } finally {
      setSearchingJira(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      setError('Title is required');
      return;
    }
    
    // For customer users, use first available org or require selection
    let orgId = createForm.organizationId;
    if (isCustomerUser && !orgId && organizations.length > 0) {
      orgId = organizations[0].Id.toString();
    }
    
    if (!orgId) {
      setError('Organization is required');
      return;
    }

    // Customer is required for non-customer users
    if (!isCustomerUser && !createForm.customerId) {
      setError('Customer is required');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const res = await fetch(
        `${getApiUrl()}/api/tickets`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organizationId: parseInt(orgId),
            customerId: createForm.customerId ? parseInt(createForm.customerId) : null,
            projectId: createForm.projectId ? parseInt(createForm.projectId) : null,
            title: createForm.title.trim(),
            description: createForm.description || null,
            priority: createForm.priority,
            category: createForm.category,
            externalTicketId: createForm.externalTicketId || null,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create ticket');
      }

      const data = await res.json();
      const ticketId = data.ticketId;
      
      // Upload attachments if any
      if (attachmentFiles.length > 0) {
        for (const file of attachmentFiles) {
          try {
            const reader = new FileReader();
            await new Promise((resolve, reject) => {
              reader.onloadend = async () => {
                try {
                  const base64Data = (reader.result as string).split(',')[1];
                  await fetch(
                    `${getApiUrl()}/api/ticket-attachments/ticket/${ticketId}`,
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
            console.error('Failed to upload attachment:', err);
          }
        }
      }
      
      setShowCreateModal(false);
      setCreateForm({
        organizationId: '',
        customerId: '',
        projectId: '',
        title: '',
        description: '',
        priority: 'Medium',
        category: 'Support',
        externalTicketId: '',
      });
      setAttachmentFiles([]);
      setJiraIntegration(null);
      setJiraIssues([]);
      setJiraSearchQuery('');
      
      // Navigate to the new ticket
      router.push(`/tickets/${ticketId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create ticket');
    } finally {
      setCreating(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Urgent': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'High': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'Low': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
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
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {isCustomerUser ? 'My Tickets' : 'Support Tickets'}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {isCustomerUser 
                ? 'View and manage your support requests'
                : 'Manage all support tickets across organizations'}
            </p>
          </div>
          {permissions?.canCreateTickets && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Ticket
            </button>
          )}
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-blue-500">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.open}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Open</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-purple-500">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.inProgress}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">In Progress</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-yellow-500">
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.waiting}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Waiting</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-green-500">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.resolved}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Resolved</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-red-500">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{Number(stats.urgent || 0) + Number(stats.high || 0)}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">High Priority</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="space-y-4">
            {/* Search Row */}
            <div className="w-full">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Search</label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by ticket number, title, or description..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                <svg className="absolute left-3 top-3 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Main Filters Row */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Filters</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

              {/* Organization Filter (not for customer users) */}
              {!isCustomerUser && (
                <select
                  value={filterOrg}
                  onChange={(e) => setFilterOrg(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                >
                  <option value="">All Organizations</option>
                  {organizations.map(org => (
                    <option key={org.Id} value={org.Id}>{org.Name}</option>
                  ))}
                </select>
              )}

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <option value="">All Statuses</option>
                {STATUSES.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>

              {/* Priority Filter */}
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <option value="">All Priorities</option>
                {PRIORITIES.map(priority => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>

              {/* Category Filter */}
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            </div>

            {/* People & Customer Filters Row */}
            {!isCustomerUser && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">People & Customers</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Assignee Filter */}
                  <div>
                    <SearchableSelect
                      options={[
                        { value: '', label: 'All Assignees' },
                        ...users.map(u => ({
                          value: u.Id.toString(),
                          label: u.FirstName && u.LastName ? `${u.FirstName} ${u.LastName}` : u.Username
                        }))
                      ]}
                      value={filterAssignee}
                      onChange={setFilterAssignee}
                      placeholder="All Assignees"
                    />
                  </div>

                  {/* Developer Filter */}
                  <div>
                    <SearchableSelect
                      options={[
                        { value: '', label: 'All Developers' },
                        ...users.map(u => ({
                          value: u.Id.toString(),
                          label: u.FirstName && u.LastName ? `${u.FirstName} ${u.LastName}` : u.Username
                        }))
                      ]}
                      value={filterDeveloper}
                      onChange={setFilterDeveloper}
                      placeholder="All Developers"
                    />
                  </div>

                  {/* Customer Filter */}
                  <div>
                    <SearchableSelect
                      options={[
                        { value: '', label: 'All Customers' },
                        ...customers.map(c => ({
                          value: c.Id.toString(),
                          label: c.Name
                        }))
                      ]}
                      value={filterCustomer}
                      onChange={setFilterCustomer}
                      placeholder="All Customers"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Date Filters Row */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Date Ranges</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-600">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap min-w-[80px]">Created:</label>
                  <input
                    type="date"
                    value={filterCreatedFrom}
                    onChange={(e) => setFilterCreatedFrom(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                  <span className="text-gray-400 text-sm">to</span>
                  <input
                    type="date"
                    value={filterCreatedTo}
                    onChange={(e) => setFilterCreatedTo(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-600">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap min-w-[80px]">Scheduled:</label>
                  <input
                    type="date"
                    value={filterScheduledFrom}
                    onChange={(e) => setFilterScheduledFrom(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                  <span className="text-gray-400 text-sm">to</span>
                  <input
                    type="date"
                    value={filterScheduledTo}
                    onChange={(e) => setFilterScheduledTo(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Checkboxes and Actions Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap items-center gap-3">
                {/* My Tickets Only Filter */}
                <label className="flex items-center gap-2 px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-400 dark:hover:border-blue-500 transition-all">
                  <input
                    type="checkbox"
                    checked={showMyTicketsOnly}
                    onChange={(e) => setShowMyTicketsOnly(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm font-medium">My Tickets</span>
                </label>

                {/* Show Closed Filter */}
                <label className="flex items-center gap-2 px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600/50 hover:border-gray-400 dark:hover:border-gray-500 transition-all">
                  <input
                    type="checkbox"
                    checked={showClosed}
                    onChange={(e) => setShowClosed(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm font-medium">Show Closed</span>
                </label>
              </div>

              {/* Clear Filters */}
              {(filterOrg || filterStatus || filterPriority || filterCategory || filterAssignee || filterDeveloper || filterCustomer || filterCreatedFrom || filterCreatedTo || filterScheduledFrom || filterScheduledTo || searchQuery || !showMyTicketsOnly || showClosed) && (
                <button
                  onClick={() => {
                    setFilterOrg('');
                    setFilterStatus('');
                    setFilterPriority('');
                    setFilterCategory('');
                    setFilterAssignee('');
                    setFilterDeveloper('');
                    setFilterCustomer('');
                    setFilterCreatedFrom('');
                    setFilterCreatedTo('');
                    setFilterScheduledFrom('');
                    setFilterScheduledTo('');
                    setSearchQuery('');
                    setShowMyTicketsOnly(true);
                    setShowClosed(false);
                  }}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium shadow-sm hover:shadow-md flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear All Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {/* Tickets List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              Loading tickets...
            </div>
          ) : (() => {
            // Filter tickets for "My Tickets" logic
            const filteredTickets = showMyTicketsOnly && user ? tickets.filter(ticket => {
              const statusLower = ticket.Status.toLowerCase();
              
              // Open, Scheduled, In Progress - check AssignedToUserId
              if (statusLower === 'open' || statusLower === 'scheduled' || statusLower === 'in progress') {
                return ticket.AssignedToUserId === user.id;
              }
              
              // With Developer - check DeveloperUserId
              if (statusLower === 'with developer') {
                return ticket.DeveloperUserId === user.id;
              }
              
              // Waiting Response - check CreatedByUserId
              if (statusLower === 'waiting response') {
                return ticket.CreatedByUserId === user.id;
              }
              
              // For other statuses (Resolved, Closed), show if created by or assigned to user
              return ticket.CreatedByUserId === user.id || 
                     ticket.AssignedToUserId === user.id || 
                     ticket.DeveloperUserId === user.id;
            }) : tickets;
            
            return filteredTickets.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-4">🎫</div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No tickets found</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {searchQuery || filterStatus || filterPriority || filterCategory
                  ? 'Try adjusting your filters'
                  : 'Create your first support ticket'}
              </p>
              {permissions?.canCreateTickets && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Ticket
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.Id}
                  onClick={() => router.push(`/tickets/${ticket.Id}`)}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* Category Icon */}
                    <div className="text-2xl flex-shrink-0">
                      {getCategoryIcon(ticket.Category)}
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                          {ticket.TicketNumber}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(ticket.Status)}`}>
                          {ticket.Status}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getPriorityColor(ticket.Priority)}`}>
                          {ticket.Priority}
                        </span>
                        {ticket.ExternalTicketId && jiraIntegrations.get(ticket.OrganizationId) && (
                          <a
                            href={`${jiraIntegrations.get(ticket.OrganizationId)}/browse/${ticket.ExternalTicketId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1"
                            title={`Open in Jira: ${ticket.ExternalTicketId}`}
                          >
                            🔷 {ticket.ExternalTicketId}
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                      </div>
                      
                      <h3 className="text-base font-medium text-gray-900 dark:text-white truncate">
                        {ticket.Title}
                      </h3>
                      
                      {ticket.Description && (() => {
                        const plainText = ticket.Description.replace(/<[^>]*>/g, '').trim();
                        return plainText ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                            {plainText}
                          </p>
                        ) : null;
                      })()}

                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {!isCustomerUser && (
                          <span className="flex items-center gap-1">
                            🏢 {ticket.OrganizationName}
                          </span>
                        )}
                        {ticket.CustomerName && (
                          <span className="flex items-center gap-1">
                            👤 {ticket.CustomerName}
                          </span>
                        )}
                        {ticket.ProjectName && (
                          <span className="flex items-center gap-1">
                            📁 {ticket.ProjectName}
                          </span>
                        )}
                        {!isCustomerUser && ticket.DeveloperUsername && (
                          <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
                            👨‍💻 {ticket.DeveloperFirstName || ticket.DeveloperUsername}
                          </span>
                        )}
                        {!isCustomerUser && ticket.ScheduledDate && (
                          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            📅 {new Date(ticket.ScheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          💬 {ticket.CommentCount}
                        </span>
                        <span>
                          {formatDate(ticket.CreatedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Assignee */}
                    <div className="flex-shrink-0 text-right">
                      {ticket.AssigneeFirstName ? (
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-sm font-medium text-blue-600 dark:text-blue-400">
                            {ticket.AssigneeFirstName[0]}{ticket.AssigneeLastName?.[0] || ''}
                          </div>
                        </div>
                      ) : (
                        <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-sm text-gray-400">
                          ?
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
          })()}
        </div>
      </main>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleCreateTicket}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Create New Ticket
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  {/* Organization (not for customer users) */}
                  {!isCustomerUser && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Organization <span className="text-red-500">*</span>
                      </label>
                      <SearchableSelect
                        value={createForm.organizationId}
                        onChange={(value) => {
                          setCreateForm(prev => ({ ...prev, organizationId: value, projectId: '', externalTicketId: '' }));
                          loadProjects(value);
                          loadJiraIntegration(value);
                        }}
                        options={organizations.map(org => ({ value: org.Id, label: org.Name }))}
                        placeholder="Select Organization"
                        emptyText="Select Organization"
                      />
                    </div>
                  )}

                  {/* Customer (not for customer users) */}
                  {!isCustomerUser && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Customer <span className="text-red-500">*</span>
                      </label>
                      <SearchableSelect
                        value={createForm.customerId}
                        onChange={(value) => setCreateForm(prev => ({ ...prev, customerId: value }))}
                        options={customers.map(c => ({ value: c.Id.toString(), label: c.Name }))}
                        placeholder="Select Customer"
                        emptyText="Select Customer"
                      />
                    </div>
                  )}

                  {/* Jira Ticket Search (if integration is enabled) */}
                  {!isCustomerUser && jiraIntegration && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        🔷 Link Jira Ticket (optional)
                      </label>
                      <div className="space-y-2">
                        <div className="relative">
                          <input
                            type="text"
                            value={jiraSearchQuery}
                            onChange={(e) => {
                              setJiraSearchQuery(e.target.value);
                              if (e.target.value.length >= 2) {
                                searchJiraIssues(e.target.value);
                              }
                            }}
                            placeholder="Search by Jira ticket number or summary..."
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                          />
                          {searchingJira && (
                            <div className="absolute right-3 top-2.5">
                              <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                            </div>
                          )}
                        </div>
                        
                        {createForm.externalTicketId && (
                          <div className="flex items-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-2 rounded-lg">
                            <span className="font-medium">✓ Linked:</span>
                            <span>{createForm.externalTicketId}</span>
                            <button
                              type="button"
                              onClick={() => setCreateForm(prev => ({ ...prev, externalTicketId: '' }))}
                              className="ml-auto text-green-600 hover:text-green-700 dark:text-green-400"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                        
                        {jiraSearchQuery.length >= 2 && jiraIssues.length > 0 && !createForm.externalTicketId && (
                          <div className="max-h-60 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                            {jiraIssues.map((issue) => (
                              <button
                                key={issue.key}
                                type="button"
                                onClick={() => {
                                  // Map Jira priority to app priority
                                  const mapPriority = (jiraPriority: string) => {
                                    const lower = jiraPriority?.toLowerCase() || '';
                                    if (lower.includes('highest') || lower.includes('critical')) return 'High';
                                    if (lower.includes('high')) return 'High';
                                    if (lower.includes('low') || lower.includes('lowest')) return 'Low';
                                    return 'Medium';
                                  };
                                  
                                  // Map Jira issue type to category
                                  const mapCategory = (issueType: string) => {
                                    const lower = issueType?.toLowerCase() || '';
                                    if (lower.includes('bug')) return 'Bug';
                                    if (lower.includes('feature') || lower.includes('enhancement')) return 'Feature Request';
                                    if (lower.includes('task')) return 'Support';
                                    return 'Support';
                                  };
                                  
                                  // Convert Jira description (can be complex format) to plain text or HTML
                                  const convertDescription = (jiraDesc: any) => {
                                    if (!jiraDesc) return '';
                                    if (typeof jiraDesc === 'string') return jiraDesc;
                                    // Jira uses ADF (Atlassian Document Format) - extract text
                                    if (jiraDesc.type === 'doc' && jiraDesc.content) {
                                      let text = '';
                                      const extractText = (node: any): string => {
                                        if (node.text) return node.text;
                                        if (node.content) {
                                          return node.content.map((n: any) => extractText(n)).join('');
                                        }
                                        return '';
                                      };
                                      return jiraDesc.content.map((node: any) => extractText(node)).join('\n');
                                    }
                                    return '';
                                  };
                                  
                                  setCreateForm(prev => ({ 
                                    ...prev, 
                                    externalTicketId: issue.key,
                                    title: issue.summary || prev.title,
                                    description: convertDescription(issue.description) || prev.description,
                                    priority: mapPriority(issue.priority),
                                    category: mapCategory(issue.issueType)
                                  }));
                                  setJiraSearchQuery('');
                                  setJiraIssues([]);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 border-b border-gray-200 dark:border-gray-600 last:border-0"
                              >
                                <div className="font-medium text-gray-900 dark:text-white">{issue.key}</div>
                                <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{issue.summary}</div>
                                <div className="flex gap-2 mt-1">
                                  {issue.status && (
                                    <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                                      {issue.status}
                                    </span>
                                  )}
                                  {issue.priority && (
                                    <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded">
                                      {issue.priority}
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

                  {/* Project (optional) */}
                  {!isCustomerUser && createForm.organizationId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Project (optional)
                      </label>
                      <SearchableSelect
                        value={createForm.projectId}
                        onChange={(value) => setCreateForm(prev => ({ ...prev, projectId: value }))}
                        options={projects.map(project => ({ value: project.Id, label: project.ProjectName }))}
                        placeholder="Select Project"
                        emptyText="No Project"
                      />
                    </div>
                  )}

                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={createForm.title}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Brief summary of the issue"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description
                    </label>
                    <RichTextEditor
                      content={createForm.description}
                      onChange={(html) => setCreateForm(prev => ({ ...prev, description: html }))}
                      placeholder="Provide more details about the issue..."
                    />
                  </div>

                  {/* Category and Priority */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Category
                      </label>
                      <select
                        value={createForm.category}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      >
                        {CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{getCategoryIcon(cat)} {cat}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Priority
                      </label>
                      <select
                        value={createForm.priority}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, priority: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      >
                        {PRIORITIES.map(priority => (
                          <option key={priority} value={priority}>{priority}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  {/* Attachments */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Attachments (optional)
                    </label>
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          setAttachmentFiles(Array.from(e.target.files));
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-600 dark:file:text-gray-200"
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                    />
                    {attachmentFiles.length > 0 && (
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        {attachmentFiles.length} file(s) selected
                        <ul className="mt-1 space-y-1">
                          {attachmentFiles.map((file, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                              <span>📎 {file.name}</span>
                              <button
                                type="button"
                                onClick={() => setAttachmentFiles(prev => prev.filter((_, i) => i !== idx))}
                                className="text-red-500 hover:text-red-700"
                              >
                                ✕
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    {creating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Creating...
                      </>
                    ) : (
                      'Create Ticket'
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
