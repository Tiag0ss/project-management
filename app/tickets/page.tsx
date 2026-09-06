'use client';
/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation'
import { oldPath } from '@/lib/oldPath';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import RichTextEditor from '@/components/RichTextEditor';
import SearchableSelect from '@/components/SearchableSelect';
import CustomFieldsFormSection from '@/components/custom-fields/CustomFieldsFormSection';
import { CustomFieldValues } from '@/lib/customFields';
import { useColorVision } from '@/hooks/useColorVision';
import { NavModuleIcon } from '@/lib/navIcons';

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
  FirstResponseAt: string | null;
  PriorityId: number | null;
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
  StatusColor: string | null;
  StatusIsClosed: number;
  StatusType: string | null;
  PriorityColor: string | null;
  [key: string]: unknown;
}

interface Organization {
  Id: number;
  Name: string;
}

interface Project {
  Id: number;
  ProjectName: string;
  CustomerId: number | null;
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

const CATEGORIES = ['Support', 'Bug', 'Feature Request', 'Question', 'Other'];

export default function TicketsPage() {
  const { pillStyle } = useColorVision();
  const { user, token, isLoading, isCustomerUser } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canCreateTicket = isCustomerUser || Boolean(permissions?.canCreateTickets);
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ticketStatuses, setTicketStatuses] = useState<{ Id: number; StatusName: string; Color: string; IsClosed: number }[]>([]);
  const [ticketPriorities, setTicketPriorities] = useState<{ Id: number; PriorityName: string; Color: string; IsDefault: number }[]>([]);
  
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
    priority: '',
    category: 'Support',
    externalTicketId: '',
    customFields: {} as CustomFieldValues,
  });
  const [creating, setCreating] = useState(false);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [jiraIntegration, setJiraIntegration] = useState<any>(null);
  const [jiraIssues, setJiraIssues] = useState<any[]>([]);
  const [searchingJira, setSearchingJira] = useState(false);
  const [jiraSearchQuery, setJiraSearchQuery] = useState('');
  const [jiraSearchError, setJiraSearchError] = useState('');
  const [jiraIntegrations, setJiraIntegrations] = useState<Map<number, string>>(new Map());
  const [slaRulesMap, setSlaRulesMap] = useState<Map<number, any[]>>(new Map());
  const [internalTicketsEnabled, setInternalTicketsEnabled] = useState(true);
  const [featureFlagsLoaded, setFeatureFlagsLoaded] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(oldPath('/login'));
    }
  }, [user, isLoading, router]);

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
    if (token && featureFlagsLoaded && internalTicketsEnabled) {
      loadData();
    } else if (featureFlagsLoaded && !internalTicketsEnabled) {
      setLoading(false);
    }
  }, [token, featureFlagsLoaded, internalTicketsEnabled, filterOrg, filterStatus, filterPriority, filterCategory, filterAssignee, filterDeveloper, filterCustomer, filterCreatedFrom, filterCreatedTo, filterScheduledFrom, filterScheduledTo, searchQuery, showClosed]);

  useEffect(() => {
    if (!showCreateModal) return;
    if (createForm.priority) return;
    if (ticketPriorities.length === 0) return;

    const defaultPriority =
      ticketPriorities.find((priority) => priority.IsDefault)?.Id ?? ticketPriorities[0]?.Id;
    if (defaultPriority) {
      setCreateForm((prev) => ({ ...prev, priority: String(defaultPriority) }));
    }
  }, [showCreateModal, createForm.priority, ticketPriorities]);

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
        
        // Load ticket status/priority colors for the org in use
        const firstOrgId = filterOrg || (data.tickets?.[0]?.OrganizationId?.toString() ?? '');
        if (firstOrgId) {
          loadTicketStatusColors(firstOrgId);
        }

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

        // Load SLA rules per organization
        const slaMap = new Map<number, any[]>();
        await Promise.all(uniqueOrgIds.map(async (orgId: number) => {
          try {
            const slaRes = await fetch(
              `${getApiUrl()}/api/sla-rules/organization/${orgId}`,
              { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (slaRes.ok) {
              const slaData = await slaRes.json();
              slaMap.set(orgId, slaData.rules || []);
            }
          } catch { /* ignore */ }
        }));
        setSlaRulesMap(slaMap);
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
        const orgs = data.organizations || [];
        setOrganizations(orgs);

        // Auto-select first org if only one, or always for customer portal users
        if (orgs.length > 0 && !createForm.organizationId && (orgs.length === 1 || isCustomerUser)) {
          const orgId = orgs[0].Id.toString();
          setCreateForm((prev) => ({ ...prev, organizationId: orgId }));
          void loadTicketStatusColors(orgId);
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

  const loadTicketStatusColors = async (orgId: string) => {
    if (!orgId || !token) return;
    try {
      const [statusRes, priorityRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/status-values/ticket/${orgId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${getApiUrl()}/api/status-values/ticket-priority/${orgId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (statusRes.ok) {
        const d = await statusRes.json();
        setTicketStatuses(d.statuses || []);
      }
      if (priorityRes.ok) {
        const d = await priorityRes.json();
        setTicketPriorities(d.priorities || []);
      }
    } catch {
      // non-critical, colors will fall back to defaults
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

  const getApiErrorMessage = async (response: Response, fallbackMessage: string) => {
    try {
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data?.message) {
          return String(data.message);
        }
      } else {
        const text = await response.text();
        if (text.trim()) {
          return text.trim();
        }
      }
    } catch {
      // Ignore parsing errors and fall back to a generic message.
    }

    return fallbackMessage;
  };

  const handleOpenCreateModal = () => {
    setError('');
    setJiraSearchError('');
    setShowCreateModal(true);

    const fallbackOrgId = organizations.length === 1
      ? organizations[0].Id.toString()
      : isCustomerUser && organizations.length > 0
        ? organizations[0].Id.toString()
        : '';

    const targetOrgId = createForm.organizationId || fallbackOrgId;

    if (targetOrgId && targetOrgId !== createForm.organizationId) {
      setCreateForm(prev => ({
        ...prev,
        organizationId: targetOrgId,
        projectId: '',
        externalTicketId: ''
      }));
    } else if (isCustomerUser && createForm.projectId) {
      setCreateForm(prev => ({
        ...prev,
        projectId: '',
      }));
    }

    if (!targetOrgId) {
      setProjects([]);
      setJiraIntegration(null);
      setJiraIssues([]);
      setJiraSearchQuery('');
      setJiraSearchError('');
      return;
    }

    loadProjects(targetOrgId);
    loadTicketStatusColors(targetOrgId);
    loadJiraIntegration(targetOrgId);
  };

  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    if (!canCreateTicket || loading || isLoading) return;
    handleOpenCreateModal();
    router.replace('/tickets', { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once when ?new=1 is present
  }, [searchParams, canCreateTicket, loading, isLoading]);

  const searchJiraIssues = async (query: string) => {
    if (!createForm.organizationId || !jiraIntegration) return;
    
    setSearchingJira(true);
    setJiraSearchError('');
    try {
      const res = await fetch(
        `${getApiUrl()}/api/jira-integrations/organization/${createForm.organizationId}/search?query=${encodeURIComponent(query)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!res.ok) {
        const message = await getApiErrorMessage(res, 'Failed to search Jira issues');
        setJiraIssues([]);
        setJiraSearchError(message);
        return;
      }

      const data = await res.json();
      setJiraIssues(data.issues || []);
      setJiraSearchError('');
    } catch (err) {
      console.error('Failed to search Jira issues:', err);
      setJiraIssues([]);
      setJiraSearchError(err instanceof Error ? err.message : 'Failed to search Jira issues');
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

    if (!createForm.priority) {
      setError('Priority is required');
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
            projectId: isCustomerUser ? null : (createForm.projectId ? parseInt(createForm.projectId) : null),
            title: createForm.title.trim(),
            description: createForm.description || null,
            priority: parseInt(createForm.priority, 10),
            category: createForm.category,
            externalTicketId: createForm.externalTicketId || null,
            customFields: createForm.customFields,
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
        priority: String(ticketPriorities.find(p => p.IsDefault)?.Id || ticketPriorities[0]?.Id || ''),
        category: 'Support',
        externalTicketId: '',
        customFields: {},
      });
      setAttachmentFiles([]);
      setJiraIntegration(null);
      setJiraIssues([]);
      setJiraSearchQuery('');
      setJiraSearchError('');
      
      // Navigate to the new ticket
      router.push(`/tickets/${ticketId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create ticket');
    } finally {
      setCreating(false);
    }
  };

  const getSlaStatus = (ticket: Ticket): 'ok' | 'warning' | 'breached' | null => {
    const rules = slaRulesMap.get(ticket.OrganizationId);
    if (!rules || rules.length === 0) return null;
    const rule = rules.find((r: any) => r.PriorityId === ticket.PriorityId && r.IsActive) ||
                 rules.find((r: any) => r.PriorityId == null && r.IsActive);
    if (!rule) return null;
    if (!rule.FirstResponseHours && !rule.ResolutionHours) return null;
    const now = Date.now();
    const ageMinutes = (now - new Date(ticket.CreatedAt).getTime()) / 60000;
    const isClosed = ticket.StatusIsClosed === 1;
    if (rule.FirstResponseHours && !ticket.FirstResponseAt && !isClosed) {
      const limitMin = rule.FirstResponseHours * 60;
      if (ageMinutes >= limitMin) return 'breached';
      if (ageMinutes >= limitMin * 0.75) return 'warning';
    }
    if (rule.ResolutionHours && !isClosed) {
      const limitMin = rule.ResolutionHours * 60;
      if (ageMinutes >= limitMin) return 'breached';
      if (ageMinutes >= limitMin * 0.75) return 'warning';
    }
    return 'ok';
  };

  const getSlaIcon = (status: 'ok' | 'warning' | 'breached') => {
    if (status === 'breached') return <span title="SLA Breached" className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 font-medium" onClick={e => e.stopPropagation()}>🔴 SLA</span>;
    if (status === 'warning') return <span title="SLA Warning" className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 font-medium" onClick={e => e.stopPropagation()}>🟡 SLA</span>;
    return <span title="Within SLA" className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 font-medium" onClick={e => e.stopPropagation()}>🟢 SLA</span>;
  };

  const createModalProjects = projects.filter((project) => {
    if (!createForm.customerId) return true;
    return String(project.CustomerId ?? '') === createForm.customerId;
  });

  // Returns inline style for colored status badge using TicketStatusValues
  const getStatusStyle = (ticket: Ticket): React.CSSProperties => {
    const color = ticket.StatusColor || ticketStatuses.find(s => s.StatusName === ticket.Status)?.Color;
    return pillStyle(color || '#6b7280', { alpha: '25', borderAlpha: '50' }) ?? { backgroundColor: '#6b728025', color: '#6b7280', border: '1px solid #6b728050' };
  };

  const getPriorityStyle = (ticket: Ticket): React.CSSProperties => {
    const color = ticket.PriorityColor || ticketPriorities.find(p => p.PriorityName === ticket.Priority)?.Color;
    return pillStyle(color || '#6b7280', { alpha: '25', borderAlpha: '50' }) ?? { backgroundColor: '#6b728025', color: '#6b7280', border: '1px solid #6b728050' };
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
      <PageLoadingSkeleton />
    );
  }

  if (!user) return null;

  if (!featureFlagsLoaded) {
    return (
      <PageLoadingSkeleton />
    );
  }

  if (!internalTicketsEnabled) {
    return (
      <div className="w-full">
        <main className="w-full mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center border border-gray-200 dark:border-gray-700">
            <div className="mb-3 flex justify-center text-[var(--pm-muted)] opacity-70">
              <NavModuleIcon href="/tickets" size={40} />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Internal Ticket System Disabled</h1>
            <p className="text-gray-600 dark:text-gray-400">This module is currently disabled by system settings.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="w-full">

      <main className="w-full mx-auto px-4 py-4 sm:py-6 space-y-2 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight text-gray-900 dark:text-white">
              {isCustomerUser ? 'Customer Tickets' : 'Support Tickets'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isCustomerUser
                ? 'Tickets for your customer account — yours and your team’s'
                : 'Manage support tickets across organizations'}
            </p>
          </div>
          {canCreateTicket && (
            <button
              onClick={handleOpenCreateModal}
              className="h-10 shrink-0 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Ticket
            </button>
          )}
        </div>

        <CollapsibleFilterPanel
          className="mb-2"
          title="Ticket filters"
          activeCount={[
            searchQuery.trim() ? 1 : 0,
            filterOrg ? 1 : 0,
            filterStatus ? 1 : 0,
            filterPriority ? 1 : 0,
            filterCategory ? 1 : 0,
            filterAssignee ? 1 : 0,
            filterDeveloper ? 1 : 0,
            filterCustomer ? 1 : 0,
            filterCreatedFrom ? 1 : 0,
            filterCreatedTo ? 1 : 0,
            filterScheduledFrom ? 1 : 0,
            filterScheduledTo ? 1 : 0,
            !showMyTicketsOnly ? 1 : 0,
            showClosed ? 1 : 0,
          ].reduce((a, b) => a + b, 0)}
          headerMiddle={
            stats ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-gray-900 dark:text-white">{stats.total}</span> total
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{stats.open}</span> open
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-purple-600 dark:text-purple-400">{stats.inProgress}</span> in progress
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-yellow-600 dark:text-yellow-400">{stats.waiting}</span> waiting
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-green-600 dark:text-green-400">{stats.resolved}</span> resolved
                </span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="tabular-nums text-gray-600 dark:text-gray-300">
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    {Number(stats.urgent || 0) + Number(stats.high || 0)}
                  </span>{' '}
                  high priority
                </span>
              </div>
            ) : null
          }
        >
          <div className="space-y-3">
            {/* Search Row */}
            <div className="w-full">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Search</label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by ticket number, title, or description..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
                />
                <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Main Filters Row */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Filters</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">

              {/* Organization Filter (not for customer users) */}
              {!isCustomerUser && (
                <select
                  value={filterOrg}
                  onChange={(e) => setFilterOrg(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
              >
                <option value="">All Statuses</option>
                {ticketStatuses.map(s => (
                  <option key={s.Id} value={s.StatusName}>{s.StatusName}</option>
                ))}
              </select>

              {/* Priority Filter */}
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
              >
                <option value="">All Priorities</option>
                {ticketPriorities.map(p => (
                  <option key={p.Id} value={p.PriorityName}>{p.PriorityName}</option>
                ))}
              </select>

              {/* Category Filter */}
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm"
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
                {/* My Tickets: internal = involvement; customer = tickets I created */}
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
        </CollapsibleFilterPanel>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {/* Tickets List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              Loading tickets...
            </div>
          ) : (() => {
            // Filter tickets for "My Tickets" logic
            const filteredTickets =
              showMyTicketsOnly && user
                ? isCustomerUser
                  ? tickets.filter((ticket) => ticket.CreatedByUserId === user.id)
                  : tickets.filter((ticket) => {
                      const st = ticket.StatusType;

                      // open / in_progress — ticket is assigned to or being handled by the user
                      if (st === 'open' || st === 'in_progress') {
                        return ticket.AssignedToUserId === user.id || ticket.DeveloperUserId === user.id;
                      }

                      // waiting — awaiting response from creator/reporter
                      if (st === 'waiting') {
                        return ticket.CreatedByUserId === user.id;
                      }

                      // resolved / closed / other — show if the user is involved in any role
                      return (
                        ticket.CreatedByUserId === user.id ||
                        ticket.AssignedToUserId === user.id ||
                        ticket.DeveloperUserId === user.id
                      );
                    })
                : tickets;
            
            return filteredTickets.length === 0 ? (
            <div className="p-8 text-center">
              <div className="mb-4 flex justify-center text-[var(--pm-muted)] opacity-70">
                <NavModuleIcon href="/tickets" size={40} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No tickets found</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {searchQuery || filterStatus || filterPriority || filterCategory
                  ? 'Try adjusting your filters'
                  : 'Create your first support ticket'}
              </p>
              {canCreateTicket && (
                <button
                  onClick={handleOpenCreateModal}
                  className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={getStatusStyle(ticket)}>
                          {ticket.Status}
                        </span>
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={getPriorityStyle(ticket)}>
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
                        {(() => { const sla = getSlaStatus(ticket); return sla ? getSlaIcon(sla) : null; })()}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
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
                          setCreateForm(prev => ({ ...prev, organizationId: value, projectId: '', externalTicketId: '', priority: '' }));
                          loadProjects(value);
                          loadTicketStatusColors(value);
                          loadJiraIntegration(value);
                        }}
                        options={organizations.map(org => ({ value: org.Id, label: org.Name }))}
                        placeholder="Select Organization"
                        emptyText="Select Organization"
                        autoSelectSingleOption
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
                        onChange={(value) => setCreateForm(prev => ({ ...prev, customerId: value, projectId: '' }))}
                        options={customers.map(c => ({ value: c.Id.toString(), label: c.Name }))}
                        placeholder="Select Customer"
                        emptyText="Select Customer"
                        autoSelectSingleOption
                      />
                    </div>
                  )}

                  {/* Jira Ticket Search (organization required first) */}
                  {!isCustomerUser && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        🔷 Link Jira Ticket (optional)
                      </label>

                      {!createForm.organizationId ? (
                        <div className="text-sm text-blue-700 dark:text-blue-300">
                          Select an organization first to load Jira integration.
                        </div>
                      ) : !jiraIntegration ? (
                        <div className="text-sm text-blue-700 dark:text-blue-300">
                          Jira integration is not enabled for the selected organization.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="relative">
                            <input
                              type="text"
                              value={jiraSearchQuery}
                              onChange={(e) => {
                                const nextValue = e.target.value;
                                setJiraSearchQuery(nextValue);

                                if (nextValue.length >= 2) {
                                  searchJiraIssues(nextValue);
                                } else {
                                  setJiraIssues([]);
                                  setJiraSearchError('');
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

                          {jiraSearchError && (
                            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                              {jiraSearchError}
                            </div>
                          )}

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
                                    const mapPriority = (jiraPriority: string) => {
                                      const lower = jiraPriority?.toLowerCase() || '';
                                      let name = 'Medium';
                                      if (lower.includes('highest') || lower.includes('critical')) name = 'High';
                                      else if (lower.includes('high')) name = 'High';
                                      else if (lower.includes('low') || lower.includes('lowest')) name = 'Low';
                                      const match =
                                        ticketPriorities.find((p) => p.PriorityName === name) ||
                                        ticketPriorities.find((p) => p.IsDefault) ||
                                        ticketPriorities[0];
                                      return match ? String(match.Id) : '';
                                    };

                                    const mapCategory = (issueType: string) => {
                                      const lower = issueType?.toLowerCase() || '';
                                      if (lower.includes('bug')) return 'Bug';
                                      if (lower.includes('feature') || lower.includes('enhancement')) return 'Feature Request';
                                      if (lower.includes('task')) return 'Support';
                                      return 'Support';
                                    };

                                    const convertDescription = (jiraDesc: any) => {
                                      if (!jiraDesc) return '';
                                      if (typeof jiraDesc === 'string') return jiraDesc;
                                      if (jiraDesc.type === 'doc' && jiraDesc.content) {
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
                                    setJiraSearchError('');
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
                      )}
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
                        options={createModalProjects.map(project => ({ value: project.Id.toString(), label: project.ProjectName }))}
                        placeholder="Select Project"
                        emptyText={createForm.customerId ? "No Project for selected customer" : "No Project"}
                        autoSelectSingleOption
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        Priority <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={createForm.priority}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, priority: e.target.value }))}
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select priority...</option>
                        {ticketPriorities.map(p => (
                          <option key={p.Id} value={p.Id}>{p.PriorityName}</option>
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

                  <CustomFieldsFormSection
                    tableName="Tickets"
                    token={token || undefined}
                    values={createForm.customFields}
                    onChange={(customFields) => setCreateForm(prev => ({ ...prev, customFields }))}
                  />
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

      <ScrollToTopButton />
    </div>
  );
}
