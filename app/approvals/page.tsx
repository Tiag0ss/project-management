'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import Navbar from '@/components/Navbar';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import { getApiUrl } from '@/lib/api/config';
import { useRouter } from 'next/navigation';
import RichTextEditor from '@/components/RichTextEditor';
import { useFormatHours } from '@/lib/useFormatHours';
import ApprovalStatusBadge from '@/components/ApprovalStatusBadge';
import ExpenseApprovalsPanel from '@/components/ExpenseApprovalsPanel';

interface PendingEntry {
  Id: number;
  TaskId: number;
  UserId: number;
  WorkDate: string;
  Hours: number;
  Description?: string;
  AdminEditedDescription?: string;
  TaskName: string;
  ProjectId: number;
  ProjectName: string;
  Username: string;
  FirstName?: string;
  LastName?: string;
  StartTime?: string;
  EndTime?: string;
  ApprovalStatus: string;
  ApprovedBy?: number;
  ApprovedAt?: string;
  TeamLeaderUsername?: string;
}

interface Subordinate {
  Id: number;
  Username: string;
  FirstName?: string;
  LastName?: string;
}

interface VacationRequest {
  Id: number;
  UserId: number;
  VacationDate: string;
  OutOfOfficeDate?: string;
  DayPortion?: 'full' | 'half' | string;
  Status: string;
  Notes?: string;
  HolidayConflict?: boolean;
  HolidayNames?: string[];
  Username: string;
  FirstName?: string;
  LastName?: string;
}

interface VacationTeamMember {
  Id: number;
  Username: string;
  FirstName?: string;
  LastName?: string;
  AnnualVacationDays?: number;
  ApprovedDays: number;
  PendingDays: number;
  RejectedDays?: number;
}

type LeaveDayPortion = 'full' | 'half';

const normalizeDateString = (dateValue: any): string => {
  if (dateValue instanceof Date) return dateValue.toISOString().split('T')[0];
  return String(dateValue).split('T')[0];
};

const getUserDisplayName = (entry: { FirstName?: string; LastName?: string; Username: string }) => {
  if (entry.FirstName && entry.LastName) return `${entry.FirstName} ${entry.LastName}`;
  if (entry.FirstName) return entry.FirstName;
  return entry.Username;
};

const stripHtml = (value?: string) => {
  if (!value) return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const normalizeDayPortion = (value: unknown): 'full' | 'half' => {
  return String(value || '').toLowerCase() === 'half' ? 'half' : 'full';
};

const getLeaveDayWeight = (request: VacationRequest): number => {
  return normalizeDayPortion(request.DayPortion) === 'half' ? 0.5 : 1;
};

const formatLeaveDays = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

export default function ApprovalsPage() {
  const decimalHoursToHMS = useFormatHours();
  const { user, token } = useAuth();
  const { permissions } = usePermissions();
  const router = useRouter();
  const [initialTabFromQuery, setInitialTabFromQuery] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'time' | 'vacations' | 'outOfOffice' | 'expenses'>('time');
  const [canApproveTime, setCanApproveTime] = useState(false);
  const [canApproveVacations, setCanApproveVacations] = useState(false);
  const [canApproveOutOfOffice, setCanApproveOutOfOffice] = useState(false);
  const [canApproveExpenses, setCanApproveExpenses] = useState(false);
  const [expensesEnabled, setExpensesEnabled] = useState(false);
  const [scopeLoaded, setScopeLoaded] = useState(false);

  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [subordinates, setSubordinates] = useState<Subordinate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filterUserId, setFilterUserId] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [filterDateTo, setFilterDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState('pending');

  // Group by user toggle
  const [groupByUser, setGroupByUser] = useState(true);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showAdminDescriptionModal, setShowAdminDescriptionModal] = useState(false);
  const [selectedEntryForDescription, setSelectedEntryForDescription] = useState<PendingEntry | null>(null);
  const [adminDescriptionDraft, setAdminDescriptionDraft] = useState('');
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  // Leave tabs state (vacations and out-of-office share UI state)
  const [vacationMessage, setVacationMessage] = useState('');
  const [vacationIsLoading, setVacationIsLoading] = useState(false);
  const [vacationTeamRequests, setVacationTeamRequests] = useState<VacationRequest[]>([]);
  const [vacationMembers, setVacationMembers] = useState<VacationTeamMember[]>([]);
  const [vacationYear, setVacationYear] = useState<number>(new Date().getFullYear());
  const [vacationStatusFilter, setVacationStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [vacationGroupByUser, setVacationGroupByUser] = useState(true);
  const [vacationSortField, setVacationSortField] = useState<'user' | 'date' | 'status'>('date');
  const [vacationSortDirection, setVacationSortDirection] = useState<'asc' | 'desc'>('desc');
  const [configStartDate, setConfigStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [configEndDate, setConfigEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [configDayPortion, setConfigDayPortion] = useState<LeaveDayPortion>('full');
  const [configNotes, setConfigNotes] = useState('');
  const [isSavingVacationConfig, setIsSavingVacationConfig] = useState(false);
  const [showVacationConfigModal, setShowVacationConfigModal] = useState(false);
  const [vacationDeleteTarget, setVacationDeleteTarget] = useState<VacationRequest | null>(null);

  const isOutOfOfficeTab = activeTab === 'outOfOffice';
  const leaveApiBase = isOutOfOfficeTab ? 'out-of-office' : 'vacations';
  const leaveLabel = isOutOfOfficeTab ? 'Out Of Office' : 'Vacation';
  const leaveLabelPlural = isOutOfOfficeTab ? 'Out Of Office' : 'Vacations';
  const canApproveCurrentLeave = isOutOfOfficeTab ? canApproveOutOfOffice : canApproveVacations;

  useEffect(() => {
    if (!token || !user) return;
    const loadScopes = async () => {
      try {
        const [timeScopeRes, vacationScopeRes, outOfOfficeScopeRes, flagsRes, expenseScopeRes] = await Promise.all([
          fetch(`${getApiUrl()}/api/time-entries/approval-scope`, {
            headers: { 'Authorization': `Bearer ${token}` },
          }),
          fetch(`${getApiUrl()}/api/vacations/approval-scope`, {
            headers: { 'Authorization': `Bearer ${token}` },
          }),
          fetch(`${getApiUrl()}/api/out-of-office/approval-scope`, {
            headers: { 'Authorization': `Bearer ${token}` },
          }),
          fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
            headers: { 'Authorization': `Bearer ${token}` },
          }),
          fetch(`${getApiUrl()}/api/expenses/approval-scope`, {
            headers: { 'Authorization': `Bearer ${token}` },
          }),
        ]);

        const canTime = timeScopeRes.ok ? !!(await timeScopeRes.json())?.canApprove : false;
        const canVacation = vacationScopeRes.ok ? !!(await vacationScopeRes.json())?.canApprove : false;
        const canOutOfOffice = outOfOfficeScopeRes.ok ? !!(await outOfOfficeScopeRes.json())?.canApprove : false;
        const flags = flagsRes.ok ? await flagsRes.json() : {};
        const expenseEnabled = flags.expensesEnabled === true;
        setExpensesEnabled(expenseEnabled);
        let canExpense = false;
        if (expenseEnabled && expenseScopeRes.ok) {
          const expenseScope = await expenseScopeRes.json();
          canExpense = !!expenseScope?.canApprove;
        }

        setCanApproveTime(canTime || !!user.isAdmin);
        setCanApproveVacations(canVacation || !!user.isAdmin);
        setCanApproveOutOfOffice(canOutOfOffice || !!user.isAdmin);
        setCanApproveExpenses((canExpense || !!user.isAdmin) && expenseEnabled);
      } catch {
        setCanApproveTime(!!user.isAdmin);
        setCanApproveVacations(!!user.isAdmin);
        setCanApproveOutOfOffice(!!user.isAdmin);
        setCanApproveExpenses(false);
        setExpensesEnabled(false);
      } finally {
        setScopeLoaded(true);
      }
    };

    loadScopes();
  }, [token, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setInitialTabFromQuery(params.get('tab'));
  }, []);

  useEffect(() => {
    if (!scopeLoaded) return;
    const tab = initialTabFromQuery;
    if (tab === 'expenses' && canApproveExpenses) {
      setActiveTab('expenses');
      return;
    }
    if (tab === 'vacations' && canApproveVacations) {
      setActiveTab('vacations');
      return;
    }
    if (tab === 'out-of-office' && canApproveOutOfOffice) {
      setActiveTab('outOfOffice');
      return;
    }
    if (tab === 'time' && canApproveTime) {
      setActiveTab('time');
      return;
    }
    if (!canApproveTime && canApproveVacations) {
      setActiveTab('vacations');
      return;
    }
    if (!canApproveTime && !canApproveVacations && canApproveOutOfOffice) {
      setActiveTab('outOfOffice');
      return;
    }
    if (!canApproveTime && !canApproveVacations && !canApproveOutOfOffice && canApproveExpenses) {
      setActiveTab('expenses');
      return;
    }
    setActiveTab('time');
  }, [initialTabFromQuery, canApproveTime, canApproveVacations, canApproveOutOfOffice, canApproveExpenses, scopeLoaded]);

  const loadEntries = useCallback(async () => {
    if (!token || !canApproveTime) {
      setEntries([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterUserId) params.set('userId', filterUserId);
      if (filterProjectId) params.set('projectId', filterProjectId);
      if (filterDateFrom) params.set('dateFrom', filterDateFrom);
      if (filterDateTo) params.set('dateTo', filterDateTo);
      if (filterStatus) params.set('status', filterStatus);

      const response = await fetch(
        `${getApiUrl()}/api/time-entries/pending-approval/team?${params.toString()}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!response.ok) {
        if (response.status === 403) {
          setError('Access denied. You must be an admin or a team leader to view approvals.');
          setIsLoading(false);
          return;
        }
        throw new Error('Failed to load entries');
      }
      const data = await response.json();
      setEntries(data.entries || []);
      if (data.subordinates) setSubordinates(data.subordinates);
    } catch (err: any) {
      setError(err.message || 'Failed to load entries');
    } finally {
      setIsLoading(false);
    }
  }, [token, filterUserId, filterProjectId, filterDateFrom, filterDateTo, filterStatus, canApproveTime]);

  useEffect(() => {
    if (user && token && activeTab === 'time') {
      loadEntries();
    }
  }, [user, token, activeTab, loadEntries]);

  const loadVacationData = useCallback(async () => {
    if (!token) return;

    setVacationIsLoading(true);
    setVacationMessage('');

    try {
      if (canApproveCurrentLeave) {
        const teamMembersRes = await fetch(`${getApiUrl()}/api/${leaveApiBase}/team-members?year=${vacationYear}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (teamMembersRes.ok) {
        const membersData = await teamMembersRes.json();
        const members = membersData.members || [];
        setVacationMembers(members);

          const params = new URLSearchParams();
          params.set('year', String(vacationYear));
          params.set('status', vacationStatusFilter);
          if (selectedMemberId) {
            params.set('userId', selectedMemberId);
          }

          const teamRequestsRes = await fetch(
            `${getApiUrl()}/api/${leaveApiBase}/requests?${params.toString()}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );

          if (teamRequestsRes.ok) {
            const teamReqData = await teamRequestsRes.json();
            const normalizedRequests = (teamReqData.requests || []).map((request: any) => ({
              ...request,
              VacationDate: request.VacationDate || request.OutOfOfficeDate,
            }));
            setVacationTeamRequests(normalizedRequests);
          } else {
            setVacationTeamRequests([]);
          }
        }
      } else {
        setVacationTeamRequests([]);
      }
    } catch (err: any) {
      setVacationMessage(err.message || `Failed to load ${leaveLabelPlural.toLowerCase()} data`);
    } finally {
      setVacationIsLoading(false);
    }
  }, [token, vacationYear, vacationStatusFilter, canApproveCurrentLeave, selectedMemberId, leaveApiBase, leaveLabelPlural]);

  useEffect(() => {
    if (user && token && (activeTab === 'vacations' || activeTab === 'outOfOffice')) {
      loadVacationData();
    }
  }, [user, token, activeTab, loadVacationData]);

  const handleVacationApproval = async (id: number, status: 'approved' | 'rejected') => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/${leaveApiBase}/${id}/approval`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Failed to update ${leaveLabel.toLowerCase()} request`);
      setVacationMessage(`${leaveLabel} request ${status}`);
      await loadVacationData();
    } catch (err: any) {
      setVacationMessage(err.message || `Failed to update ${leaveLabel.toLowerCase()} request`);
    }
  };

  const handleDeleteVacationDay = async (id: number) => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/${leaveApiBase}/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Failed to delete ${leaveLabel.toLowerCase()} day`);
      setVacationMessage(`${leaveLabel} day deleted`);
      await loadVacationData();
    } catch (err: any) {
      setVacationMessage(err.message || `Failed to delete ${leaveLabel.toLowerCase()} day`);
    }
  };

  const handleConfirmVacationDelete = async () => {
    if (!vacationDeleteTarget) return;
    const vacationId = vacationDeleteTarget.Id;
    setVacationDeleteTarget(null);
    await handleDeleteVacationDay(vacationId);
  };

  const handleApproveAllVisibleVacations = async () => {
    if (!token) return;

    const pendingVisible = sortedVacationRequests.filter((request) => String(request.Status).toLowerCase() === 'pending');
    if (pendingVisible.length === 0) {
      setVacationMessage(`No pending ${leaveLabel.toLowerCase()} requests to approve.`);
      return;
    }

    setVacationIsLoading(true);
    let approved = 0;
    let failed = 0;

    try {
      await Promise.all(
        pendingVisible.map(async (request) => {
          try {
            const response = await fetch(`${getApiUrl()}/api/${leaveApiBase}/${request.Id}/approval`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ status: 'approved' }),
            });

            if (response.ok) {
              approved += 1;
            } else {
              failed += 1;
            }
          } catch {
            failed += 1;
          }
        })
      );

      setVacationMessage(failed > 0
        ? `Approved ${approved} request(s), ${failed} failed.`
        : `Approved ${approved} ${leaveLabel.toLowerCase()} request(s).`);
      await loadVacationData();
    } finally {
      setVacationIsLoading(false);
    }
  };

  const handleVacationSort = (field: 'user' | 'date' | 'status') => {
    if (vacationSortField === field) {
      setVacationSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setVacationSortField(field);
    setVacationSortDirection(field === 'date' ? 'desc' : 'asc');
  };

  const configureVacationForUser = async () => {
    if (!token || !selectedMemberId) return;
    setIsSavingVacationConfig(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/${leaveApiBase}/team-members/${selectedMemberId}/configure`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: configStartDate,
          endDate: configEndDate,
          dayPortion: configDayPortion,
          notes: configNotes,
          status: 'approved',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Failed to configure ${leaveLabelPlural.toLowerCase()}`);
      const exceededDates = Array.isArray(data.exceededDates) ? data.exceededDates : [];
      const nonWorkingDates = Array.isArray(data.nonWorkingDates) ? data.nonWorkingDates : [];
      const exceededSuffix = exceededDates.length > 0
        ? ` · Exceeded days: ${exceededDates.join(', ')}`
        : '';
      const nonWorkingSuffix = nonWorkingDates.length > 0
        ? ` · Non-working days skipped: ${nonWorkingDates.join(', ')}`
        : '';
      setVacationMessage(`Configured ${leaveLabelPlural.toLowerCase()} (${data.created || 0} created, ${data.skipped || 0} skipped${data.exceeded ? `, ${data.exceeded} exceeded` : ''}${data.nonWorkingSkipped ? `, ${data.nonWorkingSkipped} non-working` : ''})${exceededSuffix}${nonWorkingSuffix}`);
      setConfigNotes('');
      setConfigDayPortion('full');
      setShowVacationConfigModal(false);
      await loadVacationData();
    } catch (err: any) {
      setVacationMessage(err.message || `Failed to configure ${leaveLabelPlural.toLowerCase()}`);
    } finally {
      setIsSavingVacationConfig(false);
    }
  };

  const handleApproval = async (entryId: number, status: 'approved' | 'rejected') => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/time-entries/${entryId}/approval`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (response.ok) {
        if (filterStatus === 'pending') {
          setEntries(prev => prev.filter(e => e.Id !== entryId));
        } else {
          setEntries(prev => prev.map(e => e.Id === entryId ? { ...e, ApprovalStatus: status } : e));
        }
        setSelectedIds(prev => { const s = new Set(prev); s.delete(entryId); return s; });
      }
    } catch (err) {
      console.error('Failed to process approval:', err);
    }
  };

  const handleBatchApproval = async (status: 'approved' | 'rejected') => {
    if (!token || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map(id => handleApproval(id, status)));
  };

  const handleReopen = async (entryId: number) => {
    if (!token) return;
    try {
      const response = await fetch(`${getApiUrl()}/api/time-entries/${entryId}/reopen`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to reopen time entry');
      }

      if (filterStatus === 'pending') {
        setEntries(prev => prev.map(e =>
          e.Id === entryId
            ? { ...e, ApprovalStatus: 'pending', ApprovedBy: undefined, ApprovedAt: undefined }
            : e
        ));
      } else {
        setEntries(prev => prev.filter(e => e.Id !== entryId));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reopen time entry');
    }
  };

  const openAdminDescriptionModal = (entry: PendingEntry) => {
    setSelectedEntryForDescription(entry);
    setAdminDescriptionDraft(entry.AdminEditedDescription || entry.Description || '');
    setShowAdminDescriptionModal(true);
  };

  const closeAdminDescriptionModal = () => {
    setShowAdminDescriptionModal(false);
    setSelectedEntryForDescription(null);
    setAdminDescriptionDraft('');
    setIsSavingDescription(false);
  };

  const handleSaveAdminDescription = async () => {
    if (!token || !selectedEntryForDescription) return;
    setIsSavingDescription(true);
    try {
      const response = await fetch(`${getApiUrl()}/api/time-entries/${selectedEntryForDescription.Id}/admin-description`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ adminEditedDescription: adminDescriptionDraft || null })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to save admin description');
      }

      setEntries(prev => prev.map(e =>
        e.Id === selectedEntryForDescription.Id
          ? { ...e, AdminEditedDescription: adminDescriptionDraft || undefined }
          : e
      ));
      closeAdminDescriptionModal();
    } catch (err: any) {
      setError(err.message || 'Failed to save admin description');
      setIsSavingDescription(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    const pendingEntries = entries.filter(e => e.ApprovalStatus === 'pending');
    if (selectedIds.size === pendingEntries.length && pendingEntries.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingEntries.map(e => e.Id)));
    }
  };

  // Unique projects from entries for filter
  const uniqueProjects = Array.from(
    new Map(entries.map(e => [e.ProjectId, { Id: e.ProjectId, Name: e.ProjectName }])).values()
  ).sort((a, b) => a.Name.localeCompare(b.Name));

  // Stats
  const pendingCount = entries.filter(e => e.ApprovalStatus === 'pending').length;
  const totalHours = entries.reduce((s, e) => s + parseFloat(String(e.Hours || 0)), 0);
  const approvedCount = entries.filter(e => e.ApprovalStatus === 'approved').length;

  // Grouped entries
  const groupedByUser = groupByUser
    ? entries.reduce((acc, e) => {
        const key = e.UserId.toString();
        if (!acc[key]) acc[key] = { user: e, entries: [] };
        acc[key].entries.push(e);
        return acc;
      }, {} as Record<string, { user: PendingEntry; entries: PendingEntry[] }>)
    : null;

  const sortedVacationRequests = [...vacationTeamRequests].sort((a, b) => {
    let compare = 0;

    if (vacationSortField === 'user') {
      compare = getUserDisplayName(a).localeCompare(getUserDisplayName(b));
    } else if (vacationSortField === 'status') {
      compare = String(a.Status || '').localeCompare(String(b.Status || ''));
    } else {
      compare = String(a.VacationDate || '').localeCompare(String(b.VacationDate || ''));
    }

    return vacationSortDirection === 'asc' ? compare : -compare;
  });

  const vacationGroupedByUser = vacationGroupByUser
    ? sortedVacationRequests.reduce((acc, r) => {
        const key = String(r.UserId);
        if (!acc[key]) acc[key] = { user: r, requests: [] };
        acc[key].requests.push(r);
        return acc;
      }, {} as Record<string, { user: VacationRequest; requests: VacationRequest[] }>)
    : null;

  if (!user) return null;

  const selectedVacationMember = vacationMembers.find((m) => String(m.Id) === selectedMemberId);
  const selectedMemberNotApproved = (selectedVacationMember?.PendingDays || 0) + (selectedVacationMember?.RejectedDays || 0);
  const pendingVisibleVacationCount = sortedVacationRequests
    .filter((request) => String(request.Status).toLowerCase() === 'pending')
    .reduce((sum, request) => sum + getLeaveDayWeight(request), 0);
  const pendingVisibleVacationRequestCount = sortedVacationRequests.filter((request) => String(request.Status).toLowerCase() === 'pending').length;
  const approvedVacationCount = sortedVacationRequests
    .filter((request) => String(request.Status).toLowerCase() === 'approved')
    .reduce((sum, request) => sum + getLeaveDayWeight(request), 0);
  const rejectedVacationCount = sortedVacationRequests
    .filter((request) => String(request.Status).toLowerCase() === 'rejected')
    .reduce((sum, request) => sum + getLeaveDayWeight(request), 0);
  const totalVacationDays = sortedVacationRequests.reduce((sum, request) => sum + getLeaveDayWeight(request), 0);
  const uniqueVacationUsers = new Set(sortedVacationRequests.map((r) => r.UserId)).size;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <Navbar />
      <main className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {expensesEnabled ? 'Approvals & Expenses' : 'Approvals'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Review and manage team approvals in one place.
          </p>
        </div>

        <div className="mb-6 flex items-center gap-2">
          <button
            onClick={() => {
              setActiveTab('time');
              router.replace('/approvals?tab=time');
            }}
            disabled={!canApproveTime}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'time'
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'} disabled:opacity-50`}
          >
            Time Entries
          </button>
          <button
            onClick={() => {
              setActiveTab('vacations');
              router.replace('/approvals?tab=vacations');
            }}
            disabled={!canApproveVacations && !user?.isAdmin}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'vacations'
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'} disabled:opacity-50`}
          >
            Vacations
          </button>
          <button
            onClick={() => {
              setActiveTab('outOfOffice');
              router.replace('/approvals?tab=out-of-office');
            }}
            disabled={!canApproveOutOfOffice && !user?.isAdmin}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'outOfOffice'
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'} disabled:opacity-50`}
          >
            Out Of Office
          </button>
          {expensesEnabled && (
            <button
              onClick={() => {
                setActiveTab('expenses');
                router.replace('/approvals?tab=expenses');
              }}
              disabled={!canApproveExpenses}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'expenses'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'} disabled:opacity-50`}
            >
              Expenses
            </button>
          )}
        </div>

        {!canApproveTime && !canApproveVacations && !canApproveOutOfOffice && !canApproveExpenses && (
          <div className="mb-6 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 text-yellow-700 dark:text-yellow-300 rounded-lg">
            You don't currently have approval scope for time entries, vacations, out-of-office, or expenses.
          </div>
        )}

        {activeTab === 'expenses' && token ? (
          <ExpenseApprovalsPanel token={token} />
        ) : activeTab === 'time' ? (
          <>

        {error && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        {!error && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">⏳ Pending</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{pendingCount}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">entries awaiting approval</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-green-600 dark:text-green-400 font-medium">✓ Approved</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{approvedCount}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">entries in current view</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">⏱ Total Hours</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{decimalHoursToHMS(totalHours)}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">across {entries.length} entries</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Team Member</label>
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All members</option>
                {subordinates.map(s => (
                  <option key={s.Id} value={s.Id}>
                    {s.FirstName && s.LastName ? `${s.FirstName} ${s.LastName}` : s.Username}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Project</label>
              <select
                value={filterProjectId}
                onChange={(e) => setFilterProjectId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All projects</option>
                {uniqueProjects.map(p => (
                  <option key={p.Id} value={p.Id}>{p.Name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">From</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">To</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={loadEntries}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Apply Filters
              </button>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groupByUser}
                  onChange={(e) => setGroupByUser(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                Group by user
              </label>
            </div>
            {selectedIds.size > 0 && filterStatus === 'pending' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">{selectedIds.size} selected</span>
                <button
                  onClick={() => handleBatchApproval('approved')}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  ✓ Approve All
                </button>
                <button
                  onClick={() => handleBatchApproval('rejected')}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  ✗ Reject All
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-gray-500 dark:text-gray-400">Loading entries…</div>
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 py-16 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              {filterStatus === 'pending' ? 'All caught up!' : 'No entries found'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filterStatus === 'pending'
                ? 'No pending time entries for your team in the selected period.'
                : 'No entries match the current filters.'}
            </p>
          </div>
        ) : groupByUser && groupedByUser ? (
          <div className="space-y-4">
            {Object.values(groupedByUser).map(({ user: entryUser, entries: userEntries }) => {
              const userHours = userEntries.reduce((s, e) => s + parseFloat(String(e.Hours || 0)), 0);
              const userPending = userEntries.filter(e => e.ApprovalStatus === 'pending');
              const allPendingSelected = userPending.length > 0 && userPending.every(e => selectedIds.has(e.Id));

              return (
                <div key={entryUser.UserId} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  {/* User Header */}
                  <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-sm font-bold text-blue-700 dark:text-blue-300">
                        {(entryUser.FirstName?.[0] || entryUser.Username[0]).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">{getUserDisplayName(entryUser)}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">@{entryUser.Username} · {userEntries.length} entries · {decimalHoursToHMS(userHours)} total</div>
                      </div>
                    </div>
                    {userPending.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">{userPending.length} pending</span>
                        <button
                          onClick={() => {
                            if (allPendingSelected) {
                              setSelectedIds(prev => { const s = new Set(prev); userPending.forEach(e => s.delete(e.Id)); return s; });
                            } else {
                              setSelectedIds(prev => { const s = new Set(prev); userPending.forEach(e => s.add(e.Id)); return s; });
                            }
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {allPendingSelected ? 'Deselect all' : 'Select all'}
                        </button>
                        <button
                          onClick={() => Promise.all(userPending.map(e => handleApproval(e.Id, 'approved')))}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          ✓ Approve All
                        </button>
                        <button
                          onClick={() => Promise.all(userPending.map(e => handleApproval(e.Id, 'rejected')))}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          ✗ Reject All
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Entries Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                          {filterStatus === 'pending' && (
                            <th className="px-4 py-2 w-8">
                              <input
                                type="checkbox"
                                checked={allPendingSelected}
                                onChange={() => {
                                  if (allPendingSelected) {
                                    setSelectedIds(prev => { const s = new Set(prev); userPending.forEach(e => s.delete(e.Id)); return s; });
                                  } else {
                                    setSelectedIds(prev => { const s = new Set(prev); userPending.forEach(e => s.add(e.Id)); return s; });
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 rounded"
                              />
                            </th>
                          )}
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Project</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Task</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Hours</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Description</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                          <th scope="col" className="relative px-4 py-2">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                        {userEntries.map(entry => (
                          <tr key={entry.Id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedIds.has(entry.Id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                            {filterStatus === 'pending' && (
                              <td className="px-4 py-3">
                                {entry.ApprovalStatus === 'pending' && (
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(entry.Id)}
                                    onChange={() => toggleSelect(entry.Id)}
                                    className="w-4 h-4 text-blue-600 rounded"
                                  />
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {new Date(normalizeDateString(entry.WorkDate) + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.ProjectName}</td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.TaskName}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">
                              {decimalHoursToHMS(parseFloat(String(entry.Hours)))}
                              {entry.StartTime && entry.EndTime && (
                                <div className="text-xs font-normal text-gray-500 dark:text-gray-400">{entry.StartTime}–{entry.EndTime}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                              {entry.AdminEditedDescription ? (
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-purple-700 dark:text-purple-400">Admin edited</div>
                                  <div className="truncate">{stripHtml(entry.AdminEditedDescription) || <span className="italic text-gray-400">—</span>}</div>
                                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Original</div>
                                  <div className="truncate text-gray-500 dark:text-gray-400">{stripHtml(entry.Description) || <span className="italic text-gray-400">—</span>}</div>
                                </div>
                              ) : (
                                stripHtml(entry.Description) || <span className="italic text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap"><ApprovalStatusBadge status={entry.ApprovalStatus} /></td>
                            <td className="px-4 py-3 whitespace-nowrap text-center">
                              {entry.ApprovalStatus === 'pending' ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleApproval(entry.Id, 'approved')}
                                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition-colors"
                                    title="Approve"
                                    aria-label="Approve"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => handleApproval(entry.Id, 'rejected')}
                                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded transition-colors"
                                    title="Reject"
                                    aria-label="Reject"
                                  >
                                    ✗
                                  </button>
                                  <button
                                    onClick={() => openAdminDescriptionModal(entry)}
                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded transition-colors"
                                    title="Edit description"
                                    aria-label="Edit description"
                                  >
                                    ✎
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleReopen(entry.Id)}
                                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded transition-colors"
                                    title="Reopen"
                                    aria-label="Reopen"
                                  >
                                    ↻
                                  </button>
                                  <button
                                    onClick={() => openAdminDescriptionModal(entry)}
                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded transition-colors"
                                    title="Edit description"
                                    aria-label="Edit description"
                                  >
                                    ✎
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Flat table view */
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {filterStatus === 'pending' && (
                      <th className="px-4 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === entries.filter(e => e.ApprovalStatus === 'pending').length && entries.filter(e => e.ApprovalStatus === 'pending').length > 0}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Project</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Task</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Hours</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                    <th scope="col" className="relative px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {entries.map(entry => (
                    <tr key={entry.Id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedIds.has(entry.Id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                      {filterStatus === 'pending' && (
                        <td className="px-4 py-3">
                          {entry.ApprovalStatus === 'pending' && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(entry.Id)}
                              onChange={() => toggleSelect(entry.Id)}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {new Date(normalizeDateString(entry.WorkDate) + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        <div className="font-medium">{getUserDisplayName(entry)}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">@{entry.Username}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.ProjectName}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.TaskName}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">
                        {decimalHoursToHMS(parseFloat(String(entry.Hours)))}
                        {entry.StartTime && entry.EndTime && (
                          <div className="text-xs font-normal text-gray-500 dark:text-gray-400">{entry.StartTime}–{entry.EndTime}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {entry.AdminEditedDescription ? (
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-purple-700 dark:text-purple-400">Admin edited</div>
                            <div className="truncate">{stripHtml(entry.AdminEditedDescription) || <span className="italic text-gray-400">—</span>}</div>
                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Original</div>
                            <div className="truncate text-gray-500 dark:text-gray-400">{stripHtml(entry.Description) || <span className="italic text-gray-400">—</span>}</div>
                          </div>
                        ) : (
                          stripHtml(entry.Description) || <span className="italic text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><ApprovalStatusBadge status={entry.ApprovalStatus} /></td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {entry.ApprovalStatus === 'pending' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleApproval(entry.Id, 'approved')}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition-colors"
                              title="Approve"
                              aria-label="Approve"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => handleApproval(entry.Id, 'rejected')}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded transition-colors"
                              title="Reject"
                              aria-label="Reject"
                            >
                              ✗
                            </button>
                            <button
                              onClick={() => openAdminDescriptionModal(entry)}
                              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded transition-colors"
                              title="Edit description"
                              aria-label="Edit description"
                            >
                              ✎
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleReopen(entry.Id)}
                              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded transition-colors"
                              title="Reopen"
                              aria-label="Reopen"
                            >
                              ↻
                            </button>
                            <button
                              onClick={() => openAdminDescriptionModal(entry)}
                              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded transition-colors"
                              title="Edit description"
                              aria-label="Edit description"
                            >
                              ✎
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showAdminDescriptionModal && selectedEntryForDescription && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Edit Admin Description</h3>
                <div className="mb-3 text-sm text-gray-600 dark:text-gray-400">
                  {getUserDisplayName(selectedEntryForDescription)} · {selectedEntryForDescription.ProjectName} · {selectedEntryForDescription.TaskName}
                </div>

                <RichTextEditor
                  content={adminDescriptionDraft}
                  onChange={(html) => setAdminDescriptionDraft(html)}
                  placeholder="Admin edited description..."
                />

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={closeAdminDescriptionModal}
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveAdminDescription}
                    disabled={isSavingDescription}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg transition-colors"
                  >
                    {isSavingDescription ? 'Saving...' : 'Save Description'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
          </>
        ) : (
          <>
            {vacationMessage && (
              <div className="mb-4 p-3 rounded border border-blue-300 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                {vacationMessage}
              </div>
            )}

            {/* Leave Stats Cards */}
            {!vacationIsLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">⏳ Pending</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{formatLeaveDays(pendingVisibleVacationCount)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">days awaiting approval</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-sm text-green-600 dark:text-green-400 font-medium">✓ Approved</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{formatLeaveDays(approvedVacationCount)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">days in current view</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-sm text-red-600 dark:text-red-400 font-medium">✕ Rejected</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{formatLeaveDays(rejectedVacationCount)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">days in current view</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">📅 Total Days</div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{formatLeaveDays(totalVacationDays)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">across {uniqueVacationUsers} member{uniqueVacationUsers !== 1 ? 's' : ''}</div>
                </div>
              </div>
            )}

            {vacationIsLoading ? (
              <div className="text-gray-600 dark:text-gray-300">Loading {leaveLabelPlural.toLowerCase()}…</div>
            ) : canApproveCurrentLeave ? (
              <>
                {/* Filters */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Year</label>
                      <input
                        type="number"
                        min="2000"
                        max="2100"
                        value={vacationYear}
                        onChange={(e) => setVacationYear(parseInt(e.target.value || String(new Date().getFullYear()), 10))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Team Member</label>
                      <select
                        value={selectedMemberId}
                        onChange={(e) => setSelectedMemberId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">All users</option>
                        {vacationMembers.map((member) => (
                          <option key={member.Id} value={member.Id}>
                            {(member.FirstName && member.LastName) ? `${member.FirstName} ${member.LastName}` : member.Username}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Status</label>
                      <select
                        value={vacationStatusFilter}
                        onChange={(e) => setVacationStatusFilter(e.target.value as 'all' | 'pending' | 'approved' | 'rejected')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={loadVacationData}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Apply Filters
                      </button>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={vacationGroupByUser}
                          onChange={(e) => setVacationGroupByUser(e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        Group by user
                      </label>
                      {selectedVacationMember && (
                        <div className="flex flex-wrap gap-2 text-xs">
                          {!isOutOfOfficeTab && (
                            <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                              Allowed: {selectedVacationMember.AnnualVacationDays ?? 0}
                            </span>
                          )}
                          <span className="px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                            Approved: {selectedVacationMember.ApprovedDays}
                          </span>
                          <span className="px-2 py-1 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                            Not Approved: {selectedMemberNotApproved}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Table — top action bar */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">Team {leaveLabel} Requests</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleApproveAllVisibleVacations}
                      disabled={pendingVisibleVacationRequestCount === 0 || vacationIsLoading}
                      className="h-9 px-4 inline-flex items-center rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white transition-colors"
                    >
                      Approve All ({pendingVisibleVacationRequestCount})
                    </button>
                    <button
                      onClick={() => {
                        setConfigDayPortion('full');
                        setShowVacationConfigModal(true);
                      }}
                      className="h-9 px-4 inline-flex items-center rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
                    >
                      Add {leaveLabel}
                    </button>
                  </div>
                </div>

                {sortedVacationRequests.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">No requests found for this filter.</div>
                ) : vacationGroupByUser && vacationGroupedByUser ? (
                  <div className="space-y-4">
                    {Object.values(vacationGroupedByUser).map(({ user: reqUser, requests: userRequests }) => {
                      const userPending = userRequests.filter(r => String(r.Status).toLowerCase() === 'pending');
                      const userName = (reqUser.FirstName && reqUser.LastName) ? `${reqUser.FirstName} ${reqUser.LastName}` : reqUser.Username;
                      return (
                        <div key={reqUser.UserId} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                          {/* User header */}
                          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-sm font-bold text-blue-700 dark:text-blue-300">
                                {(reqUser.FirstName?.[0] || reqUser.Username[0]).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-gray-900 dark:text-white">{userName}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">@{reqUser.Username} · {userRequests.length} day{userRequests.length !== 1 ? 's' : ''}</div>
                              </div>
                            </div>
                            {userPending.length > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">{userPending.length} pending</span>
                                <button
                                  onClick={() => Promise.all(userPending.map(r => handleVacationApproval(r.Id, 'approved')))}
                                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                                >
                                  ✓ Approve All
                                </button>
                                <button
                                  onClick={() => Promise.all(userPending.map(r => handleVacationApproval(r.Id, 'rejected')))}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                                >
                                  ✗ Reject All
                                </button>
                              </div>
                            )}
                          </div>
                          {/* User rows table */}
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleVacationSort('date')}>
                                    Date {vacationSortField === 'date' ? (vacationSortDirection === 'asc' ? '↑' : '↓') : ''}
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Portion</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleVacationSort('status')}>
                                    Status {vacationSortField === 'status' ? (vacationSortDirection === 'asc' ? '↑' : '↓') : ''}
                                  </th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Notes</th>
                                  <th scope="col" className="relative px-4 py-2"><span className="sr-only">Actions</span></th>
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {userRequests.map((request) => (
                                  <tr key={request.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                      <div>{String(request.VacationDate).split('T')[0]}</div>
                                      {request.HolidayConflict && (
                                        <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" title={(request.HolidayNames || []).join(', ')}>
                                          ⚠ Holiday conflict{(request.HolidayNames || []).length > 0 ? `: ${(request.HolidayNames || []).join(', ')}` : ''}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                      {normalizeDayPortion(request.DayPortion) === 'half' ? 'Half Day' : 'Full Day'}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {String(request.Status).toLowerCase() === 'approved' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">✓ Approved</span>}
                                      {String(request.Status).toLowerCase() === 'pending' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">⏳ Pending</span>}
                                      {String(request.Status).toLowerCase() === 'rejected' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">✕ Rejected</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{request.Notes || '—'}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center justify-end gap-1">
                                        {String(request.Status).toLowerCase() === 'pending' && (
                                          <>
                                            <button onClick={() => handleVacationApproval(request.Id, 'approved')} className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400" title="Approve" aria-label="Approve">
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            </button>
                                            <button onClick={() => handleVacationApproval(request.Id, 'rejected')} className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400" title="Reject" aria-label="Reject">
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                          </>
                                        )}
                                        <button onClick={() => setVacationDeleteTarget(request)} className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400" title="Delete request" aria-label="Delete request">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Flat table */
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-x-auto">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleVacationSort('user')}>
                              User {vacationSortField === 'user' ? (vacationSortDirection === 'asc' ? '↑' : '↓') : ''}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleVacationSort('date')}>
                              Date {vacationSortField === 'date' ? (vacationSortDirection === 'asc' ? '↑' : '↓') : ''}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Portion</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => handleVacationSort('status')}>
                              Status {vacationSortField === 'status' ? (vacationSortDirection === 'asc' ? '↑' : '↓') : ''}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Notes</th>
                            <th scope="col" className="relative px-4 py-3"><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {sortedVacationRequests.map((request) => (
                            <tr key={request.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                {(request.FirstName && request.LastName) ? `${request.FirstName} ${request.LastName}` : request.Username}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                                <div>{String(request.VacationDate).split('T')[0]}</div>
                                {request.HolidayConflict && (
                                  <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" title={(request.HolidayNames || []).join(', ')}>
                                    ⚠ Holiday conflict{(request.HolidayNames || []).length > 0 ? `: ${(request.HolidayNames || []).join(', ')}` : ''}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                {normalizeDayPortion(request.DayPortion) === 'half' ? 'Half Day' : 'Full Day'}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {String(request.Status).toLowerCase() === 'approved' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">✓ Approved</span>}
                                {String(request.Status).toLowerCase() === 'pending' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">⏳ Pending</span>}
                                {String(request.Status).toLowerCase() === 'rejected' && <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">✕ Rejected</span>}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{request.Notes || '—'}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  {String(request.Status).toLowerCase() === 'pending' && (
                                    <>
                                      <button onClick={() => handleVacationApproval(request.Id, 'approved')} className="p-1.5 text-gray-400 rounded transition-colors hover:text-blue-600 dark:hover:text-blue-400" title="Approve" aria-label="Approve">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                      </button>
                                      <button onClick={() => handleVacationApproval(request.Id, 'rejected')} className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400" title="Reject" aria-label="Reject">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                    </>
                                  )}
                                  <button onClick={() => setVacationDeleteTarget(request)} className="p-1.5 text-gray-400 rounded transition-colors hover:text-red-600 dark:hover:text-red-400" title="Delete request" aria-label="Delete request">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : null}

            {showVacationConfigModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-xl w-full mx-4">
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add / Configure {leaveLabel}</h3>
                      <button
                        onClick={() => setShowVacationConfigModal(false)}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        ✕
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Team Member</label>
                      <select
                        value={selectedMemberId}
                        onChange={(e) => {
                          const memberId = e.target.value;
                          setSelectedMemberId(memberId);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Select user</option>
                        {vacationMembers.map((member) => (
                          <option key={member.Id} value={member.Id}>
                            {(member.FirstName && member.LastName) ? `${member.FirstName} ${member.LastName}` : member.Username}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedVacationMember && (
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        Approved: {selectedVacationMember.ApprovedDays} · Pending: {selectedVacationMember.PendingDays}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={configStartDate}
                          onChange={(e) => setConfigStartDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                        <input
                          type="date"
                          value={configEndDate}
                          onChange={(e) => setConfigEndDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Day Portion</label>
                      <select
                        value={configDayPortion}
                        onChange={(e) => setConfigDayPortion(e.target.value as LeaveDayPortion)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="full">Full Day (default)</option>
                        <option value="half">Half Day</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                      <input
                        type="text"
                        value={configNotes}
                        onChange={(e) => setConfigNotes(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="Optional notes"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => setShowVacationConfigModal(false)}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                      >
                        Close
                      </button>
                      <button
                        onClick={configureVacationForUser}
                        disabled={!selectedMemberId || isSavingVacationConfig}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded"
                      >
                        Add {leaveLabel} Days
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {vacationDeleteTarget && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[110] p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete {leaveLabel} Day</h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
                      Are you sure you want to delete this {leaveLabel.toLowerCase()} day for{' '}
                      <span className="font-medium">{getUserDisplayName(vacationDeleteTarget)}</span>{' '}
                      on <span className="font-medium">{String(vacationDeleteTarget.VacationDate).split('T')[0]}</span>?
                    </p>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setVacationDeleteTarget(null)}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmVacationDelete}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <ScrollToTopButton />
    </div>
  );
}
