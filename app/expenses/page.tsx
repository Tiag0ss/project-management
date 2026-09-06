/* Migrated into AppShell — Navbar removed; chrome from AuthenticatedAppGate */
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useRouter } from 'next/navigation'
import { oldPath } from '@/lib/oldPath';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import PageLoadingSkeleton from '@/components/PageLoadingSkeleton';
import CollapsibleFilterPanel from '@/components/CollapsibleFilterPanel';
import ConfirmAlertModal from '@/components/ConfirmAlertModal';
import SearchableSelect from '@/components/SearchableSelect';
import { getApiUrl } from '@/lib/api/config';
import {
  Expense,
  ExpenseCategory,
  ExpenseCategoryGroup,
  ExpenseAttachmentMeta,
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  listExpenseCategories,
  listExpenseCategoryGroups,
  listExpenseAttachments,
  uploadExpenseAttachment,
  deleteExpenseAttachment,
  getExpenseAttachment,
} from '@/lib/api/expenses';

interface Organization {
  Id: number;
  Name: string;
}

interface Project {
  Id: number;
  ProjectName?: string;
  Name?: string;
  OrganizationId: number;
}

interface TaskOption {
  Id: number;
  Name: string;
  ProjectId: number;
}

const formatMoney = (value: number | string | null | undefined) => {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'approved':
    case 'reimbursed':
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    case 'rejected':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    case 'partial':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'not_required':
    case 'not_applicable':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    default:
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
  }
};

const formatReimbursementLabel = (expense: Expense) => {
  if (expense.ApprovalStatus === 'rejected' || expense.ReimbursementStatus === 'not_applicable') {
    return 'Not applicable';
  }
  return expense.ReimbursementStatus.replace('_', ' ');
};

export default function ExpensesPage() {
  const { user, token, isLoading: authLoading } = useAuth();
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const router = useRouter();

  const [expensesEnabled, setExpensesEnabled] = useState<boolean | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [groups, setGroups] = useState<ExpenseCategoryGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterOrg, setFilterOrg] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterInternalOnly, setFilterInternalOnly] = useState(false);
  const [filterGroup, setFilterGroup] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterApproval, setFilterApproval] = useState('');
  const [filterReimbursement, setFilterReimbursement] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    organizationId: 0,
    categoryId: 0,
    title: '',
    amount: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    projectId: '' as string | number,
    taskId: '' as string | number,
    description: '',
    vendor: '',
    paidBy: 'employee' as 'employee' | 'company',
  });
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<ExpenseAttachmentMeta[]>([]);

  const [dialog, setDialog] = useState<{
    type: 'confirm' | 'alert';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  const canCreate = !!permissions?.canCreateExpenses || !!user?.isAdmin;
  const canManage = !!permissions?.canManageExpenses || !!user?.isAdmin;
  const canView = !!permissions?.canViewExpenses || canCreate || !!user?.isAdmin;

  const canOpenExpenseEdit = (expense: Expense) => {
    const isOwner = expense.SubmittedByUserId === user?.id;
    const hasReimbursement = Number(expense.ReimbursedAmount || 0) > 0;
    if (hasReimbursement) return isOwner; // description + attachments only
    return canManage || isOwner;
  };

  const isLimitedEditMode =
    !!editing &&
    (Number(editing.ReimbursedAmount || 0) > 0 ||
      (editing.SubmittedByUserId === user?.id && !canManage && editing.ApprovalStatus !== 'pending'));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('projectId');
    if (projectId) setFilterProject(projectId);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push(oldPath('/login'));
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/system-settings/user-flags`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const enabled = data.expensesEnabled === true;
        setExpensesEnabled(enabled);
        if (!enabled) {
          router.replace('/dashboard');
        }
      } catch {
        setExpensesEnabled(false);
        router.replace('/dashboard');
      }
    })();
  }, [token, router]);

  const loadOrganizations = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/api/organizations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setOrganizations(data.organizations || data.data || []);
  }, [token]);

  const loadProjects = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${getApiUrl()}/api/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setProjects(data.projects || data.data || []);
  }, [token]);

  const loadExpenses = useCallback(async () => {
    if (!token || expensesEnabled !== true) return;
    setIsLoading(true);
    setError('');
    try {
      const rows = await listExpenses(token, {
        organizationId: filterOrg || undefined,
        projectId: filterProject || undefined,
        internalOnly: filterInternalOnly ? 'true' : undefined,
        categoryGroupId: filterGroup || undefined,
        categoryId: filterCategory || undefined,
        approvalStatus: filterApproval || undefined,
        reimbursementStatus: filterReimbursement || undefined,
        dateFrom: filterDateFrom || undefined,
        dateTo: filterDateTo || undefined,
      });
      setExpenses(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load expenses');
    } finally {
      setIsLoading(false);
    }
  }, [
    token,
    expensesEnabled,
    filterOrg,
    filterProject,
    filterInternalOnly,
    filterGroup,
    filterCategory,
    filterApproval,
    filterReimbursement,
    filterDateFrom,
    filterDateTo,
  ]);

  useEffect(() => {
    if (!token || expensesEnabled !== true || permissionsLoading) return;
    if (!canView) {
      router.replace('/dashboard');
      return;
    }
    loadOrganizations();
    loadProjects();
    loadExpenses();
  }, [token, expensesEnabled, permissionsLoading, canView, loadOrganizations, loadProjects, loadExpenses, router]);

  useEffect(() => {
    if (!token || !form.organizationId) {
      setCategories([]);
      setGroups([]);
      return;
    }
    (async () => {
      try {
        const [g, c] = await Promise.all([
          listExpenseCategoryGroups(token, form.organizationId),
          listExpenseCategories(token, form.organizationId),
        ]);
        setGroups(g);
        setCategories(c);
      } catch {
        setGroups([]);
        setCategories([]);
      }
    })();
  }, [token, form.organizationId]);

  useEffect(() => {
    if (!token || !filterOrg) {
      return;
    }
    (async () => {
      try {
        const [g, c] = await Promise.all([
          listExpenseCategoryGroups(token, Number(filterOrg)),
          listExpenseCategories(token, Number(filterOrg)),
        ]);
        setGroups(g);
        setCategories(c);
      } catch {
        /* ignore */
      }
    })();
  }, [token, filterOrg]);

  useEffect(() => {
    if (!token || !form.projectId) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/tasks/project/${form.projectId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setTasks([]);
          return;
        }
        const data = await res.json();
        const list = (data.tasks || data.data || []).map((t: any) => ({
          Id: t.Id,
          Name: t.TaskName || t.Name || `Task #${t.Id}`,
          ProjectId: t.ProjectId,
        }));
        if (!cancelled) setTasks(list);
      } catch {
        if (!cancelled) setTasks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, form.projectId]);

  const orgProjects = useMemo(
    () => projects.filter((p) => !form.organizationId || p.OrganizationId === form.organizationId),
    [projects, form.organizationId]
  );

  const organizationOptions = useMemo(
    () => organizations.map((o) => ({ value: o.Id, label: o.Name })),
    [organizations]
  );

  const selectedCategory = useMemo(
    () => categories.find((c) => c.Id === form.categoryId),
    [categories, form.categoryId]
  );

  const categoriesByGroup = useMemo(() => {
    const map = new Map<number, { group: ExpenseCategoryGroup | { Id: number; GroupName: string }; items: ExpenseCategory[] }>();
    for (const cat of categories) {
      const g =
        groups.find((x) => x.Id === cat.GroupId) ||
        ({ Id: cat.GroupId, GroupName: cat.GroupName || 'Other' } as ExpenseCategoryGroup);
      if (!map.has(cat.GroupId)) map.set(cat.GroupId, { group: g, items: [] });
      map.get(cat.GroupId)!.items.push(cat);
    }
    return Array.from(map.values());
  }, [categories, groups]);

  const projectOptions = useMemo(
    () =>
      orgProjects.map((p) => ({
        value: p.Id,
        label: p.ProjectName || p.Name || `Project #${p.Id}`,
      })),
    [orgProjects]
  );

  const taskOptions = useMemo(
    () => tasks.map((t) => ({ value: t.Id, label: t.Name })),
    [tasks]
  );

  const filterProjectOptions = useMemo(
    () =>
      projects
        .filter((p) => !filterOrg || p.OrganizationId === Number(filterOrg))
        .map((p) => ({
          value: p.Id,
          label: p.ProjectName || p.Name || `Project #${p.Id}`,
        })),
    [projects, filterOrg]
  );

  const filterGroupOptions = useMemo(
    () => groups.map((g) => ({ value: g.Id, label: g.GroupName })),
    [groups]
  );

  const filterCategoryOptions = useMemo(
    () =>
      categories
        .filter((c) => !filterGroup || c.GroupId === Number(filterGroup))
        .map((c) => ({
          value: c.Id,
          label: c.GroupName ? `${c.GroupName} / ${c.CategoryName}` : c.CategoryName,
        })),
    [categories, filterGroup]
  );

  const totalsByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const key = e.CategoryGroupName || 'Ungrouped';
      map.set(key, (map.get(key) || 0) + Number(e.Amount || 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const openCreate = () => {
    const defaultOrg = organizations[0]?.Id || 0;
    setEditing(null);
    setPendingFiles([]);
    setAttachments([]);
    setForm({
      organizationId: defaultOrg,
      categoryId: 0,
      title: '',
      amount: '',
      expenseDate: new Date().toISOString().slice(0, 10),
      projectId: '',
      taskId: '',
      description: '',
      vendor: '',
      paidBy: 'employee',
    });
    setShowModal(true);
  };

  const openEdit = async (expense: Expense) => {
    setEditing(expense);
    setPendingFiles([]);
    setForm({
      organizationId: expense.OrganizationId,
      categoryId: expense.CategoryId,
      title: expense.Title,
      amount: String(expense.Amount),
      expenseDate: String(expense.ExpenseDate).slice(0, 10),
      projectId: expense.ProjectId || '',
      taskId: expense.TaskId || '',
      description: expense.Description || '',
      vendor: expense.Vendor || '',
      paidBy: expense.PaidBy || 'employee',
    });
    setShowModal(true);
    if (token) {
      try {
        setAttachments(await listExpenseAttachments(token, expense.Id));
      } catch {
        setAttachments([]);
      }
    }
  };

  const handleSave = async () => {
    if (!token) return;
    if (isLimitedEditMode && editing) {
      setIsSaving(true);
      try {
        await updateExpense(token, editing.Id, { description: form.description || null });
        for (const file of pendingFiles) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = String(reader.result || '');
              resolve(result.includes(',') ? result.split(',')[1] : result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          await uploadExpenseAttachment(token, editing.Id, file.name, file.type, file.size, base64);
        }
        setShowModal(false);
        await loadExpenses();
      } catch (err: any) {
        setDialog({ type: 'alert', title: 'Error', message: err.message || 'Failed to save expense' });
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (!form.organizationId || !form.categoryId || !form.title.trim() || !form.amount) {
      setDialog({ type: 'alert', title: 'Validation', message: 'Organization, category, title and amount are required.' });
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        organizationId: form.organizationId,
        categoryId: Number(form.categoryId),
        title: form.title.trim(),
        amount: Number(form.amount),
        expenseDate: form.expenseDate,
        projectId: form.projectId ? Number(form.projectId) : null,
        taskId: form.taskId ? Number(form.taskId) : null,
        description: form.description || null,
        vendor: form.vendor || null,
        paidBy: form.paidBy,
      };
      let saved: Expense;
      if (editing) {
        saved = await updateExpense(token, editing.Id, payload);
      } else {
        saved = await createExpense(token, payload);
      }

      for (const file of pendingFiles) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result || '');
            resolve(result.includes(',') ? result.split(',')[1] : result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await uploadExpenseAttachment(token, saved.Id, file.name, file.type, file.size, base64);
      }

      setShowModal(false);
      await loadExpenses();
    } catch (err: any) {
      setDialog({ type: 'alert', title: 'Error', message: err.message || 'Failed to save expense' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (expense: Expense) => {
    setDialog({
      type: 'confirm',
      title: 'Delete expense',
      message: `Delete "${expense.Title}"? This cannot be undone.`,
      onConfirm: async () => {
        if (!token) return;
        try {
          await deleteExpense(token, expense.Id);
          await loadExpenses();
        } catch (err: any) {
          setDialog({ type: 'alert', title: 'Error', message: err.message || 'Failed to delete' });
        }
      },
    });
  };

  const previewAttachment = async (att: ExpenseAttachmentMeta) => {
    if (!token) return;
    try {
      const full = await getExpenseAttachment(token, att.Id);
      const dataUrl = `data:${full.FileType};base64,${full.FileData}`;
      if (full.FileType.startsWith('image/')) {
        window.open(dataUrl, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = full.FileName;
        a.click();
      }
    } catch (err: any) {
      setDialog({ type: 'alert', title: 'Error', message: err.message || 'Failed to open attachment' });
    }
  };

  if (authLoading || expensesEnabled === null || permissionsLoading) {
    return <PageLoadingSkeleton />;
  }

  return (
    <div className="w-full">
      <div className="w-full p-4 sm:p-6 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight text-gray-900 dark:text-white">Expenses</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Track project and internal expenses with invoices and reimbursements.
            </p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className="h-10 shrink-0 px-4 rounded-lg text-sm font-medium inline-flex items-center bg-blue-600 text-white hover:bg-blue-700"
            >
              New Expense
            </button>
          )}
        </div>

        <CollapsibleFilterPanel
          className="mb-2"
          title="Expense filters"
          activeCount={[
            filterDateFrom ? 1 : 0,
            filterDateTo ? 1 : 0,
            filterOrg ? 1 : 0,
            filterProject ? 1 : 0,
            filterGroup ? 1 : 0,
            filterCategory ? 1 : 0,
            filterApproval ? 1 : 0,
            filterInternalOnly ? 1 : 0,
            filterReimbursement ? 1 : 0,
          ].reduce((a, b) => a + b, 0)}
          bodyClassName="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <label className="block text-sm lg:col-span-1">
            <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">From</span>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm px-3 py-2"
            />
          </label>
          <label className="block text-sm lg:col-span-1">
            <span className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">To</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm px-3 py-2"
            />
          </label>
          <SearchableSelect
            value={filterOrg}
            onChange={(value) => {
              setFilterOrg(value);
              setFilterGroup('');
              setFilterCategory('');
              setFilterProject('');
            }}
            options={organizationOptions}
            placeholder="All organizations"
            emptyText="All organizations"
            className="text-sm"
          />
          <SearchableSelect
            value={filterProject}
            onChange={setFilterProject}
            options={filterProjectOptions}
            placeholder="All projects"
            emptyText="All projects"
            className="text-sm"
          />
          <SearchableSelect
            value={filterGroup}
            onChange={(value) => {
              setFilterGroup(value);
              setFilterCategory('');
            }}
            options={filterGroupOptions}
            placeholder="All groups"
            emptyText="All groups"
            className="text-sm"
          />
          <SearchableSelect
            value={filterCategory}
            onChange={setFilterCategory}
            options={filterCategoryOptions}
            placeholder="All categories"
            emptyText="All categories"
            className="text-sm"
          />
          <select
            value={filterApproval}
            onChange={(e) => setFilterApproval(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm px-3 py-2"
          >
            <option value="">All approval</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={filterInternalOnly}
              onChange={(e) => setFilterInternalOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            Internal only
          </label>
          <select
            value={filterReimbursement}
            onChange={(e) => setFilterReimbursement(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm px-3 py-2 md:col-span-2"
          >
            <option value="">All reimbursement</option>
            <option value="needs_reimbursement">Needs reimbursement</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="reimbursed">Reimbursed</option>
            <option value="not_required">Not required</option>
          </select>
          </div>
        </CollapsibleFilterPanel>

        {totalsByGroup.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {totalsByGroup.map(([name, total]) => (
              <span
                key={name}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              >
                {name}: {formatMoney(total)}
              </span>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading expenses...</div>
          ) : expenses.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">No expenses found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Scope</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Reimbursed</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {expenses.map((e) => {
                    const remaining = Number(e.RemainingAmount ?? Number(e.Amount) - Number(e.ReimbursedAmount || 0));
                    return (
                      <tr key={e.Id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                          {String(e.ExpenseDate).slice(0, 10)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                          <div className="font-medium">{e.Title}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {e.SubmittedByFirstName || e.SubmittedByUsername}
                            {e.AttachmentCount ? ` · ${e.AttachmentCount} file(s)` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          <div>{e.CategoryGroupName}</div>
                          <div className="text-xs text-gray-500">{e.CategoryName}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                          {e.ProjectName || <span className="italic text-gray-500">Internal</span>}
                          {e.TaskName ? <div className="text-xs text-gray-500">{e.TaskName}</div> : null}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white font-medium">
                          {formatMoney(e.Amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                          {formatMoney(e.ReimbursedAmount)}
                          {e.PaidBy === 'employee' && e.ApprovalStatus !== 'rejected' && remaining > 0.001 && (
                            <div className="text-xs text-amber-600 dark:text-amber-400">left {formatMoney(remaining)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex w-fit px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(e.ApprovalStatus)}`}>
                              {e.ApprovalStatus}
                            </span>
                            <span className={`inline-flex w-fit px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(e.ApprovalStatus === 'rejected' || e.ReimbursementStatus === 'not_applicable' ? 'not_applicable' : e.ReimbursementStatus)}`}>
                              {formatReimbursementLabel(e)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {canOpenExpenseEdit(e) && (
                              <button
                                type="button"
                                title={Number(e.ReimbursedAmount || 0) > 0 ? 'Update description / attachments' : 'Edit'}
                                aria-label={Number(e.ReimbursedAmount || 0) > 0 ? 'Update description / attachments' : 'Edit'}
                                onClick={() => openEdit(e)}
                                className="p-1.5 text-gray-400 rounded hover:text-blue-600 dark:hover:text-blue-400"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                            )}
                            {(canManage || e.SubmittedByUserId === user?.id) && e.ApprovalStatus === 'pending' && (
                              <button
                                type="button"
                                title="Delete"
                                aria-label="Delete"
                                onClick={() => handleDelete(e)}
                                className="p-1.5 text-gray-400 rounded hover:text-red-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing
                  ? isLimitedEditMode
                    ? 'Update description & attachments'
                    : 'Edit Expense'
                  : 'New Expense'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {isLimitedEditMode && (
                <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                  After reimbursement starts, you can only change the description and add attachments. Admins can correct other fields from Approvals.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block text-sm">
                  <span className="text-gray-700 dark:text-gray-300 mb-1 block">Organization</span>
                  <SearchableSelect
                    value={form.organizationId || ''}
                    onChange={(value) =>
                      setForm((f) => ({
                        ...f,
                        organizationId: value ? Number(value) : 0,
                        categoryId: 0,
                        projectId: '',
                        taskId: '',
                      }))
                    }
                    options={organizationOptions}
                    placeholder="Select organization"
                    emptyText="Select organization..."
                    disabled={!!editing}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700 dark:text-gray-300 mb-1 block">Category</span>
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm((f) => ({ ...f, categoryId: Number(e.target.value) }))}
                    disabled={!form.organizationId || isLimitedEditMode}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 disabled:opacity-50"
                  >
                    <option value={0}>Select...</option>
                    {categoriesByGroup.map(({ group, items }) => (
                      <optgroup key={group.Id} label={group.GroupName}>
                        {items.map((c) => (
                          <option key={c.Id} value={c.Id}>
                            {c.CategoryName}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {selectedCategory?.MaxReimbursementAmount !== null &&
                    selectedCategory?.MaxReimbursementAmount !== undefined && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        Category reimbursement cap: {formatMoney(selectedCategory.MaxReimbursementAmount)}
                      </p>
                    )}
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="text-gray-700 dark:text-gray-300">Title</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    disabled={isLimitedEditMode}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 disabled:opacity-50"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700 dark:text-gray-300">Amount</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    disabled={isLimitedEditMode}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 disabled:opacity-50"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700 dark:text-gray-300">Date</span>
                  <input
                    type="date"
                    value={form.expenseDate}
                    onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
                    disabled={isLimitedEditMode}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 disabled:opacity-50"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700 dark:text-gray-300">Paid by</span>
                  <select
                    value={form.paidBy}
                    onChange={(e) => setForm((f) => ({ ...f, paidBy: e.target.value as 'employee' | 'company' }))}
                    disabled={isLimitedEditMode}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 disabled:opacity-50"
                  >
                    <option value="employee">Employee (reimbursable)</option>
                    <option value="company">Company</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700 dark:text-gray-300">Vendor</span>
                  <input
                    value={form.vendor}
                    onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                    disabled={isLimitedEditMode}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 disabled:opacity-50"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700 dark:text-gray-300 mb-1 block">Project (optional)</span>
                  <SearchableSelect
                    value={form.projectId || ''}
                    onChange={(value) =>
                      setForm((f) => ({
                        ...f,
                        projectId: value || '',
                        taskId: '',
                      }))
                    }
                    options={projectOptions}
                    placeholder="Internal / no project"
                    emptyText="Internal / no project"
                    disabled={!form.organizationId || isLimitedEditMode}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700 dark:text-gray-300 mb-1 block">Task (optional)</span>
                  <SearchableSelect
                    value={form.taskId || ''}
                    onChange={(value) => setForm((f) => ({ ...f, taskId: value || '' }))}
                    options={taskOptions}
                    placeholder="No task"
                    emptyText="No task"
                    disabled={!form.projectId || isLimitedEditMode}
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="text-gray-700 dark:text-gray-300">Description</span>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2"
                  />
                </label>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Invoice attachments (images / PDF)</div>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setPendingFiles((prev) => [...prev, ...files]);
                    e.target.value = '';
                  }}
                  className="block w-full text-sm text-gray-500 dark:text-gray-400"
                />
                {pendingFiles.length > 0 && (
                  <ul className="mt-2 text-sm text-gray-600 dark:text-gray-300 space-y-1">
                    {pendingFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex justify-between gap-2">
                        <span>{f.name}</span>
                        <button type="button" className="text-red-500" onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
                {attachments.length > 0 && (
                  <ul className="mt-2 text-sm text-gray-600 dark:text-gray-300 space-y-1">
                    {attachments.map((a) => (
                      <li key={a.Id} className="flex justify-between gap-2">
                        <button type="button" className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => previewAttachment(a)}>
                          {a.FileName}
                        </button>
                        <button
                          type="button"
                          className="text-red-500"
                          onClick={async () => {
                            if (!token) return;
                            await deleteExpenseAttachment(token, a.Id);
                            setAttachments((prev) => prev.filter((x) => x.Id !== a.Id));
                          }}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="h-10 px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">
                Cancel
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSave}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
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
